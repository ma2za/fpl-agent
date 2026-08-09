import { describe, expect, it } from "vitest";
import {
  ClaimLedgerSchema,
  adaptClaimLedgerForV3,
  isStatementAllowedForPhase,
  validateEpistemicLanguage,
  type ClaimLedgerV3
} from "../src";
import { testClaimLedger } from "./fixtures/variantRecommendation";

function ledger() {
  return structuredClone(testClaimLedger()) as ClaimLedgerV3;
}

describe("epistemic integrity", () => {
  it("rejects evaluative fixture interpretation as a derived fact", () => {
    const value = ledger();
    value.facts[0].claim = "Fixtures favor triple Manchester United.";

    const report = validateEpistemicLanguage(value, "PRESEASON_DRAFT");

    expect(report.isValid).toBe(false);
    expect(report.findings).toContainEqual(expect.objectContaining({
      claimId: "fact:test",
      rule: "evaluative-language-as-fact",
      suggestedClaimKind: "FORECAST"
    }));
  });

  it("accepts separate observation, assumption, forecast, and decision claims", () => {
    const value = ledger();
    value.observations[0].claim = "Manchester United play Hull and Ipswich in GW1-2.";
    value.facts[0].claim = "Manchester United have two scheduled fixtures in GW1-2.";
    value.assumptions[0].claim = "Lower opponent ratings increase expected attacking returns.";
    value.forecasts[0].claim = "Manchester United attackers will score 12.5 points in GW1-2.";
    value.decisions[0].claim = "Select three Manchester United players.";

    expect(ClaimLedgerSchema.safeParse(value).success).toBe(true);
    expect(validateEpistemicLanguage(value, "PRESEASON_DRAFT").isValid).toBe(true);
  });

  it.each([
    ["Bruno costs more because he anchors captaincy.", "unsupported-causality"],
    ["Historical minutes guarantee starts.", "historical-minutes-guarantee"],
    ["Ownership makes this pick safe.", "ownership-as-safety"]
  ])("flags unsupported rationale: %s", (text, rule) => {
    const report = validateEpistemicLanguage(ledger(), "TRANSFER_WINDOW", [{ id: "rationale:test", text }]);

    expect(report.isValid).toBe(false);
    expect(report.findings).toContainEqual(expect.objectContaining({ claimId: "rationale:test", rule }));
  });

  it("applies price and hit language only in phases where it is relevant", () => {
    expect(isStatementAllowedForPhase("A price rise may block the move.", "PRESEASON_DRAFT")).toBe(false);
    expect(isStatementAllowedForPhase("Taking a hit would cost four points.", "PRESEASON_DRAFT")).toBe(false);
    expect(isStatementAllowedForPhase("The price movement risk remains after the deadline.", "TRANSFER_WINDOW")).toBe(true);
    expect(isStatementAllowedForPhase("No direct upgrade path is available within the current budget.", "PRESEASON_DRAFT")).toBe(true);
  });

  it("reads v1 and v2 ledgers without inventing epistemic kinds", () => {
    for (const schemaVersion of [1, 2] as const) {
      const current = ledger();
      const legacy = {
        ...current,
        schemaVersion,
        observations: current.observations.map(({ kind: _kind, isSourceQuote: _quote, ...claim }) => claim),
        facts: current.facts.map(({ kind: _kind, ...claim }) => claim),
        assumptions: current.assumptions.map(({ kind: _kind, ...claim }) => claim),
        decisions: current.decisions.map(({ kind: _kind, claim: _claim, forecastIds: _forecastIds, ...decision }) => decision)
      };
      delete (legacy as { forecasts?: unknown }).forecasts;

      const parsed = ClaimLedgerSchema.parse(legacy);
      const adapted = adaptClaimLedgerForV3(parsed);

      expect(adapted.claimLedger).toBeNull();
      expect(adapted.warnings[0]).toContain(`v${schemaVersion}`);
    }
  });
});
