// Synthetic-only preflight reset: real SQLite, real login/save handlers and the
// real client loader. No Cloudflare access. The remote driver is dependency-injected.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { freshDb, makeD1 } from '../dev_server.js';
import { hashPassword } from '../../functions/_lib/auth.js';
import { onRequestPost as login } from '../../functions/api/sessions.js';
import { onRequestGet as getSave, onRequestPut as putSave } from '../../functions/api/save.js';
import { CONFIRM, CLEARED_TABLES, PRESERVED_TABLES, ACCOUNT_SQL, CHECK_SQL, REQUIRED_TABLES,
  captureState, preservedSnapshot, buildResetSql, assertResetSql, assertResetSchema, assertNoPendingShopGrants, applyReset,
  restoreBackup, runRemoteCheck, runRemoteReset, verifyResetCheck } from '../recovery/launch_reset_core.mjs';
import { parseArgs, runLocal, createResetRemote, parseWranglerJson } from '../recovery/prelaunch_reset.mjs';
const { createGame } = createRequire(import.meta.url)('./helpers/game');
const root = path.resolve(import.meta.dirname, '../..');
const migrationSql = fs.readdirSync(path.join(root, 'migrations')).filter(n => /^\d+_.*\.sql$/.test(n)).sort()
  .map(n => fs.readFileSync(path.join(root, 'migrations', n), 'utf8')).join('\n');
const password = 'Synthetic-password-123!';
const hash = await hashPassword(password);
const oldBlob = name => JSON.stringify({ owner: name, lv: 150, cls: 'Rune Knight', kills: 987654, zeny: 888888,
  inv: [{ id: 'old-test-item', name: 'Old test gear' }], trial: { best: 999999 }, gmReceipts: [1], shards: 900 });
const seedSql = `
INSERT INTO users(id,username,email,pass_hash,recovery_hash,gm,banned,created_at,last_login_at,fail_count,fail_at) VALUES
  (10,'ResetPlayer','player@example.test','${hash}','synthetic-recovery-hash',0,0,1000,2000,0,0),
  (20,'ResetGM','gm@example.test','${hash}','synthetic-gm-recovery',1,0,1001,2001,0,0),
  (30,'ResetOwner','owner@example.test','${hash}',NULL,2,1,1002,2002,0,0);
INSERT INTO saves(user_id,version,blob,saved_at,updated_at,last_seen,rate_kph,kills_total,level,cls,zeny,playtime) VALUES
  (10,7,'${oldBlob('ResetPlayer')}',3000,3000,3000,120,987654,150,'Rune Knight',888888,9000),
  (20,8,'${oldBlob('ResetGM')}',3000,3000,3000,130,987654,150,'Rune Knight',888888,9000),
  (30,9,'${oldBlob('ResetOwner')}',3000,3000,3000,140,987654,150,'Rune Knight',888888,9000);
INSERT INTO save_history VALUES(10,6,'old-private-history',2500),(10,7,'${oldBlob('ResetPlayer')}',3000);
INSERT INTO sessions VALUES('old-session',10,1000,9999999999999,'synthetic','synthetic');
INSERT INTO grants(id,user_id,kind,payload,created_at) VALUES(1,10,'zeny','{"amount":500}',3000);
INSERT INTO messages(id,body,target_user,created_at) VALUES(1,'Old testing notice',NULL,3000),(2,'Private testing mail',10,3000);
INSERT INTO message_reads VALUES(10,1,3001);
INSERT INTO events(at,actor,user_id,kind,detail) VALUES
  (3000,'GM',10,'gm-grant','old testing gift'),(3001,'Cash Shop',10,'shop-fulfilled','keep purchase audit'),
  (3002,'GM',10,'shop-grant','keep ownership audit'),(3003,'GM',20,'shop-revoke','keep ownership audit');
INSERT INTO rate_limits VALUES('login-name:resetplayer',2,3000);
INSERT INTO leaderboard_kills VALUES(10,'2026-10-30',500),(20,'2026-10-30',999999);
INSERT INTO offline_reward_claims(id,user_id,away_ms,credited_ms,rate_kph,kills,remainder,issued_at,claimed_at)
  VALUES(1,10,3600000,3600000,120,60,0.5,3000,NULL);
INSERT INTO gm_gift_batches VALUES('old-batch','GM',3000,30,'zeny','{"amount":500}','testing');
INSERT INTO shop_orders(id,user_id,sku,quantity,amount,currency,status,stripe_session,stripe_payment,created_at,paid_at,fulfilled_at)
  VALUES('synthetic-order',10,'cos:headwear:halo',1,100,'usd','fulfilled','synthetic-session','synthetic-payment',3000,3001,3002);
INSERT INTO entitlements VALUES(10,'cos:headwear:halo','stripe','synthetic-order',3002),(20,'cos:backwear:wings','gm',NULL,3002);
INSERT INTO shop_webhooks VALUES('synthetic-event','checkout.session.completed',3002);
INSERT INTO leaderboard_echo VALUES(10,'all',999999),(20,'day:2026-10-30',888888);
INSERT INTO leaderboard_echo_rewards VALUES('day:2020-01-01',10,1,999999,'[]',3000);
INSERT INTO leaderboard_echo_settlements VALUES('day:2020-01-01',3000);
INSERT INTO damage_samples VALUES(10,0,1,3000,0,1,100,200);
INSERT INTO damage_alerts VALUES(10,'review',3000,3000,100,1);
INSERT INTO competition_periods(period_key,kind,ruleset,starts_at,ends_at,state)
  VALUES('day:2020-01-02','daily','unverified-save-v1',1000,9999999999000,'open');
INSERT INTO competition_scores VALUES('day:2020-01-02',10,'old-run',999999,1500);
UPDATE competition_periods SET state='settling',ends_at=2000,claim_token='00000000-0000-4000-8000-000000000000';
INSERT INTO competition_placements VALUES('day:2020-01-02',10,1,999999,'old-run');
INSERT INTO competition_prize_ledger(period_key,user_id,resource,amount,created_at) VALUES('day:2020-01-02',10,'shards',100,3000);
UPDATE competition_periods SET state='closed',claim_token=NULL,closed_at=3000;
INSERT INTO competition_baselines VALUES(10,7,3000,2000,3000,'grandfathered-unverified-v1','${oldBlob('ResetPlayer')}');
UPDATE unverified_echo_config SET starts_at=9999999999999 WHERE singleton=1;
`;
const fixtureSql = migrationSql + '\n' + seedSql;
function fixture(local = false) { const db = local ? freshDb() : new DatabaseSync(':memory:'); db.exec(local ? seedSql : fixtureSql); return db; }
const fileHash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-launch-reset-test-'));
const reports = [];
let checks = 0;
const ok = name => { checks++; console.log('  ok   ' + name); };
const request = (route, body, cookie) => new Request('https://game.test/api/' + route, {
  method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
try {
  assert.throws(() => parseArgs([]), /Choose/);
  assert.throws(() => parseArgs(['--remote']), /requires --apply/);
  assert.throws(() => parseArgs(['--remote', '--apply', '--confirm', 'yes']), /Exact confirmation/);
  assert.throws(() => parseArgs(['--remote', '--local', 'x']), /not both/);
  assert.throws(() => parseArgs(['--check']), /read-only remote/);
  assert.throws(() => parseArgs(['--remote', '--check', '--apply', '--confirm', CONFIRM]), /not both/);
  assert.equal(parseArgs(['--remote', '--check']).apply, false);
  assert.equal(parseArgs(['--remote', '--check']).check, true);
  assert.equal(parseArgs(['--local', 'x']).apply, false);
  ok('CLI defaults to a local dry run, separates read-only remote checks, and refuses an unconfirmed remote operation');

  const db = fixture(true), env = { DB: makeD1(db) };
  const signedIn = await login({ request: request('sessions', { u: 'ResetPlayer', p: password }), env });
  assert.equal(signedIn.status, 200);
  const oldCookie = signedIn.headers.get('set-cookie').split(';')[0];
  const before = captureState(db), sequences = db.prepare('SELECT * FROM sqlite_sequence ORDER BY name').all();
  const plan = buildResetSql(db, { now: 5000 });
  assert.equal(plan.state.accounts, 3);
  assert.deepEqual(captureState(db), before, 'planning is read-only');
  assert.throws(() => assertResetSql(plan.sql + '\nDELETE FROM users;'), /unauthorized table/);
  assert.throws(() => assertResetSql(plan.sql + '\nUPDATE entitlements SET source=\'stripe\';'), /unauthorized table/);
  assert.throws(() => assertResetSql(plan.sql + '\nDROP TABLE saves;'), /must not change schema/);
  assert.throws(() => applyReset(db, { confirm: 'yes' }), /confirmation/);
  ok('the plan is read-only, bounded to gameplay tables, and requires exact confirmation');

  const localFile = path.join(temp, 'synthetic.sqlite');
  // Write a real SQLite file through the supported backup API.
  const { backup } = await import('node:sqlite');
  await backup(db, localFile);
  const originalHash = fileHash(localFile), dryReports = [];
  await runLocal(localFile, { report: x => dryReports.push(x) });
  assert.equal(fileHash(localFile), originalHash, 'dry run must not change the original database');
  assert.equal(dryReports[0].mode, 'dry-run');
  ok('the CLI dry run applies the whole reset to a disposable copy, leaving the original byte-for-byte unchanged');

  const injected = fixture(), snapshot = captureState(injected), realPrepare = injected.prepare.bind(injected);
  injected.prepare = sql => { if (/^UPDATE unverified_echo_config/.test(sql)) throw Error('injected late failure'); return realPrepare(sql); };
  assert.throws(() => applyReset(injected, { confirm: CONFIRM }), /injected late failure/);
  injected.prepare = realPrepare;
  assert.deepEqual(captureState(injected), snapshot, 'late failure rolls back every earlier delete');
  injected.close();
  const unknown = fixture(); unknown.exec('CREATE TABLE future_feature(id INTEGER PRIMARY KEY,secret TEXT)');
  assert.throws(() => buildResetSql(unknown), /Unknown tables/); unknown.close();
  const missing = fixture(); missing.exec('DROP TABLE message_reads'); missing.exec('DROP TABLE messages');
  assert.throws(() => assertResetSchema(missing), /missing/); missing.close();
  ok('late failures roll back atomically; missing or future schema stops instead of guessing');

  const paid = fixture();
  paid.exec("INSERT INTO grants(user_id,kind,payload,note,created_by,created_at) VALUES(10,'gift','{\"resource\":\"ori\",\"amount\":10}','Cash Shop: Oridecon','Cash Shop',3500)");
  const paidBefore = captureState(paid);
  assert.throws(() => assertNoPendingShopGrants(paid), /Unclaimed Cash Shop grants \(1\)/);
  assert.throws(() => buildResetSql(paid), /Unclaimed Cash Shop grants/);
  assert.throws(() => applyReset(paid, { confirm: CONFIRM }), /Unclaimed Cash Shop grants/);
  assert.deepEqual(captureState(paid), paidBefore, 'a refused paid-grant reset changes nothing');
  ok('an unclaimed paid Cash Shop grant stops planning and apply without deleting anything');
  paid.exec("UPDATE grants SET claimed_at=4000 WHERE created_by='Cash Shop'");
  assert.doesNotThrow(() => assertNoPendingShopGrants(paid));
  assert.doesNotThrow(() => buildResetSql(paid));
  paid.close();
  ok('a claimed Cash Shop grant no longer blocks the reset; purchase records remain preserved');

  const applied = await runLocal(localFile, { apply: true, confirm: CONFIRM, folder: path.join(temp, 'backups'), report: x => reports.push(x) });
  assert(fs.statSync(applied.backupFile).size > 0);
  applyReset(db, { confirm: CONFIRM });
  const saved = new DatabaseSync(applied.backupFile, { readOnly: true });
  assert.equal(saved.prepare('SELECT COUNT(*) n FROM sessions').get().n, 1);
  assert.equal(saved.prepare('SELECT level FROM saves WHERE user_id=10').get().level, 150);
  saved.close();
  assert.deepEqual(preservedSnapshot(db), before.preserved, 'all login fields, roles, bans, security counters and shop rows are exact');
  const afterSequences = new Map(db.prepare('SELECT * FROM sqlite_sequence ORDER BY name').all().map(r => [r.name, r.seq]));
  for (const row of sequences) assert(row.name === 'events' ? afterSequences.get(row.name) > row.seq : afterSequences.get(row.name) === row.seq, 'never reuse old grant/account IDs');
  for (const table of CLEARED_TABLES.filter(t => t !== 'save_history')) assert.equal(db.prepare('SELECT COUNT(*) n FROM ' + table).get().n, 0, table);
  verifyResetCheck(db.prepare(CHECK_SQL).get());
  assert.deepEqual(db.prepare('SELECT user_id,version FROM saves ORDER BY user_id').all().map(r => [r.user_id, r.version]), [[10, 8], [20, 9], [30, 10]]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM save_history').get().n, 3);
  assert.deepEqual(db.prepare('SELECT kind FROM events ORDER BY id').all().map(r => r.kind), ['shop-fulfilled', 'shop-grant', 'shop-revoke', 'launch-reset']);
  assert.equal(db.prepare('SELECT starts_at FROM unverified_echo_config').get().starts_at, 0);
  ok('apply keeps every login/shop record, clears gameplay/history/rewards, seeds fresh owned saves and resets the launch boundary');
  const emptyAccount = fixture();
  emptyAccount.exec('DELETE FROM saves WHERE user_id=30');
  applyReset(emptyAccount, { confirm: CONFIRM });
  assert.equal(emptyAccount.prepare('SELECT COUNT(*) n FROM saves').get().n, 3);
  assert.equal(emptyAccount.prepare('SELECT COUNT(*) n FROM leaderboard_kills').get().n, 0, 'first-save trigger must not leave a launch-board baseline');
  emptyAccount.close();

  const oldSession = await getSave({ request: request('save', null, oldCookie), env });
  assert.equal(oldSession.status, 401, 'old sessions cannot upload after the reset');
  const again = await login({ request: request('sessions', { u: 'ResetPlayer', p: password }), env });
  assert.equal(again.status, 200, 'the original password still works');
  const cookie = again.headers.get('set-cookie').split(';')[0];
  const fresh = await (await getSave({ request: request('save', null, cookie), env })).json();
  assert.equal(fresh.version, 8); assert.equal(fresh.owner, 'ResetPlayer'); assert.equal(fresh.offlineClaim, null);
  assert.equal(JSON.parse(fresh.blob).lv, 1); assert.equal(JSON.parse(fresh.blob).inv, undefined);
  const stale = await putSave({ request: new Request('https://game.test/api/save', { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ owner: 'ResetPlayer', version: 7, blob: oldBlob('ResetPlayer') }) }), env });
  assert.equal(stale.status, 409); assert.equal((await stale.json()).blob, fresh.blob, 'an old tab must adopt the fresh save, not restore testing progress');
  const game = createGame();
  try {
    game.ev(`currentUser='ResetPlayer';lsPut(saveKey(),${JSON.stringify(fresh.blob)});S=load();`);
    assert.deepEqual(JSON.parse(game.ev('JSON.stringify([S.lv,S.kills,S.zeny,S.inv.length,S.pets.length,S.trial.best,S.poker.chips,S.eq.weapon.name,S.shards,S.ore.ori,S.cards.length])')),
      [1, 0, 0, 0, 0, 0, 1000, 'Novice Knife', 0, 0, 0]);
  } finally { game.close(); }
  ok('real login/save handlers and the real game loader accept the reset; old sessions and stale versions cannot resurrect progress');
  db.close();

  let remote = fixture();
  const backupFile = path.join(temp, 'private.sql'); fs.writeFileSync(backupFile, fixtureSql);
  let imported = 0, gateCalls = 0, exported = 0, changeOn = 0, failImport = false;
  const gate = { async status() { gateCalls++; return { state: 'closed', open: false, safeToRestore: true, epoch: changeOn === gateCalls ? 8 : 7 }; } };
  const driver = {
    verify() {}, export() { exported++; return backupFile; },
    accounts: async () => remote.prepare(ACCOUNT_SQL).all(), checks: async () => remote.prepare(CHECK_SQL).get(),
    importReset(file, expected) { assert.equal(fs.readFileSync(file, 'utf8'), expected); imported++; remote.exec('BEGIN IMMEDIATE'); try { remote.exec(expected); remote.exec('COMMIT'); } catch (e) { remote.exec('ROLLBACK'); throw e; } if (failImport) throw Error('uncertain import'); },
  };
  const run = () => runRemoteReset({ db: driver, gate, confirm: CONFIRM, now: 5000,
    copyBackup: source => { const file = path.join(temp, 'remote-backup-' + exported + '.sql'); fs.copyFileSync(source, file); return file; },
    writeSql: sql => { const file = path.join(temp, 'reset-' + imported + '.sql'); fs.writeFileSync(file, sql); return file; } });
  const remoteBefore = captureState(remote);
  const result = await run();
  assert.equal(result.writesOpen, false); assert.equal(result.accounts, 3); assert.equal(imported, 1); assert.equal(gateCalls, 3);
  assert.deepEqual(preservedSnapshot(remote), remoteBefore.preserved); verifyResetCheck(remote.prepare(CHECK_SQL).get());
  ok('the fixed remote workflow backs up, rehearses, compares live identities, imports once, verifies and leaves writes sealed');

  const checkReports = [], importsBeforeCheck = imported, exportsBeforeCheck = exported;
  const checkResult = await runRemoteCheck({ db: driver, gate, report: x => checkReports.push(x) });
  assert.equal(checkResult.mode, 'remote-read-only-check'); assert.equal(checkResult.accounts, 3);
  assert.equal(checkResult.importAttempted, false); assert.equal(checkResult.writesOpen, false);
  assert.equal(imported, importsBeforeCheck); assert.equal(exported, exportsBeforeCheck);
  assert.deepEqual(checkReports, [checkResult]);
  ok('the read-only remote check exercises the fixed queries without export, import, reset or reopen');

  remote.close(); remote = fixture();
  gateCalls = 0; changeOn = 2; const importsBefore = imported;
  await assert.rejects(run(), /Gate changed/); assert.equal(imported, importsBefore); changeOn = 0;
  failImport = true; await assert.rejects(run(), /uncertain import.*Reset import started; outcome unknown/); failImport = false;
  assert.equal((await gate.status()).state, 'closed');
  ok('a changed gate epoch or uncertain import stops without an automatic retry or reopen');

  const stageWrite = sql => { const file = path.join(temp, 'stage-' + imported + '.sql'); fs.writeFileSync(file, sql); return file; };
  const preDriver = { ...driver, accounts: async () => { throw Error('pre-import transport failed'); } };
  const beforePre = imported;
  await assert.rejects(runRemoteReset({ db: preDriver, gate, confirm: CONFIRM, copyBackup: () => backupFile, writeSql: stageWrite }), /pre-import transport failed.*Reset import not started/);
  assert.equal(imported, beforePre);
  remote.close(); remote = fixture();
  const postDriver = { ...driver, checks: async () => { throw Error('post-import transport failed'); } };
  const beforePost = imported;
  await assert.rejects(runRemoteReset({ db: postDriver, gate, confirm: CONFIRM, copyBackup: () => backupFile, writeSql: stageWrite }), /post-import transport failed.*Reset import returned/);
  assert.equal(imported, beforePost + 1);
  ok('query failures identify whether the atomic import was not started or already returned; neither case retries or reopens');

  const wrong = fixture(), wrongDriver = { ...driver, accounts: async () => wrong.prepare(ACCOUNT_SQL).all() };
  wrong.exec("UPDATE users SET username='Different' WHERE id=10");
  const beforeWrong = imported;
  await assert.rejects(runRemoteReset({ db: wrongDriver, gate, confirm: CONFIRM, copyBackup: () => backupFile, writeSql: () => path.join(temp, 'unused.sql') }), /differ from the verified backup/);
  assert.equal(imported, beforeWrong); wrong.close(); remote.close();
  ok('a live snapshot that differs from the verified backup cannot be imported');

  const fixed = path.join(temp, 'fixed-remote'); fs.mkdirSync(fixed);
  const calls = []; const guarded = createResetRemote(fixed, { execute: args => { calls.push(args); return JSON.stringify({ name: 'pg-staging', uuid: 'wrong' }); } });
  assert.throws(() => guarded.verify(), /identity mismatch/);
  const resetFile = path.join(fixed, 'reset.sql'); fs.writeFileSync(resetFile, plan.sql + '\nDELETE FROM users;');
  assert.throws(() => guarded.importReset(resetFile, plan.sql), /changed after rehearsal/);
  assert.equal(calls.length, 1, 'guard failures never reach Wrangler');
  assert.match(fs.readFileSync(path.join(fixed, 'wrangler.jsonc'), 'utf8'), /50a6448b-1f12-466c-a28a-10544bedf750/);
  assert.deepEqual(calls[0], ['d1', 'info', 'pg', '--json'], 'identity query uses the fixed database name, not the Pages binding');
  ok('the remote adapter pins the production identity and refuses a changed reset file');

  const oneLineDir = path.join(temp, 'one-line-remote'); fs.mkdirSync(oneLineDir);
  const queryCalls = [];
  const oneLine = createResetRemote(oneLineDir, { execute: args => {
    queryCalls.push(args);
    if (args[1] === 'info') return JSON.stringify({ name: 'pg', uuid: '50a6448b-1f12-466c-a28a-10544bedf750' });
    const sql = args[6];
    if (sql.startsWith('SELECT u.id')) return JSON.stringify([{ success: true, results: [{ id: 1, username: 'Synthetic', gm: 0, banned: 0, version: 1 }] }]);
    return JSON.stringify([{ success: true, results: [{ sessions: 0, invalid_history: 0, grants: 0, messages: 0, leaderboard_kills: 0, starts_at: 0, invalid_saves: 0, missing_fresh_history: 0 }] }]);
  } });
  oneLine.verify(); await oneLine.accounts('synthetic account verification'); await oneLine.checks('synthetic gameplay verification');
  assert.equal(queryCalls.length, 3);
  assert.equal(queryCalls[1][6], ACCOUNT_SQL.replace(/\s+/g, ' ').trim());
  assert.equal(queryCalls[2][6], CHECK_SQL.replace(/\s+/g, ' ').trim());
  assert(queryCalls.slice(1).every(args => !/[\r\n]/.test(args[6])));
  assert(queryCalls[2][6].includes("'Cash Shop'") && queryCalls[2][6].includes("'Novice'"));
  ok('remote verification SQL is sent as one shell-safe line without changing fixed literals');

  assert.deepEqual(parseWranglerJson(`npm notice
{"name":"pg","uuid":"50a6448b-1f12-466c-a28a-10544bedf750"}
`), { name: 'pg', uuid: '50a6448b-1f12-466c-a28a-10544bedf750' });
  assert.deepEqual(parseWranglerJson(`[notice]
[{"success":true,"results":[]}]`), [{ success: true, results: [] }]);
  assert.throws(() => parseWranglerJson('not json'), /no verified JSON/);
  const noisyDir = path.join(temp, 'noisy-remote'); fs.mkdirSync(noisyDir);
  const noisy = createResetRemote(noisyDir, { execute: args => args[1] === 'info' ? `npm notice
{"name":"pg","uuid":"50a6448b-1f12-466c-a28a-10544bedf750"}` : '[]' });
  noisy.verify();
  const badDir = path.join(temp, 'bad-remote'); fs.mkdirSync(badDir);
  const bad = createResetRemote(badDir, { execute: () => 'not json' });
  assert.throws(() => bad.verify(), /no verified JSON/);
  ok('Wrangler JSON notices are tolerated, but non-JSON output still stops the remote reset');

  assert.equal(REQUIRED_TABLES.length, 26);
  assert(PRESERVED_TABLES.includes('users') && PRESERVED_TABLES.includes('entitlements'));
  console.log('PASS: ' + checks + ' launch-reset checks; synthetic data only, no hosted operation');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
