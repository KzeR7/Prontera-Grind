// Deterministic combat rules: per-form base stats, energy-gated waves and server-owned PvP timing.
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
assert.equal(run.profile.energy,68,'a cleared wave spends energy');
const frozen=B.stepPve(run,0,()=>.5);assert.equal(frozen,null,'time cannot run backwards or duplicate a wave');
// Energy gates the grind: below the floor the run ends instead of spawning another group.
const tiredRun=B.createPve({id:'tired-pve',owner:1,room:1,profile:{...profile,energy:B.ENERGY_PVE_MIN},now:0,random:()=>.5});
let tiredEnd=null;for(let now=500;now<18000&&!tiredEnd;now+=500){const result=B.stepPve(tiredRun,now,()=>.5);tiredEnd=result?.events.find(e=>e.type==='end')||null}
assert.equal(tiredRun.phase,'ended');assert.equal(tiredRun.reason,'exhausted','running dry ends the grind with an explicit reason');
assert.equal(tiredEnd.reason,'exhausted');
// Zeroed deterministic rolls force every bonus drop: three per-bot petgold rolls and eggs.
const dropRun=B.createPve({id:'drop-pve',owner:1,room:1,profile,now:0,random:()=>0});let dropClear=null;
for(let now=500;now<18000&&!dropClear;now+=500){const result=B.stepPve(dropRun,now,()=>0);dropClear=result?.events.find(e=>e.type==='wave_clear')||null}
assert(dropClear,'forced drop wave clears');assert.equal(dropClear.reward.eggs,3,'each defeated bot can drop a Digi-Egg');assert(dropClear.reward.dropCoins>0,'bonus petgold is rolled per defeated bot');
assert.equal(dropClear.reward.coins,10+B.stageRank(dropRun.profile.form)*4+dropClear.reward.dropCoins,'bonus petgold is added to the authoritative wave reward');
assert.equal(dropRun.earned.eggs,3);assert.equal(dropRun.earned.dropCoins,dropClear.reward.dropCoins);assert.equal(B.pveSnapshot(dropRun).earned.eggs,3,'snapshots expose earned eggs for the live HUD');
assert.equal(B.pveSnapshot(dropRun).profile.energy,dropRun.profile.energy,'snapshots expose energy for the live HUD');
const match=B.createPvp({id:'test-pvp',room:1,now:0,players:[{id:1,name:'One',profile},{id:2,name:'Two',profile:{...profile,lineId:'palmon',form:'palmon',stats:{power:0,guard:0,agility:0,focus:0}}}]});
assert.equal(match.phase,'offer');B.acceptPvp(match,1,0);assert.equal(match.phase,'offer','one acceptance is not enough');
B.acceptPvp(match,2,0);assert.equal(match.phase,'countdown');
assert.equal(match.countdownUntil,3000,'the countdown is exactly three seconds');
assert.equal(B.stepPvp(match,2999,()=>.5).events.some(e=>e.type==='fight'),false);assert.equal(B.stepPvp(match,3000,()=>.5).events[0].type,'fight');
for(let now=3500;now<70000&&match.phase!=='result';now+=500)B.stepPvp(match,now,()=>.5);
assert.equal(match.phase,'result','PvP auto-fights to a result without command messages');assert(match.winnerId===1||match.winnerId===2||match.winnerId===null);
const rewards=B.pvpRewards(match);assert.deepEqual(Object.keys(rewards).sort(),['1','2']);assert(rewards[1].coins>=0&&rewards[2].coins>=0);assert.equal(rewards[1].energy,0,'ring matches are free of energy costs');assert.equal(B.pvpRewards(match),rewards,'settlement is stable and idempotent');
const before=match.winnerId;B.stepPvp(match,70000,()=>.5);assert.equal(match.winnerId,before,'later ticks cannot change a settled winner');
// Legacy saves keep working: an old fatigue/fullness profile migrates into energy on read.
const legacy=B.profile({form:'agumon',level:99999,stats:{power:999,guard:-4},fullness:-10,fatigue:1000});
assert.equal(legacy.level,1000);assert.equal(legacy.stats.power,12);assert.equal(legacy.stats.guard,0);assert.equal(legacy.energy,0,'impossible legacy meters collapse to an empty energy bar');
assert.equal(B.profile({form:'agumon',fullness:60,fatigue:20}).energy,70,'a healthy legacy profile migrates to a fair energy level');
// Four partner slots travel with the profile and are clamped server-side.
assert.equal(B.profile({form:'agumon',slot:3}).slot,3);assert.equal(B.profile({form:'agumon',slot:9}).slot,B.MAX_SLOT);assert.equal(B.profile({form:'agumon',slot:-2}).slot,0);
// v350 field stages: five waves per stage, boss on every fifth, one named stage up.
assert.equal(B.stageOf(1),1);assert.equal(B.stageOf(5),1);assert.equal(B.stageOf(6),2);assert.equal(B.stageOf(10),2);assert.equal(B.stageOf(11),3);assert.equal(B.stageOf(0),1);assert.equal(B.stageOf(-3),1);
assert.deepEqual([1,4,5,6,9,10,11,15].map(w=>B.isBossWave(w)),[false,false,true,false,false,true,false,true]);
assert.equal(B.BOSS_EVERY,5);
// Presentation ranges are deterministic per form: brawlers press in, quick forms skirmish.
const meleeRange=B.attackRange('agumon'),rangedRange=B.attackRange('birdramon');
assert.equal(meleeRange.ranged,false);assert.equal(meleeRange.range,1.8);
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
console.log('digimon_battle_sim: PASS (per-form stats, energy waves, free PvP, 4-slot profiles, stages, bosses, ranges)');
