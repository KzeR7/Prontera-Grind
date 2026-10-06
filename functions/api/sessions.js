// POST   /api/sessions   { u, p }        -> 200 { u, gm } + cookie   (login)
// DELETE /api/sessions                   -> 204                     (logout)
//
// Login is rate-limited twice: per IP (to stop a sweep across many names) and per account (to stop a
// sweep against one name). Both counters are cheap rows in D1, and both reset on success.

import { verifyPassword, newToken, tokenHash, sessionCookie, clearCookie, readCookie, SESSION_DAYS }
  from '../_lib/auth.js';
import { json, guard, readJson, ipHash, userAgent, fail } from '../_lib/http.js';
import * as db from '../_lib/db.js';

const MAX_IP_TRIES = 20;      // per 15 minutes
const MAX_NAME_TRIES = 5;     // per 15 minutes
const WINDOW = 900_000;

export const onRequestPost = guard(async ({ request, env }) => {
  const { u, p } = await readJson(request, 4096);
  const D = env.DB;
  const name = String(u || '').trim();
  if (!name || !p) return fail('Enter a username and password.', 400);

  const ip = await ipHash(request);
  const byIp = await db.hitRate(D, `login-ip:${ip || 'noip'}`, MAX_IP_TRIES, WINDOW);
  if (!byIp.ok) return fail('Too many login attempts. Try again in a few minutes.', 429, { retryAfter: byIp.retryAfter });

  const user = await db.userByName(D, name);
  // Same message for "no such user" and "wrong password": never confirm which names exist.
  const reject = async () => {
    if (user) await db.noteFailure(D, user.id, WINDOW);
    await db.logEvent(D, name, user ? user.id : null, 'login-failed', ip ? `ip ${ip}` : null);
    return fail('Incorrect username or password.', 401);
  };
  if (!user) return reject();
  if (user.banned) return fail('This account is suspended. Contact the GM.', 403);
  if (user.fail_count >= MAX_NAME_TRIES && Date.now() - user.fail_at < WINDOW) {
    return fail('Too many attempts for this account. Wait 15 minutes.', 429);
  }

  const { ok, upgrade } = await verifyPassword(String(p), user.pass_hash);
  if (!ok) return reject();
  if (upgrade) await db.setPassword(D, user.id, upgrade);   // raise the cost of an old hash

  const token = newToken();
  await db.insertSession(D, await tokenHash(token), user.id, Date.now() + SESSION_DAYS * 86400000,
    userAgent(request), ip);
  await db.noteLogin(D, user.id);
  await db.clearRate(D, `login-ip:${ip || 'noip'}`);
  await db.touchSeen(D, user.id);
  await db.logEvent(D, user.username, user.id, 'login', null);

  return json({ u: user.username, gm: user.gm }, 200, { 'Set-Cookie': sessionCookie(token) });
});

export const onRequestDelete = guard(async ({ request, env }) => {
  const token = readCookie(request);
  if (token) await db.deleteSession(env.DB, await tokenHash(token));
  return new Response(null, { status: 204, headers: { 'Set-Cookie': clearCookie() } });
});
