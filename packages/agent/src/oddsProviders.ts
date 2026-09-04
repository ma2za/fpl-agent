import type { OddsBookmakerPrice, OddsMarketKind, OddsProviderId } from "./types";

type UnknownRecord = Record<string, unknown>;

export type ProviderEvent = {
  provider: OddsProviderId;
  providerEventId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string | null;
};

export type ProviderPrice = Omit<OddsBookmakerPrice, "fixtureId" | "playerId" | "matchStatus">;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown) {
  return typeof value === "string" ? value : null;
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function apiFootballMarket(name: string): OddsMarketKind | null {
  const key = normalize(name);
  if (key === "match winner" || key === "fulltime result" || key === "full time result") return "match-winner";
  if ((key === "goals over under" || key === "over under") && !key.includes("half")) return "goals-total";
  if (key.includes("clean sheet") && key.includes("home")) return "clean-sheet-home";
  if (key.includes("clean sheet") && key.includes("away")) return "clean-sheet-away";
  if (key.includes("team total") && key.includes("home")) return "team-total-home";
  if (key.includes("team total") && key.includes("away")) return "team-total-away";
  if (key.includes("anytime") && (key.includes("goal scorer") || key.includes("goalscorer"))) return "anytime-scorer";
  return null;
}

function lineFromSelection(selection: string) {
  const match = selection.match(/(?:over|under)\s*([0-9]+(?:\.[0-9]+)?)/i);
  return match ? Number(match[1]) : null;
}

export function parseApiFootballEvents(payload: unknown): ProviderEvent[] {
  const root = record(payload);
  return array(root?.response).flatMap((value) => {
    const item = record(value);
    const fixture = record(item?.fixture);
    const teams = record(item?.teams);
    const home = record(teams?.home);
    const away = record(teams?.away);
    const id = number(fixture?.id);
    const homeTeam = string(home?.name);
    const awayTeam = string(away?.name);
    if (id === null || !homeTeam || !awayTeam) return [];
    return [{
      provider: "api-football.com" as const,
      providerEventId: String(id),
      homeTeam,
      awayTeam,
      kickoffTime: string(fixture?.date)
    }];
  });
}

export function parseApiFootballBetCatalog(payload: unknown) {
  const root = record(payload);
  return new Map(array(root?.response).flatMap((value) => {
    const item = record(value);
    const id = number(item?.id);
    const name = string(item?.name);
    const market = name ? apiFootballMarket(name) : null;
    return id === null || !market ? [] : [[id, market] as const];
  }));
}

export function parseApiFootballOdds(input: {
  payload: unknown;
  event: ProviderEvent;
  marketIds: Map<number, OddsMarketKind>;
  fetchedAt: string;
  sourceId: string;
}): ProviderPrice[] {
  const root = record(input.payload);
  return array(root?.response).flatMap((responseValue) => {
    const response = record(responseValue);
    return array(response?.bookmakers).flatMap((bookmakerValue) => {
      const bookmaker = record(bookmakerValue);
      const bookmakerName = string(bookmaker?.name);
      if (!bookmakerName) return [];
      return array(bookmaker?.bets).flatMap((betValue) => {
        const bet = record(betValue);
        const market = input.marketIds.get(number(bet?.id) ?? -1) ?? (string(bet?.name) ? apiFootballMarket(string(bet?.name)!) : null);
        if (!market) return [];
        return array(bet?.values).flatMap((outcomeValue) => {
          const outcome = record(outcomeValue);
          const selection = string(outcome?.value);
          const decimalPrice = number(outcome?.odd);
          if (!selection || decimalPrice === null || decimalPrice <= 1) return [];
          const playerName = market === "anytime-scorer" ? selection : null;
          return [{
            provider: "api-football.com" as const,
            providerEventId: input.event.providerEventId,
            homeTeam: input.event.homeTeam,
            awayTeam: input.event.awayTeam,
            kickoffTime: input.event.kickoffTime,
            bookmaker: bookmakerName,
            market,
            selection,
            decimalPrice,
            line: lineFromSelection(selection),
            playerName,
            teamName: null,
            fetchedAt: input.fetchedAt,
            sourceId: input.sourceId
          }];
        });
      });
    });
  });
}

export function parseTheOddsEvents(payload: unknown): ProviderEvent[] {
  return array(payload).flatMap((value) => {
    const item = record(value);
    const id = string(item?.id);
    const homeTeam = string(item?.home_team);
    const awayTeam = string(item?.away_team);
    if (!id || !homeTeam || !awayTeam) return [];
    return [{
      provider: "the-odds-api.com" as const,
      providerEventId: id,
      homeTeam,
      awayTeam,
      kickoffTime: string(item?.commence_time)
    }];
  });
}

function theOddsMarket(key: string): OddsMarketKind | null {
  if (key === "h2h") return "match-winner";
  if (key === "totals") return "goals-total";
  if (key === "team_totals") return "team-total-home";
  if (key === "player_goal_scorer_anytime") return "anytime-scorer";
  return null;
}

export function parseTheOddsPrices(input: {
  payload: unknown;
  fetchedAt: string;
  sourceId: string;
}): ProviderPrice[] {
  const events = Array.isArray(input.payload) ? input.payload : [input.payload];
  return events.flatMap((eventValue) => {
    const event = record(eventValue);
    const providerEventId = string(event?.id);
    const homeTeam = string(event?.home_team);
    const awayTeam = string(event?.away_team);
    if (!providerEventId || !homeTeam || !awayTeam) return [];
    return array(event?.bookmakers).flatMap((bookmakerValue) => {
      const bookmaker = record(bookmakerValue);
      const bookmakerName = string(bookmaker?.title) ?? string(bookmaker?.key);
      if (!bookmakerName) return [];
      return array(bookmaker?.markets).flatMap((marketValue) => {
        const marketRecord = record(marketValue);
        const marketKey = string(marketRecord?.key);
        const baseMarket = marketKey ? theOddsMarket(marketKey) : null;
        if (!baseMarket) return [];
        return array(marketRecord?.outcomes).flatMap((outcomeValue) => {
          const outcome = record(outcomeValue);
          const selection = string(outcome?.name);
          const decimalPrice = number(outcome?.price);
          if (!selection || decimalPrice === null || decimalPrice <= 1) return [];
          const description = string(outcome?.description);
          let market = baseMarket;
          let teamName: string | null = null;
          if (baseMarket === "team-total-home") {
            teamName = description ?? (selection === homeTeam || selection === awayTeam ? selection : null);
            if (teamName && normalize(teamName) === normalize(awayTeam)) market = "team-total-away";
          }
          return [{
            provider: "the-odds-api.com" as const,
            providerEventId,
            homeTeam,
            awayTeam,
            kickoffTime: string(event?.commence_time),
            bookmaker: bookmakerName,
            market,
            selection,
            decimalPrice,
            line: number(outcome?.point),
            playerName: baseMarket === "anytime-scorer" ? description ?? selection : null,
            teamName,
            fetchedAt: input.fetchedAt,
            sourceId: input.sourceId
          }];
        });
      });
    });
  });
}
