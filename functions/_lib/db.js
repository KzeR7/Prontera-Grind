// _lib/db.js — every SQL statement in one place.
//
// Two reasons for the single file: the handlers stay readable, and tools/tests/api_sim.js can run
// this exact SQL against a real SQLite database (node:sqlite) through a D1-shaped shim, so the
// queries are tested rather than assumed. If you add SQL anywhere else, move it here.

const now = () => Date.now();

// ------------------------------------------------------------------ users ----
export const userByName = (db, username) =>
  db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').bind(username).first();

export const userById = (db, id) =>
  db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();

export const countUsers = async (db) =>
  (await db.prepare('SELECT COUNT(*) AS n FROM users').first())?.n ?? 0;

export const insertUser = (db, { username, passHash, recoveryHash, gm = 0 }) =>
  db.prepare(`INSERT INTO users(username, pass_hash, recovery_hash, gm, created_at, fail_count, fail_at)
              VALUES(?, ?, ?, ?, ?, 0, 0)`)
    .bind(username, passHash, recoveryHash, gm, now()).run();

export const setPassword = (db, userId, passHash) =>
  db.prepare('UPDATE users SET pass_hash = ?, fail_count = 0, fail_at = 0 WHERE id = ?')
    .bind(passHash, userId).run();

export const setGm = (db, userId, level) =>
  db.prepare('UPDATE users SET gm = ? WHERE id = ?').bind(level, userId).run();

export const setBanned = (db, userId, banned) =>
  db.prepare('UPDATE users SET banned = ? WHERE id = ?').bind(banned ? 1 : 0, userId).run();

export const noteLogin = (db, userId) =>
  db.prepare('UPDATE users SET last_login_at = ?, fail_count = 0, fail_at = 0 WHERE id = ?')
    .bind(now(), userId).run();

// Count a failed login. The first read MUST be awaited: D1's .first() is a promise, and reading it
// without awaiting left every failure looking like the first one — which silently disabled the
// per-account lockout until tools/tests/api_sim.js caught it.
export const noteFailure = async (db, userId, windowMs = 900000) => {
  const r = await db.prepare('SELECT fail_count, fail_at FROM users WHERE id = ?').bind(userId).first();
  const stale = !r || now() - (r.fail_at || 0) > windowMs;
  return db.prepare('UPDATE users SET fail_count = ?, fail_at = ? WHERE id = ?')
    .bind(stale ? 1 : r.fail_count + 1, now(), userId).run();
};

// ----------------------------------------------------------------- saves ----
export const saveByUser = (db, userId) =>
  db.prepare('SELECT * FROM saves WHERE user_id = ?').bind(userId).first();

export const insertSave = (db, userId, blob, savedAt, pub, rateKph = 0) =>
  db.prepare(`INSERT INTO saves(user_id, version, blob, saved_at, updated_at, last_seen, rate_kph,
                                kills_total, level, cls, zeny, playtime)
              VALUES(?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(userId, blob, savedAt, now(), now(), rateKph, pub.kills ?? 0, pub.lv ?? null, pub.cls ?? null,
      pub.zeny ?? null, pub.playtime ?? null).run();

export const updateSaveStatement = (db, userId, version, blob, savedAt, pub, rateKph, expectedVersion = null) => {
  const versionGuard = expectedVersion == null ? '' : ' AND version = ?';
  const args = [version, blob, savedAt, now(), now(), rateKph, pub.kills ?? 0, pub.lv ?? null,
    pub.cls ?? null, pub.zeny ?? null, pub.playtime ?? null, userId];
  if (expectedVersion != null) args.push(expectedVersion);
  return db.prepare(`UPDATE saves SET version = ?, blob = ?, saved_at = ?, updated_at = ?, last_seen = ?,
                                rate_kph = ?, kills_total = ?, level = ?, cls = ?, zeny = ?, playtime = ?
              WHERE user_id = ?${versionGuard}`).bind(...args);
};

export const updateSave = (db, userId, version, blob, savedAt, pub, rateKph, expectedVersion = null) =>
  updateSaveStatement(db, userId, version, blob, savedAt, pub, rateKph, expectedVersion).run();

export const touchSeen = (db, userId, at = now()) =>
  db.prepare('UPDATE saves SET last_seen = ?, updated_at = updated_at WHERE user_id = ?')
    .bind(at, userId).run();

// An offline claim is a server-timed, persistent entitlement. It remains pending until a versioned
// save containing its ID is accepted, so retrying login or losing a response can neither reroll nor
// duplicate the same away period.
export const pendingOfflineClaim = (db, userId) =>
  db.prepare(`SELECT id, away_ms, credited_ms, rate_kph, kills, remainder, issued_at, claimed_at
              FROM offline_reward_claims WHERE user_id = ? AND claimed_at IS NULL ORDER BY id DESC LIMIT 1`)
    .bind(userId).first();

export const offlineClaimById = (db, userId, id) =>
  db.prepare(`SELECT id, away_ms, credited_ms, rate_kph, kills, remainder, issued_at, claimed_at
              FROM offline_reward_claims WHERE user_id = ? AND id = ?`).bind(userId, id).first();

export const lastOfflineRemainder = async (db, userId) => {
  const row = await db.prepare(`SELECT remainder FROM offline_reward_claims
                                WHERE user_id = ? AND claimed_at IS NOT NULL ORDER BY id DESC LIMIT 1`)
    .bind(userId).first();
  return Number(row?.remainder) || 0;
};

export const insertOfflineClaim = (db, userId, claim, issuedAt) =>
  db.prepare(`INSERT OR IGNORE INTO offline_reward_claims
              (user_id, away_ms, credited_ms, rate_kph, kills, remainder, issued_at)
              VALUES(?, ?, ?, ?, ?, ?, ?)`)
    .bind(userId, claim.awayMs, claim.creditedMs, claim.rateKph, claim.kills, claim.remainder, issuedAt).run();

export const markOfflineClaimStatement = (db, userId, id, claimedAt, version, blob) =>
  db.prepare(`UPDATE offline_reward_claims SET claimed_at = ?
              WHERE user_id = ? AND id = ? AND claimed_at IS NULL
                AND EXISTS (SELECT 1 FROM saves WHERE user_id = ? AND version = ? AND blob = ?)`)
    .bind(claimedAt, userId, id, userId, version, blob);

export const pushHistory = (db, userId, version, blob, savedAt) =>
  db.prepare('INSERT OR REPLACE INTO save_history(user_id, version, blob, saved_at) VALUES(?, ?, ?, ?)')
    .bind(userId, version, blob, savedAt).run();

export const trimHistory = (db, userId, keep = 5) =>
  db.prepare(`DELETE FROM save_history WHERE user_id = ? AND version NOT IN (
                SELECT version FROM save_history WHERE user_id = ? ORDER BY version DESC LIMIT ?)`)
    .bind(userId, userId, keep).run();

export const historyFor = (db, userId) =>
  db.prepare('SELECT version, saved_at FROM save_history WHERE user_id = ? ORDER BY version DESC')
    .bind(userId).all();

export const historyBlob = (db, userId, version) =>
  db.prepare('SELECT blob, saved_at FROM save_history WHERE user_id = ? AND version = ?')
    .bind(userId, version).first();

export const allSaves = (db, limit = 200) =>
  db.prepare(`SELECT s.user_id, u.username, u.gm, u.banned, s.version, s.blob, s.saved_at, s.updated_at,
                     s.last_seen, s.level, s.cls, s.zeny, s.playtime, s.kills_total, s.rate_kph
              FROM saves s JOIN users u ON u.id = s.user_id
              ORDER BY s.updated_at DESC LIMIT ?`).bind(limit).all();

export const allUsers = (db, limit = 200) =>
  db.prepare(`SELECT u.id, u.username, u.gm, u.banned, u.created_at, u.last_login_at,
                     (SELECT version FROM saves s WHERE s.user_id = u.id) AS version,
                     (SELECT updated_at FROM saves s WHERE s.user_id = u.id) AS updated_at,
                     (SELECT level FROM saves s WHERE s.user_id = u.id) AS level,
                     (SELECT cls FROM saves s WHERE s.user_id = u.id) AS cls
              FROM users u ORDER BY u.last_login_at DESC LIMIT ?`).bind(limit).all();

export const blobBytes = (db, userId) =>
  db.prepare('SELECT LENGTH(blob) AS n FROM saves WHERE user_id = ?').bind(userId).first();

// -------------------------------------------------------------- sessions ----
export const insertSession = (db, tokenHash, userId, expiresAt, ua, ipHash) =>
  db.prepare(`INSERT INTO sessions(token_hash, user_id, created_at, expires_at, ua, ip_hash)
              VALUES(?, ?, ?, ?, ?, ?)`)
    .bind(tokenHash, userId, now(), expiresAt, ua, ipHash).run();

export const sessionByToken = (db, hash) =>
  db.prepare(`SELECT s.*, u.username, u.gm, u.banned FROM sessions s JOIN users u ON u.id = s.user_id
              WHERE s.token_hash = ?`).bind(hash).first();

export const touchSession = (db, hash, expiresAt) =>
  db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(expiresAt, hash).run();

export const deleteSession = (db, hash) =>
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();

export const deleteUserSessions = (db, userId) =>
  db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();

export const expireSessions = (db) =>
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()).run();

// ---------------------------------------------------------------- grants ----
export const insertGrant = (db, userId, kind, payload, note, createdBy) =>
  db.prepare(`INSERT INTO grants(user_id, kind, payload, note, created_by, created_at)
              VALUES(?, ?, ?, ?, ?, ?)`)
    .bind(userId, kind, JSON.stringify(payload ?? {}), note ?? null, createdBy ?? null, now()).run();

export const pendingGrants = (db, userId) =>
  db.prepare('SELECT * FROM grants WHERE user_id = ? AND claimed_at IS NULL ORDER BY id').bind(userId).all();

export const claimGrants = (db, userId, ids) => {
  if (!ids.length) return null;
  const marks = ids.map(() => '?').join(',');
  return db.prepare(`UPDATE grants SET claimed_at = ? WHERE user_id = ? AND id IN (${marks})`)
    .bind(now(), userId, ...ids).run();
};

export const grantsFor = (db, userId) =>
  db.prepare('SELECT * FROM grants WHERE user_id = ? ORDER BY id DESC LIMIT 50').bind(userId).all();

// -------------------------------------------------------------- messages ----
export const insertMessage = (db, body, kind, targetUser, createdBy) =>
  db.prepare('INSERT INTO messages(body, kind, target_user, created_by, created_at) VALUES(?, ?, ?, ?, ?)')
    .bind(body, kind, targetUser ?? null, createdBy ?? null, now()).run();

export const unreadMessages = (db, userId, limit = 20) =>
  db.prepare(`SELECT m.id, m.body, m.kind, m.created_at, m.created_by FROM messages m
              WHERE (m.target_user IS NULL OR m.target_user = ?)
                AND NOT EXISTS (SELECT 1 FROM message_reads r WHERE r.message_id = m.id AND r.user_id = ?)
              ORDER BY m.id DESC LIMIT ?`).bind(userId, userId, limit).all();

export const markRead = (db, userId, ids) => {
  if (!ids.length) return null;
  const stmt = db.prepare('INSERT OR IGNORE INTO message_reads(user_id, message_id, read_at) VALUES(?, ?, ?)');
  for (const id of ids) stmt.bind(userId, id, now()).run();
  return null;
};

export const allMessages = (db, limit = 50) =>
  db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT ?').bind(limit).all();

// ---------------------------------------------------------------- events ----
export const logEvent = (db, actor, userId, kind, detail) =>
  db.prepare('INSERT INTO events(at, actor, user_id, kind, detail) VALUES(?, ?, ?, ?, ?)')
    .bind(now(), actor ?? null, userId ?? null, kind, detail ? String(detail).slice(0, 500) : null).run();

export const recentEvents = (db, limit = 100) =>
  db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?').bind(limit).all();

// ----------------------------------------------------------------- usage ----
// One read-only snapshot of what this account costs to keep: a handful of small aggregate reads,
// used by the GM console's Usage card. Everything the free plan meters on Cloudflare's side
// (Function requests, D1 rows) is NOT derivable from these tables — that needs the Analytics API —
// so this is deliberately the "our own books" half of the picture (_lib/usage.js is the other).
export const usageLedger = async (db, sinceMs) => {
  const r = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM users)                            AS accounts,
      (SELECT COUNT(*) FROM saves)                             AS saves,
      (SELECT COALESCE(SUM(LENGTH(blob)), 0) FROM saves)       AS save_bytes,
      (SELECT COALESCE(MAX(LENGTH(blob)), 0) FROM saves)       AS biggest_save,
      (SELECT COUNT(*) FROM save_history)                      AS history_rows,
      (SELECT COALESCE(SUM(LENGTH(blob)), 0) FROM save_history) AS history_bytes,
      (SELECT COUNT(*) FROM sessions WHERE expires_at > ?)     AS live_sessions,
      (SELECT COUNT(*) FROM events WHERE at >= ?)              AS events_today,
      (SELECT COUNT(*) FROM grants WHERE claimed_at IS NULL)   AS grants_waiting`)
    .bind(sinceMs, sinceMs).first();
  const n = (v) => Number(v) || 0;
  return {
    accounts: n(r?.accounts), saves: n(r?.saves),
    saveBytes: n(r?.save_bytes), biggestSave: n(r?.biggest_save),
    historyRows: n(r?.history_rows), historyBytes: n(r?.history_bytes),
    liveSessions: n(r?.live_sessions), eventsToday: n(r?.events_today),
    grantsWaiting: n(r?.grants_waiting),
  };
};

// ----------------------------------------------------------- rate limits ----
// Windows are fixed-size: cheap, good enough, and it keeps the SQL tiny.
export async function hitRate(db, key, limit, windowMs) {
  const row = await db.prepare('SELECT * FROM rate_limits WHERE key = ?').bind(key).first();
  const t = now();
  if (!row || t - row.window_start > windowMs) {
    await db.prepare('INSERT OR REPLACE INTO rate_limits(key, count, window_start) VALUES(?, 1, ?)')
      .bind(key, t).run();
    return { ok: true, count: 1 };
  }
  if (row.count >= limit) return { ok: false, count: row.count, retryAfter: Math.ceil((row.window_start + windowMs - t) / 1000) };
  await db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
  return { ok: true, count: row.count + 1 };
}

export const clearRate = (db, key) =>
  db.prepare('DELETE FROM rate_limits WHERE key = ?').bind(key).run();

export { now };
