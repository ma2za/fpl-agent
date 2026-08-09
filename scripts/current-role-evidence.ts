import { createHash } from "node:crypto";
import type {
  AgentRoleEvidenceInput,
  RoleEvidenceAdapterConfig,
  RoleEvidenceAdapterInput,
  RoleEvidenceRecord,
  RoleObservation,
  RootEvidenceSource
} from "../packages/agent/src";
import {
  AgentRoleEvidenceInputSchema,
  LegacyAgentRoleEvidenceInputSchema
} from "../packages/agent/src";

type AvailabilityPlayer = {
  id: number;
  status: string;
  chance_of_playing_next_round?: number | null;
  news?: string;
  news_added?: string | null;
};

export type CodingAgentRoleEvidenceInput = AgentRoleEvidenceInput;

function contentHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function legacySourceKind(adapterId: string, sourceType: "official" | "club" | "media" | "market") {
  if (sourceType === "market") return "bookmaker_market" as const;
  if (adapterId.includes("preseason")) return "preseason_lineup" as const;
  if (adapterId.includes("predicted")) return "predicted_lineup" as const;
  if (adapterId.includes("manager")) return "manager_comment" as const;
  if (sourceType === "official") return "official_injury_update" as const;
  return sourceType === "club" ? "manager_comment" as const : "transfer_report" as const;
}

export function parseCodingAgentRoleEvidence(value: unknown): AgentRoleEvidenceInput {
  const current = AgentRoleEvidenceInputSchema.safeParse(value);
  if (current.success) return current.data;

  const legacy = LegacyAgentRoleEvidenceInputSchema.parse(value);
  const legacySources = new Map(legacy.sources.map((source) => [source.id, source]));
  const observations: RoleObservation[] = [];
  const sourceKinds = new Map<string, RootEvidenceSource["sourceKind"]>();
  const adapters = legacy.adapters.map((adapter) => {
    const observationIds = (adapter.records ?? []).map((record, index) => {
      const id = `role-obs:legacy-${adapter.id.replace(/[^a-z0-9._-]/g, "-")}-${record.playerId}-${index}`;
      for (const sourceId of record.sourceIds) {
        const source = legacySources.get(sourceId)!;
        sourceKinds.set(sourceId, legacySourceKind(adapter.id, source.sourceType));
      }
      const primary = legacySources.get(record.sourceIds[0])!;
      observations.push({
        id,
        adapterId: adapter.id,
        playerId: record.playerId,
        dimension: record.dimension,
        signal: record.signal,
        sourceIds: record.sourceIds,
        underlyingClaimId: `legacy:${adapter.id}:${record.playerId}:${record.dimension}:${index}`,
        publishedAt: primary.publishedAt,
        retrievedAt: primary.retrievedAt,
        observedAt: record.observedAt,
        capturedExcerpt: record.note,
        structuredValue: record.value,
        adapterVersion: "legacy-v1",
        contentHash: contentHash(record),
        credibility: record.credibility,
        relevance: record.relevance,
        override: record.override,
        note: record.note
      });
      return id;
    });
    return { id: adapter.id, observationIds, error: adapter.error };
  });

  return AgentRoleEvidenceInputSchema.parse({
    schemaVersion: 2,
    authorship: legacy.authorship,
    sources: legacy.sources.map((source) => ({
      id: source.id,
      publisher: source.publisher,
      sourceType: source.sourceType,
      sourceKind: sourceKinds.get(source.id) ?? (source.sourceType === "market" ? "bookmaker_market" : "transfer_report"),
      canonicalUrl: source.url,
      reliability: source.reliability,
      credibilityRationale: source.credibilityRationale
    })),
    observations,
    adapters
  });
}

function recordFromObservation(
  observation: RoleObservation,
  sources: Map<string, RootEvidenceSource>
): RoleEvidenceRecord {
  const sourceReliability = observation.sourceIds
    .map((sourceId) => sources.get(sourceId)?.reliability)
    .filter((value): value is number => typeof value === "number");

  return {
    playerId: observation.playerId,
    dimension: observation.dimension,
    signal: observation.signal,
    value: observation.structuredValue,
    observedAt: observation.observedAt,
    sourceIds: observation.sourceIds,
    observationIds: [observation.id],
    sourceReliability: sourceReliability.length > 0 ? Math.min(...sourceReliability) : 0,
    credibility: observation.credibility,
    relevance: observation.relevance,
    override: observation.override,
    note: observation.note
  };
}

function officialAvailability(
  config: RoleEvidenceAdapterConfig,
  players: AvailabilityPlayer[],
  generatedAt: string
): RoleEvidenceAdapterInput {
  const source: RootEvidenceSource = {
    id: "src:fpl-availability",
    publisher: "Fantasy Premier League",
    sourceType: "official",
    sourceKind: "official_fpl",
    canonicalUrl: config.url!,
    reliability: config.reliability,
    credibilityRationale: "Official public FPL availability fields."
  };
  const observations = players.map((player): RoleObservation => {
    const structuredValue = player.chance_of_playing_next_round ?? player.status;
    const observedAt = player.news_added ?? generatedAt;
    const capturedExcerpt = player.news?.trim() || null;
    return {
      id: `role-obs:fpl-availability-${player.id}`,
      adapterId: config.id,
      playerId: player.id,
      dimension: player.status === "a" ? "historical_availability" : "injury_status",
      signal: player.status === "a" ? "neutral" : "opposes_start",
      sourceIds: [source.id],
      underlyingClaimId: `availability:${player.id}:${observedAt}`,
      publishedAt: player.news_added ?? null,
      retrievedAt: generatedAt,
      observedAt,
      capturedExcerpt,
      structuredValue,
      adapterVersion: "0.0.12",
      contentHash: contentHash({ playerId: player.id, structuredValue, capturedExcerpt, observedAt }),
      credibility: { score: 1, label: "high", rationale: "Official FPL availability field." },
      relevance: { score: 1, rationale: "Current availability evidence." },
      note: capturedExcerpt ?? `FPL availability status ${player.status}.`
    };
  });
  const sourceById = new Map([[source.id, source]]);

  return {
    config,
    sources: [source],
    observations,
    records: observations.map((observation) => recordFromObservation(observation, sourceById)),
    coverage: {
      configured: 1,
      fetched: players.length,
      parsed: observations.length,
      matched: observations.length
    }
  };
}

export function currentRoleAdapterInputs(
  configs: RoleEvidenceAdapterConfig[],
  players: AvailabilityPlayer[],
  generatedAt: string,
  agentEvidence?: CodingAgentRoleEvidenceInput | null
): RoleEvidenceAdapterInput[] {
  const evidenceById = new Map((agentEvidence?.adapters ?? []).map((adapter) => [adapter.id, adapter]));
  const sourceById = new Map((agentEvidence?.sources ?? []).map((source) => [source.id, source]));

  return configs.map((config) => {
    if (config.kind === "official_availability") return officialAvailability(config, players, generatedAt);

    const input = evidenceById.get(config.id);
    const observationIds = new Set(input?.observationIds ?? []);
    const observations = (agentEvidence?.observations ?? []).filter((observation) =>
      observation.adapterId === config.id && (observationIds.size === 0 || observationIds.has(observation.id))
    );
    const sourceIds = new Set(observations.flatMap((observation) => observation.sourceIds));
    const sources = [...sourceIds].flatMap((id) => sourceById.get(id) ? [sourceById.get(id)!] : []);
    const records = observations.map((observation) => recordFromObservation(observation, sourceById));

    return {
      config,
      sources,
      observations,
      records: input && !input.error ? records : undefined,
      error: input?.error,
      coverage: {
        configured: 1,
        fetched: observations.length,
        parsed: observations.length,
        matched: records.length,
        ...input?.coverage
      }
    };
  });
}
