// Run the actual page formulas, loot tables, crafting and save repair together.
const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const game=createGame(),{ev}=game;
const probe=code=>JSON.parse(ev('JSON.stringify((()=>{'+code+'})())'));
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log('ok '+name)};
try{
 test('Mythic crit adds beyond the ordinary cap without double counting',()=>{
  ev("S=fresh();S.cls='Sniper';S.lv=150;S.st.luk=120;S.indexXp=1000000;S.eq.weapon={id:8001,slot:'weapon',wt:'bow',sec:5,val:100,aff:[{k:'crit',v:1000}],cards:[]}");
  assert.equal(ev('crit()'),100);
  ev("S.eq.armor={id:8002,slot:'armor',sec:6,val:100,aff:[{k:'crit',v:20}],cards:[]}");
  assert.equal(ev('crit()'),120);assert.equal(ev('crit(80)'),120,'ordinary skill bonus stays capped');
  assert.equal(ev('crit()*.5'),60,'boss resistance uses the full 120%');
  ev('S.inv.push(S.eq.armor);S.eq.armor=null');assert.equal(ev('crit()'),100);
 });
 test('every Astral and Thor stage is equipment-free, including MVPs',()=>{
  assert.equal(ev(`MAPS.slice(10).every((_,i)=>Array.from({length:5},(_,j)=>fieldOf(i+10,j+1)).every(f=>f.mobs.concat(f.boss?[f.boss]:[]).every(m=>m.drops.length===0)))`),true);
  assert.equal(ev('gearPool(10,1).length+gearPool(11,5).length'),0);
 });
 test('Ascension Forge crafts Mythic using the exact material and Zeny cost',()=>{
  ev("S=fresh();S.cls='Lord Knight';S.lv=150;S.ascensionMat=[1000,1000,1000];S.zeny=1e9");
  const before=probe("return {m:S.ascensionMat,z:S.zeny,cost:ASC_SETS.celestial.cost.armor}");
  const result=probe("const crafted=craftAscensionPiece('celestial','armor');S.eq.armor=crafted.item;return {crafted,m:S.ascensionMat,z:S.zeny}");
  assert.equal(result.crafted.item.mythic,true);assert.equal(result.crafted.item.sec,6);assert.equal(result.crafted.item.ascSet,'celestial');
  assert.deepEqual(result.m,[before.m[0]-before.cost[0],before.m[1],before.m[2]-before.cost[1]]);
  assert.equal(result.z,before.z-before.cost[2]);assert.equal(ev('statCap()'),150);
 });
 test('active and saved class stats above 120 survive reload, including with gear removed',()=>{
  ev("S.st.str=150;S.st.vit=135;S.base['High Wizard']={lv:150,exp:0,pts:7,hp:100,st:{str:1,agi:1,dex:135,luk:1,int:150,vit:1},eq:null};localStorage.setItem(saveKey(),JSON.stringify(S));S=load()");
  assert.equal(ev('S.st.str'),150);assert.equal(ev('S.st.vit'),135);assert.equal(ev("S.base['High Wizard'].st.int"),150);assert.equal(ev("S.base['High Wizard'].st.dex"),135);
  ev('S.eq.armor=null;localStorage.setItem(saveKey(),JSON.stringify(S));S=load()');
  assert.equal(ev('S.st.str'),150);assert.equal(ev('statCap()'),120,'unequipping Mythic prevents further allocation above 120');
  ev('S.st.str=999;localStorage.setItem(saveKey(),JSON.stringify(S));S=load()');assert.equal(ev('S.st.str'),150);
 });
 console.log(passed+' passed');
}finally{game.close()}
