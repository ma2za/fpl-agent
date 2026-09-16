import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  confirmActiveDecisionSubmission,
  promoteActiveDecision,
  validateActiveDecisionManifest
} from "../src";

const roots: string[] = [];

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function workspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "active-decision-test-"));
  roots.push(root);
  const sourceDir = path.join(root, "gw-4");
  const variantDir = path.join(sourceDir, "variants", "buendia");
  await mkdir(variantDir, { recursive: true });
  const deadline = "2026-09-12T10:00:00.000Z";
  const selectedCandidateId = "action:transfer:260>41";
  await writeFile(path.join(variantDir, "recommendation.json"), JSON.stringify({
    artifactKind: "agent_decision",
    gameweek: 4,
    deadline,
    decisionEvaluations: [{ selectedCandidateId }]
  }));
  await writeFile(path.join(variantDir, "decision-record.json"), JSON.stringify({
    artifactKind: "agent_decision",
    gameweek: 4,
    status: "selected",
    selectedCandidateId
  }));
  return { sourceDir, deadline, selectedCandidateId };
}

describe("active decision manifest", () => {
  it("binds the selected variant to its recommendation and decision hashes", async () => {
    const input = await workspace();
    const promoted = await promoteActiveDecision({
      sourceDir: input.sourceDir,
      gameweek: 4,
      variant: "buendia",
      updatedAt: "2026-09-11T12:00:00.000Z",
      archiveState: "earlier_immutable_variant"
    });

    expect(promoted.selectedCandidateId).toBe(input.selectedCandidateId);
    const promotedAgain = await promoteActiveDecision({
      sourceDir: input.sourceDir,
      gameweek: 4,
      variant: "buendia",
      updatedAt: "2026-09-11T13:00:00.000Z"
    });
    expect(promotedAgain.archiveState).toBe("earlier_immutable_variant");
    await writeFile(path.join(input.sourceDir, "variants", "buendia", "decision-record.json"), "{}\n");
    await expect(validateActiveDecisionManifest(input.sourceDir, 4, input.deadline)).rejects.toThrow("hash does not match");
  });

  it("requires auditable evidence before marking a decision submitted", async () => {
    const input = await workspace();
    await promoteActiveDecision({
      sourceDir: input.sourceDir,
      gameweek: 4,
      variant: "buendia",
      updatedAt: "2026-09-11T12:00:00.000Z"
    });

    const submitted = await confirmActiveDecisionSubmission({
      sourceDir: input.sourceDir,
      gameweek: 4,
      confirmedAt: "2026-09-12T10:01:00.000Z",
      source: "public_fpl_api",
      reference: "entry/123/event/4/picks"
    });

    expect(submitted.status).toBe("submitted");
    expect(submitted.submissionEvidence?.source).toBe("public_fpl_api");
    expect(JSON.parse(await readFile(path.join(input.sourceDir, "active-decision.json"), "utf8"))).toEqual(submitted);
  });
});
