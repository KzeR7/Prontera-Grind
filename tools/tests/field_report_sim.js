// Pure production renderers over recorded full-run data and adversarial quick/missing results.
const assert=require('node:assert/strict');
const {renderComparison,renderSummary,bossReduction}=require('../lib/field_reports.cjs');
const report=require('../../reports/field-combat/comparison.json');
const ordinary=require('../../reports/field-combat/ordinary-rates.json');
const copy=x=>JSON.parse(JSON.stringify(x));let passed=0;
const test=(name,fn)=>{fn();passed++;console.log('ok '+name)};
test('native comparison generator includes the GM x100 warning before normalization',()=>{
 const md=renderComparison(report);
 assert.match(md,/Reward-rate warning: fourth-job fixtures use GM x100 rewards/);
 assert.match(md,/third-job fixtures use ordinary player rates/);
 assert.equal((md.match(/Reward-rate warning:/g)||[]).length,1);
 assert.match(md,/246 farming sessions and 216 independent boss attempts/);
});
test('full summary takes counts, durations and Astral wins from recorded data',()=>{
 const md=renderSummary(report,ordinary.summaries);
 assert.match(md,/246 farming sessions \(180 seconds each, 3 seeds\) and 216 independent boss attempts/);
 assert.match(md,/first win\/death or 90 seconds/);
 assert.match(md,/5 Astral fixtures: 15\/15 independent boss wins before; 15\/15 after/);
 assert.match(md,/3 seeds: 9 minutes per build\/timing/);
 assert.match(md,/0\/3 · —/);
 assert.ok(!md.includes('Quick harness check only'));
});
test('one-seed quick summary reports its real metadata and per-side trials',()=>{
 const quick=copy(report);quick.metadata={...quick.metadata,quick:true,seeds:[101],farmSeconds:10,bossLimit:10,fieldSessions:82,independentBossAttempts:72};
 const summaries=copy(ordinary.summaries).map(s=>{for(const side of ['before','after']){s[side].bossAttempts=s[side].bossAttempts?1:0;s[side].bossWins=Math.min(s[side].bossWins,1);}return s});
 const md=renderSummary(quick,summaries);
 assert.match(md,/82 farming sessions \(10 seconds each, 1 seed\) and 72 independent boss attempts/);
 assert.match(md,/first win\/death or 10 seconds/);
 assert.match(md,/Quick harness check only — not acceptance evidence/);
 assert.match(md,/5 Astral fixtures: 5\/5 independent boss wins before; 5\/5 after/);
 assert.match(md,/1 seed: 0.17 minutes per build\/timing/);
 assert.doesNotMatch(md,/\b\d+\/3\b/);assert.ok(!md.includes('180 seconds'));assert.ok(!md.includes('nine minutes'));
});
test('nonstandard seed count and asymmetric attempts cannot claim every fixture won',()=>{
 const r=copy(report);r.metadata={...r.metadata,seeds:[11,22],farmSeconds:45,bossLimit:17,fieldSessions:4,independentBossAttempts:3};
 const s=copy(ordinary.summaries.find(s=>s.field==='astral'));s.before.bossWins=2;s.before.bossAttempts=2;s.after.bossWins=0;s.after.bossAttempts=1;s.after.bossMeanWinSeconds=null;
 const md=renderSummary(r,[s]);
 assert.match(md,/4 farming sessions \(45 seconds each, 2 seeds\) and 3 independent boss attempts/);
 assert.match(md,/1 Astral fixtures: 2\/2 independent boss wins before; 0\/1 after/);
 assert.match(md,/2 seeds: 1.5 minutes per build\/timing/);
 assert.ok(!md.includes('won all'));assert.ok(!md.includes('GX has no successful'));
});
test('missing either boss mean renders an em dash rather than 100%, NaN or Infinity',()=>{
 for(const [before,after]of [[null,10],[10,null],[null,null],[undefined,10],[10,undefined],[0,10],[Infinity,10],[10,NaN]]){
  assert.equal(bossReduction(before,after),null);
  const s=copy(ordinary.summaries.find(s=>s.group==='third'));s.before.bossMeanWinSeconds=before;s.after.bossMeanWinSeconds=after;
  const md=renderSummary(report,[s]),line=md.split('\n').find(line=>line.startsWith('| '+s.config.replace(/ AGI\d+$/,'')));
  assert.equal(line.split('|')[4].trim(),'—');assert.doesNotMatch(line,/NaN|Infinity|\+100\.0%/);
 }
});
test('valid positive boss means keep the existing reduction formula and signs',()=>{
 assert.equal(bossReduction(20,10),50);assert.equal(bossReduction(10,20),-100);
 const s=copy(ordinary.summaries.find(s=>s.group==='third'));s.before.bossMeanWinSeconds=20;s.after.bossMeanWinSeconds=10;
 assert.match(renderSummary(report,[s]),/20\.00s → 10\.00s \| \+50\.0%/);
});
console.log(passed+' field-report checks passed');
