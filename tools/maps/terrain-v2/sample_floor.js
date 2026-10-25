/* Dump what the floor actually composes to, per field, for the reviewer.
 *
 *   node tools/maps/terrain-v2/sample_floor.js /tmp/floor.json [gridPoints]
 *
 * Per map: the surface weights and height the shipped module produces, at a coarse
 * grid, so the Python renderer can composite them with that map's REAL terrain.png
 * crops instead of a hardcoded palette. Dev-only; writes no repository files.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const F = require(path.join(root, 'assets/native-fields.js'));

const out = process.argv[2] || '/tmp/floor.json';
const N = Number(process.argv[3] || 200);
const R = 45, step = (2 * R) / (N - 1);

const maps = [];
for (let m = 0; m < 10; m++) {
  const height = [], grass = [], dirt = [], rock = [], beach = [], trail = [];
  const d = F.DESIGNS[m];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -R + i * step, z = -R + j * step;
    height.push(F.terrainHeight(m, x, z));
    const w = F.surfaceWeights(m, x, z);
    grass.push(w.grass); dirt.push(w.dirt); rock.push(w.rock); beach.push(w.beach);
    // the trail is painted separately in surface(); record its alpha
    const t = d.pathInfluence > 0 && d.trail
      ? Math.max(0, Math.min(1, (1 - (() => {
          const a = d.trail.width * 0.55, b = d.trail.width + 1.4;
          const e = Math.abs(x - F.trailCenter(m, z));
          const q = Math.max(0, Math.min(1, (e - a) / (b - a)));
          return q * q * (3 - 2 * q);
        })()) * 0.72 * d.pathInfluence))
      : 0;
    trail.push(t);
  }
  maps.push({
    name: F.NAMES[m], design: d.name, height, grass, dirt, rock, beach, trail,
    water: d.water, palette: d.palette || null
  });
}
fs.writeFileSync(out, JSON.stringify({ N, R, step, maps }));
console.log(`${out}: ${N}x${N} floor weights for ${maps.length} fields`);
