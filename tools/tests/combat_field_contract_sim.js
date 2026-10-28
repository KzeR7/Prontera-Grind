// Current field-combat contract, measured from the real game with synthetic targets.
// Preserve the older suites' assertions separately: they expose historical conflicts.
const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const {configure}=require('../skill_balance');
const g=createGame(),ev=g.ev;
const result=expr=>JSON.parse(ev(`JSON.stringify((${expr}))`));
function setup(cls='High Wizard'){
  configure(g,cls==='Warlock'?'High Wizard':cls==='Ranger'?'Sniper':cls,2,'',123);
  ev(`S.cls=${JSON.stringify(cls)};S.lv=150;S.sk=Object.fromEntries(SKILLS.filter(s=>s.cls.includes(S.cls)).map(s=>[s.id,s.max]));
    S.auto=false;S.adv=false;S.pets=[];S.skOff={};S.dmg=0;TRIAL.on=false;JOB_RITE.on=false;
    t=10;activePack=0;pl.x=0;pl.z=0;resetSkillRuntime();
    mobs=[{x:0,z:2,hx:0,hz:2,pack:0,hp:1e12,max:1e12,atk:0,at:1e9,size:1,spawn:1,fixed:true,boss:true}];
    mob=mobs[0];camps=[];Math.random=()=>.5;S.hp=maxHp();`);
}
try{
  // v227 direct attacks hit the nearest five living targets in range across camps.
  setup();ev(`mobs.push(...Array.from({length:7},(_,i)=>({...mob,x:(i+1)*.5,pack:i%2})));
    mobs.push({...mob,x:20,pack:1},{...mob,x:.1,pack:1,hp:0});`);
  assert.deepEqual(result(`skillTargets(SKILLS.find(s=>s.id==='fireball'),mob).map(o=>mobs.indexOf(o))`),[0,1,2,3,4]);
  assert.deepEqual(result(`skillTargets({...SKILLS.find(s=>s.id==='fireball'),shape:'single'},mob).map(o=>mobs.indexOf(o))`),[0]);
  // Old pack restrictions must not hide a shape/range regression: in-range targets in both
  // camps take real damage, while an out-of-range target does not.
  setup('Assassin Cross');ev(`pl.z=1.5;const target=mob;window.same={...target,x:1,hp:1e12};
    window.other={...target,x:1,pack:1,hp:1e12};window.far={...target,x:20,hp:1e12};
    mobs.push(same,other,far);castSkill(SKILLS.find(s=>s.id==='mAss'),1);`);
  assert.equal(ev('same.hp<1e12'),true);assert.equal(ev('other.hp<1e12'),true);
  assert.equal(ev('far.hp'),1e12);
  assert.equal(ev('other.provokeUntil>t'),true,'hitting the other camp wakes it');
  assert.equal(ev('!!far.provokeUntil'),false,'a distant untouched camp remains asleep');
  // Nearby non-engaged enemies may be approached without granting a guard buff; a remote
  // sleeping target is still blocked even if a hypothetical dash has adequate reach.
  setup('Assassin Cross');ev(`mob.pack=1;pl.z=6;window.before=pl.z;skillDash(SKILLS.find(s=>s.id==='vsplash'),mob);`);
  assert.ok(ev('pl.z<before'));assert.equal(ev('skillBonus("guard")'),0);
  setup('Assassin Cross');ev(`mob.pack=1;pl.z=10;window.before=pl.z;skillDash({...SKILLS.find(s=>s.id==='vsplash'),dash:10},mob);`);
  assert.equal(ev('pl.z'),ev('before'));assert.equal(ev('skillBonus("guard")'),0);
  // Chain Lightning's real cast must bounce across camps but no more than its configured
  // three secondary targets. A dead target must not consume a bounce slot.
  setup('Warlock');ev(`mob.x=0;mob.z=0;pl.z=1.8;mobs.push(...Array.from({length:5},(_,i)=>({...mob,x:i+1,pack:i%2})));
    mobs.push({...mob,x:.1,pack:1,hp:0});window.hit=[];window.savedHit=skillHit;
    skillHit=(o,n)=>{hit.push(mobs.indexOf(o));return 1};castSkill(SKILLS.find(s=>s.id==='wl_chain'),1);skillHit=savedHit;`);
  assert.deepEqual(result('hit'),[0,1,2,3]);assert.equal(ev('mobs[2].pack'),1);
  // The Cluster Bomb check used to sit behind that older failing chain assertion.
  setup('Ranger');ev(`S.sk={rg_cluster:10};castSkill(SKILLS.find(s=>s.id==='rg_cluster'),1);window.opening=S.dmg`);
  assert.equal(ev('skillState().events.length'),1);
  ev('tickCombatSkills(.5)');assert.equal(ev('S.dmg'),ev('opening'),'cluster does not explode early');
  ev('tickCombatSkills(.11)');assert.equal(ev('skillState().events.length'),0);
  assert.ok(ev('S.dmg>opening'),'cluster deals its delayed damage');
  // A field survives active-camp changes (ground_aoe_sim covers actual damage), but map,
  // stage, class, account, off-switch and reset must all clear it without extra damage.
  for(const action of ['S.mp++','S.lvl++',"S.cls='Novice'",'S=JSON.parse(JSON.stringify(S))',"S.skOff.amp=true",'resetSkillRuntime(true)']){
    setup();ev(`castSkill(SKILLS.find(s=>s.id==='amp'),1);window.damage=S.dmg`);
    assert.equal(ev('skillState().fields.length'),1,action+' starts with a live field');
    ev(`${action};tickCombatSkills(.1)`);
    assert.equal(ev('skillState().fields.length'),0,action);assert.equal(ev('S.dmg'),ev('damage'),action);
  }
  console.log('PASS: direct area shape/range/cap, cross-camp wake damage, guarded dash, capped cross-camp chain, delayed cluster, field cancellation');
}finally{g.close()}
