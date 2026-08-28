import type {
  ConditionalAppearanceSample,
  AppearanceStateForecast,
  MinutesDistribution,
  PlayerForEngine,
  PlayerProjection,
  ProbabilisticProjection,
  ProjectionUncertaintyReport,
  RoleEvidenceForProjection
} from "./types";

const SAMPLE_COUNT = 1000;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, places = 3) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function seedFor(baseSeed: number, playerId: number) {
  return (Math.imul(baseSeed ^ playerId, 2654435761) >>> 0) || 1;
}

function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function normal(random: () => number) {
  const u = Math.max(random(), Number.EPSILON);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function quantile(sorted: number[], probability: number) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * probability))];
}

function standardDeviation(values: number[], mean: number) {
  if (values.length === 0) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function historicalStartPrior(expectedMinutes: number) {
  if (expectedMinutes >= 85) return 0.9;
  if (expectedMinutes >= 75) return 0.78;
  if (expectedMinutes >= 55) return 0.58;
  if (expectedMinutes >= 30) return 0.32;
  return 0.18;
}

function historicalConfidence(player: PlayerForEngine) {
  const minutes = player.minutes ?? 0;
  if (minutes >= 2400) return 0.9;
  if (minutes >= 1500) return 0.75;
  if (minutes >= 700) return 0.55;
  if (minutes > 0) return 0.35;
  return 0.15;
}

function cohortFor(player: PlayerForEngine, expectedMinutes: number, role?: RoleEvidenceForProjection) {
  if ((player.minutes ?? 0) === 0) return `${player.position.toLowerCase()}-new-player`;
  if (role?.currentEvidencePresent && role.supportScore < 0.7) return `${player.position.toLowerCase()}-role-challenger`;
  if (expectedMinutes >= 75) return `${player.position.toLowerCase()}-established-starter`;
  return `${player.position.toLowerCase()}-rotation-player`;
}

function cohortMinutes(position: string, cohort: string, historicalExpectedMinutes: number) {
  if (position === "GKP") return { start: 90, substitute: 0 };
  if (cohort.endsWith("new-player")) return { start: 78, substitute: 19 };
  if (historicalExpectedMinutes >= 75) return { start: 84, substitute: 16 };
  if (historicalExpectedMinutes >= 55) return { start: 80, substitute: 19 };
  return { start: 79, substitute: 20 };
}

function cohortStartPoints(player: PlayerForEngine, raw: PlayerProjection, startMinutes: number) {
  const pricePremium = Math.max(0, player.price - (player.position === "DEF" ? 4 : 4.5));
  const teamStrengthFactor = player.teamStrength == null
    ? 1
    : clamp(0.85 + player.teamStrength * 0.05, 0.9, 1.15);
  const baseline = player.position === "GKP"
    ? 3.5
    : player.position === "DEF"
      ? 3.8 + pricePremium * 0.55
      : player.position === "MID"
        ? 3.6 + pricePremium * 0.5
        : 3.8 + pricePremium * 0.45;
  return baseline * teamStrengthFactor * raw.fixtureDifficultyFactor * raw.formFactor * startMinutes / 84;
}

function empiricalMeans(history: ConditionalAppearanceSample[]) {
  const starts = history.filter((sample) => sample.started && sample.minutes > 0);
  const substitutes = history.filter((sample) => !sample.started && sample.minutes > 0);
  if (starts.length < 6 || substitutes.length < 4) return null;
  return {
    startMinutes: starts.reduce((sum, sample) => sum + sample.minutes, 0) / starts.length,
    substituteMinutes: substitutes.reduce((sum, sample) => sum + sample.minutes, 0) / substitutes.length,
    startPoints: starts.reduce((sum, sample) => sum + sample.points, 0) / starts.length,
    substitutePoints: substitutes.reduce((sum, sample) => sum + sample.points, 0) / substitutes.length
  };
}

function appearanceForecast(
  player: PlayerForEngine,
  raw: PlayerProjection,
  role?: RoleEvidenceForProjection,
  history: ConditionalAppearanceSample[] = [],
  priorAppearance?: AppearanceStateForecast
) {
  const availability = clamp(raw.availabilityFactor);
  const historicalRoleConfidence = Math.max(
    historicalConfidence(player),
    priorAppearance?.historicalRoleConfidence ?? 0
  );
  const currentConfidence = role?.currentEvidencePresent ? clamp(role.confidence) : 0;
  const previousPrior = priorAppearance?.startProbability ?? historicalStartPrior(raw.expectedMinutes);
  const priorWeight = 4;
  const prior = history.length > 0
    ? (previousPrior * priorWeight + history.filter((sample) => sample.started).length) / (priorWeight + history.length)
    : previousPrior;
  let conditionalStart = role?.currentEvidencePresent
    ? prior * (1 - currentConfidence) + clamp(role.supportScore) * currentConfidence
    : prior;

  if (role?.manualOverride === "supports_start") conditionalStart = 0.98;
  if (role?.manualOverride === "opposes_start") conditionalStart = 0.02;
  if (role?.disagreement) conditionalStart = prior * 0.5 + conditionalStart * 0.5;

  const conditionalSub = player.position === "GKP"
    ? 0
    : clamp((1 - conditionalStart) * (0.45 + historicalRoleConfidence * 0.25), 0.02, 0.45);
  const startProbability = availability * clamp(conditionalStart);
  const subAppearanceProbability = availability * Math.min(conditionalSub, 1 - conditionalStart);
  const noAppearanceProbability = clamp(1 - startProbability - subAppearanceProbability);
  const availabilityConfidence = typeof player.chanceOfPlayingNextRound === "number" || player.status !== "a" ? 1 : 0.8;
  const overallEvidenceConfidence = clamp(
    historicalRoleConfidence * 0.35 + currentConfidence * 0.45 + availabilityConfidence * 0.2
  );
  const startProbabilityUncertainty = clamp(0.02 + (1 - overallEvidenceConfidence) * 0.16, 0.02, 0.18);
  const roleClass = conditionalStart >= 0.93
    ? "SECURE_STARTER" as const
    : conditionalStart >= 0.84
      ? "LIKELY_STARTER" as const
      : conditionalStart >= 0.65
        ? "UNCERTAIN_STARTER" as const
        : conditionalStart >= 0.4
          ? "ROTATION_OPTION" as const
          : "BENCH_OPTION" as const;
  const source = role?.currentEvidencePresent
    ? "current_role" as const
    : (player.minutes ?? 0) > 0
      ? "historical_role" as const
      : "cohort_fallback" as const;

  return {
    playerId: player.id,
    startProbability: round(startProbability),
    subAppearanceProbability: round(subAppearanceProbability),
    noAppearanceProbability: round(noAppearanceProbability),
    appearanceProbability: round(startProbability + subAppearanceProbability),
    historicalRoleConfidence: round(historicalRoleConfidence),
    currentRoleEvidenceConfidence: round(currentConfidence),
    availabilityConfidence: round(availabilityConfidence),
    overallEvidenceConfidence: round(overallEvidenceConfidence),
    evidenceUncertainty: round(1 - overallEvidenceConfidence),
    startProbabilityUncertainty: round(startProbabilityUncertainty),
    startProbabilityInterval: {
      lower: round(clamp(startProbability - startProbabilityUncertainty)),
      upper: round(clamp(startProbability + startProbabilityUncertainty))
    },
    roleClass,
    probabilityMethod: "HISTORICAL_PRIOR_WITH_ROLE_EVIDENCE_BLEND" as const,
    intervalMethod: "HEURISTIC_MODEL_UNCERTAINTY_BAND" as const,
    source,
    reasonCodes: [
      source,
      ...(priorAppearance ? ["previous_gameweek_prior"] : []),
      ...(history.length > 0 ? ["current_season_start_update"] : []),
      ...(role?.disagreement ? ["conflicting_role_evidence"] : []),
      ...(!role?.currentEvidencePresent ? ["missing_current_role_evidence"] : []),
      ...((player.minutes ?? 0) === 0 ? ["cohort_minutes_fallback"] : [])
    ]
  };
}

export function probabilisticProjection(input: {
  player: PlayerForEngine;
  rawProjection: PlayerProjection;
  roleEvidence?: RoleEvidenceForProjection;
  history?: ConditionalAppearanceSample[];
  priorAppearance?: AppearanceStateForecast;
  seed?: number;
  sampleCount?: number;
}): ProbabilisticProjection {
  const seed = seedFor(input.seed ?? 120026, input.player.id);
  const sampleCount = input.sampleCount ?? SAMPLE_COUNT;
  const appearance = appearanceForecast(
    input.player,
    input.rawProjection,
    input.roleEvidence,
    input.history,
    input.priorAppearance
  );
  const cohort = cohortFor(input.player, input.rawProjection.expectedMinutes, input.roleEvidence);
  const empirical = empiricalMeans(input.history ?? []);
  const cohortValues = cohortMinutes(input.player.position, cohort, input.rawProjection.expectedMinutes);
  const startMinutesMean = empirical?.startMinutes ?? cohortValues.start;
  const substituteMinutesMean = empirical?.substituteMinutes ?? cohortValues.substitute;
  const conditionalPer90 = input.rawProjection.basePointsPer90 *
    input.rawProjection.fixtureDifficultyFactor * input.rawProjection.formFactor;
  const usesOutputCohort = (input.player.minutes ?? 0) < 700;
  const cohortConditionalStart = cohortStartPoints(input.player, input.rawProjection, startMinutesMean);
  const rawProjectionIfStarting = round(empirical?.startPoints ?? (
    usesOutputCohort ? cohortConditionalStart : conditionalPer90 * startMinutesMean / 90
  ), 1);
  const conditionalSubstitutePoints = round(empirical?.substitutePoints ?? (
    usesOutputCohort
      ? cohortConditionalStart * substituteMinutesMean / Math.max(1, startMinutesMean)
      : conditionalPer90 * substituteMinutesMean / 90
  ), 1);
  const roleAdjustedProjection = appearance.startProbability * rawProjectionIfStarting +
    appearance.subAppearanceProbability * conditionalSubstitutePoints;
  const random = randomGenerator(seed);
  const points: number[] = [];
  const minutes: number[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const state = random();
    if (state < appearance.startProbability) {
      const sampledMinutes = clamp(startMinutesMean + normal(random) * 9, 1, 90);
      minutes.push(sampledMinutes);
      points.push(clamp(rawProjectionIfStarting + normal(random) * Math.max(1.5, Math.abs(rawProjectionIfStarting) * 0.55), -2, 30));
    } else if (state < appearance.appearanceProbability) {
      const sampledMinutes = clamp(substituteMinutesMean + normal(random) * 8, 1, 45);
      minutes.push(sampledMinutes);
      points.push(clamp(conditionalSubstitutePoints + normal(random) * Math.max(0.8, Math.abs(conditionalSubstitutePoints) * 0.7), -2, 15));
    } else {
      minutes.push(0);
      points.push(0);
    }
  }

  const sortedPoints = [...points].sort((a, b) => a - b);
  const sortedMinutes = [...minutes].sort((a, b) => a - b);
  const simulatedMean = points.reduce((sum, value) => sum + value, 0) / points.length;
  const expectedMinutes = appearance.startProbability * startMinutesMean +
    appearance.subAppearanceProbability * substituteMinutesMean;
  const minutesDistribution: MinutesDistribution = {
    expectedMinutes: round(expectedMinutes, 1),
    median: round(quantile(sortedMinutes, 0.5), 1),
    p10: round(quantile(sortedMinutes, 0.1), 1),
    p90: round(quantile(sortedMinutes, 0.9), 1),
    standardDeviation: round(standardDeviation(minutes, expectedMinutes), 2),
    startMinutesMean: round(startMinutesMean, 1),
    substituteMinutesMean: round(substituteMinutesMean, 1),
    sampleSource: empirical ? "empirical" : "cohort",
    cohort
  };
  const projectionStandardDeviation = standardDeviation(points, simulatedMean);

  return {
    playerId: input.player.id,
    appearance,
    minutes: minutesDistribution,
    rawProjectionIfStarting,
    conditionalSubstitutePoints,
    roleAdjustedProjection: round(roleAdjustedProjection, 1),
    median: round(quantile(sortedPoints, 0.5), 1),
    p10: round(quantile(sortedPoints, 0.1), 1),
    p90: round(quantile(sortedPoints, 0.9), 1),
    projectionStandardDeviation: round(projectionStandardDeviation, 2),
    footballOutcomeVariance: round(projectionStandardDeviation ** 2, 2),
    evidenceUncertainty: appearance.evidenceUncertainty,
    featureInputs: [
      { featureId: "base-points-per-90", value: input.rawProjection.basePointsPer90, evidenceIds: ["model:raw-projection"] },
      { featureId: "fixture-difficulty", value: input.rawProjection.fixtureDifficultyFactor, evidenceIds: ["model:raw-projection"] },
      { featureId: "form-factor", value: input.rawProjection.formFactor, evidenceIds: ["model:raw-projection"] },
      { featureId: "availability", value: input.rawProjection.availabilityFactor, evidenceIds: ["model:appearance-state"] },
      { featureId: "start-probability", value: appearance.startProbability, evidenceIds: input.roleEvidence?.evidenceIds ?? ["model:appearance-state"] },
      ...(input.roleEvidence?.currentEvidencePresent ? [{
        featureId: "current-role-support",
        value: input.roleEvidence.supportScore,
        evidenceIds: input.roleEvidence.evidenceIds ?? ["model:current-role"]
      }] : [])
    ],
    model: "appearance-state-mixture",
    modelVersion: "0.0.13",
    inputs: {
      seed,
      sampleCount,
      availabilityFactor: input.rawProjection.availabilityFactor,
      historicalExpectedMinutes: input.rawProjection.expectedMinutes,
      historicalMinutes: input.player.minutes ?? null,
      position: input.player.position,
      price: input.player.price,
      teamStrength: input.player.teamStrength ?? null,
      fixtureDifficultyFactor: input.rawProjection.fixtureDifficultyFactor,
      roleSupportScore: input.roleEvidence?.supportScore ?? null,
      roleEvidenceConfidence: input.roleEvidence?.confidence ?? 0,
      roleCurrentEvidencePresent: input.roleEvidence?.currentEvidencePresent ?? false,
      roleDisagreement: input.roleEvidence?.disagreement ?? false,
      conditionalSampleCount: input.history?.length ?? 0,
      cohort
    }
  };
}

export function buildProjectionUncertaintyReport(input: {
  generatedAt: string;
  gameweek: number;
  players: PlayerForEngine[];
  rawProjections: PlayerProjection[];
  roleEvidence?: RoleEvidenceForProjection[];
  historyByPlayerId?: Map<number, ConditionalAppearanceSample[]>;
  priorAppearanceByPlayerId?: Map<number, AppearanceStateForecast>;
  seed?: number;
  sampleCount?: number;
}): ProjectionUncertaintyReport {
  const seed = input.seed ?? 120026;
  const sampleCount = input.sampleCount ?? SAMPLE_COUNT;
  const rawById = new Map(input.rawProjections.map((projection) => [projection.playerId, projection]));
  const roleById = new Map((input.roleEvidence ?? []).map((role) => [role.playerId, role]));
  const items = input.players.flatMap((player) => {
    const rawProjection = rawById.get(player.id);
    return rawProjection ? [probabilisticProjection({
      player,
      rawProjection,
      roleEvidence: roleById.get(player.id),
      history: input.historyByPlayerId?.get(player.id),
      priorAppearance: input.priorAppearanceByPlayerId?.get(player.id),
      seed,
      sampleCount
    })] : [];
  }).sort((a, b) => b.roleAdjustedProjection - a.roleAdjustedProjection || a.playerId - b.playerId);

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    gameweek: input.gameweek,
    model: "appearance-state-mixture",
    modelVersion: "0.0.13",
    seed,
    sampleCount,
    items,
    warnings: [
      ...(items.some((item) => item.minutes.sampleSource === "cohort")
        ? ["Some players use labeled cohort minutes because empirical conditional samples are insufficient."]
        : []),
      ...(items.some((item) => item.appearance.source !== "current_role")
        ? ["Some players lack current-role evidence; historical or cohort priors remain visible in each item."]
        : [])
    ]
  };
}

export function roleAdjustedPlayerProjections(
  rawProjections: PlayerProjection[],
  report: ProjectionUncertaintyReport
): PlayerProjection[] {
  const adjustedById = new Map(report.items.map((item) => [item.playerId, item]));
  return rawProjections.map((raw) => {
    const adjusted = adjustedById.get(raw.playerId);
    return adjusted ? {
      ...raw,
      projectedPoints: adjusted.roleAdjustedProjection,
      expectedMinutes: adjusted.minutes.expectedMinutes,
      expectedMinutesFactor: round(adjusted.minutes.expectedMinutes / 90, 1),
      rawProjectedPoints: raw.projectedPoints,
      roleAdjustedProjection: adjusted.roleAdjustedProjection,
      startProbability: adjusted.appearance.startProbability,
      appearanceProbability: adjusted.appearance.appearanceProbability
    } : raw;
  }).sort((a, b) => b.projectedPoints - a.projectedPoints || a.playerId - b.playerId);
}

export function renderProjectionUncertaintyMarkdown(report: ProjectionUncertaintyReport) {
  return `# Projection Uncertainty: GW${report.gameweek}\n\nGenerated: ${report.generatedAt}\n\nModel: ${report.model} ${report.modelVersion}\n\nSeed: ${report.seed}\n\n| Player | P(start) | P(sub) | P(no show) | Raw if starting | Role adjusted | p10 | Median | p90 | Evidence confidence | Minutes source |\n| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |\n${report.items.map((item) => `| ${item.playerId} | ${item.appearance.startProbability.toFixed(3)} | ${item.appearance.subAppearanceProbability.toFixed(3)} | ${item.appearance.noAppearanceProbability.toFixed(3)} | ${item.rawProjectionIfStarting.toFixed(1)} | ${item.roleAdjustedProjection.toFixed(1)} | ${item.p10.toFixed(1)} | ${item.median.toFixed(1)} | ${item.p90.toFixed(1)} | ${item.appearance.overallEvidenceConfidence.toFixed(3)} | ${item.minutes.sampleSource}: ${item.minutes.cohort} |`).join("\n")}\n\n## Warnings\n\n${report.warnings.map((warning) => `- ${warning}`).join("\n") || "- None"}\n`;
}
