import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildSetPieceReport,
  isWeeklyRecommendationArtifact,
  readArtifactFileIfExists,
  RecommendationArtifactSchema,
  renderSetPieceReportMarkdown,
  type EvidenceSource
} from "../packages/agent/src";

type BootstrapStatic = {
  elements: Parameters<typeof buildSetPieceReport>[0]["players"];
  teams: Parameters<typeof buildSetPieceReport>[0]["teams"];
  element_types: Parameters<typeof buildSetPieceReport>[0]["elementTypes"];
};

function argValue(name: string) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

async function readJson<T>(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function fileTimestamp(filePath: string) {
  const file = await stat(filePath);

  return file.mtime.toISOString();
}

async function main() {
  const gameweek = Number(argValue("--gw") ?? 1);

  if (!Number.isInteger(gameweek) || gameweek < 1) {
    console.error("Usage: pnpm set-pieces -- --gw <gameweek>");
    process.exitCode = 1;
    return;
  }

  const bootstrapPath = path.join("data", "raw", "bootstrap-static.json");
  const outputDir = path.join("packages", "content", "recommendations", `gw-${gameweek}`);
  const recommendationArtifact = await readArtifactFileIfExists(
    path.join(outputDir, "recommendation.json"),
    RecommendationArtifactSchema
  );
  const recommendation = recommendationArtifact && isWeeklyRecommendationArtifact(recommendationArtifact)
    ? recommendationArtifact
    : null;
  const bootstrap = await readJson<BootstrapStatic>(bootstrapPath);
  const generatedAt = new Date().toISOString();
  const source: EvidenceSource = {
    id: "set-pieces",
    label: "FPL set pieces",
    provider: "Fantasy Premier League public API cache",
    url: "https://fantasy.premierleague.com/api/bootstrap-static/",
    rawPath: bootstrapPath,
    reportPath: path.join(outputDir, "set-pieces-report.json"),
    required: true,
    confidence: "high",
    freshness: {
      status: "fresh",
      checkedAt: generatedAt,
      fetchedAt: await fileTimestamp(bootstrapPath),
      ageHours: null,
      maxAgeHours: 168,
      message: "FPL set pieces are fresh."
    }
  };
  const report = buildSetPieceReport({
    generatedAt,
    gameweek,
    source,
    players: bootstrap.elements,
    teams: bootstrap.teams,
    elementTypes: bootstrap.element_types,
    selectedPlayerIds: recommendation?.squadBefore.players.map((player) => player.id) ?? []
  });

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "set-pieces-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "set-pieces-report.md"), renderSetPieceReportMarkdown(report), "utf8");
  console.log(
    `Wrote set-pieces report to ${outputDir}: ${report.summary.rolePlayers} role players, ${report.summary.selectedRolePlayers} selected.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
