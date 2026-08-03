import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildSquadRiskReport,
  CurrentRoleReportSchema,
  evaluateWeeklyStrategyQuality,
  FixtureHorizonReportSchema,
  FixtureTickerSchema,
  MinutesRiskReportSchema,
  OddsReportSchema,
  PublicEvidenceReportSchema,
  readArtifactFile,
  readArtifactFileIfExists,
  RecommendationArtifactSchema,
  renderAgentBrief,
  renderEvidenceReportMarkdown,
  renderManualChecklist,
  renderSquadRiskReportMarkdown,
  SetPieceReportSchema,
  TeamNewsReportSchema,
  verifyRecommendation,
  WeeklyStrategySchema,
  type FixtureTicker,
  type CurrentRoleReport,
  type FixtureHorizonReport,
  type MinutesRiskReport,
  type OddsReport,
  type PublicEvidenceReport,
  type SetPieceReport,
  type SquadRiskReport,
  type StrategyQualityReport,
  type TeamNewsReport,
  type VerifyRecommendationResult,
  type WeeklyRecommendation,
  type WeeklyStrategy
} from "../packages/agent/src";
import { RISK_PROFILE } from "../config/risk-profile";
import { buildLocalEvidenceReport } from "./evidence-sources";

function argValue(name: string) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
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

async function readTextIfExists(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function isWeeklyRecommendation(value: unknown): value is WeeklyRecommendation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const recommendation = value as Partial<WeeklyRecommendation>;

  return Array.isArray(recommendation.squadBefore?.players) &&
    recommendation.recommendedAction !== null &&
    recommendation.recommendedAction !== undefined &&
    recommendation.pickTeam !== null &&
    recommendation.pickTeam !== undefined &&
    recommendation.captaincy !== null &&
    recommendation.captaincy !== undefined &&
    recommendation.chip !== null &&
    recommendation.chip !== undefined &&
    recommendation.manualExecutionRequired === true;
}

async function main() {
  const gameweek = argValue("--gw");

  if (!gameweek) {
    console.error("Usage: pnpm verify -- --gw <gameweek>");
    process.exitCode = 1;
    return;
  }

  const outputDir = path.join("packages", "content", "recommendations", `gw-${gameweek}`);
  const recommendationPath = path.join(outputDir, "recommendation.json");
  const legalityPath = path.join(outputDir, "legality-report.json");
  const evidenceReportJsonPath = path.join(outputDir, "evidence-report.json");
  const evidenceReportMarkdownPath = path.join(outputDir, "evidence-report.md");
  const riskReportJsonPath = path.join(outputDir, "risk-report.json");
  const riskReportMarkdownPath = path.join(outputDir, "risk-report.md");
  const agentBriefPath = path.join(outputDir, "agent-brief.md");
  const manualChecklistPath = path.join(outputDir, "manual-checklist.md");
  const recommendation = await readArtifactFile(recommendationPath, RecommendationArtifactSchema);
  const seasonPlanPath = path.join("packages", "content", "strategy", "season-plan.md");
  const weeklyStrategyPath = path.join("packages", "content", "strategy", "weekly", `gw-${gameweek}.json`);
  const legality: VerifyRecommendationResult = isWeeklyRecommendation(recommendation)
    ? verifyRecommendation(recommendation, {
      forceDeadline: process.argv.includes("--force-deadline")
    })
    : {
      isValid: false,
      errors: ["Final recommendation has not been authored by the coding agent."],
      warnings: ["Run evidence prep first, then author recommendation.json manually from current evidence."],
      quality: {
        isValid: false,
        errors: ["Final recommendation has not been authored by the coding agent."],
        warnings: [],
        gates: [
          {
            gate: "authored-recommendation",
            status: "fail",
            message: "Final recommendation has not been authored by the coding agent."
          }
        ]
      }
    };

  if (isWeeklyRecommendation(recommendation)) {
    const weeklyStrategy: WeeklyStrategy | null = await readArtifactFileIfExists(
      weeklyStrategyPath,
      WeeklyStrategySchema
    );
    const seasonPlanText = await readTextIfExists(seasonPlanPath);
    const dataStatus = await readJsonIfExists<{ dataMode?: "official" | "provisional" }>(
      path.join(outputDir, "data-status.json")
    );
    const fixtureTicker: FixtureTicker | null = await readArtifactFileIfExists(
      path.join(outputDir, "fixture-ticker.json"),
      FixtureTickerSchema
    );
    const fixtureHorizonReport: FixtureHorizonReport | null = await readArtifactFileIfExists(
      path.join(outputDir, "fixture-horizon-report.json"),
      FixtureHorizonReportSchema
    );
    const teamNewsReport: TeamNewsReport | null = await readArtifactFileIfExists(
      path.join(outputDir, "team-news-report.json"),
      TeamNewsReportSchema
    );
    const setPieceReport: SetPieceReport | null = await readArtifactFileIfExists(
      path.join(outputDir, "set-pieces-report.json"),
      SetPieceReportSchema
    );
    const oddsReport: OddsReport | null = await readArtifactFileIfExists(
      path.join(outputDir, "odds-report.json"),
      OddsReportSchema
    );
    const minutesRiskReport: MinutesRiskReport | null = await readArtifactFileIfExists(
      path.join(outputDir, "minutes-risk-report.json"),
      MinutesRiskReportSchema
    );
    const publicEvidenceReport: PublicEvidenceReport | null = await readArtifactFileIfExists(
      path.join(outputDir, "public-evidence-report.json"),
      PublicEvidenceReportSchema
    );
    const currentRoleReport: CurrentRoleReport | null = await readArtifactFileIfExists(
      path.join(outputDir, "current-role-report.json"),
      CurrentRoleReportSchema
    );
    const riskReport: SquadRiskReport = buildSquadRiskReport({
      generatedAt: new Date().toISOString(),
      recommendation,
      dataStatus,
      fixtureHorizonReport,
      fixtureTicker,
      teamNewsReport,
      setPieceReport,
      oddsReport,
      minutesRiskReport,
      publicEvidenceReport,
      currentRoleReport,
      contextNotes: {
        teamNews: await readTextIfExists(path.join("packages", "content", "context", "team-news.md")) ?? "",
        setPieces: await readTextIfExists(path.join("packages", "content", "context", "set-pieces.md")) ?? "",
        watchlist: await readTextIfExists(path.join("packages", "content", "context", "watchlist.md")) ?? ""
      }
    });
    const evidenceReport = await buildLocalEvidenceReport({
      gameweek: Number(gameweek),
      generatedAt: new Date().toISOString()
    });
    const strategyQuality: StrategyQualityReport = evaluateWeeklyStrategyQuality({
      weeklyStrategy,
      recommendation,
      seasonPlanText,
      riskProfile: RISK_PROFILE
    });

    await writeFile(evidenceReportJsonPath, `${JSON.stringify(evidenceReport, null, 2)}\n`, "utf8");
    await writeFile(evidenceReportMarkdownPath, renderEvidenceReportMarkdown(evidenceReport), "utf8");
    await writeFile(riskReportJsonPath, `${JSON.stringify(riskReport, null, 2)}\n`, "utf8");
    await writeFile(riskReportMarkdownPath, renderSquadRiskReportMarkdown(riskReport), "utf8");
    await writeFile(agentBriefPath, renderAgentBrief(recommendation), "utf8");
    await writeFile(manualChecklistPath, renderManualChecklist(recommendation), "utf8");
    legality.strategyQuality = strategyQuality;
    legality.isValid = legality.isValid && strategyQuality.isValid;
    legality.errors = [...legality.errors, ...strategyQuality.errors];
    legality.warnings = [
      ...legality.warnings,
      ...strategyQuality.warnings,
      ...evidenceReport.warnings,
      ...(oddsReport?.warnings ?? []),
      ...(minutesRiskReport?.warnings ?? []),
      ...(publicEvidenceReport?.warnings ?? [])
    ];
  }

  await writeFile(legalityPath, `${JSON.stringify(legality, null, 2)}\n`, "utf8");

  if (!legality.isValid) {
    console.error(`Recommendation failed verification. See ${legalityPath}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Recommendation passed verification. See ${legalityPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
