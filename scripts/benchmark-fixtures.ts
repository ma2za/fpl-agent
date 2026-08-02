import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { buildFixtureHorizonReport, buildFixtureTicker } from "../packages/agent/src";

const teams = Array.from({ length: 20 }, (_, index) => ({
  id: index + 1,
  name: `Team ${index + 1}`,
  short_name: `T${index + 1}`,
  strength_overall_home: 1 + (index % 5),
  strength_overall_away: 1 + ((index + 1) % 5),
  strength_attack_home: 100 + index * 7,
  strength_attack_away: 90 + index * 6,
  strength_defence_home: 110 + index * 5,
  strength_defence_away: 95 + index * 4
}));

const fixtures = Array.from({ length: 38 }, (_, gameweek) =>
  Array.from({ length: 10 }, (_, match) => {
    const home = ((match + gameweek) % 20) + 1;
    const away = ((19 - match + gameweek) % 20) + 1;
    return {
      id: gameweek * 10 + match + 1,
      event: gameweek + 1,
      team_h: home,
      team_a: away === home ? (away % 20) + 1 : away,
      team_h_difficulty: 1 + (away % 5),
      team_a_difficulty: 1 + (home % 5),
      kickoff_time: new Date(Date.UTC(2026, 7, 15 + gameweek * 7, 12 + (match % 4))).toISOString(),
      finished: false
    };
  })
).flat();

function measure(iterations: number, operation: () => void) {
  operation();
  const startedAt = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) operation();
  return performance.now() - startedAt;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const iterations = 100;
  const tickerRounds = Array.from({ length: 5 }, () => measure(iterations, () => buildFixtureTicker({
    gameweek: 1,
    horizon: 6,
    generatedAt: "2026-08-01T00:00:00.000Z",
    teams,
    fixtures
  })));
  const horizonRounds = Array.from({ length: 5 }, () => measure(iterations, () => buildFixtureHorizonReport({
    gameweek: 1,
    generatedAt: "2026-08-01T00:00:00.000Z",
    teams,
    fixtures
  })));
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runtime: { node: process.version, platform: process.platform, architecture: process.arch },
    input: { teams: teams.length, fixtures: fixtures.length, iterations },
    mediansMs: {
      legacyTicker: median(tickerRounds),
      fixtureHorizon: median(horizonRounds)
    },
    roundsMs: { legacyTicker: tickerRounds, fixtureHorizon: horizonRounds }
  };
  const outputPath = path.join("data", "cache", "benchmarks", "fixture-horizon-baseline.json");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  console.log(`Wrote fixture horizon benchmark to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
