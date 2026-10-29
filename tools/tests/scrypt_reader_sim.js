// Reader-first migration checks; all inputs and accounts are synthetic.
import assert from 'node:assert/strict';
import { hashCandidate } from '../prototypes/scrypt_passwords.mjs';
import { hashPassword, hashRecovery, verifyPassword, verifyRecovery } from '../../functions/_lib/auth.js';
import { freshDb, makeD1 } from '../dev_server.js';
import { onRequestPost as login } from '../../functions/api/sessions.js';
import { onRequestPost as recover } from '../../functions/api/recover.js';

const pass='Synthetic-password-123!',code='ABCD-EFGH-JKMN-PQRS';
const scrypt=hashCandidate(pass),scryptCode=hashCandidate(code);
assert.deepEqual(await verifyPassword(pass,scrypt),{ok:true,upgrade:null});
assert.deepEqual(await verifyPassword('wrong',scrypt),{ok:false,upgrade:null});
assert.equal(await verifyRecovery(code.toLowerCase(),scryptCode),true);
assert.equal(await verifyRecovery('wrong',scryptCode),false);
for(const malformed of [scrypt+'$',scrypt.replace(/.$/,'!'),'pg-scrypt-v1$AA$AA',scrypt.replace('pg-scrypt-v1','pg-scrypt-v2')])
  assert.deepEqual(await verifyPassword(pass,malformed),{ok:false,upgrade:null});
assert.match(await hashPassword(pass),/^pbkdf2\$20000\$/,'reader phase does not write stronger format');
assert.match(await hashRecovery(code),/^pbkdf2\$20000\$/,'reader phase does not write stronger recovery format');
const sqlite=freshDb();
try {
  sqlite.prepare('INSERT INTO users(username,email,pass_hash,recovery_hash,gm,created_at) VALUES(?,?,?,?,?,?)')
    .run('SyntheticReader','reader@example.test',scrypt,scryptCode,0,Date.now());
  const DB=makeD1(sqlite);
  const req=(route,data)=>new Request(`https://game.test/api/${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const signed=await login({request:req('sessions',{u:'SyntheticReader',p:pass}),env:{DB}});
  assert.equal(signed.status,200,'synthetic scrypt account logs in');
  assert.equal(sqlite.prepare("SELECT pass_hash FROM users WHERE username='SyntheticReader'").get().pass_hash,scrypt,'login preserves scrypt hash');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM sessions').get().n,1);
  const reset=await recover({request:req('recover',{u:'SyntheticReader',email:'reader@example.test',code,p:'Changed-synthetic-pass-456!'}),env:{DB}});
  assert.equal(reset.status,200,'synthetic scrypt recovery is accepted');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM sessions').get().n,0,'recovery revokes sessions');
  const row=sqlite.prepare("SELECT pass_hash,recovery_hash FROM users WHERE username='SyntheticReader'").get();
  // Deliberate, documented rollback limitation: this reader-only build writes PBKDF2 on reset.
  assert.match(row.pass_hash,/^pbkdf2\$20000\$/);assert.match(row.recovery_hash,/^pbkdf2\$20000\$/);
  assert.equal((await verifyPassword('Changed-synthetic-pass-456!',row.pass_hash)).ok,true);
} finally {sqlite.close()}
console.log('PASS: fixed-profile scrypt reader, malformed input, synthetic login/recovery and reader-only PBKDF2 writes.');
