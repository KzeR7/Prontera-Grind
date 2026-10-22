/* Real room core: privacy, capacity, collision, reconnect and bounded traffic. */
const assert=require('node:assert/strict');
(async()=>{
 const {SocialRoom}=await import('../../workers/social/room.mjs');const R=globalThis.PGSocialRules;let now=1000;const room=new SocialRoom({now:()=>now});
 const join=id=>{const events=[];const c=room.connect({id,username:'Player'+id},s=>events.push(JSON.parse(s)),()=>{});c.events=events;room.receive(c,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));return c};
 const clients=Array.from({length:21},(_,i)=>join(i+1));assert.equal(clients[19].room,1);assert.equal(clients[20].room,2);assert.equal(clients[0].events.find(x=>x.type==='room').players.length,1);
 const a=clients[0],b=clients[1],outsider=clients[20],send=(c,m)=>room.receive(c,JSON.stringify(m));
 send(a,{type:'chat',channel:'local',body:'Only plaza one'});assert(b.events.some(e=>e.body==='Only plaza one'));assert(!outsider.events.some(e=>e.body==='Only plaza one'));
 send(a,{type:'chat',channel:'whisper',to:b.name,body:'Private'});assert(b.events.some(e=>e.body==='Private'));assert(!clients[2].events.some(e=>e.body==='Private'));
 send(a,{type:'chat',channel:'world',body:'Everyone'});assert(outsider.events.some(e=>e.body==='Everyone'));
 send(a,{type:'emotion',emotion:'heart'});assert(b.events.some(e=>e.emotion==='heart'));assert(!outsider.events.some(e=>e.emotion==='heart'));
 send(a,{type:'move',x:0,z:0});assert.equal(a.path.length,0);send(a,{type:'move',x:0,z:-12});now+=101;send(a,{type:'move',x:0,z:-12});assert(a.path.length>0);assert(a.path.every(p=>R.walkable(p.x,p.z)));for(let t=0;t<300;t++){now+=50;R.advance(a,now);assert(R.walkable(a.x,a.z))}assert.equal(a.z,-12);
 send(a,{type:'sit'});assert(a.sit);assert.equal(a.path.length,0);now+=200;send(a,{type:'move',x:10,z:-12});assert(!a.sit);
 send(a,{type:'leave'});const prior=b.events.length;send(a,{type:'chat',channel:'local',body:'must reject'});assert.equal(b.events.length,prior);
 for(let i=0;i<20;i++)send(a,{type:'chat',channel:'world',body:'flood'});assert(a.events.some(e=>e.type==='error'&&e.message.includes('wait')));
 room.disconnect(b);assert(!room.clients.has(b.id));assert(clients[2].events.some(e=>e.type==='left'&&e.id===b.id));
 let closed=false;const old=room.connect({id:100,username:'Replacement'},()=>{},()=>closed=true);room.connect({id:100,username:'Replacement'},()=>{},()=>{});assert(closed);room.disconnect(old);assert(room.clients.has(100));
 now+=301000;room.sweep();assert.equal(room.clients.size,0);
 console.log('PASS social room: channel privacy, 20-player overflow, native emotion events, collision, movement/sit, rate limit, session expiry and tab replacement');
})().catch(e=>{console.error(e);process.exitCode=1});
