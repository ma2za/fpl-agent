import { validateTransfers } from "../../rules/src";
import type { PlayerForEngine, PlayerProjection, TransferCandidate } from "./types";

function projectionMap(projections: PlayerProjection[]) {
  return new Map(projections.map((projection) => [projection.playerId, projection.projectedPoints]));
}

function pointsFor(points: Map<number, number>, playerId: number) {
  return points.get(playerId) ?? 0;
}

export function generateTransferCandidates(input: {
  squad: PlayerForEngine[];
  candidates: PlayerForEngine[];
  projections: PlayerProjection[];
  freeTransfers: number;
  bank: number;
  limit?: number;
}): TransferCandidate[] {
  const points = projectionMap(input.projections);
  const squadIds = new Set(input.squad.map((player) => player.id));
  const candidates: TransferCandidate[] = [
    {
      id: "roll",
      type: "roll",
      moves: [],
      transferCost: 0,
      expectedGain1GW: 0,
      expectedGain3GW: 0,
      expectedGain5GW: 0,
      risk: "low",
      reasons: ["No transfer preserves flexibility."],
      concerns: [],
      isLegal: true,
      legalityErrors: []
    }
  ];

  for (const sell of input.squad) {
    const affordableBudget = sell.price + input.bank;
    const replacements = input.candidates.filter(
      (buy) =>
        !squadIds.has(buy.id) &&
        buy.position === sell.position &&
        buy.price <= affordableBudget
    );

    for (const buy of replacements) {
      const expectedGain1GW = Math.round((pointsFor(points, buy.id) - pointsFor(points, sell.id)) * 10) / 10;

      if (expectedGain1GW <= 0) {
        continue;
      }

      const transferCost = input.freeTransfers >= 1 ? 0 : 4;
      const legality = validateTransfers({
        freeTransfers: input.freeTransfers,
        moves: [{ sellPlayerId: sell.id, buyPlayerId: buy.id }],
        expectedTransferCost: transferCost
      });

      candidates.push({
        id: `transfer-${sell.id}-${buy.id}`,
        type: "transfer",
        moves: [{ sellPlayerId: sell.id, buyPlayerId: buy.id }],
        transferCost,
        expectedGain1GW,
        expectedGain3GW: Math.round(expectedGain1GW * 2.4 * 10) / 10,
        expectedGain5GW: Math.round(expectedGain1GW * 3.5 * 10) / 10,
        risk: buy.status === "a" ? "medium" : "high",
        reasons: [`Projected one-gameweek gain of ${expectedGain1GW}.`],
        concerns: transferCost > 0 ? ["Transfer requires a points hit."] : [],
        isLegal: legality.isValid,
        legalityErrors: legality.errors
      });
    }
  }

  return candidates
    .sort((a, b) => b.expectedGain3GW - a.expectedGain3GW || a.transferCost - b.transferCost)
    .slice(0, input.limit ?? 5);
}
