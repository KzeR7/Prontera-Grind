/* Plaza fishing (v287, economy + index + auto in v288), styled after classic hold-and-release
   fishing games: hold to charge a cast (PERFECT zone) → optional SHAKE clicks shorten the wait →
   bite → reel minigame (hold pulls the control bar right, release drifts left; keep the fish
   inside to fill progress, let it slip and progress drains). Catches land in one Fishing Bag UI —
   bag, fish index, shop, records, show-off and settings all live in that single draggable window.
   Fishcoins come from selling catches and buy rods/bait that raise luck, weight and mutation odds.
   Auto fishing repeats the whole loop until the player stops it. The 3D water/bobber/show-off
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
// 70 species. The 14 v287 ids keep their exact id/rarity so bagged fish stay valid.
const SPECIES_DATA={
 common:[
  ['minnow','Plaza Minnow','🐟',0,.1,.7],['carp','Cobble Carp','🐟',95,.8,3.5],
  ['smelt','Fountain Smelt','🐠',150,.2,.9],['goby','Lawn Goby','🐡',100,.3,1.2],
  ['bitterling','Brook Bitterling','🐟',30,.1,.5],['dace','Pebble Dace','🐟',60,.2,1],
  ['chub','Grass Chub','🐟',120,.5,2.2],['roach','Rosy Roach','🐟',330,.3,1.4],
  ['bleak','Silver Bleak','🐟',200,.15,.8],['gudgeon','Mud Gudgeon','🐟',25,.2,.9],
  ['loach','Stone Loach','🐟',45,.2,1.1],['shrimplet','Pond Shrimp','🦐',0,.05,.3],
  ['crucian','Crucian Carp','🐟',80,.6,2.4],['sunny','Sunray Sunfish','🐠',40,.3,1.3],
  ['tadpole','Giant Tadpole','🐸',110,.2,1],['stickle','Stickleback','🐟',180,.05,.4],
  ['killi','Meadow Killifish','🐠',90,.1,.6],['molly','Moss Molly','🐠',130,.1,.7],
  ['platy','Brick Platy','🐠',20,.1,.5],['guppy','Gutter Guppy','🐠',300,.05,.35],
 ],
 uncommon:[
  ['bream','Brass Bream','🐟',40,1,4],['perch','Garden Perch','🐠',70,.8,2.8],
  ['trout','Canal Trout','🐟',190,1.5,5],['crawdad','Rusty Crayfish','🦞',15,.3,1.6],
  ['bass','Bell Bass','🐟',210,1.2,4.5],['catfish','Whisker Catfish','🐟',260,2,7],
  ['reedeel','Reed Eel','🐟',150,.8,3.2],['tench','Bronze Tench','🐟',35,1,4.2],
  ['barbel','River Barbel','🐟',220,1.5,6],['ide','Golden Ide','🐟',50,1,3.8],
  ['zander','Dusk Zander','🐟',240,2,6.5],['crab','Paving Crab','🦀',0,.4,2],
  ['mullet','Cloud Mullet','🐟',280,1,3.5],['betta','Dusk Betta','🐠',290,.2,1],
  ['angelfin','Plaza Angelfish','🐠',230,.3,1.5],['pumpkinseed','Pumpkinseed','🐠',30,.4,1.8],
 ],
 rare:[
  ['koi','Royal Koi','🐠',320,2,8],['pike','Knight Pike','🐟',225,3,10],
  ['tetra','Crystal Tetra','🐠',260,.4,1.5],['sturgeon','Young Sturgeon','🐟',200,3,12],
  ['squid','Pond Squid','🦑',260,1,5],['octo','Puddle Octopus','🐙',310,1.5,6],
  ['lobster','Azure Lobster','🦞',220,1,4.5],['discus','Stained-glass Discus','🐠',10,.6,2.2],
  ['gar','Longnose Gar','🐟',130,2.5,9],['piranha','Gilded Piranha','🐟',45,1,3.6],
  ['salmon','Sakura Salmon','🐟',340,2.5,9.5],['snapper','Emerald Snapper','🐟',140,1.5,6],
  ['lantern','Lantern Guppy','🐠',55,.3,1.2],
 ],
 legendary:[
  ['fountainfish','Gilded Fountainfish','🐠',25,1,6],['arowana','Prontera Arowana','🐟',285,4,14],
  ['marlin','Lawn Marlin','🐟',210,8,24],['moonray','Moonlight Ray','🐠',250,5,18],
  ['paddlefish','Ghost Paddlefish','🐟',190,6,20],['mahi','Prism Mahi','🐠',160,4,15],
  ['coelacanth','Ancient Coelacanth','🐟',230,10,30],['dragonet','Emerald Dragonet','🐠',0,.8,3],
  ['phoenixfish','Ember Phoenixfish','🐠',20,2,9],['oarfish','Banner Oarfish','🐟',265,7,26],
 ],
 mythical:[
  ['leviathan','Pond Leviathan','🦈',175,12,40],['kraken','Garden Kraken','🐙',270,10,36],
  ['hydrasquid','Hydra Squid','🦑',285,8,30],['cobblewhale','Cobble Whale','🐋',210,20,60],
  ['angler','Abyss Angler','🐡',260,6,22],['seraphkoi','Seraph Koi','🐠',45,5,18],
  ['baphobass','Baphomet Bass','🐟',0,9,28],
 ],
 secret:[
  ['poring','Poring Puffer','🐡',300,.5,2],['emperium','Emperium Carp','🐠',45,3,12],
  ['ghostring','Ghostring Fish','🐟',200,.4,1.8],['angeling','Angeling Jelly','🐙',310,.6,2.5],
 ],
};
const SPECIES=Object.entries(SPECIES_DATA).flatMap(([rarity,list])=>list.map(([id,name,glyph,hue,min,max])=>({id,name,glyph,hue,min,max,rarity})));
const SPECIES_BY_ID=Object.fromEntries(SPECIES.map(s=>[s.id,s]));
const SPECIES_BY_NAME=Object.fromEntries(SPECIES.map(s=>[s.name,s.id]));
const MAX_W=Math.max(...SPECIES.map(s=>s.max));
// Catch rate with no luck: the rarity's share split evenly across its pool.
function rate(spId){const sp=SPECIES_BY_ID[spId];if(!sp)return 0;const r=RARITIES[RARITY_INDEX[sp.rarity]];return r.weight/SPECIES.filter(x=>x.rarity===sp.rarity).length}
// Mutations roll once per catch, rarest reachable via bait mutation odds. `mult` scales sell value.
const MUTATIONS={
 shiny:{label:'Shiny',badge:'✨',chance:.05,mult:2,glow:'#ffe9a0',css:'drop-shadow(0 0 6px #ffe9a0)'},
 sparkling:{label:'Sparkling',badge:'🌟',chance:.012,mult:4,glow:'#b7f2ff',css:'drop-shadow(0 0 8px #b7f2ff)'},
 frozen:{label:'Frozen',badge:'❄️',chance:.008,mult:5,glow:'#9fe6ff',css:'saturate(.6) brightness(1.3) drop-shadow(0 0 7px #9fe6ff)'},
 electric:{label:'Electric',badge:'⚡',chance:.008,mult:5,glow:'#ffe34d',css:'contrast(1.2) drop-shadow(0 0 8px #ffe34d)'},
 ghostly:{label:'Ghostly',badge:'👻',chance:.005,mult:6,glow:'#d8d8f8',css:'grayscale(.85) opacity(.65) drop-shadow(0 0 8px #d8d8f8)'},
 golden:{label:'Golden',badge:'🥇',chance:.003,mult:9,glow:'#ffd24d',css:'sepia(1) saturate(3.2) brightness(1.15) drop-shadow(0 0 9px #ffd24d)'},
 prismatic:{label:'Prismatic',badge:'🌈',chance:.001,mult:14,glow:'#ff9ef5',css:'saturate(1.6) drop-shadow(0 0 10px #ff9ef5)'},
};
// Rods are permanent; luck biases rarity, control widens the reel bar, strength biases weight,
// lure shortens the wait. Bait is consumed one per cast on top of the rod.
const RODS=[
 {id:'twig',name:'Training Rod',icon:'🎣',cost:0,luck:0,control:0,strength:0,lure:0},
 {id:'oak',name:'Oak Rod',icon:'🪵',cost:150,luck:.15,control:.1,strength:.1,lure:.1},
 {id:'brass',name:'Brass Rod',icon:'🥉',cost:500,luck:.3,control:.18,strength:.22,lure:.2},
 {id:'silver',name:'Silver Rod',icon:'🥈',cost:1500,luck:.5,control:.28,strength:.35,lure:.3},
 {id:'golden',name:'Golden Rod',icon:'🥇',cost:4000,luck:.75,control:.38,strength:.5,lure:.45},
 {id:'mythril',name:'Mythril Rod',icon:'💠',cost:10000,luck:1.1,control:.5,strength:.7,lure:.6},
];
const RODS_BY_ID=Object.fromEntries(RODS.map(r=>[r.id,r]));
const BAITS=[
 {id:'worm',name:'Worm',icon:'🪱',cost:5,luck:.1,weight:0,mutation:1},
 {id:'shrimp',name:'Shrimp Tail',icon:'🦐',cost:15,luck:.25,weight:0,mutation:1},
 {id:'grub',name:'Glow Grub',icon:'🪰',cost:40,luck:.35,weight:0,mutation:2},
 {id:'jelly',name:'Royal Jelly',icon:'🍯',cost:100,luck:.6,weight:.5,mutation:1.5},
];
const BAITS_BY_ID=Object.fromEntries(BAITS.map(b=>[b.id,b]));
// Reel feel per rarity: control-bar width, fish wander speed, dash chance, fill/drain per second.
const DIFF={
 common:{bar:.34,speed:.42,dash:.16,fill:.165,drain:.1},
 uncommon:{bar:.31,speed:.52,dash:.22,fill:.15,drain:.105},
 rare:{bar:.28,speed:.62,dash:.32,fill:.135,drain:.11},
 legendary:{bar:.25,speed:.74,dash:.44,fill:.12,drain:.115},
 mythical:{bar:.22,speed:.86,dash:.56,fill:.108,drain:.12},
 secret:{bar:.24,speed:.8,dash:.5,fill:.112,drain:.118},
};
const RARITY_VALUE={common:3,uncommon:8,rare:20,legendary:60,mythical:200,secret:600};
const BAG_MAX=120,COIN_MAX=1e9,CAST_GREEN=[.82,.96],CAST_PERFECT=[.87,.93];
const speciesById=id=>SPECIES_BY_ID[id]||null;
const rarityById=id=>RARITIES[RARITY_INDEX[id]]||RARITIES[0];
// A catch is worth more the heavier it rolled; mutations multiply the price.
function value(e){
 const sp=speciesById(e&&e.sp);if(!sp)return 0;
 const heft=Math.max(0,Math.min(1,(Number(e.w)-sp.min)/Math.max(.01,sp.max-sp.min)));
 const mult=e.mut&&MUTATIONS[e.mut]?MUTATIONS[e.mut].mult:1;
 return Math.max(1,Math.round((RARITY_VALUE[sp.rarity]||3)*(0.7+0.6*heft)*mult));
}
// Luck bends the rarity roll toward the rare end; strength bends weight heavier; mutation odds scale.
// A PERFECT cast rolls rarity twice and keeps the better roll; it never makes a roll worse.
function rollCatch(rng=Math.random,boost=false,mods){
 const luck=Math.max(0,Math.min(3,(mods&&mods.luck)||0));
 const wb=Math.max(0,Math.min(3,(mods&&mods.weight)||0));
 const mm=Math.max(0,Math.min(6,(mods&&mods.mutation)||1));
 const pick=()=>{const r=Math.pow(rng(),1/(1+luck));let acc=0;for(const t of RARITIES){acc+=t.weight;if(r<acc)return t.id}return 'common'};
 let rid=pick();
 if(boost){const other=pick();if(RARITY_INDEX[other]>RARITY_INDEX[rid])rid=other}
 const pool=SPECIES.filter(s=>s.rarity===rid);
 const sp=pool[Math.min(pool.length-1,Math.floor(rng()*pool.length))];
 const heft=Math.pow(rng(),2/(1+wb));
 const w=Math.round((sp.min+(sp.max-sp.min)*heft)*100)/100;
 const roll=rng();let acc=0,mut=null;
 for(const [id,m] of Object.entries(MUTATIONS)){acc+=Math.min(.5,m.chance*mm);if(roll<acc){mut=id;break}}
 return {sp:sp.id,rarity:rid,w,mut};
}
// Cast charge only sets throw distance; PERFECT is a timing bonus, not a loot guarantee.
function castRating(p){
 p=Math.max(0,Math.min(1,Number(p)||0));
 const perfect=p>=CAST_PERFECT[0]&&p<=CAST_PERFECT[1];
 const label=perfect?'PERFECT':p>=CAST_GREEN[0]&&p<=CAST_GREEN[1]?'Amazing':p>=.6?'Great':p>=.35?'Good':'Meh';
 return {label,perfect,power:p,dist:.25+.75*p};
}
function makeReel(fish,rng,control){
 const d=DIFF[fish.rarity]||DIFF.common,sp=speciesById(fish.sp);
 const heft=sp?Math.max(0,Math.min(1,(fish.w-sp.min)/Math.max(.01,sp.max-sp.min))):.5;
 const barW=Math.min(.5,d.bar*(1+Math.max(0,Math.min(.8,control||0))));
 return {bar:.5,vel:0,barW,fish:.5,fishVel:0,target:.5,swapIn:.5,speed:d.speed*(1+heft*.25),dash:d.dash,fill:d.fill,drain:d.drain,progress:.33,lock:1.1,t:0,on:true,perfect:true,rng:rng||Math.random};
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
const cnt=v=>Math.max(0,Math.min(COIN_MAX,Math.floor(Number(v)||0)));
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
 const rods=[...new Set(['twig',...(Array.isArray(f.rods)?f.rods:[]).filter(r=>Object.hasOwn(RODS_BY_ID,r))])];
 const bait={};
 if(f.bait&&typeof f.bait==='object'&&!Array.isArray(f.bait))for(const b of BAITS){const n=cnt(f.bait[b.id]);if(n)bait[b.id]=Math.min(999,n)}
 return {
  v:1,bag,dex,
  stats:{casts:cnt(st.casts),catches:cnt(st.catches),escapes:cnt(st.escapes),perfects:cnt(st.perfects)},
  settings:{fish:se.fish!==false,sound:se.sound!==false},
  coins:cnt(f.coins),
  rods,
  rod:typeof f.rod==='string'&&rods.includes(f.rod)?f.rod:'twig',
  bait,
  baitSel:typeof f.baitSel==='string'&&Object.hasOwn(BAITS_BY_ID,f.baitSel)?f.baitSel:null,
 };
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
// ---- Fishcoin economy. All return {ok,reason?} and never go negative or duplicate rods. ----
function buyRod(state,id){
 const rod=RODS_BY_ID[id];if(!state||!rod)return {ok:false,reason:'unknown'};
 if(state.rods.includes(id))return {ok:false,reason:'owned'};
 if(state.coins<rod.cost)return {ok:false,reason:'coins'};
 state.coins-=rod.cost;state.rods.push(id);state.rod=id;
 return {ok:true};
}
function equipRod(state,id){
 if(!state||!state.rods.includes(id))return {ok:false,reason:'unknown'};
 state.rod=id;return {ok:true};
}
function buyBait(state,id,n){
 const bait=BAITS_BY_ID[id];n=Math.floor(Number(n)||0);
 if(!state||!bait||n<1||n>99)return {ok:false,reason:'unknown'};
 const cost=bait.cost*n;
 if(state.coins<cost)return {ok:false,reason:'coins'};
 state.coins-=cost;state.bait[id]=Math.min(999,(state.bait[id]||0)+n);
 return {ok:true};
}
function selectBait(state,id){
 if(!state)return {ok:false,reason:'unknown'};
 if(id===null){state.baitSel=null;return {ok:true}}
 if(!BAITS_BY_ID[id]||!(state.bait[id]>0))return {ok:false,reason:'unknown'};
 state.baitSel=id;return {ok:true};
}
function sellFish(state,entryId){
 if(!state)return null;
 const i=state.bag.findIndex(e=>e.id===entryId);if(i<0)return null;
 const coins=value(state.bag[i]);
 state.bag.splice(i,1);
 state.coins=Math.min(COIN_MAX,state.coins+coins);
 return {ok:true,coins};
}
// 'dupes' keeps the heaviest of each species plus every mutated fish; 'all' sells everything.
function sellBulk(state,mode){
 if(!state)return {sold:0,coins:0};
 let keep;
 if(mode==='all')keep=new Set();
 else{
  keep=new Set(state.bag.filter(e=>e.mut).map(e=>e.id));
  const best={};
  for(const e of state.bag)if(!best[e.sp]||e.w>best[e.sp].w)best[e.sp]=e;
  for(const e of Object.values(best))keep.add(e.id);
 }
 let sold=0,coins=0;
 state.bag=state.bag.filter(e=>{
  if(keep.has(e.id))return true;
  sold++;coins+=value(e);return false;
 });
 state.coins=Math.min(COIN_MAX,state.coins+coins);
 return {sold,coins};
}
// Show-off text comes only from a fish that is actually in the bag.
function showOffText(state,entryId){
 const e=state&&state.bag.find(x=>x.id===entryId);if(!e)return null;
 const sp=speciesById(e.sp),r=rarityById(sp.rarity);
 const mut=e.mut?MUTATIONS[e.mut].badge+' '+MUTATIONS[e.mut].label+' ':'';
 return `🎣 shows off a ${mut}${sp.name} — ${e.w} kg (${r.label}${e.perfect?' · Perfect catch ⭐':''})!`;
}
// The reverse: recognize a show-off line from any player so everyone sees the actual fish,
// scaled by its weight, over the angler's head. Returns {sp,w,mut} or null.
function parseShowOff(body){
 if(typeof body!=='string'||body.length>300)return null;
 const m=/shows off a (.+) — ([0-9]+(?:\.[0-9]+)?) kg \(([A-Za-z]+)/.exec(body);
 if(!m)return null;
 let label=m[1].replace(/[^\p{L}\p{N} '-]/gu,'').replace(/\s+/g,' ').trim(),mut=null;
 // Exact species names win (e.g. "Golden Ide"); otherwise strip one mutation-label prefix.
 if(!SPECIES_BY_NAME[label])for(const [id,mm] of Object.entries(MUTATIONS)){const p=mm.label+' ';if(label.startsWith(p)&&SPECIES_BY_NAME[label.slice(p.length)]){mut=id;label=label.slice(p.length);break}}
 const spId=SPECIES_BY_NAME[label];if(!spId)return null;
 const w=Number(m[2]);
 if(!Number.isFinite(w)||w<=0||w>999)return null;
 return {sp:spId,w:Math.round(w*100)/100,mut};
}
// Overhead sprite scale from weight. Big fish are BIG: a 60 kg Cobble Whale shows at
// 5.0 world units - taller than the angler holding it - while a hand-sized minnow is ~0.8.
function showOffScale(w){return Math.round((0.7+4.3*Math.min(1,Math.pow(Math.max(.01,w)/MAX_W,.6)))*100)/100}
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
const fmt=n=>Number(n||0).toLocaleString('en-US');
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
  else if(kind==='coin'){tone(988,t,.07,'square',.03);tone(1319,t+.06,.1,'square',.03)}
 }catch{}
}
const ui={phase:'off',pond:-1,holding:false,chargeT0:0,castR:null,mods:null,biteAt:0,biteEnd:0,shakeAt:0,shakeEl:null,roll:null,reel:null,raf:0,last:0,selected:null,sort:'new',result:null,
 tab:'bag',auto:false,autoNext:0,autoPower:.8,autoHookAt:0,autoSampleAt:0,autoTarget:.5};
let uiPos={};
try{uiPos=JSON.parse(root.localStorage.getItem('pg_fishing_ui_v1'))||{}}catch{}
function saveUiPos(){try{root.localStorage.setItem('pg_fishing_ui_v1',JSON.stringify(uiPos))}catch{}}
function sceneFishing(){return opts&&opts.scene&&opts.scene()?opts.scene().fishing:null}
function pondCenter(){const p=(R().PONDS||[])[ui.pond];return p||null}
function selfPos(){return opts&&opts.self?opts.self():null}
function equippedRod(){return RODS_BY_ID[state().rod]||RODS[0]}
function selectedBait(){const st=state();return st.baitSel&&st.bait[st.baitSel]>0?BAITS_BY_ID[st.baitSel]:null}
function distToPond(){
 const p=pondCenter(),s=selfPos();if(!p||!s)return Infinity;
 const dx=Math.max(0,Math.abs(s.x-p.x)-p.w/2),dz=Math.max(0,Math.abs(s.z-p.z)-p.d/2);
 return Math.hypot(dx,dz);
}
function standPoint(p,s){
 const cx=Math.max(p.x-p.w/2-1.6,Math.min(p.x+p.w/2+1.6,s.x)),cz=Math.max(p.z-p.d/2-1.6,Math.min(p.z+p.d/2+1.6,s.z));
 const candidates=[{x:cx,z:cz}];
 for(const a of [0,.5,1,1.5,2,2.5,3,3.5]){const ang=a*Math.PI/4;candidates.push({x:p.x+Math.cos(ang)*(p.w/2+1.7),z:p.z+Math.sin(ang)*(p.d/2+1.7)})}
 return candidates.find(c=>R().walkable(c.x,c.z))||null;
}
// Drag any fishing window by its header; positions persist per browser.
function makeDraggable(el,handle,key){
 handle.addEventListener('pointerdown',e=>{
  if(e.target.closest('button,select,input,label'))return;
  e.preventDefault();
  const hub=els.hub.getBoundingClientRect(),r=el.getBoundingClientRect();
  const ox=e.clientX-r.left,oy=e.clientY-r.top;
  const move=ev=>{
   let x=ev.clientX-hub.left-ox,y=ev.clientY-hub.top-oy;
   x=Math.max(0,Math.min(Math.max(0,hub.width-r.width),x));
   y=Math.max(0,Math.min(Math.max(0,hub.height-r.height),y));
   el.style.left=x+'px';el.style.top=y+'px';el.style.right='auto';el.style.bottom='auto';el.style.transform='none';
   uiPos[key]=[Math.round(x),Math.round(y)];
  };
  const up=()=>{doc.removeEventListener('pointermove',move);doc.removeEventListener('pointerup',up);saveUiPos()};
  doc.addEventListener('pointermove',move);doc.addEventListener('pointerup',up);
 });
}
function applyPos(el,key){
 const p=uiPos[key];if(!Array.isArray(p))return;
 const hub=els.hub.getBoundingClientRect();
 const x=Math.max(0,Math.min(Math.max(0,hub.width-120),Number(p[0])||0)),y=Math.max(0,Math.min(Math.max(0,hub.height-80),Number(p[1])||0));
 el.style.left=x+'px';el.style.top=y+'px';el.style.right='auto';el.style.bottom='auto';el.style.transform='none';
}
function ensureDom(){
 if(els||!doc)return;
 const hub=doc.getElementById('socialHub');if(!hub)return;
 const dock=doc.createElement('section');dock.id='fishingDock';dock.hidden=true;dock.setAttribute('aria-label','Fishing');
 dock.innerHTML='<div id="fishingDockHead" title="Drag to move"><span id="fishingSpot">🎣 South Lawn Pond</span><span id="fishingDockBtns"><button id="fishingAutoBtn" type="button" title="Auto fishing: casts, hooks and reels by itself until you stop it" aria-pressed="false">▶ Auto</button><button id="fishingBagBtn" type="button" aria-haspopup="dialog">🧺 Bag <small id="fishingBagCount"></small></button><button id="fishingStopBtn" type="button" title="Stop fishing" aria-label="Stop fishing">✕</button></span></div><button id="fishingGearLine" type="button" title="Open the rod &amp; bait shop"></button><div id="fishingStage" role="button" tabindex="0" aria-label="Fishing action area"></div><p id="fishingStatus" aria-live="polite"></p>';
 const panel=doc.createElement('section');panel.id='fishingPanel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Fishing Bag');
 panel.innerHTML='<header id="fishingPanelHead" title="Drag to move"><strong>🎣 Fishing</strong><span id="fishingCoins" title="Fishcoins — sell catches to earn, spend on rods &amp; bait">🪙 0</span><button id="fishingPanelClose" type="button" aria-label="Close Fishing window">✕</button></header><nav id="fishingTabs" role="tablist" aria-label="Fishing sections"><button type="button" role="tab" data-ftab="bag" aria-selected="true">🧺 Bag</button><button type="button" role="tab" data-ftab="index" aria-selected="false">📖 Index</button><button type="button" role="tab" data-ftab="shop" aria-selected="false">🛒 Shop</button></nav><div id="fishingBagView"><div id="fishingRecords"></div><div id="fishingTools"><select id="fishingSort" aria-label="Sort fish"><option value="new">Newest</option><option value="heavy">Heaviest</option><option value="rare">Rarest</option><option value="value">Most valuable</option></select><button id="fishingSellDupes" type="button" title="Sells everything except your heaviest of each species and every mutated fish">💰 Sell dupes</button><label title="Show the fish swimming in the ponds"><input type="checkbox" id="fishingShowFish"> Pond fish</label><label title="Fishing sound effects"><input type="checkbox" id="fishingSound"> Sounds</label></div><div id="fishingGrid" role="listbox" aria-label="Caught fish"></div><footer id="fishingDetail" hidden></footer></div><div id="fishingIndexView" hidden></div><div id="fishingShopView" hidden></div>';
 const shakes=doc.createElement('div');shakes.id='fishingShakes';shakes.hidden=true;
 // v290: the toolbar button opens this menu instead of instantly walking to a pond. Start
 // fishing is an explicit choice; Bag / Index / Shop open anywhere in the plaza, no walking.
 const menu=doc.createElement('div');menu.id='fishingMenu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Fishing menu');
 if(REDUCED()){dock.classList.add('reduced');shakes.classList.add('reduced')}
 hub.append(dock,panel,shakes,menu);
 els={hub,dock,panel,shakes,menu,stage:doc.getElementById('fishingStage'),status:doc.getElementById('fishingStatus'),grid:doc.getElementById('fishingGrid'),records:doc.getElementById('fishingRecords'),detail:doc.getElementById('fishingDetail'),bagCount:doc.getElementById('fishingBagCount'),spot:doc.getElementById('fishingSpot'),gearLine:doc.getElementById('fishingGearLine'),coins:doc.getElementById('fishingCoins'),bagView:doc.getElementById('fishingBagView'),indexView:doc.getElementById('fishingIndexView'),shopView:doc.getElementById('fishingShopView'),autoBtn:doc.getElementById('fishingAutoBtn')};
 doc.getElementById('fishingStopBtn').onclick=()=>stopFishing();
 doc.getElementById('fishingBagBtn').onclick=()=>toggleBag();
 doc.getElementById('fishingPanelClose').onclick=()=>toggleBag(false);
 doc.getElementById('fishingSort').onchange=e=>{ui.sort=e.target.value;renderBag()};
 doc.getElementById('fishingSellDupes').onclick=()=>{const r=sellBulk(state(),'dupes');persist();if(r.sold){sound('coin');status(`Sold ${r.sold} fish for 🪙 ${fmt(r.coins)}.`)}ui.selected=null;renderPanel();renderDockGear()};
 doc.getElementById('fishingShowFish').onchange=e=>{state().settings.fish=e.target.checked;persist();const f=sceneFishing();f&&f.setFishVisible(e.target.checked)};
 doc.getElementById('fishingSound').onchange=e=>{state().settings.sound=e.target.checked;persist()};
 els.autoBtn.onclick=()=>setAuto(!ui.auto);
 els.gearLine.onclick=()=>{toggleBag(true);switchTab('shop')};
 for(const b of panel.querySelectorAll('#fishingTabs button'))b.onclick=()=>switchTab(b.dataset.ftab);
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
 makeDraggable(dock,doc.getElementById('fishingDockHead'),'dock');
 makeDraggable(panel,doc.getElementById('fishingPanelHead'),'panel');
 applyPos(dock,'dock');applyPos(panel,'panel');
 doc.addEventListener('pointerdown',e=>{
  if(els&&!els.menu.hidden&&!e.target.closest('#fishingMenu')&&!(opts&&opts.button&&opts.button.contains(e.target)))toggleMenu(false);
 });
}
function renderMenu(){
 if(!els)return;
 const st=state();
 els.menu.innerHTML=
  `<button type="button" role="menuitem" data-fm="start">${ui.phase==='off'?'▶ Start fishing<small>walks to the nearest pond</small>':'⏹ Stop fishing'}</button>`+
  `<button type="button" role="menuitem" data-fm="bag">🧺 Fishing Bag<small>${st.bag.length}/${BAG_MAX} · show off from anywhere</small></button>`+
  `<button type="button" role="menuitem" data-fm="index">📖 Fish Index<small>${Object.keys(st.dex).filter(k=>st.dex[k].n>0).length}/${SPECIES.length} discovered · catch rates</small></button>`+
  `<button type="button" role="menuitem" data-fm="shop">🛒 Tackle Shop<small>🪙 ${fmt(st.coins)}</small></button>`;
 for(const b of els.menu.querySelectorAll('button'))b.onclick=()=>{
  toggleMenu(false);
  if(b.dataset.fm==='start'){if(ui.phase==='off')startFishing();else stopFishing()}
  else{toggleBag(true);switchTab(b.dataset.fm)}
 };
}
function toggleMenu(force){
 ensureDom();if(!els)return;
 const show=typeof force==='boolean'?force:els.menu.hidden;
 if(opts&&opts.button)opts.button.setAttribute('aria-expanded',String(show));
 if(!show){els.menu.hidden=true;return}
 renderMenu();
 els.menu.hidden=false;
 if(opts&&opts.button&&typeof opts.button.getBoundingClientRect==='function'){
  const hubR=els.hub.getBoundingClientRect(),bR=opts.button.getBoundingClientRect();
  const mw=els.menu.offsetWidth||200;
  const x=Math.max(8,Math.min(Math.max(8,hubR.width-mw-8),bR.left-hubR.left));
  els.menu.style.left=x+'px';
  els.menu.style.top=Math.max(8,bR.bottom-hubR.top+6)+'px';
 }
}
function status(text){if(els)els.status.textContent=text||''}
function setAuto(on){
 ui.auto=!!on;
 if(els){els.autoBtn.textContent=ui.auto?'⏸ Auto':'▶ Auto';els.autoBtn.setAttribute('aria-pressed',String(ui.auto));els.autoBtn.classList.toggle('on',ui.auto)}
 if(ui.auto){ui.autoNext=now()+400;clearShake();if(ui.phase!=='off')status('Auto fishing — click ⏸ Auto or ✕ to stop.')}
 else if(ui.phase!=='off')status('Auto fishing off.');
}
function setPhase(phase){ui.phase=phase;renderStage();if(opts&&opts.button){opts.button.textContent=phase==='off'?'🎣 Fishing':'🎣 Fishing…';opts.button.setAttribute('aria-pressed',String(phase!=='off'))}}
function mutFilter(mut){return mut&&MUTATIONS[mut]?' '+MUTATIONS[mut].css:''}
function glyphHTML(sp,mut,cls='fishing-glyph'){
 return `<span class="${cls}${mut?' mut-'+mut:''}" style="filter:hue-rotate(${sp.hue}deg)${mutFilter(mut)}">${sp.glyph}</span>`;
}
function renderDockGear(){
 if(!els)return;
 const st=state(),rod=equippedRod(),bait=selectedBait();
 els.gearLine.innerHTML=`<span>🪙 ${fmt(st.coins)}</span><span>${rod.icon} ${esc(rod.name)}</span><span>${bait?`${bait.icon} ${esc(bait.name)} ×${st.bait[bait.id]}`:'No bait'}</span>`;
 els.bagCount.textContent=st.bag.length+'/'+BAG_MAX;
 if(els.coins)els.coins.textContent='🪙 '+fmt(st.coins);
}
function renderStage(){
 if(!els)return;
 const stage=els.stage;
 els.dock.hidden=ui.phase==='off';
 els.dock.dataset.phase=ui.phase;
 renderDockGear();
 if(ui.phase==='off'){clearShake();setAuto(false);return}
 if(ui.phase==='walking'){stage.innerHTML='<div class="fishing-wait"><span class="fishing-walk">🚶</span> Walking to the pond…</div>';status('Click 🎣 Stop fishing to cancel.');return}
 if(ui.phase==='ready'){
  stage.innerHTML='<button id="fishingHold" type="button" class="fishing-hold"><span class="fishing-hold-ring"></span><span class="fishing-hold-icon">🎣</span><span class="fishing-hold-text">HOLD to cast</span></button>';
  if(!ui.auto)status('Hold the button (or Space), release in the green zone for a PERFECT cast.');
  return;
 }
 if(ui.phase==='charge'){
  stage.innerHTML='<div class="fishing-meter"><div class="fishing-meter-track"><i class="fishing-meter-green"></i><i class="fishing-meter-perfect"></i><b id="fishingMeterMark"></b></div><p class="fishing-meter-tip">Release in the green!</p></div>';
  return;
 }
 if(ui.phase==='flight'){stage.innerHTML=`<div class="fishing-wait"><span class="fishing-cast-label${ui.castR&&ui.castR.perfect?' is-perfect':''}">${ui.castR?esc(ui.castR.label):''} cast!</span></div>`;status('');return}
 if(ui.phase==='wait'){stage.innerHTML='<div class="fishing-wait"><span class="fishing-bob">🎈</span> Waiting for a bite<span class="fishing-dots"><i>.</i><i>.</i><i>.</i></span></div>';if(!ui.auto)status('Click the SHAKE! bubbles to attract fish faster.');return}
 if(ui.phase==='bite'){stage.innerHTML='<div class="fishing-bite"><span>❗</span> BITE — CLICK!</div>';status('');return}
 if(ui.phase==='reel'){
  stage.innerHTML='<div class="fishing-reel"><div class="fishing-track"><div id="fishingBarEl" class="fishing-bar"></div><span id="fishingFishEl" class="fishing-fish">🐟</span></div><div class="fishing-progress"><i id="fishingProgressEl"></i></div><div class="fishing-reel-row"><span id="fishingCrank" class="fishing-crank">🎣</span><span id="fishingReelHint">HOLD to pull ▶ · release to drift ◀</span><span id="fishingPerfectStar" title="Perfect so far">⭐</span></div></div>';
  status(ui.auto?'Auto reeling…':'Keep the fish inside your bar to fill the line!');
  return;
 }
 if(ui.phase==='result'){
  const r=ui.result;
  if(!r){setPhase('ready');return}
  if(r.kind==='catch'){
   const sp=speciesById(r.entry.sp),rar=rarityById(sp.rarity),worth=value(r.entry);
   stage.innerHTML=`<div class="fishing-card" data-rarity="${sp.rarity}" style="--rar:${rar.color}">${r.isNew?'<span class="fishing-new">NEW SPECIES!</span>':''}${glyphHTML(sp,r.entry.mut,'fishing-card-glyph')}<div class="fishing-card-info"><strong>${esc(sp.name)}</strong><span class="fishing-chip" style="background:${rar.color}">${rar.label}</span>${r.entry.mut?`<span class="fishing-chip fishing-mut">${MUTATIONS[r.entry.mut].badge} ${MUTATIONS[r.entry.mut].label}</span>`:''}<p>${r.entry.w} kg · worth 🪙 ${fmt(worth)}${r.entry.perfect?' · Perfect ⭐':''}</p></div><div class="fishing-card-btns"><button id="fishingAgain" type="button">🎣 Cast again</button><button id="fishingBrag" type="button">📣 Show off</button><button id="fishingSellNow" type="button">💰 Sell ${fmt(worth)}</button></div></div>`;
   doc.getElementById('fishingAgain').onclick=()=>{ui.result=null;setPhase('ready')};
   doc.getElementById('fishingBrag').onclick=()=>{showOff(r.entry.id);ui.result=null;setPhase('ready')};
   doc.getElementById('fishingSellNow').onclick=()=>{const res=sellFish(state(),r.entry.id);if(res){persist();sound('coin');status('Sold for 🪙 '+fmt(res.coins)+'.')}ui.result=null;setPhase('ready')};
   if(!ui.auto)status('Space casts again.');
  }else{
   stage.innerHTML=`<div class="fishing-card is-escape"><span class="fishing-card-glyph">💨</span><div class="fishing-card-info"><strong>${r.kind==='slow'?'Too slow — it got away…':'The line went slack — it escaped!'}</strong><p>Keep the fish inside your bar next time.</p></div><div class="fishing-card-btns"><button id="fishingAgain" type="button">🎣 Try again</button></div></div>`;
   doc.getElementById('fishingAgain').onclick=()=>{ui.result=null;setPhase('ready')};
   if(!ui.auto)status('Space casts again.');
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
  if(state().bag.length>=BAG_MAX){status('Bag full ('+BAG_MAX+') — sell or release some fish first.');toggleBag(true);if(ui.auto)setAuto(false);return}
  ui.holding=true;ui.chargeT0=now();setPhase('charge');return;
 }
 if(ui.phase==='bite'){hook();return}
 if(ui.phase==='reel'){ui.holding=true;const c=doc.getElementById('fishingCrank');c&&c.classList.add('spin');return}
 if(ui.phase==='result'){ui.result=null;setPhase('ready');return}
}
function holdUp(){
 if(ui.phase==='charge'&&ui.holding){ui.holding=false;releaseCast();return}
 if(ui.phase==='reel'&&!ui.auto){ui.holding=false;const c=doc.getElementById('fishingCrank');c&&c.classList.remove('spin')}
}
function castPower(){
 const t=(now()-ui.chargeT0)/1100,leg=t%2;
 return leg<=1?leg:2-leg; // ping-pong 0→1→0
}
function releaseCast(){
 const p=pondCenter(),s=selfPos();if(!p||!s){stopFishing();return}
 ui.castR=castRating(castPower());
 const st=state(),rod=equippedRod(),bait=selectedBait();
 // Bait is consumed by the cast; the rod is permanent.
 if(bait){st.bait[bait.id]--;if(st.bait[bait.id]<=0){delete st.bait[bait.id];st.baitSel=null}}
 ui.mods={luck:rod.luck+(bait?bait.luck:0),weight:rod.strength+(bait?bait.weight:0),mutation:bait?bait.mutation:1,control:rod.control,lure:rod.lure};
 st.stats.casts++;persist();renderDockGear();
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
 const lure=Math.max(0,Math.min(1.5,(ui.mods&&ui.mods.lure)||0));
 ui.biteAt=now()+(4000+Math.random()*8000)/(1+lure);
 ui.shakeAt=now()+1300;
}
function hook(){
 clearShake();
 const f=sceneFishing();f&&f.bite(false);
 ui.roll=rollCatch(Math.random,!!(ui.castR&&ui.castR.perfect),ui.mods);
 ui.reel=makeReel(ui.roll,Math.random,(ui.mods&&ui.mods.control)||0);
 ui.last=now();
 ui.autoSampleAt=0;
 setPhase('reel');
 f&&f.reel(.3);
}
function finishReel(kind){
 const f=sceneFishing();
 ui.holding=false;
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
 ui.autoNext=now()+1300;
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
  if(distToPond()<=2.4){setPhase('ready');ui.autoNext=t+500}
  return;
 }
 if(ui.phase==='ready'&&ui.auto&&t>=ui.autoNext){
  ui.autoPower=.55+Math.random()*.4;
  holdDown();
  return;
 }
 if(ui.phase==='charge'){
  if(ui.auto&&castPower()>=ui.autoPower)holdUp();
  else{const mark=doc.getElementById('fishingMeterMark');if(mark)mark.style.left=(castPower()*100).toFixed(1)+'%'}
  return;
 }
 if(ui.phase==='wait'){
  if(t>=ui.biteAt){
   setPhase('bite');ui.biteEnd=t+1500;clearShake();
   ui.autoHookAt=t+250+Math.random()*600;
   sound('bite');const f=sceneFishing();f&&f.bite(true);
   return;
  }
  if(!ui.auto&&t>=ui.shakeAt){ui.shakeAt=t+1500+Math.random()*1200;spawnShake()}
  return;
 }
 if(ui.phase==='bite'){
  if(ui.auto&&t>=ui.autoHookAt){hook();return}
  if(t>=ui.biteEnd){const f=sceneFishing();f&&f.escapeSplash();state().stats.escapes++;persist();sound('fail');ui.result={kind:'slow'};ui.autoNext=t+1300;setPhase('result')}
  return;
 }
 if(ui.phase==='reel'&&ui.reel){
  if(ui.auto){
   if(t>=ui.autoSampleAt){ui.autoSampleAt=t+130;ui.autoTarget=ui.reel.fish+ui.reel.fishVel*.18}
   ui.holding=ui.reel.bar<ui.autoTarget;
  }
  const out=reelStep(ui.reel,dt,ui.holding);
  const bar=doc.getElementById('fishingBarEl'),fish=doc.getElementById('fishingFishEl'),prog=doc.getElementById('fishingProgressEl'),star=doc.getElementById('fishingPerfectStar'),crank=doc.getElementById('fishingCrank');
  if(bar){bar.style.width=(ui.reel.barW*100)+'%';bar.style.left=((ui.reel.bar-ui.reel.barW/2)*100)+'%';bar.classList.toggle('on',ui.reel.on);bar.classList.toggle('held',ui.holding)}
  if(fish)fish.style.left=(ui.reel.fish*100)+'%';
  if(prog){prog.style.width=(ui.reel.progress*100).toFixed(1)+'%';prog.classList.toggle('danger',ui.reel.progress<.22)}
  if(star)star.hidden=!ui.reel.perfect;
  if(crank)crank.classList.toggle('spin',ui.holding);
  const f=sceneFishing();f&&f.reel(Math.min(1,Math.abs(ui.reel.fishVel)/1.4));
  if(out)finishReel(out);
  return;
 }
 if(ui.phase==='result'&&ui.auto&&t>=ui.autoNext){
  ui.result=null;setPhase('ready');ui.autoNext=t+450;
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
  if(stand&&opts.moveTo)opts.moveTo(stand.x,stand.z);
  setPhase('walking');
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
// ---------------- the one Fishing window: Bag / Index / Shop tabs --------------------------
function toggleBag(force){
 ensureDom();if(!els)return;
 const show=typeof force==='boolean'?force:els.panel.hidden;
 els.panel.hidden=!show;
 if(show){applyPos(els.panel,'panel');syncSettings();renderPanel()}
}
function switchTab(tab){
 if(!['bag','index','shop'].includes(tab))tab='bag';
 ui.tab=tab;
 for(const b of els.panel.querySelectorAll('#fishingTabs button'))b.setAttribute('aria-selected',String(b.dataset.ftab===tab));
 els.bagView.hidden=tab!=='bag';
 els.indexView.hidden=tab!=='index';
 els.shopView.hidden=tab!=='shop';
 renderPanel();
}
function renderPanel(){
 if(!els||els.panel.hidden)return;
 renderDockGear();
 if(ui.tab==='bag')renderBag();
 else if(ui.tab==='index')renderIndex();
 else renderShop();
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
 else if(ui.sort==='value')bag.sort((a,b)=>value(b)-value(a));
 else bag.sort((a,b)=>b.at-a.at);
 return bag;
}
function renderBag(){
 if(!els)return;
 const st=state();
 const best=st.bag.reduce((b,e)=>!b||e.w>b.w?e:b,null);
 const species=Object.keys(st.dex).filter(k=>st.dex[k].n>0).length;
 els.records.innerHTML=`<span>Catches <b>${fmt(st.stats.catches)}</b></span><span>Species <b>${species}/${SPECIES.length}</b></span><span>Perfect <b>${fmt(st.stats.perfects)}</b></span><span>${best?`Best <b>${esc(speciesById(best.sp).name)} ${best.w} kg</b>`:'Best <b>—</b>'}</span><span>Bag <b>${st.bag.length}/${BAG_MAX}</b></span>`;
 const bag=sortedBag();
 if(!bag.length){els.grid.innerHTML='<p class="fishing-empty">No fish yet — stand by a South Lawn pond and press 🎣 Fishing to cast.</p>';els.detail.hidden=true;ui.selected=null;return}
 els.grid.replaceChildren(...bag.map(e=>{
  const sp=speciesById(e.sp),r=rarityById(sp.rarity);
  const b=doc.createElement('button');b.type='button';b.className='fishing-slot';b.dataset.rarity=sp.rarity;b.style.setProperty('--rar',r.color);
  b.setAttribute('role','option');b.setAttribute('aria-selected',String(ui.selected===e.id));
  if(ui.selected===e.id)b.classList.add('selected');
  b.innerHTML=glyphHTML(sp,e.mut)+`<small>${e.w} kg</small>${e.mut?`<i class="fishing-slot-mut">${MUTATIONS[e.mut].badge}</i>`:''}${e.perfect?'<i class="fishing-slot-star">⭐</i>':''}`;
  b.title=`${sp.name} · ${r.label} · worth 🪙 ${fmt(value(e))}`;
  b.onclick=()=>{ui.selected=e.id;renderBag()};
  return b;
 }));
 renderDetail();
}
function renderDetail(){
 const st=state(),e=st.bag.find(x=>x.id===ui.selected);
 if(!e){els.detail.hidden=true;return}
 const sp=speciesById(e.sp),r=rarityById(sp.rarity),worth=value(e);
 els.detail.hidden=false;
 els.detail.innerHTML=`<div class="fishing-detail-main">${glyphHTML(sp,e.mut,'fishing-detail-glyph')}<div><strong>${esc(sp.name)}</strong> <span class="fishing-chip" style="background:${r.color}">${r.label}</span>${e.mut?` <span class="fishing-chip fishing-mut">${MUTATIONS[e.mut].badge} ${MUTATIONS[e.mut].label}</span>`:''}<p>${e.w} kg · worth 🪙 ${fmt(worth)}${e.perfect?' · Perfect catch ⭐':''}${e.at?' · '+new Date(e.at).toLocaleDateString():''}</p></div></div><div class="fishing-detail-btns"><button id="fishingShowOffBtn" type="button">📣 Show off</button><button id="fishingSellBtn" type="button">💰 Sell ${fmt(worth)}</button><button id="fishingReleaseBtn" type="button">🌊 Release</button></div>`;
 doc.getElementById('fishingShowOffBtn').onclick=()=>showOff(e.id);
 doc.getElementById('fishingSellBtn').onclick=()=>{const res=sellFish(st,e.id);if(res){persist();sound('coin');status('Sold for 🪙 '+fmt(res.coins)+'.');ui.selected=null;renderPanel();renderDockGear()}};
 const rel=doc.getElementById('fishingReleaseBtn');
 rel.onclick=()=>{
  if(rel.dataset.confirm){const i=st.bag.findIndex(x=>x.id===e.id);if(i>=0)st.bag.splice(i,1);persist();ui.selected=null;renderBag();renderDockGear()}
  else{rel.dataset.confirm='1';rel.textContent='Release?';setTimeout(()=>{if(rel.isConnected){delete rel.dataset.confirm;rel.textContent='🌊 Release'}},2600)}
 };
}
// 📖 The full 70-fish index with no-luck catch rates; undiscovered entries show as silhouettes.
function renderIndex(){
 const st=state();
 const rows=SPECIES.map(sp=>{
  const r=rarityById(sp.rarity),d=st.dex[sp.id],found=d&&d.n>0;
  const pct=rate(sp.id)*100;
  const odds='1 in '+fmt(Math.round(1/rate(sp.id)));
  return `<div class="fishing-dex-row${found?'':' undiscovered'}" style="--rar:${r.color}">
   <span class="fishing-dex-glyph" style="filter:${found?`hue-rotate(${sp.hue}deg)`:'brightness(0) opacity(.45)'}">${sp.glyph}</span>
   <span class="fishing-dex-name">${found?esc(sp.name):'???'}<small>${sp.min}–${sp.max} kg${found?` · best ${d.bw} kg · ×${fmt(d.n)}`:''}${found&&d.mut.length?' · '+d.mut.map(m=>MUTATIONS[m].badge).join(''):''}</small></span>
   <span class="fishing-chip" style="background:${r.color}">${r.label}</span>
   <span class="fishing-dex-rate" title="Base catch rate with no rod or bait luck">${pct>=1?pct.toFixed(1)+'%':pct.toFixed(2)+'%'}<small>${odds}</small></span>
  </div>`;
 }).join('');
 const found=Object.keys(st.dex).filter(k=>st.dex[k].n>0).length;
 els.indexView.innerHTML=`<p class="fishing-dex-head">Discovered <b>${found}/${SPECIES.length}</b> · rates shown are base odds — rods &amp; bait tilt them toward the rare end.</p><div class="fishing-dex-list">${rows}</div>`;
}
// 🛒 Rods & bait, paid with Fishcoins earned by selling fish.
function renderShop(){
 const st=state();
 const rodRows=RODS.map(rod=>{
  const owned=st.rods.includes(rod.id),equipped=st.rod===rod.id;
  const stats=`🍀 +${Math.round(rod.luck*100)}% · 🎯 +${Math.round(rod.control*100)}% · 🏋️ +${Math.round(rod.strength*100)}% · ⏱ +${Math.round(rod.lure*100)}%`;
  const btn=equipped?'<button type="button" disabled>Equipped</button>':owned?`<button type="button" data-equip="${rod.id}">Equip</button>`:`<button type="button" data-rod="${rod.id}" ${st.coins<rod.cost?'disabled':''}>🪙 ${fmt(rod.cost)}</button>`;
  return `<div class="fishing-shop-row${equipped?' equipped':''}"><span class="fishing-shop-icon">${rod.icon}</span><span class="fishing-shop-name">${esc(rod.name)}<small>${stats}</small></span>${btn}</div>`;
 }).join('');
 const baitRows=BAITS.map(b=>{
  const ownedN=st.bait[b.id]||0,selected=st.baitSel===b.id;
  const stats=`🍀 +${Math.round(b.luck*100)}%${b.weight?` · 🏋️ +${Math.round(b.weight*100)}%`:''}${b.mutation>1?` · 🧬 ×${b.mutation}`:''}`;
  return `<div class="fishing-shop-row${selected?' equipped':''}"><span class="fishing-shop-icon">${b.icon}</span><span class="fishing-shop-name">${esc(b.name)}<small>${stats} · owned ×${ownedN}</small></span><span class="fishing-shop-btns"><button type="button" data-bait="${b.id}" data-n="1" ${st.coins<b.cost?'disabled':''}>🪙 ${fmt(b.cost)}</button><button type="button" data-bait="${b.id}" data-n="10" ${st.coins<b.cost*10?'disabled':''}>×10</button><button type="button" data-use="${b.id}" ${ownedN?'':'disabled'}>${selected?'Using':'Use'}</button></span></div>`;
 }).join('');
 els.shopView.innerHTML=`<p class="fishing-shop-head">🪙 <b>${fmt(st.coins)}</b> Fishcoins — earn them by selling fish from the Bag.</p><h4>Rods <small>permanent · luck / control / strength / lure speed</small></h4>${rodRows}<h4>Bait <small>one is used per cast</small></h4>${baitRows}<div class="fishing-shop-row${st.baitSel===null?' equipped':''}"><span class="fishing-shop-icon">🚫</span><span class="fishing-shop-name">No bait<small>fish with the rod alone</small></span><button type="button" data-use="none" ${st.baitSel===null?'disabled':''}>Use</button></div>`;
 for(const b of els.shopView.querySelectorAll('button[data-rod]'))b.onclick=()=>{const r=buyRod(st,b.dataset.rod);if(r.ok){persist();sound('coin');status('Bought and equipped the '+RODS_BY_ID[b.dataset.rod].name+'!')}else if(r.reason==='coins')status('Not enough Fishcoins.');renderPanel()};
 for(const b of els.shopView.querySelectorAll('button[data-equip]'))b.onclick=()=>{equipRod(st,b.dataset.equip);persist();renderPanel()};
 for(const b of els.shopView.querySelectorAll('button[data-bait]'))b.onclick=()=>{const r=buyBait(st,b.dataset.bait,Number(b.dataset.n));if(r.ok){persist();sound('coin');if(!st.baitSel)selectBait(st,b.dataset.bait)}else if(r.reason==='coins')status('Not enough Fishcoins.');renderPanel()};
 for(const b of els.shopView.querySelectorAll('button[data-use]'))b.onclick=()=>{selectBait(st,b.dataset.use==='none'?null:b.dataset.use);persist();renderPanel()};
}
function showOff(entryId){
 const st=state();
 const text=showOffText(st,entryId);
 if(!text)return false;
 if(opts&&typeof opts.showOff==='function')return opts.showOff(text)!==false;
 return false;
}
// A show-off line arrived on Local chat (from anyone, including ourselves): render the real
// fish, scaled by weight, over that player's head in the 3D plaza. Returns true when the fish
// was displayed - the caller then SKIPS the chat bubble, which used to cover the fish (the
// text still lands in the chat panel for everyone to read).
function onLocalMessage(fromId,body){
 const parsed=parseShowOff(body);
 if(!parsed)return false;
 const sp=speciesById(parsed.sp),f=sceneFishing();
 if(!sp||!f||typeof f.showFish!=='function')return false;
 const mut=parsed.mut?MUTATIONS[parsed.mut]:null;
 f.showFish(fromId,{text:sp.glyph,hue:sp.hue,scale:showOffScale(parsed.w),glow:mut?mut.glow:null,ms:5600});
 return true;
}
// ---------------- wiring from assets/social.js ---------------------------------------------
function bind(options){
 opts=options||opts;
 ensureDom();
 // v290: the toolbar button opens the fishing menu (Start fishing / Bag / Index / Shop).
 // It never walks on its own - only the explicit "Start fishing" item (or a pond click) does.
 if(opts&&opts.button&&!opts.button._fishing){opts.button._fishing=true;opts.button.setAttribute('aria-haspopup','menu');opts.button.onclick=()=>toggleMenu()}
 const f=sceneFishing();f&&f.setFishVisible(state().settings.fish);
}
function toggle(){if(ui.phase==='off')startFishing();else stopFishing()}
function pondClick(x,z,idx){
 if(ui.phase==='off')startFishing(idx);
 else if(ui.phase==='walking'||ui.phase==='ready')startFishing(idx);
}
function hubClosed(){stopFishing();if(els){els.panel.hidden=true;els.menu.hidden=true}}
return {
 // pure core (tests)
 RARITIES,SPECIES,DIFF,MUTATIONS,RODS,BAITS,BAG_MAX,CAST_GREEN,CAST_PERFECT,MAX_W,
 speciesById,rarityById,rate,value,rollCatch,castRating,makeReel,reelStep,normalize,addCatch,
 buyRod,equipRod,buyBait,selectBait,sellFish,sellBulk,showOffText,parseShowOff,showOffScale,
 // UI
 bind,toggle,pondClick,hubClosed,onLocalMessage,openBag:()=>toggleBag(true),
 get phase(){return ui.phase},
 get auto(){return ui.auto},
};
});
