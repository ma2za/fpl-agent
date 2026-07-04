import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  bootstrapCachePath,
  createFplApiClient,
  fixturesCachePath,
  liveGameweekCachePath,
  normalizePlayers,
  writeJsonCache
} from "../packages/fpl-api/src";

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const client = createFplApiClient({ forceRefresh: true });
  const bootstrap = await client.getBootstrapStatic();
  const fixtures = await client.getFixtures();
  const players = normalizePlayers(bootstrap);
  const snapshotDir = path.join("data", "raw", "snapshots", timestamp());
  const liveEvent = bootstrap.events.find((event) => event.is_current) ??
    bootstrap.events.find((event) => event.is_next);

  await mkdir(path.join("data", "processed"), { recursive: true });
  await writeJsonCache(path.join("data", "processed", "players.json"), players);
  await writeJsonCache(path.join(snapshotDir, "bootstrap-static.json"), bootstrap);
  await writeJsonCache(path.join(snapshotDir, "fixtures.json"), fixtures);

  if (liveEvent) {
    await client.getLiveGameweek(liveEvent.id);
  }

  console.log(`Fetched ${bootstrap.elements.length} players`);
  console.log(`Fetched ${fixtures.length} fixtures`);
  console.log(`Cached ${bootstrapCachePath()}`);
  console.log(`Cached ${fixturesCachePath()}`);

  if (liveEvent) {
    console.log(`Cached ${liveGameweekCachePath(liveEvent.id)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
