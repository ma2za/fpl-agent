import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CurrentRoleReportSchema, ProbabilisticProjectionArraySchema, RefreshManifestSchema } from "../packages/agent/src";
import {
  EvidenceReadinessReportSchema,
  GameweekArchiveManifestSchema,
  assertPreDeadlineArtifact,
  contentHash,
  recordGameweekArchive,
  stableId,
  updatePlayerStoreTransactionally
} from "../packages/player-store/src";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function filesUnder(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const item = path.join(current, entry.name);
    return entry.isDirectory() ? filesUnder(root, item) : Promise.resolve([path.relative(root, item).replaceAll("\\", "/")]);
  }));
  return files.flat().sort();
}

function artifactKind(filePath: string) {
  const name = filePath.toLowerCase();
  if (name.includes("projection")) return "projection" as const;
  if (name.includes("trigger")) return "trigger" as const;
  if (name.includes("simulation") || name.includes("concentration") || name.includes("distribution")) return "scenario" as const;
  if (name.includes("candidate") || name.includes("counterfactual") || name.includes("player-pool")) return "candidate" as const;
  if (name.includes("decision") || name.includes("recommendation")) return "decision" as const;
  if (name.includes("evidence") || name.includes("dossier") || name.includes("news") || name.includes("role")) return "observation" as const;
  if (name.includes("strategy") || name.includes("assumption")) return "assumption" as const;
  return "supporting" as const;
}

export async function freezeGameweekArchive(input: {
  gameweek: number;
  sourceDir?: string;
  archiveDir?: string;
  storePath?: string;
  frozenAt?: string;
}) {
  const sourceDir = input.sourceDir ?? path.join("packages", "content", "recommendations", `gw-${input.gameweek}`);
  const archiveDir = input.archiveDir ?? path.join("data", "gameweek-archive", `gw-${input.gameweek}`);
  const storePath = input.storePath ?? path.join("data", "player-intelligence", "player-intelligence.sqlite");
  const frozenAt = input.frozenAt ?? new Date().toISOString();
  const existingManifestPath = path.join(archiveDir, "archive-manifest.json");
  try {
    const existing = GameweekArchiveManifestSchema.parse(JSON.parse(await readFile(existingManifestPath, "utf8")));
    for (const artifact of existing.artifacts) {
      const bytes = await readFile(path.join(archiveDir, artifact.path));
      if (contentHash(bytes) !== artifact.contentHash) throw new Error(`Frozen artifact changed: ${artifact.path}.`);
      assertPreDeadlineArtifact(artifact.path, bytes, existing.deadline);
    }
    const stored = await updatePlayerStoreTransactionally(storePath, { appliedAt: frozenAt, update: (db) => recordGameweekArchive(db, existing) });
    return { manifest: existing, inserted: stored.inserted, reused: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const [refresh, projections, readiness, role] = await Promise.all([
    readFile(path.join(sourceDir, "refresh-manifest.json"), "utf8").then((value) => RefreshManifestSchema.parse(JSON.parse(value))),
    readFile(path.join(sourceDir, "probabilistic-projections.json"), "utf8").then((value) => ProbabilisticProjectionArraySchema.parse(JSON.parse(value))),
    readFile(path.join(sourceDir, "evidence-readiness-report.json"), "utf8").then((value) => EvidenceReadinessReportSchema.parse(JSON.parse(value))),
    readFile(path.join(sourceDir, "current-role-report.json"), "utf8").then((value) => CurrentRoleReportSchema.parse(JSON.parse(value)))
  ]);
  if (refresh.gameweek !== input.gameweek || readiness.gameweek !== input.gameweek || role.gameweek !== input.gameweek) throw new Error("Archive inputs do not agree on gameweek.");
  if (!refresh.deadline.time) throw new Error("Archive requires a known deadline.");
  const readinessByPlayer = new Map(readiness.items.map((item) => [item.playerId, item]));
  const roleByPlayer = new Map(role.items.map((item) => [item.playerId, item]));
  const adapterVersions = new Map<number, Set<string>>();
  for (const observation of role.observations) {
    adapterVersions.set(observation.playerId, (adapterVersions.get(observation.playerId) ?? new Set()).add(observation.adapterVersion));
  }
  const forecasts = projections.map((projection) => {
    const readinessItem = readinessByPlayer.get(projection.playerId);
    const roleItem = roleByPlayer.get(projection.playerId);
    return {
      playerId: projection.playerId,
      position: projection.inputs.position,
      projectedPoints: projection.roleAdjustedProjection,
      expectedMinutes: projection.minutes.expectedMinutes,
      startProbability: projection.appearance.startProbability,
      appearanceProbability: projection.appearance.appearanceProbability,
      p10: projection.p10,
      p90: projection.p90,
      startProbabilityInterval: projection.appearance.startProbabilityInterval ?? null,
      roleEvidenceState: roleItem?.disagreement ? "conflicting" as const
        : roleItem?.currentEvidencePresent ? "current" as const
        : projection.appearance.source === "historical_role" ? "historical_only" as const : "missing" as const,
      sourceCoverage: readinessItem?.currentResearchCoverage ? "complete" as const : "incomplete" as const,
      adapterVersion: [...(adapterVersions.get(projection.playerId) ?? new Set(["none"]))].sort().join("+"),
      modelVersion: projection.modelVersion
    };
  });
  const paths = (await filesUnder(sourceDir)).filter((filePath) => filePath !== "archive-manifest.json");
  const artifacts = await Promise.all(paths.map(async (filePath) => {
    const bytes = await readFile(path.join(sourceDir, filePath));
    assertPreDeadlineArtifact(filePath, bytes, refresh.deadline.time!);
    return { path: filePath, kind: artifactKind(filePath), contentHash: contentHash(bytes), sizeBytes: bytes.length, bytes };
  }));
  const core = {
    gameweek: input.gameweek,
    deadline: new Date(refresh.deadline.time).toISOString(),
    artifacts: artifacts.map(({ bytes: _bytes, ...artifact }) => artifact),
    forecasts
  };
  const manifest = GameweekArchiveManifestSchema.parse({
    schemaVersion: 1,
    archiveId: stableId("archive", core),
    ...core,
    frozenAt,
    sourceGeneratedAt: refresh.startedAt
  });
  await Promise.all(artifacts.map(async (artifact) => {
    const destination = path.join(archiveDir, artifact.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, artifact.bytes);
  }));
  await mkdir(archiveDir, { recursive: true });
  await writeFile(existingManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const stored = await updatePlayerStoreTransactionally(storePath, { appliedAt: frozenAt, update: (db) => recordGameweekArchive(db, manifest) });
  return { manifest, inserted: stored.inserted, reused: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gameweek = Number(argValue("--gw"));
  if (!Number.isInteger(gameweek) || gameweek < 1) {
    console.error("Usage: pnpm archive:freeze -- --gw <n>");
    process.exitCode = 1;
  } else {
    freezeGameweekArchive({ gameweek }).then((result) => {
      console.log(`GW${gameweek} archive ${result.reused ? "verified" : "frozen"}: ${result.manifest.artifacts.length} artifacts, ${result.manifest.forecasts.length} forecasts.`);
    }).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
  }
}
