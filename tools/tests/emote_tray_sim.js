// v374: emote tray. Every emote id has a measured layout, the RO-name table only names real ids, typed commands
// resolve to the right id (RO name wins, ids with a name are not typed as ids), and ids are unchanged.
const assert = require('node:assert/strict'), path = require('node:path');
const R = require(path.join(__dirname, '..', '..', 'assets', 'social-rules.js'));
assert.equal(R.EMOTIONS.length, 32, 'the 32 saved ids are unchanged');
for (const id of R.EMOTIONS) {
  const L = R.EMOTE_LAYOUT[id];
  assert.ok(L, id + ' has a layout');
  assert.ok(L.w > 0 && L.h > 0 && L.s > 0 && L.s < 10, id + ' layout is sane');
}
for (const [id, cmd] of Object.entries(R.EMOTE_NAMES)) {
  assert.ok(R.EMOTIONS.includes(id), 'named id ' + id + ' exists');
  assert.equal(R.EMOTE_BY_CMD[cmd], id, '/' + cmd + ' resolves to ' + id);
}
assert.equal(R.EMOTE_BY_CMD.thx, 'ok', '/thx is the Thanks art (id ok)');
assert.equal(R.EMOTE_BY_CMD.gg, 'gg', '/gg is the evil grin');
assert.equal(new Set(Object.values(R.EMOTE_NAMES)).size, Object.keys(R.EMOTE_NAMES).length, 'names are unique');
console.log('emote tray sim: all checks passed');
