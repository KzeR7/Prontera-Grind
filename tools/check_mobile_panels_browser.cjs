// Real-browser phone layout check for the two v324 mobile panel fixes, against a
// disposable local dev server ONLY (same contract as check_recovery_browser.cjs):
//   1. the World Atlas map panel fits the phone width - no sideways scrolling;
//   2. the Social Hub card scrolls to its Enter button with real touch gestures.
// Requires playwright-core, @sparticuz/chromium and three, as in the other browser checks:
//   npm install --no-save --package-lock=false jsdom three@0.128.0 ws miniflare@4.20260730.0 playwright-core @sparticuz/chromium
//   bash tools/build_site.sh && HOST=127.0.0.1 node tools/dev_server.js --port 8795
//   node tools/check_mobile_panels_browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const base = new URL(process.env.MOBILE_PANELS_TEST_URL || 'http://127.0.0.1:8795');
if (!['127.0.0.1','localhost','[::1]'].includes(base.hostname) || !['http:','https:'].includes(base.protocol) || base.username || base.password)
  throw new Error('Mobile panel browser tests may only use a disposable loopback server.');

(async () => {
  const mod = require('@sparticuz/chromium'), bundled = mod.default || mod;
  const pkg = path.resolve(path.dirname(require.resolve('@sparticuz/chromium')), '..');
  const lib = await mod.inflate(path.join(pkg, 'bin/al2023.tar.br'));
  process.env.LD_LIBRARY_PATH = path.join(lib, 'lib') + ':' + (process.env.LD_LIBRARY_PATH || '');
  const browser = await chromium.launch({ executablePath: await bundled.executablePath(), args: [...bundled.args, '--enable-unsafe-swiftshader'], headless: true });
  const W = Number(process.env.W || 360), H = Number(process.env.H || 800);
  const errors = [];
  try {
    const ctx = await browser.newContext({
      viewport: { width: W, height: H }, hasTouch: true, isMobile: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(45000);
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', r => r.fulfill({
      contentType: 'application/javascript', body: fs.readFileSync(require.resolve('three/build/three.min.js')),
    }));
    const u = 'mobpanel' + Date.now().toString(36), p = 'SyntheticPreview123!';
    const reg = await ctx.request.post(base.origin + '/api/register', { data: { u, p, email: u + '@example.test' } });
    assert.equal(reg.status(), 201, 'create disposable account');
    await page.goto(base.origin + '/?phone=1', { waitUntil: 'domcontentloaded' });
    for (let i = 0; i < 30; i++) { if (await page.evaluate(() => !!(window.CLOUD && CLOUD.api === true)).catch(() => false)) break; await page.waitForTimeout(1000); }
    await page.fill('#username', u);
    await page.fill('#password', p);
    await page.click('#loginForm button[type=submit]');
    for (let i = 0; i < 30; i++) { if (await page.evaluate(() => { try { return S != null } catch { return false } }).catch(() => false)) break; await page.waitForTimeout(1000); }
    assert.equal(await page.evaluate(() => { try { return S != null } catch { return false } }), true, 'signed in');
    await page.evaluate(() => {
      const l = document.getElementById('loginOverlay'); if (l) l.style.display = 'none';
      const m = document.getElementById('modal'); if (m) m.style.display = 'none';
      S.handbook = { done: true }; tabs.splice(0); renderWin();
    });
    const cdp = await ctx.newCDPSession(page);
    const swipe = async (x0, y0, x1, y1) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
      for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 10, y: y0 + (y1 - y0) * i / 10 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(350);
    };

    // ---- 1. World Atlas: the map panel fits the phone width ----
    await page.evaluate(() => { openTab('map'); mapSeason = 'atlas'; renderWin(); });
    await page.waitForTimeout(800);
    const atlas = await page.evaluate(() => {
      const panel = document.getElementById('map-panel-atlas');
      const hero = document.querySelector('.eclipse-atlas-hero.rm-illustrated-hero');
      const wb = document.querySelector('#wins .wbody');
      const hb = hero.getBoundingClientRect();
      return {
        panelOverflow: panel.scrollWidth - panel.clientWidth,
        wbodyOverflow: wb.scrollWidth - wb.clientWidth,
        heroRight: Math.round(hb.right), heroLeft: Math.round(hb.left), heroW: Math.round(hb.width),
        inner: innerWidth,
      };
    });
    assert(atlas.panelOverflow <= 1, 'map panel never scrolls sideways (panel ' + atlas.panelOverflow + 'px over)');
    assert(atlas.wbodyOverflow <= 1, 'the window body never scrolls sideways (wbody ' + atlas.wbodyOverflow + 'px over)');
    assert(atlas.heroLeft >= 0 && atlas.heroRight <= atlas.inner + 1, 'the 16:9 map hero fits the screen: ' + JSON.stringify(atlas));
    await page.screenshot({ path: '/tmp/mobile-panels-atlas.png' });

    // ---- 2. Social Hub: the cut-off card scrolls to its Enter button ----
    await page.evaluate(() => { mapSeason = 'social'; renderWin(); });
    await page.waitForTimeout(800);
    const social = await page.evaluate(() => {
      const sp = document.querySelector('.social-panel');
      return { scrollH: sp.scrollHeight, clientH: sp.clientHeight, scrollTop: sp.scrollTop };
    });
    assert(social.scrollH > social.clientH + 1, 'on a phone the Fountain Plaza card overflows its panel (' + social.scrollH + '>' + social.clientH + ')');
    assert.equal(social.scrollTop, 0, 'starts at the top');
    let reached = false;
    for (let i = 0; i < 10 && !reached; i++) {
      await swipe(Math.round(W / 2), Math.round(H * 0.65), Math.round(W / 2), Math.round(H * 0.32));
      reached = await page.evaluate(() => {
        const sp = document.querySelector('.social-panel');
        const r = document.querySelector('.social-cta button').getBoundingClientRect();
        return sp.scrollTop > 0 && r.top >= 0 && r.bottom <= innerHeight;
      });
    }
    assert(reached, 'touch scrolling carries the description to the Enter Fountain Plaza button');
    await page.screenshot({ path: '/tmp/mobile-panels-social.png' });

    // ---- 3. Endless Echo wrapper follows the same rule ----
    await page.evaluate(() => { mapSeason = 'echo'; renderWin(); });
    await page.waitForTimeout(500);
    const echo = await page.evaluate(() => {
      const ep = document.querySelector('.echo-panel');
      const cs = getComputedStyle(ep);
      return { maxH: cs.maxHeight, overflowY: cs.overflowY, wbodyH: document.querySelector('#wins .wbody').clientHeight };
    });
    assert.notEqual(echo.maxH, 'none', 'the Echo wrapper is height-capped');
    assert.equal(echo.overflowY, 'auto', 'the Echo wrapper scrolls');
    assert.deepEqual(errors, [], 'no page errors');
    console.log('PASS mobile panels: World Atlas fits ' + W + 'px with no sideways scroll, the Fountain Plaza card touch-scrolls to its Enter button, the Echo wrapper is a real scroller', JSON.stringify({ atlas, social, echo }));
  } finally {
    await browser.close();
  }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
