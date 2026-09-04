import { describe, expect, it } from "vitest";
import {
  buildProjectionUncertaintyReport,
  probabilisticProjection,
  projectPlayer,
  roleAdjustedPlayerProjections,
  type PlayerForEngine,
  type RoleEvidenceForProjection
} from "../src";

function player(id: number, minutes: number, totalPoints: number, position = "MID"): PlayerForEngine {
  return {
    id,
    name: `Player ${id}`,
    position,
    teamId: id,
    price: 7,
    nowCost: 70,
    status: "a",
    chanceOfPlayingNextRound: 100,
    minutes,
    totalPoints,
    form: 4
  };
}

function role(playerId: number, supportScore: number, confidence = 1): RoleEvidenceForProjection {
  return {
    playerId,
    supportScore,
    confidence,
    currentEvidencePresent: true,
    manualOverride: null,
    disagreement: false
  };
}

describe("probabilistic projections", () => {
  it("keeps mutually exclusive appearance probabilities normalized", () => {
    const subject = player(1, 2800, 180);
    const projection = probabilisticProjection({
      player: subject,
      rawProjection: projectPlayer(subject),
      roleEvidence: role(1, 0.85)
    });
    const appearance = projection.appearance;

    expect(appearance.startProbability + appearance.subAppearanceProbability + appearance.noAppearanceProbability).toBeCloseTo(1, 3);
    expect(appearance.appearanceProbability).toBeCloseTo(
      appearance.startProbability + appearance.subAppearanceProbability,
      3
    );
    expect(appearance.startProbabilityInterval!.lower).toBeLessThan(appearance.startProbability);
    expect(appearance.startProbabilityInterval!.upper).toBeGreaterThan(appearance.startProbability);
    expect(appearance.roleClass).toBe("LIKELY_STARTER");
    expect(appearance.probabilityMethod).toBe("HISTORICAL_PRIOR_WITH_ROLE_EVIDENCE_BLEND");
    expect(appearance.intervalMethod).toBe("HEURISTIC_MODEL_UNCERTAINTY_BAND");
  });

  it("is deterministic for identical evidence and seed", () => {
    const subject = player(2, 1700, 120);
    const input = {
      player: subject,
      rawProjection: projectPlayer(subject),
      roleEvidence: role(2, 0.7),
      seed: 42
    };

    expect(probabilisticProjection(input)).toEqual(probabilisticProjection(input));
  });

  it("carries the previous gameweek start prior and updates it with current-season starts", () => {
    const subject = player(15, 90, 5);
    const prior = probabilisticProjection({
      player: player(15, 2800, 180),
      rawProjection: projectPlayer(player(15, 2800, 180)),
      roleEvidence: role(15, 0.9)
    }).appearance;
    const projection = probabilisticProjection({
      player: subject,
      rawProjection: projectPlayer(subject),
      history: [{ started: true, minutes: 90, points: 5 }],
      priorAppearance: prior
    });

    expect(projection.appearance.startProbability).toBeGreaterThan(prior.startProbability);
    expect(projection.appearance.startProbability).toBeGreaterThan(0.9);
    expect(projection.appearance.reasonCodes).toContain("previous_gameweek_prior");
    expect(projection.appearance.reasonCodes).toContain("current_season_start_update");
  });

  it("uses a labeled cohort when conditional history is insufficient", () => {
    const subject = player(3, 0, 0, "DEF");
    const projection = probabilisticProjection({ player: subject, rawProjection: projectPlayer(subject) });

    expect(projection.minutes.sampleSource).toBe("cohort");
    expect(projection.minutes.cohort).toBe("def-new-player");
    expect(projection.appearance.source).toBe("cohort_fallback");
    expect(projection.appearance.reasonCodes).toContain("missing_current_role_evidence");
  });

  it("uses team strength in low-history cohort point fallbacks", () => {
    const weak = { ...player(13, 0, 0, "FWD"), teamStrength: 2 };
    const strong = { ...player(14, 0, 0, "FWD"), teamStrength: 5 };
    const weakProjection = probabilisticProjection({ player: weak, rawProjection: projectPlayer(weak) });
    const strongProjection = probabilisticProjection({ player: strong, rawProjection: projectPlayer(strong) });

    expect(strongProjection.rawProjectionIfStarting).toBeGreaterThan(weakProjection.rawProjectionIfStarting);
    expect(strongProjection.inputs.teamStrength).toBe(5);
  });

  it("uses empirical conditional distributions when sample coverage is sufficient", () => {
    const subject = player(4, 2200, 150, "FWD");
    const history = [
      ...Array.from({ length: 6 }, (_, index) => ({ started: true, minutes: 80 + index, points: 4 + index })),
      ...Array.from({ length: 4 }, (_, index) => ({ started: false, minutes: 10 + index, points: 1 + index }))
    ];
    const projection = probabilisticProjection({
      player: subject,
      rawProjection: projectPlayer(subject),
      roleEvidence: role(4, 0.8),
      history
    });

    expect(projection.minutes.sampleSource).toBe("empirical");
    expect(projection.minutes.startMinutesMean).toBe(82.5);
    expect(projection.minutes.substituteMinutesMean).toBe(11.5);
    expect(projection.rawProjectionIfStarting).toBe(6.5);
    expect(projection.conditionalSubstitutePoints).toBe(2.5);
  });

  it("uses the conditional expectation across appearance states", () => {
    const subject = player(5, 2600, 170);
    const projection = probabilisticProjection({
      player: subject,
      rawProjection: projectPlayer(subject),
      roleEvidence: role(5, 0.75)
    });
    const expected = projection.appearance.startProbability * projection.rawProjectionIfStarting +
      projection.appearance.subAppearanceProbability * projection.conditionalSubstitutePoints;

    expect(projection.roleAdjustedProjection).toBeCloseTo(expected, 1);
  });

  it("replaces goal and clean-sheet components without changing appearance", () => {
    const subject = player(16, 2600, 150, "DEF");
    const rawProjection = projectPlayer(subject);
    const baseline = probabilisticProjection({ player: subject, rawProjection, roleEvidence: role(16, 0.9) });
    const market = probabilisticProjection({
      player: subject,
      rawProjection,
      roleEvidence: role(16, 0.9),
      marketInput: {
        anytimeScorerProbability: 0.25,
        cleanSheetProbability: 0.5,
        baselineGoalRatePer90: 0.05,
        baselineCleanSheetProbability: 0.25,
        evidenceIds: ["odds:player:16"]
      }
    });

    expect(market.appearance).toEqual(baseline.appearance);
    expect(market.rawProjectionIfStarting).toBeGreaterThan(baseline.rawProjectionIfStarting);
    expect(market.marketAdjustment?.goalPointsDelta).toBeGreaterThan(0);
    expect(market.marketAdjustment?.cleanSheetPointsDelta).toBe(1);
    expect(market.marketAdjustment?.appliedConditionalStartDelta).toBeLessThanOrEqual(2);
    expect(market.componentVersions).toEqual({ appearance: "0.0.13", points: "0.0.23" });
  });

  it("lowers role-adjusted points when start probability falls without changing conditional-start points", () => {
    const subject = player(6, 2600, 180);
    const rawProjection = projectPlayer(subject);
    const secure = probabilisticProjection({ player: subject, rawProjection, roleEvidence: role(6, 0.95) });
    const uncertain = probabilisticProjection({ player: subject, rawProjection, roleEvidence: role(6, 0.2) });

    expect(uncertain.appearance.startProbability).toBeLessThan(secure.appearance.startProbability);
    expect(uncertain.rawProjectionIfStarting).toBe(secure.rawProjectionIfStarting);
    expect(uncertain.roleAdjustedProjection).toBeLessThan(secure.roleAdjustedProjection);
  });

  it("allows a secure lower raw projection to outrank an uncertain higher raw projection", () => {
    const securePlayer = player(7, 2600, 130);
    const uncertainPlayer = player(8, 2600, 220);
    const raw = [projectPlayer(securePlayer), projectPlayer(uncertainPlayer)];
    const report = buildProjectionUncertaintyReport({
      generatedAt: "2026-08-09T00:00:00.000Z",
      gameweek: 1,
      players: [securePlayer, uncertainPlayer],
      rawProjections: raw,
      roleEvidence: [role(7, 0.98), role(8, 0.1)]
    });
    const adjusted = roleAdjustedPlayerProjections(raw, report);

    expect(raw.find((item) => item.playerId === 8)!.projectedPoints).toBeGreaterThan(
      raw.find((item) => item.playerId === 7)!.projectedPoints
    );
    expect(adjusted[0].playerId).toBe(7);
  });

  it("captures established, threatened, challenger, and promoted profiles", () => {
    const promoted = { ...player(12, 0, 0, "DEF"), price: 4, nowCost: 40 };
    const profiles = [
      { player: player(9, 3000, 200), evidence: role(9, 0.95) },
      { player: player(10, 2800, 200), evidence: role(10, 0.3) },
      { player: player(11, 800, 80), evidence: role(11, 0.65) },
      { player: promoted, evidence: undefined }
    ].map(({ player: subject, evidence }) => {
      const projection = probabilisticProjection({
        player: subject,
        rawProjection: projectPlayer(subject),
        roleEvidence: evidence,
        seed: 12
      });
      return {
        playerId: subject.id,
        source: projection.appearance.source,
        cohort: projection.minutes.cohort,
        startProbability: projection.appearance.startProbability,
        roleAdjustedProjection: projection.roleAdjustedProjection
      };
    });

    expect(profiles).toEqual([
      { playerId: 9, source: "current_role", cohort: "mid-established-starter", startProbability: 0.95, roleAdjustedProjection: 5.9 },
      { playerId: 10, source: "current_role", cohort: "mid-role-challenger", startProbability: 0.3, roleAdjustedProjection: 2.6 },
      { playerId: 11, source: "current_role", cohort: "mid-role-challenger", startProbability: 0.65, roleAdjustedProjection: 5.6 },
      { playerId: 12, source: "cohort_fallback", cohort: "def-new-player", startProbability: 0.18, roleAdjustedProjection: 1 }
    ]);
  });
});
