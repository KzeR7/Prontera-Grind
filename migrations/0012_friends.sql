-- Friends (haven-v273): a mutual relationship between two ACCOUNTS, not characters.
-- Apply with: npx wrangler d1 execute pg --remote --file=migrations/0012_friends.sql
--
-- One row per relationship, whoever asked. `state` is the whole story:
--   pending   the requester asked, the addressee has not answered yet
--   accepted  both sides are friends; either side may unfriend (the row is deleted)
-- A pair can only ever have one row: the unique index below folds (a,b) and (b,a) into the same
-- key, so two players who add each other at the same moment cannot end up as two half-friends.
-- Friendship is stored here rather than in the save blob because it is a fact about two accounts
-- and must survive a browser save being replaced, restored or reset.
CREATE TABLE IF NOT EXISTS friends(
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state        TEXT NOT NULL DEFAULT 'pending',
  created_at   INTEGER NOT NULL,
  accepted_at  INTEGER,
  PRIMARY KEY(requester_id, addressee_id),
  CHECK(requester_id <> addressee_id),
  CHECK(state IN ('pending', 'accepted'))
);
-- Requests waiting for this account (the "3 friend requests" badge), and the accepted list.
CREATE INDEX IF NOT EXISTS idx_friends_addressee ON friends(addressee_id, state);
CREATE INDEX IF NOT EXISTS idx_friends_requester ON friends(requester_id, state);
-- The pair, in either order, may exist only once. D1's SQLite honours expression indexes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_friends_pair ON friends(
  min(requester_id, addressee_id), max(requester_id, addressee_id)
);
