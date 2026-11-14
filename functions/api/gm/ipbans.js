// GET  /api/gm/ipbans                       -> { bans: [{ fp, note, by, at }] }
// POST /api/gm/ipbans { action, ... }       -> { ok, ... } + audit row, always
//
//   add    { value, note? }   - suspend a network. `value` is either a raw IPv4/IPv6 address
//                               (hashed here, never stored raw) or a 16-hex fingerprint exactly
//                               as the console displays it. GM only, like every /api/gm/* route.
//   remove { fp }             - lift one suspension by its fingerprint.
//
// This endpoint is the list behind the GM console's "Network bans" card: every row is one
// suspended network with who suspended it, when, and why (note). Enforcement is in
// functions/api/_middleware.js (all /api traffic) plus sessions.js / register.js / recover.js;
// the owner (gm>=2) can always still sign in to undo a ban from this page.

import { currentUser, isGm } from '../../_lib/auth.js';
import { json, guard, readJson, fail, banFingerprint } from '../../_lib/http.js';
import * as db from '../../_lib/db.js';

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  if (!isGm(user)) return fail('Not a GM.', 403);
  const bans = await db.listIpBans(env.DB, 500);
  return json({
    bans: bans.map(b => ({ fp: b.ip_hash, note: b.note, by: b.created_by, at: b.created_at })),
  });
});

export const onRequestPost = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  if (!isGm(user)) return fail('Not a GM.', 403);
  const body = await readJson(request, 8192);
  const action = String(body.action || '');
  const audit = (kind, detail) => db.logEvent(env.DB, user.username, null, kind, detail);

  if (action === 'add') {
    const fp = await banFingerprint(body.value);
    if (!fp) return fail('Enter a valid IP address (e.g. 203.0.113.7) or fingerprint.', 400);
    const note = String(body.note || '').trim().slice(0, 140);
    await db.ipBanStatement(env.DB, fp, note, user.username).run();
    // Kick every live session created from this network: a ban that lets the current tab
    // finish its sync is not a ban.
    await db.sessionsOnNetworksStatement(env.DB, [fp]).run();
    await audit('gm-ip-ban', `network ${fp}${note ? ' — ' + note : ''}`.slice(0, 500));
    return json({ ok: true, fp, note: 'Network suspended. Sign-in and new accounts are blocked there.' });
  }

  if (action === 'remove') {
    const fp = await banFingerprint(body.fp ?? body.value);
    if (!fp) return fail('Which network? (fingerprint)', 400);
    const result = await db.ipUnbanStatement(env.DB, fp).run();
    const changed = Number(result?.meta?.changes ?? result?.meta?.rows_written ?? 0);
    if (!changed) return fail('That network is not suspended.', 404);
    await audit('gm-ip-unban', `network ${fp}`);
    return json({ ok: true, fp, note: 'Network restored. Sign-in is open there again.' });
  }

  return fail('Unknown action.', 400);
});
