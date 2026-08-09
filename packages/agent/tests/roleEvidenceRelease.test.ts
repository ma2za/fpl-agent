import { describe, expect, it } from "vitest";
import {
  AdapterCoverageReportSchema,
  CurrentRoleReportSchema,
  buildCurrentRoleReport,
  type RoleEvidenceAdapterInput,
  type RoleEvidenceDimension
} from "../src";

const generatedAt = "2026-08-09T12:00:00.000Z";
const player = { id: 1, name: "Player", status: "a", minutes: 3000, starts: 32, appearances: 34 };

function adapter(input: {
  id: string;
  dimension: RoleEvidenceDimension;
  signal: "supports_start" | "opposes_start" | "neutral";
  publisher?: string;
  underlyingClaimId?: string;
  kind?: RoleEvidenceAdapterInput["config"]["kind"];
}): RoleEvidenceAdapterInput {
  const sourceId = `src:${input.id}`;
  const observationId = `role-obs:${input.id}`;
  const sourceKind = input.kind === "predicted_lineup"
    ? "predicted_lineup"
    : input.kind === "transfer_reporting"
      ? "transfer_report"
      : input.kind === "bookmaker_market"
        ? "bookmaker_market"
        : "manager_comment";
  return {
    config: {
      id: input.id,
      kind: input.kind ?? "manager_confirmation",
      provider: `${input.id} provider`,
      url: "https://example.test/evidence",
      enabled: true,
      reliability: 1
    },
    sources: [{
      id: sourceId,
      publisher: input.publisher ?? `${input.id} publisher`,
      sourceType: sourceKind === "bookmaker_market" ? "market" : "media",
      sourceKind,
      canonicalUrl: "https://example.test/evidence",
      reliability: 1,
      credibilityRationale: "Release-gate test source."
    }],
    observations: [{
      id: observationId,
      adapterId: input.id,
      playerId: 1,
      dimension: input.dimension,
      signal: input.signal,
      sourceIds: [sourceId],
      underlyingClaimId: input.underlyingClaimId ?? `claim:${input.id}`,
      publishedAt: generatedAt,
      retrievedAt: generatedAt,
      observedAt: generatedAt,
      capturedExcerpt: `${input.id} evidence.`,
      structuredValue: input.signal,
      adapterVersion: "1.0.0",
      contentHash: "a".repeat(64),
      credibility: { score: 1, label: "high", rationale: "Direct test evidence." },
      relevance: { score: 1, rationale: "Current evidence." },
      note: `${input.id} evidence.`
    }],
    records: [{
      playerId: 1,
      dimension: input.dimension,
      signal: input.signal,
      value: input.signal,
      observedAt: generatedAt,
      sourceIds: [sourceId],
      observationIds: [observationId],
      note: `${input.id} evidence.`
    }]
  };
}

describe("source-grounded current-role evidence", () => {
  it("requires every non-historical role record to resolve to a root observation and publisher", () => {
    const valid = adapter({ id: "manager", dimension: "current_manager_preference", signal: "supports_start" });
    const report = buildCurrentRoleReport({ generatedAt, gameweek: 1, players: [player], adapters: [valid] });

    expect(report.items[0].dimensions.current_manager_preference[0]).toMatchObject({
      observationIds: ["role-obs:manager"],
      rootSourceIds: ["src:manager"],
      independentSourceCount: 1
    });
    expect(() => buildCurrentRoleReport({
      generatedAt,
      gameweek: 1,
      players: [player],
      adapters: [{ ...valid, records: valid.records!.map(({ observationIds: _ids, ...record }) => record) }]
    })).toThrow("has no root observation");
  });

  it("counts three derived local records from one club statement as one independent source", () => {
    const club = adapter({
      id: "club-statement",
      dimension: "current_manager_preference",
      signal: "supports_start",
      publisher: "Example FC",
      underlyingClaimId: "club-statement:123"
    });
    club.records = [club.records![0], club.records![0], club.records![0]];

    const report = buildCurrentRoleReport({ generatedAt, gameweek: 1, players: [player], adapters: [club] });
    const assessment = report.items[0].assessments.currentManagerPreference;

    expect(assessment.independentSourceCount).toBe(1);
    expect(assessment.publishers).toEqual(["Example FC"]);
    expect(report.sources).toHaveLength(1);
    expect(report.observations).toHaveLength(1);
    expect(report.transformations[0].inputObservationIds).toEqual(["role-obs:club-statement"]);
  });

  it("preserves conflicts independently for manager, lineup, and transfer dimensions", () => {
    const adapters = [
      adapter({ id: "manager-a", dimension: "current_manager_preference", signal: "supports_start" }),
      adapter({ id: "manager-b", dimension: "current_manager_preference", signal: "opposes_start" }),
      adapter({ id: "lineup-a", kind: "predicted_lineup", dimension: "predicted_lineup_consensus", signal: "supports_start" }),
      adapter({ id: "lineup-b", kind: "predicted_lineup", dimension: "predicted_lineup_consensus", signal: "opposes_start" }),
      adapter({ id: "transfer-a", kind: "transfer_reporting", dimension: "transfer_risk", signal: "supports_start" }),
      adapter({ id: "transfer-b", kind: "transfer_reporting", dimension: "transfer_risk", signal: "opposes_start" })
    ];
    const item = buildCurrentRoleReport({ generatedAt, gameweek: 1, players: [player], adapters }).items[0];

    expect(item.assessments.currentManagerPreference.coverage).toBe("conflicting");
    expect(item.assessments.predictedLineupConsensus.coverage).toBe("conflicting");
    expect(item.assessments.transferRisk.coverage).toBe("conflicting");
    expect(item.assessments.transferRisk).toMatchObject({ supportsStart: true, opposesStart: true });
  });

  it("keeps historical confidence capped and missing lineup or odds coverage missing", () => {
    const missingLineups: RoleEvidenceAdapterInput = {
      config: { id: "lineups", kind: "predicted_lineup", provider: "Lineups", url: null, enabled: true, reliability: 1 }
    };
    const missingOdds: RoleEvidenceAdapterInput = {
      config: { id: "odds", kind: "bookmaker_market", provider: "Odds", url: null, enabled: true, reliability: 1 },
      coverage: { unsupported: 1 }
    };
    const report = buildCurrentRoleReport({
      generatedAt,
      gameweek: 1,
      players: [player],
      adapters: [missingLineups, missingOdds],
      selectedPlayerIds: [1]
    });
    const item = report.items[0];

    expect(item.confidence).toBe(0.45);
    expect(item.assessments.historicalRole).toMatchObject({
      coverage: "historical_only",
      evidenceConfidence: 0.45,
      reasonCodes: ["historical_only"]
    });
    expect(item.assessments.predictedLineupConsensus).toMatchObject({ coverage: "missing", evidenceConfidence: 0 });
    expect(report.adapters.find((entry) => entry.id === "odds")?.status).toBe("unsupported");
    expect(AdapterCoverageReportSchema.parse(report.adapterCoverage).totals.unsupported).toBe(1);
    expect(CurrentRoleReportSchema.parse(report).schemaVersion).toBe(2);
  });
});
