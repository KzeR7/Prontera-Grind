// Owner-run production migration, fixed target and fixed staged release only.
// Additive 0008–0011 only. NEVER reruns 0007 or Wrangler's migration runner.
// This uses D1 remote file import; production DB can be temporarily unavailable.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const NAME='pg',ID='50a6448b-1f12-466c-a28a-10544bedf750';
const RELEASE='9335e56665a2e076b9316205eff332d2483e05f2';
const BRANCH='origin/arena/a3bbb1f5-prontera-grind';
export const MIGRATIONS=[
 ['0008_damage_monitoring.sql','1f96e6826a0d78de5b46fb83f34c8551c90f3bc4e7d78fcb28c58ad31d4281a9'],
 ['0009_competition_settlement.sql','a2de7b75d82d9b718a65902efb68924474f29e09850915710e17203ca46d57f6'],
 ['0010_competition_baseline.sql','9122fb0118fbe759f7515983f2bf8929d75f602978804ea105f9960bac55a085'],
 ['0011_unverified_echo_launch.sql','50f9c51b4aa9f41e078568fe345fcbe916a86557717c1f8f25034217375734e5'],
];
export const TABLES={
 damage_samples:['user_id','slot','bucket','sampled_at','map','stage','reported_total_damage','reported_echo_best'],
 damage_alerts:['user_id','kind','first_seen','last_seen','max_reported_dps','observations'],
 competition_periods:['period_key','kind','ruleset','starts_at','ends_at','state','claim_token','closed_at'],
 competition_scores:['period_key','user_id','run_id','score','recorded_at'],
 competition_placements:['period_key','user_id','rank','score','run_id'],
 competition_prize_ledger:['id','period_key','user_id','resource','amount','created_at','grant_id'],
 competition_baselines:['user_id','save_version','save_updated_at','cutoff_at','captured_at','policy','save_blob'],
 unverified_echo_config:['singleton','starts_at','ruleset'],
};
const TRIGGERS=['competition_score_insert_window','competition_score_update_window','competition_prize_requires_settlement',
 'competition_prize_create_grant','competition_baseline_immutable'];
const INDEXES=['idx_damage_alerts_last_seen','idx_competition_scores_rank','competition_due_idx'];
const TABLE_QUERY="SELECT name FROM sqlite_master WHERE type='table';";
const TRIGGER_QUERY="SELECT name FROM sqlite_master WHERE type='trigger';";
const INDEX_QUERY="SELECT name FROM sqlite_master WHERE type='index';";
const EMAIL_INFO='PRAGMA table_info(users);',EMAIL_INDEX='PRAGMA index_list(users);',EMAIL_XINFO='PRAGMA index_xinfo(idx_users_email);';
const CONFIG_QUERY='SELECT starts_at,ruleset FROM unverified_echo_config WHERE singleton=1;';
const ALLOWED=new Set([TABLE_QUERY,TRIGGER_QUERY,INDEX_QUERY,EMAIL_INFO,EMAIL_INDEX,EMAIL_XINFO,CONFIG_QUERY,
 ...Object.keys(TABLES).map(n=>`PRAGMA table_info(${n});`)]);
export const verifyIdentity=x=>x?.name===NAME&&x?.uuid===ID;
export function checkBackup(file,now=Date.now()){
 assert(/^pg-before-launch-\d{14}-[0-9a-f]{8}\.sql$/.test(path.basename(file)),'Unexpected backup filename');
 const stat=fs.statSync(file);assert(stat.isFile()&&stat.size>0,'Backup missing or empty');
 assert(now-stat.mtimeMs>=-300000&&now-stat.mtimeMs<=2*60*60*1000,'Backup must be less than two hours old');
 let db,stage='read';try{
  const sql=fs.readFileSync(file,'utf8');assert(sql.trim());db=new DatabaseSync(':memory:');db.exec('PRAGMA temp_store=MEMORY');
  stage='restore';db.exec(sql);stage='integrity';const rows=db.prepare('PRAGMA integrity_check').all();
  assert.equal(rows.length,1);assert.equal(Object.values(rows[0])[0],'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  const tables=db.prepare(TABLE_QUERY).all().map(x=>x.name);assert(['users','saves','sessions'].every(n=>tables.includes(n)));
 }catch{throw Error('Backup check failed at '+stage+'; no account data or SQL was printed.');}finally{if(db)db.close()}
}
export function checkMigrationBytes(name,expected,bytes){
 assert(Buffer.isBuffer(bytes));assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,'Staged migration mismatch: '+name);
}
export function runMigration({db,backupCheck,loadMigration,report=console.log}){
 backupCheck();
 const files=MIGRATIONS.map(([name,hash])=>{const bytes=loadMigration(name);checkMigrationBytes(name,hash,bytes);return {name,bytes}});
 db.verify();
 const before=db.query(TABLE_QUERY).map(x=>x.name);
 assert(['users','saves','sessions'].every(n=>before.includes(n)),'Missing core tables');
 assert(!before.includes('d1_migrations'),'Migration ledger changed since backup; stop and inspect');
 assert(Object.keys(TABLES).every(n=>!before.includes(n)),'Launch table already exists; stop and inspect rather than retry');
 const priorTriggers=db.query(TRIGGER_QUERY).map(x=>x.name),priorIndexes=db.query(INDEX_QUERY).map(x=>x.name);
 assert(TRIGGERS.every(n=>!priorTriggers.includes(n))&&INDEXES.every(n=>!priorIndexes.includes(n)),
  'Launch trigger or index already exists; stop and inspect rather than retry');
 const userCols=db.query(EMAIL_INFO),idx=db.query(EMAIL_INDEX),xinfo=db.query(EMAIL_XINFO);
 assert(userCols.some(x=>x.name==='email'),'Email migration 0007 is missing');
 const emailIdx=idx.find(x=>x.name==='idx_users_email');
 assert(emailIdx&&Number(emailIdx.unique)===1&&Number(emailIdx.partial)===1&&
  xinfo.some(x=>x.name==='email'&&String(x.coll).toUpperCase()==='NOCASE'&&Number(x.key)===1),'Email index is missing or incompatible');
 let started=false;
 try {
 for(const file of files){
  report('Applying '+file.name+' to verified live pg...');
  started=true;
  try{db.apply(file.name,file.bytes)}catch{throw Error('Import of '+file.name+' failed or timed out and may be partial. Do NOT retry or merge until live schema is inspected.');}
 }
 const after=db.query(TABLE_QUERY).map(x=>x.name);
 assert(Object.keys(TABLES).every(n=>after.includes(n)),'Post-migration table check failed; do not merge');
 for(const [name,expected] of Object.entries(TABLES))assert.deepEqual(db.query(`PRAGMA table_info(${name});`).map(x=>x.name),expected,'Unexpected columns in '+name);
 const triggers=db.query(TRIGGER_QUERY).map(x=>x.name),indexes=db.query(INDEX_QUERY).map(x=>x.name);
 assert(TRIGGERS.every(n=>triggers.includes(n)),'Post-migration trigger check failed; do not merge');
 assert(INDEXES.every(n=>indexes.includes(n)),'Post-migration index check failed; do not merge');
 const config=db.query(CONFIG_QUERY);assert.equal(config.length,1);assert.equal(Number(config[0].starts_at),0);
 assert.equal(config[0].ruleset,'unverified-save-v1','Unexpected launch config');
 }catch(e){
  if(started)throw Error('Migration or postcheck failed; live state may be partial or complete. Do NOT retry or merge until inspected. '+String(e.message||''));
  throw e;
 }
 report('PASS: verified live pg; 0008–0011 applied and schema checked. 0007 was not rerun. No historical payouts were triggered.');
}
function run(command,args,cwd,{binary=false}={}){
 const p=spawnSync(command,args,{cwd,...(binary?{}:{encoding:'utf8'}),timeout:300000,maxBuffer:20*1024*1024,
  env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'}});
 if(p.error||p.status!==0)throw Error('Command failed or timed out; details suppressed to protect private data.');return p.stdout;
}
function npxCli(){
 let found=[];if(process.platform==='win32')found=run('where.exe',['npx.cmd'],process.cwd()).split(/\r?\n/).filter(Boolean);
 const dirs=[path.dirname(process.execPath),...found.map(p=>path.dirname(p.trim()))];
 const result=dirs.flatMap(d=>[path.join(d,'node_modules','npm','bin','npx-cli.js'),path.resolve(d,'..','lib','node_modules','npm','bin','npx-cli.js')]).find(p=>fs.existsSync(p));
 if(!result)throw Error('Could not locate npm npx-cli.js; no live operation performed');return result;
}
function createRemote(temp){
 fs.writeFileSync(path.join(temp,'wrangler.jsonc'),JSON.stringify({name:'pg-live-migration',compatibility_date:'2026-10-01',
  d1_databases:[{binding:'DB',database_name:NAME,database_id:ID}]},null,2));
 const cli=npxCli();const wrangler=args=>run(process.execPath,[cli,'--yes','wrangler@4.154.0',...args,'--config','wrangler.jsonc'],temp);
 const json=args=>{try{return JSON.parse(wrangler(args))}catch{throw Error('Live metadata query failed; details suppressed')}};
 return {
  verify(){assert(verifyIdentity(json(['d1','info','DB','--json'])),'Live database ID mismatch');},
  query(sql){assert(ALLOWED.has(sql),'Unexpected SQL refused');const rows=json(['d1','execute','DB','--remote','--json','--command',sql]);
   assert(Array.isArray(rows)&&rows.every(x=>x.success===true),'Schema query failed');return rows.at(-1).results||[];},
  apply(name,bytes){assert(MIGRATIONS.some(x=>x[0]===name),'Unexpected migration refused');
   fs.writeFileSync(path.join(temp,name),bytes,{flag:'wx'});
   wrangler(['d1','execute','DB','--remote','--yes','--file='+name]);},
 };
}
function main(){
 assert.equal(process.platform,'win32','This fixed migration is for the owner Windows setup');
 assert.equal(process.argv.length,3,'Provide only the name of the recent backup file');
 const filename=process.argv[2];assert(/^pg-before-launch-\d{14}-[0-9a-f]{8}\.sql$/.test(filename),'Unexpected backup filename');
 const backup=path.join(os.homedir(),'Desktop','HH Save',filename),repo=path.join(os.homedir(),'Desktop','Prontera-Grind');
 assert(fs.existsSync(path.join(repo,'.git')),'Cannot find the original repository');
 // The owner fetched the PR before downloading this script. Fail if runtime
 // code differs from the exact version that passed the hosted staging probe.
 run('git',['-C',repo,'diff','--quiet',RELEASE,BRANCH,'--','index.html','gm.html','functions','migrations','assets','_routes.json','tools/build_site.sh'],repo);
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pg-live-migration-'));
 try{
  const db=createRemote(temp);
  console.log('Checking the private backup, live database identity, and staged migration hashes. Production file imports may briefly interrupt service.');
  runMigration({db,backupCheck:()=>checkBackup(backup),loadMigration:name=>
   run('git',['-C',repo,'show',RELEASE+':migrations/'+name],repo,{binary:true})});
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 try{main()}catch(e){console.error('STOP: '+String(e.message||'Live migration failed'));process.exitCode=1}
