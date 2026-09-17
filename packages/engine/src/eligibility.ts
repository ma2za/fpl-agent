import { createHash } from "node:crypto";

export type EligibilityRole = "starter" | "bench" | "emergency";

export type ManagerConstraint = {
  id: string;
  kind: "exclude_player" | "exclude_club";
  playerIds?: number[];
  teamIds?: number[];
  scope: { fromGameweek: number; toGameweek: number };
  rationale: string;
  author: string;
  createdAt: string;
  expiresAt?: string;
  supersedesId?: string;
};

export type EligibilityPlayerInput = {
  playerId: number;
  teamId: number;
  status: string;
  chanceOfPlayingNextRound: number | null;
  canSelect: boolean;
  canTransact: boolean;
  fixtureCount: number;
  startProbability: number;
  appearanceProbability: number;
  roleState: "CREDIBLE_STARTER" | "LIKELY_SUBSTITUTE" | "EMERGENCY_BENCH" | "UNKNOWN_ROLE" | null;
  roleConflict: boolean;
  evidenceObservedAt: string;
  evidenceIds: string[];
};

export type EligibilityExclusion = {
  ruleId: string;
  code: string;
  evidenceIds: string[];
  observedAt: string;
  note: string;
};

export type RoleEligibility = {
  eligible: boolean;
  exclusions: EligibilityExclusion[];
};

export type PlayerEligibility = {
  playerId: number;
  teamId: number;
  roles: Record<EligibilityRole, RoleEligibility>;
  activeManagerConstraintIds: string[];
};

export type EligibilityReport = {
  schemaVersion: 1;
  artifactKind: "tool_evidence";
  generatedAt: string;
  gameweek: number;
  snapshotId: string;
  policyVersion: "0.0.28";
  maximumEvidenceAgeHours: number;
  managerConstraints: Array<ManagerConstraint & { active: boolean; inactiveReason: string | null }>;
  players: PlayerEligibility[];
  summary: {
    players: number;
    starterEligible: number;
    benchEligible: number;
    emergencyEligible: number;
    fullyExcluded: number;
  };
};

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function exclusion(ruleId: string, code: string, player: EligibilityPlayerInput, note: string, observedAt = player.evidenceObservedAt, evidenceIds = player.evidenceIds): EligibilityExclusion {
  return { ruleId, code, evidenceIds, observedAt, note };
}

export function managerConstraintStates(constraints: ManagerConstraint[], gameweek: number, generatedAt: string) {
  const now = Date.parse(generatedAt);
  const constraintById = new Map(constraints.map((constraint) => [constraint.id, constraint]));
  const baseStates = constraints.map((constraint) => {
    const created = Date.parse(constraint.createdAt);
    const expired = constraint.expiresAt !== undefined && Date.parse(constraint.expiresAt) <= now;
    const scoped = gameweek >= constraint.scope.fromGameweek && gameweek <= constraint.scope.toGameweek;
    const inactiveReason = created > now
      ? "not_yet_created"
      : expired
        ? "expired"
        : !scoped
          ? "outside_gameweek_scope"
          : null;
    return { ...constraint, active: inactiveReason === null, inactiveReason };
  });
  const superseded = new Set(baseStates.flatMap((constraint) =>
    constraint.active && constraint.supersedesId &&
      Date.parse(constraint.createdAt) > Date.parse(constraintById.get(constraint.supersedesId)?.createdAt ?? "")
      ? [constraint.supersedesId]
      : []));
  return baseStates.map((constraint) => superseded.has(constraint.id)
    ? { ...constraint, active: false, inactiveReason: "superseded" }
    : constraint);
}

export function buildEligibilityReport(input: {
  generatedAt: string;
  gameweek: number;
  players: EligibilityPlayerInput[];
  managerConstraints?: ManagerConstraint[];
  maximumEvidenceAgeHours?: number;
}): EligibilityReport {
  const maximumEvidenceAgeHours = input.maximumEvidenceAgeHours ?? 48;
  const generated = Date.parse(input.generatedAt);
  if (!Number.isFinite(generated)) throw new Error("Eligibility snapshot generatedAt must be a valid timestamp.");
  const constraintStates = managerConstraintStates(input.managerConstraints ?? [], input.gameweek, input.generatedAt);
  const activeConstraints = constraintStates.filter((constraint) => constraint.active);

  const players = input.players.map((player): PlayerEligibility => {
    const common: EligibilityExclusion[] = [];
    const evidenceTime = Date.parse(player.evidenceObservedAt);
    const evidenceAgeHours = (generated - evidenceTime) / 3_600_000;
    if (!Number.isFinite(evidenceTime) || evidenceAgeHours < 0 || evidenceAgeHours > maximumEvidenceAgeHours) {
      common.push(exclusion("evidence-freshness", evidenceAgeHours < 0 ? "FUTURE_EVIDENCE" : "STALE_OR_MISSING_EVIDENCE", player,
        `Eligibility evidence must be no more than ${maximumEvidenceAgeHours} hours old and must not postdate the snapshot.`));
    }
    if (!player.canSelect || !player.canTransact) {
      common.push(exclusion("registration", "NOT_REGISTERED_OR_SELECTABLE", player,
        "Official FPL registration or transaction eligibility is false."));
    }
    if (["i", "s", "u"].includes(player.status)) {
      common.push(exclusion("availability", player.status === "s" ? "SUSPENDED" : "UNAVAILABLE", player,
        `Official FPL status ${player.status} is not eligible.`));
    }
    if (player.fixtureCount < 1) {
      common.push(exclusion("fixture-participation", "NO_SCHEDULED_FIXTURE", player,
        "The player's club has no scheduled fixture in the target gameweek."));
    }
    const active = activeConstraints.filter((constraint) =>
      (constraint.kind === "exclude_player" && (constraint.playerIds ?? []).includes(player.playerId)) ||
      (constraint.kind === "exclude_club" && (constraint.teamIds ?? []).includes(player.teamId))
    );
    for (const constraint of active) {
      common.push(exclusion(`manager-constraint:${constraint.id}`, "ACTIVE_MANAGER_EXCLUSION", player,
        constraint.rationale, constraint.createdAt, [constraint.id]));
    }

    const starter = [...common];
    if (player.status === "d" && (player.chanceOfPlayingNextRound ?? 0) < 75) {
      starter.push(exclusion("starter-availability", "STARTER_AVAILABILITY_BELOW_75", player,
        "A doubtful player needs at least 75 percent official availability for starter eligibility."));
    }
    if (player.startProbability < 0.5 || player.roleState !== "CREDIBLE_STARTER") {
      starter.push(exclusion("starter-role", "INSUFFICIENT_STARTER_ROLE", player,
        "Starter eligibility requires at least 50 percent start probability and a credible-starter role state."));
    }
    if (player.roleConflict) {
      starter.push(exclusion("starter-role-conflict", "CONTRADICTORY_ROLE_EVIDENCE", player,
        "Contradictory current-role evidence fails closed for a starting role."));
    }

    const bench = [...common];
    if (player.status === "d" && (player.chanceOfPlayingNextRound ?? 0) < 50) {
      bench.push(exclusion("bench-availability", "BENCH_AVAILABILITY_BELOW_50", player,
        "A doubtful player needs at least 50 percent official availability for a normal bench role."));
    }
    if (player.appearanceProbability < 0.5 || player.roleState === "UNKNOWN_ROLE") {
      bench.push(exclusion("bench-role", "INSUFFICIENT_BENCH_ROLE", player,
        "Bench eligibility requires at least 50 percent appearance probability and a known role."));
    }

    const emergency = [...common];
    if (player.status === "d" && (player.chanceOfPlayingNextRound ?? 0) < 25) {
      emergency.push(exclusion("emergency-availability", "EMERGENCY_AVAILABILITY_BELOW_25", player,
        "A doubtful player needs at least 25 percent official availability even for emergency-only use."));
    }
    if (player.appearanceProbability < 0.2) {
      emergency.push(exclusion("emergency-role", "INSUFFICIENT_EMERGENCY_ROLE", player,
        "Emergency eligibility requires at least 20 percent appearance probability."));
    }

    return {
      playerId: player.playerId,
      teamId: player.teamId,
      roles: {
        starter: { eligible: starter.length === 0, exclusions: starter },
        bench: { eligible: bench.length === 0, exclusions: bench },
        emergency: { eligible: emergency.length === 0, exclusions: emergency }
      },
      activeManagerConstraintIds: active.map((constraint) => constraint.id).sort()
    };
  });
  const core = { generatedAt: input.generatedAt, gameweek: input.gameweek, maximumEvidenceAgeHours, managerConstraints: constraintStates, players };
  return {
    schemaVersion: 1,
    artifactKind: "tool_evidence",
    ...core,
    snapshotId: `eligibility:${hash(core)}`,
    policyVersion: "0.0.28",
    summary: {
      players: players.length,
      starterEligible: players.filter((player) => player.roles.starter.eligible).length,
      benchEligible: players.filter((player) => player.roles.bench.eligible).length,
      emergencyEligible: players.filter((player) => player.roles.emergency.eligible).length,
      fullyExcluded: players.filter((player) => !player.roles.starter.eligible && !player.roles.bench.eligible && !player.roles.emergency.eligible).length
    }
  };
}

export function candidateEligibilityErrors(input: {
  playerIds: number[];
  startingXI: number[];
  benchOrder: number[];
  report: EligibilityReport;
}) {
  const byPlayer = new Map(input.report.players.map((player) => [player.playerId, player]));
  const errors: string[] = [];
  for (const playerId of input.startingXI) {
    if (!byPlayer.get(playerId)?.roles.starter.eligible) errors.push(`Starting player ${playerId} is not starter-eligible.`);
  }
  for (const playerId of input.benchOrder.slice(0, -1)) {
    if (!byPlayer.get(playerId)?.roles.bench.eligible) errors.push(`Bench player ${playerId} is not bench-eligible.`);
  }
  const emergencyPlayerId = input.benchOrder.at(-1);
  if (emergencyPlayerId !== undefined && !byPlayer.get(emergencyPlayerId)?.roles.emergency.eligible) {
    errors.push(`Emergency bench player ${emergencyPlayerId} is not emergency-eligible.`);
  }
  for (const playerId of input.playerIds) {
    if (!byPlayer.has(playerId)) errors.push(`Player ${playerId} is absent from eligibility snapshot ${input.report.snapshotId}.`);
  }
  return errors;
}
