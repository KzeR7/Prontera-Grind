/* Original endgame scenery proposal. No game state or native sprite modifications. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else root.PGEndgameScenes=factory(root.THREE);
})(typeof globalThis!=='undefined'?globalThis:this,function(THREE){
'use strict';
const ARENA=Object.freeze({halfWidth:13,z0:-28,z1:12});
const GROUPS=Object.freeze([[1,2,3],[4,5,6],[7,8,9],[10]].map(Object.freeze));
const TITLES={astral:['Arrival Span','Ruined Crossing','Celestial Approach','Bridge-End Sanctuary'],thor:['Outer Fissure','Magma Gallery','Core Approach','Primal Core']};
const FEATURES={
 astral:[['One continuous bridge through the astral void','Slender rails and a thin suspended deck','Broken arrival arches, not separate islands','The route continues toward the distant boss gate'],['The same bridge passing ruined gate pylons','Crumbling edge masonry and flying buttresses','No cathedral room or detached fighting platform','The far sanctuary stays connected by the bridge'],['The final long span toward the sanctuary','A celestial armillary beside the route','Luminous edge inlay guides the approach','Continuous walkable paving into the boss terminus'],['Widened sanctuary at the end of the bridge','The approach bridge remains visibly attached','Broken celestial gate beyond the boss position','Not an isolated circular arena or stone island']],
 thor:[['Irregular cooled-lava shelf','One-sided molten fissure','Cooled spills & fractured basalt','Loose volcanic rubble'],['Wide magma basin & twin cascades','Molten overflow around the side ledges','Crusted lava islands','Sheared cliff on the opposite bank'],['Two active side calderas','Radial heat fractures & cooled spills','Obsidian ribs & glowing vents','Lava streams around the approach'],['54-unit circular obsidian arena','Arena surrounded by a broad lava lake','Radial fractured basalt crown','Giant rear caldera & molten breach']]
};
const BRIDGE={focus:[-8,-74,-140,-208],start:24,end:-245};
const bridgeRight=[[14.8,24],[15.3,6],[14.8,-30],[15.4,-54],[14.8,-92],[15.6,-122],[14.8,-160],[14.8,-177],[22,-188],[25,-194],[25,-219],[17,-235],[0,-245]];
const bridgeOutline=[...bridgeRight,...bridgeRight.slice(0,-1).reverse().map(([x,z])=>[-x,z])];
function groupFor(stage){if(!Number.isInteger(stage)||stage<1||stage>10)throw new RangeError('Normal stage must be 1–10');return stage===10?3:Math.floor((stage-1)/3);}
function random(seed){let n=seed;return()=>((n=n*16807%2147483647)-1)/2147483646;}
function cameraPose(aspect,az=0,elevation=.95,zoom=1,focusZ=-.25){const d=(aspect<1.5?26:18)/zoom;return{position:[Math.sin(az)*Math.cos(elevation)*d,Math.sin(elevation)*d+.5,focusZ+Math.cos(az)*Math.cos(elevation)*d],target:[0,.28,focusZ],fov:38,near:.1,far:200};}
// Original drawn surfaces, not edited copies of the existing kit or native sprites.
function texture(type,kind,group,createCanvas,sourceImage){
 if(!createCanvas)return null;
 const c=createCanvas();c.width=c.height=type==='floor'?2048:1024;
 const g=c.getContext('2d');if(!g)return null;
 const N=c.width,r=random(8711+group*977+(kind==='thor'?2017:0)),astral=kind==='astral';
 const stroke=(points,color,width)=>{g.strokeStyle=color;g.lineWidth=width;g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.stroke();};
 if(type==='lava'&&sourceImage){g.drawImage(sourceImage,0,0,N,N);}
 else if(type==='lava'){
  g.fillStyle='#ff6a12';g.fillRect(0,0,N,N);
  for(let i=0;i<1700;i++){
   const x=r()*N,y=r()*N,rad=4+r()*27;
   g.fillStyle=['#a82b0b','#d83b0b','#ff9126','#ffc258'][i%4];g.beginPath();g.ellipse(x,y,rad*2,rad,.4+r()*2,0,Math.PI*2);g.fill();
  }
  for(let i=0;i<65;i++){
   const x=r()*N,y=r()*N;stroke([[x,y],[x+18,y+10],[x+50,y-4],[x+83,y+21]],'#ffe69a',2+r()*3);
  }
 }else{
  g.fillStyle=astral?'#302b42':'#231715';g.fillRect(0,0,N,N);
  const step=astral?80:220;
  if(!astral&&group<3&&sourceImage){g.drawImage(sourceImage,0,0,N,N);g.fillStyle='#241b23a0';g.fillRect(0,0,N,N);}
  if(astral||group===3)for(let row=-1;row<Math.ceil(N/step)+1;row++)for(let col=-1;col<Math.ceil(N/step)+1;col++){
   const x=col*step+(row%2)*step*.5,y=row*step;
   const light=astral?29+r()*16:12+r()*11;
   g.fillStyle=`hsl(${astral?258:18},${astral?12:19}%,${light}%)`;
   g.beginPath();g.moveTo(x+5+r()*9,y+6);g.lineTo(x+step-12,y+3+r()*10);g.lineTo(x+step-3,y+step-17);g.lineTo(x+step-22,y+step-5);g.lineTo(x+7,y+step-8);g.closePath();g.fill();
   if(sourceImage){g.save();g.clip();g.globalAlpha=.38;g.drawImage(sourceImage,0,0,sourceImage.width,sourceImage.height,x,y,step,step);g.restore();}
   stroke([[x+9,y+step-12],[x+7,y+10],[x+step-17,y+7]],astral?'#b3a2bf42':'#9d73503b',2);
   if(r()<.24){const k=x+step*(.2+r()*.5);stroke([[k,y+5],[k-12,y+step*.34],[k+9,y+step*.61],[k-2,y+step-5]],'#100d18b0',3);}
  }
  // Branching damage has broad silhouette and hairline secondary fractures.
  for(let i=0;i<(astral?20:32)+group*8;i++){
   let x=r()*N,y=r()*N;const points=[[x,y]];
   for(let j=0;j<7;j++){x+=(r()-.47)*130;y+=25+r()*60;points.push([x,y]);}
   stroke(points,astral?'#b1a0b235':'#b96a3330',11);stroke(points,'#100c13d0',5);
   const q=points[3];stroke([q,[q[0]+80,q[1]+10],[q[0]+120,q[1]-50]],'#100c1390',3);
  }
  // Loose chips and pitted stone; kept flat so they cannot trap automatic movement.
  for(let i=0;i<950;i++){
   const x=r()*N,y=r()*N,w=3+r()*12;
   g.fillStyle=astral?['#776b82','#242032','#a093a2'][i%3]:['#49332b','#110d10','#72513d'][i%3];
   g.beginPath();g.moveTo(x,y);g.lineTo(x+w,y-2);g.lineTo(x+w*.7,y+w*.6);g.closePath();g.fill();
  }
  if(!astral){
   // Cooled lava tongues intrude visually onto the floor; no damaging lava across the lane.
   for(let side=0;side<2;side++)for(let i=0;i<3+group;i++){
    const x=side?N:0,y=r()*N,len=80+r()*210;
    const points=[[x,y],[x+(side?-1:1)*len*.5,y+20],[x+(side?-1:1)*len,y+70],[x+(side?-1:1)*len*.65,y+100],[x,y+190]];
    g.fillStyle='#100f14d9';g.beginPath();points.forEach(([a,b],j)=>j?g.lineTo(a,b):g.moveTo(a,b));g.closePath();g.fill();
    stroke(points.slice(0,4),'#80412d80',5);
   }
  }
  if((astral&&group>=2)||group===3){
   // Flat ceremonial/volcanic markings distinguish the observatory and boss floors.
   const cx=N/2,cy=N/2;
   for(const rad of (group===3?[.24,.3,.38,.44]:[.21,.24,.38])){
    g.strokeStyle=astral?'#c7a7b785':'#bd613e70';g.lineWidth=group===3?6:4;g.beginPath();g.arc(cx,cy,N*rad,0,Math.PI*2);g.stroke();
   }
   for(let i=0;i<24;i++){
    const a=i/24*Math.PI*2,rr=N*(group===3?.35:.3),sz=8+(i%3)*6;
    stroke([[cx+Math.cos(a)*(rr-sz),cy+Math.sin(a)*(rr-sz)],[cx+Math.cos(a)*(rr+sz),cy+Math.sin(a)*(rr+sz)]],astral?'#d0bdc9a0':'#d5764380',4);
   }
   if(astral){
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2,b=a+Math.PI*.75,rr=N*.2;stroke([[cx+Math.cos(a)*rr,cy+Math.sin(a)*rr],[cx+Math.cos(b)*rr,cy+Math.sin(b)*rr]],'#baa4c074',4);}
   }
  }
  if(astral&&group===1){
   for(const x of [N*.12,N*.88])for(let y=30;y<N;y+=84){g.fillStyle=y%168?'#a79b9950':'#9b7f9650';g.fillRect(x,y,32,50);}
  }
  for(let i=0;i<45000;i++){g.fillStyle=r()>.5?'#ffffff0a':'#00000012';g.fillRect(r()*N,r()*N,1+r()*3,1+r()*2);}
 }
 const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=4;
 if(type==='lava'){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1.4,1.8);}
 return t;
}
function build(kind,stage,options={}){
 if(!TITLES[kind])throw new RangeError('Unknown destination');
 const group=groupFor(stage),astral=kind==='astral',boss=group===3,rng=random(5171+(astral?0:group*1777+4109));
 const scene=new THREE.Scene(),scenery=new THREE.Group();scene.add(scenery);
 scene.background=new THREE.Color(astral?0x171329:0x240d08);
 scene.fog=new THREE.FogExp2(astral?0x252039:0x31150c,astral?.0009:.0055);
 const geometries=new Map(),materials=new Map(),textures=new Set(),batches=new Map(),animated=[];
 let stoneSurface=null;
 if(options.surfaces&&options.surfaces.stone){stoneSurface=new THREE.Texture(options.surfaces.stone);stoneSurface.needsUpdate=true;stoneSurface.encoding=THREE.sRGBEncoding;stoneSurface.wrapS=stoneSurface.wrapT=THREE.RepeatWrapping;stoneSurface.repeat.set(1,2);textures.add(stoneSurface);}
 if(astral&&options.surfaces&&options.surfaces.space){const sky=new THREE.Texture(options.surfaces.space);sky.needsUpdate=true;sky.encoding=THREE.sRGBEncoding;textures.add(sky);scene.background=sky;}
 const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),quat=new THREE.Quaternion(),scaling=new THREE.Vector3(),euler=new THREE.Euler();
 function geo(shape){
  if(!geometries.has(shape))geometries.set(shape,
   shape==='column'?new THREE.CylinderGeometry(.48,.54,1,12):shape==='basalt'?new THREE.CylinderGeometry(.48,.58,1,6):
   shape==='shard'?new THREE.IcosahedronGeometry(.6,0):shape==='cone'?new THREE.ConeGeometry(.5,1,8):
   shape==='crystal'?new THREE.OctahedronGeometry(.5):new THREE.BoxGeometry(1,1,1));
  return geometries.get(shape);
 }
 function mat(color,glow=0){
  const key=color+':'+glow;
  if(!materials.has(key))materials.set(key,glow?new THREE.MeshBasicMaterial({color,toneMapped:false}):new THREE.MeshStandardMaterial({color,map:stoneSurface,bumpMap:stoneSurface,bumpScale:.1,roughness:.94,metalness:.04}));
  return materials.get(key);
 }
 function add(shape,color,x,y,z,w,h,d,rotation=0,glow=0,category='scenery'){
  const key=shape+':'+color+':'+glow+':'+category;
  if(!batches.has(key))batches.set(key,{shape,material:mat(color,glow),category,transforms:[]});
  position.set(x,y,z);euler.set(0,Array.isArray(rotation)?rotation[1]:0,Array.isArray(rotation)?rotation[2]:rotation);if(Array.isArray(rotation))euler.x=rotation[0];
  quat.setFromEuler(euler);scaling.set(w,h,d);matrix.compose(position,quat,scaling);batches.get(key).transforms.push(matrix.clone());
 }
 function mesh(geometry,material,x=0,y=0,z=0,category='scenery'){
  const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.userData.category=category;m.receiveShadow=true;scenery.add(m);
  geometries.set('unique'+geometries.size,geometry);return m;
 }
 const stone=0x6d647e,trim=0xa08d9e,dark=astral?0x3c354c:0x2b2323,gold=astral?0xb29a91:0x7c4931;
 const floorTex=texture('floor',kind,astral?0:group,options.createCanvas,options.surfaces&&options.surfaces.stone);if(floorTex)textures.add(floorTex);
 const floorMat=new THREE.MeshStandardMaterial({color:floorTex?(astral?0xffffff:0x8e8c9c):(astral?0x62546c:0x33231f),map:floorTex,roughness:.98});materials.set('floor',floorMat);
 function shapeFrom(points){const shape=new THREE.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();return shape;}
 function surface(shape,material,y=.015){const g=new THREE.ShapeGeometry(shape);const uv=g.attributes.uv,pos=g.attributes.position;
  for(let i=0;i<uv.count;i++)uv.setXY(i,(pos.getX(i)+40)/80,(pos.getY(i)+60)/120);
  const m=mesh(g,material,0,y,0,'floor');m.rotation.x=-Math.PI/2;return m;
 }
 let floor;
 if(astral){
  const shape=shapeFrom(bridgeOutline);floor=surface(shape,floorMat);
  if(floorTex){floorTex.wrapS=floorTex.wrapT=THREE.RepeatWrapping;floorTex.repeat.set(80/30,120/44);}
  const support=mesh(new THREE.ExtrudeGeometry(shape,{depth:1.1,bevelEnabled:true,bevelThickness:.1,bevelSize:.2,bevelSegments:1,steps:1}),mat(dark),0,-1.22,0,'floor');support.rotation.x=-Math.PI/2;
 }else if(boss){
  floor=mesh(new THREE.CircleGeometry(27,96),floorMat,0,.015,-8,'floor');floor.rotation.x=-Math.PI/2;
  mesh(new THREE.CylinderGeometry(27,25.8,2.4,96),mat(dark),0,-1.24,-8,'floor');
 }else{
  const outline=[];const edge=random(9031+group*877);
  for(let i=0;i<48;i++){const a=i/48*Math.PI*2,k=.88+edge()*.12;outline.push([Math.cos(a)*38*k,-8+Math.sin(a)*48*k]);}
  floor=surface(shapeFrom(outline),floorMat,.012);floor.userData.outline=outline;
 }
 if(!astral){
  const bed=mesh(new THREE.PlaneGeometry(116,130),mat(0x24191a),0,-.6,-12,'underfloor');bed.rotation.x=-Math.PI/2;
  add('box',0x302322,0,8,-66,115,18,7);
  for(const side of [-1,1])add('box',0x302322,side*58,8,-12,7,18,120);
 }
 // Model real rubble, not just flat painted dots; all solid debris stays outside combat.
 function rubble(cx,cz,count=30,spread=4){
  for(let i=0;i<count;i++){
   const x=cx+(rng()-.5)*spread,z=cz+(rng()-.5)*spread;
   const w=.25+rng()*.8,h=.15+rng()*.48,d=.25+rng()*.7;
   add(i%4?'box':'shard',astral?(i%3?stone:trim):(i%3?0x49332b:0x6b4b3a),x,h/2+.06,z,w,h,d,[rng()*.35,rng()*Math.PI,rng()*.3]);
  }
 }
 function pillar(x,z,h,broken=false){
  add('box',trim,x,.2,z,2.2,.4,2.2);
  add('column',stone,x,h/2+.4,z,1.2,h,1.2);
  for(let y=1;y<h;y+=2.2)add('column',trim,x,y,z,1.35,.17,1.35);
  if(!broken){add('box',trim,x,h+.5,z,1.8,.45,1.8);add('cone',stone,x,h+1.4,z,1.6,1.6,1.6);}
  else{add('shard',dark,x,h+.3,z,1.2,.7,1.1);rubble(x+2,z+1,12,2);}
 }
 function arch(x,z,h,width,broken=false){
  pillar(x-width/2,z,h*.6,broken);pillar(x+width/2,z,h*.6,false);
  for(const side of [-1,1])for(let i=0;i<11;i++){
   if(broken&&side===1&&i>5)continue;
   const u=i/10;add('box',i%3?stone:trim,x+side*width/2*(1-u),h*.6+Math.sin(u*Math.PI/2)*h*.4,z,.72,.72,1.05,side*(.25+u*.65));
  }
 }
 function torus(x,y,z,r,t,color,rx=0,ry=0){
  const m=mesh(new THREE.TorusGeometry(r,t,6,64),mat(color),x,y,z);m.rotation.set(rx,ry,0);return m;
 }
 function lowWall(x,z,length,broken=false){
  for(let i=0;i<Math.floor(length/1.5);i++)for(let row=0;row<(broken?2+(i%3):4);row++){
   if(broken&&rng()<.25)continue;
   add('box',row%3?stone:trim,x+(i-Math.floor(length/1.5)/2)*1.5+(row%2)*.35,.35+row*.65,z,1.42,.58,1.1);
  }
 }
 function roseWindow(x,z){
  torus(x,9,z,3.4,.18,trim);torus(x,9,z,1.2,.14,gold);
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;add('box',trim,x+Math.cos(a)*2.25,9+Math.sin(a)*2.25,z,.11,2.1,.2,a-Math.PI/2);}
 }
 function sidePlatform(x,z,w=10,d=14){add('box',dark,x,-1,z,w,1.8,d);add('box',stone,x,-.02,z,w,.12,d);}
 function ringSegments(radius,y,z,color,count=48,category='scenery'){
  for(let i=0;i<count;i++){
   const a=i/count*Math.PI*2;
   add('box',color,Math.cos(a)*radius,y,z+Math.sin(a)*radius,1.65,.32,.85,[0,-a+Math.PI/2,0],0,category);
  }
 }
 // Hand-shaped pools, not paired straight orange rectangles.
 const lavaTex=!astral?texture('lava',kind,group,options.createCanvas,options.surfaces&&options.surfaces.lava):null;if(lavaTex)textures.add(lavaTex);
 function pool(x,z,rx,rz,seed=1,y=-.25,category='scenery'){
  const rr=random(701+seed),shape=new THREE.Shape();
  for(let i=0;i<=48;i++){
   const a=(i%48)/48*Math.PI*2,k=.86+rr()*.14,px=Math.cos(a)*rx*k,py=Math.sin(a)*rz*k;
   if(i===0)shape.moveTo(px,py);else shape.lineTo(px,py);
  }
  const m=new THREE.MeshBasicMaterial({color:0xffffff,map:lavaTex,side:THREE.DoubleSide,toneMapped:false});materials.set('pool'+materials.size,m);
  const g=new THREE.ShapeGeometry(shape);const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(g.attributes.position.getX(i)/rx+1)/2,(g.attributes.position.getY(i)/rz+1)/2);
  if(!boss&&!astral&&y===-.25)y=.035;
  const p=mesh(g,m,x,y,z,category);p.rotation.x=-Math.PI/2;return p;
 }
 function basalt(x,z,h,w=3){
  add('basalt',0x372c29,x,h/2-.2,z,w,h,w);add('basalt',0x5c4232,x,h-.15,z,w*.98,.15,w*.98);
  for(let j=0;j<Math.floor(h/2);j++)add('basalt',0x241f20,x,1+j*2,z,w*1.01,.055,w*1.01);
 }
 function volcano(x,z,r=6,h=7){
  mesh(new THREE.CylinderGeometry(r*.48,r,h,14,1,true),mat(0x342529),x,h/2-.1,z);
  const lip=torus(x,h-.1,z,r*.48,.45,0x5b3d32,-Math.PI/2);lip.userData.landmark='caldera-rim';
  pool(x,z,r*.44,r*.44,23,h-.3);
  for(let i=0;i<6;i++){const a=i/6*Math.PI*2;add('shard',0x6b4432,x+Math.cos(a)*r*.5,h-.05,z+Math.sin(a)*r*.5,1.4,1.1,1.2);}
 }
 function spill(x,z,w=3,length=8){
  add('basalt',0x3b2925,x,length/2-.2,z-(w+2)/2-.35,w+2,length,w+2);
  // Vertical cascade with independently drawn surface. Outside the arena only.
  const m=new THREE.MeshBasicMaterial({map:lavaTex,color:0xffb068,side:THREE.DoubleSide,toneMapped:false});materials.set('fall'+materials.size,m);
  const waterfall=mesh(new THREE.PlaneGeometry(w,length,1,1),m,x,length/2,z);animated.push(waterfall);
  pool(x,z,w*1.2,3.5,91,.02);
 }
 if(astral){
  // A single shared route is built for every selection. Stage buttons move the camera,
  // never replace the bridge with a disconnected room.
  function bridgeWidth(z){for(let i=0;i<bridgeRight.length-1;i++){const a=bridgeRight[i],b=bridgeRight[i+1];if(z<=a[1]&&z>=b[1]){const t=(z-a[1])/(b[1]-a[1]);return a[0]+(b[0]-a[0])*t;}}return 15;}
  for(const side of [-1,1])for(let z=22;z>-177;z-=4){
   const x=side*(bridgeWidth(z)+.08);
   if(((Math.round(z)%20)+20)%20!==2)add('box',trim,x,.67,z,.17,.17,3.8);
   if(((Math.round(z)%12)+12)%12===10){add('column',stone,x,.65,z,.38,1.3,.38);add('crystal',0xb9a4dc,x,1.45,z,.24,.38,.24,0,.2);}
   if(((Math.round(z)%16)+16)%16===6)add('cone',dark,x,-2,z,2.4,3,3,Math.PI,0,'underfloor');
   if(z<-105)add('box',0xa49bd7,side*(bridgeWidth(z)-.6),.025,z,.06,.025,3.8,0,.2,'floor');
  }
  // Arrival arch ruins and later gate pylons belong to the bridge edges, not islands.
  for(const z of [8,-26,-65,-96])for(const side of [-1,1]){
   add('box',dark,side*17,-.45,z,5,.8,5);
   pillar(side*17,z,z<-40?8:4,z>-40);
   rubble(side*17,z+1,10,2);
  }
  for(const z of [-65,-96])for(const side of [-1,1]){
   for(let i=0;i<6;i++)add('box',stone,side*(18+i*.52),7+i*.45,z,.65,.7,.85,side*.5);
  }
  for(const side of [-1,1])for(const z of [-16,-82,-144]){
   // Distant fragments support the space-like setting without becoming square side rooms.
   add('shard',dark,side*38,-8,z,5,7,8,[.2,.3,.4]);
   add('shard',stone,side*45,-12,z-9,3,5,4,[.4,.8,.2]);
  }
  torus(-34,8,-141,8,.24,trim,0,.4);torus(-34,8,-141,5.6,.15,gold,.7,0);
  const star=texture('floor','astral',3,options.createCanvas,options.surfaces&&options.surfaces.stone);if(star)textures.add(star);
  const endMat=new THREE.MeshStandardMaterial({color:0xcebedb,map:star,roughness:.95});materials.set('terminus',endMat);
  const seal=mesh(new THREE.CircleGeometry(18,64),endMat,0,.024,-208,'floor');seal.rotation.x=-Math.PI/2;
  arch(0,-243,12,17,true);torus(0,10,-247,8,.3,gold);
  for(const side of [-1,1]){pillar(side*24,-207,5,true);add('box',dark,side*25,-.4,-207,4,.7,5);rubble(side*24,-206,12,2);}
 }else{
  if(group===0){
   pool(-25,-10,11,26,11);pool(24,-27,10,10,12);
   for(let i=0;i<25;i++){const side=i%3?1:-1;basalt(side*(18+rng()*14),-30+rng()*44,1+rng()*5,2+rng()*2);}
   for(const z of [-23,-4,9]){rubble(16.7,z,24,2);rubble(-17,z+1,20,2);}
  }else if(group===1){
   pool(-29,-9,15,28,32);spill(-23,-22,4,13);spill(-32,-13,3,18);
   for(let i=0;i<26;i++)basalt(20+rng()*13,-32+rng()*48,4+rng()*10,2+rng()*2);
   for(let i=0;i<9;i++){const x=-22-rng()*12,z=-28+rng()*35;add('shard',0x231e20,x,.05,z,2.5+rng()*3,.7,2+rng()*2);}
   rubble(-17,-14,40,3);rubble(17,6,35,3);
  }else if(group===2){
   pool(-27,-10,13,27,56);pool(27,-10,13,27,57);
   volcano(-25,-19,7,8);volcano(25,1,7,6);
   spill(-19,-19,2.1,6);spill(19,1,2.1,4);
   for(const side of [-1,1])for(let i=0;i<7;i++)basalt(side*(20+rng()*9),-32+i*7,2+rng()*5,2.5);
   for(let i=0;i<12;i++){const a=i/11*Math.PI;add('basalt',0x38282b,Math.cos(a)*18,Math.sin(a)*9+2,-36,3,4,3,a-Math.PI/2);}
   for(const side of [-1,1])for(const z of [-25,-6,10])rubble(side*17,z,22,2.5);
  }else{
   // Giant circular obsidian dais in a lake, not the same rectangular walkway.
   pool(0,-8,53,47,73,-.45,'underfloor');
   ringSegments(26.5,.17,-8,0x754332,80);
   for(let i=0;i<12;i++){
    const a=i/12*Math.PI*2,x=Math.cos(a)*31,z=-8+Math.sin(a)*31;
    basalt(x,z,4+(i%4)*1.6,3.4);rubble(x,z,12,2.7);
   }
   volcano(0,-47,12,10);spill(-7,-39,3,8);spill(8,-40,3,7);
   for(let i=0;i<8;i++){const a=i/7*Math.PI;add('basalt',0x38282b,Math.cos(a)*19,Math.sin(a)*12+1,-41,3,5,3,a-Math.PI/2);}
  }
 }
 for(const b of batches.values()){
  const m=new THREE.InstancedMesh(geo(b.shape),b.material,b.transforms.length);b.transforms.forEach((t,i)=>m.setMatrixAt(i,t));
  m.userData.category=b.category;m.castShadow=b.category!=='floor';m.receiveShadow=true;scenery.add(m);
 }
 const hemisphere=new THREE.HemisphereLight(astral?0xe2d8fc:0xffc59c,astral?0x383042:0x28141a,astral?.7:.55);scene.add(hemisphere);
 const sun=new THREE.DirectionalLight(astral?0xe6d7ff:0xffbc8f,astral?1.15:1);sun.position.set(-14,30,14);sun.castShadow=true;
 sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-48,right:48,top:55,bottom:-55,far:100});sun.shadow.bias=-.001;
 sun.target.position.set(0,0,-8);if(astral){sun.shadow.normalBias=.18;sun.shadow.bias=-.0015;sun.position.set(-36,100,30);sun.target.position.z=-110;Object.assign(sun.shadow.camera,{left:-80,right:80,top:290,bottom:-80,far:450});}scene.add(sun,sun.target);
 const accent=new THREE.PointLight(astral?0xc39ff5:0xff631e,astral?1:2.5,75,2);accent.position.set(0,9,-32);scene.add(accent);
 const base=new Float32Array(96*3),positions=new Float32Array(96*3),pointGeo=new THREE.BufferGeometry();
 for(let i=0;i<96;i++){base[i*3]=(i%2?1:-1)*(17+rng()*(astral?70:24));base[i*3+1]=1+rng()*14;base[i*3+2]=astral?-260+rng()*300:-45+rng()*62;}
 positions.set(base);pointGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));geometries.set('points',pointGeo);
 const pointMat=new THREE.PointsMaterial({color:astral?0xd5b8ff:0xffab52,size:astral?.1:.15,transparent:true,opacity:.7,depthWrite:false});materials.set('points',pointMat);
 scene.add(new THREE.Points(pointGeo,pointMat));scene.updateMatrixWorld(true);
 let disposed=false;
 return{scene,scenery,kind,group,title:TITLES[kind][group],features:FEATURES[kind][group].slice(),footprint:astral?(boss?'bridge-terminus':'bridge'):(boss?'circle':'natural-field'),arena:astral?{halfWidth:13,z0:BRIDGE.focus[group]-20,z1:BRIDGE.focus[group]+20}:ARENA,view:{focus:astral?BRIDGE.focus[group]:-8,far:astral?800:200},route:astral?{start:BRIDGE.start,end:BRIDGE.end,focus:BRIDGE.focus.slice(),outline:bridgeOutline.map(p=>p.slice())}:null,
  update(seconds,motion=true){
   if(disposed)return;
   for(let i=0;i<96;i++)positions[i*3+1]=base[i*3+1]+(motion?Math.sin(seconds*.35+i)*.65:0);pointGeo.attributes.position.needsUpdate=true;
   if(lavaTex)lavaTex.offset.y=motion?(seconds*.012)%1:0;
   animated.forEach((m,i)=>{if(m.geometry.type==='TorusGeometry')m.rotation.z=motion?seconds*.025:0;});
  },
  dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());scene.clear();},
  stats(){let instances=0,triangles=0;scenery.traverse(o=>{if(o.isInstancedMesh)instances+=o.count;if(o.geometry)triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});return{instances,batches:batches.size,geometries:geometries.size,materials:materials.size,triangles:Math.round(triangles)};}
 };
}
return Object.freeze({ARENA,GROUPS,TITLES,FEATURES,BRIDGE,groupFor,cameraPose,build});
});
