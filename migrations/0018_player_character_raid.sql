-- Player-character Rift Raid: durable entries, weapon add-ons and reward progression.
-- Combat actions live in the existing Social Durable Object's storage and arrive only when
-- a player acts; this migration deliberately creates no alarm/tick-backed raid work.
CREATE TABLE IF NOT EXISTS raid_accounts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rift_shards INTEGER NOT NULL DEFAULT 0 CHECK(rift_shards >= 0),
  boss_card_copies INTEGER NOT NULL DEFAULT 0 CHECK(boss_card_copies >= 0),
  card_pity INTEGER NOT NULL DEFAULT 0 CHECK(card_pity BETWEEN 0 AND 29),
  qualifying_clears INTEGER NOT NULL DEFAULT 0 CHECK(qualifying_clears >= 0),
  solo_clears INTEGER NOT NULL DEFAULT 0 CHECK(solo_clears >= 0),
  trio_clears INTEGER NOT NULL DEFAULT 0 CHECK(trio_clears >= 0),
  support_clears INTEGER NOT NULL DEFAULT 0 CHECK(support_clears >= 0),
  equipped_aura TEXT,
  equipped_title TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS raid_runs (
  id TEXT PRIMARY KEY,
  leader_id INTEGER NOT NULL REFERENCES users(id),
  party_size INTEGER NOT NULL CHECK(party_size BETWEEN 1 AND 3),
  region INTEGER NOT NULL DEFAULT 0 CHECK(region = 0),
  total_hp INTEGER NOT NULL CHECK(total_hp > 0),
  started_at INTEGER NOT NULL,
  deadline_at INTEGER NOT NULL CHECK(deadline_at > started_at),
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','cleared','failed','cancelled')),
  settled_at INTEGER,
  result_json TEXT NOT NULL DEFAULT '{}'
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

-- A raid start consumes one entry per participant. day_key is the Malaysia calendar date
-- (Asia/Kuala_Lumpur, UTC+08:00); the trigger makes two entries/day race-safe.
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

-- Mythic-only weapon add-ons are item-bound to the stable equipment id. Failed tries cost
-- Rift Shards and retain the same star; after two failures, the next attempt is guaranteed.
CREATE TABLE IF NOT EXISTS raid_weapon_upgrades (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weapon_id TEXT NOT NULL,
  stars INTEGER NOT NULL DEFAULT 0 CHECK(stars BETWEEN 0 AND 20),
  failures INTEGER NOT NULL DEFAULT 0 CHECK(failures BETWEEN 0 AND 2),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,weapon_id)
);
CREATE INDEX IF NOT EXISTS idx_raid_weapon_owner ON raid_weapon_upgrades(user_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS raid_upgrade_actions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_id TEXT NOT NULL,
  weapon_id TEXT NOT NULL,
  cost INTEGER NOT NULL CHECK(cost > 0),
  star_before INTEGER NOT NULL CHECK(star_before BETWEEN 0 AND 19),
  failures_before INTEGER NOT NULL CHECK(failures_before BETWEEN 0 AND 2),
  star_after INTEGER NOT NULL CHECK(star_after BETWEEN 0 AND 20),
  failures_after INTEGER NOT NULL CHECK(failures_after BETWEEN 0 AND 2),
  success INTEGER NOT NULL CHECK(success IN (0,1)),
  guaranteed INTEGER NOT NULL CHECK(guaranteed IN (0,1)),
  chance REAL NOT NULL CHECK(chance BETWEEN 0 AND 1),
  status TEXT NOT NULL DEFAULT 'done' CHECK(status='done'),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,action_id)
);
CREATE TRIGGER IF NOT EXISTS raid_upgrade_action_validate
BEFORE INSERT ON raid_upgrade_actions
WHEN NOT EXISTS (SELECT 1 FROM raid_accounts WHERE user_id=NEW.user_id AND rift_shards>=NEW.cost)
  OR NOT EXISTS (SELECT 1 FROM raid_weapon_upgrades WHERE user_id=NEW.user_id AND weapon_id=NEW.weapon_id
    AND stars=NEW.star_before AND failures=NEW.failures_before)
BEGIN SELECT RAISE(ABORT,'raid_upgrade_state_changed'); END;
CREATE TRIGGER IF NOT EXISTS raid_upgrade_action_apply
AFTER INSERT ON raid_upgrade_actions
BEGIN
  UPDATE raid_accounts SET rift_shards=rift_shards-NEW.cost,updated_at=NEW.created_at WHERE user_id=NEW.user_id;
  UPDATE raid_weapon_upgrades SET stars=NEW.star_after,failures=NEW.failures_after,updated_at=NEW.created_at
    WHERE user_id=NEW.user_id AND weapon_id=NEW.weapon_id;
END;

CREATE TABLE IF NOT EXISTS raid_titles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,title_id)
);
CREATE TABLE IF NOT EXISTS raid_cosmetics (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  aura_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,aura_id)
);

-- Chest records insert the public reward ledger once; the ledger trigger then applies the
-- account balance, ordinary save gifts and progression as one D1 transaction.
CREATE TRIGGER IF NOT EXISTS raid_chest_to_ledger
AFTER INSERT ON raid_chests
BEGIN
  INSERT OR IGNORE INTO raid_reward_ledger(run_id,user_id,kind,payload,created_at)
  VALUES(NEW.run_id,NEW.user_id,NEW.kind,NEW.payload,NEW.created_at);
END;
CREATE TRIGGER IF NOT EXISTS raid_reward_apply
AFTER INSERT ON raid_reward_ledger
BEGIN
  UPDATE raid_accounts SET
    rift_shards=rift_shards+COALESCE(CAST(json_extract(NEW.payload,'$.riftShards') AS INTEGER),0),
    boss_card_copies=boss_card_copies+COALESCE(CAST(json_extract(NEW.payload,'$.cardCopies') AS INTEGER),0),
    card_pity=CASE WHEN NEW.kind='clear' THEN COALESCE(CAST(json_extract(NEW.payload,'$.cardPityAfter') AS INTEGER),card_pity) ELSE card_pity END,
    qualifying_clears=qualifying_clears+CASE WHEN NEW.kind='clear' THEN 1 ELSE 0 END,
    solo_clears=solo_clears+CASE WHEN NEW.kind='clear' AND CAST(json_extract(NEW.payload,'$.partySize') AS INTEGER)=1 THEN 1 ELSE 0 END,
    trio_clears=trio_clears+CASE WHEN NEW.kind='clear' AND CAST(json_extract(NEW.payload,'$.partySize') AS INTEGER)=3 THEN 1 ELSE 0 END,
    support_clears=support_clears+CASE WHEN NEW.kind='clear' AND COALESCE(CAST(json_extract(NEW.payload,'$.support') AS INTEGER),0)>0 THEN 1 ELSE 0 END,
    updated_at=NEW.created_at
  WHERE user_id=NEW.user_id;

  INSERT OR IGNORE INTO raid_titles(user_id,title_id,unlocked_at)
    SELECT NEW.user_id,'riftbreaker',NEW.created_at WHERE NEW.kind='clear';
  INSERT OR IGNORE INTO raid_titles(user_id,title_id,unlocked_at)
    SELECT NEW.user_id,'rift-veteran',NEW.created_at WHERE NEW.kind='clear'
      AND (SELECT qualifying_clears FROM raid_accounts WHERE user_id=NEW.user_id)>=25;
  INSERT OR IGNORE INTO raid_titles(user_id,title_id,unlocked_at)
    SELECT NEW.user_id,'rift-sovereign',NEW.created_at WHERE NEW.kind='clear'
      AND (SELECT qualifying_clears FROM raid_accounts WHERE user_id=NEW.user_id)>=100;
  INSERT OR IGNORE INTO raid_titles(user_id,title_id,unlocked_at)
    SELECT NEW.user_id,'lone-star',NEW.created_at WHERE NEW.kind='clear'
      AND CAST(json_extract(NEW.payload,'$.partySize') AS INTEGER)=1;
  INSERT OR IGNORE INTO raid_titles(user_id,title_id,unlocked_at)
    SELECT NEW.user_id,'triune-oath',NEW.created_at WHERE NEW.kind='clear'
      AND CAST(json_extract(NEW.payload,'$.partySize') AS INTEGER)=3;
  INSERT OR IGNORE INTO raid_titles(user_id,title_id,unlocked_at)
    SELECT NEW.user_id,'rift-lifeline',NEW.created_at WHERE NEW.kind='clear'
      AND COALESCE(CAST(json_extract(NEW.payload,'$.support') AS INTEGER),0)>0;

  INSERT OR IGNORE INTO raid_cosmetics(user_id,aura_id,unlocked_at)
    SELECT NEW.user_id,'fracture-spark',NEW.created_at WHERE NEW.kind='clear'
      AND (SELECT qualifying_clears FROM raid_accounts WHERE user_id=NEW.user_id)>=15;
  INSERT OR IGNORE INTO raid_cosmetics(user_id,aura_id,unlocked_at)
    SELECT NEW.user_id,'broken-orbit',NEW.created_at WHERE NEW.kind='clear'
      AND (SELECT qualifying_clears FROM raid_accounts WHERE user_id=NEW.user_id)>=40;
  INSERT OR IGNORE INTO raid_cosmetics(user_id,aura_id,unlocked_at)
    SELECT NEW.user_id,'astral-mantle',NEW.created_at WHERE NEW.kind='clear'
      AND (SELECT qualifying_clears FROM raid_accounts WHERE user_id=NEW.user_id)>=80;
  INSERT OR IGNORE INTO raid_cosmetics(user_id,aura_id,unlocked_at)
    SELECT NEW.user_id,'event-horizon',NEW.created_at WHERE NEW.kind='clear'
      AND (SELECT qualifying_clears FROM raid_accounts WHERE user_id=NEW.user_id)>=150;

  INSERT INTO grants(user_id,kind,payload,note,created_by,created_at)
    SELECT NEW.user_id,'gift',json_object('resource','ascMat2','amount',CAST(json_extract(NEW.payload,'$.sigils') AS INTEGER)),
      'Rift Raid reward · Valkyrie’s Sigils','Rift Raid',NEW.created_at
    WHERE COALESCE(CAST(json_extract(NEW.payload,'$.sigils') AS INTEGER),0)>0;
  INSERT INTO grants(user_id,kind,payload,note,created_by,created_at)
    SELECT NEW.user_id,'gift',json_object('resource','ascMat0','amount',CAST(json_extract(NEW.payload,'$.regionalMaterials') AS INTEGER)),
      'Rift Raid reward · Astral Shards','Rift Raid',NEW.created_at
    WHERE COALESCE(CAST(json_extract(NEW.payload,'$.regionalMaterials') AS INTEGER),0)>0;
  INSERT INTO grants(user_id,kind,payload,note,created_by,created_at)
    SELECT NEW.user_id,'zeny',json_object('amount',CAST(json_extract(NEW.payload,'$.zeny') AS INTEGER)),
      'Rift Raid reward · Zeny','Rift Raid',NEW.created_at
    WHERE COALESCE(CAST(json_extract(NEW.payload,'$.zeny') AS INTEGER),0)>0;
  -- A card drop is also delivered through the existing client-owned save/grant pipeline. The
  -- account counter above remains authoritative for raid rank bonuses even before the save claims
  -- this bound collection copy.
  INSERT INTO grants(user_id,kind,payload,note,created_by,created_at)
    SELECT NEW.user_id,'gift',json_object('item',json_object(
      'card',1,'cardVersion',1,'raidCard','rift-sovereign','cardKey','raid:rift-sovereign',
      'family','Rift Sovereign Card','n','Rift Sovereign Card','stat','raidCard','v',1,'g',3,
      'effects',json_array(json_object('k','raidCard','v',1)),'fit',json_array(),'bossCard',json('true')),
      'amount',CAST(json_extract(NEW.payload,'$.cardCopies') AS INTEGER)),
      'Rift Raid reward · Rift Sovereign Card','Rift Raid',NEW.created_at
    WHERE COALESCE(CAST(json_extract(NEW.payload,'$.cardCopies') AS INTEGER),0)>0;
END;
