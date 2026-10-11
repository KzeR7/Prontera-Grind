// The save-owner stamp (v88.6): every save names its account, and a save for another account is never
// written over this one. The real helpers and the real save() are pulled out of index.html and run.
//   node tools/tests/save_owner_sim.js
//
// The cloud paths are covered by cloud_sim.js, the load path by save_load_sim.js, the server by api_sim.js,
// and the real login card in a booted page by save_owner_boot_smoke.js (needs jsdom + three).
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const grab = (a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error('missing source boundary: ' + a.slice(0, 60));
  return src.slice(i, j);
};

// ---------------------------------------------------------- the helpers ----
const helpers = grab('// ---------- the save-owner stamp (v88.6) ----------', 'const num_= (v,d)');
// save() and its refusal note sit between offlineRateSample and offlinePlan.
const saveCode = grab('// v88.6: a save that belongs to another account is never written over this one.', 'function offlinePlan(');

function sandbox() {
  const logs = [], writes = [], store = new Map(), touched = { n: 0 };
  const box = { console, JSON, Date, Object, Array, String, Number, Math, Error, logs, writes, store, touched };
  vm.createContext(box);
  vm.runInContext(`
    let currentUser = 'KzeR', S = { lv: 5, cls: 'Novice' };
    const CLOUD = { on: false };   // the game's cloud state, read when a refusal is explained
    const saveKey = () => 'pg_save3_' + currentUser;
    const lsGet = k => (store.has(k) ? store.get(k) : null);
    const lsPut = (k, v) => { writes.push(k); store.set(k, String(v)); };
    const cloudTouch = () => { touched.n++ };
    const log = (m, cls) => logs.push({ m, cls });
    const offlineRateSample = () => {};
    const gmStatSnapshot = () => ({});
    ${helpers}
    ${saveCode}
    globalThis.api = {
      save: () => save(),
      getS: () => S, setS: v => { S = v },
      setUser: v => { currentUser = v },
      setCloud: v => { CLOUD.on = !!v },
      saveElsewhereSaid: () => saveElsewhereSaid,
    };
  `, box);
  return box;
}

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
};
console.log('save-owner stamp: who a save belongs to, and what is refused\n');

// ----------------------------------------------- the truth table of the helpers ----
const box = sandbox();
const run = code => vm.runInContext(code, box);

t('the owner of a save is read from the save itself, trimmed, and only when it is a name', () => {
  assert.strictEqual(run(`saveOwnerOf('{"owner":"KzeR","lv":3}')`), 'KzeR');
  assert.strictEqual(run(`saveOwnerOf('{"owner":"  KzeR  "}')`), 'KzeR');
  assert.strictEqual(run(`saveOwnerOf({owner:'KzeR'})`), 'KzeR', 'an already-parsed save works too');
  assert.strictEqual(run(`saveOwnerOf('{"lv":3}')`), null, 'no stamp');
  assert.strictEqual(run(`saveOwnerOf('{"owner":""}')`), null, 'an empty stamp is no stamp');
  assert.strictEqual(run(`saveOwnerOf('{"owner":5}')`), null, 'a number is not an account name');
  assert.strictEqual(run(`saveOwnerOf('[1,2]')`), null, 'an array is not a save');
  assert.strictEqual(run(`saveOwnerOf('not json')`), null, 'unreadable text has no stamp');
  assert.strictEqual(run(`saveOwnerOf('')`), null);
  assert.strictEqual(run(`saveOwnerOf(null)`), null);
});

t('account names match without regard to case, and an empty name matches nothing', () => {
  assert.strictEqual(run(`sameAccount('KzeR','kzer')`), true);
  assert.strictEqual(run(`sameAccount('KzeR','Friend')`), false);
  assert.strictEqual(run(`sameAccount('','')`), false, 'two empty names are not the same account');
  assert.strictEqual(run(`sameAccount(null,'KzeR')`), false);
  assert.strictEqual(run(`sameAccount('KzeR',null)`), false);
});

t('a save is refused for an account only when it names a different one', () => {
  assert.strictEqual(run(`saveRefusal('{"owner":"Friend","lv":60}','KzeR')`), 'Friend', 'another account: refused, and the name says whose');
  assert.strictEqual(run(`saveRefusal('{"owner":"kzer","lv":60}','KzeR')`), null, 'this account in another case: allowed');
  assert.strictEqual(run(`saveRefusal('{"lv":60}','KzeR')`), null, 'a save from before the stamp: allowed');
  assert.strictEqual(run(`saveRefusal('garbage','KzeR')`), null, 'unreadable: no stamp, so not refused here');
  assert.strictEqual(run(`saveRefusal('{"owner":"Friend"}',null)`), 'Friend', 'with nobody signed in, a stamped save is refused');
});

t('two copies of the same progress are one save, whether or not one carries the stamp', () => {
  const plain = '{"lv":20,"cls":"Mage","zeny":10}';
  assert.strictEqual(run(`sameSave(${JSON.stringify(plain)},${JSON.stringify(plain)})`), true);
  assert.strictEqual(run(`sameSave(${JSON.stringify(plain)},${JSON.stringify('{"lv":20,"cls":"Mage","zeny":10,"owner":"X"}')})`), true,
    'the stamp is not progress');
  assert.strictEqual(run(`sameSave(${JSON.stringify(plain)},${JSON.stringify('{"lv":21,"cls":"Mage","zeny":10}')})`), false,
    'different progress is different, whatever the stamp');
  assert.strictEqual(run(`sameSave(${JSON.stringify(plain)},null)`), false);
  assert.strictEqual(run(`sameSave(null,null)`), true, 'two missing copies are trivially the same');
});

// ----------------------------------------------------- save(): the write path ----
const fresh = () => sandbox();

t('saving stamps the live save with its account and writes it to that account\'s slot', () => {
  const b = fresh(); const a = () => b.api;
  a().save();
  const saved = JSON.parse(b.store.get('pg_save3_KzeR'));
  assert.strictEqual(saved.owner, 'KzeR', 'the slot records whose save it is');
  assert.strictEqual(saved.lv, 5, 'and the progress');
  assert.strictEqual(a().getS().owner, 'KzeR', 'the live save carries the stamp too');
  assert.strictEqual(b.touched.n, 1, 'and it is offered to the cloud, as before');
});

t('a slot that holds another account\'s save is never written over, and the cloud still hears of this account\'s progress', () => {
  const b = fresh(); const a = () => b.api;
  const theirs = '{"owner":"Friend","lv":60}';
  b.store.set('pg_save3_KzeR', theirs);
  a().save();
  assert.strictEqual(b.store.get('pg_save3_KzeR'), theirs, 'the other account\'s save is untouched');
  assert.strictEqual(b.touched.n, 1, 'this account\'s live progress still goes to its own cloud copy');
  assert.ok(b.logs.some(l => /belongs to Friend/.test(l.m) && /nothing was written over it/.test(l.m)),
    'and the player is told why the local copy was not saved');
});

t('the refusal says what happens to progress, which depends on whether this account syncs to the cloud', () => {
  const local = fresh(); local.store.set('pg_save3_KzeR', '{"owner":"Friend","lv":60}');
  local.api.save();
  assert.ok(local.logs.some(l => /not kept in this browser/.test(l.m)), 'a local-only account is told its progress is not kept');
  const cloud = fresh(); cloud.store.set('pg_save3_KzeR', '{"owner":"Friend","lv":60}');
  cloud.api.setCloud(true); cloud.api.save();
  assert.ok(cloud.logs.some(l => /still syncs to your account/.test(l.m)), 'a cloud account is told it still syncs');
});

t('the refusal is said once, not again on every five-second save', () => {
  const b = fresh(); const a = () => b.api;
  b.store.set('pg_save3_KzeR', '{"owner":"Friend","lv":60}');
  for (let i = 0; i < 5; i++) a().save();
  assert.strictEqual(b.logs.filter(l => /belongs to Friend/.test(l.m)).length, 1, 'one line in the log, not five');
});

t('a live save that names another account is never written anywhere and never synced', () => {
  const b = fresh(); const a = () => b.api;
  a().setS({ lv: 9, cls: 'Knight', owner: 'Friend' });
  a().save();
  assert.strictEqual(b.store.has('pg_save3_KzeR'), false, 'nothing is written to this account\'s slot');
  assert.strictEqual(b.writes.length, 0, 'nothing is written at all');
  assert.strictEqual(b.touched.n, 0, 'and nothing is offered to the cloud');
  assert.ok(b.logs.some(l => /belongs to Friend/.test(l.m)));
});

t('a save from before the stamp is written over as it always was, and then carries the stamp', () => {
  const b = fresh(); const a = () => b.api;
  b.store.set('pg_save3_KzeR', '{"lv":3}');
  a().save();
  assert.strictEqual(JSON.parse(b.store.get('pg_save3_KzeR')).owner, 'KzeR');
  assert.strictEqual(JSON.parse(b.store.get('pg_save3_KzeR')).lv, 5);
});

t('once the slot holds this account\'s save again, saving resumes', () => {
  const b = fresh(); const a = () => b.api;
  b.store.set('pg_save3_KzeR', '{"owner":"Friend","lv":60}');
  a().save();
  b.store.set('pg_save3_KzeR', '{"owner":"KzeR","lv":6}');
  a().save();
  assert.strictEqual(JSON.parse(b.store.get('pg_save3_KzeR')).lv, 5, 'the live progress is written again');
});

t('with nobody signed in, saving writes nothing', () => {
  const b = fresh(); const a = () => b.api;
  a().setUser(null);
  a().save();
  assert.strictEqual(b.writes.length, 0);
  assert.strictEqual(b.touched.n, 0);
});

// ---------------------------------------------------- the guards, in the source ----
// Each place that brings a save into this browser, or sends one out, must check the stamp first. These
// read the real source, so removing a check fails here even before a test runs the path.
const body = (start, len) => { const i = src.indexOf(start); if (i < 0) throw new Error('missing ' + start); return src.slice(i, i + len); };

t('initSession checks the stamp before it loads the save', () => {
  const b = body('function initSession(gm,newAccount=false){', 900);
  assert.ok(b.indexOf('saveRefusal(') > 0 && b.indexOf('saveRefusal(') < b.indexOf('S=load()'), 'the refusal must come before load()');
});

t('initSessionFromCloud checks the device copy before it starts a session or writes anything', () => {
  const b = body('async function initSessionFromCloud(u,gm,isNew){', 1400);
  const check = b.indexOf('saveRefusal(local,u)');
  assert.ok(check > 0, 'the device-copy check is missing');
  assert.ok(check < b.indexOf('cloudStart(u,gm)'), 'before the session starts');
  assert.ok(check < b.indexOf('lsPut(saveKeyFor(u),data.blob)'), 'and before the cloud copy is written');
  assert.ok(b.indexOf('saveRefusal(data.blob,u)') < b.indexOf('lsPut(saveKeyFor(u),data.blob)'), 'the cloud copy is checked too');
});

t('cloudAdopt refuses another account\'s copy before it is written into the slot', () => {
  const b = body('async function cloudAdopt(server,resumeOffline=false){', 500);
  assert.ok(b.indexOf('saveRefusal(server.blob,currentUser)') < b.indexOf('lsPut(saveKeyFor(currentUser),server.blob)'));
});

t('restoring a backup leaves out another account\'s save before anything is written', () => {
  const b = body('function restoreBackup(file){', 2400);
  assert.ok(b.indexOf('const elsewhere=') > 0 && b.indexOf('const elsewhere=') < b.indexOf('lsPut(k,d.keys[k])'));
});

t('every write of a save slot is one of the three checked places, so a new one must be checked too', () => {
  // save() / cloudAdopt() / initSessionFromCloud() are the only lsPut(...) calls that write a save slot;
  // restoreBackup() writes its keys through the filter checked above. Add a write site -> add its check,
  // then update this count.
  const sites = src.match(/lsPut\((?:saveKey|saveKeyFor)\(/g) || [];
  assert.strictEqual(sites.length, 3, 'found ' + sites.length + ' save-slot writes');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
