import { readFile } from "node:fs/promises";
import path from "node:path";
import { pickStartingXI, type PlayerForEngine, type PlayerProjection } from "../packages/engine/src";

type FixtureTeam = {
  teamId: number;
  horizons: Array<{
    gameweeks: number;
    attack: { averageDifficulty: number | null };
    defence: { averageDifficulty: number | null };
  }>;
};

type Recommendation = {
  squadBefore: { players: PlayerForEngine[] };
};

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function readJson<T>(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function validSquad(squad: PlayerForEngine[]) {
  const counts: Record<string, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  const clubs = new Map<number, number>();
  let cost = 0;

  for (const player of squad) {
    counts[player.position] += 1;
    clubs.set(player.teamId, (clubs.get(player.teamId) ?? 0) + 1);
    cost += player.price;
  }

  return squad.length === 15
    && counts.GKP === 2
    && counts.DEF === 5
    && counts.MID === 5
    && counts.FWD === 3
    && cost <= 100.0001
    && [...clubs.values()].every((count) => count <= 3);
}

function fixtureFactor(difficulty: number | null | undefined) {
  return difficulty == null ? 1 : 1 + (3 - difficulty) * 0.08;
}

async function main() {
  const gameweek = Number(argValue("--gw") ?? 1);
  const directory = path.join("packages", "content", "recommendations", `gw-${gameweek}`);
  const [players, projections, fixtureReport, recommendation] = await Promise.all([
    readJson<PlayerForEngine[]>(path.join("data", "processed", "players.json")),
    readJson<PlayerProjection[]>(path.join(directory, "projections.json")),
    readJson<{ teams: FixtureTeam[] }>(path.join(directory, "fixture-horizon-report.json")),
    readJson<Recommendation>(path.join(directory, "recommendation.json"))
  ]);
  const fixtureByTeam = new Map(fixtureReport.teams.map((team) => [team.teamId, team]));
  const sourceProjectionById = new Map(projections.map((projection) => [projection.playerId, projection]));
  const adjustedProjections = projections.map((projection) => {
    const player = players.find((candidate) => candidate.id === projection.playerId)!;
    const team = fixtureByTeam.get(player.teamId);
    const oneWeek = team?.horizons.find((horizon) => horizon.gameweeks === 1);
    const threeWeek = team?.horizons.find((horizon) => horizon.gameweeks === 3);
    const oneWeekDifficulty = player.position === "GKP" || player.position === "DEF"
      ? oneWeek?.defence.averageDifficulty
      : oneWeek?.attack.averageDifficulty;
    const threeWeekDifficulty = player.position === "GKP" || player.position === "DEF"
      ? threeWeek?.defence.averageDifficulty
      : threeWeek?.attack.averageDifficulty;
    const factor = fixtureFactor(oneWeekDifficulty) * 0.8 + fixtureFactor(threeWeekDifficulty) * 0.2;
    return { ...projection, projectedPoints: projection.projectedPoints * factor };
  });
  const adjustedById = new Map(adjustedProjections.map((projection) => [projection.playerId, projection]));

  function evaluate(squad: PlayerForEngine[]) {
    if (!validSquad(squad)) return null;
    const pick = pickStartingXI(squad, adjustedProjections);
    if (pick.startingXI.length !== 11) return null;
    const captain = Math.max(...pick.startingXI.map((id) => adjustedById.get(id)?.projectedPoints ?? 0));
    const bench = pick.benchOrder.reduce((sum, id) => sum + (adjustedById.get(id)?.projectedPoints ?? 0), 0);
    return { score: pick.projectedPoints + captain + bench * 0.05, pick };
  }

  const candidatePools = new Map(["GKP", "DEF", "MID", "FWD"].map((position) => {
    const eligible = players.filter((player) =>
      player.position === position
      && player.status === "a"
      && (player.chanceOfPlayingNextRound ?? 100) >= 75
      && adjustedById.has(player.id)
    );
    const top = [...eligible]
      .sort((a, b) => adjustedById.get(b.id)!.projectedPoints - adjustedById.get(a.id)!.projectedPoints)
      .slice(0, 16);
    const cheap = [...eligible]
      .sort((a, b) => a.price - b.price || adjustedById.get(b.id)!.projectedPoints - adjustedById.get(a.id)!.projectedPoints)
      .slice(0, 6);
    return [position, [...new Map([...top, ...cheap].map((player) => [player.id, player])).values()]];
  }));

  let squad = recommendation.squadBefore.players.map((selected) =>
    players.find((player) => player.id === selected.id) ?? selected
  );
  let result = evaluate(squad)!;
  const baselineResult = result;
  let improved = true;
  let iterations = 0;

  while (improved && iterations < 8) {
    iterations += 1;
    improved = false;
    let bestSquad = squad;
    let bestResult = result;

    for (let outIndex = 0; outIndex < squad.length; outIndex += 1) {
      for (const incoming of candidatePools.get(squad[outIndex].position) ?? []) {
        if (squad.some((player) => player.id === incoming.id)) continue;
        const candidate = squad.map((player, index) => index === outIndex ? incoming : player);
        const evaluated = evaluate(candidate);
        if (evaluated && evaluated.score > bestResult.score + 0.0001) {
          bestSquad = candidate;
          bestResult = evaluated;
        }
      }
    }

    for (let first = 0; first < squad.length; first += 1) {
      for (let second = first + 1; second < squad.length; second += 1) {
        const firstPool = candidatePools.get(squad[first].position) ?? [];
        const secondPool = candidatePools.get(squad[second].position) ?? [];
        for (const firstIncoming of firstPool) {
          for (const secondIncoming of secondPool) {
            if (firstIncoming.id === secondIncoming.id) continue;
            if (squad.some((player, index) => index !== first && index !== second &&
              (player.id === firstIncoming.id || player.id === secondIncoming.id))) continue;
            const candidate = squad.map((player, index) =>
              index === first ? firstIncoming : index === second ? secondIncoming : player
            );
            const evaluated = evaluate(candidate);
            if (evaluated && evaluated.score > bestResult.score + 0.0001) {
              bestSquad = candidate;
              bestResult = evaluated;
            }
          }
        }
      }
    }

    if (bestResult.score > result.score + 0.0001) {
      squad = bestSquad;
      result = bestResult;
      improved = true;
    }
  }

  const selectedIds = new Set(squad.map((player) => player.id));
  const originalIds = new Set(recommendation.squadBefore.players.map((player) => player.id));
  const output = {
    objective: "80% GW1 and 20% GW1-3 fixture adjustment; captain points; 5% bench reserve value",
    baseline: {
      score: Number(baselineResult.score.toFixed(2)),
      formation: baselineResult.pick.formation,
      projectedStartingPoints: baselineResult.pick.projectedPoints
    },
    cost: Number(squad.reduce((sum, player) => sum + player.price, 0).toFixed(1)),
    score: Number(result.score.toFixed(2)),
    formation: result.pick.formation,
    projectedStartingPoints: result.pick.projectedPoints,
    players: squad.map((player) => ({
      id: player.id,
      name: player.name,
      position: player.position,
      teamId: player.teamId,
      price: player.price,
      adjustedPoints: Number((adjustedById.get(player.id)?.projectedPoints ?? 0).toFixed(2)),
      baseRoleAdjustedPoints: sourceProjectionById.get(player.id)?.projectedPoints ?? 0,
      starter: result.pick.startingXI.includes(player.id)
    })),
    transfersOut: recommendation.squadBefore.players.filter((player) => !selectedIds.has(player.id)).map((player) => player.name),
    transfersIn: squad.filter((player) => !originalIds.has(player.id)).map((player) => player.name)
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
