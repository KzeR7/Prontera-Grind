// _lib/auth.js — passwords, sessions, cookies, and the GM gate.
//
// Password hashing runs in WebCrypto (PBKDF2-SHA256). The free Workers/Pages plan allows 10ms of CPU
// per request, so the iteration count is chosen to fit with room to spare: measured in Node,
// 20,000 iterations costs ~6ms. The count is stored INSIDE each hash, so it can be raised later
// without breaking anyone — verify() reads the count from the stored string, and login upgrades an
// old hash to the current one when the password is correct.
//
// Everything here is deliberately boring: no clever crypto, no home-made MACs, constant-time
// comparison, and the session token is never stored (only its SHA-256).

import * as db from './db.js';

const ITER = 20000;                     // current work factor (see above)
const MIN_PASS = 10;                    // a server account is worth 10 characters
const SESSION_DAYS = 30;
const COOKIE = 'pg_session';

// ---------------------------------------------------------------- hashing ----
const enc = new TextEncoder();
const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function pbkdf2(password, salt, iterations, bits = 256) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, bits);
}

export async function hashPassword(password, iterations = ITER) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, iterations);
  return `pbkdf2$${iterations}$${toB64(salt)}$${toB64(bits)}`;
}

// Constant-time compare of two base64 strings (the encode is fixed-length per algorithm).
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// -> {ok:boolean, upgrade:string|null}  (upgrade is a fresh hash when the stored cost is behind)
export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return { ok: false, upgrade: null };
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1000 || iterations > 10_000_000) return { ok: false, upgrade: null };
  let bits;
  try { bits = await pbkdf2(password, fromB64(parts[2]), iterations); } catch { return { ok: false, upgrade: null }; }
  const ok = timingSafeEqual(toB64(bits), parts[3]);
  const upgrade = ok && iterations < ITER ? await hashPassword(password) : null;
  return { ok, upgrade };
}

// A recovery code is a password-like secret: 20 chars, hash it the same way and compare types.
export const hashRecovery = code => hashPassword(String(code).toUpperCase(), ITER);
export async function verifyRecovery(code, stored) {
  if (!stored) return false;
  return (await verifyPassword(String(code).toUpperCase(), stored)).ok;
}

// --------------------------------------------------------------- sessions ----
export function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function tokenHash(token) {
  const bits = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const sessionCookie = (token, maxAgeSec = SESSION_DAYS * 86400) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function readCookie(request, name = COOKIE) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// Resolve the caller. Returns null when there is no usable session (the caller answers 401).
// `D` is the D1 handle (env.DB); the SQL lives in _lib/db.js like everywhere else.
export async function currentUser(request, D) {
  const token = readCookie(request);
  if (!token || token.length < 40) return null;
  const hash = await tokenHash(token);
  const row = await db.sessionByToken(D, hash);
  if (!row) return null;
  const now = Date.now();
  if (row.expires_at < now) { await db.deleteSession(D, hash); return null; }
  if (row.banned) return null;
  // rolling expiry: only write when the session is more than a day old on its last refresh
  if (row.expires_at - now < (SESSION_DAYS - 1) * 86400000) {
    await db.touchSession(D, hash, now + SESSION_DAYS * 86400000);
  }
  return { id: row.user_id, username: row.username, gm: row.gm, banned: row.banned, tokenHash: hash };
}

export const isGm = user => !!user && user.gm >= 1;

export { ITER, MIN_PASS, SESSION_DAYS, COOKIE };
