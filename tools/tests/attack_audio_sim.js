// Exercise actual animation/contact timing and audio routing through the real page.
const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;
function setup(cls='Novice'){
 ev(`S=fresh();S.cls=${JSON.stringify(cls)};S.lv=150;S.pets=[];S.auto=false;S.adv=false;
 for(const name of lineOf(S.cls))S.jobs[name]={jl:CLASSES[name].mj,jx:0};
 S.sk={};S.st.agi=120;S.st.dex=120;S.hp=maxHp();resetSkillRuntime();
 TRIAL.on=true;TRIAL.left=1e9;t=1;pl.x=0;pl.z=0;pAtkT=0;swing=null;atkAnim=0;
 mob={x:0,z:0,hx:0,hz:0,pack:0,size:1,hp:1e12,max:1e12,atk:0,at:1e9,spawn:1,fixed:true};mobs=[mob];activePack=0;camps=[];
 Math.random=()=>.99;window.sounds=[];window.CombatAudio={
 attack:(...args)=>sounds.push({kind:'attack',args,t,anim:atkAnim}),
 hit:(...args)=>sounds.push({kind:'hit',args,t,anim:atkAnim})};`);
}
try{
 for(const cls of Array.from(ev('Object.keys(CLASSES)'))){
  setup(cls);ev('playerAttack()');
  assert.equal(ev('sounds.length'),1,cls+' one attack sound');
  assert.equal(ev('sounds[0].anim'),1,cls+' sound starts with animation');
  ev('window.contact=swingDur*SWING_CONTACT;update(contact-.0001)');
  assert.equal(ev('sounds.length'),1,cls+' no contact before impact');
  ev('update(.0002)');
  assert.equal(ev('sounds.length'),2,cls+' one hit at contact');
  assert.equal(ev('sounds[1].kind'),'hit');
  assert.ok(Math.abs(ev('sounds[1].anim')-ev('1-SWING_CONTACT'))<.01);
 }
 setup();ev(`S.st.dex=0;Math.random=()=>0;playerAttack();update(swingDur*SWING_CONTACT+.0001)`);
 assert.equal(ev('sounds.length'),1,'miss still has attack sound, no contact');
 setup('Guillotine Cross');ev(`S.sk=Object.fromEntries(SKILLS.filter(s=>s.cls.includes(S.cls)).map(s=>[s.id,s.max]));
 const r=skillState();r.comboSlots=rotationSkills().map(s=>s.id);r.cursor=1;r.nextCastAt=t+1;
 Math.random=()=>{throw Error('audio consumed combat RNG')};playerAttack();resolveSwing(swing)`);
 assert.equal(ev('swing.visualOnly'),true);assert.equal(ev('sounds.length'),1,'cosmetic swing audible without damage');
 assert.equal(ev('S.dmg||0'),0);
 setup();ev(`S.sfx=false;playerAttack();hurt(mob,1,'red',false,true);hurt(mob,1,'red',false,false,'fist','pet')`);
 assert.equal(ev('sounds[0].args[0]'),false,'attack obeys saved switch');
 assert.equal(ev('sounds[1].args[1]'),false,'contact obeys saved switch');
 assert.equal(ev('sounds[1].args[3]'),'skill');assert.equal(ev('sounds[2].args[3]'),'pet');
 setup();ev('mob=null;playerAttack()');assert.equal(ev('sounds.length'),0,'idle silent');
 setup('Guillotine Cross');ev(`S.sk=Object.fromEntries(SKILLS.filter(s=>s.cls.includes(S.cls)).map(s=>[s.id,s.max]));
 window.originalAspd=C().aspd;C().aspd=.1;const r=skillState();r.comboSlots=rotationSkills().map(s=>s.id);r.cursor=1;r.nextCastAt=t+.1;playerAttack();C().aspd=originalAspd`);
 assert.equal(ev('sounds.length'),0,'gap too short to animate is silent');
 console.log('PASS attack audio: all 25 classes, animation start/contact timing, misses, cosmetic gaps without RNG/damage, off, skill/pet routing and idle');
}finally{g.close()}
