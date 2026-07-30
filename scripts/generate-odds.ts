import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildOddsReport,
  isWeeklyRecommendationArtifact,
  parseFootballDataCsv,
  readArtifactFileIfExists,
  RecommendationArtifactSchema,
  renderOddsReportMarkdown,
  type EvidenceSource
} from "../packages/agent/src";
import type { Fixture, Team } from "../packages/fpl-api/src";

type BootstrapStatic = {
  teams: Team[];
};

const defaultSourceUrl = "https://www.football-data.co.uk/fixtures.csv";

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

async function fetchCsv(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "text/csv,text/plain,*/*",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "fpl-agent odds evidence"
    }
  });

  if (!response.ok) {
    throw new Error(`Football-Data returned ${response.status} for ${url}`);
  }

  return response.text();
}

async function main() {
  const gameweek = Number(argValue("--gw") ?? 1);
  const sourceUrl = argValue("--source-url") ?? defaultSourceUrl;

  if (!Number.isInteger(gameweek) || gameweek < 1) {
    console.error("Usage: pnpm odds -- --gw <gameweek> [--source-url <url>]");
    process.exitCode = 1;
    return;
  }

  const generatedAt = new Date().toISOString();
  const outputDir = path.join("packages", "content", "recommendations", `gw-${gameweek}`);
  const rawDir = path.join("data", "raw", "odds");
  const rawCsvPath = path.join(rawDir, "football-data-fixtures.csv");
  const bootstrap = await readJson<BootstrapStatic>(path.join("data", "raw", "bootstrap-static.json"));
  const fixtures = await readJson<Fixture[]>(path.join("data", "raw", "fixtures.json"));
  const recommendationArtifact = await readArtifactFileIfExists(
    path.join(outputDir, "recommendation.json"),
    RecommendationArtifactSchema
  );
  const recommendation = recommendationArtifact && isWeeklyRecommendationArtifact(recommendationArtifact)
    ? recommendationArtifact
    : null;
  const csv = await fetchCsv(sourceUrl);

  await mkdir(rawDir, { recursive: true });
  await writeFile(rawCsvPath, csv, "utf8");

  const source: EvidenceSource = {
    id: "odds",
    label: "Football-Data fixture odds",
    provider: "Football-Data.co.uk public fixtures CSV",
    url: sourceUrl,
    rawPath: rawCsvPath,
    reportPath: path.join(outputDir, "odds-report.json"),
    required: true,
    confidence: "medium",
    freshness: {
      status: "fresh",
      checkedAt: generatedAt,
      fetchedAt: await fileTimestamp(rawCsvPath),
      ageHours: null,
      maxAgeHours: 12,
      message: "Football-Data odds CSV was fetched."
    }
  };
  const report = buildOddsReport({
    generatedAt,
    gameweek,
    source,
    csvRows: parseFootballDataCsv(csv),
    teams: bootstrap.teams,
    fixtures,
    selectedPlayers: recommendation?.squadBefore.players.map((player) => ({
      id: player.id,
      team: player.teamId
    })) ?? []
  });

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "odds-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "odds-report.md"), renderOddsReportMarkdown(report), "utf8");
  console.log(
    `Wrote odds report to ${outputDir}: ${report.summary.matchedFixtures}/${report.summary.gameweekFixtures} GW fixtures matched.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
