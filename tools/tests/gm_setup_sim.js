// The local-GM setup page: it must hand the game a password the game accepts, and it must never
// carry a password of its own.
//   node tools/tests/gm_setup_sim.js
//
// tools/gm_setup.html exists so the owner can get into a preview with the GM tab on without opening
// devtools. That makes it a door, so the two things worth pinning are:
//
//   1. it stores no secret - no password, no hash, nothing baked in. You type a password and it
//      writes YOUR hash to YOUR browser's localStorage;
//   2. the hash it writes is the game's own - it lifts hashPw()/GM_ROUNDS out of the served
//      index.html instead of re-implementing them, so the page and the game cannot drift.
//
// Both halves are checked against the real files: the page is booted in jsdom with the real
// index.html behind its fetch, and the value it stores is then fed to the real gmOk().
//
// Needs jsdom: npm i --no-save jsdom   (without it this prints a skip line and exits 0, like the
// other suites that need a package).
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ROOT = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const pagePath = path.join(ROOT, 'tools/gm_setup.html');
const page = fs.readFileSync(pagePath, 'utf8');

let pass = 0, fail = 0;
const t = (n, f) => { try { const r = f(); if (r && r.then) return r.then(() => { console.log('  ok   ' + n); pass++; }, e => { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; }); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('gm setup page: a local GM password the game accepts, and no secret in the repo\n');

// ---------- the game's own GM hash, lifted exactly the way tools/make_gm_hash.js lifts it ----------
const fnStart = src.indexOf('function hashPw(p){');
const fnEnd = src.indexOf('\n', src.indexOf('return(h2>>>0)', fnStart));
assert.ok(fnStart > 0 && fnEnd > fnStart, 'index.html must still define hashPw()');
const hashPw = new Function('return ' + src.slice(fnStart, fnEnd))();
const ROUNDS = +src.match(/const GM_ROUNDS=(\d+)/)[1];
const FILE_HASH = src.match(/GM_PASS_HASH='([0-9a-f]{16})'/)[1];
const gmHash = p => { let h = hashPw('pg-gm:' + p); for (let i = 0; i < ROUNDS; i++) h = hashPw(h); return h; };

// ---------- 1. no secret in the page ----------
t('the page bakes in no password and no hash', () => {
  assert.ok(!page.includes(FILE_HASH), 'the file\'s own GM hash is not copied into the page');
  const hex = page.match(/\b[0-9a-f]{16}\b/g) || [];
  assert.deepStrictEqual(hex, [], 'no 16-hex constant anywhere in the page: ' + hex.join(','));
  assert.ok(!/value\s*=\s*["'][^"']+["']/.test(page.match(/<input[^>]*>/)[0]), 'the password field opens empty');
  assert.ok(!/localStorage\.setItem\([^)]*,\s*['"][0-9a-f]{8,}['"]/.test(page), 'nothing writes a literal hash');
  // and the password only ever comes from the field the owner types into
  assert.ok(page.includes("const pw=$('pw').value;"), 'the password is read from the input, not defaulted');
  const script = page.slice(page.lastIndexOf('<script>') + 8, page.lastIndexOf('</script>'));
  assert.ok(!/gmHash\(['"][^'"]+['"]\)/.test(script),
    'the script hashes no password of its own (the console example in the prose is not code)');
  assert.ok(!/localStorage\.setItem\(/.test(script.replace("localStorage.setItem(KEY,gmHash(pw));", '')),
    'the only write is the one keyed to the typed password');
});

t('the page never re-implements the hash - it lifts the game\'s own', () => {
  assert.ok(page.includes("fetch('/index.html'"), 'it reads the served game');
  assert.ok(page.includes("src.indexOf('function hashPw(p){')"), 'and takes hashPw() out of it');
  assert.ok(page.includes("src.match(/const GM_ROUNDS=(\\d+)/)"), 'and GM_ROUNDS too');
  const script = page.slice(page.lastIndexOf('<script>') + 8, page.lastIndexOf('</script>'));
  const defs = (script.match(/function hashPw/g) || []).length;
  assert.strictEqual(defs, 1, 'hashPw is named exactly once in the script');
  assert.ok(script.includes("src.indexOf('function hashPw(p){')"), 'and that once is the lookup string, not a definition');
  assert.ok(!/function hashPw\(p\)\{let/.test(page), "the game's hashPw body is not copied in");
  assert.ok(!/0xdeadbeef|2654435761/.test(page), 'and none of the game\'s mixing constants are copied in');
  assert.ok(page.includes("throw new Error('could not find hashPw() in index.html"),
    'and it fails loudly instead of writing a hash the game will never match');
});

t('the page cannot reach a deployed site', () => {
  const ignore = fs.readFileSync(path.join(ROOT, '.assetsignore'), 'utf8');
  assert.ok(/^tools\/$/m.test(ignore), 'tools/ is excluded by .assetsignore, so this page is dev only');
  const pub = fs.readFileSync(path.join(ROOT, 'tools/tests/publish_sim.js'), 'utf8');
  assert.ok(/tools/.test(pub), 'and publish_sim.js keeps watching for it');
  const srv = fs.readFileSync(path.join(ROOT, 'tools/preview_server.py'), 'utf8');
  assert.ok(srv.includes("'/gmsetup': 'tools/gm_setup.html'"), 'the preview server routes /gmsetup to it');
});

// ---------- 2. what it stores is what the game accepts ----------
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { JSDOM = null; }

const finish = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
if (!JSDOM) { console.log('  --   jsdom not installed: the stored-hash check was skipped (npm i --no-save jsdom)'); finish(); }

(async () => {
  await t('typing a password stores exactly the game\'s own gmHash of it, and the game accepts it', async () => {
    const dom = new JSDOM(page, {
      runScripts: 'dangerously', url: 'https://preview.local/gmsetup', pretendToBeVisual: false,
      beforeParse(window) {
        window.fetch = async (u) => {
          assert.strictEqual(String(u), '/index.html', 'the page asks for the served game');
          return { ok: true, status: 200, text: async () => src };
        };
      },
    });
    const { window } = dom;
    for (let i = 0; i < 200 && !window.document.getElementById('state').textContent.includes('hashPw'); i++)
      await new Promise(r => setTimeout(r, 5));
    assert.ok(/using the game's own hashPw, 20000 extra rounds/.test(window.document.getElementById('state').textContent),
      'the page lifted the real hash: ' + window.document.getElementById('state').textContent);

    const PW = 'owner-preview-pw';
    window.document.getElementById('pw').value = PW;
    window.document.getElementById('set').onclick();
    const stored = window.localStorage.getItem('pg_gm_local');
    assert.strictEqual(stored, gmHash(PW), 'localStorage holds gmHash(the typed password)');
    assert.notStrictEqual(stored, FILE_HASH, 'and it is not the file\'s own GM hash');
    assert.strictEqual(window.document.getElementById('pw').value, '', 'the field is cleared afterwards');

    // feed that stored value to the REAL gmOk() from index.html
    const box = { lsGet: k => (k === 'pg_gm_local' ? stored : null), console };
    vm.createContext(box);
    const okStart = src.indexOf('const gmOk=p=>{');
    vm.runInContext(`const GM_ROUNDS=${ROUNDS},GM_PASS_HASH='${FILE_HASH}';`
      + src.slice(fnStart, fnEnd)
      + `\nconst gmHash=p=>{let h=hashPw('pg-gm:'+p);for(let i=0;i<GM_ROUNDS;i++)h=hashPw(h);return h};`
      + src.slice(okStart, src.indexOf('\n', okStart))
      + '\nthis.__ok={good:gmOk(PW),bad:gmOk(PW+"x")};', Object.assign(box, { PW }));
    assert.strictEqual(box.__ok.good, true, 'the game accepts the password the page stored');
    assert.strictEqual(box.__ok.bad, false, 'and refuses a wrong one');

    // removing it puts the door back
    window.document.getElementById('clear').onclick();
    assert.strictEqual(window.localStorage.getItem('pg_gm_local'), null, 'Remove clears it');
    dom.window.close();
  });

  await t('a game the page cannot read leaves the door shut instead of half-open', async () => {
    const dom = new JSDOM(page, {
      runScripts: 'dangerously', url: 'https://preview.local/gmsetup', pretendToBeVisual: false,
      beforeParse(window) { window.fetch = async () => ({ ok: false, status: 404, text: async () => '' }); },
    });
    const { window } = dom;
    for (let i = 0; i < 200 && !/Cannot read the game/.test(window.document.getElementById('msg').textContent); i++)
      await new Promise(r => setTimeout(r, 5));
    assert.ok(/Cannot read the game/.test(window.document.getElementById('msg').textContent),
      'it says so: ' + window.document.getElementById('msg').textContent);
    window.document.getElementById('pw').value = 'anything';
    window.document.getElementById('set').onclick();
    assert.strictEqual(window.localStorage.getItem('pg_gm_local'), null, 'and it writes nothing');
    dom.window.close();
  });

  finish();
})();
