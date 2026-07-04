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
