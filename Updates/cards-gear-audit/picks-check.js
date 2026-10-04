// The owner's tuning-sheet answers, run through the real game code.
//   node Updates/cards-gear-audit/picks-check.js
//
// Everything is measured with the same extraction the audit uses (audit.js is read in and its
// harness reused verbatim - no formula is copied here), so these numbers are the live game's.
// "today" = the PRE-v38 shipped values, "picks" = the answer sheet as filled in on 2026-10-04.
// Since v38 shipped, run it against a pre-v38 copy: AUDIT_HTML=/path/to/pre-v38/index.html node ...
const fs = require('fs'), path = require('path');

// ---- reuse audit.js up to the point where it starts printing ---------------------------------
const auditSrc = fs.readFileSync(path.join(__dirname, 'audit.js'), 'utf8');
const head = auditSrc.slice(0, auditSrc.indexOf("console.log('cards & equipment power audit"));
const api = new Function('require', '__dirname', 'console', head +
  '\nreturn {build, X, f, pct, measure, fixture, autoDps, mobStat, bossStat, cardsIn, mkSet, alloc};'
)(require, __dirname, console);
const { build, X, f, pct, measure, fixture, autoDps, mobStat, bossStat, cardsIn } = api;

// ---- baseline guard -------------------------------------------------------------------------
// Both tools patched the PRE-v38 build forward: every patch source string below is that build's
// source. On the shipped v38 file they have nothing to measure, so say so instead of throwing.
const htmlPath = process.env.AUDIT_HTML || path.join(__dirname, '..', '..', 'index.html');
if (!fs.readFileSync(htmlPath, 'utf8').includes('drops:T.map(x=>[x,2.4])')) {
  console.log('this build is not the pre-v38 baseline these patches describe.');
  console.log('re-run against a copy of the pre-v38 index.html, e.g.');
  console.log('  AUDIT_HTML=/path/to/pre-v38/index.html node Updates/cards-gear-audit/' + path.basename(__filename));
  console.log('what shipped in v38 is in PICKS-REVIEW.md ("What shipped") and in audit.js section 3b.');
  process.exit(0);
}

// ---- the sheet, verbatim ---------------------------------------------------------------------
const PICKS = [
  ['{weapon:6,armor:4,head:10,off:3,leg:3,acc:5}[slot]',
   '{weapon:2,armor:4,head:10,off:3,leg:3,acc:5/3}[slot]', 'flat base: weapon /3, accessory /3, armor/head/shield/legwear kept'],
  ['AM=[1,1.6,2.6,4,6.5]', 'AM=[1,2.1,3.4,5.2,8.5]', 'affix magnitude up (the give-back)'],
  ['CV=[1,2,3,5]', 'CV=[1,2.6,3.9,6.5]', 'card values up (the second give-back)'],
  // the cliff lives in TWO places: gearPool picks the item NAMES, fieldOf's sec decides the
  // drop's NUMBERS (val + affix scale). The sheet said "high-tier only from field level 3", so
  // both are patched here - a patch to gearPool alone renames the loot and changes nothing.
  ['MAPS[m].gear[m>=5?3:secOf(l)]', 'MAPS[m].gear[(m>=5&&l>=3)?3:secOf(l)]', 'cliff: item names'],
  ['sec=m>=5?3:secOf(l)', 'sec=m>=5?(l>=3?3:secOf(l)):secOf(l)', 'cliff: drop value (field level 1-2 = Novice-section gear)'],
  ['drops:T.map(x=>[x,2.4])', 'drops:T.map(x=>[x,.5])', 'boss gear 2.4% -> 0.5% per pool item'],
  ['drops:[[T[(l*3+2*j)%n],4.8],[T[(l*3+2*j+1)%n],4.0],[T[(l*3+2*j+2)%n],3.2]]',
   'drops:[[T[(l*3+2*j)%n],5],[T[(l*3+2*j+1)%n],5],[T[(l*3+2*j+2)%n],3]]', 'field rolls 5 / 5 / 3'],
  ['cardCh:.08', 'cardCh:.05', 'boss card 0.08% -> 0.05%'],
];
const P = build(PICKS);
const N = 200, mobE = mobStat(X, 9, 10), bossE = bossStat(X, 9, 10);
const endgame = Y => measure(Y, 99, 3, 4, 10, cardsIn(Y, 3, 'atk'), N);
const TODAY = endgame(X), PICKS_E = endgame(P);

console.log('the tuning sheet as filled in, measured against the real code');
console.log('='.repeat(104));
console.log('applied:');
PICKS.forEach(([,, label]) => console.log('  - ' + label));
console.log('kept:   section ladder, level term 0.15, rarity multipliers, mob/boss HP, ore rates,');
console.log('        field card 0.45%, card slots, affix counts and all 11 affix weights');
console.log('decided: headgear/accessory base "kept", DEF fix "capped" (def/(def+4000), 75% max)');

// ---------------------------------------------------------------- 1. endgame
console.log('\n' + '='.repeat(104));
console.log('1. ENDGAME (Lord Knight Lv150, 120/120/120, +10 Legendary set, 9 Legendary ATK cards, 200 sets)');
console.log('='.repeat(104));
const scen = [
  ['naked', null],
  ['Epic field set +0', { sec: 3, tier: 3, r: 0 }],
  ['Epic field set +10', { sec: 3, tier: 3, r: 10 }],
  ['Legendary boss set +10', { sec: 3, tier: 4, r: 10 }],
];
console.log('scenario                          ATK today   ATK picks   DPS today   DPS picks   picks/today   HP today   HP picks');
scen.forEach(([label, g]) => {
  const row = Y => g ? measure(Y, 99, g.sec, g.tier, g.r, null, N) : (() => {
    const S = fixture(Y, 150, 'Lord Knight', null); Y.S = S; S.hp = Y.maxHp();
    return { atk: Y.atk(), dps: autoDps(Y), hp: Y.maxHp(), def: Y.def() };
  })();
  const a = row(X), b = row(P);
  console.log('  ' + label.padEnd(30) + f(Math.round(a.atk)).padStart(10) + f(Math.round(b.atk)).padStart(12) +
    f(Math.round(a.dps)).padStart(12) + f(Math.round(b.dps)).padStart(12) + ('x' + (b.dps / a.dps).toFixed(2)).padStart(14) +
    f(Math.round(a.hp)).padStart(11) + f(Math.round(b.hp)).padStart(11));
});
console.log('  with the 9 cards:                 ' + f(Math.round(TODAY.atk)).padStart(10) + f(Math.round(PICKS_E.atk)).padStart(12) +
  f(Math.round(TODAY.dps)).padStart(12) + f(Math.round(PICKS_E.dps)).padStart(12) + ('x' + (PICKS_E.dps / TODAY.dps).toFixed(2)).padStart(14));
console.log('  DEF endgame: today ' + f(Math.round(TODAY.def)) + ' -> picks ' + f(Math.round(PICKS_E.def)) +
  '   (affixes still feed DEF; the 75% cap sits at DEF 12,000)');

// ---------------------------------------------------------------- 2. the curve
console.log('\n' + '='.repeat(104));
console.log('2. THE WHOLE CURVE - does the nerf land evenly? (stage-5 field, character at the map band level)');
console.log('='.repeat(104));
console.log('map          lvl   geared DPS today    geared DPS picks   picks/today   DPS x naked (today/picks)   mob kill today/picks');
[6, 17, 27, 39, 52, 63, 70, 77, 85, 95].forEach((lv, m) => {
  const stage = 5, sec = m >= 5 ? 3 : X.secOf(stage), tier = X.dropTier(m, stage), dropLvl = X.MAPS[m].b + stage;
  const naked = fixture(X, lv, 'Lord Knight', null); X.S = naked; const dNaked = autoDps(X);
  const a = measure(X, dropLvl, sec, tier, 0, null, 60, 'Lord Knight', lv);
  const b = measure(P, dropLvl, sec, tier, 0, null, 60, 'Lord Knight', lv);
  const mob = mobStat(X, m, stage);
  console.log('  ' + X.MAPS[m].n.padEnd(11) + String(lv).padEnd(6) + f(Math.round(a.dps)).padStart(15) + f(Math.round(b.dps)).padStart(19) +
    ('x' + (b.dps / a.dps).toFixed(2)).padStart(14) + ('   ' + (a.dps / dNaked).toFixed(1) + ' / ' + (b.dps / dNaked).toFixed(1)).padStart(28) +
    ('   ' + (mob.hp / a.dps).toFixed(2) + 's / ' + (mob.hp / b.dps).toFixed(2) + 's').padStart(28));
});
// the Comodo cliff: the sheet gates high-tier gear to field level 3, which on maps 5-10 turns
// stages 1-2 into section 0/1 gear. Compare that with the softer version (floor at section 2).
// the softer version of the same idea: high-tier names, but the drop's section is floored at 2
// for field levels 1-2 on maps 5-10 (57% of the high-tier value instead of Novice-tier gear)
const FLOOR2 = [
  PICKS[0], PICKS[1], PICKS[2],
  ['MAPS[m].gear[m>=5?3:secOf(l)]', 'MAPS[m].gear[m>=5?(l>=3?3:2):secOf(l)]', 'cliff floor: names'],
  ['sec=m>=5?3:secOf(l)', 'sec=m>=5?(l>=3?3:2):secOf(l)', 'cliff floor: value'],
  PICKS[5], PICKS[6], PICKS[7],
];
const P2 = build(FLOOR2);
console.log('\nthe Comodo cliff, as picked vs floored at section 2 (maps 5-10, field levels 1-2):');
console.log('  variant                                  gear value per drop   geared DPS   vs today');
[['Comodo', 5, 1], ['Comodo', 5, 2], ['Abyss', 9, 1], ['Abyss', 9, 2]].forEach(([name, m, stage]) => {
  const l = X.MAPS[m].b + stage, lv = Math.max(6, l - 8);
  const todayF = X.fieldOf(m, stage), pickF = P.fieldOf(m, stage), f2F = P2.fieldOf(m, stage);
  const valOf = (Y, F) => Y.ev(Y.genGear(F.mobs[0].drops[0][0], l, F.sec, false, F.tier));
  const dpsOf = (Y, F) => measure(Y, l, F.sec, F.tier, 0, null, 60, 'Lord Knight', lv).dps;
  const a = dpsOf(X, todayF);
  console.log('  ' + (name + ' stage ' + stage + ' today').padEnd(40) + f(valOf(X, todayF)).padStart(20) + f(Math.round(a)).padStart(13) + '   x1.00');
  console.log('  ' + (name + ' stage ' + stage + ' as picked').padEnd(40) + f(valOf(P, pickF)).padStart(20) + f(Math.round(dpsOf(P, pickF))).padStart(13) + ('   x' + (dpsOf(P, pickF) / a).toFixed(2)));
  console.log('  ' + (name + ' stage ' + stage + ' floored at sec 2').padEnd(40) + f(valOf(P2, f2F)).padStart(20) + f(Math.round(dpsOf(P2, f2F))).padStart(13) + ('   x' + (dpsOf(P2, f2F) / a).toFixed(2)));
});

// ---------------------------------------------------------------- 3. the DEF cap
console.log('\n' + '='.repeat(104));
console.log('3. THE DEF DECISION (their "capped" choice): def/(def+4000), max 75% cut');
console.log('='.repeat(104));
const cut = (d, k) => Math.min(.75, d / (d + k));
const hitPick = atk => d => Math.max(1, Math.round(atk * .8 * (1 - cut(d, 4000))));
const hitNow = (atk, d) => Math.max(1, Math.round(atk * .8 - d * .6));
const HPnow = { naked: TODAY.hp, mid: 0, end: PICKS_E.hp };
{
  const Sn = fixture(X, 150, 'Lord Knight', null); X.S = Sn;
  const dNaked = X.def(), hNaked = X.maxHp();
  const midDef = 7112, midHp = Math.round(hNaked + (PICKS_E.hp - hNaked) * .5);
  const rows = [['naked (no gear)', dNaked, hNaked], ['mid-gear +10 (+6,000 DEF)', midDef, midHp], ['endgame, picks (+10 Legendary)', PICKS_E.def, PICKS_E.hp]];
  console.log('gear                       DEF    mob hit   regen/s   net/s   time to die   boss hit   net/s   time to die');
  rows.forEach(([label, d, hp]) => {
    const regen = hp * .016;                     // 0.8% every 0.5s in the game loop
    const mHit = Math.max(1, Math.round(mobE.atk * .8 * (1 - cut(d, 4000)))), bHit = Math.max(1, Math.round(bossE.atk * .8 * (1 - cut(d, 4000))));
    const mNet = mHit / 1.5 - regen, bNet = bHit / 1.2 - regen;
    const t = n => n <= 0 ? 'never' : (hp / n / 60 >= 60 ? (hp / n / 3600).toFixed(1) + ' h' : (hp / n).toFixed(0) + ' s');
    console.log('  ' + label.padEnd(26) + f(Math.round(d)).padStart(7) + f(mHit).padStart(10) + f(Math.round(regen)).padStart(11) +
      f(Math.round(mNet)).padStart(9) + t(mNet).padStart(14) + f(bHit).padStart(11) + f(Math.round(bNet)).padStart(9) + t(bNet).padStart(14));
  });
  console.log('  today, for contrast: a geared character takes 1 from every hit, so nothing can ever kill it.');
}

// ---------------------------------------------------------------- 4. drop economy
console.log('\n' + '='.repeat(104));
console.log('4. DROP ECONOMY (the sheet raised field rolls and cut boss gear)');
console.log('='.repeat(104));
const pool = m => X.fieldOf(m, 10).boss.drops.length;
[['Abyss', 9], ['Louyang', 6]].forEach(([name, m]) => {
  const n = pool(m), todayBoss = n * 2.4 / 100, pickBoss = n * .5 / 100;
  console.log('  ' + name.padEnd(8) + 'boss pool ' + n + ' items  ·  today ' + (todayBoss * 100).toFixed(1) + '% per boss kill (' +
    (1 / todayBoss).toFixed(1) + ' kills per Legendary item)  ->  picks ' + (pickBoss * 100).toFixed(1) + '% (' + (1 / pickBoss).toFixed(1) + ' kills)');
});
const fieldToday = (4.8 + 4 + 3.2) / 100, fieldPick = (5 + 5 + 3) / 100;
console.log('  field: ' + (fieldToday * 100).toFixed(1) + '% of kills drop a piece -> ' + (fieldPick * 100).toFixed(1) + '% (a +' + ((fieldPick / fieldToday - 1) * 100).toFixed(0) + '% bump)');
console.log('  boss ore 5% + minions 2% unchanged: ~0.30 ore per stage-10 wave, so +10 on ONE item is still ~513 waves.');
const wCount = X.fieldOf(9, 10).boss.drops.filter(([T]) => String(T.k).length && !['armor','head','off','leg','acc'].includes(T.k)).length;
console.log('  per-roll odds: ANY Legendary item = ' + (pool(9) * .5).toFixed(1) + '% per boss kill (' + (1 / (pool(9) * .005)).toFixed(1) + ' kills),');
console.log('  ONE specific item = 0.5% = ' + (1 / .005) + ' boss kills, and ANY usable weapon (' + wCount + ' weapon entries) = ' +
  (wCount * .5).toFixed(1) + '% = ' + (1 / (wCount * .005)).toFixed(0) + ' kills.');
console.log('  a full seven-slot set (no duplicates, any quality) = ' + Math.round(7 / (pool(9) * .005)) + ' boss kills = ' +
  (Math.round(7 / (pool(9) * .005)) * 25 / 60).toFixed(0) + ' min of pure boss waves at ~25s each - while ONE +10 upgrade still costs ~513 waves.');
// how much gear power flows in per kill, on the map where it matters
console.log('\nexpected gear value per kill (sum of rate x val over the field rolls):');
[[0, 1], [4, 5], [9, 5], [9, 9], [5, 1], [5, 5]].forEach(([m, stage]) => {
  const l = X.MAPS[m].b + stage;
  const val = (Y) => { const F = Y.fieldOf(m, stage); return F.mobs[0].drops.reduce((a, [T, ch]) => a + ch / 100 * (Y.ev(Y.genGear(T, l, F.sec, false, F.tier))), 0); };
  const a = val(X), b = val(P);
  console.log('  ' + (X.MAPS[m].n + ' stage ' + stage).padEnd(20) + 'today ' + f(Math.round(a)).padStart(8) + 'z   picks ' + f(Math.round(b)).padStart(8) + 'z   x' + (b / a).toFixed(2));
});

// ---------------------------------------------------------------- 5. the HP question
console.log('\n' + '='.repeat(104));
console.log('5. THE HP CONTRADICTION - the sheet says the two HP slots are "kept" but accessory base is /3');
console.log('='.repeat(104));
// the sheet's "HP slots kept" reading: weapon divided, accessory left at 5
const keepAcc = build([[PICKS[0][0], '{weapon:2,armor:4,head:10,off:3,leg:3,acc:5}[slot]', 'flat base: weapon /3, accessory kept']].concat(PICKS.slice(1)));
console.log('  max HP at Lv150 (+10 Legendary set, no cards):');
console.log('    today (weapon 6, acc 5)                ' + f(Math.round(TODAY.hp)));
console.log('    sheet as typed (weapon 2, acc 5/3)     ' + f(Math.round(PICKS_E.hp)) + '   (x' + (PICKS_E.hp / TODAY.hp).toFixed(2) + ')');
console.log('    "HP slots kept" reading (weapon 2, acc 5) ' + f(Math.round(endgame(keepAcc).hp)) + '   (x' + (endgame(keepAcc).hp / TODAY.hp).toFixed(2) + ')');
console.log('  headgear feeds maxHp x4 and each accessory x3, so the two accessories are 6 of the 10 HP units.');
console.log('  to put HP back to today while keeping acc at 5/3 you would need w_hp ~ ' +
  (12 * (TODAY.hp / PICKS_E.hp)).toFixed(0) + ' (from 12) - or head base ' + (10 * 2.2).toFixed(1) + ' (from 10).');

// ---------------------------------------------------------------- 6. what the give-back is worth, grade by grade
console.log('\n' + '='.repeat(104));
console.log('6. THE GIVE-BACK, GRADE BY GRADE (one ATK% affix and one Legendary ATK card)');
console.log('='.repeat(104));
console.log('grade       affix ATK% today   affix ATK% picks   change   card ATK% today   card ATK% picks');
[0, 1, 2, 3, 4].forEach(t => {
  const af = (Y, sec) => Math.round((1 + sec) * Y.AM[t] * Y.AB.atk * 1.025);
  const a = af(X, 3), b = af(P, 3);
  const cg = Math.min(3, t);                       // card grades only go to 3 (Legendary)
  const ca = Math.round(X.CV[cg] * X.AB.atk), cb = Math.round(P.CV[cg] * P.AB.atk);
  console.log('  ' + X.RAR[t].n.padEnd(11) + String(a).padStart(13) + '%' + (String(b).padStart(16) + '%') +
    ('x' + (b / a).toFixed(2)).padStart(11) + String(ca).padStart(15) + '%' + (String(cb).padStart(15) + '%'));
});
console.log('  early maps use Common/Fine gear (AM 1 / 1.6 -> 1 / 2.1): Common affixes get NO give-back,');
console.log('  so the flat-weapon /3 lands at full strength in the first hour and softens as the grades climb.');
console.log('\n(dps figures are auto-attacks only; skills multiply the same base, so the ratios carry over)');
