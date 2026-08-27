import type Database from "better-sqlite3";
import {
  ModelChangeProposalSchema,
  ModelChangeReviewSchema,
  ModelReplaySchema,
  ModelVersionSchema,
  type ModelChangeProposal,
  type ModelChangeReview
} from "./types";
import { contentHash, stableId, stableJson } from "./store";

export function registerModelVersion(db: Database.Database, value: unknown, activate = false) {
  const model = ModelVersionSchema.parse(value);
  if (model.parentVersion) {
    const parent = db.prepare("SELECT 1 FROM model_versions WHERE model_key = ? AND version = ?").get(model.modelKey, model.parentVersion);
    if (!parent) throw new Error(`Parent model ${model.modelKey}@${model.parentVersion} is not registered.`);
  }
  if (activate && db.prepare("SELECT 1 FROM model_versions WHERE model_key = ? AND status = 'active'").get(model.modelKey)) {
    throw new Error(`Model ${model.modelKey} already has an active version.`);
  }
  const hashValue = contentHash(model.parameters);
  const existing = db.prepare("SELECT parameters_hash, status FROM model_versions WHERE model_key = ? AND version = ?").get(model.modelKey, model.version) as { parameters_hash: string; status: string } | undefined;
  if (existing) {
    if (existing.parameters_hash !== hashValue) throw new Error(`Model ${model.modelKey}@${model.version} is already registered with different parameters.`);
    return { inserted: false, status: existing.status };
  }
  const status = activate ? "active" : "registered";
  db.prepare(`INSERT INTO model_versions(model_key, version, parent_version, created_at, parameters_hash, parameters_json, status)
    VALUES(?, ?, ?, ?, ?, ?, ?)`).run(model.modelKey, model.version, model.parentVersion, model.createdAt, hashValue, stableJson(model.parameters), status);
  return { inserted: true, status };
}

export function recordModelReplay(db: Database.Database, value: unknown) {
  const replay = ModelReplaySchema.parse(value);
  if (!db.prepare("SELECT 1 FROM model_versions WHERE model_key = ? AND version = ?").get(replay.modelKey, replay.version)) {
    throw new Error(`Replay model ${replay.modelKey}@${replay.version} is not registered.`);
  }
  if (!db.prepare("SELECT 1 FROM gameweek_archives WHERE archive_id = ?").get(replay.archiveId)) throw new Error(`Replay archive ${replay.archiveId} does not exist.`);
  const replayId = stableId("model-replay", replay);
  const result = db.prepare(`INSERT OR IGNORE INTO model_archive_replays(replay_id, model_key, version, archive_id, generated_at, metrics_hash, raw_json)
    VALUES(?, ?, ?, ?, ?, ?, ?)`).run(replayId, replay.modelKey, replay.version, replay.archiveId, replay.generatedAt, contentHash(replay.metrics), stableJson(replay));
  return { replayId, inserted: result.changes === 1 };
}

function proposalCore(proposal: ModelChangeProposal) {
  const { proposalId: _, ...core } = proposal;
  return core;
}

export function proposeModelChange(db: Database.Database, value: unknown) {
  const proposal = ModelChangeProposalSchema.parse(value);
  if (Date.parse(proposal.authorship.authoredAt) > Date.parse(proposal.proposedAt)) throw new Error("Proposal authorship cannot postdate the proposal.");
  if (proposal.proposalId !== stableId("model-proposal", proposalCore(proposal))) throw new Error("Model proposal ID does not match its content.");
  const base = db.prepare("SELECT status FROM model_versions WHERE model_key = ? AND version = ?").get(proposal.modelKey, proposal.baseVersion) as { status: string } | undefined;
  if (!base || base.status !== "active") throw new Error("A model proposal must target the active base version.");
  if (!db.prepare("SELECT 1 FROM model_versions WHERE model_key = ? AND version = ? AND parent_version = ?").get(proposal.modelKey, proposal.targetVersion, proposal.baseVersion)) {
    throw new Error("Proposed target must be a registered child of the active base model.");
  }
  for (const backtest of proposal.backtests) {
    const baseline = db.prepare("SELECT model_key, version, archive_id FROM model_archive_replays WHERE replay_id = ?").get(backtest.baselineReplayId) as { model_key: string; version: string; archive_id: string } | undefined;
    const candidate = db.prepare("SELECT model_key, version, archive_id FROM model_archive_replays WHERE replay_id = ?").get(backtest.candidateReplayId) as { model_key: string; version: string; archive_id: string } | undefined;
    if (!baseline || !candidate || baseline.model_key !== proposal.modelKey || candidate.model_key !== proposal.modelKey || baseline.version !== proposal.baseVersion || candidate.version !== proposal.targetVersion || baseline.archive_id !== backtest.archiveId || candidate.archive_id !== backtest.archiveId) {
      throw new Error("Proposal backtests must replay the base and target models against the same declared archive.");
    }
  }
  const hashValue = contentHash(proposal);
  const existing = db.prepare("SELECT content_hash FROM model_change_proposals WHERE proposal_id = ?").get(proposal.proposalId) as { content_hash: string } | undefined;
  if (existing) {
    if (existing.content_hash !== hashValue) throw new Error("Model proposal ID collision.");
    return { inserted: false, proposal };
  }
  db.prepare(`INSERT INTO model_change_proposals(proposal_id, model_key, base_version, target_version, proposed_at, sample_size, content_hash, raw_json)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)`).run(proposal.proposalId, proposal.modelKey, proposal.baseVersion, proposal.targetVersion, proposal.proposedAt, proposal.sampleSize, hashValue, stableJson(proposal));
  return { inserted: true, proposal };
}

function reviewCore(review: ModelChangeReview) {
  const { reviewId: _, ...core } = review;
  return core;
}

export function reviewModelChange(db: Database.Database, value: unknown) {
  const review = ModelChangeReviewSchema.parse(value);
  if (review.reviewId !== stableId("model-review", reviewCore(review))) throw new Error("Model review ID does not match its content.");
  const proposal = db.prepare("SELECT proposed_at FROM model_change_proposals WHERE proposal_id = ?").get(review.proposalId) as { proposed_at: string } | undefined;
  if (!proposal) throw new Error(`Unknown model proposal ${review.proposalId}.`);
  if (Date.parse(review.authorship.authoredAt) < Date.parse(proposal.proposed_at)) throw new Error("Model review cannot predate its proposal.");
  const prior = db.prepare("SELECT review_id, decision, content_hash FROM model_change_reviews WHERE proposal_id = ? ORDER BY reviewed_at DESC, rowid DESC LIMIT 1").get(review.proposalId) as { review_id: string; decision: string; content_hash: string } | undefined;
  const hashValue = contentHash(review);
  if (prior) {
    if (prior.review_id === review.reviewId && prior.content_hash === hashValue) return { inserted: false, review };
    throw new Error(`Model proposal ${review.proposalId} already has an explicit ${prior.decision} review.`);
  }
  db.prepare(`INSERT INTO model_change_reviews(review_id, proposal_id, reviewed_at, decision, content_hash, raw_json)
    VALUES(?, ?, ?, ?, ?, ?)`).run(review.reviewId, review.proposalId, review.authorship.authoredAt, review.decision, hashValue, stableJson(review));
  return { inserted: true, review };
}

export function adoptModelChange(db: Database.Database, proposalId: string, authorship: { agent: string; authoredAt: string }) {
  if (!authorship.agent || !Number.isFinite(Date.parse(authorship.authoredAt))) throw new Error("Model adoption requires explicit coding-agent authorship.");
  const proposal = db.prepare("SELECT model_key, base_version, target_version FROM model_change_proposals WHERE proposal_id = ?").get(proposalId) as { model_key: string; base_version: string; target_version: string } | undefined;
  if (!proposal) throw new Error(`Unknown model proposal ${proposalId}.`);
  const review = db.prepare("SELECT decision, reviewed_at FROM model_change_reviews WHERE proposal_id = ? ORDER BY reviewed_at DESC, rowid DESC LIMIT 1").get(proposalId) as { decision: string; reviewed_at: string } | undefined;
  if (review?.decision !== "approve") throw new Error("Model adoption requires a separate explicit approval review.");
  if (Date.parse(authorship.authoredAt) < Date.parse(review.reviewed_at)) throw new Error("Model adoption cannot predate its approval.");
  const core = { proposalId, modelKey: proposal.model_key, fromVersion: proposal.base_version, toVersion: proposal.target_version, eventType: "adopt", authorship: { kind: "coding_agent", ...authorship } };
  const eventId = stableId("model-event", core);
  if (db.prepare("SELECT 1 FROM model_adoption_events WHERE event_id = ?").get(eventId)) return { eventId, inserted: false };
  const active = db.prepare("SELECT version FROM model_versions WHERE model_key = ? AND status = 'active'").get(proposal.model_key) as { version: string } | undefined;
  if (active?.version !== proposal.base_version) throw new Error("Proposal base is no longer the active model version.");
  const apply = db.transaction(() => {
    db.prepare("UPDATE model_versions SET status = 'retired' WHERE model_key = ? AND version = ?").run(proposal.model_key, proposal.base_version);
    db.prepare("UPDATE model_versions SET status = 'active' WHERE model_key = ? AND version = ?").run(proposal.model_key, proposal.target_version);
    db.prepare(`INSERT INTO model_adoption_events(event_id, proposal_id, model_key, from_version, to_version, event_type, authored_at, content_hash, raw_json)
      VALUES(?, ?, ?, ?, ?, 'adopt', ?, ?, ?)`).run(eventId, proposalId, proposal.model_key, proposal.base_version, proposal.target_version, authorship.authoredAt, contentHash(core), stableJson(core));
  });
  apply.immediate();
  return { eventId, inserted: true };
}

export function rollbackModelVersion(db: Database.Database, input: { modelKey: string; toVersion: string; rationale: string; agent: string; authoredAt: string }) {
  if (!input.rationale || !input.agent || !Number.isFinite(Date.parse(input.authoredAt))) throw new Error("Rollback requires rationale and explicit coding-agent authorship.");
  const active = db.prepare("SELECT version FROM model_versions WHERE model_key = ? AND status = 'active'").get(input.modelKey) as { version: string } | undefined;
  if (!active) throw new Error(`Model ${input.modelKey} has no active version.`);
  if (active.version === input.toVersion) throw new Error("Rollback target is already active.");
  if (!db.prepare("SELECT 1 FROM model_versions WHERE model_key = ? AND version = ?").get(input.modelKey, input.toVersion)) throw new Error(`Rollback target ${input.toVersion} is not registered.`);
  const sharedReplay = db.prepare(`SELECT 1 FROM model_archive_replays current
    JOIN model_archive_replays target ON target.archive_id = current.archive_id AND target.model_key = current.model_key
    WHERE current.model_key = ? AND current.version = ? AND target.version = ? LIMIT 1`).get(input.modelKey, active.version, input.toVersion);
  if (!sharedReplay) throw new Error("Rollback requires both model versions to be replayed against the same archive.");
  const core = { modelKey: input.modelKey, fromVersion: active.version, toVersion: input.toVersion, eventType: "rollback", rationale: input.rationale, authorship: { kind: "coding_agent", agent: input.agent, authoredAt: input.authoredAt } };
  const eventId = stableId("model-event", core);
  if (db.prepare("SELECT 1 FROM model_adoption_events WHERE event_id = ?").get(eventId)) return { eventId, inserted: false };
  const apply = db.transaction(() => {
    db.prepare("UPDATE model_versions SET status = 'rolled_back' WHERE model_key = ? AND version = ?").run(input.modelKey, active.version);
    db.prepare("UPDATE model_versions SET status = 'active' WHERE model_key = ? AND version = ?").run(input.modelKey, input.toVersion);
    db.prepare(`INSERT INTO model_adoption_events(event_id, proposal_id, model_key, from_version, to_version, event_type, authored_at, content_hash, raw_json)
      VALUES(?, NULL, ?, ?, ?, 'rollback', ?, ?, ?)`).run(eventId, input.modelKey, active.version, input.toVersion, input.authoredAt, contentHash(core), stableJson(core));
  });
  apply.immediate();
  return { eventId, inserted: true };
}
