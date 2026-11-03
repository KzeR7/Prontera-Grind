import '../../assets/social-rules.js';
import '../../assets/social-poker.js';
const R=globalThis.PGSocialRules,P=globalThis.PGSocialPoker;
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
 syncRooms(skip=null){const rooms=this.roomList();this.broadcast({type:'rooms',rooms},p=>p.room>0&&p!==skip);}
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
   if(Number.isInteger(c.seat)&&[...this.clients.values()].some(p=>p!==c&&p.room===c.room&&p.seat===c.seat)){c.seat=null;c.sit=false}
  }
  this.clients.set(c.id,c);
  // The list Pages sent at connect time is mirrored at once, so a player who is already in a plaza
  // and is on your list is drawn as a friend even if you connected second.
  this.adoptFriends(c);
  this.send(c,{type:'hello',id:c.id,name:c.name,gm:c.gm,history:this.history});
  // The durable personal outbox is independent of the short-lived seat reservation.
  this.replayPokerLedgers(c);return c;
 }
 // v225: lv drives the level aura and speed is the character's field run speed. Both are
 // presentation hints: lv is clamped to a display tier input, speed to the shared walk band, so a
 // client cannot make itself faster than the fastest legal character in the plaza.
 cleanLook(look){if(!look||typeof look.cls!=='string'||look.cls.length>40||!look.appearance||JSON.stringify(look).length>1200)return null;return {cls:look.cls,appearance:look.appearance,refine:Math.max(0,Math.min(15,Number(look.refine)||0)),title:typeof look.title==='string'?look.title.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,64):'',fishTitle:typeof look.fishTitle==='string'?look.fishTitle.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,64):'',lv:Math.max(0,Math.min(999,Math.floor(Number(look.lv)||0))),speed:Math.max(R.MIN_SPEED,Math.min(R.MAX_SPEED,Number(look.speed)||R.SPEED))};}
 // `viewer` is who is asking: whether this person is a friend is a fact about the two accounts, so
 // the same player is flagged for one client and not for another. Omit it for a neutral snapshot.
 snapshot(c,viewer=null){R.advance(c,this.now());return {id:c.id,name:c.name,gm:c.gm,room:c.room,x:c.x,z:c.z,dir:c.dir,sit:c.sit,path:c.path,at:c.at,look:c.look,seat:c.seat,pokerSeat:c.pokerSeat,fish:c.fish||null,friend:!!(viewer&&viewer!==c&&viewer.friends.has(c.id))};}
 leave(c){const room=c.room;this.standPoker(c,this.now(),false);c.room=0;c.path=[];c.seat=null;c.pokerSeat=null;c.fish=null;if(room){this.broadcast({type:'left',id:c.id,room},p=>p.room===room);this.broadcastPoker(room,this.now());this.schedulePoker(room);this.syncRooms();}}
 disconnect(c){
  if(this.clients.get(c.id)!==c)return;
  const now=this.now(),room=c.room;
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
  this.send(c,this.pokerPayload(c.room,c.id,now));
  this.broadcastPlayer(c,p=>p.room===c.room,c);
  this.syncRooms(c);this.schedulePoker(c.room);
 }
 enterPlazaRoom(c,room,now){
  const members=[...this.clients.values()].filter(p=>p.room===room&&p!==c);members.forEach(p=>R.advance(p,now));
  const spawn=Array.from({length:R.CAPACITY},(_,i)=>({x:(i%5-2)*4,z:12+Math.floor(i/5)*4})).find(s=>members.every(p=>Math.hypot(p.x-s.x,p.z-s.z)>2))||{x:0,z:12};
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
  if(m.type==='poker_ledger_ack')return this.ackPokerLedgers(c,m);
  if(m.type==='friends'){this.syncFriends(c,m.ids,now);return}
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
   const prev=c.room;
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
   if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>70||Math.abs(z)>70)return;
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
 sweep(){const now=this.now();
  for(const [id,r] of [...this.resumes]){
   if(now>r.expires){this.takeResume(id,now);continue}
   // An abandoned poker seat is released on the sweep, not only when the player reconnects.
   if(Number.isInteger(r.pokerSeat)&&now>(r.seatExpires||0))this.releaseSeat(id,r,now);
  }
  this.tickAll(now);for(const c of [...this.clients.values()])if(now>c.reauthAt||now>c.expires)this.refresh(c)}
}
