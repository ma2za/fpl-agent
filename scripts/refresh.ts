import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  EvidenceReportSchema,
  EvidenceSnapshotSchema,
  AdapterCoverageReportSchema,
  CurrentRoleReportSchema,
  FixtureHorizonReportSchema,
  FixtureTickerSchema,
  MinutesRiskReportSchema,
  OddsReportSchema,
  PlayerProjectionArraySchema,
  ProbabilisticProjectionArraySchema,
  ProjectionUncertaintyReportSchema,
  PublicEvidenceReportSchema,
  RecommendationArtifactSchema,
  SetPieceReportSchema,
  StrategyEvidenceSchema,
  TeamNewsReportSchema,
  buildFixtureHorizonReport,
  buildCurrentRoleReport,
  buildFixtureTicker,
  buildMinutesRiskReport,
  buildSetPieceReport,
  buildTeamNewsReport,
  isWeeklyRecommendationArtifact,
  readArtifactFile,
  readArtifactFileIfExists,
  renderEvidenceReportMarkdown,
  renderCurrentRoleReportMarkdown,
  renderFixtureHorizonMarkdown,
  renderFixtureTickerMarkdown,
  renderMinutesRiskReportMarkdown,
  renderSetPieceReportMarkdown,
  renderTeamNewsReportMarkdown,
  runRefresh,
  type EvidenceSource,
  type EvidenceSnapshotComponentKind,
  type AgentRoleEvidenceInput,
  type RefreshInput,
  type RefreshSidecar,
  type RefreshStage
} from "../packages/agent/src";
import {
  BootstrapStaticSchema,
  FixtureSchema,
  PlayerSummarySchema,
  bootstrapCachePath,
  createFplApiClient,
  fixturesCachePath,
  normalizePlayers,
  playerSummaryCachePath,
  readValidatedJsonCache,
  type BootstrapStatic,
  type Fixture,
  type NormalizedPlayer
} from "../packages/fpl-api/src";
import {
  DecisionStatusInputSchema,
  DecisionStatusReportSchema,
  EvidenceReadinessReportSchema,
  TriggerPlanSchema,
  buildDecisionStatusReport,
  buildEvidenceReadinessReport,
  buildPlayerDossier,
  buildProvisionalDecisionWorkspace,
  buildResearchWorklist,
  buildStoreManifest,
  clonePlayerStore,
  evaluateTriggerPlan,
  ingestOfficialRun,
  latestResearchWorklist,
  migratePlayerStore,
  openPlayerStore,
  playerIdsForRun,
  previousTriggerEvaluation,
  recordArtifactLineage,
  recordTriggerEvaluations,
  renderDecisionStatusMarkdown,
  renderReadinessMarkdown,
  renderTriggerEvaluationMarkdown,
  validatePlayerStore,
  type PlayerSummaryResult
} from "../packages/player-store/src";
import { CURRENT_SQUAD } from "../config/squad";
import { CURRENT_ROLE_ADAPTERS } from "../config/current-role";
import { buildLocalEvidenceReport } from "./evidence-sources";
import { currentRoleAdapterInputs, parseCodingAgentRoleEvidence } from "./current-role-evidence";
import { loadFixtureExposures } from "./fixture-horizon-evidence";
import { generateOddsEvidence } from "./generate-odds";
import {
  defaultPublicEvidenceSources,
  generatePublicEvidence
} from "./generate-public-evidence";
import { generateRecommendationEvidence } from "./generate-recommendation";

type AcquiredRefreshData = {
  bootstrap: BootstrapStatic;
  fixtures: Fixture[];
  players: NormalizedPlayer[];
  summaries: PlayerSummaryResult[];
  inputs: RefreshInput[];
  publish: () => Promise<void>;
};

const fixtureArraySchema = FixtureSchema.array();

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, operation: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await operation(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function wait(milliseconds: number) {
  return milliseconds > 0 ? new Promise((resolve) => setTimeout(resolve, milliseconds)) : Promise.resolve();
}

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

async function snapshotComponent(
  kind: EvidenceSnapshotComponentKind,
  filePath: string,
  sourceId: string,
  version: string | null,
  retrievedAt: string,
  coverageStatus: "usable" | "partial" | "no_matching_rows" | "missing" = "usable",
  matchedRecordCount: number | null = null
) {
  try {
    return {
      kind,
      status: "available" as const,
      sourceId,
      version,
      observedAt: retrievedAt,
      retrievedAt,
      contentHash: sha256(await readFile(filePath)),
      coverageStatus,
      matchedRecordCount
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return {
      kind,
      status: "missing" as const,
      sourceId: null,
      version,
      observedAt: null,
      retrievedAt: null,
      contentHash: null,
      coverageStatus: "missing" as const,
      matchedRecordCount: 0
    };
  }
}

async function readAgentRoleEvidence(filePath: string) {
  try {
    return parseCodingAgentRoleEvidence(JSON.parse(await readFile(filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readOptionalJson<T>(filePath: string, schema: { parse: (value: unknown) => T }) {
  try {
    return schema.parse(JSON.parse(await readFile(filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  const temporaryPath = `${filePath}.${randomUUID()}.refresh.tmp`;
  await writeJson(temporaryPath, value);
  await rename(temporaryPath, filePath);
}

async function writeReport(
  outputDir: string,
  jsonName: string,
  markdownName: string,
  report: unknown,
  markdown: string
) {
  await Promise.all([
    writeJson(path.join(outputDir, jsonName), report),
    writeFile(path.join(outputDir, markdownName), markdown, "utf8")
  ]);
}

async function fileInput(input: {
  id: string;
  filePath: string;
  sourceMode: "live" | "offline";
  maxAgeHours: number;
  now: Date;
}) {
  const [contents, file] = await Promise.all([readFile(input.filePath), stat(input.filePath)]);
  const ageHours = Math.max(0, (input.now.getTime() - file.mtime.getTime()) / 3_600_000);

  return {
    id: input.id,
    path: input.filePath,
    sourceMode: input.sourceMode,
    sha256: sha256(contents),
    fetchedAt: file.mtime.toISOString(),
    ageHours: Number(ageHours.toFixed(3)),
    freshness: ageHours <= input.maxAgeHours ? "fresh" as const : "stale" as const
  };
}

export async function acquireRefreshData(input: {
  offline: boolean;
  runId: string;
  now: Date;
  rawDir?: string;
  processedDir?: string;
  temporaryRoot?: string;
  fetchImpl?: typeof fetch;
  rejectStale?: boolean;
  playerConcurrency?: number;
  summaryRetryDelaysMs?: number[];
}): Promise<AcquiredRefreshData> {
  const rawDir = input.rawDir ?? path.join("data", "raw");
  const processedDir = input.processedDir ?? path.join("data", "processed");
  const bootstrapPath = bootstrapCachePath(rawDir);
  const fixturesPath = fixturesCachePath(rawDir);
  let bootstrap: BootstrapStatic;
  let fixtures: Fixture[];
  let sourceBootstrapPath = bootstrapPath;
  let sourceFixturesPath = fixturesPath;
  let temporaryDir: string | null = null;

  if (input.offline) {
    const results = await Promise.allSettled([
      readValidatedJsonCache(bootstrapPath, BootstrapStaticSchema),
      readValidatedJsonCache(fixturesPath, fixtureArraySchema)
    ]);
    const missing = results.flatMap((result, index) =>
      result.status === "rejected"
        ? [`${index === 0 ? "bootstrap" : "fixtures"}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`]
        : []
    );

    if (missing.length > 0) {
      throw new Error(`Offline refresh is missing required caches:\n${missing.join("\n")}`);
    }

    bootstrap = (results[0] as PromiseFulfilledResult<BootstrapStatic>).value;
    fixtures = (results[1] as PromiseFulfilledResult<Fixture[]>).value;
  } else {
    temporaryDir = path.join(
      input.temporaryRoot ?? path.join("data", "cache", "refresh-inputs"),
      input.runId
    );
    const client = createFplApiClient({
      cacheDir: temporaryDir,
      fetchImpl: input.fetchImpl,
      forceRefresh: true
    });

    [bootstrap, fixtures] = await Promise.all([
      client.getBootstrapStatic(),
      client.getFixtures()
    ]);
    sourceBootstrapPath = bootstrapCachePath(temporaryDir);
    sourceFixturesPath = fixturesCachePath(temporaryDir);
  }

  const players = normalizePlayers(bootstrap);
  const summaryRetryDelays = input.summaryRetryDelaysMs ?? [250, 1_000];
  const summaryCacheDir = input.offline ? rawDir : temporaryDir!;
  const summaries = await mapWithConcurrency(
    bootstrap.elements,
    input.playerConcurrency ?? 6,
    async (player): Promise<PlayerSummaryResult> => {
      const cachePath = playerSummaryCachePath(player.id, summaryCacheDir);
      if (input.offline) {
        try {
          const [summary, file] = await Promise.all([
            readValidatedJsonCache(cachePath, PlayerSummarySchema),
            stat(cachePath)
          ]);
          const ageHours = Math.max(0, (input.now.getTime() - file.mtime.getTime()) / 3_600_000);
          return {
            playerId: player.id,
            status: ageHours <= 24 ? "available" : "stale",
            retrievedAt: file.mtime.toISOString(),
            contentHash: sha256(JSON.stringify(summary)),
            fixtures: summary.fixtures,
            history: summary.history,
            error: ageHours <= 24 ? null : `Player summary cache is ${ageHours.toFixed(1)} hours old.`
          };
        } catch (error) {
          return {
            playerId: player.id,
            status: "missing",
            retrievedAt: null,
            contentHash: null,
            fixtures: [],
            history: [],
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      const client = createFplApiClient({ cacheDir: summaryCacheDir, fetchImpl: input.fetchImpl, forceRefresh: true });
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const summary = await client.getPlayerSummary(player.id);
          return {
            playerId: player.id,
            status: "available",
            retrievedAt: input.now.toISOString(),
            contentHash: sha256(JSON.stringify(summary)),
            fixtures: summary.fixtures,
            history: summary.history,
            error: null
          };
        } catch (error) {
          lastError = error;
          if (attempt < 2) await wait(summaryRetryDelays[attempt] ?? summaryRetryDelays.at(-1) ?? 0);
        }
      }
      return {
        playerId: player.id,
        status: "failed",
        retrievedAt: input.now.toISOString(),
        contentHash: null,
        fixtures: [],
        history: [],
        error: lastError instanceof Error ? lastError.message : String(lastError)
      };
    }
  );
  const mode = input.offline ? "offline" as const : "live" as const;
  const inputs = await Promise.all([
    fileInput({ id: "bootstrap", filePath: sourceBootstrapPath, sourceMode: mode, maxAgeHours: 24, now: input.now }),
    fileInput({ id: "fixtures", filePath: sourceFixturesPath, sourceMode: mode, maxAgeHours: 168, now: input.now })
  ]);
  inputs[0].path = bootstrapPath;
  inputs[1].path = fixturesPath;
  inputs.push({
    id: "normalized-players",
    path: path.join(processedDir, "players.json"),
    sourceMode: mode,
    sha256: sha256(JSON.stringify(players)),
    fetchedAt: inputs[0].fetchedAt,
    ageHours: inputs[0].ageHours,
    freshness: inputs[0].freshness
  });
  const stale = inputs.filter((item) => item.freshness === "stale");

  if (input.rejectStale && stale.length > 0) {
    throw new Error(`Refresh rejected stale caches: ${stale.map((item) => item.id).join(", ")}.`);
  }

  return {
    bootstrap,
    fixtures,
    players,
    summaries,
    inputs,
    publish: input.offline
      ? async () => undefined
      : async () => {
        await mkdir(rawDir, { recursive: true });
        await mkdir(processedDir, { recursive: true });
        await writeJsonAtomic(bootstrapPath, bootstrap);
        await writeJsonAtomic(fixturesPath, fixtures);
        await writeJsonAtomic(path.join(processedDir, "players.json"), players);
        await Promise.all(summaries
          .filter((summary) => summary.status === "available")
          .map(async (summary) => {
            const source = await readValidatedJsonCache(
              playerSummaryCachePath(summary.playerId, summaryCacheDir),
              PlayerSummarySchema
            );
            await writeJsonAtomic(playerSummaryCachePath(summary.playerId, rawDir), source);
          }));
      }
  };
}

function resolveGameweek(bootstrap: BootstrapStatic, requested: string) {
  if (requested !== "auto") {
    const gameweek = Number(requested);

    if (!Number.isInteger(gameweek) || gameweek < 1) {
      throw new Error("Usage: pnpm refresh -- --gw <gameweek|auto> [--offline]");
    }

    return gameweek;
  }

  const events = bootstrap.events as Array<BootstrapStatic["events"][number] & { finished?: boolean }>;
  const event = events.find((item) => item.is_next)
    ?? events.find((item) => item.is_current && !item.finished);

  if (!event) {
    throw new Error("Cannot resolve --gw auto: no next or unfinished current event exists in bootstrap data.");
  }

  return event.id;
}

function resolveDeadline(bootstrap: BootstrapStatic, gameweek: number, now: Date) {
  const event = bootstrap.events.find((item) => item.id === gameweek);

  if (!event || !Number.isFinite(Date.parse(event.deadline_time))) {
    return { status: "unknown" as const, time: event?.deadline_time ?? null };
  }

  return {
    status: Date.parse(event.deadline_time) > now.getTime() ? "open" as const : "passed" as const,
    time: event.deadline_time
  };
}

function artifact(relativePath: string, schema?: Parameters<typeof readArtifactFile>[1]) {
  return {
    relativePath,
    validate: schema ? async (filePath: string) => {
      await readArtifactFile(filePath, schema);
    } : undefined
  };
}

async function selectedPlayerState(outputDir: string) {
  const artifact = await readArtifactFileIfExists(
    path.join(outputDir, "recommendation.json"),
    RecommendationArtifactSchema
  );
  const recommendation = artifact && isWeeklyRecommendationArtifact(artifact) ? artifact : null;

  return {
    selectedPlayerIds: recommendation?.squadBefore.players.map((player) => player.id) ?? [],
    startingPlayerIds: recommendation?.pickTeam.startingXI ?? [],
    benchOrder: recommendation?.pickTeam.benchOrder ?? []
  };
}

function source(input: {
  id: string;
  label: string;
  provider: string;
  url: string;
  rawPath: string;
  reportPath: string;
  confidence: "low" | "medium" | "high";
  maxAgeHours: number;
  refreshInput: RefreshInput;
  generatedAt: string;
}): EvidenceSource {
  return {
    id: input.id,
    label: input.label,
    provider: input.provider,
    url: input.url,
    rawPath: input.rawPath,
    reportPath: input.reportPath,
    required: true,
    confidence: input.confidence,
    freshness: {
      status: input.refreshInput.freshness,
      checkedAt: input.generatedAt,
      fetchedAt: input.refreshInput.fetchedAt,
      ageHours: input.refreshInput.ageHours,
      maxAgeHours: input.maxAgeHours,
      message: `${input.label} loaded from ${input.refreshInput.sourceMode} input.`
    }
  };
}

function buildStages(input: {
  runId: string;
  gameweek: number;
  generatedAt: string;
  now: Date;
  offline: boolean;
  rawDir: string;
  fetchImpl?: typeof fetch;
  deadline: { status: "open" | "passed" | "unknown"; time: string | null };
  targetDir: string;
  data: AcquiredRefreshData;
  agentRoleEvidence: AgentRoleEvidenceInput | null;
  stagedPlayerStorePath: string;
  decisionStatuses: ReturnType<typeof DecisionStatusInputSchema.parse> | null;
  triggerPlan: ReturnType<typeof TriggerPlanSchema.parse> | null;
}): RefreshStage[] {
  const bootstrapInput = input.data.inputs.find((item) => item.id === "bootstrap")!;
  const roleAdapters = currentRoleAdapterInputs(
    CURRENT_ROLE_ADAPTERS,
    input.data.bootstrap.elements,
    input.generatedAt,
    input.agentRoleEvidence
  );
  const predictedLineups = roleAdapters.find((adapter) => adapter.config.kind === "predicted_lineup")?.records;
  const recommendationArtifacts = [
    artifact("data-status.json"),
    artifact("projections.json", PlayerProjectionArraySchema),
    artifact("probabilistic-projections.json", ProbabilisticProjectionArraySchema),
    artifact("projection-uncertainty-report.json", ProjectionUncertaintyReportSchema),
    artifact("projection-uncertainty-report.md"),
    artifact("player-pool.json"),
    artifact("budget-tiers.json"),
    artifact("club-exposure.json"),
    artifact("strategy-evidence.json", StrategyEvidenceSchema),
    artifact("recommendation-template.json", RecommendationArtifactSchema),
    artifact("projection-summary.md"),
    artifact("decision-prompts.md"),
    artifact("recommendation.json", RecommendationArtifactSchema)
  ];

  return [
    {
      id: "fixtures",
      required: true,
      phase: 0,
      artifacts: [
        artifact("fixture-ticker.json", FixtureTickerSchema),
        artifact("fixture-ticker.md"),
        artifact("fixture-horizon-report.json", FixtureHorizonReportSchema),
        artifact("fixture-horizon-report.md")
      ],
      run: async ({ outputDir }) => {
        const ticker = buildFixtureTicker({
          gameweek: input.gameweek,
          horizon: 6,
          generatedAt: input.generatedAt,
          teams: input.data.bootstrap.teams,
          fixtures: input.data.fixtures
        });
        const exposures = await loadFixtureExposures({
          gameweek: input.gameweek,
          gameweekDir: outputDir,
          configuredPlayerIds: CURRENT_SQUAD.players,
          players: input.data.players
        });
        const horizon = buildFixtureHorizonReport({
          gameweek: input.gameweek,
          generatedAt: input.generatedAt,
          teams: input.data.bootstrap.teams,
          fixtures: input.data.fixtures,
          exposures
        });
        await Promise.all([
          writeReport(outputDir, "fixture-ticker.json", "fixture-ticker.md", ticker, renderFixtureTickerMarkdown(ticker)),
          writeReport(outputDir, "fixture-horizon-report.json", "fixture-horizon-report.md", horizon, renderFixtureHorizonMarkdown(horizon))
        ]);
      }
    },
    {
      id: "decision-evidence",
      required: true,
      phase: 2,
      artifacts: recommendationArtifacts,
      run: async ({ outputDir }) => {
        const fixtureHorizonReport = await readArtifactFile(
          path.join(outputDir, "fixture-horizon-report.json"),
          FixtureHorizonReportSchema
        );
        await generateRecommendationEvidence({
          requestedGameweek: String(input.gameweek),
          players: input.data.players,
          bootstrap: input.data.bootstrap,
          outputDir,
          generatedAt: input.generatedAt,
          now: input.now.getTime(),
          provisionalModeRequested: input.data.inputs.some((item) => item.freshness === "stale"),
          deadlineStatus: input.deadline.status,
          fixtureHorizonReport,
          writeStrategyTemplates: false,
          log: false
        });
      }
    },
    {
      id: "team-news",
      required: true,
      phase: 2,
      artifacts: [artifact("team-news-report.json", TeamNewsReportSchema), artifact("team-news-report.md")],
      run: async ({ outputDir }) => {
        const selected = await selectedPlayerState(outputDir);
        const report = buildTeamNewsReport({
          generatedAt: input.generatedAt,
          gameweek: input.gameweek,
          source: source({
            id: "team-news",
            label: "FPL availability",
            provider: "Fantasy Premier League public API cache",
            url: "https://fantasy.premierleague.com/api/bootstrap-static/",
            rawPath: bootstrapInput.path,
            reportPath: path.join(input.targetDir, "team-news-report.json"),
            confidence: "high",
            maxAgeHours: 24,
            refreshInput: bootstrapInput,
            generatedAt: input.generatedAt
          }),
          players: input.data.bootstrap.elements,
          teams: input.data.bootstrap.teams,
          elementTypes: input.data.bootstrap.element_types,
          selectedPlayerIds: selected.selectedPlayerIds
        });
        await writeReport(outputDir, "team-news-report.json", "team-news-report.md", report, renderTeamNewsReportMarkdown(report));
      }
    },
    {
      id: "set-pieces",
      required: true,
      phase: 2,
      artifacts: [artifact("set-pieces-report.json", SetPieceReportSchema), artifact("set-pieces-report.md")],
      run: async ({ outputDir }) => {
        const selected = await selectedPlayerState(outputDir);
        const report = buildSetPieceReport({
          generatedAt: input.generatedAt,
          gameweek: input.gameweek,
          source: source({
            id: "set-pieces",
            label: "FPL set pieces",
            provider: "Fantasy Premier League public API cache",
            url: "https://fantasy.premierleague.com/api/bootstrap-static/",
            rawPath: bootstrapInput.path,
            reportPath: path.join(input.targetDir, "set-pieces-report.json"),
            confidence: "high",
            maxAgeHours: 168,
            refreshInput: bootstrapInput,
            generatedAt: input.generatedAt
          }),
          players: input.data.bootstrap.elements,
          teams: input.data.bootstrap.teams,
          elementTypes: input.data.bootstrap.element_types,
          selectedPlayerIds: selected.selectedPlayerIds
        });
        await writeReport(outputDir, "set-pieces-report.json", "set-pieces-report.md", report, renderSetPieceReportMarkdown(report));
      }
    },
    {
      id: "minutes",
      required: true,
      phase: 2,
      artifacts: [artifact("minutes-risk-report.json", MinutesRiskReportSchema), artifact("minutes-risk-report.md")],
      run: async ({ outputDir }) => {
        const selected = await selectedPlayerState(outputDir);
        const report = buildMinutesRiskReport({
          generatedAt: input.generatedAt,
          gameweek: input.gameweek,
          source: source({
            id: "minutes",
            label: "FPL historical minutes",
            provider: "Fantasy Premier League public API cache",
            url: "https://fantasy.premierleague.com/api/bootstrap-static/",
            rawPath: bootstrapInput.path,
            reportPath: path.join(input.targetDir, "minutes-risk-report.json"),
            confidence: "medium",
            maxAgeHours: 24,
            refreshInput: bootstrapInput,
            generatedAt: input.generatedAt
          }),
          players: input.data.bootstrap.elements,
          teams: input.data.bootstrap.teams,
          elementTypes: input.data.bootstrap.element_types,
          selectedPlayerIds: selected.selectedPlayerIds,
          startingPlayerIds: selected.startingPlayerIds,
          benchOrder: selected.benchOrder,
          predictedLineups
        });
        await writeReport(outputDir, "minutes-risk-report.json", "minutes-risk-report.md", report, renderMinutesRiskReportMarkdown(report));
      }
    },
    {
      id: "current-role",
      required: true,
      phase: 1,
      artifacts: [
        artifact("current-role-report.json", CurrentRoleReportSchema),
        artifact("current-role-report.md"),
        artifact("adapter-coverage-report.json", AdapterCoverageReportSchema)
      ],
      run: async ({ outputDir }) => {
        const selected = await selectedPlayerState(outputDir);
        const report = buildCurrentRoleReport({
          generatedAt: input.generatedAt,
          gameweek: input.gameweek,
          players: input.data.bootstrap.elements,
          adapters: roleAdapters,
          selectedPlayerIds: selected.selectedPlayerIds
        });
        await writeReport(outputDir, "current-role-report.json", "current-role-report.md", report, renderCurrentRoleReportMarkdown(report));
        await writeJson(path.join(outputDir, "adapter-coverage-report.json"), report.adapterCoverage);
      }
    },
    {
      id: "odds",
      required: false,
      phase: 2,
      artifacts: [artifact("odds-report.json", OddsReportSchema), artifact("odds-report.md")],
      run: async ({ outputDir }) => {
        await generateOddsEvidence({
          gameweek: input.gameweek,
          outputDir,
          logicalOutputDir: input.targetDir,
          bootstrap: input.data.bootstrap,
          fixtures: input.data.fixtures,
          rawDir: path.join(input.rawDir, "odds"),
          offline: input.offline,
          generatedAt: input.generatedAt,
          log: false,
          fetchImpl: input.fetchImpl
        });
      }
    },
    {
      id: "public-evidence",
      required: false,
      phase: 2,
      artifacts: [
        artifact("public-evidence-report.json", PublicEvidenceReportSchema),
        artifact("public-evidence-report.md")
      ],
      run: async ({ outputDir }) => {
        const report = await generatePublicEvidence({
          gameweek: input.gameweek,
          outputDir,
          logicalRawDir: path.join(input.targetDir, "raw-sources", "public-evidence"),
          offline: input.offline,
          mode: "fetch",
          generatedAt: input.generatedAt,
          log: false,
          fetchImpl: input.fetchImpl
        });
        const requiredIds = new Set(defaultPublicEvidenceSources
          .filter((item) => item.required)
          .map((item) => item.id));
        const failedRequired = report.pages.filter((page) =>
          requiredIds.has(page.sourceId) && page.captureMode === "failed"
        );

        if (failedRequired.length > 0) {
          throw new Error(`Required public captures failed: ${failedRequired.map((page) => page.sourceId).join(", ")}.`);
        }
      }
    },
    {
      id: "player-store-official",
      required: true,
      phase: 2,
      artifacts: [artifact("evidence-research-worklist.json")],
      run: async ({ outputDir }) => {
        const roleReport = await readArtifactFile(path.join(outputDir, "current-role-report.json"), CurrentRoleReportSchema);
        const rawPlayers = new Map(input.data.bootstrap.elements.map((player) => [player.id, player]));
        const db = openPlayerStore(input.stagedPlayerStorePath);
        try {
          migratePlayerStore(db, input.generatedAt);
          ingestOfficialRun(db, {
            runId: input.runId,
            gameweek: input.gameweek,
            mode: input.offline ? "offline" : "live",
            observedAt: input.generatedAt,
            bootstrapHash: input.data.inputs.find((item) => item.id === "bootstrap")!.sha256,
            fixturesHash: input.data.inputs.find((item) => item.id === "fixtures")!.sha256,
            players: input.data.players.map((player) => {
              const raw = rawPlayers.get(player.id)!;
              return {
                playerId: player.id,
                name: player.name,
                webName: player.webName,
                teamId: player.teamId,
                teamName: player.team,
                position: player.position,
                price: player.price,
                status: player.status,
                selectedByPercent: player.selectedByPercent,
                minutes: player.minutes,
                totalPoints: player.totalPoints,
                aliases: [
                  player.name,
                  player.webName,
                  raw.first_name,
                  raw.second_name,
                  `${raw.first_name} ${raw.second_name.split(/\s+/).at(-1)}`,
                  `${raw.first_name} ${raw.second_name.split(/\s+/).find((part: string) => !["da", "de", "do", "dos"].includes(part.toLocaleLowerCase()))}`
                ],
                officialFields: raw
              };
            }),
            summaries: input.data.summaries,
            roleObservations: roleReport.observations.filter((observation) => rawPlayers.has(observation.playerId)).map((observation) => ({
              observationId: observation.id,
              playerId: observation.playerId,
              dimension: observation.dimension,
              signal: observation.signal,
              observedAt: observation.observedAt,
              contentHash: observation.contentHash,
              raw: observation
            }))
          });
          const clubAliases = Object.fromEntries(input.data.bootstrap.teams.map((team) => [
            team.id,
            [team.name, ...(team.short_name ? [team.short_name] : [])]
          ]));
          const worklist = input.offline
            ? latestResearchWorklist(db, input.gameweek) ?? buildResearchWorklist(db, {
                runId: input.runId, gameweek: input.gameweek, generatedAt: input.generatedAt, clubAliases
              })
            : buildResearchWorklist(db, {
                runId: input.runId, gameweek: input.gameweek, generatedAt: input.generatedAt, clubAliases
              });
          await writeJson(path.join(outputDir, "evidence-research-worklist.json"), worklist);
        } finally {
          db.close();
        }
      }
    },
    {
      id: "player-dossiers",
      required: true,
      phase: 3,
      artifacts: [
        artifact("player-dossier-index.json"),
        artifact("evidence-readiness-report.json", EvidenceReadinessReportSchema),
        artifact("evidence-readiness-report.md"),
        artifact("decision-status-report.json", DecisionStatusReportSchema),
        artifact("decision-status-report.md")
      ],
      run: async ({ outputDir }) => {
        const [projections, currentRole, selected] = await Promise.all([
          readArtifactFile(path.join(outputDir, "probabilistic-projections.json"), ProbabilisticProjectionArraySchema),
          readArtifactFile(path.join(outputDir, "current-role-report.json"), CurrentRoleReportSchema),
          selectedPlayerState(outputDir)
        ]);
        const db = openPlayerStore(input.stagedPlayerStorePath);
        try {
          const dossiers = playerIdsForRun(db, input.runId)
            .map((playerId) => buildPlayerDossier(db, { playerId, generatedAt: input.generatedAt }));
          const roleByPlayer = new Map(currentRole.items.map((item) => [item.playerId, item]));
          const readiness = buildEvidenceReadinessReport({
            generatedAt: input.generatedAt,
            gameweek: input.gameweek,
            dossiers,
            selectedPlayerIds: selected.selectedPlayerIds,
            projections: projections.map((projection) => ({
              playerId: projection.playerId,
              startProbability: projection.appearance.startProbability,
              appearanceProbability: projection.appearance.appearanceProbability,
              confidence: projection.appearance.overallEvidenceConfidence,
              currentRoleEvidence: roleByPlayer.get(projection.playerId)?.currentEvidencePresent ?? false
            }))
          });
          const statuses = buildDecisionStatusReport({
            generatedAt: input.generatedAt,
            gameweek: input.gameweek,
            value: input.decisionStatuses,
            readiness
          });
          await Promise.all([
            writeJson(path.join(outputDir, "player-dossier-index.json"), {
              schemaVersion: 1,
              runId: input.runId,
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
            }),
            writeReport(outputDir, "evidence-readiness-report.json", "evidence-readiness-report.md", readiness, renderReadinessMarkdown(readiness)),
            writeReport(outputDir, "decision-status-report.json", "decision-status-report.md", statuses, renderDecisionStatusMarkdown(statuses))
          ]);
        } finally {
          db.close();
        }
      }
    },
    {
      id: "player-triggers",
      required: true,
      phase: 4,
      artifacts: [
        artifact("trigger-evaluation.json"),
        artifact("trigger-evaluation.md"),
        artifact("evidence-store-manifest.json"),
        { ...artifact("provisional-decision-workspace.json"), optional: true }
      ],
      run: async ({ outputDir }) => {
        const [projections, currentRole, readiness, statuses] = await Promise.all([
          readArtifactFile(path.join(outputDir, "probabilistic-projections.json"), ProbabilisticProjectionArraySchema),
          readArtifactFile(path.join(outputDir, "current-role-report.json"), CurrentRoleReportSchema),
          readArtifactFile(path.join(outputDir, "evidence-readiness-report.json"), EvidenceReadinessReportSchema),
          readArtifactFile(path.join(outputDir, "decision-status-report.json"), DecisionStatusReportSchema)
        ]);
        const metrics = new Map<string, string | number | boolean>();
        for (const projection of projections) {
          metrics.set(`start_probability:player:${projection.playerId}`, projection.appearance.startProbability);
          metrics.set(`appearance_probability:player:${projection.playerId}`, projection.appearance.appearanceProbability);
        }
        for (const player of input.data.players) {
          metrics.set(`availability:player:${player.id}`, player.status);
          metrics.set(`price:player:${player.id}`, player.price);
          metrics.set(`transfer_status:player:${player.id}`, player.status);
        }
        for (const item of currentRole.items) {
          metrics.set(`source_disagreement:player:${item.playerId}`, item.disagreement);
          metrics.set(`lineup_consensus:player:${item.playerId}`, item.confidence);
        }
        const event = input.data.bootstrap.events.find((item) => item.id === input.gameweek);
        metrics.set("competition_phase:competition:fpl", event?.is_next ? "pre_deadline" : event?.is_current ? "current" : "other");
        const db = openPlayerStore(input.stagedPlayerStorePath);
        try {
          const triggers = evaluateTriggerPlan({
            generatedAt: input.generatedAt,
            gameweek: input.gameweek,
            runId: input.runId,
            value: input.triggerPlan,
            metrics,
            previous: (triggerId) => previousTriggerEvaluation(db, triggerId, input.generatedAt)
          });
          recordTriggerEvaluations(db, input.runId, triggers.evaluations);
          const workspace = buildProvisionalDecisionWorkspace({
            generatedAt: input.generatedAt,
            gameweek: input.gameweek,
            readiness,
            decisionStatuses: statuses,
            triggers
          });
          await writeReport(outputDir, "trigger-evaluation.json", "trigger-evaluation.md", triggers, renderTriggerEvaluationMarkdown(triggers));
          if (workspace) await writeJson(path.join(outputDir, "provisional-decision-workspace.json"), workspace);
          const lineagePaths = [
            "evidence-research-worklist.json", "player-dossier-index.json", "evidence-readiness-report.json",
            "decision-status-report.json", "trigger-evaluation.json",
            ...(workspace ? ["provisional-decision-workspace.json"] : [])
          ];
          recordArtifactLineage(db, {
            runId: input.runId,
            createdAt: input.generatedAt,
            artifacts: await Promise.all(lineagePaths.map(async (relativePath) => ({
              kind: path.basename(relativePath, path.extname(relativePath)),
              path: path.join(input.targetDir, relativePath),
              contentHash: sha256(await readFile(path.join(outputDir, relativePath)))
            })))
          });
          await writeJson(path.join(outputDir, "evidence-store-manifest.json"), buildStoreManifest(db, {
            runId: input.runId,
            gameweek: input.gameweek,
            generatedAt: input.generatedAt,
            mode: input.offline ? "offline" : "live"
          }));
        } finally {
          db.close();
        }
      }
    },
    {
      id: "evidence-summary",
      required: true,
      phase: 3,
      artifacts: [artifact("evidence-report.json", EvidenceReportSchema), artifact("evidence-report.md")],
      run: async ({ outputDir }) => {
        const report = await buildLocalEvidenceReport({
          gameweek: input.gameweek,
          generatedAt: input.generatedAt,
          outputDir,
          reportDir: input.targetDir,
          artifactTimestamp: input.generatedAt
        });
        await writeReport(outputDir, "evidence-report.json", "evidence-report.md", report, renderEvidenceReportMarkdown(report));
      }
    },
    {
      id: "evidence-snapshot",
      required: true,
      phase: 4,
      artifacts: [artifact("evidence-snapshot.json", EvidenceSnapshotSchema)],
      run: async ({ outputDir }) => {
        const fixtureInput = input.data.inputs.find((item) => item.id === "fixtures")!;
        const oddsReport = await readOptionalJson(path.join(outputDir, "odds-report.json"), OddsReportSchema);
        const component = async (
          kind: Parameters<typeof snapshotComponent>[0],
          filePath: string,
          sourceId: string,
          version: string | null,
          retrievedAt: string,
          coverageStatus?: "usable" | "partial" | "no_matching_rows" | "missing",
          matchedRecordCount?: number | null
        ) => snapshotComponent(kind, filePath, sourceId, version, retrievedAt, coverageStatus, matchedRecordCount);
        const components = await Promise.all([
          component("bootstrap", bootstrapInput.path, "src:fpl-bootstrap", null, bootstrapInput.fetchedAt),
          component("fixtures", fixtureInput.path, "src:fpl-fixtures", null, fixtureInput.fetchedAt),
          component("prices", bootstrapInput.path, "src:fpl-bootstrap", null, bootstrapInput.fetchedAt),
          component("availability", bootstrapInput.path, "src:fpl-bootstrap", null, bootstrapInput.fetchedAt),
          component("ownership", bootstrapInput.path, "src:fpl-bootstrap", null, bootstrapInput.fetchedAt),
          component("team_news", path.join(outputDir, "team-news-report.json"), "src:team-news-report", null, input.generatedAt),
          component("predicted_lineups", path.join(outputDir, "current-role-report.json"), "src:current-role-report", null, input.generatedAt),
          component("set_pieces", path.join(outputDir, "set-pieces-report.json"), "src:set-pieces-report", null, input.generatedAt),
          component(
            "betting_markets",
            path.join(outputDir, "odds-report.json"),
            "src:odds-report",
            null,
            input.generatedAt,
            !oddsReport || oddsReport.summary.matchedFixtures === 0
              ? "no_matching_rows"
              : oddsReport.summary.coverageStatus === "covered"
                ? "usable"
                : oddsReport.summary.coverageStatus,
            oddsReport?.summary.matchedFixtures ?? 0
          ),
          component("projection_model", path.join(outputDir, "projections.json"), "src:projection-model", "0.0.15", input.generatedAt),
          component("appearance_model", path.join(outputDir, "projection-uncertainty-report.json"), "src:appearance-model", "0.0.12", input.generatedAt),
          input.agentRoleEvidence
            ? {
                kind: "manual_overrides" as const,
                status: "available" as const,
                sourceId: "src:agent-role-evidence",
                version: null,
                observedAt: input.generatedAt,
                retrievedAt: input.generatedAt,
                contentHash: sha256(JSON.stringify(input.agentRoleEvidence)),
                coverageStatus: "usable" as const,
                matchedRecordCount: null
              }
            : {
                kind: "manual_overrides" as const,
                status: "not_applicable" as const,
                sourceId: null,
                version: null,
                observedAt: null,
                retrievedAt: null,
                contentHash: null,
                coverageStatus: "not_applicable" as const,
                matchedRecordCount: 0
              }
        ]);
        const snapshotId = `snapshot:${sha256(JSON.stringify(components))}`;
        await writeJson(path.join(outputDir, "evidence-snapshot.json"), {
          snapshotId,
          createdAt: input.generatedAt,
          components
        });
      }
    }
  ];
}

export async function refresh(input: {
  requestedGameweek: string;
  offline: boolean;
  concurrency?: number;
  now?: Date;
  runId?: string;
  rawDir?: string;
  processedDir?: string;
  recommendationsDir?: string;
  temporaryRoot?: string;
  fetchImpl?: typeof fetch;
  agentRoleEvidencePath?: string;
  decisionStatusesPath?: string;
  triggerPlanPath?: string;
  playerStorePath?: string;
  playerConcurrency?: number;
  summaryRetryDelaysMs?: number[];
}) {
  const now = input.now ?? new Date();
  const runId = input.runId ?? `${now.toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
  const data = await acquireRefreshData({
    offline: input.offline,
    runId,
    now,
    rawDir: input.rawDir,
    processedDir: input.processedDir,
    temporaryRoot: input.temporaryRoot,
    fetchImpl: input.fetchImpl,
    playerConcurrency: input.playerConcurrency,
    summaryRetryDelaysMs: input.summaryRetryDelaysMs
  });
  const gameweek = resolveGameweek(data.bootstrap, input.requestedGameweek);
  const deadline = resolveDeadline(data.bootstrap, gameweek, now);
  const targetDir = path.join(
    input.recommendationsDir ?? path.join("packages", "content", "recommendations"),
    `gw-${gameweek}`
  );
  const agentRoleEvidence = await readAgentRoleEvidence(
    input.agentRoleEvidencePath ?? path.join("packages", "content", "context", "agent-role-evidence.json")
  );
  const decisionStatuses = await readOptionalJson(
    input.decisionStatusesPath ?? path.join("packages", "content", "context", "decision-statuses.json"),
    DecisionStatusInputSchema
  );
  const triggerPlan = await readOptionalJson(
    input.triggerPlanPath ?? path.join("packages", "content", "context", "trigger-plan.json"),
    TriggerPlanSchema
  );
  const playerStorePath = input.playerStorePath ?? (input.recommendationsDir
    ? path.join(path.dirname(input.recommendationsDir), "player-intelligence.sqlite")
    : path.join("data", "player-intelligence", "player-intelligence.sqlite"));
  const stagedPlayerStorePath = path.join(
    input.temporaryRoot ?? path.join("data", "cache", "refresh-inputs"),
    runId,
    "player-intelligence.sqlite"
  );
  await clonePlayerStore(playerStorePath, stagedPlayerStorePath, now.toISOString());
  const sidecars: RefreshSidecar[] = [{
    id: "player-intelligence",
    stagedPath: stagedPlayerStorePath,
    targetPath: playerStorePath,
    validate: async (filePath) => validatePlayerStore(filePath)
  }];
  const result = await runRefresh({
    gameweek,
    mode: input.offline ? "offline" : "live",
    targetDir,
    stages: buildStages({
      runId,
      gameweek,
      generatedAt: now.toISOString(),
      now,
      offline: input.offline,
      rawDir: input.rawDir ?? path.join("data", "raw"),
      fetchImpl: input.fetchImpl,
      deadline,
      targetDir,
      data,
      agentRoleEvidence,
      stagedPlayerStorePath,
      decisionStatuses,
      triggerPlan
    }),
    inputs: data.inputs,
    deadline,
    concurrency: input.concurrency ?? 3,
    runId,
    beforePromote: data.publish,
    sidecars
  });

  return { ...result, gameweek, targetDir };
}

async function main() {
  const requestedGameweek = argValue("--gw") ?? "auto";
  const result = await refresh({
    requestedGameweek,
    offline: process.argv.includes("--offline")
  });

  console.log(`Refresh ${result.manifest.status} for GW${result.gameweek}.`);
  console.log(`Manifest: ${path.join(result.targetDir, "refresh-manifest.json")}`);

  if (!result.promoted) {
    if (result.stagingDir) {
      console.error(`Previous evidence preserved. Failed run: ${result.stagingDir}`);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
