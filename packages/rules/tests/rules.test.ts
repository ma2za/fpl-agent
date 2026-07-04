import { describe, expect, it } from "vitest";
import {
  validateBench,
  validateCaptaincy,
  validateChip,
  validateDeadline,
  validateDraftSquad,
  validateSquad,
  validateStartingXI,
  validateTransfers
} from "../src";
import { validBenchOrder, validSquad, validStartingXI } from "./fixtures";

describe("rules engine", () => {
  it("validates a legal 15-player draft squad under budget", () => {
    const result = validateDraftSquad({
      players: validSquad,
      deadlineStatus: "open",
      officialGw1Available: true
    });

    expect(result).toEqual({
      isValid: true,
      errors: [],
      warnings: []
    });
  });

  it("fails wrong position counts", () => {
    const squad = validSquad.filter((player) => player.id !== 15);

    const result = validateSquad({ players: squad });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Squad must contain 15 players.");
    expect(result.errors).toContain("Squad must contain 3 FWD players.");
  });

  it("fails duplicate players", () => {
    const squad = [...validSquad.slice(0, 14), validSquad[0]];

    const result = validateSquad({ players: squad });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Squad contains duplicate player id 1.");
  });

  it("fails an over-budget squad", () => {
    const squad = validSquad.map((player) => ({ ...player, price: player.price + 5 }));

    const result = validateSquad({ players: squad });

    expect(result.isValid).toBe(false);
    expect(result.errors.some((error) => error.includes("exceeds budget"))).toBe(true);
  });

  it("fails max-club breaches", () => {
    const squad = validSquad.map((player, index) => ({
      ...player,
      teamId: index < 4 ? 1 : player.teamId
    }));

    const result = validateSquad({ players: squad });

    expect(result.isValid).toBe(false);
    expect(result.errors.some((error) => error.includes("players from team 1"))).toBe(true);
  });

  it("validates and rejects starting XI formations", () => {
    expect(
      validateStartingXI({
        squad: validSquad,
        startingXI: validStartingXI,
        formation: "3-4-3"
      }).isValid
    ).toBe(true);

    const result = validateStartingXI({
      squad: validSquad,
      startingXI: validStartingXI,
      formation: "2-5-3"
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Formation 2-5-3 is not valid.");
  });

  it("fails invalid captaincy", () => {
    const result = validateCaptaincy({
      squad: validSquad,
      captainPlayerId: 8,
      viceCaptainPlayerId: 8
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Captain and vice-captain must be different players.");
  });

  it("fails invalid bench order", () => {
    const result = validateBench({
      squad: validSquad,
      startingXI: validStartingXI,
      benchOrder: [2, 6, 7, 8]
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Bench player id 8 is also in the starting XI.");
    expect(result.errors).toContain("Bench order must contain every non-starting squad player exactly once.");
  });

  it("fails unavailable chip selection", () => {
    const result = validateChip({
      chip: "free_hit",
      chipsAvailable: ["wildcard"]
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Chip free_hit is not available.");
  });

  it("fails passed deadlines unless forced", () => {
    expect(validateDeadline({ deadlineStatus: "passed" }).isValid).toBe(false);
    expect(validateDeadline({ deadlineStatus: "passed", force: true }).isValid).toBe(true);
  });

  it("fails excessive or incorrect transfer cost", () => {
    const result = validateTransfers({
      freeTransfers: 1,
      moves: [
        { sellPlayerId: 1, buyPlayerId: 20 },
        { sellPlayerId: 2, buyPlayerId: 21 }
      ],
      expectedTransferCost: 8
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Transfer cost must be 4, received 8.");
  });

  it("warns but does not fail solely because provisional GW1 data is unavailable", () => {
    const result = validateDraftSquad({
      players: validSquad,
      dataMode: "provisional",
      deadlineStatus: "open",
      officialGw1Available: false
    });

    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain(
      "Provisional mode: player IDs, prices, fixtures, and availability may be stale until official FPL GW1 data is live."
    );
  });

  it("fails official mode when GW1 data is unavailable", () => {
    const result = validateDraftSquad({
      players: validSquad,
      deadlineStatus: "open",
      officialGw1Available: false
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Official GW1 FPL data is not available.");
  });

  it("validates the legal bench order fixture", () => {
    const result = validateBench({
      squad: validSquad,
      startingXI: validStartingXI,
      benchOrder: validBenchOrder
    });

    expect(result.isValid).toBe(true);
  });
});
