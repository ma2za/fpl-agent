import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  VARIANT_SLUG_PATTERN,
  isWeeklyRecommendationArtifact,
  readArtifactFileIfExists,
  RecommendationArtifactSchema,
  type FixtureExposureInput
} from "../packages/agent/src";

type PlayerInput = {
  id: number;
  teamId: number;
  position: string;
};

function exposurePlayers(players: PlayerInput[]) {
  return players
    .filter((player): player is PlayerInput & { position: "GKP" | "DEF" | "MID" | "FWD" } =>
      player.position === "GKP" || player.position === "DEF" || player.position === "MID" || player.position === "FWD"
    )
    .map((player) => ({ playerId: player.id, teamId: player.teamId, position: player.position }))
    .sort((a, b) => a.playerId - b.playerId);
}

export async function loadFixtureExposures(input: {
  gameweek: number;
  gameweekDir: string;
  configuredPlayerIds: number[];
  players: PlayerInput[];
}): Promise<FixtureExposureInput[]> {
  const exposures: FixtureExposureInput[] = [];
  const playerById = new Map(input.players.map((player) => [player.id, player]));
  const configured = exposurePlayers(input.configuredPlayerIds
    .map((playerId) => playerById.get(playerId))
    .filter((player): player is PlayerInput => Boolean(player)));

  if (configured.length > 0) {
    exposures.push({ label: "Configured squad", kind: "configured", players: configured });
  }

  const primary = await readArtifactFileIfExists(
    path.join(input.gameweekDir, "recommendation.json"),
    RecommendationArtifactSchema
  );
  if (primary && isWeeklyRecommendationArtifact(primary)) {
    exposures.push({
      label: "Primary recommendation",
      kind: "primary",
      players: exposurePlayers(primary.squadBefore.players)
    });
  }

  let variantSlugs: string[] = [];
  try {
    variantSlugs = (await readdir(path.join(input.gameweekDir, "variants"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && VARIANT_SLUG_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }

  for (const slug of variantSlugs) {
    const recommendation = await readArtifactFileIfExists(
      path.join(input.gameweekDir, "variants", slug, "recommendation.json"),
      RecommendationArtifactSchema
    );
    if (recommendation && isWeeklyRecommendationArtifact(recommendation)) {
      exposures.push({ label: slug, kind: "variant", players: exposurePlayers(recommendation.squadBefore.players) });
    }
  }

  return exposures;
}
