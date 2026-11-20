#!/usr/bin/env node
// Rift Raid staging preflight. This command NEVER deploys and NEVER writes production.
//
// Required:
//   RIFT_STAGE_BASE       e.g. https://prontera-grind-staging.pages.dev
//   RIFT_STAGE_DB         D1 database name (default pg-staging)
//   BASE_SCHEMA           the migration set already applied to staging (hard stop if absent)
// Optional:
//   CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID   for `wrangler d1 execute --remote`
//
// It checks:
//   1. /version.txt is exactly this checkout's BUILD label;
//   2. /api/chatcheck answers {ok:true,http:426} (the Social room is reachable);
//   3. this checkout contains both raid migrations, 0022 and 0023, and no v411 label;
//   4. with credentials, the staging D1 has the raid tables, card tables, triggers and grants.ref.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const build = (html.match(/const BUILD='([^']+)'/) || [])[1] || '';
const base = String(process.env.RIFT_STAGE_BASE || '').replace(/\/+$/, '');
const dbName = process.env.RIFT_STAGE_DB || 'pg-staging';
const baseSchema = String(process.env.BASE_SCHEMA || '').trim();
const migrations = ['0022_player_character_raid.sql', '0023_raid_cards.sql'];
const applied = fs.readdirSync(path.join(root, 'migrations')).filter(n => /^\d+_.*\.sql$/.test(n)).sort();

const failures = [];
const ok = message => console.log('  ok   ' + message);
const bad = message => { console.log('  FAIL ' + message); failures.push(message); };

console.log('Rift Raid staging preflight (no deploy)\n');
if (!build) bad('index.html has no const BUILD');
else if (!build.includes('haven-v447')) bad('BUILD must be the new haven-v447 staging candidate, got: ' + build);
else ok('build label: ' + build);
if (!base) bad('RIFT_STAGE_BASE is required');
if (!baseSchema) bad('BASE_SCHEMA is required (the migration set already applied to staging)');
else ok('base schema: ' + baseSchema);
if (applied.some(n => /^0018_.*raid/i.test(n))) bad('the old 0018 raid slot must not exist');
for (const migration of migrations) {
  if (!applied.includes(migration)) bad('missing ' + migration);
}
if (migrations.every(migration => applied.includes(migration))) ok('raid migrations present: ' + migrations.join(' + '));
if (applied.some(n => n.includes('v411'))) bad('a v411 build/migration file leaked into this checkout');
if (/const BUILD='[^']*v411/.test(html)) bad('index.html still carries the v411 build label');

if (base) {
  try {
    const version = await (await fetch(base + '/version.txt', { cache: 'no-store' })).text();
    if (version.trim() !== build) bad('/version.txt is ' + JSON.stringify(version.trim()) + ', expected ' + JSON.stringify(build));
    else ok('/version.txt matches this checkout');
  } catch (e) { bad('/version.txt fetch failed: ' + e.message); }
  try {
    const response = await fetch(base + '/api/chatcheck', { cache: 'no-store' });
    const body = await response.json().catch(() => null);
    if (!body || body.ok !== true || body.http !== 426) bad('/api/chatcheck did not answer {ok:true,http:426}: ' + JSON.stringify(body));
    else ok('/api/chatcheck reaches the Social room');
  } catch (e) { bad('/api/chatcheck fetch failed: ' + e.message); }
}

if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
  const query = async sql => {
    const output = execFileSync('npx', ['wrangler@4', 'd1', 'execute', dbName, '--remote', '--json', '--command', sql], {
      cwd: root, encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(output);
    return parsed?.[0]?.results || [];
  };
  try {
    const tables = await query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'raid_%' ORDER BY name");
    const names = new Set(tables.map(r => r.name));
    for (const name of ['raid_accounts', 'raid_runs', 'raid_run_members', 'raid_entries', 'raid_settlements', 'raid_chests', 'raid_reward_ledger', 'raid_cards', 'raid_card_drops']) {
      if (!names.has(name)) bad('D1 is missing table ' + name);
    }
    if (names.has('raid_runs')) ok('D1 has the raid tables');
    const cols = await query('PRAGMA table_info(grants)');
    if (!cols.some(c => c.name === 'ref')) bad('D1 grants table has no ref column');
    else ok('D1 grants.ref exists');
    const triggers = await query("SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('raid_entry_daily_limit','raid_entry_active_limit','raid_reward_apply','raid_card_drop_apply')");
    if (triggers.length !== 4) bad('D1 is missing one of the raid triggers');
    else ok('D1 has the raid entry/reward triggers');
  } catch (e) {
    bad('D1 preflight failed: ' + (e.stderr || e.message || e));
  }
} else {
  console.log('  ..   D1 schema check skipped (set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID)');
}

console.log('\n' + (failures.length ? failures.length + ' preflight failure(s); staging was not touched.' : 'staging preflight passed; deploy remains a separate reviewable step.'));
process.exit(failures.length ? 1 : 0);
