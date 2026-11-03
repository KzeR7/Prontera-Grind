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
// v288: the index holds 70 species and the 14 original ids survive with their rarities.
assert.equal(F.SPECIES.length,70,'70 fish species');
const legacy={minnow:'common',carp:'common',smelt:'common',goby:'common',bream:'uncommon',perch:'uncommon',trout:'uncommon',koi:'rare',pike:'rare',tetra:'rare',fountainfish:'legendary',arowana:'legendary',leviathan:'mythical',poring:'secret'};
for(const [id,rar] of Object.entries(legacy))assert.equal(F.speciesById(id)?.rarity,rar,'v287 species '+id+' is unchanged');
// Displayed catch rates: each rarity's weight split across its pool; all 70 sum to 1.
let rateSum=0;
for(const sp of F.SPECIES){const r=F.rate(sp.id);assert(r>0&&r<1);rateSum+=r}
assert(Math.abs(rateSum-1)<1e-9,'catch rates sum to 100%');
assert(F.rate('minnow')>F.rate('poring'),'commons are more likely than secrets');
// v288: seven mutation kinds, each with a visual + value multiplier.
assert.equal(Object.keys(F.MUTATIONS).length,7);
for(const m of Object.values(F.MUTATIONS)){assert(m.chance>0&&m.chance<.2);assert(m.mult>1);assert(m.label&&m.badge&&m.glow)}
assert(F.MUTATIONS.prismatic.mult>F.MUTATIONS.shiny.mult,'rarer mutations are worth more');

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
 assert(roll.mut===null||Object.hasOwn(F.MUTATIONS,roll.mut));
}
// v288: luck tilts rarity upward, strength tilts weight heavier, bait multiplies mutations.
const lcg=seed=>{let x=seed>>>0;return ()=>((x=(x*1664525+1013904223)>>>0)/4294967296)};
const rareShare=mods=>{let rng=lcg(7),n=0;for(let i=0;i<4000;i++){const r=F.rollCatch(rng,false,mods);if(['rare','legendary','mythical','secret'].includes(r.rarity))n++}return n};
assert(rareShare({luck:2})>rareShare({luck:0})*1.5,'luck raises the odds of rare+ fish');
const heftAvg=mods=>{let rng=lcg(11),sum=0;for(let i=0;i<3000;i++){const r=F.rollCatch(rng,false,mods),sp=F.speciesById(r.sp);sum+=(r.w-sp.min)/(sp.max-sp.min)}return sum/3000};
assert(heftAvg({weight:3})>heftAvg({weight:0})+.15,'weight gear rolls heavier fish');
const mutShare=mods=>{let rng=lcg(13),n=0;for(let i=0;i<6000;i++)if(F.rollCatch(rng,false,mods).mut)n++;return n};
assert(mutShare({mutation:6})>mutShare({mutation:1})*2,'bait multiplies mutation odds');
// Control (better rods) widens the reel bar but stays inside the track.
assert(F.makeReel(fish0(),()=>.5,.5).barW>F.makeReel(fish0(),()=>.5,0).barW,'control widens the bar');
assert(F.makeReel({sp:'minnow',rarity:'common',w:.4,mut:null},()=>.5,99).barW<=.5,'bar width caps');
function fish0(){return {sp:'minnow',rarity:'common',w:.4,mut:null}}

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
// v295: pond fish are permanently on - a save that had the old toggle off comes back visible.
assert.equal(st.settings.fish,true,'v295 forces swimming pond fish on for every save');
assert.equal(st.settings.sound,true);
st=F.normalize({bag:Array.from({length:300},(_,i)=>({sp:'minnow',w:.2,id:'x'+i}))});
assert.equal(st.bag.length,F.BAG_MAX,'bag caps at '+F.BAG_MAX);
// v288: the economy fields survive normalization and reject garbage.
st=F.normalize(null);
assert.equal(st.coins,0);assert.deepEqual(st.rods,['twig']);assert.equal(st.rod,'twig');assert.deepEqual(st.bait,{});assert.equal(st.baitSel,null);
st=F.normalize({coins:-5,rods:['oak','fake','oak'],rod:'mythril',bait:{worm:'7',fake:3,jelly:-2},baitSel:'jelly'});
assert.equal(st.coins,0,'coins never go negative');
assert.deepEqual(st.rods,['twig','oak'],'unknown/duplicate rods dropped, twig always owned');
assert.equal(st.rod,'twig','cannot equip an unowned rod');
assert.deepEqual(st.bait,{worm:7},'unknown bait and non-positive counts dropped');
assert.equal(st.baitSel,'jelly','bait selection keeps a known id');
st=F.normalize({coins:9e15});
assert.equal(st.coins,1e9,'coins cap');

// --- v288 Fishcoin economy: sell -> coins -> rods & bait --------------------------------
st=F.normalize(null);
const cheap=F.addCatch(st,{sp:'minnow',rarity:'common',w:.1},1);
const heavy=F.addCatch(st,{sp:'minnow',rarity:'common',w:.7},2);
const shiny=F.addCatch(st,{sp:'minnow',rarity:'common',w:.4,mut:'shiny'},3);
assert(F.value(heavy)>F.value(cheap),'heavier fish are worth more');
assert(F.value(shiny)>F.value({...shiny,mut:null}),'mutations multiply the price');
assert(F.value({sp:'leviathan',w:40})>F.value({sp:'minnow',w:.7}),'rarer fish are worth more');
assert.equal(F.buyRod(st,'oak').reason,'coins','no credit at the rod shop');
const sale=F.sellFish(st,cheap.id);
assert(sale.ok&&sale.coins>=1&&st.coins===sale.coins&&st.bag.length===2,'selling pays and removes the fish');
assert.equal(F.sellFish(st,cheap.id),null,'a fish can only be sold once');
st.coins=200;
assert(F.buyRod(st,'oak').ok,'buying a rod spends coins');
assert.equal(st.coins,50);assert.equal(st.rod,'oak','bought rod auto-equips');
assert.equal(F.buyRod(st,'oak').reason,'owned','rods cannot be bought twice');
assert(F.equipRod(st,'twig').ok&&st.rod==='twig');
assert.equal(F.equipRod(st,'mythril').reason,'unknown','cannot equip an unowned rod');
assert(F.buyBait(st,'worm',10).ok&&st.bait.worm===10&&st.coins===0,'bait buys in stacks');
assert.equal(F.buyBait(st,'worm',1).reason,'coins');
assert(F.selectBait(st,'worm').ok&&st.baitSel==='worm');
assert.equal(F.selectBait(st,'jelly').reason,'unknown','cannot select bait you do not own');
assert(F.selectBait(st,null).ok&&st.baitSel===null,'fishing without bait is allowed');
// Bulk sell keeps the heaviest of each species plus every mutated fish.
st=F.normalize(null);
F.addCatch(st,{sp:'minnow',rarity:'common',w:.2},1);
F.addCatch(st,{sp:'minnow',rarity:'common',w:.6},2);
F.addCatch(st,{sp:'minnow',rarity:'common',w:.3,mut:'golden'},3);
F.addCatch(st,{sp:'koi',rarity:'rare',w:5},4);
const bulk=F.sellBulk(st,'dupes');
assert.equal(bulk.sold,1,'only the light duplicate minnow sells');
assert(st.bag.some(e=>e.w===.6)&&st.bag.some(e=>e.mut==='golden')&&st.bag.some(e=>e.sp==='koi'));
assert(st.coins===bulk.coins&&bulk.coins>0);
const all=F.sellBulk(st,'all');
assert.equal(all.sold,3);assert.equal(st.bag.length,0,'sell-everything empties the bag');

// --- v294: keep-locks protect fish from every sale path -----------------------------------
st=F.normalize(null);
const lkA=F.addCatch(st,{sp:'minnow',rarity:'common',w:.2},1);
const lkB=F.addCatch(st,{sp:'minnow',rarity:'common',w:.6},2);
assert.equal(lkA.lock,false,'catches start unlocked');
assert.equal(F.toggleLock(st,'nope'),null,'cannot lock a fish you do not own');
assert.deepEqual(F.toggleLock(st,lkA.id),{ok:true,lock:true},'locking the light dupe');
assert.deepEqual(F.sellFish(st,lkA.id),{ok:false,reason:'locked'},'a locked fish cannot be sold');
assert.equal(st.bag.length,2,'the refused sale removed nothing');
assert.equal(F.sellBulk(st,'dupes').sold,0,'sell-dupes skips the locked dupe (heavy minnow is the keeper)');
assert.equal(F.sellBulk(st,'all').sold,1,'sell-everything still spares locked fish');
assert(st.bag.length===1&&st.bag[0].id===lkA.id,'only the locked fish survives');
assert.deepEqual(F.toggleLock(st,lkA.id),{ok:true,lock:false},'unlock works');
assert(F.sellFish(st,lkA.id).ok,'an unlocked fish sells normally');
assert.equal(F.normalize({bag:[{sp:'koi',w:3,lock:true},{sp:'koi',w:2}]}).bag.filter(e=>e.lock).length,1,'locks survive save/load normalization');

// --- v294: auto-sell applies the sell-dupes rule to each fresh catch ----------------------
st=F.normalize(null);
assert.equal(st.settings.autoSell,false,'auto-sell ships opt-in (off)');
const as1=F.addCatch(st,{sp:'minnow',rarity:'common',w:.6},1);
const as2=F.addCatch(st,{sp:'minnow',rarity:'common',w:.2},2);
assert.equal(F.shouldAutoSell(st,as2),false,'auto-sell never fires while the setting is off');
st.settings.autoSell=true;
assert.equal(F.shouldAutoSell(st,as2),true,'a lighter dupe auto-sells');
assert.equal(F.shouldAutoSell(st,as1),false,'the heaviest of a species is kept');
const as3=F.addCatch(st,{sp:'minnow',rarity:'common',w:.1,mut:'shiny'},3);
assert.equal(F.shouldAutoSell(st,as3),false,'mutated fish are never auto-sold');
const as4=F.addCatch(st,{sp:'koi',rarity:'rare',w:1},4);
assert.equal(F.shouldAutoSell(st,as4),false,'a new species is always kept');
F.toggleLock(st,as2.id);
assert.equal(F.shouldAutoSell(st,as2),false,'locked fish are never auto-sold');
F.toggleLock(st,as2.id);
assert.equal(F.normalize({settings:{autoSell:true}}).settings.autoSell,true,'the auto-sell setting persists');

// --- v294: painted fish art + movement lock exports ----------------------------------------
assert.equal(typeof F.fishSprite,'function');
assert.equal(typeof F.fishSpriteURL,'function');
assert.equal(F.fishSprite('minnow',null,64),null,'no canvas 2D here - painter degrades to null instead of throwing');
assert.equal(F.fishSpriteURL('minnow','golden',64),null,'sprite URLs degrade to null without canvas');
assert.equal(typeof F.busy,'function');
assert.equal(F.busy(),false,'not fishing yet - the plaza movement lock stays open');

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
// v288: every show-off line parses back so other clients can render the actual fish.
let parsed=F.parseShowOff(text);
assert(parsed&&parsed.sp==='koi'&&parsed.w===4.25&&parsed.mut==='shiny','show-off round-trips');
for(const mut of [null,...Object.keys(F.MUTATIONS)]){
 const st2=F.normalize(null),e2=F.addCatch(st2,{sp:'cobblewhale',rarity:'mythical',w:58.31,mut,perfect:true},5);
 const p2=F.parseShowOff(F.showOffText(st2,e2.id));
 assert(p2&&p2.sp==='cobblewhale'&&p2.w===58.31&&p2.mut===mut,'round-trip with mutation '+mut);
}
assert.equal(F.parseShowOff('shows off a Fake Fish — 3 kg (Rare)!'),null,'unknown species rejected');
assert.equal(F.parseShowOff('shows off a Royal Koi — 5000 kg (Rare)!'),null,'absurd weights rejected');
assert.equal(F.parseShowOff('hello everyone'),null);
assert.equal(F.parseShowOff(null),null);
// v290: onLocalMessage reports whether it displayed a fish - the caller suppresses the chat
// bubble only when it did (so the bubble never covers the fish, and normal chat is untouched).
assert.equal(F.onLocalMessage(1,'hello everyone'),false,'normal chat lines never claim the bubble');
assert.equal(F.onLocalMessage(1,'🎣 shows off a Royal Koi — 4.25 kg (Rare)!'),false,'without a bound scene nothing is shown, so the bubble stays');
// Heavier fish render bigger over the angler's head, within sane sprite bounds.
assert(F.showOffScale(58)>F.showOffScale(5)&&F.showOffScale(5)>F.showOffScale(.1),'scale grows with weight');
// v290: the biggest fish show BIG - a max-weight catch is taller than the angler (~3.2 units).
assert(F.showOffScale(60)>=4.5,'a 60 kg whale reads larger than the character');
assert(F.showOffScale(999)<=5.1&&F.showOffScale(.01)>=.5,'scale stays within sprite bounds');
while(st.bag.length<F.BAG_MAX)F.addCatch(st,{sp:'minnow',rarity:'common',w:.2});
assert.equal(F.addCatch(st,{sp:'minnow',rarity:'common',w:.2}),null,'full bag refuses new fish');
assert.equal(st.bag.length,F.BAG_MAX);

// --- v295: bag tiers, fishing titles, painted rods and data show-offs ---------------------
assert.deepEqual(F.BAG_TIERS.map(t=>t.cap),[120,200,300,400,500],'the bag ladder is 120→200→300→400→500');
// v296 (owner): cheap to start, rising gently - the first upgrade is affordable in a session.
assert.deepEqual(F.BAG_TIERS.map(t=>t.cost),[0,300,700,1500,3000],'each tier has its own price');
for(let i=2;i<F.BAG_TIERS.length;i++)assert(F.BAG_TIERS[i].cost>F.BAG_TIERS[i-1].cost,'prices rise with the ladder');
assert.equal(F.BAG_MAX,120,'BAG_MAX stays the base tier for older callers and saves');
st=F.normalize(null);
assert.equal(F.bagMax(st),120);assert.equal(F.bagTierOf(st).tier,0);assert.equal(F.nextBagTier(st).cap,200);
st.coins=100;assert.deepEqual(F.buyBagUpgrade(st),{ok:false,reason:'coins'},'an upgrade needs its Fishcoins');
st.coins=300;const up1=F.buyBagUpgrade(st);
assert(up1.ok&&up1.cap===200);assert.equal(st.coins,0,'an upgrade costs exactly its price');
assert.equal(F.bagMax(st),200,'the bought capacity is live');
st.coins=1e9;
assert.equal(F.buyBagUpgrade(st).cap,300);assert.equal(F.buyBagUpgrade(st).cap,400);assert.equal(F.buyBagUpgrade(st).cap,500);
assert.deepEqual(F.buyBagUpgrade(st),{ok:false,reason:'max'},'the ladder ends at 500 and never overflows');
// A bought bag really holds more fish, and a full one still refuses.
st=F.normalize({bagTier:4});assert.equal(F.bagMax(st),500);
for(let i=0;i<500;i++)F.addCatch(st,{sp:'minnow',rarity:'common',w:.2});
assert.equal(st.bag.length,500);assert.equal(F.addCatch(st,{sp:'minnow',rarity:'common',w:.2}),null,'a full 500 bag refuses new fish');
// The tier survives save/load, clamps to the ladder and rejects garbage.
assert.equal(F.normalize({bagTier:2}).bagTier,2);
assert.equal(F.normalize({bagTier:99}).bagTier,4,'an impossible tier clamps to the top of the ladder');
assert.equal(F.normalize({bagTier:-5}).bagTier,0);
assert.equal(F.normalize({bagTier:'x'}).bagTier,0);
assert.equal(F.normalize({bagTier:1,bag:Array.from({length:300},(_,i)=>({sp:'minnow',w:.2,id:'b'+i}))}).bag.length,200,'normalization keeps the fish the owned tier allows');
// Ten fishing titles, earned from the saved fishing blob and worn above the head.
assert.equal(F.FISHING_TITLES.length,10,'ten fishing titles');
assert.equal(new Set(F.FISHING_TITLES.map(t=>t.id)).size,10,'title ids are unique');
assert.equal(new Set(F.FISHING_TITLES.map(t=>t.name)).size,10,'title names are unique');
st=F.normalize(null);
for(const t of F.FISHING_TITLES){assert(t.name&&t.mark&&t.tone&&t.req,'each title has a name, mark, tone and requirement');assert(t.goal>0);assert(!F.titleUnlocked(st,t),'nothing is earned on a fresh save')}
assert.equal(F.equippedTitle(st),null);
assert.deepEqual(F.equipTitle(st,'dockhand'),{ok:false,reason:'locked'},'an unearned title cannot be worn');
assert.deepEqual(F.equipTitle(st,'nope'),{ok:false,reason:'unknown'});
st.stats.catches=10;assert(F.titleUnlocked(st,F.FISHING_TITLE_BY_ID.dockhand));
assert.deepEqual(F.equipTitle(st,'dockhand'),{ok:true,title:'dockhand'});
assert.equal(F.equippedTitle(st).name,'Dockhand','the earned title is the one worn');
assert(F.equipTitle(st,null).ok);assert.equal(F.equippedTitle(st),null,'a title can be taken off');
assert.equal(F.normalize({title:'dockhand'}).title,'dockhand','the worn title saves');
assert.equal(F.normalize({title:'not-a-title'}).title,null,'an unknown title is dropped');
st.stats.catches=0;st.title='dockhand';assert.equal(F.equippedTitle(st),null,'a title that is no longer earned never shows');
// Ladders that read the bestiary still work when it is empty.
assert.equal(F.bestWeight(F.normalize(null)),0);assert.equal(F.discoveredSpecies(F.normalize(null)),0);assert.equal(F.mutationKinds(F.normalize(null)),0);
// Show off travels as data now; the text form stays for old clients and chat history.
st=F.normalize(null);const so=F.addCatch(st,{sp:'koi',rarity:'rare',w:4.25,mut:'shiny',perfect:true});
assert.deepEqual(F.showOffData(st,so.id),{sp:'koi',w:4.25,mut:'shiny',perfect:true},'a show-off carries the fish as data');
assert.equal(F.showOffData(st,'nope'),null,'you cannot show off a fish you do not own');
assert.deepEqual(F.cleanShowOff({sp:'koi',w:'9999',mut:'evil'}),{sp:'koi',w:999,mut:null,perfect:false},'a relayed show-off is re-validated');
assert.equal(F.cleanShowOff({sp:'not-a-fish',w:3}),null);
assert.equal(F.cleanShowOff({sp:'koi',w:0}),null);
assert.equal(F.cleanShowOff(null),null);
// Rods are painted per tier, one colour each.
assert.deepEqual(Object.keys(F.ROD_TIER_COLORS).sort(),F.RODS.map(r=>r.id).sort(),'every rod has a tier colour');
assert.equal(new Set(Object.values(F.ROD_TIER_COLORS)).size,F.RODS.length,'no two tiers share a colour');
assert.equal(F.rodSprite('twig',64),null,'no canvas here - the rod painter degrades instead of throwing');
assert.equal(F.rodSpriteURL('mythril',64),null,'rod sprite URLs degrade to null without canvas');

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
 const seatClicks=[];
 const scene=await w.PGSocialScene.create(host,w.document.getElementById('labels'),{self:()=>1,menu(){},move(x,z){moves.push({x,z})},seat(id){seatClicks.push(id)},pond(x,z,idx){pondClicks.push({x,z,idx})}});
 scene.active=true;
 assert(scene.fishing,'the scene exposes a fishing rig');
 for(const fn of ['setFishVisible','cast','bite','reel','catchFly','escapeSplash','ripple','splash','hide','off','showFish'])assert.equal(typeof scene.fishing[fn],'function','fishing.'+fn);
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
 // v288: clicking a pond-side chair is a seat action (never a fishing or walk action).
 const chair=w.PGSocialRules.CHAIRS.find(ch=>ch.id===29); // east pond, north rim
 assert(chair,'chairs exist in the rules');
 scene.camera.updateMatrixWorld();
 const cpt=new T.Vector3(chair.x,.6,chair.z).project(scene.camera);
 const cev={clientX:(cpt.x+1)*500,clientY:(1-cpt.y)*350,pointerId:2,button:0,preventDefault(){}};
 const movesBefore=moves.length,pondBefore=pondClicks.length;
 host.onpointerdown(cev);host.onpointerup(cev);
 assert.equal(seatClicks.length,1,'a chair click reaches the seat callback');
 assert(seatClicks[0]>=24&&seatClicks[0]<=31,'chair seats use ids 24-31');
 assert.equal(moves.length,movesBefore,'a chair click never walks');
 assert.equal(pondClicks.length,pondBefore,'a chair click never casts');
 // v288: show-off renders the actual fish over the angler's head for ~5s, scaled by weight.
 scene.fishing.showFish(1,{text:'🐋',hue:210,scale:2.2,glow:'#ffd24d',ms:4000});
 frame(now+=100);frame(now+=100);
 for(let i=0;i<50;i++)frame(now+=100); // expires without error after ~5s
 scene.fishing.showFish(99,{text:'🐟',hue:0,scale:1}); // unknown player: ignored safely
 frame(now+=100);
 // v295: every other angler's line in the water is drawn, and a show-off carries its weight.
 for(const fn of ['setRig','clearRigs'])assert.equal(typeof scene.fishing[fn],'function','fishing.'+fn);
 scene.putPlayer({id:2,name:'Mate',x:pond.x-4,z:pond.z-pond.d/2-1.7,dir:0,sit:false,path:[],look:{cls:'Novice',appearance:{version:1,sex:'m'}}});
 frame(now+=100);
 scene.fishing.setRig(2,{on:true,pond:1,x:pond.x-3,z:pond.z,mode:'wait'});
 frame(now+=100);frame(now+=100);
 scene.fishing.setRig(2,{on:true,pond:1,x:pond.x-3,z:pond.z,mode:'bite'});
 frame(now+=100);
 scene.fishing.setRig(2,{on:false});
 frame(now+=100);
 // A show-off with a weight label draws and expires without error.
 scene.fishing.showFish(1,{spId:'koi',mut:'shiny',scale:2,label:'4.25 kg',glow:'#ffd24d',ms:1200});
 for(let i=0;i<20;i++)frame(now+=100);
 // v296: the fishing title is its own line, so wearing one never hides the Hunt title.
 scene.putPlayer({id:3,name:'Titled',x:pond.x+2,z:pond.z-pond.d/2-1.7,dir:0,sit:false,path:[],look:{cls:'Novice',appearance:{version:1,sex:'m'},title:'Dungeon Reaper',fishTitle:'🎣 Heavy Hook'}});
 frame(now+=100);
 const titleEl=w.document.querySelector('.social-player-title:not([hidden])'),fishEl=w.document.querySelector('.social-player-fish-title:not([hidden])');
 assert(titleEl&&titleEl.textContent==='Dungeon Reaper','the Hunt title keeps its own line');
 assert(fishEl&&fishEl.textContent==='🎣 Heavy Hook','the fishing title gets a second line');
 // A player who leaves takes their bobber with them.
 scene.fishing.setRig(2,{on:true,pond:1,x:pond.x,z:pond.z,mode:'wait'});
 frame(now+=100);
 scene.removePlayer(2);
 frame(now+=100);
 scene.fishing.setRig(2,{on:false});
 frame(now+=100);
 dom.window.close();
 // --- Part C: the real Fishing window in a DOM - tabs, titles and the bag upgrade ----------
 const dom2=new JSDOM('<div id="socialHub"></div>',{runScripts:'outside-only'}),w2=dom2.window;
 w2.eval(fs.readFileSync(path.join(__dirname,'..','..','assets','social-rules.js'),'utf8'));
 w2.eval(fs.readFileSync(path.join(__dirname,'..','..','assets','social-fishing.js'),'utf8'));
 w2.HTMLCanvasElement.prototype.getContext=()=>null; // no canvas package here: prove the emoji fallback
 const FISH=w2.PGSocialFishing,hostS={fishing:null},d2=w2.document;
 let saves=0;
 FISH.bind({host:()=>hostS,scene:()=>null,self:()=>null,moveTo:()=>{},notice:()=>{},save:()=>{saves++}});
 assert.equal(d2.getElementById('socialHub').querySelector('#fishingDock')!==null,true,'the module builds its dock into the hub');
 FISH.openBag();
 assert.equal(d2.getElementById('fishingPanel').hidden,false,'the bag window opens');
 // v295: the Pond fish toggle is gone - the ponds always hold fish.
 assert.equal(d2.getElementById('fishingShowFish'),null,'there is no Pond fish toggle any more');
 // The Titles tab lists exactly the ten fishing titles, with progress for the locked ones.
 FISH.openTitles();
 const titleRows=d2.querySelectorAll('.fishing-title-row');
 assert.equal(titleRows.length,10,'the Titles tab lists all ten fishing titles');
 assert(/Dockhand/.test(d2.getElementById('fishingTitlesView').textContent),'titles are named');
 assert.equal(d2.querySelectorAll('.fishing-title-row.locked').length,10,'nothing is earned on a fresh save');
 // Earning one and wearing it from the tab goes through the same save hook as the rest.
 hostS.fishing.stats.catches=10;FISH.openTitles();
 const wearBtn=d2.querySelector('button[data-title="dockhand"]');
 assert(wearBtn&&!wearBtn.disabled,'an earned title offers a Wear button');
 wearBtn.onclick();
 assert.equal(hostS.fishing.title,'dockhand','wearing a title from the tab equips it');
 assert(saves>0,'wearing a title saves');
 assert(d2.querySelector('.fishing-title-row.worn'),'the worn title is marked');
 // The Shop tab sells the next bag tier, and buying it raises the cap.
 d2.getElementById('fishingGearLine').onclick();
 assert.equal(d2.getElementById('fishingShopView').hidden,false,'the gear line opens the Shop');
 assert(/Canvas Satchel/.test(d2.getElementById('fishingShopView').textContent),'the shop shows the owned bag tier');
 const buyBtn=d2.querySelector('#fishingShopView button[data-bagup]');
 assert(buyBtn,'the shop offers the next bag tier');
 assert.equal(buyBtn.disabled,true,'it cannot be bought without the Fishcoins');
 hostS.fishing.coins=300;FISH.openBag();d2.getElementById('fishingGearLine').onclick();
 const buy2=d2.querySelector('#fishingShopView button[data-bagup]');
 assert.equal(buy2.disabled,false,'it becomes affordable');
 buy2.onclick();
 assert.equal(hostS.fishing.bagTier,1,'buying the tier raises the bag');
 assert.equal(FISH.bagMax(hostS.fishing),200);
 assert.equal(hostS.fishing.coins,0,'the tier is paid for once');
 assert(/Reinforced Creel/.test(d2.getElementById('fishingShopView').textContent),'the shop reflects the new tier');
 // --- Part C2: Auto fishing survives being moved (the AFK spawn teleport) -----------------
 let frame2=null,clock2=1000,moved=null;
 w2.requestAnimationFrame=cb=>{frame2=cb};
 w2.cancelAnimationFrame=()=>{frame2=null};
 w2.performance.now=()=>clock2;
 const pondA=w2.PGSocialRules.PONDS[0],rimA={x:pondA.x,z:pondA.z-pondA.d/2-1.7},me={...rimA};
 FISH.bind({host:()=>hostS,scene:()=>null,self:()=>({x:me.x,z:me.z}),moveTo:(x,z)=>{moved={x,z}},notice:()=>{},save:()=>{}});
 FISH.toggle();
 assert.equal(FISH.phase,'ready','standing on the rim starts a session ready to cast');
 d2.getElementById('fishingAutoBtn').onclick();
 assert.equal(FISH.auto,true,'Auto is on');
 // The server respawns the angler at the plaza entrance: ~30 units from the pond.
 me.x=0;me.z=12;
 frame2(clock2+=100);
 assert(moved,'Auto walks back to the pond instead of cancelling the session');
 assert.equal(FISH.phase,'walking','the session is in its walk-back phase');
 assert(Math.hypot(moved.x-pondA.x,moved.z-pondA.z)<12,'the walk targets the pond, not the spawn');
 // Reaching the rim resumes fishing.
 me.x=rimA.x;me.z=rimA.z;
 frame2(clock2+=100);
 assert.equal(FISH.phase,'ready','Auto fishing carries on after the walk back');
 // A manual session still stops with the v294 message, exactly as before.
 d2.getElementById('fishingAutoBtn').onclick();
 assert.equal(FISH.auto,false,'Auto is off');
 me.x=0;me.z=12;
 frame2(clock2+=100);
 assert.equal(FISH.phase,'off','without Auto, walking away still ends the session');
 me.x=rimA.x;me.z=rimA.z;
 dom2.window.close();
 // --- Part D: the page wires v295 up (save shape, cache versions, build tag) ---------------
 const page=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
 assert(page.includes('baitSel:null,bagTier:0,title:null'),'a fresh save carries the bag tier and the fishing title');
 assert(/const fishBagTiers=\[120,200,300,400,500\]/.test(page),'the page sanitizer knows the bag ladder');
 assert(/f\.fishing\.bagTier=Math\.max\(0,Math\.min\(fishBagTiers\.length-1/.test(page),'the saved bag tier is clamped');
 assert(/\.slice\(-fishBagCap\)/.test(page),'the bag is sliced to the tier the player owns');
 assert(/const fishTitleIds=\['dockhand'/.test(page),'the page sanitizer whitelists the fishing titles');
 for(const t of F.FISHING_TITLES)assert(page.includes("'"+t.id+"'"),'index.html knows the title '+t.id);
 assert(/f\.fishing\.settings=\{fish:true,/.test(page),'pond fish are forced on in the page sanitizer');
 for(const asset of ['assets/social-fishing.js','assets/social-scene.js','assets/social.js','assets/social-fishing.css'])
  assert(page.includes(asset+'?v=296'),asset+' is versioned at v296');
 assert(/haven-v296/.test(page),'the login card names the v296 build');
 console.log('PASS social fishing: ponds+chairs, 70-fish catalog with rates, luck/weight/mutation gear math, Fishcoin economy, reel physics, bag bounds, show-off round-trip and scene rig; v295 bag tiers 120→500, ten fishing titles, painted rods, public rigs and the Fishing window tabs; v296 rod height follows the character, two-line titles, cheaper bag ladder, scrollable Titles tab and Auto walk-back');
})().catch(e=>{console.error(e);process.exitCode=1});
