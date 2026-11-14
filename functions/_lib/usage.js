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
