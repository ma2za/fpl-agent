import { evaluateRecommendationQuality } from "./quality";
import { buildSquadRiskReport } from "./riskReport";
import type { RecommendationQualityReport, SquadComparison, SquadRiskReport, WeeklyRecommendation } from "./types";

type CompareSquadsInput = {
  generatedAt: string;
  labelA: string;
  labelB: string;
  recommendationA: WeeklyRecommendation;
  recommendationB: WeeklyRecommendation;
  qualityA?: RecommendationQualityReport;
  qualityB?: RecommendationQualityReport;
  riskSummaryA?: SquadRiskReport["summary"];
  riskSummaryB?: SquadRiskReport["summary"];
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

function positionChanges(recommendationA: WeeklyRecommendation, recommendationB: WeeklyRecommendation) {
  const positions = ["GKP", "DEF", "MID", "FWD"] as const;
  const aIds = playerIds(recommendationA);
  const bIds = playerIds(recommendationB);

  return Object.fromEntries(
    positions.map((position) => [
      position,
      {
        onlyAPlayerIds: recommendationA.squadBefore.players
          .filter((player) => player.position === position && !bIds.has(player.id))
          .map((player) => player.id),
        onlyBPlayerIds: recommendationB.squadBefore.players
          .filter((player) => player.position === position && !aIds.has(player.id))
          .map((player) => player.id)
      }
    ])
  ) as SquadComparison["positionChanges"];
}

function playableOutfieldBench(recommendation: WeeklyRecommendation) {
  const squadById = new Map(recommendation.squadBefore.players.map((player) => [player.id, player]));

  return recommendation.pickTeam.benchOrder
    .map((playerId) => squadById.get(playerId))
    .filter((player) => player && player.position !== "GKP" && (player.minutes ?? 0) >= 1200)
    .length;
}

export function compareSquads(input: CompareSquadsInput): SquadComparison {
  const aIds = playerIds(input.recommendationA);
  const bIds = playerIds(input.recommendationB);
  const sharedPlayerIds = [...aIds].filter((id) => bIds.has(id)).sort((a, b) => a - b);
  const onlyAPlayerIds = [...aIds].filter((id) => !bIds.has(id)).sort((a, b) => a - b);
  const onlyBPlayerIds = [...bIds].filter((id) => !aIds.has(id)).sort((a, b) => a - b);
  const projectedDelta = input.recommendationB.pickTeam.projectedPoints - input.recommendationA.pickTeam.projectedPoints;
  const bankDelta = input.recommendationB.squadBefore.bank - input.recommendationA.squadBefore.bank;
  const budgetUsedA = totalPrice(input.recommendationA);
  const budgetUsedB = totalPrice(input.recommendationB);
  const budgetDelta = budgetUsedB - budgetUsedA;
  const outfieldBenchPlayableA = playableOutfieldBench(input.recommendationA);
  const outfieldBenchPlayableB = playableOutfieldBench(input.recommendationB);
  const riskA = input.riskSummaryA ?? buildSquadRiskReport({
    generatedAt: input.generatedAt,
    recommendation: input.recommendationA,
    dataStatus: { dataMode: input.recommendationA.dataMode },
    fixtureTicker: null,
    contextNotes: {
      teamNews: "Reviewed: yes",
      setPieces: "Reviewed: yes",
      watchlist: "Reviewed: yes"
    }
  }).summary;
  const riskB = input.riskSummaryB ?? buildSquadRiskReport({
    generatedAt: input.generatedAt,
    recommendation: input.recommendationB,
    dataStatus: { dataMode: input.recommendationB.dataMode },
    fixtureTicker: null,
    contextNotes: {
      teamNews: "Reviewed: yes",
      setPieces: "Reviewed: yes",
      watchlist: "Reviewed: yes"
    }
  }).summary;
  const notes = [
    `${input.labelB} changes ${onlyAPlayerIds.length} squad slots from ${input.labelA}.`,
    `${input.labelB} projected XI delta: ${projectedDelta >= 0 ? "+" : ""}${projectedDelta.toFixed(1)}.`,
    `${input.labelB} bank delta: ${bankDelta >= 0 ? "+" : ""}£${bankDelta.toFixed(1)}.`,
    `${input.labelB} budget-used delta: ${budgetDelta >= 0 ? "+" : ""}£${budgetDelta.toFixed(1)}.`,
    `${input.labelB} playable outfield bench delta: ${outfieldBenchPlayableB - outfieldBenchPlayableA >= 0 ? "+" : ""}${outfieldBenchPlayableB - outfieldBenchPlayableA}.`,
    `${input.labelA} risk summary: ${riskA.high} high, ${riskA.medium} medium.`,
    `${input.labelB} risk summary: ${riskB.high} high, ${riskB.medium} medium.`
  ];

  if (input.recommendationA.captaincy.captainPlayerId !== input.recommendationB.captaincy.captainPlayerId) {
    notes.push(`${input.labelB} changes captain from ${playerName(input.recommendationA, input.recommendationA.captaincy.captainPlayerId)} to ${playerName(input.recommendationB, input.recommendationB.captaincy.captainPlayerId)}.`);
  }

  return {
    generatedAt: input.generatedAt,
    a: {
      label: input.labelA,
      recommendation: input.recommendationA,
      quality: input.qualityA ?? evaluateRecommendationQuality(input.recommendationA),
      riskSummary: riskA
    },
    b: {
      label: input.labelB,
      recommendation: input.recommendationB,
      quality: input.qualityB ?? evaluateRecommendationQuality(input.recommendationB),
      riskSummary: riskB
    },
    sharedPlayerIds,
    onlyAPlayerIds,
    onlyBPlayerIds,
    positionChanges: positionChanges(input.recommendationA, input.recommendationB),
    summary: {
      budgetUsedA,
      budgetUsedB,
      bankA: input.recommendationA.squadBefore.bank,
      bankB: input.recommendationB.squadBefore.bank,
      budgetDelta,
      bankDelta,
      projectedPointsA: input.recommendationA.pickTeam.projectedPoints,
      projectedPointsB: input.recommendationB.pickTeam.projectedPoints,
      projectedPointsDelta: projectedDelta,
      captainA: input.recommendationA.captaincy.captainPlayerId,
      captainB: input.recommendationB.captaincy.captainPlayerId,
      chipA: input.recommendationA.chip.chip,
      chipB: input.recommendationB.chip.chip,
      outfieldBenchPlayableA,
      outfieldBenchPlayableB,
      outfieldBenchPlayableDelta: outfieldBenchPlayableB - outfieldBenchPlayableA
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
| Budget delta |  | ${comparison.summary.budgetDelta >= 0 ? "+" : ""}£${comparison.summary.budgetDelta.toFixed(1)} |
| Bank | £${comparison.summary.bankA.toFixed(1)} | £${comparison.summary.bankB.toFixed(1)} |
| Bank delta |  | ${comparison.summary.bankDelta >= 0 ? "+" : ""}£${comparison.summary.bankDelta.toFixed(1)} |
| Projected XI | ${comparison.summary.projectedPointsA.toFixed(1)} | ${comparison.summary.projectedPointsB.toFixed(1)} |
| Projected XI delta |  | ${comparison.summary.projectedPointsDelta >= 0 ? "+" : ""}${comparison.summary.projectedPointsDelta.toFixed(1)} |
| Formation | ${a.pickTeam.formation} | ${b.pickTeam.formation} |
| Captain | ${playerName(a, comparison.summary.captainA)} | ${playerName(b, comparison.summary.captainB)} |
| Chip | ${comparison.summary.chipA} | ${comparison.summary.chipB} |
| Playable outfield bench | ${comparison.summary.outfieldBenchPlayableA} | ${comparison.summary.outfieldBenchPlayableB} |

## Position Changes

${Object.entries(comparison.positionChanges).map(([position, changes]) => `### ${position}

Only in ${comparison.a.label}:

${playerNames(a, changes.onlyAPlayerIds).map((name) => `- ${name}`).join("\n") || "- None"}

Only in ${comparison.b.label}:

${playerNames(b, changes.onlyBPlayerIds).map((name) => `- ${name}`).join("\n") || "- None"}`).join("\n\n")}

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

## Risk Summary

${comparison.a.label}: ${comparison.a.riskSummary.high} high, ${comparison.a.riskSummary.medium} medium, ${comparison.a.riskSummary.evidenceGaps} evidence gaps

${comparison.b.label}: ${comparison.b.riskSummary.high} high, ${comparison.b.riskSummary.medium} medium, ${comparison.b.riskSummary.evidenceGaps} evidence gaps
`;
}
