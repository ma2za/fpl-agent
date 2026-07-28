import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildMinutesRiskReport,
  renderMinutesRiskReportMarkdown,
  type EvidenceSource,
  type WeeklyRecommendation
} from "../packages/agent/src";

type BootstrapStatic = {
  elements: Parameters<typeof buildMinutesRiskReport>[0]["players"];
  teams: Parameters<typeof buildMinutesRiskReport>[0]["teams"];
  element_types: Parameters<typeof buildMinutesRiskReport>[0]["elementTypes"];
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

async function readJsonIfExists<T>(filePath: string) {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function fileTimestamp(filePath: string) {
  const file = await stat(filePath);

  return file.mtime.toISOString();
}

async function main() {
  const gameweek = Number(argValue("--gw") ?? 1);

  if (!Number.isInteger(gameweek) || gameweek < 1) {
    console.error("Usage: pnpm minutes -- --gw <gameweek>");
    process.exitCode = 1;
    return;
  }

  const bootstrapPath = path.join("data", "raw", "bootstrap-static.json");
  const outputDir = path.join("packages", "content", "recommendations", `gw-${gameweek}`);
  const recommendation = await readJsonIfExists<WeeklyRecommendation>(path.join(outputDir, "recommendation.json"));
  const bootstrap = await readJson<BootstrapStatic>(bootstrapPath);
  const generatedAt = new Date().toISOString();
  const source: EvidenceSource = {
    id: "minutes",
    label: "FPL historical minutes",
    provider: "Fantasy Premier League public API cache",
    url: "https://fantasy.premierleague.com/api/bootstrap-static/",
    rawPath: bootstrapPath,
    reportPath: path.join(outputDir, "minutes-risk-report.json"),
    required: true,
    confidence: "medium",
    freshness: {
      status: "fresh",
      checkedAt: generatedAt,
      fetchedAt: await fileTimestamp(bootstrapPath),
      ageHours: null,
      maxAgeHours: 24,
      message: "FPL historical minutes are fresh."
    }
  };
  const report = buildMinutesRiskReport({
    generatedAt,
    gameweek,
    source,
    players: bootstrap.elements,
    teams: bootstrap.teams,
    elementTypes: bootstrap.element_types,
    selectedPlayerIds: recommendation?.squadBefore.players.map((player) => player.id) ?? [],
    startingPlayerIds: recommendation?.pickTeam?.startingXI ?? [],
    benchOrder: recommendation?.pickTeam?.benchOrder ?? []
  });

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "minutes-risk-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "minutes-risk-report.md"), renderMinutesRiskReportMarkdown(report), "utf8");
  console.log(
    `Wrote minutes risk report to ${outputDir}: ${report.summary.selectedWatchOrWorse} selected watch-or-worse.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
