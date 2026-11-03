/* Native scenery and sprites in an independent scene. Farming keeps its own scene/state. */
window.PGSocialScene={async create(host,labels,callbacks){
 const T=THREE,R=PGSocialRules,scene=new T.Scene();scene.background=new T.Color(0xb9cbbb);scene.fog=new T.Fog(0xb9cbbb,120,230);
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));host.append(renderer.domElement);
 try {
 const DEFAULT_PITCH=45,DEFAULT_DISTANCE=44;
 const camera=new T.PerspectiveCamera(38,1,.1,350),players=new Map();let angle=0,pitch=DEFAULT_PITCH,distance=DEFAULT_DISTANCE,active=false,last=0,clock=0,focused=false,viewW=0,viewH=0;
 const focus=new T.Vector3(0,.8,12),target=new T.Vector3(),feet=new T.Vector3(),head=new T.Vector3();
 const freeze=mesh=>{mesh.updateMatrix();mesh.matrixAutoUpdate=false;return mesh};
 scene.add(new T.HemisphereLight(0xffffff,0x66775a,1));
 const [catalog,data,atlas,paving]=await Promise.all([fetch('assets/social/town/catalog.json').then(r=>{if(!r.ok)throw Error('Town metadata unavailable');return r.json()}),fetch('assets/social/town/models.bin').then(r=>{if(!r.ok)throw Error('Town models unavailable');return r.arrayBuffer()}),new T.TextureLoader().loadAsync('assets/social/town/models.webp'),new T.TextureLoader().loadAsync('assets/social/town/paving.webp')]);
 atlas.flipY=false;atlas.magFilter=T.LinearFilter;const modelMat=new T.MeshBasicMaterial({map:atlas,vertexColors:true,side:T.DoubleSide,alphaTest:.35});
 modelMat.onBeforeCompile=shader=>{shader.vertexShader='attribute vec4 sourceBounds; varying vec4 nativeBounds;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nnativeBounds=sourceBounds;');shader.fragmentShader='varying vec4 nativeBounds;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','vec4 texelColor = texture2D(map, clamp(vUv, nativeBounds.xy, nativeBounds.zw)); texelColor = mapTexelToLinear(texelColor); diffuseColor *= texelColor;')};
 const floats=new Float32Array(data),geometries={};
 function model(name,x,z,size,rotation=0,source=catalog,vertices=floats,material=modelMat){const cacheKey=(source===catalog?'town:':'garden:')+name;const rec=source.models[name];if(!geometries[cacheKey]){const g=new T.BufferGeometry(),p=[],uv=[],color=[],bounds=[];for(let i=rec.first;i<rec.first+rec.count;i++){const v=vertices.subarray(i*10,i*10+10);p.push(v[0],v[1],v[2]);uv.push(v[3],v[4]);color.push(.58+.42*v[5],.58+.42*v[5],.58+.42*v[5]);bounds.push(...v.slice(6,10))}g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('color',new T.Float32BufferAttribute(color,3));g.setAttribute('sourceBounds',new T.Float32BufferAttribute(bounds,4));g.computeBoundingSphere();geometries[cacheKey]=g}const mesh=new T.Mesh(geometries[cacheKey],material);mesh.scale.setScalar(size/Math.max(rec.size[0],rec.size[2]));mesh.position.set(x,0,z);mesh.rotation.y=rotation;scene.add(freeze(mesh));return mesh}
 const makeBatch=()=>({p:[],uv:[],color:[],bounds:[]});
 function pushModel(batch,name,x,z,size,rotation=0,source=catalog,vertices=floats){
  const rec=source.models[name],s=size/Math.max(rec.size[0],rec.size[2]),c=Math.cos(rotation)*s,sn=Math.sin(rotation)*s;
  for(let i=rec.first;i<rec.first+rec.count;i++){const o=i*10,vx=vertices[o],vy=vertices[o+1],vz=vertices[o+2],shade=.58+.42*vertices[o+5];
   batch.p.push(vx*c+vz*sn+x,vy*s,-vx*sn+vz*c+z);batch.uv.push(vertices[o+3],vertices[o+4]);
   batch.color.push(shade,shade,shade);batch.bounds.push(vertices[o+6],vertices[o+7],vertices[o+8],vertices[o+9]);}
 }
 function addBatch(batch,material){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(batch.p,3));g.setAttribute('uv',new T.Float32BufferAttribute(batch.uv,2));g.setAttribute('color',new T.Float32BufferAttribute(batch.color,3));g.setAttribute('sourceBounds',new T.Float32BufferAttribute(batch.bounds,4));g.computeBoundingSphere();const mesh=freeze(new T.Mesh(g,material));scene.add(mesh);return mesh}
 // Source paving pixels are sampled from a padded native atlas tile.
 paving.flipY=false;const tile=document.createElement('canvas');tile.width=tile.height=256;tile.getContext('2d').drawImage(paving.image,16,16,256,256,0,0,256,256);const stone=new T.CanvasTexture(tile);stone.wrapS=stone.wrapT=T.RepeatWrapping;stone.repeat.set(20,20);const ground=new T.Mesh(new T.PlaneGeometry(164,164),new T.MeshBasicMaterial({map:stone,color:0xe4e2cf}));ground.rotation.x=-Math.PI/2;ground.position.y=-.02;scene.add(freeze(ground));
 const plazaTile=document.createElement('canvas');plazaTile.width=plazaTile.height=256;plazaTile.getContext('2d').drawImage(paving.image,16,304,256,256,0,0,256,256);const plazaTex=new T.CanvasTexture(plazaTile);plazaTex.wrapS=plazaTex.wrapT=T.RepeatWrapping;plazaTex.repeat.set(10,10);const plaza=new T.Mesh(new T.PlaneGeometry(62,62),new T.MeshBasicMaterial({map:plazaTex,color:0xe1d9c7}));plaza.rotation.x=-Math.PI/2;plaza.position.y=.005;scene.add(freeze(plaza));
 const roadTexture=plazaTex.clone();roadTexture.needsUpdate=true;roadTexture.repeat.set(3,26);const roadMat=new T.MeshBasicMaterial({map:roadTexture,color:0xe6dfcf}),roadGeo=new T.PlaneGeometry(18,164);for(const turn of [0,Math.PI/2]){const road=new T.Mesh(roadGeo,roadMat);road.rotation.x=-Math.PI/2;road.rotation.z=turn;road.position.y=.001;scene.add(freeze(road))}
 model('fountain',0,0,10);
 for(const b of R.BUILDINGS)model(b.name,b.x,b.z,b.size,b.rotation||0);
 const [gardenCatalog,gardenBuffer,gardenAtlas]=await Promise.all([fetch('assets/native-fields/v1/catalog.json').then(r=>{if(!r.ok)throw Error('Garden metadata unavailable');return r.json()}),fetch('assets/native-fields/v1/prontera/models.bin').then(r=>{if(!r.ok)throw Error('Garden models unavailable');return r.arrayBuffer()}),new T.TextureLoader().loadAsync('assets/native-fields/v1/prontera/models.webp')]);
 gardenAtlas.flipY=false;const gardenMat=modelMat.clone();gardenMat.map=gardenAtlas;gardenMat.onBeforeCompile=modelMat.onBeforeCompile;
 const garden=gardenCatalog.maps.find(m=>m.name==='prontera'),gardenFloats=new Float32Array(gardenBuffer);
 // Reuse native grass pixels for four bounded gardens, with canopy clearance from paths.
 const grass=stone.clone();grass.repeat.set(R.GARDENS[0].w/8,R.GARDENS[0].d/8);grass.needsUpdate=true;
 const grassMat=new T.MeshBasicMaterial({map:grass,color:0xe4e2cf}),curbMaterial=new T.MeshBasicMaterial({color:0xb3ac97});
 for(const g of R.GARDENS){
  const bed=new T.Mesh(new T.PlaneGeometry(g.w,g.d),grassMat);bed.rotation.x=-Math.PI/2;bed.position.set(g.x,.012,g.z);scene.add(freeze(bed));
  for(const side of [-1,1])for(const axis of ['x','z']){const curb=new T.Mesh(new T.BoxGeometry(axis==='x'?.35:g.w+.35,.22,axis==='z'?.35:g.d+.35),curbMaterial);curb.position.set(g.x+(axis==='x'?side*g.w/2:0),.1,g.z+(axis==='z'?side*g.d/2:0));scene.add(freeze(curb))}
  const shrubs=makeBatch();for(const offset of [-4,0,4])for(const side of [-1,1])pushModel(shrubs,'shrub',g.x+offset,g.z+side*5,2.4,0,garden,gardenFloats);addBatch(shrubs,gardenMat);
 }
 for(const {x,z,size} of R.TREES)model('tree2',x,z,size,0,garden,gardenFloats,gardenMat);
 // v287: Fishing ponds on the open south lawns (R.PONDS), well below the planted tree gardens.
 // All fishing 3D here is visual: water, stone rim, lily pads, ambient fish, and the local
 // player's rod/bobber rig. assets/social-fishing.js drives the states through `fishing` below.
 const fishingApi=(()=>{
  const roundedRect=(w,d,r)=>{const s=new T.Shape(),hw=w/2,hd=d/2;s.moveTo(-hw+r,-hd);s.lineTo(hw-r,-hd);s.quadraticCurveTo(hw,-hd,hw,-hd+r);s.lineTo(hw,hd-r);s.quadraticCurveTo(hw,hd,hw-r,hd);s.lineTo(-hw+r,hd);s.quadraticCurveTo(-hw,hd,-hw,hd-r);s.lineTo(-hw,-hd+r);s.quadraticCurveTo(-hw,-hd,-hw+r,-hd);return s};
  const waterTile=document.createElement('canvas');waterTile.width=waterTile.height=128;const wctx=waterTile.getContext('2d');
  if(wctx&&typeof wctx.fillRect==='function'){wctx.fillStyle='#3e97be';wctx.fillRect(0,0,128,128);if(typeof wctx.arc==='function'&&typeof wctx.stroke==='function'){wctx.strokeStyle='rgba(235,250,255,0.3)';wctx.lineWidth=2;for(let i=0;i<24;i++){const x=(i*53)%128,y=(i*37)%128,r=4+(i*7)%9;wctx.beginPath();wctx.arc(x,y,r,Math.PI*.12,Math.PI*.88);wctx.stroke()}}}
  const makeWaterTex=()=>{const tx=new T.CanvasTexture(waterTile);tx.wrapS=tx.wrapT=T.RepeatWrapping;tx.repeat.set(1/5.5,1/5.5);return tx};
  const waterTexA=makeWaterTex(),waterTexB=makeWaterTex();
  const sandMat=new T.MeshBasicMaterial({color:0xcbc09b}),waterMat=new T.MeshBasicMaterial({color:0x2e7ea6}),glintMatA=new T.MeshBasicMaterial({map:waterTexA,transparent:true,opacity:.42,depthWrite:false}),glintMatB=new T.MeshBasicMaterial({map:waterTexB,transparent:true,opacity:.26,depthWrite:false});
  const lilyMat=new T.MeshBasicMaterial({color:0x3c7a3f,transparent:true,opacity:.94,depthWrite:false}),lilies=[];
  const reedBatch=makeBatch();
  for(const p of R.PONDS){
   const rim=new T.Mesh(new T.ShapeGeometry(roundedRect(p.w+1.7,p.d+1.7,3.1)),sandMat);rim.rotation.x=-Math.PI/2;rim.position.set(p.x,.008,p.z);scene.add(freeze(rim));
   const water=new T.Mesh(new T.ShapeGeometry(roundedRect(p.w,p.d,2.6)),waterMat);water.rotation.x=-Math.PI/2;water.position.set(p.x,.016,p.z);scene.add(freeze(water));
   for(const [mat,y] of [[glintMatA,.024],[glintMatB,.028]]){const glint=new T.Mesh(new T.ShapeGeometry(roundedRect(p.w-.6,p.d-.6,2.4)),mat);glint.rotation.x=-Math.PI/2;glint.position.set(p.x,y,p.z);scene.add(freeze(glint))}
   for(let i=0;i<16;i++){const a=i/16*Math.PI*2,sx=.42+((i*29)%17)/40,stone=new T.Mesh(new T.BoxGeometry(sx,.22+((i*13)%9)/60,.34),curbMaterial);stone.position.set(p.x+Math.cos(a)*(p.w/2+.6),.1,p.z+Math.sin(a)*(p.d/2+.6));stone.rotation.y=a+((i*41)%10)/9;scene.add(freeze(stone))}
   for(let i=0;i<3;i++){const lily=new T.Mesh(new T.CircleGeometry(.42+(i%2)*.14,12,.5,5.6),lilyMat);lily.rotation.x=-Math.PI/2;lily.position.set(p.x+(i-1)*(p.w/3.4),.032,p.z+(i%2?-1:1)*(p.d/3.6));lilies.push({mesh:lily,x:lily.position.x,z:lily.position.z,ph:i*2.1});scene.add(lily)}
   pushModel(reedBatch,'shrub',p.x-p.w/2-1.5,p.z-p.d/2-.9,2,0,garden,gardenFloats);pushModel(reedBatch,'shrub',p.x+p.w/2+1.5,p.z+p.d/2+.9,2,0,garden,gardenFloats);
  }
  addBatch(reedBatch,gardenMat);
  // Ambient fish silhouettes swim inside each pond; the Fishing Bag's "Show swimming fish" toggles them.
  const fishShape=new T.Shape();fishShape.moveTo(.4,0);fishShape.quadraticCurveTo(.05,.22,-.26,.06);fishShape.lineTo(-.46,.17);fishShape.lineTo(-.37,0);fishShape.lineTo(-.46,-.17);fishShape.lineTo(-.26,-.06);fishShape.quadraticCurveTo(.05,-.22,.4,0);
  const fishGeo=new T.ShapeGeometry(fishShape),fishGroup=new T.Group(),swimmers=[];scene.add(fishGroup);
  R.PONDS.forEach((p,pi)=>{for(let i=0;i<7;i++){const m=new T.Mesh(fishGeo,new T.MeshBasicMaterial({color:[0xe08a3c,0xd8dde2,0x8fc9b8][i%3],transparent:true,opacity:.78,depthWrite:false}));m.rotation.x=-Math.PI/2;const sc=.7+((i*31)%12)/16;m.scale.setScalar(sc);fishGroup.add(m);swimmers.push({m,p,ax:(p.w/2-1.6),az:(p.d/2-1.5),fa:.13+((i*17)%10)/90,fb:.1+((i*23)%10)/80,pa:i*1.7+pi,pb:i*2.9+pi*2})}});
  // The local player's rod, line, bobber, ripples, splash, bite mark and catch flight.
  const poleMat=new T.MeshBasicMaterial({color:0x7a5230}),pole=new T.Mesh(new T.CylinderGeometry(.016,.04,1,6),poleMat);pole.visible=false;scene.add(pole);
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
   while(showPool.length>=6){const old=showPool.shift();scene.remove(old.sprite);old.sprite.material.map.dispose();old.sprite.material.dispose();if(old.tag){scene.remove(old.tag);old.tag.material.map.dispose();old.tag.material.dispose()}}
   showPool.push({sprite:spr,tag,pid,t0:clock||performance.now(),dur:Math.max(1200,Math.min(9000,o.ms||5200)),scale:Math.max(.4,Math.min(5.2,Number(o.scale)||1))});
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
   for(const m of [r.pole,r.bobTop,r.bobBot]){try{m.geometry.dispose()}catch{}try{m.material.dispose()}catch{}}
   remoteRigs.delete(pid);
  }
  function setRig(pid,st){
   if(!st||st.on!==true){dropRig(pid);return}
   const tx=Math.max(-60,Math.min(60,Number(st.x)||0)),tz=Math.max(-60,Math.min(60,Number(st.z)||0));
   let r=remoteRigs.get(pid);
   if(!r){
    const holder=players.get(pid);
    const group=new T.Group();scene.add(group);
    const bobTop=new T.Mesh(new T.SphereGeometry(.11,10,8),new T.MeshBasicMaterial({color:0xd8402e}));
    const bobBot=new T.Mesh(new T.SphereGeometry(.09,10,8),new T.MeshBasicMaterial({color:0xf2efe4}));
    bobBot.position.y=-.09;
    const bob=new T.Group();bob.add(bobTop,bobBot);group.add(bob);
    const pole=new T.Mesh(new T.CylinderGeometry(.016,.032,1,5),new T.MeshBasicMaterial({color:0x7a5230}));
    group.add(pole);
    r={group,bob,pole,bobTop,bobBot,x:holder?holder.sprite.position.x:tx,z:holder?holder.sprite.position.z:tz,tx,tz,mode:'wait'};
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
    const dx=r.x-px,dz=r.z-pz,d=Math.hypot(dx,dz)||1,ux=dx/d,uz=dz/d;
    const hx=px+ux*.35,hz=pz+uz*.35,hy=1.1,tx2=px+ux*1.5,tz2=pz+uz*1.5,ty=2.05;
    const mx=(hx+tx2)/2,my=(hy+ty)/2,mz=(hz+tz2)/2,len=Math.hypot(tx2-hx,ty-hy,tz2-hz)||1;
    r.pole.position.set(mx,my,mz);r.pole.scale.set(1,len,1);
    r.pole.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3((tx2-hx)/len,(ty-hy)/len,(tz2-hz)/len));
   }
  }
  const api={
   setFishVisible(v){fishGroup.visible=v!==false},
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
   hide(keepPole){rig={mode:'off'};bobber.visible=false;mark.visible=false;if(!keepPole){pole.visible=false;line.visible=false}},
   off(){api.hide();glyph.visible=false;catchAnim=null},
  };
  function placeRod(bx,by,bz,now){const p=selfPos();if(!p){pole.visible=line.visible=false;return}
   const dx=bx-p.x,dz=bz-p.z,d=Math.hypot(dx,dz)||1,ux=dx/d,uz=dz/d;
   const hx=p.x+ux*.35,hz=p.z+uz*.35,hy=1.1,tx=p.x+ux*1.7,tz=p.z+uz*1.7,ty=2.15;
   const mx=(hx+tx)/2,my=(hy+ty)/2,mz=(hz+tz)/2,len=Math.hypot(tx-hx,ty-hy,tz-hz);
   pole.position.set(mx,my,mz);pole.scale.set(1,len,1);pole.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3((tx-hx)/len,(ty-hy)/len,(tz-hz)/len));
   for(let i=0;i<8;i++){const t=i/7,sag=Math.sin(t*Math.PI)*Math.max(.2,d*.06),px=tx+(bx-tx)*t,py=ty+(by+.12-ty)*t-sag,pz=tz+(bz-tz)*t;linePts[i*3]=px;linePts[i*3+1]=py;linePts[i*3+2]=pz}
   lineGeo.attributes.position.needsUpdate=true;lineGeo.computeBoundingSphere?.();
  }
  function update(now,dt){
   updateRemoteRigs(now,dt);
   waterTexA.offset.x=(now/14000)%1;waterTexA.offset.y=(now/23000)%1;waterTexB.offset.x=1-(now/17000)%1;waterTexB.offset.y=(now/19000)%1;
   for(const l of lilies){l.mesh.position.x=l.x+Math.sin(now/2600+l.ph)*.22;l.mesh.position.z=l.z+Math.cos(now/3100+l.ph)*.18;l.mesh.rotation.z=Math.sin(now/4000+l.ph)*.4}
   if(fishGroup.visible)for(const s of swimmers){const t=now/1000,x=s.p.x+Math.sin(t*s.fa+s.pa)*s.ax,z=s.p.z+Math.sin(t*s.fb+s.pb)*s.az,vx=Math.cos(t*s.fa+s.pa)*s.fa*s.ax,vz=Math.cos(t*s.fb+s.pb)*s.fb*s.az;s.m.position.set(x,.03,z);s.m.rotation.z=Math.atan2(-vz,vx)+Math.sin(t*6+s.pa)*.12}
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
    if(sh.tag){sh.tag.visible=true;sh.tag.position.set(sh.sprite.position.x,sh.sprite.position.y+sh.scale*.5+.42+Math.sin(now/480+i)*.08,sh.sprite.position.z);sh.tag.material.opacity=sh.sprite.material.opacity}
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
 const benches=(R.BENCHES||R.SEATS).map(b=>{
  const mesh=model('bench',b.x,b.z,b.size,b.rotation);
  mesh.userData.bench=b.id;
  mesh.userData.seat=Array.isArray(b.seats)?b.seats[0]:b.id;
  mesh.userData.seatBounds=new T.Box3().setFromObject(mesh).expandByScalar(.25);
  return mesh;
 });
 const seatTargets=R.BENCHES?benches.flatMap(mesh=>{
  const b=R.BENCHES[mesh.userData.bench],bb=mesh.userData.seatBounds;
  return [
   {seat:b.seats[0],bench:b.id,bounds:new T.Box3(new T.Vector3(bb.min.x,bb.min.y,bb.min.z),new T.Vector3(b.x,bb.max.y,bb.max.z))},
   {seat:b.seats[1],bench:b.id,bounds:new T.Box3(new T.Vector3(b.x,bb.min.y,bb.min.z),new T.Vector3(bb.max.x,bb.max.y,bb.max.z))}
  ];
 }):benches.map(mesh=>({seat:mesh.userData.seat,bench:mesh.userData.seat,bounds:mesh.userData.seatBounds}));
 // v288: single-seat wooden angler chairs on the pond rims (R.CHAIRS, seat ids 24-31).
 if(R.CHAIRS&&R.CHAIRS.length){
  const chairWood=new T.MeshLambertMaterial({color:0x6b4a2a}),chairWoodDark=new T.MeshLambertMaterial({color:0x4a2f16});
  for(const c of R.CHAIRS){
   const g=new T.Group();g.position.set(c.x,0,c.z);g.rotation.y=c.rotation;
   for(const lx of [-.3,.3])for(const lz of [-.28,.28]){const leg=new T.Mesh(new T.BoxGeometry(.09,.6,.09),chairWoodDark);leg.position.set(lx,.3,lz);g.add(leg)}
   const pan=new T.Mesh(new T.BoxGeometry(.82,.08,.76),chairWood);pan.position.y=.62;g.add(pan);
   for(const px of [-.3,.3]){const post=new T.Mesh(new T.BoxGeometry(.08,.62,.08),chairWoodDark);post.position.set(px,.92,-.32);g.add(post)}
   for(const sy of [.92,1.1]){const slat=new T.Mesh(new T.BoxGeometry(.72,.1,.06),chairWood);slat.position.set(0,sy,-.32);g.add(slat)}
   g.userData.seat=c.id;scene.add(freeze(g));
   seatTargets.push({seat:c.id,bench:100+c.id,bounds:new T.Box3().setFromObject(g).expandByScalar(.3)});
  }
 }

 const water=new T.Mesh(new T.CircleGeometry(3.7,48),new T.MeshBasicMaterial({color:0x60c9dc,transparent:true,opacity:.65}));water.rotation.x=-Math.PI/2;water.position.y=.7;scene.add(freeze(water));
 const sprayGeo=new T.BufferGeometry(),spray=new Float32Array(72*3);sprayGeo.setAttribute('position',new T.BufferAttribute(spray,3));const drops=new T.Points(sprayGeo,new T.PointsMaterial({color:0xd6f8ff,size:.14,transparent:true,opacity:.8}));scene.add(drops);
 const allClasses={...PGWardrobe.CLASSES,...PGFourthJobs.CLASSES};const stores=[new PGWardrobe.Store({budget:96*1024*1024}),new PGFourthJobs.Store({budget:64*1024*1024}),new PGWardrobe.Store({base:'assets/social/sitting/',classes:allClasses,budget:48*1024*1024,stances:['sit']})];

 // v266: Two Plaza Hold'em tables along the West Promenade, 12 cushioned stools and 2 native Dealers.
 const woodDark=new T.MeshLambertMaterial({color:0x4b2e1b}),woodRail=new T.MeshLambertMaterial({color:0x633a22}),brassMat=new T.MeshLambertMaterial({color:0xcba458}),velvetRed=new T.MeshLambertMaterial({color:0x8d2630}),velvetBlue=new T.MeshLambertMaterial({color:0x274d78}),feltBaseMat=new T.MeshLambertMaterial({color:0x17583b});
 const tableSpecs=R.POKER.tables||[{id:0,label:'Table 1',table:R.POKER.table,dealer:R.POKER.dealer,seats:R.POKER.seats}];
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
 function removePlayer(id){const p=players.get(id);if(!p)return;try{fishingApi.api.setRig(id,{on:false})}catch{}for(const s of stores)s.release('social-'+id);if(p.aura){scene.remove(p.aura);disposeAura(p.aura)}scene.remove(p.sprite);p.sprite.material.dispose();p.texture.dispose();p.label.remove();p.bubble.remove();players.delete(id)}
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
 function putPlayer(state){let p=players.get(state.id);if(!p){
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=280;const ctx=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);texture.magFilter=texture.minFilter=T.NearestFilter;texture.generateMipmaps=false;
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthTest:true,alphaTest:.05}));sprite.userData.socialId=state.id;sprite.center.set(.5,80/280);scene.add(sprite);
  const label=document.createElement('div');label.className='social-player-label';label.dataset.loading='true';label.dataset.player=state.id;const bubble=document.createElement('div');bubble.className='social-bubble';bubble.dataset.player=state.id;const name=document.createElement('button');if(state.gm){name.textContent='🛠 '+state.name;name.title='Game Master';name.classList.add('social-gm')}else name.textContent=state.name;name.onclick=()=>callbacks.menu(state.name,state.id);const title=document.createElement('small');title.className='social-player-title';label.append(name,title);labels.append(label,bubble);
  p={canvas,ctx,texture,sprite,label,bubble,title,state,loaded:'',paint:'',height:3.2,aura:null,auraTier:-1,lx:'',ly:'',lhid:null,bx:'',by:'',bhid:null,bubbleUntil:0,looks:{},seq:0,retryAt:0,loading:false,trail:{points:[],progress:null}};players.set(state.id,p);
 }
 const nextTitle=state.look?.title||'';if(p.title.textContent!==nextTitle){p.title.textContent=nextTitle;p.title.hidden=!nextTitle}else if(p.title.hidden!==!nextTitle)p.title.hidden=!nextTitle;
 p.state={...state,path:(state.path||[]).map(v=>({...v})),at:performance.now()};
 syncAura(p);
 const key=JSON.stringify([Object.hasOwn(allClasses,state.look?.cls)?state.look.cls:'Novice',PGWardrobe.normalize(state.look?.appearance)||PGWardrobe.defaults('m')]);
 if(p.requested!==key){p.requested=key;p.paint='';p.seq++;p.loading=false;p.retryAt=0;loadLooks(p,performance.now())}
 }
 function bubble(id,m){const p=players.get(id);if(!p)return;p.bubble.replaceChildren();p.bubble.classList.toggle('social-emotion',!!m.emotion);if(m.emotion){const img=document.createElement('img');img.src='assets/social/emotions/'+m.emotion+'.png';img.alt='/'+m.emotion;p.bubble.append(img)}else p.bubble.textContent=m.body;p.bubbleUntil=Math.max(performance.now(),clock)+6000;p.bhid=null}
 // Player-locked camera matching the main field game: drag orbits/tilts, pinch/wheel zooms, no map-roaming pan.
 const cameraState=()=>({angle,pitch,distance,panX:0,panZ:0,follow:true});
 function setCamera(values={}){const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
 if(Number.isFinite(values.angle))angle=((values.angle+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
 if(Number.isFinite(values.pitch))pitch=clamp(values.pitch,26,77);
 if(Number.isFinite(values.distance))distance=clamp(values.distance,22,72);
 callbacks.camera?.(cameraState());}
 function resetCamera(){setCamera({angle:0,pitch:DEFAULT_PITCH,distance:DEFAULT_DISTANCE})}
 const ray=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0),0);let down=null;const touches=new Map();
 function startDrag(e,moved=false){return {x:e.clientX,y:e.clientY,angle,pitch,moved}}
 host.oncontextmenu=e=>e.preventDefault();
 host.onpointerdown=e=>{e.preventDefault();host.setPointerCapture(e.pointerId);touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touches.size===1)down=startDrag(e);else if(down){down.moved=true;down.pinch=null}};
 host.onpointermove=e=>{if(!down||!touches.has(e.pointerId))return;touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(touches.size===2){const a=[...touches.values()],span=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);if(down.pinch&&span>0)setCamera({distance:distance*down.pinch/span});down.pinch=span;down.moved=true}
 else if(down.moved||Math.hypot(e.clientX-down.x,e.clientY-down.y)>7){setCamera({angle:down.angle-(e.clientX-down.x)*.006,pitch:down.pitch+(e.clientY-down.y)*.28});down.moved=true}};
 host.onpointerup=e=>{if(!touches.has(e.pointerId))return;touches.delete(e.pointerId);if(down&&!down.moved&&!(e.button>0)){const rect=host.getBoundingClientRect();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);
 const pokerSeatHit=pokerStools.map(mesh=>{const point=ray.ray.intersectBox(mesh.userData.pokerSeatBounds,new T.Vector3());return point?{mesh,distance:point.distanceTo(ray.ray.origin)}:null}).filter(Boolean).sort((a,b)=>a.distance-b.distance)[0];
 const tableHit=pokerUnits.map(u=>{const dp=ray.ray.intersectBox(u.dealerBounds,new T.Vector3()),tp=ray.ray.intersectBox(u.tableBounds,new T.Vector3());const pt=dp||tp;return pt?{u,dealerDist:dp?dp.distanceTo(ray.ray.origin):Infinity,distance:pt.distanceTo(ray.ray.origin)}:null}).filter(Boolean).sort((a,b)=>a.distance-b.distance)[0];
 const seatHit=seatTargets.map(target=>{const point=ray.ray.intersectBox(target.bounds,new T.Vector3());return point?{target,distance:point.distanceTo(ray.ray.origin)}:null}).filter(Boolean).sort((a,b)=>a.distance-b.distance)[0];
 if(pokerSeatHit&&(!tableHit||pokerSeatHit.distance<=tableHit.dealerDist+.4)){if(callbacks.pokerSeat)callbacks.pokerSeat(pokerSeatHit.mesh.userData.pokerSeat);else callbacks.pokerOpen?.(pokerSeatHit.mesh.userData.tableId);}
 else if(tableHit)callbacks.pokerOpen?.(tableHit.u.id);
 else if(seatHit){
  let chosen=seatHit.target.seat;
  const selfId=callbacks.self(),otherTaken=id=>[...players.values()].some(pl=>pl.state.id!==selfId&&pl.state.seat===id);
  const partner=chosen^1;
  if(otherTaken(chosen)&&R.SEATS[partner]&&R.SEATS[partner].bench===R.SEATS[chosen]?.bench&&!otherTaken(partner))chosen=partner;
  callbacks.seat(chosen);
 }
 else{const point=new T.Vector3();if(ray.ray.intersectPlane(plane,point)){const pond=(R.PONDS||[]).findIndex(pd=>Math.abs(point.x-pd.x)<=pd.w/2+1.2&&Math.abs(point.z-pd.z)<=pd.d/2+1.2);if(pond>=0&&callbacks.pond)callbacks.pond(point.x,point.z,pond);else if(R.walkable(point.x,point.z))callbacks.move(point.x,point.z)}}}
 if(touches.size){const p=[...touches.values()][0];down=startDrag({...p,clientX:p.x,clientY:p.y},true)}else down=null};
 host.onpointercancel=()=>{down=null;touches.clear()};host.addEventListener('wheel',e=>{e.preventDefault();setCamera({distance:distance*Math.exp(e.deltaY*.001)})},{passive:false});
 // Subtle +5.5% optical offset keeps the player slightly higher than vertical screen center (~44% from top).
 function syncSize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h||(w===viewW&&h===viewH))return;viewW=w;viewH=h;renderer.setSize(w,h);camera.aspect=w/h;camera.setViewOffset(w,h,0,h*.055,w,h);camera.updateProjectionMatrix()}
 syncSize();const observer=new ResizeObserver(syncSize);observer.observe(host);
 function frame(now){requestAnimationFrame(frame);if(!active||document.hidden)return;if(!viewW||!viewH)syncSize();const dt=last?Math.min(.1,Math.max(0,(now-last)/1000)):0;last=clock=now;
 for(const p of players.values())R.advance(p.state,now);
 const self=players.get(callbacks.self()),selfChair=self?.state.sit&&!Number.isInteger(self?.state.pokerSeat)&&R.SEATS[self?.state.seat];
 const focusX=self?(Number.isFinite(selfChair?.sitX)?selfChair.sitX:self.state.x):0,focusZ=self?self.state.z:12;
 target.set(focusX,.8,focusZ);if(!focused||focus.distanceTo(target)>12){focus.copy(target);focused=true}else focus.lerp(target,1-Math.exp(-dt*12));
 const tilt=pitch*Math.PI/180;camera.position.set(focus.x+Math.sin(angle)*distance*Math.cos(tilt),focus.y+Math.sin(tilt)*distance,focus.z+Math.cos(angle)*distance*Math.cos(tilt));camera.lookAt(focus);camera.updateMatrixWorld();
 for(let i=0;i<72;i++){const t=(now/1500+i/72)%1,a=i*2.399;spray[i*3]=Math.cos(a)*t*2.6;spray[i*3+1]=1.5+Math.sin(t*Math.PI)*3;spray[i*3+2]=Math.sin(a)*t*2.6}sprayGeo.attributes.position.needsUpdate=true;
 fishingApi.update(now,dt);
 const w=viewW||host.clientWidth,h=viewH||host.clientHeight;
 // Render table Dealers first so cached frames stay quiet and player stance draws remain authoritative.
 loadDealers(now);
 for(const u of pokerUnits){
  if(u.look){
   const dfacing=(u.dSpec.dir+Math.round(angle/(Math.PI/4))+8)%8;
   const danim=PGWardrobe.animationKey&&Array.isArray(u.look.pieces)?PGWardrobe.animationKey(u.look,'idle',dfacing,now,null,now):PGWardrobe.frameIndex(u.look.base.metadata.actions['idle'+dfacing],now);
   const dpaint=(u.look.key||u.dSpec.id)+':idle'+dfacing+':'+danim;
   if(u.paint!==dpaint){
    u.paint=dpaint;
    PGWardrobe.draw(u.dCtx,u.look,'idle',dfacing,now,null,now,null,null);
    u.dTex.needsUpdate=true;
    const dscale=2.6/u.look.base.figureHeight;u.dSprite.scale.set(320*dscale,280*dscale,1);
    const dtop=Math.min(...[u.look.base,u.look.hair].flatMap(part=>{const act=part.metadata.actions['idle'+dfacing];return act.frames[PGWardrobe.frameIndex(act,now)].filter(l=>l[7]!=='shadow').map(l=>l[5])}));
    u.height=(200-dtop)*dscale+.25;
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
 for(const p of players.values()){
  const state=p.state;if(state.id===callbacks.self()&&p.wasSitting!==state.sit){p.wasSitting=state.sit;callbacks.sitting?.(state.sit)}if(p.loaded!==p.requested||!p.looks.normal||!p.looks.sit)loadLooks(p,now);
  const look=(state.sit?p.looks.sit:null)||p.looks.normal;let height=p.height;
  const pokerChair=state.sit&&Number.isInteger(state.pokerSeat)&&R.POKER?.seats[state.pokerSeat];
  const chair=pokerChair||(state.sit&&R.SEATS[state.seat]),floor=chair?chair.height:.06;
  if(look){
   const facing=(state.dir+Math.round(angle/(Math.PI/4))+8)%8,stance=state.sit&&p.looks.sit?'sit':state.path.length?'walk':'idle';
   const glow=milestone(REFINE_GLOWS,Math.max(0,Math.min(15,Number(state.look?.refine)||0)));
   const animKey=PGWardrobe.animationKey&&Array.isArray(look.pieces)?PGWardrobe.animationKey(look,stance,facing,now,null,now):PGWardrobe.frameIndex(look.base.metadata.actions[stance+facing],now);
   const paint=(look.key||p.loaded)+':'+stance+facing+':'+animKey+(glow?':r'+glow.at+':'+Math.floor(now/50):'');
   if(p.paint!==paint){
    p.paint=paint;
    PGWardrobe.draw(p.ctx,look,stance,facing,now,null,now,
     glow?(ctx,image,layer,phase)=>drawNativeWeaponGlow(ctx,image,layer,phase,glow,p.trail,null,now):null,
     glow?(ctx,image,layer,phase)=>drawNativeArmGlow(ctx,image,layer,phase,glow,now):null);
    p.texture.needsUpdate=true;p.label.dataset.stance=stance;
    const scale=2.6/(p.looks.normal?.base.figureHeight||look.base.figureHeight);p.sprite.scale.set(320*scale,280*scale,1);
    const top=Math.min(...[look.base,look.hair].flatMap(part=>{const action=part.metadata.actions[stance+facing];return action.frames[PGWardrobe.frameIndex(action,now)].filter(l=>l[7]!=='shadow').map(l=>l[5])}));
    p.height=(200-top)*scale+.25;
   }
   height=p.height;
  }
  // Put the native ground-sitting pose on the seat deck, forward of a park bench backrest or centered on a poker stool.
  const baseX=chair&&!pokerChair&&Number.isFinite(chair.sitX)?chair.sitX:state.x;
  const seatOffset=pokerChair?0:chair?.35:0;
  p.sprite.position.set(baseX+(chair?Math.sin(chair.rotation)*seatOffset:0),floor,state.z+(chair?Math.cos(chair.rotation)*seatOffset:0));
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
 renderer.render(scene,camera)}requestAnimationFrame(frame);
 return {putPlayer,removePlayer,bubble,dealerBubble,updatePoker,setCamera,resetCamera,fishing:fishingApi.api,get cameraState(){return cameraState()},clearPlayers(){focused=false;for(const id of [...players.keys()])removePlayer(id)},get active(){return active},set active(v){active=v;if(v){syncSize();last=performance.now();focused=false}},scene,camera,renderer};
 }catch(error){renderer.dispose();renderer.domElement.remove();throw error}
}};
