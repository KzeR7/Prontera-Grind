-- Additive settlement tables used by the explicitly UNVERIFIED launch.
-- Client-reported scores and gear are forgeable; D1 storage does not make them trustworthy.
CREATE TABLE IF NOT EXISTS competition_periods (
  period_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('daily','weekly')),
  ruleset TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL CHECK(ends_at > starts_at AND ends_at % 1000 = 0),
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','settling','closed')),
  claim_token TEXT,
  closed_at INTEGER,
  CHECK((kind='daily' AND period_key GLOB 'day:????-??-??') OR
        (kind='weekly' AND period_key GLOB 'week:????-??-??'))
);
CREATE TABLE IF NOT EXISTS competition_scores (
  period_key TEXT NOT NULL REFERENCES competition_periods(period_key),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  score REAL NOT NULL CHECK(score > 0),
  recorded_at INTEGER NOT NULL,
  PRIMARY KEY(period_key,user_id),
  UNIQUE(period_key,run_id)
);
-- Future score writers must still prove the run and use a server clock. These
-- guards only enforce period state/time; they do not authenticate any score.
CREATE TRIGGER IF NOT EXISTS competition_score_insert_window
BEFORE INSERT ON competition_scores
WHEN NOT EXISTS (SELECT 1 FROM competition_periods p WHERE p.period_key=NEW.period_key
  AND p.state='open' AND p.starts_at <= CAST(strftime('%s','now') AS INTEGER)*1000
  AND p.ends_at > CAST(strftime('%s','now') AS INTEGER)*1000
  AND NEW.recorded_at >= p.starts_at AND NEW.recorded_at < p.ends_at)
BEGIN SELECT RAISE(ABORT,'competition period unavailable'); END;
CREATE TRIGGER IF NOT EXISTS competition_score_update_window
BEFORE UPDATE ON competition_scores
WHEN NEW.period_key <> OLD.period_key OR NEW.user_id <> OLD.user_id OR
  NOT EXISTS (SELECT 1 FROM competition_periods p WHERE p.period_key=NEW.period_key
    AND p.state='open' AND p.starts_at <= CAST(strftime('%s','now') AS INTEGER)*1000
    AND p.ends_at > CAST(strftime('%s','now') AS INTEGER)*1000
    AND NEW.recorded_at >= p.starts_at AND NEW.recorded_at < p.ends_at)
BEGIN SELECT RAISE(ABORT,'competition period unavailable'); END;
CREATE TABLE IF NOT EXISTS competition_placements (
  period_key TEXT NOT NULL REFERENCES competition_periods(period_key),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK(rank BETWEEN 1 AND 100),
  score REAL NOT NULL,
  run_id TEXT NOT NULL,
  PRIMARY KEY(period_key,user_id), UNIQUE(period_key,rank)
);
-- Each ledger insertion creates exactly one ordinary gift in the same D1
-- transaction; the existing durable-receipt claim path continues to apply.
CREATE TABLE IF NOT EXISTS competition_prize_ledger (
  id INTEGER PRIMARY KEY,
  period_key TEXT NOT NULL REFERENCES competition_periods(period_key),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource TEXT NOT NULL CHECK(resource IN ('refineScrolls','mythicScrolls','dailyRolls','shards')),
  amount INTEGER NOT NULL CHECK(amount > 0),
  created_at INTEGER NOT NULL,
  grant_id INTEGER UNIQUE REFERENCES grants(id) ON DELETE SET NULL,
  UNIQUE(period_key,user_id,resource)
);
CREATE TRIGGER IF NOT EXISTS competition_prize_requires_settlement
BEFORE INSERT ON competition_prize_ledger
WHEN NOT EXISTS (SELECT 1 FROM competition_periods p JOIN competition_placements a
  ON a.period_key=p.period_key AND a.user_id=NEW.user_id
  WHERE p.period_key=NEW.period_key AND p.state='settling')
BEGIN SELECT RAISE(ABORT,'prize outside settlement'); END;
CREATE TRIGGER IF NOT EXISTS competition_prize_create_grant
AFTER INSERT ON competition_prize_ledger
BEGIN
  INSERT INTO grants(user_id,kind,payload,note,created_by,created_at)
  VALUES(NEW.user_id,'gift',json_object('resource',NEW.resource,'amount',NEW.amount),
    'Endless Echo ' || (SELECT kind FROM competition_periods WHERE period_key=NEW.period_key) ||
      ' rank #' || (SELECT rank FROM competition_placements WHERE period_key=NEW.period_key AND user_id=NEW.user_id) ||
      ' · ' || NEW.period_key, 'Echo competition', NEW.created_at);
  UPDATE competition_prize_ledger SET grant_id=last_insert_rowid() WHERE id=NEW.id;
END;
CREATE INDEX IF NOT EXISTS idx_competition_scores_rank ON competition_scores(period_key,score DESC,user_id ASC);
