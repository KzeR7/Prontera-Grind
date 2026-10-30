// The owner's recovery CLI (tools/recovery/write_gate.mjs) against a stubbed fetch.
//   node tools/tests/write_gate_cli_sim.mjs
//
// The rules this pins: one fixed https target, the token comes from the environment only and never
// appears in the output, every state change needs its typed phrase, and a refusal (wrong token, not
// drained, switch missing) exits non-zero without pretending anything happened.
import assert from 'node:assert/strict';
import { DEFAULT_URL, PHRASES, TOKEN_ENV, parseArgs, run, targetUrl, tokenFrom } from '../recovery/write_gate.mjs';

const TOKEN = 'z'.repeat(48);
let pass = 0;
const T = async (n, fn) => { await fn(); console.log('  ok   ' + n); pass++; };

function harness(answers, { env = {} } = {}) {
  const out = [];
  const calls = [];
  const queue = [...answers];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const answer = typeof queue[0] === 'function' ? queue.shift()(calls) : queue.shift();
    return new Response(JSON.stringify((answer && answer.body) ?? {}), { status: (answer && answer.status) || 200 });
  };
  const print = line => out.push(String(line));
  return {
    out, calls, text: () => out.join('\n'),
    exec: (argv, overrides = {}) => run(argv, {
      env: { [TOKEN_ENV]: TOKEN, ...env, ...overrides.env },
      fetchImpl: overrides.fetchImpl || fetchImpl,
      print,
      sleep: async () => {},
      now: overrides.now || (() => 0),
    }),
  };
}
const status = (extra = {}) => ({ body: { state: 'closed', reason: 'drill', epoch: 4, changedAt: 1, open: false, safeToRestore: true, drain: { liveLeases: 0, quietMs: 90000, requiredMs: 90000 }, audit: [], ...extra } });

await T('the target is fixed, encrypted, and cannot be pointed somewhere else', () => {
  assert.equal(DEFAULT_URL, 'https://horizonhaven.pages.dev/api/gate');
  assert.equal(targetUrl({}), DEFAULT_URL);
  assert.throws(() => targetUrl({ PG_GATE_URL: 'http://horizonhaven.pages.dev/api/gate' }), /https/);
  assert.throws(() => targetUrl({ PG_GATE_URL: 'https://prontera-grind.pages.dev/api/gate' }), /Refusing that host/);
  assert.throws(() => targetUrl({ PG_GATE_URL: 'https://02df8a40.horizonhaven.pages.dev/api/gate' }), /Refusing that host/);
  assert.throws(() => targetUrl({ PG_GATE_URL: 'https://evil.example/api/gate' }), /Refusing that host/);
  assert.throws(() => targetUrl({ PG_GATE_URL: 'https://horizonhaven.pages.dev/api/save' }), /Refusing that path/);
  assert.equal(targetUrl({ PG_GATE_URL: 'https://prontera-grind-staging.pages.dev/api/gate' }), 'https://prontera-grind-staging.pages.dev/api/gate');
});

await T('the token comes from the environment and a short one is refused', () => {
  assert.throws(() => tokenFrom({}), new RegExp(TOKEN_ENV));
  assert.throws(() => tokenFrom({ [TOKEN_ENV]: 'short' }), /shorter than 32/);
  assert.equal(tokenFrom({ [TOKEN_ENV]: TOKEN }), TOKEN);
});

await T('status prints the switch state and never the token', async () => {
  const h = harness([status()]);
  assert.equal(await h.exec(['status']), 0);
  const text = h.text();
  assert.match(text, /state:\s+closed/);
  assert.match(text, /safe to restore:\s+YES/);
  assert.match(text, /epoch:\s+4/);
  assert.equal(text.includes(TOKEN), false, 'the token must never be printed');
  assert.equal(h.calls[0].url, DEFAULT_URL);
  assert.equal(h.calls[0].init.headers['X-Recovery-Token'], TOKEN, 'it is sent as a header');
  assert.equal(h.calls[0].init.headers['X-Gate-Token'], undefined);
});

await T('even an endpoint that echoes the token cannot make the tool print it', async () => {
  const h = harness([{ body: { state: 'closed', token: TOKEN, echo: TOKEN } }]);
  assert.equal(await h.exec(['status']), 0);
  assert.equal(h.text().includes(TOKEN), false);
});

await T('every state change needs its exact phrase (and the phrase is not enough on its own)', async () => {
  for (const action of ['close', 'seal', 'open']) {
    let h = harness([]);
    assert.equal(await h.exec([action]), 1, action + ' without a phrase stops');
    assert.match(h.text(), new RegExp(`typed exactly: ${action}`));
    h = harness([]);
    assert.equal(await h.exec([action, 'yes']), 1);
    assert.equal(h.calls.length, 0, 'nothing was sent');
    h = harness([]);
    assert.equal(await h.exec([action, PHRASES[action].toLowerCase()]), 1, 'lowercase is not the phrase');
    assert.equal(h.calls.length, 0);
  }
});

await T('close, seal and open send action + phrase + reason matching /api/gate', async () => {
  const h = harness([status({ state: 'closing', safeToRestore: false })]);
  assert.equal(await h.exec(['close', 'CLOSE WRITES', '--reason', 'restore 12:00 SGT']), 0);
  assert.deepEqual(h.calls[0].body, { action: 'close', confirm: 'CLOSE WRITES', reason: 'restore 12:00 SGT' });
  assert.match(h.text(), /seal "SEAL WRITES"/);
  assert.equal(h.text().includes(TOKEN), false);

  const hSeal = harness([status({ state: 'closed', safeToRestore: true })]);
  assert.equal(await hSeal.exec(['seal', 'SEAL WRITES']), 0);
  assert.deepEqual(hSeal.calls[0].body, { action: 'seal', confirm: 'SEAL WRITES', reason: '' });

  const hOpen = harness([status({ state: 'open', open: true, safeToRestore: false })]);
  assert.equal(await hOpen.exec(['open', 'OPEN WRITES']), 0);
  assert.deepEqual(hOpen.calls[0].body, { action: 'open', confirm: 'OPEN WRITES', reason: '' });
});

await T('close --wait polls until the pause has drained, then stops', async () => {
  const bus = [
    status({ state: 'closing', safeToRestore: false, drain: { liveLeases: 2, quietMs: 0, requiredMs: 90000 } }),
    status({ state: 'closing', safeToRestore: false, drain: { liveLeases: 0, quietMs: 40000, requiredMs: 90000 } }),
    status({ state: 'closing', safeToRestore: true }),
  ];
  const h = harness(bus);
  assert.equal(await h.exec(['close', 'CLOSE WRITES', '--wait']), 0);
  assert.equal(h.calls.length, 3);
  assert.match(h.text(), /seal "SEAL WRITES"/);
});

await T('close --wait gives up instead of sealing something that never drained', async () => {
  const stuck = status({ state: 'closing', safeToRestore: false, drain: { liveLeases: 1, quietMs: 0, requiredMs: 90000 } });
  let clock = 0;
  const h = harness([stuck, stuck, stuck, stuck, stuck, stuck]);
  const code = await h.exec(['close', 'CLOSE WRITES', '--wait'], { now: () => (clock += 60000) });
  assert.equal(code, 1);
  assert.match(h.text(), /Do not restore/);
  assert.equal(h.calls.some(c => c.url.endsWith('/seal')), false);
});

await T('a refusal exits non-zero and explains itself', async () => {
  let h = harness([{ status: 404, body: { error: 'not-found' } }]);
  assert.equal(await h.exec(['status']), 1);
  assert.match(h.text(), /wrong or the switch is not deployed/);
  h = harness([{ status: 429, body: { error: 'locked' } }]);
  assert.equal(await h.exec(['status']), 1);
  assert.match(h.text(), /Locked out/);
  h = harness([{ status: 409, body: { error: 'not-drained', drain: { liveLeases: 3 } } }]);
  assert.equal(await h.exec(['seal', 'SEAL WRITES']), 1);
  assert.match(h.text(), /not-drained/);
  h = harness([{ status: 409, body: { error: 'not-closing', state: 'open' } }]);
  assert.equal(await h.exec(['seal', 'SEAL WRITES']), 1);
  assert.match(h.text(), /Run close first/);
});

await T('a dead network is UNKNOWN, and unknown is not success', async () => {
  const h = harness([], {});
  const code = await h.exec(['open', 'OPEN WRITES'], { fetchImpl: async () => { throw new Error('down'); } });
  assert.equal(code, 1);
  assert.match(h.text(), /UNKNOWN/);
});

await T('argument parsing refuses anything it does not understand', () => {
  assert.deepEqual(parseArgs(['close', 'CLOSE WRITES', '--reason=x', '--wait']).options, { wait: true, reason: 'x' });
  assert.throws(() => parseArgs(['status', 'extra']), /takes no phrase/);
  assert.throws(() => parseArgs(['close', 'CLOSE WRITES', '--force']), /Unknown argument/);
});

console.log(`\nPASS: ${pass} owner-CLI checks (stubbed fetch; no Cloudflare account was contacted)`);
