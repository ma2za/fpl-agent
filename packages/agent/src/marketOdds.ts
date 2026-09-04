import type { PublicOddsSnapshot } from "./odds";
import type { OddsBookmakerPrice, OddsMarketKind } from "./types";
import type { ProviderPrice } from "./oddsProviders";

type TeamInput = { id: number; name: string };
type FixtureInput = { id: number; event: number | null; team_h: number; team_a: number; kickoff_time: string | null };
type PlayerInput = { id: number; team: number; firstName: string; secondName: string; webName: string };

const aliases = new Map([
  ["brighton and hove albion", "brighton"], ["brighton hove albion", "brighton"],
  ["manchester united", "man united"], ["man utd", "man united"], ["manchester utd", "man united"],
  ["nott m forest", "nottingham forest"], ["nottm forest", "nottingham forest"], ["notts forest", "nottingham forest"],
  ["tottenham hotspur", "tottenham"], ["spurs", "tottenham"]
]);

export function oddsNameKey(name: string) {
  const key = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  return aliases.get(key) ?? key;
}

function kickoffMatches(left: string | null, right: string | null) {
  if (!left || !right) return false;
  const delta = Math.abs(Date.parse(left) - Date.parse(right));
  return Number.isFinite(delta) && delta <= 2 * 60 * 60 * 1000;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function normalizedBookmaker(name: string) {
  return oddsNameKey(name);
}

function outcomeKey(selection: string, home: string, away: string) {
  const key = oddsNameKey(selection);
  if (["home", "1", oddsNameKey(home)].includes(key)) return "home";
  if (["draw", "x"].includes(key)) return "draw";
  if (["away", "2", oddsNameKey(away)].includes(key)) return "away";
  if (key.startsWith("over")) return "over";
  if (key.startsWith("under")) return "under";
  if (["yes", "y"].includes(key)) return "yes";
  if (["no", "n"].includes(key)) return "no";
  return key;
}

function fairGroup(prices: OddsBookmakerPrice[], outcomes: string[]) {
  const grouped = new Map<string, number[]>();
  const books = new Map<string, OddsBookmakerPrice[]>();
  for (const price of prices) {
    const key = normalizedBookmaker(price.bookmaker);
    books.set(key, [...(books.get(key) ?? []), price]);
  }
  for (const bookPrices of books.values()) {
    const byOutcome = new Map<string, OddsBookmakerPrice>();
    for (const price of bookPrices) {
      const outcome = outcomeKey(price.selection, price.homeTeam, price.awayTeam);
      if (!byOutcome.has(outcome)) byOutcome.set(outcome, price);
    }
    if (!outcomes.every((outcome) => byOutcome.has(outcome))) continue;
    const inverses = outcomes.map((outcome) => 1 / byOutcome.get(outcome)!.decimalPrice);
    const total = inverses.reduce((sum, value) => sum + value, 0);
    outcomes.forEach((outcome, index) => {
      const price = byOutcome.get(outcome)!;
      price.overround = total;
      price.fairProbability = inverses[index] / total;
      price.deVigMethod = "proportional";
      grouped.set(outcome, [...(grouped.get(outcome) ?? []), price.fairProbability]);
    });
  }
  return Object.fromEntries(outcomes.map((outcome) => [outcome, median(grouped.get(outcome) ?? [])])) as Record<string, number | null>;
}

function bestPositiveProbability(prices: OddsBookmakerPrice[]) {
  const probabilities = new Map<string, number>();
  for (const price of prices) {
    const book = normalizedBookmaker(price.bookmaker);
    if (probabilities.has(book)) continue;
    price.fairProbability = price.impliedProbability ?? 1 / price.decimalPrice;
    price.overround = null;
    price.deVigMethod = "positive-only-unadjusted";
    probabilities.set(book, price.fairProbability);
  }
  return median([...probabilities.values()]);
}

function playerAliases(player: PlayerInput) {
  return new Set([
    oddsNameKey(`${player.firstName} ${player.secondName}`),
    oddsNameKey(player.secondName),
    oddsNameKey(player.webName)
  ]);
}

export function aggregateMarketPrices(input: {
  prices: ProviderPrice[];
  teams: TeamInput[];
  fixtures: FixtureInput[];
  players: PlayerInput[];
  gameweek: number;
  fetchedAt: string;
}) {
  const teams = new Map(input.teams.map((team) => [team.id, team]));
  const gwFixtures = input.fixtures.filter((fixture) => fixture.event === input.gameweek);
  const matchedPrices: OddsBookmakerPrice[] = input.prices.map((price) => {
    const matches = gwFixtures.filter((fixture) => {
      const home = teams.get(fixture.team_h);
      const away = teams.get(fixture.team_a);
      return home && away && oddsNameKey(home.name) === oddsNameKey(price.homeTeam) &&
        oddsNameKey(away.name) === oddsNameKey(price.awayTeam) && kickoffMatches(fixture.kickoff_time, price.kickoffTime);
    });
    return {
      ...price,
      impliedProbability: 1 / price.decimalPrice,
      fairProbability: null,
      overround: null,
      fixtureId: matches.length === 1 ? matches[0].id : null,
      playerId: null,
      matchStatus: matches.length === 1 ? "matched" as const : matches.length > 1 ? "ambiguous" as const : "unmatched" as const
    };
  });
  const playerByTeam = new Map<number, Array<{ player: PlayerInput; aliases: Set<string> }>>();
  for (const player of input.players) playerByTeam.set(player.team, [...(playerByTeam.get(player.team) ?? []), { player, aliases: playerAliases(player) }]);
  for (const price of matchedPrices) {
    if (price.market !== "anytime-scorer" || price.fixtureId === null || !price.playerName) continue;
    const fixture = gwFixtures.find((item) => item.id === price.fixtureId)!;
    const teamName = price.teamName;
    const sourceTeam = teamName ? input.teams.find((team) => oddsNameKey(team.name) === oddsNameKey(teamName))?.id : null;
    const candidates = sourceTeam ? [sourceTeam] : [fixture.team_h, fixture.team_a];
    const matches = candidates.flatMap((teamId) => playerByTeam.get(teamId) ?? []).filter((item) => item.aliases.has(oddsNameKey(price.playerName!)));
    if (matches.length === 1) price.playerId = matches[0].player.id;
    else if (matches.length > 1) price.matchStatus = "ambiguous";
  }

  const snapshotMatches: PublicOddsSnapshot["matches"] = [];
  for (const fixture of gwFixtures) {
    const home = teams.get(fixture.team_h);
    const away = teams.get(fixture.team_a);
    if (!home || !away) continue;
    const fixturePrices = matchedPrices.filter((price) => price.fixtureId === fixture.id);
    const market = (kind: OddsMarketKind, line?: number) => fixturePrices.filter((price) => price.market === kind && (line === undefined || price.line === line));
    const result = fairGroup(market("match-winner"), ["home", "draw", "away"]);
    const totals = fairGroup(market("goals-total", 2.5), ["over", "under"]);
    const homeClean = fairGroup(market("clean-sheet-home"), ["yes", "no"]).yes ??
      fairGroup(market("team-total-away", 0.5), ["over", "under"]).under;
    const awayClean = fairGroup(market("clean-sheet-away"), ["yes", "no"]).yes ??
      fairGroup(market("team-total-home", 0.5), ["over", "under"]).under;
    const scorerPrices = market("anytime-scorer").filter((price) => price.playerId !== null);
    const scorerGroups = new Map<number, OddsBookmakerPrice[]>();
    for (const price of scorerPrices) scorerGroups.set(price.playerId!, [...(scorerGroups.get(price.playerId!) ?? []), price]);
    snapshotMatches.push({
      homeTeam: home.name,
      awayTeam: away.name,
      homeWinProbability: result.home,
      drawProbability: result.draw,
      awayWinProbability: result.away,
      over25Probability: totals.over,
      under25Probability: totals.under,
      homeCleanSheetProbability: homeClean,
      awayCleanSheetProbability: awayClean,
      homeTeamGoalsExpected: null,
      awayTeamGoalsExpected: null,
      anytimeScorer: [...scorerGroups].flatMap(([playerId, prices]) => {
        const player = input.players.find((item) => item.id === playerId);
        const probability = bestPositiveProbability(prices);
        if (!player || probability === null) return [];
        return [{ playerId, playerName: `${player.firstName} ${player.secondName}`, team: teams.get(player.team)?.name ?? "Unknown", probability }];
      })
    });
  }

  return {
    snapshot: { provider: "API-Football + The Odds API", fetchedAt: input.fetchedAt, matches: snapshotMatches } satisfies PublicOddsSnapshot,
    bookmakerPrices: matchedPrices
  };
}
