import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadFixtureExposures } from "../../../scripts/fixture-horizon-evidence";
import { variantRecommendation } from "./fixtures/variantRecommendation";

const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fixture-horizon-evidence-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("loadFixtureExposures", () => {
  it("supports configured state when recommendations are missing", async () => {
    const gameweekDir = await temporaryDirectory();
    const exposures = await loadFixtureExposures({
      gameweek: 1,
      gameweekDir,
      configuredPlayerIds: [1],
      players: [{ id: 1, teamId: 1, position: "DEF" }]
    });

    expect(exposures).toEqual([{
      label: "Configured squad",
      kind: "configured",
      players: [{ playerId: 1, teamId: 1, position: "DEF" }]
    }]);
  });

  it("discovers valid primary and variant recommendations deterministically", async () => {
    const gameweekDir = await temporaryDirectory();
    const recommendation = variantRecommendation();
    await Promise.all([
      writeFile(path.join(gameweekDir, "recommendation.json"), JSON.stringify(recommendation), "utf8"),
      mkdir(path.join(gameweekDir, "variants", "zeta"), { recursive: true }),
      mkdir(path.join(gameweekDir, "variants", "alpha"), { recursive: true })
    ]);
    await Promise.all([
      writeFile(path.join(gameweekDir, "variants", "zeta", "recommendation.json"), JSON.stringify(recommendation), "utf8"),
      writeFile(path.join(gameweekDir, "variants", "alpha", "recommendation.json"), JSON.stringify(recommendation), "utf8")
    ]);
    const exposures = await loadFixtureExposures({
      gameweek: 1,
      gameweekDir,
      configuredPlayerIds: [],
      players: []
    });

    expect(exposures.map((exposure) => exposure.label)).toEqual(["Primary recommendation", "alpha", "zeta"]);
    expect(exposures.every((exposure) => exposure.players.length === 15)).toBe(true);
  });
});
