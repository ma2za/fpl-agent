import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

type BootstrapPlayer = {
  id: number;
  first_name: string;
  second_name: string;
  web_name: string;
  team: number;
  element_type: number;
  now_cost: number;
  status: string;
  chance_of_playing_next_round: number | null;
  news: string;
  minutes: number;
  starts: number;
  total_points: number;
  goals_scored: number;
  assists: number;
  expected_goals: string | number;
  expected_assists: string | number;
  expected_goal_involvements: string | number;
};

type Projection = {
  playerId: number;
  appearance: {
    startProbability: number;
    appearanceProbability: number;
    overallEvidenceConfidence: number;
    roleClass?: string;
    roleState?: string;
    reasonCodes: string[];
    contradictions: Array<{ code: string; message: string }>;
  };
  roleAdjustedProjection: number;
  median: number;
  p10: number;
  p90: number;
};

type RoleRecord = {
  signal: "supports_start" | "opposes_start" | "neutral";
  note: string;
  observationIds: string[];
  rootSourceIds: string[];
};

type CurrentRoleReport = {
  generatedAt: string;
  sources: Array<{ id: string; publisher: string; canonicalUrl: string }>;
  items: Array<{
    playerId: number;
    dimensions: Record<string, RoleRecord[]>;
  }>;
};

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function number(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function position(elementType: number) {
  return ["", "GKP", "DEF", "MID", "FWD"][elementType] ?? "UNKNOWN";
}

function performanceLabel(delta: number) {
  if (delta > 0.05) return "OVER";
  if (delta < -0.05) return "UNDER";
  return "IN_LINE";
}

export async function generateLikelyStarterRefresh(input: {
  gameweek: number;
  threshold?: number;
  generatedAt?: string;
  rootDir?: string;
}) {
  const rootDir = input.rootDir ?? process.cwd();
  const threshold = input.threshold ?? 0.7;
  if (!Number.isInteger(input.gameweek) || input.gameweek < 1) throw new Error("Gameweek must be a positive integer.");
  if (threshold < 0 || threshold > 1) throw new Error("Threshold must be between zero and one.");

  const outputDir = path.join(rootDir, "packages", "content", "recommendations", `gw-${input.gameweek}`);
  const [bootstrap, projections, roleReport] = await Promise.all([
    readFile(path.join(rootDir, "data", "raw", "bootstrap-static.json"), "utf8").then(JSON.parse) as Promise<{
      events: Array<{ id: number; deadline_time: string }>;
      teams: Array<{ id: number; name: string; short_name: string }>;
      elements: BootstrapPlayer[];
    }>,
    readFile(path.join(outputDir, "probabilistic-projections.json"), "utf8").then(JSON.parse) as Promise<Projection[]>,
    readFile(path.join(outputDir, "current-role-report.json"), "utf8").then(JSON.parse) as Promise<CurrentRoleReport>
  ]);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const playerById = new Map(bootstrap.elements.map((player) => [player.id, player]));
  const teamById = new Map(bootstrap.teams.map((team) => [team.id, team]));
  const roleByPlayer = new Map(roleReport.items.map((item) => [item.playerId, item]));
  const sourceById = new Map(roleReport.sources.map((source) => [source.id, source]));

  const materialEvidence = (playerId: number) => {
    const records = Object.values(roleByPlayer.get(playerId)?.dimensions ?? {}).flat()
      .filter((record) => record.observationIds.length > 0 && !record.observationIds.every((id) => id.startsWith("role-obs:fpl-availability-")));
    return records.map((record) => ({
      signal: record.signal,
      note: record.note,
      sources: record.rootSourceIds.flatMap((id) => {
        const source = sourceById.get(id);
        return source ? [{ publisher: source.publisher, url: source.canonicalUrl }] : [];
      })
    }));
  };

  const rows = projections.flatMap((projection) => {
    if (projection.appearance.startProbability < threshold) return [];
    const player = playerById.get(projection.playerId);
    if (!player) return [];
    const team = teamById.get(player.team);
    const goals = player.goals_scored;
    const assists = player.assists;
    const expectedGoals = number(player.expected_goals);
    const expectedAssists = number(player.expected_assists);
    const expectedGoalInvolvements = number(player.expected_goal_involvements);
    const attackingReturnDelta = goals + assists - expectedGoalInvolvements;
    return [{
      playerId: player.id,
      name: `${player.first_name} ${player.second_name}`.trim(),
      webName: player.web_name,
      team: team?.name ?? `Team ${player.team}`,
      teamShortName: team?.short_name ?? String(player.team),
      position: position(player.element_type),
      price: round(player.now_cost / 10, 1),
      availability: {
        status: player.status,
        officialChanceNextRound: player.chance_of_playing_next_round,
        officialNews: player.news
      },
      forecast: {
        startProbability: projection.appearance.startProbability,
        appearanceProbability: projection.appearance.appearanceProbability,
        expectedPoints: projection.roleAdjustedProjection,
        median: projection.median,
        p10: projection.p10,
        p90: projection.p90,
        roleClass: projection.appearance.roleClass ?? null,
        roleState: projection.appearance.roleState ?? null,
        evidenceConfidence: projection.appearance.overallEvidenceConfidence,
        reasonCodes: projection.appearance.reasonCodes,
        contradictions: projection.appearance.contradictions
      },
      seasonToDate: {
        starts: player.starts,
        minutes: player.minutes,
        points: player.total_points,
        pointsPer90: player.minutes > 0 ? round(player.total_points / player.minutes * 90, 2) : null,
        goals,
        assists,
        expectedGoals: round(expectedGoals),
        expectedAssists: round(expectedAssists),
        expectedGoalInvolvements: round(expectedGoalInvolvements),
        goalDelta: round(goals - expectedGoals),
        assistDelta: round(assists - expectedAssists),
        attackingReturnDelta: round(attackingReturnDelta),
        attackingReturnPerformance: performanceLabel(attackingReturnDelta)
      },
      materialEvidence: materialEvidence(player.id)
    }];
  }).sort((a, b) => b.forecast.expectedPoints - a.forecast.expectedPoints || b.forecast.startProbability - a.forecast.startProbability);

  const excludedWatch = projections.flatMap((projection) => {
    if (projection.appearance.startProbability >= threshold) return [];
    const evidence = materialEvidence(projection.playerId);
    if (!evidence.some((item) => item.signal === "opposes_start")) return [];
    const player = playerById.get(projection.playerId);
    if (!player) return [];
    return [{
      playerId: player.id,
      webName: player.web_name,
      team: teamById.get(player.team)?.short_name ?? String(player.team),
      startProbability: projection.appearance.startProbability,
      appearanceProbability: projection.appearance.appearanceProbability,
      expectedPoints: projection.roleAdjustedProjection,
      evidence
    }];
  }).sort((a, b) => b.startProbability - a.startProbability);

  const byPerformance = [...rows].sort((a, b) => b.seasonToDate.attackingReturnDelta - a.seasonToDate.attackingReturnDelta);
  const report = {
    schemaVersion: 1,
    generatedAt,
    gameweek: input.gameweek,
    deadline: bootstrap.events.find((event) => event.id === input.gameweek)?.deadline_time ?? null,
    likelyStartThreshold: threshold,
    methodology: {
      likelyStarter: `startProbability >= ${threshold}`,
      overUnderPerformance: "Actual goals plus assists minus expected goal involvements through the latest completed gameweek; descriptive, not predictive.",
      inLineTolerance: 0.05,
      oddsCalibration: "unavailable"
    },
    summary: {
      likelyStarters: rows.length,
      officialAvailabilityFlags: rows.filter((row) => row.availability.status !== "a" ||
        (row.availability.officialChanceNextRound !== null && row.availability.officialChanceNextRound < 100)).length,
      materialEvidencePlayers: rows.filter((row) => row.materialEvidence.length > 0).length,
      excludedRiskWatch: excludedWatch.length
    },
    warnings: [
      "The live odds provider failed twice, so scorer and clean-sheet components use the repository's heuristic fallback.",
      "Early-season over/under-performance deltas are small-sample descriptive signals and should regress toward underlying rates."
    ],
    leaders: {
      projectedPoints: rows.slice(0, 10).map((row) => ({ playerId: row.playerId, webName: row.webName, team: row.teamShortName, expectedPoints: row.forecast.expectedPoints, startProbability: row.forecast.startProbability })),
      attackingOverperformance: byPerformance.slice(0, 10).map((row) => ({ playerId: row.playerId, webName: row.webName, team: row.teamShortName, delta: row.seasonToDate.attackingReturnDelta })),
      attackingUnderperformance: byPerformance.slice(-10).reverse().map((row) => ({ playerId: row.playerId, webName: row.webName, team: row.teamShortName, delta: row.seasonToDate.attackingReturnDelta }))
    },
    excludedRiskWatch: excludedWatch,
    players: rows
  };
  const markdown = `# GW${input.gameweek} likely-starter refresh\n\nGenerated: ${generatedAt}\n\nDeadline: ${report.deadline ?? "unknown"}\n\nThreshold: P(start) >= ${(threshold * 100).toFixed(0)}%\n\nLikely starters: ${rows.length}\n\nMarket odds: unavailable; heuristic projection fallback active.\n\n## Material risk watch\n\n${excludedWatch.map((item) => `- ${item.webName} (${item.team}): P(start) ${(item.startProbability * 100).toFixed(1)}%, ${item.evidence.map((evidence) => evidence.note).join(" ")}`).join("\n") || "- None"}\n\n## All likely starters\n\n| Player | Team | Pos | P(start) | P(appear) | xPts | P10 | Median | P90 | Starts | Min | Pts | G+A-xGI | Perf | News / role evidence |\n| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |\n${rows.map((row) => `| ${row.webName} | ${row.teamShortName} | ${row.position} | ${(row.forecast.startProbability * 100).toFixed(1)}% | ${(row.forecast.appearanceProbability * 100).toFixed(1)}% | ${row.forecast.expectedPoints.toFixed(1)} | ${row.forecast.p10.toFixed(1)} | ${row.forecast.median.toFixed(1)} | ${row.forecast.p90.toFixed(1)} | ${row.seasonToDate.starts} | ${row.seasonToDate.minutes} | ${row.seasonToDate.points} | ${row.seasonToDate.attackingReturnDelta.toFixed(2)} | ${row.seasonToDate.attackingReturnPerformance} | ${row.materialEvidence.map((evidence) => evidence.note).join(" ") || row.availability.officialNews || "No material current update"} |`).join("\n")}\n\n## Interpretation\n\nOver/under performance is actual goals plus assists minus expected goal involvements through GW4. It is descriptive and is not added to the GW5 projection.\n`;

  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDir, "likely-starter-refresh.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(path.join(outputDir, "likely-starter-refresh.md"), markdown, "utf8")
  ]);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gameweek = Number(argValue("--gw"));
  const threshold = Number(argValue("--threshold") ?? 0.7);
  generateLikelyStarterRefresh({ gameweek, threshold }).then((report) => {
    console.log(`Wrote GW${gameweek} likely-starter refresh for ${report.players.length} players.`);
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
