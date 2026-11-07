// Synthetic test of the fixed staging package and its real-handler probe. No hosted access.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { freshDb,makeD1,createApp } from '../dev_server.js';
import { syntheticProbe,unpackPayload,deployedUrl,safeSql } from '../staging/hosted_launch_stage.mjs';
import { SANCTUARY_STAGE,sanctuaryPagesConfig,sanctuarySocialConfig,sanctuaryDeploymentUrl,verifyDeployment } from '../staging/sanctuary_hosted_stage.mjs';
const target=path.join(os.tmpdir(),'launch-package-test-'+randomUUID()+'.mjs');
try{
 // Git's Windows clean filter must accept unchanged CRLF files without
 // accepting an actual content change as the archived baseline.
 const routes=fs.readFileSync('_routes.json','utf8').replace(/\r?\n/g,'\r\n');
 const runGit=(args,input)=>spawnSync('git',args,{encoding:'utf8',input});
 const original=runGit(['rev-parse','7511a03c0787ec9b8d94cfc6658570ac402dc297:_routes.json']).stdout.trim();
 const gitArgs=['-c','core.autocrlf=true','hash-object','--path=_routes.json','--stdin'];
 const clean=runGit(gitArgs,routes);assert.equal(clean.status,0);assert.equal(clean.stdout.trim(),original,'CRLF checkout normalizes to the committed blob');
 assert.notEqual(runGit(gitArgs,routes+'actual change').stdout.trim(),original,'real edits remain distinct');
 const packaged=spawnSync(process.execPath,['tools/staging/package_hosted_launch.mjs',target],{encoding:'utf8'});
 assert.equal(packaged.status,0,packaged.stderr);const script=fs.readFileSync(target,'utf8');
 const encoded=script.match(/const PAYLOAD_B64 = '([^']+)'/)[1],sha=script.match(/const PAYLOAD_SHA256 = '([^']+)'/)[1];
 const payload=unpackPayload(encoded,sha);assert.equal(payload['index.html'],fs.readFileSync('index.html','utf8'));
 assert.equal(payload['assets/combat-audio.js'],fs.readFileSync('assets/combat-audio.js','utf8'));
 assert.equal(payload['functions/api/save.js'],fs.readFileSync('functions/api/save.js','utf8'));
 assert.throws(()=>unpackPayload(encoded,'bad'));assert.throws(()=>safeSql('DROP TABLE users > file'));
 assert.equal(deployedUrl('https://abcdef12.prontera-grind-staging.pages.dev'),'https://abcdef12.prontera-grind-staging.pages.dev');
 assert.throws(()=>deployedUrl('https://horizonhaven.pages.dev'));
 assert.throws(()=>deployedUrl('https://prontera-grind.pages.dev'));
 // Sanctuary staging is a separate, fixed-target owner launcher: reviewed code, isolated D1,
 // and a matching staging Social Worker. Importing it must not execute Wrangler or deploy anything.
 assert.equal(SANCTUARY_STAGE.commit,'fe8e7b9adc8908a3d643b826e35a1894c91ecfec');assert.equal(SANCTUARY_STAGE.branchUrl,'https://main.prontera-grind-staging.pages.dev');assert.equal(runGit(['cat-file','-e',SANCTUARY_STAGE.commit+'^{commit}']).status,0);
 const sanctuaryPages=sanctuaryPagesConfig(),sanctuarySocial=sanctuarySocialConfig();
 assert.match(sanctuaryPages,/name = "prontera-grind-staging"/);assert.match(sanctuaryPages,/database_id = "3a38c6fc-96a8-491d-b97b-fd536e575ca4"/);assert.match(sanctuaryPages,/script_name = "prontera-social-staging"/);
 assert.doesNotMatch(sanctuaryPages,/50a6448b-1f12-466c-a28a-10544bedf750|script_name = "prontera-social"\s/);assert.doesNotMatch(sanctuaryPages,/name = "horizonhaven"/);
 assert.match(sanctuarySocial,/name = "prontera-social-staging"/);assert.match(sanctuarySocial,/workers_dev = false/);assert.match(sanctuarySocial,/new_sqlite_classes = \["Social"\]/);assert.doesNotMatch(sanctuarySocial,/name = "prontera-social"\s/);
 assert.equal(sanctuaryDeploymentUrl('https://abcdef12.prontera-grind-staging.pages.dev'),'https://abcdef12.prontera-grind-staging.pages.dev');assert.throws(()=>sanctuaryDeploymentUrl('https://abcdef12.horizonhaven.pages.dev'));
 const stageHost='https://abcdef12.prontera-grind-staging.pages.dev',verifiedRoutes=[];
 await verifyDeployment(stageHost,async target=>{verifiedRoutes.push(target);if(target.endsWith('/version.txt'))return {status:200,text:async()=>SANCTUARY_STAGE.build+'\n'};if(target.endsWith('/api/social'))return {status:401};throw Error('unexpected route')});
 assert.deepEqual(verifiedRoutes,[stageHost+'/version.txt',stageHost+'/api/social']);
 await assert.rejects(verifyDeployment(stageHost,async()=>{throw Error('fetch failed')}),/\/version\.txt request failed: fetch failed/);
 await assert.rejects(verifyDeployment(stageHost,async target=>target.endsWith('/version.txt')?{status:200,text:async()=>SANCTUARY_STAGE.build}:{status:503}),/\/api\/social returned HTTP 503/);
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
