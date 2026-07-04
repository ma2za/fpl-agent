import type { Formation, Position } from "./types";

export const DEFAULT_STARTING_BUDGET = 100;
export const MAX_PLAYERS_PER_CLUB = 3;
export const SQUAD_SIZE = 15;
export const STARTING_XI_SIZE = 11;
export const BENCH_SIZE = 4;

export const REQUIRED_SQUAD_COUNTS: Record<Position, number> = {
  GKP: 2,
  DEF: 5,
  MID: 5,
  FWD: 3
};

export const VALID_FORMATIONS: Record<Formation, Record<Position, number>> = {
  "3-4-3": { GKP: 1, DEF: 3, MID: 4, FWD: 3 },
  "3-5-2": { GKP: 1, DEF: 3, MID: 5, FWD: 2 },
  "4-3-3": { GKP: 1, DEF: 4, MID: 3, FWD: 3 },
  "4-4-2": { GKP: 1, DEF: 4, MID: 4, FWD: 2 },
  "4-5-1": { GKP: 1, DEF: 4, MID: 5, FWD: 1 },
  "5-3-2": { GKP: 1, DEF: 5, MID: 3, FWD: 2 },
  "5-4-1": { GKP: 1, DEF: 5, MID: 4, FWD: 1 }
};
