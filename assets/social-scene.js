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
 const bridges=[];
 const platforms=[];
 const platformLift=(x,z)=>{
  let y=0;
  for(const b of platforms){
   const dx=Math.abs(x-b.x),dz=Math.abs(z-b.z);
   if(dx>b.hx||dz>b.hz)continue;
   // ramp over the last .3 so stepping onto a stone shelf is a step, not a jump
   const k=Math.max(0,Math.min(1,Math.min(b.hx-dx,b.hz-dz)/.3+.25));
   y=Math.max(y,b.h*k);
  }
  return y;
 };
 const bridgeLift=(x,z)=>{
  for(const b of bridges){
   if(Math.abs(x-b.x)>b.span/2||Math.abs(z-b.z)>b.width/2)continue;
   const t=(x-b.x+b.span/2)/b.span;
   return 4*b.arch*t*(1-t);
  }
  return 0;
 };
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
  const rockMat=new T.MeshBasicMaterial({color:0x9d9a90}),rockMidMat=new T.MeshBasicMaterial({color:0x87847b}),rockDarkMat=new T.MeshBasicMaterial({color:0x6e6b65});
  const bridgeMat=new T.MeshBasicMaterial({color:0xc0b9a7}),bridgeRailMat=new T.MeshBasicMaterial({color:0xa79f8d});
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
  function archBridge(cx,z,span,width,arch=1.05){
   const half=span/2;
   // deck: the top of the arch, .34 thick, ends sinking into the banks
   const top=t=>4*arch*t*(1-t);
   const shape=new T.Shape();
   shape.moveTo(-half,-.34);
   shape.quadraticCurveTo(0,2*arch,half,-.34);
   shape.lineTo(half,-.36);
   shape.quadraticCurveTo(0,2*arch-.7,-half,-.36);
   shape.closePath();
   const deck=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false}),bridgeMat.clone());
   deck.position.set(cx,0,z-width/2);scene.add(freeze(deck));
   bridges.push({x:cx,z,span,width,arch});
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
     for(let i=0;i<8;i++){
      const a=point(i/8),b=point((i+1)/8);
      const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
      const rail=new T.Mesh(new T.BoxGeometry(len+.03,lift===1?.09:.06,.09),bridgeRailMat);
      rail.position.set(cx+(a.x+b.x)/2,(a.y+b.y)/2+lift,zz);
      rail.rotation.z=Math.atan2(dy,dx);scene.add(freeze(rail));
     }
    }
    // balusters
    for(let i=0;i<=10;i++){
     const t=i/10,pt=point(t);
     const post=new T.Mesh(new T.BoxGeometry(.07,.92,.07),bridgeRailMat);
     post.position.set(cx+pt.x,pt.y+.46,zz);scene.add(freeze(post));
    }
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
   const rocks=[[-w/2-1.2,.5,.8,h*.4],[-w/2-.35,.55,1.05,h+.35],[-w/2+.55,.35,.95,h+.5],[.05,.5,1.18,h+.65],
                [w/2-.55,.35,.92,h+.45],[w/2+.4,.55,.84,h*.65],[w/2+1.15,.45,.68,h*.4],[-.62,1.05,.74,h*.34],[.66,1.0,.7,h*.3]];
   const rockGroup=new T.Group();scene.add(rockGroup);
   if(view)view.fallback.push(rockGroup);
   // v309: the heap sits left of the pond centre and a little further back, so the stone shelf the
   // angler stands on (R.POND_PROPS[].ledge) is clear of it.
   rocks.forEach(([dx,dz,r,ry],i)=>{
    const rock=new T.Mesh(new T.DodecahedronGeometry(r,0),tone[i%3]);
    rock.position.set(fall.x-1.0+dx*.86,ry*.6,zc-d*(dz+.35));
    rock.scale.set(1.12,.9,1.02);
    rock.rotation.set(i*.7,i*1.3,i*.45);
    rockGroup.add(rock);
   });
   // the sheet: soft-edged streaks, top tucked under the lip slab, foot in the water
   const tex=makeFallTex(),H=h+.45,baseZ=zc+d*.55;
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
   const lipRock=new T.Mesh(new T.DodecahedronGeometry(w*.34,0),rockMat);
   lipRock.position.set(fall.x,.10+H-.02,baseZ-d*.05);
   lipRock.scale.set(1.3,.5,1.05);lipRock.rotation.set(.25,.5,.12);
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
  // pond is a ShapeGeometry, so position.xy is already the rounded-rectangle it was drawn from - that
  // gives an exact signed distance for the shore band instead of a fake rectangle gradient.
  const WATER_VERT=`
varying vec2 vPos;varying vec3 vWorld;
void main(){vPos=position.xy;vec4 wp=modelMatrix*vec4(position,1.0);vWorld=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`;
  const WATER_FRAG=`
precision highp float;
uniform sampler2D uA,uB,uN;uniform float uTime,uRadius,uFoamW;
uniform vec2 uHalf;uniform vec3 uShallow,uDeep,uFoam,uSun,uCam;
varying vec2 vPos;varying vec3 vWorld;
float sdRound(vec2 p,vec2 half_,float r){vec2 q=abs(p)-(half_-vec2(r));return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r;}
void main(){
 vec2 uv=vPos/(uRadius*1.9);
 // two hand-painted caustic frames, drifting against each other at odd scales
 vec3 sh=texture2D(uA,uv*2.1+vec2(uTime*.014,uTime*.008)).rgb;
 vec3 dp=texture2D(uB,uv*1.7-vec2(uTime*.010,-uTime*.013)).rgb;
 vec3 n=texture2D(uN,uv*3.9+vec2(uTime*.026,-uTime*.017)).rgb;
 float sd=sdRound(vPos,uHalf,uRadius);
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
     uShallow:{value:new T.Color(0x86d3c9)},uDeep:{value:new T.Color(0x1d6478)},
     uFoam:{value:new T.Color(0xf3fcff)},uSun:{value:new T.Color(0xfff1c6)},
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
   const water0=tile('water_frame_0'),water1=tile('water_frame_1'),stone=tile('limestone_pale'),planks=tile('bridge_planks'),red=tile('bridge_red');
   const cherry=prop('tree_cherry'),lantern=prop('lantern_stone'),boulder=prop('rock_boulder_mossy'),
         crag=prop('rock_cliff_crag'),bamboo=prop('bamboo_grove'),bush=prop('tree_bush_bright');
   if(!water0)return false;
   // cloned per pond so each surface drifts at its own offset
   const clone=(t,rx,ry)=>{const c=t.clone();c.needsUpdate=true;c.wrapS=c.wrapT=T.RepeatWrapping;c.repeat.set(rx,ry);return c};
   for(const v of pondViews){
    // water: one shader per pond, layering the painted frames and the shoreline mask
    const w0=clone(water0,1,1),w1=clone(tile('water_dark_0')||water1||water0,1,1),wN=clone(water1||water0,1,1);
    v.water.material=waterShader(w0,w1,wN,v.p);
    v.waterB.visible=false;
    for(const sp of v.fallSpray){
     sp.material.map=clone(water1||water0,1,2.2);sp.material.opacity=.4;sp.material.needsUpdate=true;
     fallScroll.push({tex:sp.material.map});
    }
    // v308: the fall now pours straight into the pond, so the stone channel that used to run from
    // the far side of the bridge has gone. What the bridge spans is the pond's outlet: a narrow
    // canal leaving the south coping and running down to the houses.
    if(v.props){
     const mouth=v.p.z+v.p.d/2+.1,len=3.7,zc=mouth+len/2;
     const chMat=waterShader(clone(water0,1,1),clone(tile('water_dark_0')||water0,1,1),clone(water1||water0,1,1),{w:2.8,d:len},.15);
     chMat.uniforms.uRadius.value=.5;
     const ch=new T.Mesh(new T.ShapeGeometry(roundedRect(2.8,len,.5)),chMat);
     ch.rotation.x=-Math.PI/2;ch.position.set(v.p.x,.13,zc);scene.add(ch);
     for(const side of [-1,1]){
      const bank=new T.Mesh(new T.BoxGeometry(.55,.26,len+.9),new T.MeshBasicMaterial({color:0xb9b2a0}));
      bank.position.set(v.p.x+side*1.68,.07,zc);scene.add(bank);
      if(stone){bank.material.map=clone(stone,1/2.2,len/4);bank.material.color.set(0xdfd9c8);bank.material.needsUpdate=true}
     }
     // a culvert where the canal leaves the coping, so the water never floats over the rim
     const culvert=new T.Mesh(new T.BoxGeometry(3.1,.3,.62),new T.MeshBasicMaterial({color:0xb7af9c}));
     culvert.position.set(v.p.x,.15,mouth);scene.add(culvert);
    }
    // stone coping: the same limestone the town's river walls are cut from, now with real height
    // so it casts a lip shadow over the water instead of being a painted flat ring.
    {
     const outer=roundedRect(v.p.w+1.7,v.p.d+1.7,3.1),inner=roundedRect(v.p.w-.35,v.p.d-.35,2.5);
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
    if(stone&&v.ledge){v.ledge.material.map=clone(stone,1.4,.7);v.ledge.material.color.set(0xe2dbca);v.ledge.material.needsUpdate=true}
    if(planks&&v.bridge){v.bridge.deck.material.map=clone(planks,1/2.3,1/2.3);v.bridge.deck.material.color.set(0xf2e6d2);v.bridge.deck.material.needsUpdate=true;}
    if(red){
     bridgeRailMat.map=clone(red,1,1);bridgeRailMat.color.set(0xffffff);bridgeRailMat.needsUpdate=true;
    }
    // painted props replace the primitives that were standing in for them
    for(const o of v.fallback)scene.remove(o);
    v.fallback.length=0;
    const props=v.props;if(!props)continue;
    if(cherry)for(const t of props.blossoms)addSprite(cherry,t.x,t.z,6.8*t.scale);
    if(lantern)for(const l of props.lanterns)addSprite(lantern,l.x,l.z,1.9);
    if(boulder)for(const b of props.boulders)addSprite(boulder,b.x,b.z,.78+b.r*.6);
    if(props.falls){
     // the rock face the water comes out of: behind the sheet, wide enough to hide it from the far side
     if(crag){addSprite(crag,props.falls.x-.9,props.falls.z-1.5,3.4);addSprite(crag,props.falls.x+1.1,props.falls.z-2.1,2.9)}
     // v309 (owner: "there is a bush on one of the chairs"): the bush sat .6 from the north-rim
     // angler chair. It lives on the pond's east bank now, clear of every chair and the bridge.
     if(bush)addSprite(bush,v.p.x+v.p.w/2+2.6,v.p.z-3.0,1.3);
    }
    if(bamboo)addSprite(bamboo,v.p.x+(v.p.x<0?-1:1)*(v.p.w/2+4.2),v.p.z+v.p.d/2+2.4,2.3);
    // rocks flanking the cascade where it meets the water
    if(boulder&&props.falls){
     addSprite(boulder,props.falls.x-2.55,props.falls.z+1.1,1.05);
     addSprite(boulder,props.falls.x+2.6,props.falls.z+1.3,.95);
    }
    // reflections: the blossom trees mirrored across the pond surface, so the water is not a flat
    // sheet of colour. Only the trees that actually mirror into the water get one.
    const mirror=(tex,x,z,h,objScale=1)=>{
     const dx=x-v.p.x,dz=z-v.p.z,hx=v.p.w/2,hz=v.p.d/2;
     // mirror across whichever shore the prop stands beyond
     const mx=Math.abs(dx)>hx, mz=Math.abs(dz)>hz;
     let rz=z,rx=x;
     if(mx&&!mz)rx=2*(v.p.x+Math.sign(dx)*hx)-x; else rz=2*(v.p.z+Math.sign(dz)*hz)-z;
     if(Math.abs(rx-v.p.x)>hx-.6||Math.abs(rz-v.p.z)>hz-.6)return;
     const m=new T.SpriteMaterial({map:tex,transparent:true,opacity:.2,depthWrite:false});
     const sp=new T.Sprite(m);sp.center.set(.5,1);sp.scale.set(h*(tex.image.width/tex.image.height)*objScale,-h*objScale,1);
     sp.position.set(rx,.035,rz);scene.add(sp);
    };
    if(cherry)for(const t of props.blossoms)mirror(cherry,t.x,t.z,6.8*t.scale);
    if(lantern)for(const l of props.lanterns)mirror(lantern,l.x,l.z,1.9);
    if(boulder)for(const b of props.boulders)mirror(boulder,b.x,b.z,.78+b.r*.6);
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
  const reedBatch=makeBatch();
  for(const p of R.PONDS){
   const view={p,props:null,fallback:[],falls:[],fallSpray:[],bridge:null,ledge:null,stones:[],rim:null,water:null,waterB:null};
   pondViews.push(view);
   const rim=new T.Mesh(new T.ShapeGeometry(roundedRect(p.w+1.7,p.d+1.7,3.1)),sandMat);rim.rotation.x=-Math.PI/2;rim.position.set(p.x,.008,p.z);scene.add(freeze(rim));view.rim=rim;
   const water=new T.Mesh(new T.ShapeGeometry(roundedRect(p.w,p.d,2.6)),waterMat);water.rotation.x=-Math.PI/2;water.position.set(p.x,.016,p.z);scene.add(freeze(water));view.water=water;
   const waterB=new T.Mesh(new T.ShapeGeometry(roundedRect(p.w-.05,p.d-.05,2.6)),waterMatB);waterB.rotation.x=-Math.PI/2;waterB.position.set(p.x,.019,p.z);scene.add(freeze(waterB));view.waterB=waterB;
   for(const [mat,y] of [[glintMatA,.024],[glintMatB,.028]]){const glint=new T.Mesh(new T.ShapeGeometry(roundedRect(p.w-.6,p.d-.6,2.4)),mat);glint.rotation.x=-Math.PI/2;glint.position.set(p.x,y,p.z);scene.add(freeze(glint));view.fallback.push(glint)}
   // v304: 28 low stones walked along the pond's own rounded outline. The old ring used an ellipse, so
   // at the corners it dropped stones into the water - now the edging follows the rim exactly.
   {
    const ring=roundedRect(p.w+1.26,p.d+1.26,3.25).getSpacedPoints(28);
    ring.forEach((pt,i)=>{
     // leave a mouth in the edging where the cascade enters the water (v308: north shore)
     if(pt.y>p.d/2&&Math.abs(pt.x)<1.7)return;
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
    const bx=p.x+(i-1.5)*(p.w/4.6),bz=p.z+(i%2?-1:1)*(p.d/3.9)+(i===2?1.4:0);
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
    g.position.set(bx,.032,bz);
    lilies.push({mesh:g,x:bx,z:bz,ph:i*2.1});scene.add(g);
   }
   pushModel(reedBatch,'shrub',p.x-p.w/2-1.5,p.z-p.d/2-.9,2,0,garden,gardenFloats);pushModel(reedBatch,'shrub',p.x+p.w/2+1.5,p.z+p.d/2+.9,2,0,garden,gardenFloats);
   // v304: the garden behind and around the pond. Positions come from R.POND_PROPS so the layout
   // test in tools/tests/social_sim.js can prove no prop sits in the water or on a chair.
   const props=(R.POND_PROPS||[])[R.PONDS.indexOf(p)]||null;
   view.props=props;
   if(props&&props.falls)cascade(p,props.falls,view);
   if(props){
    view.bridge=archBridge(props.bridge.x,props.bridge.z,props.bridge.span,props.bridge.width,props.bridge.arch);
    // v309: a flat stone shelf beside the cascade. It is a real platform: walk onto it and the hero
    // stands on top (platformLift), which is how you fish "on the rocks" instead of inside them.
    if(props.ledge){
     // v309: a stone shelf cut like the pond coping (rounded, extruded, limestone) so it reads as a
     // natural ledge at the water's edge rather than a concrete pad. You can walk onto it: the
     // invisible platform below uses the same footprint, and the hero's feet land on its top.
     const L=props.ledge;
     const slab=new T.Mesh(new T.ExtrudeGeometry(roundedRect(L.w,L.d,.55),{depth:L.h,bevelEnabled:false}),stoneMat.clone());
     slab.rotation.x=-Math.PI/2;slab.position.set(L.x,L.h,L.z);scene.add(freeze(slab));view.ledge=slab;
     const cap=new T.Mesh(new T.ExtrudeGeometry(roundedRect(L.w+.34,L.d+.34,.7),{depth:.12,bevelEnabled:false}),new T.MeshBasicMaterial({color:0xc9c2ae}));
     cap.rotation.x=-Math.PI/2;cap.position.set(L.x,L.h+.01,L.z);scene.add(freeze(cap));
     platforms.push({x:L.x,z:L.z,hx:L.w/2,hz:L.d/2,h:L.h+.09});
     // the boulder that ties the shelf to the rock face stays in painted mode too
     const back=new T.Mesh(new T.DodecahedronGeometry(.6,0),rockMidMat);
     back.position.set(L.x+L.w/2-.15,L.h+.08,L.z-.6);back.scale.set(1,.78,1);back.rotation.set(.4,.8,.2);
     scene.add(freeze(back));
     const back2=new T.Mesh(new T.DodecahedronGeometry(.42,0),rockDarkMat);
     back2.position.set(L.x+L.w/2-.75,L.h+.02,L.z-.5);back2.scale.set(1,.7,1);back2.rotation.set(-.3,.4,.5);
     scene.add(freeze(back2));
    }
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
  }
  addBatch(reedBatch,gardenMat);
  // v306: fetch the painted sheets once the pond exists (deferred so the plaza is interactive first);
  // every pond view is repainted in place when they arrive.
  setTimeout(loadPondArt,900);
  // Ambient fish silhouettes swim inside each pond; the Fishing Bag's "Show swimming fish" toggles them.
  const fishShape=new T.Shape();fishShape.moveTo(.4,0);fishShape.quadraticCurveTo(.05,.22,-.26,.06);fishShape.lineTo(-.46,.17);fishShape.lineTo(-.37,0);fishShape.lineTo(-.46,-.17);fishShape.lineTo(-.26,-.06);fishShape.quadraticCurveTo(.05,-.22,.4,0);
  const fishGeo=new T.ShapeGeometry(fishShape),fishGroup=new T.Group(),swimmers=[];scene.add(fishGroup);
  R.PONDS.forEach((p,pi)=>{for(let i=0;i<7;i++){const m=new T.Mesh(fishGeo,new T.MeshBasicMaterial({color:[0xe08a3c,0xd8dde2,0x8fc9b8][i%3],transparent:true,opacity:.78,depthWrite:false}));m.rotation.x=-Math.PI/2;const sc=.7+((i*31)%12)/16;m.scale.setScalar(sc);fishGroup.add(m);swimmers.push({m,p,ax:(p.w/2-1.6),az:(p.d/2-1.5),fa:.13+((i*17)%10)/90,fb:.1+((i*23)%10)/80,pa:i*1.7+pi,pb:i*2.9+pi*2})}});
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
   showPool.push({sprite:spr,tag,pid,t0:clock||performance.now(),dur:Math.max(1200,Math.min(9000,o.ms||5200)),scale:Math.max(.4,Math.min(11,Number(o.scale)||1))});
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
   updateRemoteRigs(now,dt);
   waterTexA.offset.x=(now/14000)%1;waterTexA.offset.y=(now/23000)%1;waterTexB.offset.x=1-(now/17000)%1;waterTexB.offset.y=(now/19000)%1;
   for(const f of falls)f.tex.offset.y=(now/700)%1;
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
  const label=document.createElement('div');label.className='social-player-label';label.dataset.loading='true';label.dataset.player=state.id;const bubble=document.createElement('div');bubble.className='social-bubble';bubble.dataset.player=state.id;const name=document.createElement('button');if(state.gm){name.textContent='🛠 '+state.name;name.title='Game Master';name.classList.add('social-gm')}else name.textContent=state.name;name.onclick=()=>callbacks.menu(state.name,state.id);const title=document.createElement('small');title.className='social-player-title';const fishTitle=document.createElement('small');fishTitle.className='social-player-fish-title';label.append(name,title,fishTitle);labels.append(label,bubble);
  p={canvas,ctx,texture,sprite,label,bubble,title,fishTitle,state,loaded:'',paint:'',height:3.2,aura:null,auraTier:-1,lx:'',ly:'',lhid:null,bx:'',by:'',bhid:null,bubbleUntil:0,looks:{},seq:0,retryAt:0,loading:false,trail:{points:[],progress:null}};players.set(state.id,p);
 }
 const nextTitle=state.look?.title||'';if(p.title.textContent!==nextTitle){p.title.textContent=nextTitle;p.title.hidden=!nextTitle}else if(p.title.hidden!==!nextTitle)p.title.hidden=!nextTitle;
 // v296: the fishing title is a second line, so it never displaces the Hunt title.
 const nextFish=state.look?.fishTitle||'';if(p.fishTitle.textContent!==nextFish){p.fishTitle.textContent=nextFish;p.fishTitle.hidden=!nextFish}else if(p.fishTitle.hidden!==!nextFish)p.fishTitle.hidden=!nextFish;
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
  const chair=pokerChair||(state.sit&&R.SEATS[state.seat]),floor=chair?chair.height:.06+Math.max(bridgeLift(state.x,state.z),platformLift(state.x,state.z));
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
