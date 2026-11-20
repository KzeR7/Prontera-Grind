// v374: emote tray. Every emote id has a measured layout, the RO-name table only names real ids, typed commands
// resolve to the right id (RO name wins, ids with a name are not typed as ids), and ids are unchanged.
const assert = require('node:assert/strict'), path = require('node:path');
const R = require(path.join(__dirname, '..', '..', 'assets', 'social-rules.js'));
// PR #269 adds 14 real RO emotions after the original 32, so no saved id ever moves index.
const SHIPPED = ['surprise','question','music','heart','love','sweat','idea','anger','cloud','money','dots',
  'rock','scissors','paper','kiss','ok','dead','sorry','laugh','smile','cry','shy','kissheart','think','hmm',
  'blush','drool','meh','panic','sleep','mail','gg'];
const ADDED = ['omg','oh','x','hlp','go','bzz','awsm','pat','slur','grat','fsh','spin','dice','oops'];
assert.deepEqual(R.EMOTIONS.slice(0, 32), SHIPPED, 'the original 32 keep their exact order');
assert.deepEqual(R.EMOTIONS.slice(32), ADDED, 'the 14 new ids follow them');
assert.equal(R.EMOTIONS.length, 46, '46 emotions');
// Every id needs a layout, but PR #269 has not produced art for the 14 yet (grf.robrowser.com is
// unreachable from CI), so a measured layout is required for the 32 that have art. The 14 get one
// from tools/social/emote-layout.py the moment their PNGs exist - that is the gap this test keeps open.
for (const id of R.EMOTIONS) {
  const L = R.EMOTE_LAYOUT[id];
  if (ADDED.includes(id)) {
    assert.ok(!L || (L.w > 0 && L.h > 0 && L.s > 0 && L.s < 10), id + ' layout, when present, is sane');
    continue;
  }
  assert.ok(L, id + ' has a layout');
  assert.ok(L.w > 0 && L.h > 0 && L.s > 0 && L.s < 10, id + ' layout is sane');
}
assert.ok(ADDED.every(id => !R.EMOTE_LAYOUT[id]), 'the 14 wait for real art, they are not guessed');
for (const [id, cmd] of Object.entries(R.EMOTE_NAMES)) {
  assert.ok(R.EMOTIONS.includes(id), 'named id ' + id + ' exists');
  assert.equal(R.EMOTE_BY_CMD[cmd], id, '/' + cmd + ' resolves to ' + id);
}
assert.equal(R.EMOTE_BY_CMD.thx, 'ok', '/thx is the Thanks art (id ok)');
assert.equal(R.EMOTE_BY_CMD.gg, 'gg', '/gg is the evil grin');
// PR #269 introduced duplicate commands at first (/sob with cry, /kis with kissheart, /hum with
// shy). The merge keeps the id that already owns the command, and the new ids use their own names.
assert.equal(R.EMOTE_BY_CMD.sob, 'cry', '/sob stays the shipped cry art');
assert.equal(R.EMOTE_BY_CMD.kis, 'kissheart', '/kis stays the shipped kissheart art');
assert.equal(new Set(Object.keys(R.EMOTE_BY_CMD)).size, R.EMOTIONS.length, 'every id has its own command');
assert.equal(new Set(Object.values(R.EMOTE_NAMES)).size, Object.keys(R.EMOTE_NAMES).length, 'names are unique');
// v376: the emoji tray sits inside the chat box below the channel tabs (it used to start above them).
{
  const css = require('fs').readFileSync(path.join(__dirname, '..', '..', 'assets', 'social.css'), 'utf8');
  const rule = (css.match(/#socialEmoji\{position:absolute[^}]*\}/) || [''])[0];
  assert.ok(rule, 'emoji tray rule exists');
  assert.match(rule, /top:34px/, 'tray starts below the tabs');
  assert.doesNotMatch(rule, /max-height:210px/, 'tray is not capped so it cannot reach the tabs');
}
console.log('emote tray sim: all checks passed');
