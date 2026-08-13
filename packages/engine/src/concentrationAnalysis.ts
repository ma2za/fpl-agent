export type SharedAssumptionKind =
  | "team_attack"
  | "team_defense"
  | "tactical_role"
  | "clean_sheet_environment"
  | "penalties"
  | "manager_selection";

export type SharedAssumptionGraph = {
  schemaVersion: 1;
  artifactKind: "tool_evidence";
  generatedAt: string;
  assumptions: Array<{
    assumptionId: string;
    kind: SharedAssumptionKind;
    teamId: number;
    label: string;
  }>;
  dependencies: Array<{
    playerId: number;
    assumptionId: string;
    sensitivity: number;
  }>;
};

export type ClubScenarioSet = {
  schemaVersion: 1;
  artifactKind: "tool_evidence";
  generatedAt: string;
  scenarioSetId: string;
  teamId: number;
  scenarios: Array<{
    level: "strong" | "baseline" | "weak";
    probability: number;
    shocks: Array<{ assumptionId: string; value: number }>;
  }>;
};

export type ConcentrationPlayer = {
  playerId: number;
  teamId: number;
  baselineUtility: number;
};

export type ConcentrationCandidate = {
  candidateId: string;
  playerIds: number[];
  independentP10: number;
};

export type CandidateConcentrationRisk = {
  candidateId: string;
  exposureClass: "maximum_two" | "triple";
  clubConcentrations: Array<{ teamId: number; playerIds: number[]; count: number }>;
  assumptionConcentrations: Array<{ assumptionId: string; playerIds: number[]; count: number }>;
  expectedUtility: number;
  independentP10: number;
  correlatedP10: number;
  squadVariance: number;
  concentrationPenalty: number;
  penalizedObjective: number;
  maxScenarioRegret: number;
  expectedScenarioRegret: number;
  pairwiseCovariances: Array<{ playerAId: number; playerBId: number; covariance: number }>;
  downsideContributions: Array<{ playerId: number; worstScenarioLoss: number }>;
  scenarioUtilities: Array<{ scenarioId: string; probability: number; utility: number; regret: number }>;
};

export type ConcentrationRiskReport = {
  schemaVersion: 1;
  artifactKind: "tool_evidence";
  generatedAt: string;
  model: "shared-assumption-scenarios";
  modelVersion: "0.0.15";
  concentrationPenaltyWeight: number;
  candidates: CandidateConcentrationRisk[];
  assumptions: string[];
};

export type ScenarioComparison = {
  schemaVersion: 1;
  artifactKind: "tool_evidence";
  generatedAt: string;
  candidateIds: string[];
  metrics: Array<{
    candidateId: string;
    exposureClass: "maximum_two" | "triple";
    expectedUtility: number;
    correlatedP10: number;
    maxScenarioRegret: number;
    concentrationPenalty: number;
    penalizedObjective: number;
  }>;
  decisionPolicy: string;
};

type JointScenario = {
  scenarioId: string;
  probability: number;
  shocks: Map<string, number>;
};

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function jointScenarios(scenarioSets: ClubScenarioSet[]) {
  let outcomes: JointScenario[] = [{ scenarioId: "baseline", probability: 1, shocks: new Map() }];
  for (const set of scenarioSets) {
    outcomes = outcomes.flatMap((outcome) => set.scenarios.map((scenario) => ({
      scenarioId: `${outcome.scenarioId}|${set.teamId}:${scenario.level}`,
      probability: outcome.probability * scenario.probability,
      shocks: new Map([
        ...outcome.shocks,
        ...scenario.shocks.map((shock) => [shock.assumptionId, shock.value] as const)
      ])
    })));
  }
  return outcomes;
}

function weightedQuantile(values: Array<{ value: number; probability: number }>, quantile: number) {
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, item) => sum + item.probability, 0);
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += item.probability;
    if (cumulative >= total * quantile) return item.value;
  }
  return sorted.at(-1)?.value ?? 0;
}

export function buildConcentrationAnalysis(input: {
  generatedAt: string;
  graph: SharedAssumptionGraph;
  scenarioSets: ClubScenarioSet[];
  players: ConcentrationPlayer[];
  candidates: ConcentrationCandidate[];
  concentrationPenaltyWeight: number;
}) {
  const assumptions = new Set(input.graph.assumptions.map((item) => item.assumptionId));
  const scenarioAssumptions = new Set(input.scenarioSets.flatMap((set) =>
    set.scenarios.flatMap((scenario) => scenario.shocks.map((shock) => shock.assumptionId))
  ));
  for (const dependency of input.graph.dependencies) {
    if (!assumptions.has(dependency.assumptionId)) throw new Error(`Unknown shared assumption ${dependency.assumptionId}.`);
  }
  for (const assumptionId of scenarioAssumptions) {
    if (!assumptions.has(assumptionId)) throw new Error(`Scenario references unknown shared assumption ${assumptionId}.`);
  }
  for (const set of input.scenarioSets) {
    const probability = set.scenarios.reduce((sum, scenario) => sum + scenario.probability, 0);
    if (Math.abs(probability - 1) > 1e-9) throw new Error(`Scenario probabilities for team ${set.teamId} must sum to one.`);
    const levels = new Set(set.scenarios.map((scenario) => scenario.level));
    if (!["strong", "baseline", "weak"].every((level) => levels.has(level as "strong" | "baseline" | "weak"))) {
      throw new Error(`Scenario set ${set.scenarioSetId} requires strong, baseline, and weak scenarios.`);
    }
  }

  const players = new Map(input.players.map((player) => [player.playerId, player]));
  const dependencies = new Map<number, SharedAssumptionGraph["dependencies"]>();
  for (const dependency of input.graph.dependencies) {
    dependencies.set(dependency.playerId, [...(dependencies.get(dependency.playerId) ?? []), dependency]);
  }
  const outcomes = jointScenarios(input.scenarioSets);
  const candidateOutcomes = new Map<string, Array<{ scenarioId: string; probability: number; utility: number; playerUtilities: Map<number, number> }>>();

  for (const candidate of input.candidates) {
    const missing = candidate.playerIds.filter((playerId) => !players.has(playerId));
    if (missing.length > 0) throw new Error(`Candidate ${candidate.candidateId} is missing player models: ${missing.join(", ")}.`);
    candidateOutcomes.set(candidate.candidateId, outcomes.map((outcome) => {
      const playerUtilities = new Map(candidate.playerIds.map((playerId) => {
        const player = players.get(playerId)!;
        const adjustment = (dependencies.get(playerId) ?? []).reduce(
          (sum, dependency) => sum + dependency.sensitivity * (outcome.shocks.get(dependency.assumptionId) ?? 0),
          0
        );
        return [playerId, player.baselineUtility + adjustment] as const;
      }));
      return {
        scenarioId: outcome.scenarioId,
        probability: outcome.probability,
        utility: [...playerUtilities.values()].reduce((sum, value) => sum + value, 0),
        playerUtilities
      };
    }));
  }

  const bestByScenario = new Map(outcomes.map((outcome) => [
    outcome.scenarioId,
    Math.max(...input.candidates.map((candidate) =>
      candidateOutcomes.get(candidate.candidateId)!.find((item) => item.scenarioId === outcome.scenarioId)!.utility
    ))
  ]));

  const reports = input.candidates.map((candidate): CandidateConcentrationRisk => {
    const selectedPlayers = candidate.playerIds.map((playerId) => players.get(playerId)!);
    const scenarioUtilities = candidateOutcomes.get(candidate.candidateId)!;
    const expectedUtility = scenarioUtilities.reduce((sum, outcome) => sum + outcome.probability * outcome.utility, 0);
    const expectedByPlayer = new Map(candidate.playerIds.map((playerId) => [playerId, scenarioUtilities.reduce(
      (sum, outcome) => sum + outcome.probability * outcome.playerUtilities.get(playerId)!, 0
    )]));
    const pairwiseCovariances: CandidateConcentrationRisk["pairwiseCovariances"] = [];
    for (let left = 0; left < candidate.playerIds.length; left += 1) {
      for (let right = left + 1; right < candidate.playerIds.length; right += 1) {
        const playerAId = candidate.playerIds[left];
        const playerBId = candidate.playerIds[right];
        const covariance = scenarioUtilities.reduce((sum, outcome) => sum + outcome.probability *
          (outcome.playerUtilities.get(playerAId)! - expectedByPlayer.get(playerAId)!) *
          (outcome.playerUtilities.get(playerBId)! - expectedByPlayer.get(playerBId)!), 0);
        if (Math.abs(covariance) > 1e-9) pairwiseCovariances.push({ playerAId, playerBId, covariance: round(covariance) });
      }
    }
    const squadVariance = scenarioUtilities.reduce(
      (sum, outcome) => sum + outcome.probability * (outcome.utility - expectedUtility) ** 2,
      0
    );
    const concentrationPenalty = input.concentrationPenaltyWeight * Math.sqrt(Math.max(0, squadVariance));
    const clubGroups = new Map<number, number[]>();
    for (const player of selectedPlayers) clubGroups.set(player.teamId, [...(clubGroups.get(player.teamId) ?? []), player.playerId]);
    const assumptionGroups = new Map<string, number[]>();
    for (const playerId of candidate.playerIds) {
      for (const dependency of dependencies.get(playerId) ?? []) {
        assumptionGroups.set(dependency.assumptionId, [...(assumptionGroups.get(dependency.assumptionId) ?? []), playerId]);
      }
    }
    const withRegret = scenarioUtilities.map((outcome) => ({
      scenarioId: outcome.scenarioId,
      probability: round(outcome.probability),
      utility: round(outcome.utility),
      regret: round(bestByScenario.get(outcome.scenarioId)! - outcome.utility)
    }));
    return {
      candidateId: candidate.candidateId,
      exposureClass: [...clubGroups.values()].some((ids) => ids.length === 3) ? "triple" : "maximum_two",
      clubConcentrations: [...clubGroups.entries()].map(([teamId, playerIds]) => ({ teamId, playerIds, count: playerIds.length })),
      assumptionConcentrations: [...assumptionGroups.entries()].map(([assumptionId, playerIds]) => ({ assumptionId, playerIds, count: playerIds.length })),
      expectedUtility: round(expectedUtility),
      independentP10: round(candidate.independentP10),
      correlatedP10: round(weightedQuantile(scenarioUtilities.map((outcome) => ({ value: outcome.utility, probability: outcome.probability })), 0.1)),
      squadVariance: round(squadVariance),
      concentrationPenalty: round(concentrationPenalty),
      penalizedObjective: round(expectedUtility - concentrationPenalty),
      maxScenarioRegret: Math.max(...withRegret.map((outcome) => outcome.regret)),
      expectedScenarioRegret: round(withRegret.reduce((sum, outcome) => sum + outcome.probability * outcome.regret, 0)),
      pairwiseCovariances,
      downsideContributions: candidate.playerIds.map((playerId) => ({
        playerId,
        worstScenarioLoss: round(Math.max(0, players.get(playerId)!.baselineUtility - Math.min(
          ...scenarioUtilities.map((outcome) => outcome.playerUtilities.get(playerId)!)
        )))
      })),
      scenarioUtilities: withRegret
    };
  });

  const report: ConcentrationRiskReport = {
    schemaVersion: 1,
    artifactKind: "tool_evidence",
    generatedAt: input.generatedAt,
    model: "shared-assumption-scenarios",
    modelVersion: "0.0.15",
    concentrationPenaltyWeight: input.concentrationPenaltyWeight,
    candidates: reports,
    assumptions: [
      "Club scenario sets are independent of one another.",
      "Players linked to the same assumption receive the same scenario shock scaled by their declared sensitivity.",
      "The concentration penalty is its configured weight multiplied by correlated squad standard deviation."
    ]
  };
  const comparison: ScenarioComparison = {
    schemaVersion: 1,
    artifactKind: "tool_evidence",
    generatedAt: input.generatedAt,
    candidateIds: reports.map((item) => item.candidateId),
    metrics: reports.map((item) => ({
      candidateId: item.candidateId,
      exposureClass: item.exposureClass,
      expectedUtility: item.expectedUtility,
      correlatedP10: item.correlatedP10,
      maxScenarioRegret: item.maxScenarioRegret,
      concentrationPenalty: item.concentrationPenalty,
      penalizedObjective: item.penalizedObjective
    })),
    decisionPolicy: "This comparison reports scenario tradeoffs for independently optimized candidates. It does not select, rank, or recommend a candidate."
  };
  return { report, comparison };
}

export function renderScenarioComparisonMarkdown(comparison: ScenarioComparison) {
  return `# Correlated Scenario Comparison

Generated: ${comparison.generatedAt}

| Candidate | Exposure | Expected utility | Correlated p10 | Max regret | Concentration penalty | Penalized objective |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
${comparison.metrics.map((item) => `| ${item.candidateId} | ${item.exposureClass} | ${item.expectedUtility.toFixed(3)} | ${item.correlatedP10.toFixed(3)} | ${item.maxScenarioRegret.toFixed(3)} | ${item.concentrationPenalty.toFixed(3)} | ${item.penalizedObjective.toFixed(3)} |`).join("\n")}

## Decision Boundary

${comparison.decisionPolicy}
`;
}
