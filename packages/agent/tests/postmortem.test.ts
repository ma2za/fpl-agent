import { describe, expect, it } from "vitest";
import postmortemJson from "../../content/postmortems/gw-1.json";
import { GameweekPostmortemSchema } from "../src/postmortem";

describe("GW1 postmortem", () => {
  it("reconciles the submitted score and AI counterfactual", () => {
    const postmortem = GameweekPostmortemSchema.parse(postmortemJson);

    expect(postmortem.manager.totalPoints).toBe(47);
    expect(postmortem.aiSelection.actualPointsCounterfactual).toBe(45);
    expect(postmortem.counterfactuals.managerOverrideDelta).toBe(2);
  });

  it("records the three manager overrides", () => {
    const postmortem = GameweekPostmortemSchema.parse(postmortemJson);

    expect(postmortem.managerOverrides.map((item) => `${item.outName} -> ${item.inName}`)).toEqual([
      "Mukiele -> Maguire",
      "Cunha -> Mbeumo",
      "Okafor -> E. Le Fée"
    ]);
  });
});
