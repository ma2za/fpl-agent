import { describe, expect, it } from "vitest";
import { summarizeOdds } from "./generate-likely-starter-refresh";

describe("likely-starter odds summary", () => {
  it("reports partial market coverage without claiming the provider failed", () => {
    const summary = summarizeOdds({
      summary: {
        coverageStatus: "partial",
        marketCoverage: {
          matchOdds: "partial",
          overUnder: "partial",
          cleanSheet: "missing",
          anytimeScorer: "partial",
          teamGoals: "missing"
        }
      }
    });

    expect(summary.calibration).toContain("partial");
    expect(summary.markdown).toContain("anytime scorer available");
    expect(summary.markdown).toContain("clean sheet, team goals missing");
    expect(summary.warning).not.toContain("failed");
  });

  it("uses the unavailable fallback when there is no odds report", () => {
    expect(summarizeOdds(null)).toMatchObject({
      calibration: "unavailable",
      markdown: "unavailable; heuristic projection fallback active"
    });
  });
});
