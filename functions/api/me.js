// GET /api/me -> 200 { u, gm, recoverySet } | 401
//
// The client calls this first on load: it is how the game knows the API exists at all, and whether
// this browser already has a session (so it can offer "continue as <name>" instead of showing the
// login card). A 401 here is normal and means "not logged in", not "broken".

import { currentUser } from '../_lib/auth.js';
import { json, guard } from '../_lib/http.js';
import { userById } from '../_lib/db.js';

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return json({ err: 'Not logged in.' }, 401);
  const row = await userById(env.DB, user.id);
  // v280: `id` lets the client stamp its save with the durable account identity, so a rename (which
  // changes the name, never the id) cannot strand the save. It is the caller's own id and nothing
  // else, so exposing it reveals nothing about other accounts.
  return json({ u: user.username, id: user.id, gm: user.gm, recoverySet: !!row?.recovery_hash });
});
