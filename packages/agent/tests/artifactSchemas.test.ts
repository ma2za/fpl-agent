import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ArtifactSchemas,
  ArtifactValidationError,
  EvidenceReportSchema,
  RecommendationArtifactSchema,
  WeeklyStrategySchema,
  canonicalArtifactJson,
  canonicalizeArtifact,
  parseArtifactJson,
  readArtifactFile
} from "../src";

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

  it("exports every persisted artifact schema", () => {
    expect(Object.keys(ArtifactSchemas).sort()).toEqual([
      "evidenceReport",
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
