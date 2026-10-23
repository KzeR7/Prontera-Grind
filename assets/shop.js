/* Cash Shop (haven-v215): the 💎 panel, the Stripe Checkout hand-off, delivery polling, and the
   ownership gate the Wardrobe and the hero renderer consult. Loads after wardrobe-ui.js and uses the
   game's globals ($, S, CLOUD, cloudFetch, cloudPull, log, renderWin, openTab, tabs, V, ACT,
   wardrobeState, wardrobeChange, PGWardrobe, PGShop).

   Ownership lives on the server (D1 `entitlements`); this file only mirrors it. The mirror is cached
   per account in localStorage so a reload shows the right look before /api/shop/catalog answers.
   Nothing here can unlock anything: PUT /api/save refuses a look wearing an unowned item, and the
   client then takes it off (shopLockedByServer). Paid items are the four accessory slots; hair,
   hair colour and gender stay free. */
const SHOP={user:null,owned:new Set(),cached:false,loaded:false,loading:false,mode:'off',currency:'usd',catalog:null,error:'',view:'cosmetics',slot:'headwear',pending:null,note:'',noteKind:'',poll:0,lockRetries:0,popupUrl:''};
const SHOP_POLL_MS=5000,SHOP_PENDING_MAX_MS=45*60*1000;
const shopKey=(what,u)=>'pg_shop_'+what+'_'+String(u||'').toLowerCase();
const shopRead=(k,fallback)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?fallback:v}catch(e){return fallback}};
const shopWrite=(k,v)=>{try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const shopEsc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function shopItems(){return SHOP.catalog?SHOP.catalog.items:PGShop.catalog(PGWardrobe).items}
function shopItem(sku){return shopItems().find(i=>i.sku===sku)||null}
function shopOwns(sku){return SHOP.owned.has(sku)}
function shopPrice(item){return PGShop.money(item.price,SHOP.currency)}
// The owned list is trustworthy once the server answered this session or a previous one left a cache.
function shopReady(){return SHOP.loaded||SHOP.cached}
function shopSession(u){
 SHOP.user=u;SHOP.loaded=false;SHOP.error='';SHOP.lockRetries=0;
 const cache=shopRead(shopKey('owned',u),null);
 SHOP.owned=new Set(Array.isArray(cache)?cache.filter(x=>typeof x==='string'):[]);SHOP.cached=Array.isArray(cache);
 const pending=shopRead(shopKey('pending',u),null);
 SHOP.pending=pending&&typeof pending.id==='string'&&Date.now()-(pending.at||0)<SHOP_PENDING_MAX_MS?pending:null;
 if(!SHOP.pending)shopWrite(shopKey('pending',u),null);
 shopRefresh();if(SHOP.pending)shopPollStart();
}
function shopReset(){shopPollStop();SHOP.user=null;SHOP.owned=new Set();SHOP.cached=false;SHOP.loaded=false;SHOP.loading=false;SHOP.pending=null;SHOP.note='';SHOP.error=''}
async function shopRefresh(){
 if(!CLOUD.on||SHOP.loading)return;
 const user=SHOP.user;SHOP.loading=true;shopRepaint();
 try{
  const r=await cloudFetch('/shop/catalog');
  if(!r.ok)throw new Error('HTTP '+r.status);
  const d=await r.json();
  if(SHOP.user!==user)return;                       // signed out (or in as someone else) meanwhile
  if(d.user&&String(d.user).toLowerCase()!==String(user).toLowerCase())return;   // the cookie belongs to another tab's account
  SHOP.catalog=d;SHOP.mode=d.mode||'off';SHOP.currency=d.currency||'usd';
  SHOP.owned=new Set(Array.isArray(d.owned)?d.owned:[]);SHOP.loaded=true;SHOP.cached=true;SHOP.error='';
  shopWrite(shopKey('owned',user),[...SHOP.owned]);
 }catch(e){if(SHOP.user===user)SHOP.error='The Cash Shop could not be reached ('+e.message+').'}
 finally{if(SHOP.user===user){SHOP.loading=false;shopRepaint()}}
}
function shopRepaint(){if(typeof tabs!=='undefined'&&(tabs.includes('shop')||tabs.includes('wardrobe'))&&typeof renderWin==='function')renderWin()}
// ------------------------------------------------------------------ the gate ----
// SKUs a look is wearing that this account may not wear. Without a cloud account nothing paid can be
// verified, so nothing paid is worn; before the owned list is known the cached copy answers.
function shopLockedIn(appearance){
 const worn=PGShop.wornSkus(PGWardrobe,appearance);if(!worn.length)return [];
 if(!CLOUD.on)return worn;
 return worn.filter(sku=>!shopOwns(sku));
}
function shopSanitize(a){const locked=shopLockedIn(a);return locked.length?PGShop.strip(PGWardrobe,a,sku=>!locked.includes(sku))||a:a}
// The server refused the save over these SKUs: take them off for real (S.appearance), say so, retry.
function shopLockedByServer(locked){
 const list=Array.isArray(locked)?locked.filter(x=>typeof x==='string'):[];
 if(!S||!list.length||SHOP.lockRetries>=3)return false;
 const before=PGWardrobe.selectionKey(S.appearance);
 const stripped=PGShop.strip(PGWardrobe,S.appearance,sku=>!list.includes(sku));
 if(!stripped||PGWardrobe.selectionKey(stripped)===before)return false;
 SHOP.lockRetries++;S.appearance=stripped;
 for(const sku of list)SHOP.owned.delete(sku);
 shopWrite(shopKey('owned',SHOP.user),[...SHOP.owned]);
 if(typeof heroKey!=='undefined')heroKey='';
 if(typeof wardrobeState!=='undefined'&&wardrobeState.draft){wardrobeState.draft=PGShop.strip(PGWardrobe,wardrobeState.draft,sku=>!list.includes(sku))||wardrobeState.draft}
 const names=list.map(sku=>(shopItem(sku)||{}).name||sku).join(', ');
 log('🔒 '+names+' '+(list.length===1?'is':'are')+' not unlocked on this account, so '+(list.length===1?'it was':'they were')+' taken off. Visit the Cash Shop (T) to unlock.','r0','cloud');
 try{save()}catch(e){}
 shopRepaint();return true;
}
// Pretty label for a wardrobe <option>: price when locked, a tick when owned, nothing for None.
function shopOptionTag(field,id){if(id==='none')return '';const sku='cos:'+field+':'+id,item=shopItem(sku);if(!item)return '';return !CLOUD.on||!shopOwns(sku)?' · '+shopPrice(item)+' 🔒':' · owned ✓'}
// -------------------------------------------------------------------- buying ----
function shopSay(msg,kind){SHOP.note=msg||'';SHOP.noteKind=kind||'';shopRepaint()}
async function shopBuy(sku,qty){
 const item=shopItem(sku);if(!item)return;
 if(!CLOUD.on){shopSay('Sign in with a cloud account to use the Cash Shop.','bad');return}
 if(item.kind==='cosmetic'&&shopOwns(sku)){shopSay('You already own '+item.name+'. Put it on in the Wardrobe.','');return}
 if(SHOP.pending){shopSay('Finish or cancel the payment that is already open first.','bad');return}
 qty=Math.max(1,Math.min(item.maxQty||1,Math.floor(Number(qty)||1)));
 // Open the tab synchronously, inside the click, so popup blockers let it through; point it later.
 let tab=null;try{tab=window.open('','_blank')}catch(e){tab=null}
 if(tab){try{tab.document.write('<title>Prontera Grind · payment</title><p style="font:14px system-ui;padding:24px">Opening the secure payment page…</p>')}catch(e){}}
 shopSay('Preparing your order…','');
 try{
  const r=await cloudFetch('/shop/checkout',{method:'POST',body:JSON.stringify({sku,qty})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.err||('HTTP '+r.status));
  SHOP.pending={id:d.order,sku,name:item.name+(qty>1?' ×'+qty:''),at:Date.now(),url:d.url,mode:d.mode};
  shopWrite(shopKey('pending',SHOP.user),SHOP.pending);
  SHOP.popupUrl='';
  if(tab){try{tab.location.href=d.url}catch(e){SHOP.popupUrl=d.url}}else SHOP.popupUrl=d.url;
  shopSay(d.mode==='fake'?'Test mode: the order was delivered instantly (no card, no charge).':SHOP.popupUrl?'Your browser blocked the payment tab - use the "Open the payment page" link below. This window updates by itself once the payment is confirmed.':'The secure payment page opened in a new tab. This window updates by itself once the payment is confirmed.','');
  shopPollStart();shopPoll();
 }catch(e){
  if(tab){try{tab.close()}catch(x){}}
  shopSay(e.message||'The order could not be started.','bad');
 }
}
function shopPollStart(){shopPollStop();if(typeof setInterval==='function')SHOP.poll=setInterval(shopPoll,SHOP_POLL_MS)}
function shopPollStop(){if(SHOP.poll){clearInterval(SHOP.poll)}SHOP.poll=0}
let shopPolling=false;
async function shopPoll(){
 const p=SHOP.pending;if(!p||!CLOUD.on||shopPolling)return;
 if(Date.now()-p.at>SHOP_PENDING_MAX_MS){shopDone(null,'The payment page expired. Nothing was charged; try again when you are ready.');return}
 shopPolling=true;
 try{
  const r=await cloudFetch('/shop/order?id='+encodeURIComponent(p.id));
  if(r.status===404){shopDone(null,'That order is no longer available.');return}
  if(!r.ok)return;
  const o=(await r.json()).order;if(!o||SHOP.pending!==p)return;
  if(o.status==='fulfilled')shopDone(o,'');
  else if(o.status==='expired'||o.status==='failed')shopDone(null,o.status==='expired'?'The payment page expired. Nothing was charged.':'The payment did not go through. Nothing was delivered.');
 }catch(e){}finally{shopPolling=false}
}
function shopDone(order,failure){
 const p=SHOP.pending;SHOP.pending=null;SHOP.popupUrl='';shopPollStop();shopWrite(shopKey('pending',SHOP.user),null);
 if(!order){shopSay(failure,'bad');if(failure)log('🛒 '+failure,'r0','cloud');return}
 const item=shopItem(order.sku)||{name:order.item||order.sku,kind:'supply'};
 if(item.kind==='cosmetic'){
  SHOP.owned.add(order.sku);shopWrite(shopKey('owned',SHOP.user),[...SHOP.owned]);
  log('🛒 '+item.name+' is yours! Open the Wardrobe to put it on.','r1','cloud');
  shopSay(item.name+' is unlocked on this account. Open the Wardrobe (W) to wear it.','good');
  if(typeof heroKey!=='undefined')heroKey='';
 }else{
  log('🛒 Thank you! '+(p&&p.name||item.name)+' is on its way - it lands with your next sync.','r1','cloud');
  shopSay((p&&p.name||item.name)+' is being delivered to your character.','good');
  if(typeof cloudPull==='function')cloudPull().catch(()=>{});   // supplies arrive as a grant
 }
 shopRefresh();
}
function shopTryOn(sku){
 const item=shopItem(sku);if(!item||item.kind!=='cosmetic')return;
 openTab('wardrobe');
 if(typeof wardrobeState!=='undefined'&&wardrobeState.draft&&typeof wardrobeChange==='function')wardrobeChange(item.slot,item.id);
}
// -------------------------------------------------------------------- the panel ----
function shopPanel(){
 const items=shopItems(),cur=SHOP.currency,slots=PGWardrobe.ACCESSORIES;
 if(!Object.hasOwn(slots,SHOP.slot))SHOP.slot=Object.keys(slots)[0];
 const modeLine=!CLOUD.on?'<p class="shop-notice">Sign in with a cloud account to buy and keep Cash Shop items. Local saves cannot hold them.</p>'
  :SHOP.mode==='off'&&SHOP.loaded?'<p class="shop-notice">Browsing only for now: payments are not switched on yet.</p>'
  :SHOP.mode==='fake'?'<p class="shop-notice">Test mode: orders are delivered instantly and nothing is charged.</p>':'';
 const pending=SHOP.pending?`<div class="shop-pending"><b>⏳ Waiting for your payment</b><span>${shopEsc(SHOP.pending.name)} · the secure page is open in another tab.</span><span class="shop-pending-actions">${SHOP.popupUrl?`<a class="shop-link" href="${shopEsc(SHOP.popupUrl)}" target="_blank" rel="noopener">Open the payment page</a>`:''}<button data-a="shop" data-v="check">Check now</button><button data-a="shop" data-v="dismiss">Dismiss</button></span></div>`:'';
 const note=SHOP.note?`<p class="shop-note ${SHOP.noteKind}" role="status" aria-live="polite">${shopEsc(SHOP.note)}</p>`:SHOP.error?`<p class="shop-note bad" role="status">${shopEsc(SHOP.error)} <button data-a="shop" data-v="refresh">Retry</button></p>`:'';
 const tabBtn=(v,label)=>`<button data-a="shop" data-v="view:${v}" class="${SHOP.view===v?'on':''}" aria-pressed="${SHOP.view===v}">${label}</button>`;
 let body='';
 if(SHOP.view==='cosmetics'){
  const slotTabs=Object.entries(slots).map(([k,def])=>`<button data-a="shop" data-v="slot:${k}" class="${SHOP.slot===k?'on':''}" aria-pressed="${SHOP.slot===k}">${shopEsc(def.label)}</button>`).join('');
  const list=items.filter(i=>i.kind==='cosmetic'&&i.slot===SHOP.slot);
  const ownedCount=items.filter(i=>i.kind==='cosmetic'&&shopOwns(i.sku)).length;
  body=`<div class="atabs shop-slots">${slotTabs}</div><small class="shop-sub">${shopEsc(slots[SHOP.slot].label)} · ${list.length} styles · you own ${ownedCount} cosmetic${ownedCount===1?'':'s'}. Hair, hair colour and gender are always free in the Wardrobe.</small>
  <div class="shop-grid">${list.map(i=>{const owned=shopOwns(i.sku),locked=!owned;return `<div class="shop-card${owned?' owned':''}" data-sku="${shopEsc(i.sku)}"><div class="shop-card-head"><b>${shopEsc(i.name)}</b><span class="shop-price">${owned?'Owned ✓':PGShop.money(i.price,cur)}</span></div><small>${shopEsc(i.slotLabel)} · permanent unlock for this account</small><div class="shop-card-actions"><button data-a="shop" data-v="try:${shopEsc(i.sku)}">${owned?'Wear':'Try on'}</button>${locked?`<button class="shop-buy" data-a="shop" data-v="buy:${shopEsc(i.sku)}"${!CLOUD.on||SHOP.pending?' disabled':''}>Buy</button>`:''}</div></div>`}).join('')}</div>`;
 }else{
  const groups=[];for(const i of items.filter(i=>i.kind==='supply')){let g=groups.find(x=>x.name===i.group);if(!g){g={name:i.group,items:[]};groups.push(g)}g.items.push(i)}
  body=`<small class="shop-sub">Supplies are delivered to your character the moment the payment is confirmed - the same way GM gifts arrive.</small>`+groups.map(g=>`<div class="shop-group"><div class="hd">${shopEsc(g.name)}</div><div class="shop-grid">${g.items.map(i=>`<div class="shop-card" data-sku="${shopEsc(i.sku)}"><div class="shop-card-head"><b>${shopEsc(i.name)}</b><span class="shop-price">${PGShop.money(i.price,cur)}</span></div><small>${shopEsc(i.blurb||'')}</small><div class="shop-card-actions"><label class="shop-qty">Qty <select data-shop-qty="${shopEsc(i.sku)}">${Array.from({length:i.maxQty||1},(_,n)=>`<option value="${n+1}">${n+1}</option>`).join('')}</select></label><button class="shop-buy" data-a="shop" data-v="buy:${shopEsc(i.sku)}"${!CLOUD.on||SHOP.pending?' disabled':''}>Buy</button></div></div>`).join('')}</div></div>`).join('');
 }
 return `<div class="shop"><div class="shop-intro"><div class="hd">Cash Shop</div><small>Support the game and dress your character. Prices in USD; payments are handled by Stripe on a secure page, and your card details never reach Prontera Grind. Cosmetics unlock forever on this account; supplies are delivered to your character.</small></div>
 ${modeLine}${pending}${note}
 <div class="atabs shop-views">${tabBtn('cosmetics','♧ Cosmetics')}${tabBtn('supplies','⚗ Supplies')}</div>
 ${body}
 <details class="shop-fine"><summary>Good to know</summary><ul><li>A cosmetic is a permanent unlock for this account and is not transferable.</li><li>Supplies land on your character on the next cloud sync - within a few seconds of paying.</li><li>Nothing is delivered until the payment is confirmed, and nothing is charged for a cancelled payment.</li><li>Problems with an order? Note the order id from the log and contact the GM.</li></ul></details></div>`;
}
V.shop=shopPanel;
ACT.shop=v=>{
 const s=String(v||''),i=s.indexOf(':'),k=i<0?s:s.slice(0,i),arg=i<0?'':s.slice(i+1);
 if(k==='view'){SHOP.view=arg==='supplies'?'supplies':'cosmetics';SHOP.note='';renderWin();return}
 if(k==='slot'){if(Object.hasOwn(PGWardrobe.ACCESSORIES,arg))SHOP.slot=arg;renderWin();return}
 if(k==='buy'){const sel=document.querySelector('[data-shop-qty="'+arg.replace(/"/g,'')+'"]');shopBuy(arg,sel?sel.value:1);return}
 if(k==='try'){shopTryOn(arg);return}
 if(k==='check'){shopPoll();return}
 if(k==='dismiss'){SHOP.pending=null;SHOP.popupUrl='';shopPollStop();shopWrite(shopKey('pending',SHOP.user),null);SHOP.note='';renderWin();return}
 if(k==='refresh'){SHOP.error='';shopRefresh();return}
};
// Back from Stripe: /?shop=success|cancel&order=... lands on the login card (v83: nothing opens by
// itself). Say what happened, clean the address, and let the other tab - the one still playing -
// finish the delivery. Signing in here works too: a pending order resumes with the session.
function shopReturnBanner(){
 let q;try{q=new URLSearchParams(location.search)}catch(e){return}
 const state=q.get('shop');if(state!=='success'&&state!=='cancel')return;
 const order=String(q.get('order')||'').replace(/[^a-z0-9_]/gi,'').slice(0,40);
 const el=document.createElement('div');el.id='shopReturn';el.className='shop-return '+(state==='success'?'good':'bad');
 el.textContent=state==='success'?'✅ Payment received - thank you! Your purchase is on its way'+(order?' (order '+order+')':'')+'. You can close this tab and go back to the game, or sign in here.'
  :'Payment cancelled - nothing was charged.'+(order?' (order '+order+')':'');
 const anchor=$('loginCloud')||$('loginForm');if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(el,anchor);else document.body.appendChild(el);
 try{history.replaceState(null,'',location.pathname+location.hash)}catch(e){}
}
shopReturnBanner();
