// Actual page behavior: final ASPD ceiling, speed sources, and unchanged save data.
const assert=require('node:assert/strict'),{createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;
try{
 for(const cls of ev('CD4.map(x=>x[0])'))for(const sec of [5,6])for(const haste of [0,10]){
  ev(`S=fresh();S.cls=${JSON.stringify(cls)};S.lv=150;S.st.agi=150;S.eq.armor={id:101,slot:'armor',val:10,sec:${sec},aff:[{k:'aspd',v:10000}],cards:[]};tb.aspd=10000;ascState().level=10;ascState().stats[S.cls]={haste:${haste}};`);
  const interval=ev('aspd()');assert.ok(interval>=5/48,'no source can exceed 192 ASPD');
  assert.match(ev('V.stats()'),/ASPD <b>(\d+)<\/b>/);assert.ok(ev('Math.round(144+5/aspd())')<=192);
  if(sec===6)assert.equal(interval,5/48,'Mythic reaches the cap with and without Haste');
  else assert.equal(interval,.13*(1-haste/100),'ordinary equipment retains its floor before Haste');
 }
 ev(`S=fresh();S.cls='Rune Knight';S.lv=150;S.st.agi=150;S.eq.armor={id:102,slot:'armor',val:0,sec:6,aff:[{k:'aspd',v:10000}],cards:[]};ascState().level=10;ascState().stats[S.cls]={haste:10};S.sk={};tb={};S.hp=maxHp();resetSkillRuntime();t=0;pAtkT=0;pl.x=0;pl.z=0;activePack=0;swing=null;atkAnim=0;mobs=[{n:'Cap dummy',hp:1e15,max:1e15,atk:0,at:1e9,x:0,z:1,pack:0,size:1,spawn:1,fixed:true}];mob=mobs[0];window.basicHits=0;window.savedStrike=strike;strike=(...a)=>{basicHits++;return savedStrike(...a)};for(let i=0;i<1200;i++)update(1/120);strike=savedStrike;`);
 const hits=ev('basicHits');assert.ok(hits>=90&&hits<=97,`ten seconds at the cap: ${hits} basic hits`);
 ev(`window.savedAffixes=JSON.stringify(S.eq.armor.aff);localStorage.setItem(saveKey(),JSON.stringify(S));S=load()`);
 assert.equal(ev('JSON.stringify(S.eq.armor.aff)'),ev('savedAffixes'),'numeric caps do not rewrite saved rolls');
 assert.ok(ev('aspd()')>=5/48,'cap persists after reload');
 console.log(`PASS: 24 class/equipment/Haste boundaries, 192 display and combat cap, ${hits} basic hits in ten seconds, saved affixes preserved.`);
}finally{g.close()}

// Exercise real enemy swings: scoped HIT, dodge floor, blind and block remain distinct.
const h=createGame(),hev=h.ev;
try{
 hev(`S=fresh();S.cls='Rune Knight';S.lv=150;S.st.agi=150;S.eq.armor={id:103,slot:'armor',val:0,sec:6,aff:[],cards:[]};S.auto=false;S.adv=false;S.sk={};tb={};resetSkillRuntime();window.landed=0;`);
 assert.equal(hev('flee()'),80);
 // All original field stages retain their own level-based HIT, including refills.
 for(let map=0;map<10;map++)for(let stage=1;stage<=15;stage++){
  hev(`S.mp=${map};S.lvl=${stage};spawn()`);
  assert.equal(hev('mobs.every(m=>mhOf(m)===Math.min(30,Math.max(0,((m.lvl|0)-60)*1.25))*(m.boss?4/3:1))'),true,`original map ${map}/${stage}`);
 }
 function hitCount(map,boss,{blind=0,block=0,agi=150}={}){
  hev(`S.mp=${map};S.lvl=${boss?5:1};S.st.agi=${agi};spawn();window.attacker=mobs.find(m=>m.boss===${boss});mobs=[attacker];mob=attacker;camps=[];activePack=attacker.pack;pl.x=0;pl.z=0;pl.wx=null;pl.wz=null;pl.wt=0;
   Object.assign(attacker,{x:0,z:0,fixed:true,spawn:1,hp:1e15,max:1e15,atk:100,stun:0,blind:${blind}?{power:${blind},left:100}:null});resetSkillRuntime();
   ${block?`S.sk.jointbeat=10;skillState().buffs.jointbeat={key:'block',value:${block},left:100};`:''}
   window.landed=0;for(let i=0;i<100;i++){S.hp=1e12;attacker.at=0;pAtkT=1e9;Math.random=()=> (i+.5)/100;update(.001);if(S.hp<1e12)landed++}
   S.sk={};`);
  return hev('landed');
 }
 for(const map of [10,11]){
  assert.equal(hitCount(map,false),65,'regular hit chance at 80 Flee');
  assert.equal(hitCount(map,true),75,'boss hit chance at 80 Flee');
  assert.equal(hitCount(map,false,{blind:.1}),55,'blind retains its ten-point benefit');
  assert.equal(hitCount(map,false,{block:10}),55,'Parrying retains its ten-point benefit');
  assert.equal(hitCount(map,false,{agi:1}),95,'five-percent dodge floor survives higher HIT');
 }
 console.log('PASS: original-map HIT at all 150 stages; Astral/Thor real swings land 65%/75% at 80 Flee, blind/block benefits and dodge floor preserved.');
}finally{h.close()}
