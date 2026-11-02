// Local Cloudflare runtime rehearsal of the plaza Worker, using the real source
// modules rather than a pre-built bundle. Needs miniflare installed:
//   npm install --no-save --package-lock=false miniflare
//
// This file used to import `convertV4MiniflareOptions`, a wrangler-internal helper
// that current miniflare no longer exports, and to read a bundle that only existed
// after a manual `wrangler deploy --dry-run`. Either gap made it fail for reasons
// that had nothing to do with the code, which is how it became permanently red.
//
// What the local runtime cannot prove is unchanged: hosted WebSocket behaviour,
// Durable Object durability across evictions, CPU limits and real network conditions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The bundled workerd lags the compatibility date in workers/social/wrangler.toml.
// Running the Worker under an older date is safe for everything asserted here (a
// Durable Object binding, its SQLite backend, a WebSocket upgrade and one room
// message); it is not proof that the deployed date behaves identically. If a newer
// miniflare accepts the real date, this constant is simply no longer reached.
const LOCAL_RUNTIME_MAX_DATE='2026-08-06';

function workerCompatibilityDate(){
 const toml=fs.readFileSync('workers/social/wrangler.toml','utf8');
 const match=toml.match(/^compatibility_date\s*=\s*"([0-9]{4}-[0-9]{2}-[0-9]{2})"/m);
 assert(match,'workers/social/wrangler.toml has no compatibility_date');
 return match[1];
}

async function loadMiniflare(){
 try{return await import('miniflare')}catch(e){
  if(e&&e.code==='ERR_MODULE_NOT_FOUND')
   throw Error('miniflare is not installed; run: npm install --no-save --package-lock=false miniflare');
  throw e;
 }
}

const realDate=workerCompatibilityDate();
const useDate=realDate>LOCAL_RUNTIME_MAX_DATE?LOCAL_RUNTIME_MAX_DATE:realDate;
if(useDate!==realDate)
 console.log('note: worker compatibility_date is '+realDate+'; running the local runtime at '+useDate+' (newest the bundled workerd accepts)');

const {Miniflare}=await loadMiniflare();
const persist=fs.mkdtempSync(path.join(os.tmpdir(),'pg-social-history-'));
const start=()=>new Miniflare({
 modules:[
  {type:'ESModule',path:'workers/social/index.mjs'},
  {type:'ESModule',path:'workers/social/room.mjs'},
  {type:'ESModule',path:'assets/social-rules.js'},
  {type:'ESModule',path:'assets/social-poker.js'},
 ],
 modulesRoot:'.',compatibilityDate:useDate,
 durableObjects:{SOCIAL:{className:'Social',useSQLite:true}},durableObjectsPersist:persist,
});
async function until(messages,predicate,label){
 const end=Date.now()+5000;
 while(!messages.some(predicate)){if(Date.now()>end)throw Error('Worker socket timeout: '+label);await new Promise(r=>setTimeout(r,20))}
 return messages.find(predicate);
}
async function connect(mf,id){
 const ns=await mf.getDurableObjectNamespace('SOCIAL'),stub=ns.get(ns.idFromName('world'));
 const response=await stub.fetch('https://social/connect',{headers:{Upgrade:'websocket','X-Social-Identity':JSON.stringify({id,username:'NativeWorkerTest'+id})}});
 assert.equal(response.status,101,'the Durable Object must accept a WebSocket upgrade');
 const ws=response.webSocket;assert(ws);ws.accept();const messages=[];
 ws.addEventListener('message',e=>messages.push(JSON.parse(e.data)));
 return {ws,messages};
}
let mf=await start();
try{
 const {ws,messages}=await connect(mf,1);
 await until(messages,m=>m.type==='hello','first hello');
 ws.send(JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));
 const joined=await until(messages,m=>m.type==='room','plaza join');assert.equal(joined.room,1);
 ws.send(JSON.stringify({type:'chat',channel:'world',body:'survives a Durable Object restart'}));
 await until(messages,m=>m.type==='message'&&m.body==='survives a Durable Object restart','World echo');
 await new Promise(r=>setTimeout(r,3100));
 ws.send(JSON.stringify({type:'chat',channel:'whisper',to:'NativeWorkerTest1',body:'never durable'}));
 await until(messages,m=>m.type==='message'&&m.body==='never durable','whisper echo');
 ws.close();await new Promise(r=>setTimeout(r,100));await mf.dispose();mf=null;
 // A new runtime with the same Durable Object storage is an eviction/restart, not a new world.
 mf=await start();const second=await connect(mf,2);
 const hello=await until(second.messages,m=>m.type==='hello','restarted hello');
 assert(hello.history.some(m=>m.body==='survives a Durable Object restart'),'World backlog survives the restart');
 assert(!hello.history.some(m=>m.channel!=='world'||m.body==='never durable'),'only public World history is durable');
 second.ws.close();
 console.log('PASS Cloudflare local runtime: Durable Object binding, WebSocket upgrade, plaza join and World-only backlog across a storage-backed restart');
}finally{if(mf)await mf.dispose();fs.rmSync(persist,{recursive:true,force:true})}
