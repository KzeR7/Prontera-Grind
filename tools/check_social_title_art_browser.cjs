// Real Chromium against the local, disposable changes-only preview and synthetic offline saves.
// PREVIEW_PAGE=tools/mastery_update_preview.html python3 tools/preview_server.py 8000
// node tools/check_social_title_art_browser.cjs
// Never connects to a hosted room or a real player account.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sharp=require('sharp');
const {chromium}=require('playwright-core');
if(process.env.SOCIAL_ART_SCREENSHOTS)fs.mkdirSync('.cache/social-title-review',{recursive:true});
const root=new URL(process.env.MASTERY_PREVIEW_URL||'http://127.0.0.1:8000');
if(!['127.0.0.1','localhost','[::1]'].includes(root.hostname))throw Error('Only a disposable loopback preview is allowed');
const url=p=>new URL(p,root).href;
const profile=process.env.SOCIAL_ART_PROFILE||'',target=process.env.SOCIAL_ART_TARGET||'';
if(profile&&!['desktop','phone'].includes(profile))throw Error('SOCIAL_ART_PROFILE must be desktop or phone');
if(target&&!['source','packaged'].includes(target))throw Error('SOCIAL_ART_TARGET must be source or packaged');
const press=(locator,touch)=>touch?locator.tap():locator.click();
async function launch(){
 const mod=require('@sparticuz/chromium'),lib=await mod.inflate(path.resolve(path.dirname(require.resolve('@sparticuz/chromium')),'../bin/al2023.tar.br'));
 return chromium.launch({executablePath:await mod.default.executablePath(),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],env:{...process.env,LD_LIBRARY_PATH:path.join(lib,'lib')+':'+(process.env.LD_LIBRARY_PATH||'')}});
}
function errorsOn(page){
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{const u=new URL(r.url());if(r.status()>=400&&u.origin===root.origin&&u.pathname.includes('/assets/'))errors.push(r.status()+' '+r.pathname)});
 return errors;
}
async function containedImages(locator,expected){
 const boxes=await locator.evaluateAll(async images=>{
  for(const img of images)img.loading='eager';
  await Promise.all(images.map(img=>img.decode()));
  return images.map(img=>{
   const i=img.getBoundingClientRect(),p=img.parentElement.getBoundingClientRect(),canvas=document.createElement('canvas');
   canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
   const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   const alpha=(x,y)=>pixels[(y*canvas.width+x)*4+3],corners=[[0,0],[canvas.width-1,0],[0,canvas.height-1],[canvas.width-1,canvas.height-1]].map(([x,y])=>alpha(x,y));
   let opaque=false;for(let n=3;n<pixels.length;n+=4)if(pixels[n]===255){opaque=true;break}
   return {src:img.getAttribute('src'),natural:[img.naturalWidth,img.naturalHeight],fit:getComputedStyle(img).objectFit,inside:i.left>=p.left-.5&&i.top>=p.top-.5&&i.right<=p.right+.5&&i.bottom<=p.bottom+.5,corners,opaque};
  });
 });
 assert.equal(boxes.length,expected);assert.equal(new Set(boxes.map(x=>x.src)).size,expected);
 for(const box of boxes)assert(box.inside&&box.fit==='contain'&&box.natural[0]>0&&box.natural[1]>0&&box.corners.every(a=>a===0)&&box.opaque,JSON.stringify(box));
}
async function unbacked(locator){
 const style=await locator.evaluate(el=>{const css=getComputedStyle(el);return {background:css.backgroundColor,border:css.borderTopStyle,shadow:css.boxShadow}});
 assert.deepEqual(style,{background:'rgba(0, 0, 0, 0)',border:'none',shadow:'none'},'no solid tile behind a title or logo');
}
// Computed transparent CSS is not enough: the original mastery image itself has
// a dark matte. Compare real rendered pixels against the same pale surface with
// the image hidden. A transformed parent reproduces the plaza stacking context.
async function masteryMatteRemoved(page){
 await page.evaluate(()=>{
  const box=document.createElement('div');box.id='mastery-matte-check';
  box.style.cssText='position:fixed;left:4px;top:4px;z-index:2147483647;width:230px;height:320px;display:grid;grid-template-columns:repeat(5,46px);grid-template-rows:repeat(10,32px);background:rgb(230,220,200);pointer-events:none';
  box.innerHTML=Array.from({length:50},(_,i)=>'<div class="social-player-label" style="position:relative;transform:translateZ(0)"><small class="social-player-title"><img class="title-symbol" src="assets/title-symbols/'+String(i+1).padStart(2,'0')+'.webp" alt=""></small></div>').join('');
  document.body.append(box);
 });
 try{
  const box=page.locator('#mastery-matte-check'),images=box.locator('img');
  const positions=await images.evaluateAll(async els=>{await Promise.all(els.map(el=>el.decode()));return els.map(el=>{const a=el.getBoundingClientRect(),b=el.closest('#mastery-matte-check').getBoundingClientRect();return {src:el.getAttribute('src'),x:Math.round(a.left-b.left),y:Math.round(a.top-b.top),width:Math.round(a.width),height:Math.round(a.height)}})});
  assert.equal(positions.length,50);
  const visible=await box.screenshot({scale:'css',animations:'disabled'});await images.evaluateAll(els=>els.forEach(el=>{el.style.visibility='hidden'}));
  const hidden=await box.screenshot({scale:'css',animations:'disabled'});
  const a=await sharp(visible).removeAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(hidden).removeAlpha().raw().toBuffer({resolveWithObject:true});
  assert.deepEqual(a.info,b.info);const diff=(x,y)=>{const i=(y*a.info.width+x)*3;return [0,1,2].reduce((n,c)=>n+Math.abs(a.data[i+c]-b.data[i+c]),0)};
  for(const pos of positions){
   const corners=[[4,2],[pos.width-5,2],[4,pos.height-3],[pos.width-5,pos.height-3]].map(([x,y])=>diff(pos.x+x,pos.y+y));
   // A few supplied symbols extend to a corner; a rectangular matte darkens all four.
   assert(corners.filter(n=>n<45).length>=2&&corners.reduce((x,y)=>x+y,0)<300,pos.src+' should not render a dark rectangular matte: '+corners);
   let total=0;for(let y=0;y<pos.height;y++)for(let x=0;x<pos.width;x++)total+=diff(pos.x+x,pos.y+y);
   assert(total>5000,pos.src+' must remain visible');
  }
 }finally{await page.locator('#mastery-matte-check').evaluate(el=>el.remove())}
}
async function preview(page,label,touch){
 const errors=errorsOn(page);await page.goto(url('/'),{waitUntil:'domcontentloaded'});
 assert.equal(await page.locator('#tab-plaza').getAttribute('aria-selected'),'true');
 assert.equal(await page.locator('#digiChoices button').count(),36);assert.equal(await page.locator('#fishingChoices button').count(),20);
 const storage=await page.evaluate(()=>JSON.stringify(localStorage));
 await containedImages(page.locator('#digiChoices img'),36);await containedImages(page.locator('#fishingChoices img'),20);
 for(const sel of ['#demoPlazaTitle','#demoPlazaDigi','#demoPlazaFish','#digiChoices .plaza-pick-art','#fishingChoices .plaza-pick-art'])await unbacked(page.locator(sel).first());
 await masteryMatteRemoved(page);
 assert.equal(await page.locator('#demoPlazaDigi').textContent(),'First Partner');assert.equal(await page.locator('#demoPlazaFish').textContent(),'Dockhand');
 if(process.env.SOCIAL_ART_SCREENSHOTS)await page.locator('#plazaSample').screenshot({path:`.cache/social-title-review/${label.replace(/ /g,'-')}-plaza-sample.png`});
 await press(page.locator('#digiChoices [data-plaza-id="first-victory"]'),touch);assert.equal(await page.locator('#demoPlazaDigi').textContent(),'First Victory');
 await press(page.locator('#fishingChoices [data-plaza-id="bait-layer"]'),touch);assert.equal(await page.locator('#demoPlazaFish').textContent(),'Bait Layer');
 await press(page.locator('#fishingChoices [data-plaza-id="bait-layer"]'),touch);assert.equal(await page.locator('#demoPlazaFish').isVisible(),false);
 assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),storage,'preview never writes a game save');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),await page.evaluate(()=>innerWidth),'preview has no horizontal overflow');
 assert.deepEqual(errors,[]);console.log(label+': changes-only preview, all 56 contained icons and no save writes');
}
async function activate(page,loaded){
 await page.waitForFunction(()=>{try{return !document.hidden&&eval('typeof fresh')==='function'&&!!window.PGSocialTitleArt&&!!window.PGSocial}catch{return false}},{timeout:60000});
 await page.evaluate(loaded=>eval(`simAdvance=()=>{};currentUser='social-title-browser-check';S=${loaded?'load()':'fresh()'};S.auto=false;
  ${loaded?'':`S.digimonPartner='agumon';S.digimonBag=PGDigimonSanctuary.normalizeBag({v:3,owned:['agumon']});
    S.digimonSanctuary=PGDigimonSanctuary.normalize({partners:{agumon:{wins:1}}},'agumon');
    S.fishing=PGSocialFishing.normalize({stats:{catches:150},settings:{sound:false}});
    S.indexXp=1000000;S.eq.weapon.r=15;PGTitles.sync(S,CLASSES);S.equippedTitle='mythic-edge';save();`}
  document.getElementById('loginOverlay').style.display='none';document.getElementById('wrap').style.display='block';
  tabs.length=0;renderWin();bars();`),loaded);
 assert.equal(await page.evaluate(()=>CLOUD.on),false,'no hosted account');
 assert.equal(await page.evaluate(()=>PGSocial.enter()),true);
 await page.waitForFunction(()=>{const el=document.querySelector('.social-player-label[data-player="0"]');return el&&!el.hidden&&el.style.top},null,{timeout:60000});
 const geometry=await page.evaluate(()=>{const scene=PGSocial.app.scene,sprite=scene.scene.children.find(s=>s.userData.socialId===0),feet=sprite.position.clone().project(scene.camera),host=document.querySelector('#socialScene').getBoundingClientRect(),label=document.querySelector('.social-player-label[data-player="0"]').getBoundingClientRect();return {top:label.top,foot:host.top+(1-feet.y)*host.height*.5}});
 assert(geometry.top>geometry.foot,'the actual plaza label sits below the character feet');
 // After checking a real rendered frame, pause continuous WebGL drawing in this synthetic
 // fixture. The real UI handlers and scene.putPlayer still update the label; this avoids
 // software-WebGL starvation while exercising many controls and reloads.
 await page.evaluate(()=>{PGSocial.app.scene.active=false});
}
async function titleLine(page,kind,name,id){
 const sel=kind==='digi'?'.social-player-digi-title':'.social-player-fish-title';
 const line=page.locator('.social-player-label[data-player="0"] '+sel);
 await page.waitForFunction(([sel,name])=>document.querySelector('.social-player-label[data-player="0"] '+sel)?.textContent===name,[sel,name],{timeout:45000,polling:250});
 assert.equal(await line.locator('img').getAttribute('src'),`assets/social-title-icons/${kind}-${id}.webp?v=440`);
 await line.locator('img').evaluate(img=>img.decode());await unbacked(line);await unbacked(line.locator('img'));
}
async function game(page,label,route,touch){
 const errors=errorsOn(page),user='social-title-browser-check';
 await page.goto(url(route),{waitUntil:'domcontentloaded',timeout:60000});await activate(page,false);
 await masteryMatteRemoved(page);
 const nameBackground=await page.locator('.social-player-label[data-player="0"] > button').evaluate(el=>getComputedStyle(el).backgroundColor);
 assert.equal(nameBackground,'rgba(23, 37, 45, 0.6)','the separate player-name styling is unchanged');
 const small=await page.evaluate(()=>innerWidth<=700||document.documentElement.classList.contains('pg-mobile'));
 assert.equal(await page.locator('#socialChat').isVisible(),true,'chat starts visible');
 // Open the actual Sanctuary Titles view; normal unlocks still govern the Wear buttons.
 await press(page.locator('#sanctuaryOpen'),touch);await press(page.locator('#sanctuaryPanel [data-sanctuary-view="titles"]').first(),touch);
 if(small){
  const bounds=await page.evaluate(()=>{
   const panel=document.querySelector('#sanctuaryPanel'),outer=panel.getBoundingClientRect();
   const items=['.sanctuary-head','.sanctuary-head-actions .sanctuary-wallet','#sanctuaryClose','#sanctuaryTitlesView'].map(sel=>{const r=panel.querySelector(sel).getBoundingClientRect();return {sel,left:r.left,right:r.right}});
   return {left:outer.left,right:outer.right,scrollLeft:panel.scrollLeft,scrollWidth:panel.scrollWidth,clientWidth:panel.clientWidth,items};
  });
  assert.equal(bounds.scrollLeft,0,'the phone panel itself must not be scrolled sideways');
  assert(bounds.scrollWidth<=bounds.clientWidth+1&&bounds.items.every(r=>r.left>=bounds.left-.5&&r.right<=bounds.right+.5),'phone header and collection fit the panel: '+JSON.stringify(bounds));
 }
 assert.equal(await page.locator('#sanctuaryTitlesView .digi-title').count(),36);
 await containedImages(page.locator('#sanctuaryTitlesView .digi-title .social-title-symbol'),36);
 await unbacked(page.locator('#sanctuaryTitlesView .digi-title-medal.has-art').first());
 assert.equal(await page.locator('#sanctuaryTitlesView [data-digi-title-row="mega-bond"] .digi-title-lock').count(),1);
 if(process.env.SOCIAL_ART_SCREENSHOTS)await page.screenshot({path:`.cache/social-title-review/${label.replace(/ /g,'-')}-digi.png`});
 await press(page.locator('#sanctuaryTitlesView [data-digi-title="first-partner"]'),touch);await titleLine(page,'digi','First Partner','first-partner');
 await press(page.locator('#sanctuaryTitlesView [data-digi-title="first-victory"]'),touch);await titleLine(page,'digi','First Victory','first-victory');
 // Open the real fishing panel, choose two earned titles, and keep them independent of DigiPet.
 await page.evaluate(()=>PGSocialFishing.openTitles());
 await page.waitForFunction(()=>document.body.classList.contains('social-fishing-panel-open'));
 assert.equal(await page.locator('#socialChat').isVisible(),!small,'chat gives the Fishing window room on a small screen');
 assert.equal(await page.locator('#fishingTitlesView .fishing-title-row').count(),20);
 await containedImages(page.locator('#fishingTitlesView .fishing-title-sigil .social-title-symbol'),20);
 await unbacked(page.locator('#fishingTitlesView .fishing-title-sigil').first());
 assert.equal(await page.locator('#fishingTitlesView .fishing-title-row.locked').count()>0,true);
 if(process.env.SOCIAL_ART_SCREENSHOTS)await page.screenshot({path:`.cache/social-title-review/${label.replace(/ /g,'-')}-fishing.png`});
 await press(page.locator('#fishingTitlesView [data-title="dockhand"]'),touch);await titleLine(page,'fishing','Dockhand','dockhand');
 await press(page.locator('#fishingTitlesView [data-title="bait-layer"]'),touch);await titleLine(page,'fishing','Bait Layer','bait-layer');
 await titleLine(page,'digi','First Victory','first-victory');
 assert.equal(await page.locator('.social-player-label[data-player="0"] .social-player-title').textContent(),'Mythic Edge');
 await unbacked(page.locator('.social-player-label[data-player="0"] .social-player-title'));
 await press(page.locator('#fishingPanelClose'),touch);
 await page.waitForFunction(()=>!document.body.classList.contains('social-fishing-panel-open'));
 assert.equal(await page.locator('#socialChat').isVisible(),true,'chat returns after the Fishing window closes');
 if(process.env.SOCIAL_ART_SCREENSHOTS)await page.screenshot({path:`.cache/social-title-review/${label.replace(/ /g,'-')}-plaza.png`});
 // Unknown names never become a local asset URL or executable markup, even when received from a peer.
 await page.evaluate(()=>{const app=PGSocial.app,self=app.players.get(0);app.scene.putPlayer({...self,id:818,name:'Synthetic peer',look:{...self.look,fishTitle:'🎣 <img src=x onerror=alert(1)>',digiTitle:'🐾 Future Pet Title'}})});
 const remote=page.locator('.social-player-label[data-player="818"]');
 assert.equal(await remote.locator('.social-player-fish-title').textContent(),'🎣 <img src=x onerror=alert(1)>');
 assert.equal(await remote.locator('.social-player-digi-title').textContent(),'🐾 Future Pet Title');
 assert.equal(await remote.locator('.social-player-fish-title img,.social-player-digi-title img').count(),0);
 // A true document reload of a disposable localStorage save, not merely an in-memory rerender.
 await page.reload({waitUntil:'domcontentloaded',timeout:60000});await activate(page,true);
 assert.deepEqual(await page.evaluate(()=>eval('[S.digimonTitle,S.fishing.title]')),['first-victory','bait-layer']);
 await titleLine(page,'digi','First Victory','first-victory');await titleLine(page,'fishing','Bait Layer','bait-layer');
 await page.evaluate(()=>PGSocialFishing.openTitles());await press(page.locator('#fishingTitlesView [data-title="none"]'),touch);
 await page.waitForFunction(()=>document.querySelector('.social-player-label[data-player="0"] .social-player-fish-title')?.hidden,null,{timeout:45000});
 await press(page.locator('#sanctuaryOpen'),touch);await press(page.locator('#sanctuaryPanel [data-sanctuary-view="titles"]').first(),touch);
 await page.waitForFunction(()=>!document.body.classList.contains('social-fishing-panel-open'));
 assert.equal(await page.locator('#socialChat').isVisible(),true,'switching to another hub panel restores chat');
 await press(page.locator('#sanctuaryTitlesView [data-digi-title="none"]'),touch);
 await page.waitForFunction(()=>document.querySelector('.social-player-label[data-player="0"] .social-player-digi-title')?.hidden,null,{timeout:45000});
 assert.deepEqual(await page.evaluate(()=>eval('save();S=load();[S.digimonTitle,S.fishing.title]')),[null,null]);
 assert.equal(await page.evaluate(()=>eval('currentUser')),user);assert.deepEqual(errors,[]);
 console.log(label+': real title lists, equip/switch/remove, unknown peer text and synthetic save reload');
}
(async()=>{const browser=await launch();try{
 for(const [label,viewport,touch] of [['desktop',{width:960,height:640},false],['phone',{width:390,height:844},true]]){
  if(profile&&profile!==label)continue;
  const context=await browser.newContext({viewport,hasTouch:touch,isMobile:touch});
  try{
   // Retain one blank anchor while closing tested pages so WebGL from earlier runs does not
   // starve timers in a later page, even in constrained headless software rendering.
   await context.newPage();
   const sample=await context.newPage();await preview(sample,label+' preview',touch);await sample.close();
   for(const [where,route] of [['source','/game?nativeFields=0'],['packaged','/dist/index.html?nativeFields=0']]){
    if(target&&target!==where)continue;
    const page=await context.newPage();await page.bringToFront();
    try{await game(page,label+' '+where,route+(touch?'&phone=1':''),touch)}finally{await page.close()}
   }
  }finally{await context.close()}
 }
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
