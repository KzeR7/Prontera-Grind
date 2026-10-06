// _lib/http.js — small request/response helpers shared by every endpoint.

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

export const fail = (message, status = 400, extra = {}) => json({ err: message, ...extra }, status);

// Read a JSON body with a hard size cap before parsing: a 100 MB body must never reach JSON.parse.
export async function readJson(request, maxBytes = 600_000) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len && len > maxBytes) throw new HttpError(413, 'That is too large.');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'That is too large.');
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
  constructor(status, message) { super(message); this.status = status; }
}

// Wrap a handler so a thrown HttpError becomes its status and anything else becomes a 500 that does
// not leak a stack trace to the player (it goes to the log instead).
export function guard(handler) {
  return async (ctx) => {
    try {
      return await handler(ctx);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.message, e.status);
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
