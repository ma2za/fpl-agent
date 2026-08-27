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
  stableJson
} from "../packages/player-store/src";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

type PoolPlayer = { id: number; position: "GKP" | "DEF" | "MID" | "FWD"; teamId: number; price: number; status: string };
type DecisionRecord = {
  generatedAt: string;
  squad: { playerIds: number[]; startingXI: number[]; benchOrder: number[]; captainPlayerId: number; viceCaptainPlayerId: number };
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
  const decision = JSON.parse(await readFile(path.join(directory, "decision-record.json"), "utf8")) as DecisionRecord;
  const players = collectPlayers(JSON.parse(await readFile(path.join(directory, "budget-tiers.json"), "utf8")));
  addStoredPlayers(db, [...decision.squad.playerIds, ...postmortem.submittedSelection.picks.map((pick) => pick.playerId)], archive.deadline, players);
  const latest = db.prepare("SELECT MAX(observed_at) AS observed_at FROM gameweek_outcome_batches WHERE gameweek = ? AND finalized = 1").get(gameweek) as { observed_at: string | null };
  if (!latest.observed_at) throw new Error(`GW${gameweek} has no finalized outcome batch.`);
  const chips = ["wildcard", "free_hit", "bench_boost", "triple_captain"] as const;
  const decisionArtifactHash = archive.artifacts.find((artifact) => artifact.path === "decision-record.json")?.contentHash;
  if (!decisionArtifactHash) throw new Error("Frozen archive is missing decision-record.json.");
  const agent = {
    candidateId: postmortem.aiSelection.candidateId, origin: "archived_candidate" as const, sourceRef: "decision-record.json", sourceContentHash: decisionArtifactHash, frozenAt: decision.generatedAt,
    picks: candidatePicks(decision.squad.playerIds, new Set(decision.squad.startingXI), decision.squad.benchOrder, players),
    captainPlayerId: decision.squad.captainPlayerId, viceCaptainPlayerId: decision.squad.viceCaptainPlayerId,
    budgetLimit: 100, freeTransfersAvailable: 0, transfersUsed: 0, hitPoints: 0, chip: null, chipsAvailable: chips
  };
  const submittedIds = postmortem.submittedSelection.picks.map((pick) => pick.playerId);
  const submittedBench = postmortem.submittedSelection.picks.filter((pick) => pick.role === "bench").map((pick) => pick.playerId);
  const submitted = {
    candidateId: "submitted-manager-team", origin: "submitted_team" as const, sourceRef: postmortem.source, sourceContentHash: null, frozenAt: archive.deadline,
    picks: candidatePicks(submittedIds, new Set(postmortem.submittedSelection.picks.filter((pick) => pick.role === "starter").map((pick) => pick.playerId)), submittedBench, players),
    captainPlayerId: postmortem.submittedSelection.captainPlayerId, viceCaptainPlayerId: postmortem.submittedSelection.viceCaptainPlayerId,
    budgetLimit: 100, freeTransfersAvailable: 0, transfersUsed: postmortem.manager.transfers, hitPoints: 0, chip: null, chipsAvailable: chips
  };
  return {
    schemaVersion: 1, archiveId: archive.archiveId, gameweek, generatedAt: latest.observed_at,
    agentCandidateId: agent.candidateId, submittedCandidateId: submitted.candidateId, candidates: [agent, submitted], agentRegretPath: [], triggerAudits: [],
    causalAttributions: [
      { stage: "source", status: "not_applicable", evidenceIds: [], note: "No source-specific miss can be isolated from the retained artifacts." },
      { stage: "transformation", status: "not_applicable", evidenceIds: [], note: "No transformation defect is established by the outcome alone." },
      { stage: "assumption", status: "not_applicable", evidenceIds: [], note: "No assumption-specific miss is established by the outcome alone." },
      { stage: "forecast", status: "supported", evidenceIds: ["probabilistic-projections.json"], note: "The selected squad scored below its frozen expected-points forecast." },
      { stage: "candidate_generation", status: "unsupported", evidenceIds: ["decision-record.json"], note: "Only the selected candidate was retained, so squad-level hindsight regret is unavailable." },
      { stage: "simulation", status: "unsupported", evidenceIds: ["decision-record.json"], note: "No alternative simulation frontier was retained for comparable outcome replay." },
      { stage: "evidence_gap", status: "supported", evidenceIds: ["archive-manifest.json"], note: "Missing retained alternatives prevent structural regret attribution without hindsight." },
      { stage: "agent_decision", status: "not_applicable", evidenceIds: ["decision-record.json"], note: "No better frozen legal candidate exists in the archive for comparison." },
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
