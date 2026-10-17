// Paired, real-update progression measurements; before source is explicit and immutable.
// node tools/compare_endgame_progression.cjs <before.html> [output directory]
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createGame}=require('./tests/helpers/game'),{stationary}=require('./skill_balance');
const {fourthSetup,progressSetup}=require('./tests/helpers/endgame');
const beforePath=process.argv[2];if(!beforePath)throw Error('Pass the pre-change HTML source');
const source={before:fs.readFileSync(beforePath,'utf8'),after:fs.readFileSync('index.html','utf8')};
const out=path.resolve(process.argv[3]||'reports/endgame-progression-v187'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const builds=[['Rune Knight','sword'],['Warlock','staff'],['Ranger','bow'],['Guillotine Cross','katar'],['Guillotine Cross','dagger'],['Arch Bishop','mace'],['Mechanic','axe'],['Mechanic','mace']];
const stages=['transfer','evolved','mid','late','full','reference'],rows=[],games=Object.fromEntries(Object.entries(source).map(([s,html])=>[s,createGame(html)]));
try{
 for(const [cls,weapon]of builds)for(const stage of stages){
  const result={},states={};
  for(const side of ['before','after']){
   const g=games[side];fourthSetup(g,cls,weapon);progressSetup(g,stage);
   states[side]=g.ev('JSON.stringify({cls:S.cls,stats:S.st,eq:S.eq,skills:S.sk,ascension:S.ascension,pets:S.pets,combo:comboConfig()})');
   result[side]=stationary(g,1,120);
  }
  assert.equal(states.before,states.after,'Paired input drift');
  if(['transfer','full','reference'].includes(stage))assert.equal(result.after.dps,result.before.dps,stage+' must retain DPS');
  if(['evolved','mid','late'].includes(stage))assert.ok(result.after.dps<=result.before.dps,'Back-loading must not buff early investment');
  rows.push({cls,weapon,stage,inputHash:sha(states.after),...result});
  console.log(cls,weapon,stage,result.before.dps.toFixed(2),'->',result.after.dps.toFixed(2));
 }
 for(const [cls,weapon]of builds){let last=0;for(const stage of ['evolved','mid','late','full']){const r=rows.find(r=>r.cls===cls&&r.weapon===weapon&&r.stage===stage);assert.ok(r.after.dps>last,'Non-monotonic progression');last=r.after.dps;}}
 fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify({beforeSourceHash:sha(source.before),afterSourceHash:sha(source.after),seed:789,seconds:120,warmup:20,hz:30,sessions:rows.length*2,rows},null,2)+'\n');
 const fmt=x=>(x/1e6).toFixed(3)+'M';
 const md=['# v187 — late-investment progression','',
 'Paired v186/v187 real-update stationary boss-target measurements. Same inputs, seed 789, 20s warm-up + 120s measured, 30 Hz; no pets or card mastery, empty sockets. Renderer/FX are stubbed. These are not full-account maxima, owner-save matches, field income or survival forecasts. No boss crit resistance on this stationary target. Ordinary class skills/job levels are maximum throughout; the transfer stage is a zero-Ascension N+ proxy, not a fresh Job 1 save.','',
 'Stages: transfer = generated +10 N+ with no Ascension; evolved = +10 corrected maximum Mythic preset, no Ascension; mid = +10 Mythic, 25 stat points / 15 skill ranks; late = +13 Mythic, 40 / 24; full = +15 Mythic, 50 / 30. Offensive stat preset: Might/Precision/Ferocity/Slayer/Vitality equally allocated. Reference = +15 Mythic with zero Ascension, matching the earlier timing comparison setup.','',
 'Every paired input snapshot matched. Transfer, full investment and reference DPS match v186 exactly. Intermediate investment is lower than v186, deliberately moving power later; evolved → mid → late → full increases for every build. The old reference targets are already exceeded by the fully invested existing bonuses; no blanket extra +47% was added. The earlier 50/30/20 proposal is not an exact measured attribution.','',
 '| Class / weapon | Transfer v187 | Evolved v186 → v187 | Mid v186 → v187 | Late v186 → v187 | Full v186 = v187 |','|---|---:|---:|---:|---:|---:|'];
 for(const [cls,weapon]of builds){const r=Object.fromEntries(rows.filter(r=>r.cls===cls&&r.weapon===weapon).map(r=>[r.stage,r]));md.push(`| ${cls} / ${weapon} | ${fmt(r.transfer.after.dps)} | ${fmt(r.evolved.before.dps)} → ${fmt(r.evolved.after.dps)} | ${fmt(r.mid.before.dps)} → ${fmt(r.mid.after.dps)} | ${fmt(r.late.before.dps)} → ${fmt(r.late.after.dps)} | ${fmt(r.full.after.dps)} |`);}
 fs.writeFileSync(path.join(out,'summary.md'),md.join('\n')+'\n');console.log('Paired progression checks passed:',rows.length,'pairs /',rows.length*2,'sessions.');
}finally{for(const g of Object.values(games))g.close();}
