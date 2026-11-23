// Owner-run Windows staging launcher for Astral Raid (haven-v452).
// Targets ONLY prontera-grind-staging + prontera-social-staging + pg-staging. Never production:
// the root wrangler.toml (horizonhaven / pg / prontera-social / prontera-gate) is replaced inside a
// temporary copy before anything is built or deployed, and your checkout is never modified.
//
//   cd <your Prontera-Grind folder>
//   git fetch origin arena/a976c1b9-prontera-grind
//   cmd /c "git show FETCH_HEAD:tools/staging/stage_raid.mjs > %TEMP%\stage_raid.mjs"
//   node $env:TEMP\stage_raid.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const THREE_SRI = 'CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu';

export const STAGE = Object.freeze({
  branch: 'arena/a976c1b9-prontera-grind',
  buildTag: 'haven-v465',
  pagesProject: 'prontera-grind-staging',
  branchUrl: 'https://main.prontera-grind-staging.pages.dev',
  socialProject: 'prontera-social-staging',
  dbName: 'pg-staging',
  dbId: '3a38c6fc-96a8-491d-b97b-fd536e575ca4',
});

// Names that must never appear in what this launcher hands to Wrangler.
export const PRODUCTION = Object.freeze([
  'horizonhaven',
  '50a6448b-1f12-466c-a28a-10544bedf750',
  'prontera-gate',
  '"prontera-social"',
  '"pg"',
]);

export function pagesConfig() {
  const s = STAGE;
  return `name = "${s.pagesProject}"\ncompatibility_date = "2026-10-01"\npages_build_output_dir = "dist"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "${s.dbName}"\ndatabase_id = "${s.dbId}"\n\n[[durable_objects.bindings]]\nname = "SOCIAL"\nclass_name = "Social"\nscript_name = "${s.socialProject}"\n`;
}

export function socialConfig() {
  const s = STAGE;
  return `name = "${s.socialProject}"\nmain = "index.mjs"\ncompatibility_date = "2026-10-01"\nworkers_dev = false\n\n[[durable_objects.bindings]]\nname = "SOCIAL"\nclass_name = "Social"\n\n[[migrations]]\ntag = "v1"\nnew_sqlite_classes = ["Social"]\n`;
}

export function deploymentUrl(output) {
  const urls = String(output).match(/https:\/\/[a-z0-9-]+\.prontera-grind-staging\.pages\.dev\b/g) || [];
  const url = urls.find(x => /^https:\/\/[0-9a-f]{8}\.prontera-grind-staging\.pages\.dev$/.test(x));
  assert(url, 'Could not identify the staging deployment URL in Wrangler output. Check the Cloudflare dashboard before retrying.');
  return url;
}

// Additive schema steps main has gained through haven-v452. Each runs only if its table or column
// is missing, in exact numerical order, so re-running against an up-to-date pg-staging changes nothing.
export function missingMigrations(tables, saveAlertColumns = new Set(), claimColumns = new Set()) {
  const out = [];
  for (const [table, file] of [
    ['competition_periods', '0009_competition_settlement.sql'],
    ['competition_baselines', '0010_competition_baseline.sql'],
    ['unverified_echo_config', '0011_unverified_echo_launch.sql'],
    ['friends', '0012_friends.sql'],
    ['ip_bans', '0014_ip_bans.sql'],
    ['save_alerts', '0015_save_audit.sql'],
  ]) {
    if (!tables.has(table)) out.push(file);
  }
  if (!tables.has('save_alerts') || !saveAlertColumns.has('cleared_at')) out.push('0016_save_alert_review.sql');
  if (!tables.has('announcement_gifts')) out.push('0017_announcement_gifts.sql');
  if (tables.has('offline_reward_claims')) {
    if (!claimColumns.has('cls')) out.push('0018_offline_claim_owner_context.sql');
    if (!claimColumns.has('income_xp')) out.push('0019_offline_claim_pricing_snapshot.sql');
    if (!claimColumns.has('pricing_state')) out.push('0020_offline_claim_pricing_state.sql');
  }
  if (!tables.has('save_alerts') || !saveAlertColumns.has('rule_version') || !tables.has('save_audit_windows')) {
    out.push('0021_save_audit_evidence.sql');
  }
  return out;
}

// Probe Upgrade requests over raw node:https/http (undici rejects Upgrade as a forbidden header).
const defaultGet = async (target, options = {}) => {
  if (options.headers && options.headers.Upgrade) {
    const u = new URL(target);
    return await new Promise((resolve, reject) => {
      const req = (u.protocol === 'https:' ? https : http).request(
        u,
        { method: 'GET', headers: options.headers },
        res => { res.resume(); resolve({ status: res.statusCode, text: async () => '' }); },
      );
      req.setTimeout(30000, () => req.destroy(Error('network timeout')));
      req.on('error', reject);
      req.end();
    });
  }
  return fetch(target, { ...options, signal: AbortSignal.timeout(30000) });
};

export async function verifyDeployment(url, expectedBuild, getImpl = defaultGet) {
  async function get(route, options = {}) {
    try { return await getImpl(url + route, options); }
    catch (e) { throw Error(`Staging ${route} request failed: ${e?.cause?.code || e.message || 'network error'}`); }
  }
  const version = await get('/version.txt', { cache: 'no-store' });
  assert.equal(version.status, 200, 'Staging /version.txt returned HTTP ' + version.status);
  assert.equal((await version.text()).trim(), expectedBuild, 'The staged site build tag does not match ' + expectedBuild);

  const num = (expectedBuild.match(/haven-v(\d+)/) || [])[1] || '452';
  for (const asset of [`/assets/raid.js?v=${num}`, `/assets/raid.css?v=${num}`]) {
    const res = await get(asset, { cache: 'no-store' });
    assert.equal(res.status, 200, `Staging ${asset} returned HTTP ${res.status}`);
  }

  // Verify the deployed Three.js bundle matches index.html's Subresource Integrity (no Windows CRLF drift).
  const threeRes = await get('/assets/endgame/three-r128.min.js', { cache: 'no-store' });
  assert.equal(threeRes.status, 200, 'Staging /assets/endgame/three-r128.min.js returned HTTP ' + threeRes.status);
  const threeBuf = Buffer.from(await (threeRes.arrayBuffer ? threeRes.arrayBuffer() : Buffer.from(await threeRes.text(), 'utf8')));
  const remoteSri = createHash('sha384').update(threeBuf).digest('base64');
  assert.equal(remoteSri, THREE_SRI, `Deployed three-r128.min.js SHA-384 (${remoteSri}) != expected SRI (${THREE_SRI})`);

  // With no session, /api/social must reach authentication (401), not missing-binding (503).
  const social = await get('/api/social', { headers: { Origin: url, Upgrade: 'websocket' }, redirect: 'manual' });
  assert.equal(social.status, 401, 'Staging /api/social returned HTTP ' + social.status + '; expected 401 with SOCIAL binding active');
}

function run(command, args, { cwd, combined = false } = {}) {
  const p = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 900000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' },
  });
  if (p.error || p.status !== 0) {
    throw Error(`${path.basename(command)} ${args.slice(0, 3).join(' ')} failed (exit ${p.status ?? 'unavailable'}).\n${((p.stderr || '') + '\n' + (p.stdout || '')).trim().slice(-2000)}`);
  }
  return combined ? `${p.stdout || ''}\n${p.stderr || ''}` : p.stdout;
}

function npxCli() {
  const found = process.platform === 'win32' ? run('where.exe', ['npx.cmd']).split(/\r?\n/).map(x => x.trim()).filter(Boolean) : [];
  const dirs = [path.dirname(process.execPath), ...found.map(x => path.dirname(x))];
  if (process.env.APPDATA) dirs.push(path.join(process.env.APPDATA, 'npm'));
  const result = dirs.flatMap(d => [
    path.join(d, 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    path.resolve(d, '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
  ]).find(x => fs.existsSync(x));
  assert(result, 'Could not find npm npx-cli.js. Nothing was deployed.');
  return result;
}

// Pages deploy reads wrangler.toml from its cwd; every other command is given our file explicitly.
function wrangler(cwd, args, options) {
  const config = args[0] === 'pages' ? [] : ['--config', 'wrangler.toml'];
  return run(process.execPath, [npxCli(), '--yes', 'wrangler@4.154.0', ...args, ...config], { cwd, ...options });
}

function json(cwd, args) {
  const text = wrangler(cwd, args);
  try { return JSON.parse(text); } catch { throw Error('Wrangler returned an unreadable response:\n' + text.slice(-1000)); }
}

function findBuild() {
  const candidates = [
    process.cwd(),
    path.join(os.homedir(), 'Desktop', 'Prontera-Grind'),
    path.join(os.homedir(), 'Desktop', 'Prontera-Grind-staging'),
  ];
  for (const repo of candidates) {
    if (!fs.existsSync(path.join(repo, '.git'))) continue;
    for (const ref of [`origin/${STAGE.branch}`, 'FETCH_HEAD', STAGE.branch]) {
      const show = spawnSync('git', ['-C', repo, 'show', `${ref}:index.html`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const build = show.status === 0 && /^const BUILD='([^']+)';/m.exec(show.stdout);
      if (build && build[1].includes(STAGE.buildTag)) {
        return { repo, build: build[1], sha: run('git', ['-C', repo, 'rev-parse', `${ref}^{commit}`]).trim() };
      }
    }
  }
  throw Error(`Could not find the ${STAGE.buildTag} build. Run "git fetch origin ${STAGE.branch}" inside your Prontera-Grind folder first. Nothing was deployed.`);
}

async function main() {
  assert.equal(process.platform, 'win32', 'Run this launcher on the Windows staging setup.');
  assert.equal(process.argv.length, 2, 'This fixed-target staging launcher takes no arguments.');
  const { repo, build, sha } = findBuild();
  const bash = ['D:\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'].find(x => fs.existsSync(x));
  assert(bash, 'Cannot find Git bash.exe. Nothing was deployed.');

  console.log(`1/6 Found ${STAGE.buildTag} (${sha.slice(0, 8)}) in ${repo}`);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-stage-raid-'));
  try {
    const archive = path.join(temp, 'tree.tar');
    // Force core.autocrlf=false so Windows Git never converts LF -> CRLF and breaks Subresource Integrity.
    run('git', ['-C', repo, '-c', 'core.autocrlf=false', 'archive', '--format=tar', `--output=${archive}`, sha]);
    run('tar.exe', ['-xf', archive, '-C', temp]);
    fs.unlinkSync(archive);

    fs.writeFileSync(path.join(temp, 'wrangler.toml'), pagesConfig());
    fs.writeFileSync(path.join(temp, 'workers', 'social', 'wrangler.toml'), socialConfig());
    for (const file of ['wrangler.toml', path.join('workers', 'social', 'wrangler.toml')]) {
      const text = fs.readFileSync(path.join(temp, file), 'utf8');
      for (const name of PRODUCTION) {
        assert(!text.includes(name), 'A production name reached the staging config. Stopped; nothing was deployed.');
      }
    }

    console.log('2/6 Building the site in a temporary folder (your checkout is not touched)...');
    run(bash, ['tools/build_site.sh'], { cwd: temp });
    assert.equal(fs.readFileSync(path.join(temp, 'dist', 'version.txt'), 'utf8').trim(), build, 'The built site is not the expected build. Stopped.');
    assert(fs.existsSync(path.join(temp, 'dist', 'assets', 'raid.js')), 'dist/assets/raid.js is missing from the build. Stopped.');
    assert(fs.existsSync(path.join(temp, 'dist', 'assets', 'raid.css')), 'dist/assets/raid.css is missing from the build. Stopped.');
    const localSri = createHash('sha384').update(fs.readFileSync(path.join(temp, 'dist', 'assets', 'endgame', 'three-r128.min.js'))).digest('base64');
    assert.equal(localSri, THREE_SRI, `Built three-r128.min.js SHA-384 (${localSri}) != expected SRI (${THREE_SRI}). Stopped.`);

    console.log(`3/6 Verifying the remote database is ${STAGE.dbName} (${STAGE.dbId})...`);
    const db = json(temp, ['d1', 'info', 'DB', '--json']);
    assert(db.uuid === STAGE.dbId && db.name === STAGE.dbName, `The remote database is not ${STAGE.dbName}. Stopped; nothing was deployed.`);

    console.log('4/6 Checking staging schema & applying any missing additive migrations...');
    const rows = q => (json(temp, ['d1', 'execute', 'DB', '--remote', '--json', '--command', q]).at(-1)?.results || []).map(r => r.name);
    const tables = new Set(rows("SELECT name FROM sqlite_master WHERE type='table';"));
    assert(tables.has('users') && tables.has('saves') && tables.has('sessions'), 'pg-staging has no account tables. Stopped; nothing was deployed.');
    const saveAlertCols = new Set(tables.has('save_alerts') ? rows("SELECT name FROM pragma_table_info('save_alerts');") : []);
    const claimCols = new Set(tables.has('offline_reward_claims') ? rows("SELECT name FROM pragma_table_info('offline_reward_claims');") : []);
    for (const file of missingMigrations(tables, saveAlertCols, claimCols)) {
      console.log(`    Applying ${file} to ${STAGE.dbName}...`);
      wrangler(temp, ['d1', 'execute', 'DB', '--remote', `--file=migrations/${file}`]);
    }

    console.log(`5/6 Deploying staging Social Worker "${STAGE.socialProject}" (Party Raid relay)...`);
    wrangler(path.join(temp, 'workers', 'social'), ['deploy']);

    console.log(`6/6 Deploying "${STAGE.pagesProject}" (about 197 MiB; this can take several minutes)...`);
    const url = deploymentUrl(wrangler(temp, ['pages', 'deploy', 'dist', '--project-name', STAGE.pagesProject, '--branch', 'main'], { combined: true }));

    console.log('\n============================================================');
    console.log('Staged: ' + build);
    console.log('  Unique URL:       ' + url);
    console.log('  Staging branch:   ' + STAGE.branchUrl);
    console.log('  Social Worker:    ' + STAGE.socialProject);
    console.log('  Database:         ' + STAGE.dbName + ' (' + STAGE.dbId + ')');
    console.log('  Production:       NOT TOUCHED (horizonhaven, pg, prontera-social, prontera-gate)');
    console.log('============================================================');
    try {
      await verifyDeployment(url, build);
      console.log('Verified and ready: version.txt, raid.js, raid.css, and /api/social (401 auth gate) all passed.');
    } catch (e) {
      console.log('Deployment completed, but automatic verification did not pass: ' + String(e.message || e));
      console.log('Inspect the URL above before retrying.');
    }
  } finally {
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('\nSTOP: ' + String(e.message || e)); process.exitCode = 1; });
}
