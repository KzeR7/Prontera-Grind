// Deterministic, real-update combat comparison. Requires jsdom and three r128.
// NODE_PATH=<dependency directory> node tools/skill_balance.js [--baseline] [--quick]
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {createGame}=require('./tests/helpers/game');
const ROOT=path.resolve(__dirname,'..'),REF='731426a73612bcd0550f0823361978830d214f76';
function configure(g,cls,profile,weapon,seed=123){
 g.ev(`{
  let seed=${seed};Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  S=fresh();S.cls=${JSON.stringify(cls)};const tier=C().tier;
  S.lv=([[8,18,55,100],[10,35,80,125],[10,49,99,150]][${profile}])[tier];
  S.mp=Math.min(9,Math.max(0,Math.floor((S.lv-10)/15)));S.lvl=10;S.adv=false;S.auto=true;
  for(const n of lineOf(S.cls))S.jobs[n]={jl:CLASSES[n].mj,jx:0};
  for(const s of SKILLS.filter(s=>s.cls.includes(S.cls)))S.sk[s.id]=Math.min(s.max,[1,5,10][${profile}]);
  S.pts=totalPts();const priority=[C().main,'agi','dex','luk','vit','int','str'].filter((v,i,a)=>a.indexOf(v)===i);
  // Buy in rounds: primary gets two purchases for each secondary; legal point costs/caps.
  const order=[priority[0],priority[0],priority[1],priority[2],priority[3],priority[4]];
  let changed=true;while(changed){changed=false;for(const k of order)if(S.st[k]<statCap()&&S.pts>=cost(k)){S.pts-=cost(k);S.st[k]++;changed=true}}
  const wt=${JSON.stringify(weapon)}||C().wt[0];
  const gear=(slot,wt,val)=>({id:slot,slot,wt,val,r:${profile}*3,sec:tier,tier:${profile},name:'Balance fixture',aff:[],cards:[],slots:0});
  S.eq.weapon=gear('weapon',wt,8+S.lv*2);if(wt==='dagger'&&tier>=2)S.eq.off=gear('off','dagger',8+S.lv*2);
  for(const slot of ['armor','head','leg'])S.eq[slot]=gear(slot,null,4+S.lv);
  tb={};for(const k in skCd)delete skCd[k];swing=null;atkAnim=0;pAtkT=0;t=0;standC={t:-9,r:0};engageTgt=null;
  if(typeof resetSkillRuntime==='function')resetSkillRuntime();
  for(const id in petR)delete petR[id];respawn=0;engageWait=0;
  petBuff={atk:0,matk:0,hp:0,leech:0,def:0};petSkillCd={};petNote={};
  S.hp=maxHp();S.dmg=0;window.__normalDamage=0;S.kills=0;S.skOff={};
 }`);
}
function stationary(g,count,seconds=300){return JSON.parse(g.ev(`JSON.stringify((()=>{
 const proto={x:0,z:0,hp:1e14,max:1e14,atk:0,size:1,pack:0,fixed:true,hx:0,hz:0,a:0,at:1e9,spawn:1,boss:${count===1},critRes:0};
 mobs=Array.from({length:${count}},(_,i)=>({...proto,x:i===0?0:(i===1?1:-1),z:i===0?0:-1}));mob=mobs[0];activePack=0;camps=[];
 pl.x=0;pl.z=1.5;TRIAL.on=true;TRIAL.left=1e9;let first=0,warm=0,warmAuto=0,petSum=0,petN=0;
 for(let i=0;i<${Math.round((seconds+20)*30)};i++){update(1/30);floats.length=0;shots.length=0;if(i>=600&&i%30===29){petSum+=petDmg({sp:0,mut:1,eq:[0,0,0]});petN++;}if(i===299)first=S.dmg;if(i===599){warm=S.dmg;warmAuto=window.__normalDamage;}}
 const result={petMean:petSum/Math.max(1,petN),autoDps:(window.__normalDamage-warmAuto)/${seconds},dps:(S.dmg-warm)/${seconds},opening:first/10,pet:petDmg({sp:0,mut:1,eq:[0,0,0]}),atk:atk(),matk:matk(),interval:aspd(),stats:S.st};TRIAL.on=false;return result;
})())`));}
function measure(html,quick=false){const g=createGame(html),rows=[];const classes=JSON.parse(g.ev('JSON.stringify(Object.keys(CLASSES))'));
 for(const cls of classes.filter(c=>!process.env.SKILL_CLASSES||process.env.SKILL_CLASSES.split(',').includes(c))){for(const profile of (quick?[2]:[0,1,2]))for(const weapon of (/^Assassin/.test(cls)?['katar','dagger']:['']))for(const count of [1,3]){
  configure(g,cls,profile,weapon,Number(process.env.SKILL_SEED)||123);const m=stationary(g,count,quick?60:300);rows.push({cls,profile,weapon,count,...m});
 }process.stderr.write(cls+'\n');}g.close();return rows;}
if(require.main===module){const baseline=process.argv.includes('--baseline'),quick=process.argv.includes('--quick');
 const html=baseline?cp.execFileSync('git',['show',REF+':index.html'],{cwd:ROOT,encoding:'utf8',maxBuffer:20e6}):fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 const rows=measure(html,quick);const file=path.join(ROOT,'tools/tests/fixtures',(baseline?'skill_balance_before':'skill_balance_after')+(quick?'_quick':'')+(process.env.SKILL_SEED?'_seed'+process.env.SKILL_SEED:'')+(process.env.SKILL_CLASSES?'_subset':'')+'.json');

 fs.writeFileSync(file,JSON.stringify({revision:baseline?REF:'working-tree',sourceHash:require('node:crypto').createHash('sha256').update(html||fs.readFileSync(path.join(ROOT,'index.html'))).digest('hex'),seconds:quick?60:300,seed:Number(process.env.SKILL_SEED)||123,quick,rows},null,2)+'\n');console.log(file);
}
module.exports={configure,stationary,measure};
