-- Draft only. Apply to disposable local/staging D1 until separately approved.
-- These are client-reported observations, NOT trusted scores or proof of cheating.
-- Sampling uses a fixed-size 28-slot ring per account; old slots are overwritten.
CREATE TABLE IF NOT EXISTS damage_samples (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK(slot >= 0 AND slot < 28),
  bucket INTEGER NOT NULL,
  sampled_at INTEGER NOT NULL,
  map INTEGER,
  stage INTEGER,
  reported_total_damage REAL,
  reported_echo_best REAL,
  PRIMARY KEY (user_id, slot)
);
CREATE TABLE IF NOT EXISTS damage_alerts (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  max_reported_dps REAL NOT NULL,
  observations INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_damage_alerts_last_seen ON damage_alerts(last_seen DESC);
