// GET /api/gm/audit  -> { alerts: [{user_id, username, kind, label, first_seen, last_seen,
//                                      value, threshold, detail, observations}] }
//
// The GM console's "Suspicious saves" card: the output of the automatic save audit (0015) —
// accounts whose stored saves broke a game invariant or a human rate limit since the previous
// accepted sync. Flags are REVIEW-ONLY: this endpoint only reads, and nothing here bans.

import { currentUser, isGm } from '../../_lib/auth.js';
import { json, guard, unauth } from '../../_lib/http.js';
import * as db from '../../_lib/db.js';
import { AUDIT_LABELS, rateLabel } from '../../_lib/save-audit.js';

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return await unauth(request);
  if (!isGm(user)) return json({ err: 'GM only.' }, 403);
  const rows = await db.recentSaveAlerts(env.DB, 100);
  return json({ alerts: (rows.results || []).map(r => ({
    user_id: r.user_id,
    username: r.username,
    kind: r.kind,
    label: r.kind && r.kind.startsWith('rate:') ? rateLabel(r.kind) : (AUDIT_LABELS[r.kind] || r.kind || ''),
    first_seen: r.first_seen,
    last_seen: r.last_seen,
    value: r.value,
    threshold: r.threshold,
    detail: r.detail || '',
    observations: r.observations,
  })) });
});
