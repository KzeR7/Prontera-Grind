// workers/gate/index.mjs — `prontera-gate`: the Durable Object that owns the write-pause flag.
//
// It has no D1 binding, no route and `workers_dev = false`: the only way in is the `GATE` binding on
// the Pages project, which reaches it through the binding service, not the public internet. That is
// the whole point — a database restore cannot touch this script's storage.
//
// PROTOCOL (JSON over the binding; called by functions/api/_middleware.js and functions/api/gate.js)
//   POST /admit    {id}        -> 200 {ok:true, epoch} | 503 {ok:false, state}     no token: internal
//   POST /release  {id}        -> 200 {ok:true}                                     no token: internal
//   GET  /status               -> 200 status                                        token
//   POST /close    {reason}    -> 200 status (or 409)                               token
//   POST /seal     {reason}    -> 200 status (or 409 not-drained)                    token
//   POST /open     {reason}    -> 200 status                                        token
//   GET  /audit                -> 200 {audit}                                       token
//
// The token is the `GATE_TOKEN` secret on THIS script (set once with
// `npx wrangler secret put GATE_TOKEN --config workers/gate/wrangler.toml`). Pages never sees it: the
// owner sends it with the recovery command, functions/api/gate.js forwards it here, and this class
// compares it in constant time. A wrong or missing token gets 404 — the endpoint does not advertise
// what it is — and repeated guesses lock control requests for a few minutes.
import {
  AUDIT_MAX, GateError, TOKEN_MIN, admit, closeGate, isLocked, noteAuthFail, noteAuthOk,
  openGate, publicStatus, release, sanitize, sealGate,
} from './policy.mjs';

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
});

// Constant-time compare of two secrets: hash both first so the compare has a fixed length, then walk
// every byte (no early exit, no length-dependent timing).
async function tokensMatch(configured, presented) {
  if (typeof configured !== 'string' || typeof presented !== 'string' || !configured || !presented) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([configured, presented].map(async v =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(v)))));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export class WriteGate {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env || {};
    // Load before any request is handled. `sanitize` turns anything unexpected into a closed gate.
    ctx.blockConcurrencyWhile(async () => {
      this.state = sanitize(await ctx.storage.get('gate'));
    });
  }

  async persist() {
    await this.ctx.storage.put('gate', this.state);
  }

  async readBody(request) {
    const text = await request.text();
    if (!text) return {};
    try {
      const v = JSON.parse(text);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch { return {}; }
  }

  // Control requests are the only ones that need the secret.
  async authorised(request, now) {
    const configured = String(this.env.GATE_TOKEN || '');
    if (configured.length < TOKEN_MIN) return { ok: false, response: json({ error: 'not-configured' }, 503) };
    if (isLocked(this.state, now)) {
      const retryAfter = Math.max(1, Math.ceil((this.state.auth.lockUntil - now) / 1000));
      return { ok: false, response: json({ error: 'locked', retryAfter }, 429, { 'Retry-After': String(retryAfter) }) };
    }
    if (await tokensMatch(configured, request.headers.get('X-Gate-Token') || '')) {
      noteAuthOk(this.state);
      return { ok: true };
    }
    noteAuthFail(this.state, now);
    await this.persist();
    return { ok: false, response: json({ error: 'not-found' }, 404) };
  }

  async fetch(request) {
    const now = Date.now();
    const { pathname } = new URL(request.url);
    const st = this.state;

    // ---- internal, binding-only ------------------------------------------------
    if (request.method === 'POST' && pathname === '/admit') {
      const { id } = await this.readBody(request);
      let verdict;
      try { verdict = admit(st, now, id); }
      catch (e) { if (e instanceof GateError) return json({ error: e.code }, e.status); throw e; }
      if (verdict.ok) await this.persist();
      return verdict.ok ? json(verdict) : json({ ...verdict, maintenance: true }, 503);
    }
    if (request.method === 'POST' && pathname === '/release') {
      const { id } = await this.readBody(request);
      if (release(st, id)) await this.persist();
      return json({ ok: true });
    }

    // ---- operator, token-protected --------------------------------------------
    const auth = await this.authorised(request, now);
    if (!auth.ok) return auth.response;

    if (request.method === 'GET' && pathname === '/status')
      return json(publicStatus(st, now));
    if (request.method === 'GET' && pathname === '/audit')
      return json({ audit: st.audit.slice(0, AUDIT_MAX) });

    if (request.method === 'POST' && ['/close', '/seal', '/open'].includes(pathname)) {
      const body = await this.readBody(request);
      const opts = { confirm: body.confirm, reason: body.reason, actor: 'owner' };
      try {
        const result = pathname === '/close' ? closeGate(st, now, opts)
          : pathname === '/seal' ? sealGate(st, now, opts)
            : openGate(st, now, opts);
        await this.persist();
        return json(result);
      } catch (e) {
        if (!(e instanceof GateError)) throw e;
        await this.persist();  // a refused attempt is still worth recording
        return json({ error: e.code, ...e.extra }, e.status);
      }
    }
    return json({ error: 'not-found' }, 404);
  }
}

// Nothing is served from this Worker directly; it exists only to host the Durable Object.
export default {
  fetch() { return new Response('Not found', { status: 404 }); },
};
