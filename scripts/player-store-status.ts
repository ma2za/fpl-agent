import path from "node:path";
import { pathToFileURL } from "node:url";
import { openPlayerStore, playerStoreStatus, validatePlayerStore } from "../packages/player-store/src";

export function readPlayerStoreStatus(filePath = path.join("data", "player-intelligence", "player-intelligence.sqlite")) {
  validatePlayerStore(filePath);
  const db = openPlayerStore(filePath, { readonly: true });
  try {
    return { path: filePath, ...playerStoreStatus(db) };
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(readPlayerStoreStatus(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
