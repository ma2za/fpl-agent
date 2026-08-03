import { describe, expect, it } from "vitest";
import { AgentRoleEvidenceInputSchema, buildCurrentRoleReport, type AgentRoleEvidenceInput } from "../src";

const input: AgentRoleEvidenceInput = {
  schemaVersion: 1,
  authorship: {
    kind: "coding_agent",
    agent: "Codex",
    authoredAt: "2026-08-03T12:00:00.000Z"
  },
  sources: [{
    id: "src:lineup",
    publisher: "Lineup Publisher",
    sourceType: "media",
    url: "https://example.test/lineup",
    publishedAt: "2026-08-03T10:00:00.000Z",
    retrievedAt: "2026-08-03T12:00:00.000Z",
    reliability: 0.8,
    credibilityRationale: "Named predicted lineup with a current publication time."
  }],
  adapters: [{
    id: "predicted-lineups",
    records: [{
      playerId: 1,
      dimension: "predicted_lineup_consensus",
      signal: "supports_start",
      value: 1,
      observedAt: "2026-08-03T10:00:00.000Z",
      sourceIds: ["src:lineup"],
      credibility: { score: 0.8, label: "medium", rationale: "Credible specialist source." },
      relevance: { score: 0.5, rationale: "Published well before the deadline." },
      note: "Player appears in the predicted lineup."
    }]
  }]
};

describe("coding-agent role evidence", () => {
  it("requires coding-agent authorship and resolvable root sources", () => {
    expect(AgentRoleEvidenceInputSchema.parse(input)).toEqual(input);
    expect(() => AgentRoleEvidenceInputSchema.parse({
      ...input,
      adapters: [{
        ...input.adapters[0],
        records: [{ ...input.adapters[0].records![0], sourceIds: ["src:missing"] }]
      }]
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
        records: input.adapters[0].records?.map((record) => ({ ...record, sourceReliability: 0.8 }))
      }]
    });

    expect(report.items[0].dimensions.predicted_lineup_consensus[0].effectiveWeight).toBeCloseTo(0.239, 3);
  });
});
