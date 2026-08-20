import { DEFAULT_STARTING_BUDGET, MAX_PLAYERS_PER_CLUB, REQUIRED_SQUAD_COUNTS } from "../../rules/src";
import type { PlayerForEngine } from "../../engine/src";
import type { QualityGateResult, RecommendationQualityReport, WeeklyRecommendation } from "./types";

function totalPrice(recommendation: WeeklyRecommendation) {
  return recommendation.squadBefore.players.reduce((sum, player) => sum + player.price, 0);
}

function addGate(gates: QualityGateResult[], gate: string, status: QualityGateResult["status"], message: string) {
  gates.push({ gate, status, message });
}

function hasText(value: string | undefined | null) {
  return typeof value === "string" && value.trim().length > 0;
}

const genericDecisionReasonPatterns = [
  /\bfits? (?:the |this )?(?:legal |selected |authored )?(?:squad )?structure\b/i,
  /\bkeeps? (?:the )?(?:fixture test )?recommendation complete\b/i,
  /\bhas an explicit role in the squad\b/i,
  /\bincluded in (?:the )?(?:current )?(?:official )?(?:scout )?squad\b/i,
  /\bsupported by current specialist .* analysis\b/i,
  /\bfills? the required squad slot\b/i,
  /\bis not needed for (?:the )?.*structure\b/i,
  /\bdoes not fit (?:the |this )?.*structure\b/i,
  /\blost the role, price, fixture or structural trade-off\b/i
];

const decisionSignalPattern = /(?:£\s*\d|\d+(?:\.\d+)?\s*(?:%|points?|minutes?|goals?|assists?|starts?)|\b(?:penalt(?:y|ies)|set[ -]?pieces?|corners?|free[ -]?kicks?|start(?:ing|er)?|minutes?|project(?:ed|ion)|ownership|fixture|opponent|home|away|backup|enabler|captaincy|defensive contributions?|clean sheets?|goals?|assists?|price|cost|budget|bank|role|injur(?:y|ed)|availability|bench order)\b)/i;

function isSpecificDecisionReason(reason: string) {
  return hasText(reason) &&
    !genericDecisionReasonPatterns.some((pattern) => pattern.test(reason)) &&
    decisionSignalPattern.test(reason);
}

function countByPosition(recommendation: WeeklyRecommendation) {
  return recommendation.squadBefore.players.reduce<Record<string, number>>((counts, player) => {
    counts[player.position] = (counts[player.position] ?? 0) + 1;
    return counts;
  }, {});
}

function countByClub(recommendation: WeeklyRecommendation) {
  return recommendation.squadBefore.players.reduce<Map<number, number>>((counts, player) => {
    counts.set(player.teamId, (counts.get(player.teamId) ?? 0) + 1);
    return counts;
  }, new Map<number, number>());
}

function lowMinutesStarters(recommendation: WeeklyRecommendation) {
  const squadById = new Map(
    recommendation.squadBefore.players.map((player) => [player.id, player as PlayerForEngine])
  );

  return recommendation.pickTeam.startingXI
    .map((playerId) => squadById.get(playerId))
    .filter((player): player is PlayerForEngine => Boolean(player))
    .filter((player) => {
      const expectedMinutes = player.minutes ?? null;
      return typeof expectedMinutes === "number" && expectedMinutes > 0 && expectedMinutes < 1200;
    });
}

function benchPlayers(recommendation: WeeklyRecommendation) {
  const squadById = new Map(recommendation.squadBefore.players.map((player) => [player.id, player]));

  return recommendation.pickTeam.benchOrder
    .map((playerId) => squadById.get(playerId))
    .filter((player): player is WeeklyRecommendation["squadBefore"]["players"][number] => Boolean(player));
}

function totalBenchPrice(recommendation: WeeklyRecommendation) {
  return benchPlayers(recommendation).reduce((sum, player) => sum + player.price, 0);
}

function starterWatchPlayers(recommendation: WeeklyRecommendation) {
  const squadById = new Map(recommendation.squadBefore.players.map((player) => [player.id, player]));

  return recommendation.pickTeam.startingXI
    .map((playerId) => squadById.get(playerId))
    .filter((player): player is WeeklyRecommendation["squadBefore"]["players"][number] => Boolean(player))
    .filter((player) => typeof player.minutes === "number" && player.minutes > 0 && player.minutes < 2400);
}

function selectedWatchPlayers(recommendation: WeeklyRecommendation) {
  return recommendation.squadBefore.players.filter(
    (player) => typeof player.minutes === "number" && player.minutes > 0 && player.minutes < 2400
  );
}

function mentionsProjectionScope(recommendation: WeeklyRecommendation) {
  const text = `${recommendation.pickTeam.explanation} ${recommendation.confidence.explanation}`;

  return /captaincy\s+(included|excluded|not included)|projected points include|projected points exclude/i.test(text);
}

function evidenceReferenceErrors(recommendation: WeeklyRecommendation) {
  const errors: string[] = [];
  const requiredAreas = [
    "squad",
    "structure",
    "starting-xi",
    "shortlist",
    "captaincy",
    "bench",
    "chip",
    "risks",
    "change-conditions"
  ];

  if (
    ["transfer", "hit", "wildcard", "free_hit"].includes(recommendation.recommendedAction.type) ||
    recommendation.recommendedAction.transfers.length > 0
  ) {
    requiredAreas.push("transfers");
  }

  for (const area of requiredAreas) {
    if (!recommendation.evidenceReferences.some((reference) => reference.area === area)) {
      errors.push(`Evidence reference is required for ${area}.`);
    }
  }

  for (const reference of recommendation.evidenceReferences) {
    if (!hasText(reference.source) || !hasText(reference.reportPath) || !hasText(reference.note)) {
      errors.push(`Evidence reference for ${reference.area} must include source, reportPath, and note.`);
    }
  }

  return errors;
}

function decisionAnalysisErrors(recommendation: WeeklyRecommendation) {
  const errors: string[] = [];
  const analysis = recommendation.decisionAnalysis;
  const policy = recommendation.optimizationPolicy;

  if (!policy) {
    errors.push("An explicit optimization objective is required.");
  } else {
    const rankMode = policy.mode !== "MAX_EXPECTED_POINTS";
    if (rankMode && (policy.ownershipTreatment !== "simulated_field_distribution" || !hasText(policy.rankSimulationReportPath))) {
      errors.push(`${policy.mode} requires a cited simulated field-rank distribution.`);
    }
    if (!rankMode && (policy.ownershipTreatment !== "excluded" || policy.rankSimulationReportPath !== null)) {
      errors.push("MAX_EXPECTED_POINTS must exclude ownership and rank effects.");
    }
    for (const adjustment of policy.projectionAdjustments) {
      const featureIds = adjustment.features.map((feature) => feature.featureId);
      const expected = adjustment.baseProjection + adjustment.features.reduce((sum, feature) => sum + feature.pointsDelta, 0);
      if (new Set(featureIds).size !== featureIds.length || Math.abs(expected - adjustment.adjustedProjection) > 0.001 ||
        adjustment.features.some((feature) => feature.evidenceIds.length === 0) ||
        adjustment.features.some((feature) => ["preseason_output", "lower_league_output"].includes(feature.sourceKind) && !hasText(feature.translationModel))) {
        errors.push(`Projection adjustment for player ${adjustment.playerId} must be quantified, feature-unique, and evidence-backed.`);
      }
    }
  }

  if (!analysis) {
    errors.push("Decision analysis is required for every recommendation.");
    return errors;
  }

  const playerSelectionReasons = [
    ...analysis.playerDecisions.flatMap((decision) => [
      ...decision.whyPicked,
      ...decision.comparedAgainst.flatMap((alternative) => alternative.whyNot)
    ]),
    ...analysis.keyOmissions.flatMap((omission) => omission.whyOmitted)
  ];
  const allDecisionReasons = [
    analysis.summary,
    ...analysis.squadStructure,
    ...analysis.structureComparisons.flatMap((comparison) => [...comparison.whySelected, ...comparison.whyRejected]),
    ...playerSelectionReasons,
    ...analysis.captaincy.whyCaptain,
    ...analysis.captaincy.comparedAgainst.flatMap((alternative) => alternative.whyNot)
  ];
  if (playerSelectionReasons.some((reason) => /\bcoverage\b/i.test(reason))) {
    errors.push('Player selection and omission rationale must not use "coverage" as a decision reason.');
  }
  if (allDecisionReasons.some((reason) => /\b(?:effective ownership|ownership|rank protection|rank risk)\b/i.test(reason)) &&
    (!policy || policy.mode === "MAX_EXPECTED_POINTS" || !policy.rankSimulationReportPath)) {
    errors.push("Ownership reasoning requires a rank-aware objective and cited rank simulation.");
  }

  if (!hasText(analysis.summary)) {
    errors.push("Decision analysis summary is required.");
  }

  if (analysis.squadStructure.length < 2 || analysis.squadStructure.some((item) => !hasText(item))) {
    errors.push("Decision analysis must explain the squad structure tradeoffs.");
  }

  if (
    analysis.structureComparisons.length < 2 ||
    analysis.structureComparisons.some((comparison) =>
      !hasText(comparison.selectedStructure) ||
      !hasText(comparison.rejectedStructure) ||
      comparison.whySelected.length === 0 ||
      comparison.whyRejected.length === 0 ||
      comparison.evidence.length === 0 ||
      comparison.whySelected.some((reason) => !hasText(reason)) ||
      comparison.whyRejected.some((reason) => !hasText(reason)) ||
      comparison.evidence.some((item) => !hasText(item))
    )
  ) {
    errors.push("Decision analysis must compare at least two full-squad structures with why-selected, why-rejected, and evidence.");
  }

  for (const comparison of analysis.structureComparisons) {
    if ((comparison.counterfactualCandidateIds?.length ?? 0) === 0) {
      errors.push(`Material structural rejection "${comparison.rejectedStructure}" must cite at least one optimized counterfactual candidate ID.`);
    }
  }

  const selectedIds = new Set(recommendation.squadBefore.players.map((player) => player.id));
  const decisionByPlayer = new Map(analysis.playerDecisions.map((decision) => [decision.playerId, decision]));

  for (const player of recommendation.squadBefore.players) {
    const decision = decisionByPlayer.get(player.id);

    if (!decision) {
      errors.push(`Decision analysis is required for selected player ${player.name}.`);
      continue;
    }

    if (decision.whyPicked.length < 2 || decision.whyPicked.some((reason) => !hasText(reason))) {
      errors.push(`Decision analysis for ${player.name} must include at least two why-picked reasons.`);
    } else if (decision.whyPicked.some((reason) => !isSpecificDecisionReason(reason))) {
      errors.push(`Decision analysis for ${player.name} must use specific, evidence-bearing why-picked reasons instead of generic squad-fit claims.`);
    }

    if (decision.whyPicked.some((reason) => /\b(?:model )?override\b/i.test(reason)) &&
      !policy?.projectionAdjustments.some((adjustment) => adjustment.playerId === player.id)) {
      errors.push(`Decision analysis for ${player.name} claims a model override without a quantified projection adjustment.`);
    }

    if (decision.comparedAgainst.length === 0) {
      errors.push(`Decision analysis for ${player.name} must compare at least one alternative.`);
    }

    if (decision.comparedAgainst.some((alternative) => !hasText(alternative.name) || alternative.whyNot.length === 0 || alternative.whyNot.some((reason) => !hasText(reason)))) {
      errors.push(`Decision analysis for ${player.name} has an incomplete alternative comparison.`);
    }

    for (const alternative of decision.comparedAgainst) {
      if (alternative.whyNot.some((reason) => !isSpecificDecisionReason(reason))) {
        errors.push(`Decision analysis for ${player.name} versus ${alternative.name} must state the specific deciding trade-off.`);
      }
    }

    if (decision.evidence.length === 0 || decision.evidence.some((item) => !hasText(item))) {
      errors.push(`Decision analysis for ${player.name} must cite evidence.`);
    }
  }

  for (const decision of analysis.playerDecisions) {
    if (!selectedIds.has(decision.playerId)) {
      errors.push(`Decision analysis references unselected player id ${decision.playerId}.`);
    }
  }

  if (analysis.captaincy.captainPlayerId !== recommendation.captaincy.captainPlayerId) {
    errors.push("Captaincy decision analysis must match the recommended captain.");
  }

  if (analysis.captaincy.whyCaptain.length < 2 || analysis.captaincy.comparedAgainst.length === 0 || analysis.captaincy.evidence.length === 0) {
    errors.push("Captaincy decision analysis must include reasons, alternatives, and evidence.");
  }

  if (analysis.keyOmissions.length < 2) {
    errors.push("Decision analysis must include at least two key omitted alternatives.");
  }

  for (const omission of analysis.keyOmissions) {
    if (!hasText(omission.name) || omission.whyOmitted.length === 0 || omission.wouldReconsiderIf.length === 0 || omission.evidence.length === 0) {
      errors.push(`Key omission analysis for ${omission.name || "unknown player"} is incomplete.`);
    }
  }

  return errors;
}

export function evaluateRecommendationQuality(recommendation: WeeklyRecommendation): RecommendationQualityReport {
  const gates: QualityGateResult[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const bank = recommendation.squadBefore.bank;
  const price = totalPrice(recommendation);
  const positionCounts = countByPosition(recommendation);
  const clubCounts = countByClub(recommendation);
  const lowMinutePlayers = lowMinutesStarters(recommendation);
  const benchCost = totalBenchPrice(recommendation);
  const starterWatch = starterWatchPlayers(recommendation);
  const selectedWatch = selectedWatchPlayers(recommendation);

  if (price > DEFAULT_STARTING_BUDGET) {
    addGate(gates, "budget", "fail", `Squad cost £${price.toFixed(1)} exceeds £${DEFAULT_STARTING_BUDGET.toFixed(1)}.`);
  } else if (bank > 5) {
    addGate(gates, "budget", "warn", `Squad leaves £${bank.toFixed(1)} in the bank.`);
  } else {
    addGate(gates, "budget", "pass", `Squad uses £${price.toFixed(1)} with £${bank.toFixed(1)} bank.`);
  }

  for (const [position, expectedCount] of Object.entries(REQUIRED_SQUAD_COUNTS)) {
    const actualCount = positionCounts[position] ?? 0;

    if (actualCount !== expectedCount) {
      addGate(gates, "position-counts", "fail", `Expected ${expectedCount} ${position}, found ${actualCount}.`);
    }
  }

  if (!gates.some((gate) => gate.gate === "position-counts")) {
    addGate(gates, "position-counts", "pass", "Squad has valid position counts.");
  }

  for (const [teamId, count] of clubCounts) {
    if (count > MAX_PLAYERS_PER_CLUB) {
      addGate(gates, "club-exposure", "fail", `Team ${teamId} has ${count} players.`);
    } else if (count === MAX_PLAYERS_PER_CLUB) {
      addGate(gates, "club-exposure", "warn", `Team ${teamId} uses all ${MAX_PLAYERS_PER_CLUB} slots.`);
    }
  }

  if (!gates.some((gate) => gate.gate === "club-exposure")) {
    addGate(gates, "club-exposure", "pass", "No club concentration warning.");
  }

  const hasTripleExposure = [...clubCounts.values()].some((count) => count === MAX_PLAYERS_PER_CLUB);
  const hasConcentrationEvidence = recommendation.evidenceReferences.some((reference) =>
    ["squad", "structure"].includes(reference.area) &&
    /(?:concentration-risk-report|scenario-comparison)\.(?:json|md)$/i.test(reference.reportPath)
  );
  const rationale = JSON.stringify({
    decisionAnalysis: recommendation.decisionAnalysis,
    action: recommendation.recommendedAction.explanation,
    pickTeam: recommendation.pickTeam.explanation,
    captaincy: recommendation.captaincy.explanation
  });
  const assertsFixtureJustifiedTriple = /fixtures?\s+(?:justify|support|favor)\w*[^.]*\btriple\b|\btriple\b[^.]*\b(?:because|due to)\b[^.]*fixtures?/i.test(rationale);
  if (hasTripleExposure && assertsFixtureJustifiedTriple && !hasConcentrationEvidence) {
    addGate(
      gates,
      "concentration-evidence",
      "fail",
      "Triple-club exposure requires cited correlated scenario or concentration-risk evidence."
    );
  } else {
    addGate(gates, "concentration-evidence", "pass", hasTripleExposure
      ? hasConcentrationEvidence
        ? "Triple-club exposure cites correlated scenario evidence."
        : "Triple-club exposure makes no fixture-only concentration claim."
      : "No triple-club concentration requires scenario evidence.");
  }

  if (lowMinutePlayers.length > 0) {
    addGate(
      gates,
      "starter-minutes",
      "warn",
      `Low historical minutes among starters: ${lowMinutePlayers.map((player) => player.name).join(", ")}.`
    );
  } else {
    addGate(gates, "starter-minutes", "pass", "No low-minutes starter warning from available player metadata.");
  }

  if (starterWatch.length > 5 || selectedWatch.length > 7) {
    addGate(
      gates,
      "minutes-risk-concentration",
      "warn",
      `Role/minutes uncertainty is concentrated: ${starterWatch.length} starters and ${selectedWatch.length} squad players are below 2400 historical minutes.`
    );
  } else {
    addGate(gates, "minutes-risk-concentration", "pass", "Role/minutes uncertainty is not over-concentrated from available metadata.");
  }

  if (benchCost > 17) {
    addGate(gates, "bench-spend", "warn", `Bench costs £${benchCost.toFixed(1)}, which may overprotect substitutes at the expense of the XI.`);
  } else {
    addGate(gates, "bench-spend", "pass", `Bench costs £${benchCost.toFixed(1)}.`);
  }

  if (!mentionsProjectionScope(recommendation)) {
    addGate(gates, "projection-scope", "fail", "Pick-team explanation must state whether projected points include captaincy.");
  } else {
    addGate(gates, "projection-scope", "pass", "Projection scope states whether captaincy is included.");
  }

  if (
    recommendation.confidence.score > 0.65 &&
    /no matched|not matched|unavailable|not yet normalized|not normalized/i.test(recommendation.confidence.explanation)
  ) {
    addGate(gates, "confidence-calibration", "warn", "Confidence score is too high for missing odds or unnormalized lineup evidence.");
  } else {
    addGate(gates, "confidence-calibration", "pass", "Confidence score is calibrated to stated evidence limits.");
  }

  if (recommendation.dataMode === "provisional") {
    addGate(gates, "data-freshness", "warn", "Recommendation uses provisional data.");
  } else {
    addGate(gates, "data-freshness", "pass", "Recommendation uses official data mode.");
  }

  if (!hasText(recommendation.captaincy.explanation)) {
    addGate(gates, "captaincy-rationale", "fail", "Captaincy rationale is required.");
  } else {
    addGate(gates, "captaincy-rationale", "pass", "Captaincy rationale is present.");
  }

  if (recommendation.chip.reasons.length === 0) {
    addGate(gates, "chip-rationale", "fail", "Chip rationale is required.");
  } else {
    addGate(gates, "chip-rationale", "pass", "Chip rationale is present.");
  }

  if (recommendation.risks.length === 0) {
    addGate(gates, "risks", "warn", "Recommendation should include risks.");
  } else {
    addGate(gates, "risks", "pass", "Risks are present.");
  }

  if (recommendation.whatWouldChangeMyMind.length === 0) {
    addGate(gates, "what-would-change", "warn", "Recommendation should include what would change the decision.");
  } else {
    addGate(gates, "what-would-change", "pass", "Change conditions are present.");
  }

  const evidenceErrors = evidenceReferenceErrors(recommendation);
  const analysisErrors = decisionAnalysisErrors(recommendation);

  if (evidenceErrors.length > 0) {
    for (const evidenceError of evidenceErrors) {
      addGate(gates, "evidence-backed-decision", "fail", evidenceError);
    }
  } else {
    addGate(gates, "evidence-backed-decision", "pass", "Required recommendation evidence references are present.");
  }

  if (analysisErrors.length > 0) {
    for (const analysisError of analysisErrors) {
      addGate(gates, "pick-comparison-analysis", "fail", analysisError);
    }
  } else {
    addGate(gates, "pick-comparison-analysis", "pass", "Structure, player, omission, and captaincy comparisons are present.");
  }

  for (const gate of gates) {
    if (gate.status === "fail") {
      errors.push(gate.message);
    }

    if (gate.status === "warn") {
      warnings.push(gate.message);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    gates
  };
}
