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
import {Social} from '../../workers/social/index.mjs';

// The bundled workerd lags the compatibility date in workers/social/wrangler.toml.
// Running the Worker under an older date is safe for everything asserted here (a
// Durable Object binding, its SQLite backend, a WebSocket upgrade, manual MVP dispatch/alarm
// routing and room messages); it is not proof that the deployed date behaves identically. If a newer
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
  {type:'ESModule',path:'functions/_lib/raid-rules.js'},
  {type:'ESModule',path:'assets/digimon/roster.js'},
  {type:'ESModule',path:'assets/digimon/base-stats.js'},
  {type:'ESModule',path:'assets/social-rules.js'},
  {type:'ESModule',path:'assets/social-poker.js'},
  {type:'ESModule',path:'assets/digimon-battle.js'},
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
async function mvpCommand(mf,body,admin){
 const ns=await mf.getDurableObjectNamespace('SOCIAL'),stub=ns.get(ns.idFromName('world'));
 return stub.fetch('https://social/gm/fishing-mvp',{method:'POST',headers:{'Content-Type':'application/json',...(admin?{'X-Social-Admin':JSON.stringify(admin)}:{})},body:JSON.stringify(body)});
}
async function raidCommand(mf,path,identity,body){
 const ns=await mf.getDurableObjectNamespace('SOCIAL'),stub=ns.get(ns.idFromName('world'));
 return stub.fetch('https://social'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(identity?{'X-Social-Identity':JSON.stringify(identity)}:{})},...(body?{body:JSON.stringify(body)}:{})});
}
// The DO has one shared alarm. Pin the active-battle branch directly so a manual
// spawn cannot replace a 250 ms battle tick with its 60-second MVP sweep.
{
 const alarmWrites=[],battleSchedules=[],spawned=[];
 const adminDO=Object.create(Social.prototype);
 adminDO.ctx={storage:{getAlarm:async()=>null,setAlarm:async at=>alarmWrites.push(at)}};
 adminDO.room={mvpActive:new Map(),hasActiveBattles:()=>true,spawnMvp:(room,now,species)=>{spawned.push({room,species});return{room,sp:species,id:'mvp:alarm-test',spawnedAt:now,endsAt:now+600000}}};
 adminDO.battleAlarmWrite=Promise.resolve();adminDO.sockets=new WeakMap();adminDO.restored=false;adminDO.scheduleBattleAlarm=()=>battleSchedules.push('battle');
 const result=await adminDO.adminFishingMvp(new Request('https://social/gm/fishing-mvp',{method:'POST',headers:{'Content-Type':'application/json','X-Social-Admin':JSON.stringify({id:9,username:'MvpAdmin',gm:2})},body:JSON.stringify({room:2,species:'mvp_stormcoil'})}));
 assert.equal(result.status,200);assert.deepEqual(spawned,[{room:2,species:'mvp_stormcoil'}]);
 assert.deepEqual(battleSchedules,['battle']);assert.deepEqual(alarmWrites,[],'active battle alarm is preserved without a direct 60-second reset');
}
{
 const idle=Object.create(Social.prototype);
 idle.room={clients:{size:3},hasActiveBattles:()=>false,hasKeepaliveWork:()=>false};
 idle.battleAlarmAt=0;
 assert.equal(idle.nextAlarmAt(),0,'v388: sitters do not schedule a plaza alarm');
}
let persistedRaidId='',persistedActiveRaidId='';
let mf=await start();
try{
 const publicNs=await mf.getDurableObjectNamespace('SOCIAL'),publicStub=publicNs.get(publicNs.idFromName('world'));
 const forgedIdentity={'X-Social-Identity':JSON.stringify({id:1,username:'ForgedPreviewIdentity'})};
 const externalRaid=await publicStub.fetch('https://prontera-social-preview.workers.dev/raid/party',{headers:forgedIdentity});
 assert.equal(externalRaid.status,404,'identity-trusting raid routes are closed on public preview hosts');
 const externalSocket=await publicStub.fetch('https://prontera-social-preview.workers.dev/connect',{headers:{...forgedIdentity,Upgrade:'websocket'}});
 assert.equal(externalSocket.status,404,'the Worker preview cannot impersonate the Pages-authenticated plaza socket either');
 const {ws,messages}=await connect(mf,1);
 await until(messages,m=>m.type==='hello','first hello');
 ws.send(JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));
 const joined=await until(messages,m=>m.type==='room','plaza join');assert.equal(joined.room,1);
 const raidIdentity={id:1,username:'NativeWorkerTest1'};
 assert.equal((await raidCommand(mf,'/raid/party',null)).status,403,'private raid status requires Pages-authenticated identity');
 assert.equal((await raidCommand(mf,'/raid/party',raidIdentity)).status,200,'an authenticated player can request a raid-party snapshot');
 persistedRaidId='raid:workerd-test-1';const startedAt=Date.now(),deadlineAt=startedAt+60000;
 const install=await raidCommand(mf,'/raid/install',raidIdentity,{id:persistedRaidId,leaderId:1,partySize:1,totalHp:100,phaseHps:[15,15,15,55],phaseNames:['A','B','C','Boss'],startedAt,deadlineAt,bossArmor:.3,members:[{id:1,name:'NativeWorkerTest1',profile:{dps:2000,maxHp:1000,armorPen:0}}]});
 assert.equal(install.status,200,'the authenticated leader can install the D1-reserved run');
 const strike=await raidCommand(mf,'/raid/action',raidIdentity,{runId:persistedRaidId,action:'strike',actionId:'workerd-raid-strike-0001'}),strikeData=await strike.json();
 assert.equal(strike.status,200);assert.equal(strikeData.run.state,'cleared','Social DO resolves combat and kill state server-side');
 const raidReplay=await raidCommand(mf,'/raid/action',raidIdentity,{runId:persistedRaidId,action:'heavy',actionId:'workerd-raid-strike-0001'}),replayData=await raidReplay.json();
 assert.equal(raidReplay.status,200);assert.equal(replayData.duplicate,true,'same action id cannot apply a second strike after the clear');
 assert.equal((await raidCommand(mf,'/raid/snapshot',{id:2,username:'OtherPlayer'},{runId:persistedRaidId})).status,404,'a non-member cannot snapshot the run');
 assert.equal((await raidCommand(mf,'/raid/snapshot',raidIdentity,{runId:persistedRaidId})).status,200,'a member can retrieve the authoritative run state');
 persistedActiveRaidId='raid:workerd-active-test';const activeStartedAt=Date.now(),activeDeadlineAt=activeStartedAt+60000,activeIdentity={id:2,username:'NativeWorkerTest2'};
 const activeInstall=await raidCommand(mf,'/raid/install',activeIdentity,{id:persistedActiveRaidId,leaderId:2,partySize:1,totalHp:1_000_000,phaseHps:[150_000,150_000,150_000,550_000],phaseNames:['A','B','C','Boss'],startedAt:activeStartedAt,deadlineAt:activeDeadlineAt,bossArmor:.3,members:[{id:2,name:'NativeWorkerTest2',profile:{dps:2000,maxHp:1000,armorPen:0}}]});
 assert.equal(activeInstall.status,200,'a second player can reserve a concurrent solo encounter');
 const activeHit=await raidCommand(mf,'/raid/action',activeIdentity,{runId:persistedActiveRaidId,action:'strike',actionId:'workerd-active-strike-0001'}),activeHitData=await activeHit.json();
 assert.equal(activeHit.status,200);assert.equal(activeHitData.run.state,'active');assert.ok(activeHitData.run.members[0].damage>0);
 // Rift Raid lobby, roster and unexpired invites are SQLite-backed, including across a real
 // Durable Object eviction with open Hibernatable WebSockets.
 const lobbyMate=await connect(mf,3),lobbyInvitee=await connect(mf,4),lobbyJoin=JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}});
 for(const peer of [lobbyMate,lobbyInvitee]){await until(peer.messages,m=>m.type==='hello','lobby peer hello');peer.ws.send(lobbyJoin);await until(peer.messages,m=>m.type==='room','lobby peer plaza join')}
 ws.send(JSON.stringify({type:'raid_party_create',open:true}));
 const createdParty=await until(messages,m=>m.type==='raid_party'&&m.party?.leader===1&&m.party?.members?.length===1,'raid lobby create');
 const lobbyId=createdParty.party.id;assert.equal(typeof lobbyId,'string');assert.equal(createdParty.party.members[0].ready,false);assert.equal(createdParty.party.members[0].look.cls,'Novice','lobby roster carries a native character preview');
 lobbyMate.ws.send(JSON.stringify({type:'raid_party_join',partyId:lobbyId}));
 await until(messages,m=>m.type==='raid_party'&&m.party?.id===lobbyId&&m.party?.members?.length===2,'raid lobby join');
 ws.send(JSON.stringify({type:'raid_invite',targetId:4}));
 await until(lobbyInvitee.messages,m=>m.type==='raid_invite'&&m.partyId===lobbyId,'raid invite delivery');
 ws.send(JSON.stringify({type:'raid_party_ready',ready:true}));
 await until(messages,m=>m.type==='raid_party'&&m.party?.id===lobbyId&&m.party.members.find(x=>x.id===1)?.ready===true,'leader readiness broadcast');
 lobbyMate.ws.send(JSON.stringify({type:'raid_party_ready',ready:true}));
 await until(messages,m=>m.type==='raid_party'&&m.party?.id===lobbyId&&m.party.members.length===2&&m.party.members.every(x=>x.ready),'all-member readiness broadcast');
 await mf.unsafeEvictDurableObject('','Social',{name:'world',webSockets:'hibernate'});
 const lobbySnapshot=await raidCommand(mf,'/raid/party',raidIdentity),lobbySnapshotData=await lobbySnapshot.json();
 assert.equal(lobbySnapshot.status,200);assert.deepEqual(lobbySnapshotData.party.members.map(m=>m.id),[1,3],'lobby roster survives a genuine DO eviction');assert.deepEqual(lobbySnapshotData.party.members.map(m=>m.ready),[true,true],'readiness survives a genuine DO eviction');
 lobbyInvitee.ws.send(JSON.stringify({type:'raid_accept'}));
 await until(lobbyInvitee.messages,m=>m.type==='raid_party'&&m.party?.id===lobbyId&&m.party?.members?.length===3,'persisted invite acceptance after eviction');
 await mf.unsafeEvictDurableObject('','Social',{name:'world',webSockets:'hibernate'});
 const acceptedSnapshot=await raidCommand(mf,'/raid/party',{id:4,username:'NativeWorkerTest4'}),acceptedData=await acceptedSnapshot.json();
 assert.deepEqual(acceptedData.party.members.map(m=>m.id),[1,3,4],'accepted party membership is durable too');assert.deepEqual(acceptedData.party.members.map(m=>m.ready),[false,false,false],'a changed roster must ready up again');
 lobbyMate.ws.send(JSON.stringify({type:'raid_party_leave'}));
 await until(messages,m=>m.type==='raid_party'&&m.party?.id===lobbyId&&m.party.members.length===2&&!m.party.members.some(x=>x.id===3),'raid member leave persists');
 const pairRoster=()=>raidCommand(mf,'/raid/party',raidIdentity);
 const unready=await (await pairRoster()).json();assert.deepEqual(unready.party.members.map(m=>m.ready),[false,false],'leaving resets readiness for the remaining roster');
 const declineTarget=await connect(mf,5);await until(declineTarget.messages,m=>m.type==='hello','decline target hello');declineTarget.ws.send(lobbyJoin);await until(declineTarget.messages,m=>m.type==='room','decline target plaza join');
 ws.send(JSON.stringify({type:'raid_invite',targetId:5}));await until(declineTarget.messages,m=>m.type==='raid_invite'&&m.partyId===lobbyId,'second raid invite delivery');
 declineTarget.ws.send(JSON.stringify({type:'raid_decline'}));await new Promise(r=>setTimeout(r,40));
 await mf.unsafeEvictDurableObject('','Social',{name:'world',webSockets:'hibernate'});
 declineTarget.ws.send(JSON.stringify({type:'raid_accept'}));
 const declinedResult=await until(declineTarget.messages,m=>m.type==='raid_error','declined invite cannot be accepted after eviction');
 assert.match(declinedResult.message,/invite expired/i);
 const pairRun={id:'raid:workerd-party-ready-test',leaderId:1,partySize:2,totalHp:1000000,phaseHps:[150000,150000,150000,550000],phaseNames:['A','B','C','Boss'],startedAt:Date.now(),deadlineAt:Date.now()+60000,bossArmor:.3,members:[{id:1,name:'NativeWorkerTest1',profile:{dps:2000,maxHp:1000,armorPen:0}},{id:4,name:'NativeWorkerTest4',profile:{dps:2000,maxHp:1000,armorPen:0}}]};
 assert.equal((await raidCommand(mf,'/raid/install',{id:4,username:'NativeWorkerTest4'},pairRun)).status,403,'the Social route authenticates the leader who installs a group raid');
 assert.equal((await raidCommand(mf,'/raid/install',raidIdentity,pairRun)).status,409,'the Social Durable Object rejects an unready leader start');
 ws.send(JSON.stringify({type:'raid_party_ready',ready:true}));await until(messages,m=>m.type==='raid_party'&&m.party?.id===lobbyId&&m.party.members.find(x=>x.id===1)?.ready===true,'ready leader after membership change');
 assert.equal((await raidCommand(mf,'/raid/install',raidIdentity,pairRun)).status,409,'one ready member cannot start a party raid');
 lobbyInvitee.ws.send(JSON.stringify({type:'raid_party_ready',ready:true}));await until(lobbyInvitee.messages,m=>m.type==='raid_party'&&m.party?.id===lobbyId&&m.party.members.length===2&&m.party.members.every(x=>x.ready),'ready all remaining members');
 const readyStart=await raidCommand(mf,'/raid/install',raidIdentity,pairRun);assert.equal(readyStart.status,200,'the leader install succeeds after both members are ready');
 ws.send(JSON.stringify({type:'raid_party_leave'}));
 await until(lobbyInvitee.messages,m=>m.type==='raid_party'&&m.party?.id===lobbyId&&m.party.leader===4&&m.party.members.length===1,'leader leave transfers leadership');
 assert.equal((await (await raidCommand(mf,'/raid/party',raidIdentity)).json()).party,null,'departed leader is removed from durable roster');
 lobbyInvitee.ws.send(JSON.stringify({type:'raid_party_leave'}));await new Promise(r=>setTimeout(r,40));
 assert.equal((await (await raidCommand(mf,'/raid/party',{id:4,username:'NativeWorkerTest4'})).json()).party,null,'last member leaving deletes the durable lobby');
 for(const peer of [lobbyMate,lobbyInvitee,declineTarget])peer.ws.close();
 assert.equal((await mvpCommand(mf,{room:1,species:'mvp_stormcoil'})).status,403,'the private command requires an internal GM identity');
 assert.equal((await mvpCommand(mf,{room:1,species:'mvp_stormcoil'},{id:8,username:'Player',gm:0})).status,403,'a non-GM identity is refused');
 const gm={id:9,username:'MvpAdmin',gm:2};
 assert.equal((await mvpCommand(mf,{room:0,species:'mvp_stormcoil'},gm)).status,400,'rooms outside the plaza bounds are refused');
 assert.equal((await mvpCommand(mf,{room:1,species:'not_a_fish'},gm)).status,400,'unlisted MVP IDs are refused');
 const spawnedResponse=await mvpCommand(mf,{room:1,species:'mvp_stormcoil'},gm),spawned=await spawnedResponse.json();
 assert.equal(spawnedResponse.status,200);assert.equal(spawned.sp,'mvp_stormcoil');assert.equal(spawned.room,1);assert.equal(spawned.endsAt-spawned.spawnedAt,10*60*1000);
 await until(messages,m=>m.type==='mvp_spawn'&&m.id===spawned.id,'authenticated manual MVP broadcast');
 assert.equal((await mvpCommand(mf,{room:1,species:'mvp_tidewarden'},gm)).status,409,'a room cannot have two active MVPs');
 ws.send(JSON.stringify({type:'chat',channel:'world',body:'survives a Durable Object restart'}));
 await until(messages,m=>m.type==='message'&&m.body==='survives a Durable Object restart','World echo');
 await new Promise(r=>setTimeout(r,3100));
 ws.send(JSON.stringify({type:'chat',channel:'whisper',to:'NativeWorkerTest',body:'never durable'}));
 await until(messages,m=>m.type==='message'&&m.body==='never durable','whisper echo');
 ws.close();await new Promise(r=>setTimeout(r,100));await mf.dispose();mf=null;
 // A new runtime with the same Durable Object storage is an eviction/restart, not a new world.
 mf=await start();const second=await connect(mf,2);
 const hello=await until(second.messages,m=>m.type==='hello','restarted hello');
 if(persistedRaidId){const snapshot=await raidCommand(mf,'/raid/snapshot',{id:1,username:'NativeWorkerTest1'},{runId:persistedRaidId}),data=await snapshot.json();assert.equal(snapshot.status,200);assert.equal(data.run.state,'cleared','settled run state survives DO storage hydration')}
 if(persistedActiveRaidId){
  const identity={id:2,username:'NativeWorkerTest2'},snapshot=await raidCommand(mf,'/raid/snapshot',identity,{runId:persistedActiveRaidId}),data=await snapshot.json();
  assert.equal(snapshot.status,200);assert.equal(data.run.state,'active','active encounter survives DO storage hydration');
  const damage=data.run.members[0].damage;
  const replay=await raidCommand(mf,'/raid/action',identity,{runId:persistedActiveRaidId,action:'heavy',actionId:'workerd-active-strike-0001'}),replayData=await replay.json();
  assert.equal(replay.status,200);assert.equal(replayData.duplicate,true,'accepted action ID remains idempotent after DO restart');assert.equal(replayData.run.members[0].damage,damage);
 }
 assert(hello.history.some(m=>m.body==='survives a Durable Object restart'),'World backlog survives the restart');
 assert(!hello.history.some(m=>m.channel!=='world'||m.body==='never durable'),'only public World history is durable');
 second.ws.close();

 // Regression: real closed transports must not recursively broadcast their own cleanup.
 const observer=await connect(mf,1001);
 observer.ws.send(JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));
 await until(observer.messages,m=>m.type==='room','disconnect observer join');
 let peer=await connect(mf,1000);
 const joinPeer=async()=>{peer.ws.send(JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));await until(peer.messages,m=>m.type==='room','reconnected plaza join')};
 await joinPeer();
 for(let i=0;i<6;i++){
  peer.ws.close(1000,'disconnect regression');
  await until(observer.messages,m=>m.type==='left'&&m.id===1000,'closed peer removed');observer.messages.length=0;
  peer=await connect(mf,1000);await joinPeer();assert.equal(peer.messages.find(m=>m.type==='room').room,1);
  peer.ws.send(JSON.stringify({type:'ping'}));await until(peer.messages,m=>m.type==='pong','reconnected pong');
 }
 peer.ws.send(JSON.stringify({type:'chat',channel:'world',body:'World chat after six disconnects'}));
 await until(observer.messages,m=>m.type==='message'&&m.body==='World chat after six disconnects','World chat still reaches another client');
 peer.ws.close();observer.ws.close();await new Promise(r=>setTimeout(r,100));

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
 console.log('PASS Cloudflare local runtime: private raid routes, authoritative combat/replay, persisted party readiness/reset and leader-only all-ready install, invite/party hydration across DO eviction, run hydration/replay, no raid alarms, authenticated MVP spawn, battle-safe alarms, WebSocket plaza join, World-only backlog and durable poker payouts');
}finally{if(mf)await mf.dispose();fs.rmSync(persist,{recursive:true,force:true})}
