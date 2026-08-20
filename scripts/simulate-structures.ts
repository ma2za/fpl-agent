import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeDecisionMargins, applyProjectionAdjustments, applyProjectionScenarioAdjustment, simulateStructures } from "../packages/engine/src";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main() {
  const inputPath = argValue("--input");
  const outputPath = argValue("--out");
  const marginsOutputPath = argValue("--margins-out");
  if (!inputPath || !outputPath) throw new Error("Usage: pnpm simulate:structures -- --input <request.json> --out <report.json>");
  const request = JSON.parse(await readFile(inputPath, "utf8"));
  if ((request.sensitivityPlayerIds?.length ?? 0) > 0 && !marginsOutputPath) {
    throw new Error("Requests with sensitivityPlayerIds require --margins-out <report.json>.");
  }
  if ((request.sensitivityPlayerIds?.length ?? 0) > 0 && request.mode !== "MAX_EXPECTED_POINTS") {
    throw new Error("Player-mean decision margins currently require MAX_EXPECTED_POINTS mode.");
  }
  let playerDistributions = request.playerDistributions;
  if (!playerDistributions && request.projectionPath && request.playerPath) {
    const [projections, players] = await Promise.all([
      readFile(request.projectionPath, "utf8").then(JSON.parse),
      readFile(request.playerPath, "utf8").then(JSON.parse)
    ]);
    const playerById = new Map<number, { position: string; teamId: number; price: number }>(players.map((player: { id: number; position: string; teamId: number; price: number }) => [player.id, player]));
    playerDistributions = projections.map((projection: {
      playerId: number;
      roleAdjustedProjection: number;
      projectionStandardDeviation: number;
      appearance: { appearanceProbability: number };
      featureInputs?: Array<{ featureId: string }>;
    }) => {
      const adjustment = request.projectionAdjustments?.find((item: { playerId: number }) => item.playerId === projection.playerId);
      const scenarioAdjustment = request.projectionScenarioAdjustments?.find((item: { playerId: number }) => item.playerId === projection.playerId);
      const adjusted = adjustment ? applyProjectionAdjustments({
        baseProjection: projection.roleAdjustedProjection,
        baseStandardDeviation: projection.projectionStandardDeviation,
        baselineFeatureIds: projection.featureInputs?.map((feature) => feature.featureId) ?? [],
        adjustments: adjustment.features
      }) : null;
      const scenarioAdjusted = scenarioAdjustment ? applyProjectionScenarioAdjustment({
        featureId: scenarioAdjustment.featureId,
        probabilityMethod: scenarioAdjustment.probabilityMethod,
        scenarios: scenarioAdjustment.scenarios
      }) : null;
      const player = playerById.get(projection.playerId);
      const fixture = request.fixtureDistributions?.find((item: { homeTeamId: number; awayTeamId: number }) =>
        item.homeTeamId === player?.teamId || item.awayTeamId === player?.teamId);
      return {
        playerId: projection.playerId,
        mean: scenarioAdjusted?.mean ?? adjusted?.adjustedProjection ?? projection.roleAdjustedProjection,
        standardDeviation: scenarioAdjusted?.standardDeviation ?? adjusted?.adjustedStandardDeviation ?? projection.projectionStandardDeviation,
        appearanceProbability: projection.appearance.appearanceProbability,
        position: player?.position,
        teamId: player?.teamId,
        price: player?.price,
        fixtureId: fixture?.fixtureId,
        opponentTeamId: fixture ? (fixture.homeTeamId === player?.teamId ? fixture.awayTeamId : fixture.homeTeamId) : undefined
      };
    });
  }
  let candidates = request.candidates;
  let searchScope = request.searchScope;
  if (request.counterfactualSetPath) {
    const set = JSON.parse(await readFile(request.counterfactualSetPath, "utf8"));
    const horizon = request.horizon ?? 1;
    const maximumCandidates = request.maximumCandidates ?? 100;
    const unique = new Map<string, any>();
    for (const candidate of set.candidates.filter((item: any) => item.horizon === horizon)) {
      const key = candidate.playerIds.join(",");
      if (!unique.has(key)) unique.set(key, candidate);
    }
    const frontier = [...unique.values()].sort((a, b) => b.metrics.objective - a.metrics.objective || a.candidateId.localeCompare(b.candidateId)).slice(0, maximumCandidates);
    const proofs = set.proofs.filter((proof: any) => proof.horizon === horizon);
    const branchProofs = proofs.filter((proof: any) => proof.algorithm === "deterministic-branch-and-bound");
    const legalSquadsEvaluatedDeterministically = branchProofs.length > 0
      ? branchProofs.reduce((sum: number, proof: any) => sum + proof.feasibleSquads, 0)
      : undefined;
    const solutionsProvenOptimal = proofs.reduce((sum: number, proof: any) => sum + (proof.solutionsProvenOptimal ?? 0), 0);
    const distributionById = new Map<number, { playerId: number; mean: number }>(
      playerDistributions.map((item: { playerId: number; mean: number }) => [item.playerId, item])
    );
    candidates = frontier.map((candidate) => {
      const captains = [...candidate.startingXI].sort((a, b) => distributionById.get(b)!.mean - distributionById.get(a)!.mean || a - b);
      return {
        candidateId: candidate.candidateId,
        playerIds: candidate.startingXI,
        benchOrder: candidate.benchOrder,
        captainPlayerId: captains[0],
        viceCaptainPlayerId: captains[1]
      };
    });
    searchScope = {
      generator: proofs.every((proof: any) => proof.algorithm === "highs-milp-k-best") ? "highs-milp-k-best" : "deterministic-branch-and-bound",
      exhaustive: proofs.length === 1 && proofs.every((proof: any) => proof.frontierComplete),
      deterministicSearchExhaustive: proofs.every((proof: any) => proof.exhaustive),
      legalSquadsEvaluatedDeterministically,
      solutionsProvenOptimal,
      playerUniverseSize: playerDistributions.length,
      candidatesGenerated: unique.size,
      candidatesSimulated: candidates.length
    };
  }
  const report = simulateStructures({ ...request, candidates, playerDistributions, searchScope });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if ((request.sensitivityPlayerIds?.length ?? 0) > 0) {
    const marginReport = analyzeDecisionMargins({
      mode: "MAX_EXPECTED_POINTS",
      candidates,
      playerDistributions,
      fixtureDistributions: request.fixtureDistributions,
      playerIds: request.sensitivityPlayerIds,
      seed: request.seed,
      sampleCount: request.sampleCount,
      perturbationStep: request.perturbationStep
    });
    await mkdir(path.dirname(marginsOutputPath!), { recursive: true });
    await writeFile(marginsOutputPath!, `${JSON.stringify(marginReport, null, 2)}\n`, "utf8");
  }
  console.log(`Wrote ${outputPath}: ${report.results.length} structures, ${report.sampleCount} shared samples, ${report.mode}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
