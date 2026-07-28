import type {
  EvidenceConfidence,
  EvidenceSource,
  OddsCoverageStatus,
  OddsMarketCoverage,
  OddsMatchSignal,
  OddsPlayerSignal,
  OddsReport,
  OddsSignal,
  OddsSignalSource,
  OddsTeamSignal
} from "./types";

type FootballDataRow = Record<string, string>;

type TeamInput = {
  id: number;
  name: string;
};

type FixtureInput = {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  kickoff_time: string | null;
};

type PlayerInput = {
  id: number;
  team: number;
};

type BuildOddsReportInput = {
  generatedAt: string;
  gameweek: number;
  source: EvidenceSource;
  csvRows: FootballDataRow[];
  snapshot?: PublicOddsSnapshot | null;
  teams: TeamInput[];
  fixtures: FixtureInput[];
  selectedPlayers?: PlayerInput[];
};

export type PublicOddsSnapshot = {
  provider: string;
  fetchedAt?: string;
  matches: Array<{
    homeTeam: string;
    awayTeam: string;
    homeWinProbability?: number | null;
    drawProbability?: number | null;
    awayWinProbability?: number | null;
    over25Probability?: number | null;
    under25Probability?: number | null;
    homeCleanSheetProbability?: number | null;
    awayCleanSheetProbability?: number | null;
    homeTeamGoalsExpected?: number | null;
    awayTeamGoalsExpected?: number | null;
    anytimeScorer?: Array<{
      playerId?: number | null;
      playerName: string;
      team: string;
      probability: number;
    }>;
  }>;
};

const aliases = new Map([
  ["brighton and hove albion", "brighton"],
  ["brighton hove albion", "brighton"],
  ["coventry city", "coventry"],
  ["hull city", "hull"],
  ["man utd", "man united"],
  ["manchester utd", "man united"],
  ["manchester united", "man united"],
  ["nottm forest", "nottingham forest"],
  ["nott'm forest", "nottingham forest"],
  ["notts forest", "nottingham forest"],
  ["spurs", "tottenham"],
  ["tottenham hotspur", "tottenham"]
]);

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"" && quoted && next === "\"") {
      value += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      values.push(value);
      value = "";
      continue;
    }

    value += char;
  }

  values.push(value);

  return values;
}

export function parseFootballDataCsv(csv: string) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = parseCsvLine(lines[0] ?? "");

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);

    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function teamKey(name: string) {
  const key = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return aliases.get(key) ?? key;
}

function numberValue(row: FootballDataRow, fields: string[]) {
  for (const field of fields) {
    const value = Number(row[field]);

    if (Number.isFinite(value) && value > 1) {
      return value;
    }
  }

  return null;
}

function normalizedProbabilities(odds: Array<number | null>) {
  if (odds.some((value) => value === null)) {
    return odds.map(() => null);
  }

  const raw = odds.map((value) => 1 / value!);
  const total = raw.reduce((sum, value) => sum + value, 0);

  return raw.map((value) => Math.round((value / total) * 1000) / 1000);
}

function probability(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value > 1 && value <= 100) {
    return Math.round(value) / 100;
  }

  if (value >= 0 && value <= 1) {
    return value;
  }

  return null;
}

function signal(value: number | null, high: number, medium: number): OddsSignal {
  if (value === null) {
    return "unknown";
  }

  if (value >= high) {
    return "high";
  }

  if (value >= medium) {
    return "medium";
  }

  return "low";
}

function cleanSheetSignal(team: OddsTeamSignal): OddsSignal {
  if (team.cleanSheetProbability !== null) {
    return signal(team.cleanSheetProbability, 0.4, 0.25);
  }

  if (team.winProbability === null || team.under25Probability === null) {
    return "unknown";
  }

  if (team.winProbability >= 0.55 && team.under25Probability >= 0.45) {
    return "high";
  }

  if (team.winProbability >= 0.4 || team.under25Probability >= 0.5) {
    return "medium";
  }

  return "low";
}

function attackSignal(team: Pick<OddsTeamSignal, "winProbability" | "over25Probability" | "teamGoalsExpected">): OddsSignal {
  if (team.teamGoalsExpected !== null) {
    return signal(team.teamGoalsExpected, 2, 1.4);
  }

  return signal(team.winProbability === null || team.over25Probability === null ? null : (team.winProbability + team.over25Probability) / 2, 0.55, 0.45);
}

function signalSource(direct: number | null, derivedInputs: Array<number | null>): OddsSignalSource {
  if (direct !== null) {
    return "direct";
  }

  if (derivedInputs.every((value) => value !== null)) {
    return "derived";
  }

  return "unavailable";
}

function confidence(matches: number, warnings: string[]): EvidenceConfidence {
  if (matches === 0) {
    return "low";
  }

  return warnings.length === 0 ? "high" : "medium";
}

function selectedIdsByTeam(players: PlayerInput[]) {
  const ids = new Map<number, number[]>();

  for (const player of players) {
    ids.set(player.team, [...(ids.get(player.team) ?? []), player.id]);
  }

  return ids;
}

function matchSummary(signal: OddsTeamSignal) {
  if (signal.winProbability === null) {
    return `${signal.teamName} has no usable match-odds probability for GW${signal.event}.`;
  }

  return `${signal.teamName} ${signal.venue === "H" ? "home" : "away"} vs ${signal.opponentName}: ${(signal.winProbability * 100).toFixed(1)}% win, ${signal.attackSignal} ${signal.attackSignalSource} attack signal, ${signal.cleanSheetSignal} ${signal.cleanSheetSignalSource} clean-sheet signal.`;
}

function coverage(values: number, total: number): OddsCoverageStatus {
  if (total === 0 || values === 0) {
    return "missing";
  }

  return values === total ? "covered" : "partial";
}

function combineCoverage(...statuses: OddsCoverageStatus[]): OddsCoverageStatus {
  if (statuses.every((status) => status === "covered")) {
    return "covered";
  }

  if (statuses.some((status) => status === "covered" || status === "partial")) {
    return "partial";
  }

  return "missing";
}

function snapshotByTeams(snapshot: PublicOddsSnapshot | null | undefined) {
  return new Map((snapshot?.matches ?? []).map((match) => [`${teamKey(match.homeTeam)}|${teamKey(match.awayTeam)}`, match]));
}

function teamIdByKey(teams: TeamInput[]) {
  return new Map(teams.map((team) => [teamKey(team.name), team.id]));
}

export function buildOddsReport(input: BuildOddsReportInput): OddsReport {
  const teamsById = new Map(input.teams.map((team) => [team.id, team]));
  const teamIdByName = teamIdByKey(input.teams);
  const selectedByTeam = selectedIdsByTeam(input.selectedPlayers ?? []);
  const selectedPlayerIds = new Set((input.selectedPlayers ?? []).map((player) => player.id));
  const rows = input.csvRows.filter((row) => row.Div === "E0");
  const rowByTeams = new Map(rows.map((row) => [`${teamKey(row.HomeTeam)}|${teamKey(row.AwayTeam)}`, row]));
  const snapshotRows = snapshotByTeams(input.snapshot);
  const gwFixtures = input.fixtures.filter((fixture) => fixture.event === input.gameweek);
  const matches: OddsMatchSignal[] = [];
  const teamSignals: OddsTeamSignal[] = [];
  const playerSignals: OddsPlayerSignal[] = [];
  const unmatchedFixtures: string[] = [];

  for (const fixture of gwFixtures) {
    const homeTeam = teamsById.get(fixture.team_h);
    const awayTeam = teamsById.get(fixture.team_a);

    if (!homeTeam || !awayTeam) {
      continue;
    }

    const row = rowByTeams.get(`${teamKey(homeTeam.name)}|${teamKey(awayTeam.name)}`);
    const snapshot = snapshotRows.get(`${teamKey(homeTeam.name)}|${teamKey(awayTeam.name)}`);

    if (!row && !snapshot) {
      unmatchedFixtures.push(`${homeTeam.name} v ${awayTeam.name}`);
      continue;
    }

    const averageHomeOdds = row ? numberValue(row, ["AvgH", "AvgCH", "B365H", "B365CH", "MaxH", "MaxCH"]) : null;
    const averageDrawOdds = row ? numberValue(row, ["AvgD", "AvgCD", "B365D", "B365CD", "MaxD", "MaxCD"]) : null;
    const averageAwayOdds = row ? numberValue(row, ["AvgA", "AvgCA", "B365A", "B365CA", "MaxA", "MaxCA"]) : null;
    const over25Odds = row ? numberValue(row, ["Avg>2.5", "AvgC>2.5", "B365>2.5", "B365C>2.5", "Max>2.5", "MaxC>2.5"]) : null;
    const under25Odds = row ? numberValue(row, ["Avg<2.5", "AvgC<2.5", "B365<2.5", "B365C<2.5", "Max<2.5", "MaxC<2.5"]) : null;
    const [derivedHomeWinProbability, derivedDrawProbability, derivedAwayWinProbability] = normalizedProbabilities([
      averageHomeOdds,
      averageDrawOdds,
      averageAwayOdds
    ]);
    const [derivedOver25Probability, derivedUnder25Probability] = normalizedProbabilities([over25Odds, under25Odds]);
    const match: OddsMatchSignal = {
      fixtureId: fixture.id,
      event: input.gameweek,
      kickoffTime: fixture.kickoff_time,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeTeamName: homeTeam.name,
      awayTeamName: awayTeam.name,
      sourceHomeTeam: row?.HomeTeam ?? snapshot?.homeTeam ?? homeTeam.name,
      sourceAwayTeam: row?.AwayTeam ?? snapshot?.awayTeam ?? awayTeam.name,
      averageHomeOdds,
      averageDrawOdds,
      averageAwayOdds,
      over25Odds,
      under25Odds,
      homeWinProbability: probability(snapshot?.homeWinProbability) ?? derivedHomeWinProbability,
      drawProbability: probability(snapshot?.drawProbability) ?? derivedDrawProbability,
      awayWinProbability: probability(snapshot?.awayWinProbability) ?? derivedAwayWinProbability,
      over25Probability: probability(snapshot?.over25Probability) ?? derivedOver25Probability,
      under25Probability: probability(snapshot?.under25Probability) ?? derivedUnder25Probability,
      homeCleanSheetProbability: probability(snapshot?.homeCleanSheetProbability),
      awayCleanSheetProbability: probability(snapshot?.awayCleanSheetProbability),
      homeTeamGoalsExpected: snapshot?.homeTeamGoalsExpected ?? null,
      awayTeamGoalsExpected: snapshot?.awayTeamGoalsExpected ?? null
    };

    matches.push(match);

    for (const scorer of snapshot?.anytimeScorer ?? []) {
      const teamId = teamIdByName.get(teamKey(scorer.team)) ?? null;
      const playerId = scorer.playerId ?? null;
      const prob = probability(scorer.probability);

      if (prob === null) {
        continue;
      }

      playerSignals.push({
        playerId,
        playerName: scorer.playerName,
        teamId,
        teamName: scorer.team,
        market: "anytime-scorer",
        probability: prob,
        selected: playerId !== null && selectedPlayerIds.has(playerId),
        summary: `${scorer.playerName} anytime-scorer probability ${(prob * 100).toFixed(1)}%.`
      });
    }
  }

  for (const match of matches) {
    const homeSignal: OddsTeamSignal = {
      teamId: match.homeTeamId,
      teamName: match.homeTeamName,
      fixtureId: match.fixtureId,
      event: match.event,
      opponentTeamId: match.awayTeamId,
      opponentName: match.awayTeamName,
      venue: "H",
      winProbability: match.homeWinProbability,
      drawProbability: match.drawProbability,
      lossProbability: match.awayWinProbability,
      over25Probability: match.over25Probability,
      under25Probability: match.under25Probability,
      cleanSheetProbability: match.homeCleanSheetProbability,
      teamGoalsExpected: match.homeTeamGoalsExpected,
      attackSignal: "unknown",
      cleanSheetSignal: "unknown",
      attackSignalSource: "unavailable",
      cleanSheetSignalSource: "unavailable",
      selectedPlayerIds: selectedByTeam.get(match.homeTeamId) ?? [],
      summary: ""
    };
    const awaySignal: OddsTeamSignal = {
      teamId: match.awayTeamId,
      teamName: match.awayTeamName,
      fixtureId: match.fixtureId,
      event: match.event,
      opponentTeamId: match.homeTeamId,
      opponentName: match.homeTeamName,
      venue: "A",
      winProbability: match.awayWinProbability,
      drawProbability: match.drawProbability,
      lossProbability: match.homeWinProbability,
      over25Probability: match.over25Probability,
      under25Probability: match.under25Probability,
      cleanSheetProbability: match.awayCleanSheetProbability,
      teamGoalsExpected: match.awayTeamGoalsExpected,
      attackSignal: "unknown",
      cleanSheetSignal: "unknown",
      attackSignalSource: "unavailable",
      cleanSheetSignalSource: "unavailable",
      selectedPlayerIds: selectedByTeam.get(match.awayTeamId) ?? [],
      summary: ""
    };

    homeSignal.attackSignal = attackSignal(homeSignal);
    awaySignal.attackSignal = attackSignal(awaySignal);
    homeSignal.cleanSheetSignal = cleanSheetSignal(homeSignal);
    awaySignal.cleanSheetSignal = cleanSheetSignal(awaySignal);
    homeSignal.attackSignalSource = signalSource(homeSignal.teamGoalsExpected, [homeSignal.winProbability, homeSignal.over25Probability]);
    awaySignal.attackSignalSource = signalSource(awaySignal.teamGoalsExpected, [awaySignal.winProbability, awaySignal.over25Probability]);
    homeSignal.cleanSheetSignalSource = signalSource(homeSignal.cleanSheetProbability, [homeSignal.winProbability, homeSignal.under25Probability]);
    awaySignal.cleanSheetSignalSource = signalSource(awaySignal.cleanSheetProbability, [awaySignal.winProbability, awaySignal.under25Probability]);
    homeSignal.summary = matchSummary(homeSignal);
    awaySignal.summary = matchSummary(awaySignal);
    teamSignals.push(homeSignal, awaySignal);
  }

  const marketCoverage: OddsMarketCoverage = {
    matchOdds: coverage(matches.filter((match) => match.homeWinProbability !== null && match.drawProbability !== null && match.awayWinProbability !== null).length, gwFixtures.length),
    overUnder: coverage(matches.filter((match) => match.over25Probability !== null && match.under25Probability !== null).length, gwFixtures.length),
    cleanSheet: coverage(teamSignals.filter((team) => team.cleanSheetSignalSource === "direct").length, gwFixtures.length * 2),
    anytimeScorer: coverage(playerSignals.length, Math.max(1, (input.selectedPlayers ?? []).length)),
    teamGoals: coverage(teamSignals.filter((team) => team.teamGoalsExpected !== null).length, gwFixtures.length * 2)
  };
  const coverageStatus = combineCoverage(...Object.values(marketCoverage));
  const warnings = [
    ...unmatchedFixtures.map((fixture) => `No Football-Data odds row matched FPL fixture ${fixture}.`),
    ...(marketCoverage.anytimeScorer === "missing" ? ["Anytime scorer odds are not available from the current odds sources."] : []),
    ...(marketCoverage.cleanSheet === "missing" ? ["Clean-sheet signals are derived from match odds and over/under 2.5 markets, not direct clean-sheet odds."] : []),
    ...(marketCoverage.teamGoals === "missing" ? ["Team-goals markets are not available from the current odds sources."] : [])
  ];

  if (matches.length === 0) {
    warnings.unshift(`No Football-Data Premier League odds rows matched GW${input.gameweek} FPL fixtures.`);
  }

  return {
    generatedAt: input.generatedAt,
    gameweek: input.gameweek,
    source: {
      ...input.source,
      confidence: confidence(matches.length, warnings)
    },
    summary: {
      sourceRows: input.csvRows.length,
      premierLeagueRows: rows.length,
      gameweekFixtures: gwFixtures.length,
      matchedFixtures: matches.length,
      unmatchedFixtures: gwFixtures.length - matches.length,
      selectedTeamsCovered: new Set(teamSignals.filter((team) => team.selectedPlayerIds.length > 0).map((team) => team.teamId)).size,
      coverageStatus,
      marketCoverage
    },
    matches,
    teamSignals: teamSignals.sort((a, b) => a.teamName.localeCompare(b.teamName)),
    playerSignals: playerSignals.sort((a, b) => b.probability - a.probability),
    warnings
  };
}

function percent(value: number | null) {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

export function renderOddsReportMarkdown(report: OddsReport) {
  return `# Odds Report: GW${report.gameweek}

Generated: ${report.generatedAt}

Source: ${report.source.label}

Provider: ${report.source.provider}

## Summary

- Source rows: ${report.summary.sourceRows}
- Premier League rows: ${report.summary.premierLeagueRows}
- Gameweek fixtures: ${report.summary.gameweekFixtures}
- Matched fixtures: ${report.summary.matchedFixtures}
- Unmatched fixtures: ${report.summary.unmatchedFixtures}
- Selected teams covered: ${report.summary.selectedTeamsCovered}
- Coverage status: ${report.summary.coverageStatus}

## Market Coverage

| Market | Coverage |
| --- | --- |
| Match odds | ${report.summary.marketCoverage.matchOdds} |
| Over/under | ${report.summary.marketCoverage.overUnder} |
| Clean sheet | ${report.summary.marketCoverage.cleanSheet} |
| Team goals | ${report.summary.marketCoverage.teamGoals} |
| Anytime scorer | ${report.summary.marketCoverage.anytimeScorer} |

## Fixture Markets

| Fixture | Home | Draw | Away | Over 2.5 | Under 2.5 | Home CS | Away CS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${report.matches.map((match) => `| ${match.homeTeamName} v ${match.awayTeamName} | ${percent(match.homeWinProbability)} | ${percent(match.drawProbability)} | ${percent(match.awayWinProbability)} | ${percent(match.over25Probability)} | ${percent(match.under25Probability)} | ${percent(match.homeCleanSheetProbability)} | ${percent(match.awayCleanSheetProbability)} |`).join("\n") || "| None | n/a | n/a | n/a | n/a | n/a | n/a | n/a |"}

## Team Signals

| Team | Fixture | Win | Attack | Attack source | Clean sheet | Clean-sheet source |
| --- | --- | ---: | --- | --- | --- | --- |
${report.teamSignals.map((team) => `| ${team.teamName} | ${team.venue === "H" ? "H" : "A"} vs ${team.opponentName} | ${percent(team.winProbability)} | ${team.attackSignal} | ${team.attackSignalSource} | ${team.cleanSheetSignal} | ${team.cleanSheetSignalSource} |`).join("\n") || "| None | n/a | n/a | unknown | unavailable | unknown | unavailable |"}

## Anytime Scorer Signals

${report.playerSignals.map((player) => `- ${player.playerName} (${player.teamName}): ${percent(player.probability)}${player.selected ? ", selected" : ""}`).join("\n") || "- None"}

## Selected Team Signals

${report.teamSignals.filter((team) => team.selectedPlayerIds.length > 0).map((team) => `- ${team.summary} Selected player IDs: ${team.selectedPlayerIds.join(", ")}.`).join("\n") || "- None"}

## Warnings

${report.warnings.map((warning) => `- ${warning}`).join("\n") || "- None"}
`;
}
