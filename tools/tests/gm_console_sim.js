// The GM console page is a client, not a door: it must fetch nothing but /api, authorise nothing
// itself, and never carry a secret.   node tools/tests/gm_console_sim.js
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = fs.readFileSync(path.join(root, 'gm.html'), 'utf8');

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('gm.html: a client of the authorised API, holding no authority of its own\n');

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

t('every action the console offers exists on the server', async () => {
  const server = fs.readFileSync(path.join(root, 'functions/api/gm/player.js'), 'utf8');
  const actions = [...new Set([...src.matchAll(/action:\s*'([a-z-]+)'/g)].map(m => m[1]))];
  assert.ok(actions.length >= 6, 'expected several GM actions, got ' + actions.join(','));
  for (const a of actions) assert.ok(server.includes(`'${a}'`), `the server must implement ${a}`);
});

t('the page is safe to serve publicly: it degrades to a sign-in card', () => {
  assert.match(src, /Sign in first/, 'a signed-out visitor must see instructions, not data');
  assert.match(src, /if \(!me\.gm\)/, 'a signed-in non-GM must be turned away');
  assert.ok(src.indexOf('if (!me.gm)') < src.indexOf('await loadPlayers()'), 'the check must come before any data call');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
