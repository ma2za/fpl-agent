import type {
  AdjustedProjection,
  OptimizationMode,
  ProjectionFeatureAdjustment,
  StructureSimulationCandidate,
  StructureSimulationFieldCandidate,
  StructureSimulationPlayerDistribution,
  StructureSimulationReport
} from "./types";
import { resolveAutomaticSubstitutions, type Position } from "../../rules/src";

function round(value: number, places = 3) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function randomGenerator(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function normal(random: () => number) {
  const u = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

function quantile(sorted: number[], probability: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * probability))] ?? 0;
}

export function applyProjectionAdjustments(input: {
  baseProjection: number;
  baseStandardDeviation: number;
  baselineFeatureIds: string[];
  adjustments: ProjectionFeatureAdjustment[];
}): AdjustedProjection {
  const baseline = new Set(input.baselineFeatureIds);
  const seen = new Set<string>();
  for (const adjustment of input.adjustments) {
    if (baseline.has(adjustment.featureId)) throw new Error(`Feature ${adjustment.featureId} is already included in the base projection.`);
    if (seen.has(adjustment.featureId)) throw new Error(`Feature ${adjustment.featureId} is adjusted more than once.`);
    if (adjustment.evidenceIds.length === 0) throw new Error(`Feature ${adjustment.featureId} has no evidence dependency.`);
    if (["preseason_output", "lower_league_output"].includes(adjustment.sourceKind) && !adjustment.translationModel) {
      throw new Error(`Feature ${adjustment.featureId} requires an explicit competition translation model.`);
    }
    seen.add(adjustment.featureId);
  }
  const adjustedProjection = input.baseProjection + input.adjustments.reduce((sum, item) => sum + item.pointsDelta, 0);
  const adjustedVariance = input.baseStandardDeviation ** 2 + input.adjustments.reduce((sum, item) => sum + item.standardDeviation ** 2, 0);
  return {
    baseProjection: round(input.baseProjection),
    adjustedProjection: round(adjustedProjection),
    baseStandardDeviation: round(input.baseStandardDeviation),
    adjustedStandardDeviation: round(Math.sqrt(adjustedVariance)),
    adjustments: input.adjustments
  };
}

export function simulateStructures(input: {
  mode: OptimizationMode;
  candidates: StructureSimulationCandidate[];
  fieldCandidates?: StructureSimulationFieldCandidate[];
  playerDistributions: StructureSimulationPlayerDistribution[];
  seed?: number;
  sampleCount?: number;
}): StructureSimulationReport {
  const seed = input.seed ?? 170017;
  const sampleCount = input.sampleCount ?? 10_000;
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) throw new Error("Sample count must be a positive integer.");
  if (input.candidates.length < 2) throw new Error("At least two competing structures are required.");
  if (input.mode !== "MAX_EXPECTED_POINTS" && (!input.fieldCandidates || input.fieldCandidates.length === 0)) {
    throw new Error(`${input.mode} requires simulated field candidates; ownership cannot be applied as a points adjustment.`);
  }
  if (input.mode === "MAX_EXPECTED_POINTS" && (input.fieldCandidates?.length ?? 0) > 0) {
    throw new Error("MAX_EXPECTED_POINTS must exclude ownership and field-rank effects.");
  }
  const distributions = new Map(input.playerDistributions.map((item) => [item.playerId, item]));
  const allCandidates = [...input.candidates, ...(input.fieldCandidates ?? [])];
  if (new Set(allCandidates.map((candidate) => candidate.candidateId)).size !== allCandidates.length) {
    throw new Error("Candidate IDs must be unique across manager and field structures.");
  }
  if ((input.fieldCandidates ?? []).some((candidate) => !Number.isFinite(candidate.weight) || candidate.weight <= 0)) {
    throw new Error("Field candidate weights must be positive finite numbers.");
  }
  if (distributions.size !== input.playerDistributions.length || input.playerDistributions.some((item) =>
    !Number.isFinite(item.mean) || !Number.isFinite(item.standardDeviation) || item.standardDeviation < 0 ||
    (item.appearanceProbability !== undefined && (item.appearanceProbability < 0 || item.appearanceProbability > 1)) ||
    (item.price !== undefined && (!Number.isFinite(item.price) || item.price < 0)))) {
    throw new Error("Player distributions must be unique and contain valid finite probability parameters.");
  }
  for (const candidate of allCandidates) {
    const squadPlayerIds = [...candidate.playerIds, ...(candidate.benchOrder ?? [])];
    for (const playerId of squadPlayerIds) if (!distributions.has(playerId)) throw new Error(`Missing distribution for player ${playerId}.`);
    if (candidate.captainPlayerId !== null && !candidate.playerIds.includes(candidate.captainPlayerId)) {
      throw new Error(`Captain ${candidate.captainPlayerId} is absent from candidate ${candidate.candidateId}.`);
    }
    if (candidate.viceCaptainPlayerId !== undefined && candidate.viceCaptainPlayerId !== null && !candidate.playerIds.includes(candidate.viceCaptainPlayerId)) {
      throw new Error(`Vice-captain ${candidate.viceCaptainPlayerId} is absent from candidate ${candidate.candidateId}.`);
    }
    if (candidate.benchOrder) {
      if (candidate.playerIds.length !== 11 || candidate.benchOrder.length !== 4 || new Set(squadPlayerIds).size !== 15) {
        throw new Error(`Candidate ${candidate.candidateId} must contain 11 unique starters and four unique substitutes.`);
      }
      for (const playerId of squadPlayerIds) {
        const distribution = distributions.get(playerId)!;
        if (distribution.position === undefined || distribution.appearanceProbability === undefined || distribution.teamId === undefined || distribution.price === undefined) {
          throw new Error(`Candidate ${candidate.candidateId} requires position, club, price, and appearance probability for player ${playerId}.`);
        }
      }
      const positionCounts = squadPlayerIds.reduce<Record<string, number>>((counts, playerId) => {
        const position = distributions.get(playerId)!.position!;
        counts[position] = (counts[position] ?? 0) + 1;
        return counts;
      }, {});
      if (positionCounts.GKP !== 2 || positionCounts.DEF !== 5 || positionCounts.MID !== 5 || positionCounts.FWD !== 3) {
        throw new Error(`Candidate ${candidate.candidateId} has an invalid 15-player position structure.`);
      }
      const clubCounts = new Map<number, number>();
      let cost = 0;
      for (const playerId of squadPlayerIds) {
        const distribution = distributions.get(playerId)!;
        clubCounts.set(distribution.teamId!, (clubCounts.get(distribution.teamId!) ?? 0) + 1);
        cost += distribution.price!;
      }
      if ([...clubCounts.values()].some((count) => count > 3)) throw new Error(`Candidate ${candidate.candidateId} exceeds the three-player club limit.`);
      if (cost > 100 + 1e-9) throw new Error(`Candidate ${candidate.candidateId} exceeds the £100.0m budget.`);
    }
  }
  const random = randomGenerator(seed);
  const totals = new Map(allCandidates.map((candidate) => [candidate.candidateId, [] as number[]]));
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const points = new Map<number, number>();
    const appearances = new Map<number, boolean>();
    for (const distribution of input.playerDistributions) {
      const appearanceProbability = distribution.appearanceProbability;
      if (appearanceProbability === undefined) {
        appearances.set(distribution.playerId, true);
        points.set(distribution.playerId, Math.max(-2, distribution.mean + normal(random) * distribution.standardDeviation));
        continue;
      }
      const appeared = random() < appearanceProbability;
      appearances.set(distribution.playerId, appeared);
      if (!appeared || appearanceProbability === 0) {
        points.set(distribution.playerId, 0);
        continue;
      }
      const conditionalMean = distribution.mean / appearanceProbability;
      const stateVariance = appearanceProbability * (1 - appearanceProbability) * conditionalMean ** 2;
      const conditionalDeviation = Math.sqrt(Math.max(0, (distribution.standardDeviation ** 2 - stateVariance) / appearanceProbability));
      points.set(distribution.playerId, Math.max(-2, conditionalMean + normal(random) * conditionalDeviation));
    }
    for (const candidate of allCandidates) {
      const scoringPlayerIds = candidate.benchOrder ? resolveAutomaticSubstitutions({
        players: [...candidate.playerIds, ...candidate.benchOrder].map((playerId) => ({
          id: playerId,
          position: distributions.get(playerId)!.position as Position,
          minutes: appearances.get(playerId) ? 1 : 0
        })),
        startingXI: candidate.playerIds,
        benchOrder: candidate.benchOrder
      }).startingXI : candidate.playerIds;
      const captainId = candidate.captainPlayerId !== null && appearances.get(candidate.captainPlayerId)
        ? candidate.captainPlayerId
        : candidate.viceCaptainPlayerId !== undefined && candidate.viceCaptainPlayerId !== null && appearances.get(candidate.viceCaptainPlayerId)
          ? candidate.viceCaptainPlayerId
          : null;
      const total = scoringPlayerIds.reduce((sum, playerId) => sum + points.get(playerId)!, 0) +
        (captainId === null ? 0 : points.get(captainId)!);
      totals.get(candidate.candidateId)!.push(total);
    }
  }
  const fieldWeight = (input.fieldCandidates ?? []).reduce((sum, item) => sum + item.weight, 0);
  const results = input.candidates.map((candidate) => {
    const samples = totals.get(candidate.candidateId)!;
    const sorted = [...samples].sort((a, b) => a - b);
    const expectedPoints = samples.reduce((sum, value) => sum + value, 0) / sampleCount;
    const expectedRankUtility = input.mode === "MAX_EXPECTED_POINTS" ? null : samples.reduce((sum, score, index) => {
      const percentile = (input.fieldCandidates ?? []).reduce((fieldSum, field) =>
        fieldSum + (score > totals.get(field.candidateId)![index] ? field.weight : score === totals.get(field.candidateId)![index] ? field.weight * 0.5 : 0), 0) / fieldWeight;
      if (input.mode === "MINI_LEAGUE_DEFEND") return sum + percentile - Math.max(0, 0.5 - percentile) * 0.25;
      if (input.mode === "MINI_LEAGUE_CHASE") return sum + percentile + Math.max(0, percentile - 0.5) * 0.25;
      return sum + percentile;
    }, 0) / sampleCount;
    return {
      candidateId: candidate.candidateId,
      expectedPoints: round(expectedPoints),
      p10: round(quantile(sorted, 0.1)),
      p50: round(quantile(sorted, 0.5)),
      p90: round(quantile(sorted, 0.9)),
      expectedRankUtility: expectedRankUtility === null ? null : round(expectedRankUtility),
      objectiveScore: round(expectedRankUtility ?? expectedPoints)
    };
  });
  return {
    schemaVersion: 1,
    model: "shared-player-monte-carlo",
    modelVersion: "0.0.17",
    mode: input.mode,
    seed,
    sampleCount,
    results,
    assumptions: [
      "Each player draw is shared across every structure in the same simulation sample.",
      allCandidates.some((candidate) => candidate.benchOrder)
        ? "Complete 15-player inputs apply formation-safe automatic substitutions and vice-captain fallback in every sample."
        : "Candidates without bench inputs are treated as scoring lineups without automatic substitutions.",
      input.mode === "MAX_EXPECTED_POINTS"
        ? "Ownership is excluded from the objective."
        : "Field weights affect rank utility only through simulated competing scores; they are never subtracted from expected points."
    ],
    decisionPolicy: "This report exposes objective scores and distributions. It does not select or recommend a structure."
  };
}
