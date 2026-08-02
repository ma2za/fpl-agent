import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  EvidenceReportSchema,
  FixtureHorizonReportSchema,
  FixtureTickerSchema,
  MinutesRiskReportSchema,
  OddsReportSchema,
  PlayerProjectionArraySchema,
  PublicEvidenceReportSchema,
  RecommendationArtifactSchema,
  SetPieceReportSchema,
  StrategyEvidenceSchema,
  TeamNewsReportSchema,
  buildFixtureHorizonReport,
  buildFixtureTicker,
  buildMinutesRiskReport,
  buildSetPieceReport,
  buildTeamNewsReport,
  isWeeklyRecommendationArtifact,
  readArtifactFile,
  readArtifactFileIfExists,
  renderEvidenceReportMarkdown,
  renderFixtureHorizonMarkdown,
  renderFixtureTickerMarkdown,
  renderMinutesRiskReportMarkdown,
  renderSetPieceReportMarkdown,
  renderTeamNewsReportMarkdown,
  runRefresh,
  type EvidenceSource,
  type RefreshInput,
  type RefreshStage
} from "../packages/agent/src";
import {
  BootstrapStaticSchema,
  FixtureSchema,
  bootstrapCachePath,
  createFplApiClient,
  fixturesCachePath,
  normalizePlayers,
  readValidatedJsonCache,
  type BootstrapStatic,
  type Fixture,
  type NormalizedPlayer
} from "../packages/fpl-api/src";
import { CURRENT_SQUAD } from "../config/squad";
import { buildLocalEvidenceReport } from "./evidence-sources";
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
  inputs: RefreshInput[];
  publish: () => Promise<void>;
};

const fixtureArraySchema = FixtureSchema.array();

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
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
}): Promise<AcquiredRefreshData> {
  const rawDir = input.rawDir ?? path.join("data", "raw");
  const processedDir = input.processedDir ?? path.join("data", "processed");
  const bootstrapPath = bootstrapCachePath(rawDir);
  const fixturesPath = fixturesCachePath(rawDir);
  let bootstrap: BootstrapStatic;
  let fixtures: Fixture[];
  let sourceBootstrapPath = bootstrapPath;
  let sourceFixturesPath = fixturesPath;

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
    const temporaryDir = path.join(
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
    inputs,
    publish: input.offline
      ? async () => undefined
      : async () => {
        await mkdir(rawDir, { recursive: true });
        await mkdir(processedDir, { recursive: true });
        await writeJsonAtomic(bootstrapPath, bootstrap);
        await writeJsonAtomic(fixturesPath, fixtures);
        await writeJsonAtomic(path.join(processedDir, "players.json"), players);
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
  gameweek: number;
  generatedAt: string;
  now: Date;
  offline: boolean;
  rawDir: string;
  fetchImpl?: typeof fetch;
  deadline: { status: "open" | "passed" | "unknown"; time: string | null };
  targetDir: string;
  data: AcquiredRefreshData;
}): RefreshStage[] {
  const bootstrapInput = input.data.inputs.find((item) => item.id === "bootstrap")!;
  const recommendationArtifacts = [
    artifact("data-status.json"),
    artifact("projections.json", PlayerProjectionArraySchema),
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
      phase: 1,
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
          benchOrder: selected.benchOrder
        });
        await writeReport(outputDir, "minutes-risk-report.json", "minutes-risk-report.md", report, renderMinutesRiskReportMarkdown(report));
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
    fetchImpl: input.fetchImpl
  });
  const gameweek = resolveGameweek(data.bootstrap, input.requestedGameweek);
  const deadline = resolveDeadline(data.bootstrap, gameweek, now);
  const targetDir = path.join(
    input.recommendationsDir ?? path.join("packages", "content", "recommendations"),
    `gw-${gameweek}`
  );
  const result = await runRefresh({
    gameweek,
    mode: input.offline ? "offline" : "live",
    targetDir,
    stages: buildStages({
      gameweek,
      generatedAt: now.toISOString(),
      now,
      offline: input.offline,
      rawDir: input.rawDir ?? path.join("data", "raw"),
      fetchImpl: input.fetchImpl,
      deadline,
      targetDir,
      data
    }),
    inputs: data.inputs,
    deadline,
    concurrency: input.concurrency ?? 3,
    runId,
    beforePromote: data.publish
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
