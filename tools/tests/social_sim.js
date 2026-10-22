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
 now+=3000;send(a,{type:'emotion',emotion:'heart'});assert(b.events.some(e=>e.emotion==='heart'));assert(!outsider.events.some(e=>e.emotion==='heart'));
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
 for(const seat of R.SEATS){assert(R.walkable(seat.x,seat.z));assert(R.path(a,seat).length>0)}
 now+=200;send(a,{type:'seat',id:0});assert.equal(a.seat,0);assert(a.path.length>0);assert(!a.sit);
 send(b,{type:'seat',id:0});assert.equal(b.seat,null);assert(b.events.some(e=>e.message==='That bench is occupied.'));
 send(outsider,{type:'seat',id:0});assert.equal(outsider.seat,0,'seats belong to each plaza');
 now+=30000;const arrived=room.snapshot(a);assert(arrived.sit);assert.equal(arrived.path.length,0);assert.equal(arrived.z,R.SEATS[0].z);assert.equal(arrived.dir,R.SEATS[0].dir);
 now+=200;send(a,{type:'look',look:{cls:'Novice',appearance:{version:1,sex:'m'},title:'Poring Hunter',refine:10}});assert.equal(a.look.title,'Poring Hunter');assert.equal(a.look.refine,10);assert.equal(a.seat,0);assert.equal(a.z,R.SEATS[0].z);assert(b.events.some(e=>e.player?.look?.title==='Poring Hunter'));
 now+=200;send(a,{type:'sit'});assert(!a.sit);assert.equal(a.seat,null);
 now+=200;send(b,{type:'seat',id:0});assert.equal(b.seat,0);now+=200;send(b,{type:'move',x:10,z:12});assert.equal(b.seat,null);assert(!b.sit);
 now+=200;send(a,{type:'seat',id:1});const seat=a.seat;now+=200;send(a,{type:'seat',id:'invalid'});assert.equal(a.seat,seat,'invalid seats cannot change state');
 for(const emotion of R.EMOTIONS){now+=R.CHAT_DELAY;send(a,{type:'emotion',emotion});assert(b.events.some(e=>e.emotion===emotion));assert(!outsider.events.some(e=>e.emotion===emotion));}
 send(a,{type:'leave'});const prior=b.events.length;send(a,{type:'chat',channel:'local',body:'must reject'});assert.equal(b.events.length,prior);
 for(let i=0;i<20;i++)send(a,{type:'chat',channel:'world',body:'flood'});assert(a.events.some(e=>e.type==='error'&&e.message.includes('wait')));
 room.disconnect(b);assert(!room.clients.has(b.id));assert(clients[2].events.some(e=>e.type==='left'&&e.id===b.id));
 let closed=false;const old=room.connect({id:100,username:'Replacement'},()=>{},()=>closed=true);room.connect({id:100,username:'Replacement'},()=>{},()=>{});assert(closed);room.disconnect(old);assert(room.clients.has(100));
 now+=301000;room.sweep();assert.equal(room.clients.size,0);
 console.log('PASS social room: channel privacy, 20-player overflow, native emotion events, collision, movement/sit, rate limit, session expiry and tab replacement');
})().catch(e=>{console.error(e);process.exitCode=1});
