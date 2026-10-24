// Prismatic Overdrive: every class/Ascension effect, real Canvas call boundaries and fallback.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
let depth=0,marks=0,operations=0;
class MaterialImage{get complete(){return true}get naturalWidth(){return 1024}get naturalHeight(){return 1024}}
function canvas(){
  const stack=[],ctx={globalAlpha:1,globalCompositeOperation:'source-over',
    save(){stack.push([this.globalAlpha,this.globalCompositeOperation]);depth++},
    restore(){assert(stack.length,'unbalanced restore');[this.globalAlpha,this.globalCompositeOperation]=stack.pop();depth--},
    setTransform(...a){assert(a.every(Number.isFinite));operations++},clearRect(){},fillRect(...a){assert(a.every(Number.isFinite));marks++;operations++},
    fill(){if(this.globalAlpha>0)marks++;operations++},stroke(){if(this.globalAlpha>0)marks++;operations++},fillText(){},
    drawImage(...a){assert(a.slice(1).every(Number.isFinite),'non-finite drawImage');if(this.globalAlpha>0)marks++;operations++},
    createLinearGradient(...a){assert(a.every(Number.isFinite));return {addColorStop(offset,color){assert(Number.isFinite(offset));assert.equal(typeof color,'string')}}},
    createRadialGradient(...a){assert(a.every(Number.isFinite));return {addColorStop(offset,color){assert(Number.isFinite(offset));assert.equal(typeof color,'string')}}}
  };
  for(const name of ['translate','rotate','scale','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','ellipse'])ctx[name]=(...a)=>{assert(a.every(Number.isFinite),name+' non-finite coordinates');operations++};
  for(const name of ['beginPath','closePath','clip'])ctx[name]=()=>{};
  return {width:0,height:0,style:{},getContext:()=>ctx};
}
const box={console,Image:MaterialImage,document:{createElement:canvas}};vm.createContext(box);
for(const file of ['assets/skill-materials.js','assets/afterglow-animations.js','assets/skill-overdrive.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),box);
const ev=code=>vm.runInContext(code,box);
assert.equal(ev('PGAfterglowAnimations.catalog.length'),111,'105 class effects + six Ascension signatures');
assert.equal(ev('PGSkillOverdrive.size'),111,'every catalog row has explicit new choreography');
assert.equal(ev('PGSkillOverdrive.catalog.filter(f=>f.ascension).length'),6);
assert.equal(ev('new Set(PGSkillOverdrive.catalog.map(f=>f.id)).size'),111,'unique stable IDs');
assert.equal(ev('new Set([...PGSkillOverdrive.specs.values()].map(s=>s.signature)).size'),111,'unique design intent per skill');
assert.equal(ev('PGAfterglowAnimations.overdriveInstalled'),true);
assert.equal(ev('Object.getPrototypeOf(PGSkillOverdrive.specs)===Map.prototype'),true);
const ids=ev('PGSkillOverdrive.catalog.map(f=>f.id)');
for(const detail of [1,.6,.35])for(const id of ids){
  box.id=id;box.detail=detail;marks=0;
  ev('var paint=PGAfterglowAnimations.create(document.createElement("canvas").getContext("2d"));for(const age of [0,.03,.1,.25,.5,.8,1.2,1.8,2.19])paint(id,age*1.65,detail)');
  assert(marks>0,id+' has no visible output at detail '+detail);assert.equal(depth,0,id+' leaked canvas state');
}
// The complete preserved renderer remains available for comparison and failure fallback.
ev('PGSkillOverdrive.setEnabled(false)');marks=0;ev('var legacy=PGAfterglowAnimations.create(document.createElement("canvas").getContext("2d"));legacy("wl_comet",1,1)');assert(marks>0,'legacy fallback disappeared');assert.equal(depth,0);
ev('PGSkillOverdrive.setEnabled(true)');
marks=0;ev('var empty=PGSkillOverdrive.create(document.createElement("canvas").getContext("2d"));empty("missing",1);empty("bash",NaN);empty("bash",-1)');assert.equal(marks,0,'invalid effects must be no-ops');assert.equal(depth,0);
// All particles use stable seeded functions: the same frame emits the same Canvas operations.
function trace(id,time,detail){operations=0;box.id=id;box.time=time;box.detail=detail;ev('var deterministic=PGSkillOverdrive.create(document.createElement("canvas").getContext("2d"));deterministic(id,time,detail)');assert.equal(depth,0);return operations}
for(const id of ['bash','grav','rg_storm','gc_cross','ab_judge','wl_vortex','mc_magma']){trace(id,.93,1);assert.equal(trace(id,.93,1),trace(id,.93,1),id+' is not deterministic after material warm-up')}
assert(trace('rg_storm',.9,1)>trace('rg_storm',.9,.35),'dense detail does not reduce work');
// Path/caster declarations are data, so the real adapter can map both feet anchors exactly.
assert.equal(ev('PGSkillOverdrive.travel("wl_comet")'),false);
assert.equal(ev('PGSkillOverdrive.travel("rk_charge")'),true);
assert.equal(ev('PGSkillOverdrive.anchor("ab_epiclesis")'),'caster');
assert.equal(ev('PGSkillOverdrive.anchor("mc_magma")'),'target');
// Owner review: restrained buffs, weapon-correct sword lines, contained Wizard AoEs,
// and genuinely different Assassin choreography must remain explicit regression contracts.
assert.equal(ev('PGSkillOverdrive.specs.get("aid").pattern'),'firstAid');
for(const [id,scale]of [['storm',.72],['amp',.72],['fnova',.70]])assert.equal(ev(`PGSkillOverdrive.specs.get("${id}").scale`),scale,id+' composition scale');
assert.equal(ev('PGSkillOverdrive.specs.get("rk_ward").pattern'),'dragonBreath');
assert.equal(ev('PGSkillOverdrive.specs.get("rk_charge").pattern'),'bladeWave');
assert.equal(ev('PGSkillOverdrive.specs.get("pierce").weapon'),'sword');
assert.equal(ev('PGSkillOverdrive.specs.get("spearboom").weapon'),'sword');
assert.equal(ev('PGSkillOverdrive.specs.get("rk_spear").weapon'),'spear');
const assassin=['env','dodge','sonic','vdust','mAss','soulb','sdestroy','akatar','gc_cross','gc_slip','gc_roll','gc_ripper'];
assert.equal(ev(`new Set(${JSON.stringify(assassin)}.map(id=>PGSkillOverdrive.specs.get(id).pattern)).size`),assassin.length,'Assassin attacks need distinct pattern families');
assert.equal(ev('PGSkillOverdrive.specs.get("soulb").pattern'),'soulBreaker');assert.equal(ev('PGSkillOverdrive.specs.get("gc_ripper").pattern'),'ripper');
// v220 restyles Sonic Blow without losing its eight-hit cadence; the V216 restorations remain pinned.
assert.equal(ev('PGSkillOverdrive.specs.get("sonic").pattern'),'sonicBlow');
assert.equal(ev('PGSkillOverdrive.specs.get("sonic").count'),8,'eight alternating sonic arcs');
assert.equal(ev('PGSkillOverdrive.specs.get("sonic").cadence'),1.65,'current-game contact cadence');
assert.equal(ev('PGSkillOverdrive.specs.get("sonic").scale'),1);
assert.equal(ev('JSON.stringify(PGSkillOverdrive.specs.get("sonic").colors)'),JSON.stringify(['#ff4fd8','#35e7ff','#fff7fd']));
assert.equal(ev('!!PGSkillOverdrive.specs.get("sonic").preserveCurrent'),false,'redesigned Sonic Blow needs a meaningful Current/Overdrive A/B');
assert.equal(ev('PGSkillOverdrive.specs.get("mAss").pattern'),'nova','V216 caster-centred Meteor Assault nova');
assert.equal(ev('PGSkillOverdrive.specs.get("mAss").anchor'),'caster');
assert.equal(ev('PGSkillOverdrive.specs.get("mAss").power'),1.25);
assert.equal(ev('PGSkillOverdrive.specs.get("gc_roll").pattern'),'spin','V216 fast Rolling Cutter spin');
assert.equal(ev('PGSkillOverdrive.specs.get("gc_roll").fast'),true);
assert.equal(ev('PGSkillOverdrive.specs.get("gc_roll").count'),2,'V216 twin-blade circuit');
assert.equal(ev('PGSkillOverdrive.specs.get("gc_roll").life'),.46);
assert.equal(ev('PGSkillOverdrive.specs.get("gc_roll").anchor'),'caster');
for(const [id,pattern,age]of [['sonic','sonicBlow',.35],['vsplash','dashCut',.75],['soulb','soulBreaker',.75]]){
  assert.equal(ev(`PGSkillOverdrive.specs.get("${id}").pattern`),pattern);
  marks=0;box.id=id;box.heroAge=age;ev('var restoredHero=PGSkillOverdrive.create(document.createElement("canvas").getContext("2d"));restoredHero(id,1.65*heroAge,1)');
  assert(marks>25,id+' needs a substantial hero frame, not a collapsing residual line');assert.equal(depth,0);
  const traceAge=id==='sonic'?.35:.72;assert(trace(id,traceAge,1)>=trace(id,traceAge,.6),id+' Balanced detail must not add work');
}
assert(trace('sonic',.35,1)>trace('sonic',.35,.6),'Balanced removes secondary split-edge work');
assert.equal(trace('sonic',.35,1),trace('sonic',.35,1),'Sonic Blow is deterministic');
marks=0;ev('var currentSonic=PGAfterglowAnimations.legacyCreate(document.createElement("canvas").getContext("2d"));currentSonic("sonic",1.65*.35,1)');assert(marks>0,'current-game Sonic Blow fallback must remain available');
assert.equal(ev('PGSkillOverdrive.specs.get("vdust").pattern'),'crossCut','approved Cross Slash choreography stays on its existing pattern');
assert.equal(ev('[...PGSkillOverdrive.specs.values()].filter(s=>s.pattern==="aura").length'),ev('new Set([...PGSkillOverdrive.specs.values()].filter(s=>s.pattern==="aura").map(s=>s.variant)).size'),'self-buff symbols must not be recoloured duplicates');
const src=fs.readFileSync(path.join(root,'index.html'),'utf8'),adapter=fs.readFileSync(path.join(root,'assets/skill-afterglow.js'),'utf8');
assert(src.includes('assets/skill-overdrive.js?v=220'));assert(src.indexOf('assets/skill-overdrive.js')<src.indexOf('assets/skill-afterglow.js'));
assert(adapter.includes('overdrive().travel(id)'));assert(adapter.includes('overdrive().anchor(id)'));
console.log('Prismatic Overdrive: 111/111 explicit effects, six Ascension signatures, loaded material atlas, full/balanced/dense detail, deterministic motion, Canvas state, no-op safety, path/caster metadata and legacy fallback passed.');
