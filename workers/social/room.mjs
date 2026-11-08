import '../../assets/digimon/roster.js';
import '../../assets/digimon/base-stats.js';
import '../../assets/social-rules.js';
import '../../assets/social-poker.js';
import '../../assets/digimon-battle.js';
const R=globalThis.PGSocialRules,P=globalThis.PGSocialPoker,B=globalThis.PGDigimonBattle;
// v236: two different clocks. IDLE_MS is how long a silent connection may sit before the sweep
// removes it - that is what kills half-open sockets. REAUTH_MS is the security bound: a connection
// has to go back through Pages (which re-checks the D1 session and the ban flag) this often, because
// the socket itself is the only thing that proves who the player is. The age of a connection is
// measured from when it was accepted, and activity slides the idle window forward, so an active
// player is no longer dropped every five minutes the way REAUTH_MS alone used to force.
const IDLE_MS=300000,REAUTH_MS=1800000,MAX_ROOMS=50,LEDGER_BATCH=100;
// v295: RESUME_MS is the window in which a replacement socket may inherit the position, room and
// seat of the one it replaced. It used to be 15 s, which was shorter than the client's own
// dead-socket detection (20 s of silence + a 6 s probe grace) - so any silent drop, and every
// throttled background tab, resumed AFTER the reservation had expired. The client then fell
// through to a fresh join, which spawns at the plaza entrance, and fishing cancelled itself with
// "You stepped away from the pond." Matching the idle window fixes the AFK spawn teleport: the
// reservation is still single-use (takeResume deletes it), still authenticated by Pages before
// the socket exists, and still bounded - it just covers realistic reconnect latency.
const RESUME_MS=IDLE_MS;
// A poker seat is a different promise from a plaza spot: an abandoned seat must free up quickly
// or it stalls the hand for everyone else, so it keeps the short v290 grace.
const POKER_RESUME_MS=15000;
const LEDGER_REASONS=new Set(['blind','call','raise','win']);
// v295: bounded vocabulary for the two fishing broadcasts. Species ids are validated by shape
// here (the catalog belongs to the browser module) and again by the client before anything is
// drawn, so an unknown id simply renders nothing.
const FISH_MODES=new Set(['flight','wait','bite','reel','ready']);
const FISH_RODS=new Set(['twig','oak','brass','silver','golden','mythril']);
const FISH_MUTATIONS=new Set(['shiny','sparkling','frozen','electric','ghostly','golden','prismatic']);
// v297: the biggest catch in the catalog is a 1.8 t whale shark, so the show-off weight clamp
// follows the game's weight ceiling instead of the old 60 kg-era 999.
const MAX_FISH_W=5000;
const ledgerIdValid=id=>typeof id==='string'&&/^[A-Za-z0-9:_-]{1,100}$/.test(id);
// Only public World text/emotions are durable. Whispers and Local never enter this record.
export function cleanWorldHistory(value){
 if(!Array.isArray(value))return [];
 return value.filter(m=>m&&m.type==='message'&&m.channel==='world'&&Number.isSafeInteger(m.id)&&m.id>0&&Number.isFinite(m.at)&&Number.isInteger(m.from)&&typeof m.name==='string'&&typeof m.body==='string'&&m.body.length<=300&&(!m.emotion||R.EMOTIONS.includes(m.emotion))).slice(-100).map(m=>({type:'message',id:m.id,at:m.at,from:m.from,name:m.name.slice(0,32),gm:m.gm===true,channel:'world',body:m.body,room:0,...(m.emotion?{emotion:m.emotion}:{})}));
}
// Poker chip movements are a personal, durable outbox - never part of public World history.
// An event keeps its id until that account acknowledges it after saving its wallet. Replay is
// therefore safe after a lost socket, an expired seat reservation, or a Durable Object restart.
export function cleanPokerLedger(value){
 if(!value||value.type!=='poker_ledger'||!ledgerIdValid(value.id)||!Number.isSafeInteger(value.delta)||value.delta===0||Math.abs(value.delta)>1e9||!Number.isInteger(value.room)||value.room<1||!Number.isInteger(value.tableId)||value.tableId<0||value.tableId>=R.POKER.tables.length||!Number.isSafeInteger(value.handNo)||value.handNo<0||!Number.isFinite(value.at)||!LEDGER_REASONS.has(value.reason))return null;
 return {type:'poker_ledger',id:value.id,at:value.at,room:value.room,tableId:value.tableId,handNo:value.handNo,delta:value.delta,reason:value.reason};
}
export function cleanPokerLedgerQueues(value){
 if(!Array.isArray(value))return [];
 const queues=[];
 for(const pair of value){
  if(!Array.isArray(pair)||!Number.isInteger(pair[0])||pair[0]<1||!Array.isArray(pair[1]))continue;
  const seen=new Set(),events=[];
  for(const raw of pair[1]){const event=cleanPokerLedger(raw);if(!event||seen.has(event.id))continue;seen.add(event.id);events.push(event)}
  queues.push([pair[0],events]);
 }
 return queues;
}
// Only positive integer account ids belong in a friend list.
const cleanFriendId=id=>Number.isInteger(id)&&id>0;
function routeDist(from,route){let d=0,x=from.x,z=from.z;for(const pt of route){d+=Math.hypot(pt.x-x,pt.z-z);x=pt.x;z=pt.z}return d;}
// A service binding is the only ingress. Identity is supplied by authenticated Pages.
export class SocialRoom {
 constructor(opts={}){
  this.now=opts.now||(()=>Date.now());
  this.autoTimers=opts.autoTimers??!opts.now;
  this.clients=new Map();this.history=cleanWorldHistory(opts.history);this.serial=Math.max(0,...this.history.map(m=>m.id));
  this.onWorldMessage=opts.onWorldMessage||(()=>{});
  this.onPokerLedger=opts.onPokerLedger||(()=>{});
  // v296: optional persistence for plaza reservations, so they survive a Durable Object eviction.
  this.onResume=opts.onResume||null;
  this.ledgerQueues=new Map(cleanPokerLedgerQueues(opts.ledgers));
  this.ledgerWrites=Promise.resolve();this.ledgerDirty=new Set();this.ledgerVersions=new Map();
  this.tables=new Map();this.timers=new Map();this.resumes=new Map();
  // Sanctuary combat is room-owned. Client messages are intents only; the simulation and
  // settlement below never accept a client-reported winner, damage total or reward amount.
  this.random=opts.random||B.randomUnit;this.battleSerial=0;this.pveRuns=new Map();
  this.pvpQueues=new Map();this.pvpMatches=new Map();this.pvpByRoom=new Map();this.parties=new Map();this.partyInvites=new Map();
  this.onBattleActivity=opts.onBattleActivity||null;
 }
 send(c,event){try{c.send(JSON.stringify(event))}catch{this.disconnect(c)}}
 persistPokerLedger(accountId){
  const version=(this.ledgerVersions.get(accountId)||0)+1;this.ledgerVersions.set(accountId,version);this.ledgerDirty.add(accountId);
  const snapshot=(this.ledgerQueues.get(accountId)||[]).map(event=>({...event}));
  const write=this.ledgerWrites.then(()=>this.onPokerLedger(accountId,snapshot)).then(()=>{if(this.ledgerVersions.get(accountId)===version)this.ledgerDirty.delete(accountId)});
  this.ledgerWrites=write.catch(error=>console.error('Poker ledger save failed',error));
  return write;
 }
 retryPokerLedgers(){for(const id of [...this.ledgerDirty])this.persistPokerLedger(id).catch(()=>{})}
 recordPokerLedger(accountId,detail){
  if(!Number.isInteger(accountId)||accountId<1)return;
  const event=cleanPokerLedger({type:'poker_ledger',id:'poker:'+crypto.randomUUID(),at:this.now(),...detail});if(!event)return;
  const queue=this.ledgerQueues.get(accountId)||[];queue.push(event);this.ledgerQueues.set(accountId,queue);
  this.persistPokerLedger(accountId).then(()=>{
   const c=this.clients.get(accountId);if(!c)return;
   (c.ledgerAckPending||(c.ledgerAckPending=new Set())).add(event.id);this.send(c,event);
  }).catch(()=>{});
 }
 flushPokerLedgers(c){
  if(this.ledgerDirty.has(c.id)||c.ledgerAckPending?.size)return;
  const batch=(this.ledgerQueues.get(c.id)||[]).slice(0,LEDGER_BATCH);if(!batch.length)return;
  c.ledgerAckPending=new Set(batch.map(event=>event.id));
  for(const event of batch)this.send(c,event);
 }
 replayPokerLedgers(c){
  const ready=this.ledgerDirty.has(c.id)?this.persistPokerLedger(c.id):this.ledgerWrites;
  ready.then(()=>{if(this.clients.get(c.id)===c&&!this.ledgerDirty.has(c.id))this.flushPokerLedgers(c)}).catch(()=>{});
 }
 ackPokerLedgers(c,m){
  if(!Array.isArray(m.ids)||m.ids.length>LEDGER_BATCH)return;
  const ids=new Set(m.ids.filter(ledgerIdValid)),queue=this.ledgerQueues.get(c.id)||[];
  const next=queue.filter(event=>!ids.has(event.id));
  for(const id of ids)c.ledgerAckPending?.delete(id);
  const changed=next.length!==queue.length;
  if(changed){if(next.length)this.ledgerQueues.set(c.id,next);else this.ledgerQueues.delete(c.id)}
  const ready=changed?this.persistPokerLedger(c.id):this.ledgerWrites;
  ready.then(()=>{if(this.clients.get(c.id)===c&&!c.ledgerAckPending?.size)this.flushPokerLedgers(c)}).catch(()=>{});
 }
 // A planned refresh tells the client before the socket closes, so it can reconnect and rejoin
 // without showing a failure or losing the player's seat.
 refresh(c){c.refreshing=true;this.disconnect(c);this.send(c,{type:'reauth'});c.close(4000,'Refresh session')}
 broadcast(event,filter=()=>true){for(const c of this.clients.values())if(filter(c))this.send(c,event)}
 // A player event is personal: `friend` is true only for a client whose account is friends with this
 // one, so the same character cannot be described identically to everybody in the plaza.
 broadcastPlayer(subject,filter=()=>true,except=null){for(const p of this.clients.values())if(p!==except&&filter(p))this.send(p,{type:'player',player:this.snapshot(subject,p)})}
 // Friendship is mutual, so a client listing someone as a friend is also listed by them: the room
 // mirrors the pair for the connected side, and both screens agree immediately. Display only - the
 // authority is the D1 row behind GET /api/friends.
 //
 // Joining only ever adds. A client that has just connected, or that joins a room, knows its own
 // friendships but nothing about the other side, so it must not be able to clear a mark somebody
 // else is already showing; `syncFriends` is the explicit statement that may also drop one.
 adoptFriends(c){
  let touched=false;
  for(const other of this.clients.values()){
   if(other===c)continue;
   if(other.friends.has(c.id)&&!c.friends.has(other.id))c.friends.add(other.id);
   if(c.friends.has(other.id)&&!other.friends.has(c.id)){other.friends.add(c.id);touched=true;if(other.room)this.send(other,{type:'player',player:this.snapshot(other,other)})}
  }
  return touched;
 }
 // A live list is reconciled both ways: whoever spoke last decides for the pair, so accepting a
 // request marks the other player too and unfriending stops the mark instead of leaving it behind.
 syncFriends(c,ids,now=this.now()){
  if(c.friendsAt&&now-c.friendsAt<2000)return false;
  c.friendsAt=now;
  const next=new Set((Array.isArray(ids)?ids:[]).filter(cleanFriendId).slice(0,200));
  for(const other of this.clients.values()){
   if(other===c)continue;
   const mine=next.has(other.id),theirs=other.friends.has(c.id);
   if(mine===theirs)continue;
   if(mine)other.friends.add(c.id);else other.friends.delete(c.id);
   if(other.room)this.send(other,{type:'player',player:this.snapshot(other,other)});
  }
  c.friends=next;
  if(c.room)this.broadcastPlayer(c,p=>p.room===c.room);
  return true;
 }
 roomCount(room,now=this.now()){
  let count=0;for(const p of this.clients.values())if(p.room===room)count++;
  for(const r of this.resumes.values())if(r.room===room&&r.expires>now)count++;
  return count;
 }
 roomList(){
  const counts=new Map();let maxRoom=1;
  for(const p of this.clients.values())if(p.room>0){counts.set(p.room,(counts.get(p.room)||0)+1);if(p.room>maxRoom)maxRoom=p.room;}
  for(const r of this.resumes.values())if(r.expires>this.now()){counts.set(r.room,(counts.get(r.room)||0)+1);if(r.room>maxRoom)maxRoom=r.room;}
  const top=(counts.get(maxRoom)||0)>0&&maxRoom<MAX_ROOMS?maxRoom+1:maxRoom;
  const list=[];for(let id=1;id<=top;id++)list.push({id,count:counts.get(id)||0});
  return list;
 }
 // v319: the field HUD's Social Hub button shows how busy Fountain Plaza is, so room counts now
 // go to every connected chat client, not only to players already standing in a plaza. The
 // friend count is personal, so each client gets its own payload instead of one broadcast.
 plazaPopulation(c,rooms,now=this.now()){
  let friends=0;
  for(const p of this.clients.values())if(p.room>0&&p!==c&&c.friends.has(p.id))friends++;
  for(const [id,r] of this.resumes)if(r.room>0&&r.expires>now&&id!==c.id&&c.friends.has(id))friends++;
  return {total:rooms.reduce((n,r)=>n+(r.count||0),0),friends};
 }
 syncRooms(skip=null){const rooms=this.roomList();for(const c of this.clients.values()){if(c===skip)continue;this.send(c,{type:'rooms',rooms,plaza:this.plazaPopulation(c,rooms)})}}
 pokerTables(room){
  let list=this.tables.get(room);
  if(!list){
   list=R.POKER.tables.map(spec=>new P.HoldemTable({
    tableId:spec.id,label:spec.label,dealerName:spec.dealer.name,
    onLedger:(playerId,delta,reason)=>this.recordPokerLedger(playerId,{room,tableId:spec.id,handNo:list[spec.id]?.handNo||0,delta,reason}),
    onCallout:body=>{this.broadcast({type:'poker_callout',room,tableId:spec.id,body,at:this.now()},p=>p.room===room);},
    onKick:info=>{
     const p=this.clients.get(info.id);
     if(p&&p.room===room){
      p.pokerSeat=null;p.sit=false;p.path=[];
      this.broadcastPlayer(p,x=>x.room===room);
      this.send(p,{type:'poker_kicked',tableId:info.tableId,reason:info.reason,message:info.reason==='empty'?'Stood up from table (out of chips / idle).':'Auto-removed from seat due to AFK inactivity.'});
     }
    }
   }));
   this.tables.set(room,list);
  }
  return list;
 }
 pokerPayload(room,viewerId,now=this.now()){
  const list=this.pokerTables(room);
  const snaps=list.map(t=>t.snapshotFor(viewerId,now));
  const active=snaps.find(s=>s.me)||snaps[0];
  return {type:'poker',poker:active,tables:snaps};
 }
 broadcastPoker(room,now=this.now()){
  if(!this.tables.has(room))return;
  for(const p of this.clients.values())if(p.room===room)this.send(p,this.pokerPayload(room,p.id,now));
 }
 syncPokerArrivals(room,now=this.now()){
  const list=this.tables.get(room);if(!list)return false;
  let changed=false;
  for(const p of this.clients.values()){
   if(p.room!==room||!Number.isInteger(p.pokerSeat))continue;
   R.advance(p,now);
   const t=list[Math.floor(p.pokerSeat/6)];
   if(t&&p.sit&&!p.path.length&&t.markArrived(p.id,true,now))changed=true;
  }
  return changed;
 }
 schedulePoker(room){
  const prev=this.timers.get(room);if(prev){clearTimeout(prev);this.timers.delete(room);}
  if(!this.autoTimers)return;
  const members=[...this.clients.values()].filter(p=>p.room===room);
  if(!members.length)return;
  const now=this.now(),list=this.tables.get(room);
  let next=0;
  if(list)for(const t of list){const d=t.nextDeadline();if(d&&(!next||d<next))next=d;}
  for(const p of members){
   if(Number.isInteger(p.pokerSeat)&&p.path.length){
    const eta=now+Math.ceil(routeDist(p,p.path)/R.walkSpeed(p)*1000)+40;
    if(!next||eta<next)next=eta;
   }
  }
  if(!next)return;
  const delay=Math.max(15,Math.min(30000,next-now));
  const handle=setTimeout(()=>this.tickRoom(room),delay);
  handle?.unref?.();
  this.timers.set(room,handle);
 }
 tickRoom(room,now=this.now()){
  const list=this.tables.get(room);if(!list)return;
  const arrived=this.syncPokerArrivals(room,now);
  let ticked=false;
  for(const t of list)if(t.tick(now))ticked=true;
  if(arrived||ticked)this.broadcastPoker(room,now);
  this.schedulePoker(room);
 }
 tickAll(now=this.now()){for(const room of this.tables.keys())this.tickRoom(room,now);}
 standPoker(c,now=this.now(),notify=true){
  if(!Number.isInteger(c.pokerSeat))return false;
  const room=c.room,tableId=Math.floor(c.pokerSeat/6);c.pokerSeat=null;
  const list=room?this.tables.get(room):null;
  if(list&&list[tableId]){list[tableId].stand(c.id,now);if(notify&&room)this.broadcastPoker(room,now);this.schedulePoker(room);}
  return true;
 }
 connect(identity,send,close){
  const prior=this.clients.get(identity.id);if(prior){this.disconnect(prior);prior.close(4001,'Connected in another tab');}
  // v279: `gm` comes from the same server-resolved identity header as `friends` - it is never sent by
  // the browser, so a player cannot label themselves staff by editing anything on the client.
  const c={id:identity.id,name:identity.username,gm:identity.gm===true,send,close,room:0,at:this.now(),path:[],x:0,z:12,dir:0,sit:false,nextChat:0,seat:null,pokerSeat:null,moveAt:0,lookAt:0,expires:this.now()+IDLE_MS,reauthAt:this.now()+REAUTH_MS,friends:new Set(Array.isArray(identity.friends)?identity.friends.filter(cleanFriendId).slice(0,200):[])};
  // A replacement socket is authenticated by Pages before it can inherit a short-lived position.
  // Never accept coordinates, a room id or a seat from the browser's join payload.
  const resume=this.takeResume(c.id,this.now());
  if(resume){
   Object.assign(c,{room:resume.room,x:resume.x,z:resume.z,dir:resume.dir,path:[],at:this.now(),sit:resume.sit,seat:resume.seat,pokerSeat:resume.pokerSeat,look:resume.look,resumed:true});
   // Old resumable locations may now be underwater or the old pond chairs may have moved.
   if(Number.isInteger(c.seat)&&R.SEATS[c.seat]){const seat=R.SEATS[c.seat];c.x=seat.x;c.z=seat.z;}
   else if(!Number.isInteger(c.pokerSeat)&&!R.walkable(c.x,c.z)){c.x=0;c.z=12;c.sit=false;c.seat=null;}
   if(Number.isInteger(c.seat)&&[...this.clients.values()].some(p=>p!==c&&p.room===c.room&&p.seat===c.seat)){c.seat=null;c.sit=false}
  }
  this.clients.set(c.id,c);
  // The list Pages sent at connect time is mirrored at once, so a player who is already in a plaza
  // and is on your list is drawn as a friend even if you connected second.
  this.adoptFriends(c);
  this.send(c,{type:'hello',id:c.id,name:c.name,gm:c.gm,history:this.history});
  // v319: a freshly connected field client learns the plaza population at once, instead of
  // waiting for the next join or leave to light the Social Hub badge.
  const rooms=this.roomList();this.send(c,{type:'rooms',rooms,plaza:this.plazaPopulation(c,rooms)});
  // The durable personal outbox is independent of the short-lived seat reservation.
  this.replayPokerLedgers(c);return c;
 }
 // v225: lv drives the level aura and speed is the character's field run speed. Both are
 // presentation hints: lv is clamped to a display tier input, speed to the shared walk band, so a
 // client cannot make itself faster than the fastest legal character in the plaza.
 cleanLook(look){if(!look||typeof look.cls!=='string'||look.cls.length>40||!look.appearance||JSON.stringify(look).length>1200)return null;return {cls:look.cls,appearance:look.appearance,refine:Math.max(0,Math.min(15,Number(look.refine)||0)),title:typeof look.title==='string'?look.title.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,64):'',fishTitle:typeof look.fishTitle==='string'?look.fishTitle.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,64):'',lv:Math.max(0,Math.min(999,Math.floor(Number(look.lv)||0))),speed:Math.max(R.MIN_SPEED,Math.min(R.MAX_SPEED,Number(look.speed)||R.SPEED)),...(R.cleanDigimon(look.digimon)?{digimon:R.cleanDigimon(look.digimon)}:{})};}
 // Gym reservations are per room and per apparatus, with at most one per owner.
 // They are presentation only, not trusted progression or competitive stats.
 gymSnapshot(room){return [...this.clients.values()].filter(p=>p.gym&&p.gym.room===room).map(p=>({owner:p.id,...p.gym}))}
 broadcastGym(room){if(room)this.broadcast({type:'gym',room,entries:this.gymSnapshot(room)},p=>p.room===room)}
 stopGym(c){if(!c.gym)return;const room=c.gym.room;c.gym=null;this.broadcastGym(room)}
 startGym(c,m,now){
  const request=Number.isSafeInteger(m.request)&&m.request>0?m.request:null;
  const slots=Object.hasOwn(R.GYM_STATIONS,m.stat)?R.GYM_STATIONS[m.stat]:null,species=R.cleanDigimon(m.species);if(!c.room||!slots||!species)return this.send(c,{type:'gym_error',request,message:'Choose a valid companion and gym station.'});
  if(c.gym)return this.send(c,{type:'gym_error',request,message:'Only one companion can train in the gym at a time.'});
  R.advance(c,now);if(c.sit||c.path.length||!slots.some(s=>Math.hypot(c.x-s.x,c.z-s.z)<=9))return this.send(c,{type:'gym_error',request,message:'Walk close to the station and stand still first.'});
  const used=new Set([...this.clients.values()].filter(p=>p.gym?.room===c.room&&p.gym.stat===m.stat).map(p=>p.gym.slot)),slot=slots.findIndex((_,i)=>!used.has(i));
  if(slot<0)return this.send(c,{type:'gym_error',request,message:'All '+m.stat+' equipment is in use. Please try again shortly.'});
  // v349: the client reports which partner slot is training. Only that slot is barred
  // from battles; the same player's other three slots may still grind or spar.
  const partnerSlot=Math.max(0,Math.min(3,Number.isSafeInteger(m.slot)?m.slot:0));
  c.gym={room:c.room,stat:m.stat,slot,species,partnerSlot};this.send(c,{type:'gym_started',request,gym:c.gym});this.broadcastGym(c.room);
 }
 // ----------------------------- Sanctuary PvE / PvP -----------------------------
 battleId(kind){return kind+':'+this.now().toString(36)+':'+(++this.battleSerial).toString(36)}
 battleProfile(c,raw){
  const p=B.profile(raw);if(!p||!c.look?.digimon||c.look.digimon!==p.form)return null;return p;
 }
 trainingBlocks(c,p){return !!(c.gym&&Number.isInteger(c.gym.partnerSlot)&&p.slot===c.gym.partnerSlot)}
 fieldReady(c,now){R.advance(c,now);return c.room>0&&!c.sit&&!c.path.length&&Math.abs(c.x-70)<=25&&Math.abs(c.z-64)<=16}
 ringSide(c,now){
  R.advance(c,now);const r=R.SANCTUARY_RING;if(!c.room||c.sit||c.path.length)return null;
  // Both the canvas and the marked approach below it are valid entrances. Left/right is
  // determined from the character, not from a client-supplied side string.
  if(Math.abs(c.x-r.x)>r.w/2+6||c.z<r.z-r.d/2-2||c.z>r.z+r.d/2+11)return null;
  return c.x<r.x?'left':c.x>r.x?'right':null;
 }
 battleSnapshot(room){
  const pve=[...this.pveRuns.values()].filter(r=>r.room===room&&r.phase!=='ended').map(B.pveSnapshot);
  const match=this.pvpByRoom.get(room),queue=this.pvpQueues.get(room)||[];
  return {pve,pvp:match?B.pvpSnapshot(match):null,queue:queue.map(q=>({id:q.id,name:q.name,side:q.side}))};
 }
 broadcastBattle(room){if(room)this.broadcast({type:'battle',room,at:this.now(),...this.battleSnapshot(room)},p=>p.room===room)}
 hasActiveBattles(){return this.pveRuns.size>0||this.pvpMatches.size>0||[...this.pvpQueues.values()].some(q=>q.length)}
 battleActivity(){this.onBattleActivity?.()}
 battleError(c,message,request=null){this.send(c,{type:'battle_error',request,message})}
 startPve(c,m,now){
  const request=Number.isSafeInteger(m.request)&&m.request>0?m.request:null;
  if(c.pve||c.pvp)return this.battleError(c,'Finish the current DigiPet activity first.',request);
  if(!this.fieldReady(c,now))return this.battleError(c,'Stand still inside the middle DigiPet farm to grind.',request);
  const p=this.battleProfile(c,m.profile);if(!p)return this.battleError(c,'Choose your current owned partner first.',request);
  if(this.trainingBlocks(c,p))return this.battleError(c,'The training partner cannot battle. Switch to another partner slot first.',request);
  if([...this.pveRuns.values()].filter(r=>r.room===c.room).length>=8)return this.battleError(c,'The field is full. Try another plaza.',request);
  const run=B.createPve({id:this.battleId('pve'),owner:c.id,room:c.room,profile:p,now,random:this.random});
  const used=new Set([...this.pveRuns.values()].filter(r=>r.room===c.room).map(r=>r.slot));run.slot=Array.from({length:8},(_,i)=>i).find(i=>!used.has(i))||0;
  c.pve=run;this.pveRuns.set(run.id,run);this.send(c,{type:'pve_started',request,battleId:run.id});this.broadcastBattle(c.room);this.battleActivity();
 }
 stopPve(c,reason='stopped',notify=true){
  const run=c.pve;if(!run)return false;
  if(run.party&&Array.isArray(run.members)){this.leavePartyRun(c,run,reason);return true}
  c.pve=null;this.pveRuns.delete(run.id);
  if(notify)this.send(c,{type:'pve_end',battleId:run.id,reason,earned:{...run.earned}});this.broadcastBattle(run.room);return true;
 }
 queuePvp(c,m,now){
  const request=Number.isSafeInteger(m.request)&&m.request>0?m.request:null;
  if(c.pve||c.pvp)return this.battleError(c,'Finish the current DigiPet activity first.',request);
  const side=this.ringSide(c,now);if(!side)return this.battleError(c,'Stand on the left or right side of the ring, or its marked approach below, and stand still.',request);
  const p=this.battleProfile(c,m.profile);if(!p)return this.battleError(c,'Choose your current owned partner first.',request);
  if(this.trainingBlocks(c,p))return this.battleError(c,'The training partner cannot battle. Switch to another partner slot first.',request);
  const queue=this.pvpQueues.get(c.room)||[];this.pvpQueues.set(c.room,queue);
  const entry={id:c.id,name:c.name,side,profile:p,at:now};queue.push(entry);c.pvp={queue:true,side};
  this.send(c,{type:'pvp_waiting',request,side});this.pairPvp(c.room,now);this.broadcastBattle(c.room);this.battleActivity();
 }
 pairPvp(room,now){
  if(this.pvpByRoom.has(room))return;const queue=this.pvpQueues.get(room)||[];
  let pair=null;for(let i=0;i<queue.length&&!pair;i++)for(let j=i+1;j<queue.length;j++)if(queue[i].id!==queue[j].id&&queue[i].side!==queue[j].side){pair=[queue[i],queue[j]];break}
  if(!pair)return;const [a,b]=pair;this.pvpQueues.set(room,queue.filter(q=>q!==a&&q!==b));
  const ca=this.clients.get(a.id),cb=this.clients.get(b.id);if(!ca||!cb){if(ca)ca.pvp=null;if(cb)cb.pvp=null;return this.pairPvp(room,now)}
  const match=B.createPvp({id:this.battleId('pvp'),room,now,players:[a,b]});this.pvpMatches.set(match.id,match);this.pvpByRoom.set(room,match);
  ca.pvp={matchId:match.id};cb.pvp={matchId:match.id};
  for(const c of [ca,cb])this.send(c,{type:'pvp_offer',battleId:match.id,opponent:c===ca?{id:b.id,name:b.name,form:b.profile.form,stage:b.profile.stage}:{id:a.id,name:a.name,form:a.profile.form,stage:a.profile.stage},expiresAt:match.expiresAt});
 }
 acceptPvp(c,now){
  const match=c.pvp?.matchId&&this.pvpMatches.get(c.pvp.matchId);if(!match||match.room!==c.room)return;
  if(match.phase!=='offer')return;if(!this.ringSide(c,now))return this.battleError(c,'Stay by the ring until both players accept.');
  if(B.acceptPvp(match,c.id,now)){this.broadcastBattle(match.room);this.battleActivity();if(match.phase==='countdown')for(const p of match.participants){const other=this.clients.get(p.id);if(other)this.send(other,{type:'pvp_countdown',battleId:match.id,startsAt:match.countdownUntil,serverNow:now})}}
 }
 cancelPvp(c,reason='declined',now=this.now()){
  if(c.pvp?.queue){const queue=this.pvpQueues.get(c.room)||[];this.pvpQueues.set(c.room,queue.filter(q=>q.id!==c.id));c.pvp=null;this.broadcastBattle(c.room);return}
  const match=c.pvp?.matchId&&this.pvpMatches.get(c.pvp.matchId);if(!match){c.pvp=null;return}
  if(match.phase==='fighting'||match.phase==='countdown'){
   const other=match.participants.find(p=>p.id!==c.id);if(other&&match.phase==='fighting'){B.finishPvp(match,other.id,'forfeit',now);this.settlePvp(match);}else{match.phase='closed';match.reason=reason;this.sendMatchCancel(match,reason)}
  }else if(match.phase==='offer'){match.phase='closed';match.reason=reason;this.sendMatchCancel(match,reason)}
  c.pvp=null;this.cleanupPvp(match);this.broadcastBattle(match.room);this.battleActivity();
 }
 sendMatchCancel(match,reason){for(const p of match.participants){const c=this.clients.get(p.id);if(c)this.send(c,{type:'pvp_cancelled',battleId:match.id,reason})}}
 settlePvp(match){
  if(match.settled)return;match.settled=true;const rewards=B.pvpRewards(match);
  for(const p of match.participants){const c=this.clients.get(p.id);if(!c)continue;this.send(c,{type:'battle_result',kind:'pvp',battleId:match.id,winnerId:match.winnerId,reason:match.reason,lineId:p.profile.lineId,form:p.profile.form,slot:p.profile.slot,outcome:rewards[p.id].outcome,reward:{...rewards[p.id]}})}
 }
 cleanupPvp(match){
  if(match.phase!=='closed')return;this.pvpMatches.delete(match.id);if(this.pvpByRoom.get(match.room)===match)this.pvpByRoom.delete(match.room);
  for(const p of match.participants){const c=this.clients.get(p.id);if(c?.pvp?.matchId===match.id)c.pvp=null}
  this.pairPvp(match.room,this.now());
 }
 // ---------------- v355: grind parties (up to three trainers, one shared field) -----------
 partyOf(c){for(const party of this.parties.values())if(party.members.some(m=>m.id===c.id))return party;return null}
 partyBroadcast(party,event){for(const m of party.members){const c=this.clients.get(m.id);if(c)this.send(c,event)}}
 partySync(party){
  if(!party||!party.members.length)return;
  const view={id:party.id,leader:party.leader,members:party.members.map(m=>({id:m.id,name:m.name}))};
  this.partyBroadcast(party,{type:'party',party:view});
  // Membership is public so the invite list can gray out trainers who are already taken.
  const room=this.clients.get(party.members[0].id)?.room;
  if(room)this.broadcast({type:'party_roster',parties:[...this.parties.values()].filter(p=>p.members.some(m=>this.clients.get(m.id)?.room===room)).map(p=>({id:p.id,members:p.members.map(m=>m.id)}))},c=>c.room===room);
 }
 partyError(c,request,message){this.send(c,{type:'party_error',request,message})}
 partyInvite(c,m,now){
  const request=Number.isSafeInteger(m.request)&&m.request>0?m.request:null;
  if(!c.room)return this.partyError(c,request,'Join a plaza before forming a party.');
  if(c.pve||c.pvp)return this.partyError(c,request,'Finish the current DigiPet activity first.');
  let party=this.partyOf(c);
  if(party&&party.leader!==c.id)return this.partyError(c,request,'Only the party leader can invite.');
  if(!party){party={id:'party:'+this.battleId('party'),leader:c.id,members:[{id:c.id,name:c.name}],createdAt:now};this.parties.set(party.id,party)}
  if(party.members.length>=3)return this.partyError(c,request,'The party is full (three trainers).');
  const target=this.clients.get(Number(m.targetId));
  if(!target||target.room!==c.room)return this.partyError(c,request,'That trainer is not in this plaza.');
  if(target.id===c.id)return this.partyError(c,request,'You are already in the party.');
  if(this.partyOf(target))return this.partyError(c,request,'That trainer is already in a party.');
  if(target.pve||target.pvp)return this.partyError(c,request,'That trainer is busy with a DigiPet activity.');
  const invite={partyId:party.id,fromId:c.id,fromName:c.name,expiresAt:now+30000};
  this.partyInvites.set(target.id,invite);
  this.send(target,{type:'party_invite',partyId:party.id,from:{id:c.id,name:c.name},expiresAt:invite.expiresAt});
  this.partySync(party);
 }
 partyAccept(c,m,now){
  const request=Number.isSafeInteger(m.request)&&m.request>0?m.request:null;
  const invite=this.partyInvites.get(c.id);
  if(!invite||invite.expiresAt<now)return this.partyError(c,request,'That party invite has expired.');
  const party=this.parties.get(invite.partyId);
  this.partyInvites.delete(c.id);
  if(!party||!party.members.length)return this.partyError(c,request,'That party no longer exists.');
  if(party.members.length>=3)return this.partyError(c,request,'The party filled up while you decided.');
  if(c.pve||c.pvp)return this.partyError(c,request,'Finish the current DigiPet activity first.');
  party.members.push({id:c.id,name:c.name});
  this.partySync(party);
 }
 partyDecline(c,now){
  const invite=this.partyInvites.get(c.id);this.partyInvites.delete(c.id);
  if(!invite)return;
  const from=this.clients.get(invite.fromId);if(from)this.send(from,{type:'party_notice',message:c.name+' declined the party invite.'});
 }
 partyRemove(c,reason='left'){
  const party=this.partyOf(c);if(!party)return;
  party.members=party.members.filter(m=>m.id!==c.id);
  if(!party.members.length){this.parties.delete(party.id);this.partySync(party);return}
  if(party.leader===c.id)party.leader=party.members[0].id;
  this.partySync(party);
  const leader=this.clients.get(party.leader);
  if(leader)this.send(leader,{type:'party_notice',message:reason==='left'?(c.name+' left the party.'):('The party leader is now '+party.members[0].name+'.')});
 }
 // Leaving a party run removes only that trainer's partner; the field stays alive for the rest.
 leavePartyRun(c,run,reason='stopped'){
  const idx=Array.isArray(run.members)?run.members.indexOf(c.id):-1;
  if(idx>=0){run.members.splice(idx,1);run.profiles.splice(idx,1);run.partners.splice(idx,1)}
  if(run.partners.length===0){run.phase='ended';run.reason=reason;this.pveRuns.delete(run.id)}
  else run.partner=run.partners[0];
  c.pve=null;
  const earned=(run.earnedBy&&run.earnedBy[c.id])||{...run.earned};
  this.send(c,{type:'pve_end',battleId:run.id,reason,earned:{...earned}});
  if(run.room)this.broadcastBattle(run.room);
 }
 startPartyPve(c,m,now){
  const request=Number.isSafeInteger(m.request)&&m.request>0?m.request:null;
  const party=this.partyOf(c);
  if(!party||party.leader!==c.id)return this.partyError(c,request,'Only the party leader can start the grind.');
  if(c.pve||c.pvp)return this.partyError(c,request,'Finish the current DigiPet activity first.');
  const members=party.members.map(m=>this.clients.get(m.id));
  if(members.some(mem=>!mem))return this.partyError(c,request,'Every party member must be online.');
  const validProfile=mem=>{const p=mem.partyProfile;if(!p||!mem.look?.digimon||mem.look.digimon!==p.form)return null;return p};
  for(const mem of members){
   if(mem.pve||mem.pvp)return this.partyError(c,request,(mem===c?'You are':mem.name+' is')+' busy with another DigiPet activity.');
   if(!this.fieldReady(mem,now))return this.partyError(c,request,mem===c?'Stand still inside the middle DigiPet farm to grind.':mem.name+' must stand still inside the middle DigiPet farm.');
   const p=validProfile(mem);
   if(!p)return this.partyError(c,request,mem===c?'Equip an owned partner, then reopen the Party panel.':mem.name+' has no owned partner equipped - they should reopen the Party panel.');
   if(this.trainingBlocks(mem,p))return this.partyError(c,request,mem.name+"'s training partner cannot battle.");
  }
  if([...this.pveRuns.values()].filter(r=>r.room===c.room).length>=8)return this.partyError(c,request,'The field is full. Try another plaza.');
  const profiles=members.map(validProfile);
  const run=B.createPve({id:this.battleId('pve'),owner:c.id,room:c.room,profiles,now,random:this.random});
  run.members=members.map(mem=>mem.id);run.earnedBy={};
  const used=new Set([...this.pveRuns.values()].filter(r=>r.room===c.room).map(r=>r.slot));
  run.slot=Array.from({length:8},(_,i)=>i).find(i=>!used.has(i))||0;
  for(const mem of members)mem.pve=run;
  this.pveRuns.set(run.id,run);
  for(const mem of members)this.send(mem,{type:'pve_started',request:mem===c?request:null,battleId:run.id,party:true});
  this.broadcastBattle(c.room);this.battleActivity();
 }
 stopBattle(c,reason='stopped',now=this.now()){
  const room=c.room;if(c.pve)this.stopPve(c,reason,false);if(c.pvp)this.cancelPvp(c,reason,now);if(room)this.broadcastBattle(room);
 }
 tickBattles(now=this.now()){
  const rooms=new Set();
  // v355: queue hygiene. A queued player who walks away from the ring (or disconnects) is
  // removed from the matchmaking queue instead of silently blocking their next activity —
  // the stuck "Finish the current DigiPet activity first." state this replaces.
  for(const [room,queue] of [...this.pvpQueues]){
   if(!queue.length)continue;
   const kept=queue.filter(q=>{
    const c=this.clients.get(q.id);
    if(!c)return false;
    const side=this.ringSide(c,now);
    if(side&&side===q.side)return true;
    if(c.pvp?.queue)c.pvp=null;
    this.send(c,{type:'pvp_cancelled',reason:'left-ring'});
    return false;
   });
   if(kept.length!==queue.length){this.pvpQueues.set(room,kept);rooms.add(room)}
  }
  for(const run of [...this.pveRuns.values()]){
   const result=B.stepPve(run,now,this.random);if(!result)continue;const c=this.clients.get(run.owner);rooms.add(run.room);
   for(const event of result.events){
    if(event.type==='wave_clear'&&run.party){
     // v355: every member is paid with their own partner's rank, and gear drops roll per member.
     run.earnedBy=run.earnedBy||{};
     for(let i=0;i<run.members.length;i++){
      const member=this.clients.get(run.members[i]);if(!member)continue;
      const prof=run.profiles[i]||run.profile,mine={...B.pveReward(run,prof),dropCoins:event.reward.dropCoins,eggs:event.reward.eggs};
      mine.coins+=mine.dropCoins;
      const gearDrop=B.pveGearDrops(run,this.random)||null;
      const totals=run.earnedBy[run.members[i]]||(run.earnedBy[run.members[i]]={coins:0,xp:0,wins:0,eggs:0,dropCoins:0,gear:0});
      totals.coins+=mine.coins;totals.xp+=mine.xp;totals.wins+=mine.wins;totals.eggs+=mine.eggs;totals.dropCoins+=mine.dropCoins;if(gearDrop)totals.gear++;
      this.send(member,{type:'battle_reward',kind:'pve',battleId:run.id+':wave'+event.wave+':'+run.members[i],lineId:prof.lineId,form:prof.form,slot:prof.slot,wave:event.wave,reward:mine,earned:{...totals},gearDrop});
     }
    }
    else if(event.type==='wave_clear'&&c)this.send(c,{type:'battle_reward',kind:'pve',battleId:run.id+':wave'+event.wave,lineId:run.profile.lineId,form:run.profile.form,slot:run.profile.slot,wave:event.wave,reward:{...event.reward},earned:{...run.earned},gearDrop:event.gearDrop||null});
    // v352: strikes are forwarded as presentation-only FX events. They carry no authority —
    // clients still render from snapshots; older clients simply ignore the message.
    if(event.type==='hit')this.broadcast({type:'battle_fx',kind:'pve',battleId:run.id,to:event.to,amount:event.amount,crit:!!event.crit},p=>p.room===run.room);
    if(event.type==='end'){
     if(run.party&&Array.isArray(run.members))for(const id of run.members){const member=this.clients.get(id);if(!member)continue;member.pve=null;this.send(member,{type:'pve_end',battleId:run.id,reason:event.reason,earned:{...((run.earnedBy&&run.earnedBy[id])||run.earned)}})}
     else{if(c)this.send(c,{type:'pve_end',battleId:run.id,reason:event.reason,earned:{...run.earned}});if(c)c.pve=null}
     this.pveRuns.delete(run.id);
    }
   }
  }
  for(const match of [...this.pvpMatches.values()]){
   const result=B.stepPvp(match,now,this.random);if(!result)continue;rooms.add(match.room);
   for(const event of result.events)if(event.type==='hit')this.broadcast({type:'battle_fx',kind:'pvp',battleId:match.id,to:event.to,amount:event.amount,crit:!!event.crit},p=>p.room===match.room);
   if(result.events.some(e=>e.type==='result'))this.settlePvp(match);
   if(result.events.some(e=>e.type==='cancel'))this.sendMatchCancel(match,match.reason);
   if(match.phase==='closed'){this.cleanupPvp(match);rooms.add(match.room)}
  }
  for(const room of rooms)this.broadcastBattle(room);if(rooms.size)this.battleActivity();
 }
 // `viewer` is who is asking: whether this person is a friend is a fact about the two accounts, so
 // the same player is flagged for one client and not for another. Omit it for a neutral snapshot.
 snapshot(c,viewer=null){R.advance(c,this.now());return {id:c.id,name:c.name,gm:c.gm,room:c.room,x:c.x,z:c.z,dir:c.dir,sit:c.sit,path:c.path,at:c.at,look:c.look,seat:c.seat,pokerSeat:c.pokerSeat,fish:c.fish||null,party:this.partyOf(c)?.id||null,friend:!!(viewer&&viewer!==c&&viewer.friends.has(c.id))};}
 leave(c){const room=c.room;this.stopBattle(c,'left');this.partyRemove(c,'left');this.partyInvites.delete(c.id);this.standPoker(c,this.now(),false);c.room=0;c.path=[];c.seat=null;c.pokerSeat=null;c.fish=null;if(room){this.broadcast({type:'left',id:c.id,room},p=>p.room===room);this.broadcastPoker(room,this.now());this.schedulePoker(room);this.syncRooms();}}
 disconnect(c){
  if(this.clients.get(c.id)!==c)return;
  this.partyRemove(c,'disconnect');this.partyInvites.delete(c.id);
  const now=this.now(),room=c.room;this.stopBattle(c,'disconnect',now);this.stopGym(c);
  // A lost socket is not a decision to fold. Keep the exact position and reserved poker seat
  // for 15 seconds, including planned re-authentication. The turn clock still runs; an explicit
  // leave has already cleared the room; a replacement tab may inherit the same reservation.
  if(room&&!c.released){
   R.advance(c,now);
   // v311 (owner: "he auto jumps around on reconnect"): the remaining route is deliberately NOT
   // restored. The spot is where the character actually stood; replaying a half-finished walk meant
   // a reconnected player watched their character stroll off on its own, and the client's own copy
   // of that walk had already been stopped.
   const saved={room,x:c.x,z:c.z,dir:c.dir,path:[],sit:c.sit,seat:c.seat,pokerSeat:c.pokerSeat,look:c.look,expires:now+RESUME_MS,seatExpires:now+POKER_RESUME_MS};
   this.resumes.set(c.id,saved);
   // v296: also hand it to storage. A Durable Object can be evicted while nobody is connected,
   // which used to empty this Map and turn the next reconnect into a fresh join at the entrance.
   this.onResume?.(c.id,saved);
   if(Number.isInteger(c.pokerSeat))this.tables.get(room)?.[Math.floor(c.pokerSeat/6)]?.markArrived(c.id,false,now);
   this.clients.delete(c.id);
   this.broadcast({type:'left',id:c.id,room},p=>p.room===room);
   this.broadcastPoker(room,now);this.syncRooms();
   return;
  }
  this.leave(c);this.clients.delete(c.id);
 }
 // The plaza spot and the poker seat expire on their own clocks: the spot keeps the whole idle
 // window so a dropped or throttled client resumes where it stood, while the seat falls back to
 // the short grace. Releasing the seat never costs the player their position.
 releaseSeat(id,saved,now){
  if(!Number.isInteger(saved.pokerSeat))return;
  const table=this.tables.get(saved.room)?.[Math.floor(saved.pokerSeat/6)];
  if(table&&table.findPlayer(id)){table.stand(id,now);this.broadcastPoker(saved.room,now);this.schedulePoker(saved.room)}
  saved.pokerSeat=null;
 }
 takeResume(id,now){
  const saved=this.resumes.get(id);if(!saved)return null;
  this.resumes.delete(id);
  this.onResume?.(id,null);
  if(now>saved.expires){
   if(Number.isInteger(saved.pokerSeat))this.tables.get(saved.room)?.[Math.floor(saved.pokerSeat/6)]?.stand(id,now);
   this.broadcastPoker(saved.room,now);this.schedulePoker(saved.room);
   return null;
  }
  if(Number.isInteger(saved.pokerSeat)&&now>(saved.seatExpires||0))this.releaseSeat(id,saved,now);
  if(Number.isInteger(saved.pokerSeat)&&!this.tables.get(saved.room)?.[Math.floor(saved.pokerSeat/6)]?.findPlayer(id))saved.pokerSeat=null;
  return saved;
 }
 sendRoom(c,now){
  c.resumed=false;
  this.adoptFriends(c);
  this.syncPokerArrivals(c.room,now);
  const rooms=this.roomList();
  this.send(c,{type:'room',room:c.room,rooms,players:[...this.clients.values()].filter(p=>p.room===c.room).map(p=>this.snapshot(p,c))});
  this.send(c,{type:'gym',room:c.room,entries:this.gymSnapshot(c.room)});
  this.send(c,{type:'battle',room:c.room,at:now,...this.battleSnapshot(c.room)});
  this.send(c,this.pokerPayload(c.room,c.id,now));
  this.broadcastPlayer(c,p=>p.room===c.room,c);
  this.syncRooms(c);this.schedulePoker(c.room);
 }
 enterPlazaRoom(c,room,now){
  const members=[...this.clients.values()].filter(p=>p.room===room&&p!==c);members.forEach(p=>R.advance(p,now));
  // v361 (owner: "make players spawn in social hub first around the new fountain randomly"):
  // fresh joins drop at a random angle on the Aetherwell promenade (R.fountainSpawn keeps
  // arrivals mutually distinct) instead of the old entrance grid.
  const spawn=R.fountainSpawn(members)||{x:0,z:12};
  c.room=room;c.x=spawn.x;c.z=spawn.z;c.dir=0;c.at=now;c.sit=false;c.path=[];c.seat=null;c.pokerSeat=null;c.fish=null;
  this.sendRoom(c,now);
 }
 // The warning is a client affordance; this is the authority. An old client, a queued floor
 // click or a room-switch packet cannot silently stand up a reserved poker player.
 requirePokerLeave(c,m){
  if(!Number.isInteger(c.pokerSeat)||m.confirmLeave===true)return true;
  this.send(c,{type:'poker_leave_required',message:'You are at a poker table. Choose Fold & leave before walking away.'});
  return false;
 }
 receive(c,raw){
  if(this.clients.get(c.id)!==c)return;
  const now=this.now();
  if(now>c.reauthAt||now>c.expires)return this.refresh(c);
  c.expires=now+IDLE_MS;
  if(c.room)this.tickRoom(c.room,now);
  if(typeof raw!=='string'||raw.length>4096)return this.send(c,{type:'error',message:'Message is too large.'});
  let m;try{m=JSON.parse(raw)}catch{return}if(!m||typeof m!=='object')return;
  if(m.type==='ping')return this.send(c,{type:'pong'});
  if(m.type==='gym_start')return this.startGym(c,m,now);
  if(m.type==='gym_stop')return this.stopGym(c);
  if(m.type==='pve_start')return this.startPve(c,m,now);
  if(m.type==='pve_stop'){this.stopPve(c);return}
  if(m.type==='pvp_enter')return this.queuePvp(c,m,now);
  if(m.type==='party_invite')return this.partyInvite(c,m,now);
  if(m.type==='party_accept')return this.partyAccept(c,m,now);
  if(m.type==='party_decline')return this.partyDecline(c,now);
  if(m.type==='party_leave')return this.partyRemove(c,'left');
  if(m.type==='party_start')return this.startPartyPve(c,m,now);
  if(m.type==='party_profile'){const p=this.battleProfile(c,m.profile);if(p)c.partyProfile=p;return}
  if(m.type==='pvp_accept')return this.acceptPvp(c,now);
  if(m.type==='pvp_decline'||m.type==='pvp_cancel')return this.cancelPvp(c,m.type==='pvp_decline'?'declined':'cancelled',now);
  if(m.type==='poker_ledger_ack')return this.ackPokerLedgers(c,m);
  if(m.type==='friends'){if(this.syncFriends(c,m.ids,now))this.syncRooms();return}
  if(m.type==='leave'){this.resumes.delete(c.id);this.onResume?.(c.id,null);c.released=true;this.leave(c);return this.send(c,{type:'room',room:0,players:[]})}
  if(m.type==='join'){
   const look=this.cleanLook(m.look);if(!look)return;
   if(c.room){if(c.resumed)this.sendRoom(c,now);return;}
   let room=1;while(this.roomCount(room,now)>=R.CAPACITY)room++;
   c.look=look;
   // The client's list is fresher than the one Pages saw at connect time (a request accepted since
   // then), so apply it before the snapshot: the join already shows the right names as friends.
   if(Array.isArray(m.friends))this.syncFriends(c,m.friends,now);
   return this.enterPlazaRoom(c,room,now);
  }
  if(m.type==='switch_room'&&c.room){
   const target=Number(m.room);
   if(!Number.isInteger(target)||target<1||target>MAX_ROOMS||target===c.room)return;
   if(now-c.moveAt<150)return;
   if(!this.requirePokerLeave(c,m))return;
   c.moveAt=now;
   const count=this.roomCount(target,now);
   if(count>=R.CAPACITY)return this.send(c,{type:'error',message:`Plaza ${target} is full (${R.CAPACITY} / ${R.CAPACITY}).`});
   const prev=c.room;this.stopBattle(c,'room_switch',now);this.stopGym(c);
   this.standPoker(c,now,false);c.room=0;c.path=[];c.seat=null;c.pokerSeat=null;c.sit=false;
   this.broadcast({type:'left',id:c.id,room:prev},p=>p.room===prev);
   this.broadcastPoker(prev,now);this.schedulePoker(prev);
   return this.enterPlazaRoom(c,target,now);
  }
  if(m.type==='look'&&c.room){const look=this.cleanLook(m.look);if(!look||now-c.lookAt<100)return;c.lookAt=now;c.look=look;return this.broadcastPlayer(c,p=>p.room===c.room)}
  if(m.type==='move'&&c.room){if(!this.requirePokerLeave(c,m))return;if(now-c.moveAt<100)return;c.moveAt=now;R.advance(c,now);const route=R.path(c,{x:m.x,z:m.z});if(!route.length)return;this.standPoker(c,now,true);c.path=route;c.sit=false;c.seat=null;return this.broadcastPlayer(c,p=>p.room===c.room)}
  if(m.type==='seat'&&c.room){if(!this.requirePokerLeave(c,m))return;if(now-c.moveAt<100||!Number.isInteger(m.id)||!R.SEATS[m.id])return;c.moveAt=now;R.advance(c,now);const seat=R.SEATS[m.id];if([...this.clients.values()].some(p=>p!==c&&p.room===c.room&&p.seat===seat.id))return this.send(c,{type:'error',message:'That bench is occupied.'});const route=R.path(c,seat);if(!route.length&&Math.hypot(c.x-seat.x,c.z-seat.z)>.5)return;this.standPoker(c,now,true);c.path=route;c.sit=false;c.seat=seat.id;return this.broadcastPlayer(c,p=>p.room===c.room)}
  // v295: the line in the water is public. This is presentation only - it carries no score, no
  // item and no money - so the worst a forged value can do is draw a bobber in the wrong spot.
  if(m.type==='rig'&&c.room){
   if(m.on!==true){if(c.fish){c.fish=null;this.broadcastPlayer(c,p=>p.room===c.room)}return}
   const x=Number(m.x),z=Number(m.z);
   if(!Number.isFinite(x)||!Number.isFinite(z)||x<R.MIN_X||x>R.MAX_X||z<R.MIN_Z||z>R.MAX_Z)return;
   c.fish={on:true,pond:Number.isInteger(m.pond)?Math.max(0,Math.min(7,m.pond)):0,x:Math.round(x*100)/100,z:Math.round(z*100)/100,mode:FISH_MODES.has(m.mode)?m.mode:'wait',rod:FISH_RODS.has(m.rod)?m.rod:'twig'};
   return this.broadcastPlayer(c,p=>p.room===c.room);
  }
  // v295: Show off is relayed as data to the whole room instead of being written as a Local-chat
  // line, so the fish and its weight appear above the angler's head and chat stays clean.
  if(m.type==='showoff'&&c.room){
   if(now-(c.showOffAt||0)<1500)return;
   c.showOffAt=now;
   if(typeof m.sp!=='string'||!/^[a-z][a-z0-9]{1,23}$/.test(m.sp))return;
   const w=Math.round(Math.max(.01,Math.min(MAX_FISH_W,Number(m.w)||0))*100)/100;
   if(!(w>0))return;
   const mut=typeof m.mut==='string'&&FISH_MUTATIONS.has(m.mut)?m.mut:null;
   return this.broadcast({type:'showoff',from:c.id,name:c.name,sp:m.sp,w,mut,perfect:m.perfect===true,at:now},p=>p.room===c.room);
  }
  // v297: monster and secret catches are announced in the room's Local chat. The weight and the
  // species slug are validated exactly like the show-off; the display name is resolved client side.
  if(m.type==='fishbrag'&&c.room){
   if(now-(c.bragAt||0)<3000)return;
   if(typeof m.sp!=='string'||!/^[a-z][a-z0-9]{1,23}$/.test(m.sp))return;
   const w=Math.round(Math.max(.01,Math.min(MAX_FISH_W,Number(m.w)||0))*100)/100;
   if(!(w>0))return;
   c.bragAt=now;
   return this.broadcast({type:'fishnote',from:c.id,name:c.name,sp:m.sp,w,kind:m.kind==='secret'?'secret':'mega',at:now},p=>p.room===c.room);
  }
  if(m.type==='sit'&&c.room){if(!this.requirePokerLeave(c,m))return;if(now-c.moveAt<100)return;c.moveAt=now;R.advance(c,now);this.standPoker(c,now,true);c.path=[];c.seat=null;c.sit=!c.sit;return this.broadcastPlayer(c,p=>p.room===c.room)}
  if(m.type==='poker_watch'&&c.room){return this.send(c,this.pokerPayload(c.room,c.id,now))}
  if(m.type==='poker_sit'&&c.room){
   if(now-c.moveAt<100||!Number.isInteger(m.seat)||!R.POKER.seats[m.seat])return;
   c.moveAt=now;R.advance(c,now);
   const target=R.POKER.seats[m.seat];
   if(c.pokerSeat!==target.id&&!this.requirePokerLeave(c,m))return;
   if([...this.clients.values()].some(p=>p!==c&&p.room===c.room&&p.pokerSeat===target.id))
    return this.send(c,{type:'poker_error',message:'That poker seat is already occupied.'});
   const route=R.path(c,target);
   const atSeat=!route.length&&Math.hypot(c.x-target.x,c.z-target.z)<=.6;
   if(!route.length&&!atSeat)return this.send(c,{type:'poker_error',message:'Cannot reach that seat.'});
   const list=this.pokerTables(c.room);
   if(Number.isInteger(c.pokerSeat)&&Math.floor(c.pokerSeat/6)!==target.tableId){
    const prevTable=list[Math.floor(c.pokerSeat/6)];
    if(prevTable)prevTable.stand(c.id,now);
   }
   const t=list[target.tableId];
   const res=t.sit(target.seatIndex,{id:c.id,name:c.name},m.buyIn,now,atSeat);
   if(!res.ok)return this.send(c,{type:'poker_error',message:res.error});
   c.seat=null;c.pokerSeat=target.id;c.path=route;c.sit=atSeat;
   if(atSeat){c.x=target.x;c.z=target.z;c.dir=target.dir;}
   this.broadcastPlayer(c,p=>p.room===c.room);
   this.broadcastPoker(c.room,now);
   this.schedulePoker(c.room);
   return;
  }
  if(m.type==='poker_stand'&&c.room){
   if(!Number.isInteger(c.pokerSeat))return;
   R.advance(c,now);this.standPoker(c,now,true);c.path=[];c.sit=false;
   return this.broadcastPlayer(c,p=>p.room===c.room);
  }
  if(m.type==='poker_act'&&c.room){
   if(!Number.isInteger(c.pokerSeat))return;
   const t=this.pokerTables(c.room)[Math.floor(c.pokerSeat/6)];
   if(!t)return;
   const res=t.act(c.id,m.action,m.amount,now);
   if(!res.ok)return this.send(c,{type:'poker_error',message:res.error});
   this.broadcastPoker(c.room,now);this.schedulePoker(c.room);
   return;
  }
  if(m.type==='poker_topup'&&c.room){
   if(!Number.isInteger(c.pokerSeat))return;
   const t=this.pokerTables(c.room)[Math.floor(c.pokerSeat/6)];
   if(!t)return;
   const res=t.topUp(c.id,m.amount,now);
   if(!res.ok)return this.send(c,{type:'poker_error',message:res.error});
   this.broadcastPoker(c.room,now);this.schedulePoker(c.room);
   return;
  }
  if(m.type==='poker_house'&&c.room){
   if(!Number.isInteger(c.pokerSeat))return;
   const t=this.pokerTables(c.room)[Math.floor(c.pokerSeat/6)];
   if(!t||!t.findPlayer(c.id))return;
   t.setHouse(!!m.enabled,now);
   this.broadcastPoker(c.room,now);this.schedulePoker(c.room);
   return;
  }
  if(m.type!=='chat'&&m.type!=='emotion')return;
  if(now<c.nextChat)return this.send(c,{type:'error',message:'Please wait 3 seconds between messages and emotions.'});
  // An emotion rides the channel it was sent on: the hub's emotion tray is the
  // same tray on World and Whisper, and an emote that quietly became a Local one
  // stopped the speaker being seen at all outside a plaza (owner, v274). Only
  // Local still needs a room, because Local is the room's own broadcast.
  // A client that predates v274 sends a bare emotion with no channel; that form
  // has always meant Local, so it keeps meaning Local instead of failing.
  const emotion=m.type==='emotion';const channel=m.channel??(emotion?'local':undefined);
  if(!['world','whisper','local'].includes(channel)||(channel==='local'&&!c.room))return this.send(c,{type:'error',message:'Enter a plaza to use Local chat.'});
  if(emotion&&!R.EMOTIONS.includes(m.emotion))return;
  const body=emotion?'':typeof m.body==='string'?m.body.replace(/[\u0000-\u001f\u007f]/g,'').trim():'';if(!emotion&&(!body||body.length>300))return;
  let recipient;if(channel==='whisper'){recipient=[...this.clients.values()].find(p=>p.name.toLowerCase()===String(m.to).toLowerCase());if(!recipient)return this.send(c,{type:'error',message:'That player is offline.'})}
  c.nextChat=now+R.CHAT_DELAY;
  const event={type:'message',id:++this.serial,at:now,from:c.id,name:c.name,gm:c.gm,channel,body,room:channel==='local'?c.room:0,...(emotion?{emotion:m.emotion}:{}),...(recipient?{to:recipient.id,toName:recipient.name}:{})};
  if(channel==='world'){this.history.push(event);if(this.history.length>100)this.history.shift();this.onWorldMessage(event);this.broadcast(event)}
  else if(channel==='local')this.broadcast(event,p=>p.room===c.room);
  else {this.send(c,event);if(recipient!==c)this.send(recipient,event)}
 }
 sweep(){const now=this.now();let populationChanged=false;
  for(const [id,r] of [...this.resumes]){
   if(now>r.expires){this.takeResume(id,now);populationChanged=true;continue}
   // An abandoned poker seat is released on the sweep, not only when the player reconnects.
   if(Number.isInteger(r.pokerSeat)&&now>(r.seatExpires||0))this.releaseSeat(id,r,now);
  }
  // v319: an expired reservation quietly leaves the plaza counts; tell the field badges.
  if(populationChanged)this.syncRooms();
  this.tickAll(now);this.tickBattles(now);for(const c of [...this.clients.values()])if(now>c.reauthAt||now>c.expires)this.refresh(c)}
}
