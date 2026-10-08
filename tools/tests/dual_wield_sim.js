// v81 dual wield: the two Assassin jobs hold a dagger in each hand.
//   node tools/tests/dual_wield_sim.js
//
// The rules being tested, in the owner's words - "let set that assasin & assassin cross can
// wield daggers. 2 hands. ... the 2nd dagger reduces damage ... compensated by more cards.
// katar stays two-handed":
//   * ONLY Assassin and Assassin Cross gain the dagger, and only they may hold one in the
//     left hand. A Thief stays single-blade, and no class gets a shield it did not have.
//   * Scheme A, the tax that keeps the second blade from being free: the left-hand dagger
//     counts at DUAL (x0.5) of its base value and the two-handed katar at TWO_HANDED (x1.5),
//     so a pair of equal daggers is worth exactly the same weapon value as one katar - the
//     katar's multiplier is drawn from the dagger's, not added on top of it.
//   * The same half rate applies to the second dagger's affixes and cards, which is the leak
//     that actually matters: bon() runs over every equipped slot, so without the factor an
//     off-hand dagger would donate full card power for free.
//   * The extra sockets are what pay the second blade back. A dagger rolls at most three, so
//     a pair tops out at six cards - three at full rate plus three at half, which is 4.5 cards
//     of power against a katar's four. Short of that the pair is simply the weaker choice.
//   * The left hand is a WEAPON slot, not a shield slot: a dagger there adds no DEF, and a
//     shield still adds its full DEF for the classes allowed to hold one.
//   * A dagger keeps its own 1-3 socket roll. The second blade is paid for with cards, not
//     with sockets: a dual pair holds 2-6 cards against a katar's 4.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };
const pick = (re, name) => { const m = src.match(re); if (!m) throw new Error('cannot find ' + name + ' in index.html'); return m[0]; };

const code = [
  'let S=null;',
  grab('const CD=[', 'const pm=s=>'),                        // the class roster: CLASSES and wt
  pick(/const C=\(\)=>[^;]+;/, 'C()'),
  pick(/const st=k=>[^\n]*canUse=it=>[^;]+;/, 'st()/canUse()'),
  pick(/const items=\(\)=>[^\n]*/, 'items()/ev()/eqv() (the DUAL and TWO_HANDED rates)'),
  pick(/const bon=k=>\{[^\n]*/, 'bon()'),
  pick(/const atk=\(\)=>[^\n]*/, 'atk()'),
  pick(/const matk=\(\)=>[^\n]*/, 'matk()'),
  pick(/const def=\(\)=>[^,]+,mdef=/, 'def()').replace(/,mdef=$/, ''),
  grab('function canShield(){', 'function ekey(it)'),        // canShield / katarOnly / dualWield
  grab('function slotAccepts(k,it){', 'function equipChooser(k){'),
  'const pv=()=>0,tb={},petBuff={},collDmg=()=>0,MASTER_STATS=[];',
].join('\n');

// The socket roll is a one-line statement with no dependencies of its own, so it is replayed
// inside a function instead of being joined to the harness body.
const socketLine = pick(/const slots=slot==='weapon'[^\n]*/, 'the socket roll');

const harness = `
${code}
this.__d = { CLASSES, C, st, canUse, items, ev, eqv, bon, atk, matk, def, canShield, katarOnly,
             dualWield, slotAccepts, socketOf: (slot,T,t,ri) => { ${socketLine} return slots; },
             set S(v){S=v}, get S(){return S} };
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const H = sb.__d;

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('dual wield: a dagger in each hand for the two Assassin jobs\n');

// ---- fixtures ---------------------------------------------------------------
const empty = () => ({ weapon: null, armor: null, head: null, off: null, leg: null, acc1: null, acc2: null });
const wpn = (o) => Object.assign({ id: 1, name: 'Blade', slot: 'weapon', val: 80, aff: [], cards: [] }, o);
const katar = (o) => wpn(Object.assign({ wt: 'katar', name: 'Katar' }, o));
const dagger = (o) => wpn(Object.assign({ wt: 'dagger', name: 'Dagger' }, o));
const shield = (o) => wpn(Object.assign({ slot: 'off', name: 'Shield', wt: 'shield' }, o));
const mkS = (cls, eq) => ({ cls, lv: 60, st: { str: 40, agi: 40, dex: 40, luk: 20, int: 10, vit: 20 }, sk: {}, jobs: {}, inv: Object.values(eq).filter(Boolean), eq });
const wear = (cls, eq) => { H.S = mkS(cls, Object.assign(empty(), eq)); };

// ---- 1. who may hold two blades -------------------------------------------
t('only the two Assassin jobs wield a dagger alongside the katar, and only they dual-wield', () => {
  const both = Object.keys(H.CLASSES).filter(c => H.CLASSES[c].wt.includes('dagger') && H.CLASSES[c].wt.includes('katar'));
  assert.deepStrictEqual(both.sort(), ['Assassin', 'Assassin Cross'], 'nobody else holds a dagger and a katar');
  for (const cls of both) {
    assert.deepStrictEqual(Array.from(H.CLASSES[cls].wt), ['katar', 'dagger'], cls + ' keeps the katar first');
    assert.ok(H.CLASSES[cls].tier >= 2, cls + ' is a second job or above');
    wear(cls, {});
    assert.ok(H.dualWield(), cls + ' may dual-wield');
    assert.ok(!H.canShield(), cls + ' still may not hold a shield');
  }
  for (const cls of ['Thief', 'Novice', 'Swordman', 'Knight', 'Archer', 'Hunter', 'Mage', 'Wizard', 'Acolyte', 'Priest', 'Merchant', 'Blacksmith']) {
    wear(cls, {});
    assert.ok(!H.dualWield(), cls + ' does not dual-wield');
  }
});

t('the katar is still a two-handed weapon and never an off-hand item', () => {
  for (const cls of ['Assassin', 'Assassin Cross']) {
    const kat = katar();
    wear(cls, { weapon: kat });
    assert.ok(H.katarOnly(), cls + ' still counts as the two-handed katar class');
    assert.ok(H.slotAccepts('weapon', kat), cls + ' may wear a katar in the main hand');
    assert.ok(!H.slotAccepts('off', kat), 'a katar may not be worn in the left hand');
  }
});

t('the left hand takes a second dagger for the Assassins and a shield for everyone else', () => {
  for (const cls of ['Assassin', 'Assassin Cross']) {
    const d = dagger(), sh = shield();
    wear(cls, { weapon: dagger(), off: d });
    assert.ok(H.slotAccepts('off', d), cls + ' may hold a dagger in the left hand');
    assert.ok(!H.slotAccepts('off', sh), cls + ' may not hold a shield');
    assert.ok(!H.slotAccepts('off', wpn({ wt: 'sword' })), 'nor any other one-handed weapon');
  }
  for (const cls of ['Swordman', 'Knight', 'Acolyte', 'Merchant']) {
    const sh = shield(), d = dagger();
    wear(cls, { off: sh });
    assert.ok(H.slotAccepts('off', sh), cls + ' keeps its shield');
    assert.ok(!H.slotAccepts('off', d), cls + ' may not hold a dagger in the left hand');
  }
  wear('Thief', {});
  assert.ok(!H.slotAccepts('off', dagger()), 'a Thief does not dual-wield');
  assert.ok(!H.slotAccepts('off', shield()), 'a Thief holds nothing in the left hand');
});

// ---- 2. the base-value tax --------------------------------------------------
t('a katar counts as 1.5 weapons and a left-hand dagger as half of one', () => {
  wear('Assassin', { weapon: katar() });
  assert.strictEqual(H.eqv('weapon'), H.ev(katar()) * 1.5, 'the katar is the two-handed multiplier on its base value');

  wear('Assassin', { weapon: dagger() });
  assert.strictEqual(H.eqv('weapon'), H.ev(dagger()), 'a main-hand dagger is worth one weapon');

  wear('Assassin', { weapon: dagger(), off: dagger({ id: 2 }) });
  assert.strictEqual(H.eqv('off'), H.ev(dagger()) * 0.5, 'the second dagger is half a weapon');

  wear('Assassin', { off: shield() });
  assert.strictEqual(H.eqv('off'), H.ev(shield()), 'a shield is not taxed - it is not a weapon');
});

t('a pair of equal daggers is worth exactly one katar of the same value', () => {
  H.S = mkS('Assassin', { weapon: katar({ val: 80 }) });
  const single = H.atk();
  H.S = mkS('Assassin', { weapon: dagger({ val: 80 }), off: dagger({ id: 2, val: 80 }) });
  assert.strictEqual(H.atk(), single, 'the second blade must not add weapon value beyond the katar');
  // and it holds at every refine, because ev() is the same function on both items
  for (const r of [0, 1, 2, 3]) {
    H.S = mkS('Assassin', { weapon: katar({ val: 80, r }) });
    const k = H.atk();
    H.S = mkS('Assassin', { weapon: dagger({ val: 80, r }), off: dagger({ id: 2, val: 80, r }) });
    assert.strictEqual(H.atk(), k, 'refine +' + r + ' must stay at parity');
  }
  // ...while a katar that is one grade better than BOTH daggers is still ahead, so the
  // dual pair is not a free upgrade to chase
  H.S = mkS('Assassin', { weapon: katar({ val: 120 }) });
  assert.ok(H.atk() > single, 'a better katar still beats a matched dagger pair');
});

t('a left-hand dagger adds no DEF, but a shield still adds its own', () => {
  wear('Assassin', { weapon: dagger(), off: dagger({ id: 2, val: 80 }) });
  const withBlade = H.def();
  wear('Assassin', { weapon: dagger() });
  assert.strictEqual(withBlade, H.def(), 'a dagger in the left hand is a weapon, not armour');
  wear('Swordman', { off: shield({ val: 60 }) });
  assert.strictEqual(H.def(), Math.floor(H.S.lv * .5 + H.st('vit') * .5 + H.eqv('armor') + H.eqv('leg') + H.eqv('off')), 'a shield still gives its full DEF');
});

// ---- 3. the card and affix tax ---------------------------------------------
t('the second dagger pays half rate on its affixes and its cards', () => {
  const atkCard = { stat: 'atk', v: 8 }, strAff = { k: 'str', v: 5 };
  wear('Assassin', { weapon: dagger({ cards: [atkCard], aff: [strAff] }) });
  const alone = H.bon('atk');
  assert.strictEqual(alone, 8, 'a main-hand dagger pays full rate');
  assert.strictEqual(H.st('str'), 40 + 5, 'and its affixes count in full');

  wear('Assassin', { weapon: dagger(), off: dagger({ id: 2, cards: [atkCard], aff: [strAff] }) });
  assert.strictEqual(H.bon('atk'), 4, 'the off-hand dagger is taxed to half');
  assert.strictEqual(H.st('str'), 40 + 2.5, 'so are its affixes');

  // the tax is per item, not a global halving: the main hand still pays full rate
  wear('Assassin', { weapon: dagger({ cards: [atkCard] }), off: dagger({ id: 2, cards: [atkCard] }) });
  assert.strictEqual(H.bon('atk'), 12, 'one full card plus one half card');
  // and a shield in the left hand is never taxed, because it is not a weapon
  wear('Swordman', { weapon: wpn({ wt: 'sword', cards: [atkCard] }), off: shield({ cards: [atkCard] }) });
  assert.strictEqual(H.bon('atk'), 16, 'a shield card is not a weapon card and pays full rate');
});

t('the extra sockets are the compensation: a full pair out-cards the katar by one half card', () => {
  const g2 = { stat: 'atk', v: 8 };   // a grade-2 ATK weapon card
  const pair = (n) => ({ weapon: dagger({ cards: Array.from({ length: n }, () => g2) }),
                         off: dagger({ id: 2, cards: Array.from({ length: n }, () => g2) }) });
  wear('Assassin', { weapon: katar({ cards: [g2, g2, g2, g2] }) });
  const katarCards = H.bon('atk');
  assert.strictEqual(katarCards, 32, 'a katar donates all four of its cards');
  // a dagger rolls at most three sockets, so a pair tops out at six cards: three at full
  // rate plus three at half = 4.5 cards of power against the katar's four
  for (const n of [1, 2]) {
    wear('Assassin', pair(n));
    assert.strictEqual(H.bon('atk'), n * 8 + n * 4, n + '+' + n + ' sockets pays ' + (n + n / 2) + ' cards');
    assert.ok(H.bon('atk') < katarCards, 'and is short of the katar until both hands are full');
  }
  wear('Assassin', pair(3));
  assert.strictEqual(H.bon('atk'), 36, 'a full pair is 4.5 cards of power');
  assert.ok(H.bon('atk') > katarCards, 'and that is what pays for the second blade');
});

t('ATK: the pair is level on weapon value, ahead only once both hands are carded', () => {
  const g2 = { stat: 'atk', v: 8 };
  H.S = mkS('Assassin', { weapon: katar({ val: 80 }) });
  const bare = H.atk();                                    // a katar with no cards
  H.S = mkS('Assassin', { weapon: dagger({ val: 80 }), off: dagger({ id: 2, val: 80 }) });
  assert.strictEqual(H.atk(), bare, 'weapon value alone is exactly level');
  H.S = mkS('Assassin', { weapon: katar({ val: 80, cards: [g2, g2, g2, g2] }) });
  const carded = H.atk();
  assert.ok(carded > bare, 'four cards are worth a great deal to a katar');
  H.S = mkS('Assassin', { weapon: dagger({ val: 80 }), off: dagger({ id: 2, val: 80 }) });
  assert.ok(H.atk() < carded, 'an uncarded pair is behind a carded katar - the damage reduction');
  // both hands full of cards: the extra sockets win it back
  H.S = mkS('Assassin', { weapon: dagger({ val: 80, cards: [g2, g2, g2] }), off: dagger({ id: 2, val: 80, cards: [g2, g2, g2] }) });
  assert.ok(H.atk() > carded, 'a fully carded pair is ahead of the katar');
});

// ---- 4. sockets -------------------------------------------------------------
t('a dagger keeps its own 1-3 socket roll; only the katar and the bow get four', () => {
  const rolls = (T, t) => { const out = new Set(); for (const r of [0, 1]) out.add(H.socketOf('weapon', T, t, (a, b) => r ? b : a)); return out; };
  for (const t of [0, 1, 2, 3]) {
    assert.ok(!rolls({ k: 'dagger' }, t).has(4), 'a dagger must never roll four sockets at tier ' + t);
    assert.ok(Math.max(...rolls({ k: 'dagger' }, t)) <= 3, 'and never more than three');
  }
  assert.strictEqual(H.socketOf('weapon', { k: 'katar' }, 0, (a, b) => a), 4, 'the katar keeps its four sockets');
  assert.strictEqual(H.socketOf('weapon', { k: 'bow' }, 0, (a, b) => a), 4, 'so does the bow');
  // a dual pair is paid for with cards, so its socket count comes from the ordinary
  // 1-3 roll on each hand: 2 to 6 in total against the katar's flat four
  let worst = 0, best = 0;
  for (const t of [0, 1, 2, 3]) for (const a of [0, 1]) for (const b of [0, 1]) {
    const one = H.socketOf('weapon', { k: 'dagger' }, t, (x, y) => a ? y : x);
    const two = H.socketOf('weapon', { k: 'dagger' }, t, (x, y) => b ? y : x);
    worst = Math.min(worst || 99, one + two); best = Math.max(best, one + two);
  }
  assert.strictEqual([worst, best].join('-'), '2-6', 'a dual pair holds 2 to 6 sockets in total');
});

t('MATK reads the main hand only, so the left-hand dagger never feeds it', () => {
  wear('Assassin', { weapon: dagger() });
  const alone = H.matk();
  wear('Assassin', { weapon: dagger(), off: dagger({ id: 2 }) });
  assert.strictEqual(H.matk(), alone, 'a mage stat is not what the second blade is for');
});

console.log('\ndual wield: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
