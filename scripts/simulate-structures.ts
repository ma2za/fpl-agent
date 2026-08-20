import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { applyProjectionAdjustments, simulateStructures } from "../packages/engine/src";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main() {
  const inputPath = argValue("--input");
  const outputPath = argValue("--out");
  if (!inputPath || !outputPath) throw new Error("Usage: pnpm simulate:structures -- --input <request.json> --out <report.json>");
  const request = JSON.parse(await readFile(inputPath, "utf8"));
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
      const adjusted = adjustment ? applyProjectionAdjustments({
        baseProjection: projection.roleAdjustedProjection,
        baseStandardDeviation: projection.projectionStandardDeviation,
        baselineFeatureIds: projection.featureInputs?.map((feature) => feature.featureId) ?? [],
        adjustments: adjustment.features
      }) : null;
      return {
        playerId: projection.playerId,
        mean: adjusted?.adjustedProjection ?? projection.roleAdjustedProjection,
        standardDeviation: adjusted?.adjustedStandardDeviation ?? projection.projectionStandardDeviation,
        appearanceProbability: projection.appearance.appearanceProbability,
        position: playerById.get(projection.playerId)?.position,
        teamId: playerById.get(projection.playerId)?.teamId,
        price: playerById.get(projection.playerId)?.price
      };
    });
  }
  const report = simulateStructures({ ...request, playerDistributions });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath}: ${report.results.length} structures, ${report.sampleCount} shared samples, ${report.mode}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
