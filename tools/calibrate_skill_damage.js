// Fit total offensive and secondary-target coefficients to frozen baseline measurements.
// Run after tools/skill_balance.js captured uncalibrated working-tree rows.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const before=JSON.parse(fs.readFileSync(path.join(root,'tools/tests/fixtures/skill_balance_before.json'))).rows;
const after=JSON.parse(fs.readFileSync(path.join(root,'tools/tests/fixtures/skill_balance_after.json'))).rows;
const out={};
for(const cls of new Set(after.map(r=>r.cls))){if(cls==='Novice')continue;const row={single:[],area:[],companion:1};
 for(let profile=0;profile<3;profile++){
  const get=(rows,count)=>rows.find(r=>r.cls===cls&&r.profile===profile&&r.count===count&&(!r.weapon||r.weapon==='katar'));
  const b=get(before,1),bp=get(before,3),a=get(after,1),ap=get(after,3);
  if(!a||!ap||!b||!bp||!Number.isFinite(a.autoDps))throw Error('Missing measured inputs: '+cls+' '+profile);
  const single=(b.dps-a.autoDps)/(a.dps-a.autoDps),area=(bp.dps-b.dps)/(single*(ap.dps-a.dps));
  if(!(single>0&&area>0&&single<5&&area<5))throw Error('Unfit budget: '+cls+' '+profile+' '+single+' '+area);
  row.single.push(+single.toFixed(5));row.area.push(+area.toFixed(5));
 }out[cls]=row;
}
const file=path.join(root,'index.html'),src=fs.readFileSync(file,'utf8');
if(!src.includes('const SKILL_TUNING={};'))throw Error('Refuse to fit already calibrated results; restore an empty table and measure first.');
fs.writeFileSync(file,src.replace('const SKILL_TUNING={};','const SKILL_TUNING='+JSON.stringify(out,null,1)+';'));
console.log('Fitted',Object.keys(out).length,'class budgets. Fresh verification is required.');
