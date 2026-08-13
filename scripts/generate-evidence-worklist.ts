import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { latestResearchWorklist, openPlayerStore, playerStoreStatus } from "../packages/player-store/src";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

export async function generateEvidenceWorklist(input: {
  gameweek: number | "auto";
  storePath?: string;
  recommendationsDir?: string;
}) {
  const storePath = input.storePath ?? path.join("data", "player-intelligence", "player-intelligence.sqlite");
  const db = openPlayerStore(storePath, { readonly: true });
  try {
    const latest = playerStoreStatus(db).latestRun;
    const gameweek = input.gameweek === "auto" ? latest?.gameweek : input.gameweek;
    if (!gameweek) throw new Error("The player store has no completed official refresh.");
    const worklist = latestResearchWorklist(db, gameweek);
    if (!worklist) throw new Error(`No evidence research worklist exists for GW${gameweek}; run pnpm refresh first.`);
    const outputPath = path.join(input.recommendationsDir ?? path.join("packages", "content", "recommendations"), `gw-${gameweek}`, "evidence-research-worklist.json");
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(worklist, null, 2)}\n`, "utf8");
    return { worklist, outputPath };
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const requested = argValue("--gw") ?? "auto";
  const gameweek = requested === "auto" ? "auto" : Number(requested);
  if (gameweek !== "auto" && (!Number.isInteger(gameweek) || gameweek < 1)) {
    console.error("Usage: pnpm evidence:worklist -- --gw <n|auto>");
    process.exitCode = 1;
  } else {
    generateEvidenceWorklist({ gameweek }).then(({ worklist, outputPath }) => {
      console.log(`Worklist ${worklist.worklistId}: ${outputPath}`);
      console.log(`${worklist.players.length} players pending research.`);
    }).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  }
}
