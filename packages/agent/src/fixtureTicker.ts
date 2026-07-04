import type { FixtureTicker, FixtureTickerFixture, FixtureTickerTeam } from "./types";

type TeamInput = {
  id: number;
  name: string;
  short_name?: string;
};

type FixtureInput = {
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  kickoff_time: string | null;
  finished: boolean;
};

type BuildFixtureTickerInput = {
  gameweek: number;
  horizon: number;
  generatedAt: string;
  teams: TeamInput[];
  fixtures: FixtureInput[];
};

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function teamFixture(fixture: FixtureInput, teamId: number, teamNameById: Map<number, string>): FixtureTickerFixture {
  const isHome = fixture.team_h === teamId;
  const opponentTeamId = isHome ? fixture.team_a : fixture.team_h;

  return {
    event: fixture.event ?? 0,
    opponentTeamId,
    opponentName: teamNameById.get(opponentTeamId) ?? `Team ${opponentTeamId}`,
    venue: isHome ? "H" : "A",
    difficulty: isHome ? fixture.team_h_difficulty : fixture.team_a_difficulty,
    kickoffTime: fixture.kickoff_time,
    finished: fixture.finished
  };
}

export function buildFixtureTicker(input: BuildFixtureTickerInput): FixtureTicker {
  const finalGameweek = input.gameweek + input.horizon - 1;
  const teamNameById = new Map(input.teams.map((team) => [team.id, team.name]));
  const teams: FixtureTickerTeam[] = input.teams.map((team) => {
    const teamFixtures = input.fixtures
      .filter((fixture) => fixture.event !== null)
      .filter((fixture) => fixture.event! >= input.gameweek && fixture.event! <= finalGameweek)
      .filter((fixture) => fixture.team_h === team.id || fixture.team_a === team.id)
      .map((fixture) => teamFixture(fixture, team.id, teamNameById))
      .sort((a, b) => a.event - b.event || a.difficulty - b.difficulty);
    const fixturesByEvent = new Map<number, number>();

    for (const fixture of teamFixtures) {
      fixturesByEvent.set(fixture.event, (fixturesByEvent.get(fixture.event) ?? 0) + 1);
    }

    const blankCount = Array.from({ length: input.horizon }, (_, index) => input.gameweek + index)
      .filter((event) => !fixturesByEvent.has(event)).length;
    const doubleCount = [...fixturesByEvent.values()].filter((count) => count > 1).length;
    const difficultySum = teamFixtures.reduce((sum, fixture) => sum + fixture.difficulty, 0);

    return {
      teamId: team.id,
      teamName: team.name,
      shortName: team.short_name ?? team.name,
      fixtures: teamFixtures,
      fixtureCount: teamFixtures.length,
      blankCount,
      doubleCount,
      averageDifficulty: teamFixtures.length > 0 ? round1(difficultySum / teamFixtures.length) : null,
      difficultySum
    };
  });

  return {
    gameweek: input.gameweek,
    horizon: input.horizon,
    generatedAt: input.generatedAt,
    teams: teams.sort((a, b) => {
      if (a.averageDifficulty === null && b.averageDifficulty === null) {
        return a.teamName.localeCompare(b.teamName);
      }

      if (a.averageDifficulty === null) {
        return 1;
      }

      if (b.averageDifficulty === null) {
        return -1;
      }

      return a.averageDifficulty - b.averageDifficulty || a.difficultySum - b.difficultySum || a.teamName.localeCompare(b.teamName);
    })
  };
}

export function renderFixtureTickerMarkdown(ticker: FixtureTicker) {
  const rows = ticker.teams.map((team) => {
    const fixtures = team.fixtures
      .map((fixture) => `${fixture.event}: ${fixture.opponentName} (${fixture.venue}, ${fixture.difficulty})`)
      .join("; ");

    return `| ${team.teamName} | ${team.averageDifficulty ?? "n/a"} | ${team.fixtureCount} | ${team.blankCount} | ${team.doubleCount} | ${fixtures || "No fixtures"} |`;
  });

  return `# Fixture Ticker: GW${ticker.gameweek}-GW${ticker.gameweek + ticker.horizon - 1}

Generated: ${ticker.generatedAt}

Difficulty uses the public FPL fixture difficulty value from the team perspective.

| Team | Avg difficulty | Fixtures | Blanks | Doubles | Run |
| --- | ---: | ---: | ---: | ---: | --- |
${rows.join("\n")}
`;
}
