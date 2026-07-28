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

export type RecommendationEvidenceArea =
  | "squad"
  | "starting-xi"
  | "shortlist"
  | "transfers"
  | "captaincy"
  | "bench"
  | "chip"
  | "risks"
  | "change-conditions";

export type RecommendationEvidenceReference = {
  area: RecommendationEvidenceArea;
  source: string;
  reportPath: string;
  note: string;
  playerIds?: number[];
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
  evidenceReferences: RecommendationEvidenceReference[];
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
    strategyEvidence: string;
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

export type EvidenceConfidence = "low" | "medium" | "high";

export type EvidenceFreshness = {
  status: "fresh" | "stale" | "missing";
  checkedAt: string;
  fetchedAt: string | null;
  ageHours: number | null;
  maxAgeHours: number;
  message: string;
};

export type EvidenceSource = {
  id: string;
  label: string;
  provider: string;
  url: string | null;
  rawPath: string | null;
  reportPath: string | null;
  required: boolean;
  confidence: EvidenceConfidence;
  freshness: EvidenceFreshness;
};

export type EvidenceItem = {
  sourceId: string;
  area: string;
  subject: string;
  severity: "info" | "watch" | "risk" | "missing";
  summary: string;
  confidence: EvidenceConfidence;
  fetchedAt: string | null;
  url: string | null;
};

export type EvidenceReport = {
  generatedAt: string;
  gameweek: number;
  summary: {
    fresh: number;
    stale: number;
    missing: number;
    requiredMissing: number;
    requiredStale: number;
  };
  sources: EvidenceSource[];
  items: EvidenceItem[];
  warnings: string[];
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

export type SeasonStrategy = {
  status: "agent_authored";
  riskProfile: "conservative" | "balanced" | "aggressive";
  squadSource: "from_scratch" | "manual_config" | "manager_id";
  agentRole: "agent_decides" | "evidence_only" | "compare_options";
  windows: Array<{
    gameweeks: string;
    focus: string;
  }>;
  chipPosture: string;
  transferDiscipline: string;
  captaincyPolicy: string;
  squadBuildingPrinciples: string[];
};

export type WeeklyStrategy = {
  gameweek: number;
  status: "agent_authored" | "agent_decision_required";
  riskProfile: "conservative" | "balanced" | "aggressive";
  squadSource: "from_scratch" | "manual_config" | "manager_id";
  weeklyThesis: string;
  horizons: {
    oneGameweek: string;
    threeGameweeks: string;
    sixGameweeks: string;
  };
  transferPlan: {
    posture: "roll" | "free_transfer" | "hit" | "wildcard" | "free_hit";
    rationale: string;
    followsRiskProfile: boolean;
  };
  captaincyPlan: {
    primaryProfile: string;
    rationale: string;
  };
  chipPlan: {
    chip: "none" | "wildcard" | "free_hit" | "bench_boost" | "triple_captain";
    rationale: string;
    referencesSeasonPosture: boolean;
  };
  risks: string[];
  whatWouldChangeMyMind: string[];
};

export type StrategyEvidence = {
  gameweek: number;
  createdAt: string;
  dataMode: "official" | "provisional";
  deadline: string;
  deadlineStatus: DeadlineStatus;
  riskProfile: Record<string, string>;
  seasonPlanExists: boolean;
  weeklyStrategyExists: boolean;
  horizonSummary: {
    oneGameweek: string[];
    threeGameweeks: string[];
    sixGameweeks: string[];
  };
  prompts: string[];
  warnings: string[];
};

export type StrategyQualityReport = {
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
    riskSummary: SquadRiskReport["summary"];
  };
  b: {
    label: string;
    recommendation: WeeklyRecommendation;
    quality: RecommendationQualityReport;
    riskSummary: SquadRiskReport["summary"];
  };
  sharedPlayerIds: number[];
  onlyAPlayerIds: number[];
  onlyBPlayerIds: number[];
  positionChanges: Record<"GKP" | "DEF" | "MID" | "FWD", {
    onlyAPlayerIds: number[];
    onlyBPlayerIds: number[];
  }>;
  summary: {
    budgetUsedA: number;
    budgetUsedB: number;
    bankA: number;
    bankB: number;
    budgetDelta: number;
    bankDelta: number;
    projectedPointsA: number;
    projectedPointsB: number;
    projectedPointsDelta: number;
    captainA: number;
    captainB: number;
    chipA: string;
    chipB: string;
    outfieldBenchPlayableA: number;
    outfieldBenchPlayableB: number;
    outfieldBenchPlayableDelta: number;
  };
  notes: string[];
};

export type RiskLevel = "low" | "medium" | "high";

export type PlayerRisk = {
  playerId: number;
  name: string;
  position: string;
  teamId: number;
  level: RiskLevel;
  starting: boolean;
  benchPosition: number | null;
  reasons: string[];
};

export type StructureRisk = {
  risk: string;
  level: RiskLevel;
  message: string;
};

export type EvidenceGap = {
  area: string;
  status: "reviewed" | "missing";
  message: string;
};

export type SquadRiskReport = {
  generatedAt: string;
  gameweek: number;
  dataMode: "official" | "provisional";
  summary: {
    high: number;
    medium: number;
    low: number;
    evidenceGaps: number;
  };
  playerRisks: PlayerRisk[];
  structureRisks: StructureRisk[];
  evidenceGaps: EvidenceGap[];
  notes: string[];
};

export type TeamNewsSeverity = "info" | "watch" | "risk" | "avoid";

export type TeamNewsItem = {
  playerId: number;
  name: string;
  webName: string;
  teamId: number;
  teamName: string;
  position: string;
  status: string;
  chanceOfPlayingNextRound: number | null;
  chanceOfPlayingThisRound: number | null;
  news: string;
  newsAdded: string | null;
  severity: TeamNewsSeverity;
  selected: boolean;
  summary: string;
};

export type TeamNewsReport = {
  generatedAt: string;
  gameweek: number;
  source: EvidenceSource;
  summary: {
    flaggedPlayers: number;
    selectedFlaggedPlayers: number;
    info: number;
    watch: number;
    risk: number;
    avoid: number;
  };
  items: TeamNewsItem[];
  warnings: string[];
};

export type SetPieceRole = "penalties" | "direct-free-kicks" | "corners-and-indirect-free-kicks";

export type SetPieceItem = {
  playerId: number;
  name: string;
  webName: string;
  teamId: number;
  teamName: string;
  position: string;
  role: SetPieceRole;
  order: number;
  selected: boolean;
  status: string;
  confidence: EvidenceConfidence;
  summary: string;
};

export type SetPieceReport = {
  generatedAt: string;
  gameweek: number;
  source: EvidenceSource;
  summary: {
    rolePlayers: number;
    selectedRolePlayers: number;
    penaltyTakers: number;
    directFreeKickTakers: number;
    cornerAndIndirectFreeKickTakers: number;
  };
  items: SetPieceItem[];
  warnings: string[];
};

export type OddsSignal = "high" | "medium" | "low" | "unknown";

export type OddsMatchSignal = {
  fixtureId: number;
  event: number;
  kickoffTime: string | null;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  sourceHomeTeam: string;
  sourceAwayTeam: string;
  averageHomeOdds: number | null;
  averageDrawOdds: number | null;
  averageAwayOdds: number | null;
  over25Odds: number | null;
  under25Odds: number | null;
  homeWinProbability: number | null;
  drawProbability: number | null;
  awayWinProbability: number | null;
  over25Probability: number | null;
  under25Probability: number | null;
};

export type OddsTeamSignal = {
  teamId: number;
  teamName: string;
  fixtureId: number;
  event: number;
  opponentTeamId: number;
  opponentName: string;
  venue: "H" | "A";
  winProbability: number | null;
  drawProbability: number | null;
  lossProbability: number | null;
  over25Probability: number | null;
  under25Probability: number | null;
  attackSignal: OddsSignal;
  cleanSheetSignal: OddsSignal;
  selectedPlayerIds: number[];
  summary: string;
};

export type OddsReport = {
  generatedAt: string;
  gameweek: number;
  source: EvidenceSource;
  summary: {
    sourceRows: number;
    premierLeagueRows: number;
    gameweekFixtures: number;
    matchedFixtures: number;
    unmatchedFixtures: number;
    selectedTeamsCovered: number;
  };
  matches: OddsMatchSignal[];
  teamSignals: OddsTeamSignal[];
  warnings: string[];
};
