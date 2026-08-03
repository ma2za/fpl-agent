import { describe, expect, it } from "vitest";
import {
  ClaimLedgerSchema,
  adaptLegacyRecommendationProvenance,
  countIndependentSources,
  validateClaimLedger,
  type ClaimLedger
} from "../src";
import { testClaimLedger, variantRecommendation } from "./fixtures/variantRecommendation";

function transformedLedger(): ClaimLedger {
  return {
    schemaVersion: 1,
    sources: [
      { id: "src:fpl", publisher: "Fantasy Premier League", sourceType: "official", uri: "https://example.test/api" },
      { id: "src:fpl-copy", publisher: "Fantasy Premier League", sourceType: "official", uri: "https://example.test/page" }
    ],
    observations: [
      {
        id: "obs:status", sourceId: "src:fpl", claim: "Player is available.",
        observedAt: "2026-08-01T10:00:00Z", retrievedAt: "2026-08-01T10:01:00Z",
        reliability: 0.9, freshness: "fresh", value: "a"
      },
      {
        id: "obs:status-copy", sourceId: "src:fpl-copy", claim: "Player is available.",
        observedAt: "2026-08-01T10:00:00Z", retrievedAt: "2026-08-01T10:02:00Z",
        reliability: 0.9, freshness: "fresh", value: "a"
      }
    ],
    facts: [
      {
        id: "fact:status-json", claim: "Player is available.", observationIds: ["obs:status"],
        transformationId: "tx:json-report"
      },
      {
        id: "fact:status-md", claim: "Player is available.", observationIds: ["obs:status"],
        transformationId: "tx:markdown-report"
      }
    ],
    assumptions: [{
      id: "asm:availability", claim: "Availability persists to deadline.", factIds: ["fact:status-json"],
      model: "availability-review", modelVersion: "1.0.0"
    }],
    transformations: [
      {
        id: "tx:json-report", tool: "team-news", toolVersion: "0.0.8", reportPath: "team-news.json",
        inputIds: ["obs:status"], outputFactIds: ["fact:status-json"]
      },
      {
        id: "tx:markdown-report", tool: "team-news", toolVersion: "0.0.8", reportPath: "team-news.md",
        inputIds: ["obs:status"], outputFactIds: ["fact:status-md"]
      }
    ],
    decisions: [{
      id: "dec:squad", area: "squad", factIds: ["fact:status-json", "fact:status-md"],
      assumptionIds: ["asm:availability"]
    }]
  };
}

describe("claim provenance", () => {
  it("validates complete lineage and counts originating publishers by claim", () => {
    const ledger = ClaimLedgerSchema.parse(transformedLedger());
    const result = validateClaimLedger(ledger);

    expect(result.isValid).toBe(true);
    expect(countIndependentSources(ledger)).toEqual([{
      claim: "Player is available.", publishers: ["Fantasy Premier League"], independentSourceCount: 1
    }]);
  });

  it("rejects orphaned references", () => {
    const ledger = testClaimLedger();
    ledger.facts[0].observationIds = ["obs:missing"];

    expect(validateClaimLedger(ledger).errors).toContain(
      "Fact fact:test references missing observation obs:missing."
    );
  });

  it("rejects circular dependencies", () => {
    const ledger = transformedLedger();
    ledger.transformations[0].inputIds = ["fact:status-json"];

    expect(validateClaimLedger(ledger).errors.some((error) => error.includes("circular dependency"))).toBe(true);
  });

  it("adapts legacy recommendations without inventing provenance", () => {
    const legacy = { ...variantRecommendation(), schemaVersion: 1 as const, artifactKind: undefined };
    const adapted = adaptLegacyRecommendationProvenance(legacy);

    expect(adapted.claimLedger).toBeNull();
    expect(adapted.warnings).toHaveLength(1);
  });
});
