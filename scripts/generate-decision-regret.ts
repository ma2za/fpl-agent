import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GameweekPostmortemSchema } from "../packages/agent/src/postmortem";
import {
  DEFAULT_PLAYER_STORE_PATH,
  buildDecisionRegretReport,
  migratePlayerStore,
  openPlayerStore,
  readGameweekArchive,
  recordDecisionRegretReport,
  scoreRegretCandidate,
  stableJson
} from "../packages/player-store/src";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

type PoolPlayer = { id: number; position: "GKP" | "DEF" | "MID" | "FWD"; teamId: number; price: number; status: string };
type FrontierCandidate = {
  candidateId: string;
  scenarioId: string;
  horizon: number;
  playerIds: number[];
  startingXI: number[];
  benchOrder: number[];
  constraints: { budget: number };
};

function collectPlayers(value: unknown, players = new Map<number, PoolPlayer>()) {
  if (Array.isArray(value)) {
    for (const item of value) collectPlayers(item, players);
  } else if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    if (typeof item.id === "number" && ["GKP", "DEF", "MID", "FWD"].includes(String(item.position)) && typeof item.teamId === "number" && typeof item.price === "number") {
      players.set(item.id, item as PoolPlayer);
    }
    for (const child of Object.values(item)) collectPlayers(child, players);
  }
  return players;
}

function addStoredPlayers(db: ReturnType<typeof openPlayerStore>, playerIds: number[], deadline: string, players: Map<number, PoolPlayer>) {
  const snapshot = db.prepare(`SELECT player_id, position, team_id, price, status FROM player_snapshots
    WHERE player_id = ? AND observed_at <= ? ORDER BY observed_at DESC, rowid DESC LIMIT 1`);
  for (const playerId of playerIds) {
    if (players.has(playerId)) continue;
    const row = snapshot.get(playerId, deadline) as { player_id: number; position: PoolPlayer["position"]; team_id: number; price: number; status: string } | undefined;
    if (row) players.set(playerId, { id: row.player_id, position: row.position, teamId: row.team_id, price: row.price, status: row.status });
  }
}

function candidatePicks(playerIds: number[], startingXI: Set<number>, benchOrder: number[], players: Map<number, PoolPlayer>) {
  const order = new Map(benchOrder.map((playerId, index) => [playerId, index]));
  return playerIds.map((playerId) => {
    const player = players.get(playerId);
    if (!player) throw new Error(`Archived player pool is missing player ${playerId}.`);
    const role = startingXI.has(playerId) ? "starter" as const : "bench" as const;
    return {
      playerId, position: player.position, teamId: player.teamId, price: player.price, role,
      benchOrder: role === "bench" ? order.get(playerId) ?? null : null,
      availableAtDeadline: player.status !== "u"
    };
  });
}

function markdown(report: ReturnType<typeof buildDecisionRegretReport>) {
  return `# Decision Regret: GW${report.gameweek}\n\nComparator: ${report.comparatorCandidateId}\n\n| Component | From | To | Points |\n| --- | --- | --- | ---: |\n${report.components.map((item) => `| ${item.category} | ${item.fromCandidateId} | ${item.toCandidateId} | ${item.points} |`).join("\n")}\n\n- Agent decision regret: ${report.totals.agentDecisionRegret}\n- Manager override regret: ${report.totals.managerOverrideRegret}\n- Submitted regret: ${report.totals.submittedRegret}\n\n## Attribution\n\n${report.causalAttributions.map((item) => `- ${item.stage}: ${item.status}. ${item.note}`).join("\n")}\n`;
}

async function derivedRequest(gameweek: number, db: ReturnType<typeof openPlayerStore>) {
  const directory = path.join("data", "gameweek-archive", `gw-${gameweek}`);
  const archive = readGameweekArchive(db, gameweek);
  if (!archive) throw new Error(`GW${gameweek} must be archived before regret analysis.`);
  const postmortem = GameweekPostmortemSchema.parse(JSON.parse(await readFile(path.join("packages", "content", "postmortems", `gw-${gameweek}.json`), "utf8")));
  const players = collectPlayers(JSON.parse(await readFile(path.join(directory, "budget-tiers.json"), "utf8")));
  const counterfactualPath = "counterfactuals/gw2-one-free-transfer/counterfactual-set.json";
  const counterfactual = JSON.parse(await readFile(path.join(directory, counterfactualPath), "utf8")) as {
    generatedAt: string;
    candidates: FrontierCandidate[];
  };
  const projections = JSON.parse(await readFile(path.join(directory, "probabilistic-projections.json"), "utf8")) as Array<{
    playerId: number;
    roleAdjustedProjection: number;
  }>;
  const frontier = counterfactual.candidates.filter((candidate) => candidate.horizon === 1);
  addStoredPlayers(db, [
    ...frontier.flatMap((candidate) => candidate.playerIds),
    ...postmortem.submittedSelection.picks.map((pick) => pick.playerId)
  ], archive.deadline, players);
  const legalFrontier = frontier.filter((candidate) => candidate.playerIds.every((playerId) => players.get(playerId)?.status !== "u"));
  const excludedUnavailableCandidates = frontier.length - legalFrontier.length;
  const latest = db.prepare("SELECT MAX(observed_at) AS observed_at FROM gameweek_outcome_batches WHERE gameweek = ? AND finalized = 1").get(gameweek) as { observed_at: string | null };
  if (!latest.observed_at) throw new Error(`GW${gameweek} has no finalized outcome batch.`);
  const chips = ["wildcard", "free_hit", "bench_boost", "triple_captain"] as const;
  const counterfactualHash = archive.artifacts.find((artifact) => artifact.path === counterfactualPath)?.contentHash;
  if (!counterfactualHash) throw new Error("Frozen archive is missing the retained counterfactual set.");
  const projectionById = new Map(projections.map((projection) => [projection.playerId, projection.roleAdjustedProjection]));
  const retainedCandidates = legalFrontier.map((candidate) => {
    const captains = [...candidate.startingXI].sort((a, b) =>
      (projectionById.get(b) ?? 0) - (projectionById.get(a) ?? 0) || a - b);
    return {
      candidateId: candidate.candidateId,
      origin: "archived_candidate" as const,
      sourceRef: counterfactualPath,
      sourceContentHash: counterfactualHash,
      frozenAt: counterfactual.generatedAt,
      picks: candidatePicks(candidate.playerIds, new Set(candidate.startingXI), candidate.benchOrder, players),
      captainPlayerId: captains[0],
      viceCaptainPlayerId: captains[1],
      budgetLimit: candidate.constraints.budget,
      freeTransfersAvailable: 1,
      transfersUsed: candidate.scenarioId === "roll" ? 0 : 1,
      hitPoints: 0,
      chip: null,
      chipsAvailable: [...chips]
    };
  });
  const agent = retainedCandidates.find((candidate) => candidate.candidateId === postmortem.aiSelection.candidateId);
  if (!agent) throw new Error("Selected GW2 candidate is missing from the retained horizon-one frontier.");
  const submittedIds = postmortem.submittedSelection.picks.map((pick) => pick.playerId);
  const submittedBench = postmortem.submittedSelection.picks.filter((pick) => pick.role === "bench").map((pick) => pick.playerId);
  const submitted = {
    candidateId: "submitted-manager-team", origin: "submitted_team" as const, sourceRef: postmortem.source, sourceContentHash: null, frozenAt: archive.deadline,
    picks: candidatePicks(submittedIds, new Set(postmortem.submittedSelection.picks.filter((pick) => pick.role === "starter").map((pick) => pick.playerId)), submittedBench, players),
    captainPlayerId: postmortem.submittedSelection.captainPlayerId, viceCaptainPlayerId: postmortem.submittedSelection.viceCaptainPlayerId,
    budgetLimit: 100, freeTransfersAvailable: 1, transfersUsed: postmortem.manager.transfers, hitPoints: 0, chip: null, chipsAvailable: [...chips]
  };
  const outcomeStatement = db.prepare(`SELECT o.points, o.appearances FROM player_gameweek_outcomes o
    JOIN gameweek_outcome_batches b ON b.batch_id = o.batch_id
    WHERE o.gameweek = ? AND o.player_id = ? AND b.finalized = 1
    ORDER BY o.effective_at DESC, o.observed_at DESC, o.rowid DESC LIMIT 1`);
  const outcomeIds = [...new Set(retainedCandidates.flatMap((candidate) => candidate.picks.map((pick) => pick.playerId)))];
  const outcomes = new Map(outcomeIds.map((playerId) => {
    const row = outcomeStatement.get(gameweek, playerId) as { points: number; appearances: number };
    return [playerId, row] as const;
  }));
  const retainedResults = retainedCandidates.map((candidate) => scoreRegretCandidate(candidate, outcomes)).sort((a, b) =>
    b.actualPoints - a.actualPoints || Number(b.candidateId === agent.candidateId) - Number(a.candidateId === agent.candidateId) || a.candidateId.localeCompare(b.candidateId));
  const comparator = retainedResults[0];
  const ids = (candidate: typeof agent) => candidate.picks.map((pick) => pick.playerId).sort((a, b) => a - b).join(",");
  const starters = (candidate: typeof agent) => candidate.picks.filter((pick) => pick.role === "starter").map((pick) => pick.playerId).sort((a, b) => a - b).join(",");
  const bestCandidate = retainedCandidates.find((candidate) => candidate.candidateId === comparator.candidateId)!;
  const category = ids(bestCandidate) !== ids(agent) ? "squad" as const
    : starters(bestCandidate) !== starters(agent) ? "bench" as const
      : bestCandidate.captainPlayerId !== agent.captainPlayerId ? "captaincy" as const : "substitution" as const;
  return {
    schemaVersion: 1, archiveId: archive.archiveId, gameweek, generatedAt: latest.observed_at,
    agentCandidateId: agent.candidateId,
    submittedCandidateId: submitted.candidateId,
    candidates: [...retainedCandidates, submitted],
    agentRegretPath: comparator.candidateId === agent.candidateId ? [] : [{ fromCandidateId: comparator.candidateId, toCandidateId: agent.candidateId, category }],
    triggerAudits: [],
    causalAttributions: [
      { stage: "source", status: "not_applicable", evidenceIds: [], note: "No source-specific miss can be isolated from the retained artifacts." },
      { stage: "transformation", status: "not_applicable", evidenceIds: [], note: "No transformation defect is established by the outcome alone." },
      { stage: "assumption", status: "not_applicable", evidenceIds: [], note: "No assumption-specific miss is established by the outcome alone." },
      { stage: "forecast", status: "supported", evidenceIds: ["probabilistic-projections.json"], note: `The selected candidate scored ${postmortem.aiSelection.actualPointsCounterfactual} against ${postmortem.aiSelection.projectedPoints} projected points, but the model ranked it above a retained candidate that realized ${comparator.actualPoints}.` },
      { stage: "candidate_generation", status: excludedUnavailableCandidates === 0 ? "supported" : "unsupported", evidenceIds: [counterfactualPath], note: excludedUnavailableCandidates === 0 ? `All ${retainedCandidates.length} retained horizon-one legal candidates were replayed.` : `${excludedUnavailableCandidates} retained candidates contained an unavailable player and were excluded from the legal comparator; ${retainedCandidates.length} legal candidates were replayed.` },
      { stage: "simulation", status: "supported", evidenceIds: ["counterfactuals/gw2-one-free-transfer/structure-simulation.json"], note: "The full pre-deadline simulation and its sample-level candidate totals remain archived." },
      { stage: "evidence_gap", status: "not_applicable", evidenceIds: ["archive-manifest.json"], note: "The retained horizon-one frontier is complete for the declared candidate-generation request." },
      { stage: "agent_decision", status: comparator.candidateId === agent.candidateId ? "not_applicable" : "supported", evidenceIds: ["decision-record.json", counterfactualPath], note: comparator.candidateId === agent.candidateId ? "The selected agent candidate tied or led the retained frontier on realized points." : "A better realized result existed in the frozen frontier; this is measured without adding hindsight-only players." },
      { stage: "manager_override", status: "supported", evidenceIds: [postmortem.source], note: "The submitted manager overrides are measured independently from the agent selection." },
      { stage: "normal_outcome_variance", status: "supported", evidenceIds: ["official-finalized-outcomes"], note: "Single-gameweek realized points remain noisy relative to pre-deadline forecasts." }
    ]
  };
}

async function main() {
  const gameweek = Number(argument("--gw") ?? 1);
  const inputPath = argument("--input");
  const storePath = argument("--store") ?? DEFAULT_PLAYER_STORE_PATH;
  const db = openPlayerStore(storePath);
  try {
    migratePlayerStore(db);
    const request = inputPath ? JSON.parse(await readFile(inputPath, "utf8")) : await derivedRequest(gameweek, db);
    const report = buildDecisionRegretReport(db, request);
    const result = recordDecisionRegretReport(db, report);
    const outputDirectory = path.join("data", "gameweek-archive", "regret");
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, `gw-${report.gameweek}.json`), `${stableJson(report)}\n`);
    await writeFile(path.join(outputDirectory, `gw-${report.gameweek}.md`), markdown(report));
    console.log(`GW${report.gameweek} regret ${result.inserted ? "stored" : "verified"}: ${report.totals.submittedRegret} points.`);
  } finally {
    db.close();
  }
}

main();
