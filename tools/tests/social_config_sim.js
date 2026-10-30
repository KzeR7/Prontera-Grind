// Cloudflare wiring for the plaza Worker: the two wrangler.toml files must agree.
//   node tools/tests/social_config_sim.js
//
// The social service is deployed from workers/social/wrangler.toml and reached from Pages through the
// `SOCIAL` binding in the root wrangler.toml. Those two files name the same script and class, so a
// rename on one side silently breaks production chat. This test pins that agreement, and pins the
// preview settings that keep Workers Builds green on feature branches: the Worker sets
// `workers_dev = false`, and without an explicit preview setting Cloudflare defaults previews to
// match it, which made every branch push show a red "Workers Builds: prontera-social" check while
// `main` stayed green (v235).
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };

// TOML is read just deeply enough for these flat files: `key = value` lines and [table] headers.
function toml(text) {
  const out = { tables: {}, values: {} };
  let table = '';
  for (const raw of text.split('\n')) {
    const line = raw.replace(/(^|\s)#.*$/, '').trim();
    if (!line) continue;
    const header = line.match(/^\[\[?([^\]]+)\]\]?$/);
    if (header) { table = header[1].trim(); (out.tables[table] = out.tables[table] || []).push({}); continue; }
    const pair = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!pair) continue;
    const value = pair[2].trim().replace(/^"(.*)"$/, '$1').replace(/\s+#.*$/, '');
    if (table) out.tables[table].at(-1)[pair[1]] = value; else out.values[pair[1]] = value;
  }
  return out;
}

const worker = toml(read('workers/social/wrangler.toml'));
const pages = toml(read('wrangler.toml'));
const entry = read('workers/social/index.mjs');

console.log('social Worker configuration\n');

t('the Worker builds the room plus the shared social rules', () => {
  assert.equal(worker.values.name, 'prontera-social');
  assert.equal(worker.values.main, 'index.mjs');
  assert(fs.existsSync(path.join(root, 'workers/social/index.mjs')), 'main entry point exists');
  assert(fs.existsSync(path.join(root, 'workers/social/room.mjs')), 'room.mjs exists');
  assert(fs.existsSync(path.join(root, 'assets/social-rules.js')), 'shared social rules exist');
  assert(fs.existsSync(path.join(root, 'assets/social-poker.js')), 'shared Hold\'em engine exists');
});

t('the Worker exports the Durable Object class it declares', () => {
  const binding = (worker.tables['durable_objects.bindings'] || [])[0];
  assert(binding, 'a durable_objects binding is declared');
  assert.equal(binding.name, 'SOCIAL');
  assert.equal(binding.class_name, 'Social');
  assert(new RegExp('export\\s+class\\s+' + binding.class_name + '\\b').test(entry), 'index.mjs exports class ' + binding.class_name);
});

t('the SQLite Durable Object migration matches the exported class', () => {
  const migration = (worker.tables.migrations || [])[0];
  assert(migration, 'a migration is declared');
  assert(/^v\d+$/.test(migration.tag), 'migration tag is a version');
  const classes = (migration.new_sqlite_classes || '').replace(/^\[|\]$/g, '').split(',')
    .map(s => s.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);
  const binding = (worker.tables['durable_objects.bindings'] || [])[0];
  assert(classes.includes(binding.class_name), 'new_sqlite_classes names the bound class');
});

t('the Worker stays off workers.dev (no public ingress of its own)', () => {
  assert.equal(worker.values.workers_dev, 'false', 'workers_dev must stay false');
});

t('previews are enabled explicitly, so branch builds are not red (v235)', () => {
  assert.equal(worker.values.preview_urls, 'true', 'preview_urls = true is required next to workers_dev = false');
  assert(worker.tables.previews && worker.tables.previews.length, 'a [previews] block is required');
});

t('Pages binds the same script and class', () => {
  assert.equal(pages.values.pages_build_output_dir, 'dist');
  // Look the binding up by name: the table also carries the write-pause GATE binding, and its
  // position is not part of the contract.
  const bindings = pages.tables['durable_objects.bindings'] || [];
  const binding = bindings.find(b => b.name === 'SOCIAL');
  assert(binding, 'Pages declares a durable_objects binding named SOCIAL');
  assert.equal(binding.name, 'SOCIAL', 'the function reads env.SOCIAL');
  assert.equal(binding.class_name, 'Social');
  assert.equal(binding.script_name, worker.values.name, 'script_name matches the Worker name');
  assert(read('functions/api/social.js').includes('env.SOCIAL'), 'the Pages function uses env.SOCIAL');
});

t('preview builds only reach the 404 handler, not the room', () => {
  const at = entry.lastIndexOf('export default');
  assert(at > 0, 'index.mjs has a default export');
  const fallback = entry.slice(at);
  assert(fallback.includes("'Not found'"), 'the default export answers Not found');
  assert(fallback.includes('404'), 'the default export answers 404');
  assert(!fallback.includes('env.SOCIAL'), 'the default export never reaches the Durable Object');
});

console.log('\nsocial config: ' + pass + ' pass / ' + fail + ' fail');
if (fail) process.exitCode = 1;
