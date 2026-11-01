ALTER TABLE runs ADD COLUMN release_identity_hash TEXT CHECK (release_identity_hash IS NULL OR length(release_identity_hash) = 64);

CREATE INDEX idx_runs_release_identity ON runs(release_identity_hash, created_at DESC);
