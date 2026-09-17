import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildCounterfactualSetMilp,
  buildEligibilityReport,
  candidateEligibilityErrors,
  compareCounterfactuals,
  applyProjectionScenarioAdjustment,
  renderCounterfactualComparisonMarkdown,
  type OptimizationHorizon,
  type OptimizationPlayer,
  type OptimizationRequest,
  type EligibilityReport,
  type PlayerForEngine,
  type ProbabilisticProjection
} from "../packages/engine/src";
import {
  CounterfactualComparisonSchema,
  CounterfactualSetSchema,
  FixtureHorizonReportSchema,
  EligibilityReportSchema,
  OptimizationRequestSchema,
  ProjectionUncertaintyReportSchema,
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

export function optimizationPlayers(
  players: PlayerForEngine[],
  projections: ProbabilisticProjection[],
  fixtures: FixtureHorizonReport,
  request: OptimizationRequest,
  eligibilityReport?: EligibilityReport
) {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const eligibilityByPlayer = new Map((eligibilityReport?.players ?? []).map((item) => [item.playerId, item]));
  return projections.flatMap((projection) => {
    const player = playerById.get(projection.playerId);
    if (!player || player.status === "u") return [];
    const scenarioAdjustment = request.projectionScenarioAdjustments?.find((item) => item.playerId === projection.playerId);
    const adjusted = scenarioAdjustment ? applyProjectionScenarioAdjustment(scenarioAdjustment) : null;
    const horizons = Object.fromEntries(([1, 3, 6] as const).map((horizon) => {
      const multiplier = fixtureFactor(fixtures, player, horizon) * horizon;
      return [horizon, {
        rawProjection: projection.rawProjectionIfStarting * multiplier,
        roleAdjustedProjection: (adjusted?.mean ?? projection.roleAdjustedProjection) * multiplier,
        downside: (adjusted ? adjusted.mean - 1.28155 * adjusted.standardDeviation : projection.p10) * multiplier,
        benchValue: (adjusted?.mean ?? projection.roleAdjustedProjection) * multiplier * 0.1,
        roleConfidence: projection.appearance.overallEvidenceConfidence
      }];
    })) as OptimizationPlayer["horizons"];
    const eligibility = eligibilityByPlayer.get(player.id);
    if (eligibilityReport && !eligibility?.roles.emergency.eligible) return [];
    return [{
      ...player,
      startProbability: projection.appearance.startProbability,
      appearanceProbability: projection.appearance.appearanceProbability,
      horizons,
      ...(eligibility ? { eligibility, eligibilitySnapshotId: eligibilityReport!.snapshotId } : {})
    } as OptimizationPlayer];
  });
}

async function main() {
  const requestPath = argValue("--request");
  if (!requestPath) throw new Error("Usage: pnpm counterfactuals -- --request <optimization-request.json> [--out <dir>]");
  const request = await readArtifactFile(requestPath, OptimizationRequestSchema) as OptimizationRequest;
  const directory = path.join("packages", "content", "recommendations", `gw-${request.gameweek}`);
  const [players, projectionReport, fixtures, bootstrap] = await Promise.all([
    readJson<PlayerForEngine[]>(path.join("data", "processed", "players.json")),
    readArtifactFile(path.join(directory, "projection-uncertainty-report.json"), ProjectionUncertaintyReportSchema),
    readArtifactFile(path.join(directory, "fixture-horizon-report.json"), FixtureHorizonReportSchema),
    readJson<{ elements: Array<{
      id: number;
      can_select?: boolean;
      can_transact?: boolean;
    }> }>(path.join("data", "raw", "bootstrap-static.json"))
  ]);
  const officialByPlayer = new Map(bootstrap.elements.map((player) => [player.id, player]));
  const projectionByPlayer = new Map(projectionReport.items.map((projection) => [projection.playerId, projection]));
  const fixtureCountByTeam = new Map(fixtures.teams.map((team) => [
    team.teamId,
    team.horizons.find((horizon) => horizon.gameweeks === 1)?.fixtureCount ?? 0
  ]));
  const eligibilityReport = EligibilityReportSchema.parse(buildEligibilityReport({
    generatedAt: request.generatedAt,
    gameweek: request.gameweek,
    managerConstraints: request.managerConstraints,
    players: players.flatMap((player) => {
      const projection = projectionByPlayer.get(player.id);
      if (!projection) return [];
      const official = officialByPlayer.get(player.id);
      return [{
        playerId: player.id,
        teamId: player.teamId,
        status: player.status,
        chanceOfPlayingNextRound: player.chanceOfPlayingNextRound ?? null,
        canSelect: official?.can_select ?? false,
        canTransact: official?.can_transact ?? false,
        fixtureCount: fixtureCountByTeam.get(player.teamId) ?? 0,
        startProbability: projection.appearance.startProbability,
        appearanceProbability: projection.appearance.appearanceProbability,
        roleState: projection.appearance.roleState ?? null,
        roleConflict: projection.appearance.evidenceCoverage?.sourceConflict ?? false,
        evidenceObservedAt: projectionReport.generatedAt,
        evidenceIds: [
          ...(projection.appearance.evidenceCoverage?.traceableEvidenceIds ?? []),
          `projection:${player.id}`,
          `fixture:team:${player.teamId}`,
          `official-fpl:${player.id}`
        ]
      }];
    })
  }));
  const outputDir = argValue("--out") ?? path.join(directory, "counterfactuals", request.requestId);
  await mkdir(outputDir, { recursive: true });
  await writeJson(path.join(outputDir, "eligibility-report.json"), eligibilityReport);
  const set = CounterfactualSetSchema.parse(await buildCounterfactualSetMilp(
    request,
    optimizationPlayers(players, projectionReport.items, fixtures, request, eligibilityReport)
  ));
  if (set.eligibilitySnapshotId !== eligibilityReport.snapshotId) {
    throw new Error(`Counterfactual set is not bound to eligibility snapshot ${eligibilityReport.snapshotId}.`);
  }
  for (const candidate of set.candidates) {
    const errors = candidateEligibilityErrors({
      playerIds: candidate.playerIds,
      startingXI: candidate.startingXI,
      benchOrder: candidate.benchOrder,
      report: eligibilityReport
    });
    if (errors.length > 0) throw new Error(`Candidate ${candidate.candidateId} failed eligibility: ${errors.join("; ")}`);
    if (candidate.eligibilitySnapshotId !== eligibilityReport.snapshotId) {
      throw new Error(`Candidate ${candidate.candidateId} is not bound to eligibility snapshot ${eligibilityReport.snapshotId}.`);
    }
  }
  const comparison = CounterfactualComparisonSchema.parse(compareCounterfactuals(request.generatedAt, set.candidates));
  await Promise.all([
    writeJson(path.join(outputDir, "optimization-request.json"), request),
    writeJson(path.join(outputDir, "counterfactual-set.json"), set),
    writeJson(path.join(outputDir, "counterfactual-comparison.json"), comparison),
    writeFile(path.join(outputDir, "counterfactual-comparison.md"), renderCounterfactualComparisonMarkdown(comparison), "utf8")
  ]);
  console.log(`Wrote independently optimized counterfactual evidence to ${outputDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
