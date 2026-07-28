import { describe, expect, it } from "vitest";
import { buildOddsReport, parseFootballDataCsv, renderOddsReportMarkdown, type EvidenceSource } from "../src";

const source: EvidenceSource = {
  id: "odds",
  label: "Football-Data fixture odds",
  provider: "Football-Data.co.uk public fixtures CSV",
  url: "https://www.football-data.co.uk/fixtures.csv",
  rawPath: "data/raw/odds/football-data-fixtures.csv",
  reportPath: "packages/content/recommendations/gw-1/odds-report.json",
  required: true,
  confidence: "medium",
  freshness: {
    status: "fresh",
    checkedAt: "2026-07-28T12:00:00.000Z",
    fetchedAt: "2026-07-28T12:00:00.000Z",
    ageHours: 0,
    maxAgeHours: 12,
    message: "Fresh."
  }
};

describe("buildOddsReport", () => {
  it("normalizes Football-Data fixture odds into team signals", () => {
    const csv = `Div,Date,Time,HomeTeam,AwayTeam,AvgH,AvgD,AvgA,Avg>2.5,Avg<2.5
E0,21/08/2026,20:00,Arsenal,Coventry,1.4,4.8,8.5,1.8,2.1
E0,22/08/2026,12:30,Hull,Man United,5.8,4.2,1.55,1.9,1.95
`;
    const report = buildOddsReport({
      generatedAt: "2026-07-28T12:00:00.000Z",
      gameweek: 1,
      source,
      csvRows: parseFootballDataCsv(csv),
      teams: [
        { id: 1, name: "Arsenal" },
        { id: 2, name: "Coventry City" },
        { id: 3, name: "Hull City" },
        { id: 4, name: "Man Utd" }
      ],
      fixtures: [
        { id: 1, event: 1, team_h: 1, team_a: 2, kickoff_time: "2026-08-21T19:00:00Z" },
        { id: 2, event: 1, team_h: 3, team_a: 4, kickoff_time: "2026-08-22T11:30:00Z" }
      ],
      selectedPlayers: [
        { id: 10, team: 1 },
        { id: 20, team: 4 }
      ]
    });

    expect(report.summary.matchedFixtures).toBe(2);
    expect(report.summary.selectedTeamsCovered).toBe(2);
    expect(report.teamSignals.find((team) => team.teamName === "Arsenal")?.cleanSheetSignal).toBe("high");
    expect(report.teamSignals.find((team) => team.teamName === "Man Utd")?.attackSignal).toBe("high");
    expect(report.warnings).toContain("Anytime scorer odds are not available from the current odds sources.");
    expect(renderOddsReportMarkdown(report)).toContain("Fixture Markets");
  });

  it("warns clearly when no gameweek fixtures match odds rows", () => {
    const report = buildOddsReport({
      generatedAt: "2026-07-28T12:00:00.000Z",
      gameweek: 1,
      source,
      csvRows: parseFootballDataCsv("Div,Date,Time,HomeTeam,AwayTeam,AvgH,AvgD,AvgA\nE0,01/09/2026,15:00,Chelsea,Fulham,1.8,3.6,4.5\n"),
      teams: [
        { id: 1, name: "Arsenal" },
        { id: 2, name: "Coventry City" }
      ],
      fixtures: [{ id: 1, event: 1, team_h: 1, team_a: 2, kickoff_time: null }]
    });

    expect(report.summary.matchedFixtures).toBe(0);
    expect(report.warnings[0]).toBe("No Football-Data Premier League odds rows matched GW1 FPL fixtures.");
  });
});
