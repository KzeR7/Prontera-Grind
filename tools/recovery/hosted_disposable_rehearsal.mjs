// Owner-run HOSTED REHEARSAL ONLY. Creates and deletes one uniquely named D1
// containing synthetic data. It has no production or staging bindings and
// refuses either known real database ID. Never uses account/save data.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const FORBIDDEN = new Set(['50a6448b-1f12-466c-a28a-10544bedf750','3a38c6fc-96a8-491d-b97b-fd536e575ca4']);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const BOOKMARK=/^[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{32}$/i;
export const validName=n=>typeof n==='string'&&/^pg-recovery-drill-[a-f0-9]{24}$/.test(n);
export function verifyTarget(info,name,expectedUuid){
 assert(validName(name),'Unsafe drill name');
 assert(info?.name===name&&typeof info.uuid==='string'&&UUID.test(info.uuid),'Drill database identity could not be verified');
 assert(!FORBIDDEN.has(info.uuid.toLowerCase()),'Real database refused');
 if(expectedUuid)assert.equal(info.uuid.toLowerCase(),expectedUuid.toLowerCase(),'Drill UUID changed');
 return info.uuid.toLowerCase();
}
const bookmark=x=>{assert(typeof x==='string'&&BOOKMARK.test(x),'Invalid bookmark');return x};
// Injected driver is exercised with synthetic mocks; real driver has fixed SQL.
export function runDrill(db,name,report=console.log){
 assert(validName(name),'Unsafe drill name');
 let id=null, completed=false, cleanup='not confirmed';
 try {
  report('Creating temporary synthetic database '+name+'...');
  db.create(name); // A failed or timed-out create can leave an orphan; print its name.
  id=verifyTarget(db.info(name),name);
  db.bind(name,id);
  report('Temporary database identity verified; testing synthetic data...');
  const guard=()=>verifyTarget(db.info(name),name,id);
  guard();db.seed();guard();assert.equal(db.read(),1,'Synthetic seed check failed');
  guard();const point=bookmark(db.bookmark());
  guard();db.change();guard();assert.equal(db.read(),2,'Synthetic change check failed');
  guard();report('Restoring the temporary synthetic database...');const result=db.restore(point);
  assert.equal(bookmark(result.bookmark),point,'Unexpected restored bookmark');bookmark(result.previous_bookmark);
  guard();assert.equal(db.read(),1,'Synthetic rollback did not restore the earlier value');
  completed=true;
 } finally {
  if(id){
   try{verifyTarget(db.info(name),name,id);db.remove(name);assert.equal(db.isGone(name,id),true);cleanup='confirmed'}catch{cleanup='unconfirmed'}
  }
  report('Temporary database cleanup: '+cleanup+'.');
 }
 assert(completed&&cleanup==='confirmed','Drill or cleanup unconfirmed; inspect the printed temporary database name. Do not retry blindly.');
 report('PASS: hosted synthetic Time Travel restore and cleanup. No real game data or production restore was used.');
}
function command(program,args,cwd){
 const p=spawnSync(program,args,{cwd,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,
  env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'}});
 if(p.error||p.status!==0)throw Error('Cloudflare command failed or timed out; details suppressed. Inspect the temporary name before retrying.');return p.stdout;
}
function npxCli(){
 let found=[];if(process.platform==='win32')found=command('where.exe',['npx.cmd'],process.cwd()).split(/\r?\n/).filter(Boolean);
 const dirs=[path.dirname(process.execPath),...found.map(x=>path.dirname(x.trim()))];
 const file=dirs.flatMap(d=>[path.join(d,'node_modules','npm','bin','npx-cli.js'),path.resolve(d,'..','lib','node_modules','npm','bin','npx-cli.js')]).find(x=>fs.existsSync(x));
 assert(file,'Cannot locate npm npx-cli.js');return file;
}
export function createDrillRemote(temp,name,options={}){
 assert(validName(name));
 const cli=options.cli||npxCli(),invoke=options.invoke||command,config=path.join(temp,'wrangler.jsonc');
 const writeConfig=bindings=>fs.writeFileSync(config,JSON.stringify({name:'pg-recovery-drill',compatibility_date:'2026-10-01',d1_databases:bindings}));
 writeConfig([]);
 const wrangler=args=>invoke(process.execPath,[cli,'--yes','wrangler@4.154.0',...args,'--config','wrangler.jsonc'],temp);
 const json=args=>JSON.parse(wrangler(args));
 const sql=sql=>{const result=json(['d1','execute','TARGET','--remote','--json','--command',sql]);assert(Array.isArray(result)&&result.every(x=>x.success===true));return result.at(-1).results||[]};
 return {
  create(n){assert.equal(n,name);wrangler(['d1','create',name,'--update-config=false']);},
  info(n){assert.equal(n,name);return json(['d1','info',name,'--json']);},
  bind(n,id){assert.equal(n,name);verifyTarget({name:n,uuid:id},name);writeConfig([{binding:'TARGET',database_name:name,database_id:id}]);},
  seed(){sql('CREATE TABLE recovery_probe(id INTEGER PRIMARY KEY, version INTEGER NOT NULL); INSERT INTO recovery_probe VALUES(1,1);');},
  read(){return Number(sql('SELECT version FROM recovery_probe WHERE id=1;')[0]?.version);},
  bookmark(){return json(['d1','time-travel','info','TARGET','--json']).bookmark;},
  change(){sql('UPDATE recovery_probe SET version=2 WHERE id=1;');},
  restore(point){bookmark(point);return json(['d1','time-travel','restore','TARGET','--bookmark',point,'--json']);},
  remove(n){assert.equal(n,name);wrangler(['d1','delete',name,'--skip-confirmation']);},
  isGone(n,id){assert.equal(n,name);assert(!FORBIDDEN.has(id.toLowerCase())&&UUID.test(id));
   const databases=json(['d1','list','--json']);assert(Array.isArray(databases));
   return !databases.some(x=>x.name===name||String(x.uuid||'').toLowerCase()===id.toLowerCase());},
 };
}
function main(){
 assert.equal(process.platform,'win32','This fixed hosted drill is for the owner Windows setup.');
 assert.equal(process.argv.length,2,'This drill takes no arguments.');
 const name='pg-recovery-drill-'+randomBytes(12).toString('hex');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pg-recovery-drill-'));
 try{runDrill(createDrillRemote(temp,name),name)}finally{fs.rmSync(temp,{recursive:true,force:true})}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 try{main()}catch(e){console.error('STOP: '+String(e.message||'Drill failed'));process.exitCode=1}
