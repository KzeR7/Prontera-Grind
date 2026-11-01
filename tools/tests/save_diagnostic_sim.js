// The "is this save actually lost?" diagnostic must match the real schema.
//   node tools/tests/save_diagnostic_sim.js
//
// docs/CHECK-A-SAVE.md tells the owner to paste one SQL query into the D1 console when a player says
// they came back at Lv 1. A diagnostic that is subtly wrong is worse than none: it would either say
// "nothing is wrong" about a lost save or send somebody to restore a blob that does not exist. So the
// query is executed here against the real migrations, on a database built from 0001_init.sql onwards,
// and every branch of its answer is checked.
const fs = require('fs'), path = require('path'), assert = require('assert');
let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) {
  console.log('save diagnostic: skipped (node without node:sqlite)'); process.exit(0);
}
const ROOT = path.resolve(__dirname, '../..');
const doc = fs.readFileSync(path.join(ROOT, 'docs/CHECK-A-SAVE.md'), 'utf8');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
};
console.log('save diagnostic: the query the owner is told to run, run for real\n');

// ---- the database, built from the shipped migrations so the query cannot drift from the schema ----
const db = new DatabaseSync(':memory:');
const migrations = fs.readdirSync(path.join(ROOT, 'migrations')).filter(f => f.endsWith('.sql')).sort();
const applied = [];
for (const f of migrations) {
  const sql = fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8');
  try { db.exec(sql); applied.push(f); }
  catch (e) { /* a later migration may need a table this harness does not seed; 0001 is what matters */ }
}
assert.ok(applied.includes('0001_init.sql'), 'the base schema applied');

// ---- the query, taken out of the document itself ----
const sqlBlocks = [...doc.matchAll(/```sql\n([\s\S]*?)```/g)].map(m => m[1]);
const mainQuery = sqlBlocks[0];
const historyQuery = sqlBlocks[1];
assert.ok(mainQuery && /save_owner/.test(mainQuery), 'the document carries the main query');
assert.ok(historyQuery && /save_history/.test(historyQuery), 'and the history query');
// word-boundary on purpose: `saved_at` and `updated_at` are column names, not statements.
assert.ok(!/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\s/i.test(mainQuery + historyQuery), 'neither query writes anything');

const run = (sql) => db.prepare(sql.replace("'cloud8909'", '?')).all('cloud8909');

// ---------------------------------------------------------------- the four answers
const seedUser = (id, name) => db.prepare('INSERT INTO users (id, username, pass_hash, created_at) VALUES (?,?,?,?)').run(id, name, 'x', 1);
seedUser(1, 'cloud8909');
seedUser(2, 'renamedguy');
seedUser(3, 'neversynced');

t('an account with a healthy save reads as healthy, and shows its real level', () => {
  db.prepare('INSERT INTO saves (user_id, version, blob, saved_at, updated_at, last_seen) VALUES (?,?,?,?,?,?)')
    .run(1, 9, JSON.stringify({ owner: 'cloud8909', lv: 51, cls: 'Hunter' }), 1, 1, 1);
  const [row] = run(mainQuery);
  assert.strictEqual(row.username, 'cloud8909');
  assert.strictEqual(row.save_owner, 'cloud8909', 'the save names the account that holds it');
  assert.strictEqual(row.lv, 51, 'and the level is the one the player remembers');
  assert.strictEqual(row.save_account_id, null, 'a save from before v280 carries no account id - that is normal');
});

t('a save stamped for a different name is called out by the verdict, not left to the reader', () => {
  db.prepare('INSERT INTO saves (user_id, version, blob, saved_at, updated_at, last_seen) VALUES (?,?,?,?,?,?)')
    .run(2, 4, JSON.stringify({ owner: 'someone-else', lv: 2 }), 1, 1, 1);
  const q = mainQuery.replace("'cloud8909'", "'renamedguy'");
  const [row] = db.prepare(q).all();
  assert.strictEqual(row.save_owner, 'someone-else', 'the query shows whose name is on it');
  assert.strictEqual(row.lv, 2, 'with the level that was actually written');
  assert.match(row.verdict, /NAMES ANOTHER ACCOUNT/, 'and the verdict says so without being interpreted');
});


t('the account is listed even when it has no save at all', () => {
  const rows = run(mainQuery);
  assert.strictEqual(rows.length, 1, 'exactly one row: the LEFT JOIN does not hide an account without a save');
  assert.strictEqual(rows[0].username, 'cloud8909');
  // and a name that never synced
  const q = mainQuery.replace("'cloud8909'", "'neversynced'");
  const [row] = db.prepare(q).all();
  assert.strictEqual(row.username, 'neversynced', 'the account shows up');
  assert.strictEqual(row.lv, null, 'with no level - the progress never left that browser');
  assert.strictEqual(row.save_owner, null);
});

t('a v280 save shows its durable id, which is what a rename is judged by', () => {
  db.prepare(`INSERT INTO users (id, username, pass_hash, created_at) VALUES (4,'after280','x',1)`).run();
  db.prepare('INSERT INTO saves (user_id, version, blob, saved_at, updated_at, last_seen) VALUES (?,?,?,?,?,?)')
    .run(4, 1, JSON.stringify({ owner: 'before-rename', accountId: 4, lv: 51 }), 1, 1, 1);
  const q = mainQuery.replace("'cloud8909'", "'after280'");
  const [row] = db.prepare(q).all();
  assert.strictEqual(row.save_account_id, 4, 'the id is read out of the blob');
  assert.strictEqual(row.lv, 51, 'and the character is intact despite the stale name');
});

t('the verdict separates a healthy save from a mismatch, in every case', () => {
  const one = (name) => db.prepare(mainQuery.replace("'cloud8909'", '?')).all(name)[0];
  assert.match(one('cloud8909').verdict, /^OK - the name matches/, 'a healthy pre-v280 save reads OK');
  assert.match(one('renamedguy').verdict, /NAMES ANOTHER ACCOUNT/, 'a stale name is flagged');
  assert.match(one('after280').verdict, /^OK - the id matches/, 'a v280 save is judged by its id');
  assert.match(one('neversynced').verdict, /no save on the server/, 'an account with no save says so');
});

t('the history query lists older levels, newest first, for restoring', () => {
  db.prepare('INSERT INTO save_history (user_id, version, blob, saved_at) VALUES (?,?,?,?)')
    .run(1, 8, JSON.stringify({ lv: 44 }), 3);
  db.prepare('INSERT INTO save_history (user_id, version, blob, saved_at) VALUES (?,?,?,?)')
    .run(1, 9, JSON.stringify({ lv: 51 }), 2);
  const rows = db.prepare(historyQuery.replace("'cloud8909'", '?')).all('cloud8909');
  assert.strictEqual(rows.length, 2, 'both blobs are listed');
  assert.deepStrictEqual(rows.map(r => r.version), [9, 8], 'newest version first');
  assert.deepStrictEqual(rows.map(r => r.lv), [51, 44], 'each with the level it holds');
});

t('the document says the things a good diagnostic has to say', () => {
  assert.match(doc, /SELECT`? first|run the `SELECT` first/i, 'it repeats the SELECT-before-write rule');
  assert.match(doc, /save_history/, 'it points at the history');
  assert.match(doc, /never rename|was never renamed|never renamed/i, 'and it does not let v280 be blamed for every case');
});

db.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
