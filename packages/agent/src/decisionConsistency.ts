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
  validator: "snapshot" | "decision-objective" | "numerical-invariants" | "factual-claims";
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
    const bestScore = Math.max(...eligible.map((candidate) => candidate.objectiveScore));
    if (evaluation.selectedBy === "objective_score" && bestScore - selected.objectiveScore > tolerance) {
      errors.push(`Decision ${evaluation.decisionId} selected ${selected.candidateId} with score ${selected.objectiveScore}, below the declared-objective maximum ${bestScore}.`);
    }
    if (evaluation.selectedBy === "explicit_override" && !evaluation.overrideReason?.trim()) {
      errors.push(`Decision ${evaluation.decisionId} uses an explicit override without a reason.`);
    }
    if (evaluation.selectedBy === "objective_score" && evaluation.overrideReason !== null) {
      errors.push(`Decision ${evaluation.decisionId} records an override reason despite selecting by objective score.`);
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

  for (const claim of claims) {
    const evaluation = evaluations.get(claim.decisionId);
    const candidate = candidateForClaim(claim, evaluation);
    if (!evaluation) errors.push(`Factual claim ${claim.id} references missing decision ${claim.decisionId}.`);
    if (claim.dependencyIds.length === 0) errors.push(`Factual claim ${claim.id} has no machine-readable dependencies.`);

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
    }
  }

  const rationale = recommendationRationale(recommendation);
  const structuredStatements = new Set(claims.map((claim) => claim.statement));
  for (const statement of rationale) {
    if (/\b(?:double|triple|quadruple)\b/i.test(statement.text) && !structuredStatements.has(statement.text)) {
      errors.push(`${statement.id} contains an unstructured club-count claim.`);
    }
    if (/\b(?:highest|best) projected\b/i.test(statement.text) && !structuredStatements.has(statement.text)) {
      errors.push(`${statement.id} contains an unstructured projection-ranking claim.`);
    }
  }

  return validator("factual-claims", errors);
}

export function evaluatePublicationGate(recommendation: WeeklyRecommendation): PublicationGate {
  const validators = [
    snapshotValidation(recommendation),
    decisionValidation(recommendation),
    numericalValidation(recommendation),
    factualClaimValidation(recommendation)
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
