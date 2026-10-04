// The preview server the owner is handed: every route answers 200 DIRECTLY (a proxy in front
// of it drops 302s and the owner gets a blank page), and a page served from a route name can
// still load the side files that sit next to it in tools/ (the browser asks for those at the
// repo root - that 404 is what made the review page boot empty).
//   node tools/tests/preview_server_sim.js
//
// This one starts the real server on a spare port and talks HTTP to it, then kills it.
const { spawn } = require('child_process'), path = require('path'), net = require('net'), assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8800 + Math.floor(Math.random() * 150);
const BASE = 'http://127.0.0.1:' + PORT;

let pass = 0, fail = 0;
const settle = (name, e) => {
  if (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
  else { console.log('  ok   ' + name); pass++; }
};
const t = (name, fn) => {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') throw new Error('async check passed to t() - use ta()');
    settle(name);
  } catch (e) { settle(name, e); }
};
const ta = async (name, fn) => { try { await fn(); settle(name); } catch (e) { settle(name, e); } };
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

    for (const r of ['/', '/review', '/standalone', '/picker', '/picks', '/game', '/weapon_review_data.js',
                     '/sprite_picker_data.js', '/sprite_picker_defaults.js',
                     '/anim_picker_data.js', '/assets/sprite_pack_data.js', '/tools/weapon_bake.py']) await grab(r);

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

    // the pages are megabytes; a visitor who stops the download halfway is normal traffic
    // (a closed tab does exactly this: ask, read a little, drop the connection).  A raw TCP
    // socket, so the server really gets a reset mid-write and not a polite end of stream.
    await ta('a download cut off halfway does not crash the server or print a traceback', async () => {
      const got = await new Promise(resolve => {
        const sock = net.connect(PORT, '127.0.0.1', () => {
          sock.write('GET /weapon_review_data.js HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
        });
        let n = 0;
        sock.on('data', d => { n += d.length; if (n > 2000) { sock.destroy(); resolve(n); } });
        sock.on('error', () => resolve(n));
        setTimeout(() => { sock.destroy(); resolve(n); }, 3000);
      });
      assert.ok(got > 0, 'never read a byte before the cut-off');
      await sleep(800);
      const after = await fetch(BASE + '/');
      assert.strictEqual(after.status, 200, 'server stopped answering: ' + after.status);
      assert.ok(!/Traceback/.test(err), 'a cut-off download printed a traceback');
    });

    t('/picks serves the SIMPLE picker (attack 2 / walk 3), directly and complete', () => {
      const r = seen['/picks'];
      assert.ok(r, '/picks was not fetched');
      assert.strictEqual(r.status, 200, '/picks -> ' + r.status);
      assert.ok(!r.redirected && r.url === BASE + '/picks', '/picks must not redirect (got ' + r.url + ')');
      assert.ok(/anim_picker_data\.js/.test(r.body), 'the page must load its own data file');
      assert.ok(/__apTest/.test(r.body), 'the page must be the animation picker');
      assert.ok(/attack 2 frames/i.test(r.body), 'the page must say what the set is');
    });

    t('/game serves the game itself (index.html), directly', () => {
      const r = seen['/game'];
      assert.ok(r, '/game was not fetched');
      assert.strictEqual(r.status, 200, '/game -> ' + r.status);
      assert.ok(!r.redirected && r.url === BASE + '/game', '/game must not redirect (got ' + r.url + ')');
      assert.ok(/id="buildTag"/.test(r.body), 'that must be the game (its login card has the build tag)');
      assert.ok(/anim_pack_data\.js/.test(r.body), 'the game must load the SIMPLE set artifact');
    });

    t('/anim_picker_data.js and /sprite_picker_data.js resolve from the root (the page asks there)', () => {
      for (const f of ['anim_picker_data.js', 'sprite_picker_data.js']) {
        const r = seen['/' + f];
        if (!r) continue;
        assert.strictEqual(r.status, 200, f + ' -> ' + r.status);
      }
    });
  } finally {
    child.kill('SIGTERM');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
