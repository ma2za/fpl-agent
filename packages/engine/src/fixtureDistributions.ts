import type { StructureSimulationFixtureDistribution } from "./types";

export type MarketFixtureInput = {
  fixtureId: number;
  homeWinProbability: number | null;
  drawProbability: number | null;
  awayWinProbability: number | null;
  over25Probability: number | null;
  under25Probability: number | null;
  homeCleanSheetProbability: number | null;
  awayCleanSheetProbability: number | null;
  evidenceIds: string[];
};

function poisson(lambda: number, goals: number) {
  let factorial = 1;
  for (let value = 2; value <= goals; value += 1) factorial *= value;
  return Math.exp(-lambda) * lambda ** goals / factorial;
}

function modelProbabilities(homeExpectedGoals: number, awayExpectedGoals: number) {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let homeGoals = 0; homeGoals <= 12; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= 12; awayGoals += 1) {
      const probability = poisson(homeExpectedGoals, homeGoals) * poisson(awayExpectedGoals, awayGoals);
      if (homeGoals > awayGoals) home += probability;
      else if (homeGoals === awayGoals) draw += probability;
      else away += probability;
    }
  }
  const total = homeExpectedGoals + awayExpectedGoals;
  const under25 = poisson(total, 0) + poisson(total, 1) + poisson(total, 2);
  return {
    home, draw, away, over25: 1 - under25, under25,
    homeCleanSheet: Math.exp(-awayExpectedGoals),
    awayCleanSheet: Math.exp(-homeExpectedGoals)
  };
}

function fitError(input: MarketFixtureInput, homeExpectedGoals: number, awayExpectedGoals: number) {
  const model = modelProbabilities(homeExpectedGoals, awayExpectedGoals);
  const families = [
    [[input.homeWinProbability, model.home], [input.drawProbability, model.draw], [input.awayWinProbability, model.away]],
    [[input.over25Probability, model.over25], [input.under25Probability, model.under25]],
    [[input.homeCleanSheetProbability, model.homeCleanSheet], [input.awayCleanSheetProbability, model.awayCleanSheet]]
  ];
  const familyErrors = families.flatMap((family) => {
    const values = family.filter((pair): pair is [number, number] => pair[0] !== null);
    return values.length === 0 ? [] : [values.reduce((sum, [observed, expected]) => sum + (observed - expected) ** 2, 0) / values.length];
  });
  return Math.sqrt(familyErrors.reduce((sum, value) => sum + value, 0) / familyErrors.length);
}

export function fitMarketExpectedGoals(input: MarketFixtureInput) {
  const complete = [input.homeWinProbability, input.drawProbability, input.awayWinProbability,
    input.over25Probability, input.under25Probability, input.homeCleanSheetProbability, input.awayCleanSheetProbability]
    .every((value) => value !== null && value >= 0 && value <= 1);
  if (!complete) return null;
  let best = { homeExpectedGoals: 1.45, awayExpectedGoals: 1.15, rmse: Infinity };
  for (let home = 0.05; home <= 5; home += 0.05) {
    for (let away = 0.05; away <= 5; away += 0.05) {
      const rmse = fitError(input, home, away);
      if (rmse < best.rmse) best = { homeExpectedGoals: home, awayExpectedGoals: away, rmse };
    }
  }
  const coarse = best;
  for (let home = Math.max(0.01, coarse.homeExpectedGoals - 0.05); home <= coarse.homeExpectedGoals + 0.05; home += 0.005) {
    for (let away = Math.max(0.01, coarse.awayExpectedGoals - 0.05); away <= coarse.awayExpectedGoals + 0.05; away += 0.005) {
      const rmse = fitError(input, home, away);
      if (rmse < best.rmse) best = { homeExpectedGoals: home, awayExpectedGoals: away, rmse };
    }
  }
  return {
    homeExpectedGoals: Math.round(best.homeExpectedGoals * 1000) / 1000,
    awayExpectedGoals: Math.round(best.awayExpectedGoals * 1000) / 1000,
    rmse: Math.round(best.rmse * 10_000) / 10_000,
    active: best.rmse <= 0.05
  };
}

export function buildFixtureDistributions(input: {
  fixtures: Array<{ id: number; event: number | null; team_h: number; team_a: number }>;
  teams: Array<{ id: number; strength_overall_home: number; strength_overall_away: number }>;
  gameweek: number;
  leagueGoalsPerTeam?: number;
  homeAdvantage?: number;
  marketInputs?: MarketFixtureInput[];
}): StructureSimulationFixtureDistribution[] {
  const leagueGoalsPerTeam = input.leagueGoalsPerTeam ?? 1.45;
  const homeAdvantage = input.homeAdvantage ?? 1.1;
  if (!(leagueGoalsPerTeam > 0) || !(homeAdvantage > 0)) throw new Error("Fixture goal-model baselines must be positive.");
  const teams = new Map(input.teams.map((team) => [team.id, team]));
  const marketByFixture = new Map((input.marketInputs ?? []).map((market) => [market.fixtureId, market]));
  return input.fixtures.filter((fixture) => fixture.event === input.gameweek).map((fixture) => {
    const home = teams.get(fixture.team_h);
    const away = teams.get(fixture.team_a);
    if (!home || !away || home.strength_overall_home <= 0 || away.strength_overall_away <= 0) {
      throw new Error(`Fixture ${fixture.id} lacks positive FPL overall-strength inputs.`);
    }
    const relativeStrength = Math.sqrt(home.strength_overall_home / away.strength_overall_away);
    const market = marketByFixture.get(fixture.id);
    const fitted = market ? fitMarketExpectedGoals(market) : null;
    if (market && fitted?.active) {
      return {
        fixtureId: fixture.id,
        homeTeamId: fixture.team_h,
        awayTeamId: fixture.team_a,
        homeExpectedGoals: fitted.homeExpectedGoals,
        awayExpectedGoals: fitted.awayExpectedGoals,
        model: "INDEPENDENT_POISSON_FROM_EXPECTED_GOALS" as const,
        expectedGoalsMethod: "MARKET_IMPLIED_EXPECTED_GOALS" as const,
        confidence: "medium" as const,
        evidenceIds: market.evidenceIds
      };
    }
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
