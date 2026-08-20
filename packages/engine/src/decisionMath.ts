import type {
  AdjustedProjection,
  DecisionMarginReport,
  OptimizationMode,
  ProjectionFeatureAdjustment,
  ProjectionScenarioAdjustment,
  StructureSimulationCandidate,
  StructureSimulationFieldCandidate,
  StructureSimulationFixtureDistribution,
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

function poisson(random: () => number, lambda: number) {
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= random();
  } while (product > limit);
  return count - 1;
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

export function applyProjectionScenarioAdjustment(input: ProjectionScenarioAdjustment) {
  if (!["EVIDENCE_CONDITIONED_AUTHORED_PRIOR", "EMPIRICALLY_CALIBRATED_SCENARIO_MODEL"].includes(input.probabilityMethod)) {
    throw new Error(`Scenario feature ${input.featureId} requires an explicit probability method.`);
  }
  if (input.scenarios.length < 2) throw new Error(`Scenario feature ${input.featureId} requires at least two outcomes.`);
  const probability = input.scenarios.reduce((sum, scenario) => sum + scenario.probability, 0);
  if (Math.abs(probability - 1) > 1e-9) throw new Error(`Scenario feature ${input.featureId} probabilities must sum to one.`);
  for (const scenario of input.scenarios) {
    if (!scenario.scenarioId || scenario.probability < 0 || !Number.isFinite(scenario.projectedPoints) ||
      !Number.isFinite(scenario.standardDeviation) || scenario.standardDeviation < 0 || scenario.evidenceIds.length === 0) {
      throw new Error(`Scenario feature ${input.featureId} contains an invalid or unsupported outcome.`);
    }
  }
  const mean = input.scenarios.reduce((sum, scenario) => sum + scenario.probability * scenario.projectedPoints, 0);
  const secondMoment = input.scenarios.reduce((sum, scenario) => sum + scenario.probability *
    (scenario.standardDeviation ** 2 + scenario.projectedPoints ** 2), 0);
  return {
    featureId: input.featureId,
    probabilityMethod: input.probabilityMethod,
    mean: round(mean),
    standardDeviation: round(Math.sqrt(Math.max(0, secondMoment - mean ** 2))),
    scenarios: input.scenarios
  };
}

export function simulateStructures(input: {
  mode: OptimizationMode;
  candidates: StructureSimulationCandidate[];
  fieldCandidates?: StructureSimulationFieldCandidate[];
  playerDistributions: StructureSimulationPlayerDistribution[];
  fixtureDistributions?: StructureSimulationFixtureDistribution[];
  searchScope?: StructureSimulationReport["searchScope"];
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
  const fixtures = new Map((input.fixtureDistributions ?? []).map((item) => [item.fixtureId, item]));
  if (fixtures.size !== (input.fixtureDistributions ?? []).length || (input.fixtureDistributions ?? []).some((fixture) =>
    fixture.homeTeamId === fixture.awayTeamId || fixture.homeExpectedGoals < 0 || fixture.awayExpectedGoals < 0 ||
    !Number.isFinite(fixture.homeExpectedGoals) || !Number.isFinite(fixture.awayExpectedGoals) ||
    fixture.model !== "INDEPENDENT_POISSON_FROM_EXPECTED_GOALS" || fixture.evidenceIds.length === 0)) {
    throw new Error("Fixture distributions must be unique, evidenced Poisson expected-goals inputs.");
  }
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
  const breakdowns = new Map(allCandidates.map((candidate) => [candidate.candidateId, {
    startingXI: 0,
    captainBonus: 0,
    expectedAutosubs: 0,
    viceCaptainFallback: 0
  }]));
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const matchStates = new Map<number, { homeGoals: number; awayGoals: number }>();
    for (const fixture of input.fixtureDistributions ?? []) matchStates.set(fixture.fixtureId, {
      homeGoals: poisson(random, fixture.homeExpectedGoals),
      awayGoals: poisson(random, fixture.awayExpectedGoals)
    });
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
      const fixture = distribution.fixtureId === undefined ? undefined : fixtures.get(distribution.fixtureId);
      const match = distribution.fixtureId === undefined ? undefined : matchStates.get(distribution.fixtureId);
      if (!fixture || !match || distribution.teamId === undefined) {
        points.set(distribution.playerId, Math.max(-2, conditionalMean + normal(random) * conditionalDeviation));
        continue;
      }
      const home = distribution.teamId === fixture.homeTeamId;
      const teamGoals = home ? match.homeGoals : match.awayGoals;
      const opponentGoals = home ? match.awayGoals : match.homeGoals;
      const teamExpectedGoals = home ? fixture.homeExpectedGoals : fixture.awayExpectedGoals;
      const opponentExpectedGoals = home ? fixture.awayExpectedGoals : fixture.homeExpectedGoals;
      let attackLoading = conditionalDeviation * (distribution.position === "MID" || distribution.position === "FWD" ? 0.35 : distribution.position === "DEF" ? 0.12 : 0);
      const attackState = teamExpectedGoals > 0 ? (teamGoals - teamExpectedGoals) / Math.sqrt(teamExpectedGoals) : 0;
      const cleanSheetProbability = Math.exp(-opponentExpectedGoals);
      let cleanSheetLoading = distribution.position === "GKP" || distribution.position === "DEF" ? 2.4 : 0;
      let correlatedVariance = attackLoading ** 2 + cleanSheetLoading ** 2 * cleanSheetProbability * (1 - cleanSheetProbability);
      if (correlatedVariance > conditionalDeviation ** 2 && correlatedVariance > 0) {
        const scale = conditionalDeviation / Math.sqrt(correlatedVariance);
        attackLoading *= scale;
        cleanSheetLoading *= scale;
        correlatedVariance = conditionalDeviation ** 2;
      }
      const residualDeviation = Math.sqrt(Math.max(0, conditionalDeviation ** 2 - correlatedVariance));
      const correlatedPoints = conditionalMean + normal(random) * residualDeviation + attackLoading * attackState +
        cleanSheetLoading * (Number(opponentGoals === 0) - cleanSheetProbability);
      points.set(distribution.playerId, Math.max(-2, correlatedPoints));
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
      const captainAppeared = candidate.captainPlayerId !== null && appearances.get(candidate.captainPlayerId);
      const captainId = captainAppeared
        ? candidate.captainPlayerId
        : candidate.viceCaptainPlayerId !== undefined && candidate.viceCaptainPlayerId !== null && appearances.get(candidate.viceCaptainPlayerId)
          ? candidate.viceCaptainPlayerId
          : null;
      const originalXI = candidate.playerIds.reduce((sum, playerId) => sum + (appearances.get(playerId) ? points.get(playerId)! : 0), 0);
      const scoringXI = scoringPlayerIds.reduce((sum, playerId) => sum + points.get(playerId)!, 0);
      const captainBonus = captainAppeared && candidate.captainPlayerId !== null ? points.get(candidate.captainPlayerId)! : 0;
      const viceCaptainFallback = !captainAppeared && captainId !== null ? points.get(captainId)! : 0;
      const total = scoringXI + captainBonus + viceCaptainFallback;
      totals.get(candidate.candidateId)!.push(total);
      const breakdown = breakdowns.get(candidate.candidateId)!;
      breakdown.startingXI += originalXI;
      breakdown.expectedAutosubs += scoringXI - originalXI;
      breakdown.captainBonus += captainBonus;
      breakdown.viceCaptainFallback += viceCaptainFallback;
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
    const breakdown = breakdowns.get(candidate.candidateId)!;
    return {
      candidateId: candidate.candidateId,
      expectedPoints: round(expectedPoints),
      p10: round(quantile(sorted, 0.1)),
      p50: round(quantile(sorted, 0.5)),
      p90: round(quantile(sorted, 0.9)),
      expectedRankUtility: expectedRankUtility === null ? null : round(expectedRankUtility),
      objectiveScore: round(expectedRankUtility ?? expectedPoints),
      expectedPointsBreakdown: {
        startingXI: round(breakdown.startingXI / sampleCount),
        captainBonus: round(breakdown.captainBonus / sampleCount),
        expectedAutosubs: round(breakdown.expectedAutosubs / sampleCount),
        viceCaptainFallback: round(breakdown.viceCaptainFallback / sampleCount),
        total: round(expectedPoints)
      }
    };
  });
  return {
    schemaVersion: 1,
    model: "shared-player-monte-carlo",
    modelVersion: "0.0.18",
    mode: input.mode,
    seed,
    sampleCount,
    results,
    objectiveDefinition: {
      captainDoubling: true,
      viceCaptainFallback: true,
      automaticSubstitutions: allCandidates.some((candidate) => candidate.benchOrder),
      formationLegalityAfterSubstitutions: allCandidates.some((candidate) => candidate.benchOrder),
      goalkeeperSubstitution: allCandidates.some((candidate) => candidate.benchOrder),
      appearanceProbabilities: input.playerDistributions.some((item) => item.appearanceProbability !== undefined),
      scoringVariance: true,
      correlatedMatchStates: fixtures.size > 0
    },
    searchScope: input.searchScope ?? {
      generator: "manual",
      exhaustive: false,
      playerUniverseSize: distributions.size,
      candidatesGenerated: input.candidates.length,
      candidatesSimulated: input.candidates.length
    },
    assumptions: [
      "Each player draw is shared across every structure in the same simulation sample.",
      allCandidates.some((candidate) => candidate.benchOrder)
        ? "Complete 15-player inputs apply formation-safe automatic substitutions and vice-captain fallback in every sample."
        : "Candidates without bench inputs are treated as scoring lineups without automatic substitutions.",
      fixtures.size > 0
        ? "Evidenced Poisson match-goal states drive shared team attack and clean-sheet outcomes; residual player variance remains conditional and independent."
        : "No fixture distributions were supplied, so player scoring outcomes remain conditionally independent.",
      input.mode === "MAX_EXPECTED_POINTS"
        ? "Ownership is excluded from the objective."
        : "Field weights affect rank utility only through simulated competing scores; they are never subtracted from expected points."
    ],
    decisionPolicy: "This report exposes objective scores and distributions. It does not select or recommend a structure."
  };
}

export function analyzeDecisionMargins(input: {
  mode: "MAX_EXPECTED_POINTS";
  candidates: StructureSimulationCandidate[];
  playerDistributions: StructureSimulationPlayerDistribution[];
  fixtureDistributions?: StructureSimulationFixtureDistribution[];
  playerIds: number[];
  seed?: number;
  sampleCount?: number;
  perturbationStep?: number;
}): DecisionMarginReport {
  const perturbationStep = input.perturbationStep ?? 0.1;
  if (!(perturbationStep > 0)) throw new Error("Perturbation step must be positive.");
  const base = simulateStructures(input);
  const ranked = [...base.results].sort((a, b) => b.objectiveScore - a.objectiveScore || a.candidateId.localeCompare(b.candidateId));
  const selected = ranked[0];
  const rival = ranked[1];
  if (!selected || !rival) throw new Error("Decision-margin analysis requires two simulated candidates.");
  const baseObjectiveMargin = selected.objectiveScore - rival.objectiveScore;
  const distributions = new Map(input.playerDistributions.map((item) => [item.playerId, item]));
  const margins = input.playerIds.map((playerId) => {
    const player = distributions.get(playerId);
    if (!player) throw new Error(`Missing distribution for sensitivity player ${playerId}.`);
    const perturbed = input.playerDistributions.map((item) => item.playerId === playerId ? { ...item, mean: item.mean + perturbationStep } : item);
    const report = simulateStructures({ ...input, playerDistributions: perturbed });
    const selectedScore = report.results.find((item) => item.candidateId === selected.candidateId)!.objectiveScore;
    const rivalScore = report.results.find((item) => item.candidateId === rival.candidateId)!.objectiveScore;
    const pointsPerMeanPoint = ((selectedScore - rivalScore) - baseObjectiveMargin) / perturbationStep;
    const breakEvenMean = Math.abs(pointsPerMeanPoint) < 1e-9 ? null : player.mean - baseObjectiveMargin / pointsPerMeanPoint;
    return {
      playerId,
      rivalCandidateId: rival.candidateId,
      currentMean: round(player.mean),
      breakEvenMean: breakEvenMean === null ? null : round(breakEvenMean),
      margin: breakEvenMean === null ? null : round(Math.abs(player.mean - breakEvenMean)),
      pointsPerMeanPoint: round(pointsPerMeanPoint),
      method: "COMMON_RANDOM_NUMBERS_FINITE_DIFFERENCE" as const
    };
  });
  return {
    schemaVersion: 1,
    modelVersion: "0.0.18",
    selectedCandidateId: selected.candidateId,
    rivalCandidateId: rival.candidateId,
    baseObjectiveMargin: round(baseObjectiveMargin),
    perturbationStep,
    margins
  };
}
