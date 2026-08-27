CREATE TABLE gameweek_regret_reports (
  report_id TEXT PRIMARY KEY,
  archive_id TEXT NOT NULL REFERENCES gameweek_archives(archive_id),
  gameweek INTEGER NOT NULL UNIQUE,
  generated_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  raw_json TEXT NOT NULL
);

CREATE TABLE model_versions (
  model_key TEXT NOT NULL,
  version TEXT NOT NULL,
  parent_version TEXT,
  created_at TEXT NOT NULL,
  parameters_hash TEXT NOT NULL,
  parameters_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('registered', 'active', 'retired', 'rolled_back')),
  PRIMARY KEY (model_key, version)
);

CREATE UNIQUE INDEX model_versions_one_active_idx
  ON model_versions(model_key) WHERE status = 'active';

CREATE TABLE model_change_proposals (
  proposal_id TEXT PRIMARY KEY,
  model_key TEXT NOT NULL,
  base_version TEXT NOT NULL,
  target_version TEXT NOT NULL,
  proposed_at TEXT NOT NULL,
  sample_size INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  UNIQUE (model_key, target_version),
  FOREIGN KEY (model_key, base_version) REFERENCES model_versions(model_key, version)
);

CREATE TABLE model_change_reviews (
  review_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES model_change_proposals(proposal_id),
  reviewed_at TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
  content_hash TEXT NOT NULL,
  raw_json TEXT NOT NULL
);

CREATE TABLE model_adoption_events (
  event_id TEXT PRIMARY KEY,
  proposal_id TEXT REFERENCES model_change_proposals(proposal_id),
  model_key TEXT NOT NULL,
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('adopt', 'rollback')),
  authored_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  FOREIGN KEY (model_key, from_version) REFERENCES model_versions(model_key, version),
  FOREIGN KEY (model_key, to_version) REFERENCES model_versions(model_key, version)
);

CREATE TABLE model_archive_replays (
  replay_id TEXT PRIMARY KEY,
  model_key TEXT NOT NULL,
  version TEXT NOT NULL,
  archive_id TEXT NOT NULL REFERENCES gameweek_archives(archive_id),
  generated_at TEXT NOT NULL,
  metrics_hash TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  UNIQUE (model_key, version, archive_id, metrics_hash),
  FOREIGN KEY (model_key, version) REFERENCES model_versions(model_key, version)
);
