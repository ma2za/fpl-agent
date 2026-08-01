import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { runRefresh, type RefreshStage } from "../packages/agent/src";

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function stages(): RefreshStage[] {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `source-${index + 1}`,
    required: index < 4,
    artifacts: [{ relativePath: `source-${index + 1}.json` }],
    run: async ({ outputDir }) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await writeFile(
        path.join(outputDir, `source-${index + 1}.json`),
        `${JSON.stringify({ index, rows: 100 })}\n`,
        "utf8"
      );
    }
  }));
}

async function measure(root: string, concurrency: number, round: number) {
  const startedAt = performance.now();
  await runRefresh({
    gameweek: 1,
    mode: "offline",
    targetDir: path.join(root, `c${concurrency}-round-${round}`, "gw-1"),
    stages: stages(),
    inputs: [],
    deadline: { status: "open", time: "2026-08-15T10:00:00.000Z" },
    concurrency,
    runId: `benchmark-${concurrency}-${round}`,
    now: () => new Date("2026-08-01T00:00:00.000Z")
  });
  return performance.now() - startedAt;
}

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), "fpl-refresh-benchmark-"));

  try {
    const sequential: number[] = [];
    const bounded: number[] = [];

    for (let round = 0; round < 5; round += 1) {
      sequential.push(await measure(root, 1, round));
      bounded.push(await measure(root, 3, round));
    }

    const sequentialMedian = median(sequential);
    const boundedMedian = median(bounded);
    const result = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      runtime: {
        node: process.version,
        platform: process.platform,
        architecture: process.arch
      },
      fixture: { stages: 6, delayMsPerStage: 5, rounds: 5 },
      mediansMs: {
        sequential: sequentialMedian,
        bounded: boundedMedian
      },
      boundedImprovementPercent: Number(
        (((sequentialMedian - boundedMedian) / sequentialMedian) * 100).toFixed(1)
      ),
      roundsMs: { sequential, bounded }
    };
    const outputPath = path.join("data", "cache", "benchmarks", "refresh-baseline.json");

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(result, null, 2));
    console.log(`Wrote refresh benchmark baseline to ${outputPath}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
