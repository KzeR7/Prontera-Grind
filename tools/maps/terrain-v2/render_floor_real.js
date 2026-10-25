#!/usr/bin/env node
/* Render the REAL floor for all ten fields by running the shipping compositor.
 *
 *   node tools/maps/terrain-v2/render_floor_real.js [outDir]
 *
 * This does not re-implement the look. It stubs `document.createElement('canvas')`
 * with a real skia canvas (@napi-rs/canvas), then calls the game's own `build()` —
 * so the pixels are what `assets/native-fields.js` actually composes: the field's four
 * crops, the material masks, the trail, the ground detail and the per-field grade.
 *
 * Dev-only. Needs `three@0.128` and `@napi-rs/canvas` resolvable from the repo.
 * Writes docs/proposals/terrain-v2/board-floor-real.png and one PNG per field.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');

let THREE, createCanvas, loadImage;
try {
  THREE = require('three');
  ({ createCanvas, loadImage } = require('@napi-rs/canvas'));
} catch (e) {
  console.error('needs three@0.128 and @napi-rs/canvas: ' + e.message);
  process.exit(2);
}

// The module asks for `document.createElement('canvas')`; hand it a real one.
const real = [];
global.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error('unexpected element ' + tag);
    const c = createCanvas(1, 1);
    real.push(c);
    return c;
  }
};

const F = require(path.join(root, 'assets/native-fields.js'));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assets/native-fields/v1/catalog.json')));
const outDir = process.argv[2] || path.join(root, 'docs/proposals/terrain-v2');
const only = process.env.MAP ? [Number(process.env.MAP)] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
// TIERS=1 renders one destination across its four stage groups (1-3, 4-6, 7-9, 10-15)
// instead of one stage of every destination - that is the "is each 3 stages a different
// map?" check.
const TIERS = process.env.TIERS === '1';
const STAGES = TIERS ? [1, 5, 8, 12] : [Number(process.env.STAGE || 1)];

(async () => {
  const CELL = 400;
  const cols = TIERS ? 4 : 5, rows = Math.ceil((only.length * STAGES.length) / cols);
  const board = createCanvas(CELL * cols, CELL * rows + 28);
  const bg = board.getContext('2d');
  bg.fillStyle = '#101113';
  bg.fillRect(0, 0, board.width, board.height);
  bg.fillStyle = '#e8e8e8';
  bg.font = '13px sans-serif';
  bg.fillText(TIERS
    ? 'REAL FLOOR by stage group — stages 1-3 / 4-6 / 7-9 / 10-15 for one destination (shipping build())'
    : 'REAL FLOOR — pixels produced by the shipping build() (own tiles + material masks + detail + per-field grade)', 8, 18);

  let k = 0;
  for (const m of only) for (const stage of STAGES) {
    k++;
    const record = catalog.maps[m];
    const bytes = fs.readFileSync(path.join(root, 'assets/native-fields/v1', record.name, 'models.bin'));
    const vertices = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
    const atlasPng = await loadImage(path.join(root, 'assets/native-fields/v1', record.name, 'models.webp'));
    const terrainPng = await loadImage(path.join(root, 'assets/native-fields/v1', record.name, 'terrain.png'));

    // terrain/atlas are the decoded images the store would hand over
    const world = F.build(THREE, { record, vertices, terrain: terrainPng, atlas: atlasPng }, m, stage, { design: {} });
    const floor = world.floorMap.image;           // the 2048 canvas surface() returned
    const x = ((k - 1) % cols) * CELL, y = 26 + Math.floor((k - 1) / cols) * CELL;
    bg.drawImage(floor, x, y, CELL, CELL);
    fs.writeFileSync(path.join(outDir, `floor-${record.name}${TIERS ? '-st' + stage : ''}.png`), floor.toBuffer('image/png'));
    world.dispose();
    bg.fillStyle = 'rgba(0,0,0,.6)'; bg.fillRect(x, y + CELL - 20, CELL, 20);
    bg.fillStyle = '#e8e8e8'; bg.font = '12px sans-serif';
    bg.fillText(`${record.name} · ` + F.designLabel(m, stage), x + 8, y + CELL - 6);
    bg.font = '13px sans-serif';
    process.stdout.write(`${record.name}@${stage} `);
  }
  const file = path.join(outDir, TIERS ? `board-tiers-${only[0]}.png` : 'board-floor-real.png');
  fs.writeFileSync(file, board.toBuffer('image/png'));
  console.log('\nwrote ' + file);
})().catch(e => { console.error(e); process.exit(1); });
