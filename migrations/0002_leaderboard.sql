-- Prontera Grind — leaderboard counters (Cloudflare D1 / SQLite)
-- Apply once to the live database before deploying code that calls /api/board:
--   npx wrangler d1 execute pg --remote --file=migrations/0002_leaderboard.sql
--
-- The `all` row is an account-lifetime total. Date rows count only newly synced kills, in the
-- game's chosen Asia/Singapore calendar day. Existing saves seed lifetime totals, never today's
-- or this week's score. The trigger makes the counter update atomic with the accepted save write.

CREATE TABLE IF NOT EXISTS leaderboard_kills(
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,                            -- 'all' or an Asia/Singapore YYYY-MM-DD
  kills      INTEGER NOT NULL DEFAULT 0 CHECK(kills >= 0),
  PRIMARY KEY(user_id, period_key)
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_period_kills
  ON leaderboard_kills(period_key, kills DESC, user_id);

-- Backfill all-time totals for accounts that already have a cloud save. This is idempotent and
-- deliberately does not award historical kills to the current daily/weekly period.
INSERT OR IGNORE INTO leaderboard_kills(user_id, period_key, kills)
SELECT user_id, 'all', CASE WHEN kills_total > 0 THEN kills_total ELSE 0 END
FROM saves;

-- A first cloud save establishes that account's lifetime baseline but is not a daily/weekly gain.
CREATE TRIGGER IF NOT EXISTS leaderboard_seed_new_save
AFTER INSERT ON saves
BEGIN
  INSERT OR IGNORE INTO leaderboard_kills(user_id, period_key, kills)
  VALUES(NEW.user_id, 'all', CASE WHEN NEW.kills_total > 0 THEN NEW.kills_total ELSE 0 END);
END;

-- Every accepted save already updates saves.kills_total. Count only positive deltas; a save reset
-- must not erase the account's lifetime board score. SQLite/D1 runs the trigger in the same write.
CREATE TRIGGER IF NOT EXISTS leaderboard_count_new_kills
AFTER UPDATE OF kills_total ON saves
WHEN NEW.kills_total > OLD.kills_total
BEGIN
  INSERT INTO leaderboard_kills(user_id, period_key, kills)
  VALUES(NEW.user_id, 'all', NEW.kills_total - OLD.kills_total)
  ON CONFLICT(user_id, period_key) DO UPDATE SET kills = kills + excluded.kills;

  INSERT INTO leaderboard_kills(user_id, period_key, kills)
  VALUES(NEW.user_id, strftime('%Y-%m-%d', 'now', '+8 hours'), NEW.kills_total - OLD.kills_total)
  ON CONFLICT(user_id, period_key) DO UPDATE SET kills = kills + excluded.kills;
END;
