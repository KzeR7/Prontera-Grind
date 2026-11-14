// GET /api/gm/log -> { events: [{at, actor, u, kind, detail}] }
//
// "No GM action without a row here" (gm-panel-plan §6.4). The console shows this list, and it is the
// answer to "who set this player to Lv150?" — including when the answer is "me, by accident".

import { currentUser, isGm } from '../../_lib/auth.js';
import { json, guard, fail } from '../../_lib/http.js';
import * as db from '../../_lib/db.js';

const NICE = {
  register: 'Account created', login: 'Logged in', 'login-failed': 'Failed login',
  'gm-note': 'GM note', 'gm-set-password': 'Password reset', 'gm-set-level': 'GM level changed',
  'gm-ban': 'Suspended', 'gm-unban': 'Unsuspended', 'gm-logout': 'Signed out everywhere',
  'gm-ip-ban': 'Network suspended', 'gm-ip-unban': 'Network restored',
  // Save audit (0015): the server's own "this save cannot be honest" verdict, logged the first
  // time a rule fires for an account so the player's log shows what the flag was about.
  'save-alert': 'Suspicious save',
  'gm-grant': 'Sent something', 'gm-systems': 'Fishing / DigiPet resources',
  'gm-fishing-mvp-request': 'Fishing MVP spawn requested', 'gm-fishing-mvp': 'Fishing MVP spawned', 'gm-fishing-mvp-failed': 'Fishing MVP spawn failed or refused',
  'gm-announce': 'Announcement', 'gm-restore': 'Save restored',
};

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  if (!isGm(user)) return fail('Not a GM.', 403);
  const rows = await db.recentEvents(env.DB, 200);
  const names = new Map((await db.allUsers(env.DB, 200)).results.map(u => [u.id, u.username]));
  return json({
    events: rows.results.map(e => ({
      at: e.at, actor: e.actor, u: e.user_id ? (names.get(e.user_id) || '#' + e.user_id) : null,
      kind: e.kind, label: NICE[e.kind] || e.kind, detail: e.detail,
    })),
  });
});
