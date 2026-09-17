import { describe, expect, it } from "vitest";
import { buildEligibilityReport, candidateEligibilityErrors, managerConstraintStates, type EligibilityPlayerInput } from "../src";

const player = (overrides: Partial<EligibilityPlayerInput> = {}): EligibilityPlayerInput => ({
  playerId: 1,
  teamId: 3,
  status: "a",
  chanceOfPlayingNextRound: null,
  canSelect: true,
  canTransact: true,
  fixtureCount: 1,
  startProbability: 0.8,
  appearanceProbability: 0.9,
  roleState: "CREDIBLE_STARTER",
  roleConflict: false,
  evidenceObservedAt: "2026-09-17T08:00:00.000Z",
  evidenceIds: ["projection:1"],
  ...overrides
});

describe("pre-optimization eligibility", () => {
  it("removes every officially unavailable player before optimization", () => {
    const report = buildEligibilityReport({
      generatedAt: "2026-09-17T09:00:00.000Z",
      gameweek: 5,
      players: Array.from({ length: 175 }, (_, index) => player({ playerId: index + 1, status: "u" }))
    });
    expect(report.summary.fullyExcluded).toBe(175);
    expect(report.players.every((item) => item.roles.starter.exclusions.some((entry) => entry.code === "UNAVAILABLE"))).toBe(true);
  });

  it("uses distinct starter, bench and emergency policies", () => {
    const report = buildEligibilityReport({
      generatedAt: "2026-09-17T09:00:00.000Z",
      gameweek: 5,
      players: [player({ startProbability: 0.3, appearanceProbability: 0.4, roleState: "LIKELY_SUBSTITUTE" })]
    });
    expect(report.players[0].roles.starter.eligible).toBe(false);
    expect(report.players[0].roles.bench.eligible).toBe(false);
    expect(report.players[0].roles.emergency.eligible).toBe(true);
  });

  it("fails starter eligibility closed for stale or contradictory evidence", () => {
    const report = buildEligibilityReport({
      generatedAt: "2026-09-17T09:00:00.000Z",
      gameweek: 5,
      maximumEvidenceAgeHours: 24,
      players: [player({ evidenceObservedAt: "2026-09-15T08:00:00.000Z", roleConflict: true })]
    });
    expect(report.players[0].roles.starter.exclusions.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "STALE_OR_MISSING_EVIDENCE",
      "CONTRADICTORY_ROLE_EVIDENCE"
    ]));
    expect(report.players[0].roles.starter.exclusions[0].observedAt).toBe("2026-09-15T08:00:00.000Z");
  });

  it("expires a one-gameweek club exclusion before the next gameweek", () => {
    const constraint = {
      id: "avoid-bournemouth-gw4",
      kind: "exclude_club" as const,
      teamIds: [3],
      scope: { fromGameweek: 4, toGameweek: 4 },
      rationale: "Temporary fixture-specific instruction.",
      author: "manager",
      createdAt: "2026-09-10T08:00:00.000Z"
    };
    expect(managerConstraintStates([constraint], 4, "2026-09-11T08:00:00.000Z")[0].active).toBe(true);
    expect(managerConstraintStates([constraint], 5, "2026-09-17T08:00:00.000Z")[0]).toMatchObject({
      active: false,
      inactiveReason: "outside_gameweek_scope"
    });
    const gw4 = buildEligibilityReport({
      generatedAt: "2026-09-11T08:00:00.000Z",
      gameweek: 4,
      players: [player({ evidenceObservedAt: "2026-09-11T07:00:00.000Z" })],
      managerConstraints: [constraint]
    });
    expect(gw4.players[0].roles.emergency.exclusions.find((entry) => entry.code === "ACTIVE_MANAGER_EXCLUSION")).toMatchObject({
      code: "ACTIVE_MANAGER_EXCLUSION",
      evidenceIds: ["avoid-bournemouth-gw4"],
      observedAt: constraint.createdAt
    });
  });

  it("only lets a newer active constraint supersede an earlier one", () => {
    const earlier = {
      id: "earlier",
      kind: "exclude_club" as const,
      teamIds: [3],
      scope: { fromGameweek: 5, toGameweek: 5 },
      rationale: "Earlier instruction.",
      author: "manager",
      createdAt: "2026-09-17T08:00:00.000Z"
    };
    const invalidOlderReplacement = {
      ...earlier,
      id: "older-replacement",
      createdAt: "2026-09-17T07:00:00.000Z",
      supersedesId: earlier.id
    };
    const states = managerConstraintStates([earlier, invalidOlderReplacement], 5, "2026-09-17T09:00:00.000Z");
    expect(states.find((constraint) => constraint.id === earlier.id)?.active).toBe(true);
  });

  it("validates a candidate against the persisted eligibility snapshot", () => {
    const report = buildEligibilityReport({
      generatedAt: "2026-09-17T09:00:00.000Z",
      gameweek: 5,
      players: [player(), player({ playerId: 2, status: "u" })]
    });
    expect(candidateEligibilityErrors({ playerIds: [1, 2], startingXI: [2], benchOrder: [1], report }))
      .toContain("Starting player 2 is not starter-eligible.");
  });
});
