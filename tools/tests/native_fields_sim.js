// Real plans, source geometry and Three objects: terrain/clearance/lifecycle/delivery regression.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),THREE=require('three');
const F=require('../../assets/native-fields.js'),root=path.resolve(__dirname,'../..'),src=fs.readFileSync(root+'/index.html','utf8');
const catalog=JSON.parse(fs.readFileSync(root+'/assets/native-fields/v1/catalog.json'));
const canvas=()=>({width:0,height:0,getContext:()=>({save(){},restore(){},translate(){},scale(){},beginPath(){},arc(){},stroke(){},createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4)}},putImageData(){},drawImage(){},fillRect(){},clearRect(){},createPattern(){return{}},createRadialGradient(){return{addColorStop(){}}}})});
global.document={createElement:canvas};
const scope={THREE,console,document:global.document,scene:new THREE.Group(),deco:new THREE.Group(),BX_:13,Z0:-28,Z1:12,S:{lvl:1},Map,Set};
vm.createContext(scope);vm.runInContext(src.slice(src.indexOf('// ----- The map kit'),src.indexOf('// ----- Ragnarok-style 8-dir sprites'))+`;this.K={kitPlan,KIT};`,scope);
const K=scope.K;K.KIT.ok=1;K.KIT.png={};K.KIT.man=JSON.parse(fs.readFileSync(root+'/assets/kit/ro-spritesheet.json'));K.KIT.des.payon=JSON.parse(fs.readFileSync(root+'/assets/kit/ro-map-payon.json'));K.KIT.des.morocc=JSON.parse(fs.readFileSync(root+'/assets/kit/ro-map-morocc.json'));
// Execute the production activation gate without loading any field data.
const gate=src.slice(src.indexOf('const NATIVE_FIELDS_DEFAULT='),src.indexOf('function clearNativeField(){'));
for(const [query,enabled] of [['',false],['?nativeFields=1',true],['?nativeFields=0',false],['?nativeFields=true',false],['?other=1',false]]){
 let stores=0;const ctx={URLSearchParams,location:{search:query},PGNativeFields:{createStore(){stores++;return{}}}};vm.createContext(ctx);
 vm.runInContext(gate+';this.enabled=nativeFieldsEnabled;this.store=nativeFieldStore;',ctx);
 assert.equal(ctx.enabled,enabled,query);assert.equal(stores,enabled?1:0,'only explicit preview creates a store');assert.equal(!!ctx.store,enabled);
}
let maxTriangles=0,scenes=0;
for(let map=0;map<10;map++)for(const stage of [1,4,7,10,15]){
 const record=catalog.maps[map],bytes=fs.readFileSync(root+'/assets/native-fields/v1/'+record.name+'/models.bin'),vertices=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4),plan=K.kitPlan(map,stage);
 assert(plan);const props=F.placements(map,stage,plan,record);assert(props.length>=8,record.name+' has no native scenery');assert.deepEqual(props,F.placements(map,stage,plan,record),'deterministic layout');
 for(const p of props){
  assert(['tree','tree2','rock','shrub','stump','detail'].includes(p.role),'town prop in outdoor field');
  assert(!(Math.abs(p.x)-p.rx<13.39&&p.z+p.rz>-29&&p.z-p.rz<14),'model intrudes into combat field');assert(Number.isFinite(p.y));assert(record.models[p.role].size[1]*p.scale<=8.00001,'oversized field scenery');
  const w=F.DESIGNS[map].water;if(w)assert(Math.hypot((p.x-w.x)/w.rx,(p.z-w.z)/w.rz)>1.1,'prop inside pond');
 }
 const samples=[];let maxSlope=0;
 for(let x=-13;x<=13;x+=2)for(let z=-28;z<=12;z+=2){const y=F.heightAt(map,x,z);samples.push(y);maxSlope=Math.max(maxSlope,Math.abs(F.heightAt(map,x+.01,z)-y)/.01,Math.abs(F.heightAt(map,x,z+.01)-y)/.01)}
 assert(Math.max(...samples)-Math.min(...samples)>2,'relief must reach playable field');assert(maxSlope<1.1,'walkable hills must remain gradual without stair jumps');
 const world=F.build(THREE,{record,vertices,terrain:{},atlas:{}},map,stage,plan);scenes++;maxTriangles=Math.max(maxTriangles,world.diagnostics.triangles);
 if(map===0&&stage===1){
  // onBeforeCompile receives unresolved ShaderLib includes in Three r128.
  const material=world.root.children.find(mesh=>mesh.userData.nativeProp).material;
  const shader={vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader};
  assert(shader.fragmentShader.includes('#include <map_fragment>'));
  material.onBeforeCompile(shader);
  assert(shader.vertexShader.includes('nativeBounds=sourceBounds;'),'source atlas bounds must reach the fragment shader');
  assert(!shader.fragmentShader.includes('#include <map_fragment>'),'map chunk must be patched before include expansion');
  assert(shader.fragmentShader.includes('texture2D( map, clamp(vUv,nativeBounds.xy,nativeBounds.zw) )'),'atlas sampling must clamp interpolated UVs');
  assert(shader.fragmentShader.includes('mapTexelToLinear( texelColor )'),'preserve map chunk color conversion');
 }
 const floor=world.root.children[0].geometry,a=floor.attributes.position;assert(floor.index,'shared vertices smooth terrain normals');assert(floor.attributes.normal);assert(floor.groups.length<=1);assert(world.diagnostics.triangles<100000,'geometry budget');
 // Sample triangle interiors independently: production foot height must meet the actual GPU mesh.
 for(let k=0;k<floor.index.count;k+=Math.floor(floor.index.count/79/3)*3){
  const ids=[0,1,2].map(j=>floor.index.getX(k+j)),x=ids.reduce((n,i)=>n+a.getX(i),0)/3,z=ids.reduce((n,i)=>n+a.getZ(i),0)/3,y=ids.reduce((n,i)=>n+a.getY(i),0)/3;
  assert(Math.abs(F.heightAt(map,x,z)-y)<2e-6,'height function differs from rendered slope');
 }
 const w=F.DESIGNS[map].water;if(w){assert(F.heightAt(map,w.x,w.z)<w.level-.9,'pond is below its natural shore');assert(world.root.children.some(o=>o.userData.nativePond),'missing natural pond')}
 const extra=new THREE.Texture();let extraDisposed=0;extra.addEventListener('dispose',()=>extraDisposed++);world.trackTextures([extra]);
 const owned=new Set();world.root.traverse(o=>{if(o.geometry)owned.add(o.geometry);if(o.material)for(const material of (Array.isArray(o.material)?o.material:[o.material])){owned.add(material);if(material.map)owned.add(material.map)}});let disposed=0;for(const r of owned)r.addEventListener('dispose',()=>disposed++);
 const parent=new THREE.Group();parent.add(world.root);world.dispose();assert.equal(parent.children.length,0);assert.equal(extraDisposed,1,'inactive water frame texture is disposed');assert.equal(disposed,owned.size,'all owned GPU resources are disposed once');
}
const profiles=F.DESIGNS.map((_,map)=>[-12,0,12].flatMap(x=>[-24,-8,10].map(z=>F.heightAt(map,x,z).toFixed(3))).join(','));assert.equal(new Set(profiles).size,10,'fields must have distinct hill profiles');
(async()=>{
 const requests=[];let fail=false;const fakeFetch=async url=>{requests.push(url);if(fail)return{ok:false};if(url.endsWith('catalog.json'))return{ok:true,json:async()=>catalog};const name=url.split('/').at(-2),buffer=fs.readFileSync(root+'/assets/native-fields/v1/'+name+'/models.bin');return{ok:true,arrayBuffer:async()=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength)}};
 const store=F.createStore({fetcher:fakeFetch,loadImage:async url=>({src:url})});await Promise.all([store.ensure(0),store.ensure(0)]);assert.equal(requests.length,2,'one catalog and one geometry fetch per shared request');assert(!requests.some(s=>/geffen|mobs/.test(s)),'no unrelated preload');
 await store.ensure(1);await store.ensure(2);assert(store.diagnostics().cached.length<=2,'bounded decoded maps');fail=true;await assert.rejects(store.ensure(3));fail=false;await store.ensure(3);assert(store.ready(3),'failed travel can retry');
 assert(src.includes('!planOverride&&nativeFieldStore'),'special arenas retain their own scenery');assert(src.includes('S.mp===m&&!TRIAL.on&&!JOB_RITE.on'),'stale async load cannot replace another field');
 console.log(`native fields: ${scenes} scenes passed; max ${maxTriangles} triangles; outdoor prop clearance, continuous hills, triangle contact, ponds, lifecycle, lazy loading, retry and cache limits passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
