import { describe, expect, it } from "vitest";
import { renderManualChecklist } from "../src";
import { variantRecommendation } from "./fixtures/variantRecommendation";

describe("manual checklist", () => {
  it("renders concrete transfer names and the exact ranking horizon", () => {
    const recommendation = variantRecommendation();
    recommendation.recommendedAction = {
      type: "transfer",
      transfers: [{
        sellPlayerId: 260,
        buyPlayerId: 41,
        sellPlayerName: "Harry Wilson",
        buyPlayerName: "Emiliano Buendía"
      }],
      transferCost: 0,
      bankAfter: 0.4,
      explanation: "Make the selected move."
    };
    recommendation.topTransferCandidates[0]!.moves = [{
      sellPlayerId: 260,
      buyPlayerId: 41,
      sellPlayerName: "Harry Wilson",
      buyPlayerName: "Emiliano Buendía"
    }];

    const markdown = renderManualChecklist(recommendation);
    expect(markdown).toContain("Harry Wilson -> Emiliano Buendía");
    expect(markdown).toContain("Canonical ranking horizon: GW1");
    expect(markdown).toContain("| Ranking horizon |");
  });

  it("labels unavailable supporting horizons instead of printing zero", () => {
    const recommendation = variantRecommendation();
    recommendation.topTransferCandidates[0]!.expectedGain3GW = null;
    recommendation.topTransferCandidates[0]!.expectedGain5GW = null;

    expect(renderManualChecklist(recommendation)).toContain("unavailable");
  });
});
