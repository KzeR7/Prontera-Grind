// v324 World-chat announcer: the DO schedule fires for a live room and resets for an empty one,
// pools weight-pick with per-player spotlight/welcome cooldowns, milestone brags and the heavy
// mythical/secret fishing relay are validated server-side, big Hold'em pots announce from the
// authoritative ledger, and announcements never enter the durable World history.
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const A=require('../../assets/social-announcements.js');
 const {SocialRoom,cleanWorldHistory}=await import('../../workers/social/room.mjs');

 // ---- shared config sanity ---------------------------------------------------------------
 assert(A.PERSONA&&A.PERSONA.length,'the announcer has a persona name');
 assert(A.MIN_GAP>0&&A.MAX_GAP>A.MIN_GAP,'the cadence window is sane');
 assert(A.TIPS.length>=10&&A.WELCOME.length>=1&&A.SPOTLIGHT.length>=2,'tip/welcome/spotlight pools are populated');
 assert(A.COMMUNITY_ONLINE.length&&A.COMMUNITY_PLAZA.length,'both community pools are populated');
 assert.deepEqual(A.LEVELS,[99,150],'level milestones are 99 and 150');
 assert.deepEqual(A.REFINES,[10,15],'refine milestones are 10 and 15');
 assert.equal(A.FISH_WORLD_MIN_KG,800,'a World catch weighs at least 800 kg');
 assert.equal(A.POKER_WIN_MIN,5000,'a World pot wins at least 5000 chips');
 assert.equal(A.fill('Hi {name}, {unknown}',{name:'Pix'}),'Hi Pix, {unknown}','known words fill and unknown words survive');
 assert.equal(A.fmt(1234567.8),'1,234,568','numbers format with thousands separators');

 let now=1000000;
 const realRandom=Math.random;
 const makeRoom=()=>new SocialRoom({now:()=>now});
 const join={type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'},lv:99,title:'Rookie',fishTitle:''}};
 function connect(room,id,name='Ann'+id){
  const events=[];
  const c=room.connect({id,username:name},raw=>events.push(JSON.parse(raw)),()=>{});
  c.events=events;c._room=room;
  c.expires=Infinity;c.reauthAt=Infinity;   // the scheduler tests run in simulated minutes; the
  return c;                                 // idle reaper would otherwise retire them mid-test
 }
 const send=(c,m)=>{
  const out=c._room.receive(c,JSON.stringify(m));
  c.expires=Infinity;c.reauthAt=Infinity;   // receive() re-arms the idle window on every message
  return out;
 };
 const announces=(c,kind)=>c.events.filter(e=>e.type==='announce'&&(!kind||e.kind===kind));
 const sweepUntil=(room,c,pred,limit=60)=>{
  for(let i=0;i<limit&&!pred();i++){now+=30000;room.sweep()}
  return pred();
 };

 // ---- schedule: arms, fires inside the window, quiet before it ---------------------------
 let room=makeRoom();let a=connect(room,1);let b=connect(room,2);
 room.sweep();
 assert(!announces(a).length,'nothing fires before the gap');
 now+=A.MIN_GAP-30000;room.sweep();
 assert(!announces(a).length,'nothing fires before MIN_GAP');
 assert(sweepUntil(room,a,()=>announces(a).length),'the first scheduled announce fires by MAX_GAP');
 const first=announces(a)[0];
 assert(['tip','community','spotlight','welcome'].includes(first.kind),'scheduled kinds are the enabled pools');
 assert(first.body&&first.body.length,'scheduled lines carry text');
 assert.deepStrictEqual(announces(a).map(e=>e.id),announces(b).map(e=>e.id),'every client sees the same announcement event');
 assert(room.history.every(m=>m.type==='message')&&room.history.length===0,'announcements are delivery-only: the durable history stays message-only and empty');
 assert.equal(cleanWorldHistory([first]).length,0,'cleanWorldHistory drops announcements');

 // One fired, the next is armed: an immediate sweep must not double-fire.
 const count=announces(a).length;
 room.sweep();
 assert.equal(announces(a).length,count,'the next announce waits for the next window');

 // ---- welcomes ride their own short clock ------------------------------------------------
 room=makeRoom();const vet=connect(room,21,'Vet');send(vet,join);
 room.sweep();
 now+=60000;room.sweep();
 assert(announces(vet,'welcome').length===0,'nobody is greeted for an audience of one');
 const newcomer=connect(room,22,'Newbie');send(newcomer,join);
 assert(sweepUntil(room,newcomer,()=>announces(newcomer,'welcome').length===1,10),'a fresh arrival is greeted on the short clock, not the world cadence');
 assert(announces(newcomer,'welcome')[0].body.includes('Newbie'),'the greeting names the newcomer');
 room.disconnect(newcomer);
 const again=connect(room,22,'Newbie');send(again,join);
 now+=180000;room.sweep();
 assert(announces(again,'welcome').length===0,'a reload is never greeted twice in one session');

 // ---- weights: pools pick deterministically under a pinned random ------------------------
 // Weighted order is tip[0,.4) community[.4,.6) spotlight[.6,.85). Spotlight needs a `look`, so
 // both clients join Plaza 1 first; welcomes are pre-burned so the walk stays pinned.
 Math.random=realRandom;
 room=makeRoom();a=connect(room,3);b=connect(room,4);
 send(a,join);send(b,join);
 assert(sweepUntil(room,a,()=>announces(a,'welcome').length===2,12),'both fresh arrivals are greeted once each');
 const kinds=[];
 const step=r=>{
  Math.random=()=>r;
  const before=announces(a).length;
  sweepUntil(room,a,()=>announces(a).length>before);
  assert(announces(a).length>before,'the pinned sweep fired a line');
  kinds.push(announces(a).at(-1).kind);
 };
 step(0.5);
 step(0.9);
 step(0.9);
 step(0.8);
 Math.random=realRandom;
 assert.deepEqual(kinds,['community','spotlight','spotlight','community'],'pinned random walks community, two spotlights, then community');
 const plazaLine=announces(a,'community')[0].body;
 assert(plazaLine.includes('Plaza 1')&&plazaLine.includes('2 adventurers'),'the community line names the busiest plaza and its headcount');
 const spot1=announces(a,'spotlight')[0],spotMid=announces(a,'spotlight')[1];
 assert(spot1.body.includes('Ann3')||spot1.body.includes('Ann4'),'the spotlight names a connected player');
 {
  const first=spot1.body.includes('Ann3')?'Ann3':'Ann4',second=spotMid.body.includes('Ann3')?'Ann3':'Ann4';
  assert.notEqual(first,second,'back-to-back spotlights never repeat the same adventurer');
 }

 // The spotlight cooldown: both players just took their turn, so the next spotlight must wait out
 // the cooldown window before the pool opens again.
 const spotCount=announces(a,'spotlight').length;
 now+=A.SPOT_COOLDOWN;
 Math.random=()=>0.8; // pools are tip+community+spotlight: .8*85=68 -> spotlight
 assert(sweepUntil(room,a,()=>announces(a,'spotlight').length>spotCount),'the spotlight pool keeps rotating after the cooldown');
 Math.random=realRandom;

 // ---- community falls back to the online count when nobody is in a plaza -----------------
 send(a,{type:'leave'});send(b,{type:'leave'});
 Math.random=()=>0.5; // tip[0,40)+community[40,60)+spotlight[60,85): .5 lands in community either way
 const cCount=announces(a,'community').length;
 assert(sweepUntil(room,a,()=>announces(a,'community').length>cCount),'community fires with nobody in a plaza');
 assert(announces(a,'community').at(-1).body.includes('2 heroes'),'the online fallback carries the live online count');
 Math.random=realRandom;

 // ---- solo room: audience-gated pools go quiet, tips still flow --------------------------
 room=makeRoom();a=connect(room,7);
 room.sweep();
 now+=60000;room.sweep();
 now+=A.MAX_GAP+1;room.sweep();
 assert(announces(a,'tip').length===1,'a lone player still gets tips');
 assert(!announces(a,'spotlight').length&&!announces(a,'community').length&&!announces(a,'welcome').length,'audience-gated pools skip a lone player');

 // Empty room: the clock resets, and the next arrival re-arms instead of bursting.
 room.disconnect(a);now+=60000;room.sweep();
 a=connect(room,8);now+=A.MIN_GAP-30000;room.sweep();
 assert(!announces(a).length,'a fresh room re-arms the clock instead of catching up');

 // ---- milestone brags --------------------------------------------------------------------
 room=makeRoom();a=connect(room,11);b=connect(room,12);
 const brag=(m)=>send(a,m);
 const milestones=kind=>a.events.filter(e=>e.type==='announce'&&e.kind==='milestone'&&(!kind||e.sub===kind));
 brag({type:'brag',kind:'level',lv:99});
 assert(milestones('level').length===1&&milestones('level')[0].body.includes('Ann11')&&milestones('level')[0].body.includes('99'),'a base-99 brag announces');
 assert(b.events.some(e=>e.type==='announce'&&e.kind==='milestone'),'the whole world sees the milestone');
 brag({type:'brag',kind:'level',lv:150});
 assert(milestones('level').length===1,'brags are rate-limited per connection');
 now+=10000;
 brag({type:'brag',kind:'level',lv:150});
 assert(milestones('level').length===2&&milestones('level')[1].body.includes('150'),'base-150 announces after the cooldown');
 now+=10000;
 brag({type:'brag',kind:'level',lv:98});
 brag({type:'brag',kind:'level',lv:151});
 brag({type:'brag',kind:'zeny',amount:1e9});
 brag({type:'brag',kind:'refine',r:9});
 assert(milestones().length===2,'off-list values and kinds are dropped');
 now+=10000;
 brag({type:'brag',kind:'refine',r:10});
 now+=10000;
 brag({type:'brag',kind:'refine',r:15});
 now+=10000;
 brag({type:'brag',kind:'echo',dps:1234567.8});
 assert(milestones('refine').length===2&&milestones('refine').some(e=>e.body.includes('+10'))&&milestones('refine').some(e=>e.body.includes('+15')),'refine milestones announce at +10 and +15');
 assert(milestones('echo').length===1&&milestones('echo')[0].body.includes('1,234,568'),'an Echo record announces with a formatted number');

 // ---- the heavy fishing relay ------------------------------------------------------------
 send(a,join);
 send(a,{type:'fishworld',sp:'starwhale',w:900});
 const fish=a.events.filter(e=>e.type==='announce'&&e.kind==='fishing');
 assert(fish.length===1&&fish[0].sp==='starwhale'&&fish[0].w===900&&fish[0].name==='Ann11','a 900 kg mythical catch becomes World news');
 send(a,{type:'fishworld',sp:'starwhale',w:899});
 assert(a.events.filter(e=>e.type==='announce'&&e.kind==='fishing').length===1,'the fishing relay is rate-limited');
 now+=10000;
 send(a,{type:'fishworld',sp:'starwhale',w:799});
 send(a,{type:'fishworld',sp:'Starwhale',w:900});
 send(a,{type:'fishworld',sp:'<img>',w:900});
 assert(a.events.filter(e=>e.type==='announce'&&e.kind==='fishing').length===1,'sub-threshold or malformed relays are dropped');

 // ---- the Hold'em pot milestone (server-authoritative) -----------------------------------
 room.recordPokerLedger(a.id,{room:1,tableId:0,handNo:1,delta:5000,reason:'win'});
 assert(milestones('poker').length===1&&milestones('poker')[0].body.includes('5,000 chips'),"a 5,000-chip pot is World news");
 room.recordPokerLedger(a.id,{room:1,tableId:0,handNo:2,delta:4999,reason:'win'});
 room.recordPokerLedger(a.id,{room:1,tableId:0,handNo:3,delta:5000,reason:'call'});
 room.recordPokerLedger(99,{room:1,tableId:0,handNo:4,delta:9999,reason:'win'}); // offline winner
 assert(milestones('poker').length===1,'smaller pots, non-win movements and offline winners stay quiet');

 // ---- client wiring (source pins, the social_fishing_sim style) --------------------------
 const root=require('node:path').join(__dirname,'..','..')+'/';
 const social=fs.readFileSync(root+'assets/social.js','utf8');
 assert(social.includes("m.type==='announce'")&&social.includes('function pushAnnounce('),'the client listens for announcements');
 assert(social.includes('ANNOUNCE_MAX=15')&&social.includes('app.announces'),'the client keeps a bounded announcement list outside the message store');
 assert(social.includes('function announceNode(')&&social.includes('textContent=speaker+m.body'),'announce lines render as text, never HTML');
 assert(social.includes('function socialLevelBrag(')&&social.includes('function socialRefineBrag(')&&social.includes('function socialEchoBrag('),'the client relays level, refine and Echo milestones');
 assert(social.includes('function hintTick(')&&social.includes('ANN.HINT.BAG_PCTS')&&social.includes('ANN.HINT.GRIND_MS'),'personal hints read the shared config');
 assert(social.includes('hintTick();'),'personal hints ride the heartbeat');
 assert(/fish\.rarity==='mythical'\|\|fish\.rarity==='secret'/.test(social),'the fishing relay gates on mythical or secret');
 const index=fs.readFileSync(root+'index.html','utf8');
 assert(index.includes('assets/social-announcements.js'),'the game loads the announcer config');
 assert(index.indexOf('social-announcements.js')<index.indexOf('assets/social.js'),'the config loads before the chat client');
 assert(index.includes('socialLevelBrag(lv0)'),'base-level milestones hook the level-up');
 assert(index.includes('socialRefineBrag(it.r)'),'refine milestones hook refine success');
 assert(index.includes('socialEchoBrag(prevBest,dps)'),'Echo records hook the ranked trial result');
 const cssFile=fs.readFileSync(root+'assets/social.css','utf8');
 assert(cssFile.includes('.social-line-ann'),'announcer lines have their gold variant');
 const worker=fs.readFileSync(root+'workers/social/room.mjs','utf8');
 assert(worker.includes('maybeAnnounce')&&worker.includes("m.type==='brag'")&&worker.includes("m.type==='fishworld'")&&worker.includes('ANN.POKER_WIN_MIN'),'the worker schedules pools and validates the relays');
 assert(worker.includes("if(m.type!=='chat'&&m.type!=='emotion')return"),'unknown client types are still rejected before the chat fallthrough');
 console.log("PASS social announce: schedule arms/fires/resets, pools weight-pick with spotlight and welcome cooldowns, community reads live plaza counts, solo rooms only get tips, milestone brags validate values and rate-limit, heavy mythical/secret catches and big Hold'em pots announce from server-side facts, announcements never enter the durable World history, and the client renders them as gold system lines with personal hints");
})().catch(e=>{console.error(e&&e.message||e);process.exit(1)});
