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
  source: "current_role" | "historical_role" | "cohort_fallback";
  reasonCodes: string[];
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
