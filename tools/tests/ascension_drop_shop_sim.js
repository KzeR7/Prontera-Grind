// Real-page regression for Ascension material odds and the two Mythic scroll exchanges.
const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const game=createGame(),{ev,window}=game;
let passed=0;
const test=(name,fn)=>{ev('S=fresh();Math.random=window.originalRandom');fn();passed++;console.log('ok '+name)};
const data=code=>JSON.parse(ev('JSON.stringify('+code+')'));
ev('window.originalRandom=Math.random');
try{
 const MAT=ev('ASC_MAT_CH'),SIG=ev('ASC_SIGIL_CH');
 test('material thresholds on both maps, ordinary enemies and bosses',()=>{
  for(const map of [10,11])for(const boss of [false,true])for(const [mat,chance] of [[map-10,MAT],[2,boss?1:SIG]]){
   for(const [roll,expected] of [[(chance-1e-8)/100,true],[chance/100,false],[(chance+1e-8)/100,false]]){
    // The two probabilities roll before uid() is called; avoid matching the other material.
    assert.equal(ev(`(()=>{let n=0;Math.random=()=>[${mat===2?.9:roll},${mat===2?roll:.9}][n++]??.5;return ascensionDrops({mapIndex:${map},boss:${boss}}).some(x=>x.ascMat===${mat})})()`),expected);
   }
  }
  ev('Math.random=()=>0');assert.equal(ev('ascensionDrops({mapIndex:9,boss:true}).length'),0);
 });
 test('online collection and offline kills share the approved material rates',()=>{
  for(const map of [10,11])for(const boss of [false,true])for(const roll of [.0004,.001,.005,.02,.03]){
   ev(`S=fresh();S.mp=${map};S.lvl=${boss?5:1};S.cls='Rune Knight';S.lv=150;spawn();window.target=mobs.find(m=>m.boss===${boss})`);
   // v212: the chances track the monster's own HP, so read them off the live target.
   const matCh=ev('ascMaterialChance(window.target)'),sigCh=ev('ascSigilChance(window.target)');
   ev(`Math.random=()=>${roll};`);
   // Exercise the online drop producer and collection path.
   ev('ascensionDrops(window.target).forEach(collect)');const online=data('S.ascensionMat');
   assert.deepEqual(online,[map===10&&roll*100<matCh?1:0,map===11&&roll*100<matCh?1:0,roll*100<sigCh?1:0]);
   ev('S.ascensionMat=[0,0,0];offlineAwardKill(window.target,{measured:true,kills:0,zeny:0,exp:0,cards:0,drops:0,ori:0,elu:0,pets:0,petFolds:0,petRefunds:0})');
   assert.deepEqual(data('S.ascensionMat'),online);
  }
 });
 test('Black Market requires level and exactly 100 Sigils, preserving other currencies',()=>{
  ev('S.lv=99;S.zeny=123456;S.shards=777;S.ascensionMat=[30,40,100];S.refineScrolls=4;ACT.buymythicscroll()');
  assert.equal(ev('S.mythicScrolls'),0);assert.equal(ev('S.ascensionMat[2]'),100);
  ev('S.lv=100;S.ascensionMat[2]=99;ACT.buymythicscroll()');assert.equal(ev('S.mythicScrolls'),0);
  ev('S.ascensionMat[2]=100;ACT.buymythicscroll();ACT.buymythicscroll()');
  assert.deepEqual(data('[S.mythicScrolls,S.ascensionMat,S.shards,S.zeny,S.refineScrolls]'),[1,[30,40,0],777,123456,4]);
  ev('S.ascensionMat[2]=100;S.mythicScrolls=Number.MAX_SAFE_INTEGER;ACT.buymythicscroll()');assert.equal(ev('S.ascensionMat[2]'),100);
 });
 test('Echo sells exactly one scroll for 600 Echo Shards through both entry points',()=>{
  for(const inline of [false,true]){
   ev('S=fresh();S.shards=599;S.ascensionMat=[12,13,14];S.zeny=123;S.refineScrolls=3');
   ev(`trialBuy('mscroll',${inline})`);assert.equal(ev('S.mythicScrolls'),0);assert.equal(ev('S.shards'),599);
   ev(`S.shards=600;trialBuy('mscroll',${inline});trialBuy('mscroll',${inline})`);
   assert.deepEqual(data('[S.mythicScrolls,S.shards,S.ascensionMat,S.zeny,S.refineScrolls]'),[1,0,[12,13,14],123,3]);
   ev(`S.shards=600;S.mythicScrolls=Number.MAX_SAFE_INTEGER;trialBuy('mscroll',${inline})`);assert.equal(ev('S.shards'),600);
  }
 });
 test('market, Echo, maps and handbook show current prices and rates',()=>{
  ev("S.lv=100;S.ascensionMat=[0,0,99];sub.market='black'");
  let market=window.document.createElement('div');market.innerHTML=ev('V.market()');
  assert.equal(market.querySelector('[data-a=buymythicscroll]').disabled,true);
  assert.match(market.textContent,/100 Valkyrie’s Sigils/);
  ev('S.ascensionMat[2]=100');market.innerHTML=ev('V.market()');assert.equal(market.querySelector('[data-a=buymythicscroll]').disabled,false);
  market.innerHTML=ev('trialShopHtml(true)');assert.equal(market.querySelector('[data-buy=mscroll]').textContent,'600 Shards');
  for(const map of [10,11]){
   ev(`mapM=${map};mapL=1`);
   // v212: the map card prints the live, HP-scaled odds instead of a constant.
   const hp=ev(`ascensionCombatStats(${map},1).hp`),p=v=>String(+v.toFixed(3)),html=ev('V.map()');
   assert.ok(html.includes(`${p(ev(`ascMaterialChance({max:${hp}})`))}% per kill (${p(ev(`ascMaterialChance({max:${hp*3}})`))}% from the MVP)`),'the map card shows the live material odds');
   assert.ok(html.includes(`${p(ev(`ascSigilChance({max:${hp}})`))}% per mob / 1% per MVP`),'the map card shows the live Sigil odds');
  }
  assert.match(ev('ascensionGuide()'),/600 Echo Shards/);assert.doesNotMatch(ev('refineProtectionUI()'),/boss drop only/);
 });
 test('composed market and inline Echo purchase buttons reach real click handlers',()=>{
  ev("S.lv=100;S.ascensionMat=[0,0,100];S.shards=600;sub.market='black';tabs.splice(0,tabs.length,'market');renderWin()");
  let button=window.document.querySelector('[data-win=market] [data-a=buymythicscroll]');assert.ok(button);assert.equal(button.disabled,false);button.click();
  assert.equal(ev('S.mythicScrolls'),1);assert.equal(ev('S.ascensionMat[2]'),0);
  ev("sub.market='echo';renderWin()");button=window.document.querySelector('[data-win=market] [data-buy=mscroll]');assert.ok(button);button.click();
  assert.equal(ev('S.mythicScrolls'),2);assert.equal(ev('S.shards'),0);
 });
 test('both purchased scrolls persist and protect Mythic refinement failure',()=>{
  ev("S.lv=150;S.cls='Rune Knight';S.ascensionMat=[100,100,200];S.zeny=1e12;S.eq.weapon=makeMythicEquipment('celestial','weapon','sword').item;S.ascensionMat[2]=100;ACT.buymythicscroll();S.shards=600;trialBuy('mscroll',true);localStorage.setItem(saveKey(),JSON.stringify(S));S=load()");
  assert.equal(ev('S.mythicScrolls'),2);assert.equal(ev('S.ascensionMat[2]'),0);assert.equal(ev('S.shards'),0);
  ev("S.eq.weapon.r=12;S.ore.ori=1000;S.useRefineScroll=true;Math.random=()=>.99999;refine('weapon')");
  assert.equal(ev('S.eq.weapon.r'),12);assert.equal(ev('S.mythicScrolls'),1);
 });
 console.log(passed+' Ascension drop/shop groups passed');
}finally{game.close()}
