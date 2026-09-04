import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { GameweekOutcomeBatchSchema, ingestGameweekOutcomes, readGameweekArchive, updatePlayerStoreTransactionally } from "../packages/player-store/src";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

export async function ingestOutcomeFile(input: { gameweek: number; inputPath?: string; storePath?: string; observedAt?: string; effectiveAt?: string; finalized?: boolean }) {
  const storePath = input.storePath ?? path.join("data", "player-intelligence", "player-intelligence.sqlite");
  let value: unknown;
  if (input.inputPath) {
    value = JSON.parse(await readFile(input.inputPath, "utf8"));
  } else {
    const livePath = path.join("data", "raw", "live", `gw-${input.gameweek}.json`);
    const live = JSON.parse(await readFile(livePath, "utf8")) as {
      elements: Array<{ id: number; stats: Record<string, unknown>; explain?: Array<{ fixture: number; stats: Array<{ identifier: string; points: number; value: number }> }> }>;
    };
    const now = input.observedAt ?? (await stat(livePath)).mtime.toISOString();
    value = {
      schemaVersion: 1,
      gameweek: input.gameweek,
      observedAt: now,
      effectiveAt: input.effectiveAt ?? now,
      finalized: input.finalized ?? false,
      outcomes: live.elements.map((element) => {
        const explain = element.explain ?? [];
        let starts = Number(element.stats.starts ?? 0);
        return {
          playerId: element.id,
          status: explain.length > 0 ? "final" : "missing",
          fixtures: explain.map((fixture) => {
            const minutes = Number(fixture.stats.find((item) => item.identifier === "minutes")?.value ?? 0);
            const started = starts > 0;
            if (started) starts -= 1;
            return {
              fixtureId: fixture.fixture,
              status: "finished",
              points: fixture.stats.reduce((sum, item) => sum + Number(item.points), 0),
              minutes,
              started
            };
          })
        };
      })
    };
  }
  const batch = GameweekOutcomeBatchSchema.parse(value);
  if (batch.gameweek !== input.gameweek) throw new Error("Outcome input gameweek does not match --gw.");
  let excludedUnknownPlayerIds: number[] = [];
  let ingestedBatch = batch;
  const result = await updatePlayerStoreTransactionally(storePath, {
    appliedAt: batch.observedAt,
    update: (db) => {
      const archive = readGameweekArchive(db, input.gameweek);
      if (!archive) throw new Error(`GW${input.gameweek} must be frozen before outcomes are ingested.`);
      const frozenPlayerIds = new Set(archive.forecasts.map((forecast) => forecast.playerId));
      excludedUnknownPlayerIds = batch.outcomes.filter((outcome) => !frozenPlayerIds.has(outcome.playerId)).map((outcome) => outcome.playerId);
      ingestedBatch = GameweekOutcomeBatchSchema.parse({
        ...batch,
        outcomes: batch.outcomes.filter((outcome) => frozenPlayerIds.has(outcome.playerId))
      });
      return ingestGameweekOutcomes(db, ingestedBatch);
    }
  });
  return { batch: ingestedBatch, excludedUnknownPlayerIds, ...result };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gameweek = Number(argValue("--gw"));
  const inputPath = argValue("--input") ?? undefined;
  if (!Number.isInteger(gameweek) || gameweek < 1) {
    console.error("Usage: pnpm outcomes:ingest -- --gw <n> [--input <batch.json>] [--finalized]");
    process.exitCode = 1;
  } else {
    ingestOutcomeFile({ gameweek, inputPath, finalized: process.argv.includes("--finalized") }).then((result) => {
      console.log(`GW${gameweek} outcomes: ${result.revisions} revision(s), batch ${result.inserted ? "stored" : "already present"}.`);
      if (result.excludedUnknownPlayerIds.length > 0) console.log(`Excluded ${result.excludedUnknownPlayerIds.length} post-deadline player IDs absent from the frozen archive.`);
    }).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
  }
}
