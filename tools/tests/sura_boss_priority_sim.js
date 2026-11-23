// Sura-only boss priority and +10% personal damage; real combat/update paths.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createGame}=require('./helpers/game'),{fourthSetup}=require('./helpers/endgame'),{configure}=require('../skill_balance');
const original=fs.readFileSync('index.html','utf8');
const html=original.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
const baseline=html.replace("const playerDamage=d=>S.cls==='Sura'?Math.round(d*1.1):d;",'const playerDamage=d=>d;');
assert.notEqual(html,baseline,'baseline must disable just the Sura damage modifier');
function runDamage(source,cls){
 const g=createGame(source);try{if(cls==='Champion')configure(g,cls,2,'knuckle');else fourthSetup(g,cls,cls==='Guillotine Cross'?'katar':'knuckle');
 return JSON.parse(g.ev(`JSON.stringify((()=>{
 Math.random=()=>.5;S.pets=[];S.mp=10;S.lvl=5;S.auto=false;t=0;
 const mk=(boss=false)=>({x:0,z:0,hp:1e14,max:1e14,atk:0,size:1,pack:0,fixed:true,at:1e9,spawn:1,boss,critRes:0,raidArmor:boss?.5:0,dots:[]});
 let m=mk(true);mobs=[m];mob=m;activePack=0;pl.x=0;pl.z=1.3;resetSkillRuntime();
 const damage=fn=>{m.hp=m.max;const before=m.hp;fn();return before-m.hp};
 const direct=damage(()=>hurt(m,100000,'#fff',false));
 const pet=damage(()=>hurt(m,100000,'#fff',false,false,'fist','pet'));
 const normal=damage(()=>strike(1));
 const skill=damage(()=>castSkill(SKILLS.find(s=>s.id==='${cls==='Guillotine Cross'?'gc_cross':'mo_triple'}'),1));
 // Real update loop processes DoTs even though this harness stubs their visual float.
 const dot=damage(()=>{m.dots=[];applyDot(m,200000,1,'#fff',true);update(.5)});
 return {direct,pet,normal,skill,dot};
 })())`));}finally{g.close()}
}
for(const cls of ['Sura','Champion','Guillotine Cross']){
 const before=runDamage(baseline,cls),after=runDamage(html,cls);
 for(const key of ['direct','normal','skill','dot']){
  assert.ok(before[key]>0,cls+' '+key+' dealt damage');
  const ratio=after[key]/before[key];assert.ok(Math.abs(ratio-(cls==='Sura'?1.1:1))<.0001,cls+' '+key+' ratio '+ratio);
 }
 assert.equal(after.pet,before.pet,cls+' pet hits unchanged');
}
const g=createGame(html),ev=g.ev,J=s=>JSON.parse(ev(`JSON.stringify((()=>{${s}})())`));
try{
 fourthSetup(g,'Sura','knuckle');
 ev(`{S.mp=10;S.lvl=5;S.auto=false;S.pets=[];Math.random=()=>.5;t=0;TRIAL.on=false;
  S.skillCombos.Sura={enabled:true,slots:['ch_asura',null,null,null,null,null]};
  const mk=(boss,x)=>({n:boss?'Boss':'Escort',x,z:0,hp:1e14,max:1e14,atk:0,size:1,pack:0,fixed:true,at:1e9,spawn:1,boss,critRes:0,dots:[]});
  window.__boss=mk(true,8);window.__escort=mk(false,1);mobs=[window.__escort,window.__boss];mob=window.__escort;activePack=0;pl.x=0;pl.z=0;resetSkillRuntime();addSelfStack('sphere',5,20);
 }`);
 assert.equal(ev('suraAsuraBossTarget(mob)===window.__boss'),true,'first-slot Asura selects boss even outside range');
 ev('playerAttack()');assert.equal(ev('mob===window.__boss'),true);assert.equal(ev('swing===null'),true,'wait and approach rather than skip out-of-range Asura');
 assert.equal(ev('skillState().comboSlots===null'),true,'approach preserves combo');
 ev('mob=window.__escort;S.skillCombos.Sura.enabled=false');assert.equal(ev('suraAsuraBossTarget(mob)'),null,'paused combo');
 ev('S.skillCombos.Sura.enabled=true;skCd.ch_asura=1');assert.equal(ev('suraAsuraBossTarget(mob)'),null,'cooldown');
 ev('skCd.ch_asura=0;delete skillState().stacks.sphere');assert.equal(ev('suraAsuraBossTarget(mob)'),null,'no spheres');
 ev("addSelfStack('sphere',5,20);S.skillCombos.Sura.slots=['mo_triple','ch_asura',null,null,null,null]");assert.equal(ev('suraAsuraBossTarget(mob)'),null,'earlier usable skill stays on current target');
 ev("S.skillCombos.Sura.slots=['ch_asura',null,null,null,null,null];window.__boss.hp=0");assert.equal(ev('suraAsuraBossTarget(mob)'),null,'dead boss');
 ev('window.__boss.hp=window.__boss.max;window.__boss.pack=1');assert.equal(ev('suraAsuraBossTarget(mob)'),null,'unengaged boss in another pack');
 ev("window.__boss.pack=0;S.cls='Champion'");assert.equal(ev('suraAsuraBossTarget(mob)'),null,'Champion unaffected');
 ev("S.cls='Sura';resetSkillRuntime();addSelfStack('sphere',5,20);mob=window.__escort;pl.x=0;pl.z=0;pAtkT=0;window.__casts=[];const cast=castSkill;castSkill=(sk,k)=>{window.__casts.push({id:sk.id,boss:mob.boss});cast(sk,k)}");
 ev('for(let i=0;i<180&&window.__casts.length===0;i++)update(1/30)');
 const result=J('return {casts:window.__casts,bossHp:window.__boss.hp,escortHp:window.__escort.hp,position:pl.x}');
 assert.equal(result.casts[0]?.id,'ch_asura','real loop casts Asura after approaching');assert.equal(result.casts[0]?.boss,true,'real loop strikes boss');assert.ok(result.bossHp<1e14,'boss takes damage');assert.ok(result.position>0,'Sura moves toward the boss');
 // A boss can disappear while Sura is approaching: the normal mob rotation must resume.
 fourthSetup(g,'Sura','knuckle');
 ev(`{S.mp=10;S.lvl=5;S.auto=false;S.pets=[];Math.random=()=>.5;t=0;TRIAL.on=false;
 S.skillCombos.Sura={enabled:true,slots:['ch_asura',null,null,null,null,null]};
 const mk=(boss,x)=>({n:boss?'Boss':'Escort',x,z:0,hp:1e14,max:1e14,atk:0,size:1,pack:0,fixed:true,at:1e9,spawn:1,boss,critRes:0,dots:[]});
 window.__boss=mk(true,8);window.__escort=mk(false,1);mobs=[window.__escort,window.__boss];mob=window.__escort;activePack=0;pl.x=0;pl.z=0;resetSkillRuntime();addSelfStack('sphere',5,20);window.__casts=[];
 playerAttack();mobs=[window.__escort];window.__boss.hp=0;pAtkT=0;
 }`);
 ev('for(let i=0;i<180&&window.__casts.length===0;i++)update(1/30)');
 assert.deepEqual(J('return window.__casts[0]'),{id:'ch_asura',boss:false},'boss disappears: Asura still fires at the surviving mob');
 console.log('Sura: personal damage, pet/class isolation, boss priority, fallback and real approach passed');
}finally{g.close()}
