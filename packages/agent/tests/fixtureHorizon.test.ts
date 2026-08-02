import { describe, expect, it } from "vitest";
import { buildFixtureHorizonReport, renderFixtureHorizonMarkdown } from "../src";

const teams = [
  {
    id: 1,
    name: "Alpha",
    short_name: "ALP",
    strength_overall_home: 4,
    strength_overall_away: 3,
    strength_attack_home: 90,
    strength_attack_away: 70,
    strength_defence_home: 80,
    strength_defence_away: 60
  },
  {
    id: 2,
    name: "Beta",
    short_name: "BET",
    strength_overall_home: 2,
    strength_overall_away: 2,
    strength_attack_home: 30,
    strength_attack_away: 20,
    strength_defence_home: 40,
    strength_defence_away: 60
  },
  {
    id: 3,
    name: "Promoted",
    short_name: "PRO",
    strength_overall_home: 1,
    strength_overall_away: 1,
    strength_attack_home: 0,
    strength_attack_away: 0,
    strength_defence_home: 0,
    strength_defence_away: 0
  }
];

function fixture(id: number, event: number | null, home: number, away: number, kickoff: string | null, homeDifficulty = 2, awayDifficulty = 4) {
  return {
    id,
    event,
    team_h: home,
    team_a: away,
    team_h_difficulty: homeDifficulty,
    team_a_difficulty: awayDifficulty,
    kickoff_time: kickoff,
    finished: false
  };
}

describe("buildFixtureHorizonReport", () => {
  it("separates venue-specific attack and defence strength across fixed horizons", () => {
    const report = buildFixtureHorizonReport({
      gameweek: 1,
      generatedAt: "2026-08-01T00:00:00.000Z",
      teams,
      fixtures: [
        fixture(1, 1, 1, 2, "2026-08-15T12:00:00Z"),
        fixture(2, 2, 2, 1, "2026-08-22T12:00:00Z", 3, 3),
        fixture(3, 4, 1, 3, "2026-09-05T12:00:00Z"),
        fixture(4, 5, 2, 1, "2026-09-08T12:00:00Z", 4, 2),
        fixture(5, 6, 1, 2, "2026-09-12T12:00:00Z")
      ]
    });
    const alpha = report.teams.find((team) => team.teamId === 1)!;

    expect(alpha.horizons.map((horizon) => horizon.gameweeks)).toEqual([1, 3, 6]);
    expect(alpha.horizons[0].attack.averageDifficulty).not.toBe(alpha.horizons[0].defence.averageDifficulty);
    expect(alpha.horizons[1].blankGameweeks).toEqual([3]);
    expect(alpha.horizons[2].shortRestCount).toBeGreaterThan(0);
    expect(alpha.horizons[0].fixtures[0].attackDifficulty.source).toBe("fpl-team-strength");
    expect(alpha.horizons[0].fixtures[0].defenceDifficulty.source).toBe("fpl-team-strength");
    expect(alpha.swing.attack).not.toBe("unavailable");
  });

  it("uses overall strength and raw FDR fallbacks without treating zero as strength", () => {
    const report = buildFixtureHorizonReport({
      gameweek: 1,
      generatedAt: "2026-08-01T00:00:00.000Z",
      teams: [teams[0], teams[2], { id: 4, name: "Unknown", short_name: "UNK" }],
      fixtures: [
        fixture(1, 1, 1, 3, "2026-08-15T12:00:00Z"),
        fixture(2, 2, 1, 4, "2026-08-22T12:00:00Z", 3, 3)
      ]
    });
    const fixtures = report.teams.find((team) => team.teamId === 1)!.horizons[2].fixtures;

    expect(fixtures[0].attackDifficulty).toMatchObject({ source: "fpl-overall-strength-fallback", confidence: "low" });
    expect(fixtures[1].attackDifficulty).toMatchObject({ source: "fpl-fixture-difficulty-fallback", confidence: "low", value: 3 });
    expect(report.warnings[0]).toContain("fallback");
  });

  it("keeps doubles, unresolved schedules, deterministic ordering, and exposure visible", () => {
    const input = {
      gameweek: 1,
      generatedAt: "2026-08-01T00:00:00.000Z",
      teams,
      fixtures: [
        fixture(2, 1, 1, 3, null),
        fixture(1, 1, 1, 2, "2026-08-15T12:00:00Z"),
        fixture(3, null, 2, 1, null)
      ],
      exposures: [{
        label: "balanced",
        kind: "variant" as const,
        players: [
          { playerId: 1, teamId: 1, position: "DEF" as const },
          { playerId: 2, teamId: 2, position: "FWD" as const }
        ]
      }]
    };
    const first = buildFixtureHorizonReport(input);
    const second = buildFixtureHorizonReport(input);
    const alpha = first.teams.find((team) => team.teamId === 1)!;

    expect(first).toEqual(second);
    expect(alpha.horizons[0].doubleGameweeks).toEqual([1]);
    expect(alpha.horizons[0].attack.coverage).toBe("partial");
    expect(alpha.unresolvedFixtures.map((fixture) => fixture.fixtureId)).toEqual([2, 3]);
    expect(first.exposures[0]).toMatchObject({ label: "balanced", playerCount: 2 });
    expect(renderFixtureHorizonMarkdown(first)).toContain("Squad and Variant Exposure");
  });

  it("uses stable rank normalization for tied strengths", () => {
    const tied = teams.map((team) => ({
      ...team,
      strength_attack_home: 50,
      strength_attack_away: 50,
      strength_defence_home: 50,
      strength_defence_away: 50
    }));
    const report = buildFixtureHorizonReport({
      gameweek: 1,
      generatedAt: "2026-08-01T00:00:00.000Z",
      teams: tied,
      fixtures: [fixture(1, 1, 1, 2, "2026-08-15T12:00:00Z")]
    });

    expect(report.teams.find((team) => team.teamId === 1)!.horizons[0].attack.averageDifficulty).toBe(3);
  });
});
