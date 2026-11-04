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
  {type:'ESModule',path:'assets/social-announcements.js'},
 ],
 modulesRoot:'.',compatibilityDate:useDate,
 durableObjects:{SOCIAL:{className:'Social',useSQLite:true}},durableObjectsPersist:persist,
});
async function until(messages,predicate,label,timeout=5000){
 const end=Date.now()+timeout;
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

 // A real folded pot pays the disconnected winner. The payout must survive a DO restart,
 // replay with the same id until the wallet ACKs, and never leak into World history.
 const p1=await connect(mf,10),p2=await connect(mf,11);
 for(const peer of [p1,p2]){peer.ws.send(JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'},speed:13}}));await until(peer.messages,m=>m.type==='room','poker plaza join')}
 p1.ws.send(JSON.stringify({type:'poker_sit',seat:0,buyIn:1000}));p2.ws.send(JSON.stringify({type:'poker_sit',seat:1,buyIn:1000}));
 await until(p1.messages,m=>m.type==='poker'&&m.tables?.[0]?.phase==='preflop','live poker hand',20000);
 const hand=[...p1.messages].reverse().find(m=>m.type==='poker').tables[0];
 const winnerSeat=hand.turnSeat===0?1:0,winnerId=winnerSeat===0?10:11;
 const winner=winnerSeat===0?p1:p2,loser=winnerSeat===0?p2:p1;
 winner.ws.close();await new Promise(r=>setTimeout(r,150));
 loser.ws.send(JSON.stringify({type:'poker_act',action:'fold'}));
 await until(loser.messages,m=>m.type==='poker'&&m.tables?.[0]?.phase==='showdown'&&m.tables[0].winners?.some(w=>w.id===winnerId),'disconnected winner payout');
 await new Promise(r=>setTimeout(r,300));loser.ws.close();await mf.dispose();mf=null;
 mf=await start();let replay=await connect(mf,winnerId);
 const payout=await until(replay.messages,m=>m.type==='poker_ledger'&&m.reason==='win'&&m.delta>0,'durable payout replay');
 assert(payout.id,'the payout carries a stable id');assert(!replay.messages.find(m=>m.type==='hello').history.some(m=>m.type==='poker_ledger'),'personal ledger is not public World history');
 const outsider=await connect(mf,12);await until(outsider.messages,m=>m.type==='hello','outsider hello');await new Promise(r=>setTimeout(r,100));assert(!outsider.messages.some(m=>m.type==='poker_ledger'),'another account cannot read the payout');outsider.ws.close();
 replay.ws.close();await new Promise(r=>setTimeout(r,100));await mf.dispose();mf=null;
 mf=await start();replay=await connect(mf,winnerId);
 const again=await until(replay.messages,m=>m.type==='poker_ledger'&&m.id===payout.id,'same-id replay after second restart');assert.equal(again.delta,payout.delta);
 const ackIds=replay.messages.filter(m=>m.type==='poker_ledger').map(m=>m.id);
 replay.ws.send(JSON.stringify({type:'poker_ledger_ack',ids:ackIds}));await new Promise(r=>setTimeout(r,300));replay.ws.close();await mf.dispose();mf=null;
 mf=await start();replay=await connect(mf,winnerId);await until(replay.messages,m=>m.type==='hello','post-ACK hello');await new Promise(r=>setTimeout(r,150));assert(!replay.messages.some(m=>m.type==='poker_ledger'),'ACKed payout is not replayed after restart');replay.ws.close();
 console.log('PASS Cloudflare local runtime: Durable Object binding, WebSocket upgrade, plaza join, World-only backlog and durable acknowledged poker payouts across storage-backed restarts');
}finally{if(mf)await mf.dispose();fs.rmSync(persist,{recursive:true,force:true})}
