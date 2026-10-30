// Read-only owner tool for D1 Time Travel. It cannot restore or mutate a database.
// The only remote target is production pg; only D1 info and time-travel info are run.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NAME = 'pg';
const ID = '50a6448b-1f12-466c-a28a-10544bedf750';
const HOUR = 3600000, DAY = 24 * HOUR, OFFSET = 8 * HOUR;
const BOOKMARK = /^[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{32}$/i;
const labels = ['1 hour ago', '6 hours ago', '1 day ago', '2 days ago', '3 days ago', '6 days ago'];
const ages = [HOUR, 6 * HOUR, DAY, 2 * DAY, 3 * DAY, 6 * DAY];

export function validateIdentity(info) {
  assert(info && info.name === NAME && info.uuid === ID, 'Wrong database or identity; stopped.');
  // Wrangler 4.154.0 removes `version` from d1 info --json. If present,
  // reject anything other than production; if absent, readiness requires the
  // actual time-travel info calls below, which Wrangler rejects for alpha D1.
  assert(info.version === undefined || info.version === 'production', 'Unsupported D1 backend; stopped.');
}
export function validateBookmark(result) {
  assert(result && typeof result.bookmark === 'string' && BOOKMARK.test(result.bookmark),
    'Cloudflare did not return a valid Time Travel bookmark.');
  return result.bookmark;
}
export function validateTime(at, now = Date.now()) {
  assert(Number.isSafeInteger(at) && Number.isSafeInteger(now), 'Invalid time.');
  assert(at <= now && at > now - 7 * DAY, 'Choose a past time less than seven days ago.');
  return at;
}
export function parseSingapore(text, now = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(text.trim());
  assert(m, 'Use YYYY-MM-DD HH:MM in Singapore time.');
  const [, y, mo, d, h, mi] = m;
  const at = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:00+08:00`);
  assert(Number.isFinite(at) && new Date(at + OFFSET).toISOString().slice(0,16) === `${y}-${mo}-${d}T${h}:${mi}`,
    'Invalid calendar date or time.');
  return validateTime(at, now);
}
export function singaporeTime(at) {
  return new Date(at + OFFSET).toISOString().slice(0,19).replace('T',' ') + ' SGT (UTC+08:00)';
}
export function options(now = Date.now()) {
  return ages.map((age, i) => ({label:labels[i], at:validateTime(now - age, now)}));
}
export function checkReadiness(remote, now = Date.now()) {
  validateIdentity(remote.info());
  const current = validateBookmark(remote.bookmark());
  const sixDays = validateBookmark(remote.bookmark(new Date(now - 6 * DAY).toISOString()));
  return {current, sixDays};
}
export function inspect(remote, at, now = Date.now()) {
  // All remote calls are fixed read-only operations. Do not add restore here.
  validateTime(at, now);
  validateIdentity(remote.info());
  const bookmark = validateBookmark(remote.bookmark(new Date(at).toISOString()));
  return {database: NAME, selectedTime: singaporeTime(at), utcTime: new Date(at).toISOString(), bookmark};
}

function run(command, args, cwd) {
  const p = spawnSync(command, args, {cwd, encoding:'utf8', timeout:120000, maxBuffer:2*1024*1024,
    env:{...process.env, WRANGLER_SEND_METRICS:'false', CI:'true'}});
  if (p.error || p.status !== 0) throw Error('Cloudflare check failed or timed out. Check Wrangler login and database access; no database changes were made.');
  return p.stdout;
}
function npxCli() {
  let found = [];
  if (process.platform === 'win32') found = run('where.exe',['npx.cmd'],process.cwd()).split(/\r?\n/).filter(Boolean);
  const dirs = [path.dirname(process.execPath), ...found.map(x => path.dirname(x.trim()))];
  const cli = dirs.flatMap(d => [path.join(d,'node_modules','npm','bin','npx-cli.js'),
    path.resolve(d,'..','lib','node_modules','npm','bin','npx-cli.js')]).find(p => fs.existsSync(p));
  assert(cli, 'Could not locate npm npx-cli.js.'); return cli;
}
function createRemote(temp) {
  fs.writeFileSync(path.join(temp,'wrangler.jsonc'), JSON.stringify({name:'pg-readonly-recovery',
    compatibility_date:'2026-10-01', d1_databases:[{binding:'DB',database_name:NAME,database_id:ID}]}));
  const cli = npxCli();
  function json(args) {
    try { return JSON.parse(run(process.execPath,[cli,'--yes','wrangler@4.154.0',...args,'--config','wrangler.jsonc'],temp)); }
    catch { throw Error('Cloudflare read-only check failed. Confirm Wrangler login, access and Time Travel availability.'); }
  }
  return {info:()=>json(['d1','info','DB','--json']),
    bookmark:timestamp=>json(['d1','time-travel','info','DB',...(timestamp?['--timestamp',timestamp]:[]),'--json'])};
}
async function main() {
  assert(process.platform === 'win32', 'This owner tool is for the Windows setup.');
  assert(process.argv.length <= 3 && (!process.argv[2] || process.argv[2] === '--check'), 'Use no arguments or --check.');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'pg-recovery-readonly-'));
  try {
    const remote = createRemote(temp);
    console.log('Checking production pg identity and Time Travel. Read-only: no restore or backup is performed.');
    checkReadiness(remote);
    console.log('PASS: pg identity confirmed; Cloudflare Time Travel returned current and six-day-old bookmarks.');
    console.log('This does not prove the full seven-day window or your plan.');
    if (process.argv[2] === '--check') return;
    assert(process.stdin.isTTY && process.stdout.isTTY, 'Run in an interactive PowerShell window.');
    const rl = readline.createInterface({input:process.stdin, output:process.stdout});
    try {
      const choices = options();
      console.log('\nSelect a point in Singapore time; this only looks it up, it does NOT restore.');
      choices.forEach((o,i)=>console.log(`${i+1}. ${o.label} — ${singaporeTime(o.at)}`));
      console.log('7. Enter a specific date and time\n0. Cancel');
      const answer = (await rl.question('Choice: ')).trim();
      if (answer === '0') { console.log('Cancelled; no database changes.'); return; }
      let at;
      if (answer === '7') at = parseSingapore(await rl.question('Singapore time (YYYY-MM-DD HH:MM): '));
      else { assert(/^[1-6]$/.test(answer), 'Invalid selection; no database changes.'); at = choices[Number(answer)-1].at; }
      const result = inspect(remote,at);
      console.log('\nSelected restore point (NOT RESTORED):');
      console.log(`Database: ${result.database}\nTime: ${result.selectedTime}\nUTC: ${result.utcTime}\nBookmark: ${result.bookmark}`);
      console.log('Cloudflare returned this bookmark; the historical data and compatibility have NOT been checked.');
      console.log('Do not restore until writes are independently paused, a fresh emergency backup is verified, and a recovery plan is reviewed.');
      console.log('Whole-database restore can lose newer player progress and does not restore code or social data.');
    } finally { rl.close(); }
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(e => {console.error('STOP: '+String(e.message||'Recovery check failed.'));process.exitCode=1;});
