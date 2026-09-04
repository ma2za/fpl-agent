import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildProjectionUncertaintyReport,
  projectPlayers,
  rankCaptainCandidates,
  renderProjectionUncertaintyMarkdown,
  roleAdjustedPlayerProjections,
  type ConditionalAppearanceSample,
  type MarketPlayerProjectionInput,
  type PlayerForEngine,
  type ProbabilisticProjection,
  type ProjectionContext
} from "../packages/engine/src";
import {
  buildEvidencePack,
  buildSquadDecisionRecord,
  buildStrategyEvidence,
  generateSquadReasoning,
  CurrentRoleReportSchema,
  FixtureHorizonReportSchema,
  MarketProjectionFeaturesSchema,
  ProbabilisticProjectionArraySchema,
  readArtifactFileIfExists,
  RecommendationArtifactSchema,
  renderDecisionPrompts,
  renderProjectionSummary,
  renderSeasonStrategyTemplate,
  renderWeeklyStrategyTemplate,
  WeeklyStrategySchema,
  weeklyStrategyJsonTemplate,
  type CurrentRoleReport,
  type DecisionContext,
  type FixtureHorizonReport
} from "../packages/agent/src";
import type { PlayerSummaryResult } from "../packages/player-store/src";
import {
  DEFAULT_STARTING_BUDGET,
  REQUIRED_SQUAD_COUNTS,
  deriveCompetitionState,
  type DeadlineStatus
} from "../packages/rules/src";
import { CURRENT_SQUAD, PLAYER_DECISION_INPUTS, SQUAD_STRATEGY } from "../config/squad";
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
  teams?: Array<{
    id: number;
    strength_overall_home?: number | null;
    strength_overall_away?: number | null;
  }>;
};

function argValue(name: string) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

export function fixtureProjectionContext(report: FixtureHorizonReport | null): ProjectionContext {
  const gw1Fixtures = report?.teams.map((team) => [
    team.teamId,
    team.horizons.find((horizon) => horizon.gameweeks === 1)
  ] as const) ?? [];

  return {
    attackFixtureDifficultyByTeamId: Object.fromEntries(gw1Fixtures.flatMap(([teamId, horizon]) =>
      horizon?.attack.averageDifficulty == null ? [] : [[teamId, horizon.attack.averageDifficulty]]
    )),
    defenceFixtureDifficultyByTeamId: Object.fromEntries(gw1Fixtures.flatMap(([teamId, horizon]) =>
      horizon?.defence.averageDifficulty == null ? [] : [[teamId, horizon.defence.averageDifficulty]]
    ))
  };
}

async function readJson<T>(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function readJsonIfExists<T>(filePath: string) {
  try {
    return await readJson<T>(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function loadConditionalHistory() {
  const index = await readJsonIfExists<{
    players: Array<{ id: number; path: string }>;
  }>(path.join("data", "processed", "player-data", "index.json"));
  const history = new Map<number, ConditionalAppearanceSample[]>();

  await Promise.all((index?.players ?? []).map(async (entry) => {
    const data = await readJsonIfExists<{
      currentSeasonHistory?: Array<Record<string, unknown>>;
    }>(entry.path);
    const samples = (data?.currentSeasonHistory ?? []).flatMap((item) => {
      const minutes = typeof item.minutes === "number" ? item.minutes : null;
      const points = typeof item.total_points === "number" ? item.total_points : null;
      if (minutes === null || points === null || minutes < 0) return [];
      return [{
        started: item.starts === 1 || (item.starts === undefined && minutes > 45),
        minutes,
        points
      }];
    });
    if (samples.length > 0) history.set(entry.id, samples);
  }));

  return history;
}

async function writeJson(filePath: string, data: unknown) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function hashValue(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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

function hasAuthoredRecommendation(value: unknown, configuredPlayerIds: number[]) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const recommendation = value as { status?: string; squadBefore?: { players?: unknown[] } };

  const recommendationPlayerIds = (recommendation.squadBefore?.players ?? [])
    .map((player) => (player as { id?: number }).id)
    .filter((id): id is number => typeof id === "number")
    .sort((left, right) => left - right);
  const configured = [...configuredPlayerIds].sort((left, right) => left - right);

  return recommendation.status !== "agent_decision_required" &&
    Array.isArray(recommendation.squadBefore?.players) &&
    recommendation.squadBefore.players.length > 0 &&
    recommendationPlayerIds.length === configured.length &&
    recommendationPlayerIds.every((id, index) => id === configured[index]);
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
- evidence-snapshot.json
- team-news-report.json
- team-news-report.md
- current-role-report.json
- current-role-report.md
- adapter-coverage-report.json
- player-pool.json
- projections.json
- probabilistic-projections.json
- projection-uncertainty-report.json
- projection-uncertainty-report.md
- projection-summary.md
- budget-tiers.json
- club-exposure.json
- decision-prompts.md
- strategy-evidence.json
- recommendation-template.json
- public-evidence-report.json
- public-evidence-report.md
- evidence-store-manifest.json
- evidence-research-worklist.json
- player-dossier-index.json
- evidence-readiness-report.json
- decision-status-report.json
- trigger-evaluation.json
- packages/content/strategy/season-plan.md
- packages/content/strategy/weekly/gw-${input.gameweek}.md
- packages/content/strategy/weekly/gw-${input.gameweek}.json

## Required Agent Work

- Confirm whether official 2026/27 FPL data is live.
- Confirm player prices, positions, clubs, availability, and GW1 fixtures from current sources.
- Run player:dossier for every player considered for the selected 15 and inspect stored official history, news, role evidence, coverage, disagreements, and unresolved gaps before selecting them.
- Treat missing selected-player research coverage as blocking and use the provisional decision workspace when present; keep other non-READY dossier reasons visible.
- Use at least four distinct public publishers, including at least two official primary sources, before treating the recommendation as final.
- Open the current public pages and use specific claims from them; configured or captured pages that do not inform a decision do not count.
- Tie direct public URLs and retrieval times to squad structure, availability or expected minutes, captaincy, and deadline-dependent changes.
- Treat local reports, projections, and summaries as transformations rather than public publishers.
- If fewer than four usable public publishers are available, keep the recommendation provisional and state the missing coverage.
- Complete current research coverage for every selected player before treating the recommendation as final.
- Record every qualifying article in publicNewsArticles with playerId, publisher, title, direct URL, publishedAt, and retrievedAt.
- Require at least five distinct qualifying public-news articles across the selected squad, published within the preceding 14 days.
- Select a legal 15-player squad within £${DEFAULT_STARTING_BUDGET.toFixed(1)}m.
- Cite evidence for every squad, shortlist, starting XI, captaincy, bench, chip, risk, and change-condition decision.
- Fill evidenceReferences with source, reportPath, note, and relevant player IDs where applicable.
- Fill claimLedger v3 with explicit OBSERVATION, DERIVED_FACT, ASSUMPTION, FORECAST, and DECISION kinds; list every authored decision in decisionIds.
- Build one immutable evidenceSnapshot and reference its snapshotId from every observation, forecast, DecisionEvaluation, canonical state, and factual claim.
- Add canonical DecisionEvaluation records for squad, structure, starting XI, bench order, captaincy, transfers, and chip selection.
- Select the highest eligible objectiveScore. Discretionary overrides are invalid, including when prose preferences contradict raw expected points.
- Declare optimizationPolicy explicitly. MAX_EXPECTED_POINTS excludes ownership; rank-aware modes require a cited simulated field distribution.
- Quantify every model adjustment as a feature-level points delta with uncertainty and evidence IDs. Never apply a feature already present in the base projection.
- Never use club "coverage" to select or omit a player. Compare independently optimized with-player and without-player squads.
- Never use ownership, effective ownership, or rank protection unless optimizationPolicy is rank-aware and cites the rank simulation.
- Include multiple meaningful legal candidates for every optimized squad, structure, starting-XI, and captaincy evaluation.
- Persist material structural counterfactual compositions and comparable metrics directly in the structure candidateScores.
- Decompose every non-raw objectiveScore into evidenced scoreComponents that sum to the score.
- Put every auditable deterministic or source-derived explanation fact in factualClaims with resolvable dependencies and validated status.
- Give every selected starter at or below the declared material start-probability threshold exactly one change condition, explicit coverage reason, or risk waiver.
- Record source availability separately from usable evidence coverage in every snapshot component.
- Give every forecast its model, model version, input facts, input assumptions, output value, uncertainty, and horizon.
- Keep evaluative or causal interpretation out of observations and derived facts, and use only phase-relevant warnings.
- Treat generated reports as transformations of their originating observations, not as independent corroborating sources.
- Fill decisionAnalysis with why every selected player was picked, why named alternatives were rejected, captaincy comparisons, key omissions, and evidence paths.
- Cite optimized counterfactual candidate IDs for every material premium, defence, bench-depth, or club-exposure structure rejected in decisionAnalysis.
- Keep exactly ${REQUIRED_SQUAD_COUNTS.GKP} GKP, ${REQUIRED_SQUAD_COUNTS.DEF} DEF, ${REQUIRED_SQUAD_COUNTS.MID} MID, and ${REQUIRED_SQUAD_COUNTS.FWD} FWD.
- Keep no more than 3 players from one club.
- Choose starting XI, captain, vice-captain, bench order, and chip.
- Run verification after writing final recommendation files.

## Hard Stop

Do not treat stale public API data as official 2026/27 GW1 data.

Do not treat a recommendation as final when its public-source claims are not represented in claimLedger with direct URLs, retrieval times, and decision lineage.

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
  summaries?: PlayerSummaryResult[];
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
  const outputDir = input.outputDir ?? path.join("packages", "content", "recommendations", `gw-${gameweek}`);
  const teamStrengthById = new Map((bootstrap.teams ?? []).map((team) => {
    const strengths = [team.strength_overall_home, team.strength_overall_away]
      .filter((strength): strength is number => typeof strength === "number");
    return [team.id, strengths.length > 0
      ? strengths.reduce((sum, strength) => sum + strength, 0) / strengths.length
      : null] as const;
  }));
  const projectionPlayers = players.map((player) => ({
    ...player,
    teamStrength: teamStrengthById.get(player.teamId) ?? null
  }));
  const fixtureHorizonReport = input.fixtureHorizonReport ?? await readArtifactFileIfExists(
    path.join(outputDir, "fixture-horizon-report.json"),
    FixtureHorizonReportSchema
  );
  const rawProjections = projectPlayers(projectionPlayers, fixtureProjectionContext(fixtureHorizonReport));
  const marketFeatures = await readArtifactFileIfExists(
    path.join(outputDir, "market-projection-features.json"),
    MarketProjectionFeaturesSchema
  );
  const currentRoleReport: CurrentRoleReport | null = await readArtifactFileIfExists(
    path.join(outputDir, "current-role-report.json"),
    CurrentRoleReportSchema
  );
  const historyByPlayerId = await loadConditionalHistory();
  const priorProjections: ProbabilisticProjection[] | null = gameweek > 1
    ? await readArtifactFileIfExists(path.join(
      "packages", "content", "recommendations", `gw-${gameweek - 1}`, "probabilistic-projections.json"
    ), ProbabilisticProjectionArraySchema)
    : null;
  const previousByPlayer = new Map((input.summaries ?? []).map((summary) => {
    const previous = summary.previousSeasons?.at(-1) ?? null;
    const minutes = Number(previous?.minutes);
    const goals = Number(previous?.goals_scored);
    return [summary.playerId, {
      minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 0,
      goals: Number.isFinite(goals) && goals >= 0 ? goals : 0
    }] as const;
  }));
  const cohortRate = (player: PlayerForEngine) => {
    const peers = projectionPlayers.filter((peer) => peer.position === player.position && Math.floor(peer.price) === Math.floor(player.price))
      .map((peer) => previousByPlayer.get(peer.id))
      .filter((value): value is { minutes: number; goals: number } => Boolean(value?.minutes));
    const fallbackPeers = projectionPlayers.filter((peer) => peer.position === player.position)
      .map((peer) => previousByPlayer.get(peer.id))
      .filter((value): value is { minutes: number; goals: number } => Boolean(value?.minutes));
    const cohort = peers.length > 0 ? peers : fallbackPeers;
    const cohortMinutes = cohort.reduce((sum, value) => sum + value.minutes, 0);
    const cohortPer90 = cohortMinutes > 0 ? cohort.reduce((sum, value) => sum + value.goals, 0) / cohortMinutes * 90 : 0;
    const individual = previousByPlayer.get(player.id);
    if (!individual?.minutes) return cohortPer90;
    const weight = individual.minutes / (individual.minutes + 900);
    return individual.goals / individual.minutes * 90 * weight + cohortPer90 * (1 - weight);
  };
  const featureByPlayer = new Map((marketFeatures?.players ?? []).map((feature) => [feature.playerId, feature]));
  const marketInputsByPlayerId = new Map<number, MarketPlayerProjectionInput>(projectionPlayers.flatMap((player) => {
    const feature = featureByPlayer.get(player.id);
    if (!feature || (feature.anytimeScorerProbability === null && feature.cleanSheetProbability === null)) return [];
    return [[player.id, {
      anytimeScorerProbability: feature.anytimeScorerProbability,
      cleanSheetProbability: feature.cleanSheetProbability,
      baselineGoalRatePer90: cohortRate(player),
      baselineCleanSheetProbability: feature.baselineCleanSheetProbability,
      evidenceIds: feature.evidenceIds
    }]];
  }));
  const projectionUncertainty = buildProjectionUncertaintyReport({
    generatedAt,
    gameweek,
    players: projectionPlayers,
    rawProjections,
    roleEvidence: currentRoleReport?.items,
    historyByPlayerId,
    priorAppearanceByPlayerId: new Map((priorProjections ?? []).map((projection) => [projection.playerId, projection.appearance])),
    marketInputsByPlayerId
  });
  const projections = roleAdjustedPlayerProjections(rawProjections, projectionUncertainty);
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
  const authoredRecommendationExists = hasAuthoredRecommendation(existingRecommendation, CURRENT_SQUAD.players);
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
  const projectionHash = hashValue(projectionUncertainty.items);
  const decisionEvidence = [
      {
        id: "projection",
        kind: "MODEL_OUTPUT" as const,
        location: "probabilistic-projections.json",
        retrievedAt: generatedAt,
        snapshotHash: projectionHash,
        claimIds: ["start_probability", "appearance_probability", "gw1_expected_points", "projection_distribution"],
        reliability: 0.8
      },
      {
        id: "fixtures",
        kind: "MODEL_OUTPUT" as const,
        location: "fixture-horizon-report.json",
        retrievedAt: fixtureHorizonReport?.generatedAt ?? generatedAt,
        snapshotHash: hashValue(fixtureHorizonReport),
        claimIds: ["fixture_horizon"],
        reliability: 0.85
      },
      {
        id: "optimizer",
        kind: "MODEL_OUTPUT" as const,
        location: SQUAD_STRATEGY.optimizerRun.sourcePath,
        retrievedAt: SQUAD_STRATEGY.optimizerRun.generatedAt,
        snapshotHash: hashValue(SQUAD_STRATEGY.optimizerRun),
        claimIds: ["selected_squad", "bench_cap", "minimum_start_probability", "simulation_mode"],
        reliability: 0.8
      },
      {
        id: "minutes",
        kind: "MODEL_OUTPUT" as const,
        location: "projection-uncertainty-report.json",
        retrievedAt: generatedAt,
        snapshotHash: projectionHash,
        claimIds: ["start_probability", "appearance_probability"],
        reliability: 0.75
      },
      {
        id: "lineups",
        kind: "PREDICTED_LINEUP" as const,
        location: "current-role-report.json",
        retrievedAt: currentRoleReport?.generatedAt ?? generatedAt,
        snapshotHash: hashValue(currentRoleReport ?? projectionUncertainty.items),
        claimIds: ["current_role", "predicted_start"],
        reliability: 0.7
      }
    ];
  const requiredDecisionPlayerIds = new Set([
    ...CURRENT_SQUAD.players,
    ...Object.values(PLAYER_DECISION_INPUTS).flatMap((decision) => [
      decision.alternativePlayerId,
      ...(decision.additionalAlternativePlayerIds ?? [])
    ])
  ]);
  const availablePlayerIds = new Set(players.map((player) => player.id));
  const projectedPlayerIds = new Set(projectionUncertainty.items.map((projection) => projection.playerId));
  const decisionInputsAvailable = CURRENT_SQUAD.sourceGameweek === gameweek && [...requiredDecisionPlayerIds].every((playerId) =>
    availablePlayerIds.has(playerId) && projectedPlayerIds.has(playerId));
  const squadDecisionRecord = decisionInputsAvailable ? buildSquadDecisionRecord({
    gameweek,
    generatedAt,
    squad: CURRENT_SQUAD,
    strategy: SQUAD_STRATEGY,
    players,
    projections: projectionUncertainty.items,
    decisions: PLAYER_DECISION_INPUTS,
    evidence: decisionEvidence
  }) : {
    schemaVersion: 1,
    artifactKind: "decision_record_unavailable",
    gameweek,
    generatedAt,
    validation: {
      isValid: false,
      errors: ["Configured squad and alternative player IDs are unavailable in this evidence dataset."]
    }
  };
  if (decisionInputsAvailable && !squadDecisionRecord.validation.isValid) {
    throw new Error(`Invalid GW${gameweek} decision record: ${squadDecisionRecord.validation.errors.join("; ")}`);
  }
  const squadReasoning = decisionInputsAvailable
    ? generateSquadReasoning(squadDecisionRecord as ReturnType<typeof buildSquadDecisionRecord>)
    : undefined;
  const evidencePack = buildEvidencePack({
    gameweek,
    createdAt: generatedAt,
    dataMode,
    deadline: event?.deadline_time ?? "unknown",
    deadlineStatus: effectiveDeadlineStatus,
    competitionState,
    manualSquadConfigured: decisionInputsAvailable,
    currentSquadPlayerIds: CURRENT_SQUAD.players,
    currentSquadReasoning: squadReasoning,
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
  const startingXI = CURRENT_SQUAD.players.filter((playerId) => !CURRENT_SQUAD.benchOrder.includes(playerId));
  const captainCandidates = rankCaptainCandidates(projections, startingXI);
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
  await writeJson(path.join(outputDir, "probabilistic-projections.json"), projectionUncertainty.items);
  await writeJson(path.join(outputDir, "projection-uncertainty-report.json"), projectionUncertainty);
  await writeFile(
    path.join(outputDir, "projection-uncertainty-report.md"),
    renderProjectionUncertaintyMarkdown(projectionUncertainty),
    "utf8"
  );
  await writeJson(path.join(outputDir, "player-pool.json"), evidencePack.playerPool);
  await writeJson(path.join(outputDir, "budget-tiers.json"), evidencePack.budgetTiers);
  await writeJson(path.join(outputDir, "club-exposure.json"), evidencePack.clubExposure);
  await writeJson(path.join(outputDir, "strategy-evidence.json"), strategyEvidence);
  await writeJson(path.join(outputDir, "decision-record.json"), squadDecisionRecord);
  await writeJson(path.join(outputDir, "recommendation-template.json"), evidencePack.recommendationTemplate);
  await writeJson(path.join(outputDir, "captain-candidates.json"), captainCandidates);
  await writeFile(path.join(outputDir, "projection-summary.md"), renderProjectionSummary(evidencePack), "utf8");
  await writeFile(path.join(outputDir, "decision-prompts.md"), renderDecisionPrompts(evidencePack, fixtureHorizonReport), "utf8");

  if (!authoredRecommendationExists) {
    await writeJson(recommendationPath, evidencePack.recommendationTemplate);
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
