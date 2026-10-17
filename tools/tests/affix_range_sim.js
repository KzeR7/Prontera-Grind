// Exercise displayed roll bounds, real generation, paid offers and legacy saves together.
const assert=require('node:assert/strict'),{createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;
try{
 ev(`S=fresh();S.cls='Rune Knight';S.lv=150;window.mask={...makeMythicEquipment('infernal','head').item,aff:[{k:'str',v:89},{k:'atk',v:62},{k:'luk',v:60},{k:'int',v:74}]};S.eq.head=mask`);
 assert.match(ev('affixRangeText(mask.aff[0],mask)'),/STR \+89 \[44~69\] · saved roll outside current range$/);
 assert.match(ev('affixRangeText(mask.aff[1],mask)'),/ATK % \+62 \[42~66\]$/);
 assert.match(ev('affixRangeText(mask.aff[2],mask)'),/LUK \+60 \[44~69\]$/);
 assert.match(ev('affixRangeText(mask.aff[3],mask)'),/INT \+74 \[44~69\] · saved roll outside current range$/);
 // Every grade, pool, quality, rounding and movement cap: endpoints must be attainable.
 let cases=0;
 for(let sec=0;sec<=6;sec++)for(let tier=0;tier<=4;tier++)for(const quality of [1,1.25,1.5])for(const slot of ['weapon','head','armor','off','leg','acc']){
  ev(`window.profile={sec:${sec},tier:${tier},quality:${quality},slot:'${slot}',wt:'staff',mp:9}`);
  for(const k of Array.from(ev('affixPool(profile)'))){
   const range=ev(`affixRangeText({k:'${k}',v:0},profile)`),match=range.match(/\[(\d+)~(\d+)( effective)?\]/);
   assert.ok(match,range);const scale=k==='hp'?2:1;
   for(const [random,bound]of [[0,1],[.9999999999999999,2]]){
    const value=ev(`Math.random=()=>${random};rollAffix('${k}',profile).v`);
    assert.equal(value*scale,Number(match[bound]),`${sec}/${tier}/${quality}/${slot}/${k}: ${range}`);
   }cases++;
  }
 }
 // An N+ item keeps its actual rolls through evolution, even below the Mythic range.
 ev(`S=fresh();S.cls='Rune Knight';S.lv=150;S.zeny=1e12;S.ascensionMat=[10000,10000,10000];S.eq.head=genGear({k:'head',n:'Legacy mask'},150,5,false,4,9,15);S.eq.head.aff=[{k:'str',v:35},{k:'luk',v:60},{k:'int',v:89}];window.identity=S.eq.head.id;transformToMythic(S.eq.head,'infernal');window.kept=JSON.stringify(S.eq.head.aff);lsPut(saveKey(),JSON.stringify(S));S=load()`);
 assert.equal(ev('S.eq.head.id'),ev('identity'));
 assert.equal(ev('JSON.stringify(S.eq.head.aff)'),ev('kept'));
 assert.match(ev('reforgePanel()'),/STR \+35 \[44~69\] · saved roll outside current range/);
 // A selective paid reforge can improve STR to the printed maximum, preserving protected rolls.
 ev(`S.ore.elu=10000;reforgeSelection[S.eq.head.id]=[0];window.randoms=[0,.999999];Math.random=()=>randoms.shift()??.5;reforge('head');window.paid=S.zeny;window.offer=JSON.stringify(S.reforgePending);lsPut(saveKey(),JSON.stringify(S));S=load()`);
 assert.equal(ev('JSON.stringify(S.reforgePending)'),ev('offer'));
 assert.equal(ev('S.reforgePending.after[0].k'),'str');
 assert.equal(ev('S.reforgePending.after[0].v'),69);
 assert.equal(ev('S.eq.head.aff[0].v'),35,'offer has not changed current gear');
 ev('resolveReforge(true);resolveReforge(true)');
 assert.equal(ev('S.eq.head.aff[0].v'),69);assert.equal(ev('S.eq.head.aff[1].v'),60);assert.equal(ev('S.eq.head.aff[2].v'),89);
 assert.equal(ev('S.zeny'),ev('paid'),'acceptance is charged once');
 assert.match(ev('affixRangeText(S.eq.head.aff[0],S.eq.head)'),/^STR \+69 \[44~69\]$/);
 console.log(`PASS affix ranges: screenshot values, ${cases} range endpoints, all grades/qualities/pools, HP units, movement caps, evolution/save preservation and paid improvement/acceptance`);
}finally{g.close()}
