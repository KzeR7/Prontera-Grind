// Weapon proposal page + harvested weapon art.
//
// Two halves, both real:
//   1. assets/weapons_data.js and assets/weapons_manifest.json must agree with the PNGs
//      on disk, and every design must belong to a family and carry a source path.
//   2. tools/weapon_proposal.html must contain a complete, self-consistent page: the
//      eight families, three designs each, a class table matching index.html's own CD
//      table, the APNG decoder, the drag/rotate handlers, the per-job off switch and the
//      JSON hand-back - and it must not do anything the house rules forbid (no canvas
//      drawing of sprite art, no baked game change).
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL: ' + msg); } };

// ---------------------------------------------------------------- 1. the art
const manifest = JSON.parse(read('assets/weapons_manifest.json'));
const data = read('assets/weapons_data.js');

ok(Array.isArray(manifest.families) && manifest.families.length === 8,
  'manifest lists the eight weapon families (got ' + (manifest.families || []).length + ')');
ok(Array.isArray(manifest.designs) && manifest.designs.length === 24,
  'manifest lists 24 designs (three per family), got ' + (manifest.designs || []).length);

const byFamily = {};
for (const d of manifest.designs) {
  (byFamily[d.family] = byFamily[d.family] || []).push(d);
}
for (const f of manifest.families) {
  ok((byFamily[f] || []).length === 3,
    `family "${f}" has three designs (got ${(byFamily[f] || []).length})`);
}

let missingPng = 0, missingSource = 0, missingData = 0, badSize = 0;
for (const d of manifest.designs) {
  const png = path.join(ROOT, 'assets', 'weapons', d.id + '.png');
  if (!fs.existsSync(png)) { missingPng++; }
  if (!fs.existsSync(png)) { continue; }
  // the manifest's w/h must be the PNG's real size - a decal that lies about its size
  // would silently scale every weapon on the page
  const buf = fs.readFileSync(png);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (w !== d.w || h !== d.h) { badSize++; console.log(`  ${d.id}: manifest ${d.w}x${d.h} vs png ${w}x${h}`); }
  if (!d.source || !/\.spr$/i.test(d.source)) { missingSource++; }
  if (!data.includes(`"${d.id}":"`)) { missingData++; }
}
ok(missingPng === 0, `${missingPng} design PNGs are missing from assets/weapons/`);
ok(badSize === 0, `${badSize} designs disagree with their own PNG size`);
ok(missingSource === 0, `${missingSource} designs have no client .spr source recorded`);
ok(missingData === 0, `${missingData} designs are missing from assets/weapons_data.js`);

// held art: the manifest's dirs must exist as files and be inside weapons/held/
let heldChecked = 0;
for (const [id, rec] of Object.entries(manifest.held || {})) {
  ok(manifest.designs.some(d => d.id === id), `held art "${id}" belongs to a listed design`);
  const dirs = Object.keys(rec.dirs || {});
  ok(dirs.length > 0, `held art "${id}" names at least one direction`);
  for (const d of dirs) {
    const f = path.join(ROOT, 'assets', 'weapons', 'held', `${id}__${d}.png`);
    if (!fs.existsSync(f)) { console.log(`  missing held file ${f}`); fail++; } else { heldChecked++; }
    ok(data.includes(`"held_${id}__${d}":"`), `held art ${id}/${d} is in the data file`);
  }
}
ok(heldChecked > 0, 'at least some held-weapon art was harvested');

// every design's family is a real family, and no design id repeats
const ids = manifest.designs.map(d => d.id);
ok(new Set(ids).size === ids.length, 'no design id is used twice');
ok(manifest.designs.every(d => manifest.families.includes(d.family)),
  'every design names a family the manifest declares');

// ---------------------------------------------------------------- 2. the page
const page = read('tools/weapon_proposal.html');
ok(page.includes('window.WEAPON_ART'), 'the page reads the harvested art');
ok(page.includes('window.CLASS_SKINS'), 'the page reads the class frames');
ok(page.includes('decodeApng') && page.includes('DecompressionStream'),
  'the page decodes the class APNGs itself (the art animates, frame 0 is not shown)');
ok(page.includes('skinUnfilter') || page.includes('function unfilter'),
  'the page unfilters PNG scanlines');

// drag / rotate / size / reset, and the per-job off switch
ok(/pointerdown/.test(page) && /pointermove/.test(page) && /pointerup/.test(page),
  'the weapon is draggable with pointer events');
ok(/addEventListener\('wheel'/.test(page), 'the wheel rotates the weapon');
ok(/ev\.key==='\['/.test(page) && /ev\.key==='\]'/.test(page), 'bracket keys rotate');
ok(/ev\.key==='0'/.test(page), '0 resets the position');
ok(/off\s*=\s*!offOf/.test(page), 'each class has a "no weapon" toggle');

// the class table must match index.html's own weapon column
const index = read('index.html');
const cd = index.slice(index.indexOf('const CD=['), index.indexOf('const CLASSES={}'));
// one CD row: ['Name', parent (a name or 0), ... , ['fam','fam'], 'mainstat', …]
const cdRows = [...cd.matchAll(/\['([A-Z][^']*)',[^,]+,[^\]]*?\[((?:'[^']*',?\s*)+)\],\s*'\w+'/g)];
ok(cdRows.length >= 19, `index.html's CD table was found (${cdRows.length} rows)`);

const pageTable = page.slice(page.indexOf('const CLASS_FAMILIES'), page.indexOf('const CLASS_ORDER'));
let tableMismatch = 0;
for (const m of cdRows) {
  const name = m[1];
  const fams = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]);
  for (const f of fams) {
    const re = new RegExp(`'${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\s*:\\s*\\[[^\\]]*'${f}'`);
    if (!re.test(pageTable)) {
      console.log(`  ${name} should allow the ${f} family in the page table`);
      tableMismatch++;
    }
  }
}
ok(tableMismatch === 0, 'the page\'s class -> family table matches index.html');

// every family the page names must have three designs in the manifest
const pageDesigns = page.slice(page.indexOf('const DESIGNS'), page.indexOf('const DESIGN_LABEL'));
for (const f of manifest.families) {
  const m = new RegExp(`\\b${f}\\s*:\\s*\\[([^\\]]*)\\]`).exec(pageDesigns);
  ok(!!m, `the page lists designs for "${f}"`);
  if (!m) { continue; }
  const listed = m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  ok(listed.length === 3, `the page offers three designs for "${f}" (got ${listed.length})`);
  for (const id of listed) {
    ok(manifest.designs.some(d => d.id === id), `page design "${id}" is in the manifest`);
  }
}

// the hand-back
ok(/Copy my proposal/.test(page) && /navigator\.clipboard/.test(page),
  'the page can copy the proposal to the clipboard');
ok(/page:'weapon-proposal'/.test(page), 'the export names itself');
ok(/dx:e\.dx\|\|0/.test(page) && /dy:e\.dy\|\|0/.test(page) && /rot:e\.rot\|\|0/.test(page),
  'the export carries the per-class offset and rotation');

// honesty: the page must say the art is real client art and that nothing is in the game
ok(/Ragnarok Online/.test(page), 'the page says where the art is from');
ok(/not in the game|Not in the game|nothing is baked|Nothing is baked/i.test(page),
  'the page says the game is untouched');

// the tool that made the art
const tool = read('tools/make_weapon_pack.py');
ok(/--check/.test(tool) && /--source/.test(tool), 'the packer has --source and --check');
// house rule 1: crop only.  The packer may crop and save; it must never resize or recolour.
ok(/\.crop\(/.test(tool), 'the packer crops');
ok(!/\bresize\(/.test(tool) && !/\.rotate\(/.test(tool),
  'the packer never resizes or rotates sprite art (crop only)');
ok(!/putpixel|ImageDraw/.test(tool), 'the packer never draws pixels');

console.log(`weapon proposal: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
