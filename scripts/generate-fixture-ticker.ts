import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildFixtureHorizonReport,
  buildFixtureTicker,
  renderFixtureHorizonMarkdown,
  renderFixtureTickerMarkdown
} from "../packages/agent/src";
import { BootstrapStaticSchema, FixtureSchema, normalizePlayers } from "../packages/fpl-api/src";
import { CURRENT_SQUAD } from "../config/squad";
import { loadFixtureExposures } from "./fixture-horizon-evidence";

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
  const bootstrap = BootstrapStaticSchema.parse(await readJson<unknown>(path.join("data", "raw", "bootstrap-static.json")));
  const fixtures = FixtureSchema.array().parse(await readJson<unknown>(path.join("data", "raw", "fixtures.json")));
  const ticker = buildFixtureTicker({
    gameweek,
    horizon,
    generatedAt: new Date().toISOString(),
    teams: bootstrap.teams,
    fixtures
  });
  const outputDir = path.join("packages", "content", "recommendations", `gw-${gameweek}`);
  const players = normalizePlayers(bootstrap);
  const exposures = await loadFixtureExposures({
    gameweek,
    gameweekDir: outputDir,
    configuredPlayerIds: CURRENT_SQUAD.players,
    players
  });
  const horizonReport = buildFixtureHorizonReport({
    gameweek,
    generatedAt: ticker.generatedAt,
    teams: bootstrap.teams,
    fixtures,
    exposures
  });

  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeJson(path.join(outputDir, "fixture-ticker.json"), ticker),
    writeFile(path.join(outputDir, "fixture-ticker.md"), renderFixtureTickerMarkdown(ticker), "utf8"),
    writeJson(path.join(outputDir, "fixture-horizon-report.json"), horizonReport),
    writeFile(path.join(outputDir, "fixture-horizon-report.md"), renderFixtureHorizonMarkdown(horizonReport), "utf8")
  ]);

  console.log(`Wrote fixture ticker and horizon report to ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
