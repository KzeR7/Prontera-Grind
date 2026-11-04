// The GM console page is a client, not a door: it must fetch nothing but /api, authorise nothing
// itself, and never carry a secret.   node tools/tests/gm_console_sim.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = fs.readFileSync(path.join(root, 'gm.html'), 'utf8');

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('gm.html: a client of the authorised API, holding no authority of its own\n');

t('inspection shows the same merged card stars and effects as combat', () => {
  const body=src.slice(src.indexOf('function gearDescription('),src.indexOf('function renderCharacter('));
  const describe=new Function('CATALOG','esc','nfmt',body+';return gearDescription;')({affixes:{cdm:'Crit DMG'},slotStats:{weapon:'ATK'},sections:['Starter'],rarities:['Common']},String,String);
  const card={card:1,n:'Merged Card',stars:3,effects:[{k:'cdm',v:75}],fit:['weapon']};
  assert.match(describe(card),/★★★/);assert.match(describe(card),/86.25/);
  assert.match(describe({name:'Sword',slot:'weapon',sec:0,tier:0,val:5,cards:[card]}),/Merged Card ★★★ · Crit DMG \+86.25/);
});

t('every request it makes is under /api', () => {
  const urls = [...src.matchAll(/api\(\s*'([^']+)'/g)].map(m => m[1]);
  assert.ok(urls.length >= 4, 'expected the console to call several endpoints');
  for (const u of urls) assert.ok(u.startsWith('/'), 'relative API path expected, got ' + u);
  assert.ok(!/https?:\/\//.test(src.replace(/href="\/"/g, '')) || !/fetch\(\s*['"]http/i.test(src),
    'it must not talk to a third-party origin');
  assert.ok(!/localStorage|sessionStorage/.test(src), 'a console must not cache account data in the browser');
});

t('it cannot read a password: the field is a setter with a confirm', () => {
  assert.ok(/type="password"/.test(src), 'the new-password field must be masked');
  assert.ok(/data-act="set-password"/.test(src), 'setting a password must be an explicit action');
  assert.ok(!/getPassword|revealPw|showPw/.test(src), 'no reveal-the-password affordance');
  assert.match(src, /set-password'[\s\S]{0,600}?password\s*\}/, 'the new password is sent to the server, never read from it');
});

t('the destructive actions all confirm first', () => {
  for (const [act, re] of [
    ['ban', /confirm\(\s*'Suspend/],
    ['set-password', /confirm\(\s*'Set a new password/],
    ['restore', /confirm\(\s*'Restore version/],
  ]) assert.match(src, re, act + ' must ask before it acts');
});

t('it carries no credentials, tokens, hashes or account names of its own', () => {
  assert.ok(!/GM_PASS|gmHash|pg_gm_local|passwordHash/.test(src), 'no credential material in the page');
  assert.ok(!/=(?:'|")[A-Za-z0-9+/]{24,}={0,2}(?:'|")/.test(src), 'no base64-looking literals');
  assert.ok(/credentials:\s*'same-origin'/.test(src), 'it must rely on the session cookie');
});

t('it does not invent game data: no item tables or balance numbers', () => {
  assert.ok(!/wt:\s*'(resist|element)'/.test(src), 'no elemental/enchant vocabulary that the game does not have');
  assert.ok(!/\b(100|300|1000)\s*Zeny\b/.test(src));
});

t('GM shows two levels, and the owner-only actions say so', () => {
  assert.match(src, /2\s*·\s*owner/, 'the level list must name the owner level');
  assert.match(src, /GM level and password changes are owner-only/);
});

t('the "never claim what you cannot apply" contract is stated for the player-facing side', () => {
  const game = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(/only the applied grant is claimed/.test(src) || /left unclaimed so the GM can resend/.test(game),
    'the console should tell the GM that an unapplied gift stays visible');
});

// This was an `async` function under the sync `t` runner - an async throw becomes a rejected
// promise the runner never sees, so every assertion below silently passed without running.
// Found while adding the grant-all action (haven-v325); the function is sync now, and the
// action contract spans both GM endpoints the console drives: /gm/player and /gm/shop.
t('every action the console offers exists on the server', () => {
  const server = ['functions/api/gm/player.js', 'functions/api/gm/shop.js']
    .map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  const actions = [...new Set([...src.matchAll(/action:\s*'([a-z-]+)'/g)].map(m => m[1]))];
  assert.ok(actions.length >= 6, 'expected several GM actions, got ' + actions.join(','));
  for (const a of actions) assert.ok(server.includes(`'${a}'`), `the server must implement ${a}`);
});

t('the Cash Shop hands over the whole wardrobe in one confirmed action', () => {
  assert.match(src, /data-act="shop-grant-all"/, 'the one-button grant exists');
  assert.match(src, /Grant all cosmetics/, 'and the button names what it does');
  assert.match(src, /shop-grant-all'[\s\S]{0,600}?confirm\('Grant EVERY cosmetic/, 'it asks before it acts');
  assert.match(src, /action:\s*'grant-all'/, 'the request is a grant-all action');
  const server = fs.readFileSync(path.join(root, 'functions/api/gm/shop.js'), 'utf8');
  assert.match(server, /'grant-all'/, 'the server implements it');
  assert.match(server, /INSERT OR IGNORE INTO entitlements/, 'owned items are skipped, not duplicated');
});

t('the page is safe to serve publicly: it degrades to a sign-in card', () => {
  assert.match(src, /Sign in first/, 'a signed-out visitor must see instructions, not data');
  assert.match(src, /if \(!me\.gm\)/, 'a signed-in non-GM must be turned away');
  assert.ok(src.indexOf('if (!me.gm)') < src.indexOf('await loadPlayers()'), 'the check must come before any data call');
});

// The console is ONE script block: a single bad escape anywhere in it stops the whole page dead -
// header, player list, usage card, nothing runs. That happened (a `\\'` inside a template literal,
// which closed the string early), and no test noticed for a release, because the other suites all
// read gm.html as text. So the page's own JavaScript is now parsed for real.
t('the inline console JavaScript is valid JavaScript (the whole page dies if it is not)', () => {
  const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.strictEqual(blocks.length, 1, 'the console is expected to have exactly one inline script');
  const tmp = path.join(os.tmpdir(), `pg-gm-console-${process.pid}.js`);
  try {
    fs.writeFileSync(tmp, blocks[0]);
    cp.execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  } catch (e) {
    assert.fail('gm.html\'s inline script does not parse: ' + String(e.stderr || e.message).split('\n').slice(0, 4).join(' '));
  } finally { try { fs.unlinkSync(tmp); } catch (_) {} }
});

t('the usage card is wired to the GM-only usage endpoint', () => {
  assert.match(src, /api\('\/gm\/usage'\)/, 'the console must read the usage endpoint');
  assert.match(src, /Function requests|D1 rows written/, 'and show the metered numbers, not just the ledger');
  const server = fs.readFileSync(path.join(root, 'functions/api/gm/usage.js'), 'utf8');
  assert.match(server, /isGm\(user\)/, 'the endpoint must be GM-only');
  assert.ok(!/CF_ANALYTICS_TOKEN\s*=\s*['"]/.test(server), 'no token may be hard-coded in the handler');
});

t('Back to the game returns to the live game overlay instead of reloading / into the login card', () => {
  const game = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(game, /id="gmBtn"\s+onclick="openGmConsole\(\)"/, 'in-game GM button must open the overlay, not unload index.html');
  assert.ok(!/id="gmBtn"[^>]*location\.href/.test(game), 'gmBtn must not navigate index.html away');
  assert.match(game, /id="gmConsoleModal"[\s\S]{0,200}id="gmConsoleFrame"/, 'overlay frame must exist in index.html');
  assert.ok(!/id="back"[^>]*onclick=/.test(src), 'gm.html #back must not hard-code an inline reload to /');

  const fnSrc = src.slice(src.indexOf('function backToGame()'), src.indexOf("$('back').onclick = backToGame;"));
  assert.ok(fnSrc.length > 40, 'backToGame() helper must exist in gm.html');
  const makeBack = (win, loc) => new Function('window', 'location', fnSrc + ';return backToGame;')(win, loc);

  let closedOverlay = 0;
  const embeddedLoc = { href: 'gm.html' };
  const parentWin = { closeGmConsole() { closedOverlay++; } };
  const embeddedWin = { parent: parentWin, opener: null };
  makeBack(embeddedWin, embeddedLoc)();
  assert.strictEqual(closedOverlay, 1, 'embedded GM console must close the parent overlay');
  assert.strictEqual(embeddedLoc.href, 'gm.html', 'embedded GM console must not reload /');

  let focused = 0, closedTab = 0;
  const tabLoc = { href: 'gm.html' };
  const tabWin = {};
  tabWin.parent = tabWin;
  tabWin.opener = { closed: false, focus() { focused++; } };
  tabWin.close = () => { closedTab++; };
  makeBack(tabWin, tabLoc)();
  assert.strictEqual(focused, 1, 'popup/tab GM console focuses opener');
  assert.strictEqual(closedTab, 1, 'popup/tab GM console closes itself');
  assert.strictEqual(tabLoc.href, 'gm.html', 'popup/tab GM console does not reload /');

  const standaloneLoc = { href: 'gm.html' };
  const standaloneWin = {};
  standaloneWin.parent = standaloneWin;
  standaloneWin.opener = null;
  makeBack(standaloneWin, standaloneLoc)();
  assert.strictEqual(standaloneLoc.href, '/', 'standalone /gm.html visit falls back to /');
});

t('v274: the console is usable on a phone - stacked layout, reachable players, big targets', () => {
  // Owner: "GM login UI is broken on the phone, the console cannot be viewed and the players
  // cannot be selected". The page was a desktop two-column grid with 12px table cells and a
  // 60vh inner scroller.
  const page = fs.readFileSync('gm.html', 'utf8');
  assert.match(page, /@media\(max-width:820px\)\{/, 'a phone breakpoint exists');
  // One column: the detail card is reachable below the list instead of squeezed beside it.
  assert.match(page, /@media\(max-width:820px\)[\s\S]*main\{padding:8px;gap:8px\}/);
  // The nested scroller that hid the list is released on a phone.
  assert.match(page, /\.players-scroll\{max-height:60vh;overflow:auto\}/, 'desktop keeps its scroller');
  assert.match(page, /@media\(max-width:820px\)[\s\S]*\.players-scroll\{max-height:none;overflow:visible\}/,
    'the phone lets the page scroll instead');
  // Tap targets: at least 40px for every button, and 16px inputs so iOS does not zoom.
  assert.match(page, /@media\(max-width:820px\)[\s\S]*button\{min-height:40px/);
  assert.match(page, /@media\(max-width:820px\)[\s\S]*input,select,textarea\{min-height:40px;font-size:16px\}/);
  // The four columns become one line per player on a narrow handset.
  assert.match(page, /@media\(max-width:480px\)[\s\S]*#players thead\{display:none\}/);
  assert.match(page, /#players tbody tr\{\s*display:grid;grid-template-columns:1fr 1fr 1fr/);
  // Opening a player brings the detail card into view, and it can be closed again.
  assert.match(page, /scrollIntoView\(\{ block: 'start'/);
  assert.match(page, /data-act="closedetail"/);
  assert.match(page, /function closeDetail\(\)/);
  assert.match(page, /if \(btn\.dataset\.act === 'closedetail'\) \{ closeDetail\(\); return; \}/);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
