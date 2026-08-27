import { describe, expect, it } from "vitest";
import { eligibleNewsDiscoveryPlayers } from "./discover-player-news";

describe("news discovery player selection", () => {
  const players = [{ playerId: 1 }, { playerId: 2 }, { playerId: 3 }, { playerId: 4 }];
  const probabilities = new Map([[1, 0.95], [2, 0.9], [3, 0.89], [4, 0.2]]);

  it("unions the appearance threshold with explicitly included squad players", () => {
    expect(eligibleNewsDiscoveryPlayers(players, probabilities, 0.9, null, new Set([3])))
      .toEqual([{ playerId: 1 }, { playerId: 2 }, { playerId: 3 }]);
  });

  it("keeps the optional player restriction outside the threshold union", () => {
    expect(eligibleNewsDiscoveryPlayers(players, probabilities, 0.9, new Set([2, 3, 4]), new Set([3, 4])))
      .toEqual([{ playerId: 2 }, { playerId: 3 }, { playerId: 4 }]);
  });
});
