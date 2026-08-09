import { z } from "zod";

const sourceId = z.string().regex(/^src:[a-z0-9][a-z0-9._-]*$/);
const observationId = z.string().regex(/^role-obs:[a-z0-9][a-z0-9._-]*$/);
const roleDimension = z.enum([
  "historical_availability",
  "historical_starts",
  "current_manager_preference",
  "preseason_start_rate",
  "predicted_lineup_consensus",
  "injury_status",
  "squad_competition",
  "transfer_risk",
  "substitution_patterns",
  "set_piece_roles"
]);
const healthMetrics = z.object({
  configured: z.number().int().nonnegative().optional(),
  fetched: z.number().int().nonnegative().optional(),
  parsed: z.number().int().nonnegative().optional(),
  matched: z.number().int().nonnegative().optional(),
  stale: z.number().int().nonnegative().optional(),
  failed: z.number().int().nonnegative().optional(),
  unsupported: z.number().int().nonnegative().optional()
}).strict();

const legacyRecord = z.object({
  playerId: z.number().int().positive(),
  dimension: roleDimension,
  signal: z.enum(["supports_start", "opposes_start", "neutral"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  observedAt: z.string().min(1),
  sourceIds: z.array(sourceId).min(1),
  credibility: z.object({
    score: z.number().min(0).max(1),
    label: z.enum(["low", "medium", "high"]),
    rationale: z.string().min(1)
  }).strict(),
  relevance: z.object({ score: z.number().min(0).max(1), rationale: z.string().min(1) }).strict(),
  override: z.boolean().optional(),
  note: z.string().min(1)
}).strict();

export const LegacyAgentRoleEvidenceInputSchema = z.object({
  schemaVersion: z.literal(1),
  authorship: z.object({
    kind: z.literal("coding_agent"),
    agent: z.string().min(1),
    authoredAt: z.string().min(1)
  }).strict(),
  sources: z.array(z.object({
    id: sourceId,
    publisher: z.string().min(1),
    sourceType: z.enum(["official", "club", "media", "market"]),
    url: z.string().url(),
    publishedAt: z.string().nullable(),
    retrievedAt: z.string().min(1),
    reliability: z.number().min(0).max(1),
    credibilityRationale: z.string().min(1)
  }).strict()),
  adapters: z.array(z.object({
    id: z.string().min(1),
    records: z.array(legacyRecord).optional(),
    error: z.string().min(1).optional()
  }).strict())
}).strict();

export const RootEvidenceSourceSchema = z.object({
  id: sourceId,
  publisher: z.string().min(1),
  sourceType: z.enum(["official", "club", "media", "market"]),
  sourceKind: z.enum([
    "club_press_conference", "official_injury_update", "manager_comment", "preseason_lineup",
    "substitution_event", "predicted_lineup", "transfer_report", "bookmaker_market", "official_fpl"
  ]),
  canonicalUrl: z.string().url(),
  reliability: z.number().min(0).max(1),
  credibilityRationale: z.string().min(1)
}).strict();

export const RoleObservationSchema = z.object({
  id: observationId,
  adapterId: z.string().min(1),
  playerId: z.number().int().positive(),
  dimension: roleDimension,
  signal: z.enum(["supports_start", "opposes_start", "neutral"]),
  sourceIds: z.array(sourceId).min(1),
  underlyingClaimId: z.string().min(1),
  publishedAt: z.string().nullable(),
  retrievedAt: z.string().min(1),
  observedAt: z.string().min(1),
  capturedExcerpt: z.string().min(1).nullable(),
  structuredValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  adapterVersion: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  credibility: z.object({
    score: z.number().min(0).max(1),
    label: z.enum(["low", "medium", "high"]),
    rationale: z.string().min(1)
  }).strict(),
  relevance: z.object({
    score: z.number().min(0).max(1),
    rationale: z.string().min(1)
  }).strict(),
  override: z.boolean().optional(),
  note: z.string().min(1)
}).strict().superRefine((observation, context) => {
  if (observation.capturedExcerpt === null && observation.structuredValue === null) {
    context.addIssue({ code: "custom", message: `Role observation ${observation.id} requires a captured excerpt or structured value.` });
  }
});

export const AgentRoleEvidenceInputSchema = z.object({
  schemaVersion: z.literal(2),
  authorship: z.object({
    kind: z.literal("coding_agent"),
    agent: z.string().min(1),
    authoredAt: z.string().min(1)
  }).strict(),
  sources: z.array(RootEvidenceSourceSchema),
  observations: z.array(RoleObservationSchema),
  adapters: z.array(z.object({
    id: z.string().min(1),
    observationIds: z.array(observationId).optional(),
    error: z.string().min(1).optional(),
    coverage: healthMetrics.optional()
  }).strict())
}).strict().superRefine((input, context) => {
  const sourceIds = new Set<string>();
  const observationIds = new Set<string>();
  const adapterIds = new Set(input.adapters.map((adapter) => adapter.id));

  for (const source of input.sources) {
    if (sourceIds.has(source.id)) context.addIssue({ code: "custom", message: `Duplicate role evidence source ${source.id}.` });
    sourceIds.add(source.id);
  }

  for (const observation of input.observations) {
    if (observationIds.has(observation.id)) {
      context.addIssue({ code: "custom", message: `Duplicate role observation ${observation.id}.` });
    }
    observationIds.add(observation.id);
    if (!adapterIds.has(observation.adapterId)) {
      context.addIssue({ code: "custom", message: `Role observation ${observation.id} references missing adapter ${observation.adapterId}.` });
    }
    for (const id of observation.sourceIds) {
      if (!sourceIds.has(id)) {
        context.addIssue({ code: "custom", message: `Role observation ${observation.id} references missing source ${id}.` });
      }
    }
  }

  for (const adapter of input.adapters) {
    for (const id of adapter.observationIds ?? []) {
      if (!observationIds.has(id)) {
        context.addIssue({ code: "custom", message: `Role adapter ${adapter.id} references missing observation ${id}.` });
      }
    }
  }
});
