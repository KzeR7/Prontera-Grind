// GET  /api/grants         -> { grants: [{id, kind, payload, note, at, from}] }
// POST /api/grants { ids }  -> marks those grants claimed (the client has applied them to its save)
//
// A grant is applied by the CLIENT, which owns the save format and its repair rules — see
// tools/gm-panel-plan.md §4. Gift, equipment and Fishing/DigiPet system grants require a matching
// saved GM receipt before they can be claimed; a claim only ever matches the caller's own queue.

import { currentUser } from '../_lib/auth.js';
import { json, guard, readJson, fail, unauth } from '../_lib/http.js';
import * as db from '../_lib/db.js';

const shape = g => ({
  id: g.id, kind: g.kind, payload: JSON.parse(g.payload || '{}'), note: g.note,
  at: g.created_at, from: g.created_by,
  // v401: gifts vanish 5 days after they are sent, so the client can say when rather than let one
  // disappear silently. The server is still the authority - this is only for display.
  expiresAt: db.grantExpiresAt(g.created_at),
});

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return await unauth(request);
  const rows = await db.pendingGrants(env.DB, user.id);
  return json({ grants: rows.results.map(shape), owner: user.username });
});

export const onRequestPost = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return await unauth(request);
  const { ids } = await readJson(request, 4096);
  const list = Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger).slice(0, 100) : [];
  const pending=await db.pendingGrants(env.DB,user.id);
  const stored=await db.saveByUser(env.DB,user.id);
  const receipts=stored?JSON.parse(stored.blob).gmReceipts||[]:[];
  const durable=list.filter(id=>{const g=pending.results.find(g=>g.id===id);return !!g&&(!['gift','equipment','systems'].includes(g.kind)||receipts.includes(id))});
  await db.claimGrants(env.DB, user.id, durable);
  return json({ ok: true, claimed: durable.length });
});
