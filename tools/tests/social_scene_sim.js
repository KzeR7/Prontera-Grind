// Exercise the actual scene lifecycle with Three geometry and controlled asset timing.
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<div id="host"></div><div id="labels"></div>',{runScripts:'outside-only'}),w=dom.window,T={...require('three')};let frame,now=1000,failNormal=true,sitReady=false,draws=[],selectedSeat=null;
 const ctx={drawImage(){}};w.HTMLCanvasElement.prototype.getContext=()=>ctx;
 const host=w.document.getElementById('host');host.setPointerCapture=()=>{};host.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:700});Object.defineProperties(host,{clientWidth:{value:1000},clientHeight:{value:700}});
 T.WebGLRenderer=class{constructor(){this.domElement=w.document.createElement('canvas')}setPixelRatio(){}setSize(){}render(){}dispose(){}};
 T.TextureLoader=class{async loadAsync(){return new T.Texture(w.document.createElement('canvas'))}};
 const action={delay:100,frames:[[[0,0,20,60,150,140,0,'body']]]},look={base:{figureHeight:60,metadata:{actions:{}}},hair:{metadata:{actions:{}}}};
 for(const stance of ['idle','walk','sit'])for(let d=0;d<8;d++)look.base.metadata.actions[stance+d]=look.hair.metadata.actions[stance+d]=action;
 class Store{constructor(options={}){this.sit=options.stances?.[0]==='sit'}release(){}async select(){if(!this.sit&&failNormal){failNormal=false;throw Error('transient download')}if(this.sit&&!sitReady)return null;return look}}
 Object.assign(w,{THREE:T,devicePixelRatio:1,requestAnimationFrame:cb=>frame=cb,ResizeObserver:class{observe(){}},PGWardrobe:{CLASSES:{Novice:0},Store,normalize:a=>a,defaults:()=>({version:1,sex:'m'}),frameIndex:()=>0,draw:(...args)=>draws.push(args)},PGFourthJobs:{CLASSES:{},Store},milestone:()=>({at:10}),REFINE_GLOWS:[],drawNativeWeaponGlow(){},drawNativeArmGlow(){}});
 Object.defineProperty(w.document,'hidden',{value:false});w.performance.now=()=>now;w.console.warn=()=>{};
 w.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(url)),arrayBuffer:async()=>{const b=fs.readFileSync(url);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}});
 w.eval(fs.readFileSync('assets/social-rules.js','utf8'));w.eval(fs.readFileSync('assets/social-scene.js','utf8'));
 const scene=await w.PGSocialScene.create(host,w.document.getElementById('labels'),{self:()=>1,menu(){},move(){},seat(id){selectedSeat=id}}),flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve()};
 const state={id:1,name:'Synthetic',x:0,z:12,dir:0,sit:true,path:[],look:{cls:'Novice',appearance:{version:1,sex:'m'},refine:10}};
 scene.active=true;scene.putPlayer(state);await flush();frame(now+=100);assert.equal(draws.length,0);frame(now+=3100);await flush();frame(now+=100);assert(draws.length,'failed download automatically retries without network movement');assert.equal(draws.at(-1)[2],'idle','pending sitting atlas falls back to visible standing sprite');assert.equal(typeof draws.at(-1)[7],'function','native weapon glow hook');assert.equal(typeof draws.at(-1)[8],'function','stowed weapon glow hook');
 sitReady=true;frame(now+=100);await flush();frame(now+=100);assert.equal(draws.at(-1)[2],'sit');
 const before=scene.camera.position.clone();scene.putPlayer({...state,sit:false,x:34,z:25});frame(now+=100);assert(scene.camera.position.x>before.x,'camera follows self');assert(scene.camera.position.z>before.z);const label=w.document.querySelector('.social-player-label');assert.equal(label.hidden,false);const head=new T.Vector3(34,2.91,25).project(scene.camera);assert(Math.abs(parseFloat(label.style.top)-(1-head.y)*350)<1,'name projects at native head height');
 const frontBench=scene.scene.children.find(o=>o.userData.seat===0),benchSize=new T.Box3().setFromObject(frontBench).getSize(new T.Vector3());assert(benchSize.z>1&&benchSize.x>3&&benchSize.y<2.2,'native park bench has a full seat and back at character scale, not a flat noticeboard');
 const chair=scene.scene.children.find(o=>o.userData.seat===5);scene.camera.updateMatrixWorld();const point=chair.userData.seatBounds.getCenter(new T.Vector3()).project(scene.camera),event={clientX:(point.x+1)*500,clientY:(1-point.y)*350,pointerId:1};host.onpointerdown(event);host.onpointerup(event);assert.equal(selectedSeat,5,'open chair backs have a usable full-outline click target');
 scene.putPlayer({...state,x:w.PGSocialRules.SEATS[0].x,z:w.PGSocialRules.SEATS[0].z,seat:0});frame(now+=100);const seatedSprite=scene.scene.children.find(o=>o.userData.socialId===1);assert.equal(seatedSprite.position.y,.95,'ground-sitting pose rests on the bench deck');assert(seatedSprite.position.z>w.PGSocialRules.SEATS[0].z,'sprite stays forward of the backrest');
 scene.clearPlayers();assert.equal(w.document.querySelectorAll('.social-player-label').length,0);scene.putPlayer(state);await flush();frame(now+=100);assert.equal(w.document.querySelectorAll('.social-player-label').length,1,'reenter restores character');dom.window.close();
 console.log('PASS social scene: download retry, visible sitting fallback, native glow hooks, follow camera, name anchor and reentry');
})().catch(e=>{console.error(e);process.exitCode=1});
