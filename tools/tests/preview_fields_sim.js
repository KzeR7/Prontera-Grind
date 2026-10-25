// The preview server must serve the NEW outdoor fields.
//
// Why this exists: the game ships them opt-in (`NATIVE_FIELDS_DEFAULT=false`, a recorded owner
// decision), so the plain game URL shows the classic kit maps - correct for players, wrong for
// the review preview. The owner opened the preview to look at the new fields and reported
// "game preview is not showing your proposed maps. still the old map". The server now flips that
// one constant while it serves the game; this guards the flip and the escape hatch.
//
//   node tools/tests/preview_fields_sim.js
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const repo = path.resolve(__dirname, '../..');
const out = execFileSync('python3', ['-c', `
import sys, importlib.util
spec = importlib.util.spec_from_file_location('pv', 'tools/preview_server.py')
pv = importlib.util.module_from_spec(spec); spec.loader.exec_module(pv)
ship = pv._SHIPPING_FIELD_FLAG
page = b'<script>' + ship + b'</script>'
def served(query, rel='index.html', body=page):
    return pv._preview_html(rel, body, query)

# 1. the live preview link (no query string) gets the NEW fields
assert b'NATIVE_FIELDS_DEFAULT=true' in served(''), 'plain preview URL must enable the new fields'
# 2. the escape hatch still gives the classic maps
assert b'NATIVE_FIELDS_DEFAULT=false' in served('nativeFields=0'), '?nativeFields=0 must stay classic'
# 3. an explicit request for the new fields is honoured either way
assert b'NATIVE_FIELDS_DEFAULT=true' in served('nativeFields=1'), '?nativeFields=1 must enable'
# 4. every other served page is untouched - this is a game-only default
assert served('', 'tools/maps/terrain_v2_preview.html', b'<p>NATIVE_FIELDS_DEFAULT=false</p>') == b'<p>NATIVE_FIELDS_DEFAULT=false</p>', 'other pages must not be rewritten'
# 5. if the game stops shipping that exact line the server says so instead of silently no-op'ing
import io, contextlib
err = io.StringIO()
with contextlib.redirect_stderr(err):
    same = served('', 'index.html', b'<p>no flag here</p>')
assert same == b'<p>no flag here</p>' and 'WARNING' in err.getvalue(), 'a missing flag must warn, not silently pass'
print('ok')
`], { cwd: repo, encoding: 'utf8' });

assert.ok(out.includes('ok'), 'python harness ran');
console.log('preview fields: the preview serves the new fields, ?nativeFields=0 keeps the classic maps, other pages untouched, a missing flag warns');
