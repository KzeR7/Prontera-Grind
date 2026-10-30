-- Draft foundation only. No public enrollment or live cutover is implemented.
-- The source blob was client-authored and is grandfathered, NOT provenance.
-- One bounded copy per account; normal saves and equipment are never modified.
CREATE TABLE IF NOT EXISTS competition_baselines (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  save_version INTEGER NOT NULL CHECK(save_version >= 1),
  save_updated_at INTEGER NOT NULL,
  cutoff_at INTEGER NOT NULL,
  captured_at INTEGER NOT NULL,
  policy TEXT NOT NULL CHECK(policy='grandfathered-unverified-v1'),
  save_blob TEXT NOT NULL CHECK(json_valid(save_blob))
);
CREATE TRIGGER IF NOT EXISTS competition_baseline_immutable
BEFORE UPDATE ON competition_baselines
BEGIN SELECT RAISE(ABORT,'competition baseline is immutable'); END;
