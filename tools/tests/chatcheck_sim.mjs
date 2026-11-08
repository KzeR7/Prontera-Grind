// /api/chatcheck — the endpoint that finally says WHY the plaza socket is refused.
//
// The browser cannot see the reason for a failed websocket upgrade (1006, no body), so the reason
// has to be produced on the server, where the binding lives. These checks drive the real handler
// against the real binding shapes, including a stand-in Durable Object that behaves like
// workers/social/index.mjs: it awaits its storage, then answers 426 to a non-upgrade request.
import assert from 'node:assert/strict';
import { onRequestGet } from '../../functions/api/chatcheck.js';

const call = async (env) => {
  const res = await onRequestGet({ env, request: new Request('https://h/api/chatcheck') });
  const body = await res.json();
  return { status: res.status, body };
};

// A Durable Object namespace whose object answers like workers/social: 426 to a plain request.
const readyNamespace = (answer = () => new Response('WebSocket required', { status: 426 })) => ({
  idFromName: (n) => ({ name: n }),
  get: () => ({ fetch: async (req) => answer(req) }),
});

const cases = [];
const check = async (name, fn) => {
  try { await fn(); cases.push(`  ok   ${name}`); }
  catch (e) { cases.push(`  FAIL ${name} -> ${e.message}`); process.exitCode = 1; }
};

await check('no SOCIAL binding is named as the cause, not as a generic failure', async () => {
  const { status, body } = await call({});
  assert.equal(status, 200);
  assert.equal(body.ok, false);
  assert.match(body.verdict, /no SOCIAL binding/i);
  assert.match(body.detail, /wrangler\.toml/i, 'it tells the operator what to do');
});

await check('a reachable Worker (426 to a non-upgrade probe) is reported healthy', async () => {
  const { body } = await call({ SOCIAL: readyNamespace() });
  assert.equal(body.ok, true, 'a 426 proves the object exists and loaded its state');
  assert.equal(body.http, 426);
  assert.match(body.verdict, /reachable/i);
});

await check('a malformed binding (not a namespace) is named', async () => {
  const { body } = await call({ SOCIAL: { nope: true } });
  assert.equal(body.ok, false);
  assert.match(body.verdict, /malformed/i);
});

await check('the Worker throwing (unreachable hop) is distinguished from an HTTP refusal', async () => {
  const { body } = await call({
    SOCIAL: { idFromName: () => ({}), get: () => ({ fetch: async () => { throw new Error('network blip'); } }) },
  });
  assert.equal(body.ok, false);
  assert.equal(body.http, 0, 'no HTTP status means the request never completed');
  assert.match(body.verdict, /could not be reached/i);
  assert.equal(body.detail, 'network blip');
});

await check('a 503 from the room is attributed to its storage, not to the whole service', async () => {
  const { body } = await call({ SOCIAL: readyNamespace(() => new Response('Poker ledger unavailable', { status: 503 })) });
  assert.equal(body.ok, false);
  assert.equal(body.http, 503);
  assert.match(body.verdict, /storage could not be read/i);
});

await check('a 5xx is reported as the object refusing work', async () => {
  const { body } = await call({ SOCIAL: readyNamespace(() => new Response('boom', { status: 502 })) });
  assert.equal(body.ok, false);
  assert.match(body.verdict, /refusing work/i);
});

await check('the probe is read-only: it asks for no upgrade and reads no session', async () => {
  let seen = null;
  await call({ SOCIAL: readyNamespace((req) => { seen = req; return new Response('WebSocket required', { status: 426 }); }) });
  assert.equal(seen.method, 'GET');
  assert.equal(seen.headers.get('Upgrade'), null, 'a non-upgrade request is what makes 426 a liveness proof');
  assert.match(seen.headers.get('X-Social-Identity'), /__chatcheck__/, 'a probe identity that cannot be a real account');
});

console.log('/api/chatcheck: the reason a plaza socket is refused\n');
console.log(cases.join('\n'));
console.log(`\n${cases.filter((c) => c.includes('  ok')).length} passed, ${cases.filter((c) => c.includes('FAIL')).length} failed\n`);
