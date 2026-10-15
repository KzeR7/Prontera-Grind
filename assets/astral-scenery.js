/* Live Astral route. Original stone/space textures; no changes to native art. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory;
 else root.PGAstralScenery=factory(root.THREE);
})(typeof globalThis!=='undefined'?globalThis:this,function(THREE){
'use strict';
const GROUPS=Object.freeze([[1,2],[3],[4],[5]].map(Object.freeze));
const FOCUS=Object.freeze([-8,-74,-140,-208]);
const RIGHT=[[14.8,24],[15.3,6],[14.8,-30],[15.4,-54],[14.8,-92],[15.6,-122],[14.8,-160],[14.8,-177],[22,-188],[25,-194],[25,-219],[17,-235],[0,-245]];
const OUTLINE=[...RIGHT,...RIGHT.slice(0,-1).reverse().map(([x,z])=>[-x,z])];
const TITLES=['Starlit Arrival','Fallen Arcade','Runic Observatory','Astral Sanctuary'];
function groupFor(stage){if(!Number.isInteger(stage)||stage<1||stage>5)throw new RangeError('Ascension stage must be 1–5');return stage<=2?0:stage-2;}
function random(seed){return()=>((seed=seed*16807%2147483647)-1)/2147483646;}
function bridgeWidth(z){for(let i=0;i<RIGHT.length-1;i++){const a=RIGHT[i],b=RIGHT[i+1];if(z<=a[1]&&z>=b[1])return a[0]+(b[0]-a[0])*(z-a[1])/(b[1]-a[1]);}return 0;}
function build(stage,options={}){
 const group=groupFor(stage),scene=new THREE.Scene(),scenery=new THREE.Group();scene.add(scenery);
 scene.background=new THREE.Color(0x080e27);scene.fog=new THREE.FogExp2(0x121d41,.0015);
 const geometries=new Set(),materials=new Set(),textures=new Set(),cache=new Map(),batches=new Map(),footings=[],islands=[];
 const detailRandom=random(61723);
 const surfaces=options.surfaces||{};
 function imageTexture(image){if(!image)return null;const t=new THREE.Texture(image);t.needsUpdate=true;t.encoding=THREE.sRGBEncoding;textures.add(t);return t;}
 const sky=imageTexture(surfaces.space);if(sky)scene.background=sky;
 const stoneTexture=imageTexture(surfaces.stone);if(stoneTexture){stoneTexture.wrapS=stoneTexture.wrapT=THREE.RepeatWrapping;stoneTexture.anisotropy=4;}
 function material(color,glow=false,floor=false){const key=[color,glow,floor].join(':');if(cache.has(key))return cache.get(key);
  const m=glow?new THREE.MeshBasicMaterial({color,toneMapped:false}):new THREE.MeshStandardMaterial({color,roughness:.91,metalness:.12,map:floor?stoneTexture:null,bumpMap:floor?stoneTexture:null,bumpScale:.11});materials.add(m);cache.set(key,m);return m;}
 function mesh(geo,mat,x=0,y=0,z=0,category='ruins'){geometries.add(geo);const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.userData.category=category;m.receiveShadow=true;m.castShadow=category!=='floor'&&category!=='rune';scenery.add(m);return m;}
 const shapes={box:new THREE.BoxGeometry(1,1,1),column:new THREE.CylinderGeometry(.5,.55,1,12),shard:new THREE.IcosahedronGeometry(.6,0),chip:new THREE.TetrahedronGeometry(.65),crystal:new THREE.OctahedronGeometry(.5)};Object.values(shapes).forEach(g=>geometries.add(g));
 const matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),scale=new THREE.Vector3(),quat=new THREE.Quaternion();
 function add(shape,color,x,y,z,w,h,d,rotation=0,glow=false,category='ruins'){
  const key=[shape,color,glow,category].join(':');if(!batches.has(key))batches.set(key,{shape,mat:material(color,glow),category,transforms:[]});
  pos.set(x,y,z);scale.set(w,h,d);quat.setFromEuler(new THREE.Euler(...(Array.isArray(rotation)?rotation:[0,rotation,0])));matrix.compose(pos,quat,scale);batches.get(key).transforms.push(matrix.clone());
 }
 const stone=0x747e9a,trim=0xb5b4ce,dark=0x323e5a,cyan=0x67dce5,violet=0xa88fe5;
 const shape=new THREE.Shape();OUTLINE.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
 const deck=mesh(new THREE.ShapeGeometry(shape),material(0x303a50),0,.015,0,'floor');deck.rotation.x=-Math.PI/2;
 const uv=deck.geometry.attributes.uv,p=deck.geometry.attributes.position;for(let i=0;i<uv.count;i++)uv.setXY(i,(p.getX(i)+25)/50,(p.getY(i)+24)/269);
 const bed=mesh(new THREE.ExtrudeGeometry(shape,{depth:1.8,bevelEnabled:true,bevelThickness:.1,bevelSize:.15,bevelSegments:1,steps:1}),material(dark),0,-1.9,0,'foundation');bed.rotation.x=-Math.PI/2;
 // Merge hand-shaped paving and engravings into a few draw calls. All lane detail
 // stays below 0.2 units; tall debris belongs only to the outer margins.
 function layer(){return {positions:[],colors:[],uv:[],tri(a,b,c,color,tex){const col=new THREE.Color(color);for(const [i,v]of [a,b,c].entries()){this.positions.push(...v);this.colors.push(col.r,col.g,col.b);this.uv.push(...(tex?tex[i]:[v[0]/6,v[2]/6]));}}};}
 const paving=layer(),mosaic=layer(),inlay=layer(),runes=layer();let slabCount=0;
 function finishLayer(data,category,textured=false,glow=false){
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(data.colors,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(data.uv,2));geo.computeVertexNormals();
  const mat=glow?new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false}):new THREE.MeshStandardMaterial({vertexColors:true,map:textured?stoneTexture:null,roughness:.96,metalness:textured?.03:.22});materials.add(mat);
  const object=mesh(geo,mat,0,0,0,category);if(textured)object.userData.texture='stone';return object;
 }
 const slabColors=[0x778298,0x8993a7,0x67768e,0x9196a8,0x728095,0x858d9f,0x777e95];
 for(let z=22;z>-242;){
  const length=2.7+detailRandom()*2.2,next=Math.max(-244,z-length),half=Math.min(bridgeWidth(z),bridgeWidth(next))-.18;
  for(let left=-half;left<half-.4;){const right=Math.min(half,left+2.1+detailRandom()*2.7),depth=z-next-.09,width=right-left-.09;
   const x=(left+right)/2,cz=(z+next)/2,hw=width/2,hd=depth/2,cut=.08+detailRandom()*.26,height=.066+detailRandom()*.025;
   const corners=[[-hw+cut,-hd],[hw-cut*.6,-hd],[hw,-hd+cut],[hw,hd-cut*.7],[hw-cut,hd],[-hw+cut*.5,hd],[-hw,hd-cut],[-hw,-hd+cut*.5]];
   const color=slabColors[Math.floor(detailRandom()*slabColors.length)],offset=[detailRandom()*12,detailRandom()*12],turn=detailRandom()>.5;
   const uvOf=v=>[offset[0]+(turn?v[2]:v[0])/6,offset[1]+(turn?-v[0]:v[2])/6];
   for(let i=0;i<corners.length;i++){
    const j=(i+1)%corners.length,a=[x+corners[i][0],height,cz+corners[i][1]],b=[x+corners[j][0],height,cz+corners[j][1]],center=[x,height,cz];
    paving.tri(center,b,a,color,[uvOf(center),uvOf(b),uvOf(a)]);
    const aa=[a[0],.021,a[2]],bb=[b[0],.021,b[2]];paving.tri(a,b,bb,0x48556d);paving.tri(a,bb,aa,0x48556d);
   }
   slabCount++;left=right;
  }z=next;
 }
 function stroke(data,points,width,color,y=.105){for(let i=1;i<points.length;i++){const [x,z]=points[i-1],[xx,zz]=points[i],length=Math.hypot(xx-x,zz-z);if(!length)continue;const dx=(zz-z)/length*width/2,dz=-(xx-x)/length*width/2;
  const a=[x+dx,y,z+dz],b=[xx+dx,y,zz+dz],c=[xx-dx,y,zz-dz],d=[x-dx,y,z-dz];data.tri(a,c,b,color);data.tri(a,d,c,color);
 }}
 function floorRing(x,z,r,width,color,data=inlay,start=0,end=Math.PI*2){const points=[];for(let i=0;i<=96;i++){const a=start+(end-start)*i/96;points.push([x+Math.cos(a)*r,z+Math.sin(a)*r]);}stroke(data,points,width,color);}
 function wedge(z,inner,outer,a,b,color){for(let i=0;i<8;i++){const aa=a+(b-a)*i/8,bb=a+(b-a)*(i+1)/8,p=(r,t)=>[Math.cos(t)*r,.097,z+Math.sin(t)*r];mosaic.tri(p(inner,aa),p(outer,bb),p(outer,aa),color);mosaic.tri(p(inner,aa),p(inner,bb),p(outer,bb),color);}}
 const glyphs=[[[0,-.8],[0,.8],[-.5,.1],[0,-.4],[.5,.1]],[[0,.8],[0,-.8],[-.5,-.2],[.5,-.2]],[[0,-.8],[-.5,0],[0,.8],[.5,0],[0,-.8]],[[0,.8],[0,-.8],[.5,-.3],[0,.2],[-.5,-.3]],[[0,-.8],[0,.8],[-.5,.3],[.5,-.3]],[[0,.8],[-.5,-.6],[.5,-.6],[0,.8],[0,-.8]]];
 function glyph(x,z,size,angle,color,data=inlay,index=0){const c=Math.cos(angle),s=Math.sin(angle);stroke(data,glyphs[((index%glyphs.length)+glyphs.length)%glyphs.length].map(([a,b])=>[x+(a*c-b*s)*size,z+(a*s+b*c)*size]),.075*size,color);}
 // Worn border mosaics, repair patches, branching cracks and tool marks.
 for(let z=20;z>-237;z-=2.2){const half=bridgeWidth(z);for(const side of [-1,1]){
  const x=side*(half-1.05);stroke(inlay,[[x-.38,z-.5],[x+.38,z-.5],[x+.38,z+.5],[x-.38,z+.5],[x-.38,z-.5]],.07,z<-177?0x9c927c:0x727c96);
  if(detailRandom()>.36)stroke(inlay,[[x-.2,z],[x,z-.3],[x+.2,z],[x,z+.3],[x-.2,z]],.1,0xa5a3a0);
  stroke(inlay,[[side*(half-2.5),z-.95],[side*(half-2.5),z+.95]],.12,0x9a927f);
  if(Math.floor(-z)%7===0)glyph(side*(half-2),z,.6,side*Math.PI/2,0x728f9d,runes,Math.floor(-z));
 }}
 for(let i=0;i<150;i++){const z=20-detailRandom()*253,x=(detailRandom()-.5)*Math.min(25,bridgeWidth(z)*1.7),len=.4+detailRandom()*1.2;
  stroke(inlay,[[x,z],[x+.25,z-len*.4],[x-.12,z-len*.7],[x+.3,z-len]],.025,0x28354c);
  if(i%3===0)stroke(inlay,[[x+.25,z-len*.4],[x+.65,z-len*.6],[x+.8,z-len*.4]],.018,0x354158);
  if(i%2===0)for(let j=0;j<3;j++)stroke(inlay,[[x+j*.13,z+.3],[x+j*.13+.17,z+.48]],.035,0xadb3bf);
 }
 function crest(z,r,style){
  for(let i=0;i<16;i++){const a=i*Math.PI/8+.012,b=(i+1)*Math.PI/8-.012;
   wedge(z,r-1.8,r-.45,a,b,i%2?0x5c7287:0x8b8f99);wedge(z,r*.18,r-2.1,a,b,i%4?0x4c627d:0x79879b);
  }
  floorRing(0,z,r,.24,0x59677e);floorRing(0,z,r-.4,.07,0xb5a88e);floorRing(0,z,r+.35,.06,0x9aa5b5);
  for(let i=0;i<12;i++){const a=i*Math.PI/6,rr=r-.9;glyph(Math.cos(a)*rr,z+Math.sin(a)*rr,.67,a+Math.PI/2,i%3?0xa6a6ab:0x6db6c8,i%3?inlay:runes,i+style);
   if(i%2===0)stroke(inlay,[[Math.cos(a)*(r-1.7),z+Math.sin(a)*(r-1.7)],[Math.cos(a)*(r-3),z+Math.sin(a)*(r-3)]],.12,0x9c927f);
  }
  if(style===2){
   // An astronomical instrument engraved in the observatory floor.
   for(const tilt of [-.52,.52]){const points=[];for(let i=0;i<=96;i++){const a=i*Math.PI/48,x=Math.cos(a)*r*.64,zz=Math.sin(a)*r*.3;points.push([x*Math.cos(tilt)-zz*Math.sin(tilt),z+x*Math.sin(tilt)+zz*Math.cos(tilt)]);}stroke(inlay,points,.16,0xa4a9ad);}
   for(let i=0;i<32;i++){const a=i*Math.PI/16,rr=r*.7;stroke(inlay,[[Math.cos(a)*rr,z+Math.sin(a)*rr],[Math.cos(a)*(rr+(i%4?.2:.55)),z+Math.sin(a)*(rr+(i%4?.2:.55))]],.055,0xb1a68e);}
  }else{
   const points=[];for(let i=0;i<=16;i++){const a=i*Math.PI/8,rr=i%2?r*(style===4?.25:.17):r*(style===4?.57:.63);points.push([Math.cos(a)*rr,z+Math.sin(a)*rr]);}stroke(inlay,points,.15,0xa49a88);
  }
  floorRing(0,z,r*.16,.1,0x6da4b8,runes);
 }
 crest(-5,7.1,0);crest(-140,9,2);crest(-208,11,4);
 // The broken crossing retains only fragments of its once complete mosaic.
 for(let i=0;i<7;i++){floorRing(0,-74,4+i*.37,.12,i%2?0x9b9688:0x485d7a,inlay,i*.64,i*.64+.95);wedge(-74,3+i*.3,5+i*.3,i*.64,i*.64+.9,i%2?0x6f8097:0x495c78);}
 for(let i=0;i<8;i++){const a=i*Math.PI/4;stroke(inlay,[[Math.cos(a)*3.5,-140+Math.sin(a)*3.5],[Math.cos(a)*6.5,-140+Math.sin(a)*6.5]],.09,0x7596ac);}
 // Constellation lines inside the boss seal, with bright pinpoints and copper rays.
 const constellation=[[-5,-210],[-2,-204],[4,-206],[6,-214],[0,-217],[-5,-210],[4,-206]];stroke(runes,constellation,.045,0x7bafc9);
 for(const [x,z]of constellation)floorRing(x,z,.19,.1,0xb4e2df,runes);
 for(const [z,side]of [[-20,1],[-64,-1],[-90,1],[-130,-1],[-170,1],[-217,-1]]){
  const x=side*Math.min(bridgeWidth(z)-.3,14);const crack=[[x,z],[x-side*2,z-1.2],[x-side*3.8,z-1],[x-side*4.3,z-3],[x-side*6,z-3.6],[x-side*7.8,z-6]];
  stroke(inlay,crack,.18,0x9ba3b1);stroke(inlay,crack,.075,0x28364e);
 }
 // Long inset panels break up the paving at a readable scale. Individual missing
 // tesserae, repair strips and irregular ends make the borders feel excavated.
 for(const [start,end,pattern]of [[17,-32,0],[-53,-96,1],[-119,-161,2],[-185,-227,3]])for(const side of [-1,1]){
  for(let z=start;z>end;z-=1.15){const x=side*(Math.min(bridgeWidth(z),18)-3.55);
   if(detailRandom()<.13)continue;
   const a=[x-.62,.098,z],b=[x+.62,.098,z],c=[x+.62,.098,z-.94],d=[x-.62,.098,z-.94],col=pattern===1?0x4b596d:pattern===2?0x435e75:0x53637a;
   mosaic.tri(a,b,c,col);mosaic.tri(a,c,d,col);
   if(pattern===2){stroke(inlay,[[x-.44,z-.76],[x,z-.18],[x+.44,z-.76]],.09,0xa99e88);}
   else if(pattern===1){stroke(inlay,[[x-.48,z-.8],[x+.48,z-.18]],.11,0x8d919a);}
   else{stroke(inlay,[[x-.42,z-.47],[x,z-.1],[x+.42,z-.47],[x,z-.84],[x-.42,z-.47]],.08,0xa49b88);}
  }
 }
 // Every column has a contiguous stone foundation meeting its base at y=0.
 function pillar(x,z,h,broken=false){
  const footing={x,z,width:5,depth:4,top:0,bottom:-1.8,baseY:0};footings.push(footing);
  add('box',dark,x,-.9,z,5,1.8,4,0,false,'foundation');
  add('box',trim,x,.24,z,2.4,.48,2.4);add('column',stone,x,h/2+.48,z,1.45,h,1.45);
  for(let y=1;y<h;y+=2)add('column',trim,x,y,z,1.65,.13,1.65);
  add('box',trim,x,h+.63,z,2,.3,2);if(!broken)add('box',stone,x,h+.94,z,1.6,.32,1.6);
  add('box',cyan,x,.5+h*.32,z+.75,.1,h*.42,.025,0,true,'rune');
  for(let i=0;i<6;i++){const a=i*Math.PI/3;add('box',0x424f68,x+Math.cos(a)*.72,h*.5+.5,z+Math.sin(a)*.72,.045,h*.72,.045,a);}
  add('column',0x8f8a85,x,.55,z,1.78,.1,1.78);
  for(const side of [-1,1])add('box',0x716b67,x+side*.88,.24,z+1.21,.13,.13,.03);
  if(broken){add('chip',0xa1a6b5,x-.3,h+.82,z-.2,.6,.36,.8,[.2,.4,.3]);add('box',0x3e4c65,x+.28,h*.8,z+.68,.035,h*.28,.03,[0,0,.08]);}
 }
 function arc(x,z,width,height,broken=false){for(const side of [-1,1]){pillar(x+side*width/2,z,height*.65,broken);
  for(let i=0;i<12;i++){if(broken&&side===1&&i>5)continue;const a=i/11*Math.PI/2;
   add('box',i%3?stone:trim,x+side*width/2*Math.cos(a),height*.65+height*.35*Math.sin(a),z,.9,.85,1.2,-side*a);}
 }}
 function ring(x,y,z,r,color,flat=false){const m=mesh(new THREE.TorusGeometry(r,.07,5,96),material(color,true),x,y,z,'rune');if(flat)m.rotation.x=-Math.PI/2;return m;}
 // Fine paving seams and intermittent edge runes leave the fighting lane open.
 for(let z=22;z>-179;z-=4){for(const side of [-1,1]){
  add('box',trim,side*14.25,.12,z,.45,.24,3.7);add('box',cyan,side*13.5,.035,z,.055,.025,2.6,0,true,'rune');
  if(z%12===-2||z===22){add('box',stone,side*14.3,.85,z,.65,1.7,.65);add('box',cyan,side*14.3,1.75,z,.3,.12,.3,0,true,'rune');}
 }
 }
 for(const z of [8,-26])for(const side of [-1,1])pillar(side*16,z,z===8?3.3:5.1,true);
 // Fallen arcade: taller broken arches rise from joined edge buttresses.
 for(const z of [-61,-92])for(const side of [-1,1]){pillar(side*17,z,8.2,true);for(let i=0;i<5;i++)add('box',stone,side*(18+i*.7),8.6+i*.6,z,.95,.8,1.1,side*.3);}
 // Each drifting ruin has its own eroded outline, offset fracture layers and
 // splintered underside. No duplicated diamond mesh or rectangular island cap.
 function rockIsland(x,top,z,rx,rz,depth,seed){
  const rand=random(seed),n=11+seed%3,rings=[],rock=layer(),angle=rand()*Math.PI;
  const profile=Array.from({length:n},(_,i)=>({a:i/n*Math.PI*2+angle+(rand()-.5)*.16,r:.77+rand()*.3}));
  const lean=[(rand()-.5)*rx*.8,(rand()-.5)*rz*.7];
  for(let ring=0;ring<4;ring++)rings.push(profile.map(({a,r},i)=>{const taper=[1,.98,.72,.26][ring]*(.92+rand()*.16),fall=[0,.13,.56,1][ring];return [x+Math.cos(a)*rx*r*taper+lean[0]*fall,top-depth*fall+(rand()-.5)*(ring?.9:.35),z+Math.sin(a)*rz*r*taper+lean[1]*fall];}));
  const inner=profile.map(({a,r})=>[x+Math.cos(a)*rx*r*.45,top+.12+rand()*.6,z+Math.sin(a)*rz*r*.45]);
  const summit=[x+lean[0]*.15,top+.25+rand()*.5,z+lean[1]*.15];
  for(let i=0;i<n;i++){
   const j=(i+1)%n,col=i%3?0x687387:0x7d8694;
   rock.tri(summit,inner[j],inner[i],col);rock.tri(inner[i],inner[j],rings[0][j],col);rock.tri(inner[i],rings[0][j],rings[0][i],i%2?0x59697f:0x7a8290);
   for(let ring=0;ring<3;ring++){
    const palette=ring===0?[0x777f8c,0x5d6a7e,0x9299a1]:ring===1?[0x49566c,0x616a7d,0x556279]:[0x35415a,0x46516a,0x596077];
    const col=palette[Math.floor(rand()*palette.length)];rock.tri(rings[ring][i],rings[ring][j],rings[ring+1][j],col);rock.tri(rings[ring][i],rings[ring+1][j],rings[ring+1][i],col);
   }
   rock.tri(rings[3][i],rings[3][j],[x+lean[0],top-depth-.6,z+lean[1]],0x303b53);
  }
  const object=finishLayer(rock,'island',true);object.userData.seed=seed;islands.push({x,z,rx,rz,depth,seed});
  // Scattered, half-buried ruin fragments follow the surface instead of making
  // identical rows of bright blocks on every island.
  for(let i=0;i<7;i++)add(i%3?'chip':'box',i%2?0x7b8596:0x56637a,x+(rand()-.5)*rx,top+.24+rand()*.18,z+(rand()-.5)*rz,.5+rand()*1.3,.2+rand()*.45,.4+rand(),[rand()*.3,rand()*6,rand()*.3]);
  for(let i=0;i<8;i++)add('chip',i%2?stone:dark,x+(rand()-.5)*rx*2.5,top-2-rand()*depth*1.3,z+(rand()-.5)*rz*2.6,.3+rand()*1.2,.4+rand()*1.4,.4+rand()*1.1,[rand(),rand()*3,rand()]);
  return {x,y:top+.2,z};
 }
 const fragments=[[-34,-6,-20,7,4.6,6,2101],[39,-11,-43,4.7,3.8,7,2113],[-37,-3,-82,9,6,10,2129],[32,-10,-105,5,3.4,5,2143],[-38,-6,-153,6.5,4.5,9,2153],[42,-14,-165,8,5.5,7,2161],[-42,-8,-218,8,4.6,11,2179],[39,-3,-236,6,4.5,8,2197]];
 fragments.forEach(args=>rockIsland(...args));
 // A distant shattered arcade supplies a readable ruin silhouette on the big island.
 for(const side of [-1,1]){const x=-37+side*4;add('column',stone,x,1.1,-82,1.35,8,1.35);add('column',trim,x,-2.6,-82,2,.6,2);add('column',trim,x,4.8,-82,1.8,.3,1.8);
  for(let i=0;i<(side===1?4:7);i++){const a=i/9*Math.PI/2;add('box',trim,-37+side*4*Math.cos(a),4.8+Math.sin(a)*3.5,-82,.85,.85,1.1,[0,0,-side*a]);}
 }
 // Rubble accumulates on supported bridge margins; flat flakes stay flush in the lane.
 for(let i=0;i<180;i++){const z=20-detailRandom()*248,side=i%2?1:-1,half=bridgeWidth(z),x=side*(half-.45-detailRandom()*.65);
  if(Math.abs(x)<13.2)continue;const h=.08+detailRandom()*.3;
  add(i%4?'chip':'box',i%3?stone:trim,x,h*.5+.1,z,.15+detailRandom()*.5,h,.2+detailRandom()*.5,[detailRandom()*.3,detailRandom()*6,detailRandom()*.2],false,'rubble');
 }
 // Edge shrines, collapsed wall courses and mineral clusters add local discoveries.
 for(const [x,z]of [[14,-42],[-14,-107],[14,-171],[-20,-216]]){
  add('box',dark,x,.32,z,1.2,.5,1.3);add('box',0x8b929d,x,.67,z,1.35,.2,1.4);
  for(let j=0;j<3;j++)add('crystal',j===1?0x80bdcc:0x787cad,x+(j-1)*.3,1.05+j*.12,z+(j%2)*.2,.3,.9+j*.25,.3,[0,j*.7,(j-1)*.2],j===1,'relic');
 }
 for(const side of [-1,1]){
  const shelf=new THREE.Shape();[[14,-72],[19,-72],[21.5,-75],[20.5,-79],[18,-82],[14,-81]].forEach(([x,z],i)=>i?shelf.lineTo(side*x,-z):shelf.moveTo(side*x,-z));shelf.closePath();
  const support=mesh(new THREE.ExtrudeGeometry(shelf,{depth:1.8,bevelEnabled:true,bevelThickness:.08,bevelSize:.12,bevelSegments:1,steps:1}),material(0x626f86),0,-1.88,0,'foundation');support.rotation.x=-Math.PI/2;
  for(let row=0;row<4;row++)for(let i=0;i<5-row;i++)add('box',row%2?stone:trim,side*(16.1+i*.75),.45+row*.65,-78+(i%2)*.15,1.1,.6,1.2,.05);
 }
 for(const [x,z]of [[14.1,-17],[-14.1,-48],[14.1,-115],[-14.1,-162],[23,-211]]){
  add('column',0x929baa,x,.86,z,1.45,3.7,1.45,[Math.PI/2,0,.13],false,'rubble');
  add('chip',stone,x-.15,.27,z-2,.9,.45,.8,[.3,.6,.2],false,'rubble');
 }
 // Carved brackets under the edge show that this is an old bridge, not a thin board.
 for(let z=16;z>-176;z-=13.7)for(const side of [-1,1]){add('box',0x59667f,side*13.8,-.85,z,2.2,.3,1.6);add('box',dark,side*13.5,-1.7,z,1.8,1.6,1.45,[0,0,side*.3]);}
 // Observatory: celestial rings and edge monoliths frame the last span.
 const armillary=[ring(-29,10,-142,7.5,violet),ring(-29,10,-142,5.4,cyan)];armillary[0].rotation.y=.45;armillary[1].rotation.x=.7;
 for(const z of [-127,-155])for(const side of [-1,1])pillar(side*16,z,z===-127?6:8);
 // Boss seal is paint-thin; the gate is behind combat and its feet are ON the deck.
 for(const r of [12.5,15.8,17.4])ring(0,.117,-208,r,r===15.8?violet:cyan,true);
 for(let i=0;i<24;i++){const a=i/24*Math.PI*2,r=16.6,x=Math.cos(a)*r,z=-208+Math.sin(a)*r;
  glyph(x,z,.8,a+Math.PI/2,i%3?violet:cyan,runes,i);}
 arc(0,-233,17,16,true);ring(0,11.5,-234,6.7,violet);
 for(const side of [-1,1])pillar(side*23,-207,5.5,true);
 const pavingMesh=finishLayer(paving,'floor',true);pavingMesh.userData.slabs=slabCount;
 finishLayer(mosaic,'mosaic',true);finishLayer(inlay,'engraving');finishLayer(runes,'rune',false,true);
 for(const b of batches.values()){const m=new THREE.InstancedMesh(shapes[b.shape],b.mat,b.transforms.length);b.transforms.forEach((t,i)=>m.setMatrixAt(i,t));m.userData.category=b.category;m.receiveShadow=true;m.castShadow=b.category==='ruins';scenery.add(m);}
 scene.add(new THREE.HemisphereLight(0xc8ddff,0x343451,.85));
 const sun=new THREE.DirectionalLight(0xddd6ff,1.2);sun.position.set(-35,95,25);sun.target.position.set(0,0,-110);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-75,right:75,top:285,bottom:-80,far:450});sun.shadow.bias=-.001;sun.shadow.normalBias=.18;scene.add(sun,sun.target);
 for(const z of [-74,-140,-208]){const light=new THREE.PointLight(z===-74?violet:cyan,.85,45,2);light.position.set(-10,6,z);scene.add(light);}
 const starRandom=random(1247);
 const stars=new Float32Array(420*3);for(let i=0;i<420;i++){stars[i*3]=(starRandom()-.5)*320;stars[i*3+1]=-35+starRandom()*100;stars[i*3+2]=-290+starRandom()*380;}
 const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.BufferAttribute(stars,3));geometries.add(starGeo);
 const starMat=new THREE.PointsMaterial({color:0xd1ddff,size:.16,transparent:true,opacity:.8,depthWrite:false});materials.add(starMat);scene.add(new THREE.Points(starGeo,starMat));scene.updateMatrixWorld(true);
 let disposed=false;
 return {scene,scenery,kind:'astral',stage,group,title:TITLES[group],footprint:group===3?'bridge-terminus':'bridge',arena:{halfWidth:13,z0:FOCUS[group]-20,z1:FOCUS[group]+20},view:{focus:FOCUS[group],far:800},route:{start:24,end:-245,focus:FOCUS.slice(),outline:OUTLINE.map(p=>p.slice())},footings,islands,
  update(seconds,motion=true){if(disposed)return;armillary[1].rotation.z=motion?seconds*.025:0;},
  dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());sun.shadow.dispose();scene.clear();},
  stats(){let instances=0,triangles=0;scenery.traverse(o=>{if(o.isInstancedMesh)instances+=o.count;if(o.geometry)triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});return{instances,batches:batches.size,triangles:Math.round(triangles)};}
 };
}
return Object.freeze({GROUPS,FOCUS,OUTLINE,TITLES,groupFor,build});
});
