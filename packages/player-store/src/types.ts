import { z } from "zod";

const isoDate = z.string().datetime({ offset: true });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const stableId = z.string().regex(/^[a-z][a-z0-9-]*:[a-f0-9]{64}$/);
const score = z.number().min(0).max(1);

export const PlayerEvidenceSnapshotSchema = z.object({
  snapshotId: stableId,
  playerId: z.number().int().positive(),
  observedAt: isoDate,
  contentHash: hash,
  name: z.string().min(1),
  webName: z.string().min(1),
  teamId: z.number().int().positive(),
  teamName: z.string().min(1),
  position: z.string().min(1),
  price: z.number().nonnegative(),
  status: z.string().min(1),
  selectedByPercent: z.number().nullable(),
  minutes: z.number().int().nullable(),
  totalPoints: z.number().int().nullable(),
  officialFields: z.record(z.string(), z.unknown())
});

export const PlayerPerformanceObservationSchema = z.object({
  performanceId: stableId,
  playerId: z.number().int().positive(),
  fixtureId: z.number().int().positive(),
  gameweek: z.number().int().positive().nullable(),
  observedAt: isoDate,
  contentHash: hash,
  supersedesId: stableId.nullable(),
  stats: z.record(z.string(), z.unknown())
});

export const NewsObservationSchema = z.object({
  observationId: stableId,
  documentId: stableId,
  playerId: z.number().int().positive(),
  category: z.enum(["availability", "role", "injury", "lineup", "transfer", "set_piece", "general"]),
  observedAt: isoDate,
  credibility: z.object({ score, rationale: z.string().min(1) }),
  relevance: z.object({ score, rationale: z.string().min(1) }),
  adapterVersion: z.string().min(1),
  note: z.string()
});

export const DiscoveryCoverageSchema = z.object({
  coverageId: stableId,
  worklistId: stableId,
  playerId: z.number().int().positive(),
  status: z.enum(["pending", "searched_with_results", "searched_zero_results", "blocked"]),
  searchedAt: isoDate.nullable(),
  queries: z.array(z.string().min(1)).min(1),
  searches: z.array(z.object({
    query: z.string().min(1),
    provider: z.string().min(1),
    searchedAt: isoDate,
    status: z.enum(["completed", "blocked"]),
    resultUrls: z.array(z.string().url()),
    relevantUrls: z.array(z.string().url())
  })).default([]),
  resultCount: z.number().int().nonnegative(),
  note: z.string()
});

export const EvidenceResearchWorklistSchema = z.object({
  schemaVersion: z.literal(1),
  worklistId: stableId,
  runId: z.string().min(1),
  gameweek: z.number().int().positive(),
  generatedAt: isoDate,
  players: z.array(z.object({
    playerId: z.number().int().positive(),
    name: z.string().min(1),
    webName: z.string().min(1),
    team: z.string().min(1),
    aliases: z.array(z.string().min(1)).min(1),
    clubAliases: z.array(z.string().min(1)).min(1),
    queries: z.array(z.string().min(1)).min(1),
    status: z.literal("pending")
  }))
});

export const NewsReviewOutcomeSchema = z.enum(["accepted", "rejected", "duplicate", "irrelevant", "deferred"]);

export const NewsReviewDecisionSchema = z.object({
  playerId: z.number().int().positive(),
  url: z.string().url(),
  outcome: NewsReviewOutcomeSchema,
  reviewedAt: isoDate,
  agent: z.string().min(1),
  note: z.string().min(1)
});

export const NewsReviewQueueSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: isoDate,
  gameweek: z.number().int().positive(),
  worklistId: stableId,
  summary: z.object({
    candidates: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    deferred: z.number().int().nonnegative(),
    reviewed: z.number().int().nonnegative()
  }),
  items: z.array(z.object({
    candidateId: stableId,
    playerId: z.number().int().positive(),
    playerName: z.string().min(1),
    url: z.string().url(),
    title: z.string().min(1),
    publisher: z.string().nullable(),
    publishedAt: isoDate.nullable(),
    priority: z.number().int().nonnegative(),
    priorityReason: z.enum(["selected_squad", "named_alternative", "transfer_target", "appearance", "worklist"]),
    outcome: NewsReviewOutcomeSchema.nullable(),
    reviewedAt: isoDate.nullable(),
    note: z.string().nullable()
  }))
});

const ingestionDocument = z.object({
  canonicalUrl: z.string().url(),
  publisher: z.string().min(1),
  title: z.string().min(1),
  publishedAt: isoDate,
  retrievedAt: isoDate,
  contentHash: hash,
  excerpt: z.string().max(1000),
  rawCapturePath: z.string().min(1).nullable().optional()
});

export const SourceDocumentSchema = ingestionDocument.extend({
  documentId: stableId,
  supersedesId: stableId.nullable()
});

export const EvidenceIngestionBatchSchema = z.object({
  schemaVersion: z.literal(1),
  batchId: stableId,
  worklistId: stableId,
  gameweek: z.number().int().positive(),
  authorship: z.object({
    kind: z.literal("coding_agent"),
    agent: z.string().min(1),
    authoredAt: isoDate
  }),
  coverage: z.array(z.object({
    playerId: z.number().int().positive(),
    status: z.enum(["searched_with_results", "searched_zero_results", "blocked"]),
    searchedAt: isoDate,
    queries: z.array(z.string().min(1)).min(1),
    searches: z.array(z.object({
      query: z.string().min(1),
      provider: z.string().min(1),
      searchedAt: isoDate,
      status: z.enum(["completed", "blocked"]),
      resultUrls: z.array(z.string().url()),
      relevantUrls: z.array(z.string().url())
    })).min(1),
    note: z.string()
  })),
  documents: z.array(ingestionDocument),
  observations: z.array(z.object({
    playerId: z.number().int().positive(),
    documentContentHash: hash,
    category: z.enum(["availability", "role", "injury", "lineup", "transfer", "set_piece", "general"]),
    credibility: z.object({ score, rationale: z.string().min(1) }),
    relevance: z.object({ score, rationale: z.string().min(1) }),
    adapterVersion: z.string().min(1),
    note: z.string()
  }))
});

export const PlayerDossierSchema = z.object({
  schemaVersion: z.literal(1),
  dossierId: stableId,
  playerId: z.number().int().positive(),
  generatedAt: isoDate,
  asOf: isoDate,
  snapshot: PlayerEvidenceSnapshotSchema.nullable(),
  previousSnapshot: PlayerEvidenceSnapshotSchema.nullable(),
  performance: z.array(PlayerPerformanceObservationSchema),
  documents: z.array(SourceDocumentSchema),
  news: z.array(NewsObservationSchema),
  roleObservationIds: z.array(z.string()),
  coverage: DiscoveryCoverageSchema.nullable(),
  historyCoverage: z.enum(["available", "missing", "failed", "stale"]),
  changes: z.array(z.string()),
  disagreements: z.array(z.string()),
  gaps: z.array(z.string())
});

export const EvidenceStoreManifestSchema = z.object({
  schemaVersion: z.literal(1),
  storeSchemaVersion: z.number().int().positive(),
  runId: z.string().min(1),
  gameweek: z.number().int().positive(),
  generatedAt: isoDate,
  mode: z.enum(["live", "offline"]),
  logicalHash: hash,
  counts: z.object({
    players: z.number().int().nonnegative(),
    snapshots: z.number().int().nonnegative(),
    performance: z.number().int().nonnegative(),
    fixtures: z.number().int().nonnegative(),
    documents: z.number().int().nonnegative(),
    news: z.number().int().nonnegative(),
    coverageComplete: z.number().int().nonnegative(),
    historyAvailable: z.number().int().nonnegative(),
    historyGaps: z.number().int().nonnegative()
  }),
  historyFailures: z.array(z.object({ playerId: z.number().int().positive(), status: z.string(), error: z.string().nullable() }))
});

export const EvidenceReadinessStatusSchema = z.enum(["READY", "CAUTION", "INSUFFICIENT"]);
export const EvidenceReadinessReportSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: isoDate,
  gameweek: z.number().int().positive(),
  items: z.array(z.object({
    playerId: z.number().int().positive(),
    name: z.string().min(1),
    selected: z.boolean(),
    status: EvidenceReadinessStatusSchema,
    startProbability: score,
    appearanceProbability: score,
    confidence: score,
    currentRoleEvidence: z.boolean(),
    officialSnapshot: z.boolean(),
    currentResearchCoverage: z.boolean(),
    historyAvailable: z.boolean(),
    reasonCodes: z.array(z.string())
  })),
  summary: z.object({ ready: z.number(), caution: z.number(), insufficient: z.number(), selectedInsufficient: z.number() }),
  warnings: z.array(z.string())
});

export const DecisionStatusReportSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: isoDate,
  gameweek: z.number().int().positive(),
  items: z.array(z.object({
    decisionId: z.string().min(1),
    playerId: z.number().int().positive().nullable(),
    area: z.enum(["squad", "starting_xi", "bench", "captaincy", "transfer", "chip"]),
    status: z.enum(["LOCK", "LIKELY", "PROVISIONAL", "AVOID"]),
    readiness: EvidenceReadinessStatusSchema,
    valid: z.boolean(),
    rationale: z.string().min(1)
  })),
  warnings: z.array(z.string())
});

export const DecisionStatusInputSchema = z.object({
  schemaVersion: z.literal(1),
  authorship: z.object({ kind: z.literal("coding_agent"), agent: z.string().min(1), authoredAt: isoDate }),
  gameweek: z.number().int().positive(),
  items: z.array(z.object({
    decisionId: z.string().min(1),
    playerId: z.number().int().positive().nullable(),
    area: z.enum(["squad", "starting_xi", "bench", "captaincy", "transfer", "chip"]),
    status: z.enum(["LOCK", "LIKELY", "PROVISIONAL", "AVOID"]),
    rationale: z.string().min(1)
  }))
});

const triggerValue = z.union([z.string(), z.number(), z.boolean()]);
export const TriggerPlanSchema = z.object({
  schemaVersion: z.literal(1),
  authorship: z.object({ kind: z.literal("coding_agent"), agent: z.string().min(1), authoredAt: isoDate }),
  gameweek: z.number().int().positive(),
  triggers: z.array(z.object({
    triggerId: z.string().regex(/^trigger:[a-z0-9][a-z0-9._-]*$/),
    metric: z.enum(["start_probability", "appearance_probability", "availability", "price", "source_disagreement", "transfer_status", "lineup_consensus", "odds_movement", "competition_phase"]),
    subject: z.object({ kind: z.enum(["player", "team", "decision", "competition"]), id: z.string().min(1) }),
    operator: z.enum(["lt", "lte", "eq", "neq", "gte", "gt", "changed"]),
    threshold: triggerValue,
    evidenceDependencyIds: z.array(z.string().min(1)).min(1),
    affectedDecisionIds: z.array(z.string().min(1)).min(1),
    candidateResponses: z.array(z.enum(["recheck_evidence", "regenerate_candidates", "recompute_projections", "review_selection", "defer_finalization"])).min(1),
    reanalysisScope: z.enum(["player", "squad", "captaincy", "transfers", "full"]),
    nextCheckAt: isoDate,
    expiresAt: isoDate,
    acknowledgedAt: isoDate.nullable().default(null),
    supersededByTriggerId: z.string().nullable().default(null)
  }))
});

export const TriggerEvaluationSchema = z.object({
  evaluationId: stableId,
  triggerId: z.string(),
  evaluatedAt: isoDate,
  state: z.enum(["inactive", "armed", "fired", "acknowledged", "expired", "superseded"]),
  currentValue: triggerValue.nullable(),
  previousValue: triggerValue.nullable(),
  evidenceDependencyIds: z.array(z.string()),
  affectedDecisionIds: z.array(z.string()),
  candidateResponses: z.array(z.string()),
  reanalysisScope: z.string(),
  reason: z.string()
});

export const TriggerEvaluationReportSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: isoDate,
  gameweek: z.number().int().positive(),
  evaluations: z.array(TriggerEvaluationSchema),
  warnings: z.array(z.string())
});

export const ProvisionalDecisionWorkspaceSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: isoDate,
  gameweek: z.number().int().positive(),
  status: z.literal("provisional"),
  affectedPlayerIds: z.array(z.number().int().positive()),
  firedTriggerIds: z.array(z.string()),
  reasons: z.array(z.string())
});

export const ArchivedPlayerForecastSchema = z.object({
  playerId: z.number().int().positive(),
  position: z.enum(["GKP", "DEF", "MID", "FWD"]),
  projectedPoints: z.number(),
  expectedMinutes: z.number().nonnegative(),
  startProbability: score,
  appearanceProbability: score,
  p10: z.number(),
  p90: z.number(),
  startProbabilityInterval: z.object({ lower: score, upper: score }).nullable(),
  roleEvidenceState: z.enum(["current", "historical_only", "conflicting", "missing"]),
  sourceCoverage: z.enum(["complete", "incomplete"]),
  adapterVersion: z.string().min(1),
  modelVersion: z.string().min(1)
}).superRefine((forecast, context) => {
  if (forecast.p10 > forecast.p90) context.addIssue({ code: "custom", message: "Forecast p10 cannot exceed p90." });
  if (forecast.startProbabilityInterval && forecast.startProbabilityInterval.lower > forecast.startProbabilityInterval.upper) {
    context.addIssue({ code: "custom", message: "Start-probability interval is inverted." });
  }
});

export const GameweekArchiveManifestSchema = z.object({
  schemaVersion: z.literal(1),
  archiveId: stableId,
  gameweek: z.number().int().min(1).max(38),
  deadline: isoDate,
  frozenAt: isoDate,
  sourceGeneratedAt: isoDate,
  artifacts: z.array(z.object({
    path: z.string().min(1),
    kind: z.enum(["observation", "assumption", "projection", "scenario", "candidate", "trigger", "decision", "supporting"]),
    contentHash: hash,
    sizeBytes: z.number().int().nonnegative()
  })).min(1),
  forecasts: z.array(ArchivedPlayerForecastSchema).min(1)
});

const OutcomeFixtureSchema = z.object({
  fixtureId: z.number().int().positive(),
  status: z.enum(["finished", "postponed"]),
  points: z.number().int(),
  minutes: z.number().int().nonnegative(),
  started: z.boolean()
});

export const PlayerGameweekOutcomeSchema = z.object({
  playerId: z.number().int().positive(),
  status: z.enum(["final", "blank", "postponed", "missing"]),
  fixtures: z.array(OutcomeFixtureSchema)
}).superRefine((outcome, context) => {
  const finished = outcome.fixtures.filter((fixture) => fixture.status === "finished");
  if (new Set(outcome.fixtures.map((fixture) => fixture.fixtureId)).size !== outcome.fixtures.length) context.addIssue({ code: "custom", message: "Outcome contains duplicate fixtures." });
  if (outcome.status === "final" && (finished.length === 0 || finished.length !== outcome.fixtures.length)) context.addIssue({ code: "custom", message: "Final outcome requires only finished fixtures." });
  if (outcome.status === "blank" && outcome.fixtures.length > 0) context.addIssue({ code: "custom", message: "Blank outcome cannot contain fixtures." });
  if (outcome.status === "postponed" && (outcome.fixtures.length === 0 || finished.length > 0)) context.addIssue({ code: "custom", message: "Postponed outcome requires only postponed fixtures." });
  if (outcome.status === "missing" && finished.length > 0) context.addIssue({ code: "custom", message: "Missing outcome cannot contain a finished fixture." });
});

export const GameweekOutcomeBatchSchema = z.object({
  schemaVersion: z.literal(1),
  gameweek: z.number().int().min(1).max(38),
  observedAt: isoDate,
  effectiveAt: isoDate,
  finalized: z.boolean(),
  outcomes: z.array(PlayerGameweekOutcomeSchema).min(1)
});

export const CalibrationReportSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: isoDate,
  gameweeks: z.array(z.number().int().positive()),
  minimumProposalSample: z.literal(100),
  summary: z.object({ eligible: z.number().int().nonnegative(), excluded: z.number().int().nonnegative() }),
  rows: z.array(z.object({
    gameweek: z.number().int().positive(), playerId: z.number().int().positive(), position: z.string(),
    projectedPoints: z.number(), actualPoints: z.number(), pointsError: z.number(), absolutePointsError: z.number(),
    expectedMinutes: z.number(), actualMinutes: z.number(), minutesError: z.number(),
    startProbability: score, started: z.number().int().min(0).max(1), startBrier: z.number().nonnegative(),
    appearanceProbability: score, appeared: z.number().int().min(0).max(1), appearanceBrier: z.number().nonnegative(),
    pointsIntervalCovered: z.boolean(), probabilityBand: z.string(), roleEvidenceState: z.string(), sourceCoverage: z.string(),
    adapterVersion: z.string(), modelVersion: z.string(), outcomeId: stableId
  })),
  cohorts: z.array(z.object({
    dimension: z.enum(["overall", "position", "role_evidence_state", "source_coverage", "adapter_version", "model_version", "probability_band"]),
    value: z.string(), sampleSize: z.number().int().nonnegative(), meanPointsError: z.number(), meanAbsolutePointsError: z.number(),
    meanMinutesError: z.number(), startBrier: z.number(), appearanceBrier: z.number(), pointsIntervalCoverage: score
  })),
  parameterChangeProposal: z.object({ eligible: z.boolean(), sampleSize: z.number().int().nonnegative(), note: z.string() })
});

export type PlayerEvidenceSnapshot = z.infer<typeof PlayerEvidenceSnapshotSchema>;
export type PlayerPerformanceObservation = z.infer<typeof PlayerPerformanceObservationSchema>;
export type NewsObservation = z.infer<typeof NewsObservationSchema>;
export type SourceDocument = z.infer<typeof SourceDocumentSchema>;
export type DiscoveryCoverage = z.infer<typeof DiscoveryCoverageSchema>;
export type EvidenceResearchWorklist = z.infer<typeof EvidenceResearchWorklistSchema>;
export type NewsReviewOutcome = z.infer<typeof NewsReviewOutcomeSchema>;
export type NewsReviewDecision = z.infer<typeof NewsReviewDecisionSchema>;
export type NewsReviewQueue = z.infer<typeof NewsReviewQueueSchema>;
export type EvidenceIngestionBatch = z.infer<typeof EvidenceIngestionBatchSchema>;
export type PlayerDossier = z.infer<typeof PlayerDossierSchema>;
export type EvidenceStoreManifest = z.infer<typeof EvidenceStoreManifestSchema>;
export type EvidenceReadinessReport = z.infer<typeof EvidenceReadinessReportSchema>;
export type DecisionStatusReport = z.infer<typeof DecisionStatusReportSchema>;
export type DecisionStatusInput = z.infer<typeof DecisionStatusInputSchema>;
export type TriggerPlan = z.infer<typeof TriggerPlanSchema>;
export type TriggerEvaluation = z.infer<typeof TriggerEvaluationSchema>;
export type TriggerEvaluationReport = z.infer<typeof TriggerEvaluationReportSchema>;
export type ProvisionalDecisionWorkspace = z.infer<typeof ProvisionalDecisionWorkspaceSchema>;
export type ArchivedPlayerForecast = z.infer<typeof ArchivedPlayerForecastSchema>;
export type GameweekArchiveManifest = z.infer<typeof GameweekArchiveManifestSchema>;
export type PlayerGameweekOutcome = z.infer<typeof PlayerGameweekOutcomeSchema>;
export type GameweekOutcomeBatch = z.infer<typeof GameweekOutcomeBatchSchema>;
export type CalibrationReport = z.infer<typeof CalibrationReportSchema>;
