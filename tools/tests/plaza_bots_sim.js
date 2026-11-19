/* Seeded plaza crowd (haven-v403): the roster module is deterministic and safe to walk on,
   the room snapshot carries seed/clock/count with zero new Durable Object traffic, and the
   social.js glue pushes bots into the scene only - never into app.players.
   node tools/tests/plaza_bots_sim.js */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..','..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
let pass=0,fail=0,queue=Promise.resolve();
const t=(n,fn)=>{queue=queue.then(async()=>{try{await fn();console.log('  ok   '+n);pass++}catch(e){console.log('  FAIL '+n+' -> '+e.message);fail++}});return queue};
(async()=>{
const R=require(path.join(root,'assets/social-rules.js'));
const W=require(path.join(root,'assets/wardrobe.js'));
const B=require(path.join(root,'assets/plaza-bots.js'));
console.log('plaza crowd: module\n');

t('the module exports the roster and schedule API',()=>{
 assert.equal(typeof B.buildRoster,'function');
 assert.equal(typeof B.segmentAt,'function');
 assert.equal(typeof B.stateAt,'function');
 assert.equal(typeof B.fastPath,'function');
 assert.equal(B.DEFAULT_COUNT,6);
 assert.ok(B.DEFAULT_COUNT>=5&&B.DEFAULT_COUNT<=8,'the fixed crowd sits in the agreed5-8 band');
 assert.equal(typeof B.SOLO_SEED,'number','the solo plaza has its own fixed seed');
 assert.ok(B.FISH_CYCLE.every(m=>['wait','bite','reel'].includes(m)),'fish modes stay in the rig vocabulary');
 assert.ok(B.RODS.every(r=>['twig','oak','brass','silver','golden','mythril'].includes(r)),'rods match the server list');
});

t('the same seed builds the same crowd, a different seed a different one',()=>{
 const a=B.buildRoster(12345,{count:6}),b=B.buildRoster(12345,{count:6}),c=B.buildRoster(54321,{count:6});
 assert.deepEqual(a,b,'seed12345 is deterministic');
 assert.notDeepEqual(a.map(x=>x.name),c.map(x=>x.name),'seed54321 changes the names');
 assert.notDeepEqual(a.map(x=>x.look),c.map(x=>x.look),'seed54321 changes the looks');
});

t('count clamps to the band and0 is the kill switch',()=>{
 assert.equal(B.buildRoster(9,{count:0}).length,0);
 assert.equal(B.buildRoster(9,{count:3}).length,3);
 assert.equal(B.buildRoster(9,{count:99}).length,B.MAX_COUNT);
 assert.ok(B.MAX_COUNT<=8,'never more than8');
});

t('ids are strings, names are unique and account-shaped',()=>{
 const bots=B.buildRoster(77,{count:6});
 const ids=new Set(bots.map(b=>b.id)),names=new Set(bots.map(b=>b.name));
 assert.equal(ids.size,6);
 assert.equal(names.size,6,'no duplicate names inside the crowd');
 bots.forEach((b,i)=>{
  assert.equal(b.id,'bot'+i,'bot ids are stable strings that can never be a numeric account id');
  assert.equal(typeof b.id,'string');
  assert.ok(b.name.length>=4&&b.name.length<=12,'name length: '+b.name);
  assert.ok(!/^\d+$/.test(b.name),'names are not bare numbers');
 });
});

t('every look is wardrobe-valid and inside the walk-speed clamp',()=>{
 for(const bot of B.buildRoster(314,{count:6})){
  assert.ok(Object.hasOwn(W.CLASSES,bot.look.cls),bot.look.cls+' is a real class');
  assert.deepEqual(W.normalize(bot.look.appearance),bot.look.appearance,'appearance is already normalized');
  assert.equal(bot.look.appearance.version,1);
  assert.ok(W.HAIRS.m.includes(bot.look.appearance.heads.m),'male head id valid');
  assert.ok(W.HAIRS.f.includes(bot.look.appearance.heads.f),'female head id valid');
  for(const s of['m','f']){
   assert.ok(Number.isInteger(bot.look.appearance.colors[s])&&bot.look.appearance.colors[s]>=0&&bot.look.appearance.colors[s]<=8);
  }
  assert.ok(bot.look.speed>=R.MIN_SPEED&&bot.look.speed<=R.MAX_SPEED,'speed '+bot.look.speed+' inside clamp');
  assert.equal(R.walkSpeed({look:bot.look}),bot.look.speed,'the planner and advance() agree on speed');
  assert.equal(bot.look.title,'','crowd regulars carry no earned titles');
 }
});

t('plans chain position to position and close the loop',()=>{
 for(const bot of B.buildRoster(2026,{count:6})){
  assert.ok(bot.segments.length>=4,'a plan has real variety: '+bot.segments.length);
  assert.ok(bot.cycleMs>=4*600000,'a loop is at least four10-minute stays: '+bot.cycleMs);
  const endOf=seg=>seg.kind==='idle'?seg.at:seg.to;
  for(let i=1;i<bot.segments.length;i++){
   const prev=endOf(bot.segments[i-1]),cur=bot.segments[i].from;
   assert.ok(Math.hypot(prev.x-cur.x,prev.z-cur.z)<=1,'seg '+i+' starts where seg '+(i-1)+' ended');
  }
  const last=endOf(bot.segments[bot.segments.length-1]),first=bot.segments[0].from;
  assert.ok(Math.hypot(last.x-first.x,last.z-first.z)<=1,'the loop walks home to where it started');
  for(const seg of bot.segments){
   assert.ok(seg.dur>0,'every segment lasts');
   if(seg.kind==='walk')assert.ok(seg.route&&seg.route.length,'walk legs have a route');
   if(seg.kind==='seat'||seg.kind==='fish')assert.ok((seg.route&&seg.route.length)||seg.walkMs===0,'seat/fish legs have a route or start seated');
  }
 }
});

t('stays last10-20 minutes and the plan only walks between them',()=>{
 for(const bot of B.buildRoster(20261113,{count:6})){
  const walks=bot.segments.filter(s=>s.kind==='walk');
  assert.ok(walks.length<=4,'at most four walk legs a cycle, got '+walks.length+' for '+bot.id);
  for(const seg of bot.segments){
   if(seg.kind==='walk'){
    assert.ok(seg.walkMs<60000,'walk legs stay under a minute: '+seg.walkMs);
    assert.ok(!seg.emote,'walks never emote');
    continue;
   }
   const rest=seg.dur-(seg.walkMs||0);
   assert.ok(rest>=600000&&rest<=1200000,'rest of '+seg.kind+' is10-20 min, got '+Math.round(rest/1000)+'s');
  }
  assert.equal(bot.segments.filter(s=>s.kind==='idle'||s.kind==='seat'||s.kind==='fish').length,4,
   'four rests per cycle');
 }
});

t('every regular hangs around the DigiPet corridor once per cycle',()=>{
 // The east-side NPC strip: Cook Lina (28,39), Trainer Jori (27.7,55), Guide Nia (27.7,71).
 for(const bot of B.buildRoster(20261113,{count:6})){
  const hang=bot.segments.filter(s=>s.kind==='idle'&&s.at.x>=22&&s.at.x<=34&&s.at.z>=38&&s.at.z<=72);
  assert.equal(hang.length,1,'exactly one DigiPet-corridor rest for '+bot.id);
  assert.ok(R.walkable(hang[0].at.x,hang[0].at.z),'the hang spot is walkable');
 }
});

t('fastPath is a drop-in twin of the shared social-rules path',()=>{
 const pts=[[0,12],[20,20],[-30,40],[50,-20],[-50,70],[70,30],[-10,-30],[40,80],[15,15],[-60,10]];
 let pairs=0;
 for(const [ax,az] of pts)for(const [bx,bz] of pts){
  const a={x:ax,z:az},b={x:bx,z:bz};
  assert.deepEqual(B.fastPath(a,b),R.path(a,b),'fastPath('+(ax+','+az+' -> '+bx+','+bz)+') matches path()');
  pairs++;
 }
 assert.ok(pairs>=100);
});

t('every route point sits on a walkable tile',()=>{
 for(const bot of B.buildRoster(4242,{count:6}))for(const seg of bot.segments){
  if(!seg.route)continue;
  for(const p of seg.route)assert.ok(R.walkable(p.x,p.z),'route point '+p.x+','+p.z);
  if(seg.kind==='walk'){
   assert.ok(R.walkable(seg.to.x,seg.to.z),'walk target '+seg.to.x+','+seg.to.z);
  }
 }
});

t('sit segments use benches, fish segments use the pond chairs, never shared',()=>{
 const bots=B.buildRoster(1717,{count:6});
 const chairs=new Set();
 for(const bot of bots){
  const seats=new Set();
  for(const seg of bot.segments){
   if(seg.kind==='seat'){
    const s=R.SEATS[seg.seat];
    assert.ok(s&&Number.isInteger(s.id),'seat '+seg.seat+' exists');
    assert.ok(s.bench<100,'seat '+seg.seat+' is a bench, not a chair');
    seats.add(seg.seat);
   }
   if(seg.kind==='fish'){
    const s=R.SEATS[seg.seat];
    assert.ok(s&&s.bench>=100,'fish spot '+seg.seat+' is an angler chair');
    assert.ok(!chairs.has(seg.seat),'chair '+seg.seat+' is fished by exactly one regular');
    chairs.add(seg.seat);
   }
  }
  for(const s of seats)assert.ok(!chairs.has(s),'a bench is never also a chair');
 }
 assert.equal(chairs.size,bots.filter(b=>b.segments.some(s=>s.kind==='fish')).length);
});

t('stateAt stays walkable, seated or on a chair across two loops',()=>{
 const bot=B.buildRoster(606,{count:6})[0];
 let prev=null,maxJump=0;
 for(let tLocal=0;tLocal<=bot.cycleMs*2;tLocal+=500){
  const st=B.stateAt(bot,1000+tLocal);
  assert.ok(Number.isInteger(st.dir)&&st.dir>=0&&st.dir<=7,'dir0-7');
  assert.ok(R.walkable(st.x,st.z)||st.sit,'position walkable or seated: '+st.x+','+st.z+' sit='+st.sit);
  if(st.sit){
   const s=R.SEATS[st.seat];
   assert.ok(s,'seat '+st.seat+' exists while sitting');
  }
  if(st.fish){
   assert.equal(st.fish.on,true);
   assert.ok(B.FISH_CYCLE.includes(st.fish.mode),'fish mode cycles through the rig vocabulary: '+st.fish.mode);
   assert.ok(B.RODS.includes(st.fish.rod),'rod '+st.fish.rod);
   assert.ok(R.pondContains(R.PONDS[0],st.fish.x,st.fish.z,0),'bobber lands in the water: '+st.fish.x+','+st.fish.z);
  }
  if(prev)maxJump=Math.max(maxJump,Math.hypot(st.x-prev.x,st.z-prev.z));
  prev=st;
 }
 assert.ok(maxJump<5,'no teleporting between500 ms samples: '+maxJump.toFixed(2));
});

t('the schedule is periodic: t and one cycle later are identical',()=>{
 for(const bot of B.buildRoster(8080,{count:6})){
  for(const probe of[0,Math.floor(bot.cycleMs/3),bot.cycleMs-1]){
   assert.deepEqual(B.stateAt(bot,50000+probe),B.stateAt(bot,50000+probe+bot.cycleMs),'bot '+bot.id+' at '+probe);
  }
 }
});

t('emotions stay inside the shared vocabulary and fire once per rest, roughly every10-20 min',()=>{
 assert.deepEqual([...B.EMOTES].sort(),[...B.EMOTES].filter(e=>R.EMOTIONS.includes(e)).sort(),'every crowd emote is a real emotion id');
 for(const bot of B.buildRoster(9090,{count:6})){
  const times=[];
  for(const seg of bot.segments){
   if(seg.kind==='walk'){assert.ok(!seg.emote,'walks never emote');continue}
   assert.ok(seg.emote,'every rest carries its one emote ('+seg.kind+')');
   assert.ok(R.EMOTIONS.includes(seg.emote.emotion),seg.emote.emotion+' has art');
   assert.ok(seg.emote.after==='enter'||seg.emote.after==='arrived');
   assert.ok(seg.emote.at>=seg.dur*0.3&&seg.emote.at<=seg.dur*0.7,
    'emote fires mid-rest: '+seg.emote.at+' of '+seg.dur);
   times.push(seg.start+seg.emote.at);
  }
  assert.equal(times.length,4,'four rests, four emotes');
  times.sort((a,b)=>a-b);
  for(let i=1;i<times.length;i++){
   const gap=times[i]-times[i-1];
   assert.ok(gap>=5*60000&&gap<=30*60000,'emote gap '+Math.round(gap/60000)+' min (5-30)');
  }
  // and the wrap-around gap into the next cycle stays in the same band
  const wrap=bot.cycleMs-times[times.length-1]+times[0];
  assert.ok(wrap>=5*60000&&wrap<=30*60000,'wrap emote gap '+Math.round(wrap/60000)+' min');
 }
});

 t('the module is pure: no Math.random, no DOM, no app state',()=>{
 const src=read('assets/plaza-bots.js');
 assert.ok(!/Math\.random\s*\(/.test(src),'determinism comes from mulberry32 only');
 assert.ok(!/\bapp\./.test(src),'the module never touches the page app');
 assert.ok(!/document\./.test(src),'the module never touches the DOM');
 assert.ok(src.includes("require('./social-rules.js')")&&src.includes("require('./wardrobe.js')"),'shares the exact geometry and wardrobe the page uses');
});

// --- the room snapshot -------------------------------------------------------------------
console.log('plaza crowd: room snapshot\n');
globalThis.PGSocialRules=R;
const {SocialRoom}=await import(path.join(root,'workers/social/room.mjs'));
t('the join snapshot rides seed/at/count with no new message type',()=>{
 let now=1000,seq=0;
 const room=new SocialRoom({now:()=>now,random:()=>((seq=(seq*7+3)%100)/100)});
 const join=id=>{const evs=[];const c=room.connect({id,username:'P'+id},s=>evs.push(JSON.parse(s)),()=>{});room.receive(c,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));return {c,evs}};
 const a=join(1),b=join(2);
 const r1=a.evs.find(x=>x.type==='room'),r2=b.evs.find(x=>x.type==='room');
 assert.ok(r1.bots&&r2.bots,'room snapshots carry the crowd');
 assert.equal(typeof r1.bots.seed,'number');
 assert.equal(r1.bots.seed,r2.bots.seed,'every viewer of a room gets the same seed');
 assert.equal(r1.bots.count,6,'the fixed crowd size');
 assert.equal(r1.bots.at,1000,'at is the room clock the client skews against');
 now+=5000;
 const c=join(3),r3=c.evs.find(x=>x.type==='room');
 assert.equal(r3.bots.seed,r1.bots.seed,'the seed is stable across later joins');
 assert.equal(r3.bots.at,6000,'at follows the clock');
 // room0 (the leave ack) has no crowd field; the client keeps its last crowd instead.
 const leaveEvs=[];const lc=room.connect({id:9,username:'P9'},s=>leaveEvs.push(JSON.parse(s)),()=>{});
 room.receive(lc,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));
 leaveEvs.length=0;
 room.receive(lc,JSON.stringify({type:'leave'}));
 const ack=leaveEvs.find(x=>x.type==='room');
 assert.equal(ack.room,0);
 assert.equal(ack.bots,undefined,'the leave ack is unchanged');
});

t('PLAZA_BOT_COUNT is the single server-side dial',()=>{
 const src=read('workers/social/room.mjs');
 assert.match(src,/const PLAZA_BOT_COUNT=6;/);
 assert.ok(src.includes('bots:{seed:this.botSeed(c.room),at:now,count:PLAZA_BOT_COUNT}'),'sendRoom stamps the snapshot once');
 assert.ok(!/type:'bots'/.test(src),'no new message type was invented');
});

// --- page wiring --------------------------------------------------------------------------
console.log('plaza crowd: page wiring\n');
const social=read('assets/social.js'),page=read('index.html'),watch=read('tools/tests/update_watch_sim.js');
t('the room handler seeds the crowd before the reset re-pushes it',()=>{
 assert.ok(social.includes('app.rooms=m.rooms;plazaBotsOnRoom(m);resetPlayers();'),'onRoom runs before resetPlayers');
 const reset=(social.match(/function resetPlayers\(\)\{[^}]*\}/)||[])[0];
 assert.ok(reset&&reset.includes('plazaBotsResync()'),'every reset heals the crowd afterwards');
});

 t('the ticker rides the existing session interval, not a new timer',()=>{
 assert.ok(social.includes('setInterval(()=>{try{plazaBotsTick()}catch{}'),'the2 s session loop drives the crowd');
 assert.equal((social.match(/setInterval\(/g)||[]).length,5,'no extra setInterval was added for the crowd (cooldown, session, battle, training, and the one session loop that hosts the tick)');
 assert.ok(!/setInterval\(plazaBotsTick/.test(social),'plazaBotsTick is never its own timer');
 assert.ok(/for\(const p of app\.players\.values\(\)\)app\.scene\.putPlayer\(p\);\s*plazaBotsResync\(\);/.test(social),'enter seeds the solo crowd');
});

t('bots can never reach the account-only menus',()=>{
 const menu=(social.match(/function playerMenu\([\s\S]*?\n\}/)||[])[0];
 assert.ok(menu,'playerMenu extracted');
 assert.ok(menu.includes("id.startsWith('bot')"),'bot ids are guarded');
 assert.ok(menu.includes('Whisper')&&menu.includes('Add friend')&&menu.includes('Mute'),'the real menu keeps its actions for accounts');
 const push=(social.match(/function plazaBotsPush\([\s\S]*?\n\}/)||[])[0];
 assert.ok(push&&push.includes('app.scene.putPlayer(state)'),'crowd states go to the scene directly');
 assert.ok(push&&!/app\.players\.set/.test(push),'never into app.players');
});

t('index.html loads the crowd module in dependency order at the current build',()=>{
 const build=(page.match(/const BUILD='[^']*haven-v(\d+)/)||[])[1];
 assert.ok(build,'the page declares a numbered build');
 const rulesAt=page.indexOf('assets/social-rules.js?v=');
 const botsAt=page.indexOf('assets/plaza-bots.js?v=');
 const socialAt=page.indexOf('assets/social.js?v=');
 assert.ok(botsAt>0,'plaza-bots.js is loaded');
 assert.ok(page.includes('assets/plaza-bots.js?v='+build),'busted to the build like the rest of the social runtime');
 assert.ok(rulesAt>=0&&rulesAt<botsAt,'after the shared rules it requires');
 assert.ok(botsAt<socialAt,'before the social client that drives it');
 assert.ok(watch.includes("'assets/plaza-bots.js'"),'update_watch pins the new tag');
});

// --- the glue in a live page --------------------------------------------------------------
console.log('plaza crowd: social.js glue\n');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="view"><div id="feedWrap"></div><div id="minimapTools"><button id="socialHubBtn" type="button" class="minimap-tool-btn social-hub-btn"><span class="minimap-tool-label">Social</span><b id="socialHubBadge" type="button" class="minimap-tool-badge social-hub-badge" hidden>0</b></button></div></div>',{url:'http://localhost/',runScripts:'outside-only'});
const w=dom.window;
Object.assign(w,{CLOUD:{on:false,user:null},S:{cls:'Novice',eq:{}},tabs:[],wardrobeAppearance:()=>({version:1,sex:'m'}),logShown:()=>[],openTab:()=>{},HUNT_TITLES:[{id:'poring',name:'Poring Hunter'}],titleUnlocked:()=>true,
 setInterval:fn=>{if(fn.name==='worldTrainingTick')w.trainingTick=fn;else if(fn.name==='battleUITick')w.battleTick=fn;else w.sessionTick=fn}});
const scenePlayers=new Map(),rigs=[],bubbles=[],removed=[];let sceneCb=null,socket=null;
w.PGSocialScene={create:async(_host,_labels,cb)=>{sceneCb=cb;return {active:false,cameraState:{angle:0,pitch:48,distance:48,panX:0,panZ:0,follow:true},
 setCamera(){},resetCamera(){},clearPlayers(){scenePlayers.clear()},putPlayer(p){scenePlayers.set(p.id,JSON.parse(JSON.stringify({id:p.id,name:p.name,bot:!!p.bot,seat:p.seat,sit:!!p.sit, fish:!!p.fish,path:(p.path||[]).length})))},
 removePlayer(id){scenePlayers.delete(id);removed.push(id)},
 fishing:{setRig(id,st){rigs.push({id,on:st&&st.on===true,mode:st&&st.mode})}},
 bubble(id,m){bubbles.push({id,emotion:m&&m.emotion})}}}};
for(const f of['assets/digimon/roster.js','assets/digimon/base-stats.js','assets/social-rules.js','assets/wardrobe.js','assets/digimon-sanctuary.js','assets/digimon-battle.js','assets/plaza-bots.js','assets/social.js'])w.eval(read(f));
const app=w.PGSocial.app;
const botNames=()=>[...scenePlayers.keys()].filter(k=>typeof k==='string'&&k.startsWith('bot')).sort();

t('solo plaza: the crowd appears in the scene and nowhere else',async()=>{
 await w.PGSocial.enter();
 assert.equal(app.wanted,true);
 const ids=botNames();
 assert.deepEqual(ids,['bot0','bot1','bot2','bot3','bot4','bot5'],'six regulars are pushed');
 assert.equal(app.players.size,1,'app.players holds only the solo placeholder');
 assert.ok(!app.players.has('bot0'),'the crowd never enters app.players');
 assert.equal(w.document.getElementById('socialPopulation').textContent,'Solo','population still counts only real players');
 const expect=[...w.PGPlazaBots.buildRoster(w.PGPlazaBots.SOLO_SEED,{count:6})].map(b=>b.name);
 assert.deepEqual(ids.map(id=>scenePlayers.get(id).name),expect,'the solo crowd matches the module build for the solo seed');
 assert.ok(rigs.length>=6,'every push also drives the rig API');
 assert.ok(rigs.every(r=>/^bot\d$/.test(r.id)),'rigs are attached to crowd ids only');
 w.sessionTick();
 assert.equal(botNames().length,6,'the session tick keeps the crowd without duplicating it');
});

t('clicking a regular opens a Close-only menu, an account keeps every action',()=>{
 assert.ok(sceneCb&&typeof sceneCb.menu==='function','the scene hands its label clicks to the social client');
 const d=w.document.getElementById('socialPeople');
 const labels=()=>[...d.querySelectorAll('button')].map(b=>b.textContent.trim());
 sceneCb.menu('Zeph','bot0');
 assert.equal(d.hidden,false,'the compact menu still opens');
 assert.equal(d.querySelector('strong').textContent,'Zeph','named after the regular');
 assert.deepEqual(labels(),['Close'],'a crowd regular offers no Whisper, no friend add, no mute, no inspect');
 sceneCb.menu('Rhea',7);
 assert.ok(labels().includes('Whisper'),'an account keeps the full social menu');
 assert.ok(labels().includes('Mute'));
 assert.ok(labels().includes('Close'));
});

 t('a room snapshot rebuilds the crowd from the server seed',async()=>{
 w.CLOUD.on=true;w.CLOUD.user='crowd_tester';
 socket=null;
 w.WebSocket=class{constructor(){socket=this;this.readyState=1;this.sent=[]}close(){}send(m){this.sent.push(JSON.parse(m))}};
 w.sessionTick();
 socket.onmessage({data:JSON.stringify({type:'hello',id:7,history:[]})});
 const before=botNames().map(id=>scenePlayers.get(id).name);
 socket.onmessage({data:JSON.stringify({type:'room',room:1,rooms:[{id:1,count:0}],rules:w.PGSocialRules.rulesFingerprint(),players:[],bots:{seed:987654,at:Date.now(),count:6}})});
 const after=botNames().map(id=>scenePlayers.get(id).name);
 assert.equal(after.length,6,'the room crowd replaces the solo crowd');
 const expect=[...w.PGPlazaBots.buildRoster(987654,{count:6})].map(b=>b.name);
 assert.deepEqual(after,expect,'built from the seed the snapshot carried');
 assert.notDeepEqual(after,before,'the seed change is visible as a new crowd');
 assert.equal(app.players.size,0,'still no crowd in app.players after the room switch');
 assert.ok(removed.includes('bot0'),'the old crowd was removed from the scene before the rebuild');
});

t('a socket drop heals the crowd; leaving the plaza clears it',async()=>{
 const before=botNames().length;
 assert.equal(before,6);
 socket.onclose({code:1006,reason:''});
 assert.equal(app.room,0);
 assert.equal(botNames().length,6,'resetPlayers re-pushed the crowd after the drop');
 w.PGSocial.leave();
 assert.equal(app.wanted,false);
 assert.equal(botNames().length,0,'leaving clears the crowd with everything else');
});

await queue;
const total=pass+fail;
console.log('\nplaza crowd: '+pass+' passed, '+fail+' failed ('+total+' assertions groups)');
if(fail)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
