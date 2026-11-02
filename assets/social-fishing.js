/* Plaza fishing (v287), styled after classic hold-and-release fishing games:
   hold to charge a cast (PERFECT zone) → optional SHAKE clicks shorten the wait → bite →
   reel minigame (hold pulls the control bar right, release drifts left; keep the fish inside
   to fill progress, let it slip and progress drains). Catches land in one Fishing Bag UI —
   bag, records, show-off and settings all live in that single window. The 3D water/bobber
   visuals live in assets/social-scene.js; farming state is never touched. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PGSocialFishing=api})(globalThis,root=>{
'use strict';
// ------------------------------- pure core (covered by tools/tests/social_fishing_sim.js) --
const RARITIES=[
 {id:'common',label:'Common',color:'#b9c6c4',weight:.58},
 {id:'uncommon',label:'Uncommon',color:'#7fd98a',weight:.24},
 {id:'rare',label:'Rare',color:'#58a6ff',weight:.12},
 {id:'legendary',label:'Legendary',color:'#ffb84d',weight:.045},
 {id:'mythical',label:'Mythical',color:'#c792ea',weight:.012},
 {id:'secret',label:'Secret',color:'#ff7ab8',weight:.003},
];
const RARITY_INDEX=Object.fromEntries(RARITIES.map((r,i)=>[r.id,i]));
const SPECIES=[
 {id:'minnow',name:'Plaza Minnow',rarity:'common',glyph:'🐟',hue:0,min:.1,max:.7},
 {id:'carp',name:'Cobble Carp',rarity:'common',glyph:'🐟',hue:95,min:.8,max:3.5},
 {id:'smelt',name:'Fountain Smelt',rarity:'common',glyph:'🐠',hue:150,min:.2,max:.9},
 {id:'goby',name:'Lawn Goby',rarity:'common',glyph:'🐡',hue:100,min:.3,max:1.2},
 {id:'bream',name:'Brass Bream',rarity:'uncommon',glyph:'🐟',hue:40,min:1,max:4},
 {id:'perch',name:'Garden Perch',rarity:'uncommon',glyph:'🐠',hue:70,min:.8,max:2.8},
 {id:'trout',name:'Canal Trout',rarity:'uncommon',glyph:'🐟',hue:190,min:1.5,max:5},
 {id:'koi',name:'Royal Koi',rarity:'rare',glyph:'🐠',hue:320,min:2,max:8},
 {id:'pike',name:'Knight Pike',rarity:'rare',glyph:'🐟',hue:225,min:3,max:10},
 {id:'tetra',name:'Crystal Tetra',rarity:'rare',glyph:'🐠',hue:260,min:.4,max:1.5},
 {id:'fountainfish',name:'Gilded Fountainfish',rarity:'legendary',glyph:'🐠',hue:25,min:1,max:6},
 {id:'arowana',name:'Prontera Arowana',rarity:'legendary',glyph:'🐟',hue:285,min:4,max:14},
 {id:'leviathan',name:'Pond Leviathan',rarity:'mythical',glyph:'🦈',hue:175,min:12,max:40},
 {id:'poring',name:'Poring Puffer',rarity:'secret',glyph:'🐡',hue:300,min:.5,max:2},
];
const SPECIES_BY_ID=Object.fromEntries(SPECIES.map(s=>[s.id,s]));
const MUTATIONS={shiny:{label:'Shiny',badge:'✨',chance:.05},sparkling:{label:'Sparkling',badge:'🌟',chance:.012}};
// Reel feel per rarity: control-bar width, fish wander speed, dash chance, fill/drain per second.
const DIFF={
 common:{bar:.34,speed:.42,dash:.16,fill:.165,drain:.1},
 uncommon:{bar:.31,speed:.52,dash:.22,fill:.15,drain:.105},
 rare:{bar:.28,speed:.62,dash:.32,fill:.135,drain:.11},
 legendary:{bar:.25,speed:.74,dash:.44,fill:.12,drain:.115},
 mythical:{bar:.22,speed:.86,dash:.56,fill:.108,drain:.12},
 secret:{bar:.24,speed:.8,dash:.5,fill:.112,drain:.118},
};
const BAG_MAX=120,CAST_GREEN=[.82,.96],CAST_PERFECT=[.87,.93];
const speciesById=id=>SPECIES_BY_ID[id]||null;
const rarityById=id=>RARITIES[RARITY_INDEX[id]]||RARITIES[0];
function pickRarity(rng){const r=rng();let acc=0;for(const t of RARITIES){acc+=t.weight;if(r<acc)return t.id}return 'common'}
// A PERFECT cast rolls rarity twice and keeps the better roll; it never makes a roll worse.
function rollCatch(rng=Math.random,boost=false){
 let rid=pickRarity(rng);
 if(boost){const other=pickRarity(rng);if(RARITY_INDEX[other]>RARITY_INDEX[rid])rid=other}
 const pool=SPECIES.filter(s=>s.rarity===rid);
 const sp=pool[Math.min(pool.length-1,Math.floor(rng()*pool.length))];
 const heft=Math.pow(rng(),2);
 const w=Math.round((sp.min+(sp.max-sp.min)*heft)*100)/100;
 const roll=rng();
 const mut=roll<MUTATIONS.sparkling.chance?'sparkling':roll<MUTATIONS.sparkling.chance+MUTATIONS.shiny.chance?'shiny':null;
 return {sp:sp.id,rarity:rid,w,mut};
}
// Cast charge only sets throw distance; PERFECT is a timing bonus, not a loot guarantee.
function castRating(p){
 p=Math.max(0,Math.min(1,Number(p)||0));
 const perfect=p>=CAST_PERFECT[0]&&p<=CAST_PERFECT[1];
 const label=perfect?'PERFECT':p>=CAST_GREEN[0]&&p<=CAST_GREEN[1]?'Amazing':p>=.6?'Great':p>=.35?'Good':'Meh';
 return {label,perfect,power:p,dist:.25+.75*p};
}
function makeReel(fish,rng){
 const d=DIFF[fish.rarity]||DIFF.common,sp=speciesById(fish.sp);
 const heft=sp?Math.max(0,Math.min(1,(fish.w-sp.min)/Math.max(.01,sp.max-sp.min))):.5;
 return {bar:.5,vel:0,barW:d.bar,fish:.5,fishVel:0,target:.5,swapIn:.5,speed:d.speed*(1+heft*.25),dash:d.dash,fill:d.fill,drain:d.drain,progress:.33,lock:1.1,t:0,on:true,perfect:true,rng:rng||Math.random};
}
// One physics step. Hold pushes the control bar right, release lets it fall left; progress only
// moves after the opening lock. Returns 'catch', 'escape' or null.
function reelStep(s,dt,holding){
 dt=Math.max(0,Math.min(.1,Number(dt)||0));if(!dt)return null;
 s.t+=dt;
 s.vel+=(holding?3.4:-2.8)*dt;s.vel*=Math.pow(.14,dt);
 s.bar+=s.vel*dt;
 const hw=s.barW/2;
 if(s.bar<hw){s.bar=hw;if(s.vel<0)s.vel*=-.25}
 if(s.bar>1-hw){s.bar=1-hw;if(s.vel>0)s.vel*=-.25}
 s.swapIn-=dt;
 if(s.swapIn<=0){s.swapIn=.45+s.rng()*.75;s.target=Math.max(.04,Math.min(.96,s.rng()));if(s.rng()<s.dash)s.fishVel+=(s.target>s.fish?1:-1)*s.speed*1.6}
 s.fishVel+=(s.target-s.fish)*s.speed*3.2*dt;s.fishVel*=Math.pow(.05,dt);
 s.fish+=s.fishVel*dt;
 if(s.fish<.02){s.fish=.02;s.fishVel=Math.abs(s.fishVel)*.5}
 if(s.fish>.98){s.fish=.98;s.fishVel=-Math.abs(s.fishVel)*.5}
 s.on=Math.abs(s.fish-s.bar)<=hw+.015;
 if(s.lock>0){s.lock-=dt;return null}
 if(s.on)s.progress+=s.fill*dt;else{s.progress-=s.drain*dt;s.perfect=false}
 if(s.progress>=1){s.progress=1;return 'catch'}
 if(s.progress<=0){s.progress=0;return 'escape'}
 return null;
}
const cnt=v=>Math.max(0,Math.min(1e9,Math.floor(Number(v)||0)));
function cleanEntry(e){
 if(!e||typeof e!=='object')return null;
 const sp=speciesById(e.sp);if(!sp)return null;
 return {
  id:typeof e.id==='string'&&e.id?e.id.slice(0,40):'f'+Math.random().toString(36).slice(2,10),
  sp:sp.id,
  w:Math.round(Math.max(.01,Math.min(999,Number(e.w)||sp.min))*100)/100,
  mut:Object.hasOwn(MUTATIONS,e.mut)?e.mut:null,
  at:Math.max(0,Math.floor(Number(e.at)||0)),
  perfect:e.perfect===true,
 };
}
// Accepts any stored shape (including corruption) and returns a safe fishing blob.
function normalize(raw){
 const f=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const bag=[],ids=new Set();
 for(const e of (Array.isArray(f.bag)?f.bag:[]).map(cleanEntry).filter(Boolean).slice(-BAG_MAX)){
  while(ids.has(e.id))e.id='f'+Math.random().toString(36).slice(2,10);
  ids.add(e.id);bag.push(e);
 }
 const dex={};
 if(f.dex&&typeof f.dex==='object'&&!Array.isArray(f.dex))for(const sp of SPECIES){
  const d=f.dex[sp.id];
  if(d&&typeof d==='object')dex[sp.id]={n:cnt(d.n),bw:Math.round(Math.max(0,Math.min(999,Number(d.bw)||0))*100)/100,at:Math.max(0,Math.floor(Number(d.at)||0)),mut:[...new Set((Array.isArray(d.mut)?d.mut:[]).filter(m=>Object.hasOwn(MUTATIONS,m)))]};
 }
 const st=f.stats&&typeof f.stats==='object'?f.stats:{};
 const se=f.settings&&typeof f.settings==='object'?f.settings:{};
 return {v:1,bag,dex,stats:{casts:cnt(st.casts),catches:cnt(st.catches),escapes:cnt(st.escapes),perfects:cnt(st.perfects)},settings:{fish:se.fish!==false,sound:se.sound!==false}};
}
// Adds a rolled catch to the bag and bestiary. Returns the entry, or null when the bag is full.
function addCatch(state,c,now=Date.now()){
 if(!state||state.bag.length>=BAG_MAX)return null;
 const sp=speciesById(c.sp);if(!sp)return null;
 let id='f'+now.toString(36)+Math.floor(Math.random()*46656).toString(36);
 while(state.bag.some(e=>e.id===id))id+='x';
 const entry={id,sp:sp.id,w:Math.round(Math.max(.01,Math.min(999,Number(c.w)||sp.min))*100)/100,mut:Object.hasOwn(MUTATIONS,c.mut)?c.mut:null,at:now,perfect:c.perfect===true};
 state.bag.push(entry);
 const d=state.dex[entry.sp]||(state.dex[entry.sp]={n:0,bw:0,at:now,mut:[]});
 d.n++;if(entry.w>d.bw)d.bw=entry.w;if(entry.mut&&!d.mut.includes(entry.mut))d.mut.push(entry.mut);
 state.stats.catches++;if(entry.perfect)state.stats.perfects++;
 return entry;
}
// Show-off text comes only from a fish that is actually in the bag.
function showOffText(state,entryId,playerName){
 const e=state&&state.bag.find(x=>x.id===entryId);if(!e)return null;
 const sp=speciesById(e.sp),r=rarityById(sp.rarity);
 const mut=e.mut?MUTATIONS[e.mut].badge+' '+MUTATIONS[e.mut].label+' ':'';
 return `🎣 shows off a ${mut}${sp.name} — ${e.w} kg (${r.label}${e.perfect?' · Perfect catch ⭐':''})!`;
}
// ------------------------------- browser UI ------------------------------------------------
const doc=root.document;
let opts=null,els=null,fallbackHost={};
const normalized=new WeakSet();
function state(){
 const host=opts&&opts.host?opts.host():null,holder=host&&typeof host==='object'?host:fallbackHost;
 if(!holder.fishing||!normalized.has(holder.fishing)){holder.fishing=normalize(holder.fishing);normalized.add(holder.fishing)}
 return holder.fishing;
}
function persist(){if(opts&&typeof opts.save==='function')opts.save()}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const R=()=>root.PGSocialRules;
const now=()=>performance.now();
const REDUCED=()=>{try{return root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches}catch{return false}};
// Tiny synthesized cues — no audio assets, obeys the Sounds toggle in the bag.
let actx=null;
function tone(freq,at,dur,type='sine',gain=.045){
 const o=actx.createOscillator(),g=actx.createGain();
 o.type=type;o.frequency.value=freq;o.connect(g);g.connect(actx.destination);
 g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(gain,at+.012);g.gain.exponentialRampToValueAtTime(.0001,at+dur);
 o.start(at);o.stop(at+dur+.02);
}
function sound(kind){
 if(!state().settings.sound)return;
 try{
  actx=actx||new (root.AudioContext||root.webkitAudioContext)();
  if(actx.state==='suspended')actx.resume();
  const t=actx.currentTime;
  if(kind==='cast'){tone(520,t,.09,'triangle');tone(300,t+.07,.12,'triangle')}
  else if(kind==='plop'){tone(190,t,.14,'sine',.06);tone(120,t+.05,.16,'sine',.05)}
  else if(kind==='shake'){tone(640,t,.07,'square',.03);tone(860,t+.05,.07,'square',.03)}
  else if(kind==='bite'){tone(880,t,.09,'sine',.06);tone(1175,t+.09,.12,'sine',.06)}
  else if(kind==='catch'){tone(523,t,.12,'triangle',.05);tone(659,t+.1,.12,'triangle',.05);tone(784,t+.2,.2,'triangle',.06)}
  else if(kind==='perfect'){tone(784,t,.1,'triangle',.05);tone(988,t+.08,.1,'triangle',.05);tone(1319,t+.16,.22,'triangle',.06)}
  else if(kind==='fail'){tone(330,t,.14,'sawtooth',.03);tone(220,t+.12,.22,'sawtooth',.03)}
 }catch{}
}
const ui={phase:'off',pond:-1,holding:false,chargeT0:0,castR:null,biteAt:0,biteEnd:0,shakeAt:0,shakeEl:null,roll:null,reel:null,raf:0,last:0,selected:null,sort:'new',walkHintAt:0,result:null};
function sceneFishing(){return opts&&opts.scene&&opts.scene()?opts.scene().fishing:null}
function pondCenter(){const p=(R().PONDS||[])[ui.pond];return p||null}
function selfPos(){return opts&&opts.self?opts.self():null}
function distToPond(){
 const p=pondCenter(),s=selfPos();if(!p||!s)return Infinity;
 const dx=Math.max(0,Math.abs(s.x-p.x)-p.w/2),dz=Math.max(0,Math.abs(s.z-p.z)-p.d/2);
 return Math.hypot(dx,dz);
}
function standPoint(p,s){
 // Nearest walkable spot on the grass ring around the pond rim.
 const cx=Math.max(p.x-p.w/2-1.6,Math.min(p.x+p.w/2+1.6,s.x)),cz=Math.max(p.z-p.d/2-1.6,Math.min(p.z+p.d/2+1.6,s.z));
 const candidates=[{x:cx,z:cz}];
 for(const a of [0,.5,1,1.5,2,2.5,3,3.5]){const ang=a*Math.PI/4;candidates.push({x:p.x+Math.cos(ang)*(p.w/2+1.7),z:p.z+Math.sin(ang)*(p.d/2+1.7)})}
 return candidates.find(c=>R().walkable(c.x,c.z))||null;
}
function ensureDom(){
 if(els||!doc)return;
 const hub=doc.getElementById('socialHub');if(!hub)return;
 const dock=doc.createElement('section');dock.id='fishingDock';dock.hidden=true;dock.setAttribute('aria-label','Fishing');
 dock.innerHTML='<div id="fishingDockHead"><span id="fishingSpot">🎣 South Lawn Pond</span><span id="fishingDockBtns"><button id="fishingBagBtn" type="button" aria-haspopup="dialog">🧺 Bag <small id="fishingBagCount"></small></button><button id="fishingStopBtn" type="button" title="Stop fishing" aria-label="Stop fishing">✕</button></span></div><div id="fishingStage" role="button" tabindex="0" aria-label="Fishing action area"></div><p id="fishingStatus" aria-live="polite"></p>';
 const panel=doc.createElement('section');panel.id='fishingPanel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Fishing Bag');
 panel.innerHTML='<header id="fishingPanelHead"><strong>🧺 Fishing Bag</strong><button id="fishingPanelClose" type="button" aria-label="Close Fishing Bag">✕</button></header><div id="fishingRecords"></div><div id="fishingTools"><select id="fishingSort" aria-label="Sort fish"><option value="new">Newest</option><option value="heavy">Heaviest</option><option value="rare">Rarest</option></select><label title="Show the fish swimming in the ponds"><input type="checkbox" id="fishingShowFish"> Pond fish</label><label title="Fishing sound effects"><input type="checkbox" id="fishingSound"> Sounds</label></div><div id="fishingGrid" role="listbox" aria-label="Caught fish"></div><footer id="fishingDetail" hidden></footer>';
 const shakes=doc.createElement('div');shakes.id='fishingShakes';shakes.hidden=true;
 if(REDUCED()){dock.classList.add('reduced');shakes.classList.add('reduced')}
 hub.append(dock,panel,shakes);
 els={hub,dock,panel,shakes,stage:doc.getElementById('fishingStage'),status:doc.getElementById('fishingStatus'),grid:doc.getElementById('fishingGrid'),records:doc.getElementById('fishingRecords'),detail:doc.getElementById('fishingDetail'),bagCount:doc.getElementById('fishingBagCount'),spot:doc.getElementById('fishingSpot')};
 doc.getElementById('fishingStopBtn').onclick=()=>stopFishing();
 doc.getElementById('fishingBagBtn').onclick=()=>toggleBag();
 doc.getElementById('fishingPanelClose').onclick=()=>toggleBag(false);
 doc.getElementById('fishingSort').onchange=e=>{ui.sort=e.target.value;renderBag()};
 doc.getElementById('fishingShowFish').onchange=e=>{state().settings.fish=e.target.checked;persist();const f=sceneFishing();f&&f.setFishVisible(e.target.checked)};
 doc.getElementById('fishingSound').onchange=e=>{state().settings.sound=e.target.checked;persist()};
 els.stage.addEventListener('pointerdown',e=>{if(ui.phase==='result')return;e.preventDefault();holdDown()});
 els.stage.addEventListener('pointerup',e=>{e.preventDefault();holdUp()});
 els.stage.addEventListener('pointercancel',()=>holdUp());
 doc.addEventListener('keydown',e=>{
  if(e.code!=='Space'||ui.phase==='off'||e.repeat)return;
  const t=e.target;if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;
  e.preventDefault();holdDown();
 });
 doc.addEventListener('keyup',e=>{
  if(e.code!=='Space'||ui.phase==='off')return;
  const t=e.target;if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;
  e.preventDefault();holdUp();
 });
}
function status(text){if(els)els.status.textContent=text||''}
function setPhase(phase){ui.phase=phase;renderStage();if(opts&&opts.button)opts.button.textContent=phase==='off'?'🎣 Fishing':'🎣 Stop fishing';if(opts&&opts.button)opts.button.setAttribute('aria-pressed',String(phase!=='off'))}
function glyphHTML(sp,mut,cls='fishing-glyph'){
 return `<span class="${cls}${mut?' mut-'+mut:''}" style="filter:hue-rotate(${sp.hue}deg)${mut==='shiny'?' drop-shadow(0 0 6px #ffe9a0)':mut==='sparkling'?' drop-shadow(0 0 8px #b7f2ff)':''}">${sp.glyph}</span>`;
}
function renderStage(){
 if(!els)return;
 const stage=els.stage;
 els.dock.hidden=ui.phase==='off';
 els.dock.dataset.phase=ui.phase;
 els.bagCount.textContent=state().bag.length+'/'+BAG_MAX;
 if(ui.phase==='off'){clearShake();return}
 if(ui.phase==='walking'){stage.innerHTML='<div class="fishing-wait"><span class="fishing-walk">🚶</span> Walking to the pond…</div>';status('Click 🎣 Stop fishing to cancel.');return}
 if(ui.phase==='ready'){
  stage.innerHTML='<button id="fishingHold" type="button" class="fishing-hold"><span class="fishing-hold-ring"></span><span class="fishing-hold-icon">🎣</span><span class="fishing-hold-text">HOLD to cast</span></button>';
  status('Hold the button (or Space), release in the green zone for a PERFECT cast.');
  return;
 }
 if(ui.phase==='charge'){
  stage.innerHTML='<div class="fishing-meter"><div class="fishing-meter-track"><i class="fishing-meter-green"></i><i class="fishing-meter-perfect"></i><b id="fishingMeterMark"></b></div><p class="fishing-meter-tip">Release in the green!</p></div>';
  return;
 }
 if(ui.phase==='flight'){stage.innerHTML=`<div class="fishing-wait"><span class="fishing-cast-label${ui.castR&&ui.castR.perfect?' is-perfect':''}">${ui.castR?esc(ui.castR.label):''} cast!</span></div>`;status('');return}
 if(ui.phase==='wait'){stage.innerHTML='<div class="fishing-wait"><span class="fishing-bob">🎈</span> Waiting for a bite<span class="fishing-dots"><i>.</i><i>.</i><i>.</i></span></div>';status('Click the SHAKE! bubbles to attract fish faster.');return}
 if(ui.phase==='bite'){stage.innerHTML='<div class="fishing-bite"><span>❗</span> BITE — CLICK!</div>';status('');return}
 if(ui.phase==='reel'){
  stage.innerHTML='<div class="fishing-reel"><div class="fishing-track"><div id="fishingBarEl" class="fishing-bar"></div><span id="fishingFishEl" class="fishing-fish">🐟</span></div><div class="fishing-progress"><i id="fishingProgressEl"></i></div><div class="fishing-reel-row"><span id="fishingCrank" class="fishing-crank">🎣</span><span id="fishingReelHint">HOLD to pull ▶ · release to drift ◀</span><span id="fishingPerfectStar" title="Perfect so far">⭐</span></div></div>';
  status('Keep the fish inside your bar to fill the line!');
  return;
 }
 if(ui.phase==='result'){
  const r=ui.result;
  if(!r){setPhase('ready');return}
  if(r.kind==='catch'){
   const sp=speciesById(r.entry.sp),rar=rarityById(sp.rarity);
   stage.innerHTML=`<div class="fishing-card" data-rarity="${sp.rarity}" style="--rar:${rar.color}">${r.isNew?'<span class="fishing-new">NEW SPECIES!</span>':''}${glyphHTML(sp,r.entry.mut,'fishing-card-glyph')}<div class="fishing-card-info"><strong>${esc(sp.name)}</strong><span class="fishing-chip" style="background:${rar.color}">${rar.label}</span>${r.entry.mut?`<span class="fishing-chip fishing-mut">${MUTATIONS[r.entry.mut].badge} ${MUTATIONS[r.entry.mut].label}</span>`:''}<p>${r.entry.w} kg${r.entry.perfect?' · Perfect catch ⭐':''}</p></div><div class="fishing-card-btns"><button id="fishingAgain" type="button">🎣 Cast again</button><button id="fishingBrag" type="button">📣 Show off</button></div></div>`;
   doc.getElementById('fishingAgain').onclick=()=>{ui.result=null;setPhase('ready')};
   doc.getElementById('fishingBrag').onclick=()=>{showOff(r.entry.id);ui.result=null;setPhase('ready')};
   status('Space casts again.');
  }else{
   stage.innerHTML=`<div class="fishing-card is-escape"><span class="fishing-card-glyph">💨</span><div class="fishing-card-info"><strong>${r.kind==='slow'?'Too slow — it got away…':'The line went slack — it escaped!'}</strong><p>Keep the fish inside your bar next time.</p></div><div class="fishing-card-btns"><button id="fishingAgain" type="button">🎣 Try again</button></div></div>`;
   doc.getElementById('fishingAgain').onclick=()=>{ui.result=null;setPhase('ready')};
   status('Space casts again.');
  }
  return;
 }
}
function clearShake(){if(ui.shakeEl){ui.shakeEl.remove();ui.shakeEl=null}if(els)els.shakes.hidden=true}
function spawnShake(){
 if(!els)return;
 clearShake();
 els.shakes.hidden=false;
 const b=doc.createElement('button');b.type='button';b.className='fishing-shake';b.textContent='SHAKE!';
 b.style.left=(22+Math.random()*56)+'%';b.style.top=(24+Math.random()*44)+'%';
 b.onclick=()=>{ui.biteAt-=700;sound('shake');b.classList.add('popped');setTimeout(()=>{if(ui.shakeEl===b)clearShake()},160)};
 els.shakes.append(b);ui.shakeEl=b;
 setTimeout(()=>{if(ui.shakeEl===b&&!b.classList.contains('popped'))clearShake()},1700);
}
function holdDown(){
 if(ui.phase==='ready'){
  if(state().bag.length>=BAG_MAX){status('Bag full ('+BAG_MAX+') — release some fish first.');toggleBag(true);return}
  ui.holding=true;ui.chargeT0=now();setPhase('charge');return;
 }
 if(ui.phase==='bite'){hook();return}
 if(ui.phase==='reel'){ui.holding=true;const c=doc.getElementById('fishingCrank');c&&c.classList.add('spin');return}
 if(ui.phase==='result'){ui.result=null;setPhase('ready');return}
}
function holdUp(){
 if(ui.phase==='charge'&&ui.holding){ui.holding=false;releaseCast();return}
 if(ui.phase==='reel'){ui.holding=false;const c=doc.getElementById('fishingCrank');c&&c.classList.remove('spin')}
}
function castPower(){
 const t=(now()-ui.chargeT0)/1100,leg=t%2;
 return leg<=1?leg:2-leg; // ping-pong 0→1→0
}
function releaseCast(){
 const p=pondCenter(),s=selfPos();if(!p||!s){stopFishing();return}
 ui.castR=castRating(castPower());
 state().stats.casts++;persist();
 // Land along the line from the player toward the far side of the pond, by cast distance.
 const inX=[p.x-p.w/2+1.2,p.x+p.w/2-1.2],inZ=[p.z-p.d/2+1.1,p.z+p.d/2-1.1];
 const nearX=Math.max(inX[0],Math.min(inX[1],s.x)),nearZ=Math.max(inZ[0],Math.min(inZ[1],s.z));
 const farX=Math.max(inX[0],Math.min(inX[1],2*p.x-nearX)),farZ=Math.max(inZ[0],Math.min(inZ[1],2*p.z-nearZ));
 const t=ui.castR.dist,tx=nearX+(farX-nearX)*t+(Math.random()-.5)*.8,tz=nearZ+(farZ-nearZ)*t+(Math.random()-.5)*.8;
 const target={x:Math.max(inX[0],Math.min(inX[1],tx)),z:Math.max(inZ[0],Math.min(inZ[1],tz))};
 sound('cast');
 setPhase('flight');
 const f=sceneFishing();
 if(f)f.cast(target,650+350*ui.castR.dist,()=>{sound('plop');landed()});
 else landed();
}
function landed(){
 if(ui.phase!=='flight')return;
 setPhase('wait');
 ui.biteAt=now()+4000+Math.random()*8000;
 ui.shakeAt=now()+1300;
}
function hook(){
 clearShake();
 const f=sceneFishing();f&&f.bite(false);
 ui.roll=rollCatch(Math.random,!!(ui.castR&&ui.castR.perfect));
 ui.reel=makeReel(ui.roll);
 ui.last=now();
 setPhase('reel');
 f&&f.reel(.3);
}
function finishReel(kind){
 const f=sceneFishing();
 if(kind==='catch'){
  const isNew=!state().dex[ui.roll.sp];
  const entry=addCatch(state(),{...ui.roll,perfect:ui.reel.perfect});
  persist();
  const sp=speciesById(ui.roll.sp);
  sound(entry&&entry.perfect?'perfect':'catch');
  if(f)f.catchFly(sp.glyph,sp.hue,()=>{});
  ui.result={kind:'catch',entry:entry||{...ui.roll,id:'',at:Date.now(),perfect:ui.reel.perfect},isNew};
  if(!entry)status('Bag full — the catch could not be kept!');
 }else{
  state().stats.escapes++;persist();
  sound('fail');
  f&&f.escapeSplash();
  ui.result={kind};
 }
 ui.roll=null;ui.reel=null;
 setPhase('result');
}
function tick(t){
 if(ui.phase==='off')return;
 ui.raf=requestAnimationFrame(tick);
 const dt=ui.last?Math.min(.1,Math.max(0,(t-ui.last)/1000)):0;ui.last=t;
 if(['ready','charge','wait','bite','reel'].includes(ui.phase)&&distToPond()>6.5){
  stopFishing('You stepped away from the pond.');
  return;
 }
 if(ui.phase==='walking'){
  if(distToPond()<=2.4)setPhase('ready');
  return;
 }
 if(ui.phase==='charge'){
  const mark=doc.getElementById('fishingMeterMark');
  if(mark)mark.style.left=(castPower()*100).toFixed(1)+'%';
  return;
 }
 if(ui.phase==='wait'){
  if(t>=ui.biteAt){
   setPhase('bite');ui.biteEnd=t+1500;clearShake();
   sound('bite');const f=sceneFishing();f&&f.bite(true);
   return;
  }
  if(t>=ui.shakeAt){ui.shakeAt=t+1500+Math.random()*1200;spawnShake()}
  return;
 }
 if(ui.phase==='bite'){
  if(t>=ui.biteEnd){const f=sceneFishing();f&&f.escapeSplash();state().stats.escapes++;persist();sound('fail');ui.result={kind:'slow'};setPhase('result')}
  return;
 }
 if(ui.phase==='reel'&&ui.reel){
  const out=reelStep(ui.reel,dt,ui.holding);
  const bar=doc.getElementById('fishingBarEl'),fish=doc.getElementById('fishingFishEl'),prog=doc.getElementById('fishingProgressEl'),star=doc.getElementById('fishingPerfectStar');
  if(bar){bar.style.width=(ui.reel.barW*100)+'%';bar.style.left=((ui.reel.bar-ui.reel.barW/2)*100)+'%';bar.classList.toggle('on',ui.reel.on);bar.classList.toggle('held',ui.holding)}
  if(fish)fish.style.left=(ui.reel.fish*100)+'%';
  if(prog){prog.style.width=(ui.reel.progress*100).toFixed(1)+'%';prog.classList.toggle('danger',ui.reel.progress<.22)}
  if(star)star.hidden=!ui.reel.perfect;
  const f=sceneFishing();f&&f.reel(Math.min(1,Math.abs(ui.reel.fishVel)/1.4));
  if(out)finishReel(out);
 }
}
function startLoop(){cancelAnimationFrame(ui.raf);ui.last=0;ui.raf=requestAnimationFrame(tick)}
function startFishing(pondIdx){
 ensureDom();
 if(!els||!R()||!R().PONDS||!R().PONDS.length)return;
 const s=selfPos();
 if(!s){if(opts&&opts.notice)opts.notice('Fishing needs your character in the plaza.');return}
 ui.pond=Number.isInteger(pondIdx)&&R().PONDS[pondIdx]?pondIdx:R().PONDS.reduce((best,p,i)=>{
  const d=Math.hypot(s.x-p.x,s.z-p.z);return d<best.d?{i,d}:best;
 },{i:0,d:Infinity}).i;
 els.spot.textContent='🎣 '+(ui.pond===0?'West':'East')+' Lawn Pond';
 const p=pondCenter();
 if(distToPond()>2.4){
  const stand=standPoint(p,s);
  if(stand&&opts.moveTo){opts.moveTo(stand.x,stand.z);setPhase('walking')}
  else setPhase('walking');
 }else setPhase('ready');
 const f=sceneFishing();f&&f.setFishVisible(state().settings.fish);
 startLoop();
}
function stopFishing(message){
 if(ui.phase==='off')return;
 cancelAnimationFrame(ui.raf);
 clearShake();
 const f=sceneFishing();f&&f.off();
 ui.holding=false;ui.roll=null;ui.reel=null;ui.result=null;
 setPhase('off');
 if(message&&opts&&opts.notice)opts.notice(message);
}
// ---------------- Fishing Bag (the one fishing window: bag + records + settings) -----------
function toggleBag(force){
 ensureDom();if(!els)return;
 const show=typeof force==='boolean'?force:els.panel.hidden;
 els.panel.hidden=!show;
 if(show){syncSettings();renderBag()}
}
function syncSettings(){
 const st=state();
 const sf=doc.getElementById('fishingShowFish'),sn=doc.getElementById('fishingSound'),so=doc.getElementById('fishingSort');
 if(sf)sf.checked=st.settings.fish;
 if(sn)sn.checked=st.settings.sound;
 if(so)so.value=ui.sort;
}
function sortedBag(){
 const bag=[...state().bag];
 if(ui.sort==='heavy')bag.sort((a,b)=>b.w-a.w);
 else if(ui.sort==='rare')bag.sort((a,b)=>RARITY_INDEX[speciesById(b.sp).rarity]-RARITY_INDEX[speciesById(a.sp).rarity]||b.w-a.w);
 else bag.sort((a,b)=>b.at-a.at);
 return bag;
}
function renderBag(){
 if(!els)return;
 const st=state();
 const best=st.bag.reduce((b,e)=>!b||e.w>b.w?e:b,null);
 const species=Object.keys(st.dex).filter(k=>st.dex[k].n>0).length;
 els.records.innerHTML=`<span>Catches <b>${st.stats.catches}</b></span><span>Species <b>${species}/${SPECIES.length}</b></span><span>Perfect <b>${st.stats.perfects}</b></span><span>${best?`Best <b>${esc(speciesById(best.sp).name)} ${best.w} kg</b>`:'Best <b>—</b>'}</span><span>Bag <b>${st.bag.length}/${BAG_MAX}</b></span>`;
 els.bagCount.textContent=st.bag.length+'/'+BAG_MAX;
 const bag=sortedBag();
 if(!bag.length){els.grid.innerHTML='<p class="fishing-empty">No fish yet — stand by a South Lawn pond and press 🎣 Fishing to cast.</p>';els.detail.hidden=true;ui.selected=null;return}
 els.grid.replaceChildren(...bag.map(e=>{
  const sp=speciesById(e.sp),r=rarityById(sp.rarity);
  const b=doc.createElement('button');b.type='button';b.className='fishing-slot';b.dataset.rarity=sp.rarity;b.style.setProperty('--rar',r.color);
  b.setAttribute('role','option');b.setAttribute('aria-selected',String(ui.selected===e.id));
  if(ui.selected===e.id)b.classList.add('selected');
  b.innerHTML=glyphHTML(sp,e.mut)+`<small>${e.w} kg</small>${e.mut?`<i class="fishing-slot-mut">${MUTATIONS[e.mut].badge}</i>`:''}${e.perfect?'<i class="fishing-slot-star">⭐</i>':''}`;
  b.title=sp.name+' · '+r.label;
  b.onclick=()=>{ui.selected=e.id;renderBag()};
  return b;
 }));
 renderDetail();
}
function renderDetail(){
 const st=state(),e=st.bag.find(x=>x.id===ui.selected);
 if(!e){els.detail.hidden=true;return}
 const sp=speciesById(e.sp),r=rarityById(sp.rarity);
 els.detail.hidden=false;
 els.detail.innerHTML=`<div class="fishing-detail-main">${glyphHTML(sp,e.mut,'fishing-detail-glyph')}<div><strong>${esc(sp.name)}</strong> <span class="fishing-chip" style="background:${r.color}">${r.label}</span>${e.mut?` <span class="fishing-chip fishing-mut">${MUTATIONS[e.mut].badge} ${MUTATIONS[e.mut].label}</span>`:''}<p>${e.w} kg${e.perfect?' · Perfect catch ⭐':''}${e.at?' · '+new Date(e.at).toLocaleDateString():''}</p></div></div><div class="fishing-detail-btns"><button id="fishingShowOffBtn" type="button">📣 Show off</button><button id="fishingReleaseBtn" type="button">🌊 Release</button></div>`;
 doc.getElementById('fishingShowOffBtn').onclick=()=>showOff(e.id);
 const rel=doc.getElementById('fishingReleaseBtn');
 rel.onclick=()=>{
  if(rel.dataset.confirm){const i=st.bag.findIndex(x=>x.id===e.id);if(i>=0)st.bag.splice(i,1);persist();ui.selected=null;renderBag()}
  else{rel.dataset.confirm='1';rel.textContent='Release?';setTimeout(()=>{if(rel.isConnected){delete rel.dataset.confirm;rel.textContent='🌊 Release'}},2600)}
 };
}
function showOff(entryId){
 const text=showOffText(state(),entryId);
 if(!text)return false;
 if(opts&&typeof opts.showOff==='function')return opts.showOff(text)!==false;
 return false;
}
// ---------------- wiring from assets/social.js ---------------------------------------------
function bind(options){
 opts=options||opts;
 ensureDom();
 if(opts&&opts.button&&!opts.button._fishing){opts.button._fishing=true;opts.button.onclick=()=>toggle()}
 const f=sceneFishing();f&&f.setFishVisible(state().settings.fish);
}
function toggle(){if(ui.phase==='off')startFishing();else stopFishing()}
function pondClick(x,z,idx){
 if(ui.phase==='off')startFishing(idx);
 else if(ui.phase==='walking'||ui.phase==='ready')startFishing(idx);
}
function hubClosed(){stopFishing();if(els)els.panel.hidden=true}
return {
 // pure core (tests)
 RARITIES,SPECIES,DIFF,MUTATIONS,BAG_MAX,CAST_GREEN,CAST_PERFECT,
 speciesById,rarityById,rollCatch,castRating,makeReel,reelStep,normalize,addCatch,showOffText,
 // UI
 bind,toggle,pondClick,hubClosed,openBag:()=>toggleBag(true),
 get phase(){return ui.phase},
};
});
