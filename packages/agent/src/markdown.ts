import type { WeeklyRecommendation } from "./types";

function playerName(recommendation: WeeklyRecommendation, playerId: number) {
  const squadName = recommendation.squadBefore.players.find((player) => player.id === playerId)?.name;
  if (squadName) return squadName;
  for (const candidate of recommendation.topTransferCandidates) {
    const move = candidate.moves.find((item) => item.sellPlayerId === playerId || item.buyPlayerId === playerId);
    if (move?.sellPlayerId === playerId && move.sellPlayerName) return move.sellPlayerName;
    if (move?.buyPlayerId === playerId && move.buyPlayerName) return move.buyPlayerName;
  }
  return `Player ${playerId}`;
}

function transferMoves(recommendation: WeeklyRecommendation) {
  if (recommendation.recommendedAction.transfers.length === 0) return "- None. Roll the free transfer.";
  return recommendation.recommendedAction.transfers.map((move) =>
    `- ${move.sellPlayerName ?? playerName(recommendation, move.sellPlayerId)} -> ${move.buyPlayerName ?? playerName(recommendation, move.buyPlayerId)}`
  ).join("\n");
}

function numberOrUnavailable(value: number | null | undefined) {
  return value === null || value === undefined ? "unavailable" : value.toFixed(1);
}

function renderTransferOptions(recommendation: WeeklyRecommendation) {
  if (recommendation.topTransferCandidates.length === 0) return "";
  const canonicalHorizon = recommendation.decisionPolicy?.horizon ?? "unavailable";
  const rows = recommendation.topTransferCandidates.map((candidate) => {
    const moves = candidate.moves.length === 0
      ? "Roll"
      : candidate.moves.map((move) =>
        `${move.sellPlayerName ?? playerName(recommendation, move.sellPlayerId)} -> ${move.buyPlayerName ?? playerName(recommendation, move.buyPlayerId)}`
      ).join("; ");
    const supportingGain = candidate.planning?.multiGameweekGain ?? (
      canonicalHorizon === "GW1-5" ? candidate.expectedGain5GW : candidate.expectedGain3GW
    );
    return `| ${candidate.id} | ${moves} | ${candidate.planning?.rankingHorizon ?? canonicalHorizon} | ${numberOrUnavailable(candidate.expectedGain1GW)} | ${numberOrUnavailable(supportingGain)} | ${numberOrUnavailable(candidate.planning?.optionValue)} | ${numberOrUnavailable(candidate.planning?.decisionValue)} | ${candidate.planning?.replacementLiquidity ?? "unavailable"} | ${numberOrUnavailable(candidate.planning?.downside)} |`;
  });
  return `## Transfer Options

Canonical ranking horizon: ${canonicalHorizon}

| Option | Moves | Ranking horizon | Immediate gain | Multi-GW gain | Option value | Decision value | Liquidity | Downside |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
${rows.join("\n")}
`;
}

function playerLine(recommendation: WeeklyRecommendation, playerId: number) {
  const player = recommendation.squadBefore.players.find((squadPlayer) => squadPlayer.id === playerId);

  if (!player) {
    return `Player ${playerId}`;
  }

  return `${player.name} (${player.position}, team ${player.teamId}, £${player.price.toFixed(1)})`;
}

function renderDecisionAnalysis(recommendation: WeeklyRecommendation) {
  const analysis = recommendation.decisionAnalysis;

  if (!analysis) {
    return "Decision analysis is missing.";
  }

  return `## Decision Analysis

${analysis.summary}

### Squad Structure

${analysis.squadStructure.map((item) => `- ${item}`).join("\n")}

### Structure Comparisons

${analysis.structureComparisons.map((comparison) => `#### Selected: ${comparison.selectedStructure}

Rejected: ${comparison.rejectedStructure}

Why selected:
${comparison.whySelected.map((reason) => `- ${reason}`).join("\n")}

Why rejected:
${comparison.whyRejected.map((reason) => `- ${reason}`).join("\n")}

Evidence:
${comparison.evidence.map((item) => `- ${item}`).join("\n")}`).join("\n\n")}

### Player Picks And Alternatives

${analysis.playerDecisions.map((decision) => `#### ${playerLine(recommendation, decision.playerId)}

Why picked:
${decision.whyPicked.map((reason) => `- ${reason}`).join("\n")}

Why not alternatives:
${decision.comparedAgainst.map((alternative) => `- ${alternative.name}: ${alternative.whyNot.join(" ")}`).join("\n")}

Evidence:
${decision.evidence.map((item) => `- ${item}`).join("\n")}`).join("\n\n")}

### Captaincy Comparison

Why captain:
${analysis.captaincy.whyCaptain.map((reason) => `- ${reason}`).join("\n")}

Why not alternatives:
${analysis.captaincy.comparedAgainst.map((alternative) => `- ${alternative.name}: ${alternative.whyNot.join(" ")}`).join("\n")}

Evidence:
${analysis.captaincy.evidence.map((item) => `- ${item}`).join("\n")}

### Key Omissions

${analysis.keyOmissions.map((omission) => `- ${omission.name}: ${omission.whyOmitted.join(" ")} Reconsider if: ${omission.wouldReconsiderIf.join(" ")}`).join("\n")}`;
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

${renderDecisionAnalysis(recommendation)}

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

Moves:
${transferMoves(recommendation)}

Transfer cost: ${recommendation.recommendedAction.transferCost}

Expected bank after action: £${recommendation.recommendedAction.bankAfter.toFixed(1)}

${renderTransferOptions(recommendation)}

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

${renderDecisionAnalysis(recommendation)}

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
- probabilistic-projections.json
- projection-uncertainty-report.md
- projection-summary.md
- fixture-ticker.md
- minutes-risk-report.md
- current-role-report.md
- public-evidence-report.md
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

${renderDecisionAnalysis(recommendation)}

## What Would Change This Recommendation

${recommendation.whatWouldChangeMyMind.map((condition) => `- ${condition}`).join("\n")}
`;
}
