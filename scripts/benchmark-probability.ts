import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import {
  buildProjectionUncertaintyReport,
  projectPlayers,
  type PlayerForEngine
} from "../packages/engine/src";

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const source = await readFile(path.join("data", "processed", "players.json"), "utf8");
  const players = JSON.parse(source) as PlayerForEngine[];
  const rawProjections = projectPlayers(players);
  const rounds = Array.from({ length: 5 }, () => {
    const startedAt = performance.now();
    const report = buildProjectionUncertaintyReport({
      generatedAt: "2026-08-09T00:00:00.000Z",
      gameweek: 1,
      players,
      rawProjections,
      seed: 120026,
      sampleCount: 1000
    });
    return {
      durationMs: performance.now() - startedAt,
      itemCount: report.items.length
    };
  });
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runtime: { node: process.version, platform: process.platform, architecture: process.arch },
    modelVersion: "0.0.23",
    playerCount: players.length,
    sampleCountPerPlayer: 1000,
    inputHash: createHash("sha256").update(source).digest("hex"),
    medianDurationMs: Number(median(rounds.map((round) => round.durationMs)).toFixed(3)),
    rounds: rounds.map((round) => ({ ...round, durationMs: Number(round.durationMs.toFixed(3)) }))
  };
  const outputPath = path.join("data", "cache", "benchmarks", "probability-baseline.json");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  console.log(`Wrote probability benchmark baseline to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
