-- Prontera Grind — Endless Echo leaderboard + period rewards (apply once to live D1)
--   npx wrangler d1 execute pg --remote --file=migrations/0006_echo_leaderboard.sql
--
-- One row per account per period: 'all', 'day:YYYY-MM-DD' or 'week:YYYY-MM-DD' (Monday),
-- all on the Asia/Singapore clock the other boards use. `dps` is that account's BEST ranked
-- Endless Echo DPS in the period (scores only ever rise). Saves upsert these rows on sync
-- (functions/_lib/echo-board.js, called from functions/api/save.js); /api/board reads them.
--
-- Rewards for a finished daily/weekly period are settled lazily (no cron on Pages): the first
-- board read or save sync after a period ends ranks its Top 100, records one row per winner in
-- leaderboard_echo_rewards and queues the prizes in the existing `grants` queue, which the game
-- already applies exactly once on the winner's next sync. The settlements table makes that
-- payout happen at most once per period, however many reads race to trigger it.

CREATE TABLE IF NOT EXISTS leaderboard_echo(
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,                            -- 'all' | 'day:YYYY-MM-DD' | 'week:YYYY-MM-DD'
  dps        REAL NOT NULL DEFAULT 0 CHECK(dps >= 0),
  PRIMARY KEY(user_id, period_key)
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_echo_period
  ON leaderboard_echo(period_key, dps DESC, user_id);

CREATE TABLE IF NOT EXISTS leaderboard_echo_rewards(
  period_key TEXT NOT NULL,                            -- the settled 'day:'/'week:' key
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank       INTEGER NOT NULL,
  dps        REAL NOT NULL DEFAULT 0,
  prizes     TEXT NOT NULL DEFAULT '[]',               -- JSON [{resource, amount}] queued as grants
  settled_at INTEGER NOT NULL,
  PRIMARY KEY(period_key, user_id)
);

CREATE TABLE IF NOT EXISTS leaderboard_echo_settlements(
  period_key TEXT PRIMARY KEY,
  settled_at INTEGER NOT NULL
);
