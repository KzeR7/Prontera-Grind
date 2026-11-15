// CPU diagnosis (v411): the numbers that answer "why did it spike, and when did it start".
// These tests stub fetch, so they pin the folding/diagnosis logic without touching Cloudflare.
import assert from 'node:assert/strict';
import { cpuUsage, CPU_LIMIT_US } from '../../functions/_lib/usage.js';

let pass = 0, fail = 0;
const test = async (name, fn) => {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + ' -> ' + e.message); }
};
console.log('CPU diagnosis: which dataset, which hour, and what the p99 says\n');

const ENV = { CF_ACCOUNT_ID: 'acct', CF_ANALYTICS_TOKEN: 'tok' };
const realFetch = globalThis.fetch;

// Build a GraphQL-shaped reply. `rows` use the same field names Cloudflare returns.
function reply({ workers = [], pages = [], errors = null }) {
  return {
    ok: true, status: 200,
    json: async () => ({
      ...errors ? { errors } : {},
      data: { viewer: { accounts: [{
        workersInvocationsAdaptive: workers,
        pagesFunctionsInvocationsAdaptiveGroups: pages,
      }] } },
    }),
  };
}
const wRow = (hour, requests, { errors: e = 0, status = 'success', cpuUs = 0, p50 = 0, p99 = 0 } = {}) => ({
  dimensions: { datetimeHour: hour, status },
  sum: { requests, errors: e, cpuTimeUs: cpuUs },
  quantiles: { cpuTimeP50: p50, cpuTimeP99: p99 },
});
const pRow = (hour, requests, { errors: e = 0, status = 'success', p50 = 0, p99 = 0 } = {}) => ({
  dimensions: { datetimeHour: hour, status },
  sum: { requests, errors: e },
  quantiles: { cpuTimeP50: p50, cpuTimeP99: p99 },
});

try {
  await test('a clean day reports no kills and the p99 floor', async () => {
    globalThis.fetch = async () => reply({ pages: [
      pRow('2026-11-15T00', 900, { p50: 1200, p99: 4200 }),
      pRow('2026-11-15T01', 950, { p50: 1300, p99: 4800 }),
    ] });
    const r = await cpuUsage(ENV);
    assert.equal(r.ok, true);
    assert.equal(r.verdict.kills, 0);
    assert.equal(r.verdict.source, 'Pages Functions');
    assert.equal(r.verdict.startedAt, null, 'nothing started, because nothing was killed');
    assert.equal(r.verdict.quietP99Us, 4800, 'the dearest quiet-hour request is the floor');
    assert.ok(r.verdict.quietP99Us < CPU_LIMIT_US, 'and it is under the ceiling');
  });

  await test('kills are counted from exceededResources, and the start hour is named', async () => {
    globalThis.fetch = async () => reply({ pages: [
      pRow('2026-11-15T04', 800),
      pRow('2026-11-15T05', 780, { errors: 300, status: 'exceededResources', p99: 10000 }),
      pRow('2026-11-15T06', 810, { errors: 620, status: 'exceededResources', p99: 10000 }),
    ] });
    const r = await cpuUsage(ENV);
    assert.equal(r.verdict.kills, 920, 'both killed hours are summed');
    assert.equal(r.verdict.startedAt, '2026-11-15T05', 'the first killed hour is named, not averaged away');
    assert.equal(r.verdict.peakHour, '2026-11-15T06');
    assert.equal(r.verdict.killHours, 2);
    assert.equal(r.verdict.quietHours, 1);
    // The hourly and per-dataset kill rates are where the rate lives; the verdict carries the
    // start hour, which is the question being asked. Check the rate where it is actually computed.
    assert.ok(Math.abs(r.pages.killRate - 920 / (800 + 780 + 810)) < 1e-9, 'the kill rate is kills over requests');
  });

  await test('a p99 at the 10 ms ceiling is flagged against the quiet-hour floor', async () => {
    globalThis.fetch = async () => reply({ pages: [
      pRow('2026-11-15T04', 800, { p99: 3000 }),
      pRow('2026-11-15T05', 780, { errors: 300, status: 'exceededResources', p99: 10000 }),
    ] });
    const r = await cpuUsage(ENV);
    assert.equal(r.verdict.quietP99Us, 3000);
    assert.equal(r.verdict.loudP99Us, 10000, 'a killed hour pins at exactly the 10 ms ceiling on the free plan');
    assert.equal(r.limitUs, 10000);
  });

  await test('Pages Functions is the source when it carries the real traffic (the trap)', async () => {
    // The exact mistake this function exists to prevent: workersInvocationsAdaptive holds the two
    // Durable Object workers and sees none of /api/*, so on its own it reports a calm, tiny day.
    globalThis.fetch = async () => reply({
      workers: [wRow('2026-11-15T05', 4, { cpuUs: 2000, p99: 400 })],
      pages: [pRow('2026-11-15T05', 7600, { errors: 1084, status: 'exceededResources', p99: 10000 })],
    });
    const r = await cpuUsage(ENV);
    assert.equal(r.verdict.source, 'Pages Functions', 'the busier dataset leads, because it is the game');
    assert.equal(r.verdict.kills, 1084, 'the real kill count is not hidden behind a quiet Worker');
    assert.equal(r.workers.kills, 0, 'the Worker dataset is still reported, just not as the lead');
  });

  await test('exact CPU and mean are only claimed where the dataset carries cpuTimeUs', async () => {
    globalThis.fetch = async () => reply({
      workers: [wRow('2026-11-15T05', 100, { cpuUs: 250_000, p99: 5000 })],
      pages: [pRow('2026-11-15T05', 1000, { p99: 4000 })],
    });
    const r = await cpuUsage(ENV);
    assert.equal(r.workers.cpuMs, 250, 'Workers CPU is exact: 250,000 us');
    assert.equal(r.workers.meanCpuMs, 2.5, 'and the mean per request is derived from it');
    assert.equal(r.pages.cpuMs, null, 'Pages has no cpuTimeUs in sum, so no total is invented');
    assert.equal(r.pages.meanCpuMs, null, 'and no mean either - the quantiles are what it reports');
  });

  await test('a GraphQL error becomes ok:false with the reason, never a reassuring zero', async () => {
    globalThis.fetch = async () => reply({ errors: [{ message: 'unknown field cpuTimeUs' }] });
    const r = await cpuUsage(ENV);
    assert.equal(r.ok, false);
    assert.match(r.error, /unknown field cpuTimeUs/, 'the message is passed through so it can be fixed');
  });

  await test('no token means missing, not "no kills"', async () => {
    const r = await cpuUsage({});
    assert.equal(r.ok, false);
    assert.equal(r.missing, true);
  });

  await test('a thrown fetch is caught', async () => {
    globalThis.fetch = async () => { throw new Error('network down'); };
    const r = await cpuUsage(ENV);
    assert.equal(r.ok, false);
    assert.match(r.error, /network down/);
  });

  await test('the query asks for Pages Functions AND per-hour status, not just the Workers total', async () => {
    let asked = '';
    globalThis.fetch = async (_url, init) => { asked = init.body; return reply({}); };
    await cpuUsage(ENV);
    assert.match(asked, /pagesFunctionsInvocationsAdaptiveGroups/, 'the dataset that holds /api/* must be queried');
    assert.match(asked, /workersInvocationsAdaptive/);
    assert.match(asked, /cpuTimeUs/, 'exact CPU, not an estimate');
    assert.match(asked, /datetimeHour/, 'per-hour, so a spike has a shape');
    assert.match(asked, /cpuTimeP99/, 'and a tail, so a few heavy requests are distinguishable');
  });
} finally {
  globalThis.fetch = realFetch;
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exitCode = 1;
}
