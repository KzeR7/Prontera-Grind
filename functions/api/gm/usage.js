// GET /api/gm/usage -> today's Cloudflare spend + our own storage ledger (GM/owner only).
//
// See _lib/usage.js for why this exists and what the two project variables are. Two layers:
//   * Cloudflare's own counters (Function requests, D1 rows read/written) when CF_ACCOUNT_ID and
//     CF_ANALYTICS_TOKEN are set — the numbers that decide whether the month stays free;
//   * our own tables, always, which cost one request and a few hundred rows read.
// Nothing here is cached: it is a GM screen, opened by hand, so a stale number would be worse than
// the single request it saves.

import { currentUser, isGm } from '../../_lib/auth.js';
import { json, guard, fail } from '../../_lib/http.js';
import * as db from '../../_lib/db.js';
import { cloudflareUsage, utcDay, FREE_LIMITS } from '../../_lib/usage.js';

// "Today" for the ledger line: the UTC day the free-plan counters reset on, so both halves of the
// card describe the same window.
const startOfUtcDay = (at = Date.now()) => Date.parse(`${utcDay(at)}T00:00:00.000Z`);

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  if (!isGm(user)) return fail('Not a GM.', 403);

  const now = Date.now();
  const ledger = await db.usageLedger(env.DB, startOfUtcDay(now));
  const usage = await cloudflareUsage(env, now);

  return json({
    at: now,
    utcDay: utcDay(now),
    limits: FREE_LIMITS,
    // The counters Cloudflare bills the free plan against. `null` means "not measured here", never
    // "zero" — the console must not draw a reassuring bar out of a missing number.
    requests: usage.ok ? usage.requests : null,
    d1: usage.ok ? usage.d1 : null,
    source: usage.ok ? 'analytics' : 'ledger',
    // The exact string to paste in the dashboard, and the reason it is worth doing.
    hint: usage.missing
      ? 'Add CF_ACCOUNT_ID (variable) and CF_ANALYTICS_TOKEN (secret, "Account Analytics: Read") to this Pages project to see the metered numbers here. Until then use Workers & Pages -> the project and D1 -> pg -> Metrics in the dashboard.'
      : null,
    error: usage.ok ? null : (usage.missing ? null : usage.error),
    ledger,
    note: 'Daily allowances reset at 00:00 UTC. Static files are not counted at all. Rows written is the one to watch: D1 stops answering for the rest of the day once it is crossed.',
  });
});
