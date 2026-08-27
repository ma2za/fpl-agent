import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertPreDeadlineArtifact,
  buildCalibrationReport,
  contentHash,
  ingestGameweekOutcomes,
  migratePlayerStore,
  openPlayerStore,
  recordGameweekArchive,
  stableId
} from "../src";

const roots: string[] = [];
const beforeDeadline = "2026-08-21T12:00:00.000Z";
const deadline = "2026-08-21T17:30:00.000Z";
const afterDeadline = "2026-08-25T12:00:00.000Z";

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function database() {
  const root = await mkdtemp(path.join(os.tmpdir(), "archive-test-"));
  roots.push(root);
  const db = openPlayerStore(path.join(root, "store.sqlite"));
  migratePlayerStore(db, beforeDeadline);
  db.prepare("INSERT INTO ingestion_runs(run_id, gameweek, mode, observed_at) VALUES('run', 1, 'offline', ?)").run(beforeDeadline);
  for (const playerId of [1, 2, 3, 4]) db.prepare("INSERT INTO players(player_id, first_seen_run_id) VALUES(?, 'run')").run(playerId);
  return db;
}

function archive(sourceGeneratedAt = beforeDeadline) {
  const artifacts = [{ path: "recommendation.json", kind: "decision" as const, contentHash: contentHash("decision"), sizeBytes: 8 }];
  const forecasts = [1, 2, 3, 4].map((playerId) => ({
    playerId,
    position: playerId === 1 ? "GKP" as const : "MID" as const,
    projectedPoints: playerId,
    expectedMinutes: 70,
    startProbability: 0.75,
    appearanceProbability: 0.9,
    p10: 0,
    p90: 8,
    startProbabilityInterval: { lower: 0.6, upper: 0.9 },
    roleEvidenceState: playerId === 1 ? "current" as const : "missing" as const,
    sourceCoverage: playerId === 1 ? "complete" as const : "incomplete" as const,
    adapterVersion: "test/1",
    modelVersion: "model/1"
  }));
  const core = { gameweek: 1, deadline, artifacts, forecasts };
  return {
    schemaVersion: 1 as const,
    archiveId: stableId("archive", core),
    ...core,
    frozenAt: afterDeadline,
    sourceGeneratedAt
  };
}

describe("immutable gameweek archive and calibration", () => {
  it("enforces artifact timestamps without discarding binary simulation data", () => {
    expect(() => assertPreDeadlineArtifact(
      "candidate.json",
      Buffer.from(JSON.stringify({ generatedAt: "2026-08-21T17:31:00.000Z" })),
      deadline
    )).toThrow("Post-deadline artifact");
    expect(() => assertPreDeadlineArtifact(
      "decision.json",
      Buffer.from(JSON.stringify({ authorship: { authoredAt: "2026-08-22T12:00:00.000Z" } })),
      deadline
    )).toThrow("Post-deadline artifact");
    expect(() => assertPreDeadlineArtifact(
      "projection.json",
      Buffer.from(JSON.stringify({ generatedAt: beforeDeadline })),
      deadline
    )).not.toThrow();
    expect(() => assertPreDeadlineArtifact("simulation.bin", Buffer.from([0, 1, 2]), deadline)).not.toThrow();
  });

  it("freezes one pre-deadline snapshot idempotently and rejects replacement or post-deadline inputs", async () => {
    const db = await database();
    expect(recordGameweekArchive(db, archive()).inserted).toBe(true);
    expect(recordGameweekArchive(db, archive()).inserted).toBe(false);
    expect(() => recordGameweekArchive(db, { ...archive(), frozenAt: "2026-08-26T12:00:00.000Z" }))
      .toThrow("already frozen with different content");
    expect(() => recordGameweekArchive(db, archive(afterDeadline))).toThrow("Post-deadline artifacts");
    ingestGameweekOutcomes(db, {
      schemaVersion: 1,
      gameweek: 1,
      observedAt: afterDeadline,
      effectiveAt: afterDeadline,
      finalized: false,
      outcomes: [{ playerId: 1, status: "final", fixtures: [{ fixtureId: 10, status: "finished", points: 5, minutes: 90, started: true }] }]
    });
    expect(buildCalibrationReport(db, "2026-08-26T12:00:00.000Z").summary.eligible).toBe(0);
    db.close();
  });

  it("stores doubles, blanks, postponements, missing outcomes, and linked corrections", async () => {
    const db = await database();
    recordGameweekArchive(db, archive());
    const first = {
      schemaVersion: 1 as const,
      gameweek: 1,
      observedAt: afterDeadline,
      effectiveAt: afterDeadline,
      finalized: true,
      outcomes: [
        { playerId: 1, status: "final" as const, fixtures: [
          { fixtureId: 10, status: "finished" as const, points: 3, minutes: 90, started: true },
          { fixtureId: 11, status: "finished" as const, points: 2, minutes: 30, started: false }
        ] },
        { playerId: 2, status: "blank" as const, fixtures: [] },
        { playerId: 3, status: "postponed" as const, fixtures: [{ fixtureId: 12, status: "postponed" as const, points: 0, minutes: 0, started: false }] },
        { playerId: 4, status: "missing" as const, fixtures: [] }
      ]
    };
    expect(ingestGameweekOutcomes(db, first)).toMatchObject({ inserted: true, revisions: 4 });
    expect(ingestGameweekOutcomes(db, first)).toMatchObject({ inserted: false, revisions: 0 });
    const correction = {
      ...first,
      observedAt: "2026-08-26T12:00:00.000Z",
      effectiveAt: "2026-08-26T10:00:00.000Z",
      outcomes: [{ playerId: 1, status: "final" as const, fixtures: [
        { fixtureId: 10, status: "finished" as const, points: 4, minutes: 90, started: true },
        { fixtureId: 11, status: "finished" as const, points: 2, minutes: 30, started: false }
      ] }]
    };
    expect(ingestGameweekOutcomes(db, correction).revisions).toBe(1);
    const revisions = db.prepare("SELECT points, supersedes_id FROM player_gameweek_outcomes WHERE player_id = 1 ORDER BY effective_at").all() as Array<{ points: number; supersedes_id: string | null }>;
    expect(revisions).toHaveLength(2);
    expect(revisions[1]).toMatchObject({ points: 6 });
    expect(revisions[1].supersedes_id).toMatch(/^outcome:/);

    const report = buildCalibrationReport(db, "2026-08-26T13:00:00.000Z");
    expect(report.summary).toEqual({ eligible: 2, excluded: 2 });
    expect(report.rows.find((row) => row.playerId === 1)).toMatchObject({ actualPoints: 6, actualMinutes: 120, appeared: 1, started: 1 });
    expect(report.rows.find((row) => row.playerId === 2)).toMatchObject({ actualPoints: 0, actualMinutes: 0, appeared: 0, started: 0 });
    const overall = report.cohorts.find((cohort) => cohort.dimension === "overall")!;
    expect(overall.meanAbsolutePointsError).toBe(
      report.rows.reduce((sum, row) => sum + row.absolutePointsError, 0) / report.rows.length
    );
    expect(report.parameterChangeProposal).toMatchObject({ eligible: false, sampleSize: 2 });
    db.close();
  });
});
