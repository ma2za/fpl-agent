import type Database from "better-sqlite3";
import {
  DecisionRegretReportSchema,
  DecisionRegretRequestSchema,
  type DecisionRegretReport
} from "./types";
import { contentHash, stableId, stableJson } from "./store";

type Candidate = ReturnType<typeof DecisionRegretRequestSchema.parse>["candidates"][number];

function assertLegalCandidate(candidate: Candidate, deadline: string, archivedArtifacts: Map<string, { contentHash: string; kind: string }>) {
  if (Date.parse(candidate.frozenAt) > Date.parse(deadline)) throw new Error(`Candidate ${candidate.candidateId} was not available before the deadline.`);
  const artifact = archivedArtifacts.get(candidate.sourceRef);
  if (candidate.origin === "archived_candidate" && (!artifact || !["candidate", "decision"].includes(artifact.kind) || artifact.contentHash !== candidate.sourceContentHash)) throw new Error(`Candidate ${candidate.candidateId} is not backed by the declared frozen candidate or decision artifact hash.`);
  if (candidate.origin === "submitted_team") {
    if (candidate.sourceContentHash !== null) throw new Error(`Submitted candidate ${candidate.candidateId} cannot claim a frozen artifact hash.`);
    try {
      const source = new URL(candidate.sourceRef);
      if (!["http:", "https:"].includes(source.protocol)) throw new Error();
    } catch {
      throw new Error(`Submitted candidate ${candidate.candidateId} requires an official HTTP source reference.`);
    }
  }
  if (new Set(candidate.picks.map((pick) => pick.playerId)).size !== 15) throw new Error(`Candidate ${candidate.candidateId} contains duplicate players.`);
  if (candidate.picks.some((pick) => !pick.availableAtDeadline)) throw new Error(`Candidate ${candidate.candidateId} contains a player unavailable at the deadline.`);
  const required = { GKP: 2, DEF: 5, MID: 5, FWD: 3 } as const;
  for (const [position, count] of Object.entries(required)) {
    if (candidate.picks.filter((pick) => pick.position === position).length !== count) throw new Error(`Candidate ${candidate.candidateId} has an illegal ${position} count.`);
  }
  const starters = candidate.picks.filter((pick) => pick.role === "starter");
  const bench = candidate.picks.filter((pick) => pick.role === "bench");
  if (starters.length !== 11 || bench.length !== 4) throw new Error(`Candidate ${candidate.candidateId} must contain 11 starters and four substitutes.`);
  const formation = { DEF: 0, MID: 0, FWD: 0 };
  for (const pick of starters) if (pick.position !== "GKP") formation[pick.position] += 1;
  if (starters.filter((pick) => pick.position === "GKP").length !== 1 || formation.DEF < 3 || formation.MID < 2 || formation.FWD < 1) {
    throw new Error(`Candidate ${candidate.candidateId} has an illegal starting formation.`);
  }
  const orders = bench.map((pick) => pick.benchOrder);
  if (orders.some((order) => order === null) || new Set(orders).size !== 4) throw new Error(`Candidate ${candidate.candidateId} has an invalid bench order.`);
  if (starters.some((pick) => pick.benchOrder !== null)) throw new Error(`Candidate ${candidate.candidateId} assigns a bench order to a starter.`);
  if (!starters.some((pick) => pick.playerId === candidate.captainPlayerId) || !starters.some((pick) => pick.playerId === candidate.viceCaptainPlayerId) || candidate.captainPlayerId === candidate.viceCaptainPlayerId) {
    throw new Error(`Candidate ${candidate.candidateId} has invalid captaincy assignments.`);
  }
  const clubs = new Map<number, number>();
  for (const pick of candidate.picks) clubs.set(pick.teamId, (clubs.get(pick.teamId) ?? 0) + 1);
  if ([...clubs.values()].some((count) => count > 3)) throw new Error(`Candidate ${candidate.candidateId} exceeds the three-player club limit.`);
  if (candidate.picks.reduce((sum, pick) => sum + pick.price, 0) > candidate.budgetLimit + 1e-9) throw new Error(`Candidate ${candidate.candidateId} exceeds its available budget.`);
  if (candidate.chip && !candidate.chipsAvailable.includes(candidate.chip)) throw new Error(`Candidate ${candidate.candidateId} uses an unavailable chip.`);
  const expectedHit = candidate.chip === "wildcard" || candidate.chip === "free_hit" ? 0 : Math.max(0, candidate.transfersUsed - candidate.freeTransfersAvailable) * 4;
  if (candidate.hitPoints !== expectedHit) throw new Error(`Candidate ${candidate.candidateId} has inconsistent transfer-hit points.`);
}

function legalFormation(picks: Candidate["picks"]) {
  const count = (position: "GKP" | "DEF" | "MID" | "FWD") => picks.filter((pick) => pick.position === position).length;
  return count("GKP") === 1 && count("DEF") >= 3 && count("MID") >= 2 && count("FWD") >= 1;
}

function assertCategoryChange(category: "squad" | "transfer" | "captaincy" | "bench" | "chip" | "concentration" | "substitution", from: Candidate, to: Candidate) {
  const ids = (candidate: Candidate) => candidate.picks.map((pick) => pick.playerId).sort((a, b) => a - b).join(",");
  const starters = (candidate: Candidate) => candidate.picks.filter((pick) => pick.role === "starter").map((pick) => pick.playerId).sort((a, b) => a - b).join(",");
  const benchOrder = (candidate: Candidate) => candidate.picks.filter((pick) => pick.role === "bench").sort((a, b) => Number(a.benchOrder) - Number(b.benchOrder)).map((pick) => pick.playerId).join(",");
  const exposure = (candidate: Candidate) => {
    const clubs = new Map<number, number>();
    for (const pick of candidate.picks) clubs.set(pick.teamId, (clubs.get(pick.teamId) ?? 0) + 1);
    return [...clubs].sort(([a], [b]) => a - b).map(([club, count]) => `${club}:${count}`).join(",");
  };
  const sameSquad = ids(from) === ids(to);
  const valid = category === "squad" ? !sameSquad
    : category === "transfer" ? !sameSquad && (from.transfersUsed > 0 || to.transfersUsed > 0)
      : category === "captaincy" ? sameSquad && starters(from) === starters(to) && (from.captainPlayerId !== to.captainPlayerId || from.viceCaptainPlayerId !== to.viceCaptainPlayerId)
        : category === "bench" ? sameSquad && starters(from) !== starters(to)
          : category === "chip" ? sameSquad && starters(from) === starters(to) && from.chip !== to.chip
            : category === "concentration" ? !sameSquad && exposure(from) !== exposure(to)
              : sameSquad && starters(from) === starters(to) && benchOrder(from) !== benchOrder(to);
  if (!valid) throw new Error(`Candidate transition ${from.candidateId} -> ${to.candidateId} is mislabeled as ${category} regret.`);
}

function scoreCandidate(candidate: Candidate, outcomes: Map<number, { points: number; appearances: number }>) {
  const appeared = (playerId: number) => (outcomes.get(playerId)?.appearances ?? 0) > 0;
  const autosubstitutions: Array<{ outPlayerId: number; inPlayerId: number }> = [];
  let counted = candidate.picks.filter((pick) => pick.role === "starter");
  if (candidate.chip === "bench_boost") {
    counted = [...candidate.picks];
  } else {
    const bench = candidate.picks.filter((pick) => pick.role === "bench").sort((a, b) => Number(a.benchOrder) - Number(b.benchOrder));
    const used = new Set<number>();
    for (const substitute of bench) {
      if (!appeared(substitute.playerId)) continue;
      const missing = counted.filter((pick) => !appeared(pick.playerId) && !used.has(pick.playerId));
      const outgoing = missing.find((pick) => {
        if (pick.position === "GKP" || substitute.position === "GKP") return pick.position === substitute.position;
        return legalFormation(counted.map((item) => item.playerId === pick.playerId ? substitute : item));
      });
      if (!outgoing) continue;
      counted = counted.map((pick) => pick.playerId === outgoing.playerId ? substitute : pick);
      used.add(outgoing.playerId);
      autosubstitutions.push({ outPlayerId: outgoing.playerId, inPlayerId: substitute.playerId });
    }
  }
  const captainAppeared = appeared(candidate.captainPlayerId);
  const viceAppeared = appeared(candidate.viceCaptainPlayerId);
  const effectiveCaptain = captainAppeared ? candidate.captainPlayerId : viceAppeared ? candidate.viceCaptainPlayerId : null;
  const captainMultiplier = candidate.chip === "triple_captain" ? 3 : 2;
  let actualPoints = counted.reduce((sum, pick) => sum + (outcomes.get(pick.playerId)?.points ?? 0), 0) - candidate.hitPoints;
  if (effectiveCaptain) actualPoints += (outcomes.get(effectiveCaptain)?.points ?? 0) * (captainMultiplier - 1);
  return {
    candidateId: candidate.candidateId,
    origin: candidate.origin,
    actualPoints,
    autosubstitutions,
    captainPlayerId: effectiveCaptain ?? candidate.captainPlayerId,
    countedPlayerIds: counted.map((pick) => pick.playerId)
  };
}

function auditTrigger(trigger: ReturnType<typeof DecisionRegretRequestSchema.parse>["triggerAudits"][number], deadline: string) {
  const arrivals = trigger.evidenceArrivals.filter((item) => Date.parse(item.arrivedAt) <= Date.parse(deadline));
  const latestAt = Math.max(...arrivals.map((item) => Date.parse(item.arrivedAt)), -Infinity);
  const latest = arrivals.filter((item) => Date.parse(item.arrivedAt) === latestAt);
  const evidenceIds = latest.map((item) => item.evidenceId).sort();
  const firedBeforeDeadline = trigger.firedAt !== null && Date.parse(trigger.firedAt) <= Date.parse(deadline);
  const contradictory = new Set(latest.map((item) => item.thresholdMet)).size > 1;
  let state: "fired" | "missed" | "stale" | "contradictory" | "not_fired";
  if (contradictory) state = "contradictory";
  else if (firedBeforeDeadline && (latest[0]?.thresholdMet ?? false)) state = "fired";
  else if (firedBeforeDeadline || (trigger.firedAt !== null && Date.parse(trigger.firedAt) > Date.parse(trigger.expiresAt))) state = "stale";
  else if (latest[0]?.thresholdMet) state = "missed";
  else state = "not_fired";
  return { triggerId: trigger.triggerId, state, evidenceIds };
}

export function buildDecisionRegretReport(db: Database.Database, value: unknown): DecisionRegretReport {
  const request = DecisionRegretRequestSchema.parse(value);
  const archive = db.prepare("SELECT deadline, raw_json FROM gameweek_archives WHERE archive_id = ? AND gameweek = ?").get(request.archiveId, request.gameweek) as { deadline: string; raw_json: string } | undefined;
  if (!archive) throw new Error(`Frozen archive ${request.archiveId} does not exist for GW${request.gameweek}.`);
  const archivedArtifacts = new Map((JSON.parse(archive.raw_json) as { artifacts: Array<{ path: string; contentHash: string; kind: string }> }).artifacts.map((item) => [item.path, { contentHash: item.contentHash, kind: item.kind }]));
  if (new Set(request.candidates.map((candidate) => candidate.candidateId)).size !== request.candidates.length) throw new Error("Regret request contains duplicate candidate IDs.");
  for (const candidate of request.candidates) assertLegalCandidate(candidate, archive.deadline, archivedArtifacts);
  const candidateMap = new Map(request.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const agent = candidateMap.get(request.agentCandidateId);
  const submitted = candidateMap.get(request.submittedCandidateId);
  if (!agent || agent.origin !== "archived_candidate") throw new Error("Agent candidate must be a frozen archived candidate.");
  if (!submitted || submitted.origin !== "submitted_team") throw new Error("Submitted candidate must be the manager submission.");
  const playerIds = [...new Set(request.candidates.flatMap((candidate) => candidate.picks.map((pick) => pick.playerId)))];
  const latest = db.prepare(`SELECT o.player_id, o.points, o.appearances, o.status, b.finalized FROM player_gameweek_outcomes o
    JOIN gameweek_outcome_batches b ON b.batch_id = o.batch_id WHERE o.gameweek = ? AND o.player_id = ?
    ORDER BY o.effective_at DESC, o.observed_at DESC, o.rowid DESC LIMIT 1`);
  const outcomes = new Map<number, { points: number; appearances: number }>();
  for (const playerId of playerIds) {
    const row = latest.get(request.gameweek, playerId) as { points: number; appearances: number; status: string; finalized: number } | undefined;
    if (!row || row.finalized !== 1 || !["final", "blank"].includes(row.status)) throw new Error(`Finalized outcome is unavailable for player ${playerId}.`);
    outcomes.set(playerId, { points: row.points, appearances: row.appearances });
  }
  const candidateResults = request.candidates.map((candidate) => scoreCandidate(candidate, outcomes));
  const resultMap = new Map(candidateResults.map((result) => [result.candidateId, result]));
  const retained = candidateResults.filter((result) => result.origin === "archived_candidate").sort((a, b) => b.actualPoints - a.actualPoints || a.candidateId.localeCompare(b.candidateId));
  const comparator = retained[0];
  if (!comparator) throw new Error("Regret requires at least one frozen archived candidate.");
  if (comparator.candidateId === agent.candidateId && request.agentRegretPath.length > 0) throw new Error("Agent regret path must be empty when the agent selected the best retained candidate.");
  if (comparator.candidateId !== agent.candidateId && request.agentRegretPath.length === 0) throw new Error("Agent regret path is required when a better retained candidate exists.");
  let cursor = comparator.candidateId;
  const components: DecisionRegretReport["components"] = request.agentRegretPath.map((step) => {
    if (step.fromCandidateId !== cursor) throw new Error("Agent regret path is not continuous from the best retained candidate.");
    const from = resultMap.get(step.fromCandidateId);
    const to = resultMap.get(step.toCandidateId);
    if (!from || !to || from.origin !== "archived_candidate" || to.origin !== "archived_candidate") throw new Error("Agent regret path may use only frozen archived candidates.");
    assertCategoryChange(step.category, candidateMap.get(step.fromCandidateId)!, candidateMap.get(step.toCandidateId)!);
    cursor = step.toCandidateId;
    return { ...step, points: from.actualPoints - to.actualPoints };
  });
  if (cursor !== agent.candidateId) throw new Error("Agent regret path must end at the selected agent candidate.");
  const agentPoints = resultMap.get(agent.candidateId)!.actualPoints;
  const submittedPoints = resultMap.get(submitted.candidateId)!.actualPoints;
  const agentDecisionRegret = comparator.actualPoints - agentPoints;
  if (components.reduce((sum, item) => sum + item.points, 0) !== agentDecisionRegret) throw new Error("Agent regret components do not reconcile without double counting.");
  const managerOverrideRegret = agentPoints - submittedPoints;
  components.push({ category: "manager_override", fromCandidateId: agent.candidateId, toCandidateId: submitted.candidateId, points: managerOverrideRegret });
  const core = {
    schemaVersion: 1 as const, archiveId: request.archiveId, gameweek: request.gameweek, generatedAt: request.generatedAt,
    comparatorCandidateId: comparator.candidateId, agentCandidateId: agent.candidateId, submittedCandidateId: submitted.candidateId,
    candidateResults, components,
    totals: { agentDecisionRegret, managerOverrideRegret, submittedRegret: comparator.actualPoints - submittedPoints },
    triggerAudits: request.triggerAudits.map((trigger) => auditTrigger(trigger, archive.deadline)),
    causalAttributions: request.causalAttributions
  };
  const report = DecisionRegretReportSchema.parse({ ...core, reportId: stableId("regret-report", core) });
  if (report.components.reduce((sum, item) => sum + item.points, 0) !== report.totals.submittedRegret) throw new Error("Regret components do not reconcile to the submitted points delta.");
  return report;
}

export function recordDecisionRegretReport(db: Database.Database, reportValue: unknown) {
  const report = DecisionRegretReportSchema.parse(reportValue);
  const { reportId: _, ...core } = report;
  if (report.reportId !== stableId("regret-report", core)) throw new Error("Regret report ID does not match its content.");
  const hashValue = contentHash(report);
  const existing = db.prepare("SELECT report_id, content_hash FROM gameweek_regret_reports WHERE gameweek = ?").get(report.gameweek) as { report_id: string; content_hash: string } | undefined;
  if (existing) {
    if (existing.report_id !== report.reportId || existing.content_hash !== hashValue) throw new Error(`GW${report.gameweek} already has a different regret report.`);
    return { inserted: false, report };
  }
  db.prepare(`INSERT INTO gameweek_regret_reports(report_id, archive_id, gameweek, generated_at, content_hash, raw_json)
    VALUES(?, ?, ?, ?, ?, ?)`).run(report.reportId, report.archiveId, report.gameweek, report.generatedAt, hashValue, stableJson(report));
  return { inserted: true, report };
}
