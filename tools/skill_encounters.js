// Moving field and boss comparisons, using real spawn/update/kill and fixed fixtures.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {createGame}=require('./tests/helpers/game'),{configure}=require('./skill_balance');
const ROOT=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline');
const html=baseline?cp.execFileSync('git',['show','731426a73612bcd0550f0823361978830d214f76:index.html'],{cwd:ROOT,encoding:'utf8',maxBuffer:20e6}):fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const nightmare=process.argv.includes('--nightmare');
const g=createGame(html),rows=[],classes=JSON.parse(g.ev('JSON.stringify(Object.keys(CLASSES))'));
for(const cls of classes.filter(c=>!process.env.SKILL_CLASSES||process.env.SKILL_CLASSES.split(',').includes(c))){
 for(const weapon of (/^Assassin/.test(cls)?['katar','dagger']:['']))for(const pet of [false,true]){
  configure(g,cls,2,weapon,456);
  rows.push(JSON.parse(g.ev(`JSON.stringify((()=>{
   S.auto=false;S.adv=false;S.q=null;
   const tier=C().tier,wt=S.eq.weapon.wt;
   for(const slot of ['weapon','armor','head','leg']){const it=genGear({k:slot==='weapon'?wt:slot,n:'Encounter fixture'},S.lv,tier,true,4);it.r=6;S.eq[slot]=it;}
   if(wt==='dagger'&&tier>=2){S.eq.off=genGear({k:'dagger',n:'Encounter offhand'},S.lv,tier,true,4);S.eq.off.r=6;}
   S.hp=maxHp();S.prog=Array(MAPS.length).fill(10);TRIAL.on=false;
   S.pets=${pet}? [{id:1,sp:0,mut:2,eq:[2,2,2],skills:[],on:true}]:[];
   S.lvl=${nightmare?13:5};spawn();pl.x=0;pl.z=Z1-1.5;let deaths=0;const hpBefore=maxHp();
   // Hold level, gear and skills fixed; kills, recovery, travel and respawns stay real.
   const level=S.lv,exp=S.exp,jobs=JSON.stringify(S.jobs);let lastHp=S.hp;
   for(let i=0;i<${(Number(process.env.SKILL_FIELD_SECONDS)||180)*30};i++){
    const hadMobs=mobs.length;update(1/30);if(hadMobs&&!mobs.length&&respawn>1&&S.hp===maxHp())deaths++;lastHp=S.hp;
    S.lv=level;S.exp=exp;S.jobs=JSON.parse(jobs);floats.length=0;shots.length=0;drops.length=0;
   }
   const kills=S.kills,zeny=S.zeny;
   const attempts=[];for(const initialSeed of [789,987,1234,2345,3456]){
   let bossSeed=initialSeed;Math.random=()=>{bossSeed=(Math.imul(bossSeed,1664525)+1013904223)>>>0;return bossSeed/4294967296};for(const id in petR)delete petR[id];petSkillCd={};petBuff={};petBuffSrc={};petNote={};t=0;atkAnim=0;engageTgt=null;engageWait=0;respawn=0;standC={t:-9,r:0};S.lvl=${nightmare?15:10};S.hp=maxHp();for(const id in skCd)delete skCd[id];tb={};swing=null;if(typeof resetSkillRuntime==='function')resetSkillRuntime();spawn();pl.x=0;pl.z=Z1-1.5;let seconds=0;const boss=mobs.find(m=>m.boss),bossHp=boss.hp;
   for(;seconds<180&&mobs.includes(boss)&&boss.hp>0;seconds+=1/30){update(1/30);floats.length=0;shots.length=0;drops.length=0;}
   attempts.push({seed:initialSeed,seconds,bossHp,killed:boss.hp<=0,defeated:boss.hp>0&&!mobs.includes(boss)});
   }
   const wins=attempts.filter(a=>a.killed),times=wins.map(a=>a.seconds).sort((a,b)=>a-b);
   return {cls:S.cls,weapon:${JSON.stringify(weapon)},pet:${pet},kills,kph:kills*3600/${Number(process.env.SKILL_FIELD_SECONDS)||180},zeny,deaths,
     bossStage:${nightmare?15:10},bossWins:wins.length,bossAttempts:attempts,bossMedian:times.length?times[Math.floor(times.length/2)]:null};
 })())`)));
 }process.stderr.write(cls+'\n');
}
g.close();const file=path.join(ROOT,'tools/tests/fixtures',(baseline?'skill_encounters_before':'skill_encounters_after')+(nightmare?'_nightmare':'')+'.json');fs.writeFileSync(file,JSON.stringify({sourceHash:require('node:crypto').createHash('sha256').update(html||fs.readFileSync(path.join(ROOT,'index.html'))).digest('hex'),seconds:Number(process.env.SKILL_FIELD_SECONDS)||180,rows},null,2)+'\n');console.log(file);
