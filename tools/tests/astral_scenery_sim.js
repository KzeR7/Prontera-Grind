'use strict';
const assert=require('assert/strict'),crypto=require('crypto'),THREE=require('three'),astral=require('../../assets/astral-scenery.js')(THREE);
function fingerprint(world){const hash=crypto.createHash('sha256');world.scenery.traverse(o=>{if(!o.geometry)return;hash.update(o.userData.category);for(const name of Object.keys(o.geometry.attributes).sort())hash.update(Buffer.from(o.geometry.attributes[name].array.buffer));if(o.geometry.index)hash.update(Buffer.from(o.geometry.index.array.buffer));if(o.isInstancedMesh)hash.update(Buffer.from(o.instanceMatrix.array.buffer));});return hash.digest('hex');}
function width(z){const outline=astral.OUTLINE;for(let i=0;i<12;i++){const a=outline[i],b=outline[i+1];if(z<=a[1]&&z>=b[1])return a[0]+(b[0]-a[0])*(z-a[1])/(b[1]-a[1]);}throw Error('Outside bridge');}
let route,sceneHash;
for(let stage=1;stage<=5;stage++){
 const w=astral.build(stage);assert.equal(w.group,stage<=2?0:stage-2);assert.equal(w.view.focus,astral.FOCUS[w.group]);
 if(route)assert.deepEqual(w.route,route);route=w.route;
 assert.ok(w.stats().triangles<100000);assert.ok(w.stats().batches<40);
 // Stage changes move the view along the same deterministic world. All real
 // geometry remains finite; tall props must leave the full combat corridor clear.
 const currentHash=fingerprint(w);if(sceneHash)assert.equal(currentHash,sceneHash);sceneHash=currentHash;
 w.scene.updateMatrixWorld(true);
 w.scenery.traverse(o=>{if(!o.geometry)return;const p=o.geometry.attributes.position;for(const value of p.array)assert.ok(Number.isFinite(value));o.geometry.computeBoundingBox();
  for(let i=0;i<(o.isInstancedMesh?o.count:1);i++){
   const transform=o.matrixWorld.clone();if(o.isInstancedMesh){const instance=new THREE.Matrix4();o.getMatrixAt(i,instance);transform.multiply(instance);}
   const bounds=o.geometry.boundingBox.clone().applyMatrix4(transform);
   if(bounds.max.y>.25&&bounds.min.z<w.arena.z1&&bounds.max.z>w.arena.z0)assert.ok(bounds.min.x>=13||bounds.max.x<=-13,`${o.userData.category} intrudes into combat at stage ${stage}`);
  }
 });
 const paving=w.scenery.children.find(o=>o.userData.slabs);
 assert.ok(paving.userData.slabs>400);assert.ok(paving.material.vertexColors);
 const tints=new Set(),uv=paving.geometry.attributes.uv,color=paving.geometry.attributes.color;
 for(let i=0;i<color.count;i++)tints.add([color.getX(i),color.getY(i),color.getZ(i)].join(','));assert.ok(tints.size>=7);
 assert.ok(uv.array.some(v=>v>2),'Individual slabs sample different parts of the repeating texture');
 for(const category of ['mosaic','engraving']){const surface=w.scenery.children.find(o=>o.userData.category===category),normals=surface.geometry.attributes.normal;
  for(let i=0;i<normals.count;i++)assert.ok(normals.getY(i)>.99,`${category} faces must be visible from above with normal backface culling`);
 }
 const rocks=w.scenery.children.filter(o=>o.userData.category==='island'),silhouettes=new Set();assert.equal(rocks.length,8);
 for(const rock of rocks){const p=rock.geometry.attributes.position,b=rock.geometry.boundingBox,c=b.getCenter(new THREE.Vector3()),size=b.getSize(new THREE.Vector3());
  assert.ok(size.y>5&&size.x>5);const top=[];for(let i=0;i<p.count;i++)if(p.getY(i)>b.max.y-1.3)top.push(p.getY(i));assert.ok(new Set(top).size>10,'Island tops have ridges rather than flat caps');
  const normalized=Array.from(p.array,(v,i)=>Math.round((v-[c.x,c.y,c.z][i%3])/[size.x,size.y,size.z][i%3]*1000));silhouettes.add(crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex'));
 }
 assert.equal(silhouettes.size,rocks.length,'Each island has a different fractured silhouette');
 // All pillar foundations overlap the real bridge at their entire z extent and
 // the visible base sits flush with the foundation; no coordinate-only marker proof.
 const matrix=new THREE.Matrix4(),box=new THREE.Box3(),geometry= new THREE.BoxGeometry(1,1,1);
 const foundation=[];w.scenery.traverse(o=>{if(o.isInstancedMesh&&o.userData.category==='foundation')for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);geometry.computeBoundingBox();foundation.push(geometry.boundingBox.clone().applyMatrix4(matrix));}});
 for(const p of w.footings){assert.equal(p.top,p.baseY);assert.ok(foundation.some(b=>Math.abs(b.max.y)<1e-6&&b.min.x<=p.x-1.2&&b.max.x>=p.x+1.2&&b.min.z<=p.z-1.2&&b.max.z>=p.z+1.2));
  for(const z of [p.z-p.depth/2,p.z+p.depth/2])assert.ok(Math.abs(p.x)-p.width/2<width(z),`Foundation must join bridge at ${p.x},${z}`);
  assert.ok(Math.abs(p.x)>13||p.z<w.arena.z0||p.z>w.arena.z1,'Pillars stay outside combat');
 }
 geometry.dispose();
 const resources=new Set();w.scene.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material)resources.add(o.material)});let disposed=0;resources.forEach(r=>r.addEventListener('dispose',()=>disposed++));
 w.update(2);w.dispose();assert.equal(disposed,resources.size);w.dispose();assert.equal(disposed,resources.size);assert.equal(w.scene.children.length,0);
}
assert.throws(()=>astral.build(6),/1–5/);assert.throws(()=>astral.build(0),/1–5/);
// The real loader can provide successful textures or a fallback with no images.
// Both paths above/below must own and dispose every uploaded texture exactly once.
const textured=astral.build(5,{surfaces:{stone:{width:16,height:16},space:{width:32,height:16}}}),textures=new Set([textured.scene.background]);
textured.scenery.traverse(o=>{if(o.material?.map)textures.add(o.material.map);if(o.material?.bumpMap)textures.add(o.material.bumpMap);});assert.equal(textures.size,2);
let textureDisposals=0;textures.forEach(t=>t.addEventListener('dispose',()=>textureDisposals++));textured.dispose();textured.dispose();assert.equal(textureDisposals,textures.size);
console.log('PASS: deterministic four-zone world, irregular paving and island surfaces, actual corridor/support bounds, finite geometry, bounded meshes, textured/fallback resource disposal.');
