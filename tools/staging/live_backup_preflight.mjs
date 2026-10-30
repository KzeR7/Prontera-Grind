// Owner-run backup and READ-ONLY schema inspection of the fixed production D1.
// No SQL is sent from the backup file to Cloudflare, no migration is executed,
// and no account, hash, email, save, cookie or recovery code is printed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const DB_NAME='pg',DB_ID='50a6448b-1f12-466c-a28a-10544bedf750';
export const verifyInfo=info=>info?.name===DB_NAME&&info?.uuid===DB_ID;
const KNOWN=['damage_samples','damage_alerts','competition_periods','competition_scores','competition_placements',
 'competition_prize_ledger','competition_baselines','unverified_echo_config'];
export function validateExport(file){
 let db,stage='read';
 try {
  const text=fs.readFileSync(file,'utf8');if(!text.trim())throw Error('empty');
  db=new DatabaseSync(':memory:');db.exec('PRAGMA temp_store=MEMORY');stage='restore';db.exec(text);
  stage='integrity';const checks=db.prepare('PRAGMA integrity_check').all();
  assert.equal(checks.length,1);assert.equal(Object.values(checks[0])[0],'ok');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
  assert(['users','saves','sessions'].every(x=>tables.includes(x)));
  return {integrity:'ok',foreignKeys:'ok',coreTables:'present'};
 }catch{throw Error('Backup verification failed at '+stage+'; no SQL or account data was printed. Keep the backup private and stop.');}
 finally{if(db)db.close()}
}
export function describeSchema({tables,columns,indexes,indexColumns,ledger}){
 assert(Array.isArray(tables)&&Array.isArray(columns)&&Array.isArray(indexes)&&Array.isArray(indexColumns));
 assert(['users','saves','sessions'].every(t=>tables.some(x=>x.name===t)),'Core tables are missing');
 const email=columns.some(x=>x.name==='email');
 const idx=indexes.find(x=>x.name==='idx_users_email');
 const uniqueEmail=Boolean(idx&&Number(idx.unique)===1&&Number(idx.partial)===1&&
  indexColumns.some(x=>x.name==='email'&&String(x.coll).toUpperCase()==='NOCASE'&&Number(x.key)===1));
 const known=KNOWN.filter(name=>tables.some(x=>x.name===name));
 const migrationNames=Array.isArray(ledger)?ledger.map(x=>x.name).filter(x=>typeof x==='string'&&/^\d{4}_[A-Za-z0-9_]+\.sql$/.test(x)):null;
 return {emailColumn:email?'present':'absent',uniqueEmailIndex:uniqueEmail?'present':'absent or incompatible',
  migrationLedger:migrationNames,otherMigrationCount:Array.isArray(ledger)?ledger.length-migrationNames.length:null,
  launchTablesAlreadyPresent:known};
}
function run(command,args,cwd){
 const p=spawnSync(command,args,{cwd,encoding:'utf8',timeout:300000,maxBuffer:20*1024*1024,
  env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'}});
 if(p.error||p.status!==0)throw Error('Wrangler '+args.slice(-5, -3).join(' ')+' failed or timed out. Stop; no SQL or credentials were printed.');
 return p.stdout;
}
function npxCli(){
 let found=[];
 if(process.platform==='win32')found=run('where.exe',['npx.cmd'],process.cwd()).split(/\r?\n/).filter(Boolean);
 const dirs=[path.dirname(process.execPath),...found.map(p=>path.dirname(p.trim()))];
 const result=dirs.flatMap(d=>[path.join(d,'node_modules','npm','bin','npx-cli.js'),path.resolve(d,'..','lib','node_modules','npm','bin','npx-cli.js')]).find(p=>fs.existsSync(p));
 if(!result)throw Error('Could not locate npm npx-cli.js; no live operation was performed.');return result;
}
export function createRemote(temp){
 fs.writeFileSync(path.join(temp,'wrangler.jsonc'),JSON.stringify({name:'pg-live-backup-preflight',compatibility_date:'2026-10-01',
  d1_databases:[{binding:'DB',database_name:DB_NAME,database_id:DB_ID}]},null,2));
 const cli=npxCli();
 const wrangler=args=>run(process.execPath,[cli,'--yes','wrangler@4.154.0',...args,'--config','wrangler.jsonc'],temp);
 const json=args=>{let out;try{out=JSON.parse(wrangler(args))}catch{throw Error('Live database preflight query failed; no details printed.')}return out};
 return {
  verify(){assert(verifyInfo(json(['d1','info','DB','--json'])),'Database identity mismatch; stopped');},
  export(){wrangler(['d1','export','DB','--remote','--skip-confirmation','--output=live-backup.sql']);
   const file=path.join(temp,'live-backup.sql');assert(fs.statSync(file).size>0,'Backup file is empty');return file;},
  query(sql){
   // Only fixed schema-inspection queries, never caller-supplied SQL.
   assert(READS.includes(sql),'Unexpected SQL refused');
   const out=json(['d1','execute','DB','--remote','--json','--command',sql]);
   assert(Array.isArray(out)&&out.every(x=>x.success===true),'Read-only schema query failed');return out.at(-1).results||[];
  },
 };
}
const READS=["SELECT name FROM sqlite_master WHERE type='table';",'PRAGMA table_info(users);','PRAGMA index_list(users);',
 'PRAGMA index_xinfo(idx_users_email);','SELECT name FROM d1_migrations ORDER BY id;'];
export function runPreflight({db,copyBackup,report=console.log}){
 db.verify();
 const source=db.export();const saved=copyBackup(source);const integrity=validateExport(saved);
 const tables=db.query(READS[0]),columns=db.query(READS[1]),indexes=db.query(READS[2]);
 const indexColumns=indexes.some(x=>x.name==='idx_users_email')?db.query(READS[3]):[];
 const ledger=tables.some(x=>x.name==='d1_migrations')?db.query(READS[4]):null;
 const schema=describeSchema({tables,columns,indexes,indexColumns,ledger});
 const result={database:'pg (verified ID)',backupFile:saved,backupCheck:integrity,...schema};
 report(JSON.stringify(result,null,2));
 return result;
}
function main(){
 assert.equal(process.platform,'win32','This fixed preflight is for the owner Windows setup.');
 assert.equal(process.argv.length,2,'This preflight takes no arguments.');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pg-live-backup-'));
 try{
  const db=createRemote(temp),folder=path.join(os.homedir(),'Desktop','HH Save');fs.mkdirSync(folder,{recursive:true});
  console.log('Verifying the live database and exporting a private backup. Export can briefly affect database availability. No schema changes will be made.');
  runPreflight({db,copyBackup:source=>{
   const name='pg-before-launch-'+new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14)+'-'+randomBytes(4).toString('hex')+'.sql';
   const dest=path.join(folder,name);fs.copyFileSync(source,dest,fs.constants.COPYFILE_EXCL);return dest;
  }});
  console.log('PASS: backup saved and verified in memory; schema inspection complete. No migration was run. Keep the SQL file private.');
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 try{main()}catch(e){console.error('STOP: '+String(e.message||'Backup preflight failed.'));process.exitCode=1}
