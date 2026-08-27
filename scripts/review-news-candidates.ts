import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CURRENT_SQUAD } from "../config/squad";
import { CurrentRoleReportSchema, ProbabilisticProjectionArraySchema } from "../packages/agent/src";
import {
  NewsReviewDecisionSchema,
  buildEvidenceReadinessReport,
  buildNewsReviewQueue,
  buildPlayerDossier,
  latestResearchWorklist,
  openPlayerStore,
  playerIdsForRun,
  playerStoreStatus,
  recordNewsCandidateReviews,
  renderPlayerDossierMarkdown,
  renderReadinessMarkdown,
  updatePlayerStoreTransactionally
} from "../packages/player-store/src";
import { storeDiscoveryCoverage } from "./build-discovery-coverage-batch";
import { buildReviewedNewsUpdate, type ReviewedNewsDocument } from "./build-reviewed-news-update";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function rebuildEvidence(input: { gameweek: number; playerIds: number[]; generatedAt: string; storePath: string; recommendationsDir?: string }) {
  const outputDir = input.recommendationsDir ?? path.join("packages", "content", "recommendations", `gw-${input.gameweek}`);
  const [projectionValue, roleValue] = await Promise.all([
    readFile(path.join(outputDir, "probabilistic-projections.json"), "utf8").then(JSON.parse),
    readFile(path.join(outputDir, "current-role-report.json"), "utf8").then(JSON.parse)
  ]);
  const projections = ProbabilisticProjectionArraySchema.parse(projectionValue);
  const currentRole = CurrentRoleReportSchema.parse(roleValue);
  const db = openPlayerStore(input.storePath, { readonly: true });
  try {
    const latest = playerStoreStatus(db).latestRun;
    if (!latest || latest.gameweek !== input.gameweek) throw new Error(`The latest official store refresh is not GW${input.gameweek}.`);
    const dossiers = playerIdsForRun(db, latest.runId).map((playerId) => buildPlayerDossier(db, { playerId, generatedAt: input.generatedAt }));
    const roleByPlayer = new Map(currentRole.items.map((item) => [item.playerId, item]));
    const readiness = buildEvidenceReadinessReport({
      generatedAt: input.generatedAt,
      gameweek: input.gameweek,
      dossiers,
      selectedPlayerIds: CURRENT_SQUAD.players,
      projections: projections.map((projection) => ({
        playerId: projection.playerId,
        startProbability: projection.appearance.startProbability,
        appearanceProbability: projection.appearance.appearanceProbability,
        confidence: projection.appearance.overallEvidenceConfidence,
        currentRoleEvidence: roleByPlayer.get(projection.playerId)?.currentEvidencePresent ?? false
      }))
    });
    const affected = new Set(input.playerIds);
    const dossierDir = path.join(outputDir, "player-dossiers");
    await mkdir(dossierDir, { recursive: true });
    await Promise.all([
      ...dossiers.filter((dossier) => affected.has(dossier.playerId)).flatMap((dossier) => [
        writeFile(path.join(dossierDir, `${dossier.playerId}.json`), `${JSON.stringify(dossier, null, 2)}\n`, "utf8"),
        writeFile(path.join(dossierDir, `${dossier.playerId}.md`), renderPlayerDossierMarkdown(dossier), "utf8")
      ]),
      writeFile(path.join(outputDir, "player-dossier-index.json"), `${JSON.stringify({
        schemaVersion: 1,
        runId: latest.runId,
        generatedAt: input.generatedAt,
        gameweek: input.gameweek,
        players: dossiers.map((dossier) => ({
          playerId: dossier.playerId,
          dossierId: dossier.dossierId,
          snapshotId: dossier.snapshot?.snapshotId ?? null,
          performanceObservationIds: dossier.performance.map((item) => item.performanceId),
          newsObservationIds: dossier.news.map((item) => item.observationId),
          coverageId: dossier.coverage?.coverageId ?? null,
          disagreements: dossier.disagreements,
          gaps: dossier.gaps
        }))
      }, null, 2)}\n`, "utf8"),
      writeFile(path.join(outputDir, "evidence-readiness-report.json"), `${JSON.stringify(readiness, null, 2)}\n`, "utf8"),
      writeFile(path.join(outputDir, "evidence-readiness-report.md"), renderReadinessMarkdown(readiness), "utf8")
    ]);
    return readiness;
  } finally {
    db.close();
  }
}

export async function reviewNewsCandidates(input: {
  gameweek: number;
  inputPath: string;
  storePath?: string;
  recommendationsDir?: string;
}) {
  const storePath = input.storePath ?? path.join("data", "player-intelligence", "player-intelligence.sqlite");
  const value = JSON.parse(await readFile(input.inputPath, "utf8")) as {
    authoredAt: string;
    agent: string;
    decisions?: unknown[];
    documents?: ReviewedNewsDocument[];
  };
  const decisions = (value.decisions ?? []).map((decision) => NewsReviewDecisionSchema.parse(decision));
  if (decisions.some((decision) => decision.outcome === "accepted")) {
    throw new Error("Accepted reviews require a root-source document and observations in documents[].");
  }
  const db = openPlayerStore(storePath, { readonly: true });
  const worklist = latestResearchWorklist(db, input.gameweek);
  db.close();
  if (!worklist) throw new Error(`No evidence research worklist exists for GW${input.gameweek}.`);
  const recorded = decisions.length === 0 ? { inserted: 0, reviewed: 0 } : await updatePlayerStoreTransactionally(storePath, {
    appliedAt: value.authoredAt,
    update: (staged) => recordNewsCandidateReviews(staged, { worklistId: worklist.worklistId, decisions })
  });
  const documents = value.documents ?? [];
  const accepted = documents.length === 0 ? null : await buildReviewedNewsUpdate({
    gameweek: input.gameweek,
    documents,
    storePath,
    authoredAt: value.authoredAt,
    agent: value.agent,
    now: new Date(value.authoredAt)
  });
  const playerIds = [...new Set([
    ...decisions.map((decision) => decision.playerId),
    ...documents.flatMap((document) => document.observations.map((observation) => observation.playerId))
  ])];
  const reviewed = openPlayerStore(storePath, { readonly: true });
  let reviewedZeroPlayerIds: number[];
  try {
    const queue = buildNewsReviewQueue(reviewed, {
      gameweek: input.gameweek,
      generatedAt: value.authoredAt,
      includeReviewed: true
    });
    reviewedZeroPlayerIds = playerIds.filter((playerId) => {
      const items = queue.items.filter((item) => item.playerId === playerId);
      return items.length > 0 &&
        items.every((item) => item.outcome !== null && item.outcome !== "deferred") &&
        items.every((item) => item.outcome !== "accepted");
    });
  } finally {
    reviewed.close();
  }
  const coverage = reviewedZeroPlayerIds.length === 0 ? null : await storeDiscoveryCoverage({
    gameweek: input.gameweek,
    storePath,
    reviewedZeroPlayerIds,
    authoredAt: value.authoredAt
  });
  const readiness = await rebuildEvidence({
    gameweek: input.gameweek,
    playerIds,
    generatedAt: value.authoredAt,
    storePath,
    recommendationsDir: input.recommendationsDir
  });
  return { recorded, accepted, coverage, playerIds, readiness };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gameweek = Number(argValue("--gw"));
  const inputPath = argValue("--input");
  if (!Number.isInteger(gameweek) || gameweek < 1 || !inputPath) {
    console.error("Usage: pnpm evidence:review -- --gw <n> --input <review.json>");
    process.exitCode = 1;
  } else {
    reviewNewsCandidates({ gameweek, inputPath }).then((result) => {
      console.log(`Stored ${result.recorded.inserted} review decision(s), accepted ${result.accepted?.batch.observations.length ?? 0} observation(s), rebuilt ${result.playerIds.length} dossier(s).`);
    }).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  }
}
