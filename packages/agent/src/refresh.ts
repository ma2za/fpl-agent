import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { z } from "zod";

export type RefreshMode = "live" | "offline";
export type RefreshDeadlineStatus = "open" | "passed" | "unknown";

export type RefreshInput = {
  id: string;
  path: string;
  sourceMode: RefreshMode;
  sha256: string;
  fetchedAt: string;
  ageHours: number;
  freshness: "fresh" | "stale";
};

export type RefreshArtifact = {
  relativePath: string;
  validate?: (filePath: string) => Promise<void>;
};

export type RefreshStage = {
  id: string;
  required: boolean;
  phase?: number;
  artifacts: RefreshArtifact[];
  run: (context: { outputDir: string; signal: AbortSignal }) => Promise<void>;
};

export type RefreshManifest = z.infer<typeof RefreshManifestSchema>;

const RefreshInputSchema = z.object({
  id: z.string(),
  path: z.string(),
  sourceMode: z.enum(["live", "offline"]),
  sha256: z.string(),
  fetchedAt: z.string(),
  ageHours: z.number(),
  freshness: z.enum(["fresh", "stale"])
});

const RefreshStageResultSchema = z.object({
  id: z.string(),
  required: z.boolean(),
  status: z.enum(["success", "failed"]),
  durationMs: z.number(),
  artifactPaths: z.array(z.string()),
  error: z.string().nullable()
});

export const RefreshManifestSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(),
  gameweek: z.number().int().positive(),
  mode: z.enum(["live", "offline"]),
  status: z.enum(["success", "failed"]),
  startedAt: z.string(),
  endedAt: z.string(),
  durationMs: z.number(),
  concurrency: z.number().int().positive(),
  deadline: z.object({
    status: z.enum(["open", "passed", "unknown"]),
    time: z.string().nullable()
  }),
  inputs: z.array(RefreshInputSchema),
  stages: z.array(RefreshStageResultSchema),
  artifacts: z.array(z.object({ relativePath: z.string(), sha256: z.string() })),
  errors: z.array(z.string())
});

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function hashFile(filePath: string) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  const temporaryPath = `${filePath}.tmp`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  operation: (item: T) => Promise<void>
) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await operation(item);
    }
  });

  await Promise.all(workers);
}

async function promoteDirectory(stagingDir: string, targetDir: string, backupDir: string) {
  const targetExists = await exists(targetDir);

  if (targetExists) {
    await rename(targetDir, backupDir);
  }

  try {
    await rename(stagingDir, targetDir);
  } catch (error) {
    if (targetExists) {
      await rename(backupDir, targetDir);
    }

    throw error;
  }

  if (targetExists) {
    await rm(backupDir, { recursive: true, force: true });
  }
}

export async function runRefresh(input: {
  gameweek: number;
  mode: RefreshMode;
  targetDir: string;
  stages: RefreshStage[];
  inputs: RefreshInput[];
  deadline: { status: RefreshDeadlineStatus; time: string | null };
  concurrency?: number;
  runId?: string;
  now?: () => Date;
  timer?: () => number;
  beforePromote?: () => Promise<void>;
}) {
  const concurrency = input.concurrency ?? 3;

  if (!Number.isInteger(input.gameweek) || input.gameweek < 1) {
    throw new Error("Refresh gameweek must be a positive integer.");
  }

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Refresh concurrency must be a positive integer.");
  }

  const now = input.now ?? (() => new Date());
  const timer = input.timer ?? (() => performance.now());
  const runId = input.runId ?? `${now().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;

  if (!/^[A-Za-z0-9_-]+$/.test(runId)) {
    throw new Error("Refresh run ID may contain only letters, numbers, underscores, and hyphens.");
  }

  if (path.basename(input.targetDir) !== `gw-${input.gameweek}`) {
    throw new Error(`Refresh target must end with gw-${input.gameweek}.`);
  }

  const parentDir = path.dirname(input.targetDir);
  const targetName = path.basename(input.targetDir);
  const stagingDir = path.join(parentDir, `.refresh-${targetName}-${runId}`);
  const backupDir = path.join(parentDir, `.refresh-backup-${targetName}-${runId}`);
  const startedAt = now().toISOString();
  const startedTimer = timer();
  const stageResults: RefreshManifest["stages"] = [];
  const artifactHashes = new Map<string, string>();

  await rm(stagingDir, { recursive: true, force: true });
  await rm(backupDir, { recursive: true, force: true });
  await mkdir(parentDir, { recursive: true });

  if (await exists(input.targetDir)) {
    await cp(input.targetDir, stagingDir, { recursive: true });
  } else {
    await mkdir(stagingDir, { recursive: true });
  }

  const phases = [...new Set(input.stages.map((stage) => stage.phase ?? 0))].sort((a, b) => a - b);

  for (const phase of phases) {
    const stages = input.stages.filter((stage) => (stage.phase ?? 0) === phase);

    await runWithConcurrency(stages, concurrency, async (stage) => {
      const stageStarted = timer();
      const artifactPaths = stage.artifacts.map((artifact) => artifact.relativePath);

      try {
        await stage.run({ outputDir: stagingDir, signal: new AbortController().signal });

        for (const artifact of stage.artifacts) {
          const filePath = path.join(stagingDir, artifact.relativePath);

          if (!await exists(filePath)) {
            throw new Error(`Stage ${stage.id} did not create ${artifact.relativePath}.`);
          }

          await artifact.validate?.(filePath);
          artifactHashes.set(artifact.relativePath, await hashFile(filePath));
        }

        stageResults.push({
          id: stage.id,
          required: stage.required,
          status: "success",
          durationMs: Number((timer() - stageStarted).toFixed(3)),
          artifactPaths,
          error: null
        });
      } catch (error) {
        for (const artifact of stage.artifacts) {
          artifactHashes.delete(artifact.relativePath);
          await rm(path.join(stagingDir, artifact.relativePath), { force: true });
        }

        stageResults.push({
          id: stage.id,
          required: stage.required,
          status: "failed",
          durationMs: Number((timer() - stageStarted).toFixed(3)),
          artifactPaths,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
  }

  const orderedStageResults = input.stages.map((stage) => stageResults.find((result) => result.id === stage.id)!);
  const errors = orderedStageResults
    .filter((stage) => stage.status === "failed")
    .map((stage) => `${stage.id}: ${stage.error}`);
  const requiredFailure = orderedStageResults.some((stage) => stage.required && stage.status === "failed");
  const manifest: RefreshManifest = {
    schemaVersion: 1,
    runId,
    gameweek: input.gameweek,
    mode: input.mode,
    status: requiredFailure ? "failed" : "success",
    startedAt,
    endedAt: now().toISOString(),
    durationMs: Number((timer() - startedTimer).toFixed(3)),
    concurrency,
    deadline: input.deadline,
    inputs: [...input.inputs].sort((a, b) => a.id.localeCompare(b.id)),
    stages: orderedStageResults,
    artifacts: [...artifactHashes]
      .map(([relativePath, sha256]) => ({ relativePath, sha256 }))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    errors
  };

  RefreshManifestSchema.parse(manifest);
  await writeJsonAtomic(path.join(stagingDir, "refresh-manifest.json"), manifest);

  if (requiredFailure) {
    return { manifest, promoted: false, stagingDir };
  }

  try {
    await input.beforePromote?.();
  } catch (error) {
    const message = `input-publication: ${error instanceof Error ? error.message : String(error)}`;
    manifest.status = "failed";
    manifest.errors.push(message);
    manifest.endedAt = now().toISOString();
    manifest.durationMs = Number((timer() - startedTimer).toFixed(3));
    await writeJsonAtomic(path.join(stagingDir, "refresh-manifest.json"), manifest);
    return { manifest, promoted: false, stagingDir };
  }

  await promoteDirectory(stagingDir, input.targetDir, backupDir);

  return { manifest, promoted: true, stagingDir: null };
}
