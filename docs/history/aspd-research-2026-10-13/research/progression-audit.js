const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=process.env.PRONTERA_REPO_ROOT||process.cwd();
const {createGame}=require(path.join(root,'tools/tests/helpers/game'));
const scriptHash=crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const original=source.split('\n').find(l=>l.startsWith('const aspd='));
const proposed="const aspd=()=>Math.max(.13,.85*C().aspd*(1-Math.min(.68,(S.st.agi+Math.min(25,bon('agi')*.1))*.0058))/(1+(pv('aspd')+bon('aspd')*.25+(typeof cardMasteryStat==='function'?cardMasteryStat('aspdPct'):0)+(tb.aspd||0))/100));";
assert.ok(original);const variant=process.argv[2]||'current';assert.ok(['current','proposal','gentler','revised'].includes(variant));
const gentler="const aspd=()=>Math.max(.13,.85*C().aspd*(1-Math.min(.68,(S.st.agi+Math.min(25,bon('agi')))*.0058))/(1+(pv('aspd')+Math.min(25,bon('aspd')*.5)+(typeof cardMasteryStat==='function'?cardMasteryStat('aspdPct'):0)+(tb.aspd||0))/100));";
const revised="const aspd=()=>{const old=Math.max(.13,.85*C().aspd*(1-Math.min(.68,st('agi')*.0058))/(1+(pv('aspd')+bon('aspd')+(typeof cardMasteryStat==='function'?cardMasteryStat('aspdPct'):0)+(tb.aspd||0))/100));if(S.lv<100)return old;const next=Math.max(.13,.85*C().aspd*(1-Math.min(.68,(S.st.agi+Math.min(25,bon('agi')))*.0058))/(1+(pv('aspd')+Math.min(25,bon('aspd')*.5)+(typeof cardMasteryStat==='function'?cardMasteryStat('aspdPct'):0)+(tb.aspd||0))/100));return old+(next-old)*Math.min(1,(S.lv-99)/21)};";
const html=variant==='current'?source:source.replace(original,variant==='proposal'?proposed:variant==='revised'?revised:gentler);
const g=createGame(html);
g.ev(`{
 window.__auditDeaths=0;window.__auditBossKills=0;
 const actualKill=kill;kill=o=>{const victim=o||mob;if(victim&&victim.boss)window.__auditBossKills++;actualKill(o)};
 log=message=>{if(String(message).includes('You were defeated'))window.__auditDeaths++};
 checkLevel=()=>{};addJob=()=>{};
 window.__configureAudit=(p,seed)=>{
  window.__auditSeed=seed;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  S=fresh();S.cls=p.cls;S.lv=p.lv;S.auto=false;S.adv=false;S.q=null;S.indexXp=p.indexXp;S.mp=p.map;S.lvl=p.farmStage;S.prog=Array(10).fill(10);
  for(const n of lineOf(S.cls))S.jobs[n]={jl:n===S.cls?Math.max(1,Math.min(CLASSES[n].mj,S.lv-JOFF[C().tier])):CLASSES[n].mj,jx:0};
  S.sk={aid:1};autoAllocateSkills();
  S.pts=totalPts();const buy=k=>{if(S.st[k]>=statCap()||S.pts<cost(k))return false;S.pts-=cost(k);S.st[k]++;return true};
  const goals={str:1,agi:Math.min(statCap(),p.agi),dex:Math.min(60,Math.max(10,Math.floor(S.lv*.6))),vit:Math.min(60,Math.floor(S.lv*.6)),luk:Math.min(60,Math.floor(S.lv*.4)),int:1};goals[C().main]=Math.min(statCap(),S.lv);
  const order=[C().main,C().main,'agi','vit','dex','luk'].filter(k=>goals[k]>1);let more=true;while(more){more=false;for(const k of order)if(S.st[k]<goals[k]&&buy(k))more=true;}
  const remainder=[C().main,'vit','luk','dex',C().main==='int'?'str':'int'].filter((k,i,a)=>a.indexOf(k)===i);more=true;while(more){more=false;for(const k of remainder)if(buy(k))more=true;}
  const starterKnife=S.eq.weapon;const fieldSources=[];
  for(let l=1;l<=p.sourceStage;l++){const f=fieldOf(p.sourceMap,l);for(const m of [...f.mobs,...(f.boss?[f.boss]:[])])for(const [T]of m.drops)fieldSources.push({...T,auditStage:l,auditPower:fieldPower(p.sourceMap,l)});}
  const allSources=fieldSources.filter((T,i,a)=>!a.some(x=>x.k===T.k&&x.n===T.n&&x.auditPower>T.auditPower)&&a.findIndex(x=>x.k===T.k&&x.n===T.n&&x.auditStage===T.auditStage)===i),sources=allSources.filter(T=>T.sec===secField(p.sourceMap,p.sourceStage)),main=C().main;let id=100;
  const score=it=>it.val+(it.aff||[]).reduce((n,a)=>n+a.v*(a.k===main?3:a.k==='agi'?2:a.k==='hp'?.1:a.k==='aspd'?.5:a.k==='atk'||a.k==='matk'?it.val*.01:1),0);
  const make=(slot,wt)=>{
   const preferred=sources.filter(T=>wt?T.k===wt:T.k===slot),pool=preferred.length?preferred:allSources.filter(T=>wt?T.k===wt:T.k===slot);if(!pool.length)return null;
   let best=null;for(let i=0;i<4;i++){const T=pool[ri(0,pool.length-1)],it=genGear(T,T.auditPower,T.sec,false,T.tier,p.sourceMap,T.auditStage);it.auditStage=T.auditStage;it.r=p.refine;if(canUse(it)&&(!best||score(it)>score(best)))best=it;}
   if(best)best.id=++id;return best;
  };
  const weaponSources=sources.some(T=>C().wt.includes(T.k))?sources:allSources;let wt=p.weapon||C().wt[0];if(!weaponSources.some(T=>T.k===wt))wt=C().wt.find(w=>weaponSources.some(T=>T.k===w));
  if(!wt)throw Error('No accessible weapon '+S.cls);
  S.eq={weapon:make('weapon',wt),armor:make('armor'),head:make('head'),leg:make('leg'),acc1:make('acc'),acc2:make('acc')};
  if(S.cls==='Novice'&&S.eq.weapon.val<starterKnife.val)S.eq.weapon=starterKnife;
  if(wt==='dagger'&&C().tier>=2&&S.cls.includes('Assassin'))S.eq.off=make('weapon','dagger');else if(canShield())S.eq.off=make('off');
  const cardKeys=new Set();
  const addField=(m,l)=>{const f=fieldOf(m,l);for(const x of [...f.mobs,...(f.boss?[f.boss]:[])])cardKeys.add(x.card.cardKey)};
  for(let m=0;m<=p.sourceMap;m++)for(let l=1;l<=(m===p.sourceMap?Math.min(10,p.sourceStage):10);l++)addField(m,l);
  if(p.sourceStage>10){for(let m=0;m<=p.sourceMap;m++)for(let l=11;l<=(m===p.sourceMap?p.sourceStage:15);l++)addField(m,l);for(let m=0;m<10;m++)for(let l=1;l<=10;l++)addField(m,l);}
  const list=CARD_CATALOG.filter(c=>cardKeys.has(c.cardKey));
  for(const it of Object.values(S.eq).filter(Boolean)){
   const wanted=it.slot==='weapon'?['atk','matk',main,'crit','cdm']:it.slot==='acc'?[main,'luk','move']:it.slot==='head'?['hpPct','hp','int']:['hpPct','agi','aspd','vit','def'];
   const cards=list.filter(c=>wanted.includes(c.stat)&&cardFits(c,it)).sort((a,b)=>wanted.indexOf(a.stat)-wanted.indexOf(b.stat)||b.v-a.v);
   for(let i=0;i<it.slots;i++)if(Math.random()<p.socketFill){const c=cards.find(c=>!socketWhy(c,it));if(c)it.cards.push(newCard(c));}
  }
  S.pets=p.pet?[{id:1,sp:0,mut:1,eq:[1,1,1],skills:[],on:true}]:[];
  if(S.pts<0||skpAvail()<0)throw Error('Invalid point budget');
  for(const [key,it]of Object.entries(S.eq))if(it){if(!canUse(it))throw Error('Illegal gear '+key);const own=it.cards.slice();it.cards=[];for(const c of own){if(socketWhy(c,it))throw Error('Illegal socket');it.cards.push(c)}}
  const snapshot=JSON.parse(JSON.stringify(S));
  window.__resetAudit=(boss=false)=>{
   let encounterSeed=window.__auditSeed+(boss?100000:200000);Math.random=()=>{encounterSeed=(Math.imul(encounterSeed,1664525)+1013904223)>>>0;return encounterSeed/4294967296};
   S=JSON.parse(JSON.stringify(snapshot));S.lvl=boss?p.bossStage:p.farmStage;S.auto=false;S.adv=false;S.hp=maxHp();S.exp=0;S.dmg=0;S.kills=0;
   t=0;pAtkT=0;atkAnim=0;hitAnim=0;shake=0;swing=null;standC={t:-9,r:0};engageTgt=null;engageWait=0;tb={};
   for(const k in skCd)delete skCd[k];for(const k in petR)delete petR[k];petBuff={atk:0,matk:0,hp:0,leech:0,def:0};petSkillCd={};petNote={};resetSkillRuntime();TRIAL.on=false;
   pl.x=0;pl.z=Z1-1.5;pl.wt=0;pl.orb=0;respawn=0;floats.length=0;shots.length=0;drops.length=0;
   window.__auditDeaths=0;window.__auditBossKills=0;window.__normalDamage=0;spawn();
  };
  tb={};petBuff={atk:0,matk:0,hp:0,leech:0,def:0};resetSkillRuntime();
  return {allocatedStats:S.st,remainingPoints:S.pts,skillRanks:S.sk,skillPointsEarned:skEarned(),skillPointsSpent:skSpent()-1,atk:atk(),matk:matk(),hp:maxHp(),crit:crit(),bonusAgi:bon('agi'),gearAspd:bon('aspd'),intervalBeforeBuffs:aspd(),gear:Object.entries(S.eq).filter(([k,it])=>it).map(([slot,it])=>({slot,name:it.name,sec:it.sec,tier:it.tier,refine:it.r,sourceMap:it.mp,sourceStage:it.auditStage,sourcePower:it.lvl,affixes:it.aff,cards:it.cards.map(c=>c.n),filled:it.cards.length,sockets:it.slots}))};
 };
 window.__runAudit=(seconds,boss)=>{
  window.__resetAudit(boss);const fixedIndexXp=S.indexXp;let elapsed=0,minimumHp=1,intervalSum=0,intervalSamples=0;
  for(let i=0;i<seconds*30;i++){
   update(1/30);elapsed=(i+1)/30;minimumHp=Math.min(minimumHp,S.hp/maxHp());
   if(i%30===29){intervalSum+=aspd();intervalSamples++;}
   // Fixed-build benchmark: loot and new pet drops cannot upgrade the test build mid-run.
   S.pets=S.pets.filter(p=>p.id===1);S.indexXp=fixedIndexXp;floats.length=0;shots.length=0;drops.length=0;S.cards.length=0;S.inv.length=0;
   if(boss&&(window.__auditBossKills||window.__auditDeaths))break;
  }
  return {elapsed,kills:S.kills,deaths:window.__auditDeaths,bossWin:window.__auditBossKills>0,bossTimedOut:boss&&!window.__auditBossKills&&!window.__auditDeaths,minimumHp,averageInterval:intervalSum/Math.max(1,intervalSamples),damage:S.dmg};
 };
}`);
const lines=[['Swordman','Knight','Lord Knight',1],['Mage','Wizard','High Wizard',2],['Archer','Hunter','Sniper',4],['Thief','Assassin','Assassin Cross',3],['Acolyte','Priest','High Priest',1],['Merchant','Blacksmith','Whitesmith',1]];
const scenarios=[{name:'Novice',cls:'Novice',lv:5,map:0,farmStage:3,bossStage:null,sourceMap:0,sourceStage:2,agi:3,refine:0,socketFill:0,indexXp:0,pet:false}];
for(const [first,second,third,early]of lines){
 const common={cls:second,pet:true,indexXp:5000,socketFill:.5,refine:3};
 const group=[
 {name:'First job ordinary',cls:first,lv:30,map:early,farmStage:7,bossStage:null,sourceMap:early,sourceStage:6,agi:25,refine:1,socketFill:.25,indexXp:1000,pet:false},
 {...common,name:'Second job class-map boss',lv:60,map:early,farmStage:9,bossStage:10,sourceMap:early,sourceStage:9,agi:50},
 {...common,name:'Comodo ordinary',lv:70,map:5,farmStage:9,bossStage:10,sourceMap:5,sourceStage:5,agi:60,indexXp:10000},
 {...common,name:'Amatsu ordinary',lv:90,map:7,farmStage:9,bossStage:10,sourceMap:6,sourceStage:9,agi:75,refine:4,indexXp:30000},
 {...common,name:'Niflheim promotion',cls:third,lv:110,map:8,farmStage:9,bossStage:10,sourceMap:7,sourceStage:9,agi:90,refine:4,indexXp:60000},
 {...common,name:'Abyss entry',cls:third,lv:130,map:9,farmStage:5,bossStage:10,sourceMap:8,sourceStage:9,agi:95,refine:5,indexXp:100000},
 {...common,name:'Abyss ordinary endgame',cls:third,lv:150,map:9,farmStage:9,bossStage:10,sourceMap:9,sourceStage:9,agi:100,refine:6,indexXp:150000},
 {...common,name:'Nightmare entry with normal gear',cls:third,lv:150,map:0,farmStage:13,bossStage:15,sourceMap:9,sourceStage:9,agi:100,refine:6,indexXp:150000},
 {...common,name:'Nightmare+ entry with N gear',cls:third,lv:150,map:5,farmStage:13,bossStage:15,sourceMap:early,sourceStage:13,agi:100,refine:6,indexXp:200000}
 ];
 scenarios.push(...group);
 if(third==='Assassin Cross')for(const p of group.filter(p=>p.cls===third))scenarios.push({...p,name:p.name+' (daggers)',weapon:'dagger',...(p.sourceStage>10?{sourceMap:0}:{})});
}
const correction=process.argv[3]==='class-map-update';
const selectedScenarios=correction?scenarios.filter(p=>p.name==='Second job class-map boss').map(p=>({...p,sourceStage:9})):scenarios;
const rows=[];const seeds=[123,987,2026];
for(const p of selectedScenarios)for(const seed of seeds){
 const build=g.ev(`window.__configureAudit(${JSON.stringify(p)},${seed})`);
 assert.ok(build.allocatedStats.agi<=p.agi);assert.ok(build.skillPointsSpent<=build.skillPointsEarned);
 const farm=g.ev('window.__runAudit(60,false)'),boss=p.bossStage?g.ev('window.__runAudit(120,true)'):null;
 rows.push({scenario:p,seed,build,farm,boss});
 process.stderr.write(variant+' '+p.cls+' '+p.name+' seed'+seed+' farm '+farm.kills+' deaths '+farm.deaths+' boss '+(boss?boss.bossWin?'win':boss.deaths?'death':'timeout':'n/a')+'\n');
}
g.close();
const out={variant,revision:'4e4102c7d625126af1b6851505a5b6db6f2a22bc',sourceHash:crypto.createHash('sha256').update(source).digest('hex'),testedHtmlHash:crypto.createHash('sha256').update(html).digest('hex'),scriptHash,node:process.version,seconds:{farm:60,bossLimit:120},seeds,rows};
const target=process.env.PRONTERA_AUDIT_OUTPUT||__dirname;fs.mkdirSync(target,{recursive:true});const file=path.join(target,variant+'-combat.json');
if(correction){const prior=JSON.parse(fs.readFileSync(file));for(const row of rows){const i=prior.rows.findIndex(r=>r.scenario.cls===row.scenario.cls&&r.scenario.name===row.scenario.name&&r.seed===row.seed);assert.ok(i>=0);prior.rows[i]=row;}prior.classMapFixtureCorrection={sourceStage:9,reason:'Use ordinary second-job gear obtainable before the class-map boss, rather than first-job gear from stage7.',scriptHash,command:'node /tmp/prontera-progression-audit.js '+variant+' class-map-update'};fs.writeFileSync(file,JSON.stringify(prior,null,2)+'\n');}else fs.writeFileSync(file,JSON.stringify(out,null,2)+'\n');
console.log('COMPLETE '+variant+' '+rows.length+' builds');
