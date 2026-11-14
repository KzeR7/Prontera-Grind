// GET  /api/gm/announcements         -> the announcement gift campaigns and whether they are open
// POST /api/gm/announcements { id, action: 'close' | 'reopen' }
//
// 0017: a "to everyone" announcement's letter always reached players who joined later (one
// broadcast row), but its GIFT was fanned out to the accounts that existed at send time and never
// to anyone after. The gift now also lives in `announcement_gifts` as a campaign, and registration
// replays open campaigns to the new account. This endpoint is how a GM ends that: closing stops
// future grants and takes nothing back; reopening hands it out again.
import { currentUser, isGm } from '../../_lib/auth.js';
import { json, guard, readJson, fail } from '../../_lib/http.js';
import * as db from '../../_lib/db.js';

const shape = g => ({
  messageId: Number(g.message_id),
  kind: g.kind,
  label: g.label || '',
  note: g.note || '',
  body: g.message_body || '',
  createdBy: g.created_by || '',
  createdAt: g.created_at,
  closed: !!g.closed_at,
  closedAt: g.closed_at || null,
  closedBy: g.closed_by || '',
});

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  if (!isGm(user)) return fail('Not a GM.', 403);
  const rows = await db.listAnnouncementGifts(env.DB, 40);
  return json({ gifts: (rows.results || []).map(shape), ready: !rows.error });
});

export const onRequestPost = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  if (!isGm(user)) return fail('Not a GM.', 403);
  const body = await readJson(request, 2048);
  const id = Math.floor(Number(body.id));
  const action = String(body.action || '');
  if (!Number.isInteger(id) || id <= 0) return fail('Which announcement? (id)', 400);
  if (!['close', 'reopen'].includes(action)) return fail('Unknown action (close or reopen).', 400);
  const res = action === 'close'
    ? await db.closeAnnouncementGift(env.DB, id, user.username)
    : await db.reopenAnnouncementGift(env.DB, id, user.username);
  if (res.missing) return fail('Gift campaigns have not been set up on this database yet.', 503);
  if (!res.changed) return fail(action === 'close' ? 'That gift is already closed.' : 'That gift is not closed.', 409);
  await db.logEvent(env.DB, user.username, null,
    action === 'close' ? 'gm-announce-gift-close' : 'gm-announce-gift-reopen',
    'announcement #' + id + (action === 'close' ? ' stops going to new accounts' : ' goes to new accounts again'));
  return json({
    ok: true, action, id,
    note: action === 'close'
      ? 'Closed. Players who join from now on will not receive this gift; anything already delivered stays.'
      : 'Reopened. New accounts receive this gift again.',
  });
});
