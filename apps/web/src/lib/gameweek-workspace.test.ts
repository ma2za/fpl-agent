import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
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
    const base = { postmortemStatus: null, hasWorkspace: false, finished: false, isCurrent: false, isNext: false, deadline: null, now: 2 };
    expect(resolveGameweekStatus(base)).toBe("missing");
    expect(resolveGameweekStatus({ ...base, hasWorkspace: true })).toBe("provisional");
    expect(resolveGameweekStatus({ ...base, isCurrent: true, deadline: "1970-01-01T00:00:00.001Z" })).toBe("live");
    expect(resolveGameweekStatus({ ...base, postmortemStatus: "provisional" })).toBe("provisional");
    expect(resolveGameweekStatus({ ...base, postmortemStatus: "finalized" })).toBe("finalized");
  });

  it("orders archives newest first and resolves the active decision before an earlier archive", () => {
    const workspace = loadWorkspace(repositoryRoot(), Date.parse("2026-09-07T12:00:00Z"));
    const populated = workspace.gameweeks.filter((gameweek) => gameweek.sources.length);
    expect(populated.map((gameweek) => gameweek.gameweek)).toEqual([...populated.map((gameweek) => gameweek.gameweek)].sort((a, b) => b - a));
    expect(workspace.gameweeks.find((gameweek) => gameweek.gameweek === 2)?.sources[0]).toBe("data/gameweek-archive/gw-2/recommendation.json");
    expect(workspace.gameweeks.find((gameweek) => gameweek.gameweek === 3)?.status).toBe("finalized");
  });

  it("resolves a hash-bound active decision before an earlier archive", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "gameweek-workspace-test-"));
    try {
      const workspace = path.join(root, "packages", "content", "recommendations", "gw-4");
      const variant = path.join(workspace, "variants", "buendia");
      const archive = path.join(root, "data", "gameweek-archive", "gw-4");
      mkdirSync(variant, { recursive: true });
      mkdirSync(archive, { recursive: true });
      const selectedCandidateId = "action:transfer:260>41";
      const recommendation = `${JSON.stringify({ decisionEvaluations: [{ selectedCandidateId }] })}\n`;
      const decision = `${JSON.stringify({ selectedCandidateId })}\n`;
      writeFileSync(path.join(variant, "recommendation.json"), recommendation);
      writeFileSync(path.join(variant, "decision-record.json"), decision);
      writeFileSync(path.join(archive, "archive-manifest.json"), "{}\n");
      writeFileSync(path.join(archive, "recommendation.json"), "{}\n");
      writeFileSync(path.join(archive, "decision-record.json"), JSON.stringify({ selectedCandidateId: "stale" }));
      writeFileSync(path.join(workspace, "active-decision.json"), JSON.stringify({
        gameweek: 4,
        selectedCandidateId,
        recommendationPath: "packages/content/recommendations/gw-4/variants/buendia/recommendation.json",
        recommendationSha256: createHash("sha256").update(recommendation).digest("hex"),
        decisionRecordPath: "packages/content/recommendations/gw-4/variants/buendia/decision-record.json",
        decisionRecordSha256: createHash("sha256").update(decision).digest("hex")
      }));

      const result = loadWorkspace(root).gameweeks.find((gameweek) => gameweek.gameweek === 4);

      expect(result?.sources[0]).toBe("packages/content/recommendations/gw-4/active-decision.json");
      expect(result?.decision?.selectedCandidateId).toBe(selectedCandidateId);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("renders empty calibration cohorts as zero values", () => {
    expect(calibrationSummary(null)).toEqual({ rows: 0, cohorts: 0 });
    expect(calibrationSummary({ cohorts: [] })).toEqual({ rows: 0, cohorts: 0 });
  });
});
