// Room authority and lifecycle coverage for the live Sanctuary field and ring.
const assert=require('node:assert/strict');
(async()=>{
 const {SocialRoom}=await import('../../workers/social/room.mjs');let now=1000;const room=new SocialRoom({now:()=>now,random:()=>.5});
 const join=(id,x,z,form='agumon')=>{const events=[];const c=room.connect({id,username:'Battle'+id},s=>events.push(JSON.parse(s)),()=>{});c.events=events;room.receive(c,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'},digimon:form}}));Object.assign(c,{x,z,at:now,path:[],sit:false});return c};
 const send=(c,m)=>room.receive(c,JSON.stringify(m));
 const profile=(line='agumon',form=line,power=12)=>({lineId:line,form,level:5,stats:{power,guard:12,agility:0,focus:0},energy:70});
 const a=join(1,70,64),b=join(2,74,118,'palmon'),c=join(3,62,118,'agumon');
 // v349: an exhausted partner cannot start grinding, but the ring never charges energy.
 send(a,{type:'pve_start',request:6,profile:{...profile(),energy:5}});assert(a.events.some(e=>e.type==='battle_error'&&e.request===6&&/out of energy/.test(e.message)),'an empty energy bar is rejected with an explicit reason');
 send(a,{type:'pve_start',request:7,profile:{...profile(),slot:1}});assert(a.events.some(e=>e.type==='pve_started'&&e.request===7));assert.equal(room.pveRuns.size,1);assert(b.events.some(e=>e.type==='battle'&&e.pve.length===1),'room observers receive the field snapshot');
 const run=a.pve;for(now=1500;now<16000&&run.wave<2;now+=500)room.tickBattles(now);assert(run.wave>=2,'room timer regenerates a group');const rewards=a.events.filter(e=>e.type==='battle_reward');assert(rewards.length>=1);assert(rewards.every(e=>e.slot===1),'settlement returns the originating partner slot for duplicate-species collections');assert(rewards.every(e=>Number.isInteger(e.reward.eggs)&&e.reward.eggs>=0&&e.reward.eggs<=3&&Number.isInteger(e.reward.dropCoins)),'worker wave messages carry bounded server-rolled egg and bonus-petgold fields');const rewardCount=rewards.length;room.tickBattles(now);assert.equal(a.events.filter(e=>e.type==='battle_reward').length,rewardCount,'same-tick replay cannot duplicate a wave reward');
 send(a,{type:'battle_result',battleId:'forged',outcome:'win',reward:{coins:999999}});assert(!a.events.some(e=>e.type==='battle_result'&&e.battleId==='forged'),'client cannot inject a settlement event');
 send(a,{type:'pve_stop'});assert.equal(room.pveRuns.size,0);assert(a.events.some(e=>e.type==='pve_end'));
 // v350: driving the same strong partner through its first stage reaches the fifth-wave boss.
 send(a,{type:'pve_start',request:8,profile:profile()});assert(a.events.some(e=>e.type==='pve_started'&&e.request===8));
 const stageRun=a.pve,stageStart=now;let bossMessage=null,bossReward=null,bossStage='';
 for(now+=500;now<stageStart+120000&&!(bossMessage&&bossReward);now+=500){
  room.tickBattles(now);
  if(!bossMessage&&stageRun.wave===5&&stageRun.enemies.length===1&&stageRun.enemies[0].boss){bossStage=stageRun.enemies[0].stage;bossMessage=a.events.filter(e=>e.type==='battle'&&e.pve?.some(r=>r.wave===5&&r.enemies?.length===1&&r.enemies[0].boss)).pop()||null}
  if(!bossReward)bossReward=a.events.find(e=>e.type==='battle_reward'&&e.wave===5&&e.reward.wins===2)||null;
 }
 assert(bossMessage,'the fifth-wave boss reaches room observers with its boss flag');
 assert.equal(bossStage,'Champion','the boss is one named stage above the Rookie partner');
 assert(bossReward&&bossReward.reward.coins>=30+2*8,'the boss settles richer than any normal wave');
 send(a,{type:'pve_stop'});assert.equal(room.pveRuns.size,0);
 // Same-side players wait; opposite-side players receive offers, never an immediate fight.
 send(b,{type:'pvp_enter',profile:{...profile('palmon','palmon',0),slot:1}});send(c,{type:'pvp_enter',profile:profile('agumon','agumon',0)});assert.equal(room.pvpMatches.size,1);assert(b.events.some(e=>e.type==='pvp_offer')&&c.events.some(e=>e.type==='pvp_offer'));
 const match=[...room.pvpMatches.values()][0];send(b,{type:'pvp_accept'});assert.equal(match.phase,'offer');send(c,{type:'pvp_accept'});assert.equal(match.phase,'countdown');assert.equal(match.countdownUntil-now,3000);
 room.tickBattles(now+1000);assert.equal(match.phase,'countdown');now+=3000;room.tickBattles(now);assert.equal(match.phase,'fighting');
 for(let i=0;i<140&&match.phase!=='result';i++){now+=500;room.tickBattles(now)}assert.equal(match.phase,'result');const settled=[...b.events,...c.events].filter(e=>e.type==='battle_result'&&e.battleId===match.id);assert.equal(settled.length,2,'each participant receives one authoritative result');assert(settled.every(e=>e.reward&&Number.isInteger(e.reward.coins)));assert.equal(b.events.find(e=>e.type==='battle_result'&&e.battleId===match.id).slot,1,'PvP settlement preserves the originating slot');const resultCount=settled.length;room.tickBattles(now);assert.equal([...b.events,...c.events].filter(e=>e.type==='battle_result'&&e.battleId===match.id).length,resultCount);
 // A declined offer is removed from the public snapshot and does not leave a stuck participant.
 now+=10000;room.tickBattles(now);assert.equal(room.pvpMatches.size,0);send(b,{type:'pvp_enter',profile:profile('palmon','palmon',0)});send(c,{type:'pvp_enter',profile:profile('agumon','agumon',0)});const second=[...room.pvpMatches.values()][0];send(b,{type:'pvp_decline'});assert(!room.pvpMatches.has(second.id));assert(!c.pvp);assert(c.events.at(-1).type==='battle'||c.events.some(e=>e.type==='pvp_cancelled'));
 // A disconnected grinder releases its field run and cannot leave a ghost resident behind.
 send(a,{type:'pve_start',profile:profile()});assert(a.pve);room.disconnect(a);assert.equal(room.pveRuns.size,0);
 // v349: a partner in gym training is barred from battles, but only that partner slot.
 const gym=join(4,52.5,30.5,'agumon');
 send(gym,{type:'gym_start',request:41,stat:'power',species:'agumon',slot:2});assert(gym.events.some(e=>e.type==='gym_started'&&e.request===41&&e.gym.partnerSlot===2),'the gym reservation records the training partner slot');
 Object.assign(gym,{x:70,z:64,at:now,path:[],sit:false});
 send(gym,{type:'pve_start',request:42,profile:{...profile(),slot:2}});assert(gym.events.some(e=>e.type==='battle_error'&&e.request===42&&/training partner cannot battle/.test(e.message)),'the training slot cannot enter the field');
 Object.assign(gym,{x:74,z:118,at:now,path:[],sit:false});
 send(gym,{type:'pvp_enter',request:43,profile:{...profile(),slot:2}});assert(gym.events.some(e=>e.type==='battle_error'&&e.request===43&&/training partner cannot battle/.test(e.message)),'the training slot cannot enter the ring');
 Object.assign(gym,{x:70,z:64,at:now,path:[],sit:false});
 send(gym,{type:'pve_start',request:44,profile:{...profile(),slot:0}});assert(gym.events.some(e=>e.type==='pve_started'&&e.request===44),'another slot of the same player may still grind');
 send(gym,{type:'pve_stop'});send(gym,{type:'gym_stop'});assert(!gym.gym);
 send(gym,{type:'pve_start',request:45,profile:{...profile(),slot:2}});assert(gym.events.some(e=>e.type==='pve_started'&&e.request===45),'stopping training reopens the slot');
 room.disconnect(gym);
 console.log('PASS Sanctuary room: authoritative wave/reward events, forged-result rejection, energy gate, training-slot gate, opposite-side mutual PvP, countdown, settlement, cancellation and disconnect cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
