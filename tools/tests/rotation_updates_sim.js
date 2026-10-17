const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;
try{
  ev(`S=fresh();S.cls='High Wizard';S.sk=Object.fromEntries(SKILLS.filter(s=>s.cls.includes(S.cls)).map(s=>[s.id,1]));resetSkillRuntime();t=10;mob={x:pl.x+6,z:pl.z,hp:1e12,pack:1,size:1};mobs.splice(0,mobs.length,mob);`);
  assert.equal(ev('rotationSkills().length'),6);
  assert.ok(ev('rotationSkills().every(s=>s.type==="act")'));
  for(const cls of ['Mage','Wizard','High Wizard','Acolyte','Priest','High Priest']){
    ev(`S.cls=${JSON.stringify(cls)};standC={t:-9,r:0}`);assert.equal(ev('heroStandoff(mob)'),6);
    ev(`window.savedStrike=strike;window.magicBasic=false;strike=(power,color,magic)=>{magicBasic=magic};resolveSwing({target:mob,pack:mob.pack,casts:[],far:false});strike=savedStrike`);assert.equal(ev('magicBasic'),true,cls+' basic uses magic');
    assert.equal(ev(`SKILLS.filter(s=>s.type==='act'&&s.cls.includes(S.cls)).every(s=>skillRange(s,mob)===6)`),true);
  }
  ev(`S.cls='Mage';mob={x:6,z:0,hp:100,pack:1};mobs.splice(0,mobs.length,mob,{x:10.5,z:0,hp:100,pack:1},{x:12,z:0,hp:100,pack:1},{x:7,z:0,hp:100,pack:2});`);
  assert.equal(ev(`skillTargets(SKILLS.find(s=>s.id==='fireball'),mob).length`),2,'expanded area stays within its camp');
  ev(`S=fresh();S.cls='Mage';S.sk={fire:1,nap:1,coat:1};ACT.skmove('nap:-1');window.order=comboConfig().slots.join();lsPut(saveKey(),JSON.stringify(S));S=load();`);
  assert.equal(ev('comboConfig().slots.join()'),ev('order'));
  ev(`currentUser='other-rotation-account';S=load()`);assert.equal(ev('Object.keys(S.skillCombos).length'),0);
  ev(`currentUser='skill-test';S=load();tabs.length=0;openTab('skills');renderWin()`);
  assert.equal(ev(`!!document.querySelector('.skill-rotation')`),true,'v179: Skills opens with the combo editor');
  assert.equal(ev(`document.querySelector('.ui-content').firstElementChild.className`),'ui-combo-editor','combo editor precedes skill tiles');
  ev(`sub.skills='combo';renderWin()`);
  assert.equal(ev(`!!document.querySelector('.skill-rotation')&&!document.querySelector('.skill-rotation').closest('details')`),true,'v179: legacy Combo navigation still shows the plan unfolded');
  ev(`S=fresh();S.lv=120;S.zeny=1e9;S.ore.ori=1000;S.eq.weapon.aff=[{k:'str',v:10},{k:'agi',v:10},{k:'dex',v:10}];reforgeSelection[S.eq.weapon.id]=[1];window.before=JSON.stringify(S.eq.weapon.aff);reforge('weapon');lsPut(saveKey(),JSON.stringify(S));S=load();window.paid=S.zeny;keepAndReforge();`);
  assert.equal(ev('JSON.stringify(S.eq.weapon.aff)'),ev('before'));
  assert.equal(ev('S.reforgePending.chosen.join()'),'1');
  assert.equal(ev('paid-S.zeny'),ev('reforgeQuote(S.eq.weapon,1).zeny'));
  ev(`S.zeny=0;keepAndReforge()`);assert.equal(ev('S.zeny'),0);assert.equal(ev('JSON.stringify(S.eq.weapon.aff)'),ev('before'));
  ev(`tabs.length=0;openTab('equip');sub.equip='refine';renderWin()`);
  assert.equal(ev(`!!document.querySelector('.refine-reserve')&&!document.querySelector('.refine-reserve').closest('details')`),true);
  console.log('Rotation, ranged magic, priority persistence/account isolation, repeated reforge and visible reserves passed');
}finally{g.close()}
