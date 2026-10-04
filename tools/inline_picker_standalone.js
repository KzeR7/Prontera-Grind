// tools/inline_picker_standalone.js - rebuild tools/sprite_picker_standalone.html
//
// The standalone is the same app as tools/sprite_picker.html with the pose index, the head
// atlases, the pack anchors and the owner's standard inlined: one file that opens anywhere.
//
// tools/make_sprite_picker.py writes it too, but that tool needs Pillow (it reads the Sprite/
// sheets) - and the standalone step itself needs no image library at all: the data blocks it
// inlines only have to be moved across from the build already in the repo.  So this is the
// way to refresh the standalone after an edit to the page source, without Pillow.
//
//   node tools/inline_picker_standalone.js
//
// It fails loudly if the page no longer carries the three <script src=...> tags the inliner
// replaces, so the two builds cannot silently drift.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'tools', 'sprite_picker.html');
const OUT = path.join(ROOT, 'tools', 'sprite_picker_standalone.html');
const TAGS = ['<script src="../assets/sprite_pack_data.js"></script>',
  '<script src="sprite_picker_data.js"></script>',
  '<script src="sprite_picker_defaults.js"></script>'];

if (!fs.existsSync(OUT)) {
  console.error('no standalone to take the inlined data from - run tools/make_sprite_picker.py once');
  process.exit(1);
}
const tmpl = fs.readFileSync(TEMPLATE, 'utf8');
const old = fs.readFileSync(OUT, 'utf8');
for (const tag of TAGS) {
  if (!tmpl.includes(tag)) { console.error('the page source changed: ' + tag + ' is gone'); process.exit(1); }
}
// the three blocks already inlined in the shipped standalone, verbatim
const pack = /<!-- standalone build: everything below is inside this one file -->\n<script>window\.SPRITE_PACK=[\s\S]*?<\/script>/.exec(old);
const data = /<script>window\.SPRITE_PICKER_DATA=[\s\S]*?<\/script>/.exec(old);
const DEFAULTS = path.join(ROOT, 'tools', 'sprite_picker_defaults.js');
// the standard is inlined exactly the way make_sprite_picker.py inlines it (newlines kept:
// the generated file opens with a // comment that would swallow the assignment otherwise)
const defs = '<script>\n' + fs.readFileSync(DEFAULTS, 'utf8').trim() + '\n</script>';
for (const [name, m] of [['pack', pack], ['pose index', data]]) {
  if (!m) { console.error('the shipped standalone has no ' + name + ' block to carry over'); process.exit(1); }
}
const sizes = { pack: pack[0].length, poses: data[0].length, standard: defs.length };
if (sizes.pack < 2e5 || sizes.pack > 8e5 ||
    sizes.poses < 1.5e6 || sizes.poses > 4e6 ||
    sizes.standard < 5e3 || sizes.standard > 2e5) {
  console.error('a block is the wrong size - the extraction slipped: ' + JSON.stringify(sizes));
  process.exit(1);
}
let out = tmpl.replace(TAGS[0], pack[0]).replace(TAGS[1], data[0]).replace(TAGS[2], defs);
// the served pages carry a small "pages" nav (added only over http); the one-file build is not
// served by that preview server, so it ships without it - its links would point at the wrong host
const nav = /<script>\/\* served preview only[\s\S]*?<\/script>\n/;
if (!nav.test(out)) { console.error('the page source lost its preview nav block'); process.exit(1); }
out = out.replace(nav, '');
out = out.split('\n').filter(l => !/navline|navlink|navhint/.test(l)).join('\n');   // and its styles
if (/served preview only|navline/.test(out)) { console.error('the nav survived into the standalone'); process.exit(1); }
if (out.includes('src="sprite_picker') || out.includes('src="../assets/sprite_pack_data.js"')) {
  console.error('a data tag survived the inlining'); process.exit(1);
}
fs.writeFileSync(OUT, out);
console.log('wrote tools/sprite_picker_standalone.html (' + (out.length / 1e6).toFixed(2) + ' MB)' +
  ' from tools/sprite_picker.html + the inlined data (' + (pack[0].length / 1e6).toFixed(2) + ' MB pack, ' +
  (data[0].length / 1e6).toFixed(2) + ' MB poses, ' + (defs.length / 1e3).toFixed(1) + ' kB standard)');
