import type { CaptainCandidate, PlayerProjection, RiskLabel } from "./types";

function riskForProjection(projection: PlayerProjection): RiskLabel {
  if (projection.availabilityFactor < 0.75 || projection.expectedMinutes < 60) {
    return "high";
  }

  if (projection.expectedMinutes < 75) {
    return "medium";
  }

  return "low";
}

export function rankCaptainCandidates(
  projections: PlayerProjection[],
  playerIds?: number[],
  limit = 5
): CaptainCandidate[] {
  const allowedIds = playerIds ? new Set(playerIds) : null;

  return projections
    .filter((projection) => !allowedIds || allowedIds.has(projection.playerId))
    .sort((a, b) => b.projectedPoints - a.projectedPoints || b.expectedMinutes - a.expectedMinutes)
    .slice(0, limit)
    .map((projection) => ({
      playerId: projection.playerId,
      projectedPoints: projection.projectedPoints,
      expectedMinutes: projection.expectedMinutes,
      fixtureSummary: `Fixture factor ${projection.fixtureDifficultyFactor}`,
      risk: riskForProjection(projection),
      upsideCase: "Best projected points among eligible captain options.",
      downsideCase: projection.availabilityFactor < 1 ? "Availability is not fully secure." : "Projection can miss if minutes or fixture assumptions are wrong."
    }));
}
