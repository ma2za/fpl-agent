import type {
  CaptainCandidate,
  ChipRecommendation,
  PlayerForEngine,
  PlayerProjection,
  PickTeamRecommendation,
  TransferCandidate
} from "../../engine/src";
import type {
  CompetitionAction,
  CompetitionPhase,
  CompetitionState,
  DeadlineStatus
} from "../../rules/src";
import type { PlayerForRules, ValidationResult } from "../../rules/src";

export type RecommendedAction = {
  type: CompetitionAction;
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
  | "structure"
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

export type PlayerPublicNewsArticle = {
  playerId: number;
  publisher: string;
  title: string;
  url: string;
  publishedAt: string;
  retrievedAt: string;
};

export type EvidenceSnapshotComponentKind =
  | "bootstrap"
  | "fixtures"
  | "prices"
  | "availability"
  | "ownership"
  | "team_news"
  | "predicted_lineups"
  | "set_pieces"
  | "betting_markets"
  | "projection_model"
  | "appearance_model"
  | "manual_overrides";

export type EvidenceSnapshot = {
  snapshotId: string;
  createdAt: string;
  components: Array<{
    kind: EvidenceSnapshotComponentKind;
    status: "available" | "missing" | "not_applicable";
    sourceId: string | null;
    version: string | null;
    observedAt: string | null;
    retrievedAt: string | null;
    contentHash: string | null;
    coverageStatus?: "usable" | "partial" | "no_matching_rows" | "missing" | "not_applicable";
    matchedRecordCount?: number | null;
  }>;
};

export type DecisionType =
  | "squad"
  | "structure"
  | "starting_xi"
  | "bench_order"
  | "captaincy"
  | "transfers"
  | "chip";

export type DecisionCandidateScore = {
  candidateId: string;
  rawExpectedPoints: number | null;
  objectiveScore: number;
  eligible: boolean;
  ineligibilityReasons: string[];
  lowerBound: number | null;
  upperBound: number | null;
  metrics?: Record<string, number>;
  scoreComponents?: Array<{
    name: string;
    value: number;
    evidenceIds: string[];
  }>;
  state?: {
    playerIds: number[];
    squadCost: number;
    clubCounts: Array<{ teamId: number; count: number }>;
  };
};

export type DecisionEvaluation = {
  decisionId: string;
  decisionType: DecisionType;
  snapshotId: string;
  objectiveId: string;
  objectiveMetric: "raw_expected_points" | "risk_adjusted_utility" | "structural_utility" | "rules_utility";
  horizon: "GW1" | "GW1-3" | "GW1-5" | "GW1-6" | "structural";
  candidateScores: DecisionCandidateScore[];
  selectedCandidateId: string;
  selectedBy: "objective_score" | "explicit_override";
  overrideReason: string | null;
  constraintsApplied: string[];
  riskAdjustments: string[];
  uncertainty: string;
  tieBreakersApplied: string[];
  evidenceIds: string[];
};

export type CanonicalDecisionState = {
  snapshotId: string;
  floatingPointTolerance: number;
  displayedProjectionScope: "uncaptained" | "captained";
  squadCost: number;
  clubCounts: Array<{ teamId: number; count: number }>;
  positionCounts: { GKP: number; DEF: number; MID: number; FWD: number };
  playerProjections: Array<{
    playerId: number;
    projectedPoints: number;
    startProbability?: number;
    appearanceProbability?: number;
  }>;
  uncaptainedXIProjection: number;
  captainMarginalProjection: number;
  captainedTeamProjection: number;
};

export type DeterministicFactualClaim = {
  id: string;
  decisionId: string;
  snapshotId: string;
  kind: "club_count" | "squad_cost" | "player_price" | "projection_score" | "projection_ranking" | "transfer_count" | "formation" | "captaincy" | "fixture" | "start_probability" | "appearance_probability" | "ownership" | "role" | "set_piece" | "source_fact";
  statement: string;
  candidateId: string | null;
  subjectId: string | null;
  value: string | number | boolean;
  dependencyIds: string[];
  validation: {
    status: "validated" | "rejected";
    method: string;
  };
};

export type MaterialRiskPolicy = {
  startProbabilityThreshold: number;
  selectedStarterCoverage: Array<{
    playerId: number;
    resolution: "change_condition" | "explicit_coverage_reason" | "risk_waiver";
    statement: string;
  }>;
};

export type OptimizationPolicy = {
  mode: "MAX_EXPECTED_POINTS" | "MAX_EXPECTED_RANK" | "MINI_LEAGUE_DEFEND" | "MINI_LEAGUE_CHASE";
  horizon: "GW1" | "GW1-3" | "GW1-5" | "GW1-6" | "season";
  ownershipTreatment: "excluded" | "simulated_field_distribution";
  structureSimulationReportPath: string;
  rankSimulationReportPath: string | null;
  candidateSearch?: {
    generator: "manual" | "deterministic-branch-and-bound" | "highs-milp-k-best";
    exhaustive: boolean;
    playerUniverseSize: number;
    candidatesGenerated: number;
    candidatesSimulated: number;
  };
  projectionAdjustments: Array<{
    playerId: number;
    baseProjection: number;
    adjustedProjection: number;
    features: Array<{
      featureId: string;
      sourceKind: "current_role" | "set_piece" | "preseason_lineup" | "preseason_output" | "lower_league_output" | "manual_model_input";
      pointsDelta: number;
      standardDeviation: number;
      evidenceIds: string[];
      translationModel: string | null;
    }>;
  }>;
  projectionScenarioAdjustments?: Array<{
    playerId: number;
    featureId: string;
    probabilityMethod: "EVIDENCE_CONDITIONED_AUTHORED_PRIOR" | "EMPIRICALLY_CALIBRATED_SCENARIO_MODEL";
    scenarios: Array<{
      scenarioId: string;
      probability: number;
      projectedPoints: number;
      standardDeviation: number;
      evidenceIds: string[];
    }>;
  }>;
};

export type ComparedAlternative = {
  playerId?: number;
  name: string;
  whyNot: string[];
};

export type PlayerDecisionAnalysis = {
  playerId: number;
  role: "starter" | "bench" | "squad";
  whyPicked: string[];
  comparedAgainst: ComparedAlternative[];
  evidence: string[];
};

export type CaptaincyDecisionAnalysis = {
  captainPlayerId: number;
  whyCaptain: string[];
  comparedAgainst: ComparedAlternative[];
  evidence: string[];
};

export type OmittedPlayerAnalysis = {
  playerId?: number;
  name: string;
  whyOmitted: string[];
  wouldReconsiderIf: string[];
  evidence: string[];
};

export type StructureDecisionAnalysis = {
  selectedStructure: string;
  rejectedStructure: string;
  material?: boolean;
  counterfactualCandidateIds?: string[];
  whySelected: string[];
  whyRejected: string[];
  evidence: string[];
};

export type DecisionAnalysis = {
  summary: string;
  squadStructure: string[];
  structureComparisons: StructureDecisionAnalysis[];
  playerDecisions: PlayerDecisionAnalysis[];
  captaincy: CaptaincyDecisionAnalysis;
  keyOmissions: OmittedPlayerAnalysis[];
};

export type WeeklyRecommendation = {
  schemaVersion?: 1 | 2;
  artifactKind?: "agent_decision";
  authorship?: {
    kind: "coding_agent";
    agent: string;
    authoredAt: string;
  };
  decisionContext?: CompetitionState;
  claimLedger?: ClaimLedger;
  decisionIds?: string[];
  evidenceSnapshot?: EvidenceSnapshot;
  decisionEvaluations?: DecisionEvaluation[];
  canonicalState?: CanonicalDecisionState;
  factualClaims?: DeterministicFactualClaim[];
  materialRiskPolicy?: MaterialRiskPolicy;
  optimizationPolicy?: OptimizationPolicy;
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
  decisionAnalysis?: DecisionAnalysis;
  evidenceReferences: RecommendationEvidenceReference[];
  publicNewsArticles?: PlayerPublicNewsArticle[];
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
  competitionState: CompetitionState;
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
  rawProjectedPoints?: number;
  roleAdjustedProjection?: number;
  startProbability?: number;
  appearanceProbability?: number;
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

export type ToolEvidenceArtifact = {
  schemaVersion: 2;
  artifactKind: "tool_evidence";
  generatedAt: string;
  tool: string;
  payload: unknown;
};

export type CandidateArtifact = {
  schemaVersion: 2;
  artifactKind: "candidate";
  generatedAt: string;
  scenarioId: string;
  payload: unknown;
};

export type ClaimSourceType = "official" | "club" | "media" | "market" | "manual";

export type ClaimLedgerSource = {
  id: string;
  publisher: string;
  sourceType: ClaimSourceType;
  uri: string | null;
};

export type ClaimObservation = {
  id: string;
  sourceId: string;
  claim: string;
  observedAt: string;
  retrievedAt: string;
  reliability: number;
  freshness: "fresh" | "stale" | "unknown";
  value: unknown;
  snapshotId?: string;
  kind?: "OBSERVATION";
  isSourceQuote?: boolean;
};

export type ClaimFact = {
  id: string;
  claim: string;
  observationIds: string[];
  transformationId?: string;
  kind?: "DERIVED_FACT";
};

export type ClaimAssumption = {
  id: string;
  claim: string;
  factIds: string[];
  model: string;
  modelVersion: string;
  kind?: "ASSUMPTION";
};

export type ForecastClaim = {
  id: string;
  kind: "FORECAST";
  claim: string;
  model: string;
  modelVersion: string;
  inputFactIds: string[];
  inputAssumptionIds: string[];
  outputValue: unknown;
  uncertainty: string;
  horizon: string;
  snapshotId?: string;
};

export type ClaimTransformation = {
  id: string;
  tool: string;
  toolVersion: string;
  reportPath: string;
  inputIds: string[];
  outputFactIds: string[];
};

export type ClaimDecision = {
  id: string;
  area: RecommendationEvidenceArea;
  factIds: string[];
  assumptionIds: string[];
  kind?: "DECISION";
  claim?: string;
  forecastIds?: string[];
};

export type LegacyClaimLedger = {
  schemaVersion: 1 | 2;
  sources: ClaimLedgerSource[];
  observations: ClaimObservation[];
  facts: ClaimFact[];
  assumptions: ClaimAssumption[];
  transformations: ClaimTransformation[];
  decisions: ClaimDecision[];
};

export type ClaimLedgerV3 = {
  schemaVersion: 3;
  sources: ClaimLedgerSource[];
  observations: Array<ClaimObservation & { kind: "OBSERVATION" }>;
  facts: Array<ClaimFact & { kind: "DERIVED_FACT"; transformationId: string }>;
  assumptions: Array<ClaimAssumption & { kind: "ASSUMPTION" }>;
  forecasts: ForecastClaim[];
  transformations: ClaimTransformation[];
  decisions: Array<ClaimDecision & {
    kind: "DECISION";
    claim: string;
    forecastIds: string[];
  }>;
};

export type ClaimLedger = LegacyClaimLedger | ClaimLedgerV3;

export type EpistemicClaim =
  | ClaimLedgerV3["observations"][number]
  | ClaimLedgerV3["facts"][number]
  | ClaimLedgerV3["assumptions"][number]
  | ForecastClaim
  | ClaimLedgerV3["decisions"][number];

export type LanguageValidationFinding = {
  claimId: string;
  phrase: string;
  rule: string;
  severity: "error" | "warning";
  suggestedClaimKind: EpistemicClaim["kind"];
};

export type LanguageValidationReport = {
  schemaVersion: 1;
  phase: CompetitionPhase;
  isValid: boolean;
  findings: LanguageValidationFinding[];
};

export type PhaseStatementPolicy = {
  phase: CompetitionPhase;
  prohibitedWarningPatterns: RegExp[];
  validFlexibilityStatements: string[];
};

export type ClaimIndependence = {
  claim: string;
  publishers: string[];
  independentSourceCount: number;
};

export type ClaimLedgerValidation = {
  isValid: boolean;
  errors: string[];
  independence: ClaimIndependence[];
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

export type PublicEvidenceArea = "fixtures" | "team-news" | "predicted-lineups" | "player-news" | "prices" | "general-news";

export type PublicEvidenceSourceConfig = {
  id: string;
  label: string;
  provider: string;
  url: string;
  area: PublicEvidenceArea;
  required: boolean;
  confidence: EvidenceConfidence;
};

export type PublicEvidenceCaptureMode = "playwright" | "fetch" | "failed";

export type PublicEvidencePage = {
  sourceId: string;
  label: string;
  provider: string;
  url: string;
  area: PublicEvidenceArea;
  capturedAt: string;
  captureMode: PublicEvidenceCaptureMode;
  title: string | null;
  textExcerpt: string;
  wordCount: number;
  rawPath: string | null;
  error: string | null;
  confidence: EvidenceConfidence;
};

export type PublicEvidenceSignal = {
  sourceId: string;
  area: PublicEvidenceArea;
  severity: "info" | "watch" | "risk" | "missing";
  subject: string;
  summary: string;
  url: string;
  confidence: EvidenceConfidence;
};

export type PublicEvidenceReport = {
  generatedAt: string;
  gameweek: number;
  summary: {
    configuredSources: number;
    capturedPages: number;
    failedPages: number;
    playwrightPages: number;
    fetchPages: number;
    signals: number;
  };
  pages: PublicEvidencePage[];
  signals: PublicEvidenceSignal[];
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

export type FixtureHorizonConfidence = "low" | "medium" | "high";
export type FixtureHorizonCoverage = "complete" | "partial" | "missing";
export type FixtureHorizonLabel = "favorable" | "neutral" | "difficult" | "blank" | "unavailable";

export type FixtureDifficultyEvidence = {
  value: number;
  rawValue: number;
  source: "fpl-team-strength" | "fpl-overall-strength-fallback" | "fpl-fixture-difficulty-fallback";
  confidence: FixtureHorizonConfidence;
};

export type FixtureHorizonFixture = {
  fixtureId: number;
  event: number;
  opponentTeamId: number;
  opponentName: string;
  venue: "H" | "A";
  kickoffTime: string | null;
  state: "scheduled" | "finished" | "unresolved";
  rawDifficulty: number;
  attackDifficulty: FixtureDifficultyEvidence;
  defenceDifficulty: FixtureDifficultyEvidence;
  restDaysBefore: number | null;
  restDaysAfter: number | null;
  shortRest: boolean;
};

export type FixtureHorizonMetric = {
  averageDifficulty: number | null;
  label: FixtureHorizonLabel;
  confidence: FixtureHorizonConfidence;
  coverage: FixtureHorizonCoverage;
};

export type TeamFixtureHorizon = {
  gameweeks: 1 | 3 | 6;
  startGameweek: number;
  endGameweek: number;
  fixtures: FixtureHorizonFixture[];
  fixtureCount: number;
  blankGameweeks: number[];
  doubleGameweeks: number[];
  unresolvedFixtureCount: number;
  shortRestCount: number;
  attack: FixtureHorizonMetric;
  defence: FixtureHorizonMetric;
};

export type FixtureHorizonTeam = {
  teamId: number;
  teamName: string;
  shortName: string;
  horizons: TeamFixtureHorizon[];
  unresolvedFixtures: Array<{
    fixtureId: number;
    opponentTeamId: number;
    opponentName: string;
    kickoffTime: string | null;
    reason: "event-unassigned" | "kickoff-missing";
  }>;
  swing: {
    attack: "in" | "out" | "stable" | "unavailable";
    attackChange: number | null;
    defence: "in" | "out" | "stable" | "unavailable";
    defenceChange: number | null;
  };
};

export type FixtureExposureInput = {
  label: string;
  kind: "configured" | "primary" | "variant";
  players: Array<{
    playerId: number;
    teamId: number;
    position: "GKP" | "DEF" | "MID" | "FWD";
  }>;
};

export type FixtureHorizonExposure = {
  label: string;
  kind: "configured" | "primary" | "variant";
  playerCount: number;
  positionCounts: Record<"GKP" | "DEF" | "MID" | "FWD", number>;
  horizons: Array<{
    gameweeks: 1 | 3 | 6;
    attackAverage: number | null;
    defenceAverage: number | null;
    coverage: FixtureHorizonCoverage;
  }>;
};

export type FixtureHorizonReport = {
  schemaVersion?: 1;
  generatedAt: string;
  gameweek: number;
  source: {
    provider: "Fantasy Premier League public API";
    fixturesUrl: string;
    teamsUrl: string;
    schedulePolicy: "fpl-primary-no-silent-merge";
  };
  thresholds: {
    favorableMaximum: 2.5;
    difficultMinimum: 3.5;
    swingMinimum: 0.75;
    shortRestMaximumDays: 3;
  };
  teams: FixtureHorizonTeam[];
  exposures: FixtureHorizonExposure[];
  warnings: string[];
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
export type OddsSignalSource = "direct" | "derived" | "unavailable";
export type OddsCoverageStatus = "covered" | "partial" | "missing";

export type OddsMarketCoverage = {
  matchOdds: OddsCoverageStatus;
  overUnder: OddsCoverageStatus;
  cleanSheet: OddsCoverageStatus;
  anytimeScorer: OddsCoverageStatus;
  teamGoals: OddsCoverageStatus;
};

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
  homeCleanSheetProbability: number | null;
  awayCleanSheetProbability: number | null;
  homeTeamGoalsExpected: number | null;
  awayTeamGoalsExpected: number | null;
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
  cleanSheetProbability: number | null;
  teamGoalsExpected: number | null;
  attackSignal: OddsSignal;
  cleanSheetSignal: OddsSignal;
  attackSignalSource: OddsSignalSource;
  cleanSheetSignalSource: OddsSignalSource;
  selectedPlayerIds: number[];
  summary: string;
};

export type OddsPlayerSignal = {
  playerId: number | null;
  playerName: string;
  teamId: number | null;
  teamName: string;
  market: "anytime-scorer";
  probability: number;
  selected: boolean;
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
    coverageStatus: OddsCoverageStatus;
    marketCoverage: OddsMarketCoverage;
  };
  matches: OddsMatchSignal[];
  teamSignals: OddsTeamSignal[];
  playerSignals: OddsPlayerSignal[];
  warnings: string[];
};

export type MinutesRiskLevel = "secure" | "watch" | "risky" | "unknown";

export type MinutesRiskItem = {
  playerId: number;
  name: string;
  webName: string;
  teamId: number;
  teamName: string;
  position: string;
  status: string;
  minutes: number | null;
  selected: boolean;
  starting: boolean;
  benchPosition: number | null;
  historicalConfidence: EvidenceConfidence;
  predictedLineupConfidence: EvidenceConfidence | "unavailable";
  riskLevel: MinutesRiskLevel;
  reasons: string[];
  summary: string;
};

export type MinutesRiskReport = {
  generatedAt: string;
  gameweek: number;
  source: EvidenceSource;
  summary: {
    playersReviewed: number;
    selectedPlayers: number;
    selectedStarters: number;
    secure: number;
    watch: number;
    risky: number;
    unknown: number;
    selectedWatchOrWorse: number;
    starterWatchOrWorse: number;
  };
  items: MinutesRiskItem[];
  warnings: string[];
};

export type RoleEvidenceAdapterKind =
  | "official_availability"
  | "manager_confirmation"
  | "official_club"
  | "preseason_lineup"
  | "predicted_lineup"
  | "substitution_events"
  | "transfer_reporting"
  | "bookmaker_market"
  | "reviewed_manual";

export type RoleEvidenceDimension =
  | "historical_availability"
  | "historical_starts"
  | "current_manager_preference"
  | "preseason_start_rate"
  | "predicted_lineup_consensus"
  | "injury_status"
  | "squad_competition"
  | "transfer_risk"
  | "substitution_patterns"
  | "set_piece_roles";

export type RoleAssessmentDimension =
  | "historicalRole"
  | "currentManagerPreference"
  | "preseasonUsage"
  | "predictedLineupConsensus"
  | "availability"
  | "squadCompetition"
  | "transferRisk"
  | "setPieceRole";

export type RootEvidenceSourceKind =
  | "club_press_conference"
  | "official_injury_update"
  | "manager_comment"
  | "preseason_lineup"
  | "substitution_event"
  | "predicted_lineup"
  | "transfer_report"
  | "bookmaker_market"
  | "official_fpl";

export type RootEvidenceSource = {
  id: string;
  publisher: string;
  sourceType: "official" | "club" | "media" | "market";
  sourceKind: RootEvidenceSourceKind;
  canonicalUrl: string;
  reliability: number;
  credibilityRationale: string;
};

export type RoleObservation = {
  id: string;
  adapterId: string;
  playerId: number;
  dimension: RoleEvidenceDimension;
  signal: "supports_start" | "opposes_start" | "neutral";
  sourceIds: string[];
  underlyingClaimId: string;
  publishedAt: string | null;
  retrievedAt: string;
  observedAt: string;
  capturedExcerpt: string | null;
  structuredValue: string | number | boolean | null;
  adapterVersion: string;
  contentHash: string;
  credibility: {
    score: number;
    label: "low" | "medium" | "high";
    rationale: string;
  };
  relevance: {
    score: number;
    rationale: string;
  };
  override?: boolean;
  note: string;
};

export type RoleEvidenceAdapterConfig = {
  id: string;
  kind: RoleEvidenceAdapterKind;
  provider: string;
  url: string | null;
  enabled: boolean;
  reliability: number;
};

export type RoleEvidenceRecord = {
  playerId: number;
  dimension: RoleEvidenceDimension;
  signal: "supports_start" | "opposes_start" | "neutral";
  value: string | number | boolean | null;
  observedAt: string;
  sourceIds?: string[];
  observationIds?: string[];
  sourceReliability?: number;
  credibility?: {
    score: number;
    label: "low" | "medium" | "high";
    rationale: string;
  };
  relevance?: {
    score: number;
    rationale: string;
  };
  override?: boolean;
  note: string;
};

export type AgentRoleEvidenceInput = {
  schemaVersion: 2;
  authorship: {
    kind: "coding_agent";
    agent: string;
    authoredAt: string;
  };
  sources: RootEvidenceSource[];
  observations: RoleObservation[];
  adapters: Array<{
    id: string;
    observationIds?: string[];
    error?: string;
    coverage?: Partial<AdapterHealthMetrics>;
  }>;
};

export type AdapterHealthMetrics = {
  configured: number;
  fetched: number;
  parsed: number;
  matched: number;
  stale: number;
  failed: number;
  unsupported: number;
};

export type RoleEvidenceAdapterInput = {
  config: RoleEvidenceAdapterConfig;
  sources?: RootEvidenceSource[];
  observations?: RoleObservation[];
  records?: RoleEvidenceRecord[];
  error?: string;
  coverage?: Partial<AdapterHealthMetrics>;
};

export type NormalizedRoleEvidence = RoleEvidenceRecord & {
  sourceId: string;
  provider: string;
  sourceKind: RoleEvidenceAdapterKind | "previous_season_starts" | "historical_minutes";
  rootSourceIds: string[];
  observationIds: string[];
  independentSourceCount: number;
  baseWeight: number;
  effectiveWeight: number;
  ageDays: number;
};

export type CurrentRoleStatus = "READY" | "CAUTION" | "INSUFFICIENT";

export type RoleDimensionAssessment = {
  dimension: RoleAssessmentDimension;
  coverage: "current" | "historical_only" | "conflicting" | "missing";
  evidenceConfidence: number;
  estimatedStartProbability: null;
  observationIds: string[];
  publishers: string[];
  independentSourceCount: number;
  supportsStart: boolean;
  opposesStart: boolean;
  reasonCodes: Array<"current_sources" | "historical_only" | "conflicting_sources" | "no_coverage">;
};

export type CurrentRoleItem = {
  playerId: number;
  name: string;
  selected: boolean;
  status: CurrentRoleStatus;
  supportScore: number;
  confidence: number;
  currentEvidencePresent: boolean;
  manualOverride: "supports_start" | "opposes_start" | null;
  disagreement: boolean;
  dimensions: Record<RoleEvidenceDimension, NormalizedRoleEvidence[]>;
  assessments: Record<RoleAssessmentDimension, RoleDimensionAssessment>;
  warnings: string[];
};

export type AdapterCoverageReport = {
  schemaVersion: 1;
  generatedAt: string;
  adapters: Array<{
    id: string;
    kind: RoleEvidenceAdapterKind;
    provider: string;
    status: "loaded" | "missing" | "failed" | "disabled" | "unsupported";
    metrics: AdapterHealthMetrics;
    message: string;
  }>;
  totals: AdapterHealthMetrics;
};

export type CurrentRoleReport = {
  schemaVersion: 2;
  generatedAt: string;
  gameweek: number;
  sources: RootEvidenceSource[];
  observations: RoleObservation[];
  transformations: Array<{
    id: string;
    tool: "current-role-report";
    toolVersion: string;
    inputObservationIds: string[];
    outputPlayerIds: number[];
  }>;
  adapterCoverage: AdapterCoverageReport;
  policy: {
    currentHalfLifeDays: 14;
    historicalHalfLifeDays: 60;
    historicalOnlyConfidenceCap: 0.45;
  };
  adapters: Array<{
    id: string;
    kind: RoleEvidenceAdapterKind;
    provider: string;
    status: "loaded" | "missing" | "failed" | "disabled" | "unsupported";
    recordCount: number;
    metrics: AdapterHealthMetrics;
    message: string;
  }>;
  summary: {
    playersReviewed: number;
    selectedPlayers: number;
    ready: number;
    caution: number;
    insufficient: number;
    disagreements: number;
    missingAdapters: number;
    failedAdapters: number;
  };
  items: CurrentRoleItem[];
  warnings: string[];
};

export type RoleEvidenceReport = CurrentRoleReport;
