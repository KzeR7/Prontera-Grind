// GM review of client-reported damage observations (read-only) plus the verdict on automatic
// save-audit flags (0016). Nothing here changes a save, a score or a ban: clearing a flag only
// says "a human looked at this evidence and it is explained", and reopening says "it is not".
import { currentUser, isGm } from '../../_lib/auth.js';
import { json, guard, readJson, fail } from '../../_lib/http.js';
import { AUDIT_LABELS } from '../../_lib/save-audit.js';
import * as db from '../../_lib/db.js';

const ACTION_EVENT = { clear: 'gm-flag-clear', reopen: 'gm-flag-reopen' };
const flagLabel = kind => (AUDIT_LABELS[kind] || (kind.startsWith('rate:') ? 'Rate: ' + kind.slice(5) : kind));

export const onRequestGet = guard(async ({request,env}) => {
  const user=await currentUser(request,env.DB);
  if(!user)return fail('Not logged in.',401);
  if(!isGm(user))return fail('Not a GM.',403);
  const value=new URL(request.url).searchParams.get('id');
  let playerId=null;
  if(value!==null){
    if(!/^[1-9][0-9]*$/.test(value)||!Number.isSafeInteger(Number(value)))return fail('Invalid player.',400);
    playerId=Number(value);
    if(!await db.userById(env.DB,playerId))return fail('No such account.',404);
  }
  try {
    const results=playerId===null ? await db.recentDamageAlerts(env.DB,100) : await db.damageSamplesFor(env.DB,playerId);
    return json(playerId===null ? {alerts:results.results} : {samples:results.results});
  } catch(e) {
    if(/no such table/i.test(String(e?.message||e)))return fail('Damage monitoring has not been set up on this database.',503);
    throw e;
  }
});

// POST { id, kind, action: 'clear' | 'reopen' }
// The flag row is never deleted: clearing stamps who reviewed it and when, so the console keeps
// the trail and can reopen the verdict. A rule that fires again reopens the flag on its own (the
// audit's upsert resets the stamp), which is why clearing is not an immunity.
export const onRequestPost = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  if (!isGm(user)) return fail('Not a GM.', 403);
  const body = await readJson(request, 2048);
  const id = Math.floor(Number(body.id));
  if (!Number.isInteger(id) || id <= 0) return fail('Which player? (id)', 400);
  const action = String(body.action || '');
  const kind = String(body.kind || '').trim();
  if (!ACTION_EVENT[action]) return fail("Unknown flag action (clear or reopen).", 400);
  if (!/^[a-z0-9][a-z0-9:_-]{0,59}$/.test(kind)) return fail('Unknown flag rule.', 400);
  if (!AUDIT_LABELS[kind] && !kind.startsWith('rate:')) return fail('Unknown flag rule.', 400);
  const target = await db.userById(env.DB, id);
  if (!target) return fail('No such account.', 404);

  const res = action === 'clear'
    ? await db.clearSaveAlert(env.DB, id, kind, user.username)
    : await db.reopenSaveAlert(env.DB, id, kind, user.username);
  if (res.missing) return fail('Save-audit review has not been set up on this database yet.', 503);
  if (!res.changed) {
    return fail(action === 'clear' ? 'That flag is already cleared.' : 'That flag is not cleared.', 409);
  }
  await db.logEvent(env.DB, user.username, id,
    ACTION_EVENT[action],
    (action === 'clear' ? 'flag cleared after review: ' : 'flag reopened for review: ') + flagLabel(kind));
  return json({
    ok: true, action, kind, changed: res.changed,
    note: action === 'clear'
      ? 'Flag cleared. It stays here as history and reopens by itself if the rule fires again.'
      : 'Flag reopened. The account carries it again.',
  });
});
