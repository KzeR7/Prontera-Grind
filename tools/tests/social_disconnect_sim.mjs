// Regression: closed plaza sockets must not re-enter disconnect through broadcasts.
import assert from 'node:assert/strict';
import {SocialRoom} from '../../workers/social/room.mjs';

let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name)}
function harness(){
 const saved=new Map(),room=new SocialRoom({now:()=>1000000,autoTimers:false,onResume:(id,r)=>r?saved.set(id,r):saved.delete(id)});
 function join(id){
  const events=[];let dead=false,failedWrites=0;
  const c=room.connect({id,username:'Connection'+id},raw=>{
   if(dead){failedWrites++;throw new Error("Can't call WebSocket send() after close()");}
   events.push(JSON.parse(raw));
  },()=>{dead=true});
  room.receive(c,JSON.stringify({type:'join',look:{cls:'Rune Knight',appearance:{version:1,sex:'m'},digimon:'agumon',lv:150}}));
  return {c,events,die:()=>{dead=true},writes:()=>failedWrites};
 }
 return {room,saved,join};
}
check('a closed plaza transport is removed before cleanup broadcasts',()=>{
 const {room,saved,join}=harness(),a=join(1),b=join(2),spot={x:a.c.x,z:a.c.z};
 a.die();assert.doesNotThrow(()=>room.disconnect(a.c));
 assert.equal(a.writes(),0,'cleanup never writes to the closed socket');
 assert(!room.clients.has(1));assert(saved.has(1));
 assert(b.events.some(e=>e.type==='left'&&e.id===1));
 const fresh=join(1);assert.equal(fresh.c.room,1);assert.equal(fresh.c.x,spot.x);assert.equal(fresh.c.z,spot.z);
 room.disconnect(a.c);assert.equal(room.clients.get(1),fresh.c,'late close cannot delete the replacement');
});
check('a failed broadcast disconnects once and leaves healthy peers usable',()=>{
 const {room,join}=harness(),a=join(1),b=join(2);a.die();
 assert.doesNotThrow(()=>room.broadcast({type:'test'}));
 assert.equal(a.writes(),1,'only the original send fails, not recursive cleanup');
 assert(!room.clients.has(1));assert(b.events.some(e=>e.type==='test'));
 room.receive(b.c,JSON.stringify({type:'ping'}));assert.equal(b.events.at(-1).type,'pong');
});
check('cleanup releases gym equipment even when its transport is closed',()=>{
 const {room,join}=harness(),a=join(1),b=join(2);
 Object.assign(a.c,{x:56,z:30,path:[],sit:false});
 room.receive(a.c,JSON.stringify({type:'gym_start',stat:'power',species:'agumon'}));assert(a.c.gym);
 a.die();room.disconnect(a.c);assert.equal(a.c.gym,null);assert.equal(room.gymSnapshot(1).length,0);
 assert(b.events.some(e=>e.type==='gym'&&e.entries.length===0));assert.equal(a.writes(),0);
});
check('cleanup stops a disconnected field run without sending to its owner',()=>{
 const {room,join}=harness(),a=join(1);Object.assign(a.c,{x:70,z:64,path:[],sit:false});
 room.receive(a.c,JSON.stringify({type:'pve_start',profile:{lineId:'agumon',form:'agumon',level:5,stats:{power:12,guard:12,agility:0,focus:0}}}));
 assert(a.c.pve);a.die();room.disconnect(a.c);assert.equal(room.pveRuns.size,0);assert.equal(a.writes(),0);
});
check('an unwritable resumed greeting does not leave a ghost or lose its spot',()=>{
 const {room,saved,join}=harness(),a=join(1);room.disconnect(a.c);
 let writes=0;const rejected=room.connect({id:1,username:'Connection1'},()=>{writes++;throw Error('closed greeting')},()=>{});
 assert.equal(rejected,null);assert.equal(writes,1);assert(!room.clients.has(1));assert(saved.has(1));
 const fresh=join(1);assert.equal(fresh.c.room,1);
});
check('disconnect cancels a ring offer and frees both participants',()=>{
 const {room,join}=harness(),a=join(1),b=join(2);
 Object.assign(a.c,{x:62,z:118,path:[],sit:false});Object.assign(b.c,{x:74,z:118,path:[],sit:false});
 const packet=JSON.stringify({type:'pvp_enter',profile:{lineId:'agumon',form:'agumon',level:5,stats:{power:0,guard:12,agility:0,focus:0}}});
 room.receive(a.c,packet);room.receive(b.c,packet);assert.equal(room.pvpMatches.size,1);
 a.die();room.disconnect(a.c);assert.equal(room.pvpMatches.size,0);assert.equal(b.c.pvp,null);assert.equal(a.writes(),0);
 assert(b.events.some(e=>e.type==='pvp_cancelled'&&e.reason==='disconnect'));
});
check('a dead party member leaves once without disrupting the remaining party',()=>{
 const {room,join}=harness(),a=join(1),b=join(2);
 room.receive(a.c,JSON.stringify({type:'party_invite',targetId:2}));room.receive(b.c,JSON.stringify({type:'party_accept'}));
 assert.equal(room.partyOf(a.c).members.length,2);
 a.die();room.disconnect(a.c);assert.equal(room.partyOf(b.c).leader,2);assert.equal(room.partyOf(b.c).members.length,1);assert.equal(a.writes(),0);
});
check('multiple dead peers can be cleaned without poisoning the room',()=>{
 const {room,join}=harness(),a=join(1),b=join(2),c=join(3);a.die();b.die();
 room.broadcast({type:'test'});assert.equal(room.clients.size,1);assert.equal(room.clients.get(3),c.c);
 assert.equal(a.writes(),1);assert.equal(b.writes(),1);
 assert(c.events.some(e=>e.type==='test'));
});
check('a message flood is dropped and then the socket is closed',()=>{
 const {room,join}=harness(),a=join(1);
 const before=a.events.length;
 for(let i=0;i<20;i++)room.receive(a.c,JSON.stringify({type:'ping'}));
 assert(a.events.slice(before).filter(e=>e.type==='pong').length>=1,'ordinary pings still answer');
 const mid=a.events.length;
 for(let i=0;i<25;i++)room.receive(a.c,JSON.stringify({type:'ping'}));
 assert.equal(a.events.length,mid,'overflow frames are ignored');
 assert(!room.clients.has(1),'the flood closes the socket');
});
console.log(passed+' disconnect regression cases passed');
