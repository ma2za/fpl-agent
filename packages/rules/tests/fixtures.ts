import type { PlayerForRules } from "../src";

function player(
  id: number,
  position: PlayerForRules["position"],
  teamId: number,
  price: number
): PlayerForRules {
  return {
    id,
    name: `Player ${id}`,
    nowCost: Math.round(price * 10),
    price,
    position,
    status: "a",
    teamId
  };
}

export const validSquad: PlayerForRules[] = [
  player(1, "GKP", 1, 5.5),
  player(2, "GKP", 2, 4.0),
  player(3, "DEF", 1, 6.0),
  player(4, "DEF", 2, 5.5),
  player(5, "DEF", 3, 5.0),
  player(6, "DEF", 4, 4.5),
  player(7, "DEF", 5, 4.0),
  player(8, "MID", 1, 10.0),
  player(9, "MID", 2, 8.5),
  player(10, "MID", 3, 7.5),
  player(11, "MID", 4, 6.5),
  player(12, "MID", 5, 5.0),
  player(13, "FWD", 3, 9.0),
  player(14, "FWD", 4, 7.5),
  player(15, "FWD", 5, 6.0)
];

export const validStartingXI = [1, 3, 4, 5, 8, 9, 10, 11, 13, 14, 15];
export const validBenchOrder = [2, 6, 7, 12];
