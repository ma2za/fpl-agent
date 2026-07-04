import { evaluateRecommendationQuality } from "./quality";
import type { SquadComparison, WeeklyRecommendation } from "./types";

type CompareSquadsInput = {
  generatedAt: string;
  labelA: string;
  labelB: string;
  recommendationA: WeeklyRecommendation;
  recommendationB: WeeklyRecommendation;
};

function totalPrice(recommendation: WeeklyRecommendation) {
  return Number(recommendation.squadBefore.players.reduce((sum, player) => sum + player.price, 0).toFixed(1));
}

function playerName(recommendation: WeeklyRecommendation, playerId: number) {
  return recommendation.squadBefore.players.find((player) => player.id === playerId)?.name ?? `Player ${playerId}`;
}

function playerNames(recommendation: WeeklyRecommendation, ids: number[]) {
  return ids.map((id) => playerName(recommendation, id));
}

function playerIds(recommendation: WeeklyRecommendation) {
  return new Set(recommendation.squadBefore.players.map((player) => player.id));
}

export function compareSquads(input: CompareSquadsInput): SquadComparison {
  const aIds = playerIds(input.recommendationA);
  const bIds = playerIds(input.recommendationB);
  const sharedPlayerIds = [...aIds].filter((id) => bIds.has(id)).sort((a, b) => a - b);
  const onlyAPlayerIds = [...aIds].filter((id) => !bIds.has(id)).sort((a, b) => a - b);
  const onlyBPlayerIds = [...bIds].filter((id) => !aIds.has(id)).sort((a, b) => a - b);
  const projectedDelta = input.recommendationB.pickTeam.projectedPoints - input.recommendationA.pickTeam.projectedPoints;
  const bankDelta = input.recommendationB.squadBefore.bank - input.recommendationA.squadBefore.bank;
  const notes = [
    `${input.labelB} changes ${onlyAPlayerIds.length} squad slots from ${input.labelA}.`,
    `${input.labelB} projected XI delta: ${projectedDelta >= 0 ? "+" : ""}${projectedDelta.toFixed(1)}.`,
    `${input.labelB} bank delta: ${bankDelta >= 0 ? "+" : ""}£${bankDelta.toFixed(1)}.`
  ];

  if (input.recommendationA.captaincy.captainPlayerId !== input.recommendationB.captaincy.captainPlayerId) {
    notes.push(`${input.labelB} changes captain from ${playerName(input.recommendationA, input.recommendationA.captaincy.captainPlayerId)} to ${playerName(input.recommendationB, input.recommendationB.captaincy.captainPlayerId)}.`);
  }

  return {
    generatedAt: input.generatedAt,
    a: {
      label: input.labelA,
      recommendation: input.recommendationA,
      quality: evaluateRecommendationQuality(input.recommendationA)
    },
    b: {
      label: input.labelB,
      recommendation: input.recommendationB,
      quality: evaluateRecommendationQuality(input.recommendationB)
    },
    sharedPlayerIds,
    onlyAPlayerIds,
    onlyBPlayerIds,
    summary: {
      budgetUsedA: totalPrice(input.recommendationA),
      budgetUsedB: totalPrice(input.recommendationB),
      bankA: input.recommendationA.squadBefore.bank,
      bankB: input.recommendationB.squadBefore.bank,
      projectedPointsA: input.recommendationA.pickTeam.projectedPoints,
      projectedPointsB: input.recommendationB.pickTeam.projectedPoints,
      captainA: input.recommendationA.captaincy.captainPlayerId,
      captainB: input.recommendationB.captaincy.captainPlayerId,
      chipA: input.recommendationA.chip.chip,
      chipB: input.recommendationB.chip.chip
    },
    notes
  };
}

export function renderSquadComparisonMarkdown(comparison: SquadComparison) {
  const a = comparison.a.recommendation;
  const b = comparison.b.recommendation;

  return `# Squad Comparison

Generated: ${comparison.generatedAt}

## Summary

| Metric | ${comparison.a.label} | ${comparison.b.label} |
| --- | ---: | ---: |
| Budget used | £${comparison.summary.budgetUsedA.toFixed(1)} | £${comparison.summary.budgetUsedB.toFixed(1)} |
| Bank | £${comparison.summary.bankA.toFixed(1)} | £${comparison.summary.bankB.toFixed(1)} |
| Projected XI | ${comparison.summary.projectedPointsA.toFixed(1)} | ${comparison.summary.projectedPointsB.toFixed(1)} |
| Formation | ${a.pickTeam.formation} | ${b.pickTeam.formation} |
| Captain | ${playerName(a, comparison.summary.captainA)} | ${playerName(b, comparison.summary.captainB)} |
| Chip | ${comparison.summary.chipA} | ${comparison.summary.chipB} |

## Player Changes

Shared players: ${comparison.sharedPlayerIds.length}

Only in ${comparison.a.label}:

${playerNames(a, comparison.onlyAPlayerIds).map((name) => `- ${name}`).join("\n") || "- None"}

Only in ${comparison.b.label}:

${playerNames(b, comparison.onlyBPlayerIds).map((name) => `- ${name}`).join("\n") || "- None"}

## Notes

${comparison.notes.map((note) => `- ${note}`).join("\n")}

## Quality

${comparison.a.label}: ${comparison.a.quality.isValid ? "valid" : "invalid"} (${comparison.a.quality.warnings.length} warnings)

${comparison.b.label}: ${comparison.b.quality.isValid ? "valid" : "invalid"} (${comparison.b.quality.warnings.length} warnings)
`;
}
