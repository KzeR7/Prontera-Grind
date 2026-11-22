/* Real-time chat, Fountain Plaza scene and multiplayer 2-table Plaza Hold'em. Never changes farming combat. */
(function(){
'use strict';
// v323: a bad merge once shipped index.html with this script loaded twice. Two boots mean
// two sockets, and the room kicks the first with 4001 ("another tab") - world chat looked
// moved to another tab in a single tab. Boot once, ever.
if(window.__pgSocialBooted)return;window.__pgSocialBooted=true;
const R=PGSocialRules,P=globalThis.PGSocialPoker||null,$id=id=>document.getElementById(id);
const app={socket:null,user:null,id:null,room:0,rooms:[],plazaFriends:0,wanted:false,party:null,partyRoster:[],partyInvite:null,partyTab:'pve',channel:'world',messages:[],unread:new Set(),muted:new Set(),friends:new Set(),players:new Map(),retry:0,connected:false,nextConnect:0,blocked:false,scene:null,owner:null,nextChat:0,lastSeen:0,probeAt:0,resume:null,poker:null,pokerTables:null,battle:{pve:[],pvp:null,queue:[]},battleOffset:0,battleRewards:new Set(),battleResult:null,battleIntent:null,rulesNoticed:false};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// The dice is six files behind one id: dice.png is face 1 and dice2..dice6 the rest. Every other
// emotion is a single file, so a face only changes the path when one was actually rolled.
const emojiURL=R.emotionURL;   // shared with social-scene.js, so the dice's six-file rule lives in one place
// v374 (owner: "make all the emotions the same size in the emoji tab"): every emote sits in a fixed square slot and is
// scaled so its painted area fills the same visual size (EMOTE_LAYOUT). Small art is drawn pixelated, not smoothed.
// Typed command -> emote id. RO names win; an id only works when it has no RO name (so /ok is no longer the Thanks art).
function emoteFromCommand(cmd){const c=String(cmd||'').toLowerCase();if(R.EMOTE_BY_CMD?.[c])return R.EMOTE_BY_CMD[c];if(R.EMOTIONS.includes(c)&&!R.EMOTE_NAMES?.[c])return c;return null}
const emoteLabel=id=>'/'+(R.EMOTE_NAMES?.[id]||id);
// PR #269 added 14 emotions whose art is not generated yet. Until the PNG exists the label is
// shown in place of the art - never a substitute picture, and never a broken-image glyph.
const emojiAlt=id=>String(R.EMOTE_NAMES?.[id]||id);
function emoteSlot(id,box,face){const slot=document.createElement('span');slot.className='emote-slot';slot.style.width=slot.style.height=box+'px';const im=document.createElement('img');im.src=emojiURL(id,face);im.alt=emojiAlt(id);im.decoding='async';im.onerror=()=>{if(slot.dataset.noart)return;slot.dataset.noart='1';slot.textContent=emojiAlt(id);slot.classList.add('emote-slot-noart')};const L=R.EMOTE_LAYOUT?.[id];if(L){im.style.width=(L.w*L.s)+'px';im.style.height=(L.h*L.s)+'px';im.style.left=(box/2-L.cx*L.s)+'px';im.style.top=(box/2-L.cy*L.s)+'px'}slot.append(im);return slot}
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
 return {type:'message',id:typeof m.id==='number'||typeof m.id==='string'?m.id:'',at:m.at,from:m.from,name:m.name.slice(0,32),gm:m.gm===true,channel:m.channel,body:m.body,...(m.channel==='local'&&m.sys===true?{sys:true}:{}),room:Number.isInteger(m.room)?m.room:0,...(m.emotion?{emotion:m.emotion}:{}),...(m.emotion==='dice'&&Number.isInteger(m.face)&&m.face>=1&&m.face<=6?{face:m.face}:{}),...(Number.isInteger(m.to)?{to:m.to}:{}),...(typeof m.toName==='string'?{toName:m.toName.slice(0,32)}:{})};
}
function mergeChatMessages(...lists){
 const unique=new Map();
 for(const list of lists)if(Array.isArray(list))for(const raw of list){const m=cleanChatMessage(raw);if(!m)continue;const key=[m.channel,m.room,m.from,m.at,m.id,m.emotion||m.body,m.face||''].join(':');unique.set(key,m)}
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
const hub=document.createElement('section');hub.id='socialHub';hub.hidden=true;hub.setAttribute('aria-label','Prontera Fountain Plaza');hub.innerHTML='<div id="socialScene"></div><div id="socialLabels"></div><div id="socialHubToolbar"><header id="socialHubHeader"><div class="social-hub-title-row"><h2>Prontera</h2><select id="socialRoomSelect" aria-label="Switch plaza room" title="Switch Plaza server room" hidden></select></div><p id="socialPopulation">Joining Prontera…</p></header><div id="socialHubControls"><button id="socialPokerBtn" type="button" title="Open Prontera Hold\'em"><span id="socialPokerBtnText">🃏 Hold\'em</span><i id="socialPokerDot" hidden></i></button><button id="socialFishBtn" type="button" title="Fish at the South Lawn ponds — cast, reel and fill your Fishing Bag" aria-pressed="false">🎣 Fishing</button><button id="sanctuaryOpen" type="button" aria-haspopup="dialog" aria-controls="sanctuaryPanel">🥚 DigiPet</button><label class="social-digimon-label" hidden>Digimon <select id="socialDigimon" aria-label="Choose an owned Digimon companion" title="Choose from your owned DigiPet collection"><option value="">None</option></select></label><button id="socialPartyBtn" type="button" title="Party - form a grind party or join the PvP ring lobby" aria-haspopup="dialog" aria-controls="socialPartyPanel">👥 Party</button><button id="socialAdventureGuide" type="button" data-adventure="handbook">✦ Guide</button><button id="socialLeave">↩ Field</button></div></div><div id="socialBgmMount" hidden aria-label="Plaza music player"></div><button id="socialMiniMap" type="button" title="Open the plaza map" aria-label="Open the plaza map"><canvas id="socialMiniMapCanvas" width="150" height="150"></canvas></button><section id="socialPartyPanel" role="dialog" aria-label="Grind party and PvP lobby" hidden><header class="social-party-head"><strong>👥 Party</strong><button id="socialPartyClose" type="button" title="Close the party panel" aria-label="Close the party panel">✕</button></header><div id="socialPartyBody"></div></section><section id="socialMapModal" role="dialog" aria-label="Plaza map" hidden><header class="social-map-head"><strong>🗺 Prontera Map</strong><button id="socialMapClose" type="button" title="Close the map" aria-label="Close the map">✕</button></header><canvas id="socialMapCanvas" width="640" height="640"></canvas><footer class="social-map-legend"><span><i class="map-dot dot-self"></i>You</span><span><i class="map-dot dot-friend"></i>Friends</span><span><i class="map-dot dot-player"></i>Players</span><span><i class="map-dot dot-fish"></i>Fishing</span><span><i class="map-dot dot-battle"></i>DigiPet battle</span><span><i class="map-chip chip-farm"></i>DigiPet farm</span><span><i class="map-chip chip-gym"></i>Gym</span><span><i class="map-chip chip-ring"></i>PvP ring</span><span><i class="map-chip chip-poker"></i>Poker</span><span><i class="map-chip chip-lake"></i>West Lake</span></footer></section><button id="socialSit" type="button" title="Sit or stand (Insert)" aria-label="Sit or stand">Sit</button><button id="socialPokerMini" type="button" hidden></button><section id="socialPokerModal" role="dialog" aria-label="Prontera Hold\'em" hidden><header id="socialPokerHead"><div class="poker-head-title"><strong id="socialPokerHeadTitle">🃏 Prontera Hold\'em · Table 1</strong><small id="socialPokerRoomSub">Dealer Vane · Blinds 10 / 20 · AFK Kick 2×</small></div><div class="poker-head-right"><span id="socialPokerWalletPill" class="poker-wallet-pill"><i class="fishcoin" aria-hidden="true"></i> 1,000 Chips</span><button id="socialPokerMinBtn" type="button" title="Minimize table (shows live timer &amp; turn alert)" aria-label="Minimize poker table">—</button><button id="socialPokerCloseBtn" type="button" title="Close poker window" aria-label="Close poker window">✕</button></div></header><nav id="socialPokerNav" role="tablist" aria-label="Poker sections"><button type="button" role="tab" data-ptab="t0" aria-selected="true">♠ Table 1 <small id="pokerTabCount0">0/6</small></button><button type="button" role="tab" data-ptab="t1" aria-selected="false">♠ Table 2 <small id="pokerTabCount1">0/6</small></button><button type="button" role="tab" data-ptab="bank" aria-selected="false"><i class="fishcoin" aria-hidden="true"></i> Chip Bank <i id="pokerBankFreeDot" hidden>!</i></button><button type="button" role="tab" data-ptab="gifts" aria-selected="false" aria-disabled="true" class="is-locked" title="Locked — rewards coming in a later update">🔒 Gift Exchange <small>Later</small></button><span id="socialPokerToast" hidden role="status" aria-live="polite"></span></nav><div id="socialPokerBody"></div><div id="socialPokerResult" hidden aria-live="polite"></div></section>';$id('view').append(hub);
// A separate DigiPet window; no existing field-pet state is changed here.
const sanctuaryPanel=document.createElement('section');sanctuaryPanel.id='sanctuaryPanel';sanctuaryPanel.hidden=true;sanctuaryPanel.setAttribute('role','dialog');sanctuaryPanel.setAttribute('aria-labelledby','sanctuaryTitle');
sanctuaryPanel.innerHTML=`<header class="sanctuary-head"><div><small>FOUNTAIN PLAZA · COMPANION CARE</small><h2 id="sanctuaryTitle"><span class="digipet-logo" aria-hidden="true"><svg viewBox="0 0 40 40" focusable="false"><defs><linearGradient id="digipetEggGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3bd"/><stop offset=".55" stop-color="#e5c76f"/><stop offset="1" stop-color="#9dbb86"/></linearGradient></defs><path d="M20 3C12 3 5 16 5 24c0 8 6 13 15 13s15-5 15-13C35 16 28 3 20 3Z" fill="url(#digipetEggGradient)" stroke="#fff4cf" stroke-width="1.4"/><path d="m7 25 5-4 5 5 5-5 5 5 5-4" fill="none" stroke="#38564a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 12c2-3 4-4 6-4" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="2" stroke-linecap="round"/><path d="m31 6 .8 2.2L34 9l-2.2.8L31 12l-.8-2.2L28 9l2.2-.8Z" fill="#fff3bd"/></svg></span><span>DigiPet</span></h2><p>Companion link · hatch, care and evolve your partners.</p></div><div class="sanctuary-head-actions"><span class="sanctuary-wallet" title="Pet Coins (petgold) are separate from Zeny and Cash Shop currency">◈ <b id="sanctuaryCoins">0</b> Pet Coins · ✦ <b id="sanctuaryEvo">0</b> EP · 🥚 <b id="sanctuaryEggs">0</b></span><button id="sanctuaryClose" type="button" aria-label="Close DigiPet">×</button></div></header>
 <div class="sanctuary-content"><div class="sanctuary-intro"><div><span class="sanctuary-kicker">YOUR COMPANION</span><h3>Your DigiPet</h3><p>Four partner slots, each with independent progress. Only one partner can train at a time, and a training partner cannot battle.</p></div><span class="sanctuary-badge">DIGIPET</span></div>
 <nav class="sanctuary-nav" aria-label="DigiPet sections"><button type="button" data-sanctuary-view="partners" aria-pressed="true">Partners</button><button type="button" data-sanctuary-view="index" aria-pressed="false">DigiDex</button><button type="button" data-sanctuary-view="bag" aria-pressed="false">Pet Bag</button><button type="button" data-sanctuary-view="evolution" aria-pressed="false">Evolution</button><button type="button" data-sanctuary-view="mastery" aria-pressed="false">Mastery</button><button type="button" data-sanctuary-view="titles" aria-pressed="false">Titles</button><span class="sanctuary-nav-note" aria-hidden="true">04 partner slots</span></nav>
 <div id="sanctuaryPartnersView">
 <section class="sanctuary-section sanctuary-partners-section"><div class="sanctuary-section-head"><div><small>YOUR PARTNERS</small><h3>Four slots, one active</h3></div><span class="sanctuary-level">Care, train and grind them in parallel</span></div><div class="sanctuary-partner-grid" id="sanctuaryPartnerGrid" role="group" aria-label="Companion slots"></div><p class="sanctuary-collection-note">Tap a slot to make it active, then pick its species from an owned card in the DigiDex. Empty slots are filled first when you hatch an egg.</p></section>
 <div id="sanctuaryGameplay"></div>
 <div class="sanctuary-selection"><span id="sanctuaryActive" role="status">No companion selected</span><small class="sanctuary-field-note">• Field farming continues</small><button type="button" id="sanctuaryDismiss">Dismiss companion</button></div></div>
 <div id="sanctuaryIndexView" hidden><section class="sanctuary-section sanctuary-index"><div class="sanctuary-section-head"><div><small>FIELD GUIDE · ALL FORMS</small><h3>DigiDex &amp; evolution branches</h3></div><span class="sanctuary-level">Attainable forms only</span></div><p>“Evolves to” lists every supported direct branch — the branch you get is rolled when you evolve. Only forms attainable from Baby eggs through direct evolution are listed; owned cards can assign the species to your active partner slot.</p><p class="digidex-stat-note">Base stats are per-form at Lv.1, untrained: HP/ATK/DEF shift the battle formula, SPD sets swing style — fast forms strike reliably, heavy forms swing harder or graze. Owned forms add your level, training and mastery layer.</p><div class="sanctuary-index-tools"><label>Search DigiDex<input id="sanctuaryIndexSearch" type="search" placeholder="Digimon name or ID…" autocomplete="off"></label><label>Stage<select id="sanctuaryIndexStage"><option value="">All stages</option></select></label><label class="sanctuary-index-owned"><input id="sanctuaryIndexOwned" type="checkbox"> Owned only</label><button type="button" id="sanctuaryIndexBranchClear" hidden>✕ Clear branch view</button></div><div class="sanctuary-roster-status"><span id="sanctuaryIndexStatus" role="status"></span><span>Incoming + outgoing routes</span></div><div id="sanctuaryIndexList" class="sanctuary-index-list"></div><nav class="sanctuary-pager" aria-label="DigiDex pages"><button type="button" id="sanctuaryIndexPrev">← Previous</button><span id="sanctuaryIndexPage">Page 1</span><button type="button" id="sanctuaryIndexNext">Next →</button></nav></section></div>
 <div id="sanctuaryBagView" hidden></div><div id="sanctuaryEvolutionView" hidden></div><div id="sanctuaryMasteryView" hidden></div><div id="sanctuaryTitlesView" hidden></div>
 <p id="sanctuaryMessage" class="sanctuary-message" role="status" aria-live="polite"></p></div>`;
$id('view').append(sanctuaryPanel);
// Afterdark: keep the existing game windows and actions available inside the hub.
const moreButton=document.createElement('button');moreButton.id='socialMore';moreButton.type='button';moreButton.textContent='More ···';moreButton.setAttribute('aria-expanded','false');moreButton.setAttribute('aria-controls','socialMorePanel');
hub.querySelector('#socialLeave').before(moreButton);
const raidHubButton=document.createElement('button');raidHubButton.id='socialRaidBtn';raidHubButton.type='button';raidHubButton.title='Astral Raid — Solo or 2–3 player Party Raid';raidHubButton.textContent='☠ Raid';
raidHubButton.onclick=()=>{if(globalThis.PGRaid)globalThis.PGRaid.showLobby()};
hub.querySelector('#socialPartyBtn').after(raidHubButton);
// Reuse bundled artwork in the compact controls; the original labels stay intact.
/* v381 (owner: "poker icon is not similar"): the Hold'em button joins the painted-art set with a
   small SVG card fan (white card over the accent card, crimson spade) instead of the raw emoji. */
const POKER_ART_SVG='<svg class="ad-toolbar-art" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="8" y="2.6" width="11.4" height="16.4" rx="1.8" transform="rotate(9 13.7 10.8)" fill="#4d5b74" stroke="#141a20" stroke-width="1.3"/><rect x="4" y="3.6" width="11.4" height="16.4" rx="1.8" transform="rotate(-8 9.7 11.8)" fill="#f2f5f9" stroke="#141a20" stroke-width="1.3"/><path d="M9.9 8.6c-1.6 2-2.7 3.1-2.7 4.4a2 2 0 0 0 2 2c.8 0 1.5-.35 1.9-.9.4.55 1.1.9 1.9.9a2 2 0 0 0 2-2c0-1.3-1.1-2.4-2.7-4.4l-.65-.8-.65.8Z" fill="#c23b52"/><rect x="8.4" y="16.4" width="3.4" height="1.5" rx=".75" fill="#c23b52"/></svg>';
const PARTY_ART_SVG='<svg class="ad-toolbar-art" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="8.2" cy="8" r="3.1" fill="#f2f5f9" stroke="#141a20" stroke-width="1.3"/><circle cx="15.8" cy="8.4" r="2.6" fill="#cfd8e6" stroke="#141a20" stroke-width="1.3"/><path d="M3.4 19.2c.4-3.4 2.6-5.2 4.8-5.2s4.4 1.8 4.8 5.2" fill="#4d5b74" stroke="#141a20" stroke-width="1.3"/><path d="M12.6 18.6c.5-2.6 2.2-4 3.6-4 1.6 0 3.2 1.5 3.6 4" fill="#3d4a60" stroke="#141a20" stroke-width="1.2"/></svg>';
const MORE_ART_SVG='<svg class="ad-toolbar-art" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.4" y="3.4" width="7.2" height="7.2" rx="1.6" fill="#f2f5f9" stroke="#141a20" stroke-width="1.3"/><rect x="13.4" y="3.4" width="7.2" height="7.2" rx="1.6" fill="#c23b52" stroke="#141a20" stroke-width="1.3"/><rect x="3.4" y="13.4" width="7.2" height="7.2" rx="1.6" fill="#4d5b74" stroke="#141a20" stroke-width="1.3"/><rect x="13.4" y="13.4" width="7.2" height="7.2" rx="1.6" fill="#d4b26a" stroke="#141a20" stroke-width="1.3"/></svg>';
const FIELD_ART_SVG='<svg class="ad-toolbar-art" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 19.4V8.6L12 3.8l8 4.8v10.8Z" fill="#4d5b74" stroke="#141a20" stroke-width="1.3"/><path d="M9.2 19.2v-6.4h5.6v6.4" fill="#f2f5f9" stroke="#141a20" stroke-width="1.2"/><circle cx="12" cy="10.2" r="1.5" fill="#c23b52"/></svg>';
for(const [id,icon,label] of [['socialPokerBtn','🃏',null],['socialFishBtn','🎣','Fishing'],['sanctuaryOpen','🥚','DigiPet'],['socialPartyBtn','👥','Party']]){
 const button=hub.querySelector('#'+id);
 if(id==='socialPokerBtn')button.innerHTML='<span class="ad-legacy-icon" aria-hidden="true">'+icon+' </span>'+POKER_ART_SVG+'<span id="socialPokerBtnText">Hold\'em</span><i id="socialPokerDot" hidden></i>';
 else if(id==='socialPartyBtn')button.innerHTML='<span class="ad-legacy-icon" aria-hidden="true">'+icon+' </span>'+PARTY_ART_SVG+label;
 else button.innerHTML='<span class="ad-legacy-icon" aria-hidden="true">'+icon+' </span>'+(id==='socialFishBtn'?'<img class="ad-toolbar-art" src="assets/social/fish/bass.png" alt="">':id==='sanctuaryOpen'?'<span class="ad-toolbar-partner" aria-hidden="true"></span>':'')+label;
}
moreButton.innerHTML='<span class="ad-legacy-icon" aria-hidden="true">··· </span>'+MORE_ART_SVG+'More';
hub.querySelector('#socialLeave').innerHTML='<span class="ad-legacy-icon" aria-hidden="true">↩ </span>'+FIELD_ART_SVG+'Field';

const morePanel=document.createElement('section');morePanel.id='socialMorePanel';morePanel.hidden=true;morePanel.setAttribute('aria-label','Hub and field tools');hub.append(morePanel);
const fieldMonitor=document.createElement('section');fieldMonitor.id='socialFieldMonitor';fieldMonitor.setAttribute('aria-label','Background field activity');fieldMonitor.innerHTML='<span id="socialFieldState">Field not started</span><span><b id="socialFieldExp">—</b><small>EXP/min</small></span><span><b id="socialFieldZeny">—</b><small>Zeny/min</small></span><span id="socialFieldLoot" class="social-field-loot"></span>';hub.append(fieldMonitor);
/* v384 (owner screenshot: the MVP alert sat on top of the battle card): every top-centre notice
   lives in ONE column - the MVP alert, the running-activities shortcut, the battle card, plaza
   notices and the gym / field / ring prompts. Each of them used to claim its own absolute spot at
   the same height, so two that were up together overlapped. Their order is set in social.css. */
const hudStack=document.createElement('div');hudStack.id='socialHudStack';hub.append(hudStack);
const activityStatus=document.createElement('button');activityStatus.id='socialActivityStatus';activityStatus.type='button';activityStatus.hidden=true;activityStatus.title='Open running DigiPet activities';hudStack.append(activityStatus);
activityStatus.onclick=()=>{focusHubPanel('activity');openActivityPanel(worldTraining?'training':myPve()?'pve':'party');syncFieldMonitor()};
const hubToolbar=hub.querySelector('#socialHubToolbar');
function measureHubToolbar(){if(hub.hidden)return;const height=hubToolbar.getBoundingClientRect().bottom-hub.getBoundingClientRect().top;if(height>0)$id('view').style.setProperty('--socialhub-top',Math.ceil(height)+'px')}
if(typeof ResizeObserver!=='undefined')new ResizeObserver(measureHubToolbar).observe(hubToolbar);
addEventListener('resize',measureHubToolbar);
function closeHubMore(){morePanel.hidden=true;moreButton.setAttribute('aria-expanded','false')}
function focusHubPanel(kind){
 if(hub.hidden)return;
 if(kind!=='pet'&&!sanctuaryPanel.hidden){sanctuaryPanel.hidden=true;sanctuaryFrame++}
 if(kind!=='party')$id('socialPartyPanel').hidden=true;
 if(kind!=='map')$id('socialMapModal').hidden=true;
 if(kind!=='more')closeHubMore();
 if(kind!=='poker'&&!$id('socialPokerModal').hidden)minimizePokerModal();
 if(kind!=='fishing'){for(const id of ['fishingPanel','fishingMenu']){const el=$id(id);if(el)el.hidden=true}}
 if(kind!=='field'&&typeof tabs!=='undefined'&&tabs.length){tabs.length=0;expandedPanels.clear();renderWin()}
}
moreButton.onclick=()=>{
 if(!morePanel.hidden){closeHubMore();return}focusHubPanel('more');
 morePanel.innerHTML='<header><strong>More</strong><button type="button" data-hub-close aria-label="Close More">×</button></header><small>FIELD CHARACTER</small><div class="social-more-grid"><button type="button" data-hub-tab="equip">Equipment</button><button type="button" data-hub-tab="equip" data-hub-sub="refine">Refine</button></div><small>ALL DESTINATIONS</small><div class="social-more-grid">'+Object.entries(TABS).filter(([k])=>k!=='equip'&&(k!=='gm'||S?.gm)).map(([k,v])=>'<button type="button" data-hub-tab="'+escape(k)+'">'+escape(v[1])+'</button>').join('')+'</div>';
 morePanel.hidden=false;moreButton.setAttribute('aria-expanded','true');morePanel.querySelector('button').focus();
};
morePanel.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-hub-close')){closeHubMore();moreButton.focus();return}const key=b.dataset.hubTab;if(!key||!TABS[key])return;focusHubPanel('field');if(!tabs.includes(key))openTab(key);if(b.dataset.hubSub){sub[key]=b.dataset.hubSub;renderWin()}};
morePanel.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();closeHubMore();moreButton.focus()}};
// Rates come from the field's existing rolling HUD sampler, never a second accumulator.
function syncFieldMonitor(){
 if(hub.hidden)return;
 const ready=typeof S==='object'&&S&&typeof currentUser!=='undefined'&&currentUser;
 const plazaAfk=typeof plazaFarmIncome==='function'&&!!plazaFarmIncome();
 fieldMonitor.title=plazaAfk?'Earning from your last measured field minute.':'No saved farming rate? Enter Field and farm the same stage for one minute, then return to the plaza.';
 const waiting=typeof hubFirstPending!=='undefined'&&hubFirstPending&&typeof respawn==='number'&&respawn>1e6&&!plazaAfk;
 // v392: a LOST connection no longer pauses the plaza's earnings - only the server refusing writes
 // (gate/paused) does. `awaiting` is the state the player asked to see stated plainly.
 const gatePaused=typeof CLOUD!=='undefined'&&(CLOUD.paused||CLOUD.gate);
 const awaiting=typeof CLOUD!=='undefined'&&!!CLOUD.lost&&!gatePaused;
 const paused=gatePaused||(awaiting&&!plazaAfk);
 const trial=(typeof TRIAL!=='undefined'&&TRIAL.on)||(typeof JOB_RITE!=='undefined'&&JOB_RITE.on);
 const live=!!ready&&!paused&&!trial&&(plazaAfk||!waiting);
 const managing=['sanctuaryPanel','socialPartyPanel','socialMapModal','socialMorePanel','fishingPanel','socialPokerModal'].some(id=>{const el=$id(id);return el&&!el.hidden})||(typeof tabs!=='undefined'&&tabs.length>0);
 hub.classList.toggle('has-management',!!managing);
 const activities=[];
 if(worldTraining)activities.push('P'+(worldTraining.slot+1)+' · '+sanctuaryName(worldTraining.stat)+' '+(worldTraining.phase==='active'?gymClock(PGDigimonSanctuary.DURATION-(worldTraining.elapsed||0)):'joining'));
 if(myPve())activities.push('PvE grinding');if(myPvp())activities.push('Ring battle');
 activityStatus.hidden=!managing||!activities.length;activityStatus.textContent=activities.join(' · ')+' ↗';
 fieldMonitor.dataset.live=String(live);
 // The player's own words for this state: "awaiting connection". It replaces "Field paused" when the
 // plaza is still earning, so a dropped socket reads as a reconnect notice rather than a dead game.
 $id('socialFieldState').textContent=!ready?'Signed out'
   :gatePaused?'Field paused'
   :awaiting&&plazaAfk?'Plaza AFK · awaiting connection'
   :awaiting?'Field paused · awaiting connection'
   :paused?'Field paused'
   :plazaAfk?'Plaza AFK'
   :waiting?'Field not started'
   :trial?'Field trial'
   :typeof respawn!=='undefined'&&respawn>0?'Field · respawning'
   :'Field farming';
 // v390 (owner: "in social hub i still dont get exp from field"): the monitor used to COPY the
 // #expmin/#zenymin HUD samplers. Those are LIVE combat readings on a 30s idle reset (HUD_IDLE_RESET),
 // so the moment the player stood still in the plaza they read 0 - the card advertised "Plaza AFK" with
 // 0 EXP/min while a perfectly good 600 EXP/min sat in S.offlineIncome, and the player read that as
 // "the plaza pays nothing". Print the measured rate the plaza is actually paying instead.
 const saved=plazaAfk&&typeof plazaFarmIncome==='function'?plazaFarmIncome():null;
 const shown={exp:saved?saved.xp:0,zeny:saved?saved.zeny:0};
 for(const [target,kind] of [['socialFieldExp','exp'],['socialFieldZeny','zeny']]){
  const el=$id(target);
  el.textContent=live&&saved?eclipseMetricNumber(shown[kind]):'—';
  el.title=live&&saved?`Measured from your last field minute: ${Math.round(shown[kind]).toLocaleString()} ${kind==='exp'?'EXP':'Zeny'}/min`:'';
 }
 // v393: the plaza pays cards, gear and materials at the field's measured rate, so the card
 // says so. A silent drop is indistinguishable from a broken one.
 const loot=$id('socialFieldLoot');
 if(loot){
  const rate=saved?Math.round(Number(saved.kph)||0):0;
  loot.textContent=!live||!saved?'':rate?`+ drops · ${rate.toLocaleString()} kills/hr`:'';
  loot.title=rate?`Cards, gear and materials drop at your field rate of ${rate.toLocaleString()} kills/hr.`:'';
 }
 syncDigipetDock();
}
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
// v406 (owner: "make click elsewhere is will be close for other players name"): the menu had
// no way out except Escape or the Close button, so it sat over the chat until one of those.
// The name buttons that OPEN it are exempt - they would otherwise close the menu on the same
// click that raised it, and the bubbling order guarantees document runs after the button.
function closePlayerMenuOutside(e){const menu=$id('socialPeople');if(!menu||menu.hidden)return;
 if(menu.contains(e.target))return;
 if(e.target.closest&&e.target.closest('.social-line button,.social-player-label button'))return;
 menu.hidden=true}
document.addEventListener('click',closePlayerMenuOutside);
function playerMenu(name,id){const menu=$id('socialPeople');menu.replaceChildren();menu.hidden=false;const label=document.createElement('strong');label.textContent=name;menu.append(label);
 // v403: a seeded crowd regular is not an account - no Whisper (the name resolves nowhere on
 // the server), no Mute, no friend request. The label still opens so the click feels alive.
 if(typeof id==='string'&&id.startsWith('bot')){const b=document.createElement('button');b.type='button';b.textContent='Close';b.onclick=()=>{menu.hidden=true};menu.append(b);return}
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
 if(m.sys){p.classList.add('social-line-sys');const span=document.createElement('span');span.className='social-sys-text';span.textContent=m.body;p.append(span);return p}const b=document.createElement('button');b.type='button';b.textContent=(m.gm?'🛠 ':'')+(app.friends.has(m.from)?'★ ':'')+m.name+(m.channel==='whisper'?' → '+m.toName:'');b.title=(m.gm?'Game Master':'')+(m.gm&&app.friends.has(m.from)?' · ':'')+(app.friends.has(m.from)?'Friend':'');b.classList.toggle('social-gm',!!m.gm);b.onclick=()=>{if(Number.isInteger(app.id)&&m.from===app.id)return;playerMenu(m.name,m.from)};p.append(b,document.createTextNode(': '));if(m.emotion){const im=document.createElement('img');im.src=emojiURL(m.emotion,m.face);im.alt=emojiAlt(m.emotion);im.title=emojiAlt(m.emotion);im.onerror=()=>{if(im.dataset.noart)return;im.dataset.noart='1';const t=document.createElement('span');t.className='social-line-noart';t.textContent=emojiAlt(m.emotion);im.replaceWith(t)};p.append(im)}else p.append(document.createTextNode(m.body));return p}
function renderMessages(preserve=false){const box=$id('socialLines'),bottom=box.scrollHeight-box.scrollTop-box.clientHeight<35,top=box.scrollTop;box.replaceChildren();if(app.channel==='log'){for(const l of logShown()){const p=document.createElement('div');p.className='social-line '+(l.cls||'');p.textContent=l.m;box.append(p)}const b=document.createElement('button');b.textContent='Log filters';b.onclick=()=>openTab('log');box.append(b)}else for(const m of app.messages.filter(m=>m.channel===app.channel&&!app.muted.has(m.from)))box.append(messageNode(m));if(!box.childNodes.length)notice(app.channel==='local'?'Messages here are visible only to this plaza.':'No messages yet.');if(!preserve||bottom){box.scrollTop=box.scrollHeight;$id('socialNew').hidden=true}else {box.scrollTop=top;$id('socialNew').hidden=false}}
$id('socialNew').onclick=()=>{$id('socialLines').scrollTop=$id('socialLines').scrollHeight;$id('socialNew').hidden=true};
let lastCooldownKey='';
// v274 (owner): the tray works on World and Whisper too, not just in a plaza. The
// emotion travels on the channel the player has selected, so the tray is offered
// on every channel that can carry one - only a closed-channel case (Local with no
// room to be local to) has nothing to send to.
function emoteChannel(){const c=app.channel;if(c==='local'&&!app.room)return null;return ['world','whisper','local'].includes(c)?c:null}
function renderEmoji(){const box=$id('socialEmoji');box.replaceChildren();const channel=emoteChannel();if(!channel){const p=document.createElement('p');p.textContent=app.channel==='log'?'Pick World, Whisper or Local to send an emotion.':'Enter the Social Hub to use Local emotions.';p.style.gridColumn='1 / -1';box.append(p);return}
 for(const id of R.EMOTIONS){const b=document.createElement('button');b.type='button';b.title=id==='dice'?'/dice - roll 1 to 6':emoteLabel(id);
  // The tray is a menu, and /dice is not "the one face": a fresh face each time the tray opens
  // says "this rolls" before anyone presses it.
  const tileFace=id==='dice'?1+Math.floor(Math.random()*6):undefined;
  b.append(emoteSlot(id,40,tileFace),document.createTextNode(id==='dice'?'/dice (roll)':emoteLabel(id)));b.onclick=()=>{const m={type:'emotion',emotion:id,channel};if(channel==='whisper'){const to=$id('socialTo').value.trim();if(!to){status('Whisper an emotion to whom? Type a name in the To field first.');$id('socialTo').focus();return}m.to=to}if(send(m))toggleEmoji(false)};box.append(b)}lastCooldownKey='';cooldownUI()}
function cooldownUI(){const seconds=Math.max(0,Math.ceil((app.nextChat-Date.now())/1000)),key=seconds+':'+app.channel+':'+$id('socialEmoji').hidden;if(key===lastCooldownKey)return;lastCooldownKey=key;$id('socialSend').disabled=seconds>0||app.channel==='log';$id('socialSend').textContent=seconds?'Wait '+seconds+'s':'Send';chat.querySelectorAll('#socialEmoji button').forEach(b=>b.disabled=seconds>0)}
setInterval(cooldownUI,200);
function send(m){if(!app.connected||app.socket?.readyState!==1){
 // v313: during the half-second between a new socket opening and its `hello`, a walk or a look used
 // to print "Chat disconnected - reconnecting..." over a socket that was perfectly healthy. The
 // status now only says so when the connection really is gone.
 status(!app.socket?'Chat disconnected — reconnecting…':app.socket.readyState===0?'Connecting to chat…':'Chat disconnected — reconnecting…');return false}const speaking=['chat','emotion'].includes(m.type);if(speaking&&Date.now()<app.nextChat){status('Please wait 3 seconds between messages and emotions.');return false}app.socket.send(JSON.stringify(m));if(speaking){app.nextChat=Date.now()+R.CHAT_DELAY;cooldownUI()}return true}
$id('socialCompose').onsubmit=e=>{e.preventDefault();const input=$id('socialInput'),body=input.value.trim();if(!body||app.channel==='log')return;let sent=false;if(body==='/sit'){toggleSit();input.value='';return}else if(body==='/poker'){pokerOpen();input.value='';return}else if(body[0]==='/'&&emoteFromCommand(body.slice(1))){const ch=emoteChannel(),em={type:'emotion',emotion:emoteFromCommand(body.slice(1)),channel:ch||'local'};if(ch==='whisper')em.to=$id('socialTo').value.trim();if(ch==='whisper'&&!em.to){status('Whisper an emotion to whom? Type a name in the To field first.');return}sent=send(em)}else if(body.startsWith('/w ')){const match=body.match(/^\/w\s+(\S+)\s+(.+)$/);if(match)sent=send({type:'chat',channel:'whisper',to:match[1],body:match[2]});else status('Use /w PlayerName message')}else sent=send({type:'chat',channel:app.channel,to:$id('socialTo').value.trim(),body});if(sent)input.value=''};
chat.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.target.blur();toggleEmoji(false);$id('socialPeople').hidden=true}});
function closeAllHubOverlays(){
 if(!sanctuaryPanel.hidden)sanctuaryClose();
 const party=$id('socialPartyPanel');if(party&&!party.hidden){party.hidden=true;$id('socialPartyBtn')?.setAttribute('aria-pressed','false')}
 if($id('socialMapModal')&&!$id('socialMapModal').hidden)$id('socialMapModal').hidden=true;
 closeHubMore();
 if(!$id('socialPokerModal').hidden)closePokerModal();
 for(const id of ['fishingPanel','fishingMenu']){const el=$id(id);if(el)el.hidden=true}
 if(typeof activityPanel!=='undefined'&&activityPanel&&!activityPanel.hidden)dismissActivityPanel();
 $id('socialFishBtn')?.setAttribute('aria-pressed','false');
}
addEventListener('keydown',e=>{if(!leaveWarning.hidden||!fishLeaveWarning.hidden)return;if(e.ctrlKey||e.altKey||e.metaKey)return;if(e.key==='Escape'&&!hub.hidden){e.preventDefault();closeAllHubOverlays();return}if(e.target.matches('input,textarea,select')||e.target.closest('button,[role=button],[role=separator],summary'))return;if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();if(app.channel==='log')select(app.room?'local':'world');$id('socialInput').focus()}if(e.key==='Insert'&&(app.room||app.wanted)){e.preventDefault();toggleSit()}},true);
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
 if(!app.wanted){enter().then(stillHere=>{if(stillHere&&app.wanted)pokerOpen(tabOrTable)});return;}
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
 focusHubPanel('poker');pokerUI.open=true;pokerUI.minimized=false;
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
   if(e.emotion){node.classList.add('is-emotion');const slot=emoteSlot(e.emotion,36,e.face);slot.title=emoteLabel(e.emotion);node.append(slot)}
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
  const label=blinkToolbar&&tSec>0?`YOUR TURN · ${tSec}s`:'Hold\'em';
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
 if(headTitle)headTitle.textContent=`🃏 Prontera Hold'em · ${tSpec?.label||'Table 1'}`;
 if(sub)sub.textContent=(app.room?`Prontera ${app.room} · `:'Solo · ')+`${tSpec?.dealer?.name||'Dealer Vane'} · Blinds ${P.SMALL_BLIND}/${P.BIG_BLIND} · AFK Kick ${P.AFK_MAX_TIMEOUTS}×`;
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

function resetPlayers(){app.players.clear();app.scene?.clearPlayers();$id('socialLabels').querySelectorAll('.social-player-label,.social-bubble').forEach(n=>n.remove());plazaBotsResync()}
// v296 (owner): wearing a fishing title must not replace the Hunt title. The two now travel as
// separate fields and draw as separate lines above the head - Hunt title first, fishing under it.
function huntTitleName(st){if(st&&typeof equippedMasteryTitle==='function')return equippedMasteryTitle(st)?.name||'';return st&&typeof HUNT_TITLES!=='undefined'?HUNT_TITLES.find(t=>t.id===st.equippedTitle&&titleUnlocked(t))?.name||'':''}
function fishingTitleName(st){
 const F=FISHING();
 if(!F||typeof F.equippedTitle!=='function')return '';
 try{const t=F.equippedTitle(st&&st.fishing);return t?'🎣 '+t.name:''}catch{return ''}
}
// v373 (owner): the worn fishing title is drawn in its tier colour, not one fixed blue.
function fishingTitleColor(st){const F=FISHING();if(!F||typeof F.equippedTitle!=='function'||typeof F.titleColor!=='function')return '';try{return F.titleColor(F.equippedTitle(st&&st.fishing))}catch{return ''}}
// v373 (owner): DigiPet titles, worn on the line under the fishing title. Requirements are read from
// every owned partner slot and the Pet Bag, so the title follows the save and never needs a counter.
function digiStats(){const G=globalThis.PGDigimonSanctuary;if(!G||typeof S!=='object'||!S)return null;const partners=[];for(let slot=0;slot<4;slot++){const line=partnerLine(slot);if(!line)continue;const p=G.normalize(partnerData(slot),line)?.partners?.[line];if(p)partners.push(p)}const bag=petBag();return G.digiTitleStats(partners,bag?bag.owned.length:0)}
function digiTitleWorn(){const G=globalThis.PGDigimonSanctuary;if(!G||typeof S!=='object'||!S)return null;return G.equippedDigiTitle(S.digimonTitle,digiStats())}
function digiTitleName(){const t=digiTitleWorn();return t?'🐾 '+t.name:''}
function digiTitleColorOf(){return globalThis.PGDigimonSanctuary?.digiTitleColor(digiTitleWorn())||''}
// Wear an earned DigiPet title, or pass null to take it off. Repaints the plaza for everyone else.
function equipDigiTitle(id){const G=globalThis.PGDigimonSanctuary;if(!G||typeof S!=='object'||!S)return false;if(id!==null&&!G.equippedDigiTitle(id,digiStats())){worldNotice('That DigiPet title is not earned yet.');return false}S.digimonTitle=id||null;if(typeof save==='function')save();refreshCompanionLook();sanctuaryRender();return true}
function currentLook(slotOverride=null){const st=typeof S==='object'&&S?S:null,slot=Number.isInteger(slotOverride)?Math.max(0,Math.min(3,slotOverride)):activePartnerSlot(),partner=partnerLine(slot),creature=(worldTraining&&worldTraining.slot===slot)||battleBusySlot()===slot?null:(globalThis.PGDigimonSanctuary?.species(partnerData(slot),partner)||partner);return {cls:st?.cls||'Novice',appearance:st&&typeof wardrobeAppearance==='function'?wardrobeAppearance():{version:1,sex:'m'},refine:Math.max(0,Math.min(15,st?.eq?.weapon?.r||0)),title:huntTitleName(st),fishTitle:fishingTitleName(st),fishTitleColor:fishingTitleColor(st),digiTitle:digiTitleName(),digiTitleColor:digiTitleColorOf(),lv:st&&st.auraShow!==false&&!st.hideUI?Math.max(0,Math.min(999,Math.floor(Number(st.lv)||0))):0,speed:st&&typeof moveSpd==='function'?Math.round(moveSpd(true)*100)/100:0,...(creature?{digimon:creature}:{})}}
function soloName(){const u=typeof CLOUD!=='undefined'&&CLOUD.user?(typeof CLOUD.user==='string'?CLOUD.user:CLOUD.user.username):typeof currentUser==='string'&&currentUser?currentUser:'';return u||app.user||'Adventurer'}
function syncSoloPlayer(){if(!app.wanted||!app.scene||app.room)return;let p=app.players.get(SOLO_ID);const look=currentLook(),name=soloName();if(!p){ // v361: the solo plaza spawns on the Aetherwell promenade ring, like the shared rooms.
   // v363 (owner: "when I walk around I keep being teleported back to spawn"): while a drop is
   // being reconnected the room is 0 for a moment, and re-creating the placeholder on the ring
   // every time turned each blip into a teleport. The spot captured when the socket closed -
   // or a solo hero already standing in the map - is kept, so the walk simply continues; only a
   // true first entry, with no position to keep, spawns on the promenade.
   const r=app.resume,keep=r&&Number.isFinite(r.x)&&Number.isFinite(r.z)&&R.walkable(r.x,r.z);
   const sp=keep?{x:r.x,z:r.z}:R.fountainSpawn();
   p={id:SOLO_ID,name,room:0,x:sp.x,z:sp.z,dir:keep&&Number.isInteger(r.dir)?r.dir:0,sit:false,seat:null,pokerSeat:null,path:[],at:performance.now(),look}}else{R.advance(p,performance.now());p.name=name;p.look=look}putPlayer(p)}
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
// Keep the Local notice, but leave the blue transient activity HUD alone; the red Fishing banner is the on-screen alert.
function fishingMvpNotice(_kind,text){notice(text)}
function bindFishing(){const F=FISHING();if(!F)return;F.bind({host:()=>typeof S==='object'&&S?S:null,scene:()=>app.scene,self:fishingSelf,moveTo:(x,z)=>moveAction(x,z),walkTo:(x,z)=>performMoveAction(x,z,true),showOff:fishingShowOff,announce:fishingAnnounce,rig:fishingRig,titleChanged:fishingTitleChanged,notice,mvpNotice:fishingMvpNotice,isUpdating:()=>typeof CLOUD!=='undefined'&&!!CLOUD.updating,save:()=>{if(typeof save==='function'&&typeof S==='object'&&S)save()},button:$id('socialFishBtn')})}
const SOLO_MVP_KEY='pg_solo_mvp_v1';
function soloUserKey(){
 const u=typeof CLOUD!=='undefined'&&CLOUD.user?(typeof CLOUD.user==='string'?CLOUD.user:CLOUD.user.username):typeof currentUser==='string'&&currentUser?currentUser:'';
 return u||app.user||'solo';
}
function soloMvpIds(){const F=FISHING();return Array.isArray(F?.SPECIES)?F.SPECIES.filter(s=>s.rarity==='mvp').map(s=>s.id):[]}
function cleanSoloMvpState(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const allowed=new Set(soloMvpIds()),seen=new Set();
 const bag=Array.isArray(raw.bag)?raw.bag.filter(id=>allowed.has(id)&&!seen.has(id)&&seen.add(id)):[];
 const active=raw.active&&allowed.has(raw.active.sp)&&typeof raw.active.id==='string'&&raw.active.id.length>0&&Number.isFinite(raw.active.spawnedAt)&&Number.isFinite(raw.active.endsAt)&&raw.active.endsAt>raw.active.spawnedAt?{sp:raw.active.sp,id:raw.active.id,spawnedAt:raw.active.spawnedAt,endsAt:raw.active.endsAt}:null;
 return {user:soloUserKey(),active,nextAt:Number.isFinite(raw.nextAt)&&raw.nextAt>0?raw.nextAt:0,lastSp:allowed.has(raw.lastSp)?raw.lastSp:null,bag};
}
function readSoloMvpState(){
 try{
  const raw=localStorage.getItem(SOLO_MVP_KEY);if(!raw)return null;
  const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object')return null;
  const user=soloUserKey();
  if(parsed.user&&parsed.user!==user){localStorage.removeItem(SOLO_MVP_KEY);soloMvpNextAt=0;const active=FISHING()?.getMvp?.();if(active?.mode==='solo')FISHING()?.clearMvp?.(active,{announce:false,retire:false});return null}
  return cleanSoloMvpState(parsed);
 }catch{return null;}
}
function writeSoloMvpState(state){
 try{
  if(!state){localStorage.removeItem(SOLO_MVP_KEY);return;}
  const clean=cleanSoloMvpState(state)||{active:null,nextAt:0,lastSp:null,bag:[]};
  clean.user=soloUserKey();
  localStorage.setItem(SOLO_MVP_KEY,JSON.stringify(clean));
 }catch{}
}
function clearSoloMvpStorage(){
 try{localStorage.removeItem(SOLO_MVP_KEY)}catch{}
 soloMvpNextAt=0;
 const active=FISHING()?.getMvp?.();if(active?.mode==='solo')FISHING()?.clearMvp?.(active,{announce:false,retire:false});
}
let soloMvpNextAt=0;
function shuffledSoloMvpBag(ids,previous){
 const bag=[...ids];for(let i=bag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]]}
 if(bag.length>1&&bag[0]===previous){const j=1+Math.floor(Math.random()*(bag.length-1));[bag[0],bag[j]]=[bag[j],bag[0]]}
 return bag;
}
function tickSoloMvp(){
 if(!app.wanted||app.room)return;
 const F=FISHING();if(!F||!F.SPECIES)return;
 const now=Date.now();let state=readSoloMvpState();
 const currentMvp=F.getMvp?.();
 if(currentMvp?.mode==='plaza')F.clearMvp?.(currentMvp,{announce:false,retire:false});
 else if(currentMvp?.mode==='solo'){
  if(now>=currentMvp.endsAt){F.clearMvp?.(currentMvp,{reason:'expired'});if(state?.active){state.active=null;writeSoloMvpState(state)}}
  return;
 }
 if(state?.active){
  if(now<state.active.endsAt){
   const result=F.setMvp?.({...state.active,mode:'solo',room:0},{mode:'solo',announce:false});
   soloMvpNextAt=state.nextAt||0;
   return result;
  }
  state.active=null;writeSoloMvpState(state);
 }
 if(!soloMvpNextAt){
  if(state?.nextAt)soloMvpNextAt=state.nextAt;
  else{soloMvpNextAt=now+60*60*1000+Math.random()*60*60*1000;state=state||{active:null,lastSp:null,bag:[]};state.nextAt=soloMvpNextAt;writeSoloMvpState(state)}
 }
 if(now<soloMvpNextAt)return;
 const ids=soloMvpIds();if(!ids.length){soloMvpNextAt=now+60*60*1000+Math.random()*60*60*1000;state=state||{active:null,lastSp:null,bag:[]};state.nextAt=soloMvpNextAt;writeSoloMvpState(state);return}
 state=state||{active:null,nextAt:0,lastSp:null,bag:[]};
 state.bag=Array.isArray(state.bag)?state.bag.filter(id=>ids.includes(id)):[];
 if(!state.bag.length)state.bag=shuffledSoloMvpBag(ids,state.lastSp);
 const chosenId=state.bag.shift(),chosen=F.SPECIES.find(s=>s.id===chosenId);
 if(!chosen)return;
 state.lastSp=chosenId;
 const id='mvp:solo:'+now.toString(36)+':'+Math.random().toString(36).slice(2,8),endsAt=now+10*60*1000;
 soloMvpNextAt=now+60*60*1000+Math.random()*60*60*1000;
 const active={sp:chosen.id,id,spawnedAt:now,endsAt,mode:'solo',room:0};
 state.active={sp:active.sp,id:active.id,spawnedAt:active.spawnedAt,endsAt:active.endsAt};state.nextAt=soloMvpNextAt;
 writeSoloMvpState(state);
 F.setMvp?.(active,{mode:'solo',announce:true});
}
const digimonSelect=$id('socialDigimon');
let sanctuaryIndexPage=0,sanctuaryView='partners',sanctuaryHatch=null,sanctuaryIndexBranch=null,sanctuaryPartnerGridKey='';let sanctuaryGearFilterKind='',sanctuaryGearFilterTier='',sanctuaryGearSelected='';
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
function refreshCompanionLook(slot=null){if(app.room)send({type:'look',look:currentLook(slot)});else syncSoloPlayer()}

// Gym progress is casual and client-saved; the room only reserves equipment and
// broadcasts presentation. No timer survives a reload/logout or socket loss.
const worldTrainingHUD=document.createElement('div');worldTrainingHUD.id='sanctuaryWorldStatus';worldTrainingHUD.hidden=true;worldTrainingHUD.innerHTML='<span role="status" aria-live="polite"></span><button type="button" data-action="stop">Stop</button>';hudStack.append(worldTrainingHUD);
const worldTrainingText=worldTrainingHUD.querySelector('span'),worldTrainingCancel=worldTrainingHUD.querySelector('button[data-action="stop"]');
/* v379 (owner: "double training bar at the top — keep only the top-right one"): a running gym
   session is shown top-right only; the centred bar keeps transient notices (stopped reasons,
   completions).
   v383 (owner: "the ring is like a meter to see what the digipet is doing - training, pve").
   v384 (owner screenshots: the pill read "[object Object] xp", the wrong partner was marked BUSY
   and a second activity was squeezed into one grey line): the pill is now the DigiPet dock - one
   chip per running activity (gym session, field grind / boss raid, ring match). Each chip is a
   progress ring around the partner that is actually doing the work, one line of live status and
   its own Stop. Clicking a chip opens the activity panel on that activity's tab; clicking it
   again puts the panel away. While the panel sits in its default spot under the dock, and on
   narrow screens, the chips shrink to their rings (social.css) so nothing overlaps. */
const digipetDock=document.createElement('div');digipetDock.id='digipetDock';digipetDock.hidden=true;digipetDock.setAttribute('role','group');digipetDock.setAttribute('aria-label','DigiPet activities');hub.append(digipetDock);
let dockLastPve=null;
function dockGym(){const t=worldTraining;return t&&typeof S==='object'&&S===t.owner?t:null}
function dockGrind(){const run=myPve()||soloPve;return run&&run.profile?run:null}
function dockPartner(slot){const G=globalThis.PGDigimonSanctuary,line=partnerLine(slot);if(!G||!line)return{form:'',name:'DigiPet'};const form=G.species(partnerData(slot),line)||line;return{form,name:sanctuaryName(form)}}
function dockChips(){
 const G=globalThis.PGDigimonSanctuary,B=globalThis.PGDigimonBattle,chips=[];if(!G||typeof S!=='object'||!S)return chips;
 const gym=dockGym(),run=dockGrind(),pvp=myPvp(),busy=battleBusySlot();
 if(gym){
  const who=dockPartner(gym.slot),live=gym.phase==='active',left=Math.max(0,G.DURATION-(gym.elapsed||0));
  chips.push({kind:'gym',tone:'training',tab:'training',...who,sub:sanctuaryName(gym.stat)+' training · '+(live?gymClock(left)+' left':'joining'),pct:live?(gym.elapsed||0)/G.DURATION*100:0,stop:'gym',stopLabel:'Stop gym training'});
 }
 if(run){
  // Field progress is the five-wave stage: finished waves plus the share of the current wave that
  // is already down. A raid has no waves, so its ring fills as the boss's HP empties.
  const who=dockPartner(Number.isInteger(busy)?busy:run.profile.slot),raid=run.mode==='boss',foes=(run.enemies||[]).filter(Boolean);let pct,sub;
  if(raid){const boss=foes.find(e=>e.boss),hp=boss&&boss.maxHp>0?Math.max(0,Math.min(1,boss.hp/boss.maxHp)):1;pct=(1-hp)*100;sub='Boss raid · boss HP '+Math.ceil(hp*100)+'%'}
  else{const wave=Math.max(1,run.wave||1),inWave=(wave-1)%5+1,down=foes.length?foes.filter(e=>e.hp<=0).length/foes.length:0;pct=(inWave-1+down)/5*100;sub='Stage '+(B?.stageOf?.(wave)||1)+' · '+(B?.isBossWave?.(wave)?'boss fight':'wave '+inWave+'/5')+' · ◈ '+(run.earned?.coins||0)}
  dockLastPve={kind:'pve',tone:raid?'raid':'pve',tab:'pve',...who,stop:'pve',stopLabel:raid?'Forfeit raid':'Stop grinding'};
  chips.push({...dockLastPve,sub,pct});
 }
 // "Keep repeating" leaves a short gap between two runs: the chip (and its Stop) stays put.
 else if(pveRepeatTimer&&dockLastPve)chips.push({...dockLastPve,sub:'Next run starting…',pct:0,stopLabel:'Cancel the next run'});
 else dockLastPve=null;
 if(pvp){
  const who=dockPartner(Number.isInteger(busy)?busy:activePartnerSlot()),foe=pvp.participants?.find(x=>x.id!==app.id),hp=foe?.unit&&foe.unit.maxHp>0?Math.max(0,Math.min(1,foe.unit.hp/foe.unit.maxHp)):1,fighting=pvp.phase==='fighting';
  chips.push({kind:'pvp',tone:'pvp',tab:'party',...who,sub:'Ring match · '+(fighting?'fighting':pvp.phase==='countdown'?'starting':pvp.phase==='offer'?'waiting for both trainers':'settling'),pct:fighting?(1-hp)*100:0,stop:'',stopLabel:''});
 }
 // A panel the player closed by hand stays closed while they remain in that area, so the dock
 // keeps one quiet chip there as the way back in.
 if(activityPanel.hidden&&sapAreaNow&&sapDismissedArea===sapAreaNow){
  const who=dockPartner(activePartnerSlot());
  if(sapAreaNow==='training'&&!gym)chips.push({kind:'idle',tone:'idle',tab:'training',...who,sub:'Gym · tap to pick a training',pct:0,stop:'',stopLabel:''});
  else if(sapAreaNow==='pve'&&!run&&!pveRepeatTimer&&!pvp)chips.push({kind:'idle',tone:'idle',tab:'pve',...who,sub:'Middle field · tap to grind',pct:0,stop:'',stopLabel:''});
 }
 return chips;
}
function dockChipMarkup(c){
 const G=globalThis.PGDigimonSanctuary,idx=c.form&&G?G.ROSTER.indexOf(c.form):-1,face=idx<0?'<i class="dd-face is-empty"></i>':'<i class="dd-face" style="--portrait-x:'+(-(idx%20)*64)+'px;--portrait-y:'+(-Math.floor(idx/20)*64)+'px"></i>';
 return '<div class="dd-chip is-'+c.tone+'" data-dock-kind="'+c.kind+'"><button type="button" class="dd-open" data-dock-open="'+c.tab+'" aria-expanded="false"><i class="dd-ring" aria-hidden="true">'+face+'</i><span class="dd-text"><b></b><small></small></span></button>'+(c.stop?'<button type="button" class="dd-stop" data-dock-stop="'+c.stop+'"'+(c.stop==='gym'?' data-gym-stop':'')+'>Stop</button>':'')+'</div>';
}
/* Chips are rebuilt only when the SET of activities (or a partner's form) changes; the half-second
   refresh in between rewrites text and ring progress in place, so a button is never replaced
   under the pointer. */
function syncDigipetDock(){
 const dock=$id('digipetDock');if(!dock)return;
 let chips=[];try{chips=dockChips()}catch(e){chips=[]}
 const open=!activityPanel.hidden;
 hub.classList.toggle('sap-panel-open',open);hub.classList.toggle('sap-open',open&&!activityPanel.classList.contains('is-moved'));hub.classList.toggle('has-dock',chips.length>0);
 dock.hidden=!chips.length;
 const key=chips.map(c=>[c.kind,c.tone,c.tab,c.form,c.stop].join(':')).join('|');
 if(dock.dataset.key!==key){dock.dataset.key=key;dock.innerHTML=chips.map(dockChipMarkup).join('')}
 chips.forEach((c,i)=>{
  const el=dock.children[i];if(!el)return;
  const name=el.querySelector('.dd-text b'),sub=el.querySelector('.dd-text small'),ring=el.querySelector('.dd-ring'),btn=el.querySelector('[data-dock-open]'),stop=el.querySelector('[data-dock-stop]');
  if(name.textContent!==c.name)name.textContent=c.name;if(sub.textContent!==c.sub)sub.textContent=c.sub;
  const pct=Math.max(0,Math.min(100,Number(c.pct)||0)).toFixed(1)+'%';if(ring.dataset.pct!==pct){ring.dataset.pct=pct;ring.style.setProperty('--progress',pct)}
  const expanded=String(open&&sapTab===c.tab);if(btn.getAttribute('aria-expanded')!==expanded)btn.setAttribute('aria-expanded',expanded);
  const label=c.name+' · '+c.sub;if(btn.title!==label)btn.title=label;
  if(stop&&stop.title!==c.stopLabel){stop.title=c.stopLabel;stop.setAttribute('aria-label',c.stopLabel)}
 });
}
digipetDock.onclick=e=>{
 const stop=e.target.closest('[data-dock-stop]');
 if(stop){if(stop.dataset.dockStop==='gym')cancelWorldTraining();else{clearPveRepeat();stopPve()}syncDigipetDock();return}
 const open=e.target.closest('[data-dock-open]');if(!open)return;
 const tab=open.dataset.dockOpen;if(!activityPanel.hidden&&sapTab===tab)dismissActivityPanel();else openActivityPanel(tab);
};
const worldNearby=document.createElement('button');worldNearby.id='sanctuaryNearby';worldNearby.type='button';worldNearby.hidden=true;hudStack.append(worldNearby);
const worldBattleNearby=document.createElement('button');worldBattleNearby.id='sanctuaryBattleNearby';worldBattleNearby.type='button';worldBattleNearby.hidden=true;hudStack.append(worldBattleNearby);
const battleHUD=document.createElement('div');battleHUD.id='sanctuaryBattleHUD';battleHUD.hidden=true;hudStack.append(battleHUD);
const pvpDialog=document.createElement('section');pvpDialog.id='pvpBattleDialog';pvpDialog.className='sanctuary-battle-dialog';pvpDialog.setAttribute('role','dialog');pvpDialog.setAttribute('aria-live','polite');pvpDialog.hidden=true;hub.append(pvpDialog);
const battleResultDialog=document.createElement('section');battleResultDialog.id='sanctuaryBattleResult';battleResultDialog.className='sanctuary-battle-dialog sanctuary-battle-result';battleResultDialog.setAttribute('role','dialog');battleResultDialog.hidden=true;hub.append(battleResultDialog);
const TRAIN_STATIONS={power:{x:56,z:30},guard:{x:63,z:21},agility:{x:75,z:26},focus:{x:86,z:27}};
let worldTraining=null,worldNoticeTimer=0,gymEntries=[],gymSerial=0,worldNearbyStat='';
let battleRequest=0,battleOffer=null,soloPve=null;
/* v371 (owner): the gym and the middle field used to offer one button each, so picking another
   training stat meant walking to another station. Both places now open one movable panel with
   every choice in it, and both can repeat on their own (a 'keep repeating' switch per activity). */
const activityPanel=document.createElement('section');activityPanel.id='sanctuaryActivityPanel';activityPanel.className='sanctuary-activity-panel';activityPanel.hidden=true;activityPanel.setAttribute('role','dialog');activityPanel.setAttribute('aria-label','DigiPet activities');activityPanel.innerHTML='<header class="sap-head"><b id="sapTitle">DigiPet</b><span class="sap-move" aria-hidden="true">⠿ drag to move</span><button type="button" id="sapMin" aria-label="Minimize to the DigiPet dock" title="Minimize - the DigiPet dock (top right) keeps the timer and Stop">&minus;</button><button type="button" id="sapClose" aria-label="Close this panel">&times;</button></header><nav class="sap-tabs" role="tablist" aria-label="DigiPet activities"><button type="button" role="tab" data-sap-tab="party" aria-selected="true">Party</button><button type="button" role="tab" data-sap-tab="training" aria-selected="false">Training</button><button type="button" role="tab" data-sap-tab="pve" aria-selected="false">PvE grind</button><button type="button" role="tab" data-sap-tab="logs" aria-selected="false">Logs</button></nav><div class="sap-body" id="sapBody" role="tabpanel"></div><footer class="sap-foot"><label class="sap-repeat"><input type="checkbox" id="sapRepeat"><span>Keep repeating</span></label><small id="sapNote"></small></footer>';hub.append(activityPanel);
const sapHead=activityPanel.querySelector('.sap-head'),sapTitle=$id('sapTitle'),sapBodyEl=$id('sapBody'),sapRepeatEl=$id('sapRepeat'),sapNoteEl=$id('sapNote');
const sapTabButtons=[...activityPanel.querySelectorAll('[data-sap-tab]')],sapRepeatWrap=sapRepeatEl.closest('.sap-repeat');
const sapPos={left:null,top:null};
/* v372 (owner): one panel, three tabs - Training, PvE grind and Logs. The tab remembered for
   the session opens by itself; stepping into an area only chooses the OUTCOME (open + that
   tab), never which partner - each activity keeps its own partner pick in the save. */
let sapTab='party',pveRepeatTimer=0; // v381: the Party overview is the landing tab
/* v384 (owner: "the panel keeps coming back and jumps to another tab"): how the panel got on
   screen decides who may put it away. sapAutoArea is the area ('training' = gym, 'pve' = middle
   field) that opened it by itself - walking out of that area closes it again. A panel the player
   opened from the dock or the status shortcut has no such area and stays until they close it.
   sapDismissedArea is the area in which the player closed it by hand (- or x): it stays away
   there until they leave. sapAreaNow is the area the player is standing in this frame. */
let sapAutoArea='',sapDismissedArea='',sapAreaNow='';
/* v383 (owner: "the training tab is bugging, cant be clicked sometimes"): the tabs answer their own
   clicks instead of relying on the panel's delegated handler, so a re-render, a moving panel or a
   drag gesture can never swallow the tap. stopPropagation keeps the delegate from double-firing. */
for(const tab of sapTabButtons)tab.onclick=e=>{e.preventDefault();e.stopPropagation();if(tab.dataset.sapTab===sapTab){renderActivityPanel(true);return}sapTab=tab.dataset.sapTab;renderActivityPanel(true)};
const ACTIVITY_POS_KEY='pg_plaza_panel_pos';
try{const saved=JSON.parse(localStorage.getItem(ACTIVITY_POS_KEY)||'null');if(saved&&Number.isFinite(saved.left)&&Number.isFinite(saved.top)){sapPos.left=saved.left;sapPos.top=saved.top;activityPanel.classList.add('is-moved');activityPanel.style.left=saved.left+'px';activityPanel.style.top=saved.top+'px'}}catch(e){}
function clampActivityPos(left,top){const w=hub.clientWidth||0,h=hub.clientHeight||0,pw=activityPanel.offsetWidth||300,ph=activityPanel.offsetHeight||230;return{left:Math.max(0,Math.min(Math.round(left),Math.max(0,w-pw))),top:Math.max(0,Math.min(Math.round(top),Math.max(0,h-ph)))}}
function moveActivityPanel(left,top){const p=clampActivityPos(left,top);sapPos.left=p.left;sapPos.top=p.top;activityPanel.classList.add('is-moved');hub.classList.remove('sap-open');activityPanel.style.left=p.left+'px';activityPanel.style.top=p.top+'px'}
let sapDrag=null;
sapHead.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;const rect=activityPanel.getBoundingClientRect(),host=hub.getBoundingClientRect();sapDrag={dx:e.clientX-rect.left,dy:e.clientY-rect.top};activityPanel.classList.add('is-dragging');try{sapHead.setPointerCapture(e.pointerId)}catch(err){}e.preventDefault()});
sapHead.addEventListener('pointermove',e=>{if(!sapDrag)return;const host=hub.getBoundingClientRect();moveActivityPanel(e.clientX-host.left-sapDrag.dx,e.clientY-host.top-sapDrag.dy);e.preventDefault()});
const sapDrop=()=>{if(!sapDrag)return;sapDrag=null;activityPanel.classList.remove('is-dragging');try{localStorage.setItem(ACTIVITY_POS_KEY,JSON.stringify({left:sapPos.left,top:sapPos.top}))}catch(e){}};
sapHead.addEventListener('pointerup',sapDrop);sapHead.addEventListener('pointercancel',sapDrop);
addEventListener('resize',()=>{if(sapPos.left!=null&&!activityPanel.hidden)moveActivityPanel(sapPos.left,sapPos.top)});
/* 'Keep repeating' lives in the save, so the choice survives a reload. Auto-training has always
   repeated itself, so the gym stays on by default; the grind run is opt-in. */
function plazaRepeat(kind){const st=typeof S==='object'&&S?S.plazaRepeat:null;if(kind==='gym')return!(st&&st.gym===false);return!!(st&&st.pve)}
function setPlazaRepeat(kind,on){if(typeof S!=='object'||!S)return;if(!S.plazaRepeat||typeof S.plazaRepeat!=='object')S.plazaRepeat={};S.plazaRepeat[kind]=!!on;if(kind==='pve'){if(!on)clearPveRepeat();if(app.room&&app.connected)send({type:'pve_repeat',on:!!on})}if(typeof save==='function')save()}
/* v372 (owner): each activity keeps its own partner slot, saved with the character, so one
   partner can camp the gym, another farms the middle field and a third follows the player.
   An absent or unusable choice falls back to the followed (active) partner. */
// The tab selection and the running-session owner are separate. A running gym/PvE partner keeps
// working, but clicking another card immediately previews and prepares that DigiPet instead of
// trapping the panel on the busy one. The saved choice survives tab changes and panel reopen.
function activitySlot(kind){
 const saved=typeof S==='object'&&S&&S.plazaPartners&&Number(S.plazaPartners[kind]);
 if(Number.isInteger(saved)&&saved>=0&&saved<=3&&partnerLine(saved))return saved;
 return activePartnerSlot();
}
function setActivitySlot(kind,slot){
 const i=Math.floor(Number(slot));if(![0,1,2,3].includes(i)||typeof S!=='object'||!S)return false;
 if(!S.plazaPartners||typeof S.plazaPartners!=='object')S.plazaPartners={};if(kind==='gym')S.plazaPartners.gym=i;else S.plazaPartners.pve=i;
 sanctuaryEvolveConfirm=null;if(typeof save==='function')save();sanctuarySync();renderActivityPanel(true);return true;
}
/* v372: the Logs tab keeps, for the rest of the session, every notice the plaza shows above
   the frame - session completions, battle results, hatches, connection loss. In memory only:
   the save format stays untouched and a reload starts a fresh page (the per-line budget is
   small and every line is re-derivable from play). */
const ACTIVITY_LOG_MAX=40,activityLog=[];
function pushActivityLog(text){const body=typeof text==='string'?text.trim():'';if(!body)return;activityLog.push({at:Date.now(),text:body});if(activityLog.length>ACTIVITY_LOG_MAX)activityLog.shift();if(sapTab==='logs'&&!activityPanel.hidden)renderActivityPanel(true)}
sapRepeatEl.addEventListener('change',()=>{const kind=sapTab==='pve'?'pve':'gym';setPlazaRepeat(kind,sapRepeatEl.checked);if(kind==='gym'&&worldTraining)worldNotice('Keep repeating '+(sapRepeatEl.checked?'on':'off')+' for gym sessions.',true);renderActivityPanel(true)});
function nearGym(p){return Object.values(TRAIN_STATIONS).some(st=>Math.hypot(p.x-st.x,p.z-st.z)<=9)}
function nearFarm(p){return Math.abs(p.x-70)<=25&&Math.abs(p.z-64)<=16}
function gymPanelPartner(){const G=globalThis.PGDigimonSanctuary,slot=activitySlot('gym'),line=partnerLine(slot);if(!G||!line||!ownsDigimon(line))return null;const data=G.normalize(partnerData(slot),line);return data?{G,slot,line,p:data.partners[line]}:null}
/* One row of partner cards per activity. Empty slots and busy partners are visible (so the
   player can see WHY they cannot pick them) but not selectable; during a running session the
   whole row locks - the session owns that partner until it ends. */
function partnerPickerMarkup(kind){const G=globalThis.PGDigimonSanctuary,pick=activitySlot(kind),running=kind==='gym'?!!worldTraining:!!(myPve()||soloPve),parts=[0,1,2,3].map(slot=>{const line=partnerLine(slot),data=line?G?.normalize(partnerData(slot),line):null,p=line&&G?.ROSTER?.includes(line)?data?.partners?.[line]:null,form=p?(G.species(data,line)||line):null,owned=!!(line&&ownsDigimon(line)),busy=(worldTraining&&worldTraining.slot===slot)||(battleBusySlot()===slot),selected=slot===pick,dis=!p||!owned;return '<button type="button" class="sap-partner'+(selected?' is-selected':'')+(busy?' is-busy':'')+'" role="radio" aria-checked="'+selected+'" data-activity-slot="'+slot+'" data-kind="'+kind+'"'+(dis?' disabled':'')+'><span class="sap-partner-slot">Partner '+(slot+1)+'</span><b>'+(form?escape(sanctuaryName(form)):owned?escape(sanctuaryName(line)):'Empty slot')+'</b><small>'+(form?'Lv '+G.level(p):owned?'Hatched':'No partner')+(busy?' · BUSY':'')+'</small></button>'});return '<div class="sap-partners" role="radiogroup" aria-label="Partner for this activity">'+parts.join('')+'</div>'+(running?'<p class="sap-note">The partner in a running session keeps going. Pick another DigiPet to set up the next one.</p>':'')}
/* v381 (owner: "view multi digimon if they were training & grinding together"): every partner's
   live state in one list - gym training, field grinding, ring match or resting - tap a row to
   jump to that partner's Training or PvE controls. */
function partyPanelMarkup(){const G=globalThis.PGDigimonSanctuary;if(!G)return '<p class="sap-empty">DigiPet is still loading.</p>';
 let html='<div class="sap-party">';
 for(const slot of [0,1,2,3]){
  const line=partnerLine(slot),data=line?G.normalize(partnerData(slot),line):null,p=data?.partners?.[line],owned=!!(line&&G.ROSTER.includes(line)&&p);
  const act=slotActivity(slot);
  const label=owned?sanctuaryName(line):'Partner '+(slot+1);
  const meta=owned?'Lv '+G.level(p)+' · '+sanctuaryName(p.form||line)+(Number(activePartnerSlot())===slot?' · following':''):(line?'form not owned':'empty slot');
  const state=act?act.label:(owned?'RESTING':'—');
  const goto=(!owned||!act)?'':act.cls==='is-grinding'||act.cls==='is-pvp'?'pve':'gym';
  html+='<button type="button" class="sap-party-row '+(act?act.cls:'is-idle')+(Number(activePartnerSlot())===slot?' is-active':'')+'"'+(goto?' data-party-goto="'+goto+'"':' disabled')+' data-activity-slot="'+slot+'"><b>'+escape(label)+'</b><small>'+escape(meta)+'</small><span class="sap-state">'+escape(state)+'</span></button>';
 }
 return html+'</div>';
}
function gymPanelMarkup(){const info=gymPanelPartner(),training=worldTraining;let html=partnerPickerMarkup('gym');if(!info){html+='<p class="sap-empty">Hatch and choose an owned partner in DigiPet first.</p>';return html}const{G,line,p}=info,total=G.total(p),session=training&&training.slot===info.slot?training:null;html+='<div class="sap-stats">';
for(const stat of G.STATS){const have=Math.max(0,Math.min(12,Number(p.stats?.[stat])||0)),full=have>=12||total>=24,active=session&&session.stat===stat,dis=full||!!training;html+='<div class="sap-stat'+(active?' is-active':'')+'"><span class="sap-stat-name">'+escape(sanctuaryName(stat))+'</span><b class="sap-stat-points">'+have+'/12</b><button type="button" data-gym-stat="'+escape(stat)+'"'+(dis?' disabled':'')+'>'+(active?'Training':'Train')+'</button></div>'}
html+='</div><small class="sap-total">'+total+'/24 total points</small>';
if(training&&!session)html+='<p class="sap-note" role="status">Partner '+(training.slot+1)+' is training '+escape(sanctuaryName(training.stat))+' in the gym ('+gymClock(Math.max(0,G.DURATION-(training.elapsed||0)))+' left). Stop it there to train this partner.</p>';
if(session)html+='<div class="sap-status" role="status"><b>'+escape(sanctuaryName(session.stat))+' training</b><small>every 5 minutes · +1 point</small><span id="sapCountdown">'+(session.phase==='active'?gymClock(Math.max(0,G.DURATION-(session.elapsed||0)))+' left':'…')+'</span><small>'+(session.completed||0)+' done</small><button type="button" data-gym-stop class="sap-stop">Stop</button></div>';
else html+='<p class="sap-lead">Pick a training stat below. No need to walk to the station you want - every stat trains from anywhere in the gym.</p>';
return html}
function pvePanelMarkup(){const G=globalThis.PGDigimonBattle,slot=activitySlot('pve'),profile=battleProfileFor(slot),run=myPve()||soloPve;let html=partnerPickerMarkup('pve');html+='<p class="sap-lead">'+(profile?escape(sanctuaryName(profile.form))+' trains itself in the middle field. Loot, petgold and Digi-Eggs are yours.':'Hatch and choose an owned partner in DigiPet first.')+'</p>';
const raid=run&&run.mode==='boss';
if(run)html+='<div class="sap-status'+(raid?' is-raid':'')+'" role="status"><b>'+(run.party?'PARTY':'SOLO')+' · '+(raid?'BOSS RAID':'GRINDING')+(G&&!raid?' · STAGE '+(G.stageOf?.(run.wave)||1):'')+'</b><small>The battle card at the top of the plaza tracks HP, loot and the boss charge.</small><button type="button" data-pve-stop class="sap-stop">'+(raid?'Forfeit raid':'Stop grinding')+'</button></div>';
else if(profile)html+='<p class="sap-note">Start a field run, or challenge the boss: one long fight with charges, a shield phase, enrage and backup adds.</p>';
html+='<div class="sap-pve-action"></div>';
if(!run&&profile)html+='<button type="button" class="sap-pve-boss" data-sap-pve-boss>☠ Boss raid · one long fight, richer loot</button>';
return html}
function logsPanelMarkup(){let html='<div class="sap-logs-head"><small>SESSION LOG</small><button type="button" class="sap-logs-clear" data-sap-clear-logs>Clear</button></div>';
if(!activityLog.length)return html+'<p class="sap-empty">Nothing yet this session - training points, grind results and DigiPet notices will collect here.</p>';
html+='<ul class="sap-logs">';for(let i=activityLog.length-1;i>=0;i--){const e=activityLog[i],d=new Date(e.at),hh=String(d.getHours()).padStart(2,'0'),mm=String(d.getMinutes()).padStart(2,'0'),ss=String(d.getSeconds()).padStart(2,'0');html+='<li><time>'+hh+':'+mm+':'+ss+'</time><span>'+escape(e.text)+'</span></li>'}return html+'</ul>'}
/* v384: the Party and PvE tabs print the run's kind and stage ("SOLO · GRINDING · STAGE 2"), so both keys
   carry them; the key used to say only run/idle and the line kept its first value for the whole run. */
function activityRunKey(){const run=myPve()||soloPve;return run?'run:'+(run.party?'party':'solo')+':'+(run.mode==='boss'?'boss':(globalThis.PGDigimonBattle?.stageOf?.(run.wave)||1)):'idle'}
function activityPanelKey(){if(sapTab==='party')return 'party:'+worldTraining?.slot+':'+(worldTraining?.stat||'')+':'+(battleBusySlot()??'')+':'+activityRunKey()+':'+(myPvp()?'pvp':'')+':'+activitySlot('gym')+':'+activitySlot('pve');if(sapTab==='logs')return 'logs:'+activityLog.length;if(sapTab==='training'){const info=gymPanelPartner(),t=worldTraining,stats=info?[info.p.stats.power,info.p.stats.guard,info.p.stats.agility,info.p.stats.focus,info.G.total(info.p)].map(Number).join(','):'none';return 'training:'+stats+':'+(t?[t.stat,t.slot,t.phase,t.completed].join(','):'idle')+':'+activitySlot('gym')}const slot=activitySlot('pve'),profile=battleProfileFor(slot);return 'pve:'+(profile?profile.slot+':'+profile.form+':'+profile.level:'none')+':'+activityRunKey()}
function syncPanelTabs(){for(const btn of sapTabButtons){const on=btn.dataset.sapTab===sapTab;btn.setAttribute('aria-selected',String(on));btn.classList.toggle('is-selected',on)}}
/* The content is refreshed even while the panel is hidden, so the live session's Stop control always exists
   in the document (tests and - more importantly - the one-click gym flow rely on it). Visibility stays
   governed by proximity in worldNearbyFrame. */
function renderActivityPanel(force){const key=activityPanelKey();if(!force&&activityPanel.dataset.key===key)return;activityPanel.dataset.key=key;syncPanelTabs();
if(sapTab==='party'){sapTitle.textContent='DigiPet · Party';sapBodyEl.innerHTML=partyPanelMarkup();sapNoteEl.textContent='All four partners at a glance — training, grinding or resting.'}
else if(sapTab==='training'){sapTitle.textContent='DigiPet · Training';sapBodyEl.innerHTML=gymPanelMarkup();sapNoteEl.textContent='Sessions cap at 12 per stat, 24 in total.'}
else if(sapTab==='pve'){sapTitle.textContent='DigiPet · PvE grind';sapBodyEl.innerHTML=pvePanelMarkup();const bossBtn=sapBodyEl.querySelector('[data-sap-pve-boss]');if(bossBtn)bossBtn.onclick=()=>startPve('boss');sapNoteEl.textContent='Stops on defeat or a completed field run.'}
else{sapTitle.textContent='DigiPet · Log';sapBodyEl.innerHTML=logsPanelMarkup();sapNoteEl.textContent='Every notice above the plaza, kept for this session.'}
sapRepeatWrap.hidden=sapTab==='logs';sapRepeatEl.checked=plazaRepeat(sapTab==='pve'?'pve':'gym');homeBattleNearby();syncActivityCountdown()}
function syncActivityCountdown(){if(sapTab!=='training')return;const t=worldTraining,left=$id('sapCountdown');if(!left)return;const session=t&&t.slot===activitySlot('gym')?t:null;left.textContent=!session?'':(session.phase==='active'?gymClock(Math.max(0,PGDigimonSanctuary.DURATION-(session.elapsed||0))):'…')}
activityPanel.addEventListener('click',e=>{if(e.target.closest('#sapMin')||e.target.closest('#sapClose')){dismissActivityPanel();return}const tab=e.target.closest('[data-sap-tab]');if(tab){sapTab=tab.dataset.sapTab;renderActivityPanel(true);return}const clear=e.target.closest('[data-sap-clear-logs]');if(clear){activityLog.length=0;renderActivityPanel(true);return}const partyRow=e.target.closest('[data-party-goto]');if(partyRow&&!partyRow.disabled){setActivitySlot(partyRow.dataset.partyGoto,Number(partyRow.dataset.activitySlot));sapTab=partyRow.dataset.partyGoto==='gym'?'training':'pve';renderActivityPanel(true);return}
const pick=e.target.closest('[data-activity-slot]');if(pick&&!pick.disabled){setActivitySlot(pick.dataset.kind,Number(pick.dataset.activitySlot));return}const pveStop=e.target.closest('[data-pve-stop]');if(pveStop){clearPveRepeat();stopPve();renderActivityPanel(true);return}const stop=e.target.closest('[data-gym-stop]');if(stop){cancelWorldTraining();return}const btn=e.target.closest('[data-gym-stat]');if(!btn||btn.disabled)return;startWorldTraining(btn.dataset.gymStat)});
function openActivityPanel(tab,auto=false){if(tab)sapTab=tab;sapAutoArea=auto?sapAreaNow:'';activityPanel.hidden=false;renderActivityPanel(true);syncDigipetDock()}
function closeActivityPanel(){activityPanel.hidden=true;activityPanel.dataset.key='';sapAutoArea='';homeBattleNearby();syncDigipetDock()}
// v373 (owner: "the panel on the right needs a simple version of training or grinding") asked for a one-line
// version of the panel. v384: that simple version is the dock chip - what is running, how long is left, and
// Stop - so minimizing (-) and closing (x) both hand over to it, and neither lets the panel pop back while the
// player stays where they are.
function dismissActivityPanel(){sapDismissedArea=sapAreaNow;closeActivityPanel()}
/* Called after a run ends. The first run still has to be started from the middle field, but the
   server grants that connected session a repeat permit: subsequent runs may begin while the avatar
   visits the gym, pond or plaza. No socket means no authority and the chain ends immediately. */
function repeatPveRun(delay=1800){if(pveRepeatTimer||!plazaRepeat('pve'))return;pveRepeatTimer=setTimeout(()=>{pveRepeatTimer=0;if(!plazaRepeat('pve')||battleBusy()||trainingSlotBusy()||!battleProfileFor(activitySlot('pve')))return;startPve(lastPveMode,true)},delay)}
function clearPveRepeat(){clearTimeout(pveRepeatTimer);pveRepeatTimer=0}
const BATTLE_INTENT_MS=10000;
function soloPractice(){return !app.room&&!CLOUD.on}
function myPve(){const id=app.room?app.id:SOLO_ID;return app.battle.pve.find(r=>r.owner===id||(Array.isArray(r.members)&&r.members.includes(id)))||null}
function myPvp(){const m=app.battle.pvp;return m&&m.participants?.some(p=>p.id===app.id)?m:null}
// v355: waiting in the PvP matchmaking queue is a visible, cancellable activity. Before this,
// a queued player saw an idle UI while the server refused every other action with
// "Finish the current DigiPet activity first" — and had no control to leave the queue.
function myQueue(){return (app.battle.queue||[]).find(q=>q.id===app.id)||null}
function battleBusy(){return !!(myPve()||myPvp()||myQueue()||battleOffer||app.battleIntent)}
// The partner slot currently in a field or ring battle, if any. Only that slot is barred
// from gym training, care edits and evolution while the battle runs.
function battleBusySlot(){
 const run=myPve();if(run){
  if(run.party&&Array.isArray(run.slots)){const mine=run.slots.find(x=>x&&x.id===(app.room?app.id:SOLO_ID));if(mine)return Number.isInteger(mine.slot)?mine.slot:0}
  // v384: run.slot is the field LANE the room parked this run in (0-7), not a partner slot. Reading
  // it marked partner 1 busy whenever any partner fought in the first lane.
  return run.profile?.slot??0;
 }
 if(soloPve)return soloPve.profile?.slot??0;
 // A ring snapshot carries the partner's line but no slot: resolve it, preferring the slot that entered.
 const m=myPvp(),me=m&&m.participants?.find(p=>p.id===app.id);return me?battleRewardSlot(me.profile?.lineId,app.pvpSlot):null;
}
/* v372: this guard used to mean "the followed partner is in the gym". With per-activity partners
   it means "the PvE-chosen partner is in the gym" - the followed partner may train, battle or
   walk anywhere without blocking local grinding. */
function trainingSlotBusy(){return !!(worldTraining&&worldTraining.slot===activitySlot('pve'))}
function battleProfileFor(slot=activePartnerSlot()){const G=globalThis.PGDigimonSanctuary,line=partnerLine(slot);return G&&line&&ownsDigimon(line)?G.combatProfile(partnerData(slot),line,slot,petBag()):null}
function battleNearbyFrame(player){
 const p=player&&!player.sit&&!player.path?.length?player:null;let action='',label='';
 const pveSlot=activitySlot('pve'),line=partnerLine(pveSlot),bag=typeof S==='object'&&S?S.digimonBag:null,hasPartner=!!(line&&Array.isArray(bag?.owned)&&bag.owned.includes(line));
 if(p&&!trainingSlotBusy()&&!battleBusy()&&hasPartner){
if(Math.abs(p.x-70)<=25&&Math.abs(p.z-64)<=16){action='pve';label=soloPractice()?'Start solo grinding':'Start auto-grinding'}
 else {const r=R.SANCTUARY_RING;if(Math.abs(p.x-r.x)<=r.w/2+6&&p.z>=r.z-r.d/2-2&&p.z<=r.z+r.d/2+11&&Math.abs(p.x-r.x)>.1){action='pvp';label=soloPractice()?'Online PvP only':'Enter PvP ring'}}
 }
 worldBattleNearby.hidden=!action;worldBattleNearby.dataset.battleAction=action;worldBattleNearby.textContent=label;
 homeBattleNearby();
}
function refreshBattleNearby(){battleNearbyFrame(app.players.get(app.room?app.id:SOLO_ID)||null)}
/* The PvE start button lives inside the PvE tab of the activity panel. v384: whenever that tab is not
   on screen (panel closed, or showing another tab) the button joins the centre column as a prompt,
   next to the gym and ring prompts - it used to float at a fixed height over whatever was there. */
function homeBattleNearby(){const host=worldBattleNearby.dataset.battleAction==='pve'&&!activityPanel.hidden&&sapTab==='pve'?sapBodyEl.querySelector('.sap-pve-action'):null,home=host||hudStack;if(worldBattleNearby.parentElement!==home)home.append(worldBattleNearby)}
worldBattleNearby.onclick=()=>{const action=worldBattleNearby.dataset.battleAction;if(action==='pve')startPve();else if(action==='pvp')startPvp()};
let localPvePermit=null;
function syncSoloBattle(){
 const B=globalThis.PGDigimonBattle,mine=soloPve&&B?B.pveSnapshot(soloPve):null;
 const others=(app.battle.pve||[]).filter(r=>!mine||(r.id!==mine.id&&r.owner!==mine.owner));
 app.battle.pve=mine?[mine,...others]:others;app.scene?.setBattleState?.(app.battle);renderBattleHUD();refreshBattleNearby();
}
function startSoloPve(profile,boss=false,repeatResume=false){
 const B=globalThis.PGDigimonBattle,selfId=app.room?app.id:SOLO_ID,source=app.players.get(selfId),player=source?R.advance({...source,path:(source.path||[]).map(p=>({...p}))},performance.now()):null,p=B?.profile(profile);
 if(!B||!p)return worldNotice('DigiPet combat is unavailable in this copy.');
 const permitOk=repeatResume&&localPvePermit&&localPvePermit.lineId===p.lineId&&localPvePermit.form===p.form&&localPvePermit.slot===p.slot&&localPvePermit.mode===(boss?'boss':'grind');
 if(!permitOk&&(!player||player.sit||player.path?.length||Math.abs(player.x-70)>25||Math.abs(player.z-64)>16))return worldNotice('Walk to the middle DigiPet farm and stand still first.');
 const now=Date.now();soloPve=B.createPve({id:'solo-pve:'+now.toString(36)+':'+(++battleRequest),owner:selfId,room:app.room||0,profile:p,now,bossMode:!!boss});soloPve.localOwner=S;soloPve.localAccount=typeof currentUser==='string'?currentUser:null;localPvePermit={lineId:p.lineId,form:p.form,slot:p.slot,mode:boss?'boss':'grind'};app.battleIntent=null;syncSoloBattle();worldNotice(boss?'Boss raid on your device — the plaza is not billed per hit.':'Grinding on your device — loot is saved here; the plaza stays light.');
}
function stopSoloPve(reason='stopped',notify=true){
 if(!soloPve)return false;soloPve=null;clearPveRepeat();if(!plazaRepeat('pve'))localPvePermit=null;
 const others=(app.battle.pve||[]).filter(r=>r&&String(r.id||'').indexOf('solo-pve:')!==0);app.battle.pve=others;app.scene?.setBattleState?.(app.battle);renderBattleHUD();refreshBattleNearby();renderActivityPanel(true);
 if(notify)worldNotice(reason==='defeat'?'Your partner fainted. Rest and try again.':reason==='exhausted'?'Grinding stopped: your partner is out of energy.':reason==='complete'?'Run complete.':'Solo grinding stopped.');return true;
}
function tickSoloPve(){
 const run=soloPve;if(!run)return;if(typeof S!=='object'||S!==run.localOwner||run.localAccount!==(typeof currentUser==='string'?currentUser:null)){stopSoloPve('stopped',false);return}
 if(typeof CLOUD!=='undefined'&&CLOUD.updating)return;
 const result=globalThis.PGDigimonBattle?.stepPve(run,Date.now(),run.rng);if(!result)return;let end='';
 const self=app.room?app.id:SOLO_ID,idx=Array.isArray(run.members)?run.members.indexOf(self):-1,prof=(idx>=0&&run.profiles[idx])||run.profile;
 for(const event of result.events){if(String(event.type).startsWith('boss_'))bossFxNotice(event);if(event.type==='wave_clear')receiveBattleReward({local:true,kind:'pve',battleId:run.id+':wave'+event.wave+':'+(prof.slot||0),lineId:prof.lineId,form:prof.form,slot:prof.slot,wave:event.wave,reward:{...event.reward},earned:{...run.earned},gearDrop:event.gearDrop||null});if(event.type==='hit')app.scene?.battleEvent?.({kind:'pve',battleId:run.id,to:event.to,amount:event.amount,crit:!!event.crit});if(event.type==='end')end=event.reason}
 if(end){if(run.clientParty&&app.room)send({type:'pve_stop'});stopSoloPve(end);if(!run.clientParty)repeatPveRun()}else syncSoloBattle();
}
let clientPvp=null;
function beginClientPve(m){
 const B=globalThis.PGDigimonBattle;if(!B||!Array.isArray(m.profiles))return;
 const rng=B.rngFromSeed(m.seed);
 soloPve=B.createPve({id:m.battleId,owner:m.owner,room:app.room||0,profiles:m.profiles,now:m.now||Date.now(),random:rng,bossMode:m.mode==='boss'});
 soloPve.members=Array.isArray(m.members)?m.members:[];soloPve.rng=rng;soloPve.clientParty=true;soloPve.localOwner=S;soloPve.localAccount=typeof currentUser==='string'?currentUser:null;
 app.battleIntent=null;syncSoloBattle();worldNotice('Party grind on your devices — the plaza is not billed per hit.');
}
function beginClientPvp(m){
 const B=globalThis.PGDigimonBattle;if(!B||!Array.isArray(m.players)||m.players.length!==2)return;
 const rng=B.rngFromSeed(m.seed);
 clientPvp=B.createPvp({id:m.battleId,room:app.room,now:m.now||Date.now(),players:m.players});
 clientPvp.rng=rng;clientPvp.clientSim=true;clientPvp.participants.forEach(p=>p.accepted=true);clientPvp.phase='countdown';clientPvp.countdownUntil=m.startsAt||Date.now()+3000;
 battleOffer=null;app.battle.pvp=B.pvpSnapshot(clientPvp);app.scene?.setBattleState?.(app.battle);renderBattleHUD();renderPvpDialog();
}
function tickClientPvp(){
 const match=clientPvp,B=globalThis.PGDigimonBattle;if(!match||!B)return;
 const result=B.stepPvp(match,Date.now(),match.rng);if(!result)return;
 for(const event of result.events){if(event.type==='hit')app.scene?.battleEvent?.({kind:'pvp',battleId:match.id,to:event.to,amount:event.amount,crit:!!event.crit});if(event.type==='result'){send({type:'pvp_client_end',battleId:match.id,winnerId:match.winnerId,reason:match.reason});receiveBattleResult({kind:'pvp',battleId:match.id,winnerId:match.winnerId,reason:match.reason,lineId:match.participants.find(p=>p.id===app.id)?.profile?.lineId,form:match.participants.find(p=>p.id===app.id)?.profile?.form,slot:match.participants.find(p=>p.id===app.id)?.profile?.slot,outcome:match.winnerId===app.id?'win':match.winnerId==null?'draw':'lose',reward:(B.pvpRewards(match)||{})[app.id]});clientPvp=null;return}}
 app.battle.pvp=B.pvpSnapshot(match);app.scene?.setBattleState?.(app.battle);renderBattleHUD();
}
// v382: 'boss' starts a raid — one long boss instead of a field run. The choice is remembered so
// "Keep repeating" repeats the same kind of fight.
let lastPveMode='grind';
function startPve(mode='grind',repeatResume=false){
 const boss=mode==='boss';lastPveMode=boss?'boss':'grind';
 if(trainingSlotBusy())return worldNotice('The grind partner is in the gym. Switch the PvE grind partner or stop that session first.');
 if(battleBusy())return worldNotice('Finish the current DigiPet activity first.');
 const profile=battleProfileFor(activitySlot('pve'));if(!profile)return worldNotice('Hatch and choose an owned partner first.');
 // v388: solo grind always runs on this device so the plaza Durable Object is not woken per hit.
 return startSoloPve(profile,boss,repeatResume===true);
}
function startPvp(){
 if(trainingSlotBusy())return worldNotice('The grind partner is in the gym. Switch the PvE grind partner or stop that session first.');
 if(battleBusy())return worldNotice('Finish the current DigiPet activity first.');
 if(soloPractice())return worldNotice('Two-player PvP needs an online plaza. Solo practice is available in the middle field.');
 if(!app.room||!app.connected||app.socket?.readyState!==1)return worldNotice('Enter an online plaza to challenge another player.');
 const profile=battleProfileFor(activitySlot('pve'));if(!profile)return worldNotice('Hatch and choose an owned partner first.');
 app.pvpSlot=profile.slot;refreshCompanionLook(profile.slot);
 const request=++battleRequest;app.battleIntent={kind:'pvp',request,at:Date.now()};if(send({type:'pvp_enter',request,profile})){worldNotice('Waiting for a player on the opposite side of the ring…');worldBattleNearby.hidden=true}else app.battleIntent=null;
}
function stopPve(){if(soloPve)stopSoloPve();else if(app.room&&app.connected)send({type:'pve_stop'})}
function stopPvp(){if(myPvp()||battleOffer||myQueue())send({type:'pvp_cancel'})}
// v382: one notice per boss mechanic, shared by local solo runs and relayed room events.
function bossFxNotice(fx){
 if(!fx)return;
 if(fx.type==='boss_tell')worldNotice('☠ The boss is winding up a slam — every partner takes it.',false,false);
 else if(fx.type==='boss_slam')worldNotice('☠ The boss SLAMS the whole field.',false,false);
 else if(fx.type==='boss_enrage')worldNotice('🔥 The boss is ENRAGED — it hits harder now.',false,false);
 else if(fx.type==='boss_shield')worldNotice(fx.on?'🛡 The boss raises a barrier — your hits land softer.':'The boss barrier falls.',false,false);
 else if(fx.type==='boss_summon')worldNotice('The boss calls in backup!',false,false);
}
function battleMechLine(run,G){
 const mech=run&&run.mech&&(run.enemies||[]).some(e=>e.boss&&e.hp>0)?run.mech:null;if(!mech)return '';
 const adds=(run.enemies||[]).filter(e=>!e.boss&&e.hp>0).length;
 const tick=(G&&G.TICK_MS)||650;
 let out='';
 if(mech.slamIn>0)out+='<b class="mech-slam">☠ SLAM '+((mech.slamIn*tick)/1000).toFixed(1)+'s</b>';
 if(mech.shieldPulses>0)out+='<b class="mech-shield">🛡 SHIELD '+mech.shieldPulses+'</b>';
 if(mech.enraged)out+='<b class="mech-enrage">🔥 ENRAGED</b>';
 if(adds)out+='<b class="mech-add">+'+adds+' adds</b>';
 return out?'<small class="battle-mech">'+out+'</small>':'';
}
function renderBattleHUD(){
 const run=myPve(),match=myPvp(),waiting=myQueue();let html='',key='';
 if(run){
  const G=globalThis.PGDigimonBattle,stage=G?.stageOf?.(run.wave)||1+Math.floor(((run.wave||1)-1)/5),inWave=((run.wave||1)-1)%5+1,bossWave=!!G?.isBossWave?.(run.wave);
  const raid=run.mode==='boss',mech=run.mech||{},mechKey=mech?(mech.slamIn||0)+','+(mech.shieldPulses||0)+','+(mech.enraged?1:0)+','+(mech.summons||0)+','+(run.enemies||[]).filter(e=>e.hp>0).length:'';
  key='pve:'+run.id+':'+run.wave+':'+run.phase+':'+run.partner?.hp+':'+run.earned?.coins+':'+run.earned?.dropCoins+':'+run.earned?.eggs+':'+(run.earned?.gear||0)+':'+mechKey;
  const partyLine=run.party&&Array.isArray(run.members)?'<small>'+run.members.map(id=>id===(app.room?app.id:SOLO_ID)?'You':((app.players.get(id)||{}).name||'Trainer')).join(' \u00b7 ')+'</small>':'';
  const title=raid?'☠ BOSS RAID':bossWave?'STAGE '+stage+' · BOSS FIGHT':'AUTO-GRINDING · STAGE '+stage+' · WAVE '+inWave+'/5';
  html=`<div class="sanctuary-battle-hud-card${bossWave||raid?' is-boss':''}"><div class="battle-hud-text"><strong>⚔ ${soloPve?'SOLO · ':''}${run.party?'PARTY · ':''}${title}</strong><span>${run.phase==='between'?'Next group incoming…':escape(sanctuaryName(run.partner?.form))+' · HP '+Math.max(0,run.partner?.hp||0)+'/'+Math.max(1,run.partner?.maxHp||1)}</span>${battleMechLine(run,G)}<small>${soloPve?'Local practice · ':''}${run.enemies?.filter(e=>e.hp>0).length||0} ${bossWave||raid?'boss':'bots'} remaining</small><small class="battle-loot">◈ ${run.earned?.coins||0} petgold${run.earned?.dropCoins?` (${run.earned.dropCoins} bonus)`:''} · 🥚 ${run.earned?.eggs||0} Digi-Eggs${run.earned?.gear?` · ⚙ ${run.earned.gear} gear`:''}</small>${partyLine}</div><button type="button" data-battle-stop="pve">${raid?'Forfeit raid':'Stop grinding'}</button></div>`}
 else if(match&&['countdown','fighting'].includes(match.phase)){key='pvp:'+match.id+':'+match.phase;html=`<div class="sanctuary-battle-hud-card"><div class="battle-hud-text"><strong>⚔ RING MATCH</strong><span>${match.phase==='countdown'?'Both trainers accepted.':'Auto-battle in progress.'}</span><small>Server-settled · no manual attacks</small></div><button type="button" data-battle-stop="pvp">${match.phase==='fighting'?'Forfeit match':'Cancel match'}</button></div>`}
 else if(waiting){key='queue:'+waiting.id;html=`<div class="sanctuary-battle-hud-card"><div class="battle-hud-text"><strong>⚔ WAITING FOR OPPONENT</strong><span>Standing by the ${waiting.side==='left'?'left':'right'} side of the ring.</span><small>Someone must stand on the other side to start the match</small></div><button type="button" data-battle-stop="pvp">Leave queue</button></div>`}
 battleHUD.hidden=!html;if(html&&battleHUD.dataset.key!==key){battleHUD.dataset.key=key;battleHUD.innerHTML=html}if(!html)battleHUD.dataset.key='';
 // v384: an online run starts and ends with a room snapshot, not a click, so the open Party / PvE tab is
 // re-checked here (keyed - nothing is rebuilt unless the run itself changed).
 if(!activityPanel.hidden&&(sapTab==='pve'||sapTab==='party'))renderActivityPanel();
 syncDigipetDock();
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
function battleSnapshot(m){if(m.room!==app.room)return;app.battle.pvp=m.pvp||null;app.battle.queue=Array.isArray(m.queue)?m.queue:[];const self=app.room?app.id:SOLO_ID,incoming=Array.isArray(m.pve)?m.pve:[];if(soloPve&&incoming.some(r=>r&&r.owner===self&&String(r.id||'').indexOf('solo-pve:')!==0))stopSoloPve('stopped',false);const mine=soloPve&&globalThis.PGDigimonBattle?globalThis.PGDigimonBattle.pveSnapshot(soloPve):null;const others=incoming.filter(r=>!mine||(r.owner!==mine.owner&&r.id!==mine.id));app.battle.pve=mine?[mine,...others]:others;if(Number.isFinite(m.at))app.battleOffset=m.at-Date.now();battleOffer=null;app.scene?.setBattleState?.(app.battle);renderBattleHUD();renderPvpDialog();refreshBattleNearby();if(app.battleIntent&&app.battleIntent.kind==='pvp')app.battleIntent=null}
function battleUITick(){tickSoloPve();tickClientPvp();if(++mapTickFrame%4===0)mapTick();
 if(app.partyInvite&&Number.isFinite(app.partyInvite.expiresAt)&&Date.now()>app.partyInvite.expiresAt+500){app.partyInvite=null;renderPartyPanel()}
 if(!$id('socialPartyPanel').hidden){const roster=(app.partyRoster||[]).map(p=>p.id+':'+(p.members||[]).join(',')).join('|');const key=(app.party?app.party.members.map(m=>m.id).join(','):'none')+'#'+((app.battle.queue||[]).map(q=>q.id+q.side).join(','))+'#'+(app.partyInvite?app.partyInvite.partyId:'')+'#'+roster+'#'+partyCandidates().length;if(battleUITick.partyKey!==key){battleUITick.partyKey=key;renderPartyPanel()}}if(app.battleIntent&&Date.now()-(app.battleIntent.at||0)>=BATTLE_INTENT_MS){app.battleIntent=null;worldNotice('The plaza battle service did not respond. Reconnect, or use a preview with the matching Social Worker deployment.')}const match=myPvp();if(match?.phase==='countdown'){const el=$id('pvpCountdownNumber');if(el){const left=Math.max(0,Math.ceil((match.countdownUntil-(Date.now()+app.battleOffset))/1000));el.textContent=left>0?left:'FIGHT!'}}}
setInterval(battleUITick,100);
/* v383: the activity meter follows a grind/PvP bout as well as a gym session. v384: the dock is
   refreshed by every battle snapshot (renderBattleHUD), every notice, and the 400 ms map tick
   (syncFieldMonitor) - no timer of its own. */
function worldNotice(text,active=false,log=true){if(log)pushActivityLog(text);worldTrainingText.textContent=text;worldTrainingCancel.hidden=!active;clearTimeout(worldNoticeTimer);/* the running session is the dock's gym chip; this bar keeps transient notices only */const chipUp=active&&worldTraining&&!hub.classList.contains('has-management');worldTrainingHUD.hidden=!!chipUp;syncDigipetDock();if(chipUp)return;if(!active)worldNoticeTimer=setTimeout(()=>{if(!worldTraining)worldTrainingHUD.hidden=true},5500)}
function refreshGymVisuals(){if(app.scene?.setGymResidents)app.scene.setGymResidents(app.room?gymEntries:(worldTraining?.phase==='active'&&worldTraining.room===0?[{owner:0,room:0,stat:worldTraining.stat,slot:worldTraining.equipment,species:worldTraining.species}]:[]))}
function cancelWorldTraining(reason='Gym training stopped.'){
 if(!worldTraining)return;const t=worldTraining;worldTraining=null;if(t.room&&app.socket?.readyState===1)send({type:'gym_stop'});refreshGymVisuals();refreshCompanionLook();worldNotice(reason);if(!sanctuaryPanel.hidden){sanctuarySync();sanctuaryRender()}renderActivityPanel(true)
}
worldTrainingCancel.onclick=()=>cancelWorldTraining();
worldNearby.onclick=()=>{if(worldNearbyStat) startWorldTraining(worldNearbyStat);};
function activityArea(p){return !p?'':R.inGymArea&&R.inGymArea(p.x,p.z)?'training':nearFarm(p)?'pve':''}
function worldNearbyFrame(player){
 // worldNearby training button (v372 keep + our inGymArea rect fix)
 {
  const inGym=player&&!player.sit&&!player.path?.length&&R.inGymArea&&R.inGymArea(player.x,player.z);
  let stat='';
  if(inGym&&!worldTraining&&worldTrainingHUD.hidden){
   const nearest=Object.entries(TRAIN_STATIONS).map(([s,p])=>({stat:s,d:Math.hypot(player.x-p.x,player.z-p.z)})).sort((a,b)=>a.d-b.d)[0];
   stat=nearest?nearest.stat:'power';
  }
  if(stat!==worldNearbyStat){worldNearbyStat=stat;worldNearby.hidden=!stat;if(stat)worldNearby.textContent='🏋️ Train in Gym · '+sanctuaryName(stat)}
 }
 /* v372: stepping into the gym or the middle field opens the activity panel on that area's tab.
    v384 (owner: "the panel keeps coming back and jumps to another tab"): it used to be forced open
    for as long as a session ran, forced onto the area's tab every frame, closed the moment the
    player took a step, and its minimize button did not count as closing. Now: standing still in
    an area opens it once; it stays while the player walks around inside the area and closes when
    they leave; a panel closed by hand (- or x) stays closed until they leave and come back; a
    panel opened from the dock is the player's and is never closed for them; and nothing changes
    the tab they chose. A running session is always visible on its dock chip instead. */
 {
  const area=activityArea(player),changed=area!==sapAreaNow;sapAreaNow=area;
  if(sapDismissedArea&&sapDismissedArea!==area)sapDismissedArea='';
  if(sapAutoArea&&sapAutoArea!==area){if(activityPanel.hidden)sapAutoArea='';else closeActivityPanel()}
  if(area&&activityPanel.hidden&&sapDismissedArea!==area&&player&&!player.sit&&!player.path?.length)openActivityPanel(area,true);
  else if(changed)syncDigipetDock();
 }
 battleNearbyFrame(player);
}
function gymClock(ms){const seconds=Math.max(0,Math.ceil(ms/1000));return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')}
function beginWorldTraining(equipment){const t=worldTraining;if(!t||!R.GYM_STATIONS[t.stat]?.[equipment])return;t.equipment=equipment;t.phase='active';t.last=Date.now();t.elapsed=0;t.completed=0;worldNotice(sanctuaryName(t.stat)+' auto-training · '+gymClock(PGDigimonSanctuary.DURATION)+(t.room?'':' · local solo'),true);refreshCompanionLook();refreshGymVisuals();if(!sanctuaryPanel.hidden)sanctuaryRender();renderActivityPanel(true)}
function startWorldTraining(stat){
 const blocked=CLOUD.signingOut||CLOUD.lost||CLOUD.gate||(typeof cloudReplaced!=='undefined'&&cloudReplaced),named=typeof currentUser==='string'&&currentUser;
 const online=!blocked&&named&&CLOUD.on&&app.room&&app.connected&&app.socket?.readyState===1,local=!blocked&&named&&!CLOUD.on&&!app.room;
 if(!online&&!local)return worldNotice('Connect to an online plaza, or use a local character, to train a partner.');
 const G=globalThis.PGDigimonSanctuary,station=TRAIN_STATIONS[stat],source=app.players.get(app.room?app.id:SOLO_ID),player=source?R.advance({...source,path:(source.path||[]).map(p=>({...p}))},performance.now()):null,slot=activitySlot('gym'),line=partnerLine(slot);
 if(worldTraining)return worldNotice('Only one partner can use the gym at a time.',true);
 {const busy=battleBusySlot();if(busy!=null&&busy===slot)return worldNotice('That partner is already in a field or ring battle.');}
 if(!G||!station||!G.ROSTER.includes(line)||!ownsDigimon(line))return worldNotice('Hatch and choose an owned companion in DigiPet first.');
 if(!player||player.sit||player.path?.length||!R.inGymArea(player.x,player.z))return worldNotice('Walk into the gym and stand still first.');
 const probe=G.act(partnerData(slot),line,{type:'train',stat},Date.now());if(probe.changed&&!probe.ok&&probe.state){setPartnerData(slot,probe.state);if(typeof save==='function')save()}if(!probe.ok)return worldNotice(probe.message);
 worldTraining={stat,line,slot,request:++gymSerial,owner:S,account:typeof currentUser==='string'?currentUser:null,room:app.room,species:G.species(partnerData(slot),line),phase:'pending'};
 if(app.room){if(!send({type:'gym_start',stat,species:worldTraining.species,slot,request:worldTraining.request})){worldTraining=null;return worldNotice('Could not reserve gym equipment. Try again.')}worldNotice('Reserving equipment…',true);renderActivityPanel(true)}else beginWorldTraining(0);
}
function worldTrainingTick(){
 const t=worldTraining;if(!t)return;if(typeof S!=='object'||S!==t.owner||(t.account!==(typeof currentUser==='string'?currentUser:null))||partnerLine(t.slot)!==t.line){cancelWorldTraining('Gym training stopped because the partner or account changed.');return}
 if(t.room&&(!CLOUD.on||CLOUD.signingOut||CLOUD.lost||CLOUD.gate||(typeof cloudReplaced!=='undefined'&&cloudReplaced)||!app.connected||!app.socket||app.socket.readyState!==1)){cancelWorldTraining('Gym training stopped after disconnection.');return}
 if(!t.room&&(app.room||CLOUD.on)){cancelWorldTraining('Local gym practice stopped after connecting online.');return}
 if(t.phase!=='active')return;
 if(typeof CLOUD!=='undefined'&&CLOUD.updating){t.last=Date.now();return}
 const now=Date.now(),delta=Math.max(0,now-t.last);t.last=now;t.elapsed+=delta;
 // Each completion is applied once. Excess elapsed time is bounded by the existing
 // energy/stat caps, so a throttled online tab cannot run an unbounded loop.
 while(t.elapsed>=PGDigimonSanctuary.DURATION&&worldTraining===t){t.elapsed-=PGDigimonSanctuary.DURATION;const result=PGDigimonSanctuary.completeWorldTraining(partnerData(t.slot),t.line,t.stat,now);if(result.changed&&result.state){setPartnerData(t.slot,result.state);if(typeof save==='function')save()}if(!result.ok){cancelWorldTraining(result.message+' Gym training stopped.');return}t.completed++;pushActivityLog('Partner '+(t.slot+1)+' · '+sanctuaryName(t.stat)+' session complete · +1 point ('+t.completed+' this session)');if(!plazaRepeat('gym')){cancelWorldTraining(result.message+' Session complete. Keep repeating is off for the gym.');return}const next=PGDigimonSanctuary.act(partnerData(t.slot),t.line,{type:'train',stat:t.stat},now);if(!next.ok){cancelWorldTraining(result.message+' '+next.message+' Gym training stopped.');return}}
 const left=PGDigimonSanctuary.DURATION-t.elapsed;worldNotice(sanctuaryName(t.stat)+' auto-training · '+gymClock(left)+' · '+t.completed+' completed'+(t.room?'':' · local solo'),true,false);
 renderActivityPanel();syncActivityCountdown();
}
setInterval(worldTrainingTick,1000);

let sanctuaryStore=null,sanctuaryFrame=0,sanctuaryEvolveConfirm=null;
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
 /* v383 (owner: "digidex not working well, unable to link to the branch - need to remove
    zerimon branch to see terriermon"): a typed query searches EVERY attainable form. The
    branch scope is a browse mode, so it must never be able to hide a name you just typed. */
 const scope=query?null:family;
 const filtered=G.ROSTER.filter(id=>{const e=G.entry(id),matches=!query||id.toLowerCase().includes(query)||G.name(id).toLowerCase().includes(query);return attainable(id)&&matches&&(!scope||scope.has(id))&&(!stage||(stage==='__unlisted'?!e?.stage:e?.stage===stage))&&(!ownedOnly||collected.has(id))});
 const attainableCount=G.ROSTER.filter(attainable).length;
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));sanctuaryIndexPage=Math.max(0,Math.min(pages-1,sanctuaryIndexPage));const shown=filtered.slice(sanctuaryIndexPage*pageSize,(sanctuaryIndexPage+1)*pageSize),list=$id('sanctuaryIndexList');
 const links=ids=>ids.map(target=>`<button type="button" data-digidex-form="${escape(target)}" title="View ${escape(G.name(target))}">${escape(G.name(target))}</button>`).join('');
 list.innerHTML=shown.length?shown.map(id=>{
  const entry=G.entry(id),outgoing=graph.outgoing.get(id)||[],incoming=graph.incoming.get(id)||[],starter=G.STARTER_POOL.includes(id),reachable=graph.reachable.has(id),classes=['sanctuary-index-entry'],progress=sanctuaryDigidexProgress(id,bag),base=B.combatPreview(id),trained=progress?B.combatPreview(id,progress):null,stageLabel=entry?.stage||'Stage not listed',rank=({'Baby I':'baby1','Baby II':'baby2','Mega+':'mega-plus'}[stageLabel]||stageLabel.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')),portrait=G.ROSTER.indexOf(id),px=-(portrait%20)*64,py=-Math.floor(portrait/20)*64;
  if(collected.has(id))classes.push('is-owned');if(current===id)classes.push('is-current');if(!reachable)classes.push('is-unreachable');
  const status=current===id?'CURRENT PARTNER':collected.has(id)?'IN COLLECTION':starter?'BABY EGG POOL':reachable?'REACHABLE BY DIRECT EVOLUTION':'NOT CURRENTLY OBTAINABLE';
  const fromText=incoming.length?links(incoming):starter?'Baby egg pool — no evolution required.':'No supported incoming direct form.';
  const toText=outgoing.length?links(outgoing):(incoming.length||reachable)?'No supported outgoing evolution — final form in the current direct-route catalog.':'No supported outgoing direct evolution.';
  return `<article class="${classes.join(' ')}" data-index-form="${escape(id)}" data-rank="${rank}"><div class="digidex-card-head"><span class="digidex-portrait" role="img" aria-label="${escape(G.name(id))} portrait" style="--portrait-x:${px}px;--portrait-y:${py}px"></span><div class="digidex-title"><strong>${escape(G.name(id))}</strong><span class="digidex-stage">${escape(stageLabel)}</span><small class="digidex-status">${status}</small></div>${collected.has(id)?`<button type="button" class="digidex-assign" data-digidex-assign="${escape(id)}" ${current===id?'disabled':''}>${current===id?'ACTIVE PARTNER':'MAKE PARTNER'}</button><span class=\"digidex-owned-badge\">✓ OWNED</span>`:''}</div><small class="digidex-meta">${escape(entry?.attribute||'Attribute unlisted')} · ${escape(entry?.type||'Type unlisted')}</small><section class="digidex-base-layer" aria-label="Base battle stats"><small>BASE BATTLE · LV 1</small><div><span>HP <b>${base.maxHp}</b></span><span>ATK <b>${base.attack}</b></span><span>DEF <b>${base.defense}</b></span><span>SPD <b>${base.spd===1?'±0%':(base.spd>1?'+':'−')+Math.abs(Math.round((base.spd-1)*100))+'%'}</b></span></div></section>${trained?`<section class="digidex-owned-layer"><b>YOUR LAYER · LV ${trained.level} · MASTERY ${trained.mastery}</b><span>HP ${trained.maxHp} · ATK ${trained.attack} · DEF ${trained.defense} · ${trained.wins} wins</span><small>POW ${trained.stats.power} · GRD ${trained.stats.guard} · AGI ${trained.stats.agility} · FOC ${trained.stats.focus}</small></section>`:''}<section class="digidex-paths"><p><b>Evolves from · ${incoming.length}</b><span>${fromText}</span></p><p><b>Evolves to · ${outgoing.length}</b><span>${toText}</span></p></section>${!reachable?'<small class="digidex-route-note">No supported Baby-egg/direct route. Special, fusion, tagged or missing-profile links are not currently enabled.</small>':''}</article>`;
 }).join(''):'<div class="sanctuary-empty">No DigiDex forms match this search.</div>';
 list.onclick=e=>{const assign=e.target.closest('[data-digidex-assign]');if(assign){if(assignPartner(assign.dataset.digidexAssign))sanctuaryRenderIndex(bag);return}
 const button=e.target.closest('[data-digidex-form]');if(!button||!list.contains(button))return;const id=button.dataset.digidexForm;if(!G.ROSTER.includes(id))return;$id('sanctuaryIndexSearch').value=G.name(id);$id('sanctuaryIndexStage').value='';sanctuaryIndexBranch=null;sanctuaryIndexPage=0;sanctuaryRenderIndex(bag)};
 $id('sanctuaryIndexStatus').textContent=(branch?(query?'Searching every branch (branch view paused) · ':filtered.length+' forms in '+G.name(branch)+'\'s direct branch · '):'')+(ownedOnly?filtered.length+' of '+collected.size+' owned forms':filtered.length+' of '+attainableCount+' attainable forms · '+collected.size+' owned');$id('sanctuaryIndexPage').textContent='Page '+(sanctuaryIndexPage+1)+' / '+pages;$id('sanctuaryIndexPrev').disabled=sanctuaryIndexPage===0;$id('sanctuaryIndexNext').disabled=sanctuaryIndexPage>=pages-1;
}
// v351: each partner slot shows what it is doing right now, so training one partner while
// another grinds reads as two parallel activities instead of two overlapping mystery HUDs.
function slotActivity(slot){
 if(worldTraining&&worldTraining.slot===slot)return {cls:'is-training',label:sanctuaryName(worldTraining.stat).toUpperCase()+' TRAINING'};
 // v384: battleBusySlot() is the one place that knows which partner is fighting - a party member's
 // slot is not the run owner's, and a ring snapshot carries no slot at all (so RING MATCH never showed).
 const busy=battleBusySlot();if(busy!==slot)return null;
 const run=myPve();if(run)return {cls:'is-grinding',label:'GRINDING · STAGE '+(globalThis.PGDigimonBattle?.stageOf?.(run.wave)||1)};
 if(myPvp())return {cls:'is-pvp',label:'RING MATCH'};
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
 const w=canvas.width||64,h=canvas.height||64;
 const palettes=[['#c5cdc4','#6d7670','#eef2ea'],['#b9c8dc','#5d738c','#f4f8fc'],['#9ec4e8','#3d6f96','#e7f4ff'],['#7ee0cf','#1f7a68','#e5fff8'],['#f6d36a','#b07a1e','#fff4c4']];
 const [mid,dark,light]=palettes[Math.max(0,Math.min(4,(Number(tier)||1)-1))];
 ctx.clearRect(0,0,w,h);ctx.save();ctx.scale(w/64,h/64);
 const fill=(d,c)=>{ctx.fillStyle=c;ctx.fill(d)};const stroke=(d,c,lw)=>{ctx.strokeStyle=c;ctx.lineWidth=lw||2.2;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke(d)};
 if(kind==='weapon'){
  const blade=new Path2D();blade.moveTo(18,50);blade.lineTo(22,46);blade.lineTo(48,16);blade.quadraticCurveTo(52,12,47,14);blade.lineTo(20,42);blade.closePath();
  fill(blade,light);stroke(blade,dark,2);
  const guard=new Path2D();guard.moveTo(16,40);guard.quadraticCurveTo(24,36,32,44);guard.quadraticCurveTo(24,48,16,40);fill(guard,'#d7b45a');stroke(guard,'#8a6a24',1.6);
  const grip=new Path2D();grip.moveTo(16,50);grip.quadraticCurveTo(14,54,18,56);grip.lineTo(22,52);grip.quadraticCurveTo(20,48,16,50);fill(grip,'#5a3d24');
 }else if(kind==='armor'){
  const plate=new Path2D();plate.moveTo(18,16);plate.quadraticCurveTo(32,8,46,16);plate.lineTo(50,24);plate.quadraticCurveTo(48,44,32,54);plate.quadraticCurveTo(16,44,14,24);plate.closePath();
  fill(plate,mid);stroke(plate,dark,2.4);
  ctx.fillStyle=light;ctx.beginPath();ctx.ellipse(32,28,8,10,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=dark;ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(32,20);ctx.lineTo(32,46);ctx.stroke();
 }else if(kind==='accessory'){
  ctx.strokeStyle=mid;ctx.lineWidth=7;ctx.beginPath();ctx.arc(32,34,14,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle=dark;ctx.lineWidth=3;ctx.beginPath();ctx.arc(32,34,14,0,Math.PI*2);ctx.stroke();
  const gem=new Path2D();gem.moveTo(32,18);gem.lineTo(38,26);gem.lineTo(32,34);gem.lineTo(26,26);gem.closePath();fill(gem,'#e35a6a');stroke(gem,'#8c2030',1.4);ctx.fillStyle=light;ctx.beginPath();ctx.arc(30,24,2.2,0,Math.PI*2);ctx.fill();
 }else{
  const cord=new Path2D();cord.moveTo(20,12);cord.quadraticCurveTo(32,4,44,12);cord.quadraticCurveTo(40,20,32,18);cord.quadraticCurveTo(24,20,20,12);
  stroke(cord,'#8a7048',3);
  ctx.beginPath();ctx.arc(32,36,14,0,Math.PI*2);ctx.fillStyle=mid;ctx.fill();ctx.strokeStyle=dark;ctx.lineWidth=2.2;ctx.stroke();
  ctx.beginPath();ctx.arc(32,36,7,0,Math.PI*2);ctx.fillStyle=light;ctx.fill();
 }
 ctx.restore();
}
function sanctuaryGearHolderLabel(line){
 const G=globalThis.PGDigimonSanctuary,active=activePartnerSlot(),slots=[active,0,1,2,3].filter((v,i,a)=>a.indexOf(v)===i);
 for(const slot of slots)if(partnerLine(slot)===line){const form=G?.species(partnerData(slot),line)||line;return sanctuaryName(form)+' · Partner '+(slot+1)}
 return sanctuaryName(line);
}
function sanctuaryRenderGear(bag,G){
 if(!bag||typeof S!=='object'||!S)return '';
 const gearHolder={};for(const [line,slots] of Object.entries(bag.gear.equip))for(const uid of Object.values(slots))gearHolder[uid]=line;
 let all=Object.entries(bag.gear.items).sort((a,b)=>(gearHolder[b[0]]?1:0)-(gearHolder[a[0]]?1:0)||b[1].tier-a[1].tier||b[1].refine-a[1].refine);
 if(sanctuaryGearFilterKind)all=all.filter(([,it])=>it.kind===sanctuaryGearFilterKind);
 if(sanctuaryGearFilterTier)all=all.filter(([,it])=>String(it.tier)===sanctuaryGearFilterTier);
 if(sanctuaryGearSelected&&!bag.gear.items[sanctuaryGearSelected])sanctuaryGearSelected='';
 const selected=bag.gear.items[sanctuaryGearSelected]?[sanctuaryGearSelected,bag.gear.items[sanctuaryGearSelected]]:(all[0]||null);if(selected)sanctuaryGearSelected=selected[0];
 const tabs=[['','All'],['weapon','Weapons'],['armor','Armor'],['accessory','Accessories'],['relic','Relics']].map(([id,label])=>`<button type="button" data-gear-kind="${id}" class="${sanctuaryGearFilterKind===id?'is-selected':''}" aria-pressed="${sanctuaryGearFilterKind===id}">${label}<small>${id?Object.values(bag.gear.items).filter(x=>x.kind===id).length:Object.keys(bag.gear.items).length}</small></button>`).join('');
 const tiles=all.map(([uid,item])=>{const holder=gearHolder[uid],summary=G.GEAR_STAT_NAME[item.main.stat]+' '+G.gearStatValue(item.main,item.refine)+(item.special?' · '+G.GEAR_STAT_NAME[item.special.stat]+' '+G.gearStatValue(item.special,item.refine):'');return `<button type="button" class="sanctuary-gear-tile${uid===sanctuaryGearSelected?' is-selected':''}" data-gear-select="${escape(uid)}" data-gear-uid="${escape(uid)}" aria-pressed="${uid===sanctuaryGearSelected}"><canvas width="40" height="40" data-gear-icon data-gear-kind="${escape(item.kind)}" data-gear-tier="${item.tier}" aria-hidden="true"></canvas><span><b>${escape(G.gearItemName(item))}${escape(G.gearRefineTag(item))}</b><small>T${item.tier} · ${escape(summary)}</small>${holder?`<em>On ${escape(sanctuaryGearHolderLabel(holder))}</em>`:''}</span></button>`}).join('');
 let detail='<aside class="sanctuary-gear-detail is-empty"><b>Select a gear piece</b><p>Its full stats and equip, remove, forge and sale controls appear here.</p></aside>';
 if(selected){const[uid,item]=selected,holder=gearHolder[uid],tierCost=G.FORGE_TIER_COST[item.tier-1],refCost=G.REFINE_COST[item.tier-1],refPct=Math.round(G.REFINE_SUCCESS[item.refine]*100),owned=bag.owned.map(line=>`<option value="${escape(line)}"${line===partnerLine()?' selected':''}>${escape(sanctuaryGearHolderLabel(line))}</option>`).join('');
  detail=`<aside class="sanctuary-gear-detail" data-gear-detail="${escape(uid)}"><header><canvas width="64" height="64" data-gear-icon data-gear-kind="${escape(item.kind)}" data-gear-tier="${item.tier}" aria-hidden="true"></canvas><div><small>${escape(item.kind.toUpperCase())} · T${item.tier}</small><h4>${escape(G.gearItemName(item))}${escape(G.gearRefineTag(item))}</h4>${holder?`<span>Equipped on ${escape(sanctuaryGearHolderLabel(holder))}</span>`:'<span>In Pet Bag</span>'}</div></header><div class="sanctuary-gear-stats"><span><small>Main</small><b>${escape(G.GEAR_STAT_NAME[item.main.stat])} ${G.gearStatValue(item.main,item.refine)}</b></span>${item.special?`<span><small>Special</small><b>${escape(G.GEAR_STAT_NAME[item.special.stat])} ${G.gearStatValue(item.special,item.refine)}</b></span>`:'<span><small>Special</small><b>None</b></span>'}<span><small>Refine</small><b>+${item.refine} · ${item.refine*8}% bonus</b></span><span><small>Sell value</small><b>◈ ${G.gearSellValue(item)}</b></span></div><div class="sanctuary-gear-manage">${holder?`<button type="button" data-gear-action="unequip" data-gear-uid="${escape(uid)}">Remove from ${escape(sanctuaryGearHolderLabel(holder))}</button>`:`<label>Equip on<select data-gear-line>${owned}</select></label><button type="button" data-gear-action="equip" data-gear-uid="${escape(uid)}">Equip</button>`}${item.tier<5?`<button type="button" data-gear-action="tier" data-gear-uid="${escape(uid)}" ${bag.coins<tierCost?'disabled':''}>Tier up · ${tierCost} ◈</button>`:'<span class="sanctuary-gear-max">Max tier</span>'}${item.refine<G.REFINE_MAX?`<button type="button" data-gear-action="refine" data-gear-uid="${escape(uid)}" ${bag.coins<refCost?'disabled':''}>Refine +${item.refine+1} · ${refCost} ◈ · ${refPct}%</button>`:'<span class="sanctuary-gear-max">Refined +10</span>'}<button type="button" class="is-sell" data-gear-action="sell" data-gear-uid="${escape(uid)}" ${holder?'disabled title="Remove this gear before selling"':''}>Sell · ${G.gearSellValue(item)} ◈</button></div></aside>`;
 }
 const auto=[1,2,3,4,5].map(t=>`<label><input type="checkbox" data-gear-auto="${t}" ${bag.gearAutoSell.includes(t)?'checked':''}> T${t}</label>`).join('');
 const totalCount=Object.keys(bag.gear.items).length;
 return `<section class="sanctuary-section sanctuary-gear"><div class="sanctuary-section-head"><div><small>GEAR LOADOUT</small><h3>Partner equipment</h3></div><span class="sanctuary-level">${all.length} shown · ${totalCount}/${G.GEAR_ITEM_CAP}</span></div><nav class="sanctuary-gear-tabs" aria-label="Equipment kinds">${tabs}</nav><div class="sanctuary-gear-tools"><label>Tier <select id="sanctuaryGearFilterTier"><option value="">All tiers</option>${[1,2,3,4,5].map(t=>`<option value="${t}" ${sanctuaryGearFilterTier===String(t)?'selected':''}>T${t}</option>`).join('')}</select></label><fieldset><legend>Auto-sell future drops</legend>${auto}</fieldset><button type="button" data-gear-action="sell-auto">Sell matching Auto-sell</button></div><p class="sanctuary-gear-help">Sell matching dumps unequipped, unrefined pieces on the ticked tiers. Equipped and refined (+1 or more) stay. Refine goes to +10.</p><div class="sanctuary-gear-workspace"><div class="sanctuary-gear-inventory">${tiles||'<div class="sanctuary-empty">No gear in this category — clear field waves for drops.</div>'}</div>${detail}</div></section>`;
}
function sanctuaryRenderAux(){
 const G=globalThis.PGDigimonSanctuary,bag=petBag(),bagBox=$id('sanctuaryBagView'),shopBox=$id('sanctuaryEvolutionView');if(!G)return;
 $id('sanctuaryCoins').textContent=bag?bag.coins:'—';if($id('sanctuaryEggs'))$id('sanctuaryEggs').textContent=bag?bag.eggs:'—';if($id('sanctuaryEvo'))$id('sanctuaryEvo').textContent=bag?(bag.evoPoints||0):'—';
 if(bagBox){bagBox.innerHTML=!bag?'<div class="sanctuary-empty">This pet bag uses a newer save version and has not been changed.</div>':`<section class="sanctuary-section sanctuary-bag"><div class="sanctuary-section-head"><div><small>INVENTORY</small><h3>Pet Bag</h3></div><span class="sanctuary-level">${bag.owned.length} / ${G.STARTER_POOL.length} starter-pool forms owned</span></div><div class="sanctuary-item-grid"><div class="sanctuary-item"><span class="sanctuary-item-icon">🥚</span><strong>Mystery Digi-Egg</strong><b>${bag.eggs}</b><small>Random Baby I or Baby II · duplicate-protected</small><div class="sanctuary-actions"><button type="button" data-bag-action="hatch" ${bag.eggs<1||bag.owned.length>=G.STARTER_POOL.length||trainingSlotBusy()?'disabled':''}>${trainingSlotBusy()?'Stop this slot’s training to hatch':'Hatch an egg'}</button><button type="button" data-shop-item="egg" data-quantity="1" ${bag.coins<G.ITEMS.egg.price||bag.eggs>=G.STARTER_POOL.length-bag.owned.length?'disabled':''}>Buy · ◈ ${G.ITEMS.egg.price}</button></div></div>${sanctuaryHatch?`<div class="sanctuary-hatch-result" role="status"><span>HATCHED PARTNER</span><strong>${escape(sanctuaryName(sanctuaryHatch))}</strong><p>Your partner is saved and selected. If this species returned after dismissal, its level, training and unlocked evolutions were restored.</p><button type="button" data-bag-action="show-partner">View partner</button></div>`:''}</section>${sanctuaryRenderGear(bag,G)}`;
 for(const c of bagBox.querySelectorAll('canvas[data-gear-icon]'))sanctuaryGearIcon(c,c.dataset.gearKind,Number(c.dataset.gearTier)||1);
  const tSel=bagBox.querySelector('#sanctuaryGearFilterTier');if(tSel)tSel.onchange=e=>{sanctuaryGearFilterTier=e.target.value;sanctuaryRenderAux();};
 }
 if(shopBox){
  // v379 fix: read the ACTIVE slot's real store (partnerData() takes a slot, not a line).
  // The old partnerData(line) lookup always normalized a phantom fresh copy, so the view's
  // requirements could never look satisfied — the tree now reflects the true partner.
  const line=partnerLine(),data=G.normalize(partnerData(),line),cur=data?.partners?.[line],req=cur?G.requirements(cur,line):null,form=cur?.form||line,graph=G.evolutionCatalog();
  const incoming=graph.incoming.get(form)||[],outgoing=graph.outgoing.get(form)||[],stage=G.entry(form)?.stage||'Stage not listed',unlocked=[...new Set(cur?.unlocked||[line,form])].filter(id=>G.ROSTER.includes(id)).sort((a,b)=>G.evolutionDepth(line,a)-G.evolutionDepth(line,b)||G.name(a).localeCompare(G.name(b)));
  const evoCost=G.evoPointCost(cur?.stage||0),evoHave=bag?.evoPoints||0;
  const unlockedForms=`<section class="sanctuary-unlocked-forms"><div><small>REACHED FORMS</small><b>${unlocked.length} remembered · peak stage ${cur?.peakStage??cur?.stage??0}</b></div><div>${unlocked.map(id=>`<button type="button" data-sanctuary-action="switchForm" data-target="${escape(id)}" class="${id===form?'is-current':''}" ${id===form?'disabled':''}><i class="sanctuary-node-face"${(()=>{const idx=G.ROSTER.indexOf(id);return idx<0?'':` style="--portrait-x:${-(idx%20)*64}px;--portrait-y:${-Math.floor(idx/20)*64}px"`})()} aria-hidden="true"></i><span>${escape(G.name(id))}<small>${escape(G.entry(id)?.stage||'Stage not listed')}</small></span></button>`).join('')}</div><p>Switch any reached form for free. Rolling a <b>new</b> evolution still costs ✦ ${evoCost} Evo Points (you have ${evoHave}) on top of level and training, so farming every branch is gated by grind drops.</p></section>`;
  const evoCopy=req?`Evolve: reach ${req.points} training points and partner level ${req.level}, then roll one of ${req.options.length} branches — pool shown below. You keep level, training and wins. · ${G.total(cur)}/${req.points} pts · Lv ${G.level(cur)}/${req.level}.`:(cur&&cur.stage>=G.MAX_EVOLUTIONS?'Max evolutions reached.':'No direct evolution available — special/fusion paths not enabled.');
  const confirm=sanctuaryEvolveConfirm?.line===line&&req?.ready&&!cur?.training;
  const faceStyle=id=>{const idx=G.ROSTER.indexOf(id);return idx<0?'':` style="--portrait-x:${-(idx%20)*64}px;--portrait-y:${-Math.floor(idx/20)*64}px"`};
  const nodeChip=(id,isCurrent)=>`<${isCurrent?'span':'button type="button" data-digidex-form="'+escape(id)+'" title="Inspect '+escape(G.name(id))+' in the DigiDex"'} class="sanctuary-node${isCurrent?' is-current':''}"${isCurrent?' aria-current="step"':''}><i class="sanctuary-node-face"${faceStyle(id)} aria-hidden="true"></i><span class="sanctuary-node-text"><b>${escape(G.name(id))}</b><small>${escape(G.entry(id)?.stage||'')}${isCurrent?' · current form':''}</small></span></${isCurrent?'span':'button'}>`;
  const treeRow=(label,ids,emptyText)=>`<div class="sanctuary-tree-row"><small>${label}</small><div class="sanctuary-tree-cells">${ids.length?ids.map(id=>nodeChip(id,false)).join(''):`<span class="sanctuary-node is-empty"><span class="sanctuary-node-text"><b>${emptyText}</b></span></span>`}</div></div>`;
  const tree=treeRow('EVOLVES FROM',incoming,'Baby egg pool')+'<div class="sanctuary-tree-trunk" aria-hidden="true"></div><div class="sanctuary-tree-row"><div class="sanctuary-tree-cells">'+nodeChip(form,true)+'</div></div><div class="sanctuary-tree-trunk" aria-hidden="true"></div>'+treeRow('EVOLVES TO · '+outgoing.length,outgoing,'Final form in the current catalog');
  shopBox.innerHTML=!bag?'<div class="sanctuary-empty">This pet bag uses a newer save version and has not been changed.</div>':!cur?'<div class="sanctuary-empty">Hatch a Digi-Egg and choose a partner to preview its evolution tree.</div>':`<section class="sanctuary-section sanctuary-evolution"><div class="sanctuary-section-head"><div><small>EVOLUTION GUIDE</small><h3>${escape(sanctuaryName(form))} · ${escape(stage)}</h3></div><span class="sanctuary-level">${outgoing.length} branches · Mastery ${cur?.mastery||0}</span></div><div class="sanctuary-tree">${tree}</div>${unlockedForms}<p class="sanctuary-tree-note">The branch you get is rolled when you evolve — every listed branch stays a direct possibility. Select a form to inspect it in the DigiDex.</p>${!req&&!confirm?'<p class="sanctuary-tree-note">No direct source-listed evolution is available from this form. Special, fusion and missing-profile paths are not invented.</p>':''}${req?`<div class="sanctuary-req"><div class="sanctuary-req-stat"><span>Training points</span><b>${G.total(cur)}/${req.points}</b><div class="sanctuary-req-bar"><i style="width:${Math.min(100,G.total(cur)/req.points*100)}%"></i></div></div><div class="sanctuary-req-stat"><span>Partner level</span><b>${G.level(cur)}/${req.level}</b><div class="sanctuary-req-bar"><i style="width:${Math.min(100,G.level(cur)/Math.max(1,req.level)*100)}%"></i></div></div><div class="sanctuary-req-stat"><span>Evo Points</span><b>${evoHave}/${evoCost}</b><div class="sanctuary-req-bar"><i style="width:${Math.min(100,evoHave/Math.max(1,evoCost)*100)}%"></i></div></div></div>`:''}${req&&req.options.length?`<p class="sanctuary-roll-pool">Possible: ${req.options.map(id=>escape(sanctuaryName(id))).join(' · ')}</p>`:''}<div class="sanctuary-actions">${confirm?`<button type="button" data-sanctuary-action="evolve">Evolve now — ✦ ${evoCost}</button><button type="button" data-sanctuary-action="cancelEvolution">Cancel</button>`:req?`<button type="button" data-sanctuary-action="requestEvolution" ${!req.ready||cur?.training||evoHave<evoCost?'disabled':''}>Evolve · ✦ ${evoCost}</button>`:'<button type="button" disabled>No direct evolution</button>'}<button type="button" data-open-digidex>Browse DigiDex</button></div></section>`;
 }
 const masteryBox=$id('sanctuaryMasteryView');
 if(masteryBox){
  const line=partnerLine(),data=G.normalize(partnerData(),line),cur2=data?.partners?.[line],mForm=cur2?.form||line,mStage=G.entry(mForm)?.stage||'Stage not listed',mastery=cur2?.mastery||0,nextCost=(mastery+1)*4,total=cur2?G.total(cur2):0,capped=mastery>=6,pct=capped?100:Math.min(100,total/nextCost*100);
  masteryBox.innerHTML=!bag?'<div class="sanctuary-empty">This pet bag uses a newer save version and has not been changed.</div>':!cur2?'<div class="sanctuary-empty">Hatch a Digi-Egg and choose a partner to grow its mastery.</div>':`<section class="sanctuary-section sanctuary-mastery"><div class="sanctuary-section-head"><div><small>MASTERY</small><h3>Keep the form, deepen the bond</h3></div><span class="sanctuary-level">${escape(sanctuaryName(mForm))} · Level ${G.level(cur2)}</span></div><div class="sanctuary-mastery-row"><span class="sanctuary-mastery-figure" style="--progress:${pct}"><b>${mastery}</b><small>/ 6</small></span><div class="sanctuary-mastery-copy"><p><b>What mastery does:</b> every point is <b>+1.5 attack</b> for this partner in every battle — field grind, boss raid and the PvP ring. A fully bonded form hits <b>+9 attack</b> harder than the same form at 0. Enemies never have mastery, so it is pure profit. Points cost training points at <b>4/8/12/16/20/24</b> (24 total), and training points are <b>never spent</b> — the same gym work counts again toward the next point.</p><p>Mastery stays on <b>${escape(sanctuaryName(mForm))}</b> (${escape(mStage)}): it never resets, and evolving keeps level, training, wins and mastery.</p><p class="sanctuary-mastery-now">Right now: <b>+${(Number(mastery||0)*1.5).toFixed(1)} attack</b> from ${mastery||0} mastery point${Number(mastery)===1?'':'s'}.</p><p class="sanctuary-mastery-next">${capped?'Final mastery point reached — this form is fully bonded.':`Next point at <b>${nextCost} training points</b> — this partner has <b>${total}</b>.`}</p><div class="sanctuary-req-bar"><i style="width:${pct}%"></i></div></div></div><div class="sanctuary-actions"><button type="button" data-sanctuary-action="mastery" title="Stays this form; +1.5 attack per mastery point in the field formula" ${capped||total<(mastery+1)*4||cur2?.training?'disabled':''}>${capped?'Mastery complete':'Keep form · improve mastery'}</button><button type="button" data-goto-view="evolution">Review evolution path ↗</button><button type="button" data-goto-view="partners">Back to partner care</button></div></section>`;
 }
 const titlesBox=$id('sanctuaryTitlesView');
 if(titlesBox){const markup=digiTitlesMarkup();titlesBox.innerHTML=markup||'<div class="sanctuary-empty">Titles appear once DigiPet is ready.</div>'}
 sanctuaryRenderIndex(bag);
}
function sanctuarySetView(view){const views=['partners','index','bag','evolution','mastery','titles'];sanctuaryView=views.includes(view)?view:'partners';for(const name of views){const panel=$id('sanctuary'+name[0].toUpperCase()+name.slice(1)+'View');if(panel)panel.hidden=name!==sanctuaryView}for(const b of sanctuaryPanel.querySelectorAll('[data-sanctuary-view]'))if(b.closest('.sanctuary-nav'))b.setAttribute('aria-pressed',String(b.dataset.sanctuaryView===sanctuaryView));sanctuaryRenderAux()}
function sanctuaryRender(){const G=globalThis.PGDigimonSanctuary,box=$id('sanctuaryGameplay'),line=partnerLine();if(!G||!S){box.replaceChildren();return}const bag=ensureDigimonBag();sanctuaryRenderAux();if(!bag){box.textContent='This save uses a newer pet-bag version and has not been changed.';return}const data=G.normalize(partnerData(),line);if(!data){box.textContent='This save uses a newer DigiPet version and has not been changed.';return}if(!G.ROSTER.includes(line)){box.innerHTML='<div class="sanctuary-empty">Hatch a Digi-Egg in the Pet Bag, then choose an owned partner above to begin care and training.</div>';return}const p=data.partners[line],form=p.form,busy=!!p.training,equippedMap=bag.gear.equip[line]||{};
 // v359 (owner: "the focus box renders smaller"): every stat row carries the same short
 // description line, so all four boxes measure identically; the fuller wording stays in
 // the hover tooltip.
 const statText={power:'+2.5 attack each',guard:'+7 HP, +1.2 defense each',agility:'+2.5% swing speed each',focus:'+1% crit chance each'};
 const statButtons=G.STATS.map(k=>`<span title="${{power:'+2.5 attack each',guard:'+7 HP and +1.2 defense each',agility:'+2.5% swing speed each — quicker, more reliable hits',focus:'+1% crit chance each'}[k]}"><i class="sanctuary-gauge" style="--progress:${Math.min(100,Math.max(0,p.stats[k]/12*100))}%"><b>${p.stats[k]}<em>/12</em></b></i>${sanctuaryName(k)}<small>${statText[k]}</small></span>`).join('');
  box.innerHTML=`${worldTraining?`<div class="sanctuary-actions"><button type="button" data-gym-stop>Stop Partner ${worldTraining.slot+1} gym training</button></div>`:''}<div class="sanctuary-sections"><section class="sanctuary-section"><div class="sanctuary-section-head"><div><small>PARTNER CARE</small><h3>${sanctuaryName(form)}</h3></div><span class="sanctuary-level">Level ${G.level(p)} · ${G.entry(form)?.stage||'Stage not listed'} · ${p.stage} evolutions · Mastery ${p.mastery}</span></div><p class="sanctuary-care-note">Care is pressure-free since the energy meter was retired — gym sessions are paced by their timer alone, and grind runs end on waves or defeat.</p></section>
 <section class="sanctuary-section"><div class="sanctuary-section-head"><div><small>EQUIPMENT</small><h3>Gear build</h3></div><span class="sanctuary-level">${['weapon','armor','accessory','relic'].filter(k=>equippedMap[k]).length}/4 slots used</span></div><div class="sanctuary-gear-strip">${['weapon','armor','accessory','relic'].map(k=>{const uid=equippedMap[k],item=uid&&bag.gear.items[uid];return `<button type="button" class="${item?'':'is-empty'}" data-partner-gear-kind="${k}"${uid?` data-partner-gear-uid="${escape(uid)}"`:''}${item?` data-tier="T${item.tier}"`:''}><b>${k}</b><em>${item?'T'+item.tier:'—'}</em>${item?'<small>'+escape(G.gearItemName(item))+'</small><small class="sanctuary-gear-label">'+escape(G.gearItemLabel(item).split(' · ').slice(1).join(' · '))+'</small>':'<small>Choose '+escape(k)+'</small>'}</button>`}).join('')}</div><p class="sanctuary-care-note">Select any slot to replace or remove its equipment.</p></section>
 <section class="sanctuary-section"><div class="sanctuary-section-head"><div><small>TRAINING GROUNDS</small><h3>Grow your strengths</h3></div><span class="sanctuary-level">${G.total(p)}/24 points</span></div><p>${p.training?'Training '+sanctuaryName(p.training.stat)+' · <span id="sanctuaryCountdown"></span>':'5 min per session · +1 point · caps 12 per stat, 24 total'}</p><div class="sanctuary-train">${statButtons}</div></section></div>`;
 const sections=box.querySelector('.sanctuary-sections');
 if(sections){
  const portrait=document.createElement('section');portrait.className='sanctuary-specimen';portrait.innerHTML='<div class="sanctuary-specimen-head"><small>PARTNER / 0'+(activePartnerSlot()+1)+'</small><em>'+escape(G.entry(form)?.attribute||'—')+'</em></div><canvas id="sanctuaryHero" width="256" height="256" aria-label="'+escape(sanctuaryName(form))+'"></canvas><span class="sanctuary-form-chip">'+escape(G.entry(form)?.stage||'Stage not listed')+' / current form</span><strong>'+escape(sanctuaryName(form))+'</strong><span class="sanctuary-specimen-level">Level '+G.level(p)+'</span><button type="button" data-open-digidex>Change companion ↗</button>';
  sections.before(portrait);
  for(const [i,k] of ['weapon','armor','accessory','relic'].entries()){const slot=box.querySelectorAll('.sanctuary-gear-strip>button')[i],item=equippedMap[k]&&bag.gear.items[equippedMap[k]];if(item){const c=document.createElement('canvas');c.width=48;c.height=48;c.setAttribute('aria-hidden','true');sanctuaryGearIcon(c,k,item.tier);slot.prepend(c)}}
 }
 sanctuaryCountdown();
}
// v373 (owner): DigiPet titles in the Partners view. Each row shows its rarity colour, how far along
// it is, and a Wear / Take off button once earned. The worn one is what the plaza draws.
function digiTitlesMarkup(){const G=globalThis.PGDigimonSanctuary;if(!G||typeof S!=='object'||!S)return '';const stats=digiStats(),worn=G.equippedDigiTitle(S.digimonTitle,stats),earned=G.DIGI_TITLES.filter(t=>G.digiTitleUnlocked(t,stats)).length;const rows=G.DIGI_TITLES.map(t=>{const raw=Math.max(0,t.cur(stats)),done=G.digiTitleUnlocked(t,stats),cur=Math.min(t.goal,raw),on=!!worn&&worn.id===t.id,c=G.digiTitleColor(t),pct=Math.min(100,cur/Math.max(1,t.goal)*100);const art=globalThis.PGSocialTitleArt?.icon('digi',t.id);return '<article class="digi-title'+(on?' is-worn':'')+(done?'':' is-locked')+'" data-digi-title-row="'+escape(t.id)+'" style="--tier:'+c+'" title="'+escape(t.req)+'">'+(art?'<span class="digi-title-medal has-art" aria-hidden="true">'+art+'</span>':'<i class="digi-title-medal" aria-hidden="true"></i>')+'<span class="digi-title-tier">'+escape(t.tier)+'</span><b>'+escape(t.name)+'</b><span class="digi-title-progress"><i style="width:'+pct+'%"></i></span><em>'+(done?'Earned':cur.toLocaleString()+' / '+t.goal.toLocaleString())+'</em>'+(done?(on?'<button type="button" data-digi-title="none">Wearing</button>':'<button type="button" data-digi-title="'+escape(t.id)+'">Wear</button>'):'<span class="digi-title-lock">Locked</span>')+'</article>'}).join('');return '<section class="sanctuary-section sanctuary-titles"><div class="sanctuary-section-head"><div><small>TITLES</small><h3>DigiPet title collection</h3></div><span class="sanctuary-level">'+earned+'/'+G.DIGI_TITLES.length+' earned · '+(worn?'Wearing '+escape(worn.name):'None worn')+'</span></div><p class="sanctuary-lead">Hover a medal for its requirement. Worn titles sit under your fishing title in the plaza.</p><div class="digi-titles">'+rows+'</div></section>'}
function sanctuaryCountdown(){const G=globalThis.PGDigimonSanctuary,line=partnerLine(),el=$id('sanctuaryCountdown'),p=G?.normalize(partnerData(),line)?.partners?.[line];if(el&&p?.training)el.textContent=gymClock(p.training.ends-Date.now())+' remaining'}
function sanctuaryCommit(action){
 if(worldTraining&&worldTraining.slot===activePartnerSlot()){$id('sanctuaryMessage').textContent='Finish or cancel on-map training first.';return}
 {const busy=battleBusySlot();if(busy!=null&&busy===activePartnerSlot()){$id('sanctuaryMessage').textContent='Stop the field or ring battle before changing this partner.';return}}
 const G=globalThis.PGDigimonSanctuary;if(!G||typeof S!=='object'||!S)return;const slot=activePartnerSlot(),line=partnerLine(slot);
 if(!G.ROSTER.includes(line)||!ownsDigimon(line)){$id('sanctuaryMessage').textContent='Hatch and choose an owned partner first.';return}
 if(action.type==='requestEvolution'){const p=G.normalize(partnerData(slot),line)?.partners?.[line],req=p&&G.requirements(p,line);if(!req?.ready||!req.options.length){$id('sanctuaryMessage').textContent='Evolution requirements are not met.';return}const cost=G.evoPointCost(p.stage);if((petBag()?.evoPoints||0)<cost){$id('sanctuaryMessage').textContent='Need ✦ '+cost+' Evo Points from PvE grind.';return}sanctuaryEvolveConfirm={line,roll:true};sanctuaryRender();return}
 if(action.type==='cancelEvolution'){sanctuaryEvolveConfirm=null;sanctuaryRender();return}
 if(action.type==='evolve'&&sanctuaryEvolveConfirm?.line!==line)return;
 sanctuaryEvolveConfirm=null;
 const before=G.normalize(partnerData(slot),line)?.partners?.[line]?.battle?.status;
 const evoCost=action.type==='evolve'?G.evoPointCost(G.normalize(partnerData(slot),line)?.partners?.[line]?.stage||0):0;
 if(action.type==='evolve'){const check=G.spendEvoPoints(JSON.parse(JSON.stringify(S.digimonBag)),evoCost);if(!check.ok){$id('sanctuaryMessage').textContent=check.message;return}}
 const result=G.act(partnerData(slot),line,action,Date.now());let dirty=false;if(result.changed&&result.state){setPartnerData(slot,result.state);dirty=true}
 if(action.type==='evolve'&&result.ok){const spent=G.spendEvoPoints(S.digimonBag,evoCost);if(spent.ok){S.digimonBag=spent.state;dirty=true}}
 let reward=null;if(action.type==='battle'&&result.ok&&before==='active'&&result.state?.partners?.[line]?.battle?.status==='win'){
  reward=G.bagReward(S.digimonBag,'spar');if(reward.changed){S.digimonBag=reward.state;dirty=true}
 }
 if(dirty&&typeof save==='function')save();
 sanctuarySync();sanctuaryRender();$id('sanctuaryMessage').textContent=result.message+(reward?' '+reward.message:'');
 if(['evolve','switchForm'].includes(action.type)&&result.ok){if(app.room)send({type:'look',look:currentLook()});else syncSoloPlayer()}
}
function sanctuaryClose(){sanctuaryPanel.hidden=true;sanctuaryFrame++;sanctuaryHatch=null;$id('sanctuaryOpen').focus();$id('sanctuaryOpen').setAttribute('aria-pressed','false')}
function resetDigidex(){sanctuaryIndexPage=0;sanctuaryIndexBranch=null;const s=$id('sanctuaryIndexSearch'),st=$id('sanctuaryIndexStage'),o=$id('sanctuaryIndexOwned');if(s)s.value='';if(st)st.value='';if(o)o.checked=false}
function sanctuaryOpen(){if(!sanctuaryPanel.hidden){sanctuaryClose();return}focusHubPanel('pet');ensureDigimonBag();discardLegacyActivities();resetDigidex();sanctuarySync();
 /* v383 (owner: "every time I click digipet it should open at partners tab"): the panel no longer
    remembers the last section - a hatch, a dex visit or the evolution guide always hands back to
    the Partners grid. Deep links (shop/index) set their own view right after this call. */
 sanctuarySetView('partners');sanctuaryRender();sanctuaryPanel.hidden=false;$id('sanctuaryOpen').setAttribute('aria-pressed','true');$id('sanctuaryClose').focus();const D=globalThis.PGSocialDigimon;if(!D)return;sanctuaryStore ||= D.sharedStore();const run=++sanctuaryFrame;
 function paintOne(canvas,id,now,flip,actionAt,status){if(!canvas||!id)return;const asset=sanctuaryStore.ready(id);if(!asset){sanctuaryStore.request(id);return}let stance='idle',time=now;if(status==='faint'){stance='faint';time=(asset.record.actions.faint.length-1)*50}else if(actionAt&&now-actionAt<asset.record.actions.attack.length*50){stance='attack';time=now-actionAt}const frame=D.frameIndex(asset.record.actions[stance].length,time,stance,5),key=[id,stance,frame,flip].join(':');if(canvas.dataset.paint!==key){canvas.dataset.paint=key;D.draw(canvas.getContext('2d'),asset,stance,time,5,flip)}}
 function paint(now){if(run!==sanctuaryFrame||sanctuaryPanel.hidden)return;if(sanctuaryView==='partners'){const grid=$id('sanctuaryPartnerGrid');if(grid)for(const card of grid.querySelectorAll('[data-partner-slot]'))if(card.dataset.form)paintOne(card.querySelector('canvas'),card.dataset.form,now,false,0,'');const line=partnerLine();paintOne($id('sanctuaryHero'),globalThis.PGDigimonSanctuary?.species(partnerData(),line)||line,now,false,0,'')}requestAnimationFrame(paint)}requestAnimationFrame(paint);
 function tick(){if(run!==sanctuaryFrame||sanctuaryPanel.hidden)return;const G=globalThis.PGDigimonSanctuary;if(G&&typeof S==='object'&&S){const slot=activePartnerSlot(),u=G.update(partnerData(slot),Date.now(),partnerLine(slot));if(u.changed&&u.state){setPartnerData(slot,u.state);if(typeof save==='function')save();sanctuarySync();sanctuaryRender()}else sanctuaryCountdown()}setTimeout(tick,1000)}setTimeout(tick,1000);
}
function openSanctuaryShop(){ensureDigimonBag();if(sanctuaryPanel.hidden)sanctuaryOpen();sanctuarySetView('evolution');$id('sanctuaryMessage').textContent='Evolution Guide: review branch requirements and roll your next form.'}
function openSanctuaryIndex(){ensureDigimonBag();if(sanctuaryPanel.hidden)sanctuaryOpen();sanctuarySetView('index');$id('sanctuaryMessage').textContent='Guide Nia: every listed evolution is a direct possibility, not a fixed lineage.'}
$id('sanctuaryOpen').onclick=sanctuaryOpen;$id('sanctuaryClose').onclick=sanctuaryClose;sanctuaryPanel.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();sanctuaryClose()}};
function assignPartner(chosen){
 if(typeof S!=='object'||!S)return false;const slot=activePartnerSlot();
 {const busy=battleBusySlot();if(busy!=null&&busy===slot){$id('sanctuaryMessage').textContent='Stop this partner\u2019s field or ring battle before changing it.';return false}}
 if(worldTraining&&worldTraining.slot===slot){cancelWorldTraining('Gym training stopped to switch partner.');}
 sanctuaryEvolveConfirm=null;
 // The empty roster choice only clears this slot. The explicit Dismiss button also removes the
 // species from Bag ownership so a later egg can reacquire it.
 if(chosen&&!ownsDigimon(chosen)){$id('sanctuaryMessage').textContent='Hatch that species before choosing it.';return false}
 setPartnerLine(slot,chosen||null);if(!S.plazaPartners||typeof S.plazaPartners!=='object')S.plazaPartners={};if(!worldTraining)S.plazaPartners.gym=slot;if(!myPve()&&!soloPve)S.plazaPartners.pve=slot;if(typeof save==='function')save();refreshCompanionLook();sanctuarySync();sanctuaryRender();if(app.party)partySendProfile();
 $id('sanctuaryMessage').textContent=chosen?sanctuaryName(chosen)+' is now partner '+(slot+1)+'.':'Partner '+(slot+1)+' is walking alone now.';
 return true;
}
digimonSelect.onchange=()=>{assignPartner(R.cleanDigimon(digimonSelect.value))};
$id('sanctuaryPartnerGrid').onclick=e=>{const card=e.target.closest('[data-partner-slot]');if(!card||typeof S!=='object'||!S)return;const next=Number(card.dataset.partnerSlot);if(!Number.isInteger(next)||next<0||next>3)return;{const busy=battleBusySlot();if(busy!=null&&busy===next){$id('sanctuaryMessage').textContent='That partner is in a field or ring battle - stop it before making it your follower.';return}}if(worldTraining&&worldTraining.slot===next){$id('sanctuaryMessage').textContent='That partner is in the gym - stop that session before making it your follower.';return}S.digimonActiveSlot=next;if(!S.plazaPartners||typeof S.plazaPartners!=='object')S.plazaPartners={};if(!worldTraining)S.plazaPartners.gym=next;if(!myPve()&&!soloPve)S.plazaPartners.pve=next;sanctuaryEvolveConfirm=null;if(typeof save==='function')save();refreshCompanionLook();sanctuarySync();sanctuaryRender()};
{const ownedToggle=$id('sanctuaryIndexOwned');if(ownedToggle)ownedToggle.addEventListener('change',()=>{sanctuaryIndexPage=0;sanctuaryRenderIndex()});}
$id('sanctuaryIndexSearch').addEventListener('input',()=>{sanctuaryIndexPage=0;sanctuaryRenderIndex()});
$id('sanctuaryIndexBranchClear').onclick=()=>{sanctuaryIndexBranch=null;sanctuaryIndexPage=0;sanctuaryRenderIndex()};
$id('sanctuaryIndexStage').addEventListener('change',()=>{sanctuaryIndexPage=0;sanctuaryRenderIndex()});
$id('sanctuaryIndexPrev').onclick=()=>{sanctuaryIndexPage=Math.max(0,sanctuaryIndexPage-1);sanctuaryRenderIndex()};
$id('sanctuaryIndexNext').onclick=()=>{sanctuaryIndexPage++;sanctuaryRenderIndex()};
$id('sanctuaryDismiss').onclick=()=>{
 const G=globalThis.PGDigimonSanctuary,slot=activePartnerSlot(),line=partnerLine(slot);if(!G||!line)return;
 if(worldTraining&&worldTraining.slot===slot)cancelWorldTraining('Gym training stopped because the partner was dismissed.');
 const busy=battleBusySlot();if(busy===slot){$id('sanctuaryMessage').textContent='Stop this partner’s field or ring battle before dismissing it.';return}
 const usedElsewhere=[0,1,2,3].some(i=>i!==slot&&partnerLine(i)===line);let message='Partner '+(slot+1)+' is walking alone now.';
 if(!usedElsewhere){const result=G.bagDismiss(S.digimonBag,line);if(result.ok){S.digimonBag=result.state;message=result.message}}
 setPartnerLine(slot,null);sanctuaryEvolveConfirm=null;if(typeof save==='function')save();refreshCompanionLook();sanctuarySync();sanctuaryRender();$id('sanctuaryMessage').textContent=message;
};
$id('sanctuaryGameplay').onclick=e=>{const gearSlot=e.target.closest('[data-partner-gear-kind]');if(gearSlot){sanctuaryGearFilterKind=gearSlot.dataset.partnerGearKind||'';sanctuaryGearFilterTier='';sanctuaryGearSelected=gearSlot.dataset.partnerGearUid||'';sanctuarySetView('bag');return}const titleButton=e.target.closest('[data-digi-title]');if(titleButton){equipDigiTitle(titleButton.dataset.digiTitle==='none'?null:titleButton.dataset.digiTitle);return}if(e.target.closest('[data-open-digidex]')){const G=globalThis.PGDigimonSanctuary,form=partnerLine()&&(G?.species(partnerData(),partnerLine())||partnerLine());if(form){sanctuaryIndexBranch=form;$id('sanctuaryIndexSearch').value='';$id('sanctuaryIndexStage').value='';sanctuaryIndexPage=0}sanctuarySetView('index');sanctuaryRenderIndex();return}if(e.target.closest('[data-open-bag]')){sanctuarySetView('bag');return}if(e.target.closest('[data-gym-stop]')){cancelWorldTraining();return}const button=e.target.closest('[data-sanctuary-action]');if(!button||button.disabled)return;sanctuaryCommit({type:button.dataset.sanctuaryAction,stat:button.dataset.stat,command:button.dataset.command,target:button.dataset.target})};
function sanctuaryBuy(item,quantity){
 const G=globalThis.PGDigimonSanctuary,bag=ensureDigimonBag();if(!G||!bag||typeof S!=='object'||!S)return;
 const result=G.bagBuy(bag,item,quantity);if(result.changed){S.digimonBag=result.state;if(typeof save==='function')save()}sanctuaryRenderAux();$id('sanctuaryMessage').textContent=result.message;
}
function restoredPartnerData(line,targetSlot){
 const G=globalThis.PGDigimonSanctuary,target=G?.normalize(partnerData(targetSlot),line);if(!G||!target)return target;
 let best=null,bestScore=-1;
 for(const slot of [0,1,2,3]){const raw=partnerData(slot),saved=raw?.partners?.[line];if(!saved)continue;const p=G.normalize(raw,line)?.partners?.[line];if(!p)continue;const score=(p.peakStage||p.stage||0)*1e9+(p.xp||0)*1e5+(p.wins||0)*100+G.total(p);if(score>bestScore){bestScore=score;best=p}}
 if(best)target.partners[line]=best;
 return target;
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
 const nextPartner=restoredPartnerData(result.line,slot);if(!nextPartner){$id('sanctuaryMessage').textContent='This DigiPet save uses a newer version; the egg was not consumed.';return}
 S.digimonBag=result.state;S.digimonActiveSlot=slot;setPartnerLine(slot,result.line);setPartnerData(slot,nextPartner);sanctuaryHatch=result.line;if(typeof save==='function')save();refreshCompanionLook();sanctuarySync();sanctuaryRender();$id('sanctuaryMessage').textContent=result.message+' It now lives in partner slot '+(slot+1)+'.';
}
for(const b of sanctuaryPanel.querySelectorAll('[data-sanctuary-view]'))b.onclick=()=>{if(b.dataset.sanctuaryView==='index')resetDigidex();sanctuarySetView(b.dataset.sanctuaryView);if(b.dataset.sanctuaryView==='partners'){sanctuarySync();sanctuaryRender()}};
 $id('sanctuaryBagView').onpointerover=e=>{const tile=e.target.closest('[data-gear-select]');if(!tile||tile.dataset.gearSelect===sanctuaryGearSelected||e.pointerType==='touch')return;sanctuaryGearSelected=tile.dataset.gearSelect;sanctuaryRenderAux()};
 $id('sanctuaryBagView').onclick=e=>{
 const selectGear=e.target.closest('[data-gear-select]');if(selectGear){sanctuaryGearSelected=selectGear.dataset.gearSelect;sanctuaryRenderAux();return}
 const kindTab=e.target.closest('[data-gear-kind]');if(kindTab){sanctuaryGearFilterKind=kindTab.dataset.gearKind||'';sanctuaryGearSelected='';sanctuaryRenderAux();return}
 const auto=e.target.closest('[data-gear-auto]');if(auto){const G=globalThis.PGDigimonSanctuary,result=G.setGearAutoSell(S.digimonBag,Number(auto.dataset.gearAuto),auto.checked);if(result.ok){S.digimonBag=result.state;if(typeof save==='function')save()}$id('sanctuaryMessage').textContent=result.message;sanctuaryRenderAux();return}
 const gearButton=e.target.closest('[data-gear-action]');
 if(gearButton&&!gearButton.disabled){
  const G=globalThis.PGDigimonSanctuary,uid=gearButton.dataset.gearUid,action=gearButton.dataset.gearAction;
  let result=null;
  if(action==='equip'){const select=gearButton.closest('[data-gear-detail]')?.querySelector('[data-gear-line]');result=G.gearEquip(S.digimonBag,uid,select?.value||partnerLine())}
  else if(action==='unequip')result=G.gearUnequip(S.digimonBag,uid);
  else if(action==='sell')result=G.gearSell(S.digimonBag,uid);
  else if(action==='sell-auto')result=G.gearSellMatchingAuto(S.digimonBag);
  else if(action==='refine'||action==='tier')result=G.bagForge(S.digimonBag,uid,action);
  if(result){$id('sanctuaryMessage').textContent=result.message;if(result.ok){S.digimonBag=result.state;if(action==='sell')sanctuaryGearSelected='';if(typeof save==='function')save()}}
  sanctuaryRenderAux();return;
 }
 const shopBtn=e.target.closest('[data-shop-item]');if(shopBtn&&!shopBtn.disabled){sanctuaryBuy(shopBtn.dataset.shopItem,Number(shopBtn.dataset.quantity)||1);return;}
 const button=e.target.closest('[data-bag-action]');if(!button||button.disabled)return;
 if(button.dataset.bagAction==='hatch')sanctuaryHatchEgg();
 else if(button.dataset.bagAction==='show-partner'){sanctuarySetView('partners');sanctuarySync();sanctuaryRender()}
 else if(button.dataset.bagAction==='open-shop'){sanctuarySetView('evolution')}
};
$id('sanctuaryEvolutionView').onclick=e=>{if(e.target.closest('[data-open-digidex]')){const G=globalThis.PGDigimonSanctuary,form=partnerLine()&&(G?.species(partnerData(),partnerLine())||partnerLine());if(form){sanctuaryIndexBranch=form;$id('sanctuaryIndexSearch').value='';$id('sanctuaryIndexStage').value='';sanctuaryIndexPage=0}sanctuarySetView('index');sanctuaryRenderIndex();return}const jump=e.target.closest('[data-digidex-form]');if(jump){const G=globalThis.PGDigimonSanctuary,id=jump.dataset.digidexForm;if(G&&G.ROSTER.includes(id)){sanctuaryIndexBranch=id;$id('sanctuaryIndexSearch').value=G.name(id);$id('sanctuaryIndexStage').value='';sanctuaryIndexPage=0;sanctuarySetView('index');sanctuaryRenderIndex()}return}const button=e.target.closest('[data-sanctuary-action]');if(button&&!button.disabled)sanctuaryCommit({type:button.dataset.sanctuaryAction,target:button.dataset.target})};
$id('sanctuaryMasteryView').onclick=e=>{const goto=e.target.closest('[data-goto-view]');if(goto){sanctuarySetView(goto.dataset.gotoView);return}const button=e.target.closest('[data-sanctuary-action]');if(button&&!button.disabled)sanctuaryCommit({type:button.dataset.sanctuaryAction})};
$id('sanctuaryTitlesView').onclick=e=>{const titleButton=e.target.closest('[data-digi-title]');if(titleButton){equipDigiTitle(titleButton.dataset.digiTitle==='none'?null:titleButton.dataset.digiTitle)}};
// v355: grind parties. Up to three trainers share one middle-field run: the leader invites,
// everyone equips a partner, and the leader starts - three Digimon then fight the same waves.
// The panel doubles as the PvP lobby: it lists who is waiting by the ring and walks you over.
let partyProfileDirty=true;
function partySendProfile(){if(app.room&&app.connected&&app.socket?.readyState===1){const profile=battleProfileFor();if(profile)send({type:'party_profile',profile})}}
function partyCandidates(){
 const taken=new Set();for(const p of app.partyRoster||[])for(const id of p.members||[])taken.add(id);
 if(app.party)for(const m of app.party.members||[])taken.add(m.id);
 return [...app.players.values()].filter(p=>p.id!==(app.room?app.id:SOLO_ID)&&p.room===app.room&&!taken.has(p.id));
}
function renderPartyPanel(){
 const body=$id('socialPartyBody');if(!body)return;
 const online=!!(app.room&&app.connected&&app.socket?.readyState===1),party=app.party,tab=app.partyTab==='pvp'?'pvp':'pve';
 // Tab strip: PvE grind party and the PvP ring lobby are separate sections now, each
 // opened by its own toolbar button (v357).
 let html='<div class="social-party-tabs-inner" role="tablist" aria-label="Party sections">'
  +'<button type="button" role="tab" data-party-tab="pve" aria-selected="'+(tab==='pve')+'" class="'+(tab==='pve'?'is-active':'')+'">⚔ Grind Party <small>up to 3</small></button>'
  +'<button type="button" role="tab" data-party-tab="pvp" aria-selected="'+(tab==='pvp')+'" class="'+(tab==='pvp'?'is-active':'')+'">🥊 PvP Ring <small>lobby</small></button></div>';
 if(!online){
  html+='<div class="social-party-note">'+(tab==='pvp'
   ?'The PvP lobby needs an online plaza. Local solo practice stays on the ring stairs.'
   :'Parties need an online plaza. Local solo grinding stays in the middle field.')+'</div>';
 }else if(tab==='pve'){
  html+='<div class="social-party-section"><small>GRIND PARTY · UP TO 3 TRAINERS · ONE SHARED FIELD</small>';
  if(party&&party.members&&party.members.length){
   html+='<ul class="social-party-members">'+party.members.map(m=>'<li'+(m.id===party.leader?' class="is-leader"':'')+'>'+(m.id===party.leader?'👑 ':'')+escape(m.name)+(m.id===(app.room?app.id:SOLO_ID)?' <em>(you)</em>':'')+' <em>'+escape(m.form||'')+'</em></li>').join('')+'</ul>';
   const isLeader=party.leader===(app.room?app.id:SOLO_ID);
   if(party.members.length<3&&isLeader){
    const candidates=partyCandidates();
    html+='<div class="social-party-invite"><select id="socialPartyInvitee" aria-label="Choose a trainer to invite">'+(candidates.length?candidates.map(p=>'<option value="'+p.id+'">'+escape(p.name)+'</option>').join(''):'<option value="">No trainers free to invite</option>')+'</select><button type="button" id="socialPartyInviteBtn" class="social-party-start">Invite</button></div>';
   }else if(party.members.length<3)html+='<div class="social-party-note">The leader can invite one more trainer.</div>';
   if(isLeader)html+='<button type="button" id="socialPartyStartBtn" class="social-party-start">⚔ Start party grind</button><button type="button" id="socialPartyBossBtn" class="social-party-start is-boss">☠ Party boss raid</button><div class="social-party-note">Everyone must stand still in the middle DigiPet farm field. A grind sends a bigger bot group; a boss raid puts the whole party against one boss with charges, a shield phase, enrage and backup adds.</div>';
   html+='<button type="button" id="socialPartyLeaveBtn" class="social-party-leave">Leave party</button>';
  }else{
   html+='<div class="social-party-note">No party yet. Invite a trainer to form one - you become the leader and can start the shared grind.</div>';
   const candidates=partyCandidates();
   html+='<div class="social-party-invite"><select id="socialPartyInvitee" aria-label="Choose a trainer to invite">'+(candidates.length?candidates.map(p=>'<option value="'+p.id+'">'+escape(p.name)+'</option>').join(''):'<option value="">No trainers free to invite</option>')+'</select><button type="button" id="socialPartyInviteBtn" class="social-party-start">Invite</button></div>';
  }
  html+='</div>';
 }else{
  // PvP lobby tab: who is waiting by the ring, one click to walk to the stairs and queue.
  const queue=app.battle.queue||[],meQueued=myQueue();
  html+='<div class="social-party-section"><small>PVP RING LOBBY · FIRST TWO TRAINERS FIGHT</small>';
  html+=queue.length?'<ul class="social-party-queue">'+queue.map(q=>'<li>'+escape(q.name||('Trainer '+q.id))+' <em>'+escape(q.side||'?')+' side</em></li>').join('')+'</ul>':'<div class="social-party-note">Nobody is queued yet - join to walk to the ring stairs.</div>';
  const match=myPvp();
  if(match&&match.phase!=='result')html+='<div class="social-party-note">A match is in progress.</div>';
  if(meQueued)html+='<button type="button" id="socialPartyLobbyBtn" class="social-party-leave">Leave the PvP queue</button>';
  else html+='<button type="button" id="socialPartyLobbyBtn" class="social-party-start">🥊 Join the PvP lobby</button>';
  html+='</div>';
 }
 html+='<label class="social-party-mute"><input type="checkbox" id="socialPartyMute" '+(typeof S==='object'&&S&&S.plazaPartyMute?'checked':'')+'> Block party invite pop-ups</label>';
 if(app.partyInvite)html+='<div class="social-party-invite-card"><span>'+escape(app.partyInvite.from?.name||'A trainer')+' invites you to their party.</span><button type="button" id="socialPartyAcceptBtn">Accept</button><button type="button" id="socialPartyDeclineBtn">Decline</button></div>';
 body.innerHTML=html;
 for(const b of body.querySelectorAll('[data-party-tab]'))b.onclick=()=>{app.partyTab=b.dataset.partyTab;renderPartyPanel()};
 const inviteBtn=$id('socialPartyInviteBtn');
 if(inviteBtn)inviteBtn.onclick=()=>{const sel=$id('socialPartyInvitee');if(!sel||!sel.value)return;send({type:'party_invite',targetId:Number(sel.value)});worldNotice('Party invite sent.')};
 const startBtn=$id('socialPartyStartBtn');
 if(startBtn)startBtn.onclick=()=>{partySendProfile();send({type:'party_start',mode:'grind'})};
 const bossBtn=$id('socialPartyBossBtn');
 if(bossBtn)bossBtn.onclick=()=>{partySendProfile();send({type:'party_start',mode:'boss'})};
 const leaveBtn=$id('socialPartyLeaveBtn');
 if(leaveBtn)leaveBtn.onclick=()=>send({type:'party_leave'});
 const lobbyBtn=$id('socialPartyLobbyBtn');
 if(lobbyBtn)lobbyBtn.onclick=()=>{
  if(myQueue())return send({type:'pvp_cancel'});
  const ring=R.SANCTUARY_RING,taken=new Set((app.battle.queue||[]).map(q=>q.side));
  const side=taken.has('left')?'right':taken.has('right')?'left':(Math.random()<.5?'left':'right');
  // v357: the ring is entered only from the west stairs, so the lobby walks you beside
  // the ring - the west stair side or the east side - never onto the platform itself.
  performMoveAction(side==='left'?ring.x-ring.w/2-3.5:ring.x+ring.w/2+3.5,side==='left'?ring.z:ring.z+6,true);
  worldNotice(side==='left'?'Walking to the ring stairs - press Enter PvP ring when you arrive.':'Walking to the east side of the ring - press Enter PvP ring when you arrive.');
 };
 const acceptBtn=$id('socialPartyAcceptBtn');
 if(acceptBtn)acceptBtn.onclick=()=>{send({type:'party_accept'});partySendProfile();app.partyInvite=null;syncPartyChrome();renderPartyPanel()};
 const declineBtn=$id('socialPartyDeclineBtn');
 if(declineBtn)declineBtn.onclick=()=>{send({type:'party_decline'});app.partyInvite=null;syncPartyChrome();renderPartyPanel()};
 const mute=$id('socialPartyMute');if(mute)mute.onchange=()=>{if(typeof S==='object'&&S){S.plazaPartyMute=mute.checked;if(typeof save==='function')save()}if(mute.checked&&app.partyInvite){send({type:'party_decline'});app.partyInvite=null;syncPartyChrome()}};
}
function openPartyPanel(tab){
 const panel=$id('socialPartyPanel');
 if(!panel.hidden&&(!tab||app.partyTab===(tab||'pve'))){panel.hidden=true;$id('socialPartyBtn').setAttribute('aria-pressed','false');return}
 focusHubPanel('party');
 if(panel.hidden||app.partyTab!==tab){app.partyTab=tab||'pve'}
 if(panel.hidden){panel.hidden=false;$id('socialPartyBtn').setAttribute('aria-pressed','true');partySendProfile();renderPartyPanel()}
}
$id('socialPartyBtn').onclick=()=>openPartyPanel();
$id('socialPartyClose').onclick=()=>{$id('socialPartyPanel').hidden=true};
const partyToast=document.createElement('div');partyToast.id='socialPartyToast';partyToast.hidden=true;hub.append(partyToast);
const partyHud=document.createElement('div');partyHud.id='socialPartyHud';partyHud.hidden=true;hub.append(partyHud);
function partyMuteOn(){return !!(typeof S==='object'&&S&&S.plazaPartyMute)}
function syncPartyChrome(){
 const btn=$id('socialPartyBtn');if(btn)btn.classList.toggle('has-invite',!!app.partyInvite);
 if(app.partyInvite&&!partyMuteOn()){
  partyToast.hidden=false;
  partyToast.innerHTML='<strong>'+escape(app.partyInvite.from?.name||'A trainer')+'</strong> invited you to a grind party.<span><button type="button" data-party-toast="accept">Accept</button><button type="button" data-party-toast="decline">Decline</button></span>';
 }else{partyToast.hidden=true;partyToast.replaceChildren()}
 const party=app.party;
 if(party&&party.members&&party.members.length){
  partyHud.hidden=false;
  partyHud.innerHTML='<div class="party-hud-head"><i class="party-hud-ring" aria-hidden="true"></i><b>Party</b><small>'+party.members.length+'/3</small></div><ul>'+party.members.map(m=>'<li'+(m.id===party.leader?' class="is-leader"':'')+'><i></i><span>'+escape(m.name)+(m.id===(app.room?app.id:SOLO_ID)?' (you)':'')+'</span><em>'+escape(m.form||'')+'</em></li>').join('')+'</ul>';
 }else{partyHud.hidden=true;partyHud.replaceChildren()}
}
partyToast.onclick=e=>{const a=e.target.closest('[data-party-toast]');if(!a)return;if(a.dataset.partyToast==='accept'){send({type:'party_accept'});partySendProfile()}else send({type:'party_decline'});app.partyInvite=null;syncPartyChrome();renderPartyPanel()};
// v355: plaza mini-map + full map. The Social Hub never had a spatial overview; this paints the
// shared social-rules geometry (lake, bridge, paths, buildings, gym, farm, ring, poker tables)
// plus every live player, colour-coded by relationship and activity. The small corner map is a
// button: clicking it opens the big labelled map with the same live data.
const MAP_WORLD={x0:R.MIN_X-8,x1:R.MAX_X+8,z0:R.MIN_Z-8,z1:R.MAX_Z+8};
function mapColors(){return {ground:'#1c2a22',groundEdge:'#31463a',water:'#173d52',waterEdge:'#2e6f8a',bridge:'#8a6b45',path:'#5f5340',tree:'#2e4a2b',treeEdge:'#3f6136',building:'#4a4335',buildingEdge:'#645a45',farmFill:'#7bb24f2e',farmEdge:'#7bb24f',gymFill:'#d08a3e2e',gymEdge:'#d08a3e',ringFill:'#c8543f2e',ringEdge:'#c8543f',poker:'#b89652',label:'#f4dfaa'}}
function mapBattlers(){const set=new Set();for(const run of app.battle.pve||[])set.add(run.owner);const m=app.battle.pvp;if(m)for(const p of m.participants||[])set.add(p.id);for(const q of app.battle.queue||[])set.add(q.id);return set}
function mapPlayerColor(pl,selfId,battlers){
 if(pl.id===selfId)return '#ffd257';
 if(battlers.has(pl.id))return '#ff6b57';
 if(pl.friend)return '#59d98c';
 if(pl.fish&&pl.fish.on)return '#5fd6d0';
 return '#8fb3ff';
}
function drawPlazaMap(canvas,detailed){
 // v357 (owner: "the mini-map sucks - remake it"): a full repaint as a painted overview
 // rather than flat colour blocks - layered water with shimmer, road strokes, tree
 // canopies with shadows that merge into groves, roof-shaded buildings, tinted grounds
 // with landmark icons, and players with direction wedges. Everything still derives from
 // the shared social-rules geometry, so dots stay honest to the live world.
 if(!canvas)return;let ctx=null;try{ctx=canvas.getContext&&canvas.getContext('2d')}catch{ctx=null}
 if(!ctx||!ctx.fillRect)return;
 const w=canvas.width,h=canvas.height,t=Date.now()/1000;
 const ww=MAP_WORLD.x1-MAP_WORLD.x0,wh=MAP_WORLD.z1-MAP_WORLD.z0,margin=detailed?30:6;
 const sc=Math.min((w-margin*2)/ww,(h-margin*2)/wh),ox=(w-ww*sc)/2-MAP_WORLD.x0*sc,oz=(h-wh*sc)/2-MAP_WORLD.z0*sc;
 const X=x=>x*sc+ox,Z=z=>z*sc+oz;
 // Afterdark map plate; keep the same live markers and shared geometry.
 const P={frame:'#151a22',frameEdge:'#55616b',ground:'#202a30',mottle:'#253238',road:'#526269',roadEdge:'#35434c',
  water:'#477d8e',waterShore:'#365761',waterCore:'#315f72',shimmer:'#a6d0d2',bridge:'#aa8b6c',
  treeRim:'#233b35',pine:'#50735d',broad:'#668875',sakura:'#b88da4',palm:'#7f9572',treeShadow:'rgba(0,0,0,.35)',
  roof:'#af8b6c',roofBase:'#6b5c51',roofEdge:'#1c242c',label:'#dbe5e5',labelHalo:'rgba(16,23,30,.95)'};
 ctx.clearRect(0,0,w,h);
 // Framed plate with a bevel, like a field map on a table.
 if(ctx.roundRect){ctx.beginPath();ctx.roundRect(1,1,w-2,h-2,detailed?10:7)}else ctx.rect(1,1,w-2,h-2);
 ctx.fillStyle=P.ground;ctx.fill();ctx.lineWidth=detailed?3:2;ctx.strokeStyle=P.frame;ctx.stroke();
 ctx.lineWidth=1;ctx.strokeStyle=P.frameEdge;ctx.strokeRect(3.5,3.5,w-7,h-7);
 // Soft large patches keep the ground from reading flat, without confetti noise.
 for(let i=0;i<(detailed?26:10);i++){
  const gx=((i*173+41)%Math.max(1,w+40))-20,gz=((i*89+17)%Math.max(1,h+40))-20;
  ctx.fillStyle=i%2?P.mottle:P.ground;
  ctx.fillRect(gx,gz,detailed?90:60,detailed?70:46);
 }
 const rr=(x,y,rw,rh,r)=>{if(ctx.roundRect){ctx.beginPath();ctx.roundRect(x,y,rw,rh,r)}else ctx.rect(x,y,rw,rh)};
 // Roads: the avenue and the promenade as soft strokes with an edge.
 const road=(x1,z1,x2,z2,wd)=>{ctx.lineCap='round';ctx.lineWidth=wd+2;ctx.strokeStyle=P.roadEdge;ctx.beginPath();ctx.moveTo(X(x1),Z(z1));ctx.lineTo(X(x2),Z(z2));ctx.stroke();ctx.lineWidth=wd;ctx.strokeStyle=P.road;ctx.beginPath();ctx.moveTo(X(x1),Z(z1));ctx.lineTo(X(x2),Z(z2));ctx.stroke()};
 road(0,R.MIN_Z,0,R.MAX_Z,detailed?7:4);road(-74,0,102,0,detailed?7:4);road(14,12,66,42,detailed?5:3);
 const props=(R.POND_PROPS||[])[0];
 if(props)for(const p of props.paths||[])road(p.x1,p.z,p.x2,p.z,detailed?4:2.5);
 // Grounds: tinted rounded plates under the DigiPet areas before their contents.
 for(const [id,tint] of [['gym','rgba(150,110,70,.30)'],['farm','rgba(90,130,70,.30)'],['ring','rgba(150,70,58,.30)']]){
  const z=(R.SANCTUARY||[]).find(a=>a.id===id);if(!z)continue;
  rr(X(z.x-z.w/2),Z(z.z-z.d/2),z.w*sc,z.d*sc,detailed?10:6);ctx.fillStyle=tint;ctx.fill();
  ctx.setLineDash([5,3]);ctx.lineWidth=detailed?1.6:1;ctx.strokeStyle=P.frameEdge;ctx.stroke();ctx.setLineDash([]);
 }
 // Lake: shore band, water body, deep core and animated shimmer dashes.
 const pond=R.PONDS&&R.PONDS[0];
 const pondPath=(pad)=>{ctx.beginPath();for(let i=0;i<=96;i++){const pt=R.pondBoundary(pond,i*Math.PI*2/96,pad);const px=X(pt.x),pz=Z(pt.z);i?ctx.lineTo(px,pz):ctx.moveTo(px,pz)}ctx.closePath()};
 if(pond){
  pondPath(2.2);ctx.fillStyle=P.waterShore;ctx.fill();
  pondPath(0);ctx.fillStyle=P.water;ctx.fill();
  pondPath(-3);ctx.fillStyle=P.waterCore;ctx.fill();
  ctx.strokeStyle=P.shimmer;ctx.lineWidth=detailed?1.6:1;
  for(let i=0;i<14;i++){const a=i/14*Math.PI*2+Math.sin(t*.6+i)*.14,r=pond.w*.3+((i*53)%100)/100*pond.w*.24;
   const px=X(pond.x+Math.cos(a)*r*.5),pz=Z(pond.z+Math.sin(a)*r*.5);
   ctx.beginPath();ctx.moveTo(px-3,pz);ctx.lineTo(px+3,pz);ctx.stroke()}
 }
 if(props&&props.bridge){const b=props.bridge;
  ctx.fillStyle=P.bridge;ctx.fillRect(X(b.x-b.span/2),Z(b.z-b.width/2),b.span*sc,b.width*sc);
  ctx.strokeStyle=P.roofEdge;ctx.lineWidth=1;ctx.strokeRect(X(b.x-b.span/2),Z(b.z-b.width/2),b.span*sc,b.width*sc)}
 // Tree canopies: shadow first, then a two-tone canopy whose rim makes neighbours merge
 // into groves. Species keep their own greens; sakura reads pink, palms lean olive.
 const canopy=(x,z,r,fill)=>{
  ctx.beginPath();ctx.arc(X(x)+r*.28,Z(z)+r*.36,r*.92,0,7);ctx.fillStyle=P.treeShadow;ctx.fill();
  ctx.beginPath();ctx.arc(X(x),Z(z),r,0,7);ctx.fillStyle=P.treeRim;ctx.fill();
  ctx.beginPath();ctx.arc(X(x)-r*.12,Z(z)-r*.14,r*.82,0,7);ctx.fillStyle=fill;ctx.fill();
 };
 for(const t of R.TREES||[])canopy(t.x,t.z,Math.max(3,t.size*sc*.36),P.broad);
 for(const t of R.SANCTUARY_TREES||[]){
  const r=Math.max(detailed?3.4:2.2,(t.kind?3.4:3)*sc);
  canopy(t.x,t.z,r,t.kind==='sakura'?P.sakura:t.kind==='palm'?P.palm:t.kind==='pine'?P.pine:P.broad);
 }
 // Benches: tiny warm ticks.
 for(const b of R.BENCHES||[]){ctx.fillStyle='#8a6b45';ctx.fillRect(X(b.x)-1.5,Z(b.z)-1,3,2)}
 // Buildings: dark base, roof plate offset toward the light, crisp outline.
 for(const b of R.BUILDINGS||[]){
  const bx=X(b.x-b.w/2),bz=Z(b.z-b.d/2),bw=b.w*sc,bd=b.d*sc;
  ctx.fillStyle=P.roofBase;ctx.fillRect(bx,bz,bw,bd);
  ctx.fillStyle=P.roof;ctx.fillRect(bx-1,bz-2,bw,bd*.72);
  ctx.strokeStyle=P.roofEdge;ctx.lineWidth=1;ctx.strokeRect(bx-1,bz-2,bw,bd);
 }
 // Actual angled gym wings, shared with the scene and collision rules.
 ctx.strokeStyle=P.roof;ctx.lineWidth=Math.max(2,3*sc);ctx.lineCap='square';
 for(const wall of R.SANCTUARY_GYM_WALLS||[]){ctx.beginPath();ctx.moveTo(X(wall.x1),Z(wall.z1));ctx.lineTo(X(wall.x2),Z(wall.z2));ctx.stroke()}
 // Boxing ring: the platform, ropes and the west stair notch (the only way in, v357).
 const ring=R.SANCTUARY_RING;
 if(ring){
  const rx=X(ring.x-ring.w/2),rz=Z(ring.z-ring.d/2),rw=ring.w*sc,rd=ring.d*sc;
  ctx.fillStyle='#a8695a';ctx.fillRect(rx,rz,rw,rd);
  ctx.fillStyle='#efe4c4';ctx.fillRect(rx+2,rz+2,rw-4,rd-4);
  ctx.strokeStyle='#7e4a3a';ctx.lineWidth=detailed?1.6:1;ctx.strokeRect(rx,rz,rw,rd);
  ctx.strokeStyle='#8a2f28';ctx.lineWidth=detailed?2:1.4;
  ctx.beginPath();ctx.moveTo(rx,rz+rd*.5-rd*.16);ctx.lineTo(rx+rw*.16,rz+rd*.5);ctx.lineTo(rx,rz+rd*.5+rd*.16);ctx.closePath();ctx.stroke();
 }
 // Poker tables as chips.
 for(const tb2 of (R.POKER&&R.POKER.tables)||[]){const tb=tb2.table||tb2;
  ctx.beginPath();ctx.arc(X(tb.x),Z(tb.z),Math.max(3,3.2*sc),0,7);ctx.fillStyle='#3f6b4a';ctx.fill();ctx.strokeStyle='#f4dfaa';ctx.lineWidth=1;ctx.stroke()}
 // Live players: others first, self on top with a pulse ring and a heading wedge.
 const selfId=app.room?app.id:SOLO_ID,battlers=mapBattlers(),players=[...app.players.values()].sort((a,b)=>(a.id===selfId)-(b.id===selfId));
 for(const pl of players){
  if(!Number.isFinite(pl.x)||!Number.isFinite(pl.z))continue;
  const px=X(pl.x),pz=Z(pl.z),r=detailed?6:3.8,col=mapPlayerColor(pl,selfId,battlers),dir=Number.isFinite(pl.dir)?pl.dir:0;
  if(pl.id===selfId){const pulse=2.5+Math.sin(t*3)*1.2;
   ctx.beginPath();ctx.arc(px,pz,r+pulse,0,7);ctx.strokeStyle='rgba(122,74,30,.45)';ctx.lineWidth=2;ctx.stroke()}
  ctx.beginPath();ctx.arc(px,pz,r+2,0,7);ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=1.4;ctx.stroke();
  ctx.beginPath();ctx.arc(px,pz,r,0,7);ctx.fillStyle=col;ctx.fill();ctx.strokeStyle='#0d1512';ctx.lineWidth=detailed?1.5:1;ctx.stroke();
  const wa=dir*Math.PI/4;
  ctx.beginPath();ctx.moveTo(px+Math.cos(wa)*(r+4),pz+Math.sin(wa)*(r+4));
  ctx.lineTo(px+Math.cos(wa+.5)*(r+1.5),pz+Math.sin(wa+.5)*(r+1.5));
  ctx.lineTo(px+Math.cos(wa-.5)*(r+1.5),pz+Math.sin(wa-.5)*(r+1.5));ctx.closePath();
  ctx.fillStyle=col;ctx.fill();
  if(detailed&&pl.id===selfId){ctx.font='bold 12px "Trebuchet MS",sans-serif';ctx.fillStyle='#7a4a1e';ctx.textAlign='left';ctx.fillText('You',px+r+4,pz+4)}
  else if(detailed&&pl.name){ctx.font='10px "Trebuchet MS",sans-serif';ctx.fillStyle='#5b4326';ctx.textAlign='left';ctx.fillText(String(pl.name).slice(0,14),px+r+3,pz+3)}
 }
 if(detailed){
  ctx.font='bold 11px "Trebuchet MS",sans-serif';ctx.textAlign='center';
  const label=(x,z,text)=>{ctx.strokeStyle=P.labelHalo;ctx.lineWidth=3;ctx.strokeText(text,X(x),Z(z));ctx.fillStyle=P.label;ctx.fillText(text,X(x),Z(z))};
  const icon=(x,z,glyph)=>{ctx.font='13px serif';ctx.strokeStyle=P.labelHalo;ctx.lineWidth=2.5;ctx.strokeText(glyph,X(x),Z(z));ctx.fillText(glyph,X(x),Z(z))};
  if(pond){label(pond.x,pond.z,'WEST LAKE · FISHING');icon(pond.x+pond.w*.22,pond.z-pond.d*.3,'🎣')}
  const farm=(R.SANCTUARY||[]).find(a=>a.id==='farm');if(farm){label(farm.x,farm.z,'DIGIPET FARM');icon(farm.x-farm.w/2+5,farm.z-farm.d/2+6,'🥚')}
  const gym=(R.SANCTUARY||[]).find(a=>a.id==='gym');if(gym){label(gym.x,gym.z,'GYM');icon(gym.x-gym.w/2+5,gym.z-gym.d/2+6,'💪')}
  const rz=(R.SANCTUARY||[]).find(a=>a.id==='ring');if(rz){label(rz.x,rz.z,'PVP RING');icon(rz.x+rz.w/2-5,rz.z-rz.d/2+6,'🥊')}
  const pt=(R.POKER&&R.POKER.tables&&R.POKER.tables[0]&&(R.POKER.tables[0].table||R.POKER.tables[0]));if(pt){label(pt.x,pt.z-6,'PRONTERA POKER');icon(pt.x+5,pt.z-6,'🃏')}
  label(0,-6,'PRONTERA PLAZA');
  // Compass rose in the free north-east corner.
  const cx=w-34,cy=34;ctx.strokeStyle=P.label;ctx.lineWidth=1.4;
  ctx.beginPath();ctx.arc(cx,cy,13,0,7);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx,cy-17);ctx.lineTo(cx-4,cy+2);ctx.lineTo(cx,cy-3);ctx.lineTo(cx+4,cy+2);ctx.closePath();
  ctx.fillStyle=P.label;ctx.fill();ctx.font='bold 10px "Trebuchet MS",sans-serif';ctx.fillText('N',cx,cy+26);
 }
}
// The redraw rides the existing battleUITick interval (every 4th tick ~400 ms) instead of
// registering another timer, so nothing new competes with the session loop.
let mapTickFrame=0;
function mapTick(){if(hub.hidden)return;if(typeof adventureSync==='function')adventureSync();syncFieldMonitor();drawPlazaMap($id('socialMiniMapCanvas'),false);if(!$id('socialMapModal').hidden)drawPlazaMap($id('socialMapCanvas'),true)}
$id('socialMiniMap').onclick=()=>{const m=$id('socialMapModal');if(m.hidden)focusHubPanel('map');m.hidden=!m.hidden;if(!m.hidden){drawPlazaMap($id('socialMapCanvas'),true)}};
$id('socialMapClose').onclick=()=>{$id('socialMapModal').hidden=true};
const graphicsNotice=document.createElement('p');graphicsNotice.id='plazaRenderNotice';graphicsNotice.hidden=true;
graphicsNotice.setAttribute('role','status');hub.append(graphicsNotice);
function plazaGraphics(text,reload=false){
 graphicsNotice.textContent=text;graphicsNotice.hidden=!text;
 if(reload){const retry=document.createElement('button');retry.type='button';retry.textContent='Retry graphics';
  retry.onclick=()=>showUpdatePrompt(BUILD,'Reload to retry graphics after confirming your save.');graphicsNotice.append(' ',retry)}
}
// Scene construction belongs to the page, activation belongs to the latest visit/account.
let sceneCreation=null,visit=0;
async function enter(){
 // cloudAdopt replaces S, not the player or session. Activate against the live save.
 const player=()=>typeof currentUser==='string'?currentUser:null;
 const ticket=++visit,user=player(),id=CLOUD.id,epoch=CLOUD.epoch,online=CLOUD.on;
 const current=()=>ticket===visit&&app.wanted&&!!S&&player()===user&&CLOUD.id===id&&
  CLOUD.epoch===epoch&&CLOUD.on===online&&!CLOUD.signingOut&&!(typeof logout==='function'&&logout.inflight);
 app.entering=true;
 try{
  ensureDigimonBag();discardLegacyActivities();digimonSelect.value=partnerLine()||'';
  app.wanted=true;hub.hidden=false;document.body.classList.add('social-open');measureHubToolbar();syncFieldMonitor();closeHubMore();if(typeof adventureSync==='function')adventureSync();
  // Music and chat are not prerequisites for building the solo view.
  try{$id('socialBgmMount').hidden=typeof BGM!=='undefined'&&BGM.phoneShell?BGM.phoneShell():false;if(typeof BGM!=='undefined')BGM.renderUI()}catch(e){console.warn('Plaza music unavailable',e)}
  syncPokerBadges();syncPokerBounds();if(tabs.includes('map'))openTab('map');
  if(CLOUD.on&&!app.socket&&!sceneCreation){app.nextConnect=0;connect()}
  if(!app.scene){
   plazaGraphics('Loading plaza scenery… Field is available.');
   if(!sceneCreation)sceneCreation=PGSocialScene.create($id('socialScene'),$id('socialLabels'),{
    move:moveAction,menu:playerMenu,self:()=>app.room?app.id:SOLO_ID,seat:seatAction,pokerSeat:pokerSeatAction,
    pokerOpen:tid=>pokerOpen(tid),pond:(x,z,idx)=>FISHING()?.pondClick(x,z,idx),trainStation:startWorldTraining,
    sanctuaryShop:openSanctuaryShop,sanctuaryIndex:openSanctuaryIndex,trainingNearby:worldNearbyFrame,sitting,graphics:plazaGraphics
   }).then(scene=>app.scene=scene).finally(()=>{sceneCreation=null});
   await sceneCreation;
  }
  if(!current())return;
  if(!app.scene.contextLost)plazaGraphics('');
  app.scene.active=true;bindFishing();mapTick();for(const p of app.players.values())app.scene.putPlayer(p);
  plazaBotsResync();refreshGymVisuals();app.scene.setBattleState?.(app.battle);renderBattleHUD();renderPvpDialog();join();
  if(!app.room){syncSoloPlayer();if(P){const snaps=syncSoloPokerSnapshots();if(snaps)for(const s of snaps)s._clientAt=Date.now()}}
  try{if(typeof BGM!=='undefined')BGM.sync(typeof S==='object'&&S?S.mp:0)}catch(e){console.warn('Plaza music unavailable',e)}
 }catch(e){if(!current())return;plazaGraphics('Plaza graphics could not start. Choose Field, then reopen the plaza to retry.');console.error('Plaza graphics unavailable',e)}
 finally{if(ticket===visit)app.entering=false}
 return current(); // deferred activity buttons must not reopen an abandoned visit
}
function leave(){visit++;app.entering=false;worldNearbyStat='';worldNearby.hidden=true;worldTrainingHUD.hidden=true;worldBattleNearby.hidden=true;clearPveRepeat();sapDismissedArea=sapAreaNow='';closeActivityPanel();stopSoloPve('stopped',false);app.battleIntent=null;battleOffer=null;app.battleResult=null;app.battle={pve:[],pvp:null,queue:[]};battleHUD.hidden=true;pvpDialog.hidden=true;renderBattleResult();app.scene?.setBattleState?.(app.battle);if(!sanctuaryPanel.hidden)sanctuaryClose();FISHING()?.hubClosed();soloMvpNextAt=0;try{const sm=FISHING()?.getMvp?.();if(sm)FISHING()?.clearMvp?.(sm,{announce:false,retire:false})}catch{}if(pokerLeaveAction)finishPokerLeave(false);clearPokerResult();app.wanted=false;app.resume=null;pokerUI.open=false;pokerUI.minimized=false;$id('socialPokerModal').hidden=true;$id('socialPokerMini').hidden=true;if(soloTables){for(const t of soloTables)t.stand(SOLO_ID,Date.now());app.poker=null;app.pokerTables=null;}send({type:'leave'});stashLocal(app.room);app.room=0;app.rooms=[];hub.hidden=true;syncPokerChatFit();syncPokerBounds();document.body.classList.remove('social-open');$id('socialMapModal').hidden=true;if(app.scene)app.scene.active=false;resetPlayers();app.messages=app.messages.filter(m=>m.channel!=='local');pokerTableChat.clear();select('world');// v361: a hub-first account has no field behind the hub yet - the Field button drops them
   // into their saved map (which starts the battle) instead of restoring an empty screen.
   if(typeof hubFirstPending!=='undefined'&&hubFirstPending){
    hubFirstPending=false;
    if(typeof maybeGuide==='function')maybeGuide();
   }
   if(typeof S==='object'&&S&&!(typeof mobs!=='undefined'&&mobs.length)&&typeof gotoField==='function')gotoField(S.mp|0,S.lvl||1);
   else{if(typeof bars==='function'&&typeof S==='object'&&S)bars();if(typeof renderWin==='function'&&typeof S==='object'&&S)renderWin()}
   if(typeof BGM!=='undefined')BGM.sync(typeof S==='object'&&S?S.mp:0)}$id('socialLeave').onclick=()=>{if(fishingBlocked(()=>$id('socialLeave').onclick()))return;confirmPokerLeave(()=>leave())};
const socialHubBtn=$id('socialHubBtn');if(socialHubBtn)socialHubBtn.onclick=()=>enter();syncHubButton();$id('socialSit').onclick=toggleSit;
function receive(m){
 if(m.type==='battle'){battleSnapshot(m);return}
 if(m.type==='battle_fx'){
  app.scene?.battleEvent?.(m);
  // v382: patch the local snapshot from the strike stream so the HUD tracks enemy HP between
  // authoritative battle snapshots.
  if(m.kind==='pve'&&m.battleId&&m.to&&Array.isArray(app.battle?.pve)){
   const run=app.battle.pve.find(r=>r.id===m.battleId),enemy=run&&(run.enemies||[]).find(e=>e.id===m.to);
   if(enemy){enemy.hp=Math.max(0,enemy.hp-Math.max(0,Number(m.amount)||0));renderBattleHUD()}
  }
  return}
 if(m.type==='battle_mech'){
  // v382: the boss's own presentation stream (charge, barrier, enrage, adds). It carries no
  // authority; the room's snapshots and settlement stay the source of truth.
  const run=Array.isArray(app.battle?.pve)?app.battle.pve.find(r=>r.id===m.battleId):null;
  if(run&&m.fx){
   const fx=m.fx;
   run.mech=run.mech||{slamIn:0,shieldPulses:0,enraged:false,summons:0};
   if(fx.type==='boss_tell')run.mech.slamIn=Math.max(0,Number(fx.inTicks)||0);
   else if(fx.type==='boss_slam')run.mech.slamIn=0;
   else if(fx.type==='boss_enrage')run.mech.enraged=true;
   else if(fx.type==='boss_shield')run.mech.shieldPulses=fx.on?5:0;
   else if(fx.type==='boss_summon')run.mech.summons=(run.mech.summons||0)+1;
   bossFxNotice(fx);renderBattleHUD();
  }
  return}
 if(m.type==='battle_reward'){receiveBattleReward(m);return}
 if(m.type==='battle_result'){receiveBattleResult(m);return}
 if(m.type==='battle_error'){app.battleIntent=null;battleOffer=null;renderPvpDialog();worldNotice(m.message||'DigiPet battle action failed.');return}
 if(m.type==='pve_end'){app.battleIntent=null;worldNotice(m.reason==='defeat'?(m.mode==='boss'?'The raid boss won this time. Train up and challenge it again.':'Your partner fainted. Feed it and try grinding again.'):m.reason==='exhausted'?'Grinding stopped.':m.reason==='complete'?(m.mode==='boss'?'Boss raid cleared! Loot paid out.':'Field run complete! A very strong partner.'):'Grinding stopped.');renderBattleHUD();renderActivityPanel(true);/* v384: a run the player stopped by hand does not start again by itself (v371 intent; only local practice honoured it) */if(m.reason!=='stopped')repeatPveRun();return}
 if(m.type==='party'){const p=m.party;if(!p||p.members.some(x=>x.id===(app.room?app.id:SOLO_ID))){app.party=p;if(p){app.partyInvite=null;if(typeof S==='object'&&S)send({type:'raid_ready',cls:S.cls||'Adventurer',lv:S.lv||150,sex:S.sex==='f'?'f':'m'})}syncPartyChrome();renderPartyPanel();if(globalThis.PGRaid&&!$id('raidLobby')?.hidden)globalThis.PGRaid.renderLobby()}return}
 if(m.type==='party_roster'){app.partyRoster=Array.isArray(m.parties)?m.parties:[];return}
 if(m.type==='party_invite'){if(partyMuteOn()){send({type:'party_decline'});return}app.partyInvite=m;worldNotice((m.from?.name||'A trainer')+' invites you to a party.');syncPartyChrome();if(!$id('socialPartyPanel').hidden)renderPartyPanel();return}
 if(m.type==='party_error'){worldNotice(m.message||'Party action failed.');return}
 if(m.type==='party_notice'){worldNotice(m.message||'');return}
 if(m.type==='raid_lobby'){if(globalThis.PGRaid)globalThis.PGRaid.onLobby(m);return}
 if(m.type==='raid_chat'){if(globalThis.PGRaid)globalThis.PGRaid.onChat(m);return}
 if(m.type==='raid_started'){if(globalThis.PGRaid)globalThis.PGRaid.onStarted(m);return}
 if(m.type==='raid_sync'){if(globalThis.PGRaid)globalThis.PGRaid.onSync(m);return}
 if(m.type==='raid_revive'){if(globalThis.PGRaid)globalThis.PGRaid.onRevive(m);return}
 if(m.type==='raid_end'){if(globalThis.PGRaid)globalThis.PGRaid.onEnded(m);return}
 if(m.type==='raid_error'){worldNotice(m.message||'Raid action failed.');if(globalThis.PGRaid)globalThis.PGRaid.onError(m);return}
 if(m.type==='pve_client'){beginClientPve(m);return}
 if(m.type==='pvp_client'){beginClientPvp(m);return}
 if(m.type==='pvp_offer'){battleOffer=m;renderPvpDialog();return}
 if(m.type==='pvp_waiting'){app.battleIntent=null;renderBattleHUD();worldNotice('Waiting for an opponent on the opposite side of the ring…');return}
 if(m.type==='pvp_countdown'){battleOffer=null;if(Number.isFinite(m.serverNow))app.battleOffset=m.serverNow-Date.now();renderPvpDialog();return}
 if(m.type==='pvp_cancelled'){battleOffer=null;app.battleResult=null;pvpDialog.hidden=true;renderBattleResult();worldNotice(m.reason==='disconnect'?'The other trainer disconnected. Match cancelled.':m.reason==='left-ring'?'You left the ring, so the PvP queue was cleared.':'Ring match cancelled.');if(myQueue())app.battle={...app.battle,queue:(app.battle.queue||[]).filter(q=>q.id!==app.id)};renderBattleHUD();return}
 if(m.type==='gym_started'){if(worldTraining?.phase==='pending'&&worldTraining.request===m.request&&worldTraining.room===m.gym?.room&&worldTraining.stat===m.gym?.stat)beginWorldTraining(m.gym.slot);return}
 if(m.type==='gym_error'){if(worldTraining?.phase==='pending'&&worldTraining.request===m.request){worldTraining=null;worldNotice(m.message||'Could not reserve equipment.')}return}
 if(m.type==='gym'&&m.room===app.room){gymEntries=Array.isArray(m.entries)?m.entries:[];refreshGymVisuals();return}
 if(m.type==='hello'){app.connected=true;app.id=m.id;app.retry=0;app.blocked=false;console.info('[plaza] hello after '+(Date.now()-(app.socketAt||Date.now()))+' ms');status('Connected · World & private chat');app.messages=mergeChatMessages(app.messages.filter(x=>x.channel!=='world'),readWorldHistory(),m.history);saveWorldHistory();renderMessages();if(app.wanted&&app.scene)join();else app.resume=null}
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
 if(m.type==='mvp_spawn'){
  if(!Number.isInteger(m.room)||m.room!==app.room)return;
  try{FISHING()?.setMvp?.(m,{mode:'plaza',room:m.room,announce:m.snapshot!==true})}catch{}
  return;
 }
 if(m.type==='mvp_despawn'){
  if(!Number.isInteger(m.room)||m.room!==app.room)return;
  try{FISHING()?.clearMvp?.(m,{mode:'plaza',room:m.room,reason:'despawn'})}catch{}
  return;
 }
 if(m.type==='fishnote'){pushFishNote(m);return}
 if(m.type==='showoff'){
  // v299: our own show-off is already on screen - the echo would draw it a second time.
  if(m.from!==app.id)try{FISHING()?.showOffEvent?.(m.from,{sp:m.sp,w:m.w,mut:m.mut,perfect:m.perfect})}catch{}
  return}
 if(m.type==='reauth')return refreshSocket();
 if(m.type==='room'){
  // v362: a plaza only behaves when the page and the Social Worker run the same rules build. The
  // worker stamps the snapshot; anything else (different stamp, or none at all - a Worker older
  // than the fingerprint) means movement, seats, fishing and battles cannot be trusted until
  // workers/social is redeployed to match the page. Say so once, the moment it is detectable,
  // instead of leaving the player to diagnose rubber-banding.
  if(m.room&&R.rulesFingerprint&&!app.rulesNoticed){const mine=R.rulesFingerprint();if(m.rules!==mine){app.rulesNoticed=true;worldNotice(m.rules?'Plaza mismatch — page '+mine+' vs Social Worker '+m.rules+'. Redeploy workers/social to match this page; movement, seats and battles will misbehave until they agree.':'This Social Worker is older than the page ('+mine+') — no plaza fingerprint was sent. Redeploy workers/social to match; movement, seats and battles will misbehave until they agree.')}}
  if(worldTraining?.room&&m.room&&m.room!==worldTraining.room)cancelWorldTraining('Gym training stopped after changing plazas.');friendPresenceChanged();if(soloTables)for(const t of soloTables)t.stand(SOLO_ID,Date.now());const moved=app.room!==m.room;if(moved){const activeMvp=FISHING()?.getMvp?.();if(activeMvp)try{FISHING()?.clearMvp?.(activeMvp,{announce:false,retire:false})}catch{}stashLocal(app.room);clearPokerResult();app.poker=null;app.pokerTables=null;pokerUI.renderKey='';}app.room=m.room;if(Array.isArray(m.rooms))app.rooms=m.rooms;plazaBotsOnRoom(m);resetPlayers();if(moved){app.messages=app.messages.filter(x=>x.channel!=='local');const back=recallLocal(m.room);if(back.length)app.messages=mergeChatMessages(app.messages,back)}pokerTableChat.clear();for(const p of m.players)putPlayer(p);if(app.room)select('local');else syncSoloPlayer();tabsUI();population();if(app.resume&&app.room){const r=app.resume;app.resume=null;if(Number.isInteger(r.pokerSeat)&&!Number.isInteger(app.players.get(app.id)?.pokerSeat))send({type:'poker_sit',seat:r.pokerSeat,buyIn:Math.max(P?.MIN_BUY_IN||40,Math.min(pokerWallet().chips,r.pokerBuyIn||P?.DEFAULT_BUY_IN||1000))});else if(Number.isInteger(r.seat)&&app.players.get(app.id)?.seat!==r.seat)send({type:'seat',id:r.seat});else if(r.sit&&!app.players.get(app.id)?.sit)send({type:'sit',confirmLeave:true})}renderPokerUI(true)} if(m.type==='player'&&m.player.room===app.room){putPlayer(m.player);friendPresenceChanged()}

 if(m.type==='left'&&m.room===app.room){app.players.delete(m.id);app.scene?.removePlayer(m.id);population();friendPresenceChanged()}
 if(m.type==='message'){if(m.channel==='local'&&m.room!==app.room)return;app.messages=mergeChatMessages(app.messages,[m]);if(m.channel==='world')saveWorldHistory();else if(m.channel==='local')stashLocal();if(app.channel!==m.channel||chat.classList.contains('minimized'))app.unread.add(m.channel);if(!app.muted.has(m.from)){if(m.channel==='local'){const fishShown=FISHING()?.onLocalMessage?.(m.from,m.body||'');if(!fishShown)app.scene?.bubble(m.from,m);pokerTableChatBubble(m)}if(app.channel===m.channel)renderMessages(true)}tabsUI()}}
// v295: the watchdog used to allow 20 s of silence plus a 6 s probe grace - longer than the
// server's old 15 s resume window, so a silent drop always came back as a fresh join at the
// plaza spawn. Detection is now 10 s + 5 s, comfortably inside the resume window, and
// visibilitychange probes the moment a throttled background tab wakes up.
const WATCHDOG_MS=10000,PROBE_GRACE_MS=5000,HANDSHAKE_MS=12000;
function seatState(){const me=app.players.get(app.id);const seated=seatedPokerSnapshot();return me?{seat:Number.isInteger(me.seat)?me.seat:null,pokerSeat:Number.isInteger(me.pokerSeat)?me.pokerSeat:null,pokerBuyIn:seated?.me?.stack||pokerUI.buyIn,sit:!!me.sit,x:me.x,z:me.z,dir:Number.isInteger(me.dir)?me.dir:0}:app.resume}
function dropSocket(message,keep){const ws=app.socket;stashLocal(app.room);app.socket=null;app.connected=false;app.battleIntent=null;app.probeAt=0;if(keep)app.resume=seatState(); // v311 (owner: "the hero jumps around on reconnect"): a dropped socket used to leave the local
 // character walking a route the room no longer knew about, and the room then restored its own
 // copy - two different heroes, one of them moving on its own. Stop the walk where it stands and
 // let the resumed spot take over.
 const me=app.players.get(app.room?app.id:SOLO_ID);
 if(me&&me.path&&me.path.length){try{R.advance(me,performance.now())}catch{}me.path=[];me.sit=false;putPlayer(me)}
 try{ws?.close()}catch{}status(message);app.nextConnect=0}
function refreshSocket(){dropSocket('Refreshing chat…',true)}
function plazaQuiet(){const me=app.players.get(app.id);return !!(me&&me.sit&&!(me.path&&me.path.length)&&!Number.isInteger(me.pokerSeat)&&!myPve()&&!myPvp()&&!myQueue())}
function heartbeat(now){if(!app.connected||!app.socket||app.socket.readyState!==1){app.probeAt=0;return}
 const quietFor=now-(app.lastSeen||now),limit=plazaQuiet()?240000:WATCHDOG_MS;
 if(quietFor<limit){app.probeAt=0;return}
 if(!app.probeAt){app.probeAt=now;send({type:'ping'});return}
 if(now-app.probeAt>PROBE_GRACE_MS)dropSocket('Chat connection lost — reconnecting…',true)}
function sitting(sit){$id('socialSit').textContent=sit?'Stand':'Sit';$id('socialSit').setAttribute('aria-pressed',String(sit))}
function putPlayer(p){p.at=performance.now();app.players.set(p.id,p);app.scene?.putPlayer(p);
 // v295: every OTHER player's line in the water is drawn. Your own rig is driven frame by frame
 // from assets/social-fishing.js, so it is deliberately skipped here or it would draw twice.
 const selfId=app.room?app.id:SOLO_ID;
 if(p.id!==selfId&&app.scene?.fishing&&typeof app.scene.fishing.setRig==='function')try{app.scene.fishing.setRig(p.id,p.fish||{on:false})}catch{}
 if(p.id===selfId)sitting(p.sit);population()}
// v403: the seeded plaza crowd. Bots live only in the scene - never in app.players - so
// population, room counts, party lists, the minimap and the hub badge keep counting real
// players only. The seed/clock/count ride the existing room snapshot (workers/social
// sendRoom), so the crowd adds zero Durable Object traffic; assets/plaza-bots.js holds the
// pure roster + schedule every viewer rebuilds from that seed.
let plazaBotSeed=null,plazaBotCount=6,plazaBotSkew=0,plazaBotRoster=null,plazaBotKey='';
const PLAZA_BOT_SOLO_SEED=0x504c415a;
function plazaBotsModule(){return typeof PGPlazaBots==='object'&&PGPlazaBots&&typeof PGPlazaBots.buildRoster==='function'?PGPlazaBots:null}
function plazaBotsRoomSeed(room){return (Math.imul(room|0,0x9e3779b9)^0x5f356495)>>>0}
function plazaBotsOnRoom(m){
 const B=plazaBotsModule();if(!B)return;
 const snap=m&&m.bots;
 if(snap&&Number.isFinite(snap.seed)){plazaBotSeed=snap.seed>>>0;plazaBotSkew=Number.isFinite(snap.at)?snap.at-Date.now():0;plazaBotCount=Math.max(0,Math.min(B.MAX_COUNT,Math.floor(snap.count)))}
 else if(m&&m.room){plazaBotSeed=plazaBotsRoomSeed(m.room);plazaBotSkew=0;plazaBotCount=B.DEFAULT_COUNT}
 // room0 (the leave ack) keeps the last crowd: leave() already stopped the plaza.
}
function plazaBotsWantedSeed(){
 if(plazaBotSeed!=null)return plazaBotSeed;
 if(typeof CLOUD==='object'&&CLOUD&&CLOUD.on)return null; // wait for the room snapshot
 return PLAZA_BOT_SOLO_SEED;
}
function plazaBotsEnsureRoster(){
 const B=plazaBotsModule();if(!B)return null;
 const seed=plazaBotsWantedSeed();
 if(seed==null||!plazaBotCount){
  if(plazaBotRoster){for(const b of plazaBotRoster)app.scene?.removePlayer?.(b.id);plazaBotRoster=null;plazaBotKey=''}
  return null;
 }
 const key=seed+':'+plazaBotCount;
 if(plazaBotRoster&&plazaBotKey===key)return plazaBotRoster;
 if(plazaBotRoster)for(const b of plazaBotRoster)app.scene?.removePlayer?.(b.id);
 plazaBotRoster=null;
 try{plazaBotRoster=B.buildRoster(seed,{count:plazaBotCount})}catch(e){console.warn('Plaza crowd:',e);plazaBotRoster=[]}
 plazaBotKey=key;
 return plazaBotRoster;
}
function plazaBotsPush(state){
 if(!app.scene||typeof app.scene.putPlayer!=='function')return;
 app.scene.putPlayer(state);
 if(app.scene.fishing&&typeof app.scene.fishing.setRig==='function')try{app.scene.fishing.setRig(state.id,state.fish||{on:false})}catch{}
}
function plazaBotsRealSeatTaken(seat){
 if(!Number.isInteger(seat))return false;
 for(const p of app.players.values())if(p.seat===seat)return true;
 return false;
}
function plazaBotsStep(bot,t,force){
 const B=plazaBotsModule();if(!B||!app.scene)return;
 const cur=B.segmentAt(bot,t),st=B.stateAt(bot,t),seg=cur.seg;
 const key=cur.cycle+':'+cur.index+':'+(st.fish?st.fish.mode:'');
 // A real player took the bot's bench or chair: stand aside for the rest of the segment
 // instead of two characters occupying one seat. Checked every tick, once per segment.
 if((seg.kind==='seat'||seg.kind==='fish')&&!bot._yielded&&Number.isInteger(seg.seat)&&plazaBotsRealSeatTaken(seg.seat)){
  bot._yielded=true;
  const fb=seg.fallback;
  const route=fb?R.path(st.x,st.z,fb):null;
  plazaBotsPush({id:bot.id,name:bot.name,room:app.room,look:bot.look,bot:true,pokerSeat:null,
   x:st.x,z:st.z,dir:st.dir||0,path:route&&route.length?route:[],sit:false,seat:null,fish:null});
  bot._key=key;
  return;
 }
 const fresh=force||bot._key!==key;
 if(fresh){
  bot._key=key;
  plazaBotsPush({id:bot.id,name:bot.name,room:app.room,look:bot.look,bot:true,pokerSeat:null,
   x:st.x,z:st.z,dir:st.dir||0,path:st.path,sit:st.sit,seat:st.seat,fish:st.fish});
 }
 // Emotion bubble, once per segment cycle: idles wave on arrival, sitters after sitting down.
 const em=seg.emote;
 if(em&&!bot._yielded){
  const ekey=cur.cycle+':'+cur.index;
  const due=em.after==='enter'?cur.local>=em.at:cur.local>=(seg.walkMs||0)+em.at;
  if(due&&bot._emoteKey!==ekey){
   bot._emoteKey=ekey;
   if(!force&&app.scene&&typeof app.scene.bubble==='function')try{app.scene.bubble(bot.id,{emotion:em.emotion})}catch{}
  }
 }
}
function plazaBotsTick(){
 const B=plazaBotsModule();if(!B||!app.wanted||!app.scene)return;
 if(typeof document!=='undefined'&&document.hidden)return;
 const roster=plazaBotsEnsureRoster();if(!roster||!roster.length)return;
 const t=Date.now()+plazaBotSkew;
 for(const bot of roster)plazaBotsStep(bot,t,false);
}
// Called after every resetPlayers(): the scene was just wiped, so all bots re-push on the next
// step (room switch, socket drop with the plaza still open, first enter).
function plazaBotsResync(){
 const B=plazaBotsModule();if(!B||!app.wanted||!app.scene)return;
 const roster=plazaBotsEnsureRoster();if(!roster||!roster.length)return;
 const t=Date.now()+plazaBotSkew;
 for(const bot of roster){bot._key=null;bot._yielded=false;plazaBotsStep(bot,t,true)}
}
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
 btn.title=known&&total?'⛲ Fountain Plaza — '+total+' inside'+(rooms.length?' ('+rooms.map(r=>'Prontera '+r.id+': '+r.count).join(' · ')+')':'')+(friends?' · '+friends+' friend'+(friends===1?'':'s')+' inside':'')+' — click to enter':'⛲ Fountain Plaza — Social Hub (fishing, poker, promenade) — click to enter';
}
function population(){
 syncHubButton();
 $id('socialPopulation').textContent=app.room?'P'+app.room+' · '+app.players.size+'/20':CLOUD.on?'Linking…':'Solo';$id('socialPopulation').title=app.room?'Prontera '+app.room+' · '+app.players.size+' / 20 adventurers':CLOUD.on?'Connecting to plaza · Solo view':'Solo plaza · Local character';
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
  opt.textContent=`Prontera ${r.id} (${r.count}/${R.CAPACITY})`;
  if(r.id!==app.room&&r.count>=R.CAPACITY)opt.disabled=true;
  sel.append(opt);
 }
 sel.value=String(app.room);
 sel.hidden=false;
}
// v313: one place decides how long to wait before the next attempt, so a socket that opens but never
// completes the handshake backs off exactly like a socket that closed.
function retryDelay(){return Math.min(30000,1000*2**Math.min(app.retry++,5))}
// v364: a failed WebSocket upgrade is invisible to JavaScript. The browser reports nothing but
// "connection failed" and then `close 1006`, so "Chat unavailable - retrying..." was the only thing
// a player could see while the actual cause - a maintenance pause, a lost cookie, a Pages deployment
// with no SOCIAL binding - stayed in the network tab. A plain GET to /api/me runs the SAME Functions
// middleware the socket traverses, and unlike the upgrade it can be read. So after two failed
// attempts, ask /me and name the reason in the plaza status line and the console.
let diagnosing=false;
async function diagnoseSocket(){
 if(diagnosing)return;diagnosing=true;
 let verdict='The chat service did not answer.';
 try{
  const r=await fetch('/api/me',{cache:'no-store',credentials:'same-origin'});
  const body=await r.json().catch(()=>({}));
  if(r.status===503&&body&&body.maintenance)verdict='The server is paused for maintenance. Chat returns when the pause is lifted.';
  else if(r.status===503)verdict='This deployment has no chat or database binding: '+((body&&(body.err||body.error))||'503')+'.';
  else if(r.status===401&&r.headers.get('X-Session')==='none')verdict='This browser has no session cookie, so chat cannot authorise you. Sign in again.';
  else if(r.status===401)verdict='Your session has ended (signed in elsewhere or expired). Sign in again.';
  else if(r.ok)verdict='The API is healthy, so the plaza Worker itself is not answering.';
  else verdict='The API answered HTTP '+r.status+'.';
  // v365: the API being healthy is not the whole answer. /api/chatcheck probes the Pages -> Worker
  // hop on the server, where the binding lives, and returns the reason the upgrade is refused.
  // Its verdict replaces the generic one: "no SOCIAL binding", "storage could not be read",
  // "the Worker is reachable" (which means the fault is elsewhere), and so on.
  if(r.ok){
   try{
    const c=await fetch('/api/chatcheck',{cache:'no-store',credentials:'same-origin'});
    const d=await c.json().catch(()=>({}));
    if(d&&d.verdict){
     // v366: chatcheck proves the BINDING, not the socket. When it says the Worker is reachable and
     // the plaza is still failing, say so honestly and point at the two things that can produce it,
     // instead of printing a reassurance that contradicts the screen.
     verdict=d.ok
      ? 'The plaza Worker answers, but this tab could not keep a chat socket. If a second device is signed in to this account it evicts this one (4001); otherwise open /api/chatcheck for the details.'
      : d.verdict;
     if(d.rules&&globalThis.PGSocialRules&&typeof PGSocialRules.rulesFingerprint==='function'&&d.rules!==PGSocialRules.rulesFingerprint())
      verdict+=' Plaza rules mismatch: page '+PGSocialRules.rulesFingerprint()+' vs Worker '+d.rules+' - redeploy workers/social from the same commit.';
     if(d.detail)console.warn('[plaza] chatcheck detail:',d.detail);
    }
   }catch{}
  }
 }catch{verdict='The API could not be reached at all (network or DNS).'}
 finally{diagnosing=false}
 console.warn('[plaza] chat unavailable:',verdict);
 status(verdict);
}
function connect(){
 // A 4001 yields to the tab that owns this account. Retrying on a timer makes two
 // tabs evict each other forever. Logout/account change (below) or a reload resets it.
 if(!CLOUD.on||!CLOUD.user||app.blocked||Date.now()<app.nextConnect)return;const user=typeof CLOUD.user==='string'?CLOUD.user:CLOUD.user.username;if(app.user!==user){app.user=user;localHistory.clear();app.messages=readWorldHistory();renderMessages();app.unread.clear();try{app.muted=new Set(JSON.parse(localStorage.getItem('pg_social_mute_'+user))||[])}catch{app.muted=new Set()}}
 const qs=CLOUD.previewToken?'?preview_session='+encodeURIComponent(CLOUD.previewToken):'';
 let ws;try{ws=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/api/social'+qs)}
 catch{app.nextConnect=Date.now()+retryDelay();status('Chat unavailable. The plaza works in solo view.');return}
 app.socket=ws;app.socketAt=Date.now();app.rulesNoticed=false;status('Connecting to chat…');
  // v366: the upgrade succeeding is NOT the same as the room answering. When it opens and then goes
  // quiet the client has no way to tell "accepted" from "accepted and ignored", so say both out loud
  // with timings. The next incident then has a clock on it instead of a guess.
  ws.onopen=()=>{if(app.socket!==ws)return;console.info('[plaza] socket open, waiting for hello ('+(Date.now()-app.socketAt)+' ms)')};ws.onmessage=e=>{if(app.socket!==ws)return;app.lastSeen=Date.now();app.probeAt=0;try{receive(JSON.parse(e.data))}catch(err){console.error('Social message',err)}};
 ws.onclose=e=>{if(app.socket!==ws)return;if(worldTraining?.room)cancelWorldTraining('Gym training stopped after disconnection.');clearPveRepeat();app.socket=null;app.connected=false;app.battleIntent=null;app.probeAt=0;
  // Logged on purpose: "why did it reconnect" is the question the plaza keeps being asked, and the
  // browser console is the only place that can answer it (1000/1006 = network or edge, 4000 = the
  // server's planned session refresh, 4001 = the same account signed in somewhere else).
  if(e.code!==4000)console.info('[plaza] chat socket closed',e.code,e.reason||'');
   // v367: 4002 is the room saying "I could not greet you" - the one failure that used to be totally
   // silent, because v366 refused the upgrade outright and the browser could only report 1006 with no
   // body. The room now completes the upgrade and closes with this code, so the reason string carries
   // the real error instead of us inferring it from a chatcheck probe that only says "reachable".
   if(e.code===4002){console.warn('[plaza] the room refused the greeting:',e.reason||'(no reason given)');
    status('Chat could not start: '+(e.reason||'the plaza room could not greet this tab')+' — retrying.')}
  if(e.code===4000){stashLocal(app.room);app.resume=seatState();app.nextConnect=0;status('Refreshing chat…');return}
  // v295: a silent drop or a network blip reserves the same thing a planned refresh does, so the
  // reconnect resumes the seat/room instead of spawning at the plaza entrance. Read it BEFORE
  // resetPlayers() wipes the map it comes from.
  // v363: taken for 4001 too. That code blocks reconnecting, so the record is never replayed - it
  // is only what keeps the standing spot (see syncSoloPlayer) instead of the fountain ring.
  app.resume=seatState();
  stashLocal();clearPokerResult();app.room=0;app.rooms=[];app.plazaFriends=0;app.poker=null;app.pokerTables=null;pokerTableChat.clear();resetPlayers();syncSoloPlayer();population();tabsUI();renderPokerMini();renderPokerUI(true);if(e.code!==4002)status(e.code===4001?'Chat moved to another tab. Reload to reconnect.':'Chat unavailable — retrying…');app.blocked=e.code===4001;app.nextConnect=Date.now()+retryDelay();
   // v364: 1006 means the upgrade never completed and the browser will never say why. Ask the API
   // once the retry ladder has had a chance, so the status line names the cause instead of repeating
   // "retrying" forever. Not for 4001 (that one explains itself) and not before a second attempt.
   if(e.code!==4001&&app.retry>=2)diagnoseSocket()};ws.onerror=()=>status('Chat unavailable — checking connection…');}
let lastLog='',lastLook='',keepAliveAt=0;setInterval(()=>{try{plazaBotsTick()}catch{}try{tickSoloMvp()}catch{}if(app.channel==='log'&&feedHidden())syncDisplay();const account=typeof CLOUD.user==='string'?CLOUD.user:CLOUD.user?.username;if(app.user&&account&&account!==app.user){const ws=app.socket;app.socket=null;ws?.close();app.connected=false;app.messages=[];localHistory.clear();app.unread.clear();app.friends.clear();app.blocked=false;app.nextConnect=0;leave();app.user=null;clearSoloMvpStorage();}if(!CLOUD.on){if(app.user||app.socket){const ws=app.socket;app.socket=null;ws?.close();app.connected=false;app.messages=[];localHistory.clear();app.unread.clear();app.muted.clear();app.friends.clear();app.blocked=false;app.nextConnect=0;app.user=null;leave();clearSoloMvpStorage();}else if(app.wanted&&app.scene){const look=JSON.stringify(currentLook());if(look!==lastLook){syncSoloPlayer();lastLook=look}}status('Sign in to use player chat');return}if(!app.socket)connect();
 // v313: a socket can open against a cold Durable Object and then sit there - Pages accepted the
 // upgrade, the room has not said hello. Nothing used to notice: the plaza showed "Connecting to
 // chat…" forever with a healthy-looking socket and no reconnect. A handshake that takes longer than
 // this is treated as a failed attempt, with the same backoff a close gets.
 else if(!app.connected&&Date.now()-(app.socketAt||0)>HANDSHAKE_MS){dropSocket('Chat took too long to answer — retrying…',true);app.nextConnect=Date.now()+retryDelay()}
 heartbeat(Date.now());
 // v388: sitters ping every 4 minutes so the plaza Durable Object can hibernate. Everyone else
 // still pings every 45 s so proxies/NAT do not drop a walking or fighting socket.
 if(app.connected&&app.socket&&app.socket.readyState===1&&Date.now()>=keepAliveAt){keepAliveAt=Date.now()+(plazaQuiet()?240000:45000);send({type:'ping'})}if(app.channel==='log'){const key=JSON.stringify(logShown().map(l=>l.id));if(key!==lastLog){lastLog=key;renderMessages(true)}}const look=JSON.stringify(currentLook());if(app.room&&lastLook&&look!==lastLook)send({type:'look',look:currentLook()});else if(!app.room&&app.wanted&&app.scene&&lastLook&&look!==lastLook)syncSoloPlayer();lastLook=look},2000);
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
function setRaidSuspend(on){
 if(on){
  hub.hidden=true;
  document.body.classList.remove('social-open');
  if(app.scene)app.scene.active=false;
 }else if(app.wanted){
  hub.hidden=false;
  document.body.classList.add('social-open');
  if(app.scene)app.scene.active=true;
  measureHubToolbar();
 }
}
window.PGSocial={enter,leave,send,setRaidSuspend,app,receive,select,syncDisplay,fishingMvpNotice,activityLog:()=>activityLog.map(x=>({...x})),pokerOpen,minimizePokerModal,syncPokerBounds,pokerSeatAction,claimDailyPokerChips,buyPokerChipsWithZeny,syncFriends,whisper,drawPlazaMap,focusHubPanel,refreshDigimon:()=>{if(!sanctuaryPanel.hidden){sanctuarySync();sanctuaryRender()}},tickSoloMvp,readSoloMvpState,writeSoloMvpState,clearSoloMvpStorage};select('world');connect();
})();
