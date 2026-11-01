// Friends in the real page (jsdom): the More ▸ Friends panel, the add box, accept/decline/unfriend,
// the dock badge, and the chat name menu that adds a player straight from a World line or a whisper.
// The API is mocked at cloudFetch; assets/friends.js, assets/social.js and index.html are real.
//   node tools/tests/friends_ui_sim.js
(async () => {
 const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
 const { createGame } = require('./helpers/game');
 const repo = path.resolve(__dirname, '../..');
 let html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
 // Swap the tagged script tags for their real source, so nothing here can drift from what ships.
 for (const file of ['assets/wardrobe.js', 'assets/shop-catalog.js', 'assets/fourth-jobs.js', 'assets/wardrobe-ui.js',
                     'assets/shop.js', 'assets/friends.js', 'assets/social-rules.js', 'assets/social.js']) {
   const start = html.indexOf('<script src="' + file + '?v=');
   assert.ok(start >= 0, file + ' is loaded by index.html');
   const end = html.indexOf('</script>', start) + '</script>'.length;
   html = html.slice(0, start) + '<script>' + fs.readFileSync(path.join(repo, file), 'utf8') + '</script>' + html.slice(end);
 }
 const g = createGame(html), ev = g.ev, doc = g.window.document;
 const settle = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
 const panel = () => ev(`document.querySelector('[data-win="friends"]')?.innerHTML||''`);
 const posts = () => JSON.parse(ev('JSON.stringify(__posts)'));

 // ---- wiring -------------------------------------------------------------------------------------
 assert.ok(ev("SIDE_TABS.includes('friends')&&!DOCK_TABS.includes('friends')"), 'friends is a side destination like the shop');
 assert.equal(ev("JSON.stringify(TABS.friends)"), JSON.stringify(['👥', 'Friends', 'Y']), 'one tab, one hotkey');
 assert.equal(ev("Object.values(TABS).filter(v=>v[2]==='Y').length"), 1, 'the Y hotkey is unique');
 assert.equal(ev('typeof V.friends'), 'function'); assert.equal(ev('typeof ACT.friend'), 'function');
 assert.equal(ev('DOCK_LABEL.friends'), 'Friends');
 assert.ok(fs.readFileSync(path.join(repo, 'assets/friends.css'), 'utf8').includes('.friend-row'), 'the panel has its own stylesheet');

 // ---- signed out: an explanation, and no request that would fail ------------------------------------
 ev(`tabs.length=0;tabs.push('friends');renderWin()`);
 assert.match(panel(), /Sign in with a cloud account/, 'signed out it says why');
 assert.equal(ev(`!!document.querySelector('[data-win="friends"] .friend-add')`), false, 'and offers no box that would fail');
 assert.equal(ev("dot('friends')"), false, 'no badge without a list');

 // ---- a signed-in account: the list, grouped ------------------------------------------------------
 ev(`window.__calls=[];window.__posts=[];
  window.__friends={friends:[{id:2,name:'Bob',since:1}],incoming:[{id:3,name:'Cid',askedAt:1}],outgoing:[{id:4,name:'Dee',askedAt:1}]};
  cloudFetch=async(p,o)=>{__calls.push([p,o&&o.method||'GET']);
   const j=(s,b)=>({ok:s<300,status:s,json:async()=>b,headers:{get:()=>'application/json'}});
   if(p==='/friends'&&(!o||!o.method||o.method==='GET'))return j(200,{ok:true,installed:true,...__friends,limit:100});
   if(p==='/friends'){const b=JSON.parse(o.body);__posts.push(b);
    if(b.action==='accept')__friends={...__friends,incoming:[],friends:[...__friends.friends,{id:3,name:'Cid',since:2}]};
    else if(b.action==='remove')__friends={...__friends,friends:__friends.friends.filter(f=>f.name!==b.name)};
    else __friends={...__friends,outgoing:[...__friends.outgoing,{id:9,name:b.name,askedAt:3}]};
    const code=b.action==='accept'?'accepted':b.action==='remove'?'unfriended':'requested';
    return j(200,{ok:true,installed:true,action:b.action,code,changed:true,player:{id:9,name:b.name},...__friends,limit:100})}
   return j(404,{err:'nope'})};
  CLOUD.on=true;CLOUD.user='tester';CLOUD.api=true;currentUser='tester';friendsSession('tester');`);
 await settle();
 assert.equal(ev('FN.loaded'), true, 'the list loads from the server');
 assert.equal(ev("JSON.stringify(__calls[0])"), JSON.stringify(['/friends', 'GET']), 'one read, from the friends endpoint');
 ev(`tabs.length=0;tabs.push('friends');renderWin()`);
 let h = panel();
 assert.ok(h.includes('Bob') && h.includes('Cid') && h.includes('Dee'), 'friends, requests received and requests sent all list');
 assert.match(h, /Wants to be your friend/, 'an incoming request says what it is');
 assert.match(h, /Waiting for an answer/, 'an outgoing one says it is waiting');
 assert.ok(h.includes('1 of 100 friends'), 'the cap is stated');
 assert.equal(ev("dot('friends')"), true, 'a waiting request badges the dock');
 assert.equal(ev("!!document.querySelector('#sideLinks [data-t=friends] .dot')"), true, 'and the More menu row itself');

 // ---- accept, from the row -------------------------------------------------------------------------
 ev(`document.querySelector('[data-win="friends"] [data-a="friend"][data-v="accept:Cid"]').click()`);
 await settle();
 assert.deepEqual(posts()[0], { action: 'accept', name: 'Cid' }, 'accept posts the addressee, by name');
 assert.match(ev('FN.note'), /You and Cid are friends now/);
 ev(`tabs.length=0;tabs.push('friends');renderWin()`);
 h = panel();
 assert.ok(h.includes('Cid') && !/Wants to be your friend/.test(h), 'the accepted name moves into the friend list');
 assert.equal(ev("dot('friends')"), false, 'and the badge clears with the last request');
 assert.equal(ev("typeof log"), 'function', 'the activity log is reachable, so a change is written there too');

 // ---- add by typing a name --------------------------------------------------------------------------
 ev(`const box=document.querySelector('[data-win="friends"] #friendName');box.value='  Zed  ';
  box.closest('.friend-add').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));`);
 await settle();
 assert.deepEqual(posts().at(-1), { action: 'request', name: 'Zed' }, 'the typed name is trimmed and sent');
 assert.equal(ev(`document.querySelector('[data-win="friends"] #friendName').value`), '', 'the box is cleared for the next one');
 assert.match(ev('FN.note'), /Friend request sent to Zed/);
 ev(`document.querySelector('[data-win="friends"] .friend-add').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
 await settle();
 assert.equal(posts().length, 2, 'an empty box sends nothing');

 // ---- unfriend ---------------------------------------------------------------------------------------
 // Every write answers with the account's refreshed lists, exactly like functions/api/friends.js, so the
 // panel never has to guess what the server did.
 ev(`tabs.length=0;tabs.push('friends');renderWin()`);
 assert.equal(ev(`!!document.querySelector('[data-win="friends"] [data-a="friend"][data-v="remove:Bob"]')`), true, 'a friend row can be unfriended');
 ev(`document.querySelector('[data-win="friends"] [data-a="friend"][data-v="remove:Bob"]').click()`);
 await settle();
 assert.deepEqual(posts().at(-1), { action: 'remove', name: 'Bob' });
 assert.match(ev('FN.note'), /Bob was removed from your friends/);

 // ---- the chat name menu: Add friend straight from a chat line or a whisper recipient -----------------
 // The chat's own whisper action is the same entry point: a name typed into a private message can be
 // added without ever opening the panel.
 ev(`PGSocial.whisper('Eve')`);
 assert.match(ev(`(document.getElementById('socialTo')||{}).value||''`), /Eve/, 'asking to whisper a name prefills the recipient');

 // The per-name action the chat menu calls: one path, whether the id is known or not.
 ev(`window.__posts=[];PGFriends.addPlayer('Eve',9)`);
 await settle();
 assert.deepEqual(posts().at(-1), { action: 'request', name: 'Eve' }, 'Add friend from a chat name posts the request');
 await settle();
 // A name already on the list is not asked again, and says so instead.
 ev(`window.__posts=[];PGFriends.addPlayer('Cid',3)`);
 await settle();
 assert.equal(posts().length, 0, 'an existing friend is not asked again');
 assert.match(ev('FN.note'), /Cid is already a friend/);

 // ---- the panel is a plain destination: no dock injection, no badge of its own ------------------------
 assert.equal(ev(`!!document.querySelector('#dock [data-t="friends"]')`), false, 'the dock keeps its own buttons');
 assert.equal(ev(`!!document.querySelector('#sideLinks [data-t="friends"]')`), true, 'More lists it');

 // ---- signing out wipes the list, so the next account on this browser never sees it --------------------
 ev(`FN.incoming=[{id:3,name:'Cid'}];friendsReset()`);
 assert.equal(ev('FN.friends.length'), 0); assert.equal(ev('FN.incoming.length'), 0); assert.equal(ev('FN.user'), null);
 assert.equal(ev("dot('friends')"), false, 'and the badge cannot outlive the session');

 console.log('friends_ui_sim: PASS');
 g.close();
 // Natural exit: process.exit() right after a write can drop the last line when stdout is a pipe.

})().catch(e => { console.error(e); process.exit(1); });