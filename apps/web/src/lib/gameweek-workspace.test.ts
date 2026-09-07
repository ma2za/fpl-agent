import { describe, expect, it } from "vitest";
import { calibrationSummary, loadWorkspace, parseGameweek, repositoryRoot, resolveGameweekStatus } from "./gameweek-workspace";

describe("gameweek workspace", () => {
  it("validates direct gameweek navigation", () => {
    expect(parseGameweek("1")).toBe(1);
    expect(parseGameweek("38")).toBe(38);
    expect(parseGameweek("0")).toBeNull();
    expect(parseGameweek("39")).toBeNull();
    expect(parseGameweek("gw-3")).toBeNull();
  });

  it("keeps missing, provisional, live, and finalized states distinct", () => {
    const base = { hasPostmortem: false, hasWorkspace: false, finished: false, isCurrent: false, isNext: false, deadline: null, now: 2 };
    expect(resolveGameweekStatus(base)).toBe("missing");
    expect(resolveGameweekStatus({ ...base, hasWorkspace: true })).toBe("provisional");
    expect(resolveGameweekStatus({ ...base, isCurrent: true, deadline: "1970-01-01T00:00:00.001Z" })).toBe("live");
    expect(resolveGameweekStatus({ ...base, hasPostmortem: true })).toBe("finalized");
  });

  it("orders archives newest first and resolves archived evidence before working files", () => {
    const workspace = loadWorkspace(repositoryRoot(), Date.parse("2026-09-07T12:00:00Z"));
    const populated = workspace.gameweeks.filter((gameweek) => gameweek.sources.length);
    expect(populated.map((gameweek) => gameweek.gameweek)).toEqual([...populated.map((gameweek) => gameweek.gameweek)].sort((a, b) => b - a));
    expect(workspace.gameweeks.find((gameweek) => gameweek.gameweek === 2)?.sources[0]).toBe("data/gameweek-archive/gw-2/recommendation.json");
    expect(workspace.gameweeks.find((gameweek) => gameweek.gameweek === 3)?.status).toBe("finalized");
  });

  it("renders empty calibration cohorts as zero values", () => {
    expect(calibrationSummary(null)).toEqual({ rows: 0, cohorts: 0 });
    expect(calibrationSummary({ cohorts: [] })).toEqual({ rows: 0, cohorts: 0 });
  });
});
