import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AgentRoleEvidenceInputSchema,
  buildMinutesRiskReport,
  isWeeklyRecommendationArtifact,
  readArtifactFileIfExists,
  RecommendationArtifactSchema,
  renderMinutesRiskReportMarkdown,
  type EvidenceSource
} from "../packages/agent/src";
import { CURRENT_ROLE_ADAPTERS } from "../config/current-role";
import { currentRoleAdapterInputs } from "./current-role-evidence";

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
    return await readJson<T>(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
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
  const recommendationArtifact = await readArtifactFileIfExists(
    path.join(outputDir, "recommendation.json"),
    RecommendationArtifactSchema
  );
  const recommendation = recommendationArtifact && isWeeklyRecommendationArtifact(recommendationArtifact)
    ? recommendationArtifact
    : null;
  const bootstrap = await readJson<BootstrapStatic>(bootstrapPath);
  const generatedAt = new Date().toISOString();
  const agentEvidenceInput = await readJsonIfExists<unknown>(
    path.join("packages", "content", "context", "agent-role-evidence.json")
  );
  const agentEvidence = agentEvidenceInput === null
    ? null
    : AgentRoleEvidenceInputSchema.parse(agentEvidenceInput);
  const predictedLineups = currentRoleAdapterInputs(
    CURRENT_ROLE_ADAPTERS,
    bootstrap.elements,
    generatedAt,
    agentEvidence
  ).find((adapter) => adapter.config.kind === "predicted_lineup")?.records;
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
    benchOrder: recommendation?.pickTeam?.benchOrder ?? [],
    predictedLineups
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
