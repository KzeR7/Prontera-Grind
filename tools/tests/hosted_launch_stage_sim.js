// Synthetic test of the fixed staging package and its real-handler probe. No hosted access.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { freshDb,makeD1,createApp } from '../dev_server.js';
import { syntheticProbe,unpackPayload,decodeOverlayFile,deployedUrl,safeSql } from '../staging/hosted_launch_stage.mjs';
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
 // A new unlisted runtime asset must still fail closed, not silently ship from an old archive.
 const unlisted='assets/__stage_guard_'+randomUUID()+'.txt';
 try{
  fs.writeFileSync(unlisted,'synthetic unlisted runtime');
  const denied=spawnSync(process.execPath,['tools/staging/package_hosted_launch.mjs',target],{encoding:'utf8'});
  assert.notEqual(denied.status,0,'unlisted runtime file must stop packaging');
  assert.ok(denied.stderr.includes('Unpackaged runtime change: '+unlisted),'guard identifies the exact unlisted file');
 }finally{fs.rmSync(unlisted,{force:true})}
 const packaged=spawnSync(process.execPath,['tools/staging/package_hosted_launch.mjs',target],{encoding:'utf8'});
 assert.equal(packaged.status,0,packaged.stderr);const script=fs.readFileSync(target,'utf8');
 const encoded=script.match(/const PAYLOAD_B64 = '([^']+)'/)[1],sha=script.match(/const PAYLOAD_SHA256 = '([^']+)'/)[1];
 const payload=unpackPayload(encoded,sha);assert.equal(payload['index.html'],fs.readFileSync('index.html','utf8'));
 for(const file of ['assets/adventure-guide.css','assets/adventure-guide.js'])assert.equal(payload[file],fs.readFileSync(file,'utf8'));
 assert.equal(payload['assets/combat-audio.js'],fs.readFileSync('assets/combat-audio.js','utf8'));
 assert.equal(payload['functions/api/save.js'],fs.readFileSync('functions/api/save.js','utf8'));
 assert.equal(payload['tools/optimize_delivery.js'],fs.readFileSync('tools/optimize_delivery.js','utf8'),'staging build must run the matching delivery optimizer');
 for(const rel of ['tools/vendor/acorn/acorn.js','tools/vendor/acorn/LICENSE',...fs.readdirSync('assets/expanded-fx').map(n=>'assets/expanded-fx/'+n)]){
  const raw=fs.readFileSync(rel),text=payload[rel];assert.equal(typeof text,'string','missing staging dependency '+rel);
  assert.ok((text.startsWith('base64:')?Buffer.from(text.slice(7),'base64'):Buffer.from(text)).equals(raw),'staging dependency changed: '+rel);
 }
 for(const name of fs.readdirSync('assets/ro_icons')){
  const rel='assets/ro_icons/'+name;
  assert.equal(payload[rel],'base64:'+fs.readFileSync(rel).toString('base64'),'Class Tree archive must preserve '+name);
 }
 // v360: the binary centerpiece must ride the package as base64, byte for byte - an utf8
 // detour would silently corrupt the glTF container.
 assert.equal(payload['assets/Fountainfile/Prontera_Grand_Aetherwell.glb'],'base64:'+fs.readFileSync('assets/Fountainfile/Prontera_Grand_Aetherwell.glb').toString('base64'));
 // v415: the same must hold for the JPEG atlas. It was not on the binary list, so it was packed as
 // utf8 and silently re-encoded (252 KB staged from a 140 KB source) - the hub texture was corrupt
 // in every rehearsal and nothing failed. Check the bytes, not just the prefix.
 assert.equal(payload['assets/atlas/fountain-plaza.jpg'],'base64:'+fs.readFileSync('assets/atlas/fountain-plaza.jpg').toString('base64'));
 // v415: the staged copy runs tools/build_site.sh, and the overlay has to satisfy its `require`
 // lines or the owner's rehearsal stops at "MISSING ... the game would load broken from this
 // build". These are exactly the files that were missing while the overlay was a hand-written list.
 for(const required of ['assets/sprite-pack-x/index.js','assets/ro-fx/index.js','assets/signature-fx.js',
  'assets/wardrobe.js','assets/expanded-jobs.js','assets/wardrobe/expanded/v1/catalog.json'])
  assert.equal(typeof payload[required],'string','overlay must carry the build dependency '+required);
 // The per-file packs the client fetches by URL after load: each index names its files, and a
 // staged site that serves the index but not the files renders a blank class or a missing effect.
 // Derived from the indexes rather than counts, so new art is covered automatically.
 {
  const readIndex=rel=>JSON.parse(fs.readFileSync(rel,'utf8').replace(/^[\s\S]*?=\{/,'{').replace(/;?\s*$/,''));
  for(const rec of Object.values(readIndex('assets/sprite-pack-x/index.js').bodies))
   assert.equal(typeof payload['assets/sprite-pack-x/'+rec.file],'string','uncarried sprite body '+rec.file);
  for(const book of Object.values(readIndex('assets/ro-fx/index.js').books))
   assert.equal(typeof payload['assets/ro-fx/'+book.file],'string','uncarried effect flipbook '+book.file);
  for(const rel of Object.values(JSON.parse(fs.readFileSync('assets/social/fish/MANIFEST.json','utf8'))))
   assert.equal(typeof payload[rel],'string','uncarried pond fish '+rel);
  // The three MVP fish the old hand list had missed, called out so the regression is legible.
  for(const name of ['mvp_dreadclaw','mvp_stormcoil','mvp_volthorn'])
   assert.equal(typeof payload['assets/social/fish/'+name+'.png'],'string','uncarried MVP fish '+name);
  for(const rel of ['assets/mastery-titles.js','assets/player-buffs.js','assets/skill-icons-expanded.js','assets/social-title-art.js','assets/ui/mastery-titles.css'])
   assert.equal(typeof payload[rel],'string','uncarried mastery/title entry point '+rel);
  for(const dir of ['assets/expanded-skill-icons/','assets/title-symbols/']){
   const catalog=JSON.parse(fs.readFileSync(dir+'catalog.json','utf8'));
   assert.equal(typeof payload[dir+'catalog.json'],'string');
   for(const name of Object.keys(catalog.assets))assert.equal(payload[dir+name],'base64:'+fs.readFileSync(dir+name).toString('base64'),'uncarried title/skill art '+name);
  }
  const art=JSON.parse(fs.readFileSync('assets/social-title-art.js','utf8').match(/const ART=(\{[^\n]*\});\n/)[1]);
  for(const rel of [...Object.values(art.digi),...Object.values(art.fishing)])
   assert.equal(payload[rel],'base64:'+fs.readFileSync(rel).toString('base64'),'uncarried Social title art '+rel);
 }
 // Dynamic refine audio and plaza emotions are not discoverable from static HTML tags.
 const audio=JSON.parse(fs.readFileSync('assets/audio/refine/manifest.json','utf8'));
 for(const name of ['manifest.json',...audio.assets.map(a=>a.file)]){
  const rel='assets/audio/refine/'+name,encodedFile=payload[rel];
  assert.equal(typeof encodedFile,'string','missing refine audio '+rel);
  const decoded=decodeOverlayFile(rel,encodedFile);
  assert.ok(Buffer.from(decoded).equals(fs.readFileSync(rel)),'staged refine audio differs '+rel);
  if(name.endsWith('.wav'))assert.ok(Buffer.isBuffer(decoded),'WAV is decoded as binary');
 }
 for(const name of fs.readdirSync('assets/social/emotions')){
  const rel='assets/social/emotions/'+name;
  assert.ok(Buffer.from(decodeOverlayFile(rel,payload[rel])).equals(fs.readFileSync(rel)),'staged emotion differs '+rel);
 }
 assert.ok(Buffer.from(decodeOverlayFile('assets/refine-fx/title-lightning.webp',payload['assets/refine-fx/title-lightning.webp'])).equals(fs.readFileSync('assets/refine-fx/title-lightning.webp')));
 // And every packaged file must survive the round trip byte for byte - this is what catches a new
 // binary type being decoded as text before it reaches the owner's rehearsal.
 for(const [name,text] of Object.entries(payload)){
  const raw=fs.readFileSync(name);
  const back=text.startsWith('base64:')?Buffer.from(text.slice(7),'base64'):Buffer.from(text,'utf8');
  assert.ok(back.equals(raw),'package round trip changed bytes: '+name);
 }
 assert.equal(payload['assets/vendor/GLTFLoader.r128.js'],fs.readFileSync('assets/vendor/GLTFLoader.r128.js','utf8'));
 assert.throws(()=>unpackPayload(encoded,'bad'));assert.throws(()=>safeSql('DROP TABLE users > file'));
 assert.equal(deployedUrl('https://abcdef12.prontera-grind-staging.pages.dev'),'https://abcdef12.prontera-grind-staging.pages.dev');
 assert.throws(()=>deployedUrl('https://horizonhaven.pages.dev'));
 assert.throws(()=>deployedUrl('https://prontera-grind.pages.dev'));
 // Sanctuary staging is a separate, fixed-target owner launcher: reviewed code, isolated D1,
 // and a matching staging Social Worker. Importing it must not execute Wrangler or deploy anything.
 assert.equal(SANCTUARY_STAGE.commit,'adf4f99eef86aa7af3bc5effdb84cf362716cde3');assert.equal(SANCTUARY_STAGE.branchUrl,'https://main.prontera-grind-staging.pages.dev');assert.equal(runGit(['cat-file','-e',SANCTUARY_STAGE.commit+'^{commit}']).status,0);
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
 // v360 regression: the owner's real verify died with UND_ERR_INVALID_ARG because the socket
 // probe sends `Upgrade: websocket`, which undici's fetch rejects as a forbidden header while
 // the Function needs it past its 426 gate. Exercise the DEFAULT transport (not a stub) against
 // a live local server: fetch for /version.txt, raw node:http for the upgrade probe.
 {
  const seenUpgrade=[];
  const okSrv=http.createServer((req,res)=>{ if(req.url==='/version.txt'){res.writeHead(200);res.end(SANCTUARY_STAGE.build+'\n')} else if(req.url==='/api/social'){seenUpgrade.push(req.headers.upgrade);res.writeHead(401);res.end('no session')} else {res.writeHead(404);res.end()} });
  await new Promise(r=>okSrv.listen(0,'127.0.0.1',r));
  await verifyDeployment('http://127.0.0.1:'+okSrv.address().port);
  assert.deepEqual(seenUpgrade,['websocket'],'the socket probe must carry the Upgrade header');
  const badSrv=http.createServer((req,res)=>{ if(req.url==='/version.txt'){res.writeHead(200);res.end(SANCTUARY_STAGE.build+'\n')} else {res.writeHead(503);res.end('no binding')} });
  await new Promise(r=>badSrv.listen(0,'127.0.0.1',r));
  await assert.rejects(verifyDeployment('http://127.0.0.1:'+badSrv.address().port),/\/api\/social returned HTTP 503/);
  okSrv.close();badSrv.close();
 }
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
