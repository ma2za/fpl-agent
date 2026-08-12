import { REQUIRED_SQUAD_COUNTS, VALID_FORMATIONS, type Position } from "../../rules/src";
import type { PlayerForEngine } from "./types";

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
  appearanceProbability: number;
};

export type OptimizationConstraints = {
  budget: number;
  minimumAppearanceProbability?: number;
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
  objective: "role-adjusted-squad-utility";
  modelAssumptions: string[];
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
  algorithm: "deterministic-branch-and-bound";
  exhaustive: true;
  nodesVisited: number;
  branchesPruned: number;
  feasibleSquads: number;
  initialUpperBound: number;
  objectiveValue: number | null;
};

export type CounterfactualSet = {
  schemaVersion: 1;
  artifactKind: "tool_evidence";
  generatedAt: string;
  request: OptimizationRequest;
  candidates: SquadCandidate[];
  paretoCandidateIds: string[];
  proofs: OptimizationProof[];
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
  if (players.some((player) => player.appearanceProbability < (constraints.minimumAppearanceProbability ?? 0))) return false;
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
  constraints: OptimizationConstraints
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
    const benchValue = bench.reduce((sum, player) => sum + metric(player).benchValue, 0);
    const result = {
      playerIds: squad.map((player) => player.id).sort((a, b) => a - b),
      startingXI: starters.map((player) => player.id),
      benchOrder: [goalkeeper.id, ...outfield.map((player) => player.id)],
      formation,
      cost: round(squad.reduce((sum, player) => sum + player.price, 0), 1),
      metrics: {
        objective: round(roleAdjustedProjection + benchValue),
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
}) {
  const required = REQUIRED_SQUAD_COUNTS;
  const constraints = input.scenario.constraints;
  const excluded = new Set(constraints.excludedPlayerIds ?? []);
  const included = new Set(constraints.includedPlayerIds ?? []);
  const eligiblePlayers = [...input.players]
    .filter((player) => !excluded.has(player.id) && player.appearanceProbability >= (constraints.minimumAppearanceProbability ?? 0))
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
  const initialUpperBound = fixedPotential + potential.slice(0, Math.max(0, 15 - fixedPlayers.length)).reduce((sum, value) => sum + value, 0);
  let nodesVisited = 0;
  let branchesPruned = 0;
  let feasibleSquads = 0;
  let best: SquadCandidate | null = null;
  const metricKeys = ["objective", "roleAdjustedProjection", "downside", "benchValue", "roleConfidence"] as const;
  const metricPools = new Map(metricKeys.map((key) => [key, [] as SquadCandidate[]]));

  function visit(index: number, selected: OptimizationPlayer[], cost: number, counts: Record<string, number>, clubs: Map<number, number>) {
    nodesVisited += 1;
    const needed = 15 - selected.length;
    if (needed === 0) {
      if (!constraintsSatisfied(selected, constraints)) return;
      const lineup = lineupFor(selected, input.horizon, constraints);
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
      for (const key of metricKeys) {
        const pool = metricPools.get(key)!;
        pool.push(candidate);
        pool.sort((a, b) => b.metrics[key] - a.metrics[key] || a.candidateId.localeCompare(b.candidateId));
        if (pool.length > 8) pool.pop();
      }
      return;
    }
    if (index >= players.length || players.length - index < needed || cost > constraints.budget + 1e-9) {
      branchesPruned += 1;
      return;
    }
    for (const position of POSITIONS) {
      const remaining = players.slice(index).filter((player) => player.position === position).length;
      if ((counts[position] ?? 0) > required[position] || (counts[position] ?? 0) + remaining < required[position]) {
        branchesPruned += 1;
        return;
      }
    }
    const selectedPotential = selected.reduce((sum, player) => sum + Math.max(
      player.horizons[input.horizon].roleAdjustedProjection,
      player.horizons[input.horizon].benchValue
    ), 0);
    const upperBound = selectedPotential + potential.slice(index, index + needed).reduce((sum, value) => sum + value, 0);
    const remainingPlayers = players.slice(index);
    const metricUpperBound = {
      roleAdjustedProjection: selected.reduce((sum, player) => sum + player.horizons[input.horizon].roleAdjustedProjection, 0) +
        [...remainingPlayers].sort((a, b) => b.horizons[input.horizon].roleAdjustedProjection - a.horizons[input.horizon].roleAdjustedProjection)
          .slice(0, needed).reduce((sum, player) => sum + player.horizons[input.horizon].roleAdjustedProjection, 0),
      downside: selected.reduce((sum, player) => sum + player.horizons[input.horizon].downside, 0) +
        [...remainingPlayers].sort((a, b) => b.horizons[input.horizon].downside - a.horizons[input.horizon].downside)
          .slice(0, needed).reduce((sum, player) => sum + player.horizons[input.horizon].downside, 0),
      benchValue: selected.reduce((sum, player) => sum + player.horizons[input.horizon].benchValue, 0) +
        [...remainingPlayers].sort((a, b) => b.horizons[input.horizon].benchValue - a.horizons[input.horizon].benchValue)
          .slice(0, needed).reduce((sum, player) => sum + player.horizons[input.horizon].benchValue, 0),
      roleConfidence: (selected.reduce((sum, player) => sum + player.horizons[input.horizon].roleConfidence, 0) +
        [...remainingPlayers].sort((a, b) => b.horizons[input.horizon].roleConfidence - a.horizons[input.horizon].roleConfidence)
          .slice(0, needed).reduce((sum, player) => sum + player.horizons[input.horizon].roleConfidence, 0)) / 15
    };
    const cannotEnterAnyMetricPool = metricKeys.every((key) => {
      const pool = metricPools.get(key)!;
      const bound = key === "objective" ? upperBound : metricUpperBound[key];
      return pool.length === 8 && bound < pool[pool.length - 1].metrics[key] - 1e-9;
    });
    if (cannotEnterAnyMetricPool) {
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
      visit(index + 1, selected, cost + player.price, counts, clubs);
      selected.pop();
      counts[position] = positionCount;
      if (clubCount === 0) clubs.delete(player.teamId); else clubs.set(player.teamId, clubCount);
    }
    visit(index + 1, selected, cost, counts, clubs);
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
      fixedPlayers.reduce((sum, player) => sum + player.price, 0),
      initialCounts,
      initialClubs
    );
  }
  const frontierCandidates = [...new Map(
    [...metricPools.values()].flat().map((candidate) => [candidate.candidateId, candidate])
  ).values()];
  const pareto = frontierCandidates.filter((candidate) =>
    !frontierCandidates.some((other) => other.candidateId !== candidate.candidateId && dominates(other, candidate))
  );
  pareto.sort((a, b) => b.metrics.objective - a.metrics.objective || a.candidateId.localeCompare(b.candidateId));
  const objectiveValue = (best as SquadCandidate | null)?.metrics.objective ?? null;
  return {
    best,
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
      objectiveValue
    } satisfies OptimizationProof
  };
}

export function buildCounterfactualSet(request: OptimizationRequest, players: OptimizationPlayer[]): CounterfactualSet {
  const candidates: SquadCandidate[] = [];
  const paretoCandidateIds = new Set<string>();
  const proofs: OptimizationProof[] = [];
  for (const scenario of request.scenarios) {
    for (const horizon of request.horizons) {
      const result = optimizeScenario({ requestId: request.requestId, scenario, horizon, players });
      if (result.best) candidates.push(result.best);
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
    proofs
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

| Candidate | Objective | Raw | Role adjusted | Downside | Bench value | Role confidence |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${comparison.metricVectors.map(({ candidateId, metrics }) => `| ${candidateId} | ${metrics.objective.toFixed(3)} | ${metrics.rawProjection.toFixed(3)} | ${metrics.roleAdjustedProjection.toFixed(3)} | ${metrics.downside.toFixed(3)} | ${metrics.benchValue.toFixed(3)} | ${metrics.roleConfidence.toFixed(3)} |`).join("\n")}

## Player Deltas

${comparison.playerDeltas.map((delta) => `- ${delta.candidateId}: unique [${delta.onlyInCandidate.join(", ")}], absent [${delta.absentFromCandidate.join(", ")}]`).join("\n")}

## Decision Boundary

${comparison.decisionPolicy}
`;
}
