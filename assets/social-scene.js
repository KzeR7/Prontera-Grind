/* Native scenery and sprites in an independent scene. Farming keeps its own scene/state. */
window.PGSocialScene={async create(host,labels,callbacks){
 const T=THREE,R=PGSocialRules,scene=new T.Scene();scene.background=new T.Color(0xb9cbbb);scene.fog=new T.Fog(0xb9cbbb,120,230);
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));host.append(renderer.domElement);
 try {
 const DEFAULT_PITCH=45,DEFAULT_DISTANCE=44;
 const camera=new T.PerspectiveCamera(38,1,.1,350),players=new Map();let angle=0,pitch=DEFAULT_PITCH,distance=DEFAULT_DISTANCE,active=false,last=0,clock=0,focused=false,viewW=0,viewH=0;
 const focus=new T.Vector3(0,.8,12),target=new T.Vector3(),feet=new T.Vector3(),head=new T.Vector3();
 const freeze=mesh=>{mesh.updateMatrix();mesh.matrixAutoUpdate=false;return mesh};
 // Bridges register their arch here (v308) so the player pass can stand feet on the deck.
 const bridges=[],bridgeDecks=[];
 const bridgeLift=(x,z)=>{
  for(const b of bridges){
   if(Math.abs(x-b.x)>b.span/2||Math.abs(z-b.z)>b.width/2)continue;
   const t=(x-b.x+b.span/2)/b.span;
   return 4*b.arch*t*(1-t);
  }
  // v359: the spectator stands are sittable, so feet climb the tiers with the boards.
  if(R.BLEACHER_ROWS)for(const row of R.BLEACHER_ROWS){
   if(x<row.x1||x>row.x2||z<row.z1||z>row.z2)continue;
   return row.height;
  }
  // The ring platform has a raised canvas; keep player and follower feet above it.
  const ring=R.SANCTUARY_RING;if(ring&&Math.abs(x-ring.x)<=ring.w/2&&Math.abs(z-ring.z)<=ring.d/2)return ring.height;
  return 0;
 };
 scene.add(new T.HemisphereLight(0xffffff,0x66775a,1));
 const [catalog,data,atlas,paving]=await Promise.all([fetch('assets/social/town/catalog.json').then(r=>{if(!r.ok)throw Error('Town metadata unavailable');return r.json()}),fetch('assets/social/town/models.bin').then(r=>{if(!r.ok)throw Error('Town models unavailable');return r.arrayBuffer()}),new T.TextureLoader().loadAsync('assets/social/town/models.webp'),new T.TextureLoader().loadAsync('assets/social/town/paving.webp')]);
 atlas.flipY=false;atlas.magFilter=T.LinearFilter;const modelMat=new T.MeshBasicMaterial({map:atlas,vertexColors:true,side:T.DoubleSide,alphaTest:.35});
 modelMat.onBeforeCompile=shader=>{shader.vertexShader='attribute vec4 sourceBounds; varying vec4 nativeBounds;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nnativeBounds=sourceBounds;');shader.fragmentShader='varying vec4 nativeBounds;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','vec4 texelColor = texture2D(map, clamp(vUv, nativeBounds.xy, nativeBounds.zw)); texelColor = mapTexelToLinear(texelColor); diffuseColor *= texelColor;')};
 const floats=new Float32Array(data),geometries={};
 const sourceKeys=new WeakMap();let sourceKeySeq=0;
function sourceKey(source){let k=sourceKeys.get(source);if(!k){k='src'+(++sourceKeySeq)+':';sourceKeys.set(source,k)}return k}
function model(name,x,z,size,rotation=0,source=catalog,vertices=floats,material=modelMat){const cacheKey=sourceKey(source)+name;const rec=source.models[name];if(!geometries[cacheKey]){const g=new T.BufferGeometry(),p=[],uv=[],color=[],bounds=[];for(let i=rec.first;i<rec.first+rec.count;i++){const v=vertices.subarray(i*10,i*10+10);p.push(v[0],v[1],v[2]);uv.push(v[3],v[4]);color.push(.58+.42*v[5],.58+.42*v[5],.58+.42*v[5]);bounds.push(...v.slice(6,10))}g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('color',new T.Float32BufferAttribute(color,3));g.setAttribute('sourceBounds',new T.Float32BufferAttribute(bounds,4));g.computeBoundingSphere();geometries[cacheKey]=g}const mesh=new T.Mesh(geometries[cacheKey],material);mesh.scale.setScalar(size/Math.max(rec.size[0],rec.size[2]));mesh.position.set(x,0,z);mesh.rotation.y=rotation;scene.add(freeze(mesh));return mesh}
 const makeBatch=()=>({p:[],uv:[],color:[],bounds:[]});
 function pushModel(batch,name,x,z,size,rotation=0,source=catalog,vertices=floats){
  const rec=source.models[name],s=size/Math.max(rec.size[0],rec.size[2]),c=Math.cos(rotation)*s,sn=Math.sin(rotation)*s;
  for(let i=rec.first;i<rec.first+rec.count;i++){const o=i*10,vx=vertices[o],vy=vertices[o+1],vz=vertices[o+2],shade=.58+.42*vertices[o+5];
   batch.p.push(vx*c+vz*sn+x,vy*s,-vx*sn+vz*c+z);batch.uv.push(vertices[o+3],vertices[o+4]);
   batch.color.push(shade,shade,shade);batch.bounds.push(vertices[o+6],vertices[o+7],vertices[o+8],vertices[o+9]);}
 }
 function addBatch(batch,material){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(batch.p,3));g.setAttribute('uv',new T.Float32BufferAttribute(batch.uv,2));g.setAttribute('color',new T.Float32BufferAttribute(batch.color,3));g.setAttribute('sourceBounds',new T.Float32BufferAttribute(batch.bounds,4));g.computeBoundingSphere();const mesh=freeze(new T.Mesh(g,material));scene.add(mesh);return mesh}
 // Source paving pixels are sampled from a padded native atlas tile. Push the
 // ground slightly back in depth so water stays solid even from distant views.
 paving.flipY=false;const tile=document.createElement('canvas');tile.width=tile.height=256;tile.getContext('2d').drawImage(paving.image,16,16,256,256,0,0,256,256);const stone=new T.CanvasTexture(tile);stone.wrapS=stone.wrapT=T.RepeatWrapping;stone.repeat.set(20*192/164,20*218/164);const ground=new T.Mesh(new T.PlaneGeometry(192,218),new T.MeshBasicMaterial({map:stone,color:0xe4e2cf,polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:2}));ground.rotation.x=-Math.PI/2;ground.position.set(14,-.02,27);scene.add(freeze(ground));
 const plazaTile=document.createElement('canvas');plazaTile.width=plazaTile.height=256;plazaTile.getContext('2d').drawImage(paving.image,16,304,256,256,0,0,256,256);const plazaTex=new T.CanvasTexture(plazaTile);plazaTex.wrapS=plazaTex.wrapT=T.RepeatWrapping;plazaTex.repeat.set(10,10);const plaza=new T.Mesh(new T.PlaneGeometry(62,62),new T.MeshBasicMaterial({map:plazaTex,color:0xe1d9c7}));plaza.rotation.x=-Math.PI/2;plaza.position.y=.01;scene.add(freeze(plaza));
 const roadTexture=plazaTex.clone();roadTexture.repeat.set(3,26*192/164);roadTexture.needsUpdate=true;const roadTextureSouth=plazaTex.clone();roadTextureSouth.repeat.set(3,26*218/164);roadTextureSouth.needsUpdate=true;// v359: both avenues pull toward the camera in depth so the fountain's paved/grass apron
 // and the base ground can never shimmer through them, whatever the viewing angle.
 const roadMat=new T.MeshBasicMaterial({map:roadTexture,color:0xe6dfcf,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),roadMatSouth=new T.MeshBasicMaterial({map:roadTextureSouth,color:0xe6dfcf,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});for(const turn of [0,Math.PI/2]){const road=new T.Mesh(new T.PlaneGeometry(18,turn===0?218:192),turn===0?roadMatSouth:roadMat);road.rotation.x=-Math.PI/2;road.rotation.z=turn;road.position.set(turn===0?0:14,turn===0?.001:.006,turn===0?27:0);scene.add(freeze(road))}
 // v360 (owner: "replace the social hub middle fountain with this" - the Prontera Grand
 // Aetherwell GLB committed under assets/Fountainfile/). The atlas fountain below stays
 // as the instant stand-in; when the vendored r128 GLTFLoader is present the centerpiece
 // swaps in over it - same philosophy as the digimon models: the fallback sprite shows
 // only when the browser says the GLB is dead. Collision lives in social-rules.js.
 // v361 (owner: "fountain size is too small ... i want them to be able to be seated"):
 // scale .382 -> .62 so the bench ring, paving and spire read at plaza camera distance,
 // and the model's own eight benches become real seats (R.FOUNTAIN_BENCHES).
 const fountainFallback=model('fountain',0,0,10);fountainFallback.userData.fountainFallback=true;
 const aetherwell={group:null,tried:false};
 // Model bounds (blender export): radial paving to +-14.84, bench centers at 12.81, solid
 // planter toe at 12.43, floating spire tip at 14.39. At .62 the benches land at 7.94 (the
 // sittable ring, R.FOUNTAIN_BENCHES), the planter toe at 7.71 just inside the shared
 // fountain collision (7.75 in R.walkable), and the paving lip at 9.2 - grand, but clear of
 // the plaza plane and the roads beneath it.
 const AETHERWELL_SCALE=.62,AETHERWELL_Y=.06;
 function mountAetherwell(gltf){
  const root=gltf.scene||(gltf.scenes&&gltf.scenes[0]);
  if(!root||typeof root.traverse!=='function')return false;
  root.scale.setScalar(AETHERWELL_SCALE);root.position.set(0,AETHERWELL_Y,0);
  root.userData.aetherwell=true;
  // v361 (owner: "why does the colour is off? where are the small details went?"): two
  // fidelity fixes the r128 pipeline needs. (1) The page renders straight to an unencoded
  // backbuffer, so the GLB's linear-space albedo displays dark; converting colour and
  // emissive to display space restores the authored tones. (2) r128's loader ignores
  // KHR_materials_emissive_strength, which is exactly where the small details live - the
  // luminous cyan aether (x2.3), the electric-blue inscriptions (x5.5) and the ice-white
  // motes (x7) were all glowing at plain strength. Both values are read from the export.
  const AETHER_STRENGTH={'Aether \u2022 luminous cyan':2.3,'Crystal inscriptions \u2022 electric blue':5.5,'Aether motes \u2022 ice white':7};
  let spire=null,inverted=null,motes=null,crystalMat=null;const shards=[];
  root.traverse(o=>{
   const n=o.name||'';
   if(n==='AETHER \u2022 main floating spire')spire=o;
   else if(n==='Floating inverted crystal')inverted=o;
   else if(n==='Aetherwell \u2022 Aether motes \u2022 ice white')motes=o;
   else if(/^Orbiting shard( detailed)? \d\d$/.test(n)){
    const r=Math.hypot(o.position.x,o.position.z);
    if(r>.05)shards.push({node:o,a0:Math.atan2(o.position.z,o.position.x),r,y0:o.position.y,ph:shards.length*.9,w:/detailed/.test(n)?-.32:.26});
   }
   if(o.isMesh&&o.material){
    for(const m of Array.isArray(o.material)?o.material:[o.material]){
     if(!m.userData.aetherTuned){
      m.userData.aetherTuned=true;
      if(m.color&&m.color.convertLinearToSRGB)m.color.convertLinearToSRGB();
      if(m.emissive&&m.emissive.convertLinearToSRGB)m.emissive.convertLinearToSRGB();
      if(AETHER_STRENGTH[m.name])m.emissiveIntensity=AETHER_STRENGTH[m.name];
      if(m.isMeshStandardMaterial)m.envMapIntensity=.9;
     }
    }
    if(/Crystal facet 0/.test(o.material.name||''))crystalMat=o.material;
   }
  });
  aetherwell.group=root;aetherwell.spire=spire;aetherwell.spireY=spire?spire.position.y:0;
  aetherwell.inverted=inverted;aetherwell.invertedY=inverted?inverted.position.y:0;
  aetherwell.motes=motes;aetherwell.shards=shards;aetherwell.crystalMat=crystalMat||null;
  scene.add(root);
  fountainFallback.visible=false;
  // v361: the model's eight benches are real seats (R.FOUNTAIN_BENCHES, ids 112-127). Their
  // click pads join the shared seatTargets only on a live mount, so a dead GLB never leaves
  // invisible benches to click. Flat slabs like the bleachers: nearest-hit wins after NPCs.
  for(const seat of R.FOUNTAIN_BENCHES){
   seatTargets.push({seat:seat.id,bench:seat.bench,bounds:new T.Box3(new T.Vector3(seat.x-.55,.3,seat.z-.55),new T.Vector3(seat.x+.55,1.05,seat.z+.55))});
  }
  // PBR metals render near-black without something to reflect; feed them a tiny daytime
  // sky gradient. Only MeshStandardMaterial samples scene.environment, so the flat-colour
  // town (MeshBasicMaterial) and the Lambert props are untouched.
  try{
   if(T.PMREMGenerator&&renderer.isWebGLRenderer&&!scene.environment){
    const c=document.createElement('canvas');c.width=64;c.height=32;const g=c.getContext('2d');
    if(g&&g.createLinearGradient){
     const grad=g.createLinearGradient(0,0,0,32);
     grad.addColorStop(0,'#cfe6ff');grad.addColorStop(.52,'#f2ead6');grad.addColorStop(.6,'#9db08a');grad.addColorStop(1,'#66784f');
     g.fillStyle=grad;g.fillRect(0,0,64,32);
     const tex=new T.CanvasTexture(c);tex.mapping=T.EquirectangularReflectionMapping;
     const pm=new T.PMREMGenerator(renderer);scene.environment=pm.fromEquirectangular(tex).texture;
     tex.dispose();pm.dispose();
    }
   }
  }catch(e){/* losing the env only dulls the brass; the town itself is unlit by design */}
  return true;
 }
 function loadAetherwell(){
  if(aetherwell.tried)return;aetherwell.tried=true;
  if(typeof T.GLTFLoader!=='function')return; // vendored loader absent: keep the atlas fountain
  try{
   new T.GLTFLoader().load('assets/Fountainfile/Prontera_Grand_Aetherwell.glb',gltf=>{
    try{if(!mountAetherwell(gltf))console.warn('Aetherwell GLB had no scene - keeping the plaza fountain')}
    catch(e){console.warn('Aetherwell mount failed - keeping the plaza fountain',e)}
   },undefined,()=>console.warn('Aetherwell unavailable - keeping the plaza fountain'));
  }catch(e){console.warn('Aetherwell load failed - keeping the plaza fountain',e)}
 }
 // The GLB exports no animation tracks; the aether turns in code instead - the spire
 // bobs and rotates, the shard rings orbit against each other, the crystals breathe.
 // Absolute time math keeps it deterministic for the scene sim.
 function animateAetherwell(now){
  if(!aetherwell.group)return;
  const t=now/1000;
  if(aetherwell.spire){aetherwell.spire.position.y=aetherwell.spireY+Math.sin(t*.85)*.16;aetherwell.spire.rotation.y=t*.22}
  if(aetherwell.inverted){aetherwell.inverted.position.y=aetherwell.invertedY+Math.sin(t*.85+2.4)*.11;aetherwell.inverted.rotation.y=-t*.3}
  if(aetherwell.motes)aetherwell.motes.rotation.y=t*.05;
  for(const s of aetherwell.shards){s.node.position.x=Math.cos(s.a0+t*s.w)*s.r;s.node.position.z=Math.sin(s.a0+t*s.w)*s.r;s.node.position.y=s.y0+Math.sin(t*1.2+s.ph)*.07;s.node.rotation.y=t*s.w*2.2}
  if(aetherwell.crystalMat)aetherwell.crystalMat.emissiveIntensity=.85+.25*Math.sin(t*1.9);
 }
 for(const b of R.BUILDINGS)model(b.name,b.x,b.z,b.size,b.rotation||0);
 // Sanctuary: arranged south of the plaza from the owner's highlighted lawn.
 // Architecture and named NPCs share the world with the local training prototype.
 const loadTile=async(name,rx=1,ry=1)=>{try{const t=await new T.TextureLoader().loadAsync('assets/digimon/sanctuary/'+name+'.webp');t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(rx,ry);t.anisotropy=4;return t}catch(e){console.warn('DigiPet texture unavailable:',name);return null}};
 const [roofTexture,boardTexture,sandTexture,plasterTexture,beamTexture,doorTexture]=await Promise.all([loadTile('cc0/roof_09',2,2),loadTile('walkway-wood'),loadTile('gym-sand',6,3),loadTile('gym-plaster',4,1),loadTile('cc0/medieval_wood'),loadTile('cc0/rough_pine_door')]);
 const wood=new T.MeshLambertMaterial({map:beamTexture,color:0xc3a27d}),darkWood=new T.MeshLambertMaterial({map:beamTexture,color:0x997954}),lightWood=new T.MeshLambertMaterial({color:0xb58a59}),metal=new T.MeshLambertMaterial({color:0x5f6860}),iron=new T.MeshLambertMaterial({color:0x303a36}),cream=new T.MeshLambertMaterial({color:0xe8d9ba}),plaster=new T.MeshLambertMaterial({map:plasterTexture,color:0xf1e7d0}),roofMat=new T.MeshLambertMaterial({map:roofTexture,color:0xe0c8a4,side:T.DoubleSide});
 function flat(geometry,material,x,z,y){const m=new T.Mesh(geometry,material);m.rotation.x=-Math.PI/2;m.position.set(x,y,z);scene.add(freeze(m));return m}
 function box(x,y,z,w,h,d,mat){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);scene.add(freeze(m));return m}
 function beam(a,b,thick,mat=darkWood){const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz);const m=new T.Mesh(new T.CylinderGeometry(thick,thick,len,4),mat);m.position.set((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(dx/len,dy/len,dz/len));scene.add(freeze(m));return m}
 function worldSign(x,y,z,text,width=3.3,height=.65){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');if(ctx&&typeof ctx.fillRect==='function'&&typeof ctx.fillText==='function'){ctx.fillStyle='#e7d6ab';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#64432a';ctx.lineWidth=12;ctx.strokeRect(7,7,498,114);ctx.fillStyle='#4a2d1d';ctx.font='bold 43px serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,65,470)}const m=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshBasicMaterial({map:new T.CanvasTexture(c),side:T.DoubleSide}));m.position.set(x,y,z);m.userData.sanctuarySign=text;scene.add(freeze(m));return m}
 // Wide wooden circulation joins the avenue and runs between the kiosks and field.
 function boardwalk(x,z,w,d,y=.025){let texture=boardTexture?.clone();if(texture){texture.repeat.set(Math.max(.5,w/7),Math.max(.5,d/7));texture.needsUpdate=true}const m=flat(new T.PlaneGeometry(w,d),new T.MeshBasicMaterial({map:texture,color:0xe7c797}),x,z,y);m.userData.sanctuaryBoardwalk=true;return m}
 // Short angled runs create a gentle meander while preserving broad walkable junctions.
 for(const [i,[x1,z1,x2,z2]] of [[35,42,35,50],[35,50,38,62],[38,62,36,75],[36,75,38,84],[38,84,36,104],[36,104,37,120]].entries()){
  const m=boardwalk((x1+x2)/2,(z1+z2)/2,5,Math.hypot(x2-x1,z2-z1)+1,.025+i*.0002);m.rotation.z=Math.atan2(x2-x1,z2-z1);m.updateMatrix();
 }
 boardwalk(22,42,26,4.8,.027);boardwalk(66,42,62,4.8,.029);boardwalk(65,84.5,60,5,.029);boardwalk(65,120,60,4,.029);
 // Two angled building wings with broad roofs meet at a short central bay.
 // Their footprint and wall collision come from the same shared segments.
 function gable(cx,cz,w,d,eave,rise){const half=w/2,ang=Math.atan2(rise,half);for(const side of [-1,1]){const m=box(cx+side*half/2,eave+rise/2,cz,Math.hypot(half,rise)+.45,.24,d,roofMat);m.rotation.z=-side*ang;m.updateMatrix();m.userData.sanctuaryRoof=true}for(const z of [cz-d/2,cz+d/2]){beam([cx-half,eave,z],[cx,eave+rise,z],.18);beam([cx,eave+rise,z],[cx+half,eave,z],.18)}}
 if(window.PGSocialGymRedesign){await window.PGSocialGymRedesign.build(scene)}else{
 const sandMat=new T.MeshBasicMaterial({map:sandTexture,color:0xe8d6b4});
 const gymShape=new T.Shape();for(const [i,[x,z]] of [[43,18.5],[65,12.5],[73,12.5],[95,18.5],[95,39],[43,39]].entries()){if(i)gymShape.lineTo(x-69,-(z-25.5));else gymShape.moveTo(x-69,-(z-25.5))}gymShape.closePath();
 flat(new T.ShapeGeometry(gymShape),sandMat,69,25.5,.018).userData.sanctuaryGym=true;
 const gymStone=new T.MeshLambertMaterial({color:0x9e9a83});
 const glass=new T.MeshLambertMaterial({color:0x485e55}),windowShine=new T.MeshBasicMaterial({color:0xc7c488});
 // Gabled roofs for the two small kiosks elsewhere in the Sanctuary.
 function gable(cx,cz,w,d,eave,rise){const half=w/2,ang=Math.atan2(rise,half);for(const side of [-1,1]){const m=box(cx+side*half/2,eave+rise/2,cz,Math.hypot(half,rise)+.45,.24,d,roofMat);m.rotation.z=-side*ang;m.updateMatrix();m.userData.sanctuaryRoof=true}for(const z of [cz-d/2,cz+d/2]){beam([cx-half,eave,z],[cx,eave+rise,z],.18);beam([cx,eave+rise,z],[cx+half,eave,z],.18)}}
 // Each wing is placed in its own coordinate frame along the shared angled
 // wall. Its roof, timbers, windows and foundation all rotate together.
 for(const [wing,seg] of [['left',R.SANCTUARY_GYM_WALLS[0]],['right',R.SANCTUARY_GYM_WALLS[2]]]){
  const dx=seg.x2-seg.x1,dz=seg.z2-seg.z1,len=Math.hypot(dx,dz),theta=Math.atan2(-dz,dx),c=Math.cos(theta),sn=Math.sin(theta),cx=(seg.x1+seg.x2)/2,cz=(seg.z1+seg.z2)/2;
  const point=(u,y,v)=>[cx+c*u+sn*v,y,cz-sn*u+c*v];
  const piece=(u,y,v,w,h,d,mat)=>{const [x,Y,z]=point(u,y,v),m=box(x,Y,z,w,h,d,mat);m.rotation.y=theta;m.updateMatrix();return m};
  const brace=(a,b,thick,mat=darkWood)=>beam(point(...a),point(...b),thick,mat);
  piece(0,.55,0,len,1.1,.8,gymStone);
  const wall=piece(0,5.15,0,len,8.2,.5,plaster);wall.userData.gymWing=wing;
  piece(0,10.75,0,len,2,.5,plaster).userData.gymUpperWall=wing;
  for(const face of [-1,1]){
   const v=face*.32;
   for(let i=0;i<=4;i++){const u=-len/2+i*len/4;piece(u,5,v,.42,10,.23,darkWood).userData.gymTimber='rear-post';piece(u,10.8,v,.32,2.1,.24,darkWood)}
   for(const y of [1.05,4.45,8.8,9.8,11.8])piece(0,y,v,len,.28,.24,darkWood).userData.gymTimber='rear-beam';
   for(let i=0;i<4;i++){const u=-len/2+(i+.5)*len/4;brace([u-len/8+.22,1.15,v],[u+len/8-.22,4.28,v],.16);brace([u+len/8-.22,1.15,v],[u-len/8+.22,4.28,v],.16)}
   for(const u of [-len/4,len/4]){
    piece(u,6.65,v+face*.14,2.45,2.55,.13,darkWood).userData.gymWindow='rear';
    piece(u,6.65,v+face*.22,1.95,2.05,.07,glass);piece(u,6.65,v+face*.28,.11,2.05,.08,lightWood);piece(u,6.65,v+face*.28,1.95,.11,.08,lightWood);
    piece(u-.48,7.08,v+face*.33,.42,.42,.035,windowShine);piece(u,5.32,v+face*.32,2.8,.18,.4,lightWood);
   }
  }
  for(let i=0;i<11;i++){const stone=piece(-len/2+(i+.5)*len/11,.54,.43,len/11-.08,.82,.12,i%3===0?cream:gymStone);stone.userData.gymMasonry=true}
  // Broad sloping shingle plane shelters each wing OUTSIDE the open yard.
  const rise=2.3,depth=6.5,angle=Math.atan2(rise,depth);
  const roof=piece(0,10.75,-depth/2,len+.6,.24,Math.hypot(depth,rise)+.4,roofMat);roof.rotation.set(-angle,theta,0,'YXZ');roof.updateMatrix();roof.userData.sanctuaryRoof=true;roof.userData.sanctuaryBuildingWing=wing;roof.userData.gymBroadRoof=true;
  brace([-len/2-.2,11.9,0],[len/2+.2,11.9,0],.2);brace([-len/2-.2,9.6,-depth],[len/2+.2,9.6,-depth],.18);
  for(let i=0;i<=4;i++){const u=-len/2+i*len/4;brace([u,9.65,-depth],[u,11.9,0],.14)}
 }
 // The back connector reads as an entrance between the two buildings.
 box(69,.55,12.5,8,1.1,.8,gymStone);box(69,5.15,12.5,8,8.2,.5,plaster);
 for(const x of [65,73])box(x,5.1,12.84,.48,10.2,.3,darkWood);
 for(const y of [1.05,5.15,8.8,9.9])box(69,y,12.85,8,.3,.28,darkWood);
 // Finish the street-facing side too: no unframed plaster block behind the connector.
 for(const x of [65,69,73])box(x,5.1,12.16,.38,10.2,.26,darkWood);
 for(const y of [1.05,4.45,8.8,9.9])box(69,y,12.16,8,.26,.25,darkWood);
 for(const [x1,x2] of [[65.3,68.7],[69.3,72.7]]){beam([x1,1.2,12.15],[x2,4.25,12.15],.13);beam([x2,1.2,12.15],[x1,4.25,12.15],.13)}

 const doorMat=new T.MeshLambertMaterial({map:doorTexture,color:0xe8d4ad});
 box(69,3.05,12.83,4.4,5.1,.16,darkWood);box(69,3.05,12.94,3.85,4.55,.1,doorMat);box(69,3.05,13.01,.15,4.6,.1,darkWood);
 for(const dx of [-.3,.3]){const knob=new T.Mesh(new T.SphereGeometry(.12,10,6),new T.MeshLambertMaterial({color:0xc5a15a}));knob.position.set(69+dx,2.7,13.1);scene.add(freeze(knob))}
 // The exterior flank walls are shorter than the open training yard, with
 // real timber visible on both sides rather than a flat dark roof over it.
 for(const x of [43,95]){
  box(x,.55,23.75,.8,1.1,10.5,gymStone);box(x,5.15,23.75,.5,8.2,10.5,plaster);
  for(const face of [-1,1]){
   const xx=x+face*.32;
   for(const z of [18.5,21,23.75,26.5,29])box(xx,5,z,.23,10,.4,darkWood).userData.gymTimber='side-post';
   for(const y of [1.05,4.45,8.8,9.8])box(xx,y,23.75,.24,.28,10.5,darkWood).userData.gymTimber='side-beam';
   for(const z of [20.5,24,27]){beam([xx,1.15,z-1.7],[xx,4.27,z+1.7],.15);beam([xx,1.15,z+1.7],[xx,4.27,z-1.7],.15)}
   for(const z of [22,26]){
    box(xx+face*.14,6.65,z,.13,2.55,2.45,darkWood).userData.gymWindow='side';
    box(xx+face*.22,6.65,z,.07,2.05,1.95,glass);box(xx+face*.28,6.65,z,.08,2.05,.1,lightWood);box(xx+face*.28,6.65,z,.08,.1,1.95,lightWood);
    box(xx+face*.32,7.05,z-.48,.035,.4,.42,windowShine);box(xx+face*.32,5.32,z,.4,.18,2.8,lightWood);
   }
  }
 }
 // Each flank terminates in a full timbered gable, with a usable doorway.
 for(const [cx,side] of [[46,-1],[92,1]]){
  for(const dx of [-2.25,2.25])box(cx+dx,3,29,1.5,6,.45,plaster);
  box(cx,7.8,29,6,3.6,.45,plaster);
  for(const x of [cx-3,cx-1.45,cx+1.45,cx+3])box(x,4.8,29.32,.32,9.6,.24,darkWood).userData.gymTimber='front-post';
  for(const y of [1,6,8.8,9.6])box(cx,y,29.34,6.4,.25,.2,darkWood);
  // Framed attic windows and substantial corner blocks complete the end bay.
  for(const dx of [-1.45,1.45]){box(cx+dx,7.45,29.34,1.4,1.8,.12,darkWood);box(cx+dx,7.45,29.43,1.06,1.4,.07,glass);box(cx+dx,7.45,29.48,.1,1.4,.05,lightWood);box(cx+dx,7.45,29.48,1.06,.1,.05,lightWood);box(cx+dx,6.48,29.5,1.62,.15,.3,lightWood)}
  for(const x of [cx-2.8,cx+2.8])box(x,.48,29.35,.5,.95,.3,cream);

  for(const x of [cx-2.25,cx+2.25])beam([x-.65,1.2,29.36],[x+.65,5.65,29.36],.13);
  const triangle=new T.Shape();triangle.moveTo(-3,9.6);triangle.lineTo(0,11.9);triangle.lineTo(3,9.6);triangle.closePath();
  const face=new T.Mesh(new T.ShapeGeometry(triangle),new T.MeshLambertMaterial({map:plasterTexture,color:0xf1e7d0,side:T.DoubleSide}));face.position.set(cx,0,29.27);face.userData.gymGable=side<0?'left':'right';scene.add(freeze(face));
  beam([cx-3,9.6,29.38],[cx,11.9,29.38],.2);beam([cx,11.9,29.38],[cx+3,9.6,29.38],.2);beam([cx,9.7,29.4],[cx,11.8,29.4],.14);
  // A complete broad pitched roof caps each gabled end bay.
  const angle=Math.atan2(2.3,3);for(const slope of [-1,1]){const roof=box(cx+slope*1.5,10.75,23.75,Math.hypot(3,2.3)+.35,.22,11.3,roofMat);roof.rotation.z=-slope*angle;roof.updateMatrix();roof.userData.sanctuaryRoof=true;roof.userData.sanctuaryBuildingWing=side<0?'left':'right';roof.userData.gymBroadRoof=true}
  for(const z of [19,21.5,24,26.5,29]){beam([cx-3,9.6,z],[cx,11.9,z],.13);beam([cx,11.9,z],[cx+3,9.6,z],.13)}
 }
 // Fence follows the proposed front boundary, leaving the middle entrance open.
 for(const f of R.SANCTUARY_GYM_FENCES){const dx=f.x2-f.x1,dz=f.z2-f.z1,len=Math.hypot(dx,dz),n=Math.max(1,Math.ceil(len/3.2));for(let i=0;i<=n;i++){const t=i/n;box(f.x1+dx*t,.7,f.z1+dz*t,.22,1.4,.22,darkWood)}for(const y of [.45,1.05])beam([f.x1,y,f.z1],[f.x2,y,f.z2],.085,wood).userData.gymFence=true}
 worldSign(69,7.1,13.08,'DIGIPET GYM',6,.72);
 // v356 (owner: "gym definitely need to be redesigned"): the open court is zoned like a real
 // training floor. Each apparatus group sits on its own rubber mat with a cream keyline, a
 // painted medallion marks the entrance bay, stat-coloured banners hang from both wings, and
 // two pennant strings cross the yard so the space reads as a designed gymnasium.
 const zoneMats={power:new T.MeshLambertMaterial({color:0xb0684f}),guard:new T.MeshLambertMaterial({color:0x5f7d95}),agility:new T.MeshLambertMaterial({color:0xc9a256}),focus:new T.MeshLambertMaterial({color:0x7d9a6a})};
 // v359: the zone mats and the entrance medallion interlock around their stations, so
 // every overlapping flat in the yard sits on its own clear step of the ladder:
 // sand .018 < power .030 < guard .034 < medallion .040/.042/.044 < agility .046 < focus .050.
 for(const [zx,zz,zw,zd,stat,zy] of [[56.5,25.5,13,14.5,'power',.03],[63,22.6,10.6,8.8,'guard',.034],[75,26,10.6,11.6,'agility',.046],[86,25.6,10.6,13,'focus',.05]]){
  flat(new T.PlaneGeometry(zw,zd),zoneMats[stat],zx,zz,zy).userData.gymZone=stat;
  const y=.031;
  box(zx,y,zz-zd/2,zw+.24,.05,.16,cream);box(zx,y,zz+zd/2,zw+.24,.05,.16,cream);
  box(zx-zw/2,y,zz,.16,.05,zd,cream);box(zx+zw/2,y,zz,.16,.05,zd,cream);
 }
 // Entrance medallion: a painted roundel between the two wings.
 flat(new T.CircleGeometry(2.05,28),new T.MeshBasicMaterial({color:0xe7d6ab}),69,20.5,.04).userData.gymMedallion=true;
 flat(new T.RingGeometry(1.55,1.8,28),new T.MeshBasicMaterial({color:0x997954}),69,20.5,.042);
 flat(new T.CircleGeometry(.55,20),new T.MeshBasicMaterial({color:0xb0684f}),69,20.5,.044);
 // Stat banners on the court-facing wing walls.
 const bannerBar=new T.MeshLambertMaterial({color:0xb58a59});
 for(const [bx,bz,stat] of [[43.72,21,'power'],[43.72,25,'agility'],[43.72,29,'focus'],[94.28,21,'guard'],[94.28,25,'power'],[94.28,29,'agility']]){
  box(bx,3.35,bz,.1,.12,1.5,bannerBar);
  box(bx,2.3,bz,.09,2.1,1.12,zoneMats[stat]).userData.gymBanner=stat;
  box(bx,1.22,bz,.1,.12,1.24,cream);
 }
 // Two pennant strings across the open yard.
 const pennantColors=[0xb0684f,0xe7d6ab,0x5f7d95,0xc9a256,0x7d9a6a];
 const pennantShape=new T.Shape();pennantShape.moveTo(-.34,0);pennantShape.lineTo(.34,0);pennantShape.lineTo(0,-.95);pennantShape.closePath();
 for(const z of [16.2,33.8]){
  beam([44,4.35,z],[94,4.35,z],.05,darkWood);
  for(let i=1;i<21;i++){const x=44+i*2.5,m=new T.Mesh(new T.ShapeGeometry(pennantShape),new T.MeshLambertMaterial({color:pennantColors[i%5],side:T.DoubleSide}));m.position.set(x,4.3,z);scene.add(freeze(m))}
 }
 // Weight rack, barbells and benches: POWER.
 for(const x of [49,55])box(x,1.6,19,.25,3.2,.25,darkWood);for(const y of [.65,1.45,2.25])box(52,y,19,6,.14,.24,wood);
 for(let row=0;row<3;row++)for(const x of [50,51.2,52.4,53.6,54.5]){const d=new T.Mesh(new T.CylinderGeometry(.32,.32,.2,12),iron);d.rotation.z=Math.PI/2;d.position.set(x,.9+row*.8,19);scene.add(freeze(d))}
 for(const x of [49,55])box(x,.85,25,.23,1.7,.23,wood);box(52,1.55,25,6,.15,.15,iron);
 for(const x of [49.5,54.5]){const d=new T.Mesh(new T.CylinderGeometry(.68,.68,.25,16),iron);d.rotation.z=Math.PI/2;d.position.set(x,1.55,25);scene.add(freeze(d))}
 box(52,.48,29,3.5,.23,1.1,darkWood);for(const x of [50.8,53.2])box(x,.23,29,.18,.46,.7,wood);
 // Wooden padded striking dummy: GUARD.
 box(63,.15,21,2.2,.3,2.2,darkWood);box(63,1.4,21,.4,2.8,.4,wood);const dummy=new T.Mesh(new T.CylinderGeometry(.7,.85,2,12),new T.MeshLambertMaterial({color:0xa48157}));dummy.position.set(63,2.1,21);scene.add(freeze(dummy));for(const dx of [-1,1])beam([63+dx*.25,2.3,21],[63+dx*1.2,1.9,21],.15,wood);

 for(const x of [60,66]){box(x,.15,21,1.8,.3,1.8,darkWood);box(x,1.4,21,.35,2.8,.35,wood);const d=new T.Mesh(new T.CylinderGeometry(.6,.72,2,12),new T.MeshLambertMaterial({color:0xa48157}));d.position.set(x,2.1,21);scene.add(freeze(d));for(const side of [-1,1])beam([x+side*.2,2.3,21],[x+side*.95,1.9,21],.12,wood)}
 for(let i=0;i<3;i++)box(60+i*.8,.18,28, .55,.35,.55,darkWood);
 // Obstacles, low hurdles and balance beam: AGILITY.
 for(const lane of [72,75,78])for(const z of [22,26,30]){for(const x of [lane-1.1,lane+1.1])box(x,.65,z,.18,1.3,.18,wood);box(lane,1.2,z,2.2,.16,.16,lightWood)}
 box(80,.5,29, .28,1,4,darkWood);box(80,1,29,.8,.2,5,wood);
 // Target board, hanging rings and two green practice mats: FOCUS.
 for(const x of [84,89])box(x,2.1,18,.25,4.2,.25,darkWood);box(86.5,3.5,18,5,.18,.18,wood);
 const targetDisc=new T.Mesh(new T.CylinderGeometry(1.25,1.25,.15,24),cream);targetDisc.rotation.x=Math.PI/2;targetDisc.position.set(86.5,2.3,18.1);scene.add(freeze(targetDisc));
 for(const [rad,color] of [[.75,0xaa684d],[.32,0x493225]]){const disc=new T.Mesh(new T.CylinderGeometry(rad,rad,.17,24),new T.MeshLambertMaterial({color}));disc.rotation.x=Math.PI/2;disc.position.set(86.5,2.3,18.19);scene.add(freeze(disc))}
 for(const x of [83,86,89])flat(new T.PlaneGeometry(2.7,4.2),new T.MeshBasicMaterial({color:0x849b6f}),x,27,.032);
 for(const [x,name] of [[52,'power'],[63,'guard'],[75,'agility'],[86,'focus']]){const marker=box(x,.03,34,.02,.02,.02,wood);marker.userData.sanctuaryStation=name}
 // Recognisable training fixtures and individual stored items, not flat floor markers.
 for(const x of [48.5,56]){box(x,1.65,23,.22,3.3,.22,darkWood);box(x,3.25,24,.22,.18,2.5,darkWood)}box(52.25,3.15,24.7,7.7,.18,.2,wood);
 for(const x of [48.8,55.7]){const plate=new T.Mesh(new T.CylinderGeometry(.55,.55,.18,16),iron);plate.rotation.z=Math.PI/2;plate.position.set(x,2.6,24.7);scene.add(freeze(plate))}
 for(const x of [59.5,66.5]){box(x,.5,24,.18,1,.18,wood);box(x,1,24,1.8,.14,.14,wood)}
 for(const x of [52.5,56.5,60.5,65]){const bag=new T.Mesh(new T.CylinderGeometry(.36,.4,1.3,12),new T.MeshLambertMaterial({color:0xa67955}));bag.position.set(x,1.5,30.5);scene.add(freeze(bag));box(x,.48,30.5,.16,.96,.16,darkWood);box(x,.06,30.5,1.4,.12,1.1,wood)}
 for(const z of [19,21]){box(71,.13,z,1.8,.2,.25,wood);box(74,.13,z,1.8,.2,.25,wood);box(77,.13,z,1.8,.2,.25,wood)}
 for(const x of [84,86,88])for(const z of [31,32.2]){const d=new T.Mesh(new T.CylinderGeometry(.3,.3,.24,12),iron);d.rotation.z=Math.PI/2;d.position.set(x,.3,z);scene.add(freeze(d))}

 // Stored equipment, pulley and hanging bags fill the training courtyard.
 for(const x of [56,58,60]){box(x,.5,17.3,1.4,1,1,wood);beam([x-.65,.05,17.85],[x+.65,.95,17.85],.08,lightWood)}
 for(const x of [78.5,81.2]){box(x,2.6,16,.14,5.2,.14,darkWood);box(x,5.05,16,2.8,.15,.2,wood);const bag=new T.Mesh(new T.CylinderGeometry(.48,.52,1.8,12),new T.MeshLambertMaterial({color:0x87634d}));bag.position.set(x+.9,3.35,16);scene.add(freeze(bag));beam([x+.9,4.3,16],[x+.9,5,16],.045,iron)}
 for(const x of [47.5,49,50.5]){const d=new T.Mesh(new T.CylinderGeometry(.35,.35,.15,12),iron);d.rotation.z=Math.PI/2;d.position.set(x,.45,31.5);scene.add(freeze(d))}
 for(const x of [55,67,79,90]){box(x,.22,36,5,.3,.5,wood);for(const dx of [-1.9,1.9])box(x+dx,.12,36,.15,.24,.4,darkWood)}

 }
 // Bevelled grassy field with matching shared, gated fence geometry.
 const fieldTex=stone.clone();fieldTex.repeat.set(1/7,1/7);fieldTex.needsUpdate=true;const fieldMat=new T.MeshBasicMaterial({map:fieldTex,color:0xc8dda8});
 const shape=new T.Shape();for(const [i,[x,z]] of [[44,52],[49,47],[91,47],[96,52],[96,76],[91,81],[49,81],[44,76]].entries()){const px=x-70,py=-(z-64);if(!i)shape.moveTo(px,py);else shape.lineTo(px,py)}shape.closePath();
 flat(new T.ShapeGeometry(shape),fieldMat,70,64,.021).userData.sanctuaryField=true;
 const flowerColors=[0xe8d49b,0xf2c8b8,0xe8e9db];for(let i=0;i<50;i++){const x=49+(i*29%42),z=50+(i*17%28);const f=new T.Mesh(new T.SphereGeometry(.10,5,4),new T.MeshBasicMaterial({color:flowerColors[i%3]}));f.position.set(x,.12,z);scene.add(freeze(f))}
 for(const f of R.SANCTUARY_FENCES){const dx=f.x2-f.x1,dz=f.z2-f.z1,len=Math.hypot(dx,dz),count=Math.max(1,Math.ceil(len/3.5));for(let i=0;i<=count;i++){const t=i/count;box(f.x1+dx*t,.72,f.z1+dz*t,.22,1.44,.22,darkWood)}for(const y of [.48,1.04])beam([f.x1,y,f.z1],[f.x2,y,f.z2],.09,wood).userData.sanctuaryFence=true}
 // Hand-built food cart and two separate future NPC stations, on the avenue side of the walk.
 function wheel(x,z){const m=new T.Mesh(new T.CylinderGeometry(.7,.7,.18,14),darkWood);m.rotation.z=Math.PI/2;m.position.set(x,.6,z);scene.add(freeze(m));const hub=new T.Mesh(new T.CylinderGeometry(.24,.24,.2,12),lightWood);hub.rotation.z=Math.PI/2;hub.position.set(x+.11,.6,z);scene.add(freeze(hub))}
 function kiosk(x,z,kind){
  box(x,.72,z,5,1.05,3.5,wood).userData.sanctuaryKiosk=kind;box(x,1.28,z,5.3,.16,3.8,lightWood);
  for(const dx of [-2.2,2.2])for(const dz of [-1.4,1.4])box(x+dx,2.2,z+dz,.22,3.5,.22,darkWood);
  if(kind==='food'){
   for(let i=0;i<8;i++)box(x-2.3+i*.66,4.02,z,.66,.18,4,i%2?cream:new T.MeshLambertMaterial({color:0xa45f43}));
   for(const dx of [-2.6,2.6])for(const dz of [-1.2,1.2])wheel(x+dx,z+dz);
   for(const [dx,color] of [[-1.4,0xc65b40],[-.7,0xd3a35c],[0,0x91a451],[.7,0xc87d42],[1.4,0xcc6655]]){box(x+dx,1.41,z,.58,.18,1.1,darkWood);for(const zz of [-.3,.05,.35]){const fruit=new T.Mesh(new T.SphereGeometry(.19,8,6),new T.MeshLambertMaterial({color}));fruit.position.set(x+dx,1.65,z+zz);scene.add(freeze(fruit))}}
  }else{
   gable(x,z,5.5,4.2,4,1.05);box(x,2.7,z-1.6,4.4,1.2,.18,plaster);
   for(const dx of [-1.1,0,1.1])box(x+dx,1.42,z,.8,.2,1.1,kind==='guide'?cream:metal);
  }
  worldSign(x,3.1,z+1.75,kind==='food'?'FOOD - PET SHOP':kind==='trainer'?'TRAINER - DIGIPET':'FIELD GUIDE - DIGIDEX',4,.65);
 }
 kiosk(22,41,'food');kiosk(22,56,'trainer');kiosk(22,72,'guide');
 // Awnings, shelving, painted shop signs and merchandise distinguish the stalls.
 const canvasBlue=new T.MeshLambertMaterial({color:0x648484}),canvasRed=new T.MeshLambertMaterial({color:0xa96349});
 for(const [z,color] of [[56,canvasBlue],[72,canvasRed]]){for(let i=0;i<7;i++){const m=box(19.75+i*.75,3.75,z+1.9,.75,.13,1.5,i%2?cream:color);m.rotation.x=.16;m.updateMatrix()}for(const x of [20.2,23.8])box(x,1.9,z-1.53,.15,1.5,.15,darkWood);for(const y of [1.65,2.25])box(22,y,z-1.48,3.8,.13,.45,lightWood)}
 for(const z of [55.8,71.8])for(const x of [20.6,21.4,22.2,23,23.8]){box(x,1.78,z-.95,.42,.22,.48,z===71.8?cream:wood);box(x,2.38,z-.95,.36,.18,.38,z===71.8?lightWood:metal)}
 for(const z of [56,72]){box(22,1.38,z+1.91,5.4,.18,.48,lightWood);for(const x of [20.4,21.4,22.4,23.4]){box(x,1.55,z+1.9,.65,.2,.45,z===72?cream:metal);box(x,1.75,z+1.9,.42,.2,.3,z===72?lightWood:wood)}}
 // Hanging decorative notices and small wood framed notices for the guide.
 for(const z of [56,72]){for(const x of [19.4,24.6]){box(x,2.35,z+1.85,.24,1.2,.18,darkWood);box(x,2.38,z+1.98,.14,.8,.12,z===56?canvasBlue:canvasRed)}}
 for(const x of [16.5,27.5]){box(x,2,69.2,2.3,1.3,.06,cream);for(let i=0;i<4;i++)box(x,2.35-i*.23,69.25,1.7,.035,.025,darkWood)}
 // Lanterns and small pennants along the service strip.
 for(const z of [49,64,79,90]){box(31,1.7,z,.18,3.4,.18,darkWood);box(31,3.55,z,.6,.16,.6,darkWood);box(31,3.15,z,.42,.65,.42,new T.MeshBasicMaterial({color:0xf4d58d}));box(31,2.78,z,.58,.12,.58,darkWood)}
 // Bulletin boards, crates and barrels make the guide and cart readable at player scale.
 for(const [x,z] of [[16.5,69],[27.5,69]]){box(x,1,z,.18,2,.18,darkWood);box(x,2,z,2.6,1.8,.16,lightWood);box(x,2,z+.1,2.2,1.4,.05,cream)}
 for(const [x,z] of [[18,43],[26.5,44],[18,74]]){const barrel=new T.Mesh(new T.CylinderGeometry(.55,.65,1.2,12),wood);barrel.position.set(x,.6,z);scene.add(freeze(barrel));for(const h of [.2,.95]){const hoop=new T.Mesh(new T.TorusGeometry(.57,.05,5,12),iron);hoop.rotation.x=Math.PI/2;hoop.position.set(x,h,z);scene.add(freeze(hoop))}}
 // Roped ring on grass, with heavy timber corner posts, steps and three-sided stands.
 const ring=R.SANCTUARY_RING;
 const ringGrass=stone.clone();ringGrass.repeat.set(48/7,27/7);ringGrass.needsUpdate=true;
 flat(new T.PlaneGeometry(48,27),new T.MeshBasicMaterial({map:ringGrass,color:0xc8dda8}),71,105,.018).userData.sanctuaryRing=true;
 box(ring.x,.35,ring.z,ring.w,.7,ring.d,darkWood);box(ring.x,.74,ring.z,ring.w-.3,.12,ring.d-.3,cream);
 // Woven canvas and piping prevent the ring from reading as a blank square.
 const ringCanvas=document.createElement('canvas');ringCanvas.width=ringCanvas.height=512;const rctx=ringCanvas.getContext('2d');
 if(rctx&&typeof rctx.fillRect==='function'){rctx.fillStyle='#e9dfcb';rctx.fillRect(0,0,512,512);for(let i=0;i<1024;i++){const x=(i*67)%512,y=(i*131)%512;rctx.fillStyle=i%2?'rgba(125,107,84,.035)':'rgba(255,255,255,.09)';rctx.fillRect(x,y,1+(i%3),1)}if(typeof rctx.strokeRect==='function'){rctx.strokeStyle='rgba(124,104,79,.35)';rctx.lineWidth=3;rctx.strokeRect(12,12,488,488)}}
 // v356: champion canvas - concentric medallion and diagonally split corner wedges, painted
 // into the same woven base so the ring floor stops reading as a blank square of cloth.
 if(rctx&&typeof rctx.beginPath==='function'&&typeof rctx.arc==='function'){
  rctx.save();rctx.translate(256,256);
  rctx.fillStyle='rgba(122,90,61,.22)';rctx.beginPath();rctx.arc(0,0,118,0,Math.PI*2);rctx.fill();
  rctx.strokeStyle='rgba(122,90,61,.5)';rctx.lineWidth=7;rctx.beginPath();rctx.arc(0,0,126,0,Math.PI*2);rctx.stroke();
  rctx.lineWidth=4;rctx.beginPath();rctx.arc(0,0,88,0,Math.PI*2);rctx.stroke();
  rctx.fillStyle='rgba(122,90,61,.4)';rctx.beginPath();rctx.arc(0,0,34,0,Math.PI*2);rctx.fill();
  rctx.fillStyle='rgba(150,60,48,.3)';rctx.beginPath();rctx.moveTo(-256,-256);rctx.lineTo(-150,-256);rctx.lineTo(-256,-150);rctx.closePath();rctx.fill();
  rctx.beginPath();rctx.moveTo(256,256);rctx.lineTo(150,256);rctx.lineTo(256,150);rctx.closePath();rctx.fill();
  rctx.fillStyle='rgba(72,102,128,.3)';rctx.beginPath();rctx.moveTo(256,-256);rctx.lineTo(150,-256);rctx.lineTo(256,-150);rctx.closePath();rctx.fill();
  rctx.beginPath();rctx.moveTo(-256,256);rctx.lineTo(-150,256);rctx.lineTo(-256,150);rctx.closePath();rctx.fill();
  rctx.restore();
 }
 const canvasTex=new T.CanvasTexture(ringCanvas);flat(new T.PlaneGeometry(ring.w-.4,ring.d-.4),new T.MeshBasicMaterial({map:canvasTex}),ring.x,ring.z,.806).userData.ringCanvas=true;
 // v356: red and blue corner pads on the turnbuckles, an apron skirt, ringside floodlight
 // masts, a timekeeper's bell and a champion board - the boxing ring reads as a venue.
 const padRed=new T.MeshLambertMaterial({color:0xa8433a}),padBlue=new T.MeshLambertMaterial({color:0x46698c});
 for(const x of [ring.x-ring.w/2,ring.x+ring.w/2])for(const z of [ring.z-ring.d/2,ring.z+ring.d/2])for(const y of [1.3,2,2.7]){
  const corner=Math.sign(x-ring.x)*Math.sign(z-ring.z)>0?padRed:padBlue;
  box(x,y,z,.62,.2,.62,corner).userData.ringPad=Math.sign(x-ring.x)*Math.sign(z-ring.z)>0?'red':'blue';box(x,y,z,.68,.05,.68,wood);
 }
 const apronMat=new T.MeshLambertMaterial({color:0x7e3c34});
 for(const z of [ring.z-ring.d/2-.1,ring.z+ring.d/2+.1])box(ring.x,.4,z,ring.w-.1,.5,.16,apronMat).userData.ringApron=true;
 for(const x of [ring.x-ring.w/2-.1,ring.x+ring.w/2+.1])box(x,.4,ring.z,.16,.5,ring.d-.1,apronMat).userData.ringApron=true;
 for(const x of [56,80]){
  box(x,3.1,92.5,.2,6.2,.2,darkWood).userData.ringLight=true;
  box(x,6.05,92.5,.9,.4,.5,metal);box(x,5.9,92.75,1.5,.22,.7,darkWood);
  box(x-.28,5.82,92.9,.34,.3,.34,new T.MeshBasicMaterial({color:0xf4d58d}));box(x+.28,5.82,92.9,.34,.3,.34,new T.MeshBasicMaterial({color:0xf4d58d}));
 }
 // Timekeeper's bell on a short post by the west steps.
 box(ring.x-ring.w/2-2.1,.75,ring.z+2.6,.14,1.5,.14,darkWood);
 box(ring.x-ring.w/2-2.1,1.52,ring.z+2.6,.5,.08,.14,darkWood);
 const bellMat=new T.MeshLambertMaterial({color:0xc5a15a});
 const bellBody=new T.Mesh(new T.CylinderGeometry(.16,.24,.26,10),bellMat);bellBody.position.set(ring.x-ring.w/2-2.1,1.42,ring.z+2.72);scene.add(freeze(bellBody));
 const bellCap=new T.Mesh(new T.SphereGeometry(.1,8,6),bellMat);bellCap.position.set(ring.x-ring.w/2-2.1,1.56,ring.z+2.72);scene.add(freeze(bellCap));
 const bellHammer=new T.Mesh(new T.SphereGeometry(.06,6,5),metal);bellHammer.position.set(ring.x-ring.w/2-2.32,1.42,ring.z+2.72);scene.add(freeze(bellHammer));
 worldSign(ring.x,1.5,ring.z+ring.d/2+2.35,'CHAMPION RING',4.6,.62);
 for(const z of [ring.z-ring.d/2+.28,ring.z+ring.d/2-.28])box(ring.x,.815,z,ring.w-.7,.03,.06,lightWood);
 for(const x of [ring.x-ring.w/2+.28,ring.x+ring.w/2-.28])box(x,.815,ring.z,.06,.03,ring.d-.7,lightWood);
 // Face boards and corner hardware add depth under the ropes.
 for(const z of [ring.z-ring.d/2-.015,ring.z+ring.d/2+.015]){for(const y of [.2,.48])box(ring.x,y,z,ring.w-.5,.09,.04,lightWood);for(const x of [ring.x-6,ring.x,ring.x+6])box(x,.34,z,.1,.52,.05,wood)}
 for(const x of [ring.x-ring.w/2,ring.x+ring.w/2])for(const z of [ring.z-ring.d/2,ring.z+ring.d/2]){box(x,1.85,z,.46,3.7,.46,darkWood);box(x,3.8,z,.66,.25,.66,lightWood)}
 for(const h of [1.3,2,2.7]){for(const z of [ring.z-ring.d/2,ring.z+ring.d/2])box(ring.x,h,z,ring.w,.1,.1,h===2?cream:wood);for(const x of [ring.x-ring.w/2,ring.x+ring.w/2])box(x,h,ring.z,.1,.1,ring.d,h===2?cream:wood)}
 for(const x of [ring.x-ring.w/2,ring.x+ring.w/2])for(const z of [ring.z-ring.d/2,ring.z+ring.d/2])for(const y of [1.3,2,2.7]){box(x,y,z,.62,.2,.62,cream);box(x,y,z,.68,.05,.68,wood)}

 // v357 (owner: "enter only from the stairs"): the west mouth is the one way up, so it is
 // built as a real entrance - three treads with side rails and a red runner - while the
 // shared rules block the ropes everywhere else.
 for(let i=0;i<3;i++)box(ring.x-ring.w/2-1.2+i*.4,.12+i*.12,ring.z,.45,.24+i*.24,3.2,wood);
 for(const dz of [-1.7,1.7]){box(ring.x-ring.w/2-1,.42,ring.z+dz,2.4,.14,.16,darkWood);for(const dx of [-1.1,1.1])box(ring.x-ring.w/2-1+dx,.24,ring.z+dz,.14,.48,.14,lightWood)}
 flat(new T.PlaneGeometry(1.5,2.9),new T.MeshBasicMaterial({color:0x8e3b32}),ring.x-ring.w/2-.2,ring.z,.58).userData.ringRunner=true;
 // Level, regularly spaced bleacher tiers, with a real mitred corner.
 // v359: the boards are the sittable rows (shared BLEACHER_ROWS carry the seats); a low
 // rear wall on each run and the solid corner are the Worker collision, so spectators
 // climb the tiers freely but cannot walk off the back.
 const standPlanks=boardTexture?.clone();if(standPlanks){standPlanks.repeat.set(1,3);standPlanks.needsUpdate=true}
 const standMat=new T.MeshLambertMaterial({map:standPlanks,color:0xd8bc92});
 for(let row=0;row<3;row++){
  const x0=81.7+row*1.05,z0=113.25+row*1.05,y=.55+row*.43,zStart=94.5,xStart=53.6;
  // Parallel boards have square, flush edges and a consistent height per tier.
  for(let p=0;p<3;p++){
   const east=box(x0+(p+.5)/3,y,(zStart+z0)/2,1/3-.015,.14,z0-zStart,standMat);east.userData.sanctuaryBleacher='east';east.userData.bleacherRow=row;
   // v359: the south boards shift half a step forward so each sitting row lands on a
   // whole pathfinding cell - the seats and the boards share the same line.
   const south=box((xStart+x0-1)/2,y,z0+.5+(p+.5)/3,x0-1-xStart,.14,1/3-.015,standMat);south.userData.sanctuaryBleacher='south';south.userData.bleacherRow=row;
  }
  // Horizontal trapezoid closes the 45-degree corner without skewed, floating planks.
  const shape=new T.Shape();for(const [i,[x,z]] of [[x0,z0],[x0+1,z0],[x0-1,z0+2],[x0-1,z0+1]].entries()){if(i)shape.lineTo(x,-z);else shape.moveTo(x,-z)}shape.closePath();
  const corner=flat(new T.ShapeGeometry(shape),standMat,0,0,y+.071);corner.userData.sanctuaryBleacher='corner';corner.userData.bleacherRow=row;
  for(const z of [95,99,103,107,111]){box(x0+.5,y/2,z,.18,y,.22,darkWood);box(x0+.5,y-.1,z,1,.14,.22,wood)}
  for(const x of [54,58,62,66,70,74,78]){box(x,y/2,z0+1,.22,y,.18,darkWood);box(x,y-.1,z0+1,.22,.14,1,wood)}
  box(x0-.28,y/2,z0+.7,.22,y,.22,darkWood);
 }
 // Back rail and posts terminate cleanly at a single bevel around the corner.
 for(const z of [94.5,99,103,107,111,115.3]){box(85.05,1.5,z,.22,3,.22,darkWood);box(85.05,3.05,z,.36,.14,.36,lightWood)}
 for(const y of [1.9,2.6]){box(85.05,y,104.9,.14,.14,20.8,wood);beam([85.05,y,115.3],[82.8,y,117.45],.09,wood)}
 for(const x of [53.6,58,63,68,73,78,82.8]){box(x,1.5,117.45,.22,3,.22,darkWood);box(x,3.05,117.45,.36,.14,.36,lightWood)}
 for(const y of [1.9,2.6])box(68.2,y,117.45,29.2,.14,.14,wood);

 const sanctuaryLabels=[{x:84,z:37,title:'GYM · LIVE TRAINING'},{x:48,z:48,title:'MIDDLE FIELD · AUTO GRINDING'},{x:49,z:92,title:'BOXING RING · TWO-PLAYER PVP'},...[ [59,27,'POWER'],[65,20,'GUARD'],[74,22,'AGILITY'],[84,24,'FOCUS'] ].map(([x,z,title])=>({x,z,title,station:title.toLowerCase()}))].map(pad=>{const el=document.createElement(pad.station?'button':'div'),entry={pad,el,hover:false,pressed:false};el.className='social-sanctuary-label';el.textContent=pad.title;if(pad.station){el.type='button';el.dataset.station=pad.station;el.title='Train '+pad.title.toLowerCase()+' at this station';el.onclick=()=>callbacks.trainStation?.(pad.station);
  // World projections move with the follow camera. Hold a station control still
  // while a mouse is over it or a touch is down so it cannot escape the click.
  el.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')entry.hover=true});el.addEventListener('pointerleave',()=>{entry.hover=false});el.addEventListener('pointerdown',()=>{entry.pressed=true});
 }labels.append(el);return entry});
 const releaseStationPointer=()=>{for(const entry of sanctuaryLabels)entry.pressed=false};
 addEventListener('pointerup',releaseStationPointer);addEventListener('pointercancel',releaseStationPointer);
 const digimonStore=globalThis.PGSocialDigimon?.sharedStore();
 // Idle, non-interactive companions dress the future meadow. They have no combat,
 // ownership, rewards or authority; the player's own follower remains independent.
 const residents=globalThis.PGSocialDigimon&&digimonStore?[['agumon',52,55],['palmon',60,70],['gabumon',77,58],['patamon',85,71]].map(([id,x,z],i)=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const texture=new T.CanvasTexture(canvas);texture.magFilter=texture.minFilter=T.NearestFilter;texture.generateMipmaps=false;
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthTest:true,alphaTest:.05}));sprite.center.set(.5,.25);sprite.scale.set(256*1.45/96,256*1.45/96,1);sprite.position.set(x,.06,z);sprite.userData.sanctuaryResident=id;scene.add(sprite);digimonStore.request(id);
  return {id,ctx:canvas.getContext('2d'),texture,sprite,frame:-1,flip:i%2===1,homeX:x,homeZ:z,phase:i*1.7};
 }):[];
 let battleState={pve:[],pvp:null};const battleParticipantIds=new Set(),battleResidents=new Map(),/* v359 (owner: "movements are too fast, I can't see the animations"): the run is a calm trot now */BATTLE_RUN_SPEED=3.2,BATTLE_RADIUS=4.1,PVP_RADIUS=2.2;
 const battleName=id=>globalThis.PGDigimonRoster?.name(id)||String(id||'Digimon');
 // v350 presentation ranges: the shared battle module classifies each form once from the
 // reproducible base-stat table, so every client agrees without extra messages.
 const battleRangeCache=new Map();
 function unitRange(species){let r=battleRangeCache.get(species);if(!r){r=globalThis.PGDigimonBattle?.attackRange?.(species)||{ranged:false,range:1.8};battleRangeCache.set(species,r)}return r}
 const battleShots=[];
 function spawnBattleShot(from,to,now,boss=false,enemy=false){
  if(battleShots.length>24)return;
  const col=boss?0xffd27a:enemy?0xef9c86:0xbfe8c6;
  const mesh=new T.Mesh(new T.SphereGeometry(boss?.2:.12,10,8),new T.MeshBasicMaterial({color:col,transparent:true,opacity:.95}));
  const tex=fxTex();
  const halo=new T.Sprite(new T.SpriteMaterial({map:tex.glow,color:col,transparent:true,opacity:.75,depthWrite:false,blending:T.AdditiveBlending}));
  halo.scale.setScalar(boss?1.1:.7);mesh.add(halo);
  mesh.position.set(from.x,.55,from.z);mesh.userData.battleShot=true;scene.add(mesh);
  battleShots.push({mesh,fromX:from.x,fromZ:from.z,toX:to.x,toZ:to.z,at:now,dur:460});
 }
 function updateBattleShots(now){
  for(let i=battleShots.length-1;i>=0;i--){const shot=battleShots[i],t=(now-shot.at)/shot.dur;
   if(t>=1){scene.remove(shot.mesh);shot.mesh.geometry.dispose();shot.mesh.material.dispose();battleShots.splice(i,1);continue}
   shot.mesh.position.set(shot.fromX+(shot.toX-shot.fromX)*t,.55,shot.fromZ+(shot.toZ-shot.fromZ)*t);
   shot.mesh.scale.setScalar(.8+.45*Math.sin(Math.PI*t));
   // A short pixel spark trail behind each travelling shot.
   if(now-(shot.sparkAt||0)>110){shot.sparkAt=now;spawnBattleBurst(shot.mesh.position.x,shot.mesh.position.z,shot.mesh.material.color.getHex(),1,.1,.09,300)}
  }
 }
 // ---------- v352 full-pixel battle FX ----------
 // Presentation only, and purely event-driven: the room (or the local solo loop) reports each
 // landed strike with its amount and crit flag, and the scene answers with readable pixel
 // feedback — burst particles, a floating damage number, a contact freeze and a shake on the
 // defender. Nothing here reads or touches authoritative combat state.
 const battleBursts=[],battlePopups=[],battleWaves=[];
// v373 (owner: "the attacks are too fast to see and the melee ones headbutt each other"): melee units hold
// MELEE_STANDOFF units from their target, and an attack keeps its swing for ATTACK_MS.
const MELEE_STANDOFF=3.0,ATTACK_MS=520;let fxTextures=null;
 // v357 (owner: "the battle FX are still boxes" - third request): every particle was an
 // 8x8 white square, so hits read as flying pixels of cardboard. The whole particle set is
 // redrawn as painted light: soft radial glows, tapered comet streaks that rotate with
 // their velocity, and four-point star sparkles for crits. The shockwave becomes a wide
 // soft ring with an alpha falloff instead of a hard-edged torus band. Everything still
 // paints onto small canvases with full feature guards, so headless scenes degrade
 // quietly to the plain fallback instead of throwing.
 function fxTex(){
  if(fxTextures)return fxTextures;
  const make=(size,draw)=>{const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');
   if(x&&typeof x.fillRect==='function'&&typeof x.beginPath==='function'&&typeof x.arc==='function'){draw(x,size);return new T.CanvasTexture(c)}
   return null};
  const glow=make(64,(x,n)=>{const cx=n/2;
   if(typeof x.createRadialGradient==='function'){const g=x.createRadialGradient(cx,cx,0,cx,cx,n/2);
    g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.35,'rgba(255,255,255,.85)');g.addColorStop(.7,'rgba(255,255,255,.28)');g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g;x.fillRect(0,0,n,n)}
   else{for(let i=8;i>0;i--){x.fillStyle='rgba(255,255,255,'+(i/9)+')';x.beginPath();x.arc(cx,cx,n/2*i/8,0,Math.PI*2);x.fill()}}});
  const streak=make(64,(x,n)=>{
   if(typeof x.createLinearGradient==='function'){const g=x.createLinearGradient(0,0,n,0);
    g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.75,'rgba(255,255,255,.9)');g.addColorStop(1,'rgba(255,255,255,1)');
    x.fillStyle=g;x.beginPath();x.moveTo(0,n/2-3);x.lineTo(n*.72,n/2-7);x.lineTo(n,n/2);x.lineTo(n*.72,n/2+7);x.lineTo(0,n/2+3);x.closePath();x.fill()}
   else{x.fillStyle='rgba(255,255,255,.9)';x.beginPath();x.moveTo(0,n/2-3);x.lineTo(n,n/2);x.lineTo(0,n/2+3);x.closePath();x.fill()}});
  const star=make(64,(x,n)=>{const cx=n/2;x.fillStyle='rgba(255,255,255,.95)';
   for(let i=0;i<4;i++){const a=i*Math.PI/4;x.beginPath();
    x.moveTo(cx+Math.cos(a)*n*.46,cx+Math.sin(a)*n*.46);
    x.quadraticCurveTo(cx+Math.cos(a+.42)*n*.1,cx+Math.sin(a+.42)*n*.1,cx+Math.cos(a+Math.PI/4)*n*.46,cx+Math.sin(a+Math.PI/4)*n*.46);
    x.closePath();x.fill()}
   if(typeof x.createRadialGradient==='function'){const g=x.createRadialGradient(cx,cx,0,cx,cx,n*.16);
    g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,n,n)}
   else{x.fillStyle='rgba(255,255,255,.9)';x.beginPath();x.arc(cx,cx,n*.14,0,Math.PI*2);x.fill()}});
  // Fallbacks when no 2D painting is possible at all: a plain white disc beats a square.
  if(!glow){const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d');
   if(x&&typeof x.beginPath==='function'&&typeof x.arc==='function'){x.fillStyle='#fff';x.beginPath();x.arc(16,16,14,0,Math.PI*2);x.fill();glow=new T.CanvasTexture(c)}}
  fxTextures={glow,streak,star};
  return fxTextures;
 }
 function spawnBattleBurst(x,z,color,count,speed=.9,size=.11,dur=320){
  if(battleBursts.length>64)return;
  const tex=fxTex();
  for(let i=0;i<count;i++){
   const a=battleHash('burst:'+i+':'+x.toFixed(2)+':'+z.toFixed(2))*Math.PI*2,r=(.55+battleHash('br:'+i+':'+z.toFixed(2))* .45)*speed;
   // A mix of light: mostly soft glows, a third rotating streaks, and the first particle
   // of a big burst is always a star so crits read instantly.
   const star=i===0&&count>=11,streak=!star&&i%3===0;
   const mesh=new T.Sprite(new T.SpriteMaterial({map:star?tex.star:streak?tex.streak:tex.glow,color,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
   if(streak)mesh.material.rotation=a;
   mesh.position.set(x,.55,z);
   mesh.scale.setScalar(size*(.6+battleHash('bs:'+i+':'+x.toFixed(2))*.8));
   if(streak)mesh.scale.set(size*2.4,size*.7,1);
   if(star)mesh.scale.setScalar(size*2.6);
   mesh.userData.battleBurst=true;scene.add(mesh);
   battleBursts.push({mesh,vx:Math.cos(a)*r,vy:.9+battleHash('by:'+i+':'+x.toFixed(2))*1.2,vz:Math.sin(a)*r,at:clock,dur,last:clock});
  }
 }
 function spawnBattleShockwave(x,z,color=0xffd98a,dur=620){
  if(battleWaves.length>12)return;
  const c=document.createElement('canvas');c.width=c.height=128;const x2=c.getContext('2d');let tex=null;
  if(x2&&typeof x2.beginPath==='function'&&typeof x2.arc==='function'){
   for(let i=0;i<9;i++){x2.strokeStyle='rgba(255,255,255,'+(0.85-i*0.09)+')';x2.lineWidth=2+i*1.4;
    x2.beginPath();x2.arc(64,64,52-i*1.5,0,Math.PI*2);x2.stroke()}
   if(typeof x2.createRadialGradient==='function'){const g=x2.createRadialGradient(64,64,40,64,64,64);
    g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.85,'rgba(255,255,255,.25)');g.addColorStop(1,'rgba(255,255,255,0)');
    x2.fillStyle=g;x2.fillRect(0,0,128,128)}
   tex=new T.CanvasTexture(c);
  }
  const ring=tex?new T.Mesh(new T.PlaneGeometry(3.4,3.4),new T.MeshBasicMaterial({map:tex,color,transparent:true,opacity:.95,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending}))
   :new T.Mesh(new T.RingGeometry(.5,.66,26),new T.MeshBasicMaterial({color,transparent:true,opacity:.95,side:T.DoubleSide,depthWrite:false}));
  ring.rotation.x=-Math.PI/2;ring.position.set(x,.14,z);ring.userData.battleShockwave=true;scene.add(ring);
  battleWaves.push({mesh:ring,at:clock,dur});
 }
 function spawnBattlePopup(x,z,amount,crit=false,tint='#fff6e0'){
  const value=Math.max(0,Math.round(Number(amount)||0));
  if(battlePopups.length>=24||value<=0)return;
  const text=crit?value+'!':String(value);
  // v359 (owner: "increase the damage size, it's too small"): a wider sheet, bigger type
  // and a larger sprite scale - damage reads across the whole plaza camera.
  const canvas=document.createElement('canvas');canvas.width=192;canvas.height=96;
  const ctx=canvas.getContext('2d');
  if(ctx&&typeof ctx.fillText==='function'){ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold '+(crit?58:46)+'px "Courier New",monospace';
   ctx.fillStyle='rgba(16,22,20,.92)';for(const [ox,oz] of [[3,0],[-3,0],[0,3],[0,-3]])ctx.fillText(String(text),96+ox,44+oz);
   ctx.fillStyle=crit?'#ffd98a':tint;ctx.fillText(String(text),96,44);
   if(crit){ctx.font='bold 20px "Courier New",monospace';ctx.fillStyle='#ffd98a';ctx.fillText('CRIT',96,80)}}
  const texture=new T.CanvasTexture(canvas);texture.magFilter=texture.minFilter=T.NearestFilter;texture.generateMipmaps=false;
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));
  sprite.center.set(.5,.5);sprite.position.set(x+(battleHash('pop:'+text+':'+z.toFixed(2))-.5)*.7,1.55,z);
  sprite.userData.battlePopup=true;sprite.userData.battlePopupText=String(text);sprite.userData.battlePopupCrit=!!crit;
  scene.add(sprite);battlePopups.push({mesh:sprite,at:clock,dur:crit?1300:1050,crit});
 }
 function battleEvent(ev){
  if(!ev||typeof ev!=='object')return false;
  const kind=ev.kind==='pvp'?'pvp':'pve',unit=battleResidents.get(kind+':'+ev.battleId+':'+ev.to);
  if(!unit)return false;
  const p=unit.sprite.position,crit=!!ev.crit,amount=Math.max(0,Math.round(Number(ev.amount)||0));
  // Contact freeze + shake live on the defender; both are purely visual timers.
  unit.shakeUntil=clock+(crit?340:220);unit.shakeAmp=crit?.24:.13;
  if(crit){unit.hitStopUntil=clock+120;unit.hitStopClock=clock}
  spawnBattleBurst(p.x,p.z,crit?0xffd98a:0xfff6e0,crit?22:16,crit?1.6:1.3,crit?.24:.17,crit?760:600);
  spawnBattleShockwave(p.x,p.z,crit?0xffd98a:0xfff6e0,crit?700:560);
  if(amount>0)spawnBattlePopup(p.x,p.z,amount,crit,unit.spec.enemy?'#fff6e0':'#ff9c86');
  return true;
 }
 function updateBattleFx(now){
  for(let i=battleBursts.length-1;i>=0;i--){const b=battleBursts[i],t=(now-b.at)/b.dur;
   if(t>=1){scene.remove(b.mesh);b.mesh.material.dispose();battleBursts.splice(i,1);continue}
   const dt=Math.min(.05,(now-b.last)/1000);b.last=now;
   b.vy-=4.4*dt;b.mesh.position.x+=b.vx*dt;b.mesh.position.z+=b.vz*dt;
   b.mesh.position.y=Math.max(.12,b.mesh.position.y+b.vy*dt);
   b.mesh.material.opacity=Math.max(0,1-t*t);
  }
  for(let i=battlePopups.length-1;i>=0;i--){const pop=battlePopups[i],t=(now-pop.at)/pop.dur;
   if(t>=1){scene.remove(pop.mesh);pop.mesh.material.map.dispose();pop.mesh.material.dispose();battlePopups.splice(i,1);continue}
   const popIn=t<.16?.6+2.5*t:1;
   pop.mesh.position.y=1.55+.85*t;
   const k=pop.crit?3.8:3.1;pop.mesh.scale.set(k,.5*k,1);
   pop.mesh.scale.multiplyScalar(popIn);
   pop.mesh.material.opacity=t>.62?Math.max(0,1-(t-.62)/.38):1;
  }
  for(let i=battleWaves.length-1;i>=0;i--){const w=battleWaves[i],t=(now-w.at)/w.dur;
   if(t>=1){scene.remove(w.mesh);w.mesh.geometry.dispose();w.mesh.material.dispose();battleWaves.splice(i,1);continue}
   w.mesh.scale.setScalar(1+t*4.6);w.mesh.material.opacity=Math.max(0,.95*(1-t));
  }
 }
 function battleSpecs(){
  const specs=[];
  for(const run of battleState.pve||[]){
   if(!run||run.phase==='ended')continue;const slot=Number(run.slot)||0,fx=70+(slot%4-1.5)*8,fz=60+Math.floor(slot/4)*10,runKey='pve:'+run.id;
   const add=(key,u,x,z,enemy=false,role='enemy')=>{if(!u||!PGSocialDigimon?.clean(u.form))return;specs.push({key,runKey,role,species:u.form,x,z,hp:u.hp,maxHp:u.maxHp,label:(u.boss?'BOSS · ':'')+battleName(u.form),enemy,boss:!!u.boss,phase:run.phase,kind:'pve',owner:run.owner,wave:run.wave,attackAt:u.attackAt||0,hitAt:u.hitAt||0})};
   // v355: a party run carries up to three partners; they spawn in a small spread row.
   const partners=(run.partners&&run.partners.length?run.partners:[run.partner]).filter(Boolean);
   partners.forEach((u,i)=>add(runKey+':partner'+(i||''),u,fx+(i-(partners.length-1)/2)*4.5,fz-(i?1.2:0),false,'partner'));
   (run.enemies||[]).forEach((u,i)=>add(runKey+':'+u.id,u,fx-3+i*3,fz+4,true));
  }
  const match=battleState.pvp;if(match&&match.phase!=='closed')for(const [i,p] of (match.participants||[]).entries()){
   const u=p.unit;if(!u||!PGSocialDigimon?.clean(u.form))continue;const r=R.SANCTUARY_RING;specs.push({key:'pvp:'+match.id+':'+p.id,role:'pvp',side:p.side,species:u.form,x:r.x+(p.side==='left'?-4:4),z:r.z,hp:u.hp,maxHp:u.maxHp,label:p.name||('PLAYER '+(i+1)),enemy:i===1,boss:false,phase:match.phase,kind:'pvp',owner:p.id,winnerId:match.winnerId,attackAt:u.attackAt||0,hitAt:u.hitAt||0});
  }
  return specs;
 }
 function battleHash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0)/4294967296}
 function battleSpawn(s){
  if(s.kind==='pvp'||s.role==='partner')return {x:s.x,z:s.z};
  // Stable per battle/unit random-looking spawns are shared by every spectator and do not
  // reroll when a 250 ms server snapshot arrives. They affect presentation, never combat.
  const angle=battleHash(s.key+':angle')*Math.PI*2,radius=8+battleHash(s.key+':radius')*8;
  return {x:Math.max(47,Math.min(93,s.x+Math.cos(angle)*radius)),z:Math.max(50,Math.min(78,s.z+Math.sin(angle)*radius))};
 }
 function battleApproach(from,to,distance,tolerance=.05){const dx=to.x-from.x,dz=to.z-from.z,length=Math.hypot(dx,dz);if(length<=tolerance)return {x:to.x,z:to.z};const travel=Math.min(Math.max(0,distance),Math.max(0,length-tolerance));return {x:from.x+dx/length*travel,z:from.z+dz/length*travel}}
 function setBattleState(next){
  battleState={pve:Array.isArray(next?.pve)?next.pve:[],pvp:next?.pvp||null};battleParticipantIds.clear();
  for(const run of battleState.pve)if(Number.isInteger(run.owner))battleParticipantIds.add(run.owner);
  for(const p of battleState.pvp?.participants||[])if(Number.isInteger(p.id))battleParticipantIds.add(p.id);
  const keep=new Set();for(const spec of battleSpecs()){
   keep.add(spec.key);let u=battleResidents.get(spec.key);if(!u){const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const texture=new T.CanvasTexture(canvas);texture.magFilter=texture.minFilter=T.NearestFilter;texture.generateMipmaps=false;const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthTest:true,alphaTest:.05}));sprite.center.set(.5,.25);scene.add(sprite);const ring=new T.Mesh(new T.RingGeometry(.8,1,24),new T.MeshBasicMaterial({color:spec.kind==='pvp'?0xf3c876:0x9ed6b0,transparent:true,opacity:.65,side:T.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.userData.battleAccent=true;scene.add(ring);const spawn=battleSpawn(spec),lastMove=performance.now();sprite.position.set(spawn.x,.06,spawn.z);u={canvas,ctx:canvas.getContext('2d'),texture,sprite,ring,paint:'',spec,spawn,lastMove,lastAttack:spec.attackAt,attackStarted:-Infinity,lastHit:spec.hitAt,hitStarted:-Infinity,ranged:false,shakeUntil:0,shakeAmp:0,hitStopUntil:0,hitStopClock:0,fainted:false,ghosts:null};battleResidents.set(spec.key,u)}u.spec=spec;u.sprite.userData.battleKind=spec.kind;u.sprite.userData.battleOwner=spec.owner;u.sprite.userData.battleRole=spec.role;u.sprite.userData.battleName=spec.label;u.sprite.userData.battleSpawn={...u.spawn};digimonStore?.request(spec.species);
  }
  for(const [key,u] of battleResidents)if(!keep.has(key)){scene.remove(u.sprite,u.ring);if(u.ghosts)for(const g of u.ghosts)scene.remove(g);u.sprite.material.dispose();u.texture.dispose();u.ring.geometry.dispose();u.ring.material.dispose();battleResidents.delete(key)}
  for(const r of residents)r.sprite.visible=!battleState.pve.length;
 }
 function battleTravel(unit,now){const elapsed=Math.max(0,Math.min(.5,(now-(unit.lastMove??now))/1000));unit.lastMove=now;return elapsed*BATTLE_RUN_SPEED}
 function updateBattleResidents(now){
  const positions=new Map(),targets=new Map(),groups=new Map(),specs=battleSpecs();
  for(const s of specs){if(s.kind!=='pve')continue;if(!groups.has(s.runKey))groups.set(s.runKey,[]);groups.get(s.runKey).push(s)}
  for(const list of groups.values()){
   const partners=list.filter(s=>s.role==='partner'),partner=partners[0],enemies=list.filter(s=>s.role==='enemy'),partnerUnit=partner&&battleResidents.get(partner.key),partnerTravel=partnerUnit?battleTravel(partnerUnit,now):0;
   if(!partner||!partnerUnit)continue;
   const enemyUnits=enemies.map(s=>({s,u:battleResidents.get(s.key)})).filter(x=>x.u),anchors=[partnerUnit.spawn,...enemyUnits.map(x=>x.u.spawn)],center={x:Math.max(51,Math.min(89,anchors.reduce((n,p)=>n+p.x,0)/anchors.length)),z:Math.max(54,Math.min(74,anchors.reduce((n,p)=>n+p.z,0)/anchors.length))};
   const from=partnerUnit.sprite.position,living=enemies.filter(s=>s.hp>0),target=living.sort((a,b)=>{const au=battleResidents.get(a.key).sprite.position,bu=battleResidents.get(b.key).sprite.position;return Math.hypot(au.x-from.x,au.z-from.z)-Math.hypot(bu.x-from.x,bu.z-from.z)})[0];
   // Every unit approaches a stable attack slot. Nobody chases the partner's centre or
   // snaps onto it when the target moves; new waves simply receive a new formation.
   // v350: a form's attack range decides how close its slot sits. Brawlers press in,
   // quick forms skirmish from a distance, and a boss holds the middle on its own.
   const start=battleHash(partner.runKey+':wave'+partner.wave+':formation')*Math.PI*2,enemySlots=new Map();
   for(const [index,enemy]of enemies.entries()){const unit=battleResidents.get(enemy.key);if(!unit||enemy.phase!=='fighting'||enemy.hp<=0)continue;const range=unitRange(enemy.species),radius=enemy.boss?3.8:range.ranged?Math.max(4.8,range.range+1.6):3.6;const angle=start+index*Math.PI*2/Math.max(1,enemies.length);enemySlots.set(enemy.key,{x:center.x+Math.cos(angle)*radius,z:center.z+Math.sin(angle)*radius})}
   if(partner.phase==='fighting'&&partner.hp>0){
    let slot=center;
    if(target&&enemySlots.has(target.key)){const es=enemySlots.get(target.key),dx=center.x-es.x,dz=center.z-es.z,len=Math.hypot(dx,dz)||1,pr=unitRange(partner.species),standoff=pr.ranged?pr.range:MELEE_STANDOFF;slot={x:Math.max(49,Math.min(91,es.x+dx/len*standoff)),z:Math.max(52,Math.min(76,es.z+dz/len*standoff))}}
    positions.set(partner.key,battleApproach(from,slot,partnerTravel));
    if(target){const targetUnit=battleResidents.get(target.key);targets.set(partner.key,{x:targetUnit.sprite.position.x,z:targetUnit.sprite.position.z})}
   }
   // v355: the rest of the party flanks the leader in a readable row, each aiming at its
   // own nearest living enemy instead of stacking on the primary partner.
   for(let pi=1;pi<partners.length;pi++){
    const ally=partners[pi],unit=battleResidents.get(ally.key);if(!unit||ally.phase!=='fighting'||ally.hp<=0)continue;
    const rowSlot={x:Math.max(49,Math.min(91,center.x+(pi-(partners.length-1)/2)*2.6)),z:Math.max(52,Math.min(76,center.z-2.6))};
    positions.set(ally.key,battleApproach(unit.sprite.position,rowSlot,battleTravel(unit,now)));
    const near=enemies.filter(e=>e.hp>0&&battleResidents.get(e.key)).sort((a,b)=>{const au=battleResidents.get(a.key).sprite.position,bu=battleResidents.get(b.key).sprite.position;return Math.hypot(au.x-unit.sprite.position.x,au.z-unit.sprite.position.z)-Math.hypot(bu.x-unit.sprite.position.x,bu.z-unit.sprite.position.z)})[0];
    if(near){const nu=battleResidents.get(near.key);targets.set(ally.key,{x:nu.sprite.position.x,z:nu.sprite.position.z})}
   }
   for(const [index,enemy]of enemies.entries()){const unit=battleResidents.get(enemy.key);if(!unit)continue;const slot=enemySlots.get(enemy.key);if(!slot)continue;const travel=battleTravel(unit,now);positions.set(enemy.key,battleApproach(unit.sprite.position,slot,travel));const aimUnits=partners.map(p=>battleResidents.get(p.key)).filter(Boolean);const aimU=aimUnits.sort((a,b)=>Math.hypot(a.sprite.position.x-unit.sprite.position.x,a.sprite.position.z-unit.sprite.position.z)-Math.hypot(b.sprite.position.x-unit.sprite.position.x,b.sprite.position.z-unit.sprite.position.z))[0];const aim=(aimU&&positions.get(aimU.spec.key))||positions.get(partner.key)||center;targets.set(enemy.key,{...aim})}
  }
  for(const s of specs.filter(s=>s.kind==='pvp')){const unit=battleResidents.get(s.key);if(!unit)continue;const travel=battleTravel(unit,now);if(s.phase==='fighting'&&s.hp>0){const r=R.SANCTUARY_RING,slot={x:r.x+(s.side==='left'?-PVP_RADIUS:PVP_RADIUS),z:r.z};positions.set(s.key,battleApproach(unit.sprite.position,slot,travel));const other=specs.find(o=>o.kind==='pvp'&&o.key!==s.key),otherUnit=other&&battleResidents.get(other.key);if(otherUnit)targets.set(s.key,{x:otherUnit.sprite.position.x,z:otherUnit.sprite.position.z})}}
  for(const u of battleResidents.values()){
   const s=u.spec,asset=digimonStore?.ready(s.species);u.sprite.visible=!!asset;u.ring.visible=!!asset;if(!asset){digimonStore?.request(s.species);continue}
   const dead=s.hp<=0||(s.kind==='pvp'&&s.phase==='result'&&s.winnerId!=null&&s.winnerId!==s.owner),previous={x:u.sprite.position.x,z:u.sprite.position.z};let pos=positions.get(s.key)||previous;if(dead||s.phase!=='fighting')pos=previous;const target=targets.get(s.key);u.ranged=unitRange(s.species).ranged;
   // Faint dust: a small pixel puff when a unit drops, and a golden burst plus shockwave for bosses.
   if(dead&&!u.fainted){u.fainted=true;if(s.boss){spawnBattleBurst(pos.x,pos.z,0xffd98a,16,1.35,.17,760);spawnBattleShockwave(pos.x,pos.z,0xffd98a,820)}else spawnBattleBurst(pos.x,pos.z,0xd8d2c4,8,.8,.09,560)}
   else if(!dead)u.fainted=false;
   // Crit contact freeze: while frozen the paint clock stands still, so the defender holds
   // its exact frame for a beat without repainting.
   const visualNow=now<u.hitStopUntil?u.hitStopClock:now;
   if(s.attackAt!==u.lastAttack){u.lastAttack=s.attackAt;u.attackStarted=now;if(u.ranged&&target&&!dead&&s.phase==='fighting')spawnBattleShot(pos,target,now,s.boss,s.enemy)}
   if(s.hitAt!==u.lastHit){u.lastHit=s.hitAt;u.hitStarted=now}
   const walking=!dead&&Math.hypot(pos.x-previous.x,pos.z-previous.z)>.015,attacking=!dead&&s.phase==='fighting'&&visualNow-u.attackStarted<ATTACK_MS;let stance=dead?'faint':attacking?'attack':walking?'walking':'idle';if(!asset.record.actions[stance])stance='idle';
   const flash=!dead&&now-u.hitStarted<210?1+Math.floor((now-u.hitStarted)/70):0;
   const time=stance==='faint'?(asset.record.actions[stance].length-1)*50:stance==='attack'?Math.max(0,visualNow-u.attackStarted):visualNow,flip=target?target.x<pos.x:s.enemy,n=PGSocialDigimon.frameIndex(asset.record.actions[stance].length,time,stance,6),key=[s.species,stance,n,flip,s.hp,s.label,flash].join(':');
   // v358 (owner, fourth report - the actual "pixel boxes"): every unit painted a big dark
   // name-plate rectangle plus a fat HP bar onto its sprite, so the field read as floating
   // boxes. Plates are gone: names are clean outlined text, and the health capsule is a
   // slim rounded pill that only appears once a unit is actually hurt.
   if(u.paint!==key){PGSocialDigimon.draw(u.ctx,asset,stance,time,6,flip);if(u.ctx&&typeof u.fillText==='function'){const ctx=u.ctx;
    const frac=Math.max(0,Math.min(1,s.hp/Math.max(1,s.maxHp)));
    if(frac<.999){
     const bw=132,bx=(256-bw)/2,by=13,bh=8;
     const pill=(x,y,pw,ph,r)=>{if(typeof ctx.beginPath==='function'&&typeof ctx.roundRect==='function'){ctx.beginPath();ctx.roundRect(x,y,pw,ph,r);ctx.fill()}else if(typeof ctx.fillRect==='function')ctx.fillRect(x,y,pw,ph)};
     ctx.fillStyle='rgba(14,20,16,.55)';pill(bx-3,by-3,bw+6,bh+6,(bh+6)/2);
     ctx.fillStyle=frac>.35?'#8fca66':'#e07862';pill(bx,by,Math.max(bh,bw*frac),bh,bh/2);
    }
    ctx.font=(s.boss?'bold 20px':'600 17px')+' "Trebuchet MS",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    if(typeof ctx.strokeText==='function'){ctx.strokeStyle='rgba(10,14,10,.85)';ctx.lineWidth=4;ctx.strokeText(String(s.label).slice(0,25),128,frac<.999?36:22,198)}
    ctx.fillStyle=s.boss?'#ffd98a':s.enemy?'#f3e6c8':'#fff5d7';ctx.fillText(String(s.label).slice(0,25),128,frac<.999?36:22,198);
   }u.texture.needsUpdate=true;u.paint=key}
   let drawX=pos.x,drawZ=pos.z;if(stance==='attack'&&target){const dx=target.x-pos.x,dz=target.z-pos.z,length=Math.hypot(dx,dz)||1,lunge=Math.sin(Math.min(1,(visualNow-u.attackStarted)/ATTACK_MS)*Math.PI)*(u.ranged?.14:.28);drawX+=dx/length*lunge;drawZ+=dz/length*lunge}
   if(now<u.shakeUntil){const amp=u.shakeAmp*Math.max(0,(u.shakeUntil-now)/(u.shakeAmp>.15?260:150));drawX+=(battleHash('sx:'+s.key+':'+Math.floor(now/40))-.5)*2*amp;drawZ+=(battleHash('sz:'+s.key+':'+Math.floor(now/40))-.5)*2*amp}
   const h=1.45*(globalThis.PGDigimonSanctuary?.visualScale(s.species)||1)*(s.boss?1.5:1);u.sprite.scale.set(256*h/96,256*h/96,1);
   // Hit flash tints the sprite material itself - nothing rectangular is ever painted onto
   // the unit canvas (the old full-canvas red fillRect read as a flashing box).
   u.sprite.material.color.setHex(flash?(flash>2?0xff8f7c:flash>1?0xffa08e:0xffb2a2):0xffffff);u.sprite.position.set(drawX,.06+(s.kind==='pvp'?R.SANCTUARY_RING.height:0),drawZ);u.ring.position.set(pos.x,.08+(s.kind==='pvp'?R.SANCTUARY_RING.height:0),pos.z);u.ring.scale.setScalar((s.boss?1.5:1)*(1+.08*Math.sin(now/180)));u.ring.material.color.setHex(s.boss?0xe8a54a:s.kind==='pvp'?0xf3c876:0x9ed6b0);u.sprite.userData.battleWalking=walking;u.sprite.userData.battleRanged=u.ranged;u.sprite.userData.battleBoss=!!s.boss;
   // After-images trail a lunging brawler: ghost sprites share the live canvas texture,
   // so they echo whatever frame the unit has painted without any extra draw work.
   if(!u.ranged&&!u.ghosts){u.ghosts=[.3,.15].map(o=>{const g=new T.Sprite(new T.SpriteMaterial({map:u.texture,transparent:true,opacity:o,depthWrite:false,alphaTest:.02}));g.center.copy(u.sprite.center);g.userData.battleGhost=true;g.visible=false;scene.add(g);return g})}
   if(u.ghosts){const gdx=drawX-pos.x,gdz=drawZ-pos.z,gmag=Math.hypot(gdx,gdz),gy=.06+(s.kind==='pvp'?R.SANCTUARY_RING.height:0);
    for(const [i,g] of u.ghosts.entries()){const back=(i+1)/(u.ghosts.length+1);g.visible=!u.ranged&&stance==='attack'&&gmag>.12;g.scale.copy(u.sprite.scale);g.position.set(pos.x+gdx*(1-back),gy,pos.z+gdz*(1-back))}}
  }
  updateBattleShots(now);
  updateBattleFx(now);
 }
 // Training pets are independent world sprites, not followers anchored to their
 // owners. The room assigns each one an apparatus; the client only animates it.
 const gymResidents=new Map();
 function setGymResidents(entries){
  const keep=new Set();for(const e of (Array.isArray(entries)?entries:[]).slice(0,20)){
   if(!e||typeof e!=='object'||!Number.isInteger(e.owner)||!Object.hasOwn(R.GYM_STATIONS,e.stat)||!Number.isInteger(e.slot)||!R.GYM_STATIONS[e.stat][e.slot]||!PGSocialDigimon?.clean(e.species))continue;keep.add(e.owner);
   let unit=gymResidents.get(e.owner);if(!unit){const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const texture=new T.CanvasTexture(canvas);texture.magFilter=texture.minFilter=T.NearestFilter;texture.generateMipmaps=false;const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthTest:true,alphaTest:.05}));sprite.center.set(.5,.25);scene.add(sprite);const effect=new T.Mesh(new T.RingGeometry(.75,.92,24),new T.MeshBasicMaterial({color:0xb6e4cf,transparent:true,opacity:.75,side:T.DoubleSide,depthWrite:false}));effect.rotation.x=-Math.PI/2;scene.add(effect);const impact=new T.Mesh(new T.SphereGeometry(.22,10,8),new T.MeshBasicMaterial({color:0xf8c07a}));scene.add(impact);unit={canvas,ctx:canvas.getContext('2d'),texture,sprite,effect,impact,paint:''};gymResidents.set(e.owner,unit)}unit.spec=e;unit.sprite.userData.gymOwner=e.owner;digimonStore.request(e.species);
  }
  for(const [id,u] of gymResidents)if(!keep.has(id)){scene.remove(u.sprite,u.effect,u.impact);u.sprite.material.dispose();u.texture.dispose();u.effect.geometry.dispose();u.effect.material.dispose();u.impact.geometry.dispose();u.impact.material.dispose();gymResidents.delete(id)}
 }
 function updateGymResidents(now){for(const u of gymResidents.values()){
   const {stat,slot,species}=u.spec,anchor=R.GYM_STATIONS[stat][slot],asset=digimonStore.ready(species);u.sprite.visible=!!asset;u.effect.visible=stat==='focus';u.impact.visible=stat==='guard';if(!asset){digimonStore.request(species);continue}
  const side=camera.matrixWorld.elements,rx=side[0],rz=side[2],cycle=now/1000;
  // A screen-left offset keeps the fighter beside the dummy from every orbit,
  // rather than behind its depth-tested mesh.
  let x=anchor.x-rx*1.65,z=anchor.z-rz*1.65,lift=0,stance='idle',flip=false,time=now;
  if(stat==='power')stance='attack';
  if(stat==='guard'){const hit=cycle%1.5,travel=Math.min(1,hit/.7);u.impact.visible=hit<.95;u.impact.position.set(anchor.x+(x-anchor.x)*travel,1.15,anchor.z+(z-anchor.z)*travel);if(hit>.65&&hit<.95){x-=rx*.3;z-=rz*.3}}
  if(stat==='agility'){stance='walking';x=anchor.x;z=anchor.z+Math.sin(cycle*2.8)*1.5;lift=Math.max(0,Math.sin(cycle*5.6))*.45;flip=Math.cos(cycle*2.8)<0;time=cycle*1400}
  if(stat==='focus'){x=anchor.x;z=anchor.z;lift=.12+Math.sin(cycle*2)*.1;u.effect.position.set(x,.08,z);u.effect.scale.setScalar(1+.18*Math.sin(now/350))}
  const h=1.45*(globalThis.PGDigimonSanctuary?.visualScale(species)||1);u.sprite.scale.set(256*h/96,256*h/96,1);u.sprite.position.set(x,.06+lift,z);u.sprite.userData.training=stat;
  const n=PGSocialDigimon.frameIndex(asset.record.actions[stance].length,time,stance,5),key=[species,stance,n,flip].join(':');if(u.paint!==key){PGSocialDigimon.draw(u.ctx,asset,stance,time,5,flip);u.texture.needsUpdate=true;u.paint=key}
 }}
 function updateResidents(now){for(const r of residents){if(battleState.pve.length){r.sprite.visible=false;continue}r.sprite.visible=true;const asset=digimonStore.ready(r.id);if(!asset){digimonStore.request(r.id);continue}const t=now/1000+r.phase,x=r.homeX+Math.sin(t*.34)*2.4,z=r.homeZ+Math.cos(t*.27)*1.8,walking=Math.abs(Math.cos(t*.34))>.18;r.sprite.position.set(x,.06,z);r.flip=Math.cos(t*.34)<0;const stance=walking?'walking':'idle',frame=PGSocialDigimon.frameIndex(asset.record.actions[stance].length,now,stance,5);if(frame!==r.frame||r.stance!==stance){r.frame=frame;r.stance=stance;PGSocialDigimon.draw(r.ctx,asset,stance,now,5,r.flip);r.texture.needsUpdate=true}}}
 const [gardenCatalog,gardenBuffer,gardenAtlas]=await Promise.all([fetch('assets/native-fields/v1/catalog.json').then(r=>{if(!r.ok)throw Error('Garden metadata unavailable');return r.json()}),fetch('assets/native-fields/v1/prontera/models.bin').then(r=>{if(!r.ok)throw Error('Garden models unavailable');return r.arrayBuffer()}),new T.TextureLoader().loadAsync('assets/native-fields/v1/prontera/models.webp')]);
 gardenAtlas.flipY=false;const gardenMat=modelMat.clone();gardenMat.map=gardenAtlas;gardenMat.onBeforeCompile=modelMat.onBeforeCompile;
 const garden=gardenCatalog.maps.find(m=>m.name==='prontera'),gardenFloats=new Float32Array(gardenBuffer);
 // Reuse native grass pixels for the remaining bounded gardens, with path clearance.
 // v363 (owner: "the 4 grass platforms near the fountain are shimmering - the floors overlap"):
 // these beds sat at y=.012 on a plaza floor at y=.01. Two millimetres is far below depth-buffer
 // precision at plaza distances, so the two surfaces fought for every pixel and the grass crawled
 // as the camera moved. The beds now take their own step in the floor ladder - a full centimetre
 // over the plaza, below the sanctuary boardwalks at .025 - the same separation the ground/plaza
 // pair gets.
 const grass=stone.clone();grass.repeat.set(R.GARDENS[0].w/8,R.GARDENS[0].d/8);grass.needsUpdate=true;
 const grassMat=new T.MeshBasicMaterial({map:grass,color:0xe4e2cf}),curbMaterial=new T.MeshBasicMaterial({color:0xb3ac97});
 for(const g of R.GARDENS){
  const bed=new T.Mesh(new T.PlaneGeometry(g.w,g.d),grassMat);bed.rotation.x=-Math.PI/2;bed.position.set(g.x,.02,g.z);scene.add(freeze(bed));
  for(const side of [-1,1])for(const axis of ['x','z']){const curb=new T.Mesh(new T.BoxGeometry(axis==='x'?.35:g.w+.35,.22,axis==='z'?.35:g.d+.35),curbMaterial);curb.position.set(g.x+(axis==='x'?side*g.w/2:0),.1,g.z+(axis==='z'?side*g.d/2:0));scene.add(freeze(curb))}
  const shrubs=makeBatch();for(const offset of [-4,0,4])for(const side of [-1,1])pushModel(shrubs,'shrub',g.x+offset,g.z+side*5,2.4,0,garden,gardenFloats);addBatch(shrubs,gardenMat);
 }
 // v356: the four plaza gardens no longer repeat one cloned tree - the two atlas
 // species alternate so the square reads as planted rather than stamped.
 // v359 (owner: "remove all dead tree sprites"): the garden stumps are gone too.
 R.TREES.forEach((tr,i)=>model(i%2?'tree2':'tree',tr.x,tr.z,tr.size,0,garden,gardenFloats,gardenMat));
 // v357 (owner: "the trees are ugly - use real Ragnarok-style ones"): the species are no
 // longer primitive cones and spheres. They are the repo's own native RO field models -
 // izlude firs, morocc palms, payon broadleafs and amatsu cherries - each with a per-tree
 // size and rotation so a grove reads as grown, not cloned. A missing atlas degrades to the
 // prontera tree instead of failing the hub.
 const speciesSources=await Promise.all(['izlude','morocc','payon','amatsu'].map(async name=>{
  try{
   const map=gardenCatalog.maps.find(m=>m.name===name);if(!map)return null;
   const [bin,atlas]=await Promise.all([fetch('assets/native-fields/v1/'+name+'/models.bin').then(r=>{if(!r.ok)throw Error('Tree models unavailable');return r.arrayBuffer()}),new T.TextureLoader().loadAsync('assets/native-fields/v1/'+name+'/models.webp')]);
   atlas.flipY=false;const mat=modelMat.clone();mat.map=atlas;mat.onBeforeCompile=modelMat.onBeforeCompile;
   return {map,floats:new Float32Array(bin),mat};
  }catch(e){console.warn('DigiPet tree set '+name+' unavailable',e);return null}
 }));
 const species={pine:speciesSources[0],palm:speciesSources[1],broad:speciesSources[2],sakura:speciesSources[3]};
 const treeHash=(x,z,salt)=>{const h=Math.abs(Math.sin(x*127.1+z*311.7+salt*74.7))*43758.5453;return h-Math.floor(h)};
 // Native trees soften the outer Sanctuary edge without crowding its entrances; kinded
 // entries from the shared rules render as their own RO species (v357).
 for(const t of R.SANCTUARY_TREES){
  const src=t.kind&&species[t.kind];
  // v358: each species gets its own size band - firs run tall and narrow, cherries stay
  // small and airy with wider spread, palms and broadleafs sit between - so a mixed
  // grove reads as grown rather than stamped from one scale.
  const band=t.kind==='pine'?[6,8.6]:t.kind==='sakura'?[4.4,6.9]:t.kind==='palm'?[5.6,7.4]:[5.6,8];
  const tree=src?model('tree',t.x,t.z,band[0]+treeHash(t.x,t.z,1)*(band[1]-band[0]),treeHash(t.x,t.z,2)*Math.PI*2,src.map,src.floats,src.mat)
   :model('tree2',t.x,t.z,6.8,0,garden,gardenFloats,gardenMat);
  tree.userData.sanctuaryTree=true;if(t.kind)tree.userData.treeKind=t.kind;if(t.behindGym)tree.userData.nativeGymTree=true;
 }
 // v358 (owner: "remove the dead trees around the pve grind area"): the field-edge stumps
 // are gone too. The grind ground stays completely clear around its fence.
 // Small native shrubs fill the outside edge without sealing any of the field gates.
 const sanctuaryShrubs=makeBatch();for(const [x,z] of [[98,20],[98,32],[98,48],[98,64],[98,78],[98,93],[98,113],[96,124],[89,124],[83,124],[19,112],[27,109],[13,89]])pushModel(sanctuaryShrubs,'shrub',x,z,2.1,0,garden,gardenFloats);addBatch(sanctuaryShrubs,gardenMat);

 // v287: Fishing ponds on the open south lawns (R.PONDS), well below the planted tree gardens.
 // All fishing 3D here is visual: water, stone rim, lily pads, ambient fish, and the local
 // player's rod/bobber rig. assets/social-fishing.js drives the states through `fishing` below.
 const fishingApi=(()=>{
  // An organically curved oval shared with the movement/fishing rules (local y = -world z).
  function pondShape(p,offset=0){const shape=new T.Shape();for(let i=0;i<=128;i++){const a=i*Math.PI*2/128,pt=R.pondBoundary(p,a,offset),x=pt.x-p.x,y=-(pt.z-p.z);if(!i)shape.moveTo(x,y);else shape.lineTo(x,y)}shape.closePath();return shape}
  const waterTile=document.createElement('canvas');waterTile.width=waterTile.height=128;const wctx=waterTile.getContext('2d');
  if(wctx&&typeof wctx.fillRect==='function'){wctx.fillStyle='#3e97be';wctx.fillRect(0,0,128,128);if(typeof wctx.arc==='function'&&typeof wctx.stroke==='function'){wctx.strokeStyle='rgba(235,250,255,0.3)';wctx.lineWidth=2;for(let i=0;i<24;i++){const x=(i*53)%128,y=(i*37)%128,r=4+(i*7)%9;wctx.beginPath();wctx.arc(x,y,r,Math.PI*.12,Math.PI*.88);wctx.stroke()}}}
  const makeWaterTex=()=>{const tx=new T.CanvasTexture(waterTile);tx.wrapS=tx.wrapT=T.RepeatWrapping;tx.repeat.set(1/5.5,1/5.5);return tx};
  const waterTexA=makeWaterTex(),waterTexB=makeWaterTex();
  const sandMat=new T.MeshBasicMaterial({color:0xcbc09b}),waterMat=new T.MeshBasicMaterial({color:0x2e7ea6}),glintMatA=new T.MeshBasicMaterial({map:waterTexA,transparent:true,opacity:.42,depthWrite:false}),glintMatB=new T.MeshBasicMaterial({map:waterTexB,transparent:true,opacity:.26,depthWrite:false});
  // v306: a second, animated water sheet sits just above the first one; the painted map-kit frames
  // cross-fade into it so the pond moves instead of being a flat blue shape.
  const waterMatB=new T.MeshBasicMaterial({color:0x2e7ea6,transparent:true,opacity:0,depthWrite:false});
  const stoneMat=new T.MeshBasicMaterial({color:0xb3ac97});
  const lilyMat=new T.MeshBasicMaterial({color:0x3c7a3f,transparent:true,opacity:.94,depthWrite:false}),lilies=[];
  // v304 (owner): "a better redesign of the pond - trees, a bridge, maybe a waterfall". Everything
  // here is built from primitives in the same flat colours as the rest of the town, so it needs no
  // new art and cannot clash with the sprite atlas: a stone arch bridge over the outflow, a rock face
  // with a falling water sheet and a splash pool behind each pond, stone lanterns, boulders and
  // flowering trees around the rim.
  // The town is unlit flat colour, so "shading" is done by alternating tones per stone.
  const rockMat=new T.MeshLambertMaterial({color:0x9d9a90}),rockMidMat=new T.MeshLambertMaterial({color:0x87847b}),rockDarkMat=new T.MeshLambertMaterial({color:0x6e6b65});
  const bridgeMat=new T.MeshBasicMaterial({color:0xc4a57e}),bridgeRailMat=new T.MeshBasicMaterial({color:0x805738});
  const lanternMat=new T.MeshBasicMaterial({color:0xb5ae9d}),lanternGlowMat=new T.MeshBasicMaterial({color:0xffe4a6});
  const trunkMat=new T.MeshBasicMaterial({color:0x6d4c33}),blossomMat=new T.MeshBasicMaterial({color:0xf6c3d6}),blossomDarkMat=new T.MeshBasicMaterial({color:0xe6a3bf});
  // soft splash pool: three stacked discs fading outwards (no canvas gradient, so the headless
  // scene tests can build the pond without a 2D context)
  const poolMat=new T.MeshBasicMaterial({color:0xbfe9f2,transparent:true,opacity:.3,depthWrite:false});
  // v308 (owner: "what's the random waterfall from the sky?"): the old sheet was a fully opaque
  // canvas rectangle, so it read as a slab of water hanging in the air. This one is built in bands:
  // each band only paints thin streaks inside a width that starts narrow at the lip and widens as it
  // falls, with the alpha ramping in at the top - so the sheet has soft edges and no hard top line,
  // and the rock face behind it shows through.
  const fallTile=document.createElement('canvas');fallTile.width=96;fallTile.height=192;
  const fctx=fallTile.getContext('2d');
  if(fctx&&typeof fctx.fillRect==='function'){
   if(typeof fctx.clearRect==='function')fctx.clearRect(0,0,96,192);
   const bands=34;
   for(let b=0;b<bands;b++){
    const y=Math.floor(b*192/bands),bh=Math.ceil(192/bands)+1,t=b/(bands-1);
    const half=(0.26+0.34*t)*48;                       // 12.5px at the lip, 29px at the base
    const fadeTop=Math.min(1,t/0.14);
    for(let k=0;k<8;k++){
     const off=((k*37+b*11)%100)/100;
     const x=48-half+off*half*2;
     const a=(0.22+0.5*fadeTop)*(0.5+0.5*((k*13+b*7)%100)/100);
     fctx.globalAlpha=Math.min(1,a);
     fctx.fillStyle=k%3?'#cfeeff':'#ffffff';
     fctx.fillRect(x,y,1+(k%3),bh);
    }
   }
   fctx.globalAlpha=1;
  }
  const makeFallTex=()=>{const tx=new T.CanvasTexture(fallTile);tx.wrapS=tx.wrapT=T.RepeatWrapping;tx.repeat.set(1,1.6);return tx};
  const falls=[],fallScroll=[];
  function stoneLantern(x,z){
   const g=new T.Group();
   const base=new T.Mesh(new T.BoxGeometry(.52,.18,.52),lanternMat);base.position.y=.09;g.add(base);
   const post=new T.Mesh(new T.CylinderGeometry(.11,.14,.62,8),lanternMat);post.position.y=.49;g.add(post);
   const box=new T.Mesh(new T.BoxGeometry(.42,.34,.42),lanternGlowMat);box.position.y=.98;g.add(box);
   const roof=new T.Mesh(new T.ConeGeometry(.44,.26,4),lanternMat);roof.position.y=1.28;roof.rotation.y=Math.PI/4;g.add(roof);
   g.position.set(x,0,z);scene.add(freeze(g));return g;
  }
  // v304: a taller trunk under a cluster of small blooms, two pinks deep - four big spheres read as a
  // pink cloud from the plaza camera rather than as a tree.
  function blossomTree(x,z,scale=1){
   const g=new T.Group();
   const trunk=new T.Mesh(new T.CylinderGeometry(.13*scale,.22*scale,1.7*scale,7),trunkMat);trunk.position.y=.85*scale;g.add(trunk);
   const blooms=[[0,2.05,.05,.68],[-.5,1.8,-.16,.5],[.46,1.84,.2,.48],[.06,2.34,-.26,.44],[-.26,2.2,.32,.38],[.36,2.18,-.34,.36],[-.12,1.7,.42,.34]];
   blooms.forEach(([dx,dy,dz,r],i)=>{
    const c=new T.Mesh(new T.SphereGeometry(r*scale,8,6),i%2?blossomDarkMat:blossomMat);
    c.position.set(dx*scale,dy*scale,dz*scale);c.scale.y=.82;g.add(c);
   });
   g.position.set(x,0,z);scene.add(freeze(g));return g;
  }
  // v304: one extruded arch instead of nine loose slabs, with a rail that follows the curve. The water
  // runs under the opening, so the bridge reads as a bridge from the plaza instead of scattered blocks.
  // v308 (owner: "the bridge too, a bit small and can pass through"): the deck is wider and thicker,
  // the parapets are real balustrades (newel posts at the ends, a hand rail and a mid rail on
  // turned posts), stone abutments tie it into the banks, and every bridge is registered in
  // `bridges` so the player walk is lifted onto the deck instead of clipping through the arch.
  // Native plaza stone connects the main avenue to the deck and finishes in a
  // rounded landing on the far west bank. It lies on land under the deck ends.
  function bridgePaths(paths){
   for(const path of paths){
    // v363 floor audit (same owner report): the path surfaces sit on .012 and the west cap was
    // .013 - one millimetre apart where the half-disc overlaps the path it terminates, which
    // shimmered at the landing. The cap now sits a centimetre over its path, like the gardens
    // over the plaza.
    const length=path.x2-path.x1,texture=plazaTex.clone();texture.repeat.set(length*26/164,path.width*3/18);texture.needsUpdate=true;
    const mat=new T.MeshBasicMaterial({map:texture,color:0xe6dfcf});
    const surface=new T.Mesh(new T.PlaneGeometry(length,path.width),mat);
    surface.rotation.x=-Math.PI/2;surface.position.set((path.x1+path.x2)/2,.012,path.z);surface.userData.bridgePath=path.name;scene.add(freeze(surface));
    if(path.name==='west'){
     const cap=new T.Mesh(new T.CircleGeometry(path.width/2,24),mat);
     cap.rotation.x=-Math.PI/2;cap.position.set(path.x1,.022,path.z);cap.userData.bridgePathCap=true;scene.add(freeze(cap));
    }
   }
  }
  function archBridge(cx,z,span,width,arch=1.05){
   const half=span/2;
   // deck: the top of the arch, .34 thick, ends sinking into the banks
   const top=t=>4*arch*t*(1-t);
   const shape=new T.Shape();
   shape.moveTo(-half,0);
   shape.quadraticCurveTo(0,2*arch,half,0);
   shape.lineTo(half,-.36);
   shape.quadraticCurveTo(0,2*arch-.72,-half,-.36);
   shape.closePath();
   const deck=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false}),bridgeMat.clone());
   deck.position.set(cx,0,z-width/2);scene.add(freeze(deck));
   bridges.push({x:cx,z,span,width,arch});bridgeDecks.push(deck);
   const point=t=>({x:-half+span*t,y:top(t)});
   for(const side of [-1,1]){
    const zz=z+side*(width/2-.1);
    // newel posts, taller than the rail, at both ends
    for(const t of [0,1]){
     const pt=point(t);
     const newel=new T.Mesh(new T.BoxGeometry(.17,1.02,.17),bridgeRailMat);
     newel.position.set(cx+pt.x,pt.y+.5,zz);scene.add(freeze(newel));
    }
    // hand rail + mid rail sampled along the curve
    for(const lift of [1.0,.55]){
     for(let i=0;i<24;i++){
      const a=point(i/24),b=point((i+1)/24);
      const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
      const rail=new T.Mesh(new T.BoxGeometry(len+.03,lift===1?.09:.06,.09),bridgeRailMat);
      rail.position.set(cx+(a.x+b.x)/2,(a.y+b.y)/2+lift,zz);
      rail.rotation.z=Math.atan2(dy,dx);scene.add(freeze(rail));
     }
    }
    // balusters
    for(let i=0;i<=40;i++){
     const t=i/40,pt=point(t);
     const post=new T.Mesh(new T.BoxGeometry(.07,.92,.07),bridgeRailMat);
     post.position.set(cx+pt.x,pt.y+.46,zz);scene.add(freeze(post));
    }
   }
   // Piers beneath the wooden deck, as in the approved concept. They are scenery below
   // the deck, not obstacles in the walking corridor.
   for(const t of [.18,.34,.5,.66,.82])for(const side of [-1,1]){
    const pt=point(t),h=Math.max(.2,pt.y-.22),pier=new T.Mesh(new T.CylinderGeometry(.18,.23,h,8),bridgeRailMat);
    pier.position.set(cx+pt.x,h/2,z+side*(width/2-.35));scene.add(freeze(pier));
   }
   // a low stone landing at each end, so the ramp meets masonry instead of hanging over the grass
   for(const side of [-1,1]){
    const pad=new T.Mesh(new T.BoxGeometry(.55,.1,width),stoneMat);
    pad.position.set(cx+side*(half-.1),.04,z);scene.add(freeze(pad));
   }
   return {deck};
  }

  // v304 (owner): "a waterfall behind the pond". The first pass built a 6-unit rock wall, which from the
  // plaza camera was a grey slab that hid the water. This is a low cascade of loose boulders at the
  // pond's south end with a narrow sheet falling between them - it reads as a rock garden, keeps the
  // pond visible from the north, and is small enough not to fight the houses behind it.
  // v308 (owner: "what's the random waterfall from the sky? looks funny"): the sheet was an opaque
  // rectangle AND it stood on the far side of the pond from the camera, so what you saw was the back
  // of a slab. It now pours into the pond from the far rim, its top disappears under a rock lip, its
  // foot lands in the water, and the rock face is heaped behind it so no edge is ever in open air.
  function cascade(p,fall,view){
   const zc=fall.z,w=fall.w,h=fall.h,d=fall.dir||1,tone=[rockMat,rockMidMat,rockDarkMat];
   // rock face: taller than the drop, heaped behind the water (away from the pond)
   // Stone flanks leave the waterfall visible even from the south-facing player camera.
   const rocks=[[-w/2-.3,.5,1.1,h*.45],[-w/2+.1,.55,1.15,h*.85],[-w/2+.25,.5,.9,h*1.3],
                [w/2+.3,.5,1.1,h*.45],[w/2-.1,.55,1.15,h*.85],[w/2-.25,.5,.9,h*1.3]];
   const rockGroup=new T.Group();rockGroup.userData.keepCascade=true;scene.add(rockGroup);
   if(view)view.fallback.push(rockGroup);
   // v309: the heap sits left of the pond centre and a little further back, so it never covers the
   // water where the cascade lands (the shelf that used to sit here was removed at the owner's ask).
   rocks.forEach(([dx,dz,r,ry],i)=>{
    const rock=new T.Mesh(new T.DodecahedronGeometry(r,0),tone[i%3]);
    rock.position.set(fall.x+dx,ry*.6,zc+d*.42);
    rock.scale.set(1.12,.9,1.02);
    rock.rotation.set(i*.7,i*1.3,i*.45);
    rockGroup.add(rock);
   });
   // the sheet: soft-edged streaks, top tucked under the lip slab, foot in the water
   const tex=makeFallTex(),H=h+.45,baseZ=zc+d*.12;
   const sheet=new T.Mesh(new T.PlaneGeometry(w-1.5,H),new T.MeshBasicMaterial({map:tex,color:0xd2f0fa,transparent:true,opacity:.9,side:T.DoubleSide,depthWrite:false}));
   sheet.position.set(fall.x,.10+H/2,baseZ);scene.add(freeze(sheet));
   falls.push({tex});if(view)view.falls.push({tex});
   // v306: a second, additive sheet of painted water keeps scrolling down over the streaks, so the
   // cascade has the same depth and highlights as the pond. It stays invisible until the art loads.
   const sprayMat=new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending});
   const spray=new T.Mesh(new T.PlaneGeometry(w-1.7,H-.12),sprayMat);
   spray.position.set(fall.x,.10+H/2,baseZ+d*.03);scene.add(freeze(spray));
   if(view)view.fallSpray.push(spray);
   // The source: a slab of rock sitting ON the sheet's top edge, deeper than the sheet, so the water
   // comes out from under stone instead of starting in mid-air.
   // Layered natural rock lip sits between the flanking boulders, hiding the sheet's
   // top without a straight, floating slab.
   const lipRock=new T.Group();lipRock.userData.keepCascade=true;
   for(let i=-2;i<=2;i++){const rock=new T.Mesh(new T.DodecahedronGeometry(.85,0),tone[(i+2)%3]);
    rock.position.set(fall.x+i*.92,H-.14+(i%2)*.12,baseZ-.3);rock.scale.set(1.15,.5,.8);rock.rotation.set(.2,i*.4,.1);lipRock.add(rock)}
   scene.add(freeze(lipRock));
   if(view)view.fallback.push(lipRock);
   // splash: broken foam where the water lands, and a shallow pool when it lands on grass
   const foam=new T.Mesh(new T.RingGeometry(.75,1.2,22),new T.MeshBasicMaterial({color:0xe8f8ff,transparent:true,opacity:.4,depthWrite:false}));
   foam.rotation.x=-Math.PI/2;foam.position.set(fall.x,fall.intoPond?.045:.032,baseZ+d*.45);scene.add(freeze(foam));
   if(!fall.intoPond){
    const pool=new T.Mesh(new T.CircleGeometry(1.85,20),poolMat);
    pool.rotation.x=-Math.PI/2;pool.position.set(fall.x,.026,baseZ+d*.8);scene.add(freeze(pool));
   }
  }
  // ------------------------------- v306 painted pond art ------------------------------------
  // The owner's verdict on the first pass: "water & pond have no texture... nothing like the images".
  // The game already ships two painted sheets for its world map - assets/kit/ro-spritesheet (props:
  // cherry, red arch bridge, rocks, stone lantern, bamboo) and assets/kit/ro-tiles-hd (256px terrain:
  // water frames, limestone, planks). They are loaded after the plaza is on screen and dress the ponds
  // in the same hand-painted style as the town. If they never arrive the primitives above stay.
  const pondViews=[];
  const pondDesigns=[];
  const cropTex=(img,rect)=>{
   if(!img||!rect||typeof document==='undefined')return null;
   const c=document.createElement('canvas');c.width=Math.max(1,rect.w);c.height=Math.max(1,rect.h);
   const cx=c.getContext('2d');if(!cx)return null;
   cx.drawImage(img,rect.x,rect.y,rect.w,rect.h,0,0,rect.w,rect.h);
   const tx=new T.CanvasTexture(c);tx.wrapS=tx.wrapT=T.RepeatWrapping;tx.anisotropy=4;return tx;
  };
  // A painted prop standing on the ground: a camera-facing sprite anchored at its feet.
  const addSprite=(tex,x,z,height,width)=>{
   const mat=new T.SpriteMaterial({map:tex,transparent:true,alphaTest:.22,depthWrite:true});
   const sp=new T.Sprite(mat);
   sp.center.set(.5,0);
   sp.position.set(x,.02,z);
   sp.scale.set(width||height*(tex.image.width/tex.image.height),height,1);
   scene.add(sp);return sp;
  };
  // ------------------------------ v306 water shader -----------------------------------------
  // Recipe follows the standard stylised-water breakdown: layer the same hand-painted tile at odd
  // scales scrolling in different directions (so the repeat never lines up), pick the colour from a
  // depth mask, then draw a foam band along the shoreline mask and a moving caustic highlight. The
  // pond is a ShapeGeometry; its normalized position follows the same radial shoreline as shared rules,
  // giving the shader a matching curved shore band instead of a rectangular gradient.
  const WATER_VERT=`
varying vec2 vPos;varying vec3 vWorld;
void main(){vPos=position.xy;vec4 wp=modelMatrix*vec4(position,1.0);vWorld=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`;
  const WATER_FRAG=`
precision highp float;
uniform sampler2D uA,uB,uN;uniform float uTime,uRadius,uFoamW;
uniform vec2 uHalf;uniform vec3 uShallow,uDeep,uFoam,uSun,uCam;
varying vec2 vPos;varying vec3 vWorld;
void main(){
 vec2 uv=vPos/(uRadius*1.9);
 // two hand-painted caustic frames, drifting against each other at odd scales
 vec3 sh=texture2D(uA,uv*2.1+vec2(uTime*.014,uTime*.008)).rgb;
 vec3 dp=texture2D(uB,uv*1.7-vec2(uTime*.010,-uTime*.013)).rgb;
 vec3 n=texture2D(uN,uv*3.9+vec2(uTime*.026,-uTime*.017)).rgb;
 vec2 norm=vec2(vPos.x/uHalf.x,-vPos.y/uHalf.y);
 float angle=atan(norm.y,norm.x);
 float ca=abs(cos(angle)),sa=abs(sin(angle));
 float shore=pow(pow(ca,2.5)+pow(sa,2.5),-.4)*(1.0+.065*sin(3.0*angle+.45)+.04*sin(5.0*angle-1.2)+.018*sin(8.0*angle+.8)+.022*sin(11.0*angle+.7));
 float sd=(length(norm)-shore)*min(uHalf.x,uHalf.y);
 // 0 at the waterline, 1 in the deep middle
 float depth=clamp(smoothstep(0.0,-2.4,sd),0.0,1.0);
 // the painted frames drive brightness (caustic density); the tint itself stays art-directed
 float calm=sh.g*.55+dp.g*.45;
 vec3 col=mix(uShallow,uDeep,depth)*(.80+.66*calm);
 vec3 spark=texture2D(uA,uv*3.3+vec2(-uTime*.028,uTime*.021)).rgb;
 col+=uSun*smoothstep(.70,.97,spark.g)*.26*(1.0-.35*depth);
 col+=uSun*smoothstep(.80,.99,n.g)*.09*(1.0-depth);
 // grazing-angle sheen, so the far half of the pond reads lighter
 vec3 V=normalize(uCam-vWorld);
 col=mix(col,col*1.12+vec3(.07,.11,.12),pow(1.0-abs(V.y),2.0)*.5);
 // shoreline: a wet dark lip, then a broken foam band that breathes
 float lip=smoothstep(-uFoamW*1.6,-uFoamW*.1,sd)*smoothstep(-.02,.05,sd);
 col=mix(col,vec3(.14,.26,.27),lip*.55);
 float band=smoothstep(-uFoamW,.0,sd);
 float foamNoise=texture2D(uN,uv*5.1+vec2(uTime*.021,uTime*.009)).g;
 float foam=band*smoothstep(.42,.86,foamNoise*.8+band*.35);
 col=mix(col,uFoam,clamp(foam,0.0,1.0)*.62);
 gl_FragColor=vec4(col,1.0);}`;
  const pondShaders=[];
  function waterShader(texA,texB,texN,p,foamW){
   const mat=new T.ShaderMaterial({
    uniforms:{uA:{value:texA},uB:{value:texB},uN:{value:texN},uTime:{value:0},
     uRadius:{value:2.6},uFoamW:{value:foamW||.3},uHalf:{value:new T.Vector2(p.w/2,p.d/2)},
     uShallow:{value:new T.Color(0xa8ded2)},uDeep:{value:new T.Color(0x458f96)},
     uFoam:{value:new T.Color(0xeaf9ed)},uSun:{value:new T.Color(0xfff1c6)},
     uCam:{value:new T.Vector3()}},
    vertexShader:WATER_VERT,fragmentShader:WATER_FRAG});
   pondShaders.push(mat);return mat;
  }
  let pondPainted=false;
  function paintPondArt(sheetMeta,sheetImg,tilesMeta,tilesImg){
   if(pondPainted||!sheetMeta||!sheetImg||!tilesMeta||!tilesImg)return false;
   const S=sheetMeta.sprites||{},TL=tilesMeta.tiles||{};
   const prop=n=>S[n]?cropTex(sheetImg,S[n]):null;
   const tile=n=>TL[n]?cropTex(tilesImg,TL[n]):null;
   const water0=tile('water_frame_0'),water1=tile('water_frame_1'),stone=tile('limestone_pale'),planks=tile('bridge_planks');
   const cherry=prop('tree_cherry'),lantern=prop('lantern_stone'),boulder=prop('rock_boulder_mossy'),crag=prop('rock_cliff_crag');
   if(!water0)return false;
   // cloned per pond so each surface drifts at its own offset
   const clone=(t,rx,ry)=>{const c=t.clone();c.needsUpdate=true;c.wrapS=c.wrapT=T.RepeatWrapping;c.repeat.set(rx,ry);return c};
   for(const v of pondViews){
    const beforePaint=new Set(scene.children);
    // water: one shader per pond, layering the painted frames and the shoreline mask
    const w0=clone(water0,1,1),w1=clone(tile('water_dark_0')||water1||water0,1,1),wN=clone(water1||water0,1,1);
    v.water.material=waterShader(w0,w1,wN,v.p);
    v.waterB.visible=false;
    for(const sp of v.fallSpray){
     sp.material.map=makeFallTex();sp.material.opacity=.4;sp.material.needsUpdate=true;
     fallScroll.push({tex:sp.material.map});
    }
    // stone coping: the same limestone the town's river walls are cut from, now with real height
    // so it casts a lip shadow over the water instead of being a painted flat ring.
    {
     const outer=pondShape(v.p,.6),inner=pondShape(v.p,-.12);
     const shape=new T.Shape(outer.getPoints(64)),hole=new T.Path(inner.getPoints(64));
     shape.holes.push(hole);
     const coping=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:false}),
      new T.MeshBasicMaterial({color:0xd8d1bd}));
     coping.rotation.x=-Math.PI/2;coping.position.set(v.p.x,.006,v.p.z);scene.add(coping);
     v.rim.visible=false;v.coping=coping;
    }
    if(stone){
     if(v.coping){v.coping.material.map=clone(stone,1/3.2,1/3.2);v.coping.material.color.set(0xe9e3d3);v.coping.material.needsUpdate=true;}
     stoneMat.map=clone(stone,1,1);stoneMat.color.set(0xded7c6);stoneMat.needsUpdate=true;
    }
    // planks across the deck, red lacquer on the parapets
    if(planks&&v.bridge){v.bridge.deck.material.map=clone(planks,1/2.3,1/2.3);v.bridge.deck.material.color.set(0xf2e6d2);v.bridge.deck.material.needsUpdate=true;}
    if(planks){
     bridgeRailMat.map=clone(planks,1,1);bridgeRailMat.color.set(0xa8794d);bridgeRailMat.needsUpdate=true;
    }
    // painted props replace the primitives that were standing in for them
    for(const o of v.fallback)if(!o.userData.keepCascade)scene.remove(o);
    v.fallback.length=0;
    const props=v.props;if(!props)continue;
    if(cherry)for(const t of props.blossoms){const tree=addSprite(cherry,t.x,t.z,8.6*t.scale);tree.userData.sakura=true;}
    if(lantern)for(const l of props.lanterns)addSprite(lantern,l.x,l.z,1.9);
    if(boulder)for(const b of props.boulders)addSprite(boulder,b.x,b.z,.78+b.r*.6);
    if(props.falls){
     // the rock face the water comes out of: behind the sheet, wide enough to hide it from the far side
     // The three-dimensional cascade flank rocks remain after painted shore art loads.
     if(crag){addSprite(crag,props.falls.x-3.05,props.falls.z+.25,3.3,2.6);addSprite(crag,props.falls.x+3.05,props.falls.z+.25,3.3,2.6)}
    }

    // rocks flanking the cascade where it meets the water
    if(boulder&&props.falls){
     addSprite(boulder,props.falls.x-2.55,props.falls.z+1.1*props.falls.dir,1.05);
     addSprite(boulder,props.falls.x+2.6,props.falls.z+1.3*props.falls.dir,.95);
    }
    // reflections: the blossom trees mirrored across the pond surface, so the water is not a flat
    // sheet of colour. Only the trees that actually mirror into the water get one.
    const mirror=(tex,x,z,h,objScale=1)=>{
     const hx=v.p.w/2,hz=v.p.d/2,a=Math.atan2((z-v.p.z)/hz,(x-v.p.x)/hx);
     const edge=R.pondBoundary(v.p,a),rx=2*edge.x-x,rz=2*edge.z-z;
     if(!R.pondContains(v.p,rx,rz,-.6))return;
     const m=new T.SpriteMaterial({map:tex,transparent:true,opacity:.2,depthWrite:false});
     const sp=new T.Sprite(m);sp.center.set(.5,1);sp.scale.set(h*(tex.image.width/tex.image.height)*objScale,-h*objScale,1);
     sp.position.set(rx,.035,rz);scene.add(sp);
    };
    if(cherry)for(const t of props.blossoms)mirror(cherry,t.x,t.z,8.6*t.scale);
    if(lantern)for(const l of props.lanterns)mirror(lantern,l.x,l.z,1.9);
    if(boulder)for(const b of props.boulders)mirror(boulder,b.x,b.z,.78+b.r*.6);
    if(window.PGSocialPondDesign){
     const design=window.PGSocialPondDesign.build({T,R,scene,view:v,textures:{stone},legacy:[...v.designLegacy,...scene.children.filter(o=>!beforePaint.has(o))]});
     pondDesigns.push(design);
    }
   }
   pondPainted=true;return true;
  }
  function loadPondArt(){
   const j=n=>fetch('assets/kit/'+n).then(r=>r.ok?r.json():null).catch(()=>null);
   const img=n=>new T.TextureLoader().loadAsync('assets/kit/'+n).then(t=>t.image).catch(()=>null);
   return Promise.all([j('ro-spritesheet.json'),img('ro-spritesheet.png'),j('ro-tiles-hd.json'),img('ro-tiles-hd.png')])
    .then(([sm,si,tm,ti])=>paintPondArt(sm,si,tm,ti))
    .catch(err=>{if(typeof console!=='undefined')console.error('pond art failed',err&&err.message,err&&err.stack&&err.stack.slice(0,300));return false});
  }
  for(const p of R.PONDS){
    const beforePond=new Set(scene.children);
   const view={p,props:null,fallback:[],falls:[],fallSpray:[],bridge:null,stones:[],rim:null,water:null,waterB:null};
   pondViews.push(view);
   const rim=new T.Mesh(new T.ShapeGeometry(pondShape(p,.75)),sandMat);rim.rotation.x=-Math.PI/2;rim.position.set(p.x,.008,p.z);scene.add(freeze(rim));view.rim=rim;
   const water=new T.Mesh(new T.ShapeGeometry(pondShape(p)),waterMat);water.rotation.x=-Math.PI/2;water.position.set(p.x,.016,p.z);scene.add(freeze(water));view.water=water;
   const waterB=new T.Mesh(new T.ShapeGeometry(pondShape(p,-.025)),waterMatB);waterB.rotation.x=-Math.PI/2;waterB.position.set(p.x,.019,p.z);scene.add(freeze(waterB));view.waterB=waterB;
   for(const [mat,y] of [[glintMatA,.024],[glintMatB,.028]]){const glint=new T.Mesh(new T.ShapeGeometry(pondShape(p,-.3)),mat);glint.rotation.x=-Math.PI/2;glint.position.set(p.x,y,p.z);scene.add(freeze(glint));view.fallback.push(glint)}
   // v304: 28 low stones walked along the pond's own rounded outline. The old ring used an ellipse, so
   // at the corners it dropped stones into the water - now the edging follows the rim exactly.
   {
    const ring=pondShape(p,.65).getSpacedPoints(64);
    ring.forEach((pt,i)=>{
     // leave a mouth in the edging where the cascade enters the water (v308: north shore)
     if(p.z-pt.y>R.POND_FALLS[0].z-1.5&&Math.abs(p.x+pt.x-R.POND_FALLS[0].x)<4)return;
     if(Math.abs(p.z-pt.y-R.POND_PROPS[0].bridge.z)<2.8)return;
     const nx=ring[(i+1)%ring.length],ang=Math.atan2(nx.y-pt.y,nx.x-pt.x);
     const sx=.58+((i*29)%13)/70;
     const stone=new T.Mesh(new T.BoxGeometry(sx,.18+((i*13)%7)/80,.42),stoneMat);
     stone.position.set(p.x+pt.x,.08,p.z-pt.y);stone.rotation.y=-ang;
     scene.add(freeze(stone));view.stones.push(stone);
    });
   }
   // v306: lily clusters instead of three lone discs - pads of two greens in uneven clumps, a few
   // of them flowering, drifting slowly (the drift is animated further down).
   for(let i=0;i<4;i++){
    const g=new T.Group();
    const a=i*Math.PI*.5+.65,bx=p.x+Math.cos(a)*p.w*.23,bz=p.z+Math.sin(a)*p.d*.23;
    const pads=[[0,0,.5,0],[-.55,.28,.38,1],[.42,.34,.34,0],[.16,-.46,.3,2]];
    pads.forEach(([dx,dz,r,rot],k)=>{
     const pad=new T.Mesh(new T.CircleGeometry((r+(i%2)*.05)*.82,14,.42,5.7),lilyMat);
     pad.rotation.x=-Math.PI/2;pad.rotation.z=rot;
     pad.position.set(dx,0,dz);g.add(pad);
     if(k===0&&i%2===0){
      const bloom=new T.Mesh(new T.ConeGeometry(.14,.16,6),blossomMat);
      bloom.position.set(dx+.06,.1,dz);g.add(bloom);
      const tip=new T.Mesh(new T.SphereGeometry(.07,6,5),blossomDarkMat);
      tip.position.set(dx+.06,.19,dz);g.add(tip);
     }
    });
    g.position.set(bx,.03+.0012*(i%6),bz);
    lilies.push({mesh:g,x:bx,z:bz,ph:i*2.1});scene.add(g);
   }
   // v304: the garden behind and around the pond. Positions come from R.POND_PROPS so the layout
   // test in tools/tests/social_sim.js can prove no prop sits in the water or on a chair.
   const props=(R.POND_PROPS||[])[R.PONDS.indexOf(p)]||null;
   view.props=props;
   if(props&&props.falls)cascade(p,props.falls,view);
   if(props){
    bridgePaths(props.paths||[]);
    view.bridge=archBridge(props.bridge.x,props.bridge.z,props.bridge.span,props.bridge.width,props.bridge.arch);
    for(const l of props.lanterns)view.fallback.push(stoneLantern(l.x,l.z));
    for(const t of props.blossoms)view.fallback.push(blossomTree(t.x,t.z,t.scale));
    const boulders=new T.Group();
    props.boulders.forEach((b,i)=>{
     const rock=new T.Mesh(new T.DodecahedronGeometry(b.r,0),i%2?rockMat:rockDarkMat);
     rock.position.set(b.x,b.r*.55,b.z);rock.rotation.set(i*1.1,i*.7,i*.3);
     boulders.add(rock);
    });
    scene.add(boulders);view.fallback.push(boulders);
   }
   view.designLegacy=scene.children.filter(o=>!beforePond.has(o));
  }
  // v306: fetch the painted sheets once the pond exists (deferred so the plaza is interactive first);
  // every pond view is repainted in place when they arrive.
  setTimeout(loadPondArt,900);
  // Ambient fish silhouettes swim inside each pond; the Fishing Bag's "Show swimming fish" toggles them.
  const fishShape=new T.Shape();fishShape.moveTo(.4,0);fishShape.quadraticCurveTo(.05,.22,-.26,.06);fishShape.lineTo(-.46,.17);fishShape.lineTo(-.37,0);fishShape.lineTo(-.46,-.17);fishShape.lineTo(-.26,-.06);fishShape.quadraticCurveTo(.05,-.22,.4,0);
  const fishGeo=new T.ShapeGeometry(fishShape),fishGroup=new T.Group(),swimmers=[];scene.add(fishGroup);
  // v356 (owner: "smaller details like pond water having octopus & shark shadows swimming"):
  // two big residents live UNDER the surface. They are soft dark silhouettes a hair above the
  // bed colour and below the glint sheets, on slower and wider loops than the little fish, so
  // the water reads as deep. The octopus drifts and turns; the shark patrols end to end and
  // now and then a ripple ring breaks the surface above it.
  const deepGroup=new T.Group();fishGroup.add(deepGroup);const deepSwimmers=[];
  const shadowMat=new T.MeshBasicMaterial({color:0x12303e,transparent:true,opacity:.34,depthWrite:false});
  const octopusCanvas=document.createElement('canvas');octopusCanvas.width=192;octopusCanvas.height=128;
  const octx=octopusCanvas.getContext('2d');let octoPainted=false;
  if(octx&&typeof octx.fillRect==='function'&&typeof octx.beginPath==='function'&&typeof octx.arc==='function'&&typeof octx.quadraticCurveTo==='function'){octoPainted=true;
   octx.clearRect(0,0,192,128);
   // Soft octopus: layered translucent circles instead of one hard blob, then six
   // curling tentacles swept with round line caps.
   octx.fillStyle='rgba(6,24,33,.55)';
   for(let i=0;i<9;i++)octx.beginPath(),octx.arc(96,52,40-i*3.4,0,Math.PI*2),octx.fill();
   octx.strokeStyle='rgba(6,24,33,.5)';octx.lineWidth=11;octx.lineCap='round';
   for(let i=0;i<6;i++){const a=Math.PI*.22+i/5*Math.PI*.56;octx.beginPath();octx.moveTo(96+Math.cos(a)*30,64+Math.sin(a)*22);
    octx.quadraticCurveTo(96+Math.cos(a)*54,92,96+Math.cos(a)*54+(i-2.5)*10,112);octx.stroke()}
  }
  const sharkCanvas=document.createElement('canvas');sharkCanvas.width=256;sharkCanvas.height=96;
  const shctx=sharkCanvas.getContext('2d');let sharkPainted=false;
  if(shctx&&typeof shctx.fillRect==='function'&&typeof shctx.beginPath==='function'&&typeof shctx.arc==='function'&&typeof shctx.ellipse==='function'&&typeof shctx.quadraticCurveTo==='function'){sharkPainted=true;
   shctx.clearRect(0,0,256,96);
   // Soft shark: fusiform body from stacked ellipses, a tall dorsal fin, pectoral fins
   // and a caudal tail with the classic notch, all in the same translucent ink.
   shctx.fillStyle='rgba(6,24,33,.55)';
   for(let i=0;i<10;i++)shctx.beginPath(),shctx.ellipse(118,52,66-i*5.2,22-i*1.5,0,0,Math.PI*2),shctx.fill();
   shctx.beginPath();shctx.moveTo(120,32);shctx.quadraticCurveTo(134,4,152,10);shctx.quadraticCurveTo(136,20,132,34);shctx.fill();
   for(const side of [-1,1]){shctx.beginPath();shctx.moveTo(108,64);shctx.quadraticCurveTo(96,side*30+52,74,side*34+54);shctx.quadraticCurveTo(92,72,108,72);shctx.fill()}
   shctx.beginPath();shctx.moveTo(180,52);shctx.quadraticCurveTo(224,20,248,16);shctx.quadraticCurveTo(226,44,224,52);shctx.quadraticCurveTo(228,62,244,84);shctx.quadraticCurveTo(210,74,180,58);shctx.fill();
  }
  const octopusTex=octoPainted?new T.CanvasTexture(octopusCanvas):null,sharkTex=sharkPainted?new T.CanvasTexture(sharkCanvas):null;
  R.PONDS.forEach((p,pi)=>{
   const octoMat=octopusTex?new T.MeshBasicMaterial({map:octopusTex,transparent:true,opacity:.5,depthWrite:false}):shadowMat;
   const sharkMat2=sharkTex?new T.MeshBasicMaterial({map:sharkTex,transparent:true,opacity:.5,depthWrite:false}):shadowMat;
   const octo=new T.Mesh(new T.PlaneGeometry(3.1,2.1),octoMat);octo.rotation.x=-Math.PI/2;
   const shark=new T.Mesh(new T.PlaneGeometry(4.6,1.75),sharkMat2);shark.rotation.x=-Math.PI/2;
   octo.userData.deepKind='octopus';shark.userData.deepKind='shark';deepGroup.add(octo,shark);
   deepSwimmers.push({m:octo,p,kind:'octopus',ax:(p.w/2-3.4)*.5,az:(p.d/2-3.2)*.42,fa:.05+pi*.011,fb:.041+pi*.007,pa:pi*2.1,pb:pi*3.7,y:.0215});
   deepSwimmers.push({m:shark,p,kind:'shark',ax:(p.w/2-4)*.72,az:(p.d/2-3.4)*.3,fa:.085+pi*.013,fb:.062+pi*.009,pa:pi*1.3+2,pb:pi*2.6+1,y:.0225});
  });
  // Ripple rings that occasionally open above the patrolling shark.
  const rippleMat=new T.MeshBasicMaterial({color:0xd8f0f8,transparent:true,opacity:0,depthWrite:false});
  const deepRipples=[0,1,2].map(i=>{const r=new T.Mesh(new T.RingGeometry(.5,.62,26),rippleMat.clone());r.rotation.x=-Math.PI/2;r.visible=false;deepGroup.add(r);return {mesh:r,at:-i*2.4,x:0,z:0}});
  const sharkRipple=(x,z,now)=>{const r=deepRipples.reduce((a,b)=>a.at<=b.at?a:b);r.at=now/1000;r.x=x;r.z=z;r.mesh.visible=true};
  const updateDeep=(t,now)=>{
   for(const s of deepSwimmers){
    const x=s.p.x+Math.sin(t*s.fa+s.pa)*s.ax,z=s.p.z+Math.sin(t*s.fb+s.pb)*s.az;
    const vx=Math.cos(t*s.fa+s.pa)*s.fa*s.ax,vz=Math.cos(t*s.fb+s.pb)*s.fb*s.az;
    s.m.position.set(x,s.y+Math.sin(t*.8+s.pb)*.004,z);
    s.m.rotation.z=Math.atan2(-vz,vx);
    if(s.kind==='octopus')s.m.scale.setScalar(.9+Math.sin(t*.5+s.pa)*.07);
   }
   for(const r of deepRipples){
    if(!r.mesh.visible)continue;
    const age=t-r.at;
    if(age>2.6){r.mesh.visible=false;continue}
    if(age<0){r.mesh.visible=false;continue}
    r.mesh.position.set(r.x,.034,r.z);
    r.mesh.scale.setScalar(.6+age*2.6);
    r.mesh.material.opacity=Math.max(0,.34*(1-age/2.6));
   }
   const shark=deepSwimmers.find(s=>s.kind==='shark');
   if(shark&&t-(shark.lastRipple||0)>7.5){shark.lastRipple=t;sharkRipple(shark.m.position.x,shark.m.position.z,t)}
  };

  R.PONDS.forEach((p,pi)=>{for(let i=0;i<7;i++){const m=new T.Mesh(fishGeo,new T.MeshBasicMaterial({color:[0xe08a3c,0xd8dde2,0x8fc9b8][i%3],transparent:true,opacity:.78,depthWrite:false}));m.rotation.x=-Math.PI/2;const sc=.7+((i*31)%12)/16;m.scale.setScalar(sc);fishGroup.add(m);swimmers.push({m,p,ax:(p.w/2-1.6)*.62,az:(p.d/2-1.5)*.62,fa:.13+((i*17)%10)/90,fb:.1+((i*23)%10)/80,pa:i*1.7+pi,pb:i*2.9+pi*2})}});
  // The local player's rod, line, bobber, ripples, splash, bite mark and catch flight.
  // v300 (owner): the rod you hold is painted in your rod's tier colour and wrapped in an additive
  // glow sleeve, so the rod itself reads at a glance - a Golden rod glows gold in the plaza, not
  // just as an icon in the shop. Same builder is used for other anglers' rods.
  const ROD_GLOW={twig:.3,oak:.4,brass:.52,silver:.62,golden:.78,mythril:.92};
  // v300: the two top tiers breathe; anyone who asked their OS for less motion gets a steady glow.
  const ROD_PULSE=new Set(['golden','mythril']);
  let reduceMotion=false;try{reduceMotion=!!(typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)}catch{}
  function rodTint(rodId){
   const F=globalThis.PGSocialFishing;
   const map=F&&F.ROD_TIER_COLORS?F.ROD_TIER_COLORS:null;
   return (map&&map[rodId])||'#8b6b45';
  }
  function makePole(rTop,rBottom,segments){
   const group=new T.Group();
   const core=new T.Mesh(new T.CylinderGeometry(rTop,rBottom,1,segments),new T.MeshBasicMaterial({color:0x7a5230}));
   // Two shells: a bright sleeve hugging the blank, and a wide faint haze so the light falls off
   // instead of ending on a hard tube edge.
   const glow=new T.Mesh(new T.CylinderGeometry(rTop*4.2,rBottom*4.2,1,segments),new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.4,blending:T.AdditiveBlending,depthWrite:false}));
   const haze=new T.Mesh(new T.CylinderGeometry(rTop*8,rBottom*8,1,Math.max(6,segments-2)),new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.12,blending:T.AdditiveBlending,depthWrite:false}));
   core.name='rodCore';glow.name='rodGlow';haze.name='rodHaze';
   group.add(core,glow,haze);
   return {group,core,glow,haze,rod:null};
  }
  function stylePole(rod,rodId){
   const id=rodId||'twig';
   if(rod.rod===id)return;
   rod.rod=id;
   const tint=new T.Color(rodTint(id));
   try{rod.core.material.color.copy(tint)}catch{}
   // the core is lifted toward white so a lit rod never looks like a brown stick with a haze
   const lit=tint.clone().lerp(new T.Color(0xffffff),.35);
   rod.base=.22+((ROD_GLOW[id]||.3)*.5);
   rod.hazeBase=.06+rod.base*.2;
   rod.pulse=ROD_PULSE.has(id)&&!reduceMotion;
   try{rod.glow.material.color.copy(lit);rod.glow.material.opacity=rod.base}catch{}
   try{rod.haze.material.color.copy(lit);rod.haze.material.opacity=rod.hazeBase}catch{}
  }
  function disposePole(rod){
   rod.group.traverse(o=>{if(o.isMesh){try{o.geometry.dispose()}catch{}try{o.material.dispose()}catch{}}});
  }
  const poleRod=makePole(.016,.04,6),pole=poleRod.group;stylePole(poleRod,'twig');pole.visible=false;scene.add(pole);
  function setRod(rodId){stylePole(poleRod,typeof rodId==='string'?rodId:'twig')}
  const lineGeo=new T.BufferGeometry(),linePts=new Float32Array(8*3);lineGeo.setAttribute('position',new T.BufferAttribute(linePts,3));const line=new T.Line(lineGeo,new T.LineBasicMaterial({color:0xeef2ee,transparent:true,opacity:.75}));line.visible=false;line.frustumCulled=false;scene.add(line);
  const bobber=new T.Group();bobber.visible=false;scene.add(bobber);
  const bTop=new T.Mesh(new T.SphereGeometry(.11,10,8),new T.MeshBasicMaterial({color:0xd8402e}));bTop.position.y=.07;bobber.add(bTop);
  const bBot=new T.Mesh(new T.SphereGeometry(.09,10,8),new T.MeshBasicMaterial({color:0xf2efe4}));bBot.position.y=-.03;bobber.add(bBot);
  const bTip=new T.Mesh(new T.CylinderGeometry(.014,.014,.2,6),new T.MeshBasicMaterial({color:0xeadfae}));bTip.position.y=.2;bobber.add(bTip);
  const ripples=Array.from({length:5},()=>{const m=new T.Mesh(new T.RingGeometry(.82,1,24),new T.MeshBasicMaterial({color:0xdcf2fa,transparent:true,opacity:0,depthWrite:false}));m.rotation.x=-Math.PI/2;m.visible=false;scene.add(m);return {m,t0:0,dur:0}});
  const splashGeo=new T.BufferGeometry(),splashPos=new Float32Array(26*3);splashGeo.setAttribute('position',new T.BufferAttribute(splashPos,3));const splashPts=new T.Points(splashGeo,new T.PointsMaterial({color:0xdff4ff,size:.1,transparent:true,opacity:.95}));splashPts.visible=false;splashPts.frustumCulled=false;scene.add(splashPts);let splashDrops=null,splashT0=0;
  const markCanvas=document.createElement('canvas');markCanvas.width=markCanvas.height=64;const markCtx=markCanvas.getContext('2d');
  if(markCtx&&typeof markCtx.fillText==='function'){markCtx.font='bold 52px Trebuchet MS, sans-serif';markCtx.textAlign='center';markCtx.textBaseline='middle';if(typeof markCtx.strokeText==='function'){markCtx.lineWidth=8;markCtx.strokeStyle='#fff';markCtx.strokeText('!',32,36)}markCtx.fillStyle='#e23b2e';markCtx.fillText('!',32,36)}
  const markTex=new T.CanvasTexture(markCanvas),mark=new T.Sprite(new T.SpriteMaterial({map:markTex,transparent:true,depthTest:false}));mark.visible=false;mark.scale.set(.9,.9,1);scene.add(mark);
  const glyphCanvas=document.createElement('canvas');glyphCanvas.width=glyphCanvas.height=96;const glyphCtx=glyphCanvas.getContext('2d');
  const glyphTex=new T.CanvasTexture(glyphCanvas),glyph=new T.Sprite(new T.SpriteMaterial({map:glyphTex,transparent:true,depthTest:false}));glyph.visible=false;glyph.scale.set(1.5,1.5,1);scene.add(glyph);
  // v288: show-off fish held overhead - the actual species, scaled by its weight, for ~5s.
  const showPool=[];
  // v295: a null id means the local player, so "show off my own catch" uses the same path.
  function showFish(pid,o){
   o=o||{};
   if(pid===null||pid===undefined||pid==='self')pid=callbacks.self&&callbacks.self();
   // v294: prefer the painted species sprite (crisp 256px, bright, baked mutation halo) over
   // the old 128px emoji draw that showed up blurry and too dim to see.
   let canvas=null;
   const F=(typeof globalThis!=='undefined'&&globalThis.PGSocialFishing)||null;
   if(o.spId&&F&&typeof F.fishSprite==='function'){try{canvas=F.fishSprite(o.spId,o.mut||null,256)}catch{canvas=null}}
   if(!canvas){
    canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c2=canvas.getContext('2d');
    if(c2&&typeof c2.fillText==='function'){
     try{c2.filter='hue-rotate('+(Number(o.hue)||0)+'deg)'+(o.filter?' '+o.filter:'')}catch{}
     if(o.glow&&typeof c2.arc==='function'){c2.shadowColor=o.glow;c2.shadowBlur=20}
     c2.font='88px serif';c2.textAlign='center';c2.textBaseline='middle';c2.fillText(o.text||'🐟',64,70);
     try{c2.filter='none'}catch{}
    }
   }
   function dropShow(i){const old=showPool.splice(i,1)[0];if(!old)return;scene.remove(old.sprite);try{old.sprite.material.map.dispose();old.sprite.material.dispose()}catch{}
    if(old.tag){scene.remove(old.tag);try{old.tag.material.map.dispose();old.tag.material.dispose()}catch{}}}
   const tex=new T.CanvasTexture(canvas),spr=new T.Sprite(new T.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
   spr.visible=false;scene.add(spr);
   // v295: the weight rides above the fish as its own small plate - the show-off no longer
   // posts a Local-chat line, so this is the only place the number is written.
   let tag=null;
   if(o.label){
    const tc=document.createElement('canvas');tc.width=256;tc.height=64;const tctx=tc.getContext&&tc.getContext('2d');
    if(tctx&&typeof tctx.fillText==='function'){
     const text=String(o.label).slice(0,24);
     tctx.font='bold 40px Trebuchet MS, sans-serif';tctx.textAlign='center';tctx.textBaseline='middle';
     if(typeof tctx.strokeText==='function'){tctx.lineWidth=9;tctx.strokeStyle='rgba(8,14,20,.9)';tctx.strokeText(text,128,34)}
     tctx.fillStyle=o.glow||'#ffe9a8';tctx.fillText(text,128,34);
     const ttex=new T.CanvasTexture(tc);
     tag=new T.Sprite(new T.SpriteMaterial({map:ttex,transparent:true,depthTest:false}));
     tag.scale.set(1.9,.48,1);tag.visible=false;scene.add(tag);
    }
   }
   // v299 (owner): a show-off replaces that angler's previous one instead of stacking on top of it.
   // The local draw and the relayed echo of the same catch used to put two fish and two weight
   // plates at the same spot. Disposing the old entry also keeps the pool from filling with them.
   for(let i=showPool.length-1;i>=0;i--)if(showPool[i].pid===pid)dropShow(i);
   while(showPool.length>=6)dropShow(0);
   // v311: the ceiling follows the pond - a 1 t fish is 13 units across in a 13 x 18 pond.
   showPool.push({sprite:spr,tag,pid,t0:clock||performance.now(),dur:Math.max(1200,Math.min(9000,o.ms||5200)),scale:Math.max(.4,Math.min(13.2,Number(o.scale)||1))});
  }
  let rig={mode:'off'},nextIdleRipple=0,catchAnim=null;
  function ripple(x,z,scale=1){const r=ripples.find(r=>!r.m.visible)||ripples[0];r.m.visible=true;r.t0=clock||performance.now();r.dur=900;r.m.position.set(x,.034,z);r.base=scale}
  function splash(x,z,n=18){splashDrops=Array.from({length:Math.min(26,n)},(_,i)=>({a:i*2.399,v:.9+((i*37)%17)/14,vy:1.8+((i*29)%13)/6}));splashT0=clock||performance.now();splashPts.visible=true;splashPts.position.set(x,.05,z)}
  function selfPos(){const p=players.get(callbacks.self());return p?p.sprite.position:null}
  // v295: other players' rigs. The worker broadcasts each angler's line position, so every
  // player sees the bobber in the water - not just the caster. One small group per remote
  // angler, built on demand and disposed the moment their line comes out.
  const remoteRigs=new Map();
  function dropRig(pid){
   const r=remoteRigs.get(pid);if(!r)return;
   scene.remove(r.group);
   if(r.poleRod)disposePole(r.poleRod);
   for(const m of [r.bobTop,r.bobBot]){try{m.geometry.dispose()}catch{}try{m.material.dispose()}catch{}}
   remoteRigs.delete(pid);
  }
  function setRig(pid,st){
   if(!st||st.on!==true){dropRig(pid);return}
   const tx=Math.max(-60,Math.min(60,Number(st.x)||0)),tz=Math.max(-60,Math.min(60,Number(st.z)||0));
   let r=remoteRigs.get(pid);
   if(r&&st.rod&&st.rod!==r.rod){r.rod=st.rod;if(r.poleRod)stylePole(r.poleRod,st.rod)}
   if(!r){
    const holder=players.get(pid);
    const group=new T.Group();scene.add(group);
    const bobTop=new T.Mesh(new T.SphereGeometry(.11,10,8),new T.MeshBasicMaterial({color:0xd8402e}));
    const bobBot=new T.Mesh(new T.SphereGeometry(.09,10,8),new T.MeshBasicMaterial({color:0xf2efe4}));
    bobBot.position.y=-.09;
    const bob=new T.Group();bob.add(bobTop,bobBot);group.add(bob);
    const poleRod=makePole(.016,.032,5);stylePole(poleRod,st.rod);group.add(poleRod.group);
    const pole=poleRod.group;
    group.add(pole);
    r={group,bob,pole,poleRod,bobTop,bobBot,rod:st.rod||'twig',x:holder?holder.sprite.position.x:tx,z:holder?holder.sprite.position.z:tz,tx,tz,mode:'wait'};
    remoteRigs.set(pid,r);
   }
   r.tx=tx;r.tz=tz;
   r.mode=typeof st.mode==='string'?st.mode:'wait';
  }
  function updateRemoteRigs(now,dt){
   for(const [pid,r] of remoteRigs){
    const holder=players.get(pid);
    if(!holder){dropRig(pid);continue}
    // The bobber eases to the reported spot, so a cast reads as a throw instead of a teleport.
    const k=Math.min(1,dt*5);
    r.x+=(r.tx-r.x)*k;r.z+=(r.tz-r.z)*k;
    const dip=r.mode==='bite'?Math.max(0,Math.sin(now/90))*.3:r.mode==='reel'?Math.max(0,Math.sin(now/70))*.16:0;
    r.bob.position.set(r.x,.12+Math.sin(now/520)*.05-dip,r.z);
    const px=holder.sprite.position.x,pz=holder.sprite.position.z;
    const base=Number.isFinite(holder.sprite.position.y)?holder.sprite.position.y:0;
    const h=Number.isFinite(holder.height)&&holder.height>0?holder.height:3.2;
    const dx=r.x-px,dz=r.z-pz,d=Math.hypot(dx,dz)||1,ux=dx/d,uz=dz/d;
    const hx=px+ux*.35,hz=pz+uz*.35,hy=base+h*.5,tx2=px+ux*1.5,tz2=pz+uz*1.5,ty=base+h*.76;
    const mx=(hx+tx2)/2,my=(hy+ty)/2,mz=(hz+tz2)/2,len=Math.hypot(tx2-hx,ty-hy,tz2-hz)||1;
    r.pole.position.set(mx,my,mz);r.pole.scale.set(1,len,1);
    r.pole.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3((tx2-hx)/len,(ty-hy)/len,(tz2-hz)/len));
   }
  }
  // Large, flashing MVP alert above the southern pond approach. It is shown only for a live spawn.
  let mvpSign=null,mvpSignCanvas=null,mvpSignCtx=null,mvpSignTex=null;
  function ensureMvpSign(){
   if(mvpSign) return mvpSign;
   if(!pondViews.length) return null;
   const p=pondViews[0].p || R.PONDS[0];
   // v380 (owner: "a Warning Sign floating above the lake when the MVP arrives"): the board
   // hovers over the water itself - no posts - and updateMvpSign() bobs it with the pulse.
   const sx=p.x, sz=p.z;
   const group=new T.Group();group.name='socialMvpAlertSign';group.userData.socialMvpSign=true;
   mvpSignCanvas=document.createElement('canvas');mvpSignCanvas.width=1024;mvpSignCanvas.height=256;
   mvpSignCtx=mvpSignCanvas.getContext('2d');
   mvpSignTex=new T.CanvasTexture(mvpSignCanvas);
   const board=new T.Mesh(new T.PlaneGeometry(9.2,2.3),new T.MeshBasicMaterial({map:mvpSignTex,transparent:true,side:T.DoubleSide,depthWrite:false}));
   board.userData.socialMvpSignBoard=true;board.position.set(sx,6.4,sz);board.rotation.y=Math.PI;
   group.add(board);
   group.visible=false;scene.add(group);
   mvpSign={group,canvas:mvpSignCanvas,ctx:mvpSignCtx,tex:mvpSignTex,board,sx,sz};
   return mvpSign;
  }
  function paintMvpSign(name){
   const m=ensureMvpSign();if(!m||!m.ctx)return;
   const c=m.canvas,g=m.ctx;
   g.clearRect(0,0,c.width,c.height);
   g.fillStyle='#2a101b';g.fillRect(0,0,c.width,c.height);
   g.fillStyle='#8b1d2c';g.fillRect(12,12,c.width-24,c.height-24);
   g.fillStyle='#ff2447';g.fillRect(0,0,c.width,18);g.fillRect(0,c.height-18,c.width,18);
   g.strokeStyle='#ffd46b';g.lineWidth=8;if(typeof g.strokeRect==='function')g.strokeRect(9,9,c.width-18,c.height-18);
   g.textAlign='center';g.textBaseline='middle';
   const headline='MVP ALERT: '+String(name||'BOSS FISH').toUpperCase();
   let size=82;g.font='bold '+size+'px Trebuchet MS, sans-serif';
   if(typeof g.measureText==='function')while(size>54&&g.measureText(headline).width>c.width-64){size-=4;g.font='bold '+size+'px Trebuchet MS, sans-serif'}
   const pulse=0.84+0.16*Math.sin(Date.now()/200);
   g.globalAlpha=pulse;g.fillStyle='#fff4dc';g.fillText(headline,c.width/2,99);g.globalAlpha=1;
   g.fillStyle='#ffe9a0';g.font='bold 34px Trebuchet MS, sans-serif';
   g.fillText('ACTIVE AT THE POND · REEL IT IN!',c.width/2,194);
   m.tex.needsUpdate=true;
  }
  let mvpFloat=null;
  function ensureMvpFloat(){
   if(mvpFloat)return mvpFloat;
   if(!pondViews.length)return null;
   const p=pondViews[0].p||R.PONDS[0],group=new T.Group();
   group.name='socialMvpFloat';group.userData.socialMvpFloat=true;group.position.set(p.x,0,p.z);
   const ringMat=new T.MeshBasicMaterial({color:0x8ceaff,transparent:true,opacity:.58,side:T.DoubleSide,blending:T.AdditiveBlending,depthWrite:false});
   const ring=new T.Mesh(new T.RingGeometry(1.15,1.42,48),ringMat);ring.rotation.x=-Math.PI/2;ring.position.y=.055;ring.userData.socialMvpHalo=true;group.add(ring);
   const material=new T.SpriteMaterial({transparent:true,depthTest:false,depthWrite:false});
   const sprite=new T.Sprite(material);sprite.userData.socialMvpFish=true;sprite.position.set(0,2.55,0);sprite.scale.set(4.4,4.4,1);sprite.renderOrder=25;group.add(sprite);
   group.visible=false;scene.add(group);
   mvpFloat={group,ring,sprite,texture:null,baseY:2.55};
   return mvpFloat;
  }
  function mvpArt(spId){
   const F=globalThis.PGSocialFishing;
   try{const canvas=F&&typeof F.fishSprite==='function'?F.fishSprite(spId,null,256):null;if(canvas)return canvas}catch{}
   const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
   const ctx=canvas.getContext&&canvas.getContext('2d'),sp=F&&typeof F.speciesById==='function'?F.speciesById(spId):null;
   if(ctx&&typeof ctx.fillText==='function'){ctx.font='176px serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(sp&&sp.glyph||'🐟',128,132)}
   return canvas;
  }
  /* v380 (owner): "mvp half body is peek above the pond ... scale on the weights". The boss is
     drawn rising out of the water: the sprite art is cut at a wavy waterline (lower body erased,
     a ripple drawn along the cut) and the whole peek scales with the species' real weight range -
     a 3,000 kg Void Maw looms well over a 1,000 kg Azure Drake. Falls back to the plain art when
     a canvas is too limited for the compositing. */
  const MVP_BASE_PX=256;
  function mvpWeightScale(spId){
   const F=globalThis.PGSocialFishing;let max=1500;
   try{const sp=F&&typeof F.speciesById==='function'?F.speciesById(spId):null;if(sp&&Number(sp.max)>0)max=Number(sp.max)}catch{}
   return .8+.5*Math.min(1,Math.max(0,(max-1000)/2000)); // 1,000 kg -> .8 · 3,000 kg -> 1.3
  }
  function mvpPeekCanvas(spId){
   /* The canvas draw is size-independent (head fully in frame, waterline at 62%); the weight
      scale rides on the sprite mesh in setMvpFloat, so a heavy boss is simply bigger overall. */
   const art=mvpArt(spId),k=mvpWeightScale(spId),wl=MVP_BASE_PX*.60;
   try{
    const c=document.createElement('canvas');c.width=c.height=MVP_BASE_PX;
    const g=c.getContext('2d');if(!g)return art;
    const w=246,h=246;
    g.drawImage(art,(MVP_BASE_PX-w)/2,wl-h*.62,w,h);
    g.globalCompositeOperation='destination-out';
    g.beginPath();g.moveTo(0,wl);
    for(let x=0;x<=MVP_BASE_PX;x+=8)g.lineTo(x,wl+4+Math.sin(x/MVP_BASE_PX*Math.PI*2+1)*5);
    g.lineTo(MVP_BASE_PX,MVP_BASE_PX);g.lineTo(0,MVP_BASE_PX);g.closePath();g.fill();
    g.globalCompositeOperation='source-over';
    g.strokeStyle='rgba(150,236,255,.8)';g.lineWidth=3;
    g.beginPath();
    for(let x=4;x<=MVP_BASE_PX-4;x+=8){const y=wl+Math.sin(x/MVP_BASE_PX*Math.PI*2+1)*5;if(x===4)g.moveTo(x,y);else g.lineTo(x,y)}
    g.stroke();
    return {canvas:c,scale:k};
   }catch{return {canvas:art,scale:k}}
  }
  function setMvpFloat(spId,on){
   const m=ensureMvpFloat();if(!m)return;
   if(!on){m.group.visible=false;m.group.userData.spId=null;return}
   const peek=mvpPeekCanvas(spId);
   const tex=new T.CanvasTexture(peek.canvas);
   if(m.texture)m.texture.dispose();
   m.texture=tex;m.sprite.material.map=tex;m.sprite.material.needsUpdate=true;
   const k=peek&&peek.scale||1,size=4.4*k;
   m.sprite.scale.set(size,size,1);
   m.ring.scale.setScalar(k);
   m.group.userData.spId=spId;m.group.userData.k=k;m.group.visible=true;
  }
  function updateMvpFloat(now){
   const m=mvpFloat;if(!m||!m.group.visible)return;
   const pulse=Math.sin(now/520);
   m.sprite.position.y=m.baseY+pulse*.16;
   const k=m.group.userData.k||1;
   m.ring.scale.setScalar(k*(1+.08*pulse));
   m.ring.material.opacity=.5+.12*Math.sin(now/470);
   // v380: the floating warning sign above the lake breathes with the same pulse.
   const sign=ensureMvpSign();
   if(sign&&sign.group.visible)sign.board.position.y=6.4+pulse*.12;
  }
  let mvpActiveSign=null,mvpSignTimer=0;
  function setMvpSign(spId,on){
   setMvpFloat(spId,on);
   const m=ensureMvpSign();if(!m)return;
   if(!on){m.group.visible=false;mvpActiveSign=null;if(mvpSignTimer){clearInterval(mvpSignTimer);mvpSignTimer=0}return}
   mvpActiveSign=spId;
   const F=globalThis.PGSocialFishing;let name=spId;
   try{const sp=F&&F.speciesById?F.speciesById(spId):null;if(sp)name=sp.name}catch{}
   paintMvpSign(name);
   m.group.visible=true;
   if(mvpSignTimer)clearInterval(mvpSignTimer);
   mvpSignTimer=setInterval(()=>paintMvpSign(name),200);
  }
  const api={
   setFishVisible(v){fishGroup.visible=v!==false},
   setMvp:(spId,on)=> setMvpSign(spId,on),
   setRig,
   clearRigs(){for(const pid of [...remoteRigs.keys()])dropRig(pid)},
   cast(to,dur,onLand){const from=selfPos();rig={mode:'flight',fx:from?from.x:to.x,fz:from?from.z:to.z,tx:to.x,tz:to.z,t0:clock||performance.now(),dur:Math.max(250,dur||700),onLand};bobber.visible=true;pole.visible=true;line.visible=true},
   bite(on){if(rig.mode==='idle'&&on)rig.mode='bite';else if(rig.mode==='bite'&&!on)rig.mode='idle';mark.visible=!!on&&rig.mode==='bite'},
   reel(intensity){if(rig.mode==='bite'||rig.mode==='idle'||rig.mode==='reel'){rig.mode='reel';rig.intensity=Math.max(0,Math.min(1,intensity||0));mark.visible=false}},
   catchFly(text,hue,done){const from={x:bobber.position.x,z:bobber.position.z};
    // v294: `text` may be {spId,mut,glyph,hue} - draw the painted species sprite when available.
    const info=text&&typeof text==='object'?text:null;if(info&&hue==null)hue=info.hue;
    let drawn=false;
    const F=(typeof globalThis!=='undefined'&&globalThis.PGSocialFishing)||null;
    if(info&&info.spId&&F&&typeof F.fishSprite==='function'&&glyphCtx&&typeof glyphCtx.drawImage==='function'){
     try{const art=F.fishSprite(info.spId,info.mut||null,96);if(art){glyphCtx.clearRect(0,0,96,96);glyphCtx.drawImage(art,0,0,96,96);glyphTex.needsUpdate=true;drawn=true}}catch{}
    }
    if(!drawn&&glyphCtx&&typeof glyphCtx.fillText==='function'){glyphCtx.clearRect(0,0,96,96);try{glyphCtx.filter='hue-rotate('+(hue||0)+'deg)'}catch{}glyphCtx.font='64px serif';glyphCtx.textAlign='center';glyphCtx.textBaseline='middle';glyphCtx.fillText((info?info.glyph:text)||'🐟',48,52);try{glyphCtx.filter='none'}catch{}glyphTex.needsUpdate=true}
    splash(from.x,from.z,24);ripple(from.x,from.z,1.4);catchAnim={fx:from.x,fz:from.z,t0:clock||performance.now(),dur:760,done};glyph.visible=true;api.hide(true)},
   escapeSplash(){if(bobber.visible){splash(bobber.position.x,bobber.position.z,14);ripple(bobber.position.x,bobber.position.z,1.2)}api.hide()},
   ripple,splash,showFish,
   // v300: the equipped rod's tier paints the local pole.
   rod:setRod,
   hide(keepPole){rig={mode:'off'};bobber.visible=false;mark.visible=false;if(!keepPole){pole.visible=false;line.visible=false}},
   off(){api.hide();glyph.visible=false;catchAnim=null},
  };
  // v296: the rod is measured from the character's own feet and height. It used to use fixed
  // world heights (1.1 / 2.15), so it sat at hip level on the ground and drifted up the body the
  // moment the player sat on an angler chair - the same rod, two different heights.
  function placeRod(bx,by,bz,now){const p=selfPos();if(!p){pole.visible=line.visible=false;return}
   const holder=players.get(callbacks.self());
   const base=Number.isFinite(p.y)?p.y:0,h=Number.isFinite(holder&&holder.height)&&holder.height>0?holder.height:3.2;
   const dx=bx-p.x,dz=bz-p.z,d=Math.hypot(dx,dz)||1,ux=dx/d,uz=dz/d;
   const hx=p.x+ux*.35,hz=p.z+uz*.35,hy=base+h*.5,tx=p.x+ux*1.7,tz=p.z+uz*1.7,ty=base+h*.78;
   const mx=(hx+tx)/2,my=(hy+ty)/2,mz=(hz+tz)/2,len=Math.hypot(tx-hx,ty-hy,tz-hz);
   // v300: golden and mythril poles breathe, so the glow reads as light rather than paint.
   if(poleRod&&Number.isFinite(poleRod.base))try{
    const k=poleRod.pulse?1+.3*Math.sin(now/420):1;
    poleRod.glow.material.opacity=Math.min(.85,poleRod.base*k);
    poleRod.haze.material.opacity=Math.min(.3,poleRod.hazeBase*k);
   }catch{}
   pole.position.set(mx,my,mz);pole.scale.set(1,len,1);pole.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3((tx-hx)/len,(ty-hy)/len,(tz-hz)/len));
   for(let i=0;i<8;i++){const t=i/7,sag=Math.sin(t*Math.PI)*Math.max(.2,d*.06),px=tx+(bx-tx)*t,py=ty+(by+.12-ty)*t-sag,pz=tz+(bz-tz)*t;linePts[i*3]=px;linePts[i*3+1]=py;linePts[i*3+2]=pz}
   lineGeo.attributes.position.needsUpdate=true;lineGeo.computeBoundingSphere?.();
  }
  function update(now,dt){
   for(const design of pondDesigns)design.update(now/1000,camera);
   updateMvpFloat(now);
   updateRemoteRigs(now,dt);
   waterTexA.offset.x=(now/14000)%1;waterTexA.offset.y=(now/23000)%1;waterTexB.offset.x=1-(now/17000)%1;waterTexB.offset.y=(now/19000)%1;
   for(const f of falls)f.tex.offset.y=(now/700)%1;
   for(const l of lilies){l.mesh.position.x=l.x+Math.sin(now/2600+l.ph)*.22;l.mesh.position.z=l.z+Math.cos(now/3100+l.ph)*.18;l.mesh.rotation.z=Math.sin(now/4000+l.ph)*.4}
   animateAetherwell(now);
   if(fishGroup.visible){const tNow=now/1000;for(const s of swimmers){const t=tNow,x=s.p.x+Math.sin(t*s.fa+s.pa)*s.ax,z=s.p.z+Math.sin(t*s.fb+s.pb)*s.az,vx=Math.cos(t*s.fa+s.pa)*s.fa*s.ax,vz=Math.cos(t*s.fb+s.pb)*s.fb*s.az;s.m.position.set(x,.03,z);s.m.rotation.z=Math.atan2(-vz,vx)+Math.sin(t*6+s.pa)*.12}
    updateDeep(tNow,now)}
   for(const r of ripples)if(r.m.visible){const t=(now-r.t0)/r.dur;if(t>=1)r.m.visible=false;else{const s=(r.base||1)*(.4+t*1.6);r.m.scale.set(s,s,1);r.m.material.opacity=.55*(1-t)}}
   if(splashPts.visible&&splashDrops){const t=(now-splashT0)/650;if(t>=1){splashPts.visible=false;splashDrops=null}else{splashDrops.forEach((drop,i)=>{splashPos[i*3]=Math.cos(drop.a)*drop.v*t;splashPos[i*3+1]=drop.vy*t-4.4*t*t;splashPos[i*3+2]=Math.sin(drop.a)*drop.v*t});splashGeo.attributes.position.needsUpdate=true;splashPts.material.opacity=.95*(1-t)}}
   if(catchAnim){const t=Math.min(1,(now-catchAnim.t0)/catchAnim.dur),p=selfPos();if(p){glyph.position.set(catchAnim.fx+(p.x-catchAnim.fx)*t,.4+Math.sin(t*Math.PI)*2.6+t*1.6,catchAnim.fz+(p.z-catchAnim.fz)*t)}if(t>=1){glyph.visible=false;pole.visible=false;line.visible=false;const done=catchAnim.done;catchAnim=null;done&&done()}}
   for(let i=showPool.length-1;i>=0;i--){
    const sh=showPool[i],holder=players.get(sh.pid),t=(now-sh.t0)/sh.dur;
    if(t>=1||!holder){scene.remove(sh.sprite);sh.sprite.material.map.dispose();sh.sprite.material.dispose();if(sh.tag){scene.remove(sh.tag);sh.tag.material.map.dispose();sh.tag.material.dispose()}showPool.splice(i,1);continue}
    const pop=t<.12?t/.12*1.18:t<.22?1.18-(t-.12)/.1*.18:1;
    const sc=sh.scale*pop;
    sh.sprite.visible=true;sh.sprite.scale.set(sc,sc,1);
    sh.sprite.position.set(holder.sprite.position.x,holder.sprite.position.y+holder.height+.3+sh.scale*.55+Math.sin(now/480+i)*.08,holder.sprite.position.z);
    sh.sprite.material.opacity=t>.82?1-(t-.82)/.18:1;
    // v311: the weight plate grows with the fish, so a pond-sized show-off still carries a
    // readable number instead of a stamp-sized tag pinned to a 13-unit body.
    if(sh.tag){const ts=Math.min(2.4,Math.max(1,sh.scale/3.2));sh.tag.visible=true;sh.tag.scale.set(1.9*ts,.48*ts,1);sh.tag.position.set(sh.sprite.position.x,sh.sprite.position.y+sh.scale*.5+.42+Math.sin(now/480+i)*.08,sh.sprite.position.z);sh.tag.material.opacity=sh.sprite.material.opacity}
   }
   if(rig.mode==='off')return;
   if(rig.mode==='flight'){const t=Math.min(1,(now-rig.t0)/rig.dur),x=rig.fx+(rig.tx-rig.fx)*t,z=rig.fz+(rig.tz-rig.fz)*t;bobber.position.set(x,1.4+Math.sin(t*Math.PI)*2.4-1.35*t,z);placeRod(bobber.position.x,bobber.position.y,bobber.position.z,now);
    if(t>=1){const cb=rig.onLand,lx=rig.tx,lz=rig.tz;rig={mode:'idle',x:lx,z:lz};splash(lx,lz,16);ripple(lx,lz);nextIdleRipple=now+1400;cb&&cb()}
    return}
   if(rig.mode==='idle'||rig.mode==='bite'||rig.mode==='reel'){
    const dip=rig.mode==='bite'?Math.max(0,Math.sin(now/90))*.34:rig.mode==='reel'?Math.max(0,Math.sin(now/70))*.2:0;
    const jx=rig.mode==='reel'?Math.sin(now/130)*(.25+.45*(rig.intensity||0)):0,jz=rig.mode==='reel'?Math.cos(now/170)*(.2+.4*(rig.intensity||0)):0;
    bobber.position.set(rig.x+jx,.12+Math.sin(now/520)*.05-dip,rig.z+jz);
    if(rig.mode!=='idle'&&now>nextIdleRipple){nextIdleRipple=now+(rig.mode==='reel'?240:420);ripple(bobber.position.x,bobber.position.z,rig.mode==='reel'?.9:.7)}
    else if(rig.mode==='idle'&&now>nextIdleRipple){nextIdleRipple=now+1700;ripple(rig.x,rig.z,.6)}
    if(rig.mode==='bite'){mark.position.set(bobber.position.x,1.5+Math.sin(now/120)*.14,bobber.position.z);const ms=.8+Math.sin(now/110)*.12;mark.scale.set(ms,ms,1)}
    placeRod(bobber.position.x,bobber.position.y,bobber.position.z,now);
   }
  }
  return {api,update};
 })();
 // 12 physical metal park benches, each split into 2 side-by-side seat targets (24 seats total).
 // v359: only the gym-court and field-fence benches remain wooden (ids >= 20); the ring
 // seating lives on the bleacher tiers. The plaza keeps its metal
 // frames, but every viewing bench - the ring stands, the gym court and the field fence -
 // is a wooden park bench in the town palette, with a generous click pad so a tap
 // anywhere near the seat sits you.
 const viewWoodMat=new T.MeshLambertMaterial({color:0x7d5c3b}),viewWoodDark=new T.MeshLambertMaterial({color:0x54402a});
 const benches=(R.BENCHES||R.SEATS).map(b=>{
  let mesh;
  if(Number.isInteger(b.id)&&b.id>=16){
   const g=new T.Group();g.position.set(b.x,0,b.z);g.rotation.y=b.rotation||0;
   const put=(w,h,d,mat,x,y,z)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);g.add(m);return m};
   for(const lx of [-1.5,1.5])for(const lz of [-.36,.36])put(.14,.52,.14,viewWoodDark,lx,.26,lz);
   for(const lz of [-.3,0,.3])put(3.25,.09,.27,viewWoodMat,0,.54,lz);
   for(const lx of [-1.5,1.5])put(.13,.6,.13,viewWoodDark,lx,.82,-.42);
   for(const ly of [.74,.98])put(3.25,.15,.07,viewWoodMat,0,ly,-.46);
   put(3.25,.07,.34,viewWoodDark,0,.6,0);
   scene.add(freeze(g));mesh=g;
  }else mesh=model('bench',b.x,b.z,b.size,b.rotation);
  mesh.userData.bench=b.id;
  mesh.userData.seat=Array.isArray(b.seats)?b.seats[0]:b.id;
  mesh.userData.seatBounds=new T.Box3().setFromObject(mesh).expandByScalar(b.id>=16?.45:.25);
  return mesh;
 });
 const seatTargets=R.BENCHES?benches.flatMap(mesh=>{
  // v356: bench ids are sparse (16-22 skip the pond chairs' 24-31 seat range), so resolve
  // by id - never by array position.
  const b=R.BENCHES.find(x=>x.id===mesh.userData.bench),bb=mesh.userData.seatBounds;
  return [
   {seat:b.seats[0],bench:b.id,bounds:new T.Box3(new T.Vector3(bb.min.x,bb.min.y,bb.min.z),new T.Vector3(b.x,bb.max.y,bb.max.z))},
   {seat:b.seats[1],bench:b.id,bounds:new T.Box3(new T.Vector3(b.x,bb.min.y,bb.min.z),new T.Vector3(bb.max.x,bb.max.y,bb.max.z))}
  ];
 }):benches.map(mesh=>({seat:mesh.userData.seat,bench:mesh.userData.seat,bounds:mesh.userData.seatBounds}));
 // v311 (owner: "the chairs around the pond don't work, can u make them japanese style"):
 // A zen-style pond seat - two dark sled runners, a low lacquered frame, a thick indigo zabuton
 // with a gold piping and a gently raked three-slat back. Bigger than the old stool (1.06 wide,
 // 1.31 tall) so it reads at the plaza camera, and its click pad is padded to ~2.1 units across so
 // a tap anywhere on the seat - or within a hand's width of it - sits you down instead of missing.
 if(R.CHAIRS&&R.CHAIRS.length){
  const jpWoodDark=new T.MeshLambertMaterial({color:0x3f2a17}),jpWood=new T.MeshLambertMaterial({color:0x6d4a29}),
   jpLacquer=new T.MeshLambertMaterial({color:0x9e3327}),jpCushion=new T.MeshLambertMaterial({color:0x2d4a70}),
   jpTrim=new T.MeshLambertMaterial({color:0xd8bb74});
  const box=(w,h,d,mat,x,y,z,parent)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);parent.add(m);return m};
  for(const c of R.CHAIRS){
   const g=new T.Group();g.position.set(c.x,0,c.z);g.rotation.y=c.rotation;
   // Sled runners keep the seat off the wet rim, with a dark front rail tying them together.
   for(const rz of [-.26,.26])box(.98,.09,.11,jpWoodDark,0,.045,rz,g);
   box(.86,.06,.09,jpWood,0,.1,.3,g);
   for(const lx of [-.4,.4])for(const lz of [-.24,.24])box(.1,.33,.1,jpWoodDark,lx,.235,lz,g);
   // Lacquered seat frame, a gold piping edge and the zabuton that actually carries the sitter.
   // The cushion tops out at 0.66, so the native sitting pose (R.SEATS[].height 0.66) rests on it
   // instead of sinking into it.
   box(1.06,.09,.66,jpLacquer,0,.4,0,g);
   box(1,.03,.62,jpTrim,0,.455,0,g);
   box(.94,.18,.56,jpCushion,0,.57,0,g);
   // Raked back: two uprights and three slats, leaning away from the pond.
   const hub=new T.Group();hub.position.set(0,.52,-.33);hub.rotation.x=-.2;g.add(hub);
   for(const px of [-.42,.42])box(.09,.78,.09,jpWoodDark,px,.39,0,hub);
   for(const sy of [.16,.4,.64])box(.86,.11,.07,jpWood,0,sy,0,hub);
   box(.94,.07,.12,jpLacquer,0,.82,0,hub);
   g.userData.seat=c.id;scene.add(freeze(g));
   // A generous pad: the whole seat, its back and a hand's width of rim.
   seatTargets.push({seat:c.id,bench:100+c.id,bounds:new T.Box3().setFromObject(g).expandByScalar(.55)});
  }
 }
 // v359: each bleacher seat answers a click on its tier - a flat slab just above the
 // boards, so a click on the front row is never stolen by the taller tiers behind it.
 if(R.BLEACHER_ROWS)for(const row of R.BLEACHER_ROWS)for(const seat of row.seats){
  seatTargets.push({seat:seat.id,bench:seat.bench,bounds:new T.Box3(new T.Vector3(seat.x-.8,row.height-.2,seat.z-.8),new T.Vector3(seat.x+.8,row.height+.35,seat.z+.8))});
 }

 const water=new T.Mesh(new T.CircleGeometry(3.7,48),new T.MeshBasicMaterial({color:0x60c9dc,transparent:true,opacity:.65}));water.rotation.x=-Math.PI/2;water.position.y=.7;scene.add(freeze(water));
 const sprayGeo=new T.BufferGeometry(),spray=new Float32Array(72*3);sprayGeo.setAttribute('position',new T.BufferAttribute(spray,3));const drops=new T.Points(sprayGeo,new T.PointsMaterial({color:0xd6f8ff,size:.14,transparent:true,opacity:.8}));scene.add(drops);
 const allClasses={...PGWardrobe.CLASSES,...PGFourthJobs.CLASSES};const stores=[new PGWardrobe.Store({budget:96*1024*1024}),new PGFourthJobs.Store({budget:64*1024*1024}),new PGWardrobe.Store({base:'assets/social/sitting/',classes:allClasses,budget:48*1024*1024,stances:['sit']})];

 // v266: Two Plaza Hold'em tables along the West Promenade, 12 cushioned stools and 2 native Dealers.
 const woodDark=new T.MeshLambertMaterial({color:0x4b2e1b}),woodRail=new T.MeshLambertMaterial({color:0x633a22}),brassMat=new T.MeshLambertMaterial({color:0xcba458}),velvetRed=new T.MeshLambertMaterial({color:0x8d2630}),velvetBlue=new T.MeshLambertMaterial({color:0x274d78}),feltBaseMat=new T.MeshLambertMaterial({color:0x17583b});
 const tableSpecs=R.POKER.tables||[{id:0,label:'Table 1',table:R.POKER.table,dealer:R.POKER.dealer,seats:R.POKER.seats}];
 // Named on-map staff reuse the native wardrobe sprites, with clickable dialogue.
 // Cook Lina opens provisions and Guide Nia opens the real roster-backed DigiDex.
 const sanctuaryNpcSpecs=[
  {id:'coach',name:'Coach Mara',role:'GYM',x:69,z:20,cls:'Monk',sex:'f',head:14,color:3,text:'Bring your partner close to a station and tap Train. You can walk away while you stay online.'},
  {id:'food',name:'Cook Lina',role:'FOOD CART',x:28,z:39,cls:'Merchant',sex:'f',head:2,color:3,text:'Pet Meals and Mystery Digi-Eggs are ready! I accept Pet Coins for your DigiPet bag.'},
  {id:'trainer',name:'Trainer Jori',role:'TRAINER',x:27.7,z:55,cls:'Knight',sex:'m',head:19,color:6,text:'Choose a partner in DigiPet, then visit Coach Mara and the gym stations.'},
  {id:'guide',name:'Guide Nia',role:'FIELD GUIDE',x:27.7,z:71,cls:'Hunter',sex:'f',head:14,color:2,text:'The DigiDex lists every bundled form and all supported direct evolution branches. Start grinding to meet named same-stage groups and find bonus petgold or Digi-Eggs.'},
  {id:'ring',name:'Ringkeeper Rook',role:'BOXING RING',x:51,z:94,cls:'Crusader',sex:'m',head:19,color:4,text:'Two trainers: take opposite sides below the ring, enter together, and both accept. Your Digimon fight automatically after a three-second countdown.'}
 ];
 const sanctuaryNpcs=sanctuaryNpcSpecs.map(spec=>{
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=280;
  const ctx=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);texture.magFilter=texture.minFilter=T.NearestFilter;texture.generateMipmaps=false;
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthTest:true,alphaTest:.05}));sprite.userData.sanctuaryNpc=spec.id;sprite.center.set(.5,80/280);sprite.position.set(spec.x,.06,spec.z);scene.add(sprite);
  const bounds=new T.Box3(new T.Vector3(spec.x-.75,0,spec.z-.75),new T.Vector3(spec.x+.75,3.1,spec.z+.75));
  const label=document.createElement('div');label.className='social-npc-label sanctuary-npc-label';label.dataset.sanctuaryNpc=spec.id;
  const tag=document.createElement('span');tag.className='social-npc-tag';tag.textContent=spec.role;
  const button=document.createElement('button');button.type='button';button.textContent=spec.name;button.title='Talk to '+spec.name;
  const bubble=document.createElement('div');bubble.className='social-npc-bubble sanctuary-npc-bubble';bubble.hidden=true;bubble.dataset.sanctuaryNpc=spec.id;
  label.append(tag,button);labels.append(label,bubble);
  const unit={spec,ctx,texture,sprite,bounds,label,button,bubble,look:null,loading:false,retryAt:0,paint:'',bubbleUntil:0};
  button.onclick=()=>talkSanctuaryNpc(unit);return unit;
 });
 function talkSanctuaryNpc(unit){for(const other of sanctuaryNpcs)if(other!==unit){other.bubble.hidden=true;other.bubbleUntil=0}unit.bubble.textContent=unit.spec.text;unit.bubble.hidden=false;unit.bubbleUntil=Math.max(performance.now(),clock)+9000;if(unit.spec.id==='food')callbacks.sanctuaryShop?.();if(unit.spec.id==='guide')callbacks.sanctuaryIndex?.()}
 // DOM labels do not participate in the WebGL depth buffer. Suppress them
 // when a camera ray actually crosses a gym wall below its eaves.
 function behindGymWall(x,y,z){
  const c=camera.position,rx=x-c.x,rz=z-c.z;
  for(const wall of R.SANCTUARY_GYM_WALLS){const sx=wall.x2-wall.x1,sz=wall.z2-wall.z1,den=rx*sz-rz*sx;if(Math.abs(den)<1e-8)continue;const qx=wall.x1-c.x,qz=wall.z1-c.z,t=(qx*sz-qz*sx)/den,u=(qx*rz-qz*rx)/den,top=wall.x1===wall.x2?9.7:11.9;if(t>0&&t<1&&u>=0&&u<=1&&c.y+(y-c.y)*t<top)return true}
  return false;
 }
 function updateSanctuaryNpcs(now,w,h){
  const ready=!players.size||[...players.values()].some(p=>p.looks.normal);
  for(const n of sanctuaryNpcs){
   if(ready&&!n.look&&!n.loading&&now>=n.retryAt){const cls=Object.hasOwn(allClasses,n.spec.cls)?n.spec.cls:'Novice';const appearance=PGWardrobe.normalize({version:1,sex:n.spec.sex,heads:{m:n.spec.head,f:n.spec.head},colors:{m:n.spec.color,f:n.spec.color},halo:false,glasses:false,wings:false,headwear:'none',facewear:'none',mouthwear:'none',backwear:'none',outfit:'none'})||PGWardrobe.defaults(n.spec.sex);const store=Object.hasOwn(PGFourthJobs.CLASSES,cls)?stores[1]:stores[0];n.loading=true;store.select('sanctuary-npc-'+n.spec.id,appearance,cls).then(look=>{if(look){n.look=look;n.paint=''}else n.retryAt=performance.now()+3000}).catch(()=>{n.retryAt=performance.now()+3000}).finally(()=>{n.loading=false})}
   if(n.look){const dir=(Math.round(angle/(Math.PI/4))+8)%8,anim=PGWardrobe.animationKey&&Array.isArray(n.look.pieces)?PGWardrobe.animationKey(n.look,'idle',dir,now,null,now):PGWardrobe.frameIndex(n.look.base.metadata.actions['idle'+dir],now),key=(n.look.key||n.spec.id)+':'+dir+':'+anim;if(key!==n.paint){n.paint=key;PGWardrobe.draw(n.ctx,n.look,'idle',dir,now,null,now,null,null);n.texture.needsUpdate=true;const scale=2.6/n.look.base.figureHeight;n.sprite.scale.set(320*scale,280*scale,1)}}
   head.copy(n.sprite.position);head.y+=3.35;head.project(camera);const hidden=head.z>1||head.z<-1||Math.abs(head.x)>1||Math.abs(head.y)>1||behindGymWall(n.spec.x,2,n.spec.z);n.label.hidden=hidden||!n.look;
   if(!hidden){const x=((head.x+1)*w*.5).toFixed(1)+'px',y=((1-head.y)*h*.5).toFixed(1)+'px';n.label.style.left=x;n.label.style.top=y;n.bubble.style.left=x;n.bubble.style.top=((1-head.y)*h*.5-46).toFixed(1)+'px'}
   n.bubble.hidden=hidden||n.bubbleUntil<=now;
  }
 }
 const pokerUnits=tableSpecs.map(spec=>{
  const t=spec.table,dSpec=spec.dealer;
  const grp=new T.Group();grp.position.set(t.x,0,t.z);grp.userData.pokerTable=spec.id;
  // Single-mesh woven carpet with hardware depth offset so it never Z-fights with road/plaza or a trim layer.
  const rugCanvas=document.createElement('canvas');rugCanvas.width=256;rugCanvas.height=192;
  const rCtx=rugCanvas.getContext('2d');
  const rugHex='#'+Number(dSpec.rugColor||0x4a2127).toString(16).padStart(6,'0');
  const trimHex='#'+Number(dSpec.trimColor||0xb89652).toString(16).padStart(6,'0');
  if(rCtx&&typeof rCtx.fillRect==='function'){
   rCtx.fillStyle=trimHex;rCtx.fillRect(0,0,256,192);
   rCtx.fillStyle=rugHex;rCtx.fillRect(9,9,238,174);
   rCtx.strokeStyle='rgba(236,206,134,0.45)';rCtx.lineWidth=3;
   if(typeof rCtx.strokeRect==='function')rCtx.strokeRect(18,18,220,156);
  }
  const rugTex=new T.CanvasTexture(rugCanvas);
  const rugMat=new T.MeshBasicMaterial({
   ...(rCtx&&typeof rCtx.fillRect==='function'?{map:rugTex}:{color:dSpec.rugColor||0x4a2127}),
   polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4
  });
  const rug=new T.Mesh(new T.PlaneGeometry(7.05,5.15),rugMat);
  rug.rotation.x=-Math.PI/2;rug.position.y=.042;rug.renderOrder=1;grp.add(rug);
  for(const sx of [-1.05,1.05]){const ped=new T.Mesh(new T.CylinderGeometry(.28,.46,.9,12),woodDark);ped.position.set(sx,.46,0);grp.add(ped)}
  const beam=new T.Mesh(new T.BoxGeometry(2.1,.15,.2),woodDark);beam.position.set(0,.28,0);grp.add(beam);
  const outerDeck=new T.Mesh(new T.CylinderGeometry(1.48,1.42,.15,36),woodRail);outerDeck.scale.set(1.48,1,.95);outerDeck.position.y=.91;grp.add(outerDeck);
  const brassRim=new T.Mesh(new T.CylinderGeometry(1.36,1.36,.16,36),brassMat);brassRim.scale.set(1.45,1,.92);brassRim.position.y=.93;grp.add(brassRim);
  const feltDeck=new T.Mesh(new T.CylinderGeometry(1.31,1.31,.17,36),feltBaseMat);feltDeck.scale.set(1.44,1,.91);feltDeck.position.y=.95;grp.add(feltDeck);
  for(const [cx,cz,col,ch] of [[-.32,-.92,0xd94444,.14],[-.16,-.94,0xf0c95c,.18],[0,-.94,0x3c89d9,.12],[.18,-.92,0xf2ede2,.16]]){
   const stackMesh=new T.Mesh(new T.CylinderGeometry(.065,.065,ch,12),new T.MeshBasicMaterial({color:col}));stackMesh.position.set(cx,1.055+ch/2,cz);grp.add(stackMesh);
  }
  const feltCanvas=document.createElement('canvas');feltCanvas.width=512;feltCanvas.height=304;
  const feltCtx=feltCanvas.getContext('2d'),feltTex=new T.CanvasTexture(feltCanvas);
  const feltPlane=new T.Mesh(new T.PlaneGeometry(3.15,1.86),new T.MeshBasicMaterial({map:feltTex,transparent:true,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  feltPlane.rotation.x=-Math.PI/2;feltPlane.position.y=1.056;feltPlane.renderOrder=2;grp.add(feltPlane);
  scene.add(freeze(grp));
  const tableBounds=new T.Box3().setFromObject(grp);tableBounds.min.x=t.minX;tableBounds.max.x=t.maxX;tableBounds.min.z=t.minZ+.4;tableBounds.max.z=t.maxZ;tableBounds.max.y=1.4;

  const dCanvas=document.createElement('canvas');dCanvas.width=320;dCanvas.height=280;
  const dCtx=dCanvas.getContext('2d'),dTex=new T.CanvasTexture(dCanvas);dTex.magFilter=dTex.minFilter=T.NearestFilter;dTex.generateMipmaps=false;
  const dSprite=new T.Sprite(new T.SpriteMaterial({map:dTex,transparent:true,depthTest:true,alphaTest:.05}));
  dSprite.userData.npcId=dSpec.id;dSprite.userData.tableId=spec.id;dSprite.center.set(.5,80/280);dSprite.position.set(dSpec.x,.06,dSpec.z);scene.add(dSprite);
  const dealerBounds=new T.Box3(new T.Vector3(dSpec.x-.9,0,dSpec.z-.85),new T.Vector3(dSpec.x+.9,2.9,dSpec.z+.85));

  const npcLabel=document.createElement('div');npcLabel.className='social-npc-label';npcLabel.dataset.npc=dSpec.id;npcLabel.dataset.table=spec.id;
  const npcTag=document.createElement('span');npcTag.className='social-npc-tag';npcTag.textContent=`${(spec.label||'TABLE').toUpperCase()} · HOLD'EM`;
  const npcBtn=document.createElement('button');npcBtn.type='button';npcBtn.textContent='🃏 '+dSpec.name;npcBtn.onclick=()=>callbacks.pokerOpen?.(spec.id);
  const npcSub=document.createElement('small');npcSub.className='social-npc-sub';npcSub.textContent='0 / 6 seated';
  npcLabel.append(npcTag,npcBtn,npcSub);
  const npcBubble=document.createElement('div');npcBubble.className='social-npc-bubble';npcBubble.dataset.npc=dSpec.id;npcBubble.hidden=true;
  labels.append(npcLabel,npcBubble);

  const unit={
   id:spec.id,spec,dSpec,feltCtx,feltTex,lastFeltKey:'',tableBounds,dealerBounds,
   dSprite,dCtx,dTex,npcLabel,npcSub,npcBubble,
   look:null,loading:false,retryAt:0,paint:'',height:3.2,lx:'',ly:'',lhid:null,bx:'',by:'',bhid:true,bubbleUntil:0
  };
  return unit;
 });

 function paintUnitFelt(u,snap){
  const key=snap?`${snap.phase}:${(snap.community||[]).join(',')}:${snap.pot||0}:${snap.seatedCount||0}`:'idle';
  if(key===u.lastFeltKey)return;u.lastFeltKey=key;
  const ctx=u.feltCtx;if(!ctx||typeof ctx.fillRect!=='function')return;
  ctx.clearRect(0,0,512,304);
  ctx.fillStyle='#196141';ctx.fillRect(0,0,512,304);
  ctx.strokeStyle='rgba(232,199,118,0.58)';ctx.lineWidth=4;ctx.strokeRect(18,18,476,268);
  ctx.strokeStyle='rgba(232,199,118,0.25)';ctx.lineWidth=2;ctx.strokeRect(28,28,456,248);
  ctx.fillStyle='rgba(240,219,165,0.78)';ctx.font='bold 18px Georgia, serif';ctx.textAlign='center';
  ctx.fillText(`${(u.spec.label||'TABLE 1').toUpperCase()} · PLAZA HOLD'EM`,256,58);
  const cards=snap?.community||[];
  const suitGlyph={s:'♠',h:'♥',d:'♦',c:'♣'};
  for(let i=0;i<5;i++){
   const x=78+i*74,y=92,w=60,h=86,code=cards[i];
   if(code){
    ctx.fillStyle='#fcfaf2';ctx.fillRect(x,y,w,h);
    ctx.strokeStyle='#d4b16a';ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);
    const red=code[1]==='h'||code[1]==='d';
    ctx.fillStyle=red?'#c2272d':'#1c252c';
    ctx.font='bold 24px Trebuchet MS, sans-serif';
    ctx.fillText(code[0]==='T'?'10':code[0],x+30,y+38);
    ctx.font='26px Georgia, serif';
    ctx.fillText(suitGlyph[code[1]]||'',x+30,y+70);
   }else{
    ctx.strokeStyle='rgba(232,199,118,0.34)';ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);
   }
  }
  ctx.fillStyle='#ffe49c';ctx.font='bold 20px Trebuchet MS, sans-serif';
  const pot=Number(snap?.pot||0);
  ctx.fillText(pot>0?`POT · ${pot.toLocaleString()} CHIPS`:'CLICK ANY STOOL TO SIT',256,222);
  ctx.fillStyle='rgba(225,238,229,0.78)';ctx.font='15px Trebuchet MS, sans-serif';
  ctx.fillText('BLINDS 10 / 20 · NO-LIMIT HOLD\'EM',256,252);
  u.feltTex.needsUpdate=true;
 }
 for(const u of pokerUnits)paintUnitFelt(u,null);

 const pokerStools=R.POKER.seats.map(s=>{
  const g=new T.Group();g.position.set(s.x,0,s.z);
  const base=new T.Mesh(new T.CylinderGeometry(.12,.33,.58,12),woodDark);base.position.y=.29;g.add(base);
  const ring=new T.Mesh(new T.TorusGeometry(.26,.024,6,16),brassMat);ring.rotation.x=Math.PI/2;ring.position.y=.22;g.add(ring);
  const pan=new T.Mesh(new T.CylinderGeometry(.42,.39,.08,18),woodRail);pan.position.y=.61;g.add(pan);
  const pad=new T.Mesh(new T.CylinderGeometry(.39,.41,.09,18),s.tableId===1?velvetBlue:velvetRed);pad.position.y=.68;g.add(pad);
  g.userData.pokerSeat=s.id;g.userData.tableId=s.tableId||0;
  scene.add(freeze(g));
  g.userData.pokerSeatBounds=new T.Box3().setFromObject(g).expandByScalar(.32);
  return g;
 });

 function loadDealers(now){
  if(players.size&&![...players.values()].some(p=>p.looks.normal))return;
  for(const u of pokerUnits){
   if(u.look||u.loading||now<u.retryAt)continue;
   const cls=Object.hasOwn(allClasses,u.dSpec.cls)?u.dSpec.cls:'Novice';
   const app=PGWardrobe.normalize(u.dSpec.appearance)||PGWardrobe.defaults('m');
   const store=Object.hasOwn(PGFourthJobs.CLASSES,cls)?stores[1]:stores[0];
   u.loading=true;
   store.select('social-npc-'+u.dSpec.id,app,cls).then(look=>{
    if(look){u.look=look;u.paint='';}
   }).catch(()=>{u.retryAt=performance.now()+3000;}).finally(()=>{u.loading=false;});
  }
 }
 function dealerBubble(text,ms=6500,tableId=0){
  if(!text)return;
  const u=pokerUnits[tableId]||pokerUnits[0];if(!u)return;
  u.npcBubble.textContent=text;u.npcBubble.hidden=false;u.bhid=false;
  u.bubbleUntil=Math.max(performance.now(),clock)+ms;
 }
 function updatePoker(tablesOrSnap){
  const list=Array.isArray(tablesOrSnap)?tablesOrSnap:tablesOrSnap?[tablesOrSnap]:[];
  for(const snap of list){
   if(!snap)continue;
   const u=pokerUnits[snap.tableId||0];if(!u)continue;
   paintUnitFelt(u,snap);
   const n=Number(snap.seatedCount||0);
   const phase=snap.phase&&snap.phase!=='idle'?` · ${snap.phase[0].toUpperCase()+snap.phase.slice(1)}`:'';
   const nextText=`${n} / 6 seated${phase}`;
   if(u.npcSub.textContent!==nextText)u.npcSub.textContent=nextText;
  }
 }

 function disposeAura(group){if(!group)return;const textures=new Set();group.traverse(o=>{if(o.isMesh||o.isPoints)o.geometry.dispose();if(o.material){if(o.material.map)textures.add(o.material.map);o.material.dispose()}});textures.forEach(t=>t.dispose())}
 // v225 (owner): the plaza reuses the field's own Base 50/99/150 sigil, so a character's level aura
 // is the same object and animation here. Textures are private to one player and freed on leave.
 function auraTier(lv){return typeof LEVEL_AURAS==='undefined'?null:LEVEL_AURAS.filter(a=>lv>=a.at).at(-1)||null}
 function syncAura(p){const tier=auraTier(Math.max(0,Math.floor(Number(p.state.look?.lv)||0))),tierAt=tier?tier.at:0;if(p.auraTier===tierAt)return;p.auraTier=tierAt;if(p.aura){scene.remove(p.aura);disposeAura(p.aura);p.aura=null}if(!tier||typeof buildLevelAura!=='function')return;p.aura=buildLevelAura(tier);scene.add(p.aura)}
 function animateAura(p,now,x,z){const aura=p.aura;if(!aura)return;const seconds=now/1000;aura.position.set(x,.07,z);aura.scale.setScalar(1.18*(1+Math.sin(seconds*2)*.025));aura.children.forEach((layer,i)=>{if(!layer.material)return;layer.rotation.y=(seconds*(i?-.3:.22))%(Math.PI*2);layer.material.opacity=.8+Math.sin(seconds*2+i)*.12;if(layer.children[0]?.material)layer.children[0].material.opacity=.85+Math.sin(seconds*2+i)*.1});const data=aura.userData;if(data.floor)data.floor.material.opacity=.4+Math.sin(seconds*1.7)*.07;if(data.veil)data.veil.material.opacity=.2+Math.sin(seconds*1.7)*.035;const motes=data.motes;if(motes){const positions=motes.geometry.attributes.position,colors=motes.geometry.attributes.color;for(let i=0;i<positions.count;i++){const phase=(seconds*.23+i/positions.count)%1,angle=i*2.399+seconds*.24,radius=.55+Math.sin(i*1.7)*.25,fade=Math.sin(phase*Math.PI);positions.setXYZ(i,Math.cos(angle)*radius,phase*1.6,Math.sin(angle)*radius);colors.setXYZ(i,fade,fade,fade)}positions.needsUpdate=colors.needsUpdate=true}}
 function removePlayer(id){const p=players.get(id);if(!p)return;if(p.digimon){scene.remove(p.digimon.sprite);p.digimon.sprite.material.dispose();p.digimon.texture.dispose();p.digimon=null;}try{fishingApi.api.setRig(id,{on:false})}catch{}for(const s of stores)s.release('social-'+id);if(p.aura){scene.remove(p.aura);disposeAura(p.aura)}scene.remove(p.sprite);p.sprite.material.dispose();p.texture.dispose();p.label.remove();p.bubble.remove();players.delete(id)}
 function loadLooks(p,now){
  if(p.loading||now<p.retryAt)return;
  const appearance=PGWardrobe.normalize(p.state.look?.appearance)||PGWardrobe.defaults('m'),cls=Object.hasOwn(allClasses,p.state.look?.cls)?p.state.look.cls:'Novice';
  const seq=++p.seq,key=JSON.stringify([cls,appearance]),normal=Object.hasOwn(PGFourthJobs.CLASSES,cls)?stores[1]:stores[0];p.loading=true;
  const current=()=>players.get(p.state.id)===p&&seq===p.seq;
  // Standing loads first; a pending sitting atlas keeps the standing character visible.
  normal.select('social-'+p.state.id,appearance,cls).then(async look=>{
   if(!current()||!look)return;p.looks.normal=look;if(p.loaded!==key)p.looks.sit=null;p.loaded=key;p.paint='';p.label.dataset.loading='false';p.label.title='';
   const sit=await stores[2].select('social-'+p.state.id,appearance,cls);if(current()&&sit){p.looks.sit=sit;p.paint=''}
  }).catch(e=>{if(current()){p.retryAt=performance.now()+3000;p.label.title='Retrying character download…';console.warn('Social appearance:',e.message)}}).finally(()=>{if(current())p.loading=false});
 }
 // Dir index 0..7 in the plaza's own convention (0 = +z, 2 = -x, 4 = -z, 6 = +x), so anything
 // that knows a target can turn a character toward it.
 function faceTo(x,z,tx,tz){const dx=Number(tx)-x,dz=Number(tz)-z;if(!Number.isFinite(dx)||!Number.isFinite(dz)||Math.hypot(dx,dz)<.15)return null;return (Math.round(Math.atan2(-dx,dz)/(Math.PI/4))+8)%8}
 function putPlayer(state){let p=players.get(state.id);if(!p){
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=280;const ctx=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);texture.magFilter=texture.minFilter=T.NearestFilter;texture.generateMipmaps=false;
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthTest:true,alphaTest:.05}));sprite.userData.socialId=state.id;sprite.center.set(.5,80/280);scene.add(sprite);
  const label=document.createElement('div');label.className='social-player-label';label.dataset.loading='true';label.dataset.player=state.id;const bubble=document.createElement('div');bubble.className='social-bubble';bubble.dataset.player=state.id;const name=document.createElement('button');if(state.gm){name.textContent='🛠 '+state.name;name.title='Game Master';name.classList.add('social-gm')}else name.textContent=state.name;name.onclick=()=>callbacks.menu(state.name,state.id);const title=document.createElement('small');title.className='social-player-title';const fishTitle=document.createElement('small');fishTitle.className='social-player-fish-title';const digiTitle=document.createElement('small');digiTitle.className='social-player-digi-title';label.append(name,title,fishTitle,digiTitle);labels.append(label,bubble);
  p={canvas,ctx,texture,sprite,label,bubble,title,fishTitle,digiTitle,state,loaded:'',paint:'',height:3.2,aura:null,auraTier:-1,lx:'',ly:'',lhid:null,bx:'',by:'',bhid:null,bubbleUntil:0,looks:{},seq:0,retryAt:0,loading:false,trail:{points:[],progress:null}};players.set(state.id,p);
 }
 const nextTitle=state.look?.title||'';if(p.title.textContent!==nextTitle){p.title.textContent=nextTitle;p.title.hidden=!nextTitle}else if(p.title.hidden!==!nextTitle)p.title.hidden=!nextTitle;
 // v296: the fishing title is a second line, so it never displaces the Hunt title.
 const nextFish=state.look?.fishTitle||'';if(p.fishTitle.textContent!==nextFish){p.fishTitle.textContent=nextFish;p.fishTitle.hidden=!nextFish}else if(p.fishTitle.hidden!==!nextFish)p.fishTitle.hidden=!nextFish;
 // v373: the fishing title takes its tier colour; the DigiPet title sits on the line under it in its own tier colour.
 p.fishTitle.style.color=state.look?.fishTitleColor||'';
 const nextDigi=state.look?.digiTitle||'';if(p.digiTitle.textContent!==nextDigi){p.digiTitle.textContent=nextDigi;p.digiTitle.hidden=!nextDigi}else if(p.digiTitle.hidden!==!nextDigi)p.digiTitle.hidden=!nextDigi;
 p.digiTitle.style.color=state.look?.digiTitleColor||'';
 p.state={...state,path:(state.path||[]).map(v=>({...v})),at:performance.now()};
 syncAura(p);
 const key=JSON.stringify([Object.hasOwn(allClasses,state.look?.cls)?state.look.cls:'Novice',PGWardrobe.normalize(state.look?.appearance)||PGWardrobe.defaults('m')]);
 if(p.requested!==key){p.requested=key;p.paint='';p.seq++;p.loading=false;p.retryAt=0;loadLooks(p,performance.now())}
 }
 function bubble(id,m){const p=players.get(id);if(!p)return;p.bubble.replaceChildren();p.bubble.classList.toggle('social-emotion',!!m.emotion);if(m.emotion){const img=document.createElement('img');img.src='assets/social/emotions/'+m.emotion+'.png';img.alt='/'+m.emotion;p.bubble.append(img)}else p.bubble.textContent=m.body;p.bubbleUntil=Math.max(performance.now(),clock)+6000;p.bhid=null}
 // Player-locked camera: the right mouse button orbits/tilts, pinch/wheel zooms, no map-roaming pan.
 // v298 (owner): the LEFT button no longer rotates - a left click always means "walk here".
 const cameraState=()=>({angle,pitch,distance,panX:0,panZ:0,follow:true});
 function setCamera(values={}){const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
 if(Number.isFinite(values.angle))angle=((values.angle+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
 if(Number.isFinite(values.pitch))pitch=clamp(values.pitch,26,77);
 if(Number.isFinite(values.distance))distance=clamp(values.distance,22,72);
 callbacks.camera?.(cameraState());}
 function resetCamera(){setCamera({angle:0,pitch:DEFAULT_PITCH,distance:DEFAULT_DISTANCE})}
 const ray=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0),0);let down=null;const touches=new Map();
 function startDrag(e,moved=false){
  // v298: with a mouse only the right button (or ctrl+left, which macOS sends instead of a right
  // click) orbits. Touch and pen keep dragging, because neither has a right button to use.
  const touch=e.pointerType==='touch'||e.pointerType==='pen';
  return {x:e.clientX,y:e.clientY,angle,pitch,moved,orbit:touch||e.button===2||(e.button===0&&e.ctrlKey===true)};
 }
 host.oncontextmenu=e=>e.preventDefault();
 host.onpointerdown=e=>{e.preventDefault();host.setPointerCapture(e.pointerId);touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touches.size===1)down=startDrag(e);else if(down){down.moved=true;down.pinch=null}};
 host.onpointermove=e=>{if(!down||!touches.has(e.pointerId))return;touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(touches.size===2){const a=[...touches.values()],span=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);if(down.pinch&&span>0)setCamera({distance:distance*down.pinch/span});down.pinch=span;down.moved=true}
 else if(down.orbit&&(down.moved||Math.hypot(e.clientX-down.x,e.clientY-down.y)>7)){setCamera({angle:down.angle-(e.clientX-down.x)*.006,pitch:down.pitch+(e.clientY-down.y)*.28});down.moved=true}
 // A left drag is a dead zone: it cancels the click-to-walk, but never moves the camera.
 else if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>7)down.moved=true};
 host.onpointerup=e=>{if(!touches.has(e.pointerId))return;touches.delete(e.pointerId);if(down&&!down.moved&&!(e.button>0)){const rect=host.getBoundingClientRect();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);
 const sanctuaryHit=sanctuaryNpcs.find(n=>n.look&&!behindGymWall(n.spec.x,2,n.spec.z)&&ray.ray.intersectBox(n.bounds,new T.Vector3()));
 const pokerSeatHit=pokerStools.map(mesh=>{const point=ray.ray.intersectBox(mesh.userData.pokerSeatBounds,new T.Vector3());return point?{mesh,distance:point.distanceTo(ray.ray.origin)}:null}).filter(Boolean).sort((a,b)=>a.distance-b.distance)[0];
 const tableHit=pokerUnits.map(u=>{const dp=ray.ray.intersectBox(u.dealerBounds,new T.Vector3()),tp=ray.ray.intersectBox(u.tableBounds,new T.Vector3());const pt=dp||tp;return pt?{u,dealerDist:dp?dp.distanceTo(ray.ray.origin):Infinity,distance:pt.distanceTo(ray.ray.origin)}:null}).filter(Boolean).sort((a,b)=>a.distance-b.distance)[0];
 const seatHit=seatTargets.map(target=>{const point=ray.ray.intersectBox(target.bounds,new T.Vector3());return point?{target,distance:point.distanceTo(ray.ray.origin)}:null}).filter(Boolean).sort((a,b)=>a.distance-b.distance)[0];
 if(sanctuaryHit)talkSanctuaryNpc(sanctuaryHit);
 else if(pokerSeatHit&&(!tableHit||pokerSeatHit.distance<=tableHit.dealerDist+.4)){if(callbacks.pokerSeat)callbacks.pokerSeat(pokerSeatHit.mesh.userData.pokerSeat);else callbacks.pokerOpen?.(pokerSeatHit.mesh.userData.tableId);}
 else if(tableHit)callbacks.pokerOpen?.(tableHit.u.id);
 else if(seatHit){
  let chosen=seatHit.target.seat;
  const selfId=callbacks.self(),otherTaken=id=>[...players.values()].some(pl=>pl.state.id!==selfId&&pl.state.seat===id);
  const partner=chosen^1;
  if(otherTaken(chosen)&&R.SEATS[partner]&&R.SEATS[partner].bench===R.SEATS[chosen]?.bench&&!otherTaken(partner))chosen=partner;
  callbacks.seat(chosen);
 }
 else{const deckHit=ray.intersectObjects(bridgeDecks,false).find(hit=>R.onBridge(hit.point.x,hit.point.z));
 if(deckHit){callbacks.move(deckHit.point.x,deckHit.point.z)}else{const point=new T.Vector3();if(ray.ray.intersectPlane(plane,point)){
  // v311 (owner: "pond clicking is off, it keeps going to the same place"): the fishing target is
  // the water itself plus a narrow lip. The old 1.2-unit skirt around the pond swallowed clicks on
  // the rim, the rocks and the chairs' footing, so a click meant for the bank cast a line instead.
  const pond=(R.PONDS||[]).findIndex(pd=>R.pondContains(pd,point.x,point.z,.45));
  if(pond>=0&&callbacks.pond)callbacks.pond(point.x,point.z,pond);else if(R.walkable(point.x,point.z))callbacks.move(point.x,point.z)}}}}
 if(touches.size){const p=[...touches.values()][0];down=startDrag({...p,clientX:p.x,clientY:p.y},true)}else down=null};
 host.onpointercancel=()=>{down=null;touches.clear()};host.addEventListener('wheel',e=>{e.preventDefault();setCamera({distance:distance*Math.exp(e.deltaY*.001)})},{passive:false});
 // Subtle +5.5% optical offset keeps the player slightly higher than vertical screen center (~44% from top).
 function syncSize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h||(w===viewW&&h===viewH))return;viewW=w;viewH=h;renderer.setSize(w,h);camera.aspect=w/h;camera.setViewOffset(w,h,0,h*.055,w,h);camera.updateProjectionMatrix()}
 syncSize();const observer=new ResizeObserver(syncSize);observer.observe(host);
  // v364: a decorative draw must never take the frame down with it. `PGWardrobe.draw` on a poker
  // Dealer threw `InvalidStateError: The image source is detached from the canvas` on every frame,
  // and because this loop had no guard the throw aborted everything BELOW it - player sprite
  // placement, nameplates, digimon followers and `renderer.render` itself. The visible result was a
  // hero who "teleported": the sprite stayed at the last position that was committed before the
  // fault, then snapped to the current one on the frames that happened to survive. The guard is a
  // fence around each risky stage, not a blanket catch - the camera, the walk clock and the render
  // call must still run. It reports once per fault site so a console is a report, not a flood.
  function frame(now){requestAnimationFrame(frame);if(!active||document.hidden)return;
   let failed=0;const stage=(name,fn)=>{try{fn()}catch(error){failed++;reportFrameFault(name,error)}};
   // The render call runs in `finally`: a broken stage costs its own draw, never the whole picture.
   try{frameBody(now,stage)}finally{try{renderer.render(scene,camera)}catch(error){reportFrameFault('render',error)}}}
  // One line per distinct fault site, plus a repeat count: a permanent fault (a detached atlas that
  // is never re-fetched) would otherwise fill the console 60 times a second and hide the first one.
  const frameFaults=new Map();
  function reportFrameFault(where,error){
   const n=(frameFaults.get(where)||0)+1;frameFaults.set(where,n);
   if(n===1||n%600===0)console.warn('[plaza] frame stage "'+where+'" failed'+(n>1?' ('+n+'×)':'')+':',error&&error.message||error);
  }
  function frameBody(now,stage){if(!viewW||!viewH)syncSize();const walkDt=last?Math.min(2,Math.max(0,(now-last)/1000)):0,dt=Math.min(.1,walkDt);last=clock=now;
 for(const p of players.values())R.advance(p.state,now);
 const self=players.get(callbacks.self());try{callbacks.trainingNearby?.(self?.state)}catch(e){reportFrameFault('trainingNearby',e)}const selfChair=self?.state.sit&&!Number.isInteger(self?.state.pokerSeat)&&R.SEATS[self?.state.seat];
 const focusX=self?(Number.isFinite(selfChair?.sitX)?selfChair.sitX:self.state.x):0,focusZ=self?self.state.z:12;
 target.set(focusX,.8,focusZ);
 // At the gym a stopped player needs steady map controls, not a camera that
 // continues drifting under the cursor after the walk has finished.
 const settledAtGym=self&&!self.state.path.length&&focusX>=43&&focusX<=95&&focusZ>=12&&focusZ<=39;
 if(!focused||settledAtGym||focus.distanceTo(target)>12){focus.copy(target);focused=true}else focus.lerp(target,1-Math.exp(-dt*12));
 const tilt=pitch*Math.PI/180;camera.position.set(focus.x+Math.sin(angle)*distance*Math.cos(tilt),focus.y+Math.sin(tilt)*distance,focus.z+Math.cos(angle)*distance*Math.cos(tilt));camera.lookAt(focus);camera.updateMatrixWorld();
 for(let i=0;i<72;i++){const t=(now/1500+i/72)%1,a=i*2.399;spray[i*3]=Math.cos(a)*t*2.6;spray[i*3+1]=1.5+Math.sin(t*Math.PI)*3;spray[i*3+2]=Math.sin(a)*t*2.6}sprayGeo.attributes.position.needsUpdate=true;
 fishingApi.update(now,dt);
 const w=viewW||host.clientWidth,h=viewH||host.clientHeight;
 for(const {pad,el,hover,pressed} of sanctuaryLabels){if(pad.station&&(hover||pressed))continue;head.set(pad.x,.08,pad.z).project(camera);const hidden=head.z>1||head.z<-1||Math.abs(head.x)>1||Math.abs(head.y)>1||behindGymWall(pad.x,.08,pad.z);el.hidden=hidden;if(!hidden){el.style.left=((head.x+1)*w*.5).toFixed(1)+'px';el.style.top=((1-head.y)*h*.5).toFixed(1)+'px'}}
 stage('residents',()=>{updateResidents(now);updateGymResidents(now);updateBattleResidents(now)});
 stage('sanctuary-npcs',()=>updateSanctuaryNpcs(now,w,h));
 // Render table Dealers first so cached frames stay quiet and player stance draws remain authoritative.
 stage('dealers-load',()=>loadDealers(now));
 stage('dealers-paint',()=>{
 for(const u of pokerUnits){
  if(u.look){
   const dfacing=(u.dSpec.dir+Math.round(angle/(Math.PI/4))+8)%8;
   const danim=PGWardrobe.animationKey&&Array.isArray(u.look.pieces)?PGWardrobe.animationKey(u.look,'idle',dfacing,now,null,now):PGWardrobe.frameIndex(u.look.base.metadata.actions['idle'+dfacing],now);
   const dpaint=(u.look.key||u.dSpec.id)+':idle'+dfacing+':'+danim;
   if(u.paint!==dpaint){
    // v364: `u.paint` is committed only when the draw actually succeeded. It used to be set first,
    // so one throw (a detached atlas) left the dealer marked as painted and the frame was never
    // retried - the sprite stayed blank for the rest of the session. A failure now drops the
    // selection as well, so loadDealers() re-selects this dealer from the store instead of
    // re-drawing a dead bitmap forever.
    try{
     PGWardrobe.draw(u.dCtx,u.look,'idle',dfacing,now,null,now,null,null);
     u.dTex.needsUpdate=true;
     const dscale=2.6/u.look.base.figureHeight;u.dSprite.scale.set(320*dscale,280*dscale,1);
     const dtop=Math.min(...[u.look.base,u.look.hair].flatMap(part=>{const act=part.metadata.actions['idle'+dfacing];return act.frames[PGWardrobe.frameIndex(act,now)].filter(l=>l[7]!=='shadow').map(l=>l[5])}));
     u.height=(200-dtop)*dscale+.25;
     u.paint=dpaint;
    }catch(error){
     reportFrameFault('dealer:'+u.dSpec.id,error);
     u.paint='';u.look=null;u.retryAt=performance.now()+3000;
    }
   }
  }
  // Anchor dealer nameplate above the dealer's head so it never covers the 3D table felt.
  head.copy(u.dSprite.position);head.y+=u.height+.12;head.project(camera);
  const dlhid=head.z>1||head.z<-1||Math.abs(head.x)>1||Math.abs(head.y)>1;
  if(u.lhid!==dlhid){u.lhid=dlhid;u.npcLabel.hidden=dlhid}
  if(!dlhid){const lx=((head.x+1)*w*.5).toFixed(1)+'px',ly=((1-head.y)*h*.5).toFixed(1)+'px';if(u.lx!==lx){u.lx=lx;u.npcLabel.style.left=lx}if(u.ly!==ly){u.ly=ly;u.npcLabel.style.top=ly}}
  if(u.bubbleUntil>now){
   if(u.bhid===dlhid){}
   const dbhid=dlhid;
   if(u.bhid!==dbhid){u.bhid=dbhid;u.npcBubble.hidden=dbhid}
   if(!dbhid){const bx=((head.x+1)*w*.5).toFixed(1)+'px',by=((1-head.y)*h*.5-52).toFixed(1)+'px';if(u.bx!==bx){u.bx=bx;u.npcBubble.style.left=bx}if(u.by!==by){u.by=by;u.npcBubble.style.top=by}}
  }else if(u.bubbleUntil){u.bubbleUntil=0;u.bhid=true;u.npcBubble.hidden=true;u.npcBubble.textContent=''}
 }
 });
 stage('players',()=>{
 for(const p of players.values()){
  const state=p.state;if(state.id===callbacks.self()&&p.wasSitting!==state.sit){p.wasSitting=state.sit;callbacks.sitting?.(state.sit)}if(p.loaded!==p.requested||!p.looks.normal||!p.looks.sit)loadLooks(p,now);
  const look=(state.sit?p.looks.sit:null)||p.looks.normal;let height=p.height;
  const pokerChair=state.sit&&Number.isInteger(state.pokerSeat)&&R.POKER?.seats[state.pokerSeat];
  const chair=pokerChair||(state.sit&&R.SEATS[state.seat]),floor=chair?chair.height:.06+bridgeLift(state.x,state.z);
  if(look){
   // v311 (owner: "when fishing, the hero must face the pond"): while a line is out the angler
   // turns to the bobber, for every viewer - the rig already travels with the player snapshot, so
   // this needs no extra message and it cannot be stale.
   const fishDir=state.fish&&state.fish.on&&!state.path.length&&!state.sit?faceTo(state.x,state.z,state.fish.x,state.fish.z):null;
   const facing=((fishDir==null?state.dir:fishDir)+Math.round(angle/(Math.PI/4))+8)%8,stance=state.sit&&p.looks.sit?'sit':state.path.length?'walk':'idle';
   const glow=milestone(REFINE_GLOWS,Math.max(0,Math.min(15,Number(state.look?.refine)||0)));
   const animKey=PGWardrobe.animationKey&&Array.isArray(look.pieces)?PGWardrobe.animationKey(look,stance,facing,now,null,now):PGWardrobe.frameIndex(look.base.metadata.actions[stance+facing],now);
   const paint=(look.key||p.loaded)+':'+stance+facing+':'+animKey+(glow?':r'+glow.at+':'+Math.floor(now/50):'');
   if(p.paint!==paint){
    // v364: same rule as the dealers - paint is committed only after a successful draw, so a
    // detached atlas is retried next frame instead of leaving that player invisible for good.
    try{
     PGWardrobe.draw(p.ctx,look,stance,facing,now,null,now,
      glow?(ctx,image,layer,phase)=>drawNativeWeaponGlow(ctx,image,layer,phase,glow,p.trail,null,now):null,
      glow?(ctx,image,layer,phase)=>drawNativeArmGlow(ctx,image,layer,phase,glow,now):null);
     p.texture.needsUpdate=true;p.label.dataset.stance=stance;
     const scale=2.6/(p.looks.normal?.base.figureHeight||look.base.figureHeight);p.sprite.scale.set(320*scale,280*scale,1);
     const top=Math.min(...[look.base,look.hair].flatMap(part=>{const action=part.metadata.actions[stance+facing];return action.frames[PGWardrobe.frameIndex(action,now)].filter(l=>l[7]!=='shadow').map(l=>l[5])}));
     p.height=(200-top)*scale+.25;
     p.paint=paint;
    }catch(error){
     reportFrameFault('player:'+state.id,error);
     // Drop the selection so loadLooks() re-selects from the store (a fresh decode) next time.
     p.paint='';p.looks.normal=null;p.looks.sit=null;p.loaded='';p.requested='';p.retryAt=performance.now()+3000;
    }
   }
   height=p.height;
  }
  // Put the native ground-sitting pose on the seat deck, forward of a park bench backrest or centered on a poker stool.
  const baseX=chair&&!pokerChair&&Number.isFinite(chair.sitX)?chair.sitX:state.x;
  const seatOffset=pokerChair?0:chair?.35:0;
  p.sprite.position.set(baseX+(chair?Math.sin(chair.rotation)*seatOffset:0),floor,state.z+(chair?Math.cos(chair.rotation)*seatOffset:0));
  // Fixed-view sprites track the same movement path/speed as the avatar, without touching RO pets.
  const digimon=globalThis.PGSocialDigimon,id=digimon?.clean(state.look?.digimon),battleHidden=battleParticipantIds.has(state.id);
  if((!id||battleHidden)&&p.digimon){scene.remove(p.digimon.sprite);p.digimon.sprite.material.dispose();p.digimon.texture.dispose();p.digimon=null}
  if(id&&digimonStore&&!battleHidden){
   const asset=digimonStore.ready(id);if(!asset)digimonStore.request(id);
   if(asset){
    if(!p.digimon){const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const texture=new T.CanvasTexture(canvas);texture.magFilter=texture.minFilter=T.NearestFilter;texture.generateMipmaps=false;const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthTest:true,alphaTest:.05}));sprite.center.set(.5,.25);sprite.scale.set(256*1.45/96,256*1.45/96,1);sprite.userData.digimonOwner=state.id;scene.add(sprite);p.digimon={canvas,ctx:canvas.getContext('2d'),texture,sprite,paint:'',flip:false,follower:digimon.createFollower(state,state.dir,R.walkable)}}
    const d=p.digimon,visualHeight=1.45*(globalThis.PGDigimonSanctuary?.visualScale(id)||1);d.sprite.scale.set(256*visualHeight/96,256*visualHeight/96,1);
    const f=digimon.stepFollower(d.follower,state,walkDt,R.walkSpeed(state),R.walkable,R.path),stance=f.walking?'walking':'idle';
    // The companion faces its own direction, not the player's current direction. Walking phase
    // accumulates distance so pausing, turning and speed changes cannot desynchronise footsteps.
    if(f.walking){const dir=(Math.round(Math.atan2(-f.dx,f.dz)/(Math.PI/4))+8)%8,facing=(dir+Math.round(angle/(Math.PI/4))+8)%8;if(facing>0&&facing<4)d.flip=true;else if(facing>4)d.flip=false}
    const time=f.walking?f.travel*200:now,n=digimon.frameIndex(asset.record.actions[stance].length,time,stance,5),key=[id,stance,n,d.flip].join(':');
    if(d.paint!==key){digimon.draw(d.ctx,asset,stance,time,5,d.flip);d.texture.needsUpdate=true;d.paint=key}
    d.sprite.position.set(f.x,.06+bridgeLift(f.x,f.z),f.z);
   }else if(p.digimon)p.digimon.sprite.visible=false;
   if(asset&&p.digimon)p.digimon.sprite.visible=true;
  }
  animateAura(p,now,baseX,state.z);
  feet.copy(p.sprite.position).project(camera);
  const lhid=feet.z>1||feet.z< -1||Math.abs(feet.x)>1||Math.abs(feet.y)>1;
  if(p.lhid!==lhid){p.lhid=lhid;p.label.hidden=lhid}
  if(!lhid){const lx=((feet.x+1)*w*.5).toFixed(1)+'px',ly=((1-feet.y)*h*.5+8).toFixed(1)+'px';if(p.lx!==lx){p.lx=lx;p.label.style.left=lx}if(p.ly!==ly){p.ly=ly;p.label.style.top=ly}}
  if(p.bubbleUntil>now){
   head.copy(p.sprite.position);head.y+=height;head.project(camera);
   const bhid=head.z>1||head.z< -1||Math.abs(head.x)>1||Math.abs(head.y)>1;
   if(p.bhid!==bhid){p.bhid=bhid;p.bubble.hidden=bhid}
   if(!bhid){const bx=((head.x+1)*w*.5).toFixed(1)+'px',by=((1-head.y)*h*.5).toFixed(1)+'px';if(p.bx!==bx){p.bx=bx;p.bubble.style.left=bx}if(p.by!==by){p.by=by;p.bubble.style.top=by}}
  }else if(p.bubbleUntil){p.bubbleUntil=0;p.bhid=true;p.bubble.hidden=true;p.bubble.replaceChildren()}
 }
 });
 }   // end frameBody
 requestAnimationFrame(frame); // v361: fire the Aetherwell load LAST, once every binding the mount touches (seatTargets
 // especially - the v359 bleacher slabs taught us that const) is initialized. The network GLB
 // always resolves after create() anyway; this also keeps synchronous loader stubs safe.
 loadAetherwell();
 return {putPlayer,removePlayer,setGymResidents,setBattleState,battleEvent,bubble,dealerBubble,updatePoker,setCamera,resetCamera,fishing:fishingApi.api,get cameraState(){return cameraState()},clearPlayers(){focused=false;for(const id of [...players.keys()])removePlayer(id)},get active(){return active},set active(v){active=v;if(v){syncSize();last=performance.now();focused=false}},scene,camera,renderer};
 }catch(error){renderer.dispose();renderer.domElement.remove();throw error}
}};
