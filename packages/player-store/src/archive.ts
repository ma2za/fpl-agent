import type Database from "better-sqlite3";
import {
  CalibrationReportSchema,
  GameweekArchiveManifestSchema,
  GameweekOutcomeBatchSchema,
  type CalibrationReport
} from "./types";
import { contentHash, stableId, stableJson } from "./store";

export function assertPreDeadlineArtifact(filePath: string, bytes: Buffer, deadline: string) {
  if (!filePath.toLowerCase().endsWith(".json")) return;
  const value = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
  const authorship = value.authorship as Record<string, unknown> | undefined;
  const payload = value.payload as Record<string, unknown> | undefined;
  const payloadAuthorship = payload?.authorship as Record<string, unknown> | undefined;
  const timestamps = [value.generatedAt, value.authoredAt, authorship?.authoredAt, payload?.generatedAt, payloadAuthorship?.authoredAt]
    .filter((item): item is string => typeof item === "string" && Number.isFinite(Date.parse(item)));
  if (timestamps.some((timestamp) => Date.parse(timestamp) > Date.parse(deadline))) {
    throw new Error(`Post-deadline artifact cannot be frozen: ${filePath}.`);
  }
}

export function recordGameweekArchive(db: Database.Database, value: unknown) {
  const archive = GameweekArchiveManifestSchema.parse(value);
  const expectedId = stableId("archive", { gameweek: archive.gameweek, deadline: archive.deadline, artifacts: archive.artifacts, forecasts: archive.forecasts });
  if (archive.archiveId !== expectedId) throw new Error("Gameweek archive ID does not match its frozen content.");
  if (Date.parse(archive.sourceGeneratedAt) > Date.parse(archive.deadline)) throw new Error("Post-deadline artifacts cannot enter a frozen gameweek archive.");
  const existing = db.prepare("SELECT archive_id, content_hash FROM gameweek_archives WHERE gameweek = ?").get(archive.gameweek) as { archive_id: string; content_hash: string } | undefined;
  const hashValue = contentHash(archive);
  if (existing) {
    if (existing.archive_id !== archive.archiveId || existing.content_hash !== hashValue) throw new Error(`GW${archive.gameweek} is already frozen with different content.`);
    return { archive, inserted: false };
  }
  const knownPlayers = new Set((db.prepare("SELECT player_id FROM players").all() as Array<{ player_id: number }>).map((row) => row.player_id));
  const unknown = archive.forecasts.filter((forecast) => !knownPlayers.has(forecast.playerId)).map((forecast) => forecast.playerId);
  if (unknown.length > 0) throw new Error(`Archive contains unknown player IDs: ${unknown.join(", ")}.`);
  const insert = db.transaction(() => {
    db.prepare(`INSERT INTO gameweek_archives(archive_id, gameweek, deadline, frozen_at, source_generated_at, content_hash, raw_json)
      VALUES(?, ?, ?, ?, ?, ?, ?)`).run(archive.archiveId, archive.gameweek, archive.deadline, archive.frozenAt, archive.sourceGeneratedAt, hashValue, stableJson(archive));
    const artifact = db.prepare(`INSERT INTO gameweek_archive_artifacts(archive_id, artifact_path, artifact_kind, content_hash, size_bytes)
      VALUES(?, ?, ?, ?, ?)`);
    for (const item of archive.artifacts) artifact.run(archive.archiveId, item.path, item.kind, item.contentHash, item.sizeBytes);
    const forecast = db.prepare(`INSERT INTO archived_player_forecasts(
      archive_id, player_id, position, projected_points, expected_minutes, start_probability, appearance_probability,
      p10, p90, start_interval_lower, start_interval_upper, role_evidence_state, source_coverage,
      adapter_version, model_version, raw_json
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const item of archive.forecasts) forecast.run(
      archive.archiveId, item.playerId, item.position, item.projectedPoints, item.expectedMinutes,
      item.startProbability, item.appearanceProbability, item.p10, item.p90,
      item.startProbabilityInterval?.lower ?? null, item.startProbabilityInterval?.upper ?? null,
      item.roleEvidenceState, item.sourceCoverage, item.adapterVersion, item.modelVersion, stableJson(item)
    );
  });
  insert.immediate();
  return { archive, inserted: true };
}

export function ingestGameweekOutcomes(db: Database.Database, value: unknown) {
  const batch = GameweekOutcomeBatchSchema.parse(value);
  if (Date.parse(batch.effectiveAt) > Date.parse(batch.observedAt)) throw new Error("Outcome effective time cannot be after its observation time.");
  if (new Set(batch.outcomes.map((outcome) => outcome.playerId)).size !== batch.outcomes.length) throw new Error("Outcome batch contains duplicate players.");
  const batchId = stableId("outcome-batch", batch);
  const batchHash = contentHash(batch);
  const priorBatch = db.prepare("SELECT content_hash FROM gameweek_outcome_batches WHERE batch_id = ?").get(batchId) as { content_hash: string } | undefined;
  if (priorBatch) return { batchId, inserted: false, revisions: 0 };
  const knownPlayers = new Set((db.prepare("SELECT player_id FROM players").all() as Array<{ player_id: number }>).map((row) => row.player_id));
  const latest = db.prepare(`SELECT outcome_id, effective_at, content_hash FROM player_gameweek_outcomes
    WHERE gameweek = ? AND player_id = ? ORDER BY effective_at DESC, observed_at DESC, rowid DESC LIMIT 1`);
  const insertOutcome = db.prepare(`INSERT OR IGNORE INTO player_gameweek_outcomes(
    outcome_id, batch_id, gameweek, player_id, status, points, minutes, starts, appearances, fixture_count,
    observed_at, effective_at, content_hash, supersedes_id, raw_json
  ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let revisions = 0;
  const insert = db.transaction(() => {
    db.prepare(`INSERT INTO gameweek_outcome_batches(batch_id, gameweek, observed_at, effective_at, finalized, content_hash)
      VALUES(?, ?, ?, ?, ?, ?)`).run(batchId, batch.gameweek, batch.observedAt, batch.effectiveAt, Number(batch.finalized), batchHash);
    for (const outcome of batch.outcomes) {
      if (!knownPlayers.has(outcome.playerId)) throw new Error(`Outcome references unknown player ${outcome.playerId}.`);
      const core = { status: outcome.status, fixtures: outcome.fixtures };
      const outcomeHash = contentHash(core);
      const prior = latest.get(batch.gameweek, outcome.playerId) as { outcome_id: string; effective_at: string; content_hash: string } | undefined;
      if (prior?.content_hash === outcomeHash) continue;
      if (prior && Date.parse(batch.effectiveAt) < Date.parse(prior.effective_at)) throw new Error(`Outcome correction for player ${outcome.playerId} predates the current revision.`);
      const finished = outcome.fixtures.filter((fixture) => fixture.status === "finished");
      const outcomeId = stableId("outcome", { gameweek: batch.gameweek, playerId: outcome.playerId, outcomeHash });
      revisions += insertOutcome.run(
        outcomeId, batchId, batch.gameweek, outcome.playerId, outcome.status,
        finished.reduce((sum, fixture) => sum + fixture.points, 0),
        finished.reduce((sum, fixture) => sum + fixture.minutes, 0),
        finished.filter((fixture) => fixture.started).length,
        finished.filter((fixture) => fixture.minutes > 0).length,
        outcome.fixtures.length, batch.observedAt, batch.effectiveAt, outcomeHash, prior?.outcome_id ?? null, stableJson(outcome)
      ).changes;
    }
  });
  insert.immediate();
  return { batchId, inserted: true, revisions };
}

const rounded = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

export function buildCalibrationReport(db: Database.Database, generatedAt: string): CalibrationReport {
  const records = db.prepare(`SELECT a.gameweek, f.*, o.outcome_id, o.status, o.points, o.minutes, o.starts, o.appearances, b.finalized
    FROM archived_player_forecasts f JOIN gameweek_archives a ON a.archive_id = f.archive_id
    LEFT JOIN player_gameweek_outcomes o ON o.gameweek = a.gameweek AND o.player_id = f.player_id
      AND o.rowid = (SELECT latest.rowid FROM player_gameweek_outcomes latest
        WHERE latest.gameweek = a.gameweek AND latest.player_id = f.player_id
        ORDER BY latest.effective_at DESC, latest.observed_at DESC, latest.rowid DESC LIMIT 1)
    LEFT JOIN gameweek_outcome_batches b ON b.batch_id = o.batch_id
    ORDER BY a.gameweek, f.player_id`).all() as Array<Record<string, unknown>>;
  const eligible = records.filter((row) => row.outcome_id && Number(row.finalized) === 1 && ["final", "blank"].includes(String(row.status)));
  const rows = eligible.map((row) => {
    const startProbability = Number(row.start_probability);
    const appearanceProbability = Number(row.appearance_probability);
    const started = Number(row.starts) > 0 ? 1 : 0;
    const appeared = Number(row.appearances) > 0 ? 1 : 0;
    const projectedPoints = Number(row.projected_points);
    const actualPoints = Number(row.points);
    const expectedMinutes = Number(row.expected_minutes);
    const actualMinutes = Number(row.minutes);
    return {
      gameweek: Number(row.gameweek), playerId: Number(row.player_id), position: String(row.position),
      projectedPoints, actualPoints, pointsError: rounded(actualPoints - projectedPoints), absolutePointsError: rounded(Math.abs(actualPoints - projectedPoints)),
      expectedMinutes, actualMinutes, minutesError: rounded(actualMinutes - expectedMinutes),
      startProbability, started, startBrier: rounded((startProbability - started) ** 2),
      appearanceProbability, appeared, appearanceBrier: rounded((appearanceProbability - appeared) ** 2),
      pointsIntervalCovered: actualPoints >= Number(row.p10) && actualPoints <= Number(row.p90),
      probabilityBand: `${Math.floor(startProbability * 10) * 10}-${Math.min(100, Math.floor(startProbability * 10) * 10 + 10)}%`,
      roleEvidenceState: String(row.role_evidence_state), sourceCoverage: String(row.source_coverage),
      adapterVersion: String(row.adapter_version), modelVersion: String(row.model_version), outcomeId: String(row.outcome_id)
    };
  });
  const dimensions = [
    ["overall", () => "all"], ["position", (row: typeof rows[number]) => row.position],
    ["role_evidence_state", (row: typeof rows[number]) => row.roleEvidenceState],
    ["source_coverage", (row: typeof rows[number]) => row.sourceCoverage],
    ["adapter_version", (row: typeof rows[number]) => row.adapterVersion],
    ["model_version", (row: typeof rows[number]) => row.modelVersion],
    ["probability_band", (row: typeof rows[number]) => row.probabilityBand]
  ] as const;
  const cohorts = dimensions.flatMap(([dimension, value]) => {
    const groups = new Map<string, typeof rows>();
    for (const row of rows) groups.set(value(row), [...(groups.get(value(row)) ?? []), row]);
    return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([groupValue, group]) => ({
      dimension, value: groupValue, sampleSize: group.length,
      meanPointsError: rounded(group.reduce((sum, row) => sum + row.pointsError, 0) / group.length),
      meanAbsolutePointsError: rounded(group.reduce((sum, row) => sum + row.absolutePointsError, 0) / group.length),
      meanMinutesError: rounded(group.reduce((sum, row) => sum + row.minutesError, 0) / group.length),
      startBrier: rounded(group.reduce((sum, row) => sum + row.startBrier, 0) / group.length),
      appearanceBrier: rounded(group.reduce((sum, row) => sum + row.appearanceBrier, 0) / group.length),
      pointsIntervalCoverage: rounded(group.filter((row) => row.pointsIntervalCovered).length / group.length)
    }));
  });
  return CalibrationReportSchema.parse({
    schemaVersion: 1, generatedAt, gameweeks: [...new Set(rows.map((row) => row.gameweek))],
    minimumProposalSample: 100, summary: { eligible: rows.length, excluded: records.length - rows.length }, rows, cohorts,
    parameterChangeProposal: {
      eligible: rows.length >= 100, sampleSize: rows.length,
      note: rows.length >= 100
        ? "Sample threshold met; any parameter change still requires a separate versioned agent review."
        : `No parameter change proposal: ${rows.length}/100 eligible player-gameweek observations.`
    }
  });
}

export function readGameweekArchive(db: Database.Database, gameweek: number) {
  const row = db.prepare("SELECT raw_json FROM gameweek_archives WHERE gameweek = ?").get(gameweek) as { raw_json: string } | undefined;
  return row ? GameweekArchiveManifestSchema.parse(JSON.parse(row.raw_json)) : null;
}
