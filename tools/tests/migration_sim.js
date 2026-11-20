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

t('0020 classifies existing snapshot rows once and leaves a state contract for new issuance', () => {
  const D=new DatabaseSync(':memory:');
  D.exec(migration('0001_init.sql'));D.exec(migration('0003_server_timed_offline_claims.sql'));
  D.exec(migration('0018_offline_claim_owner_context.sql'));D.exec(migration('0019_offline_claim_pricing_snapshot.sql'));
  const uid=D.prepare("INSERT INTO users(username,pass_hash,created_at) VALUES('StateRows','h',1)").run().lastInsertRowid;
  const add=(values)=>{const r=D.prepare(`INSERT INTO offline_reward_claims(user_id,away_ms,credited_ms,rate_kph,kills,remainder,issued_at,
    income_xp,income_zeny,income_job,income_kph,source_map,source_stage,income_version,reward_version,sampled_at,interval_start_at,interval_end_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(uid,240000,240000,10,0,0,1,...values);
    // The production index allows one pending row; classification applies to claim history too.
    D.prepare('UPDATE offline_reward_claims SET claimed_at=id WHERE id=?').run(r.lastInsertRowid);};
  add([null,null,null,null,null,null,null,null,null,null,null]);                 // pre-0019/legacy
  add([60,30,4,10,0,1,1,6,1,100,200]);                                           // complete frozen minute
  add([60,null,4,10,0,1,1,6,1,100,200]);                                        // partial/corrupt
  D.exec(migration('0020_offline_claim_pricing_state.sql'));
  assert.deepEqual(D.prepare('SELECT pricing_state FROM offline_reward_claims ORDER BY id').all().map(r=>r.pricing_state),
    ['legacy','priced','corrupt']);
  assert.equal(D.prepare("PRAGMA table_info(offline_reward_claims)").all().some(c=>c.name==='pricing_state'),true);
  // ALTER migrations run once, but the backfill itself only touches unclassified history.
  assert.match(migration('0020_offline_claim_pricing_state.sql'), /WHERE pricing_state IS NULL;/);
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
// BEGIN/COMMIT fails on a nested transaction. 0013 is a run-by-hand playbook for renaming an account
// to the owner name `GM`, so it must stay comment-only. 0020 is the deliberately bounded exception:
// its NULL-only offline-claim classification is required to preserve legacy recovery while introducing
// explicit pricing state; its behaviour is pinned above rather than silently treated as a generic edit.
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


// 0022 is additive: it must install next to existing saves, reserve entries race-safely, and pay a
// retried settlement exactly once through the ordinary grants queue.
t('0022 raid migration installs beside existing saves and preserves every old row', () => {
  const D = new DatabaseSync(':memory:');
  for (const name of fs.readdirSync(path.join(root, 'migrations'))
    .filter(n => /^\d+_.*\.sql$/.test(n) && n < '0022').sort()) D.exec(migration(name));
  const uid = D.prepare("INSERT INTO users(username,pass_hash,created_at) VALUES('Raider','h',1)").run().lastInsertRowid;
  D.prepare("INSERT INTO saves(user_id,version,blob,saved_at,updated_at,last_seen,rate_kph,kills_total) VALUES(?,1,'{\"lv\":150}',1,1,1,0,0)").run(uid);
  D.exec(migration('0022_player_character_raid.sql'));
  assert.equal(D.prepare('SELECT blob FROM saves WHERE user_id=?').get(uid).blob, '{"lv":150}');
  assert.equal(D.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='raid_runs'").get().n, 1);
  assert.equal(D.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name IN ('raid_entry_daily_limit','raid_entry_active_limit','raid_reward_apply')").get().n, 3);
  assert.equal(D.prepare("PRAGMA table_info(grants)").all().some(c => c.name === 'ref'), true);
  assert.equal(D.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='idx_grants_ref'").get().n, 1);
});

t('0022 reserves at most two entries per day and one active run per account', () => {
  const D = new DatabaseSync(':memory:');
  D.exec(migration('0001_init.sql')); D.exec(migration('0022_player_character_raid.sql'));
  const uid = D.prepare("INSERT INTO users(username,pass_hash,created_at) VALUES('Entries','h',1)").run().lastInsertRowid;
  const mk = id => {
    D.prepare("INSERT INTO raid_runs(id,leader_id,party_size,total_hp,started_at,deadline_at) VALUES(?,?,1,100,1,2)").run(id, uid);
    D.prepare("INSERT INTO raid_run_members(run_id,user_id,display_name) VALUES(?,?,'Entries')").run(id, uid);
  };
  mk('r1');
  D.prepare("INSERT INTO raid_entries(user_id,day_key,run_id,entered_at) VALUES(?,'2026-01-01','r1',1)").run(uid);
  D.prepare("UPDATE raid_runs SET state='failed' WHERE id='r1'").run();
  mk('r2');
  D.prepare("INSERT INTO raid_entries(user_id,day_key,run_id,entered_at) VALUES(?,'2026-01-01','r2',2)").run(uid);
  D.prepare("UPDATE raid_runs SET state='failed' WHERE id='r2'").run();
  mk('r3');
  assert.throws(() => D.prepare("INSERT INTO raid_entries(user_id,day_key,run_id,entered_at) VALUES(?,'2026-01-01','r3',3)").run(uid), /raid_daily_entry_limit/);
  const uid2 = D.prepare("INSERT INTO users(username,pass_hash,created_at) VALUES('Active','h',1)").run().lastInsertRowid;
  D.prepare("INSERT INTO raid_runs(id,leader_id,party_size,total_hp,started_at,deadline_at) VALUES('a1',?,1,100,1,2)").run(uid2);
  D.prepare("INSERT INTO raid_run_members(run_id,user_id,display_name) VALUES('a1',?,'Active')").run(uid2);
  D.prepare("INSERT INTO raid_entries(user_id,day_key,run_id,entered_at) VALUES(?,'2026-01-01','a1',1)").run(uid2);
  D.prepare("INSERT INTO raid_runs(id,leader_id,party_size,total_hp,started_at,deadline_at) VALUES('a2',?,1,100,1,2)").run(uid2);
  D.prepare("INSERT INTO raid_run_members(run_id,user_id,display_name) VALUES('a2',?,'Active')").run(uid2);
  assert.throws(() => D.prepare("INSERT INTO raid_entries(user_id,day_key,run_id,entered_at) VALUES(?,'2026-01-01','a2',2)").run(uid2), /raid_active_run/);
});

t('0022 settles a clear and a failure exactly once, including ordinary grants', () => {
  const D = new DatabaseSync(':memory:');
  D.exec(migration('0001_init.sql')); D.exec(migration('0022_player_character_raid.sql'));
  const uid = D.prepare("INSERT INTO users(username,pass_hash,created_at) VALUES('Payout','h',1)").run().lastInsertRowid;
  D.prepare("INSERT INTO raid_runs(id,leader_id,party_size,total_hp,started_at,deadline_at) VALUES('pay',?,3,100,1,2)").run(uid);
  D.prepare("INSERT INTO raid_accounts(user_id,updated_at) VALUES(?,1)").run(uid);
  const payload = JSON.stringify({ riftShards: 20, sigils: 30, regionalMaterials: 5, zeny: 1000000, partySize: 3, support: 40 });
  D.prepare("INSERT OR IGNORE INTO raid_reward_ledger(run_id,user_id,kind,payload,created_at) VALUES('pay',?,'clear',?,1)").run(uid, payload);
  D.prepare("INSERT OR IGNORE INTO raid_reward_ledger(run_id,user_id,kind,payload,created_at) VALUES('pay',?,'clear',?,1)").run(uid, payload);
  D.prepare("INSERT OR IGNORE INTO raid_chests(run_id,user_id,day_key,kind,payload,created_at) VALUES('pay',?,'2026-01-01','pity',?,1)").run(uid, JSON.stringify({ riftShards: 5, sigils: 4, regionalMaterials: 1, zeny: 100000, partySize: 3 }));
  D.prepare("INSERT OR IGNORE INTO raid_chests(run_id,user_id,day_key,kind,payload,created_at) VALUES('pay',?,'2026-01-01','fractured',?,1)").run(uid, JSON.stringify({ riftShards: 2, sigils: 2, regionalMaterials: 0, zeny: 0, partySize: 3 }));
  const account = D.prepare('SELECT * FROM raid_accounts WHERE user_id=?').get(uid);
  assert.equal(account.rift_shards, 27);
  assert.equal(account.qualifying_clears, 1);
  assert.equal(account.trio_clears, 1);
  assert.equal(account.support_clears, 1);
  assert.equal(D.prepare('SELECT COUNT(*) AS n FROM grants WHERE user_id=?').get(uid).n, 10);
  assert.equal(D.prepare('SELECT COUNT(DISTINCT ref) AS n FROM grants WHERE user_id=?').get(uid).n, 10);
  assert.equal(D.prepare("SELECT COUNT(*) AS n FROM grants WHERE user_id=? AND json_extract(payload,'$.resource')='riftShards'").get(uid).n, 3);
  assert.equal(D.prepare("SELECT SUM(CAST(json_extract(payload,'$.amount') AS INTEGER)) AS n FROM grants WHERE user_id=? AND json_extract(payload,'$.resource')='riftShards'").get(uid).n, 27);
  assert.equal(D.prepare('SELECT COUNT(*) AS n FROM raid_reward_ledger WHERE run_id=? AND user_id=?').get('pay', uid).n, 3);
});

t('0023 raid cards are account-wide, duplicate-ranking and exactly-once per chest', () => {
  const D = new DatabaseSync(':memory:');
  D.exec(migration('0001_init.sql')); D.exec(migration('0022_player_character_raid.sql')); D.exec(migration('0023_raid_cards.sql'));
  const uid = D.prepare("INSERT INTO users(username,pass_hash,created_at) VALUES('Cards','h',1)").run().lastInsertRowid;
  D.prepare("INSERT INTO raid_runs(id,leader_id,party_size,total_hp,started_at,deadline_at) VALUES('cards',?,1,100,1,2)").run(uid);
  D.prepare("INSERT INTO raid_accounts(user_id,updated_at) VALUES(?,1)").run(uid);
  const drop = (kind, key) => D.prepare("INSERT OR IGNORE INTO raid_card_drops(run_id,user_id,kind,card_key,created_at) VALUES('cards',?,?,?,1)").run(uid, kind, key);
  drop('clear', 'sovereign-fang');
  drop('clear', 'sovereign-fang'); // replay: PRIMARY KEY suppresses the second copy
  drop('fractured', 'sovereign-fang');
  drop('pity', 'astral-bulwark');
  const rows = D.prepare('SELECT card_key,copies,equipped FROM raid_cards WHERE user_id=? ORDER BY card_key').all(uid);
  assert.deepEqual(rows.map(r => ({ ...r })), [
    { card_key: 'astral-bulwark', copies: 1, equipped: 0 },
    { card_key: 'sovereign-fang', copies: 2, equipped: 0 },
  ]);
  D.prepare('UPDATE raid_cards SET equipped=0 WHERE user_id=?').run(uid);
  D.prepare("UPDATE raid_cards SET equipped=1 WHERE user_id=? AND card_key='sovereign-fang'").run(uid);
  assert.equal(D.prepare('SELECT SUM(equipped) AS n FROM raid_cards WHERE user_id=?').get(uid).n, 1);
  assert.equal(D.prepare("SELECT COUNT(*) AS n FROM raid_card_drops WHERE run_id='cards' AND user_id=?").get(uid).n, 3);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
