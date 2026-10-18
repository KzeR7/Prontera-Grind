// Real reward helpers, spawn definitions and away route; no copied reward formulas.
const assert=require('node:assert/strict'),{createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;
try{
 ev(`S=fresh();S.cls='Rune Knight';S.lv=150;S.auto=false;S.adv=false;Math.random=()=>.5;`);
 const abyss=ev(`S.mp=9;S.lvl=15;minionDef(0)`);
 for(const m of [10,11]){
  let previous=1;
  for(let s=1;s<=5;s++){
   ev(`S.mp=${m};S.lvl=${s};spawn()`);
   const regular=ev('mobs.find(o=>!o.boss)'),away=ev('offlineMobForCurrentField()');
   assert.equal(regular.exp,away.exp);assert.equal(regular.zeny,away.zeny);
   const efficiency=regular.exp/abyss.exp;
   assert.ok(efficiency>previous,'deeper stages pay more per kill');previous=efficiency;
   assert.ok(Math.abs(efficiency-ev(`ascRewardBonus(${m},${s})`))<1/abyss.exp);
   const lo=m===10?3:7,hi=m===10?8:15;
   assert.ok(efficiency>=lo-1/abyss.exp&&efficiency<=hi+1/abyss.exp,'v172: Astral pays 3–8x the anchor per kill, Thor 7–15x');
   assert.ok(Math.abs(ev('fieldExpReward(S.mp,S.lvl,true)')-regular.exp*4)<=3);
   for(const boss of [false,true])for(const roll of [0,.5,.999999]){
    ev(`Math.random=()=>${roll}`);
    const base=ev(`fieldZenyReward(9,15,${boss})`),actual=ev(`fieldZenyReward(${m},${s},${boss})`);
    assert.ok(actual/base>=2.6-1/base&&actual/base<=3.9+1/base,'Zeny is 2.6–3.9× per kill after the approved 30% increase');
    const oldBonus=(m===10?[2,2.1,2.2,2.3,2.4]:[2.4,2.55,2.7,2.85,3])[s-1];
    assert.equal(actual,Math.round(base*(oldBonus*1.3)),'all stages and enemy types receive exactly the 30% base Zeny increase');
   }
   ev('Math.random=()=>.5');
   if(s===5){const boss=ev('mobs.find(o=>o.boss)');assert.ok(Math.abs(boss.exp-regular.exp*4)<=3);ev('Math.random=()=>0');assert.equal(ev('offlineMobForCurrentField().boss'),true);assert.equal(ev('offlineMobForCurrentField().zeny'),ev('fieldZenyReward(S.mp,S.lvl,true)'));ev('Math.random=()=>.5');}
  }
 }
 // Ordinary maps retain the original random ranges, multipliers and integer rounding.
 for(let m=0;m<10;m++)for(let s=1;s<=15;s++)for(const boss of [false,true]){
  const actual=ev(`fieldZenyReward(${m},${s},${boss})`);
  const legacy=ev(`(()=>{const l=fieldPower(${m},${s}),r=${boss} ? BZK:ZK;return Math.max(ZMIN,Math.floor(ri(r[0],r[1])*l*l/1000*(${s}>10?(${boss}?NMZENY:nmZenyOf(${s}))*nmPayOf(${m},${s},2):1)))})()`);
  assert.equal(actual,legacy);
 }
 ev(`S.mp=10;S.lvl=1;spawn();window.xp=Math.round(mobs[0].exp*expRate());kill(mobs[0]);`);
 assert.equal(ev('ascState().xp+Array.from({length:ascState().level},(_,i)=>ascNeed(i)).reduce((a,b)=>a+b,0)'),ev('window.xp'));
 assert.equal(ev('ascState().skills[S.cls].xp+Array.from({length:ascState().skills[S.cls].level},(_,i)=>ascNeed(i,true)).reduce((a,b)=>a+b,0)'),ev('window.xp'));
 for(const skills of [false,true]){
  let previous=0;for(let level=0;level<(skills?30:50);level++){const n=ev(`ascNeed(${level},${skills})`);assert.ok(n>previous&&n%1000===0);previous=n;}
 }
 const shared=ev('Array.from({length:50},(_,i)=>ascNeed(i)).reduce((a,b)=>a+b,0)'),skills=ev('Array.from({length:30},(_,i)=>ascNeed(i,true)).reduce((a,b)=>a+b,0)');
 assert.ok(Math.abs(shared/84000000-666.7)<.1,'v172: shared track targets about 667h at the 1.4M EXP/min the retuned top field sustains');
 assert.ok(Math.abs(skills/84000000-83.3)<.1,'v172: each class skill track targets about 83h at the same rate');
 assert.ok(shared/skills>7.99&&shared/skills<8.01,'shared track is about eight class skill tracks');
 console.log('PASS: ten Ascension reward stages, live/away parity, boss EXP 4×, Zeny +30% across every stage and regular/MVP roll, 300 original Zeny cases, actual kill credits both tracks, increasing EXP curves.');
}finally{g.close()}
