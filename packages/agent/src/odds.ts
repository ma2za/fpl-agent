import type { EvidenceConfidence, EvidenceSource, OddsMatchSignal, OddsReport, OddsSignal, OddsTeamSignal } from "./types";

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
  teams: TeamInput[];
  fixtures: FixtureInput[];
  selectedPlayers?: PlayerInput[];
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

  return `${signal.teamName} ${signal.venue === "H" ? "home" : "away"} vs ${signal.opponentName}: ${(signal.winProbability * 100).toFixed(1)}% win, ${signal.attackSignal} attack signal, ${signal.cleanSheetSignal} derived clean-sheet signal.`;
}

export function buildOddsReport(input: BuildOddsReportInput): OddsReport {
  const teamsById = new Map(input.teams.map((team) => [team.id, team]));
  const selectedByTeam = selectedIdsByTeam(input.selectedPlayers ?? []);
  const rows = input.csvRows.filter((row) => row.Div === "E0");
  const rowByTeams = new Map(rows.map((row) => [`${teamKey(row.HomeTeam)}|${teamKey(row.AwayTeam)}`, row]));
  const gwFixtures = input.fixtures.filter((fixture) => fixture.event === input.gameweek);
  const matches: OddsMatchSignal[] = [];
  const teamSignals: OddsTeamSignal[] = [];
  const unmatchedFixtures: string[] = [];

  for (const fixture of gwFixtures) {
    const homeTeam = teamsById.get(fixture.team_h);
    const awayTeam = teamsById.get(fixture.team_a);

    if (!homeTeam || !awayTeam) {
      continue;
    }

    const row = rowByTeams.get(`${teamKey(homeTeam.name)}|${teamKey(awayTeam.name)}`);

    if (!row) {
      unmatchedFixtures.push(`${homeTeam.name} v ${awayTeam.name}`);
      continue;
    }

    const averageHomeOdds = numberValue(row, ["AvgH", "AvgCH", "B365H", "B365CH", "MaxH", "MaxCH"]);
    const averageDrawOdds = numberValue(row, ["AvgD", "AvgCD", "B365D", "B365CD", "MaxD", "MaxCD"]);
    const averageAwayOdds = numberValue(row, ["AvgA", "AvgCA", "B365A", "B365CA", "MaxA", "MaxCA"]);
    const over25Odds = numberValue(row, ["Avg>2.5", "AvgC>2.5", "B365>2.5", "B365C>2.5", "Max>2.5", "MaxC>2.5"]);
    const under25Odds = numberValue(row, ["Avg<2.5", "AvgC<2.5", "B365<2.5", "B365C<2.5", "Max<2.5", "MaxC<2.5"]);
    const [homeWinProbability, drawProbability, awayWinProbability] = normalizedProbabilities([
      averageHomeOdds,
      averageDrawOdds,
      averageAwayOdds
    ]);
    const [over25Probability, under25Probability] = normalizedProbabilities([over25Odds, under25Odds]);
    const match: OddsMatchSignal = {
      fixtureId: fixture.id,
      event: input.gameweek,
      kickoffTime: fixture.kickoff_time,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeTeamName: homeTeam.name,
      awayTeamName: awayTeam.name,
      sourceHomeTeam: row.HomeTeam,
      sourceAwayTeam: row.AwayTeam,
      averageHomeOdds,
      averageDrawOdds,
      averageAwayOdds,
      over25Odds,
      under25Odds,
      homeWinProbability,
      drawProbability,
      awayWinProbability,
      over25Probability,
      under25Probability
    };

    matches.push(match);
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
      attackSignal: signal(match.homeWinProbability === null || match.over25Probability === null ? null : (match.homeWinProbability + match.over25Probability) / 2, 0.55, 0.45),
      cleanSheetSignal: "unknown",
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
      attackSignal: signal(match.awayWinProbability === null || match.over25Probability === null ? null : (match.awayWinProbability + match.over25Probability) / 2, 0.55, 0.45),
      cleanSheetSignal: "unknown",
      selectedPlayerIds: selectedByTeam.get(match.awayTeamId) ?? [],
      summary: ""
    };

    homeSignal.cleanSheetSignal = cleanSheetSignal(homeSignal);
    awaySignal.cleanSheetSignal = cleanSheetSignal(awaySignal);
    homeSignal.summary = matchSummary(homeSignal);
    awaySignal.summary = matchSummary(awaySignal);
    teamSignals.push(homeSignal, awaySignal);
  }

  const warnings = [
    ...unmatchedFixtures.map((fixture) => `No Football-Data odds row matched FPL fixture ${fixture}.`),
    "Anytime scorer odds are not available from the Football-Data fixtures CSV.",
    "Clean-sheet signals are derived from match odds and over/under 2.5 markets, not direct clean-sheet odds."
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
      selectedTeamsCovered: new Set(teamSignals.filter((team) => team.selectedPlayerIds.length > 0).map((team) => team.teamId)).size
    },
    matches,
    teamSignals: teamSignals.sort((a, b) => a.teamName.localeCompare(b.teamName)),
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

## Fixture Markets

| Fixture | Home | Draw | Away | Over 2.5 | Under 2.5 |
| --- | ---: | ---: | ---: | ---: | ---: |
${report.matches.map((match) => `| ${match.homeTeamName} v ${match.awayTeamName} | ${percent(match.homeWinProbability)} | ${percent(match.drawProbability)} | ${percent(match.awayWinProbability)} | ${percent(match.over25Probability)} | ${percent(match.under25Probability)} |`).join("\n") || "| None | n/a | n/a | n/a | n/a | n/a |"}

## Team Signals

| Team | Fixture | Win | Attack | Clean sheet |
| --- | --- | ---: | --- | --- |
${report.teamSignals.map((team) => `| ${team.teamName} | ${team.venue === "H" ? "H" : "A"} vs ${team.opponentName} | ${percent(team.winProbability)} | ${team.attackSignal} | ${team.cleanSheetSignal} |`).join("\n") || "| None | n/a | n/a | unknown | unknown |"}

## Selected Team Signals

${report.teamSignals.filter((team) => team.selectedPlayerIds.length > 0).map((team) => `- ${team.summary} Selected player IDs: ${team.selectedPlayerIds.join(", ")}.`).join("\n") || "- None"}

## Warnings

${report.warnings.map((warning) => `- ${warning}`).join("\n") || "- None"}
`;
}
