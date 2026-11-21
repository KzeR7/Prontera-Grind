// v287 plaza fishing: pond placement on the south lawns, shared walkability, the catch
// catalog, cast rating, the hold/release reel physics, bag/bestiary persistence bounds,
// and show-off coming only from fish the player actually owns. Part B drives the real
// scene renderer to prove ponds route clicks to fishing instead of walking into water.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=require(path.join(__dirname,'..','..','assets','social-rules.js'));
const F=require(path.join(__dirname,'..','..','assets','social-fishing.js'));

// --- Enlarged west lake, southern cascade and traversable bridge ------------------------------
assert.equal(R.PONDS.length,1,'the old east pond was merged into the west lake');
const lake=R.PONDS[0],props=R.POND_PROPS[0],bridge=props.bridge;
assert.equal(lake.w,38);assert.equal(lake.d,60);assert(lake.d>lake.w,'lake is longer north–south');
assert(lake.x+lake.w/2<-9,'lake clears the central avenue');
assert(!R.walkable(lake.x,lake.z-5),'water away from the deck is blocked');
assert(R.walkable(bridge.x,bridge.z),'bridge deck is walkable');
assert(props.falls.z>lake.z&&props.falls.dir===-1&&props.falls.intoPond,'south fall enters lake');
assert(R.cragBlocked(props.crag.x,props.crag.z)&&!R.walkable(props.crag.x,props.crag.z),'cascade heap is solid');
assert(props.stands.some(s=>s.name==='bridge'),'the bridge crown remains a fishing stand');
assert.equal(props.ledge,undefined,'the old stone shelf stays removed');
for(const stand of props.stands){assert(R.walkable(stand.x,stand.z));const route=R.path({x:0,z:12},stand);assert(route.length&&route.every(q=>R.walkable(q.x,q.z)),'fishing stand is reachable')}
for(const chair of R.CHAIRS){assert(R.walkable(chair.x,chair.z));assert(R.path({x:0,z:12},chair).length,'each relocated chair is reachable')}
// v361: the Aetherwell's solid heart (basin + planter) reaches 7.75; the promenade opens beyond it.
for(let n=-30;n<=30;n++)if(Math.abs(n)>7){assert(R.walkable(0,n),'promenade clear');assert(R.walkable(n,0),'avenue clear')}

// --- v309: bait icons are painted, not emoji -------------------------------------------------
// The owner's shop screenshot showed a blank box where the worm and the grub were: those glyphs are
// Unicode 13 and fall back to tofu on Windows 10 / older Android. The painter is checked with a
// recording 2D context (no canvas package here) so every bait must produce real PNG art.
{
 const {JSDOM}=require('jsdom');
 const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;
 const calls=[];
 const g=new Proxy({},{get(_,k){
  if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});
  if(k==='canvas')return null;
  return (...a)=>{calls.push([k,...a])};
 },set(){return true}});
 w.HTMLCanvasElement.prototype.getContext=()=>g;
 w.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,AAAA';
 w.eval(fs.readFileSync(path.join(__dirname,'..','..','assets','digimon','roster.js'),'utf8'));w.eval(fs.readFileSync(path.join(__dirname,'..','..','assets','social-rules.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(__dirname,'..','..','assets','social-fishing.js'),'utf8'));
 const FB=w.PGSocialFishing;
 assert.equal(FB.BAITS.length,5,'five baits in the shop');
 for(const b of FB.BAITS){
  const url=FB.baitSpriteURL(b.id,64);
  assert(typeof url==='string'&&url.startsWith('data:image/png'),b.name+' paints a real icon instead of an emoji glyph');
  assert(FB.baitHTML(b,40).includes('<img class="fishing-bait-art"'),b.name+' renders that icon as an image');
  assert(!FB.baitHTML(b,40).includes(b.icon),b.name+' no longer renders its emoji');
 }
 assert(calls.some(c=>c[0]==='quadraticCurveTo')&&calls.some(c=>c[0]==='arc'),'the icons are drawn with curves, not text');
 // v310: title medals are painted too - one per rarity tier, all the same size, no glyph fallbacks
 for(const id of ['common','uncommon','rare','legendary','mythical','secret']){
  const url=FB.titleBadgeURL(id,64);
  assert(typeof url==='string'&&url.startsWith('data:image/png'),'the '+id+' title medal is painted');
 }
 assert.equal(FB.titleBadgeURL('common',64),FB.titleBadgeURL('common',64),'medals are cached per tier');
 assert.equal(typeof FB.titleBadgeURL('not-a-tier',64),'string','an unknown tier falls back to a common medal');
 dom.window.close();
}

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
// v302 (owner): the index holds every creature from the art drop, and the original ids survive.
assert.equal(F.SPECIES.length,165,'165 fish species (155 + 10 MVP)');
// v304: the shark line moved up a tier (Greatmaw and the Voidfin are secrets now), so the secret
// pool is ten and Secret Circle follows it - it is derived, never hardcoded.
 assert.equal(F.SPECIES.filter(sp=>sp.rarity==='secret').length,10,'the secret pool is ten species');
 assert.equal(F.FISHING_TITLE_BY_ID['secret-circle'].goal,F.SPECIES.filter(sp=>sp.rarity==='secret').length,'Secret Circle wants the whole secret pool');
assert.equal(new Set(F.SPECIES.map(sp=>sp.id)).size,F.SPECIES.length,'no duplicate species ids in the index');
assert.equal(F.SPECIES.filter(sp=>sp.rarity==='mvp').length,10,'ten MVP species, the owner\'s v407 art drop');
assert.equal(F.MVP_REEL_CATCH_CHANCE,.30,'a hooked MVP has an exact 30% reel-catch chance');
assert(F.DIFF.mvp,'mvp difficulty exists');
// v297: every species is either a glyph body or one of the named body plans the renderer paints.
const SHAPES=new Set(['fish','tropical','puffer','shark','whale','shrimp','lobster','crab','squid','octopus','tadpole','gar','eel','hammer','saw','ray','sunfish','thresher','goblin','sturgeon','angler','deep']);
for(const sp of F.SPECIES)if(sp.shape)assert(SHAPES.has(sp.shape),'species '+sp.id+' has a body plan the renderer knows');
// v297: shapes are what stop the index from being 100 recolours - at least ten families, each
// with more than one member or a glyph fallback, and no single body plan dominating the catalog.
const shapeCounts={};
for(const sp of F.SPECIES){const k=sp.shape||('glyph:'+sp.glyph);shapeCounts[k]=(shapeCounts[k]||0)+1}
assert(Object.keys(shapeCounts).length>=12,'the catalog uses at least twelve distinct body plans');
for(const k of ['hammer','thresher','goblin','saw','ray','sunfish','eel','sturgeon','angler','gar','deep'])assert(shapeCounts[k]>=2,'the '+k+' body plan is used by more than one species');
const plainSpecies=F.SPECIES.filter(sp=>sp.shape?sp.shape==='fish'||sp.shape==='tropical':sp.glyph==='🐟'||sp.glyph==='🐠').length;
// v302: scale the bar with the catalog instead of a fixed 50 - the assertion is that the plain
// fish body stays under half of it, not that the index can never grow past 100 entries.
assert(plainSpecies<F.SPECIES.length/2,'fewer than half the catalog is the plain fish body (got '+plainSpecies+' of '+F.SPECIES.length+')');
assert(plainSpecies<F.SPECIES.length-40,'at least forty species use a named body plan');
// v297: weight scales up to a pond-sized giant and the mega flag marks the announced fish.
assert.equal(F.MAX_W,3000,'the heaviest species is a 3 t MVP (Stormcoil Leviathan)');
const mega=F.SPECIES.filter(sp=>sp.mega);
assert.equal(mega.length,10,'ten species are pond-monster scale');
for(const sp of mega)assert(sp.max>=100,'a mega species is heavy: '+sp.id);
assert(mega.some(sp=>sp.id==='whaleshark'),'the whale shark is one of the giants');
// v297: the three heaviest fish in the game are secret-rarity giants, which is why a secret catch
// is announced in Local chat whatever its weight.
// v304: MVP now holds the top slots (1k-3k), so the three heaviest are MVP.
const heaviest=F.SPECIES.slice().sort((a,b)=>b.max-a.max).slice(0,3);
assert(heaviest.every(sp=>sp.rarity==='mvp'),'the three heaviest species are MVP rarities');
assert(['mvp','secret','mythical'].includes(F.SPECIES.slice().sort((a,b)=>b.max-a.max)[7].rarity),'the next heaviest is still a boss-tier fish');
assert(F.SPECIES.filter(sp=>sp.rarity==='secret').length>=4,'the secret pool still has its own fish');
// v398 (owner: "still 2 fishes in index that does show the 1000kg changes"): EVERY mythical and
// secret fish weighs 1-1000 kg. This is asserted on the FINAL rarity, not the one written in the
// table row, because RARITY_OVERRIDE promotes sharks - the first pass fixed only the rows whose text
// said 'mythical' and left five promoted sharks (thresher, goblin, tigershark, sunshark, abysssaw)
// at their old weights, which is exactly what the owner saw in the Index.
const bossTier=F.SPECIES.filter(sp=>sp.rarity==='mythical'||sp.rarity==='secret');
const wrongWeight=bossTier.filter(sp=>sp.min!==1||sp.max!==1000);
assert.equal(wrongWeight.length,0,'every mythical/secret fish weighs 1-1000 kg: '+wrongWeight.map(sp=>sp.id+' '+sp.min+'-'+sp.max).join(', '));
assert(bossTier.length>=30,'the boss tiers are all present after the override: '+bossTier.length);
assert(F.showOffScale(3000)>=12.9,'the biggest MVP shows off at pond scale');
assert(F.showOffScale(3000)>F.showOffScale(300)&&F.showOffScale(300)>F.showOffScale(60),'show-off size keeps climbing into the giants');
const legacy={minnow:'common',carp:'common',smelt:'common',goby:'common',bream:'uncommon',perch:'uncommon',trout:'uncommon',koi:'rare',pike:'rare',tetra:'rare',fountainfish:'legendary',arowana:'legendary',leviathan:'mythical',poring:'secret'};
for(const [id,rar] of Object.entries(legacy))assert.equal(F.speciesById(id)?.rarity,rar,'v287 species '+id+' is unchanged');
// Displayed catch rates: each rarity's weight split across its pool; all 100 sum to 1.
// MVP is server-spawned (weight 0) so its catch rate is 0 and is excluded from the random roll math.
let rateSum=0;
for(const sp of F.SPECIES.filter(sp=>sp.rarity!=='mvp')){const r=F.rate(sp.id);assert(r>0&&r<1);rateSum+=r}
assert(Math.abs(rateSum-1)<1e-9,'catch rates sum to 100%');
assert(F.rate('minnow')>F.rate('poring'),'commons are more likely than secrets');
// v288: seven mutation kinds, each with a visual + value multiplier.
assert.equal(Object.keys(F.MUTATIONS).length,7);
for(const m of Object.values(F.MUTATIONS)){assert(m.chance>0&&m.chance<.2);assert(m.mult>1);assert(m.label&&m.badge&&m.glow)}
assert(F.MUTATIONS.prismatic.mult>F.MUTATIONS.shiny.mult,'rarer mutations are worth more');

// --- rolling ------------------------------------------------------------------------------
const seq=values=>{let i=0;return ()=>values[Math.min(i++,values.length-1)]};
// v304: the secret band is the last 0.014% now, so a top-of-the-table roll has to be near 1.
let c=F.rollCatch(seq([.99999,.0,.5,.99]));
assert.equal(c.rarity,'secret','top of the table is the secret rarity');
c=F.rollCatch(seq([.0,.0,.5,.99]));
assert.equal(c.rarity,'common');
// A PERFECT cast rolls twice and keeps the better one - never worse.
c=F.rollCatch(seq([.0,.99999,.0,.5,.99]),true);
assert.equal(c.rarity,'secret','boost upgrades a bad roll');
c=F.rollCatch(seq([.99999,.0,.0,.5,.99]),true);
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
// --- v304/v305: soft rod gates, a fully random catch and gear-aware Index odds -------------------
// Every rod raises the ceiling, but the ceiling is a filter, not a wall: over-ceiling rolls slip
// through GATE_ESCAPE of the time.
assert.equal(F.rodCeiling('twig'),'uncommon','the training rod tops out at uncommon');
assert.equal(F.rodCeiling('oak'),'rare');
assert.equal(F.rodCeiling('brass'),'rare','brass shares the rare ceiling with oak');
assert.equal(F.rodCeiling('silver'),'legendary');
assert.equal(F.rodCeiling('golden'),'mythical');
assert.equal(F.rodCeiling('mythril'),'mvp','the mythril rod reaches the MVP tier');
assert.equal(F.gateRodFor('mvp'),'mythril');
assert.equal(F.gateRodFor('secret'),'mythril');
assert(F.GATE_ESCAPE>0&&F.GATE_ESCAPE<.2,'the ceiling leaks a little, not a lot');
// A cheap rod can hook the top tiers - rarely. On the training rod a rare is a few casts in a
// hundred, a legendary is a once-a-thousand event and a secret is barely possible at all.
const shareOf=(rod,tier,n)=>{let rng=lcg(19),hit=0;for(let i=0;i<n;i++)if(F.rollCatch(rng,false,{rod,luck:0}).rarity===tier)hit++;return hit/n};
const twigRare=shareOf('twig','rare',60000),twigSecret=shareOf('twig','secret',60000);
assert(twigRare>0,'a training rod still lands the odd rare');
assert(twigRare<.02,'but rarely');
assert(twigSecret>=0&&twigSecret<.0004,'a secret on a training rod is a lottery ticket');
// The gate really is the rod: the same cast on the rod that unlocks the tier is far more likely.
assert(F.tierShares(0,'mythril').secret>F.tierShares(0,'twig').secret*20,'the mythril rod is a different league');
// And the leak thins with distance: one tier above the ceiling leaks 8%, four tiers leaks a sliver.
assert(Math.abs(F.tierShares(0,'twig').rare/F.tierShares(0,null).rare-F.GATE_ESCAPE)<1e-9,'one tier up leaks exactly GATE_ESCAPE');
assert(F.tierShares(0,'twig').secret<F.tierShares(0,'golden').secret,'a secret is easier on a golden rod than a training rod');
// Every species is a plain uniform draw - there is no repeat protection anywhere.
const secretPool=F.SPECIES.filter(sp=>sp.rarity==='secret');
assert.equal(secretPool.length,10,'ten secrets in the pool');
const rolled=new Set();
let calls=0;
const topThenRandom=()=>{calls++;return calls===1?.999999:Math.random()};
for(let i=0;i<400;i++){calls=0;const c=F.rollCatch(topThenRandom,false,{rod:'mythril'});if(c.rarity==='secret')rolled.add(c.sp)}
assert(rolled.size>1,'a forced secret tier still draws any secret, not the next missing one');
const seenField=F.rollCatch(()=>.999999,false,{rod:'mythril',seen:new Set(secretPool.slice(1).map(sp=>sp.id))});
assert.equal(seenField.rarity,'secret','an old caller that still passes seen is ignored, not broken');
// Tier shares mirror rollCatch: they sum to 1, they climb with luck, and above the ceiling they
// shrink to the escape chance instead of disappearing.
const sumShares=luck=>Object.values(F.tierShares(luck,'secret')).reduce((a,b)=>a+b,0);
assert(Math.abs(sumShares(0)-1)<1e-9&&Math.abs(sumShares(2.6)-1)<1e-9,'tier shares always total 1');
assert(F.tierShares(2.6,'secret').secret>F.tierShares(0,'secret').secret,'luck lifts the secret share');
const capped=F.tierShares(2.6,'oak'),natural=F.tierShares(2.6,null);
assert(capped.legendary>0&&capped.legendary<natural.legendary,'above the ceiling a tier becomes a trickle');
assert(Math.abs(capped.legendary/natural.legendary-F.GATE_ESCAPE)<1e-9,'and that trickle is the escape chance');
assert(capped.rare>natural.rare,'the rest piles into the ceiling tier');
// The Index prints the gear-aware rate: a bare secret is 1 in ~19,000 casts, a hooked one is not.
const bareSecret=F.rateWith('voidfin',0,'secret'),gearedSecret=F.rateWith('voidfin',2.6,'secret');
assert(gearedSecret>bareSecret*3,'the rod and bait rate is far better than the bare-rod rate');
assert(Math.abs(F.rateWith('voidfin',2.6,'secret')-F.tierShares(2.6,'secret').secret/secretPool.length)<1e-12,'secret rows show a per-species rate');
assert(F.rateWith('minnow',2.6,'secret')<F.rateWith('minnow',0,'secret'),'a common is rarer once luck tilts away from it');
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

// v384 owner choice: Auto must remain bad at an MVP reel, but not functionally impossible. A
// successful reel still faces the exact 30% landing roll above. Drive the real reel state and the
// same exported predictive target as tick(); with a seeded sample that produces about 1% landed on
// the free Training Rod and about 5% on Mythril. Manual fishing does not call this controller.
{
 const seeded=seed=>{let x=seed|0;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296}};
 const boss=F.speciesById('mvp_stormcoil'),N=1500,landed=[];
 for(let ri=0;ri<F.RODS.length;ri++){
  const random=seeded((ri+1)*0x12345),rod=F.RODS[ri];let reels=0;
  for(let n=0;n<N;n++){
   const fish={sp:boss.id,rarity:'mvp',w:boss.min+(boss.max-boss.min)*random()};
   const reel=F.makeReel(fish,random,rod.control);let target=.5,result=null,sampleAt=0,t=0;
   for(let step=0;step<10000&&!result;step++){
    t+=16;if(t>=sampleAt){sampleAt=t+F.AUTO_REEL_SAMPLE_MS;target=F.autoReelTarget(reel)}
    result=F.reelStep(reel,.016,reel.bar<target);
   }
   if(result==='catch')reels++;
  }
  landed.push(reels/N*F.MVP_REEL_CATCH_CHANCE);
 }
 assert(landed[0]>=.005&&landed[0]<=.016,'Training Rod lands about 1% of hooked MVPs on Auto ('+(landed[0]*100).toFixed(2)+'%)');
 assert(landed.at(-1)>=.035&&landed.at(-1)<=.065,'Mythril lands about 5% of hooked MVPs on Auto ('+(landed.at(-1)*100).toFixed(2)+'%)');
 for(let i=1;i<landed.length;i++)assert(landed[i]>=landed[i-1],'each rod keeps or improves the Auto MVP landing chance');
}

// Leviathan Chum (10k Fishcoin bait): +10% MVP hook rate, bar bonus giving ~11.8% auto reel on Twig,
// ~25% auto reel on Mythril, keeping flat 30% landing roll for all rods.
{
 const seeded=seed=>{let x=seed|0;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296}};
 const boss=F.speciesById('mvp_stormcoil'),N=1500,landedChum=[];
 const chumBait=F.BAITS.find(b=>b.id==='chum');
 assert.ok(chumBait,'Leviathan Chum is present in BAITS');
 assert.equal(chumBait.cost,10000,'Leviathan Chum costs 10k Fishcoins');
 for(let ri=0;ri<F.RODS.length;ri++){
  const random=seeded((ri+1)*0x12345),rod=F.RODS[ri];let reels=0;
  for(let n=0;n<N;n++){
   const fish={sp:boss.id,rarity:'mvp',w:boss.min+(boss.max-boss.min)*random()};
   const reel=F.makeReel(fish,random,rod.control,chumBait.mvpBarBonus);let target=.5,result=null,sampleAt=0,t=0;
   for(let step=0;step<10000&&!result;step++){
    t+=16;if(t>=sampleAt){sampleAt=t+F.AUTO_REEL_SAMPLE_MS;target=F.autoReelTarget(reel)}
    result=F.reelStep(reel,.016,reel.bar<target);
   }
   if(result==='catch')reels++;
  }
  landedChum.push(reels/N*F.MVP_REEL_CATCH_CHANCE);
 }
 const twigReelWin=landedChum[0]/F.MVP_REEL_CATCH_CHANCE;
 const mythrilReelWin=landedChum.at(-1)/F.MVP_REEL_CATCH_CHANCE;
 assert(twigReelWin>=.10&&twigReelWin<=.14,'Twig Rod with Leviathan Chum has ~11.8% auto reel win rate ('+(twigReelWin*100).toFixed(1)+'%)');
 assert(mythrilReelWin>=.22&&mythrilReelWin<=.28,'Mythril Rod with Leviathan Chum has ~25% auto reel win rate ('+(mythrilReelWin*100).toFixed(1)+'%)');

 // Mythril Rod Lucky Focus proc check: ~20-25% proc chance on MVP hooks widening the bar,
 // while starter rods never proc.
 {
  const mythril=F.RODS.find(r=>r.id==='mythril'),twig=F.RODS.find(r=>r.id==='twig');
  let mythFocus=0,twigFocus=0;
  const rng=seeded(12345);
  for(let i=0;i<1000;i++){
   const fish={sp:boss.id,rarity:'mvp',w:boss.min};
   const rM=F.makeReel(fish,rng,mythril.control);
   if(rM.luckyFocus)mythFocus++;
   const rT=F.makeReel(fish,rng,twig.control);
   if(rT.luckyFocus)twigFocus++;
  }
  assert.equal(twigFocus,0,'Training rod never triggers Lucky Focus');
  assert(mythFocus>=180&&mythFocus<=260,'Mythril rod triggers Lucky Focus ~20-25% of the time ('+mythFocus+'/1000)');
 }
}

// --- persistence bounds -------------------------------------------------------------------
let st=F.normalize(null);
assert.deepEqual(st.bag,[]);
assert.equal(st.stats.catches,0);
assert.equal(st.settings.fish,true);
st=F.normalize({bag:[{sp:'nope',w:3},{sp:'koi',w:'9999',mut:'evil',at:-5,id:'a'},{sp:'koi',w:2,id:'a'}],dex:{koi:{n:'7',bw:4.2,mut:['shiny','evil','shiny']},ghost:{n:3}},stats:{casts:-3,catches:1e12},settings:{fish:false,sound:'yes'}});
assert.equal(st.bag.length,2,'unknown species dropped');
assert.equal(st.bag[0].w,3000,'weights clamp to MVP 3t');
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
// v385 player report: storage capacity must never prevent a landed Secret from unlocking its Index row.
{const secret=F.SPECIES.find(sp=>sp.rarity==='secret');const kept=F.addCatch(st,{sp:secret.id,rarity:'secret',w:secret.min},Date.now());assert.equal(kept,null,'a full bag still cannot store another fish');assert.equal(st.dex[secret.id].n,1,'but the landed Secret is recorded in the Index');assert.equal(st.stats.catches,1,'and counts as a catch even though it was released')}

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
// v303 (owner): a heavy fish must not be cheap just because its rarity is low.
assert(F.value({sp:'nurseshark',w:40})>=40,'40 kg of common shark is worth real coins, not pocket change');
assert(F.value({sp:'nurseshark',w:40})>F.value({sp:'bamboo',w:4}),'at the top of its weight a low-tier shark beats a light fish of the next tier');
assert(F.value({sp:'starwhale',w:900})>F.value({sp:'starwhale',w:420}),'the same species pays more at its top weight');
assert(F.value({sp:'tigershark',w:200,'mut':undefined})>F.value({sp:'minnow',w:.7}),'a legendary giant is a prize');
assert.equal(F.buyRod(st,'oak').reason,'coins','no credit at the rod shop');
const sale=F.sellFish(st,cheap.id);
assert(sale.ok&&sale.coins>=1&&st.coins===sale.coins&&st.bag.length===2,'selling pays and removes the fish');
assert.equal(F.sellFish(st,cheap.id),null,'a fish can only be sold once');
// v304: the ladder is priced against the rebalanced catch values, so the test funds the purchase
// from the shipped price instead of assuming the old number.
st.coins=F.RODS.find(r=>r.id==='oak').cost+100;
assert(F.buyRod(st,'oak').ok,'buying a rod spends coins');
assert.equal(st.coins,100);assert.equal(st.rod,'oak','bought rod auto-equips');
assert.equal(F.buyRod(st,'oak').reason,'owned','rods cannot be bought twice');
assert(F.equipRod(st,'twig').ok&&st.rod==='twig');
assert.equal(F.equipRod(st,'mythril').reason,'unknown','cannot equip an unowned rod');
assert(F.buyBait(st,'worm',10).ok&&st.bait.worm===10&&st.coins===100-10*F.BAITS.find(b=>b.id==='worm').cost,'bait buys in stacks');
st.coins=20000;
assert(F.buyBait(st,'chum',2).ok&&st.bait.chum===2&&st.coins===0,'Leviathan Chum buys in stacks for 10k coins each');
st.coins=2;assert.equal(F.buyBait(st,'worm',1).reason,'coins');st.coins=60;
assert(F.selectBait(st,'worm').ok&&st.baitSel==='worm');
assert(F.selectBait(st,'chum').ok&&st.baitSel==='chum');
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
// v311 (owner: "a 922 kg fish looks small next to the pond - the max is 1000 kg, it should be as
// big as the pond"). The ladder is pinned to the pond: 1,000 kg is 13 units across a 13 x 18 pond,
// 922 kg reads 12.46, and nothing ever exceeds the scene's 13.2 clamp.
assert(F.showOffScale(60)>=2*F.showOffScale(5),'a 60 kg whale reads much larger than a 5 kg fish');
assert.equal(F.showOffScale(3000),13,'the 3 t MVP ceiling is the width of the pond');
assert(F.showOffScale(922)>=7,'a 922 kg fish reads large');
assert.equal(F.showOffScale(5000),13,'anything heavier than the cap stays at the cap');
assert(F.showOffScale(400)>F.showOffScale(200)&&F.showOffScale(200)>F.showOffScale(100),'the ladder never flattens at the top');
assert(F.showOffScale(1)>=.8&&F.showOffScale(.01)>=.4,'small fish stay small');
assert(F.showOffScale(2999)<=13.2,'scale stays inside the scene clamp');
while(st.bag.length<F.BAG_MAX)F.addCatch(st,{sp:'minnow',rarity:'common',w:.2});
assert.equal(F.addCatch(st,{sp:'minnow',rarity:'common',w:.2}),null,'full bag refuses new fish');
assert.equal(st.bag.length,F.BAG_MAX);

// --- v295: bag tiers, fishing titles, painted rods and data show-offs ---------------------
assert.deepEqual(F.BAG_TIERS.map(t=>t.cap),[120,200,300,400,500,750,1000],'the bag ladder is 120→1000');
// v305 (owner): the bags are a small buff, not a farm - the ladder starts at 600.
assert.deepEqual(F.BAG_TIERS.map(t=>t.cost),[0,900,2100,4500,9750,15200,24000],'each tier has its own price');
for(let i=2;i<F.BAG_TIERS.length;i++)assert(F.BAG_TIERS[i].cost>F.BAG_TIERS[i-1].cost,'prices rise with the ladder');
assert.equal(F.BAG_MAX,120,'BAG_MAX stays the base tier for older callers and saves');
st=F.normalize(null);
assert.equal(F.bagMax(st),120);assert.equal(F.bagTierOf(st).tier,0);assert.equal(F.nextBagTier(st).cap,200);
st.coins=100;assert.deepEqual(F.buyBagUpgrade(st),{ok:false,reason:'coins'},'an upgrade needs its Fishcoins');
st.coins=F.BAG_TIERS[1].cost;const up1=F.buyBagUpgrade(st);
assert(up1.ok&&up1.cap===200);assert.equal(st.coins,0,'an upgrade costs exactly its price');
assert.equal(F.bagMax(st),200,'the bought capacity is live');
st.coins=1e9;
assert.equal(F.buyBagUpgrade(st).cap,300);assert.equal(F.buyBagUpgrade(st).cap,400);assert.equal(F.buyBagUpgrade(st).cap,500);assert.equal(F.buyBagUpgrade(st).cap,750);assert.equal(F.buyBagUpgrade(st).cap,1000);
assert.deepEqual(F.buyBagUpgrade(st),{ok:false,reason:'max'},'the ladder ends at 1000 and never overflows');
// A bought bag really holds more fish, and a full one still refuses.
st=F.normalize({bagTier:6});assert.equal(F.bagMax(st),1000);
for(let i=0;i<1000;i++)F.addCatch(st,{sp:'minnow',rarity:'common',w:.2});
assert.equal(st.bag.length,1000);assert.equal(F.addCatch(st,{sp:'minnow',rarity:'common',w:.2}),null,'a full 1000 bag refuses new fish');
// The tier survives save/load, clamps to the ladder and rejects garbage.
assert.equal(F.normalize({bagTier:2}).bagTier,2);
assert.equal(F.normalize({bagTier:99}).bagTier,6,'an impossible tier clamps to the top of the ladder');
assert.equal(F.normalize({bagTier:-5}).bagTier,0);
assert.equal(F.normalize({bagTier:'x'}).bagTier,0);
assert.equal(F.normalize({bagTier:1,bag:Array.from({length:300},(_,i)=>({sp:'minnow',w:.2,id:'b'+i}))}).bag.length,200,'normalization keeps the fish the owned tier allows');
// Ten fishing titles, earned from the saved fishing blob and worn above the head.
assert.equal(F.FISHING_TITLES.length,20,'twenty fishing titles');
// v299 (owner): the first ten came too easily, so ten harder ones sit on top of them.
const earlyIds=['dockhand','bait-layer','reed-watcher','species-collector','perfect-hand','heavy-hook','deep-line','mutation-hunter','pond-legend','apex-angler'];
const lateTitles=F.FISHING_TITLES.slice(10);
assert.deepStrictEqual(F.FISHING_TITLES.slice(0,10).map(t=>t.id),earlyIds,'the original ten keep their order and ids');
assert.equal(lateTitles.length,10,'ten new titles');
for(const t of lateTitles)assert(!earlyIds.includes(t.id),'the new title '+t.id+' is genuinely new');
// Each new title in a family asks for strictly more than the early one on the same counter.
const sameCounter=[['tide-regular','reed-watcher'],['line-veteran','bait-layer'],
 ['leviathan-hook','heavy-hook'],['colossus-hook','leviathan-hook'],['pond-legend','species-collector']];
for(const [lateId,earlyId] of sameCounter){
 const L=F.FISHING_TITLE_BY_ID[lateId],E=F.FISHING_TITLE_BY_ID[earlyId];
 assert(L&&E,'both '+lateId+' and '+earlyId+' exist');
 assert(L.goal>E.goal,'the new title '+lateId+' ('+L.goal+') is a longer haul than '+earlyId+' ('+E.goal+')');
}
// Every one of them is reachable from a saved blob that only has the fields older saves already keep.
// v303: four of the titles are no longer counters (full creel, armoury, coin hoard, dark star), so a
// "rich" save now has to look rich: a full top-tier bag, every rod, a coin pile and a mutated mythic.
const rich=F.normalize(null);
rich.stats.casts=6000;rich.stats.catches=2000;rich.stats.perfects=400;
for(const sp of F.SPECIES)rich.dex[sp.id]={n:200,bw:Math.max(sp.max,900),mut:Object.keys(F.MUTATIONS)};
rich.coins=60000;rich.rods=['twig','oak','brass','silver','golden','mythril'];
rich.bagTier=4;rich.bag=Array.from({length:500},(_,i)=>({sp:'minnow',w:.2,id:'r'+i,at:1,mut:null,lock:false,perfect:false}));
assert.equal(F.FISHING_TITLES.filter(t=>F.titleUnlocked(rich,t)).length,20,'a very rich save can earn all twenty');
// And the four new shapes refuse a save that is rich in counters alone.
const countRich=F.normalize(null);
countRich.stats.casts=6000;countRich.stats.catches=2000;countRich.stats.perfects=400;
for(const sp of F.SPECIES)countRich.dex[sp.id]={n:200,bw:Math.max(sp.max,900),mut:[]};
for(const id of ['full-creel','armoury','coin-hoard','dark-star'])
 assert(!F.titleUnlocked(countRich,F.FISHING_TITLE_BY_ID[id]),id+' is not just another counter');
// v311 (owner: "players with the qualifying fish still don't get Dark Star"): any mutation on a
// mythical or secret fish earns it, and a mutation that only survives in the bag still counts, so a
// catch sold or carried over from an older save is not quietly forgotten.
{
 const dark=F.FISHING_TITLE_BY_ID['dark-star'];
 const myth=F.SPECIES.find(s=>s.rarity==='mythical').id,secret=F.SPECIES.find(s=>s.rarity==='secret').id;
 const shiny=F.normalize(null);F.addCatch(shiny,{sp:myth,w:400,mut:'shiny'});
 assert(F.titleUnlocked(shiny,dark),'a shiny mythical earns Dark Star');
 const plain=F.normalize(null);F.addCatch(plain,{sp:myth,w:400,mut:null});
 assert(!F.titleUnlocked(plain,dark),'an unmutated mythical does not');
 const legacy=F.normalize({bag:[{id:'x',sp:secret,w:300,mut:'golden',at:1,perfect:false,lock:false}],dex:{[secret]:{n:1,bw:300,at:1}}});
 assert(F.titleUnlocked(legacy,dark),'a mutation only the bag remembers still counts');
 assert.equal(F.mutationKinds(legacy),1,'the mutation counter reads the bag too');
}
const mid=F.normalize(null);
mid.stats.casts=300;mid.stats.catches=60;mid.stats.perfects=30;
assert.equal(F.FISHING_TITLES.filter(t=>F.titleUnlocked(mid,t)).length<=4,true,'the new ten stay locked for an ordinary save');
// v297: the apex title tracks the catalog size instead of a hardcoded 70.
assert.equal(F.FISHING_TITLE_BY_ID['apex-angler'].goal,F.SPECIES.length,'Apex Angler wants every species');
assert(F.FISHING_TITLE_BY_ID['pond-legend'].goal<F.SPECIES.length,'Pond Legend is a milestone before the apex');
// v310 (owner: "titles are not arranged rarity"): every title belongs to a rarity tier and holds a
// unique place on the ladder, so the UI can list them Common -> Secret instead of in catalog order.
{
 const rankIdx=F.RARITIES.map(r=>r.id);
 for(const t of F.FISHING_TITLES){
  assert(rankIdx.includes(t.tier),t.id+' belongs to a real rarity tier');
  assert(Number.isInteger(t.rank)&&t.rank>=1&&t.rank<=20,t.id+' has a ladder rank');
 }
 const ranks=F.FISHING_TITLES.map(t=>t.rank).sort((a,b)=>a-b);
 assert.deepEqual(ranks,Array.from({length:20},(_,i)=>i+1),'the ladder ranks are 1..20 with no gaps');
 for(const tier of rankIdx.filter(t=>t!=='mvp'))assert(F.FISHING_TITLES.some(t=>t.tier===tier),'the '+tier+' tier has at least one title');
 const listed=[...F.FISHING_TITLES].sort((a,b)=>rankIdx.indexOf(a.tier)-rankIdx.indexOf(b.tier)||a.rank-b.rank);
 let lastTier=-1,ordered=true;
 for(const t of listed){const i=rankIdx.indexOf(t.tier);if(i<lastTier)ordered=false;lastTier=i}
 assert(ordered,'sorting by tier then rank walks the rarity ladder once, never back');
 assert.equal(listed[0].tier,'common','the list opens with the common tier');
 assert(['secret','mvp'].includes(listed.at(-1).tier),'and closes with the top tier');
}
assert.equal(new Set(F.FISHING_TITLES.map(t=>t.id)).size,20,'title ids are unique');
assert.equal(new Set(F.FISHING_TITLES.map(t=>t.name)).size,20,'title names are unique');
st=F.normalize(null);
for(const t of F.FISHING_TITLES){assert(t.name&&t.mark&&t.tone&&t.req,'each title has a name, mark, tone and requirement');assert(t.goal>0);assert(!F.titleUnlocked(st,t),'nothing is earned on a fresh save')}
assert.equal(F.equippedTitle(st),null);
assert.deepEqual(F.equipTitle(st,'dockhand'),{ok:false,reason:'locked'},'an unearned title cannot be worn');
assert.deepEqual(F.equipTitle(st,'nope'),{ok:false,reason:'unknown'});
// v303: Dockhand now wants 25 catches, so the earned-title check catches 25.
st.stats.catches=25;assert(F.titleUnlocked(st,F.FISHING_TITLE_BY_ID.dockhand));
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
assert.deepEqual(F.cleanShowOff({sp:'koi',w:'9999',mut:'evil'}),{sp:'koi',w:3000,mut:null,perfect:false},'a relayed show-off is re-validated');
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
 let THREE=null; try{THREE=require('three')}catch{ console.log('PASS social fishing: ponds+chairs, 165-species catalog (155 + 10 MVP) - Part B skipped (three not installed)'); return; }
 const {JSDOM}=require('jsdom');
 const dom=new JSDOM('<div id="host"></div><div id="labels"></div>',{runScripts:'outside-only'}),w=dom.window,T={...THREE};
 let frame,now=1000,moves=[],pondClicks=[];
 const mvpSignText=[];
 const ctx={drawImage(){},clearRect(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},save(){},restore(){},fillText(text){mvpSignText.push(String(text))},measureText(text){return {width:String(text).length*36}}};
 w.HTMLCanvasElement.prototype.getContext=()=>ctx;
 const host=w.document.getElementById('host');host.setPointerCapture=()=>{};host.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:700});Object.defineProperties(host,{clientWidth:{value:1000},clientHeight:{value:700}});
 T.WebGLRenderer=class{constructor(){this.domElement=w.document.createElement('canvas')}setPixelRatio(){}setSize(){}render(){}dispose(){}};
 T.TextureLoader=class{async loadAsync(){return new T.Texture(w.document.createElement('canvas'))}};
 const action={delay:100,frames:[[[0,0,20,60,150,140,0,'body']]]},look={base:{figureHeight:60,metadata:{actions:{}}},hair:{metadata:{actions:{}}}};
 for(const stance of ['idle','walk','sit'])for(let d=0;d<8;d++)look.base.metadata.actions[stance+d]=look.hair.metadata.actions[stance+d]=action;
 class Store{release(){}async select(){return look}}
 Object.assign(w,{THREE:T,devicePixelRatio:1,requestAnimationFrame:cb=>frame=cb,ResizeObserver:class{constructor(fn){this.fn=fn}observe(){this.fn()}},PGWardrobe:{CLASSES:{Novice:0},Store,normalize:a=>a,defaults:()=>({version:1,sex:'m'}),frameIndex:()=>0,draw(){}},PGFourthJobs:{CLASSES:{},Store},milestone:()=>null,REFINE_GLOWS:[],drawNativeWeaponGlow(){},drawNativeArmGlow(){},LEVEL_AURAS:[],buildLevelAura:()=>new T.Group()});
 w.PGSocialFishing={speciesById:id=>({mvp_stormcoil:{id,name:'Stormcoil Leviathan',glyph:'🐉',max:3000},mvp_tidewarden:{id,name:'Tideforged Warden',glyph:'🦈',max:1500}}[id]||null),fishSprite:()=>{const c=w.document.createElement('canvas');c.width=c.height=256;return c}};
 Object.defineProperty(w.document,'hidden',{value:false});w.performance.now=()=>now;w.console.warn=()=>{};
 w.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(url)),arrayBuffer:async()=>{const b=fs.readFileSync(url);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}});
 w.eval(fs.readFileSync(path.join(__dirname,'..','..','assets','digimon','roster.js'),'utf8'));w.eval(fs.readFileSync(path.join(__dirname,'..','..','assets','social-rules.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(__dirname,'..','..','assets','social-scene.js'),'utf8'));
 const seatClicks=[];
 const scene=await w.PGSocialScene.create(host,w.document.getElementById('labels'),{self:()=>1,menu(){},move(x,z){moves.push({x,z})},seat(id){seatClicks.push(id)},pond(x,z,idx){pondClicks.push({x,z,idx})}});
 scene.active=true;
 assert(scene.fishing,'the scene exposes a fishing rig');
 for(const fn of ['setFishVisible','setMvp','cast','bite','reel','catchFly','escapeSplash','ripple','splash','hide','off','showFish'])assert.equal(typeof scene.fishing[fn],'function','fishing.'+fn);
 const R=w.PGSocialRules,pond=R.PONDS[0],bridge=R.POND_PROPS[0].bridge;
 // The alert is a large, live-only board, and the server-selected species floats above the lake.
 scene.fishing.setMvp('mvp_stormcoil',true);
 const mvpSign=scene.scene.children.find(o=>o.userData&&o.userData.socialMvpSign);
 const mvpBoard=mvpSign&&mvpSign.children.find(o=>o.userData&&o.userData.socialMvpSignBoard);
 const mvpFloat=scene.scene.children.find(o=>o.userData&&o.userData.socialMvpFloat);
 const mvpSprite=mvpFloat&&mvpFloat.children.find(o=>o.userData&&o.userData.socialMvpFish);
 assert(mvpSign&&mvpSign.visible&&mvpBoard&&mvpBoard.geometry.parameters.width>=12.5&&mvpBoard.geometry.parameters.height>=3&&mvpBoard.position.y>=9,'the bridge alert is substantially bigger and higher');
 assert(mvpFloat&&mvpFloat.visible&&mvpFloat.userData.spId==='mvp_stormcoil','the selected MVP has its own visible pond sprite');
 assert.equal(mvpSign.children.length,1,'the warning sign floats above the bridge - no posts or mirrored glow plane');
 assert.equal(mvpBoard.position.x,bridge.x);assert.equal(mvpBoard.position.z,bridge.z,'the requested sign is the one over the bridge, not a side-bank sign');
 /* v383 (owner: "the mvp fish should be floating around the pond randomly, not one spot"): every
    spawn surfaces somewhere else, but always inside the water and never under the bridge deck. */
 const inWater=(x,z)=>R.pondContains(pond,x,z,-.4);
 // v389: v386 deliberately re-anchored the peek - `center.set(.5,.18)` lowers the sprite to baseY .72
 // so the boss "sits lower and larger" in the water (it was 2.55 before). This predicate still pinned
 // the OLD floating height, so a correct spawn failed here because of y, not because of the pond.
 assert(mvpSprite&&inWater(mvpFloat.position.x,mvpFloat.position.z),'the selected MVP floats inside the pond');
 assert(Math.abs(mvpFloat.position.z-bridge.z)>bridge.width/2,'the MVP never surfaces underneath the bridge deck');
 const spots=new Set();
 for(let i=0;i<18;i++){scene.fishing.setMvp('mvp_stormcoil',true);spots.add(mvpFloat.position.x.toFixed(2)+':'+mvpFloat.position.z.toFixed(2));assert(inWater(mvpFloat.position.x,mvpFloat.position.z),'every spawn lands in the water')}
 assert(spots.size>=6,'the MVP surfaces at random pond positions, not one fixed spot ('+spots.size+' of 18)');
 frame(now+=100);
 // v386 anchor: the sprite sits just above the waterline and bobs around baseY (.72), with the art's
 // waterline cut (center .18) keeping the head clear of the surface.
 assert(mvpSprite.position.y>.5&&mvpSprite.position.y<1,'the MVP sprite bobs slightly above the surface');
 /* v383 (owner: "the text is mirrored, not mirror from the other side"): the board turns to face
    the camera, so the printed side - never the mirrored one - is what the player reads. */
 const cam=scene.camera||null;
 if(cam&&cam.position){const want=Math.atan2(cam.position.x-mvpBoard.position.x,cam.position.z-mvpBoard.position.z);assert(Math.abs(Math.atan2(Math.sin(mvpBoard.rotation.y-want),Math.cos(mvpBoard.rotation.y-want)))<.02,'the MVP alert board faces the camera instead of showing its mirrored back')}
 assert(mvpSignText.some(text=>/MVP ALERT: STORMCOIL LEVIATHAN/.test(text))&&!mvpSignText.some(text=>/%|hook|catch chance|land chance/i.test(text)),'the alert sign names the MVP without displaying rates');
 // v380: the half-body peek scales with the species' real weight range.
 const voidScale=mvpSprite.scale.x;
 scene.fishing.setMvp('mvp_tidewarden',true);
 const crabScale=mvpSprite.scale.x;
 assert(voidScale>crabScale,'a 3.0t Stormcoil Leviathan peeks larger than a 1.5t Tideforged Warden ('+voidScale.toFixed(2)+' vs '+crabScale.toFixed(2)+')');
 scene.fishing.setMvp(null,false);
 assert(!mvpSign.visible&&!mvpFloat.visible,'the sign and MVP disappear when the spawn ends');
 // Stand the local player on the east pond rim.
 scene.putPlayer({id:1,name:'Angler',x:pond.x,z:pond.z-pond.d/2-1.7,dir:0,sit:false,path:[],look:{cls:'Novice',appearance:{version:1,sex:'m'}}});
 frame(now+=100);
 // Clicking the water reports the pond to the fishing callback instead of walking in.
 scene.camera.updateMatrixWorld();
 const pt=new T.Vector3(pond.x,0,pond.z-6).project(scene.camera);
 const ev={clientX:(pt.x+1)*500,clientY:(1-pt.y)*350,pointerId:1,button:0,preventDefault(){}};
 host.onpointerdown(ev);host.onpointerup(ev);
 assert.equal(moves.length,0,'a pond click never walks into the water');
 assert.equal(pondClicks.length,1,'a pond click reaches the fishing callback');
 assert.equal(pondClicks[0].idx,0,'the clicked lake index is reported');
 // The elevated deck is a walking target, not a click on the water underneath.
 const deck=w.PGSocialRules.POND_PROPS[0].bridge;
 scene.scene.updateMatrixWorld(true);
 const deckPoint=new T.Vector3(deck.x,deck.arch,deck.z).project(scene.camera);
 const deckEv={clientX:(deckPoint.x+1)*500,clientY:(1-deckPoint.y)*350,pointerId:2,button:0,preventDefault(){}};
 host.onpointerdown(deckEv);host.onpointerup(deckEv);
 assert.equal(moves.length,1,'clicking the visible bridge walks rather than fishing');
 assert(w.PGSocialRules.onBridge(moves[0].x,moves[0].z),'bridge click resolves onto the deck');
 assert.equal(pondClicks.length,1,'bridge click does not start fishing');
 // Corners of the former bounding rectangle are now dry land, and clicks must walk there.
 const land={x:pond.x+pond.w*.46,z:pond.z+pond.d*.46};assert(!w.PGSocialRules.pondContains(pond,land.x,land.z));assert(w.PGSocialRules.walkable(land.x,land.z));
 scene.putPlayer({id:1,name:'Angler',x:land.x+4,z:land.z+2,dir:0,sit:false,path:[],look:{cls:'Novice',appearance:{version:1,sex:'m'}}});
 for(let i=0;i<8;i++)frame(now+=100);scene.camera.updateMatrixWorld();scene.scene.updateMatrixWorld(true);
 const landPt=new T.Vector3(land.x,0,land.z).project(scene.camera),landEv={clientX:(landPt.x+1)*500,clientY:(1-landPt.y)*350,pointerId:3,button:0,preventDefault(){}};
 host.onpointerdown(landEv);host.onpointerup(landEv);
 assert.equal(moves.length,2,'clicking the dry rounded corner walks');assert.equal(pondClicks.length,1,'dry corner does not start fishing');
 // Both new paved landings are real walking targets, not water clicks.
 for(const x of [-69,-11]){
  scene.camera.position.set(x,20,deck.z+20);scene.camera.lookAt(x,0,deck.z);scene.camera.updateMatrixWorld();scene.scene.updateMatrixWorld(true);
  const pos=new T.Vector3(x,0,deck.z).project(scene.camera),event={clientX:(pos.x+1)*500,clientY:(1-pos.y)*350,pointerId:4,button:0,preventDefault(){}};
  const before=moves.length;host.onpointerdown(event);host.onpointerup(event);
  assert.equal(moves.length,before+1,'stone approach click starts walking');assert(Math.abs(moves.at(-1).x-x)<1,'click lands on the chosen approach');assert.equal(pondClicks.length,1,'approach never starts fishing');
 }

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
 scene.putPlayer({id:1,name:'Angler',x:chair.x+2,z:chair.z+3,dir:0,sit:false,path:[],look:{cls:'Novice',appearance:{version:1,sex:'m'}}});
 for(let i=0;i<8;i++)frame(now+=100);
 scene.camera.updateMatrixWorld();scene.scene.updateMatrixWorld(true);
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
 w2.eval(fs.readFileSync(path.join(__dirname,'..','..','assets','digimon','roster.js'),'utf8'));w2.eval(fs.readFileSync(path.join(__dirname,'..','..','assets','social-rules.js'),'utf8'));
 w2.eval(fs.readFileSync(path.join(__dirname,'..','..','assets','social-title-art.js'),'utf8'));w2.eval(fs.readFileSync(path.join(__dirname,'..','..','assets','social-fishing.js'),'utf8'));
 w2.HTMLCanvasElement.prototype.getContext=()=>null; // no canvas package here: prove the legacy fallback
 const FISH=w2.PGSocialFishing,hostS={fishing:null},d2=w2.document;
 let saves=0;
 FISH.bind({host:()=>hostS,scene:()=>null,self:()=>null,moveTo:()=>{},notice:()=>{},save:()=>{saves++}});
 assert.equal(d2.getElementById('socialHub').querySelector('#fishingDock')!==null,true,'the module builds its dock into the hub');
 FISH.openBag();
 const fishingPanel=d2.getElementById('fishingPanel');
 assert.equal(fishingPanel.hidden,false,'the bag window opens');
 await Promise.resolve();
 assert(d2.body.classList.contains('social-fishing-panel-open'),'the visible Fishing window can stand phone chat down');
 d2.getElementById('fishingPanelClose').click();await Promise.resolve();
 assert(!d2.body.classList.contains('social-fishing-panel-open'),'closing the window restores chat');
 FISH.openBag();await Promise.resolve();fishingPanel.hidden=true;await Promise.resolve();
 assert(!d2.body.classList.contains('social-fishing-panel-open'),'another hub panel hiding Fishing also restores chat');
 FISH.openBag();await Promise.resolve();FISH.hubClosed();await Promise.resolve();
 assert(!d2.body.classList.contains('social-fishing-panel-open'),'leaving the plaza restores chat');
 FISH.openBag();await Promise.resolve();
 const fishingCss=fs.readFileSync(path.join(__dirname,'..','..','assets','social-fishing.css'),'utf8');
 assert(fishingCss.includes('body.social-open.social-fishing-panel-open #socialChat{display:none}'),'the narrow-screen style stands chat down only for the open window');
 // v295: the Pond fish toggle is gone - the ponds always hold fish.
 assert.equal(d2.getElementById('fishingShowFish'),null,'there is no Pond fish toggle any more');
 // v303 (owner): the Index is grouped by rarity. Everything added after the first art drop used to
 // sit in one mixed block at the bottom, which read as a bug.
 FISH.openIndex();
 const dexRarities=[...d2.querySelectorAll('.fishing-dex-row')].map(r=>{
  const chip=r.querySelector('.fishing-chip');return chip?chip.textContent:'';
 });
 const rank=['Common','Uncommon','Rare','Legendary','Mythical','Secret'];
 let last=0,grouped=true;
 for(const label of dexRarities){
  const i=rank.indexOf(label);
  if(i<0)continue;
  if(i<last)grouped=false;
  last=i;
 }
 assert.equal(dexRarities.length,F.SPECIES.length,'the index lists every species');
 assert(grouped,'the index is grouped by rarity from common up to secret');
 // The Titles tab lists exactly the fishing titles, with progress for the locked ones.
 FISH.openTitles();
 const titleRows=d2.querySelectorAll('.fishing-title-row');
 assert.equal(titleRows.length,F.FISHING_TITLES.length,'the Titles tab lists every fishing title');
 assert.equal(titleRows.length,20,'which is twenty in v299');
 assert(/Dockhand/.test(d2.getElementById('fishingTitlesView').textContent),'titles are named');
 assert.equal(d2.querySelectorAll('.fishing-title-row.locked').length,20,'nothing is earned on a fresh save');
 const art=[...d2.querySelectorAll('.fishing-title-row .social-title-symbol')];
 assert.equal(art.length,20);assert.equal(new Set(art.map(img=>img.getAttribute('src'))).size,20,'each fishing title has its own supplied icon');
 assert(art.some(img=>img.getAttribute('src')==='assets/social-title-icons/fishing-heavy-hook.webp?v=440'));
 for(const [id,tone] of [['dockhand','#c08a52'],['tide-regular','#5fc9d8']]){
  const img=d2.querySelector(`img[src="assets/social-title-icons/fishing-${id}.webp?v=440"]`);
  assert.equal(img.parentElement.style.getPropertyValue('--tone'),tone,'the supplied mark keeps the existing title glow color');
 }
 const registry=w2.PGSocialTitleArt;delete w2.PGSocialTitleArt;FISH.openTitles();
 assert.equal(d2.querySelectorAll('.fishing-title-mark').length,20,'missing registry retains the legacy fallback');
 w2.PGSocialTitleArt=registry;FISH.openTitles();assert.equal(d2.querySelectorAll('.social-title-symbol').length,20);
 // Earning one and wearing it from the tab goes through the same save hook as the rest.
 hostS.fishing.stats.catches=25;FISH.openTitles();
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
 // v304: the cart says which rarity each rod unlocks, and the dearest rod is the only route to Secrets.
 const cart=d2.getElementById('fishingShopView').textContent;
 assert(/unlocks Rare\+/.test(cart),'the Oak Rod advertises the rare tier');
 assert(/unlocks Legendary\+/.test(cart),'the Silver Rod advertises legendaries');
 assert(/unlocks (Secret|MVP)\+/.test(cart),'the Mythril Rod advertises its top tier');
 const buyBtn=d2.querySelector('#fishingShopView button[data-bagup]');
 assert(buyBtn,'the shop offers the next bag tier');
 assert.equal(buyBtn.disabled,true,'it cannot be bought without the Fishcoins');
 hostS.fishing.coins=F.BAG_TIERS[1].cost;FISH.openBag(); // v304 tier priced2.getElementById('fishingGearLine').onclick();
 const buy2=d2.querySelector('#fishingShopView button[data-bagup]');
 assert.equal(buy2.disabled,false,'it becomes affordable');
 buy2.onclick();
 assert.equal(hostS.fishing.bagTier,1,'buying the tier raises the bag');
 assert.equal(FISH.bagMax(hostS.fishing),200);
 assert.equal(hostS.fishing.coins,0,'the tier is paid for once');
 assert(/Reinforced Creel/.test(d2.getElementById('fishingShopView').textContent),'the shop reflects the new tier');
 // v326 (owner's console): `Sell duplicates` read `st.settings.autoSell`, and `st` is not in scope in
 // ensureDom - the page happened to expose some global of that name, so the click died with
 // "Cannot read properties of undefined (reading 'autoSell')" instead of explaining the empty bag.
 hostS.fishing.bag.length=0;
 d2.getElementById('fishingSellDupes').onclick();
 assert(/Nothing to sell/i.test(d2.getElementById('fishingStatus').textContent),'an empty bag is explained, not thrown');
 hostS.fishing.settings.autoSell=true;
 d2.getElementById('fishingSellDupes').onclick();
 assert(/auto-sell is on/i.test(d2.getElementById('fishingStatus').textContent),'and with auto-sell on it says why the bag is empty');
 hostS.fishing.settings.autoSell=false;
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
 // v304: the pond is 18x13 now, so the rim offset is bigger than the old fixed 12-unit radius.
// What matters is that the target sits on the pond's rim, not the distance from its centre.
const rimDist=w2.PGSocialRules.pondDistance(pondA,moved.x,moved.z);
assert(rimDist<2.4,'the walk targets the pond rim, not the spawn');
// v311 (owner: "pond clicking is off - it keeps going to the same place"): the water you click now
// decides the stand, so two clicks on opposite banks walk to opposite banks.
{
 const pondB=w2.PGSocialRules.PONDS[0],targets=[];
 FISH.bind({host:()=>hostS,scene:()=>null,self:()=>({x:0,z:12}),moveTo:(x,z)=>targets.push({x,z}),notice:()=>{},save:()=>{}});
 FISH.pondClick(pondB.x-18,pondB.z,0);const west=targets.at(-1);
 FISH.pondClick(pondB.x+18,pondB.z,0);const east=targets.at(-1);
 assert(west&&east&&Math.hypot(west.x-east.x,west.z-east.z)>5,'clicking the far bank walks somewhere else');
 assert(east.x>west.x,'the east click lands east of the west click');
 FISH.bind({host:()=>hostS,scene:()=>null,self:()=>({x:me.x,z:me.z}),moveTo:(x,z)=>{moved={x,z}},notice:()=>{},save:()=>{}});
}
 // Reaching the rim resumes fishing.
 me.x=rimA.x;me.z=rimA.z;
 frame2(clock2+=100);
 assert.equal(FISH.phase,'ready','Auto fishing carries on after the walk back');
 // v303 (owner): the walk-back used to go through the plaza's normal move, which raises the
 // "Stop fishing and move?" dialog - so an AFK angler was asked a question and never walked. It has
 // to use walkTo (the no-prompt move) when it is bound, and it must re-issue it while walking.
 let walked=0,moved2=0;
 FISH.stop('');
 me.x=rimA.x;me.z=rimA.z;
 FISH.bind({host:()=>hostS,scene:()=>null,self:()=>({x:me.x,z:me.z}),moveTo:()=>{moved2++},walkTo:()=>{walked++},notice:()=>{},save:()=>{}});
 FISH.toggle();
 assert.equal(FISH.phase,'ready','a fresh session on the rim is live again');
 d2.getElementById('fishingAutoBtn').onclick();
 me.x=0;me.z=12;
 frame2(clock2+=100);
 assert.equal(FISH.phase,'walking','a respawned Auto angler starts walking');
 assert(walked>=1,'the walk uses the no-prompt move');
 assert.equal(moved2,0,'the confirm-raising move is never used for an automatic walk-back');
 const before=walked;
 frame2(clock2+=3000);
 assert(walked>before,'the walk is re-issued while it is still far from the pond');
 frame2(clock2+=40000);
 assert.equal(FISH.phase,'off','after half a minute of trying it stops instead of spinning forever');
 // back to a plain manual session for the two checks below
 FISH.bind({host:()=>hostS,scene:()=>null,self:()=>({x:me.x,z:me.z}),moveTo:()=>{},notice:()=>{},save:()=>{}});
 me.x=rimA.x;me.z=rimA.z;
 FISH.toggle();
 assert.equal(FISH.phase,'ready','the manual session is live again');
 if(!FISH.auto)d2.getElementById('fishingAutoBtn').onclick();
 assert.equal(FISH.auto,true,'Auto is back on for the manual-session check');
 // A manual session still stops with the v294 message, exactly as before.
 d2.getElementById('fishingAutoBtn').onclick();
 assert.equal(FISH.auto,false,'Auto is off');
 me.x=0;me.z=12;
 frame2(clock2+=100);
 assert.equal(FISH.phase,'off','without Auto, walking away still ends the session');
 me.x=rimA.x;me.z=rimA.z;
 // --- Part C3: the leave-warning's stop hook (v297) ---------------------------------------
 // Clicking away no longer blocks the click with a chat nag; the plaza asks and then calls this.
 let said=[];
 FISH.bind({host:()=>hostS,scene:()=>null,self:()=>({x:rimA.x,z:rimA.z}),moveTo:()=>{},notice:m=>said.push(m),save:()=>{}});
 FISH.toggle();
 assert.equal(FISH.phase,'ready','a bound session is live for the stop hook');
 FISH.stop('🎣 Line reeled in — you stepped away from the pond.');
 assert.equal(FISH.phase,'off','stop() reels the line in, which is what the confirm button calls');
 assert(said.some(m=>/Line reeled in/.test(m)),'stop() passes its message to the chat notice');
 FISH.stop('again');
 assert.equal(said.filter(m=>/again/.test(m)).length,0,'stopping an idle session says nothing');
 // The announcement rule: mega species and the secret pool, and nothing else.
 const announced=F.SPECIES.filter(sp=>sp.mega||sp.rarity==='secret').map(sp=>sp.id);
 assert(announced.includes('whaleshark')&&announced.includes('poring'),'giants and secrets are announced');
 assert(!announced.includes('minnow')&&!announced.includes('koi'),'ordinary catches stay quiet in chat');
 // --- Part C4: the rod you hold is the rod the plaza draws (v300) ---------------------------
 let rodCalls=[],rigs=[];
 const fishStub=new Proxy({},{get:(t,k)=>{if(k==='rod')return id=>rodCalls.push(id);return typeof k==='string'?()=>{}:undefined}});
 hostS.fishing.rods=['twig','oak','brass','golden'];hostS.fishing.rod='twig';
 FISH.bind({host:()=>hostS,scene:()=>({fishing:fishStub}),rig:p=>rigs.push(p),self:()=>({x:rimA.x,z:rimA.z}),moveTo:()=>{},notice:()=>{},save:()=>{}});
 FISH.toggle();
 assert.equal(FISH.phase,'ready','the rod-plumbing session is live');
 assert.equal(rodCalls.at(-1),'twig','starting a session paints the held pole in the equipped rod');
 // Nothing is on the wire until the line is cast, and then the tier rides with it.
 assert.equal(rigs.every(p=>p.on!==true||!!p.rod),true,'anything that leaves the client names its rod');
 FISH.stop('done');
 hostS.fishing.rod='golden';
 FISH.toggle();
 assert.equal(rodCalls.at(-1),'golden','a better rod repaints the pole you are holding');
 FISH.stop('done');
 // Cast from the middle of the deck: the bobber must land beside the bridge, in water.
 let bridgeTarget=null;
 const bridgeFish=new Proxy({cast:(target)=>{bridgeTarget=target}},{get:(t,k)=>t[k]||(()=>{})});
 FISH.bind({host:()=>hostS,scene:()=>({fishing:bridgeFish}),self:()=>({x:bridge.x,z:bridge.z}),moveTo:()=>{},notice:()=>{},save:()=>{}});
 FISH.toggle();assert.equal(FISH.phase,'ready');
 if(!FISH.auto)d2.getElementById('fishingAutoBtn').onclick();
 frame2(clock2+=1000);assert.equal(FISH.phase,'charge');
 frame2(clock2+=1050);assert(bridgeTarget,'auto cast reaches the 3D scene');
 assert(!R.onBridge(bridgeTarget.x,bridgeTarget.z),'bridge fishing lands the bobber in water rather than on the deck');
 assert(R.pondContains(lake,bridgeTarget.x,bridgeTarget.z),'cast target is within curved lake');
 FISH.stop('done');
 // v355 (owner: "the cast must follow the direction you face, and the line must not cross the
 // bridge"): from the south-west shore, facing the water keeps the bobber on your own side of
 // the bridge, and facing inland still finds water through the toward-pond fallback.
 {
  const sw=props.stands.find(st=>st.name==='south-west');
  let aimed=null;const aimFish=new Proxy({cast:(target)=>{aimed=target}},{get:(t,k)=>t[k]||(()=>{})});
  const bindSW=(self)=>FISH.bind({host:()=>hostS,scene:()=>({fishing:aimFish}),self,moveTo:()=>{},notice:()=>{},save:()=>{}});
  bindSW(()=>({x:sw.x,z:sw.z,face:Math.atan2(lake.z-sw.z,lake.x-sw.x)}));
  FISH.toggle();assert.equal(FISH.phase,'ready');
  if(!FISH.auto)d2.getElementById('fishingAutoBtn').onclick();
  frame2(clock2+=1400);assert.equal(FISH.phase,'charge','auto begins the charge');
  frame2(clock2+=1150);assert(aimed,'a facing cast reaches the 3D scene');
  assert(R.pondContains(lake,aimed.x,aimed.z),'the facing cast lands in water');
  assert(aimed.z>bridge.z+bridge.width/2,'a south-shore cast stays south of the bridge instead of crossing it');
  FISH.stop('done');
  let inland=null;const inlandFish=new Proxy({cast:(target)=>{inland=target}},{get:(t,k)=>t[k]||(()=>{})});
  FISH.bind({host:()=>hostS,scene:()=>({fishing:inlandFish}),self:()=>({x:sw.x,z:sw.z,face:Math.atan2(sw.z-lake.z,sw.x-lake.x)}),moveTo:()=>{},notice:()=>{},save:()=>{}});
  FISH.toggle();assert.equal(FISH.phase,'ready');
  if(!FISH.auto)d2.getElementById('fishingAutoBtn').onclick();
  frame2(clock2+=1400);assert.equal(FISH.phase,'charge','auto begins the charge after the fallback bind');
  frame2(clock2+=1150);assert(inland,'an inland-facing cast still reaches the scene');
  assert(R.pondContains(lake,inland.x,inland.z),'facing away from the pond falls back to open water');
  FISH.stop('done');
 }
 // MVP rates stay gameplay data, not player-facing copy: verify the banner and room notices.
 const mvpNotices=[];
 FISH.bind({host:()=>hostS,scene:()=>null,self:()=>null,moveTo:()=>{},notice:m=>mvpNotices.push(m),save:()=>{}});
 const mvpEnds=Date.now()+10*60*1000;
 FISH.setMvp({sp:'mvp_stormcoil',id:'mvp-ui-test',spawnedAt:Date.now(),endsAt:mvpEnds});
 FISH.setMvp({sp:'mvp_stormcoil',id:'mvp-ui-test',spawnedAt:Date.now(),endsAt:mvpEnds}); // repeated worker snapshot / reconnect
 const mvpBannerText=d2.getElementById('fishingMvpBanner').textContent;
 assert(/Stormcoil Leviathan/.test(mvpBannerText)&&!/\d+%|hook|catch chance|land chance/i.test(mvpBannerText),'the active MVP banner names the fish and omits rates');
 assert.equal(mvpNotices.length,1,'duplicate spawn snapshots do not spam repeat announcements');
 assert(mvpNotices[0]&&/Stormcoil Leviathan/.test(mvpNotices[0])&&!/\d+%|hook|catch chance|land chance/i.test(mvpNotices[0]),'the spawn announcement omits rates');
 FISH.clearMvp({id:'mvp-ui-test'});
 assert(mvpNotices[1]&&/fled the pond/i.test(mvpNotices[1])&&!/\d+%|hook|catch chance|land chance/i.test(mvpNotices[1]),'the despawn notice omits rates');
 assert.equal(mvpNotices.length,2,'one despawn produces only one notice');
 if(FISH.setMvp._ticker){clearInterval(FISH.setMvp._ticker);FISH.setMvp._ticker=null}
 dom2.window.close();
 // --- Part D: the page wires v295 up (save shape, cache versions, build tag) ---------------
 const page=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
 assert(page.includes('baitSel:null,bagTier:0,title:null'),'a fresh save carries the bag tier and the fishing title');
 assert(/const fishBagTiers=\[120,200,300,400,500,750,1000\]/.test(page),'the page sanitizer knows the 7-tier bag ladder');
 assert(/f\.fishing\.bagTier=Math\.max\(0,Math\.min\(fishBagTiers\.length-1/.test(page),'the saved bag tier is clamped');
 assert(/\.slice\(-fishBagCap\)/.test(page),'the bag is sliced to the tier the player owns');
 assert(/const fishTitleIds=\['dockhand'/.test(page),'the page sanitizer whitelists the fishing titles');
 for(const t of F.FISHING_TITLES)assert(page.includes("'"+t.id+"'"),'index.html knows the title '+t.id);
 assert(/f\.fishing\.settings=\{fish:true,/.test(page),'pond fish are forced on in the page sanitizer');
 // v297 (owner bug): the sanitiser used to drop autoSell, so it never survived a reload.
 assert(/autoSell:f\.fishing\.settings\?\.autoSell===true/.test(page),'the page sanitizer keeps the auto-sell toggle');
 assert(/const fresh=\(\).*?settings:\{fish:true,sound:true\}/s.test(page)||/fishing:\{v:1,bag:\[\],dex:\{\}/.test(page),'the fresh save shape is present');
 const curV=(page.match(/const BUILD='[^']*haven-v(\d+)/)||[])[1];
 assert(Number(curV)>=318,'the login card names the v318+ build');
 for(const asset of ['assets/social-fishing.js','assets/social-scene.js','assets/social.js','assets/social-fishing.css'])
  assert(page.includes(asset+'?v='+curV),asset+' is versioned at v'+curV);
 // --- Part D2: v297 leave-confirm, announcements and the fishing stop hook ------------------
 const social=fs.readFileSync(path.join(__dirname,'..','..','assets','social.js'),'utf8');
 const mod=fs.readFileSync(path.join(__dirname,'..','..','assets','social-fishing.js'),'utf8');
 const room=fs.readFileSync(path.join(__dirname,'..','..','workers','social','room.mjs'),'utf8');
 const mvpSpawnRoute=(social.match(/if\(m\.type==='mvp_spawn'\)[\s\S]*?return\}/)||[])[0]||'';
 assert(mvpSpawnRoute&&!/\d+%|hook|catch chance|land chance/i.test(mvpSpawnRoute),'the plaza spawn alert contains no catch-rate wording');
 assert(mod.includes("status('The MVP broke free! Try again before it despawns.')"),'the reel-failure status gives a retry hint without exposing the rate');
 // Clicking away from the pond asks first, exactly like the poker table, instead of nagging chat.
 assert(!social.includes('press ✕ Stop fishing before moving'),'chat no longer nags about the X button');
 assert(social.includes('function confirmFishingStop('),'the plaza has a fishing leave-confirm');
 assert(social.includes('function finishFishingStop('),'the confirm resolves to stay or reel in');
 for(const id of ['socialFishLeaveWarning','fishLeaveStay','fishLeaveConfirm'])
  assert(social.includes(id),'the leave-confirm has #'+id);
 assert(/fishLeaveWarning\.innerHTML='<section class="poker-leave-card fish-leave-card"/.test(social),'it reuses the poker dialog layout');
 assert(/\.key==='Escape'\).*finishFishingStop\(false\)/.test(social),'Escape keeps the line in the water');
 // v300: the plaza used to rebuild the rig packet field by field - which silently dropped the rod.
 assert(/type:'rig',on:!!\(state&&state\.on\).*?rod:state&&state\.rod\}/.test(social),'the plaza forwards the rod id with the rig, not just the mode');
 assert(social.includes('fishingBlocked(()=>moveAction(x,z))'),'a blocked walk is retried after confirming');
 assert(social.includes('fishingBlocked(()=>seatAction(id))'),'a blocked seat is retried after confirming');
 // v299 (owner): sit and stand never interrupt fishing - only actions that walk away ask.
 assert(!social.includes('fishingBlocked(()=>toggleSit())'),'sit/stand never asks to stop fishing');
 assert(/function toggleSit\(\)\{confirmPokerLeave/.test(social),'sit/stand goes straight through');
 assert(social.includes('fishingBlocked(()=>moveAction(x,z))'),'walking away still asks');
 // v303: the auto walk-back needs a move that never asks, or an AFK angler gets a dialog instead.
 assert(social.includes('walkTo:(x,z)=>performMoveAction(x,z,true)'),'the fishing bind exposes a no-prompt walk');
 assert(social.includes('fishingBlocked(()=>pokerSeatAction(globalSeat))'),'a poker stool still asks');
 // v299 (owner): the rods carry a visible tier aura in the sprite and in CSS.
 assert(/const ROD_AURA=\{twig:\.22/.test(mod),'every rod tier has an aura strength');
 assert(mod.includes('shadowBlur=U(9)'),'the painted rod gets a bloom + ring the eye can actually see');
 assert(/data-rod-tier=\"\$\{esc\(rod\.id\)\}\"/.test(mod),'the markup exposes the tier for CSS');
 // v300 (owner): the 3D pole in the player's hands glows in the rod's own colour.
 assert(/const ROD_GLOW=\{twig:\.3/.test(mod.replace(/\s+/g,' '))===false,'the glow table lives in the scene, not the fishing module');
 const sceneSrc=fs.readFileSync(path.join(__dirname,'..','..','assets','social-scene.js'),'utf8');
 assert(/ROD_GLOW=\{twig:\.3,oak:\.4,brass:\.52,silver:\.62,golden:\.78,mythril:\.92\}/.test(sceneSrc),'every tier has a world-space glow strength');
 assert(sceneSrc.includes('T.AdditiveBlending'),'the glow is added light, not a dull brown stick');
 assert(/rodTint\(rodId\)/.test(sceneSrc)&&sceneSrc.includes('ROD_TIER_COLORS'),'the pole reuses the rod tier palette');
 assert(sceneSrc.includes('rod:setRod'),'the scene hands the fishing module a setRod hook');
 assert(/c\.fish=\{on:true,pond:.*rod:FISH_RODS\.has\(m\.rod\)\?m\.rod:'twig'\}/.test(room),'the relay validates and forwards the rod id');

 // --- Part D3: v301 fish art - crops first, painted fallback for the rest ---------------------
 const artDir=path.join(__dirname,'..','..','assets','social','fish');
 const manifest=JSON.parse(fs.readFileSync(path.join(artDir,'MANIFEST.json'),'utf8'));
 const artIds=Object.keys(manifest);
 assert.equal(artIds.length,156,'156 species ship a real drawing (146 + 10 MVP)');
 assert.deepEqual(artIds.slice().sort(),Object.keys(F.FISH_ART).sort(),'the module and the manifest agree');
 assert.equal(new Set(Object.values(manifest)).size,artIds.length,'no two species share one file');
 const PNG=Buffer.from([137,80,78,71,13,10,26,10]);
 for(const id of artIds){
  assert(F.speciesById(id),'art maps to a real species: '+id);
  assert.equal(manifest[id],'assets/social/fish/'+id+'.png',id+' is one file per species');
  const buf=fs.readFileSync(path.join(__dirname,'..','..',manifest[id]));
  assert(buf.subarray(0,8).equals(PNG),id+'.png is a png');
  // v303 (owner): 128, not 96 - the detail panel draws 128 and the index 64, so the art is either
  // 1:1 or an exact halving instead of being upscaled (which is what looked blurry).
  // v384/v407: the MVP bosses ship at 512 - the pond's hero texture stays 512 all the way to
  // Three.js, while the Index/catch cards only downsample it. Ordinary fish retain their 128 art.
  const want=Number(id.startsWith('mvp_'))?512:128;
  assert.equal(buf.readUInt32BE(16),want,id+' is '+want+' wide');
  assert.equal(buf.readUInt32BE(20),want,id+' is '+want+' tall');
  assert([3,6].includes(buf[25]),id+' keeps transparency as indexed-alpha or rgba');
 }
 // v380 (owner): the live spawn banner is created with the fishing DOM - it used to be read
 // from an index.html node that never existed, so MVP notices never rendered.
 assert(mod.includes("mvpBanner.id='fishingMvpBanner'"),'the live MVP banner is created in ensureDom');
 assert(mod.includes("FISH_ART_VERSION='407'"),'the fish-art cache version is bumped with the v407 MVP recrop');
 assert(sceneSrc.includes('const MVP_BASE_PX=512')&&sceneSrc.includes("F.fishSprite(spId,null,512)"),'the pond keeps the 512px crop through its GPU texture');
 // v380 (owner: "cropped, HD"): every MVP crop is a real transparent sprite - decode when sharp
 // is installed and require an empty top-left corner plus a real cutout (some transparency).
 (async()=>{
  let sharp;try{sharp=require('sharp')}catch{console.log('  (sharp not installed - MVP alpha check skipped)');return}
  for(const id of artIds.filter(i=>i.startsWith('mvp_'))){
   const {data}=await sharp(path.join(__dirname,'..','..',manifest[id])).raw().ensureAlpha().toBuffer({resolveWithObject:true});
   // A photo/sketch background is opaque (alpha ~255); the soft in-game glow may leave a whisker
   // of alpha in a corner, so "no background" means effectively clear, not bit-zero.
   assert.ok(data[3]<=8,id+' has a transparent corner (no photo background)');
   let clear=0;for(let i=3;i<data.length;i+=4)if(data[i]<16)clear++;
   assert(clear>1000,id+' is a real cutout, not an opaque square');
  }
 })();
 const paintedIds=F.SPECIES.filter(sp=>!manifest[sp.id]).map(sp=>sp.id);
 assert.equal(paintedIds.length,9,'the last nine species (crab, gar/pike, angler) paint themselves');
 assert(paintedIds.every(id=>!F.FISH_ART[id]),'no stale art entry for a painted species');
 assert(mod.includes('const art=FISH_IMG.get(sp.id);'),'a drawing is tried before the painter');
 assert(mod.includes('function preloadFishArt()'),'drawings are preloaded once, not per frame');
 assert(/const wash=mut==='golden'\?'#ffd24d'/.test(mod),'mutations tint a drawing instead of ignoring it');
 assert(mod.includes('sat=76+v(1)*8,lum=52+v(2)*7'),'the painter uses the saturated candy ramp');
 assert(mod.includes('const FIN=col(3,8,7)'),'fins stay in the body family, as in the references');
 assert(mod.includes('const eye=(x,y,r)=>{ // a dot with one glint'),'dot eyes, never a googly ring');
 assert(!mod.includes('45%,15%'),'the old black ink is gone');
 const rodCss=fs.readFileSync(path.join(__dirname,'..','..','assets','social-fishing.css'),'utf8');
 assert(/\.fishing-rod-art\{filter:drop-shadow/.test(rodCss),'CSS gives the rod icon a tinted aura');
 assert(/@keyframes rod-aura/.test(rodCss),'the top tiers pulse');
 // v299 (owner): a show-off draws once. The local draw and its relayed echo used to stack.
 assert(social.includes('if(m.from!==app.id)'),'our own show-off echo is ignored');
 assert(fs.readFileSync(path.join(__dirname,'..','..','assets','social-scene.js'),'utf8').includes('if(showPool[i].pid===pid)dropShow(i)'),'one show-off sprite per angler');
 // The module can be told to reel in by that dialog.
 assert(/stop:message=>stopFishing\(message\)/.test(mod),'the fishing module exposes stop()');
 assert(mod.includes("typeof opts.announce==='function'"),'a mega/secret catch fires the announce hook');
 assert(/\(sp\.mega\|\|sp\.rarity==='secret'\)/.test(mod),'only mega and secret species are announced');
 // Local-chat announcements: the worker relays, the plaza renders a system line.
 assert(room.includes("m.type==='fishbrag'"),'the room accepts a fish announcement');
 assert(room.includes("type:'fishnote'"),'the room relays it as a fishnote');
 assert(/MAX_FISH_W=5000/.test(room),'the relay clamp follows the new weight ceiling');
 assert(/Math\.min\(MAX_FISH_W,Number\(m\.w\)/.test(room),'a 1.8 t show-off is no longer clamped to 999 kg');
 assert(social.includes("m.type==='fishnote'"),'the plaza listens for fishnote');
 assert(social.includes('function pushFishNote('),'the plaza turns it into a Local line');
 assert(social.includes('function fishingAnnounce('),'binding hands the module an announce callback');
 assert(/announce:fishingAnnounce/.test(social),'the fishing bind receives it');
 assert(/\.social-line-sys/.test(fs.readFileSync(path.join(__dirname,'..','..','assets','social.css'),'utf8')),'system lines have their own style');
 assert(/socialFishLeaveWarning/.test(fs.readFileSync(path.join(__dirname,'..','..','assets','social.css'),'utf8')),'the fishing dialog shares the poker overlay style');
 console.log('PASS social fishing: ponds+chairs, 165-species catalog (155 + 10 MVP) across 25 body plans with rates, luck/weight/mutation gear math, Fishcoin economy, reel physics, bag bounds, show-off round-trip and scene rig; v295 bag tiers 120→500, ten fishing titles, painted rods, public rigs and the Fishing window tabs; v296 rod height follows the character, two-line titles, cheaper bag ladder, scrollable Titles tab and Auto walk-back; v297 100 species with distinct silhouettes, weight giants to 3.0 t (MVP), a poker-style leave-confirm instead of chat nagging, and Local-chat announcements for mega and secret catches; v299 twenty fishing titles, sit/stand that never interrupts fishing, a visible tier aura on every rod and one show-off sprite per angler; v302 139 cropped drawings behind the same fishSprite, with the painted fallback for the other nine; v303 whales and 146 crops at 128px, prices that read rarity+weight, twenty harder titles and an AFK walk-back that never asks; v304/v305 soft rod gates (a cheap rod can still be surprised by a Legendary or a Secret), a fully random index draw with a ~85 h median wall, cheap rods and bags, and Index odds that use the gear you are holding');
})().catch(e=>{console.error(e);process.exitCode=1});
