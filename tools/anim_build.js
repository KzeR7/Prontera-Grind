// tools/anim_build.js - build the data behind the SIMPLE animation picker.
//
// The picker the owner asked for on 2026-10-04: attack = 2 frames, walk = 3 frames, front and
// back only, no standing pose.  Ten cells per class:
//
//     atkF 0,1   atkB 0,1     walkF 0,1,2   walkB 0,1,2
//
// "front" is the sheet's S row (dir 0), "back" is its N row (dir 4).  Nothing is mirrored and
// there are no other directions, so there is no mirror maths anywhere in this pipeline.
//
//     node tools/anim_build.js            ->  tools/anim_picker_data.js
//
// Defaults, in the order of who knows best:
//   * attack cells - the OWNER's own tuning pass (tools/attack_selection.json via
//     sprite_picker_defaults.js): their view-0 picks for the front frames and their view-4 picks
//     for the back frames, first two DISTINCT poses in their own order, each carrying the exact
//     pivot they set.  Nothing is re-measured.
//   * walk cells - the pose's own measured stub seat when the measurer found the head stub
//     (`seat[2] === 'stub'`); the pack's own anchor when the picked pose IS the pack's figure for
//     that frame (the number the game seats with today); and otherwise the seat with `src:'check'`,
//     which the page flags so a guessed head cannot slip through unnoticed.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

function loadJs(file, windowKey) {
  const sb = { window: {} };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sb);
  return sb.window[windowKey];
}
const D = loadJs('tools/sprite_picker_data.js', 'SPRITE_PICKER_DATA');
const DF = loadJs('tools/sprite_picker_defaults.js', 'SPRITE_PICKER_DEFAULTS');
const PK = loadJs('assets/sprite_pack_data.js', 'SPRITE_PACK');

const LINE = { Novice: 'novice', Swordman: 'swordman', Knight: 'swordman', 'Lord Knight': 'swordman',
  Mage: 'mage', Wizard: 'mage', 'High Wizard': 'mage', Archer: 'archer', Hunter: 'archer',
  Sniper: 'archer', Thief: 'thief', Assassin: 'assassin', 'Assassin Cross': 'assassin_cross',
  Acolyte: 'aco', Priest: 'aco', 'High Priest': 'aco', Merchant: 'blacksmith',
  Blacksmith: 'blacksmith', Whitesmith: 'whitesmith' };
const packBodyName = c => String(c).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const packBodyFor = c => (PK.bodies[packBodyName(c)] ? packBodyName(c) : LINE[c]);

const BODY = 96, FEET = 90, LIM_W = 90, LIM_H = 88;
function cropOf(p) {                                    // exactly the page's + the pack's rule
  const s = Math.min(1, LIM_W / p.w, LIM_H / p.h);
  const w = Math.max(1, Math.round(p.w * s)), h = Math.max(1, Math.round(p.h * s));
  return { s, w, h, ox: Math.floor((BODY - w) / 2), oy: FEET - h };
}
function stubSeat(p) {                                  // the pose's own measured seat, in cell px
  const c = cropOf(p);
  return [c.ox + Math.round((p.seat ? p.seat[0] : c.w / 2) * c.s),
          c.oy + Math.round((p.seat ? p.seat[1] : 0) * c.s)];
}

const GROUPS = [['atkF', 2, 0, 'Attack'], ['atkB', 2, 4, 'Attack'],
                ['walkF', 3, 0, 'Walk'], ['walkB', 3, 4, 'Walk']];

const out = { classes: {} }, flags = { check: [], yours: 0, pack: 0, measured: 0 };
for (const cls of Object.keys(D.classes)) {
  const poses = D.classes[cls].poses;
  const body = packBodyFor(cls);
  const anchors = (PK.bodies[body] || {}).anchors;
  const cells = {}, cand = {};
  for (const [grp, n, dir] of GROUPS) {
    const walk = grp[0] === 'w';
    const rowIds = poses.map((p, i) => i).filter(i => walk ? (poses[i].anim === 1 && poses[i].dir === dir)
                                                          : (poses[i].anim === 2 && poses[i].dir === dir));
    const rowFrames = rowIds.slice().sort((a, b) => poses[a].frame - poses[b].frame);
    // ---- the default picks
    let picked = [];
    if (walk) {
      const idx = [0, 2, 4].map(i => Math.min(rowFrames.length - 1, i));       // frames 0,2,4 of the row
      if (rowFrames.length < n) throw new Error(cls + ' ' + grp + ': only ' + rowFrames.length + ' walk frames');
      picked = [...new Set(idx.map(i => rowFrames[i]))];
      while (picked.length < n) picked.push(rowFrames[picked.length]);         // a short row still fills
    } else {
      const theirs = ((DF.attack[cls] || {})[String(dir)] || []).filter(id => id != null);
      for (const id of theirs) if (!picked.includes(id)) picked.push(id);      // their order, distinct
      for (const id of rowFrames) if (picked.length < n && !picked.includes(id)) picked.push(id);
      picked = picked.slice(0, n);
    }
    // ---- the default pivot for each pick, and where it comes from
    const list = [];
    for (let i = 0; i < n; i++) {
      const id = picked[i], p = poses[id];
      let pivot = null, src = '';
      if (!walk) {
        const theirs = ((DF.attack[cls] || {})[String(dir)] || []);
        const f = theirs.indexOf(id);                                          // the frame they tuned it on
        const theirsAll = theirs.reduce((acc, x, k) => (x === id && acc < 0 ? k : acc), -1);
        const at = theirsAll >= 0 ? theirsAll : f;
        const pv = at >= 0 ? DF.head[cls + '|' + dir + '|' + at] : null;
        if (pv) { pivot = pv.slice(); src = 'yours'; flags.yours++; }
      }
      if (!pivot) {
        const an = (anchors && anchors[1] && anchors[1][dir] && p.anim === 1 && p.dir === dir && p.frame != null)
          ? anchors[1][dir][p.frame] : null;
        if (an) { pivot = an.slice(); src = 'pack'; flags.pack++; }
        else if (p.seat && p.seat[2] === 'stub') { pivot = stubSeat(p); src = 'measured'; flags.measured++; }
        else { pivot = stubSeat(p); src = 'check'; flags.check.push(cls + ' ' + grp + '#' + i); }
      }
      list.push({ p: id, pivot, src });
    }
    cells[grp] = list;
    // ---- candidates: the relevant row first (so < > walks the cycle), everything else after
    const rest = poses.map((p, i) => i).filter(i => !rowFrames.includes(i));
    cand[grp] = [...new Set([...(walk ? rowFrames : ((DF.attack[cls] || {})[String(dir)] || []).filter(x => x != null)), ...rowFrames, ...rest])];
  }
  out.classes[cls] = { file: D.classes[cls].file, body, cells, cand };
}

// ---- the light pack: the head atlases (the page must draw heads), the walk/attack anchors it
// needs (19 bodies x dirs 0/4 x 3 anims), and the owner's own pivot per attack pose - so the page
// is self-sufficient without loading the 5.8 MB sprite pack.
const lightAnchors = {};
for (const cls of Object.keys(D.classes)) {
  const body = packBodyFor(cls), anchors = (PK.bodies[body] || {}).anchors;
  if (!anchors) continue;
  lightAnchors[body] = {};
  for (const a of [1, 2]) for (const dir of [0, 4]) {
    const row = anchors[a] && anchors[a][dir];
    if (row) lightAnchors[body][a + '|' + dir] = row.map(pt => (pt ? [pt[0], pt[1]] : null));
  }
}
const ownerPivots = {};
for (const cls of Object.keys(D.classes)) {
  ownerPivots[cls] = {};
  for (const dir of [0, 4]) {
    const ids = ((DF.attack[cls] || {})[String(dir)] || []);
    const map = {};
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id == null || map[id] !== undefined) continue;         // the first frame they tuned it on
      const pv = DF.head[cls + '|' + dir + '|' + i];
      if (pv) map[id] = [pv[0], pv[1]];
    }
    if (Object.keys(map).length) ownerPivots[cls][dir] = map;
  }
}

const payload = {
  pack: { hairStyles: PK.hairStyles, heads: PK.heads, anchors: lightAnchors },
  owner: ownerPivots,
  meta: {
    version: 1, kind: 'anim-2dir', built: new Date().toISOString().slice(0, 10),
    cell: { w: D.cell.w, h: D.cell.h, padL: D.cell.padL, padT: D.cell.padT, body: BODY, feet: FEET },
    classes: Object.keys(out.classes),
    groups: GROUPS.map(([k, n, dir, label]) => [k, n, dir, label + (dir === 0 ? ' · front' : ' · back')]),
    dirWords: { 0: 'front', 4: 'back' },
    viewMap: { note: 'front art covers S,SW,W,SE,E; back art covers NW,N,NE - decided when the game is wired',
      front: [0, 1, 2, 6, 7], back: [3, 4, 5] },
    note: 'Attack 2 frames, walk 3 frames, front + back, no idle. Pose ids index sprite_picker_data.js; ' +
      'pivot = the head centre in the 96x96 game cell. src: yours = the owner\'s own tuned pivot, ' +
      'pack = the game\'s own anchor for that figure, measured = the pose\'s measured stub seat, ' +
      'check = the measurer guessed (verify this head).',
    source: 'tools/anim_build.js'
  },
  classes: out.classes
};
// the stamp lets the page notice a rebuilt data file and drop a stale saved session
const { execSync } = require('child_process');
function stampOf(o) {
  const s = JSON.stringify(o.classes) + JSON.stringify(o.owner) + JSON.stringify(o.pack.anchors),
    h = require('crypto').createHash('sha1').update(s).digest('hex');
  return 'anim-' + h.slice(0, 10);
}
payload.meta.stamp = stampOf(payload);

const js = '// Attack 2 frames / walk 3 frames, front + back, no idle - the SIMPLE picker\'s data.\n' +
  '// Generated by tools/anim_build.js - do not hand-edit; rebuild after changing the build rules.\n' +
  'window.ANIM_PICKER_DATA=' + JSON.stringify(payload) + ';\n';
fs.writeFileSync(path.join(ROOT, 'tools', 'anim_picker_data.js'), js);

const n = Object.keys(out.classes).length;
console.log('wrote tools/anim_picker_data.js  (' + (js.length / 1024).toFixed(0) + ' kB, ' + n + ' classes, ' + n * 10 + ' cells)');
console.log('  attack cells on the owner\'s own numbers: ' + flags.yours + '   from the pack: ' + flags.pack +
  '   measured stubs: ' + flags.measured + '   flagged to check: ' + flags.check.length);
if (flags.check.length) console.log('  check these: ' + flags.check.join(', '));
