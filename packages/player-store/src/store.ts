import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  DiscoveryCoverageSchema,
  EvidenceIngestionBatchSchema,
  EvidenceResearchWorklistSchema,
  EvidenceStoreManifestSchema,
  NewsObservationSchema,
  PlayerDossierSchema,
  PlayerEvidenceSnapshotSchema,
  PlayerPerformanceObservationSchema,
  SourceDocumentSchema,
  TriggerEvaluationSchema,
  type DiscoveryCoverage,
  type EvidenceIngestionBatch,
  type EvidenceResearchWorklist,
  type EvidenceStoreManifest,
  type NewsObservation,
  type PlayerDossier,
  type PlayerEvidenceSnapshot,
  type PlayerPerformanceObservation,
  type TriggerEvaluation
} from "./types";

export const PLAYER_STORE_SCHEMA_VERSION = 1;
export const DEFAULT_PLAYER_STORE_PATH = path.join("data", "player-intelligence", "player-intelligence.sqlite");

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function canonical(value: unknown): Json {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return String(value);
}

export function stableJson(value: unknown) {
  return JSON.stringify(canonical(value));
}

export function contentHash(value: unknown) {
  return createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : stableJson(value)).digest("hex");
}

export function stableId(prefix: string, value: unknown) {
  return `${prefix}:${contentHash(value)}`;
}

function migrationSql() {
  return readFileSync(new URL("../migrations/001_initial.sql", import.meta.url), "utf8");
}

export function openPlayerStore(filePath = DEFAULT_PLAYER_STORE_PATH, options: { readonly?: boolean } = {}) {
  if (!options.readonly) mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath, options.readonly ? { readonly: true, fileMustExist: true } : {});
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  if (!options.readonly) db.pragma("journal_mode = DELETE");
  return db;
}

export function migratePlayerStore(db: Database.Database, appliedAt = new Date().toISOString()) {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
  const current = table
    ? Number((db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version: number }).version)
    : 0;
  if (current > PLAYER_STORE_SCHEMA_VERSION) {
    throw new Error(`Player store schema ${current} is newer than supported schema ${PLAYER_STORE_SCHEMA_VERSION}.`);
  }
  if (current < 1) {
    const apply = db.transaction(() => {
      db.exec(migrationSql());
      db.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES(1, 'initial', ?)").run(appliedAt);
    });
    apply.immediate();
  }
  return PLAYER_STORE_SCHEMA_VERSION;
}

export async function clonePlayerStore(sourcePath: string, stagedPath: string, appliedAt: string) {
  mkdirSync(path.dirname(stagedPath), { recursive: true });
  rmSync(stagedPath, { force: true });
  if (existsSync(sourcePath)) {
    const source = openPlayerStore(sourcePath, { readonly: true });
    try {
      await source.backup(stagedPath);
    } finally {
      source.close();
    }
  }
  const staged = openPlayerStore(stagedPath);
  try {
    migratePlayerStore(staged, appliedAt);
    const integrity = staged.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") throw new Error(`Player store integrity check failed: ${String(integrity)}.`);
  } finally {
    staged.close();
  }
}

export function validatePlayerStore(filePath: string) {
  const db = openPlayerStore(filePath, { readonly: true });
  try {
    const version = Number((db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version: number }).version);
    if (version !== PLAYER_STORE_SCHEMA_VERSION) throw new Error(`Expected player store schema ${PLAYER_STORE_SCHEMA_VERSION}; found ${version}.`);
    const foreignKeys = db.pragma("foreign_key_check") as unknown[];
    if (foreignKeys.length > 0) throw new Error("Player store foreign-key validation failed.");
    if (db.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Player store integrity check failed.");
  } finally {
    db.close();
  }
}

export async function updatePlayerStoreTransactionally<T>(filePath: string, input: {
  appliedAt: string;
  update: (db: Database.Database) => T;
}) {
  const stagedPath = `${filePath}.staged`;
  const backupPath = `${filePath}.backup`;
  await clonePlayerStore(filePath, stagedPath, input.appliedAt);
  let result: T;
  const staged = openPlayerStore(stagedPath);
  try {
    result = input.update(staged);
  } finally {
    staged.close();
  }
  validatePlayerStore(stagedPath);
  rmSync(backupPath, { force: true });
  const hadTarget = existsSync(filePath);
  if (hadTarget) renameSync(filePath, backupPath);
  try {
    renameSync(stagedPath, filePath);
  } catch (error) {
    if (hadTarget) renameSync(backupPath, filePath);
    throw error;
  }
  rmSync(backupPath, { force: true });
  return result;
}

export type OfficialStorePlayer = {
  playerId: number;
  name: string;
  webName: string;
  teamId: number;
  teamName: string;
  position: string;
  price: number;
  status: string;
  selectedByPercent: number | null;
  minutes: number | null;
  totalPoints: number | null;
  aliases: string[];
  officialFields: Record<string, unknown>;
};

export type PlayerSummaryResult = {
  playerId: number;
  status: "available" | "missing" | "failed" | "stale";
  retrievedAt: string | null;
  contentHash: string | null;
  fixtures: Array<Record<string, unknown>>;
  history: Array<Record<string, unknown>>;
  error: string | null;
};

export function ingestOfficialRun(db: Database.Database, input: {
  runId: string;
  gameweek: number;
  mode: "live" | "offline";
  observedAt: string;
  bootstrapHash: string;
  fixturesHash: string;
  players: OfficialStorePlayer[];
  summaries: PlayerSummaryResult[];
  roleObservations?: Array<{ observationId: string; playerId: number; dimension: string; signal: string; observedAt: string; contentHash: string; raw: unknown }>;
}) {
  const summaryById = new Map(input.summaries.map((item) => [item.playerId, item]));
  const inputHash = contentHash({
    gameweek: input.gameweek,
    mode: input.mode,
    observedAt: input.observedAt,
    bootstrapHash: input.bootstrapHash,
    fixturesHash: input.fixturesHash,
    players: input.players,
    summaries: input.summaries,
    roleObservations: input.roleObservations ?? []
  });
  const transaction = db.transaction(() => {
    const existingRun = db.prepare("SELECT input_hash FROM ingestion_runs WHERE run_id = ?").get(input.runId) as { input_hash: string | null } | undefined;
    if (existingRun && existingRun.input_hash !== inputHash) throw new Error(`Official ingestion run ${input.runId} was replayed with different input.`);
    db.prepare("INSERT OR IGNORE INTO ingestion_runs(run_id, gameweek, mode, observed_at, bootstrap_hash, fixtures_hash, input_hash) VALUES(?, ?, ?, ?, ?, ?, ?)")
      .run(input.runId, input.gameweek, input.mode, input.observedAt, input.bootstrapHash, input.fixturesHash, inputHash);
    const insertPlayer = db.prepare("INSERT OR IGNORE INTO players(player_id, first_seen_run_id) VALUES(?, ?)");
    const insertAlias = db.prepare("INSERT OR IGNORE INTO player_aliases(player_id, alias, first_seen_run_id) VALUES(?, ?, ?)");
    const insertSnapshot = db.prepare(`INSERT OR IGNORE INTO player_snapshots(
      snapshot_id, player_id, observed_at, content_hash, name, web_name, team_id, team_name, position, price,
      status, selected_by_percent, minutes, total_points, raw_json
    ) VALUES(@snapshotId, @playerId, @observedAt, @contentHash, @name, @webName, @teamId, @teamName, @position, @price,
      @status, @selectedByPercent, @minutes, @totalPoints, @rawJson)`);
    const linkSnapshot = db.prepare("INSERT OR IGNORE INTO run_player_snapshots(run_id, player_id, snapshot_id) VALUES(?, ?, ?)");
    const insertCoverage = db.prepare(`INSERT OR IGNORE INTO player_summary_coverage(
      run_id, player_id, status, retrieved_at, content_hash, error
    ) VALUES(?, ?, ?, ?, ?, ?)`);
    const priorPerformance = db.prepare(`SELECT performance_id FROM player_performance_observations
      WHERE player_id = ? AND fixture_id = ? ORDER BY observed_at DESC, rowid DESC LIMIT 1`);
    const insertPerformance = db.prepare(`INSERT OR IGNORE INTO player_performance_observations(
      performance_id, player_id, fixture_id, gameweek, observed_at, content_hash, supersedes_id, raw_json
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`);
    const linkPerformance = db.prepare("INSERT OR IGNORE INTO run_player_performance(run_id, performance_id) VALUES(?, ?)");
    const priorFixture = db.prepare(`SELECT fixture_observation_id FROM player_fixture_observations
      WHERE player_id = ? AND fixture_id = ? ORDER BY observed_at DESC, rowid DESC LIMIT 1`);
    const insertFixture = db.prepare(`INSERT OR IGNORE INTO player_fixture_observations(
      fixture_observation_id, player_id, fixture_id, observed_at, content_hash, supersedes_id, raw_json
    ) VALUES(?, ?, ?, ?, ?, ?, ?)`);
    const linkFixture = db.prepare("INSERT OR IGNORE INTO run_player_fixtures(run_id, fixture_observation_id) VALUES(?, ?)");

    for (const player of [...input.players].sort((a, b) => a.playerId - b.playerId)) {
      insertPlayer.run(player.playerId, input.runId);
      for (const alias of [...new Set(player.aliases.map((item) => item.trim()).filter(Boolean))].sort()) {
        insertAlias.run(player.playerId, alias, input.runId);
      }
      const { aliases: _aliases, ...snapshotValue } = player;
      const snapshotHash = contentHash(snapshotValue);
      const snapshot: PlayerEvidenceSnapshot = PlayerEvidenceSnapshotSchema.parse({
        snapshotId: stableId("snapshot", { playerId: player.playerId, snapshotHash }),
        observedAt: input.observedAt,
        contentHash: snapshotHash,
        ...snapshotValue
      });
      const { officialFields, ...snapshotColumns } = snapshot;
      insertSnapshot.run({ ...snapshotColumns, rawJson: stableJson(officialFields) });
      linkSnapshot.run(input.runId, player.playerId, snapshot.snapshotId);

      const summary = summaryById.get(player.playerId) ?? {
        playerId: player.playerId, status: "missing" as const, retrievedAt: null, contentHash: null, fixtures: [], history: [], error: "Player summary was not acquired."
      };
      insertCoverage.run(input.runId, player.playerId, summary.status, summary.retrievedAt, summary.contentHash, summary.error);
      if (summary.status !== "available" && summary.status !== "stale") continue;
      for (const fixture of summary.fixtures) {
        const fixtureId = Number(fixture.id);
        if (!Number.isInteger(fixtureId) || fixtureId < 1) continue;
        const fixtureHash = contentHash(fixture);
        const fixtureObservationId = stableId("player-fixture", { playerId: player.playerId, fixtureId, fixtureHash });
        const prior = priorFixture.get(player.playerId, fixtureId) as { fixture_observation_id: string } | undefined;
        insertFixture.run(fixtureObservationId, player.playerId, fixtureId, summary.retrievedAt ?? input.observedAt,
          fixtureHash, prior?.fixture_observation_id === fixtureObservationId ? null : prior?.fixture_observation_id ?? null,
          stableJson(fixture));
        linkFixture.run(input.runId, fixtureObservationId);
      }
      for (const history of summary.history) {
        const fixtureId = Number(history.fixture);
        if (!Number.isInteger(fixtureId) || fixtureId < 1) continue;
        const performanceHash = contentHash(history);
        const performanceId = stableId("performance", { playerId: player.playerId, fixtureId, performanceHash });
        const prior = priorPerformance.get(player.playerId, fixtureId) as { performance_id: string } | undefined;
        insertPerformance.run(
          performanceId,
          player.playerId,
          fixtureId,
          Number.isInteger(Number(history.round)) && Number(history.round) > 0 ? Number(history.round) : null,
          summary.retrievedAt ?? input.observedAt,
          performanceHash,
          prior?.performance_id === performanceId ? null : prior?.performance_id ?? null,
          stableJson(history)
        );
        linkPerformance.run(input.runId, performanceId);
      }
    }

    const insertRole = db.prepare(`INSERT OR IGNORE INTO role_observations(
      observation_id, player_id, dimension, signal, observed_at, content_hash, raw_json
    ) VALUES(?, ?, ?, ?, ?, ?, ?)`);
    for (const role of input.roleObservations ?? []) {
      insertRole.run(role.observationId, role.playerId, role.dimension, role.signal, role.observedAt, role.contentHash, stableJson(role.raw));
    }
  });
  transaction.immediate();
}

export function buildResearchWorklist(db: Database.Database, input: {
  runId: string;
  gameweek: number;
  generatedAt: string;
  clubAliases?: Record<number, string[]>;
}) {
  const rows = db.prepare(`SELECT s.player_id, s.name, s.web_name, s.team_id, s.team_name
    FROM run_player_snapshots r JOIN player_snapshots s ON s.snapshot_id = r.snapshot_id
    WHERE r.run_id = ? ORDER BY s.player_id`).all(input.runId) as Array<{
      player_id: number; name: string; web_name: string; team_id: number; team_name: string;
    }>;
  const worklistId = stableId("worklist", { runId: input.runId, gameweek: input.gameweek, players: rows.map((row) => [row.player_id, row.name, row.team_name]) });
  const worklist: EvidenceResearchWorklist = EvidenceResearchWorklistSchema.parse({
    schemaVersion: 1,
    worklistId,
    runId: input.runId,
    gameweek: input.gameweek,
    generatedAt: input.generatedAt,
    players: rows.map((row) => {
      const aliases = [...new Set([row.name, row.web_name])].sort();
      const clubAliases = [...new Set([row.team_name, ...(input.clubAliases?.[row.team_id] ?? [])])].sort();
      return {
        playerId: row.player_id,
        name: row.name,
        webName: row.web_name,
        team: row.team_name,
        aliases,
        clubAliases,
        queries: [`${row.name} ${clubAliases[0]} team news`, `${row.web_name} injury lineup role`],
        status: "pending" as const
      };
    })
  });
  const insert = db.prepare(`INSERT OR IGNORE INTO discovery_coverage(
    coverage_id, worklist_id, player_id, status, searched_at, queries_json, result_count, note
  ) VALUES(?, ?, ?, 'pending', NULL, ?, 0, '')`);
  const transaction = db.transaction(() => {
    db.prepare(`INSERT OR IGNORE INTO evidence_worklists(
      worklist_id, run_id, gameweek, generated_at, content_hash, raw_json
    ) VALUES(?, ?, ?, ?, ?, ?)`)
      .run(worklistId, input.runId, input.gameweek, input.generatedAt, contentHash(worklist), stableJson(worklist));
    for (const player of worklist.players) {
      insert.run(stableId("coverage", { worklistId, playerId: player.playerId, status: "pending" }), worklistId, player.playerId, stableJson(player.queries));
    }
  });
  transaction.immediate();
  return worklist;
}

export function latestResearchWorklist(db: Database.Database, gameweek: number) {
  const row = db.prepare(`SELECT raw_json FROM evidence_worklists WHERE gameweek = ?
    ORDER BY generated_at DESC, rowid DESC LIMIT 1`).get(gameweek) as { raw_json: string } | undefined;
  return row ? EvidenceResearchWorklistSchema.parse(JSON.parse(row.raw_json)) : null;
}

export function ingestEvidenceBatch(db: Database.Database, value: unknown, now = new Date()) {
  const batch = EvidenceIngestionBatchSchema.parse(value);
  const authoredAt = Date.parse(batch.authorship.authoredAt);
  const knownPlayers = new Set((db.prepare("SELECT player_id FROM players").all() as Array<{ player_id: number }>).map((row) => row.player_id));
  const worklist = db.prepare("SELECT gameweek, raw_json FROM evidence_worklists WHERE worklist_id = ?").get(batch.worklistId) as { gameweek: number; raw_json: string } | undefined;
  if (!worklist) throw new Error(`Unknown evidence worklist ${batch.worklistId}.`);
  if (worklist.gameweek !== batch.gameweek) throw new Error(`Evidence batch GW${batch.gameweek} does not match its GW${worklist.gameweek} worklist.`);
  const worklistPlayers = new Set(EvidenceResearchWorklistSchema.parse(JSON.parse(worklist.raw_json)).players.map((player) => player.playerId));
  for (const item of [...batch.coverage, ...batch.observations]) {
    if (!knownPlayers.has(item.playerId)) throw new Error(`Evidence batch references unknown player ${item.playerId}.`);
    if (!worklistPlayers.has(item.playerId)) throw new Error(`Player ${item.playerId} does not belong to worklist ${batch.worklistId}.`);
  }
  if (authoredAt > now.getTime()) throw new Error("Evidence batch authorship time is in the future.");
  if (new Set(batch.coverage.map((item) => item.playerId)).size !== batch.coverage.length) throw new Error("Evidence batch contains duplicate player coverage entries.");
  for (const coverage of batch.coverage) {
    if (Date.parse(coverage.searchedAt) > authoredAt || Date.parse(coverage.searchedAt) > now.getTime()) {
      throw new Error(`Player ${coverage.playerId} has a future search-completion time.`);
    }
  }
  const documentHashes = new Set(batch.documents.map((document) => document.contentHash));
  if (documentHashes.size !== batch.documents.length) throw new Error("Evidence batch contains duplicate document content hashes.");
  for (const document of batch.documents) {
    if (Date.parse(document.publishedAt) > authoredAt || Date.parse(document.publishedAt) > now.getTime()) {
      throw new Error(`Document ${document.canonicalUrl} has a future publication time.`);
    }
    if (Date.parse(document.retrievedAt) < Date.parse(document.publishedAt)) {
      throw new Error(`Document ${document.canonicalUrl} was retrieved before publication.`);
    }
  }
  const existingBatch = db.prepare("SELECT content_hash FROM ingestion_batches WHERE batch_id = ?").get(batch.batchId) as { content_hash: string } | undefined;
  const batchHash = contentHash(batch);
  if (existingBatch && existingBatch.content_hash !== batchHash) throw new Error(`Evidence batch ${batch.batchId} was replayed with different content.`);
  if (existingBatch) return { batch, inserted: false };

  const transaction = db.transaction(() => {
    db.prepare("INSERT INTO ingestion_batches(batch_id, worklist_id, gameweek, authored_at, content_hash) VALUES(?, ?, ?, ?, ?)")
      .run(batch.batchId, batch.worklistId, batch.gameweek, batch.authorship.authoredAt, batchHash);
    db.prepare("INSERT OR IGNORE INTO ingestion_runs(run_id, gameweek, mode, observed_at) VALUES(?, ?, 'agent', ?)")
      .run(batch.batchId, batch.gameweek, batch.authorship.authoredAt);
    const priorDocument = db.prepare("SELECT document_id FROM source_documents WHERE canonical_url = ? ORDER BY retrieved_at DESC, rowid DESC LIMIT 1");
    const insertDocument = db.prepare(`INSERT OR IGNORE INTO source_documents(
      document_id, canonical_url, publisher, title, published_at, retrieved_at, content_hash, excerpt, raw_capture_path, supersedes_id
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const documentByHash = new Map<string, string>();
    for (const document of batch.documents) {
      const documentId = stableId("document", { canonicalUrl: document.canonicalUrl, contentHash: document.contentHash });
      const prior = priorDocument.get(document.canonicalUrl) as { document_id: string } | undefined;
      insertDocument.run(documentId, document.canonicalUrl, document.publisher, document.title, document.publishedAt,
        document.retrievedAt, document.contentHash, document.excerpt, document.rawCapturePath ?? null,
        prior?.document_id === documentId ? null : prior?.document_id ?? null);
      documentByHash.set(document.contentHash, documentId);
    }
    const existingDocument = db.prepare("SELECT document_id FROM source_documents WHERE content_hash = ? ORDER BY rowid DESC LIMIT 1");
    const insertObservation = db.prepare(`INSERT OR IGNORE INTO news_observations(
      observation_id, document_id, player_id, category, observed_at, credibility_score, credibility_rationale,
      relevance_score, relevance_rationale, adapter_version, note
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const linkObservation = db.prepare("INSERT OR IGNORE INTO ingestion_batch_links(batch_id, observation_id) VALUES(?, ?)");
    const resultCounts = new Map<number, number>();
    for (const observation of batch.observations) {
      const documentId = documentByHash.get(observation.documentContentHash)
        ?? (existingDocument.get(observation.documentContentHash) as { document_id: string } | undefined)?.document_id;
      if (!documentId) throw new Error(`Evidence observation references missing document ${observation.documentContentHash}.`);
      const observationId = stableId("news", { documentId, playerId: observation.playerId, category: observation.category, note: observation.note });
      const parsed: NewsObservation = NewsObservationSchema.parse({
        observationId,
        documentId,
        playerId: observation.playerId,
        category: observation.category,
        observedAt: batch.authorship.authoredAt,
        credibility: observation.credibility,
        relevance: observation.relevance,
        adapterVersion: observation.adapterVersion,
        note: observation.note
      });
      insertObservation.run(parsed.observationId, parsed.documentId, parsed.playerId, parsed.category, parsed.observedAt,
        parsed.credibility.score, parsed.credibility.rationale, parsed.relevance.score, parsed.relevance.rationale,
        parsed.adapterVersion, parsed.note);
      linkObservation.run(batch.batchId, parsed.observationId);
      resultCounts.set(parsed.playerId, (resultCounts.get(parsed.playerId) ?? 0) + 1);
    }
    const insertCoverage = db.prepare(`INSERT OR IGNORE INTO discovery_coverage(
      coverage_id, worklist_id, player_id, status, searched_at, queries_json, result_count, note
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const coverage of batch.coverage) {
      const results = resultCounts.get(coverage.playerId) ?? 0;
      if (coverage.status === "searched_with_results" && results === 0) throw new Error(`Player ${coverage.playerId} is marked with results but has no observations.`);
      if (coverage.status === "searched_zero_results" && results !== 0) throw new Error(`Player ${coverage.playerId} is marked zero results but has observations.`);
      if (coverage.status === "blocked" && results !== 0) throw new Error(`Player ${coverage.playerId} is marked blocked but has observations.`);
      const coverageId = stableId("coverage", { batchId: batch.batchId, ...coverage });
      insertCoverage.run(coverageId, batch.worklistId, coverage.playerId, coverage.status, coverage.searchedAt,
        stableJson(coverage.queries), results, coverage.note);
    }
  });
  transaction.immediate();
  return { batch, inserted: true };
}

function snapshotFromRow(row: Record<string, unknown> | undefined): PlayerEvidenceSnapshot | null {
  if (!row) return null;
  return PlayerEvidenceSnapshotSchema.parse({
    snapshotId: row.snapshot_id,
    playerId: row.player_id,
    observedAt: row.observed_at,
    contentHash: row.content_hash,
    name: row.name,
    webName: row.web_name,
    teamId: row.team_id,
    teamName: row.team_name,
    position: row.position,
    price: row.price,
    status: row.status,
    selectedByPercent: row.selected_by_percent,
    minutes: row.minutes,
    totalPoints: row.total_points,
    officialFields: JSON.parse(String(row.raw_json))
  });
}

export function buildPlayerDossier(db: Database.Database, input: { playerId: number; generatedAt: string; asOf?: string }): PlayerDossier {
  const asOf = input.asOf ?? input.generatedAt;
  const snapshots = db.prepare(`SELECT s.*, MAX(i.observed_at) AS linked_at, MAX(i.gameweek) AS latest_gameweek FROM run_player_snapshots r
    JOIN ingestion_runs i ON i.run_id = r.run_id JOIN player_snapshots s ON s.snapshot_id = r.snapshot_id
    WHERE r.player_id = ? AND i.observed_at <= ? GROUP BY s.snapshot_id ORDER BY linked_at DESC, s.observed_at DESC LIMIT 2`)
    .all(input.playerId, asOf) as Array<Record<string, unknown>>;
  const snapshot = snapshotFromRow(snapshots[0]);
  if (!snapshot) throw new Error(`No official snapshot found for player ${input.playerId} at ${asOf}.`);
  const previousSnapshot = snapshotFromRow(snapshots[1]);
  const performance = (db.prepare(`SELECT p.* FROM player_performance_observations p
    WHERE p.player_id = ? AND p.observed_at <= ? ORDER BY COALESCE(p.gameweek, 999), p.fixture_id, p.observed_at`)
    .all(input.playerId, asOf) as Array<Record<string, unknown>>).map((row) => PlayerPerformanceObservationSchema.parse({
      performanceId: row.performance_id, playerId: row.player_id, fixtureId: row.fixture_id, gameweek: row.gameweek,
      observedAt: row.observed_at, contentHash: row.content_hash, supersedesId: row.supersedes_id,
      stats: JSON.parse(String(row.raw_json))
    }));
  const news = (db.prepare(`SELECT n.* FROM news_observations n WHERE n.player_id = ? AND n.observed_at <= ? ORDER BY n.observed_at DESC, n.observation_id`)
    .all(input.playerId, asOf) as Array<Record<string, unknown>>).map((row) => NewsObservationSchema.parse({
      observationId: row.observation_id, documentId: row.document_id, playerId: row.player_id, category: row.category,
      observedAt: row.observed_at, credibility: { score: row.credibility_score, rationale: row.credibility_rationale },
      relevance: { score: row.relevance_score, rationale: row.relevance_rationale }, adapterVersion: row.adapter_version, note: row.note
    }));
  const documents = (db.prepare(`SELECT DISTINCT d.* FROM source_documents d JOIN news_observations n ON n.document_id = d.document_id
    WHERE n.player_id = ? AND n.observed_at <= ? ORDER BY d.published_at DESC, d.document_id`).all(input.playerId, asOf) as Array<Record<string, unknown>>)
    .map((row) => SourceDocumentSchema.parse({
      documentId: row.document_id,
      canonicalUrl: row.canonical_url,
      publisher: row.publisher,
      title: row.title,
      publishedAt: row.published_at,
      retrievedAt: row.retrieved_at,
      contentHash: row.content_hash,
      excerpt: row.excerpt,
      rawCapturePath: row.raw_capture_path,
      supersedesId: row.supersedes_id
    }));
  const roleObservationIds = (db.prepare("SELECT observation_id FROM role_observations WHERE player_id = ? AND observed_at <= ? ORDER BY observed_at DESC, observation_id")
    .all(input.playerId, asOf) as Array<{ observation_id: string }>).map((row) => row.observation_id);
  const coverageRow = db.prepare(`SELECT c.* FROM discovery_coverage c WHERE c.player_id = ?
    AND c.worklist_id = (SELECT worklist_id FROM evidence_worklists WHERE gameweek = ? AND generated_at <= ? ORDER BY generated_at DESC, rowid DESC LIMIT 1)
    AND COALESCE(c.searched_at, '') <= ?
    ORDER BY CASE c.status WHEN 'pending' THEN 0 ELSE 1 END DESC, COALESCE(c.searched_at, '') DESC, c.rowid DESC LIMIT 1`)
    .get(input.playerId, Number(snapshots[0].latest_gameweek), asOf, asOf) as Record<string, unknown> | undefined;
  const coverage: DiscoveryCoverage | null = coverageRow ? DiscoveryCoverageSchema.parse({
    coverageId: coverageRow.coverage_id, worklistId: coverageRow.worklist_id, playerId: coverageRow.player_id,
    status: coverageRow.status, searchedAt: coverageRow.searched_at, queries: JSON.parse(String(coverageRow.queries_json)),
    resultCount: coverageRow.result_count, note: coverageRow.note
  }) : null;
  const historyRow = db.prepare(`SELECT c.status FROM player_summary_coverage c JOIN ingestion_runs i ON i.run_id = c.run_id
    WHERE c.player_id = ? AND i.observed_at <= ? ORDER BY i.observed_at DESC, c.rowid DESC LIMIT 1`)
    .get(input.playerId, asOf) as { status: "available" | "missing" | "failed" | "stale" } | undefined;
  const changes: string[] = [];
  if (previousSnapshot) {
    if (snapshot.price !== previousSnapshot.price) changes.push(`Price changed from ${previousSnapshot.price.toFixed(1)} to ${snapshot.price.toFixed(1)}.`);
    if (snapshot.teamId !== previousSnapshot.teamId) changes.push(`Club changed from ${previousSnapshot.teamName} to ${snapshot.teamName}.`);
    if (snapshot.status !== previousSnapshot.status) changes.push(`Availability changed from ${previousSnapshot.status} to ${snapshot.status}.`);
  }
  const publisherSignals = new Map<string, Set<string>>();
  for (const item of news) {
    const signals = publisherSignals.get(item.category) ?? new Set<string>();
    signals.add(item.note.toLowerCase().includes("not ") || item.note.toLowerCase().includes("doubt") ? "negative" : "positive");
    publisherSignals.set(item.category, signals);
  }
  const disagreements = [...publisherSignals].filter(([, signals]) => signals.size > 1).map(([category]) => `News observations disagree for ${category}.`);
  const historyCoverage = historyRow?.status ?? "missing";
  const gaps = [
    ...(historyCoverage === "available" ? [] : [`Player history coverage is ${historyCoverage}.`]),
    ...(!coverage || coverage.status === "pending" ? ["Current public-web research is pending."] : []),
    ...(news.length === 0 ? ["No stored public-news observations."] : []),
    ...(roleObservationIds.length === 0 ? ["No stored current-role observations."] : [])
  ];
  const dossierCore = { playerId: input.playerId, snapshotId: snapshot.snapshotId, previousSnapshotId: previousSnapshot?.snapshotId ?? null,
    performanceIds: performance.map((item) => item.performanceId), newsIds: news.map((item) => item.observationId), roleObservationIds,
    coverageId: coverage?.coverageId ?? null, asOf };
  return PlayerDossierSchema.parse({
    schemaVersion: 1,
    dossierId: stableId("dossier", dossierCore),
    playerId: input.playerId,
    generatedAt: input.generatedAt,
    asOf,
    snapshot,
    previousSnapshot,
    performance,
    documents,
    news,
    roleObservationIds,
    coverage,
    historyCoverage,
    changes,
    disagreements,
    gaps
  });
}

export function playerIdsForRun(db: Database.Database, runId: string) {
  return (db.prepare("SELECT player_id FROM run_player_snapshots WHERE run_id = ? ORDER BY player_id").all(runId) as Array<{ player_id: number }>)
    .map((row) => row.player_id);
}

export function resolveStoredPlayer(db: Database.Database, selector: string) {
  const id = Number(selector);
  if (Number.isInteger(id) && id > 0) {
    const row = db.prepare("SELECT player_id FROM players WHERE player_id = ?").get(id) as { player_id: number } | undefined;
    if (!row) throw new Error(`Unknown stored player ${selector}.`);
    return row.player_id;
  }
  const matches = db.prepare(`SELECT DISTINCT p.player_id FROM players p
    JOIN player_aliases a ON a.player_id = p.player_id WHERE LOWER(a.alias) = LOWER(?) ORDER BY p.player_id`)
    .all(selector) as Array<{ player_id: number }>;
  if (matches.length === 0) throw new Error(`Unknown stored player ${selector}.`);
  if (matches.length > 1) throw new Error(`Stored player selector ${selector} is ambiguous: ${matches.map((row) => row.player_id).join(", ")}.`);
  return matches[0].player_id;
}

export function playerStoreStatus(db: Database.Database) {
  const count = (table: string) => Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
  const latest = db.prepare(`SELECT run_id, gameweek, mode, observed_at FROM ingestion_runs
    WHERE mode IN ('live', 'offline') ORDER BY observed_at DESC, rowid DESC LIMIT 1`).get() as {
      run_id: string; gameweek: number; mode: string; observed_at: string;
    } | undefined;
  return {
    schemaVersion: Number((db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version: number }).version),
    latestRun: latest ? { runId: latest.run_id, gameweek: latest.gameweek, mode: latest.mode, observedAt: latest.observed_at } : null,
    counts: {
      runs: count("ingestion_runs"),
      players: count("players"),
      snapshots: count("player_snapshots"),
      performance: count("player_performance_observations"),
      fixtures: count("player_fixture_observations"),
      documents: count("source_documents"),
      news: count("news_observations"),
      coverage: count("discovery_coverage")
    }
  };
}

export function buildStoreManifest(db: Database.Database, input: { runId: string; gameweek: number; generatedAt: string; mode: "live" | "offline" }): EvidenceStoreManifest {
  const count = (table: string) => Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
  const history = db.prepare("SELECT player_id, status, error FROM player_summary_coverage WHERE run_id = ? ORDER BY player_id").all(input.runId) as Array<{ player_id: number; status: string; error: string | null }>;
  const coverageComplete = Number((db.prepare("SELECT COUNT(DISTINCT player_id) AS count FROM discovery_coverage WHERE status != 'pending'").get() as { count: number }).count);
  const logical = {
    runs: count("ingestion_runs"), players: count("players"), snapshots: count("player_snapshots"),
    performance: count("player_performance_observations"), fixtures: count("player_fixture_observations"), documents: count("source_documents"), news: count("news_observations"),
    coverage: count("discovery_coverage"), latestRun: input.runId
  };
  return EvidenceStoreManifestSchema.parse({
    schemaVersion: 1,
    storeSchemaVersion: PLAYER_STORE_SCHEMA_VERSION,
    runId: input.runId,
    gameweek: input.gameweek,
    generatedAt: input.generatedAt,
    mode: input.mode,
    logicalHash: contentHash(logical),
    counts: {
      players: count("players"), snapshots: count("player_snapshots"), performance: count("player_performance_observations"),
      fixtures: count("player_fixture_observations"),
      documents: count("source_documents"), news: count("news_observations"), coverageComplete,
      historyAvailable: history.filter((item) => item.status === "available").length,
      historyGaps: history.filter((item) => item.status !== "available").length
    },
    historyFailures: history.filter((item) => item.status !== "available")
      .map((item) => ({ playerId: item.player_id, status: item.status, error: item.error }))
  });
}

export function recordArtifactLineage(db: Database.Database, input: {
  runId: string;
  createdAt: string;
  artifacts: Array<{ kind: string; path: string; contentHash: string }>;
}) {
  const insert = db.prepare(`INSERT OR IGNORE INTO artifact_lineage(
    lineage_id, run_id, artifact_kind, artifact_path, content_hash, created_at
  ) VALUES(?, ?, ?, ?, ?, ?)`);
  const transaction = db.transaction(() => {
    for (const artifact of input.artifacts) {
      insert.run(stableId("lineage", { runId: input.runId, ...artifact }), input.runId,
        artifact.kind, artifact.path, artifact.contentHash, input.createdAt);
    }
  });
  transaction.immediate();
}

export function recordTriggerEvaluations(db: Database.Database, runId: string, evaluations: TriggerEvaluation[]) {
  const insert = db.prepare(`INSERT OR IGNORE INTO trigger_evaluations(
    evaluation_id, trigger_id, run_id, evaluated_at, state, current_value_json, reason, raw_json
  ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`);
  const transaction = db.transaction(() => {
    for (const item of evaluations) {
      const parsed = TriggerEvaluationSchema.parse(item);
      insert.run(parsed.evaluationId, parsed.triggerId, runId, parsed.evaluatedAt, parsed.state,
        parsed.currentValue === null ? null : stableJson(parsed.currentValue), parsed.reason, stableJson(parsed));
    }
  });
  transaction.immediate();
}

export function previousTriggerEvaluation(db: Database.Database, triggerId: string, before: string) {
  const row = db.prepare(`SELECT raw_json FROM trigger_evaluations WHERE trigger_id = ? AND evaluated_at < ?
    ORDER BY evaluated_at DESC, rowid DESC LIMIT 1`).get(triggerId, before) as { raw_json: string } | undefined;
  return row ? TriggerEvaluationSchema.parse(JSON.parse(row.raw_json)) : null;
}
