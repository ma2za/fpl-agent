import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CURRENT_SQUAD, FROZEN_AI_SQUAD, PLAYER_DECISION_INPUTS } from "../config/squad";
import { ProbabilisticProjectionArraySchema } from "../packages/agent/src";
import { buildNewsReviewQueue, migratePlayerStore, openPlayerStore } from "../packages/player-store/src";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function argNumbers(name: string) {
  return process.argv.flatMap((arg, index) => arg === name && process.argv[index + 1] ? [Number(process.argv[index + 1])] : []);
}

export async function generateNewsReviewQueue(input: {
  gameweek: number;
  selectedPlayerIds?: number[];
  namedAlternativePlayerIds?: number[];
  transferTargetPlayerIds?: number[];
  appearancePlayerIds?: number[];
  includeReviewed?: boolean;
  limit?: number;
  storePath?: string;
  outputPath?: string;
  generatedAt?: string;
}) {
  const storePath = input.storePath ?? path.join("data", "player-intelligence", "player-intelligence.sqlite");
  const outputPath = input.outputPath ?? path.join("packages", "content", "recommendations", `gw-${input.gameweek}`, "news-review-queue.json");
  let appearancePlayerIds = input.appearancePlayerIds;
  if (appearancePlayerIds === undefined) {
    try {
      const value = await readFile(path.join(path.dirname(outputPath), "probabilistic-projections.json"), "utf8");
      appearancePlayerIds = ProbabilisticProjectionArraySchema.parse(JSON.parse(value))
        .filter((projection) => projection.appearance.appearanceProbability >= 0.8)
        .map((projection) => projection.playerId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      appearancePlayerIds = [];
    }
  }
  const db = openPlayerStore(storePath);
  try {
    migratePlayerStore(db, input.generatedAt ?? new Date().toISOString());
    const queue = buildNewsReviewQueue(db, {
      gameweek: input.gameweek,
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      selectedPlayerIds: input.selectedPlayerIds ?? CURRENT_SQUAD.players,
      namedAlternativePlayerIds: input.namedAlternativePlayerIds ?? [
        ...FROZEN_AI_SQUAD.players,
        ...Object.values(PLAYER_DECISION_INPUTS).flatMap((decision) => [
          decision.alternativePlayerId,
          ...(decision.additionalAlternativePlayerIds ?? [])
        ])
      ],
      transferTargetPlayerIds: input.transferTargetPlayerIds,
      appearancePlayerIds,
      includeReviewed: input.includeReviewed,
      limit: input.limit
    });
    const markdownPath = outputPath.replace(/\.json$/i, ".md");
    const markdown = `# News Review Queue: GW${queue.gameweek}\n\n` +
      `Pending: ${queue.summary.pending}; deferred: ${queue.summary.deferred}; reviewed: ${queue.summary.reviewed}.\n\n` +
      queue.items.map((item) => `- [${item.playerName}] ${item.title} (${item.priorityReason}) - ${item.url}`).join("\n") + "\n";
    await mkdir(path.dirname(outputPath), { recursive: true });
    await Promise.all([
      writeFile(outputPath, `${JSON.stringify(queue, null, 2)}\n`, "utf8"),
      writeFile(markdownPath, markdown, "utf8")
    ]);
    return { queue, outputPath, markdownPath };
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gameweek = Number(argValue("--gw"));
  const limitValue = argValue("--limit");
  const limit = limitValue === null ? undefined : Number(limitValue);
  const selected = argNumbers("--selected");
  const alternatives = argNumbers("--alternative");
  const transfers = argNumbers("--transfer-target");
  const appearance = argNumbers("--appearance");
  if (!Number.isInteger(gameweek) || gameweek < 1 || (limit !== undefined && (!Number.isInteger(limit) || limit < 1))) {
    console.error("Usage: pnpm evidence:review-queue -- --gw <n> [--selected <id>] [--alternative <id>] [--transfer-target <id>] [--appearance <id>] [--limit <n>] [--include-reviewed]");
    process.exitCode = 1;
  } else {
    generateNewsReviewQueue({
      gameweek,
      selectedPlayerIds: selected.length ? selected : undefined,
      namedAlternativePlayerIds: alternatives.length ? alternatives : undefined,
      transferTargetPlayerIds: transfers,
      appearancePlayerIds: appearance,
      includeReviewed: process.argv.includes("--include-reviewed"),
      limit
    }).then(({ queue, outputPath }) => {
      console.log(`Review queue ${outputPath}: ${queue.items.length} shown, ${queue.summary.pending} pending, ${queue.summary.deferred} deferred.`);
    }).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  }
}
