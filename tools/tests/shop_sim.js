// Cash Shop in the real page (jsdom): the ownership gate, the Wardrobe lock, the panel, the buy flow
// and the server-refusal path. Stripe and the API are mocked at cloudFetch; the game code is real.
//   node tools/tests/shop_sim.js
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createGame}=require('./helpers/game');const repo=path.resolve(__dirname,'../..');let html=fs.readFileSync(path.join(repo,'index.html'),'utf8');
for(const f of ['assets/wardrobe.js','assets/shop-catalog.js','assets/fourth-jobs.js','assets/wardrobe-ui.js','assets/shop.js']){
 const re=new RegExp('<script src="'+f.replaceAll('.','\\.')+'\\?v=[0-9]+"></script>');assert.ok(re.test(html),f+' is loaded by index.html');
 html=html.replace(re,()=>'<script>'+fs.readFileSync(path.join(repo,f),'utf8')+'</script>');
}
const g=createGame(html),ev=g.ev,tick=()=>new Promise(r=>setImmediate(r));
const settle=async(n=6)=>{for(let i=0;i<n;i++)await tick()};
(async()=>{
 // ---- wiring -------------------------------------------------------------------------------------
 assert.ok(ev("SIDE_TABS.includes('shop')&&!DOCK_TABS.includes('shop')"),'the shop is a side destination like the wardrobe');
 assert.equal(ev("JSON.stringify(TABS.shop)"),JSON.stringify(['💎','Cash Shop','T']));
 assert.equal(ev("Object.values(TABS).filter(v=>v[2]==='T').length"),1,'the T hotkey is unique');
 assert.equal(ev("typeof V.shop"),'function');assert.equal(ev("typeof ACT.shop"),'function');
 assert.equal(ev("DOCK_LABEL.shop"),'Shop');
 assert.ok(/haven-v220/.test(ev('BUILD')),'player-visible change bumps BUILD');
 assert.equal(ev("PGShop.catalog(PGWardrobe).items.length"),66);
 // ---- the wardrobe preview loader, as in wardrobe_game_sim ------------------------------------------
 ev(`window.matchMedia=()=>({matches:false});window.__saveCount=0;save=()=>{__saveCount++};window.__logs=[];log=(m,c,cat)=>__logs.push(String(m));S.sex='f';S.cls='Lord Knight';`);
 g.window.__catalogs={};g.window.__metadatas={};
 for(const [pack,dir]of [['base','assets/wardrobe/v5'],['fourth','assets/wardrobe/fourth/v1']]){
  const catalog=JSON.parse(fs.readFileSync(path.join(repo,dir,'catalog.json'),'utf8'));g.window.__catalogs[pack]=catalog;g.window.__metadatas[pack]={};
  for(const [id,r]of Object.entries(catalog.assets))g.window.__metadatas[pack][id]=require('../../assets/wardrobe.js').validateMeta(JSON.parse(fs.readFileSync(path.join(repo,dir,r.meta),'utf8')),r);
 }
 ev(`wardrobeStore.select=async(client,a,cls='Lord Knight')=>{const fourth=Object.hasOwn(PGFourthJobs.CLASSES,cls),job=(fourth?PGFourthJobs.CLASSES:PGWardrobe.CLASSES)[cls],metadata=__metadatas[fourth?'fourth':'base'],catalog=__catalogs[fourth?'fourth':'base'],route=id=>({metadata:{clock:metadata[id].clock,actions:Object.fromEntries(Object.entries(metadata[id].actions).filter(([k])=>k.startsWith(job+':')).map(([k,v])=>[k.split(':')[1],v]))},image:{}});return {key:job+'|'+PGWardrobe.key(a),cls,selection:PGWardrobe.normalize(a),ids:[],base:{metadata:metadata['base-'+job+'-'+a.sex],figureHeight:catalog.assets['base-'+job+'-'+a.sex].figureHeight,image:{}},hair:route('hair-'+PGWardrobe.key(a)),pieces:Object.keys(PGWardrobe.ACCESSORIES).map(k=>a[k]).filter(k=>k&&k!=='none').map(k=>route('piece-'+k+'-'+a.sex))}};`);

 // ---- 1. local play: paid slots are never shown, free slots always are -------------------------------
 ev(`S.appearance={...PGWardrobe.defaults('f'),heads:{m:2,f:42},colors:{m:0,f:8},headwear:'halo',backwear:'wings'};`);
 assert.equal(ev('S.appearance.backwear'),'wings','the save itself is not rewritten by looking at it');
 assert.deepEqual(Array.from(ev("[wardrobeAppearance().backwear,wardrobeAppearance().headwear,wardrobeAppearance().heads.f,wardrobeAppearance().colors.f]")),['none','none',42,8],'without a cloud account paid slots are off, hair and colour stay');
 assert.deepEqual(Array.from(ev("shopLockedIn(S.appearance)")),['cos:headwear:halo','cos:backwear:wings']);
 ev(`tabs.length=0;tabs.push('wardrobe');renderWin();wardrobeLoad();`);await settle();
 assert.equal(ev("wardrobeState.draft.backwear"),'none','the draft starts from the look that may be worn');
 ev(`wardrobeChange('backwear','wings')`);await settle();
 assert.equal(ev("$('wardrobeApply').disabled"),true,'cannot apply a paid item');
 assert.match(ev("$('wardrobeStatus').textContent"),/cloud account/,'and the status says why');
 assert.equal(ev("$('wardrobeBuy').hidden"),true,'nothing to buy without an account');
 const wingsOpt=[...g.window.document.querySelector('[data-wardrobe="backwear"]').options].find(o=>o.value==='wings');
 assert.equal(wingsOpt.textContent,'Archangel wings · $4.99 🔒','every paid option carries its price');
 assert.equal([...g.window.document.querySelector('[data-wardrobe="backwear"]').options][0].textContent,'None');
 assert.equal([...g.window.document.querySelector('[data-wardrobe="head"]').options].every(o=>!/🔒|\$/.test(o.textContent)),true,'hair is free');
 ev(`wardrobeAction('apply')`);assert.equal(ev('__saveCount'),0,'apply is a no-op while locked');
 ev(`wardrobeChange('backwear','none');wardrobeChange('head',5)`);await settle();
 assert.equal(ev("$('wardrobeApply').disabled"),false,'a free change applies as before');
 ev(`wardrobeAction('apply')`);assert.equal(ev('__saveCount'),1);assert.equal(ev('S.appearance.heads.f'),5);

 // ---- 2. a cloud session: the owned list comes from the server, cached per account --------------------
 ev(`window.__calls=[];window.__owned=[];window.__mode='fake';window.__orders={};window.__pulls=0;cloudPull=async()=>{__pulls++};
  cloudFetch=async(p,o)=>{__calls.push([p,o&&o.method||'GET',o&&o.body?JSON.parse(o.body):null]);const j=(status,body)=>({ok:status<300,status,json:async()=>body,headers:{get:()=>'application/json'}});
   if(p==='/shop/catalog')return j(200,{currency:'usd',mode:__mode,slots:Object.keys(PGWardrobe.ACCESSORIES),items:PGShop.catalog(PGWardrobe).items,owned:__owned,user:'skill-test'});
   if(p==='/shop/checkout'){const b=JSON.parse(o.body);if(window.__refuse)return j(409,{err:'You already own that.',owned:true});const id='ord_'+(Object.keys(__orders).length+1);__orders[id]={id,sku:b.sku,status:'pending',item:b.sku};return j(200,{ok:true,order:id,url:'https://checkout.stripe.test/c/'+id,mode:'stripe'})}
   if(p.startsWith('/shop/order?id=')){const id=decodeURIComponent(p.slice(15));const o2=__orders[id];return o2?j(200,{order:o2}):j(404,{err:'Unknown order.'})}
   if(p==='/save'&&o&&o.method==='PUT'){const r=window.__putAnswer?window.__putAnswer(JSON.parse(o.body)):{status:200,body:{version:2}};return j(r.status,r.body)}
   return j(404,{err:'nope'})};
  CLOUD.on=true;CLOUD.user='skill-test';CLOUD.api=true;currentUser='skill-test';shopSession('skill-test');`);
 await settle();
 assert.equal(ev('SHOP.loaded'),true);assert.equal(ev('SHOP.mode'),'fake');assert.equal(ev('SHOP.cached'),true);
 assert.equal(ev("localStorage.getItem('pg_shop_owned_skill-test')"),'[]');
 ev(`tabs.length=0;tabs.push('shop');renderWin();`);
 let h=ev("$('wins').innerHTML");
 assert.ok(h.includes('Cash Shop')&&h.includes('Test mode'),'the panel says it is in test mode');
 assert.ok(h.includes('data-v="buy:cos:headwear:halo"')&&h.includes('$2.49'),'head cosmetics are listed with prices');
 assert.ok(!h.includes('data-v="buy:cos:backwear:wings"'),'one slot at a time');
 ev(`ACT.shop('slot:backwear')`);h=ev("$('wins').innerHTML");
 assert.ok(h.includes('data-v="buy:cos:backwear:wings"')&&h.includes('$4.99')&&h.includes('data-v="try:cos:backwear:wings"'),'wings slot shows its items with Try on');
 ev(`ACT.shop('view:supplies')`);h=ev("$('wins').innerHTML");
 assert.ok(h.includes('data-v="buy:sup:ori:50"')&&h.includes('data-shop-qty="sup:ori:50"')&&h.includes('Mythic Protection Scroll')&&h.includes('Valkyrie’s Sigil'),'supplies are listed with a quantity picker');
 assert.ok(!/\$0\.\d\d|\$[0-9]+\.[0-9]$/.test(h),'prices are formatted money');
 assert.ok(!h.includes('&lt;script'),'nothing user-controlled is in the markup');

 // ---- 3. try on from the shop lands in the wardrobe with the item previewed ---------------------------
 ev(`ACT.shop('try:cos:backwear:wings')`);await settle();
 assert.ok(ev("tabs.includes('wardrobe')"));assert.equal(ev('wardrobeState.draft.backwear'),'wings');
 assert.equal(ev("$('wardrobeApply').disabled"),true,'still locked: not bought yet');
 assert.match(ev("$('wardrobeStatus').textContent"),/Archangel wings is a Cash Shop item \(\$4\.99\)/);
 assert.equal(ev("$('wardrobeBuy').hidden"),false);assert.equal(ev("$('wardrobeBuy').textContent"),'Buy Archangel wings · $4.99');

 // ---- 4. buying: tab opened in the click, pointed at Stripe after the server answers ----------------------
 ev(`window.__tabs=[];window.open=()=>{const t={location:{href:''},closed:false,document:{write(){}},close(){t.closed=true}};__tabs.push(t);return t};`);
 ev(`wardrobeAction('buy')`);await settle();
 assert.equal(ev('__tabs.length'),1);assert.equal(ev('__tabs[0].location.href'),'https://checkout.stripe.test/c/ord_1');
 assert.equal(ev("JSON.stringify(__calls.find(c=>c[0]==='/shop/checkout')[2])"),JSON.stringify({sku:'cos:backwear:wings',qty:1}),'a cosmetic is bought once, the price is never sent');
 assert.equal(ev('SHOP.pending.id'),'ord_1');assert.equal(ev("JSON.parse(localStorage.getItem('pg_shop_pending_skill-test')).id"),'ord_1','a pending order survives a reload');
 ev(`tabs.length=0;tabs.push('shop');renderWin()`);h=ev("$('wins').innerHTML");
 assert.ok(h.includes('Waiting for your payment')&&h.includes('data-v="check"'),'the panel shows the open payment');
 assert.ok(/data-v="buy:[^"]+" disabled/.test(h),'no second checkout while one is open');
 ev(`shopPoll()`);await settle();assert.equal(ev('SHOP.pending.id'),'ord_1','still pending');
 assert.equal(ev("shopOwns('cos:backwear:wings')"),false);
 ev(`__orders.ord_1.status='fulfilled';__owned=['cos:backwear:wings'];shopPoll()`);await settle();
 assert.equal(ev('SHOP.pending'),null);assert.equal(ev("shopOwns('cos:backwear:wings')"),true);
 assert.equal(ev("localStorage.getItem('pg_shop_owned_skill-test')"),JSON.stringify(['cos:backwear:wings']),'the cache follows');
 assert.equal(ev("localStorage.getItem('pg_shop_pending_skill-test')"),null);
 assert.ok(ev("__logs.some(m=>/Archangel wings is yours/.test(m))"),'the player is told');
 h=ev("$('wins').innerHTML");assert.ok(h.includes('is unlocked on this account'),'the panel confirms it');
 ev(`ACT.shop('view:cosmetics');ACT.shop('slot:backwear')`);h=ev("$('wins').innerHTML");const wingsCard=/<div class="shop-card owned" data-sku="cos:backwear:wings">[^]*?<\/div><\/div>/.exec(h);
 assert.ok(wingsCard&&/Owned ✓/.test(wingsCard[0])&&!wingsCard[0].includes('data-v="buy:'),'owned items show as owned and cannot be bought twice: '+(wingsCard?wingsCard[0].slice(0,300):h.slice(0,400)));
 // the wardrobe now lets it through
 ev(`tabs.length=0;tabs.push('wardrobe');renderWin();wardrobeChange('backwear','wings')`);await settle();
 assert.equal(ev("$('wardrobeApply').disabled"),false,'owned: can apply');assert.equal(ev("$('wardrobeBuy').hidden"),true);
 assert.equal([...g.window.document.querySelector('[data-wardrobe="backwear"]').options].find(o=>o.value==='wings').textContent,'Archangel wings · owned ✓');
 ev(`wardrobeAction('apply')`);assert.equal(ev('S.appearance.backwear'),'wings');assert.equal(ev('wardrobeAppearance().backwear'),'wings','and the hero wears it');
 // but the halo in the same slot family is still locked
 assert.equal(ev("JSON.stringify(shopLockedIn({...S.appearance,headwear:'halo'}))"),JSON.stringify(['cos:headwear:halo']));
 // second buy in the same session, after the first settled: allowed; the refusal path is shown too
 ev(`window.__refuse=true;shopBuy('cos:headwear:halo')`);await settle();
 assert.equal(ev('__tabs.length'),2);assert.equal(ev('__tabs[1].closed'),true,'a refused checkout closes the tab it opened');
 assert.equal(ev('SHOP.note'),'You already own that.');assert.equal(ev('SHOP.pending'),null);ev('window.__refuse=false');

 // ---- 5. supplies: quantity goes up, delivery triggers a pull (the grant lands like a GM gift) ----------
 ev(`tabs.length=0;tabs.push('shop');SHOP.view='supplies';renderWin();document.querySelector('[data-shop-qty="sup:ori:50"]').value='3';ACT.shop('buy:sup:ori:50')`);await settle();
 assert.equal(ev("JSON.stringify(__calls.filter(c=>c[0]==='/shop/checkout').at(-1)[2])"),JSON.stringify({sku:'sup:ori:50',qty:3}));
 assert.equal(ev('SHOP.pending.name'),'Oridecon ×50 ×3');
 const before=ev('__pulls');ev(`__orders.ord_2.status='fulfilled';shopPoll()`);await settle();
 assert.equal(ev('__pulls'),before+1,'a delivered supply order pulls the grant queue');
 assert.equal(ev("shopOwns('sup:ori:50')"),false,'supplies are not unlocks');
 // an order that dies on Stripe's side is closed with a message, nothing granted
 ev(`shopBuy('cos:facewear:glasses')`);await settle();ev(`__orders.ord_3.status='expired';shopPoll()`);await settle();
 assert.equal(ev('SHOP.pending'),null);assert.match(ev('SHOP.note'),/expired/);assert.equal(ev("shopOwns('cos:facewear:glasses')"),false);

 // ---- 6. the server said no: the look is stripped and pushed again, the character is untouched ---------
 ev(`S.appearance={...S.appearance,headwear:'halo',facewear:'glasses'};S.zeny=777;CLOUD.dirty=true;CLOUD.ver=1;CLOUD.lastPush=0;CLOUD.paused=false;CLOUD.pushing=false;
  window.__puts=0;window.__putAnswer=b=>{__puts++;const blob=JSON.parse(b.blob);const locked=PGShop.wornSkus(PGWardrobe,blob.appearance).filter(s=>!['cos:backwear:wings'].includes(s));return locked.length?{status:409,body:{err:'This look uses Cash Shop items this account does not own.',cosmeticLocked:true,locked}}:{status:200,body:{version:2}}};`);
 assert.equal(await g.window.cloudPush(true),'locked');
 assert.deepEqual(Array.from(ev("[S.appearance.headwear,S.appearance.facewear,S.appearance.backwear,S.zeny]")),['none','none','wings',777]);
 assert.ok(ev("__logs.some(m=>/Angel halo, Glasses are not unlocked/.test(m))"),'the player is told which items came off');
 assert.equal(await g.window.cloudPush(true),'ok','the stripped save is accepted');
 assert.equal(ev('CLOUD.ver'),2);
 assert.equal(ev("shopLockedByServer(['cos:backwear:wings'])"),true);assert.equal(ev('S.appearance.backwear'),'none');
 assert.equal(ev("shopLockedByServer(['cos:backwear:wings'])"),false,'nothing left to strip: no retry loop');

 // ---- 7. server says the shop is not installed (migration pending): the game is exactly v214 --------------
 ev(`shopReset();S.appearance={...PGWardrobe.defaults('f'),headwear:'halo',backwear:'wings'};window.__installed=false;
  const prev=cloudFetch;cloudFetch=async(p,o)=>{if(p==='/shop/catalog')return {ok:true,status:200,json:async()=>({currency:'usd',mode:'off',installed:__installed,slots:Object.keys(PGWardrobe.ACCESSORIES),items:PGShop.catalog(PGWardrobe).items,owned:[],user:'skill-test'})};return prev(p,o)};
  localStorage.removeItem('pg_shop_owned_skill-test');shopSession('skill-test')`);await settle();
 assert.equal(ev('SHOP.installed'),false);assert.equal(ev('SHOP.loaded'),true);
 assert.deepEqual(Array.from(ev("[wardrobeAppearance().headwear,wardrobeAppearance().backwear]")),['halo','wings'],'nothing is stripped before the tables exist');
 assert.equal(ev("shopLockedIn(S.appearance).length"),0);
 ev(`tabs.length=0;tabs.push('wardrobe');renderWin();wardrobeLoad();`);await settle();
 assert.equal(ev("wardrobeState.draft.backwear"),'wings');
 ev(`wardrobeChange('facewear','glasses')`);await settle();
 assert.equal(ev("$('wardrobeApply').disabled"),false,'the wardrobe is not locked either');assert.equal(ev("$('wardrobeBuy').hidden"),true);
 assert.equal([...g.window.document.querySelector('[data-wardrobe="backwear"]').options].find(o=>o.value==='wings').textContent,'Archangel wings','no price tags while nothing is for sale');
 ev(`tabs.length=0;tabs.push('shop');SHOP.view='cosmetics';renderWin()`);h=ev("$('wins').innerHTML");
 assert.ok(h.includes('not switched on for this server yet'),'the panel says so');assert.ok(!/data-v="buy:[^"]+">/.test(h)&&/data-v="buy:[^"]+" disabled/.test(h),'every Buy is disabled');
 const tabsBefore=ev('__tabs.length');ev(`shopBuy('cos:headwear:halo')`);await settle();assert.match(ev('SHOP.note'),/not switched on/);assert.equal(ev('__tabs.length'),tabsBefore,'no tab is opened');
 // the catalog could not be fetched at all and nothing is cached: the save is trusted, the server decides
 ev(`shopReset();cloudFetch=async()=>{throw new Error('offline')};localStorage.removeItem('pg_shop_owned_skill-test');shopSession('skill-test')`);await settle();
 assert.equal(ev('SHOP.loaded'),false);assert.equal(ev('SHOP.cached'),false);assert.match(ev('SHOP.error'),/could not be reached/);
 assert.equal(ev("shopLockedIn(S.appearance).length"),0);assert.equal(ev('wardrobeAppearance().backwear'),'wings');
 // once the migration has run, the same answer with installed:true engages the lock (owned is empty here: nothing grandfathered)
 ev(`shopReset();window.__installed=true;cloudFetch=async(p,o)=>{if(p==='/shop/catalog')return {ok:true,status:200,json:async()=>({currency:'usd',mode:'off',installed:true,slots:Object.keys(PGWardrobe.ACCESSORIES),items:PGShop.catalog(PGWardrobe).items,owned:['cos:backwear:wings'],user:'skill-test'})};throw new Error('nope')};shopSession('skill-test')`);await settle();
 assert.equal(ev('SHOP.installed'),true);assert.deepEqual(Array.from(ev("[wardrobeAppearance().headwear,wardrobeAppearance().backwear]")),['none','wings'],'grandfathered wings stay, the halo they never owned comes off');

 // ---- 8. sign out clears the mirror; back from Stripe shows a line on the login card -------------------
 ev(`shopReset()`);assert.equal(ev('SHOP.owned.size'),0);assert.equal(ev('SHOP.user'),null);
 assert.deepEqual(Array.from(ev("JSON.parse(localStorage.getItem('pg_shop_owned_skill-test'))")),['cos:backwear:wings'],'the per-account cache stays on disk for the next sign-in');
 ev(`history.replaceState(null,'','/?shop=success&order=ord_1');shopReturnBanner()`);
 assert.match(ev("$('shopReturn').textContent"),/Payment received[^]*ord_1/);assert.equal(ev('location.search'),'','the address is cleaned');
 ev(`$('shopReturn').remove();history.replaceState(null,'','/?shop=cancel&order=%3Cb%3Ex');shopReturnBanner()`);
 assert.match(ev("$('shopReturn').textContent"),/cancelled/);assert.ok(!ev("$('shopReturn').innerHTML").includes('<b>'),'order ids are plain text');
 console.log('shop_sim: PASS');
 g.close();process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
