// Regression coverage for accidental poker exits, reconnect position, fixed table geometry,
// deal animation and persistent World-only chat history.
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const R=require('../../assets/social-rules.js'),P=require('../../assets/social-poker.js');
 const {SocialRoom,cleanWorldHistory}=await import('../../workers/social/room.mjs');
 let now=10000;
 const room=new SocialRoom({now:()=>now});
 const join=(id,name)=>{const events=[];const c=room.connect({id,username:name},s=>events.push(JSON.parse(s)),()=>{});c.events=events;room.receive(c,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'},speed:10}}));return c};
 const send=(c,m)=>room.receive(c,JSON.stringify(m));
 const alice=join(1,'Alice');join(2,'Bob');
 now+=200;send(alice,{type:'poker_sit',seat:0,buyIn:1000});now+=9000;room.sweep();now+=2000;room.sweep();
 assert.equal(alice.pokerSeat,0);assert(alice.sit);
 const before=room.snapshot(alice),stack=room.pokerTables(1)[0].findPlayer(1).stack;
 for(const m of [{type:'move',x:0,z:12},{type:'sit'},{type:'seat',id:0},{type:'switch_room',room:2}]){
  send(alice,m);assert.equal(alice.pokerSeat,0,'unconfirmed '+m.type+' keeps the poker seat');assert.equal(alice.x,before.x);assert.equal(alice.z,before.z);
 }
 assert(alice.events.some(e=>e.type==='poker_leave_required'),'the server explains why an old/queued floor click was refused');
 // A planned refresh preserves exact coordinates and the reserved seat; the browser cannot
 // choose its replacement coordinates by adding a resume object to join.
 const saved={x:alice.x,z:alice.z,dir:alice.dir,seat:alice.pokerSeat,stack};
 room.refresh(alice);assert(!room.clients.has(1));assert(room.resumes.has(1));
 const again=join(1,'Alice');
 send(again,{type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}},resume:{x:70,z:70,pokerSeat:11}});
 const restored=room.snapshot(again);assert.equal(restored.x,saved.x);assert.equal(restored.z,saved.z);assert.equal(restored.dir,saved.dir);assert.equal(restored.pokerSeat,saved.seat);assert(restored.sit);
 assert.equal(room.pokerTables(1)[0].findPlayer(1).stack,saved.stack,'reconnect does not buy in again or reset committed bets');
 const same=room.pokerTables(1)[0].sit(0,{id:1,name:'Alice'},1000,now,true);assert(same.resumed);assert.equal(room.pokerTables(1)[0].findPlayer(1).stack,saved.stack,'same-seat sit is idempotent');
 send(again,{type:'move',x:0,z:12,confirmLeave:true});assert.equal(again.pokerSeat,null,'confirmed floor click folds and walks');assert(again.path.length>0);
 // An explicit exit is not a reconnect. A lost socket that never returns expires its reservation.
 send(again,{type:'poker_sit',seat:0,buyIn:1000,confirmLeave:true});now+=200;room.disconnect(again);now+=16000;room.sweep();
 // v295: the poker seat frees up on the short grace; the plaza spot lasts the idle window.
 assert.equal(room.pokerTables(1)[0].findPlayer(1),null,'an abandoned poker seat is released after the short grace');
 assert(room.resumes.has(1),'the plaza spot outlives the seat reservation');
 now+=300000;room.sweep();assert(!room.resumes.has(1),'the plaza spot expires on the idle window');
 const back=join(1,'Alice');assert.notEqual(back.z,saved.z,'an expired grace starts a fresh visit rather than restoring stale coordinates');
 send(back,{type:'leave'});assert(!room.resumes.has(1));

 // A pot settled during the socket grace replays its actual durable ledger event, not a stack guess.
 const ledgerRoom=new SocialRoom({now:()=>now});const ledgerEvents=[];
 const away=ledgerRoom.connect({id:9,username:'Away'},s=>ledgerEvents.push(JSON.parse(s)),()=>{});
 ledgerRoom.receive(away,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));now+=200;
 ledgerRoom.receive(away,JSON.stringify({type:'poker_sit',seat:0,buyIn:1000}));now+=9000;ledgerRoom.sweep();
 const ledgerTable=ledgerRoom.pokerTables(1)[0],awayStack=ledgerTable.findPlayer(9).stack;
 ledgerRoom.disconnect(away);ledgerTable.findPlayer(9).stack+=30;ledgerTable.onLedger(9,30,'win');await ledgerRoom.ledgerWrites;
 const returned=ledgerRoom.connect({id:9,username:'Away'},s=>ledgerEvents.push(JSON.parse(s)),()=>{});
 await new Promise(r=>setImmediate(r));
 assert(ledgerEvents.some(e=>e.type==='poker_ledger'&&e.reason==='win'&&e.delta===30&&e.id),'a missed settled pot replays its durable event on authenticated reconnect');
 assert.equal(ledgerTable.findPlayer(9).stack,awayStack+30);ledgerRoom.disconnect(returned);

 // Only public World messages are restored, and ids keep increasing after a room restart.
 const historyRoom=new SocialRoom({now:()=>now});const writer=historyRoom.connect({id:5,username:'Writer'},()=>{},()=>{});
 historyRoom.receive(writer,JSON.stringify({type:'chat',channel:'world',body:'remember this'}));now+=3001;
 historyRoom.receive(writer,JSON.stringify({type:'chat',channel:'whisper',to:'Writer',body:'private'}));now+=3001;
 historyRoom.receive(writer,JSON.stringify({type:'chat',channel:'local',body:'room only'}));
 assert.equal(historyRoom.history.length,1);assert.equal(cleanWorldHistory([...historyRoom.history,{channel:'whisper',body:'no'}]).length,1);
 const restarted=new SocialRoom({history:historyRoom.history});const hello=[];const reader=restarted.connect({id:6,username:'Reader'},s=>hello.push(JSON.parse(s)),()=>{});
 assert.equal(hello.find(e=>e.type==='hello').history[0].body,'remember this');
 restarted.receive(reader,JSON.stringify({type:'chat',channel:'world',body:'next'}));assert(restarted.history.at(-1).id>historyRoom.history[0].id);

 function boot(user='Alice',online=false,seed={}){
  const dom=new JSDOM('<div id="view"><div id="feedWrap"></div><div id="eclipseDock"></div></div>',{url:'http://localhost/',runScripts:'outside-only'}),w=dom.window;
  const timers=[];let callbacks;
  Object.assign(w,{CLOUD:{on:online,user:online?user:null},S:{cls:'Novice',eq:{},zeny:100000,poker:{chips:5000,freeClaimed:0}},tabs:[],wardrobeAppearance:()=>({version:1,sex:'m'}),logShown:()=>[],openTab:()=>{},setInterval:(fn,ms)=>{timers.push({fn,ms});if(ms===2000)w.sessionTick=fn;return timers.length},
   PGSocialScene:{create:async(_host,_labels,cb)=>{callbacks=cb;return{active:false,cameraState:{angle:0,pitch:48,distance:48},setCamera(){},resetCamera(){},clearPlayers(){},putPlayer(){},removePlayer(){},updatePoker(){},dealerBubble(){}}}}});
  for(const [key,value] of Object.entries(seed))w.localStorage.setItem(key,value);
  w.eval(fs.readFileSync('assets/social-rules.js','utf8'));w.eval(fs.readFileSync('assets/social-poker.js','utf8'));w.eval(fs.readFileSync('assets/social.js','utf8'));
  return {dom,w,timers,callbacks:()=>callbacks};
 }
 // World survives an empty hello and a real new document. Whisper/Local never enter localStorage.
 {
  const {w}=boot('Alice',true);const app=w.PGSocial.app,ws=app.socket;
  ws.onmessage({data:JSON.stringify({type:'hello',id:1,history:[{type:'message',id:1,channel:'world',from:2,name:'Bob',body:'first',at:1000}]})});
  app.room=1;
  for(const m of [{id:2,channel:'world',from:2,name:'Bob',body:'second',at:2000},{id:3,channel:'whisper',from:2,to:1,name:'Bob',toName:'Alice',body:'secret',at:3000},{id:4,channel:'local',room:1,from:2,name:'Bob',body:'plaza only',at:4000}])ws.onmessage({data:JSON.stringify({type:'message',...m})});
  ws.onmessage({data:JSON.stringify({type:'hello',id:1,history:[]})});
  assert.equal(app.messages.filter(m=>m.channel==='world').length,2,'an empty restarted hello cannot erase retained World lines');
  const stored=w.localStorage.getItem('pg_social_world_v1_alice');assert(stored);assert(!/secret|plaza only/.test(stored));
  const fresh=boot('Alice',true,{pg_social_world_v1_alice:stored});
  fresh.w.PGSocial.app.socket.onmessage({data:JSON.stringify({type:'hello',id:1,history:[]})});
  assert.match(fresh.w.document.getElementById('socialLines').textContent,/first.*second/s);
  fresh.w.CLOUD.user='Mallory';fresh.w.sessionTick();assert(!fresh.w.document.getElementById('socialLines').textContent.includes('first'),'another account cannot read Alice’s cache');
  assert(w.localStorage.getItem('pg_social_world_v1_alice'));
  w.close();fresh.w.close();
 }
 // Safe-default warning, animation once per new card, and chat-independent table bounds.
 {
  const {w,timers,callbacks}=boot();await w.PGSocial.enter();const app=w.PGSocial.app,p=app.players.get(0),seat=R.POKER.seats[0];p.x=seat.x;p.z=seat.z;
  w.PGSocial.pokerSeatAction(0);assert.equal(p.pokerSeat,0);
  const realNow=w.Date.now;let fake=realNow()+2200;w.Date.now=()=>fake;for(const t of timers)if(t.ms===200)t.fn();
  const modal=w.document.getElementById('socialPokerModal'),warning=w.document.getElementById('socialPokerLeaveWarning');
  assert(w.document.querySelectorAll('.pcard.is-dealing').length>0,'a new deal animates its cards');
  const dealCount=w.document.querySelectorAll('.pcard.is-dealing').length;w.eval('PGSocial.pokerOpen(0)');assert.equal(w.document.querySelectorAll('.pcard.is-dealing').length,0,'redrawing the same hand does not replay the deal');assert(dealCount>0);
  callbacks().move(0,12);assert(!warning.hidden);assert.equal(p.pokerSeat,0);assert.equal(w.document.activeElement.id,'pokerLeaveStay');
  w.document.getElementById('pokerLeaveStay').click();assert(warning.hidden);assert.equal(p.pokerSeat,0);
  w.document.getElementById('socialLeave').click();assert(!warning.hidden);warning.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert(warning.hidden);assert(!w.document.getElementById('socialHub').hidden);
  callbacks().move(0,12);w.document.getElementById('pokerLeaveConfirm').click();assert.equal(p.pokerSeat,null);assert(p.path.length>0);assert(!w.document.getElementById('socialHub').hidden,'a confirmed floor click walks without closing the hub');
  const view=w.document.getElementById('view'),chat=w.document.getElementById('socialChat'),dock=w.document.getElementById('eclipseDock');
  view.getBoundingClientRect=()=>({left:0,top:0,width:1440,height:900});dock.getBoundingClientRect=()=>({left:450,top:830,width:540,height:70});
  w.PGSocial.pokerOpen(0);const bounds=modal.getAttribute('style');chat.style.width='600px';chat.style.height='400px';w.PGSocial.syncPokerBounds();assert.equal(modal.getAttribute('style'),bounds);
  assert.match(fs.readFileSync('assets/social.css','utf8'),/@keyframes pokerReveal/);assert.match(fs.readFileSync('assets/social.css','utf8'),/prefers-reduced-motion:reduce/);
  // Seated chat fit + one-shot win/lose result animation.
  const seatView={seat:0,globalSeat:0,id:1,name:'You',isBot:false,stack:1200,pendingAdd:0,arrived:true,inHand:true,folded:false,allIn:false,missedTurns:0,streetBet:0,totalBet:100,cards:['As','Ks'],handHint:'Flush',lastTag:'',isDealer:false,isSB:false,isBB:false,isTurn:false};
  const mock={tableId:0,tableLabel:'Table 1',dealerName:'Dealer Vane',seq:1,handNo:7,phase:'showdown',banner:'You win',vsHouse:false,pot:200,currentBet:0,minRaise:20,community:['2s','3s','4s','5s','9h'],seats:[seatView,null,null,null,null,null],house:null,seatedCount:1,turnSeat:null,turnName:'',turnLeftMs:0,phaseLeftMs:4000,winners:[{seat:0,id:1,name:'You',amount:200,handName:'Flush',best5:[]}],me:{seat:0,globalSeat:0,stack:1200,pendingAdd:0,missedTurns:0,afkMax:2,isTurn:false,toCall:0,minRaiseTo:20,maxTo:1200,canCheck:true,canRaise:true}};
  app.room=1;app.pokerTables=[mock];app.poker=mock;w.PGSocial.pokerOpen(0);
  const result=w.document.getElementById('socialPokerResult');
  assert(!result.hidden);assert(result.classList.contains('is-win'));assert.match(result.textContent,/YOU WIN/);assert.match(result.textContent,/\+200 chips/);
  // v290: sitting must not move anything - the table held 414px and chat keeps its width.
  assert(!chat.classList.contains('poker-chat-fit'),'sitting no longer narrows the chat column');assert.equal(parseFloat(modal.style.left),414,'the table does not shift left when the player sits');
  const resultCard=result.querySelector('.poker-result-card');w.PGSocial.pokerOpen(0);assert.equal(result.querySelector('.poker-result-card'),resultCard,'the same hand result does not replay on redraw');
  mock.handNo=8;mock.winners=[];mock.banner='Dealer wins';w.PGSocial.pokerOpen(0);assert(result.classList.contains('is-lose'));assert.match(result.textContent,/YOU LOSE/);
  mock.handNo=9;mock.phase='flop';seatView.folded=true;w.PGSocial.pokerOpen(0);assert(result.classList.contains('is-lose'));assert.match(result.textContent,/FOLDED/);
  mock.me=null;w.PGSocial.pokerOpen(0);assert(!chat.classList.contains('poker-chat-fit'),'standing changes nothing either');assert.equal(parseFloat(modal.style.left),414,'same geometry seated or standing');
  w.Date.now=realNow;w.close();
 }
 // v286: identical table/hand numbers in different plaza rooms are different results.
 {
  const {w}=boot('Alice',true);const app=w.PGSocial.app,ws=app.socket;
  ws.onmessage({data:JSON.stringify({type:'hello',id:1,history:[]})});
  app.wanted=true;w.document.getElementById('socialHub').hidden=false;
  const seat={seat:0,globalSeat:0,id:1,name:'Alice',stack:1200,cards:['As','Ks'],folded:false,totalBet:100,streetBet:0,missedTurns:0,isTurn:false};
  const snap={tableId:0,tableLabel:'Table 1',dealerName:'Dealer Vane',seq:1,handNo:1,phase:'showdown',banner:'Alice wins',vsHouse:false,pot:200,currentBet:0,minRaise:20,community:[],seats:[seat,null,null,null,null,null],house:null,seatedCount:1,turnSeat:null,turnName:'',turnLeftMs:0,phaseLeftMs:4000,winners:[{seat:0,id:1,name:'Alice',amount:200,handName:'Flush',best5:[]}],me:{seat:0,globalSeat:0,stack:1200,pendingAdd:0,missedTurns:0,afkMax:2,isTurn:false,toCall:0,minRaiseTo:20,maxTo:1200,canCheck:true,canRaise:true}};
  const enterRoom=room=>{ws.onmessage({data:JSON.stringify({type:'room',room,rooms:[{id:1,count:1},{id:2,count:1}],players:[]})});ws.onmessage({data:JSON.stringify({type:'poker',tables:[snap,null],poker:snap})})};
  enterRoom(1);w.PGSocial.pokerOpen(0);
  const result=w.document.getElementById('socialPokerResult'),mini=w.document.getElementById('socialPokerMini');
  assert(!result.hidden);const first=result.querySelector('.poker-result-card');assert(first);
  assert.equal(result.dataset.key,'1:0:1','result identity includes the plaza room');
  enterRoom(2);
  assert(!result.hidden,'table 1 hand 1 animates again in plaza 2');assert.notEqual(result.querySelector('.poker-result-card'),first,'a different room gets a fresh result animation');assert.equal(result.dataset.key,'2:0:1');
  mini.hidden=false;mini.classList.add('is-result-win');mini.dataset.resultUntil=String(Date.now()+3000);
  w.PGSocial.leave();assert(result.hidden);assert.equal(result.innerHTML,'');assert(!mini.classList.contains('is-result-win'));assert(!mini.dataset.resultUntil,'leaving clears both result surfaces');
  w.close();
 }
 // v285: Local chat pops a small transient bubble on the viewed poker table.
 {
  const {w,timers}=boot('Alice',true);const app=w.PGSocial.app,ws=app.socket;
  ws.onmessage({data:JSON.stringify({type:'hello',id:1,history:[]})});
  app.room=1;
  const mkSeat=(seat,id,name)=>({seat,globalSeat:seat,id,name,isBot:false,stack:1000,pendingAdd:0,arrived:true,inHand:false,folded:false,allIn:false,missedTurns:0,streetBet:0,totalBet:0,cards:[],handHint:'',lastTag:'',isDealer:false,isSB:false,isBB:false,isTurn:false});
  const mock={tableId:0,tableLabel:'Table 1',dealerName:'Dealer Vane',seq:1,handNo:1,phase:'idle',banner:'',vsHouse:false,pot:0,currentBet:0,minRaise:20,community:[],seats:[mkSeat(0,2,'Bob'),mkSeat(1,3,'Cara'),null,null,null,null],house:null,seatedCount:2,turnSeat:null,turnName:'',turnLeftMs:0,phaseLeftMs:0,winners:[],me:null};
  app.pokerTables=[mock];app.poker=mock;app.wanted=true;w.document.getElementById('socialHub').hidden=false;
  const realNow=w.Date.now;let fake=realNow();w.Date.now=()=>fake;
  w.PGSocial.pokerOpen(0);
  const body=w.document.getElementById('socialPokerBody');let serial=100;
  const local=(from,name,text,extra={})=>ws.onmessage({data:JSON.stringify({type:'message',id:serial++,channel:'local',room:1,from,name,body:text,at:fake,...extra})});
  local(2,'Bob','gl hf');
  let b0=body.querySelector('.poker-cell.s0 .poker-table-bubble');assert(b0,'a seated player’s Local line pops on their seat');assert.equal(b0.textContent,'gl hf');assert(b0.classList.contains('is-fresh'));
  ws.onmessage({data:JSON.stringify({type:'message',id:serial++,channel:'world',room:0,from:2,name:'Bob',body:'world',at:fake})});
  ws.onmessage({data:JSON.stringify({type:'message',id:serial++,channel:'whisper',room:0,from:2,to:1,name:'Bob',toName:'Alice',body:'psst',at:fake})});
  assert.equal(body.querySelectorAll('.poker-table-bubble').length,1,'World/Whisper never pop the poker table');
  local(9,'Walkby','hello plaza');assert.equal(body.querySelectorAll('.poker-table-bubble').length,1,'a player outside the viewed table does not clutter it');
  local(3,'Cara','',{emotion:R.EMOTIONS[0]});
  const b1=body.querySelector('.poker-cell.s1 .poker-table-bubble');assert(b1&&b1.querySelector('img'),'Local emotions pop as an image');
  local(2,'Bob','<img src=x onerror=alert(1)>');
  b0=body.querySelector('.poker-cell.s0 .poker-table-bubble');assert(!b0.querySelector('img'));assert(b0.textContent.includes('<img'),'table bubbles render text, not HTML');
  fake+=400;w.PGSocial.pokerOpen(0);assert.equal(body.querySelectorAll('.poker-table-bubble').length,2,'redraw keeps one bubble per seat');
  b0=body.querySelector('.poker-cell.s0 .poker-table-bubble');assert(!b0.classList.contains('is-fresh'),'redraw does not replay the pop animation');
  app.muted.add(3);for(const t of timers)if(t.ms===200)t.fn();assert(!body.querySelector('.poker-cell.s1 .poker-table-bubble'),'muting clears that player’s table bubble');
  fake+=6100;for(const t of timers)if(t.ms===200)t.fn();assert.equal(body.querySelectorAll('.poker-table-bubble').length,0,'table bubbles expire');
  local(2,'Bob','still here');assert(body.querySelector('.poker-table-bubble'));w.PGSocial.minimizePokerModal();for(const t of timers)if(t.ms===200)t.fn();assert.equal(body.querySelectorAll('.poker-table-bubble').length,0,'minimizing the table hides its bubbles');
  w.Date.now=realNow;w.close();
 }
 console.log('PASS social table/chat fixes: server-backed leave guard, exact reconnect without respawn/rebuy, grace expiry, World-only durable merge, account isolation, safe warning, deal-once animation, fixed table geometry, seated compact chat, one-shot win/lose results and Local table chat bubbles');
})().catch(e=>{console.error(e);process.exitCode=1});
