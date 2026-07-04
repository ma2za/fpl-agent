import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeRecommendationFiles, type WeeklyRecommendation } from "../src";

const recommendation: WeeklyRecommendation = {
  gameweek: 1,
  createdAt: "2026-07-04T00:00:00.000Z",
  deadline: "unknown",
  deadlineStatus: "unknown",
  dataMode: "provisional",
  squadBefore: {
    bank: 1,
    freeTransfers: 1,
    chipsAvailable: ["wildcard", "free_hit", "bench_boost", "triple_captain"],
    players: [
      { id: 1, name: "Goalkeeper", position: "GKP", teamId: 1, price: 4.5, nowCost: 45, status: "a" },
      { id: 2, name: "Defender", position: "DEF", teamId: 1, price: 5, nowCost: 50, status: "a" },
      { id: 3, name: "Midfielder", position: "MID", teamId: 2, price: 8, nowCost: 80, status: "a" },
      { id: 4, name: "Forward", position: "FWD", teamId: 3, price: 9, nowCost: 90, status: "a" },
      { id: 5, name: "Bench GK", position: "GKP", teamId: 4, price: 4, nowCost: 40, status: "a" }
    ]
  },
  recommendedAction: {
    type: "roll",
    transfers: [],
    transferCost: 0,
    bankAfter: 1,
    explanation: "No transfer action."
  },
  pickTeam: {
    formation: "3-4-3",
    startingXI: [1, 2, 3, 4],
    benchOrder: [5],
    projectedPoints: 50,
    explanation: "Fixture test pick."
  },
  captaincy: {
    captainPlayerId: 3,
    viceCaptainPlayerId: 4,
    alternatives: [],
    explanation: "Fixture test captaincy."
  },
  chip: {
    chip: "none",
    confidence: "high",
    expectedGain: 0,
    reasons: ["No chip clears threshold."],
    warnings: ["Manual confirmation required."]
  },
  topTransferCandidates: [],
  confidence: {
    score: 0.3,
    label: "low",
    explanation: "Fixture test confidence."
  },
  risks: ["Fixture test risk."],
  whatWouldChangeMyMind: ["Fixture test condition."],
  legality: {
    isValid: true,
    errors: [],
    warnings: []
  },
  manualExecutionRequired: true
};

describe("writeRecommendationFiles", () => {
  it("writes JSON and markdown files for legal recommendations", async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), "fpl-agent-rec-"));

    await writeRecommendationFiles(outputDir, {
      recommendation,
      projections: [],
      transferCandidates: [],
      captainCandidates: [],
      legalityReport: recommendation.legality
    });

    await expect(readFile(path.join(outputDir, "recommendation.json"), "utf8")).resolves.toContain(
      "\"manualExecutionRequired\": true"
    );
    await expect(readFile(path.join(outputDir, "manual-checklist.md"), "utf8")).resolves.toContain(
      "Final Human Confirmation"
    );
    await expect(readFile(path.join(outputDir, "agent-brief.md"), "utf8")).resolves.toContain(
      "Agent Judgment Required"
    );
  });

  it("does not write final markdown when legality fails", async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), "fpl-agent-rec-"));
    const legalityReport = {
      isValid: false,
      errors: ["Illegal test recommendation."],
      warnings: []
    };

    await writeRecommendationFiles(outputDir, {
      recommendation: { ...recommendation, legality: legalityReport },
      projections: [],
      transferCandidates: [],
      captainCandidates: [],
      legalityReport
    });

    await expect(readFile(path.join(outputDir, "legality-report.json"), "utf8")).resolves.toContain(
      "Illegal test recommendation."
    );
    await expect(readFile(path.join(outputDir, "agent-brief.md"), "utf8")).resolves.toContain(
      "Legality: invalid"
    );
    await expect(readFile(path.join(outputDir, "manual-checklist.md"), "utf8")).rejects.toThrow();
  });
});
