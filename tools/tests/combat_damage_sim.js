// Incoming damage and attack speed: the v86 retune (owner playtest reports).
//   node tools/tests/combat_damage_sim.js
//
//   * a decked Lv150 character took effectively zero damage on the deepest maps: 60% of every
//     swing auto-missed (flee cap 60), and the hits that landed lost 75% to the DEF cut (endgame
//     gear sits at the cap). Flee is capped at 30 and the cut at 60 now;
//   * mob/MVP ATK gets one endgame bump (eaOf: power 90+ fields swing 1.4x harder) - player HP
//     and DEF grew far faster than the flat (5+l*4.6) ATK formula;
//   * ASPD is RO-flavoured again: the AGI reduction climbs to 68% (AGI 99 -> 120 is ~25% faster,
//     where the old .5 cap saturated at AGI 83 and maxing AGI gave nothing), the attack floor is
//     .13s (~7.7 hits/s), the drawn swing can keep up (.14s minimum animation), and the character
//     sheet prints the RO-style ASPD number (RO delay = 5/(ASPD-144) seconds).
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const pick = (re, name) => { const m = src.match(re); if (!m) throw new Error('cannot find ' + name); return m; };

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('combat damage: the v86 incoming-damage and ASPD rules\n');

t('flee is capped at 30%, not 60% - bosses must land most of their swings', () => {
  const line = pick(/const crit=\(\)=>\{[\s\S]*?missCh=\(\)=>Math\.max\(0,15-st\('dex'\)\*\.25\);/, 'crit/flee line')[0];
  assert.ok(line.includes("flee=()=>Math.min(30,st('agi')*.5+S.lv*.1+pv('flee')"), 'flee cap 30');
  assert.ok(!line.includes("Math.min(60,st('agi')"), 'the old 60% flee cap is gone');   // crit's own soft cap may stay
  const agi = 99, lv = 150;
  const flee = Math.min(30, agi * .5 + lv * .1);
  assert.strictEqual(flee, 30, 'an endgame AGI build sits at the new cap (was 60)');
});

t('the DEF cut caps at 60% - landed hits must carry real weight', () => {
  assert.ok(src.includes('cut=Math.min(.6,md/(md+4000))'), 'the live cut line');
  assert.ok(!src.includes('Math.min(.75,md/(md+4000))'), 'the old 75% cap is gone');
  const cut = Math.min(.6, 12000 / (12000 + 4000));
  assert.strictEqual(cut, .6, 'endgame gear (~12k DEF) sits at the new cap');
});

t('the endgame ATK bump: power 90+ fields swing 1.4x, wired into both spawn sites', () => {
  assert.ok(src.includes('const eaOf=l=>(l|0)>=90?1.4:1;'), 'the eaOf helper');
  assert.ok(src.includes('atk:early?starterAtk(S.lvl):Math.floor((5+l*4.6)*mb*na*eaOf(l))'), 'mob ATK x eaOf');
  assert.ok(src.includes('atk:Math.floor((8+l*6.5)*mb*na*eaOf(l))'), 'MVP ATK x eaOf');
  const eaOf = l => (l | 0) >= 90 ? 1.4 : 1;   // mirrored; the source pins above hold the real one
  assert.strictEqual(eaOf(89), 1, 'Payon Stage 10 (pw 50) and everything below power 90 is untouched');
  assert.strictEqual(eaOf(90), 1.4, 'the bump starts at power 90 (Niflheim)');
  assert.strictEqual(eaOf(99), 1.4, 'Abyss Stage 10');
  assert.strictEqual(eaOf(175), 1.4, 'every Nightmare stage is above the threshold by construction');
});

t('worked example: a Nightmare Abyss mob lands 2,431-3,647 through the new caps (old caps: 1,085-1,628)', () => {
  // mirror of spawn() + the incoming-damage line, using the live thresholds
  const mb = 1 + 9 * .15 + Math.max(0, 9 - 4) * .2;
  const atk = Math.floor((5 + 175 * 4.6) * mb * 2 * 1.4);          // NMATK 2, eaOf 1.4
  const cut = Math.min(.6, 12000 / (12000 + 4000));
  const lo = Math.round(atk * .8 * (1 - cut)), hi = Math.round(atk * 1.2 * (1 - cut));
  assert.strictEqual(atk, 7597, 'the raw swing (floor order: (5+l*4.6)*mb*NMATK*eaOf)');
  assert.deepStrictEqual([lo, hi], [2431, 3647], 'the landed hit through a 60% DEF cut');
  // expected per swing at the 30% flee cap: ~70% of swings land
  const expected = atk * (1 - cut) * .7;
  assert.ok(expected > 2100 && expected < 2200, 'expected damage per mob swing ~' + Math.round(expected) + ' (the old caps paid ~543)');
});

t('ASPD: AGI caps at a 68% reduction (.0058/point) and the floor is .13s', () => {
  assert.ok(src.includes("Math.max(.13,.85*C().aspd*(1-Math.min(.68,st('agi')*.0058))"), 'the live formula shape');
  const aspd = (cls, agi, pct = 0) => Math.max(.13, .85 * cls * (1 - Math.min(.68, agi * .0058)) / (1 + pct / 100));
  assert.ok(aspd(.72, 120) < aspd(.72, 99) * .8, 'AGI 120 is meaningfully faster than AGI 99 (~25% shorter interval)');
  assert.strictEqual(aspd(.72, 99).toFixed(4), (.85 * .72 * (1 - .5742)).toFixed(4), 'AGI 99 cuts 57.4%');
  assert.ok(aspd(.72, 99) > .25 && aspd(.72, 99) < .27, 'a Lord Knight at AGI 99 swings every ~.26s (3.8/s)');
  assert.strictEqual(aspd(.5, 120, 60), .13, 'a maxed Assassin Cross with gear ASPD% rides the floor (~7.7/s)');
  assert.ok(aspd(1, 9) > .75, 'a fresh Novice stays slow (~1.2/s) - the buff is AGI-gated, not global');
});

t('the drawn swing keeps up: minimum animation .14s, and the sheet shows the RO-style ASPD number', () => {
  assert.ok(src.includes('const SWING_MIN_T=.14,SWING_MAX_T=.55;'), 'the animation clamp follows the new floor');
  assert.ok(src.includes('Math.min(193,Math.round(144+5/'), 'RO ASPD = 144 + 5/interval, capped at the RO ceiling 193');
  const roAspd = d => Math.min(193, Math.round(144 + 5 / d));
  assert.strictEqual(roAspd(.425), 156, 'a Novice-paced swing reads ~156');
  assert.strictEqual(roAspd(.13), 182, 'the machine-gun floor reads 182');
});

console.log(`\ncombat damage: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
