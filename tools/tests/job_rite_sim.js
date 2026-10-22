// Actual flag-on page: all six advancement fights, boundaries and save isolation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createGame}=require('./helpers/game');
const source=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
const g=createGame(source.replace('const FOURTH_JOBS_LIVE=false;','const FOURTH_JOBS_LIVE=true;')),ev=g.ev;
const probe=code=>JSON.parse(ev('JSON.stringify((()=>{'+code+'})())'));
const expected=[['Lord Knight','Rune Knight','Lord Knight Seyren',1634],['Assassin Cross','Guillotine Cross','Assassin Cross Eremes',1635],['Whitesmith','Mechanic','Whitesmith Harword',1636],['High Priest','Arch Bishop','High Priest Magaleta',1637],['Sniper','Ranger','Sniper Shecil',1638],['High Wizard','Warlock','High Wizard Katrinn',1639]];
let passed=0;
ev('window.riteClock=Date.now();Date.now=()=>window.riteClock');
const settle=()=>ev('riteClock=JOB_RITE.exitAt;tickJobRite()');
function setup(parent='Lord Knight'){
 ev(`if(JOB_RITE.on)finishJobRite(false);currentUser='rite-player';S=fresh();S.cls=${JSON.stringify(parent)};S.lv=150;S.auto=false;S.adv=false;S.mp=0;S.lvl=3;S.kl=4;
  for(const name of lineOf(S.cls))S.jobs[name]={jl:CLASSES[name].mj,jx:0};
  S.eq.weapon={id:901,slot:'weapon',wt:C().wt[0],sec:5,tier:4,val:500,r:10,slots:0,cards:[],aff:[],name:'N+ trial weapon'};S.hp=maxHp()*.7;
  t=0;spawn();pl.x=1;pl.z=2;window.oldMob=mob;window.oldMobs=mobs;window.oldHp=S.hp;window.oldProgress=JSON.stringify({kills:S.kills,kl:S.kl,exp:S.exp,zeny:S.zeny,prog:S.prog,clears:S.mapClears,mat:S.ascensionMat,inv:S.inv,index:S.mobKills});`);
}
function test(name,fn){fn();passed++;console.log('ok '+name)}
try{
 for(const [parent,target,enemy,id] of expected){
  test(parent+' enters its own Crucible fight (1.25x the Nightmare Abyss boss HP) and advances only after the kill',()=>{
   setup(parent);ev(`changeClass(${JSON.stringify(target)})`);
   assert.equal(ev('S.cls'),parent);assert.equal(ev('JOB_RITE.on'),true);
   assert.deepEqual(probe('return {name:mob.n,id:mob.spriteId,hp:mob.hp,atk:mob.atk,count:mobs.length}'),{name:enemy,id,hp:Math.floor(ev('nmBossHpOf(9,15)')*ev('JOB_RITE_BOSS_MULT')),atk:ev('ascensionCombatStats(10,1).atk'),count:1});
   assert.equal(ev('JOB_RITE.enemy.max'),ev('JOB_RITE.enemy.hp'));
   assert.equal(ev('JOB_RITE.deadline-Date.now()'),30000);
   assert.equal(ev('jobRiteLeft()'),30);
   assert.equal(g.window.document.querySelector('#jobRiteHud time').textContent,'0:30');
   assert.equal(ev('S.hp'),ev('maxHp()'));
   assert.equal(ev('mhOf(mob)'),30,'field-only +15 HIT does not change the advancement opponent');
   assert.equal(ev('mob.size'),.6);assert.equal(ev("mob.mag===['demon','tree','blob'].includes(fieldOf(10,1).mobs[0].shape)"),true);
   ev('JOB_RITE.enemy.hp=0;kill(JOB_RITE.enemy);tickJobRite()');
   assert.equal(ev('JOB_RITE.outcome'),'passed');assert.equal(ev('S.cls'),parent);
   assert.equal(ev('JOB_RITE.exitAt-Date.now()'),3000);
   const banner=g.window.document.getElementById('jobRiteResult');assert.equal(banner.hidden,false);assert.equal(banner.querySelector('strong').textContent,'VICTORY');
   settle();assert.equal(banner.hidden,true);
   assert.equal(ev('S.cls'),target);assert.equal(ev('jobOf().jl'),1);assert.equal(ev('JOB_RITE.on'),false);
   assert.equal(ev('S.lv'),150);assert.equal(ev('S.eq.weapon.id'),901);
   assert.equal(ev('items().concat(S.inv).filter(it=>it.id===901).length'),1);
   assert.equal(ev('JSON.stringify({kills:S.kills,kl:S.kl,exp:S.exp,zeny:S.zeny,prog:S.prog,clears:S.mapClears,mat:S.ascensionMat,inv:S.inv,index:S.mobKills})'),ev('oldProgress'));
   ev(`changeClass(${JSON.stringify(parent)});changeClass(${JSON.stringify(target)})`);
   assert.equal(ev('S.cls'),target);assert.equal(ev('JOB_RITE.on'),false,'played class returns directly');
  });
 }
 test('level, Job level and direct-parent gates cannot be bypassed',()=>{
  setup();ev("S.lv=149;changeClass('Rune Knight')");assert.equal(ev('JOB_RITE.on'),false);
  ev("S.lv=150;S.jobs['Lord Knight'].jl=49;changeClass('Rune Knight')");assert.equal(ev('JOB_RITE.on'),false);
  ev("S.jobs['Lord Knight'].jl=50;S.cls='Novice'");assert.equal(ev("startJobRite('Rune Knight')"),false);
 });
 test('timeout at exactly 30 seconds restores field, HP and class without rewards',()=>{
  setup();ev("changeClass('Rune Knight');t=30;update(0)");
  assert.equal(ev('JOB_RITE.on'),true);assert.equal(ev('JOB_RITE.outcome'),'timeout');settle();
  assert.equal(ev('JOB_RITE.on'),false);assert.equal(ev('S.cls'),'Lord Knight');assert.equal(ev('JOB_RITE.result.reason'),'timeout');
  assert.equal(ev('mobs===oldMobs&&mob===oldMob&&S.hp===oldHp&&pl.x===1&&pl.z===2'),true);
 });
 test('wall-clock deadline prevents pausing or hiding from extending the 30 seconds',()=>{
  setup();ev("changeClass('Rune Knight');riteClock+=30000;update(0)");settle();assert.equal(ev('JOB_RITE.result.reason'),'timeout');
 });
 test('a kill before the deadline passes even if the next tick is after it',()=>{
  setup();ev("changeClass('Rune Knight');t=29.999;JOB_RITE.enemy.hp=0;kill(JOB_RITE.enemy);t=30.1;update(0)");settle();assert.equal(ev('S.cls'),'Rune Knight');
 });
 test('a kill at the deadline cannot advance',()=>{
  setup();ev("changeClass('Rune Knight');t=30;JOB_RITE.enemy.hp=0;kill(JOB_RITE.enemy);tickJobRite()");settle();assert.equal(ev('S.cls'),'Lord Knight');assert.equal(ev('JOB_RITE.result.reason'),'timeout');
 });
 test('real combat damage can defeat the trial opponent',()=>{
  setup();ev("changeClass('Rune Knight');JOB_RITE.enemy.hp=1;Math.random=()=>.5;for(let i=0;i<300&&JOB_RITE.on;i++)update(1/60)");assert.equal(ev('JOB_RITE.outcome'),'passed');settle();assert.equal(ev('S.cls'),'Rune Knight');
 });
 test('opponent attack defeat fails and permits a fresh retry',()=>{
  setup();ev("changeClass('Rune Knight');S.hp=1;mob.atk=1e12;mob.at=0;mob.x=pl.x;mob.z=pl.z;Math.random=()=>.99;update(.01)");
  assert.equal(ev('JOB_RITE.outcome'),'defeat');assert.equal(ev('S.hp'),0);
  assert.equal(g.window.document.querySelector('#jobRiteResult strong').textContent,'DEFEATED');settle();
  assert.equal(ev('JOB_RITE.result.reason'),'defeat');assert.equal(ev('S.cls'),'Lord Knight');assert.equal(ev('S.hp===oldHp'),true);
  ev("changeClass('Rune Knight')");assert.equal(ev('JOB_RITE.on'),true);ev('finishJobRite(false)');
 });
 test('result stays in the dark room for three real seconds and freezes combat',()=>{
  setup();ev("changeClass('Rune Knight');jobRiteArena();JOB_RITE.enemy.hp=0;kill(JOB_RITE.enemy);window.frozenPosition=JSON.stringify(pl);window.frozenHp=S.hp;riteClock+=2999;update(10)");
  assert.equal(ev('JOB_RITE.on'),true);assert.equal(ev('S.cls'),'Lord Knight');assert.equal(ev('scene.background.getHex()'),0x05050b);
  assert.equal(ev('JSON.stringify(pl)===frozenPosition&&S.hp===frozenHp'),true);assert.equal(ev('mobs.length'),0);
  assert.equal(ev("classBlock('Rune Knight')"),'Leave the Crucible first');
  ev('gotoField(0,1)');assert.equal(ev('S.lvl'),3);assert.equal(ev('JOB_RITE.on'),true);
  assert.equal(g.window.document.getElementById('jobRiteHud').hidden,true);
  assert.equal(g.window.document.querySelector('#jobRiteResult small').textContent,'Returning in 1…');
  ev('riteClock++;update(0)');assert.equal(ev('S.cls'),'Rune Knight');assert.equal(ev('JOB_RITE.on'),false);
  assert.equal(ev('mobs===oldMobs&&mob===oldMob'),true);ev('update(0)');assert.equal(ev('S.cls'),'Rune Knight');
 });
 test('timeout result is distinct and cannot change to victory during its pause',()=>{
  setup();ev("changeClass('Rune Knight');JOB_RITE.deadline=Date.now();update(0)");
  assert.equal(g.window.document.querySelector('#jobRiteResult strong').textContent,'TIME UP');
  ev('JOB_RITE.enemy.hp=0;kill(JOB_RITE.enemy)');assert.equal(ev('JOB_RITE.outcome'),'timeout');settle();assert.equal(ev('S.cls'),'Lord Knight');
 });
 test('reload and account changes during the result cannot grant the pending job',()=>{
  setup();ev("changeClass('Rune Knight');JOB_RITE.enemy.hp=0;kill(JOB_RITE.enemy);localStorage.setItem(saveKey(),JSON.stringify(S));S=load();update(0)");
  assert.equal(ev('JOB_RITE.on'),false);assert.equal(ev('S.cls'),'Lord Knight');assert.equal(ev("playedClass('Rune Knight')"),false);
  assert.equal(g.window.document.getElementById('jobRiteResult').hidden,true);
 });
 test('leave, travel, class changes and Echo cannot mix trial state',()=>{
  setup();ev("changeClass('Rune Knight');changeClass('Novice');trialEnter('training')");assert.equal(ev('S.cls'),'Lord Knight');assert.equal(ev('TRIAL.on'),false);
  ev('finishJobRite(false)');assert.equal(ev('mobs===oldMobs'),true);
  ev("changeClass('Rune Knight');gotoField(0,1)");assert.equal(ev('JOB_RITE.on'),false);assert.equal(ev('S.lvl'),1);
 });
 test('save reload abandons the rite without persisting arena state',()=>{
  setup();ev("changeClass('Rune Knight');localStorage.setItem(saveKey(),JSON.stringify(S));S=load();update(0)");
  assert.equal(ev('JOB_RITE.on'),false);assert.equal(ev('S.cls'),'Lord Knight');assert.equal(ev('S.mp'),0);assert.equal(ev('S.lvl'),3);
  assert.equal(ev("JSON.stringify(S).includes('deadline')"),false);assert.equal(ev("playedClass('Rune Knight')"),false);
 });
 test('switching accounts cannot promote or restore the old account field',()=>{
  setup();ev("changeClass('Rune Knight');JOB_RITE.enemy.hp=0;kill(JOB_RITE.enemy);petBuff.atk=900;petBuff.atkT=30;petBuffSrc.atk='old pet';currentUser='other-account';S=fresh();S.hp=73;update(0)");
  assert.equal(ev('JOB_RITE.on'),false);assert.equal(ev('S.cls'),'Novice');assert.equal(ev('S.hp'),73);assert.equal(ev('JOB_RITE.result'),null);assert.equal(ev('mobs.includes(oldMob)'),false);assert.equal(ev('petBuff.atk'),0);assert.equal(ev('Object.keys(petBuffSrc).length'),0);
 });
 test('dark arena hides field scenery and HUD exposes countdown and leave',()=>{
  setup();ev("changeClass('Rune Knight');jobRiteArena();jobRiteHud()");
  assert.equal(ev('scene.background.getHex()'),0x05050b);assert.equal(ev('road.visible'),false);
  const hud=g.window.document.getElementById('jobRiteHud');assert.equal(g.window.document.body.classList.contains('job-rite'),true);assert.equal(hud.hidden,false);assert.equal(hud.querySelector('time').textContent,'0:30');assert.match(hud.textContent,/Seyren/);
  hud.querySelector('button').click();assert.equal(ev('JOB_RITE.on'),false);assert.equal(hud.hidden,true);assert.equal(g.window.document.body.classList.contains('job-rite'),false);
 });
 console.log(passed+' job rite checks passed');
}finally{g.close()}
