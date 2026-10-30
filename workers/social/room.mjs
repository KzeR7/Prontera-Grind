import '../../assets/social-rules.js';
import '../../assets/social-poker.js';
const R=globalThis.PGSocialRules,P=globalThis.PGSocialPoker;
// v236: two different clocks. IDLE_MS is how long a silent connection may sit before the sweep
// removes it - that is what kills half-open sockets. REAUTH_MS is the security bound: a connection
// has to go back through Pages (which re-checks the D1 session and the ban flag) this often, because
// the socket itself is the only thing that proves who the player is. The age of a connection is
// measured from when it was accepted, and activity slides the idle window forward, so an active
// player is no longer dropped every five minutes the way REAUTH_MS alone used to force.
const IDLE_MS=300000,REAUTH_MS=1800000,MAX_ROOMS=50;
function routeDist(from,route){let d=0,x=from.x,z=from.z;for(const pt of route){d+=Math.hypot(pt.x-x,pt.z-z);x=pt.x;z=pt.z}return d;}
// A service binding is the only ingress. Identity is supplied by authenticated Pages.
export class SocialRoom {
 constructor(opts={}){
  this.now=opts.now||(()=>Date.now());
  this.autoTimers=opts.autoTimers??!opts.now;
  this.clients=new Map();this.history=[];this.serial=0;
  this.tables=new Map();this.timers=new Map();
 }
 send(c,event){try{c.send(JSON.stringify(event))}catch{this.disconnect(c)}}
 // A planned refresh tells the client before the socket closes, so it can reconnect and rejoin
 // without showing a failure or losing the player's seat.
 refresh(c){this.disconnect(c);this.send(c,{type:'reauth'});c.close(4000,'Refresh session')}
 broadcast(event,filter=()=>true){for(const c of this.clients.values())if(filter(c))this.send(c,event)}
 roomList(){
  const counts=new Map();let maxRoom=1;
  for(const p of this.clients.values())if(p.room>0){counts.set(p.room,(counts.get(p.room)||0)+1);if(p.room>maxRoom)maxRoom=p.room;}
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
    onLedger:(playerId,delta,reason)=>{const p=this.clients.get(playerId);if(p&&p.room===room)this.send(p,{type:'poker_ledger',tableId:spec.id,delta,reason});},
    onCallout:body=>{this.broadcast({type:'poker_callout',room,tableId:spec.id,body,at:this.now()},p=>p.room===room);},
    onKick:info=>{
     const p=this.clients.get(info.id);
     if(p&&p.room===room){
      p.pokerSeat=null;p.sit=false;p.path=[];
      this.broadcast({type:'player',player:this.snapshot(p)},x=>x.room===room);
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
  const c={id:identity.id,name:identity.username,send,close,room:0,at:this.now(),path:[],x:0,z:12,dir:0,sit:false,nextChat:0,seat:null,pokerSeat:null,moveAt:0,lookAt:0,expires:this.now()+IDLE_MS,reauthAt:this.now()+REAUTH_MS};
  this.clients.set(c.id,c);this.send(c,{type:'hello',id:c.id,name:c.name,history:this.history});return c;
 }
 // v225: lv drives the level aura and speed is the character's field run speed. Both are
 // presentation hints: lv is clamped to a display tier input, speed to the shared walk band, so a
 // client cannot make itself faster than the fastest legal character in the plaza.
 cleanLook(look){if(!look||typeof look.cls!=='string'||look.cls.length>40||!look.appearance||JSON.stringify(look).length>1200)return null;return {cls:look.cls,appearance:look.appearance,refine:Math.max(0,Math.min(15,Number(look.refine)||0)),title:typeof look.title==='string'?look.title.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,64):'',lv:Math.max(0,Math.min(999,Math.floor(Number(look.lv)||0))),speed:Math.max(R.MIN_SPEED,Math.min(R.MAX_SPEED,Number(look.speed)||R.SPEED))};}
 snapshot(c){R.advance(c,this.now());return {id:c.id,name:c.name,room:c.room,x:c.x,z:c.z,dir:c.dir,sit:c.sit,path:c.path,at:c.at,look:c.look,seat:c.seat,pokerSeat:c.pokerSeat};}
 leave(c){const room=c.room;this.standPoker(c,this.now(),false);c.room=0;c.path=[];c.seat=null;c.pokerSeat=null;if(room){this.broadcast({type:'left',id:c.id,room},p=>p.room===room);this.broadcastPoker(room,this.now());this.schedulePoker(room);this.syncRooms();}}
 disconnect(c){if(this.clients.get(c.id)!==c)return;this.leave(c);this.clients.delete(c.id)}
 enterPlazaRoom(c,room,now){
  const members=[...this.clients.values()].filter(p=>p.room===room&&p!==c);members.forEach(p=>R.advance(p,now));
  const spawn=Array.from({length:R.CAPACITY},(_,i)=>({x:(i%5-2)*4,z:12+Math.floor(i/5)*4})).find(s=>members.every(p=>Math.hypot(p.x-s.x,p.z-s.z)>2))||{x:0,z:12};
  c.room=room;c.x=spawn.x;c.z=spawn.z;c.dir=0;c.at=now;c.sit=false;c.path=[];c.seat=null;c.pokerSeat=null;
  const rooms=this.roomList();
  this.send(c,{type:'room',room,rooms,players:[...this.clients.values()].filter(p=>p.room===room).map(p=>this.snapshot(p))});
  this.send(c,this.pokerPayload(room,c.id,now));
  this.broadcast({type:'player',player:this.snapshot(c)},p=>p.room===room&&p!==c);
  this.syncRooms(c);
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
  if(m.type==='leave'){this.leave(c);return this.send(c,{type:'room',room:0,players:[]})}
  if(m.type==='join'){
   if(c.room)return;
   const look=this.cleanLook(m.look);if(!look)return;
   let room=1;while([...this.clients.values()].filter(p=>p.room===room).length>=R.CAPACITY)room++;
   c.look=look;
   return this.enterPlazaRoom(c,room,now);
  }
  if(m.type==='switch_room'&&c.room){
   const target=Number(m.room);
   if(!Number.isInteger(target)||target<1||target>MAX_ROOMS||target===c.room)return;
   if(now-c.moveAt<150)return;
   c.moveAt=now;
   const count=[...this.clients.values()].filter(p=>p.room===target).length;
   if(count>=R.CAPACITY)return this.send(c,{type:'error',message:`Plaza ${target} is full (${R.CAPACITY} / ${R.CAPACITY}).`});
   const prev=c.room;
   this.standPoker(c,now,false);c.room=0;c.path=[];c.seat=null;c.pokerSeat=null;c.sit=false;
   this.broadcast({type:'left',id:c.id,room:prev},p=>p.room===prev);
   this.broadcastPoker(prev,now);this.schedulePoker(prev);
   return this.enterPlazaRoom(c,target,now);
  }
  if(m.type==='look'&&c.room){const look=this.cleanLook(m.look);if(!look||now-c.lookAt<100)return;c.lookAt=now;c.look=look;return this.broadcast({type:'player',player:this.snapshot(c)},p=>p.room===c.room)}
  if(m.type==='move'&&c.room){if(now-c.moveAt<100)return;c.moveAt=now;R.advance(c,now);const route=R.path(c,{x:m.x,z:m.z});if(!route.length)return;this.standPoker(c,now,true);c.path=route;c.sit=false;c.seat=null;return this.broadcast({type:'player',player:this.snapshot(c)},p=>p.room===c.room)}
  if(m.type==='seat'&&c.room){if(now-c.moveAt<100||!Number.isInteger(m.id)||!R.SEATS[m.id])return;c.moveAt=now;R.advance(c,now);const seat=R.SEATS[m.id];if([...this.clients.values()].some(p=>p!==c&&p.room===c.room&&p.seat===seat.id))return this.send(c,{type:'error',message:'That bench is occupied.'});const route=R.path(c,seat);if(!route.length&&Math.hypot(c.x-seat.x,c.z-seat.z)>.5)return;this.standPoker(c,now,true);c.path=route;c.sit=false;c.seat=seat.id;return this.broadcast({type:'player',player:this.snapshot(c)},p=>p.room===c.room)}
  if(m.type==='sit'&&c.room){if(now-c.moveAt<100)return;c.moveAt=now;R.advance(c,now);this.standPoker(c,now,true);c.path=[];c.seat=null;c.sit=!c.sit;return this.broadcast({type:'player',player:this.snapshot(c)},p=>p.room===c.room)}
  if(m.type==='poker_watch'&&c.room){return this.send(c,this.pokerPayload(c.room,c.id,now))}
  if(m.type==='poker_sit'&&c.room){
   if(now-c.moveAt<100||!Number.isInteger(m.seat)||!R.POKER.seats[m.seat])return;
   c.moveAt=now;R.advance(c,now);
   const target=R.POKER.seats[m.seat];
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
   this.broadcast({type:'player',player:this.snapshot(c)},p=>p.room===c.room);
   this.broadcastPoker(c.room,now);
   this.schedulePoker(c.room);
   return;
  }
  if(m.type==='poker_stand'&&c.room){
   if(!Number.isInteger(c.pokerSeat))return;
   R.advance(c,now);this.standPoker(c,now,true);c.path=[];c.sit=false;
   return this.broadcast({type:'player',player:this.snapshot(c)},p=>p.room===c.room);
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
  const emotion=m.type==='emotion';const channel=emotion?'local':m.channel;
  if(!['world','whisper','local'].includes(channel)||(channel==='local'&&!c.room))return this.send(c,{type:'error',message:'Enter a plaza to use Local chat and emotions.'});
  if(emotion&&!R.EMOTIONS.includes(m.emotion))return;
  const body=emotion?'':typeof m.body==='string'?m.body.replace(/[\u0000-\u001f\u007f]/g,'').trim():'';if(!emotion&&(!body||body.length>300))return;
  let recipient;if(channel==='whisper'){recipient=[...this.clients.values()].find(p=>p.name.toLowerCase()===String(m.to).toLowerCase());if(!recipient)return this.send(c,{type:'error',message:'That player is offline.'})}
  c.nextChat=now+R.CHAT_DELAY;
  const event={type:'message',id:++this.serial,at:now,from:c.id,name:c.name,channel,body,room:channel==='local'?c.room:0,...(emotion?{emotion:m.emotion}:{}),...(recipient?{to:recipient.id,toName:recipient.name}:{})};
  if(channel==='world'){this.history.push(event);if(this.history.length>100)this.history.shift();this.broadcast(event)}
  else if(channel==='local')this.broadcast(event,p=>p.room===c.room);
  else {this.send(c,event);if(recipient!==c)this.send(recipient,event)}
 }
 sweep(){const now=this.now();this.tickAll(now);for(const c of [...this.clients.values()])if(now>c.reauthAt||now>c.expires)this.refresh(c)}
}
