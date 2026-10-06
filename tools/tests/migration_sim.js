// D1 migration safety: the leaderboard schema is additive, repeatable, and tracks only new kills
// in daily/weekly buckets while preserving an account-lifetime total.
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
console.log('migration: additive, repeatable leaderboard counters\n');

db.exec(migration('0001_init.sql'));
const user = db.prepare(`INSERT INTO users(username, pass_hash, created_at) VALUES('OldSave', 'test', 1)`).run().lastInsertRowid;
db.prepare(`INSERT INTO saves(user_id, version, blob, saved_at, updated_at, last_seen, rate_kph,
  kills_total, level, cls, zeny, playtime) VALUES(?,1,'{}',1,1,1,0,1200,35,'Novice',0,0)`).run(user);

const apply = () => db.exec(migration('0002_leaderboard.sql'));
apply();

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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
