const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;
try{
  for(const cls of ev('Object.keys(CLASSES)')){
    ev(`S=fresh();S.cls=${JSON.stringify(cls)};S.sk=Object.fromEntries(SKILLS.filter(s=>s.cls.includes(S.cls)).map(s=>[s.id,1]));resetSkillRuntime();Object.keys(skCd).forEach(k=>delete skCd[k]);t=0;mob={x:pl.x,z:pl.z,hp:1e12,pack:1,size:1};mobs.splice(0,mobs.length,mob);window.expected=rotationSkills().length;window.realCast=castSkill;castSkill=()=>{};`);
    for(let i=0;i<5;i++)ev(`t=${i*1.5};playerAttack();resolveSwing(swing)`);
    assert.equal(ev('Object.keys(skillState().casts).length'),ev('expected'),cls+' rotation starvation');ev('castSkill=realCast');
  }
  ev(`S=fresh();S.cls='High Wizard';S.sk=Object.fromEntries(SKILLS.filter(s=>s.cls.includes(S.cls)).map(s=>[s.id,1]));S.skillPriority=['mystic','coat','fire'];S.skOff={fnova:1,fdiver:1,napalm:1};resetSkillRuntime();t=10;mob={x:pl.x+6,z:pl.z,hp:1e12,pack:1,size:1};mobs.splice(0,mobs.length,mob);`);
  assert.equal(ev('rotationCooldown()'),6);
  assert.equal(ev('rotationSkills().length'),11);
  ev('playerAttack()');assert.equal(ev('swing.casts.map(c=>c.sk.id).join()'),'mystic,coat,fire');
  ev('resolveSwing(swing)');assert.equal(ev('Object.keys(skillState().buffs).length'),2);
  assert.equal(ev('skCd.coat'),6);
  ev('t=11;playerAttack()');assert.equal(ev('swing.casts.length'),0);
  ev('t=11.5;playerAttack()');assert.equal(ev('swing.casts.length'),3);
  assert.equal(ev('swing.casts.some(c=>["mystic","coat","fire"].includes(c.sk.id))'),false);
  ev('resolveSwing(swing);t=13;playerAttack();resolveSwing(swing);t=14.5;playerAttack();resolveSwing(swing)');
  assert.equal(ev('Object.keys(skillState().casts).length'),11,'all enabled skills get a turn');
  ev(`S=fresh();S.cls='Mage';S.sk={fire:1};`);assert.equal(ev('rotationCooldown()'),1.5);
  for(const cls of ['Mage','Wizard','High Wizard','Acolyte','Priest','High Priest']){
    ev(`S.cls=${JSON.stringify(cls)};standC={t:-9,r:0}`);assert.equal(ev('heroStandoff(mob)'),6);
    ev(`window.savedStrike=strike;window.magicBasic=false;strike=(power,color,magic)=>{magicBasic=magic};resolveSwing({target:mob,pack:mob.pack,casts:[],far:false});strike=savedStrike`);assert.equal(ev('magicBasic'),true,cls+' basic uses magic');
    assert.equal(ev(`SKILLS.filter(s=>s.type==='act'&&s.cls.includes(S.cls)).every(s=>skillRange(s,mob)===6)`),true);
  }
  ev(`S.cls='Mage';mob={x:6,z:0,hp:100,pack:1};mobs.splice(0,mobs.length,mob,{x:10.5,z:0,hp:100,pack:1},{x:12,z:0,hp:100,pack:1},{x:7,z:0,hp:100,pack:2});`);
  assert.equal(ev(`skillTargets(SKILLS.find(s=>s.id==='fireball'),mob).length`),2,'expanded area stays within its camp');
  ev(`S=fresh();S.cls='Mage';S.sk={fire:1,nap:1,coat:1};ACT.skmove('coat:-1');window.order=S.skillPriority.join();lsPut(saveKey(),JSON.stringify(S));S=load();`);
  assert.equal(ev('S.skillPriority.join()'),ev('order'));
  ev(`currentUser='other-rotation-account';S=load()`);assert.equal(ev('S.skillPriority.length'),0);
  ev(`currentUser='skill-test';S=load();tabs.length=0;openTab('skills');renderWin()`);
  assert.equal(ev(`!!document.querySelector('.skill-rotation')&&!document.querySelector('.skill-rotation').closest('details')`),true);
  ev(`S=fresh();S.lv=120;S.zeny=1e9;S.ore.ori=1000;S.eq.weapon.aff=[{k:'str',v:10},{k:'agi',v:10},{k:'dex',v:10}];reforgeSelection[S.eq.weapon.id]=[1];window.before=JSON.stringify(S.eq.weapon.aff);reforge('weapon');lsPut(saveKey(),JSON.stringify(S));S=load();window.paid=S.zeny;keepAndReforge();`);
  assert.equal(ev('JSON.stringify(S.eq.weapon.aff)'),ev('before'));
  assert.equal(ev('S.reforgePending.chosen.join()'),'1');
  assert.equal(ev('paid-S.zeny'),ev('reforgeQuote(S.eq.weapon,1).zeny'));
  ev(`S.zeny=0;keepAndReforge()`);assert.equal(ev('S.zeny'),0);assert.equal(ev('JSON.stringify(S.eq.weapon.aff)'),ev('before'));
  ev(`tabs.length=0;openTab('equip');sub.equip='refine';renderWin()`);
  assert.equal(ev(`!!document.querySelector('.refine-reserve')&&!document.querySelector('.refine-reserve').closest('details')`),true);
  console.log('Rotation, ranged magic, priority persistence/account isolation, repeated reforge and visible reserves passed');
}finally{g.close()}
