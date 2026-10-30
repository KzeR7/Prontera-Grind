// The write pause at the front door: functions/api/_middleware.js with a stubbed Durable Object.
//   node tools/tests/write_gate_middleware_sim.js
//
// The point of this suite is the one property the whole mechanism rests on: when the pause is not
// open, NO request reaches a handler. Not a save, not a read that writes as a side effect
// (GET /api/save moves the away baseline; GET /api/board settles prizes), not a GM action, not the
// Stripe webhook. And when the switch cannot be asked, the answer is "closed", not "carry on".
import assert from 'node:assert/strict';
import { onRequest, gateRequired } from '../../functions/api/_middleware.js';

const API_PATHS = [
  'GET /api/save', 'PUT /api/save', 'POST /api/grants', 'GET /api/grants', 'POST /api/register',
  'POST /api/sessions', 'GET /api/me', 'GET /api/board', 'POST /api/messages', 'POST /api/gm/gifts',
  'POST /api/gm/player', 'POST /api/shop/checkout', 'POST /api/shop/webhook', 'GET /api/social',
];
const req = (line, host = 'horizonhaven.pages.dev') => {
  const [method, path] = line.split(' ');
  return new Request('https://' + host + path, { method, headers: { 'Content-Type': 'application/json' } });
};

// A stand-in for the GATE binding, shaped like the real thing.
//
// `env.GATE` from [[durable_objects.bindings]] is a DurableObjectNamespace: it has
// idFromName() and get(), and **no fetch()**. Mocking it as a bare object with fetch()
// is what let a broken call site pass this suite while production refused every
// request; the returned namespace therefore has no top-level `fetch` on purpose, so
// calling one here fails exactly as it does in production.
function gateStub(verdict = { ok: true }, { throwOn = '', answer = null } = {}) {
  const calls = [];
  const stub = {
    async fetch(request) {
      const { pathname } = new URL(request.url);
      const body = request.method === 'POST' ? await request.json() : {};
      calls.push({ path: pathname, body });
      if (throwOn && pathname === throwOn) throw new Error('switch unreachable');
      if (answer) return answer;
      return new Response(JSON.stringify(verdict), { status: verdict.ok === true ? 200 : 503 });
    },
  };
  return {
    calls,
    idFromName: name => 'id-for:' + name,
    get: () => stub,
  };
}

function context(request, env, { nextThrows = false, waitUntil = true } = {}) {
  const state = { reached: 0, waited: [] };
  const ctx = {
    request, env,
    async next() { state.reached++; if (nextThrows) throw new Error('handler exploded'); return new Response('handler', { status: 200 }); },
  };
  if (waitUntil) ctx.waitUntil = promise => state.waited.push(promise);
  return { ctx, state };
}

let pass = 0;
const ok = (n, fn) => { fn(); console.log('  ok   ' + n); pass++; };
const T = async (n, fn) => { await fn(); console.log('  ok   ' + n); pass++; };

ok('the switch is only "required" when it is asked for by name', () => {
  assert.equal(gateRequired({ WRITE_GATE: 'required' }), true);
  assert.equal(gateRequired({ WRITE_GATE: ' Required ' }), true);
  assert.equal(gateRequired({ WRITE_GATE: 'off' }), false);
  assert.equal(gateRequired({}), false);
  assert.equal(gateRequired(undefined), false);
});

await T('with no switch configured, nothing changes (local dev and the existing suites)', async () => {
  const { ctx, state } = context(req('PUT /api/save'), {});
  const r = await onRequest(ctx);
  assert.equal(r.status, 200);
  assert.equal(state.reached, 1);
});

await T('required + unconfigured binding fails CLOSED, and says so', async () => {
  const { ctx, state } = context(req('PUT /api/save'), { WRITE_GATE: 'required' });
  const r = await onRequest(ctx);
  const body = await r.json();
  assert.equal(r.status, 503);
  assert.equal(r.headers.get('Retry-After'), '30');
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  assert.equal(body.maintenance, true);
  assert.equal(body.gateUnavailable, true);
  assert.equal(state.reached, 0, 'no handler ran');
});

await T('a closed or draining gate refuses every /api path, reads included', async () => {
  for (const line of API_PATHS) {
    const gate = gateStub({ ok: false, state: 'closing', maintenance: true });
    const { ctx, state } = context(req(line), { WRITE_GATE: 'required', GATE: gate });
    const r = await onRequest(ctx);
    const body = await r.json();
    assert.equal(r.status, 503, line + ' must be refused');
    assert.equal(body.maintenance, true);
    assert.equal(state.reached, 0, line + ' must not reach a handler');
    assert.equal(gate.calls.length, 1, line + ' asks the switch exactly once');
    assert.equal(gate.calls[0].path, '/admit');
    assert.equal(gate.calls.some(c => c.path === '/release'), false, 'nothing to release when refused');
  }
});

await T('an open gate admits the request, then releases its lease through waitUntil', async () => {
  const gate = gateStub({ ok: true, epoch: 3 });
  const { ctx, state } = context(req('PUT /api/save'), { WRITE_GATE: 'required', GATE: gate });
  const r = await onRequest(ctx);
  assert.equal(r.status, 200);
  assert.equal(state.reached, 1);
  assert.equal(state.waited.length, 1, 'the release is deferred, not added to the response time');
  await Promise.all(state.waited);
  assert.equal(gate.calls.length, 2);
  assert.equal(gate.calls[1].path, '/release');
  assert.equal(gate.calls[1].body.id, gate.calls[0].body.id, 'release names the lease that was admitted');
  assert.match(gate.calls[0].body.id, /^[0-9a-f-]{36}$/);
});

await T('without waitUntil the release is still awaited, and a handler that throws still releases', async () => {
  const gate = gateStub({ ok: true });
  const { ctx, state } = context(req('POST /api/gm/gifts'), { WRITE_GATE: 'required', GATE: gate }, { nextThrows: true, waitUntil: false });
  await assert.rejects(() => onRequest(ctx), /handler exploded/);
  assert.equal(gate.calls.length, 2);
  assert.equal(gate.calls[1].path, '/release', 'a failed request must not hold its lease');
});

await T('a switch that cannot be reached is a closed gate, never an open one', async () => {
  const gate = gateStub({ ok: true }, { throwOn: '/admit' });
  const { ctx, state } = context(req('PUT /api/save'), { WRITE_GATE: 'required', GATE: gate });
  const r = await onRequest(ctx);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).gateUnavailable, true);
  assert.equal(state.reached, 0);
});

await T('an unreadable answer from the switch is also a refusal', async () => {
  for (const answer of [
    new Response('not json', { status: 200 }),
    new Response(JSON.stringify({}), { status: 200 }),
    new Response(JSON.stringify({ ok: 'yes' }), { status: 200 }),
  ]) {
    const gate = gateStub({}, { answer });
    const { ctx, state } = context(req('PUT /api/save'), { WRITE_GATE: 'required', GATE: gate });
    const r = await onRequest(ctx);
    assert.equal(r.status, 503);
    assert.equal(state.reached, 0);
  }
});

await T('the control endpoint stays reachable while the pause is on', async () => {
  const gate = gateStub({ ok: false, state: 'closed' });
  const { ctx, state } = context(req('POST /api/gate'), { WRITE_GATE: 'required', GATE: gate });
  const r = await onRequest(ctx);
  assert.equal(r.status, 200);
  assert.equal(state.reached, 1, 'otherwise nobody could ever lift the pause');
  assert.equal(gate.calls.length, 0, 'and it is not itself gated');
});

await T('the preview refusal still wins, and is unchanged', async () => {
  for (const previewHost of ['02df8a40.horizonhaven.pages.dev', 'branch.horizonhaven.pages.dev', 'branch.prontera-grind.pages.dev']) {
    const gate = gateStub({ ok: true });
    const { ctx, state } = context(req('PUT /api/save', previewHost), { WRITE_GATE: 'required', GATE: gate });
    const r = await onRequest(ctx);
    assert.equal(r.status, 503);
    assert.match((await r.json()).err, /disabled/);
    assert.equal(state.reached, 0);
    assert.equal(gate.calls.length, 0, 'a preview never even asks the switch');
  }
});

await T('a lost release does not fail an accepted request', async () => {
  const gate = gateStub({ ok: true });
  // Namespace-shaped for the same reason as gateStub: the real binding is never a bare
  // fetcher, so a test that mocks one would never exercise the code that resolves it.
  const failing = {
    idFromName: name => 'id-for:' + name,
    get: () => ({ fetch: async request => (new URL(request.url).pathname === '/release' ? Promise.reject(new Error('gone')) : gate.get().fetch(request)) }),
  };
  const { ctx, state } = context(req('PUT /api/save'), { WRITE_GATE: 'required', GATE: failing });
  const r = await onRequest(ctx);
  assert.equal(r.status, 200, 'the save was already written; the lease expires instead');
  await Promise.all(state.waited);
  assert.equal(state.reached, 1);
});

console.log(`\nPASS: ${pass} front-door checks (pause refuses every handler; unknown switch state fails closed)`);
