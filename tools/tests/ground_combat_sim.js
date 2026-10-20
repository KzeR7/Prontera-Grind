// Real game regression coverage for saved kiting, bounded ground spells and holy sustain.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createGame}=require('./helpers/game'),{configure}=require('../skill_balance');
const g=createGame(),ev=g.ev;let passed=0;
function setup(cls='High Wizard'){
 configure(g,cls==='Arch Bishop'?'High Priest':cls,2,'',123);
 ev(`S.cls=${JSON.stringify(cls)};S.lv=150;S.sk=Object.fromEntries(SKILLS.filter(s=>s.cls.includes(S.cls)&&!s.ascensionOnly).map(s=>[s.id,s.max]));
 S.auto=false;S.adv=false;S.kite=false;S.pets=[];S.dmg=0;S.hp=maxHp();S.sk.meditatio=0;TRIAL.on=false;JOB_RITE.on=false;
 resetSkillRuntime();swing=null;atkAnim=0;activePack=0;pl.x=0;pl.z=1.5;pAtkT=1e9;
 mobs=[{n:'Test',x:0,z:0,hp:1e15,max:1e15,pack:0,atk:0,at:1e9,size:1,spawn:1,fixed:true,boss:true}];mob=mobs[0];camps=[];Math.random=()=>.5;`);
}
const test=(name,fn)=>{setup();fn();passed++;console.log('ok '+name)};
const json=code=>JSON.parse(ev('JSON.stringify((()=>{'+code+'})())'));
try{
 test('movement control sits below Auto-advance, switches immediately and saves per account',()=>{
  const doc=g.window.document,control=doc.getElementById('rangedMovementMode');
  assert.equal(doc.getElementById('eclipseAdvance').nextElementSibling.id,'rangedMovement');
  assert.equal(ev('fresh().kite'),false);
  control.value='kite';control.dispatchEvent(new g.window.Event('change',{bubbles:true}));assert.equal(ev('S.kite'),true);
  ev('localStorage.setItem(saveKey(),JSON.stringify(S));S=load()');assert.equal(ev('S.kite'),true);
  ev(`currentUser='different-kite-account';S=load()`);assert.equal(ev('S.kite'),false);
  ev(`S.kite='true';localStorage.setItem(saveKey(),JSON.stringify(S));S=load()`);assert.equal(ev('S.kite'),false);
  ev('S.kite=true;delete S.kite;localStorage.setItem(saveKey(),JSON.stringify(S));S=load()');assert.equal(ev('S.kite'),false);
 });
 test('all ranged tiers can kite; melee and Endless Echo remain planted',()=>{
  for(const cls of ['Archer','Hunter','Sniper','Ranger','Mage','Wizard','High Wizard','Warlock','Acolyte','Priest','High Priest','Arch Bishop']){
   setup(cls);ev('S.kite=true;heroKite(3.2,mob,heroStandoff(mob))');assert.equal(ev('!!skillState().kite'),true,cls);
  }
  for(const cls of ['Swordman','Lord Knight','Assassin Cross','Whitesmith']){setup(cls);ev('S.kite=true');assert.equal(ev('heroKite(3.2,mob,heroStandoff(mob))'),null,cls)}
  setup();ev('S.kite=true;TRIAL.on=true');assert.equal(ev('heroKite(3.2,mob,6)'),null);
 });
 test('real update holds for three seconds, then retreats and repeats within bounds',()=>{
  ev('S.kite=true;window.positions=[];for(let i=0;i<420;i++){update(1/60);positions.push([pl.x,pl.z]);floats=[];}');
  const pos=json('return positions');assert.ok(Math.hypot(pos[170][0],pos[170][1]-1.5)<1e-8);
  assert.ok(Math.hypot(pos[250][0],pos[250][1]-1.5)>.5);
  assert.ok(Math.hypot(pos[310][0]-pos[419][0],pos[310][1]-pos[419][1])<1e-8,'returns to attack window');
  assert.ok(ev('positions.every(p=>p[0]>=-BX_&&p[0]<=BX_&&p[1]>=Z0&&p[1]<=Z1)'));
  setup();ev('for(let i=0;i<420;i++)update(1/60)');assert.equal(ev('pl.z'),1.5);assert.equal(ev('pl.x'),0);
 });
 test('kite finishes attacks, respects safe distance, edges, and target changes',()=>{
  ev('S.kite=true;heroKite(3.1,mob,6);swing={t:1}');assert.equal(ev('heroKite(.1,mob,6)'),null);
  ev('swing=null;pl.z=5');assert.equal(ev('heroKite(.1,mob,6)'),null);
  ev('pl.x=BX_-.6;pl.z=Z1-.6;mob.x=pl.x-.7;mob.z=pl.z-.7;');const p=json('return heroKite(.1,mob,6)');
  assert.ok(p&&p.x<=ev('BX_-.6')&&p.z<=ev('Z1-.6'));
  ev('window.clock=skillState().kite.elapsed;mobs.push({...mob});mob=mobs[1];heroKite(.1,mob,6)');assert.ok(ev('skillState().kite.elapsed>clock'),'a kill cannot reset the cycle');
  ev(`ACT.kite('stand')`);assert.equal(ev('skillState().kite'),undefined);assert.equal(ev('heroKite(.1,mob,6)'),null);
 });
 test('ground damage splits one cast budget across all ticks, including secondary targets',()=>{
  for(const id of ['amp','storm','fnova','grav','sanct','assum','ashower']){
   setup(['sanct','assum'].includes(id)?'High Priest':id==='ashower'?'Sniper':'High Wizard');
   const totals=json(`const sk=SKILLS.find(s=>s.id==='${id}');mobs.push({...mob,x:1});const hit=skillHit,totals=[0,0];skillHit=(o,n)=>{totals[mobs.indexOf(o)]+=n;return 1};
    castSkill({...sk,field:null},1);const expected=totals.slice();totals.fill(0);resetSkillRuntime();castSkill(sk,1);
    const opening=totals.slice();for(let i=0;i<sk.field.duration*10;i++)tickCombatSkills(.1);skillHit=hit;return {expected,actual:totals,opening,fields:skillState().fields.length};`);
   for(let i=0;i<2;i++)assert.ok(Math.abs(totals.actual[i]-totals.expected[i])<1e-6,id+' cast budget '+i);
   assert.ok(totals.opening[0]<totals.actual[0]/2,id+' cannot burst the total');assert.equal(totals.fields,0);
  }
 });
 test('ground hits use the marked radius, recheck membership, and survive target death',()=>{
  const r=json(`const sk=SKILLS.find(s=>s.id==='amp'),radius=3.5*sk.areaScale;
   const near={...mob,x:radius-.01},outside={...mob,x:radius+.01},sleep={...mob,x:1,pack:1},enter={...mob,x:20};mobs.push(near,outside,sleep,enter);
   castSkill(sk,1);const opening=near.hp;mob.x=20;const targetHp=mob.hp;enter.x=0;tickCombatSkills(1);
   const stayedOutside=outside.hp===1e15&&sleep.hp===1e15,departed=mob.hp===targetHp,arrived=enter.hp<1e15;
   mobs=mobs.filter(o=>o!==mob);mob=enter;near.x=0;tickCombatSkills(1);return {radius,opening,near:near.hp,stayedOutside,departed,arrived,x:skillState().fields[0].x};`);
  assert.ok(Math.abs(r.radius-3.5*1.5*1.35)<1e-8);assert.equal(r.x,0);assert(r.near<r.opening&&r.stayedOutside&&r.departed&&r.arrived);
 });
 test('two-field cap skips blocked combo slots and prevents same-spell stacking',()=>{
  ev(`castSkill(SKILLS.find(s=>s.id==='amp'),1);castSkill(SKILLS.find(s=>s.id==='amp'),1);castSkill(SKILLS.find(s=>s.id==='storm'),1);castSkill(SKILLS.find(s=>s.id==='grav'),1);
    comboConfig().slots=['grav','jup',null,null,null,null]`);
  assert.equal(ev('skillState().fields.length'),2);assert.equal(ev('nextComboSkill(mob).id'),'jup');
 });
 test('real Meteor combo has a twelve-second cooldown and seven-second field gaps',()=>{
  ev(`comboConfig().slots=['amp',null,null,null,null,null];pAtkT=0;window.casts=[];window.maxFields=0;window.activeFrames=0;
    const cast=castSkill;castSkill=(sk,k)=>{if(sk.id==='amp')casts.push(t);return cast(sk,k)};
    for(let i=0;i<60*40;i++){update(1/60);maxFields=Math.max(maxFields,skillState().fields.length);if(skillState().fields.length)activeFrames++;floats=[];}castSkill=cast;`);
  const casts=json('return casts');assert(casts.length>=3);for(let i=1;i<casts.length;i++)assert(casts[i]-casts[i-1]>=12-1e-7);
  assert.equal(ev('maxFields'),1);assert(ev('activeFrames/(60*40)<.52'));
  ev('window.cd=skCd.amp;resetSkillRuntime(true);ACT.combopause();ACT.combopause()');assert.equal(ev('skCd.amp'),ev('cd'));
 });
 test('field damage and markers cancel on travel, class/account replacement, off and reset',()=>{
  for(const action of ['activePack=1','S.mp++','S.lvl++',"S.cls='Novice'",'S=JSON.parse(JSON.stringify(S))',"S.skOff.amp=true",'resetSkillRuntime(true)']){
   setup();ev(`castSkill(SKILLS.find(s=>s.id==='amp'),1);window.damage=S.dmg;${action};tickCombatSkills(.1)`);
   assert.equal(ev('skillState().fields.length'),0,action);assert.equal(ev('S.dmg'),ev('damage'),action);
  }
 });
 test('ground pulses cannot repeatedly consume Penance or trigger Holy Echo',()=>{
  setup('High Priest');ev(`S.sk.meditatio=10;mob.skillMark={owner:S.cls,holy:true,power:.1,hits:3,left:10};castSkill(SKILLS.find(s=>s.id==='assum'),1)`);
  assert.equal(ev('mob.skillMark.hits'),2);assert.equal(ev('skillState().echo'),1);
  ev('for(let i=0;i<5;i++)tickCombatSkills(1)');assert.equal(ev('mob.skillMark.hits'),2);assert.equal(ev('skillState().echo'),1);
 });
 test('Searing Light heals at most once per cast; holy attacks no longer grant passive regeneration',()=>{
  setup('High Priest');const r=json(`S.hp=maxHp()*.3;for(let i=0;i<8;i++)mobs.push({...mob,x:1});const hp=S.hp;castSkill(SKILLS.find(s=>s.id==='heal'),1);return {gain:(S.hp-hp)/maxHp(),regen:pv('hpreg')};`);
  assert.ok(Math.abs(r.gain-.018)<1e-8);assert.equal(r.regen,0);
 });
 test('Highness Heal takes priority over First Aid; disabling it restores First Aid',()=>{
  for(const advanced of [true,false]){setup('Arch Bishop');ev(`S.hp=maxHp()*.1;S.skOff.ab_highness=${!advanced};update(.001)`);
   assert.equal(ev('!!skCd.aid'),!advanced);assert.equal(ev('!!skCd.ab_highness'),advanced);
  }
 });
 test('Epiclesis earns modest offense through Ascension, keeps healing separate and cannot stack',()=>{
  setup('Arch Bishop');ev(`ascState().skills[S.cls].level=30;ascState().skills[S.cls].ranks.ab_epiclesis=5;S.skOff=Object.fromEntries(SKILLS.filter(s=>s.id!=='ab_epiclesis').map(s=>[s.id,true]));S.hp=maxHp()*.3;window.hp=S.hp;tickCombatSkills(.01)`);
  assert.equal(ev('skillState().fields.length'),1);assert(ev('S.dmg>0'));ev('for(let i=0;i<5;i++)tickCombatSkills(1)');assert.ok(Math.abs(ev('(S.hp-hp)/maxHp()')-.1)<1e-8);
 });
 console.log(passed+' ground combat checks passed');
}finally{g.close()}
