import type { CaptainCandidate, ChipRecommendation, PlayerProjection } from "./types";

export function recommendChip(input: {
  chipsAvailable: Array<"wildcard" | "free_hit" | "bench_boost" | "triple_captain">;
  captainCandidates: CaptainCandidate[];
  benchPlayerIds: number[];
  projections: PlayerProjection[];
}): ChipRecommendation {
  const warnings = ["Human manager must confirm any chip manually in the official FPL interface."];
  const projectionById = new Map(input.projections.map((projection) => [projection.playerId, projection]));
  const topCaptain = input.captainCandidates[0];
  const benchTotal = input.benchPlayerIds.reduce(
    (sum, playerId) => sum + (projectionById.get(playerId)?.projectedPoints ?? 0),
    0
  );

  if (
    input.chipsAvailable.includes("triple_captain") &&
    topCaptain &&
    topCaptain.projectedPoints >= 10 &&
    topCaptain.risk === "low"
  ) {
    return {
      chip: "triple_captain",
      confidence: "medium",
      expectedGain: Math.round(topCaptain.projectedPoints * 10) / 10,
      reasons: ["Top captain projection is unusually high and low risk."],
      warnings
    };
  }

  if (input.chipsAvailable.includes("bench_boost") && benchTotal >= 18) {
    return {
      chip: "bench_boost",
      confidence: "medium",
      expectedGain: Math.round(benchTotal * 10) / 10,
      reasons: ["Bench projection is high enough to consider bench boost."],
      warnings
    };
  }

  return {
    chip: "none",
    confidence: "high",
    expectedGain: 0,
    reasons: ["No chip clears the conservative expected-gain threshold."],
    warnings
  };
}
