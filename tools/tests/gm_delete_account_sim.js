// Deleting an account (v411): owner-only, username typed back, networks suspended first so the
// cheater's fingerprints outlive the account, and the cascade takes everything else.
import assert from 'node:assert/strict';
import { freshDb, makeEnv } from '../dev_server.js';
import { onRequestPost as register } from '../../functions/api/register.js';
import { onRequestPost as player, onRequestGet as inspect } from '../../functions/api/gm/player.js';

const sqlite = freshDb(), env = makeEnv(sqlite);
const call = async (fn, cookie, body, url = '/api/test') => {
  const res = await fn({ env, request: new Request('https://pg.local' + url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Cookie: cookie || '' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) });
  return { res, data: await res.json() };
};
const account = async u => {
  const r = await call(register, '', { u, p: 'test-password-only', email: u + '@example.test' });
  assert.equal(r.res.status, 201, 'registration for ' + u);
  return r.res.headers.get('set-cookie').split(';')[0];
};
const count = sql => Number(sqlite.prepare(sql).get()?.n) || 0;
const uid = name => sqlite.prepare('SELECT id FROM users WHERE username = ?').get(name)?.id;

let pass = 0, fail = 0;
const test = async (name, fn) => {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + ' -> ' + e.message); }
};
console.log('deleting a banned account: guarded, cascading, and the network bans outlive it\n');

const owner = await account('OwnerDel');
const normal = await account('PlayerDel');
const gmOne = await account('GmDel');
const cheater = await account('CheaterDel');
sqlite.prepare('UPDATE users SET gm=2 WHERE id=?').run(uid('OwnerDel'));
sqlite.prepare('UPDATE users SET gm=1 WHERE id=?').run(uid('GmDel'));
const CHEAT = uid('CheaterDel');

// Give the cheater something real to lose, and a network fingerprint to remember.
sqlite.prepare('INSERT INTO saves(user_id,version,blob,saved_at,updated_at,last_seen) VALUES(?,?,?,?,?,?)')
  .run(CHEAT, 3, '{"lvl":99}', Date.now(), Date.now(), Date.now());
sqlite.prepare('INSERT INTO save_history(user_id,version,blob,saved_at) VALUES(?,?,?,?)')
  .run(CHEAT, 2, '{"lvl":98}', Date.now());
sqlite.prepare("INSERT INTO grants(user_id,kind,payload,created_at) VALUES(?,?,?,?)")
  .run(CHEAT, 'zeny', '{"amount":1}', Date.now());
const FP = 'a1b2c3d4e5f60718';
sqlite.prepare("UPDATE sessions SET ip_hash=? WHERE user_id=?").run(FP, CHEAT);

try {
  await test('only the owner can delete, and never a staff account or themselves', async () => {
    for (const [cookie, id, why] of [
      ['', CHEAT, 'anonymous'],
      [normal, CHEAT, 'a normal player'],
      [gmOne, CHEAT, 'a level-1 GM'],
    ]) {
      const r = await call(player, cookie, { id, action: 'delete', confirm: 'CheaterDel' }, '/api/gm/player');
      assert.equal(r.res.status, why === 'anonymous' ? 401 : 403, why + ' must be refused');
    }
    assert.ok(uid('CheaterDel'), 'and the account is still there after every refusal');

    const self = await call(player, owner, { id: uid('OwnerDel'), action: 'delete', confirm: 'OwnerDel' }, '/api/gm/player');
    assert.equal(self.res.status, 400);
    assert.match(self.data.err, /your own account/i);
    assert.ok(uid('OwnerDel'), 'the owner cannot delete themselves');

    const staff = await call(player, owner, { id: uid('GmDel'), action: 'delete', confirm: 'GmDel' }, '/api/gm/player');
    assert.equal(staff.res.status, 400);
    assert.match(staff.data.err, /GM level/i, 'a staff account needs its level removed first');
    assert.ok(uid('GmDel'), 'the staff account survives');
  });

  await test('the username must be typed back exactly, or nothing is deleted', async () => {
    for (const confirm of [undefined, '', 'cheaterdel', 'Cheater', ' CheaterDelX ']) {
      const r = await call(player, owner, { id: CHEAT, action: 'delete', confirm }, '/api/gm/player');
      assert.equal(r.res.status, 400, 'confirm=' + JSON.stringify(confirm) + ' must be refused');
      assert.match(r.data.err, /Type the username exactly/);
    }
    assert.ok(uid('CheaterDel'), 'a mis-typed confirmation deletes nothing');
    assert.equal(count('SELECT COUNT(*) AS n FROM saves WHERE user_id=' + CHEAT), 1, 'and the save is untouched');
  });

  await test('a correct confirmation suspends the networks, then erases the account', async () => {
    const r = await call(player, owner, { id: CHEAT, action: 'delete', confirm: 'CheaterDel' }, '/api/gm/player');
    assert.equal(r.res.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.deleted, 'CheaterDel');
    assert.deepEqual(r.data.fps, [FP], 'the fingerprint was captured before the cascade');

    assert.equal(uid('CheaterDel'), undefined, 'the account row is gone');
    assert.equal(count('SELECT COUNT(*) AS n FROM saves WHERE user_id=' + CHEAT), 0, 'the save went with it');
    assert.equal(count('SELECT COUNT(*) AS n FROM save_history WHERE user_id=' + CHEAT), 0, 'so did the backup history');
    assert.equal(count('SELECT COUNT(*) AS n FROM grants WHERE user_id=' + CHEAT), 0, 'and the queued grants');
    assert.equal(count('SELECT COUNT(*) AS n FROM sessions WHERE user_id=' + CHEAT), 0, 'and every session');

    const ban = sqlite.prepare('SELECT note,created_by FROM ip_bans WHERE ip_hash=?').get(FP);
    assert.ok(ban, 'the network they cheated from stays banned');
    assert.equal(ban.created_by, 'OwnerDel');
    assert.match(ban.note, /CheaterDel/);
  });

  await test('the audit entry survives, and says what was removed', async () => {
    const ev = sqlite.prepare("SELECT actor,user_id,detail FROM events WHERE kind='gm-delete' ORDER BY id DESC").get();
    assert.ok(ev, 'the deletion is in the audit log');
    assert.equal(ev.actor, 'OwnerDel');
    assert.equal(ev.user_id, null, 'no foreign key left pointing at a deleted account');
    assert.match(ev.detail, /deleted CheaterDel/);
    assert.match(ev.detail, /saves 1/);
    assert.match(ev.detail, /history 1/);
    assert.match(ev.detail, /grants 1/);
    assert.match(ev.detail, new RegExp(FP), 'the wiped networks are named in the record');
  });

  await test('the player is gone from the console and cannot be inspected', async () => {
    const r = await call(inspect, owner, null, '/api/gm/player?id=' + CHEAT);
    assert.equal(r.res.status, 404);
  });

  await test('deleting twice is a clean 404, not a crash', async () => {
    const r = await call(player, owner, { id: CHEAT, action: 'delete', confirm: 'CheaterDel' }, '/api/gm/player');
    assert.equal(r.res.status, 404);
  });

  await test('accounts without a recorded network still delete', async () => {
    const lonely = await account('LonelyDel');
    const id = uid('LonelyDel');
    sqlite.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    const r = await call(player, owner, { id, action: 'delete', confirm: 'LonelyDel' }, '/api/gm/player');
    assert.equal(r.res.status, 200, JSON.stringify(r.data));
    assert.deepEqual(r.data.fps, []);
    assert.equal(uid('LonelyDel'), undefined);
    assert.match(r.data.note, /deleted/i);
    void lonely;
  });
} finally {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exitCode = 1;
}
