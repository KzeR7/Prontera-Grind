// GET /api/mailbox  -> { mail: [{id, kind, payload, note, from, at, expiresAt}], ttlDays }
//
// v401 (owner: "i want endless echo payout to be on mail & with expiry. so 5 days without claim,
// rewards will vanish."). Mailbox gifts, Cash Shop deliveries and Endless Echo prizes share the
// five-day grants queue. D1-settled Rift Raid resources are applied through cloud sync and remain
// pending until claimed; they are not mail attachments and are omitted from this mailbox view.
//
// The deadline is the server's, not the client's: `expiresAt` is computed here from created_at and
// the 5-day window, and it is advisory only — pendingGrants and claimGrants both refuse rows that
// have aged out, so a stale tab cannot redeem a vanished prize. See _lib/db.js.
//
// Claiming is still POST /api/grants { ids }, which only ever matches the caller's own queue.

import { currentUser } from '../_lib/auth.js';
import { json, guard, unauth } from '../_lib/http.js';
import * as db from '../_lib/db.js';

const shape = g => ({
  id: g.id,
  kind: g.kind,
  payload: JSON.parse(g.payload || '{}'),
  note: g.note,
  from: g.created_by,
  at: g.created_at,
  expiresAt: db.grantExpiresAt(g.created_at,g.created_by),
});

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return await unauth(request);
  // Clear anything already past its window first, so the count a player sees is the count they can
  // actually claim. Failure here is not fatal: the read below filters by age anyway.
  try { await db.purgeExpiredGrants(env.DB, user.id); } catch { /* the filter below is the authority */ }
  const rows = await db.mailBox(env.DB, user.id);
  return json({ mail: rows.results.map(shape), ttlDays: db.GRANT_TTL_DAYS });
});
