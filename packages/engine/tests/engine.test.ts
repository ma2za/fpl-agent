import { describe, expect, it } from "vitest";
import {
  generateTransferCandidates,
  pickStartingXI,
  projectPlayer,
  projectPlayers,
  rankCaptainCandidates,
  recommendChip
} from "../src";
import { engineSquad, transferPool } from "./fixtures";

describe("engine", () => {
  it("projects a player with transparent factors", () => {
    const projection = projectPlayer(engineSquad[7], {
      fixtureDifficultyByTeamId: { 1: 2 }
    });

    expect(projection.playerId).toBe(8);
    expect(projection.projectedPoints).toBeGreaterThan(6);
    expect(projection.fixtureDifficultyFactor).toBe(1.1);
    expect(projection.availabilityFactor).toBe(1);
  });

  it("ranks captain candidates by projected points", () => {
    const projections = projectPlayers(engineSquad);
    const captains = rankCaptainCandidates(projections, undefined, 3);

    expect(captains).toHaveLength(3);
    expect(captains[0].projectedPoints).toBeGreaterThanOrEqual(captains[1].projectedPoints);
    expect(captains[0].risk).toBe("low");
  });

  it("selects a legal starting XI and bench order", () => {
    const projections = projectPlayers(engineSquad);
    const pick = pickStartingXI(engineSquad, projections);

    expect(pick.formation).not.toBe("invalid");
    expect(pick.startingXI).toHaveLength(11);
    expect(pick.benchOrder).toHaveLength(4);
    expect(pick.projectedPoints).toBeGreaterThan(0);
  });

  it("recommends no chip under conservative thresholds", () => {
    const projections = projectPlayers(engineSquad);
    const pick = pickStartingXI(engineSquad, projections);
    const captains = rankCaptainCandidates(projections, pick.startingXI);
    const chip = recommendChip({
      chipsAvailable: ["wildcard", "free_hit", "bench_boost", "triple_captain"],
      captainCandidates: captains,
      benchPlayerIds: pick.benchOrder,
      projections
    });

    expect(chip.chip).toBe("none");
    expect(chip.warnings[0]).toContain("Human manager");
  });

  it("recommends triple captain only when the top captain clears the threshold", () => {
    const projections = projectPlayers(engineSquad).map((projection) =>
      projection.playerId === 8
        ? { ...projection, projectedPoints: 10.5, expectedMinutes: 85, availabilityFactor: 1 }
        : projection
    );
    const captains = rankCaptainCandidates(projections, [8, 9], 2);
    const chip = recommendChip({
      chipsAvailable: ["triple_captain"],
      captainCandidates: captains,
      benchPlayerIds: [],
      projections
    });

    expect(chip.chip).toBe("triple_captain");
    expect(chip.confidence).toBe("medium");
  });

  it("generates roll and legal transfer candidates", () => {
    const projections = projectPlayers(transferPool);
    const candidates = generateTransferCandidates({
      squad: engineSquad,
      candidates: transferPool,
      projections,
      freeTransfers: 1,
      bank: 1,
      limit: 5
    });

    expect(candidates.some((candidate) => candidate.type === "roll")).toBe(true);
    expect(candidates.some((candidate) => candidate.type === "transfer")).toBe(true);
    expect(candidates.every((candidate) => candidate.isLegal)).toBe(true);
  });
});
