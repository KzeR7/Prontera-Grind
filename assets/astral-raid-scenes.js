/* Rift Raid dungeon scenery (haven-v449).
 *
 * Four hand-authored arena layouts for the four raid stages, built from the same Astral visual
 * language as assets/astral-scenery.js: indigo space, floating stone, broken architecture, luminous
 * runes, restrained effects. It is a separate module on purpose - the raid must not change the
 * normal Astral field's progression, its route or its stage API.
 *
 * Every layout exposes the exact playable rectangle/circle that the authoritative engine validates
 * movement against (functions/_lib/raid-engine.js `STAGE_BOUNDS`). The scenery is drawn around those
 * numbers; it is never the authority.
 *
 * API
 *   PGAstralRaidScenes.STAGES                       // ordered stage keys
 *   PGAstralRaidScenes.build(key, {surfaces})       // -> world
 *   world.scene          THREE.Scene to mount
 *   world.bounds         {kind:'rect'|'circle', minX,maxX,minZ,maxZ} | {kind:'circle',x,z,r}
 *   world.update(seconds)// ambient animation (rings, motes)
 *   world.dispose()
 */
(function (root, factory) {
  // CommonJS (tests / tools) needs the factory applied here, not returned: the factory itself ends
  // with `return Object.freeze(...)`, so the browser global and Node export must both be the result.
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./endgame/three-r128.min.js'));
  else root.PGAstralRaidScenes = factory(root.THREE);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (THREE) {
  'use strict';
  if (!THREE) return null;

  const STAGES = Object.freeze(['approach', 'arcade', 'observatory', 'sanctuary']);
  const PALETTE = Object.freeze({
    space: 0x080e27, fog: 0x121d41,
    stone: 0x747e9a, trim: 0xb5b4ce, dark: 0x323e5a,
    cyan: 0x67dce5, violet: 0xa88fe5, deep: 0x1b2340,
    slab: [0x778298, 0x8993a7, 0x67768e, 0x9196a8, 0x728095, 0x858d9f, 0x777e95],
    warden: 0xffd9a0,
  });

  // Mirrors STAGE_BOUNDS in the engine. A mismatch is a client bug, not a gameplay choice.
  const BOUNDS = Object.freeze({
    approach: Object.freeze({ kind: 'rect', minX: -19, maxX: 19, minZ: -34, maxZ: 17 }),
    arcade: Object.freeze({ kind: 'rect', minX: -22, maxX: 22, minZ: -36, maxZ: 17 }),
    observatory: Object.freeze({ kind: 'circle', x: 0, z: 0, r: 21 }),
    sanctuary: Object.freeze({ kind: 'rect', minX: -24, maxX: 24, minZ: -26, maxZ: 22 }),
  });

  function random(seed) { return () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646; }
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  // ---------------------------------------------------------------- scaffold ----
  // One builder shared by every layout: the same geometry/material batching as the Astral field
  // (buffers for paving, instanced meshes for ruins) so the frames stay cheap on a phone.
  function scaffold(options) {
    const scene = new THREE.Scene();
    const scenery = new THREE.Group();
    scene.add(scenery);
    const geometries = new Set(), materials = new Set(), textures = new Set(), cache = new Map(), batches = new Map();
    const rnd = random(90210);
    const surfaces = options.surfaces || {};

    scene.background = new THREE.Color(PALETTE.space);
    // Was 0.011, tuned for a 31-deep arena. At that density the far half of a 78-deep hall is
    // more than half haze, which is exactly why the bigger map still felt small and grey.
    scene.fog = new THREE.FogExp2(PALETTE.fog, 0.0052);

    function textured(image) {
      if (!image) return null;
      const t = new THREE.Texture(image);
      t.needsUpdate = true;
      textures.add(t);
      return t;
    }
    const sky = textured(surfaces.space);
    if (sky) scene.background = sky;
    const stoneTexture = textured(surfaces.stone);
    if (stoneTexture) { stoneTexture.wrapS = stoneTexture.wrapT = THREE.RepeatWrapping; stoneTexture.anisotropy = 4; }

    function material(color, glow, useTexture) {
      const key = [color, glow ? 1 : 0, useTexture ? 1 : 0].join(':');
      if (cache.has(key)) return cache.get(key);
      const m = glow
        ? new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.92 })
        : new THREE.MeshStandardMaterial({
          color, roughness: 0.92, metalness: 0.12,
          map: useTexture ? stoneTexture : null, bumpMap: useTexture ? stoneTexture : null, bumpScale: 0.1,
        });
      materials.add(m);
      cache.set(key, m);
      return m;
    }

    const shapes = {
      box: new THREE.BoxGeometry(1, 1, 1),
      column: new THREE.CylinderGeometry(0.5, 0.55, 1, 12),
      shard: new THREE.IcosahedronGeometry(0.6, 0),
      chip: new THREE.TetrahedronGeometry(0.65),
      crystal: new THREE.OctahedronGeometry(0.5),
    };
    Object.values(shapes).forEach(g => geometries.add(g));

    const matrix = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = new THREE.Vector3(), quat = new THREE.Quaternion();
    function add(shape, color, x, y, z, w, h, d, rotation = 0, glow = false, category = 'ruins') {
      const key = [shape, color, glow ? 1 : 0, category].join(':');
      if (!batches.has(key)) batches.set(key, { shape, mat: material(color, glow), category, transforms: [] });
      pos.set(x, y, z);
      scale.set(w, h, d);
      quat.setFromEuler(new THREE.Euler(...(Array.isArray(rotation) ? rotation : [0, rotation, 0])));
      matrix.compose(pos, quat, scale);
      batches.get(key).transforms.push(matrix.clone());
    }

    function layer() {
      return {
        positions: [], colors: [], uvs: [],
        tri(a, b, c, color, uv) {
          const col = new THREE.Color(color);
          for (const [i, v] of [a, b, c].entries()) {
            this.positions.push(v[0], v[1], v[2]);
            this.colors.push(col.r, col.g, col.b);
            this.uvs.push(...(uv ? uv[i] : [v[0] / 6, v[2] / 6]));
          }
        },
      };
    }
    function finish(data, category, useTexture = false, glow = false) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
      geo.computeVertexNormals();
      // The hand-built layers do not agree on winding (a deck slab and an island shell are wound the
      // opposite way), so the surfaces are drawn from both sides. Normals are still computed, so the
      // lighting stays correct; the alternative was a floor that was invisible from above.
      const mat = glow
        ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ vertexColors: true, map: useTexture ? stoneTexture : null, roughness: 0.95, metalness: useTexture ? 0.03 : 0.2, side: THREE.DoubleSide });
      materials.add(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.category = category;
      mesh.receiveShadow = category === 'floor' || category === 'mosaic';
      geometries.add(geo);
      scenery.add(mesh);
      return mesh;
    }
    function stroke(data, points, width, color, y = 0.105) {
      for (let i = 1; i < points.length; i++) {
        const [x, z] = points[i - 1], [xx, zz] = points[i];
        const len = Math.hypot(xx - x, zz - z);
        if (!len) continue;
        const dx = (zz - z) / len * width / 2, dz = -(xx - x) / len * width / 2;
        data.tri([x + dx, y, z + dz], [xx - dx, y, zz - dz], [xx + dx, y, zz + dz], color);
        data.tri([x + dx, y, z + dz], [xx + dx, y, zz + dz], [x - dx, y, z - dz], color);
      }
    }
    // A slab deck: regular pavement tiles with a chipped corner and per-tile colour variation.
    function deck(data, rect, tile = 2.4) {
      const { minX, maxX, minZ, maxZ } = rect;
      let count = 0;
      for (let z = maxZ; z > minZ;) {
        const len = Math.min(tile * (0.82 + rnd() * 0.5), z - minZ);
        const next = z - len;
        for (let x = minX; x < maxX - 0.2;) {
          const w = Math.min(tile * (0.78 + rnd() * 0.6), maxX - x - 0.02);
          const right = x + w - 0.09, top = z - 0.09;
          const cx = (x + right) / 2, cz = (z + next) / 2, hw = (right - x) / 2, hd = (z - next) / 2;
          const cut = 0.06 + rnd() * 0.22, h = 0.062 + rnd() * 0.02;
          const color = PALETTE.slab[Math.floor(rnd() * PALETTE.slab.length)];
          const c = [[-hw + cut, -hd], [hw - cut * 0.6, -hd], [hw, -hd + cut], [hw, hd - cut * 0.7], [hw - cut, hd], [-hw + cut * 0.5, hd], [-hw, hd - cut], [-hw, -hd + cut * 0.5]];
          for (let i = 0; i < c.length; i++) {
            const j = (i + 1) % c.length;
            data.tri([cx + c[i][0], h, cz + c[i][1]], [cx, h, cz], [cx + c[j][0], h, cz + c[j][1]], color);
            // the visible joint between tiles
            const a = [cx + c[i][0], h, cz + c[i][1]], b = [cx + c[j][0], h, cz + c[j][1]];
            data.tri([a[0], 0.02, a[2]], [b[0], 0.02, b[2]], [a[0], h, a[2]], 0x3b4761);
            data.tri([b[0], 0.02, b[2]], [b[0], h, b[2]], [a[0], h, a[2]], 0x3b4761);
          }
          count++;
          x += w;
        }
        z = next;
      }
      return count;
    }
    function disc(data, cx, cz, r, rings = 9, color) {
      for (let ring = 0; ring < rings; ring++) {
        const r0 = r * ring / rings, r1 = r * (ring + 1) / rings;
        const steps = Math.max(18, Math.round(r1 * 12));
        for (let i = 0; i < steps; i++) {
          const a0 = i / steps * Math.PI * 2, a1 = (i + 1) / steps * Math.PI * 2;
          const jitter = 0.055 + rnd() * 0.02;
          const p = (rr, aa) => [cx + Math.cos(aa) * rr, jitter, cz + Math.sin(aa) * rr];
          const col = color || PALETTE.slab[Math.floor(rnd() * PALETTE.slab.length)];
          data.tri(p(r0, a0), p(r1, a1), p(r1, a0), col);
          if (ring) data.tri(p(r0, a0), p(r0, a1), p(r1, a1), col);
        }
      }
    }
    function ringStrip(data, cx, cz, r, width, color, start = 0, end = Math.PI * 2) {
      const pts = [];
      for (let i = 0; i <= 96; i++) {
        const a = start + (end - start) * i / 96;
        pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
      }
      stroke(data, pts, width, color, 0.108);
    }
    function pillar(x, z, h, broken = false) {
      add('column', PALETTE.stone, x, h / 2, z, 1.4, h, 1.4);
      for (let y = 1.1; y < h; y += 2.1) add('column', PALETTE.trim, x, y, z, 1.6, 0.12, 1.6);
      add('box', PALETTE.trim, x, h + 0.14, z, 2, 0.28, 2);
      add('box', PALETTE.cyan, x, h * 0.42, z + 0.72, 0.09, h * 0.4, 0.03, 0, true, 'rune');
      if (broken) {
        add('chip', 0xa1a6b5, x - 0.32, h + 0.36, z - 0.2, 0.62, 0.36, 0.72, [0.2, 0.4, 0.3]);
        add('box', PALETTE.dark, x + 0.3, h * 0.86, z + 0.6, 0.035, h * 0.2, 0.03);
      }
    }
    // A floating ruin outside the play area: the same eroded silhouette as the field's islands.
    function islet(x, top, z, rx, rz, depth, seed) {
      const rand = random(seed), n = 11, rings = [];
      const profile = Array.from({ length: n }, (_, i) => ({ a: i / n * Math.PI * 2 + rand() * 0.3, r: 0.74 + rand() * 0.32 }));
      for (let ring = 0; ring < 4; ring++) {
        rings.push(profile.map(({ a, r }) => {
          const taper = [1, 0.98, 0.72, 0.26][ring] * (0.92 + rand() * 0.16);
          const fall = [0, 0.13, 0.56, 1][ring];
          return [x + Math.cos(a) * rx * r * taper, top - depth * fall + (rand() - 0.5) * (ring ? 0.9 : 0.3), z + Math.sin(a) * rz * r * taper];
        }));
      }
      const inner = profile.map(({ a, r }) => [x + Math.cos(a) * rx * r * 0.45, top + 0.12 + rand() * 0.5, z + Math.sin(a) * rz * r * 0.45]);
      const summit = [x, top + 0.2 + rand() * 0.5, z];
      const data = layer();
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const col = i % 3 ? 0x687387 : 0x7d8694;
        data.tri(summit, inner[j], inner[i], col);
        data.tri(inner[i], inner[j], rings[0][j], col);
        for (let ring = 0; ring < 3; ring++) {
          const palette = ring === 0 ? [0x777f8c, 0x5d6a7e] : ring === 1 ? [0x49566c, 0x616a7d] : [0x35415a, 0x46516a];
          const c = palette[Math.floor(rand() * palette.length)];
          data.tri(rings[ring][i], rings[ring][j], rings[ring + 1][j], c);
          data.tri(rings[ring][i], rings[ring + 1][j], rings[ring + 1][i], c);
        }
        data.tri(rings[3][i], rings[3][j], [x, top - depth - 0.5, z], 0x303b53);
      }
      finish(data, 'island', true);
    }

    function lights(centerZ, tint = PALETTE.cyan) {
      scene.updateMatrixWorld(true);
      scene.add(new THREE.HemisphereLight(0xc8ddff, 0x2a2e4a, 0.55));
      const sun = new THREE.DirectionalLight(0xded7ff, 0.8);
      sun.position.set(-40, 96, centerZ + 34);
      sun.target.position.set(0, 0, centerZ);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      // The shadow camera has to cover the whole hall. It was a 42-unit square, which suited the
      // first-pass arena and left the far half of the enlarged one with no shadows at all.
      const span = 74;
      Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, far: 260 });
      sun.shadow.bias = -0.001;
      sun.shadow.normalBias = 0.16;
      scene.add(sun, sun.target);
      const light = new THREE.PointLight(tint, 0.55, 92, 2);
      light.position.set(0, 12, centerZ + 4);
      scene.add(light);
      const starRnd = random(1247);
      const stars = new Float32Array(360 * 3);
      for (let i = 0; i < 360; i++) {
        stars[i * 3] = (starRnd() - 0.5) * 260;
        stars[i * 3 + 1] = -20 + starRnd() * 90;
        stars[i * 3 + 2] = centerZ - 150 + starRnd() * 260;
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
      const starMat = new THREE.PointsMaterial({ color: 0xd1ddff, size: 0.15, transparent: true, opacity: 0.8, depthWrite: false });
      geometries.add(starGeo);
      materials.add(starMat);
      scene.add(new THREE.Points(starGeo, starMat));
    }

    function glowRing(x, y, z, r, color, tiltX = -Math.PI / 2) {
      const geo = new THREE.TorusGeometry(r, 0.06, 5, 90);
      const mesh = new THREE.Mesh(geo, material(color, true));
      mesh.rotation.x = tiltX;
      mesh.position.set(x, y, z);
      geometries.add(geo);
      scenery.add(mesh);
      return mesh;
    }
    function glowPlane(x, z, w, d, color) {
      const geo = new THREE.PlaneGeometry(w, d);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, toneMapped: false, depthWrite: false });
      materials.add(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.09, z);
      geometries.add(geo);
      scenery.add(mesh);
      return mesh;
    }

    return {
      scene, scenery, rnd, layer, finish, stroke, deck, disc, ringStrip, pillar, islet, lights, add,
      glowRing, glowPlane, material, geometries, materials, textures, batches, shapes, stoneTexture,
    };
  }

  // ---------------------------------------------------------------- layouts ----
  function layoutApproach(s) {
    // Derive the deck from BOUNDS instead of repeating the numbers. The two used to disagree: the
    // walkable rect grew while the floor stayed at its first-pass size, so the party could walk past
    // the edge of the bridge into empty space. One source now feeds both, and the taper below is a
    // ratio of the hall rather than a literal.
    const rect = { minX: BOUNDS.approach.minX, maxX: BOUNDS.approach.maxX, minZ: BOUNDS.approach.minZ, maxZ: BOUNDS.approach.maxZ };
    const width = rect.maxX - rect.minX, depth = rect.maxZ - rect.minZ;
    const paving = s.layer(), mosaic = s.layer(), inlay = s.layer(), runes = s.layer();
    // The bridge narrows toward Thanatos's sanctuary: full width at the entrance, 88% at the gate.
    const halfAt = z => (width / 2) - clamp((rect.maxZ - z) / depth, 0, 1) * (width * 0.062);
    for (let z = rect.maxZ; z > rect.minZ;) {
      const len = Math.min(2.6 + s.rnd() * 0.9, z - rect.minZ), next = z - len;
      const half = Math.min(halfAt(z), halfAt(next)) - 0.1;
      for (let x = -half; x < half - 0.3;) {
        const right = Math.min(half, x + 2.1 + s.rnd() * 0.9), w = right - x - 0.07, d = z - next - 0.07;
        const cx = (x + right) / 2, cz = (z + next) / 2, hw = w / 2, hd = d / 2;
        const color = PALETTE.slab[Math.floor(s.rnd() * PALETTE.slab.length)];
        const h = 0.066 + s.rnd() * 0.02;
        const cut = 0.07 + s.rnd() * 0.24;
        const c = [[-hw + cut, -hd], [hw - cut * 0.6, -hd], [hw, -hd + cut], [hw, hd - cut * 0.7], [hw - cut, hd], [-hw + cut * 0.5, hd], [-hw, hd - cut], [-hw, -hd + cut * 0.5]];
        for (let i = 0; i < c.length; i++) {
          const j = (i + 1) % c.length;
          paving.tri([cx + c[i][0], h, cz + c[i][1]], [cx + c[j][0], h, cz + c[j][1]], [cx, h, cz], color);
        }
        x = right;
      }
      z = next;
    }
    // Entrance and exit thresholds, plus a rune lane down the middle so the objective is legible.
    for (const [z, color] of [[9.4, PALETTE.cyan], [-18.6, PALETTE.violet]]) {
      s.ringStrip(inlay, 0, z, 3.1, 0.16, color);
      s.ringStrip(inlay, 0, z, 4.2, 0.07, 0x9aa2b4);
    }
    for (let z = 7; z > -18; z -= 3.1) {
      s.stroke(runes, [[-0.22, z], [0, z - 0.5], [0.22, z], [0, z + 0.5], [-0.22, z]], 0.045, 0xb6a98c, 0.104);
    }
    // Broken arches: three pairs, each missing its keystone on one side.
    for (const [z, h] of [[4.4, 5.2], [-6.2, 6.4], [-15.4, 4.6]]) {
      for (const side of [-1, 1]) {
        const x = side * (halfAt(z) + 1.9);
        s.pillar(x, z, h, true);
        for (let i = 0; i < (side === 1 ? 4 : 7); i++) {
          const a = i / 9 * Math.PI / 2;
          s.add('box', i % 3 ? PALETTE.stone : PALETTE.trim, x + side * 3.1 * Math.cos(a), h + Math.sin(a) * 3.2, z, 0.92, 0.82, 1.1, -side * a);
        }
      }
    }
    // Rubble along the margins keeps the fighting lane open but reads as collapse.
    for (let i = 0; i < 220; i++) {
      const z = (rect.maxZ - 1) - s.rnd() * (depth - 2), side = i % 2 ? 1 : -1;
      const x = side * (halfAt(z) - 0.5 - s.rnd() * 0.7);
      const h = 0.08 + s.rnd() * 0.26;
      s.add(i % 4 ? 'chip' : 'box', i % 3 ? PALETTE.stone : PALETTE.trim, x, h * 0.5 + 0.08, z, 0.14 + s.rnd() * 0.4, h, 0.2 + s.rnd() * 0.4, [s.rnd() * 0.3, s.rnd() * 6, s.rnd() * 0.2], false, 'rubble');
    }
    // Floating stone either side: the bridge is suspended over nothing.
    for (const [x, top, z, rx, rz, depth, seed] of [
      [-24, -3, 3, 6, 4.2, 7, 4111], [25, -6, -8, 5.4, 3.8, 8, 4127],
      [-26, -9, -16, 7.2, 5, 9, 4133], [23, -2, -22, 4.6, 3.4, 6, 4153],
    ]) s.islet(x, top, z, rx, rz, depth, seed);
    s.finish(paving, 'floor', true);
    s.finish(mosaic, 'mosaic', true);
    s.finish(inlay, 'engraving');
    s.finish(runes, 'rune', false, true);
    s.lights(-4, PALETTE.cyan);
    return { bounds: BOUNDS.approach, entrance: { x: 0, z: 14.4 }, exit: { x: 0, z: -31.6 } };
  }

  function layoutArcade(s) {
    const rect = { minX: BOUNDS.arcade.minX, maxX: BOUNDS.arcade.maxX, minZ: BOUNDS.arcade.minZ, maxZ: BOUNDS.arcade.maxZ };
    const paving = s.layer(), mosaic = s.layer(), inlay = s.layer(), runes = s.layer();
    s.deck(paving, rect, 2.5);
    // Two islands of ruin: this is a platform, not a corridor. Landmarks at the far corners.
    for (const side of [-1, 1]) {
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 4 - row; i++) {
          s.add('box', row % 2 ? PALETTE.stone : PALETTE.trim, side * (rect.maxX + 2.6 + i * 0.9), 0.4 + row * 0.62, rect.minZ + 4.6 + (i % 2) * 0.2, 1.2, 0.6, 1.3, 0.04);
        }
      }
      // A colonnade stumps out at the platform edge; the play area stays clear. The edge is derived
      // from the deck, so widening the hall moves the ruins out with it instead of leaving them
      // standing in the middle of the walkable floor.
      const edge = rect.maxX + 2.4;
      for (const z of [rect.maxZ - 8, 1.2, -5, -11.2, rect.minZ + 9]) s.pillar(side * edge, z, 2.4 + (Math.abs(z) % 3), z !== 1.2);
      s.add('column', 0x929baa, side * (edge - 0.3), 0.86, 3.4, 1.4, 3.5, 1.4, [Math.PI / 2, 0, 0.13], false, 'rubble');
      s.add('chip', PALETTE.stone, side * (edge - 0.6), 0.3, 5.6, 0.95, 0.5, 0.85, [0.3, 0.6, 0.2], false, 'rubble');
    }
    // Central aisle: two long inlaid bands pointing at the anchor plinths.
    for (const side of [-1, 1]) {
      s.stroke(inlay, [[side * 1.7, rect.maxZ - 3], [side * 1.7, rect.minZ + 2]], 0.3, 0x59677e);
      s.stroke(inlay, [[side * 1.7, rect.maxZ - 3], [side * 1.7, rect.minZ + 2]], 0.08, 0x98a0ae);
    }
    for (let z = rect.maxZ - 4; z > rect.minZ + 2; z -= 2.6) {
      s.stroke(inlay, [[-rect.maxX + 0.9, z], [-rect.maxX + 2.1, z]], 0.14, 0x8b8f99);
      s.stroke(inlay, [[rect.maxX - 2.1, z], [rect.maxX - 0.9, z]], 0.14, 0x8b8f99);
    }
    // Rift anchor plinths sit exactly where the engine spawns the two anchors.
    for (const side of [-1, 1]) {
      const x = side * 6.6;
      s.ringStrip(mosaic, x, -15.4, 2.6, 0.5, side === 1 ? 0x6f8097 : 0x495c78);
      s.ringStrip(runes, x, -15.4, 2.6, 0.12, PALETTE.violet);
      s.glowRing(x, 0.14, -15.4, 2.6, PALETTE.violet);
      s.add('box', PALETTE.dark, x, 0.42, -15.4, 2.3, 0.8, 2.3);
      s.add('box', 0x8b929d, x, 0.86, -15.4, 2.5, 0.16, 2.5);
      for (let j = 0; j < 3; j++) s.add('crystal', j === 1 ? 0x80bdcc : 0x787cad, x + (j - 1) * 0.42, 1.24 + j * 0.14, -15.4, 0.3, 0.9 + j * 0.24, 0.3, [0, j * 0.7, (j - 1) * 0.2], j === 1, 'relic');
    }
    // The gate out is a raised arch the whole party can see from anywhere on the platform.
    for (const side of [-1, 1]) s.pillar(side * 5.1, -20.2, 6.4, true);
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI;
      s.add('box', i % 3 ? PALETTE.stone : PALETTE.trim, -5.1 + 10.2 * (i / 8), 6.4 + Math.sin(a) * 2.6, -20.2, 1.1, 0.8, 1.2, 0);
    }
    s.ringStrip(inlay, 0, -19.4, 4.3, 0.18, PALETTE.cyan);
    for (const [x, top, z, rx, rz, depth, seed] of [
      [-30, -5, -6, 8, 6, 10, 4211], [31, -9, -14, 7, 5, 9, 4219], [0, -14, -34, 14, 8, 12, 4229],
    ]) s.islet(x, top, z, rx, rz, depth, seed);
    s.finish(paving, 'floor', true);
    s.finish(mosaic, 'mosaic', true);
    s.finish(inlay, 'engraving');
    s.finish(runes, 'rune', false, true);
    s.lights(-6, PALETTE.violet);
    return { bounds: BOUNDS.arcade, entrance: { x: 0, z: 14.2 }, exit: { x: 0, z: -33.4 }, anchors: [{ x: -11.4, z: -26.2 }, { x: 11.4, z: -26.2 }] };
  }

  function layoutObservatory(s) {
    const R = BOUNDS.observatory.r;
    const rect = { minX: -R, maxX: R, minZ: -R, maxZ: R };
    const paving = s.layer(), mosaic = s.layer(), inlay = s.layer(), runes = s.layer();
    s.disc(paving, 0, 0, R + 0.9, 11);
    // The astronomical instrument: rings, radial ticks and a ritual circle at the centre.
    s.ringStrip(inlay, 0, 0, R + 0.1, 0.22, 0x59677e);
    s.ringStrip(inlay, 0, 0, R - 0.5, 0.07, 0xb5a88e);
    s.ringStrip(mosaic, 0, 0, R * 0.752, 0.36, 0x4c627d);
    s.ringStrip(mosaic, 0, 0, R * 0.448, 0.3, 0x79879b);
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2, r0 = R * 0.496, r1 = i % 3 ? R * 0.688 : R * 0.736;
      s.stroke(inlay, [[Math.cos(a) * r0, Math.sin(a) * r0], [Math.cos(a) * r1, Math.sin(a) * r1]], 0.09, 0x9aa2b4);
      if (i % 2 === 0) s.stroke(runes, [[Math.cos(a) * 4.6, Math.sin(a) * 4.6], [Math.cos(a) * 5.2, Math.sin(a) * 5.2]], 0.1, 0x8fd7e0);
    }
    for (const tilt of [-0.52, 0.52]) {
      const pts = [];
      for (let i = 0; i <= 96; i++) {
        const a = i * Math.PI / 48, x = Math.cos(a) * 8.4, z = Math.sin(a) * 3.9;
        pts.push([x * Math.cos(tilt) - z * Math.sin(tilt), x * Math.sin(tilt) + z * Math.cos(tilt)]);
      }
      s.stroke(inlay, pts, 0.15, 0xa4a9ad);
    }
    // The ritual plinths: exactly the two source positions the engine spawns.
    for (const [x, z] of [[-6.4, -5.2], [6.2, -5.6]]) {
      s.ringStrip(mosaic, x, z, 2.1, 0.42, 0x495c78);
      s.ringStrip(runes, x, z, 2.1, 0.12, PALETTE.violet);
      s.glowRing(x, 0.14, z, 2.1, PALETTE.violet);
      s.add('box', PALETTE.dark, x, 0.36, z, 1.9, 0.66, 1.9);
      s.add('box', 0x8b929d, x, 0.72, z, 2.1, 0.14, 2.1);
    }
    // Edge monoliths with floating rings; they frame the circle without blocking it.
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8, x = Math.cos(a) * 15.6, z = Math.sin(a) * 15.6;
      s.pillar(x, z, 4.4 + (i % 3) * 1.6, i % 2 === 1);
      s.add('box', PALETTE.cyan, x, 2.4, z, 0.09, 1.4, 0.03, 0, true, 'rune');
    }
    const armillary = s.glowRing(0, 9.4, -1.4, 7.4, PALETTE.violet);
    armillary.rotation.y = 0.45;
    const armillary2 = s.glowRing(0, 9.4, -1.4, 5.2, PALETTE.cyan);
    armillary2.rotation.x = 0.6;
    for (const [x, top, z, rx, rz, depth, seed] of [
      [-26, -7, 5, 6.4, 4.6, 8, 4311], [27, -4, -3, 5.6, 4.4, 7, 4327], [4, -11, -30, 12, 7, 11, 4337],
    ]) s.islet(x, top, z, rx, rz, depth, seed);
    s.finish(paving, 'floor', true);
    s.finish(mosaic, 'mosaic', true);
    s.finish(inlay, 'engraving');
    s.finish(runes, 'rune', false, true);
    s.lights(0, PALETTE.cyan);
    return {
      bounds: BOUNDS.observatory, entrance: { x: 0, z: 18.2 }, exit: { x: 0, z: -18.2 },
      armillary: [armillary, armillary2],
    };
  }

  function layoutSanctuary(s) {
    const rect = { minX: BOUNDS.sanctuary.minX, maxX: BOUNDS.sanctuary.maxX, minZ: BOUNDS.sanctuary.minZ, maxZ: BOUNDS.sanctuary.maxZ };
    const paving = s.layer(), mosaic = s.layer(), inlay = s.layer(), runes = s.layer();
    s.deck(paving, rect, 2.6);
    // The boss dais and its seal: broad, flat, and completely walkable.
    s.ringStrip(mosaic, 0, -8.4, 7.6, 0.6, 0x495c78);
    s.ringStrip(inlay, 0, -8.4, 8.2, 0.16, 0x9aa2b4);
    s.ringStrip(runes, 0, -8.4, 9.4, 0.1, PALETTE.violet);
    s.glowRing(0, 0.13, -8.4, 7.6, PALETTE.violet);
    const constellation = [[-5, -10], [-2, -4], [4, -6], [6, -12], [0, -15], [-5, -10], [4, -6]];
    s.stroke(runes, constellation, 0.045, 0x7bafc9, 0.11);
    for (const [x, z] of constellation) s.ringStrip(runes, x, z, 0.2, 0.1, 0xb4e2df);
    // Seven shattered pillars around the rim: the arena is a place where something large died.
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + 0.4;
      const x = Math.cos(a) * 16.4, z = -3 + Math.sin(a) * 15.2;
      s.pillar(x, z, 3.2 + (i % 4) * 1.7, true);
    }
    for (const side of [-1, 1]) {
      for (let row = 0; row < 4; row++) {
        for (let i = 0; i < 4 - row; i++) {
          s.add('box', row % 2 ? PALETTE.stone : PALETTE.trim, side * (16.6 + i * 0.85), 0.4 + row * 0.6, 6 - row * 0.2, 1.1, 0.55, 1.2, 0.05);
        }
      }
    }
    // Two long inlays lead from the entrance to the dais so both teammates read the same approach.
    for (const side of [-1, 1]) {
      s.stroke(inlay, [[side * 2.2, 11.4], [side * 2.2, -1.4]], 0.22, 0x59677e);
      s.stroke(inlay, [[side * 7.4, 8.2], [side * 7.4, -2]], 0.14, 0x4b596d);
    }
    for (const [x, z] of [[-11, -12.4], [11, -12.4], [-12.6, 9.4], [12.6, 9.4]]) {
      s.add('column', 0x929baa, x, 0.8, z, 1.35, 3.3, 1.35, [Math.PI / 2, 0, 0.12], false, 'rubble');
    }
    for (const [x, top, z, rx, rz, depth, seed] of [
      [-27, -8, -4, 7.4, 5.2, 10, 4411], [28, -5, -12, 6.6, 4.8, 9, 4421],
      [0, -16, -32, 16, 9, 13, 4423], [-16, -12, 12, 5.6, 4.2, 7, 4441],
    ]) s.islet(x, top, z, rx, rz, depth, seed);
    s.finish(paving, 'floor', true);
    s.finish(mosaic, 'mosaic', true);
    s.finish(inlay, 'engraving');
    s.finish(runes, 'rune', false, true);
    s.lights(-4, PALETTE.violet);
    const seal = s.glowPlane(0, -8.4, 15, 15, PALETTE.violet);
    return { bounds: BOUNDS.sanctuary, entrance: { x: 0, z: 19.2 }, exit: { x: 0, z: -22.8 }, seal };
  }

  const LAYOUTS = { approach: layoutApproach, arcade: layoutArcade, observatory: layoutObservatory, sanctuary: layoutSanctuary };

  function build(stageKey, options = {}) {
    const layout = LAYOUTS[stageKey];
    if (!layout) throw new RangeError('Unknown raid stage: ' + stageKey);
    const s = scaffold(options);
    const detail = layout(s);
    for (const batch of s.batches.values()) {
      const mesh = new THREE.InstancedMesh(s.shapes[batch.shape], batch.mat, batch.transforms.length);
      batch.transforms.forEach((t, i) => mesh.setMatrixAt(i, t));
      mesh.userData.category = batch.category;
      mesh.receiveShadow = true;
      mesh.castShadow = batch.category === 'ruins';
      s.scenery.add(mesh);
    }
    let disposed = false, seconds = 0;
    return {
      scene: s.scene,
      scenery: s.scenery,
      kind: 'raid',
      stage: stageKey,
      bounds: detail.bounds,
      entrance: detail.entrance,
      exit: detail.exit,
      anchors: detail.anchors || null,
      update(sec) {
        if (disposed) return;
        seconds = Number.isFinite(sec) ? sec : seconds;
        if (detail.armillary) {
          detail.armillary[0].rotation.z = seconds * 0.03;
          detail.armillary[1].rotation.z = -seconds * 0.045;
        }
        if (detail.seal) detail.seal.material.opacity = 0.1 + Math.sin(seconds * 1.6) * 0.04;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        s.geometries.forEach(g => g.dispose());
        s.materials.forEach(m => m.dispose());
        s.textures.forEach(t => t.dispose());
        s.scene.clear();
      },
      stats() {
        let instances = 0, triangles = 0;
        s.scenery.traverse(o => {
          if (o.isInstancedMesh) instances += o.count;
          if (o.geometry) triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
        });
        return { instances, batches: s.batches.size, triangles: Math.round(triangles) };
      },
    };
  }

  return Object.freeze({ STAGES, BOUNDS, PALETTE, build });
});
