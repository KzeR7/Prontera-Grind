// /api/gate — the owner's recovery control surface.
//
// This is a thin, authenticated proxy to the `prontera-gate` Durable Object (workers/gate/). It exists
// because the object has no public route, and because the owner must be able to stop writes when the
// database itself is suspect: this endpoint touches no D1 row, no session and no account.
//
//   GET  /api/gate                      -> status
//   GET  /api/gate?action=audit         -> recent transitions
//   POST /api/gate {action:'close', confirm:'CLOSE WRITES', reason:'...'}
//   POST /api/gate {action:'seal',  confirm:'SEAL WRITES'}
//   POST /api/gate {action:'open',  confirm:'OPEN WRITES'}
//
// The token is sent in `X-Recovery-Token` and checked by the Durable Object against its own secret;
// this file never stores, logs or compares it. A missing binding answers 404, and so does a bad token:
// nothing here tells a stranger that the switch exists. The endpoint stays reachable while the gate is
// closed — that is how it is opened again — and is the one path the middleware does not gate.
//
// Owner tool: node tools/recovery/write_gate.mjs
import { guard, readJson, json } from '../_lib/http.js';
import { gateStub } from '../_lib/gate-binding.js';

const ACTIONS = new Set(['status', 'audit', 'close', 'seal', 'open']);
const notFound = () => json({ err: 'Not found.' }, 404);

export const onRequest = guard(async ({ request, env }) => {
  const gate = env && env.GATE;
  if (!gate) return notFound();
  const url = new URL(request.url);
  const body = request.method === 'GET' ? {} : await readJson(request, 4000);   // a control body is tiny
  // GET with no action means "status": the operator's first question, and the cheapest one.
  const asked = body.action || url.searchParams.get('action') || (request.method === 'GET' ? 'status' : '');
  const action = String(asked).toLowerCase();
  if (!ACTIONS.has(action)) return notFound();
  const token = request.headers.get('X-Recovery-Token') || '';
  const readOnly = action === 'status' || action === 'audit';
  const init = readOnly
    ? { method: 'GET', headers: { 'X-Gate-Token': token } }
    : {
      method: 'POST',
      headers: { 'X-Gate-Token': token, 'Content-Type': 'application/json' },
      // The phrase, the token and the drained check all happen in the object, in one place.
      body: JSON.stringify({ confirm: body.confirm, reason: body.reason }),
    };
  let upstream;
  try {
    // env.GATE is a DurableObjectNamespace: resolve it to the stub first. Passing the
    // namespace straight to fetch() is what made the switch unreachable on 2026-10-30.
    upstream = await gateStub(gate).fetch(new Request('https://gate.internal/' + action, init));
  } catch {
    // Unreachable is not a state. Never guess one, and never let this look like "closed".
    return json({ err: 'The write-pause switch did not answer. Treat writes as UNKNOWN and do not restore.',
      gateUnavailable: true }, 503);
  }
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  const retry = upstream.headers.get('Retry-After');
  if (retry) headers['Retry-After'] = retry;
  return new Response(await upstream.text(), { status: upstream.status, headers });
});
