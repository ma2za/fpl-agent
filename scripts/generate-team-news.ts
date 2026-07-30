import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildTeamNewsReport,
  isWeeklyRecommendationArtifact,
  readArtifactFileIfExists,
  RecommendationArtifactSchema,
  renderTeamNewsReportMarkdown,
  type EvidenceSource
} from "../packages/agent/src";

type BootstrapStatic = {
  elements: Parameters<typeof buildTeamNewsReport>[0]["players"];
  teams: Parameters<typeof buildTeamNewsReport>[0]["teams"];
  element_types: Parameters<typeof buildTeamNewsReport>[0]["elementTypes"];
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
    console.error("Usage: pnpm team-news -- --gw <gameweek>");
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
    id: "team-news",
    label: "FPL availability",
    provider: "Fantasy Premier League public API cache",
    url: "https://fantasy.premierleague.com/api/bootstrap-static/",
    rawPath: bootstrapPath,
    reportPath: path.join(outputDir, "team-news-report.json"),
    required: true,
    confidence: "high",
    freshness: {
      status: "fresh",
      checkedAt: generatedAt,
      fetchedAt: await fileTimestamp(bootstrapPath),
      ageHours: null,
      maxAgeHours: 24,
      message: "FPL availability is fresh."
    }
  };
  const report = buildTeamNewsReport({
    generatedAt,
    gameweek,
    source,
    players: bootstrap.elements,
    teams: bootstrap.teams,
    elementTypes: bootstrap.element_types,
    selectedPlayerIds: recommendation?.squadBefore.players.map((player) => player.id) ?? []
  });

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "team-news-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "team-news-report.md"), renderTeamNewsReportMarkdown(report), "utf8");
  console.log(
    `Wrote team-news report to ${outputDir}: ${report.summary.flaggedPlayers} flagged, ${report.summary.selectedFlaggedPlayers} selected.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
