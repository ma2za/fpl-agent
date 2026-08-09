import type { CompetitionPhase } from "../../rules/src";
import type {
  ClaimLedgerV3,
  EpistemicClaim,
  LanguageValidationFinding,
  LanguageValidationReport,
  PhaseStatementPolicy,
  WeeklyRecommendation
} from "./types";

const evaluativeLanguage = /\b(favou?rs?|favou?rable|secure|safe|strong|weak|value|acceptable)\b/i;
const modelInterpretation = /\b(expected|projected|likely|probability|chance|xg)\b/i;
const priceMovementWarning = /\b(price[- ]?(rise|change|movement)|team value)\b/i;
const transferHitWarning = /\b(transfer hit|points hit|take a hit|taking a hit|minus four|four-point hit)\b/i;

export const PHASE_STATEMENT_POLICIES: Record<CompetitionPhase, PhaseStatementPolicy> = {
  PRESEASON_DRAFT: {
    phase: "PRESEASON_DRAFT",
    prohibitedWarningPatterns: [priceMovementWarning, transferHitWarning],
    validFlexibilityStatements: [
      "No direct upgrade path is available within the current budget.",
      "The draft constrains later changes within this price tier."
    ]
  },
  LIVE_GAMEWEEK: { phase: "LIVE_GAMEWEEK", prohibitedWarningPatterns: [], validFlexibilityStatements: [] },
  TRANSFER_WINDOW: { phase: "TRANSFER_WINDOW", prohibitedWarningPatterns: [], validFlexibilityStatements: [] },
  FINAL_LOCKDOWN: { phase: "FINAL_LOCKDOWN", prohibitedWarningPatterns: [], validFlexibilityStatements: [] },
  SEASON_COMPLETE: { phase: "SEASON_COMPLETE", prohibitedWarningPatterns: [], validFlexibilityStatements: [] }
};

function finding(
  claimId: string,
  phrase: string,
  rule: string,
  severity: LanguageValidationFinding["severity"],
  suggestedClaimKind: EpistemicClaim["kind"]
): LanguageValidationFinding {
  return { claimId, phrase, rule, severity, suggestedClaimKind };
}

function matchPhrase(text: string, pattern: RegExp) {
  return text.match(pattern)?.[0] ?? text;
}

export function isStatementAllowedForPhase(statement: string, phase: CompetitionPhase) {
  return !PHASE_STATEMENT_POLICIES[phase].prohibitedWarningPatterns.some((pattern) => pattern.test(statement));
}

export function validateEpistemicLanguage(
  ledger: ClaimLedgerV3,
  phase: CompetitionPhase,
  rationale: Array<{ id: string; text: string }> = []
): LanguageValidationReport {
  const findings: LanguageValidationFinding[] = [];

  for (const claim of [...ledger.observations, ...ledger.facts]) {
    const match = claim.claim.match(evaluativeLanguage);
    if (match && !(claim.kind === "OBSERVATION" && claim.isSourceQuote)) {
      findings.push(finding(
        claim.id,
        match[0],
        "evaluative-language-as-fact",
        "error",
        "FORECAST"
      ));
    }
    const interpretation = claim.claim.match(modelInterpretation);
    if (interpretation && !(claim.kind === "OBSERVATION" && claim.isSourceQuote)) {
      findings.push(finding(
        claim.id,
        interpretation[0],
        "model-interpretation-as-fact",
        "error",
        "FORECAST"
      ));
    }
  }

  const statements = [
    ...ledger.observations.map((claim) => ({ id: claim.id, text: claim.claim })),
    ...ledger.facts.map((claim) => ({ id: claim.id, text: claim.claim })),
    ...ledger.assumptions.map((claim) => ({ id: claim.id, text: claim.claim })),
    ...ledger.forecasts.map((claim) => ({ id: claim.id, text: claim.claim })),
    ...ledger.decisions.map((claim) => ({ id: claim.id, text: claim.claim })),
    ...rationale
  ];

  for (const statement of statements) {
    if (/\bcosts? more because\b.*\bcaptain/i.test(statement.text)) {
      findings.push(finding(statement.id, "costs more because", "unsupported-causality", "error", "DECISION"));
    }
    if (/\bhistorical minutes?\b.*\bguarantee(?:s|d)?\b.*\bstarts?\b/i.test(statement.text)) {
      findings.push(finding(statement.id, "historical minutes guarantee starts", "historical-minutes-guarantee", "error", "FORECAST"));
    }
    if (/\bownership\b.*\b(?:makes?|means?)\b.*\bsafe\b/i.test(statement.text)) {
      findings.push(finding(statement.id, "ownership makes this pick safe", "ownership-as-safety", "error", "DECISION"));
    }
    if (!isStatementAllowedForPhase(statement.text, phase)) {
      const pattern = PHASE_STATEMENT_POLICIES[phase].prohibitedWarningPatterns.find((item) => item.test(statement.text))!;
      findings.push(finding(
        statement.id,
        matchPhrase(statement.text, pattern),
        "phase-inapplicable-warning",
        "error",
        "DECISION"
      ));
    }
  }

  return { schemaVersion: 1, phase, isValid: findings.every((item) => item.severity !== "error"), findings };
}

export function recommendationRationale(recommendation: WeeklyRecommendation) {
  const statements: Array<{ id: string; text: string }> = [];

  function collect(value: unknown, path: string) {
    if (typeof value === "string") {
      statements.push({ id: `rationale:${path}`, text: value });
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => collect(item, `${path}.${index}`));
    } else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) collect(item, `${path}.${key}`);
    }
  }

  collect(recommendation.recommendedAction, "action");
  collect(recommendation.pickTeam, "team");
  collect(recommendation.captaincy, "captaincy");
  collect(recommendation.chip, "chip");
  collect(recommendation.topTransferCandidates, "transfer-candidates");
  collect(recommendation.confidence, "confidence");
  collect(recommendation.decisionAnalysis, "analysis");
  collect(recommendation.risks, "risks");
  collect(recommendation.whatWouldChangeMyMind, "change-conditions");

  return statements;
}
