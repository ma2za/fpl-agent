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

function evidenceReferenceErrors(recommendation: WeeklyRecommendation) {
  const errors: string[] = [];
  const requiredAreas = [
    "squad",
    "starting-xi",
    "shortlist",
    "captaincy",
    "bench",
    "chip",
    "risks",
    "change-conditions"
  ];

  if (recommendation.recommendedAction.type !== "roll" || recommendation.recommendedAction.transfers.length > 0) {
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

  if (!analysis) {
    return ["Decision analysis is required for every recommendation."];
  }

  if (!hasText(analysis.summary)) {
    errors.push("Decision analysis summary is required.");
  }

  if (analysis.squadStructure.length < 2 || analysis.squadStructure.some((item) => !hasText(item))) {
    errors.push("Decision analysis must explain the squad structure tradeoffs.");
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
    }

    if (decision.comparedAgainst.length === 0) {
      errors.push(`Decision analysis for ${player.name} must compare at least one alternative.`);
    }

    if (decision.comparedAgainst.some((alternative) => !hasText(alternative.name) || alternative.whyNot.length === 0 || alternative.whyNot.some((reason) => !hasText(reason)))) {
      errors.push(`Decision analysis for ${player.name} has an incomplete alternative comparison.`);
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
    addGate(gates, "pick-comparison-analysis", "pass", "Every selected player and captaincy decision includes why-picked and why-not-alternative analysis.");
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
