-- 0015_save_audit.sql — server-side "is this save even possible?" flags for the GM console.
--
-- The owner (2026-11-14): "how i identify is the stats is over the limit, level to fast & alot
-- of materials which the account only made in 5mins. i cant be monitoring the game myself 24
-- hours." The server already receives every accepted save; functions/_lib/save-audit.js compares
-- each one against the game's own invariants (index.html: MAXST/BASECAP, points/spent, refine
-- caps) and against wall-clock rates between syncs (kills/levels/zeny/materials per hour).
-- THIS table stores the result: one row per account per rule, worst value and last time seen.
--
-- Flags are REVIEW-ONLY, exactly like the damage monitor: nothing here bans, blocks a save or
-- changes a score. The save itself is always stored; the console shows the flag, the owner
-- decides. A first-time flag also writes a `save-alert` event and a targeted mail message to
-- the owner account(s), so a busy owner gets poked instead of having to watch 24/7.
--
-- Additive only. Safe to reapply (CREATE ... IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS save_alerts(
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT    NOT NULL,             -- stat-over-cap | level-rate | rate:shards | ...
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  value        REAL    NOT NULL,             -- the worst observed figure (e.g. kills per hour)
  threshold    REAL    NOT NULL,             -- the limit it broke (0 for static impossibilities)
  detail       TEXT,                          -- small context: which stat, which window
  observations INTEGER NOT NULL DEFAULT 1,    -- how often we have seen it (coarse, ~5 min apart)
  PRIMARY KEY (user_id, kind)
);
-- The console's "Suspicious saves" card: newest flags first, across all accounts.
CREATE INDEX IF NOT EXISTS idx_save_alerts_last_seen ON save_alerts(last_seen DESC);
