// Durable poker ledger regression: missed payouts survive grace expiry and DO restart,
// replay is idempotent in the saved wallet, and ACKs are account-scoped.
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const R=require('../../assets/social-rules.js');
 const {SocialRoom,cleanPokerLedger,cleanPokerLedgerQueues}=await import('../../workers/social/room.mjs');
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 let now=10000;
 const durable=new Map();
 const makeRoom=()=>new SocialRoom({now:()=>now,ledgers:[...durable.entries()],onPokerLedger:(id,events)=>{durable.set(id,structuredClone(events))}});
 const look={type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}};
 function connect(room,id,name='Ledger'+id){const events=[];const c=room.connect({id,username:name},raw=>events.push(JSON.parse(raw)),()=>{});c.events=events;return c}
 const send=(c,m)=>c.events && c._room.receive(c,JSON.stringify(m));

 // Payout during disconnect, reconnect BEFORE the 15-second reservation expires.
 let room=makeRoom();let c=connect(room,9);c._room=room;send(c,look);now+=200;
 send(c,{type:'poker_sit',seat:0,buyIn:1000});now+=9000;room.sweep();
 let table=room.pokerTables(1)[0];assert(table.findPlayer(9));
 room.disconnect(c);table.findPlayer(9).stack+=30;table.onLedger(9,30,'win');await room.ledgerWrites;
 const missed=(durable.get(9)||[]).find(e=>e.reason==='win'&&e.delta===30);assert(missed&&missed.id,'the payout is durable before any reconnect');
 c=connect(room,9);c._room=room;await settle();
 const beforeReplay=c.events.filter(e=>e.type==='poker_ledger');assert(beforeReplay.some(e=>e.id===missed.id),'reconnect before expiry replays the actual payout');assert.equal(c.pokerSeat,0,'the live reservation is still restored');
 // No ACK: the same event must replay again with the same stable id.
 room.disconnect(c);c=connect(room,9);c._room=room;await settle();
 assert(c.events.some(e=>e.type==='poker_ledger'&&e.id===missed.id),'unacknowledged payout replays again');

 // Payout during disconnect, reconnect AFTER expiry. The seat is gone; the outbox is not.
 now+=200;room.disconnect(c);now+=16000;room.sweep();assert(!room.resumes.has(9));assert(!table.findPlayer(9));
 c=connect(room,9);c._room=room;await settle();assert.equal(c.pokerSeat,null);
 assert(c.events.some(e=>e.type==='poker_ledger'&&e.id===missed.id),'expiry cannot discard the missed payout');

 // A new SocialRoom backed by the same durable storage is a Durable Object restart.
 room=makeRoom();c=connect(room,9);c._room=room;await settle();
 assert(c.events.some(e=>e.type==='poker_ledger'&&e.id===missed.id),'DO restart replays the same stable event id');
 const other=connect(room,10);other._room=room;await settle();assert(!other.events.some(e=>e.type==='poker_ledger'),'another account never receives the payout');
 send(other,{type:'poker_ledger_ack',ids:[missed.id]});await room.ledgerWrites;assert((durable.get(9)||[]).some(e=>e.id===missed.id),'an ACK cannot delete another account’s event');
 send(c,{type:'poker_ledger_ack',ids:[missed.id]});await room.ledgerWrites;
 room=makeRoom();c=connect(room,9);c._room=room;await settle();assert(!c.events.some(e=>e.type==='poker_ledger'&&e.id===missed.id),'a saved ACK removes the event from durable replay');

 // Distinct movements get distinct ids; replay batches are bounded and continue after ACK.
 room=makeRoom();c=connect(room,20);c._room=room;send(c,look);now+=200;send(c,{type:'poker_sit',seat:0,buyIn:1000});now+=9000;room.sweep();
 table=room.pokerTables(1)[0];room.disconnect(c);
 for(let i=0;i<125;i++)table.onLedger(20,1,'win');
 await room.ledgerWrites;const queue=durable.get(20);assert.equal(queue.length,125);assert.equal(new Set(queue.map(e=>e.id)).size,125);
 c=connect(room,20);c._room=room;await settle();let batch=c.events.filter(e=>e.type==='poker_ledger');assert.equal(batch.length,100);
 for(let i=0;i<batch.length;i+=50)send(c,{type:'poker_ledger_ack',ids:batch.slice(i,i+50).map(e=>e.id)});
 await room.ledgerWrites;await settle();
 const rest=c.events.filter(e=>e.type==='poker_ledger').slice(100);assert.equal(rest.length,25);
 assert.equal(cleanPokerLedger({type:'poker_ledger',id:'bad id',delta:1,room:1,tableId:0,handNo:1,at:1,reason:'win'}),null);
 assert.equal(cleanPokerLedgerQueues([[1,[missed,missed]]])[0][1].length,1,'stored duplicate ids are collapsed on load');

 // Browser wallet: apply once, save the id with the chips, ACK, and survive reload/replay.
 function boot(user='Alice',wallet={day:'2026-11-02',chips:1000,freeClaimed:0,ledgerApplied:[]}){
  const dom=new JSDOM('<div id="view"><div id="feedWrap"></div><div id="eclipseDock"></div></div>',{url:'http://localhost/',runScripts:'outside-only'}),w=dom.window;
  const sockets=[];let day='2026-11-02';const saves=[];
  w.WebSocket=class{constructor(){this.readyState=1;this.sent=[];sockets.push(this)}close(){this.readyState=3}send(raw){this.sent.push(JSON.parse(raw))}};
  Object.assign(w,{CLOUD:{on:true,user},S:{cls:'Novice',eq:{},zeny:0,poker:structuredClone(wallet)},trialDay:()=>day,tabs:[],wardrobeAppearance:()=>({version:1,sex:'m'}),logShown:()=>[],openTab:()=>{},save:()=>{saves.push(structuredClone(w.S.poker));w.localStorage.setItem('wallet_'+user,JSON.stringify(w.S.poker))},bars:()=>{},setInterval:()=>0,
   PGSocialScene:{create:async()=>({active:false,cameraState:{angle:0,pitch:0,distance:40},setCamera(){},resetCamera(){},clearPlayers(){},putPlayer(){},removePlayer(){},updatePoker(){},dealerBubble(){}})}});
  w.eval(fs.readFileSync('assets/social-rules.js','utf8'));w.eval(fs.readFileSync('assets/social-poker.js','utf8'));w.eval(fs.readFileSync('assets/social.js','utf8'));
  const ws=sockets.at(-1);ws.onmessage({data:JSON.stringify({type:'hello',id:1,history:[]})});
  return {w,ws,saves,setDay:value=>{day=value}};
 }
 const event={type:'poker_ledger',id:'poker:browser-replay',at:Date.now(),room:1,tableId:0,handNo:1,delta:30,reason:'win'};
 let browser=boot();browser.ws.onmessage({data:JSON.stringify(event)});
 assert.equal(browser.w.S.poker.chips,1030);assert.deepEqual(Array.from(browser.w.S.poker.ledgerApplied),[event.id]);
 assert(browser.saves.some(wallet=>wallet.chips===1030&&wallet.ledgerApplied.includes(event.id)),'the wallet save contains balance and applied id before ACK');
 assert(browser.ws.sent.some(m=>m.type==='poker_ledger_ack'&&m.ids.includes(event.id)));
 browser.ws.onmessage({data:JSON.stringify(event)});assert.equal(browser.w.S.poker.chips,1030,'replaying the same event cannot credit twice');
 const savedWallet=JSON.parse(browser.w.localStorage.getItem('wallet_Alice'));browser.w.close();
 browser=boot('Alice',savedWallet);browser.setDay('2026-11-03');browser.w.PGSocial.claimDailyPokerChips();
 assert(browser.w.S.poker.ledgerApplied.includes(event.id),'daily reset does not forget applied ledger ids');
 browser.ws.onmessage({data:JSON.stringify(event)});assert.equal(browser.w.S.poker.chips,savedWallet.chips+browser.w.PGSocialPoker.DAILY_FREE_CHIPS,'a new day/reload still rejects the old payout');
 const bob=boot('Bob');bob.ws.onmessage({data:JSON.stringify(event)});assert.equal(bob.w.S.poker.chips,1030,'ids are scoped to the wallet/account, not global');browser.w.close();bob.w.close();

 // The real page loader preserves the ids (and repairs legacy wallets) through the normal save path.
 const {createGame}=require('./helpers/game');const game=createGame();
 try{
  game.ev(`currentUser='ledger-test';lsPut(saveKey(),JSON.stringify({owner:'ledger-test',lv:5,poker:{day:'2000-01-01',chips:1030,freeClaimed:1,ledgerApplied:['poker:saved','poker:saved',null,'bad id']}}));S=load();`);
  assert.deepEqual(JSON.parse(game.ev('JSON.stringify(S.poker.ledgerApplied)')),['poker:saved']);
  assert.equal(game.ev('S.poker.chips'),1030);assert.equal(game.ev('S.poker.freeClaimed'),0,'daily claim resets but the ledger receipt does not');
  game.ev(`lsPut(saveKey(),JSON.stringify({owner:'ledger-test',lv:5,poker:{day:'2000-01-01',chips:20,freeClaimed:0}}));S=load();`);
  assert.deepEqual(JSON.parse(game.ev('JSON.stringify(S.poker.ledgerApplied)')),[],'legacy wallets migrate to an empty receipt list');
 }finally{game.close()}
 console.log('PASS durable poker ledger: payout before/after grace expiry, DO restart, stable ids, account-scoped ACKs, bounded replay, saved wallet dedupe, daily reset and real save-loader migration');
})().catch(error=>{console.error(error);process.exitCode=1});
