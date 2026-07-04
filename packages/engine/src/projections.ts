import type { PlayerForEngine, PlayerProjection, ProjectionContext } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function basePointsPer90(player: PlayerForEngine) {
  if (player.minutes && player.minutes > 0 && player.totalPoints !== null && player.totalPoints !== undefined) {
    return clamp((player.totalPoints / player.minutes) * 90, 0.5, 12);
  }

  if (player.expectedPointsNext !== null && player.expectedPointsNext !== undefined) {
    return clamp(player.expectedPointsNext, 0.5, 12);
  }

  return 2;
}

function expectedMinutes(player: PlayerForEngine) {
  if (!player.minutes || player.minutes <= 0) {
    return 15;
  }

  if (player.minutes >= 2400) {
    return 85;
  }

  if (player.minutes >= 1500) {
    return 75;
  }

  if (player.minutes >= 700) {
    return 55;
  }

  return 30;
}

function availabilityFactor(player: PlayerForEngine) {
  if (player.status === "u" || player.status === "s") {
    return 0;
  }

  if (typeof player.chanceOfPlayingNextRound === "number") {
    return clamp(player.chanceOfPlayingNextRound / 100, 0, 1);
  }

  return player.status === "a" ? 1 : 0.75;
}

function fixtureDifficultyFactor(difficulty: number | undefined) {
  if (difficulty === undefined) {
    return 1;
  }

  return clamp(1.3 - difficulty * 0.1, 0.75, 1.2);
}

function formFactor(player: PlayerForEngine) {
  if (player.form === null || player.form === undefined) {
    return 1;
  }

  return clamp(0.9 + player.form / 20, 0.8, 1.4);
}

export function projectPlayer(
  player: PlayerForEngine,
  context: ProjectionContext = {}
): PlayerProjection {
  const minutes = expectedMinutes(player);
  const expectedMinutesFactor = minutes / 90;
  const fixtureFactor = fixtureDifficultyFactor(context.fixtureDifficultyByTeamId?.[player.teamId]);
  const available = availabilityFactor(player);
  const form = formFactor(player);
  const base = basePointsPer90(player);

  return {
    playerId: player.id,
    projectedPoints: round(base * expectedMinutesFactor * fixtureFactor * available * form),
    expectedMinutes: minutes,
    basePointsPer90: round(base),
    expectedMinutesFactor: round(expectedMinutesFactor),
    fixtureDifficultyFactor: round(fixtureFactor),
    availabilityFactor: round(available),
    formFactor: round(form)
  };
}

export function projectPlayers(
  players: PlayerForEngine[],
  context: ProjectionContext = {}
): PlayerProjection[] {
  return players
    .map((player) => projectPlayer(player, context))
    .sort((a, b) => b.projectedPoints - a.projectedPoints || a.playerId - b.playerId);
}
