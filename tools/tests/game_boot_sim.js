// tools/tests/game_boot_sim.js - the game page itself, at the level nothing else checks.
//
//   node tools/tests/game_boot_sim.js
//
// The other suites pull slices out of index.html (pack_sim runs packTex, sprite_sim greps the
// sprite tables, sprite_wire...).  None of them parses the WHOLE inline script, and that gap let a
// real one through: two `const BUILD=` lines in the same scope (both were in main) are a hard
// SyntaxError, so a browser ran no game code at all - the login card showed with no behaviour.
//
// This suite pins:
//   1. index.html carries ONE inline script and it parses (vm.Script = script scope, like a browser);
//   2. no top-level name is declared twice in that script (the exact bug above);
//   3. every <script src> that points into the repo exists - bar one known-missing file, and if that
//      list ever grows, that is a failure, not a footnote;
//   4. the SIMPLE set's artifact is loaded, parses, and carries the set's counts (1 idle / 3 walk /
//      2 attack) - so the page that draws the hero cannot silently lose it.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
};
console.log('the game page: it must parse, and it must find its data\n');

const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map(m => ({
  attrs: m[1], code: m[2], src: (/src="([^"]+)"/.exec(m[1]) || [])[1] }));
const inline = scripts.filter(s => !s.src);

t('index.html carries one inline script and nothing else inline', () => {
  assert.strictEqual(inline.length, 1, 'expected one inline script, saw ' + inline.length);
  assert.ok(inline[0].code.length > 50000, 'the inline script looks truncated (' + inline[0].code.length + ' chars)');
});

t('the whole inline script parses (this is what a duplicate const used to break)', () => {
  try { new vm.Script(inline[0].code, { filename: 'index.html' }); }
  catch (e) { assert.fail('the game script does not parse: ' + e.message); }
});

t('no top-level name is declared twice', () => {
  const seen = new Map();
  const top = inline[0].code.split('\n');
  for (let i = 0; i < top.length; i++) {
    const m = /^(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/.exec(top[i]);
    if (!m) continue;
    const name = m[1];
    if (seen.has(name)) {
      assert.fail('`' + name + '` is declared at line ' + (seen.get(name) + 1) + ' and again at line ' + (i + 1) +
        (name === 'BUILD' ? ' - two BUILD lines kill the whole script' : ''));
    }
    seen.set(name, i);
  }
  assert.ok(seen.size > 100, 'expected the game\'s top-level names, saw ' + seen.size);
});

t('every script the page loads from this repo exists', () => {
  const KNOWN_MISSING = [];       // the last one (the retired v1 kit atlas) was removed in tool-v43
  const missing = [];
  for (const s of scripts) {
    if (!s.src || /^https?:/.test(s.src)) continue;
    const file = s.src.split('?')[0];
    if (!fs.existsSync(path.join(ROOT, file))) missing.push(file);
  }
  const unexpected = missing.filter(f => !KNOWN_MISSING.includes(f));
  assert.strictEqual(JSON.stringify(unexpected), JSON.stringify([]), 'missing script files: ' + unexpected.join(', '));
  assert.ok(missing.length <= KNOWN_MISSING.length, 'the known-missing list grew: ' + missing.join(', '));
});

t('the SIMPLE set artifact is loaded and is the set (1 idle / 3 walk / 2 attack)', () => {
  const tag = scripts.find(s => /anim_pack_data\.js/.test(s.src || ''));
  assert.ok(tag, 'index.html must load assets/anim_pack_data.js');
  const file = path.join(ROOT, tag.src.split('?')[0]);
  assert.ok(fs.existsSync(file), 'the artifact must exist: ' + tag.src);
  const sb = { window: {} }; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sb);
  const AP = sb.window.ANIM_PACK;
  assert.ok(AP && AP.classes, 'the artifact must define window.ANIM_PACK');
  assert.strictEqual(AP.meta.counts.idle, 1, 'idle is one cell (a walk frame stands)');
  assert.strictEqual(AP.meta.counts.walk, 3, 'walk is three frames');
  assert.strictEqual(AP.meta.counts.attack, 2, 'attack is two frames');
  assert.strictEqual(Object.keys(AP.classes).length, 19, 'nineteen bodies');
  assert.ok(AP.meta.order.length === 10, 'ten cells per class');
});

t('the login card names the build that is actually in the file', () => {
  const m = /const BUILD='([^']+)'/.exec(inline[0].code);
  assert.ok(m, 'BUILD must exist (the login card shows it)');
  assert.ok(/ui-v\d+/.test(m[1]), 'BUILD must be a versioned tag, saw ' + m[1]);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
