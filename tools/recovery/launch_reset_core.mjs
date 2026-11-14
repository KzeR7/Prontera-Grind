// Preflight gameplay reset. Account credentials and shop ownership are NOT deleted.
// This module has no network driver and cannot select a Cloudflare database.
// The CLI supplies a local SQLite file or a verified, sealed fixed-target export.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

export const CONFIRM = 'RESET GAMEPLAY KEEP LOGINS';
export const RESET_VERSION = 1;
const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

// An explicit allowlist is intentional. A future table must get an explicit reset
// decision rather than silently surviving, or being deleted by a generic loop.
// `friends` is preserved with the shop's tables: it is a relationship between two ACCOUNTS, not
// gameplay progress, and the same two people are still friends after a character reset.
// `ip_bans` (migration 0014) is preserved with `users` for the same class of reason: a network
// suspension is moderation state, exactly like the `banned` column that survives on the accounts
// themselves. A gameplay reset that quietly reopened a suspended network would undo a live ban.
export const PRESERVED_TABLES = Object.freeze(['users', 'rate_limits', 'shop_orders', 'entitlements', 'shop_webhooks', 'friends', 'ip_bans']);
export const CLEARED_TABLES = Object.freeze([
  'competition_prize_ledger', 'competition_placements', 'competition_scores', 'competition_periods',
  'leaderboard_echo_rewards', 'leaderboard_echo_settlements', 'leaderboard_echo', 'leaderboard_kills',
  'offline_reward_claims', 'damage_samples', 'damage_alerts', 'competition_baselines',
  // 0015: save-audit flags describe saves that no longer exist after a reset.
  'save_alerts',
  'gm_gift_batches', 'grants', 'message_reads', 'messages', 'save_history', 'sessions',
]);
const UPDATED_TABLES = ['saves', 'events', 'unverified_echo_config'];
const META_TABLES = ['dev_migrations', 'd1_migrations'];
export const REQUIRED_TABLES = Object.freeze([...PRESERVED_TABLES, ...CLEARED_TABLES, ...UPDATED_TABLES].sort());
const SHOP_EVENT = "(kind='Cash Shop' OR kind LIKE 'shop-%')";
const integer = value => {
  assert(Number.isSafeInteger(value) && value >= 0, 'Invalid reset timestamp/count');
  return String(value);
};
const digest = value => createHash('sha256').update(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? String(v) : v)).digest('hex');

function referenceSchema() {
  const db = new DatabaseSync(':memory:');
  try {
    for (const name of fs.readdirSync(MIGRATIONS).filter(n => /^\d+_.*\.sql$/.test(n)).sort())
      db.exec(fs.readFileSync(path.join(MIGRATIONS, name), 'utf8'));
    return schemaShape(db);
  } finally { db.close(); }
}
function schemaShape(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
  const columns = {}, triggers = {};
  for (const name of tables) {
    if (META_TABLES.includes(name)) continue;
    columns[name] = db.prepare('PRAGMA table_info("' + name + '")').all().map(({ name, type, notnull, dflt_value, pk }) => ({ name, type, notnull, dflt_value, pk }));
    triggers[name] = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name=? ORDER BY name").all(name).map(r => ({ name: r.name, sql: String(r.sql).replace(/\s+/g, ' ').trim() }));
  }
  return { tables, columns, triggers };
}
export function assertResetSchema(db) {
  const actual = schemaShape(db), expected = referenceSchema();
  const allowed = new Set([...REQUIRED_TABLES, ...META_TABLES]);
  const unknown = actual.tables.filter(t => !allowed.has(t));
  const missing = REQUIRED_TABLES.filter(t => !actual.tables.includes(t));
  assert.deepEqual(unknown, [], 'Unknown tables: stop and review their reset policy');
  assert.deepEqual(missing, [], 'Required launch schema is missing; do not apply migrations as part of a reset');
  for (const table of REQUIRED_TABLES) {
    assert.deepEqual(actual.columns[table], expected.columns[table], 'Incompatible columns in ' + table);
    assert.deepEqual(actual.triggers[table], expected.triggers[table], 'Incompatible triggers in ' + table);
  }
  const config = db.prepare('SELECT singleton,starts_at,ruleset FROM unverified_echo_config').all();
  assert.equal(config.length, 1, 'Expected the singleton launch configuration');
  assert.equal(config[0].singleton, 1);
  assert.equal(config[0].ruleset, 'unverified-save-v1');
}

export const ACCOUNT_SQL = `SELECT u.id,u.username,u.gm,u.banned,s.version
  FROM users u LEFT JOIN saves s ON s.user_id=u.id ORDER BY u.id`;
export const CHECK_SQL = `SELECT
  (SELECT COUNT(*) FROM sessions) AS sessions,
  (SELECT COUNT(*) FROM save_history WHERE (user_id,version) NOT IN (SELECT user_id,version FROM saves)) AS invalid_history,
  (SELECT COUNT(*) FROM grants) AS grants,
  (SELECT COUNT(*) FROM messages) AS messages,
  (SELECT COUNT(*) FROM message_reads) AS message_reads,
  (SELECT COUNT(*) FROM events WHERE NOT (kind='Cash Shop' OR kind LIKE 'shop-%') AND kind<>'launch-reset') AS invalid_events,
  (SELECT COUNT(*) FROM leaderboard_kills) AS leaderboard_kills,
  (SELECT COUNT(*) FROM leaderboard_echo) AS leaderboard_echo,
  (SELECT COUNT(*) FROM leaderboard_echo_rewards) AS leaderboard_echo_rewards,
  (SELECT COUNT(*) FROM leaderboard_echo_settlements) AS leaderboard_echo_settlements,
  (SELECT COUNT(*) FROM competition_periods) AS competition_periods,
  (SELECT COUNT(*) FROM competition_scores) AS competition_scores,
  (SELECT COUNT(*) FROM competition_placements) AS competition_placements,
  (SELECT COUNT(*) FROM competition_prize_ledger) AS competition_prize_ledger,
  (SELECT COUNT(*) FROM offline_reward_claims) AS offline_reward_claims,
  (SELECT COUNT(*) FROM damage_samples) AS damage_samples,
  (SELECT COUNT(*) FROM damage_alerts) AS damage_alerts,
  (SELECT COUNT(*) FROM save_alerts) AS save_alerts,
  (SELECT COUNT(*) FROM competition_baselines) AS competition_baselines,
  (SELECT COUNT(*) FROM gm_gift_batches) AS gm_gift_batches,
  (SELECT starts_at FROM unverified_echo_config WHERE singleton=1) AS starts_at,
  (SELECT COUNT(*) FROM users u LEFT JOIN saves s ON s.user_id=u.id
    WHERE s.user_id IS NULL OR s.version<1 OR s.kills_total<>0 OR s.level<>1 OR s.cls<>'Novice'
      OR s.zeny<>0 OR s.playtime<>0 OR s.rate_kph<>0
      OR json_extract(s.blob,'$.owner')<>u.username OR json_extract(s.blob,'$.lv')<>1
      OR json_extract(s.blob,'$.cls')<>'Novice' OR json_extract(s.blob,'$.kills') IS NOT NULL
      OR json_extract(s.blob,'$.zeny') IS NOT NULL OR json_extract(s.blob,'$.trial') IS NOT NULL) AS invalid_saves,
  (SELECT COUNT(*) FROM saves s LEFT JOIN save_history h ON h.user_id=s.user_id AND h.version=s.version
    WHERE h.user_id IS NULL OR h.blob<>s.blob) AS missing_fresh_history`;

// A fulfilled Cash Shop supply order is delivered through grants. The reset clears
// gameplay mail, so an unclaimed paid grant must be delivered/resolved first.
export const PENDING_SHOP_GRANT_SQL = `SELECT COUNT(*) AS n FROM grants
  WHERE claimed_at IS NULL AND (created_by='Cash Shop' OR note LIKE 'Cash Shop:%')`;
export function assertNoPendingShopGrants(db) {
  const row = db.prepare(PENDING_SHOP_GRANT_SQL).get(), n = Number(row?.n);
  assert(Number.isSafeInteger(n) && n >= 0, 'Cannot verify the Cash Shop delivery queue');
  assert(n === 0, 'Unclaimed Cash Shop grants (' + n + '); deliver or resolve them before resetting');
}

export function accountState(rows) {
  assert(Array.isArray(rows));
  const ids = new Set();
  for (const row of rows) {
    assert(Number.isSafeInteger(Number(row.id)) && Number(row.id) > 0 && !ids.has(Number(row.id)), 'Invalid account snapshot');
    ids.add(Number(row.id));
    assert.equal(typeof row.username, 'string');
    assert([0, 1, 2].includes(Number(row.gm)), 'Unknown account role');
    assert(row.version === null || Number.isSafeInteger(Number(row.version)) && Number(row.version) >= 1, 'Invalid save version');
  }
  return { rows, accounts: rows.length, fingerprint: digest(rows) };
}
export function preservedSnapshot(db) {
  return Object.fromEntries(PRESERVED_TABLES.map(table => [table, db.prepare('SELECT * FROM "' + table + '" ORDER BY 1,2').all()]));
}
export function captureState(db) {
  assertResetSchema(db);
  return { accounts: accountState(db.prepare(ACCOUNT_SQL).all()), preserved: preservedSnapshot(db), checks: db.prepare(CHECK_SQL).get() };
}

// Deliberately sparse: the game's fresh() supplies the current starter equipment,
// skills and defaults when load() merges this save. Do not duplicate balance data
// here. The owner stamp is mandatory; no previous inventory, gifts or trial data
// survives. Each existing version is incremented so an old tab cannot match it.
export function buildResetSql(db, { now = Date.now() } = {}) {
  assertResetSchema(db);
  assertNoPendingShopGrants(db);
  const state = accountState(db.prepare(ACCOUNT_SQL).all()), at = integer(now);
  const statements = CLEARED_TABLES.map(table => 'DELETE FROM ' + table + ';');
  statements.push('DELETE FROM events WHERE NOT ' + SHOP_EVENT + ';');
  statements.push(`INSERT INTO saves(user_id,version,blob,saved_at,updated_at,last_seen,rate_kph,kills_total,level,cls,zeny,playtime)
    SELECT u.id,COALESCE(s.version,0)+1,
      json_object('owner',u.username,'lv',1,'cls','Novice','launchReset',json_object('version',${RESET_VERSION},'at',${at})),
      ${at},${at},${at},0,0,1,'Novice',0,0 FROM users u LEFT JOIN saves s ON s.user_id=u.id
    ON CONFLICT(user_id) DO UPDATE SET version=excluded.version,blob=excluded.blob,saved_at=excluded.saved_at,
      updated_at=excluded.updated_at,last_seen=excluded.last_seen,rate_kph=0,kills_total=0,level=1,cls='Novice',zeny=0,playtime=0;`);
  // A first save for a previously empty account fires leaderboard_seed_new_save.
  // Remove those zero baselines too: the public launch board starts genuinely empty.
  statements.push('DELETE FROM leaderboard_kills;');
  statements.push('INSERT INTO save_history(user_id,version,blob,saved_at) SELECT user_id,version,blob,saved_at FROM saves;');
  statements.push('UPDATE unverified_echo_config SET starts_at=0 WHERE singleton=1;');
  statements.push(`INSERT INTO events(at,actor,user_id,kind,detail) VALUES(${at},'Launch reset',NULL,'launch-reset',
    json_object('version',${RESET_VERSION},'accounts',${integer(state.accounts)},'credentialsPreserved',1,'shopPreserved',1));`);
  const sql = '-- Horizon Haven preflight reset v1. Keep logins, shop records and cosmetic ownership.\n'
    + '-- Wrangler 4.154.0 remote file imports are atomic; local execution adds a transaction.\n'
    + statements.join('\n') + '\n';
  assertResetSql(sql);
  return { sql, statements, state, now };
}
export function assertResetSql(sql) {
  assert.equal(typeof sql, 'string');
  assert(!/\b(?:DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA|BEGIN|COMMIT|ROLLBACK)\b/i.test(sql.replace(/^--.*$/gm, '')), 'Reset SQL must not change schema or transaction boundaries');
  const statements = sql.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
  const writable = new Set([...CLEARED_TABLES, ...UPDATED_TABLES]);
  for (const statement of statements) {
    const match = /^(?:DELETE FROM|INSERT INTO|UPDATE)\s+([a-z_]+)\b/i.exec(statement);
    assert(match && writable.has(match[1]), 'Reset SQL targets an unauthorized table');
  }
  assert(statements.length >= CLEARED_TABLES.length + 5, 'Incomplete reset SQL');
}
export function verifyResetCheck(checks) {
  for (const [key, value] of Object.entries(checks)) assert.equal(Number(value), 0, 'Post-reset check failed: ' + key);
}
export function verifyRemoteAccounts(before, rows) {
  const after = accountState(rows);
  assert.equal(after.accounts, before.accounts, 'Account count changed');
  const old = new Map(before.rows.map(r => [Number(r.id), r]));
  for (const row of after.rows) {
    const previous = old.get(Number(row.id));
    assert(previous, 'Account identity changed');
    assert.deepEqual([row.username, Number(row.gm), Number(row.banned)], [previous.username, Number(previous.gm), Number(previous.banned)], 'Login identity changed');
    assert.equal(Number(row.version), Number(previous.version || 0) + 1, 'Fresh save does not supersede the old version');
  }
  return after;
}
export function applyReset(db, { now = Date.now(), confirm } = {}) {
  assert.equal(confirm, CONFIRM, 'Explicit reset confirmation required');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('BEGIN IMMEDIATE');
  try {
    const plan = buildResetSql(db, { now }), before = captureState(db);
    for (const statement of plan.statements) db.prepare(statement).run();
    const after = captureState(db);
    assert.deepEqual(after.preserved, before.preserved, 'Credentials, security counters or shop records changed');
    verifyRemoteAccounts(before.accounts, after.accounts.rows);
    verifyResetCheck(after.checks);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    db.exec('COMMIT');
    return { before: before.accounts, after: after.accounts, cleared: CLEARED_TABLES, preserved: PRESERVED_TABLES, now };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export function restoreBackup(file) {
  assert(fs.statSync(file).size > 0, 'Backup is empty');
  const text = fs.readFileSync(file, 'utf8'), db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA temp_store=MEMORY');
    db.exec(text);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    assertResetSchema(db);
    return db;
  } catch (error) { db.close(); throw error; }
}
export function assertSealed(status, epoch) {
  assert(status && status.state === 'closed' && status.open === false && status.safeToRestore === true,
    'Writes are not confirmed sealed; close, drain and seal the gate first');
  assert(Number.isSafeInteger(Number(status.epoch)), 'Gate epoch is unknown');
  if (epoch !== undefined) assert.equal(Number(status.epoch), Number(epoch), 'Gate changed during reset; keep it closed and inspect');
  return Number(status.epoch);
}

// Dependency-injected orchestration for mock safety tests. No automatic reopen,
// no retry after an uncertain import, and no caller-selected remote target.
export async function runRemoteReset({ db, gate, copyBackup, writeSql, confirm, now = Date.now(), report = () => {} }) {
  assert.equal(confirm, CONFIRM, 'Explicit reset confirmation required');
  db.verify();
  const epoch = assertSealed(await gate.status());
  const source = await db.export(), backup = copyBackup(source);
  const original = restoreBackup(backup);
  let rehearsal, importStarted = false, importReturned = false;
  try {
    const before = captureState(original);
    assert.equal(accountState(await db.accounts('pre-import account comparison')).fingerprint, before.accounts.fingerprint,
      'Live accounts/save versions differ from the verified backup; keep writes sealed');
    const plan = buildResetSql(original, { now });
    rehearsal = restoreBackup(backup);
    applyReset(rehearsal, { now, confirm });
    const expected = captureState(rehearsal);
    const file = writeSql(plan.sql);
    assertSealed(await gate.status(), epoch);
    importStarted = true;
    await db.importReset(file, plan.sql);
    importReturned = true;
    const after = verifyRemoteAccounts(before.accounts, await db.accounts('post-import account verification'));
    verifyResetCheck(await db.checks('post-import gameplay verification'));
    // Compare canonical values, not row object prototypes: node:sqlite returns
    // null-prototype rows while Wrangler --json returns plain JSON objects.
    assert.equal(after.fingerprint, expected.accounts.fingerprint, 'Live reset differs from the verified rehearsal');
    assertSealed(await gate.status(), epoch);
    const result = { accounts: after.accounts, backupFile: backup, fingerprint: after.fingerprint, gateEpoch: epoch, writesOpen: false };
    report(result);
    return result;
  } catch (error) {
    const state = importReturned ? 'returned; post-import verification incomplete' : importStarted ? 'started; outcome unknown' : 'not started';
    throw Error(`${error.message} Reset import ${state}; do not reopen writes or retry until inspected.`, { cause: error });
  } finally { original.close(); if (rehearsal) rehearsal.close(); }
}

// Read-only remote rehearsal of the exact account/check queries. It never exports,
// writes SQL, imports, or changes the gate; it only proves the transport and shape.
export async function runRemoteCheck({ db, gate, report = () => {} }) {
  db.verify();
  const epoch = assertSealed(await gate.status());
  const accounts = accountState(await db.accounts('read-only account verification'));
  const checks = await db.checks('read-only gameplay verification');
  assert(checks && typeof checks === 'object' && !Array.isArray(checks), 'Read-only gameplay verification returned no row');
  for (const key of ['sessions', 'invalid_history', 'grants', 'messages', 'leaderboard_kills', 'starts_at', 'invalid_saves', 'missing_fresh_history'])
    assert(Number.isSafeInteger(Number(checks[key])), 'Read-only gameplay verification is missing ' + key);
  assertSealed(await gate.status(), epoch);
  const result = { mode: 'remote-read-only-check', accounts: accounts.accounts, verificationQueries: 'passed', importAttempted: false, gateEpoch: epoch, writesOpen: false };
  report(result);
  return result;
}
