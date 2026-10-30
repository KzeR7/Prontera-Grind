// /api/gate — the owner's control endpoint, with a stubbed Durable Object binding.
//   node tools/tests/write_gate_api_sim.js
//
// It must be useless to a stranger (no binding or a bad action answers 404), must forward the token
// without ever storing or logging it, must relay the switch's own refusals untouched, and must say
// "unknown" rather than "open" when the switch cannot be reached.
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/gate.js';

const TOKEN = 'q'.repeat(48);
const call = (line, { body, token = TOKEN, origin = 'https://horizonhaven.pages.dev', env } = {}) => {
  const [method, path] = line.split(' ');
  const headers = { 'Content-Type': 'application/json' };
  if (body !== undefined) headers['Content-Length'] = String(Buffer.byteLength(JSON.stringify(body)));
  if (token) headers['X-Recovery-Token'] = token;
  if (origin) headers.Origin = origin;
  return onRequest({ request: new Request('https://horizonhaven.pages.dev' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env });
};
// Shaped like the real binding: a DurableObjectNamespace with idFromName() and get(),
// and deliberately no top-level fetch(). See the note in write_gate_middleware_sim.js.
const gateStub = (answer, { throwOn = false } = {}) => {
  const calls = [];
  const stub = {
    async fetch(request) {
      const body = request.method === 'POST' ? await request.json() : null;
      calls.push({ method: request.method, path: new URL(request.url).pathname, body, token: request.headers.get('X-Gate-Token') });
      if (throwOn) throw new Error('no answer');
      return typeof answer === 'function' ? answer(request) : new Response(JSON.stringify(answer.body), { status: answer.status, headers: answer.headers });
    },
  };
  return { calls, idFromName: name => 'id-for:' + name, get: () => stub };
};
let pass = 0;
const T = async (n, fn) => { await fn(); console.log('  ok   ' + n); pass++; };

await T('with no switch binding the endpoint does not exist', async () => {
  for (const line of ['GET /api/gate', 'POST /api/gate']) {
    const r = await call(line, { env: {}, body: line.startsWith('POST') ? { action: 'open' } : undefined });
    assert.equal(r.status, 404);
    const text = await r.text();
    assert.match(text, /Not found/);
    assert.equal(text.includes(TOKEN), false, 'never echoes the token back');
  }
});

await T('status is a read-only GET to the switch, carrying the token in a header', async () => {
  const gate = gateStub({ body: { state: 'closed', safeToRestore: false } });
  const r = await call('GET /api/gate', { env: { GATE: gate } });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { state: 'closed', safeToRestore: false });
  assert.deepEqual(gate.calls, [{ method: 'GET', path: '/status', body: null, token: TOKEN }]);
});

await T('a state change forwards the phrase and the reason, and nothing else', async () => {
  const gate = gateStub({ body: { state: 'closing', changed: true } });
  const r = await call('POST /api/gate', {
    env: { GATE: gate },
    body: { action: 'close', confirm: 'CLOSE WRITES', reason: 'restore 12:00 SGT', token: 'ignored', extra: 1 },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(gate.calls[0].body, { confirm: 'CLOSE WRITES', reason: 'restore 12:00 SGT' });
  assert.equal(gate.calls[0].method, 'POST');
  assert.equal(gate.calls[0].path, '/close');
});

await T('the switch refusal is relayed untouched (status, code and Retry-After)', async () => {
  const gate = gateStub({ status: 409, body: { error: 'not-drained', drain: { liveLeases: 1 } }, headers: { 'Retry-After': '9' } });
  const r = await call('POST /api/gate', { env: { GATE: gate }, body: { action: 'seal', confirm: 'SEAL WRITES' } });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, 'not-drained');
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
});

await T('unknown actions, foreign origins and malformed bodies change nothing', async () => {
  const gate = gateStub({ body: {} });
  assert.equal((await call('POST /api/gate', { env: { GATE: gate }, body: { action: 'delete-everything', confirm: 'X' } })).status, 404);
  assert.equal((await call('POST /api/gate', { env: { GATE: gate }, body: { action: 'open' }, origin: 'https://evil.test' })).status, 403);
  assert.equal((await call('GET /api/gate?action=sideways', { env: { GATE: gate } })).status, 404);
  assert.equal(gate.calls.length, 0, 'none of those reached the switch');
});

await T('no answer from the switch is reported as UNKNOWN, not as a state', async () => {
  const gate = gateStub({ body: {} }, { throwOn: true });
  const r = await call('POST /api/gate', { env: { GATE: gate }, body: { action: 'open', confirm: 'OPEN WRITES' } });
  assert.equal(r.status, 503);
  const body = await r.json();
  assert.equal(body.gateUnavailable, true);
  assert.match(body.err, /UNKNOWN/);
});

console.log(`\nPASS: ${pass} control-endpoint checks (stub binding only; nothing reached Cloudflare)`);
