import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildOfficialPlayerData,
  createFplApiClient,
  normalizePlayers,
  resolvePlayerSelectors,
  writeJsonCache
} from "../packages/fpl-api/src";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function argValues(name: string) {
  return process.argv.flatMap((arg, index) => arg === name && process.argv[index + 1]
    ? [process.argv[index + 1]]
    : []);
}

function usage() {
  return "Usage: pnpm fetch:players -- --player <id|name> [--player <id|name> ...] [--gw <n> | --all] [--concurrency <1-12>]";
}

async function recommendationPlayerIds(gameweek: number) {
  const recommendationPath = path.join(
    "packages", "content", "recommendations", `gw-${gameweek}`, "recommendation.json"
  );
  const value = JSON.parse(await readFile(recommendationPath, "utf8")) as {
    squadBefore?: { players?: Array<{ id?: unknown }> };
  };
  const ids = value.squadBefore?.players?.map((player) => player.id)
    .filter((id): id is number => typeof id === "number" && Number.isInteger(id)) ?? [];

  if (ids.length === 0) {
    throw new Error(`No authored squad player IDs found in ${recommendationPath}.`);
  }

  return ids;
}

async function parallelMap<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await work(item);
    }
  });
  await Promise.all(workers);
}

export async function fetchPlayerData(input: {
  selectors?: string[];
  gameweek?: number | null;
  all?: boolean;
  concurrency?: number;
  outputDir?: string;
  generatedAt?: string;
}) {
  const concurrency = input.concurrency ?? 6;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 12) throw new Error(usage());

  const client = createFplApiClient({ forceRefresh: true });
  const bootstrap = await client.getBootstrapStatic();
  const normalized = normalizePlayers(bootstrap);
  const selectors = [...(input.selectors ?? [])];

  if (input.gameweek !== null && input.gameweek !== undefined) {
    if (!Number.isInteger(input.gameweek) || input.gameweek < 1) throw new Error(usage());
    selectors.push(...(await recommendationPlayerIds(input.gameweek)).map(String));
  }

  const selected = input.all
    ? normalized
    : resolvePlayerSelectors(normalized, selectors);
  const uniquePlayers = [...new Map(selected.map((player) => [player.id, player])).values()];

  if (uniquePlayers.length === 0) throw new Error(usage());

  const rawById = new Map(bootstrap.elements.map((player) => [player.id, player]));
  const outputDir = input.outputDir ?? path.join("data", "processed", "player-data");
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const manifestPlayers: Array<{ id: number; name: string; path: string }> = [];

  await parallelMap(uniquePlayers, concurrency, async (player) => {
    const rawPlayer = rawById.get(player.id);
    if (!rawPlayer) throw new Error(`Official bootstrap record missing for player ${player.id}.`);

    const summary = await client.getPlayerSummary(player.id);
    const outputPath = path.join(outputDir, `${player.id}.json`);
    await writeJsonCache(outputPath, buildOfficialPlayerData({
      retrievedAt: generatedAt,
      rawPlayer,
      player,
      summary
    }));
    manifestPlayers.push({ id: player.id, name: player.webName, path: outputPath });
  });

  manifestPlayers.sort((a, b) => a.id - b.id);
  const manifest = {
    schemaVersion: 1,
    generatedAt,
    source: "Fantasy Premier League public API",
    playerCount: manifestPlayers.length,
    players: manifestPlayers
  };
  await writeJsonCache(path.join(outputDir, "index.json"), manifest);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gameweekArg = argValue("--gw");
  const concurrencyArg = argValue("--concurrency");

  fetchPlayerData({
    selectors: argValues("--player"),
    gameweek: gameweekArg === null ? null : Number(gameweekArg),
    all: process.argv.includes("--all"),
    concurrency: concurrencyArg === null ? 6 : Number(concurrencyArg)
  }).then((manifest) => {
    console.log(`Fetched official online data for ${manifest.playerCount} players.`);
    console.log("Wrote data/processed/player-data/index.json");
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
