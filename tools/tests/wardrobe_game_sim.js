const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createGame}=require('./helpers/game');const repo=path.resolve(__dirname,'../..');let html=fs.readFileSync(path.join(repo,'index.html'),'utf8');
for(const f of ['assets/wardrobe.js','assets/wardrobe-ui.js'])html=html.replace(new RegExp('<script src="'+f.replaceAll('.','\\.')+'\\?v=[0-9]+"></script>'),()=>'<script>'+fs.readFileSync(path.join(repo,f),'utf8')+'</script>');
const g=createGame(html),ev=g.ev;
(async()=>{
 assert.deepEqual(Array.from(ev('Object.keys(PGWardrobe.CLASSES)')).sort(),Array.from(ev('Object.keys(CLASSES).filter(k=>CLASSES[k].tier<4)')).sort(),'native wardrobe covers parent bodies; fourth jobs use the packed parent fallback');
 assert.equal(ev('CD4.every(c=>!wardrobeSupported(c[0])&&!!packBodyFor(c[0],4))'),true,'every fourth job has a parent packed-body fallback');
 ev(`window.matchMedia=()=>({matches:false});window.__saveCount=0;save=()=>{__saveCount++};S.hair=17;S.sex='f';S.cls='Lord Knight';tabs.push('wardrobe');renderWin();`);
 // Loader itself is checked against actual files separately; this test controls readiness/failure.
 g.window.__catalog=JSON.parse(fs.readFileSync(path.join(repo,'assets/wardrobe/v5/catalog.json'),'utf8'));
 g.window.__metadata={};for(const [id,r] of Object.entries(g.window.__catalog.assets))g.window.__metadata[id]=require('../../assets/wardrobe.js').validateMeta(JSON.parse(fs.readFileSync(path.join(repo,'assets/wardrobe/v5',r.meta),'utf8')),r);
 ev(`wardrobeStore.select=async(client,a,cls='Lord Knight')=>{const job=PGWardrobe.CLASSES[cls],route=id=>({metadata:{clock:__metadata[id].clock,actions:Object.fromEntries(Object.entries(__metadata[id].actions).filter(([k])=>k.startsWith(job+':')).map(([k,v])=>[k.split(':')[1],v]))},image:{}});return {key:job+'|'+PGWardrobe.key(a),cls,selection:PGWardrobe.normalize(a),ids:[],base:{metadata:__metadata['base-'+job+'-'+a.sex],figureHeight:__catalog.assets['base-'+job+'-'+a.sex].figureHeight,image:{}},hair:route('hair-'+PGWardrobe.key(a)),pieces:Object.keys(PGWardrobe.ACCESSORIES).map(k=>a[k]).filter(k=>k&&k!=='none').map(k=>route('piece-'+k+'-'+a.sex))}};wardrobeLoad();`);await new Promise(r=>setImmediate(r));
 assert.equal(ev('S.appearance'),null);assert.equal(ev('S.hair'),17);assert.equal(ev('__saveCount'),0);
 ev(`wardrobeChange('head',42);wardrobeChange('color',8);wardrobeChange('halo',false);`);await new Promise(r=>setImmediate(r));assert.equal(ev('S.appearance'),null);assert.equal(ev('__saveCount'),0);
 ev(`wardrobeAction('cancel')`);await new Promise(r=>setImmediate(r));assert.equal(ev('wardrobeState.draft.heads.f'),2);assert.equal(ev('S.hair'),17);
 ev(`wardrobeChange('head',42)`);await new Promise(r=>setImmediate(r));ev(`wardrobeChange('color',8)`);await new Promise(r=>setImmediate(r));ev(`wardrobeChange('wings',false);wardrobeChange('halo',true)`);await new Promise(r=>setImmediate(r));ev(`wardrobeAction('apply')`);
 assert.equal(ev('__saveCount'),1);assert.equal(ev('S.appearance.heads.f'),42);assert.equal(ev('S.appearance.colors.f'),8);assert.equal(ev('S.appearance.wings'),false);assert.equal(ev('S.hair'),17);assert.equal(ev('S.eq.weapon.wt'),'dagger');
 // Actual load() normalization and old hair preservation, using local-only synthetic saves.
 const saved=ev('JSON.stringify(S)');g.window.localStorage.setItem('pg_save3_skill-test',saved);assert.equal(ev('load().appearance.heads.f'),42);assert.equal(ev('load().hair'),17);
 ev(`ACT.sex('m');wardrobeChange('head',5)`);await new Promise(r=>setImmediate(r));assert.equal(ev('S.sex'),'m');ev(`ACT.sex('f')`);await new Promise(r=>setImmediate(r));assert.equal(ev('wardrobeState.draft.heads.f'),42);
 ev(`wardrobeHero({cls:'Lord Knight'})`);await new Promise(r=>setImmediate(r));assert.equal(ev('wardrobeEquipped.key'),'4008|f-42-8');assert.equal(ev(`wardrobeHero({cls:'Unknown class'})`),null);assert.equal(ev('S.appearance.heads.f'),42);
 ev(`wardrobeHero({cls:'Lord Knight'})`);await new Promise(r=>setImmediate(r));ev(`window.__sprite=mkWardrobeHero(wardrobeEquipped)`);
 assert.equal(ev(`captureWardrobeFrame(__sprite,7,false,1,1000)`),true);assert.equal(ev(`captureWardrobeFrame(__sprite,7,false,1,1050)`),false);ev(`captureWardrobeFrame(__sprite,7,false,.001,999999)`);assert.equal(ev('__sprite.userData.wardrobe.paint'),'attack7:8');assert.equal(ev(`captureWardrobeFrame(__sprite,7,true,0,1000000)`),true);
 // Refine changes repaint an unchanged native pose and the live renderer targets weapon layers only.
 ev(`window.__effects=[];window.__glow=drawNativeWeaponGlow;drawNativeWeaponGlow=(ctx,img,p,phase,glow,trail,progress)=>__effects.push([p[7],phase,glow.at,progress]);S.eq.weapon.r=10;captureWardrobeFrame(__sprite,7,false,.5,1000033)`);
 assert.ok(ev('__effects.length')>0);assert.equal(ev('__effects.every(e=>e[0]==="weapon"&&e[2]===10&&e[3]===.5)'),true);
 assert.equal(ev('__effects.filter(e=>e[1]==="before").length'),ev('__effects.filter(e=>e[1]==="after").length'));
 assert.equal(ev('captureWardrobeFrame(__sprite,7,false,.5,1000066)'),true,'glint/trail repaint while native pose is unchanged');
 ev('S.eq.weapon.r=0;__effects=[]');assert.equal(ev('captureWardrobeFrame(__sprite,7,false,.5,1000066)'),true,'removing refinement clears cached glow');assert.equal(ev('__effects.length'),0);
 ev('drawNativeWeaponGlow=__glow');
 // Every new tree class uses its own native body/clock and preserves the cosmetic save.
 const applied=ev('JSON.stringify(S.appearance)');
 for(const cls of ['Novice','Mage','Wizard','High Wizard','Acolyte','Priest','High Priest','Merchant','Blacksmith','Whitesmith']){
  ev(`S.cls=${JSON.stringify(cls)};renderWin()`);await new Promise(r=>setImmediate(r));
  assert.equal(ev('wardrobeState.look.cls'),cls);assert.equal(ev('JSON.stringify(S.appearance)'),applied);
  assert.equal(ev('wardrobeHero({cls:S.cls})'),null,'old class is not shown while loading');await new Promise(r=>setImmediate(r));
  assert.equal(ev('wardrobeHero({cls:S.cls}).cls'),cls);
  ev('window.__sprite=mkWardrobeHero(wardrobeEquipped)');
  for(let d=0;d<8;d++) assert.equal(ev(`captureWardrobeFrame(__sprite,${d},false,1,1000)`),true);
 }
 assert.deepEqual(Array.from(ev('DOCK_TABS.slice(-2)')),['wardrobe','set']);
 // Wardrobe is bound to the active class; obsolete selectors cannot change the preview.
 const currentJob=ev('S.cls'),gear=ev('JSON.stringify(S.eq)');
 ev(`wardrobeChange('class','Acolyte')`);await new Promise(r=>setImmediate(r));
 assert.equal(ev('wardrobeState.look.cls'),currentJob);assert.equal(ev('S.cls'),currentJob);
 for(const field of ['class','stance','direction','still'])assert.equal(g.window.document.querySelector('[data-wardrobe="'+field+'"]'),null,'no '+field+' selector');
 assert.equal(g.window.document.querySelector('[data-wardrobe-action="play"]'),null);
 ev(`wardrobeAction('apply')`);assert.equal(ev('S.cls'),currentJob);assert.equal(ev('JSON.stringify(S.eq)'),gear);
 // Head has thirteen choices, Face twelve, Mouth ten and Wings seventeen, plus None.
 const hairOptions=[...g.window.document.querySelector('[data-wardrobe="head"]').options];assert.deepEqual(hairOptions.map(o=>o.textContent),Array.from({length:20},(_,i)=>'Style '+(i+1)));assert.equal(hairOptions.at(-1).value,'42');
 for(const field of ['headwear','facewear','mouthwear','backwear'])assert.equal(g.window.document.querySelector('[data-wardrobe="'+field+'"]').options.length,field==='headwear'?14:field==='backwear'?18:field==='facewear'?13:11);
 assert.equal(g.window.document.querySelector('[data-wardrobe="outfit"]'),null);
 // Gender previews preserve progress and only apply after assets are ready.
 const originalSex=ev('S.sex');
 ev(`wardrobeChange('sex',S.sex==='m'?'f':'m')`);await new Promise(r=>setImmediate(r));
 assert.equal(ev('S.sex'),originalSex,'preview does not change saved sex');
 ev(`wardrobeAction('cancel')`);await new Promise(r=>setImmediate(r));assert.equal(ev('wardrobeState.draft.sex'),originalSex);
 ev(`wardrobeChange('sex',S.sex==='m'?'f':'m')`);await new Promise(r=>setImmediate(r));ev(`wardrobeAction('apply')`);
 assert.notEqual(ev('S.sex'),originalSex);assert.equal(ev('S.appearance.sex'),ev('S.sex'));assert.equal(ev('JSON.stringify(S.eq)'),gear);assert.equal(ev('S.cls'),currentJob);
 ev(`wardrobeChange('sex',${JSON.stringify(originalSex)})`);await new Promise(r=>setImmediate(r));ev(`wardrobeAction('apply')`);
 const fixture=ev('JSON.stringify(S.appearance)'),beforeSlots=ev('__saveCount');
 const progressState='JSON.stringify({lv:S.lv,exp:S.exp,jobs:S.jobs,base:S.base,st:S.st,pts:S.pts,sk:S.sk,bag:S.bag})',progression=ev(progressState);
 ev(`S.appearance.outfit='vanguard'`);assert.equal(ev('wardrobeAppearance().outfit'),'none','retired body returns to actual class');
 ev(`wardrobeChange('headwear','foxEars');wardrobeChange('facewear','heartPatch');wardrobeChange('mouthwear','poringLetter');wardrobeChange('backwear','evilScythe');wardrobeAction('apply')`);
 assert.equal(ev('__saveCount'),beforeSlots,'pending pieces cannot apply');await new Promise(r=>setImmediate(r));ev(`wardrobeAction('apply')`);
 assert.equal(ev('S.appearance.backwear'),'evilScythe');assert.equal(ev('S.appearance.outfit'),'none');assert.equal(ev('S.cls'),currentJob);assert.equal(ev('JSON.stringify(S.eq)'),gear);
 g.window.localStorage.setItem('pg_save3_skill-test',ev('JSON.stringify(S)'));assert.equal(ev('load().appearance.mouthwear'),'poringLetter');assert.equal(ev('load().appearance.backwear'),'evilScythe');assert.equal(ev(progressState),progression,'cosmetics preserve progression');
 g.window.__fixture=fixture;ev(`S.appearance=JSON.parse(__fixture);wardrobeAction('cancel');__saveCount--`);await new Promise(r=>setImmediate(r));
 // Closing a pending preview must permit reopening/retry and must discard unsaved drafts.
 ev(`wardrobeState.loading=true;tabs.splice(0);wardrobeSync();tabs.push('wardrobe');renderWin()`);await new Promise(r=>setImmediate(r));assert.equal(ev('wardrobeState.loading'),false);assert.equal(ev('wardrobeState.draft.heads.f'),42);
 // Merged main keyboard handling: selectors keep typing keys, Escape discards drafts and W reopens.
 const savesBeforeEscape=ev('__saveCount');
 ev(`wardrobeChange('halo',false);tabs.push('bag');expandedPanels.add('wardrobe');renderWin()`);
 const select=g.window.document.querySelector('[data-wardrobe="head"]');select.focus();
 select.dispatchEvent(new g.window.KeyboardEvent('keydown',{key:'w',bubbles:true}));
 assert.equal(ev("tabs.includes('wardrobe')"),true,'typing into a selector does not toggle Wardrobe');
 select.dispatchEvent(new g.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 assert.equal(ev('tabs.length'),0);assert.equal(ev('expandedPanels.size'),0);assert.equal(ev('wardrobeState.draft'),null);
 assert.equal(ev('S.appearance.halo'),true);assert.equal(ev('__saveCount'),savesBeforeEscape);
 g.window.document.body.dispatchEvent(new g.window.KeyboardEvent('keydown',{key:'w',bubbles:true}));
 await new Promise(r=>setImmediate(r));assert.equal(ev('wardrobeState.draft.halo'),true);assert(ev('!!wardrobeState.look'));
 ev(`wardrobeAction('original')`);assert.equal(ev('S.appearance'),null);assert.equal(ev('S.hair'),17);assert.equal(ev('__saveCount'),7);
 ev(`S=fresh();S.cls='Swordman';S.hair=12;wardrobeOwner()`);assert.equal(ev('wardrobeEquipped'),null);assert.equal(ev('wardrobeState.draft'),null);ev(`renderWin()`);await new Promise(r=>setImmediate(r));assert(ev('!!wardrobeState.look'),'same canvas loads again after owner reset');
 // No opt-in is needed, and changing class cannot display the old class during loading.
 assert.equal(ev('S.appearance'),null);ev("wardrobeHero({cls:S.cls})");await new Promise(r=>setImmediate(r));assert.equal(ev('wardrobeEquipped.cls'),'Swordman');
 for(const cls of ['Novice','Mage','Wizard','High Wizard','Knight','Lord Knight','Thief','Assassin','Assassin Cross','Archer','Hunter','Sniper']){
  g.window.__nextClass=cls;
  ev(`S.cls=__nextClass;renderWin();window.__pendingHero=wardrobeHero({cls:S.cls})`);
  assert.equal(ev('__pendingHero'),null,'old class hidden while new class loads');await new Promise(r=>setImmediate(r));
  assert.equal(ev('wardrobeState.look.cls'),cls);assert.equal(ev('wardrobeEquipped.cls'),cls);
  ev(`ensureHero({cls:S.cls,sex:S.sex,tier:CLASSES[S.cls].tier});window.__nativeSprite=heroSpr`);
  assert.equal(ev('heroSpr.userData.wardrobe.look.cls'),cls);assert(Number.isFinite(ev('heroSpr.scale.y')));assert(Math.abs(ev('heroSpr.scale.y*heroSpr.userData.wardrobe.look.base.figureHeight/280-SKIN_H'))<1e-9);
  for(let d=0;d<8;d++){ev(`captureWardrobeFrame(__nativeSprite,${d},true,0,1000);captureWardrobeFrame(__nativeSprite,${d},false,1,2000);captureWardrobeFrame(__nativeSprite,${d},false,.001,3000)`);assert(ev(`__nativeSprite.userData.wardrobe.paint.startsWith('attack${d}:')`))}
  const save=ev('JSON.stringify(S)');g.window.localStorage.setItem('pg_save3_skill-test',save);assert.equal(ev('load().cls'),cls);assert.equal(ev('load().appearance'),null);
 }
 ev(`tabs.push('job');window.__portrait=document.createElement('canvas');__portrait.width=126;__portrait.height=134;wardrobePortrait(__portrait,'Archer')`);await new Promise(r=>setImmediate(r));assert.equal(ev('wardrobeClassLook.cls'),'Archer');assert.equal(ev(`wardrobePortrait(__portrait,'Archer')`),true);
 // Each requested head survives apply/save/load; the independently looping
 // effect invalidates preview, battlefield and portrait repaint caches.
 ev(`S.cls='Novice';S.sex='m';tabs.splice(0);tabs.push('wardrobe');wardrobeOwner();renderWin()`);
 await new Promise(r=>setImmediate(r));
 for(const headwear of ['afkBalloon','dragonHelm','goldDragonHelm']){
  g.window.__requestedHead=headwear;
  ev(`wardrobeChange('headwear',__requestedHead);wardrobeChange('backwear','blackThunder')`);
  await new Promise(r=>setImmediate(r));ev(`wardrobeAction('apply')`);
  g.window.localStorage.setItem('pg_save3_skill-test',ev('JSON.stringify(S)'));
  assert.equal(ev('load().appearance.headwear'),headwear);assert.equal(ev('load().appearance.backwear'),'blackThunder');
 }
 ev(`window.__effectLook=wardrobeState.look;window.__effectHero=mkWardrobeHero(__effectLook);window.__beforeBody=captureWardrobeFrame(__effectHero,0,false,.5,1000);window.__afterEffect=captureWardrobeFrame(__effectHero,0,false,.5,1100)`);
 assert.equal(ev('__afterEffect'),true,'effect uploads a new frame during a fixed attack pose');
 ev(`wardrobeEquipped=__effectLook;wardrobePortrait(__portrait,'Novice');window.__portraitFrame=__portrait._wardrobePaint;window.__realNow=performance.now;performance.now=()=>100000;wardrobePortrait(__portrait,'Novice')`);
 assert.notEqual(ev('__portrait._wardrobePaint'),ev('__portraitFrame'),'portrait repaints animated accessories');
 ev(`performance.now=__realNow;wardrobeAction('original')`);
 // All seven added choices survive the actual save/load path for both genders.
 const sevenChoices={backwear:['bearBag','shuriken','poisonSpider','mainspringScrew','sorcererCape'],facewear:['gozarianMask','demonMask']};
 const beforeSeven=ev(progressState),gearBeforeSeven=ev('JSON.stringify(S.eq)');
 for(const sex of ['m','f']){
  g.window.__sevenSex=sex;ev(`ACT.sex(__sevenSex);renderWin()`);await new Promise(r=>setImmediate(r));
  for(const [slot,choices] of Object.entries(sevenChoices))for(const choice of choices){
   g.window.__sevenSlot=slot;g.window.__sevenChoice=choice;
   ev(`wardrobeChange(__sevenSlot,__sevenChoice)`);await new Promise(r=>setImmediate(r));
   ev(`wardrobeAction('apply')`);
   g.window.localStorage.setItem('pg_save3_skill-test',ev('JSON.stringify(S)'));
   assert.equal(ev('load().appearance[__sevenSlot]'),choice);
   assert.equal(ev('load().sex'),sex);
   assert.equal(ev(progressState),beforeSeven,'new pieces preserve progression');
   assert.equal(ev('JSON.stringify(S.eq)'),gearBeforeSeven,'new pieces preserve equipment');
  }
 }
 ev(`wardrobeAction('original')`);
 // Legacy art is requested once only when the fallback is actually used.
 ev(`delete window.SPRITE_PACK;packAssetRequested=false;window.__pendingAdapter=wardrobePending;wardrobePending=undefined;window.__legacySkinKeys=Object.keys(skinDocs).length;heroKey=''`);
 Object.defineProperty(g.window.document,'readyState',{value:'loading',configurable:true});ev(`ensureHero({cls:'Novice',sex:'m',tier:0})`);
 assert.equal(ev('heroSpr'),null,'no obsolete sprite during native startup');
 assert.equal(ev('packAssetRequested'),false,'native startup does not fetch fallback while adapter is loading');assert.equal(ev('Object.keys(skinDocs).length'),ev('__legacySkinKeys'),'native startup avoids APNG fallback downloads');
 ev(`wardrobePending=__pendingAdapter;requestPackAssets();requestPackAssets()`);
 const fallbackScripts=[...g.window.document.querySelectorAll('script[src]')].filter(el=>el.src.includes('sprite_pack_data.js'));assert.equal(fallbackScripts.length,1);
 fallbackScripts[0].onerror();ev('requestPackAssets()');assert.equal([...g.window.document.querySelectorAll('script[src]')].filter(el=>el.src.includes('sprite_pack_data.js')).length,0,'failed fallback does not retry every animation frame');
 console.log('PASS: Wardrobe preview/apply/cancel, male/female memory, legacy saves, actual save/load, class fallback, native attack clock/upload dedupe, close/reopen, owner reset and merged Escape/W navigation.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>g.close());
