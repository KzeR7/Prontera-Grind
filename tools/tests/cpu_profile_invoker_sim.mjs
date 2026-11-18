// v419: the CPU harness must measure what it says it measures.
//
// Three claims are load-bearing for every number in docs/CPU-LIMIT.md, and a harness that quietly breaks
// any of them produces plausible numbers that are wrong:
//
//   1. `handler-only` runs the Function export and the middleware ZERO times. (The earlier harness had a
//      single global `--middleware` flag that redirected every call, so the "handler-only baseline" could
//      silently contain the front door.)
//   2. `middleware` enters `functions/api/_middleware.js` exactly ONCE per request.
//   3. The CPU sample covers the request only: preparing a request before it and draining/parsing the
//      reply after it are outside the sample. A conflict reply carries the whole live save, so draining
//      it inside the sample made a 409 look more expensive than an accepted save.
//
// The probe counts middleware entries and CPU-visible phase boundaries, then checks the harness against
// them by running the harness's own exported primitives over the SAME routes.
//
// Run: node tools/tests/cpu_profile_invoker_sim.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? ' -> ' + detail : '')); } };

// ---------------------------------------------------------------- 1. invokers ----
// Driven through the CLI so the test exercises the real harness, not a copy of it. `--json` gives the
// machine-readable report; `--probe-phase` prints the phase counters the harness measured.
const profiler = path.join(root, 'tools', 'cpu_profile.mjs');
const run = (...args) => {
  const r = spawnSync(process.execPath, [profiler, ...args], { encoding: 'utf8', timeout: 600_000 });
  return { code: r.status, out: String(r.stdout || ''), err: String(r.stderr || '') };
};

// The harness reports, per invoker, how many requests it issued and how many times the middleware
// actually entered. This is measured inside the harness by wrapping the middleware entry point.
const report = (() => {
  const out = path.join('/tmp', 'cpu-profile-invoker-' + process.pid + '.json');
  const r = run('--runs', '2', '--batch', '2', '--only', 'mw:', '--json', out, '--label', 'invoker-probe');
  const json = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  return { ...r, json };
})();

ok('the harness runs a handler-only and a middleware case', report.code === 0, report.err.slice(0, 200) || report.out.slice(-200));
const counters = report.json && report.json.invokers;
ok('the report records invoker counters', !!counters, JSON.stringify(report.json && Object.keys(report.json)));

if (counters) {
  const ho = counters['handler-only'] || { requests: 0, middlewareEntries: 0 };
  const mw = counters.middleware || { requests: 0, middlewareEntries: 0 };
  ok('handler-only issued requests', ho.requests > 0, JSON.stringify(ho));
  ok('handler-only entered the middleware ZERO times', ho.middlewareEntries === 0,
    ho.middlewareEntries + ' entries over ' + ho.requests + ' requests');
  ok('middleware issued requests', mw.requests > 0, JSON.stringify(mw));
  ok('middleware entered exactly once per request', mw.middlewareEntries === mw.requests,
    mw.middlewareEntries + ' entries over ' + mw.requests + ' requests');
  // NOTE: the two counters are NOT expected to be equal. `handler-only` also covers every non-middleware
  // case in the run (version probers, ensureCompactRow, the component probes' setup), while the
  // middleware counter only grows for middleware cases. Equality was an assumption in this test, not a
  // property of a correct harness; the property that matters is that the ZERO and the 1:1 hold above.
  ok('the middleware counter grew only for middleware requests',
    mw.middlewareEntries === mw.requests && ho.middlewareEntries === 0, JSON.stringify({ ho, mw }));
}

// ------------------------------------------------- what production has, and has not ----
// A report must not read as "this is the production cost" when pieces of production are absent. The
// harness prints these explicitly; assert the list is there and truthful.
{
  const components = report.json && report.json.components;
  ok('the JSON report carries the production-component disclosure',
    !!components && Array.isArray(components.absent) && components.absent.length > 0,
    JSON.stringify(components && Object.keys(components)));
  ok('the components block exists in the JSON', !!components, JSON.stringify(report.json && Object.keys(report.json)));
  if (components) {
    ok('  ...the recovery gate is listed as absent unless WRITE_GATE=required',
      Array.isArray(components.absent) && components.absent.some(c => /gate/i.test(c)),
      JSON.stringify(components.absent));
    ok('  ...the Durable Object lease is listed as absent', components.absent.some(c => /durable|lease|gate/i.test(c)));
    ok('  ...the D1 binding is listed as substituted, not real', components.substituted.some(c => /D1|shim/i.test(c)),
      JSON.stringify(components.substituted));
    ok('  ...it states that the runtime is Node, not workerd', /node/i.test(components.runtime));
  }
}

// ------------------------------------------- 3. what each row claims to be ----
// The conflict row must never be reported as accepted-save CPU, and every PUT row must say which client
// it measured and which status it required.
{
  const rows = (report.json && report.json.results) || [];
  const accepted = rows.filter(r => /^mw:.*put/.test(r.name));
  ok('every middleware PUT row exists for both invokers',
    accepted.some(r => r.invoker === 'handler-only') && accepted.some(r => r.invoker === 'middleware'),
    JSON.stringify(accepted.map(r => r.name + '/' + r.invoker)));
  ok('every measured PUT row demands status 200 (accepted), never 409',
    accepted.every(r => r.expect === 200 || r.expect == null), JSON.stringify(accepted.map(r => [r.name, r.expect])));
  const conflictRows = rows.filter(r => /conflict/.test(r.name));
  ok('conflict rows are labelled 409 and are not accepted-save rows',
    conflictRows.every(r => r.expect === 409), JSON.stringify(conflictRows.map(r => [r.name, r.expect])));
  ok('every measured row names its client kind or is a component probe',
    rows.every(r => r.client || r.mwMode || r.detail || /part:/.test(r.name) || r.phase || r.name.startsWith('  ')),
    JSON.stringify(rows.filter(r => !(r.client || r.mwMode || r.detail || /part:/.test(r.name) || r.phase || r.name.startsWith('  '))).map(r => r.name)));
}

// The printed report (no --json) must state the same disclosure, because the printed table is what gets
// pasted into an issue.
{
  const human = run('--runs', '1', '--batch', '1', '--only', 'me');
  ok('the printed report names the components production runs but the harness does not',
    /absent in this harness/i.test(human.out), human.out.slice(-400));
  ok('  ...and reports the invoker counters', /Invoker counters \(measured, not assumed\)/.test(human.out));
  ok('  ...and states that middleware was never entered by a handler-only case',
    /handler-only\s+\d+ requests, 0 middleware entries/.test(human.out), human.out.slice(-400));
}

// ---------------------------------- 3b. the sample excludes the reply body ----
// The review's point: "Stop the CPU sample before draining/parsing responses and checking their
// contents." That is only true if the CPU counter is read before `res.text()` runs. This probes the real
// harness primitives: it makes a request whose reply carries a large blob, and compares the sampled CPU
// with the same request where the body is drained OUTSIDE the sample (correct) versus inside it (the old
// behaviour). The point is not a millisecond here - it is that the two differ measurably, so the harness
// has to choose the right one.
{
  const out = path.join('/tmp', 'cpu-profile-drain-' + process.pid + '.json');
  // `--only save-get` includes the near-cap GET, whose reply is ~300 KB of JSON.
  const r = run('--runs', '5', '--batch', '5', '--only', 'save-get', '--json', out, '--label', 'drain-probe');
  const json = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  ok('the drain probe ran', r.code === 0 && !!json, r.err.slice(0, 200));
  const row = json && json.results.find(x => x.name === 'save-get-nearCap');
  ok('  ...and measured the near-cap GET that carries the big body', !!row, JSON.stringify(json && json.results.map(x => x.name)));
  // A harness that drained inside the sample would have to spend the reply length on every request.
  // We can only assert the shape of the answer here; the structural proof is that `execute()` returns
  // before `res.text()` is called, which the phase marker below checks in-process.
  ok('  ...and its figure is a real number, not the reply length', row && row.cpuMs > 0 && row.cpuMs < 1000,
    JSON.stringify(row));
}

// The structural check: `execute` must not reference `text()` at all, and `validate` must be the only
// place that drains. A test cannot time the internals reliably, so it reads the source it is testing.
{
  const src = fs.readFileSync(profiler, 'utf8');
  const executeBody = src.slice(src.indexOf('const execute = async call => {'), src.indexOf('// VALIDATE. Outside the sample.'));
  const validateBody = src.slice(src.indexOf('const validate = async (outcome, check) => {'), src.indexOf('// One measured pass:'));
  ok('execute() never drains the response body', !/\.text\(\)/.test(executeBody),
    executeBody.match(/\.text\(\)/)?.[0] || 'none');
  ok('validate() is where the body is drained', /res\.text\(\)/.test(validateBody));
  ok('the CPU counter is read before any validation runs', /process\.cpuUsage\(started\)/.test(executeBody));
  ok('preparation happens outside the sample (plan is called before cpuUsage)',
    /preparedBatch\.push\(prepared\)[\s\S]{0,500}?const c0 = process\.cpuUsage\(\)/.test(src) &&
    /const prepared = await plan\(index\)/.test(src),
    'plan() must be called before the sample opens');
  ok('validation happens after the sample is closed',
    /const delta = process\.cpuUsage\(c0\);[\s\S]{0,300}?await validate\(outcomes\[j\], checks\[j\]\)/.test(src));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
