import { describe, expect, it } from "vitest";
import {
  buildCounterfactualSet,
  compareCounterfactuals,
  optimizeScenario,
  optimizeScenarioMilp,
  type OptimizationPlayer,
  type OptimizationRequest,
  type OptimizationScenario
} from "../src";

const positionCounts = { GKP: 3, DEF: 7, MID: 7, FWD: 5 } as const;

function pool() {
  let id = 0;
  return Object.entries(positionCounts).flatMap(([position, count]) =>
    Array.from({ length: count }, (_, index) => {
      id += 1;
      const value = count - index + (position === "MID" ? 2 : 0);
      const metric = {
        rawProjection: value + 1,
        roleAdjustedProjection: value,
        downside: value * 0.6,
        benchValue: value * 0.12,
        roleConfidence: 0.7 + index * 0.01
      };
      return {
        id,
        name: `Player ${id}`,
        position,
        teamId: id,
        price: 4 + value * 0.1,
        nowCost: 40 + value,
        status: "a",
        appearanceProbability: 0.9,
        horizons: { 1: metric, 3: { ...metric, roleAdjustedProjection: value * 2.8 }, 6: { ...metric, roleAdjustedProjection: value * 5.2 } }
      } as OptimizationPlayer;
    })
  );
}

function smallPool() {
  const limits = { GKP: 2, DEF: 6, MID: 5, FWD: 3 } as const;
  const seen = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  return pool().filter((player) => {
    const position = player.position as keyof typeof limits;
    seen[position] += 1;
    return seen[position] <= limits[position];
  });
}

const baseScenario: OptimizationScenario = {
  id: "unconstrained",
  label: "Unconstrained legal squad",
  constraints: { budget: 100 }
};

function combinations<T>(values: T[], size: number): T[][] {
  if (size === 0) return [[]];
  return values.flatMap((value, index) => combinations(values.slice(index + 1), size - 1)
    .map((tail) => [value, ...tail]));
}

describe("exact counterfactual optimization", () => {
  it("matches exhaustive brute force on a small player pool", () => {
    const players = smallPool();
    const exact = optimizeScenario({ requestId: "test", scenario: baseScenario, horizon: 1, players });
    const byPosition = Object.fromEntries(Object.keys(positionCounts).map((position) => [
      position,
      players.filter((player) => player.position === position)
    ]));
    let bruteObjective = -Infinity;
    for (const goalkeepers of combinations(byPosition.GKP, 2)) {
      for (const defenders of combinations(byPosition.DEF, 5)) {
        for (const midfielders of combinations(byPosition.MID, 5)) {
          for (const forwards of combinations(byPosition.FWD, 3)) {
            const squad = [...goalkeepers, ...defenders, ...midfielders, ...forwards];
            const result = optimizeScenario({
              requestId: "brute",
              scenario: {
                id: "fixed",
                label: "Fixed squad",
                constraints: { budget: 100, includedPlayerIds: squad.map((player) => player.id) }
              },
              horizon: 1,
              players
            });
            bruteObjective = Math.max(bruteObjective, result.best?.metrics.objective ?? -Infinity);
          }
        }
      }
    }

    expect(exact.best?.metrics.objective).toBe(bruteObjective);
    expect(exact.proof.exhaustive).toBe(true);
    expect(exact.proof.objectiveValue).toBe(exact.best?.metrics.objective);
  }, 30_000);

  it("solves every scenario and horizon independently and deterministically", () => {
    const players = smallPool();
    const request: OptimizationRequest = {
      schemaVersion: 1,
      artifactKind: "tool_evidence",
      generatedAt: "2026-08-12T00:00:00.000Z",
      requestId: "gw1-structures",
      gameweek: 1,
      horizons: [1, 3, 6],
      objective: "role-adjusted-squad-utility",
      modelAssumptions: ["Test metrics are fixed."],
      scenarios: [
        baseScenario,
        { id: "player-1", label: "Player 1 included", constraints: { budget: 100, includedPlayerIds: [1] } },
        { id: "player-2", label: "Player 2 included", constraints: { budget: 100, includedPlayerIds: [2] } }
      ]
    };
    const first = buildCounterfactualSet(request, players);
    const second = buildCounterfactualSet(request, players);

    expect(second).toEqual(first);
    expect(first.proofs).toHaveLength(9);
    expect(first.candidates.filter((candidate) => candidate.scenarioId === "player-1").every((candidate) => candidate.playerIds.includes(1))).toBe(true);
    expect(first.candidates.filter((candidate) => candidate.scenarioId === "player-2").every((candidate) => candidate.playerIds.includes(2))).toBe(true);
    expect(first.proofs.every((proof) => proof.nodesVisited > 0 && proof.initialUpperBound >= (proof.objectiveValue ?? 0))).toBe(true);
  });

  it("retains a configurable deterministic top-N frontier for Monte Carlo reranking", () => {
    const result = optimizeScenario({
      requestId: "frontier",
      scenario: baseScenario,
      horizon: 1,
      players: pool(),
      topCandidateLimit: 25
    });

    expect(result.topCandidates).toHaveLength(25);
    expect(result.proof.candidatesRetained).toBe(25);
    expect(result.topCandidates.map((candidate) => candidate.metrics.objective)).toEqual(
      [...result.topCandidates].map((candidate) => candidate.metrics.objective).sort((a, b) => b - a)
    );
    expect(new Set(result.topCandidates.map((candidate) => candidate.playerIds.join(","))).size).toBe(25);
  }, 30_000);

  it("uses MILP to prove an exact k-best legal frontier", async () => {
    const players = smallPool();
    const branchAndBound = optimizeScenario({ requestId: "milp", scenario: baseScenario, horizon: 1, players, topCandidateLimit: 5 });
    const milp = await optimizeScenarioMilp({ requestId: "milp", scenario: baseScenario, horizon: 1, players, topCandidateLimit: 5 });

    expect(milp.topCandidates).toHaveLength(5);
    expect(milp.topCandidates.map((candidate) => candidate.metrics.objective)).toEqual(
      branchAndBound.topCandidates.map((candidate) => candidate.metrics.objective)
    );
    expect(milp.proof).toMatchObject({
      algorithm: "highs-milp-k-best",
      exhaustive: true,
      candidatesRetained: 5,
      solutionsProvenOptimal: 5
    });
  }, 30_000);

  it("enforces structural constraints and preserves conflicting Pareto candidates", () => {
    const players = pool();
    players[0].horizons[1].roleConfidence = 0.1;
    players[1].horizons[1].roleAdjustedProjection = 0.1;
    const result = optimizeScenario({
      requestId: "constraints",
      scenario: {
        id: "deep-bench",
        label: "Deep bench and club cap",
        constraints: {
          budget: 100,
          includedPlayerIds: [1],
          excludedPlayerIds: [3],
          clubLimits: { 1: { maximum: 1 } },
          premium: { minimumPrice: 4.6, minimum: 2 },
          bench: { minimumCost: 16, minimumRoleConfidence: 0.5 }
        }
      },
      horizon: 1,
      players
    });

    expect(result.best?.playerIds).toContain(1);
    expect(result.best?.playerIds).not.toContain(3);
    expect(result.best?.benchOrder).toHaveLength(4);
    expect(result.pareto.length).toBeGreaterThan(1);
    expect(result.proof.nodesVisited).toBeLessThan(1_000_000);
  });

  it("compares candidates neutrally without final-choice fields", () => {
    const players = pool();
    const a = optimizeScenario({ requestId: "compare", scenario: baseScenario, horizon: 1, players }).best!;
    const b = optimizeScenario({
      requestId: "compare",
      scenario: { id: "include", label: "Include player", constraints: { budget: 100, includedPlayerIds: [3] } },
      horizon: 1,
      players
    }).best!;
    const comparison = compareCounterfactuals("2026-08-12T00:00:00.000Z", [a, b]);

    expect(comparison.metricVectors).toHaveLength(2);
    expect(comparison.playerDeltas).toHaveLength(2);
    expect(comparison.decisionPolicy).toContain("does not select");
    expect(JSON.stringify(comparison)).not.toMatch(/winner|recommendedVariant|selectedVariant/);
  });

  it("exposes a configurable concentration penalty separately from expected utility", () => {
    const players = smallPool();
    const unpenalized = optimizeScenario({ requestId: "penalty", scenario: baseScenario, horizon: 1, players }).best!;
    const selectedIds = new Set(unpenalized.playerIds);
    let concentrated = 0;
    for (const player of players) {
      if (selectedIds.has(player.id) && concentrated < 3) {
        player.teamId = 100;
        concentrated += 1;
      } else {
        player.teamId = 100 + player.id;
      }
    }
    const result = optimizeScenario({
      requestId: "penalty",
      scenario: {
        id: "fixed",
        label: "Fixed concentrated squad",
        constraints: { budget: 100, includedPlayerIds: unpenalized.playerIds }
      },
      horizon: 1,
      players,
      objective: "concentration-penalized-squad-utility",
      concentrationPenalty: { weight: 0.5 }
    }).best!;

    expect(result.metrics.concentrationPenalty).toBe(2);
    expect(result.metrics.objective).toBe(result.metrics.unpenalizedObjective! - 2);
    expect(result.metrics.rawProjection).toBeGreaterThan(result.metrics.objective);
  });
});
