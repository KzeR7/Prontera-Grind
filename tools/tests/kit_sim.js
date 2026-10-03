// The attached map kit: atlases, the two fields, and the scale they are drawn at.
//   node tools/tests/kit_sim.js
//
// What this pins down:
//   * the atlas crops are real and inside the sheet, and the Morocc design's props all exist in
//     the atlas its own generator paints;
//   * **Payon is the RO Payon Forest layout** (a wide dirt road, a creek with a plank bridge, tree
//     lines that tower over the player, saplings and bushes under them, rocky mountain edges) -
//     the attached payon grid is no longer used for the field;
//   * **Morocc is still the attached desert design**, cell for cell;
//   * **props are sized off the kit's own character** (80px frame, the hero stands 2.9 units), so a
//     big tree is 3-4x the player and a bush is knee height - the exact complaint that started this;
//   * no prop ever stands in the running lane, and the creek stays out of the monster spawn band;
//   * the builders really run: ground texture, animated water, the bridge deck, one billboard per
//     prop, all against a stubbed canvas/THREE.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const R = __dirname + '/../..';
const src = fs.readFileSync(R + '/index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };

const BX_ = 5.5, Z0 = -14, Z1 = 3;      // the arena, as grab()ed into the harness below
const HERO = 2.9;                        // the hero billboard stands this tall on screen
const PAY = JSON.parse(fs.readFileSync(R + '/assets/kit/ro-map-payon.json', 'utf8'));
const MOR = JSON.parse(fs.readFileSync(R + '/assets/kit/ro-map-morocc.json', 'utf8'));
const MAN = JSON.parse(fs.readFileSync(R + '/assets/kit/ro-spritesheet.json', 'utf8'));
const MORS = fs.readFileSync(R + '/assets/kit/morocc-atlas.js', 'utf8');

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('kit: the two fields, the atlas crops, and the RO scale\n');

// ---------------------------------------------------------------- atlas + design sanity
t('the atlas carries 8 terrain tiles and 7 environment billboards, all crops inside the sheet', () => {
  assert.deepStrictEqual(Object.keys(MAN.tiles).sort(),
    ['bridge_planks', 'cliff_rock', 'dirt_path', 'grass_forest', 'grass_olive', 'riverbank_wall', 'water_frame_0', 'water_frame_1']);
  assert.strictEqual(Object.keys(MAN.sprites).length, 7);
  for (const [n, r] of Object.entries({ ...MAN.tiles, ...MAN.sprites }))
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= MAN.meta.size.w && r.y + r.h <= MAN.meta.size.h, n + ' crop runs off the atlas');
  assert.deepStrictEqual(MAN.character.ro_adventurer, { x: 980, y: 412, frameW: 64, frameH: 80, frames: 4 },
    'the prop scale is derived from this frame - if it changes, KIT_PK must be re-derived');
});

t('Morocc\'s generated atlas still carries the tile names and sprite sizes the game assumes', () => {
  const tileNames = [...MORS.matchAll(/makeTile\([^,]+,[^,]+,\s*'([a-z_]+)'/g)].map(m => m[1]);
  for (const name of ['sand', 'sand_dark', 'ruin_cobble', 'cliff']) assert.ok(tileNames.includes(name), 'tile ' + name);
  // the prop heights the scale table was tuned against (source pin: the generator's own boxes)
  const boxes = {};
  {
    const marks = [...MORS.matchAll(/manifest\.sprites\.([a-z_]+)\s*=\s*\{[^}]*w:\s*sw,\s*h:\s*sh/g)];
    marks.forEach((m, i) => {
      const seg = MORS.slice(i ? marks[i - 1].index : 0, m.index);
      const b = [...seg.matchAll(/const sx = (\d+), sy = (\d+), sw = (\d+), sh = (\d+);/g)].pop();
      if (b) boxes[m[1]] = [Number(b[3]), Number(b[4])];
    });
  }
  for (const [ty, [w, h]] of Object.entries({ palm_giant: [380, 450], palm_tall: [210, 300], palm_double: [230, 300], cactus_small: [80, 105], ruin_pillar: [120, 175] }))
    assert.deepStrictEqual(boxes[ty], [w, h], ty + ' box changed: ' + JSON.stringify(boxes[ty]));
  for (const ty of [...new Set(MOR.sprites.map(s => s.type))]) assert.ok(boxes[ty], 'the generator must still define ' + ty);
});

t('the attached payon design is kept in the repo but is no longer the field layout', () => {
  assert.strictEqual(PAY.meta.name, 'pay_fild04_river_crossing', 'the owner\'s design file stays as shipped');
  assert.ok(PAY.cells.length === 32 && PAY.sprites.length === 30, 'and stays intact');
});

// ---------------------------------------------------------------- the kit layer, in a VM
const code = grab('// ----- The attached map kit', '// ----- Ragnarok-style 8-dir sprites');
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
// stand in for the attachment's desert atlas generator (it needs a real canvas, which node has not):
// the manifest shape is the generator's - per-tile canvases and rects on one atlas canvas.
const MORBOX={palm_giant:[380,450],palm_tall:[210,300],palm_double:[230,300],cactus_flower:[110,160],
  cactus_small:[80,105],ruin_pillar:[120,175],ruin_column_fallen:[190,85],ruin_stump:[85,90],ruin_curb:[180,55],desert_bone:[110,65]};
const morMan={tiles:{},sprites:{}};
for(const[n,[w,h]]of Object.entries(MORBOX)){
  morMan.tiles[n]={w:128,h:128,canvas:{}};
  morMan.sprites[n]={x:0,y:0,w,h,anchorX:w/2,anchorY:h-10};
}
for(const n of['sand','sand_dark','ruin_cobble','cliff'])morMan.tiles[n]={w:128,h:128,canvas:{}};
const window={MOROCC_KIT:{atlas:()=>({canvas:{},manifest:morMan})}};
const BX_=5.5,Z0=-14,Z1=3;
${code}
this.__k={KIT,KIT_S,KIT_ZC,KIT_PK,KIT_PS,KIT_MAP,kitPlan,kitPropScale,kitTick,buildKit,PAY,deco,MORBOX,
  setAssets:()=>{KIT.png={};KIT.man=MANJ;KIT.des={payon:__PAYJ__,morocc:MORJ};KIT.ok=1}};
`;
const sb = { console, Promise, Image: function () { this.onload = null; this.onerror = null; }, fetch: () => ({ then: () => ({ catch: () => ({}) }) }) };
vm.createContext(sb);
vm.runInContext(harness.replace('__MAN__', JSON.stringify(MAN)).replace('__MOR__', JSON.stringify(MOR))
  .replace('__PAYJ__', JSON.stringify(PAY)), sb);
const K = sb.__k, KIT = K.KIT;
const plan = m => K.kitPlan(m);
const hero = h => h / HERO;   // world units -> multiples of the hero's height

t('nothing is built before the atlas is loaded, and map 0/7 never have a field', () => {
  assert.strictEqual(KIT.ok, 0);
  assert.strictEqual(K.buildKit(4), null, 'no atlas yet -> nothing is drawn');
  assert.strictEqual(plan(0), null, 'the town has no kit field');
  assert.strictEqual(plan(7), null, 'Comodo has no kit field in this build');
  assert.strictEqual(plan(3), null, 'Morocc needs its design json, which the loader fetches');
  // Payon's layout is pure code, so it can be computed before any art arrives - it just cannot
  // be drawn until buildKit clears the atlas check above
  assert.ok(plan(4), 'the payon layout itself needs no atlas');
});

// ---------------------------------------------------------------- Payon: the RO recipe
t('Payon is a dirt road cut through a forest, not a lake', () => {
  K.setAssets();
  const p = plan(4);
  assert.strictEqual(p.design, 'payon');
  const tiles = {}; for (const c of p.cells) tiles[c.tile] = (tiles[c.tile] || 0) + 1;
  assert.ok(tiles.dirt_path > 80, 'a real dirt road (' + (tiles.dirt_path || 0) + ' cells)');
  assert.ok(tiles.grass_olive > 60, 'grass variation under the trees (' + (tiles.grass_olive || 0) + ' cells)');
  assert.ok(tiles.riverbank_wall > 100, 'creek banks (' + (tiles.riverbank_wall || 0) + ' cells)');
  assert.ok(tiles.cliff_rock > 400, 'rocky mountain edges (' + (tiles.cliff_rock || 0) + ' cells)');
  assert.ok(!p.cells.some(c => c.tile === 'water_frame_0'), 'water is the animated layer, not ground paint');
  // the road really is down the middle of the lane and wide enough to run up
  const road = p.cells.filter(c => c.tile === 'dirt_path' && Math.abs(c.x) < 1.6);
  assert.ok(road.length > 60, 'road cells inside the lane centre: ' + road.length);
  // and the creek crosses the whole field in both directions
  assert.ok(p.water.length >= 3 && p.water.length <= 6, 'creek rows: ' + p.water.length);
  const wet = p.water[0];
  assert.ok(wet.w > 40, 'the creek runs across the whole field (' + wet.w + ' units)');
  assert.ok(p.water.every(r => r.cx > 40 && r.cy === 1), 'each creek row tiles its length');
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

t('Payon\'s props are RO-sized: trees tower over the player, bushes are knee height', () => {
  const p = plan(4);
  const size = x => { const e = MAN.sprites[x.type]; return e ? hero(e.h * K.kitPropScale(x.type, x.scale)) : 0 };
  const widest = {};
  p.props.forEach(x => { widest[x.type] = Math.max(widest[x.type] || 0, size(x)) });
  const big = Math.max(widest.tree_ancient_large || 0, widest.tree_ancient_variant || 0, widest.tree_tall_cluster || 0);
  assert.ok(big >= 3, 'the big trees must be at least 3x the hero (got ' + big.toFixed(2) + 'x)');
  assert.ok(big <= 5, 'and not absurd (got ' + big.toFixed(2) + 'x)');
  const bush = widest.tree_bush_bright || 0;
  assert.ok(bush > .25 && bush < .8, 'a bush is knee height (got ' + bush.toFixed(2) + 'x)');
  const sap = widest.tree_sapling || 0;
  assert.ok(sap > .6 && sap < 1.8, 'a sapling is around player height (got ' + sap.toFixed(2) + 'x)');
  const crag = widest.rock_cliff_crag || 0;
  assert.ok(crag > 1.5 && crag < 4, 'a crag is boulder-sized (got ' + crag.toFixed(2) + 'x)');
  console.log('       trees ' + big.toFixed(1) + 'x hero, saplings ' + sap.toFixed(2) + 'x, bushes ' + bush.toFixed(2) + 'x, crags ' + crag.toFixed(1) + 'x');
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
  const posts = p.props.filter(x => x.type === 'river_stone_post');
  assert.strictEqual(posts.length, 2, 'two stone posts mark the crossing');
});

// ---------------------------------------------------------------- Morocc: the attached design
t('Morocc is still the attached desert design, cell for cell', () => {
  const p = plan(3);
  assert.strictEqual(p.design, 'morocc');
  assert.strictEqual(p.src, 'morocc', 'Morocc crops from its own generated atlas');
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
});

t('Morocc\'s palms and ruins are RO-sized too', () => {
  const p = plan(3);
  const H = { palm_giant: [380, 450], palm_tall: [210, 300], palm_double: [230, 300], cactus_small: [80, 105], cactus_flower: [110, 160], ruin_pillar: [120, 175], ruin_stump: [85, 90], ruin_curb: [180, 55], desert_bone: [110, 65], ruin_column_fallen: [190, 85] };
  const widest = {};
  p.props.forEach(x => { const b = H[x.type]; if (b) widest[x.type] = Math.max(widest[x.type] || 0, hero(b[1] * K.kitPropScale(x.type, x.scale))) });
  assert.ok(widest.palm_tall >= 2.2, 'palms tower (got ' + widest.palm_tall.toFixed(2) + 'x)');
  assert.ok(widest.palm_tall <= 4.5, 'and are not skyscrapers (got ' + widest.palm_tall.toFixed(2) + 'x)');
  assert.ok(widest.cactus_small < 1.6, 'a small cactus is waist height (got ' + widest.cactus_small.toFixed(2) + 'x)');
  assert.ok(widest.ruin_pillar > 1 && widest.ruin_pillar < 3, 'a ruin pillar is player-plus (got ' + widest.ruin_pillar.toFixed(2) + 'x)');
  console.log('       palms ' + widest.palm_tall.toFixed(1) + 'x hero, cacti ' + widest.cactus_small.toFixed(2) + 'x, pillars ' + widest.ruin_pillar.toFixed(2) + 'x');
});

t('every prop type either map places is covered by the size table', () => {
  const missing = [];
  for (const m of [3, 4]) for (const x of plan(m).props) if (K.KIT_PS[x.type] === undefined) missing.push(x.type);
  assert.deepStrictEqual([...new Set(missing)], [], 'props with no scale factor (they would default to 1.0): ' + [...new Set(missing)].join(','));
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
  const first = KIT.water[0].m.material.map;
  K.kitTick(.2); assert.strictEqual(KIT.water[0].m.material.map, first, 'water waits for its clock');
  K.kitTick(.6); assert.notStrictEqual(KIT.water[0].m.material.map, first, 'the second frame comes in on the tick');
});

t('Morocc builds from its design, and a map with no field builds nothing', () => {
  K.setAssets();
  sb.__k.deco.children.length = 0;
  assert.ok(K.buildKit(3), 'morocc builds');
  assert.strictEqual(KIT.built.placed, MOR.sprites.length, 'all 34 design props placed');
  sb.__k.deco.children.length = 0;
  assert.strictEqual(K.buildKit(7), null, 'Comodo has no design in this build');
  assert.strictEqual(sb.__k.deco.children.length, 0, 'nothing is added for a map with no field');
});

t('the loader asks for files that exist, and a dead atlas falls back instead of half-building', () => {
  const named = [...new Set([...code.matchAll(/'(?:assets\/kit\/)?(ro-[a-z0-9-]+\.(?:json|png))'/g)].map(m => m[1]))];
  for (const f of named) assert.ok(fs.existsSync(R + '/assets/kit/' + f), 'the loader names a missing asset: ' + f);
  for (const f of ['ro-spritesheet.json', 'ro-spritesheet.png', 'ro-map-payon.json', 'ro-map-morocc.json'])
    assert.ok(named.includes(f), 'the loader never asks for ' + f);
  K.setAssets();
  const saved = KIT.srcMan.payon;
  delete KIT.srcMan.payon; KIT.png = null; KIT.man = null;
  assert.strictEqual(K.buildKit(4), null, 'no atlas -> no kit layer');
  KIT.srcMan.payon = saved; KIT.png = {}; KIT.man = MAN;
});

t('with the kit ready, the arena bounds are still what they were', () => {
  const p = plan(4);
  assert.strictEqual(BX_, 5.5); assert.strictEqual(Z0, -14); assert.strictEqual(Z1, 3);
  assert.strictEqual(K.KIT_ZC, (Z0 + Z1) / 2, 'the field is centred on the play band');
  assert.ok(p.props.every(x => Math.abs(x.x) >= BX_), 'props outside the lane');
  assert.ok(p.props.some(x => x.z > Z0 && x.z < Z1), 'the forest runs the length of the band');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
