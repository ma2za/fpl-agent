import { addError, createResult } from "./result";
import type { Chip, ChipSelection, Position, ValidationResult } from "./types";

export const SUPPORTED_RULES_SEASON = "2026-27" as const;

export type SupportedRulesSeason = typeof SUPPORTED_RULES_SEASON;

export type ChipSet = Record<Chip, boolean>;

export type SeasonChipInventory = {
  firstHalf: ChipSet;
  secondHalf: ChipSet;
};

export type SeasonRules = {
  season: SupportedRulesSeason;
  gameweeks: number;
  firstHalfLastGameweek: number;
  maxFreeTransfers: number;
  transferCost: number;
  scoring: {
    goalPoints: Record<Position, number>;
    cleanSheetPoints: Record<Position, number>;
    defensiveContributionThreshold: Record<Exclude<Position, "GKP">, number>;
  };
  bonusPointsSystem: {
    tackledPenalty: number;
    clearancesBlocksInterceptionsPerPoint: number;
    save: number;
    insideBoxSaveExtra: number;
    bigChanceSaveExtra: number;
    penaltySave: number;
  };
};

export type SeasonChipValidationInput = {
  season: string;
  gameweek: number;
  chips: Chip[];
  inventory: SeasonChipInventory;
  previousGameweekChip?: ChipSelection;
};

export type SeasonTransferValidationInput = {
  season: string;
  freeTransfers: number;
  moveCount: number;
  expectedTransferCost: number;
  chip?: ChipSelection;
};

export const FPL_2026_27_RULES: SeasonRules = {
  season: SUPPORTED_RULES_SEASON,
  gameweeks: 38,
  firstHalfLastGameweek: 19,
  maxFreeTransfers: 5,
  transferCost: 4,
  scoring: {
    goalPoints: { GKP: 10, DEF: 6, MID: 5, FWD: 4 },
    cleanSheetPoints: { GKP: 4, DEF: 4, MID: 1, FWD: 0 },
    defensiveContributionThreshold: { DEF: 10, MID: 12, FWD: 12 }
  },
  bonusPointsSystem: {
    tackledPenalty: 0,
    clearancesBlocksInterceptionsPerPoint: 3,
    save: 2,
    insideBoxSaveExtra: 1,
    bigChanceSaveExtra: 1,
    penaltySave: 7
  }
};

export function getSeasonRules(season: string): SeasonRules | null {
  return season === SUPPORTED_RULES_SEASON ? FPL_2026_27_RULES : null;
}

function requireRules(season: string) {
  const rules = getSeasonRules(season);

  if (!rules) {
    throw new Error(`Unsupported FPL rules season: ${season}.`);
  }

  return rules;
}

function validateSeason(result: ValidationResult, season: string) {
  const rules = getSeasonRules(season);

  if (!rules) {
    addError(result, `Unsupported FPL rules season: ${season}.`);
  }

  return rules;
}

export function createFullChipSet(): ChipSet {
  return {
    wildcard: true,
    free_hit: true,
    bench_boost: true,
    triple_captain: true
  };
}

export function createSeasonChipInventory(): SeasonChipInventory {
  return {
    firstHalf: createFullChipSet(),
    secondHalf: createFullChipSet()
  };
}

export function adaptLegacyChipInventory(
  chipsAvailable: Chip[],
  gameweek: number
): SeasonChipInventory {
  const inventory = createSeasonChipInventory();
  const activeSet: ChipSet = {
    wildcard: chipsAvailable.includes("wildcard"),
    free_hit: chipsAvailable.includes("free_hit"),
    bench_boost: chipsAvailable.includes("bench_boost"),
    triple_captain: chipsAvailable.includes("triple_captain")
  };

  if (gameweek <= FPL_2026_27_RULES.firstHalfLastGameweek) {
    inventory.firstHalf = activeSet;
  } else {
    inventory.secondHalf = activeSet;
  }

  return inventory;
}

export function validateSeasonChip(input: SeasonChipValidationInput): ValidationResult {
  const result = createResult();
  const rules = validateSeason(result, input.season);

  if (!rules) {
    return result;
  }

  if (!Number.isInteger(input.gameweek) || input.gameweek < 1 || input.gameweek > rules.gameweeks) {
    addError(result, `Gameweek must be between 1 and ${rules.gameweeks}.`);
    return result;
  }

  if (input.chips.length > 1) {
    addError(result, "Only one chip can be played in a gameweek.");
  }

  const chip = input.chips[0];

  if (!chip) {
    return result;
  }

  const set = input.gameweek <= rules.firstHalfLastGameweek
    ? input.inventory.firstHalf
    : input.inventory.secondHalf;

  if (!set[chip]) {
    addError(result, `Chip ${chip} is not available in this half of the season.`);
  }

  if (chip === "free_hit" && input.gameweek === 1) {
    addError(result, "Free Hit cannot be played in Gameweek 1.");
  }

  if (chip === "free_hit" && input.previousGameweekChip === "free_hit") {
    addError(result, "Free Hit cannot be played in consecutive gameweeks.");
  }

  return result;
}

export function calculateTransferCost(
  season: string,
  moveCount: number,
  freeTransfers: number,
  chip: ChipSelection = "none"
) {
  const rules = requireRules(season);

  if (chip === "wildcard" || chip === "free_hit") {
    return 0;
  }

  return Math.max(0, moveCount - freeTransfers) * rules.transferCost;
}

export function validateSeasonTransfers(input: SeasonTransferValidationInput): ValidationResult {
  const result = createResult();
  const rules = validateSeason(result, input.season);

  if (!rules) {
    return result;
  }

  if (!Number.isInteger(input.freeTransfers) || input.freeTransfers < 0 || input.freeTransfers > rules.maxFreeTransfers) {
    addError(result, `Free transfers must be an integer between 0 and ${rules.maxFreeTransfers}.`);
  }

  if (!Number.isInteger(input.moveCount) || input.moveCount < 0) {
    addError(result, "Transfer count must be a non-negative integer.");
    return result;
  }

  if (!result.isValid) {
    return result;
  }

  const expectedCost = calculateTransferCost(
    input.season,
    input.moveCount,
    input.freeTransfers,
    input.chip
  );

  if (input.expectedTransferCost !== expectedCost) {
    addError(result, `Transfer cost must be ${expectedCost}, received ${input.expectedTransferCost}.`);
  }

  return result;
}

export function calculateNextFreeTransfers(
  season: string,
  currentFreeTransfers: number,
  transfersUsed: number,
  chip: ChipSelection = "none"
) {
  const rules = requireRules(season);

  if (chip === "wildcard" || chip === "free_hit") {
    return Math.min(rules.maxFreeTransfers, currentFreeTransfers);
  }

  return Math.min(
    rules.maxFreeTransfers,
    Math.max(0, currentFreeTransfers - transfersUsed) + 1
  );
}

export function calculateSellingPrice(purchasePriceTenths: number, currentPriceTenths: number) {
  if (currentPriceTenths <= purchasePriceTenths) {
    return currentPriceTenths;
  }

  return purchasePriceTenths + Math.floor((currentPriceTenths - purchasePriceTenths) / 2);
}
