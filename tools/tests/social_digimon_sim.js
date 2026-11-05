// Sanctuary foundation: real shared navigation, room look relay and follower animation math.
const assert=require('node:assert/strict'),fs=require('node:fs');
const D=require('../../assets/social-digimon.js'),R=require('../../assets/social-rules.js');
(async()=>{
 const catalog=JSON.parse(fs.readFileSync('assets/digimon/v2/catalog.json'));
 assert.deepEqual(Object.keys(catalog.species),D.names);
 for(const id of D.names){const a=catalog.species[id];assert(a.figureHeight>0);const png=fs.readFileSync('assets/digimon/v2/'+a.image),w=png.readUInt32BE(16),h=png.readUInt32BE(20);assert(png.length>0);assert.equal(R.cleanDigimon(id),id);for(const type of ['idle','walking','attack','faint']){assert(a.actions[type].length>1);for(const f of a.actions[type]){assert.equal(f.rect.length,4);assert.equal(f.offset.length,2);assert(f.rect[0]+f.rect[2]<=w&&f.rect[1]+f.rect[3]<=h,'packed frame must not be clipped by atlas');assert.match(f.sha256,/^[a-f0-9]{64}$/)}}}
 assert.equal(D.clean('../oops'),null);assert.equal(R.cleanDigimon('Agumon'),null);assert.equal(R.cleanDigimon('agumon'),'agumon');
 assert.equal(D.delay('idle',5),50);assert.equal(D.delay('walking',5),50);assert.equal(D.delay('walking',10),25);assert.equal(D.delay('walking',2.5),100);assert.equal(D.delay('walking',13),250/13);assert.equal(D.frameIndex(8,-1,'idle',5),0);
 // Equal distance at different speeds produces the same walk phase.
 assert.equal(D.frameIndex(16,500,'walking',5),D.frameIndex(16,250,'walking',10));
 const ops=[],ctx={clearRect(...x){ops.push(['clear',...x])},save(){ops.push(['save'])},translate(...x){ops.push(['translate',...x])},scale(...x){ops.push(['scale',...x])},drawImage(...x){ops.push(['draw',...x])},restore(){ops.push(['restore'])}};
 const record=catalog.species.patamon,asset={record,image:{}};const frame=D.draw(ctx,asset,'walking',0,5,true);assert.deepEqual(ops.find(x=>x[0]==='scale'),['scale',-1,1]);assert.deepEqual(ops.find(x=>x[0]==='draw').slice(2,6),frame.rect);
 // Independent follower trails the actual route, moves on its own clock, and waits behind.
 const lead={x:0,z:12};let follow=D.createFollower(lead,6,R.walkable);const start={x:follow.x,z:follow.z};
 lead.x+=.25;D.stepFollower(follow,lead,.05,5,R.walkable,R.path);assert.equal(follow.x,start.x,'companion does not move rigidly with owner');
 for(let i=0;i<30;i++){lead.x+=.25;D.stepFollower(follow,lead,.05,5,R.walkable,R.path);assert(R.walkable(follow.x,follow.z))}
 assert(follow.x<lead.x-2.4);assert(follow.x>start.x,'companion walks after owner');
 // A delayed follower keeps walking after the player stops, then rests behind rather than overlapping.
 lead.x+=1;D.stepFollower(follow,lead,.05,5,R.walkable,R.path);const before=follow.x;
 for(let i=0;i<10;i++)D.stepFollower(follow,lead,.05,5,R.walkable,R.path);
 assert(follow.x>before);assert(!follow.walking);assert(Math.hypot(follow.x-lead.x,follow.z-lead.z)>2.4);
 // Follow a turn and the real obstacle-aware path around the pond.
 const origin={x:11,z:32},destination={x:35,z:52},route=R.path(origin,destination);assert(route.length);
 follow=D.createFollower(origin,6,R.walkable);let prev={...origin};
 for(const next of route){const dx=next.x-prev.x,dz=next.z-prev.z;for(let k=1;k<=10;k++){const point={x:prev.x+dx*k/10,z:prev.z+dz*k/10};D.stepFollower(follow,point,.03,5,R.walkable,R.path);assert(R.walkable(follow.x,follow.z),'follower avoids pond and buildings')}prev=next}
 for(let i=0;i<40;i++){D.stepFollower(follow,destination,.05,5,R.walkable,R.path);assert(R.walkable(follow.x,follow.z))}
 assert(Math.hypot(follow.x-destination.x,follow.z-destination.z)<4,'follower catches up after the route');
 // The follower takes the shared bridge route instead of cutting through the lake.
 for(const [a,b] of [[-71,-10],[-10,-71]]){
  const start={x:a,z:R.POND_PROPS[0].bridge.z},end={x:b,z:R.POND_PROPS[0].bridge.z},bridgeRoute=R.path(start,end);let previous=start;assert(bridgeRoute.some(p=>R.onBridge(p.x,p.z)),'follower route crosses the deck');
  let companion=D.createFollower(start,a<b?6:2,R.walkable);
  for(const next of bridgeRoute){for(let k=1;k<=10;k++){const point={x:previous.x+(next.x-previous.x)*k/10,z:previous.z+(next.z-previous.z)*k/10};D.stepFollower(companion,point,.03,5,R.walkable,R.path);assert(R.walkable(companion.x,companion.z),'follower remains on bridge or bank')}previous=next}
 }
 const correction={x:-64,z:R.POND_PROPS[0].bridge.z};D.stepFollower(follow,correction,.05,5,R.walkable,R.path);assert(R.walkable(follow.x,follow.z));assert(Math.hypot(follow.x-correction.x,follow.z-correction.z)<3,'large correction resets safely');
 for(const pad of R.SANCTUARY){assert(R.walkable(pad.x,pad.z));const path=R.path({x:0,z:12},pad);assert(path.length&&path.every(p=>R.walkable(p.x,p.z)))}
 assert.deepEqual(R.PONDS[0],{x:-38,z:73,w:38,d:60});assert.equal(R.PONDS.length,1);for(const chair of R.CHAIRS)assert(R.walkable(chair.x,chair.z));
 assert(!R.BUILDINGS.some(b=>b.name==='house'&&b.x===46&&b.z===56));assert(!R.BUILDINGS.some(b=>b.name==='house'&&b.x===27&&b.z===65));
 const {SocialRoom}=await import('../../workers/social/room.mjs');let now=1000;const room=new SocialRoom({now:()=>now});const events=[];
 const a=room.connect({id:1,username:'One'},()=>{},()=>{}),b=room.connect({id:2,username:'Two'},s=>events.push(JSON.parse(s)),()=>{});
 const send=(c,m)=>room.receive(c,JSON.stringify(m)),look={cls:'Novice',appearance:{version:1,sex:'m'}};
 send(a,{type:'join',look:{...look,digimon:'patamon'}});send(b,{type:'join',look});assert.equal(events.find(e=>e.type==='room').players.find(p=>p.id===1).look.digimon,'patamon');
 now+=200;send(a,{type:'look',look:{...look,digimon:'gabumon'}});assert(events.some(e=>e.type==='player'&&e.player.id===1&&e.player.look.digimon==='gabumon'));
 now+=200;send(a,{type:'look',look:{...look,digimon:'greymon'}});assert(events.some(e=>e.type==='player'&&e.player.id===1&&e.player.look.digimon==='greymon'),'evolved forms relay as a cosmetic look');
 now+=200;send(a,{type:'look',look:{...look,digimon:'../etc/passwd'}});assert.equal(a.look.digimon,undefined);assert.equal(room.cleanLook(look).digimon,undefined);
 console.log('PASS Digimon foundation: exact catalog records, mirrored drawing, speed-linked walk, shared paths, crossable lake and validated room relay');
})().catch(e=>{console.error(e);process.exitCode=1});
