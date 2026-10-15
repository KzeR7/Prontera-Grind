/* Original small-scale environment detailing. Approved Thor scenery is not modified. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.PGJourneyDetails=factory(root.THREE);})(typeof globalThis==='object'?globalThis:this,function(THREE){
'use strict';
function build(kind,{stoneImage}={}){
 const root=new THREE.Group();root.name='Journey micro-details';const geometries=new Set(),materials=new Map(),batches=new Map(),banners=[];
 let grain=null;if(kind==='astral'&&stoneImage){grain=new THREE.Texture(stoneImage);grain.encoding=THREE.sRGBEncoding;grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.needsUpdate=true;}
 let seed=44019;const rand=()=>((seed=seed*16807%2147483647)-1)/2147483646;
 const box=new THREE.BoxGeometry(1,1,1),chip=new THREE.IcosahedronGeometry(.5,0),link=new THREE.TorusGeometry(.18,.035,4,10);[box,chip,link].forEach(g=>geometries.add(g));
 const matrix=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3(),e=new THREE.Euler();
 function mat(color,glow=false){const key=color+':'+glow;if(!materials.has(key)){const material=glow?new THREE.MeshBasicMaterial({color,toneMapped:false}):new THREE.MeshStandardMaterial({color,map:grain,bumpMap:grain,bumpScale:.035,roughness:.85,metalness:.12});material.color.convertSRGBToLinear();materials.set(key,material);}return materials.get(key);}
 function piece(shape,color,x,y,z,w,h,d,ry=0,flat=false,glow=false,rx=0){const key=shape+':'+color+':'+flat+':'+glow;
  if(!batches.has(key))batches.set(key,{shape,mat:mat(color,glow),flat,transforms:[]});
  p.set(x,y,z);e.set(rx,ry,0);q.setFromEuler(e);scale.set(w,h,d);matrix.compose(p,q,scale);batches.get(key).transforms.push(matrix.clone());
 }
 if(kind==='astral'){
  // Flat brass seams and inset route arrows are decorative, not walls or steps.
  for(let z=17;z>-177;z-=5.5)for(const side of [-1,1]){
   piece('box',0x88745e,side*13.7,.041,z,.09,.018,5.15,0,true);
   if(((Math.round(z*2)%22)+22)%22===12){piece('box',0x77667e,side*14.25,.18,z,.65,.32,.7);piece('chip',0xbfa8e1,side*14.25,.58,z,.26,.44,.26,0,false,true);}
  }
  for(let z=12;z>-185;z-=11){for(const side of [-1,1])piece('box',0x8e7d75,side*.32,.045,z,.08,.016,.85,side*.72,true);}
  // Compass-like fine engravings remain flush with the paving.
  for(const z of [-8,-74,-140,-208])for(let i=0;i<16;i++){
   const a=i/16*Math.PI*2,r=i%2?2.7:3.4;
   piece('box',0x938487,Math.sin(a)*r,.045,z+Math.cos(a)*r,.045,.014,i%2?.45:.9,a,true);
  }
  for(let i=0;i<154;i++){
   const z=20-rand()*194,side=i%2?1:-1,x=side*(14.15+rand()*.5);
   piece(i%3?'box':'chip',[0x74667e,0x95808a,0x51485c][i%3],x,.10+rand()*.08,z,.13+rand()*.34,.10+rand()*.17,.15+rand()*.38,rand()*6);
  }
  // Chains and torn pennants hang outside the safe route, not across the lane.
  for(const z of [-23,-61,-94,-127,-166])for(const side of [-1,1]){
   for(let j=0;j<7;j++)piece('link',0x857486,side*16,-.6-j*.34,z,1,1,1,j%2?Math.PI/2:0,false,false);
   piece('box',0x504657,side*15.9,-.33,z,3.1,.55,2.2);
   piece('box',0x65556f,side*16.7,2.05,z,.13,4.2,.13);
   piece('box',0xa28d89,side*17.8,4.05,z,2.8,.12,.12);
   const g=new THREE.PlaneGeometry(2.4,3.1,4,6),pos=g.attributes.position;
   for(let i=0;i<pos.count;i++){const y=pos.getY(i);if(y<-1.1)pos.setY(i,y+((i%3)*.16));}
   g.computeVertexNormals();geometries.add(g);
   const material=new THREE.MeshStandardMaterial({color:new THREE.Color(z<-110?0x493a60:0x61506b).convertSRGBToLinear(),side:THREE.DoubleSide,roughness:1});materials.set('banner'+banners.length,material);
   const banner=new THREE.Mesh(g,material);banner.position.set(side*17.8,2.4,z);banner.userData.category='detail-solid';banner.castShadow=true;root.add(banner);banners.push({mesh:banner,base:pos.array.slice(),phase:rand()*6});
   // A slim brass embroidered stripe, made from flat geometry (no new sprite art).
   piece('box',0x978373,side*17.8,2.55,z+.015,1.6,.055,.02);
  }
  // Fine radial terminal inlay and chipped outer sanctuary rim.
  for(let i=0;i<48;i++){const a=i/48*Math.PI*2;piece('box',0x9c8594,Math.sin(a)*16.5,.045,-208+Math.cos(a)*16.5,.055,.015,.7,a,true);}
 }
 for(const b of batches.values()){
  const g=b.shape==='box'?box:b.shape==='chip'?chip:link,m=new THREE.InstancedMesh(g,b.mat,b.transforms.length);b.transforms.forEach((t,i)=>m.setMatrixAt(i,t));
  m.userData.category=b.flat?'detail-floor':'detail-solid';m.castShadow=!b.flat;m.receiveShadow=true;root.add(m);
 }
 let disposed=false;
 return{root,update(seconds,motion){if(disposed)return;for(const b of banners){const pos=b.mesh.geometry.attributes.position;for(let i=0;i<pos.count;i++){const weight=(1-b.base[i*3+1]/1.55)/2;pos.setZ(i,b.base[i*3+2]+(motion?Math.sin(seconds*1.1+b.phase+i*.24)*.10*weight:0));}pos.needsUpdate=true;}},stats(){let pieces=0,triangles=0;root.traverse(o=>{if(o.isMesh){pieces+=o.isInstancedMesh?o.count:1;triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}});return{pieces,triangles,batches:root.children.length};},dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());if(grain)grain.dispose();root.clear();}};
}
return Object.freeze({build});
});
