const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;let n=0;
const test=(name,fn)=>{ev("S=fresh();S.gm=true;S.lv=150;window.saved=0;save=()=>window.saved++");fn();n++;console.log('ok '+name)};
try{
 test('all six class presets grant legal maxed gear and distinct weapon alternatives',()=>{
  const presets={'Rune Knight':['molten',6],'Warlock':['ethereal',6],'Ranger':['infernal',6],'Guillotine Cross':['voidwalker',8],'Arch Bishop':['primal',6],'Mechanic':['molten',7]};
  for(const [cls,[set,count]] of Object.entries(presets)){
   ev(`S=fresh();S.gm=true;S.cls=${JSON.stringify(cls)};ACT.gmmaxset(S.cls)`);
   assert.equal(ev('S.inv.length'),count,cls);
   assert.equal(ev('new Set(S.inv.map(it=>it.id)).size'),count);
   assert.ok(ev(`S.inv.every(it=>canUse(it)&&it.ascSet===${JSON.stringify(set)}&&it.sec===6&&it.mythic&&it.r===15&&it.cards.length===0&&it.aff.length===4&&new Set(it.aff.map(a=>a.k)).size===4)`),cls);
   assert.ok(ev('C().wt.every(w=>S.inv.some(it=>it.wt===w))'));
   assert.equal(ev("S.inv.filter(it=>it.slot==='acc').length"),2);
   // Compare each selected affix and base to the real constructor/roller at their upper bound.
   assert.ok(ev(`(()=>{const random=Math.random;Math.random=()=>1;try{return S.inv.every(it=>{
    const upper=makeMythicEquipment(it.ascSet,it.slot,it.wt).item;
    return it.val===upper.val&&it.aff.every(a=>affixPool(it).includes(a.k)&&a.v===rollAffix(a.k,it).v);
   })}finally{Math.random=random}})()`),cls+' upper roll values');
   if(cls==='Guillotine Cross')assert.equal(ev("S.inv.filter(it=>it.wt==='dagger').length"),2);
  }
 });
 test('grant preserves class, equipment, pending reforge, wallet and existing item identity',()=>{
  ev("S.cls='Novice';S.eq.weapon={id:123,slot:'weapon',wt:'dagger',sec:0};S.inv=[{id:456,slot:'armor',sec:0}];S.reforgePending={id:123};window.oldItem=S.inv[0];window.original=JSON.stringify([S.cls,S.lv,S.st,S.jobs,S.eq,S.zeny,S.ore,S.ascensionMat,S.reforgePending]);ACT.gmmaxset('Warlock')");
  assert.equal(ev('S.inv[0]===window.oldItem'),true);
  assert.equal(ev('JSON.stringify([S.cls,S.lv,S.st,S.jobs,S.eq,S.zeny,S.ore,S.ascensionMat,S.reforgePending])===window.original'),true);
  assert.equal(ev('window.saved'),1);
 });
 test('capacity boundary grants all items or none, invalid and non-GM calls do nothing',()=>{
  ev("S.inv=Array.from({length:BAGMAX-5},(_,id)=>({id}));window.before=JSON.stringify(S);ACT.gmmaxset('Warlock')");
  assert.equal(ev('JSON.stringify(S)===window.before'),true);assert.equal(ev('window.saved'),0);
  ev("S.inv.pop();ACT.gmmaxset('Warlock')");assert.equal(ev('S.inv.length'),ev('BAGMAX'));
  ev("window.before=JSON.stringify(S);ACT.gmmaxset('Novice');ACT.gmmaxset('__proto__');ACT.gmmaxset('constructor')");
  assert.equal(ev('JSON.stringify(S)===window.before'),true);
  ev("S=fresh();S.gm=false;window.before=JSON.stringify(S);ACT.gmmaxset('Warlock');ACT.gmo('1000');ACT.gmresetlv('99')");
  assert.equal(ev('JSON.stringify(S)===window.before'),true);
 });
 test('+1000 ores is additive and the existing +20 remains available',()=>{
  ev("S.ore={ori:7,elu:19};ACT.gmo('1000')");assert.equal(ev('S.ore.ori'),1007);assert.equal(ev('S.ore.elu'),1019);
  ev('ACT.gmo()');assert.equal(ev('S.ore.ori'),1027);assert.equal(ev('S.ore.elu'),1039);
  ev("window.before=JSON.stringify(S);for(const v of ['1','-1000','1000.5','no','Infinity',''])ACT.gmo(v)");
  assert.equal(ev('JSON.stringify(S)===window.before'),true);
 });
 test('level resets clear EXP, recompute points and preserve progression and wallets',()=>{
  for(const level of [1,99,120]){
   ev(`S.st.str=30;S.exp=123456;S.hp=1;window.original=JSON.stringify([S.cls,S.st,S.jobs,S.eq,S.zeny,S.ore,S.ascension,S.skillLv]);ACT.gmresetlv('${level}')`);
   assert.equal(ev('S.lv'),level);assert.equal(ev('S.exp'),0);
   assert.equal(ev('S.pts'),ev('Math.max(0,totalPts()-ptsSpent())'));assert.equal(ev('S.hp'),ev('maxHp()'));
   assert.equal(ev('JSON.stringify([S.cls,S.st,S.jobs,S.eq,S.zeny,S.ore,S.ascension,S.skillLv])===window.original'),true);
  }
  ev("window.before=JSON.stringify(S);for(const v of ['0','150','99.1','no',''])ACT.gmresetlv(v)");assert.equal(ev('JSON.stringify(S)===window.before'),true);
  ev('ACT.gmresetlv()');assert.equal(ev('S.lv'),1);
 });
 test('maxed gear and selected level survive real save repair',()=>{
  ev("S.cls='Guillotine Cross';ACT.gmmaxset(S.cls);ACT.gmresetlv('120');window.gear=JSON.stringify(S.inv.map(it=>({...it,locked:false})));localStorage.setItem(saveKey(),JSON.stringify(S));S=load()");
  assert.equal(ev('S.lv'),120);assert.equal(ev('S.exp'),0);assert.equal(ev('JSON.stringify(S.inv)===window.gear'),true);
 });
 test('GM panel exposes six presets, additive ore control and all three level targets',()=>{
  const doc=g.window.document.createElement('div');doc.innerHTML=ev('V.gm()');
  assert.equal(doc.querySelectorAll('[data-a="gmmaxset"]').length,6);
  assert.ok(doc.querySelector('[data-a="gmo"][data-v="1000"]'));
  assert.equal(doc.querySelectorAll('[data-a="gmresetlv"]').length,3);
  for(const lv of [1,99,120])assert.ok(doc.querySelector(`[data-a="gmresetlv"][data-v="${lv}"]`));
 });
 console.log(n+' passed');
}finally{g.close()}
