'use strict';
const $=id=>document.getElementById(id),catalog=PGAfterglowAnimations.catalog;
let roster=[...catalog],filtered=[],choices={},ready=false;
const STORAGE_KEY='prontera-skill-fx-choices-v1';
const SOURCES={"old": {"path": "tools/skill-fx-proposals/afterglow-v7.html", "sha256": "c3a87697fbde9e89d0042d417ab1cad521cb5586b7a4507a5e76553e83f619df"}, "new": {"path": "assets/afterglow-animations.js", "sha256": "01a628b3677a7140d33f5ec3f09a2a93689c55f59372877f82a6ef0e82fe41cc"}, "adapter": {"path": "assets/skill-afterglow.js", "sha256": "1f0a1535aafd2f33e472f71c5748fa26a2c87d520a3330f9608357b46ac1088a"}, "materials": {"path": "assets/skill-materials.js", "sha256": "c47c315d2f1721afad202b9651179682b7294ab8ef09482f57c50e1ef7edbd1b"}};
let elapsed=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,look=null,pet=null,selected=catalog.find(f=>f.id==='fireball'),last=0,lookRequest=0;
const store=new PGWardrobe.Store({base:'/assets/wardrobe/v5/'}),pets=new PGPetSprites.Store({base:'/assets/pets/v1/'});
const hero=document.createElement('canvas');hero.width=320;hero.height=280;const petCanvas=document.createElement('canvas');petCanvas.width=petCanvas.height=256;
const views=['before','after'].map(id=>({node:$(id),world:$(id).querySelector('.world'),canvas:$(id).querySelector('.fx')}));
views[1].renderer=PGSkillAfterglow.create(views[1].canvas);
const terrain=new Image();terrain.src='/assets/kit/ro-spritesheet.png';let manifest=null;let skills=new Map();
const patterns=new Map();
function currentChoice(id){return choices[id]||{choice:'undecided',notes:''}}
function filter(){
  const q=$('search').value.trim().toLowerCase(),job=$('job').value,status=$('review-filter').value;
  filtered=roster.filter(f=>(f.name+' '+f.id+' '+f.from).toLowerCase().includes(q)&&(!job||f.from===job)&&(!status||(status==='passive'?f.type==='pas':f.type!=='pas'&&currentChoice(f.id).choice===status)));
  $('skill').replaceChildren();
  for(const f of filtered){const opt=new Option((f.type==='pas'?'— ':({old:'[Old] ',new:'[New] ',undecided:'[?] '}[currentChoice(f.id).choice]))+f.name+' · '+f.from,f.id);$('skill').add(opt)}
  const found=filtered.some(f=>f.id===selected.id);
  if(found)$('skill').value=selected.id;else if(filtered.length)choose(filtered[0].id);
  $('empty').hidden=!!filtered.length;
  for(const node of document.querySelectorAll('.views,.decisions,.timeline,.caption'))node.hidden=!filtered.length;
  $('previous').disabled=$('next').disabled=!filtered.length;
  updateProgress();
}
function updateProgress(){const active=roster.filter(f=>f.type!=='pas'),done=active.filter(f=>currentChoice(f.id).choice!=='undecided').length;
  $('progress').textContent=done+' / '+active.length+' effects chosen · '+filtered.length+' skills shown · '+roster.filter(f=>f.type==='pas').length+' passives';
}
function updateChoice(){const saved=currentChoice(selected.id),passive=selected.type==='pas';
  $('choice-title').textContent=selected.name+' · '+selected.id;
  $('notes').value=saved.notes;$('passive-note').hidden=!passive;
  for(const b of document.querySelectorAll('[data-choice]')){b.disabled=passive||!ready;b.setAttribute('aria-pressed',String(b.dataset.choice===saved.choice))}
  $('notes').disabled=!ready;
}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(report()));$('save-status').textContent='Choices saved in this browser.'}catch(e){$('save-status').textContent='Browser storage unavailable. Download your JSON to keep your choices.'}}
function changed(){ $('export-code').value='';$('export-status').textContent='Choices changed. Generate a fresh code when ready.';persist();filter();updateChoice() }
async function choose(id){
  const found=roster.find(f=>f.id===id);if(!found)return;selected=found;$('skill').value=id;elapsed=0;
  $('description').textContent=selected.type==='pas'?'Passive skill · no cast effect.':selected.description||'';
  updateChoice();const request=++lookRequest;look=null;
  try{const next=await store.select('review',PGWardrobe.defaults('m'),selected.from);if(request===lookRequest)look=next}catch(e){if(request===lookRequest)$('status').textContent=e.message}
}
$('job').onchange=$('review-filter').onchange=filter;
for(const b of document.querySelectorAll('[data-choice]'))b.onclick=()=>{choices[selected.id]={...currentChoice(selected.id),choice:b.dataset.choice};changed()};
$('notes').oninput=()=>{choices[selected.id]={...currentChoice(selected.id),notes:$('notes').value};$('export-code').value='';$('export-status').textContent='Notes changed. Generate a fresh code when ready.';persist()};
function move(step){const index=filtered.findIndex(f=>f.id===selected.id);if(filtered.length)choose(filtered[(index+step+filtered.length)%filtered.length].id)}
$('previous').onclick=()=>move(-1);$('next').onclick=()=>move(1);
function report(){return {format:'prontera-skill-fx-choices',schemaVersion:1,sources:SOURCES,instruction:'Apply only explicit old/new FX choices. Leave undecided skills and combat mechanics unchanged.',skills:roster.map(f=>({id:f.id,name:f.name,job:f.from,...currentChoice(f.id),...(f.type==='pas'?{choice:'no-fx'}:{})}))}}
function validate(data){
  if(data?.format!=='prontera-skill-fx-choices'||data.schemaVersion!==1||!Array.isArray(data.skills))throw Error('Unsupported choice code.');
  for(const [key,value] of Object.entries(SOURCES))if(data.sources?.[key]?.sha256!==value.sha256)throw Error('Effect versions differ from this comparison. Keep this code and send it in chat for review.');
  const next={},seen=new Set();
  for(const row of data.skills){const f=roster.find(f=>f.id===row.id);if(!f||seen.has(row.id))throw Error('Unknown or duplicate skill ID.');seen.add(row.id);
    if(!(f.type==='pas'?row.choice==='no-fx':['old','new','undecided'].includes(row.choice))||typeof row.notes!=='string'||row.notes.length>2000)throw Error('Invalid skill choice or notes.');
    next[row.id]={choice:f.type==='pas'?'undecided':row.choice,notes:row.notes};
  }
  if(seen.size!==roster.length)throw Error('Code must include the complete skill list.');return next;
}
function generate(){const code=JSON.stringify(report(),null,2);$('export-code').value=code;$('export-status').textContent='Code ready. Send it in chat, or download the JSON.';return code}
$('generate').onclick=generate;
$('copy').onclick=async()=>{const code=generate();try{await navigator.clipboard.writeText(code);$('export-status').textContent='Copied. Paste this code into our chat.'}catch(e){$('export-code').focus();$('export-code').select();$('export-status').textContent='Select and copy the code below (Ctrl/Cmd+C).'}};
$('download').onclick=()=>{const blob=new Blob([generate()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='prontera-skill-fx-choices.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('import').onclick=()=>{try{if(!ready)throw Error('Wait for the skill list to load.');const next=validate(JSON.parse($('export-code').value));choices=next;persist();filter();updateChoice();$('export-status').textContent='Choices imported and saved.'}catch(e){$('export-status').textContent='Import failed: '+e.message}};
for(const id of ['generate','copy','download','import'])$(id).disabled=true;
$('search').oninput=filter;$('skill').onchange=e=>choose(e.target.value);$('replay').onclick=()=>{elapsed=0;paused=false;syncPause()};function syncPause(){$('toggle').textContent=paused?'Play':'Pause'}$('toggle').onclick=()=>{paused=!paused;syncPause()};$('timeline').oninput=e=>{elapsed=+e.target.value;paused=true;syncPause();draw()};
function draw(){
  const ms=elapsed,age=ms/1000;
  if(look)PGWardrobe.draw(hero.getContext('2d'),look,'attack',6,ms,Math.min(1,age/.5));
  if(pet)PGPetSprites.draw(petCanvas.getContext('2d'),pet,'idle',2,ms);
  for(const view of views){
    const w=view.node.clientWidth,h=view.node.clientHeight,dpr=Math.min(devicePixelRatio||1,2),g=view.world.getContext('2d');
    if(view.world.width!==Math.round(w*dpr))view.world.width=Math.round(w*dpr);if(view.world.height!==Math.round(h*dpr))view.world.height=Math.round(h*dpr);
    g.setTransform(dpr,0,0,dpr,0,0);g.fillStyle='#314835';g.fillRect(0,0,w,h);
    const tile=manifest?.tiles[$('ground').value];
    if(tile&&terrain.complete&&terrain.naturalWidth){let sample=patterns.get($('ground').value);if(!sample){sample=document.createElement('canvas');sample.width=sample.height=128;sample.getContext('2d').drawImage(terrain,tile.x,tile.y,tile.w,tile.h,0,0,128,128);patterns.set($('ground').value,sample)}g.fillStyle=g.createPattern(sample,'repeat');g.fillRect(0,0,w,h)}
    const shade=g.createLinearGradient(0,0,0,h);shade.addColorStop(0,'#14201c99');shade.addColorStop(1,'#14201c22');g.fillStyle=shade;g.fillRect(0,0,w,h);
    const project=(x,y,z)=>[w*.22+x*w*.13,h*.74+z*12-y*Math.min(38,w*.075)];
    const caster=project(0,0,0),target=project(4,0,0);g.imageSmoothingEnabled=false;
    if(look){const sc=3.05*Math.min(38,w*.075)/look.base.figureHeight;g.drawImage(hero,caster[0]-160*sc,caster[1]-200*sc,320*sc,280*sc)}
    if(pet){const sc=70/pet.figureHeight;g.drawImage(petCanvas,target[0]-128*sc,target[1]-192*sc,256*sc,256*sc)}
    const spec=skills.get(selected.id);
    const effects=selected.type!=='pas'&&age<2.2?[{id:selected.id,age,afterglow:true,x0:0,z0:0,x1:4,z1:0,magic:!!spec?.magic,areaScale:spec?.shape!=='single'?(spec?.areaScale||1):1,targetScale:spec?.shape==='single'?70/(3.05*Math.min(38,w*.075)):1}]:[];
    view.renderer?.draw(effects,w,h,project,dpr);
  }
  $('time').textContent=age.toFixed(2)+' s';$('timeline').value=ms;
}
async function init(){try{
  const [source,adapter,map,page]=await Promise.all([fetch('/tools/skill-fx-proposals/afterglow-v7.html',{integrity:'sha256-w6h2l/venonQBC1BerHK1SHLVYa3pFB6XnZVPoP2Gd8='}).then(r=>{if(!r.ok)throw Error('Cannot load '+r.url);return r.text()}),fetch('/assets/skill-afterglow.js',{integrity:'sha256-HwoVNar9LzPkcvccV0j6JqLIfVIKMzD5YINXtGrBCIo='}).then(r=>{if(!r.ok)throw Error('Cannot load '+r.url);return r.text()}),fetch('/assets/kit/ro-spritesheet.json').then(r=>{if(!r.ok)throw Error('Cannot load '+r.url);return r.json()}),fetch('/index.html').then(r=>{if(!r.ok)throw Error('Cannot load '+r.url);return r.text()})]);manifest=map;
  const definitions=page.slice(page.indexOf('const CD=['),page.indexOf('const pm=s=>'));skills=new Map(new Function(definitions+';return SKILLS')().map(s=>[s.id,s]));
  roster=[...catalog,...[...skills.values()].filter(s=>s.type==='pas').map(s=>({...s,name:s.n,from:s.from}))];
  for(const job of [...new Set(roster.map(f=>f.from))])$('job').add(new Option(job,job));
  try{const saved=localStorage.getItem(STORAGE_KEY);if(saved)choices=validate(JSON.parse(saved))}catch(e){$('save-status').textContent='Saved choices could not be restored: '+e.message}
  filter();updateChoice();
  const cat=source.slice(source.indexOf('const FX='),source.indexOf('const PASSIVES=')),helpers=source.slice(source.indexOf('const $='),source.indexOf('const ground=')).replace('const $=id=>document.getElementById(id),','const '),animation=source.slice(source.indexOf('// Tapered layered cuts:'),source.indexOf('function renderSkill('));
  const oldAPI=new Function(cat+'return {catalog:FX,create(g){const TAU=Math.PI*2;let quality=1;'+helpers+animation+'return(id,t,detail)=>{quality=detail;ANIM[id]?.(t)}}}')();
  const old=new Function('PGAfterglowAnimations','PGSkillMaterials',adapter+';return PGSkillAfterglow')(oldAPI,undefined);views[0].renderer=old.create(views[0].canvas);
  await pets.init();const id=pets.catalog.assets['1002-idle']?'1002-idle':'1002-idle-2';pet=await pets.request(id);
  await choose(selected.id);if(!look)throw Error('Native hero could not load.');
  ready=true;updateChoice();for(const id of ['generate','copy','download','import'])$(id).disabled=false;
  $('status').textContent='Native sprites ready · '+catalog.length+' effects';
}catch(e){$('status').textContent='Preview loading failed: '+e.message}}
filter();updateChoice();init();syncPause();
function tick(now){const delta=last?Math.min(now-last,60):0;last=now;if(!paused&&!document.hidden)elapsed=(elapsed+delta*+$('speed').value)%2600;draw();requestAnimationFrame(tick)}requestAnimationFrame(tick);
window.fxReview={select:choose,seek(ms){elapsed=ms;paused=true;syncPause();draw()},get state(){return {id:selected.id,elapsed,paused,materials:PGSkillMaterials.ready(),native:!!look&&!!pet,old:!!views[0].renderer}},draw};
