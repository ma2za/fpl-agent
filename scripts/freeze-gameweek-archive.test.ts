import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertManagerDecisionRecorded } from "./freeze-gameweek-archive";

const roots: string[] = [];

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function sourceDir() {
  const root = await mkdtemp(path.join(os.tmpdir(), "archive-decision-test-"));
  roots.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

describe("gameweek archive decision gate", () => {
  it("rejects a missing or unavailable decision record", async () => {
    const root = await sourceDir();

    await expect(assertManagerDecisionRecorded(root, 4)).rejects.toThrow("explicit selected or submitted manager decision");
    await writeFile(path.join(root, "decision-record.json"), JSON.stringify({
      artifactKind: "decision_record_unavailable",
      gameweek: 4,
      validation: { isValid: false }
    }));
    await expect(assertManagerDecisionRecorded(root, 4)).rejects.toThrow("explicit selected or submitted manager decision");
  });

  it("accepts a selected decision for the requested gameweek", async () => {
    const root = await sourceDir();
    await writeFile(path.join(root, "decision-record.json"), JSON.stringify({
      artifactKind: "agent_decision",
      gameweek: 4,
      status: "selected",
      selectedCandidateId: "gw4:transfer:harvey-barnes"
    }));

    await expect(assertManagerDecisionRecorded(root, 4)).resolves.toBeUndefined();
    await expect(assertManagerDecisionRecorded(root, 5)).rejects.toThrow("for this gameweek");
  });
});
