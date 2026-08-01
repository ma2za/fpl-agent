import { describe, expect, it } from "vitest";
import {
  FPL_2026_27_RULES,
  adaptLegacyChipInventory,
  allocateBonusPoints,
  calculateNextFreeTransfers,
  calculateSellingPrice,
  calculateTeamGameweekPoints,
  calculateTransferCost,
  createSeasonChipInventory,
  finalizePlayerGameweekScore,
  resolveAutomaticSubstitutions,
  resolveCaptaincy,
  resolveScoreLifecycle,
  scorePlayerFixture,
  scorePlayerGameweek,
  validateSeasonChip,
  validateSeasonTransfers,
  validateTransfers,
  type LineupPlayer
} from "../src";

describe("2026/27 season rules", () => {
  it("defines the season boundaries and 2026/27 BPS changes", () => {
    expect(FPL_2026_27_RULES).toMatchObject({
      season: "2026-27",
      gameweeks: 38,
      firstHalfLastGameweek: 19,
      maxFreeTransfers: 5,
      bonusPointsSystem: {
        tackledPenalty: 0,
        clearancesBlocksInterceptionsPerPoint: 3,
        save: 2,
        insideBoxSaveExtra: 1,
        bigChanceSaveExtra: 1,
        penaltySave: 7
      }
    });
  });

  it.each([1, 18, 19, 20, 38])("accepts an available chip in GW%i", (gameweek) => {
    expect(validateSeasonChip({
      season: "2026-27",
      gameweek,
      chips: ["wildcard"],
      inventory: createSeasonChipInventory()
    }).isValid).toBe(true);
  });

  it("uses separate chip sets and rejects unavailable chips", () => {
    const inventory = createSeasonChipInventory();
    inventory.firstHalf.wildcard = false;

    expect(validateSeasonChip({
      season: "2026-27",
      gameweek: 19,
      chips: ["wildcard"],
      inventory
    }).errors).toContain("Chip wildcard is not available in this half of the season.");
    expect(validateSeasonChip({
      season: "2026-27",
      gameweek: 20,
      chips: ["wildcard"],
      inventory
    }).isValid).toBe(true);
  });

  it("adapts a legacy chip list as the active half without changing chip strings", () => {
    const firstHalf = adaptLegacyChipInventory(["wildcard", "free_hit"], 19);
    const secondHalf = adaptLegacyChipInventory(["bench_boost"], 20);

    expect(firstHalf.firstHalf).toEqual({
      wildcard: true,
      free_hit: true,
      bench_boost: false,
      triple_captain: false
    });
    expect(secondHalf.secondHalf.bench_boost).toBe(true);
    expect(secondHalf.secondHalf.wildcard).toBe(false);
  });

  it("enforces one chip, the GW1 Free Hit restriction, and consecutive Free Hits", () => {
    const inventory = createSeasonChipInventory();

    expect(validateSeasonChip({
      season: "2026-27",
      gameweek: 1,
      chips: ["free_hit"],
      inventory
    }).errors).toContain("Free Hit cannot be played in Gameweek 1.");
    expect(validateSeasonChip({
      season: "2026-27",
      gameweek: 19,
      chips: ["wildcard", "bench_boost"],
      inventory
    }).errors).toContain("Only one chip can be played in a gameweek.");
    expect(validateSeasonChip({
      season: "2026-27",
      gameweek: 20,
      chips: ["free_hit"],
      inventory,
      previousGameweekChip: "free_hit"
    }).errors).toContain("Free Hit cannot be played in consecutive gameweeks.");
  });

  it("returns validation errors for unsupported seasons and invalid gameweeks", () => {
    expect(validateSeasonChip({
      season: "2025-26",
      gameweek: 1,
      chips: [],
      inventory: createSeasonChipInventory()
    }).errors).toContain("Unsupported FPL rules season: 2025-26.");
    expect(validateSeasonChip({
      season: "2026-27",
      gameweek: 39,
      chips: [],
      inventory: createSeasonChipInventory()
    }).errors).toContain("Gameweek must be between 1 and 38.");
  });

  it.each([0, 1, 2, 3, 4, 5])("validates %i banked free transfers", (freeTransfers) => {
    expect(validateSeasonTransfers({
      season: "2026-27",
      freeTransfers,
      moveCount: 6,
      expectedTransferCost: Math.max(0, 6 - freeTransfers) * 4
    }).isValid).toBe(true);
  });

  it("rejects more than five free transfers and applies chip transfer costs", () => {
    expect(validateSeasonTransfers({
      season: "2026-27",
      freeTransfers: 6,
      moveCount: 0,
      expectedTransferCost: 0
    }).errors).toContain("Free transfers must be an integer between 0 and 5.");
    expect(calculateTransferCost("2026-27", 7, 5)).toBe(8);
    expect(calculateTransferCost("2026-27", 7, 5, "wildcard")).toBe(0);
    expect(calculateTransferCost("2026-27", 7, 5, "free_hit")).toBe(0);
  });

  it("preserves the season-neutral transfer validator behavior", () => {
    expect(validateTransfers({
      freeTransfers: 6,
      moves: [],
      expectedTransferCost: 0
    }).isValid).toBe(true);
  });

  it("rolls transfers to five and preserves the bank through transfer chips", () => {
    expect(calculateNextFreeTransfers("2026-27", 5, 0)).toBe(5);
    expect(calculateNextFreeTransfers("2026-27", 5, 1)).toBe(5);
    expect(calculateNextFreeTransfers("2026-27", 3, 2)).toBe(2);
    expect(calculateNextFreeTransfers("2026-27", 4, 20, "free_hit")).toBe(4);
  });

  it("uses purchase, current, and sell-price profit rules in tenths", () => {
    expect(calculateSellingPrice(50, 54)).toBe(52);
    expect(calculateSellingPrice(50, 53)).toBe(51);
    expect(calculateSellingPrice(50, 50)).toBe(50);
    expect(calculateSellingPrice(50, 47)).toBe(47);
  });
});

describe("2026/27 scoring", () => {
  it("scores every standard goalkeeper component deterministically", () => {
    expect(scorePlayerFixture({
      season: "2026-27",
      position: "GKP",
      stats: {
        dataComplete: true,
        minutes: 90,
        goals: 1,
        assists: 1,
        cleanSheet: true,
        saves: 7,
        penaltySaves: 1,
        penaltyMisses: 1,
        yellowCards: 1,
        redCards: 1,
        ownGoals: 1,
        goalsConcededWhilePlaying: 4,
        bonusPoints: 3,
        defensiveContributions: 10
      }
    })).toEqual({
      isComplete: true,
      appearance: 2,
      goals: 10,
      assists: 3,
      cleanSheet: 4,
      saves: 2,
      penaltySaves: 5,
      penaltyMisses: -2,
      cards: -4,
      ownGoals: -2,
      goalsConceded: -2,
      bonus: 3,
      defensiveContributions: 0,
      total: 19
    });
  });

  it.each([
    ["DEF", 6, 4, 10],
    ["MID", 5, 1, 12],
    ["FWD", 4, 0, 12]
  ] as const)("applies %s position scoring", (position, goalPoints, cleanSheetPoints, threshold) => {
    const score = scorePlayerFixture({
      season: "2026-27",
      position,
      stats: { minutes: 60, goals: 1, cleanSheet: true, defensiveContributions: threshold }
    });

    expect(score.goals).toBe(goalPoints);
    expect(score.cleanSheet).toBe(cleanSheetPoints);
    expect(score.defensiveContributions).toBe(2);
  });

  it("requires 60 minutes for a clean sheet but retains it after substitution", () => {
    expect(scorePlayerFixture({
      season: "2026-27",
      position: "DEF",
      stats: { minutes: 59, cleanSheet: true }
    }).cleanSheet).toBe(0);
    expect(scorePlayerFixture({
      season: "2026-27",
      position: "DEF",
      stats: { minutes: 60, cleanSheet: true, goalsConcededWhilePlaying: 0 }
    }).cleanSheet).toBe(4);
  });

  it("allocates bonus points for first-, second-, and third-place ties", () => {
    expect(Object.fromEntries(allocateBonusPoints([
      { playerId: 1, bps: 40 }, { playerId: 2, bps: 40 }, { playerId: 3, bps: 30 }
    ]))).toEqual({ 1: 3, 2: 3, 3: 1 });
    expect(Object.fromEntries(allocateBonusPoints([
      { playerId: 1, bps: 40 }, { playerId: 2, bps: 30 }, { playerId: 3, bps: 30 }
    ]))).toEqual({ 1: 3, 2: 2, 3: 2 });
    expect(Object.fromEntries(allocateBonusPoints([
      { playerId: 1, bps: 40 }, { playerId: 2, bps: 30 }, { playerId: 3, bps: 20 }, { playerId: 4, bps: 20 }
    ]))).toEqual({ 1: 3, 2: 2, 3: 1, 4: 1 });
  });

  it("scores blanks as zero and doubles as the sum of both matches", () => {
    expect(scorePlayerGameweek([])).toBe(0);
    expect(scorePlayerGameweek([
      { season: "2026-27", position: "MID", stats: { minutes: 90, goals: 1 } },
      { season: "2026-27", position: "MID", stats: { minutes: 30, assists: 1 } }
    ])).toBe(11);
  });

  it("does not label incomplete live statistics as a final score", () => {
    const incomplete = finalizePlayerGameweekScore({
      fixtures: [{ season: "2026-27", position: "MID", stats: { minutes: 90 } }],
      lifecycle: "final"
    });
    const corrected = finalizePlayerGameweekScore({
      fixtures: [{
        season: "2026-27",
        position: "MID",
        stats: { dataComplete: true, minutes: 90, goals: 1 }
      }],
      lifecycle: "final"
    });

    expect(incomplete.isFinal).toBe(false);
    expect(corrected).toMatchObject({ total: 7, isComplete: true, isFinal: true });
  });

  it("keeps finished gameweeks provisional until lockdown", () => {
    const lockdownAt = new Date("2026-08-18T08:00:00.000Z");

    expect(resolveScoreLifecycle({
      season: "2026-27",
      allFixturesFinished: false,
      now: new Date("2026-08-18T09:00:00.000Z"),
      lockdownAt
    }).lifecycle).toBe("live");
    expect(resolveScoreLifecycle({
      season: "2026-27",
      allFixturesFinished: true,
      now: new Date("2026-08-18T07:59:59.000Z"),
      lockdownAt
    }).lifecycle).toBe("provisional");
    expect(resolveScoreLifecycle({
      season: "2026-27",
      allFixturesFinished: true,
      now: lockdownAt,
      lockdownAt
    }).lifecycle).toBe("final");
  });
});

describe("automatic substitutions and captaincy", () => {
  const players: LineupPlayer[] = [
    { id: 1, position: "GKP", minutes: 0, points: 0 },
    { id: 2, position: "GKP", minutes: 90, points: 3 },
    { id: 3, position: "DEF", minutes: 90, points: 2 },
    { id: 4, position: "DEF", minutes: 90, points: 2 },
    { id: 5, position: "DEF", minutes: 0, points: 0 },
    { id: 6, position: "DEF", minutes: 90, points: 6 },
    { id: 7, position: "DEF", minutes: 0, points: 0 },
    { id: 8, position: "MID", minutes: 90, points: 8 },
    { id: 9, position: "MID", minutes: 90, points: 5 },
    { id: 10, position: "MID", minutes: 90, points: 4 },
    { id: 11, position: "MID", minutes: 90, points: 3 },
    { id: 12, position: "MID", minutes: 90, points: 7 },
    { id: 13, position: "FWD", minutes: 90, points: 2 },
    { id: 14, position: "FWD", minutes: 90, points: 2 },
    { id: 15, position: "FWD", minutes: 90, points: 2 }
  ];
  const startingXI = [1, 3, 4, 5, 8, 9, 10, 11, 13, 14, 15];
  const benchOrder = [2, 12, 6, 7];

  it("replaces the goalkeeper separately and preserves a legal formation", () => {
    const result = resolveAutomaticSubstitutions({ players, startingXI, benchOrder });

    expect(result.startingXI).toContain(2);
    expect(result.startingXI).toContain(6);
    expect(result.startingXI).not.toContain(1);
    expect(result.startingXI).not.toContain(5);
    expect(result.startingXI).not.toContain(12);
  });

  it("returns validation errors for an illegal starting formation", () => {
    const result = resolveAutomaticSubstitutions({
      players,
      startingXI: [1, 3, 4, 8, 9, 10, 11, 12, 13, 14, 15],
      benchOrder: [2, 5, 6, 7]
    });

    expect(result.validation.errors).toContain("Starting XI does not have a valid formation.");
  });

  it("falls captaincy back to the vice-captain, including Triple Captain", () => {
    expect(resolveCaptaincy({
      captainPlayerId: 5,
      viceCaptainPlayerId: 8,
      appearances: new Map([[5, 0], [8, 90]])
    })).toEqual({ scoringCaptainPlayerId: 8, multiplier: 2 });
    expect(resolveCaptaincy({
      captainPlayerId: 5,
      viceCaptainPlayerId: 8,
      appearances: new Map([[5, 0], [8, 90]]),
      chip: "triple_captain"
    })).toEqual({ scoringCaptainPlayerId: 8, multiplier: 3 });
    expect(resolveCaptaincy({
      captainPlayerId: 5,
      viceCaptainPlayerId: 7,
      appearances: new Map([[5, 0], [7, 0]])
    })).toEqual({ scoringCaptainPlayerId: null, multiplier: 1 });
  });

  it("calculates substitutions, captain multiplier, hits, and Bench Boost", () => {
    const normal = calculateTeamGameweekPoints({
      players,
      startingXI,
      benchOrder,
      captainPlayerId: 5,
      viceCaptainPlayerId: 8,
      transferCost: 4
    });
    const benchBoost = calculateTeamGameweekPoints({
      players,
      startingXI,
      benchOrder,
      captainPlayerId: 5,
      viceCaptainPlayerId: 8,
      chip: "bench_boost"
    });

    expect(normal.total).toBe(43);
    expect(normal.captainPoints).toBe(8);
    expect(benchBoost.total).toBe(54);
  });
});
