import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  confirmActiveDecisionSubmission,
  markActiveDecisionArchived,
  promoteActiveDecision,
  validateActiveDecisionManifest,
  validateActiveDecisionManifestIfPresent
} from "../src";

const roots: string[] = [];

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function writeVariant(sourceDir: string, variant: string, selectedCandidateId: string, deadline: string) {
  const variantDir = path.join(sourceDir, "variants", variant);
  await mkdir(variantDir, { recursive: true });
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
}

async function workspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "active-decision-test-"));
  roots.push(root);
  const sourceDir = path.join(root, "gw-4");
  const deadline = "2026-09-12T10:00:00.000Z";
  const selectedCandidateId = "action:transfer:260>41";
  await writeVariant(sourceDir, "buendia", selectedCandidateId, deadline);
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

  it("rejects manifest drift in gameweek, variant, deadline, and selected candidate", async () => {
    const input = await workspace();
    await promoteActiveDecision({
      sourceDir: input.sourceDir,
      gameweek: 4,
      variant: "buendia",
      updatedAt: "2026-09-11T12:00:00.000Z"
    });
    const manifestPath = path.join(input.sourceDir, "active-decision.json");
    const original = JSON.parse(await readFile(manifestPath, "utf8"));
    const cases = [
      { manifest: { ...original, gameweek: 5 }, error: "gameweek does not match" },
      { manifest: { ...original, variant: "tavernier" }, error: "variant does not match" },
      { manifest: { ...original, deadline: "2026-09-13T10:00:00.000Z" }, error: "recommendation deadline does not match" },
      { manifest: { ...original, selectedCandidateId: "action:roll:none" }, error: "decision record does not match" }
    ];

    for (const item of cases) {
      await writeFile(manifestPath, JSON.stringify(item.manifest));
      await expect(validateActiveDecisionManifest(input.sourceDir, 4)).rejects.toThrow(item.error);
    }
  });

  it("treats only a missing manifest as absent and rejects missing referenced artifacts", async () => {
    const input = await workspace();
    await expect(validateActiveDecisionManifestIfPresent(input.sourceDir, 4)).resolves.toBeNull();
    await promoteActiveDecision({
      sourceDir: input.sourceDir,
      gameweek: 4,
      variant: "buendia",
      updatedAt: "2026-09-11T12:00:00.000Z"
    });
    await rm(path.join(input.sourceDir, "variants", "buendia", "recommendation.json"));

    await expect(validateActiveDecisionManifestIfPresent(input.sourceDir, 4)).rejects.toMatchObject({ code: "ENOENT" });
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

    const promotedAgain = await promoteActiveDecision({
      sourceDir: input.sourceDir,
      gameweek: 4,
      variant: "buendia",
      updatedAt: "2026-09-12T10:02:00.000Z"
    });
    expect(promotedAgain.status).toBe("submitted");
    expect(promotedAgain.submissionEvidence).toEqual(submitted.submissionEvidence);
  });

  it("requires and records an explicit reason when replacing an active decision", async () => {
    const input = await workspace();
    await promoteActiveDecision({
      sourceDir: input.sourceDir,
      gameweek: 4,
      variant: "buendia",
      updatedAt: "2026-09-11T12:00:00.000Z"
    });
    await writeVariant(input.sourceDir, "tavernier", "action:transfer:260>548", input.deadline);

    await expect(promoteActiveDecision({
      sourceDir: input.sourceDir,
      gameweek: 4,
      variant: "tavernier",
      updatedAt: "2026-09-11T13:00:00.000Z"
    })).rejects.toThrow("explicit supersession reason");

    const replaced = await promoteActiveDecision({
      sourceDir: input.sourceDir,
      gameweek: 4,
      variant: "tavernier",
      updatedAt: "2026-09-11T13:00:00.000Z",
      supersessionReason: "Updated role evidence changed the preferred move."
    });
    expect(replaced.variant).toBe("tavernier");
    expect(replaced.submissionStatus).toBe("unconfirmed");
    expect(replaced.supersedes).toMatchObject({
      variant: "buendia",
      selectedCandidateId: input.selectedCandidateId,
      reason: "Updated role evidence changed the preferred move."
    });
  });

  it("validates a replacement before atomically changing the active manifest", async () => {
    const input = await workspace();
    await promoteActiveDecision({
      sourceDir: input.sourceDir,
      gameweek: 4,
      variant: "buendia",
      updatedAt: "2026-09-11T12:00:00.000Z"
    });
    await writeVariant(input.sourceDir, "invalid", "action:transfer:260>548", input.deadline);
    await writeFile(path.join(input.sourceDir, "variants", "invalid", "recommendation.json"), JSON.stringify({
      artifactKind: "agent_decision",
      gameweek: 4,
      deadline: input.deadline,
      decisionEvaluations: [{ selectedCandidateId: "action:roll:none" }]
    }));

    await expect(promoteActiveDecision({
      sourceDir: input.sourceDir,
      gameweek: 4,
      variant: "invalid",
      updatedAt: "2026-09-11T13:00:00.000Z",
      supersessionReason: "Test invalid replacement."
    })).rejects.toThrow("not selected by the authored recommendation");

    expect(await validateActiveDecisionManifest(input.sourceDir, 4)).toMatchObject({
      variant: "buendia",
      selectedCandidateId: input.selectedCandidateId
    });
  });

  it("records archive evidence independently and preserves it during late submission capture", async () => {
    const input = await workspace();
    await promoteActiveDecision({
      sourceDir: input.sourceDir,
      gameweek: 4,
      variant: "buendia",
      updatedAt: "2026-09-11T12:00:00.000Z"
    });
    const archived = await markActiveDecisionArchived({
      sourceDir: input.sourceDir,
      gameweek: 4,
      archiveId: "archive:gw4:test",
      frozenAt: "2026-09-12T10:00:00.000Z",
      manifestPath: "data/gameweek-archive/gw-4/archive-manifest.json"
    });

    expect(archived).toMatchObject({
      status: "archived",
      submissionStatus: "unconfirmed",
      archiveState: "archived",
      archiveEvidence: { archiveId: "archive:gw4:test" }
    });

    const submitted = await confirmActiveDecisionSubmission({
      sourceDir: input.sourceDir,
      gameweek: 4,
      confirmedAt: "2026-09-12T10:01:00.000Z",
      source: "public_fpl_api",
      reference: "entry/123/event/4/picks"
    });
    expect(submitted).toMatchObject({
      status: "archived",
      submissionStatus: "confirmed",
      archiveState: "archived",
      archiveEvidence: { archiveId: "archive:gw4:test" }
    });

    await writeVariant(input.sourceDir, "tavernier", "action:transfer:260>548", input.deadline);
    await expect(promoteActiveDecision({
      sourceDir: input.sourceDir,
      gameweek: 4,
      variant: "tavernier",
      updatedAt: "2026-09-12T10:02:00.000Z",
      supersessionReason: "Too late."
    })).rejects.toThrow("archived active decision cannot be superseded");
  });
});
