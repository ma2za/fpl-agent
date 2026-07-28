import { stat } from "node:fs/promises";
import path from "node:path";
import type { EvidenceReport } from "../packages/agent/src";
import { buildEvidenceReport } from "../packages/agent/src";

type EvidenceSourceInput = Parameters<typeof buildEvidenceReport>[0]["sources"][number];

async function fileTimestamp(filePath: string) {
  try {
    const file = await stat(filePath);

    return file.mtime.toISOString();
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
}): Promise<EvidenceReport> {
  const outputDir = path.join("packages", "content", "recommendations", `gw-${input.gameweek}`);
  const dataStatusPath = path.join(outputDir, "data-status.json");
  const fixtureTickerPath = path.join(outputDir, "fixture-ticker.json");
  const premierLeagueFixturesPath = path.join(outputDir, "premier-league-fixtures.md");
  const teamNewsReportPath = path.join(outputDir, "team-news-report.json");
  const setPiecesReportPath = path.join(outputDir, "set-pieces-report.json");
  const oddsReportPath = path.join(outputDir, "odds-report.json");
  const minutesRiskReportPath = path.join(outputDir, "minutes-risk-report.json");
  const fixtureFetchedAt = await fileTimestamp(fixtureTickerPath) ?? await fileTimestamp(premierLeagueFixturesPath);
  const sources: EvidenceSourceInput[] = [
    {
      id: "fpl-data",
      label: "FPL data",
      provider: "Fantasy Premier League public API cache",
      rawPath: path.join("data", "raw", "bootstrap-static.json"),
      reportPath: dataStatusPath,
      fetchedAt: await fileTimestamp(dataStatusPath),
      maxAgeHours: 24,
      confidence: "high",
      missingMessage: "FPL data status is missing.",
      staleMessage: "FPL data status is stale."
    },
    {
      id: "fixtures",
      label: "Fixture evidence",
      provider: "FPL fixtures and Premier League fixture release",
      rawPath: path.join("data", "raw", "fixtures.json"),
      reportPath: fixtureFetchedAt === null ? null : fixtureTickerPath,
      fetchedAt: fixtureFetchedAt,
      maxAgeHours: 168,
      confidence: "high",
      missingMessage: "Fixture evidence is missing.",
      staleMessage: "Fixture evidence is stale."
    },
    {
      id: "team-news",
      label: "Team news",
      provider: "Automated public team-news evidence",
      reportPath: teamNewsReportPath,
      fetchedAt: await fileTimestamp(teamNewsReportPath),
      maxAgeHours: 24,
      confidence: "medium",
      missingMessage: "Automated team-news evidence is missing.",
      staleMessage: "Automated team-news evidence is stale."
    },
    {
      id: "set-pieces",
      label: "Set pieces",
      provider: "Automated public set-piece evidence",
      reportPath: setPiecesReportPath,
      fetchedAt: await fileTimestamp(setPiecesReportPath),
      maxAgeHours: 168,
      confidence: "medium",
      missingMessage: "Automated set-piece evidence is missing.",
      staleMessage: "Automated set-piece evidence is stale."
    },
    {
      id: "odds",
      label: "Odds evidence",
      provider: "Automated public odds evidence",
      reportPath: oddsReportPath,
      fetchedAt: await fileTimestamp(oddsReportPath),
      maxAgeHours: 12,
      confidence: "medium",
      missingMessage: "Automated odds evidence is missing.",
      staleMessage: "Automated odds evidence is stale."
    },
    {
      id: "minutes",
      label: "Minutes evidence",
      provider: "Automated minutes and predicted-lineup evidence",
      reportPath: minutesRiskReportPath,
      fetchedAt: await fileTimestamp(minutesRiskReportPath),
      maxAgeHours: 24,
      confidence: "medium",
      missingMessage: "Automated minutes evidence is missing.",
      staleMessage: "Automated minutes evidence is stale."
    }
  ];

  return buildEvidenceReport({
    generatedAt: input.generatedAt,
    gameweek: input.gameweek,
    sources
  });
}
