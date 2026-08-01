import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { compareAuthoredVariants, compareSquads } from "../packages/agent/src";
import { variantRecommendation, variantWeeklyStrategy } from "../packages/agent/tests/fixtures/variantRecommendation";

const recommendationA = variantRecommendation();
const recommendationB = variantRecommendation(1, 15);
const iterations = 100;

function measure(operation: () => void) {
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

async function main() {
  const coreRounds = Array.from({ length: 5 }, () => measure(() => compareSquads({
    generatedAt: "2026-08-01T00:00:00.000Z",
    labelA: "balanced",
    labelB: "alternate-forward",
    recommendationA,
    recommendationB
  })));
  const variantRounds = Array.from({ length: 5 }, () => measure(() => compareAuthoredVariants({
    generatedAt: "2026-08-01T00:00:00.000Z",
    gameweek: 1,
    slugA: "balanced",
    slugB: "alternate-forward",
    recommendationPathA: "balanced/recommendation.json",
    recommendationPathB: "alternate-forward/recommendation.json",
    recommendationA,
    recommendationB,
    riskProfile: { transferHits: "balanced" },
    evidence: {
      weeklyStrategy: variantWeeklyStrategy(),
      seasonPlanText: "# Benchmark season plan"
    }
  })));
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
      unchangedSquadComparison: median(coreRounds),
      variantComparisonWithVerification: median(variantRounds)
    },
    roundsMs: {
      unchangedSquadComparison: coreRounds,
      variantComparisonWithVerification: variantRounds
    }
  };
  const outputPath = path.join("data", "cache", "benchmarks", "variant-comparison-baseline.json");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  console.log(`Wrote variant benchmark to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
