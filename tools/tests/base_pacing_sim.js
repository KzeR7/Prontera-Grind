// Exercise actual Base requirements, rewards and saved progress independently of Job pacing.
const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;let passed=0;
function test(name,fn){ev('S=fresh();t=0;resetSkillRuntime()');fn();passed++;console.log('  ok '+name)}
try{
 test('early Base requirements retain their anchors; late requirements match the approved increase',()=>{
  for(const [level,expected]of [[1,18],[10,360],[50,2870],[70,130000],[99,167000],[100,130000],[120,588000],[140,2114000],[149,3543000]]){
   ev(`S.lv=${level}`);assert.equal(ev('need()'),expected,'Base '+level);assert.equal(ev('need()'),ev('baseNeedAt(S.lv)'));
  }
 });
 test('actual level-up keeps EXP carry and awards stat points once at the new threshold',()=>{
  ev('S.lv=100;S.exp=129999;window.before=S.pts;checkLevel()');assert.equal(ev('S.lv'),100);
  ev('S.exp=need()+123;checkLevel()');assert.equal(ev('S.lv'),101);assert.equal(ev('S.exp'),123);assert.equal(ev('S.pts-before'),24);
  ev('checkLevel()');assert.equal(ev('S.pts-before'),24);
 });
 test('the cap preserves earned levels and uses the increased final requirement',()=>{
  ev('S.lv=149;S.exp=3543000+500;checkLevel()');assert.equal(ev('S.lv'),150);assert.equal(ev('S.exp'),500);
  ev('S.exp=1e9;checkLevel()');assert.equal(ev('S.lv'),150);
 });
 test('old saves preserve level, EXP, stats and Job progression without a refund or reset',()=>{
  ev(`S.lv=120;S.exp=500000;S.st.int=87;S.jobs.Novice={jl:5,jx:45};window.budget=S.pts;lsPut(saveKey(),JSON.stringify(S));S=load()`);
  assert.equal(ev('S.lv'),120);assert.equal(ev('S.exp'),500000);assert.equal(ev('S.st.int'),87);assert.equal(ev('S.pts'),ev('budget'));assert.equal(ev('S.jobs.Novice.jx'),45);
 });
 test('Job requirements and contract EXP keep their shared reference curve',()=>{
  assert.equal(ev('needAt(100)'),86500);assert.equal(ev('needAt(140)'),1409000);
  for(const cls of ['Mage','Wizard','High Wizard']){
   ev(`S.cls=${JSON.stringify(cls)};S.jobs[S.cls]={jl:20,jx:0}`);
   assert.equal(ev('jneed(20)'),ev('(()=>{const L=20+JOFF[C().tier],n=needAt(L),e=epkOf(L);return Math.max(1,Math.floor(.7*n*e/(e+n*qrOf(L))))})()'));
  }
  ev("S.lv=140;questView='daily'");assert.ok(ev('questRows().every(q=>q.xp===14090)'));
  ev("questView='all'");assert.ok(ev('questRows().every(q=>q.xp===28180)'));
 });
 test('measured offline payout keeps EXP/min, efficiency and cap while respecting the new threshold',()=>{
  const result=JSON.parse(ev(`JSON.stringify((()=>{
   const now=Date.UTC(2026,9,14,12);S.lv=100;S.offlineAt=now-8*3600000;S.offlineIncome={key:'Novice:0:1',at:S.offlineAt,version:1,xp:1000,zeny:0,job:0,kph:0};
   const r=applyOfflineProgress(now);return {paid:r.exp,credited:r.creditedMs,level:S.lv,carry:S.exp};
  })())`));
  assert.deepEqual(result,{paid:120000,credited:240*60000,level:100,carry:120000});
 });
 test('an offline claim crosses levels using increased requirements and preserves the remainder',()=>{
  const result=JSON.parse(ev(`JSON.stringify((()=>{
   const now=Date.UTC(2026,9,14,12);S.lv=99;S.exp=167000-1;S.offlineAt=now-4*3600000;S.offlineIncome={key:'Novice:0:1',at:S.offlineAt,version:1,xp:1100,zeny:0,job:0,kph:0};
   const r=applyOfflineProgress(now);return {paid:r.exp,level:S.lv,carry:S.exp};
  })())`));
  assert.deepEqual(result,{paid:132000,level:101,carry:1999});
 });
 console.log(`Base pacing: ${passed} passed`);
}finally{g.close()}
