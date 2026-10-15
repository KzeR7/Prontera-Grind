// Compare selected dispatch against the exact reviewed sources, including drawing operations.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const report=JSON.parse(read('tools/skill-fx-proposals/owner-choices.json'));
const baseline=read('tools/skill-fx-proposals/afterglow-v8-baseline.js'),current=read('assets/afterglow-animations.js');
const old=read('tools/skill-fx-proposals/afterglow-v7.html');
const oldHelpers=old.slice(old.indexOf('const $='),old.indexOf('const ground=')).replace('const $=id=>document.getElementById(id),','const ');
const oldAnimation=old.slice(old.indexOf('// Tapered layered cuts:'),old.indexOf('function renderSkill('));
const legacy='const PGAfterglowAnimations={create(g){const TAU=Math.PI*2;let quality=1;'+oldHelpers+oldAnimation+'return(id,t,detail)=>{quality=detail;ANIM[id]?.(t)}}};';
function renderer(source){
  let trace=[];
  const clean=v=>v?.getContext?['canvas',v.width,v.height]:v?.atlas?'atlas':v;
  function canvas(){
    let ctx;
    const target={globalAlpha:1,globalCompositeOperation:'source-over'};
    const gradient=()=>({addColorStop(...args){trace.push(['stop',...args])}});
    for(const name of ['createLinearGradient','createRadialGradient'])target[name]=(...args)=>{trace.push([name,...args]);return gradient()};
    for(const name of ['save','restore','setTransform','clearRect','fill','stroke','drawImage','fillRect','fillText','translate','rotate','scale','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','ellipse','beginPath','closePath','clip'])target[name]=(...args)=>trace.push([name,...args.map(clean)]);
    ctx=new Proxy(target,{set(obj,key,value){obj[key]=value;trace.push(['set',key,typeof value==='object'?'gradient':value]);return true}});
    return {width:0,height:0,getContext:()=>ctx};
  }
  class Atlas{constructor(){this.atlas=true;this.complete=true;this.naturalWidth=this.naturalHeight=1024}}
  const box={document:{createElement:canvas},Image:Atlas,console};vm.createContext(box);
  vm.runInContext(read('assets/skill-materials.js')+'\n'+source+'\nthis.api=PGAfterglowAnimations;',box);
  return {api:box.api,draw(id,t,detail){const paint=box.api.create(canvas().getContext('2d'));trace=[];paint(id,t,detail);return JSON.stringify(trace)}};
}
const chosen=renderer(current),v8=renderer(baseline),v7=renderer(legacy);
assert.deepEqual(JSON.parse(JSON.stringify(chosen.api.choices)),Object.fromEntries(report.skills.filter(s=>s.choice!=='no-fx').map(s=>[s.id,s.choice])));
assert.equal(Object.values(chosen.api.choices).filter(v=>v==='old').length,9);
const redone=['jup','tstorm','meteor','pharrow','env','sdestroy','vsplash','akatar'];
assert.deepEqual([...chosen.api.redesigned].sort(),[...redone].sort());
const adjusted=new Set(['storm','sharp','dodge','grim','judex','spearboom','landmine','mAss',...redone]);
// Recreate contexts per comparison so cached textures have identical warm-up state.
let preserved=0;
for(const row of report.skills){
  if(row.choice==='no-fx'||adjusted.has(row.id))continue;
  const actual=renderer(current),expected=renderer(row.choice==='old'?legacy:baseline);
  for(const detail of [1,.6,.35])for(const time of [.2,.5,.9,1.4,2.1])
    assert.equal(actual.draw(row.id,time,detail),expected.draw(row.id,time,detail),row.id+' changed from selected '+row.choice+' source');
  preserved++;
}
for(const id of adjusted){
  const actual=renderer(current),expected=renderer(id==='mAss'?legacy:baseline);
  assert.notEqual(actual.draw(id,.55,1),expected.draw(id,.55,1),id+' feedback was not applied');
}
assert.equal(preserved,59);
console.log('Owner FX: 9 Old, 58 New, 8 undecided; all 59 effects without refinements match selected source operations at 3 detail levels / 5 times; 16 refinements/redesigns differ as intended; the 8 original undecided votes remain recorded.');

// Jupitel Thunder must retain the requested warm lightning palette, without its old blue orb.
const thunder=renderer(current).draw('jup',.4,1);
assert(thunder.includes('255,205,91'),'warm lightning missing');
assert(!thunder.includes('78,154,238'),'blue lightning orb returned');
