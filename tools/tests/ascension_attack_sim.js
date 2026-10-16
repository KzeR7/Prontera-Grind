// Run the real update loop with native Ascension monsters at the edge of attack range.
const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;
let passed=0;
function setup(cls,map,boss){
 ev(`S=fresh();S.cls=${JSON.stringify(cls)};S.lv=150;S.mp=${map};S.lvl=${boss?5:1};S.auto=false;S.adv=false;S.pets=[];S.sk={};S.st.agi=120;
  t=10;tb={};for(const k in skCd)delete skCd[k];resetSkillRuntime();swing=null;atkAnim=0;pAtkT=0;TRIAL.on=false;astralJourney=null;spawn();
  mob=mobs.find(m=>m.boss===${boss});mobs=[mob];camps=[];activePack=mob.pack;
  mob.hp=mob.max=1e12;mob.atk=0;mob.at=1e9;mob.fixed=true;mob.spawn=1;mob.a=0;mob.z=mob.hz=0;
  pl.x=0;pl.z=0;standC={t:-9,r:0};mob.x=mob.hx=heroStandoff(mob)+.64;engageTgt=mob;engageWait=0;pAtkT=0;S.hp=maxHp();S.dmg=0;`);
}
try{
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
