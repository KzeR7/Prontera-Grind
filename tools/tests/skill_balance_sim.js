// v98 supersedes the historical v97 ±5% target: the owner allows +20% completed builds.
// v200 separately reduced off-hand dagger weapon/affix/card contribution from 50% to 35%,
// so only dagger comparisons use a bounded -20% floor. v201's ground-spell budgets/recovery
// require that floor only for the early High Wizard growth profile. Every other build retains -10%.
// Regenerate all three fixtures with tools/progression_balance.js (see progression-redesign.md).
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {combatHash}=require('../progression_balance');
const hash=combatHash(fs.readFileSync('index.html','utf8'));
const key=r=>JSON.stringify([r.cls,r.profile,r.weapon,r.count]);
let complete=0,partial=0,min=Infinity,max=-Infinity;
for(const kind of ['gear','encounters','skills']){
 const f=JSON.parse(fs.readFileSync(`${__dirname}/fixtures/progression_${kind}.json`));
 assert.equal(f.baselineRevision,'d164bd0527cfe335f9c183d0e576800716b7dd26');
 assert.equal(f.baselineHash,'a251cffc5abeea9ab881fd471e99f36bf4c6aa8cd1f4dcdecb3a2bc982cca0e3');
 assert.equal(f.toolHash,crypto.createHash('sha256').update(fs.readFileSync('tools/progression_balance.js')).digest('hex'),'Benchmark tool changed');
 assert.equal(f.combatHash,hash,`${kind} measurements stale: rerun progression_balance.js`);
 assert.equal(f.after.length,kind==='gear'?42:kind==='skills'?63:21);
 assert.equal(new Set(f.after.map(key)).size,f.after.length);
 const originals=new Map(f.before.map(r=>[key(r),r]));
 for(const a of f.after){const b=originals.get(key(a));assert.ok(b,'Missing baseline '+key(a));
  if(kind==='gear'){
   const delta=a.dps/b.dps-1;assert.ok(Number.isFinite(delta));
   const floor=a.weapon==='dagger'?-.20:-.10;
   assert.ok(delta>=floor,`${key(a)} loses more than ${Math.abs(floor)*100}% DPS: ${delta}`);
   if(a.profile===2){assert.ok(delta<=.20,`${key(a)} exceeds +20% DPS: ${delta}`);complete++;min=Math.min(min,delta);max=Math.max(max,delta);}else partial++;
  }else if(kind==='encounters'){
   assert.ok(a.kills>0&&a.deaths<=b.deaths,`${key(a)} farming regression`);
   assert.ok(!b.bossWin||a.bossWin,`${key(a)} lost a previously successful boss fight`);
  }else {assert.ok(a.dps>0&&Number.isFinite(a.dps)&&a.stats.int>=1,'Invalid growth scenario '+key(a));const floor=a.cls==='High Wizard'&&a.profile===0?.8:.9;assert.ok(a.dps/b.dps>=floor,`Growth build loses >${(1-floor)*100}% DPS `+key(a));}
 }
}
console.log(`${complete} completed and ${partial} incomplete damage scenarios passed; completed DPS ${(min*100).toFixed(2)}% to +${(max*100).toFixed(2)}%. 21 moving and 63 growth scenarios valid.`);
