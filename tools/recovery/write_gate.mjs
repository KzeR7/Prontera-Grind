// Owner-run control for the write pause (workers/gate/, /api/gate).
//
//   node tools/recovery/write_gate.mjs status
//   node tools/recovery/write_gate.mjs audit
//   node tools/recovery/write_gate.mjs close "CLOSE WRITES" --reason "restore to 12:00 SGT" [--wait]
//   node tools/recovery/write_gate.mjs seal  "SEAL WRITES"
//   node tools/recovery/write_gate.mjs open  "OPEN WRITES"
//
// WHY A CLI: during a recovery the database may be exactly what is wrong, so the switch must not
// depend on signing in, on a session row, or on the D1 database. This tool talks to one fixed
// production URL, sends one secret header, and prints only the switch's own state.
//
// SETUP (once, on the owner's Windows machine):
//   $env:PG_GATE_TOKEN = "<the same value you stored with: npx wrangler secret put GATE_TOKEN>"
// The token is read from the environment, never from an argument (arguments are saved in shell
// history and shown in `ps`), never written to a file, and never printed — including in errors.
//
// The phrases are deliberate friction. `close` stops every player's writes immediately; `open` lets
// writes back in, and must never be run while a restore is in progress. `seal` is what declares the
// gate quiet enough to restore; it refuses until the switch reports the pause has drained.
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const DEFAULT_URL = 'https://prontera-grind.pages.dev/api/gate';
export const TOKEN_ENV = 'PG_GATE_TOKEN';
export const TOKEN_MIN = 32;
export const PHRASES = { close: 'CLOSE WRITES', seal: 'SEAL WRITES', open: 'OPEN WRITES' };
const POLL_MS = 5000;
const WAIT_MS = 180000;

export class Stop extends Error {}

// One fixed, encrypted target. Staging may be named explicitly with PG_GATE_URL, but nothing else:
// a typo must not be able to aim an `open` at an unrelated host.
export function targetUrl(env = {}) {
  const raw = String(env.PG_GATE_URL || DEFAULT_URL).trim();
  let url;
  try { url = new URL(raw); } catch { throw new Stop('PG_GATE_URL is not a URL.'); }
  if (url.protocol !== 'https:') throw new Stop('The write pause is only controlled over https.');
  const host = url.hostname.toLowerCase();
  // Production and the separately named staging project (plus staging's own preview hostnames).
  // Production preview deployments are deliberately NOT allowed: their API is disabled anyway.
  const allowed = host === 'prontera-grind.pages.dev' || host === 'prontera-grind-staging.pages.dev'
    || /^[a-z0-9-]+\.prontera-grind-staging\.pages\.dev$/.test(host);
  if (!allowed) throw new Stop('Refusing that host: use prontera-grind.pages.dev or the isolated staging project.');
  if (url.pathname !== '/api/gate') throw new Stop('Refusing that path: the switch lives at /api/gate.');
  return url.toString();
}

export function tokenFrom(env = {}) {
  const token = String(env[TOKEN_ENV] || '');
  if (!token) throw new Stop(`Set ${TOKEN_ENV} first (a PowerShell environment variable, not an argument).`);
  if (token.length < TOKEN_MIN) throw new Stop(`${TOKEN_ENV} is shorter than ${TOKEN_MIN} characters; the switch refuses it too.`);
  return token;
}

export function parseArgs(argv) {
  const [command, phrase, ...rest] = argv;
  if (phrase !== undefined && !PHRASES[command]) throw new Stop(`${command || 'That'} command takes no phrase.`);
  const options = { wait: false, reason: '' };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--wait') options.wait = true;
    else if (rest[i] === '--reason') options.reason = String(rest[i + 1] || ''), i++;
    else if (rest[i].startsWith('--reason=')) options.reason = rest[i].slice('--reason='.length);
    else throw new Stop(`Unknown argument: ${rest[i]}`);
  }
  return { command, phrase, options };
}

const short = ms => Number(ms) > 0 ? `${Math.round(Number(ms) / 1000)}s` : 'never';

// Only fields this tool knows by name are printed. A compromised or mistaken endpoint cannot make the
// tool echo the token, and neither can an error body.
export function summary(status = {}) {
  const drain = status.drain || {};
  return [
    `state:          ${status.state ?? 'unknown'}`,
    `reason:         ${status.reason || '-'}`,
    `epoch:          ${status.epoch ?? '-'}  (a new epoch starts the first time writes reopen)`,
    `changed:        ${status.changedAt ? new Date(Number(status.changedAt)).toISOString() : 'never'}`,
    `writes open:    ${status.open === true ? 'YES' : 'no'}`,
    `safe to restore:${status.safeToRestore === true ? ' YES' : ' NO'}`,
    `in flight:      ${drain.liveLeases ?? '-'} lease(s), quiet for ${short(drain.quietMs)} of ${short(drain.requiredMs)}`,
  ].join('\n');
}

export function auditLines(list = []) {
  if (!list.length) return '  (no recorded transitions)';
  return list.map(x => `  ${new Date(Number(x.at) || 0).toISOString()}  ${String(x.action || '?').padEnd(6)} -> ${x.state || '?'} (epoch ${x.epoch ?? '?'})  ${x.actor || 'owner'}${x.reason ? ' · ' + x.reason : ''}`).join('\n');
}

async function call({ url, token, action, body, fetchImpl }) {
  const readOnly = action === 'status' || action === 'audit';
  const init = readOnly
    ? { method: 'GET', headers: { 'X-Recovery-Token': token, Accept: 'application/json' } }
    : {
      method: 'POST',
      headers: { 'X-Recovery-Token': token, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body || {}),
    };
  const target = readOnly && action === 'audit' ? url + '?action=audit' : url;
  let response;
  try { response = await fetchImpl(target, init); }
  catch (e) { throw new Stop('The server did not answer. Check the connection; the switch state is UNKNOWN.'); }
  let data = {};
  try { data = await response.json(); } catch {}
  return { ok: response.ok, status: response.status, data };
}

const failure = (r) => {
  const code = r.data && (r.data.error || r.data.err) || `HTTP ${r.status}`;
  if (r.status === 404) return `Refused (${code}). The token is wrong or the switch is not deployed; nothing changed.`;
  if (r.status === 429) return `Locked out after repeated wrong tokens (${code}). Wait, then check ${TOKEN_ENV}.`;
  if (code === 'not-drained') return `Refused (not-drained): ${r.data.drain?.liveLeases ?? '?'} request(s) still in flight or the quiet window has not passed. Run status again; do not restore yet.`;
  if (code === 'confirm-required') return `Refused: the confirmation phrase must be exactly "${r.data.confirm}".`;
  if (code === 'not-closing') return `Refused: the pause has not been started (state ${r.data.state || '?'}). Run close first.`;
  if (code === 'not-configured') return 'The switch has no GATE_TOKEN secret; set it, then retry. Nothing changed.';
  return `Refused (${code}). Nothing changed.`;
};

// Returns the process exit code; prints through `print` so the suite can read it and prove the token
// never appears in the output.
export async function run(argv, { env = process.env, fetchImpl = fetch, print = console.log, sleep = ms => new Promise(r => setTimeout(r, ms)), now = Date.now } = {}) {
  try {
    const { command, phrase, options } = parseArgs(argv);
    if (!command || !['status', 'audit', 'close', 'seal', 'open', 'help'].includes(command)) {
      print('Usage: write_gate.mjs status|audit|close "CLOSE WRITES"|seal "SEAL WRITES"|open "OPEN WRITES" [--reason text] [--wait]');
      return command ? 1 : 0;
    }
    if (command === 'help') { print('See docs/RECOVERY.md § Write pause.'); return 0; }
    if (PHRASES[command] && String(phrase || '').trim() !== PHRASES[command])
      throw new Stop(`The ${command} phrase must be typed exactly: ${command} "${PHRASES[command]}"`);
    const url = targetUrl(env);
    const token = tokenFrom(env);

    const result = await call({ url, token, action: command, body: { confirm: phrase, reason: options.reason }, fetchImpl });
    if (!result.ok) { print(failure(result)); return 1; }

    if (command === 'audit') { print(auditLines(result.data.audit)); return 0; }
    print(summary(result.data));
    if (result.data.audit) print('\nrecent transitions:\n' + auditLines(result.data.audit));

    if (command === 'close' && options.wait) {
      const deadline = now() + WAIT_MS;
      let last = result.data;
      while (!last.safeToRestore && now() < deadline) {
        await sleep(POLL_MS);
        const poll = await call({ url, token, action: 'status', fetchImpl });
        if (!poll.ok) { print(failure(poll)); return 1; }
        last = poll.data;
        print(`\nwaiting… in flight: ${last.drain?.liveLeases ?? '?'}, quiet for ${short(last.drain?.quietMs)}`);
      }
      if (!last.safeToRestore) { print('\nStill not quiet. Do not restore; run status again in a minute.'); return 1; }
      print('\nThe pause has drained. Seal it before taking the backup or restoring:');
      print(`  node tools/recovery/write_gate.mjs seal "${PHRASES.seal}"`);
      return 0;
    }
    if (command === 'close') {
      print('\nNothing is admitted now. Wait for it to drain, then seal it:');
      print(`  node tools/recovery/write_gate.mjs seal "${PHRASES.seal}"`);
    }
    if (command === 'seal') print('\nSealed. Take the fresh private backup, then the owner-approved restore. Do not open writes until the post-restore checks pass.');
    if (command === 'open') print('\nWrites are open again. Every tab must reload: a tab that synced before the pause still holds the older copy.');
    return 0;
  } catch (e) {
    print('STOP: ' + String(e && e.message ? e.message : e));
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  run(process.argv.slice(2)).then(code => { process.exitCode = code; });
