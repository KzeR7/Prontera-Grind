// Exercise the generated choreography and the game's actual effect lifecycle.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path'),THREE=require('three');
const root=path.resolve(__dirname,'../..'),src=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('const FOURTH_JOBS_LIVE=false;','const FOURTH_JOBS_LIVE=true;');
const grab=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
let marks=0,transforms=[],depth=0,rasterMarks=0,atlasReady=true,atlasWidth=1024,toothDraws=[],stoneDraws=[];
class MaterialImage{get complete(){return atlasReady}get naturalWidth(){return atlasWidth}get naturalHeight(){return atlasWidth}}
function canvas(){
  const stack=[],ctx={globalAlpha:1,globalCompositeOperation:'source-over',
    save(){stack.push(this.globalAlpha);depth++},restore(){assert(stack.length);this.globalAlpha=stack.pop();depth--},
    setTransform(...args){assert(args.every(Number.isFinite));transforms.push(args)},
    clearRect(){},fill(){if(this.globalAlpha>0)marks++},stroke(){if(this.globalAlpha>0)marks++},
    drawImage(...args){if(this.globalAlpha>0){if(args[0]?.width===192&&args[0]?.height===320)toothDraws.push(args);if(args[0]?.width===192&&args[0]?.height===256)stoneDraws.push(args);marks++;if(args.length===9)rasterMarks++}},fillRect(){},fillText(){},
    createLinearGradient(){return {addColorStop(){}}},createRadialGradient(){return {addColorStop(){}}}};
  for(const name of ['translate','rotate','scale','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','ellipse'])
    ctx[name]=(...args)=>assert(args.every(Number.isFinite),name+' non-finite coordinates');
  for(const name of ['beginPath','closePath','clip'])ctx[name]=()=>{};
  const c={width:0,height:0,style:{},setAttribute(){},getContext:()=>ctx};return c;
}
const layers=[],box={THREE,console,Image:MaterialImage,document:{createElement:canvas},
  $:()=>({after(c){layers.push(c)}}),R:{domElement:{clientWidth:1200,clientHeight:800}},devicePixelRatio:1,
  scr:(x,y,z)=>[400+x*30,500+z*12-y*60],scene:new THREE.Scene(),cam:new THREE.PerspectiveCamera(),
  pl:{x:0,z:0},skillFx:[],simVisualsOff:()=>false,cl:(v,a,b)=>Math.max(a,Math.min(b,v))};
vm.createContext(box);
vm.runInContext(grab('const MOB_REGULAR_VISUAL=','const mobSpriteUrl=')+grab('const CD=[','const pm=s=>')+grab('const SKILL_FX_GEOMETRY=','let drag=null;const dom=R.domElement;'),box);
for(const file of ['assets/skill-materials.js','assets/afterglow-animations.js','assets/skill-afterglow.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),box);
const ev=code=>vm.runInContext(code,box);
assert.equal(ev('PGAfterglowAnimations.catalog.length'),105);
assert.equal(ev('SKILLS.filter(s=>s.type!=="pas").every(s=>PGSkillAfterglow.has(s.id))'),true,'missing game skill');
assert.equal(ev('PGSkillAfterglow.has("concept-venom")'),false);
assert.equal(ev('SKILLS.filter(s=>s.type==="pas").some(s=>PGSkillAfterglow.has(s.id))'),false);
for(const id of ev('PGAfterglowAnimations.catalog.map(f=>f.id)')){
  box.id=id;ev('playSkillFx(id,{x:5,z:-2},"#fff")');
  assert.equal(box.skillFx.length,1);assert.equal(box.skillFx[0].afterglow,true);
  assert.equal(box.skillFx[0].life,2.2);marks=0;
  for(const age of [0,.08,.15,.25,.45,.8,1.2,1.8,2.19]){box.skillFx[0].age=age;ev('syncSkillFx()');assert.equal(depth,0,id+' leaked canvas state');}
  assert(marks>0,id+' has no drawing');assert.equal(box.skillFx[0].group,null,'old effect drawn too');
  ev('tickSkillFx(.02);syncSkillFx()');assert.equal(box.skillFx.length,0,id+' did not expire');
}
assert.equal(layers.length,1,'per-cast canvas leak');
assert(rasterMarks>100,'loaded materials never reached the renderer');
// Pending and failed image decoding must keep every skill visible and state balanced.
for(const state of ['pending','failed']){
  atlasReady=state!=='pending';atlasWidth=state==='failed'?0:1024;
  assert.equal(ev('PGSkillMaterials.ready()'),false);
  for(const id of ev('PGAfterglowAnimations.catalog.map(f=>f.id)')){
    box.id=id;marks=0;ev('var fallback=PGAfterglowAnimations.create(document.createElement("canvas").getContext("2d"));for(let age=0;age<2.2;age+=.1)fallback(id,age*1.65,.6)');
    assert(marks>0,id+' vanished with '+state+' materials');assert.equal(depth,0);
  }
}
atlasReady=true;atlasWidth=1024;

// Narrow and dense rendering must retain each primary silhouette at reduced detail.
for(const detail of [.6,.35])for(const id of ev('PGAfterglowAnimations.catalog.map(f=>f.id)')){
  box.id=id;box.detail=detail;marks=0;
  ev('var paint=PGAfterglowAnimations.create(document.createElement("canvas").getContext("2d")); for(let age=0;age<2.2;age+=.08)paint(id,age*1.65,detail)');
  assert(marks>0,id+' disappears at detail '+detail);assert.equal(depth,0);
}
// The maw surrounds the mob with small teeth at every detail level, reusing three baked surfaces.
for(const detail of [1,.6,.35]){
  toothDraws=[];box.detail=detail;
  ev('var maw=PGAfterglowAnimations.create(document.createElement("canvas").getContext("2d"));maw("grim",.5,detail);maw("grim",.6,detail)');
  assert.equal(toothDraws.length,52,'maw lost teeth at detail '+detail);
  assert.equal(new Set(toothDraws.map(a=>a[0])).size,3,'tooth surfaces were rebuilt per frame');
  assert(toothDraws.every(a=>a[3]<=30&&a[4]<75),'oversized teeth returned');
}
// Heaven's Drive keeps four complete rocks at every detail level and reuses three surfaces.
for(const detail of [1,.6,.35]){
  stoneDraws=[];box.detail=detail;
  ev('var earth=PGAfterglowAnimations.create(document.createElement("canvas").getContext("2d"));earth("tstorm",1,detail);earth("tstorm",1.1,detail)');
  assert.equal(stoneDraws.length,8,'rock silhouettes lost at detail '+detail);
  assert.equal(new Set(stoneDraws.map(a=>a[0])).size,3,'stone surfaces rebuilt every frame');
  assert(stoneDraws.every(a=>a[3]===78&&a[4]>0&&a[4]<=138),'rock projection size drifted');
}
// The adapter compresses only artwork time, and the real lifecycle expires on simulation time.
ev('var originalCreate=PGAfterglowAnimations.create; var paintTimes=[]; PGAfterglowAnimations.create=()=>((id,age,detail)=>paintTimes.push({id,age,detail}));');
box.probe=canvas();ev('var probe=PGSkillAfterglow.create(probe); probe.draw([{id:"bash",afterglow:true,age:.5,x0:0,z0:0,x1:5,z1:-2}],390,700,scr,1)');
assert.equal(ev('paintTimes[0].age'),.825);assert.equal(ev('paintTimes[0].detail'),.6);
ev('PGAfterglowAnimations.create=originalCreate;playSkillFx("bash",{x:5,z:-2});tickSkillFx(2.19)');
assert.equal(box.skillFx.length,1);ev('tickSkillFx(.02)');assert.equal(box.skillFx.length,0);

// Magic area scale matches gameplay reach; the caster seal fades before the spell ends.
ev('playSkillFx("storm",{x:5,z:-2})');assert.equal(box.skillFx[0].magic,true);assert.equal(box.skillFx[0].areaScale,1.5);
transforms=[];ev('syncSkillFx()');assert.equal(transforms.length,3,'clear, caster seal, then spell');
assert(Math.abs(transforms[2][0]-(3.05*60/120)*1.5)<1e-8,'area spell scale');
box.skillFx[0].age=1;transforms=[];ev('syncSkillFx()');assert.equal(transforms.length,2,'caster seal expires');ev('tickSkillFx(4)');
// Single-target effects hit a small creature's body and scale up for bosses.
for(const target of [{x:5,z:-2,spriteScale:.62,spawn:1},{x:5,z:-2,spriteScale:1.28,boss:true,spawn:1}]){
  box.target=target;ev('playSkillFx("bash",target)');
  const expected=target.spriteScale*(target.boss?1.18:.7);
  assert(Math.abs(box.skillFx[0].targetScale-expected)<1e-8,'target visual size');
  transforms=[];ev('syncSkillFx()');assert(Math.abs(transforms[1][0]-3.05*60/120*expected)<1e-8);
  ev('tickSkillFx(4)');
}
box.target={x:5,z:-2,spriteScale:.62,spawn:1};ev('playSkillFx("storm",target)');
assert.equal(box.skillFx[0].targetScale,1,'area field shrunk with the monster');ev('tickSkillFx(4)');
// Phantom Assault converges on the target; its study is not a caster buff layout.
ev('playSkillFx("akatar",{x:5,z:-2})');transforms=[];ev('syncSkillFx()');
const assaultTransform=transforms[1],assaultTarget=box.scr(5,0,-2);
assert(Math.abs(assaultTransform[0]*785+assaultTransform[4]-assaultTarget[0])<1e-8);
assert(Math.abs(assaultTransform[3]*500+assaultTransform[5]-assaultTarget[1])<1e-8);
ev('tickSkillFx(4)');
// Map study feet exactly onto screen anchors for both directions and vertical flight.
for(const target of [{x:5,z:-2},{x:-5,z:2},{x:0,z:5}]){
  box.target=target;ev('playSkillFx("soulb",target)');transforms=[];ev('syncSkillFx()');
  const m=transforms[1],point=(x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
  const close=(a,b)=>a.forEach((v,i)=>assert(Math.abs(v-b[i])<1e-8));
  close(point(252,500),box.scr(0,0,0));close(point(785,500),box.scr(target.x,0,target.z));
  assert(Math.abs(m[0]*m[3]-m[1]*m[2])>0,'singular camera transform');ev('tickSkillFx(4)');
}
ev('for(let i=0;i<40;i++)playSkillFx("fire",{x:5,z:-2})');assert.equal(box.skillFx.length,28);
ev('syncSkillFx();tickSkillFx(4);syncSkillFx()');assert.equal(box.skillFx.length,0);assert.equal(layers.length,1);
const narrow=canvas();box.narrow=narrow;ev('PGSkillAfterglow.create(narrow).draw([],390,700,scr,3)');
assert.equal(narrow.width,780);assert.equal(narrow.height,1400);
box.simVisualsOff=()=>true;ev('playSkillFx("fire",target)');assert.equal(box.skillFx.length,0);
assert(src.includes('assets/afterglow-animations.js?v=151')&&src.includes('assets/skill-afterglow.js?v=147'));
assert(src.includes(':not(#skillAfterglowLayer)'),'clean-screen hides effects');
console.log('Afterglow: 105 skills (including all 30 parked fourth-job skills), loaded/pending/failed materials, full/mobile/dense detail, compressed timing, drawing/state, projection/reversal/vertical paths, expiry, cap, resize, hidden catch-up passed (Canvas operations; no GPU).');

box.simVisualsOff=()=>false;
// Wards and Rune Burst follow the caster, without changing the hit target in combat.
for(const id of ['gc_veil','ab_ward','ab_duple','ab_highness','rk_burst','rk_wind','gc_roll','wl_frost','mc_rocket']){
  box.id=id;ev('playSkillFx(id,{x:5,z:-2,spriteScale:1.28,boss:true})');
  assert.equal(box.skillFx[0].x1,box.pl.x,id+' not at caster');
  assert.equal(box.skillFx[0].z1,box.pl.z,id+' not at caster');
  assert.equal(box.skillFx[0].targetScale,1,id+' scaled from enemy');ev('tickSkillFx(4)');
}
marks=0;ev('S={cls:"Rune Knight"};t=.5;syncSkillFx()');assert(marks>0,'fourth-job aura missing');assert.equal(depth,0);
marks=0;ev('S.cls="Lord Knight";syncSkillFx()');assert.equal(marks,0,'aura leaked to parent class');
console.log('Fourth-job ward/Rune Burst caster anchors and class-gated aura passed.');

// A flag-on fourth-job effect must not re-anchor an earlier class radial skill.
box.id=ev('SKILLS.find(s=>s.shape==="radial"&&!SKILLS4.includes(s)).id');
ev('playSkillFx(id,{x:5,z:-2})');assert.equal(box.skillFx[0].x1,5);assert.equal(box.skillFx[0].z1,-2);ev('tickSkillFx(4)');
