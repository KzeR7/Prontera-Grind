// Count real PBKDF2 operations on synthetic inputs, including legacy password upgrades.
import assert from 'node:assert/strict';
import { hashPassword, hashRecovery, verifyPassword, verifyRecovery, ITER } from '../../functions/_lib/auth.js';
import { freshDb, makeD1 } from '../dev_server.js';
import { onRequestPost as login } from '../../functions/api/sessions.js';
import { onRequestPost as recover } from '../../functions/api/recover.js';
const secret='ABCD-EFGH-JKMN-PQRS'; // public synthetic input, never a real recovery code
const legacy=await hashPassword(secret,1000);
const current=await hashRecovery(secret);
const subtle=crypto.subtle,original=subtle.deriveBits;
let calls=0;
subtle.deriveBits=async function(...args){calls++;return original.apply(this,args)};
try{
  let r=await verifyPassword(secret,legacy);
  assert.equal(r.ok,true);assert.match(r.upgrade,new RegExp('^pbkdf2\\$'+ITER+'\\$'));
  assert.equal(calls,2,'successful legacy password verification still upgrades its hash');
  calls=0;r=await verifyPassword('wrong',legacy);
  assert.equal(r.ok,false);assert.equal(r.upgrade,null);assert.equal(calls,1,'incorrect passwords do not upgrade');
  calls=0;assert.equal(await verifyRecovery(secret.toLowerCase(),legacy),true);
  assert.equal(calls,1,'legacy recovery verification must not compute a discarded upgrade');
  calls=0;assert.equal(await verifyRecovery('WRONG-TEST-CODE',legacy),false);
  assert.equal(calls,1,'invalid recovery code has no upgrade');
  calls=0;assert.equal(await verifyRecovery(secret,current),true);
  assert.equal(calls,1,'current recovery verification still works');
  calls=0;assert.equal(await verifyRecovery(secret,null),false);assert.equal(calls,0);
  const sqlite=freshDb();
  try{
    const password=await hashPassword('Synthetic-password-123');
    sqlite.prepare('INSERT INTO users(username,email,pass_hash,recovery_hash,gm,created_at) VALUES(?,?,?,?,?,?)')
      .run('LegacyRec','legacy@example.com',password,legacy,0,Date.now());
    const DB=makeD1(sqlite);
    const request=(path,body)=>new Request('https://game.test/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const signedIn=await login({request:request('sessions',{u:'LegacyRec',p:'Synthetic-password-123'}),env:{DB}});
    assert.equal(signedIn.status,200);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions').get().n,1);
    calls=0;
    const reset=await recover({request:request('recover',{u:'LegacyRec',email:'legacy@example.com',code:secret,p:'New-synthetic-pass-456'}),env:{DB}});
    assert.equal(reset.status,200);assert.equal(calls,3,'legacy-code recovery performs only verify, new password, new recovery hash');
    const next=await reset.json();assert.notEqual(next.recovery,secret);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions').get().n,0,'reset still revokes the old session');
    const row=sqlite.prepare("SELECT pass_hash,recovery_hash FROM users WHERE username='LegacyRec'").get();
    assert.equal((await verifyPassword('New-synthetic-pass-456',row.pass_hash)).ok,true);
    assert.equal(await verifyRecovery(secret,row.recovery_hash),false);
    assert.equal(await verifyRecovery(next.recovery,row.recovery_hash),true);
  }finally{sqlite.close()}
  console.log('PASS: legacy password upgrades retained; legacy recovery skips discarded upgrade and still rotates/revokes');
}finally{subtle.deriveBits=original;}
