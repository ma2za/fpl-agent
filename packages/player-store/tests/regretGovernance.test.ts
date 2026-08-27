import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  adoptModelChange,
  buildDecisionRegretReport,
  contentHash,
  ingestGameweekOutcomes,
  migratePlayerStore,
  openPlayerStore,
  proposeModelChange,
  recordGameweekArchive,
  recordModelReplay,
  registerModelVersion,
  reviewModelChange,
  rollbackModelVersion,
  stableId
} from "../src";

const roots: string[] = [];
const before = "2026-08-21T12:00:00.000Z";
const deadline = "2026-08-21T17:30:00.000Z";
const after = "2026-08-25T12:00:00.000Z";

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function setup(noShowDefender = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), "regret-test-"));
  roots.push(root);
  const db = openPlayerStore(path.join(root, "store.sqlite"));
  migratePlayerStore(db, before);
  db.prepare("INSERT INTO ingestion_runs(run_id, gameweek, mode, observed_at) VALUES('run', 1, 'offline', ?)").run(before);
  for (let playerId = 1; playerId <= 16; playerId += 1) db.prepare("INSERT INTO players(player_id, first_seen_run_id) VALUES(?, 'run')").run(playerId);
  const artifacts = ["candidate-best.json", "candidate-agent.json"].map((artifactPath) => ({ path: artifactPath, kind: "candidate" as const, contentHash: contentHash(artifactPath), sizeBytes: 10 }));
  const forecasts = Array.from({ length: 16 }, (_, index) => ({
    playerId: index + 1, position: "MID" as const, projectedPoints: 3, expectedMinutes: 80, startProbability: 0.9,
    appearanceProbability: 0.95, p10: 0, p90: 10, startProbabilityInterval: null, roleEvidenceState: "current" as const,
    sourceCoverage: "complete" as const, adapterVersion: "test/1", modelVersion: "model/1"
  }));
  const core = { gameweek: 1, deadline, artifacts, forecasts };
  const archive = { schemaVersion: 1 as const, archiveId: stableId("archive", core), ...core, frozenAt: after, sourceGeneratedAt: before };
  recordGameweekArchive(db, archive);
  const points = [2, 1, noShowDefender ? 0 : 2, 2, 2, noShowDefender ? 7 : 1, 1, 3, 3, 3, 3, 1, 10, 2, 1, 5];
  ingestGameweekOutcomes(db, {
    schemaVersion: 1, gameweek: 1, observedAt: after, effectiveAt: after, finalized: true,
    outcomes: points.map((value, index) => ({ playerId: index + 1, status: "final", fixtures: [{ fixtureId: 100 + index, status: "finished", points: value, minutes: noShowDefender && index === 2 ? 0 : 90, started: !(noShowDefender && index === 2) }] }))
  });
  return { db, archive };
}

const positions = ["GKP", "GKP", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD", "FWD"] as const;
const starters = new Set([1, 3, 4, 5, 8, 9, 10, 11, 13, 14, 15]);

function candidate(candidateId: string, origin: "archived_candidate" | "submitted_team", sourceRef: string, captainPlayerId: number, finalForward = 15) {
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, finalForward];
  let benchOrder = 0;
  return {
    candidateId, origin, sourceRef, sourceContentHash: origin === "archived_candidate" ? contentHash(sourceRef) : null, frozenAt: before,
    picks: ids.map((playerId) => {
      const role = starters.has(playerId) || playerId === finalForward ? "starter" as const : "bench" as const;
      return { playerId, position: positions[playerId - 1]!, teamId: playerId, price: 5, role, benchOrder: role === "bench" ? benchOrder++ : null, availableAtDeadline: true };
    }),
    captainPlayerId, viceCaptainPlayerId: captainPlayerId === 13 ? 14 : 13, budgetLimit: 100,
    freeTransfersAvailable: 0, transfersUsed: 0, hitPoints: 0, chip: null, chipsAvailable: ["wildcard", "free_hit", "bench_boost", "triple_captain"] as const
  };
}

function regretRequest(archiveId: string) {
  return {
    schemaVersion: 1 as const, archiveId, gameweek: 1, generatedAt: after,
    agentCandidateId: "agent", submittedCandidateId: "submitted",
    candidates: [
      candidate("best", "archived_candidate", "candidate-best.json", 13),
      candidate("agent", "archived_candidate", "candidate-agent.json", 14),
      candidate("submitted", "submitted_team", "https://fantasy.premierleague.com/entry/1/event/1", 14, 16)
    ],
    agentRegretPath: [{ fromCandidateId: "best", toCandidateId: "agent", category: "captaincy" as const }],
    triggerAudits: [
      { triggerId: "fired", expiresAt: deadline, firedAt: before, evidenceArrivals: [{ evidenceId: "e1", arrivedAt: before, thresholdMet: true }] },
      { triggerId: "missed", expiresAt: deadline, firedAt: null, evidenceArrivals: [{ evidenceId: "e2", arrivedAt: before, thresholdMet: true }] },
      { triggerId: "stale", expiresAt: before, firedAt: deadline, evidenceArrivals: [{ evidenceId: "e3", arrivedAt: before, thresholdMet: false }] },
      { triggerId: "contradictory", expiresAt: deadline, firedAt: null, evidenceArrivals: [
        { evidenceId: "e4", arrivedAt: before, thresholdMet: true }, { evidenceId: "e5", arrivedAt: before, thresholdMet: false }
      ] }
    ],
    causalAttributions: [{ stage: "normal_outcome_variance" as const, status: "supported" as const, evidenceIds: ["outcomes"], note: "Observed points varied from the forecast." }]
  };
}

describe("attributable decision regret", () => {
  it("reconciles frozen agent regret and manager overrides as separate causal steps", async () => {
    const { db, archive } = await setup();
    const report = buildDecisionRegretReport(db, regretRequest(archive.archiveId));
    expect(report.candidateResults.map((item) => [item.candidateId, item.actualPoints])).toEqual([["best", 43], ["agent", 35], ["submitted", 39]]);
    expect(report.components).toEqual([
      { fromCandidateId: "best", toCandidateId: "agent", category: "captaincy", points: 8 },
      { fromCandidateId: "agent", toCandidateId: "submitted", category: "manager_override", points: -4 }
    ]);
    expect(report.totals).toEqual({ agentDecisionRegret: 8, managerOverrideRegret: -4, submittedRegret: 4 });
    expect(report.triggerAudits.map((item) => item.state)).toEqual(["fired", "missed", "stale", "contradictory"]);
    db.close();
  });

  it("rejects hindsight candidates, illegal resources, missing outcomes, and non-reconciling paths", async () => {
    const { db, archive } = await setup();
    const request = regretRequest(archive.archiveId);
    expect(() => buildDecisionRegretReport(db, { ...request, candidates: request.candidates.map((item, index) => index === 0 ? { ...item, frozenAt: after } : item) })).toThrow("not available before the deadline");
    expect(() => buildDecisionRegretReport(db, { ...request, candidates: request.candidates.map((item, index) => index === 0 ? { ...item, budgetLimit: 50 } : item) })).toThrow("available budget");
    expect(() => buildDecisionRegretReport(db, { ...request, agentRegretPath: [] })).toThrow("path is required");
    expect(() => buildDecisionRegretReport(db, { ...request, agentRegretPath: [{ ...request.agentRegretPath[0]!, category: "bench" }] })).toThrow("mislabeled as bench");
    db.prepare("UPDATE gameweek_outcome_batches SET finalized = 0").run();
    expect(() => buildDecisionRegretReport(db, request)).toThrow("Finalized outcome is unavailable");
    db.close();
  });

  it("applies formation-safe automatic substitutions from the frozen bench order", async () => {
    const { db, archive } = await setup(true);
    const report = buildDecisionRegretReport(db, regretRequest(archive.archiveId));
    expect(report.candidateResults[0]!.autosubstitutions).toEqual([{ outPlayerId: 3, inPlayerId: 6 }]);
    expect(report.candidateResults[0]!.countedPlayerIds).toContain(6);
    db.close();
  });
});

describe("governed model changes", () => {
  it("requires backtests and explicit approval, then replays a rollback on the same archive", async () => {
    const { db, archive } = await setup();
    registerModelVersion(db, { schemaVersion: 1, modelKey: "points", version: "1", parentVersion: null, createdAt: before, parameters: { weight: 1 } }, true);
    registerModelVersion(db, { schemaVersion: 1, modelKey: "points", version: "2", parentVersion: "1", createdAt: after, parameters: { weight: 1.1 } });
    const baseline = recordModelReplay(db, { schemaVersion: 1, modelKey: "points", version: "1", archiveId: archive.archiveId, generatedAt: after, metrics: { mae: 2 } });
    const target = recordModelReplay(db, { schemaVersion: 1, modelKey: "points", version: "2", archiveId: archive.archiveId, generatedAt: after, metrics: { mae: 1.8 } });
    const proposalCore = {
      schemaVersion: 1 as const, modelKey: "points", baseVersion: "1", targetVersion: "2", proposedAt: after,
      authorship: { kind: "coding_agent" as const, agent: "test-agent", authoredAt: after }, calibrationReportHash: contentHash("calibration"),
      sampleSize: 100, expectedBenefit: "Reduce held-out mean absolute error.", affectedCohorts: ["overall"], rollbackCriteria: ["MAE exceeds baseline"],
      backtests: [{ archiveId: archive.archiveId, baselineReplayId: baseline.replayId, candidateReplayId: target.replayId }]
    };
    const proposal = { ...proposalCore, proposalId: stableId("model-proposal", proposalCore) };
    proposeModelChange(db, proposal);
    expect(() => adoptModelChange(db, proposal.proposalId, { agent: "test-agent", authoredAt: after })).toThrow("explicit approval");
    const reviewCore = { schemaVersion: 1 as const, proposalId: proposal.proposalId, decision: "approve" as const, rationale: "Backtest meets the declared gate.", authorship: { kind: "coding_agent" as const, agent: "review-agent", authoredAt: after } };
    reviewModelChange(db, { ...reviewCore, reviewId: stableId("model-review", reviewCore) });
    expect(adoptModelChange(db, proposal.proposalId, { agent: "adopt-agent", authoredAt: after }).inserted).toBe(true);
    expect((db.prepare("SELECT version FROM model_versions WHERE model_key = 'points' AND status = 'active'").get() as { version: string }).version).toBe("2");
    expect(rollbackModelVersion(db, { modelKey: "points", toVersion: "1", rationale: "Rollback threshold fired.", agent: "rollback-agent", authoredAt: "2026-08-26T12:00:00.000Z" }).inserted).toBe(true);
    expect((db.prepare("SELECT version FROM model_versions WHERE model_key = 'points' AND status = 'active'").get() as { version: string }).version).toBe("1");
    db.close();
  });

  it("rejects proposals below the calibration threshold", async () => {
    const { db, archive } = await setup();
    registerModelVersion(db, { schemaVersion: 1, modelKey: "points", version: "1", parentVersion: null, createdAt: before, parameters: {} }, true);
    registerModelVersion(db, { schemaVersion: 1, modelKey: "points", version: "2", parentVersion: "1", createdAt: after, parameters: {} });
    const base = recordModelReplay(db, { schemaVersion: 1, modelKey: "points", version: "1", archiveId: archive.archiveId, generatedAt: after, metrics: {} });
    const target = recordModelReplay(db, { schemaVersion: 1, modelKey: "points", version: "2", archiveId: archive.archiveId, generatedAt: after, metrics: {} });
    expect(() => proposeModelChange(db, {
      schemaVersion: 1, proposalId: stableId("model-proposal", "invalid"), modelKey: "points", baseVersion: "1", targetVersion: "2", proposedAt: after,
      authorship: { kind: "coding_agent", agent: "test", authoredAt: after }, calibrationReportHash: contentHash("calibration"), sampleSize: 99,
      expectedBenefit: "None", affectedCohorts: ["overall"], rollbackCriteria: ["Any"], backtests: [{ archiveId: archive.archiveId, baselineReplayId: base.replayId, candidateReplayId: target.replayId }]
    })).toThrow();
    db.close();
  });
});
