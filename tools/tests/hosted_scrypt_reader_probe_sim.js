// Exercise the hosted-probe protocol against the actual loopback app and SQLite shim.
import assert from 'node:assert/strict';
import { start } from '../dev_server.js';
import { makeCase, runProbe, safeSql, verifyInfo, verifyReadOnly, npxCliCandidates } from '../staging/hosted_scrypt_reader_probe.mjs';
const srv=await start({port:0,host:'127.0.0.1'}), base=`http://127.0.0.1:${srv.port}`;
async function exec(sql){return /^SELECT\b/i.test(sql)?srv.sqlite.prepare(sql).all():(srv.sqlite.exec(sql),[])}
async function request(route,{method='GET',data,cookie}={}){
  const headers={};if(data!==undefined)headers['Content-Type']='application/json';if(cookie)headers.Cookie=cookie;
  const r=await fetch(base+route,{method,headers,...(data!==undefined?{body:JSON.stringify(data)}:{})});
  let json;try{json=await r.json()}catch{json=null}
  return {status:r.status,data:json,cookie:(r.headers.get('set-cookie')||'').split(';')[0]};
}
try{
  assert(verifyInfo({uuid:'3a38c6fc-96a8-491d-b97b-fd536e575ca4',name:'pg-staging'}));
  assert(!verifyInfo({uuid:'50a6448b-1f12-466c-a28a-10544bedf750',name:'pg'}));
  assert(!verifyInfo({uuid:'3a38c6fc-96a8-491d-b97b-fd536e575ca4',name:'pg'}));
  srv.sqlite.prepare("INSERT INTO users(username,pass_hash,gm,created_at,email) VALUES('Sentinel','not-real',2,1,'sentinel@example.test')").run();
  assert(npxCliCandidates('/usr/local/bin/node').some(x=>x.endsWith('/lib/node_modules/npm/bin/npx-cli.js')));
  verifyReadOnly(sql=>{assert.equal(safeSql(sql),sql);return [{n:1,marker:'pg-scrypt-v1$*'}]});
  assert.throws(()=>verifyReadOnly(()=>{throw Error('test failure')}),/Read-only D1 preflight failed; no synthetic account was created/);
  assert.throws(()=>verifyReadOnly(()=>[{n:0}]),/no synthetic account was created/);
  const c=makeCase();
  for(const sql of [c.seed,c.check,c.cleanup])assert.equal(typeof safeSql(sql),'string');
  assert.throws(()=>safeSql('SELECT 1 & echo unsafe'));
  assert.throws(()=>safeSql('SELECT "unsafe"'));
  let report;
  await runProbe({exec,request,testCase:c,report:r=>{report=r}});
  assert.equal(report.cleanup,'confirmed');assert.equal(report.results.length,6);
  assert.equal(srv.sqlite.prepare("SELECT count(*) AS n FROM users WHERE username='Sentinel'").get().n,1,'unrelated owner preserved');
  assert.equal(srv.sqlite.prepare('SELECT count(*) AS n FROM users').get().n,1,'synthetic account removed');
  assert.equal(srv.sqlite.prepare('SELECT count(*) AS n FROM sessions').get().n,0,'synthetic sessions removed');
  const failure=makeCase();
  await assert.rejects(runProbe({exec,request:async()=>({status:500}),testCase:failure}),/Synthetic test failed at .*Cleanup confirmed/g);
  assert.equal(srv.sqlite.prepare('SELECT count(*) AS n FROM users').get().n,1,'failed probe also cleans synthetic account');
  assert.equal(srv.sqlite.prepare("SELECT count(*) AS n FROM users WHERE username='Sentinel'").get().n,1);
  const collision=makeCase();
  srv.sqlite.prepare('INSERT INTO users(username,email,pass_hash,gm,created_at) VALUES(?,?,?,?,?)').run(collision.username,'different@example.test','not-real',0,1);
  const rateKey='login-name:'+collision.username.toLowerCase();
  srv.sqlite.prepare('INSERT INTO rate_limits(key,count,window_start) VALUES(?,?,?)').run(rateKey,2,1);
  await assert.rejects(runProbe({exec,request,testCase:collision}),/Synthetic test failed at .*Cleanup confirmed/g);
  assert.equal(srv.sqlite.prepare('SELECT count(*) AS n FROM users WHERE username=?').get(collision.username).n,1,'colliding pre-existing user preserved');
  assert.equal(srv.sqlite.prepare('SELECT count(*) AS n FROM rate_limits WHERE key=?').get(rateKey).n,1,'colliding pre-existing rate record preserved');
  await assert.rejects(runProbe({exec:async()=>{throw Error('private SQL not for output')},request,testCase:makeCase()}),e=>{
    assert.match(e.message,/cleanup was not confirmed.*Test phase: seed; cleanup phase: execution failed/);
    assert(!e.message.includes('private SQL'));return true;
  });
  console.log('PASS: hosted-probe protocol on loopback real handlers, staging identity checks, scrypt login/recovery/board pause, guarded cleanup and failure cleanup. No hosted access.');
}finally{await srv.close();srv.sqlite.close()}
