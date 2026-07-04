import type { PlayerForRules } from "../../rules/src";

export type RiskLabel = "low" | "medium" | "high";

export type PlayerForEngine = PlayerForRules & {
  chanceOfPlayingNextRound?: number | null;
  expectedPointsNext?: number | null;
  expectedPointsThis?: number | null;
  form?: number | null;
  minutes?: number | null;
  selectedByPercent?: number | null;
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
