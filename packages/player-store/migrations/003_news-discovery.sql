CREATE TABLE news_discovery_runs (
  discovery_id TEXT PRIMARY KEY,
  worklist_id TEXT NOT NULL REFERENCES evidence_worklists(worklist_id),
  gameweek INTEGER NOT NULL,
  generated_at TEXT NOT NULL,
  minimum_appearance_probability REAL NOT NULL,
  content_hash TEXT NOT NULL
);

CREATE INDEX news_discovery_runs_gameweek_idx ON news_discovery_runs(gameweek, generated_at);

CREATE TABLE news_discovery_searches (
  search_id TEXT PRIMARY KEY,
  discovery_id TEXT NOT NULL REFERENCES news_discovery_runs(discovery_id),
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  query TEXT NOT NULL,
  provider TEXT NOT NULL,
  searched_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'blocked')),
  error TEXT
);

CREATE INDEX news_discovery_searches_player_idx ON news_discovery_searches(player_id, searched_at);

CREATE TABLE news_discovery_candidates (
  candidate_id TEXT PRIMARY KEY,
  search_id TEXT NOT NULL REFERENCES news_discovery_searches(search_id),
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  publisher TEXT,
  published_at TEXT,
  UNIQUE (search_id, url)
);

CREATE INDEX news_discovery_candidates_player_idx ON news_discovery_candidates(player_id, url);
