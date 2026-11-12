// Room authority and lifecycle coverage for the live Sanctuary field and ring.
const assert=require('node:assert/strict');
(async()=>{
 const {SocialRoom}=await import('../../workers/social/room.mjs');let now=1000;const room=new SocialRoom({now:()=>now,random:()=>.5});
 const join=(id,x,z,form='agumon')=>{const events=[];const c=room.connect({id,username:'Battle'+id},s=>events.push(JSON.parse(s)),()=>{});c.events=events;room.receive(c,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'},digimon:form}}));Object.assign(c,{x,z,at:now,path:[],sit:false});return c};
 const send=(c,m)=>room.receive(c,JSON.stringify(m));
 const profile=(line='agumon',form=line,power=12)=>({lineId:line,form,level:5,stats:{power,guard:12,agility:0,focus:0},energy:70});
 const a=join(1,70,64),b=join(2,74,118,'palmon'),c=join(3,62,118,'agumon');
 // v354: the energy gate is retired; a stale meter in the profile no longer blocks a start.
 send(a,{type:'pve_start',request:6,profile:{...profile(),energy:5}});assert(a.events.some(e=>e.type==='pve_started'&&e.request===6),'a stale meter no longer blocks a grind start');send(a,{type:'pve_stop'});assert(a.events.some(e=>e.type==='pve_end'&&e.reason==='stopped'));
 // v385: only the first run requires the farm. A connected repeat can renew the same partner from
 // elsewhere in the plaza, while stop/disconnect destroys the server-side permit.
 {const r=join(9,70,64);send(r,{type:'pve_start',request:60,profile:profile(),mode:'boss',repeat:true});assert(r.pve&&r.pve.repeat);for(let i=0;i<160&&r.pve;i++){now+=650;room.tickBattles(now)}assert(!r.pve&&r.pveRepeatPermit,'a completed run leaves a short connected repeat permit');Object.assign(r,{x:10,z:10,at:now,path:[],sit:false});send(r,{type:'pve_start',request:61,profile:profile(),mode:'boss',repeat:true,resume:true});assert(r.events.some(e=>e.type==='pve_started'&&e.request===61),'the repeat starts away from the middle field');send(r,{type:'pve_stop'});assert.equal(r.pveRepeatPermit,null,'Stop cancels the repeat chain');Object.assign(r,{x:70,z:64,at:now,path:[],sit:false});send(r,{type:'pve_start',request:62,profile:profile(),mode:'boss',repeat:true});assert(r.pveRepeatPermit);room.disconnect(r);assert.equal(r.pveRepeatPermit,null,'going offline cancels the repeat chain')}
 send(a,{type:'pve_start',request:7,profile:{...profile(),slot:1}});assert(a.events.some(e=>e.type==='pve_started'&&e.request===7));assert.equal(room.pveRuns.size,1);assert(b.events.some(e=>e.type==='battle'&&e.pve.length===1),'room observers receive the field snapshot');
 const run=a.pve,runStart=now;for(now+=500;now<runStart+16000&&run.wave<2;now+=500)room.tickBattles(now);assert(run.wave>=2,'room timer regenerates a group');const rewards=a.events.filter(e=>e.type==='battle_reward');assert(rewards.length>=1);assert(rewards.every(e=>e.slot===1),'settlement returns the originating partner slot for duplicate-species collections');assert(rewards.every(e=>Number.isInteger(e.reward.eggs)&&e.reward.eggs>=0&&e.reward.eggs<=3&&Number.isInteger(e.reward.dropCoins)),'worker wave messages carry bounded server-rolled egg and bonus-petgold fields');const rewardCount=rewards.length;room.tickBattles(now);assert.equal(a.events.filter(e=>e.type==='battle_reward').length,rewardCount,'same-tick replay cannot duplicate a wave reward');
 // v352: every landed strike is forwarded as a presentation-only FX event, to participants and spectators alike.
 const fieldFx=a.events.filter(e=>e.type==='battle_fx'&&e.battleId===run.id);
 assert(fieldFx.length>=1,'each landed strike is forwarded as an FX event'); assert(fieldFx.every(e=>e.kind==='pve'&&e.battleId===run.id&&(e.to==='partner'||/^wave\d+-(boss|enemy)/.test(String(e.to)))&&Number.isInteger(e.amount)&&e.amount>=1&&typeof e.crit==='boolean'),'FX events carry presentation-only strike facts and no rewards');
 assert(b.events.some(e=>e.type==='battle_fx'&&e.battleId===run.id),'room spectators receive the same FX stream');
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
 const match=[...room.pvpMatches.values()][0];send(b,{type:'pvp_accept'});assert.equal(match.phase,'offer');send(c,{type:'pvp_accept'});
 // v389: the second accept arms the device-simulated fight. v388 removed the 1s battle alarm for
 // clientSim matches, so nothing ticks the room - a `countdown` phase driven by a tick could never
 // have advanced (the HUD sat on "Battle starts in 3" and the ring stayed taken). The plaza now tells
 // both devices `startsAt` and flips to 'fighting' in the same call; the three-second countdown still
 // plays out on screen, from the timestamp each device was given.
 assert.equal(match.clientSim,true,'both devices own the fight');
 assert.equal(match.countdownUntil-now,3000,'the devices are still given the three-second countdown');
 assert.equal(match.phase,'fighting','the plaza hands off immediately instead of waiting for a tick it never arms');
 assert.equal(match.fightUntil>now,true,'and records when to abandon an unreported fight');
 room.tickBattles(now+1000);assert.equal(match.phase,'fighting','ticking does not disturb a live device fight');
 // v389: v388 moved the FIGHT onto both devices ("PvP countdown still matches in the plaza, then both
 // devices simulate; they report the winner"). The plaza therefore must NOT settle this match - that
 // would double-pay. What it must still do is advance the countdown (asserted above) and, if the two
 // devices never report, abandon the match so it cannot hold the ring for ever. Drive that window.
 assert.equal(match.phase,'fighting');
 for(let i=0;i<300&&match.phase==='fighting';i++){now+=500;room.tickBattles(now)}
 assert.equal(match.phase,'closed','an unreported device-simulated match is abandoned, not settled');
 assert.equal(match.reason,'abandoned','and it names why');
 assert.equal([...b.events,...c.events].filter(e=>e.type==='battle_result').length,0,'the plaza pays no result for a device-simulated fight');
const settled=[...b.events,...c.events].filter(e=>e.type==='battle_result'&&e.battleId===match.id);assert.equal(settled.length,0,'the plaza sends no result for a device-simulated fight - the two devices report it instead (v388)');
 const ringFx=[...b.events,...c.events,...a.events].filter(e=>e.type==='battle_fx'&&e.kind==='pvp');
 // v389: v388 put the strike stream on the devices too - the plaza no longer forwards per-hit PvP FX,
 // and it pays no result, so there is no server-side 'slot' to preserve. What must still hold is that
 // the plaza stayed silent: no FX, no reward, and no duplicate result when it keeps ticking.
 assert.equal(ringFx.length,0,'the plaza forwards no PvP strikes for a device-simulated fight (v388)');
 assert.equal(settled.length,0,'and it pays nothing for one');
 const resultCount=[...b.events,...c.events].filter(e=>e.type==='battle_result'&&e.battleId===match.id).length;
 room.tickBattles(now);room.tickBattles(now+1000);
 assert.equal([...b.events,...c.events].filter(e=>e.type==='battle_result'&&e.battleId===match.id).length,resultCount,'further ticks cannot produce a duplicate result');
// v355: grind parties - invite/accept, leader start, one shared run, per-member rewards, and
// a member leaving only removes their own partner while the field stays alive for the rest.
{
 const p1=join(6,70,64,'agumon'),p2=join(7,74,66,'palmon'),p3=join(8,66,66,'agumon');
 const prof=(form,slot=0)=>({lineId:form,form,level:5,stats:{power:12,guard:12,agility:0,focus:0},slot});
 send(p1,{type:'party_invite',request:60,targetId:7});
 assert(p2.events.some(e=>e.type==='party_invite'&&e.from.id===6),'the invited trainer receives the invite');
 assert(p1.events.some(e=>e.type==='party'&&e.party&&e.party.leader===6),'inviting forms the party with the inviter as leader');
 send(p2,{type:'party_accept',request:61});
 send(p1,{type:'party_profile',profile:prof('agumon')});
 send(p2,{type:'party_profile',profile:prof('palmon')});
 assert(p2.events.some(e=>e.type==='party'&&e.party&&e.party.members.length===2),'acceptance is broadcast to members');
 send(p1,{type:'party_start',request:62});
 // v389: v388 replaced the server-side `pve_started` handshake with `pve_client` - one shared seed,
 // every member's device runs the wave and reports. The party is told with the SAME message shape the
 // client actually handles (assets/social.js beginClientPve).
 assert(p1.events.some(e=>e.type==='pve_client'&&e.party===true&&e.owner===6),'the leader hears the party start');
 assert(p2.events.some(e=>e.type==='pve_client'&&e.party===true),'every member hears the party start');
 assert(p1.events.some(e=>e.type==='pve_client'&&Number.isInteger(e.seed)),'the shared seed travels with it');
 assert.equal(p1.events.filter(e=>e.type==='pve_client').length,1,'and the leader is told once, not twice');
 const run=[...room.pveRuns.values()].find(r=>r.party);
 assert(run&&run.members.includes(6)&&run.members.includes(7),'the run carries both member ids');
 // v389: the run is a device-simulated descriptor now - it carries the members, the profiles and the
 // shared seed, and no server-side units. Both partners still share ONE field (one run, one seed).
 assert(run.members.length===2 && run.profiles.length===2,'both partners share one field');
 assert.equal(run.clientSim,true,'and it runs on the devices, not the plaza');
 assert(!run.partner&&!run.enemies,'the plaza builds no units for a device-simulated run');
 // A busy leader cannot invite a third trainer mid-grind.
 send(p1,{type:'party_invite',request:63,targetId:8});
 assert(p1.events.some(e=>e.type==='party_error'&&/Finish the current DigiPet activity/.test(e.message)),'a grinding leader cannot invite');
 // v389: a party run is device-simulated, so the plaza must not tick it or pay it. Rewards are rolled
 // on each member's device from the shared seed and reported back; a plaza that also paid would
 // double-reward every shared clear.
 for(let t=now+700;t<now+60000;t+=650)room.tickBattles(t);
 assert.equal(p2.events.filter(e=>e.type==='battle_reward').length,0,'the plaza pays nothing for a device-simulated party clear');
 assert.equal(p1.events.filter(e=>e.type==='battle_reward').length,0,'not for the leader either');
 assert.equal(run.clientSim,true,'and the plaza never took the run over');
 // A member leaving only removes their partner; the leader keeps grinding.
 send(p2,{type:'pve_stop'});
 assert(p2.events.some(e=>e.type==='pve_end'&&e.reason==='stopped'),'the leaver is told the run stopped for them');
 const after=[...room.pveRuns.values()].find(r=>r.id===run.id);
 // v389: the descriptor keeps member ids/profiles, not server-built partners.
 assert(after&&after.members.length===1&&after.members[0]===6&&after.profiles.length===1,'the shared run continues for the leader');
 send(p1,{type:'pve_stop'});
 assert(!room.pveRuns.has(run.id),'the last member out ends the run');
 // The party survives the grind; leadership transfers when the leader leaves.
 send(p1,{type:'party_leave'});
 const promoted=p2.events.filter(e=>e.type==='party').at(-1);
 assert(promoted&&promoted.party&&promoted.party.leader===7,'leadership transfers to the remaining trainer');
 room.disconnect(p2);room.disconnect(p3);
}
// v355: a queued player who walks away from the ring is dropped from the matchmaking queue
// instead of being stuck refusing every other activity with "Finish the current DigiPet activity first."
{
 const q=join(5,74,118,'agumon');const inQueue=()=>[...room.pvpQueues.values()].flat().some(e=>e.id===5);
 send(q,{type:'pvp_enter',request:50,profile:profile()});
 assert(q.events.some(e=>e.type==='pvp_waiting'&&e.request===50),'queueing is answered with pvp_waiting');
 assert(inQueue(),'the player is in the room queue');
 send(q,{type:'pve_start',request:51,profile:profile()});
 assert(q.events.some(e=>e.type==='battle_error'&&e.request===51&&/Finish the current DigiPet activity/.test(e.message)),'a queued player cannot start a second activity');
 Object.assign(q,{x:20,z:40,at:now,path:[],sit:false});
 now+=1000;room.tickBattles(now);
 assert(!inQueue(),'walking away from the ring clears the queue entry');
 assert(q.events.some(e=>e.type==='pvp_cancelled'&&e.reason==='left-ring'),'the walker is told why the queue cleared');
 send(q,{type:'pve_start',request:52,profile:profile()});
 assert(q.events.some(e=>e.type==='battle_error'&&e.request===52&&/middle DigiPet farm/.test(e.message)),'after cleanup the refusal is about position, not a stuck activity');
 room.disconnect(q);
}
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
 console.log('PASS Sanctuary room: authoritative wave/reward events, strike FX forwarding, forged-result rejection, stale-meter tolerance, training-slot gate, opposite-side mutual PvP, queue hygiene, three-trainer grind parties, countdown hand-off, device-simulated fights that the plaza never pays or duplicates, abandonment of an unreported match, cancellation and disconnect cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
