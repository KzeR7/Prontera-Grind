/* Real-time chat, Fountain Plaza scene and multiplayer 2-table Plaza Hold'em. Never changes farming combat. */
(function(){
'use strict';
const R=PGSocialRules,P=globalThis.PGSocialPoker||null,$id=id=>document.getElementById(id);
const app={socket:null,user:null,id:null,room:0,rooms:[],wanted:false,channel:'world',messages:[],unread:new Set(),muted:new Set(),friends:new Set(),players:new Map(),retry:0,connected:false,nextConnect:0,blocked:false,scene:null,owner:null,nextChat:0,lastSeen:0,probeAt:0,resume:null,poker:null,pokerTables:null};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const emojiURL=id=>'assets/social/emotions/'+id+'.png';
// World is public and may be cached per account. Never put whispers or Local messages in storage.
const CHAT_MAX=400,WORLD_CACHE_MAX=200;
const worldHistoryKey=user=>'pg_social_world_v1_'+String(user||'').toLowerCase();
function cleanChatMessage(m){
 if(!m||!['world','whisper','local'].includes(m.channel)||!Number.isFinite(m.at)||!Number.isInteger(m.from)||typeof m.name!=='string'||typeof m.body!=='string'||m.body.length>300||(m.emotion&&!R.EMOTIONS.includes(m.emotion)))return null;
 return {type:'message',id:typeof m.id==='number'||typeof m.id==='string'?m.id:'',at:m.at,from:m.from,name:m.name.slice(0,32),gm:m.gm===true,channel:m.channel,body:m.body,room:Number.isInteger(m.room)?m.room:0,...(m.emotion?{emotion:m.emotion}:{}),...(Number.isInteger(m.to)?{to:m.to}:{}),...(typeof m.toName==='string'?{toName:m.toName.slice(0,32)}:{})};
}
function mergeChatMessages(...lists){
 const unique=new Map();
 for(const list of lists)if(Array.isArray(list))for(const raw of list){const m=cleanChatMessage(raw);if(!m)continue;const key=[m.channel,m.room,m.from,m.at,m.id,m.emotion||m.body].join(':');unique.set(key,m)}
 return [...unique.values()].sort((a,b)=>a.at-b.at).slice(-CHAT_MAX);
}
function readWorldHistory(){
 if(!app.user)return [];
 try{return mergeChatMessages(JSON.parse(localStorage.getItem(worldHistoryKey(app.user)))).filter(m=>m.channel==='world').slice(-WORLD_CACHE_MAX)}catch{return []}
}
function saveWorldHistory(){
 if(!app.user)return;
 try{localStorage.setItem(worldHistoryKey(app.user),JSON.stringify(app.messages.filter(m=>m.channel==='world').slice(-WORLD_CACHE_MAX)))}catch{}
}
const chat=document.createElement('section');chat.id='socialChat';chat.setAttribute('aria-label','Player chat');
chat.innerHTML='<div id="socialTabs" role="tablist" aria-label="Chat channels"></div><div id="socialLines" role="log" aria-label="Chat messages"></div><div id="socialEmoji" hidden></div><form id="socialCompose"><input id="socialTo" aria-label="Whisper recipient" placeholder="Player name" maxlength="32" hidden><input id="socialInput" aria-label="Message" placeholder="Press Enter to chat" maxlength="300" autocomplete="off"><button id="socialEmojiToggle" type="button" aria-label="Choose an emotion" aria-expanded="false" aria-controls="socialEmoji">Emoji</button><button id="socialSend" type="submit">Send</button></form><div id="socialStatus"><span id="socialConnection">Connecting…</span><button id="socialNew" type="button" hidden>New messages ↓</button></div><span id="socialResizeTop" data-resize="n" aria-hidden="true" title="Drag top edge to resize chat"></span><span id="socialResizeCorner" data-resize="ne" aria-hidden="true" title="Drag corner to resize chat"></span><span id="socialResize" data-resize="ne" role="separator" tabindex="0" aria-label="Resize chat; drag the top or right edge, corner, or use arrow keys" aria-orientation="vertical" title="Drag to resize chat"></span><div id="socialPeople" hidden></div>';
$id('view').append(chat);$id('feedWrap').hidden=true;$id('feedWrap').style.display='none';
const hub=document.createElement('section');hub.id='socialHub';hub.hidden=true;hub.setAttribute('aria-label','Prontera Fountain Plaza');hub.innerHTML='<div id="socialScene"></div><div id="socialLabels"></div><div id="socialHubToolbar"><header id="socialHubHeader"><div class="social-hub-title-row"><h2>Fountain Plaza</h2><select id="socialRoomSelect" aria-label="Switch plaza room" title="Switch Plaza server room" hidden></select></div><p id="socialPopulation">Joining plaza…</p></header><div id="socialHubControls"><button id="socialPokerBtn" type="button" title="Open Fountain Plaza Hold\'em"><span id="socialPokerBtnText">🃏 Hold\'em</span><i id="socialPokerDot" hidden></i></button><button id="socialSit" title="Sit or stand (Insert)">Sit · Insert</button><button id="socialCamera" aria-expanded="false" aria-controls="socialCameraPanel">Camera</button><button id="socialCameraReset">Reset view</button><details id="socialHubHelp"><summary aria-label="Plaza controls">?</summary><p>Click / tap to walk<br>Click a metal bench (2 seats each) or poker stool to sit<br>Click a Dealer or 🃏 Hold\'em to play Texas Hold\'em<br>20 players per Plaza — 21+ auto-opens Plaza 2, 3… (or switch rooms above)<br>Drag to rotate / tilt around your character · Scroll / pinch to zoom<br>Farming continues in your selected field.</p></details><button id="socialLeave">Return to field</button></div></div><div id="socialCameraPanel" hidden><label>Rotate <input id="socialOrbit" type="range" min="-180" max="180" value="0"></label><label>Tilt <input id="socialTilt" type="range" min="26" max="77" value="45"></label><label>Zoom <input id="socialZoom" type="range" min="22" max="72" value="44"></label></div><button id="socialPokerMini" type="button" hidden></button><section id="socialPokerModal" role="dialog" aria-label="Fountain Plaza Hold\'em" hidden><header id="socialPokerHead"><div class="poker-head-title"><strong id="socialPokerHeadTitle">🃏 Plaza Hold\'em · Table 1</strong><small id="socialPokerRoomSub">Dealer Vane · Blinds 10 / 20 · AFK Kick 2×</small></div><div class="poker-head-right"><span id="socialPokerWalletPill" class="poker-wallet-pill">🪙 1,000 Chips</span><button id="socialPokerMinBtn" type="button" title="Minimize table (shows live timer &amp; turn alert)" aria-label="Minimize poker table">—</button><button id="socialPokerCloseBtn" type="button" title="Close poker window" aria-label="Close poker window">✕</button></div></header><nav id="socialPokerNav" role="tablist" aria-label="Poker sections"><button type="button" role="tab" data-ptab="t0" aria-selected="true">♠ Table 1 <small id="pokerTabCount0">0/6</small></button><button type="button" role="tab" data-ptab="t1" aria-selected="false">♠ Table 2 <small id="pokerTabCount1">0/6</small></button><button type="button" role="tab" data-ptab="bank" aria-selected="false">🪙 Chip Bank <i id="pokerBankFreeDot" hidden>!</i></button><button type="button" role="tab" data-ptab="gifts" aria-selected="false" aria-disabled="true" class="is-locked" title="Locked — rewards coming in a later update">🔒 Gift Exchange <small>Later</small></button><span id="socialPokerToast" hidden role="status" aria-live="polite"></span></nav><div id="socialPokerBody"></div><div id="socialPokerResult" hidden aria-live="polite"></div></section>';$id('view').append(hub);
const leaveWarning=document.createElement('div');leaveWarning.id='socialPokerLeaveWarning';leaveWarning.hidden=true;
leaveWarning.innerHTML='<section class="poker-leave-card" role="dialog" aria-modal="true" aria-labelledby="pokerLeaveTitle" aria-describedby="pokerLeaveCopy"><span class="poker-leave-eyebrow">YOU’RE STILL AT THE TABLE</span><h2 id="pokerLeaveTitle">Leave this poker game?</h2><p id="pokerLeaveCopy"></p><p class="poker-leave-note">You can minimize the table instead and keep playing.</p><div class="poker-leave-actions"><button id="pokerLeaveStay" type="button" class="poker-primary-btn">Stay at table</button><button id="pokerLeaveConfirm" type="button" class="poker-danger-btn">Fold &amp; leave</button></div></section>';
$id('view').append(leaveWarning);
const feedHidden=()=>document.body.classList.contains('hide-feed')||(typeof S==='object'&&S&&S.feedShow===false);
function notice(text){const p=document.createElement('p');p.className='social-notice';p.textContent=text;$id('socialLines').append(p)}
function status(text){$id('socialConnection').textContent=text}
// Reuse tab nodes. bars() can call Display sync frequently; replacing the buttons
// under the pointer made hover flicker and could drop a click between down/up.
let chatMin=null;
function makeChatMin(){const min=document.createElement('span');min.id='socialMin';min.tabIndex=0;min.setAttribute('role','button');min.setAttribute('aria-label','Minimize or expand chat');const toggle=()=>{chat.classList.toggle('minimized');toggleEmojiClosed();tabsUI();syncPokerBounds();min.focus()};min.onclick=toggle;min.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}};return min}
function tabsUI(){if(app.channel==='log'&&feedHidden())app.channel=app.room?'local':'world';const el=$id('socialTabs');
 const names=['world','whisper','local','log'].filter(name=>(name!=='local'||app.room)&&(name!=='log'||!feedHidden()));
 const old=new Map();for(const b of el.querySelectorAll('button[data-channel]'))old.set(b.dataset.channel,b);
 const desired=[];
 for(const name of names){let b=old.get(name);if(!b){b=document.createElement('button');b.type='button';b.dataset.channel=name;b.setAttribute('role','tab');b.onclick=()=>select(name)}
  b.setAttribute('aria-selected',String(app.channel===name));b.classList.toggle('unread',app.unread.has(name));const label=name[0].toUpperCase()+name.slice(1);if(b.textContent!==label)b.textContent=label;desired.push(b);old.delete(name)}
 for(const b of old.values())b.remove();
 if(!chatMin)chatMin=makeChatMin();chatMin.setAttribute('aria-expanded',String(!chat.classList.contains('minimized')));desired.push(chatMin);
 if(el.children.length!==desired.length||desired.some((n,i)=>el.children[i]!==n))el.replaceChildren(...desired)}
function toggleEmojiClosed(){$id('socialEmoji').hidden=true;$id('socialEmojiToggle').setAttribute('aria-expanded','false');$id('socialPeople').hidden=true}
function toggleEmoji(force){const open=force??$id('socialEmoji').hidden;$id('socialEmoji').hidden=!open;$id('socialEmojiToggle').setAttribute('aria-expanded',String(open));chat.classList.remove('minimized');if(open)renderEmoji();syncPokerBounds()}
$id('socialEmojiToggle').onclick=()=>toggleEmoji();
function select(channel){if(channel==='emoji'){toggleEmoji(true);return}if(channel==='log'&&feedHidden())channel=app.room?'local':'world';app.channel=channel;app.unread.delete(channel);chat.classList.remove('minimized');tabsUI();$id('socialLines').hidden=false;toggleEmoji(false);renderEmoji();$id('socialCompose').hidden=false;$id('socialTo').hidden=channel!=='whisper';$id('socialInput').disabled=channel==='log';$id('socialInput').placeholder=channel==='log'?'Activity log':channel==='local'?'Say something to this plaza…':channel==='whisper'?'Private message…':'Say something to the world…';renderMessages();cooldownUI();syncPokerBounds()}
function syncDisplay(){if(app.channel==='log'&&feedHidden()){select(app.room?'local':'world');return}tabsUI();syncPokerBounds()}
// v273: the same menu is where a friend is made, because World chat and whispers are where people
// meet. The entry is answered by the friends panel (assets/friends.js), which owns the server list;
// "Friend ✓" is a state, not a button that would fail, so it is left out once you are friends.
function playerMenu(name,id){const menu=$id('socialPeople');menu.replaceChildren();menu.hidden=false;const label=document.createElement('strong');label.textContent=name;menu.append(label);
 const isFriend=Number.isInteger(id)?app.friends.has(id):false;
 const items=[['Whisper',()=>{$id('socialTo').value=name;select('whisper');$id('socialInput').focus()}]];
 if(!isFriend&&typeof PGFriends==='object'&&PGFriends)items.push(['Add friend',()=>PGFriends.addPlayer(name,id)]);
 if(app.muted.has(id))items.push(['Unmute',()=>{app.muted.delete(id);try{localStorage.setItem('pg_social_mute_'+app.user,JSON.stringify([...app.muted]))}catch{}renderMessages()}]);
 else items.push(['Mute',()=>{app.muted.add(id);try{localStorage.setItem('pg_social_mute_'+app.user,JSON.stringify([...app.muted]))}catch{}renderMessages()}]);
 items.push(['Close',()=>{}]);
 for(const [title,fn] of items){const b=document.createElement('button');b.type='button';b.textContent=title;b.onclick=()=>{fn();menu.hidden=true};menu.append(b)}
 if(isFriend){const mark=document.createElement('small');mark.className='social-friend-mark';mark.textContent='Friend ✓';menu.append(mark)}
}
function messageNode(m){const p=document.createElement('div');p.className='social-line';p.dataset.channel=m.channel;const t=document.createElement('time');t.textContent=new Date(m.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});p.append(t);const b=document.createElement('button');b.type='button';b.textContent=(m.gm?'🛠 ':'')+(app.friends.has(m.from)?'★ ':'')+m.name+(m.channel==='whisper'?' → '+m.toName:'');b.title=(m.gm?'Game Master':'')+(m.gm&&app.friends.has(m.from)?' · ':'')+(app.friends.has(m.from)?'Friend':'');b.classList.toggle('social-gm',!!m.gm);b.onclick=()=>playerMenu(m.name,m.from);p.append(b,document.createTextNode(': '));if(m.emotion){const im=document.createElement('img');im.src=emojiURL(m.emotion);im.alt='/'+m.emotion;im.title='/'+m.emotion;p.append(im)}else p.append(document.createTextNode(m.body));return p}
function renderMessages(preserve=false){const box=$id('socialLines'),bottom=box.scrollHeight-box.scrollTop-box.clientHeight<35,top=box.scrollTop;box.replaceChildren();if(app.channel==='log'){for(const l of logShown()){const p=document.createElement('div');p.className='social-line '+(l.cls||'');p.textContent=l.m;box.append(p)}const b=document.createElement('button');b.textContent='Log filters';b.onclick=()=>openTab('log');box.append(b)}else for(const m of app.messages.filter(m=>m.channel===app.channel&&!app.muted.has(m.from)))box.append(messageNode(m));if(!box.childNodes.length)notice(app.channel==='local'?'Messages here are visible only to this plaza.':'No messages yet.');if(!preserve||bottom){box.scrollTop=box.scrollHeight;$id('socialNew').hidden=true}else {box.scrollTop=top;$id('socialNew').hidden=false}}
$id('socialNew').onclick=()=>{$id('socialLines').scrollTop=$id('socialLines').scrollHeight;$id('socialNew').hidden=true};
let lastCooldownKey='';
// v274 (owner): the tray works on World and Whisper too, not just in a plaza. The
// emotion travels on the channel the player has selected, so the tray is offered
// on every channel that can carry one - only a closed-channel case (Local with no
// room to be local to) has nothing to send to.
function emoteChannel(){const c=app.channel;if(c==='local'&&!app.room)return null;return ['world','whisper','local'].includes(c)?c:null}
function renderEmoji(){const box=$id('socialEmoji');box.replaceChildren();const channel=emoteChannel();if(!channel){const p=document.createElement('p');p.textContent=app.channel==='log'?'Pick World, Whisper or Local to send an emotion.':'Enter the Social Hub to use Local emotions.';p.style.gridColumn='1 / -1';box.append(p);return}
 for(const id of R.EMOTIONS){const b=document.createElement('button');b.type='button';b.title='/'+id;const im=document.createElement('img');im.src=emojiURL(id);im.alt=id;b.append(im,document.createTextNode('/'+id));b.onclick=()=>{const m={type:'emotion',emotion:id,channel};if(channel==='whisper'){const to=$id('socialTo').value.trim();if(!to){status('Whisper an emotion to whom? Type a name in the To field first.');$id('socialTo').focus();return}m.to=to}if(send(m))toggleEmoji(false)};box.append(b)}lastCooldownKey='';cooldownUI()}
function cooldownUI(){const seconds=Math.max(0,Math.ceil((app.nextChat-Date.now())/1000)),key=seconds+':'+app.channel+':'+$id('socialEmoji').hidden;if(key===lastCooldownKey)return;lastCooldownKey=key;$id('socialSend').disabled=seconds>0||app.channel==='log';$id('socialSend').textContent=seconds?'Wait '+seconds+'s':'Send';chat.querySelectorAll('#socialEmoji button').forEach(b=>b.disabled=seconds>0)}
setInterval(cooldownUI,200);
function send(m){if(!app.connected||app.socket?.readyState!==1){status('Chat disconnected — reconnecting…');return false}const speaking=['chat','emotion'].includes(m.type);if(speaking&&Date.now()<app.nextChat){status('Please wait 3 seconds between messages and emotions.');return false}app.socket.send(JSON.stringify(m));if(speaking){app.nextChat=Date.now()+R.CHAT_DELAY;cooldownUI()}return true}
$id('socialCompose').onsubmit=e=>{e.preventDefault();const input=$id('socialInput'),body=input.value.trim();if(!body||app.channel==='log')return;let sent=false;if(body==='/sit'){toggleSit();input.value='';return}else if(body==='/poker'){pokerOpen();input.value='';return}else if(R.EMOTIONS.includes(body.slice(1))&&body[0]==='/'){const ch=emoteChannel(),em={type:'emotion',emotion:body.slice(1),channel:ch||'local'};if(ch==='whisper')em.to=$id('socialTo').value.trim();if(ch==='whisper'&&!em.to){status('Whisper an emotion to whom? Type a name in the To field first.');return}sent=send(em)}else if(body.startsWith('/w ')){const match=body.match(/^\/w\s+(\S+)\s+(.+)$/);if(match)sent=send({type:'chat',channel:'whisper',to:match[1],body:match[2]});else status('Use /w PlayerName message')}else sent=send({type:'chat',channel:app.channel,to:$id('socialTo').value.trim(),body});if(sent)input.value=''};
chat.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.target.blur();toggleEmoji(false);$id('socialPeople').hidden=true}});
addEventListener('keydown',e=>{if(!leaveWarning.hidden)return;if(e.target.matches('input,textarea,select')||e.target.closest('button,[role=button],[role=separator],summary')||e.ctrlKey||e.altKey||e.metaKey)return;if(e.key==='Escape'&&!hub.hidden&&!$id('socialPokerModal').hidden){e.preventDefault();closePokerModal();return}if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();if(app.channel==='log')select(app.room?'local':'world');$id('socialInput').focus()}if(e.key==='Insert'&&(app.room||app.wanted)){e.preventDefault();toggleSit()}},true);
// Measure in the view's coordinates. Chat can grow to the central UI on desktop,
// and to the viewport edge on phones. Reserve the dock and top controls vertically.
let preferredSize=[390,214];
function setSize(w,h,persist=true){const view=$id('view'),box=view.getBoundingClientRect(),left=chat.offsetLeft||(box.width<=600?8:12),width=box.width||innerWidth,height=box.height||innerHeight;
 const dock=$id('dock')?.getBoundingClientRect(),edge=width>=1120?(dock?.width?dock.left-box.left-8:width/2-282):width-left;
 const maxWidth=Math.max(0,edge-left),bottom=parseFloat(getComputedStyle(chat).bottom)||76,maxHeight=Math.max(0,Math.min(height*.72,height-bottom-24));
 if(!Number.isFinite(w)||!Number.isFinite(h))return;
 const phone=document.documentElement.classList.contains('pg-mobile');
 const capWidth=phone?Math.min(maxWidth,340):maxWidth;
 const capHeight=phone?Math.min(maxHeight,Math.max(120,Math.min(150,Math.round(height*.36)))):maxHeight;
 if(persist){preferredSize=[Math.max(220,w),Math.max(120,h)];try{localStorage.setItem('pg_chat_size',JSON.stringify(preferredSize))}catch{}}
 chat.style.width=Math.max(Math.min(220,capWidth),Math.min(capWidth,w))+'px';chat.style.height=Math.max(Math.min(120,capHeight),Math.min(capHeight,h))+'px';
 syncPokerBounds();}
try{const size=JSON.parse(localStorage.getItem('pg_chat_size'));if(Array.isArray(size)&&size.length===2&&size.every(Number.isFinite))preferredSize=size}catch{}
let drag=null;
const onMove=e=>{if(!drag||(e.pointerId??0)!==drag.id)return;e.preventDefault?.();e.stopPropagation?.();setSize(drag.xAxis?drag.w+e.clientX-drag.x:drag.w,drag.yAxis?drag.h+drag.y-e.clientY:drag.h)};
const onEnd=e=>{if(!e||!drag||(e.pointerId??0)===drag.id)drag=null};
function bindResize(el,axes){el.onpointerdown=e=>{if(e.button>0)return;e.preventDefault?.();e.stopPropagation?.();chat.classList.remove('minimized');drag={id:e.pointerId??0,x:e.clientX,y:e.clientY,w:chat.offsetWidth,h:chat.offsetHeight,xAxis:axes.includes('e'),yAxis:axes.includes('n')};try{el.setPointerCapture?.(e.pointerId)}catch{}};el.onpointermove=onMove;el.onpointerup=el.onpointercancel=el.onlostpointercapture=onEnd}
bindResize($id('socialResizeTop'),'n');bindResize($id('socialResizeCorner'),'ne');
const resize=$id('socialResize');bindResize(resize,'ne');
addEventListener('pointermove',onMove);addEventListener('pointerup',onEnd);addEventListener('pointercancel',onEnd);
resize.onkeydown=e=>{if(e.key.startsWith('Arrow')){e.preventDefault();setSize(chat.offsetWidth+(e.key==='ArrowRight'?20:e.key==='ArrowLeft'?-20:0),chat.offsetHeight+(e.key==='ArrowUp'?20:e.key==='ArrowDown'?-20:0))}};
addEventListener('resize',()=>{setSize(...preferredSize,false);syncPokerBounds();});
if(typeof ResizeObserver!=='undefined'){
 const ro=new ResizeObserver(()=>{setSize(...preferredSize,false);syncPokerBounds();});
 ro.observe($id('view'));ro.observe(chat);
 if($id('dock'))ro.observe($id('dock'));
 if($id('eclipseDock'))ro.observe($id('eclipseDock'));
}
setSize(...preferredSize,false);
function cameraUI(state){$id('socialOrbit').value=((state.angle*180/Math.PI+180)%360+360)%360-180;$id('socialTilt').value=state.pitch;$id('socialZoom').value=state.distance}
$id('socialCamera').onclick=()=>{const panel=$id('socialCameraPanel');panel.hidden=!panel.hidden;$id('socialCamera').setAttribute('aria-expanded',String(!panel.hidden))};
$id('socialCameraReset').onclick=()=>app.scene?.resetCamera();
for(const [id,key,factor] of [['socialOrbit','angle',Math.PI/180],['socialTilt','pitch',1],['socialZoom','distance',1]])$id(id).oninput=e=>app.scene?.setCamera({[key]:Number(e.target.value)*factor});
$id('socialRoomSelect').onchange=e=>{const target=Number(e.target.value);if(!app.room||!Number.isInteger(target)||target===app.room){e.target.value=String(app.room||1);return}confirmPokerLeave(confirmLeave=>{if(!send({type:'switch_room',room:target,confirmLeave}))e.target.value=String(app.room)});e.target.value=String(app.room)};
const SOLO_ID=0;

// ---------- Fountain Plaza Hold'em (2 Tables), AFK Auto-Kick, Chip Bank & Gift Exchange ----------
const fallbackWallet={day:'',chips:1000,freeClaimed:0};
const pokerUI={open:false,minimized:false,tab:'t0',tableId:0,buyIn:1000,raiseTo:40,toast:'',toastKind:'',toastUntil:0,renderKey:''};
let soloTables=null,pokerLeaveAction=null,pokerLeaveFocus=null;
function finishPokerLeave(accepted){
 const action=pokerLeaveAction;if(!action)return;
 pokerLeaveAction=null;leaveWarning.hidden=true;hub.inert=false;chat.inert=false;
 if(pokerLeaveFocus?.isConnected)pokerLeaveFocus.focus();pokerLeaveFocus=null;
 if(accepted)action(true);
}
function confirmPokerLeave(action){
 if(!seatedPokerSnapshot()){action(true);return true}
 if(pokerLeaveAction)return false;
 const snap=seatedPokerSnapshot(),me=snap.seats[snap.me.seat];
 $id('pokerLeaveCopy').textContent=me?.inHand&&!me.folded?'Leaving now folds your current hand. Chips already bet stay in the pot; your unbet stack stays in your wallet.':'You will give up your seat. Your remaining table stack stays in your chip wallet.';
 pokerLeaveAction=action;pokerLeaveFocus=document.activeElement;
 leaveWarning.hidden=false;hub.inert=true;chat.inert=true;$id('pokerLeaveStay').focus();
 return false;
}
$id('pokerLeaveStay').onclick=()=>finishPokerLeave(false);
$id('pokerLeaveConfirm').onclick=()=>finishPokerLeave(true);
leaveWarning.onclick=e=>{if(e.target===leaveWarning)finishPokerLeave(false)};
leaveWarning.addEventListener('keydown',e=>{
 e.stopPropagation();
 if(e.key==='Escape'){e.preventDefault();finishPokerLeave(false)}
 if(e.key==='Tab'){e.preventDefault();(document.activeElement===$id('pokerLeaveStay')?$id('pokerLeaveConfirm'):$id('pokerLeaveStay')).focus()}
});

function syncPokerBounds(){
 const modal=$id('socialPokerModal');if(!modal)return;
 const active=!modal.hidden&&!hub.hidden;
 const view=$id('view'),vBox=view.getBoundingClientRect();
 const W=vBox.width||innerWidth,H=vBox.height||innerHeight;
 const wide=W>=1280;
 // Chat has a fixed lane, not a vote in the table's geometry. Resizing chat or changing
 // channel/emoji cannot move the cards. On small screens only, opening the table docks chat
 // below it; closing/minimizing restores the player's original chat dimensions.
 chat.classList.toggle('poker-chat-capped',active&&wide);
 chat.classList.toggle('poker-compact',active&&!wide);
 hub.classList.toggle('poker-table-open',active);
 if(!active||!W||!H)return;
 const tb=$id('socialHubToolbar')?.getBoundingClientRect();
 const topSafe=Math.max(52,tb&&tb.height?Math.ceil(tb.bottom-vBox.top+10):64);
 const dock=$id('eclipseDock')?.getBoundingClientRect()||$id('dock')?.getBoundingClientRect();
 const dockSafe=dock&&dock.height&&dock.top>vBox.top?Math.max(10,Math.ceil(vBox.bottom-dock.top+8)):76;
 const compactH=H<700?112:132;
 chat.style.setProperty('--poker-chat-height',compactH+'px');
 const chatH=wide||chat.classList.contains('minimized')?0:compactH;
 const seatedFit=chat.classList.contains('poker-chat-fit');
 const left=wide?(seatedFit?304:414):8;
 const w=Math.max(280,Math.min(1000,W-left-(wide?12:8)));
 const h=Math.max(240,Math.min(620,H-topSafe-dockSafe-(chatH?chatH+12:10)));
 const top=topSafe+Math.max(0,Math.floor((H-topSafe-dockSafe-(chatH?chatH+12:10)-h)/2));
 modal.style.left=left+'px';modal.style.right='auto';modal.style.transform='none';
 modal.style.top=top+'px';modal.style.bottom='auto';
 modal.style.width=w+'px';modal.style.height=h+'px';
}

function pokerDay(){
 if(typeof trialDay==='function')return trialDay();
 return new Date(Date.now()+8*3600000).toISOString().slice(0,10);
}
function pokerCountdown(){
 if(typeof dailyResetCountdownText==='function')return dailyResetCountdownText();
 const now=Date.now()+8*3600000,next=Math.floor(now/86400000+1)*86400000,rem=Math.max(0,Math.floor((next-now)/1000));
 return `${Math.floor(rem/3600)}h ${String(Math.floor((rem%3600)/60)).padStart(2,'0')}m`;
}
function pokerWallet(){
 const today=pokerDay();
 const hostObj=(typeof S==='object'&&S)?S:null;
 let w=hostObj?hostObj.poker:fallbackWallet;
 if(!w||typeof w!=='object'||Array.isArray(w)){
  w={day:today,chips:P?P.STARTING_CHIPS:1000,freeClaimed:0};
  if(hostObj)hostObj.poker=w;
 }
 w.chips=Math.max(0,Math.min(1e9,Math.floor(Number(w.chips)||0)));
 w.freeClaimed=Math.max(0,Math.min(1,Math.floor(Number(w.freeClaimed)||0)));
 if(w.day!==today){w.day=today;w.freeClaimed=0;}
 return w;
}
function persistPoker(){
 if(typeof bars==='function'&&typeof S==='object'&&S)bars();
 if(typeof save==='function'&&typeof S==='object'&&S)save();
 syncPokerBadges();
}
function showPokerToast(msg,kind='info'){
 pokerUI.toast=msg;pokerUI.toastKind=kind;pokerUI.toastUntil=Date.now()+4800;
 const el=$id('socialPokerToast');
 if(el){el.textContent=msg;el.dataset.kind=kind;el.hidden=!msg;}
}
function applyPokerLedger(delta){
 const d=Math.trunc(Number(delta)||0);if(!d)return;
 const w=pokerWallet();
 w.chips=Math.max(0,Math.min(1e9,w.chips+d));
 persistPoker();
 renderPokerUI(true);
}
function handlePokerCallout(body,tableId=0){
 if(!body)return;
 const dName=R.POKER.tables?.[tableId]?.dealer?.name||'Dealer Vane';
 app.scene?.dealerBubble?.(body,7000,tableId);
 if(app.room){
  app.messages.push({id:'poker-'+Date.now()+'-'+Math.random(),at:Date.now(),from:0,name:dName,channel:'local',room:app.room,body});
  if(app.messages.length>400)app.messages.splice(0,app.messages.length-400);
  if(app.channel==='local')renderMessages(true);
  pokerTableChatBubble({from:0,name:dName,channel:'local',room:app.room,body},tableId);
 }
}
function handleSoloKick(info){
 const p=app.players.get(SOLO_ID);
 if(p){p.pokerSeat=null;p.sit=false;p.path=[];putPlayer(p);}
 showPokerToast(info.reason==='empty'?'Stood up from table (out of chips / idle).':'Auto-removed from seat due to AFK inactivity.','warn');
 syncSoloPokerSnapshots();
 renderPokerMini();renderPokerUI(true);
}
function ensureSoloTables(){
 if(!P)return null;
 if(!soloTables){
  const specs=R.POKER.tables||[{id:0,label:'Table 1',dealer:R.POKER.dealer}];
  soloTables=specs.map(spec=>new P.HoldemTable({
   tableId:spec.id,label:spec.label,dealerName:spec.dealer.name,
   onLedger:(_id,delta)=>applyPokerLedger(delta),
   onCallout:body=>handlePokerCallout(body,spec.id),
   onKick:info=>handleSoloKick(info)
  }));
 }
 return soloTables;
}
function syncSoloPokerSnapshots(){
 const list=ensureSoloTables();if(!list)return null;
 const now=Date.now();
 const snaps=list.map(t=>t.snapshotFor(SOLO_ID,now));
 app.pokerTables=snaps;
 app.poker=snaps.find(s=>s.me)||snaps[pokerUI.tableId]||snaps[0];
 app.scene?.updatePoker?.(snaps);
 return snaps;
}
function allPokerSnapshots(){
 if(!P)return [];
 if(app.room)return Array.isArray(app.pokerTables)&&app.pokerTables.length?app.pokerTables:app.poker?[app.poker]:[];
 return app.pokerTables||syncSoloPokerSnapshots()||[];
}
function seatedPokerSnapshot(){
 return allPokerSnapshots().find(s=>s&&s.me)||null;
}
function viewedPokerSnapshot(){
 const snaps=allPokerSnapshots();
 return snaps[pokerUI.tableId]||snaps[0]||null;
}
function syncPokerChatFit(){
 // Seated players get a narrow chat column so the table can use the freed lane.
 // This is keyed to the seat, not to chat resizing; standing/leaving restores the old size.
 const fit=!hub.hidden&&!!seatedPokerSnapshot();
 if(chat.classList.contains('poker-chat-fit')===fit)return;
 chat.classList.toggle('poker-chat-fit',fit);
 hub.classList.toggle('poker-seated',fit);
 syncPokerBounds();
}
function syncPokerBadges(){
 syncPokerChatFit();
 const w=pokerWallet();
 const freeReady=w.freeClaimed===0;
 const dot=$id('socialPokerDot'),bankDot=$id('pokerBankFreeDot'),pill=$id('socialPokerWalletPill');
 if(dot)dot.hidden=!freeReady;
 if(bankDot)bankDot.hidden=!freeReady;
 if(pill)pill.textContent=`🪙 ${w.chips.toLocaleString()} Chips`;
 const snaps=allPokerSnapshots();
 for(let i=0;i<2;i++){
  const el=$id('pokerTabCount'+i),s=snaps[i];
  if(el)el.textContent=s?.me?'YOU':`${s?.seatedCount||0}/6`;
 }
}
const pokerCardMotion=new Map();
function cardHTML(code,small=false,highlight=false,motionKey=''){
 if(!code)return `<span class="pcard slot${small?' sm':''}" aria-hidden="true"></span>`;
 let motion='',delay=0;
 if(motionKey&&pokerCardMotion.get(motionKey)!==code){
  motion=pokerCardMotion.get(motionKey)==='??'?' is-revealing':' is-dealing';
  delay=(Number(motionKey.match(/c(\d)$/)?.[1])||0)*70;
  pokerCardMotion.set(motionKey,code);
  if(pokerCardMotion.size>160)for(const key of pokerCardMotion.keys()){pokerCardMotion.delete(key);if(pokerCardMotion.size<=120)break}
 }
 const cls=`pcard${small?' sm':''}${highlight?' win':''}${motion}`;
 const style=motion?` style="--deal-delay:${delay}ms"`:'';
 if(code==='??')return `<span class="${cls} back"${style} role="img" aria-label="Face-down card"><i></i></span>`;
 const suitMap={s:['♠','black','spades'],h:['♥','red','hearts'],d:['♦','red','diamonds'],c:['♣','black','clubs']};
 const [glyph,tone,suit]=suitMap[code[1]]||['♠','black','spades'];
 const rank=code[0]==='T'?'10':code[0];
 return `<span class="${cls} ${tone}"${style} role="img" aria-label="${rank} of ${suit}"><b>${rank}</b><em>${glyph}</em></span>`;
}

function pokerOpen(tabOrTable){
 if(!P)return;
 if(!app.wanted){enter().then(()=>pokerOpen(tabOrTable));return;}
 if(tabOrTable===0||tabOrTable==='t0'){pokerUI.tab='t0';pokerUI.tableId=0;}
 else if(tabOrTable===1||tabOrTable==='t1'){pokerUI.tab='t1';pokerUI.tableId=1;}
 else if(tabOrTable==='bank')pokerUI.tab='bank';
 else if(tabOrTable==='gifts'){
  if(pokerUI.tab!=='bank')pokerUI.tab='t'+pokerUI.tableId;
  showPokerToast('🔒 Gift Exchange is locked — coming in a later update!','warn');
 }
 else if(tabOrTable==='table')pokerUI.tab='t'+pokerUI.tableId;
 else{
  const my=seatedPokerSnapshot();
  if(my){pokerUI.tableId=my.tableId||0;pokerUI.tab='t'+pokerUI.tableId;}
  else if(pokerUI.tab!=='bank')pokerUI.tab='t'+pokerUI.tableId;
 }
 pokerUI.open=true;pokerUI.minimized=false;
 $id('socialPokerModal').hidden=false;
 $id('socialPokerMini').hidden=true;
 if(app.room)send({type:'poker_watch'});
 else syncSoloPokerSnapshots();
 syncPokerBounds();
 renderPokerUI(true);
 updatePokerTurnClock();
}
function minimizePokerModal(){
 pokerUI.open=false;pokerUI.minimized=true;
 $id('socialPokerModal').hidden=true;
 syncPokerBounds();
 renderPokerMini();
 updatePokerTurnClock();
}
function closePokerModal(){
 pokerUI.open=false;
 const my=seatedPokerSnapshot();
 pokerUI.minimized=!!my;
 $id('socialPokerModal').hidden=true;
 syncPokerBounds();
 renderPokerMini();
 updatePokerTurnClock();
}
$id('socialPokerBtn').onclick=()=>{if(pokerUI.open)minimizePokerModal();else pokerOpen();};
$id('socialPokerMinBtn').onclick=minimizePokerModal;
$id('socialPokerCloseBtn').onclick=closePokerModal;
$id('socialPokerMini').onclick=()=>pokerOpen();
for(const b of hub.querySelectorAll('#socialPokerNav [data-ptab]'))b.onclick=()=>switchPokerTab(b.dataset.ptab);
function switchPokerTab(tab){
 if(tab==='gifts'){
  showPokerToast('🔒 Gift Exchange is locked — coming in a later update!','warn');
  renderPokerUI(true);
  return;
 }
 if(tab==='t0'){pokerUI.tab='t0';pokerUI.tableId=0;}
 else if(tab==='t1'){pokerUI.tab='t1';pokerUI.tableId=1;}
 else if(tab==='table'){pokerUI.tab='t'+pokerUI.tableId;}
 else pokerUI.tab=tab;
 for(const b of hub.querySelectorAll('#socialPokerNav [data-ptab]'))b.setAttribute('aria-selected',String(b.dataset.ptab===pokerUI.tab));
 renderPokerUI(true);
}

function claimDailyPokerChips(){
 if(!P)return false;
 const w=pokerWallet();
 if(w.freeClaimed>=1){showPokerToast(`Next free daily refill in ${pokerCountdown()}.`,'warn');renderPokerUI(true);return false;}
 w.freeClaimed=1;
 w.chips=Math.min(1e9,w.chips+P.DAILY_FREE_CHIPS);
 persistPoker();
 showPokerToast(`+${P.DAILY_FREE_CHIPS.toLocaleString()} Free Daily Plaza Chips claimed!`,'ok');
 renderPokerUI(true);
 return true;
}
function buyPokerChipsWithZeny(packId){
 if(!P)return false;
 const pack=P.ZENY_PACKS.find(x=>x.id===packId);if(!pack)return false;
 const hostObj=(typeof S==='object'&&S)?S:null;
 const curZeny=Math.max(0,Math.floor(Number(hostObj?.zeny)||0));
 if(!hostObj||curZeny<pack.zeny){
  showPokerToast(`Need ${pack.zeny.toLocaleString()} Zeny (you have ${curZeny.toLocaleString()}z).`,'warn');
  renderPokerUI(true);return false;
 }
 hostObj.zeny=curZeny-pack.zeny;
 const w=pokerWallet();
 w.chips=Math.min(1e9,w.chips+pack.chips);
 persistPoker();
 showPokerToast(`Exchanged ${pack.zeny.toLocaleString()}z for +${pack.chips.toLocaleString()} Plaza Chips!`,'ok');
 renderPokerUI(true);
 return true;
}
function pokerSeatAction(globalSeat){
 if(!P||!Number.isInteger(globalSeat)||!R.POKER.seats[globalSeat])return;
 const current=seatedPokerSnapshot();
 if(current&&current.me.globalSeat!==globalSeat){confirmPokerLeave(()=>pokerSeatActionConfirmed(globalSeat));return;}
 pokerSeatActionConfirmed(globalSeat);
}
function pokerSeatActionConfirmed(globalSeat){
 const target=R.POKER.seats[globalSeat];
 pokerUI.tableId=target.tableId||0;
 const w=pokerWallet();
 const seated=seatedPokerSnapshot();
 if(!seated&&w.chips<P.MIN_BUY_IN){
  pokerOpen('bank');
  showPokerToast(`Need at least ${P.MIN_BUY_IN} Plaza Chips to sit — claim your Free Daily Refill or buy with Zeny!`,'warn');
  return;
 }
 const buyIn=Math.max(P.MIN_BUY_IN,Math.min(w.chips,pokerUI.buyIn||P.DEFAULT_BUY_IN));
 if(app.room){
  if(!send({type:'poker_sit',seat:globalSeat,buyIn,confirmLeave:true}))return;
  pokerOpen('t'+target.tableId);
  return;
 }
 const p=app.players.get(SOLO_ID);if(!p)return;
 R.advance(p,performance.now());
 const route=R.path(p,target);
 const atSeat=!route.length&&Math.hypot(p.x-target.x,p.z-target.z)<=.6;
 if(!route.length&&!atSeat)return;
 const list=ensureSoloTables();
 if(Number.isInteger(p.pokerSeat)&&Math.floor(p.pokerSeat/6)!==target.tableId){
  list[Math.floor(p.pokerSeat/6)]?.stand(SOLO_ID,Date.now());
 }
 const t=list[target.tableId];
 const res=t.sit(target.seatIndex,{id:SOLO_ID,name:soloName()},buyIn,Date.now(),atSeat);
 if(!res.ok){pokerOpen('t'+target.tableId);showPokerToast(res.error,'warn');return;}
 p.seat=null;p.pokerSeat=target.id;p.path=route;p.sit=atSeat;
 if(atSeat){p.x=target.x;p.z=target.z;p.dir=target.dir;}
 putPlayer(p);
 syncSoloPokerSnapshots();
 pokerOpen('t'+target.tableId);
}
function standFromPoker(){
 confirmPokerLeave(performStandFromPoker);
}
function performStandFromPoker(){
 if(app.room){send({type:'poker_stand'});return;}
 const p=app.players.get(SOLO_ID);
 const list=ensureSoloTables();
 if(p&&Number.isInteger(p.pokerSeat)){
  const tid=Math.floor(p.pokerSeat/6);
  p.pokerSeat=null;p.sit=false;p.path=[];putPlayer(p);
  list?.[tid]?.stand(SOLO_ID,Date.now());
 }
 syncSoloPokerSnapshots();
 renderPokerMini();renderPokerUI(true);
}
function topUpTableStack(customAdd){
 if(!P)return;
 const snap=seatedPokerSnapshot();if(!snap?.me)return;
 const w=pokerWallet();
 const onTable=(snap.me.stack||0)+(snap.me.pendingAdd||0);
 const reserve=Math.max(0,w.chips-onTable);
 if(reserve<=0){
  switchPokerTab('bank');
  showPokerToast('All your Plaza Chips are already on the table — refill in Chip Bank!','warn');
  return;
 }
 const add=Math.min(reserve,Math.max(P.MIN_BUY_IN,Number(customAdd)||P.DEFAULT_BUY_IN));
 if(app.room){send({type:'poker_topup',amount:add});showPokerToast(`Added +${add.toLocaleString()} chips from wallet.`,'ok');return;}
 const t=ensureSoloTables()?.[snap.tableId||0];if(!t)return;
 const res=t.topUp(SOLO_ID,add,Date.now());
 if(!res.ok){showPokerToast(res.error,'warn');return;}
 syncSoloPokerSnapshots();
 showPokerToast(res.pending?`+${res.added.toLocaleString()} chips queued for next hand.`:`+${res.added.toLocaleString()} chips added to stack.`,'ok');
 renderPokerUI(true);
}
function toggleHouseOpponent(enabled){
 if(app.room){send({type:'poker_house',enabled});return;}
 const snap=seatedPokerSnapshot()||viewedPokerSnapshot();
 const t=ensureSoloTables()?.[snap?.tableId||0];if(!t)return;
 t.setHouse(enabled,Date.now());
 syncSoloPokerSnapshots();
 renderPokerUI(true);
}
function sendPokerAct(action,amount=0){
 if(app.room){send({type:'poker_act',action,amount});return;}
 const snap=seatedPokerSnapshot();if(!snap)return;
 const t=ensureSoloTables()?.[snap.tableId||0];if(!t)return;
 const res=t.act(SOLO_ID,action,amount,Date.now());
 if(!res.ok){showPokerToast(res.error,'warn');return;}
 t.tick(Date.now());
 syncSoloPokerSnapshots();
 renderPokerMini();renderPokerUI(true);
}

const pokerHandResults=new Map();
function syncPokerResult(snap,seated){
 const el=$id('socialPokerResult');if(!el)return;
 const now=Date.now();
 const current=el.dataset.key?pokerHandResults.get(el.dataset.key):null;
 if(el.dataset.key&&(!current||now>current.until)){el.hidden=true;el.innerHTML='';delete el.dataset.key;el.className=''}
 const mini=$id('socialPokerMini');
 if(mini&&mini.dataset.resultUntil&&now>Number(mini.dataset.resultUntil)){mini.classList.remove('is-result-win','is-result-lose','is-result-push');delete mini.dataset.resultUntil}
 if(!snap||!snap.me||snap.tableId!==pokerUI.tableId)return;
 const me=snap.me,seat=snap.seats?.[me.seat],live=['preflop','flop','turn','river'].includes(snap.phase);
 let kind='',title='',detail='';
 if(live&&seat?.folded){kind='lose';title='FOLDED';detail=seat.totalBet?`-${seat.totalBet.toLocaleString()} chips`:'Hand released'}
 else if(snap.phase==='showdown'){
  const winners=(snap.winners||[]).filter(x=>x.amount>0),won=winners.find(x=>x.seat===me.seat);
  if(won){kind=winners.length>1?'push':'win';title=kind==='push'?'SPLIT POT':'YOU WIN';detail=`+${won.amount.toLocaleString()} chips`}
  else{kind='lose';title='YOU LOSE';detail=seat?.totalBet?`-${seat.totalBet.toLocaleString()} chips`:'Next hand is yours'}
 }
 if(!kind)return;
 const key=`${snap.tableId}:${snap.handNo}`;
 if(pokerHandResults.has(key))return;
 const until=now+(kind==='win'?3400:2600);
 pokerHandResults.set(key,{kind,until});
 if(pokerHandResults.size>24)pokerHandResults.delete(pokerHandResults.keys().next().value);
 el.dataset.key=key;el.className=`poker-result is-${kind}`;el.hidden=false;
 const burst=kind==='win'?'<i class="poker-result-burst" aria-hidden="true"><b></b><b></b><b></b><b></b><b></b><b></b></i>':'';
 el.innerHTML=`<div class="poker-result-card" role="status"><strong>${title}</strong><span>${detail}</span>${burst}</div>`;
 if(mini&&!mini.hidden){mini.classList.remove('is-result-win','is-result-lose','is-result-push');mini.classList.add(`is-result-${kind}`);mini.dataset.resultUntil=String(until)}
}
// v285: Local chat spoken by someone at the viewed table pops a small, transient
// bubble on that seat (or the dealer plaque). It never enters storage, never blocks
// a card/button, and expires on the same 200ms clock as the turn timer.
const pokerTableChat=new Map();let pokerTableChatSeq=0;const POKER_TABLE_CHAT_MS=6000;
function pokerTableChatBubble(m,tableId){
 if(!m||m.channel!=='local'||!app.room||m.room!==app.room||app.muted.has(m.from))return false;
 const body=typeof m.body==='string'?m.body.slice(0,300):'';
 const emotion=R.EMOTIONS.includes(m.emotion)?m.emotion:'';
 if(!body&&!emotion)return false;
 const tid=Number.isInteger(tableId)?tableId:(viewedPokerSnapshot()?.tableId??pokerUI.tableId);
 const snap=allPokerSnapshots()[tid];if(!snap)return false;
 let key;
 if(m.from===0)key=`${tid}:dealer`;
 else{
  const idx=snap.seats?.findIndex(s=>s&&s.id===m.from);
  if(!Number.isInteger(idx)||idx<0)return false;
  key=`${tid}:${idx}`;
 }
 const now=Date.now();
 pokerTableChat.set(key,{key,tableId:tid,from:m.from,name:String(m.name||'').slice(0,32),body,emotion,serial:++pokerTableChatSeq,startedAt:now,until:now+POKER_TABLE_CHAT_MS});
 if(pokerTableChat.size>12)for(const k of pokerTableChat.keys()){if(k!==key)pokerTableChat.delete(k);if(pokerTableChat.size<=8)break}
 syncPokerTableChat();return true;
}
function syncPokerTableChat(){
 const box=$id('socialPokerBody');if(!box)return;
 const now=Date.now();
 for(const [key,e] of pokerTableChat)if(now>e.until||app.muted.has(e.from))pokerTableChat.delete(key);
 const active=new Map();
 const visible=pokerUI.open&&!$id('socialPokerModal').hidden&&pokerUI.tab==='t'+pokerUI.tableId;
 if(visible){
  const snap=viewedPokerSnapshot();
  if(snap&&snap.tableId===pokerUI.tableId)for(const [key,e] of pokerTableChat){
   if(e.tableId!==pokerUI.tableId)continue;
   let cell=null,ok=true;
   if(key.endsWith(':dealer'))cell=box.querySelector('.poker-cell.dealer-slot');
   else{
    const idx=Number(key.split(':')[1]),seat=snap.seats?.[idx];
    if(!seat||seat.id!==e.from)ok=false;else cell=box.querySelector('.poker-cell.s'+idx);
   }
   if(!ok||!cell){pokerTableChat.delete(key);continue}
   active.set(key,{e,cell});
  }
 }
 for(const node of box.querySelectorAll('.poker-table-bubble'))if(!active.has(node.dataset.key))node.remove();
 for(const [key,{e,cell}] of active){
  let node=cell.querySelector('.poker-table-bubble[data-key="'+key+'"]');
  if(node&&Number(node.dataset.serial)!==e.serial){node.remove();node=null}
  if(!node){
   node=document.createElement('div');node.className='poker-table-bubble';node.dataset.key=key;node.dataset.serial=String(e.serial);node.setAttribute('aria-hidden','true');
   if(e.emotion){node.classList.add('is-emotion');const img=document.createElement('img');img.src=emojiURL(e.emotion);img.alt='/'+e.emotion;img.title='/'+e.emotion;node.append(img)}
   else node.textContent=e.body;
   if(now-e.startedAt<300)node.classList.add('is-fresh');
   cell.append(node);
  }
  node.classList.toggle('is-leaving',now>e.until-300);
 }
}
function renderPokerMini(){
 const btn=$id('socialPokerMini');if(!btn)return;
 const seated=seatedPokerSnapshot();
 const target=seated||(pokerUI.minimized?viewedPokerSnapshot():null);
 if(pokerUI.open||!target||(!seated&&!pokerUI.minimized)){btn.hidden=true;btn.className='';return;}
 btn.hidden=false;
 const mySeat=seated?target.seats[seated.me.seat]:null;
 const cards=mySeat?.cards?.length?mySeat.cards.map(c=>cardHTML(c,true)).join(''):'';
 btn.innerHTML=`<span class="poker-mini-tag">T${(target.tableId||0)+1}</span>${cards?`<span class="poker-mini-cards">${cards}</span>`:''}<span class="poker-mini-pot">Pot 🪙 ${(target.pot||0).toLocaleString()}</span><b id="socialPokerMiniTimer" class="poker-mini-timer">Open</b><i class="poker-mini-bar"><span id="socialPokerMiniBar"></span></i>`;
 updatePokerTurnClock();
}

function updatePokerTurnClock(){
 if(!P)return;
 const seated=seatedPokerSnapshot();
 const viewed=viewedPokerSnapshot();
 syncPokerResult(viewed,seated);
 syncPokerTableChat();
 const target=pokerUI.open?viewed:(seated||viewed);
 // Sync modal turn bar if visible
 const fill=$id('pokerTurnFill'),lbl=$id('pokerTurnSec');
 if(viewed&&['preflop','flop','turn','river'].includes(viewed.phase)&&viewed.turnLeftMs>0){
  const left=Math.max(0,viewed.turnLeftMs-(Date.now()-(viewed._clientAt||Date.now())));
  const sec=Math.ceil(left/1000);
  const pct=Math.max(0,Math.min(100,(left/P.TURN_MS)*100));
  if(fill)fill.style.width=pct.toFixed(1)+'%';
  if(lbl)lbl.textContent=sec+'s';
  fill?.closest('.poker-turn-pill')?.classList.toggle('is-urgent',viewed.me?.isTurn&&sec<=6);
 }
 // Sync minimized pill & toolbar button blinking + live countdown timer
 const mini=$id('socialPokerMini'),miniTimer=$id('socialPokerMiniTimer'),miniBar=$id('socialPokerMiniBar');
 const navBtn=$id('socialPokerBtn'),navTxt=$id('socialPokerBtnText');
 const isMyTurn=!!seated?.me?.isTurn;
 let sec=0,pct=0,mode='idle';
 if(target){
  const elapsed=Math.max(0,Date.now()-(target._clientAt||Date.now()));
  if(['preflop','flop','turn','river'].includes(target.phase)&&target.turnLeftMs>0){
   const left=Math.max(0,target.turnLeftMs-elapsed);
   sec=Math.ceil(left/1000);pct=Math.max(0,Math.min(100,(left/P.TURN_MS)*100));
   mode=target.me?.isTurn?'myturn':'turn';
  }else if((target.phase==='starting'||target.phase==='showdown')&&target.phaseLeftMs>0){
   const total=target.phase==='starting'?P.DEAL_DELAY_MS:P.SHOWDOWN_MS;
   const left=Math.max(0,target.phaseLeftMs-elapsed);
   sec=Math.ceil(left/1000);pct=Math.max(0,Math.min(100,(left/total)*100));
   mode='phase';
  }
 }
 if(mini&&!mini.hidden){
  mini.classList.toggle('is-turn-blink',mode==='myturn');
  mini.classList.toggle('is-urgent-blink',mode==='myturn'&&sec<=6);
  mini.classList.toggle('is-watch-pulse',mode==='turn'||mode==='phase');
  if(miniTimer){
   if(mode==='myturn')miniTimer.textContent=`⚡ YOUR TURN · ${sec}s`;
   else if(mode==='turn')miniTimer.textContent=`⏱ ${target.turnName||'Turn'} · ${sec}s`;
   else if(mode==='phase')miniTimer.textContent=`⏱ Next · ${sec}s`;
   else miniTimer.textContent=seated?`Seat ${seated.me.seat+1} · Open`:'Watch Table';
  }
  if(miniBar)miniBar.style.width=(mode==='idle'?0:pct).toFixed(1)+'%';
 }
 if(navBtn&&navTxt){
  const blinkToolbar=!pokerUI.open&&isMyTurn;
  navBtn.classList.toggle('is-turn-blink',blinkToolbar);
  let tSec=0;
  if(blinkToolbar&&seated){
   const left=Math.max(0,(seated.turnLeftMs||0)-(Date.now()-(seated._clientAt||Date.now())));
   tSec=Math.ceil(left/1000);
  }
  const label=blinkToolbar&&tSec>0?`🃏 YOUR TURN (${tSec}s)`:'🃏 Hold\'em';
  if(navTxt.textContent!==label)navTxt.textContent=label;
 }
}

function renderPokerUI(force=false){
 if(!P)return;
 syncPokerBadges();
 if(!pokerUI.open)return;
 const w=pokerWallet();
 const snap=viewedPokerSnapshot();
 const seated=seatedPokerSnapshot();
 const curZeny=Math.max(0,Math.floor(Number((typeof S==='object'&&S)?S.zeny:0)||0));
 const headTitle=$id('socialPokerHeadTitle'),sub=$id('socialPokerRoomSub');
 const tSpec=R.POKER.tables?.[pokerUI.tableId]||R.POKER.tables?.[0];
 if(headTitle)headTitle.textContent=`🃏 Plaza Hold'em · ${tSpec?.label||'Table 1'}`;
 if(sub)sub.textContent=(app.room?`Plaza ${app.room} · `:'Solo Plaza · ')+`${tSpec?.dealer?.name||'Dealer Vane'} · Blinds ${P.SMALL_BLIND}/${P.BIG_BLIND} · AFK Kick ${P.AFK_MAX_TIMEOUTS}×`;
 for(const b of hub.querySelectorAll('#socialPokerNav [data-ptab]'))b.setAttribute('aria-selected',String(b.dataset.ptab===pokerUI.tab));
 const toastEl=$id('socialPokerToast');
 if(toastEl){
  if(pokerUI.toast&&Date.now()<pokerUI.toastUntil){toastEl.textContent=pokerUI.toast;toastEl.dataset.kind=pokerUI.toastKind||'info';toastEl.hidden=false;}
  else{toastEl.hidden=true;pokerUI.toast='';}
 }
 const key=JSON.stringify([pokerUI.tab,pokerUI.tableId,w.chips,w.freeClaimed,curZeny,snap?.seq,snap?.phase,snap?.turnSeat,snap?.pot,seated?.tableId,seated?.me?.seat,pokerUI.buyIn]);
 if(!force&&key===pokerUI.renderKey)return;
 pokerUI.renderKey=key;
 const box=$id('socialPokerBody');if(!box)return;

 if(pokerUI.tab==='bank'){
  const onTable=seated?.me?(seated.me.stack||0)+(seated.me.pendingAdd||0):0;
  const reserve=Math.max(0,w.chips-onTable);
  box.innerHTML=`<div class="poker-bank-grid">
   <div class="poker-bank-balances">
    <div>
     <small>PLAZA CHIPS WALLET</small>
     <strong>🪙 ${w.chips.toLocaleString()}</strong>
     <span>${seated?.me?`Table ${seated.tableId+1}: ${onTable.toLocaleString()} · Reserve: ${reserve.toLocaleString()}`:'Ready for Table 1 or Table 2 buy-in'}</span>
    </div>
    <div>
     <small>AVAILABLE ZENY</small>
     <strong>💰 ${curZeny.toLocaleString()}z</strong>
     <span>${seated?.me&&reserve>0?`<button type="button" id="pokerTopUpReserveBtn" class="poker-inline-btn">+ Top Up Seat (${Math.min(reserve,P.DEFAULT_BUY_IN).toLocaleString()})</button>`:'Instant Zeny → Plaza Chips exchange'}</span>
    </div>
   </div>
   <div class="poker-free-card">
    <div class="poker-free-info">
     <span class="poker-eyebrow">ONCE PER DAY · RESETS 00:00 UTC+8</span>
     <h3>🎁 Daily Free Chip Grant (+${P.DAILY_FREE_CHIPS.toLocaleString()} Chips)</h3>
     <p>${w.freeClaimed===0?'Your daily complimentary stack is ready to claim right now.':`Claimed for today · Next free refill in ${pokerCountdown()}.`}</p>
    </div>
    <button type="button" id="pokerClaimFreeBtn" class="poker-gold-btn" ${w.freeClaimed>=1?'disabled':''}>${w.freeClaimed===0?`Claim +${P.DAILY_FREE_CHIPS.toLocaleString()} Free`:`Resets in ${pokerCountdown()}`}</button>
   </div>
   <div class="poker-pack-grid">
    ${P.ZENY_PACKS.map(pk=>`<div class="poker-pack-card">
     <span class="poker-pack-tag">${escape(pk.label)}</span>
     <strong>🪙 +${pk.chips.toLocaleString()} Chips</strong>
     <p>${escape(pk.desc)}</p>
     <button type="button" data-zpack="${pk.id}" class="poker-primary-btn" ${curZeny<pk.zeny?'disabled':''}>Buy · ${pk.zeny.toLocaleString()}z</button>
    </div>`).join('')}
   </div>
  </div>`;
  $id('pokerClaimFreeBtn')?.addEventListener('click',claimDailyPokerChips);
  $id('pokerTopUpReserveBtn')?.addEventListener('click',()=>topUpTableStack());
  for(const b of box.querySelectorAll('[data-zpack]'))b.onclick=()=>buyPokerChipsWithZeny(b.dataset.zpack);
  return;
 }

 // Hold'em Table tab (4x3 fixed perimeter grid + compact single-row dock, zero scrolling)
 const winSeats=new Set((snap?.winners||[]).map(x=>x.seat));
 const bestCards=new Set((snap?.winners||[]).flatMap(x=>x.best5||[]));
 const potPulse=pokerUI.lastPot!==undefined&&pokerUI.lastPot!==(snap?.pot||0)?' is-changing':'';pokerUI.lastPot=snap?.pot||0;
 const comm=[0,1,2,3,4].map(i=>{const c=snap?.community?.[i]||null;return cardHTML(c,false,c&&bestCards.has(c),`t${pokerUI.tableId}h${snap?.handNo||0}boardc${i}`);}).join('');

 const seatHTML=idx=>{
  const globalId=(pokerUI.tableId||0)*6+idx;
  const s=snap?.seats?.[idx];
  if(!s){
   const canSitHere=!seated||seated.tableId!==pokerUI.tableId||!['preflop','flop','turn','river'].includes(snap?.phase);
   return canSitHere
    ?`<button type="button" class="poker-seat open" data-sitseat="${globalId}"><span>+ Seat ${idx+1}</span><small>Click to sit</small></button>`
    :`<div class="poker-seat empty"><span>Seat ${idx+1}</span><small>Open</small></div>`;
  }
  const isMe=snap?.me?.seat===idx;
  const pucks=[s.isDealer?'<i class="puck d">D</i>':'',s.isSB?'<i class="puck sb">SB</i>':'',s.isBB?'<i class="puck bb">BB</i>':''].join('');
  const afkWarn=s.missedTurns>0?`<i class="puck afk">AFK ${s.missedTurns}/${P.AFK_MAX_TIMEOUTS}</i>`:'';
  return `<div class="poker-seat occupied${isMe?' is-me':''}${s.isTurn?' is-turn':''}${s.folded?' is-folded':''}${winSeats.has(idx)?' is-win':''}">
   <div class="poker-seat-head"><span class="poker-seat-name">${escape(s.name)}${isMe?' <i>(You)</i>':''}</span>${pucks}${afkWarn}</div>
   <div class="poker-seat-row">
    <div class="poker-seat-cards">${s.cards.length?s.cards.map((c,ci)=>cardHTML(c,true,bestCards.has(c),`t${pokerUI.tableId}h${snap?.handNo||0}s${idx}c${ci}`)).join(''):'<span class="pcard slot sm"></span><span class="pcard slot sm"></span>'}</div>
    <div class="poker-seat-meta"><span>🪙 ${s.stack.toLocaleString()}</span>${s.streetBet>0?`<b>Bet ${s.streetBet}</b>`:s.lastTag?`<b>${escape(s.lastTag)}</b>`:''}${s.handHint?`<em class="poker-hand-hint">${escape(s.handHint)}</em>`:''}</div>
   </div>
  </div>`;
 };

 const dName=snap?.dealerName||tSpec?.dealer?.name||'Dealer Vane';
 let houseHTML='';
 if(snap?.house){
  const h=snap.house;
  houseHTML=`<div class="poker-seat occupied house${h.isTurn?' is-turn':''}${h.folded?' is-folded':''}${winSeats.has('vane')?' is-win':''}">
   <div class="poker-seat-head"><span class="poker-seat-name">🃏 ${escape(h.name)} <i>(House)</i></span>${h.isDealer?'<i class="puck d">D</i>':''}${h.isSB?'<i class="puck sb">SB</i>':''}${h.isBB?'<i class="puck bb">BB</i>':''}</div>
   <div class="poker-seat-row">
    <div class="poker-seat-cards">${h.cards.length?h.cards.map((c,ci)=>cardHTML(c,true,bestCards.has(c),`t${pokerUI.tableId}h${snap?.handNo||0}housec${ci}`)).join(''):'<span class="pcard slot sm"></span><span class="pcard slot sm"></span>'}</div>
    <div class="poker-seat-meta"><span>🪙 ${h.stack.toLocaleString()}</span>${h.streetBet>0?`<b>Bet ${h.streetBet}</b>`:h.lastTag?`<b>${escape(h.lastTag)}</b>`:''}${h.handHint?`<em class="poker-hand-hint">${escape(h.handHint)}</em>`:''}</div>
   </div>
  </div>`;
 }else{
  houseHTML=`<div class="poker-dealer-plaque"><strong>🃏 ${escape(dName)}</strong><small>${snap?.seatedCount>=2?'Dealing multiplayer Hold\'em':'Sit to deal heads-up or up to 6 players'}</small></div>`;
 }

 const otherSeated=seated&&seated.tableId!==pokerUI.tableId;
 let dockHTML='';
 if(!snap?.me){
  const buyOpts=[200,500,1000,2500,5000].filter(v=>v<=Math.max(200,w.chips));
  if(w.chips>=P.MIN_BUY_IN&&!buyOpts.includes(Math.min(w.chips,P.MAX_BUY_IN)))buyOpts.push(Math.min(w.chips,P.MAX_BUY_IN));
  buyOpts.sort((a,b)=>a-b);
  const selVal=Math.max(P.MIN_BUY_IN,Math.min(w.chips||P.DEFAULT_BUY_IN,pokerUI.buyIn));
  const anyOpen=snap?.seats?.some(s=>!s);
  dockHTML=`<div class="poker-dock unseated">
   <span class="poker-dock-lead">${otherSeated?`Currently seated at Table ${seated.tableId+1} · Click a seat here to move tables`:'Select an open seat (1–6) or Quick Sit to walk over &amp; play'}</span>
   <div class="poker-dock-controls">
    ${w.chips>=P.MIN_BUY_IN?`<label class="poker-buyin-lbl">Buy-in <select id="pokerBuyInSelect">${buyOpts.map(v=>`<option value="${v}"${v===selVal?' selected':''}>${v.toLocaleString()}</option>`).join('')}</select></label>
     ${anyOpen?`<button type="button" id="pokerQuickSitBtn" class="poker-gold-btn">Sit at ${escape(tSpec?.label||'Table')}</button>`:''}`
     :`<button type="button" data-gotab="bank" class="poker-gold-btn">🪙 Refill Chips (Min ${P.MIN_BUY_IN})</button>`}
    ${otherSeated?`<button type="button" data-gotab="t${seated.tableId}" class="poker-sub-btn">Go to My Seat (T${seated.tableId+1})</button>`:''}
    <button type="button" data-gotab="bank" class="poker-sub-btn">Chip Bank${w.freeClaimed===0?' (!)':''}</button>
   </div>
  </div>`;
 }else if(snap.me.isTurn){
  const me=snap.me;
  const minR=Math.max(P.BIG_BLIND,me.minRaiseTo||P.BIG_BLIND),maxR=Math.max(minR,me.maxTo||minR);
  if(pokerUI.raiseTo<minR||pokerUI.raiseTo>maxR)pokerUI.raiseTo=minR;
  const halfPot=Math.max(minR,Math.min(maxR,Math.round(((snap.currentBet||0)+Math.max(P.BIG_BLIND,snap.pot*0.5))/10)*10));
  const fullPot=Math.max(minR,Math.min(maxR,Math.round(((snap.currentBet||0)+Math.max(P.BIG_BLIND,snap.pot))/10)*10));
  dockHTML=`<div class="poker-dock acting">
   <div class="poker-turn-pill"><span>⚡ Your Turn${me.missedTurns>0?` (AFK ${me.missedTurns}/${me.afkMax})`:''}</span><strong id="pokerTurnSec">20s</strong><i class="poker-turn-track"><span id="pokerTurnFill"></span></i></div>
   <div class="poker-dock-controls">
    <button type="button" data-pact="fold" class="poker-danger-btn">Fold</button>
    <button type="button" data-pact="${me.canCheck?'check':'call'}" class="poker-primary-btn">${me.canCheck?'Check':`Call ${Math.min(me.stack,me.toCall).toLocaleString()}`}</button>
    ${me.canRaise?`<div class="poker-raise-box">
     <button type="button" id="pokerRaiseBtn" class="poker-gold-btn">${pokerUI.raiseTo>=maxR?'All-In ':'Raise '}${pokerUI.raiseTo.toLocaleString()}</button>
     <input id="pokerRaiseSlider" type="range" min="${minR}" max="${maxR}" step="10" value="${pokerUI.raiseTo}" aria-label="Raise amount">
     <div class="poker-presets">
      <button type="button" data-rpreset="${minR}">Min</button>
      <button type="button" data-rpreset="${halfPot}">½P</button>
      <button type="button" data-rpreset="${fullPot}">Pot</button>
      <button type="button" data-rpreset="${maxR}">Max</button>
     </div>
    </div>`:''}
    <button type="button" id="pokerStandBtn" class="poker-sub-btn" title="Fold &amp; leave seat">Stand</button>
   </div>
  </div>`;
 }else{
  const onTable=(snap.me.stack||0)+(snap.me.pendingAdd||0);
  const reserve=Math.max(0,w.chips-onTable);
  dockHTML=`<div class="poker-dock seated">
   <span class="poker-dock-lead">Seat <b>${snap.me.seat+1}</b> · Stack <b>🪙 ${snap.me.stack.toLocaleString()}</b>${reserve?` · Reserve <b>${reserve.toLocaleString()}</b>`:''}${snap.me.missedTurns>0?` · <b class="poker-afk-inline">AFK Warning ${snap.me.missedTurns}/${snap.me.afkMax}</b>`:''}</span>
   <div class="poker-dock-controls">
    ${snap.seatedCount===1?`<label class="poker-house-toggle"><input type="checkbox" id="pokerHouseChk" ${snap.vsHouse?'checked':''}> vs. ${escape(dName)}</label>`:''}
    ${snap.me.stack<P.BIG_BLIND&&reserve>=P.BIG_BLIND?`<button type="button" id="pokerQuickTopUp" class="poker-gold-btn">+ Rebuy</button>`:reserve>0?`<button type="button" id="pokerQuickTopUp" class="poker-sub-btn">+ Top Up</button>`:''}
    <button type="button" data-gotab="bank" class="poker-sub-btn">🪙 Bank${w.freeClaimed===0?' (!)':''}</button>
    <button type="button" id="pokerStandBtn" class="poker-danger-btn">Stand Up</button>
   </div>
  </div>`;
 }

 box.innerHTML=`<div class="poker-table-grid">
  <div class="poker-arena">
   <div class="poker-cell s0">${seatHTML(0)}</div>
   <div class="poker-cell dealer-slot">${houseHTML}</div>
   <div class="poker-cell s5">${seatHTML(5)}</div>
   <div class="poker-cell s1">${seatHTML(1)}</div>
   <div class="poker-cell felt-slot">
    <div class="poker-felt">
     <div class="poker-pot-line"><span>POT</span><strong class="${potPulse}">🪙 ${(snap?.pot||0).toLocaleString()}</strong>${snap?.currentBet?`<small>Bet ${snap.currentBet.toLocaleString()}</small>`:''}${snap?.handNo?`<small>#${snap.handNo}</small>`:''}</div>
     <div class="poker-community" aria-label="Community cards">${comm}</div>
     <p class="poker-banner">${escape(snap?.banner||'Sit at any stool to start Hold\'em.')}</p>
    </div>
   </div>
   <div class="poker-cell s4">${seatHTML(4)}</div>
   <div class="poker-cell info-left"><div class="poker-corner-pill"><b>Blinds ${P.SMALL_BLIND}/${P.BIG_BLIND}</b><small>20s turn · ${P.AFK_MAX_TIMEOUTS}× AFK kick</small></div></div>
   <div class="poker-cell s2">${seatHTML(2)}</div>
   <div class="poker-cell s3">${seatHTML(3)}</div>
   <div class="poker-cell info-right"><div class="poker-corner-pill"><b>${escape(tSpec?.label||'Table 1')}</b><small>${snap?.seatedCount||0}/6 seated</small></div></div>
  </div>
  ${dockHTML}
 </div>`;

 syncPokerTableChat();
 updatePokerTurnClock();
 for(const b of box.querySelectorAll('[data-sitseat]'))b.onclick=()=>pokerSeatAction(Number(b.dataset.sitseat));
 for(const b of box.querySelectorAll('[data-gotab]'))b.onclick=()=>switchPokerTab(b.dataset.gotab);
 $id('pokerBuyInSelect')?.addEventListener('change',e=>{pokerUI.buyIn=Number(e.target.value)||P.DEFAULT_BUY_IN;renderPokerUI(true);});
 $id('pokerQuickSitBtn')?.addEventListener('click',()=>{
  const openIdx=[0,1,2,3,4,5].find(i=>!snap?.seats?.[i]);
  if(openIdx!=null)pokerSeatAction((pokerUI.tableId||0)*6+openIdx);
 });
 $id('pokerStandBtn')?.addEventListener('click',standFromPoker);
 $id('pokerQuickTopUp')?.addEventListener('click',()=>topUpTableStack());
 $id('pokerHouseChk')?.addEventListener('change',e=>toggleHouseOpponent(e.target.checked));
 for(const b of box.querySelectorAll('[data-pact]'))b.onclick=()=>sendPokerAct(b.dataset.pact,0);
 const slider=$id('pokerRaiseSlider'),raiseBtn=$id('pokerRaiseBtn');
 if(slider&&raiseBtn){
  const syncRaise=val=>{
   const maxR=Number(slider.max)||val,minR=Number(slider.min)||val;
   const v=Math.max(minR,Math.min(maxR,Number(val)||minR));
   pokerUI.raiseTo=v;slider.value=String(v);
   raiseBtn.textContent=(v>=maxR?'All-In ':'Raise ')+v.toLocaleString();
  };
  slider.oninput=e=>syncRaise(e.target.value);
  for(const p of box.querySelectorAll('[data-rpreset]'))p.onclick=()=>syncRaise(p.dataset.rpreset);
  raiseBtn.onclick=()=>sendPokerAct('raise',pokerUI.raiseTo);
 }
}

setInterval(()=>{
 if(!app.wanted||!P)return;
 if(!app.room&&soloTables){
  const p=app.players.get(SOLO_ID);
  if(p){
   R.advance(p,performance.now());
   let changed=false;
   const now=Date.now();
   for(const t of soloTables){
    const onThisTable=Number.isInteger(p.pokerSeat)&&Math.floor(p.pokerSeat/6)===t.tableId;
    const arrived=onThisTable&&p.sit&&!p.path.length;
    if(t.markArrived(SOLO_ID,arrived,now))changed=true;
    if(t.tick(now))changed=true;
   }
   if(changed){
    const snaps=syncSoloPokerSnapshots();
    if(snaps)for(const s of snaps)s._clientAt=Date.now();
    renderPokerMini();renderPokerUI();
   }
  }
 }
 updatePokerTurnClock();
},200);

function resetPlayers(){app.players.clear();app.scene?.clearPlayers();$id('socialLabels').querySelectorAll('.social-player-label,.social-bubble').forEach(n=>n.remove())}
function currentLook(){const st=typeof S==='object'&&S?S:null;return {cls:st?.cls||'Novice',appearance:st&&typeof wardrobeAppearance==='function'?wardrobeAppearance():{version:1,sex:'m'},refine:Math.max(0,Math.min(15,st?.eq?.weapon?.r||0)),title:st&&typeof HUNT_TITLES!=='undefined'?HUNT_TITLES.find(t=>t.id===st.equippedTitle&&titleUnlocked(t))?.name||'':'',lv:st&&st.auraShow!==false&&!st.hideUI?Math.max(0,Math.min(999,Math.floor(Number(st.lv)||0))):0,speed:st&&typeof moveSpd==='function'?Math.round(moveSpd(true)*100)/100:0}}
function soloName(){const u=typeof CLOUD!=='undefined'&&CLOUD.user?(typeof CLOUD.user==='string'?CLOUD.user:CLOUD.user.username):typeof currentUser==='string'&&currentUser?currentUser:'';return u||app.user||'Adventurer'}
function syncSoloPlayer(){if(!app.wanted||!app.scene||app.room)return;let p=app.players.get(SOLO_ID);const look=currentLook(),name=soloName();if(!p)p={id:SOLO_ID,name,room:0,x:0,z:12,dir:0,sit:false,seat:null,pokerSeat:null,path:[],at:performance.now(),look};else{R.advance(p,performance.now());p.name=name;p.look=look}putPlayer(p)}
function clearSoloPokerIfSeated(p){
 if(Number.isInteger(p.pokerSeat)&&soloTables){
  const tid=Math.floor(p.pokerSeat/6);
  soloTables[tid]?.stand(SOLO_ID,Date.now());
  syncSoloPokerSnapshots();renderPokerMini();renderPokerUI(true);
 }
}
function moveAction(x,z){confirmPokerLeave(confirmLeave=>performMoveAction(x,z,confirmLeave))}
function performMoveAction(x,z,confirmLeave){if(app.room&&send({type:'move',x,z,confirmLeave}))return;if(app.room)return;const p=app.players.get(SOLO_ID);if(!p)return;R.advance(p,performance.now());const route=R.path(p,{x,z});if(!route.length)return;clearSoloPokerIfSeated(p);p.path=route;p.sit=false;p.seat=null;p.pokerSeat=null;putPlayer(p)}
function seatAction(id){confirmPokerLeave(confirmLeave=>performSeatAction(id,confirmLeave))}
function performSeatAction(id,confirmLeave){if(app.room&&send({type:'seat',id,confirmLeave}))return;if(app.room||!Number.isInteger(id)||!R.SEATS[id])return;const p=app.players.get(SOLO_ID),seat=R.SEATS[id];if(!p)return;R.advance(p,performance.now());const route=R.path(p,seat);if(!route.length&&Math.hypot(p.x-seat.x,p.z-seat.z)>.5)return;clearSoloPokerIfSeated(p);p.path=route;p.sit=!route.length;p.seat=seat.id;p.pokerSeat=null;if(!route.length){p.x=seat.x;p.z=seat.z}putPlayer(p)}
function toggleSit(){confirmPokerLeave(confirmLeave=>performToggleSit(confirmLeave))}
function performToggleSit(confirmLeave){if(app.room&&send({type:'sit',confirmLeave}))return;if(app.room)return;const p=app.players.get(SOLO_ID);if(!p)return;R.advance(p,performance.now());clearSoloPokerIfSeated(p);p.path=[];p.seat=null;p.pokerSeat=null;p.sit=!p.sit;putPlayer(p)}
function join(){if(!app.connected)return;send({type:'join',look:currentLook(),friends:[...app.friends]})}
async function enter(){if(app.entering)return;app.entering=true;app.wanted=true;hub.hidden=false;document.body.classList.add('social-open');syncPokerBadges();syncPokerBounds();if(tabs.includes('map'))openTab('map');if(CLOUD.on&&!app.socket){app.nextConnect=0;connect()}try{if(!app.scene)app.scene=await PGSocialScene.create($id('socialScene'),$id('socialLabels'),{move:moveAction,menu:playerMenu,self:()=>app.room?app.id:SOLO_ID,seat:seatAction,pokerSeat:pokerSeatAction,pokerOpen:tid=>pokerOpen(tid),sitting,camera:cameraUI});if(app.wanted){app.scene.active=true;cameraUI(app.scene.cameraState);for(const p of app.players.values())app.scene.putPlayer(p);join();if(!app.room){syncSoloPlayer();if(P){const snaps=syncSoloPokerSnapshots();if(snaps)for(const s of snaps)s._clientAt=Date.now();}}if(typeof BGM!=='undefined')BGM.sync(typeof S==='object'&&S?S.mp:0)}}catch(e){status('Plaza could not load. Return to the field and try again.');console.error(e)}finally{app.entering=false}}
function leave(){if(pokerLeaveAction)finishPokerLeave(false);app.wanted=false;app.resume=null;pokerUI.open=false;pokerUI.minimized=false;$id('socialPokerModal').hidden=true;$id('socialPokerMini').hidden=true;if(soloTables){for(const t of soloTables)t.stand(SOLO_ID,Date.now());app.poker=null;app.pokerTables=null;}send({type:'leave'});app.room=0;app.rooms=[];hub.hidden=true;syncPokerChatFit();syncPokerBounds();document.body.classList.remove('social-open');if(app.scene)app.scene.active=false;resetPlayers();app.messages=app.messages.filter(m=>m.channel!=='local');pokerTableChat.clear();select('world');if(typeof bars==='function'&&typeof S==='object'&&S)bars();if(typeof renderWin==='function'&&typeof S==='object'&&S)renderWin();if(typeof BGM!=='undefined')BGM.sync(typeof S==='object'&&S?S.mp:0)}
$id('socialLeave').onclick=()=>confirmPokerLeave(()=>leave());$id('socialSit').onclick=toggleSit;
function receive(m){if(m.type==='hello'){app.connected=true;app.id=m.id;app.retry=0;status('Connected · World & private chat');app.messages=mergeChatMessages(app.messages.filter(x=>x.channel!=='world'),readWorldHistory(),m.history);saveWorldHistory();renderMessages();if(app.wanted&&app.scene)join();else app.resume=null}
 if(m.type==='error'){status(m.message);population();}
 if(m.type==='rooms'&&Array.isArray(m.rooms)){app.rooms=m.rooms;population();}
 if(m.type==='poker_error'||m.type==='poker_leave_required'){showPokerToast(m.message,'warn');pokerOpen('table');renderPokerUI(true);}
 if(m.type==='poker_kicked'){
  const me=app.players.get(app.id);if(me){me.pokerSeat=null;me.sit=false;me.path=[];putPlayer(me);}
  showPokerToast(m.message||'Auto-removed from seat due to AFK inactivity.','warn');
  renderPokerMini();renderPokerUI(true);
 }
 if(m.type==='poker_ledger')applyPokerLedger(m.delta);
 if(m.type==='poker_callout'&&m.room===app.room)handlePokerCallout(m.body,m.tableId||0);
 if(m.type==='poker'){
  const now=Date.now();
  const list=Array.isArray(m.tables)?m.tables:m.poker?[m.poker]:[];
  for(const s of list)if(s)s._clientAt=now;
  app.pokerTables=list;
  app.poker=m.poker||list[0]||null;
  if(app.poker)app.poker._clientAt=now;
  const my=list.find(s=>s&&s.me);
  if(my&&pokerUI.tab.startsWith('t')&&pokerUI.tableId!==my.tableId&&!list[pokerUI.tableId]?.me){
   pokerUI.tableId=my.tableId;pokerUI.tab='t'+my.tableId;
  }
  app.scene?.updatePoker?.(list);
  renderPokerMini();renderPokerUI();updatePokerTurnClock();
 }
 if(m.type==='reauth')return refreshSocket();
 if(m.type==='room'){friendPresenceChanged();if(soloTables)for(const t of soloTables)t.stand(SOLO_ID,Date.now());app.room=m.room;if(Array.isArray(m.rooms))app.rooms=m.rooms;resetPlayers();app.messages=app.messages.filter(x=>x.channel!=='local');pokerTableChat.clear();for(const p of m.players)putPlayer(p);if(app.room)select('local');else syncSoloPlayer();tabsUI();population();if(app.resume&&app.room){const r=app.resume;app.resume=null;if(Number.isInteger(r.pokerSeat)&&!Number.isInteger(app.players.get(app.id)?.pokerSeat))send({type:'poker_sit',seat:r.pokerSeat,buyIn:Math.max(P?.MIN_BUY_IN||40,Math.min(pokerWallet().chips,r.pokerBuyIn||P?.DEFAULT_BUY_IN||1000))});else if(Number.isInteger(r.seat)&&app.players.get(app.id)?.seat!==r.seat)send({type:'seat',id:r.seat});else if(r.sit&&!app.players.get(app.id)?.sit)send({type:'sit',confirmLeave:true})}renderPokerUI(true)}
 if(m.type==='player'&&m.player.room===app.room){putPlayer(m.player);friendPresenceChanged()}

 if(m.type==='left'&&m.room===app.room){app.players.delete(m.id);app.scene?.removePlayer(m.id);population();friendPresenceChanged()}
 if(m.type==='message'){if(m.channel==='local'&&m.room!==app.room)return;app.messages=mergeChatMessages(app.messages,[m]);if(m.channel==='world')saveWorldHistory();if(app.channel!==m.channel||chat.classList.contains('minimized'))app.unread.add(m.channel);if(!app.muted.has(m.from)){if(m.channel==='local'){app.scene?.bubble(m.from,m);pokerTableChatBubble(m)}if(app.channel===m.channel)renderMessages(true)}tabsUI()}}
const WATCHDOG_MS=20000,PROBE_GRACE_MS=6000;
function seatState(){const me=app.players.get(app.id);const seated=seatedPokerSnapshot();return me?{seat:Number.isInteger(me.seat)?me.seat:null,pokerSeat:Number.isInteger(me.pokerSeat)?me.pokerSeat:null,pokerBuyIn:seated?.me?.stack||pokerUI.buyIn,sit:!!me.sit}:app.resume}
function dropSocket(message,keep){const ws=app.socket;app.socket=null;app.connected=false;app.probeAt=0;if(keep)app.resume=seatState();try{ws?.close()}catch{}status(message);app.nextConnect=0}
function refreshSocket(){dropSocket('Refreshing chat…',true)}
function heartbeat(now){if(!app.connected||!app.socket||app.socket.readyState!==1){app.probeAt=0;return}
 if(now-(app.lastSeen||now)<WATCHDOG_MS){app.probeAt=0;return}
 if(!app.probeAt){app.probeAt=now;send({type:'ping'});return}
 if(now-app.probeAt>PROBE_GRACE_MS)dropSocket('Chat connection lost — reconnecting…',true)}
function sitting(sit){$id('socialSit').textContent=sit?'Stand · Insert':'Sit · Insert';$id('socialSit').setAttribute('aria-pressed',String(sit))}
function putPlayer(p){p.at=performance.now();app.players.set(p.id,p);app.scene?.putPlayer(p);if(p.id===(app.room?app.id:SOLO_ID))sitting(p.sit);population()}
function population(){
 $id('socialPopulation').textContent=app.room?'Plaza '+app.room+' · '+app.players.size+' / 20 adventurers':CLOUD.on?'Connecting to plaza · Solo view':'Solo plaza · Local character';
 const sel=$id('socialRoomSelect');
 if(!sel)return;
 if(!app.room){sel.hidden=true;sel.replaceChildren();return;}
 const list=(Array.isArray(app.rooms)&&app.rooms.length?app.rooms:[{id:app.room,count:app.players.size},{id:app.room+1,count:0}]).map(r=>({id:r.id,count:r.id===app.room?app.players.size:r.count}));
 if(!list.some(r=>r.id===app.room))list.push({id:app.room,count:app.players.size});
 list.sort((a,b)=>a.id-b.id);
 sel.replaceChildren();
 for(const r of list){
  const opt=document.createElement('option');
  opt.value=String(r.id);
  opt.textContent=`Plaza ${r.id} (${r.count}/${R.CAPACITY})`;
  if(r.id!==app.room&&r.count>=R.CAPACITY)opt.disabled=true;
  sel.append(opt);
 }
 sel.value=String(app.room);
 sel.hidden=false;
}
function connect(){if(!CLOUD.on||!CLOUD.user||app.blocked||Date.now()<app.nextConnect)return;const user=typeof CLOUD.user==='string'?CLOUD.user:CLOUD.user.username;if(app.user!==user){app.user=user;app.messages=readWorldHistory();renderMessages();app.unread.clear();try{app.muted=new Set(JSON.parse(localStorage.getItem('pg_social_mute_'+user))||[])}catch{app.muted=new Set()}}
 const qs=CLOUD.previewToken?'?preview_session='+encodeURIComponent(CLOUD.previewToken):'';
 const ws=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/api/social'+qs);app.socket=ws;status('Connecting to chat…');ws.onmessage=e=>{if(app.socket!==ws)return;app.lastSeen=Date.now();app.probeAt=0;try{receive(JSON.parse(e.data))}catch(err){console.error('Social message',err)}};
 ws.onclose=e=>{if(app.socket!==ws)return;app.socket=null;app.connected=false;app.probeAt=0;
  if(e.code===4000){app.resume=seatState();app.nextConnect=0;status('Refreshing chat…');return}
  app.room=0;app.rooms=[];app.poker=null;app.pokerTables=null;pokerTableChat.clear();resetPlayers();syncSoloPlayer();population();tabsUI();renderPokerMini();renderPokerUI(true);status(e.code===4001?'Chat moved to another tab. Reload to reconnect.':'Chat unavailable — retrying…');app.blocked=e.code===4001;app.nextConnect=Date.now()+Math.min(30000,1000*2**Math.min(app.retry++,5))};ws.onerror=()=>status('Chat unavailable — checking connection…');}
let lastLog='',lastLook='';setInterval(()=>{if(app.channel==='log'&&feedHidden())syncDisplay();const account=typeof CLOUD.user==='string'?CLOUD.user:CLOUD.user?.username;if(app.user&&account&&account!==app.user){const ws=app.socket;app.socket=null;ws?.close();app.connected=false;app.messages=[];app.unread.clear();app.friends.clear();app.blocked=false;app.nextConnect=0;leave();app.user=null}if(!CLOUD.on){if(app.user||app.socket){const ws=app.socket;app.socket=null;ws?.close();app.connected=false;app.messages=[];app.unread.clear();app.muted.clear();app.friends.clear();app.blocked=false;app.nextConnect=0;app.user=null;leave()}else if(app.wanted&&app.scene){const look=JSON.stringify(currentLook());if(look!==lastLook){syncSoloPlayer();lastLook=look}}status('Sign in to use player chat');return}if(!app.socket)connect();heartbeat(Date.now());if(app.channel==='log'){const key=JSON.stringify(logShown().map(l=>l.id));if(key!==lastLog){lastLog=key;renderMessages(true)}}const look=JSON.stringify(currentLook());if(app.room&&lastLook&&look!==lastLook)send({type:'look',look:currentLook()});else if(!app.room&&app.wanted&&app.scene&&lastLook&&look!==lastLook)syncSoloPlayer();lastLook=look},2000);
// Someone appeared, moved or left: the friends panel's "in the plaza now" label is drawn from this
// list, so it is redrawn when (and only when) the panel is open.
let friendPaintAt=0;
function friendPresenceChanged(){
 if(!(typeof tabs!=='undefined'&&Array.isArray(tabs)&&tabs.includes('friends')))return;
 if(typeof PGFriends!=='object'||!PGFriends||typeof PGFriends.paint!=='function')return;
 const now=Date.now();if(now-friendPaintAt<1000)return;friendPaintAt=now;PGFriends.paint();
}
// v273: the friends panel hands the accepted list here after every change, so chat marks and the
// plaza's per-viewer `friend` flag follow immediately instead of at the next reconnect.
function syncFriends(ids){const next=new Set((Array.isArray(ids)?ids:[]).filter(Number.isInteger));const changed=next.size!==app.friends.size||[...next].some(id=>!app.friends.has(id));app.friends=next;if(changed){renderMessages(true);if(app.connected&&app.socket&&app.socket.readyState===1)send({type:'friends',ids:[...next]})}}
function whisper(name){const clean=String(name||'').trim();if(!clean)return;$id('socialTo').value=clean;select('whisper');$id('socialInput').focus()}
window.PGSocial={enter,leave,app,select,syncDisplay,pokerOpen,minimizePokerModal,syncPokerBounds,pokerSeatAction,claimDailyPokerChips,buyPokerChipsWithZeny,syncFriends,whisper};select('world');connect();
})();
