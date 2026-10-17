// Real field-loop timing comparison. Never changes the game file or balance limits.
// node tools/compare_field_combat.cjs [output directory] [--quick]
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createGame}=require('./tests/helpers/game');
const {outfitted}=require('./progression_balance');
const {renderComparison}=require('./lib/field_reports.cjs');
const root=path.resolve(__dirname,'..');process.chdir(root);
const out=path.resolve(process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:'reports/field-combat');
const quick=process.argv.includes('--quick'),seeds=quick?[101]:[101,202,303],farmSeconds=quick?10:180,bossLimit=quick?10:90;
const current=fs.readFileSync('index.html','utf8'),old=cp.execFileSync('git',['show','e996b1134bbf638e95a4f2792dc407b9e0b7bcef^:index.html'],{encoding:'utf8',maxBuffer:20e6});
const span=s=>s.slice(s.indexOf('function playerAttack(){'),s.indexOf('function resolveSwing(s){'));
const before=current.replace(span(current),span(old));assert.equal(before.replace(span(old),span(current)),current);
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function instrument(source){
 const patches=[
  ['function hurt(o,d,col,c,skill=false){S.dmg=',"function hurt(o,d,col,c,skill=false){window.__record(o,d,window.__damageSource||(skill?'skill':'other'));S.dmg="],
  ['S.dmg=(S.dmg||0)+d;mob.hp-=d;',"window.__record(mob,d,window.__damageSource||(skill?'skill':'basic'));S.dmg=(S.dmg||0)+d;mob.hp-=d;"],
  ['S.dmg=(S.dmg||0)+dv;m.hp-=dv;',"window.__record(m,dv,'dot');S.dmg=(S.dmg||0)+dv;m.hp-=dv;"],
  ["if(s.double){skillNameFloat('Twin Strike');if(mob&&mob.hp>0)strike(1)}","if(s.double){skillNameFloat('Twin Strike');if(mob&&mob.hp>0){const source=window.__damageSource;window.__damageSource='proc';try{strike(1)}finally{window.__damageSource=source}}}"],
 ];
 for(const [a,b]of patches){assert.equal(source.split(a).length,2,'Unique instrumentation anchor: '+a);source=source.replace(a,b);}
 return source;
}
function boot(html){
 const g=createGame(instrument(html));
 g.ev(`window.__ledger=null;window.__damageSource=null;
 window.__record=(target,damage,category)=>{const a=window.__ledger;if(!a)return;const k=Object.hasOwn(a.raw,category)?category:'other';a.raw[k]+=damage;a.effective[k]+=Math.min(Math.max(0,target.hp),damage);};
 const realSkillHit=skillHit;skillHit=(target,raw,sk,proc=false)=>{const source=window.__damageSource;window.__damageSource=proc?'proc':'skill';try{return realSkillHit(target,raw,sk,proc)}finally{window.__damageSource=source}};
 const realPetHit=petHit;petHit=(...args)=>{const source=window.__damageSource;window.__damageSource='pet';try{return realPetHit(...args)}finally{window.__damageSource=source}};
 const realKill=kill;kill=(target=mob)=>{if(window.__ledger&&target&&target.hp<=0&&mobs.includes(target)){window.__ledger.kills++;if(target.boss)window.__ledger.bossKills++;}try{return realKill(target)}finally{S.pets=[]}};
 log=(message)=>{if(window.__ledger&&String(message).startsWith('You were defeated'))window.__ledger.deaths++;};
 // Keep earned XP from changing a test build halfway through the timed run.
 gainAscension=()=>{};addJob=()=>{};
 `);
 return g;
}
const games={before:boot(before),after:boot(current)},builder=createGame(current);
const fields={abyss:{map:9,stage:15,name:'Abyss Nightmare Stage 5',boss:true},astral:{map:10,stage:5,name:'Astral Stage 5',boss:true},thor1:{map:11,stage:1,name:'Thor Stage 1',boss:false},thor5:{map:11,stage:5,name:'Thor Stage 5',boss:true}};
function allocate(g,mode){g.ev(`{
 for(const k of Object.keys(S.st))S.st[k]=1;S.pts=totalPts();
 const buy=k=>{if(S.st[k]>=statCap()||S.pts<cost(k))return false;S.pts-=cost(k);S.st[k]++;return true};
 const up=(k,n)=>{while(S.st[k]<n&&buy(k)){}};
 ${mode.startsWith('agi')?`up('agi',${+mode.slice(3)});up(C().main,120);up('dex',60);for(const k of ['luk','vit','int','str','dex'])if(k!=='agi')up(k,120);`:mode==='int-speed'?"up('int',120);up('agi',120);up('dex',60);for(const k of ['luk','vit','dex','str'])up(k,120);":mode==='gx'?"up('str',120);up('agi',120);up('luk',120);up('dex',16);up('vit',2);":"up('int',120);up('dex',120);up('luk',120);up('vit',120);up('str',120);"}
 if(S.pts<0)throw Error('Invalid point budget');
 }`);}
function thirdFixture(cls,wt,agi){
 const g=builder;outfitted(g,cls,2,wt,true);
 // Hold equipment fixed across the AGI sweep, without hidden speed/AGI rolls.
 // Replacement affixes stay inside each slot's actual pool.
 g.ev(`for(const it of items()){
  it.aff=it.aff.filter(a=>!['agi','aspd'].includes(a.k));
  it.cards=it.cards.filter(c=>!cardEffects(c).some(a=>['agi','aspd'].includes(a.stat||a.k)));
 }S.pets=[];S.gmnm=true;S.inv=[];S.sk=Object.fromEntries(SKILLS.filter(s=>s.cls.includes(S.cls)).map(s=>[s.id,s.max]));S.skillCombos={};`);
 allocate(g,'agi'+agi);
 return g.ev('JSON.stringify(S)');
}
function fourthFixture(cls,mode){
 const g=builder;g.ev(`Math.random=()=>.5;S=fresh();S.cls=${JSON.stringify(cls)};S.lv=150;S.gm=true;S.auto=false;S.adv=false;S.pets=[];S.prog=MAPS.map(()=>10);S.gmnm=true;
 for(const n of lineOf(S.cls))S.jobs[n]={jl:CLASSES[n].mj,jx:0};
 S.sk=Object.fromEntries(SKILLS.filter(s=>s.cls.includes(S.cls)).map(s=>[s.id,s.max]));
 S.eq={};S.inv=[];gmMaxAscensionGear(S.cls);
 const take=fn=>{const i=S.inv.findIndex(fn);if(i<0)throw Error('Missing preset');return S.inv.splice(i,1)[0]};
 S.eq.weapon=take(it=>it.slot==='weapon');for(const slot of ['armor','head','leg'])S.eq[slot]=take(it=>it.slot===slot);
 S.eq.acc1=take(it=>it.slot==='acc');S.eq.acc2=take(it=>it.slot==='acc');S.inv=[];
 if(S.cls==='Guillotine Cross')for(const [slot,it]of Object.entries(S.eq)){
  const fixed=makeMythicEquipment('infernal',it.slot,it.wt).item;fixed.r=({weapon:15,head:9,armor:8,leg:7,acc1:8,acc2:8})[slot];
  fixed.aff=it.aff;S.eq[slot]=fixed;
 }
 if(S.cls==='Guillotine Cross'){
  S.eq.weapon.val=4373;S.eq.weapon.aff=[{k:'aspd',v:74},{k:'cdm',v:45},{k:'atk',v:90},{k:'luk',v:83}];
 }
 // Both caster profiles use identical gear; only purchased base stats differ.
 for(const [slot,it]of Object.entries(S.eq)){
  const magic=S.cls!=='Guillotine Cross';
  const wanted=it.slot==='weapon'?['cdm',magic?'matk':'atk',magic?'int':'str','crit']:it.slot==='acc'?['cdm','luk']:it.slot==='head'?['int','hp']:['hpPct','vit'];
  const cards=CARD_CATALOG.filter(c=>c.nightmare&&wanted.includes(c.stat)).sort((a,b)=>wanted.indexOf(a.stat)-wanted.indexOf(b.stat)||b.v-a.v);
  for(const c of cards){if(it.cards.length>=it.slots)break;if(!socketWhy(c,it)){const card=newCard(c);card.stars=3;it.cards.push(card)}}
 }
 S.indexXp=1000000;S.cardIndex.stats=Object.fromEntries(MASTER_STATS.map(k=>[k,25]));S.cardIndex.rolls=['atkPct','matkPct','critPct','aspdPct','leech','leech','leech'];
 const a=ascState();a.level=50;a.stats[S.cls]={might:10,precision:10,ferocity:10,vitality:10,evasion:10};a.skills[S.cls]={level:30,xp:0,ranks:Object.fromEntries(SKILLS4.filter(s=>s.from===S.cls).map(s=>[s.id,5]))};
 S.skillCombos={};S.skOff={};`);
 allocate(g,mode);
 return g.ev('JSON.stringify(S)');
}
const configs=[];
for(const [cls,weapons]of [['Lord Knight',['sword']],['High Wizard',['staff']],['Sniper',['bow']],['Assassin Cross',['katar','dagger']],['High Priest',['mace']],['Whitesmith',['axe']]])for(const wt of weapons)for(const agi of [1,60,120])configs.push({id:cls+' '+wt+' AGI'+agi,group:'third',cls,profile:'AGI '+agi,fixture:thirdFixture(cls,wt,agi),fields:['abyss']});
for(const cls of ['Warlock','Arch Bishop'])for(const mode of ['int-focus','int-speed'])configs.push({id:cls+' '+mode,group:'caster',cls,profile:mode,fixture:fourthFixture(cls,mode),fields:Object.keys(fields)});
configs.push({id:'GX Infernal proxy',group:'gx',cls:'Guillotine Cross',profile:'Infernal proxy',fixture:fourthFixture('Guillotine Cross','gx'),fields:Object.keys(fields)});
function prepare(g,config,field,seed){
 g.ev(`window.__ledger=null;window.__damageSource=null;S=JSON.parse(${JSON.stringify(config.fixture)});S.mp=${field.map};S.lvl=${field.stage};S.auto=false;S.adv=false;S.q=null;S.hp=maxHp();S.dmg=0;S.kills=0;S.kl=0;
 let seed=${seed};Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 currentUser='field-benchmark';TRIAL.on=false;JOB_RITE.on=false;astralJourney=null;resetSkillRuntime();for(const k in skCd)delete skCd[k];for(const k in petR)delete petR[k];
 petBuff={atk:0,matk:0,hp:0,leech:0,def:0};petBuffSrc={};petSkillCd={};petNote={};tb={};
 t=0;swing=null;atkAnim=0;pAtkT=0;standC={t:-9,r:0};engageTgt=null;activePack=0;respawn=0;mobs=[];mob=null;camps=[];
 S.hp=maxHp();expEarned=0;zenyEarned=0;pl.x=0;pl.z=Z1-1.5;pl.wz=pl.z;pl.wx=null;pl.wt=0;pl.orb=0;pl.run=false;floats=[];shots=[];drops=[];spawn();
 window.__input=JSON.stringify({S,combo:comboConfig(),stats:{atk:atk(),matk:matk(),hp:maxHp(),interval:aspd(),aspd:144+5/aspd(),crit:crit(),critD:critD(),flee:flee()},field:{map:S.mp,stage:S.lvl},mobs:mobs.map(m=>({n:m.n,boss:!!m.boss,hp:m.hp,atk:m.atk,critRes:m.critRes}))});`);
 return g.ev('window.__input');
}
function session(g,kind){
 return JSON.parse(g.ev(`JSON.stringify((()=>{
 const raw={basic:0,skill:0,proc:0,dot:0,pet:0,other:0},effective={...raw};window.__ledger={raw,effective,kills:0,bossKills:0,deaths:0};
 const startDamage=S.dmg,startKills=S.kills,startHp=maxHp(),startXp=expEarned,startZeny=zenyEarned;let minHp=1,elapsed=0,minAspd=Infinity,maxAspd=0;const casts={};let zealBoostedCasts=0;
 const originalCast=castSkill;castSkill=(sk,k)=>{casts[sk.id]=(casts[sk.id]||0)+1;if(skillOn('iagi')&&aspd()<=.131&&skillState().buffs.iagi?.value>0)zealBoostedCasts++;return originalCast(sk,k)};
 const boss=${kind==='boss'}?mobs.find(m=>m.boss):null;
 if(${kind==='boss'}&&!boss)throw Error('No real boss in this field');
 let outcome=${kind==='boss'}?'timeout':null;
 for(let i=0;i<${(kind==='boss'?bossLimit:farmSeconds)*30};i++){
  update(1/30);if(i%30===0){const rate=144+5/aspd();minAspd=Math.min(minAspd,rate);maxAspd=Math.max(maxAspd,rate);}elapsed=(i+1)/30;minHp=Math.min(minHp,Math.max(0,S.hp/maxHp()));
  if(${kind==='boss'}){if(window.__ledger.deaths){outcome='death';break;}if(boss.hp<=0){outcome='win';break;}}
  floats.length=0;shots.length=0;drops.length=0;
 }
 castSkill=originalCast;
 const sum=o=>Object.values(o).reduce((a,b)=>a+b,0),a=window.__ledger;
 if(Math.abs(sum(raw)-(S.dmg-startDamage))>.01)throw Error('Damage accounting does not reconcile');
 if(raw.pet!==0||S.pets.length)throw Error('Unplanned pet contribution');
 if(a.kills!==S.kills-startKills)throw Error('Kill accounting does not reconcile');
 if(sum(effective)>sum(raw)+.01)throw Error('Effective damage exceeds recorded damage');
 const row={seconds:elapsed,expPerMinute:(expEarned-startXp)*60/elapsed,zenyPerMinute:(zenyEarned-startZeny)*60/elapsed,minAspd,maxAspd,casts,zealBoostedCasts,kills:a.kills,bossKills:a.bossKills,deaths:a.deaths,killsPerMinute:a.kills*60/elapsed,rawDps:sum(raw)/elapsed,effectiveDps:sum(effective)/elapsed,rawDpsBySource:Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,v/elapsed])),effectiveDpsBySource:Object.fromEntries(Object.entries(effective).map(([k,v])=>[k,v/elapsed])),minHpFraction:minHp,endHpFraction:S.hp/maxHp(),maxHp:startHp,outcome,bossHpLeft:boss?Math.max(0,boss.hp/boss.max):null};
 window.__ledger=null;return row;
 })())`));
}
const results=[],inputs={},snapshots={};let completed=0;
try{
 for(const config of configs)for(const fieldKey of config.fields){
  const field=fields[fieldKey];
  for(const seed of seeds){
   const pair={};
   for(const side of ['before','after']){
    const g=games[side];const input=prepare(g,config,field,seed);pair[side]=input;
    snapshots[config.id]=JSON.parse(input).stats;
    const farm=session(g,'farm');
    let boss=null;if(field.boss){assert.equal(prepare(g,config,field,seed),input,'Independent boss start must match farm start');boss=session(g,'boss');}
    results.push({config:config.id,group:config.group,cls:config.cls,profile:config.profile,field:fieldKey,seed,timing:side,inputSha256:sha(input),farm,boss});
   }
   assert.equal(pair.before,pair.after,'Timing pair input changed: '+config.id+' '+fieldKey+' '+seed);
   inputs[config.id+'|'+fieldKey+'|'+seed]=sha(pair.after);
  }
  completed++;console.log('done',completed,config.id,fieldKey,JSON.stringify(snapshots[config.id]));
 }
 const avg=(rows,fn)=>rows.reduce((n,r)=>n+fn(r),0)/rows.length;
 const summaries=[];
 for(const config of configs)for(const field of config.fields){const parts={};for(const timing of ['before','after']){
  const rr=results.filter(r=>r.config===config.id&&r.field===field&&r.timing===timing),wins=rr.filter(r=>r.boss?.outcome==='win');
  parts[timing]={expPerMinute:avg(rr,r=>r.farm.expPerMinute),zenyPerMinute:avg(rr,r=>r.farm.zenyPerMinute),bossClearsPerMinute:avg(rr,r=>r.farm.bossKills*60/r.farm.seconds),peakAspd:Math.max(...rr.map(r=>r.farm.maxAspd)),zealBoostedCasts:rr.reduce((n,r)=>n+r.farm.zealBoostedCasts,0),killsPerMinute:avg(rr,r=>r.farm.killsPerMinute),deaths:rr.reduce((n,r)=>n+r.farm.deaths,0),rawDps:avg(rr,r=>r.farm.rawDps),effectiveDps:avg(rr,r=>r.farm.effectiveDps),rawDpsBySource:Object.fromEntries(['basic','skill','proc','dot','pet','other'].map(k=>[k,avg(rr,r=>r.farm.rawDpsBySource[k])])),bossWins:wins.length,bossAttempts:rr.filter(r=>r.boss).length,bossMeanWinSeconds:wins.length?avg(wins,r=>r.boss.seconds):null,bossOutcomes:rr.map(r=>r.boss?.outcome||'not present')};
 }summaries.push({config:config.id,group:config.group,field,stats:snapshots[config.id],...parts,expChangePercent:parts.before.expPerMinute?(parts.after.expPerMinute/parts.before.expPerMinute-1)*100:null,kpmChangePercent:parts.before.killsPerMinute?(parts.after.killsPerMinute/parts.before.killsPerMinute-1)*100:null});}
 fs.mkdirSync(out,{recursive:true});
 const metadata={sourceSha256:sha(current),toolSha256:sha(fs.readFileSync(__filename)),seeds,farmSeconds,bossLimit,hz:30,quick,pairedInputs:Object.keys(inputs).length,fieldSessions:results.length,independentBossAttempts:results.filter(r=>r.boss).length,fields,method:'Real update/spawn/kill loops with actual enemy HP, ATK, critical resistance, minions, movement, death reset, healing, shields, dots and proc paths. Only old/current playerAttack differs in memory. Headless renderer/FX disabled. New pet drops are removed immediately after the native kill routine (RNG is retained), keeping pets absent; no gained job/Ascension XP during a run. Fixed builds and default six-slot combos, same seeded inputs per pair. Seeded runs are exploratory, not confidence intervals. Farm starts at full HP from field entry (no warm-up). Boss trial is independent, includes real minions, and ends at first win/death or the limit. Raw DPS includes overkill; effective DPS caps each hit to remaining enemy HP.',assumptions:['GX is a proxy, not the user save: visible base STR120/AGI120/LUK120/DEX16/VIT2/INT1, +15 Infernal katar base chosen to reproduce visible weapon ATK14212, visible weapon affixes ASPD74/CDM45/ATK90/LUK83, inferred +9/+8/+7/+8/+8 other refinements. Unseen armor rolls/cards/skills/Ascension are model assumptions. No claim to reproduce the screenshot HUD DPS.','All fourth jobs: level150, max ordinary inherited/class skills, 50 shared points (Might/Precision/Ferocity/Vitality/Evasion each10) and 30 class points (each upgrade rank5); legal max-budget synthetic account. Curated eligible three-star Nightmare cards, max card mastery and no pets.','Casters: corrected +15 GM presets, identical gear for INT-focused and INT/ASPD; base INT120 in both. INT-focus spends toward DEX/LUK/VIT before AGI; INT/ASPD buys AGI120 and DEX60 before the remaining priorities. There is an actual point-budget trade-off, not free AGI.','Third jobs: completed +10 N+ benchmark gear/cards/mastery; strip AGI/ASPD affixes and speed/AGI cards identically across all speeds, then purchase base AGI1/60/120 and allocate the remaining legal budget. These are speed-isolation fixtures, not claims of optimized N+ builds.','Current corrected PR101 item bases are identical on both timing sides. No gameplay tuning, caster buff, equipment-gated timing or test-limit relaxation was applied.']};
 fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify({metadata,configs:configs.map(({fixture,...c})=>({...c,fixture:JSON.parse(fixture)})),snapshots,inputs,summaries,results},null,2)+'\n');
 const md=renderComparison({metadata,summaries});
 fs.writeFileSync(path.join(out,'comparison.md'),md);
 console.log('Complete:',JSON.stringify(metadata));
}finally{builder.close();for(const g of Object.values(games))g.close();}
