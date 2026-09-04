import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import path from "node:path";
import {
  oddsNameKey,
  parseApiFootballBetCatalog,
  parseApiFootballEvents,
  parseApiFootballOdds,
  parseTheOddsEvents,
  parseTheOddsPrices,
  type OddsProviderResult,
  type ProviderEvent,
  type ProviderPrice
} from "../packages/agent/src";
import type { Fixture, Team } from "../packages/fpl-api/src";

export const ODDS_BUDGETS = {
  apiFootball: { perRun: 12, perUtcDay: 24, minimumRemaining: 50, ttlHours: 3, catalogTtlHours: 30 * 24 },
  theOddsApi: { perRun: 22, perGameweek: 66, perMonth: 300, reserve: 100, snapshotsPerGameweek: 3, ttlHours: 3 }
} as const;

type LedgerEntry = {
  provider: "api-football.com" | "the-odds-api.com";
  generatedAt: string;
  gameweek: number;
  runId: string;
  requests: number;
  credits: number;
  reportedRemaining: number | null;
  reportedUsed?: number | null;
  reportedLimit?: number | null;
};

type ProviderCache = {
  fetchedAt: string;
  events: ProviderEvent[];
  prices: ProviderPrice[];
  result: OddsProviderResult;
};

function safeLoadEnv() {
  try {
    loadEnvFile(".env");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function safeTimestamp(value: string) {
  return value.replace(/[:.]/g, "-");
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

function dayKey(value: string) {
  return value.slice(0, 10);
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readLedger(rawDir: string) {
  return await readJsonIfExists<LedgerEntry[]>(path.join(rawDir, "quota-ledger.json")) ?? [];
}

async function appendLedger(rawDir: string, entry: LedgerEntry) {
  const ledger = await readLedger(rawDir);
  await mkdir(rawDir, { recursive: true });
  await writeFile(path.join(rawDir, "quota-ledger.json"), `${JSON.stringify([...ledger, entry], null, 2)}\n`, "utf8");
}

function reportedRemaining(headers: Headers, provider: LedgerEntry["provider"]) {
  const key = provider === "api-football.com" ? "x-ratelimit-requests-remaining" : "x-requests-remaining";
  const value = Number(headers.get(key));
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function reportedCost(headers: Headers, fallback: number) {
  const value = Number(headers.get("x-requests-last"));
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function reportedHeader(headers: Headers, key: string) {
  const value = Number(headers.get(key));
  return Number.isInteger(value) && value >= 0 ? value : null;
}

async function fetchJson(url: URL, options: RequestInit, fetchImpl: typeof fetch) {
  const response = await fetchImpl(url, options);
  if (!response.ok) throw new Error(`Odds provider returned HTTP ${response.status}.`);
  return { payload: await response.json() as unknown, headers: response.headers };
}

async function persistRaw(rawDir: string, provider: string, runId: string, name: string, payload: unknown) {
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const digest = createHash("sha256").update(serialized).digest("hex").slice(0, 16);
  const target = path.join(rawDir, "snapshots", provider, runId, `${name}-${digest}.json`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, serialized, { encoding: "utf8", flag: "wx" }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  });
  return target;
}

function ageHours(timestamp: string, now: string) {
  return (Date.parse(now) - Date.parse(timestamp)) / 3_600_000;
}

async function readFreshCache(rawDir: string, provider: string, generatedAt: string, ttlHours: number, force: boolean) {
  if (force) return null;
  const cache = await readJsonIfExists<ProviderCache>(path.join(rawDir, "providers", provider, "latest.json"));
  const age = cache ? ageHours(cache.fetchedAt, generatedAt) : Infinity;
  return cache && age >= 0 && age <= ttlHours ? cache : null;
}

async function readAnyCache(rawDir: string, provider: string) {
  return readJsonIfExists<ProviderCache>(path.join(rawDir, "providers", provider, "latest.json"));
}

async function persistCache(rawDir: string, provider: string, cache: ProviderCache) {
  const target = path.join(rawDir, "providers", provider, "latest.json");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  await writeFile(path.join(path.dirname(target), "latest-success.json"), `${JSON.stringify({
    provider,
    fetchedAt: cache.fetchedAt,
    snapshotPath: cache.result.sourcePath,
    eventCount: cache.events.length,
    priceCount: cache.prices.length
  }, null, 2)}\n`, "utf8");
}

function gameweekWindow(fixtures: Fixture[], gameweek: number) {
  const dates = fixtures.filter((fixture) => fixture.event === gameweek && fixture.kickoff_time).map((fixture) => Date.parse(fixture.kickoff_time!));
  if (dates.length === 0) throw new Error(`GW${gameweek} has no dated fixtures.`);
  const date = (value: number) => new Date(value).toISOString().slice(0, 10);
  const kickoff = new Date(Math.min(...dates));
  const year = kickoff.getUTCFullYear();
  return { from: date(Math.min(...dates) - 86_400_000), to: date(Math.max(...dates) + 86_400_000), season: kickoff.getUTCMonth() >= 6 ? year : year - 1 };
}

function matchingProviderEvents(events: ProviderEvent[], teams: Team[], fixtures: Fixture[], gameweek: number) {
  const teamsById = new Map(teams.map((team) => [team.id, team.name]));
  return fixtures.filter((fixture) => fixture.event === gameweek).flatMap((fixture) => {
    const home = teamsById.get(fixture.team_h);
    const away = teamsById.get(fixture.team_a);
    if (!home || !away) return [];
    const candidates = events.filter((event) => oddsNameKey(event.homeTeam) === oddsNameKey(home) && oddsNameKey(event.awayTeam) === oddsNameKey(away) &&
      Boolean(event.kickoffTime && fixture.kickoff_time) && Math.abs(Date.parse(event.kickoffTime!) - Date.parse(fixture.kickoff_time!)) <= 2 * 60 * 60 * 1000);
    return candidates.length === 1 ? candidates : [];
  });
}

export function apiFootballBudgetStatus(ledger: LedgerEntry[], generatedAt: string, requested: number, providerRemaining: number | null) {
  const spent = ledger.filter((entry) => entry.provider === "api-football.com" && dayKey(entry.generatedAt) === dayKey(generatedAt))
    .reduce((sum, entry) => sum + entry.requests, 0);
  if (requested > ODDS_BUDGETS.apiFootball.perRun) return "API-Football per-run request limit would be exceeded.";
  if (spent + requested > ODDS_BUDGETS.apiFootball.perUtcDay) return "API-Football UTC-day request limit would be exceeded.";
  if (providerRemaining !== null && providerRemaining - 1 < ODDS_BUDGETS.apiFootball.minimumRemaining) return "API-Football request reserve would be breached.";
  return null;
}

export function theOddsApiBudgetStatus(ledger: LedgerEntry[], input: { generatedAt: string; gameweek: number; requested: number; providerRemaining: number | null; runId: string; nextCost?: number }) {
  const entries = ledger.filter((entry) => entry.provider === "the-odds-api.com");
  const gameweekCredits = entries.filter((entry) => entry.gameweek === input.gameweek).reduce((sum, entry) => sum + entry.credits, 0);
  const monthCredits = entries.filter((entry) => monthKey(entry.generatedAt) === monthKey(input.generatedAt)).reduce((sum, entry) => sum + entry.credits, 0);
  const snapshots = new Set(entries.filter((entry) => entry.gameweek === input.gameweek && entry.requests > 1).map((entry) => entry.runId));
  if (input.requested > ODDS_BUDGETS.theOddsApi.perRun) return "The Odds API per-run credit limit would be exceeded.";
  if (gameweekCredits + input.requested > ODDS_BUDGETS.theOddsApi.perGameweek) return "The Odds API gameweek credit limit would be exceeded.";
  if (monthCredits + input.requested > ODDS_BUDGETS.theOddsApi.perMonth) return "The Odds API calendar-month credit limit would be exceeded.";
  if (!snapshots.has(input.runId) && snapshots.size >= ODDS_BUDGETS.theOddsApi.snapshotsPerGameweek) return "The Odds API gameweek snapshot limit would be exceeded.";
  const nextCost = input.nextCost ?? input.requested;
  if (nextCost > 0 && input.providerRemaining === null) return "The Odds API reserve cannot be verified from provider headers.";
  if (input.providerRemaining !== null && input.providerRemaining - nextCost < ODDS_BUDGETS.theOddsApi.reserve) return "The Odds API credit reserve would be breached.";
  return null;
}

export async function fetchApiFootballMarkets(input: {
  gameweek: number;
  teams: Team[];
  fixtures: Fixture[];
  rawDir: string;
  generatedAt: string;
  force?: boolean;
  offline?: boolean;
  fetchImpl?: typeof fetch;
}) {
  safeLoadEnv();
  if (input.offline) {
    const cache = await readAnyCache(input.rawDir, "api-football.com");
    return cache
      ? { events: cache.events, prices: cache.prices, result: { ...cache.result, fromCache: true }, warning: null }
      : { events: [], prices: [], result: null, warning: "API-Football has no offline cache." };
  }
  const key = process.env.api_football_com;
  if (!key) return { events: [], prices: [], result: null, warning: "api_football_com is unavailable; API-Football made no requests." };
  const cached = await readFreshCache(input.rawDir, "api-football.com", input.generatedAt, ODDS_BUDGETS.apiFootball.ttlHours, input.force ?? false);
  if (cached) return { events: cached.events, prices: cached.prices, result: { ...cached.result, fromCache: true }, warning: null };
  const fetchImpl = input.fetchImpl ?? fetch;
  const runId = safeTimestamp(input.generatedAt);
  const ledger = await readLedger(input.rawDir);
  let requests = 0;
  let remaining = ledger.filter((entry) => entry.provider === "api-football.com").at(-1)?.reportedRemaining ?? null;
  let reportedUsed: number | null = null;
  let reportedLimit: number | null = null;
  const warnings: string[] = [];
  const request = async (name: string, url: URL) => {
    const budget = apiFootballBudgetStatus(ledger, input.generatedAt, requests + 1, remaining);
    if (budget) throw new Error(budget);
    const response = await fetchJson(url, { headers: { "x-apisports-key": key, accept: "application/json" } }, fetchImpl);
    requests += 1;
    remaining = reportedRemaining(response.headers, "api-football.com") ?? remaining;
    reportedUsed = reportedHeader(response.headers, "x-ratelimit-requests-used") ?? reportedUsed;
    reportedLimit = reportedHeader(response.headers, "x-ratelimit-requests-limit") ?? reportedLimit;
    await persistRaw(input.rawDir, "api-football.com", runId, name, response.payload);
    return response.payload;
  };
  const catalogPath = path.join(input.rawDir, "providers", "api-football.com", "bet-catalog.json");
  const catalogStat = await stat(catalogPath).catch(() => null);
  let catalogPayload = catalogStat && (Date.parse(input.generatedAt) - catalogStat.mtimeMs) / 3_600_000 <= ODDS_BUDGETS.apiFootball.catalogTtlHours
    ? JSON.parse(await readFile(catalogPath, "utf8")) as unknown
    : null;
  if (!catalogPayload) {
    catalogPayload = await request("bet-catalog", new URL("https://v3.football.api-sports.io/odds/bets"));
    await mkdir(path.dirname(catalogPath), { recursive: true });
    await writeFile(catalogPath, `${JSON.stringify(catalogPayload, null, 2)}\n`, "utf8");
  }
  const marketIds = parseApiFootballBetCatalog(catalogPayload);
  const window = gameweekWindow(input.fixtures, input.gameweek);
  const fixtureUrl = new URL("https://v3.football.api-sports.io/fixtures");
  fixtureUrl.search = new URLSearchParams({ league: "39", season: String(window.season), from: window.from, to: window.to }).toString();
  const fixturePayload = await request("fixtures", fixtureUrl);
  const events = matchingProviderEvents(parseApiFootballEvents(fixturePayload), input.teams, input.fixtures, input.gameweek);
  const prices: ProviderPrice[] = [];
  for (const event of events.slice(0, 10)) {
    const oddsUrl = new URL("https://v3.football.api-sports.io/odds");
    oddsUrl.searchParams.set("fixture", event.providerEventId);
    let payload: unknown;
    try {
      payload = await request(`odds-${event.providerEventId}`, oddsUrl);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      break;
    }
    prices.push(...parseApiFootballOdds({ payload, event, marketIds, fetchedAt: input.generatedAt, sourceId: `api-football:event:${event.providerEventId}` }));
    const paging = (payload as { paging?: { current?: number; total?: number } })?.paging;
    if ((paging?.total ?? 1) > (paging?.current ?? 1)) warnings.push(`API-Football fixture ${event.providerEventId} retained page ${paging?.current ?? 1}/${paging!.total}; additional pages were not requested because the fixture request cap is one.`);
  }
  if (events.length < 10) warnings.push(`API-Football matched ${events.length}/10 expected GW fixtures.`);
  const result: OddsProviderResult = {
    provider: "api-football.com", fetchedAt: input.generatedAt,
    sourcePath: path.join(input.rawDir, "snapshots", "api-football.com", runId),
    fromCache: false, requestCount: requests, creditsUsed: 0, reportedRemaining: remaining, reportedUsed, reportedLimit, warnings
  };
  const cache = { fetchedAt: input.generatedAt, events, prices, result };
  await persistCache(input.rawDir, "api-football.com", cache);
  await appendLedger(input.rawDir, { provider: "api-football.com", generatedAt: input.generatedAt, gameweek: input.gameweek, runId, requests, credits: 0, reportedRemaining: remaining, reportedUsed, reportedLimit });
  return { events, prices, result, warning: null };
}

export async function fetchTheOddsApiMarkets(input: {
  gameweek: number;
  teams: Team[];
  fixtures: Fixture[];
  rawDir: string;
  generatedAt: string;
  needsTeamTotals: Set<string>;
  force?: boolean;
  offline?: boolean;
  fetchImpl?: typeof fetch;
}) {
  safeLoadEnv();
  if (input.offline) {
    const cache = await readAnyCache(input.rawDir, "the-odds-api.com");
    return cache
      ? { events: cache.events, prices: cache.prices, result: { ...cache.result, fromCache: true }, warning: null }
      : { events: [], prices: [], result: null, warning: "The Odds API has no offline cache." };
  }
  const key = process.env.the_odds_api_com;
  if (!key) return { events: [], prices: [], result: null, warning: "the_odds_api_com is unavailable; The Odds API made no requests." };
  const cached = await readFreshCache(input.rawDir, "the-odds-api.com", input.generatedAt, ODDS_BUDGETS.theOddsApi.ttlHours, input.force ?? false);
  if (cached) return { events: cached.events, prices: cached.prices, result: { ...cached.result, fromCache: true }, warning: null };
  const fetchImpl = input.fetchImpl ?? fetch;
  const runId = safeTimestamp(input.generatedAt);
  const ledger = await readLedger(input.rawDir);
  let credits = 0;
  let requests = 0;
  let remaining = ledger.filter((entry) => entry.provider === "the-odds-api.com").at(-1)?.reportedRemaining ?? null;
  let reportedUsed: number | null = null;
  const warnings: string[] = [];
  const request = async (name: string, url: URL, maximumCost: number) => {
    const budget = theOddsApiBudgetStatus(ledger, { generatedAt: input.generatedAt, gameweek: input.gameweek, requested: credits + maximumCost, providerRemaining: remaining, runId, nextCost: maximumCost });
    if (budget) throw new Error(budget);
    const response = await fetchJson(url, { headers: { accept: "application/json" } }, fetchImpl);
    requests += 1;
    const actual = reportedCost(response.headers, maximumCost);
    credits += actual;
    if (actual > maximumCost) warnings.push(`The Odds API reported ${actual} credits for a call preflighted at ${maximumCost}.`);
    remaining = reportedRemaining(response.headers, "the-odds-api.com") ?? remaining;
    reportedUsed = reportedHeader(response.headers, "x-requests-used") ?? reportedUsed;
    await persistRaw(input.rawDir, "the-odds-api.com", runId, name, response.payload);
    return response.payload;
  };
  const eventsUrl = new URL("https://api.the-odds-api.com/v4/sports/soccer_epl/events");
  eventsUrl.searchParams.set("apiKey", key);
  const eventPayload = await request("events", eventsUrl, 0);
  const events = matchingProviderEvents(parseTheOddsEvents(eventPayload), input.teams, input.fixtures, input.gameweek);
  const prices: ProviderPrice[] = [];
  const bulkUrl = new URL("https://api.the-odds-api.com/v4/sports/soccer_epl/odds");
  bulkUrl.search = new URLSearchParams({ apiKey: key, regions: "eu", markets: "h2h,totals", oddsFormat: "decimal" }).toString();
  prices.push(...parseTheOddsPrices({ payload: await request("featured", bulkUrl, 2), fetchedAt: input.generatedAt, sourceId: "the-odds-api:featured" }));
  for (const event of events.slice(0, 10)) {
    const teamKey = `${oddsNameKey(event.homeTeam)}|${oddsNameKey(event.awayTeam)}`;
    const markets = input.needsTeamTotals.has(teamKey) ? "player_goal_scorer_anytime,team_totals" : "player_goal_scorer_anytime";
    const eventUrl = new URL(`https://api.the-odds-api.com/v4/sports/soccer_epl/events/${event.providerEventId}/odds`);
    eventUrl.search = new URLSearchParams({ apiKey: key, regions: "us", markets, oddsFormat: "decimal" }).toString();
    let payload: unknown;
    try {
      payload = await request(`event-${createHash("sha256").update(event.providerEventId).digest("hex").slice(0, 12)}`, eventUrl, markets.includes(",") ? 2 : 1);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      break;
    }
    prices.push(...parseTheOddsPrices({
      payload,
      fetchedAt: input.generatedAt,
      sourceId: `the-odds-api:event:${event.providerEventId}`
    }));
  }
  if (events.length < 10) warnings.push(`The Odds API matched ${events.length}/10 expected GW fixtures.`);
  const result: OddsProviderResult = {
    provider: "the-odds-api.com", fetchedAt: input.generatedAt,
    sourcePath: path.join(input.rawDir, "snapshots", "the-odds-api.com", runId),
    fromCache: false, requestCount: requests, creditsUsed: credits, reportedRemaining: remaining, reportedUsed, warnings
  };
  const cache = { fetchedAt: input.generatedAt, events, prices, result };
  await persistCache(input.rawDir, "the-odds-api.com", cache);
  await appendLedger(input.rawDir, { provider: "the-odds-api.com", generatedAt: input.generatedAt, gameweek: input.gameweek, runId, requests, credits, reportedRemaining: remaining, reportedUsed });
  return { events, prices, result, warning: null };
}
