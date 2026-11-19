// usage_analytics_sim.js — tests for Cloudflare analytics independence, timeouts, caching, and diagnostics.
import assert from 'node:assert/strict';
import { cloudflareUsage, clearUsageCache, utcDay } from '../../functions/_lib/usage.js';

const test = async (name, fn) => {
  clearUsageCache();
  try {
    await fn();
    console.log('  ok  ', name);
  } catch (e) {
    console.error('  FAIL', name, '->', e?.stack || e);
    process.exitCode = 1;
  }
};

console.log('usage_analytics_sim: Cloudflare analytics independence, caching, timeouts, UTC');

await test('missing configuration returns missing:true without calling fetch', async () => {
  let called = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { called = true; throw new Error('should not fetch'); };
  try {
    const r = await cloudflareUsage({}, Date.UTC(2026, 10, 19, 12, 0, 0));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.missing, true);
    assert.strictEqual(called, false);
  } finally { globalThis.fetch = realFetch; }
});

await test('partial failure: Workers 429 + DO timeout still leaves D1 intact', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const q = JSON.parse(init.body).query;
    if (q.includes('workersInvocationsAdaptive')) {
      return { ok: false, status: 429, json: async () => ({ errors: [{ message: 'Rate limited' }] }) };
    }
    if (q.includes('durableObjectsInvocationsAdaptiveGroups')) {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }
    if (q.includes('d1AnalyticsAdaptiveGroups')) {
      return {
        ok: true, status: 200,
        json: async () => ({
          data: { viewer: { accounts: [{ d1AnalyticsAdaptiveGroups: [{ sum: { rowsRead: 1200, rowsWritten: 45, readQueries: 10, writeQueries: 5 } }] }] } },
        }),
      };
    }
    throw new Error('unexpected query');
  };
  try {
    const r = await cloudflareUsage({ CF_ACCOUNT_ID: 'acct-1', CF_ANALYTICS_TOKEN: 'secret-tok', CF_D1_ID: 'db-1' }, Date.UTC(2026, 10, 19, 12, 0, 0));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.requests, null, 'failed Workers query must be null, never 0');
    assert.match(r.requestsError, /429|rate limit/i);
    assert.strictEqual(r.objects.ok, false);
    assert.match(r.objects.error, /timed out/i);
    assert.strictEqual(r.d1.rowsRead, 1200);
    assert.strictEqual(r.d1.rowsWritten, 45);
    assert.strictEqual(r.d1.scoped, true);
    assert.ok(!JSON.stringify(r).includes('secret-tok'), 'token must never appear in result');
  } finally { globalThis.fetch = realFetch; }
});

await test('missing dataset array in response returns null/error, never 0', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ data: { viewer: { accounts: [{}] } } }),
  });
  try {
    const r = await cloudflareUsage({ CF_ACCOUNT_ID: 'acct-2', CF_ANALYTICS_TOKEN: 'tok-2' }, Date.UTC(2026, 10, 19, 12, 0, 0));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.requests, null);
    assert.strictEqual(r.d1, null);
  } finally { globalThis.fetch = realFetch; }
});

await test('successful analytics are briefly cached and bypassCache refreshes', async () => {
  let calls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls++;
    const q = JSON.parse(init.body).query;
    if (q.includes('d1AnalyticsAdaptiveGroups')) {
      return { ok: true, status: 200, json: async () => ({ data: { viewer: { accounts: [{ d1AnalyticsAdaptiveGroups: [{ sum: { rowsRead: 100, rowsWritten: 10, readQueries: 1, writeQueries: 1 } }] }] } } }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: { viewer: { accounts: [{ workersInvocationsAdaptive: [], durableObjectsInvocationsAdaptiveGroups: [], durableObjectsStorageGroups: [] }] } } }) };
  };
  try {
    const t0 = Date.UTC(2026, 10, 19, 12, 0, 0);
    const r1 = await cloudflareUsage({ CF_ACCOUNT_ID: 'acct-3', CF_ANALYTICS_TOKEN: 'tok-3' }, t0);
    assert.strictEqual(r1.cached, false);
    assert.strictEqual(r1.fetchedAt, t0);
    const firstCalls = calls;

    const r2 = await cloudflareUsage({ CF_ACCOUNT_ID: 'acct-3', CF_ANALYTICS_TOKEN: 'tok-3' }, t0 + 10_000);
    assert.strictEqual(r2.cached, true);
    assert.strictEqual(r2.fetchedAt, t0);
    assert.strictEqual(calls, firstCalls, 'cached call must not hit fetch');

    const r3 = await cloudflareUsage({ CF_ACCOUNT_ID: 'acct-3', CF_ANALYTICS_TOKEN: 'tok-3' }, t0 + 10_000, { bypassCache: true });
    assert.strictEqual(r3.cached, false);
    assert.ok(calls > firstCalls, 'bypassCache must re-fetch');
  } finally { globalThis.fetch = realFetch; }
});

await test('utcDay formats UTC date boundary', async () => {
  assert.strictEqual(utcDay(Date.UTC(2026, 10, 19, 23, 59, 59)), '2026-11-19');
  assert.strictEqual(utcDay(Date.UTC(2026, 10, 20, 0, 0, 0)), '2026-11-20');
});
