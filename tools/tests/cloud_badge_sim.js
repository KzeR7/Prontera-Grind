// v282: the cloud badge must tell the truth at a glance.
//   node tools/tests/cloud_badge_sim.js
//
// The owner's report: "☁ … always shows on my screen while playing. rarely ☁ ✓."
//
// It was accurate but useless. `cloudTouch()` runs on every save, which happens many times a second,
// and it painted "waiting to sync" each time. The next push only SENDS if 60 seconds have gone by, so
// for 59 seconds out of every minute the badge said "waiting" about work that was going to be perfectly
// safe, and the real question - "is what I have played in the last minute on the server?" - could not be
// answered from it. The tick appeared for a moment after each push and was wiped by the next touch.
//
// The rule now: the badge shows the LAST COMPLETED PUSH. While the server is up to date it reads
// "☁ ✓ Saved 14:32". Touch alone never changes it; only a failed or skipped push does.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
};
console.log('cloud badge: it says when the save last reached the server\n');

const touch = (src.match(/^function cloudTouch\(\)\{.*$/m) || [''])[0];
const push = src.slice(src.indexOf('async function cloudPush('), src.indexOf('// The session cookie is shared'));

t('the badge only ever reports a push that has actually happened', () => {
  assert.ok(touch, 'cloudTouch() is still there');
  assert.ok(!/cloudBadge\(/.test(touch),
    'touching the save no longer paints the badge - a touch is not a sync, and painting it every frame is what buried the truth');
});

t('a finished push is what writes the badge, with the time it landed', () => {
  assert.ok(/function cloudBadgeSaved\(/.test(src), 'there is one place that describes a completed push');
  // Everything from the time formatter down to the next badge state: the two helpers share one.
  const fn = src.slice(src.indexOf('const clockHHMM='), src.indexOf('function cloudBadgeStale(') + 400);
  assert.ok(/clockHHMM/.test(fn), 'it formats a clock time');
  assert.ok(/getHours\(\)/.test(fn) && /getMinutes\(\)/.test(fn), 'by hand, in 24 hours, so a locale cannot widen it');
  assert.ok(!/toLocaleTimeString/.test(fn), 'a locale-written "04:33 PM" would not fit the badge');
  assert.ok(/☁ ✓ '.\+hhmm|☁ ✓ '\+hhmm|'☁ ✓ '/.test(fn), 'the tick and the time go out together');
  assert.ok(/☁ ✓/.test(fn), 'and the tick');
});

t('a stale save is still called out, but only when it is actually stale', () => {
  assert.ok(/cloudBadgeStale\(/.test(src), 'there is a "this is not on the server yet" state');
  const fn = src.slice(src.indexOf('function cloudBadgeStale('), src.indexOf('function cloudBadgeStale(') + 700);
  assert.ok(/☁ …/.test(fn), 'it uses the same glyph the player already knows');
});

t('the successful-push path paints the time, not a generic state', () => {
  assert.ok(/cloudBadgeSaved\(/.test(push), 'cloudPush() calls it after a 200');
  const line = (push.match(/.*cloudBadgeSaved\(.*/) || [''])[0];
  assert.ok(line.length > 0, 'the call is present in the success branch');
  assert.ok(push.indexOf('CLOUD.lastPush=Date.now()') < push.indexOf('cloudBadgeSaved('),
    'and only after lastPush moves, so the time shown is the time of that push');
});

t('every failure state still overrides it - offline must never look like saved', () => {
  for (const [glyph, what] of [['☁ ✕', 'offline'], ['☁ ⛔', 'refused'], ['☁ ⏸', 'maintenance'], ['☁ ⚠', 'conflict']]) {
    assert.ok(src.includes(glyph), 'the ' + what + ' state (' + glyph + ') is still painted somewhere');
  }
});

t('the badge is wide enough to be read on a phone', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'assets/ui/eclipse.css'), 'utf8');
  // It used to be clipped to 18px, which is narrower than "✓ 14:32" - the time could never have shown.
  const narrow = css.match(/#cloudBadge\{[^}]*max-width:18px[^}]*\}/);
  assert.strictEqual(narrow, null, 'the 18px clip that made a timestamp impossible is gone');
  assert.ok(/#cloudBadge\{[^}]*max-width:\s*(?:none|1[0-9]{2}px|2[0-9]{2}px)/.test(css),
    'and it is given room for the glyph plus a clock time');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
