// End-to-end regression suite for 2-table Fountain Plaza Hold'em, Dealer Vane & Dealer Mira NPCs,
// AFK auto-kick, minimized timer + blinking alerts, chat non-overlap, zero-scroll grid UI,
// daily free refill, Zeny packs and Gift Exchange preview.
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');

(async()=>{
 const R=require('../../assets/social-rules.js');
 const P=require('../../assets/social-poker.js');
 const {SocialRoom}=await import('../../workers/social/room.mjs');

 // 1. 7-card evaluator & side-pot rules
 const rf=P.evaluateHand(['As','Ks','Qs','Js','Ts','2d','3c']);
 const sf=P.evaluateHand(['9h','8h','7h','6h','5h','Ad','Kc']);
 const wheelSf=P.evaluateHand(['Ah','2h','3h','4h','5h','Kd','Qc']);
 const quads=P.evaluateHand(['Ac','Ad','Ah','As','2c','Kd','Qh']);
 const boat=P.evaluateHand(['Kc','Kd','Kh','Qs','Qc','Ad','2h']);
 const flush=P.evaluateHand(['Ad','Jd','9d','6d','2d','Ks','Qc']);
 const wheel=P.evaluateHand(['As','2d','3c','4h','5s','Kd','9c']);
 const trips=P.evaluateHand(['8c','8d','8h','As','Kd','3c','2h']);
 const twoPair=P.evaluateHand(['Jc','Jd','9h','9s','Ad','4c','2h']);
 const onePair=P.evaluateHand(['Tc','Td','Ah','Ks','8d','3c','2h']);
 const high=P.evaluateHand(['As','Kd','Jh','9c','7s','4d','2c']);
 assert.equal(rf.name,'Royal Flush');
 assert.equal(sf.name,'Straight Flush');
 assert.equal(wheelSf.name,'Straight Flush');
 assert.equal(wheelSf.tiebreak[0],5,'A-2-3-4-5 straight flush ranks as 5-high');
 assert(rf.score>sf.score&&sf.score>wheelSf.score&&wheelSf.score>quads.score);
 assert(quads.score>boat.score&&boat.score>flush.score&&flush.score>wheel.score);
 assert(wheel.score>trips.score&&trips.score>twoPair.score&&twoPair.score>onePair.score&&onePair.score>high.score);

 const pots=P.computeSidePots([
  {key:0,id:1,amount:100,folded:false},
  {key:1,id:2,amount:300,folded:false},
  {key:2,id:3,amount:300,folded:false},
  {key:'dead',id:4,amount:50,folded:true},
 ]);
 assert.equal(pots.length,2,'dead folded level merges cleanly with eligible pots');
 assert.equal(pots.reduce((s,p)=>s+p.amount,0),750);
 assert.equal(pots.at(-1).amount,400);
 assert.deepEqual(pots.at(-1).eligible.map(x=>x.id),[2,3]);

 // 2. Two West-Promenade 3D tables (-27,-2) & (-39,-2), 12 stools, old (-15,6) cleared
 assert(R.walkable(-15,6),'central courtyard (-15,6) stays open');
 assert.equal(R.POKER.tables.length,2,'2 Hold\'em tables on West Promenade');
 assert.equal(R.POKER.seats.length,12,'12 stools across 2 tables');
 for(const t of R.POKER.tables){
  assert(!R.walkable(t.table.x,t.table.z),`table ${t.id} blocks walking through felt`);
  assert(!R.walkable(t.dealer.x,t.dealer.z),`dealer ${t.id} blocks rail`);
  assert(R.walkable(t.dealer.approach.x,t.dealer.approach.z));
 }
 for(const stool of R.POKER.seats){
  assert(R.walkable(stool.x,stool.z),`poker stool ${stool.id} is walkable`);
  assert(R.path({x:0,z:12},stool).length>0,`poker stool ${stool.id} reachable from spawn`);
 }

 // 3. Multiplayer SocialRoom: 2 tables, walk-to-sit, PvP privacy, side-by-side Table 2, and AFK auto-kick
 let now=10000;
 const room=new SocialRoom({now:()=>now});
 const join=(id,name)=>{
  const events=[];
  const c=room.connect({id,username:name},s=>events.push(JSON.parse(s)),()=>{});
  c.events=events;
  room.receive(c,JSON.stringify({type:'join',look:{cls:'Lord Knight',appearance:{version:1,sex:'m'},speed:10}}));
  return c;
 };
 const alice=join(1,'Alice'),bob=join(2,'Bob'),cara=join(3,'Cara');
 const initEvt=alice.events.find(e=>e.type==='poker');
 assert(initEvt&&Array.isArray(initEvt.tables)&&initEvt.tables.length===2,'join delivers snapshots for both poker tables');

 // Alice sits at Table 1 Seat 0; Cara sits simultaneously at Table 2 Seat 6!
 now+=200;
 room.receive(alice,JSON.stringify({type:'poker_sit',seat:0,buyIn:1000}));
 room.receive(cara,JSON.stringify({type:'poker_sit',seat:6,buyIn:1000}));
 assert.equal(alice.pokerSeat,0);
 assert.equal(cara.pokerSeat,6);
 assert(alice.path.length>0&&cara.path.length>0,'players walk to their respective tables');

 // Arrive & deal on both tables independently
 now+=8000;room.sweep();
 assert(alice.sit&&cara.sit,'both Alice (Table 1) and Cara (Table 2) sit on arrival');
 now+=2000;room.sweep();
 const snapT1=alice.events.filter(e=>e.type==='poker').at(-1).tables[0];
 const snapT2=cara.events.filter(e=>e.type==='poker').at(-1).tables[1];
 assert.equal(snapT1.phase,'preflop','Table 1 deals heads-up vs Dealer Vane');
 assert.equal(snapT2.phase,'preflop','Table 2 deals heads-up vs Dealer Mira');
 assert.equal(snapT1.house.name,'Dealer Vane');
 assert.equal(snapT2.house.name,'Dealer Mira');
 assert.deepEqual(bob.events.filter(e=>e.type==='poker').at(-1).tables[0].seats[0].cards,['??','??'],'spectator Bob never sees Alice hole cards');

 // Bob joins Table 1 Seat 3 -> next hand becomes Alice vs Bob PvP
 now+=200;room.receive(bob,JSON.stringify({type:'poker_sit',seat:3,buyIn:1000}));
 now+=8000;room.sweep();
 now+=1000;room.sweep();
 const curA=alice.events.filter(e=>e.type==='poker').at(-1).tables[0];
 if(curA.me?.isTurn)room.receive(alice,JSON.stringify({type:'poker_act',action:'fold'}));
 now+=3500;room.sweep();
 now+=2000;room.sweep();
 const pvpA=alice.events.filter(e=>e.type==='poker').at(-1).tables[0];
 const pvpB=bob.events.filter(e=>e.type==='poker').at(-1).tables[0];
 assert.equal(pvpA.phase,'preflop');
 assert.equal(pvpA.house,null,'Dealer Vane steps out when 2 real players sit');
 assert.deepEqual(pvpA.seats[3].cards,['??','??']);
 assert.deepEqual(pvpB.seats[0].cards,['??','??']);

 // Play Hand #2 on Table 1 to Showdown
 for(let step=0;step<12;step++){
  const cur=alice.events.filter(e=>e.type==='poker').at(-1).tables[0];
  if(cur.phase==='showdown')break;
  const actor=cur.turnSeat===0?alice:bob;
  const meView=actor.events.filter(e=>e.type==='poker').at(-1).tables[0].me;
  room.receive(actor,JSON.stringify({type:'poker_act',action:meView.canCheck?'check':'call'}));
 }
 assert.equal(alice.events.filter(e=>e.type==='poker').at(-1).tables[0].phase,'showdown');

 // AFK Auto-Kick test on Cara at Table 2: missing 2 consecutive turn timers kicks Cara off her seat!
 // Advance Cara to a fresh preflop turn where it is Cara's turn, then let Cara time out twice!
 for(let guard=0;guard<10&&cara.pokerSeat===6;guard++){
  now+=6000;room.sweep();
  const cSnap=cara.events.filter(e=>e.type==='poker').at(-1).tables[1];
  if(cSnap.me?.isTurn){
   now+=21000;room.sweep(); // Timeout #1 or #2
  }else{
   now+=2000;room.sweep();
  }
 }
 assert.equal(cara.pokerSeat,null,'AFK player is auto-kicked from poker seat after 2 missed turns');
 assert.equal(cara.sit,false,'AFK kicked player stands up from stool');
 assert(cara.events.some(e=>e.type==='poker_kicked'&&e.reason==='afk'),'AFK player receives poker_kicked event');

 // 4. Scene: 2 3D tables, 2 NPC labels, stool raycasting on both tables
 const sdom=new JSDOM('<div id="host"></div><div id="labels"></div>',{runScripts:'outside-only'}),sw=sdom.window,T={...require('three')};
 sw.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){},fillRect(){},clearRect(){},strokeRect(){},fillText(){}});
 const host=sw.document.getElementById('host');host.setPointerCapture=()=>{};host.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:700});Object.defineProperties(host,{clientWidth:{value:1000},clientHeight:{value:700}});
 T.WebGLRenderer=class{constructor(){this.domElement=sw.document.createElement('canvas')}setPixelRatio(){}setSize(){}render(){}dispose(){}};
 T.TextureLoader=class{async loadAsync(){return new T.Texture(sw.document.createElement('canvas'))}};
 const act={delay:100,frames:[[[0,0,20,60,150,140,0,'body']]]},lk={base:{figureHeight:60,metadata:{actions:{}}},hair:{metadata:{actions:{}}},pieces:[]};
 for(const st of ['idle','walk','sit'])for(let d=0;d<8;d++)lk.base.metadata.actions[st+d]=lk.hair.metadata.actions[st+d]=act;
 class Store{release(){}async select(){return lk}}
 let clickedPokerSeat=null,openedTable=null,frameFn;
 Object.assign(sw,{THREE:T,devicePixelRatio:1,requestAnimationFrame:cb=>frameFn=cb,ResizeObserver:class{constructor(fn){this.fn=fn}observe(){this.fn()}},PGWardrobe:{CLASSES:{Novice:0,Whitesmith:4011,Sniper:4012},Store,normalize:a=>a,defaults:()=>({version:1,sex:'m'}),frameIndex:()=>0,animationKey:()=>'0',draw(){}},PGFourthJobs:{CLASSES:{},Store},milestone:()=>null,REFINE_GLOWS:[],drawNativeWeaponGlow(){},drawNativeArmGlow(){}});
 Object.defineProperty(sw.document,'hidden',{value:false});sw.performance.now=()=>1000;
 sw.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(url)),arrayBuffer:async()=>{const b=fs.readFileSync(url);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}});
 sw.eval(fs.readFileSync('assets/social-rules.js','utf8'));sw.eval(fs.readFileSync('assets/social-scene.js','utf8'));
 const scene=await sw.PGSocialScene.create(host,sw.document.getElementById('labels'),{self:()=>1,menu(){},move(){},seat(){},pokerSeat(id){clickedPokerSeat=id},pokerOpen(tid){openedTable=tid}});
 scene.active=true;scene.putPlayer({id:1,name:'Hero',x:-33,z:4,dir:0,sit:false,path:[],look:{cls:'Novice',appearance:{version:1,sex:'m'}}});
 frameFn(1100);
 const npcLabels=sw.document.querySelectorAll('.social-npc-label[data-table]');
 assert.equal(npcLabels.length,2,'both Dealer Vane and Dealer Mira labels render');
 npcLabels[1].querySelector('button').click();assert.equal(openedTable,1,'clicking Dealer Mira opens Table 2');
 const stoolT2=scene.scene.children.find(o=>o.userData.pokerSeat===8);
 assert(stoolT2,'Table 2 stool 8 exists in 3D scene');
 scene.camera.updateMatrixWorld();
 const pt=stoolT2.userData.pokerSeatBounds.getCenter(new T.Vector3()).project(scene.camera);
 const ev={clientX:(pt.x+1)*500,clientY:(1-pt.y)*350,pointerId:1,button:0,preventDefault(){}};
 host.onpointerdown(ev);host.onpointerup(ev);
 assert.equal(clickedPokerSeat,8,'clicking Table 2 stool raycasts seat 8');
 const tblGrp=scene.scene.children.find(o=>o.userData.pokerTable===0);
 const floorRugs=tblGrp.children.filter(c=>c.position.y<0.1);
 assert.equal(floorRugs.length,1,'single-mesh carpet avoids Z-fighting between stacked rug layers');
 assert.equal(floorRugs[0].material.polygonOffset,true,'carpet enables hardware polygonOffset');
 sdom.window.close();

 // 5. CSS & UI: Zero-scrolling grid rules, non-overlap with #socialChat, minimized timer + blinking, refills & gifts
 const css=fs.readFileSync('assets/social.css','utf8');
 assert(!/socialPokerBody\{[^}]*overflow-y:auto/.test(css),'#socialPokerBody never uses vertical scrolling');
 assert(/#socialPokerBody\{[^}]*overflow:hidden/.test(css),'#socialPokerBody enforces overflow:hidden grid layout');

 const udom=new JSDOM('<div id="view"><div id="feedWrap"></div><div id="eclipseDock"></div></div>',{url:'http://localhost/',runScripts:'outside-only'}),uw=udom.window;
 let currentDay='2026-10-30',savedCount=0;
 const intervals=[];
 Object.assign(uw,{
  innerWidth:1280,innerHeight:720,
  setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length},
  CLOUD:{on:false,user:null},
  S:{cls:'Novice',eq:{},zeny:320000,poker:{day:'2026-10-30',chips:20,freeClaimed:0}},
  trialDay:()=>currentDay,
  save:()=>{savedCount++},
  bars:()=>{},
  tabs:[],wardrobeAppearance:()=>({version:1,sex:'m'}),logShown:()=>[],openTab:()=>{},
  PGSocialScene:{create:async()=>({active:false,cameraState:{angle:0,pitch:48,distance:48,panX:0,panZ:0,follow:true},setCamera(){},resetCamera(){},clearPlayers(){},putPlayer(){},removePlayer(){},updatePoker(){},dealerBubble(){}})}
 });
 // Mock realistic viewport & chat rects to verify strict 0px overlap across desktop & mobile
 let vw=1280,vh=720,chatRect={left:12,top:490,right:402,bottom:704,width:390,height:214};
 uw.document.getElementById('view').getBoundingClientRect=()=>({left:0,top:0,right:vw,bottom:vh,width:vw,height:vh});
 uw.document.getElementById('eclipseDock').getBoundingClientRect=()=>({left:380,top:vh-68,right:vw-380,bottom:vh,width:520,height:68});
 uw.eval(fs.readFileSync('assets/social-rules.js','utf8'));
 uw.eval(fs.readFileSync('assets/social-poker.js','utf8'));
 uw.eval(fs.readFileSync('assets/social.js','utf8'));
 const chatEl=uw.document.getElementById('socialChat');
 chatEl.getBoundingClientRect=()=>chatRect;
 Object.defineProperty(chatEl,'offsetWidth',{get:()=>chatRect.width});
 Object.defineProperty(chatEl,'offsetHeight',{get:()=>chatRect.height});

 await uw.PGSocial.enter();

 // Verify non-overlap on desktop (1280x720) & mobile/tablet (768x640)
 uw.PGSocial.pokerOpen(0);
 const modal=uw.document.getElementById('socialPokerModal');
 const checkNoOverlap=label=>{
  uw.PGSocial.syncPokerBounds();
  // jsdom does not lay out CSS. Model the explicit compact chat lane below 1280px;
  // desktop chat keeps its measured rectangle. The area assertion is unchanged.
  const compact=chatEl.classList.contains('poker-compact');
  const rect=compact?{left:8,right:vw-8,top:vh-80-(vh<700?112:148),bottom:vh-80}:chatRect;
  const ml=parseFloat(modal.style.left),mt=parseFloat(modal.style.top),mw=parseFloat(modal.style.width),mh=parseFloat(modal.style.height);
  const mr=ml+mw,mb=mt+mh;
  const overlapX=Math.max(0,Math.min(mr,rect.right)-Math.max(ml,rect.left));
  const overlapY=Math.max(0,Math.min(mb,rect.bottom)-Math.max(mt,rect.top));
  assert.equal(overlapX*overlapY,0,`${label}: #socialPokerModal must never overlap #socialChat`);
 };
 checkNoOverlap('Desktop 1280x720');
 assert(parseFloat(modal.style.width)>736,'the dedicated desktop table lane is larger than the old chat-derived window');
 const fixedBounds=modal.getAttribute('style');
 chatRect={left:12,top:200,right:650,bottom:704,width:638,height:504};
 uw.PGSocial.syncPokerBounds();
 assert.equal(modal.getAttribute('style'),fixedBounds,'resizing chat must not move or resize the poker table');
 chatRect={left:12,top:490,right:402,bottom:704,width:390,height:214};
 vw=768;vh=640;
 checkNoOverlap('Compact 768x640');
 assert(chatEl.classList.contains('poker-compact'),'small screens dock chat below the table instead of shrinking the table beside it');
 uw.PGSocial.minimizePokerModal();
 assert(!chatEl.classList.contains('poker-compact'),'minimizing restores the original chat layout');
 uw.PGSocial.pokerOpen(0);

 // Refills: Daily Free (+1,000) & Zeny packs
 uw.PGSocial.pokerSeatAction(0);
 assert.equal(uw.document.querySelector('#socialPokerNav [data-ptab="bank"]').getAttribute('aria-selected'),'true');
 assert.equal(uw.PGSocial.claimDailyPokerChips(),true);
 assert.equal(uw.S.poker.chips,1020);
 assert.equal(uw.PGSocial.claimDailyPokerChips(),false);
 currentDay='2026-10-31';
 assert.equal(uw.PGSocial.claimDailyPokerChips(),true);
 assert.equal(uw.S.poker.chips,2020);
 assert.equal(uw.PGSocial.buyPokerChipsWithZeny('pack500'),true);
 assert.equal(uw.PGSocial.buyPokerChipsWithZeny('pack2500'),true);
 assert.equal(uw.S.zeny,20000);
 assert.equal(uw.S.poker.chips,5020);
 assert(savedCount>=3);

 // Sit at Table 2 (seat 6 -> instant teleport close in solo after placing player at seat, deal, minimize & check blinking timer!)
 const soloP=uw.PGSocial.app.players.get(0);
 soloP.x=R.POKER.seats[6].x;soloP.z=R.POKER.seats[6].z;
 uw.PGSocial.pokerSeatAction(6);
 const realNow=uw.Date.now;let fakeNow=realNow()+3000;uw.Date.now=()=>fakeNow;Date.now=()=>fakeNow;
 for(const it of intervals)if(it.ms===200)it.fn();
 fakeNow+=1200;
 for(const it of intervals)if(it.ms===200)it.fn();
 uw.PGSocial.minimizePokerModal();
 const mini=uw.document.getElementById('socialPokerMini');
 assert.equal(mini.hidden,false,'minimized pill is visible when minimized');
 assert(mini.classList.contains('is-turn-blink'),'minimized pill blinks on player turn');
 assert.match(mini.textContent,/YOUR TURN · \d+s/,'minimized pill displays live countdown timer');
 assert(uw.document.getElementById('socialPokerBtn').classList.contains('is-turn-blink'),'toolbar button also blinks on player turn while minimized');
 uw.Date.now=realNow;Date.now=realNow;

 // Gift Exchange tab is locked until rewards are finalized
 uw.PGSocial.pokerOpen(0);
 const giftBtn=uw.document.querySelector('#socialPokerNav [data-ptab="gifts"]');
 assert.equal(giftBtn.getAttribute('aria-disabled'),'true','Gift Exchange tab is marked aria-disabled');
 assert(giftBtn.classList.contains('is-locked'),'Gift Exchange tab uses locked styling');
 giftBtn.click();
 assert.equal(uw.document.querySelector('#socialPokerNav [data-ptab="t0"]').getAttribute('aria-selected'),'true','clicking locked Gift Exchange stays on current tab');
 assert.equal(uw.document.querySelectorAll('.poker-gift-card').length,0,'no placeholder gift items render while tab is blocked');
 assert.match(uw.document.getElementById('socialPokerToast').textContent,/Gift Exchange is locked/);
 udom.window.close();

 console.log('PASS social poker: 2 West-Promenade 3D tables, anti-Z-fight carpet, AFK auto-kick, blinking minimized timer, 0px chat overlap, zero-scroll grid UI, daily free refill, Zeny packs & blocked Gift Exchange tab');
})().catch(e=>{console.error(e);process.exitCode=1});
