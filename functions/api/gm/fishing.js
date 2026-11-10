// GET  /api/gm/fishing -> safe catalog for the console's fishing controls
// POST /api/gm/fishing { room, species } -> authenticated manual MVP spawn through the private Social DO
import { currentUser, isGm } from '../../_lib/auth.js';
import { json, guard, readJson, fail } from '../../_lib/http.js';
import { FISHING_BAIT, FISHING_MVP, FISHING_RODS, SOCIAL_ROOM_CAP } from '../../_lib/gm-systems.js';
import * as db from '../../_lib/db.js';

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  if (!isGm(user)) return fail('Not a GM.', 403);
  return json({ mvp: FISHING_MVP, rods: FISHING_RODS, bait: FISHING_BAIT, roomCap: SOCIAL_ROOM_CAP });
});

export const onRequestPost = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  if (!isGm(user)) return fail('Not a GM.', 403);
  const body = await readJson(request, 2048);
  const room = body.room;
  const species = body.species === '' || body.species == null ? null : body.species;
  if (!Number.isInteger(room) || room < 1 || room > SOCIAL_ROOM_CAP) {
    return fail(`Choose a plaza room from 1 to ${SOCIAL_ROOM_CAP}.`, 400);
  }
  if (species !== null && (typeof species !== 'string' || !FISHING_MVP.some(item => item.id === species))) {
    return fail('Choose a known Fishing MVP or Random MVP.', 400);
  }
  if (!env.SOCIAL) return fail('Social service is not configured.', 503);
  const requested = FISHING_MVP.find(item => item.id === species)?.label || 'Random MVP';
  // Write the intent before touching the Social room. A D1 outage must fail closed rather than
  // allow an unlogged spawn; the follow-up row records whether the private service accepted it.
  await db.logEvent(env.DB, user.username, null, 'gm-fishing-mvp-request', `room ${room}: ${requested}`);

  let response;
  try {
    response = await env.SOCIAL.get(env.SOCIAL.idFromName('world')).fetch(new Request('https://social/gm/fishing-mvp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // This identity is resolved from the D1 session above; the browser never supplies a GM flag.
        'X-Social-Admin': JSON.stringify({ id: user.id, username: user.username, gm: Number(user.gm) }),
      },
      body: JSON.stringify({ room, species }),
    }));
  } catch {
    await db.logEvent(env.DB, user.username, null, 'gm-fishing-mvp-failed', `room ${room}: Social service request failed`);
    return fail('The Social service could not reach that plaza room.', 503);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    await db.logEvent(env.DB, user.username, null, 'gm-fishing-mvp-failed', `room ${room}: ${String(result.err || `HTTP ${response.status}`).slice(0, 250)}`);
    return fail(result.err || 'The Social room could not spawn an MVP.', response.status);
  }

  const label = FISHING_MVP.find(item => item.id === result.sp)?.label || result.sp;
  await db.logEvent(env.DB, user.username, null, 'gm-fishing-mvp', `room ${room}: ${label} · ${result.id}`);
  return json({ ...result, label, note: `${label} spawned in plaza room ${room} for 10 minutes.` });
});
