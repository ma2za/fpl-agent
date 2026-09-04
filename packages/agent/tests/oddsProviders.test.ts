import { describe, expect, it } from "vitest";
import {
  aggregateMarketPrices,
  parseApiFootballBetCatalog,
  parseApiFootballEvents,
  parseApiFootballOdds,
  parseTheOddsPrices
} from "../src";

describe("odds providers", () => {
  it("discovers and parses API-Football markets without fixed bet ids", () => {
    const event = parseApiFootballEvents({ response: [{ fixture: { id: 91, date: "2026-08-29T14:00:00Z" }, teams: { home: { name: "Chelsea" }, away: { name: "Brighton" } } }] })[0];
    const catalog = parseApiFootballBetCatalog({ response: [
      { id: 71, name: "Match Winner" }, { id: 82, name: "Goals Over/Under" },
      { id: 93, name: "Clean Sheet - Home" }, { id: 104, name: "Anytime Goalscorer" }
    ] });
    const prices = parseApiFootballOdds({
      event, marketIds: catalog, fetchedAt: "2026-08-28T10:00:00Z", sourceId: "api-football:event:91",
      payload: { response: [{ bookmakers: [{ name: "Book A", bets: [
        { id: 71, values: [{ value: "Home", odd: "1.80" }, { value: "Draw", odd: "3.60" }, { value: "Away", odd: "4.50" }] },
        { id: 82, values: [{ value: "Over 2.5", odd: "1.90" }, { value: "Under 2.5", odd: "2.00" }] },
        { id: 93, values: [{ value: "Yes", odd: "2.10" }, { value: "No", odd: "1.70" }] },
        { id: 104, values: [{ value: "Cole Palmer", odd: "2.20" }] }
      ] }] }] }
    });

    expect(catalog.get(104)).toBe("anytime-scorer");
    expect(prices).toHaveLength(8);
    expect(prices.find((price) => price.playerName === "Cole Palmer")?.market).toBe("anytime-scorer");
  });

  it("normalizes, matches and aggregates prices without discarding raw outcomes", () => {
    const base = {
      provider: "the-odds-api.com" as const,
      providerEventId: "event-1", homeTeam: "Chelsea", awayTeam: "Brighton", kickoffTime: "2026-08-29T14:00:00Z",
      fetchedAt: "2026-08-28T10:00:00Z", sourceId: "source"
    };
    const prices = parseTheOddsPrices({
      fetchedAt: base.fetchedAt, sourceId: base.sourceId,
      payload: { id: "event-1", home_team: "Chelsea", away_team: "Brighton", commence_time: base.kickoffTime, bookmakers: [{
        title: "Book A", markets: [
          { key: "h2h", outcomes: [{ name: "Chelsea", price: 1.8 }, { name: "Draw", price: 3.6 }, { name: "Brighton", price: 4.5 }] },
          { key: "totals", outcomes: [{ name: "Over", price: 1.9, point: 2.5 }, { name: "Under", price: 2, point: 2.5 }] },
          { key: "player_goal_scorer_anytime", outcomes: [{ name: "Yes", description: "Cole Palmer", price: 2.2 }] }
        ]
      }] }
    });
    const result = aggregateMarketPrices({
      prices,
      teams: [{ id: 1, name: "Chelsea" }, { id: 2, name: "Brighton" }],
      fixtures: [{ id: 7, event: 2, team_h: 1, team_a: 2, kickoff_time: base.kickoffTime }],
      players: [{ id: 10, team: 1, firstName: "Cole", secondName: "Palmer", webName: "Palmer" }],
      gameweek: 2,
      fetchedAt: base.fetchedAt
    });

    expect(result.bookmakerPrices).toHaveLength(6);
    expect(result.bookmakerPrices.every((price) => price.fixtureId === 7)).toBe(true);
    expect(result.snapshot.matches[0].homeWinProbability).toBeGreaterThan(0.5);
    expect(result.snapshot.matches[0].anytimeScorer?.[0]).toMatchObject({ playerId: 10, playerName: "Cole Palmer" });
    expect(result.bookmakerPrices.find((price) => price.market === "match-winner")).toMatchObject({
      deVigMethod: "proportional"
    });
    expect(result.bookmakerPrices.find((price) => price.market === "anytime-scorer")).toMatchObject({
      deVigMethod: "positive-only-unadjusted"
    });
  });

  it("deduplicates bookmakers, uses team-total clean-sheet equivalence and retains ambiguity", () => {
    const payload = {
      id: "event-1", home_team: "Chelsea", away_team: "Brighton", commence_time: "2026-08-29T14:00:00Z",
      bookmakers: [
        { title: "Book A", markets: [
          { key: "team_totals", outcomes: [
            { name: "Over", description: "Chelsea", price: 1.4, point: 0.5 }, { name: "Under", description: "Chelsea", price: 3.2, point: 0.5 },
            { name: "Over", description: "Brighton", price: 2, point: 0.5 }, { name: "Under", description: "Brighton", price: 1.8, point: 0.5 }
          ] },
          { key: "player_goal_scorer_anytime", outcomes: [{ name: "Yes", description: "Palmer", price: 2 }] }
        ] },
        { title: "Book B", markets: [
          { key: "player_goal_scorer_anytime", outcomes: [{ name: "Yes", description: "Palmer", price: 4 }] }
        ] }
      ]
    };
    const prices = parseTheOddsPrices({ payload, fetchedAt: "2026-08-28T10:00:00Z", sourceId: "source" });
    prices.push({ ...prices.find((price) => price.bookmaker === "Book A" && price.market === "anytime-scorer")!, provider: "api-football.com" });
    const base = {
      prices,
      teams: [{ id: 1, name: "Chelsea" }, { id: 2, name: "Brighton" }],
      players: [{ id: 10, team: 1, firstName: "Cole", secondName: "Palmer", webName: "Palmer" }],
      gameweek: 2,
      fetchedAt: "2026-08-28T10:00:00Z"
    };
    const matched = aggregateMarketPrices({
      ...base,
      fixtures: [{ id: 7, event: 2, team_h: 1, team_a: 2, kickoff_time: "2026-08-29T14:00:00Z" }]
    });
    expect(matched.snapshot.matches[0]).toMatchObject({
      homeCleanSheetProbability: expect.any(Number),
      awayCleanSheetProbability: expect.any(Number),
      anytimeScorer: [{ playerId: 10, probability: 0.375 }]
    });

    const ambiguous = aggregateMarketPrices({
      ...base,
      fixtures: [
        { id: 7, event: 2, team_h: 1, team_a: 2, kickoff_time: "2026-08-29T14:00:00Z" },
        { id: 8, event: 2, team_h: 1, team_a: 2, kickoff_time: "2026-08-29T15:00:00Z" }
      ]
    });
    expect(ambiguous.bookmakerPrices.every((price) => price.matchStatus === "ambiguous" && price.fixtureId === null)).toBe(true);
  });
});
