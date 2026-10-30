// Synthetic test of the fixed staging package and its real-handler probe. No hosted access.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { freshDb,makeD1,createApp } from '../dev_server.js';
import { syntheticProbe,unpackPayload,deployedUrl,safeSql } from '../staging/hosted_launch_stage.mjs';
const target=path.join(os.tmpdir(),'launch-package-test-'+randomUUID()+'.mjs');
try{
 const packaged=spawnSync(process.execPath,['tools/staging/package_hosted_launch.mjs',target],{encoding:'utf8'});
 assert.equal(packaged.status,0,packaged.stderr);const script=fs.readFileSync(target,'utf8');
 const encoded=script.match(/const PAYLOAD_B64 = '([^']+)'/)[1],sha=script.match(/const PAYLOAD_SHA256 = '([^']+)'/)[1];
 const payload=unpackPayload(encoded,sha);assert.equal(payload['index.html'],fs.readFileSync('index.html','utf8'));
 assert.equal(payload['functions/api/save.js'],fs.readFileSync('functions/api/save.js','utf8'));
 assert.throws(()=>unpackPayload(encoded,'bad'));assert.throws(()=>safeSql('DROP TABLE users > file'));
 assert.equal(deployedUrl('https://abcdef12.prontera-grind-staging.pages.dev'),'https://abcdef12.prontera-grind-staging.pages.dev');
 assert.throws(()=>deployedUrl('https://prontera-grind.pages.dev'));
 const sqlite=freshDb(),DB=makeD1(sqlite),app=createApp({sqlite});
 const db={exec(sql){let rows=[];for(const part of sql.split(';').map(x=>x.trim()).filter(Boolean)){
  const q=sqlite.prepare(part);if(/^(SELECT|PRAGMA)\b/i.test(part))rows=q.all();else q.run();
 }return rows}};
 const req=async (_host,route,{method='GET',data,cookie}={})=>{
  const headers={};if(data!==undefined)headers['Content-Type']='application/json';if(cookie)headers.Cookie=cookie;
  const r=await app(new Request('https://staging.test'+route,{method,headers,...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  return {status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};
 };
 try{
  await syntheticProbe({db,host:'https://staging.test',req,report:()=>{},wait:async()=>{
   // Local test only: use the DB clock to close the synthetic period immediately.
   sqlite.prepare("UPDATE competition_periods SET ends_at=? WHERE ruleset='unverified-save-v1' AND state='open'").run(Math.floor(Date.now()/1000)*1000);
  }});
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM users').get().n,0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM competition_periods').get().n,0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM grants').get().n,0);
  await assert.rejects(syntheticProbe({db,host:'https://staging.test',req:async(...a)=>a[1]==='/api/save'?{status:500}:req(...a),report:()=>{}}),/Cleanup confirmed/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM users').get().n,0);
  console.log('PASS: fixed staging package, unverified scores, review flags, synthetic payout/retry and cleanup on local real handlers');
 }finally{sqlite.close()}
}finally{fs.rmSync(target,{force:true})}
