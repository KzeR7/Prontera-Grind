// Run the real update loop with native Ascension monsters at the edge of attack range.
const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;
let passed=0;
function setup(cls,map,boss){
 ev(`S=fresh();S.cls=${JSON.stringify(cls)};S.lv=150;S.mp=${map};S.lvl=${boss?5:1};S.auto=false;S.adv=false;S.pets=[];S.sk={};S.st.agi=120;
  // Test movement/re-engagement, not a random first-swing MISS at fresh DEX 1.
  // Keep the real strike/damage path; DEX 120 makes missCh() zero.
  S.st.dex=120;
  t=10;tb={};for(const k in skCd)delete skCd[k];resetSkillRuntime();swing=null;atkAnim=0;pAtkT=0;TRIAL.on=false;astralJourney=null;spawn();
  mob=mobs.find(m=>m.boss===${boss});mobs=[mob];camps=[];activePack=mob.pack;
  mob.hp=mob.max=1e12;mob.atk=0;mob.at=1e9;mob.fixed=true;mob.spawn=1;mob.a=0;mob.z=mob.hz=0;
  pl.x=0;pl.z=0;standC={t:-9,r:0};mob.x=mob.hx=heroStandoff(mob)+.64;engageTgt=mob;engageWait=0;pAtkT=0;S.hp=maxHp();S.dmg=0;`);
}
try{
 // Owner request (2026-10-24): the monsters the Ascension fields actually spawn must be sized
 // against the character. This runs the real spawn() - not a fixture - so the map index the
 // renderer reads is proved to be on the live objects.
 for(const map of [10,11])for(const stage of [1,3,5]){
  ev(`S=fresh();S.cls='Rune Knight';S.lv=150;S.mp=${map};S.lvl=${stage};TRIAL.on=false;JOB_RITE.on=false;spawn();mobs.forEach(m=>m.spawn=1)`);
  const probe=JSON.parse(ev(`JSON.stringify({kept:ASCENSION_KEPT_VISUAL,hero:HERO_VISUAL_HEIGHT,boss:ASCENSION_BOSS_VISUAL,
    mobs:mobs.map(m=>({n:m.n,boss:!!m.boss,mapIndex:m.mapIndex,spriteId:m.spriteId,
      drawn:3.05*mobVisualScale(m)*ASCENSION_FRAME_PX[m.spriteId][0]/ASCENSION_FRAME_PX[m.spriteId][1]}))})`));
  const regulars=probe.mobs.filter(m=>!m.boss),boss=probe.mobs.find(m=>m.boss);
  assert.ok(probe.mobs.length>=2,`map ${map} stage ${stage}: the field must have monsters`);
  assert.ok(probe.mobs.every(m=>m.mapIndex===map),`map ${map} stage ${stage}: live monsters must carry their map index`);
  for(const m of regulars){
   const target=probe.kept[m.spriteId]||probe.hero;
   assert.ok(Math.abs(m.drawn-target)<1e-9,`map ${map} stage ${stage}: ${m.n} stands at ${m.drawn.toFixed(2)}, not ${target}`);
  }
  if(boss){
   assert.ok(Math.abs(boss.drawn-probe.boss)<1e-9,`map ${map} stage ${stage}: ${boss.n} is not at the Ascension MVP height`);
   for(const m of regulars)assert.ok(boss.drawn>m.drawn*1.4,`map ${map}: ${boss.n} is not clearly bigger than ${m.n}`);
  }
  const shown=[...new Map([...regulars,...(boss?[boss]:[])].map(m=>[m.n,m])).values()];
  console.log(`ok map ${map} stage ${stage}: live spawn ${shown.map(m=>m.n+' '+m.drawn.toFixed(2)).join(', ')}`);
 }
 for(const cls of ['Rune Knight','Warlock','Ranger','Guillotine Cross','Arch Bishop','Mechanic'])for(const map of [10,11])for(const boss of [false,true]){
  setup(cls,map,boss);
  assert.ok(ev('Math.hypot(mob.x-pl.x,mob.z-pl.z)>heroStandoff(mob)+.6'),'target starts just outside reach');
  ev('update(1/60)');
  assert.ok(ev('pl.x>0'),`${cls} map ${map} boss ${boss}: close the gap immediately`);
  ev('for(let i=0;i<30;i++){update(1/60);floats.length=0;shots.length=0;}');
  assert.ok(ev('S.dmg>0'),`${cls} map ${map} boss ${boss}: resume attacking within half a second`);
  // A target drifting out again should not reintroduce the old one-second wait.
  ev('mob.x=mob.hx=pl.x+heroStandoff(mob)+.64;window.priorX=pl.x;update(1/60)');
  assert.ok(ev('pl.x>priorX'),`${cls}: follow repeated range drift immediately`);
  // Once in range, stand and trade; this fix must not bring back kiting.
  ev('mob.x=mob.hx=pl.x+heroStandoff(mob);window.holdX=pl.x;window.holdZ=pl.z;for(let i=0;i<120;i++){update(1/60);floats.length=0;shots.length=0;}');
  assert.ok(ev('pl.x===holdX&&pl.z===holdZ'),`${cls}: hold position while in range`);
  passed++;console.log(`ok ${cls}, map ${map}, ${boss?'MVP':'regular'}: close, attack, follow drift, hold`);
 }
 console.log(`${passed} Ascension attack checks passed`);
}finally{g.close()}
