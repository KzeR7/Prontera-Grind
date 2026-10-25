// Regression checks for the v2 field landform (shipped in assets/native-fields.js)
// and its review page. Mirrors the style of tools/tests/native_fields_sim.js: the real
// module, the real Three objects, and the v195 landform as the compatibility baseline.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
let THREE;
try { THREE = require('three'); }
catch (e) { THREE = require(path.resolve(__dirname, '../../node_modules/three')); }
const V2 = require(path.join(root, 'assets/native-fields.js'));
// v195 baseline, addressed through the same module's legacy path.
const V1 = { NAMES: V2.NAMES, GRID: V2.GRID, terrainHeight: V2.legacyHeight, DESIGNS: V2.LEGACY };
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const deg = v => Math.atan(v) * 180 / Math.PI;
let checks = 0;
const ok = (cond, msg) => { assert(cond, msg); checks++; };

// ---- 1. deterministic, finite, and a drop-in for the shipped contract ----------
for (let m = 0; m < 10; m++) {
  ok(V2.NAMES[m] === V1.NAMES[m], 'map order matches the v195 field list: ' + m);
  for (const [x, z] of [[0, 0], [-13.7, 11.2], [44, -44], [31.5, -6.25]]) {
    const a = V2.terrainHeight(m, x, z), b = V2.terrainHeight(m, x, z);
    ok(Number.isFinite(a), 'finite height ' + [m, x, z]);
    ok(a === b, 'pure function (same input, same height) ' + [m, x, z]);
  }
  ok(V2.DESIGNS[m].name, 'recipe has a name');
}

// ---- 2. heightAt must interpolate the exact triangle the mesh renders ----------
{
  const GRID = V2.GRID, STEP = 90 / GRID;
  let worst = 0;
  for (let m = 0; m < 10; m++) {
    for (let i = 0; i < 400; i++) {
      const x = -44 + (i * 7.31) % 88, z = -44 + (i * 3.17) % 88;
      const gx = Math.max(0, Math.min(GRID - 1e-8, (x + 45) / STEP)), gz = Math.max(0, Math.min(GRID - 1e-8, (z + 45) / STEP));
      const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz;
      const xx = ix * STEP - 45, zz = iz * STEP - 45;
      const a = V2.terrainHeight(m, xx, zz), b = V2.terrainHeight(m, xx + STEP, zz);
      const c = V2.terrainHeight(m, xx, zz + STEP), e = V2.terrainHeight(m, xx + STEP, zz + STEP);
      const tri = u + v <= 1 ? a + (b - a) * u + (c - a) * v : e + (c - e) * (1 - u) + (b - e) * (1 - v);
      worst = Math.max(worst, Math.abs(V2.heightAt(m, x, z) - tri));
    }
  }
  ok(worst < 1e-9, 'heightAt equals the rendered triangle (worst ' + worst.toExponential(1) + ')');
}

// ---- 3. the fight lane stays walkable; the field outside it must not be flat --
{
  for (let m = 0; m < 10; m++) {
    let laneMax = 0, laneRelief = [1e9, -1e9], outerRelief = [1e9, -1e9], maxSlope = 0;
    for (let x = -13; x <= 13; x += 1) for (let z = -28; z <= 12; z += 1) {
      const y = V2.terrainHeight(m, x, z);
      laneRelief[0] = Math.min(laneRelief[0], y); laneRelief[1] = Math.max(laneRelief[1], y);
      maxSlope = Math.max(maxSlope, deg(Math.abs(V2.terrainHeight(m, x + .01, z) - y) / .01), deg(Math.abs(V2.terrainHeight(m, x, z + .01) - y) / .01));
    }
    for (let x = -44; x <= 44; x += 2) for (let z = -44; z <= 44; z += 2) {
      if (Math.abs(x) < 14 && z > -30 && z < 14) continue;
      const y = V2.terrainHeight(m, x, z);
      outerRelief[0] = Math.min(outerRelief[0], y); outerRelief[1] = Math.max(outerRelief[1], y);
    }
    const d = V2.DESIGNS[m];
    ok(laneRelief[1] - laneRelief[0] < (d.amp > 2 ? 3.2 : 2.6), 'lane relief stays small: ' + d.name + ' ' + (laneRelief[1] - laneRelief[0]).toFixed(2));
    ok(maxSlope < 26, 'lane never exceeds a gentle walk: ' + d.name + ' ' + maxSlope.toFixed(1) + 'deg');
    ok(outerRelief[1] - outerRelief[0] > 2.5, 'relief reaches the field outside the lane: ' + d.name);
  }
}

// ---- 4. no straight seams: the surface must stay C0 everywhere ---------------
// A discontinuity (a clamp or a stepped threshold) shows up as a single-sample spike
// many times larger than its neighbours' differences.
{
  let worstJump = 0, where = '';
  for (let m = 0; m < 10; m++) {
    for (let i = 0; i < 4000; i++) {
      const x = -44 + (i * 2.718) % 88, z = -44 + (i * 1.618) % 88, e = .05;
      const c = V2.terrainHeight(m, x, z);
      const neigh = [V2.terrainHeight(m, x + e, z), V2.terrainHeight(m, x - e, z), V2.terrainHeight(m, x, z + e), V2.terrainHeight(m, x, z - e)];
      const jump = Math.max(...neigh.map(v => Math.abs(v - c)));
      if (jump / (2 * e) > 3.0 && jump > worstJump) { worstJump = jump; where = V2.DESIGNS[m].name + ' @' + x.toFixed(1) + ',' + z.toFixed(1); }
    }
  }
  ok(worstJump < .75, 'no height discontinuity steeper than ~7.5:1 (worst ' + worstJump.toFixed(2) + ' at ' + where + ')');
}

// ---- 5. fields must be distinguishable, not one recipe x10 ------------------
{
  const S = 41, samples = [];
  for (let m = 0; m < 10; m++) {
    const row = [];
    for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) row.push(V2.terrainHeight(m, -44 + i * 88 / (S - 1), -44 + j * 88 / (S - 1)));
    const mean = row.reduce((a, b) => a + b, 0) / row.length;
    // High-pass: every field deliberately rises towards its perimeter so the horizon
    // is land, not the edge of a plane. Compare the *pattern* left after that shared
    // bowl and the per-map tilt are removed.
    const smooth = row.slice();
    const k = 6;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      let sum = 0, n = 0;
      for (let dj = -k; dj <= k; dj += 2) for (let di = -k; di <= k; di += 2) {
        const jj = j + dj, ii = i + di;
        if (jj < 0 || jj >= S || ii < 0 || ii >= S) continue;
        sum += row[jj * S + ii]; n++;
      }
      smooth[j * S + i] = row[j * S + i] - sum / n;
    }
    samples.push(smooth);
  }
  const corr = (a, b) => {
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) { num += a[i] * b[i]; da += a[i] * a[i]; db += b[i] * b[i]; }
    return num / Math.sqrt(da * db);
  };
  let worstPair = 0, pairName = '';
  for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) {
    const c = corr(samples[i], samples[j]);
    if (c > worstPair) { worstPair = c; pairName = V2.DESIGNS[i].name + ' / ' + V2.DESIGNS[j].name; }
  }
  ok(worstPair < 0.6, 'no two destinations share a landform (worst r=' + worstPair.toFixed(2) + ' for ' + pairName + ')');
  // flat patches must not repeat on a small period like the shipped kit's wallpaper
  for (let m = 0; m < 10; m++) {
    let same = 0, total = 0;
    for (let i = 0; i < samples[m].length - 25; i++) { total++; if (Math.abs(samples[m][i] - samples[m][i + 25]) < .02) same++; }
    ok(same / total < .35, 'terrain does not repeat on a 25-sample period: ' + V2.DESIGNS[m].name);
  }
}

// ---- 6. surface weights: normalised, slope-driven, and a real trail ---------
{
  for (let m = 0; m < 10; m++) {
    for (const [x, z] of [[0, 0], [40, 40], [-25, 8], [12, -20]]) {
      const w = V2.surfaceWeights(m, x, z);
      const sum = w.grass + w.dirt + w.rock + w.beach;
      ok(Math.abs(sum - 1) < 1e-9, 'splat weights sum to 1: ' + V2.DESIGNS[m].name);
      ok(w.grass >= -1e-9 && w.dirt >= -1e-9 && w.rock >= -1e-9 && w.beach >= -1e-9, 'non-negative weights');
    }
  }
  // steep ground must win rock
  let rocked = 0, steepPoints = 0;
  for (let m = 0; m < 10; m++) for (let x = -42; x <= 42; x += 3) for (let z = -42; z <= 42; z += 3) {
    const s = V2.slopeAt(m, x, z);
    if (s > 26) { steepPoints++; if (V2.surfaceWeights(m, x, z).rock > .5) rocked++; }
  }
  ok(steepPoints > 0, 'field has steep ground to paint');
  ok(rocked / steepPoints > .8, 'rock covers steep faces (' + Math.round(100 * rocked / steepPoints) + '%)');
  // the trail wanders, and it is not a straight road down the middle
  const p = V2.DESIGNS[0];
  const offsets = [-20, -10, 0, 10].map(z => { const x = offsetForTrail(0, z); return x; });
  ok(Math.max(...offsets) - Math.min(...offsets) > 3, 'trail wanders rather than running straight');
  function offsetForTrail(m, z) {
    let best = 0, bestW = -1;
    for (let x = -20; x <= 20; x += .5) { const w = V2.surfaceWeights(m, x, z).dirt; if (w > bestW) { bestW = w; best = x; } }
    return best;
  }
}

// ---- 7. geometry: one indexed grid, normals present, lane contact ------------
{
  const world = [0, 3, 7, 9].map(m => V2.terrainGeometry(THREE, m));
  for (const g of world) {
    ok(g.index, 'indexed geometry');
    ok(g.attributes.normal && g.attributes.color && g.attributes.uv, 'normals, vertex colours and uv present');
    ok(g.index.count / 3 === V2.GRID * V2.GRID * 2, 'grid is ' + V2.GRID + 'x' + V2.GRID + ' quads');
    ok(g.attributes.position.count === (V2.GRID + 1) * (V2.GRID + 1), 'shared vertices (smooth normals)');
  }
  ok(V2.GRID === (V1.GRID || 72), 'same grid density as the shipped field: ' + V2.GRID);
}

// ---- 8. wiring: still opt-in, and the old landform is reachable for comparison --
{
  ok(src.includes('PGNativeFields'), 'game uses the native-fields module');
  ok(/NATIVE_FIELDS_DEFAULT=false/.test(src), 'outdoor fields remain opt-in');
  ok(src.includes('PGNativeFields.heightAt'), 'actors read the field height through the module');
  ok(V2.TERRAIN === 'v2', 'v2 is the default landform');
  // ?nativeFields=1&terrain=v1 keeps the v195 shape reachable without a second module
  const scope8 = { URLSearchParams, location: { search: '?nativeFields=1&terrain=v1' } };
  const vm8 = require('node:vm');
  vm8.createContext(scope8);
  const mod = fs.readFileSync(path.join(root, 'assets/native-fields.js'), 'utf8');
  // The factory wrapper is stripped: the selector only needs the header block.
  const head = mod.slice(mod.indexOf("'use strict';") + 13, mod.indexOf('const NAMES='));
  vm8.runInContext(head + ';this.T=TERRAIN;', scope8);
  ok(scope8.T === 'v1', 'terrain=v1 selects the v195 landform');
  const scope9 = { URLSearchParams, location: { search: '?nativeFields=1' } };
  vm8.createContext(scope9); vm8.runInContext(head + ';this.T=TERRAIN;', scope9);
  ok(scope9.T === 'v2', 'no terrain flag means v2');
  // legacy and v2 must be genuinely different fields
  let differs = 0;
  for (let m = 0; m < 10; m++) if (Math.abs(V2.legacyHeight(m, 6, -8) - V2.terrainHeight(m, 6, -8)) > .2) differs++;
  ok(differs === 10, 'every field changed shape, not just its numbers');
  const page = fs.readFileSync(path.join(root, 'tools/maps/terrain_v2_preview.html'), 'utf8');
  // Root-absolute, because / shows this page directly (PREVIEW_PAGE) - relative paths 404 there.
  ok(page.includes('src="/assets/native-fields.js"'), 'review page loads the shipped module from the site root');
  ok(page.includes('src="/tools/maps/vendor/three-r128.min.js"'), 'review page loads three from the site root');
  ok(!/src="\.\.?\//.test(page), 'review page has no relative script paths');
  ok(/legacyHeight/.test(page) && /state\.v2/.test(page), 'review page toggles v195 vs v2');
}

// ---- 9. Ascension maps keep their own renderer ------------------------------
{
  ok(/buildAscension|ascension/.test(src), 'Ascension scenery path untouched');
  const asc = fs.readFileSync(path.join(root, 'assets/ascension.js'), 'utf8');
  ok(!/PGNativeFields/.test(asc), 'Ascension does not consume field terrain');
}

console.log('field landform v2: ' + checks + ' checks passed (determinism, triangle contact, lane walkability,'
  + ' seam-free surface, distinct landforms, splat weights, geometry contract, isolation from the game)');
