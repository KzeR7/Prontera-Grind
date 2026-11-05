// Reservation lifecycle is authoritative presentation only: no saved stats or rewards.
const assert=require('node:assert/strict');
(async()=>{
 const {SocialRoom}=await import('../../workers/social/room.mjs'),R=globalThis.PGSocialRules;let now=1000;const room=new SocialRoom({now:()=>now});
 const send=(c,m)=>room.receive(c,JSON.stringify(m));
 const join=id=>{const events=[];const c=room.connect({id,username:'Gym'+id},s=>events.push(JSON.parse(s)),()=>{});c.events=events;send(c,{type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}});return c};
 const [a,b,c,d]=[1,2,3,4].map(join);const near=p=>Object.assign(p,{x:56,z:30,path:[],sit:false,at:now});[a,b,c,d].forEach(near);
 send(a,{type:'gym_start',stat:'__proto__',species:'agumon'});assert(a.events.some(e=>e.type==='gym_error'));assert(!a.gym);
 send(a,{type:'gym_start',stat:'power',species:'../bad'});assert(!a.gym);
 for(const [i,p] of [a,b,c].entries())send(p,{type:'gym_start',stat:'power',species:'agumon',request:i+1});
 assert.equal(a.events.find(e=>e.type==='gym_started').request,1,'ack echoes the request ID');
 assert.deepEqual([a.gym.slot,b.gym.slot,c.gym.slot],[0,1,2]);assert.equal(room.gymSnapshot(1).length,3);const observer=join(7);assert(observer.events.some(e=>e.type==='gym'&&e.entries.length===3),'late arrivals get the reservation snapshot');assert(b.events.some(e=>e.type==='gym'&&e.entries.some(v=>v.owner===a.id)));
 send(a,{type:'gym_start',stat:'focus',species:'agumon'});assert.equal(a.gym.stat,'power','one gym activity per owner');
 send(d,{type:'gym_start',stat:'power',species:'patamon'});assert(!d.gym);assert(d.events.some(e=>/equipment is in use/.test(e.message||'')));
 send(a,{type:'leave'});assert.equal(a.room,0);assert.equal(a.gym.room,1,'leaving plaza for the field does not release online training');assert.equal(room.gymSnapshot(1).length,3);
 room.disconnect(a);assert.equal(room.gymSnapshot(1).length,2,'logout/disconnect releases the equipment');assert(b.events.at(-1).entries.every(e=>e.owner!==a.id));
 send(d,{type:'gym_start',stat:'power',species:'patamon'});assert.equal(d.gym.slot,0,'freed equipment is reused');send(d,{type:'gym_stop'});assert(!d.gym);
 const far=join(5);send(far,{type:'gym_start',stat:'guard',species:'agumon'});assert(!far.gym,'remote client cannot reserve equipment without visiting gym');
 const other=join(6);send(other,{type:'switch_room',room:2});Object.assign(other,{x:56,z:30,path:[],sit:false,at:now});send(other,{type:'gym_start',stat:'power',species:'palmon'});assert.equal(other.gym.slot,0,'plazas reserve equipment independently');assert(!b.events.some(e=>e.type==='gym'&&e.room===2));
 now+=200;send(other,{type:'switch_room',room:1});assert.equal(other.gym,null,'switching plazas releases old equipment');
 console.log('PASS gym reservations: per-room capacity, privacy, validation, field leave, disconnect and release');
})().catch(e=>{console.error(e);process.exitCode=1});
