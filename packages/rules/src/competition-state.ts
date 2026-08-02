import { addError, createResult } from "./result";
import type {
  CompetitionAction,
  CompetitionEvent,
  CompetitionPhase,
  CompetitionState,
  DeadlineProximity,
  ValidationResult
} from "./types";

const ACTIONS_BY_PHASE: Record<CompetitionPhase, readonly CompetitionAction[]> = {
  PRESEASON_DRAFT: [
    "retain_draft",
    "modify_draft",
    "rebuild_structure",
    "wait_for_information",
    "lock_draft"
  ],
  LIVE_GAMEWEEK: ["monitor", "review_live_gameweek"],
  TRANSFER_WINDOW: [
    "roll",
    "transfer",
    "hit",
    "wildcard",
    "free_hit",
    "wait_for_information"
  ],
  FINAL_LOCKDOWN: ["monitor", "wait_for_finalization"],
  SEASON_COMPLETE: ["review_season"]
};

function timestamp(value: string) {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid competition deadline: ${value}.`);
  }

  return parsed;
}

function deadlineProximity(deadline: string | null, now: number): DeadlineProximity {
  if (!deadline) {
    return "unknown";
  }

  const remaining = timestamp(deadline) - now;

  if (remaining <= 0) return "passed";
  if (remaining <= 2 * 60 * 60 * 1000) return "imminent";
  if (remaining <= 48 * 60 * 60 * 1000) return "approaching";
  return "early";
}

export function allowedCompetitionActions(phase: CompetitionPhase) {
  return ACTIONS_BY_PHASE[phase];
}

export function validateCompetitionAction(input: {
  phase: CompetitionPhase;
  action: CompetitionAction;
}): ValidationResult {
  const result = createResult();

  if (!ACTIONS_BY_PHASE[input.phase].includes(input.action)) {
    addError(result, `Action ${input.action} is not valid during ${input.phase}.`);
  }

  return result;
}

export function deriveCompetitionState(input: {
  events: CompetitionEvent[];
  now: number;
  finalLockdownTime?: string | null;
}): CompetitionState {
  if (input.events.length === 0) {
    throw new Error("Competition state requires at least one event.");
  }

  const events = [...input.events].sort((a, b) => a.id - b.id);
  const first = events[0];
  const last = events[events.length - 1];
  const current = events.find((event) => event.isCurrent && !event.finished);
  const next = events.find((event) => event.isNext);
  const target = next ?? current ?? null;
  let phase: CompetitionPhase;

  if (last.finished) {
    const finalLockdown = input.finalLockdownTime ? timestamp(input.finalLockdownTime) : null;
    phase = finalLockdown !== null && input.now < finalLockdown
      ? "FINAL_LOCKDOWN"
      : "SEASON_COMPLETE";
  } else if (next?.id === first.id && timestamp(next.deadlineTime) > input.now && !current) {
    phase = "PRESEASON_DRAFT";
  } else if (current && timestamp(current.deadlineTime) <= input.now) {
    phase = "LIVE_GAMEWEEK";
  } else {
    phase = "TRANSFER_WINDOW";
  }

  return {
    phase,
    deadlineProximity: deadlineProximity(target?.deadlineTime ?? null, input.now),
    activeGameweek: target?.id ?? (
      phase === "FINAL_LOCKDOWN" || phase === "SEASON_COMPLETE" ? last.id : null
    ),
    nextDeadline: target?.deadlineTime ?? null
  };
}
