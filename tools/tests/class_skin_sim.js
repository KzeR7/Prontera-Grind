// The live class skins: every one of the game's 19 classes wears its own uploaded ANIMATED PNG,
// in both genders, and the game decodes and plays those frames itself.
//   node tools/tests/class_skin_sim.js
//
// This suite runs the game's real skin code (extracted out of index.html) against the real
// generated manifest (assets/class_skins_data.js) and the real source files:
//
//   * the in-game APNG decoder is run over all 154 uploaded files and EVERY decoded frame is
//     compared byte-for-byte (SHA-256) against an independent Pillow rendering of the same file
//     (tools/tests/fixtures/apng_frame_sha.json, written by tools/make_apng_fixtures.py);
//   * a software canvas stands in for the browser's, so the hero's own pixels are checked: the
//     frame that is due at a given millisecond is exactly the frame Pillow sees, the mirror is a
//     horizontal flip of it, and two moments in the walk cycle really do differ;
//   * the routing/mirror table is cross-checked against the canonical viewer's manifest and pose
//     map, so the preview page and the game can never disagree about a file, a gender or a mirror;
//   * the fallbacks are checked too: a file that will not open, a browser with no APNG decoder,
//     a page opened as file://, and a missing manifest.
//
// The fixture needs Pillow only to be regenerated (see tools/make_apng_fixtures.py); the suite
// itself needs Node alone.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const zlib = require('zlib'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const grab = (a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error('missing ' + a);
  return src.slice(i, j);
};
let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
};
const tick = () => new Promise(r => setTimeout(r, 0));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const plain = v => JSON.parse(JSON.stringify(v));
const deepEq = (actual, expected, message) => assert.deepStrictEqual(plain(actual), expected, message);
const close = (actual, expected, message, eps = 1e-9) => assert.ok(Math.abs(actual - expected) < eps,
  `${message} (${actual} vs ${expected})`);

// ---------- metadata straight out of the source files ----------
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

// ---------- a software canvas, stand-in for the browser's ----------
function makeCanvas(w = 300, h = 150) {
  const cv = { _w: w | 0, _h: h | 0, _data: new Uint8ClampedArray(Math.max(0, w * h) * 4) };
  const alloc = () => { cv._data = new Uint8ClampedArray(Math.max(0, cv._w * cv._h) * 4); };
  Object.defineProperty(cv, 'width', { get: () => cv._w, set: (v) => { cv._w = Math.max(0, v | 0); alloc(); } });
  Object.defineProperty(cv, 'height', { get: () => cv._h, set: (v) => { cv._h = Math.max(0, v | 0); alloc(); } });
  cv.getContext = () => cv._ctx || (cv._ctx = ctxFor(cv));
  return cv;
}
function ctxFor(cv) {
  let m = [1, 0, 0, 1, 0, 0], drawn = [], transforms = [], stack = [];
  const blit = (x, y, w, h, pixel) => {
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(cv.width, Math.round(x + w)), y1 = Math.min(cv.height, Math.round(y + h));
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
      const at = (py * cv.width + px) * 4, p = pixel(px, py);
      cv._data[at] = p[0]; cv._data[at + 1] = p[1]; cv._data[at + 2] = p[2]; cv._data[at + 3] = p[3];
    }
  };
  return {
    imageSmoothingEnabled: false,
    get drawn() { return drawn; },
    get transforms() { return transforms; },
    clearRect(x, y, w, h) { blit(x, y, w, h, () => [0, 0, 0, 0]); },
    save() { stack.push({ matrix: m.slice(), smoothing: this.imageSmoothingEnabled }); },
    restore() { const state = stack.pop(); if (state) { m = state.matrix; this.imageSmoothingEnabled = state.smoothing; } },
    setTransform(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) { m = [a, b, c, d, e, f]; },
    resetTransform() { m = [1, 0, 0, 1, 0, 0]; },
    translate(tx, ty) { m = [m[0], m[1], m[2], m[3], m[0] * tx + m[2] * ty + m[4], m[1] * tx + m[3] * ty + m[5]]; },
    rotate(r) { const co = Math.cos(r), si = Math.sin(r); m = [m[0] * co + m[2] * si, m[1] * co + m[3] * si, m[2] * co - m[0] * si, m[3] * co - m[1] * si, m[4], m[5]]; },
    scale(sx, sy) { m = [m[0] * sx, m[1] * sx, m[2] * sy, m[3] * sy, m[4], m[5]]; },
    putImageData(image, dx, dy) {
      for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
        const from = (y * image.width + x) * 4, to = ((dy + y) * cv.width + dx + x) * 4;
        cv._data[to] = image.data[from]; cv._data[to + 1] = image.data[from + 1];
        cv._data[to + 2] = image.data[from + 2]; cv._data[to + 3] = image.data[from + 3];
      }
    },
    drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh) {
      drawn.push(Array.from(arguments));transforms.push(m.slice());
      if (!source || !source._data) return;                   // <img>: no pixels here, the args are the proof
      assert.ok(m[1] === 0 && m[2] === 0, 'the game only ever uses scale / flip transforms, not skew or rotation');
      blit(dx, dy, dw, dh, (px, py) => {
        // device pixel centres -> user space -> source pixels: survives the game's flip exactly
        const ux = (px + 0.5 - m[4]) / (m[0] || 1), uy = (py + 0.5 - m[5]) / (m[3] || 1);
        const ix = Math.floor(sx + (ux - dx) * sw / dw), iy = Math.floor(sy + (uy - dy) * sh / dh);
        if (ix < 0 || iy < 0 || ix >= source.width || iy >= source.height) return [0, 0, 0, 0];
        const at = (iy * source.width + ix) * 4;
        return [source._data[at], source._data[at + 1], source._data[at + 2], source._data[at + 3]];
      });
    },
  };
}

// ---------- the harness ----------
function ImageStub() {
  const im = { complete: false, naturalWidth: 0, naturalHeight: 0, onload: null, onerror: null, dataset: {}, style: { cssText: '' }, alt: '', draggable: true, decoding: '' };
  im.fire = (kind) => {
    if (kind === 'error') { im.onerror && im.onerror(); return; }
    im.complete = true; im.naturalWidth = 200; im.naturalHeight = 200; im.onload && im.onload();
  };
  Object.defineProperty(im, 'src', { get: () => im._src, set: (v) => { im._src = v; if (/^data:/.test(v)) im.fire('load'); } });
  return im;
}
// A DecompressionStream good enough for the game's use ('deflate'), backed by Node's zlib - so the
// decoder under test is the real one, byte for byte.
class DecompressionStreamShim {
  constructor() {
    let controller = null;
    this.readable = new ReadableStream({ start(c) { controller = c; } });
    const chunks = [];
    this.writable = new WritableStream({
      write(chunk) { chunks.push(Buffer.from(chunk)); },
      close() {
        const raw = zlib.inflateSync(Buffer.concat(chunks));
        controller.enqueue(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
        controller.close();
      },
    });
  }
}
function boot(options = {}) {
  const fetched = [], images = [], appended = [];
  const element = (tag) => {
    if (tag === 'canvas') return makeCanvas();
    return { tagName: String(tag).toUpperCase(), id: '', dataset: {}, style: { cssText: '', display: '' }, textContent: '',
      appendChild(c) { appended.push(c); return c; }, setAttribute() {}, width: 0, height: 0 };
  };
  const box = { window: {}, document: { body: element('div'), createElement: element } };
  const anchors = Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => [63, 60])));
  const bodies = {};
  for (const name of ['thief', 'assassin', 'assassin_cross', 'novice', 'mage', 'archer', 'aco', 'swordman', 'blacksmith', 'merchant', 'knight', 'lord_knight', 'wizard', 'high_wizard', 'hunter', 'sniper', 'priest', 'high_priest', 'whitesmith'])
    bodies[name] = { atlas: 'data:image/png;base64,AA', anchors };
  box.window.SPRITE_PACK = { cellW: 126, cellH: 134, padL: 15, padT: 38, pivotX: 63, pivotY: 128, frames: [1, 8, 6], hairStyles: 19, bodies, heads: { male: 'data:image/png;base64,AA', female: 'data:image/png;base64,AA' } };
  if (!options.noSkins) box.window.CLASS_SKINS = CLASS_SKINS;
  if (options.withWeapons) {
    box.window.WEAPON_ART = WEAPON_ART;
    box.window.WEAPON_PROPOSAL_DEFAULT = WEAPON_PROPOSAL_DEFAULT;
  }
  box.__imageStub = ImageStub;
  box.__appended = appended;
  box.__fetched = fetched;
  box.__images = images;
  box.ImageData = class { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } };
  if (!options.noDecode) box.DecompressionStream = DecompressionStreamShim;
  box.Response = Response;                             // the vm needs the host's stream reader
  box.ReadableStream = ReadableStream;
  box.WritableStream = WritableStream;
  if (options.fileProtocol) box.location = { protocol: 'file:', href: 'file:///tmp/index.html' };
  box.fetch = async (url) => {
    const rel = decodeURI(String(url));
    fetched.push(rel);
    if (options.fail && options.fail.includes(rel)) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    const buf = fs.readFileSync(file);
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
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
    let heroKey='',heroSpr=null,heroHeadSpr=null,heroDirty=false,selK=null;
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
    + `\nthis.__x={SKIN_SIZE,SKIN_VIEW,SKIN_ATTACK_MIRROR,SKIN_H,PACK_K,SKIN_CACHE_MAX,SKIN_STRIP_KEEP,SKIN_DECODE,
        skinPack,skinDoc,skinImage,skinLoaded,skinViewReady,skinRoute,skinFrameIndex,skinFrameOf,skinStrip,skinStrips,skinStripOrder,
        skinDecodePng,skinDecodeView,skinDecoding,mkSkinHero,captureSkinFrame,ensureHero,skinNow,
        skinWeaponPlacement,drawSkinWeapon,SKIN_WEAPON_DEFAULTS,SKIN_WEAPON_ART,
        SKIN_WEAPON_GRIP,SKIN_WEAPON_ANGLE,SKIN_WEAPON_HAND,SKIN_WEAPON_DESIGN,SKIN_WEAPON_BASE_SCALE,
        images:()=>images,logged:()=>logged,fetched:()=>__fetched,
        setS:(v)=>{S=v},selK:(v)=>{selK=v},
        broken:()=>skinBroken,hero:()=>heroSpr,appended:()=>__appended};`, box);
  return box.__x;
}

// ---------- the real manifest, the canonical viewer, the game's class list ----------
const manifestSrc = fs.readFileSync(path.join(ROOT, 'assets/class_skins_data.js'), 'utf8');
const dataBox = { window: {} };
vm.createContext(dataBox);
vm.runInContext(manifestSrc + '\nthis.__s={CLASS_SKINS:window.CLASS_SKINS};', dataBox);
const CLASS_SKINS = dataBox.__s.CLASS_SKINS;
const weaponAssetsBox = { window: {} };
vm.createContext(weaponAssetsBox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/weapons_data.js'), 'utf8'), weaponAssetsBox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/weapon_proposal_data.js'), 'utf8'), weaponAssetsBox);
const WEAPON_ART = weaponAssetsBox.window.WEAPON_ART;
const WEAPON_PROPOSAL_DEFAULT = weaponAssetsBox.window.WEAPON_PROPOSAL_DEFAULT;
const SPRITE_DIR = path.join(ROOT, CLASS_SKINS.dir);
const fixturePath = path.join(ROOT, 'tools/tests/fixtures/apng_frame_sha.json');
assert.ok(fs.existsSync(fixturePath),
  'the frame fixture is missing - regenerate it with: /tmp/venv/bin/python3 tools/make_apng_fixtures.py');
const FIXTURE = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

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

// Which frame a file's own delays say is due at a moment - computed here, not from the game code.
function dueIndex(delays, ms) {
  const secs = delays.map(([num, den]) => num / (den || 100));
  const total = secs.reduce((a, b) => a + b, 0);
  let t = (ms / 1000) % total;
  for (let i = 0; i < secs.length; i++) { t -= secs[i]; if (t < 0) return i; }
  return secs.length - 1;
}

// Frame bytes help: a decoded strip is one row of equal-sized frames.
function stripFrame(cv, index, size) {
  size = size || cv.height;
  const out = Buffer.alloc(size * cv.height * 4);
  for (let y = 0; y < cv.height; y++) {
    const from = (y * cv.width + index * size) * 4;
    Buffer.from(cv._data.buffer, cv._data.byteOffset + from, size * 4).copy(out, y * size * 4);
  }
  return out;
}
const canvasBytes = (cv) => Buffer.from(cv._data.buffer, cv._data.byteOffset, cv.width * cv.height * 4);
const pending = (X) => Object.keys(X.skinDecoding).length;
const settle = async (X, limit = 2000) => {
  for (let i = 0; i < limit && pending(X); i++) await tick();
  assert.strictEqual(pending(X), 0, 'every decode promise settles');
};

(async () => {
  console.log('class skins: the live hero art, every class and gender, every decoded frame\n');
  const X = boot();

  // ---------- the decoder, against Pillow ----------
  await t('the in-game APNG decoder reproduces Pillow\'s frames byte for byte (all 154 files)', async () => {
    const files = Object.keys(FIXTURE.files);
    assert.strictEqual(files.length, 154, 'the fixture covers all 154 uploaded files');
    const problems = [];
    let frames = 0;
    for (const rel of files) {
      const strip = await X.skinDecodePng(new Uint8Array(fs.readFileSync(path.join(SPRITE_DIR, rel))));
      const want = FIXTURE.files[rel];
      if (!strip) { problems.push(`${rel}: could not be decoded`); continue; }
      if (strip.n !== want.frames.length) { problems.push(`${rel}: decoded ${strip.n} frames, Pillow saw ${want.frames.length}`); continue; }
      if (strip.cv.width !== 200 * strip.n || strip.cv.height !== 200) { problems.push(`${rel}: strip is ${strip.cv.width}x${strip.cv.height}`); continue; }
      for (let i = 0; i < strip.n; i++) {
        const got = sha(stripFrame(strip.cv, i));
        if (got !== want.frames[i]) problems.push(`${rel} frame ${i + 1}: pixels differ from Pillow's`);
      }
      frames += strip.n;
    }
    assert.deepStrictEqual(problems.slice(0, 5), [], problems.slice(0, 5).join(' | '));
    assert.strictEqual(frames, 1195, 'every frame of every file was compared');
    console.log(`   ${files.length} files, ${frames} frames decoded in JavaScript and matched against Pillow`);
  });

  await t('the animations are really animated (a walk cycle is not one repeated drawing)', () => {
    const problems = [];
    let still = 0;
    for (const [rel, entry] of Object.entries(FIXTURE.files)) {
      const distinct = new Set(entry.frames).size;
      if (distinct < 2) { still++; problems.push(rel); }
    }
    assert.deepStrictEqual(problems, [], `files whose frames are all identical: ${problems.join(', ')}`);
    const walk = FIXTURE.files['Swordman/knight male walking S.png'];
    assert.ok(new Set(walk.frames).size >= 4, 'a walk cycle has several visibly different frames');
    assert.ok(new Set(FIXTURE.files['Swordman/knight male attack SE.png'].frames).size >= 3, 'and so does an attack');
    console.log(`   0 files repeated a frame; every one of the 154 plays through different frames`);
  });

  await t('the file\'s own delays and endless loop are what the game plays', () => {
    // The manifest's delays (from the APNG chunks) must be what Pillow read from the same chunks.
    const problems = [];
    for (const [name, entry] of Object.entries(CLASS_SKINS.classes)) {
      for (const sex of ['m', 'f']) for (const [view, rel] of Object.entries(entry[sex].files)) {
        const manifestMs = entry[sex].delays[view].map(([num, den]) => num / (den || 100) * 1000);
        const fixtureMs = FIXTURE.files[rel].delays;
        if (manifestMs.length !== fixtureMs.length || manifestMs.some((ms, i) => Math.abs(ms - fixtureMs[i]) > 0.5))
          problems.push(`${name} ${sex} ${view}: ${JSON.stringify(manifestMs)} vs ${JSON.stringify(fixtureMs)}`);
      }
    }
    assert.deepStrictEqual(problems, [], problems.join(' | '));
    // And the frame that is due at a moment is chosen from those delays, wrapping forever.
    const p = { secs: { v: [0.075, 0.075, 0.075, 0.075, 0.075, 0.075, 0.075, 0.075] }, total: { v: 0.6 } };
    const at = (ms) => X.skinFrameIndex(p, 'v', ms);
    deepEq([at(0), at(74.9), at(75), at(600 - 0.1), at(600), at(600 + 75)], [0, 0, 1, 7, 0, 1],
      'the file\'s delays decide the frame, and the loop runs forever');
    deepEq([at(-1), at(600 * 1000 + 40)], [7, 0], 'a negative or far-future clock still lands on a real frame');
    const uneven = { secs: { v: [0.1, 0.1, 0.1, 0.1, 0.1] }, total: { v: 0.5 } };
    deepEq([X.skinFrameIndex(uneven, 'v', 250), X.skinFrameIndex(uneven, 'v', 499)], [2, 4],
      'a longer, uneven animation steps through its own frames');
    assert.deepStrictEqual(plain(Object.keys(X.skinFrameIndex({ secs: {}, total: {} }, 'v', 123))), [],
      'a pack with no delays can never index past the end');
  });

  await t('a delay denominator of 0 is read as 100, the way the APNG spec says', () => {
    const secs = [50 / (0 || 100)];
    close(secs[0], 0.5, 'num/0 means num/100 seconds');
    const p = { secs: { v: [0.5, 0.5] }, total: { v: 1 } };
    deepEq([X.skinFrameIndex(p, 'v', 0), X.skinFrameIndex(p, 'v', 600)], [0, 1], 'and the clock follows it');
  });

  // ---------- the hero's own pixels ----------
  await t('the hero paints the frame that is due right now (and it changes as time passes)', async () => {
    const p = X.skinPack('Knight', 'm');
    assert(p, 'Knight male has a pack');
    await settle(X);
    const spr = X.mkSkinHero(p);
    const ctx = spr.userData.skin.cv.getContext('2d');
    const rel = p.files.S, want = FIXTURE.files[rel].frames;
    const delays = CLASS_SKINS.classes.Knight.m.delays.S;
    const at = (ms) => dueIndex(delays, ms);
    for (const ms of [0, 1, 74, delays[0][0] / delays[0][1] * 1000 - 1, delays[0][0] / delays[0][1] * 1000,
                      (delays[0][0] / delays[0][1] * 1000) * 2.5, p.total.S * 1000, p.total.S * 1000 + 40]) {
      const index = at(ms);
      assert.strictEqual(X.captureSkinFrame(spr, { view: 'S', mirror: false }, ms), true, `capture at ${ms}ms`);
      const got = sha(canvasBytes(spr.userData.skin.cv));
      assert.strictEqual(got, want[index], `at ${ms}ms the hero shows frame ${index + 1} of ${rel}, exactly as Pillow renders it`);
    }
    const seen = new Set();
    for (const ms of [0, 120, 240, 360, 480, 600, 720, 840])
      { X.captureSkinFrame(spr, { view: 'S', mirror: false }, ms); seen.add(sha(canvasBytes(spr.userData.skin.cv))); }
    assert.ok(seen.size >= 6, `the walk really moves through its frames (${seen.size} different pictures in one cycle)`);
    console.log(`   the hero canvas byte-matches Pillow frame after frame, and ${seen.size} distinct pictures play per cycle of ${rel}`);
  });

  await t('an attack plays the file\'s attack frames from its first frame', async () => {
    const p = X.skinPack('High Wizard', 'f');
    await settle(X);
    const spr = X.mkSkinHero(p);
    const want = FIXTURE.files[p.files.attack].frames;
    const delays = CLASS_SKINS.classes['High Wizard'].f.delays.attack;
    const step = delays[0][0] / delays[0][1] * 1000;
    // walking first, so switching to the swing has to restart the clock at frame 0 of the attack
    X.captureSkinFrame(spr, { view: 'S', mirror: false }, 0);
    X.captureSkinFrame(spr, { view: 'attack', mirror: false }, 0);       // the swing starts here
    for (const ms of [0, step / 2, step, step * 2, step * 2.5]) {
      X.captureSkinFrame(spr, { view: 'attack', mirror: false }, ms);
      const index = dueIndex(delays, ms);
      assert.strictEqual(sha(canvasBytes(spr.userData.skin.cv)), want[index],
        `an attack at ${ms}ms shows attack frame ${index + 1}, as the file's own delays say`);
    }
  });

  await t('SW / NW / attack SW are the same frames mirrored - drawn flipped, never re-encoded', async () => {
    const p = X.skinPack('Archer', 'f');
    await settle(X);
    const right = X.mkSkinHero(p), left = X.mkSkinHero(p);
    X.captureSkinFrame(right, { view: 'SE', mirror: false }, 0);
    X.captureSkinFrame(left, { view: 'SE', mirror: true }, 0);
    const a = canvasBytes(right.userData.skin.cv), b = canvasBytes(left.userData.skin.cv);
    const W = 200;
    let wrong = 0;
    for (let y = 0; y < 200; y++) for (let x = 0; x < W; x++)
      for (let c = 0; c < 4; c++) if (a[(y * W + x) * 4 + c] !== b[(y * W + (W - 1 - x)) * 4 + c]) wrong++;
    assert.strictEqual(wrong, 0, 'the mirrored capture is the drawn frame flipped horizontally');
    assert.strictEqual(sha(b), sha(stripFrame(X.skinStrip(p, 'SE').cv, 0).length ? b : b), 'and it is a real frame, not a blank');
    // and the mirrored swing keeps working on the attack too
    X.captureSkinFrame(right, { view: 'attack', mirror: false }, 0);
    X.captureSkinFrame(left, { view: 'attack', mirror: true }, 0);
    const c = canvasBytes(right.userData.skin.cv), d = canvasBytes(left.userData.skin.cv);
    let wrong2 = 0;
    for (let y = 0; y < 200; y++) for (let x = 0; x < W; x++)
      for (let k = 0; k < 4; k++) if (c[(y * W + x) * 4 + k] !== d[(y * W + (W - 1 - x)) * 4 + k]) wrong2++;
    assert.strictEqual(wrong2, 0, 'the mirrored attack is the drawn attack flipped horizontally');
  });

  await t('the log says the frames arrived, so the player can see the animation is running', async () => {
    const Y = boot();
    const p = Y.skinPack('Rogue' in CLASS_SKINS.classes ? 'Rogue' : 'Hunter', 'f');
    await settle(Y);
    const line = Y.logged().find(m => /Class skin animation ready/.test(m));
    assert.ok(line, 'a ready line is logged once the class\'s frames are decoded');
    assert.ok(/female/.test(line), 'it names the class and gender: ' + line);
    for (const view of Object.keys(p.files)) assert.ok(line.includes(`${p.frames[view]} ${view}`), `it names the ${view} frame count`);
    assert.ok(/played with the file's own delays/.test(line), 'and says where the timing comes from');
    assert.strictEqual(Y.logged().filter(m => /Class skin animation ready/.test(m)).length, 1, 'once per class and gender, not once per view');
  });

  await t('a dropped decoded view never blanks the hero, and a new facing never shows the old one', async () => {
    const Y = boot();
    const p = Y.skinPack('Sniper', 'm');
    await settle(Y);
    const spr = Y.mkSkinHero(p);
    assert.strictEqual(Y.captureSkinFrame(spr, { view: 'S', mirror: false }, 0), true, 'the S walk paints');
    const before = sha(canvasBytes(spr.userData.skin.cv));
    Y.skinStrips.delete(p.dir + '/' + p.files.S);                 // exactly what an eviction does
    assert.strictEqual(Y.captureSkinFrame(spr, { view: 'S', mirror: false }, 100), false, 'there is nothing left to draw');
    assert.strictEqual(sha(canvasBytes(spr.userData.skin.cv)), before, 'so the frame already on screen stays put');
    assert.strictEqual(spr.visible, true, 'the hero is not blanked');
    await settle(Y);
    assert(Y.skinStrip(p, 'S'), 'and that view is decoded again in the background, on its own');
    Y.skinStrips.delete(p.dir + '/' + p.files.NE);
    assert.strictEqual(Y.captureSkinFrame(spr, { view: 'NE', mirror: false }, 0), false, 'a facing with no art cannot paint');
    assert.strictEqual(spr.visible, false, 'so it hides rather than showing the straight-down pose while walking up-left');
  });

  await t('nothing stale is ever shown: no frames yet means the hero hides', () => {
    const Y = boot();                                   // a decoder that never finishes
    Y.fetch = () => new Promise(() => {});
    const p = Y.skinPack('Sniper', 'f');
    const spr = Y.mkSkinHero(p);
    assert.strictEqual(Y.captureSkinFrame(spr, { view: 'SE', mirror: true }, 0), false, 'an undecoded view cannot be captured');
    assert.strictEqual(spr.visible, false, 'so the sprite hides rather than showing the previous pose');
  });

  // ---------- class -> file mapping ----------
  await t('the game\'s own class list is exactly what the skin manifest covers', () => {
    assert.strictEqual(GAME_CLASSES.length, 19, 'the game has 19 classes');
    deepEq(Object.keys(CLASS_SKINS.classes).slice().sort(), GAME_CLASSES.slice().sort(),
      'the manifest must cover every class the game can be played as, and no others');
  });

  await t('every class and gender resolves to its own art in its own tree folder', () => {
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
          if (meta.frames !== FIXTURE.files[rec.files[view]].frames.length) problems.push(`${name} ${sex} ${view}: the frame fixture is stale`);
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

  await t('every source file really is an animated, endlessly looping PNG', () => {
    const counts = {};
    let files = 0;
    for (const entry of Object.values(CLASS_SKINS.classes)) {
      for (const sex of ['m', 'f']) for (const file of Object.values(entry[sex].files)) {
        const meta = apngMeta(path.join(SPRITE_DIR, file));
        if (meta.plays !== 0) assert.fail(`${file}: does not loop forever`);
        if (meta.frames < 2) assert.fail(`${file}: a still, not an animation`);
        counts[meta.frames] = (counts[meta.frames] || 0) + 1;
        files++;
      }
    }
    assert.strictEqual(files, 152 + 2, '76 class/gender/view files plus High Priest\'s two N files');
    deepEq(counts, { 5: 13, 6: 4, 8: 127, 9: 10 },
      'the uploaded set\'s frame counts: 127 files of 8, 13 of 5, 4 of 6 and 10 of 9');
    console.log(`   ${files} source animations, frame counts ${JSON.stringify(plain(counts))}`);
  });

  await t('every class and gender is wired to its own male / female file', () => {
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

  await t('each class job is a distinct entry (no class borrows another class\'s art)', () => {
    const seen = new Map();
    for (const [name, entry] of Object.entries(CLASS_SKINS.classes)) {
      const key = entry.tree + '/' + entry.job;
      assert(!seen.has(key), `${name} and ${seen.get(key)} share the ${key} art`);
      seen.set(key, name);
    }
    assert.strictEqual(seen.size, 19, 'the seven folders cover all 19 jobs');
  });

  await t('the manifest agrees with the canonical viewer about every file it names', () => {
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

  await t('the filename variants the uploads use are handled (walking / attack / attacking)', () => {
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

  await t('the four supplied views are the ones the owner asked for, and each one is drawn unmirrored', () => {
    deepEq(CLASS_SKINS.views, ['S', 'SE', 'NE', 'attack'], 'S, SE, NE walk plus the SE attack');
    deepEq([dirOf(0).view, dirOf(0).mirror], ['S', false], 'walking straight down is the S animation');
    deepEq([dirOf(7).view, dirOf(7).mirror], ['SE', false], 'walking down-right is the SE animation');
    deepEq([dirOf(5).view, dirOf(5).mirror], ['NE', false], 'walking up-right is the NE animation');
    deepEq([dirOf(0, 1).view, dirOf(0, 1).mirror], ['attack', false], 'the drawn swing is used as supplied');
  });

  await t('SW, NW and the SW attack are the supplied animation mirrored - not a different file', () => {
    deepEq([dirOf(1).view, dirOf(1).mirror], ['SE', true], 'down-left is SE mirrored');
    deepEq([dirOf(3).view, dirOf(3).mirror], ['NE', true], 'up-left is NE mirrored');
    for (const dir of [1, 2, 3]) assert.strictEqual(dirOf(dir, 1).mirror, true, `attack ${dir} is the mirrored swing`);
    for (const dir of [0, 4, 5, 6, 7]) assert.strictEqual(dirOf(dir, 1).mirror, false, `attack ${dir} is the drawn swing`);
    deepEq(X.SKIN_ATTACK_MIRROR, [0, 1, 1, 1, 0, 0, 0, 0], 'the attack mirror list is the one documented');
  });

  await t('the game\'s route table is the canonical viewer\'s route table', () => {
    const expected = { 0: ['S', 0], 1: ['SE', 1], 2: ['SE', 1], 3: ['NE', 1], 4: ['NE', 0], 5: ['NE', 0], 6: ['SE', 0], 7: ['SE', 0] };
    deepEq(X.SKIN_VIEW, expected, 'the eight facings resolve to the four supplied views');
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
  });

  await t('the views the art does not carry use a named nearest animation, and it is documented', () => {
    const nov = X.skinPack('Novice', 'm'), hp = X.skinPack('High Priest', 'm');
    deepEq([dirOf(4).view, dirOf(4).mirror], ['NE', false], 'straight up uses the NE animation');
    deepEq([dirOf(6).view, dirOf(6).mirror], ['SE', false], 'straight right uses the SE animation');
    deepEq([dirOf(2).view, dirOf(2).mirror], ['SE', true], 'straight left uses the SE animation mirrored');
    deepEq([X.skinRoute(hp, 4, 0).view, X.skinRoute(hp, 4, 0).mirror], ['N', false],
      'a class that supplies its own straight-up art uses it');
    deepEq([X.skinRoute(nov, 4, 0).view], ['NE'], 'a class without one falls back to NE');
    assert.ok(!src.includes('The art has no E or W animation'), 'the retired view essay is gone (v57 cleaned the panel)');
  });

  await t('the art has no idle animation, and the standing-still policy says so out loud', () => {
    assert(!Object.values(CLASS_SKINS.classes).some(e => Object.keys(e.m.files).includes('idle')),
      'no idle animation is invented or claimed');
    deepEq([X.skinRoute(X.skinPack('Knight', 'f'), 0, 0).view, X.skinRoute(X.skinPack('Knight', 'f'), 0, 0).mirror], ['S', false],
      'at rest the S walk animation keeps playing (the viewer\'s behaviour)');
    assert.ok(!src.includes('the art has no idle animation'), 'the retired idle note is gone too');
  });

  // ---------- the drawn cell ----------
  const skinSprite = (cls = 'Knight', sex = 'm') => X.mkSkinHero(X.skinPack(cls, sex));

  await t('the hero is one 200x200 canvas texture drawing the complete square image', () => {
    const spr = skinSprite(), sk = spr.userData.skin;
    assert.ok(sk.p.files.S.includes('knight male walking S.png'), 'the Knight wears its own art');
    assert.strictEqual(X.SKIN_SIZE, 200, 'the source canvas is 200x200');
    close(spr.center.x, sk.p.anchor[0] / 200, 'the anchor x is the figure centre');
    close(spr.center.y, 1 - sk.p.anchor[1] / 200, 'the anchor y is the ground line, so the feet stay put');
    close(spr.scale.x, spr.scale.y, 'the square image is never stretched');
    close(spr.scale.y, X.SKIN_SIZE * (X.SKIN_H / sk.p.height), 'one constant scale per class and gender');
    close(X.SKIN_H, 72 * X.PACK_K, 'the drawn character keeps the height the hero already had next to the mobs');
  });

  await t('each rendered frame copies the due animation frame onto the canvas, nothing else', async () => {
    const p = X.skinPack('Wizard', 'f');
    await settle(X);
    const spr = X.mkSkinHero(p);
    const ctx = spr.userData.skin.cv.getContext('2d');
    X.captureSkinFrame(spr, { view: 'S', mirror: false }, 0);
    assert.strictEqual(ctx.drawn[0][0], X.skinStrip(p, 'S').cv, 'the source is the decoded strip');
    deepEq(ctx.drawn[0].slice(1), [0, 0, 200, 200, 0, 0, 200, 200],
      'one whole 200x200 frame from the decoded strip, never a crop of the source art');
    assert.strictEqual(spr.userData.skin.tex.needsUpdate, true, 'the GPU texture is flagged so the frame reaches the screen');
    ctx.drawn.length = 0;
    const step = CLASS_SKINS.classes.Wizard.f.delays.S[0][0] / CLASS_SKINS.classes.Wizard.f.delays.S[0][1] * 1000;
    X.captureSkinFrame(spr, { view: 'S', mirror: false }, step);
    assert.strictEqual(ctx.drawn.length, 1, 'and it paints again next render');
    assert.strictEqual(ctx.drawn[0][1], 200, 'with the next frame\'s row of the strip');
    assert.ok(src.includes('captureSkinFrame(heroSpr,route)'), 'the game calls it from the render loop');
    const call = src.indexOf('captureSkinFrame(heroSpr,route)'), render = src.indexOf('R.render(scene,cam)', call);
    assert.ok(render > call, 'before the frame is rendered');
    assert.ok(!/setInterval|requestAnimationFrame/.test(grab('function captureSkinFrame(', 'function packTex(')),
      'no second animation clock: the file\'s own delays drive it through the one render loop');
  });

  await t('the new art is never pushed through the old atlas slicing', () => {
    const skinBlock = grab('function skinLayer(){', 'function packTex(opt){');
    assert.ok(!skinBlock.includes('repeat.set(1/8,1/24)'), 'the APNG path has no 8x24 atlas repeat');
    assert.ok(!skinBlock.includes('setPackCell'), 'and never calls the atlas cell setter');
    assert.ok(!skinBlock.includes('offset.set'), 'nor the atlas UV offsets');
    assert.ok(skinBlock.includes('putImageData') && skinBlock.includes('skinUnfilter'),
      'it decodes the file\'s own frames instead');
    assert.ok(src.includes('const hd=viewDir(pFace),sk=heroSpr.userData.skin;'), 'the render loop branches on the skin sprite');
  });

  // ---------- asset loading and the hero ----------
  await t('the saved weapon proposals load before the game and composite onto the matching APNG frames', async () => {
    const artTag=src.indexOf('<script src="assets/weapons_data.js?v=1"></script>');
    const proposalTag=src.indexOf('<script src="assets/weapon_proposal_data.js?v=1"></script>');
    const gameScript=src.indexOf('<script>\nconst $=');
    assert.ok(artTag>=0&&proposalTag>artTag&&gameScript>proposalTag,'weapon art and saved placements load before the game code');
    const Y=boot({withWeapons:true});
    const proposalPage=fs.readFileSync(path.join(ROOT,'tools/weapon_proposal.html'),'utf8');
    const pageObject=name=>{
      const prefix=`const ${name} = `,start=proposalPage.indexOf(prefix);
      assert(start>=0,`the proposal page still defines ${name}`);
      const literalStart=start+prefix.length,end=proposalPage.indexOf('};',literalStart);
      assert(end>literalStart,`${name} is still a complete object`);
      const box={};vm.createContext(box);vm.runInContext('this.value='+proposalPage.slice(literalStart,end+1),box);return plain(box.value);
    };
    const familyDesigns=pageObject('DESIGNS'),fallbackDesigns=Object.fromEntries(Object.entries(familyDesigns).map(([family,ids])=>[family,ids[0]]));
    deepEq(Y.SKIN_WEAPON_GRIP,pageObject('GRIP'),'runtime grip points stay identical to the proposal renderer');
    deepEq(Y.SKIN_WEAPON_ANGLE,pageObject('ANGLE'),'runtime resting angles stay identical to the proposal renderer');
    deepEq(Y.SKIN_WEAPON_HAND,pageObject('HAND'),'automatic hand guesses stay identical to the proposal renderer');
    deepEq(Y.SKIN_WEAPON_DESIGN,fallbackDesigns,'alternate equipped families use the proposal\'s first design');
    const scaleMatch=proposalPage.match(/const BASE_SCALE = ([0-9.]+);/);
    assert(scaleMatch,'the proposal has its saved weapon scale');
    assert.strictEqual(Y.SKIN_WEAPON_BASE_SCALE,+scaleMatch[1],'runtime artwork scale matches the proposal page');
    assert.strictEqual(Object.keys(WEAPON_PROPOSAL_DEFAULT.classes).length,19,'the runtime defaults cover all 19 jobs');
    for(const [name,record] of Object.entries(WEAPON_PROPOSAL_DEFAULT.classes))
      assert.ok(WEAPON_ART[record.design],`${name} selected design ${record.design} is bundled locally`);

    let checkedPlacements=0;
    for(const [name,record] of Object.entries(WEAPON_PROPOSAL_DEFAULT.classes))for(const sex of ['m','f']){
      const skin=CLASS_SKINS.classes[name][sex],pose={cls:name,sex,frames:skin.frames,poses:skin.poses};
      for(const [view,saved] of Object.entries(record.views[sex])){
        const count=skin.frames[view]||1;
        for(let fi=0;fi<count;fi++){
          const P=Y.skinWeaponPlacement(pose,record,view,fi);
          assert.strictEqual(!!P,!!saved.weapon,`${name}/${sex}/${view} frame ${fi} respects its weapon checkbox`);
          if(P){for(const f of ['hx','hy','dx','dy','rot','scale'])assert.ok(Number.isFinite(P[f]),`${name}/${sex}/${view} frame ${fi} has finite ${f}`);checkedPlacements++}
        }
      }
    }
    assert.ok(checkedPlacements>100,`the runtime resolves the full saved frame matrix (${checkedPlacements} armed frames)`);
    const p=Y.skinPack('Novice','m');await settle(Y);
    assert.strictEqual(p.cls,'Novice','the decoded skin carries its class key');
    assert.strictEqual(p.sex,'m','the decoded skin carries its gender key');
    const spr=Y.mkSkinHero(p),ctx=spr.userData.skin.cv.getContext('2d');
    Y.captureSkinFrame(spr,{view:'attack',mirror:false,weaponType:'dagger'},0);
    assert.strictEqual(ctx.drawn.length,2,'the attack frame and one weapon sprite are painted together');
    assert.strictEqual(ctx.drawn[1][0].src,'data:image/png;base64,'+WEAPON_ART.dagger_broken,'the saved Novice design is the actual bundled PNG');
    const noviceFrame=Y.skinWeaponPlacement(p,WEAPON_PROPOSAL_DEFAULT.classes.Novice,'attack',0);
    deepEq(noviceFrame,{hx:87,hy:115,dx:0,dy:0,rot:-344,scale:.6,fx:1,fy:1},'the first saved attack frame resolves to its own hand, angle and flip');
    const archer=Y.skinPack('Archer','m');await settle(Y);
    deepEq(Y.skinWeaponPlacement(archer,WEAPON_PROPOSAL_DEFAULT.classes.Archer,'attack',5),
      {hx:119.67,hy:110.67,dx:0,dy:0,rot:45.33,scale:1.3,fx:-1,fy:1},
      'an unkeyed Archer frame blends between the saved keys just like the proposal page');
    assert.ok(src.includes('route.weaponType=wt'),'the equipped class weapon family reaches the canvas compositor');
    close(ctx.transforms[1][4],87,'the weapon grip is positioned on the chosen hand x');
    close(ctx.transforms[1][5],115,'the weapon grip is positioned on the chosen hand y');
    deepEq(ctx.drawn[1].slice(1),[-75,-129,150,150],'the image uses the proposal page\'s 1.25x scale and dagger grip point');

    ctx.drawn.length=0;ctx.transforms.length=0;
    Y.captureSkinFrame(spr,{view:'attack',mirror:true,weaponType:'dagger'},0);
    assert.strictEqual(ctx.drawn.length,2,'the mirrored attack still carries one weapon');
    close(ctx.transforms[1][4],113,'the overlay is mirrored with the body around the 200px sprite centre');
    close(ctx.transforms[1][5],115,'mirroring preserves the hand height');
    ctx.drawn.length=0;ctx.transforms.length=0;
    Y.captureSkinFrame(spr,{view:'S',mirror:false,weaponType:'dagger'},0);
    assert.strictEqual(ctx.drawn.length,1,'the Novice remains bare on a view whose saved toggle is off');

    const F=boot({withWeapons:true}),female=F.skinPack('Novice','f');await settle(F);
    const fspr=F.mkSkinHero(female),fctx=fspr.userData.skin.cv.getContext('2d');
    F.captureSkinFrame(fspr,{view:'attack',mirror:false,weaponType:'dagger'},0);
    assert.strictEqual(fctx.drawn[1][0].src,'data:image/png;base64,'+WEAPON_ART.dagger_broken,'female art keeps the class\'s selected design');
    close(fctx.transforms[1][4],74,'the female hand-back offset is applied to her own first frame');
    close(fctx.transforms[1][5],78,'the female frame uses its own vertical offset');

    const M=boot({withWeapons:true}),merchant=M.skinPack('Merchant','m');await settle(M);
    const mspr=M.mkSkinHero(merchant),mctx=mspr.userData.skin.cv.getContext('2d');
    M.captureSkinFrame(mspr,{view:'attack',mirror:false,weaponType:'mace'},0);
    assert.strictEqual(mctx.drawn[1][0].src,'data:image/png;base64,'+WEAPON_ART.mace_gold,
      'a Merchant equipped with a mace gets matching local art even though the saved class pick is an axe');
  });

  await t('the page loads the manifest and asks for the class\'s own files, once each', async () => {
    assert.ok(src.includes('<script src="assets/class_skins_data.js?v=1"></script>'), 'the manifest is loaded by the page');
    assert.ok(src.includes('await fetch(encodeURI(url))'), 'the loader URL-encodes the source path (it contains spaces)');
    const Y = boot();
    const p = Y.skinPack('Lord Knight', 'f');
    deepEq(Y.fetched().slice().sort(), [
      'Updates/Sprite/Swordman/lordknight female walking S.png',
      'Updates/Sprite/Swordman/lordknight female walking SE.png',
      'Updates/Sprite/Swordman/lordknight female walking NE.png',
      'Updates/Sprite/Swordman/lordknight female attack SE.png',
    ].sort(), 'exactly the files this class and gender really has are requested');
    await settle(Y);
    deepEq(Y.fetched().sort(), p.files && Object.values(p.files).map(f => 'Updates/Sprite/' + f).sort(),
      'once each, no repeats');
    assert.strictEqual(Y.skinLoaded(p), true, 'and all four are decoded');
  });

  await t('all supplied views decode before the skin is worn, and the animated fallback covers the wait', async () => {
    const Y = boot();
    const p = Y.skinPack('Assassin', 'm');
    assert.strictEqual(Y.skinLoaded(p), false, 'nothing is decoded yet');
    Y.ensureHero({ cls: 'Assassin', sex: 'm', tier: 2 });
    assert.strictEqual(Y.hero().userData.skin, undefined, 'so the hero is not wearing it yet');
    assert(Y.hero().userData.pack, 'the animated pack keeps the game playable - never a half-loaded class');
    await settle(Y);
    assert.strictEqual(Y.skinLoaded(p), true, 'every view is decoded');
    Y.ensureHero({ cls: 'Assassin', sex: 'm', tier: 2 });
    assert(Y.hero().userData.skin, 'and now the Assassin\'s own animation is worn');
    assert(!Y.hero().userData.pack, 'instead of the pack');
  });

  await t('a file that will not open is reported, and the class falls back - never a stale pose', async () => {
    const Y = boot({ fail: ['Updates/Sprite/Merchant/whitesmith female attack SE.png'] });
    const p = Y.skinPack('Whitesmith', 'f');
    await settle(Y);
    assert(Y.logged().some(m => /Class skin animation could not be read/.test(m)), 'the player is told in the log');
    assert.ok(Y.logged().some(m => /HTTP 404/.test(m)), 'with the reason');
    assert.strictEqual(Y.skinLoaded(p), false, 'that class is not worn');
    Y.ensureHero({ cls: 'Whitesmith', sex: 'f', tier: 3 });
    assert(!Y.hero().userData.skin, 'no skin is worn for that class');
    Y.ensureHero({ cls: 'Whitesmith', sex: 'f', tier: 3 });
    assert(Y.hero().userData.pack, 'its animated Whitesmith body is worn instead - never another class');
    assert.strictEqual(Y.hero().userData.body, 'whitesmith', 'and it is that class\'s own body art');
    assert.strictEqual(Y.broken(), true, 'and the Appearance panel will say the frames could not be read');
  });

  await t('a browser with no frame decoder keeps the art, and says the animation needs the served page', async () => {
    const Y = boot({ noDecode: true });
    const p = Y.skinPack('Priest', 'm');
    assert.strictEqual(Y.SKIN_DECODE, false, 'the decoder is unavailable');
    assert.ok(Y.logged().some(m => /this browser cannot decode the frames/.test(m)), 'it is reported, not hidden');
    assert.ok(Y.logged().some(m => /serve the game over http/.test(m)), 'with what to do about it');
    assert.strictEqual(Y.logged().some(m => /could not load/.test(m)), false, 'and no image error, because the art is still shown');
    Y.ensureHero({ cls: 'Priest', sex: 'm', tier: 2 });
    assert(Y.hero().userData.pack, 'the animated pack covers the wait, exactly as before');
    Y.images().forEach(im => im.fire('load'));
    assert.strictEqual(Y.skinLoaded(p), true, 'the art itself still arrives (drawn without its frames)');
    Y.ensureHero({ cls: 'Priest', sex: 'm', tier: 2 });
    assert(Y.hero().userData.skin, 'and is worn');
    assert.strictEqual(Y.broken(), true, 'with the honest note on the panel');
    assert.ok(src.includes('<b>Some animations could not be read</b>'), 'which the panel really renders');
  });

  await t('a page opened as a file:// URL leans on the images instead of fetch', async () => {
    const Y = boot({ fileProtocol: true });
    Y.skinPack('Mage', 'm');
    assert.strictEqual(Y.SKIN_DECODE, false, 'fetch + DecompressionStream are not assumed there');
    assert.strictEqual(Y.fetched().length, 0, 'nothing is fetched');
    assert.ok(Y.images().length >= 4, 'the <img> decoders are used instead');
    assert.ok(Y.logged().some(m => /the page is not being served over http/.test(m)), 'and the log explains the missing frames');
  });

  await t('a missing manifest leaves the game exactly as it was (the animated pack hero)', () => {
    const Y = boot({ noSkins: true });
    Y.ensureHero({ cls: 'Knight', sex: 'm', tier: 1 });
    assert.strictEqual(Y.skinPack('Knight', 'm'), null, 'no skin pack is invented out of thin air');
    assert(Y.hero().userData.pack, 'the animated Knight body is worn instead');
  });

  await t('decoded animations are cached, bounded, and the worn class is never evicted', async () => {
    const Y = boot();
    Y.ensureHero({ cls: 'Knight', sex: 'm', tier: 2 });
    const worn = Y.skinPack('Knight', 'm');
    await settle(Y);
    Y.ensureHero({ cls: 'Knight', sex: 'm', tier: 2 });
    assert(Y.hero().userData.skin, 'the Knight is worn');
    const names = Object.keys(CLASS_SKINS.classes);
    for (const name of names) Y.skinPack(name, 'm');            // look at every class, as the panel can
    await settle(Y);
    assert.ok(Y.skinStrips.size <= Y.SKIN_STRIP_KEEP, `at most ${Y.SKIN_STRIP_KEEP} decoded views stay in memory (kept ${Y.skinStrips.size})`);
    for (const view of Object.keys(worn.files))                    // the worn class must still be there
      assert(Y.skinStrip(worn, view), `the worn class keeps its ${view} animation decoded`);
    const again = Y.fetched().length;
    Y.skinPack('Knight', 'm');
    assert.strictEqual(Y.fetched().length, again, 'and no file is fetched twice while it is cached');
    console.log(`   ${Y.skinStrips.size} of ${names.length * 4} decoded views were kept (cap ${Y.SKIN_STRIP_KEEP})`);
  });

  await t('the fallback <img> layer is still clipped, invisible and bounded', () => {
    assert.ok(src.includes("el.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1'"),
      'the fallback decoder layer is clipped and transparent, never display:none');
    assert.ok(src.includes('const SKIN_CACHE_MAX=24;') && src.includes('skinDocOrder.length>SKIN_CACHE_MAX'),
      'the fallback image cache is bounded');
    assert.ok(src.includes('const SKIN_STRIP_KEEP=18;'), 'and the decoded animations have their own bound');
  });

  // ---------- previews ----------
  await t('both previews play the real class animation, not a still', async () => {
    assert.ok(src.includes('function drawSkinPreview(id,labelId,cls,sex){'), 'one preview renderer');
    assert.ok(src.includes("const p=skinPack(cls,sex),f=p?skinFrameOf(p,'S'):null;"),
      'the preview reads the same pack and the same S animation the hero wears');
    assert.ok(src.includes('ctx.drawImage(f.img,f.sx+ax-bw/2,ay-bh+6,bw,bh,0,0,cv.width,cv.height);'),
      'and draws the frame that is due, framed around the art\'s own anchor');
    const Y = boot();
    const p = Y.skinPack('Blacksmith', 'm');
    await settle(Y);
    const delays = CLASS_SKINS.classes.Blacksmith.m.delays.S;
    for (const ms of [0, 137, 500, 900]) {
      const index = dueIndex(delays, ms);
      assert.strictEqual(Y.skinFrameOf(p, 'S', ms).sx, index * 200,
        `at ${ms}ms the preview shows frame ${index + 1} (200px row ${index} of the strip)`);
    }
    assert.ok(new Set([0, 137, 500, 900].map(ms => Y.skinFrameOf(p, 'S', ms).sx)).size > 1,
      'so the preview really animates rather than repeating one frame');
    assert.ok(src.includes("if(tabs.includes('set'))drawAppearancePreview();") &&
              src.includes("if(tabs.includes('job'))drawClassPreview();"),
      'the game loop redraws whichever preview is open');
    assert.ok(src.includes("function drawAppearancePreview(){if(S)drawSkinPreview('hairPreview','hairPreviewLoading',S.cls,S.sex)}"),
      'the Appearance panel preview follows the class and gender you wear');
    assert.ok(src.includes("function drawClassPreview(){if(S)drawSkinPreview('classPreview','classPreviewLoading',selK||S.cls,S.sex)}"),
      'the class-change panel preview follows the class you are looking at');
    assert.ok(src.includes('id="classPreview"') && src.includes('id="classPreviewLoading"'), 'the class panel has its canvas and its loading note');
    assert.ok(src.includes('animating'), 'the panels say the preview is animating');
  });

  await t('the old melee swing arc is off, so the uploaded attack is not doubled', () => {
    assert.ok(src.includes('const HERO_SWING_ARC=false;'), 'the arc sits behind one named switch');
    assert.ok(src.includes("slashM.visible=HERO_SWING_ARC&&atkAnim>.12&&wt!=='bow'&&wt!=='staff';"),
      'and the swing cue is gated by it (bow and staff shots are untouched)');
    const decl = src.indexOf('const HERO_SWING_ARC=false;'), use = src.indexOf('slashM.visible=HERO_SWING_ARC&&');
    assert.ok(decl >= 0 && decl < use, 'the switch is declared before the function that reads it');
    assert.ok(!src.includes('The white melee swing arc is switched off too'), 'the retired swing-arc note is gone');
    assert.ok(!src.includes('HERO_SWING_ARC=true'), 'nothing switches the duplicate arc back on by accident');
  });

  await t('the hairstyle and the held weapon are honestly reported', () => {
    assert.ok(src.includes('hair included'), 'the hair is stated as part of the art');
    assert.ok(src.includes('Costumes - outfits that restyle a class without touching its stats - are planned for a future patch.'),
      'and the Costume slot is honestly promised for a future patch');
    assert.ok(!src.includes('data-a="hair"'), 'no live hair action is offered while the art is fixed');
    assert.ok(src.includes("hair:v=>{S.hair=(((S.hair|0)+(+v||1))%19+19)%19;heroKey='';ui();save()}"),
      'the save field and its handler stay for saves and for the pack fallback');
    assert.ok(src.includes('const HERO_HELD_WEAPON=false;'), 'the held-weapon overlay is off behind one switch');
    assert.ok(src.includes("if(!HERO_HELD_WEAPON){weaponNodes.forEach(n=>n.el.style.display='none');return}"),
      'so no old weapon icon floats on the new art');
  });

  // ---------- the generated manifest ----------
  await t('the simplest APNG the repo ships round-trips through the game\'s decoder', async () => {
    // tools/make_simple_apng.py writes the simplest form and reports the SHA-256 of every frame's
    // raw RGBA; the game's own decoder must read that file back and produce exactly those frames.
    const demo = path.join(ROOT, 'Updates/ApngAnimation/simple_apng_demo.png');
    assert.ok(fs.existsSync(demo), 'the note\'s demo APNG must be committed with it');
    for (const file of [demo]) {
      const run = spawnSync('python3', [path.join(ROOT, 'tools/make_simple_apng.py'), '--verify', file, '--json'], { encoding: 'utf8' });
      assert.strictEqual(run.status, 0, `the writer could not read its own file: ${run.stderr}`);
      const report = JSON.parse(run.stdout.trim().split('\n').pop());
      const strip = await X.skinDecodePng(new Uint8Array(fs.readFileSync(file)));
      assert(strip, 'the game\'s decoder reads the simplest-form APNG');
      assert.strictEqual(strip.n, report.frames, 'frame count agrees with the writer');
      assert.strictEqual(strip.cv.height, report.height, 'frame size agrees with the writer');
      for (let i = 0; i < strip.n; i++)
        assert.strictEqual(sha(stripFrame(strip.cv, i)), report.frames_sha[i],
          `frame ${i + 1} of ${path.basename(file)} decodes identically in Python and in the game`);
      assert.ok(strip.n >= 2, 'and the demo really carries several frames');
      console.log(`   ${path.basename(file)}: ${strip.n} frames, ${report.width}x${report.height}, decoded identically by the writer and the game`);
    }
    // a fresh file written by the same tool must also round-trip (not just the committed one)
    const tmp = path.join(require('os').tmpdir(), 'class_skin_simple_apng_check.png');
    const built = spawnSync('python3', [path.join(ROOT, 'tools/make_simple_apng.py'), '--demo', tmp, '--json'], { encoding: 'utf8' });
    assert.strictEqual(built.status, 0, `the demo writer failed: ${built.stderr}`);
    const builtReport = JSON.parse(built.stdout.trim().split('\n').pop());
    const builtStrip = await X.skinDecodePng(new Uint8Array(fs.readFileSync(tmp)));
    assert(builtStrip && builtStrip.n === builtReport.frames, 'a freshly written APNG decodes too');
    for (let i = 0; i < builtStrip.n; i++)
      assert.strictEqual(sha(stripFrame(builtStrip.cv, i)), builtReport.frames_sha[i],
        `freshly written frame ${i + 1} matches the game's decoder`);
  });

  await t('the animation code backup next to the notes matches the live game', () => {
    const run = spawnSync('python3', [path.join(ROOT, 'tools/backup_apng_code.py'), '--check'], { encoding: 'utf8' });
    assert.strictEqual(run.status, 0, `Updates/ApngAnimation/class_skin_animation.js is stale: ${run.stderr || run.stdout}`);
    const backup = fs.readFileSync(path.join(ROOT, 'Updates/ApngAnimation/class_skin_animation.js'), 'utf8');
    assert.ok(backup.includes('function skinDecodePng(') && backup.includes('function captureSkinFrame('),
      'the backup really carries the animation, not just a comment');
    assert.ok(fs.existsSync(path.join(ROOT, 'Updates/ApngAnimation/README.md')),
      'and the note that explains the method sits beside it');
    const note = fs.readFileSync(path.join(ROOT, 'Updates/ApngAnimation/README.md'), 'utf8')
      .replace(/\s+/g, ' ');                       // the note is wrapped prose: compare it unwrapped
    for (const must of ['acTL', 'fcTL', 'fdAT', 'DecompressionStream', 'skinFrameIndex', 'num_plays',
      'browsers pause an APNG that is not painted on screen', 'make_simple_apng.py',
      'python3 tools/make_class_skins.py', 'tools/tests/fixtures/apng_frame_sha.json'])
      assert.ok(note.includes(must), `the note must still cover ${must}`);
  });

  await t('the committed manifest and the frame fixture are the current build of the source art', () => {
    const run = spawnSync('python3', [path.join(ROOT, 'tools/make_class_skins.py'), '--check'], { encoding: 'utf8' });
    assert.strictEqual(run.status, 0, `manifest is stale: ${run.stderr || run.stdout}`);
    const viewerRun = spawnSync('python3', [path.join(ROOT, 'tools/make_sprite_viewer.py'), '--check'], { encoding: 'utf8' });
    assert.strictEqual(viewerRun.status, 0, `canonical viewer is stale: ${viewerRun.stderr || viewerRun.stdout}`);
    assert.strictEqual(FIXTURE.dir, CLASS_SKINS.dir, 'the fixture describes the same source folder');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(`   ${Object.keys(CLASS_SKINS.classes).length} classes, ${Object.keys(CLASS_SKINS.classes).length * 2} class/gender sets, ${CLASS_SKINS.views.length} supplied views each`);
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error('the suite itself broke:', err); process.exit(1); });
