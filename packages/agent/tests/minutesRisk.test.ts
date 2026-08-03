import { describe, expect, it } from "vitest";
import { buildMinutesRiskReport, renderMinutesRiskReportMarkdown, type EvidenceSource } from "../src";

const source: EvidenceSource = {
  id: "minutes",
  label: "FPL historical minutes",
  provider: "Fantasy Premier League public API cache",
  url: null,
  rawPath: "data/raw/bootstrap-static.json",
  reportPath: "packages/content/recommendations/gw-1/minutes-risk-report.json",
  required: true,
  confidence: "medium",
  freshness: {
    status: "fresh",
    checkedAt: "2026-07-28T12:00:00.000Z",
    fetchedAt: "2026-07-28T11:00:00.000Z",
    ageHours: 1,
    maxAgeHours: 24,
    message: "Fresh."
  }
};

describe("buildMinutesRiskReport", () => {
  it("classifies selected players from historical minutes and availability", () => {
    const report = buildMinutesRiskReport({
      generatedAt: "2026-07-28T12:00:00.000Z",
      gameweek: 1,
      source,
      selectedPlayerIds: [1, 2, 3],
      startingPlayerIds: [1, 2],
      benchOrder: [3],
      teams: [{ id: 1, name: "Arsenal" }],
      elementTypes: [
        { id: 2, singular_name_short: "DEF" },
        { id: 3, singular_name_short: "MID" }
      ],
      players: [
        {
          id: 1,
          first_name: "Secure",
          second_name: "Starter",
          web_name: "Secure",
          element_type: 2,
          team: 1,
          status: "a",
          minutes: 3000
        },
        {
          id: 2,
          first_name: "Watch",
          second_name: "Starter",
          web_name: "Watch",
          element_type: 3,
          team: 1,
          status: "a",
          minutes: 1500
        },
        {
          id: 3,
          first_name: "Unknown",
          second_name: "Bench",
          web_name: "Unknown",
          element_type: 3,
          team: 1,
          status: "a",
          minutes: 0
        }
      ]
    });

    expect(report.summary.secure).toBe(1);
    expect(report.summary.watch).toBe(1);
    expect(report.summary.unknown).toBe(1);
    expect(report.summary.starterWatchOrWorse).toBe(1);
    expect(report.warnings).toContain("Predicted-lineup evidence is unavailable; minutes risk uses historical FPL minutes and availability only.");
    expect(renderMinutesRiskReportMarkdown(report)).toContain("Watch Or Worse");
  });

  it("marks unavailable players as risky", () => {
    const report = buildMinutesRiskReport({
      generatedAt: "2026-07-28T12:00:00.000Z",
      gameweek: 1,
      source,
      selectedPlayerIds: [1],
      startingPlayerIds: [1],
      teams: [{ id: 1, name: "Arsenal" }],
      elementTypes: [{ id: 3, singular_name_short: "MID" }],
      players: [
        {
          id: 1,
          first_name: "Injured",
          second_name: "Player",
          web_name: "Injured",
          element_type: 3,
          team: 1,
          status: "i",
          chance_of_playing_next_round: 0,
          news: "Injured",
          minutes: 3000
        }
      ]
    });

    expect(report.items[0]?.riskLevel).toBe("risky");
    expect(report.items[0]?.historicalConfidence).toBe("low");
  });

  it("uses coding-agent-reviewed predicted lineups for zero-history and omitted players", () => {
    const report = buildMinutesRiskReport({
      generatedAt: "2026-08-03T12:00:00.000Z",
      gameweek: 1,
      source,
      selectedPlayerIds: [1, 2],
      startingPlayerIds: [1],
      teams: [{ id: 1, name: "Ipswich Town" }],
      elementTypes: [{ id: 2, singular_name_short: "DEF" }],
      players: [
        { id: 1, first_name: "Predicted", second_name: "Starter", web_name: "Starter", element_type: 2, team: 1, status: "a", minutes: 0 },
        { id: 2, first_name: "Predicted", second_name: "Backup", web_name: "Backup", element_type: 2, team: 1, status: "a", minutes: 3000 }
      ],
      predictedLineups: [
        { playerId: 1, dimension: "predicted_lineup_consensus", signal: "supports_start", value: true, observedAt: "2026-08-03T11:00:00.000Z", sourceReliability: 0.75, credibility: { score: 0.75, label: "medium", rationale: "Specialist forecast." }, note: "Predicted to start." },
        { playerId: 2, dimension: "predicted_lineup_consensus", signal: "opposes_start", value: false, observedAt: "2026-08-03T11:00:00.000Z", sourceReliability: 0.75, credibility: { score: 0.75, label: "medium", rationale: "Specialist forecast." }, note: "Omitted from the predicted XI." }
      ]
    });

    expect(report.items.find((item) => item.playerId === 1)?.riskLevel).toBe("watch");
    expect(report.items.find((item) => item.playerId === 2)?.riskLevel).toBe("risky");
    expect(report.items[0]?.predictedLineupConfidence).toBe("medium");
    expect(report.warnings).not.toContain("Predicted-lineup evidence is unavailable; minutes risk uses historical FPL minutes and availability only.");
  });
});
