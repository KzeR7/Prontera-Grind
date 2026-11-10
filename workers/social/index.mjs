import {SocialRoom,cleanWorldHistory,cleanPokerLedgerQueues,FISHING_MVP_IDS,SOCIAL_MAX_ROOMS} from './room.mjs';
const HISTORY_KEY='world-history-v1';
const LEDGER_PREFIX='poker-ledger-v1:';
// v296: the plaza spot a dropped client resumes is durable, so a Durable Object eviction between
// the drop and the reconnect no longer respawns the player at the entrance mid-fishing-session.
const RESUME_PREFIX='resume-v1:';
export class Social {
 constructor(ctx){
  this.ctx=ctx;this.historyWrites=Promise.resolve();this.ledgerLoadFailed=false;
  this.resumeWrites=Promise.resolve();
  this.room=new SocialRoom({
   onWorldMessage:()=>this.saveHistory(),
   onPokerLedger:(accountId,events)=>ctx.storage.put(LEDGER_PREFIX+accountId,events),
   onResume:(accountId,record)=>this.saveResume(accountId,record),
   onBattleActivity:()=>this.scheduleBattleAlarm(),
  });
  this.battleAlarmAt=0;this.battleAlarmWrite=Promise.resolve();
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
  this.ready=Promise.all([historyReady,ledgerReady,resumeReady]);
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
 scheduleBattleAlarm(){
  if(!this.room.hasActiveBattles())return;
  const now=Date.now();if(this.battleAlarmAt-now>100&&this.battleAlarmAt-now<1000)return;
  const at=now+250;this.battleAlarmAt=at;
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
  const requestPath=new URL(request.url).pathname;
  if(requestPath==='/gm/fishing-mvp')return this.adminFishingMvp(request);
  if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket'){
   // v367: the 426 is the only non-destructive probe of this room. Let it carry the last greeting
   // failure, so /api/chatcheck can report a room-side fault instead of declaring victory.
   const failed=this.room.lastSendError;
   return new Response('WebSocket required',{status:426,headers:failed?{'X-Greet-Failed':failed}:{}});
  }
  const identity=JSON.parse(request.headers.get('X-Social-Identity')||'null');if(!identity||!Number.isInteger(identity.id)||typeof identity.username!=='string')return new Response('Invalid identity',{status:400});
  const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();
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
  server.addEventListener('message',e=>{this.room.receive(c,e.data);if(this.room.hasActiveBattles())this.scheduleBattleAlarm()});server.addEventListener('close',()=>this.room.disconnect(c));server.addEventListener('error',()=>this.room.disconnect(c));
  if(await this.ctx.storage.getAlarm()===null)await this.ctx.storage.setAlarm(Date.now()+60000);
  return new Response(null,{status:101,webSocket:client});
 }
 async alarm(){
  await this.ready;this.room.retryPokerLedgers();this.room.sweep();
  await this.room.ledgerWrites;await this.historyWrites;await this.battleAlarmWrite;
  if(this.room.hasActiveBattles()){this.battleAlarmAt=Date.now()+250;await this.ctx.storage.setAlarm(this.battleAlarmAt)}
  else {this.battleAlarmAt=0;if(this.room.clients.size||this.room.resumes.size||this.room.ledgerDirty.size||this.room.hasActiveMvp())await this.ctx.storage.setAlarm(Date.now()+60000)}
 }
}
export default {fetch(){return new Response('Not found',{status:404})}};
