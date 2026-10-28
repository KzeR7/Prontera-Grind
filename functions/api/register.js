// POST /api/register  { u, p, email }  -> 201 { u, gm, recovery } + session cookie
//
// Public registration creates normal players only. Owner provisioning is an offline D1 operation.

import { hashPassword, hashRecovery, newToken, tokenHash, sessionCookie, SESSION_DAYS } from '../_lib/auth.js';
import { json, guard, readJson, ipHash, userAgent, fail } from '../_lib/http.js';
import { checkUsername, checkPassword, checkEmail } from '../_lib/validate.js';
import { MIN_PASS } from '../_lib/auth.js';
import * as db from '../_lib/db.js';

// A human-typeable recovery code: no look-alikes, in four groups.
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function recoveryCode(len = 16) {
  const b = crypto.getRandomValues(new Uint8Array(len));
  return [...b].map(x => ALPHA[x % ALPHA.length]).join('').replace(/(.{4})(?=.)/g, '$1-');
}

export const onRequestPost = guard(async ({ request, env }) => {
  const { u, p, email } = await readJson(request, 4096);
  const D = env.DB;
  const username = checkUsername(u);
  const password = checkPassword(p, MIN_PASS);
  const address = checkEmail(email);

  const ip = await ipHash(request);
  const gate = await db.hitRate(D, `reg:${ip || 'noip'}`, 10, 3600_000);
  if (!gate.ok) return fail('Too many accounts from here. Try again later.', 429);

  if (await db.userByName(D, username)) return fail('That username is already taken.', 409);

  // Public registrations never grant privileges, even on an empty database. Existing
  // owners are unaffected. Only the explicitly disposable preview can grant GM.
  const devAll = String(env.DEV_GM_ALL || '') === 'all';
  const code = recoveryCode();
  try {
    await db.insertUser(D, { username, email: address,
      passHash: await hashPassword(password), recoveryHash: await hashRecovery(code),
      gm: devAll ? 2 : 0 });
  } catch (e) {
    if (/unique constraint/i.test(String(e?.message || e))) return fail('That username or email is already in use.', 409);
    throw e;
  }
  const user = await db.userByName(D, username);

  const token = newToken();
  const hash = await tokenHash(token);
  await db.insertSession(D, hash, user.id, Date.now() + SESSION_DAYS * 86400000,
    userAgent(request), ip);
  await db.deleteOtherSessions(D, user.id, hash);   // one live session per account, see sessions.js
  await db.noteLogin(D, user.id);
  await db.logEvent(D, username, user.id, 'register', devAll ? 'preview account — GM (dev server)' : '');

  return json({ u: user.username, gm: user.gm, recovery: code },
    201, { 'Set-Cookie': sessionCookie(token) });
});
