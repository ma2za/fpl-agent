import {
  validateBench,
  validateCaptaincy,
  validateChip,
  validateDeadline,
  validateSquad,
  validateStartingXI,
  validateTransfers,
  validateCompetitionAction,
  type ValidationResult
} from "../../rules/src";
import { evaluateRecommendationQuality } from "./quality";
import { recommendationRationale, validateEpistemicLanguage } from "./epistemic";
import { evaluatePublicationGate, type PublicationGate } from "./decisionConsistency";
import { validateClaimLedger } from "./provenance";
import type {
  LanguageValidationReport,
  RecommendationQualityReport,
  StrategyQualityReport,
  WeeklyRecommendation
} from "./types";

const REQUIRED_PUBLIC_NEWS_ARTICLES_PER_SQUAD = 5;
const PUBLIC_NEWS_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function publicNewsCoverageErrors(recommendation: WeeklyRecommendation) {
  const errors: string[] = [];
  const selectedPlayers = new Set(recommendation.squadBefore.players.map((player) => player.id));
  const selectedAt = Date.parse(recommendation.createdAt);
  const articleUrls = new Set<string>();

  for (const article of recommendation.publicNewsArticles ?? []) {
    if (!selectedPlayers.has(article.playerId)) continue;

    const publishedAt = Date.parse(article.publishedAt);
    const retrievedAt = Date.parse(article.retrievedAt);
    const validUrl = /^https?:\/\//i.test(article.url);
    const recent = Number.isFinite(selectedAt) && Number.isFinite(publishedAt) &&
      publishedAt <= selectedAt && selectedAt - publishedAt <= PUBLIC_NEWS_MAX_AGE_MS;

    if (!article.publisher.trim() || !article.title.trim() || !validUrl || !Number.isFinite(retrievedAt) || !recent) continue;

    articleUrls.add(article.url);
  }

  if (articleUrls.size < REQUIRED_PUBLIC_NEWS_ARTICLES_PER_SQUAD) {
    errors.push(`Selected squad requires ${REQUIRED_PUBLIC_NEWS_ARTICLES_PER_SQUAD} distinct public-news articles published within 14 days of selection; found ${articleUrls.size}.`);
  }

  return errors;
}

export type VerifyRecommendationOptions = {
  forceDeadline?: boolean;
  selectedPlayerEvidence?: Array<{
    playerId: number;
    status: "READY" | "CAUTION" | "INSUFFICIENT";
    reasonCodes: string[];
  }> | null;
  roleDecisionSnapshot?: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
};

export type VerifyRecommendationResult = ValidationResult & {
  quality: RecommendationQualityReport;
  strategyQuality?: StrategyQualityReport;
  languageValidation?: LanguageValidationReport;
  publicationGate: PublicationGate;
};

function mergeResults(...results: ValidationResult[]): ValidationResult {
  return {
    isValid: results.every((result) => result.isValid),
    errors: results.flatMap((result) => result.errors),
    warnings: results.flatMap((result) => result.warnings)
  };
}

function transferPlanningWarnings(recommendation: WeeklyRecommendation) {
  if (recommendation.decisionContext?.phase !== "TRANSFER_WINDOW" ||
      !["transfer", "hit", "roll"].includes(recommendation.recommendedAction.type)) return [];
  const warnings: string[] = [];
  const horizon = recommendation.decisionPolicy?.horizon;
  const supportedHorizon = horizon === "GW1" || horizon === "GW1-3" || horizon === "GW1-5";
  const planned = recommendation.topTransferCandidates.filter((candidate) => candidate.planning);
  if (planned.length !== recommendation.topTransferCandidates.length) {
    warnings.push("Transfer options without 0.0.26 planning metadata remain readable but do not expose option value, liquidity, downside, or reachable next-gameweek squads.");
  }
  if (!supportedHorizon) return warnings;

  for (const candidate of planned) {
    const planning = candidate.planning!;
    const rankingGain = horizon === "GW1"
      ? candidate.expectedGain1GW
      : horizon === "GW1-3"
        ? candidate.expectedGain3GW
        : candidate.expectedGain5GW;
    if (planning.rankingHorizon !== horizon) {
      warnings.push(`Transfer option ${candidate.id} planning horizon ${planning.rankingHorizon} does not match canonical horizon ${horizon}.`);
    }
    if (planning.immediateGain !== candidate.expectedGain1GW || planning.rankingGain !== rankingGain) {
      warnings.push(`Transfer option ${candidate.id} planning gains do not match its compatibility gain fields.`);
    }
  }

  return warnings;
}

function actionErrors(recommendation: WeeklyRecommendation) {
  const errors: string[] = [];
  const squadIds = new Set(recommendation.squadBefore.players.map((player) => player.id));

  if (
    recommendation.schemaVersion !== 2 ||
    recommendation.artifactKind !== "agent_decision" ||
    recommendation.authorship?.kind !== "coding_agent" ||
    !recommendation.authorship.agent.trim() ||
    !recommendation.authorship.authoredAt.trim()
  ) {
    errors.push("Final recommendation must be a schema v2 coding-agent-authored decision artifact.");
  }

  if (!recommendation.decisionContext) {
    errors.push("Final recommendation must include its competition decision context.");
  } else {
    errors.push(...validateCompetitionAction({
      phase: recommendation.decisionContext.phase,
      action: recommendation.recommendedAction.type
    }).errors);

    if (
      recommendation.decisionContext.phase === "PRESEASON_DRAFT" &&
      recommendation.recommendedAction.transferCost !== 0
    ) {
      errors.push("Preseason draft actions cannot have a transfer cost.");
    }
  }

  if (!recommendation.claimLedger || !recommendation.decisionIds?.length) {
    errors.push("Final recommendation must include a claim ledger and decision dependencies.");
  } else {
    errors.push(...validateClaimLedger(recommendation.claimLedger).errors);
    if (recommendation.claimLedger.schemaVersion !== 3) {
      errors.push("Final recommendation must use a claim ledger v3 with explicit epistemic claim kinds.");
    }
    const ledgerDecisionIds = new Set(recommendation.claimLedger.decisions.map((decision) => decision.id));
    for (const decisionId of recommendation.decisionIds) {
      if (!ledgerDecisionIds.has(decisionId)) {
        errors.push(`Recommendation references missing provenance decision ${decisionId}.`);
      }
    }
    for (const decisionId of ledgerDecisionIds) {
      if (!recommendation.decisionIds.includes(decisionId)) {
        errors.push(`Claim ledger decision ${decisionId} is not referenced by the recommendation.`);
      }
    }
    const decisionAreas = new Set(recommendation.claimLedger.decisions.map((decision) => decision.area));
    for (const area of new Set(recommendation.evidenceReferences.map((reference) => reference.area))) {
      if (!decisionAreas.has(area)) errors.push(`Claim ledger is missing dependencies for ${area}.`);
    }
  }

  errors.push(...publicNewsCoverageErrors(recommendation));

  if (
    [
      "retain_draft",
      "wait_for_information",
      "lock_draft",
      "monitor",
      "review_live_gameweek",
      "roll",
      "wait_for_finalization",
      "review_season"
    ].includes(recommendation.recommendedAction.type) &&
    recommendation.recommendedAction.transfers.length > 0
  ) {
    errors.push(`Action ${recommendation.recommendedAction.type} cannot contain player moves.`);
  }

  if (recommendation.manualExecutionRequired !== true) {
    errors.push("Recommendation must require manual execution.");
  }

  if (
    recommendation.decisionContext?.phase === "TRANSFER_WINDOW" &&
    ["transfer", "hit", "roll"].includes(recommendation.recommendedAction.type)
  ) {
    const options = recommendation.topTransferCandidates;
    const transfers = options.filter((candidate) => ["transfer", "hit"].includes(candidate.type));
    const rolls = options.filter((candidate) => candidate.type === "roll");
    if (transfers.length !== 5 || rolls.length !== 1 || options.length !== 6) {
      errors.push("Transfer-window recommendations must publish five ranked transfer options plus one roll baseline.");
    }
    if (options.some((candidate) => !candidate.isLegal)) {
      errors.push("Published transfer options must all be legal.");
    }
    if (new Set(options.map((candidate) => candidate.id)).size !== options.length) {
      errors.push("Published transfer options must have unique candidate IDs.");
    }
    const moveSignatures = options.map((candidate) => candidate.moves
      .map((move) => `${move.sellPlayerId}>${move.buyPlayerId}`)
      .sort()
      .join(",") || "roll");
    if (new Set(moveSignatures).size !== moveSignatures.length) {
      errors.push("Published transfer options must represent distinct actions.");
    }
    const horizon = recommendation.decisionPolicy?.horizon;
    const gain = (candidate: WeeklyRecommendation["topTransferCandidates"][number]) =>
      horizon === "GW1"
        ? candidate.expectedGain1GW
        : horizon === "GW1-3"
          ? candidate.expectedGain3GW
          : horizon === "GW1-5"
            ? candidate.expectedGain5GW
            : null;
    const plannedRanking = transfers.every((candidate) => candidate.planning !== undefined);
    const rankedGains = plannedRanking
      ? transfers.map((candidate) => candidate.planning!.decisionValue)
      : transfers.map(gain);
    if (rankedGains.some((value) => value === null)) {
      errors.push(`The canonical transfer ranking horizon ${horizon ?? "unavailable"} has unavailable option values.`);
    } else if (rankedGains.some((value, index) => index > 0 && rankedGains[index - 1]! < value!)) {
      errors.push("The five transfer options must be ranked by expected gain over the canonical decision horizon.");
    }
    const selectedSignature = recommendation.recommendedAction.transfers
      .map((move) => `${move.sellPlayerId}>${move.buyPlayerId}`)
      .sort()
      .join(",") || "roll";
    if (!moveSignatures.includes(selectedSignature)) {
      errors.push("The recommended action must appear in the published transfer options.");
    }
    const evaluated = new Set(
      recommendation.decisionEvaluations
        ?.find((evaluation) => evaluation.decisionType === "transfers")
        ?.candidateScores.map((candidate) => candidate.candidateId) ?? []
    );
    const unevaluated = options.filter((candidate) => {
      const signature = candidate.moves.map((move) => `${move.sellPlayerId}>${move.buyPlayerId}`).join(",");
      return !evaluated.has(`action:${candidate.type}:${signature || "none"}`);
    });
    if (unevaluated.length > 0) {
      errors.push("Every published transfer option must appear in the canonical transfer evaluation.");
    }
  }

  for (const transfer of recommendation.recommendedAction.transfers) {
    if (squadIds.has(transfer.sellPlayerId)) {
      errors.push(`Transfer sell player id ${transfer.sellPlayerId} remains in the selected squad.`);
    }

    if (!squadIds.has(transfer.buyPlayerId)) {
      errors.push(`Transfer buy player id ${transfer.buyPlayerId} is absent from the selected squad.`);
    }
  }

  if (recommendation.recommendedAction.type === "wildcard" && recommendation.chip.chip !== "wildcard") {
    errors.push("Wildcard action must use wildcard chip recommendation.");
  }

  if (recommendation.recommendedAction.type === "free_hit" && recommendation.chip.chip !== "free_hit") {
    errors.push("Free hit action must use free hit chip recommendation.");
  }

  return errors;
}

export function verifyRecommendation(
  recommendation: WeeklyRecommendation,
  options: VerifyRecommendationOptions = {}
): VerifyRecommendationResult {
  const wildcardActive =
    recommendation.chip.chip === "wildcard" || recommendation.recommendedAction.type === "wildcard";
  const freeHitActive =
    recommendation.chip.chip === "free_hit" || recommendation.recommendedAction.type === "free_hit";
  const warnings = recommendation.dataMode === "provisional"
    ? ["Provisional recommendation: player IDs, prices, fixtures, and availability may be stale."]
    : [];
  warnings.push(...transferPlanningWarnings(recommendation));
  warnings.push(...(options.roleDecisionSnapshot?.warnings ?? []));
  const selectedPlayerCoverageErrors: string[] = [];
  if (options.selectedPlayerEvidence === null) {
    selectedPlayerCoverageErrors.push("Current longitudinal research coverage is unavailable for the selected squad.");
  } else if (options.selectedPlayerEvidence) {
    const evidence = new Map(options.selectedPlayerEvidence.map((item) => [item.playerId, item]));
    for (const player of recommendation.squadBefore.players) {
      const item = evidence.get(player.id);
      if (!item) selectedPlayerCoverageErrors.push(`${player.name} has no current longitudinal dossier readiness record.`);
      else if (item.reasonCodes.includes("incomplete_research_coverage")) selectedPlayerCoverageErrors.push(`${player.name} lacks completed current research coverage.`);
      else if (item.status !== "READY") warnings.push(`${player.name} dossier readiness is ${item.status}: ${item.reasonCodes.join(", ") || "no reason code"}.`);
    }
  }
  const customErrors = [
    ...actionErrors(recommendation),
    ...selectedPlayerCoverageErrors,
    ...(options.roleDecisionSnapshot?.errors ?? [])
  ];
  const transferValidation = recommendation.decisionContext?.phase === "PRESEASON_DRAFT"
    ? { isValid: true, errors: [], warnings: [] }
    : validateTransfers({
      freeTransfers: recommendation.squadBefore.freeTransfers,
      moves: recommendation.recommendedAction.transfers,
      expectedTransferCost: recommendation.recommendedAction.transferCost,
      wildcardActive,
      freeHitActive
    });
  const result = mergeResults(
    validateSquad({
      players: recommendation.squadBefore.players
    }),
    validateStartingXI({
      squad: recommendation.squadBefore.players,
      startingXI: recommendation.pickTeam.startingXI,
      formation: recommendation.pickTeam.formation
    }),
    validateBench({
      squad: recommendation.squadBefore.players,
      startingXI: recommendation.pickTeam.startingXI,
      benchOrder: recommendation.pickTeam.benchOrder
    }),
    validateCaptaincy({
      squad: recommendation.squadBefore.players,
      captainPlayerId: recommendation.captaincy.captainPlayerId,
      viceCaptainPlayerId: recommendation.captaincy.viceCaptainPlayerId
    }),
    transferValidation,
    validateChip({
      chip: recommendation.chip.chip,
      chipsAvailable: recommendation.squadBefore.chipsAvailable
    }),
    validateDeadline({
      deadlineStatus: recommendation.deadlineStatus,
      force: options.forceDeadline
    })
  );
  const quality = evaluateRecommendationQuality(recommendation);
  const publicationGate = evaluatePublicationGate(recommendation);
  const languageValidation = recommendation.claimLedger?.schemaVersion === 3 && recommendation.decisionContext
    ? validateEpistemicLanguage(
        recommendation.claimLedger,
        recommendation.decisionContext.phase,
        recommendationRationale(recommendation)
      )
    : undefined;

  return {
    isValid: result.isValid && customErrors.length === 0 && quality.isValid &&
      publicationGate.publicationStatus !== "invalid" && (languageValidation?.isValid ?? true),
    errors: [
      ...result.errors,
      ...customErrors,
      ...quality.errors,
      ...publicationGate.errors,
      ...(languageValidation?.findings
        .filter((finding) => finding.severity === "error")
        .map((finding) => `${finding.claimId}: ${finding.rule} (${finding.phrase}).`) ?? [])
    ],
    warnings: [...result.warnings, ...warnings, ...quality.warnings, ...publicationGate.warnings],
    quality,
    languageValidation,
    publicationGate
  };
}
