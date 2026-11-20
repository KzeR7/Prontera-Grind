-- 0023_raid_cards.sql — account-wide raid cards and the earned-card collection.
--
-- A card is account-wide, not per character. One card may be equipped; every duplicate drop adds a
-- copy and raises the card's rank (rank thresholds live in functions/_lib/raid-rules.js). The card
-- itself is cosmetic+combat progression owned by D1, never a mailbox gift, so it cannot expire.
--
-- Additive only. Existing saves, grants, chests and the 0022 settlement ledger are untouched. The
-- drop trigger is the only writer of raid_cards, which makes a replayed settlement idempotent: the
-- (run_id,user_id,kind) primary key lets the INSERT OR IGNORE in the API collapse to one row.
CREATE TABLE IF NOT EXISTS raid_cards (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_key TEXT NOT NULL,
  copies INTEGER NOT NULL DEFAULT 0 CHECK(copies >= 0),
  equipped INTEGER NOT NULL DEFAULT 0 CHECK(equipped IN (0,1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,card_key)
);
CREATE INDEX IF NOT EXISTS idx_raid_cards_equipped ON raid_cards(user_id,equipped);

CREATE TABLE IF NOT EXISTS raid_card_drops (
  run_id TEXT NOT NULL REFERENCES raid_runs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('clear','fractured','pity')),
  card_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(run_id,user_id,kind)
);

CREATE TRIGGER IF NOT EXISTS raid_card_drop_apply
AFTER INSERT ON raid_card_drops
BEGIN
  INSERT INTO raid_cards(user_id,card_key,copies,equipped,updated_at)
  VALUES(NEW.user_id,NEW.card_key,1,0,NEW.created_at)
  ON CONFLICT(user_id,card_key) DO UPDATE SET
    copies=raid_cards.copies+1,
    updated_at=NEW.created_at;
END;
