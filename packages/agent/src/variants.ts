import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { evaluateWeeklyStrategyQuality } from "./strategy";
import { buildSquadRiskReport } from "./riskReport";
import { compareSquads, renderSquadComparisonMarkdown } from "./squadComparison";
import { verifyRecommendation, type VerifyRecommendationResult } from "./verification";
import type {
  EvidenceReport,
  FixtureTicker,
  MinutesRiskReport,
  OddsReport,
  PublicEvidenceReport,
  SetPieceReport,
  SquadComparison,
  SquadRiskReport,
  TeamNewsReport,
  WeeklyRecommendation,
  WeeklyStrategy
} from "./types";

export const VARIANT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type VariantSharedEvidence = {
  fixtureTicker?: FixtureTicker | null;
  teamNewsReport?: TeamNewsReport | null;
  setPieceReport?: SetPieceReport | null;
  oddsReport?: OddsReport | null;
  minutesRiskReport?: MinutesRiskReport | null;
  publicEvidenceReport?: PublicEvidenceReport | null;
  evidenceReport?: EvidenceReport | null;
  weeklyStrategy?: WeeklyStrategy | null;
  seasonPlanText?: string | null;
  dataStatus?: { dataMode?: "official" | "provisional" } | null;
  contextNotes?: {
    teamNews: string;
    setPieces: string;
    watchlist: string;
  };
};

export type VariantVerificationReport = {
  slug: string;
  recommendationPath: string;
  verification: VerifyRecommendationResult;
  riskReport: SquadRiskReport;
};

export type VariantEvidenceSummary = {
  fixtureDifficulty: number | null;
  fixtureCount: number | null;
  minutesWatchOrWorse: number | null;
  playersWithOddsCoverage: number | null;
  setPieceRolePlayers: number | null;
  priceRisk: null;
  evidenceGaps: string[];
};

export type VariantComparisonReport = {
  schemaVersion?: 1;
  generatedAt: string;
  gameweek: number;
  variants: { a: string; b: string };
  verification: {
    a: VerifyRecommendationResult;
    b: VerifyRecommendationResult;
  };
  comparison: SquadComparison;
  evidence: {
    a: VariantEvidenceSummary;
    b: VariantEvidenceSummary;
  };
  decisionPolicy: string;
};

export function assertVariantSlug(slug: string) {
  if (!VARIANT_SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid variant slug "${slug}". Use lowercase letters, digits, and single hyphens only.`);
  }

  return slug;
}

export function variantDirectory(recommendationsRoot: string, gameweek: number, slug: string) {
  assertVariantSlug(slug);

  if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
    throw new Error(`Invalid gameweek "${gameweek}". Expected an integer from 1 to 38.`);
  }

  return path.join(recommendationsRoot, `gw-${gameweek}`, "variants", slug);
}

export function variantRecommendationPath(recommendationsRoot: string, gameweek: number, slug: string) {
  return path.join(variantDirectory(recommendationsRoot, gameweek, slug), "recommendation.json");
}

export async function listAuthoredVariants(recommendationsRoot: string, gameweek: number) {
  const variantsDir = path.join(recommendationsRoot, `gw-${gameweek}`, "variants");
  let entries;

  try {
    entries = await readdir(variantsDir, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const slugs: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !VARIANT_SLUG_PATTERN.test(entry.name)) {
      continue;
    }

    try {
      await access(path.join(variantsDir, entry.name, "recommendation.json"));
      slugs.push(entry.name);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
  }

  return slugs.sort((a, b) => a.localeCompare(b));
}

function freshnessWarnings(evidenceReport: EvidenceReport | null | undefined) {
  if (!evidenceReport) {
    return ["Shared evidence report is unavailable."];
  }

  return evidenceReport.sources
    .filter((source) => source.freshness.status !== "fresh")
    .map((source) => `${source.label} evidence is ${source.freshness.status}: ${source.freshness.message}`);
}

export function verifyAuthoredVariant(input: {
  slug: string;
  recommendationPath: string;
  recommendation: WeeklyRecommendation;
  expectedGameweek: number;
  generatedAt: string;
  riskProfile: Record<string, string>;
  evidence?: VariantSharedEvidence;
  forceDeadline?: boolean;
}): VariantVerificationReport {
  assertVariantSlug(input.slug);
  const evidence = input.evidence ?? {};
  const verification = verifyRecommendation(input.recommendation, {
    forceDeadline: input.forceDeadline
  });
  const strategyQuality = evaluateWeeklyStrategyQuality({
    weeklyStrategy: evidence.weeklyStrategy ?? null,
    recommendation: input.recommendation,
    seasonPlanText: evidence.seasonPlanText ?? null,
    riskProfile: input.riskProfile
  });
  const gameweekErrors = input.recommendation.gameweek === input.expectedGameweek
    ? []
    : [`Variant gameweek ${input.recommendation.gameweek} does not match requested gameweek ${input.expectedGameweek}.`];
  const riskReport = buildSquadRiskReport({
    generatedAt: input.generatedAt,
    recommendation: input.recommendation,
    dataStatus: evidence.dataStatus,
    fixtureTicker: evidence.fixtureTicker,
    teamNewsReport: evidence.teamNewsReport,
    setPieceReport: evidence.setPieceReport,
    oddsReport: evidence.oddsReport,
    minutesRiskReport: evidence.minutesRiskReport,
    publicEvidenceReport: evidence.publicEvidenceReport,
    contextNotes: evidence.contextNotes ?? {
      teamNews: "",
      setPieces: "",
      watchlist: ""
    }
  });

  verification.strategyQuality = strategyQuality;
  verification.errors = [...verification.errors, ...gameweekErrors, ...strategyQuality.errors];
  verification.warnings = [
    ...verification.warnings,
    ...strategyQuality.warnings,
    ...(evidence.evidenceReport?.warnings ?? []),
    ...freshnessWarnings(evidence.evidenceReport)
  ];
  verification.isValid = verification.isValid && gameweekErrors.length === 0 && strategyQuality.isValid;

  return {
    slug: input.slug,
    recommendationPath: input.recommendationPath,
    verification,
    riskReport
  };
}

function average(values: number[]) {
  return values.length === 0 ? null : Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function summarizeEvidence(
  recommendation: WeeklyRecommendation,
  riskReport: SquadRiskReport,
  evidence: VariantSharedEvidence
): VariantEvidenceSummary {
  const playerIds = new Set(recommendation.squadBefore.players.map((player) => player.id));
  const teamIds = new Set(recommendation.squadBefore.players.map((player) => player.teamId));
  const fixtureTeams = evidence.fixtureTicker?.teams.filter((team) => teamIds.has(team.teamId)) ?? [];
  const fixtureDifficulties = fixtureTeams.flatMap((team) => team.fixtures.map((fixture) => fixture.difficulty));
  const minuteItems = evidence.minutesRiskReport?.items.filter((item) => playerIds.has(item.playerId));
  const oddsTeams = evidence.oddsReport?.teamSignals.filter((signal) => teamIds.has(signal.teamId));
  const coveredTeamIds = new Set(
    oddsTeams
      ?.filter((signal) => signal.winProbability !== null || signal.cleanSheetProbability !== null || signal.teamGoalsExpected !== null)
      .map((signal) => signal.teamId) ?? []
  );
  const roleItems = evidence.setPieceReport?.items.filter((item) => playerIds.has(item.playerId));
  const evidenceGaps = riskReport.evidenceGaps
    .filter((gap) => gap.status === "missing")
    .map((gap) => gap.area);

  if (!evidence.fixtureTicker) evidenceGaps.push("fixture-horizon");
  if (!evidence.minutesRiskReport) evidenceGaps.push("minutes");
  if (!evidence.oddsReport) evidenceGaps.push("odds");
  if (!evidence.setPieceReport) evidenceGaps.push("roles");
  evidenceGaps.push("price-risk");

  return {
    fixtureDifficulty: evidence.fixtureTicker ? average(fixtureDifficulties) : null,
    fixtureCount: evidence.fixtureTicker ? fixtureDifficulties.length : null,
    minutesWatchOrWorse: minuteItems
      ? minuteItems.filter((item) => item.riskLevel !== "secure").length
      : null,
    playersWithOddsCoverage: evidence.oddsReport
      ? recommendation.squadBefore.players.filter((player) => coveredTeamIds.has(player.teamId)).length
      : null,
    setPieceRolePlayers: roleItems ? new Set(roleItems.map((item) => item.playerId)).size : null,
    priceRisk: null,
    evidenceGaps: [...new Set(evidenceGaps)].sort((a, b) => a.localeCompare(b))
  };
}

export function compareAuthoredVariants(input: {
  generatedAt: string;
  gameweek: number;
  slugA: string;
  slugB: string;
  recommendationPathA: string;
  recommendationPathB: string;
  recommendationA: WeeklyRecommendation;
  recommendationB: WeeklyRecommendation;
  riskProfile: Record<string, string>;
  evidence?: VariantSharedEvidence;
  forceDeadline?: boolean;
}): VariantComparisonReport {
  assertVariantSlug(input.slugA);
  assertVariantSlug(input.slugB);

  if (input.slugA === input.slugB) {
    throw new Error("Variant comparison requires two different slugs.");
  }

  const evidence = input.evidence ?? {};
  const verifiedA = verifyAuthoredVariant({
    slug: input.slugA,
    recommendationPath: input.recommendationPathA,
    recommendation: input.recommendationA,
    expectedGameweek: input.gameweek,
    generatedAt: input.generatedAt,
    riskProfile: input.riskProfile,
    evidence,
    forceDeadline: input.forceDeadline
  });
  const verifiedB = verifyAuthoredVariant({
    slug: input.slugB,
    recommendationPath: input.recommendationPathB,
    recommendation: input.recommendationB,
    expectedGameweek: input.gameweek,
    generatedAt: input.generatedAt,
    riskProfile: input.riskProfile,
    evidence,
    forceDeadline: input.forceDeadline
  });
  const comparison = compareSquads({
    generatedAt: input.generatedAt,
    labelA: input.slugA,
    labelB: input.slugB,
    recommendationA: input.recommendationA,
    recommendationB: input.recommendationB,
    qualityA: verifiedA.verification.quality,
    qualityB: verifiedB.verification.quality,
    riskSummaryA: verifiedA.riskReport.summary,
    riskSummaryB: verifiedB.riskReport.summary
  });

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    gameweek: input.gameweek,
    variants: { a: input.slugA, b: input.slugB },
    verification: {
      a: verifiedA.verification,
      b: verifiedB.verification
    },
    comparison,
    evidence: {
      a: summarizeEvidence(input.recommendationA, verifiedA.riskReport, evidence),
      b: summarizeEvidence(input.recommendationB, verifiedB.riskReport, evidence)
    },
    decisionPolicy: "This report presents evidence only. It does not select, rank, or recommend a variant."
  };
}

function metric(value: number | null, suffix = "") {
  return value === null ? "Unavailable" : `${value}${suffix}`;
}

export function renderVariantComparisonMarkdown(report: VariantComparisonReport) {
  const a = report.evidence.a;
  const b = report.evidence.b;

  return `${renderSquadComparisonMarkdown(report.comparison)}
## Shared Evidence Comparison

| Metric | ${report.variants.a} | ${report.variants.b} |
| --- | ---: | ---: |
| Fixture difficulty | ${metric(a.fixtureDifficulty)} | ${metric(b.fixtureDifficulty)} |
| Fixture count | ${metric(a.fixtureCount)} | ${metric(b.fixtureCount)} |
| Minutes watch or worse | ${metric(a.minutesWatchOrWorse)} | ${metric(b.minutesWatchOrWorse)} |
| Players with odds coverage | ${metric(a.playersWithOddsCoverage)} | ${metric(b.playersWithOddsCoverage)} |
| Set-piece role players | ${metric(a.setPieceRolePlayers)} | ${metric(b.setPieceRolePlayers)} |
| Price risk | Unavailable | Unavailable |

Evidence gaps for ${report.variants.a}: ${a.evidenceGaps.join(", ") || "None"}

Evidence gaps for ${report.variants.b}: ${b.evidenceGaps.join(", ") || "None"}

## Decision Boundary

${report.decisionPolicy}
`;
}
