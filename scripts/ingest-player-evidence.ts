import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ingestEvidenceBatch, updatePlayerStoreTransactionally } from "../packages/player-store/src";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

export async function ingestPlayerEvidence(input: {
  gameweek: number;
  inputPath: string;
  storePath?: string;
  now?: Date;
}) {
  const value = JSON.parse(await readFile(input.inputPath, "utf8"));
  if ((value as { gameweek?: unknown }).gameweek !== input.gameweek) {
    throw new Error(`Evidence input does not declare GW${input.gameweek}.`);
  }
  const storePath = input.storePath ?? path.join("data", "player-intelligence", "player-intelligence.sqlite");
  return updatePlayerStoreTransactionally(storePath, {
    appliedAt: (input.now ?? new Date()).toISOString(),
    update: (db) => ingestEvidenceBatch(db, value, input.now)
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gameweek = Number(argValue("--gw"));
  const inputPath = argValue("--input");
  if (!Number.isInteger(gameweek) || gameweek < 1 || !inputPath) {
    console.error("Usage: pnpm evidence:ingest -- --gw <n> --input <path>");
    process.exitCode = 1;
  } else {
    ingestPlayerEvidence({ gameweek, inputPath }).then((result) => {
      console.log(result.inserted ? `Ingested evidence batch ${result.batch.batchId}.` : `Evidence batch ${result.batch.batchId} was already present.`);
    }).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  }
}
