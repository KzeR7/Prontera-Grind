const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createGame}=require('./helpers/game');const repo=path.resolve(__dirname,'../..');let html=fs.readFileSync(path.join(repo,'index.html'),'utf8');
for(const f of ['assets/wardrobe.js','assets/wardrobe-ui.js'])html=html.replace(new RegExp('<script src="'+f.replaceAll('.','\\.')+'\\?v=1"></script>'),()=>'<script>'+fs.readFileSync(path.join(repo,f),'utf8')+'</script>');
const g=createGame(html),ev=g.ev;
(async()=>{
 ev(`window.matchMedia=()=>({matches:false});window.__saveCount=0;save=()=>{__saveCount++};S.hair=17;S.sex='f';S.cls='Lord Knight';tabs.push('wardrobe');renderWin();`);
 // Loader itself is checked against actual files separately; this test controls readiness/failure.
 g.window.__catalog=JSON.parse(fs.readFileSync(path.join(repo,'assets/wardrobe/v1/catalog.json'),'utf8'));
 g.window.__metadata={};for(const [id,r] of Object.entries(g.window.__catalog.assets))g.window.__metadata[id]=JSON.parse(fs.readFileSync(path.join(repo,'assets/wardrobe/v1',r.meta),'utf8'));
 ev(`wardrobeStore.select=async(client,a)=>({key:PGWardrobe.key(a),selection:PGWardrobe.normalize(a),ids:['base-'+a.sex,'hair-'+PGWardrobe.key(a)],base:{metadata:__metadata['base-'+a.sex],image:{}},hair:{metadata:__metadata['hair-'+PGWardrobe.key(a)],image:{}}});wardrobeLoad();`);await new Promise(r=>setImmediate(r));
 assert.equal(ev('S.appearance'),null);assert.equal(ev('S.hair'),17);assert.equal(ev('__saveCount'),0);
 ev(`wardrobeChange('head',42);wardrobeChange('color',8);wardrobeChange('halo',false);`);await new Promise(r=>setImmediate(r));assert.equal(ev('S.appearance'),null);assert.equal(ev('__saveCount'),0);
 ev(`wardrobeAction('cancel')`);await new Promise(r=>setImmediate(r));assert.equal(ev('wardrobeState.draft.heads.f'),2);assert.equal(ev('S.hair'),17);
 ev(`wardrobeChange('head',42)`);await new Promise(r=>setImmediate(r));ev(`wardrobeChange('color',8)`);await new Promise(r=>setImmediate(r));ev(`wardrobeChange('wings',false);wardrobeAction('apply')`);
 assert.equal(ev('__saveCount'),1);assert.equal(ev('S.appearance.heads.f'),42);assert.equal(ev('S.appearance.colors.f'),8);assert.equal(ev('S.appearance.wings'),false);assert.equal(ev('S.hair'),17);assert.equal(ev('S.eq.weapon.wt'),'dagger');
 // Actual load() normalization and old hair preservation, using local-only synthetic saves.
 const saved=ev('JSON.stringify(S)');g.window.localStorage.setItem('pg_save3_skill-test',saved);assert.equal(ev('load().appearance.heads.f'),42);assert.equal(ev('load().hair'),17);
 ev(`wardrobeChange('sex','m');wardrobeChange('head',5)`);await new Promise(r=>setImmediate(r));assert.equal(ev('S.sex'),'f');ev(`wardrobeChange('sex','f')`);await new Promise(r=>setImmediate(r));assert.equal(ev('wardrobeState.draft.heads.f'),42);
 ev(`wardrobeHero({cls:'Lord Knight'})`);await new Promise(r=>setImmediate(r));assert.equal(ev('wardrobeEquipped.key'),'f-42-8');assert.equal(ev(`wardrobeHero({cls:'Novice'})`),null);assert.equal(ev('S.appearance.heads.f'),42);
 ev(`wardrobeHero({cls:'Lord Knight'})`);await new Promise(r=>setImmediate(r));ev(`window.__sprite=mkWardrobeHero(wardrobeEquipped)`);
 assert.equal(ev(`captureWardrobeFrame(__sprite,7,false,1,1000)`),true);assert.equal(ev(`captureWardrobeFrame(__sprite,7,false,1,1050)`),false);ev(`captureWardrobeFrame(__sprite,7,false,.001,999999)`);assert.equal(ev('__sprite.userData.wardrobe.paint'),'attack7:8');assert.equal(ev(`captureWardrobeFrame(__sprite,7,true,0,1000000)`),true);
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
 ev(`wardrobeAction('original')`);assert.equal(ev('S.appearance'),null);assert.equal(ev('S.hair'),17);assert.equal(ev('__saveCount'),2);
 ev(`S=fresh();S.hair=12;wardrobeOwner()`);assert.equal(ev('wardrobeEquipped'),null);assert.equal(ev('wardrobeState.draft'),null);ev(`renderWin()`);await new Promise(r=>setImmediate(r));assert(ev('!!wardrobeState.look'),'same canvas loads again after owner reset');
 console.log('PASS: Wardrobe preview/apply/cancel, male/female memory, legacy saves, actual save/load, class fallback, native attack clock/upload dedupe, close/reopen, owner reset and merged Escape/W navigation.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>g.close());
