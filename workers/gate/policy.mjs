// workers/gate/policy.mjs — the write-pause state machine.
//
// WHY THIS IS A SEPARATE SCRIPT FROM THE GAME: a D1 Time Travel restore overwrites the whole `pg`
// database in place. A pause flag stored *in that database* would be rolled back by the very restore
// it is supposed to guard, and writes would reopen before anyone verified the data. So the flag lives
// in its own Durable Object (`prontera-gate`), which has no D1 binding at all and therefore cannot be
// rolled back, rebuilt or imported over by a database restore.
//
// This file has no Cloudflare, storage, clock or network in it: every function takes `now` and a
// plain state object, so the ordering rules are testable with node only. `index.mjs` is the Durable
// Object wrapper (storage, HTTP, token), and `tools/tests/write_gate_sim.mjs` drives this module.
//
// STATES
//   open     — writes are admitted. Every admitted API request holds a short lease.
//   closing  — the pause has started: nothing new is admitted, and leases drain out.
//   closed   — an operator sealed the gate after confirming it drained. This is the only state in
//              which a restore may start, and the only state that may be reported as "safe to
//              restore". It is also the state of a brand-new gate (see initialState): a gate that
//              has never been opened refuses everything, so forgetting to configure it fails safe
//              and loudly rather than leaving writes open.
//
// DRAIN, HONESTLY: `drained` means (a) no lease is live, and (b) the last admission was at least
// QUIET_MS ago. That is proof that nothing *was admitted recently*, not proof that no request is
// still executing: a lease expires on a timer, and a request that outlives its lease could still
// write. QUIET_MS is therefore deliberately longer than any of this project's API handlers can
// reasonably run, and it is the operator's job to check the service is quiet before sealing. Sealing
// is a judgement call recorded in the audit trail, not a guarantee.

export const OPEN = 'open';
export const CLOSING = 'closing';
export const CLOSED = 'closed';
export const STATES = new Set([OPEN, CLOSING, CLOSED]);

// One admitted API request is in flight for at most this long as far as the gate knows. A Pages
// Function that dies without releasing leaves a lease behind; it expires here rather than blocking
// recovery forever.
export const LEASE_MS = 90_000;
// No admission for this long, with no live lease, is what `drained` means. Keep LEASE_MS <= QUIET_MS.
export const QUIET_MS = 90_000;
// The audit ring is bounded: the gate must not grow storage without limit.
export const AUDIT_MAX = 60;
// A concurrency cap, so a stalled client cannot exhaust the Durable Object. Reaching it refuses new
// requests (fail closed) instead of silently dropping the lease bookkeeping.
export const MAX_LEASES = 400;
// Control requests try to stop and open the gate; a short token is not a token.
export const TOKEN_MIN = 32;
// Wrong-token attempts: after AUTH_MAX failures inside AUTH_WINDOW_MS, control requests are refused
// for AUTH_LOCK_MS. The gate is the last line of defence and the endpoint is public, so guessing has
// to cost something even though the token is long.
export const AUTH_MAX = 5;
export const AUTH_WINDOW_MS = 10 * 60_000;
export const AUTH_LOCK_MS = 5 * 60_000;
// Typed by the operator (and required by the CLI) for every state change, so a mistyped command
// cannot pause the live site or reopen writes during a restore.
export const CONFIRM = { close: 'CLOSE WRITES', seal: 'SEAL WRITES', open: 'OPEN WRITES' };

export class GateError extends Error {
  constructor(code, status, extra = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

const clampText = (value, max = 140) =>
  (typeof value === 'string' ? value : '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

// A brand-new gate is CLOSED on purpose: it has never been opened, so nothing has ever been admitted
// and no restore can be in progress. The deploy guide's first command is `open "OPEN WRITES"`.
export const initialState = () => ({
  v: 1,
  state: CLOSED,
  reason: 'never-opened',
  epoch: 1,
  changedAt: 0,
  lastAdmissionAt: 0,
  leases: {},
  auth: { fails: 0, firstAt: 0, lockUntil: 0 },
  audit: [],
});

// Anything unreadable or unexpected loads as a closed gate rather than as an open one. A corrupt
// Durable Object must not be able to hand the database to writers during a recovery.
export function sanitize(raw) {
  const st = raw && typeof raw === 'object' ? raw : null;
  if (!st || !STATES.has(st.state)) return initialState();
  const leases = {};
  for (const [id, at] of Object.entries(st.leases && typeof st.leases === 'object' ? st.leases : {})) {
    if (typeof id === 'string' && Number.isFinite(Number(at))) leases[id] = Number(at);
  }
  return {
    v: 1,
    state: st.state,
    reason: clampText(st.reason) || 'restored-state',
    epoch: Number.isFinite(Number(st.epoch)) && Number(st.epoch) > 0 ? Math.floor(Number(st.epoch)) : 1,
    changedAt: Number(st.changedAt) || 0,
    lastAdmissionAt: Number(st.lastAdmissionAt) || 0,
    leases,
    auth: {
      fails: Number(st.auth?.fails) || 0,
      firstAt: Number(st.auth?.firstAt) || 0,
      lockUntil: Number(st.auth?.lockUntil) || 0,
    },
    audit: Array.isArray(st.audit)
      ? st.audit.filter(x => x && typeof x === 'object').slice(0, AUDIT_MAX).map(x => ({
        at: Number(x.at) || 0, action: clampText(x.action, 24), actor: clampText(x.actor, 40),
        reason: clampText(x.reason), state: STATES.has(x.state) ? x.state : '',
        epoch: Number(x.epoch) || 0,
      }))
      : [],
  };
}

const audit = (st, now, action, { actor, reason } = {}) => {
  st.audit.unshift({
    at: now, action: clampText(action, 24), actor: clampText(actor, 40) || 'owner',
    reason: clampText(reason), state: st.state, epoch: st.epoch,
  });
  if (st.audit.length > AUDIT_MAX) st.audit.length = AUDIT_MAX;
};

const idOk = id => typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id);

// Drop leases whose request can no longer be running. Called by everything that reads the book.
export function prune(st, now) {
  let removed = 0;
  for (const [id, at] of Object.entries(st.leases)) {
    if (!(now - at < LEASE_MS)) { delete st.leases[id]; removed++; }
  }
  return removed;
}

// Admit one API request. `false` means "handle nothing at all": the caller answers 503 and no
// request reaches a handler, which is what makes this a pause rather than a hint.
export function admit(st, now, id) {
  if (!idOk(id)) throw new GateError('bad-lease', 400);
  prune(st, now);
  if (st.state !== OPEN) return { ok: false, state: st.state, epoch: st.epoch };
  if (Object.keys(st.leases).length >= MAX_LEASES) return { ok: false, state: 'busy', epoch: st.epoch };
  st.leases[id] = now;
  st.lastAdmissionAt = now;
  return { ok: true, epoch: st.epoch };
}

export function release(st, id) {
  if (!idOk(id) || !(id in st.leases)) return false;
  delete st.leases[id];
  return true;
}

export function drain(st, now) {
  prune(st, now);
  const liveLeases = Object.keys(st.leases).length;
  const quietMs = st.lastAdmissionAt ? Math.max(0, now - st.lastAdmissionAt) : QUIET_MS;
  return { drained: liveLeases === 0 && quietMs >= QUIET_MS, liveLeases, quietMs, requiredMs: QUIET_MS };
}

// The phrase is compared exactly (only surrounding whitespace is forgiving). Typing it is the point:
// it is the difference between a considered pause and a stray arrow-key history recall.
const requirePhrase = (action, confirm) => {
  if (String(confirm || '').trim() !== CONFIRM[action])
    throw new GateError('confirm-required', 400, { confirm: CONFIRM[action] });
};

// Stop admitting. Idempotent: closing an already-closing gate changes nothing and says so.
export function closeGate(st, now, opts = {}) {
  requirePhrase('close', opts.confirm);
  if (st.state !== OPEN) return { changed: false, ...publicStatus(st, now) };
  st.state = CLOSING;
  st.reason = clampText(opts.reason) || 'operator closed writes';
  st.changedAt = now;
  audit(st, now, 'close', opts);
  return { changed: true, ...publicStatus(st, now) };
}

// The only transition that may be reported as safe to restore. Refused until the gate has drained.
export function sealGate(st, now, opts = {}) {
  requirePhrase('seal', opts.confirm);
  // Sealing twice is a no-op, not an error: a runbook may be resumed after an interruption.
  if (st.state === CLOSED) return { changed: false, ...publicStatus(st, now) };
  if (st.state !== CLOSING) throw new GateError('not-closing', 409, { state: st.state });
  const report = drain(st, now);
  if (!report.drained) throw new GateError('not-drained', 409, report);
  st.state = CLOSED;
  st.reason = clampText(opts.reason) || st.reason;
  st.changedAt = now;
  audit(st, now, 'seal', opts);
  return { changed: true, ...publicStatus(st, now) };
}

// Reopen writes. The epoch moves so a client (or a log) can tell one era of the database from the
// next: after a restore, nobody may believe a save written in epoch N is still the truth in epoch N+1.
export function openGate(st, now, opts = {}) {
  requirePhrase('open', opts.confirm);
  if (st.state === OPEN) return { changed: false, ...publicStatus(st, now) };
  st.state = OPEN;
  st.epoch += 1;
  st.reason = clampText(opts.reason) || 'operator opened writes';
  st.changedAt = now;
  st.leases = {};
  st.lastAdmissionAt = 0;
  audit(st, now, 'open', opts);
  return { changed: true, ...publicStatus(st, now) };
}

// What an operator is shown. Deliberately no token, no player data, no database contents.
export function publicStatus(st, now, auditLimit = 12) {
  const report = drain(st, now);
  return {
    state: st.state,
    reason: st.reason,
    epoch: st.epoch,
    changedAt: st.changedAt,
    open: st.state === OPEN,
    safeToRestore: st.state === CLOSED && report.drained,
    drain: report,
    authLocked: isLocked(st, now),
    audit: st.audit.slice(0, auditLimit),
  };
}

export const isLocked = (st, now) => !!st.auth.lockUntil && now < st.auth.lockUntil;

export function noteAuthFail(st, now) {
  const fresh = !st.auth.firstAt || now - st.auth.firstAt > AUTH_WINDOW_MS;
  st.auth.fails = fresh ? 1 : st.auth.fails + 1;
  st.auth.firstAt = fresh ? now : st.auth.firstAt;
  if (st.auth.fails >= AUTH_MAX) {
    st.auth.lockUntil = now + AUTH_LOCK_MS;
    st.auth.fails = 0;
    st.auth.firstAt = 0;
  }
  return st.auth;
}

export function noteAuthOk(st) {
  st.auth = { fails: 0, firstAt: 0, lockUntil: 0 };
  return st.auth;
}
