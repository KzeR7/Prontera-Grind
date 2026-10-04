// The map kit: the v2 atlas, the ten fields, and the scale they are drawn at.
//   node tools/tests/kit_sim.js
//
// What this pins down:
//   * **the live atlas is map kit v2** - 25 terrain tiles and 34 environment billboards, every
//     crop inside the sheet, a strict superset of every v1 name (so it is a drop-in), and the
//     character frame is still 80px, which is what KIT_PK is derived from;
//   * **KIT_PS is the art pass's own tuned table** (`suggest.KIT_PS` in the manifest), entry for
//     entry, and covers every billboard the atlas carries;
//   * **the runtime Morocc generator is retired**: one atlas serves every recipe, its aliases
//     resolve to the same object, and the manifest carries every name that generator painted;
//   * **Payon is the RO Payon Forest layout** (a wide mud road, a creek with a plank bridge, tree
//     lines that tower over the player, bamboo groves on the banks, mossy boulders at the
//     crossing) - the attached payon grid is still not the field;
//   * **Morocc is still the attached desert design**, cell for cell;
//   * **all ten maps wear the kit** and each one wears **its own v2 identity** (ground tile, cell
//     tiles and landmark props), researched map by map - no two maps share a signature;
//   * **props are sized off the kit's own character** (80px frame, the hero stands 2.9 units): big
//     trees 3-4x the player, a bush knee height, a crag boulder-sized - the complaint that
//     started all of this;
//   * no prop ever stands in the running lane, no ground band is painted into it, and water stays
//     out of the monster spawn band unless a deck crosses it;
//   * the water frame pair and the deck tile are the recipe's choice (Abyss's lake is dark water,
//     Amatsu's bridge is red lacquer) and the plans are deterministic;
//   * the builders really run: ground texture, animated water, the bridge deck, one billboard per
//     prop, all against a stubbed canvas/THREE, and a dead atlas falls back instead of half-building.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const R = __dirname + '/../..';
const src = fs.readFileSync(R + '/index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };

const BX_ = 5.5, Z0 = -14, Z1 = 3;      // the arena, as grab()ed into the harness below
const HERO = 2.9;                        // the hero billboard stands this tall on screen
const PAY = JSON.parse(fs.readFileSync(R + '/assets/kit/ro-map-payon.json', 'utf8'));
const MOR = JSON.parse(fs.readFileSync(R + '/assets/kit/ro-map-morocc.json', 'utf8'));
const MAN = JSON.parse(fs.readFileSync(R + '/assets/kit/ro-spritesheet.json', 'utf8'));

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('kit: map kit v2, the ten fields, and the RO scale\n');

// ---------------------------------------------------------------- the v2 atlas
t('the live atlas is kit v2: 25 tiles, 34 billboards, every crop inside the sheet', () => {
  assert.strictEqual(MAN.meta.size.w, 2048); assert.strictEqual(MAN.meta.size.h, 2048);
  assert.strictEqual(Object.keys(MAN.tiles).length, 25, 'terrain tiles');
  assert.strictEqual(Object.keys(MAN.sprites).length, 34, 'environment billboards');
  for (const [n, r] of Object.entries({ ...MAN.tiles, ...MAN.sprites }))
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= MAN.meta.size.w && r.y + r.h <= MAN.meta.size.h, n + ' crop runs off the atlas');
  // tiles are the repeating 128px squares the ground painter assumes; billboards carry a measured
  // anchor (the art pass measures it: bottom-most meaningfully-opaque row - 3px), never a guess
  for (const [n, r] of Object.entries(MAN.tiles)) assert.strictEqual(r.w, 128, n + ' tile width');
  for (const [n, r] of Object.entries(MAN.sprites)) {
    assert.ok(r.anchorX > 0 && r.anchorX < r.w, n + ' anchorX');
    assert.ok(r.anchorY > 0 && r.anchorY <= r.h, n + ' anchorY');
    assert.ok(r.anchorY >= r.h - 12, n + ' anchor must sit at the prop\'s feet, not float it');
  }
});

t('v2 is a drop-in superset of v1: every old tile and billboard name is still there', () => {
  const V1_TILES = ['grass_olive', 'grass_forest', 'dirt_path', 'riverbank_wall', 'cliff_rock', 'water_frame_0', 'water_frame_1', 'bridge_planks'];
  const V1_SPRITES = ['tree_ancient_large', 'tree_ancient_variant', 'tree_tall_cluster', 'tree_sapling',
    'tree_bush_bright', 'rock_cliff_crag', 'river_stone_post'];
  for (const n of V1_TILES) assert.ok(MAN.tiles[n], 'v1 tile ' + n + ' is gone');
  for (const n of V1_SPRITES) assert.ok(MAN.sprites[n], 'v1 billboard ' + n + ' is gone');
  // the scale reference: the character strip is still 80px frames, so KIT_PK = 2.9/80 stands
  assert.strictEqual(MAN.character.ro_adventurer.frameH, 80,
    'the prop scale is derived from this frame - if it changes, KIT_PK must be re-derived');
  assert.strictEqual(MAN.character.ro_adventurer.frameW, 64);
  assert.strictEqual(MAN.character.ro_adventurer.frames, 4);
});

t('the atlas carries every name the retired Morocc generator used to paint', () => {
  const tiles = ['sand', 'sand_dark', 'ruin_cobble', 'cliff'];                 // 'cliff' aliases cliff_sand
  const props = ['palm_giant', 'palm_tall', 'palm_double', 'cactus_flower', 'cactus_small',
    'ruin_pillar', 'ruin_column_fallen', 'ruin_stump', 'ruin_curb', 'desert_bone'];
  for (const n of tiles) assert.ok(MAN.tiles[n], 'desert tile ' + n);
  for (const n of props) assert.ok(MAN.sprites[n], 'desert prop ' + n);
  assert.deepStrictEqual(MAN.tiles.cliff, MAN.tiles.cliff_sand, 'cliff is an alias of cliff_sand');
});

t('the runtime desert generator is retired: no script tag, no MOROCC_KIT, nothing to fetch', () => {
  assert.ok(!fs.existsSync(R + '/assets/kit/morocc-atlas.js'), 'assets/kit/morocc-atlas.js must be gone');
  assert.ok(!/MOROCC_KIT/.test(src), 'index.html still calls the retired generator');
  assert.ok(!/<script[^>]*morocc-atlas/.test(src), 'index.html still loads the retired generator');
  assert.ok(!/fetch\([^)]*morocc/.test(src), 'index.html still fetches a generated atlas');
  assert.ok(fs.existsSync(R + '/Updates/retired-v1-kit/morocc-atlas.js'), 'the retired file is kept in Updates/ history');
  // the Morocc design json is still applied - only its pixels moved onto the v2 sheet
  assert.ok(/ro-map-morocc\.json/.test(src), 'the Morocc design must still be loaded');
});

t('both attached designs are kept intact, and v2 finally carries every prop they ask for', () => {
  assert.strictEqual(PAY.meta.name, 'pay_fild04_river_crossing', 'the owner\'s design file stays as shipped');
  assert.ok(PAY.cells.length === 32 && PAY.sprites.length === 30, 'and stays intact');
  // the inversion of the kit-v14 known gap: the payon design asked for rock_boulder_mossy three
  // times and v1 had no such billboard, so those placements were skipped and reported. v2 has it.
  const mossy = PAY.sprites.filter(s => s.type === 'rock_boulder_mossy');
  assert.strictEqual(mossy.length, 3, 'the design still places three mossy boulders');
  assert.ok(MAN.sprites.rock_boulder_mossy, 'and the atlas now carries the crop, so nothing is skipped');
  for (const s of [...PAY.sprites, ...MOR.sprites])
    assert.ok(MAN.sprites[s.type], 'a design asks for "' + s.type + '", which the atlas lacks');
});

t('the game\'s KIT_PS is the art pass\'s tuned table, and covers every billboard', () => {
  const sug = MAN.suggest && MAN.suggest.KIT_PS;
  assert.ok(sug, 'the manifest ships a suggest.KIT_PS table');
  // source pin: the constant in index.html is compared entry for entry against the manifest, so a
  // hand-nudged factor (or a stale v1 table left behind) fails here rather than in play
  const block = grab('const KIT_PS={', 'function kitPropScale(');
  const game = {};
  for (const m of block.matchAll(/([a-z_0-9]+)\s*:\s*([.0-9]+)/g)) game[m[1]] = Number(m[2]);
  assert.deepStrictEqual(Object.keys(game).sort(), Object.keys(sug).sort(), 'the table must be the shipped one');
  for (const k of Object.keys(sug)) assert.strictEqual(game[k], sug[k], 'factor for ' + k);
  for (const n of Object.keys(MAN.sprites)) assert.ok(sug[n] !== undefined, n + ' has no scale factor');
});

// ---------------------------------------------------------------- the kit layer, in a VM
const code = grab('// ----- The map kit', '// ----- Ragnarok-style 8-dir sprites');
const harness = `
const MANJ=__MAN__,MORJ=__MOR__;
class Col{constructor(){this.hex=0}setHex(h){this.hex=h;return this}lerp(){return this}multiplyScalar(){return this}}
class Mat{constructor(o){Object.assign(this,o||{});this.map=(o&&o.map)||null;this.color=new Col();this.emissive=new Col();this.needsUpdate=false}}
class Obj{constructor(){this.children=[];this.position={x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z}};this.rotation={x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z}};this.scale={x:1,y:1,z:1,set(x,y,z){this.x=x;this.y=y;this.z=z}};this.visible=true;this.userData={}}
  add(o){this.children.push(o);return this}remove(o){const i=this.children.indexOf(o);if(i>=0)this.children.splice(i,1)}}
class Tex{constructor(img){this.image=img;this.repeat={x:1,y:1,set(a,b){this.x=a;this.y=b}};this.needsUpdate=false;this.anisotropy=1}
  clone(){return new Tex(this.image)}}
const THREE={CanvasTexture:Tex,NearestFilter:1,LinearMipMapLinearFilter:2,RepeatWrapping:3,
  Mesh:class extends Obj{constructor(g,m){super();this.geometry=g;this.material=m} },Sprite:class extends Obj{constructor(m){super();this.material=m;this.center={x:.5,y:0,set(a,b){this.x=a;this.y=b}}} },
  PlaneGeometry:class{constructor(w,h){this.w=w;this.h=h} },MeshLambertMaterial:Mat,SpriteMaterial:Mat};
const fakeCanvas=()=>({width:0,height:0,getContext:()=>({imageSmoothingEnabled:true,set fillStyle(v){this._f=v},get fillStyle(){return this._f},
  createPattern:()=>({pat:1}),fillRect(){},drawImage(){},translate(){},scale(){},save(){},restore(){}})});
const document={createElement:()=>fakeCanvas()};
const scene=new Obj(),deco=new Obj();scene.add(deco);
const BX_=5.5,Z0=-14,Z1=3;
${code}
this.__k={KIT,KIT_S,KIT_ZC,KIT_PK,KIT_PS,KIT_MAP,kitPlan,kitPropScale,kitTick,buildKit,PAY,deco,kitAtlas,kitSrc,
  setAssets:()=>{KIT.png={};KIT.man=MANJ;KIT.des={payon:__PAYJ__,morocc:MORJ};KIT.ok=1}};
`;
const sb = { console, Promise, Image: function () { this.onload = null; this.onerror = null; }, fetch: () => ({ then: () => ({ catch: () => ({}) }) }) };
vm.createContext(sb);
vm.runInContext(harness.replace('__MAN__', JSON.stringify(MAN)).replace('__MOR__', JSON.stringify(MOR))
  .replace('__PAYJ__', JSON.stringify(PAY)), sb);
const K = sb.__k, KIT = K.KIT;
const plan = m => K.kitPlan(m);
const hero = h => h / HERO;   // world units -> multiples of the hero's height
// a prop's world height in hero-multiples, at its own placement scale (art height x KIT_PK x PS)
const sizeOf = x => { const e = MAN.sprites[x.type]; return e ? hero(e.h * K.kitPropScale(x.type, x.scale)) : 0 };
const widthOf = x => { const e = MAN.sprites[x.type]; return e ? hero(e.w * K.kitPropScale(x.type, x.scale)) : 0 };
const widest = (p, ty) => Math.max(0, ...p.props.filter(x => x.type === ty).map(sizeOf));
const tally = p => p.props.reduce((a, x) => (a[x.type] = (a[x.type] || 0) + 1, a), {});
const tilesOf = p => p.cells.reduce((a, c) => (a[c.tile] = (a[c.tile] || 0) + 1, a), {});

t('one atlas now serves every recipe: the src aliases all resolve to the same sheet', () => {
  K.setAssets();
  const a = K.kitAtlas('payon'), b = K.kitAtlas('morocc'), c = K.kitAtlas('kit');
  assert.ok(a && a === b && b === c, 'payon/morocc/kit must be one atlas, not three');
  // the same object, not a copy: the manifest the loader parsed is handed straight to the crops
  assert.strictEqual(a.img, KIT.png); assert.strictEqual(a.sprites, KIT.man.sprites);
  assert.strictEqual(a.tiles, KIT.man.tiles);
  assert.deepStrictEqual(Object.keys(KIT.srcMan), ['kit'], 'one manifest object, cached once');
  assert.strictEqual(K.kitAtlas('nonesuch'), null, 'an unknown atlas name still resolves to nothing');
});

t('all ten maps have a field, but nothing is drawn before the art arrives', () => {
  KIT.ok = 0; KIT.png = null; KIT.man = null; KIT.srcMan = {}; KIT.des = {};   // a fresh page: the loader has not come back
  assert.strictEqual(K.buildKit(4), null, 'no downloaded atlas yet -> nothing is drawn');
  assert.strictEqual(plan(3), null, 'Morocc needs its design json, which the loader fetches');
  // the field recipes are pure code, so every plan exists before any art arrives - it just
  // cannot be drawn until buildKit clears the atlas check above. v1 could build Comodo off the
  // page-generated desert atlas alone; with the generator retired, nothing builds until the
  // sheet has downloaded.
  for (const m of [0, 1, 2, 4, 5, 6, 7, 8, 9]) assert.ok(plan(m), 'map ' + m + ' has a recipe');
  for (const m of [0, 3, 5, 9]) assert.strictEqual(K.buildKit(m), null, 'map ' + m + ' must not half-build without the atlas');
  K.setAssets();
});

// ---------------------------------------------------------------- Payon: the RO recipe
t('Payon is a mud road cut through a forest, not a lake', () => {
  const p = plan(4);
  assert.strictEqual(p.design, 'payon');
  const tiles = tilesOf(p);
  assert.ok(tiles.dirt_payon > 80, 'a real Payon mud trail (' + (tiles.dirt_payon || 0) + ' cells)');
  assert.ok(!tiles.dirt_path, 'v2 gives Payon its own dark red-brown road tile');
  assert.ok(tiles.grass_olive > 60, 'grass variation under the trees (' + (tiles.grass_olive || 0) + ' cells)');
  assert.ok(tiles.riverbank_wall > 100, 'creek banks (' + (tiles.riverbank_wall || 0) + ' cells)');
  assert.ok(tiles.cliff_rock > 400, 'rocky mountain edges (' + (tiles.cliff_rock || 0) + ' cells)');
  assert.ok(!p.cells.some(c => c.tile === 'water_frame_0'), 'water is the animated layer, not ground paint');
  // the road really is down the middle of the lane and wide enough to run up
  const road = p.cells.filter(c => c.tile === 'dirt_payon' && Math.abs(c.x) < 1.6);
  assert.ok(road.length > 60, 'road cells inside the lane centre: ' + road.length);
  // and the creek crosses the whole field
  assert.ok(p.water.length >= 3 && p.water.length <= 6, 'creek rows: ' + p.water.length);
  assert.ok(p.water[0].w > 40, 'the creek runs across the whole field (' + p.water[0].w + ' units)');
  assert.ok(p.water.every(r => r.cx > 40 && r.cy === 1), 'each creek row tiles its length');
  assert.strictEqual(p.deckTile, null, 'Payon keeps the plank bridge');
  assert.strictEqual(p.waterFrames, null, 'and the bright water frames');
});

t('the creek is crossed by a plank bridge, on the road, and stays out of the monster spawn band', () => {
  const p = plan(4), deck = p.deck;
  assert.ok(deck, 'a bridge deck exists');
  assert.ok(Math.abs(deck.x) < .05, 'the bridge is on the road (x=' + deck.x.toFixed(2) + ')');
  assert.ok(deck.z > Z0 && deck.z < Z1, 'the bridge is inside the lane (z=' + deck.z.toFixed(2) + ')');
  assert.ok(deck.w > 3 && deck.l > 3, 'a walkable plank bridge: ' + deck.w.toFixed(1) + 'x' + deck.l.toFixed(1));
  const minZ = Math.min(...p.water.map(r => r.z - r.h / 2)), maxZ = Math.max(...p.water.map(r => r.z + r.h / 2));
  assert.ok(deck.z - deck.l / 2 <= minZ && deck.z + deck.l / 2 >= maxZ,
    'the deck must cover the creek end to end (' + (deck.z - deck.l / 2).toFixed(1) + '..' + (deck.z + deck.l / 2).toFixed(1) + ' vs water ' + minZ.toFixed(1) + '..' + maxZ.toFixed(1) + ')');
  assert.ok(minZ > Z0 + 6, 'the creek must not reach the monster spawn band (north edge ' + minZ.toFixed(2) + ')');
  assert.ok(maxZ < Z1, 'and it is in front of the spawn, where the player crosses it');
});

t('Payon has the bamboo groves and mossy boulders the v1 kit had no art for', () => {
  const p = plan(4), n = tally(p);
  assert.ok(n.bamboo_grove >= 6, 'bamboo lines both banks (' + (n.bamboo_grove || 0) + ' clumps)');
  const left = p.props.filter(x => x.type === 'bamboo_grove' && x.x < 0).length;
  const right = p.props.filter(x => x.type === 'bamboo_grove' && x.x > 0).length;
  assert.ok(left >= 3 && right >= 3, 'on both banks (' + left + '/' + right + ')');
  // bamboo is a grove, not a tree: taller than a bush, well under the canopy
  const bam = widest(p, 'bamboo_grove');
  assert.ok(bam > 1.2 && bam < 2.6, 'bamboo is about twice the hero (' + bam.toFixed(2) + 'x)');
  assert.ok(bam < widest(p, 'tree_ancient_large'), 'and shorter than the forest canopy');
  // nothing bamboo-ish stands in the creek: the crossing stays open
  p.props.filter(x => x.type === 'bamboo_grove').forEach(x =>
    assert.ok(Math.abs(x.z - p.deck.z) > 2, 'bamboo at z=' + x.z.toFixed(1) + ' blocks the crossing'));
  assert.ok(n.rock_boulder_mossy >= 2, 'mossy boulders frame the crossing (' + (n.rock_boulder_mossy || 0) + ')');
  p.props.filter(x => x.type === 'rock_boulder_mossy').forEach(x => {
    assert.ok(Math.abs(x.x) >= BX_, 'a boulder at x=' + x.x.toFixed(2) + ' blocks the lane');
    assert.ok(!p.water.some(r => Math.abs(x.z - r.z) < r.h / 2 + .5), 'a boulder at z=' + x.z.toFixed(1) + ' sits in the creek');
  });
});

t('Payon\'s props are RO-sized: trees tower over the player, bushes are knee height', () => {
  const p = plan(4);
  const big = Math.max(widest(p, 'tree_ancient_large'), widest(p, 'tree_ancient_variant'), widest(p, 'tree_tall_cluster'));
  assert.ok(big >= 3, 'the big trees must be at least 3x the hero (got ' + big.toFixed(2) + 'x)');
  assert.ok(big <= 5, 'and not absurd (got ' + big.toFixed(2) + 'x)');
  const bush = widest(p, 'tree_bush_bright');
  assert.ok(bush > .25 && bush < .8, 'a bush is knee height (got ' + bush.toFixed(2) + 'x)');
  const sap = widest(p, 'tree_sapling');
  assert.ok(sap > .6 && sap < 1.8, 'a sapling is around player height (got ' + sap.toFixed(2) + 'x)');
  // v2's crag crop is wide and low, so "boulder-sized" is a shape rule, not a height rule
  const crag = p.props.filter(x => x.type === 'rock_cliff_crag');
  assert.ok(crag.length, 'Payon keeps its rocky mountain edge');
  const ch = Math.max(...crag.map(sizeOf)), cw = Math.max(...crag.map(widthOf));
  assert.ok(ch > bush && ch < big * .6, 'a crag is taller than a bush and well under the canopy (' + ch.toFixed(2) + 'x)');
  assert.ok(cw > 1.2, 'and wide enough to read as a rock (' + cw.toFixed(2) + 'x hero widths)');
  console.log('       trees ' + big.toFixed(1) + 'x hero, saplings ' + sap.toFixed(2) + 'x, bushes ' + bush.toFixed(2) + 'x, crags ' + ch.toFixed(2) + 'x tall / ' + cw.toFixed(1) + 'x wide');
});

t('Payon is dressed on both sides, and nothing stands in the running lane', () => {
  const p = plan(4);
  const left = p.props.filter(x => x.x < 0), right = p.props.filter(x => x.x > 0);
  assert.ok(left.length > 15 && right.length > 15, 'tree lines on both sides (' + left.length + '/' + right.length + ')');
  assert.ok(p.props.length >= 45, 'a forest, not a shrubbery (' + p.props.length + ' props)');
  p.props.forEach(x => assert.ok(Math.abs(x.x) >= BX_, x.type + ' at x=' + x.x.toFixed(2) + ' blocks the lane'));
  // the trees hug the lane - that is what makes the field read as a road through the forest
  const trees = p.props.filter(x => /tree_ancient|tree_tall/.test(x.type));
  const near = Math.min(...trees.map(x => Math.abs(x.x)));
  assert.ok(near < BX_ + 2.5, 'the tree line starts just off the lane (nearest trunk at ' + near.toFixed(2) + ')');
  for (let i = 1; i < p.props.length; i++) assert.ok(p.props[i].z >= p.props[i - 1].z, 'props sorted far to near');
  assert.strictEqual(tally(p).river_stone_post, 2, 'two stone posts mark the crossing');
});

// ---------------------------------------------------------------- Morocc: the attached design
t('Morocc is still the attached desert design, cell for cell, now painted from v2', () => {
  const p = plan(3);
  assert.strictEqual(p.design, 'morocc');
  assert.strictEqual(p.src, 'morocc', 'the recipe keeps its own name for the atlas...');
  assert.strictEqual(K.kitAtlas(p.src), K.kitAtlas('payon'), '...which is the one v2 sheet now');
  const typeCount = (d, ty) => d.cells.flat().filter(c => c.type === ty).length;
  const sky = typeCount(MOR, 'sky');
  const painted = ['sand', 'sand_dark', 'ruin_cobble', 'cliff'].reduce((a, ty) => a + typeCount(MOR, ty), 0);
  assert.strictEqual(p.cells.length, painted, 'all ' + painted + ' terrain cells are painted');
  assert.strictEqual(painted + sky, 48 * 32, 'terrain + sky accounts for the whole grid');
  assert.deepStrictEqual([...new Set(p.cells.map(c => c.tile))].sort(), ['cliff', 'ruin_cobble', 'sand', 'sand_dark']);
  assert.strictEqual(p.water.length, 0, 'the desert has no water');
  assert.strictEqual(p.deck, null, 'the desert has no bridge');
  assert.strictEqual(p.props.length, MOR.sprites.length, 'all ' + MOR.sprites.length + ' design props are placed');
  p.props.forEach(x => assert.ok(Math.abs(x.x) >= BX_, x.type + ' at x=' + x.x.toFixed(2) + ' blocks the lane'));
  assert.ok(p.props.every(x => !x.missing), 'and none of them is a crop the atlas lacks any more');
});

t('Morocc\'s palms and ruins are RO-sized off their v2 crops', () => {
  const p = plan(3);
  assert.ok(widest(p, 'palm_tall') >= 2.2, 'palms tower (got ' + widest(p, 'palm_tall').toFixed(2) + 'x)');
  assert.ok(widest(p, 'palm_tall') <= 4.5, 'and are not skyscrapers (got ' + widest(p, 'palm_tall').toFixed(2) + 'x)');
  assert.ok(widest(p, 'palm_giant') >= widest(p, 'palm_tall'), 'the giant palm is the biggest of the three');
  assert.ok(widest(p, 'cactus_small') < 1.6, 'a small cactus is waist height (got ' + widest(p, 'cactus_small').toFixed(2) + 'x)');
  assert.ok(widest(p, 'ruin_pillar') > 1 && widest(p, 'ruin_pillar') < 3, 'a ruin pillar is player-plus (got ' + widest(p, 'ruin_pillar').toFixed(2) + 'x)');
  assert.ok(widest(p, 'ruin_curb') < .6, 'a curb stays underfoot (got ' + widest(p, 'ruin_curb').toFixed(2) + 'x)');
  console.log('       palms ' + widest(p, 'palm_tall').toFixed(1) + 'x hero, cacti ' + widest(p, 'cactus_small').toFixed(2) + 'x, pillars ' + widest(p, 'ruin_pillar').toFixed(2) + 'x');
});

t('every prop type any map places is covered by the size table', () => {
  const missing = [];
  for (let m = 0; m < 10; m++) { const p = plan(m); if (!p) continue;
    for (const x of p.props) if (K.KIT_PS[x.type] === undefined) missing.push(m + ':' + x.type); }
  assert.deepStrictEqual([...new Set(missing)], [], 'props with no scale factor (they would default to 1.0): ' + [...new Set(missing)].join(','));
});

// ---------------------------------------------------------------- the eight field recipes
const FIELD = [0, 1, 2, 5, 6, 7, 8, 9];
const NAMES = { 0: 'prontera', 1: 'izlude', 2: 'geffen', 5: 'comodo', 6: 'louyang', 7: 'amatsu', 8: 'niflheim', 9: 'abyss' };
// the v2 identity of each map, from the art pass's per-map research (RESEARCH.md / suggest.maps):
// the ground it paints, the cell tiles that must show up, and the props that make it that place.
const IDENTITY = {
  0: { ground: 'grass_olive', cells: ['dirt_path'], props: ['tree_ancient_large', 'river_stone_post', 'house_prontera'] },
  1: { ground: 'grass_olive', cells: ['sand_gold'], props: ['palm_tall', 'pier_post'] },
  2: { ground: 'grass_geffen', cells: ['cliff_rock'], props: ['tree_dark_gnarled', 'standing_stone', 'tower_geffen'] },
  3: { ground: 'sand', cells: ['sand', 'sand_dark', 'ruin_cobble', 'cliff'], props: ['palm_giant', 'ruin_pillar', 'desert_bone'] },
  4: { ground: 'grass_forest', cells: ['dirt_payon', 'riverbank_wall'], props: ['tree_ancient_large', 'bamboo_grove', 'rock_boulder_mossy'] },
  5: { ground: 'sand_gold', cells: ['cliff_sand', 'sand_dark'], props: ['palm_giant', 'palm_double', 'cactus_small'] },
  6: { ground: 'grass_jade', cells: ['paddy_water', 'dirt_path'], props: ['bamboo_grove', 'shrine_stone', 'lantern_stone'] },
  7: { ground: 'grass_blossom', cells: ['riverbank_wall'], props: ['tree_cherry', 'torii_gate', 'lantern_stone', 'bridge_red_arch'] },
  8: { ground: 'waste_nifl', cells: ['rock_abyss'], props: ['tree_dead', 'tombstone', 'house_ruin'] },
  9: { ground: 'rock_abyss', cells: ['limestone_pale'], props: ['stalagmite', 'crystal_cluster', 'standing_stone'] },
};

t('every field recipe paints ground, keeps the lane clear and is deterministic', () => {
  for (const m of FIELD) {
    const p = plan(m), again = plan(m);
    assert.strictEqual(p.design, NAMES[m], 'map ' + m + ' wears its own recipe');
    assert.strictEqual(JSON.stringify(p), JSON.stringify(again), 'map ' + m + ' must not reshuffle between respawns');
    assert.ok(p.cells.length > 100, 'map ' + m + ' paints real ground (' + p.cells.length + ' cells)');
    assert.ok(p.props.length >= 4, 'map ' + m + ' is dressed (' + p.props.length + ' props)');
    p.props.forEach(x => assert.ok(Math.abs(x.x) >= BX_, 'map ' + m + ': ' + x.type + ' at x=' + x.x.toFixed(2) + ' blocks the lane'));
    for (let i = 1; i < p.props.length; i++) assert.ok(p.props[i].z >= p.props[i - 1].z, 'map ' + m + ' props sorted far to near');
    // one atlas in v2: every ground crop and every prop comes off it
    const tiles = Object.keys(MAN.tiles);
    for (const c of p.cells) assert.ok(tiles.includes(c.tile), 'map ' + m + ' paints ' + c.tile + ', which the atlas lacks');
    assert.ok(tiles.includes(p.base) && tiles.includes(p.base2), 'map ' + m + ' base tiles exist');
    for (const x of p.props) assert.ok(MAN.sprites[x.type], 'map ' + m + ' asks for "' + x.type + '", which the atlas lacks');
  }
});

t('every map wears its own v2 identity, and no two maps share a signature', () => {
  const sigs = {};
  for (let m = 0; m < 10; m++) {
    const p = plan(m), id = IDENTITY[m], tiles = tilesOf(p), n = tally(p);
    assert.strictEqual(p.base, id.ground, 'map ' + m + ' ground should be ' + id.ground + ', got ' + p.base);
    for (const c of id.cells) assert.ok(tiles[c] > 0, 'map ' + m + ' never paints its ' + c + ' cells');
    for (const pr of id.props) assert.ok(n[pr] > 0, 'map ' + m + ' places no ' + pr);
    sigs[m] = p.base + '|' + Object.keys(tiles).sort().join(',') + '|' + Object.keys(n).sort().join(',');
  }
  for (const a of Object.keys(sigs)) for (const b of Object.keys(sigs))
    if (a < b) assert.notStrictEqual(sigs[a], sigs[b], 'maps ' + a + ' and ' + b + ' look identical');
});

t('the landmarks are where the brief puts them: one each, off-lane, RO-scaled', () => {
  const one = (m, ty) => { const p = plan(m), f = p.props.filter(x => x.type === ty);
    assert.strictEqual(f.length, 1, 'map ' + m + ' should carry exactly one ' + ty + ' (got ' + f.length + ')'); return f[0]; };
  const house = one(0, 'house_prontera');                       // a Prontera cottage, far off-lane
  assert.ok(Math.abs(house.x) > 12 && house.z < Z0, 'the cottage sits back from the avenue');
  assert.ok(sizeOf(house) > 1.5 && sizeOf(house) < 3, 'a cottage is house-sized (' + sizeOf(house).toFixed(2) + 'x)');
  const tower = one(2, 'tower_geffen');                          // the wizard tower on the horizon
  assert.ok(Math.abs(tower.x) > 15 && tower.z < Z0 - 4, 'the tower is a far-corner landmark');
  assert.ok(sizeOf(tower) > 4, 'and towers over everything else (' + sizeOf(tower).toFixed(2) + 'x)');
  const ruin = one(8, 'house_ruin');
  assert.ok(Math.abs(ruin.x) > 12 && ruin.z < Z0, 'Niflheim\'s ruined house stands off in the waste');
  const torii = one(7, 'torii_gate');                            // on the approach, at the lane edge
  assert.ok(torii.z > plan(7).deck.z && torii.z < Z1, 'the torii is on the approach, before the bridge');
  assert.ok(Math.abs(torii.x) >= BX_, 'and still out of the running lane');
  assert.ok(sizeOf(torii) > 1.8, 'a gate is bigger than the hero (' + sizeOf(torii).toFixed(2) + 'x)');
  const arch = one(7, 'bridge_red_arch');
  assert.ok(Math.abs(arch.x) > 12, 'the great red arch bridge is far scenery, off-lane');
  const shrine = one(6, 'shrine_stone');
  assert.ok(Math.abs(shrine.x) > BX_, 'Louyang\'s shrine is off the lane');
});

t('Amatsu lacquers its bridge red, and lines the approach with lantern pairs', () => {
  const p = plan(7);
  assert.strictEqual(p.deckTile, 'bridge_red', 'the shrine bridge is the kit\'s red deck tile');
  assert.ok(MAN.tiles.bridge_red, 'and the atlas carries it');
  assert.ok(Math.abs(p.deck.x) <= 1.7, 'the bridge sits on the road');
  const lan = p.props.filter(x => x.type === 'lantern_stone');
  assert.strictEqual(lan.length, 4, 'two lantern pairs (got ' + lan.length + ')');
  for (const z of [...new Set(lan.map(x => x.z))]) {
    const pair = lan.filter(x => x.z === z);
    assert.strictEqual(pair.length, 2, 'a pair at z=' + z);
    assert.ok(pair[0].x < 0 && pair[1].x > 0, 'one each side of the road');
    assert.ok(Math.abs(pair[0].x + pair[1].x) < .01, 'mirrored across the road');
  }
  const cherry = widest(p, 'tree_cherry');
  assert.ok(cherry > 2 && cherry < 4, 'blossom trees are canopy-sized (' + cherry.toFixed(2) + 'x)');
  assert.ok(tally(p).tree_cherry >= 6, 'Amatsu is a blossom field (' + tally(p).tree_cherry + ' cherry trees)');
});

t('Abyss keeps a dark lake: the water frame pair is the recipe\'s, and it animates', () => {
  const p = plan(9);
  // (spread out of the VM realm: a deepStrictEqual on a cross-realm array compares prototypes)
  assert.deepStrictEqual([...p.waterFrames], ['water_dark_0', 'water_dark_1'], 'the deep lake uses the dark pair');
  for (const n of p.waterFrames) assert.ok(MAN.tiles[n], 'the atlas carries ' + n);
  const shore = tilesOf(p);
  assert.ok(shore.limestone_pale > 20, 'a pale limestone shore around it (' + shore.limestone_pale + ' cells)');
  assert.ok(p.water.length > 0, 'the lake is there');
  // the other water maps keep the bright default
  for (const m of [1, 4, 5, 7]) assert.strictEqual(plan(m).waterFrames, null, 'map ' + m + ' uses the bright pair');
  // and the builder really crops the pair the plan asked for
  sb.__k.deco.children.length = 0; KIT.water.length = 0; KIT.tex.clear();
  K.buildKit(9);
  assert.ok(KIT.water.length > 0 && KIT.water.every(w => w.maps.length === 2), 'dark water animates between two frames');
  const key = [...KIT.tex.keys()].filter(k => /water/.test(k));
  assert.ok(key.some(k => k.includes('water_dark_0')) && key.some(k => k.includes('water_dark_1')),
    'the dark frames were cropped: ' + key.join(','));
  assert.ok(!key.some(k => k.includes('water_frame_')), 'and the bright pair was not cropped for this map');
  const first = KIT.water[0].m.material.map;
  K.kitTick(.2); assert.strictEqual(KIT.water[0].m.material.map, first, 'water waits for its clock');
  K.kitTick(.6); assert.notStrictEqual(KIT.water[0].m.material.map, first, 'the second frame comes in on the tick');
});

t('Louyang\'s terraced paddies are ground paint, and never touch the running lane', () => {
  const p = plan(6);
  const pad = p.cells.filter(c => c.tile === 'paddy_water');
  assert.ok(pad.length > 30, 'terraced paddy water (' + pad.length + ' cells)');
  assert.strictEqual(p.water.length, 0, 'paddies are painted ground, not the animated water layer');
  pad.forEach(c => assert.ok(Math.abs(c.x) >= BX_ + .9, 'a paddy cell at x=' + c.x.toFixed(2) + ' is in the lane'));
  // a terrace reads as a terrace: both sides, more than one level
  assert.ok(pad.some(c => c.x < 0) && pad.some(c => c.x > 0), 'paddies on both sides of the road');
  assert.ok(new Set(pad.map(c => c.z)).size > 4, 'and across several depths');
  // nothing stands in a terrace: the builder skips band depths for the tree line *and* for random
  // scatter, so a paddy is always open ground paint, the same way a water strip stays open
  K.KIT_MAP[6].f.bands.forEach(b => p.props.forEach(x =>
    assert.ok(!(x.z >= b.z[0] && x.z < b.z[1] && x.x >= b.x0 && x.x < b.x1),
      x.type + ' at (' + x.x.toFixed(1) + ',' + x.z.toFixed(1) + ') stands in a paddy')));
  assert.ok(tally(p).bamboo_grove >= 6, 'Louyang is bamboo country (' + tally(p).bamboo_grove + ' groves)');
  assert.ok(tally(p).shrine_stone === 1 && tally(p).lantern_stone === 4, 'one stone shrine, lantern pairs');
});

t('water stays scenery: strips never reach the monster spawn band unless decked', () => {
  for (const m of [1, 5, 7, 9]) {
    const p = plan(m);
    assert.ok(p.water.length > 0, 'map ' + m + ' carries water');
    for (const r of p.water) {
      const top = r.z + r.h / 2, bot = r.z - r.h / 2;
      // safe = entirely beyond the spawn band (far side) or entirely short of it (near side);
      // the one strip that crosses the field (Amatsu) carries its deck
      assert.ok(top < Z0 || bot > Z0 + 6 || p.deck, 'map ' + m + ' water at z=' + r.z.toFixed(1) + ' floods the spawn band');
    }
    assert.ok(p.water.every(r => r.cx > 40 && r.cy === 1), 'map ' + m + ' water rows tile their length');
  }
  for (const m of [0, 2, 3, 6, 8]) assert.strictEqual(plan(m).water.length, 0, 'map ' + m + ' is dry');
});

t('the decks land where the recipe says: pier off-lane on its posts, bridges on the road', () => {
  const iz = plan(1), am = plan(7);
  assert.ok(iz.deck && Math.abs(iz.deck.x) > BX_, 'Izlude\'s pier stands off the lane at x=' + (iz.deck && iz.deck.x));
  assert.ok(iz.water.some(r => Math.abs(iz.deck.z - r.z) < 4), 'and reaches into the sea');
  const posts = iz.props.filter(x => x.type === 'pier_post');
  assert.strictEqual(posts.length, 3, 'three pier posts carry it (' + posts.length + ')');
  posts.forEach(x => {
    assert.ok(Math.abs(x.x - iz.deck.x) < iz.deck.w / 2 + 1.2, 'a post at x=' + x.x.toFixed(1) + ' is not under the pier');
    assert.ok(Math.abs(x.z - iz.deck.z) < iz.deck.l / 2 + 1.2, 'a post at z=' + x.z.toFixed(1) + ' is not under the pier');
    assert.ok(sizeOf(x) < 1.2, 'a pier post is a post, not a pillar (' + sizeOf(x).toFixed(2) + 'x)');
  });
  assert.ok(iz.deckTile === null, 'the pier is plank');
  assert.ok(am.deck && Math.abs(am.deck.x) <= 1.7, 'Amatsu\'s bridge sits on the road');
  const stream = am.water;
  assert.ok(stream.length > 0 && am.deck.l >= stream[0].h * 2, 'the bridge spans the stream');
  assert.ok(plan(0).deck === null && plan(8).deck === null, 'no deck where no water crosses');
  assert.ok(tilesOf(iz).sand_gold > 20, 'Izlude\'s shore band is the golden sand (' + tilesOf(iz).sand_gold + ' cells)');
});

t('Geffen and Niflheim read as their own places, at the right scale', () => {
  const g = plan(2), n = plan(8);
  assert.strictEqual(g.base, 'grass_geffen', 'Geffen\'s moody blue-grey-green plains');
  assert.ok(tally(g).tree_dark_gnarled >= 8, 'dark gnarled clumps (' + tally(g).tree_dark_gnarled + ')');
  assert.ok(!g.props.some(x => /^ruin_/.test(x.type)), 'and no borrowed desert ruins any more');
  assert.ok(tally(g).standing_stone >= 3, 'standing stones (' + tally(g).standing_stone + ')');
  const gnarled = widest(g, 'tree_dark_gnarled');
  assert.ok(gnarled > 2 && gnarled < 3.4, 'a gnarled tree is big but under the canopy (' + gnarled.toFixed(2) + 'x)');
  assert.strictEqual(n.base, 'waste_nifl', 'Niflheim\'s purple-grey waste');
  assert.ok(tally(n).tombstone >= 4, 'graves (' + tally(n).tombstone + ')');
  assert.ok(tally(n).tree_dead >= 8, 'dead trees (' + tally(n).tree_dead + ')');
  assert.ok(widest(n, 'tombstone') < 1.2, 'a tombstone is waist-to-chest height (' + widest(n, 'tombstone').toFixed(2) + 'x)');
  assert.ok(widest(n, 'tree_dead') > 2, 'a dead tree still towers (' + widest(n, 'tree_dead').toFixed(2) + 'x)');
  assert.ok(!n.props.some(x => MAN.sprites[x.type] && x.type === 'tree_cherry'), 'and no bright blossom in the realm of the dead');
  // Comodo and Izlude are the golden-sand maps; Morocc keeps its pale desert heart
  assert.strictEqual(plan(5).base, 'sand_gold', 'Comodo\'s golden beach');
  assert.strictEqual(plan(3).base, 'sand', 'Morocc\'s pale sand heart is unchanged');
});

// ---------------------------------------------------------------- the builders, for real
t('buildKit paints the ground, animates the creek, lays the deck and places every prop', () => {
  K.setAssets();
  sb.__k.deco.children.length = 0;
  KIT.water.length = 0;
  const p = K.buildKit(4);
  assert.ok(p, 'buildKit returns the plan it built');
  assert.strictEqual(KIT.built.placed, p.props.length, 'every prop in the plan is placed (' + KIT.built.placed + ')');
  assert.deepStrictEqual(Object.keys(KIT.built.missing), [], 'the payon field asks for nothing the atlas lacks');
  assert.ok(KIT.ground && KIT.ground.material.map && KIT.ground.visible, 'ground mesh + texture');
  const sprites = sb.__k.deco.children.filter(c => c.material && c.material.alphaTest > 0);
  assert.strictEqual(sprites.length, p.props.length, 'one billboard per prop');
  assert.ok(KIT.water.length >= 3, 'creek meshes: ' + KIT.water.length);
  assert.ok(KIT.water.every(w => w.maps.length === 2), 'each creek row carries both animation frames');
  assert.ok(sb.__k.deco.children.some(c => c.geometry && c.geometry.w > 3), 'the bridge deck is laid');
  // the sprites are cropped art at RO scale, not silhouettes
  sprites.forEach(s => assert.ok(s.scale.y > .6 && s.center.y > 0 && s.center.y < 1, 'sprite size/anchor'));
  // one crop per prop type, shared - the atlas is not re-cut per placement
  const cut = KIT.tex.size;
  sb.__k.deco.children.length = 0; KIT.water.length = 0; K.buildKit(4);
  assert.strictEqual(KIT.tex.size, cut, 'rebuilding a map must not re-cut its crops (' + cut + ' cached)');
});

t('Morocc builds from its design, and a map with no recipe builds nothing', () => {
  K.setAssets();
  sb.__k.deco.children.length = 0;
  assert.ok(K.buildKit(3), 'morocc builds');
  assert.strictEqual(KIT.built.placed, MOR.sprites.length, 'all ' + MOR.sprites.length + ' design props placed');
  sb.__k.deco.children.length = 0;
  assert.strictEqual(K.buildKit(10), null, 'there is no map 10');
  assert.strictEqual(sb.__k.deco.children.length, 0, 'nothing is added for a map with no field');
});

t('every one of the ten maps builds, with nothing skipped and nothing substituted', () => {
  K.setAssets();
  for (let m = 0; m < 10; m++) {
    sb.__k.deco.children.length = 0; KIT.water.length = 0;
    const p = K.buildKit(m);
    assert.ok(p, 'map ' + m + ' builds');
    assert.strictEqual(KIT.built.placed, p.props.length, 'map ' + m + ' placed every prop (' + KIT.built.placed + ')');
    assert.deepStrictEqual(Object.keys(KIT.built.missing), [], 'map ' + m + ' asks for nothing the atlas lacks');
    const sprites = sb.__k.deco.children.filter(c => c.material && c.material.alphaTest > 0);
    assert.strictEqual(sprites.length, p.props.length, 'map ' + m + ' drew one billboard per prop');
    // every billboard is a real crop of the v2 sheet, sized off its own entry
    sprites.forEach((s, i) => {
      const e = MAN.sprites[p.props[i].type];
      assert.ok(s.scale.y > .2 && s.scale.y < 20, 'map ' + m + ' sprite height sane (' + s.scale.y.toFixed(2) + ')');
      assert.ok(Math.abs(s.scale.x / s.scale.y - e.w / e.h) < .01, 'map ' + m + ': ' + p.props[i].type + ' keeps its crop aspect');
    });
    assert.ok(KIT.water.every(w => w.maps.length === 2), 'map ' + m + ' water carries both frames');
  }
});

t('the loader asks for files that exist, and a dead atlas falls back instead of half-building', () => {
  const named = [...new Set([...code.matchAll(/'(?:assets\/kit\/)?(ro-[a-z0-9-]+\.(?:json|png))'/g)].map(m => m[1]))];
  for (const f of named) assert.ok(fs.existsSync(R + '/assets/kit/' + f), 'the loader names a missing asset: ' + f);
  for (const f of ['ro-spritesheet.json', 'ro-spritesheet.png', 'ro-map-payon.json', 'ro-map-morocc.json'])
    assert.ok(named.includes(f), 'the loader never asks for ' + f);
  assert.ok(!/MOROCC_KIT/.test(code), 'the kit layer no longer generates an atlas at runtime');
  K.setAssets();
  const saved = KIT.srcMan.kit, png = KIT.png, man = KIT.man;
  KIT.srcMan = {}; KIT.png = null; KIT.man = null;
  assert.strictEqual(K.buildKit(4), null, 'no atlas -> no kit layer');
  for (let m = 0; m < 10; m++) assert.strictEqual(K.buildKit(m), null, 'map ' + m + ' falls back to the v13 scenery');
  KIT.srcMan.kit = saved; KIT.png = png; KIT.man = man;
  assert.ok(K.buildKit(4), 'and builds again once the sheet is back');
});

t('with the kit ready, the arena bounds are still what they were', () => {
  const p = plan(4);
  assert.strictEqual(BX_, 5.5); assert.strictEqual(Z0, -14); assert.strictEqual(Z1, 3);
  assert.strictEqual(K.KIT_ZC, (Z0 + Z1) / 2, 'the field is centred on the play band');
  assert.strictEqual(K.KIT_PK, 2.9 / 80, 'the prop scale is still measured off the kit\'s own 80px character');
  assert.ok(p.props.every(x => Math.abs(x.x) >= BX_), 'props outside the lane');
  assert.ok(p.props.some(x => x.z > Z0 && x.z < Z1), 'the forest runs the length of the band');
  // the lane rule is structural, not per-recipe: a prop the recipe puts in the lane is moved to
  // the edge and reported as nudged, never dropped
  const nudged = K.KIT_MAP[3] ? plan(3).props.filter(x => x.nudged) : [];
  assert.ok(nudged.length > 0, 'the Morocc design still has props the lane rule moves');
  assert.strictEqual(plan(3).props.length, MOR.sprites.length, 'and not one of them is dropped');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
