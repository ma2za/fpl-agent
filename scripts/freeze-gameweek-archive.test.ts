import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { promoteActiveDecision } from "../packages/agent/src";
import { assertManagerDecisionRecorded } from "./freeze-gameweek-archive";

const roots: string[] = [];

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function sourceDir() {
  const root = await mkdtemp(path.join(os.tmpdir(), "archive-decision-test-"));
  roots.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

async function authoredDecision(root: string, gameweek = 4) {
  const variantDir = path.join(root, "variants", "selected-variant");
  await mkdir(variantDir, { recursive: true });
  const deadline = "2026-09-12T10:00:00.000Z";
  const selectedCandidateId = `gw${gameweek}:transfer:selected`;
  await writeFile(path.join(variantDir, "recommendation.json"), JSON.stringify({
    artifactKind: "agent_decision",
    gameweek,
    deadline,
    decisionEvaluations: [{ selectedCandidateId }]
  }));
  await writeFile(path.join(variantDir, "decision-record.json"), JSON.stringify({
    artifactKind: "agent_decision",
    gameweek,
    status: "selected",
    selectedCandidateId
  }));
  await promoteActiveDecision({
    sourceDir: root,
    gameweek,
    variant: "selected-variant",
    updatedAt: "2026-09-11T12:00:00.000Z"
  });
  return deadline;
}

describe("gameweek archive decision gate", () => {
  it("rejects a missing active decision manifest", async () => {
    const root = await sourceDir();

    await expect(assertManagerDecisionRecorded(root, 4)).rejects.toThrow("hash-verified active-decision.json");
  });

  it("accepts only the hash-bound selected variant for the requested gameweek", async () => {
    const root = await sourceDir();
    const deadline = await authoredDecision(root);

    await expect(assertManagerDecisionRecorded(root, 4, deadline)).resolves.toBeUndefined();
    await expect(assertManagerDecisionRecorded(root, 5)).rejects.toThrow("gameweek does not match");
    const manifestPath = path.join(root, "active-decision.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    await writeFile(manifestPath, JSON.stringify({ ...manifest, status: "superseded" }));
    await expect(assertManagerDecisionRecorded(root, 4, deadline)).rejects.toThrow("active selected or submitted decision");
    await writeFile(manifestPath, JSON.stringify(manifest));
    await writeFile(path.join(root, "variants", "selected-variant", "recommendation.json"), "{}\n");
    await expect(assertManagerDecisionRecorded(root, 4, deadline)).rejects.toThrow("hash does not match");
  });
});
