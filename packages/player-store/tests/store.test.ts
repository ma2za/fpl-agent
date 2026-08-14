import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  PLAYER_STORE_SCHEMA_VERSION,
  buildPlayerDossier,
  buildResearchWorklist,
  contentHash,
  ingestEvidenceBatch,
  ingestOfficialRun,
  migratePlayerStore,
  openPlayerStore,
  playerStoreStatus,
  stableId,
  updatePlayerStoreTransactionally,
  validatePlayerStore
} from "../src";

const roots: string[] = [];
const firstAt = "2026-08-01T12:00:00.000Z";
const secondAt = "2026-08-02T12:00:00.000Z";

async function storePath() {
  const root = await mkdtemp(path.join(os.tmpdir(), "player-store-test-"));
  roots.push(root);
  return path.join(root, "player-intelligence.sqlite");
}

function officialInput(runId = "run-1", observedAt = firstAt, price = 7.5, points = 4) {
  return {
    runId,
    gameweek: 1,
    mode: "offline" as const,
    observedAt,
    bootstrapHash: contentHash({ runId, price }),
    fixturesHash: contentHash("fixtures"),
    players: [{
      playerId: 1,
      name: "Ada Player",
      webName: "Ada",
      teamId: 1,
      teamName: "Example FC",
      position: "MID",
      price,
      status: "a",
      selectedByPercent: 10,
      minutes: 90,
      totalPoints: points,
      aliases: ["Ada Player", "Ada", "A. Player"],
      officialFields: { id: 1, now_cost: price * 10 }
    }],
    summaries: [{
      playerId: 1,
      status: "available" as const,
      retrievedAt: observedAt,
      contentHash: contentHash({ points }),
      fixtures: [{ id: 20, event: 2 }],
      history: [{ fixture: 10, round: 1, minutes: 90, total_points: points }],
      error: null
    }]
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("player intelligence store", () => {
  it("creates the ordered schema with foreign keys and rejects newer databases", async () => {
    const filePath = await storePath();
    const db = openPlayerStore(filePath);
    expect(migratePlayerStore(db, firstAt)).toBe(PLAYER_STORE_SCHEMA_VERSION);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    db.close();
    validatePlayerStore(filePath);

    const newerPath = await storePath();
    const newer = new Database(newerPath);
    newer.exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
    newer.prepare("INSERT INTO schema_migrations VALUES(3, 'future', ?)").run(firstAt);
    expect(() => migratePlayerStore(newer, firstAt)).toThrow("newer than supported");
    newer.close();

    const legacyPath = await storePath();
    const legacy = new Database(legacyPath);
    legacy.exec(readFileSync(new URL("../migrations/001_initial.sql", import.meta.url), "utf8"));
    legacy.prepare("INSERT INTO schema_migrations VALUES(1, 'initial', ?)").run(firstAt);
    expect(migratePlayerStore(legacy, secondAt)).toBe(PLAYER_STORE_SCHEMA_VERSION);
    expect((legacy.prepare("PRAGMA table_info(discovery_coverage)").all() as Array<{ name: string }>).map((column) => column.name)).toContain("searches_json");
    expect(legacy.prepare("SELECT version, name FROM schema_migrations ORDER BY version").all()).toEqual([
      { version: 1, name: "initial" },
      { version: 2, name: "coverage-search-receipts" }
    ]);
    legacy.close();
  });

  it("deduplicates identical refreshes and appends superseding snapshot and performance revisions", async () => {
    const filePath = await storePath();
    const db = openPlayerStore(filePath);
    migratePlayerStore(db, firstAt);
    ingestOfficialRun(db, officialInput());
    ingestOfficialRun(db, officialInput());
    expect(playerStoreStatus(db).counts).toMatchObject({ runs: 1, players: 1, snapshots: 1, performance: 1 });

    ingestOfficialRun(db, officialInput("run-2", secondAt, 7.6, 7));
    expect(playerStoreStatus(db).counts).toMatchObject({ runs: 2, snapshots: 2, performance: 2 });
    const revisions = db.prepare("SELECT supersedes_id FROM player_performance_observations ORDER BY observed_at").all() as Array<{ supersedes_id: string | null }>;
    expect(revisions[0].supersedes_id).toBeNull();
    expect(revisions[1].supersedes_id).toMatch(/^performance:/);
    expect(() => ingestOfficialRun(db, officialInput("run-2", secondAt, 8, 9))).toThrow("different input");
    db.close();
  });

  it("builds an all-player aliased worklist and ingests partial evidence idempotently", async () => {
    const filePath = await storePath();
    const db = openPlayerStore(filePath);
    migratePlayerStore(db, firstAt);
    ingestOfficialRun(db, officialInput());
    const worklist = buildResearchWorklist(db, {
      runId: "run-1", gameweek: 1, generatedAt: firstAt, clubAliases: { 1: ["EFC"] }
    });
    expect(worklist.players[0]).toMatchObject({ aliases: ["A. Player", "Ada", "Ada Player"], clubAliases: ["EFC", "Example FC"], status: "pending" });
    const documentHash = contentHash("short captured source content");
    const batch = {
      schemaVersion: 1 as const,
      batchId: stableId("batch", "one"),
      worklistId: worklist.worklistId,
      gameweek: 1,
      authorship: { kind: "coding_agent" as const, agent: "test-agent", authoredAt: secondAt },
      coverage: [{ playerId: 1, status: "searched_with_results" as const, searchedAt: secondAt, queries: worklist.players[0].queries,
        searches: [{ query: worklist.players[0].queries[0], provider: "test-search", searchedAt: secondAt, status: "completed" as const,
          resultUrls: ["https://example.com/ada-update"], relevantUrls: ["https://example.com/ada-update"] }], note: "Search completed." }],
      documents: [{
        canonicalUrl: "https://example.com/ada-update",
        publisher: "Example News",
        title: "Ada update",
        publishedAt: firstAt,
        retrievedAt: secondAt,
        contentHash: documentHash,
        excerpt: "Ada trained with the first team."
      }],
      observations: [{
        playerId: 1,
        documentContentHash: documentHash,
        category: "lineup" as const,
        credibility: { score: 0.8, rationale: "Named reporter." },
        relevance: { score: 0.9, rationale: "Direct lineup evidence." },
        adapterVersion: "agent-web-v1",
        note: "Supports a start."
      }]
    };
    expect(ingestEvidenceBatch(db, batch, new Date(secondAt)).inserted).toBe(true);
    expect(ingestEvidenceBatch(db, batch, new Date(secondAt)).inserted).toBe(false);
    expect(playerStoreStatus(db).counts).toMatchObject({ documents: 1, news: 1 });
    db.close();
  });

  it("rolls back malformed and orphaned batches without changing the durable database", async () => {
    const filePath = await storePath();
    const db = openPlayerStore(filePath);
    migratePlayerStore(db, firstAt);
    ingestOfficialRun(db, officialInput());
    const worklist = buildResearchWorklist(db, { runId: "run-1", gameweek: 1, generatedAt: firstAt });
    db.close();
    const invalid = {
      schemaVersion: 1,
      batchId: stableId("batch", "invalid"),
      worklistId: worklist.worklistId,
      gameweek: 1,
      authorship: { kind: "coding_agent", agent: "test", authoredAt: secondAt },
      coverage: [{ playerId: 999, status: "searched_zero_results", searchedAt: secondAt, queries: ["query"],
        searches: [{ query: "query", provider: "test", searchedAt: secondAt, status: "completed", resultUrls: [], relevantUrls: [] }], note: "" }],
      documents: [], observations: []
    };
    await expect(updatePlayerStoreTransactionally(filePath, {
      appliedAt: secondAt,
      update: (staged) => ingestEvidenceBatch(staged, invalid, new Date(secondAt))
    })).rejects.toThrow("unknown player 999");
    const preserved = openPlayerStore(filePath, { readonly: true });
    expect(playerStoreStatus(preserved).counts).toMatchObject({ runs: 1, documents: 0, news: 0 });
    preserved.close();
  });

  it("rejects generic club searches as player-level zero-result coverage", async () => {
    const filePath = await storePath();
    const db = openPlayerStore(filePath);
    migratePlayerStore(db, firstAt);
    ingestOfficialRun(db, officialInput());
    const worklist = buildResearchWorklist(db, { runId: "run-1", gameweek: 1, generatedAt: firstAt });
    const genericQuery = "Example FC team news injuries";
    expect(() => ingestEvidenceBatch(db, {
      schemaVersion: 1,
      batchId: stableId("batch", "generic-search"),
      worklistId: worklist.worklistId,
      gameweek: 1,
      authorship: { kind: "coding_agent", agent: "test", authoredAt: secondAt },
      coverage: [{ playerId: 1, status: "searched_zero_results", searchedAt: secondAt, queries: [genericQuery],
        searches: [{ query: genericQuery, provider: "test-search", searchedAt: secondAt, status: "completed", resultUrls: [], relevantUrls: [] }], note: "" }],
      documents: [],
      observations: []
    }, new Date(secondAt))).toThrow("lacks a completed player-targeted search receipt");
    db.close();
  });

  it("returns deterministic dossiers with historical cutoffs and prior revisions", async () => {
    const filePath = await storePath();
    const db = openPlayerStore(filePath);
    migratePlayerStore(db, firstAt);
    ingestOfficialRun(db, officialInput());
    buildResearchWorklist(db, { runId: "run-1", gameweek: 1, generatedAt: firstAt });
    ingestOfficialRun(db, officialInput("run-2", secondAt, 7.6, 7));
    const first = buildPlayerDossier(db, { playerId: 1, generatedAt: secondAt, asOf: firstAt });
    const current = buildPlayerDossier(db, { playerId: 1, generatedAt: secondAt, asOf: secondAt });
    const replay = buildPlayerDossier(db, { playerId: 1, generatedAt: secondAt, asOf: secondAt });
    expect(first.snapshot?.price).toBe(7.5);
    expect(first.performance).toHaveLength(1);
    expect(current.snapshot?.price).toBe(7.6);
    expect(current.previousSnapshot?.price).toBe(7.5);
    expect(current.performance).toHaveLength(2);
    expect(replay.dossierId).toBe(current.dossierId);
    db.close();
  });
});
