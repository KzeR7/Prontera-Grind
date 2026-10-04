// tools/inline_picker_standalone.js - rebuild the self-contained twins of the picker pages.
//
//     node tools/inline_picker_standalone.js
//
// Two pages are built from their served source, with every data block inlined so each file opens
// anywhere (the Arena viewer, a phone, a USB stick) with no repository beside it:
//
//   tools/sprite_picker.html  ->  tools/sprite_picker_standalone.html   (the 8-view pose picker)
//   tools/anim_picker.html    ->  tools/anim_picker_standalone.html     (attack 2 / walk 3, front+back)
//
// tools/make_sprite_picker.py writes the same two files, but that tool needs Pillow to read the
// Sprite/ sheets - and this step needs no image library: the pose index is already built, the
// sheets only have to be turned into data URIs, and the picker's other blocks are moved across
// from the standalone already in the repo.  It fails loudly if a page no longer carries the tags
// it replaces, so the two builds cannot drift.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

const NAV = /<script>\s*\/\* served preview only[\s\S]*?<\/script>\n/;
// the served pages carry a small "pages" nav (added only over http); these one-file builds are not
// served by that preview server, so they ship without it - its links would point at the wrong host
function stripNav(out) {
  if (!NAV.test(out)) throw new Error('the page source lost its preview nav block');
  out = out.replace(NAV, '');
  out = out.split('\n').filter(l => !/navline|navlink|navhint/.test(l)).join('\n');
  if (/served preview only|navline/.test(out)) throw new Error('the nav survived the inlining');
  return out;
}
function checkBlocks(sizes, want) {
  for (const k of Object.keys(want)) {
    const [lo, hi] = want[k], got = sizes[k];
    if (!(got >= lo && got <= hi)) {
      throw new Error('block ' + k + ' is ' + got + ' B, expected ' + lo + '-' + hi + ' - the extraction slipped');
    }
  }
}

// ---------------------------------------------------------------- the 8-view pose picker
function buildPicker() {
  const TEMPLATE = path.join(ROOT, 'tools', 'sprite_picker.html');
  const OUT = path.join(ROOT, 'tools', 'sprite_picker_standalone.html');
  const DEFAULTS = path.join(ROOT, 'tools', 'sprite_picker_defaults.js');
  const TAGS = ['<script src="../assets/sprite_pack_data.js"></script>',
    '<script src="sprite_picker_data.js"></script>',
    '<script src="sprite_picker_defaults.js"></script>'];
  if (!fs.existsSync(OUT)) throw new Error('no standalone to take the inlined data from');
  const tmpl = fs.readFileSync(TEMPLATE, 'utf8'), old = fs.readFileSync(OUT, 'utf8');
  for (const tag of TAGS) if (!tmpl.includes(tag)) throw new Error('the page source changed: ' + tag + ' is gone');
  const pack = /<!-- standalone build: everything below is inside this one file -->\n<script>window\.SPRITE_PACK=[\s\S]*?<\/script>/.exec(old);
  const data = /<script>window\.SPRITE_PICKER_DATA=[\s\S]*?<\/script>/.exec(old);
  if (!pack || !data) throw new Error('the shipped standalone has no inlined pack/pose block');
  const defs = '<script>\n' + fs.readFileSync(DEFAULTS, 'utf8').trim() + '\n</script>';
  checkBlocks({ pack: pack[0].length, poses: data[0].length, standard: defs.length },
    { pack: [2e5, 8e5], poses: [1.5e6, 4e6], standard: [5e3, 2e5] });
  let out = tmpl.replace(TAGS[0], pack[0]).replace(TAGS[1], data[0]).replace(TAGS[2], defs);
  out = stripNav(out);
  if (out.includes('src="sprite_picker') || out.includes('src="../assets/sprite_pack_data.js"')) {
    throw new Error('a data tag survived the inlining');
  }
  fs.writeFileSync(OUT, out);
  return ['tools/sprite_picker_standalone.html', out.length];
}

// ---------------------------------------------------------------- the simple animation picker
function buildAnim() {
  const TEMPLATE = path.join(ROOT, 'tools', 'anim_picker.html');
  const OUT = path.join(ROOT, 'tools', 'anim_picker_standalone.html');
  const TAGS = ['<script src="sprite_picker_data.js"></script>', '<script src="anim_picker_data.js"></script>'];
  const tmpl = fs.readFileSync(TEMPLATE, 'utf8');
  for (const tag of TAGS) if (!tmpl.includes(tag)) throw new Error('the page source changed: ' + tag + ' is gone');
  // the pose index with the sheets as data URIs (the served page reads Sprite/*.png by path)
  const sb = { window: {} }; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'tools', 'sprite_picker_data.js'), 'utf8'), sb);
  const D = sb.window.SPRITE_PICKER_DATA;
  for (const cls of Object.keys(D.classes)) {
    const c = D.classes[cls];
    if (!c.file) throw new Error(cls + ' has no sheet path');
    c.img = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, c.file)).toString('base64');
  }
  const dataBlock = '<script>window.SPRITE_PICKER_DATA=' + JSON.stringify(D) + ';</script>';
  const animBlock = fs.readFileSync(path.join(ROOT, 'tools', 'anim_picker_data.js'), 'utf8').trim();
  checkBlocks({ poses: dataBlock.length, anim: animBlock.length }, { poses: [1.5e6, 4e6], anim: [1e5, 3e6] });
  let out = tmpl.replace(TAGS[0], dataBlock).replace(TAGS[1], '<script>\n' + animBlock + '\n</script>');
  out = stripNav(out);
  if (/src="(\.\.\/assets\/sprite_pack_data|sprite_picker_data|anim_picker_data)/.test(out)) {
    throw new Error('a data tag survived the inlining');
  }
  fs.writeFileSync(OUT, out);
  return ['tools/anim_picker_standalone.html', out.length];
}

for (const [file, bytes] of [buildPicker(), buildAnim()]) {
  console.log('wrote ' + file + '  (' + (bytes / 1e6).toFixed(2) + ' MB, self-contained)');
}
