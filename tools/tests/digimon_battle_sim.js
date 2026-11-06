// Deterministic combat rules: same-stage groups, wave regeneration and server-owned PvP timing.
const assert=require('node:assert/strict');
const B=require('../../assets/digimon-battle.js');
const R=require('../../assets/digimon/roster.js');
const profile={lineId:'agumon',form:'agumon',level:5,xp:16,wins:0,mastery:0,fatigue:0,fullness:70,stats:{power:12,guard:12,agility:0,focus:0}};
const run=B.createPve({id:'test-pve',owner:1,room:1,profile,now:0,random:()=>.5});
assert.equal(run.enemies.length,3,'a wave is a group');
assert(run.enemies.every(e=>R.entry(e.form).stage==='Rookie'),'bots match the partner stage');
let clears=0;
for(let now=500;now<18000&&run.wave<2;now+=500){const result=B.stepPve(run,now,()=>.5);if(result)clears+=result.events.filter(e=>e.type==='wave_clear').length}
assert.equal(run.wave,2,'a new group is spawned after the whole group dies');
assert.equal(clears,1,'the first group settles once');
assert(run.enemies.every(e=>R.entry(e.form).stage==='Rookie'),'regenerated bots retain stage matching');
const frozen=B.stepPve(run,0,()=>.5);assert.equal(frozen,null,'time cannot run backwards or duplicate a wave');
const match=B.createPvp({id:'test-pvp',room:1,now:0,players:[{id:1,name:'One',profile},{id:2,name:'Two',profile:{...profile,lineId:'palmon',form:'palmon',stats:{power:0,guard:0,agility:0,focus:0}}}]});
assert.equal(match.phase,'offer');B.acceptPvp(match,1,0);assert.equal(match.phase,'offer','one acceptance is not enough');
B.acceptPvp(match,2,0);assert.equal(match.phase,'countdown');assert.equal(match.countdownUntil,3000,'the countdown is exactly three seconds');
assert.equal(B.stepPvp(match,2999,()=>.5).events.some(e=>e.type==='fight'),false);assert.equal(B.stepPvp(match,3000,()=>.5).events[0].type,'fight');
for(let now=3500;now<70000&&match.phase!=='result';now+=500)B.stepPvp(match,now,()=>.5);
assert.equal(match.phase,'result','PvP auto-fights to a result without command messages');assert(match.winnerId===1||match.winnerId===2||match.winnerId===null);
const rewards=B.pvpRewards(match);assert.deepEqual(Object.keys(rewards).sort(),['1','2']);assert(rewards[1].coins>=0&&rewards[2].coins>=0);assert.equal(B.pvpRewards(match),rewards,'settlement is stable and idempotent');
const before=match.winnerId;B.stepPvp(match,70000,()=>.5);assert.equal(match.winnerId,before,'later ticks cannot change a settled winner');
const clamped=B.profile({form:'agumon',level:99999,stats:{power:999,guard:-4},fullness:-10,fatigue:1000});assert.equal(clamped.level,1000);assert.equal(clamped.stats.power,12);assert.equal(clamped.stats.guard,0);assert.equal(clamped.fullness,0);assert.equal(clamped.fatigue,100);
console.log('PASS Digimon battle: same-stage random groups, repeatable wave settlement, mutual three-second PvP countdown, automatic result, stable rewards and clamped profiles');
