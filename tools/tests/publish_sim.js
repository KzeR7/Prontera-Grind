// Publish hygiene: what the host is allowed to serve, checked by actually running the build.
//   node tools/tests/publish_sim.js
//
// The site used to publish the whole repo, which is how a retired GM password ended up downloadable
// at /_login.html and why the site was ~37 MB instead of ~16 MB. tools/build_site.sh assembles only
// the runtime files into dist/; THIS test runs that script for real and then audits the output, so
// a future change that adds a top-level asset (or a stray dev file) fails here instead of shipping.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), assert = require('assert');
const root = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('publish directory: only the files the game fetches\n');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-publish-'));
let built = false, buildErr = null;
try { cp.execFileSync('bash', [path.join(root, 'tools', 'build_site.sh'), out], { stdio: 'pipe' }); built = true; }
catch (e) { buildErr = e; }

// Everything the browser asks for at runtime. Derived from the game, not hand-written where possible.
const staticRefs = [...src.matchAll(/(?:src|href)="((?:assets|Updates)\/[^"]+)"/g)].map(m => m[1])
  .filter(r => !r.includes('${'));
const skinData = fs.readFileSync(path.join(root, 'assets', 'class_skins_data.js'), 'utf8');
const skinDir = (skinData.match(/"dir":"([^"]+)"/) || [])[1];
const skinFile = (skinData.match(/"files":\{"S":"([^"]+)"/) || [])[1];

const forbidden = ['_login.html', '_shot.html', 'logic2.js', 'tools', 'Sprite', 'image-search',
  'AGENTS.md', 'READ-ME-FIRST.md', '_recon_v27b.png', '_recon_v27c.png', '_recon_v27d.png', '_recon_v27e.png'];

t('the build script runs and finishes cleanly', () => {
  assert.ok(built, 'tools/build_site.sh exited non-zero: ' + (buildErr && (buildErr.stderr || '').toString().slice(0, 300)));
});

t('the three runtime file groups are present', () => {
  for (const f of ['index.html', 'assets/sprite_pack_data.js', 'assets/class_skins_data.js',
    'assets/weapon_joints_data.js', 'assets/kit/ro-spritesheet.png', 'assets/kit/ro-spritesheet.json']) {
    assert.ok(fs.existsSync(path.join(out, f)), 'missing from the publish directory: ' + f);
  }
});

t('every asset path index.html names statically ships with it', () => {
  // The game names three data files statically (sprite pack, class skins, weapon joints); the map
  // kit is fetched at runtime and the mob fallbacks go through a template string, so they are covered
  // by the directory copies and the group check above.
  const bare = staticRefs.map(r => r.replace(/[?#].*$/, ''));   // the game cache-busts with ?v=1
  for (const must of ['assets/sprite_pack_data.js', 'assets/class_skins_data.js', 'assets/weapon_joints_data.js']) {
    assert.ok(bare.includes(must), 'index.html no longer references ' + must + ' - update this test if that is deliberate');
  }
  const missing = bare.filter(r => !fs.existsSync(path.join(out, r)));
  assert.deepStrictEqual(missing, [], 'referenced but not published: ' + missing.join(', '));
});

t('the class skins the game points at are published (Updates/Sprite/)', () => {
  assert.ok(skinDir && skinFile, 'could not read the class-skin directory/file out of assets/class_skins_data.js');
  assert.strictEqual(path.normalize(skinDir), 'Updates/Sprite', 'class skins moved - build_site.sh must copy the new place too');
  assert.ok(fs.existsSync(path.join(out, skinDir, skinFile)), 'a skin file the game loads is not published: ' + skinFile);
});

t('no dev file, tool, art source or repo document is published', () => {
  const found = [];
  for (const f of forbidden) if (fs.existsSync(path.join(out, f))) found.push(f);
  // Sprite/ is a needed *directory name* under Updates/ - only the repo-root one is wrong.
  assert.deepStrictEqual(found, [], 'must never be published: ' + found.join(', '));
});

t('the GM console ships, because it is only a client of the API', () => {
  const f = path.join(out, 'gm.html');
  assert.ok(fs.existsSync(f), 'gm.html must be published - the GM console is how the owner runs the game');
  const gm = fs.readFileSync(f, 'utf8');
  assert.ok(gm.length > 4000, 'gm.html looks like a stub');
  assert.ok(!/GM_PASS|gmHash|passwordHash/.test(gm), 'the console must hold no credentials of its own');
});

t('Pages sends only /api/* through Functions (the free allowance depends on it)', () => {
  const f = path.join(out, '_routes.json');
  assert.ok(fs.existsSync(f), '_routes.json must be in the publish directory (Pages reads it from there)');
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.strictEqual(r.version, 1);
  assert.deepStrictEqual(r.include, ['/api/*'], 'only the API should invoke Functions; static files are free and unlimited');
  assert.ok(!/index\.html|\/\*\*/.test(r.include.join(',')), 'a broad include would bill every page view to the Functions allowance');
});

t('every API path the client calls exists as a Function file', () => {
  const calls = [...src.matchAll(/cloudFetch\('([^']+)'/g)].map(m => m[1]);
  for (const p of ['/register', '/sessions', '/me', '/save', '/messages', '/grants', '/board'])
    assert.ok(fs.existsSync(path.join(root, 'functions', 'api', p.slice(1) + '.js')), 'missing handler: functions/api' + p + '.js');
  assert.ok(calls.length >= 4, 'the client should be naming API paths');
  for (const p of ['/gm/players', '/gm/player', '/gm/log', '/gm/usage'])
    assert.ok(fs.existsSync(path.join(root, 'functions', 'api', p.slice(1) + '.js')), 'missing handler: ' + p);
});

t('the published tree is small enough to stay honest', () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) =>
    a + (e.isDirectory() ? walk(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
  const bytes = walk(out);
  const mb = bytes / 1048576;
  assert.ok(mb > 8, 'the published tree is only ' + mb.toFixed(1) + ' MB - is the sprite pack still shipping?');
  assert.ok(mb < 30, 'the published tree grew to ' + mb.toFixed(1) + ' MB; the game needs ~16. Something dev-side leaked in.');
});

t('.assetsignore covers the same dev material (the Cloudflare safety net)', () => {
  const ignore = fs.readFileSync(path.join(root, '.assetsignore'), 'utf8');
  for (const f of ['tools/', 'Sprite/', 'image-search/', '_login.html', '_shot.html', 'logic2.js', 'Updates/ApngAnimation/', 'Updates/damage-floats-proposal/', 'Updates/crit-frame-compare/']) {
    assert.ok(ignore.includes(f), '.assetsignore does not exclude ' + f);
  }
  assert.ok(!/^\s*!/.test(ignore.split('\n').filter(l => !l.startsWith('#')).join('\n')),
    '.assetsignore must not use ! re-includes: if it ever became the only protection, a missing negation rule would drop real game files');
});

fs.rmSync(out, { recursive: true, force: true });
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
