// _lib/usage.js — today's spend against the free plan, straight from Cloudflare's own counters.
//
// Why this exists: on the free plan the two things that can actually run out are Pages Function
// requests (100,000/day) and D1 rows read/written (5,000,000 and 100,000/day), and BOTH reset at
// 00:00 UTC while D1 hard-stops for the rest of the day once its limits are crossed. Static files
// are not metered at all. So the GM console shows the day's spend against the day's allowance.
//
// It needs two values on the Pages project (Settings -> Variables and Secrets):
//   CF_ACCOUNT_ID       the account id (not a secret — it is in the dashboard URL)
//   CF_ANALYTICS_TOKEN  an API token with the "Account Analytics: Read" permission (a secret)
//   CF_D1_ID            optional: scope the D1 numbers to the `pg` database alone
// Without them the endpoint still answers with our own ledger and says what to set; no failure of
// this call is ever allowed to break the console.

const ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';

// Both datasets are the ones the Cloudflare dashboard's own charts are drawn from:
//   workersInvocationsAdaptive      -> Function/Worker requests (the dashboards' tutorial uses the
//                                      datetime_* filter, so that is what this uses)
//   d1AnalyticsAdaptiveGroups       -> D1 rows read/written (the D1 docs' own example uses date_*)
// `limit` is generous and the sums are added up here: the datasets are grouped by dimension
// (status for invocations, database for D1), so a day can be more than one row.
const query = ({ withDatabase }) => `query PgUsage($accountTag: String!, $date: Date, $dayStart: String, $now: String${withDatabase ? ', $databaseId: String' : ''}) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(limit: 200, filter: { datetime_geq: $dayStart, datetime_leq: $now }) {
        sum { requests errors subrequests }
        dimensions { date status }
      }
      d1AnalyticsAdaptiveGroups(limit: 200, filter: { date_geq: $date, date_leq: $date${withDatabase ? ', databaseId: $databaseId' : ''} }) {
        sum { rowsRead rowsWritten readQueries writeQueries }
        dimensions { date databaseId }
      }
    }
  }
}`;

// v403: Durable Object usage, asked for separately. The two numbers the owner wants are requests
// (the billable invocation count for both the gate and the social object) and stored bytes.
// This is a SECOND query on purpose: if Cloudflare renames a field here the main request/D1 numbers
// must still render, so a failure is contained to the DO card and reported as such.
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

// Cloudflare's free-plan day is the UTC day, not the Singapore one the game's boards use.
export const utcDay = (at = Date.now()) => new Date(at).toISOString().slice(0, 10);

const add = (rows, pick) => (Array.isArray(rows) ? rows.reduce((sum, r) => sum + (Number(pick(r)) || 0), 0) : 0);

// Durable Object usage for the GM console. Two objects are bound on this project - the write gate
// and the social scene - so the number is account-wide rather than per-class; the card says so.
// Never throws. `ok:false` means "ask the dashboard", not "zero".
export async function durableObjectUsage({ account, token, day, at }) {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: doQuery(),
        variables: { accountTag: account, dayStart: `${day}T00:00:00.000Z`, now: new Date(at || Date.now()).toISOString() },
      }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload || payload.errors?.length) {
      const why = payload?.errors?.[0]?.message || `HTTP ${res.status}`;
      return { ok: false, error: `Durable Object analytics refused: ${why}` };
    }
    const acct = payload.data?.viewer?.accounts?.[0];
    if (!acct) return { ok: false, error: 'Cloudflare returned no account for that id.' };
    return {
      ok: true,
      requests: add(acct.durableObjectsInvocationsAdaptiveGroups, r => r.sum?.requests),
      storedBytes: add(acct.durableObjectsStorageGroups, r => r.max?.storedBytes),
    };
  } catch (e) {
    return { ok: false, error: `Durable Object analytics failed: ${e.message}` };
  }
}

// -> { ok: true, requests, d1, day } | { ok: false, error }
// Never throws: a bad token, a GraphQL rename or a network blip must only make the card say so.
export async function cloudflareUsage(env, at = Date.now()) {
  const account = String(env.CF_ACCOUNT_ID || '').trim();
  const token = String(env.CF_ANALYTICS_TOKEN || '').trim();
  if (!account || !token) return { ok: false, missing: true, error: 'No Analytics token is set on this project.' };

  const databaseId = String(env.CF_D1_ID || '').trim();
  const day = utcDay(at);
  const body = JSON.stringify({
    query: query({ withDatabase: !!databaseId }),
    variables: {
      accountTag: account, date: day,
      dayStart: `${day}T00:00:00.000Z`, now: new Date(at).toISOString(),
      ...(databaseId ? { databaseId } : {}),
    },
  });

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload || payload.errors?.length) {
      const why = payload?.errors?.[0]?.message || `HTTP ${res.status}`;
      return { ok: false, error: `Cloudflare's analytics API refused the query: ${why}` };
    }
    const acct = payload.data?.viewer?.accounts?.[0];
    if (!acct) return { ok: false, error: 'Cloudflare returned no account for that id.' };
    const objects = await durableObjectUsage({ account, token, day, at });
    return {
      ok: true, day, objects,
      requests: {
        used: add(acct.workersInvocationsAdaptive, r => r.sum?.requests),
        errors: add(acct.workersInvocationsAdaptive, r => r.sum?.errors),
        subrequests: add(acct.workersInvocationsAdaptive, r => r.sum?.subrequests),
      },
      d1: {
        rowsRead: add(acct.d1AnalyticsAdaptiveGroups, r => r.sum?.rowsRead),
        rowsWritten: add(acct.d1AnalyticsAdaptiveGroups, r => r.sum?.rowsWritten),
        readQueries: add(acct.d1AnalyticsAdaptiveGroups, r => r.sum?.readQueries),
        writeQueries: add(acct.d1AnalyticsAdaptiveGroups, r => r.sum?.writeQueries),
        scoped: !!databaseId,
      },
    };
  } catch (e) {
    return { ok: false, error: 'Could not reach Cloudflare\'s analytics API (' + (e?.message || e) + ').' };
  }
}

// The free-plan allowances, in one place so the console and the docs cannot drift apart.
// Durable Object requests share the Workers daily request allowance on the free plan; the card shows
// the same 100k ceiling so the bar means the same thing as the one above it.
export const FREE_LIMITS = { requests: 100_000, rowsRead: 5_000_000, rowsWritten: 100_000, durableRequests: 100_000 };

// The free-plan CPU ceiling. One request that spends more than this is killed with error 1102, and
// Cloudflare records the invocation as `exceededResources`.
export const CPU_LIMIT_US = 10_000;

// ------------------------------------------------------------------ CPU diagnosis ----
//
// Why this exists: on Nov 15 the account went from 0 CPU kills a day to 1,084 and nobody could say
// what had changed, because the console only ever showed request COUNTS. The counters that answer
// "what happened, and when" are all in the same dataset and were simply never asked for:
//
//   * `sum { cpuTimeUs }`   - exact total CPU, not an estimate. Divide by requests for the mean.
//   * `dimensions { status }` - `exceededResources` IS the CPU kill (1102/1027). Counting errors per
//     request tells you the kill rate; counting errors per HOUR tells you when it started.
//   * `dimensions { datetimeHour }` - the spike's shape. A flat line across the day is a code floor;
//     one hour that steps up and stays up is a deploy or a traffic source.
//   * `quantiles { cpuTimeP50, cpuTimeP99 }` - a move in P50 is every request getting heavier; a move
//     in P99 only is a few heavy requests (big saves, settlement, one account).
//
// PAGES vs WORKERS matters and is the trap here: this project serves /api/* as PAGES FUNCTIONS, and
// `workersInvocationsAdaptive` does NOT include them. Reading only that dataset reports the two
// Durable Object workers and shows zero of the game's own API traffic - which is exactly how a spike
// in /api can look like nothing in the charts. Both are queried, and pagesFunctionsInvocationsAdaptive
// Groups has no cpuTimeUs in its `sum`, so its CPU comes from the p50/p99 quantiles.
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

const num = v => Number(v) || 0;

// Fold one dataset's rows into hours. Each hour gets: how many requests, how many were killed for
// CPU, and what the heaviest request cost (p99 in microseconds - the number the 10 ms ceiling is
// measured against).
function byHour(rows, { cpuSum = false, label }) {
  const hours = new Map();
  let requests = 0, kills = 0, cpuUs = 0, p50max = 0, p99max = 0, seen = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const hour = String(row?.dimensions?.datetimeHour || '').slice(0, 13);   // YYYY-MM-DDTHH
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
    // Mean CPU per request only means something where the dataset carries exact CPU.
    meanCpuMs: cpuSum && requests ? (cpuUs / 1000) / requests : null,
    p50Us: p50max, p99Us: p99max,
    killRate: requests ? kills / requests : 0,
    hours: [...hours.values()].sort((a, b) => a.hour.localeCompare(b.hour)),
  };
}

// Find the hour the kills started in, and say so in words. This is the answer the owner asked for:
// not "it spiked", but "it started at 05:00 UTC and the p99 in that hour was N".
function diagnose(hours) {
  if (!hours.length) return null;
  const first = hours.find(h => h.kills > 0) || null;
  const quiet = hours.filter(h => !h.kills);
  const loud = hours.filter(h => h.kills > 0);
  return {
    startedAt: first ? first.hour : null,
    peakHour: hours.reduce((a, b) => (b.kills > a.kills ? b : a), hours[0]).hour,
    quietHours: quiet.length, killHours: loud.length,
    // The dearest request in a quiet hour is the honest floor: below the ceiling means the code is
    // fine and the spike came from volume; at or over it means every request is one bad save away.
    quietP99Us: quiet.length ? Math.max(...quiet.map(h => h.p99)) : null,
    loudP99Us: loud.length ? Math.max(...loud.map(h => h.p99)) : null,
  };
}

// -> { ok: true, pages, workers, verdict } | { ok: false, error }
// Never throws. A missing field, a renamed dataset or a bad token returns `ok:false` with the reason
// instead of breaking the console - and the caller is expected to say "ask the dashboard", not "zero".
export async function cpuUsage(env, at = Date.now()) {
  const account = String(env.CF_ACCOUNT_ID || '').trim();
  const token = String(env.CF_ANALYTICS_TOKEN || '').trim();
  if (!account || !token) return { ok: false, missing: true, error: 'No Analytics token is set on this project.' };
  const day = utcDay(at);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: cpuQuery(),
        variables: { accountTag: account, dayStart: `${day}T00:00:00.000Z`, now: new Date(at).toISOString() },
      }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload || payload.errors?.length) {
      const why = payload?.errors?.[0]?.message || `HTTP ${res.status}`;
      return { ok: false, error: `CPU analytics refused: ${why}` };
    }
    const acct = payload.data?.viewer?.accounts?.[0];
    if (!acct) return { ok: false, error: 'Cloudflare returned no account for that id.' };
    const workers = byHour(acct.workersInvocationsAdaptive, { cpuSum: true, label: 'Workers' });
    const pages = byHour(acct.pagesFunctionsInvocationsAdaptiveGroups, { cpuSum: false, label: 'Pages Functions' });
    // The two datasets answer different questions, so the verdict is drawn from whichever actually
    // carries the game's own traffic - reporting a Durable Object worker's zero as "no CPU kills"
    // is the specific mistake this function exists to prevent.
    const lead = [pages, workers].filter(Boolean).sort((a, b) => b.requests - a.requests)[0] || null;
    return {
      ok: true, day, limitUs: CPU_LIMIT_US,
      pages, workers,
      verdict: lead ? { ...diagnose(lead.hours), source: lead.label, requests: lead.requests, kills: lead.kills } : null,
    };
  } catch (e) {
    return { ok: false, error: "Could not reach Cloudflare's analytics API (" + (e?.message || e) + ').' };
  }
}
