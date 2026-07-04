import { describe, expect, it } from "vitest";
import bootstrap from "./fixtures/bootstrap-static.json";
import fixtures from "./fixtures/fixtures.json";
import { BootstrapStaticSchema, FixtureSchema } from "../src/schemas";

describe("FPL API schemas", () => {
  it("parses bootstrap-static data with core player, team, event, and position fields", () => {
    const parsed = BootstrapStaticSchema.parse(bootstrap);

    expect(parsed.elements).toHaveLength(2);
    expect(parsed.element_types[0].singular_name_short).toBe("GKP");
    expect(parsed.teams[0].name).toBe("Arsenal");
    expect(parsed.events[0].is_next).toBe(true);
  });

  it("parses fixture data", () => {
    const parsed = fixtures.map((fixture) => FixtureSchema.parse(fixture));

    expect(parsed[0].team_h).toBe(1);
    expect(parsed[0].team_h_difficulty).toBe(2);
  });
});
