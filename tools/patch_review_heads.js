// Re-seat the heads in the shipped review data - without Pillow.
//
// weapon_bake.py seats heads from the drawn-view pivots only, so the mirrored views (NE/E/SE)
// were baked with no head at all (found 2026-10-04, after the owner reported the heads). This
// composites the missing heads straight into tools/weapon_review_data.js using
// tools/head_seats.json, and rewrites the standalone twin.
//
//     node tools/head_seats.js         # first: refresh the pivots from the picker
//     node tools/patch_review_heads.js
//
// Rules kept from the bake: one 96x96 cell at a time (a head can never bleed into the frame
// beside it), the head atlas column is the view's own, the pivot is pasted at -(32,48), and
// only the class's `cell` payload is touched - every other byte of the data file survives.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { decodePNG, encodePNG, overAt, b64, un64 } = require('./png_io.js');
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'tools', 'weapon_review_data.js');
const SEATS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'head_seats.json'), 'utf8')).seats;
const BODY = 96;

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'sprite_pack_data.js'), 'utf8'), sandbox);
const atlas = decodePNG(un64(sandbox.window.SPRITE_PACK.heads.male));

function headTile(view) {                       // the 64x64 head for one view, hair 0
  const out = Buffer.alloc(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    atlas.px.copy(out, y * 64 * 4, (y * atlas.w + view * 64) * 4, (y * atlas.w + view * 64 + 64) * 4);
  return out;
}

const raw = fs.readFileSync(DATA, 'utf8');
const R = JSON.parse(raw.slice(raw.indexOf('{')).replace(/;\s*$/, ''));
const report = [], patchedGrid = {};
for (const cls of R.meta.classes) {
  const grid = decodePNG(un64(R.cell[cls]));
  patchedGrid[cls] = grid;                    // the sheet step must use THESE, not the old file
  if (grid.w !== 6 * BODY || grid.h !== 8 * BODY) throw new Error(cls + ': unexpected grid ' + grid.w + 'x' + grid.h);
  const row = { cls, added: 0, present: 0, views: [] };
  for (let v = 0; v < 8; v++) {
    const head = headTile(v);
    for (let f = 0; f < 6; f++) {
      const seat = SEATS[cls] && SEATS[cls][v] && SEATS[cls][v][f];
      if (!seat) continue;
      const dx = Math.round(seat[0]) - 32, dy = Math.round(seat[1]) - 48;
      const tile = Buffer.alloc(BODY * BODY * 4);
      for (let y = 0; y < BODY; y++)
        grid.px.copy(tile, y * BODY * 4, ((v * BODY + y) * grid.w + f * BODY) * 4,
                     ((v * BODY + y) * grid.w + f * BODY + BODY) * 4);
      // is the head already seated? fully-opaque head pixels land pixel-exact
      let hits = 0, n = 0;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const ai = (y * 64 + x) * 4;
        if (head[ai + 3] !== 255) continue;
        const tx = x + dx, ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= BODY || ty >= BODY) continue;
        n++;
        const ti = (ty * BODY + tx) * 4;
        if (head[ai] === tile[ti] && head[ai + 1] === tile[ti + 1] &&
            head[ai + 2] === tile[ti + 2] && head[ai + 3] === tile[ti + 3]) hits++;
      }
      if (n && hits / n > 0.9) { row.present++; continue; }
      overAt(tile, BODY, 64, 64, head, 64, dx, dy, BODY, BODY);
      for (let y = 0; y < BODY; y++)
        tile.copy(grid.px, ((v * BODY + y) * grid.w + f * BODY) * 4, y * BODY * 4, (y + 1) * BODY * 4);
      row.added++; if (!row.views.includes(v)) row.views.push(v);
    }
  }
  if (row.added) {
    const uri = b64(encodePNG(grid.w, grid.h, grid.px));
    const txt = fs.readFileSync(DATA, 'utf8');
    const at = txt.indexOf('"' + cls + '":"data:image/png;base64,', txt.indexOf('"cell":{'));
    if (at < 0) throw new Error('cannot find the cell payload for ' + cls + ' in the data file');
    const b0 = at + ('"' + cls + '":"data:image/png;base64,').length;
    const b1 = txt.indexOf('"', b0);
    fs.writeFileSync(DATA, txt.slice(0, b0) + uri.slice(uri.indexOf(',') + 1) + txt.slice(b1));
  }
  report.push(row);
}

const data = fs.readFileSync(DATA, 'utf8');
const page = fs.readFileSync(path.join(ROOT, 'tools', 'weapon_review.html'), 'utf8');
const tag = '<script src="weapon_review_data.js"></script>';
if (!page.includes(tag)) throw new Error('weapon_review.html no longer loads weapon_review_data.js');
fs.writeFileSync(path.join(ROOT, 'tools', 'weapon_review_standalone.html'),
  page.replace(tag, '<script>\n' + data.replace(/\n+$/, '') + '\n</script>', 1));

// ---------------------------------------------------------------- the contact sheet
// tools/preview_weapon.png was baked headless on the same views, so it gets the same fix. Its
// tiles are 2x nearest-neighbour cells with the weapon over the body, so a mirrored tile is
// rebuilt from the patched data (never just a head pasted on top - the weapon overlaps it).
const PROOF = path.join(ROOT, 'tools', 'preview_weapon.png');
let proofNote = 'tools/preview_weapon.png: not touched';
if (fs.existsSync(PROOF)) {
  const sheet = decodePNG(fs.readFileSync(PROOF));
  const WANT_W = 24 * 194, WANT_H = 19 * 212;                      // 8 views x 3 frames per row
  if (sheet.w !== WANT_W || sheet.h !== WANT_H) {
    proofNote = 'tools/preview_weapon.png: unexpected size ' + sheet.w + 'x' + sheet.h + ', left alone';
  } else {
    const tile = (cls, v, f) => {                                  // 96x96 RGBA, weapon over body
      const cell = patchedGrid[cls], wep = decodePNG(un64(R.weapon[cls]));
      const out = Buffer.alloc(BODY * BODY * 4), w = Buffer.alloc(BODY * BODY * 4);
      for (let y = 0; y < BODY; y++) {
        cell.px.copy(out, y * BODY * 4, ((v * BODY + y) * cell.w + f * BODY) * 4,
                     ((v * BODY + y) * cell.w + f * BODY + BODY) * 4);
        wep.px.copy(w, y * BODY * 4, ((v * BODY + y) * wep.w + f * BODY) * 4,
                    ((v * BODY + y) * wep.w + f * BODY + BODY) * 4);
      }
      overAt(out, BODY, BODY, BODY, w, BODY, 0, 0, BODY, BODY);
      return out;
    };
    const matchesSheet = (cls, i, v, f) => {                       // is the layout still the bake's?
      const t = tile(cls, v, f), X = 194 * (v * 3 + f / 2), Y = 212 * i + 16;
      let diff = 0;
      for (let y = 0; y < BODY * 2; y++) for (let x = 0; x < BODY * 2; x++) {
        const si = ((Y + y) * sheet.w + X + x) * 4, ti = ((y >> 1) * BODY + (x >> 1)) * 4;
        if (Math.abs(sheet.px[si] - t[ti]) > 24 || Math.abs(sheet.px[si + 1] - t[ti + 1]) > 24 ||
            Math.abs(sheet.px[si + 2] - t[ti + 2]) > 24) diff++;
      }
      return diff;
    };
    const cls0 = R.meta.classes[0], clsN = R.meta.classes[R.meta.classes.length - 1];
    const probe0 = matchesSheet(cls0, 0, 0, 0);
    const probeN = matchesSheet(clsN, R.meta.classes.length - 1, 2, 2);
    if (probe0 > 400 || probeN > 400) {
      proofNote = 'tools/preview_weapon.png: layout no longer matches the bake (' + probe0 + '/' +
                  probeN + ' px off) - regenerate it with `python3 tools/weapon_bake.py --proof`';
    } else {
      let n = 0;
      R.meta.classes.forEach((cls, i) => {
        for (const v of [5, 6, 7]) for (const j of [0, 1, 2]) {
          const t = tile(cls, v, j * 2), X = 194 * (v * 3 + j), Y = 212 * i + 16;
          for (let y = 0; y < BODY * 2; y++) for (let x = 0; x < BODY * 2; x++) {
            const si = ((Y + y) * sheet.w + X + x) * 4, ti = ((y >> 1) * BODY + (x >> 1)) * 4;
            sheet.px[si] = t[ti]; sheet.px[si + 1] = t[ti + 1]; sheet.px[si + 2] = t[ti + 2];
          }
          n++;
        }
      });
      fs.writeFileSync(PROOF, encodePNG(sheet.w, sheet.h, sheet.px, { rgb: true }));
      proofNote = 'tools/preview_weapon.png: ' + n + ' mirrored tiles rebuilt with their heads' +
                  ' (layout probe: ' + probe0 + '/' + probeN + ' px off)';
    }
  }
}

let a = 0, p = 0;
for (const r of report) {
  a += r.added; p += r.present;
  console.log(r.cls.padEnd(15) + String(r.added).padStart(4) + ' added' +
              String(r.present).padStart(6) + ' already seated   views ' + (r.views.join(',') || '-'));
}
console.log('\n' + a + ' heads composited, ' + p + ' were already seated' +
            '\nwrote tools/weapon_review_data.js and tools/weapon_review_standalone.html' +
            '\n' + proofNote);
