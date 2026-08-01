import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertVariantSlug,
  compareAuthoredVariants,
  listAuthoredVariants,
  renderVariantComparisonMarkdown,
  VariantComparisonReportSchema,
  variantRecommendationPath,
  verifyAuthoredVariant,
  type VariantSharedEvidence
} from "../src";
import { variantRecommendation, variantWeeklyStrategy } from "./fixtures/variantRecommendation";

const generatedAt = "2026-08-01T00:00:00.000Z";
const riskProfile = { transferHits: "balanced" };

function sharedEvidence(): VariantSharedEvidence {
  return {
    weeklyStrategy: variantWeeklyStrategy(),
    seasonPlanText: "# Authored season plan",
    evidenceReport: {
      generatedAt,
      gameweek: 1,
      summary: { fresh: 1, stale: 0, missing: 0, requiredMissing: 0, requiredStale: 0 },
      sources: [{
        id: "fixture",
        label: "Fixture source",
        provider: "test",
        url: null,
        rawPath: null,
        reportPath: "fixture-ticker.json",
        required: true,
        confidence: "high",
        freshness: {
          status: "fresh",
          checkedAt: generatedAt,
          fetchedAt: generatedAt,
          ageHours: 0,
          maxAgeHours: 24,
          message: "Fresh fixture evidence."
        }
      }],
      items: [],
      warnings: []
    },
    fixtureTicker: {
      gameweek: 1,
      horizon: 3,
      generatedAt,
      teams: Array.from({ length: 8 }, (_, index) => ({
        teamId: index + 1,
        teamName: `Team ${index + 1}`,
        shortName: `T${index + 1}`,
        fixtures: [{
          event: 1,
          opponentTeamId: ((index + 1) % 8) + 1,
          opponentName: `Team ${((index + 1) % 8) + 1}`,
          venue: index % 2 === 0 ? "H" : "A",
          difficulty: (index % 5) + 1,
          kickoffTime: generatedAt,
          finished: false
        }],
        fixtureCount: 1,
        blankCount: 0,
        doubleCount: 0,
        averageDifficulty: (index % 5) + 1,
        difficultySum: (index % 5) + 1
      }))
    },
    contextNotes: { teamNews: "Reviewed: yes", setPieces: "Reviewed: yes", watchlist: "Reviewed: yes" }
  };
}

describe("authored variant paths and discovery", () => {
  it("lists three fixture-backed variants deterministically", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fpl-variants-"));
    const variants = ["premium-balance", "deep-bench", "captain-upside"];

    for (const slug of variants) {
      const filePath = variantRecommendationPath(root, 1, slug);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(variantRecommendation())}\n`, "utf8");
    }

    expect(await listAuthoredVariants(root, 1)).toEqual([
      "captain-upside",
      "deep-bench",
      "premium-balance"
    ]);
  });

  it("returns an empty list when the gameweek has no variants", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fpl-variants-empty-"));
    expect(await listAuthoredVariants(root, 1)).toEqual([]);
  });

  it.each(["../escape", "UPPER", "two--hyphens", "trailing-", "with space", "."])(
    "rejects unsafe slug %s",
    (slug) => expect(() => assertVariantSlug(slug)).toThrow("Invalid variant slug")
  );
});

describe("authored variant verification", () => {
  it.each(["captain-upside", "deep-bench", "premium-balance"])(
    "independently verifies fixture-backed variant %s",
    (slug) => {
    const report = verifyAuthoredVariant({
      slug,
      recommendationPath: `${slug}/recommendation.json`,
      recommendation: variantRecommendation(),
      expectedGameweek: 1,
      generatedAt,
      riskProfile,
      evidence: sharedEvidence()
    });

    expect(report.verification.isValid).toBe(true);
    expect(report.verification.strategyQuality?.isValid).toBe(true);
    }
  );

  it("fails an illegal recommendation and a mismatched gameweek", () => {
    const illegal = variantRecommendation(2);
    illegal.captaincy.viceCaptainPlayerId = illegal.captaincy.captainPlayerId;
    const report = verifyAuthoredVariant({
      slug: "illegal",
      recommendationPath: "illegal/recommendation.json",
      recommendation: illegal,
      expectedGameweek: 1,
      generatedAt,
      riskProfile,
      evidence: sharedEvidence()
    });

    expect(report.verification.isValid).toBe(false);
    expect(report.verification.errors).toContain("Captain and vice-captain must be different players.");
    expect(report.verification.errors).toContain("Variant gameweek 2 does not match requested gameweek 1.");
  });
});

describe("authored variant comparison", () => {
  it("compares structure and shared evidence without selecting a winner", () => {
    const recommendationA = variantRecommendation();
    const recommendationB = variantRecommendation(1, 15);
    recommendationB.pickTeam.projectedPoints = 62;
    const evidence = sharedEvidence();
    const source = evidence.evidenceReport!.sources[0];
    evidence.minutesRiskReport = {
      generatedAt,
      gameweek: 1,
      source,
      summary: {
        playersReviewed: 1,
        selectedPlayers: 1,
        selectedStarters: 1,
        secure: 0,
        watch: 1,
        risky: 0,
        unknown: 0,
        selectedWatchOrWorse: 1,
        starterWatchOrWorse: 1
      },
      items: [{
        playerId: 1,
        name: "Variant Player 1",
        webName: "Player 1",
        teamId: 1,
        teamName: "Team 1",
        position: "GKP",
        status: "a",
        minutes: 900,
        selected: true,
        starting: true,
        benchPosition: null,
        historicalConfidence: "medium",
        predictedLineupConfidence: "unavailable",
        riskLevel: "watch",
        reasons: ["Limited minutes."],
        summary: "Minutes need review."
      }],
      warnings: []
    };
    evidence.setPieceReport = {
      generatedAt,
      gameweek: 1,
      source,
      summary: {
        rolePlayers: 1,
        selectedRolePlayers: 1,
        penaltyTakers: 1,
        directFreeKickTakers: 0,
        cornerAndIndirectFreeKickTakers: 0
      },
      items: [{
        playerId: 8,
        name: "Variant Player 8",
        webName: "Player 8",
        teamId: 8,
        teamName: "Team 8",
        position: "MID",
        role: "penalties",
        order: 1,
        selected: true,
        status: "a",
        confidence: "high",
        summary: "First penalty taker."
      }],
      warnings: []
    };
    evidence.oddsReport = {
      generatedAt,
      gameweek: 1,
      source,
      summary: {
        sourceRows: 1,
        premierLeagueRows: 1,
        gameweekFixtures: 1,
        matchedFixtures: 1,
        unmatchedFixtures: 0,
        selectedTeamsCovered: 1,
        coverageStatus: "partial",
        marketCoverage: {
          matchOdds: "covered",
          overUnder: "missing",
          cleanSheet: "missing",
          anytimeScorer: "missing",
          teamGoals: "missing"
        }
      },
      matches: [],
      teamSignals: [{
        teamId: 1,
        teamName: "Team 1",
        fixtureId: 1,
        event: 1,
        opponentTeamId: 2,
        opponentName: "Team 2",
        venue: "H",
        winProbability: 0.5,
        drawProbability: 0.25,
        lossProbability: 0.25,
        over25Probability: null,
        under25Probability: null,
        cleanSheetProbability: null,
        teamGoalsExpected: null,
        attackSignal: "unknown",
        cleanSheetSignal: "unknown",
        attackSignalSource: "unavailable",
        cleanSheetSignalSource: "unavailable",
        selectedPlayerIds: [1, 3],
        summary: "Match odds coverage."
      }],
      playerSignals: [],
      warnings: []
    };
    const report = compareAuthoredVariants({
      generatedAt,
      gameweek: 1,
      slugA: "balanced",
      slugB: "alternate-forward",
      recommendationPathA: "balanced/recommendation.json",
      recommendationPathB: "alternate-forward/recommendation.json",
      recommendationA,
      recommendationB,
      riskProfile,
      evidence
    });
    const markdown = renderVariantComparisonMarkdown(report);

    expect(report.comparison.onlyAPlayerIds).toEqual([15]);
    expect(report.comparison.onlyBPlayerIds).toEqual([114]);
    expect(report.comparison.summary.projectedPointsDelta).toBe(2);
    expect(report.evidence.a.fixtureDifficulty).not.toBeNull();
    expect(report.evidence.a.minutesWatchOrWorse).toBe(1);
    expect(report.evidence.a.playersWithOddsCoverage).toBe(2);
    expect(report.evidence.a.setPieceRolePlayers).toBe(1);
    expect(report.decisionPolicy).toContain("does not select, rank, or recommend");
    expect(VariantComparisonReportSchema.parse(report).schemaVersion).toBe(1);
    expect(markdown).toContain("Shared Evidence Comparison");
    expect(markdown).toContain("Price risk | Unavailable | Unavailable");
    expect(markdown.toLowerCase()).not.toContain("winner");
    expect(Object.keys(report)).not.toContain("selectedVariant");
  });

  it("shows missing optional evidence instead of failing", () => {
    const report = compareAuthoredVariants({
      generatedAt,
      gameweek: 1,
      slugA: "balanced",
      slugB: "alternate",
      recommendationPathA: "a/recommendation.json",
      recommendationPathB: "b/recommendation.json",
      recommendationA: variantRecommendation(),
      recommendationB: variantRecommendation(),
      riskProfile,
      evidence: {
        weeklyStrategy: variantWeeklyStrategy(),
        seasonPlanText: "# Season plan"
      }
    });

    expect(report.verification.a.isValid).toBe(true);
    expect(report.evidence.a.fixtureDifficulty).toBeNull();
    expect(report.evidence.a.evidenceGaps).toEqual(expect.arrayContaining([
      "fixture-horizon", "minutes", "odds", "price-risk", "roles"
    ]));
  });

  it("rejects comparison with the same variant", () => {
    expect(() => compareAuthoredVariants({
      generatedAt,
      gameweek: 1,
      slugA: "same",
      slugB: "same",
      recommendationPathA: "same/recommendation.json",
      recommendationPathB: "same/recommendation.json",
      recommendationA: variantRecommendation(),
      recommendationB: variantRecommendation(),
      riskProfile
    })).toThrow("requires two different slugs");
  });
});
