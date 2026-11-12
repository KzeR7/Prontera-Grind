/* Shared Sanctuary combat simulation. The room owns time, random rolls and settlement;
 * browsers only render the snapshots produced by these rules. No Ragnarok combat state is read. */
(function(root,factory){
 const data=typeof module==='object'&&module.exports?require('./digimon/roster.js'):root.PGDigimonRoster;
 const bases=typeof module==='object'&&module.exports?require('./digimon/base-stats.js'):root.PGDigimonBaseStats;
 const api=factory(data,bases);if(typeof module==='object'&&module.exports)module.exports=api;root.PGDigimonBattle=api;
})(globalThis,function(DATA,BASE){
'use strict';
if(!DATA)throw Error('Digimon roster data must load before battle rules');
if(!BASE)throw Error('Digimon base stats must load before battle rules');
const STATS=['power','guard','agility','focus'];
const TICK_MS=650,WAVE_DELAY_MS=1200,COUNTDOWN_MS=3000,OFFER_MS=20000,RESULT_MS=9000;
const MAX_WAVE=100,MAX_ROUNDS=120;
// v382 (owner ask): a boss is no longer a stat-stick. Every boss telegraphs a slam that lands on
// every standing partner, shields at half HP, enrages at a third, and calls same-stage adds at
// 66% and 33%. A dedicated raid run opens straight on one boss whose pool comes from the party's
// own DPS, with a soft sustain pulse instead of the wave heal, so it is a damage race, not a
// faster mob wave. All of it is derived from HP thresholds and the shared pulse, so the room and
// every client agree without extra messages.
const BOSS_TELL_EVERY=8,BOSS_TELL_TICKS=2,BOSS_SLAM_MULT=1.6,BOSS_ENRAGE_HP=.35,BOSS_ENRAGE_MULT=1.3,BOSS_SHIELD_HP=.5,BOSS_SHIELD_MULT=2,BOSS_SHIELD_TICKS=5,BOSS_SUMMON_STEPS=[.66,.33],BOSS_ADD_HP=.55,BOSS_ADD_ATK=.6;
const RAID_DPS_TICKS=45,RAID_ATK_DIV=52,RAID_PARTY_ATK=.35,RAID_HEAL_EVERY=8,RAID_HEAL_PCT=.06;
// v382 (owner ask): ring matches last longer. HP scales well above ATK so neither side bursts and
// the 120-round decision cap stays a genuine fallback instead of the usual ending.
const PVP_HP_SCALE=6,PVP_ATK_SCALE=1.35;
// v350 field stages: waves group into stages of five, and every fifth wave is a single
// boss drawn one stage above the partner. Ranged presentation: the fastest quarter of
// forms (Cyber Sleuth spd >= 1050) skirmish from a distance instead of pressing in.
const BOSS_EVERY=5,BOSS_HP=2.0,BOSS_ATK=1.35,BOSS_DEF=1.15,BOSS_EGG_CHANCE=.10,RANGED_SPD=1050;
// v354: the Energy meter is gone. Gym pacing is the 20-minute session timer and grind runs
// are bounded by waves and defeat, so no care meter is carried into battle profiles anymore.
// Partner slots grew from two to four, and a training partner is barred from battles without
// blocking the player's other slots.
const MAX_SLOT=3;
// Each bot in a cleared farm wave gets an independent server-owned drop roll. These are
// bonus drops on top of the existing wave reward, not a browser-declared inventory grant.
// v354: eggs are rarer on the owner's call — 5% per bot, 10% per boss.
const PVE_COIN_DROP_CHANCE=.45,PVE_EGG_DROP_CHANCE=.05;
// v351 partner equipment: four gear slots per partner. Each piece carries one main stat and
// at most one special; nothing sockets, nothing crafts. Bots never wear gear — cleared
// enemies and bosses instead roll drops for the owner's Pet Bag, so the grind has a chase
// and the Forge's reroll/tier-up fees give saturated Pet Coins somewhere to go.
const GEAR_KINDS=['weapon','armor','accessory','relic'];
const GEAR_MAIN={weapon:['atk'],armor:['hp','def'],accessory:['spdPct','hp'],relic:['hp','atk','def','spdPct']};
const GEAR_MAIN_VALUE={hp:{armor:[8,13,20,28,38],accessory:[6,9,14,20,27],relic:[7,11,16,22,30]},atk:{weapon:[3,5,7,9,12],relic:[2,3,4,6,7]},def:{armor:[1,2,3,4,6],relic:[1,2,3,4,5]},spdPct:{accessory:[2,3,4,6,8],relic:[1,2,3,4,5]}};
const GEAR_SPECIAL={crit:[1,1,2,3,4],lifesteal:[1,1,1,2,3],thorns:[1,1,1,2,2],xpPct:[2,3,4,6,8]};
// Aggregate caps a profile may carry. A full set of maximum-roll tier-5 pieces lands just
// under these, so the server-side clamp only bites on doctored submissions.
const GEAR_CAP={hp:116,atk:24,def:14,spdPct:16,crit:20,lifesteal:15,thorns:10,xpPct:40};
const PVE_GEAR_DROP_CHANCE=.08,BOSS_GEAR_DROP_CHANCE=.55,GEAR_SPECIAL_CHANCE=.4,BOSS_GEAR_SPECIAL_CHANCE=.65,GEAR_VARIANCE=.2;
function gearZero(){return {hp:0,atk:0,def:0,spdPct:0,crit:0,lifesteal:0,thorns:0,xpPct:0}}
function normalizeGear(raw){
 const g=gearZero();if(!raw||typeof raw!=='object')return g;
 for(const k of Object.keys(g))g[k]=Math.max(0,Math.min(GEAR_CAP[k],Math.round(Number(raw[k])||0)));
 return g;
}
const cap=(n,min,max)=>Math.max(min,Math.min(max,Math.floor(Number.isFinite(Number(n))?Number(n):min)));
const cleanId=id=>DATA.clean(id);
function randomUnit(){const c=globalThis.crypto;if(c&&typeof c.getRandomValues==='function'){const a=new Uint32Array(1);c.getRandomValues(a);return a[0]/4294967296}return Math.random()}
function rngFromSeed(seed){let s=(Number(seed)>>>0)||1;return function(){s+=0x6D2B79F5;let t=Math.imul(s^s>>>15,1|s);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296}}
function stageRank(form){const stage=DATA.entry(form)?.stage,i=DATA.STAGES.indexOf(stage);return i<0?0:i}
function sameStage(form){const stage=DATA.entry(form)?.stage;return DATA.IDS.filter(id=>DATA.entry(id)?.stage===stage)}
// Field-stage helpers shared by the room, the browser HUD and the tests. Stage 1 is
// waves 1-5, stage 2 is waves 6-10, and each stage ends on its boss wave.
function stageOf(wave){return Math.max(1,Math.floor(((Number(wave)||1)-1)/BOSS_EVERY)+1)}
function isBossWave(wave){return (Number(wave)||0)>0&&(Number(wave)||0)%BOSS_EVERY===0}
// A raid is a boss fight from wave one; a grind boss is just the wave-5 case of a run.
function bossFight(run){return !!run&&(run.mode==='boss'||isBossWave(run.wave))}
// Presentation range: quick forms keep their distance, everyone else brawls. Derived
// only from the reproducible base-stat table, so every client agrees without a message.
function attackRange(form){
 const spd=Number(BASE.stats(form)?.spd)||1000;
 return {ranged:spd>=RANGED_SPD,range:spd>=RANGED_SPD?Math.min(4.6,3.2+(spd-RANGED_SPD)/200):2.4};
}
function profile(raw){
 if(!raw||typeof raw!=='object')return null;const form=cleanId(raw.form||raw.species);if(!form)return null;
 const stats={};for(const k of STATS)stats[k]=cap(raw.stats?.[k],0,12);
 const lineId=typeof raw.lineId==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(raw.lineId)?raw.lineId:form;
 return {lineId,form,slot:cap(raw.slot,0,MAX_SLOT),stage:DATA.entry(form)?.stage||'Rookie',level:cap(raw.level??1,1,2000),xp:cap(raw.xp,0,7996),wins:cap(raw.wins,0,999),mastery:cap(raw.mastery,0,6),stats,gear:normalizeGear(raw.gear)};
}
function combatant(p,id,enemy=false,boss=false){
 const rank=stageRank(p.form),level=Math.min(100,p.level),g=p.gear||gearZero();
 // Bosses scale on top of the bot scale: ~2.4 bots of health, ~1.55 bots of attack.
 const hpScale=enemy?(boss?BOSS_HP*.52:.52):1,atkScale=enemy?(boss?BOSS_ATK*.32:.32):1,defScale=enemy?(boss?BOSS_DEF*.65:.65):1;
 // Per-form base modifiers: Cyber Sleuth-derived where catalogued, documented house
 // archetypes otherwise. The stage curve of the base formula is unchanged (mean 1000).
 const base=BASE.stats(p.form);
 // Gear main stats are flat adds after the form scaling, so a piece that says +38 HP means +38 HP.
 // v354: trained Agility feeds swing speed (+2.5% each) and Focus feeds crit chance (+1% each),
 // so all four gym stats now move the field formula, not just Power and Guard.
 const maxHp=Math.round((92+rank*31+level*7+p.stats.guard*7)*hpScale*base.hp/1000+g.hp);
 return {id,form:p.form,stage:p.stage,level:p.level,spd:base.spd/1000*(1+(g.spdPct+p.stats.agility*2.5)/100),maxHp,hp:maxHp,boss:!!boss,attack:Math.round((13+rank*5+level*1.5+p.stats.power*2.5+p.mastery*1.5)*atkScale*base.atk/1000+g.atk),defense:Math.round((2+rank*2+p.stats.guard*1.2)*defScale*base.def/1000+g.def),attackAt:0,hitAt:0,crit:Math.min(40,g.crit+p.stats.focus),lifesteal:g.lifesteal,thorns:g.thorns};
}
// Read-only DigiDex layer: the same live formula, never a second species-stat table.
function combatPreview(form,raw={}){const p=profile({...raw,form});if(!p)return null;const u=combatant(p,'preview');return {form:p.form,stage:p.stage,level:p.level,xp:p.xp,wins:p.wins,mastery:p.mastery,stats:{...p.stats},maxHp:u.maxHp,attack:u.attack,defense:u.defense,attackMs:TICK_MS,spd:u.spd,gear:{...p.gear}}}
function strike(a,b,random){
 const roll=Math.max(0,Math.min(.999999999,Number(random())||0));
 // Speed decides the swing, not the average: quick forms connect reliably, heavy forms
 // hit hard or graze. Both windows keep the same expected damage.
 const fast=(a.spd||1)>=1,lo=fast?.94:.76,width=fast?.12:.48;
 let amount=Math.max(1,Math.round((a.attack-b.defense*.35)*(lo+roll*width)));
 let crit=false;
 // The crit roll is only consumed when the attacker can actually crit, so unequipped
 // partners keep the exact random stream and damage they had before gear existed.
 if(a.crit>0&&Math.max(0,Math.min(.999999999,Number(random())||0))<a.crit/100){amount=Math.round(amount*1.5);crit=true}
 b.hp=Math.max(0,b.hp-amount);b.hitAt=(b.hitAt||0)+1;a.attackAt=(a.attackAt||0)+1;
 if(a.lifesteal>0)a.hp=Math.min(a.maxHp,a.hp+Math.ceil(amount*a.lifesteal/100));
 if(b.thorns>0)a.hp=Math.max(0,a.hp-b.thorns);
 return {amount,crit};
}
function pveReward(run,prof){
 // v355: an optional profile override lets a party run pay every member with their own
 // partner's rank and +XP% gear, instead of the leader's numbers.
 const p=prof||run.profile,rank=stageRank(p.form),xpPct=1+(p.gear?.xpPct||0)/100;
 // v382: a raid pays for the whole fight at once — it is one long boss instead of a stage.
 if(run.mode==='boss')return {coins:80+rank*12+(run.party?20:0),xp:Math.round((6+rank*2)*xpPct),wins:2};
 if(bossFight(run))return {coins:30+rank*8+(stageOf(run.wave)-1)*6,xp:Math.round((3+Math.floor(rank/2))*xpPct),wins:2};
 return {coins:10+rank*4+Math.min(10,run.wave-1),xp:Math.round((1+Math.floor(rank/2))*xpPct),wins:1};
}
function pveDrops(run,random){
 let coins=0,eggs=0,evoPoints=0;const roll=()=>Math.max(0,Math.min(.999999999,Number(random())||0));
 if(bossFight(run)){const rank=stageRank(run.profile.form);
  coins+=8+rank*3+Math.floor(roll()*8);if(roll()<(run.mode==='boss'?BOSS_EGG_CHANCE*2:BOSS_EGG_CHANCE))eggs++;
  if(roll()<(run.mode==='boss'?.22:.12))evoPoints+=1+(roll()<.2?1:0);
  return {coins,eggs,evoPoints};
 }
 for(const enemy of run.enemies){
  if(roll()<PVE_COIN_DROP_CHANCE)coins+=2+stageRank(enemy.form)+Math.floor(roll()*4);
  if(roll()<PVE_EGG_DROP_CHANCE)eggs++;
  if(roll()<.06)evoPoints++;
 }
 return {coins,eggs,evoPoints};
}
// Equipment drops are random per clear, never milestone-gated: every defeated bot has a
// small chance and every boss a large one, with the boss piece drawn from a higher tier.
// These rolls happen after pveDrops() so coin and egg outcomes keep their exact streams.
function gearTierFor(wave,boss){
 const stage=stageOf(wave);
 return boss?Math.min(5,Math.max(2,2+Math.floor((stage-1)/2))):Math.min(3,1+Math.floor((stage-1)/3));
}
function rollGearItem(tier,random,specialChance=GEAR_SPECIAL_CHANCE,kind=null){
 const roll=()=>Math.max(0,Math.min(.999999999,Number(random())||0));
 const t=cap(tier,1,5);
 const piece=kind&&GEAR_KINDS.includes(kind)?kind:GEAR_KINDS[Math.floor(roll()*GEAR_KINDS.length)];
 const mains=GEAR_MAIN[piece],stat=mains[Math.floor(roll()*mains.length)];
 const value=Math.max(1,Math.round(GEAR_MAIN_VALUE[stat][piece][t-1]*(1-GEAR_VARIANCE+roll()*GEAR_VARIANCE*2)));
 let special=null;
 if(roll()<specialChance){const keys=Object.keys(GEAR_SPECIAL),s=keys[Math.floor(roll()*keys.length)];special={stat:s,value:GEAR_SPECIAL[s][t-1]}}
 return {kind:piece,tier:t,main:{stat,value},special};
}
function pveGearDrops(run,random){
 const roll=()=>Math.max(0,Math.min(.999999999,Number(random())||0));
 if(bossFight(run)){
  // v382: a raid always pays a piece, drawn from a tier that tracks the raider's own rank.
  if(run.mode==='boss'){const tier=Math.min(5,Math.max(3,stageRank(run.profile.form)));return rollGearItem(tier,random,BOSS_GEAR_SPECIAL_CHANCE)}
  return roll()<BOSS_GEAR_DROP_CHANCE?rollGearItem(gearTierFor(run.wave,true),random,BOSS_GEAR_SPECIAL_CHANCE):null;
 }
 for(const enemy of run.enemies){if(roll()<PVE_GEAR_DROP_CHANCE)return rollGearItem(gearTierFor(run.wave,false),random,GEAR_SPECIAL_CHANCE)}
 return null;
}
// v382: adds are real units of the boss's own named stage, but scaled down so the boss stays
// the threat. In a raid their attack comes from the fighter pool instead of their level, so a
// high-level raider is not deleted by two recycled bots.
function bossAdds(run,boss,count,random){
 const pool=sameStage(boss.form),forms=pool.length?pool:[boss.form],adds=[];
 for(let i=0;i<count;i++){
  const form=forms[Math.floor(Math.max(0,Math.min(.999999999,Number(random())||0))*forms.length)];
  const raw={...run.profile,form,stage:DATA.entry(form)?.stage||run.profile.stage,lineId:'add',stats:{power:Math.min(12,Math.floor(run.profile.stats.power*.4)),guard:Math.min(12,Math.floor(run.profile.stats.guard*.4)),agility:0,focus:0},mastery:0,gear:null};
  const unit=combatant(raw,'wave'+run.wave+'-add'+(run.mech?run.mech.summoned:0)+'-'+i,true);
  unit.maxHp=Math.round(unit.maxHp*BOSS_ADD_HP);unit.hp=unit.maxHp;
  unit.attack=Math.round(unit.attack*BOSS_ADD_ATK);
  if(run.mode==='boss'&&run.partners&&run.partners.length)unit.attack=Math.max(1,Math.round(run.partners[0].maxHp/60));
  adds.push(unit);
 }
 return adds;
}
function spawnWave(run,now,random){
 run.wave++;run.phase='fighting';for(const p of run.partners){p.attackAt=0;p.hitAt=0}
 run.mech=null;
 const boss=bossFight(run),stage=stageOf(run.wave);
 let pool;
 if(boss){
  // The boss pool sits one named stage above the partner (Mega at the top), so a
  // growing partner keeps meeting recognizable rivals instead of recycled peers.
  const rank=Math.min(5,stageRank(run.profile.form)+1),stageName=DATA.STAGES[rank];
  pool=DATA.IDS.filter(id=>DATA.entry(id)?.stage===stageName);
  if(!pool.length)pool=sameStage(run.profile.form);
 }else pool=sameStage(run.profile.form);
 const forms=pool.length?pool:[run.profile.form];
 const bonus=Math.min(4,stage-1);
 if(boss){
  const form=forms[Math.floor(Math.max(0,Math.min(.999999999,Number(random())||0))*forms.length)];
  const bossProfile={...run.profile,form,stage:DATA.entry(form)?.stage||run.profile.stage,lineId:'boss',stats:{power:Math.min(12,Math.floor(run.profile.stats.power*.7)+bonus),guard:Math.min(12,Math.floor(run.profile.stats.guard*.6)+bonus),agility:0,focus:0},mastery:0,gear:null};
  const bossUnit=combatant(bossProfile,'wave'+run.wave+'-boss',true,true);
  // v355: a party of partners faces a proportionally sturdier boss so stage ends stay events.
  if(run.party){const scale=1+.45*(run.partners.length-1);bossUnit.maxHp=Math.round(bossUnit.maxHp*scale);bossUnit.hp=bossUnit.maxHp}
  // v382 raid frame: the pool comes from the party's own DPS and the boss's steady damage from a
  // fighter's HP pool, so a raid lasts about the same ~45 ticks at every level instead of melting
  // or walling. Charges, shield, enrage and adds supply the danger.
  if(run.mode==='boss'){
   const dps=run.partners.reduce((sum,partner)=>sum+partner.attack,0);
   bossUnit.maxHp=Math.max(1,Math.round(dps*RAID_DPS_TICKS));bossUnit.hp=bossUnit.maxHp;
   // Damage is authored as a fraction of the WEAKEST partner's pool, so mixed parties stay fair,
   // and the flat defense subtraction is added back so low-level raids bite as hard as high ones.
   // A party's pressure scales with its size: the boss hits one fighter per tick, so without this
   // three rotating targets heal faster than one boss can press them.
   const minHp=Math.min(...run.partners.map(partner=>partner.maxHp));
   const pressure=minHp/RAID_ATK_DIV*(run.party?1+RAID_PARTY_ATK*(run.partners.length-1):1);
   bossUnit.attack=Math.max(1,Math.round(pressure+bossUnit.defense*.35));
  }
  run.mech={slamAt:0,shieldPulses:0,shielded:false,enraged:false,summoned:0,routed:false};
  run.enemies=[bossUnit];
 }else{
  // v355: party grinds field a bigger group (2 + one per partner, max 5) so a full party
  // does not triple its clear speed - and its reward rate - over a solo trainer.
  const count=run.party?Math.min(5,2+run.partners.length):3;
  run.enemies=Array.from({length:count},(_,i)=>{
   const form=forms[Math.floor(Math.max(0,Math.min(.999999999,Number(random())||0))*forms.length)];
   const enemyProfile={...run.profile,form,stage:DATA.entry(form)?.stage||run.profile.stage,lineId:'bot',stats:{power:Math.min(12,Math.floor(run.profile.stats.power*.55)+bonus),guard:Math.min(12,Math.floor(run.profile.stats.guard*.55)+bonus),agility:0,focus:0},mastery:0,gear:null};
   return combatant(enemyProfile,'wave'+run.wave+'-enemy'+i,true);
  });
 }
 run.nextAt=now+TICK_MS;run.pulse=0;
 return {type:'wave',wave:run.wave,boss,forms:run.enemies.map(e=>e.form)};
}
function createPve({id,owner,room,profile:raw,profiles,now,random=randomUnit,bossMode=false}){
 // v355: a party grind passes up to three owned profiles; they fight together in one field.
 const list=(Array.isArray(profiles)&&profiles.length?profiles:[raw]).map(p=>profile(p)).filter(Boolean);
 if(!list.length)throw Error('A valid owned Digimon profile is required');
 if(list.length>3)list.length=3;
 const run={id,owner,room,profile:list[0],profiles:list,members:[],wave:0,phase:'fighting',partners:list.map((p,i)=>combatant(p,i?'partner'+i:'partner')),enemies:[],nextAt:now,pulse:0,earned:{coins:0,xp:0,wins:0,eggs:0,dropCoins:0,gear:0,evoPoints:0},reason:'',slot:0,party:list.length>1,mode:bossMode?'boss':'grind'};
 run.partner=run.partners[0];
 spawnWave(run,now,random);return run;
}
function stepPve(run,now,random=randomUnit){
 if(!run||run.phase==='ended'||now<run.nextAt)return null;
 const events=[];
 if(run.phase==='between'){
  events.push(spawnWave(run,now,random));return {events,changed:true};
 }
 run.pulse++;const living=run.enemies.filter(e=>e.hp>0),target=living[0],bossWave=bossFight(run),fighters=run.partners.filter(p=>p.hp>0);
 // v355: every living partner strikes on the shared tick; enemies rotate their target so
 // a party shares the pressure instead of one trainer tanking every retaliation.
 for(const partner of fighters)if(target){const hit=strike(partner,target,random);events.push({type:'hit',from:partner.id,to:target.id,amount:hit.amount,crit:hit.crit,hp:target.hp});}
 // v382 boss mechanics. A raid keeps a slow sustain pulse because there are no wave heals;
 // grind bosses keep the normal between-wave heal. Everything here is deterministic given the
 // run state, so a room and its clients can never disagree.
 const bossUnit=run.mech?run.enemies.find(e=>e.boss&&e.hp>0):null;
 if(bossUnit){
  const mech=run.mech,pct=bossUnit.hp/bossUnit.maxHp;
  if(run.mode==='boss'&&run.pulse%RAID_HEAL_EVERY===0)for(const partner of fighters)partner.hp=Math.min(partner.maxHp,partner.hp+Math.ceil(partner.maxHp*RAID_HEAL_PCT));
  if(mech.summoned<BOSS_SUMMON_STEPS.length&&pct<=BOSS_SUMMON_STEPS[mech.summoned]){
   // Bump the counter first so the second wave of adds gets distinct unit ids.
   mech.summoned++;
   const adds=bossAdds(run,bossUnit,run.party?2:1,random);
   run.enemies.push(...adds);
   events.push({type:'boss_summon',forms:adds.map(add=>add.form)});
  }
  if(!mech.enraged&&pct<=BOSS_ENRAGE_HP){mech.enraged=true;bossUnit.attack=Math.round(bossUnit.attack*BOSS_ENRAGE_MULT);events.push({type:'boss_enrage'})}
  if(!mech.shielded&&pct<=BOSS_SHIELD_HP){mech.shielded=true;mech.shieldPulses=BOSS_SHIELD_TICKS;bossUnit.defense=Math.round(bossUnit.defense*BOSS_SHIELD_MULT);events.push({type:'boss_shield',on:true})}
  else if(mech.shieldPulses>0&&--mech.shieldPulses===0){bossUnit.defense=Math.round(bossUnit.defense/BOSS_SHIELD_MULT);events.push({type:'boss_shield',on:false})}
  // The telegraphed slam lands on EVERY standing partner — the moment a party has to be ready.
  if(mech.slamAt>0&&run.pulse>=mech.slamAt){
   mech.slamAt=0;events.push({type:'boss_slam'});
   for(const partner of fighters){if(partner.hp<=0)continue;const hit=strike(bossUnit,partner,random),extra=Math.round(hit.amount*(BOSS_SLAM_MULT-1));if(extra>0)partner.hp=Math.max(0,partner.hp-extra);events.push({type:'hit',from:bossUnit.id,to:partner.id,amount:hit.amount+extra,crit:hit.crit,hp:partner.hp,slam:true})}
  }else if(mech.slamAt<=0&&run.pulse%BOSS_TELL_EVERY===0){mech.slamAt=run.pulse+BOSS_TELL_TICKS;events.push({type:'boss_tell',inTicks:BOSS_TELL_TICKS})}
 }
 // A slain boss takes its summoned adds with it: the stage ends on the boss, not on cleaning up.
 if(run.mech&&!run.mech.routed){const boss=run.enemies.find(e=>e.boss);if(boss&&boss.hp<=0){run.mech.routed=true;const routed=run.enemies.filter(e=>!e.boss&&e.hp>0);if(routed.length){for(const add of routed)add.hp=0;events.push({type:'boss_rout',forms:routed.map(add=>add.form)})}}}
 if(run.enemies.every(e=>e.hp<=0)){
  const drops=pveDrops(run,random),reward={...pveReward(run),dropCoins:drops.coins,eggs:drops.eggs,evoPoints:drops.evoPoints||0};reward.coins+=drops.coins;
  const gearDrop=pveGearDrops(run,random);
  run.earned.coins+=reward.coins;run.earned.xp+=reward.xp;run.earned.wins+=reward.wins;run.earned.eggs+=drops.eggs;run.earned.dropCoins+=drops.coins;run.earned.evoPoints=(run.earned.evoPoints||0)+(drops.evoPoints||0);if(gearDrop)run.earned.gear++;
  for(const p of run.partners)p.hp=Math.min(p.maxHp,p.hp+Math.ceil(p.maxHp*.3));
  events.push({type:'wave_clear',wave:run.wave,boss:bossWave,reward:{...reward},earned:{...run.earned},partnerHp:run.partner.hp,partners:run.partners.map(p=>({id:p.id,form:p.form,hp:p.hp,maxHp:p.maxHp})),gearDrop});
  if(run.wave>=MAX_WAVE||run.mode==='boss'){run.phase='ended';run.reason='complete';events.push({type:'end',reason:run.reason});}
  else {run.phase='between';run.nextAt=now+WAVE_DELAY_MS;}
  return {events,changed:true};
 }
 // The whole group retaliates on alternating ticks. This leaves a readable attack rhythm and
 // prevents three same-stage bots from deleting a fresh partner before the first wave is visible.
 // A lone boss retaliates every tick instead, keeping stage-end pressure comparable.
 for(const enemy of living)if(enemy.hp>0&&fighters.length&&(run.pulse%2===0||enemy.boss)){const victim=fighters[run.pulse%fighters.length];const hit=strike(enemy,victim,random);events.push({type:'hit',from:enemy.id,to:victim.id,amount:hit.amount,crit:hit.crit,hp:victim.hp});}
 if(run.partners.every(p=>p.hp<=0)){run.phase='ended';run.reason='defeat';events.push({type:'end',reason:'defeat'});}
 run.nextAt=now+TICK_MS;return {events,changed:true};
}
function createPvp({id,room,players,now}){
 if(!Array.isArray(players)||players.length!==2)throw Error('PvP needs two players');
 const participants=players.map((p,i)=>{const prof=profile(p.profile);if(!prof)throw Error('A valid PvP profile is required');const unit=combatant(prof,'fighter'+i);
 // v382: ring HP scales above ring ATK, so a match is a trade of blows rather than a burst race.
 unit.maxHp=Math.round(unit.maxHp*PVP_HP_SCALE);unit.hp=unit.maxHp;unit.attack=Math.round(unit.attack*PVP_ATK_SCALE);
 return {id:p.id,name:String(p.name||'Player').slice(0,32),side:p.side||(i?'right':'left'),profile:prof,unit,accepted:false};});
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
  const xpPct=1+(p.profile.gear?.xpPct||0)/100;
  return [p.id,{outcome,coins:outcome==='win'?60+rank*10:outcome==='lose'?15+rank*2:25,xp:Math.round((outcome==='win'?4+rank:outcome==='lose'?1:2)*xpPct),wins:outcome==='win'?1:0}];
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
 const order=match.turn%2?[a,b]:[b,a];for(const attacker of order){const defender=attacker===a?b:a;if(attacker.unit.hp<=0||defender.unit.hp<=0)continue;const hit=strike(attacker.unit,defender.unit,random);events.push({type:'hit',from:attacker.id,to:defender.id,amount:hit.amount,crit:hit.crit,hp:defender.unit.hp});}
 const aDead=a.unit.hp<=0,bDead=b.unit.hp<=0;
 if(aDead||bDead){finishPvp(match,aDead&&bDead?null:aDead?b.id:a.id,'knockout',now);events.push({type:'result',winnerId:match.winnerId,rewards:pvpRewards(match)});}
 else if(match.turn>=MAX_ROUNDS){const ar=a.unit.hp/a.unit.maxHp,br=b.unit.hp/b.unit.maxHp;finishPvp(match,ar===br?null:ar>br?a.id:b.id,'decision',now);events.push({type:'result',winnerId:match.winnerId,rewards:pvpRewards(match)});}
 match.nextAt=now+TICK_MS;return {events,changed:true};
}
function unitSnapshot(u){if(!u)return null;return {id:u.id,form:u.form,stage:u.stage,level:u.level,hp:u.hp,maxHp:u.maxHp,boss:!!u.boss,attackAt:u.attackAt||0,hitAt:u.hitAt||0}}
// v389: a v388 device-simulated party run carries only id/room/members/profiles/mode - NO server-built
// partner, enemies, mech or earned. Reading those unconditionally threw a TypeError inside the very
// broadcast that announces the party, so leaving a shared run crashed the room. Everything optional is
// now guarded; a client-simulated run reports the same shape a client already expects, with no units.
function pveSnapshot(run){
 const profile=run.profile||{};
 const profiles=Array.isArray(run.profiles)&&run.profiles.length?run.profiles:(run.profile?[run.profile]:[]);
 const units=Array.isArray(run.partners)?run.partners.filter(Boolean):(run.partner?[run.partner]:[]);
 return {id:run.id,owner:run.owner,room:run.room,wave:run.wave||0,phase:run.phase,reason:run.reason,nextAt:run.nextAt,
  profile:{lineId:profile.lineId,form:profile.form,stage:profile.stage,level:profile.level,slot:profile.slot},
  partner:unitSnapshot(run.partner),partners:units.map(unitSnapshot),
  members:Array.isArray(run.members)&&run.members.length?[...run.members]:[run.owner],
  slots:profiles.map((p,i)=>({id:Array.isArray(run.members)?run.members[i]:undefined,slot:p?.slot||0})),
  party:run.party===true,clientSim:run.clientSim===true,mode:run.mode||'grind',
  mech:run.mech?{slamIn:run.mech.slamAt>0?Math.max(0,run.mech.slamAt-run.pulse):0,shieldPulses:run.mech.shieldPulses||0,enraged:!!run.mech.enraged,summons:run.mech.summoned||0}:null,
  enemies:(Array.isArray(run.enemies)?run.enemies:[]).map(unitSnapshot),
  earned:{...(run.earned||{})},slot:run.slot||0};
}
// v389: `clientSim` must travel on the snapshot. The room decides "does this battle need a 1s alarm?"
// from the snapshot it broadcasts (hasActiveBattles reads the match objects, but the client-side
// 'should I keep ticking?' check reads this), and a device-simulated match that did not say so froze
// the HUD on "Battle starts in 3" or kept a server tick alive when v388 asked for neither.
function pvpSnapshot(match){return {id:match.id,room:match.room,phase:match.phase,clientSim:match.clientSim===true,createdAt:match.createdAt,expiresAt:match.expiresAt,countdownUntil:match.countdownUntil,resultUntil:match.resultUntil,winnerId:match.winnerId,reason:match.reason,participants:match.participants.map(p=>({id:p.id,name:p.name,side:p.side,accepted:p.accepted,profile:{lineId:p.profile.lineId,form:p.profile.form,stage:p.profile.stage,level:p.profile.level},unit:unitSnapshot(p.unit)}))}}
return {STATS,TICK_MS,WAVE_DELAY_MS,COUNTDOWN_MS,OFFER_MS,RESULT_MS,MAX_WAVE,MAX_ROUNDS,BOSS_TELL_EVERY,BOSS_TELL_TICKS,BOSS_SLAM_MULT,BOSS_ENRAGE_HP,BOSS_ENRAGE_MULT,BOSS_SHIELD_HP,BOSS_SHIELD_MULT,BOSS_SHIELD_TICKS,BOSS_SUMMON_STEPS,BOSS_ADD_HP,BOSS_ADD_ATK,RAID_DPS_TICKS,RAID_ATK_DIV,RAID_PARTY_ATK,RAID_HEAL_EVERY,RAID_HEAL_PCT,PVP_HP_SCALE,PVP_ATK_SCALE,bossFight,bossAdds,PVE_COIN_DROP_CHANCE,PVE_EGG_DROP_CHANCE,MAX_SLOT,BOSS_EVERY,BOSS_EGG_CHANCE,RANGED_SPD,GEAR_KINDS,GEAR_MAIN,GEAR_MAIN_VALUE,GEAR_SPECIAL,GEAR_CAP,PVE_GEAR_DROP_CHANCE,BOSS_GEAR_DROP_CHANCE,GEAR_SPECIAL_CHANCE,BOSS_GEAR_SPECIAL_CHANCE,GEAR_VARIANCE,stageOf,isBossWave,attackRange,profile,combatPreview,stageRank,sameStage,gearZero,normalizeGear,gearTierFor,rollGearItem,pveGearDrops,pveReward,strike,createPve,stepPve,pveSnapshot,createPvp,acceptPvp,stepPvp,finishPvp,pvpRewards,pvpSnapshot,randomUnit,rngFromSeed};
});
