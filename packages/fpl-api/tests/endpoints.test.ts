import { describe, expect, it } from "vitest";
import { buildFplUrl, FPL_ENDPOINTS } from "../src";

describe("FPL endpoints", () => {
  it("keeps public API paths under /api", () => {
    expect(buildFplUrl(FPL_ENDPOINTS.bootstrapStatic)).toBe(
      "https://fantasy.premierleague.com/api/bootstrap-static/"
    );
  });
});
