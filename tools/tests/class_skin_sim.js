// The live class skins: every one of the game's 19 classes wears its own uploaded ANIMATED PNG,
// in both genders, with the routes, mirrors, fallbacks and the browser-driven frame copy the
// game asks for.
//   node tools/tests/class_skin_sim.js
//
// It runs the game's real skin code (extracted out of index.html) against the real generated
// manifest (assets/class_skins_data.js) and the real source files, and it cross-checks the
// direction table against the canonical viewer (Updates/Sprite/index.html), so the preview page
// and the game can never disagree about which file belongs to which class, gender, pose or mirror.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const grab = (a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error('missing ' + a);
  return src.slice(i, j);
};
let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
};
console.log('class skins: the live hero art, every class and gender\n');

// ---------- APNG metadata straight out of the source files ----------
function apngMeta(file) {
  const data = fs.readFileSync(file);
  let pos = 8, frames = null, plays = null, fctl = 0, width = 0, height = 0;
  const delays = [];
  while (pos + 8 <= data.length) {
    const length = data.readUInt32BE(pos), kind = data.toString('latin1', pos + 4, pos + 8);
    const chunk = data.subarray(pos + 8, pos + 8 + length);
    if (kind === 'IHDR') { width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4); }
    if (kind === 'acTL') { frames = chunk.readUInt32BE(0); plays = chunk.readUInt32BE(4); }
    if (kind === 'fcTL') { fctl++; delays.push([chunk.readUInt16BE(20), chunk.readUInt16BE(22)]); }
    pos += 12 + length;
    if (kind === 'IEND') break;
  }
  return { width, height, frames, plays, fctl, delays };
}

// ---------- the real manifest, the real code ----------
const manifestSrc = fs.readFileSync(path.join(ROOT, 'assets/class_skins_data.js'), 'utf8');
const dataBox = { window: {} };
vm.createContext(dataBox);
vm.runInContext(manifestSrc + '\nthis.__s={CLASS_SKINS:window.CLASS_SKINS};', dataBox);
const CLASS_SKINS = dataBox.__s.CLASS_SKINS;
const SPRITE_DIR = path.join(ROOT, CLASS_SKINS.dir);

const plain = v => JSON.parse(JSON.stringify(v));
const deepEq = (actual, expected, message) => assert.deepStrictEqual(plain(actual), expected, message);
const close = (actual, expected, message, eps = 1e-9) => assert.ok(Math.abs(actual - expected) < eps,
  `${message} (${actual} vs ${expected})`);

function ImageStub() {
  const im = { complete: false, naturalWidth: 0, naturalHeight: 0, onload: null, onerror: null, dataset: {}, style: { cssText: '' }, alt: '', draggable: true, decoding: '' };
  im.fire = (kind) => {                       // the test decides when the class art arrives
    if (kind === 'error') { im.onerror && im.onerror(); return; }
    im.complete = true; im.naturalWidth = 200; im.naturalHeight = 200;
    im.onload && im.onload();
  };
  Object.defineProperty(im, 'src', {           // the packed atlases are data URLs: they are simply there
    get: () => im._src,
    set: (value) => { im._src = value; if (/^data:/.test(value)) im.fire('load'); },
  });
  return im;
}
function boot(options = {}) {
  const draws = [], appended = [];
  const element = () => ({ id: '', dataset: {}, style: { cssText: '', display: '' }, textContent: '', appendChild(c) { appended.push(c); return c; }, setAttribute() {},
    width: 0, height: 0,
    getContext: () => ({ imageSmoothingEnabled: false, clearRect() {}, drawImage(...a) { draws.push(a); }, setTransform() {}, translate() {}, scale() {} }) });
  const box = { window: {}, document: { body: element(), createElement: element } };
  // frames are [idle 1, walk 8, attack 6]: an anchor per frame, padded to the longest row
  const anchors = Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => [63, 60])));
  const bodies = {};
  for (const name of ['thief', 'assassin', 'assassin_cross', 'novice', 'mage', 'archer', 'aco', 'swordman', 'blacksmith', 'merchant', 'knight', 'lord_knight', 'wizard', 'high_wizard', 'hunter', 'sniper', 'priest', 'high_priest', 'whitesmith'])
    bodies[name] = { atlas: 'data:image/png;base64,AA', anchors };
  box.window.SPRITE_PACK = { cellW: 126, cellH: 134, padL: 15, padT: 38, pivotX: 63, pivotY: 128, frames: [1, 8, 6], hairStyles: 19, bodies, heads: { male: 'data:image/png;base64,AA', female: 'data:image/png;base64,AA' } };
  if (!options.noSkins) box.window.CLASS_SKINS = CLASS_SKINS;
  box.__imageStub = ImageStub;
  box.__appended = appended;
  box.__draws = draws;
  box.THREE = {
    NearestFilter: 1,
    Texture: function (image) { this.image = image; this.repeat = { x: 1, y: 1, set(a, b) { this.x = a; this.y = b; } }; this.offset = { x: 0, y: 0, set(a, b) { this.x = a; this.y = b; } }; this.clone = function () { return new box.THREE.Texture(image); }; },
    CanvasTexture: function (cv) { return new box.THREE.Texture(cv); },
    Sprite: function (material) { this.material = material; this.userData = {};
      this.center = { set(a, b) { this.x = a; this.y = b; } };
      this.scale = { set(a, b) { this.x = a; this.y = b; } }; },
    SpriteMaterial: function (o) { this.map = o.map; },
  };
  vm.createContext(box);
  vm.runInContext(`
    const images=[];
    function Image(){const im=__imageStub();images.push(im);return im}
    let heroKey='',heroSpr=null,heroHeadSpr=null,heroDirty=false;
    const P={added:[],add(s){this.added.push(s)},remove(){}};
    let S=null;
    const $=()=>null;
    const logged=[];function log(m,cls){logged.push(String(m))}
    const getSheet=()=>({clone(){return{}}}),drawHero=()=>{},mkBillboard=()=>({});
    const tabs=[];
  ` + grab("const PACK_BODY={Novice:'novice',", 'function setPackCell(')
    + `
    packReady=true;for(const k in window.SPRITE_PACK.bodies)packImg['b:'+k]='data:image/png;base64,AA';
    packImg['h:male']='data:image/png;base64,AA';packImg['h:female']='data:image/png;base64,AA';
  `
    + grab('function ensureHero(opt){', 'const mobTextureLoader=')
    + `\nthis.__x={SKIN_SIZE,SKIN_VIEW,SKIN_ATTACK_MIRROR,SKIN_H,PACK_K,SKIN_CACHE_MAX,skinPack,skinDoc,skinImage,skinLoaded,skinRoute,
        mkSkinHero,captureSkinFrame,ensureHero,images,logged,draws:()=>__draws,document,hero:()=>heroSpr,appended:()=>__appended};`, box);
  return box.__x;
}
const X = boot();

// The game's own class list, read from CD and evaluated, so the test cannot drift from the game.
const GAME_CLASSES = (() => {
  const start = src.indexOf('const CD=[');
  assert(start >= 0, 'the game must define its class list as CD');
  const open = src.indexOf('[', start);
  let depth = 0, inStr = null, end = -1;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (inStr) { if (ch === '\\') i++; else if (ch === inStr) inStr = null; continue; }
    if (ch === "'" || ch === '"') { inStr = ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) { end = i; break; }
  }
  assert(end > open, 'the class list must be one complete array literal');
  const box = {};
  vm.createContext(box);
  vm.runInContext('this.__c=' + src.slice(open, end + 1) + '.map(r=>String(r[0]));', box);
  return Array.from(box.__c);
})();

function viewerBlock(id) {
  const html = fs.readFileSync(path.join(SPRITE_DIR, 'index.html'), 'utf8');
  const match = html.match(new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)<\\/script>`));
  assert(match, `the canonical viewer must keep its ${id} block`);
  return JSON.parse(match[1]);
}
const VIEWER = viewerBlock('sprite-manifest');
const VIEWER_POSES = viewerBlock('pose-map');

// ---------- class -> file mapping ----------
t('the game\'s own class list is exactly what the skin manifest covers', () => {
  assert.strictEqual(GAME_CLASSES.length, 19, 'the game has 19 classes');
  deepEq(Object.keys(CLASS_SKINS.classes).slice().sort(), GAME_CLASSES.slice().sort(),
    'the manifest must cover every class the game can be played as, and no others');
});

t('every class and gender resolves to its own art in its own tree folder', () => {
  const problems = [];
  for (const [name, entry] of Object.entries(CLASS_SKINS.classes)) {
    assert(entry.tree && entry.job, `${name} must carry its tree and job id`);
    for (const sex of ['m', 'f']) {
      const rec = entry[sex];
      assert(rec && rec.files && rec.frames && rec.poses, `${name} ${sex} must have files, frames and poses`);
      const views = Object.keys(rec.files).sort();
      deepEq(views.filter(v => v !== 'N'), ['NE', 'S', 'SE', 'attack'], `${name} ${sex} supplied views`);
      if (views.includes('N') && name !== 'High Priest') problems.push(`${name} ${sex}: carries an N view the uploads never had`);
      for (const [view, file] of Object.entries(rec.files)) {
        const onDisk = path.join(SPRITE_DIR, file);
        if (!fs.existsSync(onDisk)) { problems.push(`${name} ${sex} ${view}: missing ${file}`); continue; }
        if (!file.startsWith(entry.tree + '/')) problems.push(`${name} ${sex} ${view}: ${file} is not in ${entry.tree}/`);
        if (!file.startsWith(entry.tree + '/' + entry.job + ' ')) problems.push(`${name} ${sex} ${view}: ${file} is not ${entry.job} art`);
      }
      if (rec.height < 60 || rec.height > 140) problems.push(`${name} ${sex}: implausible drawn height ${rec.height}`);
      if (rec.anchor[1] < 120 || rec.anchor[1] > 199) problems.push(`${name} ${sex}: ground line ${rec.anchor[1]} outside the canvas`);
      for (const view of Object.keys(rec.files)) {
        const meta = apngMeta(path.join(SPRITE_DIR, rec.files[view]));
        if (meta.width !== 200 || meta.height !== 200) problems.push(`${name} ${sex} ${view}: canvas ${meta.width}x${meta.height}`);
        if (meta.frames !== rec.frames[view]) problems.push(`${name} ${sex} ${view}: manifest says ${rec.frames[view]} frames, file has ${meta.frames}`);
        if (rec.frames[view] < 2) problems.push(`${name} ${sex} ${view}: only ${rec.frames[view]} frame(s) - the art must animate`);
        if (meta.plays !== 0) problems.push(`${name} ${sex} ${view}: num_plays ${meta.plays}, not an endless loop`);
        if (meta.fctl !== meta.frames) problems.push(`${name} ${sex} ${view}: ${meta.fctl} fcTL chunks for ${meta.frames} frames`);
        try { deepEq(rec.delays[view], meta.delays, `${name} ${sex} ${view}: per-frame delays`); }
        catch (e) { problems.push(e.message); }
      }
    }
  }
  assert.deepStrictEqual(problems, [], problems.join(' | '));
});

t('every source file really is an animated, endlessly looping PNG', () => {
  const counts = {};
  let files = 0;
  for (const [name, entry] of Object.entries(CLASS_SKINS.classes)) {
    for (const sex of ['m', 'f']) for (const file of Object.values(entry[sex].files)) {
      const meta = apngMeta(path.join(SPRITE_DIR, file));
      if (meta.plays !== 0) assert.fail(`${name} ${sex} ${file}: does not loop forever`);
      if (meta.frames < 2) assert.fail(`${name} ${sex} ${file}: a still, not an animation`);
      counts[meta.frames] = (counts[meta.frames] || 0) + 1;
      files++;
    }
  }
  assert.strictEqual(files, 152 + 2, '76 class/gender/view files plus High Priest\'s two N files');
  deepEq(counts, { 5: 13, 6: 4, 8: 127, 9: 10 },
    'the uploaded set\'s frame counts: 127 files of 8, 13 of 5, 4 of 6 and 10 of 9');
  console.log(`   ${files} source animations, frame counts ${JSON.stringify(plain(counts))}`);
});

t('every class and gender is wired to its own male / female file', () => {
  for (const [name, entry] of Object.entries(CLASS_SKINS.classes)) {
    for (const view of Object.keys(entry.m.files)) {
      const male = entry.m.files[view], female = entry.f.files[view];
      if (view === 'N') continue;                       // only High Priest supplies this one
      assert.notStrictEqual(male, female, `${name} ${view} must use the male file for males and the female file for females`);
      assert(/ male /.test(male), `${name} ${view}: ${male} is not the male file`);
      assert(/ female /.test(female), `${name} ${view}: ${female} is not the female file`);
    }
  }
});

t('each class job is a distinct entry (no class borrows another class\'s art)', () => {
  const seen = new Map();
  for (const [name, entry] of Object.entries(CLASS_SKINS.classes)) {
    const key = entry.tree + '/' + entry.job;
    assert(!seen.has(key), `${name} and ${seen.get(key)} share the ${key} art`);
    seen.set(key, name);
  }
  assert.strictEqual(seen.size, 19, 'the seven folders cover all 19 jobs');
});

t('the manifest agrees with the canonical viewer about every file it names', () => {
  const byPose = new Map(VIEWER.map(row => [[row.tree, row.job, row.gender, row.action, row.direction].join('|'), row]));
  const problems = [];
  for (const [name, entry] of Object.entries(CLASS_SKINS.classes)) {
    for (const sex of ['m', 'f']) {
      const gender = sex === 'm' ? 'male' : 'female';
      for (const [view, action, direction] of [['S', 'walk', 'S'], ['SE', 'walk', 'SE'], ['NE', 'walk', 'NE'], ['attack', 'attack', 'SE'], ['N', 'walk', 'N']]) {
        if (!entry[sex].files[view]) continue;
        const row = byPose.get([entry.tree, entry.job, gender, action, direction].join('|'));
        if (!row) { problems.push(`${name} ${gender} ${view}: missing from the viewer manifest`); continue; }
        if (row.path !== entry[sex].files[view]) problems.push(`${name} ${gender} ${view}: ${entry[sex].files[view]} != viewer ${row.path}`);
      }
    }
  }
  assert.deepStrictEqual(problems, [], problems.join(' | '));
});

t('the filename variants the uploads use are handled (walking / attack / attacking)', () => {
  // The three "attacking" files must reach the attack action, not be mistaken for a walk.
  const attackOf = cls => [CLASS_SKINS.classes[cls].m.files.attack, CLASS_SKINS.classes[cls].f.files.attack];
  deepEq(attackOf('Novice'), ['Novice/novice male attacking SE.png', 'Novice/novice female attacking SE.png'],
    'Novice uses "attacking"');
  assert.strictEqual(CLASS_SKINS.classes.Mage.m.files.attack, 'Mage/mage male attacking SE.png', 'Mage male uses "attacking"');
  assert.strictEqual(CLASS_SKINS.classes.Swordman.m.files.attack, 'Swordman/swordman male attack SE.png', 'Swordman uses "attack"');
  for (const [name, entry] of Object.entries(CLASS_SKINS.classes))
    for (const sex of ['m', 'f'])
      assert(/ (attack|attacking) SE\.png$/.test(entry[sex].files.attack), `${name} ${sex}: attack must come from an attack file`);
});

// ---------- directions and mirrors ----------
const dirOf = (dir, atk = 0) => X.skinRoute(X.skinPack('Novice', 'm'), dir, atk);

t('the four supplied views are the ones the owner asked for, and each one is drawn unmirrored', () => {
  deepEq(CLASS_SKINS.views, ['S', 'SE', 'NE', 'attack'], 'S, SE, NE walk plus the SE attack');
  deepEq([dirOf(0).view, dirOf(0).mirror], ['S', false], 'walking straight down is the S animation');
  deepEq([dirOf(7).view, dirOf(7).mirror], ['SE', false], 'walking down-right is the SE animation');
  deepEq([dirOf(5).view, dirOf(5).mirror], ['NE', false], 'walking up-right is the NE animation');
  deepEq([dirOf(0, 1).view, dirOf(0, 1).mirror], ['attack', false], 'the drawn swing is used as supplied');
});

t('SW, NW and the SW attack are the supplied animation mirrored - not a different file', () => {
  deepEq([dirOf(1).view, dirOf(1).mirror], ['SE', true], 'down-left is SE mirrored');
  deepEq([dirOf(3).view, dirOf(3).mirror], ['NE', true], 'up-left is NE mirrored');
  for (const dir of [1, 2, 3]) assert.strictEqual(dirOf(dir, 1).mirror, true, `attack ${dir} is the mirrored swing`);
  for (const dir of [0, 4, 5, 6, 7]) assert.strictEqual(dirOf(dir, 1).mirror, false, `attack ${dir} is the drawn swing`);
  deepEq(X.SKIN_ATTACK_MIRROR, [0, 1, 1, 1, 0, 0, 0, 0], 'the attack mirror list is the one documented');
});

t('the game\'s route table is the canonical viewer\'s route table', () => {
  const expected = { 0: ['S', 0], 1: ['SE', 1], 2: ['SE', 1], 3: ['NE', 1], 4: ['NE', 0], 5: ['NE', 0], 6: ['SE', 0], 7: ['SE', 0] };
  deepEq(X.SKIN_VIEW, expected, 'the eight facings resolve to the four supplied views');
  // Each route the viewer names is one facing of the compass; the game must draw the same file
  // with the same mirror flag for that facing.
  const routeFacing = { S: 0, SW: 1, W: 2, NW: 3, N: 4, NE: 5, E: 6, SE: 7 };
  for (const [route, facing] of Object.entries(routeFacing)) {
    const definition = VIEWER_POSES[route];
    if (!definition) continue;                       // the viewer names no W, N or E view
    deepEq([dirOf(facing).view, dirOf(facing).mirror ? 1 : 0],
      [definition.sourceDirection, definition.mirror ? 1 : 0], `viewer route ${route} vs the game's facing ${facing}`);
  }
  assert.strictEqual(VIEWER_POSES.attackSW.sourceDirection, 'SE');
  assert.strictEqual(VIEWER_POSES.attackSW.mirror, true, 'the viewer mirrors the SW attack from SE');
  assert.strictEqual(dirOf(1, 1).mirror, true, 'and so does the game');
  assert.strictEqual(dirOf(0, 1).view, 'attack', 'the viewer\'s attackSE route is the game\'s attack view');
});

t('the views the art does not carry use a named nearest animation, and it is documented', () => {
  const nov = X.skinPack('Novice', 'm'), hp = X.skinPack('High Priest', 'm');
  deepEq([dirOf(4).view, dirOf(4).mirror], ['NE', false], 'straight up uses the NE animation');
  deepEq([dirOf(6).view, dirOf(6).mirror], ['SE', false], 'straight right uses the SE animation');
  deepEq([dirOf(2).view, dirOf(2).mirror], ['SE', true], 'straight left uses the SE animation mirrored');
  deepEq([X.skinRoute(hp, 4, 0).view, X.skinRoute(hp, 4, 0).mirror], ['N', false],
    'a class that supplies its own straight-up art uses it');
  deepEq([X.skinRoute(nov, 4, 0).view], ['NE'], 'a class without one falls back to NE');
  assert.ok(src.includes('The art has no E or W animation, and only High Priest has its own straight-up N one'),
    'the panel tells the player in words');
});

t('the art has no idle animation, and the standing-still policy says so out loud', () => {
  assert(!Object.values(CLASS_SKINS.classes).some(e => Object.keys(e.m.files).includes('idle')),
    'no idle animation is invented or claimed');
  deepEq([X.skinRoute(X.skinPack('Knight', 'f'), 0, 0).view, X.skinRoute(X.skinPack('Knight', 'f'), 0, 0).mirror], ['S', false],
    'at rest the S walk animation keeps playing (the viewer\'s behaviour)');
  assert.ok(src.includes('the art has no idle animation, so at rest your character keeps playing its walk cycle'),
    'and the panel states it plainly');
});

// ---------- the drawn cell ----------
const skinSprite = (cls = 'Knight', sex = 'm') => X.mkSkinHero(X.skinPack(cls, sex));

t('the hero is one 200x200 canvas texture drawing the complete square image', () => {
  const spr = skinSprite(), sk = spr.userData.skin;
  assert.ok(sk.p.files.S.includes('knight male walking S.png'), 'the Knight wears its own art');
  assert.strictEqual(X.SKIN_SIZE, 200, 'the source canvas is 200x200');
  close(spr.center.x, sk.p.anchor[0] / 200, 'the anchor x is the figure centre');
  close(spr.center.y, 1 - sk.p.anchor[1] / 200, 'the anchor y is the ground line, so the feet stay put');
  close(spr.scale.x, spr.scale.y, 'the square image is never stretched');
  close(spr.scale.y, X.SKIN_SIZE * (X.SKIN_H / sk.p.height), 'one constant scale per class and gender');
  close(X.SKIN_H, 72 * X.PACK_K, 'the drawn character keeps the height the hero already had next to the mobs');
});

t('each rendered frame copies the browser\'s current animation frame onto the canvas', () => {
  const spr = skinSprite(), sk = spr.userData.skin, p = sk.p;
  for (const v of Object.keys(p.files)) p.views[v].fire('load');
  X.draws().length = 0;
  assert.strictEqual(X.captureSkinFrame(spr, { view: 'S', mirror: false }), true, 'the capture reports a frame was drawn');
  deepEq(X.draws().map(a => a.length), [5], 'one whole-image drawImage per capture');
  deepEq(X.draws().map(a => [a[1], a[2], a[3], a[4]]), [[0, 0, 200, 200]], 'the complete square image, never a crop');
  assert.strictEqual(sk.tex.needsUpdate, true, 'the GPU texture is flagged so the frame reaches the screen');
  X.draws().length = 0;
  X.captureSkinFrame(spr, { view: 'S', mirror: false });
  assert.strictEqual(X.draws().length, 1, 'and it copies again next render, following the browser\'s timeline');
  assert.ok(src.includes('captureSkinFrame(heroSpr,route)'), 'the game calls it from the render loop');
  const call = src.indexOf('captureSkinFrame(heroSpr,route)'), render = src.indexOf('R.render(scene,cam)', call);
  assert.ok(render > call, 'before the frame is rendered');
  assert.ok(!/setInterval|requestAnimationFrame/.test(grab('function captureSkinFrame(', 'function packTex(')),
    'no second animation clock: the file\'s own timing drives it');
});

t('the mirror is drawn flipped on the canvas (no re-encoded file, no negative scale)', () => {
  const calls = [];
  const ctx = { imageSmoothingEnabled: false, clearRect() { calls.push('clear'); }, drawImage() { calls.push('draw'); },
    setTransform(...a) { calls.push('transform ' + a.join(',')); }, translate(...a) { calls.push('translate ' + a.join(',')); }, scale(...a) { calls.push('scale ' + a.join(',')); } };
  const saved = X.document.createElement;
  X.document.createElement = (...args) => {
    const el = saved(...args);
    if (args[0] === 'canvas') { el.width = el.height = 200; el.getContext = () => ctx; }
    return el;
  };
  const spr = skinSprite();
  const p = spr.userData.skin.p;
  for (const v of Object.keys(p.files)) p.views[v].fire('load');
  calls.length = 0;
  try { X.captureSkinFrame(spr, { view: 'SE', mirror: true }); }
  finally { X.document.createElement = saved; }
  assert.ok(calls.includes('translate 200,0') && calls.includes('scale -1,1'),
    'a mirrored route flips horizontally: ' + calls.join(' | '));
  assert.ok(!calls.some(c => /scale -?1,-/.test(c)), 'never vertically');
  const iClear = calls.indexOf('clear'), iDraw = calls.indexOf('draw');
  assert.ok(iClear >= 0 && iDraw > iClear, 'the canvas is cleared before it is repainted each frame (alpha preserved)');
  assert.strictEqual(calls.filter(c => c === 'clear').length, 1, 'exactly one clear per frame');
  assert.ok(calls.includes('transform 1,0,0,1,0,0'), "the transform is reset, so one frame's mirror cannot leak into the next");
});

t('an undecoded or missing animation hides the hero instead of showing a stale facing', () => {
  const spr = skinSprite('Sniper', 'f');
  const p = spr.userData.skin.p;
  p.views.SE.complete = false; p.views.SE._src = '';
  assert.strictEqual(X.captureSkinFrame(spr, { view: 'SE', mirror: true }), false, 'an undecoded view cannot be captured');
  assert.strictEqual(spr.visible, false, 'so the sprite hides rather than showing the previous pose');
});

// ---------- asset loading and the hero ----------
t('the page loads the manifest and asks for the class\'s own files, once each', () => {
  assert.ok(src.includes('<script src="assets/class_skins_data.js?v=1"></script>'), 'the manifest is loaded by the page');
  assert.ok(src.includes('im.src=encodeURI(url)'), 'the loader URL-encodes the source path (it contains spaces)');
  const before = X.images.length;
  const p = X.skinPack('Lord Knight', 'f');
  const urls = X.images.slice(before).map(im => decodeURI(im._src));
  deepEq(urls.slice().sort(), [
    'Updates/Sprite/Swordman/lordknight female walking S.png',
    'Updates/Sprite/Swordman/lordknight female walking SE.png',
    'Updates/Sprite/Swordman/lordknight female walking NE.png',
    'Updates/Sprite/Swordman/lordknight female attack SE.png',
  ].sort(), 'exactly the files this class and gender really has are requested');
  const again = X.images.length;
  X.skinPack('Lord Knight', 'f');
  assert.strictEqual(X.images.length, again, 'and a second look reuses the same decoders');
});

t('all supplied views load before the skin is worn, and the animated fallback covers the wait', () => {
  const p = X.skinPack('Assassin', 'm');
  assert(p, 'Assassin male has a skin pack');
  assert.strictEqual(X.skinLoaded(p), false, 'nothing is loaded yet');
  const views = Object.keys(p.files);
  p.views[views[0]].fire('load');
  assert.strictEqual(X.skinLoaded(p), false, 'one view is not enough - a half-loaded class would show the wrong facing');
  for (const v of views.slice(1)) p.views[v].fire('load');
  assert.strictEqual(X.skinLoaded(p), true, 'the whole class is ready');

  X.ensureHero({ cls: 'Assassin', sex: 'm', tier: 2 });
  assert(X.hero().userData.skin, 'the loaded Assassin wears its own animation');
  assert(!X.hero().userData.pack, 'and not the animated pack');

  const boss = X.skinPack('High Wizard', 'm');
  X.ensureHero({ cls: 'High Wizard', sex: 'm', tier: 2 });
  assert(X.hero().userData.pack, 'a class whose art is still arriving keeps the animated fallback - never a wrong pose');
  for (const v of Object.keys(boss.files)) boss.views[v].fire('load');
  X.ensureHero({ cls: 'High Wizard', sex: 'm', tier: 2 });
  assert(X.hero().userData.skin, 'and switches the moment every file is ready');
});

t('a broken file is reported and falls back - the player is never left blank', () => {
  const before = X.images.length;
  const p = X.skinPack('Whitesmith', 'f');
  assert.strictEqual(X.images.length - before, 4, 'the four Whitesmith files are requested');
  p.views.attack.fire('error');
  assert(X.logged.some(m => /Class skin art could not load/.test(m)), 'the player is told in the log');
  assert.ok(X.logged.some(m => /animated fallback sprite is used instead/.test(m)), 'and what happens instead');
  X.ensureHero({ cls: 'Whitesmith', sex: 'f', tier: 3 });
  assert(!X.hero().userData.skin, 'no skin is worn for that class');
  X.ensureHero({ cls: 'Whitesmith', sex: 'f', tier: 3 });
  assert(X.hero().userData.pack, 'its animated Whitesmith body is worn instead - never another class');
  assert.strictEqual(X.hero().userData.body, 'whitesmith', 'and it is that class\'s own body art');
});

t('a missing manifest leaves the game exactly as it was (the animated pack hero)', () => {
  const Y = boot({ noSkins: true });
  Y.ensureHero({ cls: 'Knight', sex: 'm', tier: 1 });
  assert.strictEqual(Y.skinPack('Knight', 'm'), null, 'no skin pack is invented out of thin air');
  assert(Y.hero().userData.pack, 'the animated Knight body is worn instead');
});

t('the decoders stay in the page, painted but invisible, and the cache is bounded', () => {
  assert.ok(src.includes("el.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1'"),
    'the decoder layer is clipped and transparent - never display:none, which browsers may skip');
  assert.ok(src.includes('const SKIN_CACHE_MAX=24;') && src.includes('skinDocOrder.length>SKIN_CACHE_MAX'),
    'the decoder cache is bounded so a long class-change session cannot leak images');
  assert.ok(X.appended().length > 0, 'the decoders are actually attached to the document');
});

// ---------- previews ----------
t('both previews play the real class animation, not a still', () => {
  assert.ok(src.includes('function drawSkinPreview(id,labelId,cls,sex){'), 'one preview renderer');
  assert.ok(src.includes("const p=skinPack(cls,sex),im=p?skinImage(p,'S'):null;"),
    'the preview reads the same pack and the same S animation the hero wears');
  assert.ok(src.includes('ctx.drawImage(im,ax-bw/2,ay-bh+6,bw,bh,0,0,cv.width,cv.height);'), 'and frames it around the art\'s own anchor');
  assert.ok(src.includes("if(tabs.includes('set'))drawAppearancePreview();") &&
            src.includes("if(tabs.includes('job'))drawClassPreview();"),
    'the game loop redraws whichever preview is open, so it animates');
  assert.ok(src.includes("function drawAppearancePreview(){if(S)drawSkinPreview('hairPreview','hairPreviewLoading',S.cls,S.sex)}"),
    'the Appearance panel preview follows the class and gender you wear');
  assert.ok(src.includes("function drawClassPreview(){if(S)drawSkinPreview('classPreview','classPreviewLoading',selK||S.cls,S.sex)}"),
    'the class-change panel preview follows the class you are looking at');
  assert.ok(src.includes('id="classPreview"') && src.includes('id="classPreviewLoading"'), 'the class panel has its canvas and its loading note');
  assert.ok(src.includes('animating'), 'the panel says the preview is animating');
});

t('the old melee swing arc is off, so the uploaded attack is not doubled', () => {
  assert.ok(src.includes('const HERO_SWING_ARC=false;'), 'the arc sits behind one named switch');
  assert.ok(src.includes("slashM.visible=HERO_SWING_ARC&&atkAnim>.12&&wt!=='bow'&&wt!=='staff';"),
    'and the swing cue is gated by it (bow and staff shots are untouched)');
  const decl = src.indexOf('const HERO_SWING_ARC=false;'), use = src.indexOf('slashM.visible=HERO_SWING_ARC&&');
  assert.ok(decl >= 0 && decl < use, 'the switch is declared before the function that reads it');
  assert.ok(src.includes('The white melee swing arc is switched off too - the uploaded attack animation already is the swing.'),
    'and the Appearance panel tells the player, instead of the cue just vanishing');
  assert.ok(!src.includes('HERO_SWING_ARC=true'), 'nothing switches the duplicate arc back on by accident');
});

t('the hairstyle and the held weapon are honestly reported', () => {
  assert.ok(src.includes('Every uploaded file is a complete looping animation, hair included'), 'the hair is part of the art');
  assert.ok(src.includes('is still saved with your account'), 'and the saved choice is not lost');
  assert.ok(!src.includes('data-a="hair"'), 'no live hair action is offered while the art is fixed');
  assert.ok(src.includes("hair:v=>{S.hair=(((S.hair|0)+(+v||1))%19+19)%19;heroKey='';ui();save()}"),
    'the save field and its handler stay for saves and for the pack fallback');
  assert.ok(src.includes('const HERO_HELD_WEAPON=false;'), 'the held-weapon overlay is off behind one switch');
  assert.ok(src.includes("if(!HERO_HELD_WEAPON){weaponNodes.forEach(n=>n.el.style.display='none');return}"),
    'so no old weapon icon floats on the new art');
});

t('the new art is never pushed through the old atlas slicing', () => {
  const skinBlock = grab('function skinLayer(){', 'function packTex(opt){');
  assert.ok(!skinBlock.includes('repeat.set(1/8,1/24)'), 'the APNG path has no 8x24 atlas repeat');
  assert.ok(!skinBlock.includes('setPackCell'), 'and never calls the atlas cell setter');
  assert.ok(!skinBlock.includes('offset.set'), 'nor the atlas UV offsets');
  assert.ok(skinBlock.includes('new THREE.CanvasTexture(cv)'), 'it is one canvas texture for the whole animation');
  assert.ok(src.includes('const hd=viewDir(pFace),sk=heroSpr.userData.skin;'), 'the render loop branches on the skin sprite');
});

// ---------- the generated manifest ----------
t('the committed manifest is the current build of the source art', () => {
  const run = spawnSync('python3', [path.join(ROOT, 'tools/make_class_skins.py'), '--check'], { encoding: 'utf8' });
  assert.strictEqual(run.status, 0, `manifest is stale: ${run.stderr || run.stdout}`);
  const viewerRun = spawnSync('python3', [path.join(ROOT, 'tools/make_sprite_viewer.py'), '--check'], { encoding: 'utf8' });
  assert.strictEqual(viewerRun.status, 0, `canonical viewer is stale: ${viewerRun.stderr || viewerRun.stdout}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`   ${Object.keys(CLASS_SKINS.classes).length} classes, ${Object.keys(CLASS_SKINS.classes).length * 2} class/gender sets, ${CLASS_SKINS.views.length} supplied views each`);
process.exit(fail ? 1 : 0);
