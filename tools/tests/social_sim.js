/* Real room core: privacy, capacity, collision, reconnect and bounded traffic. */
const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
(async()=>{
 const {SocialRoom}=await import('../../workers/social/room.mjs');const R=globalThis.PGSocialRules;let now=1000;const room=new SocialRoom({now:()=>now});
 const join=id=>{const events=[];const c=room.connect({id,username:'Player'+id},s=>events.push(JSON.parse(s)),()=>{});c.events=events;room.receive(c,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));return c};
 const emotionMap=JSON.parse(fs.readFileSync('tools/social/emotion-map.json')),emotionLock=JSON.parse(fs.readFileSync('tools/social/emotions-lock.json'));
 assert.deepEqual([...R.EMOTIONS].sort(),Object.keys(emotionMap).sort());assert.deepEqual([...R.EMOTIONS].sort(),Object.keys(emotionLock.outputs).sort());
 for(const id of R.EMOTIONS)assert.equal(createHash('sha256').update(fs.readFileSync('assets/social/emotions/'+id+'.png')).digest('hex'),emotionLock.outputs[id].sha256);
 const clients=Array.from({length:21},(_,i)=>join(i+1));assert.equal(clients[19].room,1);assert.equal(clients[20].room,2);assert.equal(clients[0].events.find(x=>x.type==='room').players.length,1);
 assert.equal(new Set(clients.slice(0,20).map(p=>p.x+','+p.z)).size,20,'arrivals have distinct visible spawn positions');
 const a=clients[0],b=clients[1],outsider=clients[20],send=(c,m)=>room.receive(c,JSON.stringify(m));
 send(a,{type:'chat',channel:'local',body:'Only plaza one'});assert(b.events.some(e=>e.body==='Only plaza one'));assert(!outsider.events.some(e=>e.body==='Only plaza one'));
 now+=3000;send(a,{type:'chat',channel:'whisper',to:b.name,body:'Private'});assert(b.events.some(e=>e.body==='Private'));assert(!clients[2].events.some(e=>e.body==='Private'));
 now+=3000;send(a,{type:'chat',channel:'world',body:'Everyone'});assert(outsider.events.some(e=>e.body==='Everyone'));
 // v274 (owner): an emotion rides the channel it was sent on - world emotion
 // reaches the plaza an outsider is standing in, and a whispered emotion goes to
 // that one player and no further.
 now+=3000;send(a,{type:'emotion',emotion:'heart',channel:'local'});assert(b.events.some(e=>e.emotion==='heart'));assert(!outsider.events.some(e=>e.emotion==='heart'));
 now+=3000;assert.equal(a.room,1);send(a,{type:'emotion',emotion:'heart',channel:'world'});assert.equal(b.events.find(e=>e.emotion==='heart'&&e.channel==='world').channel,'world');assert(outsider.events.some(e=>e.emotion==='heart'&&e.channel==='world'),'a world emotion crosses plazas');
 const before=b.events.filter(e=>e.emotion==='laugh').length;now+=3000;send(a,{type:'emotion',emotion:'laugh',channel:'whisper',to:b.name});const whispered=b.events.filter(e=>e.emotion==='laugh');assert.equal(whispered.length,before+1);assert.equal(whispered.at(-1).channel,'whisper');assert.equal(whispered.at(-1).toName,b.name);assert.equal(b.events.filter(e=>e.emotion==='laugh').length>0&&outsider.events.filter(e=>e.emotion==='laugh').length,0,'a whispered emotion stays between the two');
 const delivered=room.serial;send(a,{type:'chat',channel:'world',body:'too soon'});assert.equal(room.serial,delivered);now+=2999;send(a,{type:'emotion',emotion:'heart'});assert.equal(room.serial,delivered);now++;send(a,{type:'chat',channel:'world',body:'after 3 seconds'});assert.equal(room.serial,delivered+1);
 for(const point of [{x:0,z:65},{x:70,z:30},{x:-70,z:-30},{x:0,z:-34}]){const route=R.path({x:0,z:12},point);assert(route.length,'new avenues reachable');assert(route.every(p=>R.walkable(p.x,p.z)))}
 assert(!R.walkable(56,16),'houses block walking');assert(!R.walkable(0,-61),'castle blocks walking');assert(!R.walkable(75,10));
 for(const seat of R.SEATS){assert(R.path({x:0,z:12},seat).length,'each chair reachable')}
 for(const garden of R.GARDENS){assert(!R.walkable(garden.x,garden.z),'bounded garden cannot be crossed');assert(R.TREES.some(t=>t.x===garden.x&&t.z===garden.z&&t.size<=garden.w-4),'tree canopy has a garden setback')}
 for(let n=-30;n<=30;n++){if(Math.abs(n)>6){assert(R.walkable(0,n),'north/south promenade stays clear');assert(R.walkable(n,0),'east/west promenade stays clear')}}
 now+=200;send(b,{type:'seat',id:0});assert(b.path.length);now+=30000;const seated=room.snapshot(b);assert(seated.sit);assert.equal(seated.seat,0);assert.equal(seated.x,R.SEATS[0].x);assert.equal(seated.dir,R.SEATS[0].dir);now+=200;send(b,{type:'move',x:0,z:12});assert(!b.sit);assert.equal(b.seat,null);
 send(a,{type:'move',x:0,z:0});assert.equal(a.path.length,0);send(a,{type:'move',x:0,z:-12});now+=101;send(a,{type:'move',x:0,z:-12});assert(a.path.length>0);assert(a.path.every(p=>R.walkable(p.x,p.z)));for(let t=0;t<300;t++){now+=50;R.advance(a,now);assert(R.walkable(a.x,a.z))}assert.equal(a.z,-12);
 send(a,{type:'sit'});assert(a.sit);assert.equal(a.path.length,0);now+=200;send(a,{type:'move',x:10,z:-12});assert(!a.sit);
 // Real server walking settles into a reserved bench, with per-plaza occupancy.
 assert.equal(R.BENCHES.length,12);assert.equal(R.SEATS.length,32,'12 metal benches (24 seats) plus 8 pond-side angler chairs (v288)');
 for(const seat of R.SEATS){assert(R.walkable(seat.x,seat.z));assert(R.path(a,seat).length>0)}
 now+=200;send(a,{type:'seat',id:0});assert.equal(a.seat,0);assert(a.path.length>0);assert(!a.sit);
 send(b,{type:'seat',id:0});assert.equal(b.seat,null);assert(b.events.some(e=>e.message==='That bench is occupied.'));
 // Second spot on the same metal bench (id:1, bench:0) is open for a friend to sit side-by-side!
 now+=200;send(b,{type:'seat',id:1});assert.equal(b.seat,1);assert.equal(R.SEATS[0].bench,R.SEATS[1].bench);
 now+=200;send(clients[2],{type:'seat',id:1});assert.equal(clients[2].seat,null);assert(clients[2].events.some(e=>e.message==='That bench is occupied.'));
 now+=200;send(b,{type:'move',x:0,z:12});assert.equal(b.seat,null);
 // Full Plaza 1 blocks outsider from switching into Plaza 1, while a Plaza 1 member can hop to Plaza 2 and back once space opens.
 now+=200;send(outsider,{type:'switch_room',room:1});assert.equal(outsider.room,2);assert(outsider.events.some(e=>/Plaza 1 is full/.test(e.message||'')));
 now+=200;send(clients[2],{type:'switch_room',room:2});assert.equal(clients[2].room,2);assert(outsider.events.some(e=>e.type==='player'&&e.player.id===clients[2].id));
 now+=200;send(clients[2],{type:'switch_room',room:1});assert.equal(clients[2].room,1);
 send(outsider,{type:'seat',id:0});assert.equal(outsider.seat,0,'seats belong to each plaza');
 now+=30000;const arrived=room.snapshot(a);assert(arrived.sit);assert.equal(arrived.path.length,0);assert.equal(arrived.z,R.SEATS[0].z);assert.equal(arrived.dir,R.SEATS[0].dir);
 now+=200;send(a,{type:'look',look:{cls:'Novice',appearance:{version:1,sex:'m'},title:'Poring Hunter',refine:10}});assert.equal(a.look.title,'Poring Hunter');assert.equal(a.look.refine,10);assert.equal(a.seat,0);assert.equal(a.z,R.SEATS[0].z);assert(b.events.some(e=>e.player?.look?.title==='Poring Hunter'));
 now+=200;send(a,{type:'sit'});assert(!a.sit);assert.equal(a.seat,null);
 now+=200;send(b,{type:'seat',id:0});assert.equal(b.seat,0);now+=200;send(b,{type:'move',x:10,z:12});assert.equal(b.seat,null);assert(!b.sit);
 now+=200;send(a,{type:'seat',id:1});const seat=a.seat;now+=200;send(a,{type:'seat',id:'invalid'});assert.equal(a.seat,seat,'invalid seats cannot change state');
 for(const emotion of R.EMOTIONS){now+=R.CHAT_DELAY;send(a,{type:'emotion',emotion});assert(b.events.some(e=>e.emotion===emotion&&e.channel==='local'),'bare emotion still means Local');assert(!outsider.events.some(e=>e.emotion===emotion&&e.channel==='local'));}
 send(a,{type:'leave'});const prior=b.events.length;send(a,{type:'chat',channel:'local',body:'must reject'});assert.equal(b.events.length,prior);
 for(let i=0;i<20;i++)send(a,{type:'chat',channel:'world',body:'flood'});assert(a.events.some(e=>e.type==='error'&&e.message.includes('wait')));
 room.disconnect(b);assert(!room.clients.has(b.id));assert(clients[2].events.some(e=>e.type==='left'&&e.id===b.id));
 let closed=false;const old=room.connect({id:100,username:'Replacement'},()=>{},()=>closed=true);room.connect({id:100,username:'Replacement'},()=>{},()=>{});assert(closed);room.disconnect(old);assert(room.clients.has(100));
 now+=301000;room.sweep();assert.equal(room.clients.size,0);
 // v225: each character walks at its own field run speed; the room clamps the reported value into
 // the shared band and both server and client read it back through PGSocialRules.walkSpeed.
 const walkRoom=new SocialRoom({now:()=>now});
 const walkJoin=(id,look)=>{const events=[];const c=walkRoom.connect({id,username:'Walker'+id},s=>events.push(JSON.parse(s)),()=>{});c.events=events;walkRoom.receive(c,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'},...look}}));return c};
 const fast=walkJoin(201,{speed:99,lv:150}),slow=walkJoin(202,{speed:1,lv:-5}),plain=walkJoin(203,{});
 assert.equal(fast.look.speed,R.MAX_SPEED,'a client cannot report more than the fastest legal walk');
 assert.equal(fast.look.lv,150,'level is kept for the plaza aura');
 assert.equal(slow.look.speed,R.MIN_SPEED,'a client cannot report below the minimum walk');
 assert.equal(slow.look.lv,0,'invalid levels fall back to no aura');
 assert.equal(plain.look.speed,R.SPEED,'older looks without speed use the shared default');
 assert.equal(R.walkSpeed({look:{speed:9}}),9,'the shared rules honour the validated speed');
 const walker={x:0,z:40,path:[{x:0,z:0}],at:0,look:{speed:9}};R.advance(walker,1000);assert.equal(walker.z,31,'advance honours the character speed for clients and the room');
 fast.x=0;fast.z=12;fast.at=now;fast.path=[{x:0,z:-24}];const fastBefore=fast.z;now+=1000;walkRoom.snapshot(fast);
 assert.equal(fastBefore-fast.z,R.MAX_SPEED,'the room itself advances at the validated speed');
 walkRoom.disconnect(fast);walkRoom.disconnect(slow);walkRoom.disconnect(plain);
 // v236: two clocks. Activity slides the idle window, so a player who is actually there is never
 // dropped for being there; the only planned drop is the 30-minute re-authentication through Pages,
 // announced with a `reauth` event first so the client can reconnect and reseat without a failure.
 let beatNow=0;const refreshed=[];
 const beatRoom=new SocialRoom({now:()=>beatNow});
 const beat=beatRoom.connect({id:301,username:'Beater'},raw=>{const e=JSON.parse(raw);if(e.type==='reauth')refreshed.push(['reauth',beatNow])},(code,why)=>refreshed.push([code,beatNow]));
 beatRoom.receive(beat,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));
 for(let t=0;t<=29*60;t+=2){beatNow=t*1000;beatRoom.receive(beat,JSON.stringify({type:'ping'}));beatRoom.sweep();assert(beatRoom.clients.has(301),'an active connection survives past five minutes')}
 assert.deepEqual(refreshed,[],'nothing has asked for re-authentication yet');
 for(let t=29*60+2;t<=31*60&&beatRoom.clients.has(301);t+=2){beatNow=t*1000;beatRoom.receive(beat,JSON.stringify({type:'ping'}))}
 assert(!beatRoom.clients.has(301),'a connection older than 30 minutes is refreshed through Pages');
 assert.equal(refreshed[0][0],'reauth','the client is told before the socket closes');
 assert.equal(refreshed.at(-1)[0],4000,'the refresh closes with code 4000');
 assert(refreshed.at(-1)[1]>=1800000,'the refresh happens at the 30-minute bound, not at five');
 // A socket that stops talking is still swept, so a half-open connection cannot hold a plaza slot.
 const idle=beatRoom.connect({id:302,username:'Idle'},()=>{},()=>{});
 beatRoom.receive(idle,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));
 beatNow+=299000;beatRoom.sweep();assert(beatRoom.clients.has(302),'a silent socket is still inside the idle window');
 beatNow+=2000;beatRoom.sweep();assert(!beatRoom.clients.has(302),'a silent socket is swept after five minutes');
 // Activity, not just age, is what keeps it open: one ping inside the window restarts the clock.
 const chatty=beatRoom.connect({id:303,username:'Chatty'},()=>{},()=>{});
 for(let i=0;i<6;i++){beatNow+=240000;beatRoom.receive(chatty,JSON.stringify({type:'ping'}));assert(beatRoom.clients.has(303),'each message slides the idle window forward')}
 beatNow+=400000;beatRoom.receive(chatty,JSON.stringify({type:'ping'}));assert(!beatRoom.clients.has(303),'activity cannot outrun the re-authentication bound');
 // v295: the line in the water is public, show-offs travel as data, and a silent drop resumes the
 // angler where they stood instead of respawning them at the plaza entrance.
 const fClock={t:5000},fishRoom=new SocialRoom({now:()=>fClock.t});
 const mk=(id)=>{const ev=[];const c=fishRoom.connect({id,username:'Angler'+id},raw=>ev.push(JSON.parse(raw)),()=>{});c.events=ev;fishRoom.receive(c,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));return c};
 const sendF=(c,m)=>fishRoom.receive(c,JSON.stringify(m));
 const angler=mk(401),watcher=mk(402);
 // v300: the angler's rod tier rides with the rig so everyone sees the same colour pole.
 sendF(angler,{type:'rig',on:true,pond:1,x:23,z:42,mode:'wait',rod:'mythril'});
 const rigged=watcher.events.find(e=>e.type==='player'&&e.player.id===401&&e.player.fish);
 assert(rigged&&rigged.player.fish.on===true,'everyone in the plaza is told where the line is');
 assert.equal(rigged.player.fish.x,23);assert.equal(rigged.player.fish.pond,1);
 assert.equal(rigged.player.fish.rod,'mythril','the rod tier is relayed verbatim');
 assert.equal(fishRoom.snapshot(angler,watcher).fish.on,true,'the rig rides the ordinary snapshot too');
 // A forged position or an unknown phase is dropped rather than broadcast.
 sendF(angler,{type:'rig',on:true,x:999,z:-999,mode:'nonsense'});
 assert.equal(angler.fish.x,23,'out-of-bounds rig packets change nothing');
 sendF(angler,{type:'rig',on:true,x:22,z:41,mode:'nonsense'});
 assert.equal(angler.fish.mode,'wait','an unknown phase falls back to waiting');
 sendF(angler,{type:'rig',on:true,x:22,z:41,mode:'wait',rod:'<script>'});
 assert.equal(angler.fish.rod,'twig','an unknown rod id falls back to the starting rod');
 sendF(angler,{type:'rig',on:true,x:22,z:41,mode:'wait'});
 assert.equal(angler.fish.rod,'twig','a rig with no rod id at all is still safe');
 sendF(angler,{type:'rig',on:false});
 assert.equal(angler.fish,null,'reeling in clears the shared rig');
 assert(watcher.events.some(e=>e.type==='player'&&e.player.id===401&&e.player.fish===null),'the plaza is told the line is out');
 // Show off is relayed as data: no chat line, bounded fields, and a cooldown.
 sendF(angler,{type:'showoff',sp:'<img src=x>',w:3});
 assert(!watcher.events.some(e=>e.type==='showoff'),'a non-species payload is never relayed');
 fClock.t+=2000;sendF(angler,{type:'showoff',sp:'koi',w:999,mut:'evil',perfect:true});
 const shown=watcher.events.filter(e=>e.type==='showoff').at(-1);
 assert(shown&&shown.sp==='koi'&&shown.w===999&&shown.from===401,'the show-off reaches the room as data');
 assert.equal(shown.mut,null,'an unknown mutation is dropped');
 assert.equal(shown.perfect,true);
 const beforeFlood=watcher.events.filter(e=>e.type==='showoff').length;
 sendF(angler,{type:'showoff',sp:'koi',w:5});
 assert.equal(watcher.events.filter(e=>e.type==='showoff').length,beforeFlood,'show-offs are rate limited');
 const pond0=R.PONDS[0];
 // v296: every reservation is also handed to storage, so a Durable Object eviction between the
 // drop and the reconnect cannot turn the resume into a fresh join at the entrance.
 const stored=new Map();
 const durableRoom=new SocialRoom({now:()=>fClock.t,onResume:(id,rec)=>{rec?stored.set(id,rec):stored.delete(id)}});
 const dJoin=(id)=>{const ev=[];const c=durableRoom.connect({id,username:'Durable'+id},raw=>ev.push(JSON.parse(raw)),()=>{});c.events=ev;durableRoom.receive(c,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));return c};
 const keeper=dJoin(501);
 keeper.x=pond0.x+8;keeper.z=pond0.z+1;keeper.at=fClock.t;
 durableRoom.disconnect(keeper);
 assert(stored.has(501),'a drop writes the spot to storage');
 assert.equal(stored.get(501).x,pond0.x+8);
 // A brand-new room (what a restarted Durable Object is) loading that storage resumes the spot.
 const evicted=new SocialRoom({now:()=>fClock.t});
 for(const [id,rec] of stored)evicted.resumes.set(id,rec);
 const revivedEv=[];const revived=evicted.connect({id:501,username:'Durable501'},raw=>revivedEv.push(JSON.parse(raw)),()=>{});
 evicted.receive(revived,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));
 assert(Math.hypot(revived.x-(pond0.x+8),revived.z-(pond0.z+1))<2,'a restarted room resumes the stored spot instead of spawning');
 assert.equal(revived.room,1);
 evicted.disconnect(revived);
 // Taking the reservation clears the stored copy, so nothing stale is reloaded later.
 const cleared=new Map();
 const tidyRoom=new SocialRoom({now:()=>fClock.t,onResume:(id,rec)=>{rec?cleared.set(id,rec):cleared.delete(id)}});
 const tidyJoin=(id)=>{const c=tidyRoom.connect({id,username:'Tidy'+id},()=>{},()=>{});tidyRoom.receive(c,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));return c};
 const tidy=tidyJoin(502);tidyRoom.disconnect(tidy);assert(cleared.has(502));
 const back2=tidyJoin(502);assert(!cleared.has(502),'resuming clears the stored reservation');
 tidyRoom.receive(back2,JSON.stringify({type:'leave'}));assert(!cleared.has(502),'leaving also clears it');

 assert(Math.hypot(0-pond0.x,12-pond0.z)>6.5,'the entrance is far outside fishing range - a respawn there cancels the cast');
 // A silent drop keeps the spot for the whole idle window, not the old 15 seconds.
 fClock.t+=1000;angler.x=pond0.x+9;angler.z=pond0.z;angler.at=fClock.t;
 const pondSpot={x:angler.x,z:angler.z};
 fishRoom.disconnect(angler);
 fClock.t+=60000;const resumed=mk(401);
 assert.equal(resumed.room,1,'a reconnect a minute later rejoins the same plaza');
 assert(Math.hypot(resumed.x-pondSpot.x,resumed.z-pondSpot.z)<2,'the angler resumes at the pond, not the entrance');
 assert(resumed.events.some(e=>e.type==='room'),'the reconnecting client is sent the room snapshot');
 // v311 (owner: "he auto jumps around on reconnect"): the room keeps the spot, never the errand.
 // A half-finished walk used to be restored, so a reconnected client watched its character stroll
 // off toward a destination it had already forgotten.
 {
  const stand=R.POND_PROPS[0].stands.find(s=>s.name==='south')||R.POND_PROPS[0].stands[0];
  const walker=mk(403);
  fClock.t+=200;sendF(walker,{type:'move',x:stand.x,z:stand.z});
  assert(walker.path.length>0,'the walker really has a route');
  fClock.t+=300;R.advance(walker,fClock.t);
  const walkedTo={x:walker.x,z:walker.z};
  fishRoom.disconnect(walker);
  const walkBack=mk(403);
  assert.equal(walkBack.path.length,0,'a reconnect never resumes the old walk');
  assert(Math.hypot(walkBack.x-walkedTo.x,walkBack.z-walkedTo.z)<1,'the spot is where the walk had reached');
  assert.equal((walkBack.events.find(e=>e.type==='room')||{players:[]}).players.every(p=>p.id!==403||p.path.length===0),true,'the room snapshot publishes no stale route');
  fishRoom.disconnect(walkBack);
 }
 // The reservation is still bounded: past the idle window it is a fresh join at the entrance.
 fishRoom.disconnect(resumed);
 fClock.t+=310000;const fresh=mk(401);
 assert(Math.hypot(fresh.x,12-fresh.z)<1||Math.abs(fresh.z-12)<8,'an expired reservation spawns at the entrance again');
 // --- v304: the pond garden ----------------------------------------------------------------
 // The ponds are the plaza centrepiece now (18x13, a bridge, a waterfall garden). These are the
 // checks the owner asked for by eye: nothing in the water, nothing on a chair, no prop in a house.
 for(const p of R.PONDS){
  assert.equal(p.w,18,'the pond is 18 wide');assert.equal(p.d,13,'and 13 deep');
  const inWater=(x,z,m=0)=>Math.abs(x-p.x)<p.w/2-m&&Math.abs(z-p.z)<p.d/2-m;
  const onTop=(x,z,r,o)=>Math.hypot(x-o.x,z-o.z)<r;
  const props=R.POND_PROPS[R.PONDS.indexOf(p)];
  assert(props,'every pond has its garden props');
  for(const b of props.boulders){
   assert(!inWater(b.x,b.z,b.r),'a boulder never sits in the water');
   for(const c of R.CHAIRS)assert(!onTop(b.x,b.z,b.r+1,c),'a boulder never crowds an angler chair');
   for(const b2 of R.BENCHES)assert(Math.hypot(b.x-b2.x,b.z-b2.z)>4,'a boulder stays off the bench rows');
  }
  for(const l of props.lanterns){
   assert(!inWater(l.x,l.z,.5),'a stone lantern stands on the shore, not in the water');
   for(const c of R.CHAIRS)assert(!onTop(l.x,l.z,1.2,c),'a lantern never crowds a chair');
  }
  for(const t of props.blossoms){
   assert(!inWater(t.x,t.z,1.2),'a blossom tree is planted on the grass');
   for(const c of R.CHAIRS)assert(!onTop(t.x,t.z,1.6,c),'a bloom never hides a chair');
  }
  // The bridge tunnels the outflow: it sits south of the water and clears both south chairs.
  assert(props.bridge.z>p.z+p.d/2,'the bridge is past the south rim');
  for(const c of R.CHAIRS)assert(Math.abs(c.x-props.bridge.x)>props.bridge.span/2||Math.abs(c.z-props.bridge.z)>props.bridge.width/2+1,'the bridge never sits on a chair');
  // It is a garden behind the pond, so it must stay clear of the houses at z=56 and the planting.
  for(const b of R.BUILDINGS)assert(Math.hypot(p.x-b.x,p.z-b.z)>Math.max(p.w,b.w)/2+Math.max(p.d,b.d)/2-12,'the pond does not run into a building');
  for(const g of R.GARDENS)assert(Math.abs(p.x-g.x)>g.w/2+p.w/2||Math.abs(p.z-g.z)>g.d/2+p.d/2,'the pond does not run into a garden');
  // Fishing spots: the rim is walkable all the way round except where the cascade's boulder heap
  // stands (v309: it is solid, so you can no longer end up standing inside the rock face).
  assert(!R.walkable(p.x,p.z),'pond water is not walkable');
  // The pond blocks as a box, so the walkable rim is the box offset by the fishing stand-off.
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
   const x=p.x+dx*(p.w/2+1.7),z=p.z+dz*(p.d/2+1.7);
   if(R.cragBlocked(x,z)){assert(!R.walkable(x,z),'the boulder heap behind the cascade is solid');continue}
   assert(R.walkable(x,z),'the rim at '+dx+'/'+dz+' is walkable');
  }
  assert(R.walkable(p.x,p.z+p.d/2+1.4),'the south bank (and the bridge approach) is walkable');
 }
 console.log('PASS social room: channel privacy, 20-player overflow, native emotion events, collision, movement/sit, rate limit, sliding idle window with a 30-minute re-authentication, per-character walk speed and tab replacement; v304 18x13 ponds whose bridge, falls, lanterns, blossoms and boulders stay out of the water and off every chair');
})().catch(e=>{console.error(e);process.exitCode=1});
