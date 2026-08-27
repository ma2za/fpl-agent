import { recommendationRationale } from "./epistemic";
import type {
  DecisionCandidateScore,
  DecisionEvaluation,
  DecisionType,
  DeterministicFactualClaim,
  EvidenceSnapshotComponentKind,
  WeeklyRecommendation
} from "./types";

const REQUIRED_COMPONENTS: EvidenceSnapshotComponentKind[] = [
  "bootstrap", "fixtures", "prices", "availability", "ownership", "team_news",
  "predicted_lineups", "set_pieces", "betting_markets", "projection_model",
  "appearance_model", "manual_overrides"
];

const REQUIRED_DECISIONS: DecisionType[] = [
  "squad", "structure", "starting_xi", "bench_order", "captaincy", "transfers", "chip"
];

export type PublicationValidatorResult = {
  validator: "snapshot" | "decision-objective" | "score-decomposition" | "numerical-invariants" | "factual-claims" | "risk-coverage";
  status: "pass" | "warn" | "fail";
  errors: string[];
  warnings: string[];
};

export type PublicationGate = {
  publicationStatus: "valid" | "valid_with_warnings" | "invalid";
  validators: PublicationValidatorResult[];
  errors: string[];
  warnings: string[];
};

export function squadCandidateId(playerIds: number[]) {
  return `squad:${[...playerIds].sort((a, b) => a - b).join(",")}`;
}

export function startingXiCandidateId(playerIds: number[]) {
  return `xi:${[...playerIds].sort((a, b) => a - b).join(",")}`;
}

export function benchCandidateId(playerIds: number[]) {
  return `bench:${playerIds.join(",")}`;
}

export function captainCandidateId(playerId: number) {
  return `player:${playerId}`;
}

export function transferCandidateId(recommendation: WeeklyRecommendation) {
  const moves = recommendation.recommendedAction.transfers
    .map((move) => `${move.sellPlayerId}>${move.buyPlayerId}`)
    .join(",");
  return `action:${recommendation.recommendedAction.type}:${moves || "none"}`;
}

function validator(
  name: PublicationValidatorResult["validator"],
  errors: string[],
  warnings: string[] = []
): PublicationValidatorResult {
  return { validator: name, status: errors.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass", errors, warnings };
}

function snapshotValidation(recommendation: WeeklyRecommendation) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const snapshot = recommendation.evidenceSnapshot;

  if (!snapshot) return validator("snapshot", ["Final recommendation must include an immutable evidence snapshot."]);

  const componentKinds = new Set<EvidenceSnapshotComponentKind>();
  for (const component of snapshot.components) {
    if (componentKinds.has(component.kind)) errors.push(`Evidence snapshot contains duplicate ${component.kind} components.`);
    componentKinds.add(component.kind);
    if (component.status === "available" && (!component.sourceId || !component.retrievedAt || !component.contentHash)) {
      errors.push(`Available snapshot component ${component.kind} requires sourceId, retrievedAt, and contentHash.`);
    }
    if (!component.coverageStatus) errors.push(`Evidence snapshot component ${component.kind} must distinguish source availability from usable coverage.`);
    if (component.coverageStatus === "no_matching_rows" && component.matchedRecordCount !== 0) {
      errors.push(`Evidence snapshot component ${component.kind} with no matching rows must record matchedRecordCount 0.`);
    }
    if (component.coverageStatus === "usable" && component.status !== "available") {
      errors.push(`Evidence snapshot component ${component.kind} cannot have usable coverage when its source is ${component.status}.`);
    }
    if (component.status === "missing") warnings.push(`Evidence snapshot component ${component.kind} is missing.`);
  }

  for (const kind of REQUIRED_COMPONENTS) {
    if (!componentKinds.has(kind)) errors.push(`Evidence snapshot is missing component declaration ${kind}.`);
  }

  if (recommendation.canonicalState?.snapshotId !== snapshot.snapshotId) {
    errors.push("Canonical decision state must reference the recommendation evidence snapshot.");
  }

  for (const evaluation of recommendation.decisionEvaluations ?? []) {
    if (evaluation.snapshotId !== snapshot.snapshotId) errors.push(`Decision ${evaluation.decisionId} references an incompatible snapshot.`);
  }
  for (const observation of recommendation.claimLedger?.observations ?? []) {
    if (observation.snapshotId !== snapshot.snapshotId) errors.push(`Observation ${observation.id} must reference snapshot ${snapshot.snapshotId}.`);
  }
  if (recommendation.claimLedger?.schemaVersion === 3) {
    for (const forecast of recommendation.claimLedger.forecasts) {
      if (forecast.snapshotId !== snapshot.snapshotId) errors.push(`Forecast ${forecast.id} must reference snapshot ${snapshot.snapshotId}.`);
    }
  }
  for (const claim of recommendation.factualClaims ?? []) {
    if (claim.snapshotId !== snapshot.snapshotId) errors.push(`Factual claim ${claim.id} references an incompatible snapshot.`);
  }

  return validator("snapshot", errors, warnings);
}

function evaluationByType(recommendation: WeeklyRecommendation) {
  return new Map((recommendation.decisionEvaluations ?? []).map((evaluation) => [evaluation.decisionType, evaluation]));
}

function selectedCandidateIds(recommendation: WeeklyRecommendation): Partial<Record<DecisionType, string>> {
  return {
    squad: squadCandidateId(recommendation.squadBefore.players.map((player) => player.id)),
    starting_xi: startingXiCandidateId(recommendation.pickTeam.startingXI),
    bench_order: benchCandidateId(recommendation.pickTeam.benchOrder),
    captaincy: captainCandidateId(recommendation.captaincy.captainPlayerId),
    transfers: transferCandidateId(recommendation),
    chip: `chip:${recommendation.chip.chip}`
  };
}

function decisionValidation(recommendation: WeeklyRecommendation) {
  const errors: string[] = [];
  const evaluations = recommendation.decisionEvaluations ?? [];
  const byType = evaluationByType(recommendation);
  const declaredDecisionIds = new Set(recommendation.decisionIds ?? []);
  const evaluationIds = new Set<string>();
  const tolerance = recommendation.canonicalState?.floatingPointTolerance ?? 0.000001;
  const optimizedDecisionTypes = new Set<DecisionType>(["squad", "structure", "starting_xi", "captaincy"]);

  for (const type of REQUIRED_DECISIONS) {
    if (!byType.has(type)) errors.push(`Canonical DecisionEvaluation is required for ${type}.`);
  }

  for (const evaluation of evaluations) {
    if (evaluationIds.has(evaluation.decisionId)) errors.push(`Duplicate DecisionEvaluation ID ${evaluation.decisionId}.`);
    evaluationIds.add(evaluation.decisionId);
    if (!declaredDecisionIds.has(evaluation.decisionId)) errors.push(`DecisionEvaluation ${evaluation.decisionId} is not a declared decision dependency.`);
    const candidateIds = new Set<string>();
    for (const candidate of evaluation.candidateScores) {
      if (candidateIds.has(candidate.candidateId)) errors.push(`Decision ${evaluation.decisionId} contains duplicate candidate ${candidate.candidateId}.`);
      candidateIds.add(candidate.candidateId);
      if (evaluation.objectiveMetric === "raw_expected_points" &&
        (candidate.rawExpectedPoints === null || Math.abs(candidate.rawExpectedPoints - candidate.objectiveScore) > tolerance)) {
        errors.push(`Decision ${evaluation.decisionId} declares raw expected points but candidate ${candidate.candidateId} uses a different objective score.`);
      }
      if (candidate.lowerBound !== null && candidate.upperBound !== null && candidate.lowerBound > candidate.upperBound) {
        errors.push(`Decision ${evaluation.decisionId} candidate ${candidate.candidateId} has reversed uncertainty bounds.`);
      }
    }

    const selected = evaluation.candidateScores.find((candidate) => candidate.candidateId === evaluation.selectedCandidateId);
    if (!selected) {
      errors.push(`Decision ${evaluation.decisionId} selected candidate is absent from its candidate scores.`);
      continue;
    }
    if (!selected.eligible) errors.push(`Decision ${evaluation.decisionId} selected an ineligible candidate.`);

    const eligible = evaluation.candidateScores.filter((candidate) => candidate.eligible);
    if (optimizedDecisionTypes.has(evaluation.decisionType) && eligible.length < 2) {
      errors.push(`Optimized decision ${evaluation.decisionId} must contain at least two meaningful eligible candidates.`);
    }
    const bestScore = Math.max(...eligible.map((candidate) => candidate.objectiveScore));
    if (bestScore - selected.objectiveScore > tolerance) {
      errors.push(`Decision ${evaluation.decisionId} selected ${selected.candidateId} with score ${selected.objectiveScore}, below the declared-objective maximum ${bestScore}.`);
    }
    if (evaluation.selectedBy === "explicit_override") {
      errors.push(`Decision ${evaluation.decisionId} uses a discretionary explicit override; final decisions must maximize their declared objective.`);
    }
    if (evaluation.overrideReason !== null) {
      errors.push(`Decision ${evaluation.decisionId} records an override reason; discretionary overrides are invalid.`);
    }
    const tiedBest = eligible.filter((candidate) => Math.abs(bestScore - candidate.objectiveScore) <= tolerance);
    if (evaluation.tieBreakersApplied.length > 0 && tiedBest.length < 2) {
      errors.push(`Decision ${evaluation.decisionId} applies tie-breakers without an objective-score tie.`);
    }

    if (evaluation.decisionType === "squad" || evaluation.decisionType === "starting_xi" || evaluation.decisionType === "structure") {
      const expectedPlayers = evaluation.decisionType === "starting_xi" ? 11 : 15;
      const compositions = new Set<string>();
      for (const candidate of eligible) {
        if (!candidate.state || candidate.state.playerIds.length !== expectedPlayers || new Set(candidate.state.playerIds).size !== expectedPlayers) {
          errors.push(`Decision ${evaluation.decisionId} candidate ${candidate.candidateId} must persist a ${expectedPlayers}-player composition.`);
        } else {
          compositions.add([...candidate.state.playerIds].sort((left, right) => left - right).join(","));
        }
      }
      if (compositions.size !== eligible.length) errors.push(`Decision ${evaluation.decisionId} contains candidates with duplicate player compositions.`);
    }

    if (evaluation.decisionType === "structure") {
      const publishedSquad = recommendation.squadBefore.players
        .map((player) => player.id)
        .sort((left, right) => left - right)
        .join(",");
      const selectedSquad = selected.state?.playerIds
        .slice()
        .sort((left, right) => left - right)
        .join(",");
      if (selectedSquad !== publishedSquad) {
        errors.push(`Decision ${evaluation.decisionId} selected structural candidate ${selected.candidateId}, but its player composition does not equal the published squad.`);
      }
      const metricSignatures = new Set(eligible.map((candidate) => Object.keys(candidate.metrics ?? {}).sort().join(",")));
      if (eligible.some((candidate) => Object.keys(candidate.metrics ?? {}).length === 0) || metricSignatures.size !== 1) {
        errors.push(`Decision ${evaluation.decisionId} must persist comparable metrics for every eligible structural candidate.`);
      }
      const structuralCandidateIds = new Set(evaluation.candidateScores.map((candidate) => candidate.candidateId));
      for (const comparison of recommendation.decisionAnalysis?.structureComparisons ?? []) {
        if (comparison.material === false) continue;
        for (const candidateId of comparison.counterfactualCandidateIds ?? []) {
          if (!structuralCandidateIds.has(candidateId)) {
            errors.push(`Material structural counterfactual ${candidateId} is not persisted in ${evaluation.decisionId}.candidateScores.`);
          }
        }
      }
    }
  }

  for (const [type, expected] of Object.entries(selectedCandidateIds(recommendation)) as Array<[DecisionType, string]>) {
    const evaluation = byType.get(type);
    if (evaluation && evaluation.selectedCandidateId !== expected) {
      errors.push(`Decision ${evaluation.decisionId} selected ${evaluation.selectedCandidateId}, but the recommendation publishes ${expected}.`);
    }
  }

  return validator("decision-objective", errors);
}

function scoreDecompositionValidation(recommendation: WeeklyRecommendation) {
  const errors: string[] = [];
  const tolerance = recommendation.canonicalState?.floatingPointTolerance ?? 0.000001;

  for (const evaluation of recommendation.decisionEvaluations ?? []) {
    if (evaluation.objectiveMetric === "raw_expected_points") continue;
    for (const candidate of evaluation.candidateScores) {
      const components = candidate.scoreComponents ?? [];
      const requiresDecomposition = candidate.objectiveScore !== 0 || evaluation.candidateScores.length > 1;
      if (requiresDecomposition && components.length < 2) {
        errors.push(`Decision ${evaluation.decisionId} candidate ${candidate.candidateId} does not decompose its ${evaluation.objectiveMetric} score.`);
        continue;
      }
      if (new Set(components.map((component) => component.name)).size !== components.length) {
        errors.push(`Decision ${evaluation.decisionId} candidate ${candidate.candidateId} has duplicate score-component names.`);
      }
      if (components.some((component) => component.evidenceIds.length === 0)) {
        errors.push(`Decision ${evaluation.decisionId} candidate ${candidate.candidateId} has an unevidenced score component.`);
      }
      if (components.some((component) => component.evidenceIds.some((id) => !evaluation.evidenceIds.includes(id)))) {
        errors.push(`Decision ${evaluation.decisionId} candidate ${candidate.candidateId} has a score component outside the evaluation evidence set.`);
      }
      if (evaluation.objectiveMetric === "risk_adjusted_utility") {
        const rawComponent = components.find((component) => component.name === "raw_expected_points");
        if (!rawComponent || candidate.rawExpectedPoints === null || Math.abs(rawComponent.value - candidate.rawExpectedPoints) > tolerance) {
          errors.push(`Decision ${evaluation.decisionId} candidate ${candidate.candidateId} must expose raw_expected_points as the base risk-adjusted component.`);
        }
      }
      const total = components.reduce((sum, component) => sum + component.value, 0);
      if (Math.abs(total - candidate.objectiveScore) > tolerance) {
        errors.push(`Decision ${evaluation.decisionId} candidate ${candidate.candidateId} score components total ${total}, not objectiveScore ${candidate.objectiveScore}.`);
      }
    }
  }

  return validator("score-decomposition", errors);
}

function countsByTeam(recommendation: WeeklyRecommendation) {
  const counts = new Map<number, number>();
  for (const player of recommendation.squadBefore.players) counts.set(player.teamId, (counts.get(player.teamId) ?? 0) + 1);
  return counts;
}

function numericalValidation(recommendation: WeeklyRecommendation) {
  const errors: string[] = [];
  const state = recommendation.canonicalState;
  if (!state) return validator("numerical-invariants", ["Final recommendation must include canonical computed decision state."]);

  const tolerance = state.floatingPointTolerance;
  const approximately = (left: number, right: number) => Math.abs(left - right) <= tolerance;
  const projections = new Map(state.playerProjections.map((projection) => [projection.playerId, projection]));
  const squadCost = recommendation.squadBefore.players.reduce((sum, player) => sum + player.price, 0);
  if (!approximately(state.squadCost, squadCost)) errors.push(`Canonical squad cost ${state.squadCost} does not equal selected-player cost ${squadCost}.`);

  const actualClubCounts = countsByTeam(recommendation);
  const canonicalClubCounts = new Map(state.clubCounts.map((item) => [item.teamId, item.count]));
  for (const teamId of new Set([...actualClubCounts.keys(), ...canonicalClubCounts.keys()])) {
    if ((actualClubCounts.get(teamId) ?? 0) !== (canonicalClubCounts.get(teamId) ?? 0)) errors.push(`Canonical club count is inconsistent for team ${teamId}.`);
  }

  const positions = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const player of recommendation.squadBefore.players) positions[player.position as keyof typeof positions] += 1;
  for (const position of Object.keys(positions) as Array<keyof typeof positions>) {
    if (positions[position] !== state.positionCounts[position]) errors.push(`Canonical position count is inconsistent for ${position}.`);
  }

  const xiProjection = recommendation.pickTeam.startingXI.reduce((sum, playerId) => sum + (projections.get(playerId)?.projectedPoints ?? 0), 0);
  if (!approximately(state.uncaptainedXIProjection, xiProjection)) errors.push("Uncaptained XI projection does not equal the sum of selected player projections.");
  const captainProjection = projections.get(recommendation.captaincy.captainPlayerId)?.projectedPoints;
  if (captainProjection === undefined || !approximately(state.captainMarginalProjection, captainProjection)) errors.push("Captain marginal projection does not equal the captain's canonical individual projection.");
  if (!approximately(state.captainedTeamProjection, state.uncaptainedXIProjection + state.captainMarginalProjection)) errors.push("Captained team projection does not equal uncaptained XI projection plus captain marginal projection.");
  const displayedProjection = state.displayedProjectionScope === "captained" ? state.captainedTeamProjection : state.uncaptainedXIProjection;
  if (!approximately(recommendation.pickTeam.projectedPoints, displayedProjection)) errors.push("Displayed XI projection does not match its declared canonical projection scope.");

  const captainEvaluation = evaluationByType(recommendation).get("captaincy");
  for (const candidate of captainEvaluation?.candidateScores ?? []) {
    const playerId = Number(candidate.candidateId.replace(/^player:/, ""));
    const projection = projections.get(playerId)?.projectedPoints;
    if (candidate.rawExpectedPoints !== null && projection !== undefined && !approximately(candidate.rawExpectedPoints, projection)) {
      errors.push(`Captain candidate ${candidate.candidateId} does not use the canonical player projection.`);
    }
  }

  return validator("numerical-invariants", errors);
}

function candidateForClaim(claim: DeterministicFactualClaim, evaluation: DecisionEvaluation | undefined) {
  return evaluation?.candidateScores.find((candidate) => candidate.candidateId === claim.candidateId);
}

function factualClaimValidation(recommendation: WeeklyRecommendation) {
  const errors: string[] = [];
  const claims = recommendation.factualClaims ?? [];
  const evaluations = new Map((recommendation.decisionEvaluations ?? []).map((item) => [item.decisionId, item]));
  const projections = new Map(recommendation.canonicalState?.playerProjections.map((item) => [item.playerId, item]) ?? []);
  const players = new Map(recommendation.squadBefore.players.map((player) => [player.id, player]));
  const clubCounts = countsByTeam(recommendation);
  const dependencyIds = new Set<string>();
  for (const component of recommendation.evidenceSnapshot?.components ?? []) if (component.sourceId) dependencyIds.add(component.sourceId);
  for (const evaluation of recommendation.decisionEvaluations ?? []) {
    dependencyIds.add(evaluation.decisionId);
    evaluation.evidenceIds.forEach((id) => dependencyIds.add(id));
    evaluation.candidateScores.forEach((candidate) => dependencyIds.add(candidate.candidateId));
  }
  const ledger = recommendation.claimLedger;
  if (ledger) {
    ledger.sources.forEach((item) => dependencyIds.add(item.id));
    ledger.observations.forEach((item) => dependencyIds.add(item.id));
    ledger.facts.forEach((item) => dependencyIds.add(item.id));
    ledger.assumptions.forEach((item) => dependencyIds.add(item.id));
    ledger.decisions.forEach((item) => dependencyIds.add(item.id));
    ledger.transformations.forEach((item) => dependencyIds.add(item.id));
    if (ledger.schemaVersion === 3) ledger.forecasts.forEach((item) => dependencyIds.add(item.id));
  }

  for (const claim of claims) {
    const evaluation = evaluations.get(claim.decisionId);
    const candidate = candidateForClaim(claim, evaluation);
    if (!evaluation) errors.push(`Factual claim ${claim.id} references missing decision ${claim.decisionId}.`);
    if (claim.dependencyIds.length === 0) errors.push(`Factual claim ${claim.id} has no machine-readable dependencies.`);
    for (const dependencyId of claim.dependencyIds) {
      if (!dependencyIds.has(dependencyId)) errors.push(`Factual claim ${claim.id} references missing dependency ${dependencyId}.`);
    }
    if (claim.validation.status !== "validated") errors.push(`Factual claim ${claim.id} is not validated.`);

    if (claim.kind === "club_count") {
      const teamId = Number(claim.subjectId);
      const count = candidate?.state?.clubCounts.find((item) => item.teamId === teamId)?.count ?? clubCounts.get(teamId) ?? 0;
      if (claim.value !== count) errors.push(`Factual claim ${claim.id} states club count ${claim.value}; canonical count is ${count}.`);
    } else if (claim.kind === "squad_cost") {
      const cost = candidate?.state?.squadCost ?? recommendation.canonicalState?.squadCost;
      if (claim.value !== cost) errors.push(`Factual claim ${claim.id} states squad cost ${claim.value}; canonical cost is ${cost}.`);
    } else if (claim.kind === "player_price") {
      const price = players.get(Number(claim.subjectId))?.price;
      if (claim.value !== price) errors.push(`Factual claim ${claim.id} states player price ${claim.value}; canonical price is ${price}.`);
    } else if (claim.kind === "projection_score") {
      const projection = projections.get(Number(claim.subjectId))?.projectedPoints;
      if (claim.value !== projection) errors.push(`Factual claim ${claim.id} states projection ${claim.value}; canonical projection is ${projection}.`);
    } else if (claim.kind === "projection_ranking") {
      const eligible = evaluation?.candidateScores.filter((item) => item.eligible).sort((a, b) => b.objectiveScore - a.objectiveScore) ?? [];
      const rank = eligible.findIndex((item) => item.candidateId === claim.subjectId) + 1;
      if (claim.value !== rank) errors.push(`Factual claim ${claim.id} states projection rank ${claim.value}; canonical rank is ${rank}.`);
    } else if (claim.kind === "transfer_count" && claim.value !== recommendation.recommendedAction.transfers.length) {
      errors.push(`Factual claim ${claim.id} has an inconsistent transfer count.`);
    } else if (claim.kind === "formation" && claim.value !== recommendation.pickTeam.formation) {
      errors.push(`Factual claim ${claim.id} has an inconsistent formation.`);
    } else if (claim.kind === "captaincy" && claim.value !== recommendation.captaincy.captainPlayerId) {
      errors.push(`Factual claim ${claim.id} has an inconsistent captain.`);
    } else if (claim.kind === "start_probability") {
      const probability = projections.get(Number(claim.subjectId))?.startProbability;
      if (claim.value !== probability) errors.push(`Factual claim ${claim.id} states start probability ${claim.value}; canonical probability is ${probability}.`);
    } else if (claim.kind === "appearance_probability") {
      const probability = projections.get(Number(claim.subjectId))?.appearanceProbability;
      if (claim.value !== probability) errors.push(`Factual claim ${claim.id} states appearance probability ${claim.value}; canonical probability is ${probability}.`);
    }
  }

  const rationale = recommendationRationale(recommendation);
  const structuredStatements = new Set(claims.map((claim) => claim.statement));
  const auditableClaim = /(?:£|\b(?:price|cost|budget|bank|fixture|opponent|project(?:ed|ion)|expected points?|probability|percent|ownership|role|lineup|starts?|minutes?|rank(?:ed|ing)?|highest|lowest|best|club|set[ -]?pieces?|penalt(?:y|ies)|corner|free[ -]?kick)\b)/i;
  for (const statement of rationale) {
    if (/^(?:https?:\/\/|\S+\.(?:json|md))$/i.test(statement.text)) continue;
    if (auditableClaim.test(statement.text) && !structuredStatements.has(statement.text)) {
      errors.push(`${statement.id} contains an auditable factual claim that is absent from factualClaims.`);
    }
  }

  return validator("factual-claims", errors);
}

function riskCoverageValidation(recommendation: WeeklyRecommendation) {
  const errors: string[] = [];
  const projections = new Map(recommendation.canonicalState?.playerProjections.map((item) => [item.playerId, item]) ?? []);
  const startersWithProbability = recommendation.pickTeam.startingXI.filter((playerId) => projections.get(playerId)?.startProbability !== undefined);
  if (startersWithProbability.length === 0) return validator("risk-coverage", errors);

  const policy = recommendation.materialRiskPolicy;
  if (!policy) return validator("risk-coverage", ["Final recommendation with starter probabilities must include a material-risk coverage policy."]);

  const materialPlayerIds = new Set(startersWithProbability.filter((playerId) => {
    const probability = projections.get(playerId)?.startProbability;
    return probability !== undefined && probability <= policy.startProbabilityThreshold;
  }));
  const coverageByPlayer = new Map<number, typeof policy.selectedStarterCoverage>();
  for (const item of policy.selectedStarterCoverage) {
    const entries = coverageByPlayer.get(item.playerId) ?? [];
    entries.push(item);
    coverageByPlayer.set(item.playerId, entries);
  }

  for (const playerId of materialPlayerIds) {
    const coverage = coverageByPlayer.get(playerId) ?? [];
    if (coverage.length !== 1) errors.push(`Material starter risk for player ${playerId} requires exactly one change condition, explicit coverage reason, or risk waiver; found ${coverage.length}.`);
    const item = coverage[0];
    if (item?.resolution === "change_condition" && !recommendation.whatWouldChangeMyMind.includes(item.statement)) {
      errors.push(`Material starter risk response for player ${playerId} is not present in whatWouldChangeMyMind.`);
    }
    if (item && item.resolution !== "change_condition" && !recommendation.risks.includes(item.statement)) {
      errors.push(`Material starter risk response for player ${playerId} is not present in risks.`);
    }
  }
  for (const playerId of coverageByPlayer.keys()) {
    if (!materialPlayerIds.has(playerId)) errors.push(`Risk coverage for player ${playerId} does not correspond to a selected starter at or below the material threshold.`);
  }

  return validator("risk-coverage", errors);
}

export function evaluatePublicationGate(recommendation: WeeklyRecommendation): PublicationGate {
  const validators = [
    snapshotValidation(recommendation),
    decisionValidation(recommendation),
    scoreDecompositionValidation(recommendation),
    numericalValidation(recommendation),
    factualClaimValidation(recommendation),
    riskCoverageValidation(recommendation)
  ];
  const errors = validators.flatMap((item) => item.errors);
  const warnings = validators.flatMap((item) => item.warnings);
  return {
    publicationStatus: errors.length > 0 ? "invalid" : warnings.length > 0 ? "valid_with_warnings" : "valid",
    validators,
    errors,
    warnings
  };
}
