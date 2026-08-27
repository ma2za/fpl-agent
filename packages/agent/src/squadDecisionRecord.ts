import {
  validateBench,
  validateCaptaincy,
  validateSquad,
  validateStartingXI,
  type PlayerForRules
} from "../../rules/src";

export type DecisionEvidenceRef = {
  id: string;
  kind: "MODEL_OUTPUT" | "OFFICIAL" | "PREDICTED_LINEUP" | "NEWS";
  location: string;
  retrievedAt: string;
  snapshotHash: string;
  claimIds: string[];
  reliability: number;
};

type ProjectionInput = {
  playerId: number;
  roleAdjustedProjection: number;
  projectionStandardDeviation: number;
  p10: number;
  median: number;
  p90: number;
  appearance: { startProbability: number; appearanceProbability: number };
};

type DecisionInput = {
  selectionCase: string;
  alternativePlayerId: number;
  additionalAlternativePlayerIds?: number[];
  alternativeCases?: Record<number, string>;
  alternativeCase: string;
  materialRisk: string;
  riskResponse: string;
  evidenceIds: string[];
  trigger?: { metric: "startProbability"; operator: "lt"; threshold: number; action: "REOPTIMIZE" };
};

export type SquadDecisionRecord = {
  schemaVersion: 1;
  artifactKind: "decision_record";
  gameweek: number;
  generatedAt: string;
  optimizerRun: { runId: string; sourcePath: string; model: string; modelVersion: string; sampleCount: number };
  objective: { type: string; horizon: number; weights: readonly number[]; expectedTransferPolicy: string };
  strategy: {
    budget: number;
    benchBudgetMax: number;
    minimumXIStartProbability: number;
    minimumBenchStartProbability: number;
    maximumPlayersPerClub: number;
    simulationMode: string;
  };
  decisionTolerance: {
    epsilon: number;
    components: { minimumExpectedPointsDelta: number; modelUncertaintyThreshold: number };
    tieBreakOrder: readonly string[];
  };
  squad: {
    playerIds: number[];
    startingXI: number[];
    benchOrder: number[];
    captainPlayerId: number;
    viceCaptainPlayerId: number;
    formation: string;
    cost: number;
    bank: number;
    benchCost: number;
  };
  evidence: DecisionEvidenceRef[];
  playerDecisions: Array<{
    playerId: number;
    playerName: string;
    role: "starter" | "bench";
    metrics: {
      price: number;
      startProbability: number;
      appearanceProbability: number;
      gw1ExpectedPoints: number;
      p10: number;
      median: number;
      p90: number;
      projectionStandardDeviation?: number;
    };
    selectionCase: string;
    alternative: {
      playerId: number;
      playerName: string;
      position: string;
      price: number;
      startProbability: number;
      gw1ExpectedPoints: number;
      projectionStandardDeviation?: number;
      delta: number;
      uncertaintyThreshold?: number;
      classification: "MODEL_TIE" | "MEANINGFUL_EDGE";
      tieBreakApplied: string | null;
      comparisonRunId: string;
      comparisonScope: "PLAYER_PROJECTION" | "STRUCTURE";
      rationale: string;
    };
    alternatives?: SquadDecisionRecord["playerDecisions"][number]["alternative"][];
    materialRisk: string;
    riskResponse: string;
    trigger: DecisionInput["trigger"] | null;
    evidenceIds: string[];
  }>;
  validation: { isValid: boolean; errors: string[] };
};

function tieBreak(selected: ProjectionInput, alternative: ProjectionInput, selectedPrice: number, alternativePrice: number) {
  if (selected.p10 > alternative.p10) return "higher_p10";
  if (selected.appearance.startProbability > alternative.appearance.startProbability) return "higher_start_probability";
  if (selectedPrice < alternativePrice) return "lower_price";
  return "optimizer_candidate_order";
}

export function validateSquadDecisionRecord(record: SquadDecisionRecord, players: PlayerForRules[]) {
  const errors: string[] = [];
  const playerById = new Map(players.map((player) => [player.id, player]));
  const squadPlayers = record.squad.playerIds.flatMap((id) => playerById.get(id) ?? []);
  const legality = [
    validateSquad({ players: squadPlayers, budget: record.strategy.budget, maxPlayersPerClub: record.strategy.maximumPlayersPerClub }),
    validateStartingXI({ squad: squadPlayers, startingXI: record.squad.startingXI, formation: record.squad.formation }),
    validateBench({ squad: squadPlayers, startingXI: record.squad.startingXI, benchOrder: record.squad.benchOrder }),
    validateCaptaincy({ squad: squadPlayers, captainPlayerId: record.squad.captainPlayerId, viceCaptainPlayerId: record.squad.viceCaptainPlayerId })
  ];
  for (const result of legality) errors.push(...result.errors);
  if (!record.squad.startingXI.includes(record.squad.captainPlayerId)) errors.push("Captain must belong to the starting XI.");
  if (!record.squad.startingXI.includes(record.squad.viceCaptainPlayerId)) errors.push("Vice-captain must belong to the starting XI.");
  if (record.squad.benchOrder[0] && playerById.get(record.squad.benchOrder[0])?.position !== "GKP") {
    errors.push("The first bench slot must be the substitute goalkeeper.");
  }
  if (record.squad.cost > record.strategy.budget) errors.push("Squad exceeds the strategy budget.");
  if (record.squad.benchCost > record.strategy.benchBudgetMax) errors.push("Bench exceeds the strategy bench cap.");
  if (record.playerDecisions.length !== record.squad.playerIds.length) errors.push("Decision coverage must match the selected squad.");
  const selected = new Set(record.squad.playerIds);
  const evidence = new Map(record.evidence.map((item) => [item.id, item]));
  for (const decision of record.playerDecisions) {
    if (!selected.has(decision.playerId)) errors.push(`Decision exists for unselected player ${decision.playerId}.`);
    const alternatives = decision.alternatives ?? [decision.alternative];
    if (new Set(alternatives.map((alternative) => alternative.playerId)).size !== alternatives.length) {
      errors.push(`Alternatives must be unique for player ${decision.playerId}.`);
    }
    for (const alternative of alternatives) {
      if (selected.has(alternative.playerId)) errors.push(`Alternative ${alternative.playerId} is already selected.`);
      if (!playerById.has(alternative.playerId)) errors.push(`Alternative ${alternative.playerId} does not exist.`);
      const expectedDelta = Number((decision.metrics.gw1ExpectedPoints - alternative.gw1ExpectedPoints).toFixed(3));
      if (Math.abs(expectedDelta - alternative.delta) > 0.001) errors.push(`Alternative delta is stale for player ${decision.playerId}.`);
      if (decision.metrics.projectionStandardDeviation !== undefined && alternative.projectionStandardDeviation !== undefined) {
        const expectedThreshold = Number(Math.max(
          record.decisionTolerance.epsilon,
          record.decisionTolerance.components.modelUncertaintyThreshold * Math.hypot(
            decision.metrics.projectionStandardDeviation,
            alternative.projectionStandardDeviation
          )
        ).toFixed(3));
        if (alternative.uncertaintyThreshold !== expectedThreshold) errors.push(`Uncertainty threshold is stale for player ${decision.playerId}.`);
      }
      const comparisonThreshold = alternative.uncertaintyThreshold ?? record.decisionTolerance.epsilon;
      const expectedClassification = Math.abs(expectedDelta) < comparisonThreshold ? "MODEL_TIE" : "MEANINGFUL_EDGE";
      if (alternative.classification !== expectedClassification) errors.push(`Tolerance classification is stale for player ${decision.playerId}.`);
      if (expectedClassification === "MODEL_TIE" && !alternative.tieBreakApplied) errors.push(`Model tie for player ${decision.playerId} requires a tie-break.`);
      if (expectedClassification === "MEANINGFUL_EDGE" && alternative.tieBreakApplied) errors.push(`Non-tie for player ${decision.playerId} cannot apply a tie-break.`);
      if (expectedClassification === "MEANINGFUL_EDGE" && expectedDelta < 0) errors.push(`Alternative ${alternative.playerId} has a meaningful projection edge over player ${decision.playerId}.`);
      if (alternative.tieBreakApplied && !record.decisionTolerance.tieBreakOrder.includes(alternative.tieBreakApplied)) {
        errors.push(`Unknown tie-break for player ${decision.playerId}.`);
      }
      if (alternative.comparisonRunId !== record.optimizerRun.runId) errors.push(`Comparison run is stale for player ${decision.playerId}.`);
    }
    const threshold = decision.role === "starter"
      ? record.strategy.minimumXIStartProbability
      : record.strategy.minimumBenchStartProbability;
    if (decision.metrics.startProbability < threshold) errors.push(`Player ${decision.playerId} is below the ${decision.role} start threshold.`);
    for (const evidenceId of decision.evidenceIds) {
      const reference = evidence.get(evidenceId);
      if (!reference) errors.push(`Player ${decision.playerId} references missing evidence ${evidenceId}.`);
      else if (!reference.snapshotHash || !reference.retrievedAt || reference.claimIds.length === 0) {
        errors.push(`Evidence ${evidenceId} has incomplete provenance.`);
      }
    }
    if (decision.trigger && decision.trigger.threshold !== threshold) errors.push(`Risk trigger threshold is stale for player ${decision.playerId}.`);
  }
  return { isValid: errors.length === 0, errors };
}

export function buildSquadDecisionRecord(input: {
  gameweek: number;
  generatedAt: string;
  squad: { players: number[]; benchOrder: number[]; captainPlayerId: number; viceCaptainPlayerId: number; formation: string; bank: number };
  strategy: {
    objective: SquadDecisionRecord["objective"];
    constraints: SquadDecisionRecord["strategy"];
    decisionTolerance: {
      minimumExpectedPointsDelta: number;
      modelUncertaintyThreshold: number;
      tieBreakOrder: readonly string[];
    };
    optimizerRun: SquadDecisionRecord["optimizerRun"] & { generatedAt: string };
  };
  players: PlayerForRules[];
  projections: ProjectionInput[];
  decisions: Record<number, DecisionInput>;
  evidence: DecisionEvidenceRef[];
}) {
  const playerById = new Map(input.players.map((player) => [player.id, player]));
  const projectionById = new Map(input.projections.map((projection) => [projection.playerId, projection]));
  const bench = new Set(input.squad.benchOrder);
  const epsilon = input.strategy.decisionTolerance.minimumExpectedPointsDelta;
  const playerDecisions = input.squad.players.map((playerId) => {
    const player = playerById.get(playerId);
    const projection = projectionById.get(playerId);
    const decision = input.decisions[playerId];
    if (!player || !projection || !decision) throw new Error(`Missing structured decision input for player ${playerId}.`);
    const alternativeIds = [decision.alternativePlayerId, ...(decision.additionalAlternativePlayerIds ?? [])];
    if (new Set(alternativeIds).size !== alternativeIds.length) throw new Error(`Duplicate alternative input for player ${playerId}.`);
    const alternatives = alternativeIds.map((alternativePlayerId) => {
      const alternativePlayer = playerById.get(alternativePlayerId);
      const alternativeProjection = projectionById.get(alternativePlayerId);
      if (!alternativePlayer || !alternativeProjection) throw new Error(`Missing alternative evidence for player ${playerId}.`);
      const delta = Number((projection.roleAdjustedProjection - alternativeProjection.roleAdjustedProjection).toFixed(3));
      const uncertaintyThreshold = Number(Math.max(
        epsilon,
        input.strategy.decisionTolerance.modelUncertaintyThreshold * Math.hypot(
          projection.projectionStandardDeviation,
          alternativeProjection.projectionStandardDeviation
        )
      ).toFixed(3));
      const classification = Math.abs(delta) < uncertaintyThreshold ? "MODEL_TIE" as const : "MEANINGFUL_EDGE" as const;
      return {
        playerId: alternativePlayer.id,
        playerName: alternativePlayer.name,
        position: alternativePlayer.position,
        price: alternativePlayer.price,
        startProbability: alternativeProjection.appearance.startProbability,
        gw1ExpectedPoints: alternativeProjection.roleAdjustedProjection,
        projectionStandardDeviation: alternativeProjection.projectionStandardDeviation,
        delta,
        uncertaintyThreshold,
        classification,
        tieBreakApplied: classification === "MODEL_TIE"
          ? tieBreak(projection, alternativeProjection, player.price, alternativePlayer.price)
          : null,
        comparisonRunId: input.strategy.optimizerRun.runId,
        comparisonScope: player.position === alternativePlayer.position ? "PLAYER_PROJECTION" as const : "STRUCTURE" as const,
        rationale: decision.alternativeCases?.[alternativePlayerId] ?? decision.alternativeCase
      };
    });
    return {
      playerId,
      playerName: player.name,
      role: bench.has(playerId) ? "bench" as const : "starter" as const,
      metrics: {
        price: player.price,
        startProbability: projection.appearance.startProbability,
        appearanceProbability: projection.appearance.appearanceProbability,
        gw1ExpectedPoints: projection.roleAdjustedProjection,
        p10: projection.p10,
        median: projection.median,
        p90: projection.p90,
        projectionStandardDeviation: projection.projectionStandardDeviation
      },
      selectionCase: decision.selectionCase,
      alternative: alternatives[0],
      alternatives,
      materialRisk: decision.materialRisk,
      riskResponse: decision.riskResponse,
      trigger: decision.trigger ?? null,
      evidenceIds: decision.evidenceIds
    };
  });
  const squadPlayers = input.squad.players.map((id) => playerById.get(id)!);
  const record: SquadDecisionRecord = {
    schemaVersion: 1,
    artifactKind: "decision_record",
    gameweek: input.gameweek,
    generatedAt: input.generatedAt,
    optimizerRun: input.strategy.optimizerRun,
    objective: input.strategy.objective,
    strategy: input.strategy.constraints,
    decisionTolerance: {
      epsilon,
      components: {
        minimumExpectedPointsDelta: input.strategy.decisionTolerance.minimumExpectedPointsDelta,
        modelUncertaintyThreshold: input.strategy.decisionTolerance.modelUncertaintyThreshold
      },
      tieBreakOrder: input.strategy.decisionTolerance.tieBreakOrder
    },
    squad: {
      playerIds: input.squad.players,
      startingXI: input.squad.players.filter((id) => !bench.has(id)),
      benchOrder: input.squad.benchOrder,
      captainPlayerId: input.squad.captainPlayerId,
      viceCaptainPlayerId: input.squad.viceCaptainPlayerId,
      formation: input.squad.formation,
      cost: Number(squadPlayers.reduce((sum, player) => sum + player.price, 0).toFixed(1)),
      bank: input.squad.bank,
      benchCost: Number(input.squad.benchOrder.reduce((sum, id) => sum + playerById.get(id)!.price, 0).toFixed(1))
    },
    evidence: input.evidence,
    playerDecisions,
    validation: { isValid: false, errors: [] }
  };
  record.validation = validateSquadDecisionRecord(record, input.players);
  return record;
}

export function generateSquadReasoning(record: SquadDecisionRecord) {
  return Object.fromEntries(record.playerDecisions.map((decision) => {
    const metricSentence = `${(decision.metrics.startProbability * 100).toFixed(1)}% start probability and ${decision.metrics.gw1ExpectedPoints.toFixed(1)} GW1 expected points.`;
    const comparisons = (decision.alternatives ?? [decision.alternative]).map((alternative) => {
      const comparison = alternative.classification === "MODEL_TIE"
        ? `Model tie within ${(alternative.uncertaintyThreshold ?? record.decisionTolerance.epsilon).toFixed(2)} points; ${alternative.tieBreakApplied!.replaceAll("_", " ")} selects the player. ${alternative.rationale}`
        : `${alternative.delta.toFixed(1)} GW1 expected-points edge in the current projection comparison. ${alternative.rationale}`;
      return { playerId: alternative.playerId, reason: comparison };
    });
    return [decision.playerId, {
      role: decision.role,
      whySelected: [decision.selectionCase, metricSentence],
      comparedAgainst: comparisons,
      materialRisk: decision.materialRisk,
      riskResponse: decision.riskResponse,
      evidence: decision.evidenceIds.map((id) => record.evidence.find((item) => item.id === id)!.location)
    }];
  }));
}
