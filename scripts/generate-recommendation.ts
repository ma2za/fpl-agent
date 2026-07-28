import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { projectPlayers, type PlayerForEngine } from "../packages/engine/src";
import {
  buildEvidencePack,
  buildStrategyEvidence,
  renderDecisionPrompts,
  renderProjectionSummary,
  renderSeasonStrategyTemplate,
  renderWeeklyStrategyTemplate,
  weeklyStrategyJsonTemplate,
  type DecisionContext
} from "../packages/agent/src";
import { DEFAULT_STARTING_BUDGET, REQUIRED_SQUAD_COUNTS, type DeadlineStatus } from "../packages/rules/src";
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

async function readJsonIfExists(filePath: string) {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
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

function deadlineStatus(event: BootstrapEvent | undefined): DeadlineStatus {
  if (!event) {
    return "unknown";
  }

  const deadline = Date.parse(event.deadline_time);

  if (!Number.isFinite(deadline)) {
    return "unknown";
  }

  return deadline > Date.now() ? "open" : "passed";
}

function hasLiveFplData(event: BootstrapEvent | undefined) {
  if (!event || event.finished) {
    return false;
  }

  const deadline = Date.parse(event.deadline_time);

  return Number.isFinite(deadline) && deadline > Date.now() && (event.is_next || event.is_current);
}

function resolveDataMode(input: {
  event: BootstrapEvent | undefined;
  officialModeRequested: boolean;
  provisionalModeRequested: boolean;
}) {
  if (input.officialModeRequested) {
    return "official";
  }

  if (input.provisionalModeRequested) {
    return "provisional";
  }

  return hasLiveFplData(input.event) ? "official" : "provisional";
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
  notes: DecisionContext["notes"];
}) {
  return `# FPL Agent Decision Brief: GW${input.gameweek}

## Status

Data mode: ${input.dataMode}

Deadline: ${input.event?.deadline_time ?? "unknown"}

Deadline status: ${input.deadlineStatus}

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

async function main() {
  const requestedGameweek = argValue("--gw") ?? "auto";
  const players = await readJson<PlayerForEngine[]>(path.join("data", "processed", "players.json"));
  const bootstrap = await readJson<BootstrapStatic>(path.join("data", "raw", "bootstrap-static.json"));
  const gameweek = resolveGameweek(bootstrap.events, requestedGameweek);
  const event = bootstrap.events.find((item) => item.id === gameweek);
  const officialModeRequested = process.argv.includes("--official");
  const provisionalModeRequested = process.argv.includes("--provisional");
  const dataMode = resolveDataMode({
    event,
    officialModeRequested,
    provisionalModeRequested
  });
  const realDeadlineStatus = deadlineStatus(event);
  const effectiveDeadlineStatus = dataMode === "provisional" ? "unknown" : realDeadlineStatus;
  const projections = projectPlayers(players);
  const outputDir = path.join("packages", "content", "recommendations", `gw-${gameweek}`);
  const strategyDir = path.join("packages", "content", "strategy");
  const weeklyStrategyDir = path.join(strategyDir, "weekly");
  const seasonPlanPath = path.join(strategyDir, "season-plan.md");
  const weeklyStrategyMarkdownPath = path.join(weeklyStrategyDir, `gw-${gameweek}.md`);
  const weeklyStrategyJsonPath = path.join(weeklyStrategyDir, `gw-${gameweek}.json`);
  const recommendationPath = path.join(outputDir, "recommendation.json");
  const existingRecommendation = await readJsonIfExists(recommendationPath);
  const authoredRecommendationExists = hasAuthoredRecommendation(existingRecommendation);
  const existingSeasonPlan = await readTextIfExists(seasonPlanPath);
  const existingWeeklyStrategy = await readJsonIfExists(weeklyStrategyJsonPath);
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
    createdAt: new Date().toISOString(),
    dataMode,
    deadline: event?.deadline_time ?? "unknown",
    deadlineStatus: effectiveDeadlineStatus,
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
    weeklyStrategyExists: existingWeeklyStrategy !== null
  });

  await mkdir(outputDir, { recursive: true });
  await mkdir(weeklyStrategyDir, { recursive: true });
  if (existingSeasonPlan === null) {
    await writeFile(seasonPlanPath, renderSeasonStrategyTemplate(), "utf8");
  }
  if (existingWeeklyStrategy === null) {
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
  await writeFile(path.join(outputDir, "decision-prompts.md"), renderDecisionPrompts(evidencePack), "utf8");

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
        notes
      }),
      "utf8"
    );
    await writeFile(path.join(outputDir, "manual-checklist.md"), renderManualChecklistPlaceholder(gameweek), "utf8");
  }

  console.log(`Wrote decision evidence to ${outputDir}`);
  console.log(
    authoredRecommendationExists
      ? "Existing agent-authored recommendation was preserved."
      : "No players were selected by script. The coding agent must author the final recommendation."
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
