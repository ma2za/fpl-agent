import { REQUIRED_SQUAD_COUNTS, VALID_FORMATIONS, type Position } from "../../rules/src";
import type { PlayerForEngine, ProjectionScenarioAdjustment } from "./types";
import highsLoader from "highs";

export type OptimizationHorizon = 1 | 3 | 6;

export type OptimizationMetric = {
  rawProjection: number;
  roleAdjustedProjection: number;
  downside: number;
  benchValue: number;
  roleConfidence: number;
};

export type OptimizationPlayer = PlayerForEngine & {
  horizons: Record<OptimizationHorizon, OptimizationMetric>;
  startProbability: number;
  appearanceProbability: number;
};

export type OptimizationConstraints = {
  budget: number;
  minimumStartProbability?: number;
  includedPlayerIds?: number[];
  excludedPlayerIds?: number[];
  clubLimits?: Record<number, { minimum?: number; maximum?: number }>;
  premium?: { minimumPrice: number; minimum?: number; maximum?: number };
  premiumDefence?: { minimumPrice: number; minimum?: number; maximum?: number };
  bench?: { minimumCost?: number; maximumCost?: number; minimumRoleConfidence?: number };
  formations?: Array<keyof typeof VALID_FORMATIONS>;
};

export type OptimizationScenario = {
  id: string;
  label: string;
  constraints: OptimizationConstraints;
};

export type OptimizationRequest = {
  schemaVersion: 1;
  artifactKind: "tool_evidence";
  generatedAt: string;
  requestId: string;
  gameweek: number;
  horizons: OptimizationHorizon[];
  scenarios: OptimizationScenario[];
  objective: "role-adjusted-squad-utility" | "concentration-penalized-squad-utility";
  concentrationPenalty?: { weight: number };
  projectionScenarioAdjustments?: Array<ProjectionScenarioAdjustment & { playerId: number }>;
  modelAssumptions: string[];
  topCandidateLimit?: number;
};

export type SquadCandidate = {
  schemaVersion: 1;
  artifactKind: "candidate";
  candidateId: string;
  requestId: string;
  scenarioId: string;
  horizon: OptimizationHorizon;
  playerIds: number[];
  startingXI: number[];
  benchOrder: number[];
  formation: string;
  cost: number;
  metrics: {
    objective: number;
    unpenalizedObjective?: number;
    concentrationPenalty?: number;
    rawProjection: number;
    roleAdjustedProjection: number;
    downside: number;
    benchValue: number;
    roleConfidence: number;
  };
  constraints: OptimizationConstraints;
};

export type OptimizationProof = {
  schemaVersion: 1;
  artifactKind: "tool_evidence";
  requestId: string;
  scenarioId: string;
  horizon: OptimizationHorizon;
  algorithm: "deterministic-branch-and-bound" | "highs-milp-k-best";
  exhaustive: true;
  nodesVisited: number;
  branchesPruned: number;
  feasibleSquads: number;
  initialUpperBound: number;
  objectiveValue: number | null;
  candidatesRetained?: number;
  solutionsProvenOptimal?: number;
  frontierComplete?: boolean;
  solverRuns?: number;
  proofScope?: "COMPLETE_LEGAL_SPACE_K_BEST";
};

export type CounterfactualSet = {
  schemaVersion: 1;
  artifactKind: "tool_evidence";
  generatedAt: string;
  request: OptimizationRequest;
  candidates: SquadCandidate[];
  paretoCandidateIds: string[];
  proofs: OptimizationProof[];
  retention: {
    generatedCandidates: "ALL";
    discardedCandidates: 0;
  };
};

export type CounterfactualComparison = {
  schemaVersion: 1;
  artifactKind: "tool_evidence";
  generatedAt: string;
  candidateIds: string[];
  metricVectors: Array<{ candidateId: string; metrics: SquadCandidate["metrics"] }>;
  constraintDifferences: Array<{ candidateId: string; constraints: OptimizationConstraints }>;
  playerDeltas: Array<{ candidateId: string; onlyInCandidate: number[]; absentFromCandidate: number[] }>;
  decisionPolicy: string;
};

const POSITIONS = ["GKP", "DEF", "MID", "FWD"] as const;

function round(value: number, places = 3) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function selectedCount(players: OptimizationPlayer[], predicate: (player: OptimizationPlayer) => boolean) {
  return players.reduce((count, player) => count + Number(predicate(player)), 0);
}

function withinRange(value: number, range: { minimum?: number; maximum?: number } | undefined) {
  return (!range || range.minimum === undefined || value >= range.minimum) &&
    (!range || range.maximum === undefined || value <= range.maximum);
}

function constraintsSatisfied(players: OptimizationPlayer[], constraints: OptimizationConstraints) {
  const ids = new Set(players.map((player) => player.id));
  if ((constraints.includedPlayerIds ?? []).some((id) => !ids.has(id))) return false;
  if ((constraints.excludedPlayerIds ?? []).some((id) => ids.has(id))) return false;
  if (players.reduce((sum, player) => sum + player.price, 0) > constraints.budget + 1e-9) return false;
  if (players.some((player) => player.startProbability < (constraints.minimumStartProbability ?? 0))) return false;
  const clubCounts = new Map<number, number>();
  for (const player of players) clubCounts.set(player.teamId, (clubCounts.get(player.teamId) ?? 0) + 1);
  if ([...clubCounts.values()].some((count) => count > 3)) return false;
  for (const [teamId, range] of Object.entries(constraints.clubLimits ?? {})) {
    if (!withinRange(selectedCount(players, (player) => player.teamId === Number(teamId)), range)) return false;
  }
  if (!withinRange(selectedCount(players, (player) => player.price >= (constraints.premium?.minimumPrice ?? Infinity)), constraints.premium)) return false;
  if (!withinRange(selectedCount(players, (player) => player.position === "DEF" && player.price >= (constraints.premiumDefence?.minimumPrice ?? Infinity)), constraints.premiumDefence)) return false;
  return true;
}

function lineupFor(
  squad: OptimizationPlayer[],
  horizon: OptimizationHorizon,
  constraints: OptimizationConstraints,
  objective: OptimizationRequest["objective"],
  concentrationPenaltyWeight: number
) {
  const metric = (player: OptimizationPlayer) => player.horizons[horizon];
  const formations = constraints.formations ?? (Object.keys(VALID_FORMATIONS) as Array<keyof typeof VALID_FORMATIONS>);
  let best: Omit<SquadCandidate, "schemaVersion" | "artifactKind" | "candidateId" | "requestId" | "scenarioId" | "horizon" | "constraints"> | null = null;

  for (const formation of formations) {
    const counts = VALID_FORMATIONS[formation];
    const starters = POSITIONS.flatMap((position) => [...squad]
      .filter((player) => player.position === position)
      .sort((a, b) => metric(b).roleAdjustedProjection - metric(a).roleAdjustedProjection || a.id - b.id)
      .slice(0, counts[position]));
    if (starters.length !== 11) continue;
    const starterIds = new Set(starters.map((player) => player.id));
    const bench = squad.filter((player) => !starterIds.has(player.id));
    const goalkeeper = bench.find((player) => player.position === "GKP");
    const outfield = bench.filter((player) => player.position !== "GKP")
      .sort((a, b) => metric(b).benchValue - metric(a).benchValue || a.id - b.id);
    if (!goalkeeper || outfield.length !== 3) continue;
    const benchCost = bench.reduce((sum, player) => sum + player.price, 0);
    const benchConfidence = bench.reduce((sum, player) => sum + metric(player).roleConfidence, 0) / 4;
    if (!withinRange(benchCost, {
      minimum: constraints.bench?.minimumCost,
      maximum: constraints.bench?.maximumCost
    }) || benchConfidence < (constraints.bench?.minimumRoleConfidence ?? 0)) continue;
    const roleAdjustedProjection = starters.reduce((sum, player) => sum + metric(player).roleAdjustedProjection, 0);
    const captainBonus = Math.max(...starters.map((player) => metric(player).roleAdjustedProjection));
    const benchValue = bench.reduce((sum, player) => sum + metric(player).benchValue, 0);
    const clubCounts = new Map<number, number>();
    for (const player of squad) clubCounts.set(player.teamId, (clubCounts.get(player.teamId) ?? 0) + 1);
    const concentrationPenalty = objective === "concentration-penalized-squad-utility"
      ? [...clubCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1) ** 2, 0) * concentrationPenaltyWeight
      : 0;
    const unpenalizedObjective = roleAdjustedProjection + captainBonus + benchValue;
    const result = {
      playerIds: squad.map((player) => player.id).sort((a, b) => a - b),
      startingXI: starters.map((player) => player.id),
      benchOrder: [goalkeeper.id, ...outfield.map((player) => player.id)],
      formation,
      cost: round(squad.reduce((sum, player) => sum + player.price, 0), 1),
      metrics: {
        objective: round(unpenalizedObjective - concentrationPenalty),
        unpenalizedObjective: round(unpenalizedObjective),
        concentrationPenalty: round(concentrationPenalty),
        rawProjection: round(starters.reduce((sum, player) => sum + metric(player).rawProjection, 0)),
        roleAdjustedProjection: round(roleAdjustedProjection),
        downside: round(starters.reduce((sum, player) => sum + metric(player).downside, 0)),
        benchValue: round(benchValue),
        roleConfidence: round(squad.reduce((sum, player) => sum + metric(player).roleConfidence, 0) / 15)
      }
    };
    if (!best || result.metrics.objective > best.metrics.objective ||
      (result.metrics.objective === best.metrics.objective && result.playerIds.join(",") < best.playerIds.join(","))) best = result;
  }
  return best;
}

function dominates(a: SquadCandidate, b: SquadCandidate) {
  const keys = ["roleAdjustedProjection", "downside", "benchValue", "roleConfidence"] as const;
  return keys.every((key) => a.metrics[key] >= b.metrics[key]) && keys.some((key) => a.metrics[key] > b.metrics[key]);
}

export function optimizeScenario(input: {
  requestId: string;
  scenario: OptimizationScenario;
  horizon: OptimizationHorizon;
  players: OptimizationPlayer[];
  objective?: OptimizationRequest["objective"];
  concentrationPenalty?: OptimizationRequest["concentrationPenalty"];
  topCandidateLimit?: number;
}) {
  const topCandidateLimit = input.topCandidateLimit ?? 100;
  if (!Number.isInteger(topCandidateLimit) || topCandidateLimit < 1 || topCandidateLimit > 1_000) {
    throw new Error("Top candidate limit must be an integer from 1 to 1000.");
  }
  const required = REQUIRED_SQUAD_COUNTS;
  const constraints = input.scenario.constraints;
  const excluded = new Set(constraints.excludedPlayerIds ?? []);
  const included = new Set(constraints.includedPlayerIds ?? []);
  const eligiblePlayers = [...input.players]
    .filter((player) => !excluded.has(player.id) && player.startProbability >= (constraints.minimumStartProbability ?? 0))
    .sort((a, b) => {
      const aPotential = Math.max(a.horizons[input.horizon].roleAdjustedProjection, a.horizons[input.horizon].benchValue);
      const bPotential = Math.max(b.horizons[input.horizon].roleAdjustedProjection, b.horizons[input.horizon].benchValue);
      return bPotential - aPotential || a.id - b.id;
    });
  const fixedPlayers = eligiblePlayers.filter((player) => included.has(player.id));
  const players = eligiblePlayers.filter((player) => !included.has(player.id));
  const potential = players.map((player) => Math.max(
    player.horizons[input.horizon].roleAdjustedProjection,
    player.horizons[input.horizon].benchValue
  ));
  const fixedPotential = fixedPlayers.reduce((sum, player) => sum + Math.max(
    player.horizons[input.horizon].roleAdjustedProjection,
    player.horizons[input.horizon].benchValue
  ), 0);
  const suffixPositionCounts = Object.fromEntries(POSITIONS.map((position) => [position, Array(players.length + 1).fill(0)])) as Record<Position, number[]>;
  const suffixMaximumRoleProjection = Array(players.length + 1).fill(0);
  const relaxationWeights = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3];
  const relaxedSuffix = relaxationWeights.map(() => Object.fromEntries(POSITIONS.map((position) =>
    [position, Array.from({ length: players.length + 1 }, () => [] as number[])])) as Record<Position, number[][]>);
  const cheapestSuffix = Object.fromEntries(POSITIONS.map((position) =>
    [position, Array.from({ length: players.length + 1 }, () => [] as number[])])) as Record<Position, number[][]>;
  for (let index = players.length - 1; index >= 0; index -= 1) {
    const playerPosition = players[index].position as Position;
    for (const position of POSITIONS) {
      suffixPositionCounts[position][index] = suffixPositionCounts[position][index + 1] + Number(playerPosition === position);
      cheapestSuffix[position][index] = cheapestSuffix[position][index + 1];
      for (const suffix of relaxedSuffix) suffix[position][index] = suffix[position][index + 1];
    }
    cheapestSuffix[playerPosition][index] = [...cheapestSuffix[playerPosition][index + 1], players[index].price]
      .sort((a, b) => a - b).slice(0, required[playerPosition]);
    for (let weightIndex = 0; weightIndex < relaxationWeights.length; weightIndex += 1) {
      relaxedSuffix[weightIndex][playerPosition][index] = [
        ...relaxedSuffix[weightIndex][playerPosition][index + 1],
        potential[index] - relaxationWeights[weightIndex] * players[index].price
      ].sort((a, b) => b - a).slice(0, required[playerPosition]);
    }
    suffixMaximumRoleProjection[index] = Math.max(suffixMaximumRoleProjection[index + 1], players[index].horizons[input.horizon].roleAdjustedProjection);
  }
  function minimumRemainingCost(index: number, counts: Record<string, number>) {
    return POSITIONS.reduce((sum, position) => {
      const needed = Math.max(0, required[position] - (counts[position] ?? 0));
      return sum + cheapestSuffix[position][index].slice(0, needed).reduce((total, price) => total + price, 0);
    }, 0);
  }
  function remainingPotentialBound(index: number, counts: Record<string, number>, budgetRemaining: number) {
    let bound = Infinity;
    for (let weightIndex = 0; weightIndex < relaxationWeights.length; weightIndex += 1) {
      let relaxed = relaxationWeights[weightIndex] * budgetRemaining;
      for (const position of POSITIONS) {
        const needed = Math.max(0, required[position] - (counts[position] ?? 0));
        relaxed += relaxedSuffix[weightIndex][position][index].slice(0, needed)
          .reduce((sum, value) => sum + value, 0);
      }
      bound = Math.min(bound, relaxed);
    }
    return bound;
  }
  const initialCountsForBound = Object.fromEntries(POSITIONS.map((position) => [position,
    fixedPlayers.filter((player) => player.position === position).length])) as Record<string, number>;
  const fixedCost = fixedPlayers.reduce((sum, player) => sum + player.price, 0);
  const initialUpperBound = fixedPotential + remainingPotentialBound(0, initialCountsForBound, constraints.budget - fixedCost) +
    Math.max(0, ...fixedPlayers.map((player) => player.horizons[input.horizon].roleAdjustedProjection), suffixMaximumRoleProjection[0]);
  let nodesVisited = 0;
  let branchesPruned = 0;
  let feasibleSquads = 0;
  let best: SquadCandidate | null = null;
  const topCandidates: SquadCandidate[] = [];
  const compareObjective = (a: SquadCandidate, b: SquadCandidate) =>
    b.metrics.objective - a.metrics.objective || a.playerIds.join(",").localeCompare(b.playerIds.join(","));

  function visit(index: number, selected: OptimizationPlayer[], cost: number, potentialSum: number, captainMaximum: number,
    counts: Record<string, number>, clubs: Map<number, number>) {
    nodesVisited += 1;
    const needed = 15 - selected.length;
    if (needed === 0) {
      if (!constraintsSatisfied(selected, constraints)) return;
      const lineup = lineupFor(
        selected,
        input.horizon,
        constraints,
        input.objective ?? "role-adjusted-squad-utility",
        input.concentrationPenalty?.weight ?? 0
      );
      if (!lineup) return;
      feasibleSquads += 1;
      const candidate: SquadCandidate = {
        schemaVersion: 1,
        artifactKind: "candidate",
        candidateId: `${input.requestId}:${input.scenario.id}:gw${input.horizon}:${feasibleSquads}`,
        requestId: input.requestId,
        scenarioId: input.scenario.id,
        horizon: input.horizon,
        ...lineup,
        constraints
      };
      if (!best || candidate.metrics.objective > best.metrics.objective ||
        (candidate.metrics.objective === best.metrics.objective && candidate.playerIds.join(",") < best.playerIds.join(","))) best = candidate;
      if (topCandidates.length < topCandidateLimit || compareObjective(candidate, topCandidates[topCandidates.length - 1]) < 0) {
        topCandidates.push(candidate);
        topCandidates.sort(compareObjective);
        if (topCandidates.length > topCandidateLimit) topCandidates.pop();
      }
      return;
    }
    if (index >= players.length || players.length - index < needed || cost > constraints.budget + 1e-9) {
      branchesPruned += 1;
      return;
    }
    for (const position of POSITIONS) {
      const remaining = suffixPositionCounts[position][index];
      if ((counts[position] ?? 0) > required[position] || (counts[position] ?? 0) + remaining < required[position]) {
        branchesPruned += 1;
        return;
      }
    }
    if (cost + minimumRemainingCost(index, counts) > constraints.budget + 1e-9) {
      branchesPruned += 1;
      return;
    }
    const captainUpperBound = Math.max(captainMaximum, suffixMaximumRoleProjection[index]);
    const upperBound = potentialSum + remainingPotentialBound(index, counts, constraints.budget - cost) + captainUpperBound;
    if (topCandidates.length === topCandidateLimit && upperBound < topCandidates[topCandidates.length - 1].metrics.objective - 1e-9) {
      branchesPruned += 1;
      return;
    }
    const player = players[index];
    const position = player.position as Position;
    const positionCount = counts[position] ?? 0;
    const clubCount = clubs.get(player.teamId) ?? 0;
    const clubMaximum = constraints.clubLimits?.[player.teamId]?.maximum ?? 3;
    if (positionCount < required[position] && clubCount < clubMaximum && cost + player.price <= constraints.budget + 1e-9) {
      counts[position] = positionCount + 1;
      clubs.set(player.teamId, clubCount + 1);
      selected.push(player);
      visit(index + 1, selected, cost + player.price, potentialSum + potential[index],
        Math.max(captainMaximum, player.horizons[input.horizon].roleAdjustedProjection), counts, clubs);
      selected.pop();
      counts[position] = positionCount;
      if (clubCount === 0) clubs.delete(player.teamId); else clubs.set(player.teamId, clubCount);
    }
    visit(index + 1, selected, cost, potentialSum, captainMaximum, counts, clubs);
  }

  const initialCounts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  const initialClubs = new Map<number, number>();
  for (const player of fixedPlayers) {
    const position = player.position as Position;
    initialCounts[position] += 1;
    initialClubs.set(player.teamId, (initialClubs.get(player.teamId) ?? 0) + 1);
  }
  if (fixedPlayers.length === included.size && fixedPlayers.length <= 15) {
    visit(
      0,
      [...fixedPlayers],
      fixedCost,
      fixedPotential,
      Math.max(0, ...fixedPlayers.map((player) => player.horizons[input.horizon].roleAdjustedProjection)),
      initialCounts,
      initialClubs
    );
  }
  const pareto = topCandidates.filter((candidate) =>
    !topCandidates.some((other) => other.candidateId !== candidate.candidateId && dominates(other, candidate))
  );
  pareto.sort((a, b) => b.metrics.objective - a.metrics.objective || a.candidateId.localeCompare(b.candidateId));
  const objectiveValue = (best as SquadCandidate | null)?.metrics.objective ?? null;
  return {
    best,
    topCandidates,
    pareto,
    proof: {
      schemaVersion: 1,
      artifactKind: "tool_evidence",
      requestId: input.requestId,
      scenarioId: input.scenario.id,
      horizon: input.horizon,
      algorithm: "deterministic-branch-and-bound",
      exhaustive: true,
      nodesVisited,
      branchesPruned,
      feasibleSquads,
      initialUpperBound: round(initialUpperBound),
      objectiveValue,
      candidatesRetained: topCandidates.length,
      frontierComplete: false
    } satisfies OptimizationProof
  };
}

function lpExpression(terms: Array<[number, string]>) {
  if (terms.length === 0) return "0";
  return terms.map(([coefficient, variable], index) => {
    const sign = coefficient < 0 ? "-" : index === 0 ? "" : "+";
    return `${sign} ${Math.abs(coefficient)} ${variable}`;
  }).join(" ");
}

export async function optimizeScenarioMilp(input: {
  requestId: string;
  scenario: OptimizationScenario;
  horizon: OptimizationHorizon;
  players: OptimizationPlayer[];
  objective?: OptimizationRequest["objective"];
  concentrationPenalty?: OptimizationRequest["concentrationPenalty"];
  topCandidateLimit?: number;
}) {
  const topCandidateLimit = input.topCandidateLimit ?? 100;
  if (!Number.isInteger(topCandidateLimit) || topCandidateLimit < 1 || topCandidateLimit > 1_000) {
    throw new Error("Top candidate limit must be an integer from 1 to 1000.");
  }
  const constraints = input.scenario.constraints;
  const excluded = new Set(constraints.excludedPlayerIds ?? []);
  const included = new Set(constraints.includedPlayerIds ?? []);
  const players = input.players.filter((player) =>
    !excluded.has(player.id) && player.startProbability >= (constraints.minimumStartProbability ?? 0));
  const playerIds = new Set(players.map((player) => player.id));
  if ([...included].some((playerId) => !playerIds.has(playerId))) {
    return {
      best: null,
      topCandidates: [] as SquadCandidate[],
      pareto: [] as SquadCandidate[],
      proof: {
        schemaVersion: 1,
        artifactKind: "tool_evidence",
        requestId: input.requestId,
        scenarioId: input.scenario.id,
        horizon: input.horizon,
        algorithm: "highs-milp-k-best",
        exhaustive: true,
        nodesVisited: 0,
        branchesPruned: 0,
        feasibleSquads: 0,
        initialUpperBound: 0,
        objectiveValue: null,
        candidatesRetained: 0,
        solutionsProvenOptimal: 0,
        frontierComplete: true,
        solverRuns: 0,
        proofScope: "COMPLETE_LEGAL_SPACE_K_BEST"
      } satisfies OptimizationProof
    };
  }
  const metric = (player: OptimizationPlayer) => player.horizons[input.horizon];
  const formations = constraints.formations ?? (Object.keys(VALID_FORMATIONS) as Array<keyof typeof VALID_FORMATIONS>);
  const clubs = [...new Set([
    ...players.map((player) => player.teamId),
    ...Object.keys(constraints.clubLimits ?? {}).map(Number)
  ])].sort((a, b) => a - b);
  const selectedTerms = players.flatMap((player) => [[1, `s${player.id}`], [1, `b${player.id}`]] as Array<[number, string]>);
  const binaryVariables = players.flatMap((player) => [`s${player.id}`, `b${player.id}`, `c${player.id}`]);
  const concentrationVariables = input.objective === "concentration-penalized-squad-utility"
    ? clubs.flatMap((teamId) => [`y2t${teamId}`, `y3t${teamId}`])
    : [];
  const highs = await highsLoader();
  const cuts: number[][] = [];
  const topCandidates: SquadCandidate[] = [];
  let firstObjective: number | null = null;
  let frontierComplete = false;
  let solverRuns = 0;

  for (let solutionIndex = 0; solutionIndex < topCandidateLimit; solutionIndex += 1) {
    const rows: string[] = [];
    rows.push(` squad: ${lpExpression(selectedTerms)} = 15`);
    rows.push(` starters: ${lpExpression(players.map((player) => [1, `s${player.id}`]))} = 11`);
    rows.push(` captain: ${lpExpression(players.map((player) => [1, `c${player.id}`]))} = 1`);
    rows.push(` budget: ${lpExpression(players.flatMap((player) => [[player.price, `s${player.id}`], [player.price, `b${player.id}`]] as Array<[number, string]>))} <= ${constraints.budget}`);
    for (const player of players) {
      rows.push(` one_role_${player.id}: s${player.id} + b${player.id} <= 1`);
      rows.push(` captain_starts_${player.id}: c${player.id} - s${player.id} <= 0`);
      if (included.has(player.id)) rows.push(` include_${player.id}: s${player.id} + b${player.id} = 1`);
    }
    for (const position of POSITIONS) {
      const positionPlayers = players.filter((player) => player.position === position);
      rows.push(` squad_${position}: ${lpExpression(positionPlayers.flatMap((player) => [[1, `s${player.id}`], [1, `b${player.id}`]] as Array<[number, string]>))} = ${REQUIRED_SQUAD_COUNTS[position]}`);
      rows.push(` starters_${position}: ${lpExpression([
        ...positionPlayers.map((player) => [1, `s${player.id}`] as [number, string]),
        ...formations.map((formation, index) => [-VALID_FORMATIONS[formation][position], `f${index}`] as [number, string])
      ])} = 0`);
    }
    rows.push(` formation: ${lpExpression(formations.map((_, index) => [1, `f${index}`]))} = 1`);
    for (const teamId of clubs) {
      const clubTerms = players.filter((player) => player.teamId === teamId)
        .flatMap((player) => [[1, `s${player.id}`], [1, `b${player.id}`]] as Array<[number, string]>);
      const range = constraints.clubLimits?.[teamId];
      rows.push(` club_max_${teamId}: ${lpExpression(clubTerms)} <= ${range?.maximum ?? 3}`);
      if (range?.minimum !== undefined) rows.push(` club_min_${teamId}: ${lpExpression(clubTerms)} >= ${range.minimum}`);
      if (input.objective === "concentration-penalized-squad-utility") {
        rows.push(` concentration_${teamId}: ${lpExpression([...clubTerms, [-1, `y2t${teamId}`], [-1, `y3t${teamId}`]])} <= 1`);
        rows.push(` concentration_order_${teamId}: y3t${teamId} - y2t${teamId} <= 0`);
      }
    }
    if (constraints.premium) {
      const terms = players.filter((player) => player.price >= constraints.premium!.minimumPrice)
        .flatMap((player) => [[1, `s${player.id}`], [1, `b${player.id}`]] as Array<[number, string]>);
      if (constraints.premium.minimum !== undefined) rows.push(` premium_min: ${lpExpression(terms)} >= ${constraints.premium.minimum}`);
      if (constraints.premium.maximum !== undefined) rows.push(` premium_max: ${lpExpression(terms)} <= ${constraints.premium.maximum}`);
    }
    if (constraints.premiumDefence) {
      const terms = players.filter((player) => player.position === "DEF" && player.price >= constraints.premiumDefence!.minimumPrice)
        .flatMap((player) => [[1, `s${player.id}`], [1, `b${player.id}`]] as Array<[number, string]>);
      if (constraints.premiumDefence.minimum !== undefined) rows.push(` premium_def_min: ${lpExpression(terms)} >= ${constraints.premiumDefence.minimum}`);
      if (constraints.premiumDefence.maximum !== undefined) rows.push(` premium_def_max: ${lpExpression(terms)} <= ${constraints.premiumDefence.maximum}`);
    }
    if (constraints.bench?.minimumCost !== undefined) rows.push(` bench_cost_min: ${lpExpression(players.map((player) => [player.price, `b${player.id}`]))} >= ${constraints.bench.minimumCost}`);
    if (constraints.bench?.maximumCost !== undefined) rows.push(` bench_cost_max: ${lpExpression(players.map((player) => [player.price, `b${player.id}`]))} <= ${constraints.bench.maximumCost}`);
    if (constraints.bench?.minimumRoleConfidence !== undefined) rows.push(` bench_confidence: ${lpExpression(players.map((player) => [metric(player).roleConfidence, `b${player.id}`]))} >= ${constraints.bench.minimumRoleConfidence * 4}`);
    cuts.forEach((ids, index) => rows.push(` exclude_${index}: ${lpExpression(players.filter((player) => ids.includes(player.id))
      .flatMap((player) => [[1, `s${player.id}`], [1, `b${player.id}`]] as Array<[number, string]>))} <= 14`));
    const penaltyWeight = input.concentrationPenalty?.weight ?? 0;
    const objectiveTerms: Array<[number, string]> = players.flatMap((player) => [
      [metric(player).roleAdjustedProjection, `s${player.id}`],
      [metric(player).benchValue, `b${player.id}`],
      [metric(player).roleAdjustedProjection, `c${player.id}`]
    ]);
    if (input.objective === "concentration-penalized-squad-utility") {
      for (const teamId of clubs) objectiveTerms.push([-penaltyWeight, `y2t${teamId}`], [-3 * penaltyWeight, `y3t${teamId}`]);
    }
    const problem = `Maximize\n obj: ${lpExpression(objectiveTerms)}\nSubject To\n${rows.join("\n")}\nBinary\n ${[
      ...binaryVariables,
      ...formations.map((_, index) => `f${index}`),
      ...concentrationVariables
    ].join(" ")}\nEnd`;
    solverRuns += 1;
    const solution = highs.solve(problem, {
      output_flag: false,
      log_to_console: false,
      random_seed: 0,
      mip_rel_gap: 0,
      mip_abs_gap: 1e-8
    });
    if (solution.Status === "Infeasible") {
      frontierComplete = true;
      break;
    }
    if (solution.Status !== "Optimal") throw new Error(`HiGHS failed to prove solution ${solutionIndex + 1} optimal: ${solution.Status}.`);
    const squad = players.filter((player) => (solution.Columns[`s${player.id}`]?.Primal ?? 0) > 0.5 || (solution.Columns[`b${player.id}`]?.Primal ?? 0) > 0.5);
    const lineup = lineupFor(squad, input.horizon, constraints, input.objective ?? "role-adjusted-squad-utility", penaltyWeight);
    if (!lineup) throw new Error("HiGHS returned a squad without a legal scoring lineup.");
    const candidate: SquadCandidate = {
      schemaVersion: 1,
      artifactKind: "candidate",
      candidateId: `${input.requestId}:${input.scenario.id}:gw${input.horizon}:${solutionIndex + 1}`,
      requestId: input.requestId,
      scenarioId: input.scenario.id,
      horizon: input.horizon,
      ...lineup,
      constraints
    };
    if (firstObjective === null) firstObjective = candidate.metrics.objective;
    topCandidates.push(candidate);
    cuts.push(candidate.playerIds);
  }
  const pareto = topCandidates.filter((candidate) =>
    !topCandidates.some((other) => other.candidateId !== candidate.candidateId && dominates(other, candidate)));
  return {
    best: topCandidates[0] ?? null,
    topCandidates,
    pareto,
    proof: {
      schemaVersion: 1,
      artifactKind: "tool_evidence",
      requestId: input.requestId,
      scenarioId: input.scenario.id,
      horizon: input.horizon,
      algorithm: "highs-milp-k-best",
      exhaustive: true,
      nodesVisited: 0,
      branchesPruned: 0,
      feasibleSquads: topCandidates.length,
      initialUpperBound: firstObjective ?? 0,
      objectiveValue: firstObjective,
      candidatesRetained: topCandidates.length,
      solutionsProvenOptimal: topCandidates.length,
      frontierComplete,
      solverRuns,
      proofScope: "COMPLETE_LEGAL_SPACE_K_BEST"
    } satisfies OptimizationProof
  };
}

export function buildCounterfactualSet(request: OptimizationRequest, players: OptimizationPlayer[]): CounterfactualSet {
  const candidates: SquadCandidate[] = [];
  const paretoCandidateIds = new Set<string>();
  const proofs: OptimizationProof[] = [];
  for (const scenario of request.scenarios) {
    for (const horizon of request.horizons) {
      const result = optimizeScenario({
        requestId: request.requestId,
        scenario,
        horizon,
        players,
        objective: request.objective,
        concentrationPenalty: request.concentrationPenalty,
        topCandidateLimit: request.topCandidateLimit
      });
      for (const candidate of result.topCandidates) {
        if (!candidates.some((item) => item.candidateId === candidate.candidateId)) candidates.push(candidate);
      }
      for (const candidate of result.pareto) {
        if (!candidates.some((item) => item.candidateId === candidate.candidateId)) candidates.push(candidate);
        paretoCandidateIds.add(candidate.candidateId);
      }
      proofs.push(result.proof);
    }
  }
  return {
    schemaVersion: 1,
    artifactKind: "tool_evidence",
    generatedAt: request.generatedAt,
    request,
    candidates,
    paretoCandidateIds: [...paretoCandidateIds].sort(),
    proofs,
    retention: { generatedCandidates: "ALL", discardedCandidates: 0 }
  };
}

export async function buildCounterfactualSetMilp(request: OptimizationRequest, players: OptimizationPlayer[]): Promise<CounterfactualSet> {
  const candidates: SquadCandidate[] = [];
  const paretoCandidateIds = new Set<string>();
  const proofs: OptimizationProof[] = [];
  for (const scenario of request.scenarios) {
    for (const horizon of request.horizons) {
      const result = await optimizeScenarioMilp({
        requestId: request.requestId,
        scenario,
        horizon,
        players,
        objective: request.objective,
        concentrationPenalty: request.concentrationPenalty,
        topCandidateLimit: request.topCandidateLimit
      });
      for (const candidate of result.topCandidates) candidates.push(candidate);
      for (const candidate of result.pareto) paretoCandidateIds.add(candidate.candidateId);
      proofs.push(result.proof);
    }
  }
  return {
    schemaVersion: 1,
    artifactKind: "tool_evidence",
    generatedAt: request.generatedAt,
    request,
    candidates,
    paretoCandidateIds: [...paretoCandidateIds].sort(),
    proofs,
    retention: { generatedCandidates: "ALL", discardedCandidates: 0 }
  };
}

export function compareCounterfactuals(generatedAt: string, candidates: SquadCandidate[]): CounterfactualComparison {
  const universe = new Set(candidates.flatMap((candidate) => candidate.playerIds));
  return {
    schemaVersion: 1,
    artifactKind: "tool_evidence",
    generatedAt,
    candidateIds: candidates.map((candidate) => candidate.candidateId),
    metricVectors: candidates.map((candidate) => ({ candidateId: candidate.candidateId, metrics: candidate.metrics })),
    constraintDifferences: candidates.map((candidate) => ({ candidateId: candidate.candidateId, constraints: candidate.constraints })),
    playerDeltas: candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      onlyInCandidate: candidate.playerIds.filter((id) => candidates.some((other) => !other.playerIds.includes(id))),
      absentFromCandidate: [...universe].filter((id) => !candidate.playerIds.includes(id)).sort((a, b) => a - b)
    })),
    decisionPolicy: "This comparison reports complete metric vectors and constraint differences. It does not select, rank, or recommend a candidate."
  };
}

export function renderCounterfactualComparisonMarkdown(comparison: CounterfactualComparison) {
  return `# Counterfactual Comparison

Generated: ${comparison.generatedAt}

| Candidate | Objective | Unpenalized | Concentration penalty | Raw | Role adjusted | Downside | Bench value | Role confidence |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${comparison.metricVectors.map(({ candidateId, metrics }) => `| ${candidateId} | ${metrics.objective.toFixed(3)} | ${(metrics.unpenalizedObjective ?? metrics.objective).toFixed(3)} | ${(metrics.concentrationPenalty ?? 0).toFixed(3)} | ${metrics.rawProjection.toFixed(3)} | ${metrics.roleAdjustedProjection.toFixed(3)} | ${metrics.downside.toFixed(3)} | ${metrics.benchValue.toFixed(3)} | ${metrics.roleConfidence.toFixed(3)} |`).join("\n")}

## Player Deltas

${comparison.playerDeltas.map((delta) => `- ${delta.candidateId}: unique [${delta.onlyInCandidate.join(", ")}], absent [${delta.absentFromCandidate.join(", ")}]`).join("\n")}

## Decision Boundary

${comparison.decisionPolicy}
`;
}
