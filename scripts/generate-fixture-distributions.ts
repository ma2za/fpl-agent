import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildFixtureDistributions } from "../packages/engine/src";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main() {
  const gameweek = Number(argValue("--gw"));
  const outputPath = argValue("--out");
  if (!Number.isInteger(gameweek) || gameweek <= 0 || !outputPath) {
    throw new Error("Usage: pnpm fixture:distributions -- --gw <number> --out <file.json>");
  }
  const [bootstrap, fixtures] = await Promise.all([
    readFile(path.join("data", "raw", "bootstrap-static.json"), "utf8").then(JSON.parse),
    readFile(path.join("data", "raw", "fixtures.json"), "utf8").then(JSON.parse)
  ]);
  const distributions = buildFixtureDistributions({ gameweek, teams: bootstrap.teams, fixtures });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(distributions, null, 2)}\n`, "utf8");
  console.log(`Wrote ${distributions.length} evidenced fixture distributions to ${outputPath}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
