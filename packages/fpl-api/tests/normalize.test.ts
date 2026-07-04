import { describe, expect, it } from "vitest";
import bootstrap from "./fixtures/bootstrap-static.json";
import { BootstrapStaticSchema } from "../src/schemas";
import { normalizePlayers } from "../src/normalize";

describe("normalizePlayers", () => {
  it("joins players to positions and teams", () => {
    const parsed = BootstrapStaticSchema.parse(bootstrap);
    const players = normalizePlayers(parsed);

    expect(players[0]).toMatchObject({
      id: 1,
      name: "David Raya",
      price: 6.2,
      position: "GKP",
      team: "Arsenal"
    });
    expect(players[1].position).toBe("DEF");
  });
});
