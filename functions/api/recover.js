// Reset with username + registered email + one-time recovery code, never email alone.
// Addresses are not yet verified; do not treat them as an authentication factor by themselves.
import { hashPassword, hashRecovery, verifyRecovery } from '../_lib/auth.js';
import { checkEmail, checkPassword, USERNAME_RE } from '../_lib/validate.js';
import { MIN_PASS } from '../_lib/auth.js';
import { guard, readJson, ipHash, fail, json } from '../_lib/http.js';
import { recoveryCode } from './register.js';
import * as db from '../_lib/db.js';

export const onRequestPost = guard(async ({request, env}) => {
  const body = await readJson(request, 4096);
  const username = typeof body.u === 'string' ? body.u.trim() : '';
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const ip = await ipHash(request);
  const byIp = await db.hitRate(env.DB, `recover-ip:${ip || 'noip'}`, 20, 900000);
  if (!byIp.ok) return fail('Too many recovery attempts. Try again later.', 429);
  if (!USERNAME_RE.test(username)) return fail('Recovery details are incorrect or unavailable.', 400);
  const byName = await db.hitRate(env.DB, `recover-name:${username.toLowerCase()}`, 5, 900000);
  if (!byName.ok) return fail('Too many recovery attempts. Try again later.', 429);
  let email;
  try { email = checkEmail(body.email); } catch { return fail('Recovery details are incorrect or unavailable.', 400); }
  const password = checkPassword(body.p, MIN_PASS);
  const user = await db.userByName(env.DB, username);
  if (!user || user.banned || !user.email || user.email.toLowerCase() !== email ||
      !/^[A-Z0-9-]{8,32}$/.test(code) || !await verifyRecovery(code, user.recovery_hash)) {
    return fail('Recovery details are incorrect or unavailable.', 400);
  }
  const nextCode = recoveryCode();
  const [passwordHash, nextRecoveryHash] = await Promise.all([hashPassword(password), hashRecovery(nextCode)]);
  // Compare-and-swap consumes the old recovery hash exactly once. The guarded session
  // deletion shares the same D1 transaction, so a racing loser cannot revoke sessions.
  const results = await env.DB.batch([
    env.DB.prepare('UPDATE users SET pass_hash = ?, recovery_hash = ?, fail_count = 0, fail_at = 0 WHERE id = ? AND recovery_hash = ? AND banned = 0')
      .bind(passwordHash, nextRecoveryHash, user.id, user.recovery_hash),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND recovery_hash = ?)')
      .bind(user.id, user.id, nextRecoveryHash),
    env.DB.prepare("INSERT INTO events(at, actor, user_id, kind, detail) SELECT ?, ?, id, 'password-recovered', 'sessions revoked' FROM users WHERE id = ? AND recovery_hash = ?")
      .bind(Date.now(), username, user.id, nextRecoveryHash),
  ]);
  if (!Number(results?.[0]?.meta?.changes ?? results?.[0]?.meta?.rows_written ?? 0))
    return fail('Recovery details are incorrect or unavailable.', 400);
  return json({ok:true, recovery:nextCode});
});
