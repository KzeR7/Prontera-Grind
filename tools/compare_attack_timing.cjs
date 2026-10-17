// Isolate pre-v177 playerAttack timing without changing equipment or the working game.
// node tools/compare_attack_timing.cjs [output directory]
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createGame}=require('./tests/helpers/game');
const {configure,stationary}=require('./skill_balance');
const {outfitted}=require('./progression_balance');
const root=path.resolve(__dirname,'..');
process.chdir(root);
const output=path.resolve(process.argv[2]||'reports/attack-timing');
const timingRef='e996b1134bbf638e95a4f2792dc407b9e0b7bcef^';
const current=fs.readFileSync('index.html','utf8');
const prior=cp.execFileSync('git',['show',timingRef+':index.html'],{encoding:'utf8',maxBuffer:20e6});
function attackSpan(html){
 const start=html.indexOf('function playerAttack(){'),end=html.indexOf('function resolveSwing(s){',start);
 assert.ok(start>=0&&end>start,'playerAttack source boundaries');
 return html.slice(start,end);
}
const oldTiming=attackSpan(prior),newTiming=attackSpan(current);
assert.notEqual(oldTiming,newTiming);
const beforeHtml=current.replace(newTiming,oldTiming);
assert.equal(beforeHtml.replace(oldTiming,newTiming),current,'Only playerAttack differs');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function fourthSetup(g,cls,weapon){
 // Reuse the established reset/seed path, then explicitly configure fourth jobs.
 configure(g,'Lord Knight',2,'sword',789);
 g.ev(`{
 S=fresh();S.cls=${JSON.stringify(cls)};S.lv=150;S.gm=true;S.auto=false;S.adv=false;S.q=null;S.mp=9;S.lvl=15;S.prog=Array(10).fill(10);
 for(const name of lineOf(S.cls))S.jobs[name]={jl:CLASSES[name].mj,jx:0};
 S.sk=Object.fromEntries(SKILLS.filter(s=>s.cls.includes(S.cls)).map(s=>[s.id,s.max]));
 for(const k of Object.keys(S.st))S.st[k]=1;S.pts=totalPts();
 const buy=k=>{if(S.st[k]>=statCap()||S.pts<cost(k))return false;S.pts-=cost(k);S.st[k]++;return true};
 while(S.st.dex<60&&buy('dex')){}
 const priority=[C().main,'agi','luk'].filter((k,i,a)=>a.indexOf(k)===i);
 let more=true;while(more){more=false;for(const k of priority)if(buy(k))more=true;}
 S.eq={};S.inv=[];gmMaxAscensionGear(S.cls);
 const take=fn=>{const i=S.inv.findIndex(fn);if(i<0)throw Error('Missing preset piece');return S.inv.splice(i,1)[0]};
 S.eq.weapon=take(it=>it.slot==='weapon'&&it.wt===${JSON.stringify(weapon)});
 for(const slot of ['armor','head','leg'])S.eq[slot]=take(it=>it.slot===slot);
 S.eq.acc1=take(it=>it.slot==='acc');S.eq.acc2=take(it=>it.slot==='acc');
 if(S.cls==='Guillotine Cross'&&${JSON.stringify(weapon)}==='dagger')S.eq.off=take(it=>it.slot==='weapon'&&it.wt==='dagger');
 S.inv=[];S.pets=[];S.indexXp=0;S.hp=maxHp();S.dmg=0;S.kills=0;S.skOff={};
 resetSkillRuntime();tb={};for(const k in skCd)delete skCd[k];
 swing=null;atkAnim=0;pAtkT=0;t=0;standC={t:-9,r:0};engageTgt=null;
 window.__normalDamage=0;
 }`);
}
function setup(g,c,weapon){
 if(c.tier===4)fourthSetup(g,c.name,weapon);
 else if(c.tier===3)outfitted(g,c.name,2,weapon,true);
 else configure(g,c.name,2,weapon,789);
}
function snapshot(g){return g.ev(`JSON.stringify({cls:S.cls,lv:S.lv,stats:S.st,points:S.pts,jobs:S.jobs,skills:S.sk,equipment:S.eq,index:S.cardIndex,indexXp:S.indexXp,ascension:S.ascension,skillLv:S.skillLv,combo:comboConfig(),pets:S.pets},(k,v)=>k==='id'?undefined:v)`);}
const games={before:createGame(beforeHtml),after:createGame(current)};
const rows=[];
try{
 const classes=JSON.parse(games.after.ev('JSON.stringify(Object.entries(CLASSES).map(([name,c])=>({name,tier:c.tier,weapons:c.wt})))'));
 for(const c of classes)for(const weapon of c.weapons)for(const targets of [1,3]){
  const measurements={},states={};
  for(const side of ['before','after']){
   const g=games[side];setup(g,c,weapon);states[side]=snapshot(g);
   measurements[side]=stationary(g,targets,120);
  }
  assert.equal(states.before,states.after,c.name+' '+weapon+' input state changed');
  for(const field of ['atk','matk','interval'])assert.equal(measurements.before[field],measurements.after[field],c.name+' '+field+' changed');
  assert.ok(Number.isFinite(measurements.before.dps)&&Number.isFinite(measurements.after.dps));
  rows.push({class:c.name,tier:c.tier,weapon,targets,level:JSON.parse(states.after).lv,inputSha256:sha(states.after),before:measurements.before,after:measurements.after,changePercent:(measurements.after.dps/measurements.before.dps-1)*100});
  console.log(c.name,weapon,targets,measurements.before.dps.toFixed(2),'->',measurements.after.dps.toFixed(2));
 }
 const report={sourceSha256:sha(current),timingRef,oldTimingSha256:sha(oldTiming),currentTimingSha256:sha(newTiming),seconds:120,warmupSeconds:20,hz:30,classes:classes.length,builds:rows.length/2,sessions:rows.length*2,method:'Same current page on both sides; replace only playerAttack with its pre-v177 definition in memory. Same seeded setup and skill order per pair, checked equipment/stat/skill snapshot equality, with unchanged ATK/MATK/attack interval. Uses repository stationary harness, renderer/FX stubs and stationary non-attacking targets (single-target crit resistance zero). No farming, survivability, GPU or pet contribution claims.',setups:{early:'Novice/first/second jobs: existing configure profile 2 (Lv 10/49/99), synthetic +6 growth equipment, inherited skills up to rank 10.',third:'Third jobs: existing completed outfitted profile 2, Lv150 +10 N+ equipment/cards and card mastery. Matches earlier Sniper/High Priest examples.',fourth:'Fourth jobs: Lv150 corrected +15 maximum GM preset, empty sockets, maximum ordinary class skills, automatic six-slot combo, no allocated Ascension stats/skills, no pets or card mastery. This is not a fully maxed account.'},rows};
 fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(output,'comparison.json'),JSON.stringify(report,null,2)+'\n');
 const fmt=n=>n>=1e6?(n/1e6).toFixed(3)+'M':n>=1e3?(n/1e3).toFixed(2)+'K':n.toFixed(2);
 const pct=n=>(n>=0?'+':'')+n.toFixed(2)+'%';
 let md='# Attack-timing comparison — every class\n\n**Before:** current game with only `playerAttack()` replaced by its pre-v177 version.\n**After:** current attack timing. Neither side uses the October 10 balance baseline.\n\nEach pair has identical equipment, stats, skills and combo configuration. No game code, equipment balance or test limits were changed.\n\n120 measured seconds after a 20-second warm-up, at 30 simulation steps/second. This is the repository stationary combat harness, not a live boss or farming forecast. Pet damage is not added.\n\n## Setups\n\n';
 for(const [label,text]of Object.entries(report.setups))md+='- **'+label+':** '+text+'\n';
 md+='\nDifferent tier setups are not directly comparable for class balance. Fourth-job numbers use corrected PR #101 GM bases on **both** sides.\n\n';
 for(const [tier,title]of [[4,'Fourth jobs'],[3,'Third jobs'],[2,'Second jobs'],[1,'First jobs'],[0,'Novice']]){
  md+='## '+title+' — single target\n\n| Class | Weapon | Before DPS | After DPS | Change |\n|---|---|---:|---:|---:|\n';
  for(const r of rows.filter(r=>r.tier===tier&&r.targets===1))md+=`| ${r.class} | ${r.weapon} | ${fmt(r.before.dps)} | ${fmt(r.after.dps)} | ${pct(r.changePercent)} |\n`;
  md+='\n';
 }
 md+='## Three-target aggregate DPS\n\nDamage summed across three stationary targets, not DPS per target.\n\n| Class | Weapon | Before DPS | After DPS | Change |\n|---|---|---:|---:|---:|\n';
 for(const r of rows.filter(r=>r.targets===3))md+=`| ${r.class} | ${r.weapon} | ${fmt(r.before.dps)} | ${fmt(r.after.dps)} | ${pct(r.changePercent)} |\n`;
 md+='\n## Verification and limitations\n\n- '+report.classes+' classes; '+report.builds+' weapon builds; '+report.sessions+' sessions (two timings × two target counts).\n- Every pair passed identical input-state checks and unchanged ATK, MATK and base attack-interval checks.\n- Total DPS includes both basic attacks and skills recorded by the established harness. `comparison.json` also includes basic-attack-only DPS, stats and input hashes.\n- Matching initial random seeds does not force matching critical-hit sequences once attack order changes. Results are deterministic fixture measurements, not statistical confidence intervals.\n- More basic attacks can also alter buff uptime, proc order and skill scheduling. A change in total DPS is not an item-stat change.\n- Renderer/FX and selected effect callbacks are stubbed by the existing harness; these numbers are not a complete deployed-combat or physical-device measurement.\n\nReproduce from repository root with Node 24 and the documented jsdom/Three dependencies:\n\n```sh\nnode tools/compare_attack_timing.cjs reports/attack-timing\n```\n';
 fs.writeFileSync(path.join(output,'comparison.md'),md);
 console.log('Verified',report.classes,'classes,',report.builds,'builds,',report.sessions,'sessions. Report:',output);
}finally{for(const g of Object.values(games))g.close();}
