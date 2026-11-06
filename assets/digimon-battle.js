/* Shared Sanctuary combat simulation. The room owns time, random rolls and settlement;
 * browsers only render the snapshots produced by these rules. No Ragnarok combat state is read. */
(function(root,factory){
 const data=typeof module==='object'&&module.exports?require('./digimon/roster.js'):root.PGDigimonRoster;
 const api=factory(data);if(typeof module==='object'&&module.exports)module.exports=api;root.PGDigimonBattle=api;
})(globalThis,function(DATA){
'use strict';
if(!DATA)throw Error('Digimon roster data must load before battle rules');
const STATS=['power','guard','agility','focus'];
const TICK_MS=500,WAVE_DELAY_MS=1200,COUNTDOWN_MS=3000,OFFER_MS=20000,RESULT_MS=9000;
const MAX_WAVE=100,MAX_ROUNDS=120;
// Each bot in a cleared farm wave gets an independent server-owned drop roll. These are
// bonus drops on top of the existing wave reward, not a browser-declared inventory grant.
const PVE_COIN_DROP_CHANCE=.45,PVE_EGG_DROP_CHANCE=.08;
const cap=(n,min,max)=>Math.max(min,Math.min(max,Math.floor(Number.isFinite(Number(n))?Number(n):min)));
const cleanId=id=>DATA.clean(id);
function randomUnit(){const c=globalThis.crypto;if(c&&typeof c.getRandomValues==='function'){const a=new Uint32Array(1);c.getRandomValues(a);return a[0]/4294967296}return Math.random()}
function stageRank(form){const stage=DATA.entry(form)?.stage,i=DATA.STAGES.indexOf(stage);return i<0?0:i}
function sameStage(form){const stage=DATA.entry(form)?.stage;return DATA.IDS.filter(id=>DATA.entry(id)?.stage===stage)}
function profile(raw){
 if(!raw||typeof raw!=='object')return null;const form=cleanId(raw.form||raw.species);if(!form)return null;
 const stats={};for(const k of STATS)stats[k]=cap(raw.stats?.[k],0,12);
 const lineId=typeof raw.lineId==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(raw.lineId)?raw.lineId:form;
 return {lineId,form,slot:cap(raw.slot,0,1),stage:DATA.entry(form)?.stage||'Rookie',level:cap(raw.level??1,1,1000),xp:cap(raw.xp,0,3996),wins:cap(raw.wins,0,999),mastery:cap(raw.mastery,0,6),fatigue:cap(raw.fatigue,0,100),fullness:cap(raw.fullness??70,0,100),stats};
}
function combatant(p,id,enemy=false){
 const rank=stageRank(p.form),level=Math.min(100,p.level),scale=enemy ? .52 : 1;
 const maxHp=Math.round((92+rank*31+level*7+p.stats.guard*7)*scale);
 return {id,form:p.form,stage:p.stage,level:p.level,maxHp,hp:maxHp,attack:Math.round((13+rank*5+level*1.5+p.stats.power*2.5+p.mastery*1.5)*(enemy ? .32 : 1)),defense:Math.round((2+rank*2+p.stats.guard*1.2)*(enemy ? .65 : 1)),attackAt:0,hitAt:0};
}
// Read-only DigiDex layer: the same live formula, never a second species-stat table.
function combatPreview(form,raw={}){const p=profile({...raw,form});if(!p)return null;const u=combatant(p,'preview');return {form:p.form,stage:p.stage,level:p.level,xp:p.xp,wins:p.wins,mastery:p.mastery,stats:{...p.stats},maxHp:u.maxHp,attack:u.attack,defense:u.defense,attackMs:TICK_MS}}
function strike(a,b,random){
 const roll=Math.max(0,Math.min(.999999999,Number(random())||0));
 const amount=Math.max(1,Math.round((a.attack-b.defense*.35)*(.88+roll*.24)));
 b.hp=Math.max(0,b.hp-amount);b.hitAt=(b.hitAt||0)+1;a.attackAt=(a.attackAt||0)+1;return amount;
}
function pveReward(run){const rank=stageRank(run.profile.form);return {coins:10+rank*4+Math.min(10,run.wave-1),xp:1+Math.floor(rank/2),wins:1,fatigue:2,fullness:-1}}
function pveDrops(run,random){
 let coins=0,eggs=0;const roll=()=>Math.max(0,Math.min(.999999999,Number(random())||0));
 for(const enemy of run.enemies){
  if(roll()<PVE_COIN_DROP_CHANCE)coins+=2+stageRank(enemy.form)+Math.floor(roll()*4);
  if(roll()<PVE_EGG_DROP_CHANCE)eggs++;
 }
 return {coins,eggs};
}
function spawnWave(run,now,random){
 run.wave++;run.phase='fighting';run.partner.attackAt=0;run.partner.hitAt=0;
 const pool=sameStage(run.profile.form),forms=pool.length?pool:[run.profile.form],count=3;
 run.enemies=Array.from({length:count},(_,i)=>{
  const form=forms[Math.floor(Math.max(0,Math.min(.999999999,Number(random())||0))*forms.length)];
  const enemyProfile={...run.profile,form,stage:DATA.entry(form)?.stage||run.profile.stage,lineId:'bot',stats:{power:Math.floor(run.profile.stats.power*.55),guard:Math.floor(run.profile.stats.guard*.55),agility:0,focus:0},mastery:0};
  return combatant(enemyProfile,'wave'+run.wave+'-enemy'+i,true);
 });
 run.nextAt=now+TICK_MS;run.pulse=0;
 return {type:'wave',wave:run.wave,forms:run.enemies.map(e=>e.form)};
}
function createPve({id,owner,room,profile:raw,now,random=randomUnit}){
 const p=profile(raw);if(!p)throw Error('A valid owned Digimon profile is required');
 const run={id,owner,room,profile:p,wave:0,phase:'fighting',partner:combatant(p,'partner'),enemies:[],nextAt:now,pulse:0,earned:{coins:0,xp:0,wins:0,eggs:0,dropCoins:0},reason:'',slot:0};
 spawnWave(run,now,random);return run;
}
function stepPve(run,now,random=randomUnit){
 if(!run||run.phase==='ended'||now<run.nextAt)return null;
 const events=[];
 if(run.phase==='between'){
  events.push(spawnWave(run,now,random));return {events,changed:true};
 }
 run.pulse++;const living=run.enemies.filter(e=>e.hp>0),target=living[0];
 if(target){strike(run.partner,target,random);events.push({type:'hit',from:'partner',to:target.id,hp:target.hp});}
 if(run.enemies.every(e=>e.hp<=0)){
  const drops=pveDrops(run,random),reward={...pveReward(run),dropCoins:drops.coins,eggs:drops.eggs};reward.coins+=drops.coins;
  run.earned.coins+=reward.coins;run.earned.xp+=reward.xp;run.earned.wins+=reward.wins;run.earned.eggs+=drops.eggs;run.earned.dropCoins+=drops.coins;
  run.profile.fatigue=cap(run.profile.fatigue+reward.fatigue,0,100);run.profile.fullness=cap(run.profile.fullness+reward.fullness,0,100);
  run.partner.hp=Math.min(run.partner.maxHp,run.partner.hp+Math.ceil(run.partner.maxHp*.2));
  events.push({type:'wave_clear',wave:run.wave,reward:{...reward},earned:{...run.earned},partnerHp:run.partner.hp});
  if(run.profile.fatigue>=100||run.profile.fullness<10){run.phase='ended';run.reason=run.profile.fullness<10?'hungry':'tired';events.push({type:'end',reason:run.reason});}
  else {run.phase='between';run.nextAt=now+WAVE_DELAY_MS;}
  return {events,changed:true};
 }
 // The whole group retaliates on alternating ticks. This leaves a readable attack rhythm and
 // prevents three same-stage bots from deleting a fresh partner before the first wave is visible.
 if(run.pulse%2===0)for(const enemy of living)if(enemy.hp>0){strike(enemy,run.partner,random);events.push({type:'hit',from:enemy.id,to:'partner',hp:run.partner.hp});}
 if(run.partner.hp<=0){run.phase='ended';run.reason='defeat';events.push({type:'end',reason:'defeat'});}
 run.nextAt=now+TICK_MS;return {events,changed:true};
}
function createPvp({id,room,players,now}){
 if(!Array.isArray(players)||players.length!==2)throw Error('PvP needs two players');
 const participants=players.map((p,i)=>{const prof=profile(p.profile);if(!prof)throw Error('A valid PvP profile is required');return {id:p.id,name:String(p.name||'Player').slice(0,32),side:p.side||(i?'right':'left'),profile:prof,unit:combatant(prof,'fighter'+i),accepted:false};});
 return {id,room,phase:'offer',participants,createdAt:now,expiresAt:now+OFFER_MS,countdownUntil:0,nextAt:0,turn:0,winnerId:null,reason:'',resultUntil:0,rewards:null};
}
function acceptPvp(match,id,now){
 const p=match?.participants.find(p=>p.id===id);if(!p||match.phase!=='offer')return false;p.accepted=true;
 if(match.participants.every(p=>p.accepted)){match.phase='countdown';match.countdownUntil=now+COUNTDOWN_MS;match.nextAt=match.countdownUntil;}
 return true;
}
function pvpRewards(match){
 if(match.rewards)return match.rewards;const rank=Math.max(...match.participants.map(p=>stageRank(p.profile.form)));
 match.rewards=Object.fromEntries(match.participants.map(p=>{
  const outcome=match.winnerId==null?'draw':match.winnerId===p.id?'win':'lose';
  return [p.id,{outcome,coins:outcome==='win'?60+rank*10:outcome==='lose'?15+rank*2:25,xp:outcome==='win'?4+rank:outcome==='lose'?1:2,wins:outcome==='win'?1:0,fatigue:5,fullness:-3}];
 }));return match.rewards;
}
function finishPvp(match,winnerId,reason,now){
 if(match.phase==='result'||match.phase==='closed')return false;match.phase='result';match.winnerId=Number.isInteger(winnerId)?winnerId:null;match.reason=reason||'knockout';match.resultUntil=now+RESULT_MS;pvpRewards(match);return true;
}
function stepPvp(match,now,random=randomUnit){
 if(!match||match.phase==='closed')return null;
 if(match.phase==='offer'){
  if(now<match.expiresAt)return null;match.phase='closed';match.reason='offer_expired';return {events:[{type:'cancel',reason:match.reason}],changed:true};
 }
 if(match.phase==='countdown'){
  if(now<match.countdownUntil)return {events:[],changed:true};match.phase='fighting';match.nextAt=now+TICK_MS;match.turn=0;return {events:[{type:'fight'}],changed:true};
 }
 if(match.phase==='result'){
  if(now<match.resultUntil)return null;match.phase='closed';return {events:[{type:'close'}],changed:true};
 }
 if(match.phase!=='fighting'||now<match.nextAt)return null;
 const [a,b]=match.participants,events=[];match.turn++;
 // Alternate the first attacker, while both combatants still retaliate in the same round.
 const order=match.turn%2?[a,b]:[b,a];for(const attacker of order){const defender=attacker===a?b:a;if(attacker.unit.hp<=0||defender.unit.hp<=0)continue;const amount=strike(attacker.unit,defender.unit,random);events.push({type:'hit',from:attacker.id,to:defender.id,amount,hp:defender.unit.hp});}
 const aDead=a.unit.hp<=0,bDead=b.unit.hp<=0;
 if(aDead||bDead){finishPvp(match,aDead&&bDead?null:aDead?b.id:a.id,'knockout',now);events.push({type:'result',winnerId:match.winnerId,rewards:pvpRewards(match)});}
 else if(match.turn>=MAX_ROUNDS){const ar=a.unit.hp/a.unit.maxHp,br=b.unit.hp/b.unit.maxHp;finishPvp(match,ar===br?null:ar>br?a.id:b.id,'decision',now);events.push({type:'result',winnerId:match.winnerId,rewards:pvpRewards(match)});}
 match.nextAt=now+TICK_MS;return {events,changed:true};
}
function unitSnapshot(u){return {id:u.id,form:u.form,stage:u.stage,level:u.level,hp:u.hp,maxHp:u.maxHp,attackAt:u.attackAt||0,hitAt:u.hitAt||0}}
function pveSnapshot(run){return {id:run.id,owner:run.owner,room:run.room,wave:run.wave,phase:run.phase,reason:run.reason,nextAt:run.nextAt,profile:{lineId:run.profile.lineId,form:run.profile.form,stage:run.profile.stage,level:run.profile.level,fatigue:run.profile.fatigue,fullness:run.profile.fullness},partner:unitSnapshot(run.partner),enemies:run.enemies.map(unitSnapshot),earned:{...run.earned},slot:run.slot||0}}
function pvpSnapshot(match){return {id:match.id,room:match.room,phase:match.phase,createdAt:match.createdAt,expiresAt:match.expiresAt,countdownUntil:match.countdownUntil,resultUntil:match.resultUntil,winnerId:match.winnerId,reason:match.reason,participants:match.participants.map(p=>({id:p.id,name:p.name,side:p.side,accepted:p.accepted,profile:{lineId:p.profile.lineId,form:p.profile.form,stage:p.profile.stage,level:p.profile.level},unit:unitSnapshot(p.unit)}))}}
return {STATS,TICK_MS,WAVE_DELAY_MS,COUNTDOWN_MS,OFFER_MS,RESULT_MS,MAX_WAVE,MAX_ROUNDS,PVE_COIN_DROP_CHANCE,PVE_EGG_DROP_CHANCE,profile,combatPreview,stageRank,sameStage,createPve,stepPve,pveSnapshot,createPvp,acceptPvp,stepPvp,finishPvp,pvpRewards,pvpSnapshot,randomUnit};
});
