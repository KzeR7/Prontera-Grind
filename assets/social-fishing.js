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
// v304/v305 (owner): "the last two rarities should be hard - about two weeks to complete the index -
// and it should be random and luck". The old table was .58/.24/.12/.045/.012/.003, which fed a Secret
// every ~600 casts on the best rod and finished the index in an evening. These numbers are solved
// against a target instead: on the Mythril Rod + Royal Jelly a Secret tier bite lands about every 800
// casts (0.126%), and because every species is a plain uniform draw the index is a coupon collector -
// median ~21,300 casts (~85 h) to 155/155 with a long, honest tail. Rods reach up the table
// (ROD_GATE) but the ceiling leaks a little (GATE_ESCAPE), so luck can always surprise you.
const RARITIES=[
 {id:'common',label:'Common',color:'#b9c6c4',weight:.60},
 {id:'uncommon',label:'Uncommon',color:'#7fd98a',weight:.245},
 {id:'rare',label:'Rare',color:'#58a6ff',weight:.145433},
 {id:'legendary',label:'Legendary',color:'#ffb84d',weight:.008343},
 {id:'mythical',label:'Mythical',color:'#c792ea',weight:.000874},
 {id:'secret',label:'Secret',color:'#ff7ab8',weight:.00035},
 {id:'mvp',label:'MVP',color:'#ff2447',weight:0},
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
  ['killi','Meadow Killifish','🐠',90,.1,.6,'deep'],['molly','Moss Molly','🐠',130,.1,.7,'deep'],
  ['platy','Brick Platy','🐠',20,.1,.5,'deep'],['guppy','Gutter Guppy','🐠',300,.05,.35,'deep'],
  // v297 additions - small pond life that mostly adds variety to the index.
  ['mudskip','Mudskipper','🐟',215,.05,.3],['pupfish','Pond Pupfish','🐠',195,.05,.25],
  ['topminnow','Topwater Minnow','🐟',110,.1,.5],['spirlin','Silver Spirlin','🐟',350,.05,.3],
  ['ninespine','Nine-spine Stickle','🐟',75,.05,.45],['dart','Ribbon Dart','🐟',30,.04,.22],
 ],
 uncommon:[
  ['bream','Brass Bream','🐟',40,1,4],['perch','Garden Perch','🐠',70,.8,2.8],
  ['trout','Canal Trout','🐟',190,1.5,5],['crawdad','Rusty Crayfish','🦞',15,.3,1.6],
  ['bass','Bell Bass','🐟',210,1.2,4.5],['catfish','Whisker Catfish','🐟',260,2,7],
  ['reedeel','Reed Eel','🐟',150,.8,3.2,'eel'],['tench','Bronze Tench','🐟',35,1,4.2],
  ['barbel','River Barbel','🐟',220,1.5,6],['ide','Golden Ide','🐟',50,1,3.8],
  ['zander','Dusk Zander','🐟',240,2,6.5],['crab','Paving Crab','🦀',0,.4,2],
  ['mullet','Cloud Mullet','🐟',280,1,3.5],['betta','Dusk Betta','🐠',290,.2,1,'deep'],
  ['angelfin','Plaza Angelfish','🐠',230,.3,1.5,'deep'],['pumpkinseed','Pumpkinseed','🐠',30,.4,1.8,'deep'],
  // v297: gar and snakeheads get their own long-jawed silhouette.
  ['garpike','Spotted Gar','🐟',120,2,7,'gar'],['snakehead','Plaza Snakehead','🐟',150,1.5,6.5,'gar'],
  ['bowfin','Copper Bowfin','🐟',90,1,5,'gar'],['walleye','Glass Walleye','🐟',205,1.5,6,'gar'],['crappie','Calico Crappie','🐠',265,.4,1.8,'deep'],
 ],
 rare:[
  ['koi','Royal Koi','🐠',320,2,8,'deep'],['pike','Knight Pike','🐟',225,3,10,'gar'],
  ['tetra','Crystal Tetra','🐠',260,.4,1.5,'deep'],['sturgeon','Young Sturgeon','🐟',200,3,12],
  ['squid','Pond Squid','🦑',260,1,5],['octo','Puddle Octopus','🐙',310,1.5,6],
  ['lobster','Azure Lobster','🦞',220,1,4.5],['discus','Stained-glass Discus','🐠',10,.6,2.2,'sunfish'],
  ['gar','Longnose Gar','🐟',130,2.5,9],['piranha','Gilded Piranha','🐟',45,1,3.6],
  ['salmon','Sakura Salmon','🐟',340,2.5,9.5],['snapper','Emerald Snapper','🐟',140,1.5,6],
  ['lantern','Lantern Guppy','🐠',55,.3,1.2],
  // v297: the first proper predators - moray, hammerhead, sawfish, blue shark, sturgeon.
  ['morayeel','Canal Moray','🐟',95,2,9,'eel'],['hammerpup','Hammerhead Pup','🦈',210,3,14,'hammer'],
  ['sawfin','Sawfin Ray','🐟',195,4,16,'saw'],['bluefin','Azure Blue Shark','🦈',215,5,18],
  ['sunperch','Ocean Sunperch','🐠',50,6,20,'sunfish'],['ribbonsturgeon','Ribbon Sturgeon','🐟',205,4,17,'sturgeon'],
 ],
 legendary:[
  ['fountainfish','Gilded Fountainfish','🐠',25,1,6],['arowana','Prontera Arowana','🐟',285,4,14],
  ['marlin','Lawn Marlin','🐟',210,8,24],['moonray','Moonlight Ray','🐠',250,5,18,'ray'],
  ['paddlefish','Ghost Paddlefish','🐟',190,6,20,'saw'],['mahi','Prism Mahi','🐠',160,4,15],
  ['coelacanth','Ancient Coelacanth','🐟',230,10,30],['dragonet','Emerald Dragonet','🐠',0,.8,3],
  ['phoenixfish','Ember Phoenixfish','🐠',20,2,9],['oarfish','Banner Oarfish','🐟',265,7,26],
  // v297: thresher and goblin sharks, and the first true freshwater giants.
  ['thresher','Whiptail Thresher','🦈',205,1,1000,'thresher'],['goblin','Goblin Shark','🦈',340,1,1000,'goblin'],
  ['arapaima','Arapaima','🐟',20,30,120,'fish',true],['mekong','Mekong Giant Catfish','🐟',45,50,200,'fish',true],
  ['manta','Plaza Manta','🐟',210,25,110,'ray',true],
 ],
 mythical:[
  ['leviathan','Pond Leviathan','🦈',175,1,1000,'thresher'],['kraken','Garden Kraken','🐙',270,1,1000],
  ['hydrasquid','Hydra Squid','🦑',285,1,1000],['cobblewhale','Cobble Whale','🐋',210,1,1000,'whale'],
  ['angler','Abyss Angler','🐡',260,1,1000,'angler'],['seraphkoi','Seraph Koi','🐠',45,1,1000,'deep'],
  ['baphobass','Baphomet Bass','🐟',0,1,1000,'goblin'],
  // v297/v398: the monsters. All mythical rows weigh 1-1,000 kg, so the show-off scale is consistent
  // and a mythical catch is worth showing off instead of landing at 2 kg next to a 922 kg common.
  ['greatwhite','Great White','🦈',205,1,1000],['stingray','Giant Stingray','🐟',40,1,1000,'ray',true],
  ['sunfish','Ocean Sunfish','🐠',48,1,1000,'sunfish',true],['hammer','Great Hammerhead','🦈',205,1,1000,'hammer',true],
 ],
 secret:[
  ['poring','Poring Puffer','🐡',300,1,1000],['emperium','Emperium Carp','🐠',45,1,1000],
  ['ghostring','Ghostring Fish','🐟',200,1,1000],['angeling','Angeling Jelly','🐙',310,1,1000],
  // v297/v398: the largest fish alive, and the deep oddities that go with them - same 1-1,000 kg scale.
  ['whaleshark','Whale Shark','🦈',205,1,1000,'whale',true],['beluga','Beluga Sturgeon','🐟',205,1,1000,'sturgeon',true],
  ['anglerdeep','Abyssal Angler','🐡',280,1,1000,'angler',true],['colossus','Plaza Colossus','🐙',270,1,1000,'octopus',true],
 ],
 mvp:[
  // v407 (owner): the ten MVP bosses are the owner's own cropped art, renamed and extended from
  // seven. Weight ramps 1.0 t to the 3 t ceiling in this order, so the pond's show-off scale still
  // reads "bigger fish = later in the ladder".
  ['mvp_tidewarden','Tideforged Warden','🦈',170,1000,1500],['mvp_rimewraith','Rimewraith Sovereign','🐉',195,1100,1600],
  ['mvp_tidecourser','Tidebound Courser','🦈',210,1200,1700],['mvp_dreadnought','Dreadnought Reaper','🦈',340,1300,1850],
  ['mvp_thousandeye','Thousand-Eye Ravager','🦈',190,1450,2000],['mvp_auricmaw','Auric Ceremaw','🐙',45,1550,2150],
  ['mvp_worldeye','World-Eye Tortoise','🐢',190,1700,2300],['mvp_volthorn','Volthorn Narwhal','🐋',200,1850,2450],
  ['mvp_dreadclaw','Dreadclaw Behemoth','🦀',18,2050,2650],['mvp_stormcoil','Stormcoil Leviathan','🐉',205,2300,3000],
 ],
};
// v297: a species may name its own body plan (shape) and be flagged mega - the giants that get a
// Local-chat announcement and show off at pond size. Without a shape the glyph decides.
// v302 (owner): a second art drop - sea turtles, seadragons, crystal snails, shrimp and
// amphipods, star-mantled octopuses and a much deeper shark roster. Same tuple shape as
// SPECIES_DATA, with the rarity in the last slot instead of as the group key.
const EXTRA_SPECIES=[
 ['greenshell','Green Shell Turtle','🐢',160,8,30,'whale','uncommon'],
 ['glassback','Glassback Turtle','🐢',190,6,24,'whale','uncommon'],
 ['emberturtle','Ember Shell Turtle','🐢',20,10,34,'whale','rare'],
 ['moonturtle','Moonshell Turtle','🐢',250,9,32,'whale','rare'],
 ['heartback','Heartshell Turtle','🐢',330,7,26,'whale','rare'],
 ['starhull','Starhull Leviathan','🐢',210,20,70,'whale','legendary'],
 ['seahorse','Tidepool Seahorse','🐠',30,0.05,0.3,'fish','common'],
 ['thornhorse','Thornback Seahorse','🐠',340,0.08,0.4,'fish','common'],
 ['leafdragon','Leafy Seadragon','🐠',120,0.1,0.5,'fish','uncommon'],
 ['sunhorse','Sunspine Seahorse','🐠',45,0.09,0.45,'fish','uncommon'],
 ['ribbonhorse','Ribbon Seahorse','🐠',300,0.12,0.6,'fish','uncommon'],
 ['ghosthorse','Ghost Seahorse','🐠',200,0.06,0.35,'fish','rare'],
 ['crownhorse','Crowned Seadragon','🐠',260,0.2,0.9,'fish','rare'],
 ['tidehorse','Tide Dragon','🐠',170,0.3,1.4,'fish','legendary'],
 ['shellsnail','Tide Snail','🐌',200,0.02,0.2,'fish','common'],
 ['gemsnail','Gem Shell Snail','🐌',320,0.03,0.25,'fish','common'],
 ['ambernail','Amber Snail','🐌',35,0.02,0.18,'fish','common'],
 ['glasssnail','Glass Snail','🐌',180,0.03,0.22,'fish','uncommon'],
 ['opalsnail','Opal Snail','🐌',280,0.04,0.3,'fish','uncommon'],
 ['lavasnail','Lava Snail','🐌',10,0.05,0.4,'fish','rare'],
 ['nebulasnail','Nebula Snail','🐌',265,0.06,0.5,'fish','legendary'],
 ['prismsnail','Prism Snail','🐌',300,1,1000,'fish','mythical'],
 ['krill','Glass Krill','🦐',190,0.01,0.08,'shrimp','common'],
 ['candyshrimp','Candy Shrimp','🦐',340,0.02,0.12,'shrimp','common'],
 ['lanternshrimp','Lantern Shrimp','🦐',45,0.02,0.15,'shrimp','uncommon'],
 ['peppershrimp','Pepper Shrimp','🦐',0,0.03,0.18,'shrimp','uncommon'],
 ['royalshrimp','Royal Mantis Shrimp','🦐',275,0.1,0.5,'shrimp','rare'],
 ['voidshrimp','Void Shrimp','🦐',250,0.08,0.42,'shrimp','legendary'],
 ['staropus','Star Octopus','🐙',45,0.4,2.2,'octopus','uncommon'],
 ['candyopus','Candy Octopus','🐙',330,0.5,2.6,'octopus','rare'],
 ['moonopus','Moon Octopus','🐙',250,0.6,3,'octopus','rare'],
 ['galaxyopus','Galaxy Octopus','🐙',275,1,1000,'octopus','mythical'],
 // whales - the seventh sheet, the big ones
 ['rosedolphin','Rosy Dolphin','🐬',335,90,320,'whale','rare'],
 ['sunorca','Sunlit Orca','🐋',25,180,700,'whale','legendary'],
 ['violetbeluga','Violet Beluga','🐋',265,150,560,'whale','legendary'],
 ['azurwhale','Azure Whale','🐋',205,260,900,'whale','legendary'],
 ['greywhale','Greyback Whale','🐋',215,300,950,'whale','legendary'],
 ['mintwhale','Mintback Whale','🐋',150,1,1000,'whale','mythical'],
 ['starwhale','Stardust Whale','🐋',195,1,1000,'whale','mythical'],
 ['catshark','Catshark','🦈',30,2,8,'shark','common'],
 ['hornshark','Horn Shark','🦈',40,3,10,'shark','common'],
 ['nurseshark','Nurse Shark','🦈',20,10,40,'shark','common'],
 ['bamboo','Bamboo Shark','🦈',45,4,14,'shark','uncommon'],
 ['carpetshark','Carpet Shark','🦈',15,6,20,'shark','uncommon'],
 ['leopardshark','Leopard Shark','🦈',35,8,25,'shark','uncommon'],
 ['makoshark','Mako Shark','🦈',210,20,80,'shark','rare'],
 ['porbeagle','Porbeagle','🦈',195,25,90,'shark','rare'],
 ['silvershark','Silverfin Shark','🦈',200,15,60,'shark','rare'],
 ['ghostshark','Ghost Shark','🦈',265,10,40,'shark','rare'],
 ['lanternshark','Lantern Shark','🦈',240,2,9,'shark','rare'],
 ['tigershark','Tiger Shark','🦈',40,1,1000,'shark','legendary'],
 ['greatmaw','Greatmaw','🦈',0,1,1000,'shark','legendary'],
 ['sunshark','Sunspot Shark','🦈',45,1,1000,'shark','legendary'],
 ['abysssaw','Abyssal Sawshark','🦈',215,1,1000,'shark','mythical'],
 ['voidfin','Voidfin Shark','🦈',270,1,1000,'shark','mythical'],
].map(([id,name,glyph,hue,min,max,shape,rarity])=>({id,name,glyph,hue,min,max,shape:shape||null,mega:false,rarity}));
// v304 (owner): the shark line is the boss line now - the big ones moved up a tier (or two), so a
// Great White or a Tiger Shark is an event and the Abyssal Saw is a secret.
const RARITY_OVERRIDE={
 goblin:'mythical', tigershark:'mythical', sunshark:'mythical', greatmaw:'secret',
 porbeagle:'legendary', bluefin:'legendary', silvershark:'legendary', makoshark:'legendary',
 greatwhite:'mythical', thresher:'mythical', voidfin:'secret', abysssaw:'mythical',
 mintwhale:'mythical', starwhale:'mythical', greywhale:'legendary',
};
const SPECIES=[...Object.entries(SPECIES_DATA).flatMap(([rarity,list])=>list.map(([id,name,glyph,hue,min,max,shape,mega])=>({id,name,glyph,hue,min,max,shape:shape||null,mega:mega===true,rarity}))),...EXTRA_SPECIES]
 .map(sp=>RARITY_OVERRIDE[sp.id]?{...sp,rarity:RARITY_OVERRIDE[sp.id]}:sp);
const SPECIES_BY_ID=Object.fromEntries(SPECIES.map(s=>[s.id,s]));
const SPECIES_BY_NAME=Object.fromEntries(SPECIES.map(s=>[s.name,s.id]));
const MAX_W=Math.max(...SPECIES.map(s=>s.max));
// Catch rate with no luck: the rarity's share split evenly across its pool.
function rate(spId){const sp=SPECIES_BY_ID[spId];if(!sp)return 0;const r=RARITIES[RARITY_INDEX[sp.rarity]];return r.weight/SPECIES.filter(x=>x.rarity===sp.rarity).length}
// v304: the Index now prints the odds the angler actually rolls, because the bare-rod numbers are a
// poor description of the game once luck and rod ceilings are in it (a bare Secret reads 1 in 70,000
// while the Mythril Rod hooks one about every 1,700 casts). These two helpers mirror rollCatch
// exactly: the luck exponent, the rod's ceiling clamp, and the tier share each one produces.
const tierShares=(luck,ceiling)=>{
 const e=1+Math.max(0,Math.min(3,Number(luck)||0));
 // Accepts a rarity id or a rod id, so callers can pass whichever they are holding.
 const ceilId=ceiling&&RARITY_INDEX[ceiling]!==undefined?ceiling:(ceiling&&ROD_RANK[ceiling]!==undefined?rodCeiling(ceiling):null);
 const cIdx=ceilId?RARITY_INDEX[ceilId]:RARITIES.length-1;
 const cum=[];let acc=0;
 for(const r of RARITIES){acc=Math.min(1,acc+r.weight);cum.push(Math.pow(acc,e))}
 const out={};
 let heldBack=0;
 for(const r of RARITIES){
  const i=RARITY_INDEX[r.id],lo=i?cum[i-1]:0,natural=cum[i]-lo;
  // Rolls above the ceiling mostly fall back into it; gateChance() of them still bite.
  if(i>cIdx){const p=gateChance(r.id,ceilId);out[r.id]=natural*p;heldBack+=natural*(1-p)}
  else out[r.id]=natural;
 }
 if(ceilId)out[ceilId]+=heldBack;
 return out;
};
// One species' chance per cast with the gear you are holding: its tier's share split across the pool.
function rateWith(spId,luck,ceiling){
 const sp=SPECIES_BY_ID[spId];if(!sp)return 0;
 const share=tierShares(luck,ceiling)[sp.rarity]||0;
 const pool=SPECIES.filter(x=>x.rarity===sp.rarity).length;
 return pool?share/pool:0;
}
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
 // v305 (owner): "i just want fishes hard to catch, not too much to farm on rods" - the v304 ladder
 // (122,100) was six hours of farming. Rods + bags now come to 43,800, about two hours of steady
 // fishing in the 250-casts/h model, so the grind is the fish, not the gear. The ladder still decides
 // how much of the rare table you can reach (ROD_GATE).
 {id:'twig',name:'Training Rod',icon:'🎣',cost:0,luck:0,control:0,strength:0,lure:0},
 {id:'oak',name:'Oak Rod',icon:'🪵',cost:600,luck:.15,control:.1,strength:.1,lure:.1},
 {id:'brass',name:'Brass Rod',icon:'🥉',cost:2000,luck:.3,control:.18,strength:.22,lure:.2},
 {id:'silver',name:'Silver Rod',icon:'🥈',cost:6000,luck:.5,control:.28,strength:.35,lure:.3},
 {id:'golden',name:'Golden Rod',icon:'🥇',cost:16000,luck:.75,control:.38,strength:.5,lure:.45},
 {id:'mythril',name:'Mythril Rod',icon:'💠',cost:40000,luck:1.1,control:.5,strength:.7,lure:.6},
];
const RODS_BY_ID=Object.fromEntries(RODS.map(r=>[r.id,r]));
// v304/v305 (owner): a rod does not only raise luck, it is what lets the boss tiers bite. The cart
// lists the unlock on each rod, and rollCatch holds a roll above the ceiling back most of the time.
const ROD_GATE={rare:'oak',legendary:'silver',mythical:'golden',secret:'mythril',mvp:'mythril'};
// v305 (owner): "give a small little chance for lower rod to catch high rarity fishes". A roll one tier
// above the rod's ceiling gets through 8% of the time, and every tier further up is worth 0.35 of the
// one below it (2.8% for two tiers, 1% for three, 0.34% for four). So a training rod lands a rare now
// and then, an Oak Rod can be surprised by a legendary, and a Secret on anything but the Mythril Rod
// is a genuine one-in-a-million story.
const GATE_ESCAPE=.08,GATE_DECAY=.35;
const gateChance=(tier,ceiling)=>{
 if(!ceiling||RARITY_INDEX[tier]<=RARITY_INDEX[ceiling])return 1;
 return GATE_ESCAPE*Math.pow(GATE_DECAY,RARITY_INDEX[tier]-RARITY_INDEX[ceiling]-1);
};
const ROD_RANK=Object.fromEntries(RODS.map((r,i)=>[r.id,i]));
// The highest rarity a rod can roll, and the rod that lifts a tier.
const rodCeiling=rod=>{
 const rank=ROD_RANK[rod]===undefined?ROD_RANK.twig:ROD_RANK[rod];
 let best='common';
 for(const r of RARITIES)if(ROD_RANK[ROD_GATE[r.id]]===undefined||ROD_RANK[ROD_GATE[r.id]]<=rank)best=r.id;
 return best;
};
const gateRodFor=rid=>ROD_GATE[rid]||null;
const BAITS=[
 // v304 (owner): bait has to be a boost, not a tax - at v303 prices the best bait cost more per cast
 // than it added. Royal Jelly is now the rare-hunter bait (luck 1.5, so ~1.7x the mythical/secret
 // bites of Glow Grub) at 55 a cast, while Glow Grub stays the money/mutation bait. Both are
 // net-positive on the good rods; Jelly trades a few coins an hour for a much faster index.
 {id:'worm',name:'Worm',icon:'🪱',cost:4,luck:.1,weight:0,mutation:1},
 {id:'shrimp',name:'Shrimp Tail',icon:'🦐',cost:12,luck:.25,weight:0,mutation:1},
 {id:'grub',name:'Glow Grub',icon:'🪰',cost:30,luck:.35,weight:0,mutation:2},
 {id:'jelly',name:'Royal Jelly',icon:'🍯',cost:55,luck:1.5,weight:.6,mutation:1.5},
 {id:'chum',name:'Leviathan Chum',icon:'🥩',cost:10000,luck:2,weight:1.2,mutation:2.5,mvpHookBonus:.10,mvpBarBonus:.071},
];
const BAITS_BY_ID=Object.fromEntries(BAITS.map(b=>[b.id,b]));
// v295: ten fishing titles, worn above the head in the plaza. Every requirement is computed
// from the saved fishing blob alone (catches, casts, perfects, species found, best weight,
// mutation kinds), so a title can never be lost by a save migration and never needs a new
// counter that older saves lack. `cur`/`goal` drive the progress text in the Titles tab.
const discoveredSpecies=s=>Object.keys(s&&s.dex?s.dex:{}).filter(k=>s.dex[k]&&s.dex[k].n>0).length;
const bestWeight=s=>Object.values(s&&s.dex?s.dex:{}).reduce((b,d)=>Math.max(b,Number(d&&d.bw)||0),0);
// v311: the bag is read too. A catch that was sold, auto-sold or carried over from a save written
// before mutations were stored on the dex entry still counts - the fish was really caught.
const mutationIds=s=>{const out=new Set(),dex=s&&s.dex?s.dex:{},bag=Array.isArray(s&&s.bag)?s.bag:[];
 for(const d of Object.values(dex))for(const m of (Array.isArray(d&&d.mut)?d.mut:[]))if(m)out.add(m);
 for(const e of bag)if(e&&typeof e.mut==='string'&&e.mut)out.add(e.mut);
 return out;};
const mutationKinds=s=>mutationIds(s).size;
// v299: the ten new titles are derived from the same saved blob, so an old save can earn them too.
const keptMutationFish=s=>Object.values(s&&s.dex?s.dex:{}).reduce((n,d)=>n+(Array.isArray(d&&d.mut)?d.mut.filter(Boolean).length:0),0);
const bestSpeciesCount=s=>Object.values(s&&s.dex?s.dex:{}).reduce((b,d)=>Math.max(b,Number(d&&d.n)||0),0);
const caughtIn=(s,pred)=>SPECIES.filter(sp=>pred(sp)&&s.dex&&s.dex[sp.id]&&s.dex[sp.id].n>0).length;
// v303 (owner): "the requirements are a bit too easy, make them harder and more unique". Every
// counter below moved up by roughly 2.5-5x, and four titles are no longer counters at all - they ask
// for a SHAPE of save rather than a number: a full creel, the whole rod rack, a coin hoard, and a
// mutated mythic. All of it reads the same saved blob, so an old save still earns what it earned.
const rodsOwned=s=>new Set([...(Array.isArray(s&&s.rods)?s.rods:Object.keys((s&&s.rods)||{}).filter(k=>s.rods[k])),'twig']).size;
// v311 (owner: "players with the qualifying fish still don't get Dark Star"). The old test demanded
// a Golden or Prismatic roll on top of a mythical-or-secret roll - about one catch in 100,000 - so
// anglers who had visibly caught a mutated mythic were told they had not. Any mutation on a
// mythical or secret fish now earns the title, and the dex and the bag are both read.
const mutatedMythic=s=>{const dex=s&&s.dex?s.dex:{},bag=Array.isArray(s&&s.bag)?s.bag:[];
 return SPECIES.filter(sp=>(sp.rarity==='mythical'||sp.rarity==='secret')&&(
  (dex[sp.id]&&dex[sp.id].n>0&&Array.isArray(dex[sp.id].mut)&&dex[sp.id].mut.length>0)||
  bag.some(e=>e&&e.sp===sp.id&&typeof e.mut==='string'&&e.mut))).length;};
// v310 (owner: "titles are also mission icons & not arranged rarity"): each title now carries the
// rarity tier it belongs to and its place on that ladder (rank 1-20, easiest first). The list is
// rendered in rank order - Common, Uncommon, Rare, Legendary, Mythical, Secret - with the same
// rarity chip the fish index uses, so the ladder reads at a glance instead of as a mission log.
const FISHING_TITLES=[
 {id:'dockhand',tier:'common',rank:1,name:'Dockhand',mark:'◉',tone:'bronze',cur:s=>s.stats.catches,goal:25,req:'catch 25 fish'},
 {id:'bait-layer',tier:'uncommon',rank:5,name:'Bait Layer',mark:'⌖',tone:'copper',cur:s=>s.stats.catches,goal:150,req:'catch 150 fish'},
 {id:'reed-watcher',tier:'rare',rank:7,name:'Reed Watcher',mark:'⚔',tone:'silver',cur:s=>s.stats.casts,goal:500,req:'make 500 casts'},
 {id:'species-collector',tier:'common',rank:2,name:'Species Collector',mark:'✧',tone:'jade',cur:discoveredSpecies,goal:25,req:'discover 25 species'},
 {id:'perfect-hand',tier:'uncommon',rank:4,name:'Perfect Hand',mark:'★',tone:'sapphire',cur:s=>s.stats.perfects,goal:60,req:'land 60 perfect catches'},
 {id:'heavy-hook',tier:'uncommon',rank:6,name:'Heavy Hook',mark:'⚓',tone:'amethyst',cur:s=>Math.floor(bestWeight(s)),goal:50,req:'record a 50 kg fish'},
 {id:'deep-line',tier:'rare',rank:10,name:'Deep Line',mark:'☾',tone:'obsidian',cur:s=>s.stats.catches,goal:1500,req:'catch 1,500 fish'},
 {id:'mutation-hunter',tier:'legendary',rank:12,name:'Mutation Hunter',mark:'🧬',tone:'crimson',cur:mutationKinds,goal:Object.keys(MUTATIONS).length,req:'find all 7 mutation kinds'},
 {id:'pond-legend',tier:'rare',rank:11,name:'Pond Legend',mark:'✹',tone:'gold',cur:discoveredSpecies,goal:100,req:'discover 100 species'},
 {id:'apex-angler',tier:'secret',rank:19,name:'Apex Angler',mark:'✶',tone:'valkyrie',cur:discoveredSpecies,goal:SPECIES.length,req:`discover all ${SPECIES.length} species`},
 {id:'tide-regular',tier:'legendary',rank:13,name:'Tide Regular',mark:'≈',tone:'tide',cur:s=>s.stats.casts,goal:5000,req:'make 5,000 casts'},
 {id:'line-veteran',tier:'rare',rank:8,name:'Line Veteran',mark:'⚔',tone:'silver',cur:s=>s.stats.catches,goal:1000,req:'catch 1,000 fish'},
 {id:'leviathan-hook',tier:'rare',rank:9,name:'Leviathan Hook',mark:'⚓',tone:'amethyst',cur:s=>Math.floor(bestWeight(s)),goal:250,req:'record a 250 kg fish'},
 {id:'colossus-hook',tier:'mythical',rank:17,name:'Colossus Hook',mark:'⛰',tone:'abyss',cur:s=>Math.floor(bestWeight(s)),goal:800,req:'record an 800 kg fish'},
 {id:'secret-circle',tier:'mythical',rank:16,name:'Secret Circle',mark:'✧',tone:'frost',cur:s=>caughtIn(s,sp=>sp.rarity==='secret'),goal:SPECIES.filter(sp=>sp.rarity==='secret').length,req:`catch a fish from every secret species`},
 {id:'mega-hunter',tier:'legendary',rank:14,name:'Mega Hunter',mark:'✹',tone:'dawn',cur:s=>caughtIn(s,sp=>sp.mega),goal:SPECIES.filter(sp=>sp.mega).length,req:'catch one of every pond monster'},
 // the four that are not counters
 {id:'full-creel',tier:'legendary',rank:15,name:'Full Creel',mark:'🧺',tone:'ember',cur:s=>Number(s.bag&&s.bag.length)||0,goal:500,req:'fill the biggest bag - 500 fish at once'},
 {id:'armoury',tier:'common',rank:3,name:'Armoury',mark:'🪝',tone:'bronze',cur:rodsOwned,goal:6,req:'own all six rods'},
 {id:'coin-hoard',tier:'mythical',rank:18,name:'Coin Hoard',mark:'🪙',tone:'gold',cur:s=>Number(s.coins)||0,goal:50000,req:'hold 50,000 Fishcoins at once'},
 {id:'dark-star',tier:'secret',rank:20,name:'Dark Star',mark:'🌑',tone:'void',cur:mutatedMythic,goal:1,req:'catch a mythical or secret fish with any mutation'},
];
// v310: a painted medal for each title tier - a ribbon, a disc in the rarity colour and a star. It
// replaces the loose glyphs (◉ ⌖ ⚔ ✧ ★ …) that read as quest markers and rendered at a different
// size in every font. Cached per colour, drawn at 64 and laid out at 26 by .fishing-title-badge.
const TITLE_BADGE_CACHE=new Map();
function shade(hex,amt){
 const n=parseInt(String(hex).replace('#',''),16);
 if(!Number.isFinite(n))return hex;
 const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
 const r=clamp(((n>>16)&255)*(1+amt)),g=clamp(((n>>8)&255)*(1+amt)),b=clamp((n&255)*(1+amt));
 return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
}
function titleBadge(color,px=64){
 if(typeof document==='undefined'||!document.createElement)return null;
 let c,g;
 try{c=document.createElement('canvas');c.width=c.height=px;g=c.getContext&&c.getContext('2d')}catch{return null}
 if(!g||typeof g.beginPath!=='function')return null;
 const u=px/100,U=n=>n*u;
 try{
  const ink=shade(color,-.45),light=shade(color,.35);
  // ribbon: two tails behind the disc
  g.fillStyle=ink;
  g.beginPath();g.moveTo(U(30),U(10));g.lineTo(U(48),U(10));g.lineTo(U(44),U(56));g.lineTo(U(33),U(48));g.closePath();g.fill();
  g.beginPath();g.moveTo(U(52),U(10));g.lineTo(U(70),U(10));g.lineTo(U(67),U(48));g.lineTo(U(56),U(56));g.closePath();g.fill();
  // disc
  g.fillStyle=color;g.beginPath();g.arc(U(50),U(60),U(32),0,Math.PI*2);g.fill();
  g.strokeStyle=ink;g.lineWidth=U(5);g.beginPath();g.arc(U(50),U(60),U(32),0,Math.PI*2);g.stroke();
  g.strokeStyle=light;g.lineWidth=U(2.5);g.beginPath();g.arc(U(50),U(60),U(25),0,Math.PI*2);g.stroke();
  // the star
  g.beginPath();
  for(let i=0;i<10;i++){
   const ang=-Math.PI/2+i*Math.PI/5,r=i%2?U(7):U(15);
   const x=U(50)+Math.cos(ang)*r,y=U(60)+Math.sin(ang)*r;
   i?g.lineTo(x,y):g.moveTo(x,y);
  }
  g.closePath();g.fillStyle='rgba(255,255,255,.92)';g.fill();
 }catch{return null}
 return c;
}
function titleBadgeURL(tier,px=64){
 const r=rarityById(tier)||rarityById('common');
 const key=r.color+'|'+px;
 if(TITLE_BADGE_CACHE.has(key))return TITLE_BADGE_CACHE.get(key);
 let url=null;
 const c=titleBadge(r.color,px);
 if(c&&typeof c.toDataURL==='function'){try{url=c.toDataURL('image/png')}catch{url=null}}
 if(url&&!/^data:image\/png/.test(url))url=null;
 TITLE_BADGE_CACHE.set(key,url);
 return url;
}
const FISHING_TITLE_BY_ID=Object.fromEntries(FISHING_TITLES.map(t=>[t.id,t]));
const titleUnlocked=(state,t)=>!!(t&&t.cur(state)>=t.goal);
// Equipping is only ever possible for an earned title; null means "wear no fishing title".
function equipTitle(state,id){
 if(!state)return {ok:false,reason:'unknown'};
 if(id===null||id==='none'){state.title=null;return {ok:true,title:null}}
 const t=FISHING_TITLE_BY_ID[id];
 if(!t)return {ok:false,reason:'unknown'};
 if(!titleUnlocked(state,t))return {ok:false,reason:'locked'};
 state.title=t.id;
 return {ok:true,title:t.id};
}
// The name worn above the head. Falls back to null when nothing is equipped or it is not earned.
function equippedTitle(state){
 const t=state&&state.title?FISHING_TITLE_BY_ID[state.title]:null;
 return titleUnlocked(state,t)?t:null;
}
// Reel feel per rarity: control-bar width, fish wander speed, dash chance, fill/drain per second.
const DIFF={
 common:{bar:.34,speed:.42,dash:.16,fill:.165,drain:.1},
 uncommon:{bar:.31,speed:.52,dash:.22,fill:.15,drain:.105},
 rare:{bar:.28,speed:.62,dash:.32,fill:.135,drain:.11},
 legendary:{bar:.25,speed:.74,dash:.44,fill:.12,drain:.115},
 mythical:{bar:.22,speed:.86,dash:.56,fill:.108,drain:.12},
 secret:{bar:.24,speed:.8,dash:.5,fill:.112,drain:.118},
 // MVP keeps its fast, erratic fish and slow progress bar, but the control window is wide enough
 // for Auto to win a reel about 3.3%→16.7% from Training→Mythril Rod. The separate 30% landing
 // roll below therefore makes a hooked MVP about 1%→5% on Auto, while a manual angler still has
 // to play this reel and then pass the same landing roll.
 mvp:{bar:.26,speed:1.05,dash:.72,fill:.085,drain:.14},
};
// v304 (owner): v303's prices were tuned against the old (looser) rarity weights. Cutting the top
// tiers made an average catch worth a quarter of what it was, so the base values scale ~6x to put
// income back where the shop ladder assumes it is (about 40 coins a catch on a training rod,
// 160 on mythril + Royal Jelly).
const RARITY_VALUE={common:18,uncommon:48,rare:120,legendary:360,mythical:1200,secret:3600,mvp:9000};
// v295: the bag is upgradeable. Tier 0 is the v288 bag (120) and is always owned; each later
// tier is bought once with Fishcoins and is permanent, exactly like a rod. BAG_MAX stays the
// base capacity so older callers and saves keep working, and bagMax(state) is the live cap.
const BAG_TIERS=[
 {tier:0,cap:120,cost:0,label:'Canvas Satchel'},
 {tier:1,cap:200,cost:900,label:'Reinforced Creel'},
 {tier:2,cap:300,cost:2100,label:'Angler\'s Basket'},
 {tier:3,cap:400,cost:4500,label:'Deep Keep-Net'},
 {tier:4,cap:500,cost:9750,label:'Bottomless Creel'},
 {tier:5,cap:750,cost:15200,label:'Ocean Hold'},
 {tier:6,cap:1000,cost:24000,label:'Aether Keep'},
];
const BAG_MAX=BAG_TIERS[0].cap,COIN_MAX=1e9,CAST_GREEN=[.82,.96],CAST_PERFECT=[.87,.93];
const bagTierOf=state=>{const t=state&&Number.isInteger(state.bagTier)?state.bagTier:0;return BAG_TIERS[Math.max(0,Math.min(BAG_TIERS.length-1,t))]};
const bagMax=state=>bagTierOf(state).cap;
const nextBagTier=state=>BAG_TIERS[bagTierOf(state).tier+1]||null;
const speciesById=id=>SPECIES_BY_ID[id]||null;
const rarityById=id=>RARITIES[RARITY_INDEX[id]]||RARITIES[0];
// v303 (owner): a price that reads all three of the things it should. Rarity sets the base, how
// close this specimen is to its species' record scales that base, and the catch's own absolute
// weight adds worth of its own - which is the part that was missing: a 40 kg nurse shark used to sell
// for single digits just because its rarity is common. Mutations still multiply the whole thing.
const weightWorth=w=>2.2*Math.pow(Math.max(0,Number(w)||0),.82);
function value(e){
 const sp=speciesById(e&&e.sp);if(!sp)return 0;
 const w=Math.max(0,Number(e.w)||0);
 const heft=Math.max(0,Math.min(1,(w-sp.min)/Math.max(.01,sp.max-sp.min)));
 const mult=e.mut&&MUTATIONS[e.mut]?MUTATIONS[e.mut].mult:1;
 const rarityPart=(RARITY_VALUE[sp.rarity]||3)*(0.6+0.8*heft);
 return Math.max(1,Math.round((rarityPart+weightWorth(w))*mult));
}
// Luck bends the rarity roll toward the rare end; strength bends weight heavier; mutation odds scale.
// A PERFECT cast rolls rarity twice and keeps the better roll; it never makes a roll worse.
function rollCatch(rng=Math.random,boost=false,mods){
 const luck=Math.max(0,Math.min(3,(mods&&mods.luck)||0));
 const wb=Math.max(0,Math.min(3,(mods&&mods.weight)||0));
 const mm=Math.max(0,Math.min(6,(mods&&mods.mutation)||1));
 const pick=()=>{const r=Math.pow(rng(),1/(1+luck));let acc=0;for(const t of RARITIES){acc+=t.weight;if(r<acc)return t.id}return 'common'};
 // The rod decides which tiers can bite, but the ceiling is a filter, not a wall: a roll above it
 // slips through GATE_ESCAPE of the time. That is the owner's "small chance for a lower rod to catch a
 // high rarity fish" - an Oak Rod hooks a Legendary now and then, it just takes far more casts.
 const rod=mods&&typeof mods.rod==='string'?mods.rod:null;
 const ceiling=rod?rodCeiling(rod):null;
 const clamp=rid=>ceiling&&RARITY_INDEX[rid]>RARITY_INDEX[ceiling]&&rng()>=gateChance(rid,ceiling)?ceiling:rid;
 let rid=clamp(pick());
 if(boost){const other=clamp(pick());if(RARITY_INDEX[other]>RARITY_INDEX[rid])rid=other}
 // The species inside the tier is a plain uniform draw, every time: no repeat protection anywhere.
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
function makeReel(fish,rng,control,barBonus=0){
 const d=DIFF[fish.rarity]||DIFF.common,sp=speciesById(fish.sp);
 const heft=sp?Math.max(0,Math.min(1,(fish.w-sp.min)/Math.max(.01,sp.max-sp.min))):.5;
 // MVP needed a much larger base window for a starter rod without making Mythril automatic.
 // Compressing only its rod-control multiplier keeps the measured Auto landing ladder near 1%→5%;
 // every ordinary rarity retains the old control formula byte-for-byte.
 const isMvp=fish.rarity==='mvp';
 const rGen=rng||Math.random;
 // Normal Mythril rod (control >= 0.5): ~22% proc chance for "Lucky Focus" widening the bar,
 // subtly improving bare Mythril auto reel win rate to ~20% (~6% landed).
 const luckyFocus=isMvp&&(control>=.5)&&(rGen()<0.22);
 const effectiveBarBonus=barBonus>0?(barBonus+(luckyFocus?0.025:0)):(luckyFocus?0.04:0);
 const controlScale=isMvp?(barBonus>0?0.125:0.22):1;
 const randomBoost=isMvp?(rGen()*0.008):0;
 const baseBar=isMvp?(d.bar*(1+effectiveBarBonus)+randomBoost):d.bar;
 const barW=Math.min(.5,baseBar*(1+Math.max(0,Math.min(.8,control||0))*controlScale));
 return {bar:.5,vel:0,barW,fish:.5,fishVel:0,target:.5,swapIn:.5,speed:d.speed*(1+heft*.25),dash:d.dash,fill:d.fill,drain:d.drain,progress:.33,lock:1.1,t:0,on:true,perfect:true,luckyFocus:!!luckyFocus,rng:rGen};
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
  w:Math.round(Math.max(.01,Math.min(3000,Number(e.w)||sp.min))*100)/100,
  mut:Object.hasOwn(MUTATIONS,e.mut)?e.mut:null,
  at:Math.max(0,Math.floor(Number(e.at)||0)),
  perfect:e.perfect===true,
  lock:e.lock===true,
 };
}
// Accepts any stored shape (including corruption) and returns a safe fishing blob.
function normalize(raw){
 const f=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const bag=[],ids=new Set();
 for(const e of (Array.isArray(f.bag)?f.bag:[]).map(cleanEntry).filter(Boolean).slice(-BAG_TIERS[Math.max(0,Math.min(BAG_TIERS.length-1,Math.floor(Number(f.bagTier)||0)))].cap)){
  while(ids.has(e.id))e.id='f'+Math.random().toString(36).slice(2,10);
  ids.add(e.id);bag.push(e);
 }
 const dex={};
 if(f.dex&&typeof f.dex==='object'&&!Array.isArray(f.dex))for(const sp of SPECIES){
  const d=f.dex[sp.id];
  if(d&&typeof d==='object')dex[sp.id]={n:cnt(d.n),bw:Math.round(Math.max(0,Math.min(3000,Number(d.bw)||0))*100)/100,at:Math.max(0,Math.floor(Number(d.at)||0)),mut:[...new Set((Array.isArray(d.mut)?d.mut:[]).filter(m=>Object.hasOwn(MUTATIONS,m)))]};
 }
 const st=f.stats&&typeof f.stats==='object'?f.stats:{};
 const se=f.settings&&typeof f.settings==='object'?f.settings:{};
 const rods=[...new Set(['twig',...(Array.isArray(f.rods)?f.rods:[]).filter(r=>Object.hasOwn(RODS_BY_ID,r))])];
 const bait={};
 if(f.bait&&typeof f.bait==='object'&&!Array.isArray(f.bait))for(const b of BAITS){const n=cnt(f.bait[b.id]);if(n)bait[b.id]=Math.min(999,n)}
 return {
  v:1,bag,dex,
  stats:{casts:cnt(st.casts),catches:cnt(st.catches),escapes:cnt(st.escapes),perfects:cnt(st.perfects)},
  settings:{fish:true,sound:se.sound!==false,autoSell:se.autoSell===true},
  coins:cnt(f.coins),
  rods,
  rod:typeof f.rod==='string'&&rods.includes(f.rod)?f.rod:'twig',
  bait,
  baitSel:typeof f.baitSel==='string'&&Object.hasOwn(BAITS_BY_ID,f.baitSel)?f.baitSel:null,
  // v295: permanent bag upgrade tier and the equipped fishing title.
  bagTier:Math.max(0,Math.min(BAG_TIERS.length-1,Math.floor(Number(f.bagTier)||0))),
  title:typeof f.title==='string'&&FISHING_TITLE_BY_ID[f.title]?f.title:null,
  // v422: the one-catch-per-spawn MVP marker persists in the save. A spawn lives ten minutes and a
  // room spawns one every hour or two, so the newest 32 ids cover days of fishing; older entries
  // can never recur, so trimming them is not a second chance.
  mvpCaught:[...new Set((Array.isArray(f.mvpCaught)?f.mvpCaught:[]).filter(id=>typeof id==='string'&&id.length<=40&&/^mvp:[a-z0-9]+:[a-z0-9]+$/.test(id)))].slice(-32),
 };
}
// v295: buying a bag tier spends Fishcoins once and raises the cap permanently. Buying is
// strictly sequential, so a tampered tier can never skip a rung or hand out free capacity.
function buyBagUpgrade(state){
 if(!state)return {ok:false,reason:'unknown'};
 const next=nextBagTier(state);
 if(!next)return {ok:false,reason:'max'};
 if(state.coins<next.cost)return {ok:false,reason:'coins'};
 state.coins-=next.cost;
 state.bagTier=next.tier;
 return {ok:true,tier:next.tier,cap:next.cap};
}

// Every landed fish is recorded in the Index even when storage is full. The previous early return
// happened before dex update, so a player could visibly catch a Secret fish and still see “???”
// forever. Returns the stored entry, or null only when the bag cannot keep it.
function addCatch(state,c,now=Date.now()){
 if(!state)return null;
 const sp=speciesById(c.sp);if(!sp)return null;
 let id='f'+now.toString(36)+Math.floor(Math.random()*46656).toString(36);
 while(state.bag.some(e=>e.id===id))id+='x';
 const entry={id,sp:sp.id,w:Math.round(Math.max(.01,Math.min(3000,Number(c.w)||sp.min))*100)/100,mut:Object.hasOwn(MUTATIONS,c.mut)?c.mut:null,at:now,perfect:c.perfect===true,lock:false};
 const d=state.dex[entry.sp]||(state.dex[entry.sp]={n:0,bw:0,at:now,mut:[]});
 d.n++;if(entry.w>d.bw)d.bw=entry.w;if(entry.mut&&!d.mut.includes(entry.mut))d.mut.push(entry.mut);
 state.stats.catches++;if(entry.perfect)state.stats.perfects++;
 if(state.bag.length>=bagMax(state))return null;
 state.bag.push(entry);return entry;
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
 if(state.bag[i].lock)return {ok:false,reason:'locked'};
 const coins=value(state.bag[i]);
 state.bag.splice(i,1);
 state.coins=Math.min(COIN_MAX,state.coins+coins);
 return {ok:true,coins};
}
// 'dupes' keeps the heaviest of each species plus every mutated fish; 'all' sells everything.
// v294: 🔒 locked fish are never sold by either mode.
function sellBulk(state,mode){
 if(!state)return {sold:0,coins:0};
 const keep=new Set(state.bag.filter(e=>e.lock).map(e=>e.id));
 if(mode!=='all'){
  for(const e of state.bag)if(e.mut)keep.add(e.id);
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
// Explicit bulk-sale filter: locks are absolute; records are protected unless the player opts in.
function sellFiltered(state,filter={}){
 if(!state)return {sold:0,coins:0};
 const rarities=new Set(Array.isArray(filter.rarities)?filter.rarities.filter(id=>Object.hasOwn(RARITY_INDEX,id)):[]);
 if(!rarities.size)return {sold:0,coins:0};
 const mutation=Object.hasOwn(MUTATIONS,filter.mutation)?filter.mutation:filter.mutation||'any';
 const best=new Map();for(const e of state.bag){const old=best.get(e.sp);if(!old||e.w>old.w)best.set(e.sp,e)}
 const keep=new Set(state.bag.filter(e=>e.lock).map(e=>e.id));
 if(filter.includeBest!==true)for(const e of best.values())keep.add(e.id);
 let sold=0,coins=0;
 state.bag=state.bag.filter(e=>{
  const sp=speciesById(e.sp),matches=sp&&rarities.has(sp.rarity)&&(
   mutation==='any'||(mutation==='none'?!e.mut:mutation==='mutated'?!!e.mut:e.mut===mutation)
  );
  if(!matches||keep.has(e.id))return true;
  sold++;coins+=value(e);return false;
 });
 state.coins=Math.min(COIN_MAX,state.coins+coins);
 return {sold,coins};
}
// v294: per-fish keep-lock. A locked fish cannot be sold (single, bulk or auto) or released.
function toggleLock(state,entryId){
 const e=state&&state.bag.find(x=>x.id===entryId);if(!e)return null;
 e.lock=!e.lock;
 return {ok:true,lock:e.lock};
}
// v294 auto-sell: applies the Sell-dupes rule to each fresh catch. A catch is kept when it is
// mutated, locked, or your heaviest of its species (new species are always your heaviest);
// otherwise it is a dupe and goes straight to Fishcoins.
function shouldAutoSell(state,entry){
 if(!state||!entry||!state.settings.autoSell)return false;
 if(entry.lock||entry.mut)return false;
 return state.bag.some(e=>e.id!==entry.id&&e.sp===entry.sp&&e.w>=entry.w);
}
// Show-off text comes only from a fish that is actually in the bag.
function showOffText(state,entryId){
 const e=state&&state.bag.find(x=>x.id===entryId);if(!e)return null;
 const sp=speciesById(e.sp),r=rarityById(sp.rarity);
 const mut=e.mut?MUTATIONS[e.mut].badge+' '+MUTATIONS[e.mut].label+' ':'';
 return `🎣 shows off a ${mut}${sp.name} — ${e.w} kg (${r.label}${e.perfect?' · Perfect catch ⭐':''})!`;
}
// v295: the show-off travels as data, not as a Local-chat line. Returns the exact fish (never a
// fish that is not in the bag) in the compact shape the worker relays to the room.
function showOffData(state,entryId){
 const e=state&&state.bag.find(x=>x.id===entryId);if(!e)return null;
 const sp=speciesById(e.sp);if(!sp)return null;
 return {sp:sp.id,w:e.w,mut:e.mut||null,perfect:e.perfect===true};
}
// A relayed show-off is only ever drawn from validated fields; anything unknown renders nothing.
function cleanShowOff(raw){
 if(!raw||typeof raw!=='object')return null;
 const sp=speciesById(raw.sp);if(!sp)return null;
 // Same contract as the worker: a weight that is not a positive number is not a fish.
 const w0=Number(raw.w);
 if(!Number.isFinite(w0)||w0<=0)return null;
 const w=Math.round(Math.max(.01,Math.min(3000,w0))*100)/100;
 return {sp:sp.id,w,mut:Object.hasOwn(MUTATIONS,raw.mut)?raw.mut:null,perfect:raw.perfect===true};
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
 if(!Number.isFinite(w)||w<=0||w>3000)return null;
 return {sp:spId,w:Math.round(w*100)/100,mut};
}
// Overhead sprite scale from weight. v304 flattened nothing but still topped out at 11 units after a
// square root; v311 pins the ladder to the pond instead of to a magic number.
function showOffScale(w){
 // v311 (owner: "a 922 kg fish looks small next to the pond - the max is 1000 kg, it should be as
 // big as the pond"). One curve from a minnow to the pond itself: at the 1,000 kg ceiling the fish
 // is 13 units across in a 13 x 18 pond, 922 kg reads ~8.5 and a 50 kg fish ~1.5, so
 // the ladder never flattens out the way the old x/(x+6) and sqrt curves did at the top end.
 // The pond is 13 units deep and 18 wide; 3,000 kg (the MVP ceiling) is the fish that
 // fills it, and the whale-shark class now scales to that cap.
 const x=Math.max(.01,Math.min(3000,Number(w)||.01));
 return Math.round(Math.min(13,0.7+12.3*Math.pow(x/3000,.55))*100)/100;
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
 tab:'bag',auto:false,autoNext:0,autoPower:.8,autoHookAt:0,autoSampleAt:0,autoTarget:.5,rigTarget:null,walkT0:0,sellFilter:{rarities:[],mutation:'any',includeBest:false}};
// MVP fishing: active spawn from the Social Worker, one catch per spawn per player.
let mvpActive=null; // {sp,id,spawnedAt,endsAt,mode,room,identity}
const MVP_EVENT_LIMIT=256,MVP_SCOPE_LIMIT=128,mvpEventHistory=new Map(),mvpScopeLatest=new Map();
let mvpClockOffset=0,mvpClockServerAt=0;
function mvpScope(data={},options={}){
 const mode=options.mode||data.mode||(Number.isInteger(Number(options.room??data.room))&&Number(options.room??data.room)>0?'plaza':'solo');
 const room=mode==='plaza'?Number(options.room??data.room):0;
 if(!['solo','plaza'].includes(mode)||(mode==='plaza'&&(!Number.isInteger(room)||room<1)))return null;
 return {mode,room};
}
function mvpIdentity(scope,id){return scope.mode+'|'+scope.room+'|'+id}
function mvpScopeKey(scope){return scope.mode+'|'+scope.room}
function rememberMvpScope(key,entry){mvpScopeLatest.delete(key);mvpScopeLatest.set(key,entry);while(mvpScopeLatest.size>MVP_SCOPE_LIMIT)mvpScopeLatest.delete(mvpScopeLatest.keys().next().value)}
function mvpNow(mode='solo'){return Date.now()+(mode==='plaza'?mvpClockOffset:0)}
function observeMvpClock(serverNow){
 if(!Number.isFinite(serverNow)||serverNow<mvpClockServerAt)return;
 mvpClockServerAt=serverNow;mvpClockOffset=serverNow-Date.now();
}
function rememberMvp(identity,entry){
 mvpEventHistory.delete(identity);mvpEventHistory.set(identity,entry);
 while(mvpEventHistory.size>MVP_EVENT_LIMIT)mvpEventHistory.delete(mvpEventHistory.keys().next().value);
}
function mvpAnnouncement(kind,data){
 const sp=speciesById(data.sp),name=sp?sp.name:data.sp;
 const text=kind==='spawn'?`⚠️ MVP ${name} has spawned at the pond! 10-minute window — reel it in!`:`The MVP ${name} has fled the pond.`;
 if(opts&&typeof opts.mvpNotice==='function')opts.mvpNotice(kind,text,data);
 else if(opts&&typeof opts.notice==='function')opts.notice(text);
}
// v422: the claimed marker lives IN THE SAVE (state().mvpCaught) - a reload used to wipe this
// in-memory Set and the same spawn could be caught again. The Set is only a lookup cache for the
// save's array, rebuilt whenever the fishing state OBJECT changes (reload, account switch, cloud
// adopt), so one account's marker can never leak into another's session either.
let mvpClaimedState=null,mvpClaimedSet=new Set();
const mvpClaimed=()=>{const st=state();if(mvpClaimedState!==st){mvpClaimedState=st;mvpClaimedSet=new Set(Array.isArray(st.mvpCaught)?st.mvpCaught:[])}return mvpClaimedSet};
// `persistNow=false` lets finishReel place the marker in the same durable economic snapshot as
// the catch/index/auto-sale. The standalone public helper keeps its old immediate-save behaviour.
function markMvpClaimed(id,persistNow=true){const st=state();mvpClaimed().add(id);st.mvpCaught=[...mvpClaimedSet].slice(-32);mvpClaimedSet=new Set(st.mvpCaught);if(persistNow)persist();return true}
const MVP_HOOK_CHANCE=.10,MVP_REEL_CATCH_CHANCE=.30,AUTO_REEL_SAMPLE_MS=130;
// Kept pure and exported so the odds test drives the same predictive aim used by live Auto fishing.
const autoReelTarget=s=>s.fish+s.fishVel*.18;
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
 return R().pondDistance(p,s.x,s.z);
}
function standPoint(p,s){
 // v309 (owner: "can u fix to fish on the bridge & on the rocks?"): the pond's own fishing places
 // come first - the bridge crown is a stand you can really fish from - and the crag behind them is
 // solid, so the walk no longer ends inside the rock face.
 const props=(R().POND_PROPS||[])[ui.pond];
 const stands=props&&Array.isArray(props.stands)?props.stands:[];
 // The stand nearest the water you clicked wins, with a half-weight nudge toward the angler so a
 // click straight across the pond does not send you the long way round.
 const me=(()=>{try{return selfPos()||s}catch{return s}})();
 const score=c=>Math.hypot(c.x-s.x,c.z-s.z)+.15*Math.hypot(c.x-me.x,c.z-me.z);
 const nearest=stands.filter(c=>R().walkable(c.x,c.z)).sort((a,b)=>score(a)-score(b))[0];
 if(nearest)return {x:nearest.x,z:nearest.z};
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
 dock.innerHTML='<div id="fishingDockHead" title="Drag to move"><span id="fishingSpot">🎣 South Lawn Pond</span><span id="fishingDockBtns"><button id="fishingAutoBtn" type="button" title="Auto fishing: casts, hooks and reels by itself until you stop it" aria-pressed="false">▶ Auto</button><button id="fishingBagBtn" type="button" aria-haspopup="dialog">🧺 Bag <small id="fishingBagCount"></small></button><button id="fishingStopBtn" type="button" title="Stop fishing" aria-label="Stop fishing">✕</button></span></div><div id="fishingMvpBanner" hidden aria-live="polite"></div><button id="fishingGearLine" type="button" title="Open the rod &amp; bait shop"></button><div id="fishingStage" role="button" tabindex="0" aria-label="Fishing action area"></div><p id="fishingStatus" aria-live="polite"></p>';
 // v380 (fix): the spawn banner is created here with the rest of the fishing DOM - it used to
 // be read from index.html where no such element existed, so live MVP notices never rendered.
 const mvpBanner=doc.createElement('div');mvpBanner.id='fishingMvpBanner';mvpBanner.hidden=true;mvpBanner.setAttribute('role','status');mvpBanner.setAttribute('aria-live','polite');
 // v384: the alert joins the plaza's top-centre column (social.js) so it stacks with the battle card and notices
 // instead of covering them; a page without that column keeps the old placement.
 (doc.getElementById('socialHudStack')||hub).append(mvpBanner);
 const panel=doc.createElement('section');panel.id='fishingPanel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Fishing Bag');
 panel.innerHTML='<header id="fishingPanelHead" title="Drag to move"><strong>🎣 Fishing</strong><span id="fishingCoins" title="Fishcoins — sell catches to earn, spend on rods &amp; bait"></span><button id="fishingPanelClose" type="button" aria-label="Close Fishing window">✕</button></header><nav id="fishingTabs" role="tablist" aria-label="Fishing sections"><button type="button" role="tab" data-ftab="bag" aria-selected="true">🧺 Bag</button><button type="button" role="tab" data-ftab="index" aria-selected="false">📖 Index</button><button type="button" role="tab" data-ftab="shop" aria-selected="false">🛒 Shop</button><button type="button" role="tab" data-ftab="titles" aria-selected="false">🏅 Titles</button></nav><div id="fishingBagView"><div id="fishingRecords"></div><div id="fishingTools"><select id="fishingSort" aria-label="Sort fish"><option value="new">Newest</option><option value="heavy">Heaviest</option><option value="rare">Rarest</option><option value="value">Most valuable</option></select><button id="fishingSellDupes" type="button" title="Sells everything except your heaviest of each species, every mutated fish and every 🔒 locked fish">💰 Sell dupes</button><button id="fishingSellRare" type="button" title="Sell every Rare fish in the bag (locked fish are kept)">💎 Sell all Rare</button><button id="fishingSellMythic" type="button" title="Sell every Mythical fish in the bag (locked fish are kept)">👑 Sell all Mythical</button><button id="fishingSellSecret" type="button" title="Sell every Secret fish in the bag (locked fish are kept)">✨ Sell all Secret</button><button id="fishingSellMvp" type="button" title="Sell every MVP fish in the bag (locked fish are kept)">🦈 Sell all MVP</button><label title="After every catch, automatically sell it unless it is mutated, locked, or your new heaviest of that species"><input type="checkbox" id="fishingAutoSell"> Auto-sell dupes</label><label title="Fishing sound effects"><input type="checkbox" id="fishingSound"> Sounds</label></div><details id="fishingSellFilter"><summary>Sell by rarity &amp; mutation</summary><div id="fishingSellFilterPanel"><fieldset id="fishingSellRarities"><legend>Rarities to sell</legend></fieldset><label>Mutation <select id="fishingSellMutation"></select></label><label title="Also sell the heaviest fish of each species"><input type="checkbox" id="fishingSellBest"> Include best records</label><button id="fishingSellFiltered" type="button">Sell matching</button><small>Locked fish are always kept.</small></div></details><div id="fishingGrid" role="listbox" aria-label="Caught fish"></div><footer id="fishingDetail" hidden></footer></div><div id="fishingIndexView" hidden></div><div id="fishingShopView" hidden></div><div id="fishingTitlesView" hidden></div>';
 const rarityFilters=panel.querySelector('#fishingSellRarities');
 if(rarityFilters)rarityFilters.insertAdjacentHTML('beforeend',RARITIES.map(r=>`<label><input type="checkbox" data-sell-rarity="${r.id}"> ${esc(r.label)}</label>`).join(''));
 const mutationFilter=panel.querySelector('#fishingSellMutation');
 if(mutationFilter)mutationFilter.innerHTML='<option value="any">Any mutation</option><option value="none">Unmutated only</option><option value="mutated">Any mutated fish</option>'+Object.entries(MUTATIONS).map(([id,m])=>`<option value="${id}">${esc(m.label)}</option>`).join('');
 const shakes=doc.createElement('div');shakes.id='fishingShakes';shakes.hidden=true;
 // v290: the toolbar button opens this menu instead of instantly walking to a pond. Start
 // fishing is an explicit choice; Bag / Index / Shop open anywhere in the plaza, no walking.
 const menu=doc.createElement('div');menu.id='fishingMenu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Fishing menu');
 if(REDUCED()){dock.classList.add('reduced');shakes.classList.add('reduced')}
 hub.append(dock,panel,shakes,menu);
 // The chat is outside the hub's stacking context. On narrow screens it can cover the
 // Fishing window, so mirror the window's actual hidden state for the mobile stylesheet.
 // Observe the attribute rather than only toggleBag(): another hub panel can close it too.
 if(doc.body&&typeof root.MutationObserver==='function'){
  new root.MutationObserver(()=>doc.body.classList.toggle('social-fishing-panel-open',!panel.hidden))
   .observe(panel,{attributes:true,attributeFilter:['hidden']});
 }
 els={hub,dock,panel,shakes,menu,stage:doc.getElementById('fishingStage'),status:doc.getElementById('fishingStatus'),grid:doc.getElementById('fishingGrid'),records:doc.getElementById('fishingRecords'),detail:doc.getElementById('fishingDetail'),bagCount:doc.getElementById('fishingBagCount'),spot:doc.getElementById('fishingSpot'),gearLine:doc.getElementById('fishingGearLine'),coins:doc.getElementById('fishingCoins'),bagView:doc.getElementById('fishingBagView'),indexView:doc.getElementById('fishingIndexView'),shopView:doc.getElementById('fishingShopView'),titlesView:doc.getElementById('fishingTitlesView'),autoBtn:doc.getElementById('fishingAutoBtn'),mvpBanner:doc.getElementById('fishingMvpBanner')};
 doc.getElementById('fishingStopBtn').onclick=()=>stopFishing();
 doc.getElementById('fishingBagBtn').onclick=()=>toggleBag();
 doc.getElementById('fishingPanelClose').onclick=()=>toggleBag(false);
 doc.getElementById('fishingSort').onchange=e=>{ui.sort=e.target.value;renderBag()};
doc.getElementById('fishingSellDupes').onclick=()=>{if(updatingPaused())return;const r=sellBulk(state(),'dupes');persist();if(r.sold){sound('coin');status(`Sold ${r.sold} fish for ${fmt(r.coins)} Fishcoins.`)}else status(state().settings.autoSell?'Nothing to sell — auto-sell is on, so dupes never pile up.':'Nothing to sell — every fish is a record, mutated or locked.');ui.selected=null;renderPanel();renderDockGear()};
const quickSell=(rarity)=>{const r=sellFiltered(state(),{rarities:[rarity]});persist();if(r.sold){sound('coin');status(`Sold ${r.sold} ${rarity} fish for ${fmt(r.coins)} Fishcoins.`)}else status(`No ${rarity} fish to sell — locked fish and best records are kept.`);ui.selected=null;renderPanel();renderDockGear()};
doc.getElementById('fishingSellRare').onclick=()=>quickSell('rare');
doc.getElementById('fishingSellMythic').onclick=()=>quickSell('mythical');
doc.getElementById('fishingSellSecret').onclick=()=>quickSell('secret');
doc.getElementById('fishingSellMvp').onclick=()=>quickSell('mvp');
panel.querySelectorAll('[data-sell-rarity]').forEach(input=>input.onchange=()=>{ui.sellFilter.rarities=[...panel.querySelectorAll('[data-sell-rarity]:checked')].map(x=>x.dataset.sellRarity)});
 doc.getElementById('fishingSellMutation').onchange=e=>{ui.sellFilter.mutation=e.target.value};
 doc.getElementById('fishingSellBest').onchange=e=>{ui.sellFilter.includeBest=e.target.checked};
 doc.getElementById('fishingSellFiltered').onclick=()=>{
  if(updatingPaused())return;
  const r=sellFiltered(state(),ui.sellFilter);persist();
  if(r.sold){sound('coin');status(`Sold ${r.sold} matching fish for ${fmt(r.coins)} Fishcoins.`)}
  else status(ui.sellFilter.rarities.length?'No eligible fish match — locked fish and best records are protected.':'Choose at least one rarity to sell.');
  ui.selected=null;renderPanel();renderDockGear();
 };
 doc.getElementById('fishingAutoSell').onchange=e=>{if(updatingPaused()){e.target.checked=!!state().settings.autoSell;return}state().settings.autoSell=e.target.checked;persist();status(e.target.checked?'Auto-sell on — dupes are sold as you catch them (records, mutations and 🔒 locked fish are kept).':'Auto-sell off.')};
 doc.getElementById('fishingSound').onchange=e=>{if(updatingPaused()){e.target.checked=!!state().settings.sound;return}state().settings.sound=e.target.checked;persist()};
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
  `<button type="button" role="menuitem" data-fm="bag">🧺 Fishing Bag<small>${st.bag.length}/${bagMax(st)} · show off from anywhere</small></button>`+
  `<button type="button" role="menuitem" data-fm="index">📖 Fish Index<small>${Object.keys(st.dex).filter(k=>st.dex[k].n>0).length}/${SPECIES.length} discovered · catch rates</small></button>`+
  `<button type="button" role="menuitem" data-fm="shop">🛒 Tackle Shop<small>${COIN_HTML} ${fmt(st.coins)}</small></button>`;
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
function mvpTimeLeft(){if(!mvpActive)return 0;return Math.max(0,Math.floor((mvpActive.endsAt-mvpNow(mvpActive.mode))/1000))}
function renderMvpBanner(){
 if(!els||!els.mvpBanner)return;
 if(!mvpActive){els.mvpBanner.hidden=true;els.mvpBanner.textContent='';return}
 const sp=speciesById(mvpActive.sp),name=sp?sp.name:mvpActive.sp,secs=mvpTimeLeft();
 const claimed=mvpClaimed().has(mvpActive.id),mins=Math.floor(secs/60),sec=String(secs%60).padStart(2,'0');
 els.mvpBanner.hidden=false;
 els.mvpBanner.innerHTML=claimed?`✅ <b>${esc(name)}</b> caught! Next spawn soon.`:`⚠️ <b>MVP ${esc(name)}</b> at the pond! ${mins}:${sec} left · one per spawn`;
}
function setMvp(data,options={}){
 if(!data||typeof data.id!=='string'||!data.id||data.id.length>120)return {accepted:false,notify:false};
 const sp=speciesById(data.sp);if(!sp||sp.rarity!=='mvp')return {accepted:false,notify:false};
 const scope=mvpScope(data,options);if(!scope)return {accepted:false,notify:false};
 if(scope.mode==='plaza')observeMvpClock(Number(data.serverNow));
 const scopeKey=mvpScopeKey(scope),identity=mvpIdentity(scope,data.id),old=mvpEventHistory.get(identity),latest=mvpScopeLatest.get(scopeKey);
 const spawnedAt=Number(data.spawnedAt),rawEndsAt=Number(data.endsAt);
 if(!Number.isFinite(spawnedAt)||!Number.isFinite(rawEndsAt)||rawEndsAt<=spawnedAt)return {accepted:false,notify:false};
 if(old&&(old.sp!==sp.id||old.status!=='active'))return {accepted:false,notify:false};
 if(latest&&latest.identity===identity&&latest.status!=='active')return {accepted:false,notify:false};
 if(latest&&latest.identity!==identity&&spawnedAt<=latest.spawnedAt)return {accepted:false,notify:false};
 const prior=old||(latest?.identity===identity?latest:null),endsAt=prior?Math.min(prior.endsAt,rawEndsAt):rawEndsAt;
 if(mvpNow(scope.mode)>=endsAt){
  const retired={status:'expired',identity,sp:sp.id,spawnedAt:prior?Math.min(prior.spawnedAt,spawnedAt):spawnedAt,endsAt,spawnNotified:prior?.spawnNotified===true,despawnNotified:prior?.despawnNotified===true};
  rememberMvp(identity,retired);
  if(latest?.identity===identity)rememberMvpScope(scopeKey,retired);
  if(mvpActive?.identity===identity){mvpActive=null;renderMvpBanner();try{sceneFishing()?.setMvp?.(null,false)}catch{}}
  return {accepted:false,notify:false,expired:true};
 }
 const duplicate=!!prior;
 if(latest&&latest.identity!==identity){
  const superseded=mvpEventHistory.get(latest.identity);
  if(superseded?.status==='active')rememberMvp(latest.identity,{...superseded,status:'superseded'});
 }
 mvpActive={sp:sp.id,id:data.id,spawnedAt:prior?Math.min(prior.spawnedAt,spawnedAt):spawnedAt,endsAt,mode:scope.mode,room:scope.room,identity};
 const notify=options.announce!==false&&!duplicate;
 const history={status:'active',identity,sp:sp.id,spawnedAt:mvpActive.spawnedAt,endsAt,spawnNotified:!!prior?.spawnNotified||notify,despawnNotified:!!prior?.despawnNotified};
 rememberMvp(identity,history);rememberMvpScope(scopeKey,history);
 renderMvpBanner();
 if(notify)mvpAnnouncement('spawn',mvpActive);
 try{const f=sceneFishing();if(f&&f.setMvp)f.setMvp(mvpActive.sp,true)}catch{}
 if(!setMvp._ticker){setMvp._ticker=setInterval(()=>{if(mvpActive&&mvpNow(mvpActive.mode)>=mvpActive.endsAt)clearMvp(mvpActive,{reason:'expired'});else renderMvpBanner()},1000)}
 return {accepted:true,notify,duplicate,active:mvpActive};
}
function clearMvp(data,options={}){
 const current=mvpActive,scope=mvpScope(data||current||{},options);if(!scope)return {accepted:false,notify:false};
 if(scope.mode==='plaza')observeMvpClock(Number(data?.serverNow));
 const id=typeof data?.id==='string'?data.id:current?.id;if(!id)return {accepted:false,notify:false};
 const identity=mvpIdentity(scope,id),latest=mvpScopeLatest.get(mvpScopeKey(scope)),old=mvpEventHistory.get(identity)||(latest?.identity===identity?latest:null);
 if((current&&identity===current.identity&&data?.sp&&data.sp!==current.sp)||(old?.sp&&data?.sp&&old.sp!==data.sp))return {accepted:false,notify:false};
 if(current&&identity!==current.identity&&options.retire===false)return {accepted:false,notify:false};
 if(!old||old.status!=='active'||latest?.identity!==identity||latest.status!=='active')return {accepted:false,notify:false};
 const active=current?.identity===identity?current:{sp:old.sp,id,spawnedAt:old.spawnedAt,endsAt:old.endsAt,mode:scope.mode,room:scope.room,identity};
 const announce=options.announce!==false;
 if(current?.identity===identity){mvpActive=null;renderMvpBanner();try{const f=sceneFishing();if(f&&f.setMvp)f.setMvp(null,false)}catch{}}
 if(options.retire!==false){const retired={status:options.reason==='expired'?'expired':'despawned',identity,sp:active.sp,spawnedAt:active.spawnedAt,endsAt:active.endsAt,spawnNotified:!!old.spawnNotified,despawnNotified:!!old.despawnNotified||announce};rememberMvp(identity,retired);rememberMvpScope(mvpScopeKey(scope),retired);}
 if(announce)mvpAnnouncement('despawn',active);
 return {accepted:true,notify:announce,active};
}
function setAuto(on){
 ui.auto=!!on;
 if(els){els.autoBtn.textContent=ui.auto?'⏸ Auto':'▶ Auto';els.autoBtn.setAttribute('aria-pressed',String(ui.auto));els.autoBtn.classList.toggle('on',ui.auto)}
 if(ui.auto){ui.autoNext=now()+400;clearShake();if(ui.phase!=='off')status('Auto fishing — click ⏸ Auto or ✕ to stop.')}
 else if(ui.phase!=='off')status('Auto fishing off.');
}
// v295: the line in the water is public. Every player in the plaza sees the bobber, so the rig
// state rides the same room broadcast as position instead of living only on the caster's screen.
let rigSent='';
function rigPayload(){
 if(['off','walking'].includes(ui.phase)||!ui.rigTarget)return {on:false};
 const t=ui.rigTarget;
 // v300: the rod id rides along so other anglers see the same tier (and glow) you do.
 return {on:true,pond:ui.pond,x:Math.round(t.x*100)/100,z:Math.round(t.z*100)/100,mode:ui.phase,rod:equippedRod().id};
}
function publishRig(){
 if(!opts||typeof opts.rig!=='function')return;
 const p=rigPayload(),key=JSON.stringify(p);
 if(key===rigSent)return;
 rigSent=key;
 opts.rig(p);
}
// v300: paint the local pole in the equipped rod's tier colour whenever the session or the rod
// changes. The scene falls back to wood for an unknown id.
function syncRodLook(){const f=sceneFishing();if(f&&typeof f.rod==='function')try{f.rod(equippedRod().id)}catch{}}
function setPhase(phase){ui.phase=phase;syncRodLook();renderStage();publishRig();if(opts&&opts.button){opts.button.textContent=phase==='off'?'🎣 Fishing':'🎣 Fishing…';opts.button.setAttribute('aria-pressed',String(phase!=='off'))}}
function mutFilter(mut){return mut&&MUTATIONS[mut]?' '+MUTATIONS[mut].css:''}
// ---- v294 fish art. The old look was the OS emoji tinted with hue-rotate: blurry, washed
// out and childish, and the show-off/catch sprites were so dim they vanished over the pond.
// Every surface now paints a proper side-view sprite on canvas - dark outline, saturated
// body over a pale belly, real fins, per-species shape + pattern variation seeded from the
// species id - so all 155 species stay distinct and crisp at any size. Distinct body plans
// (hammer/thresher/goblin/saw/ray/eel/sturgeon/gar/sunfish/angler) keep families apart at a glance. Mutations get a baked
// halo + effect overlay instead of a blur filter. Falls back to the emoji glyph wherever
// canvas 2D is unavailable (jsdom tests, ancient browsers).
const SHAPE_BY_GLYPH={'🐟':'fish','🐠':'tropical','🐡':'puffer','🦈':'shark','🐋':'whale','🦐':'shrimp','🦞':'lobster','🦀':'crab','🦑':'squid','🐙':'octopus','🐸':'tadpole'};
function hashId(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function fishSprite(spId,mut,px=96){
 const sp=spId&&typeof spId==='object'?spId:speciesById(spId);
 if(!sp||typeof document==='undefined'||!document.createElement)return null;
 let c,g;
 try{c=document.createElement('canvas');c.width=c.height=px;g=c.getContext&&c.getContext('2d')}catch{return null}
 if(!g||typeof g.quadraticCurveTo!=='function'||typeof g.createLinearGradient!=='function'||typeof g.createRadialGradient!=='function')return null;
 const H=hashId(sp.id),v=i=>((H>>>((i*5)%27))&31)/31;
 const M=mut&&Object.hasOwn(MUTATIONS,mut)?MUTATIONS[mut]:null;
 // v301: a real drawing wins when we have one. Mutations still read: the baked halo goes under it
 // and a tint wash goes over it, so a golden koi stays golden and not brown.
 const art=FISH_IMG.get(sp.id);
 if(art){
  if(M&&M.glow){try{const gr=g.createRadialGradient(px*.5,px*.52,px*.08,px*.5,px*.52,px*.47);gr.addColorStop(0,M.glow+'b0');gr.addColorStop(.6,M.glow+'46');gr.addColorStop(1,M.glow+'00');g.fillStyle=gr;g.fillRect(0,0,px,px)}catch{}}
  const fit=Math.min(px/art.width,px/art.height)*.97,dw=art.width*fit,dh=art.height*fit;
  // v303 (owner): "the new fish images are a bit blurry". Two halves to that: the crops ship at 128
  // instead of 96 (so the 128px detail panel is 1:1 and the 64px index is an exact halving), and
  // every draw now asks for high-quality resampling instead of the browser default.
  try{g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high'}catch{}
  try{g.drawImage(art,(px-dw)/2,(px-dh)/2,dw,dh)}catch{return c}
  const wash=mut==='golden'?'#ffd24d':mut==='frozen'?'#7fd4ff':mut==='ghostly'?'#eaf6ff':null;
  if(wash){try{g.globalCompositeOperation='source-atop';g.globalAlpha=mut==='ghostly'?.55:.4;g.fillStyle=wash;g.fillRect(0,0,px,px);g.globalAlpha=1;g.globalCompositeOperation='source-over'}catch{}}
  return c;
 }
 // v301: direction D - the palette from the owner's reference sheets. Saturated body, one
 // complementary accent, no black ink, a cream belly. Same helpers, so all 25 body plans convert.
 let hue=((sp.hue%360)+360)%360,sat=76+v(1)*8,lum=52+v(2)*7;
 if(mut==='golden'){hue=45;sat=92;lum=56}
 if(mut==='frozen'){hue=202;sat=58;lum=62}
 if(mut==='ghostly'){sat=Math.min(sat,20);lum=72}
 const col=(dh,ds,dl,a=1)=>`hsla(${(((hue+dh)%360)+360)%360},${Math.min(100,Math.max(6,sat+ds))}%,${Math.min(94,Math.max(8,lum+dl))}%,${a})`;
 // The accent pairing follows the pins: blue<->gold, magenta<->mint, purple<->pink, coral<->teal.
 const CANDY_ANCHORS=[232,275,315,350,18,45,165,195];
 const CANDY_PAIR={232:45,275:315,315:165,350:165,18:195,45:275,165:350,195:315};
 const accentHue=(()=>{
  if(mut==='golden')return 30;if(mut==='frozen')return 185;
  let best=CANDY_ANCHORS[0],bd=999;
  for(const a of CANDY_ANCHORS){const d=Math.min(Math.abs(hue-a),360-Math.abs(hue-a));if(d<bd){bd=d;best=a}}
  return CANDY_PAIR[best]!==undefined?CANDY_PAIR[best]:(best+150)%360;
 })();
 const ACCENT=`hsl(${accentHue},90%,60%)`;
 // No ink: the silhouette is a soft self-shadow of the body colour, not a cartoon outline.
 const LINE=`hsl(${Math.round(hue)},58%,44%)`;
 // Fins stay in the body's own family (as they do in the reference sheets); the complementary
 // accent is reserved for the markings, which is what keeps a pond of 155 fish from looking
 // like a bag of clowns.
 const FIN=col(3,8,7),DARK=`hsla(${accentHue},88%,62%,.9)`;
 const u=px/100,U=n=>n*u;
 g.lineJoin='round';g.lineCap='round';
 if(M&&M.glow){try{const r=g.createRadialGradient(U(50),U(52),U(8),U(50),U(52),U(47));r.addColorStop(0,M.glow+'b0');r.addColorStop(.6,M.glow+'46');r.addColorStop(1,M.glow+'00');g.fillStyle=r;g.fillRect(0,0,px,px)}catch{}}
 // v297: a species' own body plan wins over the glyph's default, so sharks do not all share one shape.
 const shape=sp.shape||SHAPE_BY_GLYPH[sp.glyph]||'fish';
 const grad=(y0,y1)=>{const gr=g.createLinearGradient(0,U(y0),0,U(y1));
  gr.addColorStop(0,col(-4,6,9));gr.addColorStop(.42,col(0,2,1));
  gr.addColorStop(.78,col(8,-16,26));gr.addColorStop(1,col(12,-26,40));return gr};
 const path=pts=>{g.beginPath();g.moveTo(U(pts[0][0]),U(pts[0][1]));for(let i=1;i+1<pts.length;i+=2)g.quadraticCurveTo(U(pts[i][0]),U(pts[i][1]),U(pts[i+1][0]),U(pts[i+1][1]));g.closePath()};
 const paint=f=>{g.fillStyle=f;g.fill();g.strokeStyle=LINE;g.lineWidth=U(1.3);g.stroke()};
 const eye=(x,y,r)=>{ // a dot with one glint, never a googly ring
  g.fillStyle='#17141b';
  if(g.ellipse){g.beginPath();g.ellipse(U(x),U(y),U(r*.8),U(r),0,0,7);g.fill()}
  else{g.beginPath();g.arc(U(x),U(y),U(r*.88),0,7);g.fill()}
  g.fillStyle='#fff';g.beginPath();g.arc(U(x-r*.26),U(y-r*.34),U(r*.3),0,7);g.fill()};
 const stroke2=(w,fill,draw)=>{draw();g.strokeStyle=LINE;g.lineWidth=U(w+3);g.stroke();draw();g.strokeStyle=fill;g.lineWidth=U(w);g.stroke()};
 const pattern=(bodyPath,hh)=>{ // one idea per fish: two fat bands, or three spots
  g.save();bodyPath();g.clip();g.fillStyle=DARK;
  if(v(3)>.45){
   for(let i=0;i<2;i++){const bx=40+i*18;
    g.beginPath();g.moveTo(U(bx),U(52-hh));g.quadraticCurveTo(U(bx-5),U(52),U(bx),U(52+hh));
    g.lineTo(U(bx+6),U(52+hh));g.quadraticCurveTo(U(bx+1),U(52),U(bx+6),U(52-hh));g.closePath();g.fill()}
  }else{
   for(let i=0;i<3;i++){g.beginPath();g.arc(U(40+i*14),U(46+((i%2)*12)),U(3.4+v(i+8)*1.6),0,7);g.fill()}
  }
  g.restore()};
 if(shape==='fish'||shape==='tropical'||shape==='shark'||shape==='whale'||shape==='deep'){
  // v297: 'deep' is the disc-bodied variant - koi, betta, discus, platies. Same painter, very
  // different silhouette: short, tall, with long veil fins instead of a torpedo outline.
  const deep=shape==='deep';
  const hh=deep?22+v(4)*5:shape==='tropical'?19+v(4)*4:shape==='shark'?12+v(4)*3:shape==='whale'?23+v(4)*3:14+v(4)*7;
  const nose=deep?84:shape==='shark'?94:shape==='tropical'?82:90;
  const body=()=>path([[24,52],[34,52-hh*1.3],[58,52-hh],[nose-8,52-hh*.72],[nose,51],[nose+2,55],[nose-10,52+hh*.78],[56,52+hh*.92],[34,52+hh*1.22],[24,52]]);
  // tail
  const tl=deep?.78:shape==='shark'?1.5:shape==='whale'?1.3:1.15;
  path([[32,52],[13,52-hh*tl*.95],[6,52-hh*tl],[16,52],[6,52+hh*tl],[13,52+hh*tl*.95],[32,52]]);paint(FIN);
  // dorsal + belly fins
  if(deep){path([[40,52-hh+3],[48,52-hh-13],[58,52-hh-16],[70,52-hh+1],[70,52-hh+9],[48,52-hh+6],[40,52-hh+3]]);paint(FIN);path([[42,52+hh-3],[50,52+hh+13],[60,52+hh+15],[70,52+hh-1],[70,52+hh-9],[50,52+hh-6],[42,52+hh-3]]);paint(FIN)}
  else if(shape==='tropical'){path([[38,52-hh+3],[50,52-hh-17],[68,52-hh+2]]);paint(FIN);path([[42,52+hh-2],[52,52+hh+13],[66,52+hh-3]]);paint(FIN)}
  else if(shape==='shark'){path([[48,52-hh+2],[55,52-hh-15],[66,52-hh+1]]);paint(FIN);path([[56,52+hh-1],[60,52+hh+8],[68,52+hh-2]]);paint(FIN)}
  else if(shape==='whale'){path([[52,52-hh+3],[58,52-hh-6],[66,52-hh+2]]);paint(FIN)}
  else{path([[42,52-hh+2],[52,52-hh-10-v(6)*6],[66,52-hh+1]]);paint(FIN);path([[48,52+hh-1],[54,52+hh+8],[62,52+hh-2]]);paint(FIN)}
  body();paint(grad(52-hh,52+hh));
  pattern(body,hh);
  // v297: the whale shark is the one spotted giant - pale spots over a dark back.
  if(sp.id==='whaleshark'){g.save();body();g.clip();g.fillStyle='rgba(238,247,255,.8)';
   for(let i=0;i<18;i++){g.beginPath();g.arc(U(30+(i%6)*11+v(i)*4),U(36+Math.floor(i/6)*10+v(i+3)*3),U(.9+v(i+1)*.7),0,7);g.fill()}g.restore()}
  if(shape==='whale'){g.save();body();g.clip();g.strokeStyle=col(6,-18,26,.9);g.lineWidth=U(1.8);for(let i=0;i<3;i++){g.beginPath();g.moveTo(U(40),U(58+i*5));g.quadraticCurveTo(U(62),U(62+i*5),U(84),U(57+i*5));g.stroke()}g.restore()}
  // gills + pectoral fin
  g.strokeStyle=LINE;g.lineWidth=U(1.8);
  if(shape==='shark'){for(let i=0;i<3;i++){g.beginPath();g.moveTo(U(66+i*4),U(47));g.quadraticCurveTo(U(64+i*4),U(52),U(66+i*4),U(57));g.stroke()}}
  else{g.beginPath();g.moveTo(U(70),U(52-hh*.55));g.quadraticCurveTo(U(64),U(52),U(70),U(52+hh*.55));g.stroke()}
  path([[58,54],[50,60+hh*.2],[60,60]]);paint(col(-16,6,-4));
  eye(deep?74:shape==='shark'?80:74,shape==='whale'?50:deep?44:46.5,shape==='whale'?3.2:shape==='shark'?3.2:deep?5:4.4);
 }else if(shape==='puffer'){
  const r=21+v(4)*3;
  g.strokeStyle=LINE;g.lineWidth=U(2.4);g.fillStyle=FIN;
  for(let i=0;i<11;i++){const a=i/11*Math.PI*2+.3;if(Math.cos(a)>.86)continue;const x1=52+Math.cos(a)*r*.92,y1=50+Math.sin(a)*r*.92,x2=52+Math.cos(a)*(r+7.5),y2=50+Math.sin(a)*(r+7.5);g.beginPath();g.moveTo(U(x1+Math.sin(a)*4),U(y1-Math.cos(a)*4));g.lineTo(U(x2),U(y2));g.lineTo(U(x1-Math.sin(a)*4),U(y1+Math.cos(a)*4));g.closePath();g.fill();g.stroke()}
  path([[31,50],[24,42],[22,38],[26,50],[22,62],[24,58],[31,50]]);paint(FIN);
  const body=()=>{g.beginPath();g.arc(U(52),U(50),U(r),0,7)};
  body();paint(grad(50-r,50+r));
  g.save();body();g.clip();g.fillStyle=DARK;for(let i=0;i<6;i++){g.beginPath();g.arc(U(40+(i%3)*12),U(42+Math.floor(i/3)*14),U(2.4),0,7);g.fill()}g.restore();
  g.fillStyle=col(8,-20,26);g.beginPath();g.ellipse?g.ellipse(U(52),U(58),U(r*.62),U(r*.34),0,0,7):g.arc(U(52),U(58),U(r*.5),0,7);g.fill();
  eye(62,44,5);g.strokeStyle=LINE;g.lineWidth=U(2);g.beginPath();g.moveTo(U(71),U(52));g.quadraticCurveTo(U(74),U(54),U(71),U(56));g.stroke();
 }else if(shape==='tadpole'){
  stroke2(7,col(0,0,-4),()=>{g.beginPath();g.moveTo(U(56),U(52));g.quadraticCurveTo(U(34),U(60),U(24),U(46));g.quadraticCurveTo(U(18),U(36),U(12),U(42))});
  const body=()=>{g.beginPath();g.arc(U(62),U(50),U(17+v(4)*3),0,7)};
  body();paint(grad(32,68));
  eye(68,45,4.4);
 }else if(shape==='shrimp'||shape==='lobster'){
  const cx=50,cy=46,r=22;
  // antennae
  g.strokeStyle=LINE;g.lineWidth=U(1.7);
  g.beginPath();g.moveTo(U(cx+r-2),U(cy-4));g.quadraticCurveTo(U(88),U(26),U(92),U(44));g.stroke();
  g.beginPath();g.moveTo(U(cx+r-2),U(cy-1));g.quadraticCurveTo(U(92),U(38),U(88),U(58));g.stroke();
  // curved segmented body
  const bodyArc=()=>{g.beginPath();g.arc(U(cx),U(cy),U(r),-.55,2.5)};
  stroke2(13,col(0,0,0),bodyArc);
  g.strokeStyle=col(8,-18,24,.85);g.lineWidth=U(3.4);g.beginPath();g.arc(U(cx),U(cy),U(r-3),.4,2.2);g.stroke();
  g.strokeStyle=LINE;g.lineWidth=U(1.6);
  for(let i=0;i<4;i++){const a=.2+i*.55,x1=cx+Math.cos(a)*(r-7),y1=cy+Math.sin(a)*(r-7),x2=cx+Math.cos(a)*(r+7),y2=cy+Math.sin(a)*(r+7);g.beginPath();g.moveTo(U(x1),U(y1));g.lineTo(U(x2),U(y2));g.stroke()}
  // tail fan (at arc end, lower left)
  path([[32,62],[18,58],[16,66],[24,70],[20,76],[32,72],[32,62]]);paint(FIN);
  // legs
  for(let i=0;i<3;i++){g.beginPath();g.moveTo(U(56+i*7),U(56));g.quadraticCurveTo(U(58+i*7),U(66),U(52+i*7),U(72));g.strokeStyle=LINE;g.lineWidth=U(2);g.stroke()}
  if(shape==='lobster'){path([[70,40],[86,30],[90,40],[80,38],[90,46],[74,48],[70,40]]);paint(col(0,0,0));path([[68,54],[86,52],[90,62],[80,58],[82,68],[68,60],[68,54]]);paint(col(0,0,0))}
  eye(68,36,3);
 }else if(shape==='crab'){
  g.strokeStyle=LINE;g.lineWidth=U(2);
  for(const s of[-1,1]){for(let i=0;i<3;i++){g.beginPath();g.moveTo(U(50+s*(14+i*4)),U(60+i*2));g.quadraticCurveTo(U(50+s*(30+i*4)),U(66+i*4),U(50+s*(26+i*5)),U(80))
   ;g.stroke()}}
  for(const s of[-1,1]){const bx=50+s*24;
   g.beginPath();g.moveTo(U(50+s*14),U(50));g.quadraticCurveTo(U(bx),U(44),U(bx-s*1),U(34));g.lineWidth=U(5);g.strokeStyle=col(0,0,0);g.stroke();g.lineWidth=U(2);g.strokeStyle=LINE;
   path([[bx-6*s,36],[bx-8*s,24],[bx,22],[bx+2*s,28],[bx+7*s,24],[bx+5*s,36],[bx-6*s,36]]);paint(col(0,0,0));}
  const body=()=>{g.ellipse?(g.beginPath(),g.ellipse(U(50),U(56),U(23),U(15),0,0,7)):(g.beginPath(),g.arc(U(50),U(56),U(19),0,7))};
  body();paint(grad(41,71));
  g.save();body();g.clip();g.fillStyle=DARK;for(let i=0;i<4;i++){g.beginPath();g.arc(U(38+i*8),U(52+(i%2)*8),U(1.9),0,7);g.fill()}g.restore();
  eye(43,48,3.4);eye(57,48,3.4);
  g.strokeStyle=LINE;g.lineWidth=U(1.8);g.beginPath();g.moveTo(U(46),U(60));g.quadraticCurveTo(U(50),U(63),U(54),U(60));g.stroke();
 }else if(shape==='squid'){
  const tip=14+v(4)*4;
  path([[50,tip],[36,34],[38,58],[44,62],[50,64],[56,62],[62,58],[64,34],[50,tip]]);paint(grad(tip,64));
  path([[50,tip+2],[32,22],[40,38],[45,30],[50,tip+2]]);paint(FIN);path([[50,tip+2],[68,22],[60,38],[55,30],[50,tip+2]]);paint(FIN);
  g.strokeStyle=LINE;g.lineWidth=U(2);
  for(let i=0;i<5;i++){const x0=40+i*5;g.beginPath();g.moveTo(U(x0),U(62));g.quadraticCurveTo(U(x0+(i%2?7:-7)),U(74),U(x0+(i%2?-4:4)),U(86));g.lineWidth=U(4.6);g.strokeStyle=col(0,0,0);g.stroke();g.lineWidth=U(1.6);g.strokeStyle=LINE;g.stroke()}
  eye(44,56,3.8);eye(56,56,3.8);
 }else if(shape==='gar'){
  const hh=9+v(4)*3;
  path([[18,52],[4,52-hh*1.5],[2,52-hh*1.6],[10,52],[2,52+hh*1.6],[4,52+hh*1.5],[18,52]]);paint(FIN);
  path([[22,52-hh],[28,52-hh-9],[34,52-hh]]);paint(FIN);
  path([[22,52+hh],[28,52+hh+9],[34,52+hh]]);paint(FIN);
  const body=()=>path([[20,52],[26,52-hh*1.1],[58,52-hh],[86,51-hh*.5],[86,53+hh*.5],[58,52+hh*.9],[26,52+hh],[20,52]]);
  body();paint(grad(52-hh,52+hh));
  path([[86,48],[99,50],[99,54],[86,56],[86,48]]);paint(col(0,-4,10));
  g.save();body();g.clip();g.fillStyle=DARK;for(let i=0;i<7;i++){g.beginPath();g.arc(U(34+i*8),U(48+(i%2)*9),U(2.2),0,7);g.fill()}g.restore();
  g.strokeStyle=LINE;g.lineWidth=U(1.2);for(let i=0;i<4;i++){const x=90+i*2.4;g.beginPath();g.moveTo(U(x),U(50));g.lineTo(U(x),U(51.6));g.stroke()}
  eye(82,49,3.2);
 }else if(shape==='eel'){
  const hh=11+v(4)*2;
  // continuous dorsal fringe first, so the body covers its root
  stroke2(4,col(-20,8,-2),()=>{g.beginPath();g.moveTo(U(16),U(58));g.quadraticCurveTo(U(44),U(20),U(62),U(40));g.quadraticCurveTo(U(76),U(50),U(88),U(44))});
  // one long tapering S-body, drawn as a thick stroke so the silhouette stays ribbon-like
  stroke2(hh*2,col(-14,4,-6),()=>{g.beginPath();g.moveTo(U(12),U(68));g.quadraticCurveTo(U(40),U(34),U(62),U(54));g.quadraticCurveTo(U(74),U(64),U(88),U(54))});
  // head + gaping jaw
  path([[82,46],[99,45],[99,52],[90,55],[82,55],[82,46]]);paint(col(0,-2,-4));
  g.strokeStyle=LINE;g.lineWidth=U(1.5);g.beginPath();g.moveTo(U(84),U(53));g.lineTo(U(96),U(52));g.stroke();
  eye(84,49,2.6);
 }else if(shape==='hammer'){
  const hh=11+v(4)*3;
  path([[28,52],[10,52-hh*1.3],[3,52-hh*1.4],[13,52],[3,52+hh*1.4],[10,52+hh*1.3],[28,52]]);paint(FIN);
  path([[42,52-hh+2],[50,52-hh-15],[62,52-hh+1]]);paint(FIN);
  path([[50,52+hh-1],[55,52+hh+9],[63,52+hh-2]]);paint(FIN);
  // cephalofoil: a vertical lens at the head, in the body's own gradient so it reads as one animal
  path([[76,52],[82,34],[90,33],[94,44],[94,60],[90,71],[82,70],[76,52]]);g.fillStyle=grad(34,70);g.fill();
  const body=()=>path([[28,52],[36,52-hh*1.2],[54,52-hh*.95],[74,52-hh*.55],[86,48],[86,56],[74,52+hh*.6],[54,52+hh*.95],[36,52+hh*1.15],[28,52]]);
  body();paint(grad(52-hh,52+hh));
  g.save();body();g.clip();g.fillStyle=DARK;for(let i=0;i<3;i++){g.beginPath();g.arc(U(42+i*10),U(50),U(2.4),0,7);g.fill()}g.restore();
  g.strokeStyle=LINE;g.lineWidth=U(1.6);for(let i=0;i<3;i++){g.beginPath();g.moveTo(U(64+i*3),U(48));g.quadraticCurveTo(U(62+i*3),U(52),U(64+i*3),U(56));g.stroke()}
  eye(89,41,3.1);eye(89,63,3.1);
 }else if(shape==='saw'){
  const hh=16+v(4)*3;
  path([[46,52],[24,52-hh-3],[4,40],[20,54],[4,66],[24,52+hh+3],[46,52]]);paint(col(-10,4,-12));
  const body=()=>path([[34,52],[44,52-hh*.9],[60,52-hh*.62],[68,52],[60,52+hh*.62],[44,52+hh*.9],[34,52]]);
  body();paint(grad(52-hh*.9,52+hh*.9));
  // the saw: a long flat rostrum with a tooth down each side
  path([[64,46],[99,47],[99,57],[64,56],[64,46]]);paint(col(0,-4,16));
  g.strokeStyle=LINE;g.lineWidth=U(1.7);
  for(let i=0;i<4;i++){const x=76+i*5.4;
   g.beginPath();g.moveTo(U(x),U(47));g.lineTo(U(x+2),U(40));g.lineTo(U(x+4),U(47));g.stroke();
   g.beginPath();g.moveTo(U(x),U(56));g.lineTo(U(x+2),U(63));g.lineTo(U(x+4),U(56));g.stroke()}
  eye(60,48,2.8);eye(60,56,2.8);
 }else if(shape==='ray'){
  const span=30+v(4)*5;
  // whip tail first, so the disc covers its root
  stroke2(3.4,col(-12,4,-8),()=>{g.beginPath();g.moveTo(U(30),U(58));g.quadraticCurveTo(U(12),U(74),U(4),U(90))});
  // the disc: wide wings with pointed tips, rounded head at the front
  const disc=()=>path([[88,52],[72,42],[40,52-span],[14,52-span*.55],[30,52],[14,52+span*.55],[40,52+span],[72,62],[88,52]]);
  disc();paint(grad(52-span*.6,52+span*.6));
  g.save();disc();g.clip();g.fillStyle=DARK;for(let i=0;i<6;i++){g.beginPath();g.arc(U(42+(i%3)*12),U(44+Math.floor(i/3)*14),U(2.2),0,7);g.fill()}g.restore();
  // cephalic horns and the mouth on the leading edge
  g.strokeStyle=LINE;g.lineWidth=U(2.6);
  g.beginPath();g.moveTo(U(84),U(45));g.quadraticCurveTo(U(92),U(40),U(96),U(42));g.stroke();
  g.beginPath();g.moveTo(U(84),U(59));g.quadraticCurveTo(U(92),U(64),U(96),U(62));g.stroke();
  g.lineWidth=U(1.8);g.beginPath();g.moveTo(U(86),U(52));g.lineTo(U(92),U(52));g.stroke();
  eye(76,47,2.8);eye(76,57,2.8);
 }else if(shape==='sunfish'){
  const r=29+v(4)*3;
  // tall fused dorsal and anal fins, drawn first so the disc covers their roots
  path([[26,52-10],[40,52-r-22],[58,52-r-24],[72,52-r+2],[72,52-6],[26,52-10]]);paint(FIN);
  path([[26,52+10],[40,52+r+22],[58,52+r+24],[72,52+r-2],[72,52+6],[26,52+10]]);paint(FIN);
  const body=()=>path([[30,52],[36,52-r*.78],[52,52-r],[68,52-r*.8],[74,52-r*.2],[76,52],[74,52+r*.2],[68,52+r*.8],[52,52+r],[36,52+r*.78],[30,52]]);
  body();paint(grad(52-r,52+r));
  g.save();body();g.clip();g.fillStyle=DARK;for(let i=0;i<6;i++){g.beginPath();g.arc(U(44+(i%3)*11),U(42+Math.floor(i/3)*18),U(2.4),0,7);g.fill()}g.restore();
  // blunt beak at the front, scalloped clavus at the back
  g.strokeStyle=LINE;g.lineWidth=U(2);g.beginPath();g.moveTo(U(76),U(46));g.quadraticCurveTo(U(82),U(52),U(76),U(58));g.stroke();
  g.lineWidth=U(1.7);g.beginPath();g.moveTo(U(30),U(40));g.quadraticCurveTo(U(25),U(52),U(30),U(64));g.stroke();
  eye(66,45,4);
 }else if(shape==='thresher'){
  const hh=11+v(4)*3;
  // upper caudal lobe: a tapering whip about as long as the body itself
  path([[32,46],[20,36],[2,10],[9,7],[26,30],[38,44],[32,46]]);paint(FIN);
  path([[30,58],[16,64],[8,74],[16,70],[32,66],[30,58]]);paint(FIN);
  path([[46,52-hh+2],[54,52-hh-13],[64,52-hh+1]]);paint(FIN);
  path([[54,52+hh-1],[58,52+hh+8],[66,52+hh-2]]);paint(FIN);
  const body=()=>path([[30,52],[38,52-hh*1.15],[56,52-hh*.95],[74,52-hh*.5],[80,51],[80,54],[74,52+hh*.6],[56,52+hh*.9],[38,52+hh*1.1],[30,52]]);
  body();paint(grad(52-hh,52+hh));
  g.save();body();g.clip();g.globalAlpha=.45;g.fillStyle=DARK;g.fillRect(0,U(52-hh),px,U(hh*.85));g.globalAlpha=1;g.restore();
  g.strokeStyle=LINE;g.lineWidth=U(1.8);for(let i=0;i<3;i++){g.beginPath();g.moveTo(U(60+i*4),U(47));g.quadraticCurveTo(U(58+i*4),U(52),U(60+i*4),U(57));g.stroke()}
  path([[58,54],[50,61],[60,60]]);paint(col(-16,6,-4));
  eye(74,47,3);
 }else if(shape==='goblin'){
  const hh=10+v(4)*3;
  path([[28,52],[10,52-hh*1.2],[4,52-hh*1.3],[14,52],[4,52+hh*1.3],[10,52+hh*1.2],[28,52]]);paint(FIN);
  path([[42,52-hh+2],[50,52-hh-13],[60,52-hh+1]]);paint(FIN);
  path([[52,52+hh-1],[56,52+hh+8],[64,52+hh-2]]);paint(FIN);
  const body=()=>path([[26,52],[34,52-hh*1.15],[54,52-hh*.9],[72,52-hh*.55],[76,51],[76,54],[72,52+hh*.7],[54,52+hh*.85],[34,52+hh*1.1],[26,52]]);
  body();paint(grad(52-hh,52+hh));
  path([[72,49],[99,51],[99,54],[72,55],[72,49]]);paint(col(4,-4,8));
  path([[64,55],[74,62],[92,58],[86,54],[64,55]]);paint(col(6,-6,14));
  g.strokeStyle=LINE;g.lineWidth=U(1.4);for(let i=0;i<5;i++){const x=72+i*4;g.beginPath();g.moveTo(U(x),U(55.5));g.lineTo(U(x+1),U(53.2));g.stroke()}
  eye(70,47.5,2.8);
 }else if(shape==='sturgeon'){
  const hh=12+v(4)*3;
  path([[30,52],[12,52-hh*1.5],[4,52-hh*1.6],[16,52],[8,52+hh*.6],[24,52+hh*.4],[30,52]]);paint(FIN);
  path([[36,52-hh+3],[46,52-hh-9],[58,52-hh+3]]);paint(FIN);
  const body=()=>path([[26,52],[36,52-hh*1.1],[58,52-hh*.85],[78,52-hh*.5],[82,51],[82,54],[78,52+hh*.6],[58,52+hh*.75],[36,52+hh*1.05],[26,52]]);
  body();paint(grad(52-hh,52+hh));
  g.save();body();g.clip();g.fillStyle=col(-4,10,-6);for(let i=0;i<6;i++){g.beginPath();g.arc(U(30+i*9),U(52-hh*.85),U(2.2),0,7);g.fill()}
  g.fillStyle=DARK;for(let i=0;i<5;i++){g.beginPath();g.arc(U(36+i*9),U(52+hh*.5),U(1.8),0,7);g.fill()}g.restore();
  path([[78,50],[99,51],[99,55],[78,55],[78,50]]);paint(col(2,-4,10));
  g.strokeStyle=LINE;g.lineWidth=U(1.6);
  for(const dy of[1,-1]){g.beginPath();g.moveTo(U(88),U(55));g.quadraticCurveTo(U(92),U(55+dy*4),U(95),U(52+dy*3));g.stroke()}
  eye(76,47,3.2);
 }else if(shape==='angler'){
  const r=29+v(4)*3;
  const body=()=>path([[28,52],[34,52-r*.85],[52,52-r],[70,52-r*.6],[78,50],[80,54],[70,52+r*.62],[52,52+r*.95],[34,52+r*.85],[28,52]]);
  body();paint(grad(52-r,52+r));
  g.save();body();g.clip();
  g.fillStyle=DARK;for(let i=0;i<5;i++){g.beginPath();g.arc(U(40+(i%2)*11),U(38+i*6),U(2.2),0,7);g.fill()}
  // the jaw is a dark wedge cut into the front third of the head
  g.fillStyle='rgba(20,8,22,.85)';g.beginPath();g.moveTo(U(62),U(40));g.quadraticCurveTo(U(80),U(46),U(86),U(52));g.quadraticCurveTo(U(80),U(60),U(62),U(66));g.closePath();g.fill();
  g.restore();
  g.strokeStyle='#f6f1e2';g.lineWidth=U(2);
  for(let i=0;i<4;i++){const x=66+i*5;
   g.beginPath();g.moveTo(U(x),U(42+i*1.2));g.lineTo(U(x+2),U(48+i*1.2));g.stroke();
   g.beginPath();g.moveTo(U(x),U(62-i*1.2));g.lineTo(U(x+2),U(56-i*1.2));g.stroke()}
  // illicium: a stalk over the head ending in a glowing esca
  stroke2(2.6,col(-10,8,-2),()=>{g.beginPath();g.moveTo(U(48),U(52-r+5));g.quadraticCurveTo(U(36),U(16),U(24),U(26))});
  g.fillStyle='rgba(255,240,150,.55)';g.beginPath();g.arc(U(24),U(26),U(9),0,7);g.fill();
  g.fillStyle='#fff6bf';g.beginPath();g.arc(U(24),U(26),U(5),0,7);g.fill();g.strokeStyle=LINE;g.lineWidth=U(1.5);g.stroke();
  eye(58,40,3.4);
 }else{ // octopus
  const body=()=>{g.beginPath();g.arc(U(50),U(42),U(20+v(4)*3),0,7)};
  for(let i=0;i<5;i++){const x0=34+i*8,sw=(i%2?1:-1)*(8+v(i+5)*5);
   const leg=()=>{g.beginPath();g.moveTo(U(x0),U(52));g.quadraticCurveTo(U(x0+sw*.4),U(70),U(x0+sw),U(84))};
   stroke2(6,col(0,0,0),leg)}
  body();paint(grad(20,64));
  g.save();body();g.clip();g.fillStyle=DARK;for(let i=0;i<3;i++){g.beginPath();g.arc(U(40+i*10),U(30+(i%2)*6),U(2),0,7);g.fill()}g.restore();
  eye(43,42,4.4);eye(58,42,4.4);
  g.strokeStyle=LINE;g.lineWidth=U(1.8);g.beginPath();g.moveTo(U(46),U(52));g.quadraticCurveTo(U(50),U(55),U(54),U(52));g.stroke();
 }
 // mutation overlays, baked so they stay visible at any scale
 const star=(x,y,r,fill)=>{g.fillStyle=fill;g.beginPath();g.moveTo(U(x),U(y-r));g.quadraticCurveTo(U(x),U(y),U(x+r),U(y));g.quadraticCurveTo(U(x),U(y),U(x),U(y+r));g.quadraticCurveTo(U(x),U(y),U(x-r),U(y));g.quadraticCurveTo(U(x),U(y),U(x),U(y-r));g.fill()};
 if(mut==='ghostly'){g.globalCompositeOperation='source-atop';g.fillStyle='rgba(224,224,248,.42)';g.fillRect(0,0,px,px);g.globalCompositeOperation='source-over'}
 if(mut==='prismatic'){g.globalCompositeOperation='source-atop';const lg=g.createLinearGradient(0,0,px,0);['#ff5d5d','#ffb84d','#ffe95d','#6de87a','#5db9ff','#b06dff'].forEach((h,i)=>lg.addColorStop(i/5,h));g.globalAlpha=.4;g.fillStyle=lg;g.fillRect(0,0,px,px);g.globalAlpha=1;g.globalCompositeOperation='source-over'}
 if(mut==='frozen'){for(const[x,y,r]of[[30,30,5],[74,66,4],[64,24,3.5]]){g.fillStyle='rgba(225,245,255,.92)';g.beginPath();g.moveTo(U(x),U(y-r));g.lineTo(U(x+r*.62),U(y));g.lineTo(U(x),U(y+r));g.lineTo(U(x-r*.62),U(y));g.closePath();g.fill()}}
 if(mut==='electric'){g.strokeStyle='#ffe34d';g.lineWidth=U(2.6);for(const[x,y]of[[26,26],[70,70]]){g.beginPath();g.moveTo(U(x),U(y));g.lineTo(U(x+6),U(y+7));g.lineTo(U(x+1),U(y+8));g.lineTo(U(x+8),U(y+17));g.stroke()}}
 if(mut==='shiny'||mut==='sparkling'||mut==='golden'){star(28,28,5,'#fffbe8');star(72,64,4,'#fff6c8');if(mut!=='shiny')star(66,22,3.2,'#ffffff')}
 return c;
}
// v301 (owner): most of the pond is now a real drawing cropped from the reference sheets. Species
// without one keep the painted fallback, so the catalog never has a hole. Manifest generated by
// tools/fish_sprite_crops.js.
const FISH_ART={
  pumpkinseed:'assets/social/fish/pumpkinseed.png', angelfin:'assets/social/fish/angelfin.png',
  crappie:'assets/social/fish/crappie.png', perch:'assets/social/fish/perch.png',
  sunny:'assets/social/fish/sunny.png', tetra:'assets/social/fish/tetra.png', betta:'assets/social/fish/betta.png',
  emperium:'assets/social/fish/emperium.png', molly:'assets/social/fish/molly.png',
  guppy:'assets/social/fish/guppy.png', killi:'assets/social/fish/killi.png', platy:'assets/social/fish/platy.png',
  koi:'assets/social/fish/koi.png', smelt:'assets/social/fish/smelt.png',
  seraphkoi:'assets/social/fish/seraphkoi.png', loach:'assets/social/fish/loach.png',
  mudskip:'assets/social/fish/mudskip.png', tadpole:'assets/social/fish/tadpole.png',
  stickle:'assets/social/fish/stickle.png', spirlin:'assets/social/fish/spirlin.png',
  goby:'assets/social/fish/goby.png', ninespine:'assets/social/fish/ninespine.png',
  topminnow:'assets/social/fish/topminnow.png', angeling:'assets/social/fish/angeling.png',
  octo:'assets/social/fish/octo.png', squid:'assets/social/fish/squid.png',
  hydrasquid:'assets/social/fish/hydrasquid.png', kraken:'assets/social/fish/kraken.png',
  colossus:'assets/social/fish/colossus.png', oarfish:'assets/social/fish/oarfish.png',
  tench:'assets/social/fish/tench.png', bleak:'assets/social/fish/bleak.png',
  lobster:'assets/social/fish/lobster.png', fountainfish:'assets/social/fish/fountainfish.png',
  crucian:'assets/social/fish/crucian.png', poring:'assets/social/fish/poring.png',
  ghostring:'assets/social/fish/ghostring.png', trout:'assets/social/fish/trout.png',
  mahi:'assets/social/fish/mahi.png', dragonet:'assets/social/fish/dragonet.png',
  coelacanth:'assets/social/fish/coelacanth.png', reedeel:'assets/social/fish/reedeel.png',
  phoenixfish:'assets/social/fish/phoenixfish.png', carp:'assets/social/fish/carp.png',
  snapper:'assets/social/fish/snapper.png', whaleshark:'assets/social/fish/whaleshark.png',
  paddlefish:'assets/social/fish/paddlefish.png', ribbonsturgeon:'assets/social/fish/ribbonsturgeon.png',
  beluga:'assets/social/fish/beluga.png', greenshell:'assets/social/fish/greenshell.png',
  moonturtle:'assets/social/fish/moonturtle.png', glassback:'assets/social/fish/glassback.png',
  pupfish:'assets/social/fish/pupfish.png', lantern:'assets/social/fish/lantern.png',
  emberturtle:'assets/social/fish/emberturtle.png', heartback:'assets/social/fish/heartback.png',
  starhull:'assets/social/fish/starhull.png', minnow:'assets/social/fish/minnow.png',
  bitterling:'assets/social/fish/bitterling.png', discus:'assets/social/fish/discus.png',
  dace:'assets/social/fish/dace.png', chub:'assets/social/fish/chub.png', sunperch:'assets/social/fish/sunperch.png',
  roach:'assets/social/fish/roach.png', gudgeon:'assets/social/fish/gudgeon.png', dart:'assets/social/fish/dart.png',
  bream:'assets/social/fish/bream.png', bass:'assets/social/fish/bass.png', catfish:'assets/social/fish/catfish.png',
  gar:'assets/social/fish/gar.png', barbel:'assets/social/fish/barbel.png', ide:'assets/social/fish/ide.png',
  piranha:'assets/social/fish/piranha.png', zander:'assets/social/fish/zander.png',
  mullet:'assets/social/fish/mullet.png', salmon:'assets/social/fish/salmon.png',
  arowana:'assets/social/fish/arowana.png', marlin:'assets/social/fish/marlin.png',
  staropus:'assets/social/fish/staropus.png', candyopus:'assets/social/fish/candyopus.png',
  moonopus:'assets/social/fish/moonopus.png', galaxyopus:'assets/social/fish/galaxyopus.png',
  gemsnail:'assets/social/fish/gemsnail.png', shellsnail:'assets/social/fish/shellsnail.png',
  ambernail:'assets/social/fish/ambernail.png', glasssnail:'assets/social/fish/glasssnail.png',
  opalsnail:'assets/social/fish/opalsnail.png', lavasnail:'assets/social/fish/lavasnail.png',
  nebulasnail:'assets/social/fish/nebulasnail.png', prismsnail:'assets/social/fish/prismsnail.png',
  greatwhite:'assets/social/fish/greatwhite.png', nurseshark:'assets/social/fish/nurseshark.png',
  morayeel:'assets/social/fish/morayeel.png', catshark:'assets/social/fish/catshark.png',
  cobblewhale:'assets/social/fish/cobblewhale.png', hornshark:'assets/social/fish/hornshark.png',
  greatmaw:'assets/social/fish/greatmaw.png', bluefin:'assets/social/fish/bluefin.png',
  baphobass:'assets/social/fish/baphobass.png', thresher:'assets/social/fish/thresher.png',
  sawfin:'assets/social/fish/sawfin.png', makoshark:'assets/social/fish/makoshark.png',
  leopardshark:'assets/social/fish/leopardshark.png', lanternshark:'assets/social/fish/lanternshark.png',
  carpetshark:'assets/social/fish/carpetshark.png', bamboo:'assets/social/fish/bamboo.png',
  stingray:'assets/social/fish/stingray.png', goblin:'assets/social/fish/goblin.png',
  abysssaw:'assets/social/fish/abysssaw.png', hammerpup:'assets/social/fish/hammerpup.png',
  hammer:'assets/social/fish/hammer.png', ghostshark:'assets/social/fish/ghostshark.png',
  silvershark:'assets/social/fish/silvershark.png', porbeagle:'assets/social/fish/porbeagle.png',
  manta:'assets/social/fish/manta.png', arapaima:'assets/social/fish/arapaima.png',
  sturgeon:'assets/social/fish/sturgeon.png', mekong:'assets/social/fish/mekong.png',
  voidfin:'assets/social/fish/voidfin.png', tigershark:'assets/social/fish/tigershark.png',
  moonray:'assets/social/fish/moonray.png', leviathan:'assets/social/fish/leviathan.png',
  sunshark:'assets/social/fish/sunshark.png', candyshrimp:'assets/social/fish/candyshrimp.png',
  voidshrimp:'assets/social/fish/voidshrimp.png', krill:'assets/social/fish/krill.png',
  shrimplet:'assets/social/fish/shrimplet.png', lanternshrimp:'assets/social/fish/lanternshrimp.png',
  peppershrimp:'assets/social/fish/peppershrimp.png', crawdad:'assets/social/fish/crawdad.png',
  royalshrimp:'assets/social/fish/royalshrimp.png', seahorse:'assets/social/fish/seahorse.png',
  crownhorse:'assets/social/fish/crownhorse.png', sunhorse:'assets/social/fish/sunhorse.png',
  ribbonhorse:'assets/social/fish/ribbonhorse.png', leafdragon:'assets/social/fish/leafdragon.png',
  thornhorse:'assets/social/fish/thornhorse.png', ghosthorse:'assets/social/fish/ghosthorse.png',
  tidehorse:'assets/social/fish/tidehorse.png', sunorca:'assets/social/fish/sunorca.png',
  rosedolphin:'assets/social/fish/rosedolphin.png', violetbeluga:'assets/social/fish/violetbeluga.png',
  greywhale:'assets/social/fish/greywhale.png', mintwhale:'assets/social/fish/mintwhale.png',
  azurwhale:'assets/social/fish/azurwhale.png', starwhale:'assets/social/fish/starwhale.png',
  mvp_tidewarden:'assets/social/fish/mvp_tidewarden.png', mvp_rimewraith:'assets/social/fish/mvp_rimewraith.png',
  mvp_tidecourser:'assets/social/fish/mvp_tidecourser.png', mvp_dreadnought:'assets/social/fish/mvp_dreadnought.png',
  mvp_thousandeye:'assets/social/fish/mvp_thousandeye.png', mvp_auricmaw:'assets/social/fish/mvp_auricmaw.png',
  mvp_worldeye:'assets/social/fish/mvp_worldeye.png', mvp_volthorn:'assets/social/fish/mvp_volthorn.png',
  mvp_dreadclaw:'assets/social/fish/mvp_dreadclaw.png', mvp_stormcoil:'assets/social/fish/mvp_stormcoil.png',
};
const FISH_ART_VERSION='407'; // v384: 512px reference crops with decontaminated transparent edges
const FISH_IMG=new Map();
function preloadFishArt(){
 if(typeof Image!=='function'||typeof document==='undefined'||!document.createElement)return;
 for(const id of Object.keys(FISH_ART)){
  const img=new Image();
  img.onload=()=>{FISH_IMG.set(id,img);ART_CACHE.clear()};
  try{img.src=FISH_ART[id]+'?v='+FISH_ART_VERSION}catch{}
 }
}
const ART_CACHE=new Map();
function fishSpriteURL(spId,mut,px=96){
 const sp=spId&&typeof spId==='object'?spId:speciesById(spId);
 if(!sp)return null;
 const key=sp.id+'|'+(mut||'')+'|'+px;
 if(ART_CACHE.has(key))return ART_CACHE.get(key);
 let url=null;
 const c=fishSprite(sp,mut,px);
 if(c&&typeof c.toDataURL==='function'){try{url=c.toDataURL('image/png')}catch{url=null}}
 if(url&&!/^data:image\/png/.test(url))url=null;
 ART_CACHE.set(key,url);
 return url;
}
// v295: rods are painted, not emoji. The old shop/gear line used 🎣/🪵/🥇, which rendered as a
// different glyph on every OS and never showed the rod you actually owned. Each rod now has one
// tier colour that tints both the painted rod and its glow, so the tier reads at a glance.
const ROD_TIER_COLORS={twig:'#8b6b45',oak:'#b07a3c',brass:'#c8873a',silver:'#cfd8e0',golden:'#ffcb45',mythril:'#7fe3ff'};
// v299: how strong each tier's aura reads - wood is a hint, mythril is unmistakable.
const ROD_AURA={twig:.22,oak:.3,brass:.42,silver:.52,golden:.66,mythril:.78};
function rodSprite(rodId,px=96){
 const rod=RODS_BY_ID[rodId]||RODS[0];
 if(typeof document==='undefined'||!document.createElement)return null;
 let c,g;
 try{c=document.createElement('canvas');c.width=c.height=px;g=c.getContext&&c.getContext('2d')}catch{return null}
 if(!g||typeof g.quadraticCurveTo!=='function'||typeof g.createLinearGradient!=='function')return null;
 const tint=ROD_TIER_COLORS[rod.id]||ROD_TIER_COLORS.twig;
 const u=px/100,U=n=>n*u;
 // v299 (owner, "I don't see any aura on the rods"): the old halo was a single radial fill at
 // .18-.4 alpha behind a rod that covers most of it, so nothing read on screen. The aura is now
 // two passes - a wide soft bloom plus a tight ring around the blank - scaled by tier, so a
 // Golden or Mythril rod visibly glows in the shop, the dock and the catch card.
 const glowA=ROD_AURA[rod.id]||.34;
 try{
  const rg=g.createRadialGradient(U(52),U(48),U(4),U(52),U(50),U(52));
  rg.addColorStop(0,tint);rg.addColorStop(.45,tint);rg.addColorStop(1,'rgba(0,0,0,0)');
  g.globalAlpha=glowA;g.fillStyle=rg;g.fillRect(0,0,px,px);g.globalAlpha=1;
 }catch{}
 // the ring: the blank drawn wide and blurred-looking in the tier colour, under the rod itself
 try{
  g.save();g.globalAlpha=Math.min(1,glowA*1.5);g.strokeStyle=tint;g.lineWidth=U(13);g.lineCap='round';
  g.shadowColor=tint;g.shadowBlur=U(9);
  g.beginPath();g.moveTo(U(22),U(82));g.quadraticCurveTo(U(56),U(44),U(88),U(12));g.stroke();
  g.restore();
 }catch{}
 g.lineCap='round';g.lineJoin='round';
 // The blank: a tapered curve from the grip (bottom left) to the tip (top right).
 const tip={x:88,y:12},mid={x:56,y:44},grip={x:22,y:82};
 g.strokeStyle='#241a12';g.lineWidth=U(7);g.beginPath();g.moveTo(U(grip.x),U(grip.y));g.quadraticCurveTo(U(mid.x),U(mid.y),U(tip.x),U(tip.y));g.stroke();
 const bg=g.createLinearGradient(U(grip.x),U(grip.y),U(tip.x),U(tip.y));bg.addColorStop(0,tint);bg.addColorStop(.55,'#3b2c1e');bg.addColorStop(1,tint);
 g.strokeStyle=bg;g.lineWidth=U(4);g.beginPath();g.moveTo(U(grip.x),U(grip.y));g.quadraticCurveTo(U(mid.x),U(mid.y),U(tip.x),U(tip.y));g.stroke();
 // Cork grip with darker rings.
 g.strokeStyle='#2a1d13';g.lineWidth=U(11);g.beginPath();g.moveTo(U(grip.x),U(grip.y));g.lineTo(U(grip.x+9),U(grip.y-9));g.stroke();
 g.strokeStyle='#c9a06a';g.lineWidth=U(8);g.beginPath();g.moveTo(U(grip.x),U(grip.y));g.lineTo(U(grip.x+9),U(grip.y-9));g.stroke();
 g.strokeStyle='rgba(70,44,24,.85)';g.lineWidth=U(1.4);
 for(let i=1;i<4;i++){const t=i/4,x=grip.x+9*t,y=grip.y-9*t;g.beginPath();g.moveTo(U(x-3),U(y-4));g.lineTo(U(x+4),U(y+3));g.stroke()}
 // Reel body + crank, tinted to the tier.
 g.fillStyle='#1d1712';g.beginPath();g.arc(U(42),U(56),U(9),0,7);g.fill();
 g.fillStyle=tint;g.beginPath();g.arc(U(42),U(56),U(6.4),0,7);g.fill();
 g.strokeStyle='#1d1712';g.lineWidth=U(2);g.beginPath();g.moveTo(U(42),U(56));g.lineTo(U(48),U(62));g.stroke();
 g.fillStyle='#f3ead8';g.beginPath();g.arc(U(49),U(63),U(2.4),0,7);g.fill();
 // Line guides along the blank, then the line leaving the tip.
 g.strokeStyle='#e9eef2';g.lineWidth=U(1.6);
 for(const t of [.35,.6,.82]){const x=grip.x+(tip.x-grip.x)*t,y=grip.y+(tip.y-grip.y)*t-6*t;g.beginPath();g.arc(U(x),U(y),U(2.2),0,7);g.stroke()}
 g.beginPath();g.moveTo(U(tip.x),U(tip.y));g.quadraticCurveTo(U(94),U(34),U(84),U(66));g.strokeStyle='rgba(233,238,242,.8)';g.lineWidth=U(1.2);g.stroke();
 // Hook at the end of the line.
 g.strokeStyle='#d8dde2';g.lineWidth=U(1.8);g.beginPath();g.arc(U(82),U(70),U(4),-.4,3.2);g.stroke();
 return c;
}
const ROD_ART_CACHE=new Map();
function rodSpriteURL(rodId,px=96){
 const rod=RODS_BY_ID[rodId]||RODS[0];
 const key=rod.id+'|'+px;
 if(ROD_ART_CACHE.has(key))return ROD_ART_CACHE.get(key);
 let url=null;
 const c=rodSprite(rod.id,px);
 if(c&&typeof c.toDataURL==='function'){try{url=c.toDataURL('image/png')}catch{url=null}}
 if(url&&!/^data:image\/png/.test(url))url=null;
 ROD_ART_CACHE.set(key,url);
 return url;
}
// One markup helper so the shop, the dock and the catch card can never drift apart.
function rodHTML(rod,cls='fishing-rod-icon',px=64){
 const url=rodSpriteURL(rod.id,px);
 const tint=ROD_TIER_COLORS[rod.id]||ROD_TIER_COLORS.twig;
 const style=`--rod-tint:${tint}`;
 if(url)return `<img class="${cls} fishing-rod-art" data-rod-tier="${esc(rod.id)}" style="${style}" src="${url}" alt="" draggable="false">`;
 return `<span class="${cls}" data-rod-tier="${esc(rod.id)}" style="${style}">${rod.icon}</span>`;
}
// v309 (owner: "bugged bait icons"): the bait list drew emoji, and the worm and the fly glyphs only
// exist in Unicode 13 - on Windows 10 and older Android they render as empty boxes, so two of the
// four baits were blank next to a prawn and a honey pot. They are painted now, in the same flat
// style as the fish and the rods, and the emoji stays only as a fallback when canvas is missing.
const BAIT_ART_CACHE=new Map();
function baitSprite(baitId,px=64){
 const bait=BAITS_BY_ID[baitId];
 if(!bait||typeof document==='undefined'||!document.createElement)return null;
 let c,g;
 try{c=document.createElement('canvas');c.width=c.height=px;g=c.getContext&&c.getContext('2d')}catch{return null}
 if(!g||typeof g.quadraticCurveTo!=='function')return null;
 const u=px/100,U=n=>n*u;
 g.lineCap='round';g.lineJoin='round';
 const dot=(x,y,r,fill)=>{g.fillStyle=fill;g.beginPath();g.arc(U(x),U(y),U(r),0,Math.PI*2);g.fill()};
 if(baitId==='worm'){
  // a wriggling worm: three pink segments with a darker head and a highlight
  g.strokeStyle='#7d2740';g.lineWidth=U(15);g.beginPath();
  g.moveTo(U(24),U(76));g.quadraticCurveTo(U(30),U(34),U(52),U(40));g.quadraticCurveTo(U(74),U(46),U(70),U(22));g.stroke();
  g.strokeStyle='#e2617f';g.lineWidth=U(10);g.beginPath();
  g.moveTo(U(24),U(76));g.quadraticCurveTo(U(30),U(34),U(52),U(40));g.quadraticCurveTo(U(74),U(46),U(70),U(22));g.stroke();
  dot(24,76,8,'#f4919f');           // the thick end
  dot(70,22,7,'#b93a58');           // head
  g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=U(3);g.beginPath();
  g.moveTo(U(31),U(64));g.quadraticCurveTo(U(36),U(42),U(50),U(37));g.stroke();
 }else if(baitId==='shrimp'){
  // a curled shrimp tail: orange body, amber fan, two antennae
  g.strokeStyle='#8a3d10';g.lineWidth=U(13);g.beginPath();g.moveTo(U(34),U(66));g.quadraticCurveTo(U(24),U(38),U(52),U(28));g.stroke();
  g.strokeStyle='#f08a3c';g.lineWidth=U(8);g.beginPath();g.moveTo(U(34),U(66));g.quadraticCurveTo(U(24),U(38),U(52),U(28));g.stroke();
  g.fillStyle='#ffc46b';g.beginPath();g.moveTo(U(52),U(28));g.lineTo(U(74),U(18));g.lineTo(U(72),U(40));g.closePath();g.fill();
  g.strokeStyle='#8a3d10';g.lineWidth=U(3);g.beginPath();g.moveTo(U(34),U(70));g.quadraticCurveTo(U(20),U(80),U(30),U(88));g.stroke();
  dot(36,64,7,'#e2622a');
 }else if(baitId==='grub'){
  // a fat glowing grub: green body, pale belly, a lit tail
  dot(50,58,26,'rgba(150,255,120,.28)');
  g.fillStyle='#3f6b2a';g.beginPath();g.ellipse(U(50),U(58),U(22),U(15),-.35,0,Math.PI*2);g.fill();
  g.fillStyle='#8fd05a';g.beginPath();g.ellipse(U(50),U(55),U(19),U(12),-.35,0,Math.PI*2);g.fill();
  for(let i=0;i<4;i++)dot(38+i*10,55+Math.sin(i)*2,4.5,'rgba(255,255,255,.35)');
  dot(28,64,11,'rgba(226,255,150,.85)');  // the glow sac
  dot(28,64,6,'#f6ffc9');
  dot(72,46,4,'#22301a');
 }else if(baitId==='chum'){
  // Leviathan Chum: a rich chunk of deep-sea meat tied with sinew and glistening with bioluminescent brine
  dot(50,52,24,'rgba(210,30,60,.22)');
  g.fillStyle='#5a101f';g.beginPath();g.ellipse(U(50),U(54),U(26),U(18),-.2,0,Math.PI*2);g.fill();
  g.fillStyle='#a82038';g.beginPath();g.ellipse(U(48),U(52),U(23),U(15),-.2,0,Math.PI*2);g.fill();
  g.fillStyle='#e03e5c';g.beginPath();g.ellipse(U(46),U(49),U(18),U(11),-.2,0,Math.PI*2);g.fill();
  g.fillStyle='#f5e4c8';g.beginPath();g.ellipse(U(54),U(48),U(7),U(5),.3,0,Math.PI*2);g.fill();
  dot(54,48,3,'#8a5a40');
  dot(32,44,3.5,'#4ff2e6');dot(38,62,2.5,'#4ff2e6');dot(62,58,3,'#4ff2e6');
  dot(26,52,2,'rgba(255,255,255,.7)');dot(68,44,2,'rgba(255,255,255,.7)');
  g.strokeStyle='#f5e4c8';g.lineWidth=U(2.5);g.beginPath();
  g.moveTo(U(36),U(40));g.quadraticCurveTo(U(48),U(55),U(58),U(68));g.stroke();
 }else{
  // Royal Jelly: an amber jar with a wax lid and a crown band
  g.fillStyle='#7a4a06';g.beginPath();g.roundRect?g.roundRect(U(28),U(30),U(44),U(52),U(12)):g.rect(U(28),U(30),U(44),U(52));g.fill();
  g.fillStyle='#f2b53c';g.beginPath();g.roundRect?g.roundRect(U(31),U(33),U(38),U(46),U(10)):g.rect(U(31),U(33),U(38),U(46));g.fill();
  g.fillStyle='rgba(255,255,255,.42)';g.beginPath();g.ellipse(U(42),U(48),U(7),U(12),0,0,Math.PI*2);g.fill();
  g.fillStyle='#c98a1c';g.fillRect(U(26),U(24),U(48),U(11));       // wax lid
  g.fillStyle='#ffd979';g.fillRect(U(26),U(24),U(48),U(4));
  g.fillStyle='#8a5a10';g.beginPath();g.moveTo(U(40),U(80));g.lineTo(U(44),U(74));g.lineTo(U(48),U(80));g.lineTo(U(52),U(74));g.lineTo(U(56),U(80));g.closePath();g.fill();
 }
 return c;
}
function baitSpriteURL(baitId,px=64){
 const key=baitId+'|'+px;
 if(BAIT_ART_CACHE.has(key))return BAIT_ART_CACHE.get(key);
 let url=null;
 const c=baitSprite(baitId,px);
 if(c&&typeof c.toDataURL==='function'){try{url=c.toDataURL('image/png')}catch{url=null}}
 if(url&&!/^data:image\/png/.test(url))url=null;
 BAIT_ART_CACHE.set(key,url);
 return url;
}
function baitHTML(bait,px=64){
 const b=typeof bait==='string'?BAITS_BY_ID[bait]:bait;
 if(!b)return '';
 // v310 (owner: "bait images is too big"): the bitmap was always 96px and had no CSS size, so it
 // filled the row. It is painted at a crisp 64 and laid out by .fishing-bait-art / .fishing-shop-bait.
 const url=baitSpriteURL(b.id,64);
 return url?`<img class="fishing-bait-art" src="${url}" alt="" draggable="false">`:`<span>${b.icon}</span>`;
}
function glyphHTML(sp,mut,cls='fishing-glyph'){
 const url=fishSpriteURL(sp,mut,cls==='fishing-glyph'?64:128);
 if(url)return `<img class="${cls} fishing-art${mut?' mut-'+mut:''}" src="${url}" alt="${esc(sp.name)}" draggable="false">`;
 return `<span class="${cls}${mut?' mut-'+mut:''}" style="filter:hue-rotate(${sp.hue}deg)${mutFilter(mut)}">${sp.glyph}</span>`;
}
// v294: the 🪙 emoji needs Unicode 13 font support and rendered as a blank square box on
// Windows 10 / older Android. Fishcoins now draw as a CSS coin that works everywhere.
const COIN_HTML='<i class="fishcoin" aria-hidden="true"></i>';
function renderDockGear(){
 if(!els)return;
 const st=state(),rod=equippedRod(),bait=selectedBait();
 els.gearLine.innerHTML=`<span>${COIN_HTML} ${fmt(st.coins)}</span><span>${rodHTML(rod,'fishing-gear-rod',40)} ${esc(rod.name)}</span><span>${bait?`${baitHTML(bait)} ${esc(bait.name)} ×${st.bait[bait.id]}`:'No bait'}</span>`;
 els.bagCount.textContent=st.bag.length+'/'+bagMax(st);
 if(els.coins)els.coins.innerHTML=COIN_HTML+' '+fmt(st.coins);
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
  const isFocus=ui.reel&&ui.reel.luckyFocus;
  stage.innerHTML='<div class="fishing-reel"><div class="fishing-track"><div id="fishingBarEl" class="fishing-bar'+(isFocus?' lucky-focus':'')+'"></div><span id="fishingFishEl" class="fishing-fish">'+((u=>u?'<img src="'+u+'" alt="" draggable="false">':'🐟')(fishSpriteURL('minnow',null,64)))+'</span></div><div class="fishing-progress"><i id="fishingProgressEl"></i></div><div class="fishing-reel-row"><span id="fishingCrank" class="fishing-crank">🎣</span><span id="fishingReelHint">'+(isFocus?'✨ Lucky Focus! Widen bar active · HOLD to pull ▶':'HOLD to pull ▶ · release to drift ◀')+'</span><span id="fishingPerfectStar" title="Perfect so far">⭐</span></div></div>';
  status(isFocus?(ui.auto?'✨ Lucky Focus! Auto reeling with widened bar…':'✨ Lucky Focus! Keep the fish inside your widened bar!'):(ui.auto?'Auto reeling…':'Keep the fish inside your bar to fill the line!'));
  return;
 }
 if(ui.phase==='result'){
  const r=ui.result;
  if(!r){setPhase('ready');return}
  if(r.kind==='catch'){
   const sp=speciesById(r.entry.sp),rar=rarityById(sp.rarity),worth=value(r.entry);
   stage.innerHTML=`<div class="fishing-card" data-rarity="${sp.rarity}" style="--rar:${rar.color}">${r.isNew?'<span class="fishing-new">NEW SPECIES!</span>':''}${glyphHTML(sp,r.entry.mut,'fishing-card-glyph')}<div class="fishing-card-info"><strong>${esc(sp.name)}</strong><span class="fishing-chip" style="background:${rar.color}">${rar.label}</span>${r.entry.mut?`<span class="fishing-chip fishing-mut">${MUTATIONS[r.entry.mut].badge} ${MUTATIONS[r.entry.mut].label}</span>`:''}<p>${r.entry.w} kg · worth ${COIN_HTML} ${fmt(worth)}${r.entry.perfect?' · Perfect ⭐':''}${r.autoSold?` · <b>auto-sold +${fmt(r.autoSold)}</b> ${COIN_HTML}`:''}</p></div><div class="fishing-card-btns"><button id="fishingAgain" type="button">🎣 Cast again</button>${r.autoSold?'':`<button id="fishingBrag" type="button">📣 Show off</button><button id="fishingSellNow" type="button">💰 Sell ${fmt(worth)}</button>`}</div></div>`;
   doc.getElementById('fishingAgain').onclick=()=>{ui.result=null;setPhase('ready')};
   const brag=doc.getElementById('fishingBrag');if(brag)brag.onclick=()=>{showOff(r.entry.id);ui.result=null;setPhase('ready')};
   const sellNow=doc.getElementById('fishingSellNow');if(sellNow)sellNow.onclick=()=>{if(updatingPaused())return;const res=sellFish(state(),r.entry.id);if(res&&res.ok){persist();sound('coin');status('Sold for '+fmt(res.coins)+' Fishcoins.')}ui.result=null;setPhase('ready')};
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
function updatingPaused(){
 return !!((opts&&typeof opts.isUpdating==='function'&&opts.isUpdating())||(root.CLOUD&&root.CLOUD.updating));
}
function holdDown(){
 if(updatingPaused())return;
 if(ui.phase==='ready'){
  if(state().bag.length>=bagMax(state())){status('Bag full ('+bagMax(state())+') — sell, release or upgrade the bag first.');toggleBag(true);if(ui.auto)setAuto(false);return}
  ui.holding=true;ui.chargeT0=now();setPhase('charge');return;
 }
 if(ui.phase==='bite'){hook();return}
 if(ui.phase==='reel'){ui.holding=true;const c=doc.getElementById('fishingCrank');c&&c.classList.add('spin');return}
 if(ui.phase==='result'){ui.result=null;setPhase('ready');return}
}
function holdUp(){
 if(updatingPaused())return;
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
 ui.mods={rod:rod.id,luck:rod.luck+(bait?bait.luck:0),weight:rod.strength+(bait?bait.weight:0),mutation:bait?bait.mutation:1,control:rod.control,lure:rod.lure,mvpHookBonus:bait?bait.mvpHookBonus||0:0,mvpBarBonus:bait?bait.mvpBarBonus||0:0};
 st.stats.casts++;persist();renderDockGear();
 // v355 (owner: "the cast must follow the direction you face, and the line must never cross
 // the bridge"): march a ray along the fisher's facing and land the bobber in the FIRST run of
 // open water it meets. Casting from the bridge drops the bobber beside the deck; casting from
 // either shore keeps the line on your own side of the bridge; turning turns your cast. If the
 // facing finds no water at all (facing inland), the aim falls back toward the pond center and
 // then to the nearest wet compass ray, so a stand can never produce a dry cast.
 const water=(x,z)=>R().pondContains(p,x,z,-1.1)&&!R().onBridge?.(x,z)&&!R().cragBlocked?.(x,z);
 const waterRun=a=>{
  const ux=Math.cos(a),uz=Math.sin(a);let run=null;
  for(let t=1.2;t<=46;t+=.4){
   if(water(s.x+ux*t,s.z+uz*t)){if(!run)run={t0:t,t1:t,ux,uz};run.t1=t}
   else if(run)break;
  }
  return run;
 };
 const toCenter=Math.atan2(p.z-s.z,p.x-s.x),aims=[];
 if(Number.isFinite(s.face))aims.push(s.face);
 if(Math.hypot(p.x-s.x,p.z-s.z)>.75)aims.push(toCenter);
 for(let k=1;k<8&&aims.length<6;k++){aims.push(toCenter+k*Math.PI/4,toCenter-k*Math.PI/4)}
 let run=null;for(const a of aims){run=waterRun(a);if(run)break}
 let target;
 if(run){
  const t=run.t0+(run.t1-run.t0)*(.3+.6*ui.castR.dist);
  target={x:s.x+run.ux*t,z:s.z+run.uz*t};
  const jx=(Math.random()-.5)*.8,jz=(Math.random()-.5)*.8;
  if(water(target.x+jx,target.z+jz)){target.x+=jx;target.z+=jz}
 }else target=R().clampPond(p,p.x-(p.x-s.x)*.5,p.z-(p.z-s.z)*.5,1.2);
 ui.rigTarget=target;
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
 let rng=Math.random;
 const hookRate=Math.min(.50,MVP_HOOK_CHANCE+((ui.mods&&ui.mods.mvpHookBonus)||0));
 // MVP: when a 10-min spawn is active and we have not yet caught it, 10% (or up to 20% with Chum) become the MVP.
 if(mvpActive&&!mvpClaimed().has(mvpActive.id)&&rng()<hookRate){
  const sp=speciesById(mvpActive.sp);
  if(sp){
   const wb=Math.max(0,Math.min(3,(ui.mods&&ui.mods.weight)||0));
   const mm=Math.max(0,Math.min(6,(ui.mods&&ui.mods.mutation)||1));
   const heft=Math.pow(rng(),2/(1+wb));
   const w=Math.round((sp.min+(sp.max-sp.min)*heft)*100)/100;
   const roll=rng();let acc=0,mut=null;
   for(const [id,m] of Object.entries(MUTATIONS)){acc+=Math.min(.5,m.chance*mm);if(roll<acc){mut=id;break}}
   // Carry the exact spawn through the reel. If another worker spawn replaces it before the
   // reel ends, finishReel must not mark the new spawn as caught.
   ui.roll={sp:sp.id,rarity:'mvp',w,mut,mvpSpawnId:mvpActive.id};
  } else ui.roll=rollCatch(rng,!!(ui.castR&&ui.castR.perfect),ui.mods);
 } else ui.roll=rollCatch(rng,!!(ui.castR&&ui.castR.perfect),ui.mods);
 ui.reel=makeReel(ui.roll,Math.random,(ui.mods&&ui.mods.control)||0,(ui.mods&&ui.mods.mvpBarBonus)||0);
 ui.last=now();
 ui.autoSampleAt=0;
 setPhase('reel');
 f&&f.reel(.3);
}
function finishReel(kind){
 const f=sceneFishing();
 ui.holding=false;
 // MVP: a completed reel is tied to the spawn that produced ui.roll, not whatever happens to be
 // active now. A despawn/replacement between hook and finish is an escape, never a marker for a
 // different fish. The 30% land roll is still exactly the same once the identity is valid.
 let mvpSpawnId=null;
 if(kind==='catch'&&ui.roll&&ui.roll.rarity==='mvp'){
  const active=mvpActive,rollSpawn=String(ui.roll.mvpSpawnId||'');
  if(!active||!rollSpawn||String(active.id)!==rollSpawn||active.sp!==ui.roll.sp||mvpClaimed().has(active.id))kind='escape';
  else if(Math.random()>=MVP_REEL_CATCH_CHANCE)kind='mvp_escape';
  else mvpSpawnId=active.id;
 }
 if(kind==='catch'){
  const st=state(),isNew=!st.dex[ui.roll.sp];
  // Capture all economic state first. In particular, an MVP's Index/bag (or its auto-sale
  // proceeds) and one-per-spawn marker become one saved mutation before any sound, DOM, scene or
  // room-announcement code can throw or be interrupted.
  const heldBefore=new Set(FISHING_TITLES.filter(t=>titleUnlocked(st,t)).map(t=>t.id));
  const entry=addCatch(st,{...ui.roll,perfect:ui.reel.perfect});
  let autoSold=0;
  if(entry&&shouldAutoSell(st,entry)){
   const res=sellFish(st,entry.id);
   if(res&&res.ok)autoSold=res.coins;
  }
  if(mvpSpawnId)markMvpClaimed(mvpSpawnId,false);
  persist();

  // Presentation deliberately starts after the one durable write above.
  const fresh=FISHING_TITLES.filter(t=>!heldBefore.has(t.id)&&titleUnlocked(st,t));
  if(fresh.length)status('New title unlocked · '+fresh.map(t=>t.name).join(' · '));
  if(els&&!els.titlesView.hidden)renderTitles();
  const sp=speciesById(ui.roll.sp);
  sound(entry&&entry.perfect?'perfect':'catch');
  if(autoSold){ui.result={kind:'catch',entry:entry||{...ui.roll,id:'',at:Date.now(),perfect:ui.reel.perfect},isNew,autoSold};sound('coin')}
  else ui.result={kind:'catch',entry:entry||{...ui.roll,id:'',at:Date.now(),perfect:ui.reel.perfect},isNew};
  if(f)f.catchFly({spId:sp.id,mut:entry?entry.mut:ui.roll.mut,glyph:sp.glyph,hue:sp.hue},null,()=>{});
  if(!entry)status('Bag full — fish released, but the catch is recorded in your Index!');
  // v297: a pond monster or a secret find goes to the room's Local chat. Fired from the catch
  // itself (not the Show off button) so auto-fishing announces too.
  if(sp&&mvpSpawnId){
   if(typeof opts.announce==='function'){try{opts.announce({sp:sp.id,name:sp.name,w:ui.result.entry.w,kind:'secret'})}catch{}}
   if(els) status('MVP CAUGHT! '+sp.name+' '+ui.result.entry.w+' kg — one per spawn claimed.');
  } else if(sp&&typeof opts.announce==='function'&&(sp.mega||sp.rarity==='secret')){
   try{opts.announce({sp:sp.id,name:sp.name,w:ui.result.entry.w,kind:sp.rarity==='secret'?'secret':'mega'})}catch{}
  }
 }else{
  state().stats.escapes++;persist();
  sound('fail');
  f&&f.escapeSplash();
  ui.result={kind:(kind==='mvp_escape'?'escape':kind),mvpFail:kind==='mvp_escape'};
  if(kind==='mvp_escape') status('The MVP broke free! Try again before it despawns.');
 }
 ui.roll=null;ui.reel=null;
 ui.autoNext=now()+1300;
 setPhase('result');
}
function tick(t){
 if(ui.phase==='off')return;
 ui.raf=requestAnimationFrame(tick);
 const prev=ui.last;
 const dt=prev?Math.min(.1,Math.max(0,(t-prev)/1000)):0;ui.last=t;
 if(updatingPaused()){
  const shift=prev?Math.max(0,t-prev):0;
  if(shift>0){
   if(ui.biteAt)ui.biteAt+=shift;
   if(ui.biteEnd)ui.biteEnd+=shift;
   if(ui.autoNext)ui.autoNext+=shift;
   if(ui.autoHookAt)ui.autoHookAt+=shift;
   if(ui.chargeT0)ui.chargeT0+=shift;
   if(ui.shakeAt)ui.shakeAt+=shift;
  }
  return;
 }
 if(['ready','charge','wait','bite','reel'].includes(ui.phase)&&distToPond()>6.5){
  if(ui.auto&&walkBackToPond('Moved away from the pond — Auto is walking back.'))return;
  stopFishing('You stepped away from the pond.');
  return;
 }
 if(ui.phase==='walking'){
  if(distToPond()<=2.4){ui.walkT0=0;ui.walkTries=0;setPhase('ready');ui.autoNext=t+500;return}
  // Keep asking: the plaza can teleport us again mid-walk, and a single dropped move must not strand
  // an AFK session at the spawn point.
  if(!ui.walkNext||t>=ui.walkNext){ui.walkNext=t+2500;ui.walkTries=(ui.walkTries||0)+1;issueWalk()}
  // Half a minute of trying, not nine seconds: a respawn on the far side of the plaza is a long walk
  // and the position has to arrive over the wire before it can start.
  if(ui.walkT0&&t-ui.walkT0>30000){ui.walkT0=0;stopFishing('Could not reach the pond — Auto fishing stopped.');return}
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
   if(t>=ui.autoSampleAt){ui.autoSampleAt=t+AUTO_REEL_SAMPLE_MS;ui.autoTarget=autoReelTarget(ui.reel)}
   ui.holding=ui.reel.bar<ui.autoTarget;
  }
  const out=reelStep(ui.reel,dt,ui.holding);
  const bar=doc.getElementById('fishingBarEl'),fish=doc.getElementById('fishingFishEl'),prog=doc.getElementById('fishingProgressEl'),star=doc.getElementById('fishingPerfectStar'),crank=doc.getElementById('fishingCrank');
  if(bar){bar.style.width=(ui.reel.barW*100)+'%';bar.style.left=((ui.reel.bar-ui.reel.barW/2)*100)+'%';bar.classList.toggle('on',ui.reel.on);bar.classList.toggle('held',ui.holding);bar.classList.toggle('lucky-focus',!!ui.reel.luckyFocus)}
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
function startFishing(pondIdx,at){
 ensureDom();
 if(!els||!R()||!R().PONDS||!R().PONDS.length)return;
 const s=selfPos();
 if(!s){if(opts&&opts.notice)opts.notice('Fishing needs your character in the plaza.');return}
 ui.pond=Number.isInteger(pondIdx)&&R().PONDS[pondIdx]?pondIdx:R().PONDS.reduce((best,p,i)=>{
  const d=Math.hypot(s.x-p.x,s.z-p.z);return d<best.d?{i,d}:best;
 },{i:0,d:Infinity}).i;
 els.spot.textContent='🎣 West Lake';
 const p=pondCenter();
 if(distToPond()>2.4){
  // v294: phase goes to 'walking' BEFORE moveTo so the movement lock (busy()) never blocks
  // fishing's own walk to the pond.
  const stand=standPoint(p,at&&Number.isFinite(at.x)?at:s,s);
  setPhase('walking');
  ui.walkT0=now();
  if(stand&&opts.moveTo)opts.moveTo(stand.x,stand.z);
 }else setPhase('ready');
 startLoop();
}
// v296 (owner): AFK fishing must survive being moved by the server. A respawn, a room change or a
// lost plaza spot used to end the session with "You stepped away from the pond."; with Auto on we
// walk back to the pond and carry on instead. A manual session still stops, as v294 promised.
// v303: the walk itself. `walkTo` is the plaza's no-questions move (bound in social.js to the same
// path the click handler uses, minus the leave-confirm); `moveTo` stays as the fallback for callers
// that only bind that.
function walkTarget(){
 const p=pondCenter(),s=selfPos();
 return p&&s?standPoint(p,s):null;
}
function issueWalk(){
 const stand=walkTarget();
 const walk=opts&&(typeof opts.walkTo==='function'?opts.walkTo:(typeof opts.moveTo==='function'?opts.moveTo:null));
 if(!stand||typeof walk!=='function')return false;
 walk(stand.x,stand.z);
 return true;
}
// v303 (owner): "afk fishing still doesnt work - sometimes it doesnt walk back and gets stuck at the
// respawn while sitting". Two things were wrong. The walk went out through the plaza's normal move
// action, which raises the "Stop fishing and move?" dialog for anyone with a line in the water, so an
// AFK angler was asked a question instead of being walked - and the player was often still SEATED,
// which is how they were left after a respawn. It now uses the no-prompt walk, and it no longer
// gives up when the position has not arrived yet: it walks, re-issues the walk every couple of
// seconds (a respawn can move you again mid-walk) and only stops after half a minute.
function walkBackToPond(reason){
 const walk=opts&&(typeof opts.walkTo==='function'?opts.walkTo:(typeof opts.moveTo==='function'?opts.moveTo:null));
 if(typeof walk!=='function')return false;
 ui.result=null;ui.roll=null;ui.reel=null;ui.holding=false;
 clearShake();
 setPhase('walking');
 ui.walkT0=ui.walkT0||now();
 ui.walkTries=(ui.walkTries||0)+1;
 issueWalk();
 ui.walkNext=now()+2500;
 status(reason||'Walking back to the pond…');
 return true;
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
 if(show)globalThis.PGSocial?.focusHubPanel?.('fishing');
 els.panel.hidden=!show;
 if(show){applyPos(els.panel,'panel');syncSettings();renderPanel()}
}
function switchTab(tab){
 if(!['bag','index','shop','titles'].includes(tab))tab='bag';
 ui.tab=tab;
 for(const b of els.panel.querySelectorAll('#fishingTabs button'))b.setAttribute('aria-selected',String(b.dataset.ftab===tab));
 els.bagView.hidden=tab!=='bag';
 els.indexView.hidden=tab!=='index';
 els.shopView.hidden=tab!=='shop';
 els.titlesView.hidden=tab!=='titles';
 renderPanel();
}
function renderPanel(){
 if(!els||els.panel.hidden)return;
 renderDockGear();
 if(ui.tab==='bag')renderBag();
 else if(ui.tab==='index')renderIndex();
 else if(ui.tab==='titles')renderTitles();
 else renderShop();
}
function syncSettings(){
 const st=state();
 const sn=doc.getElementById('fishingSound'),so=doc.getElementById('fishingSort'),as=doc.getElementById('fishingAutoSell');
 if(sn)sn.checked=st.settings.sound;
 if(as)as.checked=st.settings.autoSell;
 if(so)so.value=ui.sort;
 // v297: with auto-sell on there is usually nothing for the bulk button to do - say why.
 const sd=doc.getElementById('fishingSellDupes');
 if(sd)sd.title=st.settings.autoSell?'Auto-sell is on: dupes are sold after each catch, so this only clears fish caught before you turned it on.':'Sells everything except your heaviest of each species, every mutated fish and every 🔒 locked fish';
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
 els.records.innerHTML=`<span>Catches <b>${fmt(st.stats.catches)}</b></span><span>Species <b>${species}/${SPECIES.length}</b></span><span>Perfect <b>${fmt(st.stats.perfects)}</b></span><span>${best?`Best <b>${esc(speciesById(best.sp).name)} ${best.w} kg</b>`:'Best <b>—</b>'}</span><span>Bag <b>${st.bag.length}/${bagMax(st)}</b></span>`;
 const bag=sortedBag();
 if(!bag.length){els.grid.innerHTML='<p class="fishing-empty">No fish yet — stand by a South Lawn pond and press 🎣 Fishing to cast.</p>';els.detail.hidden=true;ui.selected=null;return}
 els.grid.replaceChildren(...bag.map(e=>{
  const sp=speciesById(e.sp),r=rarityById(sp.rarity);
  const b=doc.createElement('button');b.type='button';b.className='fishing-slot';b.dataset.rarity=sp.rarity;b.style.setProperty('--rar',r.color);
  b.setAttribute('role','option');b.setAttribute('aria-selected',String(ui.selected===e.id));
  if(ui.selected===e.id)b.classList.add('selected');
  b.innerHTML=glyphHTML(sp,e.mut)+`<small>${e.w} kg</small>${e.lock?'<i class="fishing-slot-lock">🔒</i>':''}${e.mut?`<i class="fishing-slot-mut">${MUTATIONS[e.mut].badge}</i>`:''}${e.perfect?'<i class="fishing-slot-star">⭐</i>':''}`;
  b.title=`${sp.name} · ${r.label} · worth ${fmt(value(e))} Fishcoins${e.lock?' · 🔒 locked':''}`;
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
 els.detail.innerHTML=`<div class="fishing-detail-main">${glyphHTML(sp,e.mut,'fishing-detail-glyph')}<div><strong>${esc(sp.name)}</strong> <span class="fishing-chip" style="background:${r.color}">${r.label}</span>${e.mut?` <span class="fishing-chip fishing-mut">${MUTATIONS[e.mut].badge} ${MUTATIONS[e.mut].label}</span>`:''}${e.lock?' <span class="fishing-chip fishing-locked">🔒 Locked</span>':''}<p>${e.w} kg · worth ${COIN_HTML} ${fmt(worth)}${e.perfect?' · Perfect catch ⭐':''}${e.at?' · '+new Date(e.at).toLocaleDateString():''}</p></div></div><div class="fishing-detail-btns"><button id="fishingShowOffBtn" type="button">📣 Show off</button><button id="fishingLockBtn" type="button" title="A locked fish can never be sold or released — not by Sell, Sell dupes or Auto-sell">${e.lock?'🔓 Unlock':'🔒 Lock'}</button><button id="fishingSellBtn" type="button"${e.lock?' disabled title="Locked — unlock this fish to sell it"':''}>💰 Sell ${fmt(worth)}</button><button id="fishingReleaseBtn" type="button"${e.lock?' disabled title="Locked — unlock this fish to release it"':''}>🌊 Release</button></div>`;
 doc.getElementById('fishingShowOffBtn').onclick=()=>showOff(e.id);
 doc.getElementById('fishingLockBtn').onclick=()=>{if(updatingPaused())return;const res=toggleLock(st,e.id);if(res){persist();status(res.lock?'🔒 Locked — this fish can no longer be sold or released.':'🔓 Unlocked.');renderBag();renderDockGear()}};
 doc.getElementById('fishingSellBtn').onclick=()=>{if(updatingPaused())return;const res=sellFish(st,e.id);if(res&&res.ok){persist();sound('coin');status('Sold for '+fmt(res.coins)+' Fishcoins.');ui.selected=null;renderPanel();renderDockGear()}else if(res&&res.reason==='locked')status('🔒 That fish is locked — unlock it first.')};
 const rel=doc.getElementById('fishingReleaseBtn');
 rel.onclick=()=>{
  if(updatingPaused())return;
  if(e.lock){status('🔒 That fish is locked — unlock it first.');return}
  if(rel.dataset.confirm){const i=st.bag.findIndex(x=>x.id===e.id);if(i>=0)st.bag.splice(i,1);persist();ui.selected=null;renderBag();renderDockGear()}
  else{rel.dataset.confirm='1';rel.textContent='Release?';setTimeout(()=>{if(rel.isConnected){delete rel.dataset.confirm;rel.textContent='🌊 Release'}},2600)}
 };
}
// 📖 The full index (all SPECIES.length entries) with no-luck catch rates; undiscovered entries show as silhouettes.
function renderIndex(){
 const st=state();
 // v304: the rod gates the boss tiers, so an index row above the rod's ceiling says which rod lifts
 // it instead of showing odds the player cannot hit yet.
 const ceil=rodCeiling(st.rod),ceilIdx=RARITY_INDEX[ceil]||0;
 // v303 (owner): the index used to list the catalog in construction order, so everything added
 // after the first drop sat in one mixed-rarity block at the bottom. Sort by rarity instead - the
 // order inside a rarity stays the catalog's own.
 const ORDER=[...SPECIES].sort((x,y)=>RARITY_INDEX[x.rarity]-RARITY_INDEX[y.rarity]);
 // v304: odds are computed with the equipped rod and bait, not as a bare-rod number.
 const erod=equippedRod(),ebait=selectedBait();
 const eluck=(erod?erod.luck:0)+(ebait?ebait.luck:0);
 const rows=ORDER.map(sp=>{
  const r=rarityById(sp.rarity),d=st.dex[sp.id],found=d&&d.n>0;
  const pct=rateWith(sp.id,eluck,ceil)*100;
  const odds='1 in '+fmt(Math.round(1/Math.max(1e-9,rateWith(sp.id,eluck,ceil))));
  const gated=RARITY_INDEX[sp.rarity]>ceilIdx,grod=gateRodFor(sp.rarity),gname=grod&&RODS_BY_ID[grod]?RODS_BY_ID[grod].name:'a better rod';
  return `<div class="fishing-dex-row${found?'':' undiscovered'}${gated?' gated':''}" style="--rar:${r.color}">
   ${(u=>u?`<img class="fishing-dex-glyph fishing-art" style="filter:${found?'none':'brightness(0) opacity(.45)'}" src="${u}" alt="" draggable="false">`:`<span class="fishing-dex-glyph" style="filter:${found?`hue-rotate(${sp.hue}deg)`:'brightness(0) opacity(.45)'}">${sp.glyph}</span>`)(fishSpriteURL(sp,null,64))}
   <span class="fishing-dex-name">${found?esc(sp.name):'???'}<small>${sp.min}–${sp.max} kg${found?` · best ${d.bw} kg · ×${fmt(d.n)}`:''}${found&&d.mut.length?' · '+d.mut.map(m=>MUTATIONS[m].badge).join(''):''}</small></span>
   <span class="fishing-chip" style="background:${r.color}">${r.label}</span>
   <span class="fishing-dex-rate" title="${gated?'Mostly locked until you own the '+esc(gname)+' — about '+Math.round(GATE_ESCAPE*100)+'% of these bites still get through':'Your rod and bait rate, before PERFECT timing'}">${gated?`🔒 <small>needs ${esc(gname)}</small>`:`${pct>=1?pct.toFixed(1)+'%':pct.toFixed(2)+'%'}<small>${odds}</small>`}</span>
  </div>`;
 }).join('');
 const found=Object.keys(st.dex).filter(k=>st.dex[k].n>0).length;
 els.indexView.innerHTML=`<p class="fishing-dex-head">Discovered <b>${found}/${SPECIES.length}</b> · odds use your ${esc(erod?erod.name:'rod')}${ebait?' + '+esc(ebait.name):''} (before PERFECT timing). Every fish is a straight roll — a better rod just reaches further up the table.</p><div class="fishing-dex-list">${rows}</div>`;
}
// 🏅 v295: the ten fishing titles. Worn above the head in the plaza for every player to see;
// a title is only wearable once its requirement is actually met in the saved fishing blob.
const TITLE_TONE={bronze:'#c08a52',copper:'#a86f4a',silver:'#cdd6de',jade:'#6ee0a8',sapphire:'#6cb8ff',amethyst:'#c792ea',obsidian:'#8f96b8',crimson:'#ff7a7a',gold:'#ffcc55',valkyrie:'#f0e6ff',
 // v299: tones for the ten long-haul titles.
 tide:'#5fc9d8',abyss:'#7b8fd8',ember:'#ff9a5c',frost:'#bfe9ff',dawn:'#ffd9a0'};
function renderTitles(){
 const st=state(),worn=equippedTitle(st);
 // v310 (owner): "titles are ... not arranged rarity". The old list sorted worn → earned → locked,
 // so the ladder was scattered. It now reads the way the fish index reads - Common, Uncommon, Rare,
 // Legendary, Mythical, Secret - and within a tier from the shortest haul to the longest. The worn
 // title is still easy to spot: its row is outlined and its button says Worn.
 const scored=FISHING_TITLES.map(t=>{
  const done=titleUnlocked(st,t),cur=Math.min(t.goal,t.cur(st));
  return {t,done,cur,isWorn:!!(worn&&worn.id===t.id),frac:cur/Math.max(1,t.goal)};
 }).sort((a,b)=>(RARITY_INDEX[a.t.tier]??0)-(RARITY_INDEX[b.t.tier]??0)||(a.t.rank||0)-(b.t.rank||0));
 const rows=scored.map(({t,cur,done,isWorn})=>{
  const pct=Math.round(Math.min(1,cur/Math.max(1,t.goal))*100);
  const r=rarityById(t.tier)||rarityById('common');
  const tone=TITLE_TONE[t.tone]||r.color;
  // Each title has its own supplied mark. Keep the old painted medal if the art registry is unavailable.
  const symbol=root.PGSocialTitleArt?.icon('fishing',t.id),badge=symbol?'':titleBadgeURL(t.tier,64);
  return `<div class="fishing-title-row${done?'':' locked'}${isWorn?' worn':''}" style="--tone:${r.color}" data-tier="${esc(t.tier)}" data-rank="${t.rank}">
   ${symbol?`<span class="fishing-title-badge fishing-title-sigil" aria-hidden="true" style="--tone:${tone}">${symbol}</span>`:badge?`<img class="fishing-title-badge" src="${badge}" alt="" draggable="false" style="--tone:${tone}">`:`<span class="fishing-title-mark">${t.mark}</span>`}
   <span class="fishing-title-name">${esc(t.name)}<small>${done?`✓ ${esc(t.req)}`:`${fmt(cur)}/${fmt(t.goal)} — ${esc(t.req)}`}</small><i class="fishing-title-bar"><b style="width:${done?100:pct}%"></b></i></span>
   <span class="fishing-chip" style="background:${r.color}">${r.label}</span>
   ${isWorn?'<button type="button" disabled>Worn</button>':done?`<button type="button" data-title="${t.id}">Wear</button>`:'<button type="button" disabled>🔒</button>'}
  </div>`;
 }).join('');
 els.titlesView.innerHTML=`<p class="fishing-dex-head">Worn below your character in the plaza. <b>${FISHING_TITLES.filter(t=>titleUnlocked(st,t)).length}/${FISHING_TITLES.length}</b> earned · listed by rarity.</p><div class="fishing-title-list">${rows}</div>${worn?'<div class="fishing-title-none"><button type="button" data-title="none">Wear no fishing title</button></div>':''}`;
 for(const b of els.titlesView.querySelectorAll('button[data-title]'))b.onclick=()=>{
  if(updatingPaused())return;
  const r=equipTitle(st,b.dataset.title==='none'?null:b.dataset.title);
  if(r.ok){persist();status(r.title?('Wearing '+FISHING_TITLE_BY_ID[r.title].name+'.'):'Fishing title removed.');renderPanel();if(opts&&typeof opts.titleChanged==='function')opts.titleChanged()}
 };
}
// 🛒 Rods & bait, paid with Fishcoins earned by selling fish.
function renderShop(){
 const st=state();
 const rodRows=RODS.map(rod=>{
  const owned=st.rods.includes(rod.id),equipped=st.rod===rod.id;
  const ceil=rodCeiling(rod.id),before=rodCeiling(RODS[Math.max(0,ROD_RANK[rod.id]-1)].id);
  const unlock=ceil!==before?` · 🔓 unlocks ${rarityById(ceil).label}+`:'';
  const stats=`🍀 +${Math.round(rod.luck*100)}% · 🎯 +${Math.round(rod.control*100)}% · 🏋️ +${Math.round(rod.strength*100)}% · ⏱ +${Math.round(rod.lure*100)}%${unlock}`;
  const btn=equipped?'<button type="button" disabled>Equipped</button>':owned?`<button type="button" data-equip="${rod.id}">Equip</button>`:`<button type="button" data-rod="${rod.id}" ${st.coins<rod.cost?'disabled':''}>${COIN_HTML} ${fmt(rod.cost)}</button>`;
  return `<div class="fishing-shop-row${equipped?' equipped':''}"><span class="fishing-shop-icon">${rodHTML(rod,'fishing-shop-rod',56)}</span><span class="fishing-shop-name">${esc(rod.name)}<small>${stats}</small></span>${btn}</div>`;
 }).join('');
 const baitRows=BAITS.map(b=>{
  const ownedN=st.bait[b.id]||0,selected=st.baitSel===b.id;
  const stats=`🍀 +${Math.round(b.luck*100)}%${b.weight?` · 🏋️ +${Math.round(b.weight*100)}%`:''}${b.mutation>1?` · 🧬 ×${b.mutation}`:''}${b.mvpHookBonus?` · 🦈 +${Math.round(b.mvpHookBonus*100)}% MVP hook`:''}`;
  return `<div class="fishing-shop-row${selected?' equipped':''}"><span class="fishing-shop-icon">${baitHTML(b)}</span><span class="fishing-shop-name">${esc(b.name)}<small>${stats} · owned ×${ownedN}</small></span><span class="fishing-shop-btns"><button type="button" data-bait="${b.id}" data-n="1" ${st.coins<b.cost?'disabled':''}>${COIN_HTML} ${fmt(b.cost)}</button><button type="button" data-bait="${b.id}" data-n="10" ${st.coins<b.cost*10?'disabled':''}>×10</button><button type="button" data-use="${b.id}" ${ownedN?'':'disabled'}>${selected?'Using':'Use'}</button></span></div>`;
 }).join('');
 const tier=bagTierOf(st),next=nextBagTier(st),cap=bagMax(st);
 // v295: one permanent bag upgrade per tier, bought in order - never a skip.
 const bagRow=`<div class="fishing-shop-row equipped"><span class="fishing-shop-icon">🧺</span><span class="fishing-shop-name">${esc(tier.label)}<small>holds ${cap} fish · ${st.bag.length}/${cap} stored${next?` · next: ${esc(next.label)} holds ${next.cap}`:' · fully upgraded'}</small></span>${next?`<button type="button" data-bagup ${st.coins<next.cost?'disabled':''}>${COIN_HTML} ${fmt(next.cost)}</button>`:'<button type="button" disabled>Max</button>'}</div>`;
 els.shopView.innerHTML=`<p class="fishing-shop-head">${COIN_HTML} <b>${fmt(st.coins)}</b> Fishcoins — earn them by selling fish from the Bag.</p><h4>Bag <small>permanent capacity · 120 → 200 → 300 → 400 → 500 → 750 → 1000</small></h4>${bagRow}<h4>Rods <small>permanent · luck / control / strength / lure speed</small></h4>${rodRows}<h4>Bait <small>one is used per cast</small></h4>${baitRows}<div class="fishing-shop-row${st.baitSel===null?' equipped':''}"><span class="fishing-shop-icon">🚫</span><span class="fishing-shop-name">No bait<small>fish with the rod alone</small></span><button type="button" data-use="none" ${st.baitSel===null?'disabled':''}>Use</button></div>`;
 for(const b of els.shopView.querySelectorAll('button[data-rod]'))b.onclick=()=>{if(updatingPaused())return;const r=buyRod(st,b.dataset.rod);if(r.ok){persist();sound('coin');status('Bought and equipped the '+RODS_BY_ID[b.dataset.rod].name+'!')}else if(r.reason==='coins')status('Not enough Fishcoins.');renderPanel()};
 for(const b of els.shopView.querySelectorAll('button[data-equip]'))b.onclick=()=>{if(updatingPaused())return;equipRod(st,b.dataset.equip);syncRodLook();persist();renderPanel()};
 for(const b of els.shopView.querySelectorAll('button[data-bagup]'))b.onclick=()=>{if(updatingPaused())return;const r=buyBagUpgrade(st);if(r.ok){persist();sound('coin');status('Bag upgraded — it now holds '+r.cap+' fish.')}else if(r.reason==='coins')status('Not enough Fishcoins.');renderPanel();renderDockGear()};
 for(const b of els.shopView.querySelectorAll('button[data-bait]'))b.onclick=()=>{if(updatingPaused())return;const r=buyBait(st,b.dataset.bait,Number(b.dataset.n));if(r.ok){persist();sound('coin');if(!st.baitSel)selectBait(st,b.dataset.bait)}else if(r.reason==='coins')status('Not enough Fishcoins.');renderPanel()};
 for(const b of els.shopView.querySelectorAll('button[data-use]'))b.onclick=()=>{if(updatingPaused())return;selectBait(st,b.dataset.use==='none'?null:b.dataset.use);persist();renderPanel()};
}
// v295: Show off no longer writes a Local-chat line. The fish (and its weight) is relayed to
// the room as data and drawn above the angler's head for everyone, so chat stays clean.
function showOff(entryId){
 const st=state();
 const fish=showOffData(st,entryId);
 if(!fish)return false;
 // Always show it locally first - solo players get the same overhead fish and weight.
 drawShowOff(opts&&opts.self?selfId():null,fish);
 if(opts&&typeof opts.showOff==='function')opts.showOff(fish);
 return true;
}
function selfId(){return opts&&typeof opts.id==='function'?opts.id():null}
// One place that turns a show-off payload into the overhead fish + weight label.
function drawShowOff(fromId,fish){
 const clean=cleanShowOff(fish);
 const f=sceneFishing();
 if(!clean||!f||typeof f.showFish!=='function')return false;
 const sp=speciesById(clean.sp),mut=clean.mut?MUTATIONS[clean.mut]:null;
 // A null id means "the local player"; the scene resolves it through its own self() callback.
 f.showFish(fromId==null?null:fromId,{spId:sp.id,mut:clean.mut,text:sp.glyph,hue:sp.hue,scale:showOffScale(clean.w),glow:mut?mut.glow:null,label:clean.w+' kg',ms:5600});
 return true;
}
// A show-off relayed by the worker from any player in the room.
function showOffEvent(fromId,raw){return drawShowOff(fromId,raw)}
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
 f.showFish(fromId,{spId:sp.id,mut:parsed.mut||null,text:sp.glyph,hue:sp.hue,scale:showOffScale(parsed.w),glow:mut?mut.glow:null,ms:5600});
 return true;
}
// ---------------- wiring from assets/social.js ---------------------------------------------
function bind(options){
 opts=options||opts;
 ensureDom();
 // v290: the toolbar button opens the fishing menu (Start fishing / Bag / Index / Shop).
 // It never walks on its own - only the explicit "Start fishing" item (or a pond click) does.
 if(opts&&opts.button&&!opts.button._fishing){opts.button._fishing=true;opts.button.setAttribute('aria-haspopup','menu');opts.button.onclick=()=>toggleMenu()}
 // v295: the ponds always hold fish - there is no Pond-fish toggle any more.
 const f=sceneFishing();f&&f.setFishVisible(true);
}
function toggle(){if(ui.phase==='off')startFishing();else stopFishing()}
// v311 (owner: "pond clicking is off, sometimes it keeps going to the same place"). The click point
// used to be thrown away and every cast walked to the stand nearest the PLAYER, so two clicks ten
// units apart in the same pond produced the same walk. The spot now travels with the request.
function pondClick(x,z,idx){
 const at=Number.isFinite(x)&&Number.isFinite(z)?{x,z}:null;
 if(ui.phase==='off'||ui.phase==='walking'||ui.phase==='ready')startFishing(idx,at);
}
function hubClosed(){stopFishing();if(els){els.panel.hidden=true;els.menu.hidden=true}}
preloadFishArt();
// v373: the colour a worn fishing title is drawn in - the same tone its Titles-tab row uses, with
// the rarity colour as the fallback for tones this map does not name. Mirrors TITLE_TONE in index.html.
const TITLE_TONE_COLOR={bronze:'#c08a52',copper:'#a86f4a',silver:'#cdd6de',jade:'#6ee0a8',sapphire:'#6cb8ff',amethyst:'#c792ea',obsidian:'#8f96b8',crimson:'#ff7a7a',gold:'#ffcc55',valkyrie:'#f0e6ff'};
function titleColor(t){if(!t)return '';return TITLE_TONE_COLOR[t.tone]||(RARITIES.find(r=>r.id===t.tier)||RARITIES[0]).color}
return {
 // pure core (tests)
 RARITIES,SPECIES,DIFF,MUTATIONS,RODS,BAITS,BAG_MAX,BAG_TIERS,bagMax,bagTierOf,nextBagTier,buyBagUpgrade,CAST_GREEN,CAST_PERFECT,MAX_W,
 FISHING_TITLES,FISHING_TITLE_BY_ID,titleUnlocked,equipTitle,equippedTitle,titleColor,discoveredSpecies,bestWeight,mutationKinds,
 speciesById,rarityById,rate,rateWith,tierShares,value,rollCatch,castRating,makeReel,reelStep,normalize,addCatch,
 ROD_GATE,ROD_RANK,rodCeiling,gateRodFor,GATE_ESCAPE,
 buyRod,equipRod,buyBait,selectBait,sellFish,sellBulk,sellFiltered,toggleLock,shouldAutoSell,showOffText,parseShowOff,showOffScale,
 showOffData,cleanShowOff,showOffEvent,rodSprite,rodSpriteURL,ROD_TIER_COLORS,
 // v301: the crop manifest, so tests can prove every drawing on disk is wired up.
 FISH_ART,
 fishSprite,fishSpriteURL,
 // v309: painted bait icons, so the shop no longer depends on Unicode-13 emoji fonts.
 baitSprite,baitSpriteURL,baitHTML,titleBadge,titleBadgeURL,
 // MVP
 MVP_REEL_CATCH_CHANCE,AUTO_REEL_SAMPLE_MS,autoReelTarget,setMvp,clearMvp,getMvp:()=>mvpActive, markMvpClaimed, isMvpClaimed:id=>mvpClaimed().has(id),
 // UI
 bind,toggle,pondClick,hubClosed,onLocalMessage,
 refresh:()=>{if(els){renderDockGear();renderPanel();renderMvpBanner()}},
 // v297: the plaza's leave-warning reels the line in through this, so chat no longer has to nag.
 stop:message=>stopFishing(message),openBag:()=>toggleBag(true),openIndex:()=>{toggleBag(true);switchTab('index')},openTitles:()=>{toggleBag(true);switchTab('titles')},
 // v295: sit/stand are allowed with a line in the water, so the plaza asks these two separately
 // instead of using one movement lock for everything.
 seatedBusy:()=>!['off','walking'].includes(ui.phase),
 // v294: true while a line is in the water (or a catch is being resolved). While busy the
 // plaza blocks walking - stop fishing to move. v295: seats and sit are no longer blocked.
 busy:()=>!['off','walking'].includes(ui.phase),
 get phase(){return ui.phase},
 get auto(){return ui.auto},
};
});
