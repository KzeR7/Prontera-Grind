// Shared deterministic fourth-job fixture. No pets, sockets, mastery or Ascension by default.
const {configure}=require('../../skill_balance');
function fourthSetup(g,cls,weapon,seed=789){
 configure(g,'Lord Knight',2,'sword',seed);
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
 Object.values(S.eq).forEach((it,i)=>it.id=100+i);S.inv=[];S.pets=[];S.indexXp=0;S.hp=maxHp();S.dmg=0;S.kills=0;S.skOff={};
 resetSkillRuntime();tb={};for(const k in skCd)delete skCd[k];swing=null;atkAnim=0;pAtkT=0;t=0;standC={t:-9,r:0};engageTgt=null;window.__normalDamage=0;
 }`);
}
function progressSetup(g,stage){
 const presets={transfer:[10,0,0],evolved:[10,0,0],mid:[10,25,15],late:[13,40,24],full:[15,50,30],reference:[15,0,0]};
 if(!presets[stage])throw Error('Unknown progression stage');
 const [refine,stats,skills]=presets[stage];
 g.ev(`{for(const [slot,it]of Object.entries(S.eq)){
 if(${stage==='transfer'}){const next=genGear({k:it.wt||it.slot,n:'N+ transfer fixture'},150,5,false,4,9,15);next.id=it.id;next.r=${refine};next.cards=[];S.eq[slot]=next;}else it.r=${refine};}
 const a=ascState();a.level=${stats};a.stats[S.cls]=Object.fromEntries(['might','precision','ferocity','slayer','vitality'].map(k=>[k,${stats}/5]));
 const classSkills=SKILLS4.filter(s=>s.from===S.cls);a.skills[S.cls].level=${skills};a.skills[S.cls].ranks=Object.fromEntries(classSkills.map((s,i)=>[s.id,${skills}===15?(i<3?3:2):${skills}/6]));S.hp=maxHp();}`);
}
module.exports={fourthSetup,progressSetup};
