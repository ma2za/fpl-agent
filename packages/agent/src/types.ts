import type {
  CaptainCandidate,
  ChipRecommendation,
  PlayerForEngine,
  PlayerProjection,
  PickTeamRecommendation,
  TransferCandidate
} from "../../engine/src";
import type { DeadlineStatus } from "../../rules/src";
import type { PlayerForRules, ValidationResult } from "../../rules/src";

export type RecommendedAction = {
  type: "roll" | "transfer" | "hit" | "wildcard" | "free_hit";
  transfers: Array<{
    sellPlayerId: number;
    buyPlayerId: number;
  }>;
  transferCost: number;
  bankAfter: number;
  explanation: string;
};

export type WeeklyRecommendation = {
  gameweek: number;
  createdAt: string;
  deadline: string;
  deadlineStatus: "open" | "passed" | "unknown";
  dataMode: "official" | "provisional";
  squadBefore: {
    players: PlayerForRules[];
    bank: number;
    freeTransfers: number;
    chipsAvailable: Array<"wildcard" | "free_hit" | "bench_boost" | "triple_captain">;
  };
  recommendedAction: RecommendedAction;
  pickTeam: PickTeamRecommendation;
  captaincy: {
    captainPlayerId: number;
    viceCaptainPlayerId: number;
    alternatives: CaptainCandidate[];
    explanation: string;
  };
  chip: ChipRecommendation;
  topTransferCandidates: TransferCandidate[];
  confidence: {
    score: number;
    label: "low" | "medium" | "high";
    explanation: string;
  };
  risks: string[];
  whatWouldChangeMyMind: string[];
  legality: ValidationResult;
  manualExecutionRequired: true;
};

export type RecommendationFiles = {
  recommendation: WeeklyRecommendation;
  projections: PlayerProjection[];
  transferCandidates: TransferCandidate[];
  captainCandidates: CaptainCandidate[];
  legalityReport: ValidationResult;
};

export type DecisionContext = {
  gameweek: number;
  createdAt: string;
  dataMode: "official" | "provisional";
  deadline: string;
  deadlineStatus: DeadlineStatus;
  manualSquadConfigured: boolean;
  currentSquadPlayerIds: number[];
  riskProfile: Record<string, string>;
  notes: {
    fixtures: string;
    teamNews: string;
    setPieces: string;
    watchlist: string;
    strategy: string;
  };
  warnings: string[];
};

export type EvidencePlayer = PlayerForEngine & {
  projectedPoints: number;
};

export type BudgetTier = {
  name: string;
  minPrice: number;
  maxPrice: number;
  players: EvidencePlayer[];
};

export type ClubExposure = {
  teamId: number;
  teamName: string;
  count: number;
  totalPrice: number;
  players: EvidencePlayer[];
};

export type EvidencePack = {
  context: DecisionContext;
  projections: PlayerProjection[];
  playerPool: Record<"GKP" | "DEF" | "MID" | "FWD", EvidencePlayer[]>;
  budgetTiers: BudgetTier[];
  clubExposure: ClubExposure[];
  recommendationTemplate: unknown;
};

export type QualityGateResult = {
  gate: string;
  status: "pass" | "warn" | "fail";
  message: string;
};

export type RecommendationQualityReport = {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  gates: QualityGateResult[];
};

export type FixtureTickerFixture = {
  event: number;
  opponentTeamId: number;
  opponentName: string;
  venue: "H" | "A";
  difficulty: number;
  kickoffTime: string | null;
  finished: boolean;
};

export type FixtureTickerTeam = {
  teamId: number;
  teamName: string;
  shortName: string;
  fixtures: FixtureTickerFixture[];
  fixtureCount: number;
  blankCount: number;
  doubleCount: number;
  averageDifficulty: number | null;
  difficultySum: number;
};

export type FixtureTicker = {
  gameweek: number;
  horizon: number;
  generatedAt: string;
  teams: FixtureTickerTeam[];
};

export type SquadComparison = {
  generatedAt: string;
  a: {
    label: string;
    recommendation: WeeklyRecommendation;
    quality: RecommendationQualityReport;
  };
  b: {
    label: string;
    recommendation: WeeklyRecommendation;
    quality: RecommendationQualityReport;
  };
  sharedPlayerIds: number[];
  onlyAPlayerIds: number[];
  onlyBPlayerIds: number[];
  summary: {
    budgetUsedA: number;
    budgetUsedB: number;
    bankA: number;
    bankB: number;
    projectedPointsA: number;
    projectedPointsB: number;
    captainA: number;
    captainB: number;
    chipA: string;
    chipB: string;
  };
  notes: string[];
};
