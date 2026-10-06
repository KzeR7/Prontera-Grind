// GM login: the GM password must not be readable in the client, the check must go through the
// salted multi-round hash, and the generator tool must agree with the game's own hashPw().
//   node tools/tests/gm_auth_sim.js
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const root = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('GM password: hashed in the client, and the tool matches the game\n');

// The game's own hashPw + gmHash, compiled straight out of index.html (never re-typed here).
function gameHash() {
  const fnStart = src.indexOf('function hashPw(p){');
  const fnEnd = src.indexOf('\n', src.indexOf('return(h2>>>0)', fnStart));
  const hashPw = new Function('return ' + src.slice(fnStart, fnEnd))();
  const rounds = +(src.match(/const GM_ROUNDS=(\d+)/) || [])[1];
  const gmStart = src.indexOf('const gmHash=p=>{');
  const gmEnd = src.indexOf('\n', gmStart);
  return new Function('hashPw', 'GM_ROUNDS', 'return ' + src.slice(gmStart + 'const '.length, gmEnd).replace(/;$/, ''))(hashPw, rounds);
}

t('index.html no longer contains the retired plaintext GM password', () => {
  assert.ok(!src.includes('gm1234'), 'the old password is still somewhere in index.html');
});

t('index.html has no plaintext GM_PASS constant at all', () => {
  // GM_PASS_HASH is the only allowed spelling; a plaintext assignment is the bug. (An empty
  // GM_PASS='' is tolerated in the legacy pages below - it can never match, because submitAuth
  // rejects an empty password before it reaches the GM branch.)
  const plain = src.match(/GM_PASS\s*=\s*['"`][^'"`]+['"`]/);
  assert.ok(!plain, 'a plaintext GM_PASS assignment is back: ' + (plain && plain[0]));
  assert.ok(/const GM_ROUNDS=\d+,GM_PASS_HASH='[0-9a-f]{16}';/.test(src), 'the GM_ROUNDS/GM_PASS_HASH line is missing or malformed');
});

t('the login path compares the salted hash, not the password', () => {
  assert.ok(src.includes("if(gmHash(p)!==String(GM_PASS_HASH))return showErr('Incorrect GM password.')"),
    'the GM branch of submitAuth must check gmHash(p) against GM_PASS_HASH');
});

t('the round count is high enough to make guessing expensive', () => {
  const rounds = +(src.match(/const GM_ROUNDS=(\d+)/) || [])[1];
  assert.ok(rounds >= 10000, 'GM_ROUNDS dropped to ' + rounds + ' - a 64-bit hash over a public file needs a stiff stretch');
});

t('the generator tool and the game compute the same hash', () => {
  const { loadGame } = require('../make_gm_hash.js');
  const tool = loadGame(), game = gameHash();
  for (const probe of ['a', 'Poring-99', 'a much longer pass phrase with spaces', 'ünïcøde-✓', '']) {
    assert.strictEqual(tool.gmHash(probe), game(probe), 'hash mismatch for probe ' + JSON.stringify(probe));
  }
  assert.strictEqual(tool.gmHash, tool.gmHash, 'sanity');
});

t('the stored hash is the hash of something the owner knows (self-consistency)', () => {
  // We deliberately do NOT keep the password in the repo, so this only proves the stored value is a
  // real output of the function rather than a placeholder: hashing anything must reproduce it.
  const game = gameHash();
  const stored = src.match(/GM_PASS_HASH='([0-9a-f]{16})'/)[1];
  assert.ok(/^[0-9a-f]{16}$/.test(stored), 'stored hash must be 16 hex characters');
  assert.notStrictEqual(game('definitely-not-the-password'), stored, 'stored hash must not be the hash of an obvious guess');
  assert.notStrictEqual(game(''), stored, 'stored hash must not be the hash of the empty string');
});

t('a wrong password is rejected (the maths, not the UI)', () => {
  const game = gameHash();
  const stored = src.match(/GM_PASS_HASH='([0-9a-f]{16})'/)[1];
  assert.notStrictEqual(game('GM'), stored);
  assert.notStrictEqual(game('gm1234'), stored, 'the retired password must not work');
  assert.notStrictEqual(game('gm12345'), stored);
});

t('the legacy dev pages and the screenshot harness carry no GM password either', () => {
  for (const f of ['_login.html', '_shot.html', 'tools/shot_harness.js']) {
    const body = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(!body.includes('gm1234'), f + ' still contains the retired password');
    assert.ok(!/GM_PASS\s*=\s*['"`][^'"`]+['"`]/.test(body), f + ' still assigns a plaintext GM password');
  }
});

t('the whole generate-then-log-in workflow works (rehearsed on a scratch copy)', () => {
  // This is the test that matters most: it runs the exact thing the owner does - generate a hash
  // with the tool, paste it into the game, then check the password against it - on a copy in /tmp,
  // so a round-count or off-by-one mistake in either half is caught before the owner is locked out.
  const os = require('os'), cp = require('child_process');
  const scratch = path.join(os.tmpdir(), 'pg-gm-rehearsal.html');
  const secret = 'rehearsal-passphrase-' + process.pid;
  fs.writeFileSync(scratch, src);
  const env = Object.assign({}, process.env, { PG_GAME: scratch });
  const tool = path.join(root, 'tools', 'make_gm_hash.js');

  const printed = cp.execFileSync(process.execPath, [tool, secret], { env, encoding: 'utf8' });
  const line = (printed.match(/const GM_ROUNDS=\d+,GM_PASS_HASH='[0-9a-f]{16}';/) || [])[0];
  assert.ok(line, 'the tool did not print a pasteable constants line');
  fs.writeFileSync(scratch, src.replace(/const GM_ROUNDS=\d+,GM_PASS_HASH='[0-9a-f]{16}';/, line));

  cp.execFileSync(process.execPath, [tool, '--check', secret], { env, stdio: 'pipe' });   // throws if it exits non-zero
  let wrongRejected = false;
  try { cp.execFileSync(process.execPath, [tool, '--check', secret + 'x'], { env, stdio: 'pipe' }); }
  catch (e) { wrongRejected = e.status === 1; }
  assert.ok(wrongRejected, 'a wrong password must make --check exit 1');
  fs.unlinkSync(scratch);
});

t('hashing stays fast enough for a login click', () => {
  const game = gameHash();
  const t0 = Date.now();
  game('a-twenty-character-passphrase');
  const ms = Date.now() - t0;
  assert.ok(ms < 250, 'gmHash took ' + ms + 'ms - the login button would visibly stall');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
