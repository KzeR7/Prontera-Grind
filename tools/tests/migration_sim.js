// D1 migration safety: leaderboard counters remain additive, and the offline-claim migration adds
// server-owned remainder/claim storage without changing existing saves.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = new DatabaseSync(':memory:');
const migration = name => fs.readFileSync(path.join(root, 'migrations', name), 'utf8');
let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
};
console.log('migration: leaderboard counters and server-timed offline claims\n');

db.exec(migration('0001_init.sql'));
const user = db.prepare(`INSERT INTO users(username, pass_hash, created_at) VALUES('OldSave', 'test', 1)`).run().lastInsertRowid;
db.prepare(`INSERT INTO saves(user_id, version, blob, saved_at, updated_at, last_seen, rate_kph,
  kills_total, level, cls, zeny, playtime) VALUES(?,1,'{}',1,1,1,0,1200,35,'Novice',0,0)`).run(user);

const apply = () => db.exec(migration('0002_leaderboard.sql'));
const applyOffline = () => db.exec(migration('0003_server_timed_offline_claims.sql'));
apply();
applyOffline();

t('offline-claim migration preserves old saves and creates one-pending-claim storage', () => {
  assert.equal(db.prepare('SELECT version FROM saves WHERE user_id=?').get(user).version, 1, 'existing save row is untouched');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='offline_reward_claims'").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='idx_offline_claim_one_pending'").get().n, 1);
});

t('offline-claim migration is safe to reapply', () => {
  applyOffline();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='offline_reward_claims'").get().n, 1);
});

t('existing cloud saves backfill all-time kills, not old daily/weekly kills', () => {
  assert.equal(db.prepare("SELECT kills FROM leaderboard_kills WHERE user_id=? AND period_key='all'").get(user).kills, 1200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM leaderboard_kills WHERE user_id=? AND period_key<>'all'").get(user).n, 0);
});

t('rerunning the SQL migration is harmless', () => {
  apply();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM leaderboard_kills WHERE user_id=? AND period_key='all'").get(user).n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'leaderboard_%'").get().n, 2);
});

t('accepted kill increases update lifetime and the current Singapore day atomically', () => {
  db.prepare('UPDATE saves SET kills_total=1230, version=version+1 WHERE user_id=?').run(user);
  const day = db.prepare("SELECT strftime('%Y-%m-%d','now','+8 hours') AS day").get().day;
  assert.equal(db.prepare("SELECT kills FROM leaderboard_kills WHERE user_id=? AND period_key='all'").get(user).kills, 1230);
  assert.equal(db.prepare('SELECT kills FROM leaderboard_kills WHERE user_id=? AND period_key=?').get(user, day).kills, 30);
});

t('a save reset does not erase score, and later kills count from the reset baseline', () => {
  db.prepare('UPDATE saves SET kills_total=0, version=version+1 WHERE user_id=?').run(user);
  db.prepare('UPDATE saves SET kills_total=7, version=version+1 WHERE user_id=?').run(user);
  const day = db.prepare("SELECT strftime('%Y-%m-%d','now','+8 hours') AS day").get().day;
  assert.equal(db.prepare("SELECT kills FROM leaderboard_kills WHERE user_id=? AND period_key='all'").get(user).kills, 1237);
  assert.equal(db.prepare('SELECT kills FROM leaderboard_kills WHERE user_id=? AND period_key=?').get(user, day).kills, 37);
});

t('a first save seeds all-time but does not award its existing kills to today', () => {
  const fresh = db.prepare(`INSERT INTO users(username, pass_hash, created_at) VALUES('NewSave', 'test', 1)`).run().lastInsertRowid;
  db.prepare(`INSERT INTO saves(user_id, version, blob, saved_at, updated_at, last_seen, rate_kph,
    kills_total, level, cls, zeny, playtime) VALUES(?,1,'{}',1,1,1,0,5000,50,'Mage',0,0)`).run(fresh);
  assert.equal(db.prepare("SELECT kills FROM leaderboard_kills WHERE user_id=? AND period_key='all'").get(fresh).kills, 5000);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM leaderboard_kills WHERE user_id=? AND period_key<>'all'").get(fresh).n, 0);
});

// v277: promoting the owner's account to the reserved name `GM`. The migration is run by hand with
// the id/name filled in, so this pins the two properties that make it safe rather than the exact text:
// it touches ONE row, and it re-stamps the save blob - without that, the stored blob keeps
// `"owner":"<old name>"`, the server refuses every sync (409 saveMismatch), and the client cannot
// repair it because it will not write a save stamped for another account.
t('the GM rename migration moves one account, re-stamps its save, and spares everyone else', () => {
  const D = new DatabaseSync(':memory:');
  D.exec(migration('0001_init.sql'));
  const owner = D.prepare("INSERT INTO users(username,pass_hash,gm,created_at) VALUES('Bystander','h',2,1)").run().lastInsertRowid;
  const target = D.prepare("INSERT INTO users(username,pass_hash,gm,created_at) VALUES('KzeR','h',0,1)").run().lastInsertRowid;
  const put = (id, v, blob) => D.prepare(`INSERT INTO saves(user_id,version,blob,saved_at,updated_at,last_seen,rate_kph,kills_total)
    VALUES(?,?,?,1,1,1,0,0)`).run(id, v, blob);
  put(target, 7, JSON.stringify({ owner: 'KzeR', lv: 99, zeny: 1234, cls: 'Knight' }));
  put(owner, 3, JSON.stringify({ owner: 'Bystander', lv: 5 }));

  // exactly the statements the migration documents, with its placeholders filled in
  D.exec(`BEGIN TRANSACTION;
    UPDATE users SET username='GM', gm=2 WHERE id=${target} AND username='KzeR';
    UPDATE saves SET blob=json_set(blob,'$.owner','GM'), version=version+1
      WHERE user_id=${target} AND json_valid(blob) AND json_extract(blob,'$.owner')='KzeR';
  COMMIT;`);

  const renamed = D.prepare('SELECT username, gm FROM users WHERE id=?').get(target);
  assert.equal(renamed.username, 'GM', 'the account is renamed');
  assert.equal(renamed.gm, 2, 'and promoted to owner');
  const row = D.prepare('SELECT version, blob FROM saves WHERE user_id=?').get(target);
  assert.equal(JSON.parse(row.blob).owner, 'GM', 'the save blob now names its new account');
  assert.equal(row.version, 8, 'the version is bumped so a stale tab cannot push the old copy back');
  const kept = JSON.parse(row.blob);
  assert.equal(kept.lv, 99, 'the rest of the save survives');
  assert.equal(kept.zeny, 1234, 'including the money');
  assert.equal(kept.cls, 'Knight', 'and the class');
  assert.equal(JSON.parse(D.prepare('SELECT blob FROM saves WHERE user_id=?').get(owner).blob).owner, 'Bystander',
    'an unrelated account is untouched');
  for (const typed of ['GM', 'gm', 'Gm']) {
    assert.ok(D.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE').get(typed),
      `login lookup finds it when the player types "${typed}"`);
  }
});

// Every `NNNN_*.sql` is executed automatically by tools/dev_server.js and by `wrangler d1 execute
// --file=`. That loader already wraps each file in its own transaction, so a file containing
// BEGIN/COMMIT fails on a nested transaction - and a file containing a data change would run on every
// local boot. 0013 is a run-by-hand playbook for renaming an account to the owner name `GM`, so it must
// stay comment-only.
t('migrations stay auto-runnable: no file opens its own transaction or edits live rows', () => {
  const dir = path.join(root, 'migrations');
  for (const name of fs.readdirSync(dir).filter(n => /^\d+_.*\.sql$/.test(n))) {
    // Strip comments and trigger bodies first: `BEGIN ... END;` inside a CREATE TRIGGER is SQL, not a
    // transaction, and several migrations legitimately use it for RAISE(ABORT).
    const sql = migration(name)
      .replace(/--[^\n]*/g, '')
      .replace(/CREATE\s+TRIGGER[\s\S]*?END\s*;/gi, '');
    assert.ok(!/^\s*BEGIN(\s+(IMMEDIATE|DEFERRED|EXCLUSIVE|TRANSACTION))?\s*;/im.test(sql),
      name + ' must not open its own transaction (the loader already does)');
    assert.ok(!/^\s*COMMIT\s*;/im.test(sql), name + ' must not COMMIT inside the loader transaction');
    if (name.startsWith('0013')) {
      assert.ok(!/(UPDATE|INSERT|DELETE)\s+users/i.test(sql),
        '0013 renames and promotes a real account by hand - it must never run automatically');
    }
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
