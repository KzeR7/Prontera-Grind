// The restored, flag-on jobs must coexist with the newer Mythic equipment system.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createGame}=require('./helpers/game');
const source=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
const game=createGame(source.replace('const FOURTH_JOBS_LIVE=false;','const FOURTH_JOBS_LIVE=true;'));
const {ev}=game;
const probe=code=>JSON.parse(ev('JSON.stringify((()=>{'+code+'})())'));
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log('ok '+name)};
try{
 for(const [cls,parent] of ev('CD4.map(row=>row.slice(0,2))')){
  test(cls+': Mythic identity, cards and bonuses survive promotion, class return and reload',()=>{
   ev(`S=fresh();S.auto=false;S.cls=${JSON.stringify(parent)};S.lv=150;S.zeny=1e10;S.ascensionMat=[1000,1000,1000];
    for(const name of lineOf(S.cls))S.jobs[name]={jl:CLASSES[name].mj,jx:0};
    S.eq.weapon={id:90001,slot:'weapon',wt:C().wt[0],name:'N+ regression weapon',sec:5,tier:4,val:500,r:10,slots:3,cards:[Object.assign(newCard(CARD_CATALOG.find(card=>card.stat==='str'&&!card.nightmare)),{id:90002})],aff:[{k:'str',v:10},{k:'agi',v:10},{k:'vit',v:10}]};
    window.transformed=transformToMythic(S.eq.weapon,'celestial');
    window.crafted=craftAscensionPiece('celestial','armor');S.eq.armor=window.crafted.item;S.eq.weapon.locked=false;S.eq.armor.locked=false;
   `);
   assert.equal(ev('window.transformed.success'),true);
   assert.equal(ev('S.eq.weapon.r'),10);
   assert.equal(ev('S.eq.weapon.aff.length'),4);
   assert.equal(ev("rarOf(S.eq.weapon).n"),'Mythic');
   const before=probe("return {weapon:S.eq.weapon,armor:S.eq.armor,materials:S.ascensionMat,zeny:S.zeny,atkBonus:bon('atk')}" );
   assert.equal(probe("const total=bon('atk'),set=S.eq.armor.ascSet;delete S.eq.armor.ascSet;const without=bon('atk');S.eq.armor.ascSet=set;return total-without"),5,'two-piece set reaches the live stat formula');
   ev(`changeClass(${JSON.stringify(cls)});JOB_RITE.enemy.hp=0;kill(JOB_RITE.enemy);JOB_RITE.exitAt=Date.now();tickJobRite();`);
   assert.equal(ev('S.cls'),cls);assert.equal(ev('jobOf().jl'),1);
   assert.equal(ev('items().every(it=>canUse(it))'),true);
   assert.deepEqual(probe("return {weapon:S.eq.weapon,armor:S.eq.armor,materials:S.ascensionMat,zeny:S.zeny,atkBonus:bon('atk')}"),before);
   ev(`changeClass(${JSON.stringify(parent)});changeClass(${JSON.stringify(cls)});localStorage.setItem(saveKey(),JSON.stringify(S));S=load();`);
   assert.equal(ev('S.cls'),cls);
   assert.deepEqual(probe("return {weapon:S.eq.weapon,armor:S.eq.armor,materials:S.ascensionMat,zeny:S.zeny,atkBonus:bon('atk')}"),before);
   assert.equal(ev('items().concat(S.inv).filter(it=>it.id===90001).length'),1,'one physical weapon, with snapshots referencing it by ID');
  });
 }
 test('flag-on fourth jobs retain Mythic refinement above +10 and its separate scrolls',()=>{
  ev("S.ore.ori=1000;S.mythicScrolls=5;S.useRefineScroll=true;window.previousRandom=Math.random;Math.random=()=>0;");
  try{
   for(let rank=11;rank<=15;rank++){
    ev("refine('weapon')");assert.equal(ev('S.eq.weapon.r'),rank);
   }
   assert.equal(ev('S.mythicScrolls'),0);
   assert.equal(ev("rarOf(S.eq.weapon).n"),'Mythic');
  }finally{ev('Math.random=window.previousRandom')}
 });
 console.log(passed+' passed');
}finally{game.close()}
