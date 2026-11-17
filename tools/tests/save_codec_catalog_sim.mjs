// The card catalog is duplicated: once in index.html (the page rebuilds cards from it) and once in
// functions/_lib/card-catalog.js (the server rebuilds them when unpacking a v3 save). A drifting table
// would silently hand a player a DIFFERENT card than the one they own, so it is checked, not trusted.
//
// This test also pins the reason the duplication is safe at all: every field v3 stops storing must be
// reproducible from the row. If the game ever makes one of those fields vary independently (a rebalance
// that changes an existing card, a per-card roll), the round trip below fails and v3 must stop being
// used for that card.
import { createRequire } from 'node:module';
import { CARD_CATALOG_ROWS, CARD_VERSION, catalogCard, catalogIndexOf } from '../../functions/_lib/card-catalog.js';
import * as C from '../../functions/_lib/save-codec.js';

const require = createRequire(import.meta.url);
const { createGame } = require('./helpers/game');

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ' -> ' + e.message); } };

const g = createGame();
const pageRows = g.ev(`(()=>{
  const out=[];
  for(const d of CARD_CATALOG){
    out.push([d.cardKey, d.family, d.stat, Math.round(d.v),
      d.effects.map(e=>[e.k, Math.round(e.v)]),
      d.fit.slice(), d.g, d.bossCard?1:0, d.map, d.nightmare?1:0]);
  }
  out.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  return JSON.stringify(out);
})()`);
// Every card the page can build, for the round trips below.
const pageCards = g.ev(`(()=>{
  const out=[];
  for(const d of CARD_CATALOG){ out.push(newCard(d)); }
  return JSON.stringify(out);
})()`);
const progressionVersion = g.ev('PROGRESSION_VERSION');
g.close();

const page = JSON.parse(pageRows);
const cards = JSON.parse(pageCards);

t('the page and the server hold the same catalog rows', () => {
  if (page.length !== CARD_CATALOG_ROWS.length) throw Error('row counts differ: page ' + page.length + ', server ' + CARD_CATALOG_ROWS.length);
  for (let i = 0; i < page.length; i++) {
    const a = JSON.stringify(page[i]), b = JSON.stringify(CARD_CATALOG_ROWS[i]);
    if (a !== b) throw Error('row ' + i + ' differs:\n       page   ' + a + '\n       server ' + b);
  }
});
t('CARD_VERSION matches the page PROGRESSION_VERSION', () => {
  if (CARD_VERSION !== progressionVersion) throw Error('server ' + CARD_VERSION + ' vs page ' + progressionVersion);
});
t('every card the page can build equals its catalog row', () => {
  for (const c of cards) {
    const i = catalogIndexOf(c.cardKey);
    if (i < 0) throw Error('cardKey ' + c.cardKey + ' is not in the server catalog');
    const d = catalogCard(i);
    for (const k of ['card', 'cardVersion', 'cardKey', 'family', 'n', 'stat', 'v', 'g', 'bossCard', 'map', 'nightmare']) {
      if (JSON.stringify(c[k]) !== JSON.stringify(d[k])) throw Error(c.cardKey + '.' + k + ': page ' + JSON.stringify(c[k]) + ', table ' + JSON.stringify(d[k]));
    }
    if (JSON.stringify(c.fit) !== JSON.stringify(d.fit)) throw Error(c.cardKey + '.fit differs');
    if (JSON.stringify(c.effects) !== JSON.stringify(d.effects)) throw Error(c.cardKey + '.effects differs');
  }
});
t('every catalog card packs to a v3 reference and rebuilds exactly', () => {
  const norm = o => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v))
    ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v);
  let refs = 0;
  for (const c of cards) {
    const p = C.packCard(c);
    if (!Array.isArray(p) || p.length > 3) throw Error(c.cardKey + ' was not stored as a v3 reference');
    refs++;
    const back = C.unpackCard(p);
    if (norm(back) !== norm(c)) throw Error(c.cardKey + ' rebuilt differently:\n       want ' + norm(c) + '\n       got  ' + norm(back));
  }
  if (refs !== cards.length) throw Error('only ' + refs + ' of ' + cards.length + ' used the reference form');
});
t('a starred card keeps its stars', () => {
  const c = cards.find(x => x.cardKey === '3:2:1');
  for (const stars of [1, 2, 3]) {
    const withStars = Object.assign({}, c, { stars });
    const back = C.unpackCard(C.packCard(withStars));
    if (back.stars !== stars) throw Error('stars ' + stars + ' came back as ' + back.stars);
    if (back.v !== c.v) throw Error('a starred card must not change its base value');
  }
});
t('a card that is NOT its catalog row keeps the full tuple', () => {
  const c = cards.find(x => x.cardKey === '3:2:1');
  const variants = [
    ['a changed value', Object.assign({}, c, { v: c.v + 1 })],
    ['a changed name', Object.assign({}, c, { n: c.n + ' (edited)' })],
    ['an unknown extra field', Object.assign({}, c, { somethingNew: true })],
    ['an unknown cardKey', Object.assign({}, c, { cardKey: '99:99:0' })],
    ['the wrong progression version', Object.assign({}, c, { cardVersion: 999 })],
  ];
  for (const [why, v] of variants) {
    const p = C.packCard(v);
    if (!Array.isArray(p) || p.length <= 3) throw Error(why + ' was collapsed into a catalog reference - it must be stored in full');
    const norm = o => JSON.stringify(o, (k, x) => (x && typeof x === 'object' && !Array.isArray(x))
      ? Object.fromEntries(Object.keys(x).sort().map(y => [y, x[y]])) : x);
    if (norm(C.unpackCard(p)) !== norm(v)) throw Error(why + ' did not survive its own round trip');
  }
});
t('an out-of-range catalog index is handed back rather than invented', () => {
  const bogus = [99999, 1, '\u0000'];
  const back = C.unpackCard(bogus);
  if (back !== bogus) throw Error('an unknown index must come back untouched, got ' + JSON.stringify(back));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
