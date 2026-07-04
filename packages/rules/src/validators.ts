import {
  BENCH_SIZE,
  DEFAULT_STARTING_BUDGET,
  MAX_PLAYERS_PER_CLUB,
  REQUIRED_SQUAD_COUNTS,
  SQUAD_SIZE,
  STARTING_XI_SIZE,
  VALID_FORMATIONS
} from "./constants";
import { addError, addWarning, createResult, mergeResults } from "./result";
import type {
  BenchInput,
  CaptaincyInput,
  ChipValidationInput,
  DeadlineValidationInput,
  DraftSquadValidationInput,
  Formation,
  PlayerForRules,
  Position,
  SquadValidationInput,
  StartingXIInput,
  TransferValidationInput,
  ValidationResult
} from "./types";

const positions: Position[] = ["GKP", "DEF", "MID", "FWD"];

function countByPosition(players: PlayerForRules[]) {
  const counts: Record<Position, number> = {
    GKP: 0,
    DEF: 0,
    MID: 0,
    FWD: 0
  };

  for (const player of players) {
    if (positions.includes(player.position as Position)) {
      counts[player.position as Position] += 1;
    }
  }

  return counts;
}

function duplicateIds(ids: number[]) {
  const seen = new Set<number>();
  const duplicates = new Set<number>();

  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.add(id);
    }
    seen.add(id);
  }

  return [...duplicates];
}

function playerIds(players: PlayerForRules[]) {
  return new Set(players.map((player) => player.id));
}

function totalPrice(players: PlayerForRules[]) {
  return players.reduce((sum, player) => sum + player.price, 0);
}

function expectedTransferCost(moveCount: number, freeTransfers: number) {
  return Math.max(0, moveCount - freeTransfers) * 4;
}

export function validateSquad(input: SquadValidationInput): ValidationResult {
  const result = createResult();
  const budget = input.budget ?? DEFAULT_STARTING_BUDGET;
  const maxPlayersPerClub = input.maxPlayersPerClub ?? MAX_PLAYERS_PER_CLUB;

  if (input.players.length !== SQUAD_SIZE) {
    addError(result, `Squad must contain ${SQUAD_SIZE} players.`);
  }

  for (const duplicateId of duplicateIds(input.players.map((player) => player.id))) {
    addError(result, `Squad contains duplicate player id ${duplicateId}.`);
  }

  const counts = countByPosition(input.players);

  for (const position of positions) {
    if (counts[position] !== REQUIRED_SQUAD_COUNTS[position]) {
      addError(
        result,
        `Squad must contain ${REQUIRED_SQUAD_COUNTS[position]} ${position} players.`
      );
    }
  }

  const squadPrice = totalPrice(input.players);

  if (squadPrice > budget) {
    addError(result, `Squad cost ${squadPrice.toFixed(1)} exceeds budget ${budget.toFixed(1)}.`);
  }

  const clubCounts = new Map<number, number>();

  for (const player of input.players) {
    clubCounts.set(player.teamId, (clubCounts.get(player.teamId) ?? 0) + 1);
  }

  for (const [teamId, count] of clubCounts) {
    if (count > maxPlayersPerClub) {
      addError(result, `Squad has ${count} players from team ${teamId}; maximum is ${maxPlayersPerClub}.`);
    }
  }

  return result;
}

export function validateStartingXI(input: StartingXIInput): ValidationResult {
  const result = createResult();
  const formation = input.formation as Formation;
  const squadIds = playerIds(input.squad);

  if (!Object.hasOwn(VALID_FORMATIONS, formation)) {
    addError(result, `Formation ${input.formation} is not valid.`);
    return result;
  }

  if (input.startingXI.length !== STARTING_XI_SIZE) {
    addError(result, `Starting XI must contain ${STARTING_XI_SIZE} players.`);
  }

  for (const duplicateId of duplicateIds(input.startingXI)) {
    addError(result, `Starting XI contains duplicate player id ${duplicateId}.`);
  }

  for (const id of input.startingXI) {
    if (!squadIds.has(id)) {
      addError(result, `Starting XI player id ${id} is not in the squad.`);
    }
  }

  const starters = input.squad.filter((player) => input.startingXI.includes(player.id));
  const counts = countByPosition(starters);
  const expectedCounts = VALID_FORMATIONS[formation];

  for (const position of positions) {
    if (counts[position] !== expectedCounts[position]) {
      addError(result, `Formation ${formation} requires ${expectedCounts[position]} ${position} starters.`);
    }
  }

  return result;
}

export function validateBench(input: BenchInput): ValidationResult {
  const result = createResult();
  const squadIds = playerIds(input.squad);
  const startingIds = new Set(input.startingXI);

  if (input.benchOrder.length !== BENCH_SIZE) {
    addError(result, `Bench order must contain ${BENCH_SIZE} players.`);
  }

  for (const duplicateId of duplicateIds(input.benchOrder)) {
    addError(result, `Bench order contains duplicate player id ${duplicateId}.`);
  }

  for (const id of input.benchOrder) {
    if (!squadIds.has(id)) {
      addError(result, `Bench player id ${id} is not in the squad.`);
    }

    if (startingIds.has(id)) {
      addError(result, `Bench player id ${id} is also in the starting XI.`);
    }
  }

  const expectedBenchIds = input.squad
    .map((player) => player.id)
    .filter((id) => !startingIds.has(id))
    .sort((a, b) => a - b);
  const actualBenchIds = [...input.benchOrder].sort((a, b) => a - b);

  if (expectedBenchIds.join(",") !== actualBenchIds.join(",")) {
    addError(result, "Bench order must contain every non-starting squad player exactly once.");
  }

  return result;
}

export function validateCaptaincy(input: CaptaincyInput): ValidationResult {
  const result = createResult();
  const ids = playerIds(input.squad);

  if (input.captainPlayerId === null) {
    addError(result, "Captain is required.");
  }

  if (input.viceCaptainPlayerId === null) {
    addError(result, "Vice-captain is required.");
  }

  if (input.captainPlayerId !== null && !ids.has(input.captainPlayerId)) {
    addError(result, `Captain player id ${input.captainPlayerId} is not in the squad.`);
  }

  if (input.viceCaptainPlayerId !== null && !ids.has(input.viceCaptainPlayerId)) {
    addError(result, `Vice-captain player id ${input.viceCaptainPlayerId} is not in the squad.`);
  }

  if (
    input.captainPlayerId !== null &&
    input.viceCaptainPlayerId !== null &&
    input.captainPlayerId === input.viceCaptainPlayerId
  ) {
    addError(result, "Captain and vice-captain must be different players.");
  }

  return result;
}

export function validateTransfers(input: TransferValidationInput): ValidationResult {
  const result = createResult();

  if (input.freeTransfers < 0) {
    addError(result, "Free transfers cannot be negative.");
  }

  for (const move of input.moves) {
    if (move.sellPlayerId === move.buyPlayerId) {
      addError(result, `Transfer cannot sell and buy the same player id ${move.sellPlayerId}.`);
    }
  }

  const sellIds = input.moves.map((move) => move.sellPlayerId);
  const buyIds = input.moves.map((move) => move.buyPlayerId);

  for (const duplicateId of duplicateIds(sellIds)) {
    addError(result, `Transfer list sells player id ${duplicateId} more than once.`);
  }

  for (const duplicateId of duplicateIds(buyIds)) {
    addError(result, `Transfer list buys player id ${duplicateId} more than once.`);
  }

  const expectedCost = input.wildcardActive || input.freeHitActive
    ? 0
    : expectedTransferCost(input.moves.length, input.freeTransfers);

  if (input.expectedTransferCost !== expectedCost) {
    addError(result, `Transfer cost must be ${expectedCost}, received ${input.expectedTransferCost}.`);
  }

  return result;
}

export function validateChip(input: ChipValidationInput): ValidationResult {
  const result = createResult();

  if (input.chip === "none") {
    return result;
  }

  if (!input.chipsAvailable.includes(input.chip)) {
    addError(result, `Chip ${input.chip} is not available.`);
  }

  return result;
}

export function validateDeadline(input: DeadlineValidationInput): ValidationResult {
  const result = createResult();

  if (input.deadlineStatus === "passed" && !input.force) {
    addError(result, "Deadline has passed.");
  }

  if (input.deadlineStatus === "unknown") {
    addWarning(result, "Deadline status is unknown.");
  }

  return result;
}

export function validateDraftSquad(input: DraftSquadValidationInput): ValidationResult {
  const result = mergeResults(
    validateSquad({
      players: input.players,
      budget: input.budget
    }),
    validateDeadline({
      deadlineStatus: input.deadlineStatus ?? "unknown"
    })
  );

  if (input.dataMode === "provisional") {
    addWarning(
      result,
      "Provisional mode: player IDs, prices, fixtures, and availability may be stale until official FPL GW1 data is live."
    );
    return result;
  }

  if (!input.officialGw1Available) {
    addError(result, "Official GW1 FPL data is not available.");
  }

  return result;
}
