import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildFixtureTicker, renderFixtureTickerMarkdown } from "../packages/agent/src";
import type { Fixture, Team } from "../packages/fpl-api/src";

type BootstrapStatic = {
  teams: Team[];
};

function argValue(name: string) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

async function readJson<T>(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, data: unknown) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  const gameweek = Number(argValue("--gw") ?? "1");
  const horizon = Number(argValue("--horizon") ?? "6");
  const bootstrap = await readJson<BootstrapStatic>(path.join("data", "raw", "bootstrap-static.json"));
  const fixtures = await readJson<Fixture[]>(path.join("data", "raw", "fixtures.json"));
  const ticker = buildFixtureTicker({
    gameweek,
    horizon,
    generatedAt: new Date().toISOString(),
    teams: bootstrap.teams,
    fixtures
  });
  const outputDir = path.join("packages", "content", "recommendations", `gw-${gameweek}`);

  await mkdir(outputDir, { recursive: true });
  await writeJson(path.join(outputDir, "fixture-ticker.json"), ticker);
  await writeFile(path.join(outputDir, "fixture-ticker.md"), renderFixtureTickerMarkdown(ticker), "utf8");

  console.log(`Wrote fixture ticker to ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
