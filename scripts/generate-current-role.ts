import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  RecommendationArtifactSchema,
  buildCurrentRoleReport,
  isWeeklyRecommendationArtifact,
  readArtifactFileIfExists,
  renderCurrentRoleReportMarkdown
} from "../packages/agent/src";
import { CURRENT_ROLE_ADAPTERS } from "../config/current-role";
import { currentRoleAdapterInputs, type ReviewedRoleEvidenceInput } from "./current-role-evidence";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function readJson<T>(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function readJsonIfExists<T>(filePath: string) {
  try {
    return await readJson<T>(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function main() {
  const gameweek = Number(argValue("--gw") ?? 1);
  if (!Number.isInteger(gameweek) || gameweek < 1) {
    console.error("Usage: pnpm roles -- --gw <gameweek> [--input <reviewed-evidence.json>]");
    process.exitCode = 1;
    return;
  }

  const outputDir = path.join("packages", "content", "recommendations", `gw-${gameweek}`);
  const inputPath = argValue("--input") ?? path.join("packages", "content", "context", "current-role-evidence.json");
  const bootstrap = await readJson<{ elements: Parameters<typeof buildCurrentRoleReport>[0]["players"] }>(
    path.join("data", "raw", "bootstrap-static.json")
  );
  const recommendationArtifact = await readArtifactFileIfExists(
    path.join(outputDir, "recommendation.json"),
    RecommendationArtifactSchema
  );
  const recommendation = recommendationArtifact && isWeeklyRecommendationArtifact(recommendationArtifact)
    ? recommendationArtifact
    : null;
  const generatedAt = new Date().toISOString();
  const reviewed = await readJsonIfExists<ReviewedRoleEvidenceInput>(inputPath);
  const report = buildCurrentRoleReport({
    generatedAt,
    gameweek,
    players: bootstrap.elements,
    adapters: currentRoleAdapterInputs(CURRENT_ROLE_ADAPTERS, bootstrap.elements, generatedAt, reviewed),
    selectedPlayerIds: recommendation?.squadBefore.players.map((player) => player.id) ?? []
  });

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "current-role-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "current-role-report.md"), renderCurrentRoleReportMarkdown(report), "utf8");
  console.log(`Wrote current-role report to ${outputDir}: ${report.summary.insufficient} selected INSUFFICIENT.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
