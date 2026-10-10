// v98 comparison against the exact starting game. No dependency on retired v97 baselines.
// NODE_PATH=<jsdom/three deps> node tools/progression_balance.js [--skills] [--encounters]
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const {createGame}=require('./tests/helpers/game'),{configure,stationary,measure}=require('./skill_balance');
const BASE='d164bd0527cfe335f9c183d0e576800716b7dd26',before=cp.execFileSync('git',['show',BASE+':index.html'],{encoding:'utf8',maxBuffer:20e6}),after=fs.readFileSync('index.html','utf8');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function combatHash(html){return hash(html.slice(html.indexOf('const RAR='),html.indexOf('// ---------- selected-affix reforge'))+html.slice(html.indexOf('function update('),html.indexOf('// ---------- update watcher')));}
function outfitted(g,cls,profile,weapon,modern){configure(g,cls,2,weapon,789);g.ev(`{
 S.lv=150;S.mp=${profile===0?8:9};S.lvl=${profile<2?9:15};S.auto=false;S.adv=false;S.q=null;S.prog=Array(10).fill(10);
 for(const k of Object.keys(S.st))S.st[k]=1;S.pts=totalPts();
 const buy=k=>{if(S.st[k]>=statCap()||S.pts<cost(k))return false;S.pts-=cost(k);S.st[k]++;return true};
 while(S.st.dex<60&&buy('dex')){}
 const main=C().main,magic=['Mage','Wizard','High Wizard','Acolyte','Priest','High Priest'].includes(S.cls);
 const priority=(magic?[main,'agi','luk']:${modern?"[main,'agi','luk']":"main==='agi'?[main,'int','luk']:[main,'agi','int']"}).filter((k,i,a)=>a.indexOf(k)===i);
 let more=true;while(more){more=false;for(const k of priority)if(buy(k))more=true;}
 const tier=${profile===0?3:4},sec=${profile<2?3:5};let id=100;
 const make=(slot,wt)=>{const it=genGear({k:wt||slot,n:'Benchmark'},150,sec,false,tier);it.id=++id;it.r=${[3,6,10][profile]};it.cards=[];it.slots=slot==='weapon'?(wt==='katar'||wt==='bow'?4:3):1;
 // Shared attainable affix fixture isolates cards/stat changes from luck in the generator.
 const power=${[12,24,40][profile]},hp=${[140,280,480][profile]},cdm=${[7,14,22][profile]};
 it.aff=slot==='weapon'?[{k:main,v:power},{k:'crit',v:${[3,7,12][profile]}},{k:'cdm',v:cdm}]:slot==='acc'?[{k:main,v:power},{k:'luk',v:power},{k:'cdm',v:cdm}]:slot==='head'?[{k:'int',v:power},{k:'hp',v:hp}]:slot==='leg'?[{k:'agi',v:power},{k:'hp',v:hp},{k:'aspd',v:${[5,10,15][profile]}}]:[{k:'str',v:power},{k:'agi',v:power},{k:'hp',v:hp}];return it;};
 S.eq={weapon:make('weapon',${JSON.stringify(weapon)}||C().wt[0]),armor:make('armor'),head:make('head'),leg:make('leg'),acc1:make('acc'),acc2:make('acc')};
 if(${JSON.stringify(weapon)}==='dagger')S.eq.off=make('weapon','dagger');else if(canShield())S.eq.off=make('off');
 S.indexXp=${[30000,250000,1000000][profile]};
 if(${profile}===2){S.cardIndex.stats=Object.fromEntries(MASTER_STATS.map(k=>[k,25]));S.cardIndex.rolls=['atkPct','matkPct','critPct','aspdPct','leech','leech','leech'];}
 S.hp=maxHp();
 }`);
 if(modern)g.ev(`{
 S.eq.head.aff.push({k:'matk',v:${[2,3,5][profile]}});
 const magic=INT_CLASSES.includes(S.cls),list=CARD_CATALOG.filter(c=>c.nightmare===${profile===2}&&(c.map<8||${profile}>0));
 for(const [slot,it]of Object.entries(S.eq)){const wanted=slot==='weapon'?['cdm',magic?'matk':'atk',C().main,'crit']:it.slot==='acc'?['cdm','luk','move']:it.slot==='head'?['int','hp']:['aspd','hpPct','agi'];
 const sorted=list.filter(c=>wanted.includes(c.stat)).sort((a,b)=>wanted.indexOf(a.stat)-wanted.indexOf(b.stat)||b.v-a.v);
 for(const c of sorted){if(it.cards.length>=Math.max(0,it.slots-${profile===0?2:profile===1?1:0}))break;if(!socketWhy(c,it))it.cards.push(newCard(c));}}
 S.hp=maxHp();}`);
 else g.ev(`{let id=1000;for(const [slot,it]of Object.entries(S.eq)){const stat=it.slot==='weapon'?'cdm':it.slot==='acc'?'luk':it.slot==='head'?'int':'aspd';for(let i=0;i<Math.max(0,it.slots-${profile===0?2:profile===1?1:0});i++)it.cards.push({id:++id,card:1,n:'Benchmark '+id+' Card',stat,g:${profile===0?1:3},v:cardVal(${profile===0?1:3},stat)});}S.hp=maxHp();}`);
}
function encounters(g,seconds=120){return JSON.parse(g.ev(`JSON.stringify((()=>{
 TRIAL.on=false;S.lvl=S.lvl>10?13:9;spawn();pl.x=0;pl.z=Z1-1.5;const level=S.lv;let deaths=0,minHp=1,totalLeech=0;const leechFn=typeof applyLeech==='function'?applyLeech:null;
 if(leechFn)applyLeech=(...a)=>{const n=leechFn(...a);totalLeech+=n;return n;};
 for(let i=0;i<${seconds*30};i++){const had=mobs.length;update(1/30);if(had&&!mobs.length&&respawn>1&&S.hp===maxHp())deaths++;minHp=Math.min(minHp,S.hp/maxHp());S.lv=level;S.exp=0;floats.length=0;shots.length=0;drops.length=0;}
 const kills=S.kills;S.lvl=S.lvl>10?15:10;S.hp=maxHp();spawn();pl.x=0;pl.z=Z1-1.5;const boss=mobs.find(x=>x.boss);let elapsed=0;
 for(;elapsed<120&&mobs.includes(boss)&&boss.hp>0;elapsed+=1/30){update(1/30);floats.length=0;shots.length=0;drops.length=0;}
 if(leechFn)applyLeech=leechFn;return{kills,kph:kills*3600/${seconds},deaths,minHp,leech:totalLeech,bossWin:boss.hp<=0,bossSeconds:elapsed,bossHpLeft:Math.max(0,boss.hp/boss.max)};
})())`));}
function runGear(html,modern,moving=false){const g=createGame(html),rows=[];
 for(const cls of ['Lord Knight','High Wizard','Sniper','Assassin Cross','High Priest','Whitesmith'])for(const wt of cls==='Assassin Cross'?['katar','dagger']:[''])for(const profile of [0,1,2]){
 outfitted(g,cls,profile,wt,modern);const stats=JSON.parse(g.ev('JSON.stringify({stats:S.st,atk:atk(),matk:matk(),crit:crit(),critD:critD(),hp:maxHp(),cards:items().flatMap(x=>x.cards||[]).map(c=>c.n)})'));
 if(moving)rows.push({cls,profile,weapon:wt,...encounters(g),...stats});else for(const count of [1,3]){outfitted(g,cls,profile,wt,modern);rows.push({cls,profile,weapon:wt,count,...stationary(g,count,120),build:stats});}
 console.error(cls,profile,wt);
 }g.close();return rows;}
function runGrowth(html,modern){const g=createGame(html),rows=[],classes=JSON.parse(g.ev('JSON.stringify(Object.keys(CLASSES))'));
 for(const cls of classes)for(const weapon of /^Assassin/.test(cls)?['katar','dagger']:[''])for(const profile of [0,1,2]){
  configure(g,cls,profile,weapon,123);
  if(modern)g.ev(`if(!INT_CLASSES.includes(S.cls)){for(const k in S.st)S.st[k]=1;S.pts=totalPts();const order=[C().main,C().main,'agi','dex','luk','vit'];let more=true;while(more){more=false;for(const k of order)if(S.st[k]<statCap()&&S.pts>=cost(k)){S.pts-=cost(k);S.st[k]++;more=true;}}S.hp=maxHp();}`);
  rows.push({cls,profile,weapon,count:1,...stationary(g,1,60)});console.error('growth',cls,profile,weapon);
 }g.close();return rows;
}
if(require.main===module){const skill=process.argv.includes('--skills'),moving=process.argv.includes('--encounters');let b,a;
 if(skill){b=process.argv.includes('--reuse-baseline')?JSON.parse(fs.readFileSync('tools/tests/fixtures/progression_skills.json')).before:runGrowth(before,false);a=runGrowth(after,true);}else{const prior='tools/tests/fixtures/progression_'+(moving?'encounters':'gear')+'.json';b=process.argv.includes('--reuse-baseline')?JSON.parse(fs.readFileSync(prior)).before:runGear(before,false,moving);a=runGear(after,true,moving);}
 if(b.length!==(skill?63:moving?21:42))throw Error('Incomplete baseline');
 const out={baselineRevision:BASE,baselineHash:hash(before),sourceHash:hash(after),combatHash:combatHash(after),toolHash:hash(fs.readFileSync(__filename)),seconds:skill?60:120,seed:skill?123:789,kind:skill?'skills':moving?'encounters':'gear',before:b,after:a};
 const file='tools/tests/fixtures/progression_'+out.kind+'.json';fs.writeFileSync(file,JSON.stringify(out,null,2)+'\n');console.log(file);
 if(!moving)for(let i=0;i<a.length;i++){const d=a[i].dps/b[i].dps-1;if(d<-.1||d>.2)console.log('OUTSIDE',a[i].cls,a[i].profile,a[i].weapon,a[i].count,(100*d).toFixed(2)+'%');}
}
module.exports={combatHash,outfitted,runGear};
