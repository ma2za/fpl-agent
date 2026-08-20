import type { StructureSimulationFixtureDistribution } from "./types";

export function buildFixtureDistributions(input: {
  fixtures: Array<{ id: number; event: number | null; team_h: number; team_a: number }>;
  teams: Array<{ id: number; strength_overall_home: number; strength_overall_away: number }>;
  gameweek: number;
  leagueGoalsPerTeam?: number;
  homeAdvantage?: number;
}): StructureSimulationFixtureDistribution[] {
  const leagueGoalsPerTeam = input.leagueGoalsPerTeam ?? 1.45;
  const homeAdvantage = input.homeAdvantage ?? 1.1;
  if (!(leagueGoalsPerTeam > 0) || !(homeAdvantage > 0)) throw new Error("Fixture goal-model baselines must be positive.");
  const teams = new Map(input.teams.map((team) => [team.id, team]));
  return input.fixtures.filter((fixture) => fixture.event === input.gameweek).map((fixture) => {
    const home = teams.get(fixture.team_h);
    const away = teams.get(fixture.team_a);
    if (!home || !away || home.strength_overall_home <= 0 || away.strength_overall_away <= 0) {
      throw new Error(`Fixture ${fixture.id} lacks positive FPL overall-strength inputs.`);
    }
    const relativeStrength = Math.sqrt(home.strength_overall_home / away.strength_overall_away);
    return {
      fixtureId: fixture.id,
      homeTeamId: fixture.team_h,
      awayTeamId: fixture.team_a,
      homeExpectedGoals: Math.round(leagueGoalsPerTeam * homeAdvantage * relativeStrength * 1000) / 1000,
      awayExpectedGoals: Math.round(leagueGoalsPerTeam / homeAdvantage / relativeStrength * 1000) / 1000,
      model: "INDEPENDENT_POISSON_FROM_EXPECTED_GOALS",
      expectedGoalsMethod: "FPL_OVERALL_STRENGTH_HEURISTIC_V1",
      confidence: "low",
      evidenceIds: [
        `fpl:team:${fixture.team_h}:strength_overall_home`,
        `fpl:team:${fixture.team_a}:strength_overall_away`,
        `fpl:fixture:${fixture.id}`
      ]
    };
  });
}
