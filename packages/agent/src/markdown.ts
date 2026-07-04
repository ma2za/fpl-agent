import type { WeeklyRecommendation } from "./types";

function playerName(recommendation: WeeklyRecommendation, playerId: number) {
  return recommendation.squadBefore.players.find((player) => player.id === playerId)?.name ?? `Player ${playerId}`;
}

function playerLine(recommendation: WeeklyRecommendation, playerId: number) {
  const player = recommendation.squadBefore.players.find((squadPlayer) => squadPlayer.id === playerId);

  if (!player) {
    return `Player ${playerId}`;
  }

  return `${player.name} (${player.position}, team ${player.teamId}, £${player.price.toFixed(1)})`;
}

export function renderRecommendationMarkdown(recommendation: WeeklyRecommendation) {
  return `# FPL Agent Recommendation: GW${recommendation.gameweek}

Created: ${recommendation.createdAt}

Data mode: ${recommendation.dataMode}

Deadline: ${recommendation.deadline}

## Summary

${recommendation.recommendedAction.explanation}

## Team Selection

Formation: ${recommendation.pickTeam.formation}

Projected starting XI points: ${recommendation.pickTeam.projectedPoints.toFixed(1)}

## Captaincy

Captain: ${playerName(recommendation, recommendation.captaincy.captainPlayerId)}

Vice-captain: ${playerName(recommendation, recommendation.captaincy.viceCaptainPlayerId)}

${recommendation.captaincy.explanation}

## Chip

Recommendation: ${recommendation.chip.chip}

${recommendation.chip.reasons.map((reason) => `- ${reason}`).join("\n")}

## Risks

${recommendation.risks.map((risk) => `- ${risk}`).join("\n")}
`;
}

export function renderManualChecklist(recommendation: WeeklyRecommendation) {
  const [benchGoalkeeper, firstBench, secondBench, thirdBench] = recommendation.pickTeam.benchOrder;

  return `# FPL Agent Manual Checklist: GW${recommendation.gameweek}

## Deadline

Deadline: ${recommendation.deadline}

Do not apply this checklist after the deadline.

Data mode: ${recommendation.dataMode}

## Transfer Recommendation

Recommended action: ${recommendation.recommendedAction.type}

Transfer cost: ${recommendation.recommendedAction.transferCost}

Expected bank after action: £${recommendation.recommendedAction.bankAfter.toFixed(1)}

## Pick Team

Formation: ${recommendation.pickTeam.formation}

### Starting XI

${recommendation.pickTeam.startingXI.map((playerId) => `- ${playerLine(recommendation, playerId)}`).join("\n")}

## Captaincy

Captain: ${playerLine(recommendation, recommendation.captaincy.captainPlayerId)}

Vice-captain: ${playerLine(recommendation, recommendation.captaincy.viceCaptainPlayerId)}

## Bench Order

Bench GK: ${playerLine(recommendation, benchGoalkeeper)}

1st bench: ${playerLine(recommendation, firstBench)}

2nd bench: ${playerLine(recommendation, secondBench)}

3rd bench: ${playerLine(recommendation, thirdBench)}

## Chip

Chip recommendation: ${recommendation.chip.chip}

Manual instruction:
Only activate this chip if you agree with the recommendation.

## Risks

${recommendation.risks.map((risk) => `- ${risk}`).join("\n")}

## What Would Change This Recommendation

${recommendation.whatWouldChangeMyMind.map((condition) => `- ${condition}`).join("\n")}

## Final Human Confirmation

Before applying manually, check:

- Player flags
- Deadline has not passed
- Starting XI is legal
- Captain and vice-captain are correct
- Bench order is correct
- Chip selection is intentional
`;
}

export function renderAgentBrief(recommendation: WeeklyRecommendation) {
  return `# FPL Agent Decision Brief: GW${recommendation.gameweek}

## Status

Data mode: ${recommendation.dataMode}

Deadline status: ${recommendation.deadlineStatus}

Legality: ${recommendation.legality.isValid ? "valid" : "invalid"}

Confidence: ${recommendation.confidence.label} (${recommendation.confidence.score.toFixed(2)})

Manual execution required: ${recommendation.manualExecutionRequired}

## Evidence Files

- recommendation.json
- legality-report.json
- projections.json
- captain-candidates.json
- transfer-candidates.json
- manual-checklist.md

## Deterministic Outputs

- Formation: ${recommendation.pickTeam.formation}
- Recommended action: ${recommendation.recommendedAction.type}
- Transfer cost: ${recommendation.recommendedAction.transferCost}
- Captain: ${playerName(recommendation, recommendation.captaincy.captainPlayerId)}
- Vice-captain: ${playerName(recommendation, recommendation.captaincy.viceCaptainPlayerId)}
- Chip: ${recommendation.chip.chip}

## Agent Judgment Required

- Check latest FPL injury and suspension news before trusting availability.
- Check whether official prices, player IDs, fixtures, and deadlines are live for the target season.
- Compare the deterministic captain and transfer candidates against recent team news.
- Reject any recommendation that fails legality verification.
- Keep final FPL changes manual.

## Risks

${recommendation.risks.map((risk) => `- ${risk}`).join("\n")}

## What Would Change This Recommendation

${recommendation.whatWouldChangeMyMind.map((condition) => `- ${condition}`).join("\n")}
`;
}
