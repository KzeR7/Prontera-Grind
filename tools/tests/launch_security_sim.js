// Isolated HTTP + SQLite launch security regressions. No production services or credentials.
import assert from 'node:assert/strict';
import { start, makeD1 } from '../dev_server.js';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { hashPassword, hashRecovery } from '../../functions/_lib/auth.js';
import { onRequestPost as loginHandler } from '../../functions/api/sessions.js';
import { readJson } from '../../functions/_lib/http.js';
import { hitRate } from '../../functions/_lib/db.js';
const srv = await start({port:0, host:'127.0.0.1'});
const base = `http://127.0.0.1:${srv.port}`;
const request = async (route, data, cookie, headers={}) => {
  const r = await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},body:JSON.stringify(data)});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
};
try {
  const legacy = new DatabaseSync(':memory:');
  try {
    for (const f of fs.readdirSync('migrations').filter(x=>/^000[1-6]_.*\.sql$/.test(x)).sort()) legacy.exec(fs.readFileSync('migrations/'+f,'utf8'));
    const pw=await hashPassword('Legacy-password-123'), rec=await hashRecovery('ABCD-EFGH-JKLM-NPQR');
    legacy.prepare("INSERT INTO users(username, pass_hash, recovery_hash, gm, created_at) VALUES('Legacy',?,?,2,?)").run(pw,rec,Date.now());
    legacy.exec(fs.readFileSync('migrations/0007_account_email.sql','utf8'));
    const row=legacy.prepare("SELECT email,gm FROM users WHERE username='Legacy'").get();assert.equal(row.email,null);assert.equal(row.gm,2);
    const res=await loginHandler({request:new Request('https://game.test/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({u:'Legacy',p:'Legacy-password-123'})}),env:{DB:makeD1(legacy)}});
    assert.equal(res.status,200,'existing owner can still log in after migration');
  } finally {legacy.close()}
  const [a,b] = await Promise.all([
    request('/api/register',{u:'firstuser',p:'Strong-example-123',email:'First@example.com'}),
    request('/api/register',{u:'seconduser',p:'Strong-example-123',email:'SECOND@example.com'})
  ]);
  assert.equal(a.status,201);assert.equal(b.status,201);assert.equal(a.data.gm,0);assert.equal(b.data.gm,0);
  assert.equal((await request('/api/register',{u:'noemail',p:'Strong-example-123'})).status,400);
  const duplicate=await request('/api/register',{u:'dupemail',p:'Strong-example-123',email:' first@EXAMPLE.com '});assert.equal(duplicate.status,409);
  const [d1,d2]=await Promise.all([
    request('/api/register',{u:'racer1',p:'Strong-example-123',email:'racing@example.com'}),
    request('/api/register',{u:'racer2',p:'Strong-example-123',email:'RACING@example.com'})
  ]);assert.deepEqual([d1.status,d2.status].sort(),[201,409]);
  assert.equal((await request('/api/recover',{u:'firstuser',email:'wrong@example.com',code:a.data.recovery,p:'New-strong-pass-123'})).status,400);
  const reset = await request('/api/recover',{u:'firstuser',email:'FIRST@example.com',code:a.data.recovery,p:'New-strong-pass-123'});
  assert.equal(reset.status,200);assert.notEqual(reset.data.recovery,a.data.recovery);
  assert.equal((await fetch(base+'/api/me',{headers:{Cookie:a.cookie}})).status,401);
  assert.equal((await request('/api/recover',{u:'firstuser',email:'first@example.com',code:a.data.recovery,p:'New-strong-pass-456'})).status,400);
  assert.equal((await request('/api/sessions',{u:'firstuser',p:'Strong-example-123'})).status,401);
  const login=await request('/api/sessions',{u:'firstuser',p:'New-strong-pass-123'});assert.equal(login.status,200);
  const racePayload={u:'seconduser',email:'second@example.com',code:b.data.recovery,p:'New-strong-pass-999'};
  const resets=await Promise.all([request('/api/recover',racePayload),request('/api/recover',racePayload)]);
  assert.deepEqual(resets.map(r=>r.status).sort(),[200,400]);
  assert.equal((await request('/api/sessions',{u:'firstuser',p:'New-strong-pass-123'},null,{Origin:'https://evil.example'})).status,403);
  const db=makeD1(srv.sqlite);const attempts=await Promise.all(Array.from({length:10},()=>hitRate(db,'race-test',5,60000)));
  assert.equal(attempts.filter(x=>x.ok).length,5);
  const bodyStream = new ReadableStream({start(c){c.enqueue(new Uint8Array(100));c.enqueue(new Uint8Array(100));c.close()}});
  const oversized = new Request('https://game.test/api/save',{method:'PUT',headers:{'Content-Type':'application/json'},body:bodyStream,duplex:'half'});
  await assert.rejects(()=>readJson(oversized,150),e=>e.status===413);
  const fake=await fetch(base+'/api/save',{method:'PUT',headers:{'Content-Type':'application/json',Cookie:login.cookie},body:JSON.stringify({owner:'firstuser',version:0,blob:JSON.stringify({owner:'firstuser',lv:150,kills:999999999,trial:{best:100000000,echoBoard:{day:'2026-10-28',dayDps:100000000}}})})});assert.equal(fake.status,200);
  assert.equal(srv.sqlite.prepare('SELECT COUNT(*) n FROM leaderboard_echo').get().n,0,'editable saves must not populate competitive scores');
  const board=await fetch(base+'/api/board?board=echo',{headers:{Cookie:login.cookie}});assert.equal(board.status,503);
  console.log('PASS: legacy migration/login, no public owner, unique email (including races), one-time recovery and session revocation, origin, atomic rates, streamed size cap, forged scores not ranked');
} finally { await srv.close();srv.sqlite.close(); }
