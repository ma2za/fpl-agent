import { readFile } from "node:fs/promises";
import {
  DEFAULT_PLAYER_STORE_PATH,
  adoptModelChange,
  migratePlayerStore,
  openPlayerStore,
  proposeModelChange,
  recordModelReplay,
  registerModelVersion,
  reviewModelChange,
  rollbackModelVersion
} from "../packages/player-store/src";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main() {
  const action = argument("--action");
  const inputPath = argument("--input");
  if (!action || !inputPath) throw new Error("Usage: model:govern -- --action register|replay|propose|review|adopt|rollback --input file.json");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const db = openPlayerStore(argument("--store") ?? DEFAULT_PLAYER_STORE_PATH);
  try {
    migratePlayerStore(db);
    let result: unknown;
    if (action === "register") result = registerModelVersion(db, input.model, input.activate === true);
    else if (action === "replay") result = recordModelReplay(db, input);
    else if (action === "propose") result = proposeModelChange(db, input);
    else if (action === "review") result = reviewModelChange(db, input);
    else if (action === "adopt") result = adoptModelChange(db, input.proposalId, input.authorship);
    else if (action === "rollback") result = rollbackModelVersion(db, input);
    else throw new Error(`Unknown model-governance action: ${action}.`);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    db.close();
  }
}

main();
