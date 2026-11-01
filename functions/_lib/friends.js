// _lib/friends.js — the friends list: every statement, the pair rules and the shared limits.
//
// A friendship is between two ACCOUNT ids and lives in D1 (`migrations/0012_friends.sql`), never in
// the save blob, so restoring or resetting a character cannot invent or lose one. The same table
// answers the More ▸ Friends panel and the World/Whisper chat menu, which is why nothing here knows
// anything about the browser.
//
// The rules, in one place because both the panel and the chat read them:
//   * one row per pair, whichever way round it was asked; asking twice is a no-op, not a duplicate
//   * you cannot ask yourself, and you cannot ask a suspended account
//   * the addressee accepts or declines; only the addressee can answer
//   * an accepted friendship is mutual: either side unfriends, and the row is deleted
//   * a friend request is a "pending" row, so a declined request can be asked again later
//
// Like the Cash Shop's tables, this migration is applied by hand. Until it exists the API answers
// 503 with `installed:false` and the game hides the panel instead of failing at something the
// player cannot see.

import { HttpError } from './http.js';

export const FRIEND_LIMIT = 100;          // accepted friends per account
export const PENDING_LIMIT = 50;          // outgoing requests still waiting for an answer

const missingTable = e => /no such table/i.test(String((e && e.message) || e));
export const NOT_INSTALLED = 'The friends list is not set up on this server yet.';

// True when migration 0012 has been applied. Cheap: one indexed read that returns no rows.
export async function friendsInstalled(db) {
  try {
    await db.prepare('SELECT 1 FROM friends LIMIT 1').all();
    return true;
  } catch (e) {
    if (missingTable(e)) return false;
    throw e;
  }
}

// The row for this pair, in either order, or null. Used by every action to decide what an attempt
// would actually change before anything is written.
export const pairRow = (db, a, b) =>
  db.prepare(`SELECT * FROM friends
              WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`)
    .bind(a, b, b, a).first();

export const insertRequest = (db, from, to, at = Date.now()) =>
  db.prepare("INSERT INTO friends(requester_id, addressee_id, state, created_at) VALUES(?, ?, 'pending', ?)")
    .bind(from, to, at).run();

export const acceptRequest = (db, from, to, at = Date.now()) =>
  db.prepare("UPDATE friends SET state = 'accepted', accepted_at = ? WHERE requester_id = ? AND addressee_id = ? AND state = 'pending'")
    .bind(at, from, to).run();

export const deletePair = (db, a, b) =>
  db.prepare(`DELETE FROM friends
              WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`)
    .bind(a, b, b, a).run();

// Accounts the caller tried to add that do not exist. Registering is how the list is opened up in
// the first place, so a wrong name is a normal answer, not an error worth stopping for.
const accountsByNames = async (db, names) => {
  const list = [...new Set(names.map(n => String(n || '').trim().toLowerCase()).filter(Boolean))].slice(0, 60);
  if (!list.length) return [];
  // One query, placeholders only: names are never interpolated into SQL.
  const marks = list.map(() => '?').join(',');
  const rows = await db.prepare(`SELECT id, username, gm, banned FROM users WHERE lower(username) IN (${marks})`)
    .bind(...list).all();
  return rows.results || [];
};

// The whole list for one account, in the shape the panel and the chat both render.
//   friends    accepted, with each friend's own last-seen timestamp
//   incoming   pending requests addressed to me (I accept or decline)
//   outgoing   pending requests I sent (I can cancel)
// Ordering is stable: by name, case-insensitively, so the panel never reshuffles under a click.
export async function listFor(db, userId) {
  const rows = await db.prepare(`SELECT f.requester_id, f.addressee_id, f.state, f.created_at, f.accepted_at,
        u.id AS other_id, u.username AS other_name, u.gm AS other_gm, u.banned AS other_banned,
        COALESCE(s.last_seen, 0) AS other_seen
      FROM friends f
      JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
      LEFT JOIN saves s ON s.user_id = u.id
      WHERE f.requester_id = ? OR f.addressee_id = ?`)
    .bind(userId, userId, userId).all();
  const friends = [], incoming = [], outgoing = [];
  const shape = r => ({
    id: r.other_id,
    name: r.other_name,
    gm: !!r.other_gm,
    online: false,                      // the chat socket fills this in; the database has no presence
    lastSeen: Number(r.other_seen) || 0,
    since: Number(r.accepted_at || r.created_at) || 0,
  });
  for (const r of rows.results || []) {
    if (r.state === 'accepted') friends.push(shape(r));
    else if (r.addressee_id === userId) incoming.push({ ...shape(r), askedAt: Number(r.created_at) || 0 });
    else outgoing.push({ ...shape(r), askedAt: Number(r.created_at) || 0 });
  }
  const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id - b.id;
  friends.sort(byName); incoming.sort(byName); outgoing.sort(byName);
  return { friends, incoming, outgoing, limit: FRIEND_LIMIT };
}

// ---------------------------------------------------------------- actions ----
// Every action answers { ok, changed, code } — `changed:false` means "nothing to do", which the
// panel reports as a normal sentence rather than an error. Codes are stable strings, because a test
// (and the chat) should not depend on wording.
//
// Returns the target account so the caller can log a name rather than an id.
export async function friendRequest(db, me, target) {
  if (!target) throw new HttpError(404, 'No player with that name.', { code: 'no-such-player' });
  if (target.id === me) throw new HttpError(400, 'That is you. Pick another name.', { code: 'self' });
  if (target.banned) throw new HttpError(403, 'That account is suspended.', { code: 'banned' });
  const existing = await pairRow(db, me, target.id);
  if (existing) {
    if (existing.state === 'accepted') return { ok: true, changed: false, code: 'already-friends', target };
    if (existing.requester_id === me) return { ok: true, changed: false, code: 'already-asked', target };
    // They asked us first: accepting is the only sensible answer to "add me".
    await acceptRequest(db, target.id, me);
    return { ok: true, changed: true, code: 'accepted', target };
  }
  const counts = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM friends WHERE state = 'accepted' AND (requester_id = ? OR addressee_id = ?)) AS friends,
      (SELECT COUNT(*) FROM friends WHERE state = 'pending' AND requester_id = ?) AS outgoing`)
    .bind(me, me, me).first();
  if (Number(counts && counts.friends) >= FRIEND_LIMIT) throw new HttpError(409, 'Your friends list is full (' + FRIEND_LIMIT + ').', { code: 'friend-limit' });
  if (Number(counts && counts.outgoing) >= PENDING_LIMIT) throw new HttpError(429, 'You have ' + PENDING_LIMIT + ' requests waiting for an answer. Wait for a reply before sending more.', { code: 'pending-limit' });
  await insertRequest(db, me, target.id);
  return { ok: true, changed: true, code: 'requested', target };
}

export async function friendAccept(db, me, from) {
  if (!from) throw new HttpError(404, 'No player with that name.', { code: 'no-such-player' });
  const row = await pairRow(db, me, from.id);
  if (!row) throw new HttpError(404, 'There is no friend request from ' + from.username + '.', { code: 'not-requested' });
  if (row.state === 'accepted') return { ok: true, changed: false, code: 'already-friends', target: from };
  if (row.addressee_id !== me) throw new HttpError(403, 'That request went the other way. Cancel yours, or wait for an answer.', { code: 'not-yours-to-accept' });
  await acceptRequest(db, row.requester_id, row.addressee_id);
  return { ok: true, changed: true, code: 'accepted', target: from };
}

// Declining a request and cancelling one's own both remove the row, so the sender can ask again.
export async function friendRemove(db, me, other) {
  if (!other) throw new HttpError(404, 'No player with that name.', { code: 'no-such-player' });
  const row = await pairRow(db, me, other.id);
  if (!row) return { ok: true, changed: false, code: 'not-friends', target: other };
  await deletePair(db, me, other.id);
  if (row.state === 'accepted') return { ok: true, changed: true, code: 'unfriended', target: other };
  const wasMine = row.requester_id === me;
  return { ok: true, changed: true, code: wasMine ? 'cancelled' : 'declined', target: other };
}

// Resolve a name the player typed, for one of the actions above.
export async function accountByName(db, name) {
  const [row] = await accountsByNames(db, [name]);
  return row || null;
}

export { accountsByNames };
