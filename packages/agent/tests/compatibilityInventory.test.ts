import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

describe("compatibility inventory", () => {
  it("retains every pre-0.0.2 command", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      dev: "corepack pnpm --filter @fpl-agent/web dev",
      build: "corepack pnpm --filter @fpl-agent/web build",
      test: "vitest run",
      "fetch:data": "tsx scripts/fetch-fpl-data.ts",
      "fetch:pl-fixtures": "tsx scripts/fetch-premier-league-fixtures.ts",
      evidence: "tsx scripts/generate-evidence.ts",
      odds: "tsx scripts/generate-odds.ts",
      "set-pieces": "tsx scripts/generate-set-pieces.ts",
      "team-news": "tsx scripts/generate-team-news.ts",
      fixtures: "tsx scripts/generate-fixture-ticker.ts",
      minutes: "tsx scripts/generate-minutes-risk.ts",
      "public-evidence": "tsx scripts/generate-public-evidence.ts",
      recommend: "tsx scripts/generate-recommendation.ts",
      "compare:squads": "tsx scripts/compare-squads.ts",
      verify: "tsx scripts/verify-recommendation.ts",
      postmortem: "node scripts/not-implemented.mjs postmortem",
    });
  });

  it.each([
    [
      "agent",
      [
        "evidence",
        "evidenceReport",
        "fixtureTicker",
        "markdown",
        "minutesRisk",
        "odds",
        "premierLeagueFixtures",
        "publicEvidence",
        "quality",
        "recommendationWriter",
        "riskReport",
        "setPieces",
        "squadComparison",
        "strategy",
        "teamNews",
        "types",
        "verification",
      ],
    ],
    [
      "engine",
      [
        "bench",
        "captaincy",
        "chips",
        "projections",
        "transferCandidates",
        "types",
      ],
    ],
    ["fpl-api", ["cache", "client", "endpoints", "normalize", "schemas", "types"]],
    ["rules", ["constants", "types", "validators"]],
  ])("retains the %s package entrypoint modules", (packageName, modules) => {
    const entrypoint = readFileSync(
      resolve(root, "packages", packageName, "src/index.ts"),
      "utf8",
    );

    for (const moduleName of modules) {
      expect(entrypoint).toContain(`export * from "./${moduleName}";`);
    }
  });
});
