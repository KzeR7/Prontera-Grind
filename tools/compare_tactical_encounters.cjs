// Bounded paired field diagnostic: real spawns, deaths and a boss attempt.
// node tools/compare_tactical_encounters.cjs /absolute/output.json
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const {createGame}=require('./tests/helpers/game'),{outfitted}=require('./progression_balance');
const baselineRevision='a26d15d2b488bb76076419d67c9c24c4cf7aeb24';
const before=cp.execFileSync('git',['show',baselineRevision+':index.html'],{encoding:'utf8',maxBuffer:2e7}),after=fs.readFileSync('index.html','utf8');
const rows=[];
for(const cls of ['High Wizard','High Priest','Sniper'])for(const profile of [1,2])for(const mode of ['before','stand','kite']){
 const g=createGame(mode==='before'?before:after);
 try{
  outfitted(g,cls,profile,'',true);g.ev(`S.kite=${mode==='kite'};TRIAL.on=false;S.lvl=${profile===2?13:9};S.hp=maxHp();spawn();pl.x=0;pl.z=Z1-1.5;`);
  const r=JSON.parse(g.ev(`JSON.stringify((()=>{
   let deaths=0,travel=0,minHp=1;const startKills=S.kills;
   for(let i=0;i<60*30;i++){const had=mobs.length,x=pl.x,z=pl.z;update(1/30);travel+=Math.hypot(pl.x-x,pl.z-z);if(had&&!mobs.length&&respawn>1&&S.hp===maxHp())deaths++;minHp=Math.min(minHp,S.hp/maxHp());floats=[];shots=[];drops=[];}
   const kills=S.kills-startKills;S.lvl=${profile===2?15:10};S.hp=maxHp();spawn();pl.x=0;pl.z=Z1-1.5;const boss=mobs.find(o=>o.boss);let seconds=0;
   for(;seconds<90&&mobs.includes(boss)&&boss.hp>0;seconds+=1/30){update(1/30);floats=[];shots=[];drops=[];}
   return {kills,deaths,travel,minHp,bossWin:boss.hp<=0,bossSeconds:seconds,bossHpLeft:Math.max(0,boss.hp/boss.max)};
  })())`));rows.push({cls,profile,mode,...r});console.log(cls,profile,mode,JSON.stringify(r));
 }finally{g.close()}
}
fs.writeFileSync(process.argv[2],JSON.stringify({baselineRevision,sourceHash:crypto.createHash('sha256').update(after).digest('hex'),seconds:60,bossLimit:90,seed:789,rows},null,2));
