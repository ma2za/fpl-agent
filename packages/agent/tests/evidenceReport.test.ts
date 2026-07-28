import { describe, expect, it } from "vitest";
import { buildEvidenceReport, renderEvidenceReportMarkdown } from "../src";

describe("buildEvidenceReport", () => {
  it("summarizes fresh, stale, and missing sources", () => {
    const report = buildEvidenceReport({
      generatedAt: "2026-07-28T12:00:00.000Z",
      gameweek: 1,
      sources: [
        {
          id: "fpl-data",
          label: "FPL data",
          provider: "FPL public API",
          fetchedAt: "2026-07-28T11:00:00.000Z",
          maxAgeHours: 24,
          confidence: "high"
        },
        {
          id: "team-news",
          label: "Team news",
          provider: "Public news",
          fetchedAt: "2026-07-26T11:00:00.000Z",
          maxAgeHours: 24,
          confidence: "medium"
        },
        {
          id: "odds",
          label: "Odds",
          provider: "Public odds",
          fetchedAt: null,
          maxAgeHours: 12,
          confidence: "low"
        }
      ]
    });

    expect(report.summary.fresh).toBe(1);
    expect(report.summary.stale).toBe(1);
    expect(report.summary.missing).toBe(1);
    expect(report.warnings).toEqual(["Team news evidence is stale.", "Odds evidence is missing."]);
    expect(report.items.every((item) => "fetchedAt" in item && "confidence" in item)).toBe(true);
    expect(renderEvidenceReportMarkdown(report)).toContain("Evidence Report: GW1");
  });

  it("does not warn for optional missing sources", () => {
    const report = buildEvidenceReport({
      generatedAt: "2026-07-28T12:00:00.000Z",
      gameweek: 1,
      sources: [
        {
          id: "manual-notes",
          label: "Manual notes",
          provider: "Local context",
          required: false,
          fetchedAt: null
        }
      ]
    });

    expect(report.summary.requiredMissing).toBe(0);
    expect(report.warnings).toEqual([]);
  });
});
