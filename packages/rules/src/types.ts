import type { NormalizedPlayer } from "../../fpl-api/src";

export type Position = "GKP" | "DEF" | "MID" | "FWD";
export type Chip = "wildcard" | "free_hit" | "bench_boost" | "triple_captain";
export type ChipSelection = "none" | Chip;
export type DeadlineStatus = "open" | "passed" | "unknown";
export type DataMode = "official" | "provisional";
export type Formation = "3-4-3" | "3-5-2" | "4-3-3" | "4-4-2" | "4-5-1" | "5-3-2" | "5-4-1";

export type ValidationResult = {
  isValid: boolean;
  errors: string[];
  warnings: string[];
};

export type PlayerForRules = Pick<
  NormalizedPlayer,
  "id" | "name" | "position" | "teamId" | "price" | "nowCost" | "status"
>;

export type SquadValidationInput = {
  players: PlayerForRules[];
  budget?: number;
  maxPlayersPerClub?: number;
};

export type StartingXIInput = {
  squad: PlayerForRules[];
  startingXI: number[];
  formation: string;
};

export type BenchInput = {
  squad: PlayerForRules[];
  startingXI: number[];
  benchOrder: number[];
};

export type CaptaincyInput = {
  squad: PlayerForRules[];
  captainPlayerId: number | null;
  viceCaptainPlayerId: number | null;
};

export type TransferMove = {
  sellPlayerId: number;
  buyPlayerId: number;
};

export type TransferValidationInput = {
  freeTransfers: number;
  moves: TransferMove[];
  expectedTransferCost: number;
  wildcardActive?: boolean;
  freeHitActive?: boolean;
};

export type ChipValidationInput = {
  chip: ChipSelection;
  chipsAvailable: Chip[];
};

export type DeadlineValidationInput = {
  deadlineStatus: DeadlineStatus;
  force?: boolean;
};

export type DraftSquadValidationInput = {
  players: PlayerForRules[];
  budget?: number;
  dataMode?: DataMode;
  officialGw1Available?: boolean;
  deadlineStatus?: DeadlineStatus;
};
