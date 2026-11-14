-- 0014_ip_bans.sql — network (IP) suspension for the GM console.
--
-- The owner's problem: an account ban is only as strong as the account, so a suspended player
-- registers a new one and the GM bans again by hand. This table holds the networks those bans
-- cover. It stores the SAME non-reversible fingerprint the login path already writes into
-- sessions.ip_hash (functions/_lib/http.js ipHash — SHA-256 of 'pg-ip:' + address, first 64 bits);
-- the raw IP address is never written anywhere, exactly as before.
--
-- Enforcement lives in three places (all fail open with a console warning if this file has not
-- been applied yet, so deploying the code first cannot brick the site):
--   * functions/api/_middleware.js  — every /api request from a banned network (except login).
--   * functions/api/sessions.js     — login, with a gm>=2 owner bypass so a mistaken ban can
--                                     always be undone by the owner.
--   * functions/api/register.js     — no new account from a banned network.
--
-- Additive only. Safe to reapply (CREATE ... IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS ip_bans(
  ip_hash     TEXT PRIMARY KEY,           -- 16 hex chars; raw addresses are never stored
  note        TEXT,                       -- free text from the GM ('via x740552 (#12)', ...)
  created_by  TEXT,                       -- GM username from the session, never a client value
  created_at  INTEGER NOT NULL
);
-- Banning a network revokes every session that was created from it; the index keeps that a
-- primary-key-style lookup instead of a table scan on every ban.
CREATE INDEX IF NOT EXISTS idx_sessions_ip ON sessions(ip_hash);
-- Fingerprint lookups: 'which accounts ever signed in from network X' (events.detail = 'ip <hash>')
-- and 'which networks did this account use' (events.user_id + detail LIKE 'ip %').
CREATE INDEX IF NOT EXISTS idx_events_detail ON events(detail);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, id DESC);
