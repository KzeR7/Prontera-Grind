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
// Every id needs a layout. The 14 PR #269 ids used to be exempt because no art could be produced in
// CI; they now carry art converted from the authentic iRO Wiki GIFs by
// tools/social/import-emote-gifs.py, measured by tools/social/emote-layout.py - so the exemption is
// gone and a guessed or missing layout fails here.
// `x` is the one id whose source GIF was never supplied, so it has no file and no layout: it draws
// as the dashed /x fallback. Every other id has real art and must have a measured layout.
const NO_ART = ['x'];
for (const id of R.EMOTIONS) {
  const L = R.EMOTE_LAYOUT[id];
  if (NO_ART.includes(id)) {
    assert.equal(L, undefined, id + ' has no art, so it must not carry a guessed layout');
    continue;
  }
  assert.ok(L, id + ' has a measured layout');
  assert.ok(L.w > 0 && L.h > 0 && L.s > 0 && L.s < 10, id + ' layout is sane');
  assert.ok(L.cx > 0 && L.cy > 0, id + ' is centred on its art');
}
for (const id of ADDED) assert.equal(!R.EMOTE_LAYOUT[id], id === 'x', id + ' art is measured, except /x which has no source');
// The dice is six files behind one id; one shared entry has to frame all six identically.
assert.ok(R.EMOTE_LAYOUT.dice, 'the dice has a layout covering all six faces');
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
