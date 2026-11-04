// Phone layout: the phone-only stylesheet must not leak into the desk layout, the
// layout decision must follow the device (not the window), and the three phone
// controls must do what their labels say.
//   node tools/tests/mobile_layout_sim.js
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('mobile layout: skipped (npm i --no-save jsdom three@0.128.0)'); process.exit(0);
}
const ROOT = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets/ui/mobile.css'), 'utf8');
const mobileJs = fs.readFileSync(path.join(ROOT, 'assets/ui/mobile.js'), 'utf8');
const socialJs = fs.readFileSync(path.join(ROOT, 'assets/social.js'), 'utf8');

let pass = 0, fail = 0, pending = Promise.resolve();
const test = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + (e && e.message)); fail++; }
};
// A couple of the page checks wait for a MutationObserver, which jsdom delivers
// on the microtask queue; those run in order before the summary is printed.
const testAsync = (name, fn) => {
  pending = pending.then(async () => {
    try { await fn(); console.log('  ok   ' + name); pass++; }
    catch (e) { console.log('  FAIL ' + name + ' -> ' + (e && e.message)); fail++; }
  });
};

/* ── a very small CSS reader: selector -> declarations, with the @media it sits in ── */
function closeOf(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (!depth) return i; }
  }
  return text.length;
}
function parseCss(text, media, out) {
  out = out || [];
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  while (i < clean.length) {
    const open = clean.indexOf('{', i);
    if (open < 0) break;
    const head = clean.slice(i, open).trim();
    const close = closeOf(clean, open);
    const body = clean.slice(open + 1, close);
    if (head.startsWith('@media')) parseCss(body, head.slice(6).trim(), out);
    else if (head && !head.startsWith('@')) {
      const decls = {};
      body.split(';').forEach(d => {
        const c = d.indexOf(':');
        if (c > 0) decls[d.slice(0, c).trim()] = d.slice(c + 1).trim();
      });
      out.push({ media: media || '', selectors: head.split(',').map(s => s.trim()), decls });
    }
    i = close + 1;
  }
  return out;
}
const rules = parseCss(css);
const declOf = (selector, prop, mediaIncludes) => {
  let value = null;
  for (const r of rules) {
    if (mediaIncludes && !r.media.includes(mediaIncludes)) continue;
    if (!mediaIncludes && r.media.includes('orientation:landscape')) continue;
    if (r.selectors.includes(selector) && prop in r.decls) value = r.decls[prop];
  }
  return value;
};

/* ── A. the stylesheet is a phone-only layer ─────────────────────────────── */
test('mobile.css loads after eclipse.css, so its phone rules are the last word', () => {
  const link = html.indexOf('assets/ui/mobile.css');
  assert.ok(link > 0, 'index.html links assets/ui/mobile.css');
  assert.ok(link > html.indexOf('assets/ui/eclipse.css'), 'it must come after eclipse.css');
});

test('every rule in mobile.css is scoped to html.pg-mobile except the four phone-only controls', () => {
  // Only the elements this change introduces may sit outside the phone scope:
  // the four phone-only controls and the Display sheet's own new chrome.
  const base = new Set(['#fsBtn', '#pgFocusBtn', '#pgQuests', '#pgScrim', '#pgScrim[hidden]', '#pgQuests[hidden]']);
  const introduced = /^#screenOptions \.(pg-sheet-head|pg-actions|pg-note|pg-link)([\s:[.]|$)/;
  const leaked = [];
  for (const r of rules) for (const s of r.selectors) {
    if (s.startsWith('html.pg-mobile')) continue;
    if (base.has(s)) continue;
    if (introduced.test(s)) continue;                 // new display-sheet chrome only
    leaked.push(s);
  }
  assert.deepEqual(leaked, [], 'a desk browser must not match one byte of this file');
});

test('the phone-only controls do not exist on the desk layout', () => {
  for (const id of ['fsBtn', 'pgFocusBtn', 'pgQuests', 'pgScrim']) {
    assert.ok(html.includes(`id="${id}"`), `${id} is in index.html`);
  }
  assert.equal(declOf('#fsBtn', 'display'), 'none');
  assert.equal(declOf('#pgQuests', 'display'), 'none');
  assert.equal(declOf('#pgScrim', 'display'), 'none');
});

/* ── B. the shell numbers agree with each other ──────────────────────────── */
test('the floating layer sits above the dock from the first frame', () => {
  assert.equal(declOf('html.pg-mobile', '--pg-dockh'), '52px');
  assert.equal(declOf('html.pg-mobile', '--docktop'), 'calc(var(--pg-dockh) + var(--pg-dockgap) + 6px)');
  assert.equal(declOf('html.pg-mobile #dock', 'height'), 'var(--pg-dockh)');
  assert.equal(declOf('html.pg-mobile #wins', 'bottom'), 'var(--docktop)');
  assert.match(declOf('html.pg-mobile #feedWrap', 'bottom'), /var\(--docktop\)/);
  assert.match(declOf('html.pg-mobile #sideRail', 'bottom'), /var\(--docktop\)/);
});

test('the quest chip lives in the right rail, clear of the world chat', () => {
  // The bottom-left corner is the chat (the game's own log lives in it), so the
  // chip sits under Mail and Daily instead of on top of the chat's tabs.
  assert.equal(declOf('html.pg-mobile #pgQuests', 'left'), 'auto');
  assert.match(declOf('html.pg-mobile #pgQuests', 'right'), /--pg-safe-r/);
  assert.match(declOf('html.pg-mobile #pgQuests', 'top'), /42px/, 'just under the 42px Mail / Daily / Social buttons');
  assert.equal(declOf('html.pg-mobile #pgQuests', 'bottom'), 'auto');
  // Landscape keeps the same corner with the smaller 38px tools.
  assert.match(css, /@media \(orientation:landscape\) and \(max-height:560px\)[\s\S]*#pgQuests\{height:24px;top:calc\(4px \+ 38px \+ 6px\)/, 'landscape keeps the chip off the chat');
});

test('the player card clears the header and the combat pill clears the player card', () => {
  // #hud is a child of #wrap, so it must add the header height itself...
  assert.match(declOf('html.pg-mobile #hud', 'top'), /var\(--pg-header\)/);
  // ...while #eclipseCombat lives inside #view, which already starts under the header.
  const combatTop = declOf('html.pg-mobile #eclipseCombat', 'top');
  assert.equal(combatTop, 'calc(var(--pg-hud-top) + var(--pg-hud-h) + 6px)');
  assert.ok(!combatTop.includes('--pg-header'), 'adding the header twice is what overlapped the two cards');
  // The card is a fixed box, so the pill's offset is exact and a growing name or
  // level cannot push the card down into it (this was the v74 phone overlap).
  assert.equal(declOf('html.pg-mobile #hud', 'height'), 'var(--pg-hud-h)');
  assert.equal(declOf('html.pg-mobile', '--pg-hud-h'), '54px');
  assert.equal(declOf('html.pg-mobile #hud', 'overflow'), 'hidden');
  // The card's rows are fixed too: 13 + 11 + 11 + two 2px gaps + 10 padding + 4 border = 51 <= 54.
  const rows = ['#eclipsePlayerName:13', '#hud .eclipse-levels:11', '#hud .hud-health:11'];
  for (const row of rows) {
    const [sel, px] = row.split(':');
    assert.match(declOf('html.pg-mobile ' + sel, 'line-height') || declOf('html.pg-mobile ' + sel, 'height') || '', new RegExp('^' + px + 'px$'), row);
  }
  assert.equal(declOf('html.pg-mobile #hud .hud-health', 'height'), '11px');
});

test('the landscape block shrinks the chrome instead of the field', () => {
  const m = 'orientation:landscape';
  assert.equal(declOf('html.pg-mobile', '--pg-header', m), '30px');
  assert.equal(declOf('html.pg-mobile', '--pg-dockh', m), '44px');
  assert.equal(declOf('html.pg-mobile', '--pg-xp', m), '22px');
  assert.equal(declOf('html.pg-mobile #feedWrap', 'display', m), 'none!important');
});

test('the quest tracker is a sheet, not a second column of the field', () => {
  assert.equal(declOf('html.pg-mobile #sideRail', 'display'), 'none!important', 'closed until it is asked for');
  assert.equal(declOf('html.pg-mobile #sideRail.pg-open', 'display'), 'flex!important', 'the chip opens it');
  assert.equal(declOf('html.pg-mobile #sideRail.pg-more', 'display'), 'flex!important', 'the More menu lives in it');
  assert.equal(declOf('html.pg-mobile #sideRail', 'pointer-events'), 'none',
    'the closed rail is a backdrop and must not swallow taps on the field');
  assert.equal(declOf('html.pg-mobile #sideRail.pg-more', 'pointer-events'), null,
    'the More case keeps that backdrop behaviour; only the menu itself takes taps');
  assert.ok(/html\.pg-mobile #pgScrim\b/.test(css), 'a scrim closes the sheet on a tap outside');
  assert.equal(rules.filter(r => r.selectors.some(x => x.includes(':has('))).length, 0,
    'the layout must not depend on :has() support');
});

/* ── C. the module is loaded early and parses ────────────────────────────── */
test('mobile.js runs before the game paints, so the class cannot flash', () => {
  const js = html.indexOf('assets/ui/mobile.js');
  assert.ok(js > 0, 'index.html loads assets/ui/mobile.js');
  assert.ok(js < html.indexOf('id="loginOverlay"'), 'it is loaded in <head>, before the login card is parsed');
  new Function(mobileJs);
});

/* ── D. detection and the three controls, on a bare document ─────────────── */
const PALETTE = '<html><head></head><body><button id="fsBtn"></button><button id="pgFocusBtn"></button>' +
  '<button id="pgQuests"></button><div id="pgScrim" hidden></div>' +
  '<nav id="sideMenu"></nav><div id="sideRail"></div><div id="dock"></div><div id="screenOptions" hidden></div>' +
  '<div id="screenBtn"></div></body></html>';

function boot(opts = {}) {
  const dom = new JSDOM(PALETTE, { url: opts.url || 'http://localhost/', runScripts: 'outside-only' });
  const w = dom.window;
  Object.defineProperty(w, 'innerWidth', { value: opts.w || 390, configurable: true });
  Object.defineProperty(w, 'innerHeight', { value: opts.h || 844, configurable: true });
  Object.defineProperty(w.navigator, 'maxTouchPoints', { value: opts.touch ? 5 : 0, configurable: true });
  w.matchMedia = q => ({ matches: !!opts.coarse && q.includes('coarse'), media: q, addEventListener() {}, addListener() {} });
  w.setInterval = () => 0;            // the claim reminder must not hold the test open
  if (opts.store) for (const k of Object.keys(opts.store)) w.localStorage.setItem(k, opts.store[k]);
  w.eval(mobileJs);
  // jsdom finishes parsing asynchronously, so the module's DOMContentLoaded hook
  // has not fired yet; the guard inside mobile.js makes this safe to send twice.
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return w;
}
const has = (w, c) => w.document.documentElement.classList.contains(c);

test('a phone gets the phone layout, a desktop does not', () => {
  const phone = boot({ w: 390, h: 844, touch: true, coarse: true });
  assert.ok(has(phone, 'pg-mobile'), '390x844 touch device runs the phone layout');
  const desk = boot({ w: 1440, h: 900 });
  assert.ok(!has(desk, 'pg-mobile'), 'a desk browser keeps the desk layout');
  const narrowDesk = boot({ w: 620, h: 900 });          // mouse, narrow window
  assert.ok(!has(narrowDesk, 'pg-mobile'), 'a narrow desktop window is not a phone');
  const tablet = boot({ w: 820, h: 1180, touch: true, coarse: true });
  assert.ok(has(tablet, 'pg-mobile'), 'a tablet short side of 820 is covered');
});

test('?phone=1 and ?phone=0 force the layout for one visit', () => {
  assert.ok(has(boot({ url: 'http://localhost/?phone=1', w: 1440, h: 900 }), 'pg-mobile'));
  assert.ok(!has(boot({ url: 'http://localhost/?phone=0', w: 390, h: 844, touch: true, coarse: true }), 'pg-mobile'));
});

test('the Display choice (Auto / Phone / Desk) persists per device', () => {
  const w = boot({ w: 1440, h: 900 });
  assert.equal(w.PGMobile.getPhoneLayout(), 'auto');
  w.PGMobile.setPhoneLayout('on');
  assert.ok(has(w, 'pg-mobile'), 'Phone forces the phone layout on any screen');
  assert.equal(w.localStorage.getItem('pg_phone_layout'), 'on');
  const again = boot({ w: 1440, h: 900, store: { pg_phone_layout: 'on' } });
  assert.ok(has(again, 'pg-mobile'), 'the choice survived the reload');
  again.PGMobile.setPhoneLayout('off');
  assert.ok(!has(again, 'pg-mobile'));
  assert.equal(again.localStorage.getItem('pg_phone_layout'), 'off');
});

test('Field only hides the field panels, is remembered, and stays a device preference', () => {
  const w = boot({ w: 390, h: 844, touch: true, coarse: true });
  assert.ok(!has(w, 'pg-focus'));
  w.PGMobile.toggleFieldOnly();
  assert.ok(has(w, 'pg-focus'));
  assert.equal(w.localStorage.getItem('pg_field_only'), '1');
  assert.equal(w.document.getElementById('pgFocusBtn').getAttribute('aria-pressed'), 'true');
  const remembered = boot({ w: 390, h: 844, touch: true, coarse: true, store: { pg_field_only: '1' } });
  assert.ok(has(remembered, 'pg-focus'), 'the mode came back after a reload');
  w.PGMobile.toggleFieldOnly();
  assert.ok(!has(w, 'pg-focus'));
  assert.equal(w.localStorage.getItem('pg_field_only'), '0');
});

test('fullscreen asks the document for real fullscreen and reports the state', () => {
  const w = boot({ w: 390, h: 844, touch: true, coarse: true });
  let asked = null;
  w.HTMLElement.prototype.requestFullscreen = function () { asked = this; return Promise.resolve(); };
  w.document.getElementById('fsBtn').click();
  assert.equal(asked, w.document.documentElement, 'the page itself goes fullscreen');
  assert.equal(w.document.getElementById('fsBtn').getAttribute('aria-pressed'), 'false',
    'not pressed until the browser confirms it');
});

test('v274: fullscreen maximizes the portrait view and never asks the platform to rotate', () => {
  // Owner: "remove the forced horizontal, it should just be vertical". The button used to
  // call screen.orientation.lock('landscape') on every press, so a handset held upright was
  // turned on its side by the game itself.
  const w = boot({ w: 390, h: 844, touch: true, coarse: true });
  const locked = [];
  w.screen.orientation = { lock: (o) => { locked.push(o); return Promise.resolve(); } };
  w.HTMLElement.prototype.requestFullscreen = function () { return Promise.resolve(); };
  w.document.getElementById('fsBtn').click();
  assert.deepEqual(locked, [], 'no orientation lock is requested');
  assert.doesNotMatch(fs.readFileSync('assets/ui/mobile.js', 'utf8'), /orientation\.lock/,
    'and the lock helper is gone, so nothing can reintroduce it quietly');
  // The tooltip is written in two places; both must stop promising landscape.
  assert.doesNotMatch(fs.readFileSync('assets/ui/mobile.js', 'utf8'), /landscape on a phone/);
  assert.doesNotMatch(fs.readFileSync('index.html', 'utf8'), /fullscreen \(landscape on a phone\)/i);
  assert.match(w.document.getElementById('fsBtn').title, /fullscreen/i);
});

test('v274: the pet preview strip is gone on a phone, the speed button still works', () => {
  const css = fs.readFileSync('assets/ui/mobile.css', 'utf8');
  assert.match(css, /html\.pg-mobile #eclipsePetStrip\{display:none\}/, 'the pet art is dropped on a phone');
  // The container hides itself (an ordinary account has nothing left in it) but the GM speed
  // control opts back in, so a GM phone build keeps Speed x2 / x4.
  assert.match(css, /html\.pg-mobile #eclipseCompanions\{[^}]*visibility:hidden/);
  assert.match(css, /html\.pg-mobile #eclipseCompanions>#spd\{visibility:visible/);
  // The real page still carries both: the strip is hidden by CSS, not deleted, so a desk
  // layout and the Pets panel keep their markup.
  const page = fs.readFileSync('index.html', 'utf8');
  assert.match(page, /<div id="eclipseCompanions"><div id="eclipsePetStrip"><\/div>/);
  assert.match(page, /<button id="spd" hidden>Speed x1<\/button>/, 'and the speed control is still in the page');
});

test('v274: a closed sheet is not left covering the field when a panel opens', () => {
  // The old `.with-panels{display:none!important}` rule came AFTER `.pg-open` in the stylesheet
  // and beat it at equal specificity: the sheet opened on top of a live scrim that took every
  // tap, and the player could not get back to the field.
  const css = fs.readFileSync('assets/ui/mobile.css', 'utf8');
  assert.match(css, /html\.pg-mobile #sideRail\.with-panels:not\(\.pg-open\)\{display:none!important\}/,
    'the panel rule only applies while the sheet is closed');
  const w = boot({ w: 390, h: 844, touch: true, coarse: true });
  const d = w.document, chip = d.getElementById('pgQuests'), scrim = d.getElementById('pgScrim'), rail = d.getElementById('sideRail');
  chip.click();
  assert.ok(rail.classList.contains('pg-open'));
  assert.equal(scrim.hidden, false);
  // The chip is the sheet's only visible close control, so it has to sit above the scrim.
  const z = n => Number((css.match(new RegExp('html\\.pg-mobile #' + n + '\\{[^}]*z-index:(\\d+)')) || [])[1]);
  assert.ok(z('pgQuests') > z('pgScrim'), 'the chip is above its own scrim');
  assert.ok(z('pgQuests') > 50, 'and above the panel windows, so it is never buried');
  chip.click();
  assert.ok(!rail.classList.contains('pg-open'));
  assert.equal(scrim.hidden, true, 'closing returns the field');
});

test('the quest chip opens the sheet and a tab, a scrim tap or Escape closes it', () => {
  const w = boot({ w: 390, h: 844, touch: true, coarse: true });
  const d = w.document, chip = d.getElementById('pgQuests'), scrim = d.getElementById('pgScrim'), rail = d.getElementById('sideRail');
  chip.click();
  assert.ok(has(w, 'pg-rail-open'));
  assert.ok(rail.classList.contains('pg-open'));
  assert.equal(scrim.hidden, false);
  assert.equal(chip.getAttribute('aria-expanded'), 'true');
  scrim.click();
  assert.ok(!has(w, 'pg-rail-open'));
  assert.ok(!rail.classList.contains('pg-open'));
  assert.equal(scrim.hidden, true);
  chip.click();
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.ok(!has(w, 'pg-rail-open'), 'Escape closes the sheet first');
  chip.click();
  d.getElementById('dock').innerHTML = '<button data-t="map"></button>';
  d.querySelector('#dock [data-t]').click();
  assert.ok(!has(w, 'pg-rail-open'), 'choosing a tab closes the sheet so the panel is visible');
});

/* ── E. the real page: the Display panel drives the module ───────────────── */
let game = null;
try {
  const { createGame } = require('./helpers/game');
  game = createGame(html);
} catch (e) {
  console.log('  note: real-page checks need jsdom + three (' + e.message + ')');
}

if (game) {
  const w = game.window, d = w.document, ev = game.ev;
  Object.defineProperty(w, 'innerWidth', { value: 390, configurable: true });
  Object.defineProperty(w, 'innerHeight', { value: 844, configurable: true });
  Object.defineProperty(w.navigator, 'maxTouchPoints', { value: 5, configurable: true });
  w.matchMedia = q => ({ matches: q.includes('coarse'), media: q, addEventListener() {}, addListener() {} });
  w.eval(mobileJs);
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.PGMobile.apply();

  test('the game page gets the phone class and its Display panel offers the phone block', () => {
    assert.ok(d.documentElement.classList.contains('pg-mobile'));
    ev("S=fresh();S.auto=false;currentUser='phone-test'");
    d.getElementById('screenOptions').hidden = true;
    d.getElementById('screenBtn').click();
    assert.ok(d.querySelector('#screenOptions [data-pg=layout]'), 'Layout button is in the Display panel');
    assert.ok(d.querySelector('#screenOptions [data-pg=fullscreen]'), 'Fullscreen button is in the Display panel');
    assert.ok(d.querySelector('#screenOptions [data-pg=focus]'), 'Field only button is in the Display panel');
    assert.ok(d.querySelector('#screenOptions [data-pg=close]'), 'the sheet has a close button');
  });

  test('the phone-frame link is offered only where a real preview server answers', () => {
    // A static host can answer an unknown path with the game itself, so the page must not
    // decide from the status code alone: tools/dev_server.js marks /phone with a header.
    assert.match(html, /get\('X-Phone-Preview'\)==='1'/, 'the probe asks for the dev-server marker');
    assert.match(html, /pgPreviewOk\?'<a class="pg-link" id="pgPhonePreview" href="\/phone">/,
      'the link is rendered from the probe result, not unconditionally');
    assert.ok(!/id="pgPhonePreview"/.test(html.split('function pgPreviewProbe')[0]),
      'no hard-coded link before the probe runs');
    // Inside the frame itself (the preview page loads ?phone=1) the link is suppressed, so a
    // click there can never nest the game inside itself.
    assert.match(html, /if\(\/\[\?&\]phone=\/\.test\(location\.search\)\)pgPreviewOk=false/);
    assert.equal(declOf('#screenOptions .pg-link', 'display'), 'block');
    assert.equal(declOf('#screenOptions .pg-link[hidden]', 'display'), 'none');
  });

  testAsync('the phone-frame link appears only when the preview server marks /phone', async () => {
    const seen = [];
    w.fetch = url => { seen.push(String(url)); return Promise.resolve({ ok: true, headers: { get: k => String(k).toLowerCase() === 'x-phone-preview' ? '1' : null } }); };
    ev('pgPreviewOk=null');
    d.getElementById('screenOptions').hidden = true;
    d.getElementById('screenBtn').click();
    for (let i = 0; i < 4; i++) await Promise.resolve();
    const link = d.getElementById('pgPhonePreview');
    assert.ok(link, 'the panel redraws itself when the marker answers, so the link is not missing until reopened');
    assert.equal(link.getAttribute('href'), '/phone');
    assert.deepStrictEqual(seen, ['/phone'], 'one probe, not one per render');

    // A static host that answers every unknown path with the game has no marker: no link.
    w.fetch = () => Promise.resolve({ ok: true, headers: { get: () => null } });
    ev('pgPreviewOk=null');
    d.getElementById('screenOptions').hidden = true;
    d.getElementById('screenBtn').click();
    for (let i = 0; i < 4; i++) await Promise.resolve();
    assert.equal(d.getElementById('pgPhonePreview'), null, 'no marker, no link');
  });

  test('Layout cycles Auto -> Phone -> Desk and re-measures the field each time', () => {
    let flips = 0;
    const onFlip = () => flips++;
    w.addEventListener('pg-mobile-change', onFlip);
    const layoutBtn = () => d.querySelector('#screenOptions [data-pg=layout]');
    layoutBtn().click();
    assert.equal(w.PGMobile.getPhoneLayout(), 'on');
    layoutBtn().click();
    assert.equal(w.PGMobile.getPhoneLayout(), 'off');
    assert.ok(!d.documentElement.classList.contains('pg-mobile'), 'Desk removes the phone class');
    layoutBtn().click();
    assert.equal(w.PGMobile.getPhoneLayout(), 'auto');
    assert.ok(flips >= 2, 'the game is told to re-measure when the layout changes');
    w.removeEventListener('pg-mobile-change', onFlip);
  });

  test('Field only hides the log, quests, mail, buffs and the combat pill but not the bars', () => {
    const focusBtn = d.querySelector('#screenOptions [data-pg=focus]');
    focusBtn.click();
    assert.ok(d.documentElement.classList.contains('pg-focus'));
    assert.equal(w.PGMobile.fieldOnly(), true);
    // the elements themselves stay in the DOM; mobile.css hides them in this mode
    for (const id of ['feedWrap', 'minimapTools', 'pgQuests', 'hudBuffs', 'eclipseCombat', 'sideRail']) {
      assert.ok(d.getElementById(id), `${id} is still addressable`);
    }
    assert.match(css, /html\.pg-mobile\.pg-focus #feedWrap/, 'the log is hidden by the stylesheet');
    assert.match(css, /html\.pg-mobile\.pg-focus #minimapTools/, 'mail and daily are hidden by the stylesheet');
    assert.ok(!/html\.pg-mobile\.pg-focus #dock/.test(css), 'the dock stays');
    assert.ok(!/html\.pg-mobile\.pg-focus #xp-dock/.test(css), 'the EXP bar stays');
    d.querySelector('#screenOptions [data-pg=focus]').click();
    assert.ok(!d.documentElement.classList.contains('pg-focus'));
  });

  testAsync('an open panel stands the chat down instead of stacking on it', async () => {
    assert.match(mobileJs, /root\.classList\.toggle\('pg-panel', open\)/);
    assert.equal(declOf('html.pg-mobile.pg-panel #socialChat', 'display'), 'none');
    ev("S=fresh();S.auto=false;tabs.length=0;tabs.push('map');renderWin()");
    await Promise.resolve(); await Promise.resolve();
    assert.ok(d.documentElement.classList.contains('pg-panel'), 'the panel is open, so the chat steps aside');
    ev("tabs.length=0;renderWin()");
    await Promise.resolve(); await Promise.resolve();
    assert.ok(!d.documentElement.classList.contains('pg-panel'), 'closing the panel brings the chat back');
  });

  testAsync('the dock More button opens the destinations list through the rail', async () => {
    ev("S=fresh();S.auto=false;tabs.length=0;sideOpen=false;renderQ()");
    const rail = d.getElementById('sideRail');
    d.getElementById('dock').querySelector('.eclipse-more').click();
    await Promise.resolve(); await Promise.resolve();
    assert.ok(d.getElementById('sideMenu').classList.contains('eclipse-more-open'), 'the game opened its menu');
    assert.ok(rail.classList.contains('pg-more'), 'the rail mirrors that state without :has()');
    assert.ok(!rail.classList.contains('pg-open'), 'and it is not confused with the quest sheet');
    ev('sideOpen=false;renderQ()');
    await Promise.resolve(); await Promise.resolve();
    assert.ok(!rail.classList.contains('pg-more'), 'closing the menu releases the rail');
  });

  test('field only closes the sheet first and still lets the More menu through', () => {
    // The scrim would otherwise stay over the field with its close button hidden.
    assert.match(mobileJs, /if \(fieldOnly\) setRail\(false\)/);
    assert.equal(declOf('html.pg-mobile.pg-focus #pgScrim', 'display'), 'none!important');
    // The destinations menu (settings, log, GM, logout) renders inside #sideRail,
    // so the rail may only be hidden when that menu is not the reason it is up.
    assert.equal(declOf('html.pg-mobile.pg-focus #sideRail:not(.pg-more)', 'display'), 'none!important');
    assert.equal(declOf('html.pg-mobile.pg-focus #hud', 'height'), 'auto',
      'the card drops the rows it no longer shows instead of keeping an empty half');
  });

  test('mail and the daily roulette sit in one corner row on a phone', () => {
    assert.equal(declOf('html.pg-mobile #minimapTools', 'flex-direction'), 'row');
    // v321: all three seats share the thumb-sized footprint on a phone too.
    assert.equal(declOf('html.pg-mobile .minimap-tool-btn', 'width'), '48px');
    assert.equal(declOf('html.pg-mobile .minimap-tool-btn', 'height'), '42px');
    assert.equal(declOf('html.pg-mobile .social-hub-btn', 'width'), '48px');
    assert.equal(declOf('html.pg-mobile .social-hub-btn', 'height'), '42px');
  });

  test('a landscape phone shows the whole map page without scrolling', () => {
    // A landscape phone is SHORT: the panel body is ~200px, while the desktop map
    // page is ~850px (destination rail, 156px hero, stage picker, drop tables).
    // Fitting it by stacking sections only pushed two of them below the fold,
    // which is what "the other UI basically does not appear" looked like.
    assert.match(css, /@media \(orientation:landscape\) and \(max-height:560px\)[\s\S]*#wins \.ui-panel\[data-layout=map\] \.ui-content\{\s*grid-template-columns:minmax\(150px,180px\) minmax\(0,1fr\)/,
      'destinations on the left, the chosen field on the right');
    // Five rows of two, one line each: the 5-across desktop grid made every card
    // 43px tall and the destination rail 437px long.
    assert.equal(declOf('html.pg-mobile #wins .ui-panel[data-layout=map] .ui-destinations .mapgrid', 'grid-template-columns', 'landscape'),
      'repeat(2,minmax(0,1fr))');
    assert.equal(declOf('html.pg-mobile #wins .ui-panel[data-layout=map] .ui-destinations .mapcard', 'min-height', 'landscape'), '20px');
    // The hero art, the line naming the field and the drop tables cost more than
    // the whole body; the highlighted destination and Travel carry the name.
    for (const sel of ['eclipse-atlas-hero', 'ui-field-guide']) {
      assert.equal(declOf('html.pg-mobile #wins .ui-panel[data-layout=map] .' + sel, 'display', 'landscape'), 'none',
        sel + ' does not fit a 200px body');
    }
    assert.equal(declOf('html.pg-mobile #wins .ui-panel[data-layout=map] .ui-route .mapband-t', 'display', 'landscape'), 'none');
    // A closed <details> hides its body through a UA rule that this stylesheet
    // defeats by setting display:flex on it - so the folded requirements still
    // reserved 60px inside the panel and left it scrollable into blank space.
    assert.equal(declOf('html.pg-mobile #wins .ui-panel[data-layout=map] .ui-route .ui-fold:not([open])>.ui-fold-body', 'display', 'landscape'), 'none');
    assert.equal(declOf('html.pg-mobile #wins>.wp>.eclipse-window-footer', 'display', 'landscape'), 'none',
      'the hint footer is the first thing to go when height is scarce');
    assert.equal(declOf('html.pg-mobile #wins .ui-panel>.atabs.map-season-tabs', 'position', 'landscape'), 'sticky',
      'the tab strip stays reachable while a panel scrolls');
    // index.html pins these four tabs at 44px; on a 250px panel that is a fifth of the screen.
    assert.equal(declOf('html.pg-mobile #wins .ui-panel>.atabs.map-season-tabs button', 'min-height', 'landscape'), '30px');
    assert.equal(declOf('html.pg-mobile #wrap', 'height'), 'var(--pg-vh,100dvh)',
      'fullscreen follows the visible height, not the layout viewport');
    // The stage picker keeps its two rows (10 fields + 5 Nightmare) and the
    // auto-advance switch that a phone farms with; both must stay in the body.
    assert.equal(declOf('html.pg-mobile #wins .ui-panel[data-layout=map] .ui-route .lvgrid .map-node', 'height', 'landscape'), '27px');
    assert.equal(declOf('html.pg-mobile #wins .ui-panel[data-layout=map] .ui-route .row', 'font-size', 'landscape'), '9px');
  });

  test('the world chat cannot grow over the dock or off a small screen', () => {
    // social.js writes inline width/height, so the cap has to live there.
    assert.match(socialJs, /const phone=document\.documentElement\.classList\.contains\('pg-mobile'\)/);
    assert.match(socialJs, /capHeight=phone\?Math\.min\(maxHeight,Math\.max\(120,Math\.min\(150,/);
    assert.match(socialJs, /capWidth=phone\?Math\.min\(maxWidth,340\)/);
    assert.match(css, /html\.pg-mobile #socialChat\{/);
  });

  test('the activity log shows whole lines instead of a clipped box', () => {
    // eclipse.css pins #feed to 220px (170px under 740px) and packs it bottom-up,
    // so a phone max-height used to cut the fourth row in half.
    assert.equal(declOf('html.pg-mobile #feed', 'height'), 'auto');
    assert.equal(declOf('html.pg-mobile #feed', 'max-height'), 'none');
    assert.equal(declOf('html.pg-mobile #feed>div:nth-last-child(n+4)', 'display'), 'none',
      'the oldest of the four kept rows is dropped, not clipped');
  });

  test('the sheet copy of the quest tracker renders the live quest list', () => {
    ev("S=fresh();S.auto=false;S.q=[{type:'kill',goal:3,prog:1,z:10,xp:10,at:1}]");
    d.getElementById('pgQuests').click();
    assert.ok(d.documentElement.classList.contains('pg-rail-open'));
    const rail = d.getElementById('sideRail');
    assert.ok(rail.classList.contains('pg-open'));
    assert.ok(rail.querySelector('#qp'), 'the rail still holds the quest panel');
    d.getElementById('pgScrim').click();
    assert.ok(!d.documentElement.classList.contains('pg-rail-open'));
  });
}

pending.then(() => {
  console.log(`\nmobile layout: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
});
