// Cloud sign-in must never fail silently, pulled from the real cloudAuth() in index.html.
//   node tools/tests/cloud_login_error_sim.js
//
// Three ways a login used to show NOTHING, each covered here:
//  1. The server signed the player in, then the game threw while starting. The error escaped as an
//     unhandled promise and the card stayed open (fixed in v88.2).
//  2. The server answered slowly. The card showed nothing and the button stayed live, so a player
//     clicked again. Now it shows "Signing in…" and disables the button (v88.3).
//  3. The server never answered. Now the request is abandoned after AUTH_TIMEOUT_MS with a message,
//     and the button comes back (v88.3).
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const start = src.indexOf('const AUTH_TIMEOUT_MS=');
const end = src.indexOf('\nfunction cloudLogout()', start);
assert.ok(start >= 0 && end > start, 'cloudAuth is not where this suite expects it');
const authCode = src.slice(start, end);

// A harness around cloudAuth only. `opts.join` decides what initSessionFromCloud does.
function harness(opts = {}) {
  const state = { errors: [], remembered: [], started: [], fetches: [] };
  const btn = { disabled: false };
  const box = {
    console, Promise, Error, Object, JSON, AbortController, setTimeout, clearTimeout,
    CLOUD: { ver: 7, dirty: true },
    $: id => (id === 'authBtn' ? btn : {}),
    showErr: (m, ok) => { state.errors.push(m); },
    rememberUserId: (id, force) => { state.remembered.push(id); },
    ask: (msg, yes) => { state.asked = { msg, yes }; },
    cloudFetch: (path, o) => {
      state.fetches.push({ path, method: o && o.method, body: o && o.body });
      if (opts.networkDown) return Promise.reject(new Error('network down'));
      if (opts.stall || opts.hold) {
        // a server that does not answer until the caller gives up (abort), or until we release it
        return new Promise((resolve, reject) => {
          const abort = () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); };
          if (o && o.signal) o.signal.addEventListener('abort', abort);
          if (opts.hold) state.release = () => resolve(answer());
        });
      }
      return Promise.resolve(answer());
    },
    initSessionFromCloud: async (u, gm, isNew) => {
      state.started.push({ u, gm, isNew });
      if (opts.join) return opts.join();
    },
  };
  const answer = () => ({
    ok: opts.status == null || (opts.status >= 200 && opts.status < 300),
    status: opts.status == null ? 200 : opts.status,
    json: async () => opts.body || { u: 'Ranger', gm: 0, recovery: opts.recovery },
  });
  vm.createContext(box);
  // a short timeout, so the stall case finishes at once; the real value is asserted separately below
  const code = opts.stall || opts.hold ? authCode.replace('AUTH_TIMEOUT_MS=20000', 'AUTH_TIMEOUT_MS=30') : authCode;
  vm.runInContext(code, box);
  return { box, state, btn };
}

const lastErr = s => s.errors[s.errors.length - 1];
const tick = () => new Promise(r => setTimeout(r, 0));

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
}

(async () => {
  console.log('cloud sign-in error reporting\n');

  await t('the real timeout is 20 seconds', () => {
    assert.match(src, /const AUTH_TIMEOUT_MS=20000;/);
  });

  await t('a game-side failure while starting shows a message on the card (login)', async () => {
    const h = harness({ join: () => { throw new Error('save will not load'); } });
    await h.box.cloudAuth('Ranger', 'password123', false);
    assert.match(lastErr(h.state), /Signed in, but the game could not start: save will not load/);
    assert.match(lastErr(h.state), /log in again/, 'the player is told what to do next');
    assert.ok(!h.state.errors.some(m => m.includes('Could not reach the server')), 'not mislabelled as a network error');
    assert.strictEqual(h.btn.disabled, false, 'the button is usable again');
  });

  await t('a game-side failure is reported after registering (recovery-code prompt first)', async () => {
    const h = harness({ recovery: 'ABCD-EFGH-JKMN-PQRS', join: () => { throw new Error('boom'); } });
    await h.box.cloudAuth('Ranger', 'password123', true);
    assert.ok(h.state.asked, 'the recovery-code prompt is shown');
    h.state.asked.yes();
    await tick();
    assert.ok(h.state.errors.some(m => /could not start: boom/.test(m)), 'the failure reaches the card');
  });

  await t('a game-side failure is reported after registering (no recovery prompt)', async () => {
    const h = harness({ join: () => { throw new Error('boom'); } });
    await h.box.cloudAuth('Ranger', 'password123', true);
    assert.ok(h.state.errors.some(m => /could not start: boom/.test(m)), 'the failure reaches the card');
  });

  await t('a successful login starts the session once and leaves no error text behind', async () => {
    const h = harness();
    await h.box.cloudAuth('Ranger', 'password123', false);
    assert.deepStrictEqual(h.state.started, [{ u: 'Ranger', gm: 0, isNew: false }]);
    assert.strictEqual(lastErr(h.state), '', 'the "Signing in…" line is cleared before the game starts');
    assert.ok(!h.state.errors.some(m => m && !/Signing in/.test(m)), 'no error text at any point');
    assert.deepStrictEqual(h.state.remembered, ['Ranger']);
  });

  await t('a wrong password shows the server message, and does not start a session', async () => {
    const h = harness({ status: 401, body: { err: 'Incorrect username or password.' } });
    await h.box.cloudAuth('Ranger', 'wrongpass1', false);
    assert.strictEqual(lastErr(h.state), 'Incorrect username or password.');
    assert.deepStrictEqual(h.state.started, []);
    assert.strictEqual(h.btn.disabled, false);
  });

  await t('a dead network still reports as a connection problem', async () => {
    const h = harness({ networkDown: true });
    await h.box.cloudAuth('Ranger', 'password123', false);
    assert.match(lastErr(h.state), /^Could not reach the server: network down/);
    assert.deepStrictEqual(h.state.started, []);
    assert.strictEqual(h.btn.disabled, false);
  });

  await t('while the server is answering, it says "Signing in…" and the button is locked', async () => {
    const h = harness({ hold: true });
    const p = h.box.cloudAuth('Ranger', 'password123', false);
    await tick();
    assert.strictEqual(lastErr(h.state), 'Signing in…', 'the player can see work is under way');
    assert.strictEqual(h.btn.disabled, true, 'a second click cannot send a second request');
    h.state.release();
    await p;
    assert.strictEqual(h.btn.disabled, false);
    assert.deepStrictEqual(h.state.started, [{ u: 'Ranger', gm: 0, isNew: false }]);
  });

  await t('a server that never answers gives up with a message, and the button comes back', async () => {
    const h = harness({ stall: true });
    await h.box.cloudAuth('Ranger', 'password123', false);
    assert.match(lastErr(h.state), /did not answer in time/);
    assert.strictEqual(h.btn.disabled, false);
    assert.deepStrictEqual(h.state.started, [], 'no session is started on a timeout');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
