import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runRefresh, type RefreshStage } from "../src";

const roots: string[] = [];

async function root() {
  const value = await mkdtemp(path.join(os.tmpdir(), "refresh-sidecar-"));
  roots.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

function stage(): RefreshStage {
  return {
    id: "required",
    required: true,
    artifacts: [{ relativePath: "new.txt" }],
    run: async ({ outputDir }) => writeFile(path.join(outputDir, "new.txt"), "new", "utf8")
  };
}

describe("refresh sidecar promotion", () => {
  it("does not promote either target when sidecar validation fails", async () => {
    const directory = await root();
    const targetDir = path.join(directory, "gw-1");
    const targetSidecar = path.join(directory, "store.sqlite");
    const stagedSidecar = path.join(directory, "staged.sqlite");
    await mkdir(targetDir);
    await Promise.all([
      writeFile(path.join(targetDir, "old.txt"), "old", "utf8"),
      writeFile(targetSidecar, "old-store", "utf8"),
      writeFile(stagedSidecar, "new-store", "utf8")
    ]);
    const result = await runRefresh({
      gameweek: 1, mode: "offline", targetDir, stages: [stage()], inputs: [],
      deadline: { status: "open", time: null }, runId: "validation-failure",
      sidecars: [{ id: "store", stagedPath: stagedSidecar, targetPath: targetSidecar, validate: async () => { throw new Error("invalid store"); } }]
    });
    expect(result.promoted).toBe(false);
    expect(result.manifest.errors).toContain("sidecar-validation: invalid store");
    expect(await readFile(path.join(targetDir, "old.txt"), "utf8")).toBe("old");
    expect(await readFile(targetSidecar, "utf8")).toBe("old-store");
  });

  it("restores the directory and database when grouped promotion is interrupted", async () => {
    const directory = await root();
    const targetDir = path.join(directory, "gw-1");
    const targetSidecar = path.join(directory, "store.sqlite");
    const stagedSidecar = path.join(directory, "staged.sqlite");
    await mkdir(targetDir);
    await Promise.all([
      writeFile(path.join(targetDir, "old.txt"), "old", "utf8"),
      writeFile(targetSidecar, "old-store", "utf8"),
      writeFile(stagedSidecar, "new-store", "utf8")
    ]);
    const result = await runRefresh({
      gameweek: 1, mode: "offline", targetDir, stages: [stage()], inputs: [],
      deadline: { status: "open", time: null }, runId: "promotion-failure",
      sidecars: [{ id: "store", stagedPath: stagedSidecar, targetPath: targetSidecar }],
      renameForPromotion: async (source, destination) => {
        if (source === stagedSidecar) throw new Error("interrupted promotion");
        await rename(source, destination);
      }
    });
    expect(result.promoted).toBe(false);
    expect(result.manifest.errors).toContain("promotion: interrupted promotion");
    expect(await readFile(path.join(targetDir, "old.txt"), "utf8")).toBe("old");
    expect(await readFile(targetSidecar, "utf8")).toBe("old-store");
  });
});
