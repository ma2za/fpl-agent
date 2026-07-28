import { describe, expect, it } from "vitest";
import { buildSetPieceReport, renderSetPieceReportMarkdown, type EvidenceSource } from "../src";

const source: EvidenceSource = {
  id: "set-pieces",
  label: "FPL set pieces",
  provider: "Fantasy Premier League public API cache",
  url: null,
  rawPath: "data/raw/bootstrap-static.json",
  reportPath: "packages/content/recommendations/gw-1/set-pieces-report.json",
  required: true,
  confidence: "high",
  freshness: {
    status: "fresh",
    checkedAt: "2026-07-28T12:00:00.000Z",
    fetchedAt: "2026-07-28T11:00:00.000Z",
    ageHours: 1,
    maxAgeHours: 168,
    message: "FPL set pieces are fresh."
  }
};

describe("buildSetPieceReport", () => {
  it("normalizes set-piece order fields", () => {
    const report = buildSetPieceReport({
      generatedAt: "2026-07-28T12:00:00.000Z",
      gameweek: 1,
      source,
      selectedPlayerIds: [1],
      teams: [{ id: 1, name: "Arsenal" }],
      elementTypes: [{ id: 3, singular_name_short: "MID" }],
      players: [
        {
          id: 1,
          first_name: "Bukayo",
          second_name: "Saka",
          web_name: "Saka",
          element_type: 3,
          team: 1,
          status: "a",
          penalties_order: 1,
          direct_freekicks_order: 2,
          corners_and_indirect_freekicks_order: 6
        },
        {
          id: 2,
          first_name: "Declan",
          second_name: "Rice",
          web_name: "Rice",
          element_type: 3,
          team: 1,
          status: "a",
          penalties_order: null,
          direct_freekicks_order: 1,
          corners_and_indirect_freekicks_order: null
        }
      ]
    });

    expect(report.summary.rolePlayers).toBe(2);
    expect(report.summary.selectedRolePlayers).toBe(1);
    expect(report.summary.penaltyTakers).toBe(1);
    expect(report.items.find((item) => item.playerId === 1 && item.role === "penalties")?.confidence).toBe("high");
    expect(renderSetPieceReportMarkdown(report)).toContain("Selected Squad Roles");
  });
});
