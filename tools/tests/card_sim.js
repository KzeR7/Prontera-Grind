// Cards: grade-gated stat pool, stat-aware values, and socketability.
//   node tools/tests/card_sim.js
//
// The rules being tested:
//   * Common (g0) and Uncommon (g1) cards roll ONLY the five base stats - the wider
//     pool is the reward for reaching Rare and Legendary;
//   * Rare (g2) and Legendary (g3) cards may roll hp/atk/crit/aspd/flee/cdm as well;
//   * the five base stats keep exactly the value they had before this change, so cards
//     already sitting in a save do not silently shift;
//   * a card's value scales with its stat's own weight AB, so an HP card is worth more
//     than a STR card at the same grade instead of both being a flat CV[g];
//   * every stat a card can roll has a CFIT entry - before this change the wider stats
//     had none, so such a card could never be socketed into anything.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const pick = (re, name) => { const m = src.match(re); if (!m) throw new Error('cannot find ' + name + ' in index.html'); return m[0]; };

const code = [
  pick(/const AM=\[[^\]]*\],GRADE=\[[^\]]*\],GI=\[[^\]]*\],CV=\[[^\]]*\];/, 'rarity/CV constants'),
  pick(/const AFF=\[[^\]]*\],AB=\{[^}]*\};/, 'AFF/AB constants'),
  pick(/K5=\[[^\]]*\];/, 'K5 base-stat list'),
  pick(/const cardVal=\(g,st\)=>[^;]+;/, 'cardVal()'),
  pick(/const cardStat=\(g,seed\)=>\{[^}]*\};/, 'cardStat()'),
  pick(/const CFIT=\{[^}]*\}/, 'CFIT'),
].join('\n');

// the load() repair must be the stat-aware one, not the old flat CV[c.g]
const repair = pick(/const fx=c=>\{c\.v=[^}]*\};/, 'load() card repair');

const harness = `
${code}
const grp = it => it.slot === 'weapon' ? 'weapon' : it.slot === 'head' ? 'head' : it.slot === 'acc' ? 'acc' : 'armor';
${repair.replace('const fx=c=>', 'const repairCard=c=>')}
this.__c = { cardVal, cardStat, cardVal2: repairCard, CFIT, AFF, K5, CV, AB, GRADE, grp };
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const C = sb.__c;

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('cards: grade-gated stats, stat-aware values, socketability\n');

t('the base-stat pool is exactly the five old stats', () => {
  // C.K5 is a cross-realm array (built inside the vm), so compare contents, not prototypes
  assert.deepStrictEqual(Array.from(C.K5), ['str', 'agi', 'dex', 'luk', 'int']);
});

t('Common and Uncommon cards never roll the wider stats', () => {
  const wide = C.AFF.filter(s => !C.K5.includes(s));
  assert.ok(wide.length >= 6, 'expected the wider pool to add several stats, got ' + wide.join(','));
  for (const g of [0, 1]) {
    const seen = new Set();
    for (let seed = 0; seed < 4000; seed++) seen.add(C.cardStat(g, seed));
    for (const s of seen) assert.ok(C.K5.includes(s), `grade ${g} rolled "${s}", which is not a base stat`);
    assert.strictEqual(seen.size, C.K5.length, `grade ${g} should be able to reach all five base stats, got ${[...seen]}`);
  }
});

t('Rare and Legendary cards can roll the wider pool', () => {
  for (const g of [2, 3]) {
    const seen = new Set();
    for (let seed = 0; seed < 4000; seed++) seen.add(C.cardStat(g, seed));
    assert.strictEqual(seen.size, C.AFF.length, `grade ${g} reached ${seen.size} of ${C.AFF.length} stats`);
    for (const w of ['hp', 'atk', 'crit', 'aspd', 'flee', 'cdm'])
      assert.ok(seen.has(w), `grade ${g} never rolls ${w}`);
  }
});

t('cardStat is deterministic - the same mob always drops the same card', () => {
  for (const g of [0, 1, 2, 3])
    for (const seed of [0, 1, 7, 42, 999])
      assert.strictEqual(C.cardStat(g, seed), C.cardStat(g, seed));
  // and different mobs differ
  const stats = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(j => C.cardStat(2, (3 * 10 + 5 + j) * 3 + 1)));
  assert.ok(stats.size > 1, 'every mob on a field rolled the identical card');
});

t('cardStat tolerates negative and large seeds without returning undefined', () => {
  for (const seed of [-1, -7, 1e6, 1e9])
    for (const g of [0, 1, 2, 3])
      assert.ok(C.AFF.includes(C.cardStat(g, seed)), `seed ${seed} grade ${g} -> ${C.cardStat(g, seed)}`);
});

t('the five base stats are CV[g] flat and rounded, never AB-weighted', () => {
  // v38 raised CV x3.2 (a Legendary base-stat card is +16, was +5), so the pin is the table
  // itself, rounded - not the number 5 it used to be.
  for (let g = 0; g < 4; g++)
    for (const s of C.K5)
      assert.strictEqual(C.cardVal(g, s), Math.max(1, Math.round(C.CV[g])), `${s} card grade ${g} changed value`);
  assert.strictEqual(C.cardVal(0, 'str'), 3);
  assert.strictEqual(C.cardVal(3, 'str'), 16);
});

t('wider stats scale by their AB weight instead of a flat CV[g]', () => {
  // 16*12 = 192 and round(9.6*12) = 115 under v38's CV = [3.2, 6.4, 9.6, 16].
  assert.strictEqual(C.cardVal(3, 'hp'), 192, 'a Legendary HP card should be 16*12');
  assert.strictEqual(C.cardVal(2, 'hp'), 115, 'a Rare HP card should be round(9.6*12)');
  // v38 cut the crit-damage weight (AB.cdm 1.5 -> 0.7), so a Legendary CDM card is +11% and now
  // sits BELOW a Legendary STR card's +16: a percentage card is worth fewer points than a flat
  // one, and crit damage is no longer the shortcut it was. Pinned as a deliberate relation.
  assert.strictEqual(C.cardVal(3, 'cdm'), 11, 'a Legendary CDM card is +11%');
  assert.ok(C.cardVal(3, 'cdm') < C.cardVal(3, 'str'), 'the cdm weight must not out-value a flat stat card');
  // Percentage stats deliberately show SMALLER numbers than flat stats: +4% ATK is worth far
  // more than +5 STR at endgame because it multiplies the whole attack total. Pin the ratio
  // so the relationship is intentional rather than accidental.
  for (const s of ['crit', 'aspd', 'flee', 'atk'])
    assert.ok(C.cardVal(3, s) < C.cardVal(3, 'hp'), `${s} is a percentage and should not out-number HP`);
  // but they must still land on at least 1 point rather than rounding to nothing
  for (const s of ['crit', 'aspd', 'flee', 'atk', 'cdm'])
    for (let g = 2; g < 4; g++)
      assert.ok(C.cardVal(g, s) >= 1, `${s} card grade ${g} rounded to 0`);
});

t('cardVal never returns 0 or NaN for junk input', () => {
  for (const [g, s] of [[undefined, undefined], [9, 'str'], [0, 'nope'], [null, null]])
    assert.ok(Number.isFinite(C.cardVal(g, s)) && C.cardVal(g, s) >= 1, `cardVal(${g},${s}) = ${C.cardVal(g, s)}`);
});

t('every stat a card can roll has a CFIT entry (otherwise it can never be socketed)', () => {
  const groups = new Set(['weapon', 'armor', 'head', 'acc']);
  for (const s of C.AFF) {
    assert.ok(C.CFIT[s], `no CFIT entry for "${s}" - such a card could not be socketed anywhere`);
    assert.ok(groups.has(C.CFIT[s]), `CFIT["${s}"] = "${C.CFIT[s]}" is not a real equipment group`);
  }
});

t('the wider stats are spread across equipment groups, not all on one slot', () => {
  const groups = {};
  for (const s of C.AFF) (groups[C.CFIT[s]] = groups[C.CFIT[s]] || []).push(s);
  assert.ok(Object.keys(groups).length >= 3, 'cards only fit one or two equipment groups: ' + JSON.stringify(groups));
  for (const w of ['hp', 'atk', 'crit', 'aspd', 'flee', 'cdm'])
    assert.ok(groups[C.CFIT[w]].length >= 1, w + ' ungrouped');
  console.log('       ' + Object.entries(groups).map(([g, s]) => g + ': ' + s.join('/')).join('  |  '));
});

t('every equipment group has at least one card stat that fits it', () => {
  const fitted = new Set(C.AFF.map(s => C.CFIT[s]));
  for (const g of ['weapon', 'armor', 'head', 'acc'])
    assert.ok(fitted.has(g), `no card can ever be socketed into ${g}`);
});

t('the load() repair is stat-aware, not the old flat CV[g]', () => {
  const hp = { g: 3, stat: 'hp' }, str = { g: 3, stat: 'str' };
  C.cardVal2(hp); C.cardVal2(str);
  assert.strictEqual(hp.v, 192, 'repair flattened the HP card back to CV[g]');
  assert.strictEqual(str.v, 16, 'repair changed a base-stat card');
  const junk = { g: 3 };
  C.cardVal2(junk);
  assert.ok(Number.isFinite(junk.v) && junk.v >= 1, 'a card with no stat crashed the repair');
});

t('a Legendary card is always worth more than a Common one of the same stat', () => {
  for (const s of C.AFF)
    assert.ok(C.cardVal(3, s) > C.cardVal(0, s), `${s}: g3 ${C.cardVal(3, s)} vs g0 ${C.cardVal(0, s)}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
