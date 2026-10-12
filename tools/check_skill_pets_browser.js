(async()=>{
 const assert=(ok,message)=>{if(!ok)throw Error(message)},wait=()=>new Promise(r=>setTimeout(r,20));
 assert(window.__wardrobeRendererStub,'Requires explicitly marked renderer stub');
 const advance=simAdvance;simAdvance=()=>{};
 try{
 currentUser='skill-pets-local';S=fresh();S.auto=false;S.q=['kill','loot','boss'].map(newQuest);$('loginOverlay').style.display='none';
 tabs.splice(0,tabs.length,'skills');let skillCount=0;
 for(const cls of Object.keys(CLASSES)){
  S.cls=cls;ui();const images=[...document.querySelectorAll('#wins .skill-art')];assert(images.length,'no skill images for '+cls);
  for(const img of images){img.loading='eager';await Promise.race([img.decode(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Skill image timeout '+img.dataset.skill)),10000))]);assert(img.naturalWidth>=62,'skill image missing');const id=img.dataset.skill,art=PGSkillIcons[id];assert(art&&img.dataset.family===art.family,'incorrect mapped family');skillCount++;if(id!=='aid'&&SKILLS.find(s=>s.id===id).cls.includes(cls)&&['Assassin','Assassin Cross'].includes(cls))assert(art.family==='shadow','Assassin art should be purple shadow')}
  for(const img of images){const b=img.getBoundingClientRect();assert(b.left>=0&&b.right<=innerWidth+1,'skill icon outside viewport')}
 }
 await petSpriteStore.init();let views=0,changed=0,peak=0;const cv=document.createElement('canvas');cv.width=cv.height=256;const ctx=cv.getContext('2d');
 for(const [key,r]of Object.entries(petSpriteStore.catalog.assets)){
  petSpriteStore.pin([key]);const asset=await petSpriteStore.request(key);
  for(const [name,view]of Object.entries(asset.metadata.actions)){
   const stance=name.slice(0,-1),d=+name.slice(-1);PGPetSprites.draw(ctx,asset,stance,d,0);const before=cv.toDataURL();
   if(view.frames.length>1){PGPetSprites.draw(ctx,asset,stance,d,view.delay);if(before!==cv.toDataURL())changed++}
   const pixels=ctx.getImageData(0,0,256,256).data;assert(pixels.some((x,i)=>i%4===3&&x>0),'blank native pet '+key+'/'+name);views++;
  }
  peak=Math.max(peak,petSpriteStore.pixelBytes);assert(peak<=petSpriteStore.budget,'pet cache over budget');
 }
 assert(views===480,'all 20x3x8 native states');assert(changed>200,'movement frames must change');
 S.cls='Assassin Cross';S.pets=PETS.map((_,sp)=>({id:100+sp,sp,mut:0,eq:[0,0,0],skills:['vital'],on:[0,15,19].includes(sp)}));
 tabs.splice(0,tabs.length,'pet');ACT.selp('119');
 for(const stance of ['idle','walk','attack']){
  document.querySelector('[data-a="petmotion"][data-v="'+stance+'"]').click();const key=petAssetKey(1115,stance,0);await petSpriteStore.request(key);drawPetPreviews();
  const preview=document.querySelector('[data-pet-preview]');assert(preview,'preview missing');const rect=preview.getBoundingClientRect();assert(getComputedStyle(preview).width==='128px'&&getComputedStyle(preview).height==='128px'&&rect.width<=129&&rect.height<=129,'pet preview must remain 128px within global canvas styles');assert(preview.getAttribute('aria-label').includes(stance),'wrong preview label');assert(document.querySelector('[data-pet-preview-status]').textContent==='Native '+stance+' animation','preview not ready');
  for(const button of preview.parentNode.querySelectorAll('button')){const b=button.getBoundingClientRect();assert(b.left>=0&&b.right<=innerWidth+1,'pet control outside viewport')}
 }
 assert(document.querySelector('#wins').textContent.includes('War Cry + Flame Burst'),'Eddga recommendation missing');
 save();const loaded=load();assert(loaded.pets.length===20&&loaded.pets[19].sp===19,'all20 pet IDs saved');
 assert(PETS.slice(0,8).map(p=>p.spriteId).join()==='1002,1063,1013,1106,1019,1155,1101,1096','old saved identities changed');
 // Real world sprites use owned canvas textures; camera turns repaint shared-atlas directions.
 const id=1002,r={x:0,z:0,run:true},v=buildMob({pet:true,spriteId:id,shape:'blob',c:PETS[0].c});
 await petSpriteStore.request('1002-walk');drawNativePet(v,id,r,0);const old=v.nativePet.last;drawNativePet(v,id,r,1);assert(v.nativePet.last!==old,'direction did not repaint');syncMobImage(v,{run:true,lunge:1},PET_VISUAL_SCALE);assert(v.spr.position.y===0&&v.spr.center.y===.25,'native feet or pixels transformed');disposeCreatureVisual(v);
 ui();ACT.selp('119');return {status:'pass',build:BUILD,viewport:[innerWidth,innerHeight],skillImagesChecked:skillCount,petStatesChecked:views,animationsWithChangingFrames:changed,peakDecodedBytes:peak,petPreviewButtons:3,savedSpecies:loaded.pets.length,renderer:'marked WebGL stub; actual canvas/image decoding'};
 }finally{simAdvance=advance}
})()
