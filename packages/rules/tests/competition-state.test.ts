import { describe, expect, it } from "vitest";
import {
  allowedCompetitionActions,
  deriveCompetitionState,
  validateCompetitionAction,
  type CompetitionAction,
  type CompetitionEvent,
  type CompetitionPhase
} from "../src";

const deadline = "2026-08-21T17:30:00Z";

function event(overrides: Partial<CompetitionEvent> = {}): CompetitionEvent {
  return {
    id: 1,
    deadlineTime: deadline,
    finished: false,
    isCurrent: false,
    isNext: true,
    ...overrides
  };
}

describe("competition state", () => {
  it("derives preseason independently from deadline proximity", () => {
    const state = deriveCompetitionState({
      events: [event()],
      now: Date.parse("2026-08-20T17:30:00Z")
    });

    expect(state.phase).toBe("PRESEASON_DRAFT");
    expect(state.deadlineProximity).toBe("approaching");
    expect(state.activeGameweek).toBe(1);
  });

  it("derives live and transfer-window phases", () => {
    expect(deriveCompetitionState({
      events: [event({ isCurrent: true, isNext: false })],
      now: Date.parse("2026-08-21T18:30:00Z")
    }).phase).toBe("LIVE_GAMEWEEK");

    expect(deriveCompetitionState({
      events: [
        event({ finished: true, isNext: false }),
        event({ id: 2, deadlineTime: "2026-08-28T17:30:00Z" })
      ],
      now: Date.parse("2026-08-22T12:00:00Z")
    }).phase).toBe("TRANSFER_WINDOW");
  });

  it("distinguishes final lockdown from season completion", () => {
    const events = [event({ id: 38, finished: true, isNext: false })];

    expect(deriveCompetitionState({
      events,
      now: Date.parse("2027-05-30T18:00:00Z"),
      finalLockdownTime: "2027-05-30T20:00:00Z"
    }).phase).toBe("FINAL_LOCKDOWN");

    expect(deriveCompetitionState({
      events,
      now: Date.parse("2027-05-30T21:00:00Z"),
      finalLockdownTime: "2027-05-30T20:00:00Z"
    }).phase).toBe("SEASON_COMPLETE");
  });

  it("rejects empty or malformed event input", () => {
    expect(() => deriveCompetitionState({ events: [], now: 0 })).toThrow("at least one event");
    expect(() => deriveCompetitionState({
      events: [event({ deadlineTime: "invalid" })],
      now: 0
    })).toThrow("Invalid competition deadline");
  });
});

describe("competition actions", () => {
  const phases: CompetitionPhase[] = [
    "PRESEASON_DRAFT",
    "LIVE_GAMEWEEK",
    "TRANSFER_WINDOW",
    "FINAL_LOCKDOWN",
    "SEASON_COMPLETE"
  ];
  const actions: CompetitionAction[] = [
    "retain_draft",
    "modify_draft",
    "rebuild_structure",
    "wait_for_information",
    "lock_draft",
    "monitor",
    "review_live_gameweek",
    "roll",
    "transfer",
    "hit",
    "wildcard",
    "free_hit",
    "wait_for_finalization",
    "review_season"
  ];

  for (const phase of phases) {
    for (const action of actions) {
      it(`${phase} ${action}`, () => {
        expect(validateCompetitionAction({ phase, action }).isValid).toBe(
          allowedCompetitionActions(phase).includes(action)
        );
      });
    }
  }

  it("rejects a GW1 roll", () => {
    expect(validateCompetitionAction({
      phase: "PRESEASON_DRAFT",
      action: "roll"
    }).errors).toEqual(["Action roll is not valid during PRESEASON_DRAFT."]);
  });
});
