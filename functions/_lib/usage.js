// _lib/usage.js — Cloudflare Analytics GraphQL queries + diagnostics for the GM console.
//
// Each meter is queried independently with a bounded timeout so a broken DO, Workers, or CPU
// query never hides working D1 metrics or the local application ledger.
//
// Environment variables (Pages -> Settings -> Variables and Secrets):
//   CF_ACCOUNT_ID       Cloudflare account ID (non-secret)
//   CF_ANALYTICS_TOKEN  API token with "Account Analytics: Read" (secret — never log or return)
//   CF_D1_ID            Optional D1 database UUID to scope D1 metrics to this game's database

const ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const DEFAULT_TIMEOUT_MS = 4500;
const CACHE_TTL_MS = 60_000;

// In-memory short-lived cache keyed by `${account}:${databaseId}:${day}`.
const _cache = new Map();

export function clearUsageCache() {
  _cache.clear();
}

export const utcDay = (at = Date.now()) => new Date(at).toISOString().slice(0, 10);

const num = v => Number(v) || 0;
const add = (rows, pick) => (Array.isArray(rows) ? rows.reduce((sum, r) => sum + (Number(pick(r)) || 0), 0) : null);

async function fetchGraphQL({ token, query, variables, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    const payload = await res.json().catch(() => null);
    if (res.status === 429) {
      return { ok: false, status: 429, error: 'Cloudflare Analytics rate limit reached (HTTP 429). Try again shortly.' };
    }
    if (res.status === 401 || res.status === 403) {
      const why = payload?.errors?.[0]?.message || `HTTP ${res.status}`;
      return { ok: false, status: res.status, error: `Cloudflare Analytics permission denied (${why}). Verify CF_ANALYTICS_TOKEN has "Account Analytics: Read".` };
    }
    if (!res.ok || !payload || payload.errors?.length) {
      const why = payload?.errors?.[0]?.message || `HTTP ${res.status}`;
      return { ok: false, status: res.status, error: `Cloudflare Analytics API error: ${why}` };
    }
    const acct = payload.data?.viewer?.accounts?.[0];
    if (!acct) {
      return { ok: false, error: 'Cloudflare returned no account for CF_ACCOUNT_ID.' };
    }
    return { ok: true, acct };
  } catch (e) {
    if (e?.name === 'AbortError') {
      return { ok: false, error: `Cloudflare Analytics request timed out after ${timeoutMs}ms.` };
    }
    return { ok: false, error: `Could not reach Cloudflare Analytics API (${e?.message || e}).` };
  } finally {
    clearTimeout(timer);
  }
}

const workersQuery = () => `query PgWorkers($accountTag: String!, $dayStart: String, $now: String) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(limit: 200, filter: { datetime_geq: $dayStart, datetime_leq: $now }) {
        sum { requests errors subrequests }
        dimensions { date status }
      }
    }
  }
}`;

const d1Query = ({ withDatabase }) => `query PgD1($accountTag: String!, $date: Date${withDatabase ? ', $databaseId: String' : ''}) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      d1AnalyticsAdaptiveGroups(limit: 200, filter: { date_geq: $date, date_leq: $date${withDatabase ? ', databaseId: $databaseId' : ''} }) {
        sum { rowsRead rowsWritten readQueries writeQueries }
        dimensions { date databaseId }
      }
    }
  }
}`;

const doQuery = () => `query DoUsage($accountTag: String!, $dayStart: String, $now: String) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      durableObjectsInvocationsAdaptiveGroups(limit: 200, filter: { datetime_geq: $dayStart, datetime_leq: $now }) {
        sum { requests }
        dimensions { date }
      }
      durableObjectsStorageGroups(limit: 200, filter: { date_geq: $dayStart, date_leq: $now }) {
        max { storedBytes }
      }
    }
  }
}`;

const cpuQuery = () => `query PgCpu($accountTag: String!, $dayStart: String, $now: String) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(limit: 1000, filter: { datetime_geq: $dayStart, datetime_leq: $now }) {
        sum { requests errors cpuTimeUs }
        quantiles { cpuTimeP50 cpuTimeP99 }
        dimensions { datetimeHour status }
      }
      pagesFunctionsInvocationsAdaptiveGroups(limit: 1000, filter: { datetime_geq: $dayStart, datetime_leq: $now }) {
        sum { requests errors }
        quantiles { cpuTimeP50 cpuTimeP99 }
        dimensions { datetimeHour status }
      }
    }
  }
}`;

export async function workersUsage({ account, token, day, at, timeoutMs }) {
  const res = await fetchGraphQL({
    token,
    query: workersQuery(),
    variables: { accountTag: account, dayStart: `${day}T00:00:00.000Z`, now: new Date(at).toISOString() },
    timeoutMs,
  });
  if (!res.ok) return res;
  const rows = res.acct.workersInvocationsAdaptive;
  if (!Array.isArray(rows)) {
    return { ok: false, error: 'workersInvocationsAdaptive missing from response.' };
  }
  return {
    ok: true,
    used: add(rows, r => r.sum?.requests),
    errors: add(rows, r => r.sum?.errors),
    subrequests: add(rows, r => r.sum?.subrequests),
  };
}

export async function d1Usage({ account, token, day, databaseId, timeoutMs }) {
  const res = await fetchGraphQL({
    token,
    query: d1Query({ withDatabase: !!databaseId }),
    variables: { accountTag: account, date: day, ...(databaseId ? { databaseId } : {}) },
    timeoutMs,
  });
  if (!res.ok) return res;
  const rows = res.acct.d1AnalyticsAdaptiveGroups;
  if (!Array.isArray(rows)) {
    return { ok: false, error: 'd1AnalyticsAdaptiveGroups missing from response.' };
  }
  return {
    ok: true,
    rowsRead: add(rows, r => r.sum?.rowsRead),
    rowsWritten: add(rows, r => r.sum?.rowsWritten),
    readQueries: add(rows, r => r.sum?.readQueries),
    writeQueries: add(rows, r => r.sum?.writeQueries),
    scoped: !!databaseId,
  };
}

export async function durableObjectUsage({ account, token, day, at, timeoutMs }) {
  const res = await fetchGraphQL({
    token,
    query: doQuery(),
    variables: { accountTag: account, dayStart: `${day}T00:00:00.000Z`, now: new Date(at || Date.now()).toISOString() },
    timeoutMs,
  });
  if (!res.ok) return { ok: false, error: `Durable Object analytics refused: ${res.error}` };
  const invRows = res.acct.durableObjectsInvocationsAdaptiveGroups;
  const stoRows = res.acct.durableObjectsStorageGroups;
  if (!Array.isArray(invRows) && !Array.isArray(stoRows)) {
    return { ok: false, error: 'Durable Object datasets missing from response.' };
  }
  return {
    ok: true,
    requests: Array.isArray(invRows) ? add(invRows, r => r.sum?.requests) : null,
    storedBytes: Array.isArray(stoRows) ? add(stoRows, r => r.max?.storedBytes) : null,
  };
}

function byHour(rows, { cpuSum = false, label }) {
  const hours = new Map();
  let requests = 0, kills = 0, cpuUs = 0, p50max = 0, p99max = 0, seen = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const hour = String(row?.dimensions?.datetimeHour || '').slice(0, 13);
    if (!hour) continue;
    const req = num(row.sum?.requests);
    const err = num(row.sum?.errors);
    const killed = row?.dimensions?.status === 'exceededResources';
    const p50 = num(row.quantiles?.cpuTimeP50), p99 = num(row.quantiles?.cpuTimeP99);
    requests += req; cpuUs += num(row.sum?.cpuTimeUs); seen++;
    if (killed) kills += err || req;
    p50max = Math.max(p50max, p50); p99max = Math.max(p99max, p99);
    const h = hours.get(hour) || { hour, requests: 0, kills: 0, cpuMs: 0, p99: 0 };
    h.requests += req;
    if (killed) h.kills += err || req;
    h.p99 = Math.max(h.p99, p99);
    if (cpuSum) h.cpuMs += num(row.sum?.cpuTimeUs) / 1000;
    hours.set(hour, h);
  }
  if (!seen) return null;
  return {
    label,
    requests, kills, cpuMs: cpuSum ? cpuUs / 1000 : null,
    meanCpuMs: cpuSum && requests ? (cpuUs / 1000) / requests : null,
    p50Us: p50max, p99Us: p99max,
    killRate: requests ? kills / requests : 0,
    hours: [...hours.values()].sort((a, b) => a.hour.localeCompare(b.hour)),
  };
}

function diagnose(hours) {
  if (!hours.length) return null;
  const first = hours.find(h => h.kills > 0) || null;
  const quiet = hours.filter(h => !h.kills);
  const loud = hours.filter(h => h.kills > 0);
  return {
    startedAt: first ? first.hour : null,
    peakHour: hours.reduce((a, b) => (b.kills > a.kills ? b : a), hours[0]).hour,
    quietHours: quiet.length, killHours: loud.length,
    quietP99Us: quiet.length ? Math.max(...quiet.map(h => h.p99)) : null,
    loudP99Us: loud.length ? Math.max(...loud.map(h => h.p99)) : null,
  };
}

export async function cpuUsage(env, at = Date.now(), { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const account = String(env.CF_ACCOUNT_ID || '').trim();
  const token = String(env.CF_ANALYTICS_TOKEN || '').trim();
  if (!account || !token) return { ok: false, missing: true, error: 'No Analytics token is set on this project.' };
  const day = utcDay(at);
  const res = await fetchGraphQL({
    token,
    query: cpuQuery(),
    variables: { accountTag: account, dayStart: `${day}T00:00:00.000Z`, now: new Date(at).toISOString() },
    timeoutMs,
  });
  if (!res.ok) return { ok: false, error: `CPU analytics refused: ${res.error}` };
  const workers = byHour(res.acct.workersInvocationsAdaptive, { cpuSum: true, label: 'Workers' });
  const pages = byHour(res.acct.pagesFunctionsInvocationsAdaptiveGroups, { cpuSum: false, label: 'Pages Functions' });
  const lead = [pages, workers].filter(Boolean).sort((a, b) => b.requests - a.requests)[0] || null;
  return {
    ok: true, day, limitUs: CPU_LIMIT_US,
    pages, workers,
    verdict: lead ? { ...diagnose(lead.hours), source: lead.label, requests: lead.requests, kills: lead.kills } : null,
  };
}

// Simple non-reversible FNV-1a 32-bit hash for cache key separation (never exposes the token).
const hashKey = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
};

// Fetch all Cloudflare analytics meters independently, with short-lived caching.
export async function cloudflareUsage(env, at = Date.now(), { bypassCache = false, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const account = String(env.CF_ACCOUNT_ID || '').trim();
  const token = String(env.CF_ANALYTICS_TOKEN || '').trim();
  const databaseId = String(env.CF_D1_ID || '').trim();
  const day = utcDay(at);

  if (!account || !token) {
    return { ok: false, missing: true, day, error: 'No Analytics token is set on this project.' };
  }

  const cacheKey = `${account}:${databaseId}:${day}:${hashKey(token)}`;
  if (!bypassCache) {
    const hit = _cache.get(cacheKey);
    if (hit && (at - hit.fetchedAt) < CACHE_TTL_MS) {
      return { ...hit.value, cached: true, fetchedAt: hit.fetchedAt };
    }
  }

  const [workersRes, d1Res, doRes] = await Promise.all([
    workersUsage({ account, token, day, at, timeoutMs }),
    d1Usage({ account, token, day, databaseId, timeoutMs }),
    durableObjectUsage({ account, token, day, at, timeoutMs }),
  ]);

  const anyOk = workersRes.ok || d1Res.ok || doRes.ok;
  const result = {
    ok: anyOk,
    day,
    cached: false,
    fetchedAt: at,
    requests: workersRes.ok ? { used: workersRes.used, errors: workersRes.errors, subrequests: workersRes.subrequests } : null,
    requestsError: workersRes.ok ? null : workersRes.error,
    d1: d1Res.ok ? { rowsRead: d1Res.rowsRead, rowsWritten: d1Res.rowsWritten, readQueries: d1Res.readQueries, writeQueries: d1Res.writeQueries, scoped: d1Res.scoped } : null,
    d1Error: d1Res.ok ? null : d1Res.error,
    objects: doRes,
    error: anyOk ? null : (workersRes.error || d1Res.error || doRes.error),
  };

  if (anyOk) {
    _cache.set(cacheKey, { fetchedAt: at, value: result });
  }
  return result;
}

// Reference free-tier allowances (not universal plan limits).
export const FREE_LIMITS = { requests: 100_000, rowsRead: 5_000_000, rowsWritten: 100_000, durableRequests: 100_000 };
export const CPU_LIMIT_US = 10_000;
