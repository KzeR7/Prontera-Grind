// Registration confirmation and remember-user behavior, pulled from the real auth handler.
//   node tools/tests/registration_sim.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const start = src.indexOf("const REMEMBER_USER_KEY='pg_remember_user';");
const end = src.indexOf('\nfunction logout()', start);
assert.ok(start >= 0 && end > start, 'auth flow is not where this suite expects it');
const authCode = src.slice(start, end);

function harness(opts = {}) {
  const els = new Map();
  const state = { acc: {}, storage: new Map(Object.entries(opts.storage || {})), sessions: [], cloudCalls: [], confirmations: [] };
  const node = id => {
    if (!els.has(id)) els.set(id, { value: '', textContent: '', style: {}, required: false,
      autocomplete: '', checked: false, events: {}, classList: { toggle() {} },
      addEventListener(type, fn) { this.events[type] = fn; } });
    return els.get(id);
  };
  const box = {
    console, Math, Number, String, Object, Array,
    $: node,
    CLOUD: { api: false }, GM_USER: 'GM', GM_PASS_HASH: 'never-used',
    currentUser: null,
    getAcc: () => state.acc,
    setAcc: a => { state.acc = a; },
    lsGet: k => state.storage.has(k) ? state.storage.get(k) : null,
    lsPut: (k, v) => state.storage.set(k, String(v)),
    lsDel: k => state.storage.delete(k),
    hashPw: p => 'hash:' + p,
    gmOk: () => false,
    initSession: (gm, fresh) => { state.sessions.push({ gm, fresh, user: box.currentUser }); },
    cloudAuth: (...args) => { state.cloudCalls.push(args); },
    ask: (msg, yes, labels = {}) => { state.confirmations.push({ msg, yes, labels }); },
    addEventListener() {},
  };
  vm.createContext(box);
  vm.runInContext(authCode, box);
  return { box, state, els, node };
}
function submit(h) {
  let prevented = false;
  h.box.submitAuth({ preventDefault() { prevented = true; } });
  return prevented;
}
function confirmRegistration(h) {
  const c = h.state.confirmations.at(-1);
  assert.ok(c, 'a registration confirmation should be waiting');
  c.yes();
}
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
}
console.log('registration confirmation and remembered user ID\n');

t('the register confirmation modal layers above the login screen', () => {
  const modal=Number((src.match(/#modal\{[^}]*z-index:(\d+)/)||[])[1]);
  const login=Number((src.match(/#loginOverlay\s*\{[^}]*z-index:\s*(\d+)/)||[])[1]);
  assert.ok(modal>login, 'login confirmation would otherwise be hidden behind its own overlay');
});

t('remember-user restores the saved ID and removes it when the option is unchecked', () => {
  const h = harness({ storage: { pg_remember_user: 'Ranger' } });
  assert.strictEqual(h.node('username').value, 'Ranger');
  assert.strictEqual(h.node('rememberUser').checked, true);
  h.node('rememberUser').checked = false;
  h.node('rememberUser').events.change();
  assert.strictEqual(h.state.storage.has('pg_remember_user'), false, 'opting out deletes the saved ID');
});

t('valid local registration asks first, then creates the account, remembers the ID and enters the game', () => {
  const h = harness(); h.box.setMode('reg');
  h.node('username').value = 'Ranger'; h.node('password').value = 'four'; h.node('password2').value = 'four';
  assert.strictEqual(submit(h), true, 'the form submit is prevented');
  assert.deepStrictEqual(h.state.acc, {}, 'nothing is created before confirmation');
  assert.strictEqual(h.state.sessions.length, 0);
  assert.match(h.state.confirmations[0].msg, /Create the account “Ranger”/);
  assert.match(h.state.confirmations[0].msg, /stored in this browser only/);
  assert.strictEqual(h.state.confirmations[0].labels.yes, 'Create account');
  confirmRegistration(h);
  assert.strictEqual(h.state.acc.Ranger, 'hash:four');
  assert.deepStrictEqual(h.state.sessions, [{ gm: false, fresh: true, user: 'Ranger' }]);
  assert.strictEqual(h.state.storage.get('pg_remember_user'), 'Ranger');
  assert.strictEqual(h.node('rememberUser').checked, true, 'registration enables remember-user automatically');
  assert.strictEqual(h.node('password').value, '', 'password is cleared');
  assert.strictEqual(h.node('password2').value, '', 'confirmation is cleared');
  assert.strictEqual(h.node('authBtn').textContent, 'Login', 'the overlay is no longer left in Register mode');
});

t('leaving the registration confirmation unaccepted makes no account and starts no session', () => {
  const h = harness(); h.box.setMode('reg');
  h.node('username').value = 'Ranger'; h.node('password').value = 'four'; h.node('password2').value = 'four';
  submit(h);
  assert.deepStrictEqual(h.state.acc, {});
  assert.strictEqual(h.state.sessions.length, 0);
  assert.strictEqual(h.state.confirmations.length, 1);
});

t('a mismatched confirmation creates no account and does not open the register dialog', () => {
  const h = harness(); h.box.setMode('reg');
  h.node('username').value = 'Ranger'; h.node('password').value = 'four'; h.node('password2').value = 'five';
  submit(h);
  assert.match(h.node('loginErr').textContent, /do not match/i);
  assert.deepStrictEqual(h.state.acc, {});
  assert.strictEqual(h.state.confirmations.length, 0);
  assert.strictEqual(h.state.sessions.length, 0);
});

t('cloud password length is checked before confirmation or any API call', () => {
  const h = harness(); h.box.CLOUD.api = true; h.box.setMode('reg');
  h.node('username').value = 'Ranger'; h.node('password').value = 'short'; h.node('password2').value = 'short';
  submit(h);
  assert.match(h.node('loginErr').textContent, /10 characters/i);
  assert.strictEqual(h.state.confirmations.length, 0);
  assert.strictEqual(h.state.cloudCalls.length, 0);
});

t('valid cloud registration confirms the cross-device account before calling the server', () => {
  const h = harness(); h.box.CLOUD.api = true; h.box.setMode('reg');
  h.node('username').value = 'Ranger'; h.node('password').value = 'a-good-password'; h.node('password2').value = 'a-good-password';
  submit(h);
  assert.match(h.state.confirmations[0].msg, /can be used on other devices/);
  assert.strictEqual(h.state.cloudCalls.length, 0, 'the API is not called before confirmation');
  confirmRegistration(h);
  assert.deepStrictEqual(h.state.cloudCalls, [['Ranger', 'a-good-password', true]]);
  assert.deepStrictEqual(h.state.acc, {}, 'cloud accounts are not copied into the local account table');
  assert.strictEqual(h.state.sessions.length, 0, 'the cloud callback owns session startup');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
