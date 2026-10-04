// tools/anim_bake.js - turn a selection from the SIMPLE picker into the game's art.
//
//     node tools/anim_bake.js                        # the shipped standard (tools/anim_picker_data.js)
//     node tools/anim_bake.js tools/anim_selection.json    # what the owner pasted back
//     node tools/anim_bake.js --preview-only         # just re-render the contact sheet
//
// It writes:
//   tools/anim_preview.png   every class, all 10 cells, body + head composed exactly as the game
//                            will draw them (a 2x contact sheet for the eye)
//   tools/anim_pack_data.js  window.ANIM_PACK - the game artifact: ten 96x96 body cells per class
//                            (one atlas row) + the head pivot for each cell
//
// No Pillow here, so the sheet PNGs (8-bit palette, colour type 3) are decoded in tools/png_io.js.
// The crop maths is the picker's and the pack builder's, to the pixel:
//     scale = min(1, 90/w, 88/h)   w2 = round(w*scale)   ox = floor((96-w2)/2)   oy = 90 - h2
//     body at (ox, oy)             head at (round(pivotX)-32, round(pivotY)-48)
// tools/tests/anim_picker_sim.js pins this against the real pack (PIL-built) cells.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { decodePNG, encodePNG, un64 } = require(path.join(__dirname, 'png_io.js'));
const ROOT = path.join(__dirname, '..');

const BODY = 96, FEET = 90, CELLS = ['atkF0', 'atkF1', 'atkB0', 'atkB1', 'walkF0', 'walkF1', 'walkF2', 'walkB0', 'walkB1', 'walkB2'];
const KEYS = [['atkF', 0], ['atkF', 1], ['atkB', 0], ['atkB', 1], ['walkF', 0], ['walkF', 1], ['walkF', 2], ['walkB', 0], ['walkB', 1], ['walkB', 2]];

function loadJs(file, key) {
  const sb = { window: {} }; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sb);
  return sb.window[key];
}
const A = loadJs('tools/anim_picker_data.js', 'ANIM_PICKER_DATA');
const D = loadJs('tools/sprite_picker_data.js', 'SPRITE_PICKER_DATA');

const args = process.argv.slice(2);
const previewOnly = args.includes('--preview-only');
const payloadPath = args.find(a => !a.startsWith('--'));
let payload = null;
if (payloadPath) {
  payload = JSON.parse(fs.readFileSync(path.resolve(ROOT, payloadPath), 'utf8'));
  console.log('selection: ' + payloadPath + (payload.kind ? ' (' + payload.kind + ')' : ''));
} else if (fs.existsSync(path.join(ROOT, 'tools', 'anim_selection.json'))) {
  payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'anim_selection.json'), 'utf8'));
  console.log('selection: tools/anim_selection.json');
} else {
  console.log('selection: the shipped standard in tools/anim_picker_data.js');
}

// ---------------------------------------------------------------- the geometry (shared rules)
function cropOf(p) {
  const s = Math.min(1, 90 / p.w, 88 / p.h);
  const w = Math.max(1, Math.round(p.w * s)), h = Math.max(1, Math.round(p.h * s));
  return { s, w, h, ox: Math.floor((BODY - w) / 2), oy: FEET - h };
}
function blitNearest(sheet, p, dst, dw) {                 // the crop, nearest-scaled, into the cell
  const c = cropOf(p);
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const sx = p.x + Math.min(p.w - 1, Math.floor((x + 0.5) / c.s)), sy = p.y + Math.min(p.h - 1, Math.floor((y + 0.5) / c.s));
    const si = (sy * sheet.w + sx) * 4, di = ((c.oy + y) * dw + c.ox + x) * 4, a = sheet.px[si + 3];
    if (!a) continue;
    dst[di] = sheet.px[si]; dst[di + 1] = sheet.px[si + 1]; dst[di + 2] = sheet.px[si + 2]; dst[di + 3] = a;
  }
  return c;
}
function over(dst, dw, head, hx, hy, dir, hair) {         // the head tile, alpha over
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const si = ((hair * 64 + y) * head.w + dir * 64 + x) * 4, sa = head.px[si + 3];
    if (!sa) continue;
    const tx = hx + x, ty = hy + y;
    if (tx < 0 || ty < 0 || tx >= dw || ty >= BODY) continue;
    const di = (ty * dw + tx) * 4, oa = dst[di + 3];
    if (sa === 255 || oa === 0) { dst[di] = head.px[si]; dst[di + 1] = head.px[si + 1]; dst[di + 2] = head.px[si + 2]; dst[di + 3] = sa; continue; }
    const f = sa / 255, o = f + (oa / 255) * (1 - f);
    for (let k = 0; k < 3; k++) dst[di + k] = Math.round((head.px[si + k] * f + dst[di + k] * (oa / 255) * (1 - f)) / o);
    dst[di + 3] = Math.round(o * 255);
  }
}
// the selection for one class: from the payload when given, else the shipped defaults
function cellsFor(cls) {
  if (payload) {
    const rows = payload.anim[cls];
    if (!rows) throw new Error('the selection has no ' + cls);
    return KEYS.map(([grp, i]) => {
      const r = rows[grp][i];
      if (!r) throw new Error('the selection is missing ' + cls + ' ' + grp + '#' + i);
      return { grp, i, x: r[0], y: r[1], w: r[2], h: r[3], pivot: [r[4], r[5]], pose: r[6], src: r[7] };
    });
  }
  const c = A.classes[cls].cells;
  return KEYS.map(([grp, i]) => {
    const cell = c[grp][i], p = D.classes[cls].poses[cell.p];
    return { grp, i, x: p.x, y: p.y, w: p.w, h: p.h, pivot: [cell.pivot[0], cell.pivot[1]], pose: cell.p, src: cell.src };
  });
}

// ---------------------------------------------------------------- render every class
const HEAD = decodePNG(un64(A.pack.heads.male));
const sheets = {};
const sheetFor = cls => sheets[cls] || (sheets[cls] = decodePNG(fs.readFileSync(path.join(ROOT, D.classes[cls].file))));
const Z = 2, PITCH = BODY * Z + 4, GAPY = 6;
const classes = A.meta.classes;
const tilesW = 10 * PITCH + 4, tilesH = classes.length * (BODY * Z + GAPY) + GAPY;
const sheet = Buffer.alloc(tilesW * tilesH * 4, 0);
for (let i = 0; i < sheet.length; i += 4) { sheet[i] = 24; sheet[i + 1] = 26; sheet[i + 2] = 32; sheet[i + 3] = 255; }
const packOut = { meta: { cell: BODY, feet: FEET, order: CELLS, classes: classes,
  viewMap: A.meta.viewMap, source: 'tools/anim_bake.js', note: A.meta.note }, classes: {} };
const report = { yours: 0, pack: 0, measured: 0, check: [], manual: [], offgrid: [], cells: 0 };

for (let ci = 0; ci < classes.length; ci++) {
  const cls = classes[ci], im = sheetFor(cls), row = [];
  const atlas = Buffer.alloc(BODY * CELLS.length * BODY * 4);            // 10 cells in one row
  const anchors = [];
  const cells = cellsFor(cls);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i], p = D.classes[cls].poses[c.pose];
    const tmp = Buffer.alloc(BODY * BODY * 4);
    if (p) blitNearest(im, p, tmp, BODY);
    else blitNearest(im, { x: c.x, y: c.y, w: c.w, h: c.h }, tmp, BODY);
    const hx = Math.round(c.pivot[0]) - 32, hy = Math.round(c.pivot[1]) - 48;
    over(tmp, BODY, HEAD, hx, hy, KEYS[i][0] === 'atkF' || KEYS[i][0] === 'walkF' ? 0 : 4, 0);
    // into the class atlas
    for (let y = 0; y < BODY; y++) tmp.copy(atlas, (y * BODY) * 4 + i * BODY * BODY * 4 * 0 + (i * BODY) * 4 + y * BODY * BODY * 4);
    // ... and into the contact sheet at 2x
    const tx = 4 + i * PITCH, ty = GAPY + ci * (BODY * Z + GAPY);
    for (let y = 0; y < BODY; y++) for (let x = 0; x < BODY; x++) {
      const si = (y * BODY + x) * 4, a = tmp[si + 3];
      if (!a) continue;
      for (let zy = 0; zy < Z; zy++) for (let zx = 0; zx < Z; zx++) {
        const di = ((ty + y * Z + zy) * tilesW + tx + x * Z + zx) * 4;
        const f = a / 255, o = f + (sheet[di + 3] / 255) * (1 - f);
        for (let k = 0; k < 3; k++) sheet[di + k] = Math.round((tmp[si + k] * f + sheet[di + k] * (sheet[di + 3] / 255) * (1 - f)) / o);
        sheet[di + 3] = 255;
      }
    }
    anchors.push([Math.round(c.pivot[0]), Math.round(c.pivot[1])]);
    row.push(Buffer.from(tmp));
    report.cells++;
    if (report[c.src] !== undefined) report[c.src]++;
    else if (c.src === 'manual') report.manual.push(cls + ' ' + CELLS[i]);
    if (c.src === 'check') report.check.push(cls + ' ' + CELLS[i]);
    if (c.pivot[0] < -32 || c.pivot[0] > 128 || c.pivot[1] < -48 || c.pivot[1] > 144) report.offgrid.push(cls + ' ' + CELLS[i]);
  }
  // the atlas row: 96x96 cells side by side
  const atlasRow = Buffer.alloc(BODY * CELLS.length * BODY * 4);
  for (let i = 0; i < CELLS.length; i++) for (let y = 0; y < BODY; y++)
    row[i].copy(atlasRow, (y * CELLS.length + i) * BODY * 4, y * BODY * 4, (y + 1) * BODY * 4);
  packOut.classes[cls] = { atlas: 'data:image/png;base64,' + encodePNG(BODY * CELLS.length, BODY, atlasRow).toString('base64'), anchors };
}
const png = encodePNG(tilesW, tilesH, sheet, { rgb: true });
fs.writeFileSync(path.join(ROOT, 'tools', 'anim_preview.png'), png);
console.log('wrote tools/anim_preview.png  (' + tilesW + 'x' + tilesH + ', ' + classes.length + ' classes x 10 cells at 2x)');
console.log('  columns: ' + CELLS.join(' '));
if (previewOnly) { console.log('  (--preview-only: the game artifact was not written)'); }
else {
  const js = '// Attack 2 frames / walk 3 frames, front + back - the SIMPLE set, baked by tools/anim_bake.js.\n' +
    '// Per class: one 960x96 atlas (ten 96x96 cells, see meta.order) + the head pivot for each cell,\n' +
    '// both in the same 96x96 space the picker uses (feet at x48,y90).\n' +
    'window.ANIM_PACK=' + JSON.stringify(packOut) + ';\n';
  fs.writeFileSync(path.join(ROOT, 'tools', 'anim_pack_data.js'), js);
  console.log('wrote tools/anim_pack_data.js  (' + (js.length / 1e6).toFixed(2) + ' MB, ' + classes.length + ' class atlases)');
}
console.log('cells: ' + report.cells + '   heads from the owner: ' + report.yours + '   from the pack: ' + report.pack +
  '   measured: ' + report.measured + '   dragged in the picker: ' + report.manual.length +
  '   to check: ' + report.check.length);
if (report.manual.length) console.log('  dragged: ' + report.manual.join(', '));
if (report.check.length) console.log('  CHECK (the head number for these was estimated): ' + report.check.join(', '));
if (report.offgrid.length) console.log('  OUT OF CELL: ' + report.offgrid.join(', '));
module.exports = { cropOf, blitNearest, over, cellsFor, CELLS, KEYS, BODY, FEET, A, D };
