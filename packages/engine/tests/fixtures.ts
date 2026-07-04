import type { PlayerForEngine } from "../src";

function player(
  id: number,
  position: PlayerForEngine["position"],
  teamId: number,
  price: number,
  totalPoints: number,
  minutes: number,
  form: number
): PlayerForEngine {
  return {
    id,
    name: `Player ${id}`,
    nowCost: Math.round(price * 10),
    price,
    position,
    status: "a",
    teamId,
    chanceOfPlayingNextRound: 100,
    expectedPointsNext: null,
    expectedPointsThis: null,
    form,
    minutes,
    selectedByPercent: 10,
    totalPoints
  };
}

export const engineSquad: PlayerForEngine[] = [
  player(1, "GKP", 1, 5.5, 160, 3000, 4),
  player(2, "GKP", 2, 4.0, 60, 1200, 2),
  player(3, "DEF", 1, 6.0, 170, 2800, 5),
  player(4, "DEF", 2, 5.5, 140, 2600, 4),
  player(5, "DEF", 3, 5.0, 110, 2400, 3),
  player(6, "DEF", 4, 4.5, 75, 1800, 2),
  player(7, "DEF", 5, 4.0, 55, 1100, 1),
  player(8, "MID", 1, 10.0, 230, 3000, 7),
  player(9, "MID", 2, 8.5, 190, 2800, 6),
  player(10, "MID", 3, 7.5, 150, 2500, 4),
  player(11, "MID", 4, 6.5, 120, 2300, 3),
  player(12, "MID", 5, 5.0, 70, 1400, 2),
  player(13, "FWD", 3, 9.0, 210, 2900, 7),
  player(14, "FWD", 4, 7.5, 150, 2300, 4),
  player(15, "FWD", 5, 6.0, 90, 1700, 2)
];

export const transferPool: PlayerForEngine[] = [
  ...engineSquad,
  player(20, "FWD", 6, 6.5, 160, 2400, 5),
  player(21, "MID", 6, 6.0, 140, 2200, 5)
];
