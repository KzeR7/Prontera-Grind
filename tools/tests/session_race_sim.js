// Deterministic authentication races against the real handlers and SQLite, never production.
import assert from 'node:assert/strict';
import { freshDb, makeD1, start } from '../dev_server.js';
import { hashPassword } from '../../functions/_lib/auth.js';
import { onRequestPost as login } from '../../functions/api/sessions.js';
import { onRequestPost as register } from '../../functions/api/register.js';
import { setPasswordAndRevoke } from '../../functions/_lib/db.js';

const req = (path, body) => new Request('https://game.test/api/' + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const sqlite = freshDb();
try {
  const oldHash = await hashPassword('Original-password-123', 1000); // exercises hash upgrades too
  const replacement = await hashPassword('Replacement-password-123');
  sqlite.prepare('INSERT INTO users(username,email,pass_hash,gm,created_at) VALUES(?,?,?,?,?)')
    .run('ResetRace','reset@example.com',oldHash,0,Date.now());
  const real = makeD1(sqlite);
  let changed = false;
  const racing = { ...real, batch: async statements => {
    if (!changed) {
      changed = true;
      // The password was reset after verification, but before the login transaction.
      sqlite.prepare("UPDATE users SET pass_hash=? WHERE username='ResetRace'").run(replacement);
    }
    return real.batch(statements);
  } };
  const stale = await login({request:req('sessions',{u:'ResetRace',p:'Original-password-123'}),env:{DB:racing}});
  assert.equal(stale.status,401, 'a stale verified password cannot create a session');
  assert.equal(stale.headers.get('set-cookie'),null);
  assert.equal(sqlite.prepare("SELECT pass_hash FROM users WHERE username='ResetRace'").get().pass_hash,replacement,
    'a stale automatic hash upgrade cannot overwrite the newly reset password');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,0);

  const good = await login({request:req('sessions',{u:'ResetRace',p:'Replacement-password-123'}),env:{DB:real}});
  assert.equal(good.status,200, 'new password remains usable');
  const parallel = await Promise.all(Array.from({length:2}, () => login({
    request:req('sessions',{u:'ResetRace',p:'Replacement-password-123'}), env:{DB:real},
  })));
  assert.deepEqual(parallel.map(r=>r.status),[200,200]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id=(SELECT id FROM users WHERE username='ResetRace')").get().n,1,
    'concurrent sign-ins retain at most one session');

  sqlite.prepare('INSERT INTO users(username,email,pass_hash,gm,created_at) VALUES(?,?,?,?,?)')
    .run('UpgradeUser','upgrade@example.com',oldHash,0,Date.now());
  const upgraded = await login({request:req('sessions',{u:'UpgradeUser',p:'Original-password-123'}),env:{DB:real}});
  assert.equal(upgraded.status,200, 'legacy password login upgrades normally');
  assert.match(sqlite.prepare("SELECT pass_hash FROM users WHERE username='UpgradeUser'").get().pass_hash,
    /^pbkdf2\$20000\$/, 'successful legacy login raises the stored work factor');

  // If revocation fails, the owner password reset must roll back as a unit.
  sqlite.exec("CREATE TRIGGER reject_session_delete BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT,'test rollback'); END");
  await assert.rejects(() => setPasswordAndRevoke(real, 1, oldHash), /test rollback/);
  assert.equal(sqlite.prepare("SELECT pass_hash FROM users WHERE username='ResetRace'").get().pass_hash,replacement);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=1').get().n,1);
  sqlite.exec('DROP TRIGGER reject_session_delete');

  // A ban occurring after verification must prevent a new session too.
  const banRace = { ...real, batch: async statements => {
    sqlite.prepare("UPDATE users SET banned=1 WHERE username='ResetRace'").run();
    return real.batch(statements);
  } };
  const banned = await login({request:req('sessions',{u:'ResetRace',p:'Replacement-password-123'}),env:{DB:banRace}});
  assert.equal(banned.status,401);
  assert.equal(banned.headers.get('set-cookie'),null);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=1').get().n,1,
    'stale login must not revoke an existing session');

  const direct = await register({request:req('register',{u:'ProductionRule',p:'Secure-password-123',email:'normal@example.com'}),
    env:{DB:real,DEV_GM_ALL:'all'}});
  assert.equal(direct.status,201);
  assert.equal((await direct.json()).gm,0, 'an environment flag cannot grant a production account GM');
  assert.equal(sqlite.prepare("SELECT gm FROM users WHERE username='ProductionRule'").get().gm,0);
} finally { sqlite.close(); }

const preview = await start({port:0,host:'127.0.0.1',gmAll:true});
try {
  const res = await fetch(`http://127.0.0.1:${preview.port}/api/register`, {
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({u:'PreviewGM',p:'Preview-password-123',email:'preview@example.com'}),
  });
  assert.equal(res.status,201);
  assert.equal((await res.json()).gm,2, 'the isolated local preview still grants GM');
  assert.equal(preview.sqlite.prepare("SELECT gm FROM users WHERE username='PreviewGM'").get().gm,2);
} finally { await preview.close(); preview.sqlite.close(); }
console.log('PASS: stale login/reset and hash-upgrade race, concurrent sessions, ban races, atomic reset rollback, production flag isolation, local GM preview');
