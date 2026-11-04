/* Cash Shop (haven-v215): the 💎 panel, the Stripe Checkout hand-off, delivery polling, and the
   ownership gate the Wardrobe and the hero renderer consult. Loads after wardrobe-ui.js and uses the
   game's globals ($, S, CLOUD, cloudFetch, cloudPull, log, renderWin, openTab, tabs, V, ACT,
   wardrobeState, wardrobeChange, PGWardrobe, PGShop).

   Ownership lives on the server (D1 `entitlements`); this file only mirrors it. The mirror is cached
   per account in localStorage so a reload shows the right look before /api/shop/catalog answers.
   Nothing here can unlock anything: PUT /api/save refuses a look wearing an unowned item, and the
   client then takes it off (shopLockedByServer). Paid items are the four accessory slots; hair,
   hair colour and gender stay free. */
const SHOP={user:null,owned:new Set(),cached:false,loaded:false,loading:false,installed:true,mode:'off',currency:'usd',catalog:null,error:'',view:'cosmetics',slot:'headwear',pending:null,note:'',noteKind:'',poll:0,lockRetries:0,popupUrl:'',amounts:{}};
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
 // v3: the last amount typed into a donation box is remembered per account, so a repeat donation
 // does not start from scratch. It is only a default - nothing is charged until Buy is pressed.
 const saved=shopRead(shopKey('donation',u),null);SHOP.amounts=saved&&typeof saved==='object'?saved:{};
 const cache=shopRead(shopKey('owned',u),null);
 SHOP.owned=new Set(Array.isArray(cache)?cache.filter(x=>typeof x==='string'):[]);SHOP.cached=Array.isArray(cache);
 const pending=shopRead(shopKey('pending',u),null);
 SHOP.pending=pending&&typeof pending.id==='string'&&Date.now()-(pending.at||0)<SHOP_PENDING_MAX_MS?pending:null;
 if(!SHOP.pending)shopWrite(shopKey('pending',u),null);
 shopRefresh();if(SHOP.pending)shopPollStart();
}
function shopReset(){shopPollStop();SHOP.user=null;SHOP.owned=new Set();SHOP.cached=false;SHOP.loaded=false;SHOP.loading=false;SHOP.pending=null;SHOP.note='';SHOP.error='';SHOP.amounts={}}
async function shopRefresh(){
 if(!CLOUD.on||SHOP.loading)return;
 const user=SHOP.user;SHOP.loading=true;shopRepaint();
 try{
  const r=await cloudFetch('/shop/catalog');
  if(!r.ok)throw new Error('HTTP '+r.status);
  const d=await r.json();
  if(SHOP.user!==user)return;                       // signed out (or in as someone else) meanwhile
  if(d.user&&String(d.user).toLowerCase()!==String(user).toLowerCase())return;   // the cookie belongs to another tab's account
  SHOP.catalog=d;SHOP.mode=d.mode||'off';SHOP.currency=d.currency||'usd';SHOP.installed=d.installed!==false;   // false until migrations/0005_shop.sql has run on the server
  SHOP.owned=new Set(Array.isArray(d.owned)?d.owned:[]);SHOP.loaded=true;SHOP.cached=true;SHOP.error='';
  shopWrite(shopKey('owned',user),[...SHOP.owned]);
 }catch(e){if(SHOP.user===user)SHOP.error='The Cash Shop could not be reached ('+e.message+').'}
 finally{if(SHOP.user===user){SHOP.loading=false;shopRepaint()}}
}
function shopRepaint(){if(typeof tabs!=='undefined'&&(tabs.includes('shop')||tabs.includes('wardrobe'))&&typeof renderWin==='function')renderWin()}
// ------------------------------------------------------------------ the gate ----
// SKUs a look is wearing that this account may not wear. Without a cloud account nothing paid can be
// verified, so nothing paid is worn. With one, the server is the judge: until it has answered (and
// no earlier answer is cached), or while its tables are not installed, nothing is locked here - the
// save is trusted as it was before v215, and PUT /api/save has the final say either way.
function shopLockedIn(appearance){
 const worn=PGShop.wornSkus(PGWardrobe,appearance);if(!worn.length)return [];
 if(!CLOUD.on)return worn;
 if(!shopReady()||!SHOP.installed)return [];
 return worn.filter(sku=>!shopOwns(sku));
}
// True while the first answer is still on its way and the look would depend on it.
function shopChecking(appearance){return !!(CLOUD.on&&SHOP.loading&&!shopReady()&&PGShop.wornSkus(PGWardrobe,appearance).length)}
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
function shopOptionTag(field,id){if(id==='none')return '';const sku='cos:'+field+':'+id,item=shopItem(sku);if(!item)return '';if(CLOUD.on&&(!shopReady()||!SHOP.installed))return '';return !CLOUD.on||!shopOwns(sku)?' · '+shopPrice(item)+' 🔒':' · owned ✓'}
// ------------------------------------------------------------------ donating ----
// The donation card's own state: a whole-dollar amount (never below the tier floor), clamped by the
// exact same helper the server uses, and remembered per account so a repeat donation is two clicks.
function shopAmountValue(item){
 const saved=Number(SHOP.amounts&&SHOP.amounts[item.sku]);
 const cents=PGShop.donationAmount(item,(Number.isFinite(saved)&&saved>0?saved:item.floor));
 return cents;
}
function shopRemember(item,cents){
 SHOP.amounts[item.sku]=cents;
 // Only a signed-in account has a place to remember it: writing while signed out would hand the
 // next account on this browser somebody else's amount.
 if(SHOP.user)shopWrite(shopKey('donation',SHOP.user),SHOP.amounts);
}
// What a donation would do RIGHT NOW: the first payment unlocks what is locked, every later one is
// a thank-you. Both are correct, so the card says which one this payment is before it is made.
function shopDonationState(item){
 const cos=shopItems().filter(i=>i.kind==='cosmetic');
 const missing=cos.filter(i=>!shopOwns(i.sku)).length;
 const paid=SHOP.user?shopRead(shopKey('donated',SHOP.user),0):0;
 return {missing,total:cos.length,donated:Number(paid)||0};
}
// -------------------------------------------------------------------- buying ----
function shopSay(msg,kind){SHOP.note=msg||'';SHOP.noteKind=kind||'';shopRepaint()}
async function shopBuy(sku,qty,extra){
 const item=shopItem(sku);if(!item)return;
 if(!CLOUD.on){shopSay('Sign in with a cloud account to use the Cash Shop.','bad');return}
 if(!SHOP.installed){shopSay('The Cash Shop is not switched on for this server yet.','bad');return}
 if(item.kind==='cosmetic'&&shopOwns(sku)){shopSay('You already own '+item.name+'. Put it on in the Wardrobe.','');return}
 if(SHOP.pending){shopSay('Finish or cancel the payment that is already open first.','bad');return}
 qty=Math.max(1,Math.min(item.maxQty||1,Math.floor(Number(qty)||1)));
 // v3: a donation is the one purchase whose price the player chooses. The amount is sent as whole
 // cents; the server clamps it against the catalog's floor and step, and Stripe charges that figure.
 const body={sku,qty};
 if(item.kind==='donation'){
  const cents=PGShop.donationAmount(item,Math.round(Number(extra&&extra.amount)||shopAmountValue(item)));
  body.amount=cents;shopRemember(item,cents);
 }
 // Open the tab synchronously, inside the click, so popup blockers let it through; point it later.
 let tab=null;try{tab=window.open('','_blank')}catch(e){tab=null}
 if(tab){try{tab.document.write('<title>Horizon Haven · payment</title><p style="font:14px system-ui;padding:24px">Opening the secure payment page…</p>')}catch(e){}}
 shopSay('Preparing your order…','');
 try{
  const r=await cloudFetch('/shop/checkout',{method:'POST',body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.err||('HTTP '+r.status));
  SHOP.pending={id:d.order,sku,name:item.kind==='donation'?item.name+' · '+PGShop.money(body.amount,SHOP.currency):item.name+(qty>1?' ×'+qty:''),at:Date.now(),url:d.url,mode:d.mode};
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
 if(item.kind==='donation'){
  // A donation never "delivers nothing": the first payment unlocks the wardrobe, and every later one
  // is recorded as a donation. Which of the two this was is read from ownership, not guessed: the
  // order carries no bundle (an empty one is the normal case), so count what the refresh brings in.
  const paid=Number((SHOP.user&&shopRead(shopKey('donated',SHOP.user),0))||0)+Number(order.amount||0);
  if(SHOP.user)shopWrite(shopKey('donated',SHOP.user),paid);
  const amount=PGShop.money(order.amount||item.price,SHOP.currency),before=new Set(SHOP.owned);
  log('💝 Thank you for donating '+amount+'! Your support keeps Horizon Haven running.','r1','cloud');
  shopSay('Thank you for donating '+amount+'.','good');
  Promise.resolve(shopRefresh()).then(()=>{
   const got=[...SHOP.owned].filter(sku=>!before.has(sku)).length;
   shopSay('Thank you for donating '+amount+'. '+(got?got+' cosmetic'+(got===1?'':'s')+' were unlocked on this account - open the Wardrobe (W) to wear them.':'You already own everything this unlocks, so this one is a straight donation.'),'good');
  });
  if(typeof heroKey!=='undefined')heroKey='';
 }else if(item.kind==='bundle'){
  // v2: the server rolled the contents. Show exactly what arrived by diffing ownership around the
  // refresh, so the player sees 13 names rather than "something happened".
  const before=new Set(SHOP.owned);
  log('🛒 '+(p&&p.name||item.name)+' paid - unlocking your items…','r1','cloud');
  shopSay('Payment received. Unlocking your '+item.name+'…','');
  shopRefresh().then(()=>{
   const got=[...SHOP.owned].filter(sku=>!before.has(sku));
   const names=got.map(sku=>(shopItem(sku)||{}).name||sku);
   if(!names.length)return;
   log('🛒 Your '+item.name+' unlocked '+names.length+' item'+(names.length===1?'':'s')+': '+names.join(', ')+'.','r1','cloud');
   shopSay(item.name+' unlocked '+names.length+' item'+(names.length===1?'':'s')+': '+names.join(', ')+'. Open the Wardrobe (W) to wear them.','good');
   if(typeof heroKey!=='undefined')heroKey='';
  }).catch(()=>{});
 }else if(item.kind==='cosmetic'){
  SHOP.owned.add(order.sku);shopWrite(shopKey('owned',SHOP.user),[...SHOP.owned]);
  log('🛒 '+item.name+' is yours! Open the Wardrobe to put it on.','r1','cloud');
  shopSay(item.name+' is unlocked on this account. Open the Wardrobe (W) to wear it.','good');
  if(typeof heroKey!=='undefined')heroKey='';
 }else{
  log('🛒 Thank you! '+(p&&p.name||item.name)+' is on its way - it lands with your next sync.','r1','cloud');
  shopSay((p&&p.name||item.name)+' is being delivered to your character.','good');
  if(typeof cloudPull==='function')cloudPull().catch(()=>{});   // supplies arrive as a grant
 }
 // A donation already refreshed above (its sentence waits for the answer); everything else is
 // refreshed once, here, so the panel shows the new ownership before the player looks at it.
 if(item.kind!=='donation')shopRefresh();
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
 const canBuy=CLOUD.on&&SHOP.installed&&!SHOP.pending;
 const modeLine=!CLOUD.on?'<p class="shop-notice">Sign in with a cloud account to buy and keep Cash Shop items. Local saves cannot hold them.</p>'
  :!SHOP.installed?'<p class="shop-notice">The Cash Shop is not switched on for this server yet. Everything you wear stays exactly as it is.</p>'
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
  <div class="shop-grid">${list.map(i=>{const owned=shopOwns(i.sku),locked=!owned;return `<div class="shop-card${owned?' owned':''}" data-sku="${shopEsc(i.sku)}"><div class="shop-card-head"><b>${shopEsc(i.name)}</b><span class="shop-price">${owned?'Owned ✓':PGShop.money(i.price,cur)}</span></div><small>${shopEsc(i.slotLabel)} · permanent unlock for this account</small><div class="shop-card-actions"><button data-a="shop" data-v="try:${shopEsc(i.sku)}">${owned?'Wear':'Try on'}</button>${locked?`<button class="shop-buy" data-a="shop" data-v="buy:${shopEsc(i.sku)}"${canBuy?'':' disabled'}>Buy</button>`:''}</div></div>`}).join('')}</div>`;
 }else if(SHOP.view==='bundles'){
  const cos=items.filter(i=>i.kind==='cosmetic'),unowned=cos.filter(i=>!shopOwns(i.sku)),remaining=unowned.length;
  const bundleCards=items.filter(i=>i.kind==='bundle').map(i=>{
   const full=!remaining,worth=i.all?cos.length:PGShop.bundleSize(i)||0,gets=i.all?remaining:Math.min(worth,remaining);
   const parts=i.all?[`All ${cos.length} cosmetics (does not include future updates)`]:Object.entries(i.take||{}).map(([slot,n])=>`${n} × ${(slots[slot]||{}).label||slot}`);
   return `<div class="shop-card shop-bundle${full?' owned':''}" data-sku="${shopEsc(i.sku)}"><div class="shop-card-head"><b>${shopEsc(i.name)}</b><span class="shop-price">${full?'All owned ✓':PGShop.money(i.price,cur)}</span></div><small>${shopEsc(i.blurb||'')}</small><ul class="shop-bundle-list">${parts.map(x=>`<li>${shopEsc(x)}</li>`).join('')}</ul><small>${full?'You already own every cosmetic in this bundle.':`Rolls ${gets} unlock${gets===1?'':'s'} you do not own yet · ${remaining} still locked for you.`}</small><div class="shop-card-actions"><button class="shop-buy" data-a="shop" data-v="buy:${shopEsc(i.sku)}"${canBuy&&!full?'':' disabled'}>${full?'Nothing left':'Buy'}</button></div></div>`;
  }).join('');
  body=`<small class="shop-sub">Bundles are one payment for several permanent unlocks. The exact pieces are rolled on the server from what this account does not own yet, so a bundle can never hand you something you already paid for.</small><div class="shop-grid">${bundleCards}</div>`;
 }else if(SHOP.view==='donations'){
  // v3 (owner): a pay-what-you-want Donations tab. The floor is $25.00 and there is no ceiling; the
  // first payment of the floor unlocks every cosmetic, and any further payment is a donation. The
  // card states which one this payment would be, so nobody has to guess.
  const donateCards=items.filter(i=>i.kind==='donation').map(i=>{
   const state=shopDonationState(i),amount=shopAmountValue(i),floor=PGShop.money(i.floor,cur);
   const quick=[i.floor,i.floor+i.step,i.floor+i.step*2,i.floor+i.step*4,i.floor+i.step*8].filter((v,n,a)=>a.indexOf(v)===n);
   const chips=quick.map(v=>`<button type="button" data-a="shop" data-v="donate:${shopEsc(i.sku)}:${v}" class="${amount===v?'on':''}" aria-pressed="${amount===v}">${PGShop.money(v,cur)}</button>`).join('');
   const effect=state.missing
    ?`This payment unlocks the ${state.missing} cosmetic${state.missing===1?'':'s'} you do not own yet - everything else is already yours.`
    :`You already own all ${state.total} cosmetics, so this payment unlocks nothing and is simply a donation. Thank you.`;
   const paidSoFar=state.donated?` You have donated ${PGShop.money(state.donated,cur)} so far.`:'';
   return `<div class="shop-card shop-donation${state.missing?'':' owned'}" data-sku="${shopEsc(i.sku)}">
   <div class="shop-donation-info"><span class="shop-donation-eyebrow">💝 Supporter Tier · Voluntary Gift</span><div class="shop-card-head"><b>${shopEsc(i.name)}</b><span class="shop-price">${state.missing?'From '+floor:'Unlocked ✓'}</span></div><small class="shop-donation-blurb">${shopEsc(i.blurb||'')}</small>
   <small class="shop-donation-effect">${shopEsc(effect)}${shopEsc(paidSoFar)}</small>
   <small class="shop-donation-guarantee">Minimum ${floor}, and there is no maximum. You can pay as many times as you like - nothing breaks and nothing is charged twice by accident.</small></div>
   <div class="shop-donation-controls"><div class="shop-donation-amount"><label><span class="shop-donation-lbl">Pay what you want</span><span class="shop-donation-field"><span>USD</span><input type="number" inputmode="decimal" min="${(i.floor/100).toFixed(2)}" step="${(i.step/100).toFixed(2)}" value="${(amount/100).toFixed(2)}" data-shop-donate="${shopEsc(i.sku)}" aria-label="Donation amount in US dollars"></span></label><div class="shop-donation-quick">${chips}</div></div>
   <div class="shop-card-actions"><button class="shop-buy" data-a="shop" data-v="donate:${shopEsc(i.sku)}:0"${canBuy?'':' disabled'}>Donate ${PGShop.money(amount,cur)}</button></div></div></div>`;
  }).join('');
  body=`<small class="shop-sub">A donation is voluntary: it changes nothing about combat, drops or the leaderboard. The first payment of ${items.filter(i=>i.kind==='donation').map(i=>PGShop.money(i.floor,cur)).join(' or ')||'$25.00'} unlocks every cosmetic currently in the shop; every payment after that is a thank-you. Horizon Haven is built by a solo developer - donations go toward the hosting and application fees that keep the server running.</small><div class="shop-grid shop-grid-donation">${donateCards}</div><p class="shop-notice">Cosmetics list tells you what is still locked. Purchases are final, and a donation is not refundable - it is a gift to the game.</p>`;
 }else{
  const groups=[];for(const i of items.filter(i=>i.kind==='supply')){let g=groups.find(x=>x.name===i.group);if(!g){g={name:i.group,items:[]};groups.push(g)}g.items.push(i)}
  body=`<small class="shop-sub">Supplies are delivered to your character the moment the payment is confirmed - the same way GM gifts arrive.</small>`+groups.map(g=>`<div class="shop-group"><div class="hd">${shopEsc(g.name)}</div><div class="shop-grid">${g.items.map(i=>`<div class="shop-card" data-sku="${shopEsc(i.sku)}"><div class="shop-card-head"><b>${shopEsc(i.name)}</b><span class="shop-price">${PGShop.money(i.price,cur)}</span></div><small>${shopEsc(i.blurb||'')}</small><div class="shop-card-actions"><label class="shop-qty">Qty <select data-shop-qty="${shopEsc(i.sku)}">${Array.from({length:i.maxQty||1},(_,n)=>`<option value="${n+1}">${n+1}</option>`).join('')}</select></label><button class="shop-buy" data-a="shop" data-v="buy:${shopEsc(i.sku)}"${canBuy?'':' disabled'}>Buy</button></div></div>`).join('')}</div></div>`).join('');
 }
 return `<div class="shop"><div class="shop-intro"><div class="hd">Cash Shop</div><small>Support the game and dress your character. Prices in USD; payments are handled by Stripe on a secure page, and your card details never reach Horizon Haven. Cosmetics unlock forever on this account; supplies are delivered to your character.</small></div>
 ${modeLine}${pending}${note}
 <div class="atabs shop-views">${tabBtn('cosmetics','♧ Cosmetics')}${tabBtn('bundles','❖ Bundles')}${tabBtn('supplies','⚗ Supplies')}${tabBtn('donations','💝 Donations')}</div>
 ${body}
 <details class="shop-fine"><summary>Good to know</summary><ul><li>A cosmetic is a permanent unlock for this account and is not transferable.</li><li>A bundle's pieces are rolled from what you do not own yet and unlock the moment the payment clears.</li><li>Supplies land on your character on the next cloud sync - within a few seconds of paying.</li><li>Nothing is delivered until the payment is confirmed, and nothing is charged for a cancelled payment.</li><li>Problems with an order? Note the order id from the log and contact the GM.</li></ul></details></div>`;
}
V.shop=shopPanel;
ACT.shop=v=>{
 const s=String(v||''),i=s.indexOf(':'),k=i<0?s:s.slice(0,i),arg=i<0?'':s.slice(i+1);
 if(k==='view'){SHOP.view=['supplies','bundles','donations'].includes(arg)?arg:'cosmetics';SHOP.note='';renderWin();return}
 if(k==='slot'){if(Object.hasOwn(PGWardrobe.ACCESSORIES,arg))SHOP.slot=arg;renderWin();return}
 if(k==='buy'){const sel=document.querySelector('[data-shop-qty="'+arg.replace(/["']/g,'')+'"]');shopBuy(arg,sel?sel.value:1);return}
 if(k==='donate'){
  // "donate:<sku>:<cents|0>": a quick-pick button or the Donate button. The amount box is the source
  // of truth when it has focus, so typing 35.00 and pressing Donate charges 35.00, not the chip.
  const cut=arg.lastIndexOf(':'),sku=cut<0?arg:arg.slice(0,cut),cents=cut<0?0:Number(arg.slice(cut+1))||0;
  const item=shopItem(sku);if(!item||item.kind!=='donation')return;
  if(cents>0){shopRemember(item,PGShop.donationAmount(item,cents));renderWin();return}
  const box=document.querySelector('[data-shop-donate="'+sku.replace(/["']/g,'')+'"]');
  const chosen=box?Math.round((Number(String(box.value).replace(/[^0-9.]/g,''))||0)*100):0;
  shopBuy(sku,1,{amount:chosen||shopAmountValue(item)});return;
 }
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
