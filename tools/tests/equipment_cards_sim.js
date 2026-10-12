// Ownership invariants across replacement, socketed merges and irreversible Index use.
const assert=require('node:assert/strict');const {createGame}=require('./helpers/game');const g=createGame(),ev=g.ev;
try{
 ev(`S.cls='Knight';S.auto=true;window.makeGear=(id,slot='armor',slots=3)=>({id,name:'Test '+id,slot,slots,cards:[],val:10,aff:[],r:0,rar:0});window.makeCard=(id,family='A',fit=['armor'])=>({id,card:1,cardKey:family,n:family+' Card',family,stat:'str',v:1,g:0,effects:[{k:'str',v:1}],fit});`);
 for(const method of ['equip','equipIn','autoEquip']){
  ev(`S.eq={armor:makeGear(1)};S.eq.armor.cards=[makeCard(11),makeCard(12,'B'),makeCard(13,'C')];S.inv=[makeGear(2,'armor',2)];S.inv[0].val=20;S.inv[0].cards=[makeCard(14,'A')];`);
  ev(method==='equip'?'equip(2)':method==='equipIn'?"equipIn('armor',2)":'autoEquip(S.inv[0])');
  assert.equal(ev('S.eq.armor.id'),2,method);assert.equal(ev('S.eq.armor.cards.map(c=>c.id).join()'),'14,12');assert.equal(ev('S.inv[0].cards.map(c=>c.id).join()'),'11,13');
  assert.equal(ev('new Set(ownedCardEntries().map(x=>x.card.id)).size'),4,'no duplicates or losses');
 }
 ev(`window.old=makeGear(3);old.cards=[makeCard(30)];window.next=makeGear(4,'head');transferEquipmentCards(old,next,'head')`);assert.equal(ev('old.cards.length'),1,'equipment categories do not cross');
 ev(`S.eq={armor:makeGear(5)};S.eq.armor.cards=[makeCard(50)];S.cards=[makeCard(51),makeCard(52)];window.confirmMerge=null;ask=(m,fn)=>{window.promptText=m;confirmMerge=fn};mergeCard(50);`);
 assert.match(ev('promptText'),/Consume 1/);assert.equal(ev('S.eq.armor.cards[0].stars||0'),0);ev('confirmMerge();confirmMerge()');assert.equal(ev('S.eq.armor.cards[0].stars'),1);assert.equal(ev('S.cards.length'),1);assert.equal(ev('selC'),'socket:50');
 assert.match(ev('V.cards()'),/Body.*Test 5/);assert.ok(!ev('V.cards()').includes('data-a="sellcard" data-v="50"'));assert.equal(ev('find(50).id'),50);
 // Socket constraints also apply during automatic transfer.
 ev(`window.blocked=makeGear(60);blocked.cards=[makeCard(61,'Boss C')];blocked.cards[0].bossCard=true;window.target=makeGear(62);target.cards=[makeCard(63,'Boss A'),makeCard(64,'Boss B')];target.cards.forEach(c=>c.bossCard=true);transferEquipmentCards(blocked,target,'armor')`);
 assert.equal(ev('blocked.cards.length'),1,'third boss card remains on old gear');
 ev(`blocked.cards[0].bossCard=false;blocked.cards[0].effects=[{k:'cdm',v:1}];target.cards.forEach(c=>{c.bossCard=false;c.effects=[{k:'cdm',v:1}]});transferEquipmentCards(blocked,target,'armor')`);assert.equal(ev('blocked.cards.length'),1,'third Crit DMG card stays');
 ev(`target.cards=[];blocked.cards[0].fit=['weapon'];transferEquipmentCards(blocked,target,'armor')`);assert.equal(ev('blocked.cards.length'),1,'incompatible card stays');
 ev(`target.slots=0;blocked.cards[0].fit=['armor'];transferEquipmentCards(blocked,target,'armor')`);assert.equal(ev('blocked.cards.length'),1,'zero socket replacement preserves card');
 // A pending confirmation must not mutate a card that no longer belongs to this owner.
 ev(`S.eq.armor.cards[0].stars=0;mergeCard(50);S.eq.armor.cards=[];confirmMerge()`);assert.equal(ev('S.cards.length'),1);
 // Native cards are upgraded in place; equipped copies cannot become merge donors.
 ev(`S.eq.armor.cards=[makeCard(53)];S.cards=[];mergeCard(53)`);assert.equal(ev('S.eq.armor.cards[0].stars||0'),0);
 ev(`S.cards=[newCard(CARD_CATALOG[0]),newCard(CARD_CATALOG[0])];S.cardIndex=emptyCardIndex();ACT.indexcard(S.cards[0].id)`);assert.match(ev('promptText'),/permanently gone/);ev('confirmMerge()');assert.equal(ev('S.cards.length'),1);assert.equal(ev('S.cardIndex.donated'),1);
 ev('ACT.indexall(S.cards[0].n)');assert.match(ev('promptText'),/Permanently consume/);assert.equal(ev('S.cards.length'),1);ev('confirmMerge()');assert.equal(ev('S.cards.length'),0);assert.equal(ev('S.cardIndex.donated'),2);
 console.log('PASS: manual/slot/automatic transfers, limited capacity and duplicate families, ownership conservation, category restrictions, in-place socketed merge, confirmation race/replay guards and Index consumption.');
}finally{g.close()}
