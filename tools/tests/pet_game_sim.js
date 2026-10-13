// Native pet integration: actual packed metadata, Three sprite ownership and UI actions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createGame}=require('./helpers/game');const g=createGame(),ev=g.ev,root=path.resolve(__dirname,'../../assets/pets/v1');
g.window.__petCatalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json')));g.window.__petAssets={};
for(const [key,r]of Object.entries(g.window.__petCatalog.assets))g.window.__petAssets[key]={metadata:JSON.parse(fs.readFileSync(path.join(root,r.meta))),image:{},figureHeight:r.figureHeight,bytes:r.width*r.height*4};
try{
 ev(`petSpriteStore.catalog=__petCatalog;petSpriteStore.ready=id=>__petAssets[id]||null;petSpriteStore.request=id=>Promise.resolve(__petAssets[id]);requestMobTexture=()=>null;S.auto=false;window.petNow=1000;skinNow=()=>window.petNow;`);
 for(let sp=0;sp<20;sp++){
  ev(`window.__id=PETS[${sp}].spriteId;window.__v=buildMob({pet:true,spriteId:__id,shape:petFallbackShape(PETS[${sp}]),c:PETS[${sp}].c});t=1;window.__r={run:false};`);
  for(const stance of ['idle','walk','attack'])for(let d=0;d<8;d++){
   ev(`__r.run=${stance==='walk'};__r.attackStarted=${stance==='attack'?'skinNow()':'null'};drawNativePet(__v,__id,__r,${d})`);
   assert.equal(ev('__v.nativePet.last'),ev(`petAssetKey(__id,${JSON.stringify(stance)},${d})+':'+${d}+':'+PGPetSprites.frameIndex(__petAssets[petAssetKey(__id,${JSON.stringify(stance)},${d})].metadata.actions[${JSON.stringify(stance+d)}],petFrameTime(__petAssets[petAssetKey(__id,${JSON.stringify(stance)},${d})].metadata.actions[${JSON.stringify(stance+d)}],1000*PET_ANIMATION_RATE),${stance==='attack'?'0':'null'})`));
   ev('syncMobImage(__v,{run:true,lunge:1},PET_VISUAL_SCALE)');assert.equal(ev('__v.spr.position.y'),0);assert.equal(ev('__v.spr.center.y'),ev('1-PET_LAYOUT[__id][0]/256'));assert.equal(ev('__v.spr.material.rotation'),0);
  }
  ev('window.__paint=__v.nativePet.last;window.__ready=petSpriteStore.ready;petSpriteStore.ready=()=>null;drawNativePet(__v,__id,__r,0);petSpriteStore.ready=__ready');assert.equal(ev('__v.nativePet.last'),ev('__paint'),'keep previous frame while loading');
  // Every opaque pose stays above ground and below the hero's drawn height.
  for(const [key,asset] of Object.entries(g.window.__petAssets).filter(([key])=>key.startsWith(ev('String(__id)')+'-'))){
   const layout=ev('PET_LAYOUT[__id]'),px=ev('2.65*PET_VISUAL_SCALE')/layout[1];
   for(const pose of asset.metadata.poses){assert.ok((layout[0]-pose[5]-pose[3])*px>=-1e-9,key+' below ground');assert.ok(pose[3]*px<ev('SKIN_H'),key+' taller than hero');}
  }
  ev('disposeCreatureVisual(__v)');assert.equal(ev('__v.nativePet.cv.width'),0);
 }
 ev(`S.pets=Array.from({length:20},(_,sp)=>({id:sp+100,sp,mut:0,eq:[0,0,0],skills:['vital'],on:sp<3}));tabs.splice(0,tabs.length,'pet');ACT.selp('119');`);
 assert.match(g.window.document.querySelector('[data-pet-preview]').getAttribute('aria-label'),/Eddga idle/);
 for(const stance of ['idle','walk','attack']){ev(`ACT.petmotion(${JSON.stringify(stance)});drawPetPreviews()`);assert.equal(ev('petPreviewStance'),stance);assert.match(g.window.document.querySelector('[data-pet-preview-status]').textContent,new RegExp('Native '+stance));}
 assert.match(g.window.document.querySelector('#wins').textContent,/War Cry \+ Flame Burst/);
 // The real update loop caps travel independently of attack cadence, at all frame sizes.
 ev(`S.pets=[{id:100,sp:0,mut:0,eq:[0,0,0],skills:[],on:true}];mobs=[];mob=null;pl.x=0;pl.z=0;S.auto=false`);
 for(const dt of [1/60,.1,.25]){
  ev(`mobs=[];mob=null;camps=[];respawn=100;pl.x=0;pl.z=0;petR[100]={x:-8,z:0,at:1};window.beforeInterval=petInt(S.pets[0]);update(${dt})`);
  assert.ok(Math.abs(ev('Math.hypot(petR[100].x+8,petR[100].z)')-ev('petMoveSpeed(8.8)')*dt)<1e-8,'pet travel follows hero speed');
  assert.equal(ev('petInt(S.pets[0])'),ev('beforeInterval'),'movement tuning leaves attack rate intact');
 }
 for(const rate of [1,2,4]){
  ev(`speed=${rate};t=100*speed;petNow=10000;window.state=petAnimationState(1002,{run:true},0)`);
  assert.equal(ev('state.ms'),2000,'walk playback uses 20% real time at every simulation speed');
  ev('window.state=petAnimationState(1002,{attackStarted:9900},0)');
  assert.equal(ev('state.ms'),20,'attack playback uses real time');
 }
 ev('S.st.agi=99');assert.ok(ev('petMoveSpeed(2)>5'),'pet speed follows increased hero AGI');
 assert.equal(ev('PGPetSprites.frameIndex({delay:1,frames:[0,1,2,3]},petFrameTime({delay:1},119*PET_ANIMATION_RATE))'),0,'tiny native delay holds frame for 120ms');
 assert.equal(ev('PGPetSprites.frameIndex({delay:1,frames:[0,1,2,3]},petFrameTime({delay:1},120*PET_ANIMATION_RATE))'),1);
 console.log('PASS: all 20 pets x 3 states x 8 directions, directional repaint, foot pivot, native transform bypass, pending-frame retention/disposal and actual preview actions/recommendations');
}finally{g.close()}
