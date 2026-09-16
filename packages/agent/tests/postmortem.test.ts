import { describe, expect, it } from "vitest";
import postmortemJson from "../../content/postmortems/gw-1.json";
import gw3PostmortemJson from "../../content/postmortems/gw-3.json";
import gw4PostmortemJson from "../../content/postmortems/gw-4.json";
import { GameweekPostmortemSchema } from "../src/postmortem";

describe("GW1 postmortem", () => {
  it("reconciles the submitted score and AI counterfactual", () => {
    const postmortem = GameweekPostmortemSchema.parse(postmortemJson);

    expect(postmortem.manager.totalPoints).toBe(47);
    expect(postmortem.aiSelection.actualPointsCounterfactual).toBe(44);
    expect(postmortem.counterfactuals.managerOverrideDelta).toBe(3);
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

describe("GW3 postmortem", () => {
  it("reconciles the submitted score and manager override", () => {
    const postmortem = GameweekPostmortemSchema.parse(gw3PostmortemJson);

    expect(postmortem.manager.totalPoints).toBe(65);
    expect(postmortem.aiSelection.actualPointsCounterfactual).toBe(57);
    expect(postmortem.counterfactuals.managerOverrideDelta).toBe(8);
  });
});

describe("GW4 postmortem", () => {
  it("stays provisional until the official outcome batch is finalized", () => {
    const postmortem = GameweekPostmortemSchema.parse(gw4PostmortemJson);

    expect(postmortem.outcomeStatus).toBe("provisional");
    expect(postmortem.manager.totalPoints).toBe(61);
  });
});
