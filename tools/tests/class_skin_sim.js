// The live class skins: every one of the game's 19 classes wears its own uploaded art, in both
// genders, for the four supplied views, with the mirrors and the fallbacks the owner asked for.
//   node tools/tests/class_skin_sim.js
//
// It runs the game's real skin code (extracted out of index.html) against the real generated
// manifest (assets/class_skins_data.js) and the real PNGs, and cross-checks the direction table
// against the canonical viewer (Updates/Sprite/index.html) so the preview page and the game can
// never disagree about which file belongs to which class, gender, pose or mirror.
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
// Values that come back out of the game's own sandbox are plain data, but they are not this
// realm's Arrays/Objects; plain() normalises them before comparing.
const plain = v => JSON.parse(JSON.stringify(v));
const deepEq = (actual, expected, message) => assert.deepStrictEqual(plain(actual), expected, message);
const close = (actual, expected, message, eps = 1e-9) => assert.ok(Math.abs(actual - expected) < eps,
  `${message} (${actual} vs ${expected})`);

// ---------- the real manifest, the real code ----------
const manifestSrc = fs.readFileSync(path.join(ROOT, 'assets/class_skins_data.js'), 'utf8');
const dataBox = { window: {} };
vm.createContext(dataBox);
vm.runInContext(manifestSrc + '\nthis.__s={CLASS_SKINS:window.CLASS_SKINS};', dataBox);
const CLASS_SKINS = dataBox.__s.CLASS_SKINS;
const SPRITE_DIR = path.join(ROOT, CLASS_SKINS.dir);

function ImageStub() {
  const im = { complete: false, naturalWidth: 0, naturalHeight: 0, onload: null, onerror: null };
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
  const box = { window: {}, document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ imageSmoothingEnabled: false, clearRect: () => {}, drawImage: () => {} }) }) } };
  // frames are [idle 1, walk 8, attack 6]: an anchor per frame, padded to the longest row
  const anchors = Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => [63, 60])));
  const bodies = {};
  for (const name of ['thief', 'assassin', 'assassin_cross', 'novice', 'mage', 'archer', 'aco', 'swordman', 'blacksmith', 'merchant', 'knight', 'lord_knight', 'wizard', 'high_wizard', 'hunter', 'sniper', 'priest', 'high_priest', 'whitesmith'])
    bodies[name] = { atlas: 'data:image/png;base64,AA', anchors };
  box.window.SPRITE_PACK = { cellW: 126, cellH: 134, padL: 15, padT: 38, pivotX: 63, pivotY: 128, frames: [1, 8, 6], hairStyles: 19, bodies, heads: { male: 'data:image/png;base64,AA', female: 'data:image/png;base64,AA' } };
  if (!options.noSkins) box.window.CLASS_SKINS = CLASS_SKINS;
  box.__imageStub = ImageStub;
  box.THREE = {
    NearestFilter: 1,
    Texture: function (image) { this.image = image; this.repeat = { x: 1, y: 1, set(a, b) { this.x = a; this.y = b; } }; this.offset = { x: 0, y: 0, set(a, b) { this.x = a; this.y = b; } }; this.clone = function () { return new box.THREE.Texture(image); }; },
    CanvasTexture: function (cv) { return new box.THREE.Texture(cv); },
    Sprite: function (material) { this.material = material; this.center = { set: (a, b) => { this.x = a; this.y = b; } }; this.scale = { set: (a, b) => { this.x = a; this.y = b; } }; this.userData = {}; },
    SpriteMaterial: function (o) { this.map = o.map; },
  };
  vm.createContext(box);
  vm.runInContext(`
    const images=[];
    function Image(){const im=__imageStub();images.push(im);return im}
    let heroKey='',heroSpr=null,heroHeadSpr=null,heroDirty=false;
    const P={added:[],add(s){this.added.push(s)},remove(){}};
    const S=null,$=()=>null;
    const logged=[];function log(m){logged.push(m)}
    const getSheet=()=>({clone(){return{}}}),drawHero=()=>{},mkBillboard=()=>({});
  ` + grab('const PACK_BODY={Novice:\'novice\',', 'function setPackCell(')
    + grab('function ensureHero(opt){', 'const mobTextureLoader=')
    + `\nthis.__x={SKIN_VIEW,SKIN_ATTACK_MIRROR,SKIN_H,PACK_K,skinPack,skinImage,skinLoaded,setSkinCell,ensureHero,
        images,logged,hero:()=>heroSpr,packReady:()=>packReady};`, box);
  return box.__x;
}
const X = boot();
const CLASSES = [...manifestSrc.matchAll(/"tree":"[A-Za-z]+","job":"([a-z]+)","([mf])"/g)].length;

function viewerManifest() {
  const html = fs.readFileSync(path.join(SPRITE_DIR, 'index.html'), 'utf8');
  const match = html.match(/<script id="sprite-manifest" type="application\/json">([\s\S]*?)<\/script>/);
  assert(match, 'the canonical viewer must keep its manifest');
  return JSON.parse(match[1]);
}
const VIEWER = viewerManifest();
const VIEWER_POSES = JSON.parse(fs.readFileSync(path.join(SPRITE_DIR, 'index.html'), 'utf8')
  .match(/<script id="pose-map" type="application\/json">([\s\S]*?)<\/script>/)[1]);

// ---------- class -> file mapping ----------
// The game's class table, read the same way a person reads it: one entry per class, whatever
// line the source happens to break them on.
function topLevelEntries(text) {
  const out = []; let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '[') { depth++; if (depth === 2 && start < 0) start = i; }
    else if (text[i] === ']') { depth--; if (depth === 1 && start >= 0) { out.push(text.slice(start, i + 1)); start = -1; } }
  }
  return out;
}
const GAME_CLASSES = topLevelEntries(grab('const CD=[', ']];') + ']').map(entry => entry.match(/'([^']+)'/)[1]);

t('the game\'s own class list is exactly what the skin manifest covers', () => {
  assert.strictEqual(GAME_CLASSES.length, 19, 'the game has 19 classes');
  deepEq(Object.keys(CLASS_SKINS.classes), GAME_CLASSES,
    'the manifest must carry the game\'s classes in the game\'s order');
});

t('every class and gender resolves to its own art in its own tree folder', () => {
  const problems = [];
  for (const [name, entry] of Object.entries(CLASS_SKINS.classes)) {
    assert(entry.tree && entry.job, `${name} must carry its tree and job id`);
    for (const sex of ['m', 'f']) {
      const rec = entry[sex];
      assert(rec && rec.poses && rec.files, `${name} ${sex} must have poses and files`);
      deepEq(Object.keys(rec.files).sort(), ['NE', 'S', 'SE', 'attack'], `${name} ${sex} views`);
      for (const [view, file] of Object.entries(rec.files)) {
        const onDisk = path.join(SPRITE_DIR, file);
        if (!fs.existsSync(onDisk)) { problems.push(`${name} ${sex} ${view}: missing ${file}`); continue; }
        const png = fs.readFileSync(onDisk);
        if (png.readUInt32BE(16) !== 200 || png.readUInt32BE(20) !== 200) problems.push(`${name} ${sex} ${view}: not 200x200`);
        if (!file.startsWith(entry.tree + '/')) problems.push(`${name} ${sex} ${view}: ${file} is not in ${entry.tree}/`);
        if (!file.startsWith(entry.tree + '/' + entry.job + ' ')) problems.push(`${name} ${sex} ${view}: ${file} is not ${entry.job} art`);
      }
      const boxes = Object.values(rec.poses);
      for (const box of boxes) {
        if (box.length !== 4 || box.some(v => !Number.isInteger(v))) problems.push(`${name} ${sex}: pose box ${JSON.stringify(box)}`);
        if (box[0] < 0 || box[1] < 0 || box[0] + box[2] > 200 || box[1] + box[3] > 200) problems.push(`${name} ${sex}: pose box outside the 200x200 source`);
      }
      if (rec.ref !== rec.poses.S[3]) problems.push(`${name} ${sex}: ref must be the S pose height`);
    }
  }
  deepEq(problems, [], problems.join(' | '));
});

t('every class and gender is wired to its own male / female file', () => {
  for (const [name, entry] of Object.entries(CLASS_SKINS.classes)) {
    for (const view of ['S', 'SE', 'NE', 'attack']) {
      const male = entry.m.files[view], female = entry.f.files[view];
      assert.notStrictEqual(male, female, `${name} ${view} must use the male file for males and the female file for females`);
      assert(/ male /.test(male), `${name} ${view}: ${male} is not the male file`);
      assert(/ female /.test(female), `${name} ${view}: ${female} is not the female file`);
    }
  }
});

t('the known duplicate drawings in the uploaded set are the only ones (report to the owner)', () => {
  // The uploads contain three files that are byte-for-byte copies of another pose or class.  The
  // game still uses each job's own file for each gender, so nothing is being mixed up here - but
  // if the owner re-uploads, this list must be updated (and a new duplicate should be noticed).
  const digests = new Map();
  for (const [name, entry] of Object.entries(CLASS_SKINS.classes)) {
    for (const sex of ['m', 'f']) for (const view of ['S', 'SE', 'NE', 'attack']) {
      const file = entry[sex].files[view], bytes = fs.readFileSync(path.join(SPRITE_DIR, file));
      const digest = require('crypto').createHash('sha1').update(bytes).digest('hex');
      if (!digests.has(digest)) digests.set(digest, []);
      digests.get(digest).push(`${name} ${sex} ${view}`);
    }
  }
  const duplicates = [...digests.values()].filter(list => list.length > 1).map(list => list.sort().join(' = ')).sort();
  deepEq(duplicates, [
    'Acolyte f S = Acolyte m S',                          // her S walk is the male drawing
    'Acolyte f SE = Acolyte f attack',                    // her attack pose is a copy of her SE walk
    'Blacksmith f NE = Whitesmith f NE',
  ], 'the duplicate-art list changed: ' + duplicates.join(' | '));
  console.log('   NOTE - uploaded art with duplicates: ' + duplicates.join(' | '));
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
      for (const [view, action, direction] of [['S', 'walk', 'S'], ['SE', 'walk', 'SE'], ['NE', 'walk', 'NE'], ['attack', 'attack', 'SE']]) {
        const row = byPose.get([entry.tree, entry.job, gender, action, direction].join('|'));
        if (!row) { problems.push(`${name} ${gender} ${view}: missing from the viewer manifest`); continue; }
        if (row.path !== entry[sex].files[view]) problems.push(`${name} ${gender} ${view}: ${entry[sex].files[view]} != viewer ${row.path}`);
      }
    }
  }
  assert.deepStrictEqual(problems, [], problems.join(' | '));
});

// ---------- directions and mirrors ----------
const VIEWS = CLASS_SKINS.views;
const dirOf = (pose) => X.SKIN_VIEW[pose];
const viewerRoute = (id) => VIEWER_POSES[id];

t('the four supplied views are the ones the owner asked for, and each one is drawn unmirrored', () => {
  deepEq(VIEWS, ['S', 'SE', 'NE', 'attack'], 'S, SE, NE walk plus the SE attack');
  deepEq(dirOf(0), ['S', 0], 'walking straight down is the S view');
  deepEq(dirOf(7), ['SE', 0], 'walking down-right is the SE view');
  deepEq(dirOf(5), ['NE', 0], 'walking up-right is the NE view');
  assert.strictEqual(X.SKIN_ATTACK_MIRROR[7], 0, 'attacking down-right uses the drawn swing');
  assert.strictEqual(X.SKIN_ATTACK_MIRROR[0], 0, 'attacking straight down uses the drawn swing');
});

t('SW, NW and the SW attack are the supplied pose mirrored - not a different file', () => {
  deepEq(dirOf(1), ['SE', 1], 'down-left is SE mirrored');
  assert.strictEqual(X.SKIN_ATTACK_MIRROR[1], 1, 'attacking down-left is the SE swing mirrored');
  deepEq(dirOf(3), ['NE', 1], 'up-left is NE mirrored');
  deepEq([dirOf(1)[0], X.SKIN_ATTACK_MIRROR[1]], ['SE', 1]);
  for (const dir of [1, 2, 3]) assert.strictEqual(X.SKIN_ATTACK_MIRROR[dir], 1, `attack ${dir} mirrored`);
  for (const dir of [0, 4, 5, 6, 7]) assert.strictEqual(X.SKIN_ATTACK_MIRROR[dir], 0, `attack ${dir} direct`);
});

t('the game\'s mirror table is the canonical viewer\'s mirror table', () => {
  // The viewer names its routes with the same words the game uses for a facing.
  const expected = { 0: ['S', 0], 1: ['SE', 1], 2: ['SE', 1], 3: ['NE', 1], 4: ['NE', 0], 5: ['NE', 0], 6: ['SE', 0], 7: ['SE', 0] };
  deepEq(X.SKIN_VIEW, expected, 'the eight facings resolve to the four supplied poses');
  // Each route the viewer offers is one facing of the compass; the game must draw the same file
  // with the same mirror flag for that facing.
  const routeFacing = { S: 0, SW: 1, W: 2, NW: 3, N: 4, NE: 5, E: 6, SE: 7 };
  for (const [route, facing] of Object.entries(routeFacing)) {
    if (!viewerRoute(route)) continue;                      // the viewer only names the supplied views
    deepEq(dirOf(facing), [viewerRoute(route).sourceDirection, viewerRoute(route).mirror ? 1 : 0],
      `viewer route ${route} vs the game's facing ${facing}`);
  }
  assert.strictEqual(viewerRoute('attackSE').mirror, false, 'the viewer draws the SE attack directly');
  assert.strictEqual(X.SKIN_ATTACK_MIRROR[7], 0, 'and so does the game');
  assert.strictEqual(X.SKIN_ATTACK_MIRROR[1], 1, 'while the SW attack is the mirror in both');
  assert.strictEqual(viewerRoute('SW').mirror, true, 'the viewer mirrors SW from SE');
  assert.strictEqual(viewerRoute('NW').mirror, true, 'the viewer mirrors NW from NE');
  assert.strictEqual(viewerRoute('attackSW').sourceDirection, 'SE', 'the viewer mirrors the SW attack from SE');
  assert.strictEqual(viewerRoute('attackSW').mirror, true);
});

t('the three views the art does not carry use the nearest supplied view, and it is documented', () => {
  deepEq(dirOf(4), ['NE', 0], 'straight up uses the NE view');
  deepEq(dirOf(6), ['SE', 0], 'straight right uses the SE view');
  deepEq(dirOf(2), ['SE', 1], 'straight left uses the SE view mirrored');
  assert.ok(/no N, E or W\.? ?(drawing|pose)/.test(src) || src.includes('The art has no N, E or W'),
    'the missing facings are written down in the source');
  assert.ok(src.includes('The art has no N, E or W pose, so walking straight up uses the NE view'),
    'and the panel tells the player in words');
});

// ---------- the drawn cell ----------
function skinSprite() {
  const im = { complete: true, naturalWidth: 200, naturalHeight: 200 };
  const map = { image: im, repeat: { set(a, b) { this.x = a; this.y = b; } }, offset: { set(a, b) { this.x = a; this.y = b; } } };
  return { material: { map }, userData: { skin: { ref: 90, poses: { S: [80, 70, 40, 90], SE: [82, 69, 35, 92], NE: [82, 71, 35, 87], attack: [76, 76, 50, 83] }, files: { S: 'x', SE: 'x', NE: 'x', attack: 'x' }, imgs: { S: im, SE: im, NE: im, attack: im } } },
    center: { set() {} }, scale: { set(a, b) { this.x = a; this.y = b; } }, visible: false };
}

t('a drawn cell is the art\'s own crop, mirrored in the UVs (never by redrawing the picture)', () => {
  const spr = skinSprite(), p = spr.userData.skin;
  assert.strictEqual(X.setSkinCell(spr, 7, 0), true, 'the SE facing draws');
  close(spr.material.map.offset.x, 82 / 200, 'SE reads the measured crop from the source PNG');
  assert.ok(spr.material.map.repeat.x > 0, 'SE is the drawn picture, not a mirror');
  assert.strictEqual(X.setSkinCell(spr, 1, 0), true, 'the SW facing draws');
  close(spr.material.map.offset.x, (82 + 35) / 200, 'SW mirrors from the same crop');
  assert.ok(spr.material.map.repeat.x < 0, 'SW is the horizontal mirror');
  for (const view of ['S', 'SE', 'NE']) {
    const box = p.poses[view], [dir] = Object.entries(X.SKIN_VIEW).find(([, v]) => v[0] === view);
    X.setSkinCell(spr, +dir, 0);
    close(spr.material.map.repeat.y, box[3] / 200, `${view} crop height`);
    close(spr.material.map.offset.y, 1 - (box[1] + box[3]) / 200, `${view} crop top`);
  }
});

t('one constant scale per class keeps the character the same size in every direction', () => {
  const spr = skinSprite(), p = spr.userData.skin;
  const px = X.SKIN_H / p.ref;
  for (const dir of [0, 1, 5, 7]) {
    X.setSkinCell(spr, dir, 1);                     // the attack row
    assert.ok(Math.abs(spr.scale.x / spr.scale.y - p.poses.attack[2] / p.poses.attack[3]) < 1e-9,
      'the drawn cell keeps the source aspect ratio');
    assert.strictEqual(spr.scale.y, p.poses.attack[3] * px, 'the same pixel scale as the walk poses');
  }
  X.setSkinCell(spr, 0, 0);
  close(spr.scale.y, p.poses.S[3] * px, 'the S view is scaled by the class reference height');
  assert.strictEqual(X.SKIN_H, 72 * X.PACK_K, 'the hero keeps the height it already had next to the mobs');
});

t('the feet stay on the ground anchor and the pose is never left half-swapped', () => {
  assert.ok(src.includes('s.center.set(.5,0);                     // the drawn feet sit on the ground anchor'),
    'the sprite anchor is its own bottom edge, so every pose stands on the ground');
  const spr = skinSprite();
  spr.userData.skin.imgs.NE = { complete: false, naturalWidth: 0, naturalHeight: 0 };
  assert.strictEqual(X.setSkinCell(spr, 5, 0), false, 'an undecoded pose is refused');
  assert.strictEqual(spr.visible, false, 'and the sprite hides instead of showing another facing');
});

// ---------- asset loading and the hero ----------
t('the page loads the manifest and asks for the class\'s own files', () => {
  assert.ok(src.includes('<script src="assets/class_skins_data.js?v=1"></script>'), 'the manifest is loaded by the page');
  assert.ok(src.includes("im.src=encodeURI(p.dir+'/'+rec.files[v])"), 'the loader builds each URL from the manifest');
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/class_skins_data.js')), 'the manifest is committed');
});

t('all four views of a class load together before the skin is worn', () => {
  const p = X.skinPack('Knight', 'm');
  assert(p, 'Knight male has a skin pack');
  const urls = X.images.slice(-4).map(im => decodeURI(im.src));
  deepEq(urls.sort(), [
    'Updates/Sprite/Swordman/knight male walking S.png',
    'Updates/Sprite/Swordman/knight male walking NE.png',
    'Updates/Sprite/Swordman/knight male walking SE.png',
    'Updates/Sprite/Swordman/knight male attack SE.png',
  ].sort(), 'the four Knight files are requested');
  assert.strictEqual(X.skinLoaded(p), false, 'nothing is loaded yet');
  p.imgs.S.fire('load');
  assert.strictEqual(X.skinLoaded(p), false, 'one file is not enough - a half-loaded class would show the wrong pose');
  for (const v of ['SE', 'NE', 'attack']) p.imgs[v].fire('load');
  assert.strictEqual(X.skinLoaded(p), true, 'the whole class is ready');
  assert.strictEqual(X.skinPack('Knight', 'm'), p, 'and it is cached, not re-fetched every frame');
  assert.notStrictEqual(X.skinPack('Knight', 'f'), p, 'the other gender is its own set');
});

t('the hero wears the class skin once it is ready, and the animated body until then', () => {
  X.ensureHero({ cls: 'Knight', sex: 'm', tier: 1 });
  const first = X.hero();
  assert(first.userData.skin, 'the loaded Knight wears the uploaded art');
  assert(!first.userData.pack, 'and not the animated pack');
  const p = X.skinPack('Sniper', 'm');                      // a class whose art has not arrived yet
  X.ensureHero({ cls: 'Sniper', sex: 'm', tier: 3 });
  assert(X.hero().userData.pack, 'an unloaded class keeps the animated sprite - never a wrong pose');
  for (const v of Object.keys(p.files)) p.imgs[v].fire('load');
  X.ensureHero({ cls: 'Sniper', sex: 'm', tier: 3 });
  assert(X.hero().userData.skin, 'and switches to its own art the moment all four files are ready');
});

t('a missing file is reported and falls back - it never shows another class', () => {
  const before = X.images.length;
  const p = X.skinPack('High Wizard', 'f');
  assert.strictEqual(X.images.length - before, 4, 'the four High Wizard files are requested');
  p.imgs.SE.fire('error');
  assert(X.logged.some(m => /Class skin art could not load/.test(m)), 'the player is told in the log');
  X.ensureHero({ cls: 'High Wizard', sex: 'f', tier: 2 });
  assert(!X.hero().userData.skin, 'no skin is worn for that class');
  assert(X.hero().userData.pack, 'its animated High Wizard body is worn instead - never another class');
});

t('an attack draws the attack pose, and only then', () => {
  const spr = skinSprite(), p = spr.userData.skin;
  X.setSkinCell(spr, 0, 0);
  assert.strictEqual(spr.material.map.offset.y, 1 - (p.poses.S[1] + p.poses.S[3]) / 200, 'idle / walking shows the walk pose');
  X.setSkinCell(spr, 0, 1);
  assert.strictEqual(spr.material.map.offset.y, 1 - (p.poses.attack[1] + p.poses.attack[3]) / 200, 'a swing shows the attack art');
  assert.strictEqual(spr.scale.y, p.poses.attack[3] * (X.SKIN_H / p.ref), 'and it keeps the class scale');
});

t('a missing manifest leaves the game exactly as it was (the animated pack hero)', () => {
  const Y = boot({ noSkins: true });
  Y.ensureHero({ cls: 'Knight', sex: 'm', tier: 1 });
  assert.strictEqual(Y.skinPack('Knight', 'm'), null, 'no skin pack is invented out of thin air');
  assert(Y.hero().userData.pack, 'the animated Knight body is worn instead');
});

// ---------- previews ----------
t('both previews draw the real class art, not a stand-in', () => {
  assert.ok(src.includes('function drawSkinPreview(id,labelId,cls,sex){'), 'one preview renderer');
  assert.ok(src.includes("const p=skinPack(cls,sex),im=p?skinImage(p,'S'):null,f=p?p.poses.S:null;"),
    'the preview reads the same pack and the same S pose the hero uses');
  assert.ok(src.includes('ctx.drawImage(im,f[0],f[1],f[2],f[3],'), 'and draws the measured crop');
  assert.ok(src.includes("function drawAppearancePreview(){if(S)drawSkinPreview('hairPreview','hairPreviewLoading',S.cls,S.sex)}"),
    'the Appearance panel preview follows the class and gender you wear');
  assert.ok(src.includes("function drawClassPreview(){if(S)drawSkinPreview('classPreview','classPreviewLoading',selK||S.cls,S.sex)}"),
    'the class-change panel preview follows the class you are looking at');
  assert.ok(src.includes("if(tabs.includes('set'))drawAppearancePreview();if(tabs.includes('job'))drawClassPreview()}"),
    'opening or changing either panel redraws its preview');
  assert.ok(src.includes('id="classPreview"') && src.includes('id="classPreviewLoading"'), 'the class panel has its canvas and its loading note');
  assert.ok(src.includes('Loading sprite…'), 'the loading note exists');
});

t('the hairstyle is honestly reported as part of the class art', () => {
  assert.ok(src.includes('Hair comes with the class art'), 'the panel says so');
  assert.ok(src.includes('cannot be put on it'), 'and says why the 19 styles cannot be composed');
  assert.ok(src.includes('is still saved with your account'), 'and that the saved choice is not lost');
  assert.strictEqual(src.includes('data-a="hair" data-v="-1" aria-label="Previous hairstyle" title="Previous hairstyle"'), false,
    'the working hair buttons are gone');
  assert.ok(src.includes('data-a="hair"') === false, 'no live hair action is offered while the art is fixed');
  assert.ok(src.includes("hair:v=>{S.hair=(((S.hair|0)+(+v||1))%19+19)%19;heroKey='';ui();save()}"),
    'the save field and its handler stay for saves and for the pack fallback');
});

t('the held-weapon art is off while the class skins are finished', () => {
  assert.ok(src.includes('const HERO_HELD_WEAPON=false;'), 'one switch controls it');
  assert.ok(src.includes('if(!HERO_HELD_WEAPON){weaponNodes.forEach(n=>n.el.style.display=\'none\');return}'),
    'the overlay hides instead of being parked on a hand measured from the old atlas');
  assert.ok(src.includes('the held-weapon art is switched off while the class skins are finished'),
    'the panel tells the player');
  assert.ok(src.includes('Your equipped weapon still gives its full stats'), 'and that weapons still work');
});

// ---------- the generated manifest ----------
t('the committed manifest is the current build of the source art', () => {
  const run = spawnSync('python3', [path.join(ROOT, 'tools/make_class_skins.py'), '--check'], { encoding: 'utf8' });
  assert.strictEqual(run.status, 0, `manifest is stale: ${run.stderr || run.stdout}`);
  const viewer = spawnSync('python3', [path.join(ROOT, 'tools/make_sprite_viewer.py'), '--check'], { encoding: 'utf8' });
  assert.strictEqual(viewer.status, 0, `canonical viewer is stale: ${viewer.stderr || viewer.stdout}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`   ${CLASSES} class/gender entries, ${Object.keys(CLASS_SKINS.classes).length} classes, ${VIEWS.length} views each`);
process.exit(fail ? 1 : 0);
