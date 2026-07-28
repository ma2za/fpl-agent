import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PREMIER_LEAGUE_2026_27_FIXTURES_URL,
  parsePremierLeagueFixturesArticle,
  renderPremierLeagueFixturesMarkdown
} from "../packages/agent/src";

function argValue(name: string) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

async function writeJson(filePath: string, data: unknown) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  const season = argValue("--season") ?? "2026-27";
  const sourceUrl = argValue("--url") ?? PREMIER_LEAGUE_2026_27_FIXTURES_URL;
  const gameweek = Number(argValue("--gw") ?? "1");
  const horizon = Number(argValue("--horizon") ?? "6");
  const response = await fetch(sourceUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch Premier League fixtures: ${response.status} ${response.statusText}`);
  }

  const articleText = await response.text();
  const source = parsePremierLeagueFixturesArticle({
    articleText,
    season,
    sourceUrl,
    generatedAt: new Date().toISOString()
  });
  const outputDir = path.join("packages", "content", "recommendations", `gw-${gameweek}`);

  await mkdir(path.join("data", "raw"), { recursive: true });
  await mkdir(outputDir, { recursive: true });
  await writeJson(path.join("data", "raw", `premier-league-${season}-fixtures.json`), source);
  await writeFile(
    path.join(outputDir, "premier-league-fixtures.md"),
    renderPremierLeagueFixturesMarkdown(source, gameweek, horizon),
    "utf8"
  );

  for (const warning of source.warnings) {
    console.warn(warning);
  }

  console.log(`Fetched ${source.fixtures.length} Premier League fixtures`);
  console.log(`Wrote Premier League fixture evidence to ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
