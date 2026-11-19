import {SocialRoom,cleanWorldHistory,cleanPokerLedgerQueues,FISHING_MVP_IDS,SOCIAL_MAX_ROOMS} from './room.mjs';
const BATTLE_ALARM_MS=1000;
const HISTORY_KEY='world-history-v1';
const LEDGER_PREFIX='poker-ledger-v1:';
// v296: the plaza spot a dropped client resumes is durable, so a Durable Object eviction between
// the drop and the reconnect no longer respawns the player at the entrance mid-fishing-session.
const RESUME_PREFIX='resume-v1:';
const RAID_KEY='player-character-raid-v1';
const RAID_PARTY_KEY='player-character-raid-parties-v1';
const RAID_PARTY_ACTIONS=new Set(['raid_party_create','raid_party_join','raid_party_leave','raid_party_ready','raid_invite','raid_accept','raid_decline','leave','switch_room']);
function cleanRaidPreview(value){
 if(!value||typeof value!=='object'||typeof value.cls!=='string'||value.cls.length>40||!value.appearance||typeof value.appearance!=='object'||Array.isArray(value.appearance))return null;
 try{const text=JSON.stringify(value.appearance);if(!text||text.length>1200)return null;return{cls:value.cls,appearance:JSON.parse(text)}}catch{return null}
}
function cleanRaidPartyState(value,now=Date.now()){
 const parties=[],byId=new Map(),usedMembers=new Set();
 for(const raw of Array.isArray(value?.parties)?value.parties:[]){
  if(!raw||typeof raw!=='object'||typeof raw.id!=='string'||!/^[-A-Za-z0-9:_]{1,100}$/.test(raw.id)||byId.has(raw.id)||!Number.isInteger(raw.room)||raw.room<1||raw.room>SOCIAL_MAX_ROOMS||!Number.isInteger(raw.leader)||raw.leader<1||typeof raw.open!=='boolean'||!Number.isFinite(raw.createdAt)||!Array.isArray(raw.members)||raw.members.length<1||raw.members.length>3)continue;
  const memberIds=new Set(),members=[];let valid=true;
  for(const m of raw.members){
   if(!m||!Number.isInteger(m.id)||m.id<1||typeof m.name!=='string'||!m.name.length||memberIds.has(m.id)||usedMembers.has(m.id)){valid=false;break}
   memberIds.add(m.id);members.push({id:m.id,name:m.name.replace(/[\x00-\x1f]/g,'').slice(0,32)||'Adventurer',ready:m.ready===true,look:cleanRaidPreview(m.look)});
  }
  if(!valid||!memberIds.has(raw.leader))continue;
  for(const id of memberIds)usedMembers.add(id);
  const party={id:raw.id,room:raw.room,leader:raw.leader,open:raw.open,createdAt:raw.createdAt,members};
  parties.push(party);byId.set(party.id,party);
 }
 const invites=[],targets=new Set();
 for(const raw of Array.isArray(value?.invites)?value.invites:[]){
  if(!raw||!Number.isInteger(raw.targetId)||raw.targetId<1||targets.has(raw.targetId)||usedMembers.has(raw.targetId)||!Number.isFinite(raw.expiresAt)||raw.expiresAt<=now||raw.expiresAt>now+30000)continue;
  const party=byId.get(raw.partyId),from=party?.members.find(m=>m.id===raw.fromId);
  if(!party||!party.open||party.leader!==raw.fromId||!from||party.members.length>=3||raw.room!==party.room)continue;
  targets.add(raw.targetId);invites.push([raw.targetId,{partyId:party.id,fromId:from.id,fromName:from.name,room:party.room,expiresAt:raw.expiresAt}]);
 }
 return{parties,invites};
}
export class Social {
 constructor(ctx){
  this.ctx=ctx;this.historyWrites=Promise.resolve();this.ledgerLoadFailed=false;
  this.resumeWrites=Promise.resolve();this.raidWrites=Promise.resolve();this.raidPartyWrites=Promise.resolve();this.raidSaveError=null;this.raidPartySaveError=null;
  this.room=new SocialRoom({
   onWorldMessage:()=>this.saveHistory(),
   onPokerLedger:(accountId,events)=>ctx.storage.put(LEDGER_PREFIX+accountId,events),
   onResume:(accountId,record)=>this.saveResume(accountId,record),
   onRaidState:runs=>this.saveRaidRuns(runs),
   onRaidPartyState:state=>this.saveRaidPartyState(state),
   onBattleActivity:()=>this.scheduleBattleAlarm(),
  });
  this.battleAlarmAt=0;this.battleAlarmWrite=Promise.resolve();this.sockets=new WeakMap();this.restored=false;
  // SQLite Durable Object storage survives eviction/restarts. Do not admit a socket until
  // both public history and every account's unacknowledged poker outbox are loaded.
  const historyReady=ctx.storage.get(HISTORY_KEY).then(saved=>{
   this.room.history=cleanWorldHistory(saved);
   this.room.serial=Math.max(this.room.serial,...this.room.history.map(m=>m.id));
  }).catch(error=>console.error('World history load failed',error));
  const resumeReady=ctx.storage.list({prefix:RESUME_PREFIX}).then(entries=>{
   const now=Date.now();
   for(const [key,record] of entries){
    const id=Number(key.slice(RESUME_PREFIX.length));
    if(!Number.isInteger(id)||id<1||!record||typeof record!=='object')continue;
    if(!(Number(record.expires)>now)){ctx.storage.delete(key).catch(()=>{});continue}
    this.room.resumes.set(id,record);
   }
  }).catch(error=>console.error('Plaza resume load failed',error));
  const ledgerReady=this.loadLedgers().catch(error=>{this.ledgerLoadFailed=true;console.error('Poker ledger load failed',error)});
  const raidReady=ctx.storage.get(RAID_KEY).then(saved=>{
   if(!Array.isArray(saved))return;
   const valid=saved.filter(r=>r&&typeof r==='object'&&typeof r.id==='string'&&['active','cleared','failed'].includes(r.state)&&Array.isArray(r.members)&&r.members.length>=1&&r.members.length<=3&&Array.isArray(r.phaseHps)&&r.phaseHps.length===4);
   const runs=[...valid.filter(r=>r.state!=='active').slice(-100),...valid.filter(r=>r.state==='active')];
   this.room.raidRuns=new Map(runs.map(r=>[r.id,r]));
  }).catch(error=>console.error('Raid state load failed',error));
  const raidPartyReady=ctx.storage.get(RAID_PARTY_KEY).then(saved=>{
   const state=cleanRaidPartyState(saved);
   this.room.raidParties=new Map(state.parties.map(p=>[p.id,p]));
   this.room.raidInvites=new Map(state.invites);
  }).catch(error=>console.error('Raid party state load failed',error));
  this.ready=Promise.all([historyReady,ledgerReady,resumeReady,raidReady,raidPartyReady]);
 }
 // v326: one failed read used to brick this room for the whole life of the object - every socket was
 // answered 503, so the plaza read as "chat unavailable, retrying..." until the object happened to be
 // evicted minutes later, even though storage was healthy again a moment after the failure. The load is
 // now a method fetch() can retry, and a failure is only a refusal for that one attempt.
 loadLedgers(){
  return this.ctx.storage.list({prefix:LEDGER_PREFIX}).then(entries=>{
   const queues=[];
   for(const [key,events] of entries){const id=Number(key.slice(LEDGER_PREFIX.length));if(Number.isInteger(id)&&id>0)queues.push([id,events])}
   this.room.ledgerQueues=new Map(cleanPokerLedgerQueues(queues));
   this.ledgerLoadFailed=false;
  });
 }
 saveRaidRuns(runs){
  const all=Array.isArray(runs)?runs:[],active=all.filter(run=>run?.state==='active'),settled=all.filter(run=>run?.state!=='active').slice(-100);
  // Never evict a live encounter from DO storage just because the plaza has accumulated more than
  // 100 completed runs. D1 remains the settlement ledger; keep a bounded recent terminal cache.
  const snapshot=[...settled,...active].map(run=>JSON.parse(JSON.stringify(run)));
  this.raidWrites=this.raidWrites.then(()=>this.ctx.storage.put(RAID_KEY,snapshot).then(()=>{this.raidSaveError=null})).catch(error=>{this.raidSaveError=String(error?.message||error);console.error('Raid state save failed',error)});
  return this.raidWrites;
 }
 saveRaidPartyState(state){
  const snapshot=JSON.parse(JSON.stringify({parties:state?.parties||[],invites:state?.invites||[]}));
  this.raidPartyWrites=this.raidPartyWrites.then(()=>this.ctx.storage.put(RAID_PARTY_KEY,snapshot).then(()=>{this.raidPartySaveError=null})).catch(error=>{this.raidPartySaveError=String(error?.message||error);console.error('Raid party state save failed',error)});
  return this.raidPartyWrites;
 }
 async flushRaidState(){
  if(this.raidSaveError)this.room.raidPersist();
  if(this.raidPartySaveError)this.room.raidPartyPersist();
  await Promise.all([this.raidWrites,this.raidPartyWrites]);
  return !this.raidSaveError&&!this.raidPartySaveError;
 }
 pinSocket(ws,c){
  if(!ws||!c)return;this.sockets.set(ws,c);c.ws=ws;
  try{if(typeof ws.serializeAttachment==='function')ws.serializeAttachment(this.room.socketState(c))}catch{}
 }
 restoreSockets(){
  if(this.restored)return;this.restored=true;
  const list=typeof this.ctx.getWebSockets==='function'?this.ctx.getWebSockets():[];
  for(const ws of list){
   let att=null;try{att=typeof ws.deserializeAttachment==='function'?ws.deserializeAttachment():null}catch{}
   const send=s=>{try{ws.send(s)}catch{}},close=(code,reason)=>{try{ws.close(code,reason)}catch{}};
   const c=this.room.adoptHibernated(att,send,close);if(c)this.pinSocket(ws,c);
  }
 }
 clientFor(ws){
  this.restoreSockets();
  const cached=this.sockets.get(ws);if(cached)return cached;
  let att=null;try{att=typeof ws.deserializeAttachment==='function'?ws.deserializeAttachment():null}catch{}
  const send=s=>{try{ws.send(s)}catch{}},close=(code,reason)=>{try{ws.close(code,reason)}catch{}};
  const c=this.room.adoptHibernated(att,send,close);if(c)this.pinSocket(ws,c);return c;
 }
 scheduleKeepalive(){
  const at=this.nextAlarmAt();if(!at)return;
  this.battleAlarmWrite=this.battleAlarmWrite.then(()=>this.ctx.storage.setAlarm(at)).catch(error=>console.error('Plaza alarm failed',error));
 }
 nextAlarmAt(){
  const now=Date.now();
  if(this.room.hasActiveBattles()&&this.room.clients.size)return now+BATTLE_ALARM_MS;
  if(this.room.hasKeepaliveWork())return now+60000;
  return 0;
 }
 scheduleBattleAlarm(){
  // v388: 1s ticks (was 250ms). Solo grind no longer uses this alarm at all; party/PvP still do.
  // Skip when the room is empty so a dropped socket cannot keep billing.
  if(!this.room.hasActiveBattles()||!this.room.clients.size)return;
  const now=Date.now();if(this.battleAlarmAt-now>200&&this.battleAlarmAt-now<BATTLE_ALARM_MS)return;
  const at=now+BATTLE_ALARM_MS;this.battleAlarmAt=at;
  this.battleAlarmWrite=this.battleAlarmWrite.then(()=>this.ctx.storage.setAlarm(at)).catch(error=>console.error('Battle alarm failed',error));
 }
 // Fire-and-forget like the world history: a failed write only costs the resume, never the save.
 saveResume(accountId,record){
  const storage=this.ctx.storage,key=RESUME_PREFIX+accountId;
  this.resumeWrites=this.resumeWrites
   .then(()=>record?storage.put(key,record):storage.delete(key))
   .catch(error=>console.error('Plaza resume write failed',error));
 }
 saveHistory(){
  const snapshot=this.room.history.slice();
  const storage=this.ctx.storage;
  this.historyWrites=this.historyWrites.then(()=>storage.put(HISTORY_KEY,snapshot)).catch(error=>console.error('World history save failed',error));
 }
 async raidInternal(request){
  let identity=null;try{identity=JSON.parse(request.headers.get('X-Social-Identity')||'null')}catch{}
  if(!identity||!Number.isInteger(identity.id)||identity.id<1||typeof identity.username!=='string')return new Response(JSON.stringify({err:'Authenticated Pages identity required'}),{status:403,headers:{'Content-Type':'application/json'}});
  const path=new URL(request.url).pathname;
  if(path==='/raid/party'&&request.method==='GET')return new Response(JSON.stringify({ok:true,party:this.room.raidRosterFor(identity.id)}),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(path==='/raid/install'&&request.method==='POST'){
   let body=null;try{body=await request.json()}catch{}
   if(!body||typeof body!=='object'||Array.isArray(body)||Number(body.leaderId)!==identity.id)return new Response(JSON.stringify({err:'Only the authenticated raid leader may start'}),{status:403,headers:{'Content-Type':'application/json'}});
   const result=this.room.raidInstall(body);if(result.ok&&!await this.flushRaidState())return new Response(JSON.stringify({err:'Raid state could not be persisted. Retry from Challenge; D1 still holds the entry reservation.'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
   return new Response(JSON.stringify(result),{status:result.ok?200:409,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  if(path==='/raid/restore'&&request.method==='POST'){
   let body=null;try{body=await request.json()}catch{}
   if(!body||typeof body!=='object'||Array.isArray(body)||!Array.isArray(body.members)||!body.members.some(m=>Number(m?.id)===identity.id))return new Response(JSON.stringify({err:'Only a raid participant may restore this run'}),{status:403,headers:{'Content-Type':'application/json'}});
   const result=this.room.raidInstall(body,{recovery:true});if(result.ok&&!await this.flushRaidState())return new Response(JSON.stringify({err:'Raid state could not be persisted. Retry the state request.'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
   return new Response(JSON.stringify(result),{status:result.ok?200:409,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  if(path==='/raid/action'&&request.method==='POST'){
   let body=null;try{body=await request.json()}catch{}
   if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.runId!=='string'||typeof body.action!=='string')return new Response(JSON.stringify({err:'Invalid raid action'}),{status:400,headers:{'Content-Type':'application/json'}});
   if(this.raidSaveError&&!await this.flushRaidState())return new Response(JSON.stringify({err:'Raid state could not be persisted. Retry the same action id.'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
   const result=this.room.raidHttpAction(identity.id,body,this.room.now());if((result.ok||result.run)&&!await this.flushRaidState())return new Response(JSON.stringify({err:'Raid state could not be persisted. Retry the same action id.',run:result.run||null}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
   return new Response(JSON.stringify(result),{status:result.ok?200:409,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  if(path==='/raid/snapshot'&&request.method==='POST'){
   let body=null;try{body=await request.json()}catch{}
   const run=body&&typeof body.runId==='string'?this.room.raidRuns.get(body.runId):null;
   if(!run||!run.members.some(m=>m.id===identity.id))return new Response(JSON.stringify({err:'Raid not found'}),{status:404,headers:{'Content-Type':'application/json'}});
   const snapshot=this.room.raidHttpSnapshot(body.runId,identity.id);
   if(!await this.flushRaidState())return new Response(JSON.stringify({err:'Raid state could not be persisted. Retry the snapshot.'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
   return new Response(JSON.stringify({ok:true,run:snapshot}),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  return new Response(JSON.stringify({err:'Not found'}),{status:404,headers:{'Content-Type':'application/json'}});
 }
 async adminFishingMvp(request){
  if(request.method!=='POST')return new Response(JSON.stringify({err:'POST required'}),{status:405,headers:{'Content-Type':'application/json'}});
  let admin=null;try{admin=JSON.parse(request.headers.get('X-Social-Admin')||'null')}catch{}
  if(!admin||!Number.isInteger(admin.id)||admin.id<1||typeof admin.username!=='string'||admin.username.length>16||!Number.isInteger(admin.gm)||admin.gm<1)
   return new Response(JSON.stringify({err:'Authenticated GM identity required'}),{status:403,headers:{'Content-Type':'application/json'}});
  let body=null;try{body=await request.json()}catch{}
  if(!body||typeof body!=='object'||Array.isArray(body))return new Response(JSON.stringify({err:'Invalid spawn request'}),{status:400,headers:{'Content-Type':'application/json'}});
  const room=body.room,species=body.species===null||body.species===''||body.species===undefined?null:body.species;
  if(!Number.isInteger(room)||room<1||room>SOCIAL_MAX_ROOMS)return new Response(JSON.stringify({err:`Choose a plaza room from 1 to ${SOCIAL_MAX_ROOMS}.`}),{status:400,headers:{'Content-Type':'application/json'}});
  if(species!==null&&(typeof species!=='string'||!FISHING_MVP_IDS.includes(species)))return new Response(JSON.stringify({err:'Unknown Fishing MVP'}),{status:400,headers:{'Content-Type':'application/json'}});
  if(this.room.mvpActive.has(room))return new Response(JSON.stringify({err:'An MVP is already active in that plaza room.'}),{status:409,headers:{'Content-Type':'application/json'}});
  // Durable Objects have one alarm for the whole instance. Never replace an active-battle tick
  // with the 60-second MVP sweep, or an in-progress round would pause for a minute.
  if(this.room.hasActiveBattles()){
   this.scheduleBattleAlarm();
   await this.battleAlarmWrite;
  }else{
   const currentAlarm=await this.ctx.storage.getAlarm(),mvpSweep=Date.now()+60000;
   if(currentAlarm===null||currentAlarm>mvpSweep)await this.ctx.storage.setAlarm(mvpSweep);
  }
  const spawn=this.room.spawnMvp(room,Date.now(),species);
  if(!spawn)return new Response(JSON.stringify({err:'The Social room could not spawn that MVP.'}),{status:409,headers:{'Content-Type':'application/json'}});
  return new Response(JSON.stringify({ok:true,...spawn}),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }
 async fetch(request){
  await this.ready;
  if(this.ledgerLoadFailed){
   // Retry once per connection attempt instead of refusing this room until it is evicted (v326).
   try{await this.loadLedgers()}
   catch(error){console.error('Poker ledger load failed',error);return new Response('Poker ledger unavailable',{status:503})}
  }
  const requestUrl=new URL(request.url);
  // This Worker has no public route. Pages service bindings use the synthetic `social` host;
  // rejecting every other host also keeps version-preview URLs from exposing identity-trusting
  // internal HTTP routes such as `/raid/*` or `/gm/fishing-mvp`.
  if(requestUrl.hostname!=='social')return new Response('Not found',{status:404});
  const requestPath=requestUrl.pathname;
  if(requestPath.startsWith('/raid/'))return this.raidInternal(request);
  if(requestPath==='/gm/fishing-mvp')return this.adminFishingMvp(request);
  if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket'){
   // v367: the 426 is the only non-destructive probe of this room. Let it carry the last greeting
   // failure, so /api/chatcheck can report a room-side fault instead of declaring victory.
   const failed=this.room.lastSendError;
   return new Response('WebSocket required',{status:426,headers:failed?{'X-Greet-Failed':failed}:{}});
  }
  const identity=JSON.parse(request.headers.get('X-Social-Identity')||'null');if(!identity||!Number.isInteger(identity.id)||typeof identity.username!=='string')return new Response('Invalid identity',{status:400});
  this.restoreSockets();
  const pair=new WebSocketPair(),client=pair[0],server=pair[1];
  const hibernate=typeof this.ctx.acceptWebSocket==='function';
  if(hibernate)this.ctx.acceptWebSocket(server);else server.accept();
  // v368: connect() must never be able to leave this handler without a websocket answer. Anything it
  // throws used to become a plain HTTP 500 to an upgrade request, which the browser reports as a bare
  // "connection failed" / close 1006 with no reason at all - the exact blindness three releases were
  // spent removing. If the room cannot greet, say so on the socket with 4002 and the error text.
  let c=null,greetError='';
  try{c=this.room.connect(identity,s=>server.send(s),(code,reason)=>server.close(code,reason))}
  catch(error){greetError=String((error&&error.message)||error);this.room.lastSendError=greetError;console.error('Plaza greeting threw',error)}
  // v367: v366 answered 503 here, which was a design error - refusing the upgrade means the browser
  // hands the client NO socket at all, so all it can report is "connection failed" and close 1006.
  // That is the same silence the whole diagnosis fought against. Complete the upgrade and then close
  // with a code and a reason the client can read: 4002 means "the room could not greet you", and the
  // reason string carries the actual error. `hello` is sent synchronously inside connect(), so this
  // is a decision the client sees immediately, not after a 12 s handshake timeout.
  if(!c){
   try{server.close(4002,'Greeting failed: '+(greetError||this.room.lastSendError||'unknown'))}catch{}
   return new Response(null,{status:101,webSocket:client});
  }
  this.pinSocket(server,c);
  if(!hibernate){
   server.addEventListener('message',e=>{this.webSocketMessage(server,e.data).catch(error=>console.error('Plaza message failed',error))});
   server.addEventListener('close',()=>{this.room.disconnect(c);this.flushRaidState().catch(error=>console.error('Raid close flush failed',error))});
   server.addEventListener('error',()=>{this.room.disconnect(c);this.flushRaidState().catch(error=>console.error('Raid error flush failed',error))});
  }
  this.scheduleKeepalive();
  return new Response(null,{status:101,webSocket:client});
 }
 async webSocketMessage(ws,message){
  await this.ready;const c=this.clientFor(ws);if(!c)return;
  const text=typeof message==='string'?message:new TextDecoder().decode(message);let type='';
  try{type=String(JSON.parse(text)?.type||'')}catch{}
  this.room.receive(c,text);this.pinSocket(ws,c);if(this.room.hasActiveBattles())this.scheduleBattleAlarm();
  if(type==='raid_action'||RAID_PARTY_ACTIONS.has(type))await this.flushRaidState();
 }
 async webSocketClose(ws){
  await this.ready;const c=this.clientFor(ws);if(c){this.room.disconnect(c);await this.flushRaidState()}
 }
 async webSocketError(ws){
  await this.ready;const c=this.clientFor(ws);if(c){this.room.disconnect(c);await this.flushRaidState()}
 }
 async alarm(){
  await this.ready;this.restoreSockets();this.room.retryPokerLedgers();this.room.sweep();
  await this.room.ledgerWrites;await this.historyWrites;await this.flushRaidState();await this.battleAlarmWrite;
  const at=this.nextAlarmAt();this.battleAlarmAt=this.room.hasActiveBattles()?at:0;
  if(at)await this.ctx.storage.setAlarm(at);
 }
}
export default {fetch(){return new Response('Not found',{status:404})}};
