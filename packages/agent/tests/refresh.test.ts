import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RefreshManifestSchema, runRefresh, type RefreshStage } from "../src";

const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fpl-refresh-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeArtifact(outputDir: string, relativePath: string, value: unknown) {
  const filePath = path.join(outputDir, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function baseInput(targetDir: string, stages: RefreshStage[]) {
  return {
    gameweek: 4,
    mode: "offline" as const,
    targetDir,
    stages,
    inputs: [{
      id: "bootstrap",
      path: "data/raw/bootstrap-static.json",
      sourceMode: "offline" as const,
      sha256: "abc",
      fetchedAt: "2026-08-01T00:00:00.000Z",
      ageHours: 2,
      freshness: "fresh" as const
    }],
    deadline: { status: "open" as const, time: "2026-08-10T12:00:00.000Z" },
    runId: "fixed-run",
    now: () => new Date("2026-08-01T00:00:00.000Z")
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("refresh orchestrator", () => {
  it("rejects unsafe run IDs and broad target paths before filesystem mutation", async () => {
    const root = await temporaryDirectory();

    await expect(runRefresh({
      ...baseInput(path.join(root, "gw-4"), []),
      runId: "../escape"
    })).rejects.toThrow("Refresh run ID may contain only letters, numbers, underscores, and hyphens.");
    await expect(runRefresh({
      ...baseInput(root, [])
    })).rejects.toThrow("Refresh target must end with gw-4.");
  });

  it("promotes one coherent staged set and records hashes and deadline state", async () => {
    const root = await temporaryDirectory();
    const targetDir = path.join(root, "gw-4");
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(targetDir, "previous.txt"), "keep\n", "utf8");
    const stages: RefreshStage[] = [
      {
        id: "fixtures",
        required: true,
        artifacts: [{ relativePath: "fixture-ticker.json" }],
        run: ({ outputDir }) => writeArtifact(outputDir, "fixture-ticker.json", { gameweek: 4 })
      },
      {
        id: "summary",
        required: true,
        phase: 1,
        artifacts: [{ relativePath: "evidence-report.json" }],
        run: async ({ outputDir }) => {
          const fixtures = JSON.parse(await readFile(path.join(outputDir, "fixture-ticker.json"), "utf8"));
          await writeArtifact(outputDir, "evidence-report.json", { fixtureGameweek: fixtures.gameweek });
        }
      }
    ];

    const result = await runRefresh(baseInput(targetDir, stages));
    const manifest = RefreshManifestSchema.parse(
      JSON.parse(await readFile(path.join(targetDir, "refresh-manifest.json"), "utf8"))
    );

    expect(result.promoted).toBe(true);
    expect(await readFile(path.join(targetDir, "previous.txt"), "utf8")).toBe("keep\n");
    expect(manifest).toMatchObject({
      status: "success",
      deadline: { status: "open" },
      stages: [{ id: "fixtures", status: "success" }, { id: "summary", status: "success" }]
    });
    expect(manifest.artifacts.map((artifact) => artifact.relativePath)).toEqual([
      "evidence-report.json",
      "fixture-ticker.json"
    ]);
  });

  it("preserves the last valid set when a required stage fails after writing", async () => {
    const root = await temporaryDirectory();
    const targetDir = path.join(root, "gw-4");
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(targetDir, "fixture-ticker.json"), "old\n", "utf8");
    const stages: RefreshStage[] = [{
      id: "fixtures",
      required: true,
      artifacts: [{ relativePath: "fixture-ticker.json" }],
      run: async ({ outputDir }) => {
        await writeFile(path.join(outputDir, "fixture-ticker.json"), "partial\n", "utf8");
        throw new Error("interrupted write");
      }
    }];

    const result = await runRefresh(baseInput(targetDir, stages));

    expect(result.promoted).toBe(false);
    expect(await readFile(path.join(targetDir, "fixture-ticker.json"), "utf8")).toBe("old\n");
    expect(result.manifest.errors).toEqual(["fixtures: interrupted write"]);
    expect(result.stagingDir).not.toBeNull();
    expect(RefreshManifestSchema.parse(
      JSON.parse(await readFile(path.join(result.stagingDir!, "refresh-manifest.json"), "utf8"))
    ).status).toBe("failed");
  });

  it("promotes required artifacts while removing stale output from a failed optional stage", async () => {
    const root = await temporaryDirectory();
    const targetDir = path.join(root, "gw-4");
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(targetDir, "odds-report.json"), "stale\n", "utf8");
    const stages: RefreshStage[] = [
      {
        id: "required",
        required: true,
        artifacts: [{ relativePath: "required.json" }],
        run: ({ outputDir }) => writeArtifact(outputDir, "required.json", { ok: true })
      },
      {
        id: "odds",
        required: false,
        artifacts: [{ relativePath: "odds-report.json" }],
        run: async () => {
          throw new Error("source unavailable");
        }
      }
    ];

    const result = await runRefresh(baseInput(targetDir, stages));

    expect(result.promoted).toBe(true);
    await expect(readFile(path.join(targetDir, "odds-report.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(result.manifest).toMatchObject({
      status: "success",
      errors: ["odds: source unavailable"]
    });
  });

  it("replaces interrupted staging safely when the same run is retried", async () => {
    const root = await temporaryDirectory();
    const targetDir = path.join(root, "gw-4");
    const failingStage: RefreshStage = {
      id: "required",
      required: true,
      artifacts: [{ relativePath: "required.json" }],
      run: async () => {
        throw new Error("first attempt failed");
      }
    };
    const first = await runRefresh(baseInput(targetDir, [failingStage]));
    await writeFile(path.join(first.stagingDir!, "orphan.txt"), "partial\n", "utf8");
    const successfulStage: RefreshStage = {
      ...failingStage,
      run: ({ outputDir }) => writeArtifact(outputDir, "required.json", { ok: true })
    };

    const second = await runRefresh(baseInput(targetDir, [successfulStage]));

    expect(second.promoted).toBe(true);
    await expect(readFile(path.join(targetDir, "orphan.txt"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("honors the concurrency cap", async () => {
    const root = await temporaryDirectory();
    const targetDir = path.join(root, "gw-4");
    let active = 0;
    let peak = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stages: RefreshStage[] = Array.from({ length: 4 }, (_, index) => ({
      id: `stage-${index}`,
      required: true,
      artifacts: [{ relativePath: `${index}.json` }],
      run: async ({ outputDir }) => {
        active += 1;
        peak = Math.max(peak, active);

        if (peak === 2) {
          release();
        }

        await gate;
        await writeArtifact(outputDir, `${index}.json`, { index });
        active -= 1;
      }
    }));

    await runRefresh({ ...baseInput(targetDir, stages), concurrency: 2 });

    expect(peak).toBe(2);
  });

  it("treats staged artifact validation failure as a required-stage failure", async () => {
    const root = await temporaryDirectory();
    const targetDir = path.join(root, "gw-4");
    const stages: RefreshStage[] = [{
      id: "validated",
      required: true,
      artifacts: [{
        relativePath: "validated.json",
        validate: async (filePath) => {
          const value = JSON.parse(await readFile(filePath, "utf8"));

          if (value.ok !== true) {
            throw new Error("artifact is invalid");
          }
        }
      }],
      run: ({ outputDir }) => writeArtifact(outputDir, "validated.json", { ok: false })
    }];

    const result = await runRefresh(baseInput(targetDir, stages));

    expect(result.promoted).toBe(false);
    expect(result.manifest.errors).toEqual(["validated: artifact is invalid"]);
  });

  it("preserves the target when shared input publication fails", async () => {
    const root = await temporaryDirectory();
    const targetDir = path.join(root, "gw-4");
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(targetDir, "previous.txt"), "valid\n", "utf8");
    const stage: RefreshStage = {
      id: "required",
      required: true,
      artifacts: [{ relativePath: "required.json" }],
      run: ({ outputDir }) => writeArtifact(outputDir, "required.json", { ok: true })
    };

    const result = await runRefresh({
      ...baseInput(targetDir, [stage]),
      beforePromote: async () => {
        throw new Error("cache publication failed");
      }
    });

    expect(result.promoted).toBe(false);
    expect(result.manifest.errors).toContain("input-publication: cache publication failed");
    expect(await readFile(path.join(targetDir, "previous.txt"), "utf8")).toBe("valid\n");
  });
});
