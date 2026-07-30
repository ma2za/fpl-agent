import { z } from "zod";

const looseObject = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough();
const schemaVersion = z.literal(1).optional();
const stringArray = z.array(z.string());
const nullableNumber = z.number().nullable();
const confidence = z.enum(["low", "medium", "high"]);
const deadlineStatus = z.enum(["open", "passed", "unknown"]);
const dataMode = z.enum(["official", "provisional"]);

const validationResult = looseObject({
  isValid: z.boolean(),
  errors: stringArray,
  warnings: stringArray
});

const qualityGate = looseObject({
  gate: z.string(),
  status: z.enum(["pass", "warn", "fail"]),
  message: z.string()
});

const qualityReport = looseObject({
  isValid: z.boolean(),
  errors: stringArray,
  warnings: stringArray,
  gates: z.array(qualityGate)
});

const playerForRules = looseObject({
  id: z.number(),
  name: z.string(),
  position: z.string(),
  teamId: z.number(),
  price: z.number(),
  nowCost: z.number(),
  status: z.string(),
  minutes: z.number().nullable().optional()
});

const playerProjection = looseObject({
  playerId: z.number(),
  projectedPoints: z.number(),
  expectedMinutes: z.number(),
  basePointsPer90: z.number(),
  expectedMinutesFactor: z.number(),
  fixtureDifficultyFactor: z.number(),
  availabilityFactor: z.number(),
  formFactor: z.number()
});

const captainCandidate = looseObject({
  playerId: z.number(),
  projectedPoints: z.number(),
  expectedMinutes: z.number(),
  fixtureSummary: z.string(),
  risk: z.enum(["low", "medium", "high"]),
  upsideCase: z.string(),
  downsideCase: z.string()
});

const chipRecommendation = looseObject({
  chip: z.enum(["none", "wildcard", "free_hit", "bench_boost", "triple_captain"]),
  confidence,
  expectedGain: z.number(),
  reasons: stringArray,
  warnings: stringArray
});

const transferMove = looseObject({
  sellPlayerId: z.number(),
  buyPlayerId: z.number()
});

const transferCandidate = looseObject({
  id: z.string(),
  type: z.enum(["roll", "transfer", "hit", "wildcard", "free_hit"]),
  moves: z.array(transferMove),
  transferCost: z.number(),
  expectedGain1GW: z.number(),
  expectedGain3GW: z.number(),
  expectedGain5GW: z.number(),
  risk: z.enum(["low", "medium", "high"]),
  reasons: stringArray,
  concerns: stringArray,
  isLegal: z.boolean(),
  legalityErrors: stringArray
});

const pickTeam = looseObject({
  formation: z.string(),
  startingXI: z.array(z.number()),
  benchOrder: z.array(z.number()),
  projectedPoints: z.number(),
  explanation: z.string()
});

const comparedAlternative = looseObject({
  playerId: z.number().optional(),
  name: z.string(),
  whyNot: stringArray
});

const decisionAnalysis = looseObject({
  summary: z.string(),
  squadStructure: stringArray,
  structureComparisons: z.array(looseObject({
    selectedStructure: z.string(),
    rejectedStructure: z.string(),
    whySelected: stringArray,
    whyRejected: stringArray,
    evidence: stringArray
  })).optional().default([]),
  playerDecisions: z.array(looseObject({
    playerId: z.number(),
    role: z.enum(["starter", "bench", "squad"]),
    whyPicked: stringArray,
    comparedAgainst: z.array(comparedAlternative),
    evidence: stringArray
  })),
  captaincy: looseObject({
    captainPlayerId: z.number(),
    whyCaptain: stringArray,
    comparedAgainst: z.array(comparedAlternative),
    evidence: stringArray
  }),
  keyOmissions: z.array(looseObject({
    playerId: z.number().optional(),
    name: z.string(),
    whyOmitted: stringArray,
    wouldReconsiderIf: stringArray,
    evidence: stringArray
  }))
});

export const WeeklyRecommendationSchema = looseObject({
  schemaVersion,
  gameweek: z.number(),
  createdAt: z.string(),
  deadline: z.string(),
  deadlineStatus,
  dataMode,
  squadBefore: looseObject({
    players: z.array(playerForRules),
    bank: z.number(),
    freeTransfers: z.number(),
    chipsAvailable: z.array(z.enum(["wildcard", "free_hit", "bench_boost", "triple_captain"]))
  }),
  recommendedAction: looseObject({
    type: z.enum(["roll", "transfer", "hit", "wildcard", "free_hit"]),
    transfers: z.array(transferMove),
    transferCost: z.number(),
    bankAfter: z.number(),
    explanation: z.string()
  }),
  pickTeam,
  captaincy: looseObject({
    captainPlayerId: z.number(),
    viceCaptainPlayerId: z.number(),
    alternatives: z.array(captainCandidate),
    explanation: z.string()
  }),
  chip: chipRecommendation,
  topTransferCandidates: z.array(transferCandidate),
  confidence: looseObject({
    score: z.number(),
    label: confidence,
    explanation: z.string()
  }),
  decisionAnalysis: decisionAnalysis.optional(),
  evidenceReferences: z.array(looseObject({
    area: z.enum([
      "squad",
      "starting-xi",
      "shortlist",
      "transfers",
      "captaincy",
      "bench",
      "chip",
      "risks",
      "change-conditions"
    ]),
    source: z.string(),
    reportPath: z.string(),
    note: z.string(),
    playerIds: z.array(z.number()).optional()
  })),
  risks: stringArray,
  whatWouldChangeMyMind: stringArray,
  legality: validationResult,
  manualExecutionRequired: z.literal(true)
});

export const RecommendationTemplateSchema = looseObject({
  schemaVersion,
  status: z.literal("agent_decision_required"),
  gameweek: z.number(),
  createdAt: z.string().nullable(),
  deadline: z.string(),
  deadlineStatus,
  dataMode,
  squadBefore: looseObject({
    players: z.array(playerForRules),
    bank: z.number().nullable(),
    freeTransfers: z.number(),
    chipsAvailable: z.array(z.enum(["wildcard", "free_hit", "bench_boost", "triple_captain"]))
  }),
  recommendedAction: z.null(),
  pickTeam: z.null(),
  captaincy: z.null(),
  chip: z.null(),
  confidence: z.null(),
  decisionAnalysis: z.unknown(),
  evidenceReferences: z.array(z.unknown()),
  risks: stringArray,
  whatWouldChangeMyMind: stringArray,
  manualExecutionRequired: z.literal(true)
});

export const RecommendationArtifactSchema = z.union([
  WeeklyRecommendationSchema,
  RecommendationTemplateSchema
]);

export function isWeeklyRecommendationArtifact(
  value: z.infer<typeof RecommendationArtifactSchema>
): value is z.infer<typeof WeeklyRecommendationSchema> {
  return WeeklyRecommendationSchema.safeParse(value).success;
}

const evidenceFreshness = looseObject({
  status: z.enum(["fresh", "stale", "missing"]),
  checkedAt: z.string(),
  fetchedAt: z.string().nullable(),
  ageHours: nullableNumber,
  maxAgeHours: z.number(),
  message: z.string()
});

const evidenceSource = looseObject({
  id: z.string(),
  label: z.string(),
  provider: z.string(),
  url: z.string().nullable(),
  rawPath: z.string().nullable(),
  reportPath: z.string().nullable(),
  required: z.boolean(),
  confidence,
  freshness: evidenceFreshness
});

export const EvidenceReportSchema = looseObject({
  schemaVersion,
  generatedAt: z.string(),
  gameweek: z.number(),
  summary: looseObject({
    fresh: z.number(),
    stale: z.number(),
    missing: z.number(),
    requiredMissing: z.number(),
    requiredStale: z.number()
  }),
  sources: z.array(evidenceSource),
  items: z.array(looseObject({
    sourceId: z.string(),
    area: z.string(),
    subject: z.string(),
    severity: z.enum(["info", "watch", "risk", "missing"]),
    summary: z.string(),
    confidence,
    fetchedAt: z.string().nullable(),
    url: z.string().nullable()
  })),
  warnings: stringArray
});

export const PublicEvidenceReportSchema = looseObject({
  schemaVersion,
  generatedAt: z.string(),
  gameweek: z.number(),
  summary: looseObject({
    configuredSources: z.number(),
    capturedPages: z.number(),
    failedPages: z.number(),
    playwrightPages: z.number(),
    fetchPages: z.number(),
    signals: z.number()
  }),
  pages: z.array(looseObject({
    sourceId: z.string(),
    label: z.string(),
    provider: z.string(),
    url: z.string(),
    area: z.enum(["fixtures", "team-news", "predicted-lineups", "player-news", "prices", "general-news"]),
    capturedAt: z.string(),
    captureMode: z.enum(["playwright", "fetch", "failed"]),
    title: z.string().nullable(),
    textExcerpt: z.string(),
    wordCount: z.number(),
    rawPath: z.string().nullable(),
    error: z.string().nullable(),
    confidence
  })),
  signals: z.array(looseObject({
    sourceId: z.string(),
    area: z.enum(["fixtures", "team-news", "predicted-lineups", "player-news", "prices", "general-news"]),
    severity: z.enum(["info", "watch", "risk", "missing"]),
    subject: z.string(),
    summary: z.string(),
    url: z.string(),
    confidence
  })),
  warnings: stringArray
});

export const WeeklyStrategySchema = looseObject({
  schemaVersion,
  gameweek: z.number(),
  status: z.enum(["agent_authored", "agent_decision_required"]),
  riskProfile: z.enum(["conservative", "balanced", "aggressive"]),
  squadSource: z.enum(["from_scratch", "manual_config", "manager_id"]),
  weeklyThesis: z.string(),
  horizons: looseObject({
    oneGameweek: z.string(),
    threeGameweeks: z.string(),
    sixGameweeks: z.string()
  }),
  transferPlan: looseObject({
    posture: z.enum(["roll", "free_transfer", "hit", "wildcard", "free_hit"]),
    rationale: z.string(),
    followsRiskProfile: z.boolean()
  }),
  captaincyPlan: looseObject({
    primaryProfile: z.string(),
    rationale: z.string()
  }),
  chipPlan: looseObject({
    chip: z.enum(["none", "wildcard", "free_hit", "bench_boost", "triple_captain"]),
    rationale: z.string(),
    referencesSeasonPosture: z.boolean()
  }),
  risks: stringArray,
  whatWouldChangeMyMind: stringArray
});

export const StrategyEvidenceSchema = looseObject({
  schemaVersion,
  gameweek: z.number(),
  createdAt: z.string(),
  dataMode,
  deadline: z.string(),
  deadlineStatus,
  riskProfile: z.record(z.string(), z.string()),
  seasonPlanExists: z.boolean(),
  weeklyStrategyExists: z.boolean(),
  horizonSummary: looseObject({
    oneGameweek: stringArray,
    threeGameweeks: stringArray,
    sixGameweeks: stringArray
  }),
  prompts: stringArray,
  warnings: stringArray
});

export const LegalityReportSchema = validationResult.extend({
  schemaVersion,
  quality: qualityReport.optional(),
  strategyQuality: qualityReport.optional()
}).passthrough();

export const FixtureTickerSchema = looseObject({
  schemaVersion,
  gameweek: z.number(),
  horizon: z.number(),
  generatedAt: z.string(),
  teams: z.array(looseObject({
    teamId: z.number(),
    teamName: z.string(),
    shortName: z.string(),
    fixtures: z.array(looseObject({
      event: z.number(),
      opponentTeamId: z.number(),
      opponentName: z.string(),
      venue: z.enum(["H", "A"]),
      difficulty: z.number(),
      kickoffTime: z.string().nullable(),
      finished: z.boolean()
    })),
    fixtureCount: z.number(),
    blankCount: z.number(),
    doubleCount: z.number(),
    averageDifficulty: nullableNumber,
    difficultySum: z.number()
  }))
});

export const SquadRiskReportSchema = looseObject({
  schemaVersion,
  generatedAt: z.string(),
  gameweek: z.number(),
  dataMode,
  summary: looseObject({
    high: z.number(),
    medium: z.number(),
    low: z.number(),
    evidenceGaps: z.number()
  }),
  playerRisks: z.array(looseObject({
    playerId: z.number(),
    name: z.string(),
    position: z.string(),
    teamId: z.number(),
    level: z.enum(["low", "medium", "high"]),
    starting: z.boolean(),
    benchPosition: z.number().nullable(),
    reasons: stringArray
  })),
  structureRisks: z.array(looseObject({
    risk: z.string(),
    level: z.enum(["low", "medium", "high"]),
    message: z.string()
  })),
  evidenceGaps: z.array(looseObject({
    area: z.string(),
    status: z.enum(["reviewed", "missing"]),
    message: z.string()
  })),
  notes: stringArray
});

const selectedReportBase = {
  schemaVersion,
  generatedAt: z.string(),
  gameweek: z.number(),
  source: evidenceSource,
  warnings: stringArray
};

export const TeamNewsReportSchema = looseObject({
  ...selectedReportBase,
  summary: looseObject({
    flaggedPlayers: z.number(),
    selectedFlaggedPlayers: z.number(),
    info: z.number(),
    watch: z.number(),
    risk: z.number(),
    avoid: z.number()
  }),
  items: z.array(looseObject({
    playerId: z.number(),
    name: z.string(),
    webName: z.string(),
    teamId: z.number(),
    teamName: z.string(),
    position: z.string(),
    status: z.string(),
    chanceOfPlayingNextRound: nullableNumber,
    chanceOfPlayingThisRound: nullableNumber,
    news: z.string(),
    newsAdded: z.string().nullable(),
    severity: z.enum(["info", "watch", "risk", "avoid"]),
    selected: z.boolean(),
    summary: z.string()
  }))
});

export const SetPieceReportSchema = looseObject({
  ...selectedReportBase,
  summary: looseObject({
    rolePlayers: z.number(),
    selectedRolePlayers: z.number(),
    penaltyTakers: z.number(),
    directFreeKickTakers: z.number(),
    cornerAndIndirectFreeKickTakers: z.number()
  }),
  items: z.array(looseObject({
    playerId: z.number(),
    name: z.string(),
    webName: z.string(),
    teamId: z.number(),
    teamName: z.string(),
    position: z.string(),
    role: z.enum(["penalties", "direct-free-kicks", "corners-and-indirect-free-kicks"]),
    order: z.number(),
    selected: z.boolean(),
    status: z.string(),
    confidence,
    summary: z.string()
  }))
});

const oddsCoverage = z.enum(["covered", "partial", "missing"]);
const oddsSignal = z.enum(["high", "medium", "low", "unknown"]);
const oddsSignalSource = z.enum(["direct", "derived", "unavailable"]);

export const OddsReportSchema = looseObject({
  ...selectedReportBase,
  summary: looseObject({
    sourceRows: z.number(),
    premierLeagueRows: z.number(),
    gameweekFixtures: z.number(),
    matchedFixtures: z.number(),
    unmatchedFixtures: z.number(),
    selectedTeamsCovered: z.number(),
    coverageStatus: oddsCoverage,
    marketCoverage: looseObject({
      matchOdds: oddsCoverage,
      overUnder: oddsCoverage,
      cleanSheet: oddsCoverage,
      anytimeScorer: oddsCoverage,
      teamGoals: oddsCoverage
    })
  }),
  matches: z.array(looseObject({
    fixtureId: z.number(),
    event: z.number(),
    kickoffTime: z.string().nullable(),
    homeTeamId: z.number(),
    awayTeamId: z.number(),
    homeTeamName: z.string(),
    awayTeamName: z.string(),
    sourceHomeTeam: z.string(),
    sourceAwayTeam: z.string(),
    averageHomeOdds: nullableNumber,
    averageDrawOdds: nullableNumber,
    averageAwayOdds: nullableNumber,
    over25Odds: nullableNumber,
    under25Odds: nullableNumber,
    homeWinProbability: nullableNumber,
    drawProbability: nullableNumber,
    awayWinProbability: nullableNumber,
    over25Probability: nullableNumber,
    under25Probability: nullableNumber,
    homeCleanSheetProbability: nullableNumber,
    awayCleanSheetProbability: nullableNumber,
    homeTeamGoalsExpected: nullableNumber,
    awayTeamGoalsExpected: nullableNumber
  })),
  teamSignals: z.array(looseObject({
    teamId: z.number(),
    teamName: z.string(),
    fixtureId: z.number(),
    event: z.number(),
    opponentTeamId: z.number(),
    opponentName: z.string(),
    venue: z.enum(["H", "A"]),
    winProbability: nullableNumber,
    drawProbability: nullableNumber,
    lossProbability: nullableNumber,
    over25Probability: nullableNumber,
    under25Probability: nullableNumber,
    cleanSheetProbability: nullableNumber,
    teamGoalsExpected: nullableNumber,
    attackSignal: oddsSignal,
    cleanSheetSignal: oddsSignal,
    attackSignalSource: oddsSignalSource,
    cleanSheetSignalSource: oddsSignalSource,
    selectedPlayerIds: z.array(z.number()),
    summary: z.string()
  })),
  playerSignals: z.array(looseObject({
    playerId: z.number().nullable(),
    playerName: z.string(),
    teamId: z.number().nullable(),
    teamName: z.string(),
    market: z.literal("anytime-scorer"),
    probability: z.number(),
    selected: z.boolean(),
    summary: z.string()
  }))
});

export const MinutesRiskReportSchema = looseObject({
  ...selectedReportBase,
  summary: looseObject({
    playersReviewed: z.number(),
    selectedPlayers: z.number(),
    selectedStarters: z.number(),
    secure: z.number(),
    watch: z.number(),
    risky: z.number(),
    unknown: z.number(),
    selectedWatchOrWorse: z.number(),
    starterWatchOrWorse: z.number()
  }),
  items: z.array(looseObject({
    playerId: z.number(),
    name: z.string(),
    webName: z.string(),
    teamId: z.number(),
    teamName: z.string(),
    position: z.string(),
    status: z.string(),
    minutes: nullableNumber,
    selected: z.boolean(),
    starting: z.boolean(),
    benchPosition: z.number().nullable(),
    historicalConfidence: confidence,
    predictedLineupConfidence: z.literal("unavailable"),
    riskLevel: z.enum(["secure", "watch", "risky", "unknown"]),
    reasons: stringArray,
    summary: z.string()
  }))
});

export const PlayerProjectionArraySchema = z.array(playerProjection);

export const ArtifactSchemas = {
  evidenceReport: EvidenceReportSchema,
  fixtureTicker: FixtureTickerSchema,
  legalityReport: LegalityReportSchema,
  minutesRiskReport: MinutesRiskReportSchema,
  oddsReport: OddsReportSchema,
  publicEvidenceReport: PublicEvidenceReportSchema,
  recommendation: RecommendationArtifactSchema,
  riskReport: SquadRiskReportSchema,
  setPieceReport: SetPieceReportSchema,
  strategyEvidence: StrategyEvidenceSchema,
  teamNewsReport: TeamNewsReportSchema,
  weeklyStrategy: WeeklyStrategySchema
} as const;

export type ArtifactSchemaName = keyof typeof ArtifactSchemas;
