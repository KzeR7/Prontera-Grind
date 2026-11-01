// GET    /api/friends                    -> { friends, incoming, outgoing, installed, limit }
// GET    /api/friends?who=<name>         -> { player:{id,name,friends,following,self,since}, installed }
// POST   /api/friends { action, name }   -> request | accept | remove  (see _lib/friends.js)
//
// The friends list is account-to-account and server-side, so it survives a save reset and cannot be
// forged from the browser. `who` is what the World/Whisper chat asks before showing "Add friend":
// it says whether this player already is one, has a request waiting, or is a stranger.
//
// Until migrations/0012_friends.sql is applied every route answers 503 with installed:false, and
// the game hides the panel rather than failing at something a player cannot see.

import { currentUser } from '../_lib/auth.js';
import { json, guard, readJson, fail } from '../_lib/http.js';
import * as db from '../_lib/db.js';
import {
  FRIEND_LIMIT, PENDING_LIMIT, NOT_INSTALLED, friendsInstalled, listFor,
  pairRow, friendRequest, friendAccept, friendRemove, accountByName,
} from '../_lib/friends.js';

const NAME_MAX = 32;
const cleanName = v => String(v || '').trim().slice(0, NAME_MAX);

export const onRequestGet = guard(async ({ request, env }) => {
  const D = env.DB;
  const user = await currentUser(request, D);
  if (!user) return fail('Not logged in.', 401);
  if (!(await friendsInstalled(D))) return fail(NOT_INSTALLED, 503, { installed: false });
  const url = new URL(request.url);
  const who = cleanName(url.searchParams.get('who'));

  if (!who) {
    const list = await listFor(D, user.id);
    return json({ ok: true, installed: true, ...list, limit: FRIEND_LIMIT });
  }

  // One player, resolved by name: the chat's "is this someone I already know" question.
  const target = await accountByName(D, who);
  if (!target) return json({ ok: true, installed: true, player: null });
  const row = target.id === user.id ? null : await pairRow(D, user.id, target.id);
  return json({
    ok: true, installed: true,
    player: {
      id: target.id, name: target.username, self: target.id === user.id,
      friends: !!row && row.state === 'accepted',
      incoming: !!row && row.state === 'pending' && row.addressee_id === user.id,
      outgoing: !!row && row.state === 'pending' && row.requester_id === user.id,
      since: row && row.state === 'accepted' ? Number(row.accepted_at || row.created_at) || 0 : 0,
      online: false,                    // the chat knows who is connected; the database does not
    },
  });
});

export const onRequestPost = guard(async ({ request, env }) => {
  const D = env.DB;
  const user = await currentUser(request, D);
  if (!user) return fail('Not logged in.', 401);
  if (user.banned) return fail('This account is suspended.', 403);
  if (!(await friendsInstalled(D))) return fail(NOT_INSTALLED, 503, { installed: false });

  const body = await readJson(request, 2048);
  const action = String(body.action || '');
  const name = cleanName(body.name);
  if (!['request', 'accept', 'remove'].includes(action)) return fail('Unknown action.', 400);
  if (!name) return fail('Which player?', 400);

  // A name typed by a person is not an attack on the database — but asking repeatedly is noise, so
  // the shared rate limiter (which every other write path already uses) caps the attempts.
  const rate = await db.hitRate(D, 'friends:' + user.id, 30, 60 * 1000);
  if (!rate.ok) return fail('Too many friend actions. Try again in a minute.', 429);

  const target = await accountByName(D, name);
  // Names are typed by people, so a typo is answered as a sentence - not as the 404 that friendRequest
  // raises for a caller that already had an account in hand.
  if (!target) return fail('No player called ' + name + '. Check the spelling - names are 2-16 letters, numbers, _ . or -.', 404, { code: 'no-such-player' });
  const result = action === 'request'
    ? await friendRequest(D, user.id, target)
    : action === 'accept'
      ? await friendAccept(D, user.id, target)
      : await friendRemove(D, user.id, target);

  if (result.changed) {
    const kinds = { requested: 'friend-request', accepted: 'friend-accepted', unfriended: 'friend-removed', declined: 'friend-declined', cancelled: 'friend-cancelled' };
    await db.logEvent(D, user.username, target.id, kinds[result.code] || 'friend', user.username + ' -> ' + target.username);
  }
  const list = await listFor(D, user.id);
  return json({ ok: true, installed: true, action, code: result.code, changed: !!result.changed,
    player: result.target ? { id: result.target.id, name: result.target.username } : null,
    ...list, limit: FRIEND_LIMIT });
});

export { FRIEND_LIMIT, PENDING_LIMIT };
