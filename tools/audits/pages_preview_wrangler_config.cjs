// Local-only check of Wrangler's resolved Pages environment config. No network or deploy.
// PG_WRANGLER_MODULE may point at an installed Wrangler package directory.
const assert = require('node:assert/strict');
const path = require('node:path');
const wrangler = require(process.env.PG_WRANGLER_MODULE || 'wrangler');
const config = path.resolve(__dirname, '../../wrangler.toml');
const read = env => wrangler.unstable_readConfig({ config, env });
const top = read(undefined), prod = read('production'), preview = read('preview');
assert.deepEqual(prod.d1_databases, top.d1_databases, 'production D1 must retain top-level config');
assert.deepEqual(prod.durable_objects, top.durable_objects, 'production social must retain top-level config');
assert.deepEqual(preview.d1_databases, [], 'preview must have no D1');
assert.deepEqual(preview.durable_objects.bindings, [], 'preview must have no Durable Object');
for (const field of ['services', 'kv_namespaces', 'r2_buckets', 'hyperdrive', 'vectorize', 'analytics_engine_datasets']) {
  assert.ok(!preview[field] || preview[field].length === 0, `preview ${field} must be empty`);
}
assert.deepEqual(preview.vars, {}, 'preview must have no vars');
console.log('PASS: Wrangler resolves unchanged production bindings and no preview resource bindings');
console.log('Local config resolution only: deployed Pages bindings and old previews are not verified.');
