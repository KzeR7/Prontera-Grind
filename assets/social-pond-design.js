/* Sakura Reach — authored lakeside art, built against PGSocialRules.
 * No fishing/seat/navigation state is owned here. Three.js r128, no new binaries.
 * Static triangle batches preserve indices; only water/foam uniforms animate.
 */
window.PGSocialPondDesign={build({T,R,scene,view,legacy,textures={}}){
 const p=view.p,b=view.props.bridge,fall=view.props.falls;
 const root=new T.Group();root.name='Sakura Reach';root.userData.pondDesign=true;scene.add(root);
 // Retain the supplied sakura pixels and their world anchors. Replace pond architecture.
 for(const o of legacy)if(o!==view.water&&o!==view.coping&&!o.userData.sakura&&!o.userData.bridgePath&&!o.userData.bridgePathCap)o.visible=false;
 const batches=new Map(),meshes=[],support=[],waterLevel=.016;
 const key=new T.Vector3(-.38,.86,.34).normalize();let seed=17643;
 const rand=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
 function texture(kind){
  const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');
  if(!g||typeof g.fillRect!=='function')return null;
  g.fillStyle=kind==='wood'?'#c3a47b':'#c3c6b5';g.fillRect(0,0,512,512);
  if(typeof g.beginPath==='function')for(let i=0;i<190;i++){
   const y=rand()*512;g.strokeStyle=i%3?'rgba(66,49,32,.11)':'rgba(255,249,218,.20)';g.lineWidth=.4+rand()*1.6;
   g.beginPath();g.moveTo(0,y);
   if(kind==='wood')g.bezierCurveTo(150,y-12+rand()*24,350,y-8+rand()*16,512,y+rand()*8);
   else g.lineTo(512,y+rand()*55);
   g.stroke();
  }
  const tx=new T.CanvasTexture(c);tx.wrapS=tx.wrapT=T.RepeatWrapping;tx.anisotropy=4;return tx;
 }
 const woodTex=texture('wood'),stoneTex=texture('stone');
 if(stoneTex){stoneTex.wrapS=stoneTex.wrapT=T.RepeatWrapping;stoneTex.needsUpdate=true;stoneTex.anisotropy=4}
 const mats={wood:new T.MeshBasicMaterial({map:woodTex,vertexColors:true}),stone:new T.MeshBasicMaterial({map:stoneTex,vertexColors:true}),flat:new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide})};
 function add(geo,mat,color,x=0,y=0,z=0,rotation=[0,0,0],scale=[1,1,1]){
  let g=geo.index?geo.toNonIndexed():geo;
  const matrix=new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(...scale));g.applyMatrix4(matrix);
  const pos=g.attributes.position,n=g.attributes.normal,c=new T.Color(color),colors=[];
  if(mat==='stone'){
   const uv=[];for(let i=0;i<pos.count;i++){
    const top=Math.abs(n.getY(i))>.5;
    uv.push((Math.abs(n.getX(i))>.7?pos.getZ(i):pos.getX(i))/2.4,(top?pos.getZ(i):pos.getY(i))/2.4);
   }g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  }
  for(let i=0;i<pos.count;i++){const light=.72+.28*Math.max(0,n.getX(i)*key.x+n.getY(i)*key.y+n.getZ(i)*key.z),ao=.91+.09*Math.min(1,Math.max(0,pos.getY(i))/2);colors.push(c.r*light*ao,c.g*light*ao,c.b*light*ao)}
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(g);return g;
 }
 const box=(x,y,z,w,h,d,color,mat='wood',ry=0)=>add(new T.BoxGeometry(w,h,d),mat,color,x,y,z,[0,ry,0]);
 function beam(a,b,r,color,mat='wood'){
  const va=new T.Vector3(...a),vb=new T.Vector3(...b),delta=vb.clone().sub(va);
  const g=new T.CylinderGeometry(r,r,delta.length(),6);
  g.applyMatrix4(new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize())));
  const mid=va.add(vb).multiplyScalar(.5);return add(g,mat,color,...mid.toArray());
 }
 function stone(x,y,z,w,h,d,tone=0x9ea59b,turn=0){
  // Fractured sedimentary slabs: broad beds, chipped corners and beveled edges.
  const outline=[[-.77,-.65],[.5,-.72],[.91,-.32],[.84,.46],[.4,.73],[-.65,.65],[-.94,.26],[-.91,-.37]];
  const rings=[[-.5,.84],[-.33,1],[.27,.96],[.42,.80]],pos=[];
  const point=(ring,i)=>{const q=outline[i%8],r=rings[ring];return [q[0]*r[1],r[0]+.04*Math.sin(i*2.7),q[1]*r[1]]};
  for(let k=0;k<3;k++)for(let i=0;i<8;i++)for(const [r,j] of [[k,i],[k,i+1],[k+1,i+1],[k,i],[k+1,i+1],[k+1,i]])pos.push(...point(r,j));
  for(let i=1;i<7;i++)pos.push(...point(3,0),...point(3,i+1),...point(3,i));
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.computeVertexNormals();
  add(g,'stone',tone,x,y,z,[.025,turn,.025],[w,h,d]);
 }
 function strip(inner,outer,y,color,mat='stone',steps=192){
  const positions=[],uv=[];
  for(let i=0;i<steps;i++){
   const a=i/steps*Math.PI*2,c=(i+1)/steps*Math.PI*2;
   const pts=[R.pondBoundary(p,a,inner),R.pondBoundary(p,a,outer),R.pondBoundary(p,c,outer),R.pondBoundary(p,c,inner)];
   for(const j of [0,2,1,0,3,2]){const pt=pts[j];positions.push(pt.x,y,pt.z);uv.push(pt.x/3,pt.z/3)}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();add(g,mat,color);
 }
 const timber=0x8f6544,dark=0x594432,brass=0xb8a368,cream=0xd7d5bf;
 // A narrow worn promenade gives the fishing chairs an intentional setting.
 strip(.6,2.7,.03,0xd9d5bd);strip(2.7,2.9,.032,0x9aa47c);
 // Keep the game's original textured limestone coping. Stone accents belong
 // only to planted coves, rather than a necklace of repeated polygon rocks.
 // Arc-profile bridge: planks follow the exact shared walking height.
 const deckY=x=>4*b.arch*((x-b.x+b.span/2)/b.span)*(1-(x-b.x+b.span/2)/b.span);
 const segments=88;
 for(let i=0;i<segments;i++){
  const x=b.x-b.span/2+(i+.5)*b.span/segments,y=deckY(x),slope=4*b.arch/b.span*(1-2*(i+.5)/segments);
  const g=new T.BoxGeometry(b.span/segments-.025,.20,b.width);
  add(g,'wood',i%7===0?0xc6a779:0xb99a6a,x,y-.10,b.z,[0,0,Math.atan(slope)]);
  for(const side of [-1,1])box(x,y+.005,b.z+side*(b.width/2-.32),.055,.015,.055,0x524d40,'flat');
 }
 for(const side of [-1,1]){
  const z=b.z+side*(b.width/2-.13);
  for(let i=0;i<=16;i++){
   const x=b.x-b.span/2+i*b.span/16,y=deckY(x),end=i===0||i===16;
   box(x,y+.60,z,end?.32:.19,1.2,end?.32:.19,dark);
   box(x,y+1.23,z,.32,.13,.32,brass,'flat');
   if(i<16){const nx=x+b.span/16,ny=deckY(nx);
    beam([x,y+1.1,z],[nx,ny+1.1,z],.085,timber);
    beam([x,y+.33,z],[nx,ny+.33,z],.048,timber);
    beam([x+.12,y+.36,z],[nx-.12,ny+1.02,z],.035,0x9d8056);
   }
  }
  for(let i=0;i<44;i++){const x=b.x-b.span/2+i,xx=x+1;beam([x,deckY(x)-.28,z],[xx,deckY(xx)-.28,z],.15,dark)}
  for(const t of [.14,.32,.5,.68,.86]){
   const x=b.x-b.span/2+t*b.span,y=deckY(x);
   beam([x,-.35,z],[x,y-.18,z],.21,dark);
   for(const dx of [-1.2,1.2])beam([x,Math.max(.2,y-1.3),z],[x+dx,deckY(x+dx)-.22,z],.10,timber);
   add(new T.TorusGeometry(.22,.04,4,10),'flat',brass,x,Math.max(.15,y*.35),z,[Math.PI/2,0,0]);
   support.push({x,z,top:y});
  }
 }
 function lantern(x,z,height=2.5){
  box(x,.16,z,.8,.32,.8,0x949c90,'stone');box(x,.36,z,.56,.14,.56,cream,'stone');
  box(x,height/2,z,.19,height-.4,.19,dark);
  box(x,height-.34,z,.62,.12,.62,timber);
  box(x,height+.03,z,.43,.62,.43,0xf2d397,'flat');
  for(const dx of [-.26,.26])for(const dz of [-.26,.26])box(x+dx,height+.02,z+dz,.055,.72,.055,dark);
  const roof=new T.ConeGeometry(.56,.35,4);add(roof,'flat',0x48636a,x,height+.55,z,[0,Math.PI/4,0],[1,.8,1]);
  add(new T.SphereGeometry(.085,8,5),'flat',brass,x,height+.74,z);
 }
 for(const l of view.props.lanterns)lantern(l.x,l.z,2.45);
 // End anchors and inset paving at the two landings; no added obstruction in the bridge lane.
 for(const side of [-1,1]){
  const x=b.x+side*(b.span/2+.42);
  for(const dz of [-2.45,2.45]){
   box(x,.23,b.z+dz,1.0,.46,.78,cream,'stone');box(x,.48,b.z+dz,1.15,.13,.9,0xa4ae9c,'stone');
  }
  for(let i=0;i<6;i++)box(x+side*(.1+i*.55),.025,b.z,.52,.05,b.width+.3,i%2?0xb7b9a3:0xcaccb6,'stone');
 }
 // Seat ID positions are authoritative: low paved pads and tackle, never a false new seat.
 for(const chair of R.CHAIRS){
  box(chair.x,.045,chair.z,2.25,.024,2.1,0xc6c7af,'stone',chair.rotation);
  const dx=Math.cos(chair.rotation)*.85,dz=-Math.sin(chair.rotation)*.85;
  const x=chair.x+dx,z=chair.z+dz;
  add(new T.CylinderGeometry(.22,.19,.4,10),'flat',0x687d78,x,.21,z);
  add(new T.TorusGeometry(.23,.025,5,12),'flat',brass,x,.42,z,[Math.PI/2,0,0]);
  add(new T.TorusGeometry(.20,.02,4,12,Math.PI),'flat',0x4d5d58,x,.58,z);
 }
 // Planted inlets stay inside the unwalkable wet edge and outside bridge/cascade mouths.
 for(let i=0;i<38;i++){
  const a=i/38*Math.PI*2,pt=R.pondBoundary(p,a,-.6);
  if(Math.abs(pt.z-b.z)<4||Math.abs(pt.x-fall.x)<5&&pt.z>fall.z-5)continue;
  if(i%9===0)stone(pt.x,.12,pt.z,.78,.36,.52,0xb8bda5,a);
  for(let j=0;j<7;j++){
   const x=pt.x+(rand()-.5)*1.2,z=pt.z+(rand()-.5)*1.2,h=.5+rand()*.9;
   beam([x,.03,z],[x+.16,h,z-.12],.018,j%2?0x718358:0x9ba56d,'flat');
   if(j%3===0)add(new T.CylinderGeometry(.055,.06,.26,6),'flat',0x8c7751,x+.16,h+.08,z-.12);
   const leaf=new T.Shape();leaf.moveTo(0,0);leaf.quadraticCurveTo(.32,h*.65,.21,h*.95);leaf.quadraticCurveTo(.06,h*.5,0,0);
   add(new T.ShapeGeometry(leaf),'flat',j%2?0x637c56:0x8f9c68,x,.035,z,[0,rand()*6.28,0]);
  }
 }
 // Broad lotus leaves sit on the water; small veins follow the leaf, not a scene-wide overlay.
 for(const [a,n] of [[-.9,6],[-2.35,7],[.65,5],[2.6,6]]){
  const center=R.pondBoundary(p,a,-3.1);
  for(let i=0;i<n;i++){
   const x=center.x+(rand()-.5)*3.1,z=center.z+(rand()-.5)*3.1,r=.28+rand()*.38;
   if(!R.pondContains(p,x,z,-.8))continue;
   add(new T.CircleGeometry(r,18,.15,5.95),'flat',i%2?0x5f8b67:0x86a47b,x,.038+i*.0003,z,[-Math.PI/2,0,rand()*6.28]);
   if(i===0){for(let j=0;j<7;j++){
    const a=j/7*Math.PI*2;add(new T.SphereGeometry(1,8,5),'flat',0xe9c7c3,x+Math.cos(a)*.12,.12,z+Math.sin(a)*.12,[0,a,.5],[.11,.16,.06]);
   }add(new T.SphereGeometry(.075,8,5),'flat',0xe2bb70,x,.17,z)}
  }
 }
 // The cascade is built from a connected slate buttress, a source basin and a submerged toe.
 const fx=fall.x,fz=fall.z,H=fall.h;
 for(let tier=0;tier<6;tier++){
  const y=.28+tier*.54,z=fz+.65+(tier%2)*.08;
  stone(fx-.13+Math.sin(tier*4)*.15,y,z,3.3-tier*.09,.68,.83,tier%2?0xa7aea0:0xb9bcaa,.02*Math.sin(tier));
 }
 for(const side of [-1,1]){
  for(let tier=0;tier<4;tier++)stone(fx+side*(2.5-tier*.10),.38+tier*.8,fz+.3,1.0,.95,.93,0xa4ad9b,side*.09);
  stone(fx+side*2.3,.26,fz-.8,1.3,.7,1.2,0x9aa993,side*.16);
 }
 stone(fx,H-.24,fz+.55,2.8,.48,.9,0xc4c5ae,.02);
 stone(fx,1.5,fz-.35,2.1,.46,.80,0xa1b19e,-.04);
 box(fx,H-.045,fz+.50,3.65,.03,.75,0x6ba5a0,'flat');
 const falling=[];
 for(let i=0;i<2;i++){
  const x=fx+(i===0?-.13:.16),width=i===0?3.35:3.6,positions=[],uv=[];
  for(let k=0;k<18;k++){
   const t=k/18,t1=(k+1)/18;
   const pt=t=>i===0?[H-.08-t*(H-1.65),fz-.05-t*t*.65]:[1.7-t*1.64,fz-.72-t*t*.95];
   const a=pt(t),b=pt(t1);
   for(const [xx,yy,zz,u,v] of [[x-width/2,a[0],a[1],0,t],[x+width/2,b[0],b[1],1,t1],[x+width/2,a[0],a[1],1,t],[x-width/2,a[0],a[1],0,t],[x-width/2,b[0],b[1],0,t1],[x+width/2,b[0],b[1],1,t1]]){positions.push(xx,yy,zz);uv.push(u,v)}
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  const mat=new T.ShaderMaterial({side:T.DoubleSide,transparent:true,depthWrite:false,uniforms:{time:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`
   varying vec2 vUv;uniform float time;
   float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
   void main(){
    float flow=n(vec2(vUv.x*29.,vUv.y*3.-time*2.8));
    float threads=n(vec2(vUv.x*73.,vUv.y*8.-time*4.));
    float froth=smoothstep(.58,.92,vUv.y)*n(vec2(vUv.x*19.,vUv.y*22.-time*5.));
    float edge=smoothstep(0.,.07,vUv.x)*smoothstep(0.,.07,1.-vUv.x);
    vec3 col=mix(vec3(.38,.64,.62),vec3(.90,.95,.88),flow*.48+threads*.30+froth*.45);
    gl_FragColor=vec4(col,edge*(.68+threads*.28));
   }`});
  const m=new T.Mesh(geo,mat);root.add(m);falling.push(mat);
 }
 const sprayGeo=new T.SphereGeometry(.035,5,4),sprayMat=new T.MeshBasicMaterial({color:0xe1eee0,transparent:true,opacity:.55,depthWrite:false});
 const spray=new T.InstancedMesh(sprayGeo,sprayMat,28),sprayPoints=Array.from({length:28},()=>({phase:rand(),x:(rand()-.5)*3.4})),dropMatrix=new T.Matrix4();spray.frustumCulled=false;root.add(spray);
 const impact=new T.Mesh(new T.PlaneGeometry(5,3),new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0}},vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 v;uniform float time;void main(){vec2 p=(v-.5)*2.;float d=length(p);float ring=pow(max(0.,sin(d*26.-time*3.)),8.);float a=ring*(1.-smoothstep(.2,1.,d))*.28;gl_FragColor=vec4(.8,.91,.82,a);}'}));
 impact.rotation.x=-Math.PI/2;impact.position.set(fx,.055,fz-2);root.add(impact);
 // Low moss pads explain the damp seams, contained to the cascade's stone shoulders.
 for(let i=0;i<18;i++){
  const side=i%2?1:-1;add(new T.SphereGeometry(1,7,5),'flat',i%3?0x748b57:0x92a368,fx+side*(2.1+rand()*.5),.4+rand()*2.7,fz-.35,[0,0,0],[.28,.07,.16]);
 }
 // Bake spatial contact shade beneath the bridge, then let the water shader carry it.
 const uniforms={uTime:{value:0},uHalf:{value:new T.Vector2(p.w/2,p.d/2)},uCam:{value:new T.Vector3()},uPond:{value:new T.Vector2(p.x,p.z)},uBridge:{value:new T.Vector2(b.z,b.width)},uBaseOnly:{value:0}};
 const water=new T.ShaderMaterial({uniforms,vertexShader:`varying vec3 world;void main(){vec4 w=modelMatrix*vec4(position,1.);world=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,fragmentShader:`
 precision highp float;varying vec3 world;uniform float uTime,uBaseOnly;uniform vec2 uHalf,uPond,uBridge;uniform vec3 uCam;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
 void main(){
  vec2 pos=world.xz-uPond,norm=pos/uHalf;float a=atan(norm.y,norm.x),c=abs(cos(a)),s=abs(sin(a));
  float boundary=pow(pow(c,2.5)+pow(s,2.5),-.4)*(1.+.065*sin(3.*a+.45)+.04*sin(5.*a-1.2)+.018*sin(8.*a+.8)+.022*sin(11.*a+.7));
  float depth=max(0.,(boundary-length(norm))*min(uHalf.x,uHalf.y));
  vec3 col=mix(vec3(.38,.61,.52),vec3(.12,.34,.37),smoothstep(.1,7.,depth));
  float cloud=noise(pos*.08+vec2(.07,-.03)*uTime)*.65+noise(pos*.17)*.35;
  col+=vec3(.09,.15,.13)*(cloud-.35);
  float fres=pow(1.-abs(normalize(uCam-world).y),3.);col=mix(col,vec3(.57,.71,.66),fres*.38);
  vec2 w=pos*.8+vec2(uTime*.07,-uTime*.05);float ripple=sin(w.x*2.+sin(w.y*2.1))*sin(w.y*2.3+sin(w.x*1.7));
  float fine=pow(max(0.,ripple),12.);col+=vec3(.17,.24,.20)*fine*.24*(1.-smoothstep(3.,11.,depth))*(1.-uBaseOnly);
  float sheen=pow(max(0.,sin(pos.y*9.+sin(pos.x*2.1)+uTime*.8)),25.)*smoothstep(.42,.74,noise(pos*.35+uTime*.025));col+=vec3(.025,.04,.035)*sheen*(1.-uBaseOnly);
  float shore=smoothstep(.0,.22,depth)*(1.-smoothstep(.2,.55,depth));col=mix(col,vec3(.62,.74,.61),shore*.35);
  float shade=(1.-smoothstep(uBridge.y*.5,uBridge.y*.5+1.2,abs(world.z-uBridge.x-.65)))*.24;
  col*=1.-shade;
  gl_FragColor=vec4(col,1.);
 }`});
 view.water.material=water;
 // Every mesh is a complete triangle list; no index loss at batch boundaries.
 let triangles=0;
 for(const [name,geos] of batches){
  const count=geos.reduce((n,g)=>n+g.attributes.position.count,0),position=new Float32Array(count*3),normal=new Float32Array(count*3),color=new Float32Array(count*3),uv=new Float32Array(count*2);let o=0;
  for(const g of geos){const n=g.attributes.position.count;if(n%3)throw Error('Incomplete pond triangle');position.set(g.attributes.position.array,o*3);normal.set(g.attributes.normal.array,o*3);color.set(g.attributes.color.array,o*3);if(g.attributes.uv)uv.set(g.attributes.uv.array,o*2);o+=n;g.dispose()}
  const geo=new T.BufferGeometry();for(const [k,data,size] of [['position',position,3],['normal',normal,3],['color',color,3],['uv',uv,2]])geo.setAttribute(k,new T.BufferAttribute(data,size));geo.computeBoundingSphere();
  const mesh=new T.Mesh(geo,mats[name]);mesh.name='pond-'+name;root.add(mesh);meshes.push(mesh);triangles+=count/3;
 }
 const api={root,water,support,triangles,update(t,camera){uniforms.uTime.value=t;uniforms.uCam.value.copy(camera.position);for(const mat of falling)mat.uniforms.time.value=t;impact.material.uniforms.time.value=t;for(let i=0;i<sprayPoints.length;i++){const drop=sprayPoints[i],phase=(t*.65+drop.phase)%1;dropMatrix.makeTranslation(fx+drop.x,.08+Math.sin(phase*Math.PI)*.48,fz-1.7-phase*.7);spray.setMatrixAt(i,dropMatrix)}spray.instanceMatrix.needsUpdate=true},baseOnly(v){uniforms.uBaseOnly.value=v?1:0}};
 root.userData.triangles=triangles;
 return api;
}};
