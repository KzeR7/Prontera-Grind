-- 0021: Structured evidence + rule_version on save_alerts, and rolling 1h window accumulator.
ALTER TABLE save_alerts ADD COLUMN rule_version TEXT;
ALTER TABLE save_alerts ADD COLUMN evidence_json TEXT;

CREATE TABLE IF NOT EXISTS save_audit_windows (
  user_id INTEGER PRIMARY KEY,
  window_start INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  acc_json TEXT NOT NULL
);
