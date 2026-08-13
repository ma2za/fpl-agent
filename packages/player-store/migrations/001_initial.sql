CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE ingestion_runs (
  run_id TEXT PRIMARY KEY,
  gameweek INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('live', 'offline', 'agent')),
  observed_at TEXT NOT NULL,
  bootstrap_hash TEXT,
  fixtures_hash TEXT,
  input_hash TEXT
);

CREATE TABLE players (
  player_id INTEGER PRIMARY KEY,
  first_seen_run_id TEXT NOT NULL REFERENCES ingestion_runs(run_id)
);

CREATE TABLE player_aliases (
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  alias TEXT NOT NULL,
  first_seen_run_id TEXT NOT NULL REFERENCES ingestion_runs(run_id),
  PRIMARY KEY (player_id, alias)
);

CREATE TABLE player_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  observed_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  web_name TEXT NOT NULL,
  team_id INTEGER NOT NULL,
  team_name TEXT NOT NULL,
  position TEXT NOT NULL,
  price REAL NOT NULL,
  status TEXT NOT NULL,
  selected_by_percent REAL,
  minutes INTEGER,
  total_points INTEGER,
  raw_json TEXT NOT NULL,
  UNIQUE (player_id, content_hash)
);

CREATE TABLE run_player_snapshots (
  run_id TEXT NOT NULL REFERENCES ingestion_runs(run_id),
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  snapshot_id TEXT NOT NULL REFERENCES player_snapshots(snapshot_id),
  PRIMARY KEY (run_id, player_id)
);

CREATE TABLE player_summary_coverage (
  run_id TEXT NOT NULL REFERENCES ingestion_runs(run_id),
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  status TEXT NOT NULL CHECK (status IN ('available', 'missing', 'failed', 'stale')),
  retrieved_at TEXT,
  content_hash TEXT,
  error TEXT,
  PRIMARY KEY (run_id, player_id)
);

CREATE TABLE player_performance_observations (
  performance_id TEXT PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  fixture_id INTEGER NOT NULL,
  gameweek INTEGER,
  observed_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  supersedes_id TEXT REFERENCES player_performance_observations(performance_id),
  raw_json TEXT NOT NULL,
  UNIQUE (player_id, fixture_id, content_hash)
);

CREATE TABLE run_player_performance (
  run_id TEXT NOT NULL REFERENCES ingestion_runs(run_id),
  performance_id TEXT NOT NULL REFERENCES player_performance_observations(performance_id),
  PRIMARY KEY (run_id, performance_id)
);

CREATE TABLE player_fixture_observations (
  fixture_observation_id TEXT PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  fixture_id INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  supersedes_id TEXT REFERENCES player_fixture_observations(fixture_observation_id),
  raw_json TEXT NOT NULL,
  UNIQUE (player_id, fixture_id, content_hash)
);

CREATE TABLE run_player_fixtures (
  run_id TEXT NOT NULL REFERENCES ingestion_runs(run_id),
  fixture_observation_id TEXT NOT NULL REFERENCES player_fixture_observations(fixture_observation_id),
  PRIMARY KEY (run_id, fixture_observation_id)
);

CREATE TABLE source_documents (
  document_id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL,
  publisher TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  raw_capture_path TEXT,
  supersedes_id TEXT REFERENCES source_documents(document_id),
  UNIQUE (canonical_url, content_hash)
);

CREATE INDEX source_documents_url_idx ON source_documents(canonical_url, retrieved_at);

CREATE TABLE news_observations (
  observation_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES source_documents(document_id),
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  category TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  credibility_score REAL NOT NULL,
  credibility_rationale TEXT NOT NULL,
  relevance_score REAL NOT NULL,
  relevance_rationale TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  note TEXT NOT NULL
);

CREATE TABLE role_observations (
  observation_id TEXT PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  dimension TEXT NOT NULL,
  signal TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  raw_json TEXT NOT NULL
);

CREATE TABLE evidence_worklists (
  worklist_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ingestion_runs(run_id),
  gameweek INTEGER NOT NULL,
  generated_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  raw_json TEXT NOT NULL
);

CREATE TABLE discovery_coverage (
  coverage_id TEXT PRIMARY KEY,
  worklist_id TEXT NOT NULL REFERENCES evidence_worklists(worklist_id),
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'searched_with_results', 'searched_zero_results', 'blocked')),
  searched_at TEXT,
  queries_json TEXT NOT NULL,
  result_count INTEGER NOT NULL,
  note TEXT NOT NULL
);

CREATE INDEX discovery_coverage_player_idx ON discovery_coverage(player_id, searched_at);

CREATE TABLE ingestion_batches (
  batch_id TEXT PRIMARY KEY,
  worklist_id TEXT NOT NULL REFERENCES evidence_worklists(worklist_id),
  gameweek INTEGER NOT NULL,
  authored_at TEXT NOT NULL,
  content_hash TEXT NOT NULL
);

CREATE TABLE ingestion_batch_links (
  batch_id TEXT NOT NULL REFERENCES ingestion_batches(batch_id),
  observation_id TEXT NOT NULL REFERENCES news_observations(observation_id),
  PRIMARY KEY (batch_id, observation_id)
);

CREATE TABLE artifact_lineage (
  lineage_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ingestion_runs(run_id),
  artifact_kind TEXT NOT NULL,
  artifact_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE trigger_evaluations (
  evaluation_id TEXT PRIMARY KEY,
  trigger_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES ingestion_runs(run_id),
  evaluated_at TEXT NOT NULL,
  state TEXT NOT NULL,
  current_value_json TEXT,
  reason TEXT NOT NULL,
  raw_json TEXT NOT NULL
);

CREATE INDEX trigger_evaluations_trigger_idx ON trigger_evaluations(trigger_id, evaluated_at);
