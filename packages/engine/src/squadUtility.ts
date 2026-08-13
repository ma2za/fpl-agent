import { resolveAutomaticSubstitutions, type Position } from "../../rules/src";
import type {
  DraftDeltaReport,
  PlayerForEngine,
  ProbabilisticProjection,
  RobustnessReport
} from "./types";

const DEFAULT_SAMPLE_COUNT = 10000;
const POSITION_ORDER = ["GKP", "DEF", "MID", "FWD"] as const;

function round(value: number, places = 3) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function quantile(sorted: number[], probability: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * probability))] ?? 0;
}

function standardDeviation(values: number[], mean: number) {
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function randomGenerator(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function normal(random: () => number) {
  const u = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

function validateLineup(players: PlayerForEngine[], startingXI: number[], benchOrder: number[]) {
  const ids = [...startingXI, ...benchOrder];
  if (players.length !== 15 || startingXI.length !== 11 || benchOrder.length !== 4) {
    throw new Error("Squad utility requires 15 players, 11 starters, and four ordered substitutes.");
  }
  if (new Set(ids).size !== 15 || ids.some((id) => !players.some((player) => player.id === id))) {
    throw new Error("Starting XI and bench order must contain every squad player exactly once.");
  }
}

export function buildRobustnessReport(input: {
  generatedAt: string;
  gameweek: number;
  players: PlayerForEngine[];
  projections: ProbabilisticProjection[];
  startingXI: number[];
  benchOrder: number[];
  thresholds?: number[];
  seed?: number;
  sampleCount?: number;
}): RobustnessReport {
  validateLineup(input.players, input.startingXI, input.benchOrder);
  const seed = input.seed ?? 130026;
  const sampleCount = input.sampleCount ?? DEFAULT_SAMPLE_COUNT;
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) throw new Error("Sample count must be a positive integer.");
  const thresholds = [...new Set(input.thresholds ?? [40, 50, 60])].sort((a, b) => a - b);
  if (thresholds.some((threshold) => !Number.isFinite(threshold))) throw new Error("Squad-point thresholds must be finite numbers.");
  const playerById = new Map(input.players.map((player) => [player.id, player]));
  const projectionById = new Map(input.projections.map((projection) => [projection.playerId, projection]));
  const missingProjection = input.players.find((player) => !projectionById.has(player.id));
  if (missingProjection) throw new Error(`Missing probabilistic projection for player ${missingProjection.id}.`);

  const conditionalPoints = new Map(input.projections.map((projection) => {
    const probability = projection.appearance.appearanceProbability;
    return [projection.playerId, probability === 0 ? 0 : projection.roleAdjustedProjection / probability];
  }));
  const starterOnlyExpectation = input.startingXI.reduce(
    (sum, id) => sum + projectionById.get(id)!.roleAdjustedProjection,
    0
  );
  const benchContribution = new Map(input.benchOrder.map((id) => [id, 0]));
  const benchActivation = new Map(input.benchOrder.map((id) => [id, 0]));
  const replaceablePositions = new Map(input.benchOrder.map((id) => [id, new Set<PlayerForEngine["position"]>()]));
  let expectedWithAutosubs = 0;

  function visitAppearanceStates(index: number, probability: number, appearances: Map<number, boolean>) {
    if (index < input.players.length) {
      const player = input.players[index];
      const appearanceProbability = projectionById.get(player.id)!.appearance.appearanceProbability;
      appearances.set(player.id, true);
      visitAppearanceStates(index + 1, probability * appearanceProbability, appearances);
      appearances.set(player.id, false);
      visitAppearanceStates(index + 1, probability * (1 - appearanceProbability), appearances);
      return;
    }
    if (probability === 0) return;
    const resolved = resolveAutomaticSubstitutions({
      players: input.players.map((player) => ({
        id: player.id,
        position: player.position as Position,
        minutes: appearances.get(player.id) ? 1 : 0
      })),
      startingXI: input.startingXI,
      benchOrder: input.benchOrder
    });
    const statePoints = resolved.startingXI.reduce(
      (sum, id) => sum + (appearances.get(id) ? conditionalPoints.get(id)! : 0),
      0
    );
    expectedWithAutosubs += probability * statePoints;
    for (const substitution of resolved.substitutions) {
      const incoming = substitution.inPlayerId;
      benchContribution.set(incoming, benchContribution.get(incoming)! + probability * conditionalPoints.get(incoming)!);
      benchActivation.set(incoming, benchActivation.get(incoming)! + probability);
      replaceablePositions.get(incoming)!.add(playerById.get(substitution.outPlayerId)!.position);
    }
  }

  visitAppearanceStates(0, 1, new Map());

  const random = randomGenerator(seed);
  const simulatedTotals: number[] = [];
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const appearances = new Map<number, boolean>();
    const points = new Map<number, number>();
    for (const player of input.players) {
      const projection = projectionById.get(player.id)!;
      const appearanceProbability = projection.appearance.appearanceProbability;
      const appeared = random() < appearanceProbability;
      appearances.set(player.id, appeared);
      if (!appeared || appearanceProbability === 0) {
        points.set(player.id, 0);
        continue;
      }
      const mean = conditionalPoints.get(player.id)!;
      const totalVariance = projection.projectionStandardDeviation ** 2;
      const stateVariance = appearanceProbability * (1 - appearanceProbability) * mean ** 2;
      const conditionalDeviation = Math.sqrt(Math.max(0, (totalVariance - stateVariance) / appearanceProbability));
      points.set(player.id, Math.max(-2, Math.min(30, mean + normal(random) * conditionalDeviation)));
    }
    const resolved = resolveAutomaticSubstitutions({
      players: input.players.map((player) => ({
        id: player.id,
        position: player.position as Position,
        minutes: appearances.get(player.id) ? 1 : 0
      })),
      startingXI: input.startingXI,
      benchOrder: input.benchOrder
    });
    simulatedTotals.push(resolved.startingXI.reduce((sum, id) => sum + points.get(id)!, 0));
  }
  simulatedTotals.sort((a, b) => a - b);
  const simulatedMean = simulatedTotals.reduce((sum, value) => sum + value, 0) / simulatedTotals.length;
  const benchGoalkeeperId = input.benchOrder.find((playerId) => playerById.get(playerId)!.position === "GKP")!;
  const outfieldBenchIds = input.benchOrder.filter((playerId) => playerById.get(playerId)!.position !== "GKP");
  if (!benchGoalkeeperId || outfieldBenchIds.length !== 3) {
    throw new Error("Bench order must contain one goalkeeper and three outfield substitutes.");
  }
  const benchSlots = outfieldBenchIds.map((playerId, index) => {
    const player = playerById.get(playerId)!;
    return {
      slot: (index + 1) as 1 | 2 | 3,
      playerId,
      position: player.position,
      cost: player.price,
      appearanceProbability: projectionById.get(playerId)!.appearance.appearanceProbability,
      activationProbability: round(benchActivation.get(playerId)!),
      marginalValue: round(benchContribution.get(playerId)!),
      canReplacePositions: POSITION_ORDER.filter((position) => replaceablePositions.get(playerId)!.has(position))
    };
  });

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    gameweek: input.gameweek,
    model: "independent-appearance-squad-utility",
    modelVersion: "0.0.13",
    seed,
    sampleCount,
    thresholds,
    utility: {
      rawStartingXIProjection: round(input.startingXI.reduce((sum, id) => sum + projectionById.get(id)!.rawProjectionIfStarting, 0)),
      roleAdjustedStartingXIProjection: round(starterOnlyExpectation),
      roleAdjustedWithAutosubs: round(expectedWithAutosubs),
      expectedStarters: round(input.players.reduce((sum, player) => sum + projectionById.get(player.id)!.appearance.startProbability, 0)),
      expectedAppearances: round(input.players.reduce((sum, player) => sum + projectionById.get(player.id)!.appearance.appearanceProbability, 0)),
      unresolvedRoleCount: input.players.filter((player) => projectionById.get(player.id)!.appearance.source !== "current_role").length,
      p10: round(quantile(simulatedTotals, 0.1)),
      median: round(quantile(simulatedTotals, 0.5)),
      p90: round(quantile(simulatedTotals, 0.9)),
      standardDeviation: round(standardDeviation(simulatedTotals, simulatedMean)),
      probabilityBelowThresholds: thresholds.map((threshold) => ({
        threshold,
        probability: round(simulatedTotals.filter((value) => value < threshold).length / sampleCount)
      }))
    },
    substitutions: {
      benchCost: round(input.benchOrder.reduce((sum, id) => sum + playerById.get(id)!.price, 0), 1),
      expectedAutosubValue: round(expectedWithAutosubs - starterOnlyExpectation),
      goalkeeper: {
        playerId: benchGoalkeeperId,
        cost: playerById.get(benchGoalkeeperId)!.price,
        appearanceProbability: projectionById.get(benchGoalkeeperId)!.appearance.appearanceProbability,
        activationProbability: round(benchActivation.get(benchGoalkeeperId)!),
        marginalValue: round(benchContribution.get(benchGoalkeeperId)!)
      },
      benchSlots
    },
    assumptions: [
      "Player appearance states are independent in this report; use concentration analysis for explicit shared-assumption scenarios.",
      "Squad-point distributions exclude captaincy, chips, and transfer costs.",
      "Conditional football outcomes are simulated independently from each projection's mean and variance."
    ]
  };
}

export function buildDraftDeltaReport(input: {
  generatedAt: string;
  previousLabel: string;
  currentLabel: string;
  previous: RobustnessReport;
  current: RobustnessReport;
}): DraftDeltaReport {
  const delta = (current: number, previous: number) => round(current - previous);
  const deltas = {
    rawProjection: delta(input.current.utility.rawStartingXIProjection, input.previous.utility.rawStartingXIProjection),
    roleAdjustedProjection: delta(input.current.utility.roleAdjustedWithAutosubs, input.previous.utility.roleAdjustedWithAutosubs),
    expectedStarters: delta(input.current.utility.expectedStarters, input.previous.utility.expectedStarters),
    autosubValue: delta(input.current.substitutions.expectedAutosubValue, input.previous.substitutions.expectedAutosubValue),
    downsideP10: delta(input.current.utility.p10, input.previous.utility.p10),
    benchCost: delta(input.current.substitutions.benchCost, input.previous.substitutions.benchCost)
  };
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    previousLabel: input.previousLabel,
    currentLabel: input.currentLabel,
    deltas,
    supportedRobustnessMetrics: [
      ...(deltas.roleAdjustedProjection > 0 ? ["roleAdjustedProjection"] : []),
      ...(deltas.expectedStarters > 0 ? ["expectedStarters"] : []),
      ...(deltas.autosubValue > 0 ? ["autosubValue"] : []),
      ...(deltas.downsideP10 > 0 ? ["downsideP10"] : [])
    ]
  };
}

export function validateRobustnessClaim(claim: string, report: DraftDeltaReport, citedMetrics: string[]) {
  if (!/\brobust(?:ness)?\b/i.test(claim)) return;
  const supported = new Set(report.supportedRobustnessMetrics);
  if (!citedMetrics.some((metric) => supported.has(metric))) {
    throw new Error("A robustness claim requires a cited metric that improves in the draft delta report.");
  }
}

export function renderRobustnessMarkdown(report: RobustnessReport) {
  return `# Squad Robustness: GW${report.gameweek}

Generated: ${report.generatedAt}

Model: ${report.model} ${report.modelVersion}

## Utility Vector

| Metric | Value |
| --- | ---: |
| Raw starting XI | ${report.utility.rawStartingXIProjection.toFixed(3)} |
| Role-adjusted starting XI | ${report.utility.roleAdjustedStartingXIProjection.toFixed(3)} |
| Role-adjusted with autosubs | ${report.utility.roleAdjustedWithAutosubs.toFixed(3)} |
| Expected starters | ${report.utility.expectedStarters.toFixed(3)} |
| Expected appearances | ${report.utility.expectedAppearances.toFixed(3)} |
| Unresolved roles | ${report.utility.unresolvedRoleCount} |
| p10 | ${report.utility.p10.toFixed(3)} |
| Median | ${report.utility.median.toFixed(3)} |
| p90 | ${report.utility.p90.toFixed(3)} |
| Standard deviation | ${report.utility.standardDeviation.toFixed(3)} |

## Downside Thresholds

${report.utility.probabilityBelowThresholds.map((item) => `- Below ${item.threshold}: ${(item.probability * 100).toFixed(1)}%`).join("\n") || "- None"}

## Substitution Utility

Bench cost: £${report.substitutions.benchCost.toFixed(1)}m

Expected autosub value: ${report.substitutions.expectedAutosubValue.toFixed(3)}

| Slot | Player | Position | Activation | Marginal value | Formation coverage |
| ---: | ---: | --- | ---: | ---: | --- |
${report.substitutions.benchSlots.map((slot) => `| ${slot.slot} | ${slot.playerId} | ${slot.position} | ${(slot.activationProbability * 100).toFixed(1)}% | ${slot.marginalValue.toFixed(3)} | ${slot.canReplacePositions.join(", ") || "None"} |`).join("\n")}

Goalkeeper ${report.substitutions.goalkeeper.playerId}: ${(report.substitutions.goalkeeper.activationProbability * 100).toFixed(1)}% activation, ${report.substitutions.goalkeeper.marginalValue.toFixed(3)} marginal value.

## Assumptions

${report.assumptions.map((assumption) => `- ${assumption}`).join("\n")}
`;
}

export function renderDraftDeltaMarkdown(report: DraftDeltaReport) {
  const value = (number: number) => `${number >= 0 ? "+" : ""}${number.toFixed(3)}`;
  return `# Draft Delta: ${report.previousLabel} to ${report.currentLabel}

Generated: ${report.generatedAt}

| Metric | Delta |
| --- | ---: |
| Raw projection | ${value(report.deltas.rawProjection)} |
| Role-adjusted projection | ${value(report.deltas.roleAdjustedProjection)} |
| Expected starters | ${value(report.deltas.expectedStarters)} |
| Autosub value | ${value(report.deltas.autosubValue)} |
| Downside p10 | ${value(report.deltas.downsideP10)} |
| Bench cost | ${value(report.deltas.benchCost)} |

Supported robustness metrics: ${report.supportedRobustnessMetrics.join(", ") || "None"}
`;
}
