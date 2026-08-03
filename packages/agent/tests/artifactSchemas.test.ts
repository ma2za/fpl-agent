import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ArtifactSchemas,
  ArtifactValidationError,
  AgentDecisionArtifactSchema,
  CandidateArtifactSchema,
  EvidenceReportSchema,
  FixtureHorizonReportSchema,
  RecommendationArtifactSchema,
  ToolEvidenceArtifactSchema,
  WeeklyStrategySchema,
  canonicalArtifactJson,
  canonicalizeArtifact,
  parseArtifactJson,
  readArtifactFile
} from "../src";
import { variantRecommendation } from "./fixtures/variantRecommendation";

const fixtureDir = path.join("packages", "agent", "tests", "fixtures", "legacy-artifacts");

describe("artifact schemas", () => {
  it("reads legacy fixtures without schemaVersion", async () => {
    const recommendation = await readArtifactFile(
      path.join(fixtureDir, "recommendation-template.json"),
      RecommendationArtifactSchema
    );
    const evidence = await readArtifactFile(
      path.join(fixtureDir, "evidence-report.json"),
      EvidenceReportSchema
    );
    const strategy = await readArtifactFile(
      path.join(fixtureDir, "weekly-strategy.json"),
      WeeklyStrategySchema
    );

    expect(recommendation.schemaVersion).toBeUndefined();
    expect(evidence.schemaVersion).toBeUndefined();
    expect(strategy.schemaVersion).toBeUndefined();
  });

  it("accepts schema version 1 and preserves additive keys", async () => {
    const fixture = JSON.parse(
      await readFile(path.join(fixtureDir, "evidence-report.json"), "utf8")
    );
    const parsed = EvidenceReportSchema.parse({
      ...fixture,
      schemaVersion: 1,
      additiveField: "preserved"
    });

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.additiveField).toBe("preserved");
  });

  it("rejects unsupported schema versions", async () => {
    const fixture = JSON.parse(
      await readFile(path.join(fixtureDir, "weekly-strategy.json"), "utf8")
    );

    expect(() => WeeklyStrategySchema.parse({ ...fixture, schemaVersion: 2 })).toThrow();
  });

  it("separates tool, candidate, and agent decision artifacts", () => {
    const tool = {
      schemaVersion: 2,
      artifactKind: "tool_evidence",
      generatedAt: "2026-08-01T00:00:00.000Z",
      tool: "test-tool",
      payload: { players: [1, 2, 3] }
    } as const;
    const candidate = {
      schemaVersion: 2,
      artifactKind: "candidate",
      generatedAt: "2026-08-01T00:00:00.000Z",
      scenarioId: "test-scenario",
      payload: { playerIds: [1, 2, 3] }
    } as const;
    const decision = variantRecommendation();

    expect(ToolEvidenceArtifactSchema.parse(tool).artifactKind).toBe("tool_evidence");
    expect(CandidateArtifactSchema.parse(candidate).artifactKind).toBe("candidate");
    expect(AgentDecisionArtifactSchema.parse(decision).artifactKind).toBe("agent_decision");
    expect(AgentDecisionArtifactSchema.safeParse(tool).success).toBe(false);
    expect(AgentDecisionArtifactSchema.safeParse(candidate).success).toBe(false);
    expect(ToolEvidenceArtifactSchema.safeParse(decision).success).toBe(false);
    expect(CandidateArtifactSchema.safeParse(decision).success).toBe(false);
  });

  it("rejects malformed fixture horizon artifacts at the read boundary", () => {
    expect(() => parseArtifactJson(
      JSON.stringify({
        generatedAt: "2026-08-01T00:00:00.000Z",
        gameweek: 1,
        source: {},
        thresholds: {},
        teams: "invalid",
        exposures: [],
        warnings: []
      }),
      FixtureHorizonReportSchema,
      "fixture-horizon-report.json"
    )).toThrow(/fixture-horizon-report\.json[\s\S]*teams/);
  });

  it("exports every persisted artifact schema", () => {
    expect(Object.keys(ArtifactSchemas).sort()).toEqual([
      "agentDecision",
      "candidate",
      "claimLedger",
      "evidenceReport",
      "fixtureHorizonReport",
      "fixtureTicker",
      "legalityReport",
      "minutesRiskReport",
      "oddsReport",
      "publicEvidenceReport",
      "recommendation",
      "riskReport",
      "setPieceReport",
      "strategyEvidence",
      "teamNewsReport",
      "toolEvidence",
      "variantComparison",
      "weeklyStrategy"
    ]);
  });
});

describe("artifact IO", () => {
  it("reports malformed JSON with the file path", () => {
    expect(() => parseArtifactJson("{", EvidenceReportSchema, "broken.json")).toThrow(
      /Invalid artifact broken\.json/
    );
  });

  it("reports field-level validation issues", () => {
    expect(() =>
      parseArtifactJson(
        JSON.stringify({
          generatedAt: "now",
          gameweek: "one"
        }),
        EvidenceReportSchema,
        "evidence-report.json"
      )
    ).toThrow(/gameweek/);
  });

  it("uses a dedicated validation error", () => {
    expect(() => parseArtifactJson("null", EvidenceReportSchema)).toThrow(
      ArtifactValidationError
    );
  });
});

describe("artifact canonicalization", () => {
  it("removes generated timestamps and sorts object keys", () => {
    const first = {
      z: 1,
      generatedAt: "first",
      nested: {
        b: 2,
        createdAt: "first",
        a: 1
      }
    };
    const second = {
      nested: {
        a: 1,
        createdAt: "second",
        b: 2
      },
      generatedAt: "second",
      z: 1
    };

    expect(canonicalArtifactJson(first)).toBe(canonicalArtifactJson(second));
    expect(canonicalizeArtifact(first)).toEqual({
      nested: {
        a: 1,
        b: 2
      },
      z: 1
    });
  });

  it("preserves array ordering", () => {
    expect(canonicalizeArtifact({ benchOrder: [2, 6, 12, 7] })).toEqual({
      benchOrder: [2, 6, 12, 7]
    });
  });
});
