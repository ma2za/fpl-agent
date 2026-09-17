import { describe, expect, it } from "vitest";
import {
  evaluateTransferCandidate,
  generateTransferCandidates,
  projectPlayers,
  type PlayerForEngine,
  type PlayerProjection
} from "../src";
import { engineSquad } from "./fixtures";

function player(id: number, position: PlayerForEngine["position"], teamId: number, price: number): PlayerForEngine {
  return {
    id,
    name: `Candidate ${id}`,
    nowCost: Math.round(price * 10),
    price,
    position,
    status: "a",
    teamId,
    chanceOfPlayingNextRound: 100,
    expectedPointsNext: 5 + id / 100,
    expectedPointsThis: 5 + id / 100,
    form: 5 + id / 100,
    minutes: 1800,
    selectedByPercent: 5,
    totalPoints: 100 + id
  };
}

function withPoints(projections: PlayerProjection[], points: Record<number, number>) {
  return projections.map((projection) => ({
    ...projection,
    projectedPoints: points[projection.playerId] ?? projection.projectedPoints
  }));
}

const alternatives = [
  player(21, "MID", 6, 5.0),
  player(22, "MID", 7, 5.0),
  player(23, "MID", 8, 5.0),
  player(24, "MID", 9, 5.0),
  player(25, "MID", 10, 5.0),
  player(26, "MID", 11, 5.0),
  player(30, "FWD", 12, 5.5)
];
const pool = [...engineSquad, ...alternatives];

describe("transfer optionality", () => {
  it("publishes five legal transfers plus roll without fabricating unknown horizons", () => {
    const result = generateTransferCandidates({
      squad: engineSquad,
      candidates: pool,
      projections: projectPlayers(pool),
      freeTransfers: 1,
      bank: 1
    });

    expect(result).toHaveLength(6);
    expect(result.filter((candidate) => candidate.type === "transfer")).toHaveLength(5);
    expect(result.at(-1)?.type).toBe("roll");
    expect(result.every((candidate) => candidate.isLegal)).toBe(true);
    expect(result.every((candidate) => candidate.expectedGain3GW === null && candidate.expectedGain5GW === null)).toBe(true);
    expect(result.every((candidate) => candidate.planning?.rankingHorizon === "GW1")).toBe(true);
  });

  it("ranks on declared multi-gameweek projections and reports each planning component", () => {
    const oneGameweek = projectPlayers(pool);
    const threeGameweek = withPoints(oneGameweek, {
      8: 10,
      9: 10,
      10: 10,
      11: 10,
      12: 10,
      21: 14,
      22: 18,
      23: 17,
      24: 16,
      25: 15,
      26: 13
    });
    const downside = withPoints(oneGameweek, {
      8: 10,
      9: 10,
      10: 10,
      11: 10,
      12: 10,
      21: 7,
      22: 8,
      23: 9,
      24: 10,
      25: 11,
      26: 12
    });
    const result = generateTransferCandidates({
      squad: engineSquad,
      candidates: pool,
      projections: oneGameweek,
      projections3GW: threeGameweek,
      downsideProjections: downside,
      freeTransfers: 1,
      bank: 1,
      rankingHorizon: "GW1-3",
      optionValuePerAdditionalFreeTransfer: 0.6
    });
    const transfers = result.filter((candidate) => candidate.type === "transfer");

    expect(transfers[0]?.moves[0]?.buyPlayerId).toBe(22);
    expect(transfers[0]?.planning).toMatchObject({
      modelVersion: "0.0.26",
      rankingHorizon: "GW1-3",
      rankingGain: 8,
      optionValue: -0.6,
      downside: -2
    });
    expect(transfers.every((candidate, index) => index === 0 ||
      transfers[index - 1]!.planning!.decisionValue! >= candidate.planning!.decisionValue!)).toBe(true);
  });

  it("uses purchase price, selling price, bank, and concrete player names", () => {
    const currentSquad = engineSquad.map((item) => item.id === 12
      ? { ...item, name: "Harry Wilson", nowCost: 60, price: 6 }
      : item);
    const buy = { ...player(41, "MID", 12, 5.8), name: "Emiliano Buendía" };
    const candidate = evaluateTransferCandidate({
      squad: currentSquad,
      candidates: [...currentSquad, buy],
      projections: projectPlayers([...currentSquad, buy]),
      freeTransfers: 1,
      bank: 0.3,
      purchasePricesTenths: { 12: 50 },
      moves: [{ sellPlayerId: 12, buyPlayerId: 41 }]
    });

    expect(candidate.isLegal).toBe(true);
    expect(candidate.moves[0]).toMatchObject({
      sellPlayerName: "Harry Wilson",
      buyPlayerName: "Emiliano Buendía"
    });
    expect(candidate.planning?.financials).toEqual({
      bankBefore: 0.3,
      saleProceeds: 5.5,
      purchaseCost: 5.8,
      bankAfter: 0,
      sellingPriceBasis: "purchase_prices"
    });
  });

  it("models two-transfer hits and chip preservation", () => {
    const common = {
      squad: engineSquad,
      candidates: pool,
      projections: projectPlayers(pool),
      freeTransfers: 1,
      bank: 1,
      moves: [
        { sellPlayerId: 12, buyPlayerId: 21 },
        { sellPlayerId: 15, buyPlayerId: 30 }
      ]
    } as const;
    const hit = evaluateTransferCandidate(common);
    const wildcard = evaluateTransferCandidate({ ...common, chip: "wildcard" });
    const freeHit = evaluateTransferCandidate({ ...common, chip: "free_hit" });

    expect(hit).toMatchObject({ type: "hit", transferCost: 4, isLegal: true });
    expect(hit.planning?.nextGameweek.freeTransfers).toBe(1);
    expect(wildcard).toMatchObject({ type: "wildcard", transferCost: 0, isLegal: true });
    expect(freeHit).toMatchObject({ type: "free_hit", transferCost: 0, isLegal: true });
    expect(wildcard.planning?.nextGameweek.freeTransfers).toBe(1);
    expect(freeHit.planning?.nextGameweek.freeTransfers).toBe(1);
    expect(wildcard.planning?.nextGameweek.bank).toBe(1.5);
    expect(freeHit.planning?.financials.bankAfter).toBe(1.5);
    expect(freeHit.planning?.nextGameweek.bank).toBe(1);
  });

  it("does not invent option value when rolling is already capped", () => {
    const common = {
      squad: engineSquad,
      candidates: pool,
      projections: projectPlayers(pool),
      freeTransfers: 5,
      bank: 1
    };
    const roll = evaluateTransferCandidate({ ...common, moves: [] });
    const transfer = evaluateTransferCandidate({ ...common, moves: [{ sellPlayerId: 12, buyPlayerId: 21 }] });

    expect(roll.planning?.nextGameweek.freeTransfers).toBe(5);
    expect(transfer.planning?.nextGameweek.freeTransfers).toBe(5);
    expect(roll.planning?.optionValue).toBe(0);
    expect(transfer.planning?.optionValue).toBe(0);
  });

  it("keeps illegal and unaffordable authored scenarios explicit", () => {
    const expensive = player(42, "MID", 12, 15);
    const candidate = evaluateTransferCandidate({
      squad: engineSquad,
      candidates: [...pool, expensive],
      projections: projectPlayers([...pool, expensive]),
      freeTransfers: 1,
      bank: 0,
      moves: [
        { sellPlayerId: 12, buyPlayerId: 42 },
        { sellPlayerId: 12, buyPlayerId: 42 }
      ]
    });

    expect(candidate.isLegal).toBe(false);
    expect(candidate.legalityErrors.join(" ")).toMatch(/more than once|unaffordable/);
  });
});
