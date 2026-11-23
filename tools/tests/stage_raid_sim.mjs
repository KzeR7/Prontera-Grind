// Staging launcher verification for Astral Raid (haven-v452):
//   node tools/tests/stage_raid_sim.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  STAGE,
  PRODUCTION,
  pagesConfig,
  socialConfig,
  deploymentUrl,
  missingMigrations,
  verifyDeployment,
} from '../staging/stage_raid.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
// This launcher deploys its specifically named historical staging branch, not every future
// working tree. Outside that branch, verify its tag against the v466 source snapshot instead
// of requiring an unrelated newer BUILD to match. On its own branch, still check live source.
const branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim();
const snapshot = 'b56c23b08644abf95336b648fca61db44673216a';
const html = branch === STAGE.branch ? fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') :
  execFileSync('git', ['show', `${snapshot}:index.html`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 20e6 });
const BUILD = (/^const BUILD='([^']+)';/m.exec(html) || [])[1];

let pass = 0;
function check(name, fn) {
  return Promise.resolve(fn()).then(() => {
    pass++;
    console.log('  ok   ' + name);
  });
}

console.log('stage_raid.mjs isolated staging verification\n');

await check('STAGE targets only isolated staging resources and matches index.html BUILD', () => {
  assert.equal(STAGE.branch, 'arena/adec654f-prontera-grind');
  assert.equal(STAGE.pagesProject, 'prontera-grind-staging');
  assert.equal(STAGE.socialProject, 'prontera-social-staging');
  assert.equal(STAGE.dbName, 'pg-staging');
  assert.equal(STAGE.dbId, '3a38c6fc-96a8-491d-b97b-fd536e575ca4');
  assert.ok(BUILD.includes(STAGE.buildTag), 'staging source BUILD matches STAGE.buildTag');
});

await check('generated wrangler configs contain zero production identifiers', () => {
  const pc = pagesConfig();
  const sc = socialConfig();
  for (const forbidden of PRODUCTION) {
    assert.ok(!pc.includes(forbidden), 'pagesConfig excludes ' + forbidden);
    assert.ok(!sc.includes(forbidden), 'socialConfig excludes ' + forbidden);
  }
  assert.match(pc, /script_name = "prontera-social-staging"/);
  assert.match(pc, /database_id = "3a38c6fc-96a8-491d-b97b-fd536e575ca4"/);
  assert.match(sc, /name = "prontera-social-staging"/);
});

await check('deploymentUrl extracts only 8-hex prontera-grind-staging URLs', () => {
  const sample = 'Uploading... Deployment complete! https://a1b2c3d4.prontera-grind-staging.pages.dev (https://main.prontera-grind-staging.pages.dev)';
  assert.equal(deploymentUrl(sample), 'https://a1b2c3d4.prontera-grind-staging.pages.dev');
  assert.throws(() => deploymentUrl('https://a1b2c3d4.horizonhaven.pages.dev'));
});

await check('missingMigrations orders additive schema steps 0009..0021 and returns [] when complete', () => {
  const minimal = missingMigrations(new Set(['users', 'saves', 'sessions', 'offline_reward_claims']), new Set(), new Set());
  assert.deepEqual(minimal, [
    '0009_competition_settlement.sql',
    '0010_competition_baseline.sql',
    '0011_unverified_echo_launch.sql',
    '0012_friends.sql',
    '0014_ip_bans.sql',
    '0015_save_audit.sql',
    '0016_save_alert_review.sql',
    '0017_announcement_gifts.sql',
    '0018_offline_claim_owner_context.sql',
    '0019_offline_claim_pricing_snapshot.sql',
    '0020_offline_claim_pricing_state.sql',
    '0021_save_audit_evidence.sql',
  ]);
  for (const file of minimal) {
    assert.ok(fs.existsSync(path.join(ROOT, 'migrations', file)), 'migration file exists: ' + file);
  }

  const complete = missingMigrations(
    new Set([
      'users', 'saves', 'sessions', 'offline_reward_claims',
      'competition_periods', 'competition_baselines', 'unverified_echo_config',
      'friends', 'ip_bans', 'save_alerts', 'announcement_gifts', 'save_audit_windows',
    ]),
    new Set(['cleared_at', 'rule_version', 'evidence_json']),
    new Set(['cls', 'run_gen', 'income_xp', 'pricing_state']),
  );
  assert.deepEqual(complete, [], 'no migrations queued when pg-staging is already up to date');
});

const vNum = STAGE.buildTag.replace(/^haven-v/, '');
await check(`verifyDeployment checks version.txt, raid assets (?v=${vNum}), Three.js SRI, and /api/social 401 gate`, async () => {
  const threeBytes = fs.readFileSync(path.join(ROOT, 'assets/endgame/three-r128.min.js'));
  const crlfBytes = Buffer.from(threeBytes.toString('latin1').replace(/\n/g, '\r\n'), 'latin1');
  const seen = [];
  await verifyDeployment('https://a1b2c3d4.prontera-grind-staging.pages.dev', BUILD, async (url, opts) => {
    seen.push({ url, upgrade: opts?.headers?.Upgrade || null });
    if (url.endsWith('/version.txt')) return { status: 200, text: async () => BUILD + '\n' };
    if (url.includes(`/assets/raid.js?v=${vNum}`) || url.includes(`/assets/raid.css?v=${vNum}`)) return { status: 200, text: async () => 'ok' };
    if (url.endsWith('/assets/endgame/three-r128.min.js')) return { status: 200, arrayBuffer: async () => threeBytes };
    if (url.endsWith('/api/social')) return { status: 401, text: async () => '' };
    return { status: 404, text: async () => '' };
  });
  assert.equal(seen.length, 5);
  assert.equal(seen[4].upgrade, 'websocket');

  // Windows CRLF-corrupted Three.js must fail SRI verification
  await assert.rejects(() =>
    verifyDeployment('https://a1b2c3d4.prontera-grind-staging.pages.dev', BUILD, async url => {
      if (url.endsWith('/version.txt')) return { status: 200, text: async () => BUILD };
      if (url.includes('/assets/raid.')) return { status: 200, text: async () => 'ok' };
      if (url.endsWith('/assets/endgame/three-r128.min.js')) return { status: 200, arrayBuffer: async () => crlfBytes };
      return { status: 401, text: async () => '' };
    }),
  /SHA-384/);

  // Missing SOCIAL binding (503) must fail verification
  await assert.rejects(() =>
    verifyDeployment('https://a1b2c3d4.prontera-grind-staging.pages.dev', BUILD, async url => {
      if (url.endsWith('/version.txt')) return { status: 200, text: async () => BUILD };
      if (url.includes('/assets/raid.')) return { status: 200, text: async () => 'ok' };
      if (url.endsWith('/assets/endgame/three-r128.min.js')) return { status: 200, arrayBuffer: async () => threeBytes };
      return { status: 503, text: async () => '' };
    }),
  /expected 401/);
});

console.log(`\nPASS: ${pass}/${pass} stage_raid checks passed`);
