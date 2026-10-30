// Resolving the write-pause binding — the one place that knows its shape.
//
// `env.GATE` (root wrangler.toml, [[durable_objects.bindings]]) is a
// **DurableObjectNamespace**. It exposes `idFromName()` and `get()`. It does NOT
// have `fetch()`. Sending a request means three steps:
//
//   namespace.get(namespace.idFromName(name)).fetch(request)
//   \______/     \____________________/         \_____/
//    the index    which instance                send it
//
// On 2026-10-30 both callers skipped the first two steps and called
// `env.GATE.fetch(...)` directly. That throws `gate.fetch is not a function`,
// which every layer correctly turned into a fail-closed 503 — so the gate refused
// every API request and could not be opened, and the symptom (a maintenance
// screen that would not clear) looked exactly like a deployment problem.
//
// The suites missed it because they mocked the binding as a bare object with a
// `fetch` method, which is not a shape a real binding ever has. That is fixed in
// `tools/tests/write_gate_binding_sim.js`, which drives the real handlers with a
// namespace-shaped mock that has no `fetch` at all.
//
// `functions/api/social.js` has always done this correctly for `env.SOCIAL`; this
// helper is the same idiom, named once so it cannot drift again.

// The single instance name. One object coordinates the whole switch, so every
// caller must resolve the SAME name — a different name would be a second, empty
// gate that reports itself closed while the first one is open.
export const GATE_OBJECT_NAME = 'gate';

// Returns the Durable Object stub for `namespace`, or throws a TypeError that
// names the actual mistake if the value is not a namespace.
export function gateStub(namespace, name = GATE_OBJECT_NAME) {
  if (!namespace) throw new TypeError('Gate binding missing; the caller must check for it first.');
  if (typeof namespace.idFromName !== 'function' || typeof namespace.get !== 'function')
    throw new TypeError(
      'The gate binding is not a DurableObjectNamespace: expected idFromName() and get(). ' +
      'A Durable Object binding cannot be called with fetch() directly — resolve it with gateStub().');
  return namespace.get(namespace.idFromName(name));
}
