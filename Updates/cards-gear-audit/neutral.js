// "Same DPS, different distribution": how far do affixes and cards have to go to undo the
// flat-base cut?   node Updates/cards-gear-audit/neutral.js
//
// The answer to "why did it drop 50%": the flat gear layer was a x6.87 multiplier on the whole
// character, so cutting it is expensive to undo. This script finds the exact give-back that
// restores the pre-v38 endgame DPS, and prints what the layers look like when it does. It models
// the PRE-v38 baseline: run it against a pre-v38 copy with AUDIT_HTML=/path/to/index.html.
const fs = require('fs'), path = require('path');
const auditSrc = fs.readFileSync(path.join(__dirname, 'audit.js'), 'utf8');
const head = auditSrc.slice(0, auditSrc.indexOf("console.log('cards & equipment power audit"));
const api = new Function('require', '__dirname', 'console', head +
  '\nreturn {build, X, f, measure, fixture, autoDps, mobStat, bossStat, cardsIn, mkSet, alloc};'
)(require, __dirname, console);
const { build, X, f, measure, fixture, autoDps, cardsIn, mkSet, mobStat, bossStat } = api;

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
const N = 200;

// ---- the decided shape (weapon /3, everything else kept; AM/CV = the give-back) --------------
const FLAT = ['{weapon:6,armor:4,head:10,off:3,leg:3,acc:5}[slot]',
              '{weapon:2,armor:4,head:10,off:3,leg:3,acc:5}[slot]', 'weapon /3'];
const CLIFF = ['sec=m>=5?3:secOf(l)', 'sec=m>=5?(l>=3?3:2):secOf(l)', 'cliff floor 2'];
const CLIFF2 = ['MAPS[m].gear[m>=5?3:secOf(l)]', 'MAPS[m].gear[m>=5?(l>=3?3:2):secOf(l)]', 'cliff floor 2 names'];
const BOSS_GEAR = ['drops:T.map(x=>[x,2.4])', 'drops:T.map(x=>[x,1])', 'boss gear 1%'];
const BOSS_CARD = ['cardCh:.08', 'cardCh:.1', 'boss card 0.1%'];
const am = e => 'AM=[' + [1, 1.6, 2.6, 4, 6.5].map(v => Math.round(v * e * 100) / 100).join(',') + ']';
const cv = e => 'CV=[' + [1, 2, 3, 5].map(v => Math.round(v * e * 100) / 100).join(',') + ']';
const cfg = (ea, ec) => build([FLAT, ['AM=[1,1.6,2.6,4,6.5]', am(ea), 'AM'], ['CV=[1,2,3,5]', cv(ec), 'CV'],
  CLIFF, CLIFF2, BOSS_GEAR, BOSS_CARD]);

const dmg = Y => measure(Y, 99, 3, 4, 10, cardsIn(Y, 3, 'atk'), N).dps;
const TODAY = dmg(X);

console.log('why the sheet landed at x0.48, and what "same DPS" costs');
console.log('='.repeat(100));
console.log('today endgame auto-DPS: ' + f(Math.round(TODAY)));
console.log('\nthe same numbers with the give-back scaled up (AM and CV multiplied together):');
console.log('  give-back   AM (Common->Legendary)              CV (Common->Legendary)          auto-DPS   vs today   ATK% from affix+card');
[1, 1.3, 1.6, 2.0, 2.4, 2.8, 3.2].forEach(e => {
  const Y = cfg(e, e);
  const m = measure(Y, 99, 3, 4, 10, cardsIn(Y, 3, 'atk'), 60);
  const S = fixture(Y, 150, 'Lord Knight', mkSet(Y, 99, 3, 4, 10, cardsIn(Y, 3, 'atk')()));
  Y.S = S; S.hp = Y.maxHp();
  console.log('  x' + e.toFixed(1).padEnd(9) + am(e).padEnd(38) + cv(e).padEnd(32) + f(Math.round(m.dps)).padStart(9) +
    ('x' + (m.dps / TODAY).toFixed(2)).padStart(10) + ('+' + Y.bon('atk').toFixed(0) + '%').padStart(22));
});
console.log('  (x1.0 is the sheet as you filled it in: AM 1/2.1/3.4/5.2/8.5, CV 1/2.6/3.9/6.5 -> x0.48)');

// ---- find the neutral give-back for three different splits -----------------------------------
const solve = (fixedA, fixedC, which) => {                       // which: 'am' | 'cv' | 'both'
  let lo = 1, hi = 12;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const Y = which === 'am' ? cfg(mid, fixedC) : which === 'cv' ? cfg(fixedA, mid) : cfg(mid, mid);
    const d = dmg(Y);
    if (d < TODAY) lo = mid; else hi = mid;
  }
  const e = (lo + hi) / 2;
  return { e, Y: which === 'am' ? cfg(e, fixedC) : which === 'cv' ? cfg(fixedA, e) : cfg(e, e), AM: which === 'am' || which === 'both' ? am(e) : am(fixedA), CV: which === 'cv' || which === 'both' ? cv(e) : cv(fixedC) };
};
const splits = [
  ['cards carry it all  (AM stays 1.0x)', solve(1, null, 'cv'), 'cv'],
  ['affixes carry it all  (CV stays 1.0x)', solve(null, 1, 'am'), 'am'],
  ['both scale together', solve(null, null, 'both'), 'both'],
];
console.log('\n' + '='.repeat(100));
console.log('THREE WAYS TO GET BACK TO TODAY\'S DPS (weapon /3, nothing else cut)');
console.log('='.repeat(100));
splits.forEach(([label, s, kind]) => {
  const m = measure(s.Y, 99, 3, 4, 10, cardsIn(s.Y, 3, 'atk'), N);
  const S = fixture(s.Y, 150, 'Lord Knight', mkSet(s.Y, 99, 3, 4, 10, cardsIn(s.Y, 3, 'atk')()));
  s.Y.S = S; S.hp = s.Y.maxHp();
  S.crit = s.Y.crit(); S.aspd = s.Y.aspd();
  console.log('\n  ' + label + '   (scale x' + s.e.toFixed(2) + ')');
  console.log('    AM = ' + s.AM);
  console.log('    CV = ' + s.CV);
  console.log('    endgame: DPS ' + f(Math.round(m.dps)) + '  (=x' + (m.dps / TODAY).toFixed(2) + ')   ATK ' + f(Math.round(m.atk)) +
    '   HP ' + f(Math.round(m.hp)) + '   DEF ' + f(Math.round(m.def)));
  const amLegend = kind === 'cv' ? 6.5 : 6.5 * s.e, cvLegend = kind === 'am' ? 5 : 5 * s.e;
  console.log('    one Legendary ATK affix = +' + Math.round(4 * amLegend * 0.8) + '% ATK (a set averages ~1.9 of them)' +
    ' · one Legendary ATK card = +' + Math.round(cvLegend * 0.8) + '% ATK (nine of them)');
  console.log('    crit ' + S.crit + '% (cap 60) · attack interval ' + S.aspd.toFixed(2) + 's');
});
console.log('\n' + '='.repeat(100));
console.log('WHAT THE LAYERS LOOK LIKE (level+stats -> gear flat -> refine -> affixes -> cards)');
console.log('='.repeat(100));
const layers = Y => {
  const strip = set => { for (const k in set) set[k].aff = []; return set; };
  const step = (opts) => {
    const a = { dps: 0, atk: 0 };
    for (let i = 0; i < 200; i++) {
      Y.reseed(90001 + i * 7919);
      let set = null;
      if (opts.gear) { set = mkSet(Y, 99, 3, 4, opts.refine === undefined ? 10 : opts.refine, null); if (opts.noAff) strip(set); if (opts.cards) for (const [slot, c] of cardsIn(Y, 3, 'atk')()) set[slot].cards = (set[slot].cards || []).concat([c]); }
      const S = fixture(Y, 150, 'Lord Knight', set);
      if (opts.noSkills) S.sk = { aid: 1 };
      Y.S = S; S.hp = Y.maxHp();
      a.dps += autoDps(Y); a.atk += Y.atk();
    }
    a.dps /= 200; return a;
  };
  return [['level+stats', step({ noSkills: 1 })], ['+skills', step({})], ['+gear flat', step({ gear: 1, refine: 0, noAff: 1 })],
    ['+refine +10', step({ gear: 1, noAff: 1 })], ['+affixes', step({ gear: 1 })], ['+9 ATK cards', step({ gear: 1, cards: 1 })]];
};
const show = (label, Y) => {
  const L = layers(Y);
  console.log('\n' + label);
  L.forEach(([n, v], i) => console.log('  ' + n.padEnd(14) + f(Math.round(v.dps)).padStart(10) +
    (i ? '   own x' + (v.dps / L[i - 1][1].dps).toFixed(2) : '          -') + ('   total x' + (v.dps / L[0][1].dps).toFixed(1)).padStart(18)));
};
show('today', build([]));
const neutralBoth = splits[2][1];
show('your sheet (give-back x1.3 -> DPS x0.48)', cfg(1.3, 1.3));
show('neutral, both scaled x' + neutralBoth.e.toFixed(2), neutralBoth.Y);
console.log('\nspread of the affix lottery (min..max ATK over 200 seeded Legendary sets, no cards):');
[['today', build([])], ['your sheet x1.3', cfg(1.3, 1.3)], ['neutral x2.53', neutralBoth.Y]].forEach(([l, Y]) => {
  const m = measure(Y, 99, 3, 4, 10, null, N);
  console.log('  ' + l.padEnd(16) + f(Math.round(m.min)).padStart(10) + ' .. ' + f(Math.round(m.max)).padStart(10) +
    '   worst set is ' + (m.min / m.max * 100).toFixed(0) + '% of the best');
});

// ---- the whole curve at the neutral setting: does it stay flat? -------------------------------
console.log('\n' + '='.repeat(100));
console.log('THE WHOLE CURVE AT THE NEUTRAL SETTING (stage-5 field, character at the map band level)');
console.log('='.repeat(100));
console.log('map          lvl   DPS today    DPS neutral   neutral/today   mob kill');
[6, 17, 27, 39, 52, 63, 70, 77, 85, 95].forEach((lv, m) => {
  const stage = 5, sec = m >= 5 ? 3 : X.secOf(stage), tier = X.dropTier(m, stage), dropLvl = X.MAPS[m].b + stage;
  const a = measure(X, dropLvl, sec, tier, 0, null, 60, 'Lord Knight', lv);
  const b = measure(neutralBoth.Y, dropLvl, sec, tier, 0, null, 60, 'Lord Knight', lv);
  const mob = mobStat(X, m, stage);
  console.log('  ' + X.MAPS[m].n.padEnd(11) + String(lv).padEnd(6) + f(Math.round(a.dps)).padStart(10) + f(Math.round(b.dps)).padStart(14) +
    ('x' + (b.dps / a.dps).toFixed(2)).padStart(15) + ('   ' + (mob.hp / b.dps).toFixed(2) + 's').padStart(12));
});
console.log('\n(early maps use Common/Fine gear, where the same scale factor is applied - that is why the');
console.log(' early game moves too and why a neutral-by-construction setting keeps it near x1.0)');
