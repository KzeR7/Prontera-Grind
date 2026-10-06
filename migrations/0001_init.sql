-- Prontera Grind — server schema (Cloudflare D1 / SQLite)
-- Applied with:  wrangler d1 execute pg --remote --file=migrations/0001_init.sql
--               (or --local for `wrangler dev`)
--
-- The game's own save stays a single JSON blob in saves.blob: the browser is still the simulation
-- (see tools/server-shift-plan.md §7a decision 1), so the server's job is accounts, sessions,
-- durable storage, conflict detection and moderation — not simulating combat.

-- ---------------------------------------------------------------- accounts ----
CREATE TABLE IF NOT EXISTS users(
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT NOT NULL COLLATE NOCASE UNIQUE,   -- case-insensitive names, display case kept
  pass_hash      TEXT NOT NULL,                          -- pbkdf2$<iters>$<salt>$<hash>
  recovery_hash  TEXT,                                   -- optional one-time recovery code (hashed)
  gm             INTEGER NOT NULL DEFAULT 0,             -- 0 user, 1 GM, 2 owner
  banned         INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  last_login_at  INTEGER,
  fail_count     INTEGER NOT NULL DEFAULT 0,             -- failed logins since fail_at
  fail_at        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_users_gm ON users(gm);

CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY,                           -- sha256 of the cookie value; never the token
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ua         TEXT,
  ip_hash    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ------------------------------------------------------------- save data ----
CREATE TABLE IF NOT EXISTS saves(
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL DEFAULT 1,                -- optimistic concurrency token
  blob        TEXT NOT NULL,                             -- JSON.stringify(S)
  saved_at    INTEGER NOT NULL,                          -- the CLIENT's timestamp (display only)
  updated_at  INTEGER NOT NULL,                          -- the SERVER's clock (authoritative)
  last_seen   INTEGER NOT NULL,                          -- server clock at last login/sync
  rate_kph    REAL NOT NULL DEFAULT 0,                   -- server-measured kills/hour (see §8)
  kills_total INTEGER NOT NULL DEFAULT 0,
  -- denormalised, from the client's `pub` whitelist; used by the leaderboard and the GM list
  level INTEGER, cls TEXT, zeny INTEGER, playtime INTEGER
);

CREATE TABLE IF NOT EXISTS save_history(                 -- the last few blobs: the "lost save" cure
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version  INTEGER NOT NULL,
  blob     TEXT NOT NULL,
  saved_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, version)
);
CREATE INDEX IF NOT EXISTS idx_history_user ON save_history(user_id, version DESC);

-- --------------------------------------------------- gm: grants and mail ----
-- A grant is applied by the CLIENT on its next login/sync (it owns the save format and its repair
-- rules), then marked claimed. Offline players are the normal case, so nothing here needs them
-- online. See tools/gm-panel-plan.md §4.
CREATE TABLE IF NOT EXISTS grants(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                              -- zeny | item | level | message
  payload    TEXT NOT NULL DEFAULT '{}',                 -- JSON: {amount} / {item:{...}} / {text}
  note       TEXT,                                       -- why, for the audit trail
  created_by TEXT,
  created_at INTEGER NOT NULL,
  claimed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_grants_user ON grants(user_id, claimed_at);

-- ------------------------------------------------------- announcements ----
CREATE TABLE IF NOT EXISTS messages(
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  body        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'notice',            -- notice | welcome | event
  target_user INTEGER,                                   -- NULL = everyone
  created_by  TEXT,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS message_reads(
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  read_at    INTEGER NOT NULL,
  PRIMARY KEY(user_id, message_id)
);

-- ------------------------------------------------------------- plumbing ----
CREATE TABLE IF NOT EXISTS events(                       -- every GM action, and interesting failures
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      INTEGER NOT NULL,
  actor   TEXT,
  user_id INTEGER,
  kind    TEXT NOT NULL,
  detail  TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_at ON events(at DESC);

CREATE TABLE IF NOT EXISTS rate_limits(                  -- per-IP and per-name counters
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);
