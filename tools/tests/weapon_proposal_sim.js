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
// the composite lives in one place (paintCell) so the stage and the glance tiles
// cannot drift apart; the mirror-about-the-grip rule has to be in there
ok(/function paintCell\(/.test(page) && /\.scale\(P\.fx===-1\?-1:1, P\.fy===-1\?-1:1\)/.test(page),
  'the flip scales the image about its own grip (so it stays in the hand)');
ok(/paintCell\(sctx,stage\.width,stage\.height/.test(page) && /paintCell\(T\.cv\.getContext\('2d'\)/.test(page),
  'the stage and the glance tiles both draw through paintCell, so they cannot disagree');
ok(/Click where the hand is/.test(page),
  'the canvas tells the owner what the click does while "Set hand" is on');
ok(/<td id="nFlip">/.test(page) && /<button id="flipX">/.test(page) && /<button id="flipY">/.test(page),
  'the page has the flip readout and both flip buttons');
ok(/document\.addEventListener\('pointerdown'/.test(page),
  'the hand pick listens on the document, so nothing can swallow the click');
ok(/addEventListener\('wheel'/.test(page), 'the wheel rotates the weapon');
ok(/ev\.key==='\['/.test(page) && /ev\.key==='\]'/.test(page), 'bracket keys rotate');
ok(/ev\.key==='0'/.test(page), '0 resets the position');
ok(/const e=entry\(n\);e\.off=!e\.off/.test(page),
  'each job in the class list has a "no weapon" toggle (✕)');
ok(/bare-handed everywhere/.test(page) && /weapon on every view/.test(page),
  'the page has bulk "every view" switches next to the toggle');

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

// Every element the script reaches for has to exist in the markup: a typo'd id hands the
// page a null at boot and takes the whole thing down, and the DOM stub used further down
// would happily invent an element for a name that is not there.
{
  const inMarkup = new Set([...page.matchAll(/\bid="([\w-]+)"/g)].map(m => m[1]));
  const used = new Set([...page.matchAll(/\$\('([\w-]+)'\)/g)].map(m => m[1]));
  const missing = [...used].filter(id => !inMarkup.has(id));
  ok(missing.length === 0,
    missing.length ? 'the script reaches for element ids that are not in the page: ' + missing.join(', ')
                   : `all ${used.size} element ids the script uses exist in the markup`);
}

// the hand-back
ok(/Copy my proposal/.test(page) && /navigator\.clipboard/.test(page),
  'the page can copy the proposal to the clipboard');
ok(/page:'weapon-proposal'/.test(page), 'the export names itself');
ok(/version:4/.test(page), 'the export says which contract it is (v4, per sprite and frame)');
ok(/views\[sex\]\[v\]=\{weapon:viewOn\(n,v,sex\)/.test(page),
  'the export writes one entry per sprite per view, each with its own weapon switch');
ok(/dx:V\.dx\|\|0/.test(page) && /dy:V\.dy\|\|0/.test(page) && /rot:V\.rot\|\|0/.test(page),
  'the export carries each view\'s own offset, rotation and size');

// honesty: the page says the art is real client art, the shipped defaults are live, and new edits remain proposals
ok(/Ragnarok Online/.test(page), 'the page says where the art is from');
ok(/shipped saved defaults are live in the game/i.test(page),
  'the page says its saved defaults are what the game uses');
ok(/new edits here stay a proposal/i.test(page) && /edits here do not change the shipped defaults/i.test(page),
  'the page distinguishes unsaved proposals from the live defaults');

// the tool that made the art
const tool = read('tools/make_weapon_pack.py');
ok(/--check/.test(tool) && /--source/.test(tool), 'the packer has --source and --check');
// house rule 1: crop only.  The packer may crop and save; it must never resize or recolour.
ok(/\.crop\(/.test(tool), 'the packer crops');
ok(!/\bresize\(/.test(tool) && !/\.rotate\(/.test(tool),
  'the packer never resizes or rotates sprite art (crop only)');
ok(!/putpixel|ImageDraw/.test(tool), 'the packer never draws pixels');


// ---------------------------------------------------------------- 2b. the shipped default
// The owner asked for their progress to be the page's starting point. It lives in
// assets/weapon_proposal_data.js, and the page loads it before anything else.
const defRaw = read('assets/weapon_proposal_data.js');
ok(/window\.WEAPON_PROPOSAL_DEFAULT\s*=/.test(defRaw),
  'the shipped default is a window global the page can load');
const DEF = JSON.parse(defRaw.slice(defRaw.indexOf('=') + 1).replace(/;\s*$/, ''));
ok(DEF.page === 'weapon-proposal', 'the default says it is a weapon proposal');
ok(DEF.classes && Object.keys(DEF.classes).length === 19,
  `the default covers all 19 classes (${Object.keys(DEF.classes || {}).length})`);
{
  const fams = Array.isArray(manifest.families) ? manifest.families
             : Object.keys(manifest.families);
  let badView = 0, badFam = 0, badNum = 0, badFrame = 0;
  for (const [name, rec] of Object.entries(DEF.classes)) {
    if (fams.indexOf(rec.family) < 0) { badFam++; console.log(`  ${name}: family "${rec.family}"`); }
    ok(rec.views && rec.views.m && rec.views.f, `${name} has a block for both sprites`);
    for (const [sex, views] of Object.entries(rec.views || {})) {
      for (const [view, V] of Object.entries(views)) {
        if (['S', 'SE', 'NE', 'attack', 'N'].indexOf(view) < 0) { badView++; }
        const b = V.base || {};
        if (!Array.isArray(b.flip) || typeof b.rot !== 'number' || typeof b.scale !== 'number' ||
            (b.hand !== null && !Array.isArray(b.hand)) ||
            (b.hand === null) !== (b.handAuto === true)) {
          badNum++; console.log(`  ${name}/${sex}/${view}: bad base`);
        }
        for (const [i, f] of Object.entries(V.frames || {})) {
          if (!(Number(i) >= 0) || !Array.isArray(f.hand) || typeof f.rot !== 'number' ||
              typeof f.scale !== 'number' || !Array.isArray(f.flip)) {
            badFrame++; console.log(`  ${name}/${sex}/${view} frame ${i}: incomplete`);
          }
        }
      }
    }
  }
  ok(badFam === 0, 'every class in the default names a real weapon family');
  ok(badView === 0, 'the default only mentions real views');
  ok(badNum === 0, 'every default placement has a hand, angle, size and flip');
  ok(badFrame === 0, 'every per-frame placement in the default is complete');
  // the numbers the owner actually set: spot-check them, as they were pasted
  const nov = DEF.classes.Novice.views;
  ok(nov.m.attack.frames['0'].hand[0] === 87 && nov.m.attack.frames['0'].hand[1] === 115,
    'the default keeps the owner\'s first attack frame for the Novice (87,115)');
  ok(nov.m.attack.base.rot === -348 && nov.m.attack.base.flip[0] === -1,
    'and its angle and mirror');
  ok(nov.f.attack.frames['4'].hand[0] === 128 && nov.f.attack.frames['4'].scale === 0.7,
    'the female Novice keeps her own copy of those five frames');
  ok(DEF.classes.Swordman.views.m.attack.frames['5'].hand[1] === 102,
    'the Swordman\'s sixth attack frame is in the default');
  ok(DEF.classes.Archer.views.m.attack.frames['2'].scale === 1.25,
    'the Archer\'s third attack frame keeps its own size');
  ok(nov.m.S.weapon === false && nov.m.attack.weapon === true,
    'the Novice is bare-handed walking and armed while attacking, as the owner set it');
  ok(DEF.classes.Merchant.views.m.S.base.rot === -8, 'the Merchant\'s axe angle survives');
  ok(DEF.classes['High Priest'].views.m.N && DEF.classes['High Priest'].views.m.S,
    'the High Priest keeps all five of its views');
  ok(DEF.classes.Thief.views.m.S.base.hand === null,
    'hands the owner left on automatic are stored as null, so each sprite guesses its own');
  // this revision's own choices, which are easy to lose in a re-import
  ok(DEF.classes.Thief.design === 'dagger_broken' && DEF.classes.Thief.views.m.S.weapon === false &&
     DEF.classes.Thief.views.f.S.weapon === false && DEF.classes.Thief.views.f.attack.weapon === true,
    'the Thief stays on the Broken Blade, with the female sprite bare while walking and armed on attack');
  ok(DEF.classes.Knight.views.m.S.weapon === false && DEF.classes.Knight.views.m.SE.weapon === false &&
     DEF.classes.Knight.views.m.NE.weapon === false && DEF.classes.Knight.views.m.attack.weapon === true &&
     DEF.classes.Knight.views.f.S.weapon === false && DEF.classes.Knight.views.f.SE.weapon === false &&
     DEF.classes.Knight.views.f.NE.weapon === false && DEF.classes.Knight.views.f.attack.weapon === true,
    'the Knight walks bare-handed on both sprites and carries the sword only on attack');
  ok(Object.entries(DEF.classes.Knight.views.m).filter(([, V]) => !V.weapon)
       .every(([, V]) => Object.keys(V.frames).length === 0),
    'his bare walks carry no frame numbers either, so nothing is hidden behind them');
  // the second pass of design picks: one per family line, changed by hand
  ok(DEF.classes.Blacksmith.design === 'axe_single' && DEF.classes['Lord Knight'].design === 'sword_elem' &&
     DEF.classes['High Wizard'].design === 'staff_shadow' && DEF.classes.Sniper.design === 'bow_thorn' &&
     DEF.classes['Assassin Cross'].design === 'katar_guil',
    'the Blacksmith, Lord Knight, High Wizard, Sniper and Assassin Cross are on their newly picked designs');
  const bareWalks = ['Blacksmith', 'Lord Knight', 'High Wizard', 'Sniper'].every(n =>
    ['S', 'SE', 'NE'].every(v => DEF.classes[n].views.m[v].weapon === false) &&
    DEF.classes[n].views.m.attack.weapon === true) &&
    ['Blacksmith', 'Lord Knight', 'Sniper'].every(n =>
      ['S', 'SE', 'NE'].every(v => DEF.classes[n].views.f[v].weapon === false) &&
      DEF.classes[n].views.f.attack.weapon === true) &&
    DEF.classes['High Wizard'].views.f.S.weapon === true &&
    DEF.classes['High Wizard'].views.f.SE.weapon === false &&
    DEF.classes['High Wizard'].views.f.NE.weapon === false &&
    DEF.classes['High Wizard'].views.f.attack.weapon === true;
  ok(bareWalks,
    'the four jobs keep their separate male/female per-view weapon switches');
  const v5Checks = {
    Novice: DEF.classes.Novice.views.f.attack.base.handAuto === false && DEF.classes.Novice.views.f.attack.frames['0'].dx === -13,
    Swordman: Object.keys(DEF.classes.Swordman.views.f.attack.frames).length === 9 && DEF.classes.Swordman.views.f.attack.frames['1'].rot === 316,
    Mage: DEF.classes.Mage.views.f.attack.frames['2'].dx === 7 && DEF.classes.Mage.views.f.attack.frames['3'].hand[0] === 118,
    Thief: DEF.classes.Thief.views.f.S.weapon === false && DEF.classes.Thief.views.f.attack.frames['0'].dx === -38,
    Acolyte: DEF.classes.Acolyte.views.f.attack.frames['3'].rot === 124,
    Merchant: DEF.classes.Merchant.views.f.attack.base.rot === -8 && DEF.classes.Merchant.views.f.attack.frames['8'].dx === 30,
    Knight: DEF.classes.Knight.views.f.attack.frames['4'].dx === 30,
    Wizard: DEF.classes.Wizard.views.f.attack.weapon === false,
    Hunter: DEF.classes.Hunter.views.f.attack.frames['7'].rot === 214,
    Assassin: DEF.classes.Assassin.views.f.NE.weapon === false && DEF.classes.Assassin.views.f.attack.frames['6'].flip[0] === -1,
    Priest: DEF.classes.Priest.views.f.attack.weapon === false && DEF.classes.Priest.views.f.attack.frames['2'].scale === 0.4,
    Blacksmith: DEF.classes.Blacksmith.views.f.attack.frames['6'].flip[0] === -1,
    'Lord Knight': DEF.classes['Lord Knight'].views.f.attack.frames['4'].dx === 34,
    'High Wizard': DEF.classes['High Wizard'].views.f.S.weapon === true && DEF.classes['High Wizard'].views.f.attack.frames['7'].dy === 15,
    Sniper: DEF.classes.Sniper.views.f.attack.frames['7'].dy === -16,
    'Assassin Cross': DEF.classes['Assassin Cross'].views.f.NE.weapon === false && DEF.classes['Assassin Cross'].views.f.attack.frames['7'].flip[0] === -1,
    'High Priest': DEF.classes['High Priest'].design === 'mace_forge' && DEF.classes['High Priest'].views.m.attack.frames['4'].rot === 84 && DEF.classes['High Priest'].views.f.attack.frames['3'].flip[0] === -1,
    Whitesmith: DEF.classes.Whitesmith.views.m.attack.weapon === false && DEF.classes.Whitesmith.views.f.attack.weapon === false
  };
  for (const [name, matches] of Object.entries(v5Checks))
    ok(matches, `${name}: latest v5 weapon change is saved in the default`);
  const untouchedV5 = Object.keys(DEF.classes).filter(name => !Object.hasOwn(v5Checks, name));
  ok(Object.keys(v5Checks).length === 18 && untouchedV5.join(',') === 'Archer',
    'the latest pasted v5 delta covers 18 of 19 classes; Archer was not in it');
  ok(Object.keys(DEF.classes.Knight.views.m.attack.frames).length === 9 &&
     DEF.classes.Knight.views.m.attack.frames['4'].dx === 63 &&
     DEF.classes.Knight.views.m.attack.frames['4'].rot === -58 &&
     DEF.classes.Knight.views.m.attack.frames['8'].flip[0] === -1,
    'the Knight\'s re-tuned swing keeps all nine frames, with the follow-through 63 px across and mirrored');
  ok(Object.keys(DEF.classes['Assassin Cross'].views.m.S.frames).length === 8 &&
     DEF.classes['Assassin Cross'].views.m.S.frames['0'].scale === 0.95 &&
     Object.keys(DEF.classes['Assassin Cross'].views.m.NE.frames).length === 8 &&
     DEF.classes['Assassin Cross'].views.m.NE.frames['6'].rot === -54,
    'the Assassin Cross carries a placement on every one of his views');
  ok(Object.keys(DEF.classes['High Wizard'].views.m.attack.frames).length === 4,
    'the High Wizard keeps the four frames he set (the one the page had blended is left out to blend again)');
  ok(DEF.classes.Knight.design === 'sword_chill' && DEF.classes.Wizard.design === 'staff_ion' &&
     DEF.classes.Assassin.design === 'katar_reinf' && DEF.classes.Priest.design === 'mace_wand',
    'the Knight, Wizard, Assassin and Priest are on their newly picked designs');
  ok(DEF.classes.Assassin.views.m.NE.weapon === false,
    'the Assassin is bare-handed facing North-East');
  ok(DEF.classes.Acolyte.views.m.attack.frames['3'].flip[1] === -1,
    'the Acolyte\'s fourth attack frame is upside-down');
  ok(DEF.classes.Merchant.views.m.attack.frames['8'].dx === 70,
    'the Merchant\'s axe travels 70 px across its swing');
  ok(DEF.classes.Assassin.views.m.S.frames['2'].scale === 0.65,
    'and the Assassin\'s third walk frame is drawn smaller');
  const badSrc = Object.entries(DEF.classes).flatMap(([n, c]) =>
    Object.entries(c.views).flatMap(([sex, vs]) =>
      Object.entries(vs).flatMap(([v, V]) =>
        Object.entries(V.frames || {}).filter(([, f]) => f.src !== 'frame')
          .map(([i]) => `${n}/${sex}/${v}/${i}`))));
  ok(badSrc.length === 0,
    badSrc.length ? 'shipped frames that are not marked as hand-set: ' + badSrc.slice(0, 6).join(', ')
                  : 'every shipped frame record is marked "frame", so the page re-derives the blends');
  ok(Object.values(DEF.classes).some(c => Object.values(c.views.m).some(v => v.weapon === false)),
    'the owner can still leave a class unarmed in some views');

  // A design id that is not real art is the quiet kind of wrong: the page falls back to
  // the family's own image and everything still draws, so nobody notices the class is not
  // on the weapon that was asked for.  Check every shipped class against the pack and the
  // page's own design table, both directions.
  const designBlock = page.slice(page.indexOf('const DESIGNS'), page.indexOf('const DESIGN_LABEL'));
  const offersDesign = (fam, id) => {
    const m = new RegExp(`\\b${fam}\\s*:\\s*\\[([^\\]]*)\\]`).exec(designBlock);
    return !!m && m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).includes(id);
  };
  const badDesign = [];
  for (const [n, c] of Object.entries(DEF.classes)) {
    const real = (manifest.designs.find(d => d.id === c.design) || {}).family;
    if (!real) badDesign.push(`${n}: "${c.design}" is not a design in the art pack`);
    else if (c.family !== real) badDesign.push(`${n}: ${c.design} is a ${real}, the class says ${c.family}`);
    else if (!offersDesign(c.family, c.design)) badDesign.push(`${n}: the page does not offer ${c.design}`);
  }
  ok(badDesign.length === 0,
    badDesign.length ? 'shipped classes pointing at art that is not there: ' + badDesign.slice(0, 5).join('; ')
                     : 'all 19 shipped classes name a design that exists in the pack and is offered on the page');
}

// ---------------------------------------------------------------- 3. the page, driven
// The two things the owner asked for after the first draft - "freeze it so I can place
// the weapon" and "no weapon on South and South-East, but yes on Attack" - are state
// rules, not pictures.  This boots the page's own script in a Node vm with a DOM stub
// and drives those rules, so the behaviour is tested and not just the buttons.
import vm from 'vm';
{
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const code = scripts[scripts.length - 1];
  ok(!!code, 'the page has one inline script to drive');

  const mkEl = () => {
    const el = {
      _html: '', textContent: '', value: '', className: '', style: { cssText: '' },
      width: 760, height: 520,
      dataset: {}, children: [], _cl: new Set(),
      classList: {
        add(...c){ c.forEach(x => this._o._cl.add(x)) },
        remove(...c){ c.forEach(x => this._o._cl.delete(x)) },
        toggle(c, on){ const o = this._o; const want = (on === undefined) ? !o._cl.has(c) : !!on;
                       want ? o._cl.add(c) : o._cl.delete(c); return want },
        contains(c){ return this._o._cl.has(c) },
      },
      _ls: {},
      addEventListener(type, fn){ (this._ls[type] = this._ls[type] || []).push(fn) },
      closest(sel){ return sel === 'button' && this.tagName === 'BUTTON' ? this : null },
      appendChild(c){ if (c) c.parentNode = this; this.children.push(c); return c },
      append(...c){ c.forEach(x => { if (x) x.parentNode = this }); this.children.push(...c) },
      prepend(...c){ this.children.unshift(...c) },
      remove(){}, setAttribute(){}, getAttribute(){ return null },
      addEventListener(){}, setPointerCapture(){}, releasePointerCapture(){},
      get innerHTML(){ return this._html },
      set innerHTML(v){ this._html = String(v); this.children.length = 0; this._cb = null },
      querySelectorAll(sel){
        if (sel === 'input[type=checkbox]') {
          if (!this._cb) {
            const html = [this._html, ...this.children.map(c => c._html)].join(' ');
            this._cb = [...html.matchAll(/type="checkbox"[^>]*data-view="([^"]+)"([^>]*)/g)].map(m => ({
              dataset: { view: m[1] }, checked: /checked/.test(m[2]), onchange: null, onclick: null,
              parentNode: this,
            }));
          }
          return this._cb;
        }
        if (sel === 'button[data-flip]') {
          if (!this._fb) {
            this._fb = [];
            for (const tr of this.children) {          // one pair of flip buttons per row
              if (!(tr.dataset && tr.dataset.view != null)) continue;
              for (const dir of ['x', 'y']) {
                this._fb.push({ dataset: { flip: dir, view: tr.dataset.view }, onclick: null,
                                parentNode: tr, className: '' });
              }
            }
          }
          return this._fb;
        }
        return [];
      },
      querySelector(){ return null },
      getBoundingClientRect(){
        return { left: 0, top: 0, right: 760, bottom: 520, width: 760, height: 520 };
      },
      getContext(){ return new Proxy({}, { get: () => () => ({}) }) },
      onclick: null, onchange: null,
    };
    el.classList._o = el;
    return el;
  };
  const store = {};
  const ctx = {
    window: null,
    document: {
      getElementById: id => (ctx.__els[id] = ctx.__els[id] || mkEl()),
      createElement: () => mkEl(),
      body: mkEl(),
      _ls: {},
      addEventListener(type, fn){ (this._ls[type] = this._ls[type] || []).push(fn) },
    },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: k => { delete store[k] },
    },
    performance: { now: () => 0 },
    requestAnimationFrame: fn => { if (ctx.__rafDepth < 4) { ctx.__rafDepth++; try { fn() } finally { ctx.__rafDepth-- } } return 0 },
    cancelAnimationFrame: () => {},
    fetch: () => new Promise(() => {}),
    Image: class { constructor(){ this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0 } set src(v){ this._src = v } get src(){ return this._src } },
    navigator: { clipboard: { writeText: async () => {} } },
    _ls: {},
    addEventListener(type, fn){ (ctx._ls[type] = ctx._ls[type] || []).push(fn) },
    removeEventListener(){},
    __els: {}, __rafDepth: 0,
    console,
    Math, JSON, Date, Object, Array, Number, String, Boolean, Uint8Array, Uint8ClampedArray,
    DataView, ArrayBuffer, Promise, Error, RegExp, isNaN, parseInt, parseFloat, setTimeout,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.WEAPON_ART = (() => {
    const o = {};
    for (const d of manifest.designs) o[d.id] = 'x';
    for (const [id, rec] of Object.entries(manifest.held || {}))
      for (const dir of Object.keys(rec.dirs || {})) o[`held_${id}__${dir}`] = 'x';
    return o;
  })();
  ctx.CLASS_SKINS = JSON.parse(read('assets/class_skins_data.js').match(/window\.CLASS_SKINS\s*=\s*(\{[\s\S]*\});/)[1]);
  ctx.WEAPON_PROPOSAL_DEFAULT = DEF;   // what <script src="../assets/weapon_proposal_data.js"> gives the page

  const v = vm.createContext(ctx);
  try {
    vm.runInContext(code, v, { filename: 'weapon_proposal.html' });
  } catch (e) {
    fail++; console.log('  FAIL: the page script threw on boot: ' + e.message);
  }
  // fire a DOM event at a stub element / at the document, honouring stopPropagation
  const fire = (target, type, ev) => {
    for (const fn of ((target._ls && target._ls[type]) || [])) {
      let stopped = false;
      const e = Object.assign({ preventDefault(){}, stopPropagation(){ stopped = true } }, ev);
      fn(e);
      if (stopped) return true;
    }
    return false;
  };
  let probe = null;
  try {
    vm.runInContext('globalThis.__probe={state,viewsOf,viewsAny,viewOn,vw,entry,classOff,anyOn,handBox,proposalJSON,blankView,refreshAll,refreshViewTable,views:VIEWS,el:id=>document.getElementById(id),geom:()=>({...geom}),viewFrames,placed,setFrame,clearFrame,importProgress,copyClassToOtherSex,autoHand,paintCell,sheetViewOf,tunedState,tuneCounts,sheetTiles:()=>sheetTiles,changedJSON,snapshot,viewOut,kb,order:CLASS_ORDER,ang:f=>ANGLE[FAMILIES[f]]};', v);
    probe = ctx.__probe;
  } catch (e) {
    fail++; console.log('  FAIL: could not reach the page internals: ' + e.message);
  }

  if (probe) {
    // frozen by default: placement against a still frame is the whole point
    ok(probe.state.playing === false, 'the page starts FROZEN (placement is not against a moving sprite)');
    ok(probe.state.pick === false, '"Set hand" starts off');
    {
      const st = probe.el('stage');
      st.classList.add('drag');
      probe.state.pick = true; probe.refreshAll();
      ok(st.classList.contains('pick'), 'pick mode turns the canvas into a crosshair');
      ok(st.classList.contains('drag'),
        'pick mode adds its class instead of replacing the others (the drag cursor survives)');
      ok(st._cl && true, 'stub sanity');
      probe.state.pick = false; probe.refreshAll();
      ok(!st.classList.contains('pick'), 'leaving pick mode removes the crosshair again');
    }

    // ---- the shipped default: the owner's progress is what the page opens on ----
    {
      ok(probe.viewOn('Novice', 'S') === false && probe.viewOn('Novice', 'SE') === false &&
         probe.viewOn('Novice', 'NE') === false && probe.viewOn('Novice', 'attack') === true,
        "the page opens on the owner's Novice: bare on South/South-East/North-East, armed on Attack");
      const Na = probe.placed('Novice', 'attack', 0, 'm');
      ok(Na.hx === 87 && Na.hy === 115 && Na.rot === -344,
        `and on their first attack frame for it (got ${Na.hx},${Na.hy},${Na.rot})`);
      ok(Na.scale === 0.6, "the owner's 0.6 size for that dagger is loaded");
      ok(probe.placed('Swordman', 'attack', 5, 'm').hx === 119,
        "the Swordman's sixth attack frame is loaded");
      ok(probe.placed('Swordman', 'attack', 4, 'm').fx === -1, 'and so is its mirror');
      ok(probe.placed('Archer', 'attack', 2, 'm').scale === 1.25,
        'the Archer frame keeps its own size');
      ok(probe.placed('Merchant', 'S', 0, 'm').rot === -8, "the Merchant's axe angle is loaded");
      ok(probe.viewsOf('High Priest').length === 5, 'the High Priest still has five views');
      ok(probe.vw('Thief', 'S', 'm').hx === null,
        'a hand the owner left on automatic is still automatic');

      // ---- the female sprite ----
      ok(probe.state.sex === 'm', 'the page starts on the male sprite');
      ok(probe.viewsOf('Knight', 'f').length === 4, 'the female Knight has her own view list');
      ok(probe.viewFrames('Knight', 'attack', 'm') === 9 &&
         probe.viewFrames('Knight', 'attack', 'f') === 5,
        "and her attack is 5 drawings, not the male sprite's 9");
      const mg = probe.autoHand('Knight', 'm', 'S'), fg = probe.autoHand('Knight', 'f', 'S');
      ok(mg[0] !== fg[0] || mg[1] !== fg[1],
        'each sprite guesses its own hand from its own art');
      probe.state.view = 'attack'; probe.state.sex = 'f'; probe.state.frame = 8; probe.refreshAll();
      ok(probe.state.frame === 4,
        'switching to the female clamps the frame to one she has (her attack is 5, not 9)');
      probe.state.sex = 'm'; probe.state.frame = 0; probe.refreshAll();

      // a hand set on one sprite must not move the other
      probe.state.sel = 'Mage'; probe.state.view = 'attack'; probe.refreshAll();
      probe.vw('Mage', 'attack', 'm').hx = 11; probe.vw('Mage', 'attack', 'm').hy = 22;
      ok(probe.vw('Mage', 'attack', 'f').hx !== 11, 'a hand set on the male leaves the female alone');
      probe.copyClassToOtherSex();
      ok(probe.vw('Mage', 'attack', 'f').hx === 11,
        '"copy this class to the other gender" drops the whole class onto her');
      ok(probe.vw('Mage', 'S', 'f').rot === probe.vw('Mage', 'S', 'm').rot,
        'and copies every view, not just the one on screen');

      // the export carries both sprites
      const both = JSON.parse(probe.proposalJSON()).classes.Knight.views;
      ok(both.m && both.f, 'the hand-back has a block per sprite');
      ok(both.m.attack.frames.length === 9 && both.f.attack.frames.length === 5,
        'each sprite exports its own number of drawings');
      // a sprite whose drawing count differs does not inherit frame numbers set for the
      // other sprite: her frames are the same count, so the Novice keeps his; the Knight
      // attack does not (his 9, her 5)
      const kn = JSON.parse(probe.proposalJSON()).classes.Knight.views;
      ok(kn.m.attack.frames.filter(f => f.src === 'frame').length === 9,
        'the Knight default carries the owner\'s nine male attack frames');
      ok(kn.f.attack.frames.filter(f => f.src === 'frame').length === 5 &&
         kn.f.attack.frames[0].hand[0] === 124 && kn.f.attack.frames[0].dx === -14,
        'her five attack drawings carry the separate placements from the latest female pass');
      probe.state.sex = 'f'; probe.state.sel = 'Knight'; probe.state.view = 'attack';
      probe.refreshAll();
      ok(/drawings against his/.test(probe.el('nSex').innerHTML),
        'and the page says her frame count differs from his');
      probe.state.sex = 'm'; probe.refreshAll();

      // a hand-back with 9 male attack frames must not be pasted onto her 5
      const hb = {page:'weapon-proposal',version:3,classes:{Knight:{family:'sword',design:'sword_knight',
        views:{attack:{weapon:true,blend:true,base:{hand:[70,90],handAuto:false,dx:0,dy:0,rot:10,scale:1,flip:[1,1]},
          frames:[0,1,2,3,4,5,6,7,8].map(i=>({hand:[60+i,100+i],dx:0,dy:0,rot:10,scale:1,flip:[1,1],src:'frame'}))}}}}};
      probe.importProgress(hb);
      ok(probe.placed('Knight','attack',0,'m').hx === 60, 'his 9 frames are taken on the male sprite');
      ok(probe.placed('Knight','attack',0,'f').hx === 70,
        'and hers fall back to the shared hand, not to his nine');
      ok(probe.vw('Knight','attack','f').frames && Object.keys(probe.vw('Knight','attack','f').frames).length === 0,
        'nothing of his was written into her frame records');
      ok(probe.state.importNote && /female sprite/.test(probe.state.importNote),
        'and the page says why');
      probe.el('default').onclick();     // back to the shipped default for the rest of the checks

      // --- the short hand-back -------------------------------------------------------
      // The owner's complaint: the export is "very very very long" because it resolves
      // every frame of every view of both sprites, so pasting it back is painful.  The
      // short one carries only what has changed, and has to rebuild the same state.
      const emptyChg = JSON.parse(probe.changedJSON());
      ok(emptyChg.version === 5 && emptyChg.kind === 'changes',
        'the short hand-back says what it is (v5, changes against the saved default)');
      ok(Object.keys(emptyChg.classes).length === 0,
        'with nothing touched it is empty — no class, no frames, nothing to read');
      const fullTxt = probe.proposalJSON(), emptyTxt = probe.changedJSON();
      ok(emptyTxt.length * 20 < fullTxt.length,
        `the empty one is far smaller than the full export (${emptyTxt.length} vs ${fullTxt.length} chars)`);

      // one frame of one class: exactly what the owner does, dozens of times a session
      const snapBefore = probe.snapshot();
      const knightFrame = probe.placed('Knight', 'attack', 4, 'm');
      probe.setFrame('Knight', 'attack', 4, { hx: 91, hy: 88, dx: 7, dy: -3, rot: -66, scale: 1.15, fx: -1 }, 'm');
      const editedSnap = probe.snapshot();
      const oneChg = probe.changedJSON(), oneObj = JSON.parse(oneChg);
      ok(JSON.stringify(Object.keys(oneObj.classes)) === '["Knight"]',
        'after moving one frame of one class, the short hand-back carries only that class');
      ok(Object.keys(oneObj.classes.Knight.views).join(',') === 'm',
        'only the sprite that was touched');
      ok(Object.keys(oneObj.classes.Knight.views.m).join(',') === 'attack',
        'only the view that was touched');
      ok(oneObj.classes.Knight.views.m.attack.frames['4'].hand[0] === 91 &&
         oneObj.classes.Knight.views.m.attack.frames['4'].flip[0] === -1,
        'and it carries the new numbers for that frame');
      ok(oneChg.length * 100 < fullTxt.length,
        `that hand-back is under a hundredth of the full export (${oneChg.length} vs ${fullTxt.length} chars, `
        + `${probe.kb(oneChg)} vs ${probe.kb(fullTxt)})`);
      ok(oneChg.indexOf('\n') === -1 && fullTxt.indexOf('\n') > 0,
        'the hand-back the owner pastes is one compact line; the full backup stays readable');
      ok(oneObj.classes.Knight.views.m.attack.frames['0'] !== undefined &&
         Object.keys(oneObj.classes.Knight.views.m.attack.frames).length === 9,
        'the whole view comes with it (9 rows) — a hand-back replaces the view it names, so a partial one would drop rows');

      // the property that matters: loading the short hand-back rebuilds the same state
      probe.el('default').onclick();
      ok(JSON.stringify(probe.snapshot()) === JSON.stringify(snapBefore),
        'the reset really is the shipped default');
      probe.importProgress(oneObj);
      ok(JSON.stringify(probe.snapshot()) === JSON.stringify(editedSnap),
        'loading the short hand-back rebuilds the edited state exactly — every class, view and frame');

      // and if a frame is cleared, the short hand-back says so by leaving its row out
      // (copy it while the edit is on screen - after "back to the saved default" there is
      //  nothing to send, which is right: the state IS the default again)
      probe.clearFrame('Knight', 'attack', 4, 'm');
      const clearedSnap = probe.snapshot();
      const clearedDelta = JSON.parse(probe.changedJSON());
      const clearedRows = clearedDelta.classes.Knight.views.m.attack.frames;
      ok(clearedRows['4'] === undefined && Object.keys(clearedRows).length === 8,
        'the cleared frame has no row in the hand-back (8 rows, not 9)');
      probe.el('default').onclick(); probe.importProgress(clearedDelta);
      ok(JSON.stringify(probe.snapshot()) === JSON.stringify(clearedSnap),
        'a frame the owner cleared comes back cleared, not as the old numbers');
      probe.el('default').onclick();
      ok(JSON.parse(probe.changedJSON()).classes.Knight === undefined,
        'and once the page is back on the saved default there is nothing to send at all');

      // a design swap and a per-view off switch travel too, and only what changed
      probe.el('default').onclick();
      probe.entry('Knight').design = 'sword_elem';
      probe.vw('Knight', 'attack', 'f').on = false;
      const twoObj = JSON.parse(probe.changedJSON());
      ok(twoObj.classes.Knight.design === 'sword_elem',
        'a design swap is in the short hand-back');
      ok(twoObj.classes.Knight.views.f.attack.weapon === false,
        'so is switching the weapon off on one view');
      ok(twoObj.classes.Knight.views.m === undefined,
        'and nothing else rides along');
      const beforeTwo = probe.snapshot();
      probe.el('default').onclick(); probe.importProgress(twoObj);
      ok(JSON.stringify(probe.snapshot()) === JSON.stringify(beforeTwo),
        'loading it rebuilds both changes together');
      probe.el('default').onclick();

      // Round-trip: re-exporting the shipped default must reproduce the file, number for
      // number, apart from the in-between rows the file is deliberately not supposed to
      // carry.  If this ever drifts, the owner's next paste-back would show phantom
      // differences and their own tuning would look like it had moved when it had not.
      const rt = JSON.parse(probe.proposalJSON());
      const rtBad = [];
      const r2 = x => +(+x).toFixed(2);
      for (const [n, c] of Object.entries(DEF.classes)) {
        const rc = rt.classes[n];
        if (!rc) { rtBad.push(`${n}: missing from the export`); continue; }
        if (rc.family !== c.family) rtBad.push(`${n}: family ${rc.family} vs ${c.family}`);
        if (rc.design !== c.design) rtBad.push(`${n}: design ${rc.design} vs ${c.design}`);
        for (const sex of ['m', 'f']) {
          for (const [v, V] of Object.entries(c.views[sex])) {
            const R = rc.views[sex][v];
            const at = `${n}/${sex}/${v}`;
            if (!R) { rtBad.push(`${at}: missing from the export`); continue; }
            if (R.weapon !== V.weapon) rtBad.push(`${at}: weapon ${R.weapon} vs ${V.weapon}`);
            if (R.blend !== V.blend) rtBad.push(`${at}: blend ${R.blend} vs ${V.blend}`);
            if (R.base.handAuto !== V.base.handAuto) rtBad.push(`${at}: handAuto ${R.base.handAuto} vs ${V.base.handAuto}`);
            for (const k of ['dx', 'dy', 'rot', 'scale']) {
              if (r2(R.base[k]) !== r2(V.base[k])) rtBad.push(`${at}: base.${k} ${R.base[k]} vs ${V.base[k]}`);
            }
            if (JSON.stringify(R.base.flip) !== JSON.stringify(V.base.flip)) rtBad.push(`${at}: base.flip`);
            // a hand the owner chose must survive untouched; an automatic one is allowed to
            // come back as the resolved guess, which is what the import undoes
            if (V.base.handAuto === false && String(R.base.hand) !== String(V.base.hand)) {
              rtBad.push(`${at}: base.hand ${JSON.stringify(R.base.hand)} vs ${JSON.stringify(V.base.hand)}`);
            }
            const mine = R.frames.filter(f => f.src === 'frame').length;
            const theirs = Object.entries(V.frames);
            if (mine !== theirs.length) rtBad.push(`${at}: ${mine} hand-set frames exported vs ${theirs.length} stored`);
            for (const [i, f] of theirs) {
              const g = R.frames[Number(i)];
              if (!g || g.src !== 'frame') { rtBad.push(`${at}#${i}: exported as ${g && g.src}`); continue; }
              for (const k of ['dx', 'dy', 'rot', 'scale']) {
                if (r2(g[k]) !== r2(f[k])) rtBad.push(`${at}#${i}: ${k} ${g[k]} vs ${f[k]}`);
              }
              if (String(g.hand) !== String(f.hand)) rtBad.push(`${at}#${i}: hand ${JSON.stringify(g.hand)} vs ${JSON.stringify(f.hand)}`);
              if (JSON.stringify(g.flip) !== JSON.stringify(f.flip)) rtBad.push(`${at}#${i}: flip`);
            }
          }
        }
      }
      ok(rtBad.length === 0,
        rtBad.length ? 're-exporting the default drifts from the file: ' + rtBad.slice(0, 6).join('; ')
                     : 're-exporting the shipped default reproduces every class, view, flag, hand and frame number unchanged');

      // "Every class at a glance": one small live tile per class, drawn with the very same
      // composite as the stage, plus a plain status line so the owner can see where her
      // pass stands without clicking through 19 classes.
      const sheetBox = probe.el('sheet'), sheetBtn = probe.el('sheetBtn');
      ok(typeof sheetBtn.onclick === 'function' && sheetBox.hidden !== false,
        'the pictures start hidden, so the page still opens on the picker');
      sheetBtn.onclick();
      ok(sheetBox.hidden === false, 'the button shows them');
      const tiles = probe.sheetTiles();
      ok(tiles.length === 19, `one tile per class (got ${tiles.length})`);
      ok(tiles.map(t => t.cls).join('|') === probe.order.join('|'),
        'the tiles run in the same order as the class list');
      ok(tiles.every(t => t.cv.width === 96 && t.cv.height === 96),
        'each tile is a small canvas of its own');
      ok(tiles.every(t => t.st.textContent !== '' && t.bd && t.t.children.length === 4),
        'and each carries its own name, status line and badge');
      ok(tiles.every(t => t.cls && probe.sheetViewOf(t.cls, 'm') !== undefined),
        'every tile knows which view it shows');
      const her = probe.order.filter(n => probe.tunedState(n, 'f') === 'other');
      ok(her.join(',') === 'Archer',
        'the one class still using identical male/female placements is flagged (' + her.join(', ') + ')');
      ok(probe.order.filter(n => probe.tunedState(n, 'f') === 'none').length === 2,
        'only two female sprites are still untuned');
      ok(probe.order.filter(n => probe.tunedState(n, 'f') === 'own').length === 14 &&
         probe.order.filter(n => probe.tunedState(n, 'f') === 'mixed').length === 2,
        'the female overview distinguishes fourteen tuned, two partly tuned and one still matching the male');
      const hisNone = probe.order.filter(n => probe.tunedState(n, 'm') === 'none');
      ok(hisNone.join(',') === 'Whitesmith',
        'High Priest now has male placements; Whitesmith remains the one untuned male sprite');
      probe.state.sex = 'f'; probe.refreshAll();
      ok(/female/.test(probe.el('sheetTag').textContent),
        'the strip follows the ♂/♀ switch');
      ok(/on her own numbers: <b>14<\/b>/.test(probe.el('sheetNote').innerHTML) &&
         /still his numbers: <b>1<\/b>/.test(probe.el('sheetNote').innerHTML) &&
         /partly his, part untouched: <b>2<\/b>/.test(probe.el('sheetNote').innerHTML) &&
         /not tuned yet: <b>2<\/b>/.test(probe.el('sheetNote').innerHTML),
        'the line above the tiles says where her pass stands: '
        + probe.el('sheetNote').innerHTML.replace(/<[^>]+>/g, ''));
      tiles[6].t.onclick();
      ok(probe.state.sel === tiles[6].cls && probe.state.view === probe.sheetViewOf(tiles[6].cls, 'f'),
        'clicking a tile works on that class, on the view the tile shows');
      probe.state.sex = 'm'; probe.refreshAll();
      sheetBtn.onclick();
      ok(sheetBox.hidden === true, 'and the button hides them again');

      // the composite rule itself, on a context we can read: a bare view paints no weapon,
      // an armed view paints it exactly on the stored hand plus offset
      const mkCtx = () => {
        const calls = [];
        const f = name => (...a) => { calls.push([name, ...a]) };
        return { calls, clearRect: f('clearRect'), save: f('save'), restore: f('restore'),
          beginPath: f('beginPath'), moveTo: f('moveTo'), lineTo: f('lineTo'), stroke: f('stroke'),
          arc: f('arc'), translate: f('translate'), rotate: f('rotate'), scale: f('scale'),
          drawImage: f('drawImage'), setLineDash: f('setLineDash'), fillText: f('fillText') };
      };
      vm.runInContext("stripCache['Knight|m|S']={cv:{},w:200,h:200,n:8,delays:[75]};"
                    + "stripCache['Knight|m|attack']={cv:{},w:200,h:200,n:9,delays:[75]};"
                    + "weaponImg[designOf('Knight')]={complete:true,naturalWidth:32,naturalHeight:32};", v);
      const c1 = mkCtx();
      const got1 = probe.paintCell(c1, 96, 96, { cls:'Knight', sex:'m', view:'S', fi:0, z:0.48, ox:0, oy:0, mk:4 });
      ok(got1 === true && c1.calls.filter(x => x[0] === 'drawImage').length === 1,
        'a bare view paints the body and no weapon at all');
      const c2 = mkCtx();
      probe.paintCell(c2, 96, 96, { cls:'Knight', sex:'m', view:'attack', fi:4, z:0.48, ox:0, oy:0, mk:4 });
      ok(c2.calls.filter(x => x[0] === 'drawImage').length === 2,
        'the armed attack view paints the body and then the weapon');
      const P = probe.placed('Knight', 'attack', 4, 'm');
      const tr = c2.calls.find(x => x[0] === 'translate');
      ok(tr && Math.abs(tr[1] - (P.hx + (P.dx || 0)) * 0.48) < 0.01 &&
             Math.abs(tr[2] - (P.hy + (P.dy || 0)) * 0.48) < 0.01,
        'and it puts the weapon exactly on the stored hand plus offset');
      const rt2 = c2.calls.find(x => x[0] === 'rotate');
      const wantDeg = (vm.runInContext('ANGLE.sword', v)['attack'] || 0) + P.rot;
      ok(rt2 && Math.abs(rt2[1] * 180 / Math.PI - wantDeg) < 0.01,
        "at the family angle plus the frame's own rotation");

      const nv = JSON.parse(probe.proposalJSON()).classes.Novice.views;
      ok(nv.f.S.base.handAuto === false && nv.f.S.base.hand[0] === 87,
        "a hand the owner really chose is carried to the female sprite too");
      ok(both.m.S.base.handAuto === true && both.f.S.base.handAuto === true,
        'a hand they left automatic stays a guess on both sprites');
      ok(both.f.S.base.hand[0] !== both.m.S.base.hand[0],
        'and each sprite guesses from its own art, so the two guesses differ');

      // and the way back
      probe.el('default').onclick();
      ok(probe.placed('Novice', 'attack', 0, 'm').hx === 87,
        '"back to the saved default" restores the owner\'s numbers');
      ok(probe.vw('Mage', 'attack', 'm').hx === null,
        'including wiping a hand that was set after the default was shipped');
      probe.state.sel = 'Knight'; probe.state.view = 'S'; probe.state.sex = 'm';
      probe.state.frame = 0; probe.refreshAll();
    }

    // N is offered only where the class actually has that drawing
    ok(probe.viewsOf('Knight').length === 4, 'Knight has four views (S, SE, NE, attack)');
    ok(probe.viewsOf('High Priest').indexOf('N') >= 0,
      'High Priest, which ships its own N drawing, gets a North view too');

    // the owner's example: bare on South and South-East, armed only while attacking
    probe.entry('Knight').off = false;
    for (const vw_ of probe.viewsOf('Knight')) probe.vw('Knight', vw_).on = true;
    probe.vw('Knight', 'S').on = false;
    probe.vw('Knight', 'SE').on = false;
    ok(probe.viewOn('Knight', 'S') === false, 'South can be set bare-handed');
    ok(probe.viewOn('Knight', 'SE') === false, 'South-East can be set bare-handed');
    ok(probe.viewOn('Knight', 'attack') === true, 'Attack (SE) keeps its weapon');
    ok(probe.viewOn('Knight', 'NE') === true, 'North-East is unaffected by the South-only change');
    ok(probe.anyOn('Knight') === true, 'the class still counts as armed');

    // the ✕ is a whole-job switch that overrides every view
    probe.entry('Mage').off = true;
    ok(probe.viewsOf('Mage').every(vw_ => probe.viewOn('Mage', vw_) === false),
      'the job-level "no weapon" switch turns every one of its views off');

    // what the owner will actually click: the rendered "Weapon per view" rows
    const tbl = probe.el('viewTable');
    const boxes = tbl.querySelectorAll('input[type=checkbox]');
    ok(boxes.length === probe.viewsOf('Knight').length,
      `the Weapon-per-view table renders one checkbox per view (${boxes.length} boxes, ${probe.viewsOf('Knight').length} views)`);
    const bS = boxes.find(b => b.dataset.view === 'S');
    ok(!!bS, 'the table has a checkbox for the South view');
    if (bS) {
      bS.checked = false;                                   // the owner unticking South
      bS.onchange({ stopPropagation(){} });
      ok(probe.viewOn('Knight', 'S') === false, 'unticking a view checkbox leaves that view bare-handed');
      ok(probe.viewOn('Knight', 'attack') === true, 'unticking one view does not disarm the others');
      bS.checked = true;                                    // and ticking it back on
      bS.onchange({ stopPropagation(){} });
      ok(probe.viewOn('Knight', 'S') === true, 'ticking a view checkbox gives that view its weapon back');
    }
    const rows = probe.el('clsList');
    ok(rows.children.length === 19, `the class list renders all 19 jobs (${rows.children.length})`);
    const rowText = r => [r._html, ...r.children.map(c => c.textContent)].join(' ');
    ok(rows.children.some(r => /✕|—/.test(rowText(r))),
      'the class list shows the job-level no-weapon button (row text: ' +
      JSON.stringify(rowText(rows.children[0])) + ')');

    // the hand: automatic until the owner sets one, and the hand is per class AND view
    const auto = probe.handBox('Knight', 'm', 'S');
    ok(auto[2] === true, 'an untouched view reports its hand as the automatic guess');
    probe.vw('Knight', 'S').hx = 96; probe.vw('Knight', 'S').hy = 141;
    const set = probe.handBox('Knight', 'm', 'S');
    ok(set[0] === 96 && set[1] === 141 && set[2] === false,
      'a hand the owner picked is used exactly as picked');
    ok(probe.handBox('Knight', 'm', 'SE')[2] === true,
      'picking a hand for South does not move South-East (the hand is per view)');

    // the hand-back must carry all of it - untick South through the table, as the owner would
    bS.checked = false; bS.onchange({ stopPropagation(){} });
    const out = JSON.parse(probe.proposalJSON());
    ok(out.version === 4, 'the export is the v4 shape (per sprite, per frame)');
    const k = out.classes.Knight.views.m;
    ok(out.classes.Knight.family === 'sword', 'the export names the family');
    ok(k.S.weapon === false && k.SE.weapon === false && k.attack.weapon === true,
      'the export carries the per-view weapon switches');
    ok(Array.isArray(k.S.base.hand) && k.S.base.hand[0] === 96 && k.S.base.hand[1] === 141,
      'the export carries the shared hand');
    ok(k.S.base.handAuto === false, 'and says that hand was chosen, not guessed');
    ok(k.SE.base.handAuto === true, 'a view nobody touched still says its hand is the guess');
    ok(out.classes.Mage.design !== undefined, 'every job exports a design (or null when switched off)');
    ok(Object.keys(out.classes).length === 19, 'the export covers all 19 classes');
    for (const [name, rec] of Object.entries(out.classes)) {
      ok(rec.views && rec.views.m && rec.views.f,
        `${name} exports both sprites`);
      ok(Object.keys(rec.views.m).length >= 4,
        `${name} exports a view entry for every view the male sprite has`);
      for (const [vn, vv] of Object.entries(rec.views.m)) {
        ok(typeof vv.weapon === 'boolean' && vv.base && typeof vv.base.dx === 'number' &&
           typeof vv.base.dy === 'number' && typeof vv.base.rot === 'number' &&
           typeof vv.base.scale === 'number' && Array.isArray(vv.base.hand),
          `${name}/${vn} exports the shared placement`);
        ok(Array.isArray(vv.frames) && vv.frames.length >= 5,
          `${name}/${vn} exports a placement for every drawing (${vv.frames.length})`);
        void vv;
        const bad = vv.frames.findIndex(f => !Array.isArray(f.hand) || typeof f.dx !== 'number' ||
          typeof f.dy !== 'number' || typeof f.rot !== 'number' || typeof f.scale !== 'number' ||
          !Array.isArray(f.flip) || !f.src);
        ok(bad === -1, `${name}/${vn} frames are all complete (first bad: ${bad})`);
      }
    }

    // ---- 🎯 Set hand: the click the owner makes, end to end ----
    {
      const st = probe.el('stage');
      st.dataset.view = 'S';
      probe.state.sel = 'Knight'; probe.state.view = 'S';
      const V = probe.vw('Knight', 'S');
      V.dx = 7; V.dy = -9;                      // an earlier drag left the weapon off the hand
      V.hx = null; V.hy = null;
      const F = () => probe.placed('Knight', 'S', probe.state.frame);
      probe.state.pick = true;

      // where sprite pixel (100, 120) sits on the canvas, using the page's own geometry
      const g = probe.geom();
      const clientX = g.ox + 100 * g.z, clientY = g.oy + 120 * g.z;
      const eaten = fire(ctx.document, 'pointerdown', { clientX, clientY, target: st });
      ok(eaten, 'in "Set hand" mode the click is taken by the page before anything else sees it');

      ok(F().hx === 100 && F().hy === 120,
        `clicking sprite pixel (100,120) sets the hand exactly there (got ${F().hx},${F().hy})`);
      ok(F().dx === 0 && F().dy === 0,
        'the click snaps the weapon onto that point instead of keeping the old nudge');
      const hb = probe.handBox('Knight', 'm', 'S', probe.state.frame);
      ok(hb[0] === 100 && hb[1] === 120 && hb[2] === false,
        'the weapon now grips the clicked pixel (drawing and the click agree)');
      ok(V.hx === null, 'and it is recorded on that frame, not smeared over the whole view');
      ok(/is set where you click|click the sprite/.test(probe.el('handLbl').innerHTML),
        'the badge next to the button says what the click will do');
      probe.state.pick = false; probe.refreshAll();
      ok(/hand 100, 120/.test(probe.el('handLbl').innerHTML),
        'leaving the mode shows the hand that was set, in the panel');

      // the same point comes back out of the hand-back
      const out2 = JSON.parse(probe.proposalJSON()).classes.Knight.views.m.S;
      ok(out2.frames[probe.state.frame].hand[0] === 100 &&
         out2.frames[probe.state.frame].hand[1] === 120 &&
         out2.frames[probe.state.frame].dx === 0 && out2.frames[probe.state.frame].dy === 0,
        'the hand-back carries the picked hand, on that frame');
      ok(out2.frames[probe.state.frame].src === 'frame',
        "and marks it as that frame's own placement");

      const click2 = fire(ctx.document, 'pointerdown', { clientX, clientY, target: st });
      ok(!click2, 'with the mode off, a click on the canvas is a plain drag again, not a hand pick');
    }

    // ---- flip ----
    {
      const st = probe.el('stage');
      probe.state.sel = 'Knight'; probe.state.view = 'S';
      const V = probe.vw('Knight', 'S');
      V.fx = 1; V.fy = 1;
      const F = () => probe.placed('Knight', 'S', probe.state.frame);
      fire(ctx, 'keydown', { key: 'f', shiftKey: false, target: { tagName: 'BODY' } });
      ok(F().fx === -1, 'F mirrors the weapon left/right');
      fire(ctx, 'keydown', { key: 'v', shiftKey: false, target: { tagName: 'BODY' } });
      ok(F().fy === -1, 'V flips the weapon up/down');
      fire(ctx, 'keydown', { key: 'f', shiftKey: false, target: { tagName: 'BODY' } });
      ok(F().fx === 1, 'F again mirrors it back');
      ok(F().fy === -1, 'the two flips are independent');

      // the flip buttons beside the numbers
      probe.el('flipX').onclick();
      ok(F().fx === -1, 'the "Flip left/right" button mirrors the weapon');
      probe.el('flipClear').onclick();
      ok(F().fx === 1 && F().fy === 1, 'the "normal" button clears both flips');

      // and the per-view buttons in the table
      const t2 = probe.el('viewTable');
      const fbs = t2.querySelectorAll('button[data-flip]');
      ok(fbs.length === probe.viewsOf('Knight').length * 2,
        'the view table has a mirror and a flip button per view');
      const se = fbs.find(b => b.dataset.view === 'SE' && b.dataset.flip === 'x');
      ok(!!se, 'the South-East row has its own mirror button');
      if (se) {
        se.onclick({ stopPropagation(){} });
        ok(F().fx === 1, 'flipping another view leaves this one alone (the buttons are per view)');
        ok(probe.placed('Knight', 'SE', probe.state.frame).fx === -1,
          'the South-East weapon is mirrored');
      }

      const out3 = JSON.parse(probe.proposalJSON()).classes.Knight.views.m;
      ok(Array.isArray(out3.SE.frames[0].flip) && out3.SE.frames[0].flip[0] === -1,
        'the hand-back carries the flip on the frame it was set on');
      ok(out3.S.frames[0].flip[0] === 1 && out3.S.frames[0].flip[1] === 1,
        'an unflipped view exports 1,1');
      probe.el('flipX').onclick();
      ok(/mirrored/.test(probe.el('nFlip').textContent),
        'the numbers panel says when the weapon is mirrored');
      probe.el('flipClear').onclick();
      ok(/normal/.test(probe.el('nFlip').textContent), 'and says normal again when it is not');
    }

    // ---- placement per frame: the thing the owner reported ----
    {
      const cls = 'Knight', view = 'S';
      const V = probe.vw(cls, view);
      V.frames = {}; V.hx = null; V.hy = null; V.blend = false;
      V.dx = 0; V.dy = 0; V.rot = 0; V.scale = 1; V.fx = 1; V.fy = 1;
      const n = probe.viewFrames(cls, view);
      ok(n === 8, `the page knows a Knight walk has 8 drawings (got ${n})`);
      ok(probe.viewFrames('Knight', 'attack') === 9, 'and that its attack has 9');

      // set two frames to two different places, the way the owner clicks through them
      probe.setFrame(cls, view, 0, { hx: 60, hy: 100 });
      probe.setFrame(cls, view, 4, { hx: 120, hy: 130 });
      ok(probe.placed(cls, view, 0).hx === 60 && probe.placed(cls, view, 4).hx === 120,
        'each frame keeps the hand that was set on it');
      ok(probe.placed(cls, view, 2).hx !== probe.placed(cls, view, 0).hx,
        'and a frame in between is NOT stuck on the first one');
      ok(probe.placed(cls, view, 7).src === 'shared',
        'a frame with nothing set and blending off falls back to the shared numbers');

      // a lone key must not freeze the whole walk on itself (its own view, nothing else set)
      const LV = probe.vw(cls, 'NE');
      LV.frames = {}; LV.blend = true;
      probe.setFrame(cls, 'NE', 0, { hx: 50, hy: 90 });
      ok(probe.placed(cls, 'NE', 3).src === 'shared',
        'one frame set and blending on: the other frames still use the shared placement');
      ok(probe.placed(cls, 'NE', 0).hx === 50, 'while the frame you set keeps its own hand');
      LV.frames = {};

      // blending: two keys, straight line in between
      V.blend = true;
      const mid = probe.placed(cls, view, 2);
      ok(mid.src === 'blend', 'with blending on, the frames in between report as blended');
      ok(Math.abs(mid.hx - 90) < 0.01 && Math.abs(mid.hy - 115) < 0.01,
        `frame 3 of 8 sits halfway between the two keys (got ${mid.hx},${mid.hy}, expected 90,115)`);
      ok(probe.placed(cls, view, 6).hx === 120, 'after the last key the weapon holds its place');
      // a mirror cannot be blended: it must stay a real -1 or 1, never 0
      probe.setFrame(cls, view, 0, { fx: -1 }); probe.setFrame(cls, view, 4, { fx: 1 });
      ok(probe.placed(cls, view, 1).fx === -1 && probe.placed(cls, view, 3).fx === 1 &&
         probe.placed(cls, view, 2).fx === probe.placed(cls, view, 2).fx,
        'a mirror between two frames snaps to the nearer frame instead of averaging to nothing');
      probe.setFrame(cls, view, 0, { fx: 1 });
      V.blend = false;
      ok(probe.placed(cls, view, 2).src === 'shared', 'turning blending off goes back to shared');

      // playing the animation must give a different placement per frame - the bug report
      const seen = new Set();
      for (let i = 0; i < n; i++) seen.add(probe.placed(cls, view, i).hx);
      ok(seen.size > 1,
        'playing the animation moves the weapon (frames do not all share one placement)');

      // the export matrix, before the copy/clear tools move anything
      V.blend = true;
      const out4 = JSON.parse(probe.proposalJSON()).classes.Knight.views.m;
      ok(out4.S.frames.length === 8, 'the export lists one placement per drawing (Knight walk: 8)');
      ok(out4.S.frames[0].hand[0] === 60 && out4.S.frames[4].hand[0] === 120,
        "the exported matrix carries each frame's own hand");
      ok(out4.S.frames[2].src === 'blend' && Math.abs(out4.S.frames[2].hand[0] - 90) < 0.01,
        'and the blended frames come out already worked out, so the game does not have to guess');
      ok(out4.S.frames[7].src === 'blend', 'the last frame of the walk is covered too');
      ok(Object.keys(out4).length === 4, 'Knight exports its four views');
      ok(out4.attack.frames.length === 9, 'the attack view exports 9 frames');
      ok(out4.S.base.handAuto === true, 'the shared hand is still flagged as the automatic guess');
      const hp = JSON.parse(probe.proposalJSON()).classes['High Priest'];
      ok(hp.views.m.attack.frames.length === 5, 'High Priest attack exports its own 5 frames');

      // the tools
      probe.state.frame = 3;
      probe.setFrame(cls, view, 3, { hx: 77, hy: 88 });
      probe.el('frameCopy').onclick();
      let all = true;
      for (let i = 0; i < n; i++) if (probe.placed(cls, view, i).hx !== 77) all = false;
      ok(all, '"copy to every frame" gives every drawing the placement you are looking at');
      probe.el('frameClear').onclick();
      ok(probe.placed(cls, view, 3).src !== 'frame' || probe.placed(cls, view, 3).hx !== 77,
        '"clear this frame" takes that frame\'s own placement away');
      ok(probe.placed(cls, view, 4).hx === 77,
        'and leaves the frames you did not clear alone');
    }
  }
}

console.log(`weapon proposal: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
