CREATE TABLE gameweek_archives (
  archive_id TEXT PRIMARY KEY,
  gameweek INTEGER NOT NULL UNIQUE,
  deadline TEXT NOT NULL,
  frozen_at TEXT NOT NULL,
  source_generated_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  raw_json TEXT NOT NULL
);

CREATE TABLE gameweek_archive_artifacts (
  archive_id TEXT NOT NULL REFERENCES gameweek_archives(archive_id),
  artifact_path TEXT NOT NULL,
  artifact_kind TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  PRIMARY KEY (archive_id, artifact_path)
);

CREATE TABLE archived_player_forecasts (
  archive_id TEXT NOT NULL REFERENCES gameweek_archives(archive_id),
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  position TEXT NOT NULL,
  projected_points REAL NOT NULL,
  expected_minutes REAL NOT NULL,
  start_probability REAL NOT NULL,
  appearance_probability REAL NOT NULL,
  p10 REAL NOT NULL,
  p90 REAL NOT NULL,
  start_interval_lower REAL,
  start_interval_upper REAL,
  role_evidence_state TEXT NOT NULL,
  source_coverage TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  model_version TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  PRIMARY KEY (archive_id, player_id)
);

CREATE TABLE gameweek_outcome_batches (
  batch_id TEXT PRIMARY KEY,
  gameweek INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  finalized INTEGER NOT NULL CHECK (finalized IN (0, 1)),
  content_hash TEXT NOT NULL
);

CREATE TABLE player_gameweek_outcomes (
  outcome_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES gameweek_outcome_batches(batch_id),
  gameweek INTEGER NOT NULL,
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  status TEXT NOT NULL CHECK (status IN ('final', 'blank', 'postponed', 'missing')),
  points INTEGER NOT NULL,
  minutes INTEGER NOT NULL,
  starts INTEGER NOT NULL,
  appearances INTEGER NOT NULL,
  fixture_count INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  supersedes_id TEXT REFERENCES player_gameweek_outcomes(outcome_id),
  raw_json TEXT NOT NULL,
  UNIQUE (gameweek, player_id, content_hash)
);

CREATE INDEX player_gameweek_outcomes_latest_idx
  ON player_gameweek_outcomes(gameweek, player_id, effective_at, observed_at);
