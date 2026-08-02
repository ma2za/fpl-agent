import { stat } from "node:fs/promises";
import path from "node:path";
import type { EvidenceReport } from "../packages/agent/src";
import { buildEvidenceReport } from "../packages/agent/src";

type EvidenceSourceInput = Parameters<typeof buildEvidenceReport>[0]["sources"][number];

async function fileTimestamp(filePath: string, existingTimestamp?: string) {
  try {
    const file = await stat(filePath);

    return existingTimestamp ?? file.mtime.toISOString();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function buildLocalEvidenceReport(input: {
  gameweek: number;
  generatedAt: string;
  outputDir?: string;
  reportDir?: string;
  artifactTimestamp?: string;
}): Promise<EvidenceReport> {
  const outputDir = input.outputDir ?? path.join("packages", "content", "recommendations", `gw-${input.gameweek}`);
  const reportDir = input.reportDir ?? outputDir;
  const dataStatusPath = path.join(outputDir, "data-status.json");
  const fixtureTickerPath = path.join(outputDir, "fixture-ticker.json");
  const fixtureHorizonPath = path.join(outputDir, "fixture-horizon-report.json");
  const teamNewsReportPath = path.join(outputDir, "team-news-report.json");
  const setPiecesReportPath = path.join(outputDir, "set-pieces-report.json");
  const oddsReportPath = path.join(outputDir, "odds-report.json");
  const minutesRiskReportPath = path.join(outputDir, "minutes-risk-report.json");
  const publicEvidenceReportPath = path.join(outputDir, "public-evidence-report.json");
  const sources: EvidenceSourceInput[] = [
    {
      id: "fpl-data",
      label: "FPL data",
      provider: "Fantasy Premier League public API cache",
      rawPath: path.join("data", "raw", "bootstrap-static.json"),
      reportPath: path.join(reportDir, "data-status.json"),
      fetchedAt: await fileTimestamp(dataStatusPath, input.artifactTimestamp),
      maxAgeHours: 24,
      confidence: "high",
      missingMessage: "FPL data status is missing.",
      staleMessage: "FPL data status is stale."
    },
    {
      id: "fixtures",
      label: "FPL fixture ticker",
      provider: "Fantasy Premier League public API",
      rawPath: path.join("data", "raw", "fixtures.json"),
      reportPath: path.join(reportDir, "fixture-ticker.json"),
      fetchedAt: await fileTimestamp(fixtureTickerPath, input.artifactTimestamp),
      maxAgeHours: 168,
      confidence: "high",
      missingMessage: "Fixture evidence is missing.",
      staleMessage: "Fixture evidence is stale."
    },
    {
      id: "fixture-horizon",
      label: "Fixture horizon and team strength",
      provider: "Fantasy Premier League public API",
      rawPath: path.join("data", "raw", "fixtures.json"),
      reportPath: path.join(reportDir, "fixture-horizon-report.json"),
      fetchedAt: await fileTimestamp(fixtureHorizonPath, input.artifactTimestamp),
      maxAgeHours: 168,
      confidence: "medium",
      missingMessage: "Fixture horizon evidence is missing; consumers must fall back to the fixture ticker.",
      staleMessage: "Fixture horizon evidence is stale."
    },
    {
      id: "team-news",
      label: "Team news",
      provider: "Automated public team-news evidence",
      reportPath: path.join(reportDir, "team-news-report.json"),
      fetchedAt: await fileTimestamp(teamNewsReportPath, input.artifactTimestamp),
      maxAgeHours: 24,
      confidence: "medium",
      missingMessage: "Automated team-news evidence is missing.",
      staleMessage: "Automated team-news evidence is stale."
    },
    {
      id: "set-pieces",
      label: "Set pieces",
      provider: "Automated public set-piece evidence",
      reportPath: path.join(reportDir, "set-pieces-report.json"),
      fetchedAt: await fileTimestamp(setPiecesReportPath, input.artifactTimestamp),
      maxAgeHours: 168,
      confidence: "medium",
      missingMessage: "Automated set-piece evidence is missing.",
      staleMessage: "Automated set-piece evidence is stale."
    },
    {
      id: "odds",
      label: "Odds evidence",
      provider: "Automated public odds evidence",
      reportPath: path.join(reportDir, "odds-report.json"),
      fetchedAt: await fileTimestamp(oddsReportPath, input.artifactTimestamp),
      maxAgeHours: 12,
      confidence: "medium",
      missingMessage: "Automated odds evidence is missing.",
      staleMessage: "Automated odds evidence is stale."
    },
    {
      id: "minutes",
      label: "Minutes evidence",
      provider: "Automated minutes and predicted-lineup evidence",
      reportPath: path.join(reportDir, "minutes-risk-report.json"),
      fetchedAt: await fileTimestamp(minutesRiskReportPath, input.artifactTimestamp),
      maxAgeHours: 24,
      confidence: "medium",
      missingMessage: "Automated minutes evidence is missing.",
      staleMessage: "Automated minutes evidence is stale."
    },
    {
      id: "public-evidence",
      label: "Public browser evidence",
      provider: "Read-only public pages captured without API keys",
      reportPath: path.join(reportDir, "public-evidence-report.json"),
      fetchedAt: await fileTimestamp(publicEvidenceReportPath, input.artifactTimestamp),
      maxAgeHours: 12,
      confidence: "medium",
      missingMessage: "Public browser evidence is missing.",
      staleMessage: "Public browser evidence is stale."
    }
  ];

  return buildEvidenceReport({
    generatedAt: input.generatedAt,
    gameweek: input.gameweek,
    sources
  });
}
