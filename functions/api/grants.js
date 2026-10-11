// GET  /api/grants         -> { grants: [{id, kind, payload, note, at, from}] }
// POST /api/grants { ids }  -> marks those grants claimed (the client has applied them to its save)
//
// A grant is applied by the CLIENT, which owns the save format and its repair rules — see
// tools/gm-panel-plan.md §4. The server's job is to keep the queue exactly-once: the client applies
// and then claims, and a claim only ever matches grants belonging to the caller.

import { currentUser } from '../_lib/auth.js';
import { json, guard, readJson, fail } from '../_lib/http.js';
import * as db from '../_lib/db.js';

const shape = g => ({
  id: g.id, kind: g.kind, payload: JSON.parse(g.payload || '{}'), note: g.note,
  at: g.created_at, from: g.created_by,
});

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  const rows = await db.pendingGrants(env.DB, user.id);
  return json({ grants: rows.results.map(shape), owner: user.username });
});

export const onRequestPost = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  const { ids } = await readJson(request, 4096);
  const list = Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger).slice(0, 100) : [];
  const pending=await db.pendingGrants(env.DB,user.id);
  const stored=await db.saveByUser(env.DB,user.id);
  const receipts=stored?JSON.parse(stored.blob).gmReceipts||[]:[];
  const durable=list.filter(id=>{const g=pending.results.find(g=>g.id===id);return g&&!['gift','equipment'].includes(g.kind)||receipts.includes(id)});
  await db.claimGrants(env.DB, user.id, durable);
  return json({ ok: true, claimed: durable.length });
});
