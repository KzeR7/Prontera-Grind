// _lib/http.js — small request/response helpers shared by every endpoint.

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });

export const fail = (message, status = 400, extra = {}) => json({ err: message, ...extra }, status);

// v307: a 401 that says WHY, so the client can stop calling a dropped cookie a sign-in elsewhere.
// The session token is read the same way the endpoints read it (cookie, or the preview header the
// dev server mirrors into the cookie), so this never guesses.
//   X-Session: none    no token on the request at all
//   X-Session: ended   a token was sent but it is not a live session
export const unauth = async (request, message = 'Not logged in.') => {
  let presented = false;
  try {
    const { readCookie } = await import('./auth.js');
    presented = !!readCookie(request);
  } catch { presented = false; }
  return json({ err: message }, 401, { 'X-Session': presented ? 'ended' : 'none' });
};

// Read a JSON body with a hard size cap before parsing: a 100 MB body must never reach JSON.parse.
export async function readJson(request, maxBytes = 600_000) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'Origin rejected.');
  const type = request.headers.get('Content-Type');
  if (type && !/^application\/json(?:\s*;|$)/i.test(type)) throw new HttpError(415, 'Expected JSON.');
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len && len > maxBytes) throw new HttpError(413, 'That is too large.');
  let text = '';
  if (request.body && typeof request.body.getReader === 'function') {
    const reader = request.body.getReader(), decoder = new TextDecoder();
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { reader.cancel().catch(() => {}); throw new HttpError(413, 'That is too large.'); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } else {
    // Local shim / test requests have no stream.
    text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new HttpError(413, 'That is too large.');
  }
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'Expected a JSON object.');
    return v;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, 'Malformed JSON.');
  }
}

export class HttpError extends Error {
  // `extra` is merged into the JSON body (never into the status), so a refusal can carry a stable
  // machine-readable code next to its sentence without every caller re-declaring the shape.
  constructor(status, message, extra = null) { super(message); this.status = status; this.extra = extra; }
}

// Wrap a handler so a thrown HttpError becomes its status and anything else becomes a 500 that does
// not leak a stack trace to the player (it goes to the log instead).
export function guard(handler) {
  return async (ctx) => {
    try {
      return await handler(ctx);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.message, e.status, e.extra || {});
      console.error('unhandled', e && e.stack || e);
      return fail('Something went wrong on the server.', 500);
    }
  };
}

// A coarse, non-reversible client fingerprint for the audit trail (never the raw IP).
// The digest is deterministic ('pg-ip:' + address, first 64 bits) so the same network hashes to
// the same value on every request — that is what makes network bans (migration 0014) and the
// GM console's "same network" match possible without ever storing an address. The first
// X-Forwarded-For entry wins and hex letters are folded to lowercase, so one network cannot
// present two spellings of itself.
async function digestAddress(address) {
  const bits = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pg-ip:' + address));
  return [...new Uint8Array(bits)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function ipHash(request) {
  const raw = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
  if (!raw) return null;
  return digestAddress(raw.split(',')[0].trim().toLowerCase());
}

// Normalise what the GM types into the network-ban box into the stored fingerprint: either a
// fingerprint we already hold (16 hex chars — the form the console shows), or a raw IPv4/IPv6
// literal that is hashed here and never stored raw. Anything else is refused (null) — a
// half-typed string must not become a silent, useless ban row. No ranges/CIDR: bans are exact.
export async function banFingerprint(value) {
  const v = String(value || '').trim().toLowerCase();
  if (/^[0-9a-f]{16}$/.test(v)) return v;
  if (!/^[0-9a-f:.]{3,64}$/.test(v)) return null;
  if (!/[.:]/.test(v)) return null;            // an IP literal always carries '.' or ':'
  if (/[^0-9a-f.:]/.test(v)) return null;      // (belt and braces after the class check)
  return digestAddress(v);
}

export const userAgent = request => (request.headers.get('User-Agent') || '').slice(0, 120) || null;
