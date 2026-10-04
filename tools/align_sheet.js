// tools/align_sheet.js - the head/body alignment sheet, so it can be SEEN, not argued about.
//
//     node tools/align_sheet.js        ->  tools/align_sheet.png
//
// Per class, 8 columns = the 8 views (S,SW,W,NW,N,NE,E,SE).  Rows 0-3 = the art as shipped in
// the review data (the owner's own head pivots); rows 4-7 = the same frames drawn the way the
// game's pack draws them (pack body cell + the pack's measured anchor).  It is how the pack's
// anchors were shown to seat the hair-head low and off on weapon frames, which is why the
// owner's own numbers are the standard.
//
// One block per class. Columns = the 8 views (S,SW,W,NW,N,NE,E,SE).
// Rows 0-3  = the page/game art as baked: body from the picker's crop, head at the owner's pivot.
// Rows 4-7  = what the game itself draws today: pack body cell, head at the pack's own anchor.
// Row pairs: idle frame 0, then attack frames 0,1,2.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { decodePNG, encodePNG, un64 } = require(path.join(__dirname, 'png_io.js'));
const ROOT = path.join(__dirname, '..');

const packSb = { window: {} }; vm.createContext(packSb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'sprite_pack_data.js'), 'utf8'), packSb);
const PK = packSb.window.SPRITE_PACK;
const pickSb = { window: {} }; vm.createContext(pickSb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'tools', 'sprite_picker_data.js'), 'utf8'), pickSb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'tools', 'sprite_picker_defaults.js'), 'utf8'), pickSb);
const D = pickSb.window.SPRITE_PICKER_DATA, DF = pickSb.window.SPRITE_PICKER_DEFAULTS;
const raw = fs.readFileSync(path.join(ROOT, 'tools', 'weapon_review_data.js'), 'utf8');
const R = JSON.parse(raw.slice(raw.indexOf('{')).replace(/;\s*$/, ''));
const HEAD = decodePNG(un64(PK.heads.male));
const cellCache = {};
const cellOf = c => cellCache[c] || (cellCache[c] = decodePNG(un64(R.cell[c])));

const Z = 2, T = 96, PITCH = T * Z + 4;
const CLASSES = ['Knight', 'Novice'];
const BLOCK_ROWS = 8;                                   // 4 baked + 4 game
const W = 8 * PITCH + 8, H = CLASSES.length * (BLOCK_ROWS * PITCH + 20) + 8;
const out = Buffer.alloc(W * H * 4, 0);
for (let i = 0; i < out.length; i += 4) { out[i] = 24; out[i + 1] = 26; out[i + 2] = 32; out[i + 3] = 255; }

function blit(sw, sp, sx, sy, tx, ty, tw, th) {          // nearest, zoom Z, alpha over
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const si = ((sy + y) * sw + (sx + x)) * 4, a = sp[si + 3];
    if (!a) continue;
    for (let zy = 0; zy < Z; zy++) for (let zx = 0; zx < Z; zx++) {
      const dx = tx + x * Z + zx, dy = ty + y * Z + zy;
      if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
      const di = (dy * W + dx) * 4, oa = out[di + 3];
      if (a === 255 || oa === 0) { out[di] = sp[si]; out[di + 1] = sp[si + 1]; out[di + 2] = sp[si + 2]; out[di + 3] = a; continue; }
      const f = a / 255, o = f + (oa / 255) * (1 - f);
      for (let k = 0; k < 3; k++) out[di + k] = Math.round((sp[si + k] * f + out[di + k] * (oa / 255) * (1 - f)) / o);
      out[di + 3] = Math.round(o * 255);
    }
  }
}
function over(dst, dw, src, sw, sx, sy, dx, dy, cw, ch) {
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const si = ((sy + y) * sw + (sx + x)) * 4, a = src[si + 3];
    if (!a) continue;
    const tx = dx + x, ty = dy + y;
    if (tx < 0 || ty < 0 || tx >= dw) continue;
    const di = (ty * dw + tx) * 4, oa = dst[di + 3];
    if (a === 255 || oa === 0) { dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; dst[di + 3] = a; continue; }
    const f = a / 255, o = f + (oa / 255) * (1 - f);
    for (let k = 0; k < 3; k++) dst[di + k] = Math.round((src[si + k] * f + dst[di + k] * (oa / 255) * (1 - f)) / o);
    dst[di + 3] = Math.round(o * 255);
  }
}

// the game's own rule: the class's own body if the pack has one, else its first-job line's
const LINE = { Novice: 'novice', Swordman: 'swordman', Knight: 'swordman', 'Lord Knight': 'swordman',
  Mage: 'mage', Wizard: 'mage', 'High Wizard': 'mage', Archer: 'archer', Hunter: 'archer',
  Sniper: 'archer', Thief: 'thief', Assassin: 'assassin', 'Assassin Cross': 'assassin_cross',
  Acolyte: 'aco', Priest: 'aco', 'High Priest': 'aco', Merchant: 'blacksmith',
  Blacksmith: 'blacksmith', Whitesmith: 'whitesmith' };
const packBodyName = c => String(c).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const PACK_BODY = new Proxy({}, { get: (_, c) => (PK.bodies[packBodyName(c)] ? packBodyName(c) : LINE[c]) });
const ROWS = [{ a: 0, f: 0 }, { a: 2, f: 0 }, { a: 2, f: 1 }, { a: 2, f: 2 }];
let by = 8;
for (const cls of CLASSES) {
  const body = PACK_BODY[cls] || cls.toLowerCase();
  const bat = decodePNG(un64(PK.bodies[body].atlas));
  const rev = cellOf(cls);
  for (let r = 0; r < ROWS.length; r++) {
    for (let v = 0; v < 8; v++) {
      const tx = 4 + v * PITCH;
      // baked: the review tile for (view v, frame = the row's frame)
      blit(rev.w, rev.px, ROWS[r].f * T, v * T, tx, by + r * PITCH, T, T);
      // game: pack body cell + the pack's own anchor
      const { a, f } = ROWS[r];
      const cell = Buffer.alloc(T * T * 4);
      for (let y = 0; y < T; y++) bat.px.copy(cell, y * T * 4,
        (((a * 8 + v) * T + y) * bat.w + f * T) * 4, (((a * 8 + v) * T + y) * bat.w + f * T + T) * 4);
      const an = PK.bodies[body].anchors[a][v][f];
      if (an) over(cell, T, HEAD.px, HEAD.w, v * 64, 0, an[0] - 32, an[1] - 48, 64, 64);
      blit(T, cell, 0, 0, tx, by + (r + 4) * PITCH, T, T);
    }
  }
  by += BLOCK_ROWS * PITCH + 20;
}
const buf = encodePNG(W, H, out, { rgb: true });
fs.writeFileSync(path.join(ROOT, 'tools', 'align_sheet.png'), buf);
console.log('wrote tools/align_sheet.png', W + 'x' + H);
console.log('per class: 8 columns = views S,SW,W,NW,N,NE,E,SE');
console.log('           rows 0-3 = baked page art (idle f0, attack f0,f1,f2)');
console.log('           rows 4-7 = the same, drawn by the GAME (pack cell + pack anchor)');
