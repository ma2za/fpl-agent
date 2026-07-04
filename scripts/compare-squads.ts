import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  compareSquads,
  renderSquadComparisonMarkdown,
  type WeeklyRecommendation
} from "../packages/agent/src";

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
  const aPath = argValue("--a");
  const bPath = argValue("--b");

  if (!aPath || !bPath) {
    console.error("Usage: pnpm compare:squads -- --a <recommendation.json> --b <recommendation.json> [--out <dir>]");
    process.exitCode = 1;
    return;
  }

  const comparison = compareSquads({
    generatedAt: new Date().toISOString(),
    labelA: argValue("--label-a") ?? path.basename(path.dirname(aPath)),
    labelB: argValue("--label-b") ?? path.basename(path.dirname(bPath)),
    recommendationA: await readJson<WeeklyRecommendation>(aPath),
    recommendationB: await readJson<WeeklyRecommendation>(bPath)
  });
  const markdown = renderSquadComparisonMarkdown(comparison);
  const outputDir = argValue("--out");

  if (!outputDir) {
    console.log(markdown);
    return;
  }

  await mkdir(outputDir, { recursive: true });
  await writeJson(path.join(outputDir, "squad-comparison.json"), comparison);
  await writeFile(path.join(outputDir, "squad-comparison.md"), markdown, "utf8");
  console.log(`Wrote squad comparison to ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
