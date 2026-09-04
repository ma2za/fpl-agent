import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseApiFootballBetCatalog, parseTheOddsEvents } from "../packages/agent/src";
import { apiFootballBudgetStatus, ODDS_BUDGETS } from "./odds-provider-client";

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

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function readJson<T>(filePath: string, fallback: T) {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

function header(headers: Headers, name: string) {
  const value = Number(headers.get(name));
  return Number.isInteger(value) && value >= 0 ? value : null;
}

async function responseJson(url: URL, options?: RequestInit) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Odds provider credential validation returned HTTP ${response.status}.`);
  return { payload: await response.json() as unknown, headers: response.headers };
}

async function appendLedger(rawDir: string, entry: LedgerEntry) {
  const ledgerPath = path.join(rawDir, "quota-ledger.json");
  const ledger = await readJson<LedgerEntry[]>(ledgerPath, []);
  await mkdir(rawDir, { recursive: true });
  await writeFile(ledgerPath, `${JSON.stringify([...ledger, entry], null, 2)}\n`, "utf8");
}

async function persist(rawDir: string, provider: string, runId: string, name: string, payload: unknown) {
  const target = path.join(rawDir, "snapshots", provider, runId, `${name}.json`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function oddsProbeReport(input: {
  gameweek: number;
  apiFootball: Record<string, unknown>;
  theOddsApi: Record<string, unknown>;
}) {
  return {
    gameweek: input.gameweek,
    providers: { apiFootball: input.apiFootball, theOddsApi: input.theOddsApi },
    maximumSpend: {
      apiFootballRequests: ODDS_BUDGETS.apiFootball.perRun,
      theOddsApiCredits: ODDS_BUDGETS.theOddsApi.perRun,
      featuredCredits: 2,
      scorerCredits: 10,
      optionalCleanSheetFallbackCredits: 10
    },
    plannedCalls: {
      apiFootball: "cached bet catalogue, one fixture window, at most ten fixture odds",
      theOddsApi: "zero-credit events, two-credit featured markets, at most ten scorer markets, team totals only when required"
    }
  };
}

async function probeApiFootball(gameweek: number, rawDir: string, generatedAt: string, runId: string) {
  const key = process.env.api_football_com;
  if (!key) return { credential: "missing", validation: "not-called", discoveredMarkets: [] };
  const catalogPath = path.join(rawDir, "providers", "api-football.com", "bet-catalog.json");
  const details = await stat(catalogPath).catch(() => null);
  let payload: unknown;
  let source: "cache" | "network" = "cache";
  let requests = 0;
  let remaining: number | null = null;
  let used: number | null = null;
  let limit: number | null = null;
  if (details && (Date.parse(generatedAt) - details.mtimeMs) / 3_600_000 <= ODDS_BUDGETS.apiFootball.catalogTtlHours) {
    payload = await readJson(catalogPath, {});
  } else {
    const ledger = await readJson<LedgerEntry[]>(path.join(rawDir, "quota-ledger.json"), []);
    remaining = ledger.filter((entry) => entry.provider === "api-football.com").at(-1)?.reportedRemaining ?? null;
    const budget = apiFootballBudgetStatus(ledger, generatedAt, 1, remaining);
    if (budget) return { credential: "available", validation: "budget-blocked", reason: budget, discoveredMarkets: [] };
    const response = await responseJson(new URL("https://v3.football.api-sports.io/odds/bets"), {
      headers: { "x-apisports-key": key, accept: "application/json" }
    });
    payload = response.payload;
    source = "network";
    requests = 1;
    remaining = header(response.headers, "x-ratelimit-requests-remaining");
    used = header(response.headers, "x-ratelimit-requests-used");
    limit = header(response.headers, "x-ratelimit-requests-limit");
    await persist(rawDir, "api-football.com", runId, "probe-bet-catalog", payload);
    await mkdir(path.dirname(catalogPath), { recursive: true });
    await writeFile(catalogPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await appendLedger(rawDir, { provider: "api-football.com", generatedAt, gameweek, runId, requests, credits: 0, reportedRemaining: remaining, reportedUsed: used, reportedLimit: limit });
  }
  return {
    credential: "available",
    validation: source === "network" ? "validated" : "cached-catalog",
    catalogueSource: source,
    discoveredMarkets: [...new Set(parseApiFootballBetCatalog(payload).values())].sort(),
    requests,
    reportedRemaining: remaining,
    reportedUsed: used,
    reportedLimit: limit
  };
}

async function probeTheOddsApi(gameweek: number, rawDir: string, generatedAt: string, runId: string) {
  const key = process.env.the_odds_api_com;
  if (!key) return { credential: "missing", validation: "not-called", eventCount: 0, credits: 0 };
  const url = new URL("https://api.the-odds-api.com/v4/sports/soccer_epl/events");
  url.searchParams.set("apiKey", key);
  const response = await responseJson(url, { headers: { accept: "application/json" } });
  const credits = header(response.headers, "x-requests-last") ?? 0;
  const remaining = header(response.headers, "x-requests-remaining");
  const used = header(response.headers, "x-requests-used");
  await persist(rawDir, "the-odds-api.com", runId, "probe-events", response.payload);
  await appendLedger(rawDir, { provider: "the-odds-api.com", generatedAt, gameweek, runId, requests: 1, credits, reportedRemaining: remaining, reportedUsed: used });
  return {
    credential: "available",
    validation: "validated",
    eventCount: parseTheOddsEvents(response.payload).length,
    credits,
    reportedRemaining: remaining,
    reportedUsed: used,
    supportedRequestedMarkets: ["h2h", "totals", "player_goal_scorer_anytime", "team_totals"]
  };
}

async function main() {
  try { loadEnvFile(".env"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const gameweek = Number(argValue("--gw"));
  if (!Number.isInteger(gameweek) || gameweek < 1) throw new Error("Usage: pnpm odds:probe -- --gw <gameweek>");
  const generatedAt = new Date().toISOString();
  const runId = generatedAt.replace(/[:.]/g, "-");
  const rawDir = path.join("data", "raw", "odds");
  const apiFootball = await probeApiFootball(gameweek, rawDir, generatedAt, runId);
  const theOddsApi = await probeTheOddsApi(gameweek, rawDir, generatedAt, runId);
  console.log(JSON.stringify(oddsProbeReport({ gameweek, apiFootball, theOddsApi }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
