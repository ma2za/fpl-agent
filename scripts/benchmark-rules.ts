import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import {
  calculateTeamGameweekPoints,
  scorePlayerFixture,
  type LineupPlayer
} from "../packages/rules/src";

const positions = [
  "GKP", "GKP",
  "DEF", "DEF", "DEF", "DEF", "DEF",
  "MID", "MID", "MID", "MID", "MID",
  "FWD", "FWD", "FWD"
] as const;

const players: LineupPlayer[] = positions.map((position, index) => ({
  id: index + 1,
  position,
  minutes: index % 7 === 0 ? 0 : 90,
  points: index + 1
}));

function measure(iterations: number, operation: () => void) {
  operation();
  const startedAt = performance.now();

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    operation();
  }

  return performance.now() - startedAt;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function runRounds(iterations: number, operation: () => void) {
  return Array.from({ length: 5 }, () => measure(iterations, operation));
}

async function main() {
  const iterations = { lineup: 10000, scoring: 1000000 };
  const rounds = {
    lineup: runRounds(iterations.lineup, () => {
      calculateTeamGameweekPoints({
        players,
        startingXI: [1, 3, 4, 5, 8, 9, 10, 11, 13, 14, 15],
        benchOrder: [2, 6, 7, 12],
        captainPlayerId: 15,
        viceCaptainPlayerId: 14
      });
    }),
    scoring: runRounds(iterations.scoring, () => {
      scorePlayerFixture({
        season: "2026-27",
        position: "MID",
        stats: {
          minutes: 90,
          goals: 1,
          assists: 1,
          cleanSheet: true,
          bonusPoints: 2,
          defensiveContributions: 12
        }
      });
    })
  };
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch
    },
    iterations,
    mediansMs: {
      lineup: median(rounds.lineup),
      scoring: median(rounds.scoring)
    },
    roundsMs: rounds
  };
  const outputPath = path.join("data", "cache", "benchmarks", "rules-baseline.json");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  console.log(`Wrote rules benchmark baseline to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
