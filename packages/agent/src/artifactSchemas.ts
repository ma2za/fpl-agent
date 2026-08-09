import { z } from "zod";
import { RoleObservationSchema, RootEvidenceSourceSchema } from "./agentRoleEvidence";
import { validateClaimLedger } from "./provenance";

const looseObject = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough();
const schemaVersion = z.literal(1).optional();
const stringArray = z.array(z.string());
const nullableNumber = z.number().nullable();
const confidence = z.enum(["low", "medium", "high"]);
const deadlineStatus = z.enum(["open", "passed", "unknown"]);
const dataMode = z.enum(["official", "provisional"]);
const competitionPhase = z.enum([
  "PRESEASON_DRAFT",
  "LIVE_GAMEWEEK",
  "TRANSFER_WINDOW",
  "FINAL_LOCKDOWN",
  "SEASON_COMPLETE"
]);
const deadlineProximity = z.enum(["early", "approaching", "imminent", "passed", "unknown"]);
const competitionAction = z.enum([
  "retain_draft",
  "modify_draft",
  "rebuild_structure",
  "wait_for_information",
  "lock_draft",
  "monitor",
  "review_live_gameweek",
  "roll",
  "transfer",
  "hit",
  "wildcard",
  "free_hit",
  "wait_for_finalization",
  "review_season"
]);

const stableId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}:[a-z0-9][a-z0-9._-]*$`));
const sourceId = stableId("src");
const observationId = stableId("obs");
const factId = stableId("fact");
const assumptionId = stableId("asm");
const forecastId = stableId("fcst");
const transformationId = stableId("tx");
const decisionId = stableId("dec");

const sourceClaim = z.object({
  id: sourceId,
  publisher: z.string().min(1),
  sourceType: z.enum(["official", "club", "media", "market", "manual"]),
  uri: z.string().nullable()
}).strict();
const observationClaim = z.object({
  id: observationId,
  sourceId,
  claim: z.string().min(1),
  observedAt: z.string().min(1),
  retrievedAt: z.string().min(1),
  reliability: z.number().min(0).max(1),
  freshness: z.enum(["fresh", "stale", "unknown"]),
  value: z.unknown()
}).strict();
const factClaim = z.object({
  id: factId,
  claim: z.string().min(1),
  observationIds: z.array(observationId).min(1),
  transformationId: transformationId.optional()
}).strict();
const assumptionClaim = z.object({
  id: assumptionId,
  claim: z.string().min(1),
  factIds: z.array(factId).min(1),
  model: z.string().min(1),
  modelVersion: z.string().min(1)
}).strict();
const transformationClaim = z.object({
  id: transformationId,
  tool: z.string().min(1),
  toolVersion: z.string().min(1),
  reportPath: z.string().min(1),
  inputIds: z.array(z.string()).min(1),
  outputFactIds: z.array(factId).min(1)
}).strict();
const decisionClaim = z.object({
  id: decisionId,
  area: z.enum([
    "squad", "starting-xi", "shortlist", "transfers", "captaincy",
    "bench", "chip", "risks", "change-conditions"
  ]),
  factIds: z.array(factId),
  assumptionIds: z.array(assumptionId)
}).strict();

const legacyClaimLedgerFields = {
  sources: z.array(sourceClaim),
  observations: z.array(observationClaim),
  facts: z.array(factClaim),
  assumptions: z.array(assumptionClaim),
  transformations: z.array(transformationClaim),
  decisions: z.array(decisionClaim)
};

export const ClaimLedgerV1Schema = z.object({
  schemaVersion: z.literal(1),
  ...legacyClaimLedgerFields
}).strict();

export const ClaimLedgerV2Schema = z.object({
  schemaVersion: z.literal(2),
  ...legacyClaimLedgerFields
}).strict();

export const ClaimLedgerV3Schema = z.object({
  schemaVersion: z.literal(3),
  sources: z.array(sourceClaim),
  observations: z.array(observationClaim.extend({
    kind: z.literal("OBSERVATION"),
    isSourceQuote: z.boolean().optional()
  }).strict()),
  facts: z.array(factClaim.extend({
    kind: z.literal("DERIVED_FACT"),
    transformationId
  }).strict()),
  assumptions: z.array(assumptionClaim.extend({ kind: z.literal("ASSUMPTION") }).strict()),
  forecasts: z.array(z.object({
    id: forecastId,
    kind: z.literal("FORECAST"),
    claim: z.string().min(1),
    model: z.string().min(1),
    modelVersion: z.string().min(1),
    inputFactIds: z.array(factId),
    inputAssumptionIds: z.array(assumptionId),
    outputValue: z.union([
      z.string(), z.number(), z.boolean(), z.null(), z.array(z.unknown()), z.record(z.string(), z.unknown())
    ]),
    uncertainty: z.string().min(1),
    horizon: z.string().min(1)
  }).strict()),
  transformations: z.array(transformationClaim),
  decisions: z.array(decisionClaim.extend({
    kind: z.literal("DECISION"),
    claim: z.string().min(1),
    forecastIds: z.array(forecastId)
  }).strict())
}).strict();

export const ClaimLedgerSchema = z.union([
  ClaimLedgerV1Schema,
  ClaimLedgerV2Schema,
  ClaimLedgerV3Schema
]).superRefine((ledger, context) => {
  for (const error of validateClaimLedger(ledger).errors) {
    context.addIssue({ code: "custom", message: error });
  }
});

export const LanguageValidationReportSchema = z.object({
  schemaVersion: z.literal(1),
  phase: competitionPhase,
  isValid: z.boolean(),
  findings: z.array(z.object({
    claimId: z.string().min(1),
    phrase: z.string().min(1),
    rule: z.string().min(1),
    severity: z.enum(["error", "warning"]),
    suggestedClaimKind: z.enum(["OBSERVATION", "DERIVED_FACT", "ASSUMPTION", "FORECAST", "DECISION"])
  }).strict())
}).strict();

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

const recommendationFields = {
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
    type: competitionAction,
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
};

export const LegacyWeeklyRecommendationSchema = looseObject({
  ...recommendationFields,
  schemaVersion
});

export const AgentDecisionArtifactSchema = looseObject({
  ...recommendationFields,
  schemaVersion: z.literal(2),
  artifactKind: z.literal("agent_decision"),
  authorship: looseObject({
    kind: z.literal("coding_agent"),
    agent: z.string().min(1),
    authoredAt: z.string().min(1)
  }),
  decisionContext: looseObject({
    phase: competitionPhase,
    deadlineProximity,
    activeGameweek: z.number().nullable(),
    nextDeadline: z.string().nullable()
  }),
  claimLedger: ClaimLedgerSchema,
  decisionIds: z.array(decisionId).min(1)
});

export const WeeklyRecommendationSchema = z.union([
  AgentDecisionArtifactSchema,
  LegacyWeeklyRecommendationSchema
]);

const LegacyRecommendationTemplateSchema = looseObject({
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

export const ToolEvidenceArtifactSchema = z.object({
  schemaVersion: z.literal(2),
  artifactKind: z.literal("tool_evidence"),
  generatedAt: z.string(),
  tool: z.string().min(1),
  payload: z.unknown()
}).strict();

export const CandidateArtifactSchema = z.object({
  schemaVersion: z.literal(2),
  artifactKind: z.literal("candidate"),
  generatedAt: z.string(),
  scenarioId: z.string().min(1),
  payload: z.unknown()
}).strict();

export const RecommendationTemplateSchema = z.union([
  ToolEvidenceArtifactSchema,
  LegacyRecommendationTemplateSchema
]);

export const RecommendationArtifactSchema = z.union([
  AgentDecisionArtifactSchema,
  LegacyWeeklyRecommendationSchema,
  ToolEvidenceArtifactSchema,
  LegacyRecommendationTemplateSchema
]);

export function isWeeklyRecommendationArtifact(
  value: z.infer<typeof RecommendationArtifactSchema>
): value is z.infer<typeof WeeklyRecommendationSchema> {
  return AgentDecisionArtifactSchema.safeParse(value).success ||
    LegacyWeeklyRecommendationSchema.safeParse(value).success;
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

const fixtureHorizonConfidence = z.enum(["low", "medium", "high"]);
const fixtureHorizonCoverage = z.enum(["complete", "partial", "missing"]);
const fixtureHorizonLabel = z.enum(["favorable", "neutral", "difficult", "blank", "unavailable"]);
const fixtureDifficultyEvidence = looseObject({
  value: z.number(),
  rawValue: z.number(),
  source: z.enum(["fpl-team-strength", "fpl-overall-strength-fallback", "fpl-fixture-difficulty-fallback"]),
  confidence: fixtureHorizonConfidence
});

export const FixtureHorizonReportSchema = looseObject({
  schemaVersion,
  generatedAt: z.string(),
  gameweek: z.number(),
  source: looseObject({
    provider: z.literal("Fantasy Premier League public API"),
    fixturesUrl: z.string(),
    teamsUrl: z.string(),
    schedulePolicy: z.literal("fpl-primary-no-silent-merge")
  }),
  thresholds: looseObject({
    favorableMaximum: z.literal(2.5),
    difficultMinimum: z.literal(3.5),
    swingMinimum: z.literal(0.75),
    shortRestMaximumDays: z.literal(3)
  }),
  teams: z.array(looseObject({
    teamId: z.number(),
    teamName: z.string(),
    shortName: z.string(),
    horizons: z.array(looseObject({
      gameweeks: z.union([z.literal(1), z.literal(3), z.literal(6)]),
      startGameweek: z.number(),
      endGameweek: z.number(),
      fixtures: z.array(looseObject({
        fixtureId: z.number(),
        event: z.number(),
        opponentTeamId: z.number(),
        opponentName: z.string(),
        venue: z.enum(["H", "A"]),
        kickoffTime: z.string().nullable(),
        state: z.enum(["scheduled", "finished", "unresolved"]),
        rawDifficulty: z.number(),
        attackDifficulty: fixtureDifficultyEvidence,
        defenceDifficulty: fixtureDifficultyEvidence,
        restDaysBefore: nullableNumber,
        restDaysAfter: nullableNumber,
        shortRest: z.boolean()
      })),
      fixtureCount: z.number(),
      blankGameweeks: z.array(z.number()),
      doubleGameweeks: z.array(z.number()),
      unresolvedFixtureCount: z.number(),
      shortRestCount: z.number(),
      attack: looseObject({
        averageDifficulty: nullableNumber,
        label: fixtureHorizonLabel,
        confidence: fixtureHorizonConfidence,
        coverage: fixtureHorizonCoverage
      }),
      defence: looseObject({
        averageDifficulty: nullableNumber,
        label: fixtureHorizonLabel,
        confidence: fixtureHorizonConfidence,
        coverage: fixtureHorizonCoverage
      })
    })),
    unresolvedFixtures: z.array(looseObject({
      fixtureId: z.number(),
      opponentTeamId: z.number(),
      opponentName: z.string(),
      kickoffTime: z.string().nullable(),
      reason: z.enum(["event-unassigned", "kickoff-missing"])
    })),
    swing: looseObject({
      attack: z.enum(["in", "out", "stable", "unavailable"]),
      attackChange: nullableNumber,
      defence: z.enum(["in", "out", "stable", "unavailable"]),
      defenceChange: nullableNumber
    })
  })),
  exposures: z.array(looseObject({
    label: z.string(),
    kind: z.enum(["configured", "primary", "variant"]),
    playerCount: z.number(),
    positionCounts: looseObject({ GKP: z.number(), DEF: z.number(), MID: z.number(), FWD: z.number() }),
    horizons: z.array(looseObject({
      gameweeks: z.union([z.literal(1), z.literal(3), z.literal(6)]),
      attackAverage: nullableNumber,
      defenceAverage: nullableNumber,
      coverage: fixtureHorizonCoverage
    }))
  })),
  warnings: stringArray
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
    predictedLineupConfidence: z.union([confidence, z.literal("unavailable")]),
    riskLevel: z.enum(["secure", "watch", "risky", "unknown"]),
    reasons: stringArray,
    summary: z.string()
  }))
});

const roleAdapterKind = z.enum([
  "official_availability", "manager_confirmation", "official_club", "preseason_lineup", "predicted_lineup",
  "substitution_events", "transfer_reporting", "bookmaker_market", "reviewed_manual"
]);
const roleDimension = z.enum([
  "historical_availability", "historical_starts", "current_manager_preference", "preseason_start_rate",
  "predicted_lineup_consensus", "injury_status", "squad_competition", "transfer_risk", "substitution_patterns", "set_piece_roles"
]);
const roleAssessmentDimension = z.enum([
  "historicalRole", "currentManagerPreference", "preseasonUsage", "predictedLineupConsensus",
  "availability", "squadCompetition", "transferRisk", "setPieceRole"
]);
const roleSignal = z.enum(["supports_start", "opposes_start", "neutral"]);
const adapterHealthMetrics = z.object({
  configured: z.number().int().nonnegative(),
  fetched: z.number().int().nonnegative(),
  parsed: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  stale: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  unsupported: z.number().int().nonnegative()
}).strict();
const normalizedRoleEvidence = looseObject({
  playerId: z.number(),
  dimension: roleDimension,
  signal: roleSignal,
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  observedAt: z.string(),
  override: z.boolean().optional(),
  note: z.string(),
  sourceId: z.string(),
  provider: z.string(),
  sourceKind: z.union([roleAdapterKind, z.enum(["previous_season_starts", "historical_minutes"])]),
  rootSourceIds: z.array(z.string()),
  observationIds: z.array(z.string()),
  independentSourceCount: z.number().int().nonnegative(),
  baseWeight: z.number(),
  effectiveWeight: z.number(),
  ageDays: z.number()
});

const adapterCoverageItem = z.object({
  id: z.string(),
  kind: roleAdapterKind,
  provider: z.string(),
  status: z.enum(["loaded", "missing", "failed", "disabled", "unsupported"]),
  metrics: adapterHealthMetrics,
  message: z.string()
}).strict();

export const AdapterCoverageReportSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  adapters: z.array(adapterCoverageItem),
  totals: adapterHealthMetrics
}).strict();

export const RoleDimensionAssessmentSchema = z.object({
  dimension: roleAssessmentDimension,
  coverage: z.enum(["current", "historical_only", "conflicting", "missing"]),
  evidenceConfidence: z.number().min(0).max(1),
  estimatedStartProbability: z.null(),
  observationIds: z.array(z.string()),
  publishers: z.array(z.string()),
  independentSourceCount: z.number().int().nonnegative(),
  supportsStart: z.boolean(),
  opposesStart: z.boolean(),
  reasonCodes: z.array(z.enum(["current_sources", "historical_only", "conflicting_sources", "no_coverage"]))
}).strict();

export const CurrentRoleReportSchema = looseObject({
  schemaVersion: z.literal(2),
  generatedAt: z.string(),
  gameweek: z.number(),
  sources: z.array(RootEvidenceSourceSchema),
  observations: z.array(RoleObservationSchema),
  transformations: z.array(z.object({
    id: z.string(),
    tool: z.literal("current-role-report"),
    toolVersion: z.string(),
    inputObservationIds: z.array(z.string()),
    outputPlayerIds: z.array(z.number())
  }).strict()),
  adapterCoverage: AdapterCoverageReportSchema,
  policy: looseObject({
    currentHalfLifeDays: z.literal(14),
    historicalHalfLifeDays: z.literal(60),
    historicalOnlyConfidenceCap: z.literal(0.45)
  }),
  adapters: z.array(looseObject({
    id: z.string(),
    kind: roleAdapterKind,
    provider: z.string(),
    status: z.enum(["loaded", "missing", "failed", "disabled", "unsupported"]),
    recordCount: z.number(),
    metrics: adapterHealthMetrics,
    message: z.string()
  })),
  summary: looseObject({
    playersReviewed: z.number(),
    selectedPlayers: z.number(),
    ready: z.number(),
    caution: z.number(),
    insufficient: z.number(),
    disagreements: z.number(),
    missingAdapters: z.number(),
    failedAdapters: z.number()
  }),
  items: z.array(looseObject({
    playerId: z.number(),
    name: z.string(),
    selected: z.boolean(),
    status: z.enum(["READY", "CAUTION", "INSUFFICIENT"]),
    supportScore: z.number(),
    confidence: z.number(),
    currentEvidencePresent: z.boolean(),
    manualOverride: roleSignal.exclude(["neutral"]).nullable(),
    disagreement: z.boolean(),
    dimensions: z.record(roleDimension, z.array(normalizedRoleEvidence)),
    assessments: z.record(roleAssessmentDimension, RoleDimensionAssessmentSchema),
    warnings: stringArray
  })),
  warnings: stringArray
}).superRefine((report, context) => {
  const sourceIds = new Set(report.sources.map((source) => source.id));
  const observationIds = new Set(report.observations.map((observation) => observation.id));

  for (const observation of report.observations) {
    for (const sourceId of observation.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        context.addIssue({ code: "custom", message: `Role observation ${observation.id} references missing root source ${sourceId}.` });
      }
    }
  }
  for (const item of report.items) {
    for (const records of Object.values(item.dimensions)) {
      for (const record of records) {
        if (!["previous_season_starts", "historical_minutes"].includes(record.sourceKind) && record.observationIds.length === 0) {
          context.addIssue({ code: "custom", message: `Non-historical role record for player ${item.playerId} has no root observation.` });
        }
        for (const observationId of record.observationIds) {
          if (!observationIds.has(observationId)) {
            context.addIssue({ code: "custom", message: `Role record for player ${item.playerId} references missing observation ${observationId}.` });
          }
        }
      }
    }
  }
});

export const RoleEvidenceReportSchema = CurrentRoleReportSchema;

export const PlayerProjectionArraySchema = z.array(playerProjection);

const variantEvidenceSummary = looseObject({
  fixtureDifficulty: nullableNumber,
  fixtureCount: nullableNumber,
  fixtureAttack1GW: nullableNumber.optional(),
  fixtureDefence1GW: nullableNumber.optional(),
  fixtureAttack3GW: nullableNumber.optional(),
  fixtureDefence3GW: nullableNumber.optional(),
  fixtureAttack6GW: nullableNumber.optional(),
  fixtureDefence6GW: nullableNumber.optional(),
  minutesWatchOrWorse: nullableNumber,
  playersWithOddsCoverage: nullableNumber,
  setPieceRolePlayers: nullableNumber,
  priceRisk: z.null(),
  evidenceGaps: stringArray
});

const squadComparison = looseObject({
  generatedAt: z.string(),
  a: looseObject({
    label: z.string(),
    recommendation: WeeklyRecommendationSchema,
    quality: qualityReport,
    riskSummary: looseObject({
      high: z.number(),
      medium: z.number(),
      low: z.number(),
      evidenceGaps: z.number()
    })
  }),
  b: looseObject({
    label: z.string(),
    recommendation: WeeklyRecommendationSchema,
    quality: qualityReport,
    riskSummary: looseObject({
      high: z.number(),
      medium: z.number(),
      low: z.number(),
      evidenceGaps: z.number()
    })
  }),
  sharedPlayerIds: z.array(z.number()),
  onlyAPlayerIds: z.array(z.number()),
  onlyBPlayerIds: z.array(z.number()),
  positionChanges: z.record(z.string(), looseObject({
    onlyAPlayerIds: z.array(z.number()),
    onlyBPlayerIds: z.array(z.number())
  })),
  summary: looseObject({
    budgetUsedA: z.number(),
    budgetUsedB: z.number(),
    bankA: z.number(),
    bankB: z.number(),
    budgetDelta: z.number(),
    bankDelta: z.number(),
    projectedPointsA: z.number(),
    projectedPointsB: z.number(),
    projectedPointsDelta: z.number(),
    captainA: z.number(),
    captainB: z.number(),
    chipA: z.string(),
    chipB: z.string(),
    outfieldBenchPlayableA: z.number(),
    outfieldBenchPlayableB: z.number(),
    outfieldBenchPlayableDelta: z.number()
  }),
  notes: stringArray
});

export const VariantComparisonReportSchema = looseObject({
  schemaVersion,
  generatedAt: z.string(),
  gameweek: z.number(),
  variants: looseObject({ a: z.string(), b: z.string() }),
  verification: looseObject({ a: LegalityReportSchema, b: LegalityReportSchema }),
  comparison: squadComparison,
  evidence: looseObject({ a: variantEvidenceSummary, b: variantEvidenceSummary }),
  decisionPolicy: z.string()
});

export const ArtifactSchemas = {
  adapterCoverageReport: AdapterCoverageReportSchema,
  agentDecision: AgentDecisionArtifactSchema,
  candidate: CandidateArtifactSchema,
  claimLedger: ClaimLedgerSchema,
  languageValidationReport: LanguageValidationReportSchema,
  currentRoleReport: CurrentRoleReportSchema,
  evidenceReport: EvidenceReportSchema,
  fixtureHorizonReport: FixtureHorizonReportSchema,
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
  toolEvidence: ToolEvidenceArtifactSchema,
  weeklyStrategy: WeeklyStrategySchema,
  variantComparison: VariantComparisonReportSchema
} as const;

export type ArtifactSchemaName = keyof typeof ArtifactSchemas;
