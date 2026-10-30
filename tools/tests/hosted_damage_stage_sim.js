// Local-only safety checks for the owner-run staging package. Never contacts Cloudflare.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { freshDb,makeD1,createApp } from '../dev_server.js';
import { DDL,unpackPayload,verifySchema,safeSql,deployedUrl,stageCheckSource,confirmBinding,syntheticProbe } from '../staging/hosted_damage_stage.mjs';
const names=['index.html','gm.html','functions/_lib/db.js','functions/_lib/damage-monitor.js','functions/api/save.js','functions/api/gm/damage.js','migrations/0008_damage_monitoring.sql'];
const bundle=Object.fromEntries(names.map(p=>[p,fs.readFileSync(p,'utf8')]));
const zipped=gzipSync(Buffer.from(JSON.stringify(bundle))),digest=createHash('sha256').update(zipped).digest('hex');
assert.deepEqual(unpackPayload(zipped.toString('base64'),digest),bundle);
const retired=spawnSync(process.execPath,['tools/staging/package_hosted_damage.mjs','retired-do-not-create.mjs'],{encoding:'utf8'});
assert.notEqual(retired.status,0);assert.match(retired.stderr,/historic damage-only package is retired/);assert.equal(fs.existsSync('retired-do-not-create.mjs'),false);
assert.throws(()=>unpackPayload(zipped.toString('base64'),'bad'));
assert.throws(()=>safeSql('DROP TABLE users > file'));assert.equal(safeSql('SELECT  1;'),'SELECT 1;');
assert.equal(deployedUrl('Deployment complete! https://abcdef12.prontera-grind-staging.pages.dev'),'https://abcdef12.prontera-grind-staging.pages.dev');
assert.throws(()=>deployedUrl('https://prontera-grind.pages.dev'));assert.throws(()=>deployedUrl('https://branch.prontera-grind-staging.pages.dev'));
// Same schema and constraints as migration 0008, using the Windows-safe DDL.
const scratch=new DatabaseSync(':memory:');scratch.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id INTEGER PRIMARY KEY);');
scratch.exec(safeSql(DDL));for(const name of ['damage_samples','damage_alerts'])verifySchema(name,scratch.prepare(`PRAGMA table_info(${name})`).all());
scratch.exec('INSERT INTO users(id) VALUES(1)');
assert.throws(()=>scratch.exec('INSERT INTO damage_samples(user_id,slot,bucket,sampled_at) VALUES(1,28,0,0)'));
scratch.exec(safeSql(DDL));scratch.close();
const sqlite=freshDb(), DB=makeD1(sqlite),app=createApp({sqlite});
const db={exec(sql){let rows=[];for(const part of sql.split(';').map(x=>x.trim()).filter(Boolean)){
 const q=sqlite.prepare(part);if(/^(SELECT|PRAGMA)\b/i.test(part))rows=q.all();else q.run();
}return rows}};
try {
 for(const name of ['damage_samples','damage_alerts'])verifySchema(name,db.exec(`PRAGMA table_info(${name});`));
 assert.throws(()=>verifySchema('damage_samples',[]));
 const token='a'.repeat(64);sqlite.prepare('INSERT INTO rate_limits(key,count,window_start) VALUES(?,?,?)').run('damage-stage:'+token,1,0);
 const mod=await import('data:text/javascript;base64,'+Buffer.from(stageCheckSource(token)).toString('base64'));
 const ask=async (_host,_route,{headers={}}={})=>{const r=await mod.onRequestGet({request:new Request('https://staging.test/',{headers}),env:{DB}});return {status:r.status,data:r.status===200?await r.json():null}};
 assert.equal((await ask('', '', {})).status,404,'random token required before database read');
 await confirmBinding({db,host:'https://staging.test',token,req:ask});
 sqlite.prepare('DELETE FROM rate_limits WHERE key=?').run('damage-stage:'+token);
 await assert.rejects(confirmBinding({db,host:'https://staging.test',token,req:ask}));
 const req=async (_host,route,{method='GET',data,cookie}={})=>{
   // The retired template targeted a historical paused-board archive, whereas
   // this disposable router is the new unverified build. Stub ONLY that old
   // board response; its actual historic hosted result was recorded separately.
   if(route==='/api/board?board=echo')return {status:503,data:{err:'historical paused board'}};
   const headers={};if(data!==undefined)headers['Content-Type']='application/json';if(cookie)headers.Cookie=cookie;
   const r=await app(new Request('https://staging.test'+route,{method,headers,...(data!==undefined?{body:JSON.stringify(data)}:{})}));
   return {status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};
 };
 await syntheticProbe({db,host:'https://staging.test',req,report:()=>{}});
 assert.equal(sqlite.prepare('SELECT count(*) n FROM users').get().n,0);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM damage_alerts').get().n,0);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM damage_samples').get().n,0);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM events').get().n,0);
 const failingReq=async (host,route,opt)=>route==='/api/save'?{status:500}:req(host,route,opt);
 await assert.rejects(syntheticProbe({db,host:'https://staging.test',req:failingReq,report:()=>{}}),/Cleanup confirmed/);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM users').get().n,0,'cleanup runs on failed probes');
 console.log('PASS: retired-package guard; historical template binding preflight, synthetic GM review and cleanup (board stubbed, local only)');
} finally {sqlite.close()}
