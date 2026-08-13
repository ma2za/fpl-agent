import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildConcentrationAnalysis,
  renderScenarioComparisonMarkdown,
  type ClubScenarioSet,
  type ConcentrationPlayer,
  type CounterfactualSet,
  type SharedAssumptionGraph
} from "../packages/engine/src";
import {
  ClubScenarioSetSchema,
  ConcentrationRiskReportSchema,
  CounterfactualSetSchema,
  ScenarioComparisonSchema,
  SharedAssumptionGraphSchema,
  readArtifactFile
} from "../packages/agent/src";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const graphPath = argValue("--graph");
  const scenarioPath = argValue("--scenarios");
  const counterfactualPath = argValue("--counterfactuals");
  const playersPath = argValue("--players");
  const outputDir = argValue("--out");
  if (!graphPath || !scenarioPath || !counterfactualPath || !playersPath || !outputDir) {
    throw new Error("Usage: pnpm concentration -- --graph <shared-assumption-graph.json> --scenarios <club-scenario-sets.json> --counterfactuals <counterfactual-set.json> --players <concentration-players.json> --out <dir> [--penalty <weight>]");
  }
  const [graph, scenarioData, counterfactuals, playerData] = await Promise.all([
    readArtifactFile(graphPath, SharedAssumptionGraphSchema) as Promise<SharedAssumptionGraph>,
    readFile(scenarioPath, "utf8").then((value) => JSON.parse(value) as unknown),
    readArtifactFile(counterfactualPath, CounterfactualSetSchema) as Promise<CounterfactualSet>,
    readFile(playersPath, "utf8").then((value) => JSON.parse(value) as unknown)
  ]);
  if (!Array.isArray(scenarioData)) throw new Error("Club scenario sets must be a JSON array.");
  if (!Array.isArray(playerData)) throw new Error("Concentration players must be a JSON array.");
  const scenarioSets = scenarioData.map((value) => ClubScenarioSetSchema.parse(value)) as ClubScenarioSet[];
  const players = playerData.map((value, index) => {
    if (!value || typeof value !== "object") throw new Error(`Invalid concentration player at index ${index}.`);
    const player = value as Record<string, unknown>;
    if (typeof player.playerId !== "number" || typeof player.teamId !== "number" || typeof player.baselineUtility !== "number") {
      throw new Error(`Concentration player ${index} requires numeric playerId, teamId, and baselineUtility.`);
    }
    return player as ConcentrationPlayer;
  });
  const penalty = Number(argValue("--penalty") ?? "0");
  if (!Number.isFinite(penalty) || penalty < 0) throw new Error("Concentration penalty must be a nonnegative number.");
  const candidates = counterfactuals.candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    playerIds: candidate.playerIds,
    independentP10: candidate.metrics.downside
  }));
  const result = buildConcentrationAnalysis({
    generatedAt: graph.generatedAt,
    graph,
    scenarioSets,
    players,
    candidates,
    concentrationPenaltyWeight: penalty
  });
  const report = ConcentrationRiskReportSchema.parse(result.report);
  const comparison = ScenarioComparisonSchema.parse(result.comparison);
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeJson(path.join(outputDir, "shared-assumption-graph.json"), graph),
    writeJson(path.join(outputDir, "club-scenario-sets.json"), scenarioSets),
    writeJson(path.join(outputDir, "concentration-risk-report.json"), report),
    writeJson(path.join(outputDir, "scenario-comparison.json"), comparison),
    writeFile(path.join(outputDir, "scenario-comparison.md"), renderScenarioComparisonMarkdown(comparison), "utf8")
  ]);
  console.log(`Wrote correlated concentration evidence to ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
