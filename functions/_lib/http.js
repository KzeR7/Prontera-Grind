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
export async function ipHash(request) {
  const raw = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
  if (!raw) return null;
  const bits = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pg-ip:' + raw.split(',')[0].trim()));
  return [...new Uint8Array(bits)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const userAgent = request => (request.headers.get('User-Agent') || '').slice(0, 120) || null;
