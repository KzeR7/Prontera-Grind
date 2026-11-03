// Exercise the actual scene lifecycle with Three geometry and controlled asset timing.
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<div id="host"></div><div id="labels"></div>',{runScripts:'outside-only'}),w=dom.window,T={...require('three')};let frame,now=1000,failNormal=true,sitReady=false,draws=[],selectedSeat=null,moves=[];
 const ctx={drawImage(){}};w.HTMLCanvasElement.prototype.getContext=()=>ctx;
 const host=w.document.getElementById('host');host.setPointerCapture=()=>{};host.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:700});Object.defineProperties(host,{clientWidth:{value:1000},clientHeight:{value:700}});
 T.WebGLRenderer=class{constructor(){this.domElement=w.document.createElement('canvas')}setPixelRatio(){}setSize(){}render(){}dispose(){}};
 T.TextureLoader=class{async loadAsync(){return new T.Texture(w.document.createElement('canvas'))}};
 const action={delay:100,frames:[[[0,0,20,60,150,140,0,'body']]]},look={base:{figureHeight:60,metadata:{actions:{}}},hair:{metadata:{actions:{}}}};
 for(const stance of ['idle','walk','sit'])for(let d=0;d<8;d++)look.base.metadata.actions[stance+d]=look.hair.metadata.actions[stance+d]=action;
 class Store{constructor(options={}){this.sit=options.stances?.[0]==='sit'}release(){}async select(){if(!this.sit&&failNormal){failNormal=false;throw Error('transient download')}if(this.sit&&!sitReady)return null;return look}}
 Object.assign(w,{THREE:T,devicePixelRatio:1,requestAnimationFrame:cb=>frame=cb,ResizeObserver:class{constructor(fn){this.fn=fn}observe(){this.fn()}},PGWardrobe:{CLASSES:{Novice:0},Store,normalize:a=>a,defaults:()=>({version:1,sex:'m'}),frameIndex:()=>0,draw:(...args)=>draws.push(args)},PGFourthJobs:{CLASSES:{},Store},milestone:()=>({at:10}),REFINE_GLOWS:[],drawNativeWeaponGlow(){},drawNativeArmGlow(){},LEVEL_AURAS:[{at:50,color:'#79dcff',pattern:'compass'},{at:99,color:'#b897ff',pattern:'arcane'},{at:150,color:'#ffd779',pattern:'sunburst'}],buildLevelAura:a=>{const g=new T.Group();g.userData.tier=a.at;const floor=new T.Mesh(new T.PlaneGeometry(2.9,2.9),new T.MeshBasicMaterial());floor.position.y=-.008;floor.geometry.addEventListener('dispose',()=>w.auraDisposals=(w.auraDisposals||0)+1);floor.material.addEventListener('dispose',()=>w.auraDisposals=(w.auraDisposals||0)+1);g.add(floor);g.userData.floor=floor;return g}});
 Object.defineProperty(w.document,'hidden',{value:false});w.performance.now=()=>now;w.console.warn=()=>{};
 w.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(url)),arrayBuffer:async()=>{const b=fs.readFileSync(url);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}});
 w.eval(fs.readFileSync('assets/social-rules.js','utf8'));w.eval(fs.readFileSync('assets/social-scene.js','utf8'));
 const scene=await w.PGSocialScene.create(host,w.document.getElementById('labels'),{self:()=>1,menu(){},move(x,z){moves.push({x,z})},seat(id){selectedSeat=id}}),flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve()};
 const state={id:1,name:'Synthetic',x:0,z:12,dir:0,sit:true,path:[],look:{cls:'Novice',appearance:{version:1,sex:'m'},refine:10,title:'Poring Hunter',lv:150}};
 scene.active=true;scene.putPlayer(state);await flush();frame(now+=100);assert.equal(draws.length,0);frame(now+=3100);await flush();frame(now+=100);assert(draws.length,'failed download automatically retries without network movement');assert.equal(draws.at(-1)[2],'idle','pending sitting atlas falls back to visible standing sprite');assert.equal(typeof draws.at(-1)[7],'function','native weapon glow hook');assert.equal(typeof draws.at(-1)[8],'function','stowed weapon glow hook');
 sitReady=true;frame(now+=100);await flush();frame(now+=100);assert.equal(draws.at(-1)[2],'sit');
 const before=scene.camera.position.clone();scene.putPlayer({...state,sit:false,x:34,z:25});frame(now+=100);assert(scene.camera.position.x>before.x,'camera follows self');assert(scene.camera.position.z>before.z);const label=w.document.querySelector('.social-player-label');assert.equal(label.hidden,false);const sprite=scene.scene.children.find(o=>o.userData.socialId===1),feet=sprite.position.clone().project(scene.camera);assert(parseFloat(label.style.top)>(1-feet.y)*350,'name starts below feet');assert.equal(label.querySelector('small').textContent,'Poring Hunter');assert(feet.y>.03&&feet.y<.22,'player stands slightly higher than the middle of the screen by default');
 // v225: the field's own level sigil appears under the character and moves with them.
 const aura=scene.scene.children.find(o=>o.userData.tier===150);assert.ok(aura,'Base 150 character has a level aura');assert.equal(aura.position.y,.07);assert.equal(aura.position.x,34);assert.equal(aura.position.z,25);
 scene.putPlayer({...state,x:0,z:12,look:{...state.look,lv:49}});frame(now+=100);assert.equal(scene.scene.children.some(o=>o.userData.tier),false,'no aura below Base 50');assert.ok(w.auraDisposals>0,'removing a tier disposes its geometry and material');
 scene.putPlayer({...state,x:0,z:12,look:{...state.look,lv:99}});frame(now+=100);assert.ok(scene.scene.children.some(o=>o.userData.tier===99),'the sigil follows the character level tier');

 // v269: 12 physical metal park benches, each seating 2 players side-by-side (24 seats total).
 // v288 adds 8 single-seat angler chairs on the pond rims (seat ids 24-31) => 32 seats.
 assert.equal(w.PGSocialRules.BENCHES.length,12);assert.equal(w.PGSocialRules.CHAIRS.length,8);assert.equal(w.PGSocialRules.SEATS.length,32);
 for(const c of w.PGSocialRules.CHAIRS){
  assert(w.PGSocialRules.walkable(c.x,c.z),'chair '+c.id+' stands on walkable ground');
  const seat=w.PGSocialRules.SEATS[c.id];
  assert.equal(seat.id,c.id);assert.equal(seat.bench,100+c.id,'chairs use unique bench ids so partner-swap never matches');
 }
 const frontBench=scene.scene.children.find(o=>o.userData.bench===0),benchSize=new T.Box3().setFromObject(frontBench).getSize(new T.Vector3());assert(benchSize.z>1&&benchSize.x>3&&benchSize.y<2.2,'native park bench has a full seat and back at character scale, not a flat noticeboard');
 const chair=scene.scene.children.find(o=>o.userData.bench===5);scene.camera.updateMatrixWorld();
 const bCenter=chair.userData.seatBounds.getCenter(new T.Vector3());
 const leftPt=new T.Vector3(bCenter.x-.8,bCenter.y,bCenter.z).project(scene.camera),rightPt=new T.Vector3(bCenter.x+.8,bCenter.y,bCenter.z).project(scene.camera);
 const clickAt=pt=>{const ev={clientX:(pt.x+1)*500,clientY:(1-pt.y)*350,pointerId:1,button:0,preventDefault(){}};host.onpointerdown(ev);host.onpointerup(ev);};
 clickAt(leftPt);assert.equal(selectedSeat,10,'left half of metal bench selects first seat');
 clickAt(rightPt);assert.equal(selectedSeat,11,'right half of metal bench selects second seat');
 scene.putPlayer({id:2,name:'Buddy',x:w.PGSocialRules.SEATS[10].x,z:w.PGSocialRules.SEATS[10].z,dir:0,sit:true,seat:10,path:[],look:state.look});
 clickAt(leftPt);assert.equal(selectedSeat,11,'clicking occupied bench half auto-picks free partner seat on same bench');
 scene.removePlayer(2);
 scene.putPlayer({...state,x:w.PGSocialRules.SEATS[0].x,z:w.PGSocialRules.SEATS[0].z,sit:true,seat:0});
 scene.putPlayer({id:2,name:'Buddy',x:w.PGSocialRules.SEATS[1].x,z:w.PGSocialRules.SEATS[1].z,dir:0,sit:true,seat:1,path:[],look:state.look});
 frame(now+=100);
 const seatedSprite=scene.scene.children.find(o=>o.userData.socialId===1),buddySprite=scene.scene.children.find(o=>o.userData.socialId===2);
 assert.equal(seatedSprite.position.y,.95,'ground-sitting pose rests on the bench deck');assert.equal(buddySprite.position.y,.95);
 assert(seatedSprite.position.z>w.PGSocialRules.SEATS[0].z,'sprite stays forward of the backrest');
 assert(Math.abs(buddySprite.position.x-seatedSprite.position.x)>1.2,'two players sit side-by-side on one metal bench');
 scene.removePlayer(2);

 // v269: Game-style player-locked camera (orbit, tilt, zoom — never pans off across the map).
 scene.setCamera({distance:0,pitch:100,panX:100,follow:false,angle:-20*Math.PI});
 assert.equal(scene.cameraState.distance,22);assert.equal(scene.cameraState.pitch,77);assert.equal(scene.cameraState.panX,0);assert.equal(scene.cameraState.follow,true);assert(Math.abs(scene.cameraState.angle)<1e-10);
 scene.resetCamera();frame(now+=100);const pointer=(x,y,id=1,extra={})=>({clientX:x,clientY:y,pointerId:id,button:0,preventDefault(){},...extra});
 // v298 (owner): the left button is walk-only. A left drag must not move the camera at all.
 host.onpointerdown(pointer(200,200));host.onpointermove(pointer(250,240));host.onpointerup(pointer(250,240));
 assert.equal(scene.cameraState.angle,0,'left drag never orbits the plaza camera');assert.equal(scene.cameraState.pitch,45,'left drag never tilts it');assert.equal(scene.cameraState.panX,0);
 // A left click that does not drag still walks (and a left drag is not a click).
 assert.equal(moves.length,0,'a left drag is not a walk');
 // Find open ground the camera can see, then click exactly there.
 const openGround=()=>{for(let r=2;r<=16;r++)for(const s of [[r,0],[0,r],[-r,0],[0,-r],[r*.7,r*.7],[-r*.7,r*.7]]){
  const ok=w.PGSocialRules.walkable(s[0],s[1])&&!Object.values(w.PGSocialRules.SEATS).some(q=>Math.hypot(q.x-s[0],q.z-s[1])<2.5);
  if(ok)return new T.Vector3(s[0],0,s[1]).project(scene.camera)}return null};
 const ground=openGround();assert(ground,'the plaza has open, walkable ground to click');
 clickAt(ground);assert.equal(moves.length,1,'a left click still walks to the point under the pointer');
 // macOS sends ctrl+left instead of a right click - that orbits too.
 scene.resetCamera();moves.length=0;
 host.onpointerdown(pointer(200,200,1,{ctrlKey:true}));host.onpointermove(pointer(260,250,1,{ctrlKey:true}));host.onpointerup(pointer(260,250,1,{ctrlKey:true}));
 assert.notEqual(scene.cameraState.angle,0,'ctrl-drag orbits for trackpads and one-button mice');
 assert.equal(moves.length,0,'ctrl-drag is a camera gesture, not a walk');
 // Touch still drags (there is no right button on a phone).
 scene.resetCamera();host.onpointerdown(pointer(200,200,1,{pointerType:'touch'}));host.onpointermove(pointer(250,240,1,{pointerType:'touch'}));host.onpointerup(pointer(250,240,1,{pointerType:'touch'}));
 assert.notEqual(scene.cameraState.angle,0,'touch drag still orbits');
 scene.resetCamera();moves.length=0;
 scene.resetCamera();host.onpointerdown(pointer(200,200,1,{button:2}));host.onpointermove(pointer(250,240,1,{button:2}));host.onpointerup(pointer(250,240,1,{button:2}));assert.notEqual(scene.cameraState.angle,0,'right-drag orbits instead of map panning');assert.equal(moves.length,0,'right-drag never walks');assert.equal(scene.cameraState.panX,0);
 scene.resetCamera();host.onpointerdown(pointer(200,200));host.onpointerdown(pointer(300,200,2));host.onpointermove(pointer(320,200,2));host.onpointermove(pointer(360,220,2));host.onpointerup(pointer(360,220,2));host.onpointerup(pointer(200,200));assert(scene.cameraState.distance<44);assert.equal(scene.cameraState.panX,0);assert.equal(moves.length,0,'camera gestures do not walk');
 scene.bubble(1,{emotion:'cry'});const bubble=w.document.querySelector('.social-bubble');assert(bubble.classList.contains('social-emotion'));assert.equal(bubble.parentElement.id,'labels');scene.bubble(1,{body:'Hello'});assert(!bubble.classList.contains('social-emotion'));
 // High-refresh frames within 16ms render without dropping, and unchanged sprite frames skip redundant 2D redraws.
 scene.putPlayer({...state,look:{...state.look,refine:0},sit:false});await flush();frame(now+=16);const steadyDraws=draws.length;frame(now+=16);assert.equal(draws.length,steadyDraws,'unchanged sprite frame reuses cached GPU texture');
 frame(now+=7000);assert.equal(bubble.childNodes.length,0,'expired bubble clears once');assert.equal(bubble.hidden,true);
 const startCam=scene.camera.position.clone();scene.putPlayer({...state,sit:false,x:40,z:30});for(let n=0;n<30;n++)frame(now+=100);assert(scene.camera.position.distanceTo(startCam)>5,'locked camera always tracks the player across the plaza');scene.resetCamera();
 scene.clearPlayers();assert.equal(w.document.querySelectorAll('.social-player-label,.social-bubble').length,0);assert.equal(scene.scene.children.some(o=>o.userData.tier),false,'leaving removes the aura');scene.putPlayer(state);await flush();frame(now+=100);assert.equal(w.document.querySelectorAll('.social-player-label').length,1,'reenter restores character');assert.ok(scene.scene.children.some(o=>o.userData.tier===150),'reenter restores the aura')
 // v299 (owner): a show-off now draws once per angler. Two draws of the same catch used to leave
 // two fish and two weight plates stacked on the same spot.
 const spriteCount=()=>scene.scene.children.filter(o=>o.isSprite).length;
 scene.putPlayer(state);await flush();
 const beforeShow=spriteCount();
 scene.fishing.showFish(1,{spId:'whaleshark',w:1800,scale:4.9,label:'1800 kg',ms:5600});
 const afterOne=spriteCount();
 assert(afterOne>beforeShow,'a show-off adds its fish (and weight plate)');
 scene.fishing.showFish(1,{spId:'whaleshark',w:1800,scale:4.9,label:'1800 kg',ms:5600});
 assert.equal(spriteCount(),afterOne,'the second draw for that angler replaces the first instead of stacking');
 const otherBefore=spriteCount();
 scene.fishing.showFish(2,{spId:'manta',w:110,scale:3,label:'110 kg',ms:5600});
 // The pool caps at six shows, so a busy plaza can evict the oldest - one angler's fish must
 // never be swallowed by another's, which is what this checks.
 assert(spriteCount()>=otherBefore+1,'another angler still gets their own fish (and plate, pool permitting)');
 dom.window.close();
 console.log('PASS social scene: download retry, visible sitting fallback, native glow hooks, level aura tiers, follow camera, name anchor and reentry');
})().catch(e=>{console.error(e);process.exitCode=1});
