import { describe, expect, it } from "vitest";
import { buildPublicEvidenceReport, renderPublicEvidenceReportMarkdown, type PublicEvidenceSourceConfig } from "../src";

const sources: PublicEvidenceSourceConfig[] = [
  {
    id: "team-news",
    label: "Team news",
    provider: "Public Source",
    url: "https://example.com/team-news",
    area: "team-news",
    required: true,
    confidence: "medium"
  },
  {
    id: "lineups",
    label: "Predicted lineups",
    provider: "Public Source",
    url: "https://example.com/lineups",
    area: "predicted-lineups",
    required: true,
    confidence: "medium"
  }
];

describe("buildPublicEvidenceReport", () => {
  it("summarizes captured public pages into evidence signals", () => {
    const report = buildPublicEvidenceReport({
      generatedAt: "2026-07-28T12:00:00.000Z",
      gameweek: 1,
      sources,
      pages: [
        {
          sourceId: "team-news",
          label: "Team news",
          provider: "Public Source",
          url: "https://example.com/team-news",
          area: "team-news",
          capturedAt: "2026-07-28T12:00:00.000Z",
          captureMode: "playwright",
          title: "Team News",
          textExcerpt: "Team news update. Midfielder is a doubt after a training knock.",
          wordCount: 10,
          rawPath: "raw.txt",
          error: null,
          confidence: "medium"
        }
      ]
    });

    expect(report.summary.configuredSources).toBe(2);
    expect(report.summary.capturedPages).toBe(1);
    expect(report.summary.failedPages).toBe(1);
    expect(report.signals.find((signal) => signal.sourceId === "team-news")?.severity).toBe("risk");
    expect(report.signals.find((signal) => signal.sourceId === "lineups")?.severity).toBe("missing");
    expect(renderPublicEvidenceReportMarkdown(report)).toContain("Public Evidence Report: GW1");
  });
});
