import { describe, expect, it } from "vitest";
import {
  CurrentRoleReportSchema,
  buildCurrentRoleReport,
  renderCurrentRoleReportMarkdown,
  type RoleEvidenceAdapterInput
} from "../src";

const generatedAt = "2026-08-01T12:00:00.000Z";
const player = {
  id: 1,
  name: "Role Player",
  status: "a",
  minutes: 3000,
  starts: 32,
  appearances: 34
};

function adapter(
  kind: RoleEvidenceAdapterInput["config"]["kind"],
  signal: "supports_start" | "opposes_start",
  observedAt = generatedAt,
  override = false
): RoleEvidenceAdapterInput {
  const sourceId = `src:${kind}-source`;
  const observationId = `role-obs:${kind}-source`;
  const sourceKind = kind === "predicted_lineup"
    ? "predicted_lineup"
    : kind === "preseason_lineup"
      ? "preseason_lineup"
      : kind === "manager_confirmation"
        ? "manager_comment"
        : "official_injury_update";
  return {
    config: {
      id: `${kind}-source`,
      kind,
      provider: `${kind} provider`,
      url: "https://example.test",
      enabled: true,
      reliability: 1
    },
    sources: [{
      id: sourceId,
      publisher: `${kind} publisher`,
      sourceType: kind === "official_club" ? "club" : "media",
      sourceKind,
      canonicalUrl: "https://example.test",
      reliability: 1,
      credibilityRationale: "Test root source."
    }],
    observations: [{
      id: observationId,
      adapterId: `${kind}-source`,
      playerId: 1,
      dimension: kind === "predicted_lineup" ? "predicted_lineup_consensus" : "current_manager_preference",
      signal,
      sourceIds: [sourceId],
      underlyingClaimId: `${kind}:player-1`,
      publishedAt: observedAt,
      retrievedAt: generatedAt,
      observedAt,
      capturedExcerpt: `${kind} test evidence.`,
      structuredValue: signal === "supports_start",
      adapterVersion: "1",
      contentHash: "0".repeat(64),
      credibility: { score: 1, label: "high", rationale: "Test evidence." },
      relevance: { score: 1, rationale: "Test evidence." },
      override,
      note: `${kind} test evidence.`
    }],
    records: [{
      playerId: 1,
      dimension: kind === "predicted_lineup" ? "predicted_lineup_consensus" : "current_manager_preference",
      signal,
      value: signal === "supports_start",
      observedAt,
      sourceIds: [sourceId],
      observationIds: [observationId],
      override,
      note: `${kind} test evidence.`
    }]
  };
}

describe("current-role evidence", () => {
  it("keeps historical-only evidence below READY", () => {
    const report = buildCurrentRoleReport({ generatedAt, gameweek: 1, players: [player], adapters: [], selectedPlayerIds: [1] });

    expect(report.items[0]).toMatchObject({
      status: "INSUFFICIENT",
      currentEvidencePresent: false,
      confidence: 0.45
    });
    expect(report.items[0].dimensions.historical_starts).toHaveLength(2);
    expect(CurrentRoleReportSchema.parse(report).summary.insufficient).toBe(1);
  });

  it("treats zero Premier League history as missing rather than evidence against a start", () => {
    const report = buildCurrentRoleReport({
      generatedAt,
      gameweek: 1,
      players: [{ ...player, minutes: 0, starts: 0, appearances: 0 }],
      adapters: [],
      selectedPlayerIds: [1]
    });

    expect(report.items[0].dimensions.historical_starts).toEqual([]);
    expect(report.items[0]).toMatchObject({
      status: "INSUFFICIENT",
      supportScore: 0.5,
      currentEvidencePresent: false
    });
  });

  it("applies source precedence and recency decay", () => {
    const report = buildCurrentRoleReport({
      generatedAt,
      gameweek: 1,
      players: [player],
      adapters: [
        adapter("manager_confirmation", "supports_start"),
        adapter("predicted_lineup", "opposes_start", "2026-05-01T12:00:00.000Z")
      ],
      selectedPlayerIds: [1]
    });

    expect(report.items[0].status).toBe("READY");
    expect(report.items[0].supportScore).toBeGreaterThan(0.9);
    expect(report.items[0].dimensions.current_manager_preference[0].effectiveWeight)
      .toBeGreaterThan(report.items[0].dimensions.predicted_lineup_consensus[0].effectiveWeight);
  });

  it("uses the historical evidence half-life independently", () => {
    const report = buildCurrentRoleReport({
      generatedAt,
      gameweek: 1,
      players: [{ ...player, historical_observed_at: "2026-06-02T12:00:00.000Z" }],
      adapters: [],
      selectedPlayerIds: [1]
    });

    const historical = report.items[0].dimensions.historical_starts;
    expect(historical.find((record) => record.sourceKind === "previous_season_starts")?.effectiveWeight).toBe(0.225);
    expect(historical.find((record) => record.sourceKind === "historical_minutes")?.effectiveWeight).toBe(0.15);
  });

  it("makes a reviewed manual override authoritative", () => {
    const report = buildCurrentRoleReport({
      generatedAt,
      gameweek: 1,
      players: [player],
      adapters: [
        adapter("official_club", "supports_start"),
        adapter("reviewed_manual", "opposes_start", generatedAt, true)
      ],
      selectedPlayerIds: [1]
    });

    expect(report.items[0]).toMatchObject({
      status: "INSUFFICIENT",
      supportScore: 0,
      confidence: 1,
      manualOverride: "opposes_start"
    });
  });

  it("exposes source disagreement and missing adapter coverage", () => {
    const report = buildCurrentRoleReport({
      generatedAt,
      gameweek: 1,
      players: [player],
      adapters: [
        adapter("official_club", "supports_start"),
        adapter("manager_confirmation", "opposes_start"),
        {
          config: {
            id: "preseason", kind: "preseason_lineup", provider: "Preseason provider",
            url: null, enabled: true, reliability: 0.8
          }
        },
        {
          config: {
            id: "availability", kind: "official_availability", provider: "Availability provider",
            url: null, enabled: true, reliability: 1
          },
          error: "capture failed"
        }
      ],
      selectedPlayerIds: [1]
    });

    expect(report.items[0].disagreement).toBe(true);
    expect(report.summary).toMatchObject({ disagreements: 1, missingAdapters: 1, failedAdapters: 1 });
    expect(renderCurrentRoleReportMarkdown(report)).toContain("capture failed");
  });
});
