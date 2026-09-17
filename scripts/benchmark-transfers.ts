import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import {
  generateTransferCandidates,
  projectPlayers,
  type PlayerForEngine
} from "../packages/engine/src";

const squadPositions = [
  "GKP", "GKP",
  "DEF", "DEF", "DEF", "DEF", "DEF",
  "MID", "MID", "MID", "MID", "MID",
  "FWD", "FWD", "FWD"
] as const;
const candidatePositions = ["GKP", "DEF", "MID", "FWD"] as const;

function player(id: number, position: PlayerForEngine["position"], teamId: number, price: number): PlayerForEngine {
  return {
    id,
    name: `Transfer Benchmark ${id}`,
    position,
    teamId,
    price,
    nowCost: Math.round(price * 10),
    status: "a",
    chanceOfPlayingNextRound: 100,
    expectedPointsNext: 2 + (id % 17) / 2,
    expectedPointsThis: 2 + (id % 13) / 2,
    form: 1 + (id % 11) / 2,
    minutes: 900 + (id % 20) * 100,
    selectedByPercent: id % 25,
    totalPoints: 30 + (id % 30) * 4
  };
}

const squad = squadPositions.map((position, index) => player(index + 1, position, index + 1, 4 + (index % 5) * 0.5));
const shortlist = Array.from({ length: 45 }, (_, index) =>
  player(100 + index, candidatePositions[index % candidatePositions.length]!, 30 + (index % 15), 4 + (index % 6) * 0.5)
);
const pool = [...squad, ...shortlist];
const projections = projectPlayers(pool);
const projections3GW = projections.map((projection) => ({
  ...projection,
  projectedPoints: projection.projectedPoints * (2.5 + (projection.playerId % 3) * 0.1)
}));

function measure(iterations: number) {
  generateTransferCandidates({ squad, candidates: pool, projections, projections3GW, freeTransfers: 1, bank: 1, rankingHorizon: "GW1-3" });
  const startedAt = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    generateTransferCandidates({ squad, candidates: pool, projections, projections3GW, freeTransfers: 1, bank: 1, rankingHorizon: "GW1-3" });
  }
  return performance.now() - startedAt;
}

function median(values: number[]) {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]!;
}

async function main() {
  const iterations = 20;
  const roundsMs = Array.from({ length: 5 }, () => measure(iterations));
  const result = {
    schemaVersion: 1,
    modelVersion: "0.0.26",
    generatedAt: new Date().toISOString(),
    runtime: { node: process.version, platform: process.platform, architecture: process.arch },
    input: { squadPlayers: squad.length, shortlistPlayers: shortlist.length, iterations },
    medianMs: median(roundsMs),
    roundsMs
  };
  const outputPath = path.join("data", "cache", "benchmarks", "transfer-optionality-baseline.json");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  console.log(`Wrote transfer optionality benchmark to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
