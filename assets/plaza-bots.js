/* Plaza crowd (haven-v403): seeded regulars that walk, sit, fish and emote in the Fountain
   Plaza. Pure roster + schedule - no DOM, no Three.js, no network, no Math.random at runtime
   (mulberry32 only), so every viewer of a room builds the same crowd from the seed that rides
   the existing room snapshot. assets/social.js drives it from the session interval; nothing
   here ever touches the Durable Object. */
(function(root,factory){
 const R=typeof module==='object'&&module.exports?require('./social-rules.js'):root.PGSocialRules;
 const W=typeof module==='object'&&module.exports?require('./wardrobe.js'):root.PGWardrobe;
 const api=factory(R,W);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.PGPlazaBots=api;
})(globalThis,function(R,W){
 'use strict';
 const DEFAULT_COUNT=6,MAX_COUNT=8,SOLO_SEED=0x504c415a;
 // v406 (owner: "can have them stay in a segment for10-20mins? i dont want them to move so
 // much"): a rest is ten to twenty minutes - standing, sitting or fishing - and the plan only
 // walks between rests. STAY_MIN_MS + STAY_SPAN_MS = the full rest window.
 const STAY_MIN_MS=600000,STAY_SPAN_MS=600000;
 // One session tick (2 s) of slack on every walk, so a push that lands late still finishes the
 // route before the schedule leaves the segment - no teleporting when the interval fires.
 const WALK_SLACK_MS=2600;
 const FISH_STEP_MS=2200,FISH_CYCLE=['wait','wait','wait','bite','reel'];
 const EMOTES=['heart','laugh','smile','ok','gg','love','kiss','music'];
 const RODS=['twig','oak','brass','silver','golden','mythril'];
 const NAME_A=['Ael','Bryn','Cael','Dorn','Eira','Fenn','Gale','Hale','Iris','Joss','Kael','Lira','Mira','Nyx','Orin','Prya','Quill','Ryn','Sable','Tams','Ulf','Vex','Wren','Yara','Zeph','Bram','Cora','Dain','Elow','Fara'];
 const NAME_B=['a','en','ith','or','ys','iel','wyn','ara','ock','ea','is','um'];
 function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
 const pick=(rnd,list)=>list[Math.floor(rnd()*list.length)%list.length];
 const dirOf=(dx,dz)=>(Math.round(Math.atan2(-dx,dz)/(Math.PI/4))+8)%8;
 // Drop-in twin of social-rules `path()`: same rounded endpoints, same8-neighbour order, same
 // corner rule - but a typed-array BFS over a walkability grid built once per page instead of a
 // string-keyed Map, because the roster builds dozens of routes on the join frame.
 let GRID=null;
 const NB=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
 function walkGrid(){
  if(GRID)return GRID;
  const w=R.MAX_X-R.MIN_X+1,h=R.MAX_Z-R.MIN_Z+1,g=new Uint8Array(w*h);
  for(let x=R.MIN_X;x<=R.MAX_X;x++)for(let z=R.MIN_Z;z<=R.MAX_Z;z++)g[(x-R.MIN_X)*h+(z-R.MIN_Z)]=R.walkable(x,z)?1:0;
  GRID={w,h,g};
  return GRID;
 }
 const cell=(g,x,z)=>(x<R.MIN_X||x>R.MAX_X||z<R.MIN_Z||z>R.MAX_Z)?0:g[(x-R.MIN_X)*GRID.h+(z-R.MIN_Z)];
 function fastPath(from,to){
  if(!Number.isFinite(from.x)||!Number.isFinite(from.z)||!R.walkable(to.x,to.z))return [];
  const {w,h,g}=walkGrid();
  const sx=Math.round(from.x),sz=Math.round(from.z),ex=Math.round(to.x),ez=Math.round(to.z);
  if(sx===ex&&sz===ez)return [];
  const prev=new Int32Array(w*h);
  prev.fill(-2);
  const key=(x,z)=>(x-R.MIN_X)*h+(z-R.MIN_Z);
  const start=key(sx,sz),end=key(ex,ez);
  prev[start]=-1;
  const queue=[start];
  let found=false;
  for(let qi=0;qi<queue.length&&!found;qi++){
   const cur=queue[qi],x=R.MIN_X+Math.floor(cur/h),z=R.MIN_Z+cur%h;
   for(const [dx,dz] of NB){
    const nx=x+dx,nz=z+dz;
    if(nx<R.MIN_X||nx>R.MAX_X||nz<R.MIN_Z||nz>R.MAX_Z)continue;
    const nk=key(nx,nz);
    if(prev[nk]!==-2||!g[nk]||!cell(g,x+dx,z)||!cell(g,x,z+dz))continue;
    prev[nk]=cur;
    if(nx===ex&&nz===ez){found=true;break}
    queue.push(nk);
   }
  }
  if(!found)return [];
  const route=[];
  for(let p=end;p!==start&&p!==-1;p=prev[p])route.unshift({x:R.MIN_X+Math.floor(p/h),z:R.MIN_Z+p%h});
  return route;
 }
 function polyLen(from,route){let len=route.length?Math.hypot(route[0].x-from.x,route[0].z-from.z):0;for(let i=1;i<route.length;i++)len+=Math.hypot(route[i].x-route[i-1].x,route[i].z-route[i-1].z);return len}
 // Position + remaining waypoints after walking `dist` metres from `from` along `route`, with
 // the same dir convention assets/social-rules.js `advance()` uses.
 function interp(from,route,dist){
  const pts=[from,...route];let left=dist;
  for(let i=1;i<pts.length;i++){
   const a=pts[i-1],b=pts[i],d=Math.hypot(b.x-a.x,b.z-a.z);
   if(d<=left+1e-9){left-=d;if(i===pts.length-1)return {x:b.x,z:b.z,dir:dirOf(b.x-a.x,b.z-a.z),path:[]};continue}
   const t=d?left/d:0,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
   return {x,z,dir:dirOf(b.x-a.x,b.z-a.z),path:pts.slice(i).map(p=>({x:p.x,z:p.z}))};
  }
  const last=pts[pts.length-1];
  return {x:last.x,z:last.z,dir:0,path:[]};
 }
 // Walkable ring points around the Aetherwell - the same promenade band arrivals spawn on,
 // out to the poker approach. Filtered through R.walkable so blocked furniture never enters.
 function buildWaypoints(){
  const out=[];
  for(const r of[10.6,12.5,15,18.5,22,25.5])for(let k=0;k<16;k++){
   const a=k*Math.PI/8+r*0.11,x=Math.round(Math.cos(a)*r*10)/10,z=Math.round(Math.sin(a)*r*10)/10;
   if(R.walkable(x,z))out.push({x,z});
  }
  return out;
 }
 // A standing spot near a seat for the real-player yield (walkable ring around the tile).
 function nearWalkable(target){
  for(const d of[2,2.8,3.6])for(let k=0;k<8;k++){
   const a=k*Math.PI/4,x=Math.round((target.x+Math.cos(a)*d)*10)/10,z=Math.round((target.z+Math.sin(a)*d)*10)/10;
   if(R.walkable(x,z))return {x,z};
  }
  return null;
 }
 function makeLook(rnd){
  const sex=rnd()<.5?'m':'f';
  const heads={m:pick(rnd,W.HAIRS.m),f:pick(rnd,W.HAIRS.f)};
  const colors={m:Math.floor(rnd()*9),f:Math.floor(rnd()*9)};
  const appearance=W.normalize(Object.assign(W.defaults(sex),{sex,heads,colors}))||W.defaults(sex);
  const cls=pick(rnd,Object.keys(W.CLASSES));
  const speed=Math.round((4.5+rnd()*2)*10)/10;
  const lv=pick(rnd,[0,12,34,42,55,77,99,150]);
  const refine=rnd()<.2?7:0;
  return {cls,appearance,speed,lv,refine,title:''};
 }
 function makeName(rnd,used){
  for(let i=0;i<40;i++){
   const name=pick(rnd,NAME_A)+(rnd()<.55?pick(rnd,NAME_B):'');
   if(!used.has(name)&&name.length>=4){used.add(name);return name}
  }
  const name='Wanderer'+used.size;used.add(name);return name;
 }
 // One long rest:10-20 minutes at the current spot.
 function stayMs(rnd){return STAY_MIN_MS+Math.floor(rnd()*STAY_SPAN_MS)}
 // Exactly one emote per rest, a third to two thirds of the way through it: one bubble per
 //10-20 minutes on average, never a burst. Same emotion pool as before.
 function stayEmote(rnd,dur){
  return {after:'enter',at:Math.floor(dur*(0.35+rnd()*0.3)),emotion:pick(rnd,EMOTES)};
 }
 // One walk leg. Returns null when the target is unreachable from here (caller falls back to
 // standing still) and {seg:null} when already standing on the rounded target.
 function walkSeg(cur,target,speed,slack){
  const route=fastPath(cur,target);
  if(!route.length){
   if(Math.round(cur.x)===Math.round(target.x)&&Math.round(cur.z)===Math.round(target.z))return {seg:null,end:{x:target.x,z:target.z}};
   return null;
  }
  const end={x:route[route.length-1].x,z:route[route.length-1].z};
  const walkMs=Math.ceil(polyLen(cur,route)/speed*1000);
  const a=route.length>1?route[route.length-2]:cur,b=route[route.length-1];
  return {seg:{kind:'walk',route,from:{x:cur.x,z:cur.z},to:end,dir:dirOf(b.x-a.x,b.z-a.z),walkMs,dur:walkMs+(slack||WALK_SLACK_MS)},end};
 }
 function seatSeg(cur,seat,speed,rnd){
  const target={x:seat.x,z:seat.z};
  const route=fastPath(cur,target);
  const atSeat=Math.round(cur.x)===Math.round(target.x)&&Math.round(cur.z)===Math.round(target.z);
  if(!route.length&&!atSeat)return null;
  const walkMs=route.length?Math.ceil(polyLen(cur,route)/speed*1000):0;
  const end=route.length?{x:route[route.length-1].x,z:route[route.length-1].z}:{x:target.x,z:target.z};
  const sitMs=stayMs(rnd);
  return {kind:'seat',route,from:{x:cur.x,z:cur.z},to:end,seat:seat.id,walkMs,sitMs,dur:walkMs+sitMs,
   fallback:nearWalkable(target),emote:stayEmote(rnd,walkMs+sitMs)};
 }
 function fishSeg(cur,chair,speed,rnd){
  if(!chair)return null;
  const target={x:chair.x,z:chair.z};
  const route=fastPath(cur,target);
  const atChair=Math.round(cur.x)===Math.round(target.x)&&Math.round(cur.z)===Math.round(target.z);
  if(!route.length&&!atChair)return null;
  const walkMs=route.length?Math.ceil(polyLen(cur,route)/speed*1000):0;
  const end=route.length?{x:route[route.length-1].x,z:route[route.length-1].z}:{x:target.x,z:target.z};
  const fishMs=stayMs(rnd);
  // Cast from the chair toward the lake and keep the bobber inside the water line.
  const pond=R.PONDS[0],dx=pond.x-end.x,dz=pond.z-end.z,len=Math.hypot(dx,dz)||1;
  const bob=R.clampPond(pond,end.x+dx/len*3,end.z+dz/len*3,1);
  return {kind:'fish',route,from:{x:cur.x,z:cur.z},to:end,seat:chair.id,walkMs,fishMs,dur:walkMs+fishMs,
   bobber:{x:Math.round(bob.x*100)/100,z:Math.round(bob.z*100)/100},rod:pick(rnd,RODS),
   fallback:nearWalkable(target),emote:stayEmote(rnd,walkMs+fishMs)};
 }
 function idleSeg(at,dur,dir,emote){
  return {kind:'idle',from:{x:at.x,z:at.z},at:{x:at.x,z:at.z},dir:dir&7,dur,emote:emote||null};
 }
 // The DigiPet corridor on the east side: stand spots beside Cook Lina (28,39), Trainer Jori
 // (27.7,55) and Guide Nia (27.7,71). All nine were probed walkable and reachable in both
 // directions from every promenade ring waypoint.
 function buildDigiSpots(){
  const raw=[[26,43],[30,40],[30,43],[26,52],[30,55],[26,58],[26,67],[30,70],[30,67]];
  const out=[];
  for(const [x,z] of raw)if(R.walkable(x,z))out.push({x,z});
  return out;
 }
 function buildPlan(bot,rnd,waypoints,mySeats,chair,digiWp,speed){
  const segs=bot.segments;
  const wp=()=>pick(rnd,waypoints);
  const stepWalk=(target)=>{
   const w=walkSeg(bot._cur,target,speed);
   if(w===null)return false;
   if(w.seg)segs.push(w.seg);
   bot._cur=w.end;
   return true;
  };
  // A10-20 minute rest in place, with its single mid-stay emote.
  const stepStay=()=>{
   const dur=stayMs(rnd);
   segs.push(idleSeg(bot._cur,dur,Math.floor(rnd()*8),stayEmote(rnd,dur)));
  };
  bot._cur=wp();
  const first={x:bot._cur.x,z:bot._cur.z};
  //1. Loiter where the cycle starts (10-20 min).
  stepStay();
  //2. Walk to the DigiPet corridor and hang around the NPCs (10-20 min).
  if(stepWalk(digiWp||wp()))stepStay();
  else stepStay();
  //3. Walk to their bench and sit (10-20 min).
  if(mySeats.length){
   const seat=mySeats[Math.floor(rnd()*mySeats.length)];
   const s=seatSeg(bot._cur,seat,speed,rnd);
   if(s){segs.push(s);bot._cur=s.to}
   else stepStay();
  }else stepStay();
  //4. Walk to their pond chair and fish (10-20 min).
  const f=fishSeg(bot._cur,chair,speed,rnd);
  if(f){segs.push(f);bot._cur=f.to}
  else{stepWalk(wp());stepStay()}
  // Close the loop: walk home to where the cycle starts. If that leg is unreachable, move the
  // start to where the bot actually is so stateAt stays continuous across the wrap.
  const home=walkSeg(bot._cur,first,speed);
  if(home&&home.seg)segs.push(home.seg);
  else if(home){segs[0].at={x:home.end.x,z:home.end.z};segs[0].from={x:home.end.x,z:home.end.z}}
  else{segs[0].at={x:bot._cur.x,z:bot._cur.z};segs[0].from={x:bot._cur.x,z:bot._cur.z}}
  let start=0;
  for(const seg of segs){seg.start=start;start+=seg.dur}
  bot.cycleMs=start;
  bot._cur=null;
 }
 function buildRoster(seed,opts){
  opts=opts||{};
  const count=Math.max(0,Math.min(MAX_COUNT,Math.floor(Number(opts.count===undefined?DEFAULT_COUNT:opts.count))));
  const bots=[];
  if(!count)return bots;
  const rnd=mulberry32((seed>>>0)||1);
  const sitPool=[],chairPool=[];
  for(let i=0;i<R.SEATS.length;i++){
   const s=R.SEATS[i];if(!s)continue;
   if(s.bench>=100)chairPool.push(s);else sitPool.push(s);
  }
  for(let i=sitPool.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));const t=sitPool[i];sitPool[i]=sitPool[j];sitPool[j]=t}
  const wpList=buildWaypoints();
  const waypoints=wpList.length?wpList:[{x:0,z:12}];
  const digiList=buildDigiSpots();
  const usedNames=new Set();
  for(let i=0;i<count;i++){
   const look=makeLook(rnd);
   const speed=R.walkSpeed({look});
   const mySeats=sitPool.filter((_,k)=>k%count===i);
   const chair=chairPool[i%Math.max(1,chairPool.length)]||null;
   const digiWp=digiList.length?digiList[i%digiList.length]:null;
   const bot={id:'bot'+i,name:makeName(rnd,usedNames),look,phase:Math.floor(rnd()*100000),segments:[],cycleMs:0,
    chairId:chair?chair.id:null};
   buildPlan(bot,rnd,waypoints,mySeats,chair,digiWp,speed);
   bots.push(bot);
  }
  return bots;
 }
 function segmentAt(bot,t){
  const cycleMs=bot.cycleMs||1;
  const shifted=(t+bot.phase);
  const cycle=Math.floor(shifted/cycleMs);
  let local=shifted-cycle*cycleMs;
  if(local<0)local+=cycleMs;
  const segs=bot.segments;
  for(let i=0;i<segs.length;i++){
   const seg=segs[i];
   if(local<seg.start+seg.dur)return {index:i,seg,local:local-seg.start,cycle};
  }
  const last=segs[segs.length-1];
  return {index:segs.length-1,seg:last,local:last.dur,cycle};
 }
 // Visual state for shared wall-clock `t` (ms, already skewed to the room clock by the caller).
 function stateAt(bot,t){
  const cur=segmentAt(bot,t),seg=cur.seg,local=cur.local;
  const base={sit:false,seat:null,path:[],fish:null};
  if(seg.kind==='walk'){
   if(local<seg.walkMs){
    const p=interp(seg.from,seg.route,local/1000*botSpeed(bot));
    return Object.assign(base,{x:p.x,z:p.z,dir:p.dir,path:p.path||[]});
   }
   return Object.assign(base,{x:seg.to.x,z:seg.to.z,dir:seg.dir||0,path:[]});
  }
  if(seg.kind==='seat'){
   if(local<seg.walkMs){
    const p=interp(seg.from,seg.route,local/1000*botSpeed(bot));
    return Object.assign(base,{x:p.x,z:p.z,dir:p.dir,path:p.path||[],seat:seg.seat});
   }
   const dir=R.SEATS[seg.seat]?R.SEATS[seg.seat].dir:0;
   return Object.assign(base,{x:seg.to.x,z:seg.to.z,dir,sit:true,seat:seg.seat});
  }
  if(seg.kind==='fish'){
   if(local<seg.walkMs){
    const p=interp(seg.from,seg.route,local/1000*botSpeed(bot));
    return Object.assign(base,{x:p.x,z:p.z,dir:p.dir,path:p.path||[],seat:seg.seat});
   }
   const dir=R.SEATS[seg.seat]?R.SEATS[seg.seat].dir:0;
   const mode=FISH_CYCLE[Math.floor((local-seg.walkMs)/FISH_STEP_MS)%FISH_CYCLE.length];
   return Object.assign(base,{x:seg.to.x,z:seg.to.z,dir,sit:true,seat:seg.seat,
    fish:{on:true,pond:0,x:seg.bobber.x,z:seg.bobber.z,mode,rod:seg.rod}});
  }
  return Object.assign(base,{x:seg.at.x,z:seg.at.z,dir:seg.dir});
 }
 function botSpeed(bot){return R.walkSpeed({look:bot.look})}
 return {DEFAULT_COUNT,MAX_COUNT,SOLO_SEED,EMOTES,FISH_CYCLE,RODS,buildRoster,segmentAt,stateAt,fastPath};
});
