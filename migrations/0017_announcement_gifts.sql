-- 0017_announcement_gifts.sql — a GM announcement's gift that players who join LATER can still claim.
--
-- The owner (2026-11-14): "for mailing system, any gm compose mail will only deliver to existing
-- players. new made account after will not get them." The announcement TEXT already reached
-- everyone, because a "to everyone" announcement is one `messages` row with target_user NULL and
-- the inbox query matches that. The GIFT did not: db.insertMassGrants() fanned out one `grants` row
-- per account existing at send time, so an account created the next day opened the same letter and
-- found no attachment.
--
-- This table keeps the announcement's gift as a CAMPAIGN: which message it belongs to, the grant
-- payload, and whether it is still open. Registration reads the open campaigns and hands the new
-- account the same grant (idempotent through the existing grants(batch_id,user_id) unique index).
--
-- Deliberately bounded by a human: a campaign stays open until a GM closes it, so a give-away is
-- never an unlimited mint that anyone can farm by registering alt accounts forever. Closing does
-- not take back anything already delivered; it only stops future grants.
--
-- Additive only. Safe to reapply.
CREATE TABLE IF NOT EXISTS announcement_gifts(
  message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                    -- gift | zeny (the `grants.kind` it replays)
  payload    TEXT NOT NULL,                    -- the same JSON payload the first fan-out used
  label      TEXT,                             -- human label, e.g. "5,000 Zeny"
  note       TEXT,                             -- the announcement's own note
  created_by TEXT,
  created_at INTEGER NOT NULL,
  closed_at  INTEGER,                           -- NULL = still handing out to new accounts
  closed_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_announcement_gifts_open ON announcement_gifts(created_at) WHERE closed_at IS NULL;
