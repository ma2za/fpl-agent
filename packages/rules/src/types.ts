import type { NormalizedPlayer } from "../../fpl-api/src";

export type Position = "GKP" | "DEF" | "MID" | "FWD";
export type Chip = "wildcard" | "free_hit" | "bench_boost" | "triple_captain";
export type ChipSelection = "none" | Chip;
export type DeadlineStatus = "open" | "passed" | "unknown";
export type DataMode = "official" | "provisional";
export type CompetitionPhase =
  | "PRESEASON_DRAFT"
  | "LIVE_GAMEWEEK"
  | "TRANSFER_WINDOW"
  | "FINAL_LOCKDOWN"
  | "SEASON_COMPLETE";
export type DeadlineProximity =
  | "early"
  | "approaching"
  | "imminent"
  | "passed"
  | "unknown";
export type CompetitionAction =
  | "retain_draft"
  | "modify_draft"
  | "rebuild_structure"
  | "wait_for_information"
  | "lock_draft"
  | "monitor"
  | "review_live_gameweek"
  | "roll"
  | "transfer"
  | "hit"
  | "wildcard"
  | "free_hit"
  | "wait_for_finalization"
  | "review_season";
export type Formation = "3-4-3" | "3-5-2" | "4-3-3" | "4-4-2" | "4-5-1" | "5-3-2" | "5-4-1";

export type ValidationResult = {
  isValid: boolean;
  errors: string[];
  warnings: string[];
};

export type PlayerForRules = Pick<
  NormalizedPlayer,
  "id" | "name" | "position" | "teamId" | "price" | "nowCost" | "status"
> & {
  minutes?: number | null;
};

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

export type CompetitionEvent = {
  id: number;
  deadlineTime: string;
  finished: boolean;
  isCurrent: boolean;
  isNext: boolean;
};

export type CompetitionState = {
  phase: CompetitionPhase;
  deadlineProximity: DeadlineProximity;
  activeGameweek: number | null;
  nextDeadline: string | null;
};
