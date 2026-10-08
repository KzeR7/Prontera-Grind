// Incoming damage and attack speed: the v86/v87 retune (owner playtest reports).
//   node tools/tests/combat_damage_sim.js
//
//   * v86 story: a decked Lv150 character took effectively zero damage on the deepest maps - 60% of
//     every swing auto-missed (flee cap 60) and the hits that landed lost 75% to the DEF cut. v86
//     fixed it by nerfing the character (flee cap 30, cut cap 60);
//   * v87 (owner: "buff the mobs & bosses instead"): those character caps are REVERTED and the
//     monsters carry the buff on their own stat line - mhOf (monster HIT rating, subtracted from
//     the player's dodge at the swing) and prOf (armor pierce, thinning DEF before the def/(def+4000)
//     cut), both ramping from field power 60, both scaling with the attacker, bosses stronger;
//   * eaOf (v86, kept): power 90+ fields also swing 1.4x harder - player HP/DEF grew far faster
//     than the flat (5+l*4.6) ATK formula;
//   * ASPD is RO-flavoured (v86): the AGI reduction climbs to 68%, the attack floor is .13s
//     (~7.7 hits/s), and the sheet prints the RO-style ASPD number;
//   * a wiped field restocks inside 8s (v87: worst camp wait 7s).
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const pick = (re, name) => { const m = src.match(re); if (!m) throw new Error('cannot find ' + name); return m; };

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('combat damage: the v87 mob-side incoming-damage rules and ASPD\n');

t('the character is un-nerfed: flee cap is back to 60% - monsters carry HIT instead', () => {
  const line = pick(/const crit=\(\)=>\{[\s\S]*?missCh=\(\)=>Math\.max\(0,15-st\('dex'\)\*\.25\);/, 'crit/flee line')[0];
  assert.ok(line.includes("flee=()=>Math.min(60,st('agi')*.5+S.lv*.1+pv('flee')"), 'flee cap 60 (the v85 shape)');
  assert.ok(!line.includes("Math.min(30,st('agi')"), 'the v86 30% flee cap is gone');
  const agi = 99, lv = 150;
  assert.strictEqual(Math.min(60, agi * .5 + lv * .1), 60, 'an endgame AGI build keeps its full 60% (v86 read 30)');
  // the monster side: the swing roll subtracts the monster HIT rating, with a 5% dodge floor
  assert.ok(src.includes('if(Math.random()*100<Math.max(5,flee()-mhOf(m)))addFloat'), 'the live dodge roll carries mhOf');
  assert.ok(!src.includes('Math.random()*100<flee())addFloat'), 'the old bare flee roll is gone');
  assert.strictEqual(Math.max(5, 60 - 30), 30, 'an endgame mob (HIT +30) connects 70% against a capped dodger');
  assert.strictEqual(Math.max(5, 60 - 40), 20, 'an endgame boss (HIT +40) connects 80%');
  assert.strictEqual(Math.max(5, 60 - 100), 5, 'the roll keeps a 5% dodge floor - nothing ever hits 100%');
});

t('the character is un-nerfed: DEF cut cap is back to 75% - monsters pierce armor instead', () => {
  assert.ok(src.includes('const raw=m.mag?mdef():def(),md=raw*(1-prOf(m)),cut=Math.min(.75,md/(md+4000));'), 'the live cut line: pierce first, then the 75% cap');
  assert.ok(!src.includes('cut=Math.min(.6,md/(md+4000))'), 'the v86 60% cap is gone');
  const prOf = m => Math.min(.6, Math.max(0, ((m.lvl | 0) - 60) * .02)) + (m.boss ? .1 : 0);   // mirror
  const cutVs = (def, m) => Math.min(.75, def * (1 - prOf(m)) / (def * (1 - prOf(m)) + 4000));
  assert.strictEqual(cutVs(12000, { lvl: 175, boss: false }).toFixed(4), (.4 * 12000 / (4800 + 4000)).toFixed(4),
    'an endgame mob pierces 60%: 12k DEF cuts like 4.8k (56% cut, not the old 75%)');
  assert.strictEqual(cutVs(20000, { lvl: 175, boss: false }).toFixed(4), (.4 * 20000 / 12000).toFixed(4),
    'tanks: 20k DEF cuts like 8k - stacking armor past the old 12k plateau works again');
  assert.strictEqual(cutVs(6000, { lvl: 40, boss: false }).toFixed(4), (6000 / 10000).toFixed(4),
    'below power 60 there is no pierce - the early/mid game is byte-identical to v85');
});

t('the monster stat line: mhOf ramps +1.25/point from power 60 (bosses x4/3), prOf +.02/point (bosses +.1)', () => {
  assert.ok(src.includes('const eaOf=l=>(l|0)>=90?1.4:1;'), 'the eaOf helper (v86, kept)');
  assert.ok(src.includes('atk:early?starterAtk(S.lvl):Math.floor((5+l*4.6)*mb*na*eaOf(l))'), 'mob ATK x eaOf');
  assert.ok(src.includes('atk:Math.floor((8+l*6.5)*mb*na*eaOf(l))'), 'MVP ATK x eaOf');
  assert.ok(src.includes('const mhOf=m=>Math.min(30,Math.max(0,((m.lvl|0)-60)*1.25))*(m.boss?4/3:1);'), 'the mhOf helper');
  assert.ok(src.includes('const prOf=m=>Math.min(.6,Math.max(0,((m.lvl|0)-60)*.02))+(m.boss?.1:0);'), 'the prOf helper');
  const mhOf = m => Math.min(30, Math.max(0, ((m.lvl | 0) - 60) * 1.25)) * (m.boss ? 4 / 3 : 1);
  const prOf = m => Math.min(.6, Math.max(0, ((m.lvl | 0) - 60) * .02)) + (m.boss ? .1 : 0);
  assert.strictEqual(mhOf({ lvl: 50, boss: false }), 0, 'Payon and everything below power 60: no HIT bump');
  assert.strictEqual(prOf({ lvl: 59, boss: false }), 0, '...and no pierce');
  assert.strictEqual(mhOf({ lvl: 61, boss: false }), 1.25, 'the ramp starts at power 60');
  assert.strictEqual(mhOf({ lvl: 84, boss: false }), 30, 'the HIT cap lands at power 84');
  assert.strictEqual(mhOf({ lvl: 175, boss: true }), 40, 'a Nightmare MVP hits +40 (x4/3)');
  assert.strictEqual(prOf({ lvl: 175, boss: false }), .6, 'endgame mobs pierce 60%');
  assert.strictEqual(prOf({ lvl: 175, boss: true }), .7, 'endgame MVPs pierce 70%');
  assert.strictEqual(mhOf({ lvl: 5, boss: false }), 0, 'a stale mob without a level reads as power 0 - v85 behaviour');
});

t('the endgame ATK bump: power 90+ fields swing 1.4x, wired into both spawn sites', () => {
  const eaOf = l => (l | 0) >= 90 ? 1.4 : 1;   // mirrored; the source pins above hold the real one
  assert.strictEqual(eaOf(89), 1, 'Payon Stage 10 (pw 50) and everything below power 90 is untouched');
  assert.strictEqual(eaOf(90), 1.4, 'the bump starts at power 90 (Niflheim)');
  assert.strictEqual(eaOf(99), 1.4, 'Abyss Stage 10');
  assert.strictEqual(eaOf(175), 1.4, 'every Nightmare stage is above the threshold by construction');
});

t('worked example: a Nightmare Abyss mob lands 2,763-4,144 through mob HIT + pierce (v86 caps: 2,431-3,647)', () => {
  // mirror of spawn() + the incoming-damage lines, using the live thresholds
  const mb = 1 + 9 * .15 + Math.max(0, 9 - 4) * .2;
  const atk = Math.floor((5 + 175 * 4.6) * mb * 2 * 1.4);          // NMATK 2, eaOf 1.4
  const dodge = 60 - Math.min(30, (175 - 60) * 1.25);              // dodge 60 capped, mob HIT 30 -> 30% dodge
  const hit = 1 - dodge / 100;                                     // -> 70% of swings connect
  const def = 12000 * (1 - .6);                                    // 60% pierce
  const cut = Math.min(.75, def / (def + 4000));
  const lo = Math.round(atk * .8 * (1 - cut)), hi = Math.round(atk * 1.2 * (1 - cut));
  assert.strictEqual(atk, 7597, 'the raw swing (floor order: (5+l*4.6)*mb*NMATK*eaOf)');
  assert.deepStrictEqual([lo, hi], [2763, 4144], 'the landed hit through a 54.5% cut');
  const expected = atk * (1 - cut) * hit;
  assert.ok(expected > 2380 && expected < 2460, 'expected damage per mob swing ~' + Math.round(expected) +
    ' (v86 caps paid ~2,127, v85 caps ~760)');
});

t('worked example: the Nightmare Abyss MVP lands 4,524-6,786 (v86 caps: ~3,000 typical)', () => {
  const mb = 1 + 9 * .15 + Math.max(0, 9 - 4) * .2;
  const atk = Math.floor((8 + 175 * 6.5) * mb * 2 * 1.4);          // the (8+l*6.5) MVP line
  const dodge = 60 - Math.min(30, (175 - 60) * 1.25) * 4 / 3;      // boss HIT +40 -> 20% dodge
  const hit = 1 - dodge / 100;                                     // -> 80% of swings connect
  const def = 12000 * (1 - .7);                                    // boss pierce 70%
  const cut = Math.min(.75, def / (def + 4000));
  const lo = Math.round(atk * .8 * (1 - cut)), hi = Math.round(atk * 1.2 * (1 - cut));
  assert.strictEqual(atk, 10744, 'the raw MVP swing');
  assert.deepStrictEqual([lo, hi], [4524, 6786], 'the landed MVP hit through a 47.4% cut');
  const expected = atk * (1 - cut) * hit;
  assert.ok(expected > 4480 && expected < 4570, 'expected damage per MVP swing ~' + Math.round(expected) +
    ' (v86 caps paid ~3,008, v85 caps ~1,074)');
});

t('a wiped field is back inside 8 seconds: the worst camp refill wait is 7s', () => {
  assert.ok(src.includes('CAMP_REFILL_MIN=4,CAMP_REFILL_MAX=7'), 'the v87 camp wait range (was MAX 8)');
  assert.ok(/else for\(const c of camps\)if\(!mobs\.some\(m=>m\.pack===c\.i\)\)\{c\.t\+=dt;/.test(src),
    'the empty-field sweep still ticks the camp timers (the v86 whole-field-wipe fix)');
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
