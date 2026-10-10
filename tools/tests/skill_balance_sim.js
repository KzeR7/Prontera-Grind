// Frozen real-update measurements guard sustained damage and companion power.
// Regenerate with tools/skill_balance.js; moving encounters have a separate report.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'index.html'))).digest('hex');
const key=r=>JSON.stringify([r.cls,r.profile,r.weapon,r.count]);
let checked=0,worst=0,singleWorst=0,petWorst=0;
for(const suffix of ['', '_seed987']){
 const read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures',name+suffix+'.json')));
 const before=read('skill_balance_before'),after=read('skill_balance_after');
 assert.equal(after.sourceHash,hash,'Measurements are stale: rerun tools/skill_balance.js'+(suffix?' with SKILL_SEED=987':''));
 assert.equal(before.revision,'731426a73612bcd0550f0823361978830d214f76');
 assert.equal(before.seed,after.seed);assert.equal(before.seconds,300);assert.equal(after.seconds,300);
 assert.equal(after.rows.length,126);assert.equal(new Set(after.rows.map(key)).size,126);
 const originals=new Map(before.rows.map(r=>[key(r),r]));
 for(const row of after.rows){
  const original=originals.get(key(row));assert.ok(original,'Missing baseline '+key(row));
  const error=Math.abs(row.dps/original.dps-1),petError=Math.abs(row.petMean/original.petMean-1);
  assert.ok(error<=(row.count===1?.05:.10),`${key(row)} DPS differs by ${(error*100).toFixed(2)}%`);
  assert.ok(petError<=.05,`${key(row)} companion power differs by ${(petError*100).toFixed(2)}%`);
  worst=Math.max(worst,error);if(row.count===1)singleWorst=Math.max(singleWorst,error);petWorst=Math.max(petWorst,petError);checked++;
 }
}
console.log(`${checked} sustained scenarios passed; worst single-target ${(singleWorst*100).toFixed(2)}%, all-target DPS ${(worst*100).toFixed(2)}%; companion ${(petWorst*100).toFixed(2)}%.`);
