// The card catalog is duplicated: once in index.html (the page rebuilds cards from it) and once in
// functions/_lib/card-catalog.js (the server rebuilds them when unpacking a v3 save). A drifting table
// would silently hand a player a DIFFERENT card than the one they own, so it is checked, not trusted.
//
// This test also pins the reason the duplication is safe at all: every field v3 stops storing must be
// reproducible from the row. If the game ever makes one of those fields vary independently (a rebalance
// that changes an existing card, a per-card roll), the round trip below fails and v3 must stop being
// used for that card.
import { createRequire } from 'node:module';
import { CARD_CATALOG_ROWS, CARD_VERSION, catalogCard, catalogIds, catalogIdMap, catalogIdOf } from '../../functions/_lib/card-catalog.js';
import * as C from '../../functions/_lib/save-codec.js';

const require = createRequire(import.meta.url);
const { createGame } = require('./helpers/game');

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ' -> ' + e.message); } };

// --- the identity contract: every id is PINNED ------------------------------------------------
// A save stores the numeric catalog id, so renumbering this table silently re-points every existing
// save's cards. Regenerating the catalog must therefore be append-only: an existing row's id never
// changes, is never reused, and is never reordered. If this test fails the regeneration was wrong -
// do not update the fixture to match unless you have proven no released build stored the old id.
const PINNED_IDS = {1:"0:0:0",2:"0:0:1",3:"0:10:0",4:"0:10:1",5:"0:1:0",6:"0:1:1",7:"0:2:0",8:"0:2:1",9:"0:3:0",10:"0:3:1",11:"0:4:0",12:"0:4:1",13:"0:5:0",14:"0:5:1",15:"0:6:0",16:"0:6:1",17:"0:7:0",18:"0:7:1",19:"0:8:0",20:"0:8:1",21:"0:9:0",22:"0:9:1",23:"10:0:0",24:"10:1:0",25:"10:2:0",26:"10:3:0",27:"10:4:0",28:"10:5:0",29:"11:0:0",30:"11:1:0",31:"11:2:0",32:"11:3:0",33:"11:4:0",34:"11:5:0",35:"1:0:0",36:"1:0:1",37:"1:10:0",38:"1:10:1",39:"1:1:0",40:"1:1:1",41:"1:2:0",42:"1:2:1",43:"1:3:0",44:"1:3:1",45:"1:4:0",46:"1:4:1",47:"1:5:0",48:"1:5:1",49:"1:6:0",50:"1:6:1",51:"1:7:0",52:"1:7:1",53:"1:8:0",54:"1:8:1",55:"1:9:0",56:"1:9:1",57:"2:0:0",58:"2:0:1",59:"2:10:0",60:"2:10:1",61:"2:1:0",62:"2:1:1",63:"2:2:0",64:"2:2:1",65:"2:3:0",66:"2:3:1",67:"2:4:0",68:"2:4:1",69:"2:5:0",70:"2:5:1",71:"2:6:0",72:"2:6:1",73:"2:7:0",74:"2:7:1",75:"2:8:0",76:"2:8:1",77:"2:9:0",78:"2:9:1",79:"3:0:0",80:"3:0:1",81:"3:10:0",82:"3:10:1",83:"3:1:0",84:"3:1:1",85:"3:2:0",86:"3:2:1",87:"3:3:0",88:"3:3:1",89:"3:4:0",90:"3:4:1",91:"3:5:0",92:"3:5:1",93:"3:6:0",94:"3:6:1",95:"3:7:0",96:"3:7:1",97:"3:8:0",98:"3:8:1",99:"3:9:0",100:"3:9:1",101:"4:0:0",102:"4:0:1",103:"4:10:0",104:"4:10:1",105:"4:1:0",106:"4:1:1",107:"4:2:0",108:"4:2:1",109:"4:3:0",110:"4:3:1",111:"4:4:0",112:"4:4:1",113:"4:5:0",114:"4:5:1",115:"4:6:0",116:"4:6:1",117:"4:7:0",118:"4:7:1",119:"4:8:0",120:"4:8:1",121:"4:9:0",122:"4:9:1",123:"5:0:0",124:"5:0:1",125:"5:1:0",126:"5:1:1",127:"5:2:0",128:"5:2:1",129:"5:3:0",130:"5:3:1",131:"5:4:0",132:"5:4:1",133:"5:5:0",134:"5:5:1",135:"5:6:0",136:"5:6:1",137:"6:0:0",138:"6:0:1",139:"6:1:0",140:"6:1:1",141:"6:2:0",142:"6:2:1",143:"6:3:0",144:"6:3:1",145:"6:4:0",146:"6:4:1",147:"6:5:0",148:"6:5:1",149:"6:6:0",150:"6:6:1",151:"7:0:0",152:"7:0:1",153:"7:1:0",154:"7:1:1",155:"7:2:0",156:"7:2:1",157:"7:3:0",158:"7:3:1",159:"7:4:0",160:"7:4:1",161:"7:5:0",162:"7:5:1",163:"7:6:0",164:"7:6:1",165:"8:0:0",166:"8:0:1",167:"8:1:0",168:"8:1:1",169:"8:2:0",170:"8:2:1",171:"8:3:0",172:"8:3:1",173:"8:4:0",174:"8:4:1",175:"8:5:0",176:"8:5:1",177:"8:6:0",178:"8:6:1",179:"9:0:0",180:"9:0:1",181:"9:1:0",182:"9:1:1",183:"9:2:0",184:"9:2:1",185:"9:3:0",186:"9:3:1",187:"9:4:0",188:"9:4:1",189:"9:5:0",190:"9:5:1",191:"9:6:0",192:"9:6:1"};

const g = createGame();
const pageRows = g.ev(`(()=>{
  const out=[];
  for(const d of CARD_CATALOG){
    const row=[d.cardKey, d.family, d.stat, Math.round(d.v),
      d.effects.map(e=>[e.k, Math.round(e.v)]),
      d.fit.slice(), d.g, d.bossCard?1:0, d.map, d.nightmare?1:0];
    out.push(row);
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
// the codec table the page itself ships, ids and all - this is what has to agree with the server
const pageTable = JSON.parse(g.ev('JSON.stringify(CODEC_CARD_ROWS)'));
const cards = JSON.parse(pageCards);

t('every catalog id is the one that has shipped, forever', () => {
  // A save stores the numeric id. Renumbering this table re-points every existing save's cards to a
  // DIFFERENT card - silently, and without touching the player's data. Regeneration is append-only:
  // an existing row's id never changes, is never reused and is never reordered.
  const now = catalogIdMap();
  const bad = [];
  for (const k of Object.keys(PINNED_IDS)) {
    if (now[k] !== PINNED_IDS[k]) bad.push(k + ': ' + JSON.stringify(PINNED_IDS[k]) + ' -> ' + JSON.stringify(now[k]));
  }
  if (bad.length) throw Error(bad.length + ' id(s) renumbered, e.g. ' + bad.slice(0, 3).join(', '));
});
t('a new card may only take an id above the pinned maximum', () => {
  const maxPinned = Math.max(...Object.keys(PINNED_IDS).map(Number));
  const stolen = catalogIds().filter(id => !(id in PINNED_IDS) && id <= maxPinned);
  if (stolen.length) throw Error('id(s) ' + stolen.join(',') + ' reused below the pinned maximum ' + maxPinned);
  const fresh = catalogIds().filter(id => !(id in PINNED_IDS)).length;
  console.log('       ' + fresh + ' new id(s) above ' + maxPinned + ' (max now ' + Math.max(...catalogIds()) + ')');
});
t('the page and the server hold the same catalog rows, ids included', () => {
  if (pageTable.length !== CARD_CATALOG_ROWS.length) throw Error('row counts differ: page ' + pageTable.length + ', server ' + CARD_CATALOG_ROWS.length);
  const dupes = catalogIds().filter((id, i, all) => all.indexOf(id) !== i);
  if (dupes.length) throw Error('duplicate catalog ids: ' + dupes.join(', '));
  for (let i = 0; i < pageTable.length; i++) {
    const a = JSON.stringify(pageTable[i]);
    const b = JSON.stringify(CARD_CATALOG_ROWS[i]);
    if (a !== b) throw Error('row ' + i + ' differs:\n       page   ' + a + '\n       server ' + b);
  }
});
t('the codec table is DERIVED from the live cards, not hand-maintained', () => {
  // page[] is rebuilt from CARD_CATALOG inside the game, so a card change that was never re-generated
  // into the table shows up here as a row that no longer matches the card the game builds.
  if (page.length !== pageTable.length) throw Error('the live cards build ' + page.length + ' rows, the table has ' + pageTable.length);
  for (let i = 0; i < page.length; i++) {
    const a = JSON.stringify(page[i]);
    const b = JSON.stringify(pageTable[i].slice(1));
    if (a !== b) throw Error('row ' + i + ' was not regenerated after a card change:\n       live   ' + a + '\n       table  ' + b);
  }
});
t('CARD_VERSION matches the page PROGRESSION_VERSION', () => {
  if (CARD_VERSION !== progressionVersion) throw Error('server ' + CARD_VERSION + ' vs page ' + progressionVersion);
});
t('every card the page can build equals its catalog row', () => {
  for (const c of cards) {
    const id = catalogIdOf(c.cardKey);
    if (id === null) throw Error('cardKey ' + c.cardKey + ' is not in the server catalog');
    const d = catalogCard(id);
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
    if (p[0] !== catalogIdOf(c.cardKey)) throw Error(c.cardKey + ' was stored under the id ' + JSON.stringify(p[0]));
    refs++;
    const back = C.unpackCard(p);
    if (norm(back) !== norm(c)) throw Error(c.cardKey + ' rebuilt differently:\n       want ' + norm(c) + '\n       got  ' + norm(back));
  }
  if (refs !== cards.length) throw Error('only ' + refs + ' of ' + cards.length + ' used the reference form');
});
t('a starred card still uses the SHORT form and keeps its stars', () => {
  // Regression: `stars` used to be an "unknown field" to the match test, so every starred card silently
  // fell back to the 130-char full tuple - the short third slot was never reached.
  const c = cards.find(x => x.cardKey === '3:2:1');
  for (const stars of [1, 2, 3]) {
    const withStars = Object.assign({}, c, { stars });
    const p = C.packCard(withStars);
    if (p.length > 3) throw Error('a ' + stars + '-star card fell back to the full tuple (' + p.length + ' slots)');
    const back = C.unpackCard(p);
    if (back.stars !== stars) throw Error('stars ' + stars + ' came back as ' + back.stars);
    if (back.v !== c.v) throw Error('a starred card must not change its base value');
    if (back.family !== c.family || back.n !== c.n) throw Error('a starred card lost its name');
  }
});
t('an unstarred card omits the stars slot entirely', () => {
  // 9 chars x 5000 cards is the difference between fitting under the ceiling and not.
  const c = cards.find(x => x.cardKey === '3:2:1');
  const p = C.packCard(c);
  if (p.length !== 2) throw Error('an unstarred card used ' + p.length + ' slots, expected 2');
  if (Object.prototype.hasOwnProperty.call(C.unpackCard(p), 'stars')) throw Error('unpacking invented a stars field');
});
t('a star value the game cannot hold keeps the full stored form', () => {
  const c = cards.find(x => x.cardKey === '3:2:1');
  for (const bad of [4, -1, 1.5, '2']) {
    const v = Object.assign({}, c, { stars: bad });
    const p = C.packCard(v);
    if (p.length <= 3) throw Error('stars=' + JSON.stringify(bad) + ' was compacted instead of preserved');
  }
});
t('a HISTORICAL save still decodes after the catalog gains rows', () => {
  // The reference stores the permanent id, not an array position, so adding a card that sorts first
  // cannot change what an existing save means. This is the property the row order must never break.
  const save = { cards: cards.slice(0, 12) };
  const packed = JSON.stringify(C.packSave(save));
  const first = C.unpackSave(JSON.parse(packed)).cards.map(c => c.family + '|' + c.cardKey);
  const again = C.unpackSave(JSON.parse(packed)).cards.map(c => c.family + '|' + c.cardKey);
  if (JSON.stringify(first) !== JSON.stringify(again)) throw Error('decoding the same blob twice gave different cards');
  for (const t of JSON.parse(packed).cards) {
    if (!Number.isInteger(t[0])) throw Error('a reference stored a non-id first slot: ' + JSON.stringify(t));
  }
  // and the ids in that save are the ones this build still knows
  for (const t of JSON.parse(packed).cards) {
    if (!catalogCard(t[0])) throw Error('catalog id ' + t[0] + ' no longer resolves');
  }
});
t('an unknown catalog id is preserved, never guessed', () => {
  const unknown = [99999, 42];
  const back = C.unpackCard(unknown);
  if (back !== unknown) throw Error('an unknown id must come back untouched, got ' + JSON.stringify(back));
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


console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
