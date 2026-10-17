// Cosmetic gap swings exercise the real page: no combat work or random rolls.
const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;let passed=0;
const test=(name,fn)=>{fn();passed++;console.log('ok '+name)};
function setup(cls='Guillotine Cross'){
 ev(`S=fresh();S.cls=${JSON.stringify(cls)};S.lv=150;S.pets=[];S.auto=false;S.adv=false;
 for(const name of lineOf(S.cls))S.jobs[name]={jl:CLASSES[name].mj,jx:0};
 S.sk=Object.fromEntries(SKILLS.filter(s=>s.cls.includes(S.cls)).map(s=>[s.id,s.max]));
 S.skOff=Object.fromEntries(SKILLS.filter(s=>s.type==='buff').map(s=>[s.id,true]));
 S.st.agi=120;S.st.dex=120;S.hp=maxHp();resetSkillRuntime();for(const k in skCd)delete skCd[k];
 TRIAL.on=true;TRIAL.left=1e9;t=1;pl.x=0;pl.z=0;pAtkT=0;swing=null;atkAnim=0;
 mob={x:0,z:0,hx:0,hz:0,pack:0,size:1,hp:1e12,max:1e12,atk:0,at:1e9,spawn:1,fixed:true};mobs=[mob];activePack=0;camps=[];
 const r=skillState();r.comboSlots=rotationSkills().map(s=>s.id);r.cursor=1;r.nextCastAt=1.5;r.recoverUntil=0;
 Math.random=()=>.5;floats=[];shots=[];`);
}
try{
 test('gap swings animate at ASPD but neither creation nor impact consumes combat RNG',()=>{
  setup();ev(`window.normalAspd=C().aspd;C().aspd=.1;Math.random=()=>{throw Error('cosmetic swing consumed combat RNG')};
   window.before=JSON.stringify({S,mob,skCd,r:skillState(),petBuff,shots,floats});
   playerAttack();window.cosmetic=swing;`);
  assert.equal(ev('cosmetic.visualOnly'),true);assert.equal(ev('atkAnim'),1);
  assert.equal(ev('swingDur'),ev('swingLength()'));
  assert.equal(ev('pAtkT'),ev('aspd()'));
  ev('resolveSwing(cosmetic)');
  assert.equal(ev('JSON.stringify({S,mob,skCd,r:skillState(),petBuff,shots,floats})'),ev('window.before'));
  ev('C().aspd=normalAspd');
 });
 test('cosmetic impact does no targeting, damage, healing, proc, skill or projectile work',()=>{
  setup();ev(`window.called=[];window.originalCombat=Object.fromEntries(['strike','hurt','skillHit','applyLeech','shot','castSkill'].map(k=>[k,window.eval(k)]));
   for(const k of Object.keys(originalCombat))window.eval(k+'=()=>{called.push('+JSON.stringify(k)+');throw Error("cosmetic combat work")}');
   const other={x:1,z:1,hp:99,pack:4};window.oldMob=mob;window.oldState=JSON.stringify(S);
   Math.random=()=>{throw Error('cosmetic RNG')};resolveSwing({visualOnly:true,target:other,pack:4,casts:[],double:true});`);
  assert.equal(ev('called.length'),0);assert.equal(ev('mob===oldMob'),true);
  assert.equal(ev('JSON.stringify(S)'),ev('oldState'));
  ev('for(const [k,fn]of Object.entries(originalCombat))window[k]=fn');
 });
 test('class/account replacement or dead target cannot turn an outstanding visual swing into damage',()=>{
  setup();ev(`window.pendingVisual={visualOnly:true,casts:[],target:mob,pack:0,double:true};mob.hp=0;
   currentUser='other-owner';S=fresh();S.cls='Warlock';window.ownerState=JSON.stringify(S);window.target=mob;
   Math.random=()=>{throw Error('stale cosmetic RNG')};resolveSwing(pendingVisual);`);
  assert.equal(ev('JSON.stringify(S)'),ev('ownerState'));assert.equal(ev('target.hp'),0);
 });
 test('pausing a queued skill cancels its impact instead of falling back to a basic',()=>{
  setup('Lord Knight');ev(`skillState().comboSlots=null;skillState().nextCastAt=0;skillState().cursor=0;playerAttack();window.pendingSkill=swing;
   comboConfig().enabled=false;window.unchanged=JSON.stringify([S,mob]);resolveSwing(pendingSkill);`);
  assert.ok(ev('pendingSkill.casts.length>0'));assert.equal(ev('JSON.stringify([S,mob])'),ev('unchanged'));
  assert.equal(ev('dmgGroup'),null);
 });
 test('every offensive class has zero basic strikes during its burst and keeps recovery attacks',()=>{
  const classes=Array.from(ev('Object.keys(CLASSES)'));
  for(const cls of classes){
   setup(cls);if(!ev('rotationSkills().length'))continue;
   ev(`skillState().comboSlots=null;skillState().cursor=0;skillState().nextCastAt=0;
    t=0;window.casts=[];window.basics=[];window.visuals=[];window.oldCast=castSkill;window.oldStrike=strike;window.oldPlayerAttack=playerAttack;
    castSkill=s=>casts.push({id:s.id,t});strike=()=>basics.push({t,burst:!!skillState().comboSlots,recoverUntil:skillState().recoverUntil});
    playerAttack=()=>{oldPlayerAttack();if(swing?.visualOnly)visuals.push({t,d:swingDur})};
    for(let i=0;i<600;i++){update(1/60);floats.length=0;shots.length=0;}`);
   assert.ok(ev('casts.length>0'),cls+' casts');
   assert.equal(ev('basics.filter(b=>b.burst&&b.t>=b.recoverUntil).length'),0,cls+' no basic damage inside combo');
   assert.ok(ev('basics.some(b=>b.t<b.recoverUntil)'),cls+' recovery retains basic attacks');
   ev('castSkill=oldCast;strike=oldStrike;playerAttack=oldPlayerAttack');
  }
 });
 test('native/fallback pose clock advances through each visual swing without changing combat state',()=>{
  setup();ev(`window.savedAspd=C().aspd;C().aspd=.1;playerAttack();window.duration=swingDur;window.points=[];
   for(const progress of [0,.25,.5,.75,.99]){atkAnim=1-progress;points.push(skinSwingMs({total:{attack:.8}}))};C().aspd=savedAspd;`);
  const points=Array.from(ev('points'));assert.equal(points[0],0);
  for(let i=1;i<points.length;i++)assert.ok(points[i]>points[i-1]);
  assert.ok(points.at(-1)<800);assert.equal(ev('S.dmg||0'),0);
 });
 console.log(passed+' cosmetic-combo checks passed');
}finally{g.close()}
