import {
  SUPPORTED_RULES_SEASON,
  calculateNextFreeTransfers,
  calculateSellingPrice,
  calculateTransferCost,
  validateSeasonTransfers,
  validateSquad
} from "../../rules/src";
import type { PlayerForEngine, PlayerProjection, TransferCandidate } from "./types";

export type TransferPlanningHorizon = "GW1" | "GW1-3" | "GW1-5";

export type TransferScenarioInput = {
  squad: PlayerForEngine[];
  candidates: PlayerForEngine[];
  projections: PlayerProjection[];
  projections3GW?: PlayerProjection[];
  projections5GW?: PlayerProjection[];
  downsideProjections?: PlayerProjection[];
  freeTransfers: number;
  bank: number;
  moves: Array<{ sellPlayerId: number; buyPlayerId: number }>;
  rankingHorizon?: TransferPlanningHorizon;
  purchasePricesTenths?: Record<number, number>;
  optionValuePerAdditionalFreeTransfer?: number;
  chip?: "none" | "wildcard" | "free_hit";
  season?: string;
};

export type TransferCandidateGenerationInput = Omit<TransferScenarioInput, "moves"> & {
  limit?: number;
};

function projectionMap(projections?: PlayerProjection[]) {
  return projections ? new Map(projections.map((projection) => [projection.playerId, projection.projectedPoints])) : null;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function gainForMoves(
  moves: TransferScenarioInput["moves"],
  points: Map<number, number> | null
) {
  if (!points) return null;
  let gain = 0;
  for (const move of moves) {
    const sell = points.get(move.sellPlayerId);
    const buy = points.get(move.buyPlayerId);
    if (sell === undefined || buy === undefined) return null;
    gain += buy - sell;
  }
  return round(gain);
}

function sellingPriceTenths(
  player: PlayerForEngine,
  purchasePricesTenths?: Record<number, number>
) {
  const purchasePrice = purchasePricesTenths?.[player.id];
  return purchasePrice === undefined
    ? player.nowCost
    : calculateSellingPrice(purchasePrice, player.nowCost);
}

function squadValidation(players: PlayerForEngine[]) {
  const currentCost = players.reduce((total, player) => total + player.price, 0);
  return validateSquad({ players, budget: currentCost + 0.001 });
}

function countReachableSquads(input: {
  squad: PlayerForEngine[];
  candidates: PlayerForEngine[];
  bankTenths: number;
  purchasePricesTenths?: Record<number, number>;
}) {
  const squadIds = new Set(input.squad.map((player) => player.id));
  let reachable = 1;

  for (const sell of input.squad) {
    const salePrice = sellingPriceTenths(sell, input.purchasePricesTenths);
    for (const buy of input.candidates) {
      if (squadIds.has(buy.id) || buy.position !== sell.position || buy.nowCost > salePrice + input.bankTenths) continue;
      const nextSquad = input.squad.map((player) => player.id === sell.id ? buy : player);
      if (squadValidation(nextSquad).isValid) reachable += 1;
    }
  }

  return reachable;
}

function replacementLiquidity(input: {
  boughtPlayers: PlayerForEngine[];
  squad: PlayerForEngine[];
  candidates: PlayerForEngine[];
  bankTenths: number;
  purchasePricesTenths?: Record<number, number>;
  reachableSquads: number;
}) {
  if (input.boughtPlayers.length === 0) return Math.max(0, input.reachableSquads - 1);
  const squadIds = new Set(input.squad.map((player) => player.id));
  return Math.min(...input.boughtPlayers.map((sell) => {
    const salePrice = sellingPriceTenths(sell, input.purchasePricesTenths);
    return input.candidates.filter((buy) => {
      if (squadIds.has(buy.id) || buy.position !== sell.position || buy.nowCost > salePrice + input.bankTenths) return false;
      return squadValidation(input.squad.map((player) => player.id === sell.id ? buy : player)).isValid;
    }).length;
  }));
}

export function evaluateTransferCandidate(input: TransferScenarioInput): TransferCandidate {
  const season = input.season ?? SUPPORTED_RULES_SEASON;
  const chip = input.chip ?? "none";
  const rankingHorizon = input.rankingHorizon ?? "GW1";
  const optionValuePerAdditionalFreeTransfer = input.optionValuePerAdditionalFreeTransfer ?? 0.5;
  const players = new Map([...input.squad, ...input.candidates].map((player) => [player.id, player]));
  const squadById = new Map(input.squad.map((player) => [player.id, player]));
  const errors: string[] = [];
  const sold = new Set<number>();
  const bought = new Set<number>();
  let saleProceedsTenths = 0;
  let purchaseCostTenths = 0;
  let usedFallbackSellingPrice = false;
  const moves: TransferCandidate["moves"] = [];

  for (const move of input.moves) {
    const sell = squadById.get(move.sellPlayerId);
    const buy = players.get(move.buyPlayerId);
    if (!sell) errors.push(`Sell player id ${move.sellPlayerId} is not in the current squad.`);
    if (!buy) errors.push(`Buy player id ${move.buyPlayerId} is not in the candidate pool.`);
    if (sold.has(move.sellPlayerId)) errors.push(`Sell player id ${move.sellPlayerId} appears more than once.`);
    if (bought.has(move.buyPlayerId)) errors.push(`Buy player id ${move.buyPlayerId} appears more than once.`);
    sold.add(move.sellPlayerId);
    bought.add(move.buyPlayerId);
    if (!sell || !buy) continue;
    if (sell.position !== buy.position) errors.push(`${sell.name} and ${buy.name} do not play the same position.`);
    saleProceedsTenths += sellingPriceTenths(sell, input.purchasePricesTenths);
    purchaseCostTenths += buy.nowCost;
    if (input.purchasePricesTenths?.[sell.id] === undefined) usedFallbackSellingPrice = true;
    moves.push({ ...move, sellPlayerName: sell.name, buyPlayerName: buy.name });
  }

  const boughtPlayers = input.moves
    .map((move) => players.get(move.buyPlayerId))
    .filter((player): player is PlayerForEngine => player !== undefined);
  const finalSquad = [
    ...input.squad.filter((player) => !sold.has(player.id)),
    ...boughtPlayers
  ];
  const bankBeforeTenths = Math.round(input.bank * 10);
  const bankAfterTenths = bankBeforeTenths + saleProceedsTenths - purchaseCostTenths;
  if (bankAfterTenths < 0) errors.push(`Transfer plan is unaffordable by £${(-bankAfterTenths / 10).toFixed(1)}m.`);
  errors.push(...squadValidation(finalSquad).errors);

  const transferCost = calculateTransferCost(season, input.moves.length, input.freeTransfers, chip);
  errors.push(...validateSeasonTransfers({
    season,
    freeTransfers: input.freeTransfers,
    moveCount: input.moves.length,
    expectedTransferCost: transferCost,
    chip
  }).errors);

  const expectedGain1GW = gainForMoves(input.moves, projectionMap(input.projections)) ?? 0;
  const expectedGain3GW = gainForMoves(input.moves, projectionMap(input.projections3GW));
  const expectedGain5GW = gainForMoves(input.moves, projectionMap(input.projections5GW));
  const downside = gainForMoves(input.moves, projectionMap(input.downsideProjections));
  const rankingGain = rankingHorizon === "GW1"
    ? expectedGain1GW
    : rankingHorizon === "GW1-3"
      ? expectedGain3GW
      : expectedGain5GW;
  const nextFreeTransfers = calculateNextFreeTransfers(season, input.freeTransfers, input.moves.length, chip);
  const rollFreeTransfers = calculateNextFreeTransfers(season, input.freeTransfers, 0, "none");
  const optionValue = round((nextFreeTransfers - rollFreeTransfers) * optionValuePerAdditionalFreeTransfer);
  const nextGameweekSquad = chip === "free_hit" ? input.squad : finalSquad;
  const nextGameweekBankTenths = chip === "free_hit" ? bankBeforeTenths : bankAfterTenths;
  const reachableSquads = countReachableSquads({
    squad: nextGameweekSquad,
    candidates: input.candidates,
    bankTenths: Math.max(0, nextGameweekBankTenths),
    purchasePricesTenths: input.purchasePricesTenths
  });
  const type: TransferCandidate["type"] = input.moves.length === 0
    ? "roll"
    : chip === "wildcard" || chip === "free_hit"
      ? chip
      : transferCost > 0
        ? "hit"
        : "transfer";
  const decisionValue = rankingGain === null ? null : round(rankingGain - transferCost + optionValue);
  const assumptions = [
    `Option value assumes ${optionValuePerAdditionalFreeTransfer.toFixed(1)} points per additional free transfer available next gameweek.`
  ];
  if (usedFallbackSellingPrice) assumptions.push("Missing purchase prices use current price as an explicit unverified selling-price fallback.");

  return {
    id: input.moves.length === 0
      ? "roll"
      : `${type}-${input.moves.map((move) => `${move.sellPlayerId}-${move.buyPlayerId}`).join("-")}`,
    type,
    moves,
    transferCost,
    expectedGain1GW,
    expectedGain3GW,
    expectedGain5GW,
    risk: boughtPlayers.some((player) => player.status !== "a") ? "high" : input.moves.length === 0 ? "low" : "medium",
    reasons: rankingGain === null
      ? [`${rankingHorizon} gain is unavailable; this option cannot be ranked on that horizon.`]
      : [`Projected ${rankingHorizon} gain is ${rankingGain.toFixed(1)} points before transfer cost and option value.`],
    concerns: [
      ...(transferCost > 0 ? [`Transfer plan costs ${transferCost} points.`] : []),
      ...(usedFallbackSellingPrice ? ["At least one selling price uses current price because purchase price is unavailable."] : [])
    ],
    isLegal: errors.length === 0,
    legalityErrors: errors,
    planning: {
      modelVersion: "0.0.26",
      rankingHorizon,
      immediateGain: expectedGain1GW,
      multiGameweekGain: rankingHorizon === "GW1-5" ? expectedGain5GW : expectedGain3GW,
      rankingGain,
      optionValue,
      replacementLiquidity: replacementLiquidity({
        boughtPlayers: chip === "free_hit" ? [] : boughtPlayers,
        squad: nextGameweekSquad,
        candidates: input.candidates,
        bankTenths: Math.max(0, nextGameweekBankTenths),
        purchasePricesTenths: input.purchasePricesTenths,
        reachableSquads
      }),
      downside,
      decisionValue,
      nextGameweek: {
        freeTransfers: nextFreeTransfers,
        bank: round(nextGameweekBankTenths / 10),
        reachableSquads
      },
      financials: {
        bankBefore: round(bankBeforeTenths / 10),
        saleProceeds: round(saleProceedsTenths / 10),
        purchaseCost: round(purchaseCostTenths / 10),
        bankAfter: round(bankAfterTenths / 10),
        sellingPriceBasis: input.moves.length === 0
          ? "not_applicable"
          : usedFallbackSellingPrice
            ? "current_price_fallback"
            : "purchase_prices"
      },
      optionValueAssumption: {
        modelVersion: "0.0.26",
        pointsPerAdditionalFreeTransfer: optionValuePerAdditionalFreeTransfer,
        statement: "Marginal next-gameweek free transfers are valued linearly for comparison and are not treated as observed points."
      },
      assumptions
    }
  };
}

export function generateTransferCandidates(input: TransferCandidateGenerationInput): TransferCandidate[] {
  const squadIds = new Set(input.squad.map((player) => player.id));
  const roll = evaluateTransferCandidate({ ...input, moves: [] });
  const transfers: TransferCandidate[] = [];

  for (const sell of input.squad) {
    for (const buy of input.candidates) {
      if (squadIds.has(buy.id) || buy.position !== sell.position) continue;
      const candidate = evaluateTransferCandidate({
        ...input,
        moves: [{ sellPlayerId: sell.id, buyPlayerId: buy.id }]
      });
      if (candidate.isLegal) transfers.push(candidate);
    }
  }

  transfers.sort((left, right) => {
    const leftValue = left.planning?.decisionValue;
    const rightValue = right.planning?.decisionValue;
    if (leftValue === null || leftValue === undefined) return rightValue === null || rightValue === undefined ? left.id.localeCompare(right.id) : 1;
    if (rightValue === null || rightValue === undefined) return -1;
    return rightValue - leftValue || left.transferCost - right.transferCost || left.id.localeCompare(right.id);
  });

  return [...transfers.slice(0, input.limit ?? 5), roll];
}
