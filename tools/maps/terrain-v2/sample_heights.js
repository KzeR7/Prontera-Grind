/* Dump height grids for the v195 landform and the shipped v2 landform, for the reviewer.
 *
 *   node tools/maps/terrain-v2/sample_heights.js /tmp/heights.json [gridPoints]
 *
 * Dev-only: writes no repository files. The renderer
 * (tools/maps/terrain-v2/render_preview.py) reads its JSON.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const F = require(path.join(root, 'assets/native-fields.js'));

const out = process.argv[2] || '/tmp/heights.json';
const N = Number(process.argv[3] || 181);
const R = 45, step = (2 * R) / (N - 1);

const grids = (fn) => {
  const all = [];
  for (let m = 0; m < 10; m++) {
    const g = new Float64Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) g[j * N + i] = fn(m, -R + i * step, -R + j * step);
    all.push(Array.from(g));
  }
  return all;
};

// v1 = the v195 landform kept in the module as `legacyHeight`; v2 = the shipped default.
const payload = {
  N, R, step,
  names: F.NAMES,
  v1: { grids: grids((m, x, z) => F.legacyHeight(m, x, z)), designs: F.LEGACY },
  v2: { grids: grids((m, x, z) => F.terrainHeight(m, x, z)), designs: F.DESIGNS, lane: F.LANE }
};
fs.writeFileSync(out, JSON.stringify(payload));
console.log(`${out}: 10 x ${N}x${N} grids for v1 and v2`);
