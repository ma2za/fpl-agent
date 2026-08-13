import { describe, expect, it } from "vitest";
import {
  buildDecisionStatusReport,
  buildEvidenceReadinessReport,
  evaluateTriggerPlan,
  stableId,
  type PlayerDossier,
  type TriggerEvaluation
} from "../src";

const at = "2026-08-01T12:00:00.000Z";

function dossier(playerId: number, overrides: Partial<PlayerDossier> = {}): PlayerDossier {
  return {
    schemaVersion: 1,
    dossierId: stableId("dossier", playerId),
    playerId,
    generatedAt: at,
    asOf: at,
    snapshot: {
      snapshotId: stableId("snapshot", playerId), playerId, observedAt: at, contentHash: "a".repeat(64),
      name: `Player ${playerId}`, webName: `P${playerId}`, teamId: 1, teamName: "Club", position: "MID",
      price: 7, status: "a", selectedByPercent: 1, minutes: 90, totalPoints: 5, officialFields: {}
    },
    previousSnapshot: null,
    performance: [], documents: [], news: [], roleObservationIds: ["role-obs:one"],
    coverage: {
      coverageId: stableId("coverage", playerId), worklistId: stableId("worklist", 1), playerId,
      status: "searched_zero_results", searchedAt: at, queries: ["query"], resultCount: 0, note: ""
    },
    historyCoverage: "available", changes: [], disagreements: [], gaps: [],
    ...overrides
  };
}

describe("readiness, decisions, and triggers", () => {
  it("applies READY and CAUTION thresholds inclusively and caps missing history", () => {
    const report = buildEvidenceReadinessReport({
      generatedAt: at,
      gameweek: 1,
      dossiers: [dossier(1), dossier(2), dossier(3, { historyCoverage: "failed" })],
      selectedPlayerIds: [3],
      projections: [
        { playerId: 1, startProbability: 0.8, appearanceProbability: 0.9, confidence: 0.7, currentRoleEvidence: true },
        { playerId: 2, startProbability: 0.7, appearanceProbability: 0.85, confidence: 0.55, currentRoleEvidence: false },
        { playerId: 3, startProbability: 1, appearanceProbability: 1, confidence: 1, currentRoleEvidence: true }
      ]
    });
    expect(report.items.map((item) => item.status)).toEqual(["READY", "CAUTION", "INSUFFICIENT"]);
    expect(report.summary.selectedInsufficient).toBe(1);
  });

  it("limits authored decision statuses to their evidence readiness", () => {
    const readiness = buildEvidenceReadinessReport({
      generatedAt: at, gameweek: 1, dossiers: [dossier(1)],
      projections: [{ playerId: 1, startProbability: 0, appearanceProbability: 0, confidence: 0, currentRoleEvidence: false }]
    });
    const report = buildDecisionStatusReport({
      generatedAt: at,
      gameweek: 1,
      readiness,
      value: {
        schemaVersion: 1,
        authorship: { kind: "coding_agent", agent: "test", authoredAt: at },
        gameweek: 1,
        items: [{ decisionId: "decision:one", playerId: 1, area: "squad", status: "LOCK", rationale: "Test." }]
      }
    });
    expect(report.items[0]).toMatchObject({ readiness: "INSUFFICIENT", valid: false });
    expect(buildDecisionStatusReport({ generatedAt: at, gameweek: 1, readiness, value: null }).warnings).toHaveLength(1);
  });

  it.each([
    ["lt", 4, 5, "fired"], ["lte", 5, 5, "fired"], ["eq", "a", "a", "fired"],
    ["neq", "a", "b", "fired"], ["gte", 5, 5, "fired"], ["gt", 6, 5, "fired"],
    ["changed", "b", "ignored", "fired"]
  ] as const)("evaluates the %s trigger operator", (operator, current, threshold, expected) => {
    const previous: TriggerEvaluation = {
      evaluationId: stableId("trigger-evaluation", operator), triggerId: "trigger:test", evaluatedAt: "2026-08-01T10:00:00.000Z",
      state: "armed", currentValue: operator === "changed" ? "a" : null, previousValue: null, evidenceDependencyIds: ["evidence:one"],
      affectedDecisionIds: ["decision:one"], candidateResponses: ["review_selection"], reanalysisScope: "player", reason: "prior"
    };
    const report = evaluateTriggerPlan({
      generatedAt: at, gameweek: 1, runId: "run-1", previous: () => previous,
      metrics: new Map([["price:player:1", current]]),
      value: {
        schemaVersion: 1, authorship: { kind: "coding_agent", agent: "test", authoredAt: at }, gameweek: 1,
        triggers: [{
          triggerId: "trigger:test", metric: "price", subject: { kind: "player", id: "1" }, operator, threshold,
          evidenceDependencyIds: ["evidence:one"], affectedDecisionIds: ["decision:one"], candidateResponses: ["review_selection"],
          reanalysisScope: "player", nextCheckAt: "2026-08-01T11:00:00.000Z", expiresAt: "2026-08-02T12:00:00.000Z",
          acknowledgedAt: null, supersededByTriggerId: null
        }]
      }
    });
    expect(report.evaluations[0].state).toBe(expected);
  });

  it("derives inactive, acknowledged, expired, and superseded states without choosing a response", () => {
    const base = {
      triggerId: "trigger:test", metric: "price" as const, subject: { kind: "player" as const, id: "1" }, operator: "gte" as const, threshold: 5,
      evidenceDependencyIds: ["evidence:one"], affectedDecisionIds: ["decision:one"], candidateResponses: ["review_selection" as const],
      reanalysisScope: "player" as const, nextCheckAt: "2026-08-01T11:00:00.000Z", expiresAt: "2026-08-02T12:00:00.000Z",
      acknowledgedAt: null, supersededByTriggerId: null
    };
    const evaluate = (trigger: typeof base, metrics = new Map<string, string | number | boolean>(), previous: TriggerEvaluation | null = null) => evaluateTriggerPlan({
      generatedAt: at, gameweek: 1, runId: "run", metrics, previous: () => previous,
      value: { schemaVersion: 1, authorship: { kind: "coding_agent", agent: "test", authoredAt: at }, gameweek: 1, triggers: [trigger] }
    }).evaluations[0];
    expect(evaluate(base).state).toBe("inactive");
    expect(evaluate({ ...base, expiresAt: "2026-08-01T11:00:00.000Z" }).state).toBe("expired");
    expect(evaluate({ ...base, supersededByTriggerId: "trigger:new" }).state).toBe("superseded");
    const fired = { ...evaluate(base, new Map([["price:player:1", 6]])), evaluatedAt: "2026-08-01T11:30:00.000Z" };
    expect(evaluate({ ...base, acknowledgedAt: at }, new Map([["price:player:1", 6]]), fired).state).toBe("acknowledged");
    expect(evaluate(base).candidateResponses).toEqual(["review_selection"]);
  });
});
