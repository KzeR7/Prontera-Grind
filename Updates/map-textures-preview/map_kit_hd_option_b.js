// ----- The map kit: terrains, water, bridges and props ----------------------------------
// assets/kit/ro-spritesheet.png + .json is **map kit v2**: one 2048x2048 atlas of painted
// RO-style art - 25 terrain tiles and 34 environment billboards - plus the character strip the
// prop scale is measured from. assets/kit/ro-map-payon.json and ro-map-morocc.json are the two
// attached level designs: 48x32 grids of typed cells, each with its own corner heights, plus the
// props the design places on top of them. v1 painted Morocc's desert atlas at runtime with its own
// generator (assets/kit/morocc-atlas.js); **v2 carries every one of those names on the one sheet**,
// so the generator is retired (kept in Updates/retired-v1-kit/) and 'morocc' is now just an alias.
//
// Everything here is a CROP of that art. No tile, tree or rock in this layer is drawn, traced,
// recoloured or substituted - if a crop is missing, the map falls back to the v13 scenery.
//
// The arena is untouched: a design dresses the ground (its tiles are painted into one texture)
// and its props are billboards. Props a design puts inside the running lane are moved to the
// lane edge and kept - the field must read as the design without scenery blocking the fight.
//
// Payon is not the attached 48x32 grid: the owner rejected that layout (a huge diagonal lake,
// trees the size of the player) and asked for Payon to look like RO's Payon Forest. Its field is
// laid out in code from the RO recipe - see `payonPlan` below - out of the same kit tiles and
// billboards. Morocc still uses its attached design. The other eight are `fieldPlan` recipes.
const KIT={ok:0,png:null,man:null,des:{},srcMan:{},tex:new Map(),water:[],wt:0,ground:null,built:null};
const KIT_S=.85,KIT_ZC=(Z0+Z1)/2,KIT_PX=2048,KIT_FAR=90;
// Prop size. The kit ships its own character: 80px per frame (v2 kept the v1 strip pixel for
// pixel, so this did not move). This game's hero stands 2.9 world units, so **one atlas pixel is
// 2.9/80 units** and a prop is (its crop height) x KIT_PK x its factor. The factors below are the
// art pass's own tuned table (`suggest.KIT_PS` in the manifest, which kit_sim.js compares against
// this constant entry for entry) - v2 crops are taller and better proportioned than v1, so the
// old factors were wrong for them. World heights they encode, in hero-multiples: big trees
// 3.3-3.6x, cherry 3.0x, palms 2.6-3.1x, dead/gnarled trees 2.5-2.7x, the Geffen tower 5.1x (a
// far landmark), torii 2.3x, houses ~2x, bamboo and saplings ~1-1.9x, bushes/curbs knee height.
// Anything not listed is factor 1 - kit_sim.js fails on a prop a field places that is missing.
const KIT_PK=2.9/80;
const KIT_PS={tree_ancient_large:1,tree_ancient_variant:1,tree_tall_cluster:.95,tree_sapling:.55,
  tree_bush_bright:.4,rock_cliff_crag:.7,river_stone_post:.55,rock_boulder_mossy:.45,
  palm_giant:.9,palm_tall:.85,palm_double:.9,cactus_flower:.45,cactus_small:.4,
  ruin_pillar:.6,ruin_column_fallen:.4,ruin_stump:.45,ruin_curb:.35,desert_bone:.45,
  bamboo_grove:.95,tree_dead:.7,tombstone:.45,house_ruin:.75,tree_cherry:.8,lantern_stone:.55,
  bridge_red_arch:.7,torii_gate:.75,shrine_stone:.65,stalagmite:.6,crystal_cluster:.45,
  standing_stone:.55,tree_dark_gnarled:1,house_prontera:.75,tower_geffen:1.2,pier_post:.45};
function kitPropScale(type,scale){return KIT_PK*(KIT_PS[type]||1)*(scale||1)}

// ----- organic layout: seeded noise, so a field is mottled and clumped, never a lattice ------
// v26 drew its ground variation with `(i*7+j*13)%9===0` - a diagonal lattice of single cells that
// reads as a printed pattern on screen (the owner called Izlude's "symmetric green patches" fake)
// - and its trees were two mirrored lines hugging the lane, which boxed every map in. Both are
// gone. Ground variation is value noise (soft patches with real, wandering edges) and scenery is
// placed in clumps strewn over the whole field, near lane and far out. Everything is a pure
// function of the recipe's seed, so a respawn rebuilds the identical map - scene_sim pins that.
function kitHash(i,j,s){let h=Math.imul(i|0,374761393)^Math.imul(j|0,668265263)^Math.imul(s|0,1442695041);
  h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967295}
function kitNoise(x,z,s){const X=Math.floor(x),Z=Math.floor(z),fx=x-X,fz=z-Z,
  u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz),a=kitHash(X,Z,s),b=kitHash(X+1,Z,s),c=kitHash(X,Z+1,s),d=kitHash(X+1,Z+1,s);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
function kitFbm(x,z,s,o){let v=0,a=.5,f=1,t=0;o=o||3;for(let i=0;i<o;i++){v+=a*kitNoise(x*f,z*f,s+i*131);t+=a;a*=.5;f*=2}return v/t}
// the dressed field. The painted ground texture is 90x90 (KIT_FAR); cells are laid out here and
// the base tile repeats beyond, so the far field is ground instead of a hard edge.
const KIT_FIELD=[-30,30,-30,14];
// The wild edge. Not a rim and never a rectangle: rock *probability* rises towards the field
// border and past it, shaped by noise, so the ground turns wild in ragged tongues - some reach
// deep into the field, some leave open grass right up to the corner - and beyond the field the
// rock simply continues, so no straight line is ever visible. This is what stops every map
// reading as "a box with the design in the middle".
function kitEdge(f,x,z){
  const E=f&&f.edge;if(!E)return 0;
  const d=Math.min(x-KIT_FIELD[0],KIT_FIELD[1]-x,z-KIT_FIELD[2],KIT_FIELD[3]-z);
  const at=E.at||6;
  const n=kitFbm((x+(E.ox||0))/at,(z+(E.oz||0))/at,(E.seed||5)*13+3,4);
  const c=(at-d)/at;                       // 0 in the middle of the field, 1 at the border, >1 outside
  return c>0&&n>1-c*1.3?(E.tile||'cliff_rock'):0;
}
// a prop may never stand in the running lane: it is moved to the lane edge and kept (its side and
// depth survive). `nudged` records it, so the lane rule is visible in the plan instead of silent.
function kitPut(props,src,x,z,type,scale,flip,missing){
  const lane=BX_+.9;let nudged=0;if(Math.abs(x)<lane){x=(x<0?-1:1)*lane;nudged=1}
  props.push({x,z,type,src,scale,flip,nudged,missing:missing?1:0});return 1}

// which arena map wears which recipe, and what a recipe's keys mean.
// **v27**: every map is a recipe now, including Payon and Prontera. Morocc keeps its attached
// desert design in the middle and gets the new far-field dressing around it. A recipe reads:
//   f.base/base2   the ground tile and its second ground tone     f.patch  {tile,t,s,oct,tile2,t2}
//                  organic ground variation: value noise, soft patches with real edges
//   f.edge         {at,amp,s,tile} an irregular rocky rim along the field border - no rectangle
//   f.road         {w,wander} + f.roadTile   a worn track down the lane
//   f.plaza        {x,z,w,l,tile} paved ground (Prontera's brick square, off the avenue)
//   f.water        [z0,z1] an animated strip; f.bank its shore band; f.bankTile the shore tile
//   f.deck         [x,z,w,l] a plank bridge; f.deckTile which deck art (Amatsu's is red lacquer)
//   f.waterFrames  which two frames animate (Abyss's lake is the kit's dark pair)
//   f.bands        off-lane ground strips ({tile,z:[a,b],x0,x1,jit}) - never written into the lane
//   f.outcrops     {tile,count,r:[a,b],b0,b1,z0,z1,prop,ps} rock blobs inland, each with a prop on it
//   f.groves       clumps of scenery: {n,r,trees:[a,b],b0,b1,z0,z1,types,sub,s0,s1,gap}. `b0..b1`
//                  is a |x| band, so a grove can hug the lane, sit mid-field or stand far out
//   f.scatter      single props: {type,count,r0,r1,z0,z1,s0,s1,gap} - this is what dresses the far
//                  field; `side` pins one side
//   f.fixed        landmarks placed exactly (a tower in a corner, a torii on the approach)
// Identities are the art pass's per-map notes (Updates/map-sprites-v2/RESEARCH.md), researched
// against divine-pride map renders: one painted technique, ten moods.
const KIT_MAP={
  // 0 Prontera - the city: light green meadow, a brick cobble avenue and a paved square, the kit's
  //   own painted cottages in a street row, and a stone fountain basin in the square (composed from
  //   crops: a round water tile pool with a limestone curb and stone posts - no fountain crop exists
  //   in the kit, and house rule 1 forbids drawing one). Sparse round trees, nothing near the lane.
  0:{src:'payon',layout:'field',design:'prontera',seed:101,f:{
    base:'grass_olive',base2:'grass_forest',patch:{tile:'grass_forest',cover:.2,s:7,oct:4},
    road:{w:4.4,wander:.5},roadTile:'ruin_cobble',
    plaza:{x:-15,z:-19,w:12,l:8},pool:{x:-15,z:-19,r:2.1,tile:'water_frame_0',curb:'limestone_pale'},
    groves:[{n:3,r:4.6,trees:[1,2],b0:7.2,b1:16,z0:-26,z1:10,gap:5,
      types:['tree_ancient_large','tree_ancient_variant','tree_tall_cluster']},
      {n:3,r:5.4,trees:[1,2],b0:16,b1:30,z0:-30,z1:12,gap:5.2,
      types:['tree_ancient_large','tree_tall_cluster','tree_sapling']}],
    scatter:[{type:'tree_bush_bright',count:5,r0:7.4,r1:27,z0:-30,z1:11,s0:.8,s1:1.15,gap:5.2},
      {type:'river_stone_post',count:4,r0:8,r1:26,z0:-28,z1:9,s0:.8,s1:1.05,gap:6.5},
      {type:'tree_sapling',count:4,r0:8,r1:24,z0:-28,z1:10,s0:.7,s1:1,gap:5}],
    far:[{type:'tree_ancient_large', count:14,r0:32,r1:44,z0:-44,z1:18,s0:.95,s1:1.3,gap:8.5},
      {type:'tree_ancient_variant',count:6,r0:34,r1:46,z0:-44,z1:18,s0:.95,s1:1.25,gap:10}],
    fixed:[{type:'house_prontera',x:-20,z:-22.5,scale:1,flip:true},{type:'house_prontera',x:-13,z:-23.5,scale:1.1},
      {type:'house_prontera',x:-8,z:-20.5,scale:.95},{type:'house_prontera',x:9,z:-21.5,scale:1.05,flip:true},
      {type:'house_prontera',x:15,z:-23.5,scale:.95},{type:'house_prontera',x:21,z:-20,scale:1.1},
      {type:'ruin_stump',x:-15,z:-19,scale:.85},
      {type:'river_stone_post',x:-15,z:-21.4,scale:.8},{type:'river_stone_post',x:-15,z:-16.6,scale:.8,flip:true},
      {type:'river_stone_post',x:-17.4,z:-19,scale:.8},{type:'river_stone_post',x:-12.6,z:-19,scale:.8,flip:true},
      {type:'lantern_stone',x:-6.4,z:-16.6,scale:1},{type:'lantern_stone',x:6.4,z:-16.6,scale:1,flip:true},
      {type:'lantern_stone',x:-14,z:-13.6,scale:1},{type:'lantern_stone',x:14,z:-13.6,scale:1,flip:true}]}},
  // 1 Izlude - Prontera's field by the sea: light green meadow, sparse round trees, a golden shore
  //   band and teal water, palms at the waterline and the pier on its posts. Deliberately open -
  //   the owner called the dense version a jungle.
  1:{src:'payon',layout:'field',design:'izlude',seed:202,f:{
    base:'grass_olive',base2:'grass_forest',patch:{tile:'grass_forest',cover:.18,s:7,oct:4},
    road:{w:3.4,wander:.4},
    water:[-30,-19],bank:1.4,bankTile:'sand_gold',
    deck:[9.6,-19.5,2.8,7],
    groves:[{n:2,r:4.6,trees:[1,2],b0:7.2,b1:16,z0:-15,z1:10,gap:5.2,types:['tree_tall_cluster','tree_ancient_variant']},
      {n:2,r:5.4,trees:[1,2],b0:16,b1:30,z0:-16,z1:12,gap:5.4,types:['tree_tall_cluster','tree_ancient_large']}],
    scatter:[{type:'palm_tall',count:4,r0:8.5,r1:27,z0:-16.6,z1:-13.8,s0:.85,s1:1.05,gap:5.6},
      {type:'tree_bush_bright',count:5,r0:7.4,r1:26,z0:-15,z1:11,s0:.8,s1:1.15,gap:5.2},
      {type:'tree_sapling',count:4,r0:8,r1:24,z0:-15,z1:10,s0:.7,s1:1,gap:5},
      {type:'river_stone_post',count:3,r0:8,r1:22,z0:-16,z1:-10,s0:.8,s1:1,gap:6.5}],
    far:[{type:'tree_ancient_large', count:12,r0:32,r1:44,z0:-40,z1:18,s0:.95,s1:1.3,gap:8.5},
      {type:'palm_giant',count:5,r0:34,r1:46,z0:-40,z1:6,s0:1,s1:1.2,gap:10}],
    fixed:[{type:'pier_post',x:8.5,z:-22.4,scale:1},{type:'pier_post',x:11.5,z:-22.4,scale:1},
      {type:'pier_post',x:11.5,z:-17,scale:1}]}},
  // 2 Geffen - moody blue-grey-green plains kept deliberately open: dark gnarled trees well spaced,
  //   a few standing stones, the wizard tower on the far horizon. The owner wants room to grow the
  //   battle field, so nothing crowds the middle and no rocky frame around the map.
  2:{src:'payon',layout:'field',design:'geffen',seed:303,f:{
    base:'grass_geffen',base2:'grass_forest',patch:{tile:'grass_olive',cover:.22,s:6,oct:4,tile2:'grass_forest',cover2:.08},
    road:{w:3,wander:.4},
    groves:[{n:3,r:5,trees:[1,2],b0:7.6,b1:17,z0:-26,z1:11,gap:5.4,types:['tree_dark_gnarled']},
      {n:3,r:5.8,trees:[1,2],b0:17,b1:30,z0:-30,z1:13,gap:5.6,types:['tree_dark_gnarled','tree_dead']}],
    scatter:[{type:'standing_stone',count:5,r0:9,r1:28,z0:-28,z1:12,s0:.9,s1:1.3,gap:6.5},
      {type:'rock_cliff_crag',count:4,r0:9,r1:28,z0:-30,z1:12,s0:.85,s1:1.2,gap:6},
      {type:'tree_bush_bright',count:5,r0:8,r1:26,z0:-28,z1:11,s0:.8,s1:1.1,gap:5.4},
      {type:'tree_sapling',count:3,r0:8,r1:24,z0:-28,z1:11,s0:.7,s1:1,gap:5.2}],
    far:[{type:'tree_dark_gnarled', count:14,r0:32,r1:44,z0:-44,z1:16,s0:.95,s1:1.3,gap:8.5},
      {type:'tree_dead',count:5,r0:34,r1:46,z0:-44,z1:16,s0:.95,s1:1.25,gap:10}],
    fixed:[{type:'tower_geffen',x:-24,z:-27,scale:1.1}]}},
  // 3 Morocc - the attached desert-ruins design in the middle, unchanged, dressed all round it with
  //   dunefields, mesas, palms, cacti, ruins and bones. Every far entry alternates sides (alt:1), so
  //   both sides of the map are dressed - the owner found one side bare.
  3:{src:'morocc',design:'morocc',
    tile:t=>({sand:'sand',sand_dark:'sand_dark',ruin_cobble:'ruin_cobble',cliff:'cliff'}[t]||null),
    f:{patch:{tile:'sand_dark',cover:.3,s:8,oct:4},
      outcrops:{tile:'cliff_sand',count:3,r:[1.2,2.2],b0:22,b1:30,z0:-30,z1:10,prop:'rock_cliff_crag',ps:1.05},
      groves:[{alt:1,n:5,r:4,trees:[1,2],b0:20,b1:30,z0:-28,z1:10,gap:5.6,
        types:['palm_giant','palm_double','cactus_flower'],s0:.85,s1:1.05}],
      scatter:[{alt:1,type:'palm_tall',count:6,r0:20,r1:30,z0:-28,z1:10,s0:.85,s1:1.1,gap:6},
        {alt:1,type:'cactus_small',count:6,r0:20,r1:30,z0:-28,z1:10,s0:.8,s1:1.15,gap:5.4},
        {alt:1,type:'desert_bone',count:5,r0:20,r1:30,z0:-28,z1:10,s0:.8,s1:1.1,gap:6.2},
        {alt:1,type:'ruin_stump',count:4,r0:20,r1:29,z0:-28,z1:9,s0:.85,s1:1.1,gap:6},
        {alt:1,type:'rock_cliff_crag',count:4,r0:21,r1:30,z0:-30,z1:10,s0:.9,s1:1.25,gap:6.2},
        {alt:1,type:'cactus_flower',count:4,r0:20,r1:30,z0:-28,z1:10,s0:.85,s1:1.15,gap:5.6}],
      far:[{alt:1,type:'palm_giant',count:8,r0:32,r1:44,z0:-40,z1:16,s0:.95,s1:1.25,gap:8.5},
        {alt:1,type:'cactus_flower',count:5,r0:34,r1:46,z0:-40,z1:16,s0:.9,s1:1.2,gap:10}]}},
  // 4 Payon - RO's Payon Forest, now roomy: the wandering mud trail, the creek with its plank
  //   bridge, bamboo at the crossing and mossy boulders framing it, and the trees spaced out in
  //   clumps instead of a wall, so the run up the field stays open.
  4:{src:'payon',layout:'field',design:'payon',seed:404,f:{
    base:'grass_forest',base2:'grass_olive',patch:{tile:'grass_olive',cover:.3,s:5,oct:4},
    road:{w:4,wander:.6},roadTile:'dirt_payon',
    water:[-7.8,-5],bank:1.8,
    deck:[0,-6.4,4.2,4.4],
    groves:[{n:4,r:4.6,trees:[1,2],b0:7,b1:16,z0:-26,z1:11,gap:5.2,
      types:['tree_ancient_large','tree_ancient_variant','tree_tall_cluster'],
      sub:[['tree_sapling',.5],['tree_bush_bright',.45]]},
      {n:4,r:5.6,trees:[1,2],b0:16,b1:30,z0:-30,z1:13,gap:5.4,
      types:['tree_ancient_large','tree_tall_cluster','tree_ancient_variant'],
      sub:[['tree_sapling',.4],['tree_bush_bright',.4]]},
      {alt:1,n:2,r:3.6,trees:[1,2],b0:7,b1:18,z0:-13,z1:-1,gap:5,types:['bamboo_grove'],s0:.85,s1:1.05}],
    scatter:[{alt:1,type:'bamboo_grove',count:5,r0:7.4,r1:24,z0:-28,z1:10,s0:.85,s1:1.1,gap:5.6},
      {type:'tree_bush_bright',count:6,r0:7.2,r1:27,z0:-30,z1:12,s0:.75,s1:1.15,gap:5.2},
      {type:'tree_sapling',count:4,r0:7.6,r1:25,z0:-28,z1:11,s0:.7,s1:1,gap:5},
      {type:'rock_cliff_crag',count:4,r0:11,r1:29,z0:-30,z1:12,s0:.9,s1:1.3,gap:6.5}],
    far:[{type:'tree_ancient_large', count:15,r0:32,r1:44,z0:-44,z1:18,s0:.95,s1:1.3,gap:8.5},
      {type:'bamboo_grove',count:5,r0:34,r1:46,z0:-44,z1:18,s0:.95,s1:1.2,gap:10}],
    fixed:[{type:'river_stone_post',x:-6.6,z:-8.6,scale:.85},{type:'river_stone_post',x:6.6,z:-8.6,scale:.85,flip:true},
      {type:'rock_boulder_mossy',x:-6.8,z:-4,scale:1},{type:'rock_boulder_mossy',x:6.8,z:-4,scale:1,flip:true}]}},
  // 5 Comodo - a golden beach: dune mottling, palms and cacti in loose clumps, the sea and its gold
  //   shore beyond. The owner disliked the brown patchwork on the sand, so the rocky outcrop blobs
  //   are gone from this map entirely - only loose props and the dunes remain.
  5:{src:'payon',layout:'field',design:'comodo',seed:505,f:{
    base:'sand_gold',base2:'sand_dark',patch:{tile:'sand_dark',cover:.14,s:10,oct:4},
    cliffTile:'cliff_sand',
    water:[-30,-19],bank:1.6,bankTile:'sand_gold',
    groves:[{n:3,r:4.6,trees:[1,2],b0:7.2,b1:16,z0:-16,z1:11,gap:5.4,types:['palm_giant','palm_tall','palm_double'],s0:.85,s1:1.1},
      {n:3,r:5.6,trees:[1,2],b0:16,b1:30,z0:-16,z1:12,gap:5.6,types:['palm_giant','palm_double','cactus_small']}],
    scatter:[{type:'cactus_flower',count:5,r0:8,r1:28,z0:-16,z1:11,s0:.8,s1:1.15,gap:5.4},
      {type:'cactus_small',count:5,r0:8,r1:28,z0:-16,z1:11,s0:.8,s1:1.2,gap:5.2},
      {type:'desert_bone',count:3,r0:9,r1:27,z0:-15,z1:10,s0:.8,s1:1.1,gap:6.2},
      {type:'ruin_curb',count:2,r0:9,r1:25,z0:-15,z1:10,s0:.8,s1:1,gap:6.2}],
    far:[{type:'palm_giant', count:14,r0:32,r1:44,z0:-36,z1:18,s0:1,s1:1.3,gap:8.5},
      {type:'palm_double',count:5,r0:34,r1:46,z0:-36,z1:18,s0:1,s1:1.25,gap:10}]}},
  // 6 Louyang - a jade highland kept open for a bigger battle field: bamboo in loose clumps, the
  //   terraced paddy water off the lane with wandering terrace edges, the stone shrine and its
  //   lantern pairs on the approach. No rocky frame, no crowded trees.
  6:{src:'payon',layout:'field',design:'louyang',seed:606,f:{
    base:'grass_jade',base2:'grass_forest',patch:{tile:'grass_olive',cover:.2,s:6.5,oct:4,tile2:'grass_forest',cover2:.07},
    road:{w:3.2,wander:.5},
    bands:[{tile:'paddy_water',z:[-12,-9.6],x0:9,x1:25,jit:1.2},{tile:'paddy_water',z:[-12,-9.6],x0:-25,x1:-9,jit:1.2},
      {tile:'paddy_water',z:[-5.2,-3.2],x0:10,x1:23,jit:1},{tile:'paddy_water',z:[-5.2,-3.2],x0:-23,x1:-10,jit:1}],
    groves:[{n:3,r:5,trees:[1,2],b0:7.4,b1:17,z0:-26,z1:11,gap:5.4,types:['bamboo_grove','tree_tall_cluster'],
      sub:[['tree_sapling',.5],['tree_bush_bright',.4]]},
      {n:3,r:5.8,trees:[1,2],b0:17,b1:30,z0:-30,z1:12,gap:5.6,types:['bamboo_grove','tree_tall_cluster','tree_sapling']}],
    scatter:[{alt:1,type:'bamboo_grove',count:5,r0:8,r1:27,z0:-28,z1:11,s0:.85,s1:1.15,gap:5.8},
      {type:'tree_bush_bright',count:5,r0:7.6,r1:26,z0:-28,z1:11,s0:.8,s1:1.15,gap:5.4},
      {type:'tree_sapling',count:4,r0:8,r1:25,z0:-28,z1:11,s0:.7,s1:1.05,gap:5.2}],
    far:[{type:'bamboo_grove', count:14,r0:32,r1:44,z0:-44,z1:16,s0:.95,s1:1.25,gap:8.5},
      {type:'tree_tall_cluster',count:5,r0:34,r1:46,z0:-44,z1:16,s0:.95,s1:1.25,gap:10}],
    fixed:[{type:'shrine_stone',x:-9.6,z:-16.4,scale:1},
      {type:'lantern_stone',x:-15.8,z:-13.5,scale:1},{type:'lantern_stone',x:15.8,z:-13.5,scale:1,flip:true},
      {type:'lantern_stone',x:-6.8,z:-.6,scale:1},{type:'lantern_stone',x:6.8,z:-.6,scale:1,flip:true}]}},
  // 7 Amatsu - blossom fields, slightly thinned: cherry in loose clumps over the whole field, the
  //   stream on the road with its red lacquer bridge, a torii on the approach, lantern pairs and
  //   the great red arch far off. No frame around the map.
  7:{src:'payon',layout:'field',design:'amatsu',seed:707,f:{
    base:'grass_blossom',base2:'grass_olive',patch:{tile:'grass_olive',cover:.26,s:6.5,oct:4},
    road:{w:3.4,wander:.3},
    water:[-7.9,-6],bank:1.7,
    deck:[0,-6.95,3.6,4.8],deckTile:'bridge_red',
    groves:[{n:3,r:5,trees:[1,2],b0:7.2,b1:17,z0:-22,z1:11,gap:5.4,types:['tree_cherry','tree_ancient_variant'],
      sub:[['tree_sapling',.5],['tree_bush_bright',.4]]},
      {n:3,r:5.8,trees:[1,2],b0:17,b1:30,z0:-30,z1:12,gap:5.6,types:['tree_cherry','tree_ancient_large','tree_ancient_variant']}],
    scatter:[{type:'tree_cherry',count:5,r0:8,r1:27,z0:-28,z1:11,s0:.85,s1:1.15,gap:5.8},
      {type:'tree_bush_bright',count:5,r0:7.6,r1:26,z0:-28,z1:11,s0:.8,s1:1.15,gap:5.4},
      {type:'river_stone_post',count:4,r0:7.6,r1:24,z0:-28,z1:10,s0:.8,s1:1.05,gap:6.5}],
    far:[{type:'tree_cherry', count:14,r0:32,r1:44,z0:-44,z1:16,s0:.95,s1:1.3,gap:8.5},
      {type:'tree_ancient_variant',count:5,r0:34,r1:46,z0:-44,z1:16,s0:.95,s1:1.25,gap:10}],
    fixed:[{type:'torii_gate',x:6.6,z:-4.2,scale:1},
      {type:'lantern_stone',x:-6.8,z:-1.4,scale:1},{type:'lantern_stone',x:6.8,z:-1.4,scale:1,flip:true},
      {type:'lantern_stone',x:-6.8,z:-11.4,scale:1},{type:'lantern_stone',x:6.8,z:-11.4,scale:1,flip:true},
      {type:'bridge_red_arch',x:20,z:-24,scale:1}]}},
  // 8 Niflheim - the realm of the dead, thinned out: fewer dead trees and rocks, spaced wide, graves
  //   and bones strewn into the fog, one ruined house. Still no bright colour anywhere.
  8:{src:'payon',layout:'field',design:'niflheim',seed:808,f:{
    base:'waste_nifl',base2:'rock_abyss',patch:{tile:'rock_abyss',cover:.2,s:7,oct:4,tile2:'waste_nifl',cover2:.07},
    groves:[{n:2,r:5,trees:[1,2],b0:7.6,b1:17,z0:-26,z1:10,gap:5.8,types:['tree_dead']},
      {n:3,r:5.8,trees:[1,2],b0:17,b1:30,z0:-30,z1:13,gap:6,types:['tree_dead']}],
    scatter:[{type:'tombstone',count:6,r0:8,r1:28,z0:-30,z1:12,s0:.8,s1:1.2,gap:5.8},
      {type:'rock_cliff_crag',count:5,r0:8,r1:29,z0:-30,z1:12,s0:.85,s1:1.25,gap:6.4},
      {type:'desert_bone',count:5,r0:8,r1:27,z0:-29,z1:12,s0:.85,s1:1.2,gap:5.8},
      {type:'standing_stone',count:3,r0:11,r1:27,z0:-28,z1:11,s0:.9,s1:1.2,gap:6.5}],
    far:[{type:'tree_dead', count:14,r0:32,r1:44,z0:-44,z1:16,s0:.95,s1:1.3,gap:8.5},
      {type:'tombstone',count:5,r0:34,r1:46,z0:-44,z1:16,s0:.9,s1:1.25,gap:10}],
    fixed:[{type:'house_ruin',x:-18,z:-23,scale:1},{type:'tree_dead',x:16,z:-24.5,scale:1.15}]}},
  // 9 Abyss - dark slate and the deep dark lake behind its pale limestone shore, opened up: fewer
  //   stalagmites, crystals and rocks, spaced wide, so the field reads spacious rather than tight.
  9:{src:'payon',layout:'field',design:'abyss',seed:909,f:{
    base:'rock_abyss',base2:'cliff_rock',patch:{tile:'rock_abyss',cover:.2,s:7,oct:4,tile2:'cliff_rock',cover2:.07},
    water:[-30,-18],bank:1.8,bankTile:'limestone_pale',
    waterFrames:['water_dark_0','water_dark_1'],
    groves:[{n:3,r:5,trees:[1,2],b0:7.6,b1:17,z0:-24,z1:11,gap:5.8,types:['stalagmite','crystal_cluster']},
      {n:3,r:5.8,trees:[1,2],b0:17,b1:30,z0:-30,z1:13,gap:6,types:['stalagmite','crystal_cluster','standing_stone']}],
    scatter:[{type:'stalagmite',count:5,r0:8,r1:29,z0:-30,z1:12,s0:.85,s1:1.2,gap:6.4},
      {type:'crystal_cluster',count:4,r0:8,r1:29,z0:-30,z1:12,s0:.85,s1:1.15,gap:6.2},
      {type:'rock_cliff_crag',count:4,r0:8,r1:30,z0:-30,z1:12,s0:.9,s1:1.3,gap:6.6},
      {type:'standing_stone',count:3,r0:10,r1:28,z0:-29,z1:11,s0:.9,s1:1.25,gap:6.5},
      {type:'tombstone',count:2,r0:10,r1:27,z0:-29,z1:11,s0:.85,s1:1.15,gap:6.4}],
    far:[{type:'stalagmite', count:12,r0:32,r1:44,z0:-44,z1:16,s0:.95,s1:1.3,gap:8.5},
      {type:'crystal_cluster',count:4,r0:34,r1:46,z0:-44,z1:16,s0:.95,s1:1.25,gap:10}]}}};
const KIT_TILE={grass:'grass_olive',grass_dark:'grass_forest',dirt:'dirt_path',cliff:'cliff_rock',bank:'riverbank_wall'};
// cell types the kit itself draws in its animated pass / as a deck, not as ground texture
const KIT_WET={water:1},KIT_DECK={bridge:1},KIT_SKIP={sky:1};
function kitFetch(){
  // The kit is an enhancement: no fetch, no atlas, no design - the game keeps its own scenery.
  if(typeof fetch!=='function'||typeof Image!=='function')return;
  try{
    const j=n=>fetch('assets/kit/'+n).then(r=>r&&r.ok?r.json():null).catch(()=>null);
    Promise.all([j('ro-spritesheet.json'),j('ro-map-payon.json'),j('ro-map-morocc.json'),j('ro-tiles-hd.json')]).then(([man,pay,mor,hdMan])=>{
      if(!man||!pay)return; KIT.man=man; KIT.des.payon=pay; if(mor)KIT.des.morocc=mor; if(hdMan)KIT.hdMan=hdMan;
      const img=new Image();
      img.onload=()=>{KIT.png=img;KIT.ok=1;buildDeco(S.mp);
        if(hdMan){const hdi=new Image();hdi.onload=()=>{KIT.hdPng=hdi;KIT.tex.clear();buildDeco(S.mp)};hdi.onerror=()=>{};hdi.src='assets/kit/ro-tiles-hd.png'}};
      img.onerror=()=>{};
      img.src='assets/kit/ro-spritesheet.png';}).catch(()=>{});
  }catch(e){}
}
// v2 is ONE atlas, so every recipe's `src` resolves to it. 'payon' and 'morocc' were the two v1
// atlases (the sheet, and the desert generator's canvas); both names stay valid as aliases so the
// recipes and Morocc's attached design read unchanged, and one manifest object is shared, so a
// crop is never made twice and there is nothing left to borrow between atlases.
const KIT_SRC='kit',KIT_ALIAS={kit:KIT_SRC,payon:KIT_SRC,morocc:KIT_SRC};
function kitSrc(name){return KIT_ALIAS[name]||null}
// the atlas a design crops from ("src" above), normalised: {img,tiles,sprites}
function kitAtlas(name){
  const key=kitSrc(name); if(!key)return null;
  if(KIT.srcMan[key])return KIT.srcMan[key];
  if(KIT.png&&KIT.man)KIT.srcMan[key]={img:KIT.png,tiles:KIT.man.tiles,sprites:KIT.man.sprites};
  return KIT.srcMan[key]||null;
}
function kitCrop(src,kind,name,flip){
  const key=(kitSrc(src)||src)+':'+kind+':'+name+(flip?'@f':''); if(KIT.tex.has(key))return KIT.tex.get(key);
  const a=kitAtlas(src); if(!a)return null;
  const hd=(kind==='tile'&&KIT.hdPng&&KIT.hdMan&&KIT.hdMan.tiles&&KIT.hdMan.tiles[name])?KIT.hdMan.tiles[name]:null;
  const e=hd||(kind==='tile'?a.tiles:a.sprites)[name]; if(!e)return null;
  const sheetImg=hd?KIT.hdPng:a.img;
  const cv=document.createElement('canvas');cv.width=e.w;cv.height=e.h;
  const g=cv.getContext('2d');g.imageSmoothingEnabled=false;
  if(e.canvas)g.drawImage(e.canvas,0,0);
  else if(flip){g.translate(e.w,0);g.scale(-1,1);g.drawImage(sheetImg,e.x,e.y,e.w,e.h,0,0,e.w,e.h)}
  else g.drawImage(sheetImg,e.x,e.y,e.w,e.h,0,0,e.w,e.h);
  const t=new THREE.CanvasTexture(cv);
  if(kind==='tile'){ // 256x256 HD / 128x128 tiles: mipmapped and repeating, so the ground and water can be tiled
    t.magFilter=THREE.LinearFilter||THREE.NearestFilter;t.minFilter=THREE.LinearMipMapLinearFilter;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=16;
  }else{ // billboards keep the game's own pixel-art filtering (crops are not power of two)
    t.magFilter=t.minFilter=THREE.NearestFilter;t.generateMipmaps=false;
  }
  KIT.tex.set(key,t);return t;
}
// Where a design cell or a design prop sits in the arena. The design is anchored on the point
// the map is built around (Morocc's plaza) and centred on the lane.
function kitAnchor(d){return d.bridge?{x:d.bridge.x,y:d.bridge.y}:{x:d.meta.gridWidth/2,y:d.meta.gridHeight/2}}
function kitX(d,g){return (g-kitAnchor(d).x)*KIT_S}
function kitZ(d,g){return (g-kitAnchor(d).y)*KIT_S+KIT_ZC}
// ----- the field builder: one deterministic builder, one recipe per map ----------------------
function fieldPlan(spec){
  const f=spec.f||{},cells=[],water=[],props=[];
  const[X0,X1,GZ0,GZ1]=KIT_FIELD,st=.8;
  let q=(spec.seed|0)||1;const rnd=()=>(q=(q*16807)%2147483647)/2147483647;
  const roadT=f.roadTile||'dirt_path',bankT=f.bankTile||'riverbank_wall';
  const roadR=f.road?(z=>f.road.w/2+Math.sin(z*.19+spec.seed)*f.road.wander+Math.sin(z*.05)*f.road.wander*.7):null;
  const wet=z=>f.water&&z>=f.water[0]&&z<f.water[1];
  const bands=f.bands||[],bandsAt=z=>bands.filter(b=>z>=b.z[0]&&z<b.z[1]);
  const lane=BX_+.9,P=f.patch;
  // Ground patches are driven by a **coverage fraction**, not a magic threshold: kitFbm is not
  // centred on .5, so a hand-set `t` covered wildly different areas per map. Sample the noise over
  // the whole field once, sort it, and take the quantile that yields the requested coverage.
  const patchRaw=(x,z)=>kitFbm((x+(P.ox||0))/(P.s||6),(z+(P.oz||0))/(P.s||6),(spec.seed+(P.seed||0))|0,(P.oct||4))
    +(kitHash(Math.round(x*2.1),Math.round(z*2.1),spec.seed+5)-.5)*.07;
  let PTH=2,PTH2=2;
  if(P){const vals=[];
    for(let z=GZ0;z<GZ1;z+=1.6)for(let x=X0;x<X1;x+=1.6)vals.push(patchRaw(x,z));
    vals.sort((a,b)=>a-b);
    const q=c=>vals[Math.min(vals.length-1,Math.max(0,Math.round((1-c)*(vals.length-1))))];
    PTH=q(P.cover===undefined?.3:P.cover);
    PTH2=P.tile2?q(P.cover2===undefined?.1:P.cover2):2;}
  // a fountain basin / decorative pool the recipe can ask for: a round painted pool, a stone curb
  // ring, and a small animated shimmer that fits *inside* the circle so no square corners show.
  // Declared before the ground loop, because the ground loop paints it.
  const POOL=f.pool,poolD=(x,z)=>POOL?Math.hypot(x-POOL.x,z-POOL.z):99;
  if(POOL)water.push({x:POOL.x,z:POOL.z,w:POOL.r*1.4,h:POOL.r*1.4,
    cx:Math.max(1,Math.round(POOL.r/1.2)),cy:Math.max(1,Math.round(POOL.r/1.2))});
  // organic ground variation: two value-noise octaves, so patches blend into each other
  const patchT=(x,z)=>{if(!P)return null;
    const v=patchRaw(x,z);
    if(v>PTH2)return P.tile2;
    if(v>PTH)return (P.tile||f.base2);
    return null};
  for(let z=GZ0;z<GZ1;z+=st){
    if(wet(z)){water.push({x:0,z:z+st/2,w:KIT_FAR,h:st,cx:KIT_FAR/st,cy:1});continue}
    const bank=f.water&&f.bank&&z>=f.water[0]-f.bank&&z<f.water[1]+f.bank,bds=bandsAt(z);
    for(let x=X0;x<X1;x+=st){
      const ed=kitEdge(f,x,z);if(ed){cells.push({x,z,tile:ed});continue}
      if(bds.length&&Math.abs(x)>=lane){                 // ground bands stay out of the lane
        let done=0;
        for(const b of bds){const jx=b.jit?(kitFbm(x/3.1,z/3.1,spec.seed+3,2)-.5)*2*b.jit:0;
          if(x+jx>=b.x0&&x+jx<b.x1){cells.push({x,z,tile:b.tile});done=1;break}}
        if(done)continue;
      }
      if(bank){cells.push({x,z,tile:bankT});continue}
      if(POOL){const d=poolD(x,z);
        if(d<POOL.r){cells.push({x,z,tile:POOL.tile||'water_frame_0'});continue}
        if(d<POOL.r+.8){cells.push({x,z,tile:POOL.curb||'limestone_pale'});continue}}
      if(f.plaza&&Math.abs(x-f.plaza.x)<f.plaza.w/2&&Math.abs(z-f.plaza.z)<f.plaza.l/2&&
        kitFbm(x/3.6,z/3.6,spec.seed+7,2)>.24){cells.push({x,z,tile:f.plaza.tile||'ruin_cobble'});continue}
      if(roadR&&Math.abs(x)<roadR(z)){cells.push({x,z,tile:roadT});continue}
      const pt=patchT(x,z);if(pt){cells.push({x,z,tile:pt});continue}
    }
  }
  const wetZone=z=>f.water&&z>=f.water[0]-(f.bank||0)&&z<f.water[1]+(f.bank||0);
  const inBand=(x,z)=>bands.some(b=>z>=b.z[0]&&z<b.z[1]&&x>=b.x0&&x<b.x1);
  const blocked=(x,z)=>!!(wetZone(z)||inBand(x,z)||Math.abs(x)<BX_+.9||poolD(x,z)<(POOL?POOL.r+1.2:0));
  // rocky outcrops stand off the lane (they are ground, but scenery never breaks the run) and
  // never in water or a terrace
  const oc=f.outcrops;
  if(oc)for(let i=0;i<oc.count;i++){
    const side=rnd()>.5?1:-1,cx=side*(oc.b0+rnd()*(oc.b1-oc.b0)),cz=oc.z0+rnd()*(oc.z1-oc.z0);
    const rx=oc.r[0]+rnd()*(oc.r[1]-oc.r[0]),rz=rx*(.55+rnd()*.5);
    for(let dz=-rz;dz<=rz;dz+=st)for(let dx=-rx;dx<=rx;dx+=st){
      if((dx*dx)/(rx*rx)+(dz*dz)/(rz*rz)>1)continue;
      const x=cx+dx+(kitFbm((cx+dx)/3.2,(cz+dz)/3.2,spec.seed+11,2)-.5)*1.5,z=cz+dz;
      if(Math.abs(x)<BX_+1.4||wetZone(z)||inBand(x,z))continue;
      if(x<X0||x>X1||z<GZ0||z>GZ1)continue;
      cells.push({x,z,tile:oc.tile});
    }
    if(oc.prop&&!wetZone(cz))kitPut(props,spec.src,cx,cz,oc.prop,(oc.ps||1)*(.85+rnd()*.3),rnd()>.5,0);
  }
  const occ=[];
  const sideOf=(o,i)=>o.side||(o.alt?(i%2?-1:1):(rnd()>.5?1:-1));
  const place=(type,x,z,scale,flip,gap)=>{const g=gap||1.5;
    for(const o of occ)if(Math.abs(o.x-x)<g&&Math.abs(o.z-z)<g)return 0;
    occ.push({x,z});return kitPut(props,spec.src,x,z,type,scale,flip,0)};
  // groves: a clump of scenery at a random spot in its |x| band, its members jittered around the
  // centre - no lines, no mirror between the sides, and the band can reach the far field. A spot
  // the spacing rule refuses is retried, so a grove really does hold its members.
  for(const g of (f.groves||[]))for(let i=0;i<g.n;i++){
    const side=sideOf(g,i),cx=side*(g.b0+rnd()*(g.b1-g.b0)),cz=g.z0+rnd()*(g.z1-g.z0);
    if(wetZone(cz))continue;
    const n=g.trees?g.trees[0]+Math.floor(rnd()*(g.trees[1]-g.trees[0]+1)):3;
    for(let k=0,t=0;k<n&&t<14;t++){
      const a=rnd()*6.2832,rr=Math.sqrt(rnd())*(g.r||3);
      const x=cx+Math.cos(a)*rr,z=cz+Math.sin(a)*rr*.6;
      if(blocked(x,z))continue;
      if(place(g.types[(rnd()*g.types.length)|0],x,z,(g.s0||.84)+rnd()*((g.s1||1.16)-(g.s0||.84)),rnd()>.5,g.gap||1.5))k++;
    }
    if(g.sub)for(const[t2,ch]of g.sub)if(rnd()<ch){
      const a=rnd()*6.2832,rr=(.4+rnd())*(g.r||3),x=cx+Math.cos(a)*rr,z=cz+Math.sin(a)*rr*.6;
      if(blocked(x,z))continue;
      place(t2,x,z,.75+rnd()*.45,rnd()>.5,.95);
    }
  }
  // singles, spread across their band - this is what dresses the far field out to |x| 29
  for(const sc of (f.scatter||[]))for(let i=0,n=0;i<sc.count*6&&n<sc.count;i++){
    const side=sideOf(sc,n),x=side*(sc.r0+rnd()*((sc.r1===undefined?sc.r0:sc.r1)-sc.r0));
    const z=sc.z0+rnd()*(sc.z1-sc.z0);
    if(blocked(x,z))continue;
    if(place(sc.type,x,z,(sc.s0||.8)+rnd()*((sc.s1||1.2)-(sc.s0||.8)),rnd()>.5,sc.gap||1.6))n++;
  }
  // the far ring: the same crop at |x| 30-42, past the field border and well into the fog, so the
  // world reads as continuing rather than stopping at the edge of the dressed field
  for(const fc of (f.far||[]))for(let i=0,n=0;i<fc.count*8&&n<fc.count;i++){
    const side=sideOf(fc,i),x=side*(fc.r0+rnd()*((fc.r1||fc.r0+8)-fc.r0));
    const z=(fc.z0===undefined?-40:fc.z0)+rnd()*((fc.z1===undefined?16:fc.z1)-(fc.z0===undefined?-40:fc.z0));
    if(place(fc.type,x,z,(fc.s0||.9)+rnd()*((fc.s1||1.3)-(fc.s0||.9)),rnd()>.5,fc.gap||3))n++;
  }
  // landmarks go exactly where the recipe says (a tower in a far corner, a torii on the approach)
  for(const fx of (f.fixed||[]))kitPut(props,spec.src,spec.design==='izlude'&&fx.type==='pier_post'?fx.x+(BX_+3-9.6):fx.x,fx.z,fx.type,fx.scale===undefined?1:fx.scale,!!fx.flip,0);
  const deck=f.deck?{x:spec.design==='izlude'?Math.max(BX_+3,f.deck[0]):f.deck[0],z:f.deck[1],w:f.deck[2],l:f.deck[3],a:f.deck[4]||0}:null;
  props.sort((p,n)=>p.z-n.z);                       // far to near, so billboards overlap right
  return {src:spec.src,design:spec.design,cells,water,props,deck,base:f.base,base2:f.base2,
          waterFrames:f.waterFrames||null,deckTile:f.deckTile||null};
}
// ----- Morocc: the attached design in the middle, the recipe's dressing all round it ---------
function farDress(spec,plan,rect){
  const f=spec.f||{},cells=plan.cells,props=plan.props;
  const[X0,X1,GZ0,GZ1]=KIT_FIELD,P=f.patch;
  let q=((spec.seed|0)||3)+77;const rnd=()=>(q=(q*16807)%2147483647)/2147483647;
  const outside=(x,z)=>x<rect[0]||x>rect[1]||z<rect[2]||z>rect[3];
  // the design's own ground, continued: the same sand with noise-driven dune patches
  const patchRaw=(x,z)=>kitFbm((x+(P.ox||0))/(P.s||8),(z+(P.oz||0))/(P.s||8),(spec.seed|0),(P.oct||4))
    +(kitHash(Math.round(x*2.1),Math.round(z*2.1),(spec.seed|0)+5)-.5)*.07;
  let PTH=2,PTH2=2;
  if(P){const vals=[];
    for(let z=GZ0;z<GZ1;z+=1.6)for(let x=X0;x<X1;x+=1.6)vals.push(patchRaw(x,z));
    vals.sort((a,b)=>a-b);
    const q=c=>vals[Math.min(vals.length-1,Math.max(0,Math.round((1-c)*(vals.length-1))))];
    PTH=q(P.cover===undefined?.3:P.cover);PTH2=P.tile2?q(P.cover2===undefined?.1:P.cover2):2;}
  if(P)for(let z=GZ0;z<GZ1;z+=.8)for(let x=X0;x<X1;x+=.8){
    if(!outside(x,z))continue;
    const v=patchRaw(x,z);
    if(v>PTH2)cells.push({x,z,tile:P.tile2});
    else if(v>PTH)cells.push({x,z,tile:P.tile});
  }
  const oc=f.outcrops;
  if(oc)for(let i=0;i<oc.count;i++){
    const side=rnd()>.5?1:-1,cx=side*(oc.b0+rnd()*(oc.b1-oc.b0)),cz=oc.z0+rnd()*(oc.z1-oc.z0);
    const rx=oc.r[0]+rnd()*(oc.r[1]-oc.r[0]),rz=rx*(.55+rnd()*.5);
    for(let dz=-rz;dz<=rz;dz+=1)for(let dx=-rx;dx<=rx;dx+=1){
      if((dx*dx)/(rx*rx)+(dz*dz)/(rz*rz)>1)continue;
      const x=cx+dx+(kitFbm((cx+dx)/3.4,(cz+dz)/3.4,(spec.seed|0)+11,2)-.5)*1.6,z=cz+dz;
      if(!outside(x,z))continue;
      cells.push({x,z,tile:oc.tile});
    }
    if(oc.prop)kitPut(props,spec.src,cx,cz,oc.prop,(oc.ps||1)*(.85+rnd()*.3),rnd()>.5,0);
  }
  const occ=props.map(p=>({x:p.x,z:p.z}));
  const sideOf=(o,i)=>o.side||(o.alt?(i%2?-1:1):(rnd()>.5?1:-1));
  const place=(type,x,z,scale,flip,gap)=>{const g=gap||1.5;
    for(const o of occ)if(Math.abs(o.x-x)<g&&Math.abs(o.z-z)<g)return 0;
    occ.push({x,z});return kitPut(props,spec.src,x,z,type,scale,flip,0)};
  for(const g of (f.groves||[]))for(let i=0;i<g.n;i++){
    const side=sideOf(g,i),cx=side*(g.b0+rnd()*(g.b1-g.b0)),cz=g.z0+rnd()*(g.z1-g.z0);
    const n=g.trees?g.trees[0]+Math.floor(rnd()*(g.trees[1]-g.trees[0]+1)):3;
    for(let k=0;k<n;k++){
      const a=rnd()*6.2832,rr=Math.sqrt(rnd())*(g.r||3),x=cx+Math.cos(a)*rr,z=cz+Math.sin(a)*rr*.6;
      if(!outside(x,z))continue;
      place(g.types[(rnd()*g.types.length)|0],x,z,(g.s0||.84)+rnd()*((g.s1||1.16)-(g.s0||.84)),rnd()>.5,g.gap||1.5);
    }
  }
  for(const sc of (f.scatter||[]))for(let i=0;i<sc.count;i++){
    const side=sideOf(sc,i),x=side*(sc.r0+rnd()*((sc.r1===undefined?sc.r0:sc.r1)-sc.r0));
    const z=sc.z0+rnd()*(sc.z1-sc.z0);
    if(!outside(x,z))continue;
    place(sc.type,x,z,(sc.s0||.8)+rnd()*((sc.s1||1.2)-(sc.s0||.8)),rnd()>.5,sc.gap||1.6);
  }
  for(const fc of (f.far||[]))for(let i=0,n=0;i<fc.count*8&&n<fc.count;i++){
    const side=sideOf(fc,i),x=side*(fc.r0+rnd()*((fc.r1||fc.r0+8)-fc.r0));
    const z=(fc.z0===undefined?-40:fc.z0)+rnd()*((fc.z1===undefined?16:fc.z1)-(fc.z0===undefined?-40:fc.z0));
    if(!outside(x,z))continue;
    if(place(fc.type,x,z,(fc.s0||.9)+rnd()*((fc.s1||1.3)-(fc.s0||.9)),rnd()>.5,fc.gap||3))n++;
  }
  props.sort((p,n)=>p.z-n.z);
  return plan;
}
// ----- pure plan: recipe + arena -> everything the painters need (no canvas, no THREE) -----
function kitPlan(m,stage=1){
  const spec=stageSpec(m,stage); if(!spec)return null;
  if(spec.layout==='field')return fieldPlan(spec);
  const d=KIT.des[spec.design]; if(!d)return null;
  const W=d.meta.gridWidth,H=d.meta.gridHeight,cells=[],water=[],props=[];
  for(let gy=0;gy<H;gy++){
    let run=null;
    for(let gx=0;gx<W;gx++){
      const t=d.cells[gy][gx].type;
      if(KIT_WET[t]){if(!run)run=[gx,gx];else run[1]=gx;continue}
      if(run){water.push(kitRect(d,run[0],run[1],gy));run=null}
      if(KIT_SKIP[t]||KIT_DECK[t])continue;
      const tile=spec.tile(t); if(tile)cells.push({x:kitX(d,gx),z:kitZ(d,gy),tile});
    }
    if(run)water.push(kitRect(d,run[0],run[1],gy));
  }
  // the bridge deck, straight from the design (Morocc's grid has none, but a design may carry one)
  const deck=d.bridge?{x:kitX(d,d.bridge.x),z:kitZ(d,d.bridge.y),w:d.bridge.width*KIT_S,l:d.bridge.length*KIT_S,a:d.bridge.angle||0}:null;
  const lane=BX_+.9,a=kitAtlas(spec.src);
  for(const sp of d.sprites){
    // an atlas that does not carry a billboard the design asks for is a gap in the kit, not a
    // licence to substitute art: the placement is reported and skipped, never replaced.
    const missing=(a&&a.sprites&&!a.sprites[sp.type])?1:0;
    let x=kitX(d,sp.x),z=kitZ(d,sp.y),nudged=0;
    // scenery never stands in the running lane: the design's own props are moved to the lane
    // edge (their side and depth are kept) rather than dropped, so the field still reads right
    if(Math.abs(x)<lane){x=(x<0?-1:1)*lane;nudged=1}
    props.push({x,z,type:sp.type,src:spec.src,scale:sp.scale||1,flip:!!sp.flip,nudged,missing});
  }
  const plan={src:spec.src,design:spec.design,cells,water,props,deck,
    base:spec.design==='morocc'?'sand':'grass_forest',
    base2:spec.design==='morocc'?'sand_dark':'grass_olive',
    waterFrames:spec.waterFrames||null,deckTile:spec.deckTile||null};
  // the design dresses the middle of the field; the recipe dresses the field around it
  if(spec.f){
    const x0=kitX(d,0),x1=kitX(d,W),z0=kitZ(d,0),z1=kitZ(d,H);
    farDress(spec,plan,[Math.min(x0,x1),Math.max(x0,x1),Math.min(z0,z1),Math.max(z0,z1)]);
  }
  return plan;
}
// Stages 4-6, 7-9 and 10 are separate *places*, not decals laid over the old field.
// Each scene specifies its own ground, path, water, tree mix and landmarks, all cropped
// from the existing kit. There are no spawn circles, floor patches or boss-floor stamps.
// Stages 1-3 continue to use KIT_MAP (including Morocc's attached desert design).
const STAGE_SCENES=[
  [ // Prontera: homestead -> village avenue -> guarded city approach
    {base:'grass_olive',road:[2.6,.9,'dirt_path'],trees:['tree_ancient_variant','tree_sapling'],detail:['tree_bush_bright','river_stone_post'],
      fixed:[['house_prontera',-23,-14],['house_prontera',23,1],['tree_ancient_large',-22,7]]},
    {base:'grass_olive',road:[3.5,.5,'ruin_cobble'],trees:['tree_ancient_large','tree_tall_cluster'],detail:['river_stone_post','tree_bush_bright'],
      fixed:[['house_prontera',-21,-22],['house_prontera',20,-6],['house_prontera',-21,7],['lantern_stone',16,-12]]},
    {base:'grass_olive',road:[5,.2,'ruin_cobble'],trees:['tree_ancient_variant'],detail:['river_stone_post'],
      fixed:[['house_prontera',-21,-21],['house_prontera',21,-21],['house_prontera',-21,7],['house_prontera',21,7],
        ['lantern_stone',-16,-5],['lantern_stone',16,-5],['river_stone_post',-16,-12],['river_stone_post',16,-12]]}
  ],
  [ // Izlude: grassy coast -> pier district -> harbour headland
    {base:'grass_olive',road:[2.5,.8,'dirt_path'],water:[-32,-24],bank:['sand_gold',1.4],trees:['tree_ancient_variant','palm_tall'],detail:['palm_double','tree_bush_bright'],
      fixed:[['palm_giant',-20,-19],['pier_post',20,-23]]},
    {base:'grass_olive',road:[3,.4,'sand_gold'],water:[-32,-21],bank:['sand_gold',2],deck:[18,-21,3,6,'bridge_planks'],trees:['palm_tall','tree_tall_cluster'],detail:['pier_post','palm_double'],
      fixed:[['pier_post',17,-23],['pier_post',19,-23],['pier_post',18,-19],['palm_giant',-22,-17]]},
    {base:'grass_olive',road:[3.5,.3,'sand_gold'],water:[-32,-24],bank:['sand_gold',2],deck:[18,-24,3.5,6,'bridge_planks'],trees:['palm_giant','palm_tall'],detail:['pier_post','river_stone_post'],
      fixed:[['pier_post',17,-26],['pier_post',19,-26],['pier_post',18,-22],['palm_giant',-21,-17],['palm_giant',22,5],['river_stone_post',-16,-5],['river_stone_post',16,-5]]}
  ],
  [ // Geffen: gnarled woods -> rune stones -> tower approach
    {base:'grass_geffen',road:[2.5,.9,'dirt_path'],trees:['tree_dark_gnarled','tree_dead'],detail:['standing_stone','tree_sapling'],
      fixed:[['standing_stone',-18,-20],['standing_stone',19,5]]},
    {base:'grass_geffen',road:[2,.4,'ruin_cobble'],trees:['tree_dark_gnarled'],detail:['standing_stone','crystal_cluster'],
      fixed:[['tower_geffen',-25,-24],['standing_stone',18,-16],['standing_stone',-18,2],['standing_stone',19,8]]},
    {base:'grass_geffen',road:[3.5,.25,'ruin_cobble'],trees:['tree_dark_gnarled'],detail:['standing_stone','crystal_cluster'],
      fixed:[['tower_geffen',-25,-23],['tower_geffen',25,9],['standing_stone',-16,-12],['standing_stone',16,-12],['crystal_cluster',-17,4],['crystal_cluster',17,4]]}
  ],
  [ // Morocc: caravan dunes -> scattered ruins -> buried temple approach
    {base:'sand',road:[2,.9,'sand_dark'],trees:['palm_double','cactus_flower'],detail:['desert_bone','cactus_small'],
      fixed:[['palm_giant',-23,-18],['ruin_stump',21,6]]},
    {base:'sand',road:[3,.5,'ruin_cobble'],trees:['palm_tall','cactus_small'],detail:['ruin_stump','ruin_curb'],
      fixed:[['house_ruin',-24,-21],['standing_stone',22,-9],['ruin_stump',-18,8]]},
    {base:'sand_dark',road:[4,.2,'ruin_cobble'],trees:['palm_tall','cactus_flower'],detail:['ruin_stump','ruin_curb'],
      fixed:[['house_ruin',-24,-22],['house_ruin',24,8],['standing_stone',-17,-13],['standing_stone',17,-13],['ruin_stump',-16,4],['ruin_stump',16,4]]}
  ],
  [ // Payon: bamboo forest -> steep mud trail -> forest shrine
    {base:'grass_forest',road:[3.5,.9,'dirt_payon'],water:[-11,-9],bank:['riverbank_wall',1],deck:[0,-10,4.5,4.5,'bridge_planks'],trees:['bamboo_grove','tree_tall_cluster'],detail:['tree_bush_bright','rock_boulder_mossy'],
      fixed:[['rock_boulder_mossy',-17,-14],['rock_boulder_mossy',17,-7]]},
    {base:'grass_forest',road:[2.5,1,'dirt_payon'],trees:['tree_ancient_large','tree_ancient_variant'],detail:['bamboo_grove','rock_boulder_mossy'],
      fixed:[['rock_boulder_mossy',-20,-19],['rock_cliff_crag',21,-6],['bamboo_grove',-18,7]]},
    {base:'grass_forest',road:[3.3,.4,'dirt_payon'],trees:['tree_ancient_large','bamboo_grove'],detail:['rock_boulder_mossy','tree_bush_bright'],
      fixed:[['shrine_stone',-23,-21],['lantern_stone',20,8],['lantern_stone',-16,-12],['lantern_stone',16,-12],['rock_boulder_mossy',-17,2],['rock_boulder_mossy',17,2]]}
  ],
  [ // Comodo: palm lagoon -> dune trail -> cave cove
    {base:'sand_gold',water:[-32,-23],bank:['sand_gold',1],trees:['palm_double','palm_tall'],detail:['cactus_flower','desert_bone'],
      fixed:[['palm_giant',-22,-18],['palm_giant',23,4]]},
    {base:'sand_gold',road:[2.6,.8,'sand_dark'],trees:['cactus_flower','palm_tall'],detail:['desert_bone','cactus_small'],
      fixed:[['rock_cliff_crag',-25,-22],['palm_double',22,6],['desert_bone',-18,4]]},
    {base:'sand_gold',road:[2.5,.4,'sand_dark'],water:[-32,-24],bank:['sand_gold',1.5],trees:['palm_giant','palm_double'],detail:['rock_cliff_crag','desert_bone'],
      fixed:[['rock_cliff_crag',-24,-19],['rock_cliff_crag',24,-19],['palm_giant',-21,6],['palm_giant',21,6],['desert_bone',-16,-7],['desert_bone',16,-7]]}
  ],
  [ // Louyang: bamboo path -> rice terraces -> stone sanctuary
    {base:'grass_jade',road:[2.7,.9,'dirt_path'],trees:['bamboo_grove','tree_tall_cluster'],detail:['tree_sapling','tree_bush_bright'],
      fixed:[['lantern_stone',-18,-18],['bamboo_grove',21,6]]},
    {base:'grass_jade',road:[2,.4,'dirt_path'],bands:[[-24,-17,-27,-16],[-9,-5,16,27]],trees:['bamboo_grove','tree_sapling'],detail:['lantern_stone','tree_bush_bright'],
      fixed:[['shrine_stone',-23,3],['lantern_stone',18,-18],['lantern_stone',-18,8]]},
    {base:'grass_jade',road:[3,.3,'dirt_path'],bands:[[-25,-21,-27,-17]],trees:['bamboo_grove','tree_tall_cluster'],detail:['lantern_stone','river_stone_post'],
      fixed:[['shrine_stone',-23,-22],['shrine_stone',23,7],['lantern_stone',-16,-11],['lantern_stone',16,-11],['lantern_stone',-16,4],['lantern_stone',16,4]]}
  ],
  [ // Amatsu: cherry orchard -> red bridge valley -> shrine procession
    {base:'grass_blossom',road:[2.8,.7,'dirt_path'],trees:['tree_cherry','tree_ancient_variant'],detail:['tree_sapling','tree_bush_bright'],
      fixed:[['lantern_stone',-19,-18],['tree_cherry',21,7]]},
    {base:'grass_blossom',road:[3.2,.4,'dirt_path'],water:[-11,-9],bank:['riverbank_wall',1],deck:[0,-10,4.2,4.5,'bridge_red'],trees:['tree_cherry','bamboo_grove'],detail:['lantern_stone','tree_bush_bright'],
      fixed:[['torii_gate',19,7],['bridge_red_arch',-24,-20],['lantern_stone',-17,-14]]},
    {base:'grass_blossom',road:[3.5,.2,'dirt_path'],trees:['tree_cherry','bamboo_grove'],detail:['lantern_stone','river_stone_post'],
      fixed:[['torii_gate',-20,-21],['bridge_red_arch',23,8],['lantern_stone',-16,-13],['lantern_stone',16,-13],['lantern_stone',-16,4],['lantern_stone',16,4]]}
  ],
  [ // Niflheim: grave wood -> ruined street -> crypt approach
    {base:'waste_nifl',trees:['tree_dead'],detail:['tombstone','desert_bone'],
      fixed:[['tombstone',-17,-19],['tree_dead',21,7]]},
    {base:'waste_nifl',road:[2.2,.5,'ruin_cobble'],trees:['tree_dead'],detail:['tombstone','rock_cliff_crag'],
      fixed:[['house_ruin',-24,-22],['tombstone',20,5],['standing_stone',-18,6]]},
    {base:'rock_abyss',road:[3,.25,'ruin_cobble'],trees:['tree_dead'],detail:['tombstone','standing_stone'],
      fixed:[['house_ruin',-24,-22],['house_ruin',24,8],['tombstone',-16,-10],['tombstone',16,-10],['standing_stone',-16,4],['standing_stone',16,4]]}
  ],
  [ // Abyss: crystal tunnels -> dark shore -> cavern heart
    {base:'rock_abyss',trees:['stalagmite','crystal_cluster'],detail:['rock_cliff_crag','standing_stone'],
      fixed:[['crystal_cluster',-20,-18],['stalagmite',21,7]]},
    {base:'rock_abyss',water:[-32,-23],bank:['limestone_pale',1.5],dark:1,trees:['crystal_cluster','stalagmite'],detail:['standing_stone','rock_cliff_crag'],
      fixed:[['crystal_cluster',-21,-18],['rock_cliff_crag',22,7]]},
    {base:'rock_abyss',water:[-32,-24],bank:['limestone_pale',1.7],dark:1,trees:['stalagmite','crystal_cluster'],detail:['standing_stone','rock_cliff_crag'],
      fixed:[['crystal_cluster',-24,-20],['crystal_cluster',24,-20],['stalagmite',-18,6],['stalagmite',18,6],['standing_stone',-16,-10],['standing_stone',16,-10]]}
  ]
];
function stageSpec(m,stage){
  const original=KIT_MAP[m];
  if(stage<=3)return original;
  const tier=stage<=6?0:stage<=9?1:2,c=STAGE_SCENES[m][tier],f={base:c.base,base2:c.base};
  if(c.road){f.road={w:c.road[0],wander:c.road[1]};f.roadTile=c.road[2]}
  if(c.water){f.water=c.water;f.bank=c.bank[1];f.bankTile=c.bank[0]}
  if(c.dark)f.waterFrames=['water_dark_0','water_dark_1'];
  if(c.deck){f.deck=c.deck.slice(0,4);f.deckTile=c.deck[4]}
  if(c.bands)f.bands=c.bands.map(([z0,z1,x0,x1])=>({tile:'paddy_water',z:[z0,z1],x0,x1,jit:1}));
  const z0=tier===2?-23:-27,z1=tier===2?9:12;
  f.groves=[{n:tier===2?4:5,r:4.5,trees:[1,2],b0:BX_+2,b1:29,z0,z1,gap:5.3,types:c.trees}];
  f.scatter=c.detail.map((type,i)=>({type,count:tier===2?5:4,r0:BX_+2+i,r1:29,z0,z1,s0:.8,s1:1.1,gap:5}));
  f.far=[{type:c.trees[0],count:12,r0:33,r1:44,z0:-43,z1:18,s0:.9,s1:1.2,gap:8}];
  f.fixed=c.fixed.map(([type,x,z])=>({type,x,z,scale:1}));
  // The boss field is special through its *scenery*, not a painted arena floor: a pair
  // of tall, map-native landmarks frames the encounter, with the far landmarks behind it.
  if(tier===2){const frame=['house_prontera','palm_giant','standing_stone','house_ruin','tree_ancient_large',
      'rock_cliff_crag','shrine_stone','torii_gate','tree_dead','crystal_cluster'][m];
    f.fixed.push({type:frame,x:-BX_-4,z:-4,scale:1.2},{type:frame,x:BX_+4,z:-4,scale:1.2,flip:true})}

  return {src:original.src,layout:'field',design:original.design+'-'+(tier+1),seed:1047+m*757+tier*1739,f};
}
function kitRect(d,gx0,gx1,gy){
  const x0=kitX(d,gx0),x1=kitX(d,gx1+1),z0=kitZ(d,gy),z1=kitZ(d,gy+1);
  return {x:(x0+x1)/2,z:(z0+z1)/2,w:x1-x0,h:z1-z0,cx:gx1-gx0+1,cy:1};
}
// ----- painters -------------------------------------------------------------------------
function kitGroundTex(plan){
  const cv=document.createElement('canvas'),g=cv.getContext('2d');
  const hdMode=typeof g.createRadialGradient==='function'&&typeof g.clearRect==='function';
  const PX=hdMode?4096:KIT_PX; cv.width=cv.height=PX;
  const step=KIT_S,cellPx=step*PX/KIT_FAR,px=PX/KIT_FAR,half=KIT_FAR/2;
  const at=(x,z)=>[(x+half)*px,(z+half)*px];
  const patPx=Math.max(16,Math.round(cellPx*4.5));
  const stamp=(tile,n)=>{const t=kitCrop(plan.src,'tile',tile);if(!t)return null;
    const sc=document.createElement('canvas');sc.width=sc.height=n;const sg=sc.getContext('2d');
    sg.imageSmoothingEnabled=true;sg.drawImage(t.image,0,0,n,n);return sc};
  const base=(kitAtlas(plan.src)&&kitAtlas(plan.src).tiles[plan.base])?plan.base:plan.base2;
  const bg=stamp(base,patPx);
  if(bg){g.imageSmoothingEnabled=true;g.fillStyle=g.createPattern(bg,'repeat');g.fillRect(0,0,PX,PX)}
  const drawn={},groups={};
  for(const c of plan.cells){
    if(!drawn[c.tile])drawn[c.tile]=kitCrop(plan.src,'tile',c.tile);
    if(!drawn[c.tile])continue;
    if(!hdMode){const[x,z]=at(c.x,c.z);g.drawImage(drawn[c.tile].image,x-.3,z-.3,cellPx+.6,cellPx+.6);continue}
    (groups[c.tile]||(groups[c.tile]=[])).push(c);
  }
  if(hdMode){
    const bR=Math.ceil(cellPx*.96),bD=bR*2;
    const br=document.createElement('canvas');br.width=br.height=bD;
    const bg2=br.getContext('2d'),gr=bg2.createRadialGradient(bR,bR,bR*.1,bR,bR,bR);
    gr.addColorStop(0,'rgba(28,22,14,1)');gr.addColorStop(.58,'rgba(28,22,14,1)');
    gr.addColorStop(.82,'rgba(28,22,14,.55)');gr.addColorStop(1,'rgba(28,22,14,0)');
    bg2.fillStyle=gr;bg2.fillRect(0,0,bD,bD);
    const lay=KIT._lay||(KIT._lay=document.createElement('canvas'));
    if(lay.width!==PX){lay.width=lay.height=PX}
    const lg=lay.getContext('2d');lg.imageSmoothingEnabled=true;
    for(const tile of Object.keys(groups)){
      const list=groups[tile],patImg=stamp(tile,patPx);if(!patImg)continue;
      let x0=PX,z0=PX,x1=0,z1=0;
      lg.globalCompositeOperation='source-over';
      for(const c of list){
        const[x,z]=at(c.x,c.z);
        const jx=(kitHash(Math.round(c.x*2),Math.round(c.z*2),17)-.5)*cellPx*.18;
        const jz=(kitHash(Math.round(c.x*2),Math.round(c.z*2),31)-.5)*cellPx*.18;
        const cx=x+cellPx*.5+jx,cz=z+cellPx*.5+jz;
        if(cx-bR<x0)x0=cx-bR;if(cz-bR<z0)z0=cz-bR;
        if(cx+bR>x1)x1=cx+bR;if(cz+bR>z1)z1=cz+bR;
      }
      x0=Math.max(0,Math.floor(x0-2));z0=Math.max(0,Math.floor(z0-2));
      x1=Math.min(PX,Math.ceil(x1+2));z1=Math.min(PX,Math.ceil(z1+2));
      const bw=x1-x0,bh=z1-z0;if(bw<=0||bh<=0)continue;
      lg.clearRect(x0,z0,bw,bh);
      for(const c of list){
        const[x,z]=at(c.x,c.z);
        const jx=(kitHash(Math.round(c.x*2),Math.round(c.z*2),17)-.5)*cellPx*.18;
        const jz=(kitHash(Math.round(c.x*2),Math.round(c.z*2),31)-.5)*cellPx*.18;
        lg.drawImage(br,x+cellPx*.5+jx-bR,z+cellPx*.5+jz-bR);
      }
      if(/cobble|dirt|limestone/.test(tile)){
        g.save();g.globalAlpha=.22;g.drawImage(lay,x0,z0,bw,bh,x0,z0,bw,bh);g.restore();
      }
      lg.globalCompositeOperation='source-in';
      lg.fillStyle=lg.createPattern(patImg,'repeat');lg.fillRect(x0,z0,bw,bh);
      g.drawImage(lay,x0,z0,bw,bh,x0,z0,bw,bh);
    }
    // Option B: RO3 warm sunlight clearing pools + dappled tree canopy shadows
    for(const sz of [-20,-10,0,8]){
      const[sx,sy]=at(0,sz),sr=cellPx*8.5;
      const sg=g.createRadialGradient(sx,sy,sr*.1,sx,sy,sr);
      sg.addColorStop(0,'rgba(255,240,185,.085)');sg.addColorStop(1,'rgba(255,240,185,0)');
      g.fillStyle=sg;g.fillRect(sx-sr,sy-sr,sr*2,sr*2);
    }
    for(const p of (plan.props||[])){
      if(!/tree_|palm_|bamboo|house_|tower_|shrine_|torii_/.test(p.type))continue;
      const[px0,pz0]=at(p.x,p.z),sr=cellPx*(/large|giant|tower|house/.test(p.type)?3.6:2.5)*(p.scale||1);
      const sx=px0+cellPx*.45,sy=pz0+cellPx*.32;
      const cg=g.createRadialGradient(sx,sy,sr*.12,sx,sy,sr);
      cg.addColorStop(0,'rgba(12,26,22,.24)');cg.addColorStop(.6,'rgba(12,26,22,.12)');cg.addColorStop(1,'rgba(12,26,22,0)');
      g.fillStyle=cg;g.fillRect(sx-sr,sy-sr,sr*2,sr*2);
    }
  }
  const t=new THREE.CanvasTexture(cv);t.magFilter=THREE.LinearFilter||THREE.NearestFilter;t.minFilter=THREE.LinearMipMapLinearFilter;t.anisotropy=16;return t;
}
function kitWaterMeshes(plan,root){
  // The animated frame pair is the recipe's choice: the kit ships a bright pair (the default, the
  // teal sea and creek water) and a dark pair (Abyss's deep lake). v1 hardcoded the bright names
  // and made a morocc-ground map borrow them from the payon sheet - with one v2 atlas there is
  // nothing left to borrow, so the pair is simply read off the plan.
  const pair=(plan.waterFrames&&plan.waterFrames.length===2)?plan.waterFrames:['water_frame_0','water_frame_1'];
  const f=pair.map(n=>kitCrop(plan.src,'tile',n));
  for(const r of plan.water){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(r.w,r.h),new THREE.MeshLambertMaterial({map:null}));
    m.rotation.x=-Math.PI/2;m.position.set(r.x,.02,r.z);m.receiveShadow=true;root.add(m);
    const set=f.filter(Boolean);
    if(set.length){const maps=set.map(tx=>{const c=tx.clone();c.needsUpdate=true;c.repeat.set(r.cx,r.cy);return c});
      m.material.map=maps[0];m.material.needsUpdate=true;KIT.water.push({m,maps})}
  }
}
function kitDeckMesh(plan,root){
  if(!plan.deck)return;
  // plank by default; Amatsu lacquers its shrine bridge red (deckTile in the recipe)
  const t=kitCrop(plan.src,'tile',plan.deckTile||'bridge_planks');if(!t)return;
  const map=t.clone();map.needsUpdate=true;map.repeat.set(plan.deck.w/KIT_S,plan.deck.l/KIT_S);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(plan.deck.w,plan.deck.l),new THREE.MeshLambertMaterial({map}));
  m.rotation.x=-Math.PI/2;m.rotation.z=plan.deck.a;m.position.set(plan.deck.x,.05,plan.deck.z);m.receiveShadow=true;root.add(m);
}
function kitPropMeshes(plan,root){
  let placed=0;const missing={};
  for(const p of plan.props){
    // a prop may borrow the other atlas (morocc palms on a payon-ground beach): check the
    // prop's own atlas, not the ground's
    const psrc=p.src||plan.src,a=kitAtlas(psrc);if(!a)continue;
    const e=a.sprites[p.type];if(!e){missing[p.type]=(missing[p.type]||0)+1;continue}
    const tex=kitCrop(psrc,'sprite',p.type,p.flip);if(!tex){missing[p.type]=(missing[p.type]||0)+1;continue}
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,alphaTest:.18}));
    const k=kitPropScale(p.type,p.scale),w=e.w*k,h=e.h*k;
    sp.center.set(e.anchorX===undefined?.5:e.anchorX/e.w,1-(e.anchorY===undefined?e.h:e.anchorY)/e.h);
    sp.scale.set(w,h,1);sp.position.set(p.x,0,p.z);root.add(sp);placed++;
  }
  return {placed,missing};
}
function kitTick(dt){
  if(!KIT.water.length)return;
  KIT.wt+=dt;if(KIT.wt<.55)return;KIT.wt=0;
  for(const w of KIT.water){if(w.maps.length<2)continue;w.m.material.map=w.m.material.map===w.maps[0]?w.maps[1]:w.maps[0]}
}
function kit3DDetails(plan,m,root){
  if(!THREE.BoxGeometry||!THREE.ConeGeometry||!THREE.Group||typeof mk!=='function')return;
  const G=new THREE.Group();G.userData={detail3d:1};root.add(G);
  let q=((m+1)*1337+((S&&S.lvl)||1)*97)|0;const rnd=()=>(q=(q*16807)%2147483647)/2147483647;
  const wetAt=(x,z)=>{
    for(const r of (plan.water||[]))if(Math.abs(x-r.x)<=r.w/2+.6&&Math.abs(z-r.z)<=r.h/2+.6)return 1;
    if(plan.deck&&Math.abs(x-plan.deck.x)<=plan.deck.w/2+.5&&Math.abs(z-plan.deck.z)<=plan.deck.l/2+.5)return 1;
    return 0;
  };
  const pal=[
    {g1:0x5e8f36,g2:0x78ab46,rk:0x8a887e,ms:0x5e8c3a,fl:0xf8dc48,fl2:0xfafcff}, // 0 Prontera
    {g1:0x5c8c38,g2:0x7aac4a,rk:0x948e7e,ms:0x608e3e,fl:0xf8dc48,fl2:0x78c8f0}, // 1 Izlude
    {g1:0x487d58,g2:0x5c966c,rk:0x6e7888,ms:0x487d58,fl:0x58b8ff,fl2:0xa888ff}, // 2 Geffen
    {g1:0x9e8852,g2:0xb89e64,rk:0xc4a06e,ms:0,fl:0xf07848,fl2:0xf8d060},        // 3 Morocc
    {g1:0x3e6e2c,g2:0x54883a,rk:0x6e7264,ms:0x467830,fl:0xe84838,fl2:0xf09030}, // 4 Payon
    {g1:0x62963e,g2:0x82b452,rk:0xc8ad7c,ms:0x62963e,fl:0xff7898,fl2:0xf8dc48}, // 5 Comodo
    {g1:0x668e3c,g2:0x82aa4e,rk:0x888a7c,ms:0x5c8636,fl:0xf8a8c8,fl2:0xf8dc48}, // 6 Louyang
    {g1:0x64923e,g2:0x80ae4e,rk:0x7e8078,ms:0x588438,fl:0xffb2cc,fl2:0xfff0f6}, // 7 Amatsu
    {g1:0x584c5c,g2:0x6e6074,rk:0x524858,ms:0,fl:0xb866ff,fl2:0x88d8ff},        // 8 Niflheim
    {g1:0x4c5a68,g2:0x607080,rk:0x566474,ms:0,fl:0x3ce8ff,fl2:0xffd24c}         // 9 Abyss
  ][m]||{g1:0x5e8f36,g2:0x78ab46,rk:0x8a887e,ms:0x5e8c3a,fl:0xf8dc48,fl2:0xffffff};

  const grassTuft=(x,z,sc,flCol,emissive)=>{
    if(wetAt(x,z))return;
    const T=new THREE.Group();
    for(let j=0;j<5;j++){
      const a=j*1.256+rnd()*.35,h=(.26+(j%3)*.07)*sc;
      const b=mk(T,BX(.065*sc,h,.045*sc),j%2?pal.g1:pal.g2,Math.cos(a)*.11*sc,h*.48,Math.sin(a)*.11*sc);
      b.rotation.y=-a;b.rotation.z=.26+rnd()*.14;b.castShadow=false;
    }
    if(flCol){
      for(let k=0;k<2;k++){
        const a=k*2.8+rnd(),bud=mk(T,SP(.065*sc),flCol,Math.cos(a)*.12*sc,(.28+k*.05)*sc,Math.sin(a)*.12*sc);
        bud.castShadow=false;if(emissive)bud.material.emissive.setHex(flCol).multiplyScalar(.5);
      }
    }
    T.position.set(x,0,z);G.add(T);
  };
  const rockCluster=(x,z,sc,moss)=>{
    if(wetAt(x,z)||Math.abs(x)<BX_+.6)return;
    const R=new THREE.Group(),ry=rnd()*6.28;
    const r1=mk(R,BX(.46*sc,.25*sc,.38*sc),pal.rk,0,.12*sc,0);r1.rotation.set((rnd()-.5)*.2,ry,(rnd()-.5)*.2);
    const r2=mk(R,BX(.3*sc,.17*sc,.26*sc),pal.rk,.24*sc,.08*sc,.14*sc);r2.rotation.y=ry+1.1;
    const r3=mk(R,BX(.18*sc,.11*sc,.16*sc),pal.rk,-.2*sc,.05*sc,.16*sc);r3.rotation.y=ry+2.2;
    if(moss&&pal.ms){const m1=mk(R,BX(.36*sc,.06*sc,.28*sc),pal.ms,0,.25*sc,0);m1.rotation.y=ry;m1.castShadow=false}
    R.position.set(x,0,z);G.add(R);
  };
  const mushroomClump=(x,z,sc,capCol)=>{
    if(wetAt(x,z)||Math.abs(x)<BX_+.4)return;
    const Mh=new THREE.Group();
    for(let k=0;k<3;k++){
      const ox=(k-1)*.15*sc,oz=(k%2?.09:-.07)*sc,ks=sc*(.75+(k===1?.3:0));
      mk(Mh,CY(.035*ks,.05*ks,.2*ks),0xf0e6d2,ox,.1*ks,oz).castShadow=false;
      mk(Mh,CN(.14*ks,.13*ks),capCol||pal.fl,ox,.22*ks,oz).castShadow=false;
      mk(Mh,SP(.024*ks),0xffffff,ox+.04*ks,.24*ks,oz+.03*ks).castShadow=false;
    }
    Mh.position.set(x,0,z);G.add(Mh);
  };
  const crystalClump=(x,z,sc,col)=>{
    if(wetAt(x,z)||Math.abs(x)<BX_+.7)return;
    const Cr=new THREE.Group();
    mk(Cr,BX(.36*sc,.11*sc,.32*sc),pal.rk,0,.055*sc,0);
    for(let k=0;k<3;k++){
      const h=(.48+(k===0?.22:0))*sc,ox=(k===0?0:(k===1?.12:-.12))*sc,oz=(k===0?0:.08)*sc;
      const sh=mk(Cr,CN(.11*sc,h),col,ox,h*.48,oz);
      sh.rotation.z=(k===0?0:(k===1?-.26:.26));sh.rotation.x=(k===2?.18:-.1);
      sh.material.emissive.setHex(col).multiplyScalar(.48);
    }
    Cr.position.set(x,0,z);G.add(Cr);
  };
  const lotusPad=(x,z,sc,flower)=>{
    const L=new THREE.Group();
    mk(L,CY(.26*sc,.26*sc,.025,10),0x489844,0,.032,0).castShadow=false;
    if(flower){
      mk(L,SP(.075*sc),0xffb2cc,0,.07,0).castShadow=false;
      mk(L,SP(.035*sc),0xf8dc48,0,.1,0).castShadow=false;
    }
    L.position.set(x,0,z);G.add(L);
  };
  const reedClump=(x,z,sc)=>{
    if(Math.abs(x)<BX_+.5)return;
    const Rd=new THREE.Group();
    for(let k=0;k<3;k++){
      const ox=(k-1)*.1*sc,oz=(k%2?.06:-.06)*sc,h=(.52+k*.08)*sc;
      const st=mk(Rd,CY(.022*sc,.028*sc,h),pal.g1,ox,h*.5,oz);st.rotation.z=(k-1)*.1;st.castShadow=false;
      mk(Rd,CY(.042*sc,.042*sc,.14*sc),0x6b4428,ox+(k-1)*.03*sc,h-.08*sc,oz).castShadow=false;
    }
    Rd.position.set(x,0,z);G.add(Rd);
  };

  // 1. Ground every 2D billboard prop with 3D root stones, undergrowth tufts & biome details
  for(const p of (plan.props||[])){
    if(Math.abs(p.x)>34||p.z<-32||p.z>14)continue;
    const sc=Math.min(1.3,Math.max(.75,p.scale||1));
    const a1=rnd()*6.28,rOff=.48+rnd()*.35;
    rockCluster(p.x+Math.cos(a1)*rOff,p.z+Math.sin(a1)*rOff*.7,.75*sc,m!==3&&m!==8&&m!==9);
    if(m<=2||m===4||m===6||m===7){
      for(let k=0;k<2;k++){
        const a2=a1+2.1+k*2.1;
        grassTuft(p.x+Math.cos(a2)*(rOff+.15),p.z+Math.sin(a2)*(rOff+.15)*.75,.9*sc,rnd()>.45?(k?pal.fl:pal.fl2):0,m===2);
      }
    }
    if((m===1||m===5)&&/palm_/.test(p.type)){
      // Fallen 3D coconuts under palms
      for(let k=0;k<2;k++)mk(G,SP(.11*sc),0x5c3c20,p.x+(k?.32:-.28),0.09*sc,p.z+.22+k*.14).castShadow=false;
    }
    if(m===4&&/tree_|bamboo/.test(p.type)&&rnd()>.45){
      mushroomClump(p.x+(rnd()>.5?.55:-.55),p.z+.35,.85*sc,rnd()>.5?0xd84432:0xe67e28);
    }
    if(m===7&&/tree_cherry/.test(p.type)){
      // Fallen 3D pink sakura petal drift around cherry tree trunks
      for(let k=0;k<4;k++){
        const pa=k*1.57+rnd()*.5,pr=.45+rnd()*.55;
        mk(G,BX(.18*sc,.025,.14*sc),k%2?0xffb6d0:0xffe2ec,p.x+Math.cos(pa)*pr,.018,p.z+Math.sin(pa)*pr*.75).castShadow=false;
      }
    }
    if((m===2||m===9)&&/standing_stone|stalagmite|crystal/.test(p.type)){
      crystalClump(p.x+(rnd()>.5?.52:-.52),p.z+.28,.75*sc,m===2?0x58b8ff:(rnd()>.5?0x3ce8ff:0xffd24c));
    }
  }

  // 2. Roadside 3D stone curbs & verge grass tufts (outside the combat lane center)
  if(m===0||m===1||m===2||m===4||m===6||m===7){
    const curbX=m===0?2.35:1.85;
    for(let z=-25;z<=10;z+=2.6){
      for(const s of [-1,1]){
        const x=s*(curbX+(rnd()-.5)*.28),cz=z+(rnd()-.5)*.7;
        if(wetAt(x,cz))continue;
        if(m===0||m===2||m===6||m===7){
          const cb=mk(G,BX(.32,.07,.44),m===0?0xc8c0b0:pal.rk,x,.035,cz);
          cb.rotation.y=(rnd()-.5)*.22;cb.receiveShadow=true;cb.castShadow=false;
        }
        if(Math.abs(x)>BX_+.5)grassTuft(x+s*.45,cz,.85,rnd()>.5?pal.fl:0,m===2);
      }
    }
  }

  // 3. Field-wide 3D biome details (outside the running lane |x| >= BX_ + 0.8)
  for(let i=0;i<38;i++){
    const side=i%2?1:-1,x=side*(BX_+.9+rnd()*15.5),z=-27+rnd()*38;
    if(wetAt(x,z))continue;
    const sc=.75+rnd()*.45;
    if(m===0||m===1||m===6||m===7){
      grassTuft(x,z,sc,rnd()>.38?(rnd()>.5?pal.fl:pal.fl2):0,false);
      if(i%5===0)rockCluster(x+side*.6,z+.4,sc*.85,true);
    }else if(m===2){
      grassTuft(x,z,sc,rnd()>.35?pal.fl:0,true);
      if(i%6===0)crystalClump(x,z,sc*.85,i%12===0?0xa888ff:0x58b8ff);
    }else if(m===3){
      // Morocc: 3D sandstone ruin blocks, desert scrub & terracotta amphora jars
      if(i%4===0){
        rockCluster(x,z,sc,false);
      }else if(i%4===1){
        const blk=mk(G,BX(.55*sc,.32*sc,.42*sc),0xd2b282,x,.15*sc,z);blk.rotation.y=rnd()*3.14;blk.rotation.z=(rnd()-.5)*.22;
      }else if(i%4===2){
        // Desert terracotta jar
        mk(G,CY(.11*sc,.15*sc,.34*sc),0xb86842,x,.17*sc,z);
        mk(G,CY(.09*sc,.07*sc,.09*sc),0x9e5432,x,.36*sc,z);
      }else{
        grassTuft(x,z,sc*.8,0,false);
      }
    }else if(m===4){
      grassTuft(x,z,sc*1.05,rnd()>.55?pal.fl:0,false);
      if(i%4===0)mushroomClump(x,z,sc,rnd()>.5?0xd84432:0xe67e28);
      if(i%7===0){
        // Mossy fallen forest log
        const lg=new THREE.Group();
        const trk=mk(lg,CY(.14*sc,.15*sc,1.35*sc),0x523822,0,.13*sc,0);trk.rotation.z=Math.PI/2;
        mk(lg,BX(.95*sc,.05*sc,.18*sc),0x467830,0,.26*sc,0).castShadow=false;
        lg.position.set(x,0,z);lg.rotation.y=rnd()*3.14;G.add(lg);
      }
    }else if(m===5){
      // Comodo beach: tropical grass, coral rocks, starfish & shells
      if(i%3===0)grassTuft(x,z,sc,pal.fl,false);
      else if(i%3===1)rockCluster(x,z,sc*.85,true);
      else{
        const sf=new THREE.Group();
        for(let a=0;a<5;a++){const ang=a*1.256,arm=mk(sf,BX(.05*sc,.03,.18*sc),0xf06838,Math.cos(ang)*.07*sc,.02,Math.sin(ang)*.07*sc);arm.rotation.y=-ang;arm.castShadow=false}
        sf.position.set(x,0,z);G.add(sf);
      }
    }else if(m===8){
      // Niflheim: crooked iron grave fence segments, skull/bone piles & purple ghost wisps
      if(i%4===0){
        const fn=new THREE.Group();
        for(let p=-1;p<=1;p++)mk(fn,CY(.03,.03,.65*sc),0x36323e,p*.28*sc,.32*sc,0);
        mk(fn,BX(.7*sc,.04,.04),0x36323e,0,.5*sc,0);mk(fn,BX(.7*sc,.04,.04),0x36323e,0,.22*sc,0);
        fn.position.set(x,0,z);fn.rotation.y=rnd()*3.14;fn.rotation.z=(rnd()-.5)*.18;G.add(fn);
      }else if(i%4===1){
        const wisp=mk(G,SP(.09*sc),0xb866ff,x,.35+rnd()*.35,z);wisp.castShadow=false;
        wisp.material.emissive.setHex(0xb866ff).multiplyScalar(.75);
      }else{
        rockCluster(x,z,sc*.85,false);
      }
    }else if(m===9){
      // Abyss Lake: glowing dragon crystals, obsidian spires & curved dragon ribs
      if(i%3===0)crystalClump(x,z,sc,i%2?0x3ce8ff:0xffd24c);
      else if(i%3===1)rockCluster(x,z,sc,false);
      else{
        const rib=new THREE.Group();
        for(let r=0;r<3;r++){
          const b=mk(rib,CY(.045*sc,.06*sc,.75*sc),0xd8d0be,(r-1)*.24*sc,.34*sc,0);
          b.rotation.z=.38;b.rotation.x=(r-1)*.12;
        }
        rib.position.set(x,0,z);rib.rotation.y=rnd()*3.14;G.add(rib);
      }
    }
  }

  // 4. Map-specific signature 3D set-pieces (fountain rim, creek reeds, paddy lotus pads, pier bollards)
  if(m===0){
    // 3D carved octagonal curb blocks + floating lilypads on Prontera's square fountain (-15, -19)
    for(let a=0;a<12;a++){
      const ang=a*Math.PI/6,fx=-15+Math.cos(ang)*2.15,fz=-19+Math.sin(ang)*2.15;
      const blk=mk(G,BX(.85,.22,.38),0xd8d2c2,fx,.11,fz);blk.rotation.y=-ang+Math.PI/2;
    }
    lotusPad(-14.4,-18.6,.9,true);lotusPad(-15.6,-19.3,.8,false);
    // Wooden rail fences & barrels near Prontera cottages
    for(const[fx,fz]of[[-16.5,-21.8],[16.5,-21.8],[-16.5,-15.2],[16.5,-15.2]]){
      const fn=new THREE.Group();
      mk(fn,CY(.05,.05,.62),0x6b4a2a,-.55,.31,0);mk(fn,CY(.05,.05,.62),0x6b4a2a,.55,.31,0);
      mk(fn,BX(1.2,.07,.05),0x825c36,0,.46,0);mk(fn,BX(1.2,.07,.05),0x825c36,0,.24,0);
      fn.position.set(fx,0,fz);G.add(fn);
    }
  }
  if(m===1||m===5){
    // Coastal driftwood & seashells along the beach bank (z ~ -18.2)
    for(let i=0;i<10;i++){
      const side=i%2?1:-1,bx=side*(BX_+1.2+rnd()*14),bz=-18.4+(rnd()-.5)*1.6;
      if(i%3===0){
        const dw=mk(G,CY(.08,.1,1.1),0x7c6248,bx,.07,bz);dw.rotation.z=Math.PI/2;dw.rotation.y=rnd()*3.14;
      }else{
        mk(G,SP(.09),i%2?0xffe6d8:0xf8a898,bx,.05,bz).castShadow=false;
      }
    }
  }
  if(m===4||m===7){
    // Creek / canal bank water reeds & stepping stones
    const wz=m===4?-6.4:-6.95;
    for(let i=0;i<12;i++){
      const side=i%2?1:-1,rx=side*(BX_+1+rnd()*14),rz=wz+(i%4<2?-1.65:1.65)+(rnd()-.5)*.4;
      reedClump(rx,rz,.85+rnd()*.3);
      if(i%3===0)lotusPad(rx,wz+(rnd()-.5)*1.1,.85,m===7||i%2===0);
    }
  }
  if(m===6){
    // Louyang terraced rice paddies: floating lotus pads + 3D stone bund curbs
    for(const c of (plan.cells||[])){
      if(c.tile==='paddy_water'&&Math.abs(c.x)>BX_+1.2&&rnd()>.78){
        lotusPad(c.x,c.z,.85+rnd()*.25,rnd()>.45);
      }
    }
  }
}
function buildKit(m){
  const plan=kitPlan(m,S.lvl);if(!plan)return null;
  if(!kitAtlas(plan.src))return null;      // no atlas for this design (yet) -> v13 scenery stands in
  if(!KIT.ground){KIT.ground=new THREE.Mesh(new THREE.PlaneGeometry(KIT_FAR,KIT_FAR),new THREE.MeshLambertMaterial({map:null}));KIT.ground.rotation.x=-Math.PI/2;KIT.ground.position.y=.004;KIT.ground.receiveShadow=true;scene.add(KIT.ground)}
  KIT.ground.visible=true;
  if(KIT.ground.material.map&&KIT.ground.material.map.dispose)KIT.ground.material.map.dispose();
  KIT.ground.material.map=kitGroundTex(plan);KIT.ground.material.needsUpdate=true;
  for(const w of KIT.water)for(const tex of w.maps)if(tex.dispose)tex.dispose();
  KIT.water=[];kitWaterMeshes(plan,deco);kitDeckMesh(plan,deco);
  const r=kitPropMeshes(plan,deco);kit3DDetails(plan,m,deco);
  KIT.built={map:m,stage:S.lvl,design:plan.design,placed:r.placed,missing:r.missing};
  for(const n in r.missing)console.warn('kit: '+plan.design+' design asks for "'+n+'" but the atlas does not carry it - '+r.missing[n]+' placement(s) skipped, nothing substituted');
  return plan;
}

