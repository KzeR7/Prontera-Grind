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
// Every id now has real art, including /x (Ecks.gif arrived later), so there is no exemption left
// and a missing or guessed layout fails here.
for (const id of R.EMOTIONS) {
  const L = R.EMOTE_LAYOUT[id];
  assert.ok(L, id + ' has a measured layout');
  assert.ok(L.w > 0 && L.h > 0 && L.s > 0 && L.s < 10, id + ' layout is sane');
  assert.ok(L.cx > 0 && L.cy > 0, id + ' is centred on its art');
}
for (const id of ADDED) assert.ok(R.EMOTE_LAYOUT[id], id + ' art is measured');
// v2 sizing: the drawn canvas must FIT the tray slot. Before this, kissheart scaled to 76 px and
// love to 51 px inside a 40 px box, so oversized art bled into the next cell and clipped.
for (const [id, L] of Object.entries(R.EMOTE_LAYOUT)) {
  assert.ok(Math.max(L.w, L.h) * L.s <= 40.01, id + ' fits the 40px tray slot, got ' + (Math.max(L.w, L.h) * L.s).toFixed(1));
  assert.ok(Math.max(L.w, L.h) * L.s >= 31, id + ' is not shrunk to a speck, got ' + (Math.max(L.w, L.h) * L.s).toFixed(1));
}
// The dice is six files behind one id; one shared entry has to frame all six identically.
assert.ok(R.EMOTE_LAYOUT.dice, 'the dice has a layout covering all six faces');

// The die visibly LANDS, and the number is the last thing on screen. dice1..dice6 tumble, land, and
// then the source GIF fades the die out to an empty bubble and loops. That exit fade is what the
// owner reported: "the ending of the dice cant be seen clearly" - the one thing /dice exists to tell
// you was erased before you could read it. The importer now cuts the fade and the last motion-blurred
// tumble frame, holds the landed face, and marks the APNG play-once, so the roll comes to rest on the
// number instead of re-tumbling forever.
{
  const fs2 = require('fs'), dir = path.join(__dirname, '..', '..', 'assets', 'social', 'emotions');
  const be32 = (b, o) => (b[o] << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]) >>> 0;
  // Decode the last APNG frame and count the transparent pixels that are ENCLOSED - reachable only
  // by crossing the bubble's outline. That is exactly what a punched-out die face looks like once it
  // sits on a dark backdrop; plain transparency is the bubble's legitimate surround. APNG frames are
  // ordinary PNG sub-images, so: inflate the final image data, undo the scanline filters, then
  // flood-fill the transparency in from the border. Whatever is left over is enclosed.
  // Measured: the lattice face had 20, the solid one 0, so this is a real regression guard.
  const zlib = require('zlib');
  const enclosedHoles = png => {
    let last = null, off = 8;
    while (off + 8 <= png.length) {
      const len = be32(png, off), type = png.toString('latin1', off + 4, off + 8);
      if (type === 'fcTL') last = { w: be32(png, off + 12), h: be32(png, off + 16), data: [] };
      else if (type === 'IDAT' && last) last.data.push(png.subarray(off + 8, off + 8 + len));
      else if (type === 'fdAT' && last) last.data.push(png.subarray(off + 12, off + 8 + len)); // skip seq no.
      off += 12 + len;
    }
    if (!last || !last.w) return -1;
    const raw = zlib.inflateSync(Buffer.concat(last.data)), { w, h } = last, stride = w * 4;
    const px = Buffer.alloc(stride * h);
    for (let y = 0, p = 0; y < h; y++) {
      const f = raw[p++], row = raw.subarray(p, p + stride); p += stride;
      const prev = y ? px.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
      const cur = px.subarray(y * stride, (y + 1) * stride);
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? cur[i - 4] : 0, b = prev[i], c = i >= 4 ? prev[i - 4] : 0;
        let v = row[i];
        if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
        else if (f === 4) {
          const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
        }
        cur[i] = v & 255;
      }
    }
    const clear = (x, y) => px[(y * w + x) * 4 + 3] < 40;
    const seen = new Uint8Array(w * h), stack = [];
    const push = (x, y) => {
      if (x >= 0 && y >= 0 && x < w && y < h && !seen[y * w + x] && clear(x, y)) { seen[y * w + x] = 1; stack.push(x, y); }
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }
    let n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (clear(x, y) && !seen[y * w + x]) n++;
    return n;
  };
  for (const face of ['dice', 'dice2', 'dice3', 'dice4', 'dice5', 'dice6']) {
    const png = fs2.readFileSync(path.join(dir, face + '.png'));
    // An APNG that froze to one frame loses its animation entirely; that is a regression, not a fix.
    assert.ok(png.length > 2000, face + ' still carries a real animation, not a single frozen frame');
    // Walk the chunk list for acTL (play count) and the fcTL durations, rather than trusting PIL.
    let plays = null, frames = 0, lastDelay = 0, total = 0;
    for (let i = 8; i + 8 <= png.length;) {
      const len = be32(png, i), type = png.toString('latin1', i + 4, i + 8);
      // acTL is num_frames then num_plays, so the play count is the second word, not the first.
      if (type === 'acTL') plays = be32(png, i + 12);
      if (type === 'fcTL') {
        frames++;
        const num = be32(png, i + 8 + 20), den = (png[i + 8 + 24] << 8 | png[i + 8 + 25]) || 1;
        const ms = Math.round(num / den * 1000);
        lastDelay = ms; total += ms;
      }
      i += 12 + len;
    }
    assert.ok(frames >= 12, face + ' keeps the tumble, got ' + frames + ' frames');
    // The roll has to actually land on something: a blank last frame is the die fading out again.
    assert.ok(fs2.statSync(path.join(dir, face + '.png')).size > 4000, face + ' keeps a full landed frame');
    // plays=1: a roll has an outcome. Looping would restart the tumble and the ending would never settle.
    assert.equal(plays, 1, face + ' plays once so the die comes to rest');
    // The landed face has to stay up long enough to read a number.
    assert.ok(lastDelay >= 1000, face + ' holds the landed face, last frame is ' + lastDelay + 'ms');
    assert.ok(total >= 2500, face + ' still shows the whole roll, got ' + total + 'ms');
    // The face must be a solid tile. The wiki rips punch the tile out, so unfilled it is a lattice
    // and on the dark plaza bubble every hole reads as a black spot (the owner's report). The landed
    // frame has to be almost fully opaque; a regression that skips the fill drops well below this.
    const punched = enclosedHoles(png);
    assert.ok(punched >= 0, face + ' last frame decodes');
    assert.equal(punched, 0, face + ' has a solid face, but ' + punched + ' see-through spots remain');
  }
}
// One shared URL rule. social.js and social-scene.js each carried their own copy of the dice's
// six-file mapping, so the face range was written twice and could drift; both now use this.
assert.equal(R.emotionURL('smile'), 'assets/social/emotions/smile.png', 'a plain emote is one file');
assert.equal(R.emotionURL('dice', 1), 'assets/social/emotions/dice.png', 'face 1 is the base file');
assert.equal(R.emotionURL('dice', 6), 'assets/social/emotions/dice6.png', 'face 6 is a suffix file');
for (const bad of [undefined, null, 0, 7, 1.5, '3']) {
  assert.equal(R.emotionURL('dice', bad), 'assets/social/emotions/dice.png',
    'a face outside 2-6 falls back to the base file, not a broken path: ' + String(bad));
}
for (const [id, cmd] of Object.entries(R.EMOTE_NAMES)) {
  assert.ok(R.EMOTIONS.includes(id), 'named id ' + id + ' exists');
  assert.equal(R.EMOTE_BY_CMD[cmd], id, '/' + cmd + ' resolves to ' + id);
}
assert.equal(R.EMOTE_BY_CMD.thx, 'ok', '/thx is the Thanks art (id ok)');
// The `gg` id's own art (the evil grin) cannot answer to /gg: that command means "good game" and
// the old plaza grin clashes with it. Owner: rename the id's command to /hz, keep /gg free.
assert.equal(R.EMOTE_BY_CMD.hz, 'gg', '/hz is the evil grin (renamed off /gg)');
assert.equal(R.EMOTE_BY_CMD.gg, undefined, '/gg is not bound to the grin any more');
assert.equal(R.EMOTE_NAMES.gg, 'hz', 'the gg id answers to hz');
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
