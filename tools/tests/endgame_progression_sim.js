// Real shipped helpers: back-loaded offense, unchanged endgame caps/support/timing/save data.
const assert=require('node:assert/strict'),{createGame}=require('./helpers/game');
const {fourthSetup,progressSetup}=require('./helpers/endgame');
const g=createGame(),ev=g.ev;let passed=0;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const test=(name,fn)=>{fourthSetup(g,'Rune Knight','sword');fn();passed++;console.log('ok '+name)};
try{
 test('zero Ascension means no transfer damage grant; rank-zero upgrades are zero',()=>{
  progressSetup(g,'transfer');close(ev('ascDamage({boss:true})'),1);
  for(const k of ['might','precision','ferocity','slayer'])close(ev(`ascStat('${k}')`),0);
  close(ev("ascSkillValue('rk_charge','damage')"),0);assert.equal(ev('Object.keys(ascensionSetBonuses()).length'),0);
 });
 test('offensive stat ranks are quadratic, monotonic and retain their maximum',()=>{
  for(const key of ['might','precision','ferocity','slayer']){
   let previous=0,delta=0;for(let rank=0;rank<=10;rank++){
    const value=ev(`ascStatValue('${key}',${rank})`),step=ev(`ASC_STATS['${key}'].step`);
    close(value,step*rank*rank/10);assert.ok(value>=previous);if(rank){assert.ok(value-previous>=delta-1e-8);delta=value-previous;}previous=value;
   }
  }
  ev("ascState().stats[S.cls]={might:5};ascState().level=5");close(ev("ascStat('might')"),2.5);
  ev("S.cls='Lord Knight'");close(ev("ascStat('might')"),0);
 });
 test('support stats and cooldown/utility upgrades retain their original linear values',()=>{
  for(const k of ['vitality','guard','haste','evasion'])for(let rank=0;rank<=10;rank++)close(ev(`ascStatValue('${k}',${rank})`),ev(`ASC_STATS['${k}'].step`)*rank);
  for(const key of ['heal','regen','duration','barrier','cooldown','area','range','root','stun','slow'])for(let rank=0;rank<=5;rank++)close(ev(`ascUpgradeScale('${key}',${rank})`),rank/5);
 });
 test('all offensive skill modifiers mature at final ranks; UI reflects actual rank values',()=>{
  for(const key of ['damage','boss','critical','vulnerable','buff'])for(let rank=0;rank<=5;rank++)close(ev(`ascUpgradeScale('${key}',${rank})`),(rank/5)**2);
  ev("ascState().skills[S.cls]={level:1,xp:0,ranks:{rk_charge:1}}");close(ev("ascSkillValue('rk_charge','damage')"),1);
  assert.match(ev("ascUpgradeText('rk_charge',1)"),/\+1% skill damage/);
  assert.match(ev('ascensionProgressPanel(true)'),/final ranks grant the largest gains/);
  ev("ascState().stats[S.cls]={might:5};ascState().level=5");assert.match(ev('ascensionProgressPanel(false)'),/\+2.5%/);
 });
 test('new damaging signatures unlock at modest power and reach full cast power only at rank five',()=>{
  for(const [cls,id]of [['Warlock','wl_vortex'],['Mechanic','mc_magma']]){
   fourthSetup(g,cls,cls==='Mechanic'?'axe':'staff');for(let rank=1;rank<=5;rank++){
    ev(`ascState().skills[S.cls]={level:${rank},xp:0,ranks:{'${id}':${rank}}}`);
    close(ev(`ascSignaturePower(SKILLS.find(s=>s.id==='${id}'))`),.4+.6*(rank/5)**2);
   }
  }
 });
 test('Mythic offensive set strength scales after +10, without changing item records/support/speed',()=>{
  for(const set of ev('Object.keys(ASC_SETS)')){
   ev(`S.eq=Object.fromEntries(['weapon','armor','head','leg','acc1','acc2'].map((slot,i)=>[slot,{id:i,sec:6,ascSet:'${set}',r:10,val:123,aff:[],cards:[]}]))`);
   const original=ev('JSON.stringify(S.eq)');
   for(const key of ev(`Object.keys(ASC_SETS['${set}'].bonuses[2].stats)`)){
    const max=ev(`ASC_SETS['${set}'].bonuses[2].stats['${key}']`),actual=ev(`ascensionSetBonuses()['${set}'].tier.stats['${key}']`);
    close(actual,max*(['atk','matk','crit','cdm','field'].includes(key)?.4:1));
   }
   assert.equal(ev('JSON.stringify(S.eq)'),original);
   ev('for(const it of items())it.r=15');
   assert.deepEqual(JSON.parse(ev(`JSON.stringify(ascensionSetBonuses()['${set}'].tier.stats)`)),JSON.parse(ev(`JSON.stringify(ASC_SETS['${set}'].bonuses[2].stats)`)));
  }
 });
 test('mixed refinement, lower-tier floors and extra pieces cannot reduce earned set offense',()=>{
  ev(`S.eq={weapon:{sec:6,ascSet:'celestial',r:15},head:{sec:6,ascSet:'celestial',r:15}}`);
  close(ev("ascensionSetBonuses().celestial.tier.stats.atk"),5);
  ev("S.eq.armor={sec:6,ascSet:'celestial',r:0};S.eq.leg={sec:6,ascSet:'celestial',r:0}");
  assert.ok(ev('ascensionSetBonuses().celestial.tier.stats.atk')>=5);
  ev("for(const it of items())it.r=15;S.eq.acc1={sec:6,ascSet:'celestial',r:15};S.eq.acc2={sec:6,ascSet:'celestial',r:15};window.earned=ascensionSetBonuses().celestial.tier.stats.atk;S.eq.off={sec:6,ascSet:'celestial',r:0}");
  close(ev('ascensionSetBonuses().celestial.tier.stats.atk'),ev('earned'));
 });
 test('every build retains max bonuses and equipment/ASPD/skill spacing/recovery are untouched',()=>{
  for(const cls of ev('CD4.map(x=>x[0])')){
   fourthSetup(g,cls,ev(`CLASSES[${JSON.stringify(cls)}].wt[0]`));progressSetup(g,'full');
   close(ev("ascStat('might')"),10);close(ev("ascStat('precision')"),10);close(ev("ascStat('ferocity')"),30);close(ev("ascStat('slayer')"),15);
   for(const id of ev('SKILLS4.filter(s=>s.from===S.cls).map(s=>s.id)'))for(const key of ev(`Object.keys(ASC_UPGRADES['${id}'])`))close(ev(`ascSkillValue('${id}','${key}')`),ev(`ASC_UPGRADES['${id}']['${key}']`));
   assert.ok(ev('rotationSkills().every(s=>(s.spacing||.5)===(s.id===\'gc_roll\'?.2:.5))'));
   ev('finishCombo(skillState())');close(ev('skillState().recoverUntil-t'),3);
  }
 });
 test('reload, reset and class/account replacement retain earnings and never grant stale bonuses',()=>{
  progressSetup(g,'mid');const old=ev('JSON.stringify(S.ascension)');
  ev('localStorage.setItem(saveKey(),JSON.stringify(S));S=load()');assert.equal(ev('JSON.stringify(S.ascension)'),old);
  ev("resetAscension(false);resetAscension(true)");assert.equal(ev('ascState().level'),25);close(ev("ascStat('might')"),0);
  ev("S.cls='Warlock'");close(ev("ascStat('might')"),0);ev("currentUser='another-account';S=fresh();S.cls='Rune Knight'");close(ev("ascStat('might')"),0);
 });
 console.log(passed+' endgame progression checks passed');
}finally{g.close()}
