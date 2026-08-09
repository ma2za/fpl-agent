import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { projectPlayers, type PlayerForEngine } from "../packages/engine/src";
import {
  buildEvidencePack,
  buildStrategyEvidence,
  FixtureHorizonReportSchema,
  readArtifactFileIfExists,
  RecommendationArtifactSchema,
  renderDecisionPrompts,
  renderProjectionSummary,
  renderSeasonStrategyTemplate,
  renderWeeklyStrategyTemplate,
  WeeklyStrategySchema,
  weeklyStrategyJsonTemplate,
  type DecisionContext,
  type FixtureHorizonReport
} from "../packages/agent/src";
import {
  DEFAULT_STARTING_BUDGET,
  REQUIRED_SQUAD_COUNTS,
  deriveCompetitionState,
  type DeadlineStatus
} from "../packages/rules/src";
import { CURRENT_SQUAD } from "../config/squad";
import { RISK_PROFILE } from "../config/risk-profile";

type BootstrapEvent = {
  id: number;
  name: string;
  deadline_time: string;
  is_current: boolean;
  is_next: boolean;
  finished?: boolean;
};

type BootstrapStatic = {
  events: BootstrapEvent[];
};

function argValue(name: string) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

async function readJson<T>(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, data: unknown) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readText(filePath: string) {
  return readFile(filePath, "utf8");
}

async function readTextIfExists(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function hasAuthoredRecommendation(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const recommendation = value as { status?: string; squadBefore?: { players?: unknown[] } };

  return recommendation.status !== "agent_decision_required" &&
    Array.isArray(recommendation.squadBefore?.players) &&
    recommendation.squadBefore.players.length > 0;
}

function deadlineStatus(event: BootstrapEvent | undefined, now: number): DeadlineStatus {
  if (!event) {
    return "unknown";
  }

  const deadline = Date.parse(event.deadline_time);

  if (!Number.isFinite(deadline)) {
    return "unknown";
  }

  return deadline > now ? "open" : "passed";
}

function hasLiveFplData(event: BootstrapEvent | undefined, now: number) {
  if (!event || event.finished) {
    return false;
  }

  const deadline = Date.parse(event.deadline_time);

  return Number.isFinite(deadline) && deadline > now && (event.is_next || event.is_current);
}

function resolveDataMode(input: {
  event: BootstrapEvent | undefined;
  officialModeRequested: boolean;
  provisionalModeRequested: boolean;
  now: number;
}) {
  if (input.officialModeRequested) {
    return "official";
  }

  if (input.provisionalModeRequested) {
    return "provisional";
  }

  return hasLiveFplData(input.event, input.now) ? "official" : "provisional";
}

function resolveGameweek(events: BootstrapEvent[], requested: string) {
  if (requested !== "auto") {
    return Number(requested);
  }

  const nextEvent = events.find((event) => event.is_next);

  if (nextEvent) {
    return nextEvent.id;
  }

  const currentUnfinished = events.find((event) => event.is_current && !event.finished);

  if (currentUnfinished) {
    return currentUnfinished.id;
  }

  return events[0]?.id ?? 1;
}

function renderDecisionBrief(input: {
  gameweek: number;
  event: BootstrapEvent | undefined;
  deadlineStatus: DeadlineStatus;
  dataMode: "official" | "provisional";
  competitionState: DecisionContext["competitionState"];
  notes: DecisionContext["notes"];
}) {
  return `# FPL Agent Decision Brief: GW${input.gameweek}

## Status

Data mode: ${input.dataMode}

Deadline: ${input.event?.deadline_time ?? "unknown"}

Deadline status: ${input.deadlineStatus}

Competition phase: ${input.competitionState.phase}

Valid actions: ${input.competitionState.phase === "PRESEASON_DRAFT"
    ? "retain_draft, modify_draft, rebuild_structure, wait_for_information, lock_draft"
    : "See recommendation-template.json"}

Manual squad configured: ${CURRENT_SQUAD.players.length === 15}

## Decision Boundary

No script has selected a squad, starting XI, captain, vice-captain, bench order, transfer, or chip.

The coding agent must read the evidence files, reason from current public information, and author the final recommendation manually.

## Evidence Files

- data-status.json
- evidence-report.json
- evidence-report.md
- team-news-report.json
- team-news-report.md
- current-role-report.json
- current-role-report.md
- adapter-coverage-report.json
- player-pool.json
- projections.json
- projection-summary.md
- budget-tiers.json
- club-exposure.json
- decision-prompts.md
- strategy-evidence.json
- recommendation-template.json
- packages/content/strategy/season-plan.md
- packages/content/strategy/weekly/gw-${input.gameweek}.md
- packages/content/strategy/weekly/gw-${input.gameweek}.json

## Required Agent Work

- Confirm whether official 2026/27 FPL data is live.
- Confirm player prices, positions, clubs, availability, and GW1 fixtures from current sources.
- Select a legal 15-player squad within £${DEFAULT_STARTING_BUDGET.toFixed(1)}m.
- Cite evidence for every squad, shortlist, starting XI, captaincy, bench, chip, risk, and change-condition decision.
- Fill evidenceReferences with source, reportPath, note, and relevant player IDs where applicable.
- Fill claimLedger v3 with explicit OBSERVATION, DERIVED_FACT, ASSUMPTION, FORECAST, and DECISION kinds; list every authored decision in decisionIds.
- Give every forecast its model, model version, input facts, input assumptions, output value, uncertainty, and horizon.
- Keep evaluative or causal interpretation out of observations and derived facts, and use only phase-relevant warnings.
- Treat generated reports as transformations of their originating observations, not as independent corroborating sources.
- Fill decisionAnalysis with why every selected player was picked, why named alternatives were rejected, captaincy comparisons, key omissions, and evidence paths.
- Keep exactly ${REQUIRED_SQUAD_COUNTS.GKP} GKP, ${REQUIRED_SQUAD_COUNTS.DEF} DEF, ${REQUIRED_SQUAD_COUNTS.MID} MID, and ${REQUIRED_SQUAD_COUNTS.FWD} FWD.
- Keep no more than 3 players from one club.
- Choose starting XI, captain, vice-captain, bench order, and chip.
- Run verification after writing final recommendation files.

## Hard Stop

Do not treat stale public API data as official 2026/27 GW1 data.

## Context Notes Loaded

- Fixtures notes: ${input.notes.fixtures.trim().length > 0}
- Team news notes: ${input.notes.teamNews.trim().length > 0}
- Set-piece notes: ${input.notes.setPieces.trim().length > 0}
- Watchlist notes: ${input.notes.watchlist.trim().length > 0}
- Strategy notes: ${input.notes.strategy.trim().length > 0}
- Strategy evidence notes: ${input.notes.strategyEvidence.trim().length > 0}
`;
}

function renderManualChecklistPlaceholder(gameweek: number) {
  return `# FPL Agent Manual Checklist: GW${gameweek}

No manual checklist has been generated.

Reason: scripts are not allowed to select players. A coding agent must author the recommendation after reviewing current evidence and public FPL context.
`;
}

export async function generateRecommendationEvidence(input: {
  requestedGameweek?: string;
  players?: PlayerForEngine[];
  bootstrap?: BootstrapStatic;
  outputDir?: string;
  generatedAt?: string;
  now?: number;
  officialModeRequested?: boolean;
  provisionalModeRequested?: boolean;
  deadlineStatus?: DeadlineStatus;
  fixtureHorizonReport?: FixtureHorizonReport | null;
  writeStrategyTemplates?: boolean;
  log?: boolean;
} = {}) {
  const requestedGameweek = input.requestedGameweek ?? "auto";
  const players = input.players ?? await readJson<PlayerForEngine[]>(path.join("data", "processed", "players.json"));
  const bootstrap = input.bootstrap ?? await readJson<BootstrapStatic>(path.join("data", "raw", "bootstrap-static.json"));
  const gameweek = resolveGameweek(bootstrap.events, requestedGameweek);
  const event = bootstrap.events.find((item) => item.id === gameweek);
  const now = input.now ?? Date.now();
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const officialModeRequested = input.officialModeRequested ?? false;
  const provisionalModeRequested = input.provisionalModeRequested ?? false;
  const dataMode = resolveDataMode({
    event,
    officialModeRequested,
    provisionalModeRequested,
    now
  });
  const realDeadlineStatus = input.deadlineStatus ?? deadlineStatus(event, now);
  const effectiveDeadlineStatus = dataMode === "provisional" ? "unknown" : realDeadlineStatus;
  const competitionState = deriveCompetitionState({
    events: bootstrap.events.map((item) => ({
      id: item.id,
      deadlineTime: item.deadline_time,
      finished: item.finished ?? false,
      isCurrent: item.is_current,
      isNext: item.is_next
    })),
    now
  });
  const projections = projectPlayers(players);
  const outputDir = input.outputDir ?? path.join("packages", "content", "recommendations", `gw-${gameweek}`);
  const fixtureHorizonReport = input.fixtureHorizonReport ?? await readArtifactFileIfExists(
    path.join(outputDir, "fixture-horizon-report.json"),
    FixtureHorizonReportSchema
  );
  const strategyDir = path.join("packages", "content", "strategy");
  const weeklyStrategyDir = path.join(strategyDir, "weekly");
  const seasonPlanPath = path.join(strategyDir, "season-plan.md");
  const weeklyStrategyMarkdownPath = path.join(weeklyStrategyDir, `gw-${gameweek}.md`);
  const weeklyStrategyJsonPath = path.join(weeklyStrategyDir, `gw-${gameweek}.json`);
  const recommendationPath = path.join(outputDir, "recommendation.json");
  const existingRecommendation = await readArtifactFileIfExists(
    recommendationPath,
    RecommendationArtifactSchema
  );
  const authoredRecommendationExists = hasAuthoredRecommendation(existingRecommendation);
  const existingSeasonPlan = await readTextIfExists(seasonPlanPath);
  const existingWeeklyStrategy = await readArtifactFileIfExists(
    weeklyStrategyJsonPath,
    WeeklyStrategySchema
  );
  const notes = {
    fixtures: await readText(path.join("packages", "content", "context", "fixtures.md")),
    teamNews: await readText(path.join("packages", "content", "context", "team-news.md")),
    setPieces: await readText(path.join("packages", "content", "context", "set-pieces.md")),
    watchlist: await readText(path.join("packages", "content", "context", "watchlist.md")),
    strategy: await readText(path.join("packages", "content", "context", "strategy.md")),
    strategyEvidence: await readText(path.join("packages", "content", "context", "strategy-evidence.md"))
  };
  const evidencePack = buildEvidencePack({
    gameweek,
    createdAt: generatedAt,
    dataMode,
    deadline: event?.deadline_time ?? "unknown",
    deadlineStatus: effectiveDeadlineStatus,
    competitionState,
    manualSquadConfigured: CURRENT_SQUAD.players.length === 15,
    currentSquadPlayerIds: CURRENT_SQUAD.players,
    riskProfile: RISK_PROFILE,
    notes,
    warnings: [
      dataMode === "provisional"
        ? "Public FPL data may be stale. The agent must verify current season data before selecting players."
        : "Official FPL data appears current. The agent must still verify team news before selecting players."
    ],
    players,
    projections,
    freeTransfers: CURRENT_SQUAD.freeTransfers,
    chipsAvailable: CURRENT_SQUAD.chipsAvailable
  });
  const strategyEvidence = buildStrategyEvidence({
    evidencePack,
    seasonPlanExists: existingSeasonPlan !== null,
    weeklyStrategyExists: existingWeeklyStrategy !== null,
    fixtureHorizonReport
  });

  await mkdir(outputDir, { recursive: true });
  await mkdir(weeklyStrategyDir, { recursive: true });
  if (existingSeasonPlan === null && (input.writeStrategyTemplates ?? true)) {
    await writeFile(seasonPlanPath, renderSeasonStrategyTemplate(), "utf8");
  }
  if (existingWeeklyStrategy === null && (input.writeStrategyTemplates ?? true)) {
    await writeJson(weeklyStrategyJsonPath, weeklyStrategyJsonTemplate(gameweek));
    await writeFile(weeklyStrategyMarkdownPath, renderWeeklyStrategyTemplate(strategyEvidence), "utf8");
  }
  await writeJson(path.join(outputDir, "data-status.json"), {
    ...evidencePack.context,
    event: event ?? null,
    officialModeRequested,
    provisionalModeRequested,
    dataModeInferredFromLiveFplData: !officialModeRequested && !provisionalModeRequested && dataMode === "official"
  });
  await writeJson(path.join(outputDir, "projections.json"), evidencePack.projections);
  await writeJson(path.join(outputDir, "player-pool.json"), evidencePack.playerPool);
  await writeJson(path.join(outputDir, "budget-tiers.json"), evidencePack.budgetTiers);
  await writeJson(path.join(outputDir, "club-exposure.json"), evidencePack.clubExposure);
  await writeJson(path.join(outputDir, "strategy-evidence.json"), strategyEvidence);
  await writeJson(path.join(outputDir, "recommendation-template.json"), evidencePack.recommendationTemplate);
  await writeFile(path.join(outputDir, "projection-summary.md"), renderProjectionSummary(evidencePack), "utf8");
  await writeFile(path.join(outputDir, "decision-prompts.md"), renderDecisionPrompts(evidencePack, fixtureHorizonReport), "utf8");

  if (!authoredRecommendationExists) {
    await writeJson(recommendationPath, evidencePack.recommendationTemplate);
    await writeJson(path.join(outputDir, "captain-candidates.json"), []);
    await writeJson(path.join(outputDir, "transfer-candidates.json"), []);
    await writeJson(path.join(outputDir, "legality-report.json"), {
      isValid: false,
      errors: ["Final recommendation has not been authored by the coding agent."],
      warnings: ["Evidence pack only. No script-selected players are present."]
    });
    await writeFile(
      path.join(outputDir, "agent-brief.md"),
      renderDecisionBrief({
        gameweek,
        event,
        deadlineStatus: effectiveDeadlineStatus,
        dataMode,
        competitionState,
        notes
      }),
      "utf8"
    );
    await writeFile(path.join(outputDir, "manual-checklist.md"), renderManualChecklistPlaceholder(gameweek), "utf8");
  }

  if (input.log ?? true) {
    console.log(`Wrote decision evidence to ${outputDir}`);
    console.log(
      authoredRecommendationExists
        ? "Existing agent-authored recommendation was preserved."
        : "No players were selected by script. The coding agent must author the final recommendation."
    );
  }

  return { gameweek, outputDir, event, deadlineStatus: effectiveDeadlineStatus, dataMode };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateRecommendationEvidence({
    requestedGameweek: argValue("--gw") ?? "auto",
    officialModeRequested: process.argv.includes("--official"),
    provisionalModeRequested: process.argv.includes("--provisional")
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
