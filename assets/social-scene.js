/* Native scenery and sprites in an independent scene. Farming keeps its own scene/state. */
window.PGSocialScene={async create(host,labels,callbacks){
 const T=THREE,R=PGSocialRules,scene=new T.Scene();scene.background=new T.Color(0xb9cbbb);scene.fog=new T.Fog(0xb9cbbb,120,230);
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));host.append(renderer.domElement);
 try {
 const camera=new T.PerspectiveCamera(40,1,.1,350),players=new Map();let angle=0,pitch=48,distance=48,panX=0,panZ=0,follow=true,active=false,last=0,clock=0,focused=false,viewW=0,viewH=0;
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
 const seats=R.SEATS.map(s=>{const mesh=model('bench',s.x,s.z,s.size,s.rotation);mesh.userData.seat=s.id;mesh.userData.seatBounds=new T.Box3().setFromObject(mesh).expandByScalar(.25);return mesh});

 const water=new T.Mesh(new T.CircleGeometry(3.7,48),new T.MeshBasicMaterial({color:0x60c9dc,transparent:true,opacity:.65}));water.rotation.x=-Math.PI/2;water.position.y=.7;scene.add(freeze(water));
 const sprayGeo=new T.BufferGeometry(),spray=new Float32Array(72*3);sprayGeo.setAttribute('position',new T.BufferAttribute(spray,3));const drops=new T.Points(sprayGeo,new T.PointsMaterial({color:0xd6f8ff,size:.14,transparent:true,opacity:.8}));scene.add(drops);
 const allClasses={...PGWardrobe.CLASSES,...PGFourthJobs.CLASSES};const stores=[new PGWardrobe.Store({budget:96*1024*1024}),new PGFourthJobs.Store({budget:64*1024*1024}),new PGWardrobe.Store({base:'assets/social/sitting/',classes:allClasses,budget:48*1024*1024,stances:['sit']})];
 function disposeAura(group){if(!group)return;const textures=new Set();group.traverse(o=>{if(o.isMesh||o.isPoints)o.geometry.dispose();if(o.material){if(o.material.map)textures.add(o.material.map);o.material.dispose()}});textures.forEach(t=>t.dispose())}
 // v225 (owner): the plaza reuses the field's own Base 50/99/150 sigil, so a character's level aura
 // is the same object and animation here. Textures are private to one player and freed on leave.
 function auraTier(lv){return typeof LEVEL_AURAS==='undefined'?null:LEVEL_AURAS.filter(a=>lv>=a.at).at(-1)||null}
 function syncAura(p){const tier=auraTier(Math.max(0,Math.floor(Number(p.state.look?.lv)||0))),tierAt=tier?tier.at:0;if(p.auraTier===tierAt)return;p.auraTier=tierAt;if(p.aura){scene.remove(p.aura);disposeAura(p.aura);p.aura=null}if(!tier||typeof buildLevelAura!=='function')return;p.aura=buildLevelAura(tier);scene.add(p.aura)}
 function animateAura(p,now,x,z){const aura=p.aura;if(!aura)return;const seconds=now/1000;aura.position.set(x,.07,z);aura.scale.setScalar(1.18*(1+Math.sin(seconds*2)*.025));aura.children.forEach((layer,i)=>{if(!layer.material)return;layer.rotation.y=(seconds*(i?-.3:.22))%(Math.PI*2);layer.material.opacity=.8+Math.sin(seconds*2+i)*.12;if(layer.children[0]?.material)layer.children[0].material.opacity=.85+Math.sin(seconds*2+i)*.1});const data=aura.userData;if(data.floor)data.floor.material.opacity=.4+Math.sin(seconds*1.7)*.07;if(data.veil)data.veil.material.opacity=.2+Math.sin(seconds*1.7)*.035;const motes=data.motes;if(motes){const positions=motes.geometry.attributes.position,colors=motes.geometry.attributes.color;for(let i=0;i<positions.count;i++){const phase=(seconds*.23+i/positions.count)%1,angle=i*2.399+seconds*.24,radius=.55+Math.sin(i*1.7)*.25,fade=Math.sin(phase*Math.PI);positions.setXYZ(i,Math.cos(angle)*radius,phase*1.6,Math.sin(angle)*radius);colors.setXYZ(i,fade,fade,fade)}positions.needsUpdate=colors.needsUpdate=true}}
 function removePlayer(id){const p=players.get(id);if(!p)return;for(const s of stores)s.release('social-'+id);if(p.aura){scene.remove(p.aura);disposeAura(p.aura)}scene.remove(p.sprite);p.sprite.material.dispose();p.texture.dispose();p.label.remove();p.bubble.remove();players.delete(id)}
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
  const label=document.createElement('div');label.className='social-player-label';label.dataset.loading='true';label.dataset.player=state.id;const bubble=document.createElement('div');bubble.className='social-bubble';bubble.dataset.player=state.id;const name=document.createElement('button');name.textContent=state.name;name.onclick=()=>callbacks.menu(state.name,state.id);const title=document.createElement('small');title.className='social-player-title';label.append(name,title);labels.append(label,bubble);
  p={canvas,ctx,texture,sprite,label,bubble,title,state,loaded:'',paint:'',height:3.2,aura:null,auraTier:-1,lx:'',ly:'',lhid:null,bx:'',by:'',bhid:null,bubbleUntil:0,looks:{},seq:0,retryAt:0,loading:false,trail:{points:[],progress:null}};players.set(state.id,p);
 }
 const nextTitle=state.look?.title||'';if(p.title.textContent!==nextTitle){p.title.textContent=nextTitle;p.title.hidden=!nextTitle}else if(p.title.hidden!==!nextTitle)p.title.hidden=!nextTitle;
 p.state={...state,path:(state.path||[]).map(v=>({...v})),at:performance.now()};
 syncAura(p);
 const key=JSON.stringify([Object.hasOwn(allClasses,state.look?.cls)?state.look.cls:'Novice',PGWardrobe.normalize(state.look?.appearance)||PGWardrobe.defaults('m')]);
 if(p.requested!==key){p.requested=key;p.paint='';p.seq++;p.loading=false;p.retryAt=0;loadLooks(p,performance.now())}
 }
 function bubble(id,m){const p=players.get(id);if(!p)return;p.bubble.replaceChildren();p.bubble.classList.toggle('social-emotion',!!m.emotion);if(m.emotion){const img=document.createElement('img');img.src='assets/social/emotions/'+m.emotion+'.png';img.alt='/'+m.emotion;p.bubble.append(img)}else p.bubble.textContent=m.body;p.bubbleUntil=Math.max(performance.now(),clock)+6000;p.bhid=null}
 // Keep camera state separate from both farming and authoritative player coordinates.
 const cameraState=()=>({angle,pitch,distance,panX,panZ,follow});
 function setCamera(values={}){const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
 if(Number.isFinite(values.angle))angle=((values.angle+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
 if(Number.isFinite(values.pitch))pitch=clamp(values.pitch,25,78);
 if(Number.isFinite(values.distance))distance=clamp(values.distance,12,100);
 if(Number.isFinite(values.panX))panX=clamp(values.panX,-R.LIMIT,R.LIMIT);
 if(Number.isFinite(values.panZ))panZ=clamp(values.panZ,-R.LIMIT,R.LIMIT);
 if(typeof values.follow==='boolean'&&follow!==values.follow){if(values.follow){panX=panZ=0}else{panX=focus.x;panZ=focus.z}follow=values.follow}
 callbacks.camera?.(cameraState());}
 function resetCamera(){setCamera({angle:0,pitch:48,distance:48,panX:0,panZ:0,follow:true})}
 function pan(dx,dy){const k=distance/Math.max(1,viewH||host.clientHeight)*.8;setCamera({panX:panX-dx*Math.cos(angle)*k-dy*Math.sin(angle)*k,panZ:panZ+dx*Math.sin(angle)*k-dy*Math.cos(angle)*k})}
 const ray=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0),0);let down=null;const touches=new Map();
 function startDrag(e,moved=false){return {x:e.clientX,y:e.clientY,angle,pitch,moved,pan:e.button===1||e.button===2||e.shiftKey}}
 host.oncontextmenu=e=>e.preventDefault();
 host.onpointerdown=e=>{e.preventDefault();host.setPointerCapture(e.pointerId);touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touches.size===1)down=startDrag(e);else if(down){down.moved=true;down.pinch=null}};
 host.onpointermove=e=>{if(!down||!touches.has(e.pointerId))return;const previous=touches.get(e.pointerId);touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(touches.size===2){const a=[...touches.values()],span=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),cx=(a[0].x+a[1].x)/2,cy=(a[0].y+a[1].y)/2;if(down.pinch&&span>0){setCamera({distance:distance*down.pinch/span});pan(cx-down.cx,cy-down.cy)}down.pinch=span;down.cx=cx;down.cy=cy;down.moved=true}
 else if(down.moved||Math.hypot(e.clientX-down.x,e.clientY-down.y)>7){if(down.pan)pan(e.clientX-previous.x,e.clientY-previous.y);else setCamera({angle:down.angle-(e.clientX-down.x)*.008,pitch:down.pitch+(e.clientY-down.y)*.18});down.moved=true}};
 host.onpointerup=e=>{if(!touches.has(e.pointerId))return;touches.delete(e.pointerId);if(down&&!down.moved){const rect=host.getBoundingClientRect();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);
 const seat=seats.map(mesh=>{const point=ray.ray.intersectBox(mesh.userData.seatBounds,new T.Vector3());return point?{mesh,distance:point.distanceTo(ray.ray.origin)}:null}).filter(Boolean).sort((a,b)=>a.distance-b.distance)[0];if(seat)callbacks.seat(seat.mesh.userData.seat);else{const point=new T.Vector3();if(ray.ray.intersectPlane(plane,point)&&R.walkable(point.x,point.z))callbacks.move(point.x,point.z)}}
 if(touches.size){const p=[...touches.values()][0];down=startDrag({...p,clientX:p.x,clientY:p.y},true)}else down=null};
 host.onpointercancel=()=>{down=null;touches.clear()};host.addEventListener('wheel',e=>{e.preventDefault();setCamera({distance:distance*Math.exp(e.deltaY*.001)})},{passive:false});
 function syncSize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h||(w===viewW&&h===viewH))return;viewW=w;viewH=h;renderer.setSize(w,h);camera.aspect=w/h;camera.setViewOffset(w,h,0,h*.16,w,h);camera.updateProjectionMatrix()}
 syncSize();const observer=new ResizeObserver(syncSize);observer.observe(host);
 function frame(now){requestAnimationFrame(frame);if(!active||document.hidden)return;if(!viewW||!viewH)syncSize();const dt=last?Math.min(.1,Math.max(0,(now-last)/1000)):0;last=clock=now;
 for(const p of players.values())R.advance(p.state,now);
 const self=players.get(callbacks.self());target.set(follow&&self?self.state.x+panX:panX,.8,follow&&self?self.state.z+panZ:panZ);if(!focused){focus.copy(target);focused=true}else focus.lerp(target,1-Math.exp(-dt*8));
 const tilt=pitch*Math.PI/180;camera.position.set(focus.x+Math.sin(angle)*distance*Math.cos(tilt),focus.y+Math.sin(tilt)*distance,focus.z+Math.cos(angle)*distance*Math.cos(tilt));camera.lookAt(focus);camera.updateMatrixWorld();
 for(let i=0;i<72;i++){const t=(now/1500+i/72)%1,a=i*2.399;spray[i*3]=Math.cos(a)*t*2.6;spray[i*3+1]=1.5+Math.sin(t*Math.PI)*3;spray[i*3+2]=Math.sin(a)*t*2.6}sprayGeo.attributes.position.needsUpdate=true;
 const w=viewW||host.clientWidth,h=viewH||host.clientHeight;
 for(const p of players.values()){
  const state=p.state;if(state.id===callbacks.self()&&p.wasSitting!==state.sit){p.wasSitting=state.sit;callbacks.sitting?.(state.sit)}if(p.loaded!==p.requested||!p.looks.normal||!p.looks.sit)loadLooks(p,now);
  const look=(state.sit?p.looks.sit:null)||p.looks.normal;let height=p.height;
  const chair=state.sit&&R.SEATS[state.seat],floor=chair?chair.height:.06;
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
  // Put the native ground-sitting pose on the seat deck, forward of its backrest.
  p.sprite.position.set(state.x+(chair?Math.sin(chair.rotation)*.35:0),floor,state.z+(chair?Math.cos(chair.rotation)*.35:0));
  animateAura(p,now,state.x,state.z);
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
 return {putPlayer,removePlayer,bubble,setCamera,resetCamera,get cameraState(){return cameraState()},clearPlayers(){focused=false;for(const id of [...players.keys()])removePlayer(id)},get active(){return active},set active(v){active=v;if(v){syncSize();last=performance.now();focused=false}},scene,camera,renderer};
 }catch(error){renderer.dispose();renderer.domElement.remove();throw error}
}};
