// The preview server the owner is handed: every route answers 200 DIRECTLY (a proxy in front
// of it drops 302s and the owner gets a blank page), and a page served from a route name can
// still load the side files that sit next to it in tools/ (the browser asks for those at the
// repo root - that 404 is what made the review page boot empty).
//   node tools/tests/preview_server_sim.js
//
// This one starts the real server on a spare port and talks HTTP to it, then kills it.
const { spawn } = require('child_process'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8800 + Math.floor(Math.random() * 150);
const BASE = 'http://127.0.0.1:' + PORT;

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
};
console.log('preview server: direct 200s, and every page can load its own side files  [tools/preview_server.py]\n');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// one fetch helper: the tests below are sync, so responses are collected first
const seen = {};
async function grab(route) {
  const res = await fetch(BASE + route, { redirect: 'follow' });
  const body = await res.text();
  seen[route] = { status: res.status, redirected: res.redirected, url: res.url,
    ctype: res.headers.get('content-type') || '', cache: res.headers.get('cache-control') || '', body };
}

(async () => {
  const child = spawn('python3', [path.join('tools', 'preview_server.py'), String(PORT)],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', d => { err += d; });

  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await sleep(150);
    try { const r = await fetch(BASE + '/'); up = r.status === 200; } catch (e) { /* not yet */ }
  }

  try {
    assert.ok(up, 'server never came up on port ' + PORT + (err ? ' - ' + err.trim() : ''));

    for (const r of ['/', '/review', '/standalone', '/picker', '/weapon_review_data.js',
                     '/sprite_picker_data.js', '/sprite_picker_defaults.js',
                     '/assets/sprite_pack_data.js', '/tools/weapon_bake.py']) await grab(r);

    t('every route answers 200 directly, with no redirect anywhere', () => {
      for (const [route, r] of Object.entries(seen)) {
        assert.strictEqual(r.status, 200, route + ' -> ' + r.status);
        assert.strictEqual(r.redirected, false, route + ' was redirected');
        assert.ok(/no-store/.test(r.cache), route + ' is cacheable: ' + r.cache);
      }
    });

    t('/ serves the weapon review page itself', () => {
      assert.ok(/Copy my adjustments/.test(seen['/'].body), 'no export button on /');
    });

    t('/review is the same page as /', () => {
      assert.strictEqual(seen['/review'].body, seen['/'].body, '/review differs from /');
    });

    t('/standalone is one self-contained file (no request of its own)', () => {
      const b = seen['/standalone'].body;
      assert.ok(/window\.WEAPON_REVIEW/.test(b), 'standalone has no data inlined');
      assert.ok(!/<script[^>]+src=|<link[^>]+href=/i.test(b), 'standalone pulls a side file');
    });

    t('/picker serves the pose + head picker', () => {
      assert.ok(/sprite_picker_data\.js/.test(seen['/picker'].body), 'picker page not served');
    });

    // the regression that broke the owner's preview: the page is served from a route name, so
    // the browser asks for its data file at the ROOT - the server must still find it in tools/
    t('the review page can fetch the data file it asks for at the root', () => {
      assert.strictEqual(seen['/weapon_review_data.js'].status, 200);
      assert.ok(/window\.WEAPON_REVIEW/.test(seen['/weapon_review_data.js'].body), 'data file empty');
      assert.ok(/javascript/.test(seen['/weapon_review_data.js'].ctype), 'wrong content type');
    });

    t('the picker can fetch BOTH data files it asks for at the root', () => {
      assert.strictEqual(seen['/sprite_picker_data.js'].status, 200);
      assert.strictEqual(seen['/sprite_picker_defaults.js'].status, 200);
      assert.ok(seen['/sprite_picker_defaults.js'].body.length > 100, 'defaults file empty');
    });

    t('the pack the picker loads from ../assets/ still resolves', () => {
      assert.strictEqual(seen['/assets/sprite_pack_data.js'].status, 200);
    });

    t('repo paths outside the routes keep working (/tools/...)', () => {
      assert.strictEqual(seen['/tools/weapon_bake.py'].status, 200);
      assert.ok(/weapon_bake|"""|#!/.test(seen['/tools/weapon_bake.py'].body), 'wrong file at /tools/');
    });

    t('the server never hands out 404s for the files the pages need', () => {
      const missing = ['/weapon_review_data.js', '/sprite_picker_data.js', '/sprite_picker_defaults.js']
        .filter(r => seen[r].status !== 200);
      assert.deepStrictEqual(missing, [], 'still 404: ' + missing.join(', '));
    });
  } finally {
    child.kill('SIGTERM');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
