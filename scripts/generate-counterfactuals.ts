import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildCounterfactualSetMilp,
  compareCounterfactuals,
  renderCounterfactualComparisonMarkdown,
  type OptimizationHorizon,
  type OptimizationPlayer,
  type OptimizationRequest,
  type PlayerForEngine,
  type ProbabilisticProjection
} from "../packages/engine/src";
import {
  CounterfactualComparisonSchema,
  CounterfactualSetSchema,
  FixtureHorizonReportSchema,
  OptimizationRequestSchema,
  ProbabilisticProjectionArraySchema,
  readArtifactFile,
  type FixtureHorizonReport
} from "../packages/agent/src";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function readJson<T>(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fixtureFactor(report: FixtureHorizonReport, player: PlayerForEngine, horizon: OptimizationHorizon) {
  const team = report.teams.find((item) => item.teamId === player.teamId);
  const period = team?.horizons.find((item) => item.gameweeks === horizon);
  const difficulty = player.position === "GKP" || player.position === "DEF"
    ? period?.defence.averageDifficulty
    : period?.attack.averageDifficulty;
  return difficulty == null ? 1 : Math.max(0.75, Math.min(1.25, 1 + (3 - difficulty) * 0.08));
}

function optimizationPlayers(
  players: PlayerForEngine[],
  projections: ProbabilisticProjection[],
  fixtures: FixtureHorizonReport
) {
  const playerById = new Map(players.map((player) => [player.id, player]));
  return projections.flatMap((projection) => {
    const player = playerById.get(projection.playerId);
    if (!player) return [];
    const horizons = Object.fromEntries(([1, 3, 6] as const).map((horizon) => {
      const multiplier = fixtureFactor(fixtures, player, horizon) * horizon;
      return [horizon, {
        rawProjection: projection.rawProjectionIfStarting * multiplier,
        roleAdjustedProjection: projection.roleAdjustedProjection * multiplier,
        downside: projection.p10 * multiplier,
        benchValue: projection.roleAdjustedProjection * multiplier * 0.1,
        roleConfidence: projection.appearance.overallEvidenceConfidence
      }];
    })) as OptimizationPlayer["horizons"];
    return [{
      ...player,
      appearanceProbability: projection.appearance.appearanceProbability,
      horizons
    } as OptimizationPlayer];
  });
}

async function main() {
  const requestPath = argValue("--request");
  if (!requestPath) throw new Error("Usage: pnpm counterfactuals -- --request <optimization-request.json> [--out <dir>]");
  const request = await readArtifactFile(requestPath, OptimizationRequestSchema) as OptimizationRequest;
  const directory = path.join("packages", "content", "recommendations", `gw-${request.gameweek}`);
  const [players, projections, fixtures] = await Promise.all([
    readJson<PlayerForEngine[]>(path.join("data", "processed", "players.json")),
    readArtifactFile(path.join(directory, "probabilistic-projections.json"), ProbabilisticProjectionArraySchema) as Promise<ProbabilisticProjection[]>,
    readArtifactFile(path.join(directory, "fixture-horizon-report.json"), FixtureHorizonReportSchema)
  ]);
  const set = CounterfactualSetSchema.parse(await buildCounterfactualSetMilp(
    request,
    optimizationPlayers(players, projections, fixtures)
  ));
  const comparison = CounterfactualComparisonSchema.parse(compareCounterfactuals(request.generatedAt, set.candidates));
  const outputDir = argValue("--out") ?? path.join(directory, "counterfactuals", request.requestId);
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeJson(path.join(outputDir, "optimization-request.json"), request),
    writeJson(path.join(outputDir, "counterfactual-set.json"), set),
    writeJson(path.join(outputDir, "counterfactual-comparison.json"), comparison),
    writeFile(path.join(outputDir, "counterfactual-comparison.md"), renderCounterfactualComparisonMarkdown(comparison), "utf8")
  ]);
  console.log(`Wrote independently optimized counterfactual evidence to ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
