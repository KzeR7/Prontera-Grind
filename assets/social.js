/* Real-time chat, Fountain Plaza scene and multiplayer 2-table Plaza Hold'em. Never changes farming combat. */
(function(){
'use strict';
// v323: a bad merge once shipped index.html with this script loaded twice. Two boots mean
// two sockets, and the room kicks the first with 4001 ("another tab") - world chat looked
// moved to another tab in a single tab. Boot once, ever.
if(window.__pgSocialBooted)return;window.__pgSocialBooted=true;
const R=PGSocialRules,P=globalThis.PGSocialPoker||null,$id=id=>document.getElementById(id);
const app={socket:null,user:null,id:null,room:0,rooms:[],plazaFriends:0,wanted:false,channel:'world',messages:[],unread:new Set(),muted:new Set(),friends:new Set(),players:new Map(),retry:0,connected:false,nextConnect:0,blocked:false,scene:null,owner:null,nextChat:0,lastSeen:0,probeAt:0,resume:null,poker:null,pokerTables:null,battle:{pve:[],pvp:null,queue:[]},battleOffset:0,battleRewards:new Set(),battleResult:null,battleIntent:null};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const emojiURL=id=>'assets/social/emotions/'+id+'.png';
// World is public and may be cached per account. Never put whispers or Local messages in storage.
const CHAT_MAX=400,WORLD_CACHE_MAX=200,POKER_LEDGER_IDS_MAX=512;
const pokerLedgerIdValid=id=>typeof id==='string'&&/^[A-Za-z0-9:_-]{1,100}$/.test(id);
function cleanPokerLedgerIds(value){return [...new Set((Array.isArray(value)?value:[]).filter(pokerLedgerIdValid))].slice(-POKER_LEDGER_IDS_MAX)}
const worldHistoryKey=user=>'pg_social_world_v1_'+String(user||'').toLowerCase();
// v313 (owner: "missing local chat history"). Local chat is per plaza and is deliberately never
// written to storage - it can carry whatever people say to the room - but it lived only in
// `app.messages`, and every `room` snapshot that arrived after a reconnect ran a blanket
// `filter(channel!=='local')`. The last lines of each plaza you have been in are now kept in memory,
// so a dropped socket, a planned re-authentication, or a walk back to the plaza you just left shows
// the conversation you were reading instead of an empty tab.
const LOCAL_CACHE_MAX=60,localHistory=new Map();
// v326 (owner: "random disconnect, I lose local chat but world chat is fine"). Two things were wrong.
//   1. The cache lived in a variable, so it died with the page - and this game reloads itself when a
//      new build goes live (v276), which is also what drops the socket. World chat came back because it
//      is cached per account; Local came back empty. It is now mirrored into THIS TAB's sessionStorage:
//      per tab, gone when the tab closes, never shared with another tab, never sent to the server and
//      never in local storage - the privacy rule ("no Local transcript on disk") is unchanged, because
//      a reload is the same tab still open. v313's in-memory cache is still the first stop.
//   2. A stash always used app.room, and the room snapshot below assigns app.room BEFORE it stashes, so
//      a rebalance into another plaza saved the conversation under the wrong key. stashLocal now takes
//      the room it is leaving, and every path that can drop the socket (close, watchdog, re-auth,
//      handshake timeout) stashes first.
const localKey=room=>'pg_social_local_v1_'+String(app.user||'').toLowerCase()+'_'+room;
function rememberLocal(room,lines){
 if(!room||!lines||!lines.length)return;
 localHistory.set(room,lines);
 try{sessionStorage.setItem(localKey(room),JSON.stringify(lines))}catch{}
}
function stashLocal(room=app.room){
 if(!room)return;
 const lines=app.messages.filter(m=>m.channel==='local'&&m.room===room);
 if(lines.length)rememberLocal(room,lines.slice(-LOCAL_CACHE_MAX));
}
function recallLocal(room){
 if(!room)return[];
 const kept=localHistory.get(room);
 if(kept&&kept.length)return kept;
 try{
  const clean=mergeChatMessages(JSON.parse(sessionStorage.getItem(localKey(room))||'null')).filter(m=>m.channel==='local'&&m.room===room).slice(-LOCAL_CACHE_MAX);
  if(clean.length){localHistory.set(room,clean);return clean}
 }catch{}
 return [];
}
function cleanChatMessage(m){
 if(!m||!['world','whisper','local'].includes(m.channel)||!Number.isFinite(m.at)||!Number.isInteger(m.from)||typeof m.name!=='string'||typeof m.body!=='string'||m.body.length>300||(m.emotion&&!R.EMOTIONS.includes(m.emotion)))return null;
 return {type:'message',id:typeof m.id==='number'||typeof m.id==='string'?m.id:'',at:m.at,from:m.from,name:m.name.slice(0,32),gm:m.gm===true,channel:m.channel,body:m.body,...(m.channel==='local'&&m.sys===true?{sys:true}:{}),room:Number.isInteger(m.room)?m.room:0,...(m.emotion?{emotion:m.emotion}:{}),...(Number.isInteger(m.to)?{to:m.to}:{}),...(typeof m.toName==='string'?{toName:m.toName.slice(0,32)}:{})};
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
const hub=document.createElement('section');hub.id='socialHub';hub.hidden=true;hub.setAttribute('aria-label','Prontera Fountain Plaza');hub.innerHTML='<div id="socialScene"></div><div id="socialLabels"></div><div id="socialHubToolbar"><header id="socialHubHeader"><div class="social-hub-title-row"><h2>Plaza</h2><select id="socialRoomSelect" aria-label="Switch plaza room" title="Switch Plaza server room" hidden></select></div><p id="socialPopulation">Joining plaza…</p></header><div id="socialHubControls"><button id="socialPokerBtn" type="button" title="Open Fountain Plaza Hold\'em"><span id="socialPokerBtnText">🃏 Hold\'em</span><i id="socialPokerDot" hidden></i></button><button id="socialFishBtn" type="button" title="Fish at the South Lawn ponds — cast, reel and fill your Fishing Bag" aria-pressed="false">🎣 Fishing</button><button id="sanctuaryOpen" type="button" aria-haspopup="dialog" aria-controls="sanctuaryPanel">🥚 DigiPet</button><label class="social-digimon-label" hidden>Digimon <select id="socialDigimon" aria-label="Choose an owned Digimon companion" title="Choose from your owned DigiPet collection"><option value="">None</option></select></label><button id="socialLeave">↩ Field</button></div></div><button id="socialSit" type="button" title="Sit or stand (Insert)" aria-label="Sit or stand">Sit</button><button id="socialPokerMini" type="button" hidden></button><section id="socialPokerModal" role="dialog" aria-label="Fountain Plaza Hold\'em" hidden><header id="socialPokerHead"><div class="poker-head-title"><strong id="socialPokerHeadTitle">🃏 Plaza Hold\'em · Table 1</strong><small id="socialPokerRoomSub">Dealer Vane · Blinds 10 / 20 · AFK Kick 2×</small></div><div class="poker-head-right"><span id="socialPokerWalletPill" class="poker-wallet-pill"><i class="fishcoin" aria-hidden="true"></i> 1,000 Chips</span><button id="socialPokerMinBtn" type="button" title="Minimize table (shows live timer &amp; turn alert)" aria-label="Minimize poker table">—</button><button id="socialPokerCloseBtn" type="button" title="Close poker window" aria-label="Close poker window">✕</button></div></header><nav id="socialPokerNav" role="tablist" aria-label="Poker sections"><button type="button" role="tab" data-ptab="t0" aria-selected="true">♠ Table 1 <small id="pokerTabCount0">0/6</small></button><button type="button" role="tab" data-ptab="t1" aria-selected="false">♠ Table 2 <small id="pokerTabCount1">0/6</small></button><button type="button" role="tab" data-ptab="bank" aria-selected="false"><i class="fishcoin" aria-hidden="true"></i> Chip Bank <i id="pokerBankFreeDot" hidden>!</i></button><button type="button" role="tab" data-ptab="gifts" aria-selected="false" aria-disabled="true" class="is-locked" title="Locked — rewards coming in a later update">🔒 Gift Exchange <small>Later</small></button><span id="socialPokerToast" hidden role="status" aria-live="polite"></span></nav><div id="socialPokerBody"></div><div id="socialPokerResult" hidden aria-live="polite"></div></section>';$id('view').append(hub);
// A separate DigiPet window; no existing field-pet state is changed here.
const sanctuaryPanel=document.createElement('section');sanctuaryPanel.id='sanctuaryPanel';sanctuaryPanel.hidden=true;sanctuaryPanel.setAttribute('role','dialog');sanctuaryPanel.setAttribute('aria-labelledby','sanctuaryTitle');
sanctuaryPanel.innerHTML=`<header class="sanctuary-head"><div><small>FOUNTAIN PLAZA · COMPANION CARE</small><h2 id="sanctuaryTitle"><span class="digipet-logo" aria-hidden="true"><svg viewBox="0 0 40 40" focusable="false"><defs><linearGradient id="digipetEggGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3bd"/><stop offset=".55" stop-color="#e5c76f"/><stop offset="1" stop-color="#9dbb86"/></linearGradient></defs><path d="M20 3C12 3 5 16 5 24c0 8 6 13 15 13s15-5 15-13C35 16 28 3 20 3Z" fill="url(#digipetEggGradient)" stroke="#fff4cf" stroke-width="1.4"/><path d="m7 25 5-4 5 5 5-5 5 5 5-4" fill="none" stroke="#38564a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 12c2-3 4-4 6-4" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="2" stroke-linecap="round"/><path d="m31 6 .8 2.2L34 9l-2.2.8L31 12l-.8-2.2L28 9l2.2-.8Z" fill="#fff3bd"/></svg></span><span>DigiPet</span></h2><p>Hatch partners, care for them and discover every evolution branch.</p></div><button id="sanctuaryClose" type="button" aria-label="Close DigiPet">×</button></header>
 <div class="sanctuary-content"><div class="sanctuary-intro"><div><span class="sanctuary-kicker">YOUR COMPANION</span><h3>Your DigiPet</h3><p>Four partner slots, each with independent progress. Only one partner can train at a time, and a training partner cannot battle.</p></div><span class="sanctuary-badge">DIGIPET</span></div>
 <nav class="sanctuary-nav" aria-label="DigiPet sections"><button type="button" data-sanctuary-view="partners" aria-pressed="true">Partners</button><button type="button" data-sanctuary-view="index" aria-pressed="false">DigiDex</button><button type="button" data-sanctuary-view="bag" aria-pressed="false">Pet Bag</button><button type="button" data-sanctuary-view="shop" aria-pressed="false">Cook Lina</button><span class="sanctuary-wallet" title="Pet Coins (petgold) are separate from Zeny and Cash Shop currency">◈ <b id="sanctuaryCoins">0</b> Pet Coins</span></nav>
 <div id="sanctuaryPartnersView">
 <section class="sanctuary-section sanctuary-partners-section"><div class="sanctuary-section-head"><div><small>YOUR PARTNERS</small><h3>Four slots, one active</h3></div><span class="sanctuary-level">Care, train and grind them in parallel</span></div><div class="sanctuary-partner-grid" id="sanctuaryPartnerGrid" role="group" aria-label="Companion slots"></div><p class="sanctuary-collection-note">Tap a slot to make it active, then pick its species from an owned card in the DigiDex. Empty slots are filled first when you hatch an egg.</p></section>
 <div id="sanctuaryGameplay"></div>
 <div class="sanctuary-selection"><span id="sanctuaryActive" role="status">No companion selected</span><button type="button" id="sanctuaryDismiss">Dismiss companion</button></div></div>
 <div id="sanctuaryIndexView" hidden><section class="sanctuary-section sanctuary-index"><div class="sanctuary-section-head"><div><small>FIELD GUIDE · ALL FORMS</small><h3>DigiDex &amp; evolution branches</h3></div><span class="sanctuary-level">Attainable forms only</span></div><p>“Evolves to” lists every supported direct branch — the branch you get is rolled when you evolve. Only forms attainable from Baby eggs through direct evolution are listed; owned cards can assign the species to your active partner slot.</p><p class="digidex-stat-note">Base stats are per-form at Lv.1, untrained: HP/ATK/DEF shift the battle formula, SPD sets swing style — fast forms strike reliably, heavy forms swing harder or graze. Owned forms add your level, training and mastery layer.</p><div class="sanctuary-index-tools"><label>Search DigiDex<input id="sanctuaryIndexSearch" type="search" placeholder="Digimon name or ID…" autocomplete="off"></label><label>Stage<select id="sanctuaryIndexStage"><option value="">All stages</option></select></label><label class="sanctuary-index-owned"><input id="sanctuaryIndexOwned" type="checkbox"> Owned only</label><button type="button" id="sanctuaryIndexBranchClear" hidden>✕ Clear branch view</button></div><div class="sanctuary-roster-status"><span id="sanctuaryIndexStatus" role="status"></span><span>Incoming + outgoing routes</span></div><div id="sanctuaryIndexList" class="sanctuary-index-list"></div><nav class="sanctuary-pager" aria-label="DigiDex pages"><button type="button" id="sanctuaryIndexPrev">← Previous</button><span id="sanctuaryIndexPage">Page 1</span><button type="button" id="sanctuaryIndexNext">Next →</button></nav></section></div>
 <div id="sanctuaryBagView" hidden></div><div id="sanctuaryShopView" hidden></div>
 <p id="sanctuaryMessage" class="sanctuary-message" role="status" aria-live="polite"></p></div>`;
$id('view').append(sanctuaryPanel);
const leaveWarning=document.createElement('div');leaveWarning.id='socialPokerLeaveWarning';leaveWarning.hidden=true;
leaveWarning.innerHTML='<section class="poker-leave-card" role="dialog" aria-modal="true" aria-labelledby="pokerLeaveTitle" aria-describedby="pokerLeaveCopy"><span class="poker-leave-eyebrow">YOU’RE STILL AT THE TABLE</span><h2 id="pokerLeaveTitle">Leave this poker game?</h2><p id="pokerLeaveCopy"></p><p class="poker-leave-note">You can minimize the table instead and keep playing.</p><div class="poker-leave-actions"><button id="pokerLeaveStay" type="button" class="poker-primary-btn">Stay at table</button><button id="pokerLeaveConfirm" type="button" class="poker-danger-btn">Fold &amp; leave</button></div></section>';
$id('view').append(leaveWarning);
// v297: the fishing copy of the leave-warning. Clicking away from the pond used to block the click
// and spam chat with "press ✕". It now asks first, exactly like the poker table.
const fishLeaveWarning=document.createElement('div');fishLeaveWarning.id='socialFishLeaveWarning';fishLeaveWarning.hidden=true;
fishLeaveWarning.innerHTML='<section class="poker-leave-card fish-leave-card" role="dialog" aria-modal="true" aria-labelledby="fishLeaveTitle" aria-describedby="fishLeaveCopy"><span class="poker-leave-eyebrow">YOUR LINE IS IN THE WATER</span><h2 id="fishLeaveTitle">Stop fishing and move?</h2><p id="fishLeaveCopy">Your line is reeled in and the cast in progress is lost.</p><p class="poker-leave-note">Keep fishing to stay at the pond — nothing is lost if you stay.</p><div class="poker-leave-actions"><button id="fishLeaveStay" type="button" class="poker-primary-btn">Keep fishing</button><button id="fishLeaveConfirm" type="button" class="poker-danger-btn">Reel in &amp; stop</button></div></section>';
$id('view').append(fishLeaveWarning);
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
function messageNode(m){const p=document.createElement('div');p.className='social-line';p.dataset.channel=m.channel;const t=document.createElement('time');t.textContent=new Date(m.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});p.append(t);
 // v297: pond announcements are system lines, not something a player typed.
 if(m.sys){p.classList.add('social-line-sys');const span=document.createElement('span');span.className='social-sys-text';span.textContent=m.body;p.append(span);return p}const b=document.createElement('button');b.type='button';b.textContent=(m.gm?'🛠 ':'')+(app.friends.has(m.from)?'★ ':'')+m.name+(m.channel==='whisper'?' → '+m.toName:'');b.title=(m.gm?'Game Master':'')+(m.gm&&app.friends.has(m.from)?' · ':'')+(app.friends.has(m.from)?'Friend':'');b.classList.toggle('social-gm',!!m.gm);b.onclick=()=>playerMenu(m.name,m.from);p.append(b,document.createTextNode(': '));if(m.emotion){const im=document.createElement('img');im.src=emojiURL(m.emotion);im.alt='/'+m.emotion;im.title='/'+m.emotion;p.append(im)}else p.append(document.createTextNode(m.body));return p}
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
function send(m){if(!app.connected||app.socket?.readyState!==1){
 // v313: during the half-second between a new socket opening and its `hello`, a walk or a look used
 // to print "Chat disconnected - reconnecting..." over a socket that was perfectly healthy. The
 // status now only says so when the connection really is gone.
 status(!app.socket?'Chat disconnected — reconnecting…':app.socket.readyState===0?'Connecting to chat…':'Chat disconnected — reconnecting…');return false}const speaking=['chat','emotion'].includes(m.type);if(speaking&&Date.now()<app.nextChat){status('Please wait 3 seconds between messages and emotions.');return false}app.socket.send(JSON.stringify(m));if(speaking){app.nextChat=Date.now()+R.CHAT_DELAY;cooldownUI()}return true}
$id('socialCompose').onsubmit=e=>{e.preventDefault();const input=$id('socialInput'),body=input.value.trim();if(!body||app.channel==='log')return;let sent=false;if(body==='/sit'){toggleSit();input.value='';return}else if(body==='/poker'){pokerOpen();input.value='';return}else if(R.EMOTIONS.includes(body.slice(1))&&body[0]==='/'){const ch=emoteChannel(),em={type:'emotion',emotion:body.slice(1),channel:ch||'local'};if(ch==='whisper')em.to=$id('socialTo').value.trim();if(ch==='whisper'&&!em.to){status('Whisper an emotion to whom? Type a name in the To field first.');return}sent=send(em)}else if(body.startsWith('/w ')){const match=body.match(/^\/w\s+(\S+)\s+(.+)$/);if(match)sent=send({type:'chat',channel:'whisper',to:match[1],body:match[2]});else status('Use /w PlayerName message')}else sent=send({type:'chat',channel:app.channel,to:$id('socialTo').value.trim(),body});if(sent)input.value=''};
chat.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.target.blur();toggleEmoji(false);$id('socialPeople').hidden=true}});
addEventListener('keydown',e=>{if(!leaveWarning.hidden||!fishLeaveWarning.hidden)return;if(e.target.matches('input,textarea,select')||e.target.closest('button,[role=button],[role=separator],summary')||e.ctrlKey||e.altKey||e.metaKey)return;if(e.key==='Escape'&&!hub.hidden&&!$id('socialPokerModal').hidden){e.preventDefault();closePokerModal();return}if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();if(app.channel==='log')select(app.room?'local':'world');$id('socialInput').focus()}if(e.key==='Insert'&&(app.room||app.wanted)){e.preventDefault();toggleSit()}},true);
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
$id('fishLeaveStay').onclick=()=>finishFishingStop(false);
$id('fishLeaveConfirm').onclick=()=>finishFishingStop(true);
fishLeaveWarning.onclick=e=>{if(e.target===fishLeaveWarning)finishFishingStop(false)};
fishLeaveWarning.addEventListener('keydown',e=>{
 e.stopPropagation();
 if(e.key==='Escape'){e.preventDefault();finishFishingStop(false)}
 if(e.key==='Tab'){e.preventDefault();(document.activeElement===$id('fishLeaveStay')?$id('fishLeaveConfirm'):$id('fishLeaveStay')).focus()}
});
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
 // v290: the table's geometry is independent of the seat. It used to slide 110px left (and the
 // chat snapped to 280px) the moment the player sat down; the owner reported that jump as a bug.
 const left=wide?414:8;
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
  w={day:today,chips:P?P.STARTING_CHIPS:1000,freeClaimed:0,ledgerApplied:[]};
  if(hostObj)hostObj.poker=w;
 }
 w.chips=Math.max(0,Math.min(1e9,Math.floor(Number(w.chips)||0)));
 w.freeClaimed=Math.max(0,Math.min(1,Math.floor(Number(w.freeClaimed)||0)));
 w.ledgerApplied=cleanPokerLedgerIds(w.ledgerApplied);
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
function applyPokerLedger(delta,eventId=''){
 const d=Math.trunc(Number(delta)||0),id=pokerLedgerIdValid(eventId)?eventId:'';
 const w=pokerWallet();
 if(id&&w.ledgerApplied.includes(id))return false;
 if(!d)return false;
 w.chips=Math.max(0,Math.min(1e9,w.chips+d));
 if(id)w.ledgerApplied=cleanPokerLedgerIds([...w.ledgerApplied,id]);
 // Balance and applied id travel in the same poker wallet/save blob before the server ACK.
 persistPoker();
 renderPokerUI(true);
 return true;
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
let soloLedgerSeq=0;
function soloLedgerId(){return 'solo:'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+(++soloLedgerSeq))}
function ensureSoloTables(){
 if(!P)return null;
 if(!soloTables){
  const specs=R.POKER.tables||[{id:0,label:'Table 1',dealer:R.POKER.dealer}];
  soloTables=specs.map(spec=>new P.HoldemTable({
   tableId:spec.id,label:spec.label,dealerName:spec.dealer.name,
   onLedger:(_id,delta)=>applyPokerLedger(delta,soloLedgerId()),
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
 // v290: sitting no longer moves ANY geometry. The old behaviour (seat => chat narrows to
 // 280px and the table slides into the freed lane) read as the whole UI jumping left on every
 // sit. Chat and table now hold their positions; this only clears the legacy classes once.
 if(!chat.classList.contains('poker-chat-fit')&&!hub.classList.contains('poker-seated'))return;
 chat.classList.remove('poker-chat-fit');
 hub.classList.remove('poker-seated');
 syncPokerBounds();
}
function syncPokerBadges(){
 syncPokerChatFit();
 const w=pokerWallet();
 const freeReady=w.freeClaimed===0;
 const dot=$id('socialPokerDot'),bankDot=$id('pokerBankFreeDot'),pill=$id('socialPokerWalletPill');
 if(dot)dot.hidden=!freeReady;
 if(bankDot)bankDot.hidden=!freeReady;
 if(pill)pill.innerHTML=`<i class="fishcoin" aria-hidden="true"></i> ${w.chips.toLocaleString()} Chips`;
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
 if(fishingBlocked(()=>pokerSeatAction(globalSeat)))return; // v294: stop fishing before taking a poker stool
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
function clearPokerResult(){
 const el=$id('socialPokerResult');
 if(el){el.hidden=true;el.innerHTML='';delete el.dataset.key;el.className=''}
 const mini=$id('socialPokerMini');
 if(mini){mini.classList.remove('is-result-win','is-result-lose','is-result-push');delete mini.dataset.resultUntil;delete mini.dataset.resultKey}
}
function syncPokerResult(snap,seated){
 const el=$id('socialPokerResult');if(!el)return;
 const now=Date.now();
 const current=el.dataset.key?pokerHandResults.get(el.dataset.key):null;
 if(el.dataset.key&&(!current||now>current.until||current.room!==app.room)){el.hidden=true;el.innerHTML='';delete el.dataset.key;el.className=''}
 const mini=$id('socialPokerMini');
 if(mini&&mini.dataset.resultUntil&&now>Number(mini.dataset.resultUntil)){mini.classList.remove('is-result-win','is-result-lose','is-result-push');delete mini.dataset.resultUntil;delete mini.dataset.resultKey}
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
 const key=`${app.room}:${snap.tableId}:${snap.handNo}`;
 if(pokerHandResults.has(key))return;
 const until=now+(kind==='win'?3400:2600);
 pokerHandResults.set(key,{kind,until,room:app.room});
 if(pokerHandResults.size>24)pokerHandResults.delete(pokerHandResults.keys().next().value);
 el.dataset.key=key;el.className=`poker-result is-${kind}`;el.hidden=false;
 const burst=kind==='win'?'<i class="poker-result-burst" aria-hidden="true"><b></b><b></b><b></b><b></b><b></b><b></b></i>':'';
 el.innerHTML=`<div class="poker-result-card" role="status"><strong>${title}</strong><span>${detail}</span>${burst}</div>`;
 if(mini&&!mini.hidden){mini.classList.remove('is-result-win','is-result-lose','is-result-push');mini.classList.add(`is-result-${kind}`);mini.dataset.resultUntil=String(until);mini.dataset.resultKey=key}
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
 btn.innerHTML=`<span class="poker-mini-tag">T${(target.tableId||0)+1}</span>${cards?`<span class="poker-mini-cards">${cards}</span>`:''}<span class="poker-mini-pot">Pot <i class="fishcoin" aria-hidden="true"></i> ${(target.pot||0).toLocaleString()}</span><b id="socialPokerMiniTimer" class="poker-mini-timer">Open</b><i class="poker-mini-bar"><span id="socialPokerMiniBar"></span></i>`;
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
     <strong><i class="fishcoin" aria-hidden="true"></i> ${w.chips.toLocaleString()}</strong>
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
     <strong><i class="fishcoin" aria-hidden="true"></i> +${pk.chips.toLocaleString()} Chips</strong>
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
    <div class="poker-seat-meta"><span><i class="fishcoin" aria-hidden="true"></i> ${s.stack.toLocaleString()}</span>${s.streetBet>0?`<b>Bet ${s.streetBet}</b>`:s.lastTag?`<b>${escape(s.lastTag)}</b>`:''}${s.handHint?`<em class="poker-hand-hint">${escape(s.handHint)}</em>`:''}</div>
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
    <div class="poker-seat-meta"><span><i class="fishcoin" aria-hidden="true"></i> ${h.stack.toLocaleString()}</span>${h.streetBet>0?`<b>Bet ${h.streetBet}</b>`:h.lastTag?`<b>${escape(h.lastTag)}</b>`:''}${h.handHint?`<em class="poker-hand-hint">${escape(h.handHint)}</em>`:''}</div>
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
     :`<button type="button" data-gotab="bank" class="poker-gold-btn"><i class="fishcoin" aria-hidden="true"></i> Refill Chips (Min ${P.MIN_BUY_IN})</button>`}
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
   <span class="poker-dock-lead">Seat <b>${snap.me.seat+1}</b> · Stack <b><i class="fishcoin" aria-hidden="true"></i> ${snap.me.stack.toLocaleString()}</b>${reserve?` · Reserve <b>${reserve.toLocaleString()}</b>`:''}${snap.me.missedTurns>0?` · <b class="poker-afk-inline">AFK Warning ${snap.me.missedTurns}/${snap.me.afkMax}</b>`:''}</span>
   <div class="poker-dock-controls">
    ${snap.seatedCount===1?`<label class="poker-house-toggle"><input type="checkbox" id="pokerHouseChk" ${snap.vsHouse?'checked':''}> vs. ${escape(dName)}</label>`:''}
    ${snap.me.stack<P.BIG_BLIND&&reserve>=P.BIG_BLIND?`<button type="button" id="pokerQuickTopUp" class="poker-gold-btn">+ Rebuy</button>`:reserve>0?`<button type="button" id="pokerQuickTopUp" class="poker-sub-btn">+ Top Up</button>`:''}
    <button type="button" data-gotab="bank" class="poker-sub-btn"><i class="fishcoin" aria-hidden="true"></i> Bank${w.freeClaimed===0?' (!)':''}</button>
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
     <div class="poker-pot-line"><span>POT</span><strong class="${potPulse}"><i class="fishcoin" aria-hidden="true"></i> ${(snap?.pot||0).toLocaleString()}</strong>${snap?.currentBet?`<small>Bet ${snap.currentBet.toLocaleString()}</small>`:''}${snap?.handNo?`<small>#${snap.handNo}</small>`:''}</div>
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
// v296 (owner): wearing a fishing title must not replace the Hunt title. The two now travel as
// separate fields and draw as separate lines above the head - Hunt title first, fishing under it.
function huntTitleName(st){return st&&typeof HUNT_TITLES!=='undefined'?HUNT_TITLES.find(t=>t.id===st.equippedTitle&&titleUnlocked(t))?.name||'':''}
function fishingTitleName(st){
 const F=FISHING();
 if(!F||typeof F.equippedTitle!=='function')return '';
 try{const t=F.equippedTitle(st&&st.fishing);return t?'🎣 '+t.name:''}catch{return ''}
}
function currentLook(){const st=typeof S==='object'&&S?S:null,slot=activePartnerSlot(),partner=partnerLine(slot),creature=worldTraining&&worldTraining.slot===slot?null:(globalThis.PGDigimonSanctuary?.species(partnerData(slot),partner)||partner);return {cls:st?.cls||'Novice',appearance:st&&typeof wardrobeAppearance==='function'?wardrobeAppearance():{version:1,sex:'m'},refine:Math.max(0,Math.min(15,st?.eq?.weapon?.r||0)),title:huntTitleName(st),fishTitle:fishingTitleName(st),lv:st&&st.auraShow!==false&&!st.hideUI?Math.max(0,Math.min(999,Math.floor(Number(st.lv)||0))):0,speed:st&&typeof moveSpd==='function'?Math.round(moveSpd(true)*100)/100:0,...(creature?{digimon:creature}:{})}}
function soloName(){const u=typeof CLOUD!=='undefined'&&CLOUD.user?(typeof CLOUD.user==='string'?CLOUD.user:CLOUD.user.username):typeof currentUser==='string'&&currentUser?currentUser:'';return u||app.user||'Adventurer'}
function syncSoloPlayer(){if(!app.wanted||!app.scene||app.room)return;let p=app.players.get(SOLO_ID);const look=currentLook(),name=soloName();if(!p)p={id:SOLO_ID,name,room:0,x:0,z:12,dir:0,sit:false,seat:null,pokerSeat:null,path:[],at:performance.now(),look};else{R.advance(p,performance.now());p.name=name;p.look=look}putPlayer(p)}
function clearSoloPokerIfSeated(p){
 if(Number.isInteger(p.pokerSeat)&&soloTables){
  const tid=Math.floor(p.pokerSeat/6);
  soloTables[tid]?.stand(SOLO_ID,Date.now());
  syncSoloPokerSnapshots();renderPokerMini();renderPokerUI(true);
 }
}
// v294: while a fishing line is in the water you cannot walk away - press ✕ Stop fishing first.
// Fishing's own walk-to-pond happens in the 'walking' phase, which busy() does not count.
// v295: sitting is no longer blocked. Sitting on a pond-side angler chair (or pressing Insert to
// sit/stand) keeps the line in the water, which is how the chairs were meant to be used.
function fishingBusy(){const F=FISHING();return !!(F&&typeof F.busy==='function'&&F.busy())}
// v297: ask before reeling in, like the poker leave-warning, instead of spamming chat with "press ✕".
// `action` is retried once the player confirms, so the click that was blocked still happens.
let fishLeaveAction=null,fishLeaveFocus=null;
function confirmFishingStop(action){
 if(!fishingBusy()){if(action)action();return true}
 if(fishLeaveAction||!fishLeaveWarning.hidden)return false;
 fishLeaveAction=action||null;fishLeaveFocus=document.activeElement;
 fishLeaveWarning.hidden=false;hub.inert=true;chat.inert=true;$id('fishLeaveStay').focus();
 return false;
}
function finishFishingStop(go){
 if(fishLeaveWarning.hidden)return;
 const act=fishLeaveAction;fishLeaveAction=null;
 fishLeaveWarning.hidden=true;hub.inert=false;chat.inert=false;
 if(go){const F=FISHING();try{if(F&&typeof F.stop==='function')F.stop('🎣 Line reeled in — you stepped away from the pond.')}catch{}}
 if(go&&act)act();
 else if(fishLeaveFocus&&typeof fishLeaveFocus.focus==='function')try{fishLeaveFocus.focus()}catch{}
 fishLeaveFocus=null;
}
function fishingBlocked(action){if(!fishingBusy())return false;confirmFishingStop(action);return true}
function moveAction(x,z){if(fishingBlocked(()=>moveAction(x,z)))return;confirmPokerLeave(confirmLeave=>performMoveAction(x,z,confirmLeave))}
function performMoveAction(x,z,confirmLeave){if(app.room&&send({type:'move',x,z,confirmLeave}))return;if(app.room)return;const p=app.players.get(SOLO_ID);if(!p)return;R.advance(p,performance.now());const route=R.path(p,{x,z});if(!route.length)return;clearSoloPokerIfSeated(p);p.path=route;p.sit=false;p.seat=null;p.pokerSeat=null;putPlayer(p)}
function seatAction(id){if(fishingBlocked(()=>seatAction(id)))return;confirmPokerLeave(confirmLeave=>performSeatAction(id,confirmLeave))}
function performSeatAction(id,confirmLeave){if(app.room&&send({type:'seat',id,confirmLeave}))return;if(app.room||!Number.isInteger(id)||!R.SEATS[id])return;const p=app.players.get(SOLO_ID),seat=R.SEATS[id];if(!p)return;R.advance(p,performance.now());const route=R.path(p,seat);if(!route.length&&Math.hypot(p.x-seat.x,p.z-seat.z)>.5)return;clearSoloPokerIfSeated(p);p.path=route;p.sit=!route.length;p.seat=seat.id;p.pokerSeat=null;if(!route.length){p.x=seat.x;p.z=seat.z}putPlayer(p)}
// v299 (owner): sit and stand are allowed with a line in the water - only actions that WALK the
// player away (a bench, a pond seat, a poker stool, the exit) ask before reeling in.
function toggleSit(){confirmPokerLeave(confirmLeave=>performToggleSit(confirmLeave))}
function performToggleSit(confirmLeave){if(app.room&&send({type:'sit',confirmLeave}))return;if(app.room)return;const p=app.players.get(SOLO_ID);if(!p)return;R.advance(p,performance.now());clearSoloPokerIfSeated(p);p.path=[];p.seat=null;p.pokerSeat=null;p.sit=!p.sit;putPlayer(p)}
function join(){if(!app.connected)return;send({type:'join',look:currentLook(),friends:[...app.friends]})}
// v287: plaza fishing. The logic/UI module reads the self position, walks the player to a pond,
// and announces show-offs on Local chat; everything else stays in assets/social-fishing.js.
const FISHING=()=>globalThis.PGSocialFishing||null;
function fishingSelf(){const p=app.players.get(app.room?app.id:SOLO_ID);if(!p)return null;const c={...p,path:(p.path||[]).map(v=>({...v}))};R.advance(c,performance.now());
 // v355: report the facing too, so a cast follows the fisher's direction. While walking it is
 // the exact segment angle; standing or seated it comes from the facing octant (dir*45°+90°).
 let face=null;
 if(c.path&&c.path.length){const t=c.path[0],dx=t.x-c.x,dz=t.z-c.z;if(dx||dz)face=Math.atan2(dz,dx)}
 else if(Number.isInteger(c.dir)&&c.dir>=0&&c.dir<8)face=c.dir*Math.PI/4+Math.PI/2;
 return {x:c.x,z:c.z,face}}
// v295: Show off is no longer a Local-chat line. The fishing module paints the fish locally and
// hands the same payload here, which relays it to the room as data.
function fishingShowOff(fish){
 if(!app.room)return true; // solo: the local overhead fish is the whole show
 return send({type:'showoff',sp:fish&&fish.sp,w:fish&&fish.w,mut:(fish&&fish.mut)||null,perfect:!!(fish&&fish.perfect)});
}
// v295: the player's line in the water, shared with the room so everyone sees the bobber.
function fishingRig(state){
 // v311 (owner: "he should face the pond while fishing"): the local angler turns to the bobber the
 // moment the line goes out, and keeps that facing while the rig is idle, biting or being reeled.
 // Remote viewers get the same turn from the rig that already travels in their player snapshot.
 if(state&&state.on&&Number.isFinite(state.x)&&Number.isFinite(state.z)){
  const me=app.players.get(app.room?app.id:SOLO_ID);
  if(me){const dx=state.x-me.x,dz=state.z-me.z;
   if(Math.hypot(dx,dz)>.15){const dir=(Math.round(Math.atan2(-dx,dz)/(Math.PI/4))+8)%8;if(me.dir!==dir){me.dir=dir;putPlayer(me)}}}
 }
 if(!app.room)return true;
 // v300: the rod tier travels with the rig, so everyone draws your pole in your colour.
 return send({type:'rig',on:!!(state&&state.on),pond:state&&state.pond,x:state&&state.x,z:state&&state.z,mode:state&&state.mode,rod:state&&state.rod});
}
// v295: a fishing title is worn above the head in the plaza; changing it repaints the room.
function fishingTitleChanged(){const p=app.players.get(app.room?app.id:SOLO_ID);if(!p)return;const look=currentLook();if(app.room)return send({type:'look',look});p.look=look;putPlayer(p)}
// v297: pond monsters (sp.mega) and secret-rarity catches are announced in the room's Local chat.
// The worker relays {type:'fishnote'} to everyone in the room; solo play writes the line directly.
function fishNoteBody(name,spName,w,kind){
 return kind==='secret'
  ? `✨ ${name} pulled a secret catch out of the pond — ${spName}, ${w} kg!`
  : `🎣 ${name} landed a pond monster — ${spName}, ${w} kg!`;
}
function pushFishNote(m){
 const F=FISHING();
 const sp=F&&typeof F.speciesById==='function'?F.speciesById(m.sp):null;
 if(!sp)return false;
 const note=cleanChatMessage({type:'message',id:'fish:'+(m.at||Date.now())+':'+(m.from||0),at:m.at||Date.now(),from:Number.isInteger(m.from)?m.from:0,name:typeof m.name==='string'?m.name:'',gm:false,channel:'local',body:fishNoteBody(m.name||'An angler',sp.name,m.w,m.kind),sys:true,room:app.room||0});
 if(!note)return false;
 app.messages=mergeChatMessages(app.messages,[note]);
 if(app.channel!=='local'||chat.classList.contains('minimized'))app.unread.add('local');
 if(app.channel==='local')renderMessages(true);
 tabsUI();
 return true;
}
function fishingAnnounce(fish){
 if(!fish||typeof fish.sp!=='string')return false;
 if(app.room&&send({type:'fishbrag',sp:fish.sp,w:fish.w,kind:fish.kind==='secret'?'secret':'mega'}))return true;
 return pushFishNote({sp:fish.sp,w:fish.w,kind:fish.kind,name:'You',from:app.id||SOLO_ID,at:Date.now()});
}
function bindFishing(){const F=FISHING();if(!F)return;F.bind({host:()=>typeof S==='object'&&S?S:null,scene:()=>app.scene,self:fishingSelf,moveTo:(x,z)=>moveAction(x,z),walkTo:(x,z)=>performMoveAction(x,z,true),showOff:fishingShowOff,announce:fishingAnnounce,rig:fishingRig,titleChanged:fishingTitleChanged,notice,save:()=>{if(typeof save==='function'&&typeof S==='object'&&S)save()},button:$id('socialFishBtn')})}
const digimonSelect=$id('socialDigimon');
let sanctuaryIndexPage=0,sanctuaryView='partners',sanctuaryHatch=null,sanctuaryIndexBranch=null,sanctuaryPartnerGridKey='';
// v349: four companion slots per player. Training is still one partner at a time, and a
// partner that is training cannot enter PvE or PvP — the player's other slots can.
const PARTNER_LINE_FIELDS=['digimonPartner','digimonPartner2','digimonPartner3','digimonPartner4'],PARTNER_DATA_FIELDS=['digimonSanctuary','digimonSanctuary2','digimonSanctuary3','digimonSanctuary4'];
function activePartnerSlot(){if(typeof S!=='object'||!S)return 0;const slot=Math.floor(Number(S.digimonActiveSlot));return Number.isInteger(slot)&&slot>=0&&slot<=3?slot:0}
function partnerLine(slot=activePartnerSlot()){return typeof S==='object'&&S?R.cleanDigimon(S[PARTNER_LINE_FIELDS[slot]]):null}
function partnerData(slot=activePartnerSlot()){return typeof S==='object'&&S?S[PARTNER_DATA_FIELDS[slot]]:null}
function setPartnerData(slot,value){S[PARTNER_DATA_FIELDS[slot]]=value}
function setPartnerLine(slot,value){S[PARTNER_LINE_FIELDS[slot]]=value}
function legacyOwnedDigimon(){
 const owned=[0,1,2,3].map(partnerLine);
 for(const slot of [0,1,2,3]){const raw=partnerData(slot);if(!raw)continue;
  for(const [line,p] of Object.entries(raw?.partners||{})){
   if(!R.cleanDigimon(line)||!p||typeof p!=='object')continue;
   const progressed=Number(p.stage)>0||Number(p.wins)>0||Number(p.xp)>0||Number(p.mastery)>0||(p.energy!=null&&Number(p.energy)!==70)||Number(p.fatigue)>0||(p.fullness!=null&&Number(p.fullness)!==70)||p.form&&R.cleanDigimon(p.form)!==line||p.training||p.battle||Object.values(p.stats||{}).some(v=>Number(v)>0);
   if(progressed)owned.push(line);
  }
 }
 return owned.filter(Boolean);
}
function ensureDigimonBag(){
 const G=globalThis.PGDigimonSanctuary;if(!G||typeof S!=='object'||!S)return null;
 const raw=S.digimonBag,next=G.ensureBag(raw,legacyOwnedDigimon());if(!next)return null;
 if(JSON.stringify(next)!==JSON.stringify(raw)){S.digimonBag=next;if(typeof save==='function')save()}
 return next;
}
function petBag(){return globalThis.PGDigimonSanctuary?.normalizeBag(typeof S==='object'&&S?S.digimonBag:null)||null}
function ownsDigimon(line){const bag=petBag();return !!(line&&bag?.owned.includes(line))}
// Old window-only timers could complete while the game was closed. Retire only
// those pending timers on entry; retain all completed stats and newer-version saves.
function discardLegacyActivities(){const G=globalThis.PGDigimonSanctuary;if(!G||typeof S!=='object'||!S)return;let changed=false;for(const slot of [0,1,2,3]){const raw=partnerData(slot);if(!raw)continue;const data=G.normalize(raw);if(!data)continue;let had=false;for(const p of Object.values(data.partners)){if(p.training){p.training=null;had=true}if(p.battle){p.battle=null;had=true}}if(had){setPartnerData(slot,data);changed=true}}if(changed&&typeof save==='function')save()}
function refreshCompanionLook(){if(app.room)send({type:'look',look:currentLook()});else syncSoloPlayer()}

// Gym progress is casual and client-saved; the room only reserves equipment and
// broadcasts presentation. No timer survives a reload/logout or socket loss.
const worldTrainingHUD=document.createElement('div');worldTrainingHUD.id='sanctuaryWorldStatus';worldTrainingHUD.hidden=true;worldTrainingHUD.innerHTML='<span role="status" aria-live="polite"></span><button type="button">Stop</button>';hub.append(worldTrainingHUD);
const worldTrainingText=worldTrainingHUD.querySelector('span'),worldTrainingCancel=worldTrainingHUD.querySelector('button');
const worldNearby=document.createElement('button');worldNearby.id='sanctuaryNearby';worldNearby.type='button';worldNearby.hidden=true;hub.append(worldNearby);
const worldBattleNearby=document.createElement('button');worldBattleNearby.id='sanctuaryBattleNearby';worldBattleNearby.type='button';worldBattleNearby.hidden=true;hub.append(worldBattleNearby);
const battleHUD=document.createElement('div');battleHUD.id='sanctuaryBattleHUD';battleHUD.hidden=true;hub.append(battleHUD);
const pvpDialog=document.createElement('section');pvpDialog.id='pvpBattleDialog';pvpDialog.className='sanctuary-battle-dialog';pvpDialog.setAttribute('role','dialog');pvpDialog.setAttribute('aria-live','polite');pvpDialog.hidden=true;hub.append(pvpDialog);
const battleResultDialog=document.createElement('section');battleResultDialog.id='sanctuaryBattleResult';battleResultDialog.className='sanctuary-battle-dialog sanctuary-battle-result';battleResultDialog.setAttribute('role','dialog');battleResultDialog.hidden=true;hub.append(battleResultDialog);
const TRAIN_STATIONS={power:{x:56,z:30},guard:{x:63,z:21},agility:{x:75,z:26},focus:{x:86,z:27}};
let worldTraining=null,worldNoticeTimer=0,worldNearbyStat='',gymEntries=[],gymSerial=0;
worldNearby.onclick=()=>startWorldTraining(worldNearbyStat);
let battleRequest=0,battleOffer=null,soloPve=null;
const BATTLE_INTENT_MS=10000;
function soloPractice(){return !app.room&&!CLOUD.on}
function myPve(){const id=app.room?app.id:SOLO_ID;return app.battle.pve.find(r=>r.owner===id)||null}
function myPvp(){const m=app.battle.pvp;return m&&m.participants?.some(p=>p.id===app.id)?m:null}
// v355: waiting in the PvP matchmaking queue is a visible, cancellable activity. Before this,
// a queued player saw an idle UI while the server refused every other action with
// "Finish the current DigiPet activity first" — and had no control to leave the queue.
function myQueue(){return (app.battle.queue||[]).find(q=>q.id===app.id)||null}
function battleBusy(){return !!(myPve()||myPvp()||myQueue()||battleOffer||app.battleIntent)}
// The partner slot currently in a field or ring battle, if any. Only that slot is barred
// from gym training, care edits and evolution while the battle runs.
function battleBusySlot(){
 const run=myPve();if(run)return Number.isInteger(run.slot)?run.slot:(run.profile?.slot??0);
 if(soloPve)return soloPve.profile?.slot??0;
 const m=myPvp(),me=m&&m.participants?.find(p=>p.id===app.id);return me?(me.profile?.slot??0):null;
}
function trainingSlotBusy(){return !!(worldTraining&&worldTraining.slot===activePartnerSlot())}
function battleProfileFor(slot=activePartnerSlot()){const G=globalThis.PGDigimonSanctuary,line=partnerLine(slot);return G&&line&&ownsDigimon(line)?G.combatProfile(partnerData(slot),line,slot,petBag()):null}
function battleNearbyFrame(player){
 const p=player&&!player.sit&&!player.path?.length?player:null;let action='',label='';
 const line=partnerLine(),bag=typeof S==='object'&&S?S.digimonBag:null,hasPartner=!!(line&&Array.isArray(bag?.owned)&&bag.owned.includes(line));
 if(p&&!trainingSlotBusy()&&!battleBusy()&&hasPartner){
if(Math.abs(p.x-70)<=25&&Math.abs(p.z-64)<=16){action='pve';label=soloPractice()?'Start solo grinding':'Start auto-grinding'}
 else {const r=R.SANCTUARY_RING;if(Math.abs(p.x-r.x)<=r.w/2+6&&p.z>=r.z-r.d/2-2&&p.z<=r.z+r.d/2+11&&Math.abs(p.x-r.x)>.1){action='pvp';label=soloPractice()?'Online PvP only':'Enter PvP ring'}}
 }
 worldBattleNearby.hidden=!action;worldBattleNearby.dataset.battleAction=action;worldBattleNearby.textContent=label;
}
worldBattleNearby.onclick=()=>{const action=worldBattleNearby.dataset.battleAction;if(action==='pve')startPve();else if(action==='pvp')startPvp()};
function syncSoloBattle(){
 if(!soloPractice())return;const B=globalThis.PGDigimonBattle;
 app.battle={pve:soloPve&&B?[B.pveSnapshot(soloPve)]:[],pvp:null,queue:[]};app.scene?.setBattleState?.(app.battle);renderBattleHUD();
}
function startSoloPve(profile){
 const B=globalThis.PGDigimonBattle,source=app.players.get(SOLO_ID),player=source?R.advance({...source,path:(source.path||[]).map(p=>({...p}))},performance.now()):null,p=B?.profile(profile);
 if(!B||!p)return worldNotice('DigiPet combat is unavailable in this copy.');
 if(!player||player.sit||player.path?.length||Math.abs(player.x-70)>25||Math.abs(player.z-64)>16)return worldNotice('Walk to the middle DigiPet farm and stand still first.');
 const now=Date.now();soloPve=B.createPve({id:'solo-pve:'+now.toString(36)+':'+(++battleRequest),owner:SOLO_ID,room:0,profile:p,now});soloPve.localOwner=S;soloPve.localAccount=typeof currentUser==='string'?currentUser:null;app.battleIntent=null;syncSoloBattle();worldNotice('Local solo grinding · practice rewards are saved locally, not server-issued.');
}
function stopSoloPve(reason='stopped',notify=true){
 if(!soloPve)return false;soloPve=null;app.battle={pve:[],pvp:null,queue:[]};app.scene?.setBattleState?.(app.battle);renderBattleHUD();if(notify)worldNotice(reason==='defeat'?'Your partner fainted during local practice. Rest, feed, and try again.':reason==='exhausted'?'Local grinding stopped: your partner is out of energy.':reason==='complete'?'Local field run complete! A very strong partner.':'Local solo grinding stopped.');return true;
}
function tickSoloPve(){
 const run=soloPve;if(!run)return;if(!soloPractice()||typeof S!=='object'||S!==run.localOwner||run.localAccount!==(typeof currentUser==='string'?currentUser:null)){stopSoloPve('stopped',false);return}
 const result=globalThis.PGDigimonBattle?.stepPve(run,Date.now());if(!result)return;let end='';
 for(const event of result.events){if(event.type==='wave_clear')receiveBattleReward({local:true,kind:'pve',battleId:run.id+':wave'+event.wave,lineId:run.profile.lineId,form:run.profile.form,slot:run.profile.slot,wave:event.wave,reward:{...event.reward},earned:{...run.earned},gearDrop:event.gearDrop||null});if(event.type==='hit')app.scene?.battleEvent?.({kind:'pve',battleId:run.id,to:event.to,amount:event.amount,crit:!!event.crit});if(event.type==='end')end=event.reason}
 if(end)stopSoloPve(end);else syncSoloBattle();
}
function startPve(){
 if(trainingSlotBusy())return worldNotice('The training partner cannot battle. Switch to another partner slot first.');
 if(battleBusy())return worldNotice('Finish the current DigiPet activity first.');
 const profile=battleProfileFor();if(!profile)return worldNotice('Hatch and choose an owned partner first.');
 if(soloPractice())return startSoloPve(profile);
 if(!app.room||!app.connected||app.socket?.readyState!==1)return worldNotice('Connect to the online plaza, or use local solo mode, to grind.');
 const request=++battleRequest;app.battleIntent={kind:'pve',request,at:Date.now()};if(send({type:'pve_start',request,profile})){worldNotice('Entering the middle field…');worldBattleNearby.hidden=true}else app.battleIntent=null;
}
function startPvp(){
 if(trainingSlotBusy())return worldNotice('The training partner cannot battle. Switch to another partner slot first.');
 if(battleBusy())return worldNotice('Finish the current DigiPet activity first.');
 if(soloPractice())return worldNotice('Two-player PvP needs an online plaza. Solo practice is available in the middle field.');
 if(!app.room||!app.connected||app.socket?.readyState!==1)return worldNotice('Enter an online plaza to challenge another player.');
 const profile=battleProfileFor();if(!profile)return worldNotice('Hatch and choose an owned partner first.');
 const request=++battleRequest;app.battleIntent={kind:'pvp',request,at:Date.now()};if(send({type:'pvp_enter',request,profile})){worldNotice('Waiting for a player on the opposite side of the ring…');worldBattleNearby.hidden=true}else app.battleIntent=null;
}
function stopPve(){if(soloPve)stopSoloPve();else if(myPve())send({type:'pve_stop'})}
function stopPvp(){if(myPvp()||battleOffer||myQueue())send({type:'pvp_cancel'})}
function renderBattleHUD(){
 const run=myPve(),match=myPvp(),waiting=myQueue();let html='',key='';
 if(run){
  const G=globalThis.PGDigimonBattle,stage=G?.stageOf?.(run.wave)||1+Math.floor(((run.wave||1)-1)/5),inWave=((run.wave||1)-1)%5+1,bossWave=!!G?.isBossWave?.(run.wave);
  key='pve:'+run.id+':'+run.wave+':'+run.phase+':'+run.partner?.hp+':'+run.earned?.coins+':'+run.earned?.dropCoins+':'+run.earned?.eggs+':'+(run.earned?.gear||0);
  html=`<div class="sanctuary-battle-hud-card${bossWave?' is-boss':''}"><strong>⚔ ${soloPve?'SOLO · ':''}${bossWave?'STAGE '+stage+' · BOSS FIGHT':'AUTO-GRINDING · STAGE '+stage+' · WAVE '+inWave+'/5'}</strong><span>${run.phase==='between'?'Next group incoming…':escape(sanctuaryName(run.partner?.form))+' · HP '+Math.max(0,run.partner?.hp||0)+'/'+Math.max(1,run.partner?.maxHp||1)}</span><small>${soloPve?'Local practice · ':''}${run.enemies?.filter(e=>e.hp>0).length||0} ${bossWave?'boss':'bots'} remaining</small><small class="battle-loot">◈ ${run.earned?.coins||0} petgold${run.earned?.dropCoins?` (${run.earned.dropCoins} bonus)`:''} · 🥚 ${run.earned?.eggs||0} Digi-Eggs${run.earned?.gear?` · ⚙ ${run.earned.gear} gear`:''}</small><button type="button" data-battle-stop="pve">Stop grinding</button></div>`}
 else if(match&&['countdown','fighting'].includes(match.phase)){key='pvp:'+match.id+':'+match.phase;html=`<div class="sanctuary-battle-hud-card"><strong>⚔ RING MATCH</strong><span>${match.phase==='countdown'?'Both trainers accepted.':'Auto-battle in progress.'}</span><small>Server-settled · no manual attacks</small><button type="button" data-battle-stop="pvp">${match.phase==='fighting'?'Forfeit match':'Cancel match'}</button></div>`}
 else if(waiting){key='queue:'+waiting.id;html=`<div class="sanctuary-battle-hud-card"><strong>⚔ WAITING FOR OPPONENT</strong><span>Standing by the ${waiting.side==='left'?'left':'right'} side of the ring.</span><small>Someone must stand on the other side to start the match</small><button type="button" data-battle-stop="pvp">Leave queue</button></div>`}
 battleHUD.hidden=!html;if(html&&battleHUD.dataset.key!==key){battleHUD.dataset.key=key;battleHUD.innerHTML=html}if(!html)battleHUD.dataset.key='';
}
battleHUD.onclick=e=>{const b=e.target.closest('[data-battle-stop]');if(!b)return;if(b.dataset.battleStop==='pve')stopPve();else stopPvp()};
function renderPvpDialog(){
 const match=myPvp(),offer=battleOffer,key=match?`match:${match.id}:${match.phase}:${match.participants.map(p=>`${p.id}:${p.accepted?1:0}`).join(',')}`:offer?`offer:${offer.battleId}`:'';
 // Countdown snapshots arrive every 250 ms. Keep the cancel button mounted;
 // battleUITick updates only the number without replacing the dialog.
 if(pvpDialog.dataset.key===key)return;pvpDialog.dataset.key=key;
 if(!match&&!offer){pvpDialog.hidden=true;pvpDialog.replaceChildren();return}
 if(match&&match.phase==='offer'){
  const me=match.participants.find(p=>p.id===app.id),other=match.participants.find(p=>p.id!==app.id);pvpDialog.hidden=false;pvpDialog.innerHTML=`<div class="sanctuary-battle-modal-card"><small>BOXING RING · CHALLENGE</small><h2>Accept battle?</h2><p><b>${escape(other?.name||'Opponent')}</b> brings ${escape(sanctuaryName(other?.profile?.form))} (${escape(other?.profile?.stage||'Unknown stage')}).</p><p class="sanctuary-battle-note">Both players must accept. Your Digimon will enter the ring for automatic combat.</p><div class="sanctuary-actions"><button type="button" data-pvp-action="accept" ${me?.accepted?'disabled':''}>${me?.accepted?'Waiting for opponent…':'Accept battle'}</button><button type="button" data-pvp-action="decline">Decline</button></div></div>`;return;
 }
 if(match&&match.phase==='countdown'){
  pvpDialog.hidden=false;pvpDialog.innerHTML=`<div class="sanctuary-battle-modal-card sanctuary-countdown-card"><small>BOTH TRAINERS READY</small><h2>Battle starts in</h2><strong id="pvpCountdownNumber">3</strong><p>Digimon, take your places.</p><div class="sanctuary-actions"><button type="button" data-pvp-action="cancel">Cancel match</button></div></div>`;return;
 }
 if(offer&&!match){pvpDialog.hidden=false;pvpDialog.innerHTML=`<div class="sanctuary-battle-modal-card"><small>BOXING RING · CHALLENGE</small><h2>Accept battle?</h2><p><b>${escape(offer.opponent?.name||'Opponent')}</b> brings ${escape(sanctuaryName(offer.opponent?.form))}.</p><p class="sanctuary-battle-note">Both players must accept before the three-second countdown.</p><div class="sanctuary-actions"><button type="button" data-pvp-action="accept">Accept battle</button><button type="button" data-pvp-action="decline">Decline</button></div></div>`;return;
 }
 pvpDialog.hidden=true;pvpDialog.replaceChildren();
}
pvpDialog.onclick=e=>{const b=e.target.closest('[data-pvp-action]');if(!b||b.disabled)return;const action=b.dataset.pvpAction,battleId=myPvp()?.id||battleOffer?.battleId;if(action==='accept'){send({type:'pvp_accept',battleId});battleOffer=null;renderPvpDialog()}else{send({type:action==='cancel'?'pvp_cancel':'pvp_decline',battleId});battleOffer=null;pvpDialog.dataset.key='';pvpDialog.hidden=true}};
function renderBattleResult(){const r=app.battleResult;if(!r){battleResultDialog.hidden=true;battleResultDialog.replaceChildren();return}const win=r.outcome==='win',draw=r.outcome==='draw';battleResultDialog.hidden=false;battleResultDialog.innerHTML=`<div class="sanctuary-battle-modal-card result-${win?'win':draw?'draw':'lose'}"><small>SERVER-SETTLED RING MATCH</small><h2 class="battle-result-word">${win?'WIN':draw?'DRAW':'LOSE'}</h2><p>${win?'Your Digimon takes the ring!':draw?'Both partners fought to a draw.':'Your partner fought hard. Train and return for a rematch.'}</p><strong class="battle-reward-line">◈ ${r.reward?.coins||0} Pet Coins · +${r.reward?.xp||0} XP${r.reward?.wins?' · +1 win':''}</strong><button type="button" data-battle-result-close>Return to DigiPet</button></div>`}
battleResultDialog.onclick=e=>{if(e.target.closest('[data-battle-result-close]')){app.battleResult=null;renderBattleResult()}};
function battleRewardSlot(line,preferred){if([0,1,2,3].includes(preferred)&&partnerLine(preferred)===line)return preferred;for(const slot of [0,1,2,3])if(partnerLine(slot)===line)return slot;return activePartnerSlot()}
function applyBattleReward(m){
 const id=typeof m.battleId==='string'?m.battleId:'';if(!id||app.battleRewards.has(id))return false;app.battleRewards.add(id);if(app.battleRewards.size>256)app.battleRewards.delete(app.battleRewards.values().next().value);
 const G=globalThis.PGDigimonSanctuary,line=R.cleanDigimon(m.lineId);if(!G||!line||!ownsDigimon(line)||typeof S!=='object'||!S)return false;const slot=battleRewardSlot(line,m.slot),result=G.applyBattleReward(partnerData(slot),S.digimonBag,line,m.reward,m.gearDrop||null);if(!result.ok)return false;S.digimonBag=result.bag;setPartnerData(slot,result.state);if(typeof save==='function')save();if(!sanctuaryPanel.hidden){sanctuarySync();sanctuaryRender()}return result;
}
function receiveBattleReward(m){const result=applyBattleReward(m);if(result){const G=globalThis.PGDigimonBattle,boss=!!G?.isBossWave?.(m.wave);worldNotice((boss?'Boss defeated — stage '+(G?.stageOf?.(m.wave)||1)+' cleared · ':m.local?'Local wave '+m.wave+' cleared · ':m.kind==='pve'?'Wave '+m.wave+' cleared · ':'Battle reward · ')+result.message)}}
function receiveBattleResult(m){applyBattleReward({...m,kind:'pvp'});app.battleResult=m;battleOffer=null;renderPvpDialog();renderBattleResult();renderBattleHUD()}
function battleSnapshot(m){if(m.room!==app.room)return;if(soloPve)stopSoloPve('stopped',false);app.battle={pve:Array.isArray(m.pve)?m.pve:[],pvp:m.pvp||null,queue:Array.isArray(m.queue)?m.queue:[]};if(Number.isFinite(m.at))app.battleOffset=m.at-Date.now();battleOffer=null;app.scene?.setBattleState?.(app.battle);renderBattleHUD();renderPvpDialog();if(app.battleIntent)app.battleIntent=null}
function battleUITick(){tickSoloPve();if(app.battleIntent&&Date.now()-(app.battleIntent.at||0)>=BATTLE_INTENT_MS){app.battleIntent=null;worldNotice('The plaza battle service did not respond. Reconnect, or use a preview with the matching Social Worker deployment.')}const match=myPvp();if(match?.phase==='countdown'){const el=$id('pvpCountdownNumber');if(el){const left=Math.max(0,Math.ceil((match.countdownUntil-(Date.now()+app.battleOffset))/1000));el.textContent=left>0?left:'FIGHT!'}}}
setInterval(battleUITick,100);
function worldNotice(text,active=false){clearTimeout(worldNoticeTimer);worldTrainingText.textContent=text;worldTrainingCancel.hidden=!active;worldTrainingHUD.hidden=false;if(!active)worldNoticeTimer=setTimeout(()=>{if(!worldTraining)worldTrainingHUD.hidden=true},5500)}
function refreshGymVisuals(){if(app.scene?.setGymResidents)app.scene.setGymResidents(app.room?gymEntries:(worldTraining?.phase==='active'&&worldTraining.room===0?[{owner:0,room:0,stat:worldTraining.stat,slot:worldTraining.equipment,species:worldTraining.species}]:[]))}
function cancelWorldTraining(reason='Gym training stopped.'){
 if(!worldTraining)return;const t=worldTraining;worldTraining=null;if(t.room&&app.socket?.readyState===1)send({type:'gym_stop'});refreshGymVisuals();refreshCompanionLook();worldNotice(reason);if(!sanctuaryPanel.hidden){sanctuarySync();sanctuaryRender()}
}
worldTrainingCancel.onclick=()=>cancelWorldTraining();
function worldNearbyFrame(player){
 battleNearbyFrame(player);
 const nearest=!worldTraining&&worldTrainingHUD.hidden&&player&&!player.sit&&!player.path?.length&&Object.entries(TRAIN_STATIONS).map(([stat,p])=>({stat,d:Math.hypot(player.x-p.x,player.z-p.z)})).sort((a,b)=>a.d-b.d)[0];
 const stat=nearest&&nearest.d<=7?nearest.stat:'';if(stat!==worldNearbyStat){worldNearbyStat=stat;worldNearby.hidden=!stat;if(stat)worldNearby.textContent='Auto-train '+sanctuaryName(stat)}
}
function gymClock(ms){const seconds=Math.max(0,Math.ceil(ms/1000));return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')}
function beginWorldTraining(equipment){const t=worldTraining;if(!t||!R.GYM_STATIONS[t.stat]?.[equipment])return;t.equipment=equipment;t.phase='active';t.last=Date.now();t.elapsed=0;t.completed=0;worldNotice(sanctuaryName(t.stat)+' auto-training · '+gymClock(PGDigimonSanctuary.DURATION)+(t.room?'':' · local solo'),true);refreshCompanionLook();refreshGymVisuals();if(!sanctuaryPanel.hidden)sanctuaryRender()}
function startWorldTraining(stat){
 const blocked=CLOUD.signingOut||CLOUD.lost||CLOUD.gate||(typeof cloudReplaced!=='undefined'&&cloudReplaced),named=typeof currentUser==='string'&&currentUser;
 const online=!blocked&&named&&CLOUD.on&&app.room&&app.connected&&app.socket?.readyState===1,local=!blocked&&named&&!CLOUD.on&&!app.room;
 if(!online&&!local)return worldNotice('Connect to an online plaza, or use a local character, to train a partner.');
 const G=globalThis.PGDigimonSanctuary,station=TRAIN_STATIONS[stat],source=app.players.get(app.room?app.id:SOLO_ID),player=source?R.advance({...source,path:(source.path||[]).map(p=>({...p}))},performance.now()):null,slot=activePartnerSlot(),line=partnerLine(slot);
 if(worldTraining)return worldNotice('Only one partner can use the gym at a time.',true);
 {const busy=battleBusySlot();if(busy!=null&&busy===activePartnerSlot())return worldNotice('Stop the current field or ring battle before gym training.');}
 if(!G||!station||!G.ROSTER.includes(line)||!ownsDigimon(line))return worldNotice('Hatch and choose an owned companion in DigiPet first.');
 if(!player||player.sit||player.path?.length||Math.hypot(player.x-station.x,player.z-station.z)>7)return worldNotice('Walk near the '+sanctuaryName(stat)+' station and stand still first.');
 const probe=G.act(partnerData(slot),line,{type:'train',stat},Date.now());if(probe.changed&&!probe.ok&&probe.state){setPartnerData(slot,probe.state);if(typeof save==='function')save()}if(!probe.ok)return worldNotice(probe.message);
 worldNearbyStat='';worldNearby.hidden=true;worldTraining={stat,line,slot,request:++gymSerial,owner:S,account:typeof currentUser==='string'?currentUser:null,room:app.room,species:G.species(partnerData(slot),line),phase:'pending'};
 if(app.room){if(!send({type:'gym_start',stat,species:worldTraining.species,slot,request:worldTraining.request})){worldTraining=null;return worldNotice('Could not reserve gym equipment. Try again.')}worldNotice('Reserving equipment…',true)}else beginWorldTraining(0);
}
function worldTrainingTick(){
 const t=worldTraining;if(!t)return;if(typeof S!=='object'||S!==t.owner||(t.account!==(typeof currentUser==='string'?currentUser:null))||partnerLine(t.slot)!==t.line){cancelWorldTraining('Gym training stopped because the partner or account changed.');return}
 if(t.room&&(!CLOUD.on||CLOUD.signingOut||CLOUD.lost||CLOUD.gate||(typeof cloudReplaced!=='undefined'&&cloudReplaced)||!app.connected||!app.socket||app.socket.readyState!==1)){cancelWorldTraining('Gym training stopped after disconnection.');return}
 if(!t.room&&(app.room||CLOUD.on)){cancelWorldTraining('Local gym practice stopped after connecting online.');return}
 if(t.phase!=='active')return;
 const now=Date.now(),delta=Math.max(0,now-t.last);t.last=now;t.elapsed+=delta;
 // Each completion is applied once. Excess elapsed time is bounded by the existing
 // energy/stat caps, so a throttled online tab cannot run an unbounded loop.
 while(t.elapsed>=PGDigimonSanctuary.DURATION&&worldTraining===t){t.elapsed-=PGDigimonSanctuary.DURATION;const result=PGDigimonSanctuary.completeWorldTraining(partnerData(t.slot),t.line,t.stat,now);if(result.changed&&result.state){setPartnerData(t.slot,result.state);if(typeof save==='function')save()}if(!result.ok){cancelWorldTraining(result.message+' Gym training stopped.');return}t.completed++;const next=PGDigimonSanctuary.act(partnerData(t.slot),t.line,{type:'train',stat:t.stat},now);if(!next.ok){cancelWorldTraining(result.message+' '+next.message+' Gym training stopped.');return}}
 const left=PGDigimonSanctuary.DURATION-t.elapsed;worldNotice(sanctuaryName(t.stat)+' auto-training · '+gymClock(left)+' · '+t.completed+' completed'+(t.room?'':' · local solo'),true);
}
setInterval(worldTrainingTick,1000);

let sanctuaryStore=null,sanctuaryFrame=0,sanctuaryEvolveConfirm=null,sanctuaryResetConfirm=null;
const sanctuaryName=id=>globalThis.PGDigimonSanctuary?.entry(id)?.name||String(id||'').replace(/^./,c=>c.toUpperCase());
const sanctuaryRosterOrder=(()=>{const G=globalThis.PGDigimonSanctuary;return G?[...G.STARTERS,...G.ROSTER.filter(id=>!G.STARTERS.includes(id))]:[]})();
// Stage filter options populate the DigiDex stage select (the owned-forms filter is gone).
for(const stage of globalThis.PGDigimonSanctuary?.STAGES||[]){const option=document.createElement('option');option.value=stage;option.textContent=stage;$id('sanctuaryIndexStage').append(option)}
function sanctuaryRosterRebuild(){
 // v354: the owned-forms card grid is gone; the hidden select stays as the assignment
 // mechanism and is rebuilt from the owned collection exactly as before.
 const G=globalThis.PGDigimonSanctuary;if(!G)return;const bag=ensureDigimonBag(),owned=bag?.owned||[];
 const ownedKey=owned.join(',');if(digimonSelect.dataset.owned!==ownedKey){digimonSelect.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent=owned.length?'Choose an owned partner':'Hatch an egg in the Pet Bag';digimonSelect.append(empty);for(const id of sanctuaryRosterOrder.filter(id=>owned.includes(id))){const option=document.createElement('option');option.value=id;option.textContent=sanctuaryName(id);digimonSelect.append(option)}digimonSelect.dataset.owned=ownedKey}
}
function sanctuaryDigidexProgress(id,bag){const G=globalThis.PGDigimonSanctuary,slot=activePartnerSlot();for(const s of [...new Set([slot,0,1,2,3])])for(const line of bag?.owned||[]){const data=partnerData(s);if(G.species(data,line)===id)return G.combatProfile(data,line,s)}return null}
function sanctuaryRenderIndex(bag=petBag()){
 const G=globalThis.PGDigimonSanctuary,B=globalThis.PGDigimonBattle,view=$id('sanctuaryIndexView');if(!G||!B||!view||view.hidden)return;
 const query=$id('sanctuaryIndexSearch').value.trim().toLowerCase(),stage=$id('sanctuaryIndexStage').value,pageSize=24,collected=new Set(bag?.owned||[]),current=G.species(partnerData(),partnerLine()),graph=G.evolutionCatalog();
 for(const slot of [0,1,2,3])for(const line of bag?.owned||[]){const form=G.species(partnerData(slot),line);if(form)collected.add(form)}
 // v351: "Browse branches in DigiDex" opens the guide focused on the active partner's
 // direct family — itself, every listed predecessor and every possible next form.
 const branch=sanctuaryIndexBranch&&G.ROSTER.includes(sanctuaryIndexBranch)?sanctuaryIndexBranch:null;
 const family=branch?new Set([branch,...(graph.incoming.get(branch)||[]),...(graph.outgoing.get(branch)||[])]):null;
 const branchClear=$id('sanctuaryIndexBranchClear');if(branchClear){branchClear.hidden=!branch;if(branch)branchClear.textContent='✕ '+G.name(branch)+'\'s branch — show all forms'}
 const ownedOnly=$id('sanctuaryIndexOwned')?.checked===true;
 // v354: the dex lists only attainable forms — reachable from the Baby egg pool through
 // direct evolution, plus anything this save already owns for completeness.
 const attainable=id=>graph.reachable.has(id)||collected.has(id);
 const filtered=G.ROSTER.filter(id=>{const e=G.entry(id),matches=!query||id.toLowerCase().includes(query)||G.name(id).toLowerCase().includes(query);return attainable(id)&&matches&&(!family||family.has(id))&&(!stage||(stage==='__unlisted'?!e?.stage:e?.stage===stage))&&(!ownedOnly||collected.has(id))});
 const attainableCount=G.ROSTER.filter(attainable).length;
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));sanctuaryIndexPage=Math.max(0,Math.min(pages-1,sanctuaryIndexPage));const shown=filtered.slice(sanctuaryIndexPage*pageSize,(sanctuaryIndexPage+1)*pageSize),list=$id('sanctuaryIndexList');
 const links=ids=>ids.map(target=>`<button type="button" data-digidex-form="${escape(target)}" title="View ${escape(G.name(target))}">${escape(G.name(target))}</button>`).join('');
 list.innerHTML=shown.length?shown.map(id=>{
  const entry=G.entry(id),outgoing=graph.outgoing.get(id)||[],incoming=graph.incoming.get(id)||[],starter=G.STARTER_POOL.includes(id),reachable=graph.reachable.has(id),classes=['sanctuary-index-entry'],progress=sanctuaryDigidexProgress(id,bag),base=B.combatPreview(id),trained=progress?B.combatPreview(id,progress):null,stageLabel=entry?.stage||'Stage not listed',rank=({'Baby I':'baby1','Baby II':'baby2','Mega+':'mega-plus'}[stageLabel]||stageLabel.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')),portrait=G.ROSTER.indexOf(id),px=-(portrait%20)*64,py=-Math.floor(portrait/20)*64;
  if(collected.has(id))classes.push('is-owned');if(current===id)classes.push('is-current');if(!reachable)classes.push('is-unreachable');
  const status=current===id?'CURRENT PARTNER':collected.has(id)?'IN COLLECTION':starter?'BABY EGG POOL':reachable?'REACHABLE BY DIRECT EVOLUTION':'NOT CURRENTLY OBTAINABLE';
  const fromText=incoming.length?links(incoming):starter?'Baby egg pool — no evolution required.':'No supported incoming direct form.';
  const toText=outgoing.length?links(outgoing):(incoming.length||reachable)?'No supported outgoing evolution — final form in the current direct-route catalog.':'No supported outgoing direct evolution.';
  return `<article class="${classes.join(' ')}" data-index-form="${escape(id)}" data-rank="${rank}"><div class="digidex-card-head"><span class="digidex-portrait" role="img" aria-label="${escape(G.name(id))} portrait" style="--portrait-x:${px}px;--portrait-y:${py}px"></span><div class="digidex-title"><strong>${escape(G.name(id))}</strong><span class="digidex-stage">${escape(stageLabel)}</span><small class="digidex-status">${status}</small></div>${collected.has(id)?`<button type="button" class="digidex-assign" data-digidex-assign="${escape(id)}" ${current===id?'disabled':''}>${current===id?'ACTIVE PARTNER':'MAKE PARTNER'}</button>`:''}</div><small class="digidex-meta">${escape(entry?.attribute||'Attribute unlisted')} · ${escape(entry?.type||'Type unlisted')}</small><section class="digidex-base-layer" aria-label="Base battle stats"><small>BASE BATTLE · LV 1</small><div><span>HP <b>${base.maxHp}</b></span><span>ATK <b>${base.attack}</b></span><span>DEF <b>${base.defense}</b></span><span>SPD <b>${base.spd===1?'±0%':(base.spd>1?'+':'−')+Math.abs(Math.round((base.spd-1)*100))+'%'}</b></span></div></section>${trained?`<section class="digidex-owned-layer"><b>YOUR LAYER · LV ${trained.level} · MASTERY ${trained.mastery}</b><span>HP ${trained.maxHp} · ATK ${trained.attack} · DEF ${trained.defense} · ${trained.wins} wins</span><small>POW ${trained.stats.power} · GRD ${trained.stats.guard} · AGI ${trained.stats.agility} · FOC ${trained.stats.focus}</small></section>`:''}<section class="digidex-paths"><p><b>Evolves from · ${incoming.length}</b><span>${fromText}</span></p><p><b>Evolves to · ${outgoing.length}</b><span>${toText}</span></p></section>${!reachable?'<small class="digidex-route-note">No supported Baby-egg/direct route. Special, fusion, tagged or missing-profile links are not currently enabled.</small>':''}</article>`;
 }).join(''):'<div class="sanctuary-empty">No DigiDex forms match this search.</div>';
 list.onclick=e=>{const assign=e.target.closest('[data-digidex-assign]');if(assign){if(assignPartner(assign.dataset.digidexAssign))sanctuaryRenderIndex(bag);return}
 const button=e.target.closest('[data-digidex-form]');if(!button||!list.contains(button))return;const id=button.dataset.digidexForm;if(!G.ROSTER.includes(id))return;$id('sanctuaryIndexSearch').value=G.name(id);$id('sanctuaryIndexStage').value='';sanctuaryIndexPage=0;sanctuaryRenderIndex(bag)};
 $id('sanctuaryIndexStatus').textContent=(branch?filtered.length+' forms in '+G.name(branch)+'\'s direct branch · ':'')+(ownedOnly?filtered.length+' of '+collected.size+' owned forms':filtered.length+' of '+attainableCount+' attainable forms · '+collected.size+' owned');$id('sanctuaryIndexPage').textContent='Page '+(sanctuaryIndexPage+1)+' / '+pages;$id('sanctuaryIndexPrev').disabled=sanctuaryIndexPage===0;$id('sanctuaryIndexNext').disabled=sanctuaryIndexPage>=pages-1;
}
// v351: each partner slot shows what it is doing right now, so training one partner while
// another grinds reads as two parallel activities instead of two overlapping mystery HUDs.
function slotActivity(slot){
 if(worldTraining&&worldTraining.slot===slot)return {cls:'is-training',label:sanctuaryName(worldTraining.stat).toUpperCase()+' TRAINING'};
 const run=myPve();if(run&&run.profile?.slot===slot)return {cls:'is-grinding',label:'GRINDING · STAGE '+(globalThis.PGDigimonBattle?.stageOf?.(run.wave)||1)};
 const match=myPvp();if(match&&match.participants?.some(p=>p.profile?.slot===slot))return {cls:'is-pvp',label:'RING MATCH'};
 return null;
}
function sanctuaryRenderPartnerGrid(){
 const G=globalThis.PGDigimonSanctuary,grid=$id('sanctuaryPartnerGrid');if(!G||!grid||typeof S!=='object'||!S)return;
 const active=activePartnerSlot(),bag=petBag(),parts=[0,1,2,3].map(slot=>{
  const line=partnerLine(slot),data=partnerData(slot),p=line&&G.ROSTER.includes(line)?G.normalize(data,line)?.partners?.[line]:null,form=line?(G.species(data,line)||line):null;
  return {slot,line,form,p,activity:slotActivity(slot),gear:form?Object.values(bag?.gear?.equip?.[line]||{}).filter(uid=>bag.gear.items[uid]).length:0};
 });
 const key=[active,...parts.map(x=>[x.line,x.form,x.p?.level,x.p?.training?.stat,x.activity?.label,x.gear])].join('|');
 if(key!==sanctuaryPartnerGridKey){
  sanctuaryPartnerGridKey=key;grid.replaceChildren();
  for(const part of parts){
   const card=document.createElement('button');card.type='button';card.className='sanctuary-partner-card'+(part.form?'':' is-empty')+(part.slot===active?' is-active':'')+(part.activity?' '+part.activity.cls:'');
   card.dataset.partnerSlot=String(part.slot);card.dataset.form=part.form||'';card.setAttribute('aria-pressed',String(part.slot===active));
   card.innerHTML='<span class="sanctuary-partner-head"><b>Partner '+(part.slot+1)+'</b><i class="sanctuary-partner-activity'+(part.activity?'':' is-idle')+'">'+(part.activity?.label||'IDLE')+'</i>'+(part.slot===active?'<i class="sanctuary-partner-flag">ACTIVE</i>':'')+'</span>'+(part.form?'<canvas width="256" height="256" aria-hidden="true"></canvas><strong>'+escape(sanctuaryName(part.form))+'</strong><small>'+escape(G.entry(part.form)?.stage||'Stage not listed')+' · Lv '+G.level(part.p)+''+(part.gear?' · ⚙ '+part.gear+'/4':'')+'</small>':'<span class="sanctuary-partner-empty" aria-hidden="true">＋</span><strong>Empty slot</strong><small>Choose a form from your collection below</small>');
   grid.append(card);
  }
 }else for(const card of grid.querySelectorAll('[data-partner-slot]'))card.setAttribute('aria-pressed',String(Number(card.dataset.partnerSlot)===active));
}
function sanctuarySync(){const id=partnerLine(),G=globalThis.PGDigimonSanctuary,slot=activePartnerSlot();sanctuaryRosterRebuild();sanctuaryRenderPartnerGrid();digimonSelect.value=id||'';const form=id&&(G?.species(partnerData(),id)||id);$id('sanctuaryActive').textContent=form?(worldTraining?.slot===slot?'Training '+sanctuaryName(form):'Walking with '+sanctuaryName(form)):'No companion selected';$id('sanctuaryDismiss').disabled=!id}
// v351 gear inventory: every piece in the Pet Bag with its holder, equip target, and the
// Forge's reroll/tier-up actions. Equipping is per partner line, so builds differ per slot.
// v354: compact gear cards with hand-drawn pixel icons (no image assets — the icon is
// painted on a 48px canvas from an 8x8 grid, tinted by tier palette).
function sanctuaryGearIcon(canvas,kind,tier){
 const ctx=canvas.getContext&&canvas.getContext('2d');if(!ctx||!ctx.fillRect)return;
 const palettes=[['#8a8f86','#5b6058','#c9cec2'],['#aab7c6','#6b7a8a','#e2eaf2'],['#9fb7c9','#5e7d95','#d7e8f4'],['#8fd8cc','#3f8d80','#d9fff7'],['#e8c96a','#a67c2f','#ffe9a8']];
 const p=palettes[Math.max(0,Math.min(4,(Number(tier)||1)-1))],[mid,dark,light]=p;
 const px=(x,y,c)=>{ctx.fillStyle=c;ctx.fillRect(x*6,y*6,6,6)};
 ctx.clearRect(0,0,48,48);
 if(kind==='weapon'){for(let i=0;i<6;i++)px(6-i,1+i,mid);px(1,6,dark);px(2,6,dark);px(3,7,dark);px(2,7,dark);px(6,0,light);px(5,1,light)}
 else if(kind==='armor'){for(let x=2;x<6;x++){px(x,1,mid);px(x,6,mid)}for(let y=2;y<6;y++){px(1,y,mid);px(6,y,mid)}px(2,2,dark);px(5,2,dark);px(3,4,light);px(4,4,light)}
 else if(kind==='accessory'){for(let a=0;a<8;a++){const t=a/8*Math.PI*2;px(Math.round(3.5+Math.cos(t)*2.4),Math.round(3.5+Math.sin(t)*2.4),mid)}px(4,1,light);px(3,1,light)}
 else{for(let x=2;x<6;x++)for(let y=2;y<6;y++)px(x,y,mid);px(3,3,light);px(1,3,dark);px(6,4,dark);px(4,1,dark);px(3,6,dark)}
}
function sanctuaryRenderGear(bag,G){
 if(!bag||typeof S!=='object'||!S)return '';
 const gearHolder={};for(const [line,slots] of Object.entries(bag.gear.equip))for(const uid of Object.values(slots))gearHolder[uid]=line;
 const items=Object.entries(bag.gear.items).sort((a,b)=>(gearHolder[b[0]]?1:0)-(gearHolder[a[0]]?1:0)||b[1].tier-a[1].tier);
 const owned=bag.owned.map(l=>`<option value="${escape(l)}"${l===partnerLine()?' selected':''}>${escape(sanctuaryName(l))}</option>`).join('');
 const cards=items.map(([uid,item])=>{const holder=gearHolder[uid],ref=G.gearRefineTag(item),tierCost=G.FORGE_TIER_COST[item.tier-1],refCost=G.REFINE_COST[item.tier-1],refPct=Math.round(G.REFINE_SUCCESS[item.refine]*100);
  return `<div class="sanctuary-item sanctuary-gear-item" data-gear-uid="${escape(uid)}"><span class="sanctuary-gear-row"><canvas width="48" height="48" data-gear-icon data-gear-kind="${escape(item.kind)}" data-gear-tier="${item.tier}" aria-hidden="true"></canvas><span class="sanctuary-gear-head"><strong>${escape(G.gearItemName(item))}${escape(ref)}</strong><small>T${item.tier} · ${escape(G.GEAR_STAT_NAME[item.main.stat])} <b>${G.gearStatValue(item.main,item.refine)}</b>${item.special?' · '+escape(G.GEAR_STAT_NAME[item.special.stat])+' <b>'+G.gearStatValue(item.special,item.refine)+'</b>':''}</small>${holder?`<small class="sanctuary-gear-holder">On: ${escape(sanctuaryName(holder))}</small>`:''}</span></span><div class="sanctuary-actions">${holder?`<button type="button" data-gear-action="unequip" data-gear-uid="${escape(uid)}">Unequip</button>`:`<label class="sanctuary-gear-equip">Equip on <select data-gear-line>${owned}</select></label><button type="button" data-gear-action="equip" data-gear-uid="${escape(uid)}">Equip</button>`}${item.tier<5?`<button type="button" data-gear-action="tier" data-gear-uid="${escape(uid)}" title="Same affix, numbers redrawn from the next tier band — never below current" ${bag.coins<tierCost?'disabled':''}>Tier up · ${tierCost} ◈</button>`:'<small class="sanctuary-gear-max">Max tier</small>'}${item.refine<G.REFINE_MAX?`<button type="button" data-gear-action="refine" data-gear-uid="${escape(uid)}" title="Attempt +${item.refine+1}: every stat +8% on success; a miss only spends the coins" ${bag.coins<refCost?'disabled':''}>Refine +${item.refine+1} · ${refCost} ◈ · ${refPct}%</button>`:'<small class="sanctuary-gear-max">Refined +5</small>'}</div></div>`}).join('');
 return `<section class="sanctuary-section sanctuary-gear"><div class="sanctuary-section-head"><div><small>GEAR</small><h3>Partner equipment</h3></div><span class="sanctuary-level">${items.length} / ${G.GEAR_ITEM_CAP} pieces</span></div><p>Drops come with random stats and at most one special. Four slots per partner — weapon, armor, accessory, relic. The Forge raises a tier without changing the stats, and Refine pushes +1…+5 with falling success rates; a failed refine only spends the Pet Coins.</p><div class="sanctuary-item-grid sanctuary-gear-grid">${cards||'<div class="sanctuary-empty">No gear yet — clear field waves for random drops. Bosses drop better tiers.</div>'}</div></section>`;
}
function sanctuaryRenderAux(){
 const G=globalThis.PGDigimonSanctuary,bag=petBag(),bagBox=$id('sanctuaryBagView'),shopBox=$id('sanctuaryShopView');if(!G)return;
 $id('sanctuaryCoins').textContent=bag?bag.coins:'—';
 if(bagBox){bagBox.innerHTML=!bag?'<div class="sanctuary-empty">This pet bag uses a newer save version and has not been changed.</div>':`<section class="sanctuary-section sanctuary-bag"><div class="sanctuary-section-head"><div><small>INVENTORY</small><h3>Pet Bag</h3></div><span class="sanctuary-level">${bag.owned.length} / ${G.STARTER_POOL.length} starter-pool forms owned</span></div><div class="sanctuary-item-grid"><div class="sanctuary-item"><span class="sanctuary-item-icon">🥚</span><strong>Mystery Digi-Egg</strong><b>${bag.eggs}</b><small>Random Baby I or Baby II · duplicate-protected</small><button type="button" data-bag-action="hatch" ${bag.eggs<1||bag.owned.length>=G.STARTER_POOL.length||trainingSlotBusy()?'disabled':''}>${trainingSlotBusy()?'Stop this slot’s training to hatch':'Hatch an egg'}</button></div>${sanctuaryHatch?`<div class="sanctuary-hatch-result" role="status"><span>HATCHED PARTNER</span><strong>${escape(sanctuaryName(sanctuaryHatch))}</strong><p>Your new partner is saved and selected. Its care and gym progress start fresh.</p><button type="button" data-bag-action="show-partner">View partner</button></div>`:''}</section>${sanctuaryRenderGear(bag,G)}`;
 for(const c of bagBox.querySelectorAll('canvas[data-gear-icon]'))sanctuaryGearIcon(c,c.dataset.gearKind,Number(c.dataset.gearTier)||1); }
 if(shopBox)shopBox.innerHTML=!bag?'<div class="sanctuary-empty">This pet bag uses a newer save version and has not been changed.</div>':`<section class="sanctuary-section sanctuary-shop"><div class="sanctuary-section-head"><div><small>FOUNTAIN PLAZA · COOK LINA</small><h3>Pet provisions</h3></div><span class="sanctuary-level">◈ ${bag.coins} Pet Coins</span></div><div class="sanctuary-item-grid">${Object.entries(G.ITEMS).map(([id,item])=>`<div class="sanctuary-item"><span class="sanctuary-item-icon">${id==='egg'?'🥚':'🥚'}</span><strong>${escape(item.name)}</strong><b>◈ ${item.price}</b><small>A random unowned Baby I/Baby II partner · duplicate-protected</small><button type="button" data-shop-item="${id}" data-quantity="1" ${id==='egg'&&(bag.eggs>=G.STARTER_POOL.length-bag.owned.length)?'disabled':''}>Buy 1 · ${item.price} Pet Coins</button></div>`).join('')}</div></section>`;
 sanctuaryRenderIndex(bag);
}
function sanctuarySetView(view){const views=['partners','index','bag','shop'];sanctuaryView=views.includes(view)?view:'partners';for(const name of views){const panel=$id('sanctuary'+name[0].toUpperCase()+name.slice(1)+'View');if(panel)panel.hidden=name!==sanctuaryView}for(const b of sanctuaryPanel.querySelectorAll('[data-sanctuary-view]'))if(b.closest('.sanctuary-nav'))b.setAttribute('aria-pressed',String(b.dataset.sanctuaryView===sanctuaryView));sanctuaryRenderAux()}
function sanctuaryRender(){const G=globalThis.PGDigimonSanctuary,box=$id('sanctuaryGameplay'),line=partnerLine();if(!G||!S){box.replaceChildren();return}const bag=ensureDigimonBag();sanctuaryRenderAux();if(!bag){box.textContent='This save uses a newer pet-bag version and has not been changed.';return}const data=G.normalize(partnerData(),line);if(!data){box.textContent='This save uses a newer DigiPet version and has not been changed.';return}if(!G.ROSTER.includes(line)){box.innerHTML='<div class="sanctuary-empty">Hatch a Digi-Egg in the Pet Bag, then choose an owned partner above to begin care and training.</div>';return}const p=data.partners[line],req=G.requirements(p,line),form=p.form,busy=!!p.training,equippedMap=bag.gear.equip[line]||{};
 const statButtons=G.STATS.map(k=>`<span title="${{power:'+2.5 attack each',guard:'+7 HP and +1.2 defense each',agility:'+2.5% swing speed each — quicker, more reliable hits',focus:'+1% crit chance each'}[k]}">${sanctuaryName(k)} <b>${p.stats[k]}/12</b><small>${{power:'+2.5 attack each',guard:'+7 HP and +1.2 defense each',agility:'+2.5% swing speed each — quicker, more reliable hits',focus:'+1% crit chance each'}[k]}</small></span>`).join('');
 const confirming=sanctuaryEvolveConfirm?.line===line&&req?.ready&&!busy;
 const resetting=sanctuaryResetConfirm===line&&!busy;
 const evolutionCopy=req?`Evolve: reach ${req.points} training points and ${req.wins} battle wins, then roll one of ${req.options.length} possible branch${req.options.length===1?'':'es'} — the pool is shown below before you commit. You keep your level, training and wins. · ${G.total(p)}/${req.points} points · ${p.wins}/${req.wins} wins.`:p.stage>=G.MAX_EVOLUTIONS?'This partner has reached the casual evolution-count limit.':'No direct source-listed evolution is available from this form. Special, fusion and missing-profile paths are not invented.';
 const evolutionButtons=confirming?`<button type="button" data-sanctuary-action="evolve">Evolve now — roll the branch</button><button type="button" data-sanctuary-action="cancelEvolution">Cancel</button>`:req?`<button type="button" data-sanctuary-action="requestEvolution" ${!req.ready||busy?'disabled':''}>Evolve</button>`:'<button type="button" disabled>No direct evolution</button>';
 const resetButtons=resetting?`<button type="button" data-sanctuary-action="reset">Confirm restart as Digi-Egg</button><button type="button" data-sanctuary-action="cancelReset">Cancel</button>`:`<button type="button" data-sanctuary-action="requestReset" ${busy?'disabled':''}>Restart as Digi-Egg</button>`;
 box.innerHTML=`${worldTraining?`<div class="sanctuary-actions"><button type="button" data-gym-stop>Stop Partner ${worldTraining.slot+1} gym training</button></div>`:''}<div class="sanctuary-sections"><section class="sanctuary-section"><div class="sanctuary-section-head"><div><small>PARTNER CARE</small><h3>${sanctuaryName(form)}</h3></div><span class="sanctuary-level">Level ${G.level(p)} · ${G.entry(form)?.stage||'Stage not listed'} · ${p.stage} evolutions · Mastery ${p.mastery}</span></div><p class="sanctuary-care-note">Care is pressure-free since the energy meter was retired — gym sessions are paced by their timer alone, and grind runs end on waves or defeat.</p></section>
 <section class="sanctuary-section"><div class="sanctuary-section-head"><div><small>EQUIPMENT</small><h3>Gear build</h3></div><span class="sanctuary-level">${['weapon','armor','accessory','relic'].filter(k=>equippedMap[k]).length}/4 slots used</span></div><div class="sanctuary-gear-strip">${['weapon','armor','accessory','relic'].map(k=>{const item=equippedMap[k]&&bag.gear.items[equippedMap[k]];return `<span class="${item?'':'is-empty'}"><b>${k}</b>${item?escape(G.gearItemName(item))+' · '+escape(G.gearItemLabel(item).split(' · ').slice(1).join(' · ')):'— empty —'}</span>`}).join('')}</div><div class="sanctuary-actions"><button type="button" data-open-bag>Equip gear in the Pet Bag</button></div></section>
 <section class="sanctuary-section"><div class="sanctuary-section-head"><div><small>TRAINING GROUNDS</small><h3>Grow your strengths</h3></div><span class="sanctuary-level">${G.total(p)}/24 points</span></div><p>${p.training?'Training '+sanctuaryName(p.training.stat)+' · <span id="sanctuaryCountdown"></span>':'20 min per session · +1 point · caps 12 per stat, 24 total'}</p><div class="sanctuary-train">${statButtons}</div></section>
 <section class="sanctuary-section"><div class="sanctuary-section-head"><div><small>YOUR PATH</small><h3>Evolution or mastery</h3></div></div><p>${evolutionCopy}</p>${confirming&&req?.options?.length?`<p class="sanctuary-roll-pool">Possible: ${req.options.map(t=>escape(sanctuaryName(t))).join(' · ')}</p>`:''}${resetting?'<p class="sanctuary-roll-pool">Restart to Digi-Egg: this partner\'s level, training, wins and mastery reset to zero so you can raise it again — and reroll a different evolution branch next time. The species stays unlocked in your collection, and your other slots are untouched.</p>':''}<div class="sanctuary-actions">${evolutionButtons}<button type="button" data-open-digidex>Browse branches in DigiDex</button><button type="button" data-sanctuary-action="mastery" title="Stays this form; +1.5 attack per mastery point in the field formula" ${p.mastery>=6||G.total(p)<(p.mastery+1)*4?'disabled':''}>Keep form · improve mastery</button>${resetButtons}</div></section></div>`;
 sanctuaryCountdown();
}
function sanctuaryCountdown(){const G=globalThis.PGDigimonSanctuary,line=partnerLine(),el=$id('sanctuaryCountdown'),p=G?.normalize(partnerData(),line)?.partners?.[line];if(el&&p?.training)el.textContent=gymClock(p.training.ends-Date.now())+' remaining'}
function sanctuaryCommit(action){
 if(worldTraining&&worldTraining.slot===activePartnerSlot()){$id('sanctuaryMessage').textContent='Finish or cancel on-map training first.';return}
 {const busy=battleBusySlot();if(busy!=null&&busy===activePartnerSlot()){$id('sanctuaryMessage').textContent='Stop the field or ring battle before changing this partner.';return}}
 const G=globalThis.PGDigimonSanctuary;if(!G||typeof S!=='object'||!S)return;const slot=activePartnerSlot(),line=partnerLine(slot);
 if(!G.ROSTER.includes(line)||!ownsDigimon(line)){$id('sanctuaryMessage').textContent='Hatch and choose an owned partner first.';return}
 if(action.type==='requestEvolution'){const p=G.normalize(partnerData(slot),line)?.partners?.[line],req=p&&G.requirements(p,line);if(!req?.ready||!req.options.length){$id('sanctuaryMessage').textContent='Evolution requirements are not met.';return}sanctuaryEvolveConfirm={line,roll:true};sanctuaryResetConfirm=null;sanctuaryRender();return}
 if(action.type==='cancelEvolution'){sanctuaryEvolveConfirm=null;sanctuaryRender();return}
 if(action.type==='evolve'&&sanctuaryEvolveConfirm?.line!==line)return;
 if(action.type==='requestReset'){sanctuaryResetConfirm=line;sanctuaryEvolveConfirm=null;sanctuaryRender();return}
 if(action.type==='cancelReset'){sanctuaryResetConfirm=null;sanctuaryRender();return}
 if(action.type==='reset'&&sanctuaryResetConfirm!==line)return;
 sanctuaryEvolveConfirm=null;sanctuaryResetConfirm=null;
 const before=G.normalize(partnerData(slot),line)?.partners?.[line]?.battle?.status;
 const result=G.act(partnerData(slot),line,action,Date.now());let dirty=false;if(result.changed&&result.state){setPartnerData(slot,result.state);dirty=true}
 let reward=null;if(action.type==='battle'&&result.ok&&before==='active'&&result.state?.partners?.[line]?.battle?.status==='win'){
  reward=G.bagReward(S.digimonBag,'spar');if(reward.changed){S.digimonBag=reward.state;dirty=true}
 }
 if(dirty&&typeof save==='function')save();
 sanctuarySync();sanctuaryRender();$id('sanctuaryMessage').textContent=result.message+(reward?' '+reward.message:'');
 if(action.type==='evolve'&&result.ok){if(app.room)send({type:'look',look:currentLook()});else syncSoloPlayer()}
}
function sanctuaryClose(){sanctuaryPanel.hidden=true;sanctuaryFrame++;sanctuaryHatch=null;$id('sanctuaryOpen').focus()}
function sanctuaryOpen(){ensureDigimonBag();discardLegacyActivities();sanctuarySync();sanctuaryRender();sanctuaryPanel.hidden=false;$id('sanctuaryClose').focus();const D=globalThis.PGSocialDigimon;if(!D)return;sanctuaryStore ||= D.sharedStore();const run=++sanctuaryFrame;
 function paintOne(canvas,id,now,flip,actionAt,status){if(!canvas||!id)return;const asset=sanctuaryStore.ready(id);if(!asset){sanctuaryStore.request(id);return}let stance='idle',time=now;if(status==='faint'){stance='faint';time=(asset.record.actions.faint.length-1)*50}else if(actionAt&&now-actionAt<asset.record.actions.attack.length*50){stance='attack';time=now-actionAt}const frame=D.frameIndex(asset.record.actions[stance].length,time,stance,5),key=[id,stance,frame,flip].join(':');if(canvas.dataset.paint!==key){canvas.dataset.paint=key;D.draw(canvas.getContext('2d'),asset,stance,time,5,flip)}}
 function paint(now){if(run!==sanctuaryFrame||sanctuaryPanel.hidden)return;if(sanctuaryView==='partners'){const grid=$id('sanctuaryPartnerGrid');if(grid)for(const card of grid.querySelectorAll('[data-partner-slot]'))if(card.dataset.form)paintOne(card.querySelector('canvas'),card.dataset.form,now,false,0,'')}requestAnimationFrame(paint)}requestAnimationFrame(paint);
 function tick(){if(run!==sanctuaryFrame||sanctuaryPanel.hidden)return;const G=globalThis.PGDigimonSanctuary;if(G&&typeof S==='object'&&S){const slot=activePartnerSlot(),u=G.update(partnerData(slot),Date.now(),partnerLine(slot));if(u.changed&&u.state){setPartnerData(slot,u.state);if(typeof save==='function')save();sanctuarySync();sanctuaryRender()}else sanctuaryCountdown()}setTimeout(tick,1000)}setTimeout(tick,1000);
}
function openSanctuaryShop(){ensureDigimonBag();if(sanctuaryPanel.hidden)sanctuaryOpen();sanctuarySetView('shop');$id('sanctuaryMessage').textContent='Cook Lina: Mystery Digi-Eggs, paid with Pet Coins.'}
function openSanctuaryIndex(){ensureDigimonBag();if(sanctuaryPanel.hidden)sanctuaryOpen();sanctuarySetView('index');$id('sanctuaryMessage').textContent='Guide Nia: every listed evolution is a direct possibility, not a fixed lineage.'}
$id('sanctuaryOpen').onclick=sanctuaryOpen;$id('sanctuaryClose').onclick=sanctuaryClose;sanctuaryPanel.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();sanctuaryClose()}};
function assignPartner(chosen){
 if(typeof S!=='object'||!S)return false;const slot=activePartnerSlot();
 if(battleBusy()){$id('sanctuaryMessage').textContent='Stop the current battle before changing partners.';return false}
 if(worldTraining&&worldTraining.slot===slot){$id('sanctuaryMessage').textContent='Stop this partner\u2019s gym training before changing it.';return false}
 sanctuaryEvolveConfirm=null;sanctuaryResetConfirm=null;
 // An empty choice is the Dismiss path: the slot keeps its progress, it just walks alone.
 if(chosen&&!ownsDigimon(chosen)){$id('sanctuaryMessage').textContent='Hatch that species before choosing it.';return false}
 setPartnerLine(slot,chosen||null);if(typeof save==='function')save();refreshCompanionLook();sanctuarySync();sanctuaryRender();
 $id('sanctuaryMessage').textContent=chosen?sanctuaryName(chosen)+' is now partner '+(slot+1)+'.':'Partner '+(slot+1)+' is walking alone now.';
 return true;
}
digimonSelect.onchange=()=>{assignPartner(R.cleanDigimon(digimonSelect.value))};
$id('sanctuaryPartnerGrid').onclick=e=>{const card=e.target.closest('[data-partner-slot]');if(!card||typeof S!=='object'||!S)return;if(battleBusy()){$id('sanctuaryMessage').textContent='Stop the current battle before changing partner slots.';return}const next=Number(card.dataset.partnerSlot);S.digimonActiveSlot=Number.isInteger(next)&&next>=0&&next<=3?next:0;sanctuaryEvolveConfirm=null;sanctuaryResetConfirm=null;if(typeof save==='function')save();refreshCompanionLook();sanctuarySync();sanctuaryRender()};
{const ownedToggle=$id('sanctuaryIndexOwned');if(ownedToggle)ownedToggle.addEventListener('change',()=>{sanctuaryIndexPage=0;sanctuaryRenderIndex()});}
$id('sanctuaryIndexSearch').addEventListener('input',()=>{sanctuaryIndexPage=0;sanctuaryRenderIndex()});
$id('sanctuaryIndexBranchClear').onclick=()=>{sanctuaryIndexBranch=null;sanctuaryIndexPage=0;sanctuaryRenderIndex()};
$id('sanctuaryIndexStage').addEventListener('change',()=>{sanctuaryIndexPage=0;sanctuaryRenderIndex()});
$id('sanctuaryIndexPrev').onclick=()=>{sanctuaryIndexPage=Math.max(0,sanctuaryIndexPage-1);sanctuaryRenderIndex()};
$id('sanctuaryIndexNext').onclick=()=>{sanctuaryIndexPage++;sanctuaryRenderIndex()};
$id('sanctuaryDismiss').onclick=()=>{digimonSelect.value='';digimonSelect.onchange()};
$id('sanctuaryGameplay').onclick=e=>{if(e.target.closest('[data-open-digidex]')){const G=globalThis.PGDigimonSanctuary,form=partnerLine()&&(G?.species(partnerData(),partnerLine())||partnerLine());if(form){sanctuaryIndexBranch=form;$id('sanctuaryIndexSearch').value='';$id('sanctuaryIndexStage').value='';sanctuaryIndexPage=0}sanctuarySetView('index');sanctuaryRenderIndex();return}if(e.target.closest('[data-open-bag]')){sanctuarySetView('bag');return}if(e.target.closest('[data-gym-stop]')){cancelWorldTraining();return}const button=e.target.closest('[data-sanctuary-action]');if(!button||button.disabled)return;sanctuaryCommit({type:button.dataset.sanctuaryAction,stat:button.dataset.stat,command:button.dataset.command,target:button.dataset.target})};
function sanctuaryBuy(item,quantity){
 const G=globalThis.PGDigimonSanctuary,bag=ensureDigimonBag();if(!G||!bag||typeof S!=='object'||!S)return;
 const result=G.bagBuy(bag,item,quantity);if(result.changed){S.digimonBag=result.state;if(typeof save==='function')save()}sanctuaryRenderAux();$id('sanctuaryMessage').textContent=result.message;
}
function sanctuaryHatchEgg(){
 const G=globalThis.PGDigimonSanctuary,bag=ensureDigimonBag();if(!G||!bag||typeof S!=='object'||!S)return;
 // v354: a hatch never overwrites a raised partner again. The baby goes to the first empty
 // slot; with all four occupied the hatch is refused until a slot is deliberately freed.
 const slot=[0,1,2,3].find(i=>!partnerLine(i));
 if(slot==null){$id('sanctuaryMessage').textContent='All four partner slots are taken. Restart a partner as a Digi-Egg (or choose a different species for a slot) before hatching another egg.';return}
 if((worldTraining?.slot===slot)&&trainingSlotBusy()){$id('sanctuaryMessage').textContent='Stop that slot\u2019s gym training before hatching into it.';return}
 if(battleBusy()){$id('sanctuaryMessage').textContent='Stop the current battle before hatching a new partner.';return}
 const result=G.bagHatch(bag);if(!result.ok){$id('sanctuaryMessage').textContent=result.message;return}
 const nextPartner=G.normalize(partnerData(slot),result.line);if(!nextPartner){$id('sanctuaryMessage').textContent='This DigiPet save uses a newer version; the egg was not consumed.';return}
 S.digimonBag=result.state;S.digimonActiveSlot=slot;setPartnerLine(slot,result.line);setPartnerData(slot,nextPartner);sanctuaryHatch=result.line;if(typeof save==='function')save();refreshCompanionLook();sanctuarySync();sanctuaryRender();$id('sanctuaryMessage').textContent=result.message+' It now lives in partner slot '+(slot+1)+'.';
}
for(const b of sanctuaryPanel.querySelectorAll('[data-sanctuary-view]'))b.onclick=()=>{sanctuarySetView(b.dataset.sanctuaryView);if(b.dataset.sanctuaryView==='partners'){sanctuarySync();sanctuaryRender()}};
$id('sanctuaryBagView').onclick=e=>{
 const gearButton=e.target.closest('[data-gear-action]');
 if(gearButton&&!gearButton.disabled){
  const G=globalThis.PGDigimonSanctuary,uid=gearButton.dataset.gearUid,action=gearButton.dataset.gearAction;
  let result=null;
  if(action==='equip'){const select=gearButton.closest('.sanctuary-gear-item')?.querySelector('[data-gear-line]');result=G.gearEquip(S.digimonBag,uid,select?.value||partnerLine())}
  else if(action==='unequip')result=G.gearUnequip(S.digimonBag,uid);
  else if(action==='refine'||action==='tier')result=G.bagForge(S.digimonBag,uid,action);
  if(result){$id('sanctuaryMessage').textContent=result.message;if(result.ok){S.digimonBag=result.state;if(typeof save==='function')save()}}
  sanctuaryRenderAux();return;
 }
 const button=e.target.closest('[data-bag-action]');if(!button||button.disabled)return;
 if(button.dataset.bagAction==='hatch')sanctuaryHatchEgg();
 else if(button.dataset.bagAction==='show-partner'){sanctuarySetView('partners');sanctuarySync();sanctuaryRender()}
 else if(button.dataset.bagAction==='open-shop'){sanctuarySetView('shop')}
};
$id('sanctuaryShopView').onclick=e=>{const button=e.target.closest('[data-shop-item]');if(button&&!button.disabled)sanctuaryBuy(button.dataset.shopItem,Number(button.dataset.quantity)||1)};
async function enter(){ensureDigimonBag();discardLegacyActivities();digimonSelect.value=partnerLine()||'';if(app.entering)return;app.entering=true;app.wanted=true;hub.hidden=false;document.body.classList.add('social-open');syncPokerBadges();syncPokerBounds();if(tabs.includes('map'))openTab('map');if(CLOUD.on&&!app.socket){app.nextConnect=0;connect()}try{if(!app.scene)app.scene=await PGSocialScene.create($id('socialScene'),$id('socialLabels'),{move:moveAction,menu:playerMenu,self:()=>app.room?app.id:SOLO_ID,seat:seatAction,pokerSeat:pokerSeatAction,pokerOpen:tid=>pokerOpen(tid),pond:(x,z,idx)=>FISHING()?.pondClick(x,z,idx),trainStation:startWorldTraining,sanctuaryShop:openSanctuaryShop,sanctuaryIndex:openSanctuaryIndex,trainingNearby:worldNearbyFrame,sitting});if(app.wanted){app.scene.active=true;bindFishing();for(const p of app.players.values())app.scene.putPlayer(p);refreshGymVisuals();app.scene.setBattleState?.(app.battle);renderBattleHUD();renderPvpDialog();join();if(!app.room){syncSoloPlayer();if(P){const snaps=syncSoloPokerSnapshots();if(snaps)for(const s of snaps)s._clientAt=Date.now();}}if(typeof BGM!=='undefined')BGM.sync(typeof S==='object'&&S?S.mp:0)}}catch(e){status('Plaza could not load. Return to the field and try again.');console.error(e)}finally{app.entering=false}}
function leave(){worldNearbyStat='';worldNearby.hidden=true;worldBattleNearby.hidden=true;stopSoloPve('stopped',false);app.battleIntent=null;battleOffer=null;app.battleResult=null;app.battle={pve:[],pvp:null,queue:[]};battleHUD.hidden=true;pvpDialog.hidden=true;renderBattleResult();app.scene?.setBattleState?.(app.battle);if(!sanctuaryPanel.hidden)sanctuaryClose();FISHING()?.hubClosed();if(pokerLeaveAction)finishPokerLeave(false);clearPokerResult();app.wanted=false;app.resume=null;pokerUI.open=false;pokerUI.minimized=false;$id('socialPokerModal').hidden=true;$id('socialPokerMini').hidden=true;if(soloTables){for(const t of soloTables)t.stand(SOLO_ID,Date.now());app.poker=null;app.pokerTables=null;}send({type:'leave'});stashLocal(app.room);app.room=0;app.rooms=[];hub.hidden=true;syncPokerChatFit();syncPokerBounds();document.body.classList.remove('social-open');if(app.scene)app.scene.active=false;resetPlayers();app.messages=app.messages.filter(m=>m.channel!=='local');pokerTableChat.clear();select('world');if(typeof bars==='function'&&typeof S==='object'&&S)bars();if(typeof renderWin==='function'&&typeof S==='object'&&S)renderWin();if(typeof BGM!=='undefined')BGM.sync(typeof S==='object'&&S?S.mp:0)}$id('socialLeave').onclick=()=>{if(fishingBlocked(()=>$id('socialLeave').onclick()))return;confirmPokerLeave(()=>leave())};
const socialHubBtn=$id('socialHubBtn');if(socialHubBtn)socialHubBtn.onclick=()=>enter();syncHubButton();$id('socialSit').onclick=toggleSit;
function receive(m){
 if(m.type==='battle'){battleSnapshot(m);return}
 if(m.type==='battle_fx'){app.scene?.battleEvent?.(m);return}
 if(m.type==='battle_reward'){receiveBattleReward(m);return}
 if(m.type==='battle_result'){receiveBattleResult(m);return}
 if(m.type==='battle_error'){app.battleIntent=null;battleOffer=null;renderPvpDialog();worldNotice(m.message||'DigiPet battle action failed.');return}
 if(m.type==='pve_end'){app.battleIntent=null;worldNotice(m.reason==='defeat'?'Your partner fainted. Feed it and try grinding again.':m.reason==='exhausted'?'Grinding stopped.':m.reason==='complete'?'Field run complete! A very strong partner.':'Grinding stopped.');renderBattleHUD();return}
 if(m.type==='pvp_offer'){battleOffer=m;renderPvpDialog();return}
 if(m.type==='pvp_waiting'){app.battleIntent=null;renderBattleHUD();worldNotice('Waiting for an opponent on the opposite side of the ring…');return}
 if(m.type==='pvp_countdown'){battleOffer=null;if(Number.isFinite(m.serverNow))app.battleOffset=m.serverNow-Date.now();renderPvpDialog();return}
 if(m.type==='pvp_cancelled'){battleOffer=null;app.battleResult=null;pvpDialog.hidden=true;renderBattleResult();worldNotice(m.reason==='disconnect'?'The other trainer disconnected. Match cancelled.':m.reason==='left-ring'?'You left the ring, so the PvP queue was cleared.':'Ring match cancelled.');if(myQueue())app.battle={...app.battle,queue:(app.battle.queue||[]).filter(q=>q.id!==app.id)};renderBattleHUD();return}
 if(m.type==='gym_started'){if(worldTraining?.phase==='pending'&&worldTraining.request===m.request&&worldTraining.room===m.gym?.room&&worldTraining.stat===m.gym?.stat)beginWorldTraining(m.gym.slot);return}
 if(m.type==='gym_error'){if(worldTraining?.phase==='pending'&&worldTraining.request===m.request){worldTraining=null;worldNotice(m.message||'Could not reserve equipment.')}return}
 if(m.type==='gym'&&m.room===app.room){gymEntries=Array.isArray(m.entries)?m.entries:[];refreshGymVisuals();return}
 if(m.type==='hello'){app.connected=true;app.id=m.id;app.retry=0;status('Connected · World & private chat');app.messages=mergeChatMessages(app.messages.filter(x=>x.channel!=='world'),readWorldHistory(),m.history);saveWorldHistory();renderMessages();if(app.wanted&&app.scene)join();else app.resume=null}
 if(m.type==='error'){status(m.message);population();}
 if(m.type==='rooms'&&Array.isArray(m.rooms)){app.rooms=m.rooms;if(Number.isInteger(m.plaza?.friends))app.plazaFriends=m.plaza.friends;population();}
 if(m.type==='poker_error'||m.type==='poker_leave_required'){showPokerToast(m.message,'warn');pokerOpen('table');renderPokerUI(true);}
 if(m.type==='poker_kicked'){
  const me=app.players.get(app.id);if(me){me.pokerSeat=null;me.sit=false;me.path=[];putPlayer(me);}
  showPokerToast(m.message||'Auto-removed from seat due to AFK inactivity.','warn');
  renderPokerMini();renderPokerUI(true);
 }
 if(m.type==='poker_ledger'){
  const id=pokerLedgerIdValid(m.id)?m.id:'';
  applyPokerLedger(m.delta,id);
  // ACK even a duplicate: the wallet already saved it, but the server may still hold the outbox.
  if(id)send({type:'poker_ledger_ack',ids:[id]});
 }
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
 if(m.type==='fishnote'){pushFishNote(m);return}
 if(m.type==='showoff'){
  // v299: our own show-off is already on screen - the echo would draw it a second time.
  if(m.from!==app.id)try{FISHING()?.showOffEvent?.(m.from,{sp:m.sp,w:m.w,mut:m.mut,perfect:m.perfect})}catch{}
  return}
 if(m.type==='reauth')return refreshSocket();
 if(m.type==='room'){if(worldTraining?.room&&m.room&&m.room!==worldTraining.room)cancelWorldTraining('Gym training stopped after changing plazas.');friendPresenceChanged();if(soloTables)for(const t of soloTables)t.stand(SOLO_ID,Date.now());const moved=app.room!==m.room;if(moved){stashLocal(app.room);clearPokerResult();app.poker=null;app.pokerTables=null;pokerUI.renderKey='';}app.room=m.room;if(Array.isArray(m.rooms))app.rooms=m.rooms;resetPlayers();if(moved){app.messages=app.messages.filter(x=>x.channel!=='local');const back=recallLocal(m.room);if(back.length)app.messages=mergeChatMessages(app.messages,back)}pokerTableChat.clear();for(const p of m.players)putPlayer(p);if(app.room)select('local');else syncSoloPlayer();tabsUI();population();if(app.resume&&app.room){const r=app.resume;app.resume=null;if(Number.isInteger(r.pokerSeat)&&!Number.isInteger(app.players.get(app.id)?.pokerSeat))send({type:'poker_sit',seat:r.pokerSeat,buyIn:Math.max(P?.MIN_BUY_IN||40,Math.min(pokerWallet().chips,r.pokerBuyIn||P?.DEFAULT_BUY_IN||1000))});else if(Number.isInteger(r.seat)&&app.players.get(app.id)?.seat!==r.seat)send({type:'seat',id:r.seat});else if(r.sit&&!app.players.get(app.id)?.sit)send({type:'sit',confirmLeave:true})}renderPokerUI(true)} if(m.type==='player'&&m.player.room===app.room){putPlayer(m.player);friendPresenceChanged()}

 if(m.type==='left'&&m.room===app.room){app.players.delete(m.id);app.scene?.removePlayer(m.id);population();friendPresenceChanged()}
 if(m.type==='message'){if(m.channel==='local'&&m.room!==app.room)return;app.messages=mergeChatMessages(app.messages,[m]);if(m.channel==='world')saveWorldHistory();else if(m.channel==='local')stashLocal();if(app.channel!==m.channel||chat.classList.contains('minimized'))app.unread.add(m.channel);if(!app.muted.has(m.from)){if(m.channel==='local'){const fishShown=FISHING()?.onLocalMessage?.(m.from,m.body||'');if(!fishShown)app.scene?.bubble(m.from,m);pokerTableChatBubble(m)}if(app.channel===m.channel)renderMessages(true)}tabsUI()}}
// v295: the watchdog used to allow 20 s of silence plus a 6 s probe grace - longer than the
// server's old 15 s resume window, so a silent drop always came back as a fresh join at the
// plaza spawn. Detection is now 10 s + 5 s, comfortably inside the resume window, and
// visibilitychange probes the moment a throttled background tab wakes up.
const WATCHDOG_MS=10000,PROBE_GRACE_MS=5000,HANDSHAKE_MS=12000;
function seatState(){const me=app.players.get(app.id);const seated=seatedPokerSnapshot();return me?{seat:Number.isInteger(me.seat)?me.seat:null,pokerSeat:Number.isInteger(me.pokerSeat)?me.pokerSeat:null,pokerBuyIn:seated?.me?.stack||pokerUI.buyIn,sit:!!me.sit}:app.resume}
function dropSocket(message,keep){const ws=app.socket;stashLocal(app.room);app.socket=null;app.connected=false;app.battleIntent=null;app.probeAt=0;if(keep)app.resume=seatState(); // v311 (owner: "the hero jumps around on reconnect"): a dropped socket used to leave the local
 // character walking a route the room no longer knew about, and the room then restored its own
 // copy - two different heroes, one of them moving on its own. Stop the walk where it stands and
 // let the resumed spot take over.
 const me=app.players.get(app.room?app.id:SOLO_ID);
 if(me&&me.path&&me.path.length){try{R.advance(me,performance.now())}catch{}me.path=[];me.sit=false;putPlayer(me)}
 try{ws?.close()}catch{}status(message);app.nextConnect=0}
function refreshSocket(){dropSocket('Refreshing chat…',true)}
function heartbeat(now){if(!app.connected||!app.socket||app.socket.readyState!==1){app.probeAt=0;return}
 if(now-(app.lastSeen||now)<WATCHDOG_MS){app.probeAt=0;return}
 if(!app.probeAt){app.probeAt=now;send({type:'ping'});return}
 if(now-app.probeAt>PROBE_GRACE_MS)dropSocket('Chat connection lost — reconnecting…',true)}
function sitting(sit){$id('socialSit').textContent=sit?'Stand':'Sit';$id('socialSit').setAttribute('aria-pressed',String(sit))}
function putPlayer(p){p.at=performance.now();app.players.set(p.id,p);app.scene?.putPlayer(p);
 // v295: every OTHER player's line in the water is drawn. Your own rig is driven frame by frame
 // from assets/social-fishing.js, so it is deliberately skipped here or it would draw twice.
 const selfId=app.room?app.id:SOLO_ID;
 if(p.id!==selfId&&app.scene?.fishing&&typeof app.scene.fishing.setRig==='function')try{app.scene.fishing.setRig(p.id,p.fish||{on:false})}catch{}
 if(p.id===selfId)sitting(p.sit);population()}
// v319: the field HUD Social Hub button (third seat in #minimapTools). The count is the server's
// total across every Plaza room; while standing in a plaza the friend count is read from the
// live player list, on the field it rides the personalised `plaza.friends` figure. The badge
// only exists while the chat socket is connected - an offline copy never invents a number.
function syncHubButton(){
 const btn=$id('socialHubBtn'),badge=$id('socialHubBadge');if(!btn||!badge)return;
 const known=!!CLOUD.on&&app.connected;
 const rooms=(Array.isArray(app.rooms)?app.rooms:[]).filter(r=>r&&r.count>0);
 let total=rooms.reduce((n,r)=>n+(r.count||0),0);
 if(app.room&&!rooms.length)total=app.players.size;
 let friends=app.plazaFriends||0;
 if(app.room){friends=0;for(const p of app.players.values())if(p.id!==app.id&&p.friend)friends++}
 badge.hidden=!known;
 badge.textContent=total>99?'99+':String(total);
 btn.classList.toggle('is-live',known&&total>0);
 btn.classList.toggle('is-empty',known&&total===0);
 btn.classList.toggle('has-friends',known&&friends>0);
 btn.setAttribute('aria-label',!CLOUD.on?'Social Hub, Fountain Plaza. Solo plaza on this copy. Enter plaza':known?'Social Hub, Fountain Plaza — '+total+(total===1?' adventurer':' adventurers')+' inside'+(friends?', '+friends+(friends===1?' friend':' friends')+' inside':'')+'. Enter plaza':'Social Hub, Fountain Plaza. Enter plaza');
 btn.title=known&&total?'⛲ Fountain Plaza — '+total+' inside'+(rooms.length?' ('+rooms.map(r=>'Plaza '+r.id+': '+r.count).join(' · ')+')':'')+(friends?' · '+friends+' friend'+(friends===1?'':'s')+' inside':'')+' — click to enter':'⛲ Fountain Plaza — Social Hub (fishing, poker, promenade) — click to enter';
}
function population(){
 syncHubButton();
 $id('socialPopulation').textContent=app.room?'P'+app.room+' · '+app.players.size+'/20':CLOUD.on?'Linking…':'Solo';$id('socialPopulation').title=app.room?'Plaza '+app.room+' · '+app.players.size+' / 20 adventurers':CLOUD.on?'Connecting to plaza · Solo view':'Solo plaza · Local character';
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
// v313: one place decides how long to wait before the next attempt, so a socket that opens but never
// completes the handshake backs off exactly like a socket that closed.
function retryDelay(){return Math.min(30000,1000*2**Math.min(app.retry++,5))}
function connect(){if(!CLOUD.on||!CLOUD.user||app.blocked||Date.now()<app.nextConnect)return;const user=typeof CLOUD.user==='string'?CLOUD.user:CLOUD.user.username;if(app.user!==user){app.user=user;localHistory.clear();app.messages=readWorldHistory();renderMessages();app.unread.clear();try{app.muted=new Set(JSON.parse(localStorage.getItem('pg_social_mute_'+user))||[])}catch{app.muted=new Set()}}
 const qs=CLOUD.previewToken?'?preview_session='+encodeURIComponent(CLOUD.previewToken):'';
 const ws=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/api/social'+qs);app.socket=ws;app.socketAt=Date.now();status('Connecting to chat…');ws.onmessage=e=>{if(app.socket!==ws)return;app.lastSeen=Date.now();app.probeAt=0;try{receive(JSON.parse(e.data))}catch(err){console.error('Social message',err)}};
 ws.onclose=e=>{if(app.socket!==ws)return;if(worldTraining?.room)cancelWorldTraining('Gym training stopped after disconnection.');app.socket=null;app.connected=false;app.battleIntent=null;app.probeAt=0;
  // Logged on purpose: "why did it reconnect" is the question the plaza keeps being asked, and the
  // browser console is the only place that can answer it (1000/1006 = network or edge, 4000 = the
  // server's planned session refresh, 4001 = the same account signed in somewhere else).
  if(e.code!==4000)console.info('[plaza] chat socket closed',e.code,e.reason||'');
  if(e.code===4000){stashLocal(app.room);app.resume=seatState();app.nextConnect=0;status('Refreshing chat…');return}
  // v295: a silent drop or a network blip reserves the same thing a planned refresh does, so the
  // reconnect resumes the seat/room instead of spawning at the plaza entrance. Read it BEFORE
  // resetPlayers() wipes the map it comes from.
  if(e.code!==4001)app.resume=seatState();
  stashLocal();clearPokerResult();app.room=0;app.rooms=[];app.plazaFriends=0;app.poker=null;app.pokerTables=null;pokerTableChat.clear();resetPlayers();syncSoloPlayer();population();tabsUI();renderPokerMini();renderPokerUI(true);status(e.code===4001?'Chat moved to another tab. Reload to reconnect.':'Chat unavailable — retrying…');app.blocked=e.code===4001;app.nextConnect=Date.now()+retryDelay()};ws.onerror=()=>status('Chat unavailable — checking connection…');}
let lastLog='',lastLook='',keepAliveAt=0;setInterval(()=>{if(app.channel==='log'&&feedHidden())syncDisplay();const account=typeof CLOUD.user==='string'?CLOUD.user:CLOUD.user?.username;if(app.user&&account&&account!==app.user){const ws=app.socket;app.socket=null;ws?.close();app.connected=false;app.messages=[];localHistory.clear();app.unread.clear();app.friends.clear();app.blocked=false;app.nextConnect=0;leave();app.user=null}if(!CLOUD.on){if(app.user||app.socket){const ws=app.socket;app.socket=null;ws?.close();app.connected=false;app.messages=[];localHistory.clear();app.unread.clear();app.muted.clear();app.friends.clear();app.blocked=false;app.nextConnect=0;app.user=null;leave()}else if(app.wanted&&app.scene){const look=JSON.stringify(currentLook());if(look!==lastLook){syncSoloPlayer();lastLook=look}}status('Sign in to use player chat');return}if(!app.socket)connect();
 // v313: a socket can open against a cold Durable Object and then sit there - Pages accepted the
 // upgrade, the room has not said hello. Nothing used to notice: the plaza showed "Connecting to
 // chat…" forever with a healthy-looking socket and no reconnect. A handshake that takes longer than
 // this is treated as a failed attempt, with the same backoff a close gets.
 else if(!app.connected&&Date.now()-(app.socketAt||0)>HANDSHAKE_MS){dropSocket('Chat took too long to answer — retrying…',true);app.nextConnect=Date.now()+retryDelay()}
 heartbeat(Date.now());
 // v295: fishing holds two minutes or more without a single movement packet. A light ping keeps
 // the socket warm through proxies and NAT so an AFK session never looks dead.
 if(app.connected&&app.socket&&app.socket.readyState===1&&(fishingBusy()||worldTraining)&&Date.now()>=keepAliveAt){keepAliveAt=Date.now()+45000;send({type:'ping'})}if(app.channel==='log'){const key=JSON.stringify(logShown().map(l=>l.id));if(key!==lastLog){lastLog=key;renderMessages(true)}}const look=JSON.stringify(currentLook());if(app.room&&lastLook&&look!==lastLook)send({type:'look',look:currentLook()});else if(!app.room&&app.wanted&&app.scene&&lastLook&&look!==lastLook)syncSoloPlayer();lastLook=look},2000);
// v295: browsers throttle timers in a hidden tab, so an AFK player can sit behind a dead socket
// well past the watchdog. Coming back to the tab checks it at once instead of waiting a cycle.
document.addEventListener('visibilitychange',()=>{
 if(document.hidden)return;
 if(!app.socket){if(app.wanted&&CLOUD.on){app.nextConnect=0;connect()}return}
 // v313 (owner: "random reconnects"). Returning to the tab used to drop the socket on the spot
 // whenever it had been quiet for ten seconds - so every tab switch longer than that forced a
 // reconnect, and a reconnect that was not needed is exactly what the plaza was reporting. The
 // socket is now asked first: one probe, five seconds to answer, and only silence past that drops it.
 if(app.connected&&app.socket.readyState===1&&Date.now()-(app.lastSeen||0)>=WATCHDOG_MS)heartbeat(Date.now());
});
// v326: the network coming back is not the tab coming back. A socket that died while the connection
// was down was retried on the retryDelay() ladder - up to 30 s - so chat could sit dark for half a
// minute after the wifi returned, which reads as another "random disconnect". Ask at once instead.
window.addEventListener('online',()=>{
 if(!CLOUD.on||app.blocked)return;
 app.nextConnect=0;app.retry=0;
 if(app.socket&&app.socket.readyState>1)dropSocket('Chat reconnecting…',true);
 if(!app.socket)connect();
});
// And say what is actually happening rather than "retrying…" at a connection that is not there.
window.addEventListener('offline',()=>{
 if(app.socket||app.wanted)status('Chat offline — it reconnects when the network returns.');
});
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
