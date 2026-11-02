// v287 plaza fishing: pond placement on the south lawns, shared walkability, the catch
// catalog, cast rating, the hold/release reel physics, bag/bestiary persistence bounds,
// and show-off coming only from fish the player actually owns. Part B drives the real
// scene renderer to prove ponds route clicks to fishing instead of walking into water.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=require(path.join(__dirname,'..','..','assets','social-rules.js'));
const F=require(path.join(__dirname,'..','..','assets','social-fishing.js'));

// --- layout: water starts on the lower (south) lawns, clear of the tree gardens -----------
assert.equal(R.PONDS.length,2,'two ponds, one per south lawn');
for(const p of R.PONDS){
 assert(p.z-p.d/2>=34,'pond starts below the garden/tree area (gardens end at z=29)');
 assert(p.z+p.d/2<=52,'pond ends before the southern houses (z=45.5)');
 assert(Math.abs(p.x)-p.w/2>=9+2,'pond clears the central promenade');
 assert(Math.abs(p.x)+p.w/2<=35.5-1,'pond clears the avenue houses');
 for(const t of R.TREES)assert(Math.hypot(p.x-t.x,p.z-t.z)>t.size+2,'pond is not under a tree canopy');
 assert(!R.walkable(p.x,p.z),'water is not walkable');
 assert(!R.walkable(p.x-p.w/2+.3,p.z),'water edge is not walkable');
 const rim=[{x:p.x,z:p.z-p.d/2-1.7},{x:p.x,z:p.z+p.d/2+1.7},{x:p.x-p.w/2-1.7,z:p.z},{x:p.x+p.w/2+1.7,z:p.z}];
 for(const s of rim)assert(R.walkable(s.x,s.z),'grass ring around the pond stays walkable');
 const route=R.path({x:0,z:12},rim[0]);
 assert(route.length,'players can walk from spawn to the pond rim');
 assert(route.every(q=>R.walkable(q.x,q.z)));
}
for(let n=-30;n<=30;n++)if(Math.abs(n)>6){assert(R.walkable(0,n),'promenade clear');assert(R.walkable(n,0),'avenue clear')}

// --- catalog ------------------------------------------------------------------------------
const weightSum=F.RARITIES.reduce((a,r)=>a+r.weight,0);
assert(Math.abs(weightSum-1)<1e-9,'rarity weights sum to 1');
const ids=new Set();
for(const sp of F.SPECIES){
 assert(!ids.has(sp.id),'species ids unique');ids.add(sp.id);
 assert(F.RARITIES.some(r=>r.id===sp.rarity),'species rarity exists');
 assert(F.DIFF[sp.rarity],'reel difficulty exists for '+sp.rarity);
 assert(sp.min>0&&sp.max>sp.min,'weight range sane');
 assert(sp.glyph&&sp.name);
}
for(const r of F.RARITIES)assert(F.SPECIES.some(sp=>sp.rarity===r.id),'every rarity has at least one fish');

// --- rolling ------------------------------------------------------------------------------
const seq=values=>{let i=0;return ()=>values[Math.min(i++,values.length-1)]};
let c=F.rollCatch(seq([.999,.0,.5,.99]));
assert.equal(c.rarity,'secret','top of the table is the secret rarity');
c=F.rollCatch(seq([.0,.0,.5,.99]));
assert.equal(c.rarity,'common');
// A PERFECT cast rolls twice and keeps the better one - never worse.
c=F.rollCatch(seq([.0,.999,.0,.5,.99]),true);
assert.equal(c.rarity,'secret','boost upgrades a bad roll');
c=F.rollCatch(seq([.999,.0,.0,.5,.99]),true);
assert.equal(c.rarity,'secret','boost never downgrades');
for(let i=0;i<500;i++){
 const roll=F.rollCatch();
 const sp=F.speciesById(roll.sp);
 assert(sp,'rolled species exists');
 assert.equal(sp.rarity,roll.rarity);
 assert(roll.w>=sp.min&&roll.w<=sp.max,'weight inside the species range');
 assert.equal(roll.w,Math.round(roll.w*100)/100,'weight is 2dp');
 assert([null,'shiny','sparkling'].includes(roll.mut));
}

// --- cast rating --------------------------------------------------------------------------
assert.equal(F.castRating(.9).label,'PERFECT');
assert(F.castRating(.9).perfect);
assert.equal(F.castRating(.84).label,'Amazing');
assert.equal(F.castRating(.7).label,'Great');
assert.equal(F.castRating(.5).label,'Good');
assert.equal(F.castRating(.1).label,'Meh');
assert(!F.castRating(2).perfect&&F.castRating(2).power===1,'power clamps');
assert(F.castRating(.9).dist>F.castRating(.2).dist,'charge only buys distance');

// --- reel physics -------------------------------------------------------------------------
const fish={sp:'minnow',rarity:'common',w:.4,mut:null};
let s=F.makeReel(fish,()=>.5);
assert(s.progress>0&&s.progress<1&&s.lock>0&&s.perfect);
// Opening lock: progress does not move even when the fish slips away.
let out=null;
for(let i=0;i<30;i++){s.fish=.95;s.bar=.1;out=F.reelStep(s,.02,false);assert.equal(out,null)}
assert.equal(s.progress,F.makeReel(fish,()=>.5).progress,'no drain during the opening lock');
// Holding pushes the control bar right; releasing lets it fall left; it never leaves the track.
s=F.makeReel(fish,()=>.5);s.lock=0;
for(let i=0;i<300;i++){F.reelStep(s,.016,true);assert(s.bar>=s.barW/2-1e-9&&s.bar<=1-s.barW/2+1e-9)}
assert(s.bar>1-s.barW/2-.02,'long hold pins the bar right');
for(let i=0;i<300;i++)F.reelStep(s,.016,false);
assert(s.bar<s.barW/2+.02,'long release drops the bar left');
// Fish inside the bar fills to a catch; fish outside drains to an escape and voids Perfect.
s=F.makeReel(fish,()=>.5);s.lock=0;out=null;
for(let i=0;i<2000&&!out;i++){s.fish=s.bar;out=F.reelStep(s,.016,false)}
assert.equal(out,'catch');
assert(s.perfect,'never losing the fish keeps the Perfect flag');
s=F.makeReel(fish,()=>.5);s.lock=0;out=null;
for(let i=0;i<2000&&!out;i++){s.fish=.98;s.bar=.1;out=F.reelStep(s,.016,false)}
assert.equal(out,'escape');
assert(!s.perfect);
// Rarer fish are harder: narrower control bar, faster wander, slower fill.
assert(F.DIFF.mythical.bar<F.DIFF.common.bar);
assert(F.DIFF.mythical.speed>F.DIFF.common.speed);
assert(F.DIFF.mythical.fill<F.DIFF.common.fill);

// --- persistence bounds -------------------------------------------------------------------
let st=F.normalize(null);
assert.deepEqual(st.bag,[]);
assert.equal(st.stats.catches,0);
assert.equal(st.settings.fish,true);
st=F.normalize({bag:[{sp:'nope',w:3},{sp:'koi',w:'9999',mut:'evil',at:-5,id:'a'},{sp:'koi',w:2,id:'a'}],dex:{koi:{n:'7',bw:4.2,mut:['shiny','evil','shiny']},ghost:{n:3}},stats:{casts:-3,catches:1e12},settings:{fish:false,sound:'yes'}});
assert.equal(st.bag.length,2,'unknown species dropped');
assert.equal(st.bag[0].w,999,'weights clamp');
assert.equal(st.bag[0].mut,null,'unknown mutation dropped');
assert.notEqual(st.bag[0].id,st.bag[1].id,'duplicate ids regenerate');
assert.equal(st.dex.koi.n,7);
assert.deepEqual(st.dex.koi.mut,['shiny']);
assert(!st.dex.ghost,'bestiary only keeps real species');
assert.equal(st.stats.casts,0);
assert.equal(st.settings.fish,false);
assert.equal(st.settings.sound,true);
st=F.normalize({bag:Array.from({length:300},(_,i)=>({sp:'minnow',w:.2,id:'x'+i}))});
assert.equal(st.bag.length,F.BAG_MAX,'bag caps at '+F.BAG_MAX);

// --- bag + bestiary + show-off ------------------------------------------------------------
st=F.normalize(null);
const entry=F.addCatch(st,{sp:'koi',rarity:'rare',w:4.25,mut:'shiny',perfect:true},1700000000000);
assert(entry&&st.bag.length===1);
assert.equal(st.dex.koi.n,1);
assert.equal(st.dex.koi.bw,4.25);
assert.deepEqual(st.dex.koi.mut,['shiny']);
assert.equal(st.stats.catches,1);
assert.equal(st.stats.perfects,1);
F.addCatch(st,{sp:'koi',rarity:'rare',w:2.1},1700000000001);
assert.equal(st.dex.koi.n,2);
assert.equal(st.dex.koi.bw,4.25,'best weight keeps the record');
const text=F.showOffText(st,entry.id);
assert(text&&text.includes('Royal Koi')&&text.includes('4.25 kg')&&text.includes('Rare')&&text.includes('Shiny'),'show-off describes the owned fish');
assert(text.length<=300,'fits the chat body limit');
assert.equal(F.showOffText(st,'not-an-id'),null,'show-off refuses fish the player does not own');
while(st.bag.length<F.BAG_MAX)F.addCatch(st,{sp:'minnow',rarity:'common',w:.2});
assert.equal(F.addCatch(st,{sp:'minnow',rarity:'common',w:.2}),null,'full bag refuses new fish');
assert.equal(st.bag.length,F.BAG_MAX);

// --- Part B: the real scene renderer builds ponds and routes pond clicks to fishing --------
(async()=>{
 const {JSDOM}=require('jsdom');
 const dom=new JSDOM('<div id="host"></div><div id="labels"></div>',{runScripts:'outside-only'}),w=dom.window,T={...require('three')};
 let frame,now=1000,moves=[],pondClicks=[];
 const ctx={drawImage(){}};w.HTMLCanvasElement.prototype.getContext=()=>ctx;
 const host=w.document.getElementById('host');host.setPointerCapture=()=>{};host.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:700});Object.defineProperties(host,{clientWidth:{value:1000},clientHeight:{value:700}});
 T.WebGLRenderer=class{constructor(){this.domElement=w.document.createElement('canvas')}setPixelRatio(){}setSize(){}render(){}dispose(){}};
 T.TextureLoader=class{async loadAsync(){return new T.Texture(w.document.createElement('canvas'))}};
 const action={delay:100,frames:[[[0,0,20,60,150,140,0,'body']]]},look={base:{figureHeight:60,metadata:{actions:{}}},hair:{metadata:{actions:{}}}};
 for(const stance of ['idle','walk','sit'])for(let d=0;d<8;d++)look.base.metadata.actions[stance+d]=look.hair.metadata.actions[stance+d]=action;
 class Store{release(){}async select(){return look}}
 Object.assign(w,{THREE:T,devicePixelRatio:1,requestAnimationFrame:cb=>frame=cb,ResizeObserver:class{constructor(fn){this.fn=fn}observe(){this.fn()}},PGWardrobe:{CLASSES:{Novice:0},Store,normalize:a=>a,defaults:()=>({version:1,sex:'m'}),frameIndex:()=>0,draw(){}},PGFourthJobs:{CLASSES:{},Store},milestone:()=>null,REFINE_GLOWS:[],drawNativeWeaponGlow(){},drawNativeArmGlow(){},LEVEL_AURAS:[],buildLevelAura:()=>new T.Group()});
 Object.defineProperty(w.document,'hidden',{value:false});w.performance.now=()=>now;w.console.warn=()=>{};
 w.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(url)),arrayBuffer:async()=>{const b=fs.readFileSync(url);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}});
 w.eval(fs.readFileSync(path.join(__dirname,'..','..','assets','social-rules.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(__dirname,'..','..','assets','social-scene.js'),'utf8'));
 const scene=await w.PGSocialScene.create(host,w.document.getElementById('labels'),{self:()=>1,menu(){},move(x,z){moves.push({x,z})},seat(){},pond(x,z,idx){pondClicks.push({x,z,idx})}});
 scene.active=true;
 assert(scene.fishing,'the scene exposes a fishing rig');
 for(const fn of ['setFishVisible','cast','bite','reel','catchFly','escapeSplash','ripple','splash','hide','off'])assert.equal(typeof scene.fishing[fn],'function','fishing.'+fn);
 // Stand the local player on the east pond rim.
 const pond=w.PGSocialRules.PONDS[1];
 scene.putPlayer({id:1,name:'Angler',x:pond.x,z:pond.z-pond.d/2-1.7,dir:0,sit:false,path:[],look:{cls:'Novice',appearance:{version:1,sex:'m'}}});
 frame(now+=100);
 // Clicking the water reports the pond to the fishing callback instead of walking in.
 scene.camera.updateMatrixWorld();
 const pt=new T.Vector3(pond.x,0,pond.z).project(scene.camera);
 const ev={clientX:(pt.x+1)*500,clientY:(1-pt.y)*350,pointerId:1,button:0,preventDefault(){}};
 host.onpointerdown(ev);host.onpointerup(ev);
 assert.equal(moves.length,0,'a pond click never walks into the water');
 assert.equal(pondClicks.length,1,'a pond click reaches the fishing callback');
 assert.equal(pondClicks[0].idx,1,'the clicked pond index is reported');
 // Cast: the bobber flies to the water and the landing callback fires exactly once.
 let landed=0;
 scene.fishing.cast({x:pond.x,z:pond.z},400,()=>landed++);
 frame(now+=100);assert.equal(landed,0,'still in flight');
 frame(now+=500);assert.equal(landed,1,'bobber landed');
 frame(now+=100);assert.equal(landed,1,'landing fires once');
 scene.fishing.bite(true);frame(now+=100);
 scene.fishing.reel(.5);frame(now+=100);
 scene.fishing.catchFly('🐟',120,()=>{});
 for(let i=0;i<12;i++)frame(now+=100);
 scene.fishing.off();frame(now+=100);
 scene.fishing.setFishVisible(false);scene.fishing.setFishVisible(true);
 frame(now+=100);
 dom.window.close();
 console.log('PASS social fishing: south-lawn ponds, shared walkability, catalog, reel physics, bag bounds, owned-fish show-off and scene rig');
})().catch(e=>{console.error(e);process.exitCode=1});
