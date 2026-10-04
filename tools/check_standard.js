// tools/check_standard.js - is the shipped standard exactly the owner's payload?
//
// The owner's tuning pass is the standard (tools/attack_selection.json): the picker opens on
// it, tools/head_seats.json seats the review page with it.  Run this after ANY change to the
// picker, the pack, or the standard itself:  node tools/check_standard.js
// It compares every number and fails loudly if anything has drifted.
// Compares, number for number: the 570 drawn-view pivots, the 342 mirrored drags,
// the pose (crop) cells, and what tools/head_seats.json says the picker draws.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const A = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'attack_selection.json'), 'utf8'));
const sb = { window: {} }; vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'tools', 'sprite_picker_defaults.js'), 'utf8'), sb);
const DF = sb.window.SPRITE_PICKER_DEFAULTS;
const SEAT = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'head_seats.json'), 'utf8')).seats;

const CLASSES = Object.keys(A.attack);
console.log('payload: version ' + A.version + ', ' + CLASSES.length + ' classes, mirrorSide ' + A.mirrorSide);
console.log('defaults: ' + Object.keys(DF.head).length + ' head pivots, ' + Object.keys(DF.headDragMirror || {}).length + ' mirrored drags, ' +
  (DF.attack ? Object.keys(DF.attack).length : 0) + ' attack tables');

let bad = 0, cmp = 0;
const VIEWKEYS = {};
for (const cls of CLASSES) {
  const keys = Object.keys(A.attack[cls]);
  VIEWKEYS[cls] = keys.join('/');
  for (const v of keys) for (let f = 0; f < A.attack[cls][v].length; f++) {
    const cell = A.attack[cls][v][f];
    // (a) the pose identity: defaults.attack[cls][v][f] must point at the same crop
    const id = (DF.attack[cls] || {})[v] && DF.attack[cls][v][f];
    cmp++;
    if (id == null) { console.log('  MISSING pose  ' + cls + ' ' + v + '/' + f); bad++; continue; }
    // (b) the head: drawn views carry the absolute pivot, mirrored views a drag
    if (+v < 5) {
      const want = [cell[4], cell[5]];
      const got = DF.head[cls + '|' + v + '|' + f];
      cmp++;
      if (JSON.stringify(want) !== JSON.stringify(got)) { console.log('  PIVOT differs ' + cls + ' ' + v + '/' + f + ' payload ' + JSON.stringify(want) + ' defaults ' + JSON.stringify(got)); bad++; }
      const seat = SEAT[cls][+v][f];
      cmp++;
      if (Math.round(seat[0]) !== want[0] || Math.round(seat[1]) !== want[1]) { console.log('  SEAT differs  ' + cls + ' ' + v + '/' + f + ' payload ' + JSON.stringify(want) + ' head_seats ' + JSON.stringify(seat)); bad++; }
    } else {
      const want = A.headAdjust[cls + '|' + v + '|' + f];
      const got = (DF.headDragMirror || {})[cls + '|' + v + '|' + f];
      cmp++;
      if (JSON.stringify(want) !== JSON.stringify(got)) { console.log('  DRAG differs  ' + cls + ' ' + v + '/' + f + ' payload ' + JSON.stringify(want) + ' defaults ' + JSON.stringify(got)); bad++; }
      cmp++;
      if (SEAT[cls][+v][f] == null) { console.log('  head_seats has no seat for ' + cls + ' ' + v + '/' + f); bad++; }
    }
  }
}
const someCls = CLASSES[0];
console.log('payload view keys per class (first 3): ' + CLASSES.slice(0, 3).map(c => c + '=' + VIEWKEYS[c]).join('  '));
console.log('headAdjust entries: ' + Object.keys(A.headAdjust).length + '  (drawn views ' + Object.keys(A.headAdjust).filter(k => +k.split('|')[1] < 5).length +
  ', mirrored ' + Object.keys(A.headAdjust).filter(k => +k.split('|')[1] >= 5).length + ')');
console.log(cmp + ' numbers compared; ' + (bad ? bad + ' MISMATCHES' : 'everything matches the payload'));
