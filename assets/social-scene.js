/* Native scenery and sprites in an independent scene. Farming keeps its own scene/state. */
window.PGSocialScene={async create(host,labels,callbacks){
 const T=THREE,R=PGSocialRules,scene=new T.Scene();scene.background=new T.Color(0xb9cbbb);scene.fog=new T.Fog(0xb9cbbb,120,230);
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));host.append(renderer.domElement);
 try {
 const camera=new T.PerspectiveCamera(40,1,.1,350),players=new Map();let angle=0,zoom=52,active=false,last=0,focused=false;const focus=new T.Vector3(0,1,12);
 scene.add(new T.HemisphereLight(0xffffff,0x66775a,1));
 const [catalog,data,atlas,paving]=await Promise.all([fetch('assets/social/town/catalog.json').then(r=>{if(!r.ok)throw Error('Town metadata unavailable');return r.json()}),fetch('assets/social/town/models.bin').then(r=>{if(!r.ok)throw Error('Town models unavailable');return r.arrayBuffer()}),new T.TextureLoader().loadAsync('assets/social/town/models.webp'),new T.TextureLoader().loadAsync('assets/social/town/paving.webp')]);
 atlas.flipY=false;atlas.magFilter=T.LinearFilter;const modelMat=new T.MeshBasicMaterial({map:atlas,vertexColors:true,side:T.DoubleSide,alphaTest:.35});
 modelMat.onBeforeCompile=shader=>{shader.vertexShader='attribute vec4 sourceBounds; varying vec4 nativeBounds;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nnativeBounds=sourceBounds;');shader.fragmentShader='varying vec4 nativeBounds;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','vec4 texelColor = texture2D(map, clamp(vUv, nativeBounds.xy, nativeBounds.zw)); texelColor = mapTexelToLinear(texelColor); diffuseColor *= texelColor;')};
 const floats=new Float32Array(data),geometries={};
 function model(name,x,z,size,rotation=0,source=catalog,vertices=floats,material=modelMat){const cacheKey=(source===catalog?'town:':'garden:')+name;const rec=source.models[name];if(!geometries[cacheKey]){const g=new T.BufferGeometry(),p=[],uv=[],color=[],bounds=[];for(let i=rec.first;i<rec.first+rec.count;i++){const v=vertices.subarray(i*10,i*10+10);p.push(v[0],v[1],v[2]);uv.push(v[3],v[4]);color.push(.58+.42*v[5],.58+.42*v[5],.58+.42*v[5]);bounds.push(...v.slice(6,10))}g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('color',new T.Float32BufferAttribute(color,3));g.setAttribute('sourceBounds',new T.Float32BufferAttribute(bounds,4));geometries[cacheKey]=g}const mesh=new T.Mesh(geometries[cacheKey],material);mesh.scale.setScalar(size/Math.max(rec.size[0],rec.size[2]));mesh.position.set(x,0,z);mesh.rotation.y=rotation;scene.add(mesh);return mesh}
 // Source paving pixels are sampled from a padded native atlas tile.
 paving.flipY=false;const tile=document.createElement('canvas');tile.width=tile.height=256;tile.getContext('2d').drawImage(paving.image,16,16,256,256,0,0,256,256);const stone=new T.CanvasTexture(tile);stone.wrapS=stone.wrapT=T.RepeatWrapping;stone.repeat.set(20,20);const ground=new T.Mesh(new T.PlaneGeometry(164,164),new T.MeshBasicMaterial({map:stone,color:0xe4e2cf}));ground.rotation.x=-Math.PI/2;ground.position.y=-.02;scene.add(ground);
 const plazaTile=document.createElement('canvas');plazaTile.width=plazaTile.height=256;plazaTile.getContext('2d').drawImage(paving.image,16,304,256,256,0,0,256,256);const plazaTex=new T.CanvasTexture(plazaTile);plazaTex.wrapS=plazaTex.wrapT=T.RepeatWrapping;plazaTex.repeat.set(10,10);const plaza=new T.Mesh(new T.PlaneGeometry(62,62),new T.MeshBasicMaterial({map:plazaTex,color:0xe1d9c7}));plaza.rotation.x=-Math.PI/2;plaza.position.y=.005;scene.add(plaza);
 const roadTexture=plazaTex.clone();roadTexture.needsUpdate=true;roadTexture.repeat.set(3,26);for(const turn of [0,Math.PI/2]){const road=new T.Mesh(new T.PlaneGeometry(18,164),new T.MeshBasicMaterial({map:roadTexture,color:0xe6dfcf}));road.rotation.x=-Math.PI/2;road.rotation.z=turn;road.position.y=.001;scene.add(road)}
 model('fountain',0,0,10);
 for(const b of R.BUILDINGS)model(b.name,b.x,b.z,b.size,b.rotation||0);
 const [gardenCatalog,gardenBuffer,gardenAtlas]=await Promise.all([fetch('assets/native-fields/v1/catalog.json').then(r=>{if(!r.ok)throw Error('Garden metadata unavailable');return r.json()}),fetch('assets/native-fields/v1/prontera/models.bin').then(r=>{if(!r.ok)throw Error('Garden models unavailable');return r.arrayBuffer()}),new T.TextureLoader().loadAsync('assets/native-fields/v1/prontera/models.webp')]);
 gardenAtlas.flipY=false;const gardenMat=modelMat.clone();gardenMat.map=gardenAtlas;gardenMat.onBeforeCompile=modelMat.onBeforeCompile;
 const garden=gardenCatalog.maps.find(m=>m.name==='prontera'),gardenFloats=new Float32Array(gardenBuffer);
 // Reuse native grass pixels for four bounded gardens, with canopy clearance from paths.
 for(const g of R.GARDENS){
  const grass=stone.clone();grass.repeat.set(g.w/8,g.d/8);grass.needsUpdate=true;
  const bed=new T.Mesh(new T.PlaneGeometry(g.w,g.d),new T.MeshBasicMaterial({map:grass,color:0xe4e2cf}));bed.rotation.x=-Math.PI/2;bed.position.set(g.x,.012,g.z);scene.add(bed);
  const curbMaterial=new T.MeshBasicMaterial({color:0xb3ac97});
  for(const side of [-1,1])for(const axis of ['x','z']){const curb=new T.Mesh(new T.BoxGeometry(axis==='x'?.35:g.w+.35,.22,axis==='z'?.35:g.d+.35),curbMaterial);curb.position.set(g.x+(axis==='x'?side*g.w/2:0),.1,g.z+(axis==='z'?side*g.d/2:0));scene.add(curb)}
  for(const offset of [-4,0,4])for(const side of [-1,1])model('shrub',g.x+offset,g.z+side*5,2.4,0,garden,gardenFloats,gardenMat);
 }
 for(const {x,z,size} of R.TREES)model('tree2',x,z,size,0,garden,gardenFloats,gardenMat);
 const seats=R.SEATS.map(s=>{const mesh=model('bench',s.x,s.z,s.size,s.rotation);mesh.userData.seat=s.id;mesh.userData.seatBounds=new T.Box3().setFromObject(mesh).expandByScalar(.25);return mesh});

 const water=new T.Mesh(new T.CircleGeometry(3.7,48),new T.MeshBasicMaterial({color:0x60c9dc,transparent:true,opacity:.65}));water.rotation.x=-Math.PI/2;water.position.y=.7;scene.add(water);
 const sprayGeo=new T.BufferGeometry(),spray=new Float32Array(72*3);sprayGeo.setAttribute('position',new T.BufferAttribute(spray,3));const drops=new T.Points(sprayGeo,new T.PointsMaterial({color:0xd6f8ff,size:.14,transparent:true,opacity:.8}));scene.add(drops);
 const allClasses={...PGWardrobe.CLASSES,...PGFourthJobs.CLASSES};const stores=[new PGWardrobe.Store({budget:96*1024*1024}),new PGFourthJobs.Store({budget:64*1024*1024}),new PGWardrobe.Store({base:'assets/social/sitting/',classes:allClasses,budget:48*1024*1024,stances:['sit']})];
 function removePlayer(id){const p=players.get(id);if(!p)return;for(const s of stores)s.release('social-'+id);scene.remove(p.sprite);p.sprite.material.dispose();p.texture.dispose();p.label.remove();players.delete(id)}
 function loadLooks(p,now){
  if(p.loading||now<p.retryAt)return;
  const appearance=PGWardrobe.normalize(p.state.look?.appearance)||PGWardrobe.defaults('m'),cls=Object.hasOwn(allClasses,p.state.look?.cls)?p.state.look.cls:'Novice';
  const seq=++p.seq,key=JSON.stringify([cls,appearance]),normal=Object.hasOwn(PGFourthJobs.CLASSES,cls)?stores[1]:stores[0];p.loading=true;
  const current=()=>players.get(p.state.id)===p&&seq===p.seq;
  // Standing loads first; a pending sitting atlas keeps the standing character visible.
  normal.select('social-'+p.state.id,appearance,cls).then(async look=>{
   if(!current()||!look)return;p.looks.normal=look;if(p.loaded!==key)p.looks.sit=null;p.loaded=key;p.label.dataset.loading='false';p.label.title='';
   const sit=await stores[2].select('social-'+p.state.id,appearance,cls);if(current()&&sit)p.looks.sit=sit;
  }).catch(e=>{if(current()){p.retryAt=performance.now()+3000;p.label.title='Retrying character download…';console.warn('Social appearance:',e.message)}}).finally(()=>{if(current())p.loading=false});
 }
 function putPlayer(state){let p=players.get(state.id);if(!p){
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=280;const texture=new T.CanvasTexture(canvas);texture.magFilter=texture.minFilter=T.NearestFilter;texture.generateMipmaps=false;
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthTest:true,alphaTest:.05}));sprite.userData.socialId=state.id;sprite.center.set(.5,80/280);scene.add(sprite);
  const label=document.createElement('div');label.className='social-player-label';label.dataset.loading='true';const bubble=document.createElement('div');bubble.className='social-bubble';const name=document.createElement('button');name.textContent=state.name;name.onclick=()=>callbacks.menu(state.name,state.id);label.append(bubble,name);labels.append(label);
  p={canvas,texture,sprite,label,bubble,state,loaded:'',looks:{},seq:0,retryAt:0,loading:false,trail:{points:[],progress:null}};players.set(state.id,p);
 }
 p.state={...state,path:(state.path||[]).map(v=>({...v})),at:performance.now()};
 const key=JSON.stringify([Object.hasOwn(allClasses,state.look?.cls)?state.look.cls:'Novice',PGWardrobe.normalize(state.look?.appearance)||PGWardrobe.defaults('m')]);
 if(p.requested!==key){p.requested=key;p.seq++;p.loading=false;p.retryAt=0;loadLooks(p,performance.now())}
 }
 function bubble(id,m){const p=players.get(id);if(!p)return;p.bubble.replaceChildren();if(m.emotion){const img=document.createElement('img');img.src='assets/social/emotions/'+m.emotion+'.png';img.alt='/'+m.emotion;p.bubble.append(img)}else p.bubble.textContent=m.body;p.bubbleUntil=performance.now()+6000}
 const ray=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0),0);let down=null;const touches=new Map();
 host.onpointerdown=e=>{down={x:e.clientX,y:e.clientY,angle,moved:false};host.setPointerCapture(e.pointerId);touches.set(e.pointerId,{x:e.clientX,y:e.clientY})};host.onpointermove=e=>{if(!down)return;touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touches.size===2){const a=[...touches.values()],distance=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);if(down.pinch)zoom=Math.max(35,Math.min(95,zoom*down.pinch/distance));down.pinch=distance;down.moved=true}else if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>7){angle=down.angle-(e.clientX-down.x)*.008;down.moved=true}};
 host.onpointerup=e=>{touches.delete(e.pointerId);if(down&&!down.moved){const rect=host.getBoundingClientRect();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);const seat=seats.map(mesh=>{const point=ray.ray.intersectBox(mesh.userData.seatBounds,new T.Vector3());return point?{mesh,distance:point.distanceTo(ray.ray.origin)}:null}).filter(Boolean).sort((a,b)=>a.distance-b.distance)[0];if(seat){callbacks.seat(seat.mesh.userData.seat);down=null;return}const point=new T.Vector3();if(ray.ray.intersectPlane(plane,point)&&R.walkable(point.x,point.z))callbacks.move(point.x,point.z)}down=null};host.onpointercancel=()=>{down=null;touches.clear()};host.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(35,Math.min(95,zoom+e.deltaY*.04))},{passive:false});
 const observer=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix()});observer.observe(host);
 function frame(now){requestAnimationFrame(frame);if(!active||document.hidden||now-last<1000/30)return;const dt=Math.min(.1,(now-last)/1000);last=now;
 for(const p of players.values())R.advance(p.state,now);
 const self=players.get(callbacks.self());if(self){const target=new T.Vector3(self.state.x,1,self.state.z-6);if(!focused){focus.copy(target);focused=true}else focus.lerp(target,1-Math.exp(-dt*8))}
 camera.position.set(focus.x+Math.sin(angle)*zoom,focus.y+zoom*.88,focus.z+Math.cos(angle)*zoom);camera.lookAt(focus);
 for(let i=0;i<72;i++){const t=(now/1500+i/72)%1,a=i*2.399;spray[i*3]=Math.cos(a)*t*2.6;spray[i*3+1]=1.5+Math.sin(t*Math.PI)*3;spray[i*3+2]=Math.sin(a)*t*2.6}sprayGeo.attributes.position.needsUpdate=true;
 for(const p of players.values()){
  const state=p.state;if(state.id===callbacks.self()&&p.wasSitting!==state.sit){p.wasSitting=state.sit;callbacks.sitting?.(state.sit)}if(p.loaded!==p.requested||!p.looks.normal||!p.looks.sit)loadLooks(p,now);
  const look=(state.sit?p.looks.sit:null)||p.looks.normal;let height=3.2;
  const chair=state.sit&&R.SEATS[state.seat],floor=chair?chair.height:.06;
  if(look){
   const facing=(state.dir+Math.round(angle/(Math.PI/4))+8)%8,stance=state.sit&&p.looks.sit?'sit':state.path.length?'walk':'idle';
   const glow=milestone(REFINE_GLOWS,Math.max(0,Math.min(15,Number(state.look?.refine)||0)));
   PGWardrobe.draw(p.canvas.getContext('2d'),look,stance,facing,now,null,now,
    glow?(ctx,image,layer,phase)=>drawNativeWeaponGlow(ctx,image,layer,phase,glow,p.trail,null,now):null,
    glow?(ctx,image,layer,phase)=>drawNativeArmGlow(ctx,image,layer,phase,glow,now):null);
   p.texture.needsUpdate=true;p.label.dataset.stance=stance;
   const scale=2.6/(p.looks.normal?.base.figureHeight||look.base.figureHeight);p.sprite.scale.set(320*scale,280*scale,1);
   const top=Math.min(...[look.base,look.hair].flatMap(part=>{const action=part.metadata.actions[stance+facing];return action.frames[PGWardrobe.frameIndex(action,now)].filter(l=>l[7]!=='shadow').map(l=>l[5])}));height=(200-top)*scale+.25;
  }
  // Put the native ground-sitting pose on the seat deck, forward of its backrest.
  p.sprite.position.set(state.x+(chair?Math.sin(chair.rotation)*.35:0),floor,state.z+(chair?Math.cos(chair.rotation)*.35:0));const v=p.sprite.position.clone();v.y+=height;v.project(camera);
  p.label.style.left=(v.x+1)*host.clientWidth/2+'px';p.label.style.top=(1-v.y)*host.clientHeight/2+'px';p.label.hidden=v.z>1||v.z< -1||Math.abs(v.x)>1||Math.abs(v.y)>1;
  if(p.bubbleUntil<now)p.bubble.replaceChildren();
 }
 renderer.render(scene,camera)}requestAnimationFrame(frame);
 return {putPlayer,removePlayer,bubble,clearPlayers(){focused=false;for(const id of [...players.keys()])removePlayer(id)},get active(){return active},set active(v){active=v;if(v){last=performance.now();focused=false}},scene,camera,renderer};
 }catch(error){renderer.dispose();renderer.domElement.remove();throw error}
}};
