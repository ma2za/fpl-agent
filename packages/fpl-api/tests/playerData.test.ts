import { describe, expect, it } from "vitest";
import { buildOfficialPlayerData, resolvePlayerSelectors, type NormalizedPlayer } from "../src";

const players: NormalizedPlayer[] = [
  {
    id: 1,
    name: "Erling Haaland",
    webName: "Haaland",
    nowCost: 155,
    price: 15.5,
    position: "FWD",
    team: "Man City",
    teamId: 15,
    elementType: 4,
    status: "a",
    chanceOfPlayingNextRound: null,
    chanceOfPlayingThisRound: null,
    expectedPointsNext: 6,
    expectedPointsThis: null,
    form: 0,
    minutes: 2953,
    selectedByPercent: 75,
    totalPoints: 200
  },
  {
    id: 2,
    name: "João Pedro",
    webName: "João Pedro",
    nowCost: 75,
    price: 7.5,
    position: "FWD",
    team: "Chelsea",
    teamId: 6,
    elementType: 4,
    status: "a",
    chanceOfPlayingNextRound: null,
    chanceOfPlayingThisRound: null,
    expectedPointsNext: 5,
    expectedPointsThis: null,
    form: 0,
    minutes: 2658,
    selectedByPercent: 50,
    totalPoints: 150
  }
];

describe("official player data", () => {
  it("resolves IDs, web names, full names and unaccented names", () => {
    expect(resolvePlayerSelectors(players, ["1", "Joao Pedro", "Erling Haaland"]).map((player) => player.id))
      .toEqual([1, 2, 1]);
  });

  it("rejects selectors that do not match official data", () => {
    expect(() => resolvePlayerSelectors(players, ["Unknown Player"]))
      .toThrow("did not match an official FPL player");
  });

  it("keeps source URLs and official history separate from normalized profile data", () => {
    const data = buildOfficialPlayerData({
      retrievedAt: "2026-08-03T12:00:00.000Z",
      rawPlayer: {
        id: 1,
        first_name: "Erling",
        second_name: "Haaland",
        web_name: "Haaland",
        element_type: 4,
        team: 15,
        now_cost: 155,
        status: "a"
      },
      player: players[0],
      summary: { fixtures: [{ event: 1 }], history: [], history_past: [{ season_name: "2025/26" }] }
    });

    expect(data.source.profileUrl).toContain("element-summary/1");
    expect(data.player.price).toBe(15.5);
    expect(data.fixtures).toEqual([{ event: 1 }]);
    expect(data.previousSeasons).toEqual([{ season_name: "2025/26" }]);
  });
});
