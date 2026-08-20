import type { PlayerForRules } from "../../rules/src";

export type RiskLabel = "low" | "medium" | "high";

export type PlayerForEngine = PlayerForRules & {
  chanceOfPlayingNextRound?: number | null;
  expectedPointsNext?: number | null;
  expectedPointsThis?: number | null;
  form?: number | null;
  minutes?: number | null;
  selectedByPercent?: number | null;
  teamStrength?: number | null;
  totalPoints?: number | null;
};

export type ProjectionContext = {
  fixtureDifficultyByTeamId?: Record<number, number>;
};

export type PlayerProjection = {
  playerId: number;
  projectedPoints: number;
  expectedMinutes: number;
  basePointsPer90: number;
  expectedMinutesFactor: number;
  fixtureDifficultyFactor: number;
  availabilityFactor: number;
  formFactor: number;
  rawProjectedPoints?: number;
  roleAdjustedProjection?: number;
  startProbability?: number;
  appearanceProbability?: number;
};

export type AppearanceStateForecast = {
  playerId: number;
  startProbability: number;
  subAppearanceProbability: number;
  noAppearanceProbability: number;
  appearanceProbability: number;
  historicalRoleConfidence: number;
  currentRoleEvidenceConfidence: number;
  availabilityConfidence: number;
  overallEvidenceConfidence: number;
  evidenceUncertainty: number;
  startProbabilityUncertainty?: number;
  startProbabilityInterval?: { lower: number; upper: number };
  roleClass?: "SECURE_STARTER" | "LIKELY_STARTER" | "UNCERTAIN_STARTER" | "ROTATION_OPTION" | "BENCH_OPTION";
  probabilityMethod?: "HISTORICAL_PRIOR_WITH_ROLE_EVIDENCE_BLEND";
  intervalMethod?: "HEURISTIC_MODEL_UNCERTAINTY_BAND";
  source: "current_role" | "historical_role" | "cohort_fallback";
  reasonCodes: string[];
};

export type OptimizationMode = "MAX_EXPECTED_POINTS" | "MAX_EXPECTED_RANK" | "MINI_LEAGUE_DEFEND" | "MINI_LEAGUE_CHASE";

export type ProjectionFeatureAdjustment = {
  featureId: string;
  sourceKind: "current_role" | "set_piece" | "preseason_lineup" | "preseason_output" | "lower_league_output" | "manual_model_input";
  pointsDelta: number;
  standardDeviation: number;
  evidenceIds: string[];
  translationModel: string | null;
};

export type ProjectionScenario = {
  scenarioId: string;
  probability: number;
  projectedPoints: number;
  standardDeviation: number;
  evidenceIds: string[];
};

export type ProjectionScenarioAdjustment = {
  featureId: string;
  probabilityMethod: "EVIDENCE_CONDITIONED_AUTHORED_PRIOR" | "EMPIRICALLY_CALIBRATED_SCENARIO_MODEL";
  scenarios: ProjectionScenario[];
};

export type AdjustedProjection = {
  baseProjection: number;
  adjustedProjection: number;
  baseStandardDeviation: number;
  adjustedStandardDeviation: number;
  adjustments: ProjectionFeatureAdjustment[];
};

export type StructureSimulationCandidate = {
  candidateId: string;
  playerIds: number[];
  benchOrder?: number[];
  captainPlayerId: number | null;
  viceCaptainPlayerId?: number | null;
};

export type StructureSimulationPlayerDistribution = {
  playerId: number;
  mean: number;
  standardDeviation: number;
  appearanceProbability?: number;
  position?: PlayerForEngine["position"];
  teamId?: number;
  price?: number;
  fixtureId?: number;
  opponentTeamId?: number;
};

export type StructureSimulationFixtureDistribution = {
  fixtureId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeExpectedGoals: number;
  awayExpectedGoals: number;
  model: "INDEPENDENT_POISSON_FROM_EXPECTED_GOALS";
  expectedGoalsMethod: "FPL_OVERALL_STRENGTH_HEURISTIC_V1" | "MARKET_IMPLIED_EXPECTED_GOALS";
  confidence: "low" | "medium" | "high";
  evidenceIds: string[];
};

export type StructureSimulationFieldCandidate = StructureSimulationCandidate & { weight: number };

export type StructureSimulationReport = {
  schemaVersion: 1;
  model: "shared-player-monte-carlo";
  modelVersion: "0.0.17" | "0.0.18";
  mode: OptimizationMode;
  seed: number;
  sampleCount: number;
  results: Array<{
    candidateId: string;
    expectedPoints: number;
    p10: number;
    p50: number;
    p90: number;
    expectedRankUtility: number | null;
    objectiveScore: number;
    expectedPointsBreakdown?: {
      startingXI: number;
      captainBonus: number;
      expectedAutosubs: number;
      viceCaptainFallback: number;
      total: number;
    };
  }>;
  objectiveDefinition?: {
    captainDoubling: boolean;
    viceCaptainFallback: boolean;
    automaticSubstitutions: boolean;
    formationLegalityAfterSubstitutions: boolean;
    goalkeeperSubstitution: boolean;
    appearanceProbabilities: boolean;
    scoringVariance: boolean;
    correlatedMatchStates: boolean;
  };
  searchScope?: {
    generator: "manual" | "deterministic-branch-and-bound" | "highs-milp-k-best";
    exhaustive: boolean;
    deterministicSearchExhaustive?: boolean;
    legalSquadsEvaluatedDeterministically?: number;
    solutionsProvenOptimal?: number;
    playerUniverseSize: number;
    candidatesGenerated: number;
    candidatesSimulated: number;
  };
  assumptions: string[];
  decisionPolicy: string;
};

export type DecisionMargin = {
  playerId: number;
  rivalCandidateId: string;
  currentMean: number;
  breakEvenMean: number | null;
  margin: number | null;
  pointsPerMeanPoint: number;
  method: "COMMON_RANDOM_NUMBERS_FINITE_DIFFERENCE";
};

export type DecisionMarginReport = {
  schemaVersion: 1;
  modelVersion: "0.0.18";
  selectedCandidateId: string;
  rivalCandidateId: string;
  baseObjectiveMargin: number;
  perturbationStep: number;
  margins: DecisionMargin[];
};

export type MinutesDistribution = {
  expectedMinutes: number;
  median: number;
  p10: number;
  p90: number;
  standardDeviation: number;
  startMinutesMean: number;
  substituteMinutesMean: number;
  sampleSource: "empirical" | "cohort";
  cohort: string;
};

export type ConditionalAppearanceSample = {
  started: boolean;
  minutes: number;
  points: number;
};

export type RoleEvidenceForProjection = {
  playerId: number;
  supportScore: number;
  confidence: number;
  currentEvidencePresent: boolean;
  manualOverride: "supports_start" | "opposes_start" | null;
  disagreement: boolean;
  evidenceIds?: string[];
};

export type ProjectionModelInputs = {
  seed: number;
  sampleCount: number;
  availabilityFactor: number;
  historicalExpectedMinutes: number;
  historicalMinutes: number | null;
  position: PlayerForEngine["position"];
  price: number;
  teamStrength: number | null;
  fixtureDifficultyFactor: number;
  roleSupportScore: number | null;
  roleEvidenceConfidence: number;
  roleCurrentEvidencePresent: boolean;
  roleDisagreement: boolean;
  conditionalSampleCount: number;
  cohort: string;
};

export type ProbabilisticProjection = {
  playerId: number;
  appearance: AppearanceStateForecast;
  minutes: MinutesDistribution;
  rawProjectionIfStarting: number;
  conditionalSubstitutePoints: number;
  roleAdjustedProjection: number;
  median: number;
  p10: number;
  p90: number;
  projectionStandardDeviation: number;
  footballOutcomeVariance: number;
  evidenceUncertainty: number;
  featureInputs?: Array<{
    featureId: string;
    value: number | string | boolean;
    evidenceIds: string[];
  }>;
  model: "appearance-state-mixture";
  modelVersion: "0.0.12";
  inputs: ProjectionModelInputs;
};

export type ProjectionUncertaintyReport = {
  schemaVersion: 1;
  generatedAt: string;
  gameweek: number;
  model: "appearance-state-mixture";
  modelVersion: "0.0.12";
  seed: number;
  sampleCount: number;
  items: ProbabilisticProjection[];
  warnings: string[];
};

export type SquadUtilityVector = {
  rawStartingXIProjection: number;
  roleAdjustedStartingXIProjection: number;
  roleAdjustedWithAutosubs: number;
  expectedStarters: number;
  expectedAppearances: number;
  unresolvedRoleCount: number;
  p10: number;
  median: number;
  p90: number;
  standardDeviation: number;
  probabilityBelowThresholds: Array<{ threshold: number; probability: number }>;
};

export type SubstitutionUtilityReport = {
  benchCost: number;
  expectedAutosubValue: number;
  goalkeeper: {
    playerId: number;
    cost: number;
    appearanceProbability: number;
    activationProbability: number;
    marginalValue: number;
  };
  benchSlots: Array<{
    slot: 1 | 2 | 3;
    playerId: number;
    position: PlayerForEngine["position"];
    cost: number;
    appearanceProbability: number;
    activationProbability: number;
    marginalValue: number;
    canReplacePositions: PlayerForEngine["position"][];
  }>;
};

export type RobustnessReport = {
  schemaVersion: 1;
  generatedAt: string;
  gameweek: number;
  model: "independent-appearance-squad-utility";
  modelVersion: "0.0.13";
  seed: number;
  sampleCount: number;
  thresholds: number[];
  utility: SquadUtilityVector;
  substitutions: SubstitutionUtilityReport;
  assumptions: string[];
};

export type DraftDeltaReport = {
  schemaVersion: 1;
  generatedAt: string;
  previousLabel: string;
  currentLabel: string;
  deltas: {
    rawProjection: number;
    roleAdjustedProjection: number;
    expectedStarters: number;
    autosubValue: number;
    downsideP10: number;
    benchCost: number;
  };
  supportedRobustnessMetrics: string[];
};

export type CaptainCandidate = {
  playerId: number;
  projectedPoints: number;
  expectedMinutes: number;
  fixtureSummary: string;
  risk: RiskLabel;
  upsideCase: string;
  downsideCase: string;
};

export type PickTeamRecommendation = {
  formation: string;
  startingXI: number[];
  benchOrder: number[];
  projectedPoints: number;
  explanation: string;
};

export type ChipRecommendation = {
  chip: "none" | "wildcard" | "free_hit" | "bench_boost" | "triple_captain";
  confidence: "low" | "medium" | "high";
  expectedGain: number;
  reasons: string[];
  warnings: string[];
};

export type TransferCandidate = {
  id: string;
  type: "roll" | "transfer" | "hit" | "wildcard" | "free_hit";
  moves: Array<{
    sellPlayerId: number;
    buyPlayerId: number;
  }>;
  transferCost: number;
  expectedGain1GW: number;
  expectedGain3GW: number;
  expectedGain5GW: number;
  risk: RiskLabel;
  reasons: string[];
  concerns: string[];
  isLegal: boolean;
  legalityErrors: string[];
};
