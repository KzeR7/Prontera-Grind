// Optional real-Chromium layout regression against the disposable changes-only preview.
// PREVIEW_PAGE=tools/mastery_update_preview.html python3 tools/preview_server.py 8000
// node tools/check_mastery_titles_browser.cjs [--dist] [--plaza]
// Requires playwright-core and @sparticuz/chromium (see docs/TESTING.md). No real account.
'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=new URL(process.env.MASTERY_PREVIEW_URL||'http://127.0.0.1:8000');
if(!['127.0.0.1','localhost','[::1]'].includes(root.hostname))throw Error('Only a disposable loopback preview is allowed');
const url=p=>new URL(p,root).href;

async function launch(){
 const mod=require('@sparticuz/chromium'),lib=await mod.inflate(path.resolve(path.dirname(require.resolve('@sparticuz/chromium')),'../bin/al2023.tar.br'));
 return chromium.launch({executablePath:await mod.default.executablePath(),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
  env:{...process.env,LD_LIBRARY_PATH:path.join(lib,'lib')+':'+(process.env.LD_LIBRARY_PATH||'')}});
}
function recordErrors(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&/(^|\/)assets\//.test(new URL(r.url()).pathname))errors.push(r.status()+' '+r.url())});
 return errors;
}
async function symbolBounds(page){
 return page.locator('.tc-card .tc-symbol .title-symbol').evaluateAll(async images=>{
  for(const img of images)img.loading='eager';
  await Promise.all(images.map(img=>img.decode()));
  return images.map(img=>{const parent=img.parentElement,r=parent.getBoundingClientRect(),i=img.getBoundingClientRect();
   return {id:parent.closest('.tc-card').dataset.titleId,src:img.getAttribute('src'),natural:[img.naturalWidth,img.naturalHeight],fit:getComputedStyle(img).objectFit,
    inside:i.left>=r.left-.25&&i.top>=r.top-.25&&i.right<=r.right+.25&&i.bottom<=r.bottom+.25};});
 });
}
async function checkPreview(page,label){
 const errors=recordErrors(page);await page.goto(url('/'),{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('#tab-titles').click();
 assert.equal(await page.locator('.tc-card').count(),50);
 const boxes=await symbolBounds(page);assert.equal(boxes.length,50);assert.equal(new Set(boxes.map(x=>x.src)).size,50);
 for(const box of boxes)assert(box.inside&&box.fit==='contain'&&box.natural[0]>0&&box.natural[1]>0,JSON.stringify(box));
 assert.equal(await page.locator('#demoHeroText').textContent(),'Mythic Edge');
 assert.equal(await page.locator('#demoHeroMark img').getAttribute('src'),'assets/title-symbols/49.webp');
 let stage=await page.evaluate(()=>{const actor=document.querySelector('.world-actor').getBoundingClientRect(),title=document.querySelector('#demoHeroTitle').getBoundingClientRect(),mark=document.querySelector('#demoHeroMark').getBoundingClientRect(),img=document.querySelector('#demoHeroMark img').getBoundingClientRect();return {actor:actor.toJSON(),title:title.toJSON(),mark:mark.toJSON(),img:img.toJSON()}});
 assert(stage.title.top>=stage.actor.bottom-.5,'sample title must sit below the character');
 assert(stage.img.right<=stage.mark.right+.5&&stage.img.bottom<=stage.mark.bottom+.5,'sample logo must fit in its mark');
 await page.locator('[data-title-id="field-scout"] .tc-equip').click();
 assert.equal(await page.locator('#demoHeroText').textContent(),'Field Scout');
 assert.equal(await page.locator('#demoHeroMark img').getAttribute('src'),'assets/title-symbols/45.webp');
 assert.equal(await page.locator('.tc-card.is-equipped .preview-view-link').getAttribute('href'),'#worldPreview');
 await page.locator('[data-title-id="field-scout"] .tc-equip').click();
 assert.equal(await page.locator('#demoHeroTitle').evaluate(e=>getComputedStyle(e).display),'none');
 assert.equal(await page.locator('#demoHeroEmpty').isVisible(),true);
 await page.locator('[data-title-id="mythic-edge"] .tc-equip').click();
 assert.equal(await page.locator('#demoHeroText').textContent(),'Mythic Edge');
 await page.locator('#tab-art').click();assert.equal(await page.locator('.art-card').count(),130);
 await page.locator('#tab-buffs').click();
 for(const id of ['warcry','arcane','siphon','vital']){
  await page.locator(`[data-pet-demo="${id}"]`).click();
  assert.equal(await page.locator(`[data-pet-demo="${id}"]`).getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#hudBuffs .buff-art').count(),1,'only one sample pet effect at a time');
  assert.equal(await page.locator(`#pet-buff-${id} img`).getAttribute('src'),`assets/expanded-skill-icons/pet_${id}.webp`);
 }
 assert.equal(await page.locator('.pet-showcase a').getAttribute('href'),'#buffField');
 const active=page.locator('#pet-buff-vital');await active.focus();const before=Number(await active.locator('.s').textContent());
 // Wait for the actual update rather than assuming a timer fires at an exact wall time;
 // headless software rendering can temporarily delay the browser's main thread.
 await page.waitForFunction(previous=>Number(document.querySelector('#pet-buff-vital .s')?.textContent)<previous,before,{timeout:15000,polling:200});
 assert(await active.evaluate(e=>document.activeElement===e),'countdown retains focus');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),await page.evaluate(()=>innerWidth),'preview must not overflow horizontally');
 assert.deepEqual(errors,[]);console.log(label+': 50 complete symbols; equip/switch/remove preview; four pet icons and timers');
}
async function checkGame(page,label,route){
 const errors=recordErrors(page);await page.bringToFront();await page.goto(url(route),{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>{try{return !document.hidden&&eval('typeof fresh')==='function'&&typeof PGTitles!=='undefined'}catch{return false}},{timeout:60000});
 await page.evaluate(()=>eval(`simAdvance=()=>{};currentUser='mastery-layout-check';S=fresh();S.auto=false;S.indexXp=1000000;S.eq.weapon.r=15;
  PGTitles.sync(S,CLASSES);S.equippedTitle='mythic-edge';document.getElementById('loginOverlay').style.display='none';document.getElementById('wrap').style.display='block';
  tabs.length=0;renderWin();bars();ct.set(pl.x*.6,CAMERA_FOCUS_Y,pl.z-CAMERA_LEAD_Z);for(let i=0;i<3;i++)draw()`));
 await page.evaluate(()=>eval("simOccluded=false;simFrameAt=performance.now();tabs.splice(0,tabs.length,'index');indexMode='titles';renderWin()"));
 const boxes=await symbolBounds(page);assert.equal(boxes.length,50);assert.equal(new Set(boxes.map(x=>x.src)).size,50);
 for(const box of boxes)assert(box.inside&&box.fit==='contain'&&box.natural[0]>0&&box.natural[1]>0,JSON.stringify(box));
 await page.evaluate(()=>eval('simOccluded=false;simFrameAt=performance.now();tabs.length=0;renderWin();draw()'));
 const title=page.locator('#heroTitle'),image=page.locator('#heroTitleMark img');await image.evaluate(img=>img.decode());
 assert.equal(await page.locator('#heroTitleText').textContent(),'Mythic Edge');assert.equal(await image.getAttribute('loading'),'eager');
 const geometry=await page.evaluate(()=>{const title=document.querySelector('#heroTitle'),mark=document.querySelector('#heroTitleMark'),image=mark.querySelector('img'),view=document.querySelector('#ov').getBoundingClientRect(),r=title.getBoundingClientRect(),m=mark.getBoundingClientRect(),i=image.getBoundingClientRect(),foot=eval('scr(pl.x,.16+(KIT.nativeWorld?actorFloorY()-.035:0),pl.z)');
  return {title:r.toJSON(),mark:m.toJSON(),image:i.toJSON(),foot:[foot[0]+view.left,foot[1]+view.top],scroll:title.scrollWidth,client:title.clientWidth,fit:getComputedStyle(image).objectFit,display:getComputedStyle(title).display};});
 assert.equal(geometry.display,'block');assert.equal(geometry.fit,'contain');
 assert(Math.abs((geometry.title.left+geometry.title.right)/2-geometry.foot[0])<2,'title centered under player: '+JSON.stringify(geometry));
 assert(geometry.title.top>=geometry.foot[1]+6,'title follows below projected feet: '+JSON.stringify(geometry));
 assert(geometry.image.left>=geometry.mark.left-.5&&geometry.image.right<=geometry.mark.right+.5&&geometry.image.top>=geometry.mark.top-.5&&geometry.image.bottom<=geometry.mark.bottom+.5,'logo fits its box: '+JSON.stringify(geometry));
 await page.evaluate(()=>eval("ACT.titleequip('midgard-vanguard');draw()"));
 assert.equal(await page.locator('#heroTitleText').textContent(),'Rune-Midgarts Vanguard');
 assert.equal(await image.getAttribute('src'),'assets/title-symbols/29.webp');
 assert(await title.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'long rank name must fit on screen');
 await page.evaluate(()=>eval("ACT.titleequip('none');draw()"));assert.equal(await title.evaluate(e=>getComputedStyle(e).display),'none');
 await page.evaluate(()=>eval("ACT.titleequip('field-initiate');save();S=load();draw()"));
 assert.equal(await page.locator('#heroTitleText').textContent(),'Field Initiate');assert.equal(await image.getAttribute('src'),'assets/title-symbols/47.webp');
 for(const id of ['warcry','arcane','siphon','vital']){
  await page.evaluate(id=>eval(`simOccluded=false;simFrameAt=performance.now();petBuff={};petBuffSrc={};{const s=PET_SKILLS.find(x=>x.id===${JSON.stringify(id)});petBuff[s.stat]=s.power;petBuff[s.stat+'T']=12.2;petBuffSrc[s.stat]='Poring'};bars()`),id);
  const pet=page.locator(`#pet-buff-${id}`),art=pet.locator('img');await art.evaluate(img=>img.decode());
  assert.equal(await art.getAttribute('src'),`assets/expanded-skill-icons/pet_${id}.webp`);assert.equal(await pet.locator('.s').textContent(),'13');
 }
 await page.evaluate(()=>eval('petBuff={};bars()'));
 assert.deepEqual(errors,[]);console.log(label+': 50 complete card symbols; field title/logo lifecycle; four active pet icons');
}
async function checkPlaza(page,testLabel,touch){
 // Keep the real WebGL plaza on a desktop viewport without overloading headless SwiftShader.
 // The full-size field was already checked above, before this resize. Leave the phone as-is.
 if(!touch)await page.setViewportSize({width:960,height:640});
 const errors=recordErrors(page);
 await page.evaluate(()=>eval("ACT.titleequip('mythic-edge')"));
 assert.equal(await page.evaluate(()=>CLOUD.on),false,'only an offline synthetic player is allowed');
 assert.equal(await page.evaluate(()=>PGSocial.enter()),true);
 const label=page.locator('.social-player-label[data-player="0"]'),title=label.locator('.social-player-title'),img=title.locator('img');
 await img.waitFor();await img.evaluate(el=>el.decode());
 assert.equal(await title.textContent(),'Mythic Edge');assert.equal(await img.getAttribute('src'),'assets/title-symbols/49.webp');
 const geometry=await page.evaluate(()=>{const scene=PGSocial.app.scene,sprite=scene.scene.children.find(s=>s.userData.socialId===0),feet=sprite.position.clone().project(scene.camera),host=document.querySelector('#socialScene').getBoundingClientRect(),r=document.querySelector('.social-player-label[data-player="0"]').getBoundingClientRect();return {top:r.top,foot:host.top+(1-feet.y)*host.height*.5}});
 assert(geometry.top>geometry.foot,'plaza label follows below the feet: '+JSON.stringify(geometry));
 await page.waitForTimeout(2200); // Let the existing look-change watcher establish its prior value.
 await page.evaluate(()=>eval("ACT.titleequip('field-initiate')"));
 await page.waitForFunction(()=>document.querySelector('.social-player-label[data-player="0"] .social-player-title')?.textContent==='Field Initiate',null,{timeout:45000,polling:250});
 assert.equal(await img.getAttribute('src'),'assets/title-symbols/47.webp');
 await page.evaluate(()=>eval("ACT.titleequip('none')"));
 await page.waitForFunction(()=>document.querySelector('.social-player-label[data-player="0"] .social-player-title')?.hidden,null,{timeout:45000,polling:250});
 assert.equal(await title.locator('img').count(),0);assert.deepEqual(errors,[]);console.log(testLabel+' offline plaza: below-feet logo, look switch and unequip');
}
(async()=>{
 const browser=await launch();
 try{for(const [label,viewport,touch] of [['desktop',{width:1440,height:1000},false],['phone',{width:390,height:844},true]]){
  const context=await browser.newContext({viewport,hasTouch:touch,isMobile:touch});
  try{const preview=await context.newPage();await checkPreview(preview,label+' preview');
   const game=await context.newPage();await checkGame(game,label+' source',`/game?nativeFields=0${touch?'&phone=1':''}`);
   if(process.argv.includes('--plaza'))await checkPlaza(game,label,touch);
   if(process.argv.includes('--dist')){const packaged=await context.newPage();await checkGame(packaged,label+' packaged',`/dist/index.html?nativeFields=0${touch?'&phone=1':''}`)}
  }finally{await context.close()}
 }}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
