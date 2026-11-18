// A 401 has two very different meanings, and the game used to show the same card for both.
//
//   X-Session: none    the request carried no session token at all. In an embedded preview this is
//                      what a browser that drops third-party cookies sends - so signing in again (or
//                      registering a new account) landed on "signed in on another device" and could
//                      never get past it.
//   X-Session: ended   a token was sent and it is not a live session: another sign-in replaced it,
//                      it expired, or the account is gone.
//
// This suite pins the API contract, the dev server's iframe bridge (on by default, v307) and the copy
// the client picks for each case.
//   node tools/tests/session_lost_sim.js
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert');

const root = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dev = fs.readFileSync(path.join(root, 'tools', 'dev_server.js'), 'utf8');

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
const ta = async (n, fn) => { try { await fn(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
const PW = 'SyntheticPreview123!';

(async () => {
  console.log('Session loss: no cookie vs another sign-in, and the preview cookie bridge\n');

  // ---------------------------------------------------------------- the client -----
  t('the client reads the X-Session reason off a 401', () => {
    assert(/headers\.get\('x-session'\)/.test(src), 'cloudFetch must read x-session');
    assert(/cloudSessionReplaced\(\(res\.headers/.test(src), 'the reason must reach cloudSessionReplaced');
  });
  t('a credential-less 401 no longer blames another device', () => {
    assert(src.includes('This tab lost its sign-in'), 'the truthful card is missing');
    assert(/if\(why==='none'\)/.test(src), 'cloudSessionReplaced must branch on why');
    assert(/cloudReplacedWhy=why/.test(src), 'the reason must be kept with the flag');
  });
  t('the takeover card is still there for a real replacement', () => {
    assert(src.includes('Signed in on another device'), 'the takeover copy was removed');
    assert(/cloudReplaced=true;cloudReplacedWhy=why/.test(src), 'cloudReplaced stays the single latch');
  });
  t('the dev server turns the iframe bridge on by default', () => {
    assert(/const previewAuth = !process\.argv\.includes\('--no-preview-auth'\)/.test(dev),
      'previewAuth must default to on, with --no-preview-auth as the opt-out');
    assert(dev.includes('X-Preview-Session'), 'the header bridge itself is missing');
  });

  // ----------------------------------------------------------------- the API ------
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-session-'));
  const { start } = await import('../../tools/dev_server.js');
  const srv = await start({
    port: 0, host: '127.0.0.1', site: path.join(root, 'dist'),
    dbFile: path.join(tmp, 'db.sqlite'), previewAuth: true, gmAll: false,
  });
  const base = 'http://127.0.0.1:' + srv.port;
  const post = (p, body, headers) => fetch(base + p, {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: JSON.stringify(body),
  });
  const cookieOf = res => {
    const raw = res.headers.get('set-cookie') || '';
    const m = /pg_session=([^;]+)/.exec(raw);
    return m ? m[1] : null;
  };
  try {
    const u = 'sess' + Date.now().toString(36);
    await ta('register + login give a session token', async () => {
      assert.equal((await post('/api/register', { u, p: PW, email: u + '@example.test' })).status, 201);
      const r = await post('/api/sessions', { u, p: PW });
      assert.equal(r.status, 200);
      assert.ok(cookieOf(r), 'no session cookie on the login');
    });

    // Two logins in a row: the second replaces the first, which is the real "signed in somewhere
    // else" shape. (fetch here keeps no cookie jar, so each token has to be carried by hand.)
    const older = cookieOf(await post('/api/sessions', { u, p: PW }));
    const newer = cookieOf(await post('/api/sessions', { u, p: PW }));
    assert.ok(older && newer && older !== newer, 'two logins must mint two tokens');

    await ta('no credentials at all -> 401 X-Session: none', async () => {
      const r = await fetch(base + '/api/me');
      assert.equal(r.status, 401);
      assert.equal(r.headers.get('x-session'), 'none');
    });

    await ta('a replaced token -> 401 X-Session: ended', async () => {
      const r = await fetch(base + '/api/me', { headers: { cookie: 'pg_session=' + older } });
      assert.equal(r.status, 401);
      assert.equal(r.headers.get('x-session'), 'ended', 'a dead token was reported as no credential');
    });

    await ta('the newest token still works', async () => {
      const r = await fetch(base + '/api/me', { headers: { cookie: 'pg_session=' + newer } });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).u, u);
    });

    await ta('the bridge signs a cookie-less request from its header (the iframe fix)', async () => {
      const r = await fetch(base + '/api/me', { headers: { 'X-Preview-Session': newer } });
      assert.equal(r.status, 200, 'a cookie-less preview request must still be signed in');
      assert.equal((await r.json()).u, u);
    });

    await ta('the bridge never invents a session', async () => {
      const r = await fetch(base + '/api/me', { headers: { 'X-Preview-Session': 'x'.repeat(64) } });
      assert.equal(r.status, 401, 'a junk token must not sign anyone in');
      // Presented-but-dead is 'ended', not 'none': the client keeps telling the player their sign-in
      // is no longer valid rather than pretending the browser never had one.
      assert.equal(r.headers.get('x-session'), 'ended');
    });
  } finally {
    await srv.close();
    srv.sqlite.close(); // Windows cannot remove the test database while this owned handle is open.
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('\nsession loss: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
