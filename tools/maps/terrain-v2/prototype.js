/* Terrain v2 prototype — dev-only proposal sketch for the ten outdoor fields.
 *
 * Not wired into the game. Same public shape as assets/native-fields.js
 * (terrainHeight / heightAt / DESIGNS / GRID / STEP) so a swap is mechanical:
 * it is a drop-in candidate for `terrainHeight` in that module.
 *
 * Why this exists: the shipped v1 field is `1.1 + 3 Gaussian mounds + 1 Gaussian
 * valley + one sine ripple`, repeated for all ten maps. Every destination is a
 * smooth blob field: no ridge lines, no creases, no cliffs, no flats, no
 * erosion, and the same silhouette with different numbers. This file replaces
 * that with a layered landform stack (docs/proposals/map-terrain-upgrade-2026-10-25.md).
 *
 * Determinism: every value is a pure function of (map, x, z). No Math.random,
 * no state, no order dependence — the game's `heightAt` contract (exact triangle
 * interpolation of the rendered mesh) is unchanged.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PGTerrainV2 = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const NAMES = ['prontera', 'izlude', 'geffen', 'morocc', 'payon', 'comodo', 'louyang', 'amatsu', 'gl_chyard', 'hu_fild05'];

  // ---- deterministic value noise -------------------------------------------------
  const hash2 = (x, z, s) => {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const fade = t => t * t * (3 - 2 * t);
  function noise(x, z, s) {
    const X = Math.floor(x), Z = Math.floor(z), fx = fade(x - X), fz = fade(z - Z);
    const a = hash2(X, Z, s), b = hash2(X + 1, Z, s), c = hash2(X, Z + 1, s), d = hash2(X + 1, Z + 1, s);
    return (a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz) * 2 - 1;
  }
  function fbm(x, z, s, oct = 4, lac = 2.03, gain = 0.5) {
    let v = 0, amp = 1, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { v += amp * noise(x * f, z * f, s + i * 1013); norm += amp; amp *= gain; f *= lac; }
    return v / norm;
  }
  // Ridged multifractal: sharp crests, converging troughs. This is what turns
  // "blobs" into hills that read as hills from a top-down camera.
  function ridged(x, z, s, oct = 4, lac = 2.07, gain = 0.5) {
    let v = 0, amp = 1, f = 1, norm = 0, weight = 1;
    for (let i = 0; i < oct; i++) {
      let n = 1 - Math.abs(noise(x * f, z * f, s + i * 733));
      n *= n; n *= weight;
      weight = Math.max(0, Math.min(1, n * 1.7));
      v += amp * n; norm += amp; amp *= gain; f *= lac;
    }
    return v / norm;
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;

  // ---- per-destination landform recipes ------------------------------------------
  // Each map is a *different kind of place*, not the same hill recipe with new numbers:
  // tilt gives one clear uphill direction, `ridge` forms the skyline, `bench` gives
  // plateau floors with escarpments, `carve` gives drainage channels, `signature`
  // adds the landmark the map is remembered for.
  const DESIGNS = [
    { // Prontera: open meadow basin. Wide, low swells, one farm terrace and a low
      // saddle — the calm, readable "home field".
      name: 'Prontera meadow', amp: 2.06, seed: 1103, rotate: 0.0, pathInfluence: 1, frame: 2.2, trail: { bend: 9.5, phase: 0.4, width: 3.4 }, tilt: [0.30, 0.75], landAmp: 1.5, landScale: 40,
      ridgeAmp: 1.5, ridgeScale: 46, bench: { at: 2.4, step: 1.1, sharp: 0.5, amount: 0.55, warp: 0.55 },
      carve: { freq: 0.05, depth: 0.32 }, micro: 0.10, water: null,
      signature: { kind: 'terrace', level: 2.4, x: 24, z: -18, r: 15, drop: 1.0 }
    },
    { // Izlude: coastal shelf. Long sea-facing bluff on one side, open water, a
      // marine terrace behind it. Reads "seaside" from any angle.
      name: 'Izlude coastal grassland', amp: 2.36, seed: 2211, rotate: 0.9, pathInfluence: 0.9, frame: 1.7, trail: { bend: 8.5, phase: 1.6, width: 3.0 }, tilt: [-0.55, -0.35], landAmp: 1.1, landScale: 44,
      ridgeAmp: 1.0, ridgeScale: 52, bench: { at: 1.8, step: 0.9, sharp: 0.45, amount: 0.5, warp: 0.5 },
      carve: { freq: 0.045, depth: 0.26 }, micro: 0.09,
      water: { x: -27, z: -14, rx: 9, rz: 15, level: 0.3 },
      signature: { kind: 'bluff', x: -21, z: 16, r: 17, top: 3.2, face: 1.0 }
    },
    { // Geffen: one long wooded ridge down the field with hollows on both sides,
      // and a rock spur stepping off it. Strong, asymmetric skyline.
      name: 'Geffen wooded ridge', amp: 0.65, seed: 3319, rotate: 1.9, pathInfluence: 0.85, frame: 2.4, trail: { bend: 7.5, phase: 2.4, width: 2.8 }, tilt: [0.5, -0.2], landAmp: 1.3, landScale: 34,
      ridgeAmp: 2.9, ridgeScale: 30, ridgeBias: 0.16, bench: { at: 3.0, step: 1.15, sharp: 0.6, amount: 0.6, warp: 0.8 },
      carve: { freq: 0.06, depth: 0.5 }, micro: 0.12, water: null,
      signature: { kind: 'spur', x: 19, z: 8, r: 14, top: 3.2, face: 1.0 }
    },
    { // Morocc: transverse dunes. Smooth windswept ridges, no cliffs, no crumple.
      name: 'Morocc dunes', amp: 4.03, seed: 4407, rotate: 2.6, pathInfluence: 0.0, frame: 1.8, tilt: [0.7, 0.45], landAmp: 0.45, landScale: 50,
      ridgeAmp: 1.9, ridgeScale: 26, ridgeBias: 0.2, bench: null, dune: true, duneFreq: 0.115,
      carve: { freq: 0.035, depth: 0.16 }, micro: 0.07, water: null,
      signature: { kind: 'dunefield', major: 0.11, minor: 0.035, amp: 1.1 }
    },
    { // Payon: stacked forest spurs with tight valleys and one stream-cut gorge.
      name: 'Payon forest hills', amp: 0.45, seed: 5511, rotate: 0.35, pathInfluence: 0.95, frame: 2.6, trail: { bend: 9, phase: 0.9, width: 3.0 }, tilt: [-0.25, 0.6], landAmp: 1.4, landScale: 32,
      ridgeAmp: 3.1, ridgeScale: 26, ridgeBias: 0.2, bench: { at: 3.2, step: 1.25, sharp: 0.65, amount: 0.6, warp: 0.85 },
      carve: { freq: 0.062, depth: 0.6 }, micro: 0.13,
      water: { x: 28, z: 6, rx: 7, rz: 11, level: 0.45 },
      signature: { kind: 'gorge', x: -20, z: 4, r: 18, depth: 1.5 }
    },
    { // Comodo: jungle sinkhole. A ringed karst rim around a green basin with a
      // pond in the floor — the field reads as a hollow you walk down into.
      name: 'Comodo jungle hollow', amp: 0.89, seed: 6605, rotate: 2.1, pathInfluence: 0.7, frame: 2.8, trail: { bend: 7, phase: 3.5, width: 2.6 }, tilt: [0.1, 0.15], landAmp: 1.2, landScale: 30,
      ridgeAmp: 2.0, ridgeScale: 28, bench: { at: 2.6, step: 1.3, sharp: 0.8, amount: 0.55, warp: 0.9 },
      carve: { freq: 0.05, depth: 0.4 }, micro: 0.12,
      water: { x: 25, z: 0, rx: 8, rz: 12, level: 0.25 },
      signature: { kind: 'basin', x: 24, z: 0, r: 22, depth: 1.9 }
    },
    { // Louyang: mountain foothills. Highest relief, terraced slopes, a dry ravine.
      name: 'Louyang mountain field', amp: 0.78, seed: 7703, rotate: 1.3, pathInfluence: 0.6, frame: 3.0, trail: { bend: 8.5, phase: 2.0, width: 2.6 }, tilt: [-0.6, -0.5], landAmp: 1.6, landScale: 30,
      ridgeAmp: 3.8, ridgeScale: 24, ridgeBias: 0.24, bench: { at: 3.6, step: 1.25, sharp: 0.62, amount: 0.66, warp: 1.1 },
      carve: { freq: 0.065, depth: 0.75 }, micro: 0.15, water: null,
      signature: { kind: 'terrace', level: 3.6, x: -20, z: -20, r: 16, drop: 1.4 }
    },
    { // Amatsu: soft wild meadow with a shrine plateau. Gentle, wide, and it has
      // one deliberate flat top the props can stand on.
      name: 'Amatsu wild meadow', amp: 1.59, seed: 8817, rotate: 3.6, pathInfluence: 0.85, frame: 1.9, trail: { bend: 8, phase: 4.2, width: 3.0 }, tilt: [0.4, -0.6], landAmp: 1.5, landScale: 36,
      ridgeAmp: 1.8, ridgeScale: 42, bench: { at: 2.6, step: 1.0, sharp: 0.45, amount: 0.5, warp: 0.6 },
      carve: { freq: 0.045, depth: 0.3 }, micro: 0.10,
      water: { x: 26, z: -18, rx: 8, rz: 12, level: 0.28 },
      signature: { kind: 'plateau', x: -7, z: -20, r: 16, top: 2.8, face: 0.9 }
    },
    { // Niflheim: sunken dead hollow. Wide shallow bowl, cracked flats, low husk
      // mounds, no dramatic peaks — the quiet, wrong-feeling field.
      name: 'Niflheim dead hollow', amp: 1.21, seed: 9901, rotate: 4.4, pathInfluence: 0.5, frame: 2.0, trail: { bend: 7, phase: 2.8, width: 2.8 }, tilt: [-0.15, -0.25], landAmp: 1.3, landScale: 34,
      ridgeAmp: 1.6, ridgeScale: 38, bench: { at: 2.2, step: 1.2, sharp: 0.75, amount: 0.6, warp: 0.75 },
      carve: { freq: 0.055, depth: 0.45 }, micro: 0.10, water: null,
      signature: { kind: 'basin', x: -8, z: -14, r: 24, depth: 1.6 }
    },
    { // Abyss: broken basalt basin. Steepest stepped cliffs, a shelf dropping to a
      // black lake, and the roughest micro relief of the ten.
      name: 'Abyss rocky basin', amp: 0.76, seed: 10309, rotate: 5.1, pathInfluence: 0.35, frame: 2.8, trail: { bend: 8, phase: 1.2, width: 3.2 }, tilt: [0.5, 0.35], landAmp: 1.5, landScale: 28,
      ridgeAmp: 3.2, ridgeScale: 24, ridgeBias: 0.18, bench: { at: 3.0, step: 1.35, sharp: 0.7, amount: 0.72, warp: 1.2 },
      carve: { freq: 0.07, depth: 0.65 }, micro: 0.17,
      water: { x: -26, z: 2, rx: 9, rz: 13, level: 0.2 },
      signature: { kind: 'shelf', x: 10, z: 14, r: 20, drop: 1.7 }
    }
  ];

  // The fighting lane (hero + mobs + loot) is carved flat-ish first and the rest of
  // the landform is faded back toward it. v1 has no such rule, which is why its hills
  // run straight through the arena.
  const LANE = { x0: -14, x1: 14, z0: -29, z1: 14 };
  const laneCfg = { mix: 0.60 };   // 0 = full landform through the arena, .6 = readable lane
  function laneWeight(x, z) {
    // 1 = playable flat lane, 0 = full landform relief.
    // The boundary is pushed around by noise on both axes: a hard rectangle here
    // reads as a flat box dropped into the hills (the mistake the kit fields made
    // in v27), so the clearing has a ragged, natural outline.
    const jx = 3.2 * fbm(z * 0.055, 11.3, 707, 2) + 1.4 * fbm(z * 0.19, 3.1, 911, 2);
    const jz = 3.2 * fbm(x * 0.055, 5.7, 613, 2);
    const dx = Math.max(LANE.x0 + jx - x, 0, x - (LANE.x1 - jx));
    const dz = Math.max(LANE.z0 + jz - z, 0, z - (LANE.z1 + jz));
    const d = Math.hypot(dx, dz * 0.7);
    return 1 - smooth(1.0, 9.0, d);
  }

  function pondRadius(w, x, z) {
    const angle = Math.atan2((z - w.z) / w.rz, (x - w.x) / w.rx);
    return Math.hypot((x - w.x) / w.rx, (z - w.z) / w.rz) / (1 + 0.09 * Math.sin(angle * 3) + 0.05 * Math.cos(angle * 5));
  }

  // Bench = shelf / escarpment / shelf instead of one smooth dome. Applied only where
  // `cliffMask` says the slope is rocky, and the contour line is warped, so shelves
  // meander like real strata instead of drawing concentric rings.
  function bench(h, b, warp, amount) {
    if (!b || amount <= 0) return h;
    const q = b.step;
    // The warp moves the *threshold*, never the value: shifting inside the step
    // function instead leaves a height discontinuity wherever `h` crosses it,
    // which renders as a straight seam across the field.
    const at = b.at + warp * q;
    if (h <= at) return h;
    const over = h - at;
    const t = over / q;
    const f = t - Math.floor(t);
    const sharp = b.sharp;
    const stepped = (Math.floor(t) + smooth(0.5 - sharp * 0.5, 0.5 + sharp * 0.5, f)) * q;
    return at + mix(over, stepped, amount);
  }

  // Large-scale mask: some parts of a field are calm, others carry the relief.
  // Without it every square metre looks equally worked, which reads as noise.
  // Deliberately *not* clamped: clamping a mask leaves a C0 crease where the clamp
  // engages, which shows up in-game as a straight slope change across the field.
  function reliefMask(x, z, s) {
    return 0.30 + 0.88 * (0.5 + 0.5 * fbm(x * 0.017, z * 0.017, s + 211, 2));
  }
  function cliffZone(x, z, s) {
    return smooth(-0.10, 0.35, fbm(x * 0.026, z * 0.026, s + 307, 2));
  }

  function signature(sig, x, z) {
    if (!sig) return 0;
    switch (sig.kind) {
      case 'terrace': { // flat farming shelf with a sharp outer lip
        const d = Math.hypot(x - sig.x, z - sig.z) / sig.r;
        return -sig.drop * (1 - smooth(0.55, 1.0, d)) - sig.drop * 0.35 * smooth(0.85, 1.0, d);
      }
      case 'bluff': { // raised headland dropping to the shore in one long face
        const d = Math.hypot((x - sig.x) * 1.15, (z - sig.z) * 0.8) / sig.r;
        return sig.top * (1 - smooth(0.3, 1.15, d)) - sig.face * smooth(0.85, 1.25, d);
      }
      case 'spur': { // a shoulder stepping off the main ridge
        const d = Math.hypot(x - sig.x, (z - sig.z) * 0.55) / sig.r;
        return sig.top * (1 - smooth(0.25, 1.25, d)) - sig.face * 0.45 * smooth(0.8, 1.2, d);
      }
      case 'dunefield': {
        const m = Math.sin(x * sig.major + z * sig.minor * 3.1) * 0.6 + Math.sin(z * sig.minor * 6.2 - x * 0.03) * 0.4;
        return sig.amp * (0.5 + 0.5 * m);
      }
      case 'gorge': { // sinuous channel cut through the hills, banks over ~9 units
        const c = Math.sin(z * 0.11) * 6 + Math.sin(z * 0.03) * 9;
        const d = Math.abs(x - c);
        return -sig.depth * (1 - smooth(sig.r * 0.18, sig.r * 0.62, d));
      }
      case 'basin': {
        const d = Math.hypot((x - sig.x) / sig.r, (z - sig.z) / (sig.r * 1.2));
        return -sig.depth * (1 - smooth(0.45, 1.15, d));
      }
      case 'plateau': { // flat-topped shrine shelf, shoulders falling away gently
        const d = Math.hypot(x - sig.x, z - sig.z) / sig.r;
        return sig.top * (1 - smooth(0.25, 0.95, d)) - sig.face * smooth(0.9, 1.35, d);
      }
      case 'shelf': { // broad shelf that breaks away in two soft escarpments
        const d = Math.hypot((x - sig.x) * 0.9, z - sig.z) / sig.r;
        const t = smooth(0.45, 0.75, d) + smooth(0.85, 1.05, d);
        return -sig.drop * 0.5 * t;
      }
      default: return 0;
    }
  }

  // A single winding trail, deliberately not straight and not in the middle of the
  // lane (the fight happens there). Width and wander come from the recipe.
  function trailCenter(map, z) {
    const t = (DESIGNS[map] || DESIGNS[0]).trail || { bend: 0, phase: 0 };
    return t.bend * Math.sin(z * 0.052 + t.phase) + 0.4 * t.bend * Math.sin(z * 0.13 + t.phase * 0.7);
  }

  function terrainHeight(map, x, z) {
    const d = DESIGNS[map] || DESIGNS[0];
    const s = d.seed, amp = d.amp || 1;
    // Each destination samples its noise in its own rotated frame: two fields can
    // share an amplitude and still never share a silhouette or a crest direction.
    const ca = Math.cos(d.rotate || 0), sa = Math.sin(d.rotate || 0);
    const rx = x * ca - z * sa, rz = x * sa + z * ca;
    // 1. domain warp: nothing in nature is sampled on a rectangular lattice
    const wx = rx + 13 * fbm(rx * 0.019, rz * 0.019, s + 17, 3);
    const wz = rz + 13 * fbm(rx * 0.019 + 5.2, rz * 0.019 - 3.7, s + 29, 3);

    // 2. broad landform (valley floors, gentle rises) + one clear tilt direction
    let base = 1.05;
    base += d.landAmp * amp * fbm(wx / d.landScale, wz / d.landScale, s + 3, 3);
    base += d.tilt[0] * (rx / 45) + d.tilt[1] * (rz / 45);

    // 3. skyline: ridged crests, biased to one side so no map is mirror-symmetric.
    //    Three octaves only — a finer crest network reads as crumpled paper from
    //    this camera height, not as terrain.
    const mask = reliefMask(rx, rz, s);
    const ridgeBias = 1 + (d.ridgeBias || 0) * (rx / 45);
    const crest = ridged(wx / d.ridgeScale, wz / d.ridgeScale, s + 61, 3);
    let relief = d.ridgeAmp * crest * Math.max(0.2, ridgeBias) * mask * amp;
    if (d.dune) {
      // Long transverse crests: the phase wanders slowly, the crest direction does
      // not, which is what gives a dune sea its grain (and its anisotropy).
      const phase = rz * d.duneFreq + 1.9 * fbm(rx * 0.028, rz * 0.012, s + 5, 2);
      const dune = 0.5 + 0.5 * Math.sin(phase);
      relief = mix(relief, d.ridgeAmp * (0.35 + 0.65 * dune * dune) * mask, 0.92);
    }

    // 4. drainage: broad shallow swales where the crests fall away, never gullies
    //    across the whole field.
    const channel = 1 - Math.abs(fbm(wx * d.carve.freq, wz * d.carve.freq, s + 97, 2));
    relief -= d.carve.depth * channel * channel * channel * channel;

    let full = base + relief;

    // 5. plateau benches turn a hillside into shelves, but only in rocky country
    if (d.bench) full = bench(full, d.bench, d.bench.warp * fbm(wx * 0.05, wz * 0.05, s + 401, 2), d.bench.amount * cliffZone(rx, rz, s));

    // 6. landmark / signature feature per destination
    full += signature(d.signature, x, z);

    // 6b. perimeter frame: the field sits in a vale, so the horizon is land, not the
    //     edge of a 90x90 plane. Side and far edges only — the near edge must stay
    //     open or it blocks the camera.
    const edge = Math.min(45 - Math.abs(x), z + 45);
    full += d.frame * (1 - smooth(1, 13, edge)) * (0.65 + 0.7 * fbm(rx * 0.05, rz * 0.05, s + 503, 3));

    // 7. flatten toward a readable lane, then add close-up micro relief back in
    const flat = base * 0.55 + 0.55;
    const lane = laneWeight(x, z);
    let h = mix(full, flat, lane * laneCfg.mix);
    h += d.micro * fbm(x * 0.5, z * 0.5, s + 131, 2) * (0.45 + 0.55 * lane);

    // 8. pond: dig only as deep as the basin floor needs, fading over a wide beach.
    //    Mixing toward a constant level over a short radius is what makes a wall.
    const w = d.water;
    if (w) {
      const r = pondRadius(w, x, z);
      const floor = w.level - 0.6;
      const need = Math.max(0, h - floor);
      h -= need * (1 - smooth(0.5, 1.8, r));
      h = mix(h, w.level - 0.75, (1 - smooth(0, 0.55, r)) * 0.5);
    }
    return h;
  }

  // Exact rendered-triangle interpolation — identical contract to native-fields.js.
  const GRID = 72, STEP = 90 / GRID;
  function heightAt(map, x, z) {
    const gx = Math.max(0, Math.min(GRID - 1e-8, (x + 45) / STEP)), gz = Math.max(0, Math.min(GRID - 1e-8, (z + 45) / STEP));
    const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz, xx = ix * STEP - 45, zz = iz * STEP - 45;
    const a = terrainHeight(map, xx, zz), b = terrainHeight(map, xx + STEP, zz), c = terrainHeight(map, xx, zz + STEP), e = terrainHeight(map, xx + STEP, zz + STEP);
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : e + (c - e) * (1 - u) + (b - e) * (1 - v);
  }

  // Slope in degrees from the *rendered* surface, for prop/splat rules.
  function slopeAt(map, x, z, e = 0.35) {
    const dx = (heightAt(map, x + e, z) - heightAt(map, x - e, z)) / (2 * e);
    const dz = (heightAt(map, x, z + e) - heightAt(map, x, z - e)) / (2 * e);
    return Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI;
  }

  // ---- surface weights (draft for the Phase-2 splat pass) -------------------------
  // v1 paints one canvas: base tile, one road mask, flat green "patches". The result
  // repeats at tile scale and the road ignores the landform. These weights let the
  // same heightfield drive the floor instead: rock on steep faces, dirt in hollows
  // and along the lane, grass on gentle ground, sand on the beach ring.
  function surfaceWeights(map, x, z) {
    const d = DESIGNS[map];
    const slope = slopeAt(map, x, z);           // degrees
    const rock = smooth(17, 32, slope);
    const patch = smooth(0.5, 0.9, fbm(x * 0.06, z * 0.06, d.seed + 811, 3) * 0.5 + 0.5) * 0.7;
    const lane = d.pathInfluence > 0 && d.trail ? (1 - smooth(d.trail.width * 0.55, d.trail.width + 1.4, Math.abs(x - trailCenter(map, z)))) * d.pathInfluence * 0.85 : 0;
    const beach = d.water ? 1 - smooth(1.0, 1.45, pondRadius(d.water, x, z)) : 0;
    const dirt = Math.min(1, patch + lane);
    const grass = Math.max(0, 1 - rock - dirt - beach);
    const total = grass + dirt + rock + beach || 1;
    return { grass: grass / total, dirt: dirt / total, rock: rock / total, beach: beach / total };
  }

  // Same mesh contract as v1: one shared indexed grid, smooth vertex normals, vertex
  // colours carrying slope/height shading so the floor reads even before textures.
  function terrainGeometry(THREE, map) {
    const positions = [], uv = [], colors = [], indices = [];
    for (let z = 0; z <= GRID; z++) for (let x = 0; x <= GRID; x++) {
      const xx = x * STEP - 45, zz = z * STEP - 45, y = terrainHeight(map, xx, zz);
      const w = surfaceWeights(map, xx, zz);
      // grass slightly cool, dirt warm, rock desaturated: cheap "biome" read
      const shade = 0.86 + 0.14 * smooth(-1.5, 3.5, y);
      colors.push(shade * (0.94 + 0.06 * w.grass), shade * (1.0 - 0.05 * w.rock), shade * (0.92 + 0.08 * w.beach));
      positions.push(xx, y, zz); uv.push(x / GRID, 1 - z / GRID);
    }
    for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
      const a = z * (GRID + 1) + x, b = a + 1, c = a + GRID + 1, e = c + 1;
      indices.push(a, c, b, b, c, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices); g.computeVertexNormals(); return g;
  }

  return { NAMES, DESIGNS, LANE, laneCfg, terrainHeight, heightAt, slopeAt, surfaceWeights, terrainGeometry, GRID, STEP, laneWeight };
});
