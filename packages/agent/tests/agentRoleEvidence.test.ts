import { describe, expect, it } from "vitest";
import { AgentRoleEvidenceInputSchema, buildCurrentRoleReport, type AgentRoleEvidenceInput } from "../src";

const input: AgentRoleEvidenceInput = {
  schemaVersion: 2,
  authorship: {
    kind: "coding_agent",
    agent: "Codex",
    authoredAt: "2026-08-03T12:00:00.000Z"
  },
  sources: [{
    id: "src:lineup",
    publisher: "Lineup Publisher",
    sourceType: "media",
    sourceKind: "predicted_lineup",
    canonicalUrl: "https://example.test/lineup",
    reliability: 0.8,
    credibilityRationale: "Named predicted lineup with a current publication time."
  }],
  observations: [{
    id: "role-obs:lineup-1",
    adapterId: "predicted-lineups",
    playerId: 1,
    dimension: "predicted_lineup_consensus",
    signal: "supports_start",
    sourceIds: ["src:lineup"],
    underlyingClaimId: "lineup:publisher:gw1",
    publishedAt: "2026-08-03T10:00:00.000Z",
    retrievedAt: "2026-08-03T12:00:00.000Z",
    observedAt: "2026-08-03T10:00:00.000Z",
    capturedExcerpt: "Player appears in the predicted lineup.",
    structuredValue: 1,
    adapterVersion: "1.0.0",
    contentHash: "0".repeat(64),
    credibility: { score: 0.8, label: "medium", rationale: "Credible specialist source." },
    relevance: { score: 0.5, rationale: "Published well before the deadline." },
    note: "Player appears in the predicted lineup."
  }],
  adapters: [{
    id: "predicted-lineups",
    observationIds: ["role-obs:lineup-1"]
  }]
};

describe("coding-agent role evidence", () => {
  it("requires coding-agent authorship and resolvable root sources", () => {
    expect(AgentRoleEvidenceInputSchema.parse(input)).toEqual(input);
    expect(() => AgentRoleEvidenceInputSchema.parse({
      ...input,
      observations: [{ ...input.observations[0], sourceIds: ["src:missing"] }]
    })).toThrow("references missing source");
  });

  it("propagates agent-assessed credibility and relevance into evidence weight", () => {
    const report = buildCurrentRoleReport({
      generatedAt: "2026-08-03T12:00:00.000Z",
      gameweek: 1,
      players: [{ id: 1, name: "Player", status: "a", minutes: 0 }],
      selectedPlayerIds: [1],
      adapters: [{
        config: {
          id: "predicted-lineups",
          kind: "predicted_lineup",
          provider: "Agent-reviewed lineups",
          url: "https://example.test/lineup",
          enabled: true,
          reliability: 1
        },
        sources: input.sources,
        observations: input.observations,
        records: input.observations.map((observation) => ({
          playerId: observation.playerId,
          dimension: observation.dimension,
          signal: observation.signal,
          value: observation.structuredValue,
          observedAt: observation.observedAt,
          sourceIds: observation.sourceIds,
          observationIds: [observation.id],
          sourceReliability: 0.8,
          credibility: observation.credibility,
          relevance: observation.relevance,
          note: observation.note
        }))
      }]
    });

    expect(report.items[0].dimensions.predicted_lineup_consensus[0].effectiveWeight).toBeCloseTo(0.239, 3);
  });
});
