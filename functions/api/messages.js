// GET  /api/messages       -> { messages: [{id, body, kind, at, from}] }
// POST /api/messages       { ids: [...] }  -> marks those as read
//
// Announcements are read at login and shown in the game log. The server only has to answer "what has
// this player not seen yet", which is one indexed query.

import { currentUser } from '../_lib/auth.js';
import { json, guard, readJson, fail } from '../_lib/http.js';
import * as db from '../_lib/db.js';

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  const rows = await db.unreadMessages(env.DB, user.id, 20);
  return json({
    messages: rows.results.map(m => ({ id: m.id, body: m.body, kind: m.kind, at: m.created_at, from: m.created_by })),
  });
});

export const onRequestPost = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  const { ids } = await readJson(request, 2048);
  const list = Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger).slice(0, 50) : [];
  await db.markRead(env.DB, user.id, list);
  return json({ ok: true, marked: list.length });
});
