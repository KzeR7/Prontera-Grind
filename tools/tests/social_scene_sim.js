// Exercise the actual scene lifecycle with Three geometry and controlled asset timing.
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<div id="host"></div><div id="labels"></div>',{runScripts:'outside-only'}),w=dom.window,T={...require('three')};let frame,now=1000,failNormal=true,sitReady=false,draws=[],selectedSeat=null,moves=[],shopOpens=0,indexOpens=0;
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
 // v300: the scene tints the held rod from the fishing module's own tier palette.
 let battleReady=false;const battleAsset={record:{actions:{idle:[0],walking:[0],attack:[0],faint:[0]}}};
 w.PGSocialDigimon={clean:id=>battleReady?id:null,frameIndex:()=>0,draw:()=>{},sharedStore:()=>({ready:()=>battleReady?battleAsset:null,request:()=>Promise.resolve(null)})};
 w.PGSocialFishing={ROD_TIER_COLORS:{twig:'#8b6b45',oak:'#b07a3c',brass:'#c8873a',silver:'#cfd8e0',golden:'#ffcb45',mythril:'#7fe3ff'}};
 w.eval(fs.readFileSync('assets/digimon/roster.js','utf8'));w.eval(fs.readFileSync('assets/social-rules.js','utf8'));w.eval(fs.readFileSync('assets/social-scene.js','utf8'));
 const scene=await w.PGSocialScene.create(host,w.document.getElementById('labels'),{self:()=>1,menu(){},move(x,z){moves.push({x,z})},seat(id){selectedSeat=id},sanctuaryShop(){shopOpens++},sanctuaryIndex(){indexOpens++}}),flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve()};
 const groundPlane=scene.scene.children.find(o=>o.geometry?.parameters?.width===192&&o.geometry?.parameters?.height===218);
 assert(groundPlane&&groundPlane.position.z===27&&groundPlane.position.x===14,'ground extends south and east while retaining the original north and west edges');
 assert(scene.scene.children.some(o=>o.geometry?.parameters?.width===18&&o.geometry?.parameters?.height===218&&o.position.z===27),'north-south road extends south');
 assert(scene.scene.children.some(o=>o.geometry?.parameters?.width===18&&o.geometry?.parameters?.height===192&&o.position.z===0&&o.position.x===14),'east-west road extends to the new eastern edge');
 assert(groundPlane.material.polygonOffset,'ground depth bias keeps the large lake free of distant z-fighting');
 for(const name of ['east','west'])assert(scene.scene.children.some(o=>o.userData.bridgePath===name),'stone bridge approach '+name+' is rendered');
 assert(scene.scene.children.some(o=>o.userData.bridgePathCap),'west path has a finished rounded end');
 for(const tag of ['sanctuaryGym','sanctuaryField','sanctuaryRing'])assert(scene.scene.children.some(o=>o.userData[tag]),tag+' area rendered');
 for(const name of ['power','guard','agility','focus'])assert(scene.scene.children.some(o=>o.userData.sanctuaryStation===name),name+' station rendered');
 for(const [name,x,z] of [['power',59,30],['guard',65,23],['agility',74,25],['focus',84,27]]){assert(w.document.querySelector('[data-station="'+name+'"]'),'world station is a button');assert(w.PGSocialRules.walkable(x,z),'station destination is walkable');assert(w.PGSocialRules.path({x:69,z:35},{x,z}).length,'station destination is reachable from the courtyard')}

 for(const name of ['food','trainer','guide'])assert(scene.scene.children.some(o=>o.userData.sanctuaryKiosk===name),name+' kiosk rendered');
 assert.equal(scene.scene.children.filter(o=>o.userData.sanctuaryTree).length,w.PGSocialRules.SANCTUARY_TREES.length,'outer Sanctuary trees are rendered');
 assert.equal(scene.scene.children.filter(o=>o.userData.sanctuaryTree&&o.userData.nativeGymTree).length,6,'six native trees are behind the gym');
 assert.equal(scene.scene.children.filter(o=>o.userData.gymWindow==='side').length,8,'both gym sides have windows on inside and outside faces');
 assert(scene.scene.children.filter(o=>o.userData.gymTimber==='side-post').length>=20,'both faces of side walls have exposed posts');
 for(const x of [43,95])for(const side of [-1,1])assert(scene.scene.children.some(o=>o.userData.gymTimber==='side-post'&&Math.abs(o.position.x-(x+side*.32))<.001),'posts stand proud on both faces of wall '+x);
 for(const tree of scene.scene.children.filter(o=>o.userData.nativeGymTree)){
  assert(tree.isMesh&&!tree.isSprite&&tree.geometry.type==='BufferGeometry','rear trees use native three-dimensional field geometry');
  const bounds=new T.Box3().setFromObject(tree),wall=w.PGSocialRules.SANCTUARY_GYM_WALLS[tree.position.x<69?0:2],dx=wall.x2-wall.x1,dz=wall.z2-wall.z1,len=Math.hypot(dx,dz);
  for(const x of [bounds.min.x,bounds.max.x])for(const z of [bounds.min.z,bounds.max.z])assert((-(dz)*(x-wall.x1)+dx*(z-wall.z1))/len<-.25,'native canopy stays outside the angled gym wall');
  assert(bounds.max.y<9.5,'native canopy stays below the roof to avoid visible tree/roof clipping');
 }
 assert.equal(scene.scene.children.filter(o=>o.userData.gymMasonry).length,22,'wing foundations have individual masonry blocks');
 assert(scene.scene.children.some(o=>o.userData.gymTimber==='rear-post'&&o.position.z>12.8),'rear posts are visible from the open court');
 for(const [side,count] of [['east',9],['south',9],['corner',3]])assert.equal(scene.scene.children.filter(o=>o.userData.sanctuaryBleacher===side).length,count,'three constructed ring seating tiers at '+side);
 assert(scene.scene.children.some(o=>o.userData.ringCanvas),'ring canvas has a woven surface');
 // v357 map-art pass: native RO species trees, stair-gated ring, pond shadows, soft FX.
 const kinded=w.PGSocialRules.SANCTUARY_TREES.filter(t=>t.kind);
 assert(kinded.length>=18,'shared rules carry mixed-species tree spots');
 const kinds=new Set(scene.scene.children.filter(o=>o.userData.treeKind).map(o=>o.userData.treeKind));
 // v358: the pond wood is cherries only, so morocc palms are no longer placed anywhere;
 // the three remaining species still render from the native RO sets.
 for(const k of ['pine','broad','sakura'])assert(kinds.has(k),k+' species is rendered from the native RO sets');
 assert(!kinds.has('palm'),'the pond wood carries no palms after the sakura-only pass');
 assert(scene.scene.children.filter(o=>o.userData.treeKind).every(o=>o.isMesh&&o.geometry.type==='BufferGeometry'),'species trees use native three-dimensional field geometry');
 assert.equal(scene.scene.children.filter(o=>o.userData.sanctuaryTree).length,w.PGSocialRules.SANCTUARY_TREES.length,'every shared tree renders, native or species');
 // v358 (owner: "remove the dead trees/stumps around the pve grind area"): no stumps remain
 // anywhere in the sanctuary.
 assert(!scene.scene.children.some(o=>o.userData.sanctuaryFieldEdge),'no field-edge stumps remain around the grind field');
 assert(!scene.scene.children.some(o=>o.userData.sanctuaryTrack||o.userData.sanctuaryScarecrow||o.userData.sanctuaryPennant),'the painted circuit, scarecrow and pennants are gone');
 assert(scene.scene.children.some(o=>o.userData.ringRunner),'the west stair mouth wears a runner: the one way onto the ring');
 assert(scene.scene.children.some(o=>o.userData.ringPad==='red'&&o.position.x>68)&&scene.scene.children.some(o=>o.userData.ringPad==='blue'&&o.position.x<68),'ring has red and blue corner pads');
 assert(scene.scene.children.some(o=>o.userData.ringApron),'ring wears an apron skirt');
 assert(scene.scene.children.some(o=>o.userData.sanctuarySign==='CHAMPION RING'),'the ring sign is painted');
 for(const stat of ['power','guard','agility','focus'])assert(scene.scene.children.some(o=>o.userData.gymZone===stat),stat+' training zone mat is laid');
 const deep=[];scene.scene.traverse(o=>{if(o.userData.deepKind)deep.push(o.userData.deepKind)});
 assert(deep.includes('octopus')&&deep.includes('shark'),'octopus and shark shadows swim in the pond');
 assert(scene.scene.children.filter(o=>o.userData.bench!=null).length===w.PGSocialRules.BENCHES.length,'all 19 benches render, including the v356 viewing benches');
 for(let row=0;row<3;row++){const tiers=scene.scene.children.filter(o=>o.userData.bleacherRow===row),h=.55+row*.43;assert.equal(tiers.length,7,'each tier has six boards and a corner');for(const m of tiers)assert(Math.abs(m.position.y-(m.userData.sanctuaryBleacher==='corner'?h+.071:h))<.001,'all bench boards and corner align on a level tier');}

 for(const side of ['left','right']){assert(scene.scene.children.some(o=>o.userData.gymWing===side&&o.geometry.parameters.height>=8),'substantial tall '+side+' wing');assert(scene.scene.children.some(o=>o.userData.gymGable===side),'visible '+side+' gable');assert(scene.scene.children.some(o=>o.userData.gymUpperWall===side),'roof ridge is supported by the '+side+' wall');assert.equal(scene.scene.children.filter(o=>o.userData.sanctuaryBuildingWing===side).length,3,'broad pitched roofs of '+side+' wing')}
 assert.equal(scene.scene.children.filter(o=>o.userData.gymFence).length,w.PGSocialRules.SANCTUARY_GYM_FENCES.length*2,'open-court front fence has matching rails');
 const left=scene.scene.children.find(o=>o.userData.gymWing==='left'),right=scene.scene.children.find(o=>o.userData.gymWing==='right');assert(left.rotation.y>.2&&right.rotation.y<-.2,'both wings are genuinely angled toward the short central connector');
 assert.equal(scene.scene.children.filter(o=>o.userData.gymBroadRoof).length,6,'the two wings each have a wide rear roof and two roofed gable slopes');
 assert.equal(scene.scene.children.filter(o=>o.userData.sanctuaryResident).length,4,'four decorative Digimon are present in the field');
 assert.equal(scene.scene.children.filter(o=>o.userData.sanctuaryRoof).length,10,'angled gym wings and kiosks have broad shingle roofs');
 assert.equal(scene.scene.children.filter(o=>o.userData.sanctuaryBoardwalk).length,10,'angled boardwalk surrounds and links field');
 assert.equal(scene.scene.children.filter(o=>o.userData.sanctuaryFence).length,w.PGSocialRules.SANCTUARY_FENCES.length*2,'each shared field fence has visible rails');
 for(const sign of ['DIGIPET GYM','TRAINER - DIGIPET','FOOD - PET SHOP','FIELD GUIDE - DIGIDEX'])assert(scene.scene.children.some(o=>o.userData.sanctuarySign===sign),sign+' is visibly labeled');
 for(const id of ['coach','food','trainer','guide','ring']){assert(scene.scene.children.some(o=>o.userData.sanctuaryNpc===id),'native NPC sprite '+id+' exists');assert(w.document.querySelector('[data-sanctuary-npc="'+id+'"] button'),'NPC has a talk button')}
 const cook=w.document.querySelector('[data-sanctuary-npc="food"] button');cook.click();const talk=w.document.querySelector('.sanctuary-npc-bubble[data-sanctuary-npc="food"]');assert(!talk.hidden&&talk.textContent.includes('Pet Coins'),'Cook Lina explains the Pet Coin shop');assert.equal(shopOpens,1,'Cook Lina opens the real pet-provisions shop');const guideButton=w.document.querySelector('[data-sanctuary-npc="guide"] button');guideButton.click();assert.equal(indexOpens,1,'Guide Nia opens the roster-backed DigiDex');

 const state={id:1,name:'Synthetic',x:0,z:12,dir:0,sit:true,path:[],look:{cls:'Novice',appearance:{version:1,sex:'m'},refine:10,title:'Poring Hunter',lv:150}};
 scene.active=true;scene.putPlayer(state);await flush();frame(now+=100);assert.equal(draws.length,0);frame(now+=3100);await flush();frame(now+=100);assert(draws.length,'failed download automatically retries without network movement');assert.equal(draws.at(-1)[2],'idle','pending sitting atlas falls back to visible standing sprite');assert.equal(typeof draws.at(-1)[7],'function','native weapon glow hook');assert.equal(typeof draws.at(-1)[8],'function','stowed weapon glow hook');
 sitReady=true;frame(now+=100);await flush();frame(now+=100);assert.equal(draws.at(-1)[2],'sit');
 const before=scene.camera.position.clone();scene.putPlayer({...state,sit:false,x:34,z:25});frame(now+=100);assert(scene.camera.position.x>before.x,'camera follows self');assert(scene.camera.position.z>before.z);const label=w.document.querySelector('.social-player-label');assert.equal(label.hidden,false);const sprite=scene.scene.children.find(o=>o.userData.socialId===1),feet=sprite.position.clone().project(scene.camera);assert(parseFloat(label.style.top)>(1-feet.y)*350,'name starts below feet');assert.equal(label.querySelector('small').textContent,'Poring Hunter');assert(feet.y>.03&&feet.y<.22,'player stands slightly higher than the middle of the screen by default');


 // v225: the field's own level sigil appears under the character and moves with them.
 const aura=scene.scene.children.find(o=>o.userData.tier===150);assert.ok(aura,'Base 150 character has a level aura');assert.equal(aura.position.y,.07);assert.equal(aura.position.x,34);assert.equal(aura.position.z,25);
 const powerLabel=[...w.document.querySelectorAll('.social-sanctuary-label')].find(e=>e.textContent==='POWER');
 scene.putPlayer({...state,sit:false,x:39,z:12});scene.setCamera({angle:-1.1,pitch:35,distance:46});for(let i=0;i<30;i++)frame(now+=100);assert(powerLabel.hidden,'station labels do not show through exterior walls');
 scene.putPlayer({...state,sit:false,x:69,z:29});scene.setCamera({angle:0,pitch:35,distance:46});frame(now+=100);assert(!powerLabel.hidden,'station labels remain visible in the open courtyard');const still=[powerLabel.style.left,powerLabel.style.top];frame(now+=100);assert.deepEqual([powerLabel.style.left,powerLabel.style.top],still,'camera settles immediately when the player stops in the gym');
 // A world-projected label must not chase the pointer while the camera follows.
 const stationPointer=(type,kind)=>{const e=new w.Event(type);Object.defineProperty(e,'pointerType',{value:kind});return e};
 powerLabel.dispatchEvent(stationPointer('pointerenter','mouse'));const pinned=[powerLabel.style.left,powerLabel.style.top];scene.setCamera({angle:.3});frame(now+=100);assert.deepEqual([powerLabel.style.left,powerLabel.style.top],pinned,'hover pins station control during camera movement');
 powerLabel.dispatchEvent(stationPointer('pointerleave','mouse'));frame(now+=100);assert.notDeepEqual([powerLabel.style.left,powerLabel.style.top],pinned,'label resumes world positioning after hover');
 powerLabel.dispatchEvent(stationPointer('pointerdown','touch'));const touched=[powerLabel.style.left,powerLabel.style.top];scene.setCamera({angle:.5});frame(now+=100);assert.deepEqual([powerLabel.style.left,powerLabel.style.top],touched,'touch pins control until release');w.dispatchEvent(stationPointer('pointerup','touch'));frame(now+=100);assert.notDeepEqual([powerLabel.style.left,powerLabel.style.top],touched,'touch release restores world positioning');

 scene.putPlayer({...state,x:0,z:12,look:{...state.look,lv:49}});frame(now+=100);assert.equal(scene.scene.children.some(o=>o.userData.tier),false,'no aura below Base 50');assert.ok(w.auraDisposals>0,'removing a tier disposes its geometry and material');
 scene.putPlayer({...state,x:0,z:12,look:{...state.look,lv:99}});frame(now+=100);assert.ok(scene.scene.children.some(o=>o.userData.tier===99),'the sigil follows the character level tier');

 // v308: the bridge is walkable - the crown of the arch lifts the hero onto the deck (before this
 // the sprite stayed at ground level and the character walked straight through the bridge).
 const bridge=w.PGSocialRules.POND_PROPS[0].bridge;
 scene.putPlayer({...state,sit:false,x:bridge.x-.6,z:bridge.z});frame(now+=100);
 const onBridge=scene.scene.children.find(o=>o.userData.socialId===1);
 assert(onBridge.position.y>bridge.arch&&onBridge.position.y<bridge.arch+.2,'the hero stands on the bridge deck, not inside it');
 scene.putPlayer({...state,sit:false,x:bridge.x-.6,z:bridge.z+7});frame(now+=100);
 assert(scene.scene.children.find(o=>o.userData.socialId===1).position.y<.3,'off the deck the hero is back on the ground');
 scene.putPlayer({...state,sit:false,x:68,z:104});frame(now+=100);assert(scene.scene.children.find(o=>o.userData.socialId===1).position.y>.8,'the player stands above the raised ring canvas');
 // v308: the cascade pours into the pond from its far rim, not from behind the bridge
 for(const [i,fall] of w.PGSocialRules.POND_FALLS.entries()){
  const pond=w.PGSocialRules.PONDS[i];
  assert(fall.z>pond.z,'fall '+i+' sits on the south shore');
  assert(fall.dir===-1&&fall.intoPond,'fall '+i+' runs north into the pond');
 }
 // v308: garden furniture grew to hero scale
 assert(w.PGSocialRules.POND_PROPS[0].bridge.span>=7&&w.PGSocialRules.POND_PROPS[0].bridge.width>=3,'the bridge is wider than the v304 span');

 // v269: 12 physical metal park benches, each seating 2 players side-by-side (24 seats total).
 // v288 adds 8 single-seat angler chairs on the pond rims (seat ids 24-31) => 32 seats.
 assert.equal(w.PGSocialRules.BENCHES.length,19);assert.equal(w.PGSocialRules.CHAIRS.length,8);assert.equal(w.PGSocialRules.SEATS.length,46);
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
 // v358 (owner: "benches cant sit on"): the ring-side viewing benches are wooden and their
 // whole seat answers a click, proving the sit path end to end.
 {
  const wooden=scene.scene.children.find(o=>o.userData.bench===16);
  assert(wooden,'viewing bench 16 renders');
  assert.equal(wooden.type,'Group','the viewing bench is a built wooden group, not the metal model');
  const mats=new Set(wooden.children.map(m=>m.material&&m.material.color&&m.material.color.getHexString()));
  assert(mats.has('7d5c3b')&&mats.has('54402a'),'the viewing bench uses weathered wood tones');
  assert(wooden.children.length>=9,'the bench has legs, seat slats and a backrest');
  const wb=w.PGSocialRules.BENCHES.find(b=>b.id===16),wc=wooden.userData.seatBounds.getCenter(new T.Vector3());
  const wLeft=new T.Vector3(wc.x-.9,wc.y,wc.z).project(scene.camera),wRight=new T.Vector3(wc.x+.9,wc.y,wc.z).project(scene.camera);
  clickAt(wLeft);assert.equal(selectedSeat,wb.seats[0],'clicking the wooden viewing bench selects its first seat');
  scene.putPlayer({id:2,name:'Viewer',x:w.PGSocialRules.SEATS[wb.seats[0]].x,z:w.PGSocialRules.SEATS[wb.seats[0]].z,dir:0,sit:true,seat:wb.seats[0],path:[],look:state.look});
  frame(now+=100);
  const viewer=scene.scene.children.find(o=>o.userData.socialId===2);
  assert.equal(viewer.position.y,.95,'a trainer sits down on the wooden viewing bench');
  scene.removePlayer(2);
  clickAt(wRight);assert.equal(selectedSeat,wb.seats[1],'the padded click pad reaches the second seat too');
 }
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
 // v300 (owner): the rod the character actually holds glows in that rod's own colour.
 const rodGlowMeshes=()=>{const out=[];scene.scene.traverse(o=>{if(o.isMesh&&o.name==='rodGlow'&&o.geometry&&o.geometry.type==='CylinderGeometry')out.push(o)});return out};
 const rodHazeMeshes=()=>{const out=[];scene.scene.traverse(o=>{if(o.isMesh&&o.name==='rodHaze')out.push(o)});return out};
 const rodGlows=()=>rodGlowMeshes().map(o=>'#'+o.material.color.getHexString()+'@'+o.material.opacity.toFixed(2));
 const held=rodGlows();
 assert.equal(held.length,1,'the held rod ships with exactly one glow sleeve');
 // "Obvious" in practice: the sleeve is a fat, see-through shell around the thin pole.
 const sleeve=rodGlowMeshes()[0],shaft=sleeve.parent.children.find(o=>o!==sleeve);
 assert(sleeve.geometry.parameters.radiusTop>=shaft.geometry.parameters.radiusTop*3,'the glow is a shell 3x wider than the rod, not a hairline');
 assert(sleeve.material.transparent===true&&sleeve.material.depthWrite===false,'it reads as light and never occludes the character');
 assert(parseFloat(held[0].split('@')[1])>=.3,'even the starting rod glows');
 assert.equal(rodHazeMeshes().length,1,'the sleeve is wrapped in a wide soft haze');
 assert(rodHazeMeshes()[0].geometry.parameters.radiusTop>=sleeve.geometry.parameters.radiusTop*1.5,'the haze reaches further than the sleeve');
 assert(rodHazeMeshes()[0].material.opacity<parseFloat(held[0].split('@')[1]),'and is fainter, so the light falls off');
 scene.fishing.rod('golden');
 const goldGlow=rodGlows();
 assert.equal(goldGlow.length,1,'repainting the held rod never adds a second sleeve');
 assert.notEqual(goldGlow[0],held[0],'equipping a golden rod visibly repaints the pole in your hand');
 assert(parseFloat(goldGlow[0].split('@')[1])>parseFloat(held[0].split('@')[1]),'a higher tier glows brighter than a twig');
 scene.fishing.rod('mythril');const mythrilGlow=rodGlows()[0];
 assert.notEqual(mythrilGlow,goldGlow[0],'golden and mythril are not the same colour');
 scene.fishing.rod('nonsense');
 assert.equal(rodGlows()[0].split('@')[0],held[0].split('@')[0],'an unknown rod id falls back to the starting wood instead of throwing');
 scene.fishing.rod('twig');
 assert.equal(rodGlows()[0],held[0],'going back to the twig restores its exact colour');
 // Another angler fishing adds their own glowing pole, in their own colour.
 scene.fishing.setRig(7,{on:true,pond:0,x:2,z:10,mode:'wait',rod:'brass'});
 const twoRods=rodGlows();
 assert.equal(twoRods.length,2,'another angler fishing brings their own glow');
 assert.notEqual(twoRods[0],twoRods[1],'two anglers with two rods keep two different colours');
 scene.fishing.setRig(7,{on:true,pond:0,x:2,z:10,mode:'wait',rod:'silver'});
 const silvered=rodGlows();
 assert.equal(silvered.length,2,'changing rods repaints that angler instead of stacking sleeves');
 assert(!silvered.includes(twoRods.find(c=>!held.includes(c))),'the old brass colour is gone once that angler swaps');
 scene.fishing.setRig(7,{on:false});
 assert.equal(rodGlows().length,1,'reeling in removes the other rod and its glow');
 assert.equal(rodGlows()[0],held[0],'and leaving your own rod untouched');
 // Is it actually *obvious*? Project the glow shell at the plaza camera and measure it on screen.
 const pond=w.PGSocialRules.PONDS[0];
 scene.putPlayer({...state,sit:false,x:pond.x,z:pond.z-pond.d/2-1.7,dir:0});
 frame(now+=100);
 scene.fishing.cast({x:pond.x,z:pond.z},400,()=>{});
 for(let i=0;i<8;i++)frame(now+=100);
 scene.camera.updateMatrixWorld();scene.scene.updateMatrixWorld(true);
 const shell=rodGlowMeshes()[0],shellBox=new T.Box3().setFromObject(shell);
 assert(shell.parent.visible===true,'the pole and its glow are shown while the line is out');
 assert(shell.parent.scale.y>1,'the glow is stretched along the rod with the blank');
 const screenPts=[];
 for(const x of [shellBox.min.x,shellBox.max.x])for(const y of [shellBox.min.y,shellBox.max.y])for(const z of [shellBox.min.z,shellBox.max.z]){
  const v=new T.Vector3(x,y,z).project(scene.camera);
  if(v.z<1)screenPts.push({x:(v.x+1)*500,y:(1-v.y)*350});
 }
 assert(screenPts.length===8,'the held glow is in front of the camera');
 const widest=Math.max(Math.max(...screenPts.map(p=>p.x))-Math.min(...screenPts.map(p=>p.x)),Math.max(...screenPts.map(p=>p.y))-Math.min(...screenPts.map(p=>p.y)));
 assert(widest>=26,'the glow covers at least '+Math.round(widest)+' px on a 1000x700 plaza view, so it is visible without leaning in');
 console.log('   rod glow on screen: '+Math.round(widest)+' px across at the plaza camera');

 // v311 (owner): the pond chairs are Japanese-styled and actually clickable from the rim.
 {
  const pond=w.PGSocialRules.PONDS[0];
  scene.putPlayer({...state,sit:false,seat:null,path:[],x:pond.x,z:pond.z+pond.d/2+7,dir:4});
  for(let i=0;i<6;i++)frame(now+=100);
  scene.camera.updateMatrixWorld();scene.scene.updateMatrixWorld(true);
  for(const c of w.PGSocialRules.CHAIRS){
   const g=scene.scene.children.find(o=>o.userData.seat===c.id),box=new T.Box3().setFromObject(g),size=box.getSize(new T.Vector3());
   assert(size.x>1&&size.y>1.05,'chair '+c.id+' is a full Japanese seat, not a stool ('+size.x.toFixed(2)+' x '+size.y.toFixed(2)+')');
   const ndc=box.getCenter(new T.Vector3()).project(scene.camera);
   if(Math.abs(ndc.x)>1||Math.abs(ndc.y)>1)continue;
   selectedSeat=null;clickAt(ndc);
   assert.equal(selectedSeat,c.id,'clicking chair '+c.id+' sits on it');
  }
  // A hand's width off the seat still counts: the pad is padded, not pixel-hunting.
  const chair=w.PGSocialRules.CHAIRS.find(c=>c.z>pond.z)||w.PGSocialRules.CHAIRS[0];
  const cg=scene.scene.children.find(o=>o.userData.seat===chair.id),cb=new T.Box3().setFromObject(cg).getCenter(new T.Vector3());
  const off=new T.Vector3(cb.x+.55,cb.y,cb.z+.35).project(scene.camera);
  if(Math.abs(off.x)<=1&&Math.abs(off.y)<=1){selectedSeat=null;clickAt(off);assert.equal(selectedSeat,chair.id,'a near miss on the rim still sits you down')}
  // v311: a line in the water turns the angler to the bobber for every viewer.
  scene.putPlayer({...state,sit:false,seat:null,path:[],x:pond.x,z:pond.z+pond.d/2+1.7,dir:0,fish:{on:true,pond:0,x:pond.x,z:pond.z,mode:'wait',rod:'twig'}});
  frame(now+=100);
  const facing=draws.at(-1)[3],offset=Math.round(scene.cameraState.angle/(Math.PI/4));
  assert.equal(facing,(4+offset+8)%8,'the angler faces north, into the pond, whatever dir the walk left behind');
  scene.putPlayer({...state,fish:{on:false}});
  scene.fishing.off();
 }
 // v344: live field/ring snapshots own separate world sprites and suppress idle residents only
 // during grinding. The fake asset keeps this a geometry/lifecycle test, not an image audit.
 // v350: the shared battle module classifies presentation ranges; this geometry test stubs
 // a deterministic classifier (Biyomon skirmishes, everyone else brawls).
 w.PGDigimonBattle={attackRange:form=>({ranged:form==='biyomon',range:form==='biyomon'?4.2:1.8})};
 battleReady=true;scene.setBattleState({pve:[{id:'pve-test',owner:1,slot:0,wave:2,phase:'fighting',profile:{form:'agumon'},partner:{form:'agumon',hp:80,maxHp:100},enemies:[{id:'e0',form:'agumon',hp:40,maxHp:50},{id:'e1',form:'palmon',hp:40,maxHp:50},{id:'e2',form:'biyomon',hp:40,maxHp:50}]}],pvp:null});frame(now+=100);
 assert.equal(scene.scene.children.filter(o=>o.userData.battleKind==='pve').length,4,'partner and three bot sprites are rendered');assert(scene.scene.children.filter(o=>o.userData.sanctuaryResident).every(o=>!o.visible),'idle residents are hidden during grinding');
 const farmSprites=scene.scene.children.filter(o=>o.userData.battleKind==='pve'),enemySprites=farmSprites.filter(o=>o.userData.battleRole==='enemy'),partnerSprite=farmSprites.find(o=>o.userData.battleRole==='partner');
 assert.deepEqual(enemySprites.map(o=>o.userData.battleName).sort(),['Agumon','Biyomon','Palmon'],'farm bots show species names instead of generic wave labels');assert.equal(new Set(enemySprites.map(o=>JSON.stringify(o.userData.battleSpawn))).size,3,'each bot receives a distinct stable random-looking spawn');
 const partnerBefore=partnerSprite.position.clone(),enemyBefore=enemySprites.map(o=>o.position.clone());frame(now+=500);assert(partnerSprite.position.distanceTo(partnerBefore)>2,'the partner runs toward its opponent at the faster farm animation speed');assert(partnerSprite.position.distanceTo(partnerBefore)<=3.21,'a delayed frame cannot teleport the partner beyond its capped travel budget');enemySprites.forEach((o,i)=>assert(o.position.distanceTo(enemyBefore[i])>2,'each living bot runs toward the partner rather than remaining in a fixed row'));
 for(let i=0;i<40;i++)frame(now+=100);
 const dist=o=>Math.hypot(o.position.x-partnerSprite.position.x,o.position.z-partnerSprite.position.z),rangedSprite=enemySprites.find(o=>o.userData.battleName==='Biyomon'),meleeSprites=enemySprites.filter(o=>o!==rangedSprite);
 assert(Math.min(...meleeSprites.map(dist))>1.9&&Math.min(...meleeSprites.map(dist))<3.0,'v354 brawlers keep a readable gap instead of overlapping the partner: '+meleeSprites.map(dist).map(x=>x.toFixed(2)));
 assert(dist(rangedSprite)>4,'the quick ranged form skirmishes from a distance: '+dist(rangedSprite).toFixed(2));
 for(let i=0;i<enemySprites.length;i++)for(let j=i+1;j<enemySprites.length;j++)assert(Math.hypot(enemySprites[i].position.x-enemySprites[j].position.x,enemySprites[i].position.z-enemySprites[j].position.z)>4.2,'farm bots occupy separated attack slots instead of clumping');
 partnerSprite.position.set(58,.06,60);const retargetBefore=partnerSprite.position.clone();scene.setBattleState({pve:[{id:'pve-test',owner:1,slot:0,wave:3,phase:'fighting',profile:{form:'agumon'},partner:{form:'agumon',hp:80,maxHp:100},enemies:[{id:'w3-e0',form:'agumon',hp:40,maxHp:50},{id:'w3-e1',form:'palmon',hp:40,maxHp:50},{id:'w3-e2',form:'gabumon',hp:40,maxHp:50}]}],pvp:null});frame(now+=100);assert(partnerSprite.position.distanceTo(retargetBefore)<=.65,'a new wave retargets from the current position without an elapsed-time teleport');
 // v350 boss waves: one oversized gold-ringed boss with a BOSS nameplate, and quick ranged
 // attackers fire a visible travelling shot instead of only bumping into each other.
 scene.setBattleState({pve:[{id:'pve-test',owner:1,slot:0,wave:5,phase:'fighting',profile:{form:'agumon'},partner:{form:'agumon',hp:80,maxHp:100,attackAt:0,hitAt:0},enemies:[{id:'w5-boss',form:'greymon',hp:120,maxHp:300,boss:true,attackAt:0,hitAt:0}]}],pvp:null});frame(now+=100);
 const bossSprite=scene.scene.children.find(o=>o.userData.battleBoss);
 assert(bossSprite,'the boss sprite is flagged for oversized presentation');assert.equal(bossSprite.userData.battleName,'BOSS · Greymon','the boss wears a BOSS nameplate');
 assert(bossSprite.scale.x>partnerSprite.scale.x*1.4,'the boss renders visibly larger than a normal fighter');
 const bossRing=scene.scene.children.find(o=>o!==bossSprite&&Math.abs(o.position.x-bossSprite.position.x)<.6&&Math.abs(o.position.z-bossSprite.position.z)<.6&&o.material&&o.material.color);
 assert(bossRing&&bossRing.material.color.getHex()===0xe8a54a,'the boss stands on a gold accent ring');
 assert(!scene.scene.children.some(o=>o.userData.battleShot),'melee fighters fire no projectiles');
 scene.setBattleState({pve:[{id:'pve-test',owner:1,slot:0,wave:5,phase:'fighting',profile:{form:'agumon'},partner:{form:'biyomon',hp:80,maxHp:100,attackAt:1,hitAt:0},enemies:[{id:'w5-boss',form:'greymon',hp:120,maxHp:300,boss:true,attackAt:0,hitAt:0}]}],pvp:null});frame(now+=100);
 assert(scene.scene.children.some(o=>o.userData.battleShot),'a quick ranged attacker fires a visible projectile');
 frame(now+=400);assert(!scene.scene.children.some(o=>o.userData.battleShot),'the projectile expires after its flight');
 // v352/v357 FX: every landed strike answers with a soft-light burst - radial glows,
 // rotating streaks and star sparkles, never square pixels - plus a floating damage number
 // and a defender shake; crits add a contact freeze and a soft shockwave; faints puff dust.
 {
  const bursts=()=>scene.scene.children.filter(o=>o.userData.battleBurst),popups=()=>scene.scene.children.filter(o=>o.userData.battlePopup),waves=()=>scene.scene.children.filter(o=>o.userData.battleShockwave),ghosts=()=>scene.scene.children.filter(o=>o.userData.battleGhost);
  frame(now+=500);assert.equal(bursts().length,0,'no FX linger once the field is quiet');
  assert.equal(scene.battleEvent({kind:'pve',battleId:'missing',to:'nobody',amount:5,crit:false}),false,'FX for an unknown unit are refused');
  const bossSprite=scene.scene.children.find(o=>o.userData.battleBoss);
  for(let i=0;i<20;i++)frame(now+=100);
  const settled={x:bossSprite.position.x,z:bossSprite.position.z};
  assert.equal(scene.battleEvent({kind:'pve',battleId:'pve-test',to:'w5-boss',amount:12,crit:false}),true,'a strike on a live unit lands its FX');
  frame(now+=40);
  assert.equal(popups().length,1,'the damage number floats above the defender');assert.equal(popups()[0].userData.battlePopupText,'12');assert.equal(popups()[0].userData.battlePopupCrit,false);
  assert.equal(bursts().length,11,'a normal hit bursts eleven soft sparks');assert.equal(waves().length,0,'normal hits send no shockwave');
  let shook=false;for(let i=0;i<3;i++){frame(now+=40);const off=Math.hypot(bossSprite.position.x-settled.x,bossSprite.position.z-settled.z);if(off>.01)shook=true;assert(off<=.26,'the shake stays inside its amplitude: '+off)}
  assert(shook,'the hit shakes the defending boss sprite');
  frame(now+=600);assert.equal(popups().length,0,'the damage number expires');assert.equal(bursts().length,0,'the burst particles expire');
  assert.equal(scene.battleEvent({kind:'pve',battleId:'pve-test',to:'w5-boss',amount:30,crit:true}),true,'a critical strike lands its FX');
  frame(now+=40);
  assert.equal(popups().length,1);assert.equal(popups()[0].userData.battlePopupText,'30!');assert.equal(popups()[0].userData.battlePopupCrit,true,'crits mark their damage number');
  assert.equal(waves().length,1,'crits ring a shockwave');assert(bursts().length>=12,'crits burst harder');
  frame(now+=900);assert.equal(waves().length,0,'the shockwave expires');
  // After-images trail a lunging brawler: the melee boss lunges on attack, ghosts echo it.
  scene.setBattleState({pve:[{id:'pve-test',owner:1,slot:0,wave:5,phase:'fighting',profile:{form:'agumon'},partner:{form:'biyomon',hp:80,maxHp:100,attackAt:0,hitAt:0},enemies:[{id:'w5-boss',form:'greymon',hp:120,maxHp:300,boss:true,attackAt:2,hitAt:0}]}],pvp:null});frame(now+=100);frame(now+=120);
  assert(ghosts().length>=2,'a brawler carries after-image ghosts');
  assert(ghosts().filter(g=>g.visible).length>=2,'the brawler lunge echoes in its after-images');
  assert(ghosts().every(g=>g.visible||Math.hypot(g.position.x-scene.scene.children.find(o=>o.userData.battleRole==='partner').position.x,g.position.z-scene.scene.children.find(o=>o.userData.battleRole==='partner').position.z)<1.5),'a ranged form never shows after-images — stale ghosts stay hidden');
  scene.setBattleState({pve:[{id:'pve-test',owner:1,slot:0,wave:5,phase:'fighting',profile:{form:'agumon'},partner:{form:'biyomon',hp:80,maxHp:100,attackAt:0,hitAt:0},enemies:[{id:'w5-boss',form:'greymon',hp:120,maxHp:300,boss:true,attackAt:2,hitAt:0}]}],pvp:null});frame(now+=600);
  assert(ghosts().every(g=>!g.visible),'ghosts hide once the lunge is over');
  // A faint puffs dust; a boss faint bursts gold with a shockwave.
  scene.setBattleState({pve:[{id:'pve-test',owner:1,slot:0,wave:5,phase:'fighting',profile:{form:'agumon'},partner:{form:'biyomon',hp:80,maxHp:100,attackAt:0,hitAt:0},enemies:[{id:'w5-boss',form:'greymon',hp:0,maxHp:300,boss:true,attackAt:0,hitAt:0}]}],pvp:null});frame(now+=40);
  assert(bursts().length>=16,'the boss faint bursts gold');assert.equal(waves().length,1,'the boss faint rings a shockwave');
  frame(now+=800);assert.equal(bursts().length,0);assert.equal(waves().length,0);
 }
 scene.setBattleState({pve:[],pvp:{id:'pvp-test',phase:'fighting',winnerId:null,participants:[{id:1,name:'One',side:'left',unit:{form:'agumon',hp:80,maxHp:100}},{id:2,name:'Two',side:'right',unit:{form:'palmon',hp:70,maxHp:100}}]}});frame(now+=100);assert.equal(scene.scene.children.filter(o=>o.userData.battleKind==='pvp').length,2,'two accepted ring fighters are rendered');const ringFighters=scene.scene.children.filter(o=>o.userData.battleKind==='pvp');for(let i=0;i<12;i++)frame(now+=100);const ringDistance=Math.hypot(ringFighters[0].position.x-ringFighters[1].position.x,ringFighters[0].position.z-ringFighters[1].position.z);assert(ringDistance>4.2&&ringDistance<4.6,'ring fighters approach opposite marks without clumping');assert(scene.scene.children.filter(o=>o.userData.sanctuaryResident).every(o=>o.visible),'residents return when PvE ends');
 assert.equal(scene.battleEvent({kind:'pvp',battleId:'pvp-test',to:1,amount:9,crit:false}),true,'ring strikes land their FX too');frame(now+=40);assert(scene.scene.children.some(o=>o.userData.battlePopup&&o.userData.battlePopupText==='9'),'the ring damage number floats');
 scene.setBattleState({pve:[],pvp:null});assert.equal(scene.scene.children.filter(o=>o.userData.battleKind).length,0,'battle sprites are disposed when the room clears');
 dom.window.close();
 console.log('PASS social scene: v300 per-tier rod glow, download retry, visible sitting fallback, native glow hooks, level aura tiers, follow camera, name anchor, reentry, live battle sprite lifecycle, v357 soft-light strike FX, native RO species trees and the stair-gated ring');
})().catch(e=>{console.error(e);process.exitCode=1});
