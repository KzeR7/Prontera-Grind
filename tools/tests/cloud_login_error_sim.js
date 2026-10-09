// Cloud sign-in must never fail silently, pulled from the real cloudAuth() in index.html.
//   node tools/tests/cloud_login_error_sim.js
//
// The server answers 200 and sets the session cookie before the browser starts the game. If the game
// then throws while starting (a save that will not load, a UI step), the player must see a message on
// the login card. Before this suite existed, the error escaped as an unhandled promise and the card
// simply stayed open.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const start = src.indexOf('async function cloudAuth(u,p,isReg){');
const end = src.indexOf('\nfunction cloudLogout()', start);
assert.ok(start >= 0 && end > start, 'cloudAuth is not where this suite expects it');
const authCode = src.slice(start, end);

// A harness around cloudAuth only. `opts.join` decides what initSessionFromCloud does.
function harness(opts = {}) {
  const state = { errors: [], remembered: [], started: [], fetches: [] };
  const box = {
    console, Promise, Error, Object, JSON,
    CLOUD: { ver: 7, dirty: true },
    showErr: (m, ok) => { state.errors.push(m); },
    rememberUserId: (id, force) => { state.remembered.push(id); },
    ask: (msg, yes) => { state.asked = { msg, yes }; },
    cloudFetch: async (path, o) => {
      state.fetches.push({ path, method: o && o.method, body: o && o.body });
      if (opts.networkDown) throw new Error('network down');
      return {
        ok: opts.status == null || (opts.status >= 200 && opts.status < 300),
        status: opts.status == null ? 200 : opts.status,
        json: async () => opts.body || { u: 'Ranger', gm: 0, recovery: opts.recovery },
      };
    },
    initSessionFromCloud: async (u, gm, isNew) => {
      state.started.push({ u, gm, isNew });
      if (opts.join) return opts.join();
    },
  };
  vm.createContext(box);
  vm.runInContext(authCode, box);
  return { box, state };
}

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
}

(async () => {
  console.log('cloud sign-in error reporting\n');

  await t('a game-side failure while starting shows a message on the card (login)', async () => {
    const h = harness({ join: () => { throw new Error('save will not load'); } });
    await h.box.cloudAuth('Ranger', 'password123', false);
    assert.strictEqual(h.state.errors.length, 1, 'exactly one message is shown');
    assert.match(h.state.errors[0], /Signed in, but the game could not start: save will not load/);
    assert.match(h.state.errors[0], /log in again/, 'the player is told what to do next');
    assert.ok(!h.state.errors[0].includes('Could not reach the server'), 'not mislabelled as a network error');
  });

  await t('a game-side failure is reported after registering (recovery-code prompt first)', async () => {
    const h = harness({ recovery: 'ABCD-EFGH-JKMN-PQRS', join: () => { throw new Error('boom'); } });
    await h.box.cloudAuth('Ranger', 'password123', true);
    assert.ok(h.state.asked, 'the recovery-code prompt is shown');
    h.state.asked.yes();
    await new Promise(r => setTimeout(r, 0));
    assert.ok(h.state.errors.some(m => /could not start: boom/.test(m)), 'the failure reaches the card');
  });

  await t('a game-side failure is reported after registering (no recovery prompt)', async () => {
    const h = harness({ join: () => { throw new Error('boom'); } });
    await h.box.cloudAuth('Ranger', 'password123', true);
    assert.ok(h.state.errors.some(m => /could not start: boom/.test(m)), 'the failure reaches the card');
  });

  await t('a successful login starts the session once and shows no error', async () => {
    const h = harness();
    await h.box.cloudAuth('Ranger', 'password123', false);
    assert.deepStrictEqual(h.state.started, [{ u: 'Ranger', gm: 0, isNew: false }]);
    assert.deepStrictEqual(h.state.errors, []);
    assert.deepStrictEqual(h.state.remembered, ['Ranger']);
  });

  await t('a wrong password still shows the server message, and does not start a session', async () => {
    const h = harness({ status: 401, body: { err: 'Incorrect username or password.' } });
    await h.box.cloudAuth('Ranger', 'wrongpass1', false);
    assert.deepStrictEqual(h.state.errors, ['Incorrect username or password.']);
    assert.deepStrictEqual(h.state.started, []);
  });

  await t('a dead network still reports as a connection problem', async () => {
    const h = harness({ networkDown: true });
    await h.box.cloudAuth('Ranger', 'password123', false);
    assert.strictEqual(h.state.errors.length, 1);
    assert.match(h.state.errors[0], /^Could not reach the server: network down/);
    assert.deepStrictEqual(h.state.started, []);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
