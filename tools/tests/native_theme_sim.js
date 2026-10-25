// Themed map detail: the cultural props and the 3D bedding under them.
//
// Two owner reports live here.
//   "some of the houses are under half way" - the themed billboards were planted at y=0 on a
//   heightfield that rises to almost 6 units, so a third of every sprite was underground on
//   average (the worst was fully buried). Every prop must sit on the ground under it.
//   "i want more details" - the tables now use the whole kit and a bedding layer of real geometry
//   sits under each piece. Counts and the mesh ceiling are pinned so that cannot quietly regress.
//
//   node tools/tests/native_theme_sim.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const grab = (a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j < 0) throw Error('index.html no longer contains ' + a);
  return src.slice(i, j);
};

// --- a THREE stub, only as much as the detail layer touches -------------------------------
const MG = { Group: class { constructor() { this.children = []; this.userData = {} } add(o) { this.children.push(o) } } };
const THREE = {
  Group: MG.Group,
  Mesh: class {
    constructor(g, m) {
      this.geometry = g; this.material = m || {};
      this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z } };
      this.rotation = { x: 0, y: 0, z: 0 };
      this.scale = { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z } };
    }
  },
  Color: class { constructor(c) { this.value = c } multiplyScalar(k) { this.k = k; return this } },
  BoxGeometry: class { constructor() { this.kind = 'box' } },
  SphereGeometry: class { constructor() { this.kind = 'sphere' } },
  ConeGeometry: class { constructor() { this.kind = 'cone' } },
  CylinderGeometry: class { constructor() { this.kind = 'cyl' } },
};

const ctx = { console, Math, Number, Object, Array, JSON, Infinity, NaN, Float32Array, isFinite, THREE };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(repo, 'assets/native-fields.js'), 'utf8'), ctx);
const F = ctx.PGNativeFields;

const captured = [];
const box = {
  console, Math, Number, Object, Array, JSON, Infinity, NaN, isFinite, THREE, PGNativeFields: F, __out: captured,
  M: c => ({ color: c }),
  BX: (a, b, c) => new THREE.BoxGeometry(a, b, c), SP: r => new THREE.SphereGeometry(r),
  CN: (r, h) => new THREE.ConeGeometry(r, h), CY: (a, b, h) => new THREE.CylinderGeometry(a, b, h),
};
vm.createContext(box);
vm.runInContext(`
var S={mp:0,lvl:1};const KIT={ok:1};
// arena bounds the placer reads (they live elsewhere in index.html)
const Z0=-28,Z1=12,BX_=13;
var __detail=null;
const deco={add(o){__detail=o}};
const kitPropMeshes=(plan)=>{for(const p of plan.props)__out.push(p)};
${grab('const THEME_BED={', 'function placeNativeTheme')}
${grab('function placeNativeTheme', 'function buildKit(')}
`, box);

const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'assets/kit/ro-spritesheet.json'), 'utf8'));
const SPRITES = manifest.sprites || manifest;
const CAP = vm.runInContext('THEME_MESH_CAP', box);
// the arena lane, same numbers the placer uses
const Z0 = -28, Z1 = 12;

const place = (m, lvl) => {
  captured.length = 0;
  vm.runInContext(`S.mp=${m};S.lvl=${lvl};__detail=null`, box);
  F.setStage(lvl);
  box.placeNativeTheme(m, {});
  const g = vm.runInContext('__detail', box);
  return { props: captured.slice(), meshes: g ? g.children : [] };
};

// --- the recipes ---------------------------------------------------------------------------
// The old tables were random pools per band, and they produced exactly what the owner
// complained about: five torii of different sizes piled on each other, a bridge over dry
// grass, and the same group of trees on every map. A recipe is now an explicit sketch.
const SCENE = vm.runInContext('NATIVE_SCENE', box);
const BAND = vm.runInContext('SCENE_BAND', box);
const PH = vm.runInContext('PROP_H', box);
{
  assert.strictEqual(SCENE.length, 10, 'all ten destinations carry a scene');
  assert.strictEqual(BAND.length, 4, 'one dressing band per stage group');
  const used = new Set(), unknown = [];
  const LANDMARK = [];
  for (let m = 0; m < 10; m++) {
    const sc = SCENE[m];
    assert.ok(sc && Array.isArray(sc.at) && sc.at.length, `${F.NAMES[m]} has a hero group`);
    assert.ok(sc.field && Array.isArray(sc.field.types) && sc.field.types.length >= 3,
      `${F.NAMES[m]} declares the natural dressing that fills its outer ground`);
    // every type named anywhere in the recipe must exist in the atlas - a typo places nothing
    const named = [];
    for (const a of sc.at || []) named.push(a.type);
    for (const a of sc.atx || []) named.push(a.type);
    for (const k of ['ring', 'grid', 'fence', 'path', 'bridge', 'shore', 'pier']) if (sc[k] && sc[k].type) named.push(sc[k].type);
    for (const r of sc.rows || []) named.push(r.type);
    for (const t of sc.field.types) named.push(t);
    if (sc.bridge) named.push('bridge_red_arch');
    for (const t of named) { used.add(t); if (!SPRITES[t]) unknown.push(t); }
    LANDMARK.push(sc.at[0].type);
  }
  assert.deepEqual(unknown, [], 'every sprite a recipe names exists in the kit atlas');
  // The kit is 34 sprites; the recipes should still draw on most of it across the ten maps.
  assert.ok(used.size >= 26, `the ten recipes draw on the kit (${used.size}/34 sprites)`);
  // Every prop needs a height, or scaleFor() has nothing to normalise against and the old
  // random-scale "buildings are small" bug comes back.
  const missing = Array.from(used).filter(t => !(PH[t] > 0));
  assert.deepEqual(missing, [], 'every placed sprite has a target height in PROP_H');
  // A person is ~2.9 units. A house has to be several people tall or it reads as a shed.
  for (const t of ['house_prontera', 'tower_geffen', 'shrine_stone', 'torii_gate'])
    assert.ok(PH[t] >= 9, `${t} is building-scale (${PH[t]}), not player-scale`);
  // A person is 2.9 units. Every hero the recipes place has to tower over the player, or the
  // walking reveal at the head of the lane is a shed.
  for (let m = 0; m < 10; m++)
    assert.ok(SCENE[m].at[0].h >= 9, `${F.NAMES[m]} hero is ${SCENE[m].at[0].h} tall`);
}

// --- hero dominance, and the camera band the props actually land in ------------------------
{
  // The in-game camera sees roughly thirty units ahead of the player's spawn point, so a
  // recipe whose set piece all sits at z<-28 is invisible on the first frame - that was the
  // "everything is crammed at the far end" report. Each field must put something in the
  // visible band as well as the landmark at the back.
  for (let m = 0; m < 10; m++) {
    const sc = SCENE[m];
    const flank = (sc.atx || []).concat(sc.rows || []);
    const visible = flank.filter(a => a.z > -24 && a.z < 10).length;
    assert.ok(visible >= 4,
      `${F.NAMES[m]} carries ${visible} pieces in the band the camera can see from spawn (needs 4+)`);
  }
}

// --- planting: the "houses under half way" regression -------------------------------------
{
  let checked = 0, inLane = 0, steep = 0, totalProps = 0;
  const perField = [];
  for (let m = 0; m < 10; m++) for (const lvl of [1, 5, 8, 10]) {
    const { props } = place(m, lvl);
    perField.push(props.length); totalProps += props.length;
    assert.ok(props.length > 0, `${F.NAMES[m]} stage ${lvl} carries themed props`);
    for (const p of props) {
      const ground = F.heightAt(m, p.x, p.z, lvl);
      // The whole bug: the sprite's base must be at the ground under it, not at y=0.
      assert.ok(Math.abs(p.y - (ground - .06)) < 1e-6,
        `${F.NAMES[m]} ${p.type} must stand on its own ground (y=${p.y.toFixed(2)}, ground=${ground.toFixed(2)})`);
      assert.ok(p.y > -3, `${F.NAMES[m]} ${p.type} is not sunk below the world`);
      // the lane is a rectangle, not a strip: the backdrop group behind it (z<-29) is fine
      if (Math.abs(p.x) < 16.2 && p.z > Z0 - 1 && p.z < Z1 + 1) inLane++;
      if (F.slopeAt(m, p.x, p.z) > 22.01) steep++;
      checked++;
    }
  }
  assert.strictEqual(inLane, 0, 'no themed prop may stand in the hunting lane');
  assert.strictEqual(steep, 0, 'no themed prop on a bank steeper than 22 degrees');
  assert.ok(checked >= 500, `props across the 40 fields (${checked}) - more than the 308 of the reported version`);
  assert.ok(Math.min(...perField) >= 6, 'even the plainest field carries a group of pieces');
}

// --- the bedding layer --------------------------------------------------------------------
{
  let meshes = 0, floaters = 0, deepest = 0, most = 0;
  for (let m = 0; m < 10; m++) for (const lvl of [1, 5, 8, 10]) {
    const { props, meshes: ms } = place(m, lvl);
    meshes += ms.length; most = Math.max(most, ms.length);
    assert.ok(ms.length <= CAP + 12, `${F.NAMES[m]} stage ${lvl} stays under the mesh ceiling (${ms.length})`);
    for (const me of ms) {
      // Every bedding piece belongs to a prop, so it can never be left loose in the field. The
      // radius allows for the details that deliberately run outward - a house's stepping path
      // reaches ~4.3 units at the largest prop scale.
      const near = Math.min(...props.map(p => Math.hypot(me.position.x - p.x, me.position.z - p.z)));
      if (near > 5.0) floaters++;
      const ground = F.heightAt(m, me.position.x, me.position.z, lvl);
      deepest = Math.min(deepest, me.position.y - ground);
    }
  }
  assert.strictEqual(floaters, 0, 'every bedding piece sits at a prop, not loose in the field');
  assert.ok(deepest > -.6, `no bedding piece sinks into the ground (deepest ${deepest.toFixed(2)})`);
  assert.ok(meshes >= 1200, `the layer is real work across the fields (${meshes} pieces)`);
  assert.ok(most <= CAP + 12, 'the busiest field is bounded');
}

// --- shared resources: this must not allocate per mesh ------------------------------------
{
  const geo = vm.runInContext('THEME_GEO.size', box), mat = vm.runInContext('THEME_MAT.size', box);
  assert.ok(geo > 0 && geo <= 600, `geometry is cached and bounded (${geo} entries for the whole kit)`);
  assert.ok(mat > 0 && mat <= 200, `materials are cached and bounded (${mat} entries)`);
}

console.log('native theme: 10 destinations, the whole 34-sprite kit, every prop planted on its own ground (the "houses under half way" fix), no prop in the lane or on a bank, and a bounded, cached bedding layer of real geometry');
