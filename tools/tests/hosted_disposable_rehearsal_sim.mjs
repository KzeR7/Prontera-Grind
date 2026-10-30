// Fully mocked. Never invokes Wrangler, Cloudflare, or real data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runDrill,validName,verifyTarget,createDrillRemote} from '../recovery/hosted_disposable_rehearsal.mjs';
const name='pg-recovery-drill-0123456789abcdef01234567';
const uuid='d69e6553-2cc5-4b88-9b3b-7e38abdef1a0';
const mark='00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683';
const prev='00000085-0000024d-00004c6d-8e61117bf38d7adb71b934ebbf891683';
assert(validName(name));assert(!validName('pg'));assert(!validName('pg-staging'));assert(!validName(name+'x'));
assert.equal(verifyTarget({name,uuid},name),uuid);
for(const id of ['50a6448b-1f12-466c-a28a-10544bedf750','3a38c6fc-96a8-491d-b97b-fd536e575ca4','bad'])
 assert.throws(()=>verifyTarget({name,uuid:id},name));
assert.throws(()=>verifyTarget({name:'pg',uuid},name));assert.throws(()=>verifyTarget({name,uuid},name,'db8e6553-2cc5-4b88-9b3b-7e38abdef1a0'));
function mock(failure){
 let value=0,infoCount=0;const calls=[];
 const step=x=>{calls.push(x);if(failure===x)throw Error('injected '+x)};
 const db={
  create(n){step('create');assert.equal(n,name)},
  info(n){step('info');infoCount++;return {name:n,uuid:failure==='wrong-target'?'50a6448b-1f12-466c-a28a-10544bedf750':failure==='changed-target'&&infoCount>=5?'db8e6553-2cc5-4b88-9b3b-7e38abdef1a0':uuid}},
  bind(n,id){step('bind');assert.equal(id,uuid)},
  seed(){step('seed');value=1},read(){step('read');return value},
  bookmark(){step('bookmark');return failure==='bad-bookmark'?'bad':mark},
  change(){step('change');value=2},restore(x){step('restore');assert.equal(x,mark);value=1;return {bookmark:x,previous_bookmark:prev}},
  remove(n){step('remove');assert.equal(n,name)},
  isGone(n,id){step('isGone');assert.equal(n,name);assert.equal(id,uuid);return failure!=='still-present'},
 };
 return {db,calls};
}
let x=mock(),out=[];runDrill(x.db,name,s=>out.push(s));assert(x.calls.includes('restore'));assert(x.calls.includes('remove'));assert.match(out.at(-1),/^PASS/);
for(const failure of ['create','wrong-target','bind','seed','bad-bookmark','change','changed-target','restore','remove','still-present','isGone']){
 x=mock(failure);out=[];assert.throws(()=>runDrill(x.db,name,s=>out.push(s)));
 if(['create','wrong-target','changed-target'].includes(failure))assert(!x.calls.includes('remove'));
 if(['create','wrong-target','bind','seed','bad-bookmark','change','changed-target'].includes(failure))assert(!x.calls.includes('restore'));
 assert(!out.some(s=>s.startsWith('PASS:')));
}
x=mock();assert.throws(()=>runDrill(x.db,'pg',()=>{}));assert.equal(x.calls.length,0);
// Exercise the real driver with a fake subprocess runner, inspecting isolated
// bindings and every argument. No CLI or network request is executed.
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pg-recovery-driver-test-'));
try{
 let value=0,exists=false;const seen=[];
 const invoke=(program,args,cwd)=>{
  assert.equal(program,process.execPath);assert.equal(cwd,temp);
  assert.deepEqual(args.slice(0,3),['fake-npx','--yes','wrangler@4.154.0']);
  assert.deepEqual(args.slice(-2),['--config','wrangler.jsonc']);
  const words=args.slice(3,-2),cfg=JSON.parse(fs.readFileSync(path.join(temp,'wrangler.jsonc'),'utf8'));
  assert.equal(cfg.name,'pg-recovery-drill');seen.push(words.join(' '));
  if(words[0]==='d1'&&words[1]==='create'){
   assert.deepEqual(words,['d1','create',name,'--update-config=false']);assert.deepEqual(cfg.d1_databases,[]);exists=true;return 'created';
  }
  if(words[0]==='d1'&&words[1]==='info')return JSON.stringify({name,uuid});
  assert.deepEqual(cfg.d1_databases,[{binding:'TARGET',database_name:name,database_id:uuid}]);
  if(words[0]==='d1'&&words[1]==='execute'){
   assert.deepEqual(words.slice(0,6),['d1','execute','TARGET','--remote','--json','--command']);
   const sql=words[6];
   if(sql==='CREATE TABLE recovery_probe(id INTEGER PRIMARY KEY, version INTEGER NOT NULL); INSERT INTO recovery_probe VALUES(1,1);')value=1;
   else if(sql==='UPDATE recovery_probe SET version=2 WHERE id=1;')value=2;
   else assert.equal(sql,'SELECT version FROM recovery_probe WHERE id=1;');
   return JSON.stringify([{success:true,results:sql.startsWith('SELECT')?[{version:value}]:[]}]);
  }
  if(words.join(' ')==='d1 time-travel info TARGET --json')return JSON.stringify({bookmark:mark});
  if(words[0]==='d1'&&words[1]==='time-travel'&&words[2]==='restore'){
   assert.deepEqual(words,['d1','time-travel','restore','TARGET','--bookmark',mark,'--json']);value=1;
   return JSON.stringify({bookmark:mark,previous_bookmark:prev});
  }
  if(words.join(' ')==='d1 delete '+name+' --skip-confirmation'){exists=false;return 'deleted'}
  if(words.join(' ')==='d1 list --json')return JSON.stringify(exists?[{name,uuid}]:[]);
  throw Error('Unexpected command: '+words.join(' '));
 };
 runDrill(createDrillRemote(temp,name,{cli:'fake-npx',invoke}),name,()=>{});
 assert(seen.some(x=>x.startsWith('d1 time-travel restore TARGET')));
 assert(seen.includes('d1 delete '+name+' --skip-confirmation'));
}finally{fs.rmSync(temp,{recursive:true,force:true})}
console.log('PASS: disposable name/UUID isolation, fixed mock restore, cleanup and injected-failure refusals');
