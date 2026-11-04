// Self-contained Windows staging deployer for haven-v283 (prontera-grind-staging + pg-staging ONLY).
// Leaves your local Prontera-Grind-staging working tree untouched and never targets production.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = 'prontera-grind-staging';
const DB_NAME = 'pg-staging';
const DB_ID = '3a38c6fc-96a8-491d-b97b-fd536e575ca4';
const BRANCH = 'arena/b0caa7f9-prontera-grind';
const EXPECTED_BUILD = '2026-11-04 haven-v316 illustrated rune-midgard world atlas';

const CONFIG = [
  `name = "${PROJECT}"`,
  'compatibility_date = "2026-10-01"',
  'pages_build_output_dir = "dist"',
  '',
  '[[d1_databases]]',
  'binding = "DB"',
  `database_name = "${DB_NAME}"`,
  `database_id = "${DB_ID}"`,
  '',
].join('\n');

const DDL_0008 = 'CREATE TABLE IF NOT EXISTS damage_samples (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, slot INTEGER NOT NULL CHECK(slot BETWEEN 0 AND 27), bucket INTEGER NOT NULL, sampled_at INTEGER NOT NULL, map INTEGER, stage INTEGER, reported_total_damage REAL, reported_echo_best REAL, PRIMARY KEY (user_id, slot)); CREATE TABLE IF NOT EXISTS damage_alerts (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, max_reported_dps REAL NOT NULL, observations INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (user_id, kind)); CREATE INDEX IF NOT EXISTS idx_damage_alerts_last_seen ON damage_alerts(last_seen DESC);';

function run(command, args, { cwd, allowOutput = false, combinedOutput = false } = {}) {
  const p = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 25 * 1024 * 1024,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' },
  });
  if (p.error || p.status !== 0) {
    const detail = allowOutput ? ((p.stderr || '') + '\n' + (p.stdout || '')).trim().slice(-2000) : 'Check Wrangler login (`npx.cmd wrangler whoami`) and try again.';
    throw new Error(`${path.basename(command)} failed (exit ${p.status ?? 'unavailable'}). ${detail}`);
  }
  return combinedOutput ? `${p.stdout || ''}\n${p.stderr || ''}` : p.stdout;
}

function findGitRepo() {
  const candidates = [
    process.cwd(),
    path.join(os.homedir(), 'Desktop', 'Prontera-Grind-staging'),
    path.join(os.homedir(), 'Desktop', 'Prontera-Grind'),
  ];
  for (const dir of candidates) {
    if (!fs.existsSync(path.join(dir, '.git'))) continue;
    for (const ref of [`origin/${BRANCH}`, 'FETCH_HEAD']) {
      const check = spawnSync('git', ['-C', dir, 'show', `${ref}:index.html`], {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });
      if (check.status === 0 && check.stdout.includes(EXPECTED_BUILD)) {
        const sha = run('git', ['-C', dir, 'rev-parse', `${ref}^{commit}`], { allowOutput: true }).trim();
        return { repo: dir, sha };
      }
    }
  }
  throw new Error(
    `Could not find fetched build "${EXPECTED_BUILD}". Run \`git fetch origin ${BRANCH}\` inside C:\\Users\\User\\Desktop\\Prontera-Grind-staging first.`
  );
}

function findGitBash(repo) {
  const candidates = [
    'D:\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  ];
  try {
    const execPath = run('git', ['-C', repo, '--exec-path'], { allowOutput: true }).trim();
    if (execPath) {
      candidates.push(
        path.resolve(execPath, '..', '..', 'bin', 'bash.exe'),
        path.resolve(execPath, '..', '..', '..', 'bin', 'bash.exe')
      );
    }
  } catch {}
  const found = candidates.find(p => fs.existsSync(p));
  assert(found, 'Cannot find Git for Windows bash.exe (checked D:\\Git and Program Files\\Git).');
  return found;
}

function npxCli() {
  const found = process.platform === 'win32'
    ? run('where.exe', ['npx.cmd'], { allowOutput: true }).split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    : [];
  const dirs = [path.dirname(process.execPath), ...found.map(p => path.dirname(p))];
  if (process.env.APPDATA) dirs.push(path.join(process.env.APPDATA, 'npm'));
  const candidates = dirs.flatMap(d => [
    path.join(d, 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    path.resolve(d, '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
  ]);
  const result = candidates.find(p => fs.existsSync(p));
  assert(result, 'Could not find npm npx-cli.js. No staging data was changed.');
  return result;
}

function wrangler(cwd, args, { allowOutput = false, combinedOutput = false } = {}) {
  const config = args[0] === 'pages' ? [] : ['--config', 'wrangler.toml'];
  return run(process.execPath, [npxCli(), '--yes', 'wrangler@4.154.0', ...args, ...config], { cwd, allowOutput, combinedOutput });
}

export function extractStagingUrl(output) {
  const urls = output.match(/https:\/\/[a-z0-9-]+\.prontera-grind-staging\.pages\.dev\b/g) || [];
  const unique = urls.find(u => /^https:\/\/[0-9a-f]{8}\.prontera-grind-staging\.pages\.dev$/.test(u)) || urls[0];
  assert(unique, 'Could not verify a *.prontera-grind-staging.pages.dev deployment URL in Wrangler output.');
  return unique;
}

async function main() {
  assert.equal(process.platform, 'win32', 'This script is built for your Windows setup.');
  const { repo, sha } = findGitRepo();
  const bash = findGitBash(repo);
  console.log(`1/5 Found verified v283 commit ${sha.slice(0, 8)} in ${repo}`);
  console.log('    Creating clean temporary build folder (your staging folder will NOT be modified)...');

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-stage-v283-'));
  try {
    const archive = path.join(temp, 'tree.tar');
    run('git', ['-C', repo, 'archive', '--format=tar', `--output=${archive}`, sha], { allowOutput: true });
    run('tar.exe', ['-xf', archive, '-C', temp], { allowOutput: true });
    fs.unlinkSync(archive);

    // Force isolated staging-only wrangler.toml (never production).
    fs.writeFileSync(path.join(temp, 'wrangler.toml'), CONFIG, 'utf8');

    console.log('2/5 Building dist/ locally via tools/build_site.sh...');
    run(bash, ['tools/build_site.sh'], { cwd: temp, allowOutput: true });
    assert(
      fs.existsSync(path.join(temp, 'dist', 'assets', 'world-map', 'world-map-cleaned.webp')),
      'dist/ is missing assets/world-map/world-map-cleaned.webp'
    );

    console.log(`3/5 Verifying isolated Cloudflare D1 database (${DB_NAME})...`);
    const info = JSON.parse(wrangler(temp, ['d1', 'info', 'DB', '--json']));
    assert(
      info.uuid === DB_ID && info.name === DB_NAME,
      `Stopped: remote DB did not match ${DB_NAME} (${DB_ID}).`
    );

    console.log('4/5 Checking staging D1 tables...');
    const rawTables = JSON.parse(
      wrangler(temp, ['d1', 'execute', 'DB', '--remote', '--json', '--command', "SELECT name FROM sqlite_master WHERE type='table';"])
    );
    const tableSet = new Set((rawTables.at(-1)?.results || []).map(r => r.name));
    if (!tableSet.has('damage_samples') || !tableSet.has('damage_alerts')) {
      console.log('    Applying additive 0008 damage monitoring tables to pg-staging...');
      wrangler(temp, ['d1', 'execute', 'DB', '--remote', '--json', '--command', DDL_0008]);
    }
    const migrationChecks = [
      ['competition_periods', '0009_competition_settlement.sql'],
      ['competition_baselines', '0010_competition_baseline.sql'],
      ['unverified_echo_config', '0011_unverified_echo_launch.sql'],
      ['friends', '0012_friends.sql'],
    ];
    for (const [table, file] of migrationChecks) {
      if (!tableSet.has(table)) {
        console.log(`    Applying additive ${file} to pg-staging...`);
        wrangler(temp, ['d1', 'execute', 'DB', '--remote', `--file=migrations/${file}`]);
      }
    }

    console.log(`5/5 Deploying dist/ to Cloudflare Pages project "${PROJECT}"...`);
    const deployOut = wrangler(temp, ['pages', 'deploy', 'dist', '--project-name', PROJECT, '--branch', 'main'], { allowOutput: true, combinedOutput: true });
    const uniqueUrl = extractStagingUrl(deployOut);

    console.log('\n============================================================');
    console.log('SUCCESS: haven-v283 deployed to isolated staging!');
    console.log(`  Staging main URL:   https://${PROJECT}.pages.dev`);
    console.log(`  This deploy URL:    ${uniqueUrl}`);
    console.log('  Production touched: NONE (horizonhaven & pg untouched)');
    console.log('============================================================\n');
  } finally {
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('\nSTOP: ' + String(err.message || err));
    process.exitCode = 1;
  });
}
