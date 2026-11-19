// Ownership invariants across replacement, socketed merges and irreversible Index use.
(async()=>{
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
 // Rift Sovereign drops enter the same save-backed card collection, but remain bound and non-equippable.
 ev(`S=fresh();S.cards=[];gmApplyGift({amount:1,item:{card:1,cardVersion:1,raidCard:'rift-sovereign',cardKey:'raid:rift-sovereign',family:'Rift Sovereign Card',n:'Rift Sovereign Card',stat:'raidCard',v:1,g:3,effects:[{k:'raidCard',v:1}],fit:[],bossCard:true}});window.raidCard=S.cards[0];selC=cardGroup(raidCard);`);
 assert.equal(ev('S.cards.length'),1);assert.equal(ev('raidCard.n'),'Rift Sovereign Card');assert.match(ev('itemDetail(raidCard)'),/Bound collection copy/);
 assert.equal(ev('cardFits(raidCard,S.eq.weapon)'),false);assert.equal(ev('cardMergeNeed(raidCard)'),-1);assert.equal(ev('cardMasteryLegendaryCards().length'),0);
 ev('ACT.sellcard(raidCard.id);mergeCard(raidCard.id);donateCardToMastery(raidCard.id)');assert.equal(ev('S.cards.length'),1,'bound raid copy cannot be sold, merged or donated');
 assert.match(ev('V.cards()'),/Rift Sovereign Card/,'Map → Bag → Cards can render the collection card');
 ev(`raidCard.fit=['weapon'];raidCard.effects=[{k:'atk',v:999}];repairProgression(S,0)`);assert.deepEqual(JSON.parse(ev('JSON.stringify(raidCard.fit)')),[],'save repair restores the special-card compatibility rule');assert.equal(ev('raidCard.effects[0].k'),'raidCard','save repair fixes its account-wide display effect');
 ev(`S.cards=S.cards.filter(c=>c.id!==raidCard.id);S.eq={weapon:makeGear(67,'weapon',1)};S.eq.weapon.cards=[raidCard];repairProgression(S,PROGRESSION_VERSION)`);
 assert.equal(ev('S.eq.weapon.cards.length'),0,'save repair ejects a forged raid card from an equipment socket');assert.equal(ev('S.cards.some(c=>c.id===raidCard.id)'),true,'the repaired bound copy returns to the ordinary card collection');assert.equal(ev('cardWorkspaceCanInsert(raidCard,"weapon",S.eq.weapon)'),false,'Equipment → Cards cannot insert the bound collection card');
 // The receipt is in the saved blob before the grant API is asked to claim it; an at-least-once
 // delivery retry recognizes that receipt and never creates a second collection copy.
 ev(`S=fresh();S.cards=[];S.gmReceipts=[];window.__receiptSnapshots=[];window.__claims=[];save=()=>window.__receiptSnapshots.push(S.gmReceipts.slice());cloudPush=async()=>{window.__receiptSnapshots.push(S.gmReceipts.slice());return 'ok'};cloudFetch=async(path,opt)=>{window.__claims.push(JSON.parse(opt.body).ids);return {ok:true}};window.__raidGrant={id:99001,kind:'gift',from:'Rift Raid',payload:{amount:1,item:{card:1,cardVersion:1,raidCard:'rift-sovereign',cardKey:'raid:rift-sovereign',family:'Rift Sovereign Card',n:'Rift Sovereign Card',stat:'raidCard',v:1,g:3,effects:[{k:'raidCard',v:1}],fit:[],bossCard:true}}};`);
 await ev('cloudApplyGrants([window.__raidGrant])');await ev('cloudApplyGrants([window.__raidGrant])');
 assert.equal(ev('S.cards.length'),1,'a lost claim response and grant redelivery do not duplicate the card');assert.equal(ev('S.gmReceipts.filter(id=>id===99001).length'),1,'the client receipt is unique');assert.deepEqual(JSON.parse(ev('JSON.stringify(window.__claims)')),[[99001],[99001]],'claim retries include the already-saved receipt');assert.ok(ev('window.__receiptSnapshots').every(ids=>ids.includes(99001)),'each claim attempt follows a save containing the receipt');
 console.log('PASS: equipment transfers/ownership, card sockets/merge/mastery, durable Rift card collection delivery, save receipts and bound-copy safeguards.');
}finally{g.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
