const assert=require('node:assert/strict'),fs=require('node:fs');const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="view"><div id="feedWrap"></div><div id="minimapTools"><button id="socialHubBtn" type="button" class="minimap-tool-btn social-hub-btn"><span class="minimap-tool-label">Social</span><b id="socialHubBadge" class="minimap-tool-badge social-hub-badge" hidden>0</b></button></div></div>',{url:'http://localhost/',runScripts:'outside-only'}),w=dom.window;
Object.assign(w,{CLOUD:{on:false,user:null},S:{cls:'Novice',eq:{}},tabs:[],wardrobeAppearance:()=>({version:1,sex:'m'}),logShown:()=>[],openTab:()=>{},HUNT_TITLES:[{id:'poring',name:'Poring Hunter'}],titleUnlocked:()=>true,setInterval:fn=>{if(fn.name==='worldTrainingTick')w.trainingTick=fn;else if(fn.name==='battleUITick')w.battleTick=fn;else w.sessionTick=fn},PGSocialScene:{}});
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
 const socialCss=fs.readFileSync('assets/social.css','utf8');assert.match(socialCss,/#socialTabs button\{position:relative;z-index:7\}/);assert.match(socialCss,/#sanctuaryWorldStatus\{[^}]*width:min\(360px/,'training status has a fixed width so the stop button does not shift on countdown');assert.match(socialCss,/#sanctuaryNearby\{[^}]*width:190px/,'nearby training control has a fixed width');assert.match(socialCss,/#socialMin\{position:relative;z-index:7;/);
}
let socket;w.WebSocket=class {constructor(){socket=this;this.readyState=1;this.sent=[]}close(){}send(m){this.sent.push(JSON.parse(m))}};w.CLOUD.on=true;w.CLOUD.user='new';w.sessionTick();socket.onmessage({data:JSON.stringify({type:'hello',id:2,history:[]})});
app.messages=Array.from({length:400},(_,i)=>({channel:'whisper',body:'old'+i,name:'Name',from:1,id:'w'+i,at:i}));socket.onmessage({data:JSON.stringify({type:'hello',id:2,history:Array.from({length:100},(_,i)=>({channel:'world',body:'world',name:'Name',from:1,id:'world'+i,at:i}))})});assert.equal(app.messages.length,400);
w.PGSocial.select('world');socket.onmessage({data:JSON.stringify({type:'message',channel:'world',body:'<img src=x onerror=alert(1)>',name:'<script>',from:3,at:1000})});assert.equal(w.document.querySelectorAll('#socialLines img,#socialLines script').length,0);assert(w.document.getElementById('socialLines').textContent.includes('<img'));
w.PGSocial.select('local');app.room=1;w.document.getElementById('socialInput').value='first';w.document.getElementById('socialCompose').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(socket.sent.at(-1).body,'first');const count=socket.sent.length;w.document.getElementById('socialInput').value='second';w.document.getElementById('socialCompose').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(socket.sent.length,count);assert.equal(w.document.getElementById('socialInput').value,'second');assert(w.document.getElementById('socialSend').disabled);w.PGSocial.select('world');w.document.getElementById('socialCompose').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(socket.sent.length,count,'changing channel cannot evade cooldown');app.nextChat=0;w.document.getElementById('socialCompose').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(socket.sent.at(-1).body,'second');
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
w.PGSocial.select('emoji');assert.equal(w.document.querySelectorAll('#socialEmoji button').length,32);
// Solo plaza fallback spawns the local character when offline or before room join, supports walk/sit, and yields cleanly to multiplayer room state.
w.PGSocial.leave();w.CLOUD.on=false;w.CLOUD.user=null;w.currentUser='local_hero';app.socket=null;app.user=null;app.connected=false;app.room=0;
let sceneCallbacks=null;const scenePlayers=new Map();
w.PGSocialScene={create:async(_host,_labels,cb)=>{sceneCallbacks=cb;return{active:false,cameraState:{angle:0,pitch:48,distance:48,panX:0,panZ:0,follow:true},setCamera:v=>{cameraValues=v},resetCamera:()=>reset++,clearPlayers(){scenePlayers.clear()},putPlayer(p){scenePlayers.set(p.id,{...p,path:(p.path||[]).map(pt=>({...pt}))})},removePlayer(id){scenePlayers.delete(id)}}}};
app.scene=null;
w.S.lv=150;w.S.auraShow=true;w.moveSpd=()=>9.5;
(async()=>{
 w.S.digimonSanctuary={v:1,partners:{agumon:{stats:{power:3},training:{stat:'power',ends:1}}}};
 await w.PGSocial.enter();
 assert.equal(w.S.digimonSanctuary.partners.agumon.stats.power,3,'legacy completed progress is preserved');assert.equal(w.S.digimonSanctuary.partners.agumon.training,null,'old pending timer cannot award offline progress');delete w.S.digimonSanctuary;
 assert.equal(app.players.size,1,'offline/reconnecting plaza spawns solo character');
 assert.equal(scenePlayers.get(0).name,'local_hero');assert.equal(sceneCallbacks.self(),0);
 assert.equal(scenePlayers.get(0).look.lv,150,'solo plaza carries the level aura tier');
 assert.equal(scenePlayers.get(0).look.speed,9.5,'solo plaza walks at the field run speed');
 // The separate visual preview must not touch old RO pets, and an absent/invalid old save stays off.
 const pick=w.document.getElementById('socialDigimon');let saved=0;w.save=()=>saved++;w.S.pets=[{sp:2,on:true}];
 // This legacy roster fixture deliberately owns every form; the new-player egg
 // path is exercised independently below/in the Sanctuary bag regression.
 w.S.digimonBag={v:1,coins:1000,food:99,eggs:0,owned:w.PGDigimonSanctuary.ROSTER};
 w.document.getElementById('sanctuaryOpen').click();assert(!w.document.getElementById('sanctuaryPanel').hidden);assert.equal(w.document.querySelectorAll('[data-sanctuary-pet]').length,12);assert.equal(w.PGDigimonSanctuary.ROSTER.length,280);
 w.document.querySelector('[data-sanctuary-pet=patamon]').click();assert.equal(pick.value,'patamon');assert.equal(w.S.digimonPartner,'patamon');assert.equal(scenePlayers.get(0).look.digimon,'patamon');assert.equal(saved,1);assert.equal(w.document.querySelector('[data-sanctuary-pet=patamon]').getAttribute('aria-pressed'),'true');
 w.document.getElementById('sanctuaryDismiss').click();assert.equal(scenePlayers.get(0).look.digimon,undefined);assert.equal(w.S.pets[0].on,true);w.document.getElementById('sanctuaryClose').click();assert(w.document.getElementById('sanctuaryPanel').hidden);saved=0;
 // The real roster browser reaches an animation-only entry without mounting all 280 cards.
 w.document.getElementById('sanctuaryOpen').click();const rosterSearch=w.document.getElementById('sanctuarySearch');rosterSearch.value='aegiomon';rosterSearch.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(w.document.querySelectorAll('[data-sanctuary-pet]').length,1);w.document.querySelector('[data-sanctuary-pet=aegiomon]').click();assert.equal(w.S.digimonPartner,'aegiomon');assert.equal(scenePlayers.get(0).look.digimon,'aegiomon');assert.equal(w.S.pets[0].sp,2);assert.match(w.document.getElementById('sanctuaryGameplay').textContent,/No direct source-listed evolution/);
 rosterSearch.value='';rosterSearch.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(w.document.querySelectorAll('[data-sanctuary-pet]').length,12);w.document.getElementById('sanctuaryRosterNext').click();assert.match(w.document.getElementById('sanctuaryRosterPage').textContent,/Page 2/);assert.equal(w.document.querySelectorAll('[data-sanctuary-pet]').length,12);w.document.getElementById('sanctuaryRosterPrev').click();const stageFilter=w.document.getElementById('sanctuaryStage');stageFilter.value='Rookie';stageFilter.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(w.document.querySelectorAll('[data-sanctuary-pet]').length,12);for(const card of w.document.querySelectorAll('[data-sanctuary-pet]'))assert.equal(card.querySelector('.sanctuary-card-stage').textContent,'Rookie');stageFilter.value='';stageFilter.dispatchEvent(new w.Event('change',{bubbles:true}));
 w.document.getElementById('sanctuaryDismiss').click();w.document.getElementById('sanctuaryClose').click();saved=0;
 assert.equal(pick.value,'');pick.value='patamon';pick.dispatchEvent(new w.Event('change'));assert.equal(w.S.digimonPartner,'patamon');assert.equal(scenePlayers.get(0).look.digimon,'patamon');assert.equal(saved,1);assert.equal(w.S.pets[0].sp,2);
 pick.value='';pick.dispatchEvent(new w.Event('change'));assert.equal(scenePlayers.get(0).look.digimon,undefined);assert.equal(w.S.pets[0].on,true);

 // Real UI actions persist independently of RO pets and require explicit evolution confirmation.
 w.document.getElementById('sanctuaryOpen').click();w.document.querySelector('[data-sanctuary-pet=agumon]').click();
 assert.equal(w.document.querySelector('[data-sanctuary-action=train]'),null,'training is no longer started from the old window');w.document.getElementById('sanctuaryClose').click();
 const trainer=app.players.get(0),realNowGym=w.Date.now;let gymClock=500000;w.Date.now=()=>gymClock;
 Object.assign(trainer,{x:56,z:30,path:[],sit:false});sceneCallbacks.trainStation('power');assert.match(w.document.querySelector('#sanctuaryWorldStatus span').textContent,/auto-training .*local solo/,'offline solo mode starts labeled local gym practice');w.document.querySelector('#sanctuaryWorldStatus button').click();
 w.S.digimonSanctuary=w.PGDigimonSanctuary.normalize(w.S.digimonSanctuary,'agumon');const soloStats=w.S.digimonSanctuary.partners.agumon.stats,soloCoins=w.S.digimonBag.coins;soloStats.power=12;soloStats.guard=12;
 Object.assign(trainer,{x:70,z:64,path:[],sit:false});sceneCallbacks.trainingNearby(trainer);assert(!w.document.getElementById('sanctuaryBattleNearby').hidden,'solo field exposes its nearby grinding control');assert.equal(w.document.getElementById('sanctuaryBattleNearby').textContent,'Start solo grinding');w.document.getElementById('sanctuaryBattleNearby').click();assert.equal(app.battle.pve.length,1,'solo grinding uses the shared battle simulator');assert.equal(app.battle.pve[0].enemies.length,3);assert.match(w.document.getElementById('sanctuaryBattleHUD').textContent,/SOLO/);for(let i=0;i<40&&app.battle.pve[0]?.wave<2;i++){gymClock+=500;w.battleTick()}assert.equal(app.battle.pve[0]?.wave,2,'local ticks regenerate the next bot group');assert.match(w.document.getElementById('sanctuaryBattleHUD').textContent,/petgold.*Digi-Eggs/,'the live farm HUD tracks coins and egg drops');assert(w.S.digimonBag.coins>soloCoins,'solo wave clears apply labeled local rewards');assert([...app.battleRewards].some(id=>id.startsWith('solo-pve:')),'local reward IDs stay distinct from server battle IDs');w.S.digimonSanctuary.partners.agumon.stats.power=0;w.S.digimonSanctuary.partners.agumon.stats.guard=0;w.document.querySelector('[data-battle-stop="pve"]').click();assert.equal(app.battle.pve.length,0,'solo Stop grinding clears the local run');
 sceneCallbacks.trainingNearby(trainer);w.document.getElementById('sanctuaryBattleNearby').click();assert.equal(app.battle.pve.length,1);w.CLOUD.on=true;w.battleTick();assert.equal(app.battle.pve.length,0,'an online transition without a snapshot still clears local combat and its HUD');assert(w.document.getElementById('sanctuaryBattleHUD').hidden);
 w.CLOUD.user='local_hero';app.socket=socket;app.connected=true;app.room=1;app.id=0;
 // An older/unavailable Worker can accept the socket but ignore unknown battle packets. The pending
 // intent must lock duplicate clicks, then recover with an actionable mismatch message.
 sceneCallbacks.trainingNearby(trainer);assert.equal(w.document.getElementById('sanctuaryBattleNearby').textContent,'Start auto-grinding');w.document.getElementById('sanctuaryBattleNearby').click();assert.equal(sent.at(-1).type,'pve_start');assert(app.battleIntent);sceneCallbacks.trainingNearby(trainer);assert(w.document.getElementById('sanctuaryBattleNearby').hidden,'a pending battle request cannot be spammed');gymClock+=10001;w.battleTick();assert.equal(app.battleIntent,null);assert.match(w.document.querySelector('#sanctuaryWorldStatus span').textContent,/did not respond.*matching Social Worker/);assert.equal(app.battle.pve.length,0,'a missing reply never fabricates a battle or reward');sceneCallbacks.trainingNearby(trainer);assert(!w.document.getElementById('sanctuaryBattleNearby').hidden,'battle control recovers after the timeout');
 const train=stat=>{const n=sent.length;sceneCallbacks.trainStation(stat);if(sent.slice(n).some(m=>m.type==='gym_start'))socket.onmessage({data:JSON.stringify({type:'gym_started',request:sent.at(-1).request,gym:{room:1,stat,slot:0}})})};
 // Cancel and restart before either server reply: stale acknowledgements cannot claim or release the new reservation.
 Object.assign(trainer,{x:56,z:30,path:[],sit:false});sceneCallbacks.trainStation('power');const oldRequest=sent.at(-1).request;w.document.querySelector('#sanctuaryWorldStatus button').click();sceneCallbacks.trainStation('power');const newRequest=sent.at(-1).request;assert.notEqual(oldRequest,newRequest);socket.onmessage({data:JSON.stringify({type:'gym_started',request:oldRequest,gym:{room:1,stat:'power',slot:0}})});assert.match(w.document.querySelector('#sanctuaryWorldStatus span').textContent,/Reserving/);socket.onmessage({data:JSON.stringify({type:'gym_error',request:oldRequest,message:'stale'})});assert.match(w.document.querySelector('#sanctuaryWorldStatus span').textContent,/Reserving/);socket.onmessage({data:JSON.stringify({type:'gym_started',request:newRequest,gym:{room:1,stat:'power',slot:0}})});assert.match(w.document.querySelector('#sanctuaryWorldStatus span').textContent,/auto-training/);w.document.querySelector('#sanctuaryWorldStatus button').click();Object.assign(trainer,{x:0,z:12,path:[],sit:false});
 train('power');assert.match(w.document.querySelector('#sanctuaryWorldStatus span').textContent,/Walk near/);
 for(const [stat,x,z] of [['power',56,30],['guard',63,21],['agility',75,26],['focus',86,27]]){
  Object.assign(trainer,{x,z,path:[],sit:false});train(stat);assert(!w.document.getElementById('sanctuaryWorldStatus').hidden);
  gymClock+=w.PGDigimonSanctuary.DURATION;w.trainingTick();assert.equal(w.S.digimonSanctuary.partners.agumon.stats[stat],1,'one point per automatic '+stat+' cycle');
  w.document.querySelector('#sanctuaryWorldStatus button').click();gymClock+=30000;w.trainingTick();assert.equal(w.S.digimonSanctuary.partners.agumon.stats[stat],1,'stopped session cannot award again');
 }
 assert.equal(w.PGDigimonSanctuary.level(w.S.digimonSanctuary.partners.agumon),2,'four completed sessions earn a level');
 // v349: unattended sessions drain the energy bar; top it up like a Pet Meal would so the long gym scenarios keep running.
 {const topped=w.PGDigimonSanctuary.normalize(w.S.digimonSanctuary);topped.partners.agumon.energy=70;w.S.digimonSanctuary=topped;}
 Object.assign(trainer,{x:56,z:30,path:[],sit:false});train('power');sceneCallbacks.move(57,33);gymClock+=w.PGDigimonSanctuary.DURATION;w.trainingTick();assert.equal(w.S.digimonSanctuary.partners.agumon.stats.power,2,'walking away does not cancel auto-training');
 w.document.getElementById('sanctuaryOpen').click();w.document.querySelector('[data-partner-slot="1"]').click();w.document.querySelector('[data-sanctuary-pet=agumon]').click();assert.equal(w.S.digimonPartner2,'agumon','duplicate species can occupy the other slot');assert.equal(w.PGDigimonSanctuary.normalize(w.S.digimonSanctuary2).partners.agumon.stats.power,0,'the duplicate has independent progress');train('guard');assert.match(w.document.querySelector('#sanctuaryWorldStatus span').textContent,/Only one partner/,'only one gym session per account');w.document.querySelector('[data-gym-stop]').click();w.document.querySelector('[data-partner-slot="0"]').click();w.document.getElementById('sanctuaryClose').click();
 Object.assign(trainer,{x:56,z:30,path:[],sit:false});train('power');const owner=w.S;w.S={...owner};gymClock+=w.PGDigimonSanctuary.DURATION;w.trainingTick();assert.match(w.document.querySelector('#sanctuaryWorldStatus span').textContent,/account changed/);w.S=owner;gymClock+=30000;w.trainingTick();assert.equal(w.S.digimonSanctuary.partners.agumon.stats.power,2,'account-state replacement cancels without awarding');
 Object.assign(trainer,{x:56,z:30,path:[],sit:false});train('power');const loggedIn=w.currentUser;w.currentUser=null;gymClock+=w.PGDigimonSanctuary.DURATION;w.trainingTick();assert.equal(w.S.digimonSanctuary.partners.agumon.stats.power,2,'logging out cancels before awarding');w.currentUser=loggedIn;
 Object.assign(trainer,{x:56,z:30,path:[],sit:false});train('power');socket.readyState=3;gymClock+=w.PGDigimonSanctuary.DURATION;w.trainingTick();assert.equal(w.S.digimonSanctuary.partners.agumon.stats.power,2,'disconnect cancels before awarding');socket.readyState=1;
 w.CLOUD.on=false;w.CLOUD.user=null;app.socket=null;app.connected=false;app.room=0;w.Date.now=realNowGym;
 assert.equal(w.S.pets[0].sp,2,'gym never modifies the Ragnarok pet');w.S.digimonSanctuary.partners.agumon.stats.power=4;w.S.digimonSanctuary.partners.agumon.wins=2;w.document.getElementById('sanctuaryOpen').click();
 w.document.querySelector('[data-sanctuary-action=requestEvolution]').click();assert.equal(w.S.digimonSanctuary.partners.agumon.stage,0);assert.match(w.document.getElementById('sanctuaryGameplay').textContent,/Possible: /,'the confirm step lists the rolled pool');
 // v349: the branch is rolled. Pin both randomness sources to the first option (Greymon).
 const realRandom=w.Math.random.bind(w.Math),realGetValues=w.crypto?.getRandomValues?.bind(w.crypto);w.Math.random=()=>0;if(w.crypto?.getRandomValues)w.crypto.getRandomValues=arr=>{arr[0]=0;return arr};
 w.document.querySelector('[data-sanctuary-action=evolve]').click();w.Math.random=realRandom;if(realGetValues)w.crypto.getRandomValues=realGetValues;
 assert.equal(w.S.digimonSanctuary.partners.agumon.stage,1);assert.equal(scenePlayers.get(0).look.digimon,'greymon');assert.equal(w.S.pets[0].sp,2);w.document.getElementById('sanctuaryClose').click();
 w.sessionTick();w.S.auraShow=false;w.sessionTick();assert.equal(scenePlayers.get(0).look.lv,0,'the Display aura switch also hides it in the plaza');w.S.auraShow=true;w.sessionTick();
 sceneCallbacks.move(6,12);assert(scenePlayers.get(0).path.length>0,'solo click-to-walk computes local path');
 w.document.getElementById('socialSit').click();assert.equal(scenePlayers.get(0).sit,true,'solo sit button toggles sitting');
 assert.equal(w.document.getElementById('socialSit').getAttribute('aria-pressed'),'true');
 w.CLOUD.on=true;w.CLOUD.user='new';w.CLOUD.previewToken='tok_abc';app.nextConnect=0;
 let wsUrl='';w.WebSocket=class{constructor(u){wsUrl=u;socket=this;this.readyState=1;this.sent=[]}close(){}send(m){this.sent.push(JSON.parse(m))}};
 await w.PGSocial.enter();w.sessionTick();assert.match(wsUrl,/\?preview_session=tok_abc$/);
 socket.onmessage({data:JSON.stringify({type:'hello',id:9,history:[]})});
 socket.onmessage({data:JSON.stringify({type:'room',room:1,players:[{id:9,name:'new',room:1,x:0,z:12,dir:0,sit:false,seat:null,path:[],look:{cls:'Novice',appearance:{version:1,sex:'m'},refine:0,title:''}}]})});
 assert.equal(scenePlayers.has(0),false,'multiplayer room join replaces solo placeholder');
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
 liveDate+=25000;w.sessionTick();assert(socket.sent.at(-1).type==='ping','silence past the watchdog window asks for one ping');
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
  assert.match(hubBtn.title,/Plaza 1: 8 · Plaza 2: 4/,'the tooltip breaks the total down per plaza');
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
 console.log('PASS chat UI: stable hover/click tabs, dead-socket watchdog, seat-preserving re-authentication, disconnected account cleanup, Local history across reconnects and plaza switches, a probed (not killed) quiet socket, a handshake timeout, Local privacy on exit, emotion tray on world/whisper/local, recipient control, minimize, history cap, solo/preview plaza fallback, decoupled chat/log visibility and text-only message rendering; v319 field Social Hub button with live population badge and one-click entry');dom.window.close();
})().catch(e=>{console.error(e);process.exit(1)});
