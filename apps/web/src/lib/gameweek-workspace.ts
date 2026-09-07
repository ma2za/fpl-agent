import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { deriveCompetitionState, type CompetitionPhase } from "@fpl-agent/rules";

export type GameweekStatus = "missing" | "provisional" | "live" | "finalized";

type Json = Record<string, any>;

export type GameweekWorkspace = {
  gameweek: number;
  status: GameweekStatus;
  deadline: string | null;
  archived: boolean;
  recommendation: Json | null;
  decision: Json | null;
  postmortem: Json | null;
  readiness: Json | null;
  triggers: Json | null;
  regret: Json | null;
  modelVersion: string | null;
  previousModelVersion: string | null;
  sources: string[];
};

export type WorkspaceIndex = {
  phase: CompetitionPhase | "UNKNOWN";
  activeGameweek: number | null;
  currentGameweek: number | null;
  upcomingGameweek: number | null;
  latestFinalizedGameweek: number | null;
  gameweeks: GameweekWorkspace[];
  calibration: Json | null;
  playerNames: Record<number, string>;
};

function json(filePath: string) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as Json;
}

function directoryGameweeks(directory: string) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => /^gw-(\d+)$/.exec(entry.name)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);
}

function fileGameweeks(directory: string) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => /^gw-(\d+)\.json$/.exec(entry.name)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);
}

export function parseGameweek(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const gameweek = Number(value);
  return gameweek >= 1 && gameweek <= 38 ? gameweek : null;
}

export function calibrationSummary(calibration: Json | null) {
  const cohorts = Array.isArray(calibration?.cohorts) ? calibration.cohorts : [];
  const overall = cohorts.find((cohort: Json) => cohort.dimension === "overall");
  return { rows: overall?.sampleSize ?? 0, cohorts: cohorts.length };
}

export function resolveGameweekStatus(input: {
  hasPostmortem: boolean;
  hasWorkspace: boolean;
  finished: boolean;
  isCurrent: boolean;
  isNext: boolean;
  deadline: string | null;
  now: number;
}): GameweekStatus {
  if (input.hasPostmortem) return "finalized";
  if (input.isCurrent && !input.finished && input.deadline && Date.parse(input.deadline) <= input.now) return "live";
  if (input.hasWorkspace || input.isCurrent || input.isNext) return "provisional";
  return "missing";
}

export function repositoryRoot(cwd = process.cwd()) {
  const candidates = [cwd, path.resolve(cwd, "..", "..")];
  const root = candidates.find((candidate) => {
    const manifest = json(path.join(candidate, "package.json"));
    return manifest?.name === "fpl-agent";
  });
  if (!root) throw new Error(`Unable to locate fpl-agent from ${cwd}.`);
  return root;
}

function artifact(root: string, gameweek: number, name: string) {
  const archivePath = path.join(root, "data", "gameweek-archive", `gw-${gameweek}`, name);
  const currentPath = path.join(root, "packages", "content", "recommendations", `gw-${gameweek}`, name);
  if (existsSync(archivePath)) return { value: json(archivePath), source: path.relative(root, archivePath).replaceAll("\\", "/") };
  if (existsSync(currentPath)) return { value: json(currentPath), source: path.relative(root, currentPath).replaceAll("\\", "/") };
  return { value: null, source: null };
}

function projectionModelVersion(recommendation: Json | null, decision: Json | null) {
  const component = recommendation?.evidenceSnapshot?.components?.find((item: Json) => item.kind === "projection_model");
  return component?.version ?? decision?.simulation?.modelVersion ?? null;
}

export function loadWorkspace(root = repositoryRoot(), now = Date.now()): WorkspaceIndex {
  const bootstrap = json(path.join(root, "data", "raw", "bootstrap-static.json"));
  const events = (bootstrap?.events ?? []) as Json[];
  const playerNames = Object.fromEntries(((bootstrap?.elements ?? []) as Json[]).map((player) => [Number(player.id), String(player.web_name)]));
  const recommendationRoot = path.join(root, "packages", "content", "recommendations");
  const postmortemRoot = path.join(root, "packages", "content", "postmortems");
  const archiveRoot = path.join(root, "data", "gameweek-archive");
  const discovered = new Set([
    ...events.map((event) => Number(event.id)),
    ...directoryGameweeks(recommendationRoot),
    ...directoryGameweeks(archiveRoot),
    ...fileGameweeks(postmortemRoot)
  ]);
  const eventState = events.length ? deriveCompetitionState({
    events: events.map((event) => ({
      id: Number(event.id),
      deadlineTime: String(event.deadline_time),
      finished: Boolean(event.finished),
      isCurrent: Boolean(event.is_current),
      isNext: Boolean(event.is_next)
    })),
    now
  }) : null;

  const gameweeks = [...discovered].sort((a, b) => b - a).map((gameweek) => {
    const event = events.find((item) => Number(item.id) === gameweek);
    const recommendation = artifact(root, gameweek, "recommendation.json");
    const decision = artifact(root, gameweek, "decision-record.json");
    const readiness = artifact(root, gameweek, "evidence-readiness-report.json");
    const triggers = artifact(root, gameweek, "trigger-evaluation.json");
    const postmortemPath = path.join(postmortemRoot, `gw-${gameweek}.json`);
    const regretPath = path.join(archiveRoot, "regret", `gw-${gameweek}.json`);
    const postmortem = json(postmortemPath);
    const regret = json(regretPath);
    const archived = existsSync(path.join(archiveRoot, `gw-${gameweek}`, "archive-manifest.json"));
    const sources = [recommendation.source, decision.source, readiness.source, triggers.source];
    if (postmortem) sources.push(path.relative(root, postmortemPath).replaceAll("\\", "/"));
    if (regret) sources.push(path.relative(root, regretPath).replaceAll("\\", "/"));
    const hasWorkspace = Boolean(recommendation.value || decision.value || readiness.value || triggers.value || archived);
    return {
      gameweek,
      status: resolveGameweekStatus({
        hasPostmortem: Boolean(postmortem),
        hasWorkspace,
        finished: Boolean(event?.finished),
        isCurrent: Boolean(event?.is_current),
        isNext: Boolean(event?.is_next),
        deadline: event?.deadline_time ?? recommendation.value?.deadline ?? null,
        now
      }),
      deadline: event?.deadline_time ?? recommendation.value?.deadline ?? null,
      archived,
      recommendation: recommendation.value,
      decision: decision.value,
      postmortem,
      readiness: readiness.value,
      triggers: triggers.value,
      regret,
      modelVersion: projectionModelVersion(recommendation.value, decision.value),
      previousModelVersion: null,
      sources: sources.filter((source): source is string => Boolean(source))
    } satisfies GameweekWorkspace;
  });

  for (const gameweek of gameweeks) {
    const previous = gameweeks.find((item) => item.gameweek === gameweek.gameweek - 1);
    gameweek.previousModelVersion = previous?.modelVersion ?? null;
  }

  return {
    phase: eventState?.phase ?? "UNKNOWN",
    activeGameweek: eventState?.activeGameweek ?? null,
    currentGameweek: events.find((event) => event.is_current)?.id ?? null,
    upcomingGameweek: events.find((event) => event.is_next)?.id ?? null,
    latestFinalizedGameweek: gameweeks.find((gameweek) => gameweek.status === "finalized")?.gameweek ?? null,
    gameweeks,
    calibration: json(path.join(archiveRoot, "calibration", "calibration-report.json")),
    playerNames
  };
}

export function gameweekWorkspace(gameweek: number, root = repositoryRoot(), now = Date.now()) {
  return loadWorkspace(root, now).gameweeks.find((item) => item.gameweek === gameweek) ?? {
    gameweek,
    status: "missing" as const,
    deadline: null,
    archived: false,
    recommendation: null,
    decision: null,
    postmortem: null,
    readiness: null,
    triggers: null,
    regret: null,
    modelVersion: null,
    previousModelVersion: null,
    sources: []
  };
}
