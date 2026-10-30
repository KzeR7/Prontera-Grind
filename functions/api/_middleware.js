// Defence in depth for the production Pages project's branch/deployment URLs.
// Even if Cloudflare unexpectedly supplies production bindings to a preview,
// never allow that preview to run account, save, GM, prize or social APIs.
// The production pages.dev hostname itself and the separately named staging
// project are unaffected. Old preview deployments need separate review.
//
// THE WRITE PAUSE (see workers/gate/ and docs/RECOVERY.md) is the second job of this file. When the
// project is configured with `WRITE_GATE = "required"`, every /api request must be admitted by the
// `prontera-gate` Durable Object before any handler runs, and every admitted request holds a lease
// that is released afterwards. The object lives outside D1 on purpose: a D1 Time Travel restore
// overwrites the database in place, so a flag stored in the database would be rolled back by the
// restore it is guarding.
//
//   * closed / draining  -> 503 for EVERY /api request, reads included. There is no read-only tier
//     here because "read" is not read-only in this codebase: GET /api/save moves the away baseline
//     and issues offline claims, and GET /api/board settles prizes.
//   * switch unreachable, or `required` with no binding -> 503 as well. Fail closed: an unknown gate
//     is not an open gate. The cost of that choice is stated in docs/RECOVERY.md.
//   * /api/gate is exempt, because it is how the pause is lifted again.
//
// Unset (local dev, tests, `wrangler pages dev`) the pause does not exist and nothing changes.
const CONTROL_PATH = '/api/gate';
const RETRY_AFTER = '30';

export const gateRequired = env => String((env && env.WRITE_GATE) || '').trim().toLowerCase() === 'required';

const maintenance = (extra = {}) => new Response(JSON.stringify({
  err: 'The server is paused for maintenance. Nothing was saved or changed.',
  maintenance: true, retryAfter: Number(RETRY_AFTER), ...extra,
}), {
  status: 503,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Retry-After': RETRY_AFTER,
    'X-Content-Type-Options': 'nosniff',
  },
});

const askGate = (gate, path, body) => gate.fetch(new Request('https://gate.internal' + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}));

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const host = url.hostname;
  let headerHost = '';
  try { headerHost = new URL('http://' + (context.request.headers.get('host') || '')).hostname; } catch {}
  // The URL is the principal check. Checking Host as well can only add a
  // refusal, not bypass it; local proxies may preserve the external Host only.
  if (isProductionPreview(host) || isProductionPreview(headerHost)) {
    return new Response(JSON.stringify({ err: 'Cloud APIs are disabled on production-project previews.' }), {
      status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  if (url.pathname === CONTROL_PATH) return context.next();
  if (!gateRequired(context.env)) return context.next();

  const gate = context.env && context.env.GATE;
  if (!gate) return maintenance({ gateUnavailable: true, state: 'unconfigured' });

  const id = crypto.randomUUID();
  let admitted = false;
  try {
    const answer = await askGate(gate, '/admit', { id });
    let verdict = {};
    try { verdict = await answer.json(); } catch {}
    if (!answer.ok || verdict.ok !== true) return maintenance({ state: String(verdict.state || 'unknown') });
    admitted = true;
  } catch {
    return maintenance({ gateUnavailable: true, state: 'unknown' });
  }

  try {
    return await context.next();
  } finally {
    if (admitted) {
      // Release is bookkeeping for the drain report, never a reason to fail an accepted request: if it
      // is lost, the lease simply expires (LEASE_MS) and the operator's seal waits for the quiet window.
      const released = askGate(gate, '/release', { id }).catch(() => {});
      if (typeof context.waitUntil === 'function') context.waitUntil(released);
      else await released;
    }
  }
}

// Kept in this file (not exported logic elsewhere) so a preview refusal cannot be bypassed by editing
// one helper: the check above is the only caller.
function isProductionPreview(host) {
  return host.toLowerCase().replace(/\.$/, '').endsWith('.prontera-grind.pages.dev');
}
