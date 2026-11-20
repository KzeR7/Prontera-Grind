// Real spawn/update MVP+escorts; research prototype changes exist only in memory.
const {createGame}=require('../../tools/tests/helpers/game');const {fourthSetup,progressSetup}=require('../../tools/tests/helpers/endgame');
const baseline=require('node:child_process').execFileSync('git',['show','33fcf48a13cd7e1f32c3c75570ad56ab1faa3390:index.html'],{encoding:'utf8',maxBuffer:20e6});
const g=createGame(process.argv[2]==='ship'?undefined:baseline),combo=['su_sky','su_tiger','su_rampage','su_gate','su_knuckle','ch_asura'];
const model=process.argv[2]||'current', variant=process.argv[3]||'full', noInheritedBuffs=process.argv[4]==='no-inherited-buffs', asuraFactor=Number(process.env.ASURA_FACTOR||1);
if(model==='prototype')g.ev(`{
 SKILLS.find(s=>s.id==='su_sky').castGain={key:'sphere',max:5,life:20};
 SKILLS.find(s=>s.id==='su_tiger').power*=1.15;SKILLS.find(s=>s.id==='su_gate').power*=1.2;SKILLS.find(s=>s.id==='su_gate').execute=.3;ASC_UPGRADES.su_knuckle.boss=20;
 SKILL_TUNING.Sura.area=[.5,.5,.5];SKILLS.find(s=>s.id==='su_knuckle').cd=5;
 SKILLS.find(s=>s.id==='ch_asura').cd=5; // prototype runs only Sura
 const cast=castSkill;castSkill=(sk,k)=>{let e=skillState().stacks?.sphere;if(S.cls==='Sura'&&sk.id==='su_rampage'&&e&&e.until>t)k*=1+.05*e.n;if(S.cls==='Sura'&&sk.id==='ch_asura')k*=${asuraFactor};cast(sk,k)};
}`);
g.ev(`{window.__casts={};const cast=castSkill;castSkill=(sk,k)=>{window.__casts[sk.id]=(window.__casts[sk.id]||0)+1;cast(sk,k)}}`);
const builds=(model==='prototype'||model==='ship')?[['Sura','knuckle']]:[['Sura','knuckle'],['Guillotine Cross','katar'],['Sorcerer','book']];
for(const [cls,weapon] of builds)for(const mp of [9,10,11])for(const seed of [123,321,456,789,987]){
 fourthSetup(g,cls,weapon,seed);if(variant==='transfer')progressSetup(g,'transfer');
 g.ev(`{
 S.mp=${mp};S.lvl=${mp===9?15:5};S.auto=false;S.adv=false;S.q=null;S.pets=[];
 const a=ascState();a.level=${variant==='transfer'?0:50};a.stats[S.cls]=${variant==='transfer'?'{}':'{might:10,precision:10,ferocity:10,slayer:10,vitality:10}'};const q=a.skills[S.cls];q.level=${variant==='transfer'?1:30};q.ranks={};${variant==='transfer'?((model==='prototype'||model==='ship')?"q.ranks.su_knuckle=1;":""):"for(const sk of ASC_SKILLS.filter(x=>x.from===S.cls))q.ranks[sk.id]=5;"}
 for(const it of Object.values(S.eq))it.r=${variant==='transfer'?10:15};S.hp=maxHp();${noInheritedBuffs?"S.skOff.mo_sphere=true;S.skOff.ch_zen=true;":""}
 ${(model==='prototype'||model==='ship')?`S.skillCombos.Sura={enabled:true,slots:${JSON.stringify(combo)}};`:''}
 let seed=${seed};Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 t=0;atkAnim=0;pAtkT=0;respawn=0;standC={t:-9,r:0};engageTgt=null;engageWait=0;for(const id in skCd)delete skCd[id];tb={};swing=null;TRIAL.on=false;resetSkillRuntime();window.__casts={};spawn();pl.x=0;pl.z=Z1-1.5;
 }`);
 const r=JSON.parse(g.ev(`JSON.stringify((()=>{
 const boss=mobs.find(m=>m.boss),hp=boss.hp,initialHp=S.hp;let time=0,dead=false;
 for(let i=0;i<240*30&&boss.hp>0&&mobs.includes(boss);i++){update(1/30);time=(i+1)/30;floats.length=0;shots.length=0;drops.length=0;if(!mobs.includes(boss)&&boss.hp>0){dead=true;break;}}
 return {hp,time,killed:boss.hp<=0,defeated:dead,bossRemaining:Math.max(0,boss.hp),hpStart:initialHp,hpEnd:S.hp,casts:window.__casts};
 })())`));console.log(JSON.stringify({model,variant,noInheritedBuffs,asuraFactor,cls,mp,seed,...r}));
}g.close();
