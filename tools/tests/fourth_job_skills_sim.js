// Exercise the actual flag-on page; no copied combat formulas or scheduler.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createGame}=require('./helpers/game');
const source=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
assert(source.includes('const FOURTH_JOBS_LIVE=true;'));
const live=createGame(source.replace('const FOURTH_JOBS_LIVE=true;','const FOURTH_JOBS_LIVE=false;')),g=createGame(source.replace('const FOURTH_JOBS_LIVE=false;','const FOURTH_JOBS_LIVE=true;')),ev=g.ev;
let passed=0;
const test=(n,f)=>{f();passed++;console.log('ok '+n)};
const probe=c=>JSON.parse(ev('JSON.stringify((()=>{'+c+'})())'));
function setup(cls='Guillotine Cross'){
 ev(`S=fresh();S.cls=${JSON.stringify(cls)};S.lv=150;S.auto=false;S.adv=false;S.pets=[];S.skOff={};S.skillCombos={};
 for(const n of lineOf(S.cls))S.jobs[n]={jl:CLASSES[n].mj,jx:0};
 S.sk=Object.fromEntries(SKILLS.filter(s=>s.cls.includes(S.cls)).map(s=>[s.id,s.max]));
 resetSkillRuntime();for(const k in skCd)delete skCd[k];t=0;pAtkT=0;swing=null;pl.x=0;pl.z=1.8;
 mobs=[{x:0,z:0,hx:0,hz:0,pack:0,size:1,hp:1e12,max:1e12,atk:0,at:1e9,spawn:1,fixed:true}];mob=mobs[0];activePack=0;camps=[];TRIAL.on=false;S.hp=maxHp();`);
}
try{
 test('locked live catalogue remains 91 skills; no ascension skills leak',()=>{assert.equal(live.ev('SKILLS.length'),91);assert.equal(live.ev('SKILLS.some(s=>SKILLS4.includes(s))'),false)});
 test('six classes have six unique authentic skills and descriptions',()=>{
  const expected={
   'Rune Knight':['Sonic Wave','Ignition Break','Dragon Breath','Hundred Spears','Wind Cutter','Enchant Blade'],
   Warlock:['Chain Lightning','Soul Expansion','Crimson Rock','Jack Frost','Comet','Tetra Vortex'],
   Ranger:['Aimed Bolt','Warg Strike','Arrow Storm','Warg Bite','Cluster Bomb','Unlimit'],
   'Guillotine Cross':['Cross Impact','Dark Illusion','Hallucination Walk','Rolling Cutter','Cross Ripper Slasher','Dark Claw'],
   'Arch Bishop':['Judex','Adoramus','Praefatio','Duple Light','Highness Heal','Epiclesis'],
   Mechanic:['Vulcan Arm','Arm Cannon','Axe Tornado','Axe Boomerang','Power Swing','Magma Eruption']};
  assert.equal(ev('SKILLS4.length'),36);assert.equal(ev('new Set(SKILLS.map(s=>s.id)).size'),ev('SKILLS.length'));
  for(const [c,names]of Object.entries(expected))assert.deepEqual(probe(`return SKILLS4.filter(s=>s.from===${JSON.stringify(c)}).map(s=>s.n)`),names);
  assert(ev('SKILLS4.every(s=>s.max===10&&s.cd>0&&s.d(1).length>20)'));
 });
 test('all new skills resolve preserved native icons and FX',()=>{for(const s of probe('return SKILLS4.map(s=>({id:s.id,icon:!!PGSkillIcons[s.id],fx:!!skillFxSpec(s.id)}))'))assert(s.icon&&s.fx,s.id)});
 test('five attacks plus an inherited opener fit the six-slot bar; support uses no slots',()=>{
  for(const c of ev('CD4.map(c=>c[0])')){setup(c);assert(ev('rotationSkills().length<=6&&rotationSkills().every(s=>s.type==="act")'));}
  setup();assert(ev('suggestedCombo().includes("gc_roll")&&suggestedCombo().includes("gc_ripper")&&suggestedCombo().indexOf("gc_roll")<suggestedCombo().indexOf("gc_ripper")'));
 });
 test('Cross Impact is seven focused hits; no invented bleed spend or random extra cuts',()=>{
  setup();const result=probe(`const real=skillHit;let n=0;skillHit=()=>{n++;return 1};castSkill(SKILLS.find(s=>s.id==='gc_cross'),1);skillHit=real;return n`);assert.equal(result,7);
 });
 test('Rolling stacks count casts, cap at ten, expire in ten seconds, even against a pack',()=>{
  setup();assert.deepEqual(probe(`mobs.push({...mob,x:1},{...mob,x:2});const sk=SKILLS.find(s=>s.id==='gc_roll');castSkill(sk,1);const first=skillState().stacks.rolling.n;for(let i=0;i<15;i++)castSkill(sk,1);const cap=skillState().stacks.rolling.n;t=10.01;return {first,cap,ready:skillStackReady(SKILLS.find(s=>s.id==='gc_ripper')),spent:takeSelfStacks('rolling')}`),{first:1,cap:10,ready:false,spent:0});
 });
 test('Cross Ripper Slasher requires stacks, consumes all once, and scales damage',()=>{
  setup();const r=probe(`const real=skillHit;let raw=0,hits=0;skillHit=(o,n)=>{raw=n;hits++;return 1};const sk=SKILLS.find(s=>s.id==='gc_ripper');castSkill(sk,1);const empty=hits;
  addSelfStack('rolling',10,10);castSkill(sk,1);const one=raw;for(let i=0;i<5;i++)addSelfStack('rolling',10,10);castSkill(sk,1);const five=raw;skillHit=real;return {empty,ratio:five/one,left:takeSelfStacks('rolling')}`);
  assert.equal(r.empty,0);assert(Math.abs(r.ratio-2/1.2)<1e-9);assert.equal(r.left,0);
 });
 test('real loop: five rapid spins then finisher, bounded damage, full recovery, both weapons and ASPD extremes',()=>{
  for(const agi of [1,120])for(const weapon of ['katar','dagger']){
   setup();ev(`S.st.agi=${agi};S.st.dex=120;Math.random=()=>.5;S.eq.weapon={val:300,r:0,aff:[],cards:[],slots:0,sec:4,tier:2,id:'test-weapon',wt:${JSON.stringify(weapon)},slot:'weapon',atk:1};comboConfig().slots=['gc_roll','gc_ripper','gc_cross',null,null,null];
   window.observed=[];window.realCast=castSkill;castSkill=(s,k)=>{const before=S.dmg;const v=realCast(s,k);observed.push({id:s.id,t,d:S.dmg-before,duration:swingDur});return v};
   for(let i=0;i<1000;i++){update(1/120);floats.length=0;shots.length=0;}castSkill=realCast;`);
   const casts=probe('return observed');assert.deepEqual(casts.slice(0,7).map(s=>s.id),['gc_roll','gc_roll','gc_roll','gc_roll','gc_roll','gc_ripper','gc_cross']);
   for(let i=1;i<5;i++){const gap=casts[i].t-casts[i-1].t;assert(gap>=.199&&gap<.29,'spin gap '+gap+' agi '+agi);}
   assert(casts.slice(0,5).every(c=>c.duration<.2&&c.d>0),JSON.stringify(casts.slice(0,7)));assert(casts[7].t-casts[6].t>=3);
   // Five low-power spins should not dwarf both focused finishers combined.
   assert(casts.slice(0,5).reduce((n,c)=>n+c.d,0)<casts[5].d+casts[6].d);
  }
 });
 test('repeat pause, slot edits, class/account changes and field timing respect runtime boundaries',()=>{
  setup();ev(`comboConfig().slots=['gc_roll','gc_ripper',null,null,null,null];playerAttack();t=swing.t;resolveSwing(swing);swing=null;ACT.comboassign('0:gc_cross');resetSkillRuntime(true)`);
  assert.equal(ev('skillState().repeatCount'),1);assert.equal(ev('skillState().comboSlots[0]'),'gc_roll');
  ev('comboConfig().enabled=false');assert.equal(ev('nextComboSkill(mob)'),null);
  ev(`S.cls='Assassin Cross'`);assert.equal(ev('skillState().repeatCount'),0);assert.equal(ev('skillState().stacks'),undefined);
  setup();ev(`addSelfStack('rolling',10);S=JSON.parse(JSON.stringify(S))`);assert.equal(ev('skillState().stacks'),undefined);
 });
 test('missing stacks and unavailable Rolling Cutter skip to the next available attack',()=>{
  setup();ev(`comboConfig().slots=['gc_roll','gc_ripper','gc_cross',null,null,null];skCd.gc_roll=20`);assert.equal(ev('nextComboSkill(mob).id'),'gc_cross');
 });
 test('Arch Bishop support automatically heals and protects without offensive slot/cursor changes',()=>{
  setup('Arch Bishop');const r=probe(`S.hp=maxHp()*.2;const before=S.hp;tickCombatSkills(.01);return {heal:(S.hp-before)/maxHp(),ward:skillState().absorb.amount/maxHp(),duple:skillState().buffs.ab_duple.value,cursor:skillState().cursor,cd:skCd.ab_highness,slots:rotationSkills().map(s=>s.id)}`);
  assert(r.heal>=.35&&r.heal<.36);assert.equal(r.ward,.3);assert.equal(r.duple,20);assert.equal(r.cursor,0);assert.equal(r.cd,6);assert(!r.slots.includes('ab_ward'));
  ev('const hpNow=S.hp;tickCombatSkills(.01);window.healRepeated=S.hp>hpNow');assert.equal(ev('healRepeated'),false);
  ev(`S.skOff.ab_highness=true;S.hp=1;skCd.ab_highness=0;tickCombatSkills(.01)`);assert.equal(ev('S.hp'),1);
 });
 test('Praefatio ranks strengthen its barrier and its cooldown prevents early refresh',()=>{
  setup('Arch Bishop');const r=probe(`S.sk.ab_ward=1;tickCombatSkills(.01);const low=skillState().absorb.amount;S.sk.ab_ward=10;skCd.ab_ward=0;delete skillState().buffs.ab_ward;tickCombatSkills(.01);const high=skillState().absorb.amount;absorbSoak(10);tickCombatSkills(.01);return {low,high,remaining:skillState().absorb.amount}`);
  assert(r.high>r.low);assert.equal(r.remaining,r.high-10);
 });
 test('Chain Lightning bounces inside its pack; Cluster Bomb delays its blast',()=>{
  setup('Warlock');assert.deepEqual(probe(`mobs.push({...mob,x:1},{...mob,x:2,pack:1});let xs=[];const real=skillHit;skillHit=(o,n)=>{xs.push(o.x);return 1};castSkill(SKILLS.find(s=>s.id==='wl_chain'),1);skillHit=real;return xs`),[0,1]);
  setup('Ranger');assert(ev(`castSkill(SKILLS.find(s=>s.id==='rg_cluster'),1);skillState().events.length===1`));ev('tickCombatSkills(.61)');assert.equal(ev('skillState().events.length'),0);
 });
 test('old ranks and stable IDs survive save reload; converted buffs are removed from attack slots',()=>{
  setup();const r=probe(`S.sk.gc_veil=7;comboConfig().slots=['gc_cross','gc_slip','gc_veil','gc_roll','gc_ripper',null];localStorage.setItem(saveKey(),JSON.stringify(S));S=load();return {rank:S.sk.gc_veil,slots:comboConfig().slots}`);
  assert.equal(r.rank,7);assert.deepEqual(r.slots,['gc_cross','gc_slip',null,'gc_roll','gc_ripper',null]);
 });
 test('daggers still count as katars for Guillotine Cross',()=>{assert(ev('dualWield("Guillotine Cross")&&katarOnly("Guillotine Cross")'))});
 console.log(passed+' passed');
}finally{g.close();live.close()}
