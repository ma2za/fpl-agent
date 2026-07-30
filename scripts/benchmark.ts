import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import {
  compareSquads,
  parseArtifactJson,
  verifyRecommendation,
  WeeklyRecommendationSchema,
  type WeeklyRecommendation
} from "../packages/agent/src";
import { projectPlayers, type PlayerForEngine } from "../packages/engine/src";

const positions = [
  "GKP", "GKP",
  "DEF", "DEF", "DEF", "DEF", "DEF",
  "MID", "MID", "MID", "MID", "MID",
  "FWD", "FWD", "FWD"
] as const;

const players: PlayerForEngine[] = positions.map((position, index) => ({
  id: index + 1,
  name: `Benchmark Player ${index + 1}`,
  position,
  teamId: (index % 8) + 1,
  price: 4 + index * 0.2,
  nowCost: 40 + index * 2,
  status: "a",
  chanceOfPlayingNextRound: 100,
  expectedPointsNext: 2 + index * 0.25,
  expectedPointsThis: 2 + index * 0.2,
  form: 1 + index * 0.2,
  minutes: 900 + index * 100,
  selectedByPercent: index + 1,
  totalPoints: 30 + index * 5
}));

const recommendation: WeeklyRecommendation = {
  gameweek: 1,
  createdAt: "2020-01-01T00:00:00.000Z",
  deadline: "2020-01-02T00:00:00.000Z",
  deadlineStatus: "open",
  dataMode: "official",
  squadBefore: {
    players,
    bank: 0,
    freeTransfers: 1,
    chipsAvailable: ["wildcard", "free_hit", "bench_boost", "triple_captain"]
  },
  recommendedAction: {
    type: "roll",
    transfers: [],
    transferCost: 0,
    bankAfter: 0,
    explanation: "Fixed benchmark input."
  },
  pickTeam: {
    formation: "3-4-3",
    startingXI: [1, 3, 4, 5, 8, 9, 10, 11, 13, 14, 15],
    benchOrder: [2, 6, 7, 12],
    projectedPoints: 60,
    explanation: "Fixed benchmark input excludes captaincy."
  },
  captaincy: {
    captainPlayerId: 15,
    viceCaptainPlayerId: 14,
    alternatives: [],
    explanation: "Fixed benchmark captaincy."
  },
  chip: {
    chip: "none",
    confidence: "high",
    expectedGain: 0,
    reasons: ["Fixed benchmark input."],
    warnings: []
  },
  topTransferCandidates: [],
  confidence: {
    score: 0.5,
    label: "medium",
    explanation: "Fixed benchmark confidence."
  },
  evidenceReferences: [
    "squad",
    "starting-xi",
    "shortlist",
    "captaincy",
    "bench",
    "chip",
    "risks",
    "change-conditions"
  ].map((area) => ({
    area: area as WeeklyRecommendation["evidenceReferences"][number]["area"],
    source: "benchmark",
    reportPath: "benchmark.json",
    note: "Fixed benchmark evidence."
  })),
  risks: ["Fixed benchmark risk."],
  whatWouldChangeMyMind: ["Fixed benchmark condition."],
  legality: {
    isValid: true,
    errors: [],
    warnings: []
  },
  manualExecutionRequired: true
};

const serializedRecommendation = JSON.stringify(recommendation);

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
  return Array.from({ length: 3 }, () => measure(iterations, operation));
}

async function main() {
  const iterations = {
    artifactParsing: 500,
    projection: 1000,
    squadComparison: 100,
    verification: 200
  };
  const rounds = {
    artifactParsing: runRounds(iterations.artifactParsing, () => {
      parseArtifactJson(serializedRecommendation, WeeklyRecommendationSchema);
    }),
    projection: runRounds(iterations.projection, () => {
      projectPlayers(players);
    }),
    squadComparison: runRounds(iterations.squadComparison, () => {
      compareSquads({
        generatedAt: "2020-01-01T00:00:00.000Z",
        labelA: "A",
        labelB: "B",
        recommendationA: recommendation,
        recommendationB: recommendation
      });
    }),
    verification: runRounds(iterations.verification, () => {
      verifyRecommendation(recommendation);
    })
  };
  const rawParseAndVerify = runRounds(iterations.verification, () => {
    verifyRecommendation(JSON.parse(serializedRecommendation) as WeeklyRecommendation);
  });
  const schemaParseAndVerify = runRounds(iterations.verification, () => {
    verifyRecommendation(
      parseArtifactJson(serializedRecommendation, WeeklyRecommendationSchema)
    );
  });
  const rawMedian = median(rawParseAndVerify);
  const schemaMedian = median(schemaParseAndVerify);
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch
    },
    inputHash: createHash("sha256").update(serializedRecommendation).digest("hex"),
    iterations,
    mediansMs: {
      artifactParsing: median(rounds.artifactParsing),
      projection: median(rounds.projection),
      squadComparison: median(rounds.squadComparison),
      verification: median(rounds.verification),
      rawParseAndVerify: rawMedian,
      schemaParseAndVerify: schemaMedian
    },
    schemaValidationOverheadPercent: Number(
      (((schemaMedian - rawMedian) / rawMedian) * 100).toFixed(1)
    ),
    roundsMs: {
      ...rounds,
      rawParseAndVerify,
      schemaParseAndVerify
    }
  };
  const outputPath = path.join(
    "data",
    "cache",
    "benchmarks",
    "compatibility-baseline.json"
  );

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  console.log(`Wrote benchmark baseline to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
