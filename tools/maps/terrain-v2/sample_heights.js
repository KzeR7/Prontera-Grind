/* Dump height grids for the shipped v1 field and the v2 proposal, for the reviewer.
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
const v1 = require(path.join(root, 'assets/native-fields.js'));
const v2 = require(path.join(__dirname, 'prototype.js'));

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

const payload = {
  N, R, step,
  names: v1.NAMES,
  v1: { grids: grids((m, x, z) => v1.terrainHeight(m, x, z)), designs: v1.DESIGNS },
  v2: { grids: grids((m, x, z) => v2.terrainHeight(m, x, z)), designs: v2.DESIGNS, lane: v2.LANE }
};
fs.writeFileSync(out, JSON.stringify(payload));
console.log(`${out}: 10 x ${N}x${N} grids for v1 and v2`);
