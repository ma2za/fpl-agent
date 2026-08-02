import type {
  FixtureDifficultyEvidence,
  FixtureExposureInput,
  FixtureHorizonConfidence,
  FixtureHorizonCoverage,
  FixtureHorizonFixture,
  FixtureHorizonLabel,
  FixtureHorizonMetric,
  FixtureHorizonReport,
  FixtureHorizonTeam,
  TeamFixtureHorizon
} from "./types";

type TeamInput = {
  id: number;
  name: string;
  short_name?: string;
  strength_overall_home?: number | null;
  strength_overall_away?: number | null;
  strength_attack_home?: number | null;
  strength_attack_away?: number | null;
  strength_defence_home?: number | null;
  strength_defence_away?: number | null;
};

type FixtureInput = {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  kickoff_time: string | null;
  finished: boolean;
};

type BuildFixtureHorizonInput = {
  gameweek: number;
  generatedAt: string;
  teams: TeamInput[];
  fixtures: FixtureInput[];
  exposures?: FixtureExposureInput[];
};

const HORIZONS = [1, 3, 6] as const;
const FAVORABLE_MAXIMUM = 2.5;
const DIFFICULT_MINIMUM = 3.5;
const SWING_MINIMUM = 0.75;
const SHORT_REST_MAXIMUM_DAYS = 3;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function average(values: number[]) {
  return values.length === 0 ? null : round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function strengthRanks(teams: TeamInput[], field: keyof TeamInput) {
  const values = [...new Set(teams
    .map((team) => team[field])
    .filter((value): value is number => typeof value === "number" && value > 0))]
    .sort((a, b) => a - b);
  const ranks = new Map<number, number>();

  for (const [index, value] of values.entries()) {
    ranks.set(value, values.length === 1 ? 3 : round2(1 + (index / (values.length - 1)) * 4));
  }

  return ranks;
}

function lowestConfidence(values: FixtureHorizonConfidence[]) {
  if (values.includes("low")) return "low";
  if (values.includes("medium")) return "medium";
  return "high";
}

function labelFor(averageDifficulty: number | null, coverage: FixtureHorizonCoverage, blank: boolean): FixtureHorizonLabel {
  if (blank && coverage === "complete") return "blank";
  if (averageDifficulty === null) return "unavailable";
  if (averageDifficulty <= FAVORABLE_MAXIMUM) return "favorable";
  if (averageDifficulty >= DIFFICULT_MINIMUM) return "difficult";
  return "neutral";
}

function metric(fixtures: FixtureHorizonFixture[], side: "attack" | "defence", coverage: FixtureHorizonCoverage): FixtureHorizonMetric {
  const evidence = fixtures.map((fixture) => side === "attack" ? fixture.attackDifficulty : fixture.defenceDifficulty);
  const averageDifficulty = average(evidence.map((item) => item.value));

  return {
    averageDifficulty,
    label: labelFor(averageDifficulty, coverage, fixtures.length === 0),
    confidence: evidence.length === 0 ? "low" : lowestConfidence(evidence.map((item) => item.confidence)),
    coverage
  };
}

function fixtureDifficulty(input: {
  opponent: TeamInput;
  opponentVenue: "home" | "away";
  side: "attack" | "defence";
  rawDifficulty: number;
  ranks: Map<keyof TeamInput, Map<number, number>>;
}): FixtureDifficultyEvidence {
  const splitField = `strength_${input.side === "attack" ? "defence" : "attack"}_${input.opponentVenue}` as keyof TeamInput;
  const splitValue = input.opponent[splitField];

  if (typeof splitValue === "number" && splitValue > 0) {
    return {
      value: input.ranks.get(splitField)?.get(splitValue) ?? input.rawDifficulty,
      rawValue: splitValue,
      source: "fpl-team-strength",
      confidence: "medium"
    };
  }

  const overallField = `strength_overall_${input.opponentVenue}` as keyof TeamInput;
  const overallValue = input.opponent[overallField];

  if (typeof overallValue === "number" && overallValue > 0) {
    return {
      value: input.ranks.get(overallField)?.get(overallValue) ?? input.rawDifficulty,
      rawValue: overallValue,
      source: "fpl-overall-strength-fallback",
      confidence: "low"
    };
  }

  return {
    value: input.rawDifficulty,
    rawValue: input.rawDifficulty,
    source: "fpl-fixture-difficulty-fallback",
    confidence: "low"
  };
}

function restDays(a: string | null, b: string | null) {
  if (!a || !b) return null;
  const difference = (Date.parse(b) - Date.parse(a)) / 86_400_000;
  return Number.isFinite(difference) && difference >= 0 ? round2(difference) : null;
}

function swing(opening: number | null, closing: number | null) {
  if (opening === null || closing === null) {
    return { direction: "unavailable" as const, change: null };
  }

  const change = round2(closing - opening);
  return {
    direction: change <= -SWING_MINIMUM ? "in" as const : change >= SWING_MINIMUM ? "out" as const : "stable" as const,
    change
  };
}

export function buildFixtureHorizonReport(input: BuildFixtureHorizonInput): FixtureHorizonReport {
  const teamById = new Map(input.teams.map((team) => [team.id, team]));
  const rankFields: Array<keyof TeamInput> = [
    "strength_overall_home", "strength_overall_away",
    "strength_attack_home", "strength_attack_away",
    "strength_defence_home", "strength_defence_away"
  ];
  const ranks = new Map(rankFields.map((field) => [field, strengthRanks(input.teams, field)]));
  const fixturesByTeam = new Map<number, FixtureInput[]>();
  for (const fixture of input.fixtures) {
    const homeFixtures = fixturesByTeam.get(fixture.team_h) ?? [];
    homeFixtures.push(fixture);
    fixturesByTeam.set(fixture.team_h, homeFixtures);
    const awayFixtures = fixturesByTeam.get(fixture.team_a) ?? [];
    awayFixtures.push(fixture);
    fixturesByTeam.set(fixture.team_a, awayFixtures);
  }
  let fallbackCount = 0;
  let unresolvedCount = 0;

  const teams = input.teams.map((team): FixtureHorizonTeam => {
    const teamFixtures = fixturesByTeam.get(team.id) ?? [];
    const knownKickoffs = teamFixtures
      .filter((fixture) => fixture.kickoff_time !== null)
      .sort((a, b) => Date.parse(a.kickoff_time!) - Date.parse(b.kickoff_time!) || a.id - b.id);
    const kickoffIndex = new Map(knownKickoffs.map((fixture, index) => [fixture.id, index]));
    const componentById = new Map<number, FixtureHorizonFixture>();

    const component = (fixture: FixtureInput): FixtureHorizonFixture => {
      const existing = componentById.get(fixture.id);
      if (existing) return existing;
      const home = fixture.team_h === team.id;
      const opponentTeamId = home ? fixture.team_a : fixture.team_h;
      const opponent = teamById.get(opponentTeamId) ?? { id: opponentTeamId, name: `Team ${opponentTeamId}` };
      const rawDifficulty = home ? fixture.team_h_difficulty : fixture.team_a_difficulty;
      const opponentVenue = home ? "away" as const : "home" as const;
      const attackDifficulty = fixtureDifficulty({ opponent, opponentVenue, side: "attack", rawDifficulty, ranks });
      const defenceDifficulty = fixtureDifficulty({ opponent, opponentVenue, side: "defence", rawDifficulty, ranks });
      const index = kickoffIndex.get(fixture.id);
      const restDaysBefore = index === undefined ? null : restDays(knownKickoffs[index - 1]?.kickoff_time ?? null, fixture.kickoff_time);
      const restDaysAfter = index === undefined ? null : restDays(fixture.kickoff_time, knownKickoffs[index + 1]?.kickoff_time ?? null);

      if (attackDifficulty.source !== "fpl-team-strength" || defenceDifficulty.source !== "fpl-team-strength") fallbackCount += 1;

      const result: FixtureHorizonFixture = {
        fixtureId: fixture.id,
        event: fixture.event!,
        opponentTeamId,
        opponentName: opponent.name,
        venue: home ? "H" : "A",
        kickoffTime: fixture.kickoff_time,
        state: fixture.finished ? "finished" : fixture.kickoff_time ? "scheduled" : "unresolved",
        rawDifficulty,
        attackDifficulty,
        defenceDifficulty,
        restDaysBefore,
        restDaysAfter,
        shortRest: [restDaysBefore, restDaysAfter].some((days) => days !== null && days <= SHORT_REST_MAXIMUM_DAYS)
      };
      componentById.set(fixture.id, result);
      return result;
    };

    const buildHorizon = (startGameweek: number, gameweeks: 1 | 3 | 6): TeamFixtureHorizon => {
      const endGameweek = startGameweek + gameweeks - 1;
      const fixtures = teamFixtures
        .filter((fixture) => fixture.event !== null && fixture.event >= startGameweek && fixture.event <= endGameweek)
        .map(component)
        .sort((a, b) => a.event - b.event || (a.kickoffTime ?? "").localeCompare(b.kickoffTime ?? "") || a.fixtureId - b.fixtureId);
      const counts = new Map<number, number>();
      for (const fixture of fixtures) counts.set(fixture.event, (counts.get(fixture.event) ?? 0) + 1);
      const blankGameweeks = Array.from({ length: gameweeks }, (_, index) => startGameweek + index)
        .filter((gameweek) => !counts.has(gameweek));
      const doubleGameweeks = [...counts].filter(([, count]) => count > 1).map(([gameweek]) => gameweek);
      const unresolvedFixtureCount = fixtures.filter((fixture) => fixture.state === "unresolved").length;
      const coverage: FixtureHorizonCoverage = unresolvedFixtureCount > 0
        ? fixtures.length > 0 ? "partial" : "missing"
        : "complete";

      return {
        gameweeks,
        startGameweek,
        endGameweek,
        fixtures,
        fixtureCount: fixtures.length,
        blankGameweeks,
        doubleGameweeks,
        unresolvedFixtureCount,
        shortRestCount: fixtures.filter((fixture) => fixture.shortRest).length,
        attack: metric(fixtures, "attack", coverage),
        defence: metric(fixtures, "defence", coverage)
      };
    };

    const horizons = HORIZONS.map((gameweeks) => buildHorizon(input.gameweek, gameweeks));
    const closing = buildHorizon(input.gameweek + 3, 3);
    const opening = horizons.find((horizon) => horizon.gameweeks === 3)!;
    const unresolvedFixtures = teamFixtures
      .filter((fixture) => fixture.event === null || fixture.kickoff_time === null)
      .map((fixture) => {
        const opponentTeamId = fixture.team_h === team.id ? fixture.team_a : fixture.team_h;
        return {
          fixtureId: fixture.id,
          opponentTeamId,
          opponentName: teamById.get(opponentTeamId)?.name ?? `Team ${opponentTeamId}`,
          kickoffTime: fixture.kickoff_time,
          reason: fixture.event === null ? "event-unassigned" as const : "kickoff-missing" as const
        };
      })
      .sort((a, b) => a.fixtureId - b.fixtureId);
    unresolvedCount += unresolvedFixtures.length;
    const attackSwing = swing(opening.attack.averageDifficulty, closing.attack.averageDifficulty);
    const defenceSwing = swing(opening.defence.averageDifficulty, closing.defence.averageDifficulty);

    return {
      teamId: team.id,
      teamName: team.name,
      shortName: team.short_name ?? team.name,
      horizons,
      unresolvedFixtures,
      swing: {
        attack: opening.attack.coverage === "complete" && closing.attack.coverage === "complete" ? attackSwing.direction : "unavailable",
        attackChange: opening.attack.coverage === "complete" && closing.attack.coverage === "complete" ? attackSwing.change : null,
        defence: opening.defence.coverage === "complete" && closing.defence.coverage === "complete" ? defenceSwing.direction : "unavailable",
        defenceChange: opening.defence.coverage === "complete" && closing.defence.coverage === "complete" ? defenceSwing.change : null
      }
    };
  }).sort((a, b) => a.teamName.localeCompare(b.teamName));

  const teamReportById = new Map(teams.map((team) => [team.teamId, team]));
  const exposures = [...(input.exposures ?? [])]
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label))
    .map((exposure) => ({
      label: exposure.label,
      kind: exposure.kind,
      playerCount: exposure.players.length,
      positionCounts: {
        GKP: exposure.players.filter((player) => player.position === "GKP").length,
        DEF: exposure.players.filter((player) => player.position === "DEF").length,
        MID: exposure.players.filter((player) => player.position === "MID").length,
        FWD: exposure.players.filter((player) => player.position === "FWD").length
      },
      horizons: HORIZONS.map((gameweeks) => {
        const attackValues = exposure.players
          .filter((player) => player.position === "MID" || player.position === "FWD")
          .map((player) => teamReportById.get(player.teamId)?.horizons.find((horizon) => horizon.gameweeks === gameweeks)?.attack.averageDifficulty ?? null);
        const defenceValues = exposure.players
          .filter((player) => player.position === "GKP" || player.position === "DEF")
          .map((player) => teamReportById.get(player.teamId)?.horizons.find((horizon) => horizon.gameweeks === gameweeks)?.defence.averageDifficulty ?? null);
        const values = [...attackValues, ...defenceValues];
        const present = values.filter((value): value is number => value !== null);
        const coverage: FixtureHorizonCoverage = present.length === 0 ? "missing" : present.length === values.length ? "complete" : "partial";

        return {
          gameweeks,
          attackAverage: average(attackValues.filter((value): value is number => value !== null)),
          defenceAverage: average(defenceValues.filter((value): value is number => value !== null)),
          coverage
        };
      })
    }));

  const warnings: string[] = [];
  if (fallbackCount > 0) warnings.push(`${fallbackCount} team-fixture rows use overall-strength or raw-FDR fallback evidence.`);
  if (unresolvedCount > 0) warnings.push(`${unresolvedCount} team-fixture rows have an unassigned event or missing kickoff time.`);

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    gameweek: input.gameweek,
    source: {
      provider: "Fantasy Premier League public API",
      fixturesUrl: "https://fantasy.premierleague.com/api/fixtures/",
      teamsUrl: "https://fantasy.premierleague.com/api/bootstrap-static/",
      schedulePolicy: "fpl-primary-no-silent-merge"
    },
    thresholds: {
      favorableMaximum: FAVORABLE_MAXIMUM,
      difficultMinimum: DIFFICULT_MINIMUM,
      swingMinimum: SWING_MINIMUM,
      shortRestMaximumDays: SHORT_REST_MAXIMUM_DAYS
    },
    teams,
    exposures,
    warnings
  };
}

function metricText(metric: FixtureHorizonMetric) {
  return metric.averageDifficulty === null
    ? `${metric.label} (${metric.coverage})`
    : `${metric.averageDifficulty.toFixed(2)} ${metric.label} (${metric.confidence})`;
}

export function renderFixtureHorizonMarkdown(report: FixtureHorizonReport) {
  const rows = report.teams.map((team) => {
    const horizons = new Map(team.horizons.map((horizon) => [horizon.gameweeks, horizon]));
    const one = horizons.get(1)!;
    const three = horizons.get(3)!;
    const six = horizons.get(6)!;
    return `| ${team.teamName} | ${metricText(one.attack)} | ${metricText(one.defence)} | ${metricText(three.attack)} | ${metricText(three.defence)} | ${metricText(six.attack)} | ${metricText(six.defence)} | ${team.swing.attack}/${team.swing.defence} | ${six.blankGameweeks.join(", ") || "-"} | ${six.doubleGameweeks.join(", ") || "-"} | ${six.shortRestCount} |`;
  });
  const exposureRows = report.exposures.map((exposure) => {
    const horizons = new Map(exposure.horizons.map((horizon) => [horizon.gameweeks, horizon]));
    const value = (gameweeks: 1 | 3 | 6) => {
      const horizon = horizons.get(gameweeks)!;
      return `A ${horizon.attackAverage ?? "n/a"} / D ${horizon.defenceAverage ?? "n/a"} (${horizon.coverage})`;
    };
    return `| ${exposure.label} | ${exposure.kind} | ${exposure.playerCount} | ${value(1)} | ${value(3)} | ${value(6)} |`;
  });

  return `# Fixture Horizon: GW${report.gameweek}-GW${report.gameweek + 5}

Generated: ${report.generatedAt}

FPL fixtures are the primary schedule. Official Premier League fixture-release evidence is not silently merged. Attack and defence strength use venue-specific FPL split fields when populated, then venue-specific overall strength, then raw FPL fixture difficulty. Zero strength values are unavailable evidence.

Thresholds: favorable <= ${report.thresholds.favorableMaximum}; difficult >= ${report.thresholds.difficultMinimum}; swing >= ${report.thresholds.swingMinimum}; short rest <= ${report.thresholds.shortRestMaximumDays} days.

| Team | 1GW attack | 1GW defence | 3GW attack | 3GW defence | 6GW attack | 6GW defence | Swing A/D | Blanks | Doubles | Short rest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: |
${rows.join("\n")}

## Squad and Variant Exposure

| Selection | Kind | Players | 1GW | 3GW | 6GW |
| --- | --- | ---: | --- | --- | --- |
${exposureRows.length > 0 ? exposureRows.join("\n") : "| None | - | 0 | n/a | n/a | n/a |"}

## Warnings

${report.warnings.length > 0 ? report.warnings.map((warning) => `- ${warning}`).join("\n") : "- None."}
`;
}
