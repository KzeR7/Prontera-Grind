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
 for(const point of [{x:0,z:65},{x:0,z:120},{x:70,z:30},{x:-70,z:-30},{x:0,z:-34}]){const route=R.path({x:0,z:12},point);assert(route.length,'new avenues reachable');assert(route.every(p=>R.walkable(p.x,p.z)))}
 assert(!R.walkable(-46,-25),'remaining houses block walking');assert(R.walkable(56,16),'former east houses are cleared for the farm');assert(!R.walkable(0,-61),'castle blocks walking');assert(!R.walkable(R.MAX_X+1,10));assert(R.walkable(0,126));assert(!R.walkable(0,127));assert(!R.walkable(0,-75));
 for(const seat of R.SEATS){assert(R.path({x:0,z:12},seat).length,'each chair reachable')}
 for(const garden of R.GARDENS){assert(!R.walkable(garden.x,garden.z),'bounded garden cannot be crossed');assert(R.TREES.some(t=>t.x===garden.x&&t.z===garden.z&&t.size<=garden.w-4),'tree canopy has a garden setback')}
 for(let n=-30;n<=30;n++){if(Math.abs(n)>6){assert(R.walkable(0,n),'north/south promenade stays clear');assert(R.walkable(n,0),'east/west promenade stays clear')}}
 now+=200;send(b,{type:'seat',id:0});assert(b.path.length);now+=30000;const seated=room.snapshot(b);assert(seated.sit);assert.equal(seated.seat,0);assert.equal(seated.x,R.SEATS[0].x);assert.equal(seated.dir,R.SEATS[0].dir);now+=200;send(b,{type:'move',x:0,z:12});assert(!b.sit);assert.equal(b.seat,null);
 send(a,{type:'move',x:0,z:0});assert.equal(a.path.length,0);send(a,{type:'move',x:0,z:-12});now+=101;send(a,{type:'move',x:0,z:-12});assert(a.path.length>0);assert(a.path.every(p=>R.walkable(p.x,p.z)));for(let t=0;t<300;t++){now+=50;R.advance(a,now);assert(R.walkable(a.x,a.z))}assert.equal(a.z,-12);
 send(a,{type:'sit'});assert(a.sit);assert.equal(a.path.length,0);now+=200;send(a,{type:'move',x:10,z:-12});assert(!a.sit);
 // Real server walking settles into a reserved bench, with per-plaza occupancy.
 assert.equal(R.BENCHES.length,19);assert.equal(R.SEATS.length,46,'12 plaza + 7 v356 viewing benches (38 bench seats) plus 8 pond-side angler chairs');
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
 // Fishing lines in the newly extended south must be sent to the other player.
 sendF(angler,{type:'rig',on:true,pond:0,x:-38,z:100,mode:'wait'});
 assert.equal(angler.fish.z,100);assert(watcher.events.some(e=>e.type==='player'&&e.player.id===401&&e.player.fish?.z===100),'south rig is broadcast');
 sendF(angler,{type:'rig',on:true,pond:0,x:100,z:100,mode:'wait'});assert.equal(angler.fish.x,100,'rig validation accepts the expanded eastern bounds');
 sendF(angler,{type:'rig',on:true,pond:0,x:-38,z:100,mode:'wait'});
 for(const bad of [{x:0,z:R.MAX_Z+1},{x:0,z:R.MIN_Z-1},{x:R.MAX_X+1,z:100},{x:R.MIN_X-1,z:100}]){sendF(angler,{type:'rig',on:true,...bad,mode:'wait'});assert.equal(angler.fish.z,100,'out-of-bounds rig is rejected')}
 sendF(angler,{type:'rig',on:true,pond:1,x:23,z:42,mode:'wait',rod:'mythril'});
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
 keeper.x=pond0.x+8;keeper.z=R.POND_PROPS[0].bridge.z;keeper.at=fClock.t;
 durableRoom.disconnect(keeper);
 assert(stored.has(501),'a drop writes the spot to storage');
 assert.equal(stored.get(501).x,pond0.x+8);
 // A brand-new room (what a restarted Durable Object is) loading that storage resumes the spot.
 const evicted=new SocialRoom({now:()=>fClock.t});
 for(const [id,rec] of stored)evicted.resumes.set(id,rec);
 const revivedEv=[];const revived=evicted.connect({id:501,username:'Durable501'},raw=>revivedEv.push(JSON.parse(raw)),()=>{});
 evicted.receive(revived,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));
 assert(Math.hypot(revived.x-(pond0.x+8),revived.z-R.POND_PROPS[0].bridge.z)<2,'a restarted room resumes the stored spot instead of spawning');
 assert.equal(revived.room,1);
 evicted.disconnect(revived);
 // A dry position south of the v331 lake is flooded by the extension and must be rescued.
 const flooded=new SocialRoom({now:()=>fClock.t});
 assert(!R.pondContains({x:-34,z:66,w:38,d:46},-34,95)&&!R.walkable(-34,95),'v331 dry land became water');
 flooded.resumes.set(510,{room:1,x:-34,z:95,dir:0,sit:false,seat:null,pokerSeat:null,expires:fClock.t+5000});
 const rescued=flooded.connect({id:510,username:'Rescued'},()=>{},()=>{});
 assert(R.walkable(rescued.x,rescued.z),'old water position is relocated safely');
 assert.equal(rescued.room,1,'room is preserved after relocation');
 // A location occupied by a new Sanctuary wall is also safely relocated after an upgrade.
 flooded.resumes.set(512,{room:1,x:52,z:12.5,dir:0,sit:false,seat:null,pokerSeat:null,expires:fClock.t+5000});
 const wallRescue=flooded.connect({id:512,username:'WallRescue'},()=>{},()=>{});assert(R.walkable(wallRescue.x,wallRescue.z),'old position inside new gym wall is recovered');

 // Existing pond-seat reservations keep the same ID but follow the relocated chair.
 flooded.resumes.set(511,{room:1,x:23,z:48,dir:0,sit:true,seat:28,pokerSeat:null,expires:fClock.t+5000});
 const reseated=flooded.connect({id:511,username:'Reseated'},()=>{},()=>{});
 assert.equal(reseated.seat,28);assert.equal(reseated.x,R.SEATS[28].x);assert.equal(reseated.z,R.SEATS[28].z);

 // Taking the reservation clears the stored copy, so nothing stale is reloaded later.
 const cleared=new Map();
 const tidyRoom=new SocialRoom({now:()=>fClock.t,onResume:(id,rec)=>{rec?cleared.set(id,rec):cleared.delete(id)}});
 const tidyJoin=(id)=>{const c=tidyRoom.connect({id,username:'Tidy'+id},()=>{},()=>{});tidyRoom.receive(c,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));return c};
 const tidy=tidyJoin(502);tidyRoom.disconnect(tidy);assert(cleared.has(502));
 const back2=tidyJoin(502);assert(!cleared.has(502),'resuming clears the stored reservation');
 tidyRoom.receive(back2,JSON.stringify({type:'leave'}));assert(!cleared.has(502),'leaving also clears it');

 assert(Math.hypot(0-pond0.x,12-pond0.z)>6.5,'the entrance is far outside fishing range - a respawn there cancels the cast');
 // A silent drop keeps the spot for the whole idle window, not the old 15 seconds.
 fClock.t+=1000;angler.x=pond0.x+9;angler.z=R.POND_PROPS[0].bridge.z;angler.at=fClock.t;
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
 // Approved west lake: the bridge crosses water, while other water remains blocked.
 assert.equal(R.PONDS.length,1);
 const lake=R.PONDS[0],pr=R.POND_PROPS[0],bri=pr.bridge;
 assert.equal(lake.w,38);assert.equal(lake.d,60);assert(lake.d>lake.w,'lake runs north–south');
 assert(pr.falls.z>lake.z&&pr.falls.dir===-1&&pr.falls.intoPond,'south waterfall flows into lake');
 assert(R.cragBlocked(pr.crag.x,pr.crag.z)&&!R.walkable(pr.crag.x,pr.crag.z),'rock heap stays solid');
 assert(bri.x-bri.span/2<lake.x-lake.w/2&&bri.x+bri.span/2>lake.x+lake.w/2,'deck reaches both banks');
 assert(!R.walkable(lake.x,lake.z-5),'water outside deck blocks walking');
 assert(R.walkable(bri.x,bri.z),'bridge deck is walkable over water');
 assert.equal(bri.z,lake.z,'bridge crosses through the lake center');
 assert(!R.pondContains(lake,pr.falls.x,pr.falls.z),'waterfall source is on the south bank');
 for(const dx of [-3,3])assert(!R.pondContains(lake,pr.falls.x+dx,pr.falls.z-.42),'waterfall flanking rocks rest on the bank');
 assert(R.pondContains(lake,pr.falls.x,pr.falls.z-.57),'waterfall lands in the lake');

 assert(pr.blossoms.length>=25,'additional sakura surround the longer lake');
 assert(lake.x<-34&&lake.z+lake.d/2>66+46/2+10,'lake moved west and extends substantially farther south');
 assert(Math.abs(R.pondBoundary(lake,-Math.PI/2).z-41.9)<2,'northern shore remains in place while the lake grows south');
 assert(bri.arch>2.15,'bridge is taller than before');
 const westPath=pr.paths.find(p=>p.name==='west'),eastPath=pr.paths.find(p=>p.name==='east');
 assert(westPath.x1<=-70&&westPath.x2>bri.x-bri.span/2,'west path ends on land and overlaps the bridge');
 assert(eastPath.x1<bri.x+bri.span/2&&eastPath.x2>=-9,'east path joins the bridge to the main road');
 for(let x=westPath.x1;x<=eastPath.x2;x+=.5)assert(R.walkable(x,bri.z),'both approaches and the whole bridge are walkable');
 for(const path of pr.paths)for(const prop of [...pr.lanterns,...R.CHAIRS])assert(prop.x<path.x1-1||prop.x>path.x2+1||Math.abs(prop.z-path.z)>path.width/2+1,'furniture and lamps clear the paths');
 for(const t of pr.blossoms)assert(!(Math.abs(t.z-bri.z)<6&&(t.x<bri.x-bri.span/2+5||t.x>bri.x+bri.span/2-5)),'sakura do not obscure either approach');
 for(const t of pr.blossoms)assert(!(Math.abs(t.x-pr.falls.x)<11&&t.z>pr.falls.z-3),'sakura leave the waterfall visible from the southern approach');
 assert(R.GARDENS.some(g=>g.x===-23&&g.z===23)&&R.TREES.some(t=>t.x===-23&&t.z===23),'original southwest garden and tree are restored');
 assert(R.pondBoundary(lake,-Math.PI/2).z>35,'lake stays south of the original garden');
 assert(pr.blossoms.every(t=>Math.hypot(t.x+23,t.z-23)>15),'sakura clear the original tree canopy');
 assert(R.pondRadius(Math.PI/4)>1.1,'broad rounded bay, not an ellipse');
 assert(Math.abs(R.pondRadius(Math.PI/4)-R.pondRadius(5*Math.PI/4))>.05,'shore has an irregular asymmetric outline');
 for(const x of [bri.x-bri.span/2,bri.x+bri.span/2])for(const z of [bri.z-bri.width/2,bri.z,bri.z+bri.width/2])assert(!R.pondContains(lake,x,z,.5),'bridge reaches land across its width');
 for(let i=0;i<64;i++){const angle=i*Math.PI*2/64,inside=R.pondBoundary(lake,angle,-.8),outside=R.pondBoundary(lake,angle,1.3);
  assert(R.pondContains(lake,inside.x,inside.z),'inside curved shoreline is water');assert(!R.pondContains(lake,outside.x,outside.z),'outside curved shoreline is land');
  if(!R.onBridge(inside.x,inside.z))assert(!R.walkable(inside.x,inside.z),'water blocks player feet');}
 const corner={x:lake.x+lake.w*.46,z:lake.z+lake.d*.46};assert(!R.pondContains(lake,corner.x,corner.z),'rounded lake has no rectangular water corners');assert(R.pondDistance(lake,corner.x,corner.z)>2.4,'fishing distance respects curved land corners');
 for(let i=0;i<128;i++){const a=i*Math.PI*2/128,point=R.clampPond(lake,lake.x+Math.cos(a)*100,lake.z+Math.sin(a)*100,1.2);assert(R.pondContains(lake,point.x,point.z),'clamped cast stays inside curved water');}
 for(const from of [-71,-10]){const route=R.path({x:from,z:bri.z},{x:from===-71?-10:-71,z:bri.z});assert(route.length&&route.every(p=>R.walkable(p.x,p.z)),'bridge route works in both directions');assert(route.some(p=>R.onBridge(p.x,p.z)),'route crosses the deck');}
 for(const stand of pr.stands){assert(R.walkable(stand.x,stand.z));assert(R.path({x:0,z:12},stand).length,'each fishing stand reachable')}
 for(const c of R.CHAIRS){assert(R.walkable(c.x,c.z));assert(R.path({x:0,z:12},c).length,'relocated chair reachable')}
 // Preserve shore-prop and furniture clearance checks from the original pond design.
 const inLake=(x,z,m=0)=>R.pondContains(lake,x,z,-m);
 for(const rock of pr.boulders){assert(!inLake(rock.x,rock.z,rock.r),'shore boulders stay outside water');for(const c of R.CHAIRS)assert(Math.hypot(rock.x-c.x,rock.z-c.z)>=rock.r+1,'boulder clears chairs');for(const bench of R.BENCHES)assert(Math.hypot(rock.x-bench.x,rock.z-bench.z)>4,'boulder clears benches')}
 for(const [items,gap] of [[pr.lanterns,1.2],[pr.blossoms,1.6]])for(const prop of items){assert(!inLake(prop.x,prop.z,.5),'shore prop stands outside lake');for(const chair of R.CHAIRS)assert(Math.hypot(prop.x-chair.x,prop.z-chair.z)>=gap,'shore prop clears chairs')}
 for(const chair of R.CHAIRS)assert(Math.abs(chair.x-bri.x)>bri.span/2||Math.abs(chair.z-bri.z)>bri.width/2+1,'bridge clears chairs');
 for(const wall of R.SANCTUARY_BARRIERS)assert(!R.walkable(wall.x,wall.z),'shared gym walls, kiosk and fences are solid');
 for(const wall of R.SANCTUARY_GYM_WALLS){const x=(wall.x1+wall.x2)/2,z=(wall.z1+wall.z2)/2;assert(!R.walkable(x,z),'angled gym segments use shared collision')}
 assert(R.SANCTUARY_GYM_WALLS[0].z1>R.SANCTUARY_GYM_WALLS[0].z2&&R.SANCTUARY_GYM_WALLS[2].z1<R.SANCTUARY_GYM_WALLS[2].z2,'two walls angle into the middle');
 for(const tree of R.SANCTUARY_TREES)assert(!R.walkable(tree.x,tree.z),'native outer Sanctuary trees are solid');
 for(const f of R.SANCTUARY_FENCES){const x=(f.x1+f.x2)/2,z=(f.z1+f.z2)/2;assert(R.fenceBlocked(x,z)&&!R.walkable(x,z),'shared straight and diagonal rails block movement')}
 assert(R.SANCTUARY[0].z-R.SANCTUARY[0].d/2>=10,'gym begins beside the south-east garden, south of the original avenue');
 assert(R.walkable(100,100)&&!R.walkable(R.MAX_X+1,100)&&!R.walkable(R.MIN_X-1,100),'asymmetric eastern expansion respects world bounds');
 for(const x of [46,92])assert(R.walkable(x,29)&&R.path({x,z:31},{x,z:27}).length,'the gym wing doorways remain reachable');
 for(const x of [43,95]){assert(!R.walkable(x,24),'wing side perimeter is solid');assert(R.walkable(x===43?44:94,34),'open court beside shorter wings remains clear')}
 assert(R.walkable(69,39)&&R.path({x:69,z:44},{x:69,z:28}).length,'the central gym courtyard entrance stays open');
 for(const f of R.SANCTUARY_GYM_FENCES){const x=(f.x1+f.x2)/2,z=(f.z1+f.z2)/2;assert(R.fenceBlocked(x,z)&&!R.walkable(x,z),'the front fence has shared collision')}
 assert(R.walkable(69,38.5),'centre gap is not blocked by the gym fence');
 for(const b of R.SANCTUARY_BARRIERS.filter(b=>b.kind.startsWith('stand')))assert(!R.walkable(b.x,b.z),'solid spectator structure matches navigation');
 for(let row=0;row<3;row++){const x=81.7+row*1.05,z=113.25+row*1.05;for(const [px,pz] of [[x+.5,100],[70,z+1.5],[x-.3,z+.7]])assert(!R.walkable(px,pz),'each bleacher tier and its corner are enclosed by collision')}
 assert(R.walkable(79,113)&&R.path({x:68,z:104},{x:79,z:113}).length,'the aisle between the ring and stands remains usable');
 assert(R.path({x:35,z:90},{x:68,z:104}).length,'the ring remains reachable after the bleacher rebuild');
 for(const [start,end] of [[{x:35,z:42},{x:69,z:25}],[{x:66,z:43},{x:66,z:50}],[{x:35,z:60},{x:50,z:60}],[{x:68,z:84},{x:68,z:77}],[{x:35,z:90},{x:68,z:104}]]){
  const route=R.path(start,end);assert(route.length&&route.every(p=>R.walkable(p.x,p.z)),'world gym and field gates remain reachable');
 }
 for(const g of R.GARDENS)assert(Math.abs(lake.x-g.x)>g.w/2+lake.w/2||Math.abs(lake.z-g.z)>g.d/2+lake.d/2,'lake clears gardens');
 for(const building of R.BUILDINGS)assert(Math.abs(lake.x-building.x)>building.w/2+lake.w/2||Math.abs(lake.z-building.z)>building.d/2+lake.d/2,'lake clears buildings');
 // v319: the field HUD badge needs plaza population for players who are NOT in a plaza.
 {
  const popRoom=new SocialRoom({now:()=>now});
  const popJoin=(id,friends=[])=>{const ev=[];const c=popRoom.connect({id,username:'Pop'+id,friends},s=>ev.push(JSON.parse(s)),()=>{});c.events=ev;return c};
  const fieldFriend=popJoin(901,[902]),fieldStranger=popJoin(903),plazaGuest=popJoin(902);
  const lastRooms=c=>c.events.filter(e=>e.type==='rooms').at(-1);
  assert.equal(lastRooms(fieldFriend).plaza.total,0,'a field client learns the (empty) plaza population on connect');
  popRoom.receive(plazaGuest,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));
  assert.equal(plazaGuest.room,1);
  assert.equal(lastRooms(fieldFriend).plaza.total,1,'a join updates field clients who never entered a plaza');
  assert.equal(lastRooms(fieldFriend).plaza.friends,1,'the friend count is personal: the friend sees 1');
  assert.equal(lastRooms(fieldStranger).plaza.friends,0,'and a stranger sees 0');
  assert.deepEqual(lastRooms(fieldFriend).rooms,[{id:1,count:1},{id:2,count:0}],'room counts ride along for the tooltip breakdown (plus the next open plaza)');
  popRoom.receive(plazaGuest,JSON.stringify({type:'leave'}));
  assert.equal(lastRooms(fieldFriend).plaza.total,0,'a leave updates the field badge again');
  assert.equal(lastRooms(fieldFriend).plaza.friends,0);
 }
 console.log('PASS social room: channel privacy, 20-player overflow, native emotion events, collision, movement/sit, rate limit, sliding idle window with a 30-minute re-authentication, per-character walk speed and tab replacement; single west lake with south falls, accessible fishing and a crossable bridge; v319 plaza population broadcast to field clients with a personalised friend count');
})().catch(e=>{console.error(e);process.exitCode=1});
