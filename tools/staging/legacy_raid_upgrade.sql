-- Legacy Rift Raid schema repair for pg-staging.
--
-- The isolated staging DB was previously used by the v411 raid experiment, whose migration 0018
-- created raid_runs without seed/checkpoint columns and a raid_reward_apply trigger that predates
-- the exactly-once grants.ref ledger. This file upgrades that state in place; it is never applied
-- to a fresh database (0022 handles those) and never touches production.
--
-- The caller adds raid_runs.seed/checkpoint_json/checkpoint_at and grants.ref only when the
-- corresponding PRAGMA table_info says they are missing, then runs this trigger replacement.

DROP TRIGGER IF EXISTS raid_chest_to_ledger;
DROP TRIGGER IF EXISTS raid_reward_apply;

CREATE TRIGGER raid_chest_to_ledger
AFTER INSERT ON raid_chests
BEGIN
  INSERT OR IGNORE INTO raid_reward_ledger(run_id,user_id,kind,payload,created_at)
  VALUES(NEW.run_id,NEW.user_id,NEW.kind,NEW.payload,NEW.created_at);
END;

-- Must match 0022_player_character_raid.sql. A retry of a lost settlement attempts the same
-- grants.ref values, so it cannot pay twice; Rift Raid grants never get an expiry.
CREATE TRIGGER raid_reward_apply
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

-- Old v411 active runs have no checkpoint, so they cannot be resumed by this build. Cancel them
-- instead of leaving a run that the lobby can never settle. Completed/failed history is kept.
UPDATE raid_runs
  SET state='cancelled', settled_at=CAST(strftime('%s','now') AS INTEGER)*1000
  WHERE state='active' AND (checkpoint_at IS NULL OR checkpoint_at=0);
