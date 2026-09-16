import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findRetainedCounterfactual } from "./generate-decision-regret";

const roots: string[] = [];

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function archive() {
  const root = await mkdtemp(path.join(os.tmpdir(), "regret-frontier-test-"));
  roots.push(root);
  return root;
}

async function writeFrontier(root: string, relativePath: string, gameweek: number, candidateId: string) {
  await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
  await writeFile(path.join(root, relativePath), JSON.stringify({
    generatedAt: "2026-09-01T00:00:00.000Z",
    request: { gameweek },
    candidates: [{ candidateId, horizon: 1 }]
  }));
  return { path: relativePath, contentHash: `hash:${relativePath}` };
}

describe("retained regret frontier discovery", () => {
  it("selects the archived frontier containing the submitted agent candidate", async () => {
    const root = await archive();
    const selected = await writeFrontier(root, "counterfactuals/gw4/counterfactual-set.json", 4, "selected");
    const unrelated = await writeFrontier(root, "counterfactuals/gw4-other/counterfactual-set.json", 4, "other");
    await writeFile(path.join(root, "counterfactuals", "gw4", "structure-simulation.json"), "{}");

    const result = await findRetainedCounterfactual(root, [
      selected,
      unrelated,
      { path: "counterfactuals/gw4/structure-simulation.json", contentHash: "simulation" }
    ], 4, "selected");

    expect(result.path).toBe(selected.path);
    expect(result.simulationPath).toBe("counterfactuals/gw4/structure-simulation.json");
  });

  it("fails explicitly when no retained frontier contains the selected candidate", async () => {
    const root = await archive();
    const artifact = await writeFrontier(root, "counterfactuals/gw4/counterfactual-set.json", 4, "other");

    await expect(findRetainedCounterfactual(root, [artifact], 4, "selected")).rejects.toThrow("no retained horizon-one counterfactual frontier");
  });
});
