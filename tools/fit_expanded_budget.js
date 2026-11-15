// Fits the damage budget of expanded-roster classes against their sibling class.
//   node tools/fit_expanded_budget.js "Rebellion=Ranger:0.97" "Kagerou & Oboro=Guillotine Cross:0.97"
// "Geneticist=Mechanic:1.2/1.4" fits 1.2 x on one target and 1.4 x on three.
// For each class it measures sustained damage (tools/skill_balance.js stationary(), 120 s, 1 and
// 3 targets, every skill maxed, Base Lv 99 / 150 / 175 by tier) and solves SKILL_TUNING single (K)
// and area (A) so both land on target x sibling. The class attack multiplier is left as written.
// Prints JSON; copy K / A into SKILL_TUNING and tools/tests/fixtures/expanded_skill_budget.json.
const {createGame}=require('./tests/helpers/game'),{stationary}=require('./skill_balance');
const SEC=+process.env.SEC||120,ROUNDS=+process.env.ROUNDS||4;
function configure(g,cls,weapon){g.ev(`{
  let seed=123;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  S=fresh();S.cls=${JSON.stringify(cls)};const tier=C().tier,solo=typeof EXPANDED_CLASSES!=='undefined'&&EXPANDED_CLASSES.has(S.cls);
  S.lv=solo?150:[10,49,99,150,175][tier];S.mp=9;S.lvl=10;S.adv=false;S.auto=true;
  for(const n of lineOf(S.cls))S.jobs[n]={jl:CLASSES[n].mj,jx:0};
  for(const s of SKILLS.filter(s=>s.cls.includes(S.cls)))S.sk[s.id]=s.max;
  S.pts=totalPts();const priority=[C().main,'agi','dex','luk','vit','int','str'].filter((v,i,a)=>a.indexOf(v)===i);
  const order=[priority[0],priority[0],priority[1],priority[2],priority[3],priority[4]];
  let changed=true;while(changed){changed=false;for(const k of order)if(S.st[k]<statCap()&&S.pts>=cost(k)){S.pts-=cost(k);S.st[k]++;changed=true}}
  const wt=${JSON.stringify(weapon||null)}||C().wt[0];
  const gear=(slot,wt,val)=>({id:slot,slot,wt,val,r:6,sec:Math.min(3,tier),tier:2,name:'Balance fixture',aff:[],cards:[],slots:0});
  S.eq.weapon=gear('weapon',wt,8+S.lv*2);if(wt==='dagger'&&tier>=2)S.eq.off=gear('off','dagger',8+S.lv*2);
  for(const slot of ['armor','head','leg'])S.eq[slot]=gear(slot,null,4+S.lv);
  tb={};for(const k in skCd)delete skCd[k];swing=null;atkAnim=0;pAtkT=0;t=0;standC={t:-9,r:0};engageTgt=null;
  if(typeof resetSkillRuntime==='function')resetSkillRuntime();
  for(const id in petR)delete petR[id];respawn=0;engageWait=0;
  petBuff={atk:0,matk:0,hp:0,leech:0,def:0};petSkillCd={};petNote={};
  S.hp=maxHp();S.dmg=0;window.__normalDamage=0;S.kills=0;S.skOff={};
 }`)}
const g=createGame();
const dps=(cls,n,weapon)=>{configure(g,cls,weapon);return stationary(g,n,SEC).dps};
const tune=(cls,K,A)=>g.ev(`SKILL_TUNING[${JSON.stringify(cls)}]={single:[${K},${K},${K}],area:[${A},${A},${A}],companion:1}`);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),out={};
for(const arg of process.argv.slice(2)){
  const [cls,rest]=arg.split('='),[sibling,t]=rest.split(':'),target=+t.split('/')[0],area=+(t.split('/')[1]||target),sw=/Assassin|Guillotine/.test(sibling)?'katar':null;
  const goal=[dps(sibling,1,sw)*target,dps(sibling,3,sw)*area];let K=1,A=1;
  for(let r=0;r<ROUNDS;r++){
    const m=(k,a)=>{tune(cls,k,a);return [dps(cls,1),dps(cls,3)]};
    const b=m(K,A),dk=m(K*1.5,A),da=m(K,A*1.5);
    // dps_n = b_n + sK_n*(k-K) + sA_n*(a-A); solve both targets at once
    const sK=[(dk[0]-b[0])/(.5*K),(dk[1]-b[1])/(.5*K)],sA=[(da[0]-b[0])/(.5*A),(da[1]-b[1])/(.5*A)];
    const e=[goal[0]-b[0],goal[1]-b[1]],det=sK[0]*sA[1]-sK[1]*sA[0];
    let nk=K,na=A;if(Math.abs(det)>1e-9&&Math.abs(sA[0])+Math.abs(sA[1])>1e-6){nk=K+(e[0]*sA[1]-e[1]*sA[0])/det;na=A+(sK[0]*e[1]-sK[1]*e[0])/det}
    else if(Math.abs(sK[0])>1e-9)nk=K+e[0]/sK[0];   // no area skill: fit single target only
    K=clamp(nk,.2,15);A=clamp(na,.2,6);
    process.stderr.write(`${cls} round ${r}: ${(b[0]/goal[0]*target).toFixed(3)} / ${(b[1]/goal[1]*area).toFixed(3)} -> K ${K.toFixed(3)} A ${A.toFixed(3)}\n`);
  }
  K=+K.toFixed(4);A=+A.toFixed(4);tune(cls,K,A);
  out[cls]={sibling,target,area,atk:g.ev(`CLASSES[${JSON.stringify(cls)}].atk`),K,A,check:[+(dps(cls,1)/goal[0]*target).toFixed(3),+(dps(cls,3)/goal[1]*area).toFixed(3)],
    hp:+g.ev(`(()=>{const h=n=>{S.cls=n;return maxHp()};return h(${JSON.stringify(cls)})/h(${JSON.stringify(sibling)})})()`).toFixed(2)};
}
g.close();console.log(JSON.stringify(out,null,1));
