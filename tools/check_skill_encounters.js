// Report actual moving encounters separately from stationary damage.
// --strict enforces the original proposed ±5% farming/boss-time gates.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),suffix=process.argv.includes('--nightmare')?'_nightmare':'';
const read=n=>JSON.parse(fs.readFileSync(path.join(__dirname,'tests/fixtures',n+suffix+'.json')));
const before=read('skill_encounters_before'),after=read('skill_encounters_after');
assert.equal(after.sourceHash,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'index.html'))).digest('hex'),'Encounter measurements are stale');
assert.equal(before.seconds,after.seconds);assert.equal(before.rows.length,after.rows.length);
let failed=0;
for(const row of after.rows){
 const original=before.rows.find(r=>r.cls===row.cls&&r.weapon===row.weapon&&r.pet===row.pet);assert.ok(original);
 assert.deepEqual(row.bossAttempts.map(a=>[a.seed,a.bossHp]),original.bossAttempts.map(a=>[a.seed,a.bossHp]),'Boss HP or seeds changed');
 const farm=row.kph/original.kph-1,allWins=row.bossWins===5&&original.bossWins===5,boss=allWins?row.bossMedian/original.bossMedian-1:null;
 const violation=Math.abs(farm)>.05||boss!==null&&Math.abs(boss)>.05||row.bossWins<original.bossWins||row.deaths>original.deaths;
 if(violation)failed++;
 console.log(`${row.cls}${row.weapon?' / '+row.weapon:''}${row.pet?' + pet':''}: farming ${(100*farm).toFixed(1)}%; boss ${boss===null?`wins ${original.bossWins}/5 → ${row.bossWins}/5`:(100*boss).toFixed(1)+'% time'}; field deaths ${original.deaths} → ${row.deaths}${violation?' [outside proposed gate]':''}`);
}
console.log(`${failed}/${after.rows.length} moving setups outside the proposed gates. Boss defeat/timeout is never counted as a kill.`);
if(process.argv.includes('--strict')&&failed)process.exitCode=1;
