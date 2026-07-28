import { describe, expect, it } from "vitest";
import { buildTeamNewsReport, renderTeamNewsReportMarkdown, type EvidenceSource } from "../src";

const source: EvidenceSource = {
  id: "team-news",
  label: "FPL availability",
  provider: "Fantasy Premier League public API cache",
  url: null,
  rawPath: "data/raw/bootstrap-static.json",
  reportPath: "packages/content/recommendations/gw-1/team-news-report.json",
  required: true,
  confidence: "high",
  freshness: {
    status: "fresh",
    checkedAt: "2026-07-28T12:00:00.000Z",
    fetchedAt: "2026-07-28T11:00:00.000Z",
    ageHours: 1,
    maxAgeHours: 24,
    message: "FPL availability is fresh."
  }
};

describe("buildTeamNewsReport", () => {
  it("normalizes FPL availability flags", () => {
    const report = buildTeamNewsReport({
      generatedAt: "2026-07-28T12:00:00.000Z",
      gameweek: 1,
      source,
      selectedPlayerIds: [2],
      teams: [{ id: 1, name: "Arsenal" }],
      elementTypes: [{ id: 3, singular_name_short: "MID" }],
      players: [
        {
          id: 1,
          first_name: "Available",
          second_name: "Player",
          web_name: "Available",
          element_type: 3,
          team: 1,
          status: "a",
          chance_of_playing_next_round: null,
          chance_of_playing_this_round: null,
          news: "",
          news_added: null
        },
        {
          id: 2,
          first_name: "Doubtful",
          second_name: "Player",
          web_name: "Doubtful",
          element_type: 3,
          team: 1,
          status: "d",
          chance_of_playing_next_round: 75,
          chance_of_playing_this_round: 75,
          news: "Knock - 75% chance of playing",
          news_added: "2026-07-28T09:00:00Z"
        },
        {
          id: 3,
          first_name: "Suspended",
          second_name: "Player",
          web_name: "Suspended",
          element_type: 3,
          team: 1,
          status: "s",
          chance_of_playing_next_round: 0,
          chance_of_playing_this_round: 0,
          news: "Suspended until 29 Aug",
          news_added: "2026-07-28T09:00:00Z"
        }
      ]
    });

    expect(report.summary.flaggedPlayers).toBe(2);
    expect(report.summary.watch).toBe(1);
    expect(report.summary.avoid).toBe(1);
    expect(report.summary.selectedFlaggedPlayers).toBe(1);
    expect(report.items[0].webName).toBe("Suspended");
    expect(renderTeamNewsReportMarkdown(report)).toContain("Selected Squad Flags");
  });
});
