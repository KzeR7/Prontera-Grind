/* Friends (haven-v273): the More ▸ Friends panel and the "Add friend" actions used by World and
   Whisper chat. The list itself lives on the server (`friends` table, GET/POST /api/friends); this
   file only mirrors it — exactly like assets/shop.js mirrors the Cash Shop's ownership.

   Two entry points, one source of truth:
     • More ▸ Friends         the full list: friends, requests you received, requests you sent, and a
                              name box. Accept, decline, cancel and unfriend all live here.
     • Chat name menu         "Add friend" on any name in World or Whisper (FN.addPlayer), which turns
                              into "Accept friend request" / "Friend ✓" once the server says so.

   Without a cloud account, or before migrations/0012_friends.sql has been applied, the panel says so
   in one sentence and offers nothing that would fail. */
const FN={user:null,loaded:false,loading:false,installed:true,error:'',note:'',noteKind:'',
  friends:[],incoming:[],outgoing:[],picked:null,filter:'',busy:false,online:new Set(),who:Object.create(null),limit:100};
const fnEsc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fnKey=u=>'pg_friends_'+String(u||'').toLowerCase();
const fnRead=(u)=>{try{const v=JSON.parse(localStorage.getItem(fnKey(u)));return v&&typeof v==='object'?v:null}catch(e){return null}};
const fnWrite=(v)=>{try{if(v==null)localStorage.removeItem(fnKey(FN.user));else localStorage.setItem(fnKey(FN.user),JSON.stringify(v))}catch(e){}};
function fnSession(u){
  FN.user=u;FN.loaded=false;FN.error='';FN.note='';FN.noteKind='';FN.busy=false;FN.picked=null;FN.filter='';FN.who=Object.create(null);
  // The last known list is shown immediately, so a panel opened on a slow connection is never empty.
  const cache=fnRead(u);
  if(cache){FN.friends=Array.isArray(cache.friends)?cache.friends:[];FN.incoming=Array.isArray(cache.incoming)?cache.incoming:[];FN.outgoing=Array.isArray(cache.outgoing)?cache.outgoing:[];FN.loaded=true}
  else{FN.friends=[];FN.incoming=[];FN.outgoing=[]}
  fnRefresh();
}
function fnReset(){FN.user=null;FN.loaded=false;FN.loading=false;FN.friends=[];FN.incoming=[];FN.outgoing=[];FN.online=new Set();FN.who=Object.create(null);FN.note='';FN.error=''}
function fnShape(d){
  FN.friends=Array.isArray(d.friends)?d.friends:[];FN.incoming=Array.isArray(d.incoming)?d.incoming:[];
  FN.outgoing=Array.isArray(d.outgoing)?d.outgoing:[];FN.limit=Number(d.limit)||FN.limit;
  FN.installed=d.installed!==false;FN.loaded=true;FN.error='';
}
async function fnRefresh(){
  if(!CLOUD.on||FN.loading)return;
  const user=FN.user;
  if(!CLOUD.api||typeof cloudFetch!=='function'){FN.error='The friends list needs the online server. It is unavailable on this copy of the game.';fnRepaint();return}
  FN.loading=true;
  try{
    const r=await cloudFetch('/friends',{cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    if(FN.user!==user)return;
    if(r.status===503&&d.installed===false){FN.installed=false;FN.loaded=true;FN.error='';}
    else if(!r.ok)throw new Error(d.err||('HTTP '+r.status));
    else{fnShape(d);fnWrite({friends:FN.friends,incoming:FN.incoming,outgoing:FN.outgoing,at:Date.now()})}
  }catch(e){if(FN.user===user)FN.error='The friends list could not be reached ('+(e&&e.message||e)+').'}
  finally{if(FN.user===user){FN.loading=false;fnRepaint();fnPushFriends()}}
}
// Redraw the open panel. Synchronous on purpose: the game redraws panels from combat updates anyway
// (renderWin reuses a window whose markup did not change), and a deferred repaint would either fire
// after the player typed into the name box or never fire at all where timers are throttled.
// The search box never goes through here - it rewrites only its own list, so the caret survives.
let fnPainting=false;
function fnRepaint(){
  if(fnPainting||typeof tabs==='undefined'||!Array.isArray(tabs))return;
  if(!tabs.includes('friends')||typeof renderWin!=='function')return;
  fnPainting=true;
  try{renderWin()}finally{fnPainting=false}
}
// The waiting-request dot is drawn by the dock itself: see `dot('friends')` in index.html, which
// reads FN.incoming.length. Nothing is injected into the dock from here, so renderDock() cannot
// wipe it and the badge cannot disagree with the panel.
// Tell the chat who is a friend, so a name in the plaza and in chat carries the same mark.
function fnPushFriends(){
  if(typeof PGSocial!=='object'||!PGSocial)return;
  const ids=FN.friends.map(f=>f.id).filter(Number.isInteger);
  if(typeof PGSocial.syncFriends==='function')PGSocial.syncFriends(ids);
}
function fnSay(msg,kind){FN.note=msg||'';FN.noteKind=kind||'';fnRepaint()}
// Someone entered, moved or left the plaza: redraw the open panel so "in the plaza now" is true.
// Coalesced by the caller (assets/social.js), never on a timer.
function fnPaint(){fnRepaint()}
function fnName(id,name){
  // The chat knows who is connected right now; the friends API does not. One boolean, display only.
  const p=typeof PGSocial==='object'&&PGSocial&&PGSocial.app?PGSocial.app.players:null;
  const live=p&&p.get?p.get(id):null;
  return !!(live&&(PGSocial.app.room||live.id===PGSocial.app.id));
}
async function fnAct(action,name){
  if(FN.busy)return;
  const clean=String(name||'').trim();
  if(!clean)return;
  if(!CLOUD.on){fnSay('Sign in with a cloud account to keep a friends list.','bad');return}
  if(!FN.installed){fnSay('The friends list is not switched on for this server yet.','bad');return}
  if(!CLOUD.api||typeof cloudFetch!=='function'){fnSay('The friends list needs the online server.','bad');return}
  FN.busy=true;
  try{
    const r=await cloudFetch('/friends',{method:'POST',body:JSON.stringify({action,name:clean})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){fnSay(d.err||('That did not work (HTTP '+r.status+').'),'bad');return}
    fnShape(d);
    fnWrite({friends:FN.friends,incoming:FN.incoming,outgoing:FN.outgoing,at:Date.now()});
    const who=(d.player&&d.player.name)||clean;
    const said={
      requested:'Friend request sent to '+who+'.',
      accepted:'You and '+who+' are friends now.',
      unfriended:who+' was removed from your friends.',
      declined:'Friend request from '+who+' declined.',
      cancelled:'Friend request to '+who+' cancelled.',
      'already-friends':'You are already friends with '+who+'.',
      'already-asked':who+' already has your request. Waiting for an answer.',
      'not-friends':who+' was not on your friends list.',
    }[d.code];
    if(said)fnSay(said,d.changed===false?'':'good');
    // The activity log gets a line too: a friend you added in a plaza can be checked later.
    if(typeof log==='function'&&d.changed!==false&&said)log('👥 '+said,'','social');
    FN.picked=null;
  }catch(e){fnSay((e&&e.message)||'The friends list could not be reached.','bad')}
  finally{FN.busy=false;fnRepaint()}
}
// The chat's per-name action. `id` may be unknown (a name typed into the whisper box); the server
// resolves names, so one path covers both.
function fnAddPlayer(name,id){
  const clean=String(name||'').trim();if(!clean)return;
  if(CLOUD.on&&FN.installed&&Number.isInteger(id)&&FN.friends.some(f=>f.id===id)){fnSay(clean+' is already a friend.','');return}
  if(!FN.installed){fnSay('The friends list is not switched on for this server yet.','bad');return}
  FN.picked=Number.isInteger(id)?id:null;
  return fnAct('request',clean);
}
// What the chat menu should offer for a name. Cached briefly so opening the menu is instant.
async function fnWho(name){
  const key=String(name||'').trim().toLowerCase();if(!key)return null;
  if(FN.who[key]&&Date.now()-FN.who[key].at<15000)return FN.who[key].value;
  if(!CLOUD.on||!FN.installed||!CLOUD.api||typeof cloudFetch!=='function')return null;
  try{
    const r=await cloudFetch('/friends?who='+encodeURIComponent(name),{cache:'no-store'});
    const d=await r.json();
    if(!r.ok||!d.player)return null;
    FN.who[key]={value:d.player,at:Date.now()};
    return d.player;
  }catch(e){return null}
}
// ------------------------------------------------------------------ the panel ----
const fnStamp=ms=>{if(!ms)return'';const d=new Date(Number(ms)||0);return isNaN(d)?'':d.toLocaleDateString()};
const fnLive=(f)=>fnName(f.id,f.name);
function fnRow(f,kind){
  const live=fnLive(f),badge=live?'<i class="friend-live" title="In the plaza right now"></i>':'';
  const sub=kind==='incoming'?'Wants to be your friend'+(f.askedAt?' · '+fnStamp(f.askedAt):'')
    :kind==='outgoing'?'Waiting for an answer'+(f.askedAt?' · sent '+fnStamp(f.askedAt):'')
    :(live?'In the plaza now':f.lastSeen?'Last seen '+fnStamp(f.lastSeen):'Friend')+(f.since?' · friends since '+fnStamp(f.since):'');
  const buttons=kind==='incoming'
    ?`<button data-a="friend" data-v="accept:${fnEsc(f.name)}" class="friend-yes">Accept</button><button data-a="friend" data-v="remove:${fnEsc(f.name)}">Decline</button>`
    :kind==='outgoing'
      ?`<button data-a="friend" data-v="remove:${fnEsc(f.name)}">Cancel</button>`
      :`<button data-a="friendchat" data-v="${fnEsc(f.name)}">Whisper</button><button data-a="friend" data-v="remove:${fnEsc(f.name)}">Unfriend</button>`;
  return `<div class="friend-row" data-friend="${fnEsc(f.name)}">
    <span class="friend-name">${badge}<b>${fnEsc(f.name)}</b><small>${fnEsc(sub)}</small></span>
    <span class="friend-actions">${buttons}</span></div>`;
}
function fnPanel(){
  const signedIn=typeof CLOUD!=='undefined'&&CLOUD.on;
  const notice=!signedIn?'<p class="shop-notice">Sign in with a cloud account to keep a friends list. Local saves cannot hold one, and friends are per account, not per character.</p>'
    :!FN.installed?'<p class="shop-notice">The friends list is not switched on for this server yet. World and private chat work as before.</p>'
    :FN.error?`<p class="shop-note bad" role="status">${fnEsc(FN.error)} <button data-a="friend" data-v="refresh">Retry</button></p>`:'';
  const note=FN.note?`<p class="shop-note ${FN.noteKind}" role="status" aria-live="polite">${fnEsc(FN.note)}</p>`:'';
  if(!signedIn||!FN.installed)return `<div class="friends"><div class="shop-intro"><div class="hd">👥 Friends</div><small>Add the adventurers you talk to in World chat or by whisper, then find them again without remembering the spelling of their name.</small></div>${notice}${note}</div>`;
  const q=FN.filter.trim().toLowerCase(),match=f=>!q||String(f.name).toLowerCase().includes(q);
  const friends=FN.friends.filter(match),incoming=FN.incoming.filter(match),outgoing=FN.outgoing.filter(match);
  const list=friends.length
    ?`<div class="friend-list">${friends.map(f=>fnRow(f,'friends')).join('')}</div>`
    :`<p class="friend-empty">${FN.friends.length?'No friend matches “'+fnEsc(FN.filter)+'”.':'No friends yet. Click any name in World chat or a private message, or add one below.'}</p>`;
  const req=(incoming.length?`<div class="friend-group"><div class="hd">Friend requests <small>${incoming.length}</small></div><div class="friend-list">${incoming.map(f=>fnRow(f,'incoming')).join('')}</div></div>`:'')
    + (outgoing.length?`<div class="friend-group"><div class="hd">Waiting for an answer <small>${outgoing.length}</small></div><div class="friend-list">${outgoing.map(f=>fnRow(f,'outgoing')).join('')}</div></div>`:'');
  const count=FN.friends.length;
  return `<div class="friends">
    <div class="shop-intro"><div class="hd">👥 Friends</div><small>${count} of ${FN.limit} friends · ${FN.incoming.length} request${FN.incoming.length===1?'':'s'} waiting. Friends are per account: every character on this account shares them, and they survive a save reset.</small></div>
    ${note}${notice}
    <form class="friend-add"${FN.busy?' data-busy="1"':''}><label>Add by name
      <input id="friendName" maxlength="32" autocomplete="off" spellcheck="false" placeholder="Player name" aria-label="Player name to add">
      </label><button type="submit" class="friend-yes"${FN.busy?' disabled':''}>Send request</button></form>
    ${FN.friends.length>6?`<label class="friend-filter">Search <input id="friendFilter" maxlength="32" value="${fnEsc(FN.filter)}" autocomplete="off" aria-label="Search friends"></label>`:''}
    ${req}
    <div class="friend-group"><div class="hd">Your friends</div>${list}</div>
    <details class="shop-fine"><summary>How friends work</summary><ul><li>Ask from World chat or a private message by clicking a name, or type one above. The other player has to accept.</li><li>Friends are per account and shared by every character on it. They are kept on the server, so a save reset does not lose them.</li><li>Either side can unfriend at any time. Nothing about combat, drops or the leaderboard changes.</li><li>Muting a player in chat hides their messages for you; it does not remove them from your friends.</li></ul></details>
  </div>`;
}
V.friends=fnPanel;
ACT.friend=v=>{
  const s=String(v||''),i=s.indexOf(':'),k=i<0?s:s.slice(0,i),arg=i<0?'':s.slice(i+1);
  if(k==='request')return fnAct('request',arg);
  if(k==='accept')return fnAct('accept',arg);
  if(k==='remove')return fnAct('remove',arg);
  if(k==='refresh'){FN.error='';return fnRefresh()}
};
ACT.friendchat=name=>{
  if(typeof PGSocial==='object'&&PGSocial&&typeof PGSocial.whisper==='function')return PGSocial.whisper(name);
  if(typeof PGSocial==='object'&&PGSocial&&typeof PGSocial.select==='function'){PGSocial.select('whisper');}
};
// The submit and the search box are wired once, on the document: the panel is redrawn on every
// combat refresh, so per-node listeners would be leaked and lost.
document.addEventListener('submit',e=>{
  const f=e.target&&e.target.closest&&e.target.closest('[data-win="friends"] .friend-add');
  if(!f)return;
  e.preventDefault();
  const input=f.querySelector('input');
  const name=input?String(input.value||'').trim():'';
  if(!name)return;
  input.value='';
  fnAct('request',name);
});
document.addEventListener('input',e=>{
  const el=e.target;
  if(!el||el.id!=='friendFilter')return;
  FN.filter=String(el.value||'');
  if(!tabs.includes('friends'))return;
  // Redraw only the list area, so the search box keeps focus and caret while typing.
  const panel=document.querySelector('[data-win="friends"]');
  if(!panel)return;
  const host=panel.querySelector('.wbody');if(!host)return;
  const q=FN.filter.trim().toLowerCase(),match=x=>!q||String(x.name).toLowerCase().includes(q);
  const list=host.querySelector('.friend-group:last-of-type .friend-list');
  if(!list)return;
  const rows=FN.friends.filter(match).map(x=>fnRow(x,'friends')).join('');
  list.innerHTML=rows||`<p class="friend-empty">${FN.friends.length?'No friend matches “'+fnEsc(FN.filter)+'”.':'No friends yet.'}</p>`;
});
// Session hooks, called from index.html exactly like shopSession/shopReset.
function friendsSession(u){fnSession(u)}
function friendsReset(){fnReset()}
window.PGFriends={refresh:fnRefresh,addPlayer:fnAddPlayer,who:fnWho,panel:fnPanel,state:FN,session:friendsSession,reset:friendsReset,paint:fnPaint,act:fnAct};
