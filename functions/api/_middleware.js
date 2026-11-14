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
import { gateStub } from '../_lib/gate-binding.js';
import { json, ipHash } from '../_lib/http.js';
import { readCookie, tokenHash } from '../_lib/auth.js';
import { isIpBanned, sessionByToken } from '../_lib/db.js';

const CONTROL_PATH = '/api/gate';
// The login endpoint enforces the network ban itself (after the password check, with the
// owner exception) — the front door must still answer a banned player's sign-in attempt with
// the real reason instead of a blanket refusal the handler could have explained better.
const LOGIN_PATH = '/api/sessions';
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

// NETWORK BANS (migration 0014): refuse every /api request from a suspended network in one
// place, so a banned address cannot keep playing on an old session, chat, or sync saves —
// not just fail at the login box. Properties, in order of importance:
//   * fails OPEN if anything about the check itself breaks (missing migration, D1 error):
//     a broken ban lookup must never take the whole API down — it logs and lets the request
//     through, and the entry points (login/register/recover) each re-check on their own.
//   * /api/sessions is exempt: the login handler gives the ban answer AFTER password
//     verification and lets the owner (gm>=2) through, so a mistaken ban is always fixable.
//   * an already-signed-in OWNER session is exempt everywhere, for the same reason: the one
//     account that cannot be suspended must be able to open the console and remove the ban.
//   * no CF-Connecting-IP (local dev, tests) means no fingerprint: nothing to match, pass.
async function networkBanVerdict(request, env, pathname) {
  let fp = null;
  try {
    fp = await ipHash(request);
    if (!fp) return null;
    if (!(await isIpBanned(env.DB, fp))) return null;
    if (pathname === LOGIN_PATH) return null;
    if (await ownerSession(request, env.DB)) return null;
    return json({ err: 'This network is suspended. Contact the GM.', ipBanned: true }, 403);
  } catch (e) {
    if (fp) console.warn('ip-ban check failed; request allowed:', e && e.message);
    return null;
  }
}

async function ownerSession(request, DB) {
  try {
    const token = readCookie(request);
    if (!token || token.length < 40) return false;
    const row = await sessionByToken(DB, await tokenHash(token));
    return !!(row && row.expires_at >= Date.now() && Number(row.gm) >= 2 && !row.banned);
  } catch {
    return false;
  }
}

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

  // Network bans sit in front of the gate: a suspended address should not even spend a
  // Durable Object request on the way to being refused. (And /api/gate, returned just above,
  // stays reachable so the owner can always unpause — or unban via the console afterwards.)
  const banned = await networkBanVerdict(context.request, context.env, url.pathname);
  if (banned) return banned;

  if (!gateRequired(context.env)) return context.next();

  const namespace = context.env && context.env.GATE;
  if (!namespace) return maintenance({ gateUnavailable: true, state: 'unconfigured' });
  // env.GATE is a DurableObjectNamespace, not a callable stub: see _lib/gate-binding.js.
  // A binding of the wrong shape fails closed like a missing one, but reports a distinct
  // state so it is diagnosable from a log line instead of only from a maintenance screen.
  let gate;
  try { gate = gateStub(namespace); }
  catch { return maintenance({ gateUnavailable: true, state: 'misconfigured' }); }

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
  const h = host.toLowerCase().replace(/\.$/, '');
  return h.endsWith('.horizonhaven.pages.dev') || h.endsWith('.prontera-grind.pages.dev');
}
