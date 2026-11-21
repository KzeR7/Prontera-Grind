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

export const insertUser = (db, { username, email, passHash, recoveryHash, gm = 0 }) =>
  db.prepare(`INSERT INTO users(username, email, pass_hash, recovery_hash, gm, created_at, fail_count, fail_at)
              VALUES(?, ?, ?, ?, ?, ?, 0, 0)`)
    .bind(username, email, passHash, recoveryHash, gm, now()).run();

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

// v416: the same acknowledgement with the denormalised columns left exactly as they are.
//
// `saves.level/cls/zeny/kills_total/playtime` are a projection of the blob for the leaderboard and the
// GM list; they only change when the player actually gains something. Most accepted syncs change none
// of them - a backgrounded tab flushes the same figures every minute - and rewriting identical values
// still writes the row and fires every trigger on it. /api/save compares the projection with the row it
// just read (see saveColumnsUnchanged) and takes this statement when nothing moved. Nothing is dropped:
// version, blob, saved_at, updated_at and last_seen are written exactly as before, so the save is
// acknowledged and the version advances under the same optimistic-concurrency guard. A conflict still
// changes zero rows, because the guard is unchanged.
export const updateSaveVersionStatement = (db, userId, version, blob, savedAt, expectedVersion = null) => {
  const versionGuard = expectedVersion == null ? '' : ' AND version = ?';
  const args = [version, blob, savedAt, now(), now(), userId];
  if (expectedVersion != null) args.push(expectedVersion);
  return db.prepare(`UPDATE saves SET version = ?, blob = ?, saved_at = ?, updated_at = ?, last_seen = ?
              WHERE user_id = ?${versionGuard}`).bind(...args);
};

export const touchSeen = (db, userId, at = now()) =>
  db.prepare('UPDATE saves SET last_seen = ?, updated_at = updated_at WHERE user_id = ?')
    .bind(at, userId).run();

// An offline claim is a server-timed, persistent entitlement. It remains pending until a versioned
// save containing its ID is accepted, so retrying login or losing a response can neither reroll nor
// duplicate the same away period.
//
// The claim schema grew in 0018 (owner), 0019 (snapshot) and 0020 (explicit pricing state). A
// deployment can briefly run new Functions before an additive migration reaches D1. Reads therefore
// retain old-row recovery, but issuance verifies 0020 before writing a NEW claim: a fallback query
// is compatibility, not proof that a newly unpriceable claim is safe to issue.
const missingColumn = (err, names) => {
  const text=String(err?.message || err);
  const m=/(?:no such column(?::|\s+named)|has no column named)\s*([a-z_]+)\b/i.exec(text);
  return !!m&&names.has(m[1].toLowerCase());
};
const OWNER_COLUMNS=new Set(['cls','run_gen']);
const PRICING_COLUMNS=new Set(['income_xp','income_zeny','income_job','income_kph','source_map','source_stage',
  'income_version','reward_version','sampled_at','interval_start_at','interval_end_at']);
const PRICING_STATE_COLUMNS=new Set(['pricing_state']);
const claimFields = 'id, away_ms, credited_ms, rate_kph, kills, remainder, issued_at, claimed_at';
const claimOwnerFields = claimFields + ', cls, run_gen';
const claimPricingFields = claimOwnerFields + ', income_xp, income_zeny, income_job, income_kph, source_map, source_stage,'
  + ' income_version, reward_version, sampled_at, interval_start_at, interval_end_at';
const claimStateFields = claimPricingFields + ', pricing_state';

async function selectClaimWithFallback(db, where, args) {
  try {
    return await db.prepare(`SELECT ${claimStateFields} FROM offline_reward_claims ${where}`).bind(...args).first();
  } catch (err) {
    // 0020 absent: this is a historical row, so preserve its deliberate legacy recovery shape.
    if (missingColumn(err, PRICING_STATE_COLUMNS)) {
      try {
        return await db.prepare(`SELECT ${claimPricingFields} FROM offline_reward_claims ${where}`).bind(...args).first();
      } catch (pricingErr) {
        if (missingColumn(pricingErr, OWNER_COLUMNS))
          return db.prepare(`SELECT ${claimFields} FROM offline_reward_claims ${where}`).bind(...args).first();
        if (!missingColumn(pricingErr, PRICING_COLUMNS)) throw pricingErr;
        try {
          return await db.prepare(`SELECT ${claimOwnerFields} FROM offline_reward_claims ${where}`).bind(...args).first();
        } catch (ownerErr) {
          if (!missingColumn(ownerErr, OWNER_COLUMNS)) throw ownerErr;
          return db.prepare(`SELECT ${claimFields} FROM offline_reward_claims ${where}`).bind(...args).first();
        }
      }
    }
    if (missingColumn(err, OWNER_COLUMNS))
      return db.prepare(`SELECT ${claimFields} FROM offline_reward_claims ${where}`).bind(...args).first();
    if (!missingColumn(err, PRICING_COLUMNS)) throw err;
    try {
      return await db.prepare(`SELECT ${claimOwnerFields} FROM offline_reward_claims ${where}`).bind(...args).first();
    } catch (ownerErr) {
      if (!missingColumn(ownerErr, OWNER_COLUMNS)) throw ownerErr;
      return db.prepare(`SELECT ${claimFields} FROM offline_reward_claims ${where}`).bind(...args).first();
    }
  }
}

export const pendingOfflineClaim = (db, userId) =>
  selectClaimWithFallback(db, 'WHERE user_id = ? AND claimed_at IS NULL ORDER BY id DESC LIMIT 1', [userId]);

export const offlineClaimById = (db, userId, id) =>
  selectClaimWithFallback(db, 'WHERE user_id = ? AND id = ?', [userId, id]);

// Only called after an away window qualifies and no pending row exists. This is intentionally not
// an unconditional per-sync read: it is the deployment fence that prevents a function-first rollout
// from creating another ambiguous pricing:null entitlement before migration 0020 is live.
export const offlineClaimPricingStateReady = async db => {
  try {
    await db.prepare('SELECT pricing_state FROM offline_reward_claims LIMIT 1').first();
    return true;
  } catch (err) {
    if (missingColumn(err, PRICING_STATE_COLUMNS)) return false;
    throw err;
  }
};

export const lastOfflineRemainder = async (db, userId) => {
  const row = await db.prepare(`SELECT remainder FROM offline_reward_claims
                                WHERE user_id = ? AND claimed_at IS NOT NULL ORDER BY id DESC LIMIT 1`)
    .bind(userId).first();
  return Number(row?.remainder) || 0;
};

// v424: 0020 makes the pricing meaning explicit.  `priced` freezes an eligible minute; `ineligible`
// is a durable zero-payout acknowledgement.  `legacy` exists only for backfilled/pre-0020 rows.
// The interval is stored independently of the sample so coverage can use the issued bounds even
// when no sample was eligible.
export const insertOfflineClaim = async (db, userId, claim, issuedAt, ctx = null) => {
  const owner=ctx?.owner || ctx || null, pricing=ctx?.pricing || null, interval=ctx?.interval || pricing || null;
  const ownerArgs=[owner && typeof owner.cls === 'string' ? owner.cls.slice(0,32) : null,
    owner && Number.isSafeInteger(owner.runGen) && owner.runGen>=1 ? Math.floor(owner.runGen) : null];
  const intervalStart=interval && Number.isSafeInteger(interval.intervalStartAt) ? interval.intervalStartAt : null;
  const intervalEnd=interval && Number.isSafeInteger(interval.intervalEndAt) ? interval.intervalEndAt : null;
  const pricingArgs=[
    pricing && Number.isFinite(pricing.xp) ? pricing.xp : null,
    pricing && Number.isFinite(pricing.zeny) ? pricing.zeny : null,
    pricing && Number.isFinite(pricing.job) ? pricing.job : null,
    pricing && Number.isFinite(pricing.kph) ? pricing.kph : null,
    pricing && Number.isSafeInteger(pricing.sourceMap) ? pricing.sourceMap : null,
    pricing && Number.isSafeInteger(pricing.sourceStage) ? pricing.sourceStage : null,
    pricing && Number.isSafeInteger(pricing.incomeVersion) ? pricing.incomeVersion : null,
    pricing && Number.isSafeInteger(pricing.rewardVersion) ? pricing.rewardVersion : null,
    pricing && Number.isSafeInteger(pricing.sampledAt) ? pricing.sampledAt : null,
    intervalStart, intervalEnd,
  ];
  const pricingState=pricing ? 'priced' : 'ineligible';
  const baseArgs=[userId, claim.awayMs, claim.creditedMs, claim.rateKph, claim.kills, claim.remainder, issuedAt];
  const writeLegacy=() => db.prepare(`INSERT OR IGNORE INTO offline_reward_claims
      (user_id, away_ms, credited_ms, rate_kph, kills, remainder, issued_at)
      VALUES(?, ?, ?, ?, ?, ?, ?)`).bind(...baseArgs).run();
  const writeOwner=() => db.prepare(`INSERT OR IGNORE INTO offline_reward_claims
      (user_id, away_ms, credited_ms, rate_kph, kills, remainder, issued_at, cls, run_gen)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...baseArgs,...ownerArgs).run();
  const writePricing=() => db.prepare(`INSERT OR IGNORE INTO offline_reward_claims
      (user_id, away_ms, credited_ms, rate_kph, kills, remainder, issued_at, cls, run_gen,
       income_xp, income_zeny, income_job, income_kph, source_map, source_stage,
       income_version, reward_version, sampled_at, interval_start_at, interval_end_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(...baseArgs,...ownerArgs,...pricingArgs).run();
  try {
    return await db.prepare(`INSERT OR IGNORE INTO offline_reward_claims
      (user_id, away_ms, credited_ms, rate_kph, kills, remainder, issued_at, cls, run_gen,
       income_xp, income_zeny, income_job, income_kph, source_map, source_stage,
       income_version, reward_version, sampled_at, interval_start_at, interval_end_at, pricing_state)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(...baseArgs,...ownerArgs,...pricingArgs,pricingState).run();
  } catch (err) {
    if (missingColumn(err, PRICING_STATE_COLUMNS)) return writePricing();
    if (missingColumn(err, OWNER_COLUMNS)) return writeLegacy();
    if (!missingColumn(err, PRICING_COLUMNS)) throw err;
    try { return await writeOwner(); }
    catch (ownerErr) {
      if (!missingColumn(ownerErr, OWNER_COLUMNS)) throw ownerErr;
      return writeLegacy();
    }
  }
};

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
                     (SELECT cls FROM saves s WHERE s.user_id = u.id) AS cls,
                     (SELECT s.ip_hash FROM sessions s WHERE s.user_id = u.id
                        AND s.ip_hash IS NOT NULL LIMIT 1) AS ip_fp
              FROM users u
              -- v403: most recent sign-in first; a player who has never signed in (NULL) sorts last
              -- instead of being treated as the largest value, then by account age so the tail is
              -- stable rather than arbitrary.
              ORDER BY (u.last_login_at IS NULL) ASC, u.last_login_at DESC, u.created_at DESC
              LIMIT ?`).bind(limit).all();

export const blobBytes = (db, userId) =>
  db.prepare('SELECT LENGTH(blob) AS n FROM saves WHERE user_id = ?').bind(userId).first();

// -------------------------------------------------------------- sessions ----
// A session must be created against the *same* password that was verified. D1 batches are
// transactional: a concurrent password reset/ban either happens first (this inserts nothing),
// or afterwards (its session revocation removes the new session). The guarded delete/note only
// run for an inserted token, keeping a failed stale login from affecting a newer session.
export async function startVerifiedSession(db, { tokenHash, userId, expectedHash, upgradeHash, expiresAt, ua, ipHash }) {
  const statements = [];
  if (upgradeHash) statements.push(db.prepare(`UPDATE users SET pass_hash = ? WHERE id = ? AND pass_hash = ? AND banned = 0`)
    .bind(upgradeHash, userId, expectedHash));
  const insertIndex = statements.length;
  statements.push(db.prepare(`INSERT INTO sessions(token_hash, user_id, created_at, expires_at, ua, ip_hash)
    SELECT ?, id, ?, ?, ?, ? FROM users WHERE id = ? AND pass_hash = ? AND banned = 0`)
    .bind(tokenHash, now(), expiresAt, ua, ipHash, userId, upgradeHash || expectedHash));
  statements.push(db.prepare(`DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?
    AND EXISTS (SELECT 1 FROM sessions WHERE user_id = ? AND token_hash = ?)`)
    .bind(userId, tokenHash, userId, tokenHash));
  statements.push(db.prepare(`UPDATE users SET last_login_at = ?, fail_count = 0, fail_at = 0
    WHERE id = ? AND EXISTS (SELECT 1 FROM sessions WHERE user_id = ? AND token_hash = ?)`)
    .bind(now(), userId, userId, tokenHash));
  const result = await db.batch(statements);
  return Number(result?.[insertIndex]?.meta?.changes ?? result?.[insertIndex]?.meta?.rows_written ?? 0) === 1;
}

// The password change and session invalidation must commit together.
export const setPasswordAndRevoke = (db, userId, passHash) => db.batch([
  db.prepare('UPDATE users SET pass_hash = ?, fail_count = 0, fail_at = 0 WHERE id = ?').bind(passHash, userId),
  db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
]);

export const insertSession = (db, tokenHash, userId, expiresAt, ua, ipHash) =>
  db.prepare(`INSERT INTO sessions(token_hash, user_id, created_at, expires_at, ua, ip_hash)
              VALUES(?, ?, ?, ?, ?, ?)`)
    .bind(tokenHash, userId, now(), expiresAt, ua, ipHash).run();

// v412 (CPU): `recovery_hash` rides along on this JOIN so GET /api/me can answer `recoverySet` without
// a SECOND users read. /api/me is the most-polled endpoint in the game (every open tab, every 45 s,
// ~80 requests per tab per hour), and it used to do `currentUser()` (this query) and then
// `userById()` - `SELECT *` on users - merely to test whether one column was NULL. Same result, one
// fewer D1 round trip on the busiest path. The value is a HASH, never the recovery code itself, and
// callers outside /api/me use `currentUser()`, which strips it.
export const sessionByToken = (db, hash) =>
  db.prepare(`SELECT s.*, u.username, u.gm, u.banned, u.recovery_hash FROM sessions s JOIN users u ON u.id = s.user_id
              WHERE s.token_hash = ?`).bind(hash).first();

export const touchSession = (db, hash, expiresAt) =>
  db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(expiresAt, hash).run();

export const deleteSession = (db, hash) =>
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();

export const deleteUserSessions = (db, userId) =>
  db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();

// One live session per account (owner, 2026-10-28): a sign-in on a second device ends the first
// device's session, so the two copies are never both playing and pushing saves at each other. The
// keeper is the token that was just created; everything else the account holds is deleted.
export const deleteOtherSessions = (db, userId, keepHash) =>
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').bind(userId, keepHash).run();

export const expireSessions = (db) =>
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()).run();

// ---------------------------------------------------------- network bans ----
// Migration 0014: one row per suspended network, keyed by the ipHash fingerprint. The two
// readers here FAIL OPEN (empty/false) when the table does not exist yet, with a warning:
// deploying the code before the migration must disable the feature, not brick every login.
// The writers do not swallow errors — a GM pressing Ban on an unmigrated server should get a
// loud failure, not a silent no-op.
// v412 (CPU): this runs on EVERY /api request, so it used to be one D1 round trip per request purely
// to answer "is this network banned" - and the answer is "no" for essentially every request in the
// game's life. The ban list is tiny (the console reads it with LIMIT 500) and changes only when a GM
// acts, so it is cached here instead.
//
// The cache is process-local and short-lived, and it is only ever a cache of NEGATIVE answers:
//   * a hit for a banned fingerprint is still reported as banned (never a bypass);
//   * the writers below call `forgetIpBans()`, so a fresh ban applies on the very next request in
//     the isolate that made it; other isolates are bounded by TTL (5 s), which is far shorter than a
//     human or a banned client can exploit and much cheaper than paying for the lookup forever;
//   * any D1 error clears the cache and fails open exactly as before.
// The whole table is loaded at most once per TTL, not once per request.
const IP_BAN_TTL_MS = 5000;
// The cache is keyed by the DATABASE, never shared across databases. Production binds exactly one D1
// database to the project, so in practice this is a single entry; the test suites build many separate
// in-memory databases in one process, and a cache shared between them would answer for the wrong
// table (a stale "nothing is banned" served to a database that had just been told otherwise). That is
// a correctness bug, not a test artefact, so the key is explicit.
const ipBanCaches = new WeakMap();   // db -> { at, set, failed }

const emptyCache = () => ({ at: 0, set: null, failed: false });
const cacheFor = db => ipBanCaches.get(db) || emptyCache();

// Drop the cached ban table for ONE database. Called by the statement builders below, so a GM ban or
// unban is reflected on the very next request in this isolate. There is deliberately no
// "forget everything" form: that would be a silently-wrong no-op behind a WeakMap, and a caller who
// wants a different database should say which one.
export function forgetIpBans(db) {
  if (db) ipBanCaches.delete(db);
}

async function ipBanSet(db) {
  const now = Date.now();
  const cached = cacheFor(db);
  if (cached.set && !cached.failed && now - cached.at < IP_BAN_TTL_MS) return cached.set;
  const rows = await db.prepare('SELECT ip_hash FROM ip_bans').all();
  const set = new Set((rows?.results || []).map(r => r.ip_hash));
  ipBanCaches.set(db, { at: now, set, failed: false });
  return set;
}

export async function isIpBanned(db, fp) {
  if (!fp) return false;
  try {
    return (await ipBanSet(db)).has(fp);
  } catch (e) {
    // A failed lookup must never answer "banned". This function fails OPEN by design (a broken ban
    // check must not take the whole API down), so the failure is recorded, the cache is dropped, and
    // the next caller re-reads the table. The `failed` flag also stops a warm-but-poisoned cache from
    // being served to a caller whose database is gone.
    ipBanCaches.set(db, { ...emptyCache(), failed: true });
    console.warn('ip_bans lookup failed (migration 0014 missing?):', e && e.message);
    return false;
  }
}

export async function listIpBans(db, limit = 200) {
  try {
    return (await db.prepare('SELECT ip_hash, note, created_by, created_at FROM ip_bans ORDER BY created_at DESC LIMIT ?')
      .bind(limit).all()).results;
  } catch (e) {
    console.warn('ip_bans list failed (migration 0014 missing?):', e && e.message);
    return [];
  }
}

// v412: the ban writers must drop the cached ban table, or a fresh ban would sit behind a stale
// "nothing is banned" for up to the TTL. The invalidation is NOT attached to `statement.run()`:
// callers batch these statements (`D.batch([...])`), and the D1 shim runs a batch through an internal
// synchronous path that never calls `.run()` - so patching `run` silently did nothing on the real ban
// path, which the api_sim suite caught. Instead the statements are built by a function that
// invalidates AT BUILD TIME: that is always after the GM has decided to act and always before the
// next request is admitted through this isolate.
export const ipBanStatement = (db, fp, note, by) => {
  forgetIpBans(db);
  return db.prepare('INSERT OR IGNORE INTO ip_bans(ip_hash, note, created_by, created_at) VALUES(?,?,?,?)')
    .bind(fp, note || null, by || null, now());
};

export const ipUnbanStatement = (db, fp) => {
  forgetIpBans(db);
  return db.prepare('DELETE FROM ip_bans WHERE ip_hash = ?').bind(fp);
};

// Every live session created from any of these networks is ended at ban time — that is what
// kicks the cheater's already-signed-in second account in the same request as the ban.
export const sessionsOnNetworksStatement = (db, fps) =>
  db.prepare(`DELETE FROM sessions WHERE ip_hash IN (${fps.map(() => '?').join(',')})`).bind(...fps);

// The networks an account has actually signed in from: the live session(s) plus the login /
// register / failed-login events, which record `ip <fingerprint>` (never a raw address).
// Returns [{ fp, sources }] newest sources first, capped so one player cannot balloon a response.
export async function userIpFingerprints(db, userId) {
  const out = new Map();
  const add = (fp, source) => {
    if (!/^[0-9a-f]{16}$/.test(String(fp || ''))) return;
    const e = out.get(fp) || { fp, sources: [] };
    if (!e.sources.includes(source)) e.sources.push(source);
    out.set(fp, e);
  };
  try {
    const sess = await db.prepare('SELECT DISTINCT ip_hash FROM sessions WHERE user_id = ? AND ip_hash IS NOT NULL')
      .bind(userId).all();
    for (const r of sess.results) add(r.ip_hash, 'current session');
    const ev = await db.prepare(`SELECT detail, MAX(id) AS mid FROM events
      WHERE user_id = ? AND detail LIKE 'ip %' GROUP BY detail ORDER BY mid DESC LIMIT 10`)
      .bind(userId).all();
    for (const r of ev.results) add(String(r.detail).slice(3), 'sign-in log');
  } catch (e) {
    console.warn('network fingerprint lookup failed (migration 0014 missing?):', e && e.message);
  }
  return [...out.values()].slice(0, 8);
}

// Which OTHER accounts share these networks — the "banned him twice, he came back" detector.
// Sessions catch the accounts signed in right now; the event rows catch ones seen before.
export async function accountsOnNetworks(db, fps, excludeUserId) {
  const list = (fps || []).slice(0, 8);
  if (!list.length) return [];
  const out = new Map();
  try {
    const marks = list.map(() => '?').join(',');
    const sess = await db.prepare(`SELECT DISTINCT u.id, u.username AS u FROM sessions s
      JOIN users u ON u.id = s.user_id WHERE s.ip_hash IN (${marks}) AND s.user_id <> ?`)
      .bind(...list, excludeUserId).all();
    for (const r of sess.results) out.set(Number(r.id), { id: Number(r.id), u: r.u });
    const details = list.map(f => 'ip ' + f);
    const ev = await db.prepare(`SELECT DISTINCT u.id, u.username AS u FROM events e
      JOIN users u ON u.id = e.user_id WHERE e.detail IN (${marks}) AND e.user_id <> ?`)
      .bind(...details, excludeUserId).all();
    for (const r of ev.results) out.set(Number(r.id), { id: Number(r.id), u: r.u });
  } catch (e) {
    console.warn('network match lookup failed (migration 0014 missing?):', e && e.message);
  }
  return [...out.values()].slice(0, 8);
}

// ---------------------------------------------------------------- grants ----
export const insertGrant = (db, userId, kind, payload, note, createdBy) =>
  db.prepare(`INSERT INTO grants(user_id, kind, payload, note, created_by, created_at)
              VALUES(?, ?, ?, ?, ?, ?)`)
    .bind(userId, kind, JSON.stringify(payload ?? {}), note ?? null, createdBy ?? null, now()).run();

// v401 (owner: "i want the gm mail expiry to be 5 days. any gift not claim will be directly
// vanish."). A grant is claimable for GRANT_TTL_MS after it was created; after that it is treated
// as gone. Expiry is enforced in the QUERY, not just in the client list, so a save that was loaded
// before the deadline cannot still redeem an expired gift by posting its id: claimGrants only
// updates rows that are still pending AND still inside the window.
const GRANT_TTL_DAYS = 5;
const GRANT_TTL_MS = GRANT_TTL_DAYS * 24 * 60 * 60 * 1000;
export { GRANT_TTL_DAYS };
// Server-settled Rift Raid rewards are the narrow exception: their D1 ledger is durable and they
// remain claimable until the cloud save accepts them. Every ordinary gift keeps the five-day rule.
const grantNeverExpires = grant => grant?.created_by === 'Rift Raid';
export const grantExpiresAt = (createdAt, createdBy = null) => createdBy === 'Rift Raid' ? null : Number(createdAt) + GRANT_TTL_MS;
export const grantExpired = (grant, at = now()) => !grant || (!grantNeverExpires(grant) && Number(grant.created_at) + GRANT_TTL_MS <= at);

export const pendingGrants = (db, userId) =>
  db.prepare("SELECT * FROM grants WHERE user_id = ? AND claimed_at IS NULL AND (created_by='Rift Raid' OR created_at > ?) ORDER BY id")
    .bind(userId, now() - GRANT_TTL_MS).all();

export const claimGrants = (db, userId, ids) => {
  if (!ids.length) return null;
  const marks = ids.map(() => '?').join(',');
  // The age test is repeated here on purpose: claiming is the moment value changes hands.
  return db.prepare(`UPDATE grants SET claimed_at = ? WHERE user_id = ? AND claimed_at IS NULL
    AND (created_by='Rift Raid' OR created_at > ?) AND id IN (${marks})`)
    .bind(now(), userId, now() - GRANT_TTL_MS, ...ids).run();
};

// v401: everything the player can still claim, in the shape the in-game mailbox renders. One row
// per grant, oldest first, with the deadline the client shows and the sender's note.
export const mailBox = (db, userId) =>
  db.prepare(`SELECT id, kind, payload, note, created_by, created_at FROM grants
              WHERE user_id = ? AND claimed_at IS NULL AND COALESCE(created_by,'')<>'Rift Raid' AND created_at > ? ORDER BY id`)
    .bind(userId, now() - GRANT_TTL_MS).all();

// Sweep expired, never-claimed grants. Called opportunistically; nothing depends on it running,
// because every read and every claim already filters by age.
export const purgeExpiredGrants = (db, userId) =>
  db.prepare("DELETE FROM grants WHERE user_id = ? AND claimed_at IS NULL AND COALESCE(created_by,'')<>'Rift Raid' AND created_at <= ?")
    .bind(userId, now() - GRANT_TTL_MS).run();

export const grantsFor = (db, userId) =>
  db.prepare('SELECT * FROM grants WHERE user_id = ? ORDER BY id DESC LIMIT 50').bind(userId).all();

// -------------------------------------------------------------- messages ----
export const insertMessage = (db, body, kind, targetUser, createdBy) =>
  db.prepare('INSERT INTO messages(body, kind, target_user, created_by, created_at) VALUES(?, ?, ?, ?, ?)')
    .bind(body, kind, targetUser ?? null, createdBy ?? null, now()).run();

export const insertMessageWithId = async (db, body, kind, targetUser, createdBy) => {
  const res = await db.prepare('INSERT INTO messages(body, kind, target_user, created_by, created_at) VALUES(?, ?, ?, ?, ?)')
    .bind(body, kind, targetUser ?? null, createdBy ?? null, now()).run();
  const lid = res?.meta?.last_row_id ?? res?.meta?.lastInsertRowid;
  if (lid) return Number(lid);
  const row = await db.prepare('SELECT id FROM messages ORDER BY id DESC LIMIT 1').first();
  return row ? Number(row.id) : null;
};

export const insertMassGrants = async (db, batchId, actor, kind, payload, note) => {
  const at = now();
  const payloadJson = JSON.stringify(payload ?? {});
  await db.prepare(
    `INSERT OR IGNORE INTO grants(user_id, kind, payload, note, created_by, created_at, batch_id)
     SELECT u.id, ?, ?, ?, ?, ?, ?
     FROM users u
     WHERE COALESCE(u.banned, 0) = 0`
  ).bind(kind, payloadJson, note ?? null, actor ?? 'GM', at, batchId).run();
  const countRow = await db.prepare('SELECT COUNT(*) AS n FROM grants WHERE batch_id = ?').bind(batchId).first();
  return Number(countRow?.n) || 0;
};

export const unreadMessages = (db, userId, limit = 20) =>
  db.prepare(`SELECT m.id, m.body, m.kind, m.created_at, m.created_by FROM messages m
              WHERE (m.target_user IS NULL OR m.target_user = ?)
                AND NOT EXISTS (SELECT 1 FROM message_reads r WHERE r.message_id = m.id AND r.user_id = ?)
              ORDER BY m.id DESC LIMIT ?`).bind(userId, userId, limit).all();

export const inboxMessages = (db, userId, limit = 30) =>
  db.prepare(`SELECT m.id, m.body, m.kind, m.created_at, m.created_by,
                     (SELECT r.read_at FROM message_reads r WHERE r.message_id = m.id AND r.user_id = ?) AS read_at
              FROM messages m
              WHERE (m.target_user IS NULL OR m.target_user = ?)
              ORDER BY m.id DESC LIMIT ?`).bind(userId, userId, limit).all();

export const markRead = (db, userId, ids) => {
  if (!ids.length) return null;
  const stmt = db.prepare('INSERT OR IGNORE INTO message_reads(user_id, message_id, read_at) VALUES(?, ?, ?)');
  for (const id of ids) stmt.bind(userId, id, now()).run();
  return null;
};

export const allMessages = (db, limit = 50) =>
  db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT ?').bind(limit).all();

// --------------------------------------------------- announcement gift campaigns ----
// 0017: a "to everyone" announcement's gift is also a campaign, so an account created after the
// send can still claim it. The text was never the problem - one `messages` row with target_user
// NULL reaches anyone - but the grant fan-out only ever covered accounts that already existed.
// A campaign stays open until a GM closes it; closing stops future grants and takes nothing back.
// Fails soft everywhere: a database without 0017 must still register accounts and send mail.
export async function openAnnouncementGiftCampaign(db, { messageId, kind, payload, label, note, actor }) {
  try {
    await db.prepare(`INSERT OR IGNORE INTO announcement_gifts(message_id, kind, payload, label, note, created_by, created_at)
      VALUES(?,?,?,?,?,?,?)`)
      .bind(Number(messageId), String(kind), JSON.stringify(payload ?? {}), label ?? null, note ?? null, actor ?? null, now()).run();
    return { ok: true };
  } catch (e) {
    console.warn('announcement gift campaign not recorded (migration 0017 missing?):', e && e.message);
    return { ok: false };
  }
}

// The campaigns still handing out to new accounts, newest first.
export async function openAnnouncementGifts(db) {
  try {
    return await db.prepare(`SELECT g.*, m.body AS message_body FROM announcement_gifts g
      LEFT JOIN messages m ON m.id = g.message_id
      WHERE g.closed_at IS NULL ORDER BY g.created_at DESC`).all();
  } catch (e) {
    console.warn('announcement gift campaigns unreadable (migration 0017 missing?):', e && e.message);
    return { results: [] };
  }
}

// Every campaign with its state, for the console's list.
export async function listAnnouncementGifts(db, limit = 40) {
  try {
    return await db.prepare(`SELECT g.*, m.body AS message_body FROM announcement_gifts g
      LEFT JOIN messages m ON m.id = g.message_id
      ORDER BY g.created_at DESC LIMIT ?`).bind(Math.max(1, Math.min(200, Number(limit) || 40))).all();
  } catch (e) {
    console.warn('announcement gift campaigns unreadable (migration 0017 missing?):', e && e.message);
    return { results: [] };
  }
}

// A new account claims what is still open. Idempotent: the grants(batch_id,user_id) unique index
// makes a repeat call a no-op, and the batch id is the same one the original fan-out used, so an
// account can never hold two copies of one announcement's gift.
export async function claimAnnouncementGiftsFor(db, userId) {
  const open = await openAnnouncementGifts(db);
  let granted = 0;
  for (const g of open.results || []) {
    try {
      await db.prepare(`INSERT OR IGNORE INTO grants(user_id, kind, payload, note, created_by, created_at, batch_id)
        VALUES(?,?,?,?,?,?,?)`)
        .bind(Number(userId), String(g.kind), String(g.payload || '{}'), g.note ?? null,
          g.created_by ?? 'GM', now(), 'ann:' + Number(g.message_id)).run();
      granted++;
    } catch (e) {
      console.warn('announcement gift not delivered to a new account:', e && e.message);
      break;
    }
  }
  return granted;
}

export async function closeAnnouncementGift(db, messageId, actor) {
  try {
    const res = await db.prepare(`UPDATE announcement_gifts SET closed_at = ?, closed_by = ?
      WHERE message_id = ? AND closed_at IS NULL`).bind(now(), actor ?? null, Number(messageId)).run();
    return { changed: Number(res?.meta?.changes ?? 0) || 0 };
  } catch (e) {
    console.warn('announcement gift campaign not closable (migration 0017 missing?):', e && e.message);
    return { changed: 0, missing: true };
  }
}

export async function reopenAnnouncementGift(db, messageId, actor) {
  try {
    const res = await db.prepare(`UPDATE announcement_gifts SET closed_at = NULL, closed_by = NULL
      WHERE message_id = ? AND closed_at IS NOT NULL`).bind(Number(messageId)).run();
    return { changed: Number(res?.meta?.changes ?? 0) || 0, actor: actor ?? null };
  } catch (e) {
    console.warn('announcement gift campaign not reopenable (migration 0017 missing?):', e && e.message);
    return { changed: 0, missing: true };
  }
}

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
  const t = now();
  // A single upsert prevents concurrent requests from passing the same counter value.
  const row = await db.prepare(`INSERT INTO rate_limits(key, count, window_start) VALUES(?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN ? - window_start >= ? THEN 1 ELSE count + 1 END,
      window_start = CASE WHEN ? - window_start >= ? THEN ? ELSE window_start END
    RETURNING count, window_start`).bind(key, t, t, windowMs, t, windowMs, t).first();
  const ok = row.count <= limit;
  return { ok, count: row.count, ...(ok ? {} : { retryAfter: Math.max(1, Math.ceil((row.window_start + windowMs - t) / 1000)) }) };
}

export const clearRate = (db, key) =>
  db.prepare('DELETE FROM rate_limits WHERE key = ?').bind(key).run();

export { now };

// ------------------------------------------------------------- save audit ----
// Server-side impossible-save flags (0015_save_audit.sql). One row per account per rule: worst
// value, last time seen, and a coarse observation count. Written only by the save audit hook —
// flags are review-only and never touch the save, the score or a ban.
// Coarse bucket (default 5 min): repeats within the bucket bump last_seen/value but count as
// one observation, so a syncing cheater cannot flood the table (same idea as damage samples).
export const saveAlertStatement = (db,{userId,kind,at,value,threshold,detail,bucketMs=300000}) =>
  db.prepare(`INSERT INTO save_alerts(user_id, kind, first_seen, last_seen, value, threshold, detail, observations)
    VALUES(?,?,?,?,?,?,?,1)
    ON CONFLICT(user_id, kind) DO UPDATE SET
      last_seen=excluded.last_seen, value=MAX(save_alerts.value, excluded.value),
      threshold=excluded.threshold, detail=excluded.detail,
      cleared_at=NULL, cleared_by=NULL,
      observations=save_alerts.observations + (CASE WHEN excluded.last_seen - save_alerts.last_seen >= ? THEN 1 ELSE 0 END)`)
    .bind(Number(userId),String(kind),Number(at),Number(at),Number(value)||0,Number(threshold)||0,String(detail==null?'':detail).slice(0,400),Number(bucketMs)||300000);

export async function saveAlertWithEvidence(db, { userId, kind, at, value, threshold, detail, ruleVersion = null, evidenceJson = null, bucketMs = 300000 }) {
  try {
    return await db.prepare(`INSERT INTO save_alerts(user_id, kind, first_seen, last_seen, value, threshold, detail, observations, rule_version, evidence_json)
      VALUES(?,?,?,?,?,?,?,1,?,?)
      ON CONFLICT(user_id, kind) DO UPDATE SET
        last_seen=excluded.last_seen, value=excluded.value,
        threshold=excluded.threshold, detail=excluded.detail,
        rule_version=excluded.rule_version, evidence_json=excluded.evidence_json,
        cleared_at=CASE WHEN save_alerts.cleared_at IS NOT NULL AND excluded.last_seen <= save_alerts.cleared_at THEN save_alerts.cleared_at ELSE NULL END,
        cleared_by=CASE WHEN save_alerts.cleared_at IS NOT NULL AND excluded.last_seen <= save_alerts.cleared_at THEN save_alerts.cleared_by ELSE NULL END,
        observations=save_alerts.observations + (CASE WHEN excluded.last_seen - save_alerts.last_seen >= ? THEN 1 ELSE 0 END)`)
      .bind(
        Number(userId), String(kind), Number(at), Number(at),
        Number(value) || 0, Number(threshold) || 0,
        String(detail == null ? '' : detail).slice(0, 400),
        ruleVersion ? String(ruleVersion) : null,
        evidenceJson ? String(evidenceJson).slice(0, 2000) : null,
        Number(bucketMs) || 300000,
      ).run();
  } catch (e) {
    if (String(e && e.message).includes('no such column')) {
      return await saveAlertStatement(db, { userId, kind, at, value, threshold, detail, bucketMs }).run();
    }
    throw e;
  }
}

export async function getAuditWindow(db, userId) {
  try {
    return await db.prepare(`SELECT window_start, last_at, acc_json FROM save_audit_windows WHERE user_id = ?`).bind(Number(userId)).first();
  } catch {
    return null;
  }
}

export async function upsertAuditWindow(db, userId, windowStart, lastAt, accJson) {
  try {
    return await db.prepare(`INSERT INTO save_audit_windows(user_id, window_start, last_at, acc_json)
      VALUES(?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET window_start=excluded.window_start, last_at=excluded.last_at,
        acc_json=CASE WHEN save_audit_windows.window_start=excluded.window_start
          THEN json_set(excluded.acc_json, '$.reviewed',
            json(COALESCE(json_extract(save_audit_windows.acc_json, '$.reviewed'), '{}')))
          ELSE excluded.acc_json END
      RETURNING acc_json`)
      .bind(Number(userId), Number(windowStart), Number(lastAt), String(accJson)).first();
  } catch {
    // Fail open if migration 0021 is not applied yet.
  }
}

// Which rules already fired for this account (to notify the owner only the first time).
// Cleared flags do not count: if the same rule fires again after a GM cleared it, the owner is
// poked once more - the verdict covered the evidence that was reviewed, not the future.
export const existingSaveAlertKinds = (db, userId) =>
  db.prepare(`SELECT kind FROM save_alerts WHERE user_id = ? AND cleared_at IS NULL`).bind(Number(userId)).all();

// This account's flags, newest first (player panel).
// Fails OPEN: if migration 0015 has not been applied, the player detail still loads with an
// empty flag list — a missing optional table must never take the console down.
export async function saveAlertsFor(db, userId) {
  try {
    // 0016: cleared flags stay in the list (as history) but sink below the open ones.
    return await db.prepare(`SELECT * FROM save_alerts WHERE user_id = ?
      ORDER BY CASE WHEN cleared_at IS NULL THEN 0 ELSE 1 END, last_seen DESC`).bind(Number(userId)).all();
  } catch (e) {
    console.warn('save_alerts read failed (migration 0015 missing?):', e && e.message);
    return { results: [] };
  }
}

// Which accounts carry at least one save-audit flag, for the player-list marker. Fails OPEN to
// "nobody flagged" for the same reason — the list itself must always load.
export async function alertedUserIds(db) {
  try {
    const rows = (await db.prepare(`SELECT DISTINCT user_id FROM save_alerts WHERE cleared_at IS NULL`).all()).results;
    return new Set(rows.map(r => Number(r.user_id)));
  } catch (e) {
    console.warn('save_alerts list failed (migration 0015 missing?):', e && e.message);
    return new Set();
  }
}

// Every account's flags, newest first (the console's "Suspicious saves" card).
export const recentSaveAlerts = (db, limit=100) =>
  db.prepare(`SELECT a.*, u.username FROM save_alerts a JOIN users u ON u.id=a.user_id
    WHERE a.cleared_at IS NULL
    ORDER BY a.last_seen DESC LIMIT ?`).bind(Math.max(1,Math.min(500,Number(limit)||100))).all();

// 0016: a GM's verdict on one flag. CLEARING keeps the row (the evidence stays) and stamps who
// looked and when; it stops the ⚠ marker, the audit card and the player warning. REOPENING undoes
// that for a cleared flag that turns out to matter. Both are scoped to one account + one rule, and
// both return how many rows they touched so the caller can tell "no such flag" from "already so".
// Fails soft when migration 0016 has not been applied yet: no verdict is better than a broken card.
export async function clearSaveAlert(db, userId, kind, actor) {
  try {
    const at = now();
    const clear = db.prepare(`UPDATE save_alerts SET cleared_at = ?, cleared_by = ?
      WHERE user_id = ? AND kind = ? AND cleared_at IS NULL`)
      .bind(at, actor ?? null, Number(userId), String(kind));
    const counter = kind === 'kill-rate' ? 'kills' : kind === 'zeny-rate' ? 'zeny'
      : kind.startsWith('rate:') ? 'resources.' + kind.slice(5) : null;
    let res;
    if (counter) {
      // Snapshot the reviewed prefix atomically with the verdict. A later ordinary gain must
      // not turn that same prefix into new evidence. JSON lives in the existing bounded window.
      try {
        const mark = db.prepare(`UPDATE save_audit_windows SET acc_json = json_set(acc_json, ?,
          json_object('at', ?, 'amount', COALESCE(json_extract(acc_json, ?), 0),
            'raw', COALESCE(json_extract(acc_json, ?), json_extract(acc_json, ?), 0),
            'credited', COALESCE(json_extract(acc_json, ?), 0)))
          WHERE user_id = ? AND EXISTS (SELECT 1 FROM save_alerts
            WHERE user_id = ? AND kind = ? AND cleared_at IS NULL)`)
          .bind('$.reviewed.' + JSON.stringify(kind), at, '$.' + counter,
            '$.raw.' + JSON.stringify(kind), '$.' + counter, '$.credits.' + JSON.stringify(kind),
            Number(userId), Number(userId), String(kind));
        [, res] = await db.batch([mark, clear]);
      } catch (e) {
        if (!/no such table: save_audit_windows/i.test(String(e?.message))) throw e;
        res = await clear.run(); // Pre-0021 installations still support legacy flag review.
      }
    } else res = await clear.run();
    return { changed: Number(res?.meta?.changes ?? res?.meta?.changes_count ?? 0) || 0 };
  } catch (e) {
    console.warn('save_alerts clear failed (migration 0016 missing?):', e && e.message);
    return { changed: 0, missing: true };
  }
}

export async function reopenSaveAlert(db, userId, kind, actor) {
  try {
    const res = await db.prepare(`UPDATE save_alerts SET cleared_at = NULL, cleared_by = NULL
      WHERE user_id = ? AND kind = ? AND cleared_at IS NOT NULL`)
      .bind(Number(userId), String(kind)).run();
    return { changed: Number(res?.meta?.changes ?? res?.meta?.changes_count ?? 0) || 0, actor: actor ?? null };
  } catch (e) {
    console.warn('save_alerts reopen failed (migration 0016 missing?):', e && e.message);
    return { changed: 0, missing: true };
  }
}

// Grants claimed inside a save window, credited back so GM gifts never flag their receiver.
export const grantsClaimedBetween = (db, userId, fromMs, toMs) =>
  db.prepare(`SELECT kind, payload FROM grants
    WHERE user_id = ? AND claimed_at >= ? AND claimed_at <= ?
    ORDER BY claimed_at ASC`).bind(Number(userId),Number(fromMs),Number(toMs)).all();

// Every owner account — the save audit pokes these (targeted message) when a rule fires fresh.
export const ownerIds = (db) =>
  db.prepare(`SELECT id FROM users WHERE gm >= 2 ORDER BY id`).all();

// ---------------------------------------------------------- damage monitor ----
// Client-reported diagnostics only. Six-hour buckets and fixed slots cap writes
// and storage; neither a sample nor a flag can change scores, grants or bans.
export const damageSampleStatement = (db,{userId,slot,bucket,at,map,stage,totalDamage,echoBest}) =>
  db.prepare(`INSERT INTO damage_samples(user_id,slot,bucket,sampled_at,map,stage,reported_total_damage,reported_echo_best)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,slot) DO UPDATE SET bucket=excluded.bucket,
    sampled_at=excluded.sampled_at,map=excluded.map,stage=excluded.stage,
    reported_total_damage=excluded.reported_total_damage,reported_echo_best=excluded.reported_echo_best
    WHERE excluded.bucket>damage_samples.bucket`)
    .bind(userId,slot,bucket,at,map,stage,totalDamage,echoBest);
export const damageAlertStatement = (db,{userId,at,kind,value,bucketMs}) =>
  db.prepare(`INSERT INTO damage_alerts(user_id,kind,first_seen,last_seen,max_reported_dps,observations)
    VALUES(?,?,?,?,?,1) ON CONFLICT(user_id,kind) DO UPDATE SET
    last_seen=excluded.last_seen,max_reported_dps=MAX(damage_alerts.max_reported_dps,excluded.max_reported_dps),
    observations=damage_alerts.observations+1 WHERE excluded.last_seen-damage_alerts.last_seen>=?`)
    .bind(userId,kind,at,at,value,bucketMs);
export const recentDamageAlerts = (db,limit=100) => db.prepare(`SELECT a.user_id,u.username,a.kind,a.first_seen,a.last_seen,
    a.max_reported_dps,a.observations FROM damage_alerts a JOIN users u ON u.id=a.user_id
    ORDER BY a.last_seen DESC,a.user_id ASC LIMIT ?`).bind(limit).all();
export const damageSamplesFor = (db,userId) => db.prepare(`SELECT sampled_at,map,stage,reported_total_damage,reported_echo_best
    FROM damage_samples WHERE user_id=? ORDER BY sampled_at DESC LIMIT 28`).bind(userId).all();

// ----------------------------------------------------------- player raid ----
// D1 owns the entry reservation and the settlement ledger. Live HP/phase/action receipts are in
// the Social Durable Object; this section never stores or trusts client combat values.
export const raidTablesInstalled = async db => {
  const row = await db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='raid_runs'").first();
  return !!row;
};
export const raidAccount = (db, userId) => db.prepare('SELECT * FROM raid_accounts WHERE user_id=?').bind(userId).first();
export const raidCardsForUser = (db, userId) => db.prepare(`SELECT card_key,copies,equipped,updated_at
  FROM raid_cards WHERE user_id=? ORDER BY card_key`).bind(userId).all();
export const raidCardForUser = (db, userId, cardKey) => db.prepare(`SELECT card_key,copies,equipped
  FROM raid_cards WHERE user_id=? AND card_key=?`).bind(userId, cardKey).first();
// Two statements are intentionally batched: clear every card, then set the one requested card. A
// missing/duplicate equip therefore cannot create a second equipped card.
export const raidSetEquippedCardStatements = (db, userId, cardKey, at = now()) => {
  const statements = [db.prepare('UPDATE raid_cards SET equipped=0,updated_at=? WHERE user_id=?').bind(at, userId)];
  if (cardKey) {
    statements.push(db.prepare(`UPDATE raid_cards SET equipped=1,updated_at=?
      WHERE user_id=? AND card_key=? AND copies>0`).bind(at, userId, cardKey));
  }
  return statements;
};
export const raidCardDropInsertStatement = (db, { runId, userId, kind, cardKey, createdAt }) =>
  db.prepare('INSERT OR IGNORE INTO raid_card_drops(run_id,user_id,kind,card_key,created_at) VALUES(?,?,?,?,?)')
    .bind(runId, userId, kind, cardKey, createdAt);
export const raidCardDropsForUser = (db, runId, userId) => db.prepare(`SELECT kind,card_key,created_at
  FROM raid_card_drops WHERE run_id=? AND user_id=? ORDER BY kind`).bind(runId, userId).all();
export const raidAccountEnsureStatement = (db, userId, at = now()) =>
  db.prepare('INSERT OR IGNORE INTO raid_accounts(user_id,updated_at) VALUES(?,?)').bind(userId, at);
export const raidDailyEntries = (db, userId, dayKey) =>
  db.prepare('SELECT COUNT(*) AS n FROM raid_entries WHERE user_id=? AND day_key=?').bind(userId, dayKey).first();
export const raidDailyChests = (db, userId, dayKey) => db.prepare(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN kind='pity' THEN 1 ELSE 0 END) AS pity,
    SUM(CASE WHEN kind='fractured' THEN 1 ELSE 0 END) AS fractured
  FROM raid_chests WHERE user_id=? AND day_key=?`).bind(userId, dayKey).first();
export const raidActiveForUser = (db, userId) => db.prepare(`SELECT r.*,m.profile_json FROM raid_runs r
  JOIN raid_run_members m ON m.run_id=r.id
  WHERE m.user_id=? AND r.state='active' ORDER BY r.started_at DESC LIMIT 1`).bind(userId).first();
// A short-lived result window lets a member who disconnected before the clear see the settlement
// they already earned. It is a read, not a second reward path; settleRun remains the only payer.
export const raidRecentSettledForUser = (db, userId, since) => db.prepare(`SELECT r.* FROM raid_runs r
  JOIN raid_run_members m ON m.run_id=r.id
  WHERE m.user_id=? AND r.state IN ('cleared','failed') AND r.settled_at>=?
  ORDER BY r.settled_at DESC LIMIT 1`).bind(userId, since).first();
// Retire an ACTIVE run whose deadline has passed. `cancelled` is the state the schema already
// allows for exactly this; it is not a settlement, so nothing is paid and no chest is written.
//
// The guard `state='active' AND deadline_at<=?` makes this safe to run on every lobby read: it is a
// no-op for a live run, and two concurrent expiries cannot both win. Expiring the row is what
// releases the one-active-run rule, which `raidActiveForUser` and the raid_entry_active_limit
// trigger both key off `state='active'` — without this, an abandoned solo run blocks that account
// from ever raiding again.
export const raidExpireStaleStatement = (db, { runId, now }) =>
  db.prepare(`UPDATE raid_runs SET state='cancelled', settled_at=?, result_json=?
    WHERE id=? AND state='active' AND deadline_at<=?`)
    .bind(now, JSON.stringify({ outcome: 'expired', reason: 'deadline-passed' }), runId, now);
export const raidRun = (db, runId) => db.prepare('SELECT * FROM raid_runs WHERE id=?').bind(runId).first();
export const raidRunMember = (db, runId, userId) =>
  db.prepare('SELECT * FROM raid_run_members WHERE run_id=? AND user_id=?').bind(runId, userId).first();
export const raidRunMembers = (db, runId) =>
  db.prepare('SELECT * FROM raid_run_members WHERE run_id=? ORDER BY user_id').bind(runId).all();
export const raidRunInsertStatement = (db, { id, leaderId, partySize, totalHp, seed, startedAt, deadlineAt, checkpoint }) =>
  db.prepare(`INSERT INTO raid_runs(id,leader_id,party_size,total_hp,seed,started_at,deadline_at,state,checkpoint_json,checkpoint_at)
    VALUES(?,?,?,?,?,?,?,'active',?,?)`).bind(id, leaderId, partySize, totalHp, seed, startedAt, deadlineAt,
      JSON.stringify(checkpoint || {}), startedAt);
export const raidRunMemberInsertStatement = (db, { runId, userId, name, profile }) =>
  db.prepare(`INSERT INTO raid_run_members(run_id,user_id,display_name,profile_json)
    VALUES(?,?,?,?)`).bind(runId, userId, String(name || 'Adventurer').slice(0, 32), JSON.stringify(profile || {}));
export const raidEntryInsertStatement = (db, { userId, dayKey, runId, enteredAt }) =>
  db.prepare('INSERT INTO raid_entries(user_id,day_key,run_id,entered_at) VALUES(?,?,?,?)')
    .bind(userId, dayKey, runId, enteredAt);
// Explicit child deletes keep the rollback correct even if a SQLite engine has foreign_keys off.
export const raidRunDeleteStatements = (db, runId) => [
  db.prepare('DELETE FROM raid_entries WHERE run_id=?').bind(runId),
  db.prepare('DELETE FROM raid_run_members WHERE run_id=?').bind(runId),
  db.prepare('DELETE FROM raid_runs WHERE id=?').bind(runId),
];
export const raidRunCheckpointStatement = (db, { runId, checkpointAt, checkpoint }) =>
  db.prepare(`UPDATE raid_runs SET checkpoint_json=?,checkpoint_at=?
    WHERE id=? AND state='active' AND checkpoint_at<=?`)
    .bind(JSON.stringify(checkpoint || {}), checkpointAt, runId, checkpointAt);
export const raidSettlement = (db, runId) =>
  db.prepare('SELECT * FROM raid_settlements WHERE run_id=?').bind(runId).first();
export const raidSettlementInsertStatement = (db, { runId, outcome, settledAt, result }) =>
  db.prepare('INSERT OR IGNORE INTO raid_settlements(run_id,outcome,settled_at,result_json) VALUES(?,?,?,?)')
    .bind(runId, outcome, settledAt, JSON.stringify(result || {}));
export const raidRunSettleStatement = (db, { runId, outcome, settledAt, result }) =>
  db.prepare(`UPDATE raid_runs SET state=?,settled_at=?,result_json=? WHERE id=? AND state='active'`)
    .bind(outcome, settledAt, JSON.stringify(result || {}), runId);
export const raidChestInsertStatement = (db, { runId, userId, dayKey, kind, payload, createdAt }) =>
  db.prepare('INSERT OR IGNORE INTO raid_chests(run_id,user_id,day_key,kind,payload,created_at) VALUES(?,?,?,?,?,?)')
    .bind(runId, userId, dayKey, kind, JSON.stringify(payload || {}), createdAt);
export const raidRewardLedgerInsertStatement = (db, { runId, userId, kind, payload, createdAt }) =>
  db.prepare('INSERT OR IGNORE INTO raid_reward_ledger(run_id,user_id,kind,payload,created_at) VALUES(?,?,?,?,?)')
    .bind(runId, userId, kind, JSON.stringify(payload || {}), createdAt);
export const raidRewardsForUser = (db, runId, userId) =>
  db.prepare('SELECT kind,payload,created_at FROM raid_reward_ledger WHERE run_id=? AND user_id=? ORDER BY kind')
    .bind(runId, userId).all();
export const raidGrantsForRun = (db, runId) =>
  db.prepare("SELECT id,user_id,kind FROM grants WHERE ref LIKE ? ORDER BY id").bind('raid:' + runId + ':%').all();
export const raidRunContributionStatement = (db, { runId, userId, damage, support, actions, dodges, downs, meaningful }) =>
  db.prepare(`UPDATE raid_run_members SET damage=?,support=?,actions=?,dodges=?,downs=?,meaningful=?
    WHERE run_id=? AND user_id=?`).bind(
    Math.max(0, Math.floor(Number(damage) || 0)), Math.max(0, Math.floor(Number(support) || 0)),
    Math.max(0, Math.floor(Number(actions) || 0)), Math.max(0, Math.floor(Number(dodges) || 0)),
    Math.max(0, Math.floor(Number(downs) || 0)), meaningful ? 1 : 0, runId, userId);
