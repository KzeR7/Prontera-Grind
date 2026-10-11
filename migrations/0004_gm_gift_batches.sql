-- Idempotent server-wide gifting. The recipient cutoff is frozen on first submission.
CREATE TABLE IF NOT EXISTS gm_gift_batches(
  request_id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  max_user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  note TEXT
);
ALTER TABLE grants ADD COLUMN batch_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_grants_batch_user ON grants(batch_id,user_id);
