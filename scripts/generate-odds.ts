import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildOddsReport,
  aggregateMarketPrices,
  isWeeklyRecommendationArtifact,
  oddsNameKey,
  parseFootballDataCsv,
  readArtifactFileIfExists,
  RecommendationArtifactSchema,
  renderOddsReportMarkdown,
  type EvidenceSource
} from "../packages/agent/src";
import { fetchApiFootballMarkets, fetchTheOddsApiMarkets, ODDS_BUDGETS } from "./odds-provider-client";
import type { Fixture, Team } from "../packages/fpl-api/src";
import { buildFixtureDistributions, type MarketFixtureInput } from "../packages/engine/src";
import { CURRENT_SQUAD } from "../config/squad";

type BootstrapStatic = {
  teams: Team[];
  elements?: Array<{
    id: number;
    team: number;
    first_name: string;
    second_name: string;
    web_name: string;
  }>;
};

const defaultSourceUrl = "https://www.football-data.co.uk/fixtures.csv";

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

async function fileTimestamp(filePath: string) {
  const file = await stat(filePath);

  return file.mtime.toISOString();
}

async function fetchCsv(url: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(url, {
    headers: {
      accept: "text/csv,text/plain,*/*",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "fpl-agent odds evidence"
    }
  });

  if (!response.ok) {
    throw new Error(`Football-Data returned ${response.status} for ${url}`);
  }

  return response.text();
}

export async function generateOddsEvidence(input: {
  gameweek: number;
  outputDir?: string;
  logicalOutputDir?: string;
  rawDir?: string;
  bootstrap?: BootstrapStatic;
  fixtures?: Fixture[];
  sourceUrl?: string;
  offline?: boolean;
  generatedAt?: string;
  log?: boolean;
  fetchImpl?: typeof fetch;
  force?: boolean;
}) {
  const gameweek = input.gameweek;
  const sourceUrl = input.sourceUrl ?? defaultSourceUrl;

  if (!Number.isInteger(gameweek) || gameweek < 1) {
    throw new Error("Usage: pnpm odds -- --gw <gameweek> [--source-url <url>]");
  }

  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const outputDir = input.outputDir ?? path.join("packages", "content", "recommendations", `gw-${gameweek}`);
  const logicalOutputDir = input.logicalOutputDir ?? outputDir;
  const rawDir = input.rawDir ?? path.join("data", "raw", "odds");
  const rawCsvPath = path.join(rawDir, "football-data-fixtures.csv");
  const bootstrap = input.bootstrap ?? await readJson<BootstrapStatic>(path.join("data", "raw", "bootstrap-static.json"));
  const fixtures = input.fixtures ?? await readJson<Fixture[]>(path.join("data", "raw", "fixtures.json"));
  const recommendationArtifact = await readArtifactFileIfExists(
    path.join(outputDir, "recommendation.json"),
    RecommendationArtifactSchema
  );
  const recommendation = recommendationArtifact && isWeeklyRecommendationArtifact(recommendationArtifact)
    ? recommendationArtifact
    : null;
  const apiFootball = await fetchApiFootballMarkets({
    gameweek, teams: bootstrap.teams, fixtures, rawDir, generatedAt,
    force: input.force, offline: input.offline, fetchImpl: input.fetchImpl
  }).catch((error) => ({ events: [], prices: [], result: null, warning: error instanceof Error ? error.message : String(error) }));
  const directCleanSheetMarkets = new Map<string, Set<string>>();
  for (const price of apiFootball.prices) {
    const key = `${oddsNameKey(price.homeTeam)}|${oddsNameKey(price.awayTeam)}`;
    directCleanSheetMarkets.set(key, new Set([...(directCleanSheetMarkets.get(key) ?? []), price.market]));
  }
  const hasBothCleanSheets = (key: string) => {
    const markets = directCleanSheetMarkets.get(key) ?? new Set();
    return (markets.has("clean-sheet-home") || markets.has("team-total-away")) &&
      (markets.has("clean-sheet-away") || markets.has("team-total-home"));
  };
  const needsTeamTotals = new Set(apiFootball.events
    .filter((event) => !hasBothCleanSheets(`${oddsNameKey(event.homeTeam)}|${oddsNameKey(event.awayTeam)}`))
    .map((event) => `${oddsNameKey(event.homeTeam)}|${oddsNameKey(event.awayTeam)}`));
  const theOddsApi = await fetchTheOddsApiMarkets({
    gameweek, teams: bootstrap.teams, fixtures, rawDir, generatedAt, needsTeamTotals,
    force: input.force, offline: input.offline, fetchImpl: input.fetchImpl
  }).catch((error) => ({ events: [], prices: [], result: null, warning: error instanceof Error ? error.message : String(error) }));
  const market = aggregateMarketPrices({
    prices: [...apiFootball.prices, ...theOddsApi.prices],
    teams: bootstrap.teams,
    fixtures,
    players: (bootstrap.elements ?? []).map((player) => ({
      id: player.id, team: player.team, firstName: player.first_name, secondName: player.second_name, webName: player.web_name
    })),
    gameweek,
    fetchedAt: generatedAt
  });
  const freshPrices = [...apiFootball.prices, ...theOddsApi.prices].filter((price) => {
    const age = (Date.parse(generatedAt) - Date.parse(price.fetchedAt)) / 3_600_000;
    return Number.isFinite(age) && age >= 0 && age <= ODDS_BUDGETS.apiFootball.ttlHours;
  });
  const freshMarket = aggregateMarketPrices({
    prices: freshPrices,
    teams: bootstrap.teams,
    fixtures,
    players: (bootstrap.elements ?? []).map((player) => ({
      id: player.id, team: player.team, firstName: player.first_name, secondName: player.second_name, webName: player.web_name
    })),
    gameweek,
    fetchedAt: generatedAt
  });
  const csv = input.offline
    ? await readFile(rawCsvPath, "utf8")
    : await fetchCsv(sourceUrl, input.fetchImpl ?? fetch);

  if (!input.offline) {
    await mkdir(rawDir, { recursive: true });
    await writeFile(rawCsvPath, csv, "utf8");
  }

  const source: EvidenceSource = {
    id: "odds",
    label: "Football-Data fixture odds",
    provider: "Football-Data.co.uk public fixtures CSV",
    url: sourceUrl,
    rawPath: rawCsvPath,
    reportPath: path.join(logicalOutputDir, "odds-report.json"),
    required: true,
    confidence: "medium",
    freshness: {
      status: "fresh",
      checkedAt: generatedAt,
      fetchedAt: await fileTimestamp(rawCsvPath),
      ageHours: null,
      maxAgeHours: 12,
      message: input.offline
        ? "Football-Data odds CSV was loaded from cache."
        : "Football-Data odds CSV was fetched."
    }
  };
  const report = buildOddsReport({
    generatedAt,
    gameweek,
    source,
    csvRows: parseFootballDataCsv(csv),
    snapshot: market.snapshot,
    teams: bootstrap.teams,
    fixtures,
    selectedPlayers: recommendation?.squadBefore.players.map((player) => ({ id: player.id, team: player.teamId })) ??
      (bootstrap.elements ?? []).filter((player) => CURRENT_SQUAD.players.includes(player.id)).map((player) => ({ id: player.id, team: player.team }))
  });
  report.schemaVersion = 2;
  report.sources = [source];
  report.providerResults = [apiFootball.result, theOddsApi.result].filter((value): value is NonNullable<typeof value> => value !== null);
  report.bookmakerPrices = market.bookmakerPrices;
  report.quotaUsage = [
    {
      provider: "api-football.com", requests: apiFootball.result?.requestCount ?? 0, credits: 0,
      reportedRemaining: apiFootball.result?.reportedRemaining ?? null, reportedUsed: apiFootball.result?.reportedUsed ?? null,
      reportedLimit: apiFootball.result?.reportedLimit ?? null, runLimit: ODDS_BUDGETS.apiFootball.perRun,
      periodLimit: ODDS_BUDGETS.apiFootball.perUtcDay, period: "utc-day"
    },
    {
      provider: "the-odds-api.com", requests: theOddsApi.result?.requestCount ?? 0, credits: theOddsApi.result?.creditsUsed ?? 0,
      reportedRemaining: theOddsApi.result?.reportedRemaining ?? null, reportedUsed: theOddsApi.result?.reportedUsed ?? null,
      reportedLimit: theOddsApi.result?.reportedLimit ?? null, runLimit: ODDS_BUDGETS.theOddsApi.perRun,
      periodLimit: ODDS_BUDGETS.theOddsApi.perMonth, period: "calendar-month"
    }
  ];
  report.warnings.push(...[apiFootball.warning, theOddsApi.warning].filter((value): value is string => Boolean(value)));
  const marketInputs: MarketFixtureInput[] = report.matches.map((match) => {
    const fresh = freshMarket.snapshot.matches.find((item) => oddsNameKey(item.homeTeam) === oddsNameKey(match.homeTeamName) &&
      oddsNameKey(item.awayTeam) === oddsNameKey(match.awayTeamName));
    return {
      fixtureId: match.fixtureId,
      homeWinProbability: fresh?.homeWinProbability ?? null,
      drawProbability: fresh?.drawProbability ?? null,
      awayWinProbability: fresh?.awayWinProbability ?? null,
      over25Probability: fresh?.over25Probability ?? null,
      under25Probability: fresh?.under25Probability ?? null,
      homeCleanSheetProbability: fresh?.homeCleanSheetProbability ?? null,
      awayCleanSheetProbability: fresh?.awayCleanSheetProbability ?? null,
      evidenceIds: freshMarket.bookmakerPrices.filter((price) => price.fixtureId === match.fixtureId).map((price) => price.sourceId)
    };
  });
  const fixtureTeamIds = new Set(fixtures.filter((fixture) => fixture.event === gameweek)
    .flatMap((fixture) => [fixture.team_h, fixture.team_a]));
  const teamsById = new Map(bootstrap.teams.map((team) => [team.id, team]));
  const strengthTeams = [...fixtureTeamIds].map((id) => {
    const team = teamsById.get(id);
    const home = team?.strength_overall_home;
    const away = team?.strength_overall_away;
    if (typeof home === "number" && home > 0 && typeof away === "number" && away > 0) {
      return { id, strength_overall_home: home, strength_overall_away: away };
    }
    report.warnings.push(`Team ${id} lacks FPL overall-strength inputs; neutral heuristic strength was used.`);
    return { id, strength_overall_home: 1, strength_overall_away: 1 };
  });
  const heuristicDistributions = buildFixtureDistributions({ gameweek, teams: strengthTeams, fixtures });
  const fixtureDistributions = buildFixtureDistributions({ gameweek, teams: strengthTeams, fixtures, marketInputs });
  const distributionByFixture = new Map(fixtureDistributions.map((distribution) => [distribution.fixtureId, distribution]));
  for (const match of report.matches) {
    const distribution = distributionByFixture.get(match.fixtureId);
    if (!distribution || distribution.expectedGoalsMethod !== "MARKET_IMPLIED_EXPECTED_GOALS") continue;
    match.homeTeamGoalsExpected = distribution.homeExpectedGoals;
    match.awayTeamGoalsExpected = distribution.awayExpectedGoals;
  }
  const marketGoalMatches = report.matches.filter((match) => match.homeTeamGoalsExpected !== null && match.awayTeamGoalsExpected !== null).length;
  report.summary.marketCoverage.teamGoals = marketGoalMatches === report.matches.length && report.matches.length > 0
    ? "covered"
    : marketGoalMatches > 0 ? "partial" : "missing";
  for (const signal of report.teamSignals) {
    const match = report.matches.find((item) => item.fixtureId === signal.fixtureId);
    if (!match) continue;
    signal.teamGoalsExpected = signal.venue === "H" ? match.homeTeamGoalsExpected : match.awayTeamGoalsExpected;
    if (signal.teamGoalsExpected !== null) signal.attackSignalSource = "derived";
  }
  const heuristicByFixture = new Map(heuristicDistributions.map((distribution) => [distribution.fixtureId, distribution]));
  const featurePlayers = (bootstrap.elements ?? []).flatMap((player) => {
    const match = report.matches.find((item) => item.homeTeamId === player.team || item.awayTeamId === player.team);
    if (!match) return [];
    const home = match.homeTeamId === player.team;
    const fresh = freshMarket.snapshot.matches.find((item) => oddsNameKey(item.homeTeam) === oddsNameKey(match.homeTeamName) &&
      oddsNameKey(item.awayTeam) === oddsNameKey(match.awayTeamName));
    const scorer = fresh?.anytimeScorer?.find((signal) => signal.playerId === player.id);
    const heuristic = heuristicByFixture.get(match.fixtureId);
    return [{
      playerId: player.id,
      fixtureId: match.fixtureId,
      anytimeScorerProbability: scorer?.probability ?? null,
      cleanSheetProbability: fresh ? (home ? fresh.homeCleanSheetProbability : fresh.awayCleanSheetProbability) : null,
      baselineCleanSheetProbability: heuristic ? Math.exp(-(home ? heuristic.awayExpectedGoals : heuristic.homeExpectedGoals)) : null,
      evidenceIds: freshMarket.bookmakerPrices
        .filter((price) => price.fixtureId === match.fixtureId && (price.playerId === player.id || price.market !== "anytime-scorer"))
        .map((price) => price.sourceId)
    }];
  });

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "odds-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "odds-report.md"), renderOddsReportMarkdown(report), "utf8");
  await writeFile(path.join(outputDir, "fixture-distributions.json"), `${JSON.stringify(fixtureDistributions, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "market-projection-features.json"), `${JSON.stringify({
    schemaVersion: 1,
    generatedAt,
    gameweek,
    pointsModelVersion: "0.0.23",
    players: featurePlayers
  }, null, 2)}\n`, "utf8");
  if (input.log ?? true) {
    console.log(
      `Wrote odds report to ${outputDir}: ${report.summary.matchedFixtures}/${report.summary.gameweekFixtures} GW fixtures matched.`
    );
  }

  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateOddsEvidence({
    gameweek: Number(argValue("--gw") ?? 1),
    sourceUrl: argValue("--source-url") ?? defaultSourceUrl,
    offline: process.argv.includes("--offline"),
    force: process.argv.includes("--force")
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
