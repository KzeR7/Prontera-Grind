-- GM accounts are not subject to the daily raid entry cap.
--
-- The cap exists to pace players through a four-stage dungeon. A GM needs to enter repeatedly to
-- test that dungeon, and making them clear rows out of D1 between runs is not a rule, it is a chore.
--
-- The JavaScript eligibility check is not the only gate: `raid_entry_daily_limit` (migration 0022)
-- is a BEFORE INSERT trigger that aborts at two rows for the day, so it has to know about the bypass
-- too. Otherwise the API would say "eligible" and the insert would still fail.
--
-- The bypass reads only the `users.gm` column, which is server-side state. Nothing the client sends
-- can influence it.

DROP TRIGGER IF EXISTS raid_entry_daily_limit;
CREATE TRIGGER raid_entry_daily_limit
BEFORE INSERT ON raid_entries
WHEN (SELECT COUNT(*) FROM raid_entries WHERE user_id=NEW.user_id AND day_key=NEW.day_key) >= 2
  AND NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.user_id AND gm >= 1)
BEGIN SELECT RAISE(ABORT,'raid_daily_entry_limit'); END;

-- The one-active-run rule is a correctness rule, not a pacing rule: a GM still cannot have two runs
-- live at once, because the run state machine has one slot per player. Left exactly as it was.
