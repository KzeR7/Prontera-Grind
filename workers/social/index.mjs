import {SocialRoom,cleanWorldHistory,cleanPokerLedgerQueues,cleanMvpState,FISHING_MVP_IDS,SOCIAL_MAX_ROOMS} from './room.mjs';
const BATTLE_ALARM_MS=1000;
const HISTORY_KEY='world-history-v1';
const LEDGER_PREFIX='poker-ledger-v1:';
const MVP_KEY='mvp-state-v1';
// v296: the plaza spot a dropped client resumes is durable, so a Durable Object eviction between
// the drop and the reconnect no longer respawns the player at the entrance mid-fishing-session.
const RESUME_PREFIX='resume-v1:';
export class Social {
 constructor(ctx){
  this.ctx=ctx;this.historyWrites=Promise.resolve();this.ledgerLoadFailed=false;
  this.resumeWrites=Promise.resolve();
  this.mvpWrites=Promise.resolve();
  this.mvpLoaded=false;
  this.mvpLoadFailed=false;
  this.mvpSaveFailed=false;
  this.mvpSaveInFlight=false;
  this.mvpSaveNeeded=false;
  this.room=new SocialRoom({
   mvpLoaded:false,
   onWorldMessage:()=>this.saveHistory(),
   onPokerLedger:(accountId,events)=>ctx.storage.put(LEDGER_PREFIX+accountId,events),
   onResume:(accountId,record)=>this.saveResume(accountId,record),
   onBattleActivity:()=>this.scheduleBattleAlarm(),
   onMvpChange:()=>{this.saveMvpState();this.scheduleKeepalive();},
   onOccupancyChange:()=>this.scheduleKeepalive(),
  });
  this.battleAlarmAt=0;this.battleAlarmWrite=Promise.resolve();this.sockets=new WeakMap();this.restored=false;

  // Restore hibernated sockets immediately so actual occupancy is known
  // before making empty-room scheduling decisions!
  this.restoreSockets();

  // SQLite Durable Object storage survives eviction/restarts. Do not admit a socket until
  // both public history and every account's unacknowledged poker outbox are loaded.
  const historyReady=ctx.storage.get(HISTORY_KEY).then(saved=>{
   this.room.history=cleanWorldHistory(saved);
   this.room.serial=Math.max(this.room.serial,...this.room.history.map(m=>m.id));
  }).catch(error=>console.error('World history load failed',error));
  const resumeReady=ctx.storage.list({prefix:RESUME_PREFIX}).then(entries=>{
   const now=this.now();
   for(const [key,record] of entries){
    const id=Number(key.slice(RESUME_PREFIX.length));
    if(!Number.isInteger(id)||id<1||!record||typeof record!=='object')continue;
    if(!(Number(record.expires)>now)){ctx.storage.delete(key).catch(()=>{});continue}
    this.room.resumes.set(id,record);
   }
  }).catch(error=>console.error('Plaza resume load failed',error));
  const ledgerReady=this.loadLedgers().catch(error=>{this.ledgerLoadFailed=true;console.error('Poker ledger load failed',error)});
  this.mvpLoadPromise=this.loadMvpState();
  this.ready=Promise.all([historyReady,ledgerReady,resumeReady,this.mvpLoadPromise]).then(()=>{
   this.restoreSockets();
   this.scheduleKeepalive();
  });
 }
 now(){
  return this.room?.now ? this.room.now() : Date.now();
 }
 async loadMvpState(){
  try{
   const saved=await this.ctx.storage.get(MVP_KEY);
   const clean=cleanMvpState(saved),now=this.now();
   this.room.mvpActive.clear();
   this.room.mvpNextAt.clear();
   this.mvpLoaded=true;
   this.mvpLoadFailed=false;
   this.room.mvpLoaded=true;
   for(const [room,data] of clean.active){
    if(data.endsAt>now)this.room.mvpActive.set(room,data);
    else if(!this.room.mvpNextAt.has(room)&&this.room.hasOccupants(room))this.room.scheduleMvp(room,data.endsAt);
   }
   for(const [room,at] of clean.nextAt){
    this.room.mvpNextAt.set(room,at);
   }
   for(const [room] of this.room.mvpActive){
    this.room.broadcastMvp(room);
   }
   return true;
  }catch(error){
   this.mvpLoaded=false;
   this.mvpLoadFailed=true;
   this.room.mvpLoaded=false;
   console.error('Plaza MVP state load failed',error);
   return false;
  }
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
 pinSocket(ws,c){
  if(!ws||!c)return;this.sockets.set(ws,c);c.ws=ws;
  try{if(typeof ws.serializeAttachment==='function')ws.serializeAttachment(this.room.socketState(c))}catch{}
 }
 restoreSockets(){
  const list=typeof this.ctx.getWebSockets==='function'?this.ctx.getWebSockets():[];
  if(!list.length&&this.restored)return;
  this.restored=true;
  for(const ws of list){
   if(this.sockets.has(ws))continue;
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
  const at=this.nextAlarmAt();
  if(!at){
   this.battleAlarmAt=0;
   if(!this.mvpLoaded)return;
   if(typeof this.ctx.storage.deleteAlarm==='function'){
    this.battleAlarmWrite=this.battleAlarmWrite.then(()=>this.ctx.storage.deleteAlarm()).catch(error=>console.error('Delete alarm failed',error));
   }
   return;
  }
  if(this.room.hasActiveBattles()&&this.room.clients?.size){
   this.scheduleBattleAlarm();
   return;
  }
  this.battleAlarmWrite=this.battleAlarmWrite.then(async ()=>{
   let current=null;
   if(typeof this.ctx.storage.getAlarm==='function'){
    try{current=await this.ctx.storage.getAlarm();}catch{}
   }
   const now=this.now();
   if(Number.isFinite(current)&&current>now&&current===at)return;
   await this.ctx.storage.setAlarm(at);
  }).catch(error=>console.error('Plaza alarm failed',error));
 }
 nextAlarmAt(now = this.now()){
  if(this.mvpLoadFailed||this.mvpSaveFailed)return now+2000;
  if(typeof this.room.nextDeadline==='function')return this.room.nextDeadline(now);
  if(this.room.hasActiveBattles()&&this.room.clients?.size)return now+BATTLE_ALARM_MS;
  if(this.room.hasKeepaliveWork?.())return now+60000;
  const mvpAt=this.room.nextMvpSpawnAt?.(now)||0;
  if(mvpAt)return mvpAt;
  return 0;
 }
 scheduleBattleAlarm(){
  // v388: 1s ticks (was 250ms). Solo grind no longer uses this alarm at all; party/PvP still do.
  // Skip when the room is empty so a dropped socket cannot keep billing.
  if(!this.room.hasActiveBattles()||!this.room.clients.size)return;
  const now=this.now();if(this.battleAlarmAt-now>200&&this.battleAlarmAt-now<BATTLE_ALARM_MS)return;
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
 saveMvpState(){
  if(!this.mvpLoaded){
   if(this.mvpLoadFailed)return Promise.resolve();
   if(this.mvpLoadPromise){
    return this.mvpLoadPromise.then(()=>{
     if(this.mvpLoaded)return this.saveMvpState();
    });
   }
   return Promise.resolve();
  }
  this.mvpSaveNeeded=true;
  if(this.mvpSaveInFlight)return this.mvpWrites;
  this.mvpSaveInFlight=true;
  this.mvpWrites=(async ()=>{
   while(this.mvpSaveNeeded){
    this.mvpSaveNeeded=false;
    const snapshot={active:[...this.room.mvpActive.entries()],nextAt:[...this.room.mvpNextAt.entries()]};
    try{
     await this.ctx.storage.put(MVP_KEY,snapshot);
     this.mvpSaveFailed=false;
     this.scheduleKeepalive();
    }catch(error){
     console.error('Plaza MVP state save failed',error);
     this.mvpSaveFailed=true;
     this.scheduleKeepalive();
     break;
    }
   }
   this.mvpSaveInFlight=false;
  })();
  return this.mvpWrites;
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
  if(this.mvpLoadFailed)return new Response(JSON.stringify({err:'Plaza MVP storage is unavailable. Please retry.'}),{status:503,headers:{'Content-Type':'application/json'}});
  if(this.room.mvpActive.has(room))return new Response(JSON.stringify({err:'An MVP is already active in that plaza room.'}),{status:409,headers:{'Content-Type':'application/json'}});
  // Durable Objects have one alarm for the whole instance. Never replace an active-battle tick
  // with another alarm, or an in-progress round would pause for a minute.
  if(this.room.hasActiveBattles()){
   this.scheduleBattleAlarm();
   await this.battleAlarmWrite;
  }else{
   this.scheduleKeepalive();
   await this.battleAlarmWrite;
  }
  const spawn=this.room.spawnMvp(room,this.now(),species);
  if(!spawn)return new Response(JSON.stringify({err:'The Social room could not spawn that MVP.'}),{status:409,headers:{'Content-Type':'application/json'}});
  this.scheduleKeepalive();
  await this.battleAlarmWrite;
  if(this.mvpWrites)await this.mvpWrites;
  return new Response(JSON.stringify({ok:true,...spawn}),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }
 async fetch(request){
  await this.ready;
  if(this.ledgerLoadFailed){
   // Retry once per connection attempt instead of refusing this room until it is evicted (v326).
   try{await this.loadLedgers()}
   catch(error){console.error('Poker ledger load failed',error);return new Response('Poker ledger unavailable',{status:503})}
  }
  const requestPath=new URL(request.url).pathname;
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
   server.addEventListener('message',e=>{this.room.receive(c,e.data);this.pinSocket(server,c);if(this.room.hasActiveBattles())this.scheduleBattleAlarm()});
   server.addEventListener('close',()=>{this.room.disconnect(c);this.scheduleKeepalive();});
   server.addEventListener('error',()=>{this.room.disconnect(c);this.scheduleKeepalive();});
  }
  this.scheduleKeepalive();
  return new Response(null,{status:101,webSocket:client});
 }
 async webSocketMessage(ws,message){
  await this.ready;const c=this.clientFor(ws);if(!c)return;
  this.room.receive(c,typeof message==='string'?message:new TextDecoder().decode(message));
  this.pinSocket(ws,c);if(this.room.hasActiveBattles())this.scheduleBattleAlarm();
 }
 async webSocketClose(ws){
  await this.ready;const c=this.clientFor(ws);if(c){this.room.disconnect(c);this.scheduleKeepalive();}
 }
 async webSocketError(ws){
  await this.ready;const c=this.clientFor(ws);if(c){this.room.disconnect(c);this.scheduleKeepalive();}
 }
 async alarm(){
  await this.ready;this.restoreSockets();this.room.retryPokerLedgers();
  if(this.mvpLoadFailed){
   await this.loadMvpState();
   if(this.mvpLoaded){
    this.scheduleKeepalive();
   }
  }else if(this.mvpSaveFailed){
   await this.saveMvpState();
  }
  this.room.sweep();
  await this.room.ledgerWrites;await this.historyWrites;await this.battleAlarmWrite;if(this.mvpWrites)await this.mvpWrites;
  const at=this.nextAlarmAt();this.battleAlarmAt=this.room.hasActiveBattles()?at:0;
  if(at)await this.ctx.storage.setAlarm(at);
  else if(this.mvpLoaded&&typeof this.ctx.storage.deleteAlarm==='function')await this.ctx.storage.deleteAlarm();
 }
}
export default {fetch(){return new Response('Not found',{status:404})}};
