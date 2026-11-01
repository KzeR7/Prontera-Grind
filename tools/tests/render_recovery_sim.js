// v281: the page must survive a phone that takes the GPU away.
//   node tools/tests/render_recovery_sim.js
//
// The report: "playing in mobile, after awhile the screen goes full white". Two things in this page can
// produce exactly that, and neither had a way back:
//
//   1. THE RENDERER CANNOT BE BUILT. `const R = new THREE.WebGLRenderer(...)` is a single top-level
//      statement. On a phone the GPU process can be unavailable at the moment the page boots (another
//      game took it, the tab was restored in the background, or an old device ran out of WebGL
//      contexts). The constructor throws, the rest of the script never runs - no HUD, no UI, no way to
//      log in - and the field is a bare white box. Nothing caught it, so this was a permanent whiteout.
//
//   2. THE GPU CONTEXT IS LOST MID-SESSION. Android throws the context away when the tab is backgrounded
//      for a while or under memory pressure. three.js swallows the event, the canvas goes blank (white
//      against the page), and nothing tells the player anything - the game is still "running", it just
//      cannot draw. Tapping/rotating does nothing because there is nothing to draw.
//
// These are plain-node checks on the real source: no jsdom, no three, so they run in the gate.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
};
console.log('render recovery: a lost or unavailable GPU must not leave a white page\n');

// The single source statement the whole game hangs off.
const rendererLine = (src.match(/^.*new THREE\.WebGLRenderer.*$/m) || [''])[0];

t('the renderer is built by a helper, not by a bare top-level statement', () => {
  assert.ok(/function bootRenderer\(/.test(src), 'there is a bootRenderer() helper');
  assert.ok(!/^\s*(const|let|var)\s+R\s*=\s*new THREE\.WebGLRenderer/m.test(src),
    'the top-level `const R = new THREE.WebGLRenderer(...)` is gone - that statement cannot fail safely');
  assert.ok(/function buildRenderer\(/.test(src), 'and the construction itself lives in buildRenderer()');
});

t('building the renderer can fail without taking the rest of the page with it', () => {
  const fn = src.slice(src.indexOf('function buildRenderer('), src.indexOf('function bootRenderer('));
  assert.ok(/try\s*\{/.test(fn) && /catch/.test(fn), 'buildRenderer() catches the failure');
  assert.ok(/return null/.test(fn), 'and reports it by returning null instead of throwing');
  // A phone may refuse the first set of options and accept a plainer renderer.
  assert.ok(/antialias:false/.test(fn), 'a plainer retry is attempted before giving up');
  // attaching is bootRenderer()'s job, and only after buildRenderer() has returned something
  const boot = src.slice(src.indexOf('function bootRenderer('), src.indexOf('const R=bootRenderer();'));
  assert.ok(/if\(!r\)/.test(boot), 'bootRenderer() copes with buildRenderer() returning null');
  assert.ok(boot.indexOf('if(!r)') < boot.indexOf('view.prepend'), 'and does not touch the canvas before then');
});

t('a page with no GPU still boots, and says so on the field', () => {
  const fn = src.slice(src.indexOf('function bootRenderer('), src.indexOf('function bootRenderer(') + 1600);
  assert.ok(/noRendererNotice\(/.test(fn), 'bootRenderer() tells the player when there is no renderer');
  assert.ok(/function noRendererNotice\(/.test(src), 'the notice exists');
  const notice = src.slice(src.indexOf('function noRendererNotice('), src.indexOf('function noRendererNotice(') + 1400);
  assert.ok(/Reload|reload/.test(notice), 'it offers the one thing that can actually fix it: try again');
});

t('the field is not painted white when nothing is drawing on it', () => {
  // The white was the page showing through: #view has no background of its own. Whatever happens to the
  // canvas, the box the player is looking at must have the scenery colour behind it.
  assert.ok(/#view\{[^}]*background:/.test(src.replace(/\n/g, '')),
    '#view carries its own background, so an absent/blank canvas is not a white hole');
});

t('a lost GPU context is caught, and the page recovers when it comes back', () => {
  const i = src.indexOf('function bootRenderer(');
  assert.ok(i > 0, 'bootRenderer() exists');
  const fn = src.slice(i, i + 1600);
  assert.ok(/webglcontextlost/.test(fn), 'the lost event is listened for on the canvas');
  assert.ok(/e\.preventDefault\(\)/.test(src), 'and defaulted, which is what lets the browser restore the context at all');
  assert.ok(/webglcontextrestored/.test(fn), 'the restored event is listened for too');
  assert.ok(/function gpuContextLost\(/.test(src) && /function gpuContextRestored\(/.test(src),
    'both directions have a named handler');
});

t('the simulation is paused while the GPU is gone, so the player does not lose progress unseen', () => {
  const lost = src.slice(src.indexOf('function gpuContextLost('), src.indexOf('function gpuContextRestored('));
  assert.ok(/gpuLost\s*=\s*true/.test(lost), 'the lost handler raises the flag');
  assert.ok(/cloudFlushNow|save\(\)/.test(lost), 'and takes the chance to save what the player has');
  // loop() must not keep simulating against a renderer that cannot draw.
  const loop = src.slice(src.indexOf('function loop(now){'), src.indexOf('function loop(now){') + 400);
  assert.ok(/gpuLost/.test(loop), 'loop() honours the flag');
});

t('the recovery handlers are attached on EVERY path, including the no-GPU boot', () => {
  // The handlers live in bootRenderer(); nothing else may need to know about them.
  const boot = src.slice(src.indexOf('function bootRenderer('), src.indexOf('const R=bootRenderer();'));
  assert.ok(/bootRenderer\(\)/.test(src) || /bootRenderer\(\);/.test(src), 'bootRenderer() is called');
  assert.ok(/if\(!r\)/.test(boot), 'and it copes with buildRenderer() returning null');
  assert.ok(/const R=bootRenderer\(\)/.test(src), 'the game takes the renderer from it, not from the constructor');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
