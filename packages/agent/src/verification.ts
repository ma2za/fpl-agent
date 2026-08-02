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
import type { RecommendationQualityReport, StrategyQualityReport, WeeklyRecommendation } from "./types";

export type VerifyRecommendationOptions = {
  forceDeadline?: boolean;
};

export type VerifyRecommendationResult = ValidationResult & {
  quality: RecommendationQualityReport;
  strategyQuality?: StrategyQualityReport;
};

function mergeResults(...results: ValidationResult[]): ValidationResult {
  return {
    isValid: results.every((result) => result.isValid),
    errors: results.flatMap((result) => result.errors),
    warnings: results.flatMap((result) => result.warnings)
  };
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

  for (const transfer of recommendation.recommendedAction.transfers) {
    if (!squadIds.has(transfer.sellPlayerId)) {
      errors.push(`Transfer sell player id ${transfer.sellPlayerId} is not in the squad.`);
    }

    if (squadIds.has(transfer.buyPlayerId)) {
      errors.push(`Transfer buy player id ${transfer.buyPlayerId} is already in the squad.`);
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
  const customErrors = actionErrors(recommendation);
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

  return {
    isValid: result.isValid && customErrors.length === 0 && quality.isValid,
    errors: [...result.errors, ...customErrors, ...quality.errors],
    warnings: [...result.warnings, ...warnings, ...quality.warnings],
    quality
  };
}
