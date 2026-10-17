// Compare GM equipment to real N+ drops/evolution, then exercise legacy-save and queued-gift repair.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createGame}=require('./helpers/game');
const game=createGame(),{ev}=game;
let passed=0;
const test=(name,fn)=>{ev("S=fresh();S.cls='Rune Knight';S.lv=150;S.gm=true;S.zeny=1e12;S.ascensionMat=[1000,1000,1000];Math.random=()=>.5");fn();passed++;console.log('ok '+name)};
ev(`window.legacyGift=function(set,slot,wt,roll=1.05){
 const it=makeMythicEquipment(set,slot,wt).item;it.id=window.legacyNextId=(window.legacyNextId||10000)+1;delete it.mythicGiftVersion;
 it.val=Math.round({weapon:2,armor:4,head:10,off:3,leg:3,acc:5}[slot]*15*1.15*4.5*1.5*roll);
 return it;
};`);
try{
 test('every GM base matches top-field N+ drops; eligible evolution preserves the same roll',()=>{
  assert.equal(ev('fieldPower(9,15)'),180);
  for(const random of [0,.5,1])ev(`Math.random=()=>${random};
   for(const [setKey,set] of Object.entries(ASC_SETS))for(const slot of Object.keys(set.cost))for(const wt of slot==='weapon'?Object.keys(set.pieces.weapon):[undefined]){
    const gift=makeMythicEquipment(setKey,slot,wt).item;
    S.cls=wt==='katar'||wt==='dagger'?'Guillotine Cross':wt==='bow'?'Ranger':wt==='staff'?'Warlock':wt==='axe'||wt==='mace'?'Mechanic':'Rune Knight';
    const source=genGear(gearPool(9,15).find(x=>x.k===(wt||slot)),fieldPower(9,15),5,false,4,9,15);
    if(gift.val!==source.val)throw Error('gift/drop base mismatch');
    if(slot==='off')continue; // Current fourth jobs cannot equip shields, so the Forge excludes them.
    const before=source.val;S.inv=[source];S.zeny=1e12;S.ascensionMat=[1000,1000,1000];
    const result=transformToMythic(source,setKey);
    if(!result.success||source.val!==before||gift.val!==source.val)throw Error(setKey+' '+slot+' '+wt+' base mismatch');
   }`);
  assert.equal(ev("mythicGiftBaseValue('head',1.12)"),24343);
  assert.equal(ev("ev({val:mythicGiftBaseValue('head',1.12),r:15})"),79115);
 });
 test('all six maxed class presets match evolved maximum N+ bases with empty sockets',()=>{
  ev(`for(const cls of Object.keys(GM_ASC_PRESETS)){
   S.inv=[];ACT.gmmaxset(cls);
   for(const it of S.inv){
    Math.random=()=>1;const source=genGear(gearPool(9,15).find(x=>x.k===(it.wt||it.slot)),fieldPower(9,15),5,false,4,9,15);
    if(it.val!==source.val||it.r!==15||it.cards.length||it.mythicGiftVersion!==1)throw Error(cls+' preset mismatch');
   }
  }`);
 });
 test('legacy min/mid/max gifts repair deterministically across every set/slot without changing other data',()=>{
  ev(`for(const set of Object.keys(ASC_SETS))for(const slot of Object.keys(ASC_SETS[set].cost))for(const wt of slot==='weapon'?Object.keys(ASC_SETS[set].pieces.weapon):[undefined]){
   const repaired=[];
   for(const roll of [.95,1,1.05]){
    const it=legacyGift(set,slot,wt,roll);it.r=9;it.locked=true;it.wearer='Ranger';it.cards=[{id:9102,cardVersion:1,stat:'atk',v:8}];
    const before=JSON.stringify({...it,val:0,mythicGiftVersion:1});
    Math.random=()=>{throw Error('repair must not reroll')};repairMythicGiftBase(it);
    if(JSON.stringify({...it,val:0})!==before)throw Error('item progress changed');
    const once=JSON.stringify(it);repairMythicGiftBase(it);if(JSON.stringify(it)!==once)throw Error('repair repeated');
    repaired.push(it.val);Math.random=()=>.5;
   }
   if(repaired[0]!==mythicGiftBaseValue(slot,.9)||repaired[2]!==mythicGiftBaseValue(slot,1.12)||!(repaired[0]<repaired[1]&&repaired[1]<repaired[2]))throw Error('roll ordering lost');
  }`);
 });
 test('real load repairs equipped/bag gear and preserves class IDs, cards, pending offers and wallets across accounts',()=>{
  ev(`currentUser='mythic-owner-a';S.eq.head=legacyGift('molten','head');S.eq.head.r=15;S.eq.head.locked=true;
   S.eq.head.cards=[newCard(CARD_CATALOG.find(c=>!socketWhy(c,S.eq.head)))];S.inv=[legacyGift('infernal','weapon','bow',.95)];
   S.base.Ranger={lv:150,st:{},eq:{weapon:S.inv[0].id}};
   reforge('head',true);if(!validReforgeOffer(S))throw Error('missing paid reforge fixture');
   window.kept=JSON.stringify([S.eq.head.id,S.eq.head.r,S.eq.head.locked,S.eq.head.cards,S.inv[0].id,S.base.Ranger.eq,S.reforgePending,S.zeny,S.ascensionMat]);
   localStorage.setItem(saveKey(),JSON.stringify(S));S=load();`);
  assert.equal(ev('ev(S.eq.head)'),79115);
  assert.equal(ev('JSON.stringify([S.eq.head.id,S.eq.head.r,S.eq.head.locked,S.eq.head.cards,S.inv[0].id,S.base.Ranger.eq,S.reforgePending,S.zeny,S.ascensionMat])===window.kept'),true);
  ev('window.once=JSON.stringify(S);localStorage.setItem(saveKey(),window.once);S=load()');
  assert.equal(ev('JSON.stringify(S)===window.once'),true);
  ev("window.bowId=S.inv[0].id;changeClass('Ranger')");
  assert.equal(ev('S.eq.weapon.id===window.bowId&&S.eq.weapon.val===mythicGiftBaseValue("weapon",.9)'),true);
  ev("changeClass('Rune Knight')");assert.equal(ev('ev(S.eq.head)'),79115);
  ev("currentUser='mythic-owner-b';S=fresh();localStorage.setItem(saveKey(),JSON.stringify(S));S=load()");
  assert.equal(ev('S.inv.length'),0);assert.equal(ev('S.eq.head'),null);
  ev("currentUser='mythic-owner-a';S=load()");assert.equal(ev('ev(S.eq.head)'),79115);
 });
 test('preserved GX base and affixes, custom values and ordinary N+ gear remain byte-equivalent',()=>{
  ev(`window.cases=[legacyGift('infernal','head'),legacyGift('molten','head'),legacyGift('molten','head'),legacyGift('molten','head'),legacyGift('molten','head')];
   cases[0].val=23652;cases[0].r=9;cases[0].aff=[{k:'str',v:89},{k:'atk',v:62},{k:'luk',v:60},{k:'int',v:74}];
   cases[1].val=100;cases[2].val=1224;cases[3].sec=5;cases[4].name='Custom GM item';
   window.before=JSON.stringify(cases);cases.forEach(repairMythicGiftBase)`);
  assert.equal(ev('JSON.stringify(cases)===window.before'),true);
  assert.equal(ev('ev(cases[0])'),55582);
 });
 test('queued legacy cloud gifts repair copies without altering payload, sockets or affixes',()=>{
  ev(`window.payload={amount:2,item:legacyGift('infernal','head')};payload.item.r=15;payload.item.cards=[{id:9102,cardVersion:1,stat:'matk',v:8}];
   window.before=JSON.stringify(payload);let roll=0;Math.random=()=>.3+(++roll)/100;gmApplyGift(payload)`);
  assert.equal(ev('JSON.stringify(payload)===window.before'),true);
  assert.equal(ev('S.inv.length'),2);assert.equal(ev('S.inv[0].id!==S.inv[1].id'),true);
  assert.ok(ev('S.inv.every(it=>ev(it)===79115&&JSON.stringify(it.cards)===JSON.stringify(payload.item.cards)&&JSON.stringify(it.aff)===JSON.stringify(payload.item.aff))'));
 });
 test('ordinary GM sets and regenerated cloud catalog share the corrected base band',()=>{
  ev("S.inv=[];ACT.gmset('molten')");
  assert.ok(ev('S.inv.length>0&&S.inv.every(it=>it.mythicGiftVersion===1&&it.val>=mythicGiftBaseValue(it.slot,.9)&&it.val<=mythicGiftBaseValue(it.slot,1.12))'));
  const catalog=JSON.parse(fs.readFileSync(__dirname+'/../../functions/_lib/gm-catalog.js','utf8').split('export const GM_CATALOG = ')[1].trim().slice(0,-1));
  const gifts=catalog.entries.filter(x=>x.id.startsWith('mythic:'));
  assert.equal(gifts.length,72);
  for(const {item}of gifts){assert.equal(item.val,ev(`mythicGiftBaseValue(${JSON.stringify(item.slot)},1.01)`));assert.equal(item.mythicGiftVersion,1);}
 });
 console.log(passed+' Mythic gift base checks passed');
}finally{game.close()}
