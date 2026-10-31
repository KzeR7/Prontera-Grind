// Owner-run preflight reset. Default/local mode is a dry run unless --apply is present.
// Remote mode targets ONLY the existing production pg name + UUID, after the separate
// write gate has been closed, drained and sealed. It never reopens the gate.
//
//   node tools/recovery/prelaunch_reset.mjs --local tools/.devdb/preview.sqlite
//   node tools/recovery/prelaunch_reset.mjs --local tools/.devdb/preview.sqlite --apply --confirm "RESET GAMEPLAY KEEP LOGINS"
//   node tools/recovery/prelaunch_reset.mjs --remote --apply --confirm "RESET GAMEPLAY KEEP LOGINS"
//
// Remote authentication stays in the owner's Wrangler login. PG_GATE_TOKEN is read
// from the environment, never an argument, file, report or chat message.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DB_NAME, DB_ID, verifyInfo, npxCli } from '../staging/live_backup_preflight.mjs';
import { DEFAULT_URL, tokenFrom } from './write_gate.mjs';
import { CONFIRM, ACCOUNT_SQL, CHECK_SQL, assertResetSchema, assertResetSql, captureState,
  buildResetSql, applyReset, restoreBackup, runRemoteCheck, runRemoteReset } from './launch_reset_core.mjs';

const USAGE = `Usage:
  node tools/recovery/prelaunch_reset.mjs --local PATH                     (dry run; original untouched)
  node tools/recovery/prelaunch_reset.mjs --local PATH --apply --confirm "${CONFIRM}"
  node tools/recovery/prelaunch_reset.mjs --remote --check                 (read-only remote verification; no export/import/reset)
  node tools/recovery/prelaunch_reset.mjs --remote --apply --confirm "${CONFIRM}"

Keeps usernames, passwords, recovery codes, emails, roles, bans, purchase records,
webhook receipts and cosmetic ownership. Resets gameplay, rankings, rewards, mail,
diagnostics and sessions. Everyone must sign in again. Purchased supplies already
in a character's inventory are gameplay and reset with it; ownership does not.
Refuses unclaimed Cash Shop grants so paid supplies are not erased from the mail queue.
Remote modes require a sealed write gate and PG_GATE_TOKEN in the environment.
Read docs/PRELAUNCH-RESET.md before using --remote. No mode reopens writes.`;

export function parseArgs(argv) {
  const options = { local: null, remote: false, apply: false, check: false, confirm: '', help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help') options.help = true;
    else if (arg === '--remote') options.remote = true;
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--check') options.check = true;
    else if (arg === '--local' && argv[i + 1] && !argv[i + 1].startsWith('--')) options.local = argv[++i];
    else if (arg === '--confirm' && argv[i + 1] && !argv[i + 1].startsWith('--')) options.confirm = argv[++i];
    else throw Error('Unknown or incomplete argument. Use --help; no operation was performed.');
  }
  assert(!(options.remote && options.local), 'Choose local or remote, not both');
  assert(!options.check || options.remote, '--check is a read-only remote mode');
  assert(options.help || options.remote || options.local, 'Choose --local PATH or --remote');
  assert(!(options.check && options.apply), 'Choose read-only --check or destructive --apply, not both');
  assert(!options.remote || options.apply || options.check, 'Remote mode requires --apply with the exact confirmation, or read-only --check');
  if (options.apply) assert.equal(options.confirm, CONFIRM, 'Exact confirmation required');
  return options;
}
function privateFile(folder, name) {
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, name);
  // Never overwrite an earlier emergency snapshot.
  assert(!fs.existsSync(file), 'Backup filename already exists; stop rather than overwrite');
  return file;
}
const stamp = () => new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14) + '-' + randomBytes(4).toString('hex');
const backupFolder = () => path.join(os.homedir(), 'Desktop', 'HH Save');
function validateSqliteFile(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    assertResetSchema(db);
  } finally { db.close(); }
}
export async function runLocal(file, { apply = false, confirm, report = console.log, folder = backupFolder() } = {}) {
  assert(fs.existsSync(file), 'Local SQLite file does not exist');
  assert(path.resolve(file) !== path.resolve(DB_NAME), 'Use a filesystem path');
  const db = new DatabaseSync(file);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-launch-reset-local-'));
  try {
    db.exec('PRAGMA foreign_keys=ON');
    const before = captureState(db);
    if (!apply) {
      const copy = path.join(temp, 'rehearsal.sqlite');
      await backup(db, copy);
      const rehearsal = new DatabaseSync(copy);
      try {
        const result = applyReset(rehearsal, { confirm: CONFIRM });
        report({ mode: 'dry-run', originalUnchanged: true, accounts: result.after.accounts,
          preserves: result.preserved, clears: result.cleared, fingerprintBefore: before.accounts.fingerprint,
          fingerprintAfter: result.after.fingerprint });
        return result;
      } finally { rehearsal.close(); }
    }
    const saved = privateFile(folder, 'pg-before-gameplay-reset-' + stamp() + '.sqlite');
    await backup(db, saved);
    validateSqliteFile(saved);
    const result = applyReset(db, { confirm });
    report({ mode: 'applied-local', backupFile: saved, accounts: result.after.accounts,
      preserves: result.preserved, clears: result.cleared, writesOpen: 'local server control is yours; stop it before resetting' });
    return { ...result, backupFile: saved };
  } finally { db.close(); fs.rmSync(temp, { recursive: true, force: true }); }
}

// Wrangler/npm can print notices around the JSON payload. Accept a balanced JSON
// object/array only; never guess from partial or non-JSON output.
export function parseWranglerJson(stdout) {
  const text = String(stdout ?? '');
  try { return JSON.parse(text); } catch {}
  for (let start = 0; start < text.length; start++) {
    const open = text[start];
    if (open !== '{' && open !== '[') continue;
    const close = open === '{' ? '}' : ']';
    let depth = 0, inString = false, escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escape) escape = false;
        else if (ch.charCodeAt(0) === 92) escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(text.slice(start, i + 1)); } catch { break; }
        }
      }
    }
  }
  throw Error('no verified JSON');
}

// A separate fixed-target driver keeps live_backup_preflight.mjs read-only.
export function createResetRemote(temp, { execute } = {}) {
  fs.writeFileSync(path.join(temp, 'wrangler.jsonc'), JSON.stringify({
    name: 'pg-preflight-reset', compatibility_date: '2026-10-01',
    d1_databases: [{ binding: 'DB', database_name: DB_NAME, database_id: DB_ID }],
  }, null, 2));
  const cli = execute ? null : npxCli();
  const run = args => {
    if (execute) return execute(args);
    const result = spawnSync(process.execPath, [cli, '--yes', 'wrangler@4.154.0', ...args, '--config', 'wrangler.jsonc'], {
      cwd: temp, encoding: 'utf8', timeout: 600000, maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' },
    });
    if (result.error || result.status !== 0) {
      const reason = result.error?.code === 'ETIMEDOUT' ? 'timed out' : `failed (exit ${result.status ?? 'unknown'})`;
      throw Error(`Wrangler ${args[1]} ${reason}. Keep writes sealed; inspect before any retry. Raw output was not printed.`);
    }
    return result.stdout;
  };
  const json = (args, label) => {
    const output = run(args);
    try { return parseWranglerJson(output); }
    catch { throw Error(`Fixed database ${label} returned no verified JSON (${String(output ?? '').length} stdout chars); keep writes sealed`); }
  };
  const rows = (sql, label = 'verification query') => {
    assert(sql === ACCOUNT_SQL || sql === CHECK_SQL, 'Only fixed read-only verification queries are allowed');
    // npm exec runs through cmd.exe on Windows. Newlines in an argument can be
    // interpreted by that shell before Wrangler sees them. These two fixed SQL
    // constants contain no comments or multiline string literals, so collapsing
    // whitespace is lossless and keeps the command a single shell argument.
    const command = sql.replace(/\s+/g, ' ').trim();
    assert(!/[\r\n]/.test(command), 'Remote verification SQL must be one line');
    const result = json(['d1', 'execute', DB_NAME, '--remote', '--json', '--command', command], label);
    assert(Array.isArray(result) && result.every(r => r.success === true), `Database ${label} failed`);
    return result.at(-1).results || [];
  };
  return {
    // Use the fixed database name, not the Pages binding. Some Wrangler versions
    // resolve `d1 info` by name only; the UUID in wrangler.jsonc still pins the target.
    verify() { assert(verifyInfo(json(['d1', 'info', DB_NAME, '--json'], 'identity query')), 'Fixed production database identity mismatch'); },
    export() {
      run(['d1', 'export', DB_NAME, '--remote', '--skip-confirmation', '--output=private-backup.sql']);
      const file = path.join(temp, 'private-backup.sql');
      assert(fs.statSync(file).size > 0, 'Remote backup is empty');
      return file;
    },
    accounts: (label = 'account verification') => rows(ACCOUNT_SQL, label),
    checks: async (label = 'gameplay verification') => { const result = rows(CHECK_SQL, label); assert.equal(result.length, 1, `Database ${label} returned no row`); return result[0]; },
    importReset(file, expectedSql) {
      assert.equal(fs.readFileSync(file, 'utf8'), expectedSql, 'Reset file changed after rehearsal');
      assertResetSql(expectedSql);
      // Pinned Wrangler 4.154.0 uses D1's atomic file-import endpoint for --file.
      // `d1 execute` uses --yes; --skip-confirmation is only valid on `d1 export`.
      // Do not replace this with per-statement --command calls or retry on timeout.
      run(['d1', 'execute', DB_NAME, '--remote', '--yes', '--file', file]);
    },
  };
}
export function createGate(token, fetchImpl = fetch) {
  assert.equal(typeof token, 'string');
  assert(token.length >= 32, 'Gate token is missing or too short');
  return { async status() {
    const response = await fetchImpl(DEFAULT_URL, { headers: { 'X-Recovery-Token': token, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Cannot confirm the write gate; keep writes closed');
    return response.json();
  } };
}
async function remoteMain({ confirm, check = false }) {
  assert.equal(process.platform, 'win32', 'The fixed remote tool is for the owner Windows setup');
  const token = tokenFrom(process.env), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-preflight-reset-'));
  try {
    if (check) {
      const result = await runRemoteCheck({
        db: createResetRemote(temp), gate: createGate(token),
        report: value => console.log(JSON.stringify(value, null, 2)),
      });
      console.log('PASS: read-only remote reset checks; no export, import or reset performed. Writes remain SEALED.');
      return result;
    }
    const result = await runRemoteReset({
      db: createResetRemote(temp), gate: createGate(token), confirm,
      copyBackup(source) {
        const dest = privateFile(backupFolder(), 'pg-before-gameplay-reset-' + stamp() + '.sql');
        fs.copyFileSync(source, dest, fs.constants.COPYFILE_EXCL); return dest;
      },
      writeSql(sql) { const file = path.join(temp, 'reset.sql'); fs.writeFileSync(file, sql, { mode: 0o600 }); return file; },
      report: value => console.log(JSON.stringify(value, null, 2)),
    });
    console.log('PASS: gameplay reset verified; all account credentials and shop records kept. Writes remain SEALED.');
    console.log('Next: sign-in/schema checks in the runbook, then explicitly reopen with write_gate.mjs. Everyone must sign in again.');
    return result;
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(USAGE); return; }
  if (options.local) await runLocal(path.resolve(options.local), options);
  else await remoteMain(options);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { console.error('STOP: ' + String(error.message || 'Reset stopped.')); console.error(USAGE); process.exitCode = 1; });
