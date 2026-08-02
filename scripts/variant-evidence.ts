import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  EvidenceReportSchema,
  FixtureHorizonReportSchema,
  FixtureTickerSchema,
  MinutesRiskReportSchema,
  OddsReportSchema,
  PublicEvidenceReportSchema,
  readArtifactFileIfExists,
  SetPieceReportSchema,
  TeamNewsReportSchema,
  WeeklyStrategySchema,
  type VariantSharedEvidence
} from "../packages/agent/src";

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

async function readDataStatus(filePath: string): Promise<{ dataMode: "official" | "provisional" } | null> {
  const text = await readTextIfExists(filePath);

  if (!text) {
    return null;
  }

  const value = JSON.parse(text) as { dataMode?: unknown };

  return value.dataMode === "official" || value.dataMode === "provisional"
    ? { dataMode: value.dataMode }
    : null;
}

export async function loadVariantSharedEvidence(gameweek: number): Promise<VariantSharedEvidence> {
  const gameweekDir = path.join("packages", "content", "recommendations", `gw-${gameweek}`);
  const contextDir = path.join("packages", "content", "context");

  const [
    fixtureHorizonReport,
    fixtureTicker,
    teamNewsReport,
    setPieceReport,
    oddsReport,
    minutesRiskReport,
    publicEvidenceReport,
    evidenceReport,
    weeklyStrategy,
    seasonPlanText,
    dataStatus,
    teamNews,
    setPieces,
    watchlist
  ] = await Promise.all([
    readArtifactFileIfExists(path.join(gameweekDir, "fixture-horizon-report.json"), FixtureHorizonReportSchema),
    readArtifactFileIfExists(path.join(gameweekDir, "fixture-ticker.json"), FixtureTickerSchema),
    readArtifactFileIfExists(path.join(gameweekDir, "team-news-report.json"), TeamNewsReportSchema),
    readArtifactFileIfExists(path.join(gameweekDir, "set-pieces-report.json"), SetPieceReportSchema),
    readArtifactFileIfExists(path.join(gameweekDir, "odds-report.json"), OddsReportSchema),
    readArtifactFileIfExists(path.join(gameweekDir, "minutes-risk-report.json"), MinutesRiskReportSchema),
    readArtifactFileIfExists(path.join(gameweekDir, "public-evidence-report.json"), PublicEvidenceReportSchema),
    readArtifactFileIfExists(path.join(gameweekDir, "evidence-report.json"), EvidenceReportSchema),
    readArtifactFileIfExists(
      path.join("packages", "content", "strategy", "weekly", `gw-${gameweek}.json`),
      WeeklyStrategySchema
    ),
    readTextIfExists(path.join("packages", "content", "strategy", "season-plan.md")),
    readDataStatus(path.join(gameweekDir, "data-status.json")),
    readTextIfExists(path.join(contextDir, "team-news.md")),
    readTextIfExists(path.join(contextDir, "set-pieces.md")),
    readTextIfExists(path.join(contextDir, "watchlist.md"))
  ]);

  return {
    fixtureHorizonReport,
    fixtureTicker,
    teamNewsReport,
    setPieceReport,
    oddsReport,
    minutesRiskReport,
    publicEvidenceReport,
    evidenceReport,
    weeklyStrategy,
    seasonPlanText,
    dataStatus,
    contextNotes: {
      teamNews: teamNews ?? "",
      setPieces: setPieces ?? "",
      watchlist: watchlist ?? ""
    }
  };
}
