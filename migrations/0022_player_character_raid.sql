-- 0022_player_character_raid.sql — D1 side of the player-character Rift Raid.
--
-- Scope: one boss encounter for 1-3 characters, two entries per Malaysia calendar day, a durable
-- pity/fractured chest ledger, and exactly-once reward delivery through a unique grant ref.
--
-- Deliberately absent (deferred to the progression/economy review):
--   * weapon stars / paid upgrade actions
--   * raid-card copies, ranks or penetration
--   * global combat bonuses, titles, auras and other cosmetic expansion
--
-- Live HP, phase, lanes, action receipts and deadlines are owned by the existing Social Durable
-- Object's storage. This migration adds no alarm, no tick table and no per-second work: every
-- statement below runs only when a player starts or settles a run.
--
-- Additive only. Existing saves, grants and migrations are preserved.

CREATE TABLE IF NOT EXISTS raid_accounts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rift_shards INTEGER NOT NULL DEFAULT 0 CHECK(rift_shards >= 0),
  qualifying_clears INTEGER NOT NULL DEFAULT 0 CHECK(qualifying_clears >= 0),
  solo_clears INTEGER NOT NULL DEFAULT 0 CHECK(solo_clears >= 0),
  trio_clears INTEGER NOT NULL DEFAULT 0 CHECK(trio_clears >= 0),
  support_clears INTEGER NOT NULL DEFAULT 0 CHECK(support_clears >= 0),
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS raid_runs (
  id TEXT PRIMARY KEY,
  leader_id INTEGER NOT NULL REFERENCES users(id),
  party_size INTEGER NOT NULL CHECK(party_size BETWEEN 1 AND 3),
  total_hp INTEGER NOT NULL CHECK(total_hp > 0),
  seed INTEGER NOT NULL DEFAULT 1,
  started_at INTEGER NOT NULL,
  deadline_at INTEGER NOT NULL CHECK(deadline_at > started_at),
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','cleared','failed','cancelled')),
  settled_at INTEGER,
  result_json TEXT NOT NULL DEFAULT '{}',
  -- D1 checkpoint of the DO-owned encounter. It is written after an accepted action so a rebuilt
  -- Durable Object can restore the same HP, phase, receipts and deadlines instead of starting over.
  checkpoint_json TEXT NOT NULL DEFAULT '{}',
  checkpoint_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_raid_runs_leader ON raid_runs(leader_id,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_raid_runs_state ON raid_runs(state,deadline_at);

CREATE TABLE IF NOT EXISTS raid_run_members (
  run_id TEXT NOT NULL REFERENCES raid_runs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  profile_json TEXT NOT NULL DEFAULT '{}',
  damage INTEGER NOT NULL DEFAULT 0 CHECK(damage >= 0),
  support INTEGER NOT NULL DEFAULT 0 CHECK(support >= 0),
  actions INTEGER NOT NULL DEFAULT 0 CHECK(actions >= 0),
  dodges INTEGER NOT NULL DEFAULT 0 CHECK(dodges >= 0),
  downs INTEGER NOT NULL DEFAULT 0 CHECK(downs >= 0),
  meaningful INTEGER NOT NULL DEFAULT 0 CHECK(meaningful IN (0,1)),
  PRIMARY KEY(run_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_raid_members_user ON raid_run_members(user_id,run_id);

-- One entry per participant per run. The triggers make the two-entry daily cap and the one-active-
-- run rule race-safe inside the same D1 transaction that inserts the run and its roster.
CREATE TABLE IF NOT EXISTS raid_entries (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key TEXT NOT NULL CHECK(day_key GLOB '????-??-??'),
  run_id TEXT NOT NULL REFERENCES raid_runs(id) ON DELETE CASCADE,
  entered_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,run_id)
);
CREATE INDEX IF NOT EXISTS idx_raid_entries_daily ON raid_entries(user_id,day_key,entered_at);
CREATE TRIGGER IF NOT EXISTS raid_entry_daily_limit
BEFORE INSERT ON raid_entries
WHEN (SELECT COUNT(*) FROM raid_entries WHERE user_id=NEW.user_id AND day_key=NEW.day_key) >= 2
BEGIN SELECT RAISE(ABORT,'raid_daily_entry_limit'); END;
CREATE TRIGGER IF NOT EXISTS raid_entry_active_limit
BEFORE INSERT ON raid_entries
WHEN EXISTS (
  SELECT 1 FROM raid_run_members m JOIN raid_runs r ON r.id=m.run_id
  WHERE m.user_id=NEW.user_id AND r.state='active' AND m.run_id<>NEW.run_id
)
BEGIN SELECT RAISE(ABORT,'raid_active_run'); END;

CREATE TABLE IF NOT EXISTS raid_settlements (
  run_id TEXT PRIMARY KEY REFERENCES raid_runs(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK(outcome IN ('clear','failed')),
  settled_at INTEGER NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS raid_chests (
  run_id TEXT NOT NULL REFERENCES raid_runs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key TEXT NOT NULL CHECK(day_key GLOB '????-??-??'),
  kind TEXT NOT NULL CHECK(kind IN ('pity','fractured')),
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(run_id,user_id,kind)
);
CREATE INDEX IF NOT EXISTS idx_raid_chests_daily ON raid_chests(user_id,day_key,kind);

CREATE TABLE IF NOT EXISTS raid_reward_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES raid_runs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(run_id,user_id,kind)
);

-- A settlement may legitimately be retried after a lost HTTP response. The unique `ref` makes the
-- ordinary grants queue exactly-once without changing the existing grant expiry rules: a retry
-- attempts the same refs and inserts nothing. Rift Raid grants are server-settled and remain
-- claimable until the save accepts them; the grants API treats this sender as non-expiring.
ALTER TABLE grants ADD COLUMN ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_grants_ref ON grants(ref) WHERE ref IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS raid_chest_to_ledger
AFTER INSERT ON raid_chests
BEGIN
  INSERT OR IGNORE INTO raid_reward_ledger(run_id,user_id,kind,payload,created_at)
  VALUES(NEW.run_id,NEW.user_id,NEW.kind,NEW.payload,NEW.created_at);
END;

-- The ledger is the single door that changes an account balance or creates an ordinary grant.
-- INSERT OR IGNORE plus UNIQUE(run_id,user_id,kind) means replaying a settlement cannot pay twice.
CREATE TRIGGER IF NOT EXISTS raid_reward_apply
AFTER INSERT ON raid_reward_ledger
BEGIN
  UPDATE raid_accounts SET
    rift_shards=rift_shards+COALESCE(CAST(json_extract(NEW.payload,'$.riftShards') AS INTEGER),0),
    qualifying_clears=qualifying_clears+CASE WHEN NEW.kind='clear' THEN 1 ELSE 0 END,
    solo_clears=solo_clears+CASE WHEN NEW.kind='clear' AND CAST(json_extract(NEW.payload,'$.partySize') AS INTEGER)=1 THEN 1 ELSE 0 END,
    trio_clears=trio_clears+CASE WHEN NEW.kind='clear' AND CAST(json_extract(NEW.payload,'$.partySize') AS INTEGER)=3 THEN 1 ELSE 0 END,
    support_clears=support_clears+CASE WHEN NEW.kind='clear' AND COALESCE(CAST(json_extract(NEW.payload,'$.support') AS INTEGER),0)>0 THEN 1 ELSE 0 END,
    updated_at=NEW.created_at
  WHERE user_id=NEW.user_id;

  INSERT OR IGNORE INTO grants(user_id,kind,payload,note,created_by,created_at,ref)
    SELECT NEW.user_id,'gift',json_object('resource','riftShards','amount',CAST(json_extract(NEW.payload,'$.riftShards') AS INTEGER)),
      'Rift Raid reward - Rift Shards','Rift Raid',NEW.created_at,
      'raid:'||NEW.run_id||':'||NEW.user_id||':'||NEW.kind||':riftShards'
    WHERE COALESCE(CAST(json_extract(NEW.payload,'$.riftShards') AS INTEGER),0)>0;
  INSERT OR IGNORE INTO grants(user_id,kind,payload,note,created_by,created_at,ref)
    SELECT NEW.user_id,'gift',json_object('resource','ascMat2','amount',CAST(json_extract(NEW.payload,'$.sigils') AS INTEGER)),
      'Rift Raid reward - Valkyrie''s Sigils','Rift Raid',NEW.created_at,
      'raid:'||NEW.run_id||':'||NEW.user_id||':'||NEW.kind||':sigils'
    WHERE COALESCE(CAST(json_extract(NEW.payload,'$.sigils') AS INTEGER),0)>0;
  INSERT OR IGNORE INTO grants(user_id,kind,payload,note,created_by,created_at,ref)
    SELECT NEW.user_id,'gift',json_object('resource','ascMat0','amount',CAST(json_extract(NEW.payload,'$.regionalMaterials') AS INTEGER)),
      'Rift Raid reward - Astral Shards','Rift Raid',NEW.created_at,
      'raid:'||NEW.run_id||':'||NEW.user_id||':'||NEW.kind||':astral'
    WHERE COALESCE(CAST(json_extract(NEW.payload,'$.regionalMaterials') AS INTEGER),0)>0;
  INSERT OR IGNORE INTO grants(user_id,kind,payload,note,created_by,created_at,ref)
    SELECT NEW.user_id,'zeny',json_object('amount',CAST(json_extract(NEW.payload,'$.zeny') AS INTEGER)),
      'Rift Raid reward - Zeny','Rift Raid',NEW.created_at,
      'raid:'||NEW.run_id||':'||NEW.user_id||':'||NEW.kind||':zeny'
    WHERE COALESCE(CAST(json_extract(NEW.payload,'$.zeny') AS INTEGER),0)>0;
END;
