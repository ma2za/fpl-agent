import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiFootballBudgetStatus,
  fetchApiFootballMarkets,
  fetchTheOddsApiMarkets,
  theOddsApiBudgetStatus
} from "./odds-provider-client";

const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fpl-odds-provider-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env.api_football_com;
  delete process.env.the_odds_api_com;
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("odds provider budgets", () => {
  it("blocks API-Football daily exhaustion and reserve breaches", () => {
    const ledger = [{ provider: "api-football.com" as const, generatedAt: "2026-08-28T01:00:00Z", gameweek: 2, runId: "a", requests: 20, credits: 0, reportedRemaining: 80 }];
    expect(apiFootballBudgetStatus(ledger, "2026-08-28T12:00:00Z", 5, 80)).toContain("UTC-day");
    expect(apiFootballBudgetStatus([], "2026-08-28T12:00:00Z", 1, 50)).toContain("reserve");
  });

  it("blocks The Odds API gameweek, month, snapshot and reserve limits", () => {
    const ledger = [
      { provider: "the-odds-api.com" as const, generatedAt: "2026-08-20T01:00:00Z", gameweek: 2, runId: "a", requests: 11, credits: 22, reportedRemaining: 400 },
      { provider: "the-odds-api.com" as const, generatedAt: "2026-08-21T01:00:00Z", gameweek: 2, runId: "b", requests: 11, credits: 22, reportedRemaining: 378 },
      { provider: "the-odds-api.com" as const, generatedAt: "2026-08-22T01:00:00Z", gameweek: 2, runId: "c", requests: 11, credits: 20, reportedRemaining: 358 }
    ];
    expect(theOddsApiBudgetStatus(ledger, { generatedAt: "2026-08-28T12:00:00Z", gameweek: 2, requested: 1, providerRemaining: 358, runId: "d" })).toContain("snapshot");
    expect(theOddsApiBudgetStatus([], { generatedAt: "2026-08-28T12:00:00Z", gameweek: 2, requested: 1, providerRemaining: 100, runId: "d" })).toContain("reserve");
  });

  it("retains API-Football pagination gaps, reuses fresh cache and replays offline without storing the key", async () => {
    const rawDir = await temporaryDirectory();
    process.env.api_football_com = "api-football-secret";
    const fetchImpl = vi.fn(async (request: string | URL | Request) => {
      const url = request.toString();
      const headers = { "x-ratelimit-requests-limit": "100", "x-ratelimit-requests-remaining": "97", "x-ratelimit-requests-used": "3" };
      if (url.endsWith("/odds/bets")) return new Response(JSON.stringify({ response: [{ id: 1, name: "Match Winner" }] }), { status: 200, headers });
      if (url.includes("/fixtures?")) return new Response(JSON.stringify({ response: [{ fixture: { id: 91, date: "2026-08-29T14:00:00Z" }, teams: { home: { name: "Chelsea" }, away: { name: "Brighton" } } }] }), { status: 200, headers });
      return new Response(JSON.stringify({ paging: { current: 1, total: 2 }, response: [{ bookmakers: [{ name: "Book A", bets: [{ id: 1, values: [{ value: "Home", odd: "1.8" }, { value: "Draw", odd: "3.5" }, { value: "Away", odd: "4.5" }] }] }] }] }), { status: 200, headers });
    }) as unknown as typeof fetch;
    const input = {
      gameweek: 2,
      teams: [{ id: 1, name: "Chelsea" }, { id: 2, name: "Brighton" }] as any,
      fixtures: [{ id: 7, event: 2, team_h: 1, team_a: 2, kickoff_time: "2026-08-29T14:00:00Z" }] as any,
      rawDir,
      generatedAt: "2026-08-28T10:00:00Z",
      fetchImpl
    };
    const first = await fetchApiFootballMarkets(input);
    const cached = await fetchApiFootballMarkets({ ...input, generatedAt: "2026-08-28T11:00:00Z" });
    const offline = await fetchApiFootballMarkets({ ...input, generatedAt: "2026-09-01T11:00:00Z", offline: true });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(first.result?.warnings.join(" ")).toContain("page 1/2");
    expect(first.result).toMatchObject({ requestCount: 3, reportedLimit: 100, reportedRemaining: 97, reportedUsed: 3 });
    expect(cached.result?.fromCache).toBe(true);
    expect(offline.result?.fromCache).toBe(true);
    const manifest = await readFile(path.join(rawDir, "providers", "api-football.com", "latest-success.json"), "utf8");
    const ledger = await readFile(path.join(rawDir, "quota-ledger.json"), "utf8");
    expect(`${manifest}${ledger}`).not.toContain("api-football-secret");
    expect(await stat(path.join(rawDir, "snapshots", "api-football.com", "2026-08-28T10-00-00Z"))).toBeDefined();
  });

  it("reconciles The Odds API response costs and stores a quota-safe snapshot", async () => {
    const rawDir = await temporaryDirectory();
    process.env.the_odds_api_com = "odds-api-secret";
    let call = 0;
    const payloads = [
      [{ id: "event-1", home_team: "Chelsea", away_team: "Brighton", commence_time: "2026-08-29T14:00:00Z" }],
      [],
      { id: "event-1", home_team: "Chelsea", away_team: "Brighton", commence_time: "2026-08-29T14:00:00Z", bookmakers: [] }
    ];
    const costs = [0, 2, 0];
    const fetchImpl = vi.fn(async () => {
      const index = call++;
      return new Response(JSON.stringify(payloads[index]), { status: 200, headers: {
        "x-requests-last": String(costs[index]), "x-requests-used": "2", "x-requests-remaining": "498"
      } });
    }) as unknown as typeof fetch;
    const result = await fetchTheOddsApiMarkets({
      gameweek: 2,
      teams: [{ id: 1, name: "Chelsea" }, { id: 2, name: "Brighton" }] as any,
      fixtures: [{ id: 7, event: 2, team_h: 1, team_a: 2, kickoff_time: "2026-08-29T14:00:00Z" }] as any,
      rawDir,
      generatedAt: "2026-08-28T10:00:00Z",
      needsTeamTotals: new Set(),
      fetchImpl
    });

    expect(result.result).toMatchObject({ requestCount: 3, creditsUsed: 2, reportedUsed: 2, reportedRemaining: 498 });
    expect(await readFile(path.join(rawDir, "quota-ledger.json"), "utf8")).not.toContain("odds-api-secret");
  });
});
