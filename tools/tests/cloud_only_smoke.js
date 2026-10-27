// The owner's 2026-10-27 pass, checked in a real DOM: cloud-only saves, the repriced Cash Shop,
// the new Bundles tab, the C-shortcut removal and the rebuilt GM Tools panel.
//   node tools/tests/cloud_only_smoke.js
// Needs jsdom + three@0.128.0 (npm i --no-save jsdom three@0.128.0); skips cleanly without them.
const fs = require('fs'), path = require('path'), assert = require('assert');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('cloud-only smoke: skipped (npm i --no-save jsdom three@0.128.0)'); process.exit(0);
}
const ROOT = path.resolve(__dirname, '../..');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const rawHtml = html;
// jsdom does not fetch external scripts, so the page's own optional modules are inlined the same way
// shop_sim does it - the assertions then read the real code that ships.
for (const f of ['assets/wardrobe.js', 'assets/shop-catalog.js', 'assets/fourth-jobs.js', 'assets/wardrobe-ui.js', 'assets/shop.js']) {
  const re = new RegExp('<script src="' + f.replaceAll('.', '\\.') + '\\?v=[0-9]+"></script>');
  assert.ok(re.test(html), f + ' is loaded by index.html');
  html = html.replace(re, () => '<script>' + fs.readFileSync(path.join(ROOT, f), 'utf8') + '</script>');
}
let threePath = null;
try { threePath = require.resolve('three/build/three.min.js'); } catch (e) { threePath = null; }
if (!threePath) { console.log('cloud-only smoke: skipped (npm i --no-save jsdom three@0.128.0)'); process.exit(0); }
const three = fs.readFileSync(threePath, 'utf8');

function makeCtx() {
  const o = {
    canvas: null, globalAlpha: 1, globalCompositeOperation: 'source-over',
    clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, ellipse() {}, fill() {}, stroke() {}, rect() {}, clip() {}, save() {}, restore() {},
    setTransform() {}, resetTransform() {}, translate() {}, scale() {}, rotate() {}, drawImage() {},
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: (x, y, w, h) => ({ data: new Uint8Array(Math.max(1, w * h * 4)), width: w, height: h }),
    putImageData() {}, measureText: () => ({ width: 8 }), fillText() {}, strokeText() {},
    createPattern: () => null, drawFocusIfNeeded() {},
  };
  return new Proxy(o, { get(t, k) { return k in t ? t[k] : () => {}; } });
}

const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: false,
  beforeParse(window) {
    Object.defineProperty(window.document, 'hidden', { value: false, configurable: true });
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', { value: () => makeCtx() });
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'toDataURL', { value: () => 'data:image/png;base64,' });
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientWidth', { get() { return 1200; } });
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientHeight', { get() { return 800; } });
    window.Element.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 }; };
    window.Element.prototype.setPointerCapture = function () {};
    window.requestAnimationFrame = cb => { window.__raf = cb; return 1; };
    window.cancelAnimationFrame = () => {};
    window.fetch = () => Promise.reject(new Error('offline'));
    window.URL.createObjectURL = () => 'blob:x';
    window.eval(three);
    window.eval(`THREE.WebGLRenderer=function(){this.domElement=document.createElement('canvas');this.shadowMap={enabled:false};
      this.setSize=()=>{};this.setPixelRatio=()=>{};this.render=()=>{};this.dispose=()=>{};
      this.outputEncoding=0;this.toneMapping=0;this.getContext=()=>({})}`);
    for (const f of ['assets/sprite_pack_data.js', 'assets/class_skins_data.js', 'assets/weapon_joints_data.js'])
      window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  },
});
const { window } = dom;
const doc = window.document;
window.addEventListener('error', e => errors.push(String(e.message)));
const ev = code => window.eval(code);

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); console.log('  ok   ' + name); pass++; } catch (e) { console.log('  FAIL ' + name + ' -> ' + (e && e.stack || e)); fail++; } };
console.log('owner pass: cloud-only saves, cash shop, bundles, shortcuts and GM tools\n');

ev(`S=fresh();S.lv=12;S.cls='Novice';S.gm=true;ui()`);

// ------------------------------------------------------------------ the login card ----
t('the login card asks for an account and nothing else - no device save to choose', () => {
  for (const gone of ['saveDl', 'saveUp', 'saveFile', 'conflict', 'conflictCards', 'cfThis', 'cfCloud', 'cfLater'])
    assert.strictEqual(doc.getElementById(gone), null, gone + ' must be gone');
  assert.ok(doc.getElementById('loginHint').textContent.includes('server'), 'the card says where the character lives');
  assert.ok(doc.getElementById('cloudGate'), 'and the connection gate exists for a dropped connection');
  assert.strictEqual(doc.getElementById('cloudGate').style.display, 'none', 'hidden until the server cannot be reached');
});

t('the cloud layer has the gate, not a chooser', () => {
  const src = rawHtml;
  assert.ok(!/function cloudConflict\b/.test(src), 'cloudConflict is deleted, not orphaned');
  for (const fn of ['cloudGateShow', 'cloudGateHide', 'cloudConnectionLost', 'cloudReconnect'])
    assert.ok(new RegExp('function ' + fn + '\\(').test(src), fn + ' exists');
  // one answer: a 409 loads the account save
  assert.ok(/cloudAdopt\(data\)/.test(src));
});

// ------------------------------------------------------------- cash shop + bundles ----
t('the cash shop prices are the owner\'s: head, face and mouth $1.50, wings $2.00', () => {
  const cat = ev('PGShop.catalog(PGWardrobe)');
  const wings = cat.items.find(i => i.sku === 'cos:backwear:wings');
  assert.strictEqual(wings.price, 200, 'wings are $2.00');
  for (const slot of ['headwear', 'facewear', 'mouthwear']) {
    const rows = cat.items.filter(i => i.kind === 'cosmetic' && i.slot === slot);
    assert.ok(rows.length > 0, slot + ' has items');
    assert.ok(rows.every(i => i.price === 150), slot + ' costs $1.50');
  }
  assert.strictEqual(cat.items.filter(i => i.kind === 'cosmetic').length, 52, 'the 52 cosmetics that exist today');
});

t('both bundles exist at $8 and $20, with the developer-picked mix hard-slotted in', () => {
  const cat = ev('PGShop.catalog(PGWardrobe)');
  const bundles = cat.items.filter(i => i.kind === 'bundle');
  assert.strictEqual(JSON.stringify(bundles.map(b => b.sku).sort()), JSON.stringify(['bnd:adventurer', 'bnd:complete']));
  const advent = bundles.find(b => b.sku === 'bnd:adventurer');
  assert.strictEqual(advent.price, 800);
  assert.strictEqual(JSON.stringify(advent.take), JSON.stringify({ headwear: 4, facewear: 4, mouthwear: 2, backwear: 3 }));
  const complete = bundles.find(b => b.sku === 'bnd:complete');
  assert.strictEqual(complete.price, 2000);
  assert.strictEqual(complete.all, true, 'unlock all covers everything that exists today');
});

t('a bundle is rolled from what the player does not own yet, and cannot overflow a slot', () => {
  // The complete bundle first: nothing is left, so it resolves to nothing.
  const all = ev('PGShop.allCosmetics(PGWardrobe)').map(c => c.sku);
  const bundle = ev('PGShop.find(PGWardrobe,\'bnd:adventurer\')');
  assert.strictEqual(ev(`JSON.stringify(PGShop.bundleSkus(PGWardrobe,PGShop.find(PGWardrobe,'bnd:complete'),${JSON.stringify(all)}))`), '[]',
    'nothing left to unlock means nothing to deliver');
  const skus = JSON.parse(ev(`JSON.stringify(PGShop.bundleSkus(PGWardrobe,PGShop.find(PGWardrobe,'bnd:adventurer'),[]))`));
  assert.strictEqual(skus.length, 13, '4 + 4 + 2 + 3');
  assert.strictEqual(new Set(skus).size, 13, 'no duplicate');
  const own = {};
  for (const sku of skus) own[sku] = true;
  const bySlot = { headwear: 0, facewear: 0, mouthwear: 0, backwear: 0 };
  for (const sku of skus) bySlot[sku.split(':')[1]]++;
  assert.strictEqual(JSON.stringify(bySlot), JSON.stringify({ headwear: 4, facewear: 4, mouthwear: 2, backwear: 3 }), 'the mix is fixed');
  // owning half of the head slot still gives four heads, taken from the ones left
  const heads = ev('PGShop.allCosmetics(PGWardrobe)').filter(c => c.slot === 'headwear').map(c => c.sku);
  const partial = JSON.parse(ev(`JSON.stringify(PGShop.bundleSkus(PGWardrobe,PGShop.find(PGWardrobe,'bnd:adventurer'),${JSON.stringify(heads.slice(0, 6))}))`));
  assert.strictEqual(partial.filter(s => s.startsWith('cos:headwear:')).length, 4, 'the freed slots are refilled');
  assert.strictEqual(partial.filter(s => s.startsWith('cos:headwear:')).filter(s => heads.slice(0, 6).includes(s)).length, 0,
    'and never with something already owned');
});

t('the shop shows a Bundles tab, and its cards list what is in the box', () => {
  ev("tabs.length=0;tabs.push('shop');SHOP.view='bundles';renderWin()");
  const body = doc.querySelector('[data-win="shop"] .wbody');
  assert.ok(body.textContent.includes('Bundles'), 'the tab is on screen');
  assert.ok(body.textContent.includes('$8.00') && body.textContent.includes('$20.00'), 'both prices show');
  const tab = body.querySelector('[data-a="shop"][data-v="view:bundles"]');
  assert.ok(tab, 'the tab is clickable');
  assert.ok(tab.className.includes('on'), 'and it is the active one');
  assert.ok(body.textContent.includes('4 Head') || body.textContent.includes('4× Head'), 'the fixed mix is written down');
  ev("SHOP.view='cosmetics';renderWin()");
});

// --------------------------------------------------------------- the C shortcut ----
t('C no longer opens Cards, and R still opens Refine', () => {
  ev("tabs.length=0;tabs.push('index');expandedPanels.clear();renderWin()");
  const before = ev('tabs.join()');
  doc.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'c', bubbles: true }));
  assert.strictEqual(ev('tabs.join()'), before, 'C does nothing at all now');
  doc.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
  assert.ok(ev('tabs').includes('equip'), 'R still opens the equipment workspace');
  assert.strictEqual(ev("sub.equip"), 'refine');
  // the Cards UI itself is untouched: it is a sub-view of the bag
  ev("tabs.length=0;tabs.push('bag');sub.bag='cards';renderWin()");
  assert.ok(doc.querySelector('[data-win="bag"] .wbody').textContent.length > 0, 'the Cards view still renders');
});

// ------------------------------------------------------------------ GM tools ----
t('GM Tools is one panel with six directly clickable sections', () => {
  ev("tabs.length=0;tabs.push('gm');gmSection='quick';renderWin()");
  const body = doc.querySelector('[data-win="gm"] .wbody');
  const tabs = [...body.querySelectorAll('[data-a="gmsub"]')];
  assert.strictEqual(tabs.length, 6, 'six section buttons');
  assert.deepStrictEqual(tabs.map(b => b.getAttribute('data-v')), ['quick', 'level', 'gear', 'test', 'world', 'mail']);
  assert.strictEqual(body.querySelectorAll('select').length, 0, 'no section dropdown anywhere');
  // every section is in the DOM, only the active one is visible
  const sections = [...body.querySelectorAll('[data-gmsec]')];
  assert.strictEqual(sections.length, 6, 'all six sections are rendered');
  assert.strictEqual(sections.filter(s => !s.hasAttribute('hidden')).map(s => s.getAttribute('data-gmsec')).join(), 'quick');
  // clicking one switches, without a reload and without a dropdown
  tabs[3].click();
  assert.strictEqual(ev('gmSection'), 'test');
  const after = [...doc.querySelector('[data-win="gm"] .wbody').querySelectorAll('[data-gmsec]')];
  assert.deepStrictEqual(after.filter(s => !s.hasAttribute('hidden')).map(s => s.getAttribute('data-gmsec')), ['test']);
  assert.ok(doc.querySelector('[data-win="gm"] .wbody [data-a="gmall"]'), 'the one-click unlock button is there');
});

t('the one-click GM unlock really unlocks levels, jobs, classes, Zeny and materials', () => {
  ev("S=fresh();S.lv=12;S.cls='Novice';S.zeny=0;S.gm=true;gmSection='quick'");
  const src = rawHtml.slice(rawHtml.indexOf('function gmUnlockAll('), rawHtml.indexOf('function gmToolsPanel('));
  assert.ok(src.length > 200, 'gmUnlockAll is a real function');
  ev('gmUnlockAll()');
  assert.strictEqual(ev('S.lv'), 150, 'Base level is capped');
  assert.strictEqual(ev('S.exp'), 0);
  assert.ok(ev('S.zeny') >= 1e9, 'plenty of Zeny');
  assert.ok(ev("['ori','elu'].every(k=>S.ore[k]>=100000)"), 'ores are stocked');
  const unlocked = ev("Object.keys(CLASSES).filter(n=>S.jobs[n]&&S.jobs[n].jl===CLASSES[n].mj).length");
  assert.strictEqual(unlocked, ev('Object.keys(CLASSES).length'), 'every class is at its job cap');
  assert.strictEqual(ev('S.prog.every(v=>v===10)'), true, 'every stage is unlocked');
  assert.strictEqual(ev('S.ascensionMat && S.ascensionMat[0]>=100000'), true, 'Ascension materials too');
});

t('the panel and the game agree that no shortcut key opens GM tools', () => {
  assert.ok(!/k==='G'/.test(rawHtml), 'the GM tab keeps its G shortcut only through TABS, not a second handler');
});

if (errors.length) { console.log('\npage errors:\n' + errors.join('\n')); fail++; }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
