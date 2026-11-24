const assert=require('node:assert/strict'),fs=require('node:fs');const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="view"><div id="feedWrap"></div><div id="minimapTools"><button id="socialHubBtn" type="button" class="minimap-tool-btn social-hub-btn"><span class="minimap-tool-label">Social</span><b id="socialHubBadge" class="minimap-tool-badge social-hub-badge" hidden>0</b></button></div></div>',{url:'http://localhost/',runScripts:'outside-only'}),w=dom.window;
Object.assign(w,{CLOUD:{on:false,user:null},S:{cls:'Novice',eq:{}},tabs:[],wardrobeAppearance:()=>({version:1,sex:'m'}),logShown:()=>[],openTab:()=>{},HUNT_TITLES:[{id:'poring',name:'Poring Hunter'}],titleUnlocked:()=>true,setInterval:fn=>{if(fn.name==='worldTrainingTick')w.trainingTick=fn;else if(fn.name==='battleUITick')w.battleTick=fn;else w.sessionTick=fn},PGSocialScene:{}});
// Run the actual social boot with fresh storage and each previously saved choice.
if(!process.env.PG_NIGHT_CASE){
 const {spawnSync}=require('node:child_process');
 for(const choice of ['0','1','override','expired','fresh-day']){const r=spawnSync(process.execPath,[__filename],{env:{...process.env,PG_NIGHT_CASE:choice},encoding:'utf8'});assert.equal(r.status,0,'saved night preference '+choice+' failed: '+r.stderr+'\n'+r.stdout)}
}
w.pgPlazaClockOffset=Date.parse(process.env.PG_NIGHT_CASE==='fresh-day'?'2026-11-23T02:00:00Z':'2026-11-23T12:30:00Z')-Date.now(); // UTC+8 day or night
const nightChoice=process.env.PG_NIGHT_CASE;
if(nightChoice==='0'||nightChoice==='1')w.localStorage.setItem('pg_plaza_night',nightChoice);
if(nightChoice==='override'||nightChoice==='expired')w.localStorage.setItem('pg_plaza_night_override',JSON.stringify({night:false,until:Date.parse(nightChoice==='override'?'2026-11-23T23:00:00Z':'2026-11-23T12:00:00Z')}));
const initialNight=nightChoice!=='0'&&nightChoice!=='override'&&nightChoice!=='fresh-day';
w.eval(fs.readFileSync('assets/digimon/roster.js','utf8'));w.eval(fs.readFileSync('assets/digimon/base-stats.js','utf8'));w.eval(fs.readFileSync('assets/social-rules.js','utf8'));w.eval(fs.readFileSync('assets/digimon-sanctuary.js','utf8'));w.eval(fs.readFileSync('assets/digimon-battle.js','utf8'));w.eval(fs.readFileSync('assets/social.js','utf8'));
assert.equal(w.document.getElementById('socialMin').tagName,'SPAN','minimize is a line in the header, without a button box');assert.equal(w.document.getElementById('socialResize').tagName,'SPAN','resize uses the border, without a separate button');
const app=w.PGSocial.app;app.user='previous';app.messages=[{channel:'whisper',name:'Private',body:'Do not leak'}];app.socket=null;app.room=1;app.wanted=true;app.muted.add(7);w.sessionTick();assert.equal(app.user,null);assert.equal(app.messages.length,0);assert.equal(app.muted.size,0);assert.equal(app.room,0);assert(w.document.getElementById('socialHub').hidden);
// v274 (owner): the emotion tray works on World and Whisper, not only inside a plaza.
w.PGSocial.select('emoji');assert.doesNotMatch(w.document.getElementById('socialEmoji').textContent,/Enter the Social Hub/,'world chat can send emotions');assert.equal(w.document.querySelectorAll('#socialEmoji button').length,w.PGSocialRules.EMOTIONS.length);assert(!w.document.getElementById('socialCompose').hidden);assert.equal(app.channel,'world');assert(!w.document.querySelector('#socialTabs [data-channel=emoji]'));assert.equal(w.document.getElementById('socialEmojiToggle').nextElementSibling.id,'socialSend');
w.PGSocial.select('whisper');assert(!w.document.getElementById('socialTo').hidden);w.document.getElementById('socialMin').click();assert(w.document.getElementById('socialChat').classList.contains('minimized'));w.document.getElementById('socialMin').click();assert(!w.document.getElementById('socialChat').classList.contains('minimized'));
const bar=w.document.getElementById('socialMin');bar.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert(w.document.getElementById('socialChat').classList.contains('minimized'));w.document.getElementById('socialMin').dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));assert(!w.document.getElementById('socialChat').classList.contains('minimized'));
// HUD/Display sync must not replace the tab under the pointer (hover flicker / lost clicks).
{
 const d=w.document,world=d.querySelector('#socialTabs [data-channel=world]'),whisper=d.querySelector('#socialTabs [data-channel=whisper]'),min=d.getElementById('socialMin');
 world.focus();for(let i=0;i<40;i++)w.PGSocial.syncDisplay();
 assert.equal(d.querySelector('#socialTabs [data-channel=world]'),world);assert.equal(d.activeElement,world);
 world.dispatchEvent(new w.MouseEvent('mouseover',{bubbles:true}));world.dispatchEvent(new w.MouseEvent('mouseenter',{bubbles:true}));
 assert.equal(d.querySelector('#socialTabs [data-channel=world]'),world);world.click();assert.equal(app.channel,'world');
 app.room=1;w.PGSocial.syncDisplay();assert.equal(d.querySelector('#socialTabs [data-channel=world]'),world);assert.ok(d.querySelector('#socialTabs [data-channel=local]'));
 app.room=0;w.PGSocial.syncDisplay();assert.equal(d.querySelector('#socialTabs [data-channel=world]'),world);assert.equal(d.querySelector('#socialTabs [data-channel=local]'),null);
 app.unread.add('whisper');w.PGSocial.syncDisplay();assert.equal(d.querySelector('#socialTabs [data-channel=whisper]'),whisper);assert.ok(whisper.classList.contains('unread'));app.unread.delete('whisper');
 min.click();assert.equal(d.getElementById('socialMin'),min);assert.equal(d.getElementById('socialChat').classList.contains('minimized'),true);min.click();assert.equal(d.getElementById('socialChat').classList.contains('minimized'),false);
 const socialCss=fs.readFileSync('assets/social.css','utf8');assert.match(socialCss,/#socialTabs button\{position:relative;z-index:7\}/);assert.match(socialCss,/#sanctuaryWorldStatus\{[^}]*width:min\(360px/,'training status has a fixed width so the stop button does not shift on countdown');assert.match(socialCss,/#sanctuaryActivityPanel\{[^}]*position:absolute/,'the gym and the middle farm share one positioned activity panel');assert.match(socialCss,/#sanctuaryActivityPanel\.is-moved\{transform:none\}/,'dragging switches it out of the default centered slot');assert.match(socialCss,/\.sap-repeat input\{/,'the panel carries the keep-repeating switch');assert.match(socialCss,/#socialMin\{position:relative;z-index:7;/);
 // v384: the top-centre notices are one flex column, the activity pill is the dock, and the PvE Start
 // button is laid out by its host instead of floating at a fixed height over the panel text.
 {const battleCss=fs.readFileSync('assets/social-battle.css','utf8');
  assert.match(socialCss,/#socialHudStack\{[^}]*display:flex;flex-direction:column/,'the top-centre notices stack in one column');
  assert.match(socialCss,/#socialHudStack\{[^}]*pointer-events:none/,'and the column itself never swallows a click on the plaza');
  assert.match(socialCss,/#socialHudStack>:is\([^)]*#fishingMvpBanner[^)]*#sanctuaryBattleHUD[^)]*\)\{position:static;transform:none/,'the MVP alert and the battle card are rows of it, so they cannot overlap');
  assert.match(socialCss,/#socialHub\.has-management #digipetDock\{visibility:hidden\}/,'a management window hides the dock without dropping it');
  assert.match(socialCss,/#socialHub\.sap-panel-open #socialHudStack>:is\([^)]*#sanctuaryBattleHUD[^)]*\)\{display:none\}/,'an open activity panel hides its duplicate centre HUD instead of clashing with it');
  assert.match(socialCss,/\.dd-face\{[^}]*background-size:600px 420px/,'the dock portrait uses the 30px cell of the portrait sheet');
  assert(!/sanctuaryWorldPill|\.pill-|sap-mini|is-mini/.test(socialCss),'the pill and the mini strip leave no styles behind');
  assert(!/#sanctuaryBattleNearby\{[^}]*position:absolute/.test(battleCss)&&!/#sanctuaryBattleNearby\{[^}]*top:\d/.test(battleCss),'the Start button is not pinned over the panel text any more');
  assert(!/#sanctuaryBattleHUD\{[^}]*position:absolute/.test(battleCss),'and the battle card takes its place in the column');
  assert.match(socialCss,/\.sap-pve-action #sanctuaryBattleNearby\{position:static;width:100%/,'inside the PvE tab it is a full-width block');}
}
let socket;w.WebSocket=class {constructor(){socket=this;this.readyState=1;this.sent=[]}close(){}send(m){this.sent.push(JSON.parse(m))}};w.CLOUD.on=true;w.CLOUD.user='new';w.sessionTick();socket.onmessage({data:JSON.stringify({type:'hello',id:2,history:[]})});
app.messages=Array.from({length:400},(_,i)=>({channel:'whisper',body:'old'+i,name:'Name',from:1,id:'w'+i,at:i}));socket.onmessage({data:JSON.stringify({type:'hello',id:2,history:Array.from({length:100},(_,i)=>({channel:'world',body:'world',name:'Name',from:1,id:'world'+i,at:i}))})});assert.equal(app.messages.length,400);
w.PGSocial.select('world');socket.onmessage({data:JSON.stringify({type:'message',channel:'world',body:'<img src=x onerror=alert(1)>',name:'<script>',from:3,at:1000})});assert.equal(w.document.querySelectorAll('#socialLines img,#socialLines script').length,0);assert(w.document.getElementById('socialLines').textContent.includes('<img'));
 // v406 (owner: "in world chat when click on own name whisper tab, friend and all came out.
 // should not happen for own name & make click elsewhere is will be close for other players name").
 // Your own line is not a contact: whispering, friending or muting yourself is meaningless. And
 // the menu used to have no way out but Escape or its own Close button, so it sat over the chat.
 {
  const d=w.document,menu=d.getElementById('socialPeople'),me=app.id;
  assert(Number.isInteger(me),'the socket has handed out our chat id');
  w.PGSocial.select('world');
  socket.onmessage({data:JSON.stringify({type:'message',channel:'world',body:'mine',name:'Self',from:me,at:90000})});
  const selfBtn=[...d.querySelectorAll('#socialLines .social-line button')].find(b=>b.textContent==='Self');
  assert(selfBtn,'our own world-chat line renders a name button');
  menu.hidden=true;selfBtn.click();
  assert.equal(menu.hidden,true,'clicking your OWN name must not raise the player menu');
  socket.onmessage({data:JSON.stringify({type:'message',channel:'world',body:'theirs',name:'Stranger',from:me+1000,at:90001})});
  const otherBtn=[...d.querySelectorAll('#socialLines .social-line button')].find(b=>b.textContent==='Stranger');
  assert(otherBtn,"another player's world-chat line renders a name button");
  otherBtn.click();
  assert.equal(menu.hidden,false,"another player's name still opens the menu");
  assert.match(menu.textContent,/Whisper/,'the menu still offers Whisper');
  assert.match(menu.textContent,/Close/,'and keeps its own way out');
  menu.querySelector('strong').click();
  assert.equal(menu.hidden,false,'a click INSIDE the menu does not close it');
  d.body.click();
  assert.equal(menu.hidden,true,'clicking anywhere else closes the menu');
  otherBtn.click();
  assert.equal(menu.hidden,false,'the menu opens again on the next click on that name');
  d.body.click();
  assert.equal(menu.hidden,true,'and closes again');
 }

 // v374 (owner): typing an emotion command and pressing Enter sends it on the current channel and the
 // room echoes it back, so the sender sees it too. /thx is the Thanks art (id ok), not the id 'ok'.
 // The evil grin answers to /hz now: /gg means "good game" and clashed with the old plaza grin.
 app.nextChat=0;w.PGSocial.select('local');app.room=1;w.document.getElementById('socialInput').value='/hz';
 w.document.getElementById('socialCompose').dispatchEvent(new w.Event('submit',{cancelable:true}));
 assert.equal(socket.sent.at(-1).type,'emotion','typed /hz is sent as an emotion');assert.equal(socket.sent.at(-1).emotion,'gg','/hz is the gg art');assert.equal(socket.sent.at(-1).channel,'local');
 // /gg must NOT become an emote any more - it falls through to ordinary chat text.
 app.nextChat=0;w.document.getElementById('socialInput').value='/gg';
 w.document.getElementById('socialCompose').dispatchEvent(new w.Event('submit',{cancelable:true}));
 assert.equal(socket.sent.at(-1).type,'chat','/gg is plain chat now, not the grin');assert.equal(socket.sent.at(-1).body,'/gg');
 w.document.getElementById('socialInput').value='';
app.nextChat=0;w.PGSocial.select('local');app.room=1;w.document.getElementById('socialInput').value='first';w.document.getElementById('socialCompose').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(socket.sent.at(-1).body,'first');const count=socket.sent.length;w.document.getElementById('socialInput').value='second';w.document.getElementById('socialCompose').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(socket.sent.length,count);assert.equal(w.document.getElementById('socialInput').value,'second');assert(w.document.getElementById('socialSend').disabled);w.PGSocial.select('world');w.document.getElementById('socialCompose').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(socket.sent.length,count,'changing channel cannot evade cooldown');app.nextChat=0;w.document.getElementById('socialCompose').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(socket.sent.at(-1).body,'second');
// Pointer and keyboard resizing uses the actual view bounds and restores a preferred size.
const view=w.document.getElementById('view'),chat=w.document.getElementById('socialChat'),handle=w.document.getElementById('socialResize'),topHandle=w.document.getElementById('socialResizeTop'),cornerHandle=w.document.getElementById('socialResizeCorner');
assert.equal(topHandle.tagName,'SPAN','top resize uses the border');assert.equal(cornerHandle.tagName,'SPAN','corner resize uses the header corner');
let width=1280,height=800;view.getBoundingClientRect=()=>({width,height,left:0,top:0});Object.defineProperties(chat,{offsetWidth:{get:()=>parseFloat(chat.style.width)||390},offsetHeight:{get:()=>parseFloat(chat.style.height)||214},offsetLeft:{get:()=>12}});handle.setPointerCapture=()=>{};
const pointer=(x,y)=>({pointerId:1,clientX:x,clientY:y,preventDefault(){},stopPropagation(){}});handle.onpointerdown(pointer(400,400));handle.onpointermove(pointer(700,300));handle.onpointerup();assert.equal(chat.style.width,'346px');assert.equal(chat.style.height,'314px');
handle.onkeydown({key:'ArrowLeft',preventDefault(){}});assert.equal(chat.style.width,'326px');assert.equal(JSON.parse(w.localStorage.getItem('pg_chat_size'))[0],326);
// Top edge adjusts height only; corner and window pointer fallback adjust both axes down to compact bounds.
topHandle.onpointerdown(pointer(200,300));topHandle.onpointermove(pointer(260,260));topHandle.onpointerup();assert.equal(chat.style.width,'326px','top border resize keeps width unchanged');assert.equal(chat.style.height,'354px');
cornerHandle.onpointerdown(pointer(320,260));const winMove=new w.Event('pointermove');Object.assign(winMove,{pointerId:1,clientX:120,clientY:520});w.dispatchEvent(winMove);const winUp=new w.Event('pointerup');Object.assign(winUp,{pointerId:1});w.dispatchEvent(winUp);assert.equal(chat.style.width,'220px','compact minimum width allows resizing on 1280px desktops');assert.equal(chat.style.height,'120px');
handle.onpointerdown(pointer(220,400));handle.onpointermove(pointer(326,206));handle.onpointerup();assert.equal(chat.style.width,'326px');assert.equal(chat.style.height,'314px');
width=300;w.dispatchEvent(new w.Event('resize'));assert.equal(chat.style.width,'276px');width=1280;w.dispatchEvent(new w.Event('resize'));assert.equal(chat.style.width,'326px','desktop preference survives phone resizing');
let cameraValues,reset=0;app.scene={cameraState:{angle:0,pitch:48,distance:48,panX:0,panZ:0,follow:true},setCamera:v=>{cameraValues=v},resetCamera:()=>reset++,clearPlayers(){},putPlayer(){}};
for(const id of ['socialCamera','socialCameraReset','socialCameraPanel','socialOrbit','socialTilt','socialZoom'])assert.equal(w.document.getElementById(id),null,id+' is removed from the compact plaza UI');assert.equal(w.document.getElementById('sanctuaryOpen').textContent,'🥚 DigiPet');assert(!/Camera|Reset view/.test(w.document.getElementById('socialHubToolbar').textContent));assert.equal(w.document.getElementById('socialHubHelp'),null,'the top question-mark control is removed');assert.equal(w.document.getElementById('socialSit').parentElement.id,'socialHub','Sit is independent of the top toolbar');assert(!w.document.getElementById('socialHubToolbar').contains(w.document.getElementById('socialSit')));const unifiedCss=fs.readFileSync('assets/social.css','utf8');assert.match(unifiedCss,/#socialHubToolbar\{[^}]*linear-gradient/);assert.match(unifiedCss,/#socialHubToolbar\{[^}]*border:1px solid #c5a76b/);assert.match(unifiedCss,/#socialSit\{position:absolute;[^}]*var\(--docktop/);assert.match(unifiedCss,/#sanctuaryClose\{[^}]*display:inline-flex;align-items:center;justify-content:center/);assert.match(unifiedCss,/background-image:url\('digimon\/digidex-portraits.webp'\)/);assert.match(unifiedCss,/data-rank=mega-plus/);
const sent=[];socket.send=s=>sent.push(JSON.parse(s));app.room=1;w.S.equippedTitle='poring';w.sessionTick();w.S.equippedTitle=null;w.sessionTick();assert(sent.some(m=>m.type==='look'&&m.look.title===''));assert(!sent.some(m=>m.type==='leave'),'appearance/title updates must preserve seat and coordinates');
w.PGSocial.select('emoji');assert.equal(w.document.querySelectorAll('#socialEmoji button').length,w.PGSocialRules.EMOTIONS.length,'the tray renders every emotion, including the 14 PR #269 adds');
// v363 (owner: "when I walk around I keep being teleported back to spawn"): a plaza socket drop
// used to rebuild the local placeholder on the fountain ring, so every reconnect blip looked like a
// teleport. The spot the walk was standing on when the close arrived is kept instead.
{
 app.wanted=true;app.resume=null;
 const spot={id:app.id,room:1,x:15,z:-8,dir:3,sit:false,seat:null,pokerSeat:null,path:[],at:0,look:{}};
 app.players.set(app.id,spot);
 socket.onclose({code:1006,reason:''});
 assert.equal(app.room,0,'the drop leaves the plaza');
 assert.equal(app.resume&&app.resume.x,15,'the close captures the standing spot');
 assert.equal(app.resume.z,-8,'and its depth');
 const solo=app.players.get(0);
 assert.ok(solo,'the local placeholder exists while reconnecting');
 assert.equal(solo.x,15,'the hero is not teleported to the fountain ring: x');
 assert.equal(solo.z,-8,'the hero is not teleported to the fountain ring: z');
 assert.equal(solo.dir,3,'the facing is kept with the spot');
 assert.equal(Math.hypot(solo.x,solo.z)>13,true,'and this is not on the promenade ring');
 app.resume=null;
}
// Solo plaza fallback spawns the local character when offline or before room join, supports walk/sit, and yields cleanly to multiplayer room state.
w.PGSocial.leave();w.CLOUD.on=false;w.CLOUD.user=null;w.currentUser='local_hero';app.socket=null;app.user=null;app.connected=false;app.room=0;
let sceneCallbacks=null;const scenePlayers=new Map(),nightApplied=[];
w.PGSocialScene={create:async(_host,_labels,cb)=>{sceneCallbacks=cb;return{active:false,setNight(v){nightApplied.push(v)},cameraState:{angle:0,pitch:48,distance:48,panX:0,panZ:0,follow:true},setCamera:v=>{cameraValues=v},resetCamera:()=>reset++,clearPlayers(){scenePlayers.clear()},putPlayer(p){scenePlayers.set(p.id,{...p,path:(p.path||[]).map(pt=>({...pt}))})},removePlayer(id){scenePlayers.delete(id)}}}};
app.scene=null;
// Display can change the preference before a plaza scene has ever been created.
w.PGSocial.setNight(!initialNight);assert.equal(w.PGSocial.getNight(),!initialNight);
w.PGSocial.setNight(initialNight);assert.equal(w.PGSocial.getNight(),initialNight);
w.S.lv=150;w.S.auraShow=true;w.moveSpd=()=>9.5;w.TABS={equip:['','Equipment']};
(async()=>{
 w.S.digimonSanctuary={v:1,partners:{agumon:{stats:{power:3},training:{stat:'power',ends:1}}}};
 await w.PGSocial.enter();
 // Local visual setting: the Display-facing API preserves choices and sends no room messages.
 {const d=w.document;const before=socket.sent.length;assert.equal(nightApplied.at(-1),initialNight,'fresh browsers default to night; saved day/night applies at scene creation');
  assert.equal(w.PGSocial.getNight(),initialNight);d.getElementById('socialMore').click();assert.equal(d.querySelector('[data-hub-night]'),null,'night control moved out of More');d.querySelector('[data-hub-close]').click();
  w.PGSocial.setNight(false);assert.equal(JSON.parse(w.localStorage.getItem('pg_plaza_night_override')).night,false);assert.equal(nightApplied.at(-1),false);assert.equal(w.PGSocial.getNight(),false);
  w.PGSocial.setNight(true);assert.equal(JSON.parse(w.localStorage.getItem('pg_plaza_night_override')).night,true);assert.equal(nightApplied.at(-1),true);assert.equal(w.PGSocial.getNight(),true);
  // Storage denial must not break a live toggle; it remains usable for this page.
  const store=w.localStorage;Object.defineProperty(w,'localStorage',{configurable:true,value:{setItem(){throw Error('storage denied')}}});
  w.PGSocial.setNight(false);assert.equal(w.PGSocial.getNight(),false);assert.equal(nightApplied.at(-1),false);
  Object.defineProperty(w,'localStorage',{configurable:true,value:store});assert.equal(socket.sent.length,before,'visual preference sends no socket messages');}
 // UTC+8 boundaries, live scene, a temporary override, a background resume and clock correction.
 {const d=w.document,before=socket.sent.length,moveClock=iso=>{w.pgPlazaClockOffset=Date.parse(iso)-Date.now();w.PGSocial.syncClock()};
  // Expire the previous override, then start just before the following morning.
  moveClock('2026-11-23T23:00:00Z');
  moveClock('2026-11-24T22:59:59Z');assert.equal(w.PGSocial.getNight(),true,'06:59:59 UTC+8 is night');
  moveClock('2026-11-24T23:00:00Z');assert.equal(w.PGSocial.getNight(),false,'07:00 UTC+8 is day');assert.equal(nightApplied.at(-1),false);
  w.PGSocial.setNight(true);const saved=JSON.parse(w.localStorage.getItem('pg_plaza_night_override'));assert.equal(saved.until,Date.parse('2026-11-25T12:00:00Z'),'override expires at 20:00 UTC+8');
  moveClock('2026-11-25T11:59:59Z');assert.equal(w.PGSocial.getNight(),true,'override survives until boundary');
  w.PGSocial.setNight(false);assert.equal(nightApplied.at(-1),false,'manual day is applied before nightfall');
  // Simulate a throttled hidden tab; visibility resumes the scheduled appearance.
  w.pgPlazaClockOffset=Date.parse('2026-11-25T12:00:00Z')-Date.now();d.dispatchEvent(new w.Event('visibilitychange'));assert.equal(w.PGSocial.getNight(),true,'20:00 UTC+8 is night');assert.equal(nightApplied.at(-1),true,'nightfall updates the live scene');assert.equal(w.localStorage.getItem('pg_plaza_night_override'),null);
  moveClock('2026-11-25T23:00:00Z');assert.equal(w.PGSocial.getNight(),false,'next morning returns to day');assert.equal(nightApplied.at(-1),false);
  // Normal running checks the clock on the existing session timer, without a fresh clock response.
  w.pgPlazaClockOffset=Date.parse('2026-11-26T12:00:00Z')-Date.now();w.sessionTick();assert.equal(nightApplied.at(-1),true,'existing timer applies nightfall');
  delete w.pgPlazaClockOffset;w.PGSocial.setNight(false);
  assert.equal(JSON.parse(w.localStorage.getItem('pg_plaza_night_override')).provisional,true,'offline choice uses provisional expiry');
  moveClock('2026-11-27T02:00:00Z');assert.equal(JSON.parse(w.localStorage.getItem('pg_plaza_night_override')).until,Date.parse('2026-11-27T12:00:00Z'),'first server clock rebases the expiry');
  assert.equal(socket.sent.length,before,'clock changes add no socket traffic');}


 assert.equal(w.S.digimonSanctuary.partners.agumon.stats.power,3,'legacy completed progress is preserved');assert.equal(w.S.digimonSanctuary.partners.agumon.training,null,'old pending timer cannot award offline progress');delete w.S.digimonSanctuary;
 assert.equal(app.players.size,1,'offline/reconnecting plaza spawns solo character');
 assert.equal(scenePlayers.get(0).name,'local_hero');assert.equal(sceneCallbacks.self(),0);
 // v363: with no drop to continue, a true first entry still walks in on the promenade ring.
 { const sp=scenePlayers.get(0),r=Math.hypot(sp.x,sp.z);
   assert.equal(r>=10.4-1e-9&&r<=12.2+1e-9,true,'a fresh entry spawns on the fountain ring ('+r.toFixed(2)+')'); }
 assert.equal(scenePlayers.get(0).look.lv,150,'solo plaza carries the level aura tier');
 assert.equal(scenePlayers.get(0).look.speed,9.5,'solo plaza walks at the field run speed');
 // The separate visual preview must not touch old RO pets, and an absent/invalid old save stays off.
 const pick=w.document.getElementById('socialDigimon');let saved=0;w.save=()=>saved++;w.S.pets=[{sp:2,on:true}];
 // This legacy roster fixture deliberately owns every form; the new-player egg
 // path is exercised independently below/in the Sanctuary bag regression.
 w.S.digimonBag={v:1,coins:1000,food:99,eggs:0,owned:w.PGDigimonSanctuary.ROSTER};
 w.document.getElementById('sanctuaryOpen').click();assert(!w.document.getElementById('sanctuaryPanel').hidden);assert.equal(w.document.querySelectorAll('[data-sanctuary-pet]').length,0,'the owned-forms card grid is retired');assert.equal(w.PGDigimonSanctuary.ROSTER.length,280);
 assert.equal(w.S.digimonBag.v,3,'a v1 bag upgrades to the v3 gear/auto-sell schema when the panel opens');saved=0;
 pick.value='patamon';pick.dispatchEvent(new w.Event('change'));assert.equal(pick.value,'patamon');assert.equal(w.S.digimonPartner,'patamon');assert.equal(scenePlayers.get(0).look.digimon,'patamon');assert.equal(saved,1);
 w.document.getElementById('sanctuaryDismiss').click();assert.equal(scenePlayers.get(0).look.digimon,undefined);assert.equal(w.S.pets[0].on,true);w.document.getElementById('sanctuaryClose').click();assert(w.document.getElementById('sanctuaryPanel').hidden);saved=0;
 // The real roster browser reaches an animation-only entry without mounting all 280 cards.
 w.document.getElementById('sanctuaryOpen').click();w.document.querySelector('.sanctuary-nav [data-sanctuary-view="index"]').click();const dexSearch=w.document.getElementById('sanctuaryIndexSearch');dexSearch.value='aegiomon';dexSearch.dispatchEvent(new w.Event('input',{bubbles:true}));assert(w.document.querySelector('[data-index-form="aegiomon"]'),'a legacy-owned variant stays listed in the DigiDex');w.document.querySelector('[data-digidex-assign="aegiomon"]').click();assert.equal(w.S.digimonPartner,'aegiomon');assert.equal(scenePlayers.get(0).look.digimon,'aegiomon');assert.equal(w.S.pets[0].sp,2);w.document.querySelector('.sanctuary-nav [data-sanctuary-view="partners"]').click();assert.match(w.document.getElementById('sanctuaryEvolutionView').textContent,/No direct source-listed evolution/,'the moved evolution view still explains a form with no listed branch');
 w.document.getElementById('sanctuaryDismiss').click();w.document.getElementById('sanctuaryClose').click();saved=0;
 assert.equal(pick.value,'');assert(!w.S.digimonBag.owned.includes('patamon'),'Dismiss removes the species from the active collection so it can hatch again');pick.value='agumon';pick.dispatchEvent(new w.Event('change'));assert.equal(w.S.digimonPartner,'agumon');assert.equal(scenePlayers.get(0).look.digimon,'agumon');assert.equal(saved,1);assert.equal(w.S.pets[0].sp,2);
 pick.value='';pick.dispatchEvent(new w.Event('change'));assert.equal(scenePlayers.get(0).look.digimon,undefined);assert.equal(w.S.pets[0].on,true);

 // Real UI actions persist independently of RO pets and require explicit evolution confirmation.
 w.document.getElementById('sanctuaryOpen').click();pick.value='agumon';pick.dispatchEvent(new w.Event('change'));
 assert.equal(w.document.querySelector('[data-sanctuary-action=train]'),null,'training is no longer started from the old window');w.document.getElementById('sanctuaryClose').click();
 const trainer=app.players.get(0),realNowGym=w.Date.now;let gymClock=500000;w.Date.now=()=>gymClock;
 Object.assign(trainer,{x:56,z:30,path:[],sit:false});sceneCallbacks.trainStation('power');assert.match(w.document.querySelector('#sanctuaryWorldStatus span').textContent,/auto-training .*local solo/,'offline solo mode starts labeled local gym practice');w.document.querySelector('#sanctuaryWorldStatus button[data-action="stop"]').click();
 w.S.digimonSanctuary=w.PGDigimonSanctuary.normalize(w.S.digimonSanctuary,'agumon');const soloStats=w.S.digimonSanctuary.partners.agumon.stats,soloCoins=w.S.digimonBag.coins;soloStats.power=12;soloStats.guard=12;
 Object.assign(trainer,{x:70,z:64,path:[],sit:false});sceneCallbacks.trainingNearby(trainer);assert(!w.document.getElementById('sanctuaryBattleNearby').hidden,'solo field exposes its nearby grinding control');assert.equal(w.document.getElementById('sanctuaryBattleNearby').textContent,'Start solo grinding');w.document.getElementById('sanctuaryBattleNearby').click();assert.equal(app.battle.pve.length,1,'solo grinding uses the shared battle simulator');assert.equal(app.battle.pve[0].enemies.length,3);assert.match(w.document.getElementById('sanctuaryBattleHUD').textContent,/SOLO/);for(let i=0;i<40&&app.battle.pve[0]?.wave<2;i++){gymClock+=500;w.battleTick()}assert.equal(app.battle.pve[0]?.wave,2,'local ticks regenerate the next bot group');assert.match(w.document.getElementById('sanctuaryBattleHUD').textContent,/petgold.*Digi-Eggs/,'the live farm HUD tracks coins and egg drops');assert(w.S.digimonBag.coins>soloCoins,'solo wave clears apply labeled local rewards');assert([...app.battleRewards].some(id=>id.startsWith('solo-pve:')),'local reward IDs stay distinct from server battle IDs');w.S.digimonSanctuary.partners.agumon.stats.power=0;w.S.digimonSanctuary.partners.agumon.stats.guard=0;w.document.querySelector('[data-battle-stop="pve"]').click();assert.equal(app.battle.pve.length,0,'solo Stop grinding clears the local run');
 sceneCallbacks.trainingNearby(trainer);w.document.getElementById('sanctuaryBattleNearby').click();assert.equal(app.battle.pve.length,1);w.CLOUD.on=true;w.battleTick();assert.equal(app.battle.pve.length,1,'v388: going online keeps the on-device grind');
 w.document.querySelector('[data-battle-stop="pve"]').click();assert.equal(app.battle.pve.length,0);
 w.CLOUD.user='local_hero';app.socket=socket;app.connected=true;app.room=1;app.id=0;
 sceneCallbacks.trainingNearby(trainer);assert.equal(w.document.getElementById('sanctuaryBattleNearby').textContent,'Start auto-grinding');w.document.getElementById('sanctuaryBattleNearby').click();assert.equal(app.battle.pve.length,1,'v388: online solo grind starts on this device');assert(!sent.some(m=>m.type==='pve_start'),'the plaza is not asked to tick the fight');w.document.querySelector('[data-battle-stop="pve"]').click();assert.equal(app.battle.pve.length,0);
 // v371 (owner): the middle field opens the same panel, and "Keep repeating" starts the next run by itself.
 {
  const panel=w.document.getElementById('sanctuaryActivityPanel');
  Object.assign(trainer,{x:70,z:64,path:[],sit:false});sceneCallbacks.trainingNearby(trainer);
  assert(!panel.hidden,'standing in the middle field opens the grinding panel');
  assert.equal(w.document.getElementById('sapTitle').textContent,'DigiPet · PvE grind');
  // v382: the same tab offers a boss raid, and it asks the room for boss mode explicitly.
  const raidBtn=w.document.querySelector('[data-sap-pve-boss]');
  assert(raidBtn,'the PvE tab offers a boss raid button');
  raidBtn.click();
  assert.equal(app.battle.pve.length,1,'v388: a raid starts on this device');
  assert.equal(app.battle.pve[0].mode,'boss','boss mode is local, not a plaza tick');
  w.document.querySelector('[data-battle-stop="pve"]').click();
  const repeat=w.document.getElementById('sapRepeat');
  assert.equal(repeat.checked,false,'field runs do not repeat until the player asks');
  repeat.checked=true;repeat.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(w.S.plazaRepeat.pve,true,'and the choice is saved with the character');
  socket.onmessage({data:JSON.stringify({type:'pve_end',reason:'complete'})});
  await new Promise(r=>setTimeout(r,2100));
  assert.equal(app.battle.pve.length,1,'the next run starts on this device after a completed one');
  assert(!sent.some(m=>m.type==='pve_start'),'repeat does not wake the plaza');
  repeat.checked=false;repeat.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(w.S.plazaRepeat.pve,false,'and switching it off stops the repeat');
  w.document.querySelector('[data-battle-stop="pve"]')?.click();assert.equal(app.battle.pve.length,0);
  w.battleTick();app.battleIntent=null;sceneCallbacks.trainingNearby(trainer);
 }
 const train=stat=>{const n=sent.length;sceneCallbacks.trainStation(stat);if(sent.slice(n).some(m=>m.type==='gym_start'))socket.onmessage({data:JSON.stringify({type:'gym_started',request:sent.at(-1).request,gym:{room:1,stat,slot:0}})})};
 // Cancel and restart before either server reply: stale acknowledgements cannot claim or release the new reservation.
 Object.assign(trainer,{x:56,z:30,path:[],sit:false});sceneCallbacks.trainStation('power');const oldRequest=sent.at(-1).request;w.document.querySelector('#sanctuaryWorldStatus button[data-action="stop"]').click();sceneCallbacks.trainStation('power');const newRequest=sent.at(-1).request;assert.notEqual(oldRequest,newRequest);socket.onmessage({data:JSON.stringify({type:'gym_started',request:oldRequest,gym:{room:1,stat:'power',slot:0}})});assert.match(w.document.querySelector('#sanctuaryWorldStatus span').textContent,/Reserving/);socket.onmessage({data:JSON.stringify({type:'gym_error',request:oldRequest,message:'stale'})});assert.match(w.document.querySelector('#sanctuaryWorldStatus span').textContent,/Reserving/);socket.onmessage({data:JSON.stringify({type:'gym_started',request:newRequest,gym:{room:1,stat:'power',slot:0}})});assert.match(w.document.querySelector('#sanctuaryWorldStatus span').textContent,/auto-training/);w.document.querySelector('#sanctuaryWorldStatus button[data-action="stop"]').click();Object.assign(trainer,{x:0,z:12,path:[],sit:false});
 Object.assign(trainer,{x:56,z:30,path:[],sit:false});train('power');assert.match(w.document.querySelector('#sanctuaryWorldStatus span').textContent,/auto-training/,'a confirmed gym start shows the running session');
 for(const [stat,x,z] of [['power',56,30],['guard',63,21],['agility',75,26],['focus',86,27]]){
  Object.assign(trainer,{x,z,path:[],sit:false});train(stat);
  // v379: one training indicator, top right. v383 (owner): it is the DigiPet activity meter - a ring
  // per activity - and it opens the activity surface on the tab that matches whatever is running.
  // v384 (owner): the single pill became the DigiPet dock - one chip per running activity, each with
  // its own ring, status line and Stop - so the v379/v383 pill pins are restated here for the dock.
  // (The second ring / second line for a parallel activity is now a second chip; pinned further down.)
  {const dock=w.document.getElementById('digipetDock'),chip=dock.querySelector('.dd-chip[data-dock-kind="gym"]');
   assert(!dock.hidden&&chip,'the top-right dock is the one visible training indicator');
   assert.equal(w.document.getElementById('sanctuaryWorldPill'),null,'the single v379 pill is gone - the dock replaced it');
   assert(chip.querySelector('.dd-ring')&&chip.querySelector('.dd-ring .dd-face'),'the chip meters the activity with a ring around the working partner');
   assert.match(chip.querySelector('.dd-text small').textContent,/training · (\d+:\d\d left|joining)/,'the chip carries the activity line with the live countdown');
   assert.equal(chip.querySelector('.dd-text b').textContent,'Agumon','and names the partner that is training');
   assert.equal(chip.querySelector('[data-dock-open]').dataset.dockOpen,'training','a gym session points its chip at the Training tab');
   assert(/%$/.test(chip.querySelector('.dd-ring').style.getPropertyValue('--progress')),'the training ring shows a live progress value');
   assert(chip.querySelector('.dd-stop[data-gym-stop]'),'the gym chip carries its own Stop');
   for(const tab of w.document.querySelectorAll('#sanctuaryActivityPanel [data-sap-tab]'))assert.equal(typeof tab.onclick,'function','every activity tab owns its click handler');}
  gymClock+=w.PGDigimonSanctuary.DURATION;w.trainingTick();assert.equal(w.S.digimonSanctuary.partners.agumon.stats[stat],1,'one point per automatic '+stat+' cycle');
  w.document.querySelector('#sanctuaryWorldStatus button[data-action="stop"]').click();gymClock+=30000;w.trainingTick();assert.equal(w.S.digimonSanctuary.partners.agumon.stats[stat],1,'stopped session cannot award again');
 }
 assert.equal(w.PGDigimonSanctuary.level(w.S.digimonSanctuary.partners.agumon),2,'four completed sessions earn a level');
 // v349: unattended sessions drain the energy bar; top it up like a Pet Meal would so the long gym scenarios keep running.
 {const topped=w.PGDigimonSanctuary.normalize(w.S.digimonSanctuary);topped.partners.agumon.energy=70;w.S.digimonSanctuary=topped;}
 Object.assign(trainer,{x:56,z:30,path:[],sit:false});train('power');sceneCallbacks.move(57,33);gymClock+=w.PGDigimonSanctuary.DURATION;w.trainingTick();assert.equal(w.S.digimonSanctuary.partners.agumon.stats.power,2,'walking away does not cancel auto-training');
 w.document.getElementById('sanctuaryOpen').click();w.document.querySelector('[data-partner-slot="1"]').click();pick.value='agumon';pick.dispatchEvent(new w.Event('change'));assert.equal(w.S.digimonPartner2,'agumon','duplicate species can occupy the other slot');assert.equal(w.PGDigimonSanctuary.normalize(w.S.digimonSanctuary2).partners.agumon.stats.power,0,'the duplicate has independent progress');train('guard');assert.match(w.document.querySelector('#sanctuaryWorldStatus span').textContent,/Only one partner/,'only one gym session per account');w.document.querySelector('[data-gym-stop]').click();w.document.querySelector('[data-partner-slot="0"]').click();w.document.getElementById('sanctuaryClose').click();
 Object.assign(trainer,{x:56,z:30,path:[],sit:false});train('power');const owner=w.S;w.S={...owner};gymClock+=w.PGDigimonSanctuary.DURATION;w.trainingTick();assert.match(w.document.querySelector('#sanctuaryWorldStatus span').textContent,/account changed/);w.S=owner;gymClock+=30000;w.trainingTick();assert.equal(w.S.digimonSanctuary.partners.agumon.stats.power,2,'account-state replacement cancels without awarding');
 Object.assign(trainer,{x:56,z:30,path:[],sit:false});train('power');const loggedIn=w.currentUser;w.currentUser=null;gymClock+=w.PGDigimonSanctuary.DURATION;w.trainingTick();assert.equal(w.S.digimonSanctuary.partners.agumon.stats.power,2,'logging out cancels before awarding');w.currentUser=loggedIn;
 Object.assign(trainer,{x:56,z:30,path:[],sit:false});train('power');socket.readyState=3;gymClock+=w.PGDigimonSanctuary.DURATION;w.trainingTick();assert.equal(w.S.digimonSanctuary.partners.agumon.stats.power,2,'disconnect cancels before awarding');socket.readyState=1;
 // v371 (owner): the gym is one movable panel - every training stat is picked in it instead of walking
 // to a station, it drags by its header, and "Keep repeating" is a switch that is remembered.
 {
  const panel=w.document.getElementById('sanctuaryActivityPanel'),body=w.document.getElementById('sapBody');
  Object.assign(trainer,{x:56,z:30,path:[],sit:false});sceneCallbacks.trainingNearby(trainer);
  assert(!panel.hidden,'stepping into the gym opens the panel on its own');
  assert.equal(w.document.getElementById('sapTitle').textContent,'DigiPet · Training');
  assert.equal(body.querySelectorAll('[data-gym-stat]').length,4,'every training stat is offered at once');
  body.querySelector('[data-gym-stat="guard"]').click();
  assert.equal(sent.at(-1).type,'gym_start');assert.equal(sent.at(-1).stat,'guard','any stat can be picked from anywhere in the gym');
  socket.onmessage({data:JSON.stringify({type:'gym_started',request:sent.at(-1).request,gym:{room:1,stat:'guard',slot:0}})});
  assert((body.querySelector('[data-gym-stop]')),'the running session shows a stop control in the panel');
  const repeat=w.document.getElementById('sapRepeat');
  assert.equal(repeat.checked,true,'gym auto-training keeps repeating by default');
  repeat.checked=false;repeat.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(w.S.plazaRepeat.gym,false,'and the choice is saved with the character');
  const guardBefore=w.S.digimonSanctuary.partners.agumon.stats.guard;
  gymClock+=w.PGDigimonSanctuary.DURATION;w.trainingTick();
  assert.equal(w.S.digimonSanctuary.partners.agumon.stats.guard,guardBefore+1,'one session still pays its point');
  assert.match(w.document.querySelector('#sanctuaryWorldStatus span').textContent,/Keep repeating is off/,'and then stops instead of rolling straight into the next one');
  assert(body.querySelector('[data-gym-stat="guard"]'),'the panel goes back to the training choices');
  // The header drags the panel; the spot it is dropped in is remembered.
  const head=panel.querySelector('.sap-head'),hubEl=w.document.getElementById('socialHub');
  Object.defineProperties(hubEl,{clientWidth:{configurable:true,get:()=>1280},clientHeight:{configurable:true,get:()=>800}});
  const prect=panel.getBoundingClientRect;panel.getBoundingClientRect=()=>({left:400,top:300,width:274,height:230,right:674,bottom:530});
  const offw=Object.getOwnPropertyDescriptor(w.HTMLElement.prototype,'offsetWidth'),offh=Object.getOwnPropertyDescriptor(w.HTMLElement.prototype,'offsetHeight');
  Object.defineProperty(w.HTMLElement.prototype,'offsetWidth',{configurable:true,get(){return 274}});Object.defineProperty(w.HTMLElement.prototype,'offsetHeight',{configurable:true,get(){return 230}});
  const pd=new w.Event('pointerdown',{bubbles:true});Object.assign(pd,{clientX:420,clientY:310,pointerId:1,preventDefault(){}});head.dispatchEvent(pd);
  const pm=new w.Event('pointermove',{bubbles:true});Object.assign(pm,{clientX:900,clientY:520,pointerId:1,preventDefault(){}});head.dispatchEvent(pm);
  const pu=new w.Event('pointerup',{bubbles:true});Object.assign(pu,{pointerId:1});head.dispatchEvent(pu);
  assert(panel.classList.contains('is-moved'),'dragging drops the centered default');
  assert.equal(panel.style.left,'880px','the panel ends where the pointer left it');
  assert.equal(panel.style.top,'510px','and the height sticks too');
  assert(w.localStorage.getItem('pg_plaza_panel_pos'),'the spot the player chose is remembered');
  panel.getBoundingClientRect=prect;
  if(offw)Object.defineProperty(w.HTMLElement.prototype,'offsetWidth',offw);if(offh)Object.defineProperty(w.HTMLElement.prototype,'offsetHeight',offh);
  // Walking out puts it away; a hand-closed panel does not pop back while the player stays put.
  Object.assign(trainer,{x:0,z:12,path:[],sit:false});sceneCallbacks.trainingNearby(trainer);assert(panel.hidden,'walking away puts the panel away');
  Object.assign(trainer,{x:56,z:30,path:[],sit:false});sceneCallbacks.trainingNearby(trainer);assert(!panel.hidden,'and coming back brings it back');
  w.document.getElementById('sapClose').click();assert(panel.hidden,'the close control hides it');
  sceneCallbacks.trainingNearby(trainer);assert(panel.hidden,'and it does not pop back while the player stays put');
  Object.assign(trainer,{x:0,z:12,path:[],sit:false});sceneCallbacks.trainingNearby(trainer);Object.assign(trainer,{x:56,z:30,path:[],sit:false});sceneCallbacks.trainingNearby(trainer);assert(!panel.hidden,'leaving and re-entering reopens it');
  w.document.getElementById('sapClose').click();repeat.checked=true;repeat.dispatchEvent(new w.Event('change',{bubbles:true}));
 }
 // v372 (owner): ONE popup with three tabs (Training, PvE grind, Logs), and each activity keeps
 // its own partner, so one partner can camp the gym, another farms, a third follows.
 {
  const panel=w.document.getElementById('sanctuaryActivityPanel');
  const tabs=[...panel.querySelectorAll('[data-sap-tab]')];
  assert.equal(tabs.map(t=>t.dataset.sapTab).join(','),'party,training,pve,logs','the panel offers Party, Training, PvE grind and Logs');
  assert.equal(tabs.length,4);
  Object.assign(trainer,{x:56,z:30,path:[],sit:false});sceneCallbacks.trainingNearby(trainer);
  assert.equal(w.document.getElementById('sapTitle').textContent,'DigiPet · Training','standing in the gym fronts the Training tab');
  panel.querySelector('[data-sap-tab="logs"]').click();
  assert.equal(w.document.getElementById('sapTitle').textContent,'DigiPet · Log','the Logs tab is one click away');
  assert.match(panel.querySelector('#sapBody').textContent,/session complete|auto-training/i,'the Logs tab keeps the plaza notices from this session');
  assert(panel.querySelector('.sap-repeat').hidden,'the keep-repeating switch is hidden on the Logs tab');
  panel.querySelector('[data-sap-clear-logs]').click();
  assert.equal(panel.querySelectorAll('.sap-logs li').length,0,'Clear empties the session log');
  assert.equal(panel.querySelector('#sapBody').textContent.includes('Nothing yet'),true,'an empty log says so');
  panel.querySelector('[data-sap-tab="pve"]').click();
  assert.equal(w.document.getElementById('sapTitle').textContent,'DigiPet · PvE grind');
  assert.equal(panel.querySelectorAll('[data-activity-slot]').length,4,'the grind tab lists all four partner slots');
  const slot1Btn=panel.querySelector('[data-activity-slot="1"][data-kind="pve"]');
  assert(slot1Btn&&!slot1Btn.disabled,'partner 2 can be picked for the grind');
  slot1Btn.click();
  assert.equal(w.S.plazaPartners.pve,1,'the grind partner is remembered with the character');
  Object.assign(trainer,{x:70,z:64,path:[],sit:false});sceneCallbacks.trainingNearby(trainer);
  assert(!w.document.getElementById('sanctuaryBattleNearby').hidden,'the grind CTA is offered at the farm');
  w.document.getElementById('sanctuaryBattleNearby').click();
  assert.equal(app.battle.pve.length,1,'v388: grind starts on this device');
  assert.equal(app.battle.pve[0].profile.slot,1,'the grind runs on the partner picked in the panel');
  // A pending grind on partner 2 must not block the gym on partner 1 (or the follower switch).
  const topped=w.PGDigimonSanctuary.normalize(w.S.digimonSanctuary);topped.partners.agumon.energy=70;w.S.digimonSanctuary=topped;
  Object.assign(trainer,{x:56,z:30,path:[],sit:false});
  panel.querySelector('[data-sap-tab="training"]').click();
  // v385: Training and PvE keep independent picks. Switching either tab updates immediately even
  // while another partner owns a running session, instead of pinning the tab to that busy DigiPet.
  const gymPick=k=>panel.querySelector('[data-activity-slot="'+k+'"][data-kind="gym"]');
  assert.equal(gymPick(0).getAttribute('aria-checked'),'true','the gym keeps its own partner instead of inheriting the PvE pick');
  assert.equal(gymPick(1).getAttribute('aria-checked'),'false');
  gymPick(1).click();assert.equal(w.S.plazaPartners.gym,1);assert.equal(gymPick(1).getAttribute('aria-checked'),'true','the training tab switches to partner 2 immediately');
  gymPick(0).click();
  assert.equal(w.S.digimonActiveSlot,0,'picking a gym partner makes it the followed DigiPet');
  assert.equal(gymPick(0).getAttribute('aria-checked'),'true','the gym tab moves its selection with the DigiPet');
  assert.equal(gymPick(1).getAttribute('aria-checked'),'false');
  const before=sent.length;
  panel.querySelector('[data-gym-stat="agility"]').click();
  const gymStart=sent.slice(before).find(m=>m.type==='gym_start');
  assert(gymStart,'the gym still accepts the other partner while one grinds');
  assert.equal(gymStart.slot,0,'the gym request names the gym partner');
  socket.onmessage({data:JSON.stringify({type:'gym_started',request:gymStart.request,gym:{room:1,stat:'agility',slot:0}})});
  gymPick(1).click();assert.equal(gymPick(1).getAttribute('aria-checked'),'true','a running Partner 1 session no longer traps the Training tab on Partner 1');assert.match(panel.querySelector('#sapBody').textContent,/Partner 1 is training Agility/);gymPick(0).click();
  w.document.querySelector('[data-battle-stop="pve"]')?.click();
  // Follower switch rules: a free slot switches freely, while the partner busy in the gym is refused outright.
  w.document.getElementById('sanctuaryOpen').click();
  w.document.querySelector('[data-partner-slot="1"]').click();
  assert.equal(w.S.digimonActiveSlot,1,'a free partner can follow while another one trains in the gym');
  w.document.querySelector('[data-partner-slot="0"]').click();
  assert.equal(w.S.digimonActiveSlot,1,'the busy gym partner cannot be picked as follower');
  assert.match(w.document.getElementById('sanctuaryMessage').textContent,/gym/i,'the refusal says why');
  w.document.getElementById('sanctuaryClose').click();
  w.document.querySelector('[data-gym-stop]').click();
  w.document.getElementById('sanctuaryOpen').click();
  w.document.querySelector('[data-partner-slot="0"]').click();
  assert.equal(w.S.digimonActiveSlot,0,'the partner can follow again once the session stops');
  w.document.getElementById('sanctuaryClose').click();
  app.battleIntent=null;
  w.S.plazaPartners={gym:0,pve:0};
 }
 // v384 (owner screenshots): the top-centre column, the DigiPet dock and the panel rules.
 //  1. the MVP alert covered the battle card      -> every top-centre notice lives in one column;
 //  2. "Start auto-grinding" printed over the text -> the button is a block inside the PvE tab;
 //  3. "[object Object] xp", Partner 1 BUSY while Partner 4 fought, PARTY on an own run, and a
 //     second activity squeezed into one grey line -> one dock chip per running activity.
 {
  const doc=w.document,panel=doc.getElementById('sanctuaryActivityPanel'),dock=doc.getElementById('digipetDock'),stack=doc.getElementById('socialHudStack'),hubEl=doc.getElementById('socialHub'),bar=doc.getElementById('sanctuaryWorldStatus'),B=w.PGDigimonBattle;
  const startBtn=doc.getElementById('sanctuaryBattleNearby'),title=()=>doc.getElementById('sapTitle').textContent;
  const far=()=>{Object.assign(trainer,{x:0,z:12,path:[],sit:false});sceneCallbacks.trainingNearby(trainer)};
  const field=()=>{Object.assign(trainer,{x:70,z:64,path:[],sit:false});sceneCallbacks.trainingNearby(trainer)};
  const gym=()=>{Object.assign(trainer,{x:56,z:30,path:[],sit:false});sceneCallbacks.trainingNearby(trainer)};
  const chip=kind=>dock.querySelector('.dd-chip[data-dock-kind="'+kind+'"]'),kinds=()=>[...dock.querySelectorAll('.dd-chip')].map(c=>c.dataset.dockKind);
  const sub=c=>c.querySelector('.dd-text small').textContent,who=c=>c.querySelector('.dd-text b').textContent,ring=c=>c.querySelector('.dd-ring').style.getPropertyValue('--progress');
  const room=m=>socket.onmessage({data:JSON.stringify(m)});
  // The repeat delay and the notice auto-hide are timers: capture them so the repeat rules can be
  // checked exactly, without sleeping through them.
  const realST=w.setTimeout,realCT=w.clearTimeout,timers=[];
  w.setTimeout=(fn,ms)=>{const t={id:9e8+timers.length,fn,ms,off:false};timers.push(t);return t.id};
  w.clearTimeout=id=>{const t=timers.find(x=>x.id===id);if(t)t.off=true;else realCT(id)};
  const repeatDue=()=>timers.filter(t=>!t.off&&t.ms===1800);
  try{
   for(const id of ['socialActivityStatus','sanctuaryWorldStatus','sanctuaryNearby','sanctuaryBattleHUD'])assert.equal(doc.getElementById(id).parentElement,stack,'#'+id+' is laid out by the top-centre column');
   assert.equal(stack.parentElement,hubEl,'the column belongs to the plaza');assert.equal(dock.parentElement,hubEl,'and so does the dock');
   assert.equal(doc.getElementById('sapMini'),null,'the one-line mini strip inside the panel is gone - the dock chip is that line');
   far();if(!panel.hidden)doc.getElementById('sapClose').click();far();
   assert(panel.hidden&&dock.hidden,'nothing running and nobody near an area: no panel, no dock');
   // Partner 4 fights; partners 1 and 2 stay home.
   doc.getElementById('sanctuaryOpen').click();doc.querySelector('[data-partner-slot="3"]').click();pick.value='palmon';pick.dispatchEvent(new w.Event('change'));
   assert.equal(w.S.digimonPartner4,'palmon','partner 4 holds its own DigiPet');assert.equal(w.S.digimonActiveSlot,3);doc.getElementById('sanctuaryClose').click();
   field();
   assert(!panel.hidden,'standing still in the middle field opens the panel');assert.equal(title(),'DigiPet · PvE grind');
   assert.equal(startBtn.parentElement,panel.querySelector('.sap-pve-action'),'the Start button is a block inside the PvE tab');
   let n=sent.length;startBtn.click();let out=sent.slice(n);
   assert(!out.some(m=>m.type==='pve_start'),'v388: the grind does not wake the plaza');
   assert.equal(app.battle.pve.length,1,'it starts on this device');
   assert.equal(app.battle.pve[0].profile.slot,3,'the run names partner 4');
   const profile=app.battle.pve[0].profile;let run=B.createPve({id:'pve:v384:1',owner:0,room:1,profile,now:gymClock,random:()=>.5});run.slot=0;
   const snap=(extra={})=>room({type:'battle',room:1,at:gymClock,pve:run?[{...B.pveSnapshot(run),...extra}]:[],pvp:null,queue:[]});
   snap();
   let pve=chip('pve');
   assert(pve&&!dock.hidden,'a field grind gets its own dock chip');assert.deepEqual(kinds(),['pve']);
   assert(pve.classList.contains('is-pve'),'tinted as a field grind');
   assert.equal(who(pve),'Palmon','the chip names the partner that is fighting');
   assert.equal(sub(pve),'Stage 1 · wave 1/5 · ◈ 0','and says where the run is');
   assert.equal(pve.querySelector('[data-dock-open]').dataset.dockOpen,'pve','it opens the PvE tab');
   assert.equal(pve.querySelector('.dd-stop[data-dock-stop="pve"]').title,'Stop grinding','and carries its own Stop');
   assert(pve.querySelector('.dd-ring .dd-face:not(.is-empty)'),'the ring wraps the partner portrait');
   run.enemies[0].hp=0;run.earned.coins=12;snap();
   assert.equal(chip('pve'),pve,'a status update rewrites the chip in place - the button under the pointer is never replaced');
   assert.equal(sub(pve),'Stage 1 · wave 1/5 · ◈ 12','the earned petgold is a number (the pill printed "[object Object] xp")');
   assert(!/object/i.test(dock.textContent),'nothing in the dock prints an object');
   assert.equal(ring(pve),(1/run.enemies.length/5*100).toFixed(1)+'%','the ring fills with the stage: one bot of the first of five waves is down');
   // The panel agrees with the dock - and follows the run without a click.
   assert.equal(panel.querySelector('.sap-status b').textContent,'SOLO · GRINDING · STAGE 1','an own run reads SOLO (every online run used to read PARTY)');
   assert.deepEqual([...panel.querySelectorAll('.sap-partner.is-busy')].map(b=>b.dataset.activitySlot),['3'],'only the fighting partner is BUSY (the room lane was read as the partner slot, so Partner 1 was)');
   assert.equal(panel.querySelector('.sap-partner[data-activity-slot="3"]').getAttribute('aria-checked'),'true','and it is the one shown as picked');
   assert.equal(panel.querySelector('[data-pve-stop]').textContent,'Stop grinding','the PvE grind tab has its own explicit Stop button');
   assert(startBtn.hidden,'no Start button while the run is on');
   panel.querySelector('[data-sap-tab="party"]').click();
   assert.deepEqual([...panel.querySelectorAll('.sap-party-row.is-grinding')].map(b=>b.dataset.activitySlot),['3'],'the Party overview shows the same partner grinding');
   panel.querySelector('[data-sap-tab="pve"]').click();
   run.wave=6;snap();
   assert.equal(panel.querySelector('.sap-status b').textContent,'SOLO · GRINDING · STAGE 2','the open tab follows the run to the next stage by itself');
   assert.equal(sub(pve),'Stage 2 · wave 1/5 · ◈ 12');
   assert(B.isBossWave(5));run.wave=5;snap();assert.equal(sub(pve),'Stage 1 · boss fight · ◈ 12','the fifth wave is the stage boss');
   snap({party:true,owner:5,members:[5,0],slots:[{id:5,slot:1},{id:0,slot:3}],profile:{...profile,slot:1}});
   assert.equal(panel.querySelector('.sap-status b').textContent,'PARTY · GRINDING · STAGE 1','a party run reads PARTY');
   assert.deepEqual([...panel.querySelectorAll('.sap-partner.is-busy')].map(b=>b.dataset.activitySlot),['3'],'a party member\'s busy partner is their own, not the leader\'s');
   assert.equal(who(chip('pve')),'Palmon');
   run.wave=1;snap();
   // The battle card is a row in the column, and plaza notices stay readable next to it.
   const card=doc.querySelector('#sanctuaryBattleHUD .sanctuary-battle-hud-card');
   assert(!doc.getElementById('sanctuaryBattleHUD').hidden&&card,'the battle card is up');
   assert.deepEqual([...card.children].map(c=>c.tagName+(c.className?'.'+c.className:'')),['DIV.battle-hud-text','BUTTON'],'text on the left, Stop on the right');
   assert.match(card.textContent,/AUTO-GRINDING · STAGE 1 · WAVE 1\/5/);assert.match(card.textContent,/petgold.*Digi-Eggs/);
   room({type:'battle_error',message:'v384 test notice'});snap();
   assert(!bar.hidden&&/v384 test notice/.test(bar.textContent),'a notice stays readable while a grind runs (the pill hid the bar whenever it was up)');
   // A second activity is a second chip, not a grey line under the first.
   gym();assert(!panel.hidden,'the gym opens the panel too');assert.equal(title(),'DigiPet · Training');
   panel.querySelector('[data-activity-slot="0"][data-kind="gym"]').click();panel.querySelector('[data-gym-stat="power"]').click();
   assert.equal(sent.at(-1).type,'gym_start');room({type:'gym_started',request:sent.at(-1).request,gym:{room:1,stat:'power',slot:0}});
   assert.deepEqual(kinds(),['gym','pve'],'two activities at once are two chips');
   assert.equal(who(chip('gym')),'Agumon');assert.equal(who(chip('pve')),'Palmon','each chip shows its own partner');
   assert.match(sub(chip('gym')),/^Power training · \d+:\d\d left$/);
   for(const c of dock.querySelectorAll('.dd-chip')){assert(/%$/.test(ring(c)),'each chip has its own ring');assert(c.querySelector('.dd-stop'),'and its own Stop')}
   assert(bar.hidden,'a running gym session is shown by its chip, not by a second bar (v379)');
   gymClock+=60000;w.trainingTick();
   assert.equal(ring(chip('gym')),(60000/w.PGDigimonSanctuary.DURATION*100).toFixed(1)+'%','the gym ring is the session clock');
   assert.match(sub(chip('gym')),/^Power training · 4:00 left$/);
   // Panel rules. The tab the player chose is theirs:
   panel.querySelector('[data-sap-tab="logs"]').click();gym();assert.equal(title(),'DigiPet · Log','a running session no longer drags the panel back to its tab');
   panel.querySelector('[data-sap-tab="pve"]').click();gym();assert.equal(title(),'DigiPet · PvE grind','whichever tab that is');
   assert.equal(startBtn.parentElement,stack,'away from the field the Start button is not left behind in the tab');
   panel.querySelector('[data-sap-tab="training"]').click();
   // ...a step inside the area does not close it:
   Object.assign(trainer,{x:58,z:31,path:[{x:60,z:32}],sit:false});sceneCallbacks.trainingNearby(trainer);
   assert(!panel.hidden,'walking around inside the gym keeps the panel (it used to close on the first step)');
   // ...minimize counts as closing it:
   gym();doc.getElementById('sapMin').click();assert(panel.hidden,'minimize puts the panel away');
   gym();assert(panel.hidden,'and it stays away while the player stays in the gym (it used to pop straight back)');
   assert.deepEqual(kinds(),['gym','pve'],'the running activities stay on the dock');
   // ...and a panel opened from the dock is the player's:
   const gymOpen=chip('gym').querySelector('[data-dock-open]');
   assert.equal(gymOpen.getAttribute('aria-expanded'),'false');gymOpen.click();
   assert(!panel.hidden,'a chip opens the panel');assert.equal(title(),'DigiPet · Training','on its own tab');assert.equal(gymOpen.getAttribute('aria-expanded'),'true');
   assert.equal(chip('pve').querySelector('[data-dock-open]').getAttribute('aria-expanded'),'false','only the chip whose tab is showing is marked open');
   far();assert(!panel.hidden,'a panel opened from the dock is not closed by walking away');
   chip('pve').querySelector('[data-dock-open]').click();assert(!panel.hidden);assert.equal(title(),'DigiPet · PvE grind','another chip switches the tab');
   chip('pve').querySelector('[data-dock-open]').click();assert(panel.hidden,'the same chip again puts the panel away');
   // Each Stop ends its own activity.
   n=sent.length;chip('gym').querySelector('[data-dock-stop]').click();
   assert(sent.slice(n).some(m=>m.type==='gym_stop'),'the gym chip stops the gym session');assert.deepEqual(kinds(),['pve'],'and only that chip goes');
   // A panel closed by hand leaves a quiet chip as the way back in.
   gym();assert(!panel.hidden);doc.getElementById('sapClose').click();
   assert.deepEqual(kinds(),['pve','idle'],'closing the panel in the gym leaves a way back on the dock');
   assert.equal(sub(chip('idle')),'Gym · tap to pick a training');assert.equal(chip('idle').querySelector('.dd-stop'),null);
   chip('idle').querySelector('[data-dock-open]').click();assert(!panel.hidden);assert.equal(title(),'DigiPet · Training');assert.deepEqual(kinds(),['pve'],'the shortcut goes once the panel is back');
   far();
   // "Keep repeating" and Stop.
   panel.querySelector('[data-sap-tab="pve"]').click();
   const repeat=doc.getElementById('sapRepeat');repeat.checked=true;repeat.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(w.S.plazaRepeat.pve,true);
   n=sent.length;chip('pve').querySelector('[data-dock-stop]').click();
   assert.equal(sent.at(-1).type,'pve_stop','the grind chip stops a plaza-injected grind');
   room({type:'pve_end',battleId:run.id,reason:'stopped',earned:{...run.earned}});run=null;snap();
   assert.equal(repeatDue().length,0,'a run stopped by hand does not schedule another one, even with Keep repeating on');
   assert.equal(chip('pve'),null,'and its chip goes');assert(doc.getElementById('sanctuaryBattleHUD').hidden);
   // A run that ends by itself does repeat, and the dock keeps its chip (and a Stop) through the gap.
   doc.getElementById('sapClose').click();field();
   n=sent.length;startBtn.click();out=sent.slice(n);assert(!out.some(m=>m.type==='pve_start'));
   run=B.createPve({id:'pve:v384:2',owner:0,room:1,profile:app.battle.pve[0].profile,now:gymClock,random:()=>.5});run.slot=2;snap();
   const ran=who(chip('pve'));assert.equal(ran,'Palmon','the PvE pick stays on partner 4 when the Training tab switches to partner 1');
   room({type:'pve_end',battleId:run.id,reason:'complete',mode:'grind',earned:{...run.earned}});run=null;snap();
   assert.equal(repeatDue().length,1,'a completed run schedules the next one');
   const gap=chip('pve');assert(gap,'the chip stays through the gap between two runs');
   assert.equal(sub(gap),'Next run starting…');assert.equal(who(gap),ran,'still showing the partner whose run just ended');assert.equal(gap.querySelector('.dd-stop').title,'Cancel the next run');
   far();n=sent.length;const due=repeatDue()[0];due.off=true;due.fn();out=sent.slice(n);
   assert(!out.some(m=>m.type==='pve_start'),'the repeat stays on this device even after leaving the middle field');
   assert.equal(app.battle.pve.length,1,'the next run is already running locally');
   run=B.createPve({id:'pve:v384:3',owner:0,room:1,profile:app.battle.pve[0].profile,now:gymClock,random:()=>.5});run.slot=0;snap();
   room({type:'pve_end',battleId:run.id,reason:'defeat',mode:'grind',earned:{...run.earned}});run=null;snap();
   assert.equal(repeatDue().length,1,'a lost run repeats too');
   n=sent.length;chip('pve').querySelector('[data-dock-stop]').click();
   assert.equal(repeatDue().length,0,'Stop on the waiting chip cancels the next run');assert.equal(chip('pve'),null);
   assert.equal(sent.at(-1).type,'pve_stop','Stop during the repeat gap still revokes a plaza-injected permit');assert(!sent.slice(n).some(m=>m.type==='pve_start'));
   repeat.checked=false;repeat.dispatchEvent(new w.Event('change',{bubbles:true}));
   // A ring match: the snapshot has no partner slot, and partners 1 and 2 are the same species.
   if(!panel.hidden)doc.getElementById('sapClose').click();far();
   doc.getElementById('sanctuaryOpen').click();doc.querySelector('[data-partner-slot="1"]').click();doc.getElementById('sanctuaryClose').click();assert.equal(w.S.digimonActiveSlot,1);
   Object.assign(trainer,{x:60,z:104,path:[],sit:false});sceneCallbacks.trainingNearby(trainer);
   assert.equal(startBtn.textContent,'Enter PvP ring');assert(!startBtn.hidden);assert.equal(startBtn.parentElement,stack,'the ring prompt is one more row of the column');
   n=sent.length;startBtn.click();out=sent.slice(n);
   assert.deepEqual(out.map(m=>m.type),['look','pvp_enter']);assert.equal(out[1].profile.slot,1);assert.equal(out[1].profile.lineId,'agumon');
   const mine=out[1].profile,unit=(id,form,hp)=>({id,form,stage:'Rookie',level:1,hp,maxHp:50,boss:false,attackAt:0,hitAt:0});
   room({type:'battle',room:1,at:gymClock,pve:[],queue:[],pvp:{id:'pvp:v384',room:1,phase:'fighting',participants:[{id:0,name:'me',side:'left',accepted:true,profile:{lineId:mine.lineId,form:mine.form,stage:mine.stage,level:mine.level},unit:unit('a',mine.form,50)},{id:9,name:'foe',side:'right',accepted:true,profile:{lineId:'patamon',form:'patamon',stage:'Rookie',level:1},unit:unit('b','patamon',20)}]}});
   const pvp=chip('pvp');
   assert(pvp&&pvp.classList.contains('is-pvp'),'a ring match gets its own chip');assert.equal(sub(pvp),'Ring match · fighting');
   assert.equal(ring(pvp),'60.0%','its ring is the opponent\'s missing HP');
   assert.equal(pvp.querySelector('.dd-stop'),null,'a match is forfeited from its card, never by a stray tap on the dock');
   pvp.querySelector('[data-dock-open]').click();assert.equal(title(),'DigiPet · Party','it opens the Party overview');
   assert.deepEqual([...panel.querySelectorAll('.sap-party-row.is-pvp')].map(b=>b.dataset.activitySlot),['1'],'the partner that entered the ring is the busy one, not its same-species twin in slot 1');
   room({type:'battle',room:1,at:gymClock,pve:[],queue:[],pvp:null});
   assert.equal(chip('pvp'),null);assert(dock.hidden,'the dock goes when nothing is running');
   doc.getElementById('sapClose').click();far();
   doc.getElementById('sanctuaryOpen').click();doc.querySelector('[data-partner-slot="0"]').click();doc.getElementById('sanctuaryClose').click();
   assert.equal(w.S.digimonActiveSlot,0);app.battleIntent=null;w.S.plazaPartners={gym:0,pve:0};
  }finally{w.setTimeout=realST;w.clearTimeout=realCT}
 }
 w.CLOUD.on=false;w.CLOUD.user=null;app.socket=null;app.connected=false;app.room=0;w.Date.now=realNowGym;
 assert.equal(w.S.pets[0].sp,2,'gym never modifies the Ragnarok pet');w.S.digimonSanctuary.partners.agumon.stats.power=4;w.S.digimonSanctuary.partners.agumon.wins=2;w.S.digimonSanctuary.partners.agumon.xp=116;w.S.digimonBag.evoPoints=20;w.document.getElementById('sanctuaryOpen').click();
 w.document.querySelector('[data-sanctuary-action=requestEvolution]').click();assert.equal(w.S.digimonSanctuary.partners.agumon.stage,0);assert.match(w.document.getElementById('sanctuaryEvolutionView').textContent,/Possible: /,'the confirm step lists the rolled pool in the evolution view');
 // v349: the branch is rolled. Pin both randomness sources to the first option (Greymon).
 const realRandom=w.Math.random.bind(w.Math),realGetValues=w.crypto?.getRandomValues?.bind(w.crypto);w.Math.random=()=>0;if(w.crypto?.getRandomValues)w.crypto.getRandomValues=arr=>{arr[0]=0;return arr};
 w.document.querySelector('[data-sanctuary-action=evolve]').click();w.Math.random=realRandom;if(realGetValues)w.crypto.getRandomValues=realGetValues;
 assert.equal(w.S.digimonSanctuary.partners.agumon.stage,1);assert.equal(scenePlayers.get(0).look.digimon,'greymon');assert.equal(w.S.pets[0].sp,2);w.document.getElementById('sanctuaryClose').click();
 w.sessionTick();w.S.auraShow=false;w.sessionTick();assert.equal(scenePlayers.get(0).look.lv,0,'the Display aura switch also hides it in the plaza');w.S.auraShow=true;w.sessionTick();
 // v355: plaza mini-map, big map dialog and music player mount.
 {
  const mini=w.document.getElementById('socialMiniMap'),modal=w.document.getElementById('socialMapModal'),mount=w.document.getElementById('socialBgmMount');
  assert(mini&&mini.querySelector('#socialMiniMapCanvas'),'the corner mini-map is a button with a live canvas');
  assert(modal.hidden,'the big map starts closed');
  mini.click();assert(!modal.hidden,'clicking the mini-map opens the big map');
  w.document.getElementById('socialMapClose').click();assert(modal.hidden,'the big map closes');
  // v359 (owner: "I want the BGM permanent and the toggle removed"): the player bar is
  // hub chrome - always visible while the hub is open, with no toolbar toggle.
  assert(!mount.hidden,'the music player bar is visible with the hub');
  assert(!w.document.getElementById('socialBgmBtn'),'the music toolbar toggle is gone');
  // A drawable stub canvas proves the painter covers the shared geometry and every live player.
  const ops=[];let fill=0;
  const ctx=new Proxy({fillRect(){ops.push('rect')},strokeRect(){ops.push('rect')},arc(){ops.push('arc')},beginPath(){ops.push('begin')},moveTo(){},lineTo(){},closePath(){},fill(){fill++},stroke(){},clearRect(){},setLineDash(){},fillText(t){ops.push('text:'+t)},strokeText(){}},{get:(t,k)=>k in t?t[k]:()=>{}});
  const canvas={width:640,height:640,getContext:()=>ctx};
  w.PGSocial.drawPlazaMap(canvas,true);
  assert(ops.some(o=>String(o).startsWith('text:WEST LAKE')),'the big map labels the fishing lake');
  assert(ops.some(o=>String(o).startsWith('text:DIGIPET FARM')),'the big map labels the DigiPet farm');
  assert(ops.some(o=>String(o).startsWith('text:PVP RING')),'the big map labels the PvP ring');
  assert(ops.some(o=>String(o).startsWith('text:PRONTERA POKER')),'the big map labels the poker tables');
  assert(ops.includes('text:You'),'the self marker is labelled on the big map');
  assert(fill>8,'the map paints its geometry');
 }
 // v355/v357: the party panel exists, is tabbed (grind party vs PvP ring lobby) and solo
 // mode explains that both need an online plaza.
 {
  const btn=w.document.getElementById('socialPartyBtn'),pvpBtn=w.document.getElementById('socialPvpBtn'),panel=w.document.getElementById('socialPartyPanel');
  // v358: one Party button replaces the separate Grind and PvP buttons; the panel keeps a
  // single inner tab strip and no second header strip.
  assert(btn&&panel,'the Party button and panel exist');
  assert(!pvpBtn,'the separate PvP button is gone');
  assert.match(btn.textContent,/party/i,'the button is labelled Party');
  assert(!w.document.getElementById('socialPartyTabPve')&&!w.document.getElementById('socialPartyTabPvp'),'no header tab strip duplicates the inner one');
  assert(panel.hidden,'the party panel starts closed');
  btn.click();assert(!panel.hidden,'the Party button opens the panel');
  assert.match(w.document.getElementById('socialPartyBody').textContent,/GRIND PARTY/i,'the PvE tab is shown first');
  const tabs=w.document.querySelectorAll('#socialPartyBody [data-party-tab]');
  assert.equal(tabs.length,2,'the inner tab strip carries both sections');
  tabs[1].click();assert(!panel.hidden,'switching tabs keeps the panel open');
  assert.match(w.document.getElementById('socialPartyBody').textContent,/PVP RING LOBBY/i,'the ring lobby tab renders');
  assert(!/GRIND PARTY ·/.test(w.document.getElementById('socialPartyBody').textContent),'only one tab renders at a time');
  assert.match(w.document.getElementById('socialPartyBody').textContent,/online plaza/i,'solo mode explains the online requirement');
  w.document.getElementById('socialPartyClose').click();assert(panel.hidden,'the party panel closes');
 }
 sceneCallbacks.move(6,12);assert(scenePlayers.get(0).path.length>0,'solo click-to-walk computes local path');
 w.document.getElementById('socialSit').click();assert.equal(scenePlayers.get(0).sit,true,'solo sit button toggles sitting');
 assert.equal(w.document.getElementById('socialSit').getAttribute('aria-pressed'),'true');
 w.CLOUD.on=true;w.CLOUD.user='new';w.CLOUD.previewToken='tok_abc';app.nextConnect=0;
 let wsUrl='';w.WebSocket=class{constructor(u){wsUrl=u;socket=this;this.readyState=1;this.sent=[]}close(){}send(m){this.sent.push(JSON.parse(m))}};
 await w.PGSocial.enter();w.sessionTick();assert.match(wsUrl,/\?preview_session=tok_abc$/);
 socket.onmessage({data:JSON.stringify({type:'hello',id:9,history:[]})});
 socket.onmessage({data:JSON.stringify({type:'room',room:1,players:[{id:9,name:'new',room:1,x:0,z:12,dir:0,sit:false,seat:null,path:[],look:{cls:'Novice',appearance:{version:1,sex:'m'},refine:0,title:''}}]})});
 assert.equal(scenePlayers.has(0),false,'multiplayer room join replaces solo placeholder');
 // v362: the page compares the Worker's plaza fingerprint the moment a room opens, and says so
 // clearly instead of leaving a stale deployment to surface as rubber-banded walks and dead seats.
 {const el=w.document.getElementById('sanctuaryWorldStatus'),txt=()=>el.querySelector('span').textContent;
  const payload=rules=>({type:'room',room:1,...(rules?{rules}:{}),players:[{id:9,name:'new',room:1,x:0,z:12,dir:0,sit:false,seat:null,path:[],look:{cls:'Novice',appearance:{version:1,sex:'m'},refine:0,title:''}}]});
  app.rulesNoticed=false;el.hidden=true;
  socket.onmessage({data:JSON.stringify(payload(w.PGSocialRules.rulesFingerprint()))});
  assert(el.hidden,'a matching Social Worker fingerprint raises no notice');
  app.rulesNoticed=false;el.hidden=true;
  socket.onmessage({data:JSON.stringify(payload('20/15/8/6/0/104/1/1'))});
  assert(!el.hidden&&/Plaza mismatch/.test(txt()),'a stale Social Worker fingerprint is announced the moment the room opens: '+txt());
  app.rulesNoticed=false;el.hidden=true;
  socket.onmessage({data:JSON.stringify(payload(null))});
  assert(!el.hidden&&/older than the page/.test(txt()),'a fingerprint-less pre-v362 Social Worker is announced as older: '+txt());
 }
 assert.equal(scenePlayers.get(9).name,'new');assert.equal(sceneCallbacks.self(),9);
 pick.value='agumon';pick.dispatchEvent(new w.Event('change'));assert(socket.sent.some(m=>m.type==='look'&&m.look.digimon==='greymon'),'evolved choice broadcasts as a presentation hint');

 // v236: a socket that stops answering is spotted and replaced, and the server's planned
 // re-authentication keeps the plaza on screen and trusts the server-preserved seat.
 let liveDate=1e12;const realNow=Date.now;w.Date.now=()=>liveDate;
 const sockets=[];w.WebSocket=class{constructor(){sockets.push(this);socket=this;this.readyState=1;this.sent=[];this.closed=null}close(){this.readyState=3;this.closed=(this.closed??'client')}send(m){this.sent.push(JSON.parse(m))}};
 socket.onmessage({data:JSON.stringify({type:'room',room:1,players:[{id:9,name:'new',room:1,x:0,z:12,dir:0,sit:true,seat:3,path:[],look:{cls:'Novice',appearance:{version:1,sex:'m'},refine:0,title:''}}]})});
 app.connected=true;app.id=9;app.room=1;app.lastSeen=liveDate;
 const before=sockets.length;
 w.sessionTick();w.sessionTick();assert.equal(sockets.length,before,'a socket that is still answering is left alone');
 assert(!socket.sent.some(m=>m.type==='ping'),'no 2-second idle ping spam inside the 20s watchdog window');
 liveDate+=250000;w.sessionTick();assert(socket.sent.at(-1).type==='ping','v388: a sitter waits four minutes of silence before one probe ping');
 assert.equal(socket.sent.filter(m=>m.type==='ping').length,1,'exactly one probe ping is sent while waiting for pong');
 assert.equal(sockets.length,before,'the probe does not reconnect on its own');
 liveDate+=7000;w.sessionTick();assert.equal(app.socket,null,'an unanswered probe drops the dead socket');
 assert.equal(app.room,1,'the plaza stays on screen while the dead socket is replaced');
 assert.equal(app.resume.seat,3,'the seat survives the replacement');
 w.sessionTick();assert.equal(sockets.length,before+1,'a dead socket is replaced within one beat');
 socket.onmessage({data:JSON.stringify({type:'hello',id:9,history:[]})});
 socket.onmessage({data:JSON.stringify({type:'room',room:1,players:[{id:9,name:'new',room:1,x:0,z:12,dir:0,sit:true,seat:3,path:[],look:{cls:'Novice',appearance:{version:1,sex:'m'},refine:0,title:''}}]})});
 assert(!socket.sent.some(m=>m.type==='seat'&&m.id===3),'a server-preserved bench is not requested again (no duplicate walk/stand); the snapshot is authoritative');
 assert.equal(app.resume,null,'the saved seat is used once');
 // A planned refresh is the server's 4000 close: reconnect at once, no failure message, no reset.
 app.room=1;app.lastSeen=liveDate;socket.onmessage({data:JSON.stringify({type:'reauth'})});
 assert.equal(app.socket,null,'the reauth notice drops the socket before the server closes it');
 assert.equal(app.room,1,'a planned refresh does not empty the plaza');
 liveDate+=1000;w.sessionTick();assert.equal(sockets.length,before+2,'a planned refresh reconnects immediately');
 const player=[{id:9,name:'new',room:1,x:0,z:12,dir:0,sit:true,seat:3,path:[],look:{cls:'Novice',appearance:{version:1,sex:'m'},refine:0,title:''}}];
 socket.onmessage({data:JSON.stringify({type:'hello',id:9,history:[]})});
 socket.onmessage({data:JSON.stringify({type:'room',room:1,players:player})});
 assert.equal(app.connected,true);assert(!socket.sent.some(m=>m.type==='seat'&&m.id===3),'the reconnect keeps the authoritative bench without a second seat command');
 // ...and the same close arriving without the notice (a server on the older build) behaves the same.
 socket.onclose({code:4000});
 assert.equal(app.room,1,'a 4000 close keeps the plaza on screen too');
 assert.equal(app.connected,false);
 assert.equal(app.resume.seat,3,'a 4000 close remembers the bench');
 assert(!/unavailable/i.test(w.document.getElementById('socialConnection').textContent),'a planned refresh is never reported as a failure');
 assert.equal(app.nextConnect,0,'a planned refresh does not back off');
 w.WebSocket=class{constructor(u){wsUrl=u;socket=this;this.readyState=1;this.sent=[]}close(){}send(m){this.sent.push(JSON.parse(m))}};
 w.Date.now=realNow;
 // v265: Activity log (`hide-feed` / `S.feedShow===false`) hides only the Log tab and never
 // hides World/Whisper/Local player chat; Chat box (`hide-chat`) hides chat on the field while
 // keeping Fountain Plaza (`social-open`) chat accessible.
 const cssTag=w.document.createElement('style');
 cssTag.textContent=fs.readFileSync('assets/social.css','utf8');
 w.document.head.append(cssTag);
 w.PGSocial.leave();
 w.S.feedShow=true;w.document.body.classList.remove('hide-feed','hide-chat','clean-screen','social-open');
 w.PGSocial.syncDisplay();
 assert(w.document.querySelector('#socialTabs [data-channel="log"]'),'Log tab renders when Activity log is enabled');
 w.PGSocial.select('log');assert.equal(app.channel,'log');
 w.S.feedShow=false;w.document.body.classList.add('hide-feed');
 w.PGSocial.syncDisplay();
 assert.equal(w.getComputedStyle(chat).display,'flex','unchecking Activity log never hides the chat box');
 assert.equal(w.document.querySelector('#socialTabs [data-channel="log"]'),null,'unchecking Activity log removes only the Log tab');
 assert.equal(app.channel,'world','hiding Activity log switches active channel off log to world');
 app.room=1;app.channel='log';w.PGSocial.syncDisplay();
 assert.equal(app.channel,'local','hiding Activity log inside a plaza room switches off log to local');
 app.room=0;w.S.feedShow=true;w.document.body.classList.remove('hide-feed');w.PGSocial.syncDisplay();
 assert(w.document.querySelector('#socialTabs [data-channel="log"]'),'re-enabling Activity log restores the Log tab');
 w.document.body.classList.add('hide-chat');
 assert.equal(w.getComputedStyle(chat).display,'none','Chat box toggle hides #socialChat on the field');
 w.document.body.classList.add('social-open');
 assert.equal(w.getComputedStyle(chat).display,'flex','Fountain Plaza keeps #socialChat visible even when field chat is hidden');
 w.document.body.classList.add('clean-screen');
 assert.equal(w.getComputedStyle(chat).display,'none','clean-screen hides #socialChat everywhere');
 w.document.body.classList.remove('hide-chat','social-open','clean-screen');
 // ---- v313: Local chat survives a reconnect, and a quiet socket is asked, not killed ----
 {
  let now=2e12;const realNow2=Date.now;w.Date.now=()=>now;
  const made=[];w.WebSocket=class{constructor(){made.push(this);socket=this;this.readyState=1;this.sent=[]}close(){this.readyState=3}send(m){this.sent.push(JSON.parse(m))}};
  app.scene={...(app.scene||{}),bubble:()=>{},putPlayer:()=>{},removePlayer:()=>{},updatePoker:()=>{}};
  w.CLOUD.on=true;w.CLOUD.user='local-tester';w.CLOUD.previewToken='';
  app.socket=null;app.connected=false;app.room=0;app.rooms=[];app.nextConnect=0;app.retry=0;app.lastSeen=now;app.messages=[];
  const hello=()=>socket.onmessage({data:JSON.stringify({type:'hello',id:21,history:[]})});
  const room=id=>socket.onmessage({data:JSON.stringify({type:'room',room:id,players:[{id:21,name:'local-tester',room:id,x:0,z:12,dir:0,sit:false,seat:null,path:[],look:{cls:'Novice',appearance:{version:1,sex:'m'},refine:0,title:''}}]})});
  const say=(from,body,roomId)=>socket.onmessage({data:JSON.stringify({type:'message',id:900+from,at:now,from,name:'Talker '+from,channel:'local',room:roomId,body})});
  w.sessionTick();hello();room(3);
  assert.equal(app.room,3);
  say(31,'anyone fishing at the south pond?',3);
  w.PGSocial.select('local');
  assert.match(w.document.getElementById('socialLines').textContent,/anyone fishing at the south pond/,'the Local line is on screen');
  // A dropped socket reconnects into the same plaza: the room snapshot must not wipe what was said.
  socket.onclose({code:1006});assert.equal(app.room,0);
  now+=2000;w.sessionTick();hello();room(3);
  assert.equal(app.room,3);
  assert.ok(app.messages.some(m=>m.channel==='local'&&/south pond/.test(m.body)),'a reconnect keeps the Local history it was showing');
  w.PGSocial.select('local');
  assert.match(w.document.getElementById('socialLines').textContent,/anyone fishing at the south pond/,'and keeps it on screen');
  // Changing plaza really does change the conversation - and coming back brings its own lines with it.
  room(4);
  assert.ok(!app.messages.some(m=>m.channel==='local'),'another plaza does not inherit the last one\'s chat');
  say(41,'plaza 4 roll call',4);
  w.PGSocial.select('local');assert.match(w.document.getElementById('socialLines').textContent,/plaza 4 roll call/);
  room(3);
  assert.ok(app.messages.some(m=>m.channel==='local'&&/south pond/.test(m.body)),'walking back to plaza 3 shows its own lines again');
  assert.ok(!app.messages.some(m=>/plaza 4 roll call/.test(m.body)),'and not the other plaza\'s');
  // Coming back to a tab asks the socket whether it is alive instead of dropping it on the spot.
  const beforeSockets=made.length;socket.sent.length=0;
  app.lastSeen=now-30000;
  Object.defineProperty(w.document,'hidden',{configurable:true,get:()=>false});
  w.document.dispatchEvent(new w.Event('visibilitychange'));
  assert.equal(made.length,beforeSockets,'a quiet socket is not thrown away on tab focus');
  assert.equal(socket.sent.filter(m=>m.type==='ping').length,1,'it is probed once');
  assert.notEqual(w.document.getElementById('socialConnection').textContent.includes('disconnected'),true,'and nothing claims it is disconnected while it answers');
  socket.onmessage({data:JSON.stringify({type:'pong'})});
  assert.equal(app.connected,true);
  // A socket that opens but never says hello is replaced instead of waiting forever.
  app.socket=null;app.connected=false;app.nextConnect=0;app.retry=0;now+=1000;w.sessionTick();
  const stuck=socket;
  now+=13000;w.sessionTick();
  assert.notEqual(app.socket,stuck,'a socket that never completes the handshake is replaced');
  assert.ok(app.nextConnect>now,'and the replacement waits its turn instead of spinning');
  w.Date.now=realNow2;
  app.socket=null;app.connected=false;app.nextConnect=0;app.room=0;
 }
 // ---- v326 (owner: "random disconnect, I lose local chat but world chat is fine") ----
 // A reload in the same tab is what really loses it: this page reloads itself when a build goes live
 // (v276), and Local used to live only in a variable. It is now mirrored into THIS TAB's sessionStorage
 // - never localStorage, never shared, never sent to the server - so the same tab keeps reading the
 // plaza it was in.
 {
  const lines=[{channel:'local',room:3,from:31,name:'Talker 31',at:2e12,id:'saved-1',body:'the fountain is lovely tonight'},
               {channel:'local',room:3,from:32,name:'Talker 32',at:2e12+1,id:'saved-2',body:'meet at the south pond'},
               {channel:'world',room:0,from:33,name:'Talker 33',at:2e12+2,id:'saved-3',body:'world line'}];
  app.user='local-tester';
  // What the old page leaves behind for the new one: this tab's sessionStorage, and nothing on disk.
  w.sessionStorage.setItem('pg_social_local_v1_local-tester_3',JSON.stringify(lines));
  for(const k of ['saved-1','saved-2','saved-3'])
   assert.equal(w.localStorage.getItem(k),null,'Local chat is never written to localStorage');
  assert.equal([...Array(w.localStorage.length)].map((_,i)=>w.localStorage.key(i)).filter(k=>k.startsWith('pg_social_local')&&!k.startsWith('pg_social_world')).length,0,
   'only the World cache uses local storage');
  const reload=new JSDOM('<div id="view"><div id="feedWrap"></div><div id="minimapTools"><button id="socialHubBtn" type="button"><b id="socialHubBadge" hidden>0</b></button></div></div>',{url:'http://localhost/',runScripts:'outside-only'});
  const w2=reload.window;
  let socket2;w2.WebSocket=class{constructor(){socket2=this;this.readyState=1;this.sent=[]}close(){}send(m){this.sent.push(JSON.parse(m))}};
  Object.assign(w2,{CLOUD:{on:true,user:'local-tester'},S:{cls:'Novice',eq:{}},tabs:[],wardrobeAppearance:()=>({version:1,sex:'m'}),logShown:()=>[],openTab:()=>{},HUNT_TITLES:[],titleUnlocked:()=>true,setInterval:()=>0,PGSocialScene:{}});
  w2.sessionStorage.setItem('pg_social_local_v1_local-tester_3',w.sessionStorage.getItem('pg_social_local_v1_local-tester_3'));
  w2.eval(fs.readFileSync('assets/digimon/roster.js','utf8'));w2.eval(fs.readFileSync('assets/digimon/base-stats.js','utf8'));
  w2.eval(fs.readFileSync('assets/social-rules.js','utf8'));
  w2.eval(fs.readFileSync('assets/social.js','utf8'));
  const app2=w2.PGSocial.app;app2.room=0;app2.messages=[];
  socket2.onmessage({data:JSON.stringify({type:'hello',id:41,history:[]})});
  socket2.onmessage({data:JSON.stringify({type:'room',room:3,players:[]})});
  w2.PGSocial.select('local');
  const shown=w2.document.getElementById('socialLines').textContent;
  assert.match(shown,/the fountain is lovely tonight/,'after a reload the same tab still shows the plaza conversation');
  assert.match(shown,/meet at the south pond/);
  assert.ok(!shown.includes('world line'),'and only this plaza Local lines, not the World cache');
  // Another account in the same tab never inherits it: the key is account-scoped, and a real account
  // switch also empties the in-memory cache (the session tick does that, covered above).
  assert.equal(w2.sessionStorage.getItem('pg_social_local_v1_someone-else_3'),null,
   'the kept transcript is scoped to the account that saw it');
  reload.window.close();
 }
 // A network that comes back reconnects at once instead of finishing the 30-second backoff ladder,
 // and a network that goes away says so instead of claiming it is retrying a connection that is gone.
 {
  const realNow3=Date.now;const now3=realNow3()+3600e3;w.Date.now=()=>now3;
  const made=[];w.WebSocket=class{constructor(){made.push(this);socket=this;this.readyState=1;this.sent=[]}close(){this.readyState=3}send(m){this.sent.push(JSON.parse(m))}};
  w.CLOUD.on=true;w.CLOUD.user='local-tester';w.CLOUD.previewToken='';
  app.blocked=false;app.retry=4;app.room=0;app.connected=false;
  const dead={readyState:3,close(){},send(){}};app.socket=dead;app.nextConnect=now3+28000;app.wanted=true;
  w.dispatchEvent(new w.Event('online'));
  assert.equal(app.socket!==dead,true,'coming back online does not keep riding the dead socket');
  assert.equal(made.length,1,'and connects immediately instead of waiting out the backoff');
  assert.equal(app.retry,0,'the ladder starts over');
  // The same must not fight the "moved to another tab" block: that socket is never re-opened.
  app.blocked=true;const blockedSockets=made.length;app.socket=dead;app.nextConnect=now3+28000;
  w.dispatchEvent(new w.Event('online'));
  assert.equal(made.length,blockedSockets,'a blocked account is left alone');
  app.blocked=false;
  // Losing the network is stated plainly while the socket is up.
  app.socket={readyState:1,close(){},send(){}};
  w.dispatchEvent(new w.Event('offline'));
  assert.match(w.document.getElementById('socialConnection').textContent,/offline/i,'going offline is named, not called a retry');
  w.Date.now=realNow3;app.socket=null;app.connected=false;app.nextConnect=0;app.wanted=false;
 }
 // ---- v319: the field Social Hub button counts the plaza without entering it ----
 {
  const hubBtn=w.document.getElementById('socialHubBtn'),hubBadge=w.document.getElementById('socialHubBadge');
  assert.ok(hubBtn&&hubBadge,'the harness carries the field Social Hub button');
  app.socket=null;app.connected=false;app.room=0;app.rooms=[];app.plazaFriends=0;
  const popSockets=[];w.WebSocket=class{constructor(){popSockets.push(this);socket=this;this.readyState=1;this.sent=[]}close(){this.readyState=3}send(m){this.sent.push(JSON.parse(m))}};
  w.CLOUD.on=true;w.CLOUD.user='local-tester';w.CLOUD.previewToken='';app.nextConnect=0;app.retry=0;app.blocked=false;
  w.sessionTick();assert.equal(popSockets.length,1,'the field button rides the existing chat socket');
  socket.onmessage({data:JSON.stringify({type:'hello',id:31,history:[]})});
  socket.onmessage({data:JSON.stringify({type:'rooms',rooms:[{id:1,count:8},{id:2,count:4}],plaza:{total:12,friends:2}})});
  assert.equal(hubBadge.hidden,false);assert.equal(hubBadge.textContent,'12','the badge totals every Plaza room');
  assert.ok(hubBtn.classList.contains('is-live')&&hubBtn.classList.contains('has-friends'),'a busy plaza with a friend inside gets the gold pulse');
  assert.match(hubBtn.getAttribute('aria-label'),/12 adventurers inside/);
  assert.match(hubBtn.getAttribute('aria-label'),/2 friends inside/);
  assert.match(hubBtn.title,/Prontera 1: 8 · Prontera 2: 4/,'the tooltip breaks the total down per plaza');
  socket.onmessage({data:JSON.stringify({type:'rooms',rooms:[{id:1,count:0}],plaza:{total:0,friends:0}})});
  assert.equal(hubBadge.textContent,'0');assert.ok(hubBtn.classList.contains('is-empty')&&!hubBtn.classList.contains('is-live'),'an empty plaza shows a still 0, no blink');
  hubBtn.click();
  assert.equal(w.document.body.classList.contains('social-open'),true,'one click enters Fountain Plaza directly');
  w.PGSocial.leave();
  assert.equal(w.document.body.classList.contains('social-open'),false,'leaving the plaza restores the field');
  socket.onclose({code:1006});
  assert.equal(hubBadge.hidden,true,'losing the chat socket hides the badge instead of freezing a stale count');
  app.socket=null;app.connected=false;
 }
 // v324 (owner: the Fountain Plaza card was cut off on phones with no way down): the
 // panel wrapper must be a REAL scroller - a content-fit box with overflow-y:auto
 // swallows touch pans and its overscroll-behavior:contain blocks the chain to the
 // window body - and the destination card must keep its height inside the capped
 // flex column so the panel scrolls instead of compressing the card.
 {
  const panelCss=fs.readFileSync('assets/social.css','utf8');
  assert.match(panelCss,/#wins \.social-panel\{[^}]*max-height:100%;[^}]*overflow-y:auto;overscroll-behavior:contain[^}]*\}/,'the Social Hub panel is height-capped so its own overflow-y:auto actually scrolls');
  assert.match(panelCss,/#wins \.social-destination\{[^}]*flex:none;[^}]*\}/,'the destination card keeps its height so the panel scrolls instead of compressing the card');
 }

 // MVP integration: exercise the actual receive() router and fishing module together. A first live
 // event keeps the red Fishing banner and one Local notice; the duplicate blue activity/HUD alert is absent.
 {
  w.eval(fs.readFileSync('assets/social-fishing.js','utf8'));
  const F=w.PGSocialFishing;
  F.bind({host:()=>w.S,scene:()=>null,notice:t=>{},mvpNotice:w.PGSocial.fishingMvpNotice,save:()=>{}});
  app.room=1;app.wanted=true;
  const chat=d=>w.document.querySelectorAll('#socialLines .social-notice').length;
  const events=()=>w.PGSocial.activityLog().length;
  const blueHud=()=>w.document.querySelector('#sanctuaryWorldStatus span')?.textContent||'';
  const baseChat=chat(),baseEvents=events(),baseHud=blueHud(),now=Date.now();
  const spawn={type:'mvp_spawn',room:1,sp:'mvp_stormcoil',id:'mvp:notice:one',spawnedAt:now,endsAt:now+600000,serverNow:now,snapshot:false};
  w.PGSocial.receive(spawn);
  w.PGSocial.receive({...spawn,snapshot:true,endsAt:now+900000,serverNow:now+1000});
  w.PGSocial.receive(spawn);
  assert.equal(chat()-baseChat,1,'live spawn plus duplicate snapshots add one Local notice');
  assert.equal(events()-baseEvents,0,'MVP spawn does not add a duplicate activity/HUD announcement');
  assert.equal(blueHud(),baseHud,'the blue transient status is not overwritten by an MVP spawn');
  assert.equal(w.document.querySelector('#socialHudStack > #fishingMvpBanner')?.hidden,false,'the red Fishing MVP banner remains visible');
  assert.match(fs.readFileSync('assets/social.css','utf8'),/#fishingMvpBanner\{[^}]*background:linear-gradient\(180deg,#3a1220/,'the retained banner uses its red style');
  assert.equal(F.getMvp().endsAt,now+600000,'a duplicate snapshot cannot extend authoritative endsAt');
  const despawn={type:'mvp_despawn',room:1,sp:'mvp_stormcoil',id:spawn.id,serverNow:now+2000};
  w.PGSocial.receive(despawn);w.PGSocial.receive(despawn);
  assert.equal(chat()-baseChat,2,'duplicate despawn adds only one Local expiry notice');
  assert.equal(events()-baseEvents,0,'MVP despawn does not restore the duplicate blue activity/HUD alert');
  assert.equal(blueHud(),baseHud,'MVP despawn leaves the blue transient status untouched');
  w.PGSocial.receive({...spawn,snapshot:true,serverNow:now+3000});
  assert.equal(F.getMvp(),null,'a despawned snapshot cannot resurrect the encounter');
  assert.equal(chat()-baseChat,2,'replayed despawned spawn adds no new chat notice');
  const superseded={...spawn,id:'mvp:notice:superseded',spawnedAt:now+3000,endsAt:now+603000,serverNow:now+3000,snapshot:false};
  const successor={...spawn,id:'mvp:notice:successor',spawnedAt:now+4000,endsAt:now+604000,serverNow:now+4000,snapshot:false};
  w.PGSocial.receive(superseded);w.PGSocial.receive(successor);
  const afterSuccessor={chat:chat(),events:events()};
  w.PGSocial.receive({...superseded,snapshot:true,serverNow:now+5000});
  assert.equal(F.getMvp().id,successor.id,'a superseded spawn snapshot cannot replace the newer encounter');
  assert.equal(chat(),afterSuccessor.chat,'superseded replay produces no Local announcement');
  assert.equal(events(),afterSuccessor.events,'superseded replay produces no activity/HUD announcement');
  const expired={...spawn,id:'mvp:notice:expired',spawnedAt:now-700000,endsAt:now-100000,serverNow:now,snapshot:false};
  w.PGSocial.receive(expired);w.PGSocial.receive(expired);
  assert.equal(F.getMvp().id,successor.id,'an expired spawn replay never replaces the newer active encounter');
  assert.equal(chat(),afterSuccessor.chat,'expired spawn replay adds no chat notice');
  // A room handoff hides the old banner silently; an old delayed event is ignored, and a valid
  // room-2 snapshot restores the correct banner without another announcement.
  const roomSpawn={...spawn,id:'mvp:notice:room-one',spawnedAt:now+8000,serverNow:now+8000,endsAt:now+608000};
  w.PGSocial.receive(roomSpawn);
  const roomCounts={chat:chat(),events:events()};
  w.PGSocial.receive({type:'room',room:2,rooms:[],players:[],bots:{seed:1,at:now,count:0},rules:w.PGSocialRules.rulesFingerprint()});
  assert.equal(F.getMvp(),null,'room change removes the previous room banner');
  const afterHandoff={chat:chat(),events:events()};
  w.PGSocial.receive({...roomSpawn,serverNow:now+9000});
  assert.equal(F.getMvp(),null,'a delayed room-1 spawn cannot contaminate room 2');
  const roomTwo={...roomSpawn,room:2,id:'mvp:notice:room-two',spawnedAt:now+9000,snapshot:true,serverNow:now+9000,endsAt:now+609000};
  w.PGSocial.receive(roomTwo);
  assert.equal(F.getMvp().room,2,'the room-2 snapshot restores its authoritative banner');
  assert.equal(chat(),afterHandoff.chat,'handoff and room snapshots do not repeat Local alerts');
  assert.equal(events(),afterHandoff.events,'handoff and room snapshots do not repeat activity/HUD alerts');
  F.clearMvp(F.getMvp(),{announce:false,retire:false});
  // Solo rotation reload goes through the real Social scheduler, Fishing module and notice callback.
  app.room=0;app.wanted=true;
  w.PGSocial.writeSoloMvpState({active:null,nextAt:Date.now()-1,lastSp:null,bag:['mvp_stormcoil','mvp_thousandeye']});
  w.PGSocial.tickSoloMvp();
  const soloActive=F.getMvp(),soloNoticeCounts={chat:chat(),events:events()};
  assert.equal(soloActive.mode,'solo');assert.equal(soloActive.sp,'mvp_stormcoil','solo consumes the persisted shuffled bag');
  assert.deepEqual(Array.from(w.PGSocial.readSoloMvpState().bag),['mvp_thousandeye'],'solo rotation persists its remainder');
  F.clearMvp(soloActive,{announce:false,retire:false});
  w.PGSocial.tickSoloMvp();
  assert.equal(F.getMvp().id,soloActive.id,'solo reload restores the same active spawn');
  assert.equal(F.getMvp().endsAt,soloActive.endsAt,'solo reload preserves its original deadline');
  assert.equal(chat(),soloNoticeCounts.chat,'solo reload does not repeat the Local alert');
  assert.equal(events(),soloNoticeCounts.events,'solo reload does not repeat activity/HUD alerts');
  w.PGSocial.clearSoloMvpStorage();
 }
 console.log('PASS chat UI: stable hover/click tabs, dead-socket watchdog, seat-preserving re-authentication, disconnected account cleanup, Local history across reconnects, plaza switches and a same-tab reload (sessionStorage, never localStorage), an immediate reconnect when the network returns, a probed (not killed) quiet socket, a handshake timeout, Local privacy on exit, emotion tray on world/whisper/local, recipient control, minimize, history cap, solo/preview plaza fallback, decoupled chat/log visibility and text-only message rendering; v319 field Social Hub button with live population badge and one-click entry; v355 plaza maps with party panel and v356 tree-and-bench map cover; MVP lifecycle notification/replay integration');dom.window.close();
})().catch(e=>{console.error(e);process.exit(1)});
