// Exercise both production builders with real r128 geometry, including the
// surfaces that previously disappeared and the shared navigation boundary.
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const w=new JSDOM('',{runScripts:'outside-only'}).window,T={...require('three')};
 const gradient={addColorStop(){}};
 const ctx=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,measureText:()=>({width:40})},{get:(o,k)=>k in o?o[k]:()=>{}});
 w.HTMLCanvasElement.prototype.getContext=()=>ctx;
 T.TextureLoader=class{load(url,cb){const t=new T.Texture(w.document.createElement('canvas'));cb(t);return t}};
 w.THREE=T;
 w.eval(fs.readFileSync('assets/digimon/roster.js','utf8'));
 for(const n of ['social-rules','social-gym-redesign','social-pond-design'])w.eval(fs.readFileSync('assets/'+n+'.js','utf8'));
 const R=w.PGSocialRules,scene=new T.Scene();
 const gym=await w.PGSocialGymRedesign.build(scene);assert(gym.triangles>0);
 scene.updateMatrixWorld(true);
 const down=(x,z,objects)=>new T.Raycaster(new T.Vector3(x,30,z),new T.Vector3(0,-1,0)).intersectObjects(objects,true);
 for(const [x,z] of [[40.5,23.5],[54,12.9],[69,10],[84,12.9],[97.5,23.5]]){
  assert(down(x,z,scene.children).some(hit=>hit.point.y>10&&hit.point.y<14),'supported roof covers '+[x,z]);
  assert(!R.walkable(x,z),'enclosed shell blocks movement at '+[x,z]);
 }
 // Central canopy was absent even when the wings were roofed.
 assert(down(69,14,scene.children).some(hit=>hit.point.y>3&&hit.point.y<4),'center veranda has its own continuous roof');
 const sign=scene.children.find(m=>m.isMesh&&Math.abs(m.position.x-69)<.01&&Math.abs(m.position.z-38.52)<.2&&m.geometry.type==='PlaneGeometry');
 assert(sign,'entrance sign exists');sign.geometry.computeBoundingBox();
 assert(sign.position.y+sign.geometry.boundingBox.min.y>4.7,'raised sign clears the entrance by over 4.7 units');
 for(const [x,z] of [[59,30],[65,23],[74,25],[84,27]])assert(R.path({x:69,z:35},{x,z}).length,'gym station remains reachable');
 const water=new T.Mesh(new T.PlaneGeometry(38,60),new T.MeshBasicMaterial()),coping=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial()),sakura=new T.Group(),old=new T.Group();sakura.userData.sakura=true;
 const pondScene=new T.Scene();for(const o of [water,coping,sakura,old])pondScene.add(o);
 const before=JSON.stringify({chairs:R.CHAIRS,props:R.POND_PROPS,ponds:R.PONDS}),p=R.PONDS[0],b=R.POND_PROPS[0].bridge;
 const design=w.PGSocialPondDesign.build({T,R,scene:pondScene,view:{p,props:R.POND_PROPS[0],water,coping},legacy:[water,coping,sakura,old]});
 assert(coping.visible&&sakura.visible&&!old.visible,'native coping and sakura survive the art swap');
 assert.equal(water.material,design.water);assert(!design.water.transparent,'water coverage is independent of transparent ripple overlays');
 pondScene.updateMatrixWorld(true);
 for(const plank of [3,22,44,66,84]){
  const t=(plank+.5)/88; // Sample solid plank centers, not the 2.5 cm drainage joints.
  const x=b.x-b.span/2+b.span*t,hit=down(x,b.z,[design.root])[0];
  assert(hit&&Math.abs(hit.point.y-4*b.arch*t*(1-t))<.04,'bridge deck matches the actual walking profile');
 }
 for(const c of R.CHAIRS){assert(R.walkable(c.x,c.z),'fishing chair '+c.id+' remains accessible');assert(R.path({x:-10,z:73},c).length,'fishing chair has a route from the east landing')}
 const buffers=[];design.root.traverse(o=>{if(o.geometry)buffers.push(o.geometry)});
 const camera=new T.PerspectiveCamera();camera.position.set(-30,20,90);
 design.update(1,camera);const spray=design.root.children.find(o=>o.isInstancedMesh),at=Array.from(spray.instanceMatrix.array);
 design.update(2,camera);assert.notDeepEqual(Array.from(spray.instanceMatrix.array),at,'cascade spray actually moves');
 design.baseOnly(true);assert.equal(design.water.uniforms.uBaseOnly.value,1);assert.equal(design.water.uniforms.uTime.value,2);
 const after=[];design.root.traverse(o=>{if(o.geometry)after.push(o.geometry)});assert.deepEqual(after,buffers,'animation reuses geometry');
 for(const parent of [scene,design.root])parent.traverse(o=>{if(!o.geometry)return;const a=o.geometry.attributes.position;for(const n of a.array)assert(Number.isFinite(n),'finite geometry');if(!o.geometry.index)assert.equal(a.count%3,0,'complete triangle lists')});
 assert.equal(JSON.stringify({chairs:R.CHAIRS,props:R.POND_PROPS,ponds:R.PONDS}),before,'art does not mutate fishing contracts');
 console.log('PASS runtime gym roofs, entrance clearance, shell collision, station routes, pond coverage, eight fishing seats, bridge deck and allocation-stable animation; gym '+gym.triangles+' batched triangles; pond '+design.triangles);
 w.close();
})().catch(e=>{console.error(e);process.exitCode=1});
