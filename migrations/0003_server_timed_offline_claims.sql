-- Server-time offline claims (Cloudflare D1 / SQLite).
-- Apply after 0001_init.sql and 0002_leaderboard.sql. All statements are idempotent.
-- The browser still runs the game simulation, but the server owns the away window, kill budget,
-- fractional remainder, and one-time claim acknowledgement.

CREATE TABLE IF NOT EXISTS offline_reward_claims(
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  away_ms     INTEGER NOT NULL CHECK(away_ms >= 0),
  credited_ms INTEGER NOT NULL CHECK(credited_ms >= 0 AND credited_ms <= 14400000),
  rate_kph    REAL NOT NULL CHECK(rate_kph >= 0 AND rate_kph <= 30000),
  kills       INTEGER NOT NULL CHECK(kills >= 0),
  remainder   REAL NOT NULL CHECK(remainder >= 0 AND remainder < 1),
  issued_at   INTEGER NOT NULL,
  claimed_at  INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_offline_claim_one_pending
  ON offline_reward_claims(user_id) WHERE claimed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_offline_claim_user_history
  ON offline_reward_claims(user_id, id DESC);
