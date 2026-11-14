// Regression test for the two 2026-10-30 enablement bugs:
//
// 1. Both Pages call sites (`functions/api/_middleware.js` and `functions/api/gate.js`)
//    called `env.GATE.fetch(...)` directly, when `[[durable_objects.bindings]]` hands out
//    a `DurableObjectNamespace` (`idFromName` + `get`, NO `fetch`). That threw and failed
//    closed with 503 ("The write-pause switch did not answer").
// 2. `tools/recovery/write_gate.mjs` sent `POST /api/gate` with `{confirm, reason}` and
//    omitted `action`, while `functions/api/gate.js` requires `body.action` and answers
//    404 ("Not found.") when it is missing — so `open "OPEN WRITES"` returned 404 even
//    with the right token.
//
// The unit suites had missed both because the binding mocks were bare `{fetch}` objects
// and the CLI suite mocked `fetch` without running `/api/gate`. This suite uses
// namespace-shaped mocks with no top-level `fetch`, wires the real CLI directly into
// `/api/gate`, and rehearses the full two-Worker stack inside Cloudflare's local runtime
// (`miniflare` / `workerd`) over a real cross-script SQLite Durable Object binding.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gateStub, GATE_OBJECT_NAME} from '../../functions/_lib/gate-binding.js';
import {onRequest as middleware} from '../../functions/api/_middleware.js';
import {onRequest as controlEndpoint} from '../../functions/api/gate.js';
import {run as runCli, TOKEN_ENV} from '../recovery/write_gate.mjs';

const LOCAL_RUNTIME_MAX_DATE = '2026-08-06';

async function loadMiniflare() {
  try { return await import('miniflare'); } catch (e) {
    if (e && e.code === 'ERR_MODULE_NOT_FOUND')
      throw Error('miniflare is not installed; run: npm install --no-save --package-lock=false miniflare');
    throw e;
  }
}

function gateWorkerCompatibilityDate() {
  const toml = readFileSync('workers/gate/wrangler.toml', 'utf8');
  const match = toml.match(/^compatibility_date\s*=\s*"([0-9]{4}-[0-9]{2}-[0-9]{2})"/m);
  assert(match, 'workers/gate/wrangler.toml has no compatibility_date');
  const real = match[1];
  return real > LOCAL_RUNTIME_MAX_DATE ? LOCAL_RUNTIME_MAX_DATE : real;
}

// A DurableObjectNamespace: idFromName + get, and deliberately nothing else.
function namespace({verdict = {ok: true}, status = 200, throwOn = '', body = null} = {}) {
  const calls = [];
  const stub = {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      const payload = request.method === 'POST' ? await request.clone().json().catch(() => null) : null;
      calls.push({path, method: request.method, payload, request});
      if (throwOn && path === throwOn) throw new Error('unreachable');
      if (body !== null) return new Response(body, {status});
      return new Response(JSON.stringify(verdict), {status});
    },
  };
  const ns = {
    calls,
    idFromName(name) { ns.names.push(name); return 'id:' + name; },
    get(id) { ns.ids.push(id); return stub; },
    names: [],
    ids: [],
  };
  return ns;
}

const req = (line, headers = {}) => {
  const [method, path] = line.split(' ');
  return new Request('https://horizonhaven.pages.dev' + path, {method, headers});
};
const ctxFor = (request, env) => {
  const waited = [];
  return {
    request, env, waited,
    next: async () => new Response('handler', {status: 200}),
    waitUntil: p => waited.push(p),
  };
};

let pass = 0;
const ok = async (name, fn) => { await fn(); console.log('  ok   ' + name); pass++; };

// 1. The helper itself.
await ok('gateStub resolves through get(idFromName(...)) with the one shared name', () => {
  const ns = namespace();
  const stub = gateStub(ns);
  assert.equal(typeof stub.fetch, 'function', 'returns the stub, not the namespace');
  assert.deepEqual(ns.names, [GATE_OBJECT_NAME], 'resolves exactly one name');
  assert.deepEqual(ns.ids, ['id:' + GATE_OBJECT_NAME]);
  assert.equal(GATE_OBJECT_NAME, 'gate', 'the name is the deployed contract');
});

await ok('gateStub refuses a bare fetcher and says what to do instead', () => {
  assert.throws(() => gateStub({fetch: async () => new Response('x')}), /DurableObjectNamespace[\s\S]*gateStub\(\)/);
  assert.throws(() => gateStub({}), /DurableObjectNamespace/);
  assert.throws(() => gateStub(null), /missing/);
});

// 2. The middleware, driven with a mock that has no fetch() to call.
await ok('an open gate admits a request through a namespace-shaped binding', async () => {
  const ns = namespace({verdict: {ok: true}, status: 200});
  const ctx = ctxFor(req('PUT /api/save'), {WRITE_GATE: 'required', GATE: ns});
  const r = await middleware(ctx);
  await Promise.all(ctx.waited);
  assert.equal(r.status, 200, 'the handler must run: a namespace is not a fetcher');
  assert.deepEqual(ns.calls.map(c => c.path), ['/admit', '/release']);
});

await ok('a closed gate still refuses through a namespace-shaped binding', async () => {
  const ns = namespace({verdict: {ok: false, state: 'closed'}, status: 503});
  const r = await middleware(ctxFor(req('GET /api/board'), {WRITE_GATE: 'required', GATE: ns}));
  assert.equal(r.status, 503);
  assert.equal((await r.json()).maintenance, true);
});

await ok('a binding of the wrong shape fails closed and is named misconfigured', () =>
  middleware(ctxFor(req('PUT /api/save'), {WRITE_GATE: 'required', GATE: {fetch: async () => new Response('{}')}}))
    .then(async r => {
      const body = await r.json();
      assert.equal(r.status, 503, 'never an open gate');
      assert.equal(body.gateUnavailable, true);
      assert.equal(body.state, 'misconfigured', 'distinguishable from a missing binding in logs');
    }));

// 3. The control endpoint + real owner CLI wire contract.
await ok('the control endpoint reaches the switch through the namespace', async () => {
  const ns = namespace({verdict: {state: 'closed', safeToRestore: false}, status: 200});
  const r = await controlEndpoint(ctxFor(
    new Request('https://horizonhaven.pages.dev/api/gate', {headers: {'X-Recovery-Token': 'x'.repeat(64)}}),
    {GATE: ns}));
  assert.equal(r.status, 200);
  assert.equal(ns.calls[0].path, '/status');
});

await ok('the real owner CLI opens, closes and seals through /api/gate without 404', async () => {
  const token = 't'.repeat(64);
  for (const [cmd, phrase, expectedPath] of [
    ['open', 'OPEN WRITES', '/open'],
    ['close', 'CLOSE WRITES', '/close'],
    ['seal', 'SEAL WRITES', '/seal'],
  ]) {
    const ns = namespace({verdict: {state: cmd === 'open' ? 'open' : 'closed', open: cmd === 'open', safeToRestore: cmd !== 'open'}, status: 200});
    const out = [];
    const code = await runCli([cmd, phrase], {
      env: {[TOKEN_ENV]: token},
      print: line => out.push(line),
      fetchImpl: (url, init) => controlEndpoint(ctxFor(new Request(url, init), {GATE: ns})),
    });
    assert.equal(code, 0, `${cmd} through real /api/gate failed: ${out.join(' ')}`);
    assert.equal(ns.calls.length, 1);
    assert.equal(ns.calls[0].path, expectedPath);
    assert.equal(ns.calls[0].payload.confirm, phrase);
  }
});

// 4. Static guard: the shape of the fix must stay.
await ok('both call sites resolve the binding before fetching it', () => {
  const mw = readFileSync('functions/api/_middleware.js', 'utf8');
  const api = readFileSync('functions/api/gate.js', 'utf8');
  for (const [file, src] of [['functions/api/_middleware.js', mw], ['functions/api/gate.js', api]]) {
    assert(!/\.GATE\.fetch\s*\(/.test(src), file + ' calls env.GATE.fetch() directly');
    assert(/from '\.\.\/_lib\/gate-binding\.js'/.test(src), file + ' must resolve the binding through the helper');
  }
  const resolvedAt = mw.indexOf('gateStub(namespace)');
  const firstUse = mw.indexOf('askGate(gate');
  assert(resolvedAt > 0, 'the middleware never calls gateStub');
  assert(firstUse > 0 && resolvedAt < firstUse, 'the binding is used before it is resolved');
  assert(/gateStub\(gate\)\.fetch\s*\(/.test(api), 'the control endpoint must fetch the resolved stub');
});

// 5. Real Cloudflare workerd rehearsal: CLI -> Pages middleware + /api/gate -> cross-script WriteGate SQLite DO.
await ok('Cloudflare local runtime: closed on boot, CLI opens writes, saves pass, CLI closes again', async () => {
  const {Miniflare} = await loadMiniflare();
  const token = 'k'.repeat(64);
  const compatDate = gateWorkerCompatibilityDate();
  const mf = new Miniflare({
    workers: [
      {
        name: 'prontera-gate',
        modules: [
          {type: 'ESModule', path: 'workers/gate/index.mjs'},
          {type: 'ESModule', path: 'workers/gate/policy.mjs'},
        ],
        modulesRoot: '.',
        compatibilityDate: compatDate,
        durableObjects: {GATE: {className: 'WriteGate', useSQLite: true}},
        bindings: {GATE_TOKEN: token},
      },
      {
        name: 'pages-caller',
        modules: [
          {
            type: 'ESModule',
            path: 'entry.mjs',
            contents: `
              import { onRequest as mw } from './functions/api/_middleware.js';
              import { onRequest as gateApi } from './functions/api/gate.js';
              export default {
                async fetch(request, env, ctx) {
                  return mw({
                    request,
                    env,
                    waitUntil: p => ctx.waitUntil(p),
                    next: async () => {
                      if (new URL(request.url).pathname === '/api/gate') return gateApi({ request, env });
                      return new Response(JSON.stringify({ saved: true }), { status: 200 });
                    },
                  });
                }
              };
            `,
          },
          {type: 'ESModule', path: 'functions/api/_middleware.js'},
          {type: 'ESModule', path: 'functions/api/gate.js'},
          {type: 'ESModule', path: 'functions/_lib/gate-binding.js'},
          {type: 'ESModule', path: 'functions/_lib/http.js'},
          // The network-ban check in the middleware resolves the caller (owner exemption)
          // through the real session code, so workerd needs its module graph too:
          // auth.js -> db.js + scrypt-reader.js (and http.js's lazy import of auth.js).
          {type: 'ESModule', path: 'functions/_lib/auth.js'},
          {type: 'ESModule', path: 'functions/_lib/db.js'},
          {type: 'ESModule', path: 'functions/_lib/scrypt-reader.js'},
        ],
        modulesRoot: '.',
        compatibilityDate: compatDate,
        // Pages Functions run with the Node.js compatibility flag (auth.js's password
        // verification graph reaches node:crypto through scrypt-reader.js); without it the
        // local workerd refuses to load the middleware's imports at all.
        compatibilityFlags: ['nodejs_compat'],
        durableObjects: {GATE: {className: 'WriteGate', scriptName: 'prontera-gate'}},
        bindings: {WRITE_GATE: 'required'},
      },
    ],
  });
  try {
    const pages = await mf.getWorker('pages-caller');
    const fetchViaPages = (url, init) => pages.fetch(url, init);

    // Boot state: closed -> /api/save is 503 maintenance (state: closed, NOT unknown).
    const rBoot = await pages.fetch('https://horizonhaven.pages.dev/api/save', {method: 'PUT'});
    assert.equal(rBoot.status, 503);
    const bootBody = await rBoot.json();
    assert.equal(bootBody.maintenance, true);
    assert.equal(bootBody.state, 'closed', 'reaches the real WriteGate DO and reads its closed state');

    // CLI status -> closed (uses DEFAULT_URL: https://horizonhaven.pages.dev/api/gate)
    const statusOut = [];
    assert.equal(await runCli(['status'], {env: {[TOKEN_ENV]: token}, fetchImpl: fetchViaPages, print: s => statusOut.push(s)}), 0);
    assert.match(statusOut.join('\n'), /state:\s+closed/);

    // CLI open "OPEN WRITES" -> open
    const openOut = [];
    assert.equal(await runCli(['open', 'OPEN WRITES'], {env: {[TOKEN_ENV]: token}, fetchImpl: fetchViaPages, print: s => openOut.push(s)}), 0);
    assert.match(openOut.join('\n'), /writes open:\s+YES/);

    // /api/save on horizonhaven.pages.dev passes through, while a preview subdomain stays disabled!
    const rOpen = await pages.fetch('https://horizonhaven.pages.dev/api/save', {method: 'PUT'});
    assert.equal(rOpen.status, 200);
    assert.deepEqual(await rOpen.json(), {saved: true});
    const rPreview = await pages.fetch('https://02df8a40.horizonhaven.pages.dev/api/save', {method: 'PUT'});
    assert.equal(rPreview.status, 503);
    assert.match((await rPreview.json()).err, /disabled/);

    // CLI close "CLOSE WRITES" --reason drill -> /api/save immediately refused again
    const closeOut = [];
    assert.equal(await runCli(['close', 'CLOSE WRITES', '--reason', 'drill'], {env: {[TOKEN_ENV]: token}, fetchImpl: fetchViaPages, print: s => closeOut.push(s)}), 0);
    assert.match(closeOut.join('\n'), /state:\s+closing/);
    const rClosedAgain = await pages.fetch('https://horizonhaven.pages.dev/api/save', {method: 'PUT'});
    assert.equal(rClosedAgain.status, 503);
  } finally {
    await mf.dispose();
  }
});

console.log(`PASS: ${pass} write-pause binding & runtime checks (namespace-shaped + real workerd cross-script DO)`);
