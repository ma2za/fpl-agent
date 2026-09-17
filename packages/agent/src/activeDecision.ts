import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/);

export const ActiveDecisionManifestSchema = z.object({
  schemaVersion: z.literal(1),
  gameweek: z.number().int().min(1).max(38),
  updatedAt: z.string().datetime(),
  status: z.enum(["selected", "submitted", "superseded", "archived"]),
  submissionStatus: z.enum(["unconfirmed", "confirmed"]),
  variant: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  selectedCandidateId: z.string().min(1),
  recommendationPath: z.string().min(1),
  recommendationSha256: hash,
  decisionRecordPath: z.string().min(1),
  decisionRecordSha256: hash,
  deadline: z.string().datetime(),
  archiveState: z.enum(["not_archived", "archived", "earlier_immutable_variant"]),
  supersedes: z.object({
    variant: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    selectedCandidateId: z.string().min(1),
    recommendationSha256: hash,
    decisionRecordSha256: hash,
    status: z.enum(["selected", "submitted", "superseded", "archived"]),
    submissionStatus: z.enum(["unconfirmed", "confirmed"]),
    reason: z.string().min(1),
    supersededAt: z.string().datetime()
  }).strict().nullable().optional(),
  submissionEvidence: z.object({
    source: z.enum(["manager_confirmation", "public_fpl_api"]),
    confirmedAt: z.string().datetime(),
    reference: z.string().min(1)
  }).strict().nullable().optional(),
  notes: z.array(z.string())
}).strict().superRefine((manifest, context) => {
  if (manifest.submissionStatus === "confirmed" && !manifest.submissionEvidence) {
    context.addIssue({ code: "custom", message: "Confirmed submission requires submission evidence." });
  }
  if (manifest.submissionStatus === "unconfirmed" && manifest.submissionEvidence) {
    context.addIssue({ code: "custom", message: "Unconfirmed submission cannot contain submission evidence." });
  }
  if (manifest.status === "submitted" && manifest.submissionStatus !== "confirmed") {
    context.addIssue({ code: "custom", message: "Submitted decision requires confirmed submission." });
  }
});

export type ActiveDecisionManifest = z.infer<typeof ActiveDecisionManifestSchema>;

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function localReference(sourceDir: string, gameweek: number, logicalPath: string) {
  const normalized = logicalPath.replaceAll("\\", "/");
  const prefix = `packages/content/recommendations/gw-${gameweek}/`;
  if (!normalized.startsWith(prefix)) {
    throw new Error(`Active decision reference must stay inside ${prefix}.`);
  }
  const relativePath = normalized.slice(prefix.length);
  const resolvedRoot = path.resolve(sourceDir);
  const resolved = path.resolve(sourceDir, relativePath);
  if (!relativePath || !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Active decision reference escapes its gameweek workspace.");
  }
  return resolved;
}

async function readReferencedJson(sourceDir: string, gameweek: number, logicalPath: string) {
  const bytes = await readFile(localReference(sourceDir, gameweek, logicalPath));
  return { bytes, value: JSON.parse(bytes.toString("utf8")) as Record<string, unknown> };
}

export async function validateActiveDecisionManifest(
  sourceDir: string,
  expectedGameweek: number,
  expectedDeadline?: string | null
) {
  const manifest = ActiveDecisionManifestSchema.parse(JSON.parse(
    await readFile(path.join(sourceDir, "active-decision.json"), "utf8")
  ));
  if (manifest.gameweek !== expectedGameweek) throw new Error("Active decision gameweek does not match the workspace.");
  if (expectedDeadline && Date.parse(manifest.deadline) !== Date.parse(expectedDeadline)) {
    throw new Error("Active decision deadline does not match the refresh deadline.");
  }
  const variantSegment = `/variants/${manifest.variant}/`;
  if (!manifest.recommendationPath.replaceAll("\\", "/").includes(variantSegment) ||
      !manifest.decisionRecordPath.replaceAll("\\", "/").includes(variantSegment)) {
    throw new Error("Active decision variant does not match its referenced paths.");
  }
  const [recommendation, decisionRecord] = await Promise.all([
    readReferencedJson(sourceDir, manifest.gameweek, manifest.recommendationPath),
    readReferencedJson(sourceDir, manifest.gameweek, manifest.decisionRecordPath)
  ]);
  if (sha256(recommendation.bytes) !== manifest.recommendationSha256) {
    throw new Error("Active decision recommendation hash does not match.");
  }
  if (sha256(decisionRecord.bytes) !== manifest.decisionRecordSha256) {
    throw new Error("Active decision record hash does not match.");
  }
  if (recommendation.value.artifactKind !== "agent_decision" || recommendation.value.gameweek !== manifest.gameweek) {
    throw new Error("Active decision recommendation is not an authored decision for this gameweek.");
  }
  if (recommendation.value.deadline !== manifest.deadline) {
    throw new Error("Active decision recommendation deadline does not match the manifest.");
  }
  if (decisionRecord.value.artifactKind !== "agent_decision" || decisionRecord.value.gameweek !== manifest.gameweek ||
      decisionRecord.value.selectedCandidateId !== manifest.selectedCandidateId) {
    throw new Error("Active decision record does not match the selected candidate and gameweek.");
  }
  const evaluations = Array.isArray(recommendation.value.decisionEvaluations)
    ? recommendation.value.decisionEvaluations as Array<Record<string, unknown>>
    : [];
  if (!evaluations.some((evaluation) => evaluation.selectedCandidateId === manifest.selectedCandidateId)) {
    throw new Error("Active decision candidate is not selected by the authored recommendation.");
  }
  return manifest;
}

export async function validateActiveDecisionManifestIfPresent(
  sourceDir: string,
  expectedGameweek: number,
  expectedDeadline?: string | null
) {
  try {
    return await validateActiveDecisionManifest(sourceDir, expectedGameweek, expectedDeadline);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeManifest(filePath: string, manifest: ActiveDecisionManifest) {
  const temporaryPath = `${filePath}.tmp`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

export async function promoteActiveDecision(input: {
  sourceDir: string;
  gameweek: number;
  variant: string;
  updatedAt: string;
  archiveState?: ActiveDecisionManifest["archiveState"];
  notes?: string[];
  supersessionReason?: string;
}) {
  let existing: ActiveDecisionManifest | undefined;
  const activeDecisionPath = path.join(input.sourceDir, "active-decision.json");
  let hasActiveDecision = false;
  try {
    await readFile(activeDecisionPath);
    hasActiveDecision = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (hasActiveDecision) {
    existing = await validateActiveDecisionManifest(input.sourceDir, input.gameweek);
  }
  const prefix = `packages/content/recommendations/gw-${input.gameweek}`;
  const recommendationPath = `${prefix}/variants/${input.variant}/recommendation.json`;
  const decisionRecordPath = `${prefix}/variants/${input.variant}/decision-record.json`;
  const [recommendation, decisionRecord] = await Promise.all([
    readReferencedJson(input.sourceDir, input.gameweek, recommendationPath),
    readReferencedJson(input.sourceDir, input.gameweek, decisionRecordPath)
  ]);
  const deadline = String(recommendation.value.deadline ?? "");
  const recommendationSha256 = sha256(recommendation.bytes);
  const decisionRecordSha256 = sha256(decisionRecord.bytes);
  const selectedCandidateId = String(decisionRecord.value.selectedCandidateId ?? "");
  const sameDecision = existing?.variant === input.variant &&
    existing.selectedCandidateId === selectedCandidateId &&
    existing.recommendationSha256 === recommendationSha256 &&
    existing.decisionRecordSha256 === decisionRecordSha256;
  if (existing && !sameDecision && !input.supersessionReason?.trim()) {
    throw new Error(`Active decision ${existing.variant}/${existing.selectedCandidateId} requires an explicit supersession reason before replacement.`);
  }
  const manifest = ActiveDecisionManifestSchema.parse({
    schemaVersion: 1,
    gameweek: input.gameweek,
    updatedAt: input.updatedAt,
    status: sameDecision ? existing!.status : "selected",
    submissionStatus: sameDecision ? existing!.submissionStatus : "unconfirmed",
    variant: input.variant,
    selectedCandidateId,
    recommendationPath,
    recommendationSha256,
    decisionRecordPath,
    decisionRecordSha256,
    deadline,
    archiveState: input.archiveState ?? existing?.archiveState ?? "not_archived",
    supersedes: sameDecision
      ? existing!.supersedes ?? null
      : existing
        ? {
            variant: existing.variant,
            selectedCandidateId: existing.selectedCandidateId,
            recommendationSha256: existing.recommendationSha256,
            decisionRecordSha256: existing.decisionRecordSha256,
            status: existing.status,
            submissionStatus: existing.submissionStatus,
            reason: input.supersessionReason!.trim(),
            supersededAt: input.updatedAt
          }
        : null,
    submissionEvidence: sameDecision ? existing!.submissionEvidence ?? null : null,
    notes: input.notes ?? (sameDecision ? existing!.notes : [])
  });
  await writeManifest(activeDecisionPath, manifest);
  return validateActiveDecisionManifest(input.sourceDir, input.gameweek, deadline);
}

export async function confirmActiveDecisionSubmission(input: {
  sourceDir: string;
  gameweek: number;
  confirmedAt: string;
  source: "manager_confirmation" | "public_fpl_api";
  reference: string;
}) {
  const current = await validateActiveDecisionManifest(input.sourceDir, input.gameweek);
  const manifest = ActiveDecisionManifestSchema.parse({
    ...current,
    updatedAt: input.confirmedAt,
    status: "submitted",
    submissionStatus: "confirmed",
    submissionEvidence: {
      source: input.source,
      confirmedAt: input.confirmedAt,
      reference: input.reference
    }
  });
  await writeManifest(path.join(input.sourceDir, "active-decision.json"), manifest);
  return manifest;
}
