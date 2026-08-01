import { BENCH_SIZE, STARTING_XI_SIZE, VALID_FORMATIONS } from "./constants";
import type { ChipSelection, Position, ValidationResult } from "./types";

export type LineupPlayer = {
  id: number;
  position: Position;
  minutes: number;
  points?: number;
};

export type AutomaticSubstitutionInput = {
  players: LineupPlayer[];
  startingXI: number[];
  benchOrder: number[];
};

export type AutomaticSubstitutionResult = {
  startingXI: number[];
  substitutions: Array<{ outPlayerId: number; inPlayerId: number }>;
  validation: ValidationResult;
};

export type CaptaincyResolution = {
  scoringCaptainPlayerId: number | null;
  multiplier: 1 | 2 | 3;
};

function isLegalFormation(playersById: ReadonlyMap<number, LineupPlayer>, ids: number[]) {
  const counts: Record<Position, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };

  for (const id of ids) {
    const player = playersById.get(id);

    if (player) {
      counts[player.position] += 1;
    }
  }

  return Object.values(VALID_FORMATIONS).some((formation) =>
    formation.GKP === counts.GKP
    && formation.DEF === counts.DEF
    && formation.MID === counts.MID
    && formation.FWD === counts.FWD
  );
}

export function resolveAutomaticSubstitutions(
  input: AutomaticSubstitutionInput
): AutomaticSubstitutionResult {
  const validation: ValidationResult = { isValid: true, errors: [], warnings: [] };
  const playersById = new Map(input.players.map((player) => [player.id, player]));
  const lineupIds = [...input.startingXI, ...input.benchOrder];
  const duplicateId = lineupIds.find((id, index) => lineupIds.indexOf(id) !== index);
  const unknownIds = [...input.startingXI, ...input.benchOrder]
    .filter((id) => !playersById.has(id));

  if (input.startingXI.length !== STARTING_XI_SIZE || input.benchOrder.length !== BENCH_SIZE) {
    validation.isValid = false;
    validation.errors.push(`Lineup must contain ${STARTING_XI_SIZE} starters and ${BENCH_SIZE} substitutes.`);
  }

  if (duplicateId !== undefined) {
    validation.isValid = false;
    validation.errors.push(`Lineup contains duplicate player id ${duplicateId}.`);
  }

  if (unknownIds.length > 0) {
    validation.isValid = false;
    validation.errors.push(`Lineup contains unknown player id ${unknownIds[0]}.`);
  }

  if (validation.isValid && !isLegalFormation(playersById, input.startingXI)) {
    validation.isValid = false;
    validation.errors.push("Starting XI does not have a valid formation.");
  }

  if (!validation.isValid) {
    return { startingXI: [...input.startingXI], substitutions: [], validation };
  }

  let bestStartingXI = [...input.startingXI];
  let bestSubstitutions: Array<{ outPlayerId: number; inPlayerId: number }> = [];
  let bestSelection = "";

  function visit(
    benchIndex: number,
    currentXI: number[],
    missingStarterIds: number[],
    substitutions: Array<{ outPlayerId: number; inPlayerId: number }>,
    selection: string
  ) {
    if (benchIndex === input.benchOrder.length) {
      if (!isLegalFormation(playersById, currentXI)) {
        return;
      }

      if (
        substitutions.length > bestSubstitutions.length
        || (substitutions.length === bestSubstitutions.length && selection > bestSelection)
      ) {
        bestStartingXI = currentXI;
        bestSubstitutions = substitutions;
        bestSelection = selection;
      }
      return;
    }

    const benchId = input.benchOrder[benchIndex];
    const benchPlayer = playersById.get(benchId)!;
    visit(benchIndex + 1, currentXI, missingStarterIds, substitutions, `${selection}0`);

    if (benchPlayer.minutes <= 0) {
      return;
    }

    for (const missingId of missingStarterIds) {
      const missingPlayer = playersById.get(missingId)!;

      if ((benchPlayer.position === "GKP") !== (missingPlayer.position === "GKP")) {
        continue;
      }

      const nextXI = currentXI.map((id) => id === missingId ? benchId : id);
      visit(
        benchIndex + 1,
        nextXI,
        missingStarterIds.filter((id) => id !== missingId),
        [...substitutions, { outPlayerId: missingId, inPlayerId: benchId }],
        `${selection}1`
      );
    }
  }

  const missingStarterIds = input.startingXI.filter((id) => playersById.get(id)!.minutes <= 0);
  visit(0, [...input.startingXI], missingStarterIds, [], "");

  return { startingXI: bestStartingXI, substitutions: bestSubstitutions, validation };
}

export function resolveCaptaincy(input: {
  captainPlayerId: number;
  viceCaptainPlayerId: number;
  appearances: ReadonlyMap<number, number>;
  chip?: ChipSelection;
}): CaptaincyResolution {
  const multiplier = input.chip === "triple_captain" ? 3 : 2;

  if ((input.appearances.get(input.captainPlayerId) ?? 0) > 0) {
    return { scoringCaptainPlayerId: input.captainPlayerId, multiplier };
  }

  if ((input.appearances.get(input.viceCaptainPlayerId) ?? 0) > 0) {
    return { scoringCaptainPlayerId: input.viceCaptainPlayerId, multiplier };
  }

  return { scoringCaptainPlayerId: null, multiplier: 1 };
}

export function calculateTeamGameweekPoints(input: {
  players: LineupPlayer[];
  startingXI: number[];
  benchOrder: number[];
  captainPlayerId: number;
  viceCaptainPlayerId: number;
  chip?: ChipSelection;
  transferCost?: number;
}) {
  const substitutions = resolveAutomaticSubstitutions(input);
  const pointsById = new Map(input.players.map((player) => [player.id, player.points ?? 0]));
  const appearances = new Map(input.players.map((player) => [player.id, player.minutes]));
  const captaincy = resolveCaptaincy({
    captainPlayerId: input.captainPlayerId,
    viceCaptainPlayerId: input.viceCaptainPlayerId,
    appearances,
    chip: input.chip
  });
  const scoringIds = input.chip === "bench_boost"
    ? input.players.map((player) => player.id)
    : substitutions.startingXI;
  const basePoints = scoringIds.reduce((total, id) => total + (pointsById.get(id) ?? 0), 0);
  const captainPoints = captaincy.scoringCaptainPlayerId === null
    ? 0
    : (pointsById.get(captaincy.scoringCaptainPlayerId) ?? 0) * (captaincy.multiplier - 1);

  return {
    total: basePoints + captainPoints - (input.transferCost ?? 0),
    basePoints,
    captainPoints,
    transferCost: input.transferCost ?? 0,
    captaincy,
    substitutions
  };
}
