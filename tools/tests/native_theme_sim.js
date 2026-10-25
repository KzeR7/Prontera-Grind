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
var __detail=null;
const deco={add(o){__detail=o}};
const kitPropMeshes=(plan)=>{for(const p of plan.props)__out.push(p)};
${grab('const NATIVE_THEME=[', '// How much architecture')}
${grab('const NATIVE_THEME_BUDGET=', 'function placeNativeTheme')}
${grab('function placeNativeTheme', 'function buildKit(')}
`, box);

const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'assets/kit/ro-spritesheet.json'), 'utf8'));
const SPRITES = manifest.sprites || manifest;
const THEME = vm.runInContext('NATIVE_THEME', box);
const BUDGET = vm.runInContext('NATIVE_THEME_BUDGET', box);
const CAP = vm.runInContext('THEME_MESH_CAP', box);

const place = (m, lvl) => {
  captured.length = 0;
  vm.runInContext(`S.mp=${m};S.lvl=${lvl};__detail=null`, box);
  F.setStage(lvl);
  box.placeNativeTheme(m, {});
  const g = vm.runInContext('__detail', box);
  return { props: captured.slice(), meshes: g ? g.children : [] };
};

// --- the tables ---------------------------------------------------------------------------
{
  const named = new Set(), unknown = [];
  for (const row of THEME) for (const k of ['arch', 'land', 'small']) {
    assert.ok(Array.isArray(row[k]) && row[k].length, `every theme has a ${k} pool`);
    for (const t of row[k]) { named.add(t); if (!SPRITES[t]) unknown.push(t); }
  }
  assert.deepEqual(unknown, [], 'every themed sprite exists in the kit atlas - a typo would place nothing and look like "no details"');
  assert.ok(named.size >= 30, `the tables draw on the whole kit (${named.size}/34), not a token few`);
  assert.strictEqual(THEME.length, 10, 'all ten destinations carry a theme');
  // more detail than the reported version, per band
  // cross-realm array, so compare as a string
  const totals = Array.from(BUDGET, b => b.arch + b.land + b.small);
  assert.strictEqual(totals.join(','), '17,13,27,11', 'budgets per stage band (landmarks + middle + clutter)');
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
      if (Math.abs(p.x) < 16.2) inLane++;
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
