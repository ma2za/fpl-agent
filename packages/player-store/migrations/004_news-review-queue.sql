CREATE TABLE news_candidate_reviews (
  review_id TEXT PRIMARY KEY,
  worklist_id TEXT NOT NULL REFERENCES evidence_worklists(worklist_id),
  representative_candidate_id TEXT NOT NULL REFERENCES news_discovery_candidates(candidate_id),
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  candidate_url TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'rejected', 'duplicate', 'irrelevant', 'deferred')),
  reviewed_at TEXT NOT NULL,
  agent TEXT NOT NULL,
  note TEXT NOT NULL,
  content_hash TEXT NOT NULL
);

CREATE INDEX news_candidate_reviews_target_idx
  ON news_candidate_reviews(worklist_id, player_id, candidate_url, reviewed_at);
