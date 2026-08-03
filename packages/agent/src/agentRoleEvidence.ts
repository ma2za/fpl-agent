import { z } from "zod";

const sourceId = z.string().regex(/^src:[a-z0-9][a-z0-9._-]*$/);
const roleDimension = z.enum([
  "historical_availability",
  "historical_starts",
  "current_manager_preference",
  "preseason_start_rate",
  "predicted_lineup_consensus",
  "injury_status",
  "squad_competition",
  "substitution_patterns",
  "set_piece_roles"
]);

export const AgentRoleEvidenceInputSchema = z.object({
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
    records: z.array(z.object({
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
      relevance: z.object({
        score: z.number().min(0).max(1),
        rationale: z.string().min(1)
      }).strict(),
      override: z.boolean().optional(),
      note: z.string().min(1)
    }).strict()).optional(),
    error: z.string().min(1).optional()
  }).strict())
}).strict().superRefine((input, context) => {
  const sourceIds = new Set<string>();
  for (const source of input.sources) {
    if (sourceIds.has(source.id)) {
      context.addIssue({ code: "custom", message: `Duplicate role evidence source ${source.id}.` });
    }
    sourceIds.add(source.id);
  }

  for (const adapter of input.adapters) {
    for (const record of adapter.records ?? []) {
      for (const id of record.sourceIds) {
        if (!sourceIds.has(id)) {
          context.addIssue({ code: "custom", message: `Role record for player ${record.playerId} references missing source ${id}.` });
        }
      }
    }
  }
});
