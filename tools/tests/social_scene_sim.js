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
 assert(scene.scene.children.filter(o=>o.userData.bench!=null).length===w.PGSocialRules.BENCHES.length,'all shared benches render, including the v356 gym and field benches');
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
 assert.equal(w.PGSocialRules.BENCHES.length,15);assert.equal(w.PGSocialRules.CHAIRS.length,8);
 // v359: the four ringside wooden benches are gone; the bleacher rows (46-111) carry the
 // ring seating, and ids 32-39 retired with the removed benches.
 const seatList=w.PGSocialRules.SEATS.filter(Boolean);assert.equal(seatList.length,120,'15 benches (30 seats) + 8 chairs + 66 bleacher seats + 16 Aetherwell bench seats');
 for(let i=32;i<=39;i++)assert(!w.PGSocialRules.SEATS[i],'retired ringside seat '+i+' is gone');
 assert.equal(w.PGSocialRules.SEATS[46].x,82);assert.equal(w.PGSocialRules.SEATS[46].height||w.PGSocialRules.SEATS[46].rowHeight,.62);assert.equal(w.PGSocialRules.SEATS[111].z,116);
 // v361: the Aetherwell's own bench ring - eight benches every 45 degrees, measured from the
 // model export at scene scale .62 (model radius 12.81 -> world 7.94), seats on walkable tiles.
 assert.equal(w.PGSocialRules.FOUNTAIN_BENCHES.length,16);
 for(const seat of w.PGSocialRules.FOUNTAIN_BENCHES){
  assert(w.PGSocialRules.walkable(seat.x,seat.z)&&seat.bench>=220&&seat.bench<228&&Math.abs(seat.height-.649)<.001,'Aetherwell seat '+seat.id+' sits on the bench ring at bench height');
  assert(Math.hypot(seat.x,seat.z)>7.7&&Math.hypot(seat.x,seat.z)<8.3,'Aetherwell seat '+seat.id+' lies on the measured bench radius');
 }
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
 // v359 (owner: "no wood chairs at the ring - the L-shaped stands are the seats"): the
 // gym and field benches stay wooden, and the bleacher tiers are click-sittable end to end.
 {
  assert(!scene.scene.children.some(o=>o.userData.bench===16||o.userData.bench===17||o.userData.bench===18||o.userData.bench===19),'the four ringside wooden benches are gone');
  const wooden=scene.scene.children.find(o=>o.userData.bench===20);
  assert(wooden&&wooden.type==='Group','the gym bench is still a built wooden group');
  const mats=new Set(wooden.children.map(m=>m.material&&m.material.color&&m.material.color.getHexString()));
  assert(mats.has('7d5c3b')&&mats.has('54402a'),'the gym bench uses weathered wood tones');
  // The L-shaped stands: every tier is a long sitting row of walkable boards.
  for(const row of w.PGSocialRules.BLEACHER_ROWS){
   assert(row.seats.length>=9,'row '+row.side+row.row+' carries a long sitting row');
   for(const seat of row.seats){assert(w.PGSocialRules.walkable(seat.x,seat.z),'bleacher seat stands on walkable boards');assert(w.PGSocialRules.path({x:60,z:104},seat).length,'bleacher seat is reachable from the ring walkway')}
  }
  assert(!w.PGSocialRules.walkable(85.25,104)&&!w.PGSocialRules.walkable(66.65,117.25),'the low rear walls keep walkers off the back of the stands');
  // Clicking a tier picks its seat; sitting rests on the board tops, standing climbs them.
  const first=w.PGSocialRules.SEATS[46],top=w.PGSocialRules.SEATS[111];
  const pt=new T.Vector3(first.x,.62,first.z).project(scene.camera);
  clickAt(pt);assert.equal(selectedSeat,46,'clicking the front east tier selects its first bleacher seat');
  scene.putPlayer({id:2,name:'Viewer',x:first.x,z:first.z,dir:first.dir,sit:true,seat:46,path:[],look:state.look});
  frame(now+=100);
  const viewer=scene.scene.children.find(o=>o.userData.socialId===2);
  assert.equal(viewer.position.y,.62,'a trainer sits on the front bleacher tier');
  scene.putPlayer({id:2,name:'Climber',x:top.x,z:top.z,dir:top.dir,sit:false,seat:null,path:[],look:state.look});
  frame(now+=100);
  const climber=scene.scene.children.find(o=>o.userData.socialId===2);
  assert(Math.abs(climber.position.y-(.06+1.48))<.01,'standing feet climb to the top tier');
  scene.removePlayer(2);
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
 // v384 (owner: "the PvE animation is still too fast and messy"): field fights are staged - the
 // party and the wave hold facing columns, the sides take turns, and a strike is shown when the
 // swing that carries it arrives. Every snapshot below is built by one helper so each step states
 // only what it changes; `step` advances the scene clock in 20 ms frames.
 {
  const fieldRun=(wave,partner,enemies)=>({pve:[{id:'pve-test',owner:1,slot:0,wave,phase:'fighting',profile:{form:'agumon'},partner:{form:'agumon',hp:80,maxHp:100,attackAt:0,hitAt:0,...partner},enemies:enemies.map(e=>({hp:40,maxHp:50,attackAt:0,hitAt:0,...e}))}],pvp:null});
  const step=(ms,each)=>{for(let t=0;t<ms;t+=20){frame(now+=20);if(each)each(t+20)}},flat=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  // v398: a wave now RUNS IN, so anything that measures where a fighter stands has to let it arrive
  // first. This steps until no unit is still entering (capped), so a formation assertion is never
  // taken against a bot that is halfway across the field.
  const settle=(cap=6000)=>{
   let t=0;
   // wait until nobody is still entering...
   while(t<cap&&scene.scene.children.some(o=>o.userData.battleKind&&o.userData.battleEntering)){frame(now+=20);t+=20}
   // ...and then until every fighter is back on the slot it owns, so a formation assertion is never
   // taken mid-swing (a staged swing takes a fighter off its slot by design).
   let g=0;
   while(g<cap&&scene.scene.children.some(o=>o.userData.battleKind==='pve'&&flat(o.position,o.userData.battleSpawn)>.35)){frame(now+=20);t+=20;g+=20}
   return t;
  };
  const field=()=>scene.scene.children.filter(o=>o.userData.battleKind==='pve'),role=name=>field().filter(o=>o.userData.battleRole===name),named=name=>field().find(o=>o.userData.battleName===name);
  const bursts=()=>scene.scene.children.filter(o=>o.userData.battleBurst),popups=()=>scene.scene.children.filter(o=>o.userData.battlePopup),waves=()=>scene.scene.children.filter(o=>o.userData.battleShockwave),ghosts=()=>scene.scene.children.filter(o=>o.userData.battleGhost),shots=()=>scene.scene.children.filter(o=>o.userData.battleShot),leaving=()=>scene.scene.children.filter(o=>o.userData.battleLeaving);
  // A unit's slot is where it was spawned; a number belongs to the unit it floats over.
  const off=o=>flat(o.position,o.userData.battleSpawn),numbersOn=o=>popups().filter(p=>flat(p.position,o.userData.battleSpawn)<1).map(p=>p.userData.battlePopupText);
  const wave2=(partner,e0={},e1={},e2={})=>fieldRun(2,partner,[{id:'e0',form:'agumon',...e0},{id:'e1',form:'palmon',...e1},{id:'e2',form:'biyomon',...e2}]);
  battleReady=true;scene.setBattleState(wave2({}));frame(now+=20);
  assert.equal(field().length,4,'partner and three bot sprites are rendered');assert(scene.scene.children.filter(o=>o.userData.sanctuaryResident).every(o=>!o.visible),'idle residents are hidden during grinding');
  const enemySprites=role('enemy'),partnerSprite=role('partner')[0],rangedSprite=named('Biyomon'),meleeSprites=enemySprites.filter(o=>o!==rangedSprite),palmon=named('Palmon');
  assert.deepEqual(enemySprites.map(o=>o.userData.battleName).sort(),['Agumon','Biyomon','Palmon'],'farm bots show species names instead of generic wave labels');assert.equal(new Set(enemySprites.map(o=>JSON.stringify(o.userData.battleSpawn))).size,3,'each bot receives a distinct stable slot');
  // v398 (owner: "random spawn pve grind... spawn randomly on the farm then battle"): a new wave now
  // ENTERS from the field instead of blinking onto its slots. Each bot starts away from the slot it
  // owns, walks in, and is not in the fight until it arrives.
  assert(enemySprites.every(o=>o.material.opacity<.2),'a new wave still fades in as it enters');
  // Each bot enters from its OWN point out in the field, not from the slot it will fight on, and
  // those entry points differ from each other - that is the "spawns randomly" the owner asked for.
  const entries=enemySprites.map(o=>o.userData.battleEntered);
  assert(entries.every(Boolean),'every bot records where it entered');
  const fromSlot=entries.map((e,i)=>Math.hypot(e.x-enemySprites[i].userData.battleSpawn.x,e.z-enemySprites[i].userData.battleSpawn.z));
  assert(fromSlot.every(d=>d>5),'each bot enters from out in the field, not on its slot: '+fromSlot.map(d=>d.toFixed(1)));
  assert(new Set(entries.map(e=>e.x.toFixed(2)+','+e.z.toFixed(2))).size===entries.length,'no two bots enter from the same point');
  assert(enemySprites.every(o=>o.userData.battleStance==='walking'||o.material.opacity<.2),'an entering bot is drawn walking in');
  // The puff is the ARRIVAL, not the spawn: nothing has burst yet while they are still on their way.
  assert.equal(bursts().length,0,'no arrival puff while the wave is still running in');
  // Watch the arrival itself: the puff is short-lived (420 ms), so it is caught on the frame the
  // unit lands rather than after the whole step.
  let sawArrivalPuff=false,arriveMs=null;
  // The run-in is bounded by STAGE.RUNIN_MS measured from a unit's first frame WITH ART, so a slow
  // sprite load delays the walk rather than truncating it. Give the window room for that.
  step(5000,t=>{
   if(!sawArrivalPuff&&bursts().length){sawArrivalPuff=true;arriveMs=t;assert.ok(bursts().length>=5,'the arrival puff is a small burst: '+bursts().length)}
  });
  assert(sawArrivalPuff,'a bot puffs when it ARRIVES on its slot');
  assert(arriveMs>150,'the run-in takes a moment instead of blinking in: '+arriveMs+' ms');
  assert(field().every(o=>o.material.opacity===1),'the entry fade is over');
  // Let any fighter still finishing its walk reach its slot (the run-in is bounded by RUNIN_MS).
  // step() advances the sim clock; calling frame() from this scope would leave `now` frozen.
  step(3000);
  const offSlotEnd=enemySprites.map(o=>Math.hypot(o.position.x-o.userData.battleSpawn.x,o.position.z-o.userData.battleSpawn.z));
  assert(offSlotEnd.every(d=>d<.35),'every bot reaches the slot it owns: '+offSlotEnd.map(d=>d.toFixed(2)));
  // And the puff expires, so the field is clean before the fight starts.
  step(600);
  assert.equal(bursts().length,0,'the arrival puffs expire');
  // Formation: party on the west of the lane, wave across the aisle, rows apart, ranged a step back.
  assert(enemySprites.every(o=>o.position.x-partnerSprite.position.x>=4.2),'the wave lines up across an aisle from the party: '+enemySprites.map(o=>(o.position.x-partnerSprite.position.x).toFixed(2)));
  for(let i=0;i<enemySprites.length;i++)for(let j=i+1;j<enemySprites.length;j++)assert(Math.abs(enemySprites[i].position.z-enemySprites[j].position.z)>=2.4,'farm bots occupy separated slots instead of clumping');
  assert(rangedSprite.position.x>Math.max(...meleeSprites.map(o=>o.position.x))+.5,'the quick ranged form stands a step behind the brawlers');
  assert(flat(rangedSprite.position,partnerSprite.position)>4,'the quick ranged form skirmishes from a distance: '+flat(rangedSprite.position,partnerSprite.position).toFixed(2));
  // v359/v373 asked for calm: with no strike reported nobody moves at all.
  step(1500,()=>field().forEach(o=>{assert(off(o)<1e-9,'a fighter with nothing to do holds its slot');assert.equal(o.userData.battleStance,'idle');assert.equal(o.userData.battleWalking,false)}));

  // --- one reported strike = one swing, and its number waits for the blow ---
  assert.equal(scene.battleEvent({kind:'pve',battleId:'missing',to:'nobody',amount:5,crit:false}),false,'FX for an unknown unit are refused');
  assert.equal(scene.battleEvent({kind:'pve',battleId:'pve-test',to:'e1',amount:12,crit:false}),true,'a strike on a live unit is accepted');
  scene.setBattleState(wave2({attackAt:1},{},{hp:28}));
  let closest=Infinity,furthest=0,landed=0,home=0,echoed=false,stride=0,sparks=0,before=partnerSprite.position.clone();
  step(1400,t=>{
   closest=Math.min(closest,flat(partnerSprite.position,palmon.userData.battleSpawn));furthest=Math.max(furthest,off(partnerSprite));stride=Math.max(stride,flat(partnerSprite.position,before));before=partnerSprite.position.clone();
   if(ghosts().filter(g=>g.visible).length>=2)echoed=true;
   if(!landed&&popups().length){landed=t;sparks=bursts().length;assert.equal(partnerSprite.userData.battleStance,'attack','the number appears while the attacker is mid-swing');assert(flat(partnerSprite.position,palmon.userData.battleSpawn)<closest+.05,'the number appears when the attacker is at its closest')}
   if(!landed)assert.equal(popups().length,0,'the number waits for the blow to arrive');
   if(landed&&!home&&off(partnerSprite)<1e-9)home=t;
   for(const o of enemySprites)if(o!==palmon)assert(off(o)<1e-9,'bystanders hold their slots while a neighbour is struck');
  });
  assert(furthest>1.2,'the brawler steps in to its target: '+furthest.toFixed(2));
  assert(closest>1.9&&closest<3.0,'v354/v373 brawlers stop at arm\'s length instead of overlapping their target: '+closest.toFixed(2));
  assert(landed>=240&&landed<=520,'the blow connects after a readable step in: '+landed+' ms');assert.deepEqual(numbersOn(palmon),[],'the damage number expires (v373 popup lasts 1050 ms)');
  assert(home>=650,'a whole swing - in, connect, back - takes long enough to read (v359/v373 "too fast to see"): '+home+' ms');
  assert(stride<=.3,'a delayed frame cannot teleport a fighter: at most '+stride.toFixed(3)+' units per 20 ms');
  assert(echoed,'the brawler step-in echoes in its after-images');assert(ghosts().every(g=>!g.visible),'ghosts hide once the swing is over');
  assert.equal(sparks,8,'a normal field hit bursts eight soft sparks (v384 calmer hits)');assert.equal(waves().length,0,'a normal field hit sends no shockwave');
  assert.equal(partnerSprite.userData.battleStance,'idle');

  // --- the sides take turns ---
  // One sim tick reports a partner strike and the whole wave's retaliation together. The partner
  // went last, so the wave goes first; the partner steps out only once every blow of it has landed.
  for(const [to,amount] of [['e1',12],['partner',5],['partner',6],['partner',7]])scene.battleEvent({kind:'pve',battleId:'pve-test',to,amount,crit:false});
  scene.setBattleState(wave2({attackAt:2,hp:62},{attackAt:1},{attackAt:1,hp:16},{attackAt:1}));
  let waveOut=0,partnerOut=0,lastOnPartner=0,onPalmon=0,sawShot=false,total='';
  step(2600,t=>{
   // A turn starts when a fighter takes its attack stance (a struck unit only shakes on its slot).
   if(!waveOut&&enemySprites.some(o=>o.userData.battleStance==='attack'))waveOut=t;
   if(!partnerOut&&partnerSprite.userData.battleStance==='attack')partnerOut=t;
   if(!partnerOut)assert(off(partnerSprite)<=.26,'a struck partner only shakes on its slot until its own turn');
   if(shots().length)sawShot=true;
   const mine=numbersOn(partnerSprite);if(mine.length&&mine[0]!==total){total=mine[0];lastOnPartner=t}
   if(!onPalmon&&numbersOn(palmon).length)onPalmon=t;
   assert(off(rangedSprite)<1e-9,'a ranged form never leaves its slot');
   if(partnerOut&&!onPalmon)assert(meleeSprites.every(o=>off(o)<1e-9&&o.userData.battleStance==='idle'),'every brawler of the wave is back on its slot before the partner steps out');
  });
  assert(waveOut&&partnerOut&&waveOut<partnerOut,'the wave swings first when the partner went last: '+waveOut+' < '+partnerOut);
  assert.equal(total,'18','three blows on one target read as one running number, not three stacked ones');
  assert(sawShot,'the ranged bot answers with a visible projectile');
  assert(lastOnPartner<partnerOut,'the partner steps out only after every blow of the wave has landed: '+lastOnPartner+' < '+partnerOut);
  assert(onPalmon-lastOnPartner>=300,'a clear beat separates the two sides: '+(onPalmon-lastOnPartner)+' ms');
  assert(field().every(o=>off(o)<1e-9&&o.userData.battleStance==='idle'),'everyone is back on their slot when the exchange is over');

  // --- strikes reported faster than a fighter can swing ride in one swing, with their true sum ---
  scene.battleEvent({kind:'pve',battleId:'pve-test',to:'e0',amount:12,crit:false});scene.battleEvent({kind:'pve',battleId:'pve-test',to:'e0',amount:30,crit:true});
  scene.setBattleState(wave2({attackAt:4,hp:62},{attackAt:1,hp:8},{attackAt:1,hp:16},{attackAt:1}));
  const agumonBot=enemySprites.find(o=>o.userData.battleName==='Agumon');let swings=0,was='idle',merged=[],critWaves=0,critSparks=0;
  step(1400,()=>{if(partnerSprite.userData.battleStance==='attack'&&was!=='attack')swings++;was=partnerSprite.userData.battleStance;const n=numbersOn(agumonBot);if(n.length&&!merged.length){merged=n;critWaves=waves().length;critSparks=bursts().length}});
  assert.equal(swings,1,'two reported strikes are delivered by one swing');assert.deepEqual(merged,['42!'],'the number shown is the sum, marked as a crit');
  assert.equal(critWaves,1,'crits ring a shockwave');assert(critSparks>=12,'crits burst harder: '+critSparks);
  step(600);assert.equal(waves().length,0,'the shockwave expires');assert.equal(bursts().length,0,'the burst particles expire');assert.equal(popups().length,0,'a crit number lasts 1300 ms and then expires');

  // --- nobody is struck while it is still out on a swing of its own ---
  // The partner's strike is reported first; a bot's answer arrives while the partner is on its way in.
  scene.battleEvent({kind:'pve',battleId:'pve-test',to:'e1',amount:4,crit:false});scene.setBattleState(wave2({attackAt:5,hp:62},{attackAt:1,hp:8},{attackAt:1,hp:12},{attackAt:1}));
  step(200);assert.equal(partnerSprite.userData.battleStance,'attack');assert(off(partnerSprite)>.3,'the partner is on its way in');
  scene.battleEvent({kind:'pve',battleId:'pve-test',to:'partner',amount:5,crit:false});scene.setBattleState(wave2({attackAt:5,hp:57},{attackAt:2,hp:8},{attackAt:1,hp:12},{attackAt:1}));
  let answeredAt=0;step(2000,t=>{if(!answeredAt&&numbersOn(partnerSprite).length){answeredAt=t;assert.notEqual(partnerSprite.userData.battleStance,'attack','the answer waits until the partner is back from its own swing');assert(off(partnerSprite)<=.26,'the partner is struck on its slot')}});
  assert(answeredAt,'the answer is delivered');assert(field().every(o=>off(o)<1e-9&&o.userData.battleStance==='idle'));

  // --- a unit the sim has felled stays up until the blow that felled it lands, then collapses and dissolves ---
  scene.battleEvent({kind:'pve',battleId:'pve-test',to:'e0',amount:9,crit:false});
  scene.setBattleState(wave2({attackAt:6,hp:57},{attackAt:2,hp:0},{attackAt:1,hp:12},{attackAt:1}));
  let fellAt=0,hitAt=0;
  step(900,t=>{if(!hitAt&&numbersOn(agumonBot).length)hitAt=t;if(!fellAt&&agumonBot.userData.battleStance==='faint')fellAt=t;if(!hitAt)assert.notEqual(agumonBot.userData.battleStance,'faint','a felled bot stays on its feet until the blow is shown')});
  assert(hitAt&&fellAt&&fellAt>=hitAt,'the bot goes down when the blow lands: hit '+hitAt+' ms, down '+fellAt+' ms');assert.equal(agumonBot.material.opacity,1,'the collapse is shown before the body fades');
  // The next reported strike goes for the next living bot; the body dissolves so nobody steps over it.
  step(1200);assert.equal(agumonBot.material.opacity,0,'a felled bot dissolves once its collapse has played');
  assert.equal(scene.battleEvent({kind:'pve',battleId:'pve-test',to:'e0',amount:4,crit:false}),true);step(200);assert.deepEqual(numbersOn(agumonBot),[],'a body that is already down shows nothing more');

  // --- a new wave: the party stays put, the old bots fade out and the new ones take the slots ---
  const stay=partnerSprite.position.clone();
  scene.setBattleState(fieldRun(3,{attackAt:0,hp:62},[{id:'w3-e0',form:'agumon'},{id:'w3-e1',form:'palmon'},{id:'w3-e2',form:'gabumon'}]));frame(now+=20);
  assert(flat(partnerSprite.position,stay)<1e-9,'a new wave leaves the partner on its slot (no retarget run, no elapsed-time teleport)');
  assert.equal(field().length,4,'the new wave replaces the old one');assert.equal(leaving().length,2,'the old bots that were still visible fade out instead of blinking off');
  step(400);assert.equal(leaving().length,0,'the faded bots are disposed');

  // v350 boss waves: one oversized gold-ringed boss with a BOSS nameplate, and quick ranged
  // attackers fire a visible travelling shot instead of only bumping into each other.
  const bossRun=(partner,boss)=>fieldRun(5,partner,[{id:'w5-boss',form:'greymon',hp:120,maxHp:300,boss:true,...boss}]);
  // v398: a wave runs in, so give it time to reach its slot before measuring the formation.
  scene.setBattleState(bossRun({hp:80},{}));step(3000);
  const bossSprite=scene.scene.children.find(o=>o.userData.battleBoss);
  assert(bossSprite,'the boss sprite is flagged for oversized presentation');assert.equal(bossSprite.userData.battleName,'BOSS · Greymon','the boss wears a BOSS nameplate');
  assert(bossSprite.scale.x>partnerSprite.scale.x*1.4,'the boss renders visibly larger than a normal fighter');
  // v359: the accent ring is marked; v384: it marks the slot the boss owns.
  const bossRing=scene.scene.children.find(o=>o.userData.battleAccent&&flat(o.position,bossSprite.userData.battleSpawn)<.01);
  assert(bossRing&&bossRing.material.color.getHex()===0xe8a54a,'the boss stands on a gold accent ring');
  assert(bossSprite.position.x-partnerSprite.position.x>4.2,'the aisle widens for a boss so it does not crowd the party: '+(bossSprite.position.x-partnerSprite.position.x).toFixed(2));
  // The melee boss swings: it steps in, never fires, and stops short of overlapping the partner.
  scene.battleEvent({kind:'pve',battleId:'pve-test',to:'partner',amount:11,crit:false});scene.setBattleState(bossRun({hp:69},{attackAt:1}));
  let bossReach=Infinity,bossGhosts=false,bossWaves=0;
  step(1400,()=>{bossReach=Math.min(bossReach,flat(bossSprite.position,partnerSprite.userData.battleSpawn));if(ghosts().filter(g=>g.visible).length>=2)bossGhosts=true;bossWaves=Math.max(bossWaves,waves().length);assert.equal(shots().length,0,'melee fighters fire no projectiles')});
  assert(bossGhosts,'a brawler carries after-image ghosts on its way in');assert(bossReach>2.2&&bossReach<3.6,'the boss stops at arm\'s length of the partner: '+bossReach.toFixed(2));
  assert.equal(bossWaves,1,'a boss blow lands with a ground ring even when it is not a crit');
  assert(ghosts().every(g=>!g.visible),'ghosts hide once the lunge is over');
  // A ranged partner: it never leaves its slot; the shot is seen in flight and carries the number.
  scene.setBattleState({pve:[],pvp:null});step(400);
  const rangedRun=(partner,boss)=>({pve:[{id:'pve-test',owner:1,slot:0,wave:5,phase:'fighting',profile:{form:'biyomon'},partner:{form:'biyomon',hp:80,maxHp:100,attackAt:0,hitAt:0,...partner},enemies:[{id:'w5-boss',form:'greymon',hp:120,maxHp:300,boss:true,attackAt:0,hitAt:0,...boss}]}],pvp:null});
  scene.setBattleState(rangedRun({},{}));step(500);settle();
  const archer=role('partner')[0],bigBoss=role('enemy')[0];
  // v398: the boss runs in, so the shake baseline is the slot it OWNS, not wherever it happens to be
  // standing the moment this section starts (that would fold the walk-in into the shake amplitude).
  settle();
  const settled={x:bigBoss.userData.battleSpawn.x,z:bigBoss.userData.battleSpawn.z};
  assert(ghosts().every(g=>!g.visible),'a ranged form never shows after-images - stale ghosts stay hidden');
  scene.battleEvent({kind:'pve',battleId:'pve-test',to:'w5-boss',amount:21,crit:false});scene.setBattleState(rangedRun({attackAt:1},{hp:99}));
  let firstShot=0,shotGone=0,number=0,shook=false;
  step(1200,t=>{
   assert(off(archer)<1e-9,'a ranged form never leaves its slot');
   if(!firstShot&&shots().length){firstShot=t;assert.equal(archer.userData.battleStance,'attack')}
   if(firstShot&&!shotGone&&!shots().length)shotGone=t;
   if(!number&&numbersOn(bigBoss).length){number=t;assert.deepEqual(numbersOn(bigBoss),['21'])}
   const jolt=Math.hypot(bigBoss.position.x-settled.x,bigBoss.position.z-settled.z);if(jolt>.01)shook=true;assert(jolt<=.26,'the shake stays inside its amplitude: '+jolt);
  });
  assert(firstShot>=100,'the shot follows a visible wind-up: '+firstShot+' ms');assert(shotGone-firstShot>=240,'the projectile is seen in flight: '+(shotGone-firstShot)+' ms');
  assert(number&&Math.abs(number-shotGone)<=40,'the number appears when the shot arrives, not when it is fired: shot '+shotGone+' ms, number '+number+' ms');
  assert(shook,'the hit shakes the defending boss sprite');assert.equal(shots().length,0,'the projectile expires after its flight');
  // A boss faint bursts gold with a shockwave - when the killing shot lands, not before.
  scene.battleEvent({kind:'pve',battleId:'pve-test',to:'w5-boss',amount:99,crit:false});scene.setBattleState(rangedRun({attackAt:2},{hp:0}));
  let goldAt=0;step(1200,t=>{if(!goldAt&&bigBoss.userData.battleStance==='faint'){goldAt=t;assert(bursts().length>=16,'the boss faint bursts gold');assert.equal(waves().length,1,'the boss faint rings a shockwave')}});
  assert(goldAt>=300,'the boss falls when the shot arrives: '+goldAt+' ms');
  // A strike nobody is left to deliver (the whole wave is down) still shows its number.
  step(1000);scene.battleEvent({kind:'pve',battleId:'pve-test',to:'partner',amount:6,crit:false});step(400);
  assert.deepEqual(numbersOn(archer),['6'],'a strike with no attacker left standing lands as a plain hit');
  // --- v384: what is on screen is finished before the sim's next step replaces it ---
  const idleResidents=()=>scene.scene.children.filter(o=>o.userData.sanctuaryResident),stance=o=>o.userData.battleStance,hit=(battleId,to,amount)=>scene.battleEvent({kind:'pve',battleId,to,amount,crit:false});
  // A run that is over with nothing left to show fades out at once.
  step(1200);scene.setBattleState({pve:[],pvp:null});frame(now+=20);
  assert.equal(field().length,0,'a finished run with nothing left to show has no live field units');assert(leaving().length>=1,'its units fade out instead of blinking off');
  step(400);assert.equal(leaving().length,0,'the faded units are disposed');assert.equal(ghosts().length,0,'after-images are removed with their unit');

  // Raid victory: the sim ends the run on the very tick the boss falls, so no snapshot ever shows
  // it at 0 HP. The finished run stays until that blow has landed and the collapse has played.
  const raid=(partner={},boss={})=>({pve:[{id:'raid-test',owner:1,slot:0,wave:1,phase:'fighting',mode:'boss',profile:{form:'agumon'},partner:{form:'agumon',hp:80,maxHp:100,attackAt:0,hitAt:0,...partner},enemies:[{id:'boss',form:'greymon',hp:30,maxHp:300,boss:true,attackAt:0,hitAt:0,...boss},{id:'add',form:'palmon',hp:40,maxHp:50,attackAt:0,hitAt:0}]}],pvp:null});
  scene.setBattleState(raid());step(500);settle();
  {
   const hero=role('partner')[0],raidBoss=field().find(o=>o.userData.battleBoss),add=role('enemy').find(o=>!o.userData.battleBoss);
   // Last tick: the partner's strike takes the boss's last 30 HP; the add's strike is still unanswered.
   hit('raid-test','boss',30);hit('raid-test','partner',4);scene.setBattleState({pve:[],pvp:null});
   let fell=0,gold=false,heroSwung=false,addSwung=false,gone=0,plain=0;
   step(1600,t=>{
    if(stance(hero)==='attack')heroSwung=true;if(stance(add)==='attack')addSwung=true;
    if(!plain&&numbersOn(hero).includes('4'))plain=t;
    if(!fell&&stance(raidBoss)==='faint'){fell=t;gold=bursts().length>=16&&waves().length>=1}
    if(!gone&&!field().length)gone=t;
    if(!fell)assert(field().includes(raidBoss)&&field().includes(hero),'the finished run stays on the field until its last blow has landed');
    if(!gone)assert(idleResidents().every(o=>!o.visible),'idle residents stay hidden while a finished run is still on the field');
   });
   assert(heroSwung,'the blow that ends the run is still delivered by its fighter');assert(fell>=240,'the boss falls when that blow lands, not before: '+fell+' ms');assert(gold,'the boss falls with its gold burst and ground ring');
   assert(plain&&plain<=60,'a strike left unanswered when the run ends lands at once as a plain number: '+plain+' ms');assert(!addSwung,'no new exchange starts once the run is over');
   assert(gone-fell>=400&&gone<=1100,'the field clears once the collapse has been seen: fell '+fell+' ms, cleared '+gone+' ms');
   assert.equal(leaving().length,0,'the lingering units have faded out');assert.equal(field().length,0);
  }
  // Defeat: the blow that fells the last partner is shown and the partner goes down before the field clears.
  scene.setBattleState(raid({hp:9}));step(500);settle();
  {
   const hero=role('partner')[0];hit('raid-test','partner',9);scene.setBattleState({pve:[],pvp:null});
   let down=0,gone=0,struck=false;step(1600,t=>{if(role('enemy').some(o=>stance(o)==='attack'))struck=true;if(!down&&stance(hero)==='faint')down=t;if(!gone&&!field().length)gone=t});
   assert(struck&&down>=240,'the blow that ends the run in defeat is delivered: '+down+' ms');assert(gone>down,'the partner is seen going down before the field clears');
  }
  // A long gap between frames (a tab that was in the background) never leaves a finished run standing.
  scene.setBattleState(raid());step(500);hit('raid-test','boss',30);scene.setBattleState({pve:[],pvp:null});frame(now+=2000);frame(now+=20);
  assert.equal(field().length,0,'a lingering run is released when its time is up, even with its blow undelivered');assert(popups().some(p=>p.userData.battlePopupText==='30'),'the undelivered damage is still shown as a number');
  step(1400);assert.equal(leaving().length,0);assert.equal(popups().length,0);

  // A full party fells a bot on nearly every tick. A kill does not jump the queue mid-wave: the
  // wave still answers in its turn, with swings, instead of its strikes surfacing later as bare numbers.
  const partyRun=(wave,partners,enemies)=>({pve:[{id:'party-test',owner:1,slot:1,wave,phase:'fighting',party:true,profile:{form:'agumon'},partner:{form:'agumon',hp:90,maxHp:100,attackAt:0,hitAt:0,...partners[0]},partners:['agumon','gabumon','patamon'].map((form,i)=>({form,hp:90,maxHp:100,attackAt:0,hitAt:0,...partners[i]})),enemies:enemies.map(e=>({hp:60,maxHp:60,attackAt:0,hitAt:0,...e}))}],pvp:null});
  const bots=(over={})=>['palmon','gomamon','tentomon','veemon','hawkmon'].map((form,i)=>({id:'b'+i,form,...(over[i]||{})}));
  scene.setBattleState(partyRun(1,[{},{},{}],bots()));step(500);settle();
  {
   const party=role('partner'),wave=role('enemy'),anyAttack=list=>list.some(o=>stance(o)==='attack');
   assert.equal(party.length,3);assert.equal(wave.length,5);
   assert(wave.filter(o=>o.position.x>wave[0].position.x+1).length===2,'a wave of five puts three in front and two behind');
   // Tick 1: all three partners strike b0 and fell it.
   for(const to of ['b0','b0','b0'])hit('party-test',to,20);
   scene.setBattleState(partyRun(1,[{attackAt:1},{attackAt:1},{attackAt:1}],bots({0:{hp:0}})));
   let starts=[];step(1500,t=>{for(const [i,o] of party.entries())if(stance(o)==='attack'&&starts[i]==null)starts[i]=t});
   assert(starts.every(t=>t!=null)&&starts[0]<starts[1]&&starts[1]<starts[2],'the party steps out one after another: '+starts);assert(starts[2]-starts[0]<=260,'the ripple stays tight: '+starts);
   assert.equal(stance(wave[0]),'faint','the bot falls to the party');assert(party.every(o=>off(o)<1e-9&&stance(o)==='idle'),'the party is back on its slots');
   // Tick 2: the party fells b1; the three bots still standing strike the third partner.
   for(const to of ['b1','b1','b1'])hit('party-test',to,20);for(const amount of [5,6,7])hit('party-test','partner2',amount);
   scene.setBattleState(partyRun(1,[{attackAt:2},{attackAt:2},{attackAt:2,hp:72}],bots({0:{hp:0},1:{hp:0},2:{attackAt:1},3:{attackAt:1},4:{attackAt:1}})));
   let waveAt=0,partyAt=0,answered=0,fellAt=0,botSwings=new Set();
   step(2600,t=>{
    for(const o of wave)if(stance(o)==='attack')botSwings.add(o);
    if(!waveAt&&anyAttack(wave))waveAt=t;if(!partyAt&&anyAttack(party))partyAt=t;
    if(!answered&&numbersOn(party[2]).includes('18'))answered=t;if(!fellAt&&stance(wave[1])==='faint')fellAt=t;
    if(!answered)assert(party.every(o=>off(o)<=.26),'the party stays on its slots until every blow of the wave has landed');
   });
   assert(waveAt&&partyAt&&waveAt<partyAt,'the wave answers in its turn even though the party holds a kill: wave '+waveAt+' ms, party '+partyAt+' ms');
   assert.equal(botSwings.size,3,'every bot that struck is seen swinging');assert(answered&&answered<partyAt,'its three blows land as one running number before the party moves again');
   assert(fellAt>partyAt,'the kill follows in the party\'s turn');
   // Tick 3 clears the wave (b2, b3 and b4 fall) while a bot strike is still unanswered. The party
   // went last, so the turn would be the wave's - but the blow that clears a wave goes first.
   hit('party-test','partner',8);for(const to of ['b2','b3','b4'])hit('party-test',to,60);
   scene.setBattleState(partyRun(1,[{attackAt:3,hp:82},{attackAt:3},{attackAt:3,hp:72}],bots({0:{hp:0},1:{hp:0},2:{hp:0,attackAt:1},3:{hp:0,attackAt:1},4:{hp:0,attackAt:2}})));
   let partyFirst=false;step(300,t=>{if(t<=120&&anyAttack(party))partyFirst=true;assert(!anyAttack(wave),'the wave does not take the turn')});
   assert(partyFirst,'the blow that clears the wave jumps the queue');
   // ... and the sim replaces the wave while those blows are still landing: the old wave stays put.
   const fresh=()=>['agumon','gabumon','biyomon'].map((form,i)=>({id:'n'+i,form}));
   scene.setBattleState(partyRun(2,[{attackAt:0,hp:82},{attackAt:0},{attackAt:0,hp:72}],fresh()));frame(now+=20);
   assert.deepEqual(role('enemy'),wave,'a cleared wave is not replaced while the blow that cleared it is still on its way');
   const kept=hit('party-test','n0',11);
   assert.equal(kept,true,'a strike on the wave that is waiting is kept for it');
   let cleared=0,arrived=0,swapped=0,gap=Infinity,early=0;
   // v398: the swap plus a full run-in can eat most of this window, so it has to outlast RUNIN_MS.
   step(4200,t=>{
    if(!cleared&&[2,3,4].every(i=>stance(wave[i])==='faint'))cleared=t;
    // v398: the new wave now RUNS IN, so "it is there" means it has reached its slots - measuring
    // the gap to the party while it was still crossing the field would read as if it spawned on top
    // of them.
    const now_=role('enemy');
    if(!swapped&&now_.length&&!now_.includes(wave[0]))swapped=t;
    if(!arrived&&swapped&&now_.every(o=>!o.userData.battleEntering)){
     arrived=t;for(const p of party)for(const e of now_)gap=Math.min(gap,flat(p.position,e.position))
    }
    // While the old wave is still being seen falling, the new one must not be on the field at all.
    // (Once it has been swapped in it is RUNNING IN - v398 - so its sprites exist but are still
    // entering; that is "replaced", not "replaced on top of them".)
    if(!cleared)assert(now_.length===5&&now_.every(o=>wave.includes(o)),'the old wave holds its slots until it has been seen falling');
    if(arrived&&!early&&role('enemy')[0]&&numbersOn(role('enemy')[0]).includes('11'))early=t;
   });
   // v398: the swap is still timed off the collapse; the RUN-IN then takes a further moment, so the
   // test separates "the new wave appears" from "it has reached its slots".
   assert(cleared&&swapped>cleared,'the next wave comes in after the last bot has been seen falling: fell '+cleared+' ms, next wave '+swapped+' ms');
   assert(swapped-cleared>=400&&swapped-cleared<=500,'it waits for the collapse and no longer: fell '+cleared+' ms, next wave '+swapped+' ms');
   assert(arrived>swapped,'the wave runs in after it appears: appeared '+swapped+' ms, settled '+arrived+' ms');
   assert.equal(role('enemy').length,3,'the next wave takes the field');assert(gap>1.5,'no partner is standing among the new wave when it fades in: '+gap.toFixed(2));
   // v398: "there" now means the new wave has finished running in and is on its slots. A strike is
   // never shown on a bot that is still crossing the field, which is the v384 bug this protects.
   assert(early>arrived,'the strike kept for the new wave is shown once it has settled on its slot: landed '+early+' ms, settled '+arrived+' ms');
  }
  // A fighter that is felled before its swing connects gives the strike back: it is shown on its
  // target as a plain number instead of being lost (or landing on a fighter that is away).
  scene.setBattleState({pve:[],pvp:null});step(1400);
  scene.setBattleState(fieldRun(7,{hp:80},[{id:'z0',form:'palmon'}]));step(500);settle();
  {
   const hero=role('partner')[0],bot=role('enemy')[0];hit('pve-test','partner',7);
   scene.setBattleState(fieldRun(7,{hp:73},[{id:'z0',form:'palmon',attackAt:1}]));step(160);
   assert.equal(stance(bot),'attack','the bot has started its swing');assert.deepEqual(numbersOn(hero),[],'its blow has not landed yet');
   // The bot is removed from play mid-swing (a boss rout) with nothing owed to it.
   scene.setBattleState(fieldRun(7,{hp:73},[{id:'z0',form:'palmon',attackAt:1,hp:0}]));
   let shown=0;step(600,t=>{if(!shown&&numbersOn(hero).includes('7'))shown=t;assert(off(hero)<=.26,'the partner is on its slot when that number lands')});
   assert.equal(stance(bot),'faint');assert(shown&&shown<=500,'the strike it was carrying is still shown on its target, about when the blow was due: '+shown+' ms');
   step(1200);hit('pve-test','partner',0);step(200);assert(popups().every(p=>p.userData.battlePopupText!=='7'),'and it is shown only once');
  }
  // Nobody is struck while it is still out on a swing of its own. The partner goes for a bot in
  // the back column (a long way home); a front-row bot's answer is reported while it is on its way in.
  scene.setBattleState({pve:[],pvp:null});step(1400);
  const five=(over={})=>['palmon','gomamon','tentomon','veemon','hawkmon'].map((form,i)=>({id:'y'+i,form,...(over[i]||{})}));
  scene.setBattleState(fieldRun(8,{hp:80},five()));step(500);settle();
  {
   const hero=role('partner')[0];hit('pve-test','y3',4);scene.setBattleState(fieldRun(8,{hp:80,attackAt:1},five({3:{hp:36}})));
   step(200);assert(stance(hero)==='attack'&&off(hero)>.3,'the partner is on its way in');
   hit('pve-test','partner',5);scene.setBattleState(fieldRun(8,{hp:75,attackAt:1},five({1:{attackAt:1},3:{hp:36}})));
   let answered=0,reach=0;step(2200,t=>{reach=Math.max(reach,off(hero));if(!answered&&numbersOn(hero).length){answered=t;assert.notEqual(stance(hero),'attack','the answer waits until the partner is back from its own swing');assert(off(hero)<=.26,'the partner is struck on its slot')}});
   assert(answered,'the answer is delivered');assert(reach>3.5,'the partner went all the way to the back column: '+reach.toFixed(2));
  }
  // A new wave never fades in around a partner that is still out in the field: here the last bot
  // stood in the back column, its collapse has already played, and the partner is on its way home.
  scene.setBattleState({pve:[],pvp:null});step(1400);
  scene.setBattleState(fieldRun(8,{hp:80},five({3:{hp:10}})));step(500);settle();
  {
   const hero=role('partner')[0],old=role('enemy'),back=old[3];assert(back.position.x>old[0].position.x+1,'the fourth bot stands in the back column');
   hit('pve-test','y3',10);scene.setBattleState(fieldRun(8,{hp:80,attackAt:1},five({3:{hp:0}})));
   let guard=0;while(!numbersOn(back).length&&guard++<60)frame(now+=20);assert(guard<60,'the blow lands');
   step(440);assert.equal(stance(back),'faint');assert(stance(hero)==='attack'&&off(hero)>.5,'the partner is still on its way home: '+off(hero).toFixed(2));
   scene.setBattleState(fieldRun(9,{hp:80,attackAt:0},[{id:'x0',form:'agumon'},{id:'x1',form:'gabumon'}]));frame(now+=20);
   assert.deepEqual(role('enemy'),old,'the next wave waits while a partner is still out in the field');
   let arrived=0,homeAt=0;step(900,t=>{if(!homeAt&&off(hero)<1e-9)homeAt=t;if(!arrived&&role('enemy').length===2){arrived=t;assert(off(hero)<1e-9,'the partner is back on its slot when the next wave fades in')}});
   assert(arrived&&arrived<=homeAt+40,'and the wave comes in as soon as it is: home '+homeAt+' ms, wave '+arrived+' ms');
  }
  scene.setBattleState({pve:[],pvp:null});step(1800);
  assert.equal(field().length,0);assert.equal(leaving().length,0);assert.equal(popups().length,0);assert.equal(bursts().length,0);assert.equal(waves().length,0);assert.equal(shots().length,0);
 }
 scene.setBattleState({pve:[],pvp:{id:'pvp-test',phase:'fighting',winnerId:null,participants:[{id:1,name:'One',side:'left',unit:{form:'agumon',hp:80,maxHp:100}},{id:2,name:'Two',side:'right',unit:{form:'palmon',hp:70,maxHp:100}}]}});frame(now+=100);assert.equal(scene.scene.children.filter(o=>o.userData.battleKind==='pvp').length,2,'two accepted ring fighters are rendered');
 // The ring has no run-in, but its fighters still cross from wherever they last stood, so this waits
 // for them to reach their marks instead of assuming a fixed number of frames covers the walk.
 for(let i=0;i<60;i++)frame(now+=100);

 assert.equal(scene.battleEvent({kind:'pvp',battleId:'pvp-test',to:1,amount:9,crit:false}),true,'ring strikes land their FX too');frame(now+=40);assert(scene.scene.children.some(o=>o.userData.battlePopup&&o.userData.battlePopupText==='9'),'the ring damage number floats');
 // v360 (owner: "replace the social hub middle fountain with this"): the Prontera Grand
 // Aetherwell GLB takes the plaza centre when its vendored loader exists; the atlas
 // fountain is the dead-GLB fallback.
 assert(fs.existsSync('assets/Fountainfile/Prontera_Grand_Aetherwell.glb')&&fs.existsSync('assets/Fountainfile/Prontera_Grand_Aetherwell_Preview.png'),'the Aetherwell GLB and its preview ship in the repo');
 assert.equal(fs.readFileSync('assets/Fountainfile/Prontera_Grand_Aetherwell.glb').subarray(0,4).toString('latin1'),'glTF','the fountain file is a binary glTF container');
 assert(fs.readFileSync('index.html','utf8').includes('assets/vendor/GLTFLoader.r128.js?v='),'the page loads the vendored r128 GLTFLoader after three.min.js');
 assert(scene.scene.children.some(o=>o.userData.fountainFallback&&o.visible===true),'the atlas fountain stands in while no GLTFLoader exists');
 assert(!scene.scene.children.some(o=>o.userData.aetherwell),'nothing mounts without the loader');
 // v361: the solid heart is the basin + planter (7.75); the bench ring and paving are walkable
 // sitting ground like every other hub bench.
 assert(!w.PGSocialRules.walkable(0,7.7)&&w.PGSocialRules.walkable(0,7.8),'the Aetherwell planter is enclosed by the shared fountain collision');
 // Rebuild the scene with a stubbed loader that hands over a stand-in gltf scene shaped
 // like the real export (named nodes), then drive the animation loop.
 const fakeRoot=new T.Group();
 const spire=new T.Group();spire.name='AETHER \u2022 main floating spire';spire.position.set(0,10.4,0);spire.add(new T.Mesh(new T.BoxGeometry(.5,.5,.5)));fakeRoot.add(spire);
 const inverted=new T.Group();inverted.name='Floating inverted crystal';inverted.position.set(0,4.2,0);fakeRoot.add(inverted);
 const motes=new T.Group();motes.name='Aetherwell \u2022 Aether motes \u2022 ice white';fakeRoot.add(motes);
 const shardA=new T.Group();shardA.name='Orbiting shard 00';shardA.position.set(2,6.5,0);fakeRoot.add(shardA);
 const shardB=new T.Group();shardB.name='Orbiting shard detailed 00';shardB.position.set(-1.5,8,1);fakeRoot.add(shardB);
 const crystalMat=new T.MeshBasicMaterial();crystalMat.name='Crystal facet 0';
 fakeRoot.add(new T.Mesh(new T.BoxGeometry(.3,.3,.3),crystalMat));
 // v361: a PBR material whose name carries a KHR_materials_emissive_strength value the r128
 // loader drops, plus a known linear albedo, so the mount's fidelity pass is observable.
 const inscriptionMat=new T.MeshStandardMaterial({name:'Crystal inscriptions \u2022 electric blue'});
 inscriptionMat.color.setRGB(.25,.5,1);inscriptionMat.emissive.setRGB(.018,.54,1);
 fakeRoot.add(new T.Mesh(new T.BoxGeometry(.2,.2,.2),inscriptionMat));
 let requestedUrl='';
 T.GLTFLoader=class{load(url,onLoad){requestedUrl=url;onLoad({scene:fakeRoot})}};
 const host2=w.document.createElement('div');host2.setPointerCapture=()=>{};host2.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:700});Object.defineProperties(host2,{clientWidth:{get(){return 1000}},clientHeight:{get(){return 700}}});
 let wellSeat=null;const scene2=await w.PGSocialScene.create(host2,w.document.createElement('div'),{self:()=>2,menu(){},move(){},seat(id){wellSeat=id}});
 assert.equal(requestedUrl,'assets/Fountainfile/Prontera_Grand_Aetherwell.glb','the hub requests the Aetherwell GLB');
 const well=scene2.scene.children.find(o=>o.userData.aetherwell);
 assert(well,'the Aetherwell mounts over the plaza');
 assert(Math.abs(well.scale.x-.62)<1e-9&&Math.abs(well.position.y-.06)<1e-9,'the v361 centerpiece is scaled up to the grand plaza size');
 const fallback2=scene2.scene.children.find(o=>o.userData.fountainFallback);
 assert(fallback2&&fallback2.visible===false,'the atlas fountain hides once the GLB is alive');
 assert.equal(well.children.filter(c=>/^Orbiting shard( detailed)? 00$/.test(c.name)).length,2,'both shard rings are tracked for the orbit animation');
 const spireBefore=spire.position.y,shardBefore=shardA.position.x,shardZBefore=shardB.position.z;
 scene2.active=true;frame(now+=1600);
 assert(Math.abs(spire.position.y-spireBefore)>.001,'the floating spire bobs on the aether');
 assert(Math.abs(shardA.position.x-shardBefore)>.001||Math.abs(shardA.position.z-shardZBefore)>.001,'the simple shard ring orbits the spire');
 assert(Math.abs(shardB.position.x-shardBefore)>.001||Math.abs(shardB.position.z-shardZBefore)>.001,'the detailed shard ring counter-orbits the spire');
 assert(crystalMat.emissiveIntensity>=.6&&crystalMat.emissiveIntensity<=1.1,'the shared crystal material breathes');
 // v361 fidelity: the albedo was converted from linear to display space and the dropped
 // KHR_materials_emissive_strength value (5.5 for the inscriptions) is re-applied on mount.
 assert(Math.abs(inscriptionMat.color.g-.7354)<.01,'the GLB albedo is gamma-corrected for the unencoded backbuffer');
 assert(Math.abs(inscriptionMat.emissiveIntensity-5.5)<1e-9,'the inscriptions glow at their authored emissive strength');
 // v361 seating: the model's bench ring carries real seats (ids 112-127); clicking one through
 // the camera picks the seat, exactly like the plaza benches and the bleacher tiers.
 scene2.active=true;frame(now+=100);scene2.camera.updateMatrixWorld();
 const seat112=w.PGSocialRules.SEATS[112],seatPt=new T.Vector3(seat112.x,seat112.height+.2,seat112.z).project(scene2.camera);
 const clickWell=pt=>{const ev={clientX:(pt.x+1)*500,clientY:(1-pt.y)*350,pointerId:2,button:0,preventDefault(){}};host2.onpointerdown(ev);host2.onpointerup(ev)};
 clickWell(seatPt);assert.equal(wellSeat,112,'clicking the Aetherwell bench ring selects its seat');
 scene.setBattleState({pve:[],pvp:null});assert.equal(scene.scene.children.filter(o=>o.userData.battleKind).length,0,'battle sprites are disposed when the room clears');
 dom.window.close();
 console.log('PASS social scene: v300 per-tier rod glow, download retry, visible sitting fallback, native glow hooks, level aura tiers, follow camera, name anchor, reentry, live battle sprite lifecycle, v357 soft-light strike FX, native RO species trees and the stair-gated ring');
})().catch(e=>{console.error(e);process.exitCode=1});
