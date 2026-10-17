// Derive ordinary-player reward rates from actual kill counts and real reward helpers.
// Does not rerun combat or change measured damage/kill times.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createGame}=require('./tests/helpers/game');
const {renderSummary,REWARD_WARNING}=require('./lib/field_reports.cjs');
process.chdir(path.resolve(__dirname,'..'));
const dir=process.argv[2]||'reports/field-combat',report=JSON.parse(fs.readFileSync(path.join(dir,'comparison.json')));
const source=fs.readFileSync('index.html','utf8');assert.equal(crypto.createHash('sha256').update(source).digest('hex'),report.metadata.sourceSha256,'Source changed since measurements');
const game=createGame(source),rates={};
try{
 for(const c of report.configs)for(const field of c.fields){
  const f=report.metadata.fields[field];
  rates[c.id+'|'+field]=JSON.parse(game.ev(`S=JSON.parse(${JSON.stringify(JSON.stringify(c.fixture))});S.mp=${f.map};S.lvl=${f.stage};
   JSON.stringify((()=>{const regular=fieldExpReward(S.mp,S.lvl,false),boss=fieldExpReward(S.mp,S.lvl,true),nativeRate=expRate(),nativeZeny=gx();S.gm=false;return{nativeRate,nativeZeny,normalRate:expRate(),normalZeny:gx(),nativeRegular:Math.round(regular*nativeRate),nativeBoss:Math.round(boss*nativeRate),normalRegular:Math.round(regular*expRate()),normalBoss:Math.round(boss*expRate())}})())`));
 }
 const rows=report.results.map(row=>{
  const r=rates[row.config+'|'+row.field];
  const normal=sample=>{if(!sample)return null;const regular=sample.kills-sample.bossKills;
   const predicted=(regular*r.nativeRegular+sample.bossKills*r.nativeBoss)*60/sample.seconds;
   assert.ok(Math.abs(predicted-sample.expPerMinute)<.001,'Native reward reconciliation: '+row.config+' '+row.seed);
   return{...sample,nativeExpPerMinute:sample.expPerMinute,nativeZenyPerMinute:sample.zenyPerMinute,expPerMinute:(regular*r.normalRegular+sample.bossKills*r.normalBoss)*60/sample.seconds,zenyPerMinute:sample.zenyPerMinute*r.normalZeny/r.nativeZeny};};
  return{...row,farm:normal(row.farm),boss:normal(row.boss)};
 });
 const summaries=report.summaries.map(summary=>{
  const parts={};for(const timing of ['before','after']){
   const samples=rows.filter(r=>r.config===summary.config&&r.field===summary.field&&r.timing===timing);
   parts[timing]={...summary[timing],expPerMinute:samples.reduce((n,r)=>n+r.farm.expPerMinute,0)/samples.length,zenyPerMinute:samples.reduce((n,r)=>n+r.farm.zenyPerMinute,0)/samples.length};
  }
  return{...summary,...parts,expChangePercent:parts.before.expPerMinute?(parts.after.expPerMinute/parts.before.expPerMinute-1)*100:null};
 });
 const md=renderSummary(report,summaries);
 fs.writeFileSync(path.join(dir,'ordinary-rates.json'),JSON.stringify({sourceSha256:report.metadata.sourceSha256,explanation:'Ordinary Lv150 rewards derived from measured kills and real helpers; original combat measurements unchanged.',rates,summaries},null,2)+'\n');
 fs.writeFileSync(path.join(dir,'results.md'),md);
 const nativePath=path.join(dir,'comparison.md'),native=fs.readFileSync(nativePath,'utf8');
 const notice=REWARD_WARNING;
 if(!native.includes('Reward-rate warning:'))fs.writeFileSync(nativePath,native.replace('# Real-field combat comparison — timing only\n\n','# Real-field combat comparison — timing only\n\n'+notice));
 console.log('Reconciled',rows.length,'farm sessions and',rows.filter(r=>r.boss).length,'boss trials; wrote ordinary-rate results.');
}finally{game.close()}
