// Execute the shipped combo engine and editor, including save/account boundaries.
const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;let passed=0;
function test(name,fn){fn();passed++;console.log('  ok '+name)}
function setup(cls='Lord Knight'){
 ev(`S=fresh();S.cls=${JSON.stringify(cls)};for(const n of lineOf(S.cls))S.jobs[n]={jl:CLASSES[n].mj,jx:0};S.sk=Object.fromEntries(SKILLS.filter(s=>s.cls.includes(S.cls)).map(s=>[s.id,s.max]));S.skOff={};resetSkillRuntime();for(const k in skCd)delete skCd[k];t=0;pAtkT=0;swing=null;pl.x=0;pl.z=0;mob={x:0,z:0,hp:1e12,max:1e12,pack:0,size:1};mobs=[mob];activePack=0;window.castLog=[];window.originalCast=castSkill;castSkill=(s,k)=>castLog.push([s.id,k]);`);
}
function cast(time){ev(`t=${time};playerAttack();if(swing.casts.length)resolveSwing(swing);swing=null;`)}
try{
 test('all 19 classes get at most six unique inherited attacks, buffs never occupy slots',()=>{
  for(const cls of ev('Object.keys(CLASSES)')){setup(cls);assert.ok(ev('rotationSkills().length<=6&&new Set(rotationSkills().map(s=>s.id)).size===rotationSkills().length&&rotationSkills().every(s=>s.type==="act"&&s.cls.includes(S.cls))'));ev('castSkill=originalCast');}
 });
 test('casts follow saved order at full power; completion forces recovery',()=>{
  setup();ev(`comboConfig().slots=['provoke','endure','bowl','pierce','spiral','bash']`);
  for(let i=0;i<6;i++)cast(i*.5);
  assert.equal(ev('castLog.map(x=>x[0]).join()'),'provoke,endure,bowl,pierce,spiral,bash');assert.ok(ev('castLog.every(x=>x[1]===1)'));
  assert.equal(ev('skillState().recoverUntil'),5.5);cast(5.49);assert.equal(ev('castLog.length'),6);
  ev('for(const k in skCd)delete skCd[k]');cast(5.5);assert.equal(ev('castLog.length'),7);
 });
 test('real update loop spaces casts and rests for three seconds at fast and slow ASPD',()=>{
  for(const agi of [1,120]){
   setup();ev(`S.st.agi=${agi};S.adv=false;S.auto=false;TRIAL.on=true;TRIAL.left=1e9;mob.fixed=true;mob.at=1e9;mob.atk=0;mob.hx=0;mob.hz=0;mob.a=0;mob.spawn=1;S.hp=maxHp();comboConfig().slots=['bash','endure','bowl','pierce','spiral','mbrk'];window.times=[];castSkill=s=>times.push({id:s.id,t});`);
   ev('for(let i=0;i<600;i++){update(1/60);floats.length=0;shots.length=0;}');
   const times=JSON.parse(ev('JSON.stringify(times)'));assert.ok(times.length>=7,'two bursts should occur');
   assert.deepEqual(times.slice(0,6).map(x=>x.id),['bash','endure','bowl','pierce','spiral','mbrk']);
   for(let i=1;i<6;i++)assert.ok(times[i].t-times[i-1].t>=.49&&times[i].t-times[i-1].t<.56,'cast spacing '+agi+': '+(times[i].t-times[i-1].t));
   assert.ok(times[6].t-times[5].t>=3,'recovery must finish before next impact');ev('TRIAL.on=false');
  }
 });
 test('cooldowns belong to skills and adding attacks cannot change them',()=>{
  setup();ev(`comboConfig().slots=['bash',null,null,null,null,null]`);cast(0);assert.equal(ev('skCd.bash'),2);
  ev(`comboConfig().slots[1]='spiral'`);assert.equal(ev('skCd.bash'),2);
 });
 test('cooldown and out-of-range entries skip without blocking later attacks',()=>{
  setup('High Wizard');ev(`comboConfig().slots=['fire','nap','fireball',null,null,null];skCd.fire=10;mob.x=6;SKILLS.find(s=>s.id==='nap').rng=1`);cast(0);
  assert.equal(ev('castLog[0][0]'),'fireball');assert.equal(ev('skillState().recoverUntil'),3);ev(`SKILLS.find(s=>s.id==='nap').rng=6`);
 });
 test('editing and pause/resume cannot bypass recovery; a burst keeps its starting order',()=>{
  setup();ev(`comboConfig().slots=['bash','endure',null,null,null,null]`);cast(0);ev(`ACT.comboassign('1:spiral')`);cast(.5);
  assert.equal(ev('castLog.map(x=>x[0]).join()'),'bash,endure');ev('ACT.combopause();ACT.combopause();ACT.combofill()');cast(1);assert.equal(ev('castLog.length'),2);
 });
 test('basic attacks remain available throughout recovery',()=>{
  setup();ev(`comboConfig().slots=['bash',null,null,null,null,null]`);cast(0);
  ev(`window.basicCount=0;window.savedStrike=strike;strike=()=>basicCount++;t=1;playerAttack();resolveSwing(swing);strike=savedStrike`);assert.equal(ev('basicCount'),1);
 });
 test('buff refresh is independent, respects cooldown and does not waste offensive slots',()=>{
  setup('Whitesmith');ev('tickCombatSkills(.01)');assert.ok(ev('!!skillState().buffs.adren&&!!skillState().buffs.thrust&&!skillState().buffs.ovthrust'));
  assert.equal(ev('skCd.thrust'),ev(`SKILLS.find(s=>s.id==='thrust').cd`));assert.equal(ev('castLog.length'),0);
  ev(`skillState().buffs.thrust.left=1;skCd.thrust=0;tickCombatSkills(.01)`);assert.ok(ev('skillState().buffs.thrust.left<1'),'no early refresh');
  ev('tickCombatSkills(.6)');assert.ok(ev('skillState().buffs.thrust.left>1'),'refresh near expiry');
 });
 test('field spawns preserve recovery; new save objects reset transient state',()=>{
  setup();ev(`comboConfig().slots=['bash',null,null,null,null,null]`);cast(0);ev('resetSkillRuntime(true)');assert.equal(ev('skillState().recoverUntil'),3);
  ev('S=JSON.parse(JSON.stringify(S))');assert.equal(ev('skillState().recoverUntil'),0);
 });
 test('invalid, foreign, passive and duplicate saved slots are sanitized',()=>{
  setup();assert.equal(ev(`JSON.stringify(cleanSkillCombos({'Lord Knight':{enabled:false,slots:['fire','bash','bash','aura','fake','spiral']},Mage:{slots:'bad'}}))`),JSON.stringify({'Lord Knight':{enabled:false,slots:[null,'bash',null,null,null,'spiral']}}));
  ev(`ACT.comboassign('0:fire');ACT.comboassign('0:aura');ACT.comboassign('0:fake')`);assert.ok(ev('!comboConfig().slots.includes("fire")&&!comboConfig().slots.includes("aura")'));
 });
 test('auto-fill still chooses learned attacks while their auto-cast is paused',()=>{
  setup();ev('skSetAll(false);ACT.combofill()');assert.equal(ev('comboConfig().slots.filter(Boolean).length'),6);assert.equal(ev('rotationSkills().length'),0);
  ev('skSetAll(true)');assert.equal(ev('rotationSkills().length'),6);
 });
 test('duplicate selections swap positions, clearing and arrows preserve six slots',()=>{
  setup();ev(`comboConfig().slots=['bash','spiral',null,null,null,null];ACT.comboassign('0:spiral')`);assert.equal(ev('comboConfig().slots.slice(0,2).join()'),'spiral,bash');
  ev(`ACT.combomove('0:1');ACT.comboassign('0:')`);assert.equal(ev('comboConfig().slots[0]'),null);assert.equal(ev('comboConfig().slots[1]'),'spiral');assert.equal(ev('comboConfig().slots.length'),6);
 });
 test('load migrates old priority; class loadouts and account saves remain separate',()=>{
  setup('Mage');ev(`delete S.skillCombos;S.skillPriority=['nap','fire'];localStorage.setItem(saveKey(),JSON.stringify(S));S=load()`);assert.equal(ev('rotationSkills().slice(0,2).map(s=>s.id).join()'),'nap,fire');
  ev(`ACT.comboassign('0:fire');window.mageSlots=comboConfig().slots.join();S.cls='Swordman';S.sk.bash=1;comboConfig();S.cls='Mage'`);assert.equal(ev('comboConfig().slots.join()'),ev('mageSlots'));
  ev('localStorage.setItem(saveKey(),JSON.stringify(S));S=load()');assert.equal(ev('comboConfig().slots.join()'),ev('mageSlots'));
  ev(`currentUser='another-combo-account';S=load()`);assert.equal(ev('Object.keys(S.skillCombos).length'),0);
 });
 test('real class switches restore the class combo and discard queued casts',()=>{
  setup('Lord Knight');ev(`castSkill=originalCast;comboConfig().slots=['bash','spiral',null,null,null,null];window.knightCombo=comboConfig().slots.join();snapClass();S.base.Mage={lv:49,exp:0,pts:0,hp:100,st:{...S.st},eq:{}};S.jobs.Mage={jl:50,jx:0};S.sk.fire=1;changeClass('Mage');comboConfig();changeClass('Lord Knight')`);
  assert.equal(ev('S.cls'),'Lord Knight');assert.equal(ev('comboConfig().slots.join()'),ev('knightCombo'));assert.equal(ev('swing'),null);
 });
 test('editor exposes six accessible selectors and only learned class-line attacks',()=>{
  setup('Mage');ev(`tabs.length=0;openTab('skills');renderWin()`);
  assert.equal(g.window.document.querySelectorAll('[data-combo-slot]').length,6);
  assert.ok([...g.window.document.querySelectorAll('[data-combo-slot] option')].every(o=>!o.value||ev(`SKILLS.find(s=>s.id===${JSON.stringify(o.value)}).cls.includes(S.cls)`)));
  const selector=g.window.document.querySelector('[data-combo-slot="0"]');selector.value='nap';selector.dispatchEvent(new g.window.Event('change',{bubbles:true}));assert.equal(ev('comboConfig().slots[0]'),'nap');
 });
 console.log(`Combo rotation: ${passed} passed`);
}finally{g.close()}
