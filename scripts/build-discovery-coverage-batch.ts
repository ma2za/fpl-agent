import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { stableId } from "../packages/player-store/src";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

export async function buildDiscoveryCoverageBatch(input: {
  gameweek: number;
  discoveryPath?: string;
  outputPath?: string;
  reviewedZeroPlayerIds?: number[];
}) {
  const discoveryPath = input.discoveryPath ?? path.join("data", "player-intelligence", `gw-${input.gameweek}-player-news-discovery.json`);
  const discovery = JSON.parse(await readFile(discoveryPath, "utf8")) as {
    worklistId: string;
    gameweek: number;
    generatedAt: string;
    minimumAppearanceProbability: number;
    players: Array<{
      playerId: number;
      candidateUrls: string[];
      searches: Array<{
        query: string;
        provider: string;
        searchedAt: string;
        status: "completed" | "blocked";
        resultUrls: string[];
        relevantUrls: string[];
      }>;
    }>;
  };
  if (discovery.gameweek !== input.gameweek) throw new Error(`Discovery report is for GW${discovery.gameweek}, not GW${input.gameweek}.`);
  const reviewedZeroPlayerIds = new Set(input.reviewedZeroPlayerIds ?? []);
  const unknownReviewedPlayerIds = [...reviewedZeroPlayerIds].filter((playerId) => !discovery.players.some((player) => player.playerId === playerId));
  if (unknownReviewedPlayerIds.length > 0) throw new Error(`Reviewed player IDs are absent from the discovery report: ${unknownReviewedPlayerIds.join(", ")}.`);
  const zeroCandidates = discovery.players.filter((player) => player.candidateUrls.length === 0 || reviewedZeroPlayerIds.has(player.playerId));
  const coverage = zeroCandidates.map((player) => ({
    playerId: player.playerId,
    status: "searched_zero_results" as const,
    searchedAt: discovery.generatedAt,
    queries: player.searches.map((search) => search.query),
    searches: player.searches,
    note: player.candidateUrls.length === 0
      ? `No player-alias match was found in the bounded ${player.searches.filter((search) => search.status === "completed").length}-source article crawl. Blocked sources remain explicit in the receipts.`
      : `${player.candidateUrls.length} player-alias candidate URLs were reviewed and none contained a new relevant player update. Blocked sources remain explicit in the receipts.`
  }));
  const batchCore = { worklistId: discovery.worklistId, generatedAt: discovery.generatedAt, coverage };
  const batch = {
    schemaVersion: 1 as const,
    batchId: stableId("batch", batchCore),
    worklistId: discovery.worklistId,
    gameweek: input.gameweek,
    authorship: { kind: "coding_agent" as const, agent: "Codex player-news discovery", authoredAt: discovery.generatedAt },
    coverage,
    documents: [],
    observations: []
  };
  const outputPath = input.outputPath ?? path.join("data", "player-intelligence", `gw-${input.gameweek}-discovery-zero-results-batch.json`);
  await writeFile(outputPath, `${JSON.stringify(batch, null, 2)}\n`, "utf8");
  return { batch, outputPath, pendingCandidatePlayers: discovery.players.length - zeroCandidates.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gameweek = Number(argValue("--gw"));
  const discoveryPath = argValue("--input") ?? undefined;
  const outputPath = argValue("--output") ?? undefined;
  const reviewedZeroPlayerIds = process.argv.flatMap((arg, index) => arg === "--reviewed-zero-player" && process.argv[index + 1]
    ? [Number(process.argv[index + 1])]
    : []).filter((playerId) => Number.isInteger(playerId) && playerId > 0);
  if (!Number.isInteger(gameweek) || gameweek < 1) {
    console.error("Usage: pnpm evidence:discovery-batch -- --gw <n> [--input <path>] [--output <path>]");
    process.exitCode = 1;
  } else {
    buildDiscoveryCoverageBatch({ gameweek, discoveryPath, outputPath, reviewedZeroPlayerIds }).then(({ batch, outputPath: writtenPath, pendingCandidatePlayers }) => {
      console.log(`Wrote ${writtenPath}: ${batch.coverage.length} verified zero-result records; ${pendingCandidatePlayers} players await candidate review.`);
    }).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  }
}
