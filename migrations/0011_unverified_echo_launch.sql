-- Launch of UNVERIFIED Echo scores and prizes. Existing legacy scores and
-- settlements remain untouched and are never automatically back-paid.
-- First request to the new board/save code schedules the NEXT Singapore midnight. Weekly prizes
-- start with the first full Monday-to-Monday period after that boundary.
CREATE TABLE IF NOT EXISTS unverified_echo_config (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  starts_at INTEGER NOT NULL,
  ruleset TEXT NOT NULL CHECK(ruleset='unverified-save-v1')
);
INSERT INTO unverified_echo_config(singleton,starts_at,ruleset)
VALUES(1,0,'unverified-save-v1')
ON CONFLICT(singleton) DO NOTHING;

CREATE INDEX IF NOT EXISTS competition_due_idx ON competition_periods(ruleset,state,ends_at);
