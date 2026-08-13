import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { buildPlayerDossier, buildResearchWorklist, ingestOfficialRun, migratePlayerStore, openPlayerStore } from "../packages/player-store/src";

function measure<T>(operation: () => T) {
  const started = performance.now();
  const value = operation();
  return { value, durationMs: Number((performance.now() - started).toFixed(3)) };
}

export async function benchmarkPlayerStore(playerCount = 600) {
  const root = await mkdtemp(path.join(os.tmpdir(), "fpl-player-store-benchmark-"));
  const filePath = path.join(root, "player-intelligence.sqlite");
  const generatedAt = "2026-08-01T12:00:00.000Z";
  const players = Array.from({ length: playerCount }, (_, index) => {
    const playerId = index + 1;
    return {
      playerId,
      name: `Player ${playerId}`,
      webName: `P${playerId}`,
      teamId: index % 20 + 1,
      teamName: `Club ${index % 20 + 1}`,
      position: ["GKP", "DEF", "MID", "FWD"][index % 4],
      price: 4 + index % 100 / 10,
      status: "a",
      selectedByPercent: index % 50,
      minutes: index * 3,
      totalPoints: index % 200,
      aliases: [`Player ${playerId}`, `P${playerId}`],
      officialFields: { id: playerId, benchmark: true }
    };
  });
  const summaries = players.map((player) => ({
    playerId: player.playerId,
    status: "available" as const,
    retrievedAt: generatedAt,
    contentHash: "a".repeat(64),
    fixtures: [{ id: player.playerId, event: 2 }],
    history: [{ fixture: player.playerId, round: 1, minutes: 90, total_points: player.playerId % 15 }],
    error: null
  }));
  const input = {
    runId: "benchmark-run",
    gameweek: 1,
    mode: "offline" as const,
    observedAt: generatedAt,
    bootstrapHash: "b".repeat(64),
    fixturesHash: "c".repeat(64),
    players,
    summaries
  };
  try {
    const db = openPlayerStore(filePath);
    try {
      migratePlayerStore(db, generatedAt);
      const initial = measure(() => ingestOfficialRun(db, input));
      const idempotent = measure(() => ingestOfficialRun(db, input));
      const index = measure(() => {
        buildResearchWorklist(db, { runId: input.runId, gameweek: 1, generatedAt });
        return players.map((player) => buildPlayerDossier(db, { playerId: player.playerId, generatedAt }).dossierId);
      });
      const query = measure(() => buildPlayerDossier(db, { playerId: Math.ceil(playerCount / 2), generatedAt }));
      return {
        schemaVersion: 1,
        playerCount,
        initialIngestionMs: initial.durationMs,
        idempotentReingestionMs: idempotent.durationMs,
        dossierIndexMs: index.durationMs,
        individualDossierMs: query.durationMs,
        dossierCount: index.value.length,
        queriedDossierId: query.value.dossierId
      };
    } finally {
      db.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

benchmarkPlayerStore().then((result) => {
  console.log(JSON.stringify(result, null, 2));
}).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
