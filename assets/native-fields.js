/* Native scenery recovered from the public RagnaGO map packages. See tools/native-fields/README.md. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();else root.PGNativeFields=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const NAMES=['prontera','izlude','geffen','morocc','payon','comodo','louyang','amatsu','gl_chyard','hu_fild05'];
const BASE='assets/native-fields/v1/';
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
const hash=(x,z,s)=>{let h=Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^Math.imul(s|0,1442695041);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967295};
// Outdoor hunting fields. Hills differ in direction, scale and position per destination.
const DESIGNS=[
 {name:'Prontera meadow',path:3.8,bend:5,phase:.3,hills:[[-9,-16,5.4,15,17],[12,10,3.8,13,15],[23,-20,4.6,12,18]],valley:[2,-2,-1.5,10,20]},
 {name:'Izlude coastal grassland',path:3.2,bend:8,phase:1.6,hills:[[11,-18,4.8,16,14],[-9,11,2.8,12,18],[27,5,3.8,10,23]],water:{x:-24,z:-12,rx:9,rz:17,level:.35}},
 {name:'Geffen wooded ridge',path:3,bend:7,phase:2.4,hills:[[-11,-7,6.5,12,24],[15,-24,4.6,13,16],[17,15,3,17,10]],valley:[5,-4,-1.4,9,25]},
 {name:'Morocc dunes',path:0,bend:0,phase:0,hills:[[-9,-17,6.2,19,10],[13,4,4.4,16,11],[-20,24,5.6,21,10]],valley:[0,-4,-1.3,28,7]},
 {name:'Payon forest hills',path:2.8,bend:9,phase:.9,hills:[[-12,-20,6.8,13,16],[13,3,5.4,12,19],[-14,23,4.8,16,13]],valley:[-1,-6,-1.6,9,25]},
 {name:'Comodo jungle hollow',path:2.8,bend:7,phase:3.5,hills:[[-10,1,5.2,13,21],[14,-21,6,15,14],[21,18,4.4,15,16]],water:{x:25,z:2,rx:10,rz:16,level:.25}},
 {name:'Louyang mountain field',path:2.6,bend:9,phase:2,hills:[[-11,-24,8,15,15],[14,1,6.4,12,20],[-17,20,5,14,17]],valley:[0,-4,-1.7,8,26]},
 {name:'Amatsu wild meadow',path:3,bend:6,phase:4.2,hills:[[9,-15,5.2,16,19],[-14,13,3.8,14,18],[-25,-24,4.6,16,15]],water:{x:25,z:-16,rx:8,rz:14,level:.3}},
 {name:'Niflheim dead hollow',path:3.2,bend:5,phase:2.8,hills:[[-14,-14,5.8,13,19],[13,9,5.4,12,18],[21,-28,6,16,12]],valley:[0,-9,-1.8,9,24]},
 {name:'Abyss rocky basin',path:3.5,bend:8,phase:1.2,hills:[[-11,-23,7,16,13],[13,8,5.8,13,17],[26,-17,6.4,13,20]],water:{x:-25,z:1,rx:10,rz:15,level:.2}}
];
const GRID=72,STEP=90/GRID;
const mound=(x,z,h)=>h[2]*Math.exp(-(((x-h[0])/h[3])**2+((z-h[1])/h[4])**2));
function pondRadius(w,x,z){const angle=Math.atan2((z-w.z)/w.rz,(x-w.x)/w.rx);return Math.hypot((x-w.x)/w.rx,(z-w.z)/w.rz)/(1+.09*Math.sin(angle*3)+.05*Math.cos(angle*5))}
function terrainHeight(map,x,z){
 const d=DESIGNS[map];let y=1.1;
 for(const h of d.hills)y+=mound(x,z,h);
 if(d.valley)y+=mound(x,z,d.valley);
 // Low rolling undulations break up large slopes without making bumpy floors.
 y+=.16*Math.sin(x*.17+map)*Math.cos(z*.13-map*.4);
 if(d.water){const r=pondRadius(d.water,x,z),mix=1-smooth(.55,1.3,r);y=y*(1-mix)+(d.water.level-1.05)*mix}
 return y;
}
function heightAt(map,x,z){
 // Interpolate the exact rendered triangles so feet meet the sloping mesh, including diagonals.
 const gx=Math.max(0,Math.min(GRID-1e-8,(x+45)/STEP)),gz=Math.max(0,Math.min(GRID-1e-8,(z+45)/STEP)),ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz,xx=ix*STEP-45,zz=iz*STEP-45;
 const a=terrainHeight(map,xx,zz),b=terrainHeight(map,xx+STEP,zz),c=terrainHeight(map,xx,zz+STEP),e=terrainHeight(map,xx+STEP,zz+STEP);
 return u+v<=1?a+(b-a)*u+(c-a)*v:e+(c-e)*(1-u)+(b-e)*(1-v);
}
function pathCenter(map,z){const d=DESIGNS[map];return d.bend*Math.sin(z*.055+d.phase)+2*Math.sin(z*.12+d.phase*.6)}
function placements(map,stage,plan,record){
 const result=[],d=DESIGNS[map];
 function add(role,x,z,width,angle){
  const model=record.models[role];if(!model)return;
  const maxHeight=role==='tree'||role==='tree2'?8:role==='rock'?4:role==='stump'?2.5:1.8,scale=Math.min(width/Math.max(model.size[0],model.size[2]),maxHeight/Math.max(.01,model.size[1])),co=Math.abs(Math.cos(angle)),si=Math.abs(Math.sin(angle)),rx=(model.size[0]*co+model.size[2]*si)*scale/2,rz=(model.size[0]*si+model.size[2]*co)*scale/2;
  // Large silhouettes frame the hunting field; small plants can reach its margins.
  const margin=['tree','tree2','rock','stump'].includes(role)?14.8:13.4;
  if(Math.abs(x)-rx<margin&&z+rz>-29&&z-rz<14)return;
  if(Math.abs(x)+rx>43||Math.abs(z)+rz>43)return;
  if(d.water&&pondRadius(d.water,x,z)<1.35+Math.max(rx/d.water.rx,rz/d.water.rz))return;
  if(result.some(p=>Math.abs(p.x-x)<p.rx+rx+.4&&Math.abs(p.z-z)<p.rz+rz+.4))return;
  // Embed the foot slightly into the lowest corner of a slope; no hovering roots.
  const y=Math.min(heightAt(map,x,z),heightAt(map,x-rx*.45,z-rz*.45),heightAt(map,x+rx*.45,z+rz*.45))-.08;
  result.push({role,x,z,rx,rz,scale,angle,y});
 }
 const roles=Object.keys(record.models).filter(r=>['tree','tree2','rock','shrub','stump','detail'].includes(r));
 // Sparse asymmetric groups, varied spacing and scale; never rows of town plots.
 for(let i=0;i<140;i++){
  const r=hash(i,13,map+71),side=i%2?-1:1,x=side*(17+hash(i,2,map+3)*22),z=-38+hash(i,5,map+7)*74;
  const role=roles[Math.floor(r*roles.length)],width=role==='tree'||role==='tree2'?4.3+hash(i,4,map)*3:role==='rock'?3+hash(i,6,map)*3.5:role==='stump'?1.6+hash(i,8,map):.65+hash(i,9,map)*1.3;
  add(role,x,z,width,hash(i,3,map)*Math.PI*2);
  if(result.length>=42)break;
 }
 // A few low native plants along the field edge give close-up detail without hiding mobs.
 for(let i=0;i<14;i++)add(i%3?'shrub':'detail',(i%2?-1:1)*(14.8+hash(i,1,map)), -25+hash(i,7,map)*37,.55+hash(i,9,map)*.65,hash(i,2,map)*6.28);
 return result;
}
function surface(plan,image,map,props){
 const cv=document.createElement('canvas');cv.width=cv.height=2048;const ctx=cv.getContext('2d'),d=DESIGNS[map],patterns={};
 for(const [i,role] of ['base','patch','road','cliff'].entries()){
  const c=document.createElement('canvas');c.width=c.height=512;const tile=c.getContext('2d');
  const inset=role==='road'?64:0;for(let z=0;z<2;z++)for(let x=0;x<2;x++){tile.save();tile.translate(x?512:0,z?512:0);tile.scale(x?-1:1,z?-1:1);tile.drawImage(image,i*256+inset,inset,256-inset*2,256-inset*2,0,0,256,256);tile.restore()}
  patterns[role]=ctx.createPattern(c,'repeat');
 }
 ctx.fillStyle=patterns.base;ctx.fillRect(0,0,2048,2048);
 // One connected winding dirt trail with a soft shoulder, rather than separate painted cells.
 if(d.path){
  const layer=document.createElement('canvas');layer.width=layer.height=2048;const g=layer.getContext('2d');g.fillStyle=patterns.road;g.fillRect(0,0,2048,2048);
  const mask=document.createElement('canvas');mask.width=mask.height=512;const mg=mask.getContext('2d'),pixels=mg.createImageData(512,512);
  for(let j=0;j<512;j++){const z=j/512*90-45,c=pathCenter(map,z),width=d.path*(1+.12*Math.sin(z*.11));for(let i=0;i<512;i++){const x=i/512*90-45,k=(j*512+i)*4,edge=Math.abs(x-c),alpha=(1-smooth(width*.65,width+1.6,edge))*.78;pixels.data[k]=pixels.data[k+1]=pixels.data[k+2]=255;pixels.data[k+3]=Math.round(alpha*255)}}
  mg.putImageData(pixels,0,0);g.globalCompositeOperation='destination-in';g.drawImage(mask,0,0,2048,2048);ctx.drawImage(layer,0,0);
 }
 for(const p of props){const x=(p.x+45)*2048/90,z=(p.z+45)*2048/90,r=2048/90*Math.max(.4,Math.min(4,p.rx)),g=ctx.createRadialGradient(x,z,0,x,z,r);g.addColorStop(0,'rgba(16,23,14,.24)');g.addColorStop(1,'rgba(16,23,14,0)');ctx.fillStyle=g;ctx.fillRect(x-r,z-r,r*2,r*2)}
 return cv;
}
function terrainGeometry(THREE,map){
 const positions=[],uv=[],colors=[],indices=[];
 for(let z=0;z<=GRID;z++)for(let x=0;x<=GRID;x++){
  const xx=x*STEP-45,zz=z*STEP-45,y=terrainHeight(map,xx,zz),shade=.9+.075*Math.sin(xx*.065+zz*.047+map)+.025*y;
  positions.push(xx,y,zz);uv.push(x/GRID,1-z/GRID);colors.push(shade,shade,shade);
 }
 for(let z=0;z<GRID;z++)for(let x=0;x<GRID;x++){const a=z*(GRID+1)+x,b=a+1,c=a+GRID+1,e=c+1;indices.push(a,c,b,b,c,e)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function createStore(options={}){
 const fetcher=options.fetcher||((...args)=>fetch(...args)),loadImage=options.loadImage||(url=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Native image unavailable: '+url));im.src=url}));
 const entries=new Map();let catalog=null;
 const getJSON=async url=>{const r=await fetcher(url);if(!r.ok)throw Error('Native scenery unavailable: '+url);return r.json()};
 async function ensure(map){
  if(!NAMES[map])return null;
  if(entries.has(map)){const value=entries.get(map);entries.delete(map);entries.set(map,value);return value.promise}
  const entry={ready:null,promise:null};entries.set(map,entry);
  entry.promise=(async()=>{
   if(!catalog)catalog=getJSON(BASE+'catalog.json').catch(e=>{catalog=null;throw e});
   const cat=await catalog,record=cat.maps.find(r=>r.name===NAMES[map]);if(!record||cat.schema!==1||record.stride!==10)throw Error('Unsupported native scenery');
   const dir=BASE+record.name+'/',[terrain,atlas,response]=await Promise.all([loadImage(dir+'terrain.png'),loadImage(dir+'models.webp'),fetcher(dir+'models.bin')]);
   if(!response.ok)throw Error('Native geometry unavailable');const vertices=new Float32Array(await response.arrayBuffer());
   if(vertices.length%record.stride||!vertices.every(Number.isFinite))throw Error('Invalid native geometry');
   for(const model of Object.values(record.models))if(model.first<0||model.count<3||(model.first+model.count)*record.stride>vertices.length)throw Error('Invalid native model range');
   entry.ready={record,terrain,atlas,vertices};
   // Keep at most two decoded field sets; live worlds own and dispose their GPU resources.
   for(const [key,value] of entries){if(entries.size<=2)break;if(key!==map&&value.ready)entries.delete(key)}
   return entry.ready;
  })().catch(e=>{entries.delete(map);throw e});return entry.promise;
 }
 return{ensure,ready:map=>entries.get(map)?.ready||null,diagnostics:()=>({cached:[...entries].filter(([,v])=>v.ready).map(([k])=>k)})};
}
function build(THREE,asset,map,stage,plan){
 const root=new THREE.Group(),geometries=new Set(),materials=new Set(),textures=new Set();root.userData.nativeField={map,stage,source:NAMES[map]};
 const ownGeo=g=>(geometries.add(g),g),ownMat=m=>(materials.add(m),m),ownTex=t=>(textures.add(t),t);
 const props=placements(map,stage,plan,asset.record),floor=ownGeo(terrainGeometry(THREE,map));
 const floorMap=ownTex(new THREE.CanvasTexture(surface(plan,asset.terrain,map,props)));floorMap.anisotropy=4;floorMap.magFilter=THREE.LinearFilter;floorMap.minFilter=THREE.LinearMipmapLinearFilter;
 const floorMesh=new THREE.Mesh(floor,ownMat(new THREE.MeshLambertMaterial({map:floorMap,color:0xb0b0b0,vertexColors:true})));floorMesh.receiveShadow=true;root.add(floorMesh);
 const water=DESIGNS[map].water;
 if(water){
  // Irregular natural pond. The sloping ground occludes the disk to form the shore.
  const positions=[water.x,water.level,water.z],indices=[],segments=80;
  for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2,r=1.3*(1+.09*Math.sin(a*3)+.05*Math.cos(a*5));positions.push(water.x+Math.cos(a)*water.rx*r,water.level,water.z+Math.sin(a)*water.rz*r);if(i)indices.push(0,i+1,i)}
  const geometry=ownGeo(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,ownMat(new THREE.MeshPhongMaterial({color:map===9?0x345d62:0x528a8c,shininess:70,transparent:true,opacity:.85})));mesh.userData.nativePond=true;root.add(mesh);
 }
 const atlas=ownTex(new THREE.Texture(asset.atlas));atlas.flipY=false;atlas.magFilter=THREE.LinearFilter;atlas.minFilter=THREE.LinearMipmapLinearFilter;atlas.anisotropy=4;atlas.needsUpdate=true;
 const mat=ownMat(new THREE.MeshBasicMaterial({map:atlas,vertexColors:true,side:THREE.DoubleSide,alphaTest:.35}));
 // Source UVs may intentionally extend outside their atlas region. Clamp per fragment,
 // as the reference renderer does, to prevent neighbouring textures leaking onto walls.
 mat.onBeforeCompile=shader=>{
  shader.vertexShader='attribute vec4 sourceBounds; varying vec4 nativeBounds;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nnativeBounds=sourceBounds;');
  shader.fragmentShader='varying vec4 nativeBounds;\n'+shader.fragmentShader;
  const mapFragment=THREE.ShaderChunk.map_fragment.replace('texture2D( map, vUv )','texture2D( map, clamp(vUv,nativeBounds.xy,nativeBounds.zw) )');
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',mapFragment);
 };
 const modelGeos={};
 for(const p of props){
  if(!modelGeos[p.role]){
   const model=asset.record.models[p.role],g=ownGeo(new THREE.BufferGeometry()),position=[],uv=[],colors=[],bounds=[];
   for(let i=model.first*10;i<(model.first+model.count)*10;i+=10){const v=asset.vertices;position.push(v[i],v[i+1],v[i+2]);uv.push(v[i+3],v[i+4]);const shade=.58+.42*v[i+5];colors.push(shade,shade,shade);bounds.push(v[i+6],v[i+7],v[i+8],v[i+9]);}
   g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('sourceBounds',new THREE.Float32BufferAttribute(bounds,4));modelGeos[p.role]=g;
  }
  const mesh=new THREE.Mesh(modelGeos[p.role],mat);mesh.scale.setScalar(p.scale);mesh.rotation.y=p.angle;mesh.position.set(p.x,p.y,p.z);mesh.userData.nativeProp=p;root.add(mesh);
 }
 // This world owns the smooth field terrain, natural props and ponds.
 return{root,props,floorMap,trackTextures:maps=>maps.forEach(t=>textures.add(t)),diagnostics:{map,stage,models:props.length,triangles:[...geometries].reduce((sum,g)=>sum+(g.index?g.index.count:g.attributes.position.count)/3,0)},dispose(){
  root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const material of (Array.isArray(o.material)?o.material:[o.material])){materials.add(material);if(material.map)textures.add(material.map)}});
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();if(root.parent)root.parent.remove(root);
 }};
}
return{NAMES,DESIGNS,heightAt,terrainHeight,pathCenter,placements,terrainGeometry,createStore,build};
});
