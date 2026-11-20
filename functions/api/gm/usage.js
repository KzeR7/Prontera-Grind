// GET /api/gm/usage -> today's Cloudflare spend + our own storage ledger (GM/owner only).
//
// Separates application ledger facts (accounts, saves, backups) from Cloudflare metered usage.
// Each Cloudflare meter is queried independently with timeouts and brief caching.

import { currentUser, isGm } from '../../_lib/auth.js';
import { json, guard, fail } from '../../_lib/http.js';
import * as db from '../../_lib/db.js';
import { cloudflareUsage, cpuUsage, utcDay, FREE_LIMITS, CPU_LIMIT_US } from '../../_lib/usage.js';

const startOfUtcDay = (at = Date.now()) => Date.parse(`${utcDay(at)}T00:00:00.000Z`);

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  if (!isGm(user)) return fail('Not a GM.', 403);

  const now = Date.now();
  const url = new URL(request.url);
  const bypassCache = url.searchParams.get('fresh') === '1';

  const accountId = String(env.CF_ACCOUNT_ID || '').trim();
  const hasToken = !!String(env.CF_ANALYTICS_TOKEN || '').trim();
  const hasD1Id = !!String(env.CF_D1_ID || '').trim();

  const [ledger, usage, cpu] = await Promise.all([
    db.usageLedger(env.DB, startOfUtcDay(now)),
    cloudflareUsage(env, now, { bypassCache }),
    cpuUsage(env, now),
  ]);

  const day = utcDay(now);
  const dashboardUrl = accountId
    ? `https://dash.cloudflare.com/${encodeURIComponent(accountId)}`
    : 'https://dash.cloudflare.com/';

  const meters = {
    d1: {
      available: !!(usage.ok && usage.d1),
      source: 'd1AnalyticsAdaptiveGroups',
      scope: hasD1Id ? 'database-scoped (CF_D1_ID)' : 'account-wide (all D1 databases)',
      period: `${day} 00:00Z – now`,
      units: 'rows / queries',
      freshness: 'Adaptive sampling; typically 1–5 min delay',
      unavailableReason: usage.missing ? 'CF_ACCOUNT_ID / CF_ANALYTICS_TOKEN not configured' : (usage.d1Error || null),
    },
    workers: {
      available: !!(usage.ok && usage.requests),
      source: 'workersInvocationsAdaptive',
      scope: 'account-wide (Workers only; excludes Pages Functions)',
      period: `${day} 00:00Z – now`,
      units: 'requests / errors / subrequests',
      freshness: 'Adaptive sampling; typically 1–5 min delay',
      unavailableReason: usage.missing ? 'CF_ACCOUNT_ID / CF_ANALYTICS_TOKEN not configured' : (usage.requestsError || null),
    },
    objects: {
      available: !!(usage.objects && usage.objects.ok),
      source: 'durableObjectsInvocationsAdaptiveGroups & durableObjectsStorageGroups',
      scope: 'account-wide (all Durable Objects)',
      period: `${day} 00:00Z – now`,
      units: 'requests / storedBytes',
      freshness: 'Adaptive sampling; storage is max daily bytes',
      unavailableReason: usage.missing ? 'CF_ACCOUNT_ID / CF_ANALYTICS_TOKEN not configured' : (usage.objects && !usage.objects.ok ? usage.objects.error : null),
    },
    cpu: {
      available: !!cpu.ok,
      source: 'workersInvocationsAdaptive & pagesFunctionsInvocationsAdaptiveGroups',
      scope: 'account-wide (Workers + Pages Functions)',
      period: `${day} 00:00Z – now`,
      units: 'microseconds (P50/P99) & exceededResources kills',
      freshness: 'Adaptive sampling; Pages dataset lacks cpuTimeUs sum',
      unavailableReason: cpu.missing ? 'CF_ACCOUNT_ID / CF_ANALYTICS_TOKEN not configured' : (cpu.ok ? null : cpu.error),
    },
  };

  return json({
    at: now,
    utcDay: day,
    fetchedAt: usage.fetchedAt || now,
    cached: !!usage.cached,
    // Reference free-tier allowances only (not universal plan limits).
    limits: FREE_LIMITS,
    requests: usage.ok ? usage.requests : null,
    d1: usage.ok ? usage.d1 : null,
    objects: usage.objects && usage.objects.ok
      ? { requests: usage.objects.requests, storedBytes: usage.objects.storedBytes }
      : null,
    objectsError: usage.objects && !usage.objects.ok ? usage.objects.error : null,
    cpu: cpu.ok ? { day: cpu.day, limitUs: CPU_LIMIT_US, pages: cpu.pages, workers: cpu.workers, verdict: cpu.verdict } : null,
    cpuError: cpu.ok ? null : (cpu.missing ? null : cpu.error),
    meters,
    diagnostics: {
      configured: { accountIdSet: !!accountId, analyticsTokenSet: hasToken, d1IdSet: hasD1Id },
      dashboardUrl,
    },
    source: usage.ok ? 'analytics' : 'ledger',
    hint: usage.missing
      ? 'Set CF_ACCOUNT_ID (variable) and CF_ANALYTICS_TOKEN (secret, "Account Analytics: Read") on the Pages project. Optional: CF_D1_ID to scope D1 metrics.'
      : null,
    error: usage.ok ? null : (usage.missing ? null : usage.error),
    ledger,
    note: 'Daily allowances reset at 00:00 UTC. Static assets are not metered. Reference limits reflect Cloudflare Free plan defaults.',
  });
});
