// Real Three geometry and dev viewer DOM. Does not establish GPU pixels/performance.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const THREE=require('../maps/vendor/three-r128.min.js');
assert.equal(THREE.REVISION,'128');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../..');
const gameSource=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.ok(gameSource.includes('BX_=13,Z0=-28,Z1=12'),'Game arena contract changed; review scenery bounds');
assert.ok(gameSource.includes('PerspectiveCamera(38,2,.1,200)'),'Game camera projection changed');
assert.ok(gameSource.includes('let az=0,el=.95,zoom=1'),'Game camera defaults changed');
assert.ok(gameSource.includes('(KIT.nativeWorld?(cam.aspect<1?40:44):(cam.aspect<1.5?26:18))/zoom'),'Game camera distance changed');
assert.ok(gameSource.includes('CAMERA_FOCUS_Y=.28,CAMERA_LEAD_Z=.25'),'Game focus contract changed');
const source=fs.readFileSync(path.join(root,'tools/maps/endgame-scenes.js'),'utf8');
const api=require('../maps/endgame-scenes.js')(THREE);
function signature(w){const s=[];w.scenery.traverse(o=>{if(o.isMesh)s.push({type:o.geometry.type,p:o.position.toArray(),r:o.rotation.toArray(),v:[...o.geometry.attributes.position.array],instances:o.isInstancedMesh?[...o.instanceMatrix.array]:null,color:o.material.color.getHex()});});return JSON.stringify(s);}
function validate(w){
  const arena=new THREE.Box3(new THREE.Vector3(-w.arena.halfWidth,-100,w.route?-228:w.arena.z0),new THREE.Vector3(w.arena.halfWidth,100,w.route?24:w.arena.z1));
  const bounds=new THREE.Box3(),instance=new THREE.Matrix4(),transform=new THREE.Matrix4();
  w.scene.updateMatrixWorld(true);
  w.scenery.traverse(o=>{
    if(!o.isMesh)return;
    o.geometry.computeBoundingBox();
    if(o.isInstancedMesh){
      for(let i=0;i<o.count;i++){
        o.getMatrixAt(i,instance);transform.multiplyMatrices(o.matrixWorld,instance);
        bounds.copy(o.geometry.boundingBox).applyMatrix4(transform);
        if(o.userData.category==='floor')assert.ok(bounds.max.y<=.08,'Instanced floor ornament must stay flat');else if(o.userData.category==='underfloor')assert.ok(bounds.max.y<0);else assert.ok(!bounds.intersectsBox(arena),`${w.kind}/${w.group} scenery intersects combat: ${JSON.stringify(bounds)}`);
      }
    }else{
      bounds.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      if(o.userData.category==='floor')assert.ok(bounds.max.y<=.08,'Floor ornament must stay flat');else if(o.userData.category==='underfloor')assert.ok(bounds.max.y<0,'Lava lake remains below the safe arena');
      else assert.ok(!bounds.intersectsBox(arena),'Unbatched scenery overlaps arena');
    }
  });
  assert.ok(w.stats().batches<=20,'Bound material batches');
  assert.ok(w.stats().instances<600,'Bound instance count');
  assert.ok(w.stats().triangles<20000,'Bound triangle count');
  assert.equal(w.features.length,4);
  assert.equal(w.footprint,w.kind==='astral'?(w.group===3?'bridge-terminus':'bridge'):(w.group===3?'circle':'natural-field'));
  const floorShape=w.scenery.children.find(o=>o.userData.category==='floor');
  assert.equal(floorShape.geometry.type,w.kind==='thor'&&w.group===3?'CircleGeometry':'ShapeGeometry');
  if(w.kind==='thor'&&w.group===3)assert.ok(floorShape.geometry.parameters.radius>=Math.hypot(13,20),'Round arena contains all current combat corners');
  const points=w.scene.children.find(o=>o.isPoints);
  assert.equal(points.geometry.attributes.position.count,96);
  w.update(12,false);const first=Array.from(points.geometry.attributes.position.array);
  w.update(66,false);assert.deepEqual(Array.from(points.geometry.attributes.position.array),first,'Reduced motion freezes atmospheric positions');
  w.update(67,true);assert.notDeepEqual(Array.from(points.geometry.attributes.position.array),first);
}
for(const kind of ['astral','thor']){
  const signatures=new Set();
  for(const stages of api.GROUPS){
    let canonical;
    for(const stage of stages){
      const w=api.build(kind,stage);validate(w);
      if(canonical)assert.equal(signature(w),canonical,'Stages within a group share identical geometry');
      else canonical=signature(w);
      const again=api.build(kind,stage);assert.equal(signature(again),signature(w),'Seeded determinism');again.dispose();
      const resources=new Set();w.scene.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material)resources.add(o.material)});
      let events=0;resources.forEach(r=>r.addEventListener('dispose',()=>events++));
      w.dispose();assert.equal(events,resources.size,'All tracked geometry and materials disposed');
      w.dispose();assert.equal(events,resources.size,'Dispose is idempotent');w.update(10);
    }
    signatures.add(canonical);
  }
  assert.equal(signatures.size,kind==='astral'?1:4,'Astral selections share one continuous bridge; Thor field layouts differ');
}
function inside(x,z,points){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
for(const kind of ['astral','thor'])for(const stage of [1,4,7,10]){const w=api.build(kind,stage);const outline=w.route?w.route.outline:w.scenery.children.find(o=>o.userData.category==='floor').userData.outline;if(outline){for(let x=-13;x<=13;x+=2)for(let z=w.arena.z0;z<=w.arena.z1;z+=2)assert.ok(inside(x,z,outline),kind+' safe field stays on connected ground');}if(w.route){for(let z=20;z>=-240;z-=2)assert.ok(inside(0,z,outline),'Unbroken center path from arrival to boss');assert.deepEqual(w.route.focus,[-8,-74,-140,-208]);}w.dispose();}
const crypto=require('node:crypto'),approved=api.build('thor',10),approvedData=[];approved.scene.traverse(o=>{if(o.isMesh)approvedData.push({type:o.geometry.type,p:o.position.toArray(),r:o.rotation.toArray(),matrix:o.isInstancedMesh?[...o.instanceMatrix.array]:null,v:[...o.geometry.attributes.position.array],color:o.material.color.getHex(),category:o.userData.category})});assert.equal(crypto.createHash('sha256').update(JSON.stringify(approvedData)).digest('hex'),'40226fd5855d24a71e7824d9ef83ea80d1857e5e0ce82509ae73f41431ed29b4','Preserve the approved Thor boss geometry and material colours');approved.dispose();
assert.throws(()=>api.build('missing',1),RangeError);
for(const n of [0,11,NaN,1.5])assert.throws(()=>api.groupFor(n),RangeError);
assert.equal(api.cameraPose(2).fov,38);
assert.equal(api.cameraPose(2).position[1],Math.sin(.95)*18+.5);
assert.equal(api.cameraPose(1).position[1],Math.sin(.95)*26+.5);
assert.equal(api.cameraPose(2).target[1],.28);
// Texture generation uses an original surface and has an explicit disposal path.
const calls=[];
const canvas={getContext:()=>new Proxy({},{get:(_t,key)=>typeof key==='string'?(...args)=>calls.push([key,args]):undefined,set:()=>true})};
const textured=api.build('astral',1,{createCanvas:()=>canvas});
const texture=textured.scenery.children.find(o=>o.userData.category==='floor'&&o.material.map).material.map;
assert.ok(calls.length>22000);let textureDisposals=0;texture.addEventListener('dispose',()=>textureDisposals++);textured.dispose();assert.equal(textureDisposals,1);

for(const kind of ['astral','thor']){
 const withArt=api.build(kind,10,{createCanvas:()=>canvas,surfaces:{stone:{width:1024,height:1024},lava:{width:1024,height:1024}}});
 const all=new Set();withArt.scenery.traverse(o=>{if(o.material)for(const key of ['map','bumpMap'])if(o.material[key])all.add(o.material[key]);});
 let disposed=0;all.forEach(t=>t.addEventListener('dispose',()=>disposed++));withArt.dispose();assert.equal(disposed,all.size,'All detailed material textures disposed exactly once');
}
const html=fs.readFileSync(path.join(root,'tools/map_scene_preview.html'),'utf8');
function viewer(fail=false,query='',imageOutcome=null){
  const dom=new JSDOM(html,{runScripts:'outside-only',url:'http://preview.test/'+query,pretendToBeVisual:true});
  const w=dom.window,renderers=[];
  class Renderer{
    constructor(){if(fail)throw new Error('No WebGL fixture');this.domElement=w.document.createElement('canvas');this.shadowMap={};renderers.push(this);}
    setPixelRatio(){}setSize(){}render(){this.renders=(this.renders||0)+1}dispose(){this.disposed=true}
  }
  w.THREE={...THREE,WebGLRenderer:Renderer};
  w.HTMLCanvasElement.prototype.getContext=()=>canvas.getContext();
  if(imageOutcome!==null)w.Image=class{constructor(){this.width=this.height=1024}set src(value){queueMicrotask(()=>imageOutcome?this.onload():this.onerror())}};
  w.ResizeObserver=class{observe(){}disconnect(){}};
  w.matchMedia=()=>({matches:true});
  let frame,clock=0;w.requestAnimationFrame=cb=>{frame=cb;return 1};w.cancelAnimationFrame=()=>{frame=null};
  const errors=[];w.addEventListener('error',e=>errors.push(e.error));
  w.eval(source);
  const inline=[...w.document.querySelectorAll('script:not([src])')][0].textContent;
  w.eval(inline);
  return {dom,w,renderers,errors,draw:()=>{clock+=100;if(frame)frame(clock)}};
}
const v=viewer(),d=v.w.document;
assert.equal(d.querySelectorAll('[data-stage]').length,4);
assert.equal(d.getElementById('motion').checked,false,'Respects reduced-motion on startup');
d.querySelector('[data-map="thor"]').click();assert.equal(d.getElementById('title').textContent,'Outer Fissure');
d.querySelector('[data-stage="10"]').click();assert.match(d.getElementById('groupTitle').textContent,/Boss arena/);
d.getElementById('gameCamera').click();assert.equal(d.getElementById('zoom').value,'1');assert.equal(d.getElementById('focus').value,'-0.25');
d.getElementById('surveyCamera').click();assert.equal(d.getElementById('zoom').value,'0.28');
v.draw();assert.equal(v.renderers[0].renders,1);v.draw();assert.equal(v.renderers[0].renders,1,'Static review does not continuously redraw');
assert.equal(v.w.PGEndgameStudio.diagnostics().footprint,'circle');
assert.equal(d.getElementById('features').querySelectorAll('p').length,4);
v.renderers[0].domElement.dispatchEvent(new v.w.Event('webglcontextlost',{cancelable:true}));
assert.equal(d.getElementById('error').hidden,false);assert.match(d.getElementById('errorText').textContent,/context was lost/);
v.w.dispatchEvent(new v.w.Event('pagehide'));assert.equal(v.renderers[0].disposed,true);assert.deepEqual(v.errors,[]);v.dom.window.close();
const route=viewer();route.w.document.getElementById('tourBridge').click();assert.equal(route.w.PGEndgameStudio.diagnostics().tourActive,true);for(let i=0;i<300;i++)route.draw();assert.equal(route.w.PGEndgameStudio.diagnostics().stage,10);assert.equal(route.w.PGEndgameStudio.diagnostics().focusZ,-208);route.w.document.getElementById('wholeBridge').click();assert.equal(route.w.PGEndgameStudio.diagnostics().viewMode,'overview');assert.equal(route.w.document.getElementById('routeLabels').children.length,4);route.w.dispatchEvent(new route.w.Event('pagehide'));route.dom.window.close();
const linked=viewer(false,'?map=thor&stage=10');assert.equal(linked.w.document.getElementById('title').textContent,'Primal Core');assert.match(linked.w.document.getElementById('groupTitle').textContent,/Boss arena/);linked.w.dispatchEvent(new linked.w.Event('pagehide'));linked.dom.window.close();
const failed=viewer(true);assert.equal(failed.w.document.getElementById('error').hidden,false);assert.match(failed.w.document.getElementById('errorText').textContent,/No WebGL/);failed.dom.window.close();
(async()=>{for(const outcome of [true,false]){const test=viewer(false,'',outcome);await new Promise(resolve=>setImmediate(resolve));assert.equal(test.w.PGEndgameStudio.diagnostics().materialsLoaded,true);assert.match(test.w.document.getElementById('materialStatus').textContent,outcome ? /materials loaded/ : /fallback/);assert.deepEqual(test.errors,[]);test.w.dispatchEvent(new test.w.Event('pagehide'));test.dom.window.close();}console.log('Detailed scenery: all 20 stages, four-group reuse, connected bridge, natural fields and preserved Thor boss, geometry clearance, textures/disposal, motion/static rendering, camera math, deep links, material success/failure and viewer DOM pass. GPU pixels checked separately.');})().catch(e=>{console.error(e);process.exitCode=1});
