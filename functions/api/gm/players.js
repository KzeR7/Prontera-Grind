// GET /api/gm/players -> { players: [...] , me }
//
// The GM console's front page: one row per account with what a GM needs to make a decision —
// level, class, when they last synced, save size, and any flags. Deliberately no save blobs here:
// a blob is only fetched when a GM opens one player (see player.js), so the list stays cheap.

import { currentUser, isGm } from '../../_lib/auth.js';
import { json, guard, fail } from '../../_lib/http.js';
import * as db from '../../_lib/db.js';

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  if (!isGm(user)) return fail('Not a GM.', 403);

  const rows = await db.allUsers(env.DB, 200);
  const bannedNets = new Set((await db.listIpBans(env.DB, 1000)).map(b => b.ip_hash));
  // Both lookups fail open on their own (missing 0014/0015), so the list always loads — a not-yet
  // applied migration must never leave the signed-out-looking console with no controls.
  const alerted = await db.alertedUserIds(env.DB);
  const players = rows.results.map(r => ({
    id: r.id, u: r.username, gm: r.gm, banned: !!r.banned,
    // 🚫 marker in the console: this account's CURRENT session comes from a suspended network —
    // the usual shape of "he came back on a new name". Derived, never a client value.
    netBanned: !!(r.ip_fp && bannedNets.has(r.ip_fp)),
    // ⚠ marker: this account carries a save-audit flag (0015) — review-only, see the card.
    alerted: alerted.has(Number(r.id)),
    level: r.level, cls: r.cls, version: r.version ?? 0,
    lastSync: r.updated_at ?? null, lastLogin: r.last_login_at ?? null, created: r.created_at,
    hasSave: r.version != null,
  }));
  return json({ players, me: { u: user.username, gm: user.gm } });
});
