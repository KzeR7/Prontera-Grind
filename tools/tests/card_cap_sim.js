// v411 card storage cap: the collection is bounded, nothing is ever silently deleted behind the
// player's back, and a bulk sale exists so a full collection is escapable.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createGame}=require('./helpers/game');const g=createGame(),ev=g.ev;
const src=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
try{
  // --- the cap exists, and matches the bag ceiling --------------------------------------------
  const CAP=ev('CARDMAX');
  assert.equal(CAP,1000,'CARDMAX is 1000');
  assert.equal(CAP,ev('BAGMAX'),'the two storage ceilings stay consistent');

  // --- addCard: under the cap stores, at the cap refuses, never grows ------------------------
  ev(`window.mkCard=i=>({id:i,card:1,cardKey:'f'+i,n:'C'+i,stat:'str',v:10,g:0,effects:[{k:'str',v:1}],fit:['armor']});S.cards=[]`);
  assert.equal(ev('addCard(mkCard(1),{quiet:true})'),true,'a card under the cap is stored');
  assert.equal(ev('S.cards.length'),1);
  ev(`S.cards=Array.from({length:CARDMAX-1},(_,i)=>mkCard(i))`);
  assert.equal(ev('cardStorageFull()'),false,'one short of the cap is not full');
  assert.equal(ev('addCard(mkCard(999999),{quiet:true})'),true,'the last free slot accepts');
  assert.equal(ev('S.cards.length'),CAP,'exactly CARDMAX after the last accepted card');
  assert.equal(ev('cardStorageFull()'),true,'now full');
  assert.equal(ev('addCard(mkCard(1000000),{quiet:true})'),false,'one past the cap is refused');
  assert.equal(ev('S.cards.length'),CAP,'a refused card never grows the list');
  assert.equal(ev('S.cards.some(c=>c.id===1000000)'),false,'the refused card is not stored');

  // --- a refused drop is reported, not silently swallowed -----------------------------------
  ev(`window.logs=[];window.log=(m)=>{logs.push(m)};S.cards=Array.from({length:CARDMAX},(_,i)=>mkCard(i))`);
  ev(`addCard(mkCard(2000000),{quiet:false,label:'Poring Card'})`);
  assert.equal(ev('S.cards.length'),CAP,'a loud refusal still stores nothing');
  assert.ok(ev('logs.some(m=>/collection full/i.test(m))'),'the refusal is reported to the player');
  assert.ok(ev('logs.some(m=>/Poring Card/.test(m))'),'the message names the card that was lost');
  ev('logs=[]');ev(`addCard(mkCard(2000001),{quiet:true})`);
  assert.equal(ev('logs.length'),0,'a quiet refusal (farm loop) does not spam the log');

  // --- every card-grant path goes through addCard -------------------------------------------
  for(const [label,re] of [
    ['field pickup',/if\(it\.card\)\{if\(!addCard\(it,/],
    ['offline mob drop',/if\(addCard\(newCard\(mob\.card\),\{quiet:true\}\)\)/],
    ['Shard Store',/if\(!addCard\(card,\{label:'Shard Store/],
  ]) assert.ok(re.test(src),`the ${label} path is capped`);
  assert.ok(!/S\.cards\.push\(newCard\(/.test(src),'no drop path pushes a card straight into the list');

  // --- legacy over-cap collection: trimmed to the cap, overflow PAID, never discarded -------
  // Drive the REAL loader: write an over-cap save, reload, inspect what came back.
  const N=CAP+25, V=4;
  ev(`S.cards=Array.from({length:${N}},(_,i)=>({...mkCard(i),v:${V}}));S.zeny=0;
      S.cardOverflowPaid=0;S.cardOverflowCount=0;lsPut(saveKey(),JSON.stringify(S));S=load()`);
  assert.equal(ev('S.cards.length'),CAP,'an over-cap collection is trimmed to the cap on load');
  assert.equal(ev('S.cards[0].id'),0,'the OLDEST cards are the ones kept');
  assert.equal(ev('S.cardOverflowCount'),25,'every overflow card is counted');
  assert.equal(ev('S.cardOverflowPaid'),25*V*150,'overflow is paid at the Sell price, not discarded');
  assert.equal(ev('S.zeny'),25*V*150,'the payout lands in the pouch');

  // Loading the same (now trimmed) save again must not pay out a second time.
  ev(`lsPut(saveKey(),JSON.stringify(S));S=load()`);
  assert.equal(ev('S.zeny'),25*V*150,'the payout is not repeated on the next load');
  assert.equal(ev('S.cardOverflowCount'),25,'the count does not drift upwards');

  // --- the payout is SHOWN to the player, and dismissed explicitly --------------------------
  ev(`window.ui=()=>{};window.save=()=>{};window.log=()=>{}`);
  assert.ok(ev('cardWorkspacePanel()').includes('Collection trimmed to'),'a trimmed collection is announced in the card panel');
  assert.ok(ev('cardWorkspacePanel()').includes('Zeny'),'the notice names the payout');
  ev('ACT.cardoverflowack()');
  assert.equal(ev('S.cardOverflowCount'),0,'acknowledging clears the counter');
  assert.equal(ev('S.cardOverflowPaid'),0,'and the paid total');
  assert.ok(!ev('cardWorkspacePanel()').includes('Collection trimmed to'),'the notice is gone once acknowledged');
  ev(`lsPut(saveKey(),JSON.stringify(S));S=load()`);
  assert.ok(!ev('cardWorkspacePanel()').includes('Collection trimmed to'),'and it does not come back on reload');

  // --- bulk sale: only loose, unmerged cards; starred and legacy are kept -------------------
  ev(`S.cards=[
    {...mkCard(1),v:2},
    {...mkCard(2),v:3,stars:1},
    {...mkCard(3),v:5,legacy:true},
    {...mkCard(4),v:1}
  ];S.zeny=0;window.confirm=()=>true;window.log=()=>{};window.ui=()=>{};window.save=()=>{}`);
  ev('ACT.sellallcards()');
  assert.equal(ev('S.cards.length'),2,'merged and legacy cards survive the bulk sale');
  assert.equal(ev('S.cards.map(c=>c.id).sort().join()'),'2,3','exactly the plain loose cards are gone');
  assert.equal(ev('S.zeny'),(2+1)*150,'the payout is v*150 per sold card');

  // a second press with nothing left to sell is a no-op, not a payout
  const z=ev('S.zeny');ev('ACT.sellallcards()');
  assert.equal(ev('S.zeny'),z,'no loose cards means no payout');

  // declining the confirmation changes nothing
  ev(`S.cards=[{...mkCard(9),v:4}];S.zeny=0;window.confirm=()=>false`);ev('ACT.sellallcards()');
  assert.equal(ev('S.cards.length'),1,'a declined bulk sale sells nothing');
  assert.equal(ev('S.zeny'),0,'and pays nothing');

  console.log('PASS: CARDMAX bounds the collection, refused drops store nothing and say so, an over-cap legacy collection is trimmed but paid, and the bulk sale spares starred/legacy cards.');
}finally{g.close()}
