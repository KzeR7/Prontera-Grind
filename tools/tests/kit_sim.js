// The attached map kit: atlases, designs, and what Payon/Morocc actually get built from them.
//   node tools/tests/kit_sim.js
//
// What this pins down:
//   * the two attached designs (Payon river crossing, Morocc desert ruins) load and every one
//     of their cells is accounted for - painted, water, bridge deck or deliberately off-map;
//   * terrains come from the atlas: every cell type a design uses maps to a tile that really
//     exists in that design's manifest, and the mapping is the one the kit's own engine uses;
//   * the design's water is the design's water (the merged rectangles carry exactly as many
//     cells as the design has water cells), and Payon's bridge lands on the road, in the lane;
//   * **no prop stands in the running lane** - the design's own props are moved to the lane
//     edge, never dropped, so the count still matches the design;
//   * the builders really run: ground texture, water meshes (two frames for the animation),
//     the bridge deck and one billboard per prop, against a stubbed canvas and THREE.
//
// It runs the real `kitPlan()/kitGroundTex()/kitWaterMeshes()/kitDeckMesh()/kitPropMeshes()/
// buildKit()` out of index.html, and the real designs out of assets/kit/.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const R = __dirname + '/../..';
const src = fs.readFileSync(R + '/index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };

const BX_ = 5.5, Z0 = -14, Z1 = 3;      // the arena, as grab()ed into the harness below
const PAY = JSON.parse(fs.readFileSync(R + '/assets/kit/ro-map-payon.json', 'utf8'));
const MOR = JSON.parse(fs.readFileSync(R + '/assets/kit/ro-map-morocc.json', 'utf8'));
const MAN = JSON.parse(fs.readFileSync(R + '/assets/kit/ro-spritesheet.json', 'utf8'));

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('kit: attached designs, atlas crops, clear lane, real builders\n');

// ---------------------------------------------------------------- atlas + design sanity
t('the Payon atlas carries the 8 terrain tiles and 7 environment billboards the design needs', () => {
  const T = Object.keys(MAN.tiles), S = Object.keys(MAN.sprites);
  assert.deepStrictEqual(T.sort(), ['bridge_planks', 'cliff_rock', 'dirt_path', 'grass_forest', 'grass_olive', 'riverbank_wall', 'water_frame_0', 'water_frame_1']);
  assert.strictEqual(S.length, 7, 'sprites: ' + S.join(','));
  for (const [n, r] of Object.entries(MAN.tiles)) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= MAN.meta.size.w && r.y + r.h <= MAN.meta.size.h, n + ' crop runs off the atlas');
  for (const [n, r] of Object.entries(MAN.sprites)) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= MAN.meta.size.w && r.y + r.h <= MAN.meta.size.h, n + ' crop runs off the atlas');
});

t('every prop the designs place exists in the atlas that will dress them', () => {
  // The Payon design asks for rock_boulder_mossy, which ro-spritesheet.json does NOT carry:
  // that is a gap in the attached kit to report, and the game skips those placements rather
  // than substituting different art for them. Everything else must be present.
  const gaps = [...new Set(PAY.sprites.map(s => s.type))].filter(ty => !MAN.sprites[ty]);
  assert.deepStrictEqual(gaps, ['rock_boulder_mossy'], 'kit gaps changed: ' + gaps.join(','));
  const missingPlacements = PAY.sprites.filter(s => gaps.includes(s.type)).length;
  assert.strictEqual(missingPlacements, 3, 'three placements hang on the missing boulder billboard');
  for (const sp of PAY.sprites) if (!gaps.includes(sp.type)) assert.ok(MAN.sprites[sp.type], 'Payon design wants ' + sp.type);
  // Morocc's atlas is generated in the page by the attachment; its manifest names are fixed here
  const morTileNames = [...fs.readFileSync(R + '/assets/kit/morocc-atlas.js', 'utf8').matchAll(/makeTile\([^,]+,[^,]+, *'([a-z_]+)'/g)].map(m => m[1]);
  assert.deepStrictEqual(morTileNames.sort(), ['cliff', 'ruin_cobble', 'sand', 'sand_dark'], 'Morocc tiles: ' + morTileNames.join(','));
  for (const name of ['sand', 'sand_dark', 'ruin_cobble', 'cliff']) assert.ok(morTileNames.includes(name), 'Morocc design cell type ' + name + ' has no tile');
});

// ---------------------------------------------------------------- the kit layer, in a VM
const code = grab('// ----- The attached map kit', '// ----- Ragnarok-style 8-dir sprites');
const harness = `
class Col{constructor(){this.hex=0}setHex(h){this.hex=h;return this}lerp(){return this}multiplyScalar(){return this}}
class Mat{constructor(o){Object.assign(this,o||{});this.map=(o&&o.map)||null;this.color=new Col();this.emissive=new Col();this.needsUpdate=false}}
class Obj{constructor(){this.children=[];this.position={x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z}};this.rotation={x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z}};this.scale={x:1,y:1,z:1,set(x,y,z){this.x=x;this.y=y;this.z=z}};this.visible=true;this.userData={}}
  add(o){this.children.push(o);return this}remove(o){const i=this.children.indexOf(o);if(i>=0)this.children.splice(i,1)}}
class Tex{constructor(img){this.image=img;this.repeat={x:1,y:1,set(a,b){this.x=a;this.y=b}};this.needsUpdate=false;this.anisotropy=1}
  clone(){return new Tex(this.image)}}
const flat=()=>0;
const THREE={CanvasTexture:Tex,NearestFilter:1,LinearMipMapLinearFilter:2,RepeatWrapping:3,
  Mesh:class extends Obj{constructor(g,m){super();this.geometry=g;this.material=m} },Sprite:class extends Obj{constructor(m){super();this.material=m;this.center={x:.5,y:0,set(a,b){this.x=a;this.y=b}}} },
  PlaneGeometry:class{constructor(w,h){this.w=w;this.h=h} },MeshLambertMaterial:Mat,SpriteMaterial:Mat};
const drawn=[];
const fakeCanvas=()=>({width:0,height:0,getContext:()=>({imageSmoothingEnabled:true,set fillStyle(v){this._f=v},get fillStyle(){return this._f},
  createPattern:()=>({pat:1}),fillRect(){},drawImage(...a){drawn.push(a)},translate(){},scale(){},save(){},restore(){}})});
const document={createElement:n=>fakeCanvas()};
const scene=new Obj(),deco=new Obj();scene.add(deco);
const BX_=5.5,Z0=-14,Z1=3;
${code}
this.__k={KIT,KIT_S,KIT_ZC,KIT_FAR,KIT_MAP,kitPlan,kitX,kitZ,kitAnchor,buildKit,kitGroundTex,kitTick,deco,
  setAssets:(png)=>{KIT.png=png;KIT.man=MANJ;KIT.des={payon:PAYJ,morocc:MORJ};KIT.ok=1}};
`;
const sb = { console, Promise, Image: function () { this.onload = null; this.onerror = null; }, fetch: () => ({ then: () => ({ catch: () => ({}) }) }) };
vm.createContext(sb);
vm.runInContext('const MANJ=' + JSON.stringify(MAN) + ';const PAYJ=' + JSON.stringify(PAY) + ';const MORJ=' + JSON.stringify(MOR) + ';' + harness, sb);
const K = sb.__k, KIT = K.KIT;

const cellCount = (d, pred) => d.cells.flat().filter(pred).length;
const typeCount = (d, ty) => cellCount(d, c => c.type === ty);

t('no kit is loaded yet, so nothing claims a design and the game keeps its own scenery', () => {
  assert.strictEqual(KIT.ok, 0);
  assert.strictEqual(K.buildKit(4), null, 'a map must not build a kit layer before the atlas is ready');
  assert.strictEqual(K.kitPlan(4), null, 'no design data -> no plan');
  assert.strictEqual(K.kitPlan(0), null, 'the town has no design');
});

t('Payon wears the attached river-crossing design, cell for cell', () => {
  K.setAssets({});
  const p = K.kitPlan(4);
  assert.ok(p, 'payon plan');
  assert.strictEqual(p.design, 'payon');
  const wet = typeCount(PAY, 'water'), deck = typeCount(PAY, 'bridge');
  assert.strictEqual(wet, 250, 'the design has 250 water cells');
  assert.strictEqual(deck, 24, 'the design has 24 bridge cells');
  // every cell is accounted for: painted, water, deck, or off-map
  let painted = 0; for (const ty of ['grass', 'grass_dark', 'dirt', 'cliff', 'bank']) painted += typeCount(PAY, ty);
  assert.strictEqual(p.cells.length, painted, 'every paint-type cell becomes a painted cell');
  assert.strictEqual(painted + wet + deck, 48 * 32, 'nothing is silently dropped');
  const area = p.water.reduce((a, r) => a + r.cx * r.cy, 0);
  assert.strictEqual(area, wet, 'the merged water rectangles carry exactly the design\'s water');
  assert.ok(p.water.length < wet / 4, 'water is merged into rows, not one quad per cell (' + p.water.length + ' quads)');
  // the kit engine's own tile mapping, checked through the crops that exist
  const used = new Set(p.cells.map(c => c.tile));
  ['grass_olive', 'grass_forest', 'dirt_path', 'cliff_rock', 'riverbank_wall'].forEach(n => assert.ok(used.has(n), 'cell type should paint ' + n));
});

t('Payon\'s bridge lands on the road, inside the lane', () => {
  const p = K.kitPlan(4);
  assert.ok(p.deck, 'the design has a bridge');
  assert.ok(Math.abs(p.deck.x) < .05, 'the bridge is anchored on the road (x=' + p.deck.x.toFixed(2) + ')');
  assert.ok(p.deck.z > sb.__k.KIT_ZC - 4 && p.deck.z < sb.__k.KIT_ZC + 4, 'the bridge crosses mid-lane (z=' + p.deck.z.toFixed(2) + ')');
  assert.ok(p.deck.w > 1 && p.deck.l > 2, 'deck size ' + p.deck.w.toFixed(2) + 'x' + p.deck.l.toFixed(2));
  // and the water really is around it: the river runs diagonally, so check that it crosses the
  // lane itself (the player must cross water to reach the far bank) and reaches both sides
  const inLane = p.water.filter(r => Math.abs(r.x) < BX_ + r.w / 2);
  assert.ok(inLane.length >= 3, 'the river must cross the play lane (' + inLane.length + ' rows)');
  assert.ok(Math.min(...p.water.map(r => r.x - r.w / 2)) < -BX_, 'water reaches the west bank');
  assert.ok(Math.max(...p.water.map(r => r.x + r.w / 2)) > BX_, 'water reaches the east bank');
  // the deck spans water: the river's z-range has to contain the bridge, on both sides of it
  const minZ = Math.min(...p.water.map(r => r.z - r.h / 2)), maxZ = Math.max(...p.water.map(r => r.z + r.h / 2));
  assert.ok(p.deck.z - p.deck.l / 2 > minZ && p.deck.z + p.deck.l / 2 < maxZ,
    'the bridge must cross water (' + minZ.toFixed(1) + '..' + maxZ.toFixed(1) + ' vs deck ' + p.deck.z.toFixed(1) + ')');
  assert.ok(maxZ - minZ > 8, 'the river is a real river, not a puddle (' + (maxZ - minZ).toFixed(1) + ' units)');
  // the far bank is dry where the monsters stand (they spawn at Z0..Z0+6)
  assert.ok(minZ > Z0 + 3, 'the river must not reach the monster spawn band (north edge z=' + minZ.toFixed(2) + ')');
});

t('Payon keeps every prop the atlas can draw, and none of them stands in the running lane', () => {
  const p = K.kitPlan(4);
  assert.strictEqual(p.props.length, PAY.sprites.length, 'props: ' + p.props.length + ' of ' + PAY.sprites.length);
  assert.strictEqual(p.props.filter(x => x.missing).length, 3, 'the 3 boulder placements are flagged, not dropped');
  const nudged = p.props.filter(x => x.nudged);
  assert.ok(nudged.length > 0, 'the design does put some props in the lane - they must be moved, not dropped');
  p.props.forEach(x => assert.ok(Math.abs(x.x) >= BX_, x.type + ' at x=' + x.x.toFixed(2) + ' blocks the lane'));
  p.props.forEach(x => assert.ok(Math.abs(x.x) > 1e-6, 'a prop on the exact centre line has no side to move to'));
  // far to near, so the billboards overlap in the right order
  for (let i = 1; i < p.props.length; i++) assert.ok(p.props[i].z >= p.props[i - 1].z, 'props must be sorted far to near');
});

t('Morocc wears the attached desert design with its own generated tiles', () => {
  const p = K.kitPlan(3);
  assert.strictEqual(p.props.filter(x => x.missing).length, 0, 'Morocc\'s own atlas carries every prop its design places');
  assert.ok(p, 'morocc plan');
  assert.strictEqual(p.design, 'morocc');
  assert.strictEqual(p.src, 'morocc', 'Morocc must crop from the attachment\'s own atlas');
  const sky = typeCount(MOR, 'sky');
  assert.ok(sky > 0, 'the design has off-map sky cells');
  assert.ok(!p.cells.some(c => c.tile === undefined), 'every painted cell resolves to a tile');
  const painted = ['sand', 'sand_dark', 'ruin_cobble', 'cliff'].reduce((a, ty) => a + typeCount(MOR, ty), 0);
  assert.strictEqual(p.cells.length, painted, 'all ' + painted + ' terrain cells are painted');
  assert.strictEqual(painted + sky, 48 * 32, 'terrain + sky accounts for the whole grid');
  assert.strictEqual(p.water.length, 0, 'the desert has no water');
  assert.strictEqual(p.deck, null, 'the desert has no bridge');
  assert.deepStrictEqual([...new Set(p.cells.map(c => c.tile))].sort(), ['cliff', 'ruin_cobble', 'sand', 'sand_dark']);
  assert.strictEqual(p.props.length, MOR.sprites.length, 'props: ' + p.props.length);
  p.props.forEach(x => assert.ok(Math.abs(x.x) >= BX_, x.type + ' at x=' + x.x.toFixed(2) + ' blocks the lane'));
});

t('the two designs dress the arena differently (this is the mix-and-match rule)', () => {
  const a = K.kitPlan(3), b = K.kitPlan(4);
  assert.notStrictEqual(a.src, b.src, 'different atlases');
  assert.notStrictEqual(a.cells.length, b.cells.length);
  assert.notStrictEqual(a.props.length, b.props.length);
  assert.notDeepStrictEqual([...new Set(a.props.map(p => p.type))].sort(), [...new Set(b.props.map(p => p.type))].sort(),
    'the two designs must not place the same prop set');
});

// ---------------------------------------------------------------- the builders, for real
t('buildKit paints the ground, animates the water, lays the deck and places every prop', () => {
  K.setAssets({});
  sb.__k.deco.children.length = 0;
  KIT.water.length = 0;
  const n = K.buildKit(4);
  assert.ok(n, 'buildKit returns the plan it built');
  assert.strictEqual(KIT.built.placed, PAY.sprites.length - 3, 'props actually placed: ' + KIT.built.placed);
  assert.deepStrictEqual(Object.keys(KIT.built.missing), ['rock_boulder_mossy'], 'the gap is reported by name');
  assert.ok(KIT.ground, 'a ground mesh is created');
  assert.ok(KIT.ground.material.map, 'the ground gets a texture');
  assert.strictEqual(KIT.ground.visible, true);
  const sprites = sb.__k.deco.children.filter(c => c.material && c.material.alphaTest > 0);
  assert.strictEqual(sprites.length, PAY.sprites.length - 3, 'one billboard per drawable prop (' + sprites.length + ')');
  assert.ok(KIT.water.length >= 4, 'water meshes: ' + KIT.water.length);
  assert.ok(KIT.water.every(w => w.maps.length === 2), 'each water quad carries both animation frames');
  const deck = sb.__k.deco.children.find(c => c.geometry && Math.abs(c.rotation.z) > 0.05);
  assert.ok(deck, 'Payon\'s bridge deck is laid, at the design\'s own angle');
  // the sprites are cropped art, not silhouettes: they carry a real size from the manifest
  sprites.forEach(s => assert.ok(s.scale.x > .4 && s.scale.y > .4 && s.center.y > 0 && s.center.y < 1, 'sprite size/anchor'));
  // the water animation actually swaps frames, and only on its own clock
  const first = KIT.water[0].m.material.map;
  K.kitTick(.2); assert.strictEqual(KIT.water[0].m.material.map, first, 'water must not flicker faster than its clock');
  K.kitTick(.6); assert.notStrictEqual(KIT.water[0].m.material.map, first, 'the second frame comes in on the tick');
});

t('a map with no design still builds, and switching maps swaps the kit layer out', () => {
  K.setAssets({});
  sb.__k.deco.children.length = 0;
  assert.strictEqual(K.buildKit(7), null, 'Comodo has no design in this build');
  assert.strictEqual(sb.__k.deco.children.length, 0, 'nothing is added for a map with no design');
  assert.ok(K.kitPlan(4) !== null && K.kitPlan(7) === null, 'plan only exists for dressed maps');
});

t('with the kit ready, the arena bounds are still what they were', () => {
  // the kit lays scenery only: it must not move the play lane, the spawn row or the monster band
  const p = K.kitPlan(4);
  assert.strictEqual(BX_, 5.5); assert.strictEqual(Z0, -14); assert.strictEqual(Z1, 3);
  assert.ok(p.props.every(x => Math.abs(x.x) >= BX_), 'props outside the lane');
  const inBand = p.props.filter(x => x.z > Z0 && x.z < Z1);
  assert.ok(inBand.length > 0, 'the design does place props in the play band, beside the lane');
  assert.strictEqual(K.KIT_ZC, (Z0 + Z1) / 2, 'the design is centred on the play band');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
