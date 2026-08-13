import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildPlayerDossier, openPlayerStore, playerStoreStatus, renderPlayerDossierMarkdown, resolveStoredPlayer } from "../packages/player-store/src";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

export async function generatePlayerDossier(input: {
  player: string;
  gameweek: number;
  at?: string;
  storePath?: string;
  recommendationsDir?: string;
}) {
  const storePath = input.storePath ?? path.join("data", "player-intelligence", "player-intelligence.sqlite");
  const db = openPlayerStore(storePath, { readonly: true });
  try {
    const playerId = resolveStoredPlayer(db, input.player);
    const generatedAt = new Date().toISOString();
    const latest = playerStoreStatus(db).latestRun;
    if (!latest || latest.gameweek !== input.gameweek) throw new Error(`The latest official store refresh is not GW${input.gameweek}.`);
    const dossier = buildPlayerDossier(db, { playerId, generatedAt, asOf: input.at });
    const outputDir = path.join(input.recommendationsDir ?? path.join("packages", "content", "recommendations"), `gw-${input.gameweek}`, "player-dossiers");
    await mkdir(outputDir, { recursive: true });
    const jsonPath = path.join(outputDir, `${playerId}.json`);
    const markdownPath = path.join(outputDir, `${playerId}.md`);
    await Promise.all([
      writeFile(jsonPath, `${JSON.stringify(dossier, null, 2)}\n`, "utf8"),
      writeFile(markdownPath, renderPlayerDossierMarkdown(dossier), "utf8")
    ]);
    return { dossier, jsonPath, markdownPath };
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const player = argValue("--player");
  const gameweek = Number(argValue("--gw"));
  const at = argValue("--at") ?? undefined;
  if (!player || !Number.isInteger(gameweek) || gameweek < 1 || (at && !Number.isFinite(Date.parse(at)))) {
    console.error("Usage: pnpm player:dossier -- --player <id|name> --gw <n> [--at <timestamp>]");
    process.exitCode = 1;
  } else {
    generatePlayerDossier({ player, gameweek, at }).then(({ dossier, jsonPath, markdownPath }) => {
      console.log(`Dossier ${dossier.dossierId}`);
      console.log(jsonPath);
      console.log(markdownPath);
    }).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  }
}
