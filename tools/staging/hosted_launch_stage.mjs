// Template for a self-contained, owner-run unverified-ranking staging package. PAYLOAD is injected
// by the local packager, never read from the owner's checkout. Never production.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAYLOAD_B64 = '__LAUNCH_PACKAGE_PAYLOAD__';
const PAYLOAD_SHA256 = '__LAUNCH_PACKAGE_SHA256__';
const BASE = '7511a03c0787ec9b8d94cfc6658570ac402dc297';
const DB_NAME = 'pg-staging', DB_ID = '3a38c6fc-96a8-491d-b97b-fd536e575ca4';
const PROJECT = 'prontera-grind-staging';
const FILES = ['index.html','gm.html','assets/shop-catalog.js','assets/shop.css','assets/shop.js','assets/friends.css','assets/friends.js','assets/social.css','assets/social.js','assets/social-rules.js','assets/social-poker.js','assets/social-scene.js',
 // v287: plaza pond fishing module + stylesheet (loaded by index.html alongside the social client).
 'assets/social-fishing.js','assets/social-fishing.css',
 'assets/ui/eclipse.css','assets/ui/mobile.css','assets/ui/mobile.js',
 'functions/_lib/db.js','functions/_lib/echo-board.js','functions/_lib/http.js','functions/_lib/friends.js',
 'functions/_lib/validate.js','functions/_lib/damage-monitor.js','functions/_lib/competition-baseline.js',
 'functions/_lib/competition-settlement.js','functions/_lib/unverified-echo.js',
 'functions/_lib/gate-binding.js','functions/_lib/shop.js','functions/api/save.js',
 'functions/api/board.js','functions/api/_middleware.js','functions/api/social.js','functions/api/friends.js',
 'functions/api/shop/checkout.js','functions/api/gm/damage.js',
  // v263: the write-pause control endpoint travels with the candidate; it 404s without the GATE binding.
  'functions/api/gate.js','migrations/0008_damage_monitoring.sql',
  'migrations/0009_competition_settlement.sql','migrations/0010_competition_baseline.sql',
  'migrations/0011_unverified_echo_launch.sql','migrations/0012_friends.sql',
  // v277: comment-only playbook; included so the packaged tree matches the repo's documented steps.
  'migrations/0013_gm_owner_name.sql',
  // v280: both now return the durable account id used by the save stamp.
  'functions/api/me.js','functions/api/sessions.js','tools/build_site.sh'];
const CONFIG = `name = "${PROJECT}"\ncompatibility_date = "2026-10-01"\npages_build_output_dir = "dist"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "${DB_NAME}"\ndatabase_id = "${DB_ID}"\n`;
const schemas = {
  damage_samples:['user_id','slot','bucket','sampled_at','map','stage','reported_total_damage','reported_echo_best'],
  damage_alerts:['user_id','kind','first_seen','last_seen','max_reported_dps','observations'],
};
// Equivalent to migration 0008: BETWEEN avoids shell metacharacters when npm
// executes Wrangler on Windows. One --command uses the D1 query API, not import.
export const DDL = `CREATE TABLE IF NOT EXISTS damage_samples (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, slot INTEGER NOT NULL CHECK(slot BETWEEN 0 AND 27), bucket INTEGER NOT NULL, sampled_at INTEGER NOT NULL, map INTEGER, stage INTEGER, reported_total_damage REAL, reported_echo_best REAL, PRIMARY KEY (user_id, slot)); CREATE TABLE IF NOT EXISTS damage_alerts (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, max_reported_dps REAL NOT NULL, observations INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (user_id, kind)); CREATE INDEX IF NOT EXISTS idx_damage_alerts_last_seen ON damage_alerts(last_seen DESC);`;

export function unpackPayload(encoded=PAYLOAD_B64,expected=PAYLOAD_SHA256){
  const compressed=Buffer.from(encoded,'base64');
  assert.equal(createHash('sha256').update(compressed).digest('hex'),expected,'Package integrity check failed');
  const files=JSON.parse(gunzipSync(compressed).toString('utf8'));
  assert.deepEqual(Object.keys(files).sort(),[...FILES].sort(),'Unexpected package contents');
  for(const v of Object.values(files))assert.equal(typeof v,'string');
  return files;
}
export function verifySchema(table,rows){
  assert.deepEqual(rows.map(r=>r.name),schemas[table],`Incompatible existing staging table ${table}`);
  const types=table==='damage_samples'?['INTEGER','INTEGER','INTEGER','INTEGER','INTEGER','INTEGER','REAL','REAL']:
    ['INTEGER','TEXT','INTEGER','INTEGER','REAL','INTEGER'];
  assert.deepEqual(rows.map(r=>String(r.type).toUpperCase()),types,`Unexpected column types in ${table}`);
  const required=table==='damage_samples'?[1,1,1,1,0,0,0,0]:[1,1,1,1,1,1];
  assert.deepEqual(rows.map(r=>r.notnull),required,`Unexpected nullability in ${table}`);
  const pk=rows.filter(r=>r.pk).sort((a,b)=>a.pk-b.pk).map(r=>r.name);
  assert.deepEqual(pk,table==='damage_samples'?['user_id','slot']:['user_id','kind'],`Unexpected primary key in ${table}`);
}
export function safeSql(sql){
  const text=sql.replace(/\s+/g,' ').trim();
  assert(/^[A-Za-z0-9_@$.*'(),;:= -]+$/.test(text),'Unsafe staging SQL');
  return text;
}
function run(command,args,{cwd,allowOutput=false}={}){
  const p=spawnSync(command,args,{cwd,encoding:'utf8',timeout:300000,maxBuffer:20*1024*1024,
    env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'}});
  if(p.error||p.status!==0)throw Error(`${path.basename(command)} failed (exit ${p.status??'unavailable'}). ${allowOutput?(p.stderr||p.stdout||'').slice(-2000):'Check staging access and tools privately.'}`);
  return p.stdout;
}
function npxCli(){
  const found=process.platform==='win32'?run('where.exe',['npx.cmd']).split(/\r?\n/).map(s=>s.trim()).filter(Boolean):[];
  const dirs=[path.dirname(process.execPath),...found.map(p=>path.dirname(p))];
  const candidates=dirs.flatMap(d=>[path.join(d,'node_modules','npm','bin','npx-cli.js'),path.resolve(d,'..','lib','node_modules','npm','bin','npx-cli.js')]);
  const result=candidates.find(p=>fs.existsSync(p));
  if(!result)throw Error('Could not find npm npx-cli.js. No staging data was changed.');
  return result;
}
// Pages deploy does not expose --config; its cwd contains only our fixed config.
function wrangler(cwd,args){const config=args[0]==='pages'?[]:['--config','wrangler.toml'];return run(process.execPath,[npxCli(),'--yes','wrangler@4.154.0',...args,...config],{cwd});}
function remote(cwd){
  function json(args){try{return JSON.parse(wrangler(cwd,args))}catch(e){throw Error('Staging Wrangler query failed: '+e.message)}}
  return {
    verify(){const d=json(['d1','info','DB','--json']);assert(d.uuid===DB_ID&&d.name===DB_NAME,'The remote database is not pg-staging. Stopped.');},
    exec(sql){const r=json(['d1','execute','DB','--remote','--json','--command',safeSql(sql)]);assert(Array.isArray(r)&&r.every(x=>x.success===true),'Staging database query failed');return r.at(-1).results||[]},
  };
}
async function request(host,route,{method='GET',data,cookie,headers:extraHeaders={}}={}){
  const headers={...extraHeaders};if(data!==undefined)headers['Content-Type']='application/json';if(cookie)headers.Cookie=cookie;
  const r=await fetch(host+route,{method,headers,redirect:'manual',signal:AbortSignal.timeout(30000),...(data!==undefined?{body:JSON.stringify(data)}:{})});
  let value=null;try{value=await r.json()}catch{}
  return {status:r.status,data:value,cookie:(r.headers.get('set-cookie')||'').split(';')[0]};
}
export function deployedUrl(output){
  const urls=output.match(/https:\/\/[a-z0-9-]+\.prontera-grind-staging\.pages\.dev\b/g)||[];
  const unique=urls.find(u=>/^https:\/\/[0-9a-f]{8}\.prontera-grind-staging\.pages\.dev$/.test(u));
  assert(unique,'Could not identify the unique staging deployment URL. Do not repeat until the staging deployment is checked.');
  return unique;
}
// The random token is stored only in the disposable staging Function and in
// memory. Its guarded read-only probe verifies the deployed Pages DB binding
// before any synthetic registration is attempted. Wrong/missing tokens do not
// query the database. The marker row is deleted immediately after the check.
export function stageCheckSource(token){
  assert(/^[0-9a-f]{64}$/.test(token));
  return `export async function onRequestGet({request,env}) {
`+
    `  if(request.headers.get('X-Damage-Stage-Token')!=='${token}')return new Response('',{status:404});
`+
    `  const row=await env.DB.prepare('SELECT COUNT(*) AS n FROM rate_limits WHERE key = ?').bind('damage-stage:${token}').first();
`+
    `  return new Response(JSON.stringify({match:row && row.n===1}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
`+
    `}
`;
}
export async function confirmBinding({db,host,token,req=request}){
  const result=await req(host,'/api/_damage_stage_check',{headers:{'X-Damage-Stage-Token':token}});
  assert.equal(result.status,200,'Could not verify the deployed staging database binding');
  assert.equal(result.data?.match,true,'The deployed Pages DB is not the verified staging database');
}

// Tests only a uniquely named synthetic account and synthetic period. Existing
// saves, accounts, and historical rankings are not modified or deleted.
export async function syntheticProbe({db,host,req=request,report=console.log,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
  const suffix=randomBytes(6).toString('hex'),name='RL'+suffix,email=name.toLowerCase()+'@example.test';
  const password='Synthetic-'+randomBytes(24).toString('hex');
  const where=`username='${name}' AND email='${email}'`;
  const count=`SELECT COUNT(*) AS n FROM users WHERE ${where};`;
  // A random 2090–2099 calendar label never overlaps today's real periods.
  const year=2090+parseInt(suffix.slice(0,2),16)%10,month=1+parseInt(suffix.slice(2,4),16)%12,day=1+parseInt(suffix.slice(4,6),16)%28;
  const key=`day:${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  assert.equal(db.exec(count)[0]?.n,0,'Synthetic account collision');
  assert.equal(db.exec(`SELECT COUNT(*) AS n FROM competition_periods WHERE period_key='${key}';`)[0]?.n,0,'Synthetic period collision');
  let attempted=false,periodCreated=false,failure,cleanup=false;
  try{
    attempted=true;
    const reg=await req(host,'/api/register',{method:'POST',data:{u:name,p:password,email}});
    assert.equal(reg.status,201,'Synthetic registration failed');assert.equal(reg.data?.gm,0);assert(reg.cookie.startsWith('pg_session='));
    const blob=JSON.stringify({owner:name,lv:1,cls:'Novice',dmg:-1,trial:{best:100000001}});
    const save=await req(host,'/api/save',{method:'PUT',cookie:reg.cookie,data:{owner:name,version:0,blob}});
    assert.equal(save.status,200,'Synthetic save failed');assert.equal(save.data?.leaderboardPending,false,'Score update pending');
    const all=await req(host,'/api/board?board=echo&period=all',{cookie:reg.cookie});
    assert.equal(all.status,200);assert.equal(all.data?.integrity,'unverified');
    assert(all.data?.entries?.some(x=>x.name===name&&x.dps===100000001),'Unverified score is missing');
    assert.equal((await req(host,'/api/gm/damage',{cookie:reg.cookie})).status,403);
    db.exec(`UPDATE users SET gm=1 WHERE ${where} AND gm=0;`);
    const users=db.exec(`SELECT id,gm FROM users WHERE ${where};`);assert.equal(users.length,1);assert.equal(users[0].gm,1);
    const userId=Number(users[0].id);assert(Number.isSafeInteger(userId)&&userId>0);
    const review=await req(host,'/api/gm/damage',{cookie:reg.cookie});assert.equal(review.status,200);
    assert.deepEqual(review.data?.alerts?.filter(a=>a.user_id===userId).map(a=>a.kind).sort(),['echo-over-100m','invalid-total-damage']);
    const staffBoard=await req(host,'/api/board?board=echo&period=all',{cookie:reg.cookie});
    assert.equal(staffBoard.status,200);assert(!staffBoard.data?.entries?.some(x=>x.name===name),'GM testing score must be hidden');
    // The same synthetic account returns to the player role for the prize-path
    // check. Staff exclusion was checked above; players must still receive prizes.
    db.exec(`UPDATE users SET gm=0 WHERE ${where} AND gm=1;`);
    // Test-only short period; real scheduled periods/configuration are untouched.
    const now=Date.now(),start=Math.floor(now/1000)*1000-5000,end=Math.ceil(now/1000)*1000+60000;
    db.exec(`INSERT INTO competition_periods(period_key,kind,ruleset,starts_at,ends_at) VALUES('${key}','daily','unverified-save-v1',${start},${end});`);
    periodCreated=true;
    db.exec(`INSERT INTO competition_scores(period_key,user_id,run_id,score,recorded_at) VALUES('${key}',${userId},'stage-${suffix}',300,${now});`);
    await wait(Math.max(0,end-Date.now()+1100));
    const results=await Promise.all([1,2,3].map(()=>req(host,'/api/board?board=echo',{cookie:reg.cookie})));
    assert(results.every(x=>x.status===200),'Settling board requests failed');
    const prizes=await req(host,'/api/grants',{cookie:reg.cookie});assert.equal(prizes.status,200);
    const g=prizes.data?.grants?.filter(x=>x.from==='Echo competition')||[];
    assert.equal(g.length,2,'Expected exactly two first-place gifts');
    assert(g.some(x=>x.payload?.resource==='refineScrolls'&&x.payload?.amount===3));
    assert(g.some(x=>x.payload?.resource==='dailyRolls'&&x.payload?.amount===2));
    assert.equal(db.exec(`SELECT COUNT(*) AS n FROM competition_prize_ledger WHERE period_key='${key}';`)[0]?.n,2);
    await req(host,'/api/board?board=echo',{cookie:reg.cookie});
    assert.equal(db.exec(`SELECT COUNT(*) AS n FROM competition_prize_ledger WHERE period_key='${key}';`)[0]?.n,2,'Repeat duplicated a prize');
    report('PASS: synthetic save, unverified ranking, staff exclusion, review flags, atomic player prizes and duplicate retries.');
  }catch(e){failure=e}
  finally{
    if(attempted)try{
      db.exec(`DELETE FROM events WHERE user_id IN (SELECT id FROM users WHERE ${where}); DELETE FROM users WHERE ${where};`);
      if(periodCreated)db.exec(`DELETE FROM competition_periods WHERE period_key='${key}';`);
      cleanup=db.exec(count)[0]?.n===0 && db.exec(`SELECT COUNT(*) AS n FROM competition_periods WHERE period_key='${key}';`)[0]?.n===0;
    }catch{}
  }
  if(!cleanup)throw Error(`Synthetic account or period cleanup was not confirmed for ${name}, ${key}. Stop and inspect staging before retrying.`);
  report('Synthetic staging account and period cleanup confirmed.');
  if(failure)throw Error('Synthetic staging test failed: '+failure.message+' Cleanup confirmed.');
}
async function main(){
  assert.equal(process.platform,'win32','This package is for the owner’s Windows setup.');
  assert.equal(process.argv.length,2,'This staging package takes no arguments.');
  const files=unpackPayload();
  const repo=path.join(os.homedir(),'Desktop','Prontera-Grind');
  assert(fs.existsSync(path.join(repo,'.git')),'Cannot find the original Desktop/Prontera-Grind checkout.');
  const bash='D:\\Git\\bin\\bash.exe';assert(fs.existsSync(bash),'Cannot find D:\\Git\\bin\\bash.exe.');
  assert.equal(run('git',['-C',repo,'rev-parse','--verify',BASE+'^{commit}']).trim(),BASE,'Expected archived staging base is not present.');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pg-launch-stage-'));
  const archive=path.join(temp,'base.tar');
  console.log('Preparing a new temporary staging copy; your existing checkouts will not be changed.');
  run('git',['-C',repo,'archive','--format=tar','--output='+archive,BASE]);
  run('tar.exe',['-xf',archive,'-C',temp]);fs.unlinkSync(archive);
  for(const [name,text] of Object.entries(files)){const dest=path.join(temp,...name.split('/'));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);}
  fs.writeFileSync(path.join(temp,'wrangler.toml'),CONFIG);
  run(bash,['tools/build_site.sh'],{cwd:temp,allowOutput:true});
  const db=remote(temp);db.verify();
  for(const table of Object.keys(schemas)){
    const info=db.exec(`PRAGMA table_info(${table});`);if(info.length)verifySchema(table,info);
  }
  db.exec(DDL);
  for(const table of Object.keys(schemas))verifySchema(table,db.exec(`PRAGMA table_info(${table});`));
  // Execute only reviewed additive files against the verified isolated DB.
  // Remote --file uses D1 import and may temporarily pause *staging* traffic.
  for(const migration of ['0009_competition_settlement.sql','0010_competition_baseline.sql','0011_unverified_echo_launch.sql','0012_friends.sql'])
    wrangler(temp,['d1','execute','DB','--remote','--file=migrations/'+migration]);
  console.log('Verified pg-staging and applied additive staging schema. Deploying staging project only...');
  const token=randomBytes(32).toString('hex'),marker=`damage-stage:${token}`;
  const probe=path.join(temp,'functions','api','_damage_stage_check.js');
  fs.writeFileSync(probe,stageCheckSource(token));
  let url,removed=false;
  try {
    db.exec(`INSERT INTO rate_limits(key,count,window_start) VALUES ('${marker}',1,0);`);
    url=deployedUrl(wrangler(temp,['pages','deploy','dist','--project-name',PROJECT,'--branch','main']));
    console.log('Staging deployment: '+url);
    await confirmBinding({db,host:url,token});
  } finally {
    try{db.exec(`DELETE FROM rate_limits WHERE key='${marker}';`);removed=db.exec(`SELECT COUNT(*) AS n FROM rate_limits WHERE key='${marker}';`)[0]?.n===0}catch{}
    if(!removed)throw Error('Temporary staging binding marker cleanup was not confirmed. Stop and check staging before retrying.');
  }
  console.log('Verified that the deployed Pages DB points to the isolated staging database.');
  await syntheticProbe({db,host:url});
  console.log('Done. No production database or project was targeted. Temporary staging copy: '+temp);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('STOP: '+String(e.message||e));process.exitCode=1});
