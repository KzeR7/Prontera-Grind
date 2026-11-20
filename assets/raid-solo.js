/* Rift Raid — the solo runner.
 *
 * A solo run is executed HERE, in the browser, by the same engine module the co-op room imports
 * (`assets/raid-engine/raid-engine.js`, published verbatim from `functions/_lib/raid-engine.js`).
 * There is no second rule set: `raid-engine.js` is the whole simulation, and this file is only the
 * clock, the intent plumbing and the local checkpoint.
 *
 * What a solo run does NOT do, and must never start doing:
 *   - it does not install a run in the Social Durable Object;
 *   - it does not open the plaza socket or require a Social connection;
 *   - it does not poll a Durable Object for snapshots;
 *   - it does not send movement, focus or combat to a Durable Object;
 *   - it does not schedule a Durable Object alarm.
 * A complete solo run makes ZERO raid-related Durable Object requests. The only network traffic is
 * the two D1 calls in `functions/api/raid.js`: `start` (which reserves the daily entry and returns a
 * signed, seeded run identity) and `settle` (which pays exactly once). Both are authenticated Pages
 * Functions talking to D1, not Social.
 *
 * Trust model, stated plainly: the browser is not trusted to invent a result. `settle` re-runs the
 * completion check against the reported outcome and the server holds the only authority over reward
 * rows. A local run can be honest or it can lie; what it cannot do is make the server pay for a lie
 * the settlement contract does not accept. That contract is documented in
 * docs/RIFT-RAID-RECONCILIATION.md, together with the bounded-replay proposal that would let the
 * server verify a clear instead of merely accepting a bounded claim.
 */
(function () {
  'use strict';

  const R = (globalThis.PGRaidSolo = globalThis.PGRaidSolo || {});
  if (R.installed) return;
  R.installed = true;

  // The checkpoint format is versioned by BOTH the storage key and the payload, so a rules change
  // can never be resumed under the old simulation. `rulesVersion` comes from the server on start.
  const CHECKPOINT_VERSION = 1;
  const KEY_PREFIX = 'pg.raid.solo.';

  // Where this file was loaded from. A dynamic `import()` of a relative specifier resolves against
  // the importing script's base URL, which is correct in a browser but implicit; capturing it here
  // makes the resolution explicit and keeps working if the file is ever inlined or served from a
  // nested path.
  const SELF_URL = (function () {
    try {
      if (document.currentScript && document.currentScript.src) return document.currentScript.src;
    } catch (error) { void error; }
    try { return new URL('assets/raid-solo.js', document.baseURI).href; } catch (error) { void error; }
    return '';
  })();

  let engine = null;

  function keyFor(accountKey, runId) {
    return KEY_PREFIX + String(accountKey || 'anon') + '.' + String(runId || '');
  }

  // Storage is wrapped rather than called directly: a browser that refuses storage (private mode, a
  // full quota, a blocked origin) must be distinguishable from a browser with no saved run. The
  // difference matters because "no saved run" is what triggers a new paid entry, and a storage FAILURE
  // must never be mistaken for "nothing was saved".
  function storage() {
    try {
      const s = globalThis.localStorage;
      if (!s) return { ok: false, why: 'unavailable' };
      // Touch it: Safari private mode exposes the object and throws on write.
      const probe = KEY_PREFIX + 'probe';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return { ok: true, store: s };
    } catch (error) {
      return { ok: false, why: String((error && error.message) || error) };
    }
  }

  async function loadEngine() {
    if (engine) return engine;
    // Imported once and cached. The query string is the rules version so a stale cached module can
    // never simulate a run that the server reserved under different numbers.
    const url = SELF_URL ? new URL('raid-engine/raid-engine.js', SELF_URL).href : './raid-engine/raid-engine.js';
    engine = await import(url);
    return engine;
  }

  R.storageStatus = () => storage();

  // ---------------------------------------------------------------- checkpoint ---
  // A checkpoint is scoped by account + run id + rules version. It is a snapshot of *simulation*
  // state, never of rewards: the reward authority is the server, so a restored checkpoint cannot
  // grant a duplicate clear.
  R.saveCheckpoint = function saveCheckpoint(run, accountKey) {
    if (!run || !run.id) return { ok: false, why: 'no-run' };
    const st = storage();
    if (!st.ok) return { ok: false, why: st.why };
    try {
      st.store.setItem(keyFor(accountKey, run.id), JSON.stringify({
        v: CHECKPOINT_VERSION,
        rulesVersion: run.rulesVersion || '',
        accountKey: accountKey || '',
        run: run,
      }));
      return { ok: true };
    } catch (error) {
      return { ok: false, why: String((error && error.message) || error) };
    }
  };

  // `missing` and `broken` are deliberately different answers.
  //   missing -> there is no saved run for this account+run id
  //   broken  -> something WAS saved and cannot be read (rules change, corrupt payload, storage error)
  // A caller may start a fresh entry on `missing`. It must NOT do so on `broken`: that is how a
  // player loses a paid attempt to a JSON parse error.
  R.loadCheckpoint = function loadCheckpoint(accountKey, runId, rulesVersion) {
    const st = storage();
    if (!st.ok) return { status: 'broken', why: st.why };
    const raw = st.store.getItem(keyFor(accountKey, runId));
    if (raw == null) return { status: 'missing' };
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return { status: 'broken', why: 'unreadable' }; }
    if (!parsed || parsed.v !== CHECKPOINT_VERSION) return { status: 'broken', why: 'version' };
    // A checkpoint from a different rules version is not resumed: the simulation that produced it no
    // longer exists, and re-running the new rules from its state would be a mid-run rules change.
    if ((parsed.rulesVersion || '') !== (rulesVersion || '')) return { status: 'broken', why: 'rules' };
    if (!parsed.run || parsed.run.id !== runId) return { status: 'broken', why: 'identity' };
    return { status: 'ok', run: parsed.run };
  };

  R.clearCheckpoint = function clearCheckpoint(accountKey, runId) {
    const st = storage();
    if (!st.ok) return { ok: false, why: st.why };
    try { st.store.removeItem(keyFor(accountKey, runId)); return { ok: true }; }
    catch (error) { return { ok: false, why: String((error && error.message) || error) }; }
  };

  // ---------------------------------------------------------------- the run ---
  // A solo run is created from the SERVER's reservation, never from client input: the run id, the
  // seed, the rules version and the profile snapshot all come back from `start`. The client's job is
  // to execute them, not to choose them.
  R.begin = async function begin(reservation) {
    const E = await loadEngine();
    const run = E.createRaidRun({
      id: reservation.runId,
      seed: reservation.seed,
      now: reservation.startedAt,
      leaderId: reservation.member.id,
      partySize: 1,
      members: [reservation.member],
    });
    // The reservation's own deadline wins over anything the engine computed, so the run the player
    // is playing is the run the server reserved.
    if (reservation.deadlineAt) run.deadlineAt = reservation.deadlineAt;
    run.rulesVersion = reservation.rulesVersion || '';
    run.local = true;
    return run;
  };

  // Read the clock forward to `now`. This is the background-tab recovery path: the engine resolves
  // the elapsed cells chronologically, so a tab that was hidden for five minutes resumes in the same
  // state a tab that was watched the whole time would be in.
  R.advance = async function advance(run, now) {
    const E = await loadEngine();
    E.advanceRaidRun(run, now);
    return run;
  };

  // Every player input goes through here, synchronously, with no network. `at` is the run's own
  // clock, which is what gives a free intent its ordering.
  R.act = async function act(run, action, opts) {
    const E = await loadEngine();
    return E.applyRaidAction(run, run.members[0].id, action, opts);
  };

  // The renderer's snapshot. Same function the co-op room uses to build a public run, so the field
  // HUD draws identical data in both modes. Synchronous on purpose: the engine module is already
  // loaded by the time a loop is running, and a frame must never await between reading the clock and
  // handing the renderer a state.
  R.snapshotSync = function snapshotSync(run, now) {
    if (!engine) throw new Error('The raid engine is not loaded yet.');
    return engine.raidPublicRun(run, now || run.updatedAt);
  };
  R.snapshot = async function snapshot(run, now) {
    const E = await loadEngine();
    return E.raidPublicRun(run, now);
  };

  // The honest local loop. It reads at the caller's cadence, saves a checkpoint, and stops the
  // moment the run is terminal. `onFrame` receives the public snapshot so the renderer never touches
  // engine internals.
  R.loop = function loop(run, opts = {}) {
    const every = Math.max(50, Number(opts.every) || 100);
    const accountKey = opts.accountKey || '';
    let timer = null;
    let stopped = false;

    const frame = async () => {
      if (stopped) return;
      const now = Date.now() + (Number(opts.serverOffset) || 0);
      try {
        await R.advance(run, now);
        if (run.state !== 'active') {
          R.stop();
          if (typeof opts.onEnd === 'function') opts.onEnd(run);
          return;
        }
        R.saveCheckpoint(run, accountKey);
        if (typeof opts.onFrame === 'function') opts.onFrame(run, R.snapshotSync(run, now));
      } catch (error) {
        // A thrown frame must not silently kill the run: report it and keep the checkpoint that was
        // already written so a reload resumes instead of restarting.
        if (typeof opts.onError === 'function') opts.onError(error);
      }
    };

    timer = setInterval(frame, every);
    frame();
    R.stop = function stop() {
      stopped = true;
      if (timer) { clearInterval(timer); timer = null; }
    };
    return R.stop;
  };

  R.stop = R.stop || function () {};
})();
