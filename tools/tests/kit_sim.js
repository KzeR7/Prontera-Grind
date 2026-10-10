// The map kit: the v2 atlas, the ten fields, and the scale they are drawn at.
//   node tools/tests/kit_sim.js
//
// What this pins down (v27, `organic-field`):
//   * **the live atlas is map kit v2** - 25 terrain tiles and 34 environment billboards, every crop
//     inside the sheet, the character strip still 80px (what KIT_PK is derived from), KIT_PS still
//     the manifest's own table entry for entry;
//   * **the runtime Morocc generator stays retired** and both attached design files stay intact;
//   * **every map is a recipe**, Morocc included (its attached design in the middle, recipe dressing
//     around it) - and a plan is a pure function of its seed, so a respawn rebuilds the same map;
//   * **the ground is organic**: patches are value noise with a *requested coverage fraction*, and
//     `kit_sim` proves they are neither the v26 lattice (which repeated on a 9-cell period) nor a
//     hand-set threshold that quietly covered 80% of a map;
//   * **no map is a box**: the wild edge creeps in as ragged tongues rather than a rim, the dressed
//     field has no rectangle border, and scenery is spread from the lane edge out past the field;
//   * **both sides of every map are dressed** (the owner found Morocc's far side bare);
//   * **canopies are spaced**, not overlapping (the owner's "trees overlapping too much"), and the
//     maps the owner asked to open up really are the least crowded ones;
//   * **Prontera is dressed by the kit**: a brick cobble avenue and square, the kit's own cottages,
//     and a round fountain basin composed from crops (no fountain exists on the sheet);
//   * no prop ever stands in the running lane, no band paints into it, props sort far-to-near;
//   * the builders really run: ground, animated water, decks, one billboard per prop, against a
//     stubbed canvas/THREE, and a dead atlas falls back instead of half-building.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const R = __dirname + '/../..';
const src = fs.readFileSync(R + '/index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };

const BX_ = 13, Z0 = -28, Z1 = 12;      // the arena, as grab()ed into the harness below
const HERO = 2.9;                        // the hero billboard stands this tall on screen
const KIT_S = .85;
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

t('both attached designs are kept intact, and v2 carries every prop they ask for', () => {
  assert.strictEqual(PAY.meta.name, 'pay_fild04_river_crossing', 'the owner\'s design file stays as shipped');
  assert.ok(PAY.cells.length === 32 && PAY.sprites.length === 30, 'and stays intact');
  assert.strictEqual(MOR.meta.gridWidth, 48); assert.strictEqual(MOR.meta.gridHeight, 32);
  const mossy = PAY.sprites.filter(s => s.type === 'rock_boulder_mossy');
  assert.strictEqual(mossy.length, 3, 'the mossy boulders the v1 kit could not place are still in the file');
  for (const s of [...PAY.sprites, ...MOR.sprites])
    assert.ok(MAN.sprites[s.type], 'a design asks for "' + s.type + '", which the atlas lacks');
});

t('the game\'s KIT_PS is the art pass\'s tuned table, and covers every billboard', () => {
  const sug = MAN.suggest && MAN.suggest.KIT_PS;
  assert.ok(sug, 'the manifest ships a suggest.KIT_PS table');
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
const BX_=13,Z0=-28,Z1=12;
const S={lvl:1};
${code}
this.__k={KIT,KIT_S,KIT_ZC,KIT_PK,KIT_PS,KIT_MAP,KIT_FIELD,kitPlan,stageSpec,STAGE_SCENES,kitPropScale,kitTick,buildKit,deco,kitAtlas,kitSrc,kitFbm,kitHash,
  setAssets:()=>{KIT.png={};KIT.man=MANJ;KIT.des={payon:__PAYJ__,morocc:MORJ};KIT.ok=1},setStage:n=>{S.lvl=n}};
`;
const sb = { console, Promise, Image: function () { this.onload = null; this.onerror = null; }, fetch: () => ({ then: () => ({ catch: () => ({}) }) }) };
vm.createContext(sb);
vm.runInContext(harness.replace('__MAN__', JSON.stringify(MAN)).replace('__MOR__', JSON.stringify(MOR))
  .replace('__PAYJ__', JSON.stringify(PAY)), sb);
const K = sb.__k, KIT = K.KIT;
const plan = m => K.kitPlan(m);
const hero = h => h / HERO;   // world units -> multiples of the hero's height
const sizeOf = x => { const e = MAN.sprites[x.type]; return e ? hero(e.h * K.kitPropScale(x.type, x.scale)) : 0 };
const widthOf = x => { const e = MAN.sprites[x.type]; return e ? hero(e.w * K.kitPropScale(x.type, x.scale)) : 0 };
const widest = (p, ty) => Math.max(0, ...p.props.filter(x => x.type === ty).map(sizeOf));
const tally = p => p.props.reduce((a, x) => (a[x.type] = (a[x.type] || 0) + 1, a), {});
const tilesOf = p => p.cells.reduce((a, c) => (a[c.tile] = (a[c.tile] || 0) + 1, a), {});
const FIELD = [0, 1, 2, 4, 5, 6, 7, 8, 9];
const NAMES = { 0: 'prontera', 1: 'izlude', 2: 'geffen', 3: 'morocc', 4: 'payon', 5: 'comodo', 6: 'louyang', 7: 'amatsu', 8: 'niflheim', 9: 'abyss' };
// the **big** trees: saplings and bushes are undergrowth and are allowed to sit close, so they are
// not what "canopies overlap" means
const canopyOf = p => p.props.filter(x => /tree_ancient|tree_tall|tree_dark|tree_dead|tree_cherry|palm_giant|palm_tall|palm_double|bamboo_grove/.test(x.type));
// a lookup of the plan's painted cells, at the plan's own .8 spacing, and a sampler that walks the
// plan's own lattice - sampling half a cell off reads every position as unpainted
const cellMap = p => { const m = new Map(); for (const c of p.cells) m.set(Math.round(c.x * 10) + ':' + Math.round(c.z * 10), c.tile); return m };
const at = (m, x, z) => m.get(Math.round(x * 10) + ':' + Math.round(z * 10));
const FIELD_X0 = -30, FIELD_X1 = 30, FIELD_Z0 = -30, FIELD_Z1 = 14, ST = .8;
// walk the field and report what the plan paints there: total positions, tiles, and the fraction on
// one tile. Everything about "how much of the field is dark" must be measured this way - counting
// only *painted* cells skews the number, because the base tile is the absence of a cell.
function sampleField(p, tile, land) {
  const cm = cellMap(p); let n = 0, on = 0; const tiles = {};
  for (let i = 0; i < (FIELD_X1 - FIELD_X0) / ST; i++) for (let j = 0; j < (FIELD_Z1 - FIELD_Z0) / ST; j++) {
    const x = FIELD_X0 + i * ST, z = FIELD_Z0 + j * ST;
    if (land && !land(z)) continue;
    n++; const v = at(cm, x, z);
    if (v === undefined) continue;
    tiles[v] = (tiles[v] || 0) + 1;
    if (tile && v === tile) on++;
  }
  return { n, tiles, frac: tile ? on / n : 0, painted: n - (tiles.__none || 0) };
}

t('one atlas now serves every recipe: the src aliases all resolve to the same sheet', () => {
  K.setAssets();
  const a = K.kitAtlas('payon'), b = K.kitAtlas('morocc'), c = K.kitAtlas('kit');
  assert.ok(a && a === b && b === c, 'payon/morocc/kit must be one atlas, not three');
  assert.strictEqual(a.img, KIT.png); assert.strictEqual(a.sprites, KIT.man.sprites);
  assert.strictEqual(a.tiles, KIT.man.tiles);
  assert.deepStrictEqual(Object.keys(KIT.srcMan), ['kit'], 'one manifest object, cached once');
  assert.strictEqual(K.kitAtlas('nonesuch'), null, 'an unknown atlas name still resolves to nothing');
});

t('all ten maps have a recipe, two of them need their attached design, and nothing draws before the art', () => {
  KIT.ok = 0; KIT.png = null; KIT.man = null; KIT.srcMan = {}; KIT.des = {};
  assert.strictEqual(K.buildKit(4), null, 'no downloaded atlas yet -> nothing is drawn');
  assert.strictEqual(plan(3), null, 'Morocc needs its design json, which the loader fetches');
  for (const m of [0, 1, 2, 4, 5, 6, 7, 8, 9]) assert.ok(plan(m), 'map ' + m + ' has a recipe');
  for (const m of [0, 1, 3, 5, 9]) assert.strictEqual(K.buildKit(m), null, 'map ' + m + ' must not half-build without the atlas');
  K.setAssets();
  assert.strictEqual(plan(3).design, 'morocc', 'and Morocc plans again once its design is back');
});

t('every plan is a pure function of its seed - a respawn rebuilds the identical map', () => {
  K.setAssets();
  for (let m = 0; m < 10; m++) {
    const a = plan(m), b = plan(m);
    assert.strictEqual(JSON.stringify(a), JSON.stringify(b), 'map ' + m + ' reshuffled between builds');
  }
});

// ---------------------------------------------------------------- the v27 organic layout
t('ground variation is organic noise, not the v26 lattice', () => {
  // v26 painted `(i*7+j*13)%9===0` - a diagonal lattice that repeats every 9 cells and reads as
  // printed wallpaper. Prove the patch mask has no such period and is not a lattice.
  for (const m of FIELD) {
    const p = plan(m), cm = cellMap(p), f = K.KIT_MAP[m].f, patch = f.patch;
    if (!patch) continue;
    const W = 75, H = 55, mask = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++)
      mask.push(at(cm, FIELD_X0 + i * ST, FIELD_Z0 + j * ST) === patch.tile ? 1 : 0);
    const on = mask.reduce((a, v) => a + v, 0);
    if (on < mask.length * .03) continue;                 // a mask with no patches proves nothing
    // The v26 pattern was `(i*7+j*13)%9===0`: it repeated EXACTLY every 9 cells (Pearson phi 1.00)
    // and painted isolated single cells (mean run length 1.0). Organic noise does neither. A
    // smooth field does correlate a little at a 3-cell shift - that is smoothness, not a lattice -
    // so the thresholds below are for phi ~1, not phi ~0.
    const runs = []; let cur = 0;
    for (let j = 0; j < H; j++) { cur = 0; for (let i = 0; i < W; i++) { if (mask[j * W + i]) cur++; else { if (cur) runs.push(cur); cur = 0; } } if (cur) runs.push(cur); }
    const meanRun = runs.reduce((a, b) => a + b, 0) / runs.length;
    assert.ok(meanRun > 1.5, 'map ' + m + ': the patches are single cells (mean run ' + meanRun.toFixed(2) + ') - that is the lattice bug');
    const mean = v => v.reduce((a, b) => a + b, 0) / v.length;
    for (const period of [3, 9, 13]) {
      const a = [], b = [];
      for (let j = 0; j < H; j++) for (let i = 0; i + period < W; i++) { a.push(mask[j * W + i]); b.push(mask[j * W + i + period]); }
      const ma = mean(a), mb = mean(b);
      let sab = 0, saa = 0, sbb = 0;
      for (let i = 0; i < a.length; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
      const phi = sab / Math.sqrt(saa * sbb || 1);
      assert.ok(Math.abs(phi) < .8, 'map ' + m + ': the patch mask correlates with itself at period ' + period + ' (phi ' + phi.toFixed(2) + ') - that is the lattice bug');
    }
  }
});

t('ground patches cover the fraction the recipe asked for, and the base still dominates', () => {
  for (const m of FIELD) {
    const p = plan(m), cm = cellMap(p), f = K.KIT_MAP[m].f, patch = f.patch;
    if (!patch) continue;
    // coverage counts LAND - the sea and its shore are not ground the recipe is patch-painting
    const land = z => !(f.water && z >= f.water[0] - (f.bank || 0) && z < f.water[1] + (f.bank || 0));
    const got = sampleField(p, patch.tile, land).frac, want = patch.cover === undefined ? .3 : patch.cover;
    assert.ok(got > want * .55 && got < want * 1.5,
      'map ' + m + ' asked for ' + want + ' patch coverage and painted ' + got.toFixed(2));
    assert.ok(got < .5, 'map ' + m + ' is more patch than base - the floor should be mostly ' + f.base);
  }
});

t('no map is a box: the edge is ragged and never a frame or a rectangle', () => {
  for (const m of FIELD) {
    const p = plan(m), cm = cellMap(p), f = K.KIT_MAP[m].f;
    // what dresses a position: a painted cell, or the water layer (a coastal map's far border is
    // sea, and sea is dressing - the earlier version of this test called that border "bare")
    const waterTile = (p.waterFrames && p.waterFrames[0]) || 'water_frame_0';
    const dressed = (x, z) => {
      const v = at(cm, x, z); if (v) return v;
      for (const r of p.water) if (Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.h / 2) return waterTile;
      return null;
    };
    // The dressed field stops at |x| 30, and beyond it the ground is the *base tile* the painter
    // repeats - so there is no bare ring and no visible edge. Pin that: the painted ground must be
    // much larger than the dressed field (KIT_FAR vs KIT_FIELD).
    const far = grab('const KIT_S=.85,KIT_ZC=', 'const KIT_PK=').match(/KIT_FAR=(\d+)/);
    const field = grab('const KIT_FIELD=', '// The wild edge').match(/-?\d+/g).map(Number);
    assert.ok(far, 'the kit layer still declares KIT_FAR');
    assert.ok(Number(far[1]) / 2 >= 40, 'the painted ground reaches |x| ' + Number(far[1]) / 2 + ' - it must outrun the dressed field');
    assert.ok(Math.abs(field[0]) < Number(far[1]) / 2 && Math.abs(field[2]) < Number(far[1]) / 2,
      'the dressed field is not inside the painted ground - that is the box edge');
    // **no frame**: a rim would make one tile own the whole border. The border must be dressed
    // like the field just inside it - the v26 brown surround the owner asked to remove was exactly
    // this failure, so it is pinned here for every recipe that opts into an `edge` too.
    // shares are always measured against the WHOLE row (75 positions). Measuring against painted
    // cells only was the bug that made a 21%-patch row read as an 80% "frame".
    const ROW = 75;
    const rowTiles = z => { const t = {}; for (let i = 0; i < ROW; i++) { const v = dressed(FIELD_X0 + i * ST, z); if (v) t[v] = (t[v] || 0) + 1; } return t };
    // compare each border against the interior at the SAME end of the field: on a coastal map the
    // far interior is sea, so a shared reference row is meaningless
    const interiorAt = z => rowTiles(z === FIELD_Z0 ? FIELD_Z0 + 4 : FIELD_Z1 - ST - 4);
    for (const [where, z] of [['bottom', FIELD_Z0], ['top', FIELD_Z1 - ST]]) {
      // a frame means one *terrain* tile owning the border. A sea border is not a frame - the
      // owner asked for the water to reach the far edge - so water rows are exempt (the dressed
      // count above still proves they are dressed).
      // The base tile is the ground everywhere the plan paints nothing, so a lightly-painted
      // border is not "bare" - it is meadow, sand or waste. A *frame* would be dense and single
      // tile, so only rows with real paint are judged.
      const b = rowTiles(z), bn = Object.values(b).reduce((a, v) => a + v, 0);
      if (bn < 6) continue;
      if (b[waterTile] === bn) continue;                  // an all-sea border is the recipe's intent
      const ground = {}; for (const k of Object.keys(b)) if (k !== waterTile) ground[k] = b[k];
      if (Object.values(ground).reduce((a, v) => a + v, 0) < 6) continue;   // mostly water
      const interior = interiorAt(z);
      const dom = Object.keys(ground).reduce((a, k) => ground[k] > (ground[a] || 0) ? k : a, Object.keys(ground)[0]);
      const share = ground[dom] / ROW, inside = (interior[dom] || 0) / ROW;
      // a frame is *dominant*: v26's rocky surround owned the border outright. Patch noise can
      // still make one row busier than another, so the bar is 80% / 3x, not "any variation".
      assert.ok(share < .8, 'map ' + m + ': the ' + where + ' border is ' + Math.round(share * 100) + '% ' + dom + ' - that is a frame');
      assert.ok(share <= Math.max(.6, inside * 3),
        'map ' + m + ': ' + dom + ' is ' + Math.round(share * 100) + '% of the ' + where + ' border but only ' + Math.round(inside * 100) + '% inside it - a rim');
    }
  }
});

t('scenery is spread over the whole field, near the lane and far out, with a far ring', () => {
  for (const m of FIELD) {
    const p = plan(m);
    const near = p.props.filter(x => Math.abs(x.x) < BX_ + 3).length;
    const out = p.props.filter(x => Math.abs(x.x) >= 20).length;
    const ring = p.props.filter(x => Math.abs(x.x) > 30).length;
    assert.ok(near >= 1, 'map ' + m + ' has nothing near the lane (' + near + ')');
    assert.ok(out >= 5, 'map ' + m + ' has nothing far out (' + out + ') - the owner\'s "everything in the centre"');
    assert.ok(ring >= 5, 'map ' + m + ' has no far ring (' + ring + ')');
    const span = Math.max(...p.props.map(x => Math.abs(x.x)));
    assert.ok(span > 33, 'map ' + m + ' stops at |x| ' + span.toFixed(1));
  }
});

t('both sides of every map are dressed - no bare side', () => {
  for (let m = 0; m < 10; m++) {
    const p = plan(m);
    const left = p.props.filter(x => x.x < 0).length, right = p.props.filter(x => x.x > 0).length;
    assert.ok(left >= 8 && right >= 8, 'map ' + m + ' is lopsided (' + left + '/' + right + ')');
  }
});

t('canopies are spaced, not overlapping - and the opened-up maps are the least crowded', () => {
  const crowded = {};
  for (const m of FIELD) {
    const p = plan(m);
    assert.ok(p.props.every(x => Math.abs(x.x) >= BX_), 'map ' + m + ': a prop stands in the lane');
    const cs = canopyOf(p);
    let min = 99;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++)
      min = Math.min(min, Math.hypot(cs[i].x - cs[j].x, cs[i].z - cs[j].z));
    if (cs.length > 1) assert.ok(min > 4, 'map ' + m + ' overlaps its canopies (closest pair ' + min.toFixed(1) + ' units)');
    crowded[m] = p.props.length;
    for (let i = 1; i < p.props.length; i++) assert.ok(p.props[i].z >= p.props[i - 1].z, 'map ' + m + ' props sorted far to near');
  }
  // Geffen, Louyang and Abyss are the three the owner asked to open up for a bigger battle field
  for (const m of [2, 6, 9]) assert.ok(crowded[m] <= 45, 'map ' + m + ' is still crowded (' + crowded[m] + ' props)');
  console.log('       props per map: ' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(m => m + ':' + crowded[m]).join('  '));
});

t('every cell tile and every prop a recipe asks for exists on the atlas, and has a scale factor', () => {
  for (let m = 0; m < 10; m++) {
    const p = plan(m); if (!p) continue;
    assert.ok(Object.keys(MAN.tiles).includes(p.base) && Object.keys(MAN.tiles).includes(p.base2), 'map ' + m + ' base tiles exist');
    for (const c of p.cells) assert.ok(MAN.tiles[c.tile], 'map ' + m + ' paints ' + c.tile + ', which the atlas lacks');
    for (const x of p.props) {
      assert.ok(MAN.sprites[x.type], 'map ' + m + ' asks for "' + x.type + '", which the atlas lacks');
      assert.ok(K.KIT_PS[x.type] !== undefined, 'map ' + m + ' places ' + x.type + ' with no scale factor');
    }
  }
});

t('water stays scenery: strips never reach the monster spawn band unless decked', () => {
  for (const m of [1, 4, 5, 7, 9]) {
    const p = plan(m);
    assert.ok(p.water.length > 0, 'map ' + m + ' carries water');
    for (const r of p.water) {
      const top = r.z + r.h / 2, bot = r.z - r.h / 2;
      assert.ok([[-8,6],[8,-2],[-8,-16]].every(([,z]) => top < z-1 || bot > z+1 || p.deck),
        'map ' + m + ' water at z=' + r.z.toFixed(1) + ' floods a pack');
    }
  }
  // the seas reach the field border, so the far side of a coastal map is water, not bare ground
  for (const m of [1, 5, 9]) {
    const p = plan(m), minZ = Math.min(...p.water.map(r => r.z - r.h / 2));
    assert.ok(minZ <= -29.9, 'map ' + m + '\'s water starts at z=' + minZ.toFixed(1) + ', leaving bare ground behind it');
  }
  for (const m of [2, 3, 6, 8]) assert.strictEqual(plan(m).water.length, 0, 'map ' + m + ' is dry');
});

t('the decks land where the recipe says: pier off-lane on its posts, bridges on the water', () => {
  const iz = plan(1), am = plan(7), pa = plan(4);
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
  assert.ok(pa.deck && Math.abs(pa.deck.x) < .05, 'Payon\'s plank bridge is on the mud road');
  const minZ = Math.min(...pa.water.map(r => r.z - r.h / 2)), maxZ = Math.max(...pa.water.map(r => r.z + r.h / 2));
  assert.ok(pa.deck.z - pa.deck.l / 2 <= minZ && pa.deck.z + pa.deck.l / 2 >= maxZ, 'and covers the creek end to end');
  assert.ok(minZ > -16 + 1 && maxZ < -2 - 1, 'the creek must not reach either neighbouring pack');
  assert.ok(plan(8).deck === null, 'no deck where no water crosses');
});

// ---------------------------------------------------------------- the ten identities
t('Prontera is the kit\'s city: a brick road, a square, cottages and a round fountain basin', () => {
  const p = plan(0), tiles = tilesOf(p), n = tally(p);
  assert.strictEqual(p.base, 'grass_olive', 'Pontera keeps the light green meadow');
  assert.ok((tiles.ruin_cobble || 0) > 300, 'a paved brick avenue and square (' + (tiles.ruin_cobble || 0) + ' cells)');
  assert.ok(!tiles.dirt_path, 'and no dirt road - the owner asked for bricks');
  assert.ok(n.house_prontera >= 4, 'the kit\'s own cottages line the square (' + (n.house_prontera || 0) + ')');
  assert.ok(n.lantern_stone >= 4 && n.river_stone_post >= 4, 'lanterns and stone posts dress it');
  // the fountain: a round painted pool with a curb ring, a shimmer that fits inside, and posts round it
  const pool = K.KIT_MAP[0].f.pool;
  assert.ok(pool, 'the recipe asks for a fountain');
  assert.strictEqual(p.water.length, 1, 'the fountain is the only water on Prontera');
  const shimmer = p.water[0];
  assert.ok(shimmer.w / 2 < pool.r, 'the animated shimmer fits inside the painted circle (no square corners)');
  const poolCells = p.cells.filter(c => Math.hypot(c.x - pool.x, c.z - pool.z) < pool.r);
  assert.ok(poolCells.length > 10, 'a round pool is painted (' + poolCells.length + ' cells)');
  const curb = p.cells.filter(c => { const d = Math.hypot(c.x - pool.x, c.z - pool.z); return d >= pool.r && d < pool.r + .8 });
  assert.ok(curb.length > 16, 'a stone curb rings it (' + curb.length + ' cells)');
  assert.ok(Math.abs(pool.x) > BX_, 'the fountain sits off the running lane');
  const posts = p.props.filter(x => x.type === 'river_stone_post' && Math.hypot(x.x - pool.x, x.z - pool.z) < 4);
  assert.ok(posts.length >= 4, 'stone posts stand round the basin (' + posts.length + ')');
  assert.ok(p.props.some(x => x.type === 'ruin_stump' && Math.hypot(x.x - pool.x, x.z - pool.z) < 2), 'and a plinth at the centre');
});

t('Izlude is Prontera by the sea, not a jungle', () => {
  const p = plan(1), tiles = tilesOf(p), n = tally(p);
  assert.ok((tiles.sand_gold || 0) > 100, 'a golden shore band (' + (tiles.sand_gold || 0) + ' cells)');
  assert.ok(p.water.length > 8, 'and the sea at the far side');
  assert.ok((n.palm_tall || 0) + (n.palm_giant || 0) >= 3, 'palms at the waterline');
  assert.ok(n.pier_post === 3, 'the pier on its posts');
  const trees = canopyOf(p).filter(x => !/bamboo/.test(x.type)).length;
  assert.ok(trees <= 20 && p.props.length <= 35, 'deliberately open - not a jungle (' + trees + ' big trees, ' + p.props.length + ' props)');
  const f = K.KIT_MAP[1].f;
  assert.ok(f.patch.cover <= .2, 'and a light floor: ' + f.patch.cover + ' dark patch coverage');
});

t('Geffen is open plains: gnarled clumps, standing stones, the tower on the horizon', () => {
  const g = plan(2), tiles = tilesOf(g);
  assert.strictEqual(g.base, 'grass_geffen', 'Geffen\'s moody blue-grey-green plains');
  assert.ok(tally(g).tree_dark_gnarled >= 8, 'dark gnarled clumps (' + tally(g).tree_dark_gnarled + ')');
  assert.ok(!g.props.some(x => /^ruin_/.test(x.type)), 'and no borrowed desert ruins any more');
  assert.ok(tally(g).standing_stone >= 3, 'standing stones (' + tally(g).standing_stone + ')');
  const gnarled = widest(g, 'tree_dark_gnarled');
  assert.ok(gnarled > 2 && gnarled < 3.4, 'a gnarled tree is big but under the canopy (' + gnarled.toFixed(2) + 'x)');
  assert.ok(!K.KIT_MAP[2].f.outcrops, 'the rocky blobs the owner disliked are gone from the middle of the field');
  assert.ok(g.props.length < 45, 'and it stays open (' + g.props.length + ' props)');
});

t('Morocc keeps its attached design, and is dressed all round it on both sides', () => {
  const p = plan(3);
  assert.strictEqual(p.design, 'morocc');
  const W = MOR.meta.gridWidth, H = MOR.meta.gridHeight;
  const x0 = -(W / 2) * KIT_S, x1 = (W / 2) * KIT_S;
  const z0 = -(H / 2) * KIT_S + K.KIT_ZC, z1 = (H / 2) * KIT_S + K.KIT_ZC;
  const inside = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;   // inclusive: the design's own border cells sit exactly on it
  const typeCount = (d, ty) => d.cells.flat().filter(c => c.type === ty).length;
  const sky = typeCount(MOR, 'sky');
  const painted = ['sand', 'sand_dark', 'ruin_cobble', 'cliff'].reduce((a, ty) => a + typeCount(MOR, ty), 0);
  const designCells = p.cells.filter(c => inside(c.x, c.z));
  assert.strictEqual(designCells.length, painted, 'all ' + painted + ' design terrain cells are painted, cell for cell');
  assert.strictEqual(painted + sky, 48 * 32, 'terrain + sky accounts for the whole grid');
  const designProps = p.props.filter(x => inside(x.x, x.z));
  assert.strictEqual(designProps.length, MOR.sprites.length, 'all ' + MOR.sprites.length + ' design props are placed, none dropped');
  assert.ok(designProps.some(x => x.nudged), 'the lane rule still moves the ones it must, and keeps them');
  // and the new dressing: sand out to the horizon, palms/cacti/rocks, both sides
  const far = p.props.filter(x => !inside(x.x, x.z));
  assert.ok(far.length >= 20, 'the field around the design is dressed (' + far.length + ' props)');
  assert.ok(far.some(x => x.x < -20) && far.some(x => x.x > 20), 'on both sides (the owner found one side bare)');
  assert.ok(far.filter(x => /palm_/.test(x.type)).length >= 6, 'palms out there');
  const outer = p.cells.filter(c => !inside(c.x, c.z));
  assert.ok(outer.length > 400, 'and the sand itself continues (' + outer.length + ' cells)');
  for (let i = 1; i < p.props.length; i++) assert.ok(p.props[i].z >= p.props[i - 1].z, 'props sorted far to near');
});

t('Payon is a mud road through a roomy forest, with bamboo at the crossing', () => {
  const p = plan(4), tiles = tilesOf(p), n = tally(p);
  assert.ok(tiles.dirt_payon > 80, 'a real Payon mud trail (' + (tiles.dirt_payon || 0) + ' cells)');
  assert.ok(!tiles.dirt_path, 'v2 gives Payon its own dark red-brown road tile');
  assert.ok(tiles.riverbank_wall > 40, 'creek banks (' + (tiles.riverbank_wall || 0) + ' cells)');
  assert.ok(p.water.length >= 3 && p.water.length <= 6, 'creek rows: ' + p.water.length);
  assert.strictEqual(p.deckTile, null, 'Payon keeps the plank bridge');
  assert.ok((n.bamboo_grove || 0) >= 5, 'bamboo groves (' + (n.bamboo_grove || 0) + ')');
  const bamL = p.props.filter(x => x.type === 'bamboo_grove' && x.x < 0).length;
  const bamR = p.props.filter(x => x.type === 'bamboo_grove' && x.x > 0).length;
  assert.ok(bamL >= 2 && bamR >= 2, 'on both banks (' + bamL + '/' + bamR + ')');
  const bam = widest(p, 'bamboo_grove');
  assert.ok(bam > 1.2 && bam < 2.6, 'bamboo is about twice the hero (' + bam.toFixed(2) + 'x)');
  const big = Math.max(widest(p, 'tree_ancient_large'), widest(p, 'tree_ancient_variant'), widest(p, 'tree_tall_cluster'));
  assert.ok(big >= 3 && big <= 5, 'the big trees tower over the hero (' + big.toFixed(2) + 'x)');
  const sap = widest(p, 'tree_sapling');
  assert.ok(sap > .6 && sap < 1.8, 'a sapling is around player height (' + sap.toFixed(2) + 'x)');
  const bush = widest(p, 'tree_bush_bright');
  assert.ok(bush > .25 && bush < .8, 'a bush is knee height (' + bush.toFixed(2) + 'x)');
  assert.ok(n.rock_boulder_mossy >= 2, 'mossy boulders frame the crossing (' + n.rock_boulder_mossy + ')');
});

t('Comodo is a natural golden beach: dunes instead of brown patches, no rock blobs', () => {
  const p = plan(5), f = K.KIT_MAP[5].f;
  assert.strictEqual(p.base, 'sand_gold', 'Comodo\'s golden beach');
  assert.ok(!f.outcrops, 'the rocky outcrop blobs the owner called brown squares are gone');
  assert.ok(f.patch.cover <= .16, 'the dark sand reads as dune shading, not patchwork (' + f.patch.cover + ')');
  const dark = sampleField(p, 'sand_dark').frac;
  assert.ok(dark < .3, 'dark sand stays a minority of the field (' + Math.round(dark * 100) + '%)');
  assert.ok(tally(p).cactus_flower + tally(p).cactus_small >= 6, 'cacti on the sand');
  assert.ok(p.water.length > 8, 'and the sea');
});

t('Louyang\'s terraced paddies are ground paint, never in the lane, with wandering edges', () => {
  const p = plan(6);
  const pad = p.cells.filter(c => c.tile === 'paddy_water');
  assert.ok(pad.length > 40, 'terraced paddy water (' + pad.length + ' cells)');
  assert.strictEqual(p.water.length, 0, 'paddies are painted ground, not the animated water layer');
  pad.forEach(c => assert.ok(Math.abs(c.x) >= BX_ + .9, 'a paddy cell at x=' + c.x.toFixed(2) + ' is in the lane'));
  assert.ok(pad.some(c => c.x < 0) && pad.some(c => c.x > 0), 'paddies on both sides of the road');
  assert.ok(new Set(pad.map(c => Math.round(c.z))).size > 3, 'and across several depths');
  // the terrace edge wanders: the paddy spans a different x range at different depths
  const spans = [...new Set(pad.map(c => Math.round(c.z)))].map(z => {
    const row = pad.filter(c => Math.round(c.z) === z).map(c => c.x);
    return [Math.min(...row), Math.max(...row)];
  });
  const widths = new Set(spans.map(s => (s[1] - s[0]).toFixed(1)));
  assert.ok(widths.size > 1, 'every terrace is the same width - the jittered edges are gone');
  K.KIT_MAP[6].f.bands.forEach(b => p.props.forEach(x =>
    assert.ok(!(x.z >= b.z[0] && x.z < b.z[1] && x.x >= b.x0 && x.x < b.x1),
      x.type + ' at (' + x.x.toFixed(1) + ',' + x.z.toFixed(1) + ') stands in a paddy')));
  assert.ok(tally(p).bamboo_grove >= 6, 'Louyang is bamboo country (' + tally(p).bamboo_grove + ' groves)');
  assert.ok(tally(p).shrine_stone === 1 && tally(p).lantern_stone === 4, 'one stone shrine, lantern pairs');
  assert.ok(p.props.length <= 45, 'and open enough to grow the battle field (' + p.props.length + ' props)');
});

t('Amatsu lacquers its bridge red, lines the approach with lanterns - and is thinned out', () => {
  const p = plan(7), f = K.KIT_MAP[7].f;
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
  assert.ok(tally(p).tree_cherry >= 10, 'blossom trees (' + tally(p).tree_cherry + ')');
  assert.ok(p.props.length <= 45, 'thinned, as the owner asked (' + p.props.length + ' props)');
  assert.ok(!f.edge, 'and no rocky frame around the map');
  const torii = p.props.filter(x => x.type === 'torii_gate');
  assert.strictEqual(torii.length, 1, 'one torii gate');
  assert.ok(Math.abs(torii[0].x) >= BX_, 'at the lane edge');
  const arch = p.props.filter(x => x.type === 'bridge_red_arch');
  assert.strictEqual(arch.length, 1, 'one great red arch, far off-lane');
  assert.ok(Math.abs(arch[0].x) > 12, 'far scenery');
});

t('Niflheim is sparse: dead trees spaced wide, graves, no bright colour', () => {
  const p = plan(8), n = tally(p);
  assert.strictEqual(p.base, 'waste_nifl', 'Niflheim\'s purple-grey waste');
  assert.ok(n.tree_dead >= 8, 'dead trees (' + n.tree_dead + ')');
  assert.ok(p.props.length <= 45, 'but spaced out, not tight (' + p.props.length + ' props)');
  assert.ok(n.tombstone >= 4, 'graves (' + n.tombstone + ')');
  assert.ok(widest(p, 'tombstone') < 1.2, 'a tombstone is waist-to-chest height (' + widest(p, 'tombstone').toFixed(2) + 'x)');
  assert.ok(widest(p, 'tree_dead') > 2, 'a dead tree still towers (' + widest(p, 'tree_dead').toFixed(2) + 'x)');
  assert.ok(!p.props.some(x => /cherry|palm|cactus|tree_tall|tree_bush/.test(x.type)), 'and nothing bright or green grows there');
  assert.ok(p.props.filter(x => x.type === 'rock_cliff_crag').length <= 5, 'rocks are reduced');
});

t('Abyss keeps its dark lake and pale shore, with the field opened up', () => {
  const p = plan(9);
  assert.deepStrictEqual([...p.waterFrames], ['water_dark_0', 'water_dark_1'], 'the deep lake uses the dark pair');
  const shore = tilesOf(p);
  assert.ok(shore.limestone_pale > 20, 'a pale limestone shore around it (' + shore.limestone_pale + ' cells)');
  assert.ok(p.props.length <= 40, 'and it is the sparsest map, as the owner asked (' + p.props.length + ' props)');
  assert.ok(tally(p).stalagmite <= 20, 'stalagmites reduced (' + tally(p).stalagmite + ')');
  assert.ok(tally(p).crystal_cluster <= 6, 'crystals reduced (' + tally(p).crystal_cluster + ')');
  assert.ok(p.props.filter(x => Math.abs(x.x) > 30).length >= 5, 'with the far ring reaching into the fog');
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

t('no two maps wear the same signature', () => {
  const sigs = {};
  for (let m = 0; m < 10; m++) {
    const p = plan(m), tiles = tilesOf(p), n = tally(p);
    sigs[m] = p.base + '|' + Object.keys(tiles).sort().join(',') + '|' + Object.keys(n).sort().join(',');
  }
  for (const a of Object.keys(sigs)) for (const b of Object.keys(sigs))
    if (a < b) assert.notStrictEqual(sigs[a], sigs[b], 'maps ' + a + ' and ' + b + ' look identical');
});

t('the landmarks are where the brief puts them: one each, off-lane, RO-scaled', () => {
  const one = (m, ty) => { const p = plan(m), f = p.props.filter(x => x.type === ty);
    assert.strictEqual(f.length, 1, 'map ' + m + ' should carry exactly one ' + ty + ' (got ' + f.length + ')'); return f[0] };
  const tower = one(2, 'tower_geffen');
  assert.ok(Math.abs(tower.x) > 15 && tower.z < Z0 + 3, 'the tower is a far-corner landmark');
  assert.ok(sizeOf(tower) > 4, 'and towers over everything else (' + sizeOf(tower).toFixed(2) + 'x)');
  const ruin = one(8, 'house_ruin');
  assert.ok(Math.abs(ruin.x) > BX_ && ruin.z < Z0 + 6, 'Niflheim\'s ruined house stands off in the waste');
  const shrine = one(6, 'shrine_stone');
  assert.ok(Math.abs(shrine.x) > BX_, 'Louyang\'s shrine is off the lane');
  const house = plan(0).props.filter(x => x.type === 'house_prontera');
  assert.ok(house.length >= 4, 'Prontera carries a street of cottages (' + house.length + ')');
  house.forEach(h => assert.ok(sizeOf(h) > 1.2 && sizeOf(h) < 3.5, 'a cottage is house-sized (' + sizeOf(h).toFixed(2) + 'x)'));
});

// ---------------------------------------------------------------- the builders, for real
t('buildKit paints the ground, animates the water, lays the deck and places every prop', () => {
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
  sprites.forEach(s => assert.ok(s.scale.y > .6 && s.center.y > 0 && s.center.y < 1, 'sprite size/anchor'));
  const cut = KIT.tex.size;
  sb.__k.deco.children.length = 0; KIT.water.length = 0; K.buildKit(4);
  assert.strictEqual(KIT.tex.size, cut, 'rebuilding a map must not re-cut its crops (' + cut + ' cached)');
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
    sprites.forEach((s, i) => {
      const e = MAN.sprites[p.props[i].type];
      assert.ok(s.scale.y > .2 && s.scale.y < 20, 'map ' + m + ' sprite height sane (' + s.scale.y.toFixed(2) + ')');
      assert.ok(Math.abs(s.scale.x / s.scale.y - e.w / e.h) < .01, 'map ' + m + ': ' + p.props[i].type + ' keeps its crop aspect');
    });
    assert.ok(KIT.water.every(w => w.maps.length === 2), 'map ' + m + ' water carries both frames');
  }
  sb.__k.deco.children.length = 0;
  assert.strictEqual(K.buildKit(10), null, 'there is no map 10');
});

t('the loader asks for files that exist, and a dead atlas falls back instead of half-building', () => {
  const named = [...new Set([...code.matchAll(/'(?:assets\/kit\/)?(ro-[a-z0-9-]+\.(?:json|png))'/g)].map(m => m[1]))];
  for (const f of named) assert.ok(fs.existsSync(R + '/assets/kit/' + f), 'the loader names a missing asset: ' + f);
  for (const f of ['ro-spritesheet.json', 'ro-spritesheet.png', 'ro-map-payon.json', 'ro-map-morocc.json'])
    assert.ok(named.includes(f), 'the loader never asks for ' + f);
  assert.ok(!/MOROCC_KIT/.test(code), 'the kit layer no longer generates an atlas at runtime');
  assert.ok(!/<script[^>]*morocc-atlas/.test(src), 'and the retired generator is not loaded by the page any more');
  K.setAssets();
  const saved = KIT.srcMan.kit, png = KIT.png, man = KIT.man;
  KIT.srcMan = {}; KIT.png = null; KIT.man = null;
  assert.strictEqual(K.buildKit(4), null, 'no atlas -> no kit layer');
  for (let m = 0; m < 10; m++) assert.strictEqual(K.buildKit(m), null, 'map ' + m + ' falls back to the earlier scenery');
  KIT.srcMan.kit = saved; KIT.png = png; KIT.man = man;
  assert.ok(K.buildKit(4), 'and builds again once the sheet is back');
});

t('the Echo Court overlays its crypt floor onto a normal Niflheim kit plan', () => {
  const arenaFn = grab('function trialArena(){', 'function trialEnter(mode){');
  assert.ok(arenaFn.includes('kitPlan(8,1)') && arenaFn.includes('buildKit(8,plan)'), 'the court renders a Niflheim plan through the shared map-kit builder');
  assert.ok(arenaFn.includes("tile:r>.82?'rock_abyss':'ruin_cobble'"), 'the court floor uses a broad cobble circle with an abyss-stone rim');
  assert.ok(arenaFn.includes("type:'ruin_pillar'") && arenaFn.includes("type:'standing_stone'"), 'its edge props are actual kit sprites');
  assert.ok(arenaFn.includes('m.color.setHex(0x796e84)') && arenaFn.includes('KIT.ground.material.color.setHex(0x5c5269)'), 'both HD props and terrain get the darker violet/slate palette');
  assert.ok(!/RingGeometry|CylinderGeometry|BoxGeometry/.test(arenaFn), 'the court adds no mismatched block-built art');
  const loader = grab('function kitFetch(){', '// v2 is ONE atlas');
  assert.ok(loader.includes('if(TRIAL.on)trialArena();else buildDeco(S.mp)'), 'late HD tile downloads rebuild whichever scene is active');

  K.setAssets(); K.setStage(1);
  const original = JSON.stringify(K.kitPlan(8,1));
  const court = K.kitPlan(8,1);
  court.design = 'echo-court';
  for(let z=-11.2;z<=2.4;z+=.8)for(let x=-11.2;x<=11.2;x+=.8){
    const r=Math.hypot(x/9.6,(z+4.4)/6.2);
    if(r<=1.06)court.cells.push({x,z,tile:r>.82?'rock_abyss':'ruin_cobble'});
  }
  court.props.push(
    {x:-14.2,z:-9.5,type:'ruin_pillar',scale:1.1},
    {x:14.2,z:-9.5,type:'ruin_pillar',scale:1.1,flip:true},
    {x:-14.2,z:1.8,type:'ruin_pillar',scale:.95},
    {x:14.2,z:1.8,type:'ruin_pillar',scale:.95,flip:true},
    {x:-18,z:-20,type:'standing_stone',scale:1.1},
    {x:18,z:-20,type:'standing_stone',scale:1.1,flip:true}
  );
  const built=K.buildKit(8,court);
  assert.ok(built && KIT.ground.visible, 'the normal kit renderer paints the court terrain');
  assert.strictEqual(KIT.built.design, 'echo-court', 'the live builder receives the court plan rather than replacing it with the field plan');
  assert.strictEqual(KIT.built.map, 8, 'the scene remains themed to Niflheim');
  assert.strictEqual(KIT.built.placed, court.props.length, 'all Niflheim and court props become map-kit billboards');
  assert.ok(court.cells.every(c=>MAN.tiles[c.tile]), 'all court tiles have real atlas crops');
  assert.strictEqual(JSON.stringify(K.kitPlan(8,1)), original, 'adding the court does not mutate the reusable field recipe');
});

t('Echo details use existing art and leave the combat center clear',()=>{
  const details=vm.runInNewContext(grab('function trialCourtDetails(){','function trialArena(){')+';trialCourtDetails');
  const props=details();
  assert.ok(props.length>=12);
  assert.strictEqual(JSON.stringify(props),JSON.stringify(details()),'rebuilds keep the same small details');
  for(const p of props){assert.ok(MAN.sprites[p.type],p.type+' has real atlas art');assert.ok(Math.abs(p.x)>=4.5,'combat center stays open');assert.ok(p.scale<=.75,'details stay smaller than the main pillars')}
  assert.ok(grab('function trialArena(){','function trialEnter(mode){').includes('plan.props.push(...trialCourtDetails())'));
});

t('all ten maps have four complete themed scenes and no spawn or boss floor stamps', () => {
  K.setAssets();
  // v77: the Endless Echo arena is a scene of its own, so the key now carries the mode as well.
  assert.ok(/key=\(TRIAL\.on\?'trial:':'field:'\)\+S\.mp\+':'\+S\.lvl\+':'\+bn/.test(src),
    'stage changes (and entering the trial) must rebuild the scene');
  assert.ok(!/function stageDress/.test(src), 'old spawn pads/boss floor layer must be removed');
  for(let m=0;m<10;m++){
    const old=plan(m),original=JSON.stringify(old);
    for(const stage of [1,2,3])assert.strictEqual(JSON.stringify(K.kitPlan(m,stage)),original,
      'map '+m+' stage '+stage+' must keep the original design');
    const a=K.kitPlan(m,4),b=K.kitPlan(m,7),boss=K.kitPlan(m,10);
    for(const [p,stage] of [[a,4],[b,7],[boss,10]]){
      assert.ok(p.props.every(x=>Math.abs(x.x)>=BX_), 'scenery inside enlarged play lane');
      assert.ok(p.props.every(x=>MAN.sprites[x.type]), 'variant places nonexistent art');
      assert.ok(p.cells.every(x=>MAN.tiles[x.tile]), 'variant paints nonexistent art');
      assert.ok(p.props.length>=15, 'variant is only a token decoration');
      assert.ok(!K.stageSpec(m,stage).f.patch, 'no new floor patches');
      assert.ok(!K.stageSpec(m,stage).f.plaza && !K.stageSpec(m,stage).f.pool, 'no arena floor or circles');
      assert.ok(!p.cells.some(c=>Math.hypot(c.x,c.z-3)<2.5&&c.tile==='limestone_pale'&&m===0),
        'Prontera boss floor stamp came back');
    }
    const sig=p=>JSON.stringify({base:p.base,water:p.water.length,deck:p.deck,props:p.props.map(x=>[x.type,Math.round(x.x),Math.round(x.z)]),tiles:tilesOf(p)});
    assert.strictEqual(new Set([old,a,b,boss].map(sig)).size,4, 'map '+m+' stage bands share the same layout');
    for(const [stage,p] of [[5,a],[6,a],[8,b],[9,b]])
      assert.strictEqual(JSON.stringify(K.kitPlan(m,stage)),JSON.stringify(p),'stage band layout changed');
    assert.strictEqual(JSON.stringify(plan(m)),original,'variants mutated the original scene');
    K.setStage(10);const built=K.buildKit(m);
    assert.ok(built.design.endsWith('-3'),'boss scene did not build');
    assert.strictEqual(KIT.built.stage,10);
    K.setStage(1);assert.strictEqual(K.buildKit(m).design,old.design,'original stage did not restore');
  }
});

t('the enlarged arena keeps kit props out of its running lane', () => {
  assert.ok(/BX_=13,Z0=-28,Z1=12,MPS=15,AGGRO=6\.5/.test(src), 'the kit harness no longer matches the real arena');
  const p = plan(4);
  assert.strictEqual(BX_, 13); assert.strictEqual(Z0, -28); assert.strictEqual(Z1, 12);
  assert.strictEqual(K.KIT_ZC, (Z0 + Z1) / 2, 'the field is centred on the play band');
  assert.strictEqual(K.KIT_PK, 2.9 / 80, 'the prop scale is still measured off the kit\'s own 80px character');
  assert.ok(p.props.every(x => Math.abs(x.x) >= BX_), 'props outside the lane');
  assert.ok(p.props.some(x => x.z > Z0 && x.z < Z1), 'the forest runs the length of the band');
  // the lane rule is structural, not per-recipe: a prop the recipe puts in the lane is moved to
  // the edge and reported as nudged, never dropped
  const nudged = plan(3).props.filter(x => x.nudged);
  assert.ok(nudged.length > 0, 'the Morocc design still has props the lane rule moves');
  assert.strictEqual(plan(3).props.length >= MOR.sprites.length, true, 'and not one of them is dropped');
});

t('Ultra-HD 256x256 tile atlas (ro-tiles-hd) and kit3DDetails build across all ten maps', () => {
  const HD = JSON.parse(fs.readFileSync(R + '/assets/kit/ro-tiles-hd.json', 'utf8'));
  assert.strictEqual(HD.meta.size.w, 1536); assert.strictEqual(HD.meta.size.h, 1024);
  assert.strictEqual(Object.keys(HD.tiles).length, 25, 'all 25 terrain tiles exist in HD');
  for (const [n, r] of Object.entries(HD.tiles)) {
    assert.strictEqual(r.w, 256, n + ' HD width'); assert.strictEqual(r.h, 256, n + ' HD height');
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= HD.meta.size.w && r.y + r.h <= HD.meta.size.h, n + ' HD bounds');
  }
  assert.ok(/function kit3DDetails\(plan,m,root\)/.test(code), 'kit3DDetails is wired into the map kit');
  assert.ok(/kit3DDetails\(plan,m,deco\)/.test(code), 'buildKit invokes kit3DDetails');
  const bakCode = fs.readFileSync(R + '/Updates/map-textures-preview/map_kit_hd_option_b.js', 'utf8');
  assert.strictEqual(bakCode, code, 'verbatim map kit code backup matches index.html');
  assert.strictEqual(fs.readFileSync(R + '/Updates/map-sprites-v2/ro-tiles-hd.json', 'utf8'),
    fs.readFileSync(R + '/assets/kit/ro-tiles-hd.json', 'utf8'), 'HD tiles manifest backup matches live');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
