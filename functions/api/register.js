// POST /api/register  { u, p, recovery? }  -> 201 { u, gm, recovery } + session cookie
//
// The first account to register becomes the OWNER (gm=2) — that is how the owner gets a real GM
// account without any bootstrap script or shared secret living in the repo. Every later account is
// a normal player (gm=0); the owner can promote them from the GM console.

import { hashPassword, hashRecovery, newToken, tokenHash, sessionCookie, SESSION_DAYS } from '../_lib/auth.js';
import { json, guard, readJson, ipHash, userAgent, fail } from '../_lib/http.js';
import { checkUsername, checkPassword } from '../_lib/validate.js';
import { MIN_PASS } from '../_lib/auth.js';
import * as db from '../_lib/db.js';

// A human-typeable recovery code: no look-alikes, in four groups.
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function recoveryCode(len = 16) {
  const b = crypto.getRandomValues(new Uint8Array(len));
  return [...b].map(x => ALPHA[x % ALPHA.length]).join('').replace(/(.{4})(?=.)/g, '$1-');
}

export const onRequestPost = guard(async ({ request, env }) => {
  const { u, p, recovery } = await readJson(request, 4096);
  const D = env.DB;
  const username = checkUsername(u);
  const password = checkPassword(p, MIN_PASS);

  const ip = await ipHash(request);
  const gate = await db.hitRate(D, `reg:${ip || 'noip'}`, 10, 3600_000);
  if (!gate.ok) return fail('Too many accounts from here. Try again later.', 429);

  if (await db.userByName(D, username)) return fail('That username is already taken.', 409);

  const first = (await db.countUsers(D)) === 0;
  // tools/dev_server.js can pass DEV_GM_ALL='all' when it runs a throwaway preview copy of this
  // server (in-memory database, wiped on restart, reachable only from the sandbox URL). On a preview
  // every account the owner registers must carry the GM tools, because the account they made last
  // time is gone with the process. PRODUCTION MUST NEVER SET THIS: the first-account rule above is
  // what keeps the owner account safe on the real server.
  const devAll = String(env.DEV_GM_ALL || '') === 'all';
  // A caller may supply their own recovery code (so they can write it down first); otherwise we make
  // one and return it exactly once. Only its hash is stored.
  const code = recovery ? String(recovery).toUpperCase().trim() : recoveryCode();
  if (!/^[A-Z0-9-]{8,32}$/.test(code)) return fail('Recovery code: 8-32 letters, numbers and dashes.', 400);

  await db.insertUser(D, {
    username,
    passHash: await hashPassword(password),
    recoveryHash: await hashRecovery(code),
    gm: (first || devAll) ? 2 : 0,
  });
  const user = await db.userByName(D, username);

  const token = newToken();
  await db.insertSession(D, await tokenHash(token), user.id, Date.now() + SESSION_DAYS * 86400000,
    userAgent(request), ip);
  await db.noteLogin(D, user.id);
  await db.logEvent(D, username, user.id, 'register', first ? 'first account — owner' : devAll ? 'preview account — GM (dev server)' : '');

  return json({ u: user.username, gm: user.gm, recovery: code, first },
    201, { 'Set-Cookie': sessionCookie(token) });
});
