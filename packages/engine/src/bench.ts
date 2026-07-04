import { validateBench, validateStartingXI, VALID_FORMATIONS } from "../../rules/src";
import type { PickTeamRecommendation, PlayerForEngine, PlayerProjection } from "./types";

function projectionMap(projections: PlayerProjection[]) {
  return new Map(projections.map((projection) => [projection.playerId, projection.projectedPoints]));
}

function pointsFor(points: Map<number, number>, playerId: number) {
  return points.get(playerId) ?? 0;
}

function sortedByProjection(players: PlayerForEngine[], points: Map<number, number>) {
  return [...players].sort((a, b) => pointsFor(points, b.id) - pointsFor(points, a.id) || a.id - b.id);
}

export function pickStartingXI(
  squad: PlayerForEngine[],
  projections: PlayerProjection[]
): PickTeamRecommendation {
  const points = projectionMap(projections);
  let best: PickTeamRecommendation | null = null;

  for (const [formation, counts] of Object.entries(VALID_FORMATIONS)) {
    const starters = [
      ...sortedByProjection(squad.filter((player) => player.position === "GKP"), points).slice(0, counts.GKP),
      ...sortedByProjection(squad.filter((player) => player.position === "DEF"), points).slice(0, counts.DEF),
      ...sortedByProjection(squad.filter((player) => player.position === "MID"), points).slice(0, counts.MID),
      ...sortedByProjection(squad.filter((player) => player.position === "FWD"), points).slice(0, counts.FWD)
    ];
    const startingXI = starters.map((player) => player.id);
    const legality = validateStartingXI({ squad, startingXI, formation });

    if (!legality.isValid) {
      continue;
    }

    const projectedPoints = startingXI.reduce((sum, playerId) => sum + pointsFor(points, playerId), 0);
    const benchPlayers = squad.filter((player) => !startingXI.includes(player.id));
    const benchGoalkeeper = sortedByProjection(
      benchPlayers.filter((player) => player.position === "GKP"),
      points
    )[0];
    const outfieldBench = sortedByProjection(
      benchPlayers.filter((player) => player.position !== "GKP"),
      points
    );
    const benchOrder = [
      ...(benchGoalkeeper ? [benchGoalkeeper.id] : []),
      ...outfieldBench.map((player) => player.id)
    ];
    const benchLegality = validateBench({ squad, startingXI, benchOrder });

    if (!benchLegality.isValid) {
      continue;
    }

    if (!best || projectedPoints > best.projectedPoints) {
      best = {
        formation,
        startingXI,
        benchOrder,
        projectedPoints: Math.round(projectedPoints * 10) / 10,
        explanation: `Selected ${formation} because it has the highest projected starting XI total.`
      };
    }
  }

  if (!best) {
    return {
      formation: "invalid",
      startingXI: [],
      benchOrder: [],
      projectedPoints: 0,
      explanation: "No legal starting XI could be selected from the squad."
    };
  }

  return best;
}
