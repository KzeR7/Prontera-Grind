// Room authority and lifecycle coverage for the live Sanctuary field and ring.
const assert=require('node:assert/strict');
(async()=>{
 const {SocialRoom}=await import('../../workers/social/room.mjs');let now=1000;const room=new SocialRoom({now:()=>now,random:()=>.5});
 const join=(id,x,z,form='agumon')=>{const events=[];const c=room.connect({id,username:'Battle'+id},s=>events.push(JSON.parse(s)),()=>{});c.events=events;room.receive(c,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'},digimon:form}}));Object.assign(c,{x,z,at:now,path:[],sit:false});return c};
 const send=(c,m)=>room.receive(c,JSON.stringify(m));
 const profile=(line='agumon',form=line,power=12)=>({lineId:line,form,level:5,stats:{power,guard:12,agility:0,focus:0},fullness:70,fatigue:0});
 const a=join(1,70,64),b=join(2,74,118,'palmon'),c=join(3,62,118,'agumon');
 send(a,{type:'pve_start',request:7,profile:{...profile(),slot:1}});assert(a.events.some(e=>e.type==='pve_started'&&e.request===7));assert.equal(room.pveRuns.size,1);assert(b.events.some(e=>e.type==='battle'&&e.pve.length===1),'room observers receive the field snapshot');
 const run=a.pve;for(now=1500;now<16000&&run.wave<2;now+=500)room.tickBattles(now);assert(run.wave>=2,'room timer regenerates a group');const rewards=a.events.filter(e=>e.type==='battle_reward');assert(rewards.length>=1);assert(rewards.every(e=>e.slot===1),'settlement returns the originating partner slot for duplicate-species collections');const rewardCount=rewards.length;room.tickBattles(now);assert.equal(a.events.filter(e=>e.type==='battle_reward').length,rewardCount,'same-tick replay cannot duplicate a wave reward');
 send(a,{type:'battle_result',battleId:'forged',outcome:'win',reward:{coins:999999}});assert(!a.events.some(e=>e.type==='battle_result'&&e.battleId==='forged'),'client cannot inject a settlement event');
 send(a,{type:'pve_stop'});assert.equal(room.pveRuns.size,0);assert(a.events.some(e=>e.type==='pve_end'));
 // Same-side players wait; opposite-side players receive offers, never an immediate fight.
 send(b,{type:'pvp_enter',profile:{...profile('palmon','palmon',0),slot:1}});send(c,{type:'pvp_enter',profile:profile('agumon','agumon',0)});assert.equal(room.pvpMatches.size,1);assert(b.events.some(e=>e.type==='pvp_offer')&&c.events.some(e=>e.type==='pvp_offer'));
 const match=[...room.pvpMatches.values()][0];send(b,{type:'pvp_accept'});assert.equal(match.phase,'offer');send(c,{type:'pvp_accept'});assert.equal(match.phase,'countdown');assert.equal(match.countdownUntil-now,3000);
 room.tickBattles(now+1000);assert.equal(match.phase,'countdown');now+=3000;room.tickBattles(now);assert.equal(match.phase,'fighting');
 for(let i=0;i<140&&match.phase!=='result';i++){now+=500;room.tickBattles(now)}assert.equal(match.phase,'result');const settled=[...b.events,...c.events].filter(e=>e.type==='battle_result'&&e.battleId===match.id);assert.equal(settled.length,2,'each participant receives one authoritative result');assert(settled.every(e=>e.reward&&Number.isInteger(e.reward.coins)));assert.equal(b.events.find(e=>e.type==='battle_result'&&e.battleId===match.id).slot,1,'PvP settlement preserves the originating slot');const resultCount=settled.length;room.tickBattles(now);assert.equal([...b.events,...c.events].filter(e=>e.type==='battle_result'&&e.battleId===match.id).length,resultCount);
 // A declined offer is removed from the public snapshot and does not leave a stuck participant.
 now+=10000;room.tickBattles(now);assert.equal(room.pvpMatches.size,0);send(b,{type:'pvp_enter',profile:profile('palmon','palmon',0)});send(c,{type:'pvp_enter',profile:profile('agumon','agumon',0)});const second=[...room.pvpMatches.values()][0];send(b,{type:'pvp_decline'});assert(!room.pvpMatches.has(second.id));assert(!c.pvp);assert(c.events.at(-1).type==='battle'||c.events.some(e=>e.type==='pvp_cancelled'));
 // A disconnected grinder releases its field run and cannot leave a ghost resident behind.
 send(a,{type:'pve_start',profile:profile()});assert(a.pve);room.disconnect(a);assert.equal(room.pveRuns.size,0);
 console.log('PASS Sanctuary room: authoritative wave/reward events, forged-result rejection, opposite-side mutual PvP, countdown, settlement, cancellation and disconnect cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
