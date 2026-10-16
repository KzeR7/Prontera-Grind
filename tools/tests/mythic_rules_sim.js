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
  ev("S=fresh();S.cls='Rune Knight';S.lv=150;S.ascensionMat=[1000,1000,1000];S.zeny=1e9");
  const before=probe("return {m:S.ascensionMat,z:S.zeny,cost:ASC_SETS.celestial.cost.armor}");
  const result=probe("S.eq.armor={id:9100,slot:'armor',sec:5,val:100,aff:[],cards:[]};const crafted=transformToMythic(S.eq.armor,'celestial');return {crafted,m:S.ascensionMat,z:S.zeny}");
  assert.equal(result.crafted.item.mythic,true);assert.equal(result.crafted.item.sec,6);assert.equal(result.crafted.item.ascSet,'celestial');
  assert.deepEqual(result.m,[before.m[0]-before.cost[0],before.m[1],before.m[2]-before.cost[1]]);
  assert.equal(result.z,before.z-before.cost[2]);assert.equal(ev('statCap()'),120,'v174: Mythic no longer raises the stat cap');
 });
 test('v174: active and saved class stats above 120 clamp to 120 with an exact refund',()=>{
  ev("S.pts=100;S.st.str=150;S.st.vit=135;S.base['High Wizard']={lv:150,exp:0,pts:7,hp:100,st:{str:1,agi:1,dex:135,luk:1,int:150,vit:1},eq:null};localStorage.setItem(saveKey(),JSON.stringify(S));S=load()");
  assert.equal(ev('S.st.str'),120);assert.equal(ev('S.st.vit'),120);assert.equal(ev("S.base['High Wizard'].st.int"),120);assert.equal(ev("S.base['High Wizard'].st.dex"),120);
  assert.equal(ev('S.pts'),100+1335+555,'150->120 refunds 1335, 135->120 refunds 555');
  assert.equal(ev("S.base['High Wizard'].pts"),7+1335+555);
  ev('S.eq.armor=null;localStorage.setItem(saveKey(),JSON.stringify(S));S=load()');
  assert.equal(ev('S.st.str'),120);assert.equal(ev('statCap()'),120,'the cap is 120 with or without Mythic');
  ev('S.st.str=999;localStorage.setItem(saveKey(),JSON.stringify(S));S=load()');assert.equal(ev('S.st.str'),120);
 });
 test('Mythic item cards list the full set ladder with the worn count, and the inspector one-liner follows it',()=>{
  ev("S=fresh();S.cls='Rune Knight';S.lv=150;S.eq.armor=makeMythicEquipment('celestial','armor').item;S.eq.head=makeMythicEquipment('celestial','head').item");
  const card=ev('itemMain(S.eq.armor)');
  assert.match(card,/Celestial set/);
  assert.match(card,/\(2 worn\)/);
  assert.match(card,/2 pieces:<\/b> \+5% ATK, \+5% Max HP — active/);
  assert.match(card,/4 pieces:<\/b> \+10% ATK, \+10% Max HP, \+5% ASPD<\/div>/,'an unearned tier stays a plain row, not an active one');
  assert.match(card,/6 pieces:<\/b> \+18% ATK/);
  assert.match(ev('eclipseItemSummary(S.eq.armor,true)'),/Celestial 2\/6/);
  assert.match(ev('eclipseItemSummary(S.eq.armor,true)'),/\+5% ATK, \+5% Max HP — active/);
  ev('S.eq.head=null');
  assert.match(ev('itemMain(S.eq.armor)'),/\(1 worn\)/);
  assert.doesNotMatch(ev('itemMain(S.eq.armor)'),/— active/);
  assert.match(ev('eclipseItemSummary(S.eq.armor,true)'),/2 pieces to activate a bonus/);
  assert.doesNotMatch(ev('itemMain(S.eq.weapon)'),/eclipse-item-set|Celestial set/,'ordinary gear shows no set card');
 });
 test('v173: Mythic rolls use the plain table value, so the step over N+ is smooth (~1.67x, was 2.5x)',()=>{
  ev(`S=fresh();S.cls='Rune Knight';Math.random=()=>0.999999;window.maxRoll=rollAffix('str',{slot:'armor',sec:6,tier:4,mp:10,quality:1.5}).v;Math.random=()=>0;window.minRoll=rollAffix('str',{slot:'armor',sec:6,tier:4,mp:10,quality:1.5}).v;Math.random=()=>0.999999;window.npRoll=rollAffix('str',{slot:'armor',sec:5,tier:4,mp:9,quality:1}).v;`);
  assert.equal(ev('maxRoll'),69,'top STR roll is the table max, not table x 1.5 (was 104)');
  assert.equal(ev('minRoll'),44);
  assert.equal(ev('npRoll'),55,'N+ ignores the mythic rule and rolls exactly as before');
  ev(`S.eq.armor={id:9200,slot:'armor',sec:5,val:100,aff:[{k:'str',v:40}],cards:[]};S.ascensionMat=[1000,1000,1000];S.zeny=1e9;window.evo=transformToMythic(S.eq.armor,'celestial').item`);
  assert.equal(ev('evo.aff.length'),4);
  assert.ok(ev('evo.aff.every(a=>a.v<=affixValue(a.k,6,4,1.25,10))'),'evolved and filled rolls never exceed the plain table max');
  assert.equal(ev('evo.aff.filter(a=>a.v===40).length'),1,'the kept N+ roll survives evolution untouched');
 });
 console.log(passed+' passed');
}finally{game.close()}
