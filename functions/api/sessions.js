// POST   /api/sessions   { u, p }        -> 200 { u, gm } + cookie   (login)
// DELETE /api/sessions                   -> 204                     (logout)
//
// Login is rate-limited twice: per IP (to stop a sweep across many names) and per account (to stop a
// sweep against one name). Both counters are cheap rows in D1, and both reset on success.

import { verifyPassword, newToken, tokenHash, sessionCookie, clearCookie, readCookie, SESSION_DAYS }
  from '../_lib/auth.js';
import { json, guard, readJson, ipHash, userAgent, fail } from '../_lib/http.js';
import { verifyTurnstile } from '../_lib/turnstile.js';
import * as db from '../_lib/db.js';

const MAX_IP_TRIES = 20;      // per 15 minutes
const MAX_NAME_TRIES = 5;     // per 15 minutes
const WINDOW = 900_000;

export const onRequestPost = guard(async ({ request, env }) => {
  const { u, p, turnstile } = await readJson(request, 8192);
  const D = env.DB;
  const name = String(u || '').trim();
  if (!name || !p) return fail('Enter a username and password.', 400);
  const human = await verifyTurnstile(env, request, turnstile);
  if (!human.ok) return fail('Human check failed. Refresh and try again.', 403);

  const ip = await ipHash(request);
  const byIp = await db.hitRate(D, `login-ip:${ip || 'noip'}`, MAX_IP_TRIES, WINDOW);
  if (!byIp.ok) return fail('Too many login attempts. Try again in a few minutes.', 429, { retryAfter: byIp.retryAfter });

  // Atomic per-name window complements the legacy failure counter under concurrency.
  const byName = await db.hitRate(D, `login-name:${name.toLowerCase()}`, MAX_NAME_TRIES, WINDOW);
  if (!byName.ok) return fail('Too many attempts for this account. Wait 15 minutes.', 429);

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
  const token = newToken();
  const hash = await tokenHash(token);
  const created = await db.startVerifiedSession(D, {
    tokenHash: hash, userId: user.id, expectedHash: user.pass_hash, upgradeHash: upgrade,
    expiresAt: Date.now() + SESSION_DAYS * 86400000, ua: userAgent(request), ipHash: ip,
  });
  // Password, ban or account state changed while password verification was in flight.
  if (!created) return fail('Account details changed. Please sign in again.', 401);
  await db.clearRate(D, `login-ip:${ip || 'noip'}`);
  await db.clearRate(D, `login-name:${name.toLowerCase()}`);
  // NO touchSeen here. saves.last_seen is the OFFLINE away baseline (a claim pays for
  // now - last_seen), and a returning player signs in BEFORE the game asks for its claim - a
  // login that moved the baseline erased the player's own away window, so cloud accounts
  // silently stopped receiving offline rewards (the local no-cloud path was never affected).
  // The sign-in itself is recorded in users.last_login_at (in the verified-session transaction) for the GM player
  // list, and the away baseline moves on the first save exchange of the session (GET/PUT
  // /api/save), which is the server-observed return the offline reward is timed from.
  await db.logEvent(D, user.username, user.id, 'login', null);

  // v280: the login answer carries the durable account id, so the very first sync can stamp the save
  // with it instead of waiting for a later /api/me poll.
  return json({ u: user.username, id: user.id, gm: user.gm }, 200, { 'Set-Cookie': sessionCookie(token) });
});

export const onRequestDelete = guard(async ({ request, env }) => {
  const token = readCookie(request);
  if (token) await db.deleteSession(env.DB, await tokenHash(token));
  return new Response(null, { status: 204, headers: { 'Set-Cookie': clearCookie() } });
});
