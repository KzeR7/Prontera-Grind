// Deterministic combat rules: per-form base stats, meter-free waves and server-owned PvP timing.
const assert=require('node:assert/strict');
const B=require('../../assets/digimon-battle.js');
const R=require('../../assets/digimon/roster.js');
const BASE=require('../../assets/digimon/base-stats.js');
// v349: every form carries its own base modifiers; the stage curve keeps its average.
const agumonBase=B.combatPreview('agumon'),patamonBase=B.combatPreview('patamon');
assert.equal(agumonBase.maxHp,167);assert.equal(agumonBase.attack,28);assert.equal(agumonBase.defense,7);assert.equal(agumonBase.attackMs,B.TICK_MS);
assert.ok(agumonBase.maxHp>patamonBase.maxHp&&agumonBase.attack>patamonBase.attack,'same-stage forms differ through their base stats');
assert.ok(BASE.stats('agumon').hp!==BASE.stats('patamon').hp);
assert.ok(['agumon','agumon_adventure'].every(f=>JSON.stringify(BASE.stats(f))===JSON.stringify(BASE.stats('agumon'))),'variants inherit their base species');
const trainedPreview=B.combatPreview('agumon',{level:10,mastery:2,stats:{power:5,guard:3}});assert.equal(trainedPreview.maxHp,254);assert.equal(trainedPreview.attack,62);assert.equal(trainedPreview.defense,11);assert.equal(trainedPreview.stats.power,5);assert.equal(B.combatPreview('not-a-digimon'),null);
// Speed sets the swing, not the average: quick forms connect reliably, heavy forms swing wild.
const slowStrike=B.combatPreview('numemon'),quickStrike=B.combatPreview('kokabuterimon');
assert.ok(slowStrike.spd<1&&quickStrike.spd>1,'speed modifiers spread both ways');
const profile={lineId:'agumon',form:'agumon',level:5,xp:16,wins:0,mastery:0,energy:70,stats:{power:12,guard:12,agility:0,focus:0}};
const run=B.createPve({id:'test-pve',owner:1,room:1,profile,now:0,random:()=>.5});
assert.equal(run.enemies.length,3,'a wave is a group');
assert(run.enemies.every(e=>R.entry(e.form).stage==='Rookie'),'bots match the partner stage');
let clears=0;
for(let now=500;now<18000&&run.wave<2;now+=500){const result=B.stepPve(run,now,()=>.5);if(result)clears+=result.events.filter(e=>e.type==='wave_clear').length}
assert.equal(run.wave,2,'a new group is spawned after the whole group dies');
assert.equal(clears,1,'the first group settles once');
assert(run.enemies.every(e=>R.entry(e.form).stage==='Rookie'),'regenerated bots retain stage matching');
assert.equal(run.profile.energy,undefined,'the retired meter no longer spends anything');
const frozen=B.stepPve(run,0,()=>.5);assert.equal(frozen,null,'time cannot run backwards or duplicate a wave');
// v354: the meter is retired; a drained-looking profile no longer ends a run early.
const tiredRun=B.createPve({id:'tired-pve',owner:1,room:1,profile:{...profile,energy:0},now:0,random:()=>.5});
for(let now=500;now<8000;now+=500)B.stepPve(tiredRun,now,()=>.5);
assert.notEqual(tiredRun.reason,'exhausted','a stale meter value cannot end the grind');
// Zeroed deterministic rolls force every bonus drop: three per-bot petgold rolls and eggs.
const dropRun=B.createPve({id:'drop-pve',owner:1,room:1,profile,now:0,random:()=>0});let dropClear=null;
for(let now=500;now<18000&&!dropClear;now+=500){const result=B.stepPve(dropRun,now,()=>0);dropClear=result?.events.find(e=>e.type==='wave_clear')||null}
assert(dropClear,'forced drop wave clears');assert.equal(dropClear.reward.eggs,3,'each defeated bot can drop a Digi-Egg');assert(dropClear.reward.dropCoins>0,'bonus petgold is rolled per defeated bot');
assert.equal(dropClear.reward.coins,10+B.stageRank(dropRun.profile.form)*4+dropClear.reward.dropCoins,'bonus petgold is added to the authoritative wave reward');
assert.equal(dropRun.earned.eggs,3);assert.equal(dropRun.earned.dropCoins,dropClear.reward.dropCoins);assert.equal(B.pveSnapshot(dropRun).earned.eggs,3,'snapshots expose earned eggs for the live HUD');
assert.equal(B.pveSnapshot(dropRun).profile.energy,undefined,'snapshots no longer carry the retired meter');
const match=B.createPvp({id:'test-pvp',room:1,now:0,players:[{id:1,name:'One',profile},{id:2,name:'Two',profile:{...profile,lineId:'palmon',form:'palmon',stats:{power:0,guard:0,agility:0,focus:0}}}]});
assert.equal(match.phase,'offer');B.acceptPvp(match,1,0);assert.equal(match.phase,'offer','one acceptance is not enough');
B.acceptPvp(match,2,0);assert.equal(match.phase,'countdown');
assert.equal(match.countdownUntil,3000,'the countdown is exactly three seconds');
assert.equal(B.stepPvp(match,2999,()=>.5).events.some(e=>e.type==='fight'),false);assert.equal(B.stepPvp(match,3000,()=>.5).events[0].type,'fight');
for(let now=3500;now<70000&&match.phase!=='result';now+=500)B.stepPvp(match,now,()=>.5);
assert.equal(match.phase,'result','PvP auto-fights to a result without command messages');assert(match.winnerId===1||match.winnerId===2||match.winnerId===null);
const rewards=B.pvpRewards(match);assert.deepEqual(Object.keys(rewards).sort(),['1','2']);assert(rewards[1].coins>=0&&rewards[2].coins>=0);assert.equal(rewards[1].energy,undefined,'ring matches carry no meter field at all');assert.equal(B.pvpRewards(match),rewards,'settlement is stable and idempotent');
const before=match.winnerId;B.stepPvp(match,70000,()=>.5);assert.equal(match.winnerId,before,'later ticks cannot change a settled winner');
// Legacy saves keep working: an old fatigue/fullness profile migrates into energy on read.
const legacy=B.profile({form:'agumon',level:99999,stats:{power:999,guard:-4},fullness:-10,fatigue:1000});
assert.equal(legacy.level,2000,'v382: the level ceiling doubled with the evolution curve');assert.equal(legacy.stats.power,12);assert.equal(legacy.stats.guard,0);assert.equal(legacy.energy,undefined,'legacy meter fields are dropped on read');
assert.equal(B.profile({form:'agumon',fullness:60,fatigue:20}).energy,undefined,'no meter is invented for legacy profiles');
// v355: party runs - up to three partners share one field, field a bigger group, rotate
// enemy focus, heal together, and only end in defeat when every partner has fainted.
{
 const mk=(form,slot)=>({lineId:form,form,level:5,xp:16,wins:0,mastery:0,stats:{power:12,guard:12,agility:0,focus:0},slot});
 const partyRun=B.createPve({id:'party-pve',owner:1,room:1,profiles:[mk('agumon',0),mk('palmon',1),mk('birdramon',2)],now:0,random:()=>.5});
 assert.equal(partyRun.partners.length,3,'three partners join one run');
 assert.equal(partyRun.party,true,'the run is flagged as a party');
 assert.equal(partyRun.partner,partyRun.partners[0],'the leader partner stays the compat partner');
 assert.equal(partyRun.enemies.length,5,'a full party faces five bots');
 let clears=0,allyHits=0,rotated=0;
 for(let t=650;t<90000&&partyRun.wave<2;t+=650){const result=B.stepPve(partyRun,t,()=>.5);if(result)clears+=result.events.filter(e=>e.type==='wave_clear').length;allyHits+=result?result.events.filter(e=>e.type==='hit'&&/^partner[12]$/.test(e.from)).length:0;rotated+=result?result.events.filter(e=>e.type==='hit'&&/^partner[12]$/.test(e.to)).length:0}
 assert.equal(partyRun.wave,2,'the party clears into the second wave');
 assert.equal(clears,1,'the first group settles once');
 assert(allyHits>0,'the extra partners strike too');
 assert(partyRun.partners.every(p=>p.hp>0),'the wave-clear heal revives the whole party');
 const snap=B.pveSnapshot(partyRun);
 assert.equal(snap.party,true);assert.equal(snap.partners.length,3);
 assert.deepEqual(snap.slots.map(x=>x.slot),[0,1,2],'the snapshot maps every member to their slot');
 const mine=B.pveReward(partyRun,partyRun.profiles[1]);
 assert(Number.isInteger(mine.coins)&&mine.coins>0,'per-member rewards compute from that member\'s partner');
 // Defeat needs every partner down: a lone survivor keeps the run alive.
 partyRun.partners[0].hp=0;partyRun.partners[2].hp=0;
 const survivor=B.stepPve(partyRun,partyRun.nextAt+650,()=>.5);
 assert(partyRun.phase!=='ended','one standing partner keeps the party fighting');
 partyRun.partners[1].hp=0;
 B.stepPve(partyRun,partyRun.nextAt+1300,()=>.5);
 assert.equal(partyRun.reason,'defeat','the run only ends when every partner fainted');
}
// Four partner slots travel with the profile and are clamped server-side.
assert.equal(B.profile({form:'agumon',slot:3}).slot,3);assert.equal(B.profile({form:'agumon',slot:9}).slot,B.MAX_SLOT);assert.equal(B.profile({form:'agumon',slot:-2}).slot,0);
// v350 field stages: five waves per stage, boss on every fifth, one named stage up.
assert.equal(B.stageOf(1),1);assert.equal(B.stageOf(5),1);assert.equal(B.stageOf(6),2);assert.equal(B.stageOf(10),2);assert.equal(B.stageOf(11),3);assert.equal(B.stageOf(0),1);assert.equal(B.stageOf(-3),1);
assert.deepEqual([1,4,5,6,9,10,11,15].map(w=>B.isBossWave(w)),[false,false,true,false,false,true,false,true]);
assert.equal(B.BOSS_EVERY,5);
// Presentation ranges are deterministic per form: brawlers press in, quick forms skirmish.
const meleeRange=B.attackRange('agumon'),rangedRange=B.attackRange('birdramon');
assert.equal(meleeRange.ranged,false);assert.equal(meleeRange.range,2.4,'v354 brawlers hold a wider gap so sprites never overlap');
assert.equal(rangedRange.ranged,true);assert.ok(rangedRange.range>=3.2&&rangedRange.range<=4.6,JSON.stringify(rangedRange));
assert.deepEqual(B.attackRange('agumon'),meleeRange,'the range class is stable per form');
const rangedForms=R.IDS.filter(id=>B.attackRange(id).ranged).length;
assert.ok(rangedForms>Math.floor(R.IDS.length*.15)&&rangedForms<Math.ceil(R.IDS.length*.4),rangedForms+' of '+R.IDS.length+' forms are ranged');
for(const id of R.IDS){const r=B.attackRange(id);assert.ok(r.range>=1.8&&r.range<=4.6&&typeof r.ranged==='boolean',id)}
// A deterministic half-roll keeps every normal wave on the same mid-pool form, so stage
// scaling and boss relations compare identical forms instead of random species spreads.
const strongProfile={lineId:'agumon',form:'agumon',level:5,xp:16,wins:0,mastery:0,energy:100,stats:{power:12,guard:12,agility:0,focus:0}};
const stageRun=B.createPve({id:'stage-pve',owner:1,room:1,profile:strongProfile,now:0,random:()=>.5});
const waveOne=stageRun.enemies.map(e=>({hp:e.maxHp,atk:e.attack}));
assert.equal(waveOne.length,3);assert(stageRun.enemies.every(e=>!e.boss));
let nowMs=500,bossWave=null,bossClear=null,stageTwoBots=null,bossHits=0,bossTicks=0,normalGaps=[];
for(let guard=0;guard<6000&&stageRun.phase!=='ended';guard++,nowMs+=500){
 const result=B.stepPve(stageRun,nowMs,()=>.5);if(!result)continue;
 for(const e of result.events){
  if(e.type==='wave'){
   if(e.wave===5){bossWave={wave:e.wave,count:stageRun.enemies.length,boss:e.boss,form:e.forms[0],stage:R.entry(e.forms[0]).stage,hp:stageRun.enemies[0].maxHp,atk:stageRun.enemies[0].attack,id:stageRun.enemies[0].id};
   }
   if(e.wave===6)stageTwoBots=stageRun.enemies.map(x=>({hp:x.maxHp,atk:x.attack}));
  }
  if(e.type==='wave_clear'&&e.wave===5)bossClear={reward:e.reward,boss:e.boss};
 }
 if(bossWave&&stageRun.wave===5&&stageRun.phase==='fighting'){bossTicks++;if(result.events.some(e=>e.type==='hit'&&e.from===bossWave.id))bossHits++}
 if(stageRun.wave===1&&stageRun.phase==='fighting'&&result){const enemyHits=result.events.filter(e=>e.type==='hit'&&e.from!=='partner').length;if(enemyHits)normalGaps.push(bossTicks)}
}
assert(bossWave,'the fifth wave spawns');assert.equal(bossWave.count,1,'a boss wave is a single enemy');
assert.equal(bossWave.boss,true);assert.equal(bossWave.stage,'Champion','the boss sits one named stage above a Rookie partner');
assert.ok(bossWave.hp>Math.max(...waveOne.map(b=>b.hp))*1.5,'the boss outweighs the stage bots: '+bossWave.hp+' vs '+JSON.stringify(waveOne));
assert.ok(bossWave.atk>Math.max(...waveOne.map(b=>b.atk)),'the boss out-hits the stage bots');
assert(bossClear&&bossClear.boss===true);assert.equal(bossClear.reward.wins,2,'a boss kill counts double wins');
assert.ok(bossClear.reward.coins>=30+B.stageRank(stageRun.profile.form)*8,'boss coins beat any normal wave');
assert(bossHits>=Math.max(1,bossTicks-1),'the lone boss retaliates on every tick, not alternating ones');
assert(stageTwoBots&&stageTwoBots.length===3,'stage two returns to three-bot groups');
assert(stageTwoBots.every((b,i)=>b.hp>waveOne[i].hp),'stage-two bots are sturdier than stage-one bots of the same form');
assert(stageTwoBots.every((b,i)=>b.atk>=waveOne[i].atk),'stage-two bots hit at least as hard');
assert.equal(stageRun.wave>=6,true);
// The 100-wave safety cap ends the run with an explicit completion reason.
const capRun=B.createPve({id:'cap-pve',owner:1,room:1,profile:strongProfile,now:0,random:()=>.5});
capRun.wave=99;capRun.phase='between';let capEnd=null;
for(let capMs=500;capMs<60000&&!capEnd;capMs+=500){const result=B.stepPve(capRun,capMs,()=>.5);capEnd=result?.events.find(e=>e.type==='end')||null}
assert.equal(capRun.phase,'ended');assert.equal(capRun.reason,'complete','clearing the last wave completes the field circuit');
assert.equal(capEnd.reason,'complete');assert.equal(capRun.wave,100);
// v351 partner equipment: four slots, one main stat and at most one special per piece.
const gearedPreview=B.combatPreview('agumon',{level:5,stats:{power:5,guard:3},gear:{hp:40,atk:10,def:5,spdPct:8,crit:6,lifesteal:4,thorns:3,xpPct:12}});
const plainPreview=B.combatPreview('agumon',{level:5,stats:{power:5,guard:3}});
assert.equal(gearedPreview.maxHp,plainPreview.maxHp+40,'+HP gear raises health');
assert.equal(gearedPreview.attack,plainPreview.attack+10,'+ATK gear raises attack');
assert.equal(gearedPreview.defense,plainPreview.defense+5,'+DEF gear raises defense');
assert.ok(Math.abs(gearedPreview.spd-plainPreview.spd*(1+8/100))<1e-9,'+SPD gear scales the swing multiplier');
assert.deepEqual(B.profile({form:'agumon',gear:{hp:9999,atk:999,crit:99}}).gear,{...B.gearZero(),hp:B.GEAR_CAP.hp,atk:B.GEAR_CAP.atk,crit:B.GEAR_CAP.crit},'doctored aggregates clamp to the legal maximum');
assert.deepEqual(B.profile({form:'agumon'}).gear,B.gearZero(),'an unequipped profile carries zero gear');
// Zero-gear partners keep the exact random stream: absent and explicit-zero gear agree.
const lcg=s=>()=>(s=(s*1103515245+12345)%2147483648)/2147483648,rngA=lcg(7),rngB=lcg(7);
const noGearRun=B.createPve({id:'gearless-pve',owner:1,room:1,profile:{...profile},now:0,random:rngA});
const zeroGearRun=B.createPve({id:'zeroed-pve',owner:1,room:1,profile:{...profile,gear:B.gearZero()},now:0,random:rngB});
for(let now=500;now<30000;now+=500){B.stepPve(noGearRun,now,rngA);B.stepPve(zeroGearRun,now,rngB)}
const snapA=B.pveSnapshot(noGearRun),snapB=B.pveSnapshot(zeroGearRun);
assert.equal(snapA.wave,snapB.wave);assert.equal(snapA.partner.hp,snapB.partner.hp);assert.deepEqual(snapA.earned,snapB.earned);assert.equal(JSON.stringify(snapA.enemies),JSON.stringify(snapB.enemies),'explicit zero gear is indistinguishable from no gear');
// Crit multiplies, lifesteal heals the attacker, thorns bite the striker.
const strikeUnit=(over={})=>({attack:100,defense:0,spd:1,hp:500,maxHp:500,attackAt:0,hitAt:0,crit:0,lifesteal:0,thorns:0,...over});
const plainHit=B.strike(strikeUnit(),strikeUnit(),()=>.5);
assert.equal(plainHit.crit,false);assert.equal(plainHit.amount,100);
const critHit=B.strike(strikeUnit({crit:100}),strikeUnit(),()=>.5);
assert.equal(critHit.crit,true);assert.equal(critHit.amount,150,'a crit strike deals 1.5x damage');
const thief=strikeUnit({hp:100,lifesteal:20});
const drainHit=B.strike(thief,strikeUnit({thorns:5}),()=>.5);
assert.equal(thief.hp,115,'lifesteal heals 20% of 100 and thorns bite back for 5');
// +XP% gear raises experience without touching coins or energy.
let xpEvent=null,plainWaveEvent=null;
const xpRun=B.createPve({id:'xp-pve',owner:1,room:1,profile:{...profile,gear:{xpPct:40}},now:0,random:()=>.5});
const plainXpRun=B.createPve({id:'plain-xp-pve',owner:1,room:1,profile:{...profile},now:0,random:()=>.5});
for(let now=500;now<20000&&!(xpEvent&&plainWaveEvent);now+=500){const r=B.stepPve(xpRun,now,()=>.5);xpEvent=xpEvent||r?.events.find(e=>e.type==='wave_clear');const p=B.stepPve(plainXpRun,now,()=>.5);plainWaveEvent=plainWaveEvent||p?.events.find(e=>e.type==='wave_clear')}
assert.equal(xpEvent.reward.coins,plainWaveEvent.reward.coins,'coins ignore gear');
assert.equal(xpEvent.reward.xp,Math.round(plainWaveEvent.reward.xp*1.4),'+XP% gear multiplies experience');
assert.equal(xpEvent.reward.energy,plainWaveEvent.reward.energy,'the energy toll ignores gear');
assert.ok(xpRun.enemies.every(e=>!e.crit&&!e.lifesteal&&!e.thorns),'bots never inherit the partner\'s gear');
const bossGearRun=B.createPve({id:'boss-gear-pve',owner:1,room:1,profile:{...profile,gear:{hp:40,atk:10,crit:15}},now:0,random:()=>.5});
bossGearRun.wave=4;bossGearRun.phase='between';B.stepPve(bossGearRun,700,()=>.5);
assert.equal(bossGearRun.enemies.length,1);assert.equal(bossGearRun.enemies[0].boss,true);
assert.ok(!bossGearRun.enemies[0].crit&&!bossGearRun.enemies[0].thorns,'the boss does not inherit equipped gear');
assert.equal(bossGearRun.partner.crit,15,'the partner keeps its own gear');
// Equipment drops: random per clear, bosses drop better tiers, normal waves cap at tier 3.
assert.equal(B.gearTierFor(5,true),2);assert.equal(B.gearTierFor(15,true),3);assert.equal(B.gearTierFor(25,true),4);assert.equal(B.gearTierFor(45,true),5);
assert.equal(B.gearTierFor(1,false),1);assert.equal(B.gearTierFor(16,false),2);assert.equal(B.gearTierFor(35,false),3);assert.equal(B.gearTierFor(90,false),3);
const forgedPiece=B.rollGearItem(4,()=>.1,.5,'weapon');
assert.equal(forgedPiece.kind,'weapon');assert.equal(forgedPiece.tier,4);assert.equal(forgedPiece.main.stat,'atk');
assert.equal(forgedPiece.main.value,Math.round(B.GEAR_MAIN_VALUE.atk.weapon[3]*(1-B.GEAR_VARIANCE+.1*B.GEAR_VARIANCE*2)));
assert.ok(forgedPiece.special&&['crit','lifesteal','thorns','xpPct'].includes(forgedPiece.special.stat),'a lucky special roll grants one special');
const barePiece=B.rollGearItem(2,()=>.9,.1,'armor');
assert.equal(barePiece.special,null,'a failed special roll leaves the piece clean');
assert.ok(['hp','def'].includes(barePiece.main.stat));
assert.equal(B.rollGearItem(9,()=>.5).tier,5,'tiers clamp to 5');
assert.equal(B.rollGearItem(0,()=>.5).tier,1,'tiers clamp to 1');
const dropShape={profile:{form:'agumon'},enemies:[{form:'numemon'},{form:'numemon'},{form:'numemon'}]};
const bossDrop=B.pveGearDrops({...dropShape,wave:5},()=>.05);
assert.ok(bossDrop&&bossDrop.tier===2,'a stage-1 boss clear rolls a tier-2 piece at the 55% chance');
assert.equal(B.pveGearDrops({...dropShape,wave:5},()=>.9),null,'a failed boss roll drops nothing');
const botDrop=B.pveGearDrops({...dropShape,wave:2},()=>.05);
assert.ok(botDrop&&botDrop.tier<=3,'normal clears roll low-tier pieces');
const luckyRun=B.createPve({id:'lucky-pve',owner:1,room:1,profile:{...profile},now:0,random:()=>.05});
let dropEvent=null;
for(let now=500;now<25000&&!dropEvent;now+=500){const r=B.stepPve(luckyRun,now,()=>.05);dropEvent=r?.events.find(e=>e.type==='wave_clear'&&e.gearDrop)||null}
assert.ok(dropEvent,'a lucky clear announces its gear drop in the wave_clear event');
assert.equal(luckyRun.earned.gear,1);assert.ok(dropEvent.gearDrop.kind&&dropEvent.gearDrop.main.value>=1);
// Ring matches stay free and apply +XP% per fighter.
const gearMatch=B.createPvp({id:'pvp-gear',room:1,now:0,players:[{id:1,name:'A',profile:{form:'agumon',level:5,stats:{power:5,guard:3},gear:{xpPct:25}}},{id:2,name:'B',profile:{form:'patamon',level:5,stats:{power:5,guard:3}}}]});
B.acceptPvp(gearMatch,1,0);B.acceptPvp(gearMatch,2,0);B.finishPvp(gearMatch,1,'knockout',0);
const gearRewards=B.pvpRewards(gearMatch);
assert.equal(gearRewards[1].xp,Math.round((4+B.stageRank('agumon'))*1.25),'the winner\'s +XP% applies');
assert.equal(gearRewards[2].xp,1,'the loser without gear keeps the base xp');
// v382: bosses are mechanic fights, a raid is one long boss, and ring matches scale health.
const ticker=run=>{const step=()=>{run.nextAt=Math.min(run.nextAt,0);const out=B.stepPve(run,1e9,()=>.5);return out?out.events:[]};return step};
{const mechRun=B.createPve({id:'mech-pve',owner:1,room:1,profile:strongProfile,now:0,random:()=>.5});
 mechRun.wave=4;mechRun.phase='between';mechRun.nextAt=0;
 let events=B.stepPve(mechRun,1e9,()=>.5).events;
 assert.equal(mechRun.wave,5);assert(mechRun.enemies[0].boss);assert(mechRun.mech,'a boss wave carries mechanic state');
 const boss=mechRun.enemies[0];
 const step=()=>{mechRun.nextAt=0;return B.stepPve(mechRun,1e9,()=>.5)?.events||[]};
 boss.hp=Math.round(boss.maxHp*.6);events=step();
 assert(events.some(e=>e.type==='boss_summon'),'a boss calls adds at 66%');assert.equal(mechRun.enemies.length,2,'a solo boss summons one add');
 boss.hp=Math.round(boss.maxHp*.3);const phaseEvents=events.concat(step());
 assert(phaseEvents.some(e=>e.type==='boss_shield'&&e.on===true),'a boss shields at half health');
 assert(phaseEvents.some(e=>e.type==='boss_enrage'),'a boss enrages at a third of its health');
 let expired=false,defBefore=0;
 for(let i=0;i<8&&!expired;i++){boss.hp=Math.round(boss.maxHp*.3);defBefore=boss.defense;const stepEvents=step();expired=stepEvents.some(e=>e.type==='boss_shield'&&e.on===false);if(mechRun.phase!=='fighting'){boss.hp=Math.round(boss.maxHp*.3)}}
 assert(expired,'the shield expires on its own');
 assert.equal(mechRun.mech.shielded,true);
 mechRun.pulse=7;boss.hp=boss.maxHp;events=step();
 assert(events.some(e=>e.type==='boss_tell'),'the boss telegraphs its slam');
 events=step();events=step();
 assert(events.some(e=>e.type==='boss_slam'),'the telegraphed slam lands');
 assert(events.some(e=>e.type==='hit'&&e.slam),'a slam is reported as a slam hit');
 const snap=B.pveSnapshot(mechRun);assert.equal(snap.mode,'grind');assert(snap.mech,'the snapshot carries mechanic state for the HUD');}
{const raid=B.createPve({id:'raid-pve',owner:1,room:1,profile:strongProfile,now:0,random:()=>.5,bossMode:true});
 assert.equal(raid.mode,'boss','a raid opens in boss mode');assert.equal(raid.enemies.length,1);assert(raid.enemies[0].boss);
 assert.equal(B.isBossWave(raid.wave),false,'the raid boss is not the wave-5 case');
 assert.equal(B.bossFight(raid),true,'bossFight covers raids');
 let ticks=0,raidEvents=[];for(let now=0;now<1e7&&raid.phase!=='ended';now+=B.TICK_MS){ticks++;const out=B.stepPve(raid,now,()=>.5);if(out)raidEvents.push(...out.events)}
 assert.equal(raid.reason,'complete','a raid ends after its single boss');
 assert(ticks>=20&&ticks<=120,'a raid is a long fight, not a mob wave: '+ticks+' ticks');
 const raidKinds=new Set(raidEvents.map(e=>e.type));
 for(const kind of ['boss_tell','boss_slam','boss_shield','boss_enrage','boss_summon'])assert(raidKinds.has(kind),'a raid shows every mechanic: '+kind);
 assert(raid.earned.gear>=1,'a raid always pays one gear piece');
 assert(raid.earned.coins>=80+B.stageRank(raid.profile.form)*12,'raid coins beat a stage boss');
 assert.equal(B.pveSnapshot(raid).mode,'boss');}
{const pvpScale=B.createPvp({id:'pvp-scale',room:1,now:0,players:[{id:1,name:'A',profile:{form:'agumon',level:5,stats:{power:5,guard:3}}},{id:2,name:'B',profile:{form:'patamon',level:5,stats:{power:5,guard:3}}}]});
 const preview=B.combatPreview('agumon',{level:5,stats:{power:5,guard:3}}),unit=pvpScale.participants[0].unit;
 assert.equal(unit.maxHp,Math.round(preview.maxHp*B.PVP_HP_SCALE),'ring health is scaled');
 assert.equal(unit.attack,Math.round(preview.attack*B.PVP_ATK_SCALE),'ring attack is scaled');
 assert.ok(B.PVP_HP_SCALE>B.PVP_ATK_SCALE,'ring health outgrows ring attack so fights last');
 B.acceptPvp(pvpScale,1,0);B.acceptPvp(pvpScale,2,0);B.stepPvp(pvpScale,B.COUNTDOWN_MS,()=>.5);
 let rounds=0;while(pvpScale.phase==='fighting'&&rounds<200){rounds++;B.stepPvp(pvpScale,pvpScale.nextAt,()=>.5)}
 assert.equal(pvpScale.phase,'result','a scaled ring match still settles');assert(rounds>=12,'ring matches run longer than a few blows: '+rounds+' rounds');}
console.log('digimon_battle_sim: PASS (per-form stats, meter-free waves, free PvP, 4-slot profiles, stages, boss mechanics, boss raids, scaled rings, spread ranges, equipment, three-trainer party runs)');
