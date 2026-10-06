// GET  /api/save  -> 200 { version, blob, savedAt, updatedAt, pending: [...] } | 204 (no save yet)
// PUT  /api/save  { version, blob, savedAt } -> 200 { version } | 409 { version, blob, savedAt }
//
// Conflict rule (tools/server-shift-plan.md §5c): the client sends the version it last saw. If the
// server has moved on — another device, another tab — we answer 409 with our copy and the player
// chooses. We never overwrite a newer save with an older one, and the loser is always kept in
// save_history so nothing is unrecoverable.

import { currentUser } from '../_lib/auth.js';
import { json, guard, readJson, fail } from '../_lib/http.js';
import { checkSaveBlob, publicFields } from '../_lib/validate.js';
import * as db from '../_lib/db.js';

const HISTORY_EVERY = 10;   // keep every 10th version in save_history (plus the first)

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  const D = env.DB;

  await db.touchSeen(D, user.id);
  const [row, grants] = [await db.saveByUser(D, user.id), await db.pendingGrants(D, user.id)];
  const pending = grants.results.map(g => ({ id: g.id, kind: g.kind, payload: JSON.parse(g.payload || '{}'), note: g.note }));
  if (!row) return json({ version: 0, blob: null, savedAt: null, pending }, 200);
  return json({ version: row.version, blob: row.blob, savedAt: row.saved_at, updatedAt: row.updated_at, pending });
});

export const onRequestPut = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  const D = env.DB;

  const body = await readJson(request, 600_000);
  const save = checkSaveBlob(body.blob);
  const pub = publicFields(save);
  const savedAt = Number.isFinite(Number(body.savedAt)) ? Math.floor(Number(body.savedAt)) : Date.now();
  const clientVersion = Math.floor(Number(body.version) || 0);

  const row = await db.saveByUser(D, user.id);
  if (!row) {
    await db.insertSave(D, user.id, body.blob, savedAt, pub);
    await db.pushHistory(D, user.id, 1, body.blob, savedAt);
    return json({ version: 1 });
  }
  if (clientVersion !== row.version) {
    // Somebody else (or another tab) wrote first. Hand back the server's copy and let the player pick.
    return json({ conflict: true, version: row.version, blob: row.blob, savedAt: row.saved_at, updatedAt: row.updated_at }, 409);
  }

  const next = row.version + 1;
  await db.updateSave(D, user.id, next, body.blob, savedAt, pub, row.rate_kph);
  if (next % HISTORY_EVERY === 0) {
    await db.pushHistory(D, user.id, next, body.blob, savedAt);
    await db.trimHistory(D, user.id, 5);
  }
  return json({ version: next, bytes: body.blob.length });
});
