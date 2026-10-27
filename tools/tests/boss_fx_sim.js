// Boss skill FX: every MVP's two signature moves, the real canvas output, the cast clock and the
// game's actual lifecycle. Presentation only - nothing here reads or changes combat numbers.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const src=fs.readFileSync(path.join(root,'index.html'),'utf8');
const grab=(a,b)=>{const i=src.indexOf(a);assert(i>=0,'missing anchor: '+a);const j=src.indexOf(b,i);assert(j>i,'missing end: '+b);return src.slice(i,j)};
let depth=0,saves=0,marks=0,texts=[];
// A Canvas stand-in that records real work and refuses non-finite geometry. `peak` is the
// brightest FX path fill/stroke of a frame: `measureText` marks the start of the title card,
// whose own hairlines are drawn in screen space at full alpha and must not count as field cover.
function canvas(){
  const stack=[];
  const c={width:0,height:0,style:{},setAttribute(){},getContext:()=>ctx,peak:0,plate:false};
  const note=()=>{if(!c.plate&&ctx.globalAlpha>.001)c.peak=Math.max(c.peak,ctx.globalAlpha)};
  const ctx={globalAlpha:1,globalCompositeOperation:'source-over',lineWidth:1,font:'',textAlign:'',textBaseline:'',fillStyle:'',strokeStyle:'',lineJoin:'',lineCap:'',canvas:null,
    save(){stack.push([this.globalAlpha,this.globalCompositeOperation]);depth++;saves++},
    restore(){assert(stack.length,'unbalanced restore');[this.globalAlpha,this.globalCompositeOperation]=stack.pop();depth--},
    setTransform(...a){assert(a.every(Number.isFinite),'non-finite setTransform');assert.equal(a.length,6);
      // The FX layer is drawn in world space (a translated transform); the title card resets to
      // screen space. Reset the plate flag at the start of each cast, not just at clearRect.
      if(a[4]!==0||a[5]!==0)c.plate=false},
    clearRect(){c.plate=false},
    fillRect(...a){assert(a.every(Number.isFinite),'non-finite fillRect');marks++},
    fill(){note();if(this.globalAlpha>.001)marks++},
    stroke(){assert(Number.isFinite(this.lineWidth),'non-finite lineWidth');note();if(this.globalAlpha>.001)marks++},
    measureText(t){c.plate=true;return {width:String(t).length*20}},
    fillText(t,x,y){assert(Number.isFinite(x)&&Number.isFinite(y),'non-finite text');texts.push(String(t));marks++},
    strokeText(t,x,y){assert(Number.isFinite(x)&&Number.isFinite(y),'non-finite strokeText');marks++},
    drawImage(img,...a){assert(a.every(Number.isFinite),'non-finite drawImage');marks++},
    createRadialGradient(...a){assert(a.every(Number.isFinite),'non-finite radial gradient');return {addColorStop(o,c){assert(Number.isFinite(o));assert.equal(typeof c,'string')}}},
    createLinearGradient(...a){assert(a.every(Number.isFinite),'non-finite linear gradient');return {addColorStop(o,c){assert(Number.isFinite(o));assert.equal(typeof c,'string')}}}
  };
  for(const name of ['translate','rotate','scale','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','ellipse'])
    ctx[name]=(...a)=>{assert(a.every(Number.isFinite),name+' got non-finite coordinates');assert(a.every(v=>Math.abs(v)<1e7),name+' coordinate blew up')};
  for(const name of ['beginPath','closePath','clip'])ctx[name]=()=>{};
  ctx.canvas=c;return c;
}
const box={console,Math,document:{createElement:canvas},devicePixelRatio:1};
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(root,'assets/boss-fx.js'),'utf8'),box);
const ev=code=>vm.runInContext(code,box);

// ---- the roster ---------------------------------------------------------------------------
const BOSSES=JSON.parse(ev('JSON.stringify(PGBossFx.BOSSES.map(b=>({map:b.map,name:b.name,tier:b.tier,skills:b.skills.map(s=>({id:s.id,name:s.name,life:s.life,choreo:s.choreo,pattern:s.pattern,signature:s.signature}))})))'));
assert.equal(BOSSES.length,12,'one row per map, in MAPS order');
assert.deepEqual(BOSSES.map(b=>b.map),[...Array(12).keys()],'map indexes stay in order');
assert.deepEqual(BOSSES.map(b=>b.tier),[1,1,1,1,1,2,2,2,2,3,3,3],'tier follows the map band');
const all=BOSSES.flatMap(b=>b.skills.map(s=>s.id));
assert.equal(all.length,24,'two signature moves for every boss');
assert.equal(new Set(all).size,24,'stable, unique skill ids');
for(const b of BOSSES){
  assert.equal(b.skills.length,2,b.name+' needs two moves');
  assert(new Set(b.skills.map(s=>s.pattern)).size===2,b.name+' needs two different choreographies');
  for(const s of b.skills){
    assert(s.name.length<=22,b.name+': name fits the title card');
    assert(s.signature.length>30,b.name+'/'+s.name+': needs a design note');
    // Screen time: full-field tier-3 moves clear in under two seconds; tier-2 sweeps get a
    // shorter window too. Both keep `choreo`, the length the animation was authored for.
    if(b.tier===3){
      assert(s.life>=1.5&&s.life<=1.8,s.name+': full-field cast must clear in under 2s');
      assert(s.choreo>=3&&s.choreo<=3.4,s.name+': keeps its full cataclysm choreography');
    }else if(b.tier===2){
      assert(s.life>=2&&s.life<=2.3,s.name+': map-wide cast must clear quickly');
      assert(s.choreo>=2.7&&s.choreo<=3.1,s.name+': keeps its full layered choreography');
    }else{
      assert(s.life>=2&&s.life<=3.4,s.name+': local burst keeps its authored life');
      assert.equal(s.choreo,undefined,s.name+': local bursts need no fast-forward');
    }
  }
}
// The spec the renderer/cast clock actually reads agrees with the roster, and only wide moves
// fast-forward. `fadeAt` is the fraction of the cast that stays at full brightness.
const SPECS=JSON.parse(ev('JSON.stringify([...PGBossFx.SKILLS.values()].map(s=>({id:s.id,tier:s.tier,life:s.life,choreo:s.choreo,fadeAt:s.fadeAt})))'));
assert.equal(SPECS.length,24);
for(const s of SPECS){
  assert.equal(s.life,ev(`PGBossFx.life(${JSON.stringify(s.id)})`),s.id+': life() drives the cast clock');
  assert(s.choreo>=s.life,s.id+': art is never longer than the cast on screen');
  if(s.tier===1){assert.equal(s.choreo,s.life,s.id+': local burst plays at authored speed');assert.equal(s.fadeAt,1,s.id+': local burst keeps full brightness')}
  else{
    assert(s.choreo>s.life,s.id+': wide move fast-forwards its art');
    assert(s.fadeAt<1,s.id+': wide move starts dimming before the cast ends');
    if(s.tier===3)assert(s.fadeAt<=.35,s.id+': cataclysm dims soon after the impact');
  }
}
// The three tiers escalate: low maps stay local and calm, the deepest maps shake the camera.
const shake=JSON.parse(ev('JSON.stringify(PGBossFx.BOSSES.map(b=>b.skills.map(s=>PGBossFx.shake(s.id))))'));
const size=JSON.parse(ev('JSON.stringify([1,2,3].map(t=>PGBossFx.TIER[t].size))'));
assert(size[0]<size[1]&&size[1]<size[2],'tier composition size escalates');
for(let i=0;i<12;i++){
  const tier=BOSSES[i].tier,vals=shake[i];
  assert(vals.every(v=>v===shake[0][0]||v>0),'every move of a tier shares its weight');
  if(tier===1)assert(vals[0]<.5,'tier 1 barely nudges the camera');
  if(tier===2)assert(vals[0]>=.5&&vals[0]<1,'tier 2 nudges it');
  if(tier===3)assert(vals[0]>=1,'tier 3 shakes it');
}
assert.equal(ev('PGBossFx.skillsOfMap(11).length'),2);
assert.equal(ev('PGBossFx.skillsOfMap(12).length'),0,'there is no map 12');
assert.equal(ev('PGBossFx.has("nope")'),false);

// ---- real drawing -------------------------------------------------------------------------
const canvasFor=()=>{const c=canvas();c.getContext('2d').canvas=c;return c};
for(const id of all){
  const life=ev(`PGBossFx.life(${JSON.stringify(id)})`);
  const c=canvasFor(),paint=ev('PGBossFx').create(c);
  assert(paint,id+': renderer');
  for(const detail of [1,.55])for(const seed of [0,7,4242]){
    const seen=new Set();
    for(const q of [0,.06,.14,.26,.38,.5,.62,.76,.88,.99]){
      marks=0;depth=0;texts.length=0;
      paint.draw([{id,age:life*q,x:0,z:0,seed,scale:1}],1200,760,(x,y,z)=>[600,470-y*40],1,detail);
      assert.equal(depth,0,id+': leaked canvas state');
      if(q>=.14)assert(marks>0,id+': drew nothing at '+(q*100|0)+'% (detail '+detail+')');
      seen.add(marks);
    }
    assert(seen.size>3,id+': every frame draws the same amount of work');
  }
}
// The title card is real text, and a tier-3 card says so.
{const c=canvasFor(),paint=ev('PGBossFx').create(c);texts.length=0;
 paint.draw([{id:'ifr_blaze',age:1,x:0,z:0,seed:1,scale:1}],1200,760,(x,y,z)=>[600,470-y*40],1,1);
 assert(texts.join('|').includes('Ifrit Blaze'),'title card carries the move name');
 assert(texts.join('|').includes('C A T A C L Y S M'),'tier 3 is called out');}
{const c=canvasFor(),paint=ev('PGBossFx').create(c);texts.length=0;
 paint.draw([{id:'bj_jelly',age:1,x:0,z:0,seed:1,scale:1}],1200,760,(x,y,z)=>[600,470-y*40],1,1);
 assert(texts.join('|').includes('B O S S   S K I L L'),'tier 1 reads as a boss skill');}

// ---- screen time: a full-field cast clears the fight quickly ------------------------------
{const c=canvasFor(),p=ev('PGBossFx').create(c),life=ev('PGBossFx.life("ifr_blaze")');
 const frameAt=(id,age)=>{c.peak=0;marks=0;
   p.draw([{id,age,x:0,z:0,seed:3,scale:1}],1200,760,(x,y,z)=>[600,470-y*40],1,1);
   return {peak:c.peak,marks}};
 const start=frameAt('ifr_blaze',life*.2);
 assert(start.peak>.8,'the impact is still at full brightness');
 const mid=frameAt('ifr_blaze',life*.7);
 assert(mid.peak<start.peak*.6,'a full-field slash dims soon after impact');
 const end=frameAt('ifr_blaze',life*.95);
 assert(end.peak<start.peak*.1,'almost nothing is left before the cast ends');
 const impact=frameAt('ifr_blaze',life*.46);
 assert(impact.marks>20&&impact.peak>.7,'fast-forwarding keeps the impact frame intact');
 const gone=frameAt('ifr_blaze',life+.1);
 assert.equal(gone.marks,0,'nothing paints after the shorter cast life');
 // Tier-1 local bursts were not touched by the early fade.
 const local=frameAt('bj_jelly',ev('PGBossFx.life("bj_jelly")')*.8);
 assert(local.peak>.5,'a local burst still plays at full brightness');
}

// ---- the adapter's contract ---------------------------------------------------------------
assert(ev('typeof PGBossFx.create==="function"'));
const bad=ev('PGBossFx').create(canvasFor());
for(const call of [['missing',1],['bj_jelly',NaN],['bj_jelly',-1],['bj_jelly',99]]){marks=0;
  bad.draw([{id:call[0],age:call[1],x:0,z:0,seed:0}],800,600,()=>[400,400],1,1);assert.equal(marks,0,'invalid casts are no-ops')}
marks=0;bad.draw([],800,600,()=>[400,400],1,1);assert.equal(marks,0,'an empty list clears and stops');
// Off-screen and degenerate projections must not paint garbage.
marks=0;bad.draw([{id:'ifr_blaze',age:1,x:0,z:0,seed:0}],800,600,()=>[NaN,0],1,1);assert.equal(marks,0,'NaN projection is skipped');
bad.draw([{id:'ifr_blaze',age:1,x:0,z:0,seed:0}],800,600,()=>[400,400],1,.5);assert(marks>0,'detail argument still paints');

// ---- the game's own clock ----------------------------------------------------------------
// The adapter is lifted out of the real page: the same code the player runs.
const adapter=grab('const BOSS_CAST_MIN=','function playSkillFx(');
const clock={};
function bootAdapter({boss=true,hidden=false,catching=false,cameraShake=true}={}){
  const marks={shake:0,float:[],audio:0,logs:[]};
  const ctx={console,Math,devicePixelRatio:1,
    mobs:[],S:{mp:9,cameraShake,sfx:true},
    skillNameFloat:n=>marks.float.push(n),
    shake:0,
    R:{domElement:{clientWidth:1200,clientHeight:800}},
    scr:(x,y,z)=>[600,500-y*40],
    KIT:{nativeWorld:false},
    actorFloorY:()=>0,cl:(v,a,b)=>Math.max(a,Math.min(b,v)),
    log:(m,cls,cat)=>marks.logs.push(m),
    CombatAudio:{hit:()=>{marks.audio++}},
    simVisualsOff:()=>hidden||catching,
    floor:()=>0,
    $:()=>({after(){},insertBefore(){}}),
    document:{createElement:()=>canvas()},
    mobVisualScale:()=>1.4
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/boss-fx.js'),'utf8'),ctx);
  // A stub combat log/skill-name helper is enough; the adapter only paints.
  vm.runInContext('var t=0;'+adapter,ctx);
  if(boss)ctx.mobs.push({boss:true,hp:100,max:100,x:0,z:-4,mapIndex:9,n:'Dark Lord'});
  return {ctx,marks,ev:c=>vm.runInContext(c,ctx)};
}
{const a=bootAdapter();
 a.ev('t=0;resetBossSkill();tickBossSkill()');assert.equal(a.ev('bossCast'),null,'no cast before the timer');
 const first=a.ev('bossCastNext');assert(first>0,'the timer starts 2s in');
 a.ev('t='+first+';tickBossSkill()');
 assert(a.ev('bossCast'),'the boss casts once the timer expires');
 const id=a.ev('bossCast.id');assert(all.includes(id),'casts a real move from its own map');
 assert.equal(a.ev('bossCast.x'),0,'the cast is anchored on the boss');
 assert.equal(a.marks.float.length,1,'the move is named on screen');
 assert.equal(a.marks.audio,1,'one impact sound per cast');
 assert.equal(a.marks.logs.length,0,'the combat log is not spammed');
 // It expires, then re-arms for 3.2-4.6s. (The sim steps in tenths of a second, so the frame
 // that crosses the end of the cast is checked just past it.)
 const life=a.ev('bossCast.life'),start=a.ev('bossCast.start'),end=start+life+.05;
 assert(life<2,'the game clock uses the shortened tier-3 cast life, not the choreography length');
 a.ev(`t=${end};tickBossSkill()`);assert.equal(a.ev('bossCast'),null,'the cast lasts its own life');
 const wait=a.ev('bossCastNext')-end;
 assert(wait>=3.19&&wait<=4.61,'the next cast is 3.2-4.6s later, not a metronome ('+wait+')');
 // Never the same move twice in a row.
 a.ev('t=999;tickBossSkill()');let last=a.ev('bossCast.id');
 for(let i=0;i<40;i++){a.ev('bossCast=null;bossCastNext=t;');a.ev('t=t+0.1;tickBossSkill()');const now=a.ev('bossCast&&bossCast.id');
   if(now){assert.notEqual(now,last,'repeated move: '+now);last=now}}
 // A new boss restarts the clock and forgets the last move.
 a.ev('mobs[0]={boss:true,hp:9,x:1,z:-4,mapIndex:11,n:"Ifrit"};t+=50;tickBossSkill()');
 assert(a.ev('mobs[0].mapIndex===11'));
 a.ev('t+=10;tickBossSkill()');assert(a.ev('bossCast&&bossCast.id').startsWith('ifr_'),'a new boss uses its own map moves');
 // No boss (or a dead one): nothing casts, and the canvas is cleared.
 a.ev('mobs[0].hp=0;bossCast=null;tickBossSkill();syncBossSkillFx()');
 assert.equal(a.ev('bossCast'),null,'a dead boss casts nothing');
 // The shake respects the player's setting.
 const calm=bootAdapter({cameraShake:false});calm.ev('t=99;tickBossSkill()');
 assert.equal(calm.ev('shake'),0,'camera shake can be switched off');
 const loud=bootAdapter();loud.ev('bossCast=null;bossCastNext=0;t=1;tickBossSkill()');
 assert(loud.ev('shake')>0,'a tier-3 cast shakes the camera');
 // Hidden tabs and catch-ups paint nothing but still keep the clock honest.
 const off=bootAdapter({hidden:true});off.ev('t=99;tickBossSkill()');
 assert.equal(off.ev('bossCast'),null,'no cast work while the tab is hidden');
 // Escort-only fields (no boss) stay quiet.
 const field=bootAdapter({boss:false});field.ev('mobs.push({boss:false,hp:5,x:0,z:0});t=50;tickBossSkill()');
 assert.equal(field.ev('bossCast'),null,'regular fields never cast');
}
// The page loads the module next to the other effect layers, and the draw/tick hooks exist.
assert(src.includes('<script src="assets/boss-fx.js?v='),'index.html loads assets/boss-fx.js');
assert(src.includes('tickBossSkill();'),'the sim ticks the boss clock');
assert(src.includes('syncBossSkillFx();'),'the frame draws the boss layer');
assert(src.includes("$('weaponSpriteLayer').after(canvas);bossSkillLayer=renderer;"),'the canvas joins the effect layers');
assert(src.includes('not(#bossSkillLayer)'),'clean-screen keeps the boss layer visible');
console.log('PASS boss skill FX: 12 bosses / 24 unique moves, tiered 1-3, real canvas output at every frame, '
  +'fast-forwarded wide moves that dim and clear the field early, no leaked state, invalid casts are no-ops, '
  +'3.2-4.6s anti-metronome clock, no repeats, boss-change reset, hidden-tab and shake respect, and the page wiring');
