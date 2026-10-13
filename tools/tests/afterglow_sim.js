// Exercise the generated choreography and the game's actual effect lifecycle.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path'),THREE=require('three');
const root=path.resolve(__dirname,'../..'),src=fs.readFileSync(path.join(root,'index.html'),'utf8');
const grab=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
let marks=0,transforms=[],depth=0;
function canvas(){
  const stack=[],ctx={globalAlpha:1,globalCompositeOperation:'source-over',
    save(){stack.push(this.globalAlpha);depth++},restore(){assert(stack.length);this.globalAlpha=stack.pop();depth--},
    setTransform(...args){assert(args.every(Number.isFinite));transforms.push(args)},
    clearRect(){},fill(){if(this.globalAlpha>0)marks++},stroke(){if(this.globalAlpha>0)marks++},
    drawImage(){if(this.globalAlpha>0)marks++},fillRect(){},fillText(){},
    createLinearGradient(){return {addColorStop(){}}},createRadialGradient(){return {addColorStop(){}}}};
  for(const name of ['translate','rotate','scale','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','ellipse'])
    ctx[name]=(...args)=>assert(args.every(Number.isFinite),name+' non-finite coordinates');
  for(const name of ['beginPath','closePath','clip'])ctx[name]=()=>{};
  const c={width:0,height:0,style:{},setAttribute(){},getContext:()=>ctx};return c;
}
const layers=[],box={THREE,console,document:{createElement:canvas},
  $:()=>({after(c){layers.push(c)}}),R:{domElement:{clientWidth:1200,clientHeight:800}},devicePixelRatio:1,
  scr:(x,y,z)=>[400+x*30,500+z*12-y*60],scene:new THREE.Scene(),cam:new THREE.PerspectiveCamera(),
  pl:{x:0,z:0},skillFx:[],simVisualsOff:()=>false,cl:(v,a,b)=>Math.max(a,Math.min(b,v))};
vm.createContext(box);
vm.runInContext(grab('const CD=[','const pm=s=>')+grab('const SKILL_FX_GEOMETRY=','let drag=null;const dom=R.domElement;'),box);
for(const file of ['assets/afterglow-animations.js','assets/skill-afterglow.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),box);
const ev=code=>vm.runInContext(code,box);
assert.equal(ev('PGAfterglowAnimations.catalog.length'),75);
assert.equal(ev('SKILLS.filter(s=>s.type!=="pas").every(s=>PGSkillAfterglow.has(s.id))'),true,'missing game skill');
assert.equal(ev('PGSkillAfterglow.has("concept-venom")'),false);
assert.equal(ev('SKILLS.filter(s=>s.type==="pas").some(s=>PGSkillAfterglow.has(s.id))'),false);
for(const id of ev('PGAfterglowAnimations.catalog.map(f=>f.id)')){
  box.id=id;ev('playSkillFx(id,{x:5,z:-2},"#fff")');
  assert.equal(box.skillFx.length,1);assert.equal(box.skillFx[0].afterglow,true);
  assert.equal(box.skillFx[0].life,3.6);marks=0;
  for(const age of [0,.25,.45,.8,1.2,1.8,2.5,3.59]){box.skillFx[0].age=age;ev('syncSkillFx()');assert.equal(depth,0,id+' leaked canvas state');}
  assert(marks>0,id+' has no drawing');assert.equal(box.skillFx[0].group,null,'old effect drawn too');
  ev('tickSkillFx(.02);syncSkillFx()');assert.equal(box.skillFx.length,0,id+' did not expire');
}
assert.equal(layers.length,1,'per-cast canvas leak');
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
assert(src.includes('assets/afterglow-animations.js?v=136')&&src.includes('assets/skill-afterglow.js?v=136'));
assert(src.includes(':not(#skillAfterglowLayer)'),'clean-screen hides effects');
console.log('Afterglow: 75 skills, drawing/state, projection/reversal/vertical paths, expiry, cap, resize, hidden catch-up passed (Canvas operations; no GPU).');
