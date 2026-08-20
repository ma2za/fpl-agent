import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ingestEvidenceBatch,
  latestNewsDiscovery,
  stableId,
  updatePlayerStoreTransactionally
} from "../packages/player-store/src";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

export async function storeDiscoveryCoverage(input: {
  gameweek: number;
  storePath?: string;
  reviewedZeroPlayerIds?: number[];
  authoredAt?: string;
}) {
  const storePath = input.storePath ?? path.join("data", "player-intelligence", "player-intelligence.sqlite");
  const authoredAt = input.authoredAt ?? new Date().toISOString();
  return updatePlayerStoreTransactionally(storePath, {
    appliedAt: authoredAt,
    update: (db) => {
      const discovery = latestNewsDiscovery(db, input.gameweek);
      if (!discovery) throw new Error(`No stored news discovery exists for GW${input.gameweek}.`);
      const reviewedZeroPlayerIds = new Set(input.reviewedZeroPlayerIds ?? []);
      const unknown = [...reviewedZeroPlayerIds].filter((playerId) => !discovery.players.some((player) => player.playerId === playerId));
      if (unknown.length > 0) throw new Error(`Reviewed player IDs are absent from stored discovery: ${unknown.join(", ")}.`);
      const reviewed = discovery.players.filter((player) => player.candidateUrls.length === 0 || reviewedZeroPlayerIds.has(player.playerId));
      const coverage = reviewed.map((player) => {
        const completed = player.searches.some((search) => search.status === "completed");
        return {
          playerId: player.playerId,
          status: completed ? "searched_zero_results" as const : "blocked" as const,
          searchedAt: discovery.generatedAt,
          queries: player.searches.map((search) => search.query),
          searches: player.searches,
          note: player.candidateUrls.length === 0
            ? "No player-alias candidate was found. Blocked providers remain explicit in the stored receipts."
            : `${player.candidateUrls.length} candidates were reviewed and none contained a material current update.`
        };
      });
      const batch = {
        schemaVersion: 1 as const,
        batchId: stableId("batch", { discoveryId: discovery.discoveryId, authoredAt, coverage }),
        worklistId: discovery.worklistId,
        gameweek: input.gameweek,
        authorship: { kind: "coding_agent" as const, agent: "Codex player-news discovery", authoredAt },
        coverage,
        documents: [],
        observations: []
      };
      const result = ingestEvidenceBatch(db, batch, new Date(authoredAt));
      return { ...result, pendingCandidatePlayers: discovery.players.length - reviewed.length };
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gameweek = Number(argValue("--gw"));
  const reviewedZeroPlayerIds = process.argv.flatMap((arg, index) => arg === "--reviewed-zero-player" && process.argv[index + 1]
    ? [Number(process.argv[index + 1])]
    : []).filter((playerId) => Number.isInteger(playerId) && playerId > 0);
  if (!Number.isInteger(gameweek) || gameweek < 1) {
    console.error("Usage: pnpm evidence:review-zero -- --gw <n> [--reviewed-zero-player <id>]");
    process.exitCode = 1;
  } else {
    storeDiscoveryCoverage({ gameweek, reviewedZeroPlayerIds }).then((result) => {
      console.log(`Stored ${result.batch.coverage.length} reviewed coverage records; ${result.pendingCandidatePlayers} players await candidate review.`);
    }).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  }
}
