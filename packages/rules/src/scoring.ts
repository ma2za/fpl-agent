import { getSeasonRules } from "./season-rules";
import type { Position, ValidationResult } from "./types";

export type PlayerFixtureStats = {
  dataComplete?: boolean;
  minutes: number;
  goals?: number;
  assists?: number;
  cleanSheet?: boolean;
  goalsConcededWhilePlaying?: number;
  saves?: number;
  penaltySaves?: number;
  penaltyMisses?: number;
  yellowCards?: number;
  redCards?: number;
  ownGoals?: number;
  bonusPoints?: number;
  defensiveContributions?: number;
};

export type PlayerFixtureScoreInput = {
  season: string;
  position: Position;
  stats: PlayerFixtureStats;
};

export type ScoreBreakdown = {
  isComplete: boolean;
  appearance: number;
  goals: number;
  assists: number;
  cleanSheet: number;
  saves: number;
  penaltySaves: number;
  penaltyMisses: number;
  cards: number;
  ownGoals: number;
  goalsConceded: number;
  bonus: number;
  defensiveContributions: number;
  total: number;
};

export type BonusCandidate = {
  playerId: number;
  bps: number;
};

export type ScoreLifecycle = "live" | "provisional" | "final";

export type ScoreLifecycleResult = {
  lifecycle: ScoreLifecycle | null;
  validation: ValidationResult;
};

function count(value: number | undefined) {
  return value ?? 0;
}

export function scorePlayerFixture(input: PlayerFixtureScoreInput): ScoreBreakdown {
  const rules = getSeasonRules(input.season);

  if (!rules) {
    throw new Error(`Unsupported FPL rules season: ${input.season}.`);
  }

  const stats = input.stats;
  const appearance = stats.minutes <= 0 ? 0 : stats.minutes < 60 ? 1 : 2;
  const goals = count(stats.goals) * rules.scoring.goalPoints[input.position];
  const assists = count(stats.assists) * 3;
  const cleanSheet = stats.cleanSheet && stats.minutes >= 60
    ? rules.scoring.cleanSheetPoints[input.position]
    : 0;
  const saves = input.position === "GKP" ? Math.floor(count(stats.saves) / 3) : 0;
  const penaltySaves = input.position === "GKP" ? count(stats.penaltySaves) * 5 : 0;
  const penaltyMisses = count(stats.penaltyMisses) * -2;
  const cards = count(stats.yellowCards) * -1 + count(stats.redCards) * -3;
  const ownGoals = count(stats.ownGoals) * -2;
  const goalsConceded = input.position === "GKP" || input.position === "DEF"
    ? Math.floor(count(stats.goalsConcededWhilePlaying) / 2) * -1
    : 0;
  const bonus = count(stats.bonusPoints);
  const threshold = input.position === "GKP"
    ? null
    : rules.scoring.defensiveContributionThreshold[input.position];
  const defensiveContributions = threshold !== null
    && stats.minutes > 0
    && count(stats.defensiveContributions) >= threshold ? 2 : 0;
  const total = appearance + goals + assists + cleanSheet + saves + penaltySaves
    + penaltyMisses + cards + ownGoals + goalsConceded + bonus + defensiveContributions;

  return {
    isComplete: stats.dataComplete ?? false,
    appearance,
    goals,
    assists,
    cleanSheet,
    saves,
    penaltySaves,
    penaltyMisses,
    cards,
    ownGoals,
    goalsConceded,
    bonus,
    defensiveContributions,
    total
  };
}

export function scorePlayerGameweek(inputs: PlayerFixtureScoreInput[]) {
  return inputs.reduce((total, input) => total + scorePlayerFixture(input).total, 0);
}

export function scorePlayerGameweekDetailed(inputs: PlayerFixtureScoreInput[]) {
  const scores = inputs.map(scorePlayerFixture);

  return {
    total: scores.reduce((total, score) => total + score.total, 0),
    fixtureCount: scores.length,
    isComplete: scores.every((score) => score.isComplete),
    scores
  };
}

export function finalizePlayerGameweekScore(input: {
  fixtures: PlayerFixtureScoreInput[];
  lifecycle: ScoreLifecycle;
}) {
  const score = scorePlayerGameweekDetailed(input.fixtures);

  return {
    ...score,
    lifecycle: input.lifecycle,
    isFinal: input.lifecycle === "final" && score.isComplete
  };
}

export function allocateBonusPoints(candidates: BonusCandidate[]) {
  const sorted = [...candidates].sort((a, b) => b.bps - a.bps || a.playerId - b.playerId);
  const allocations = new Map<number, number>();
  let rank = 1;
  let index = 0;

  while (index < sorted.length) {
    const bps = sorted[index].bps;
    let nextIndex = index + 1;

    while (nextIndex < sorted.length && sorted[nextIndex].bps === bps) {
      nextIndex += 1;
    }

    const tied = sorted.slice(index, nextIndex);
    const points = rank <= 3 ? 4 - rank : 0;

    for (const candidate of tied) {
      allocations.set(candidate.playerId, points);
    }

    rank += tied.length;
    index = nextIndex;
  }

  return allocations;
}

export function resolveScoreLifecycle(input: {
  season: string;
  allFixturesFinished: boolean;
  now: Date;
  lockdownAt: Date;
}): ScoreLifecycleResult {
  const validation: ValidationResult = { isValid: true, errors: [], warnings: [] };

  if (!getSeasonRules(input.season)) {
    validation.isValid = false;
    validation.errors.push(`Unsupported FPL rules season: ${input.season}.`);
    return { lifecycle: null, validation };
  }

  if (Number.isNaN(input.now.getTime()) || Number.isNaN(input.lockdownAt.getTime())) {
    validation.isValid = false;
    validation.errors.push("Score lifecycle dates must be valid.");
    return { lifecycle: null, validation };
  }

  if (!input.allFixturesFinished) {
    return { lifecycle: "live", validation };
  }

  return {
    lifecycle: input.now < input.lockdownAt ? "provisional" : "final",
    validation
  };
}
