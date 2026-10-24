// Real renderer helpers: tier identity, GPU cleanup and silhouette-only weapon edging.
const assert=require('node:assert/strict'),{createGame}=require('./helpers/game');
const game=createGame();let passed=0;
const test=(name,fn)=>{fn();passed++;console.log('ok '+name)};
try{
 test('three milestones build different, finite, bounded sigils',()=>{
  const signatures=[];
  for(const lv of [50,99,150]){
   game.ev(`S.lv=${lv};syncLevelAura()`);
   assert.equal(game.ev('levelAura.userData.tier'),lv);
   assert.equal(game.ev('levelAura.children.length'),2);
   assert.equal(game.ev('levelAura.children.every(x=>Array.from(x.geometry.attributes.position.array).every(Number.isFinite))'),true);
   assert.equal(game.ev('levelAura.children.every(x=>Array.from(x.geometry.attributes.position.array).every(n=>Math.abs(n)<1.1))'),true);
   signatures.push(game.ev('JSON.stringify(levelAura.children.map(x=>Array.from(x.geometry.attributes.position.array)))'));
  }
  assert.equal(new Set(signatures).size,3);
 });
 test('changing tiers disposes every private geometry, material and shared texture once',()=>{
  game.ev(`window.disposed=0;window.expectedDisposals=0;window.previousAura=levelAura;const seen=new Set();levelAura.traverse(o=>{for(const resource of [o.isMesh||o.isPoints?o.geometry:null,o.material,o.material?.map])if(resource&&!seen.has(resource)){seen.add(resource);window.expectedDisposals++;resource.addEventListener('dispose',()=>window.disposed++);}});S.lv=50;syncLevelAura()`);
  assert.ok(game.ev('window.expectedDisposals')>4);assert.equal(game.ev('window.disposed'),game.ev('window.expectedDisposals'));assert.equal(game.ev('scene.children.includes(window.previousAura)'),false);
 });
 test('aura includes luminous textures, a light veil and rising fading motes',()=>{
  assert.equal(game.ev('levelAura.children.every(x=>!!x.children[0].material.map)'),true);
  assert.equal(game.ev('levelAura.userData.veil.isSprite'),true);
  game.ev('t=1;syncLevelAura();window.moteY=levelAura.userData.motes.geometry.attributes.position.getY(0);t=2;syncLevelAura()');
  assert.ok(game.ev('levelAura.userData.motes.geometry.attributes.position.getY(0)')>game.ev('window.moteY'));
  assert.equal(game.ev('Array.from(levelAura.userData.motes.geometry.attributes.color.array).every(n=>n>=0&&n<=1)'),true);
 });
 test('steady level reuses GPU objects and animates layers in opposite directions',()=>{
  game.ev('window.previousAura=levelAura;t=2;syncLevelAura()');
  assert.equal(game.ev('window.previousAura===levelAura'),true);
  assert.equal(game.ev('levelAura.children[0].rotation.y>0&&levelAura.children[1].rotation.y<0'),true);
  game.ev('S.lv=49;syncLevelAura()');assert.equal(game.ev('levelAura.visible'),false);
 });
 test('rotation continues with frozen simulation time and wraps smoothly forever',()=>{
  game.ev('window.originalSkinNow=skinNow;window.auraMs=1000;skinNow=()=>window.auraMs;S.lv=150;t=0;syncLevelAura();window.rotationBefore=levelAura.children.map(x=>x.rotation.y);window.auraMs=2000;syncLevelAura()');
  assert.ok(game.ev('levelAura.children[0].rotation.y>window.rotationBefore[0]&&levelAura.children[1].rotation.y<window.rotationBefore[1]'));
  assert.equal(game.ev('t'),0);
  for(const [index,rate] of [[0,.22],[1,-.3]]){
   const turnMs=2*Math.PI/Math.abs(rate)*1000;
   game.ev(`window.auraMs=${turnMs-1};syncLevelAura();window.beforeTurn=levelAura.children[${index}].rotation.y;window.auraMs=${turnMs+1};syncLevelAura()`);
   const delta=game.ev(`levelAura.children[${index}].rotation.y-window.beforeTurn`);
   assert.ok(Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta))-rate*.002)<1e-8);
  }
  game.ev('window.auraMs=1e12;syncLevelAura()');
  assert.equal(game.ev('levelAura.children.every(x=>Number.isFinite(x.rotation.y)&&Math.abs(x.rotation.y)<Math.PI*2)'),true);
  game.ev('skinNow=window.originalSkinNow');
 });
 test('level aura stands on the real surface, including raised Astral paving',()=>{
  game.ev('S.lv=150;S.mp=0;KIT.nativeWorld=null;syncLevelAura()');
  assert.equal(game.ev('levelAura.position.y'),game.ev('actorFloorY()+.01'),'normal fields keep the old clearance');
  game.ev('S.mp=10;syncLevelAura()');
  assert.equal(game.ev('actorFloorY()'),.12,'Astral keeps its raised deck height');
  assert.ok(Math.abs(game.ev('levelAura.position.y')-.13)<1e-9,'the sigil clears the highest Astral slab (.091)');
  game.ev('S.mp=0;S.lv=150;syncLevelAura()');
 });
 test('weapon mask cache is per image and per tier color',()=>{
  game.ev(`window.testWeapon={naturalWidth:20,naturalHeight:60};window.mask=weaponGlowMask(window.testWeapon,'#ffe19a')`);
  assert.equal(game.ev("window.mask===weaponGlowMask(window.testWeapon,'#ffe19a')"),true);
  assert.equal(game.ev("window.mask===weaponGlowMask(window.testWeapon,'#8cddff')"),false);
  assert.equal(game.ev('window.mask.width'),20);assert.equal(game.ev('window.mask.height'),60);
 });
 test('glow uses four tight silhouette offsets and restores opacity without blur',()=>{
  const result=JSON.parse(game.ev(`JSON.stringify((()=>{const calls=[],ctx={globalAlpha:.8,shadowBlur:0,drawImage:(im,...args)=>calls.push(args)};drawWeaponEdge(ctx,window.testWeapon,REFINE_GLOWS[2],10,20,30,60);return {calls,alpha:ctx.globalAlpha,blur:ctx.shadowBlur}})())`));
  assert.equal(result.calls.length,4);assert.equal(result.alpha,.8);assert.equal(result.blur,0);
  for(const [x,y,w,h] of result.calls){assert.ok(Math.abs(x-10)<=1.400001&&Math.abs(y-20)<=1.400001);assert.equal(w,30);assert.equal(h,60);}
 });
 test('weapon glow starts at +7, changes at +9 and +10',()=>{
  assert.equal(game.ev('milestone(REFINE_GLOWS,6)'),null);
  for(const [rank,tier] of [[7,7],[8,7],[9,9],[10,10]])assert.equal(game.ev(`milestone(REFINE_GLOWS,${rank}).at`),tier);
 });
 test('owner glow tiers inherit the closest earlier rank, with nothing below +7',()=>{
  const expected=[null,null,null,null,null,null,null,7,7,9,10,10,10,13,14,15];
  for(let rank=0;rank<=15;rank++)assert.equal(game.ev(`milestone(REFINE_GLOWS,${rank})?.at??null`),expected[rank]);
  assert.deepEqual(JSON.parse(game.ev('JSON.stringify(REFINE_GLOWS.map(g=>[g.at,g.color]))')),[[7,'#71ffae'],[9,'#a78bfa'],[10,'#ff3049'],[13,'#a3ff32'],[14,'#ffcc00'],[15,'#32e6ff']]);
  const sizes=[];
  for(const rank of [10,13,14,15])sizes.push(game.ev(`(()=>{let extent=0;const ctx={save(){},restore(){},translate(){},beginPath(){},closePath(){},moveTo(x,y){extent=Math.max(extent,Math.hypot(x,y))},lineTo(x,y){extent=Math.max(extent,Math.hypot(x,y))},fill(){}};drawWeaponGlint(ctx,milestone(REFINE_GLOWS,${rank}),0,0,1000);return extent})()`));
  for(let i=1;i<sizes.length;i++)assert.ok(sizes[i]>sizes[i-1]);
 });
 test('arm crops are frame-specific, bounded, and draw in both native layer phases',()=>{
  game.ev(`window.armImage={};window.armLayer=[0,0,40,70,130,120,10000,'body'];window.armMask=nativeArmCrop(armImage,armLayer)`);
  assert.equal(game.ev('nativeArmCrop(armImage,armLayer)===window.armMask'),true);
  assert.equal(game.ev('window.armMask.width'),40);assert.equal(game.ev('window.armMask.height'),70);
  const result=JSON.parse(game.ev(`JSON.stringify((()=>{const calls=[],ctx={globalAlpha:.8,save(){},restore(){},drawImage:(...args)=>calls.push(args.slice(1))};drawNativeArmGlow(ctx,armImage,armLayer,'before',REFINE_GLOWS[2],1000);const alpha=ctx.globalAlpha;drawNativeArmGlow(ctx,armImage,armLayer,'after',REFINE_GLOWS[2],1000);return {calls,alpha}})())`));
  assert.equal(result.calls.length,9);assert.equal(result.alpha,.8);
  game.ev('for(let i=0;i<40;i++)nativeArmCrop(armImage,[i,0,40,70,130,120])');
  assert.equal(game.ev('nativeArmCrops.get(armImage).size'),32);
 });
 test('weapon palette is independent of aura colors and +10 is crimson',()=>{
  assert.equal(game.ev('REFINE_GLOWS.every(w=>!LEVEL_AURAS.some(a=>a.color===w.color))'),true);
  assert.equal(game.ev('milestone(REFINE_GLOWS,10).color'),'#ff3049');
 });
 test('tip detection ignores transparent padding and chooses the opaque end away from the grip',()=>{
  const tip=JSON.parse(game.ev(`JSON.stringify((()=>{const pixels=new Uint8ClampedArray(8*8*4);pixels[(1*8+4)*4+3]=255;pixels[(6*8+4)*4+3]=255;pixels[(0*8+0)*4+3]=40;return weaponTipFromPixels(pixels,8,8,.5,.9)})())`));
  assert.deepEqual(tip,[4.5/8,1.5/8]);
 });
 test('glint is a pointed star with a white core, follows its anchor and restores canvas state',()=>{
  const result=JSON.parse(game.ev(`JSON.stringify((()=>{const positions=[],fills=[],ctx={saved:0,restored:0,save(){this.saved++},restore(){this.restored++},translate(x,y){positions.push([x,y])},beginPath(){},closePath(){},moveTo(){},lineTo(){},fill(){fills.push(this.fillStyle)}};drawWeaponGlint(ctx,REFINE_GLOWS[2],14,21,1000);return {positions,fills,saved:ctx.saved,restored:ctx.restored}})())`));
  assert.deepEqual(result.positions,[[14,21]]);assert.deepEqual(result.fills,['#ff3049','#fff5ed']);assert.equal(result.saved,1);assert.equal(result.restored,1);
 });
 test('native weapon crop cache is bounded and trails expire/reset at swing and stance boundaries',()=>{
  game.ev(`window.nativeImage={};window.layer=[0,0,8,8,20,30,0,'weapon'];window.trail={points:[],progress:null};window.strokes=0;window.ctx={globalAlpha:1,save(){},restore(){},drawImage(){},translate(){},beginPath(){},closePath(){},moveTo(){},lineTo(){},fill(){},stroke(){strokes++}};drawNativeWeaponGlow(ctx,nativeImage,layer,'before',REFINE_GLOWS[2],trail,.2,1000);layer[4]+=10;drawNativeWeaponGlow(ctx,nativeImage,layer,'before',REFINE_GLOWS[2],trail,.4,1033)`);
  assert.equal(game.ev('strokes'),1);assert.equal(game.ev('trail.points.length'),2);
  game.ev("drawNativeWeaponGlow(ctx,nativeImage,layer,'before',REFINE_GLOWS[2],trail,.6,1200)");assert.equal(game.ev('trail.points.length'),1,'old trail expires');
  game.ev("drawNativeWeaponGlow(ctx,nativeImage,layer,'before',REFINE_GLOWS[2],trail,0,1233)");assert.equal(game.ev('trail.points.length'),1,'new swing clears old trail');
  game.ev("drawNativeWeaponGlow(ctx,nativeImage,layer,'before',REFINE_GLOWS[2],trail,null,1266)");assert.equal(game.ev('trail.points.length'),0,'idle clears trail');
  game.ev('for(let i=0;i<40;i++)nativeWeaponCrop(nativeImage,[i,0,8,8,0,0])');assert.equal(game.ev('nativeWeaponCrops.get(nativeImage).size'),32);
  assert.equal(game.ev('nativeWeaponTips.get(nativeImage).size'),40,'weapon tips stay cached across 8-direction walk crop evictions');
 });
 test('hidden field WebGL render pauses while social-open covers the view and resumes on return',()=>{
  const counts=JSON.parse(game.ev(`JSON.stringify((()=>{let renders=0;const orig=R.render;R.render=function(...a){renders++;return orig.apply(this,a)};try{document.body.classList.add('social-open');draw();const duringSocial=renders;document.body.classList.remove('social-open');draw();return {duringSocial,afterLeave:renders}}finally{R.render=orig;document.body.classList.remove('social-open')}})())`));
  assert.equal(counts.duringSocial,0);assert.equal(counts.afterLeave,1);
 });
 console.log(`${passed} passed`);
}finally{game.close()}
