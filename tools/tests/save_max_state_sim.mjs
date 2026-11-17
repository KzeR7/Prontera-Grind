// v414: which accounts can actually sync, and which still cannot?
//
// The review asked for full game states - equipment, loadouts, every collection - not just the one
// reported account. Saves are built from the game's own genGear()/newCard()/cardDefinition(), never
// hand-written shapes: a hand-written fixture is exactly how the first codec passed its own tests
// while being wrong about real cards.
//
// THE CARD LIMIT IS NOT A TOTAL, AND AN EARLIER VERSION OF THIS FILE GOT IT WRONG.
// index.html:2793 says "loose cards are the second unbounded list in a save (S.cards)". CARDMAX=1000
// gates ACQUIRING a loose card (cardStorageFull() only reads S.cards). Cards socketed into items live
// in item.cards and are NOT counted by it - a player can socket cards, then earn another 1000 loose
// ones, and unsock() pushes them back into S.cards. So "loose + socketed" is NOT bounded by 1000.
//
// That made the reachable worst case 719,982 chars against a 307,200 ceiling. Codec v3 closes it: a
// modern card is stored as a catalog reference (the page already rebuilds every card field from
// CARD_CATALOG on load) and a fish timestamp as a delta, taking that worst case to ~248,000 chars.
// Nothing here deletes a player's cards and no ownership limit was added: the codec is a transport
// encoding and may not change what a player owns. The cases below are asserted to FIT, so a future
// change that reopens the gap fails here instead of failing in production.
import { createRequire } from 'node:module';
import { SAVE_BYTES_MAX } from '../../functions/_lib/validate.js';
import * as C from '../../functions/_lib/save-codec.js';

const require = createRequire(import.meta.url);
const { createGame } = require('./helpers/game');

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ' -> ' + e.message); } };
const kb = n => Math.round(n / 1024) + ' KB';
// Compare structurally: key ORDER is not part of a save, and JSON.stringify equality is the trap that
// the sameSave bug fell into.
const norm = o => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v))
  ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v);

const g = createGame();
const build = src => JSON.parse(g.ev(`(()=>{ S=load(); ${src}; return JSON.stringify(S) })()`));
// `socketed` = how many ITEMS carry cards (one card each unless `perItem` says otherwise), so
// socketed * perItem is the number of cards living inside items. `loose` cards stay in S.cards.
const state = ({ loose = 0, socketed = 0, fish = 0, equip = 0, perItem = 1 }) => build(`
  const sl=['weapon','armor','head','off','leg','acc'];
  const pool=[];for(let i=0;i<1000;i++)pool.push(newCard(cardDefinition(i%10,i%4,i%2===0)));
  S.cards=pool.slice(0,${loose}).map((c,j)=>{const d=JSON.parse(JSON.stringify(c));d.id=3000000+j;return d});
  S.inv=[];
  for(let i=0;i<1000;i++){
    const it=genGear({k:sl[i%6],n:'Rare Plate Armor',quality:1},145,i%4,false,undefined,i%10,10);
    it.cards=[];
    if(i<${socketed}){ it.slots=${perItem};
      for(let k=0;k<${perItem};k++){
        // a real socketed card is a DISTINCT card with its own id (newCard() mints one); cloning a pool
        // card would repeat ids, which the game never does and which would understate the size.
        const c=JSON.parse(JSON.stringify(pool[(i*${perItem}+k)%1000]));
        c.id=2000000+i*${perItem}+k;
        it.cards.push(c);
      } }
    S.inv.push(it);
  }
  S.eq={};
  for(let i=0;i<${equip};i++){
    const it=genGear({k:sl[i%6],n:'Equipped',quality:1},145,i%4,false,undefined,i%10,10);
    it.slots=4; it.cards=[];
    for(let k=0;k<4;k++)it.cards.push(JSON.parse(JSON.stringify(pool[(i*4+k)%1000])));
    S.eq[['weapon','armor','head','off','leg','acc1','acc2'][i]]=it;
  }
  S.fishing.bag=[];
  for(let i=0;i<${fish};i++)S.fishing.bag.push({id:'f'+i,sp:'Tuna Sovereign',w:1+(i%3000),
    mut:i%3?null:'Shiny',at:i,perfect:i%2===0,lock:i%7===0});
`);

const fits = S => { const packed = JSON.stringify(C.packSave(S)); return { packed, n: packed.length }; };

// --- states that DO fit -----------------------------------------------------------------------------
// `socketed` is the number of ITEMS carrying one card each, so socketed === number of cards socketed.
// These are reachable accounts, but they are NOT the largest reachable account: see the refused block.
const fits_cases = [
  ['1000 items, 1000 loose cards, 1000 fish',        { loose: 1000, socketed: 0,   fish: 1000 }],
  ['1000 items, 0 loose, 1000 socketed, 1000 fish',  { loose: 0,    socketed: 1000, fish: 1000 }],
  ['1000 items + 7 fully-carded worn items, 1000 loose cards, 1000 fish',
                                                      { loose: 1000, socketed: 0,   fish: 1000, equip: 7 }],
  ['1000 items, no cards, 1000 fish',                 { loose: 0,    socketed: 0,   fish: 1000 }],
];

console.log('states that fit (BAGMAX 1000 items, CARDMAX 1000 LOOSE cards, bag 1000)\n');
for (const [label, spec] of fits_cases) {
  const S = state(spec);
  t(label + ' fits under the 300 KB ceiling', () => {
    const { n } = fits(S);
    if (n > SAVE_BYTES_MAX) throw Error(kb(n) + ' > ' + kb(SAVE_BYTES_MAX) + ', over by ' + kb(n - SAVE_BYTES_MAX));
    console.log('       ' + kb(n) + ', ' + kb(SAVE_BYTES_MAX - n) + ' spare');
  });
  t(label + ' survives a round trip unchanged', () => {
    const back = C.unpackSave(JSON.parse(JSON.stringify(C.packSave(S))));
    for (const k of ['inv', 'cards', 'eq', 'fishing']) {
      if (norm(S[k]) !== norm(back[k])) throw Error(k + ' differs after a round trip');
    }
  });
}

// --- socketed cards did NOT count against CARDMAX, so these were the states that could not sync ---
// Codec v3 is what makes them fit (cards stored as catalog references, fish timestamps as deltas).
// They stay in the suite as the hardest reachable cases: if they ever stop fitting, that is the
// regression that matters, so they are asserted to fit rather than assumed to.
const hard_cases = [
  ['1000 items x1 socketed card + 1000 loose cards + 1000 fish', { loose: 1000, socketed: 1000, fish: 1000 }],
  ['1000 items x1 socketed card + 1000 loose cards',             { loose: 1000, socketed: 1000, fish: 0 }],
];

console.log('\nreachable states that used to be refused\n');
for (const [label, spec] of hard_cases) {
  const S = state(spec);
  t(label + ' now fits under the ceiling', () => {
    const n = fits(S).n;
    if (n > SAVE_BYTES_MAX) throw Error(kb(n) + ' > ' + kb(SAVE_BYTES_MAX) + ', over by ' + kb(n - SAVE_BYTES_MAX));
    console.log('       ' + kb(n) + ', ' + kb(SAVE_BYTES_MAX - n) + ' spare');
  });
  t(label + ' round-trips exactly', () => {
    const back = C.unpackSave(JSON.parse(JSON.stringify(C.packSave(S))));
    for (const k of ['inv', 'cards', 'fishing']) {
      if (norm(S[k]) !== norm(back[k])) throw Error(k + ' differs after a round trip');
    }
  });
}

// --- the worst REACHABLE state, with real product ids ----------------------------------------------
// 1000 items x4 socketed + 1000 loose + 1000 fish = 5000 real cards, each with its own 17-char
// Date.now()+Math.random() id. This used to be over the ceiling (703 KB under v2, ~311 KB under the
// first v3). Two changes closed it, neither of which touches a player's cards or ids:
//
//   1. the absent-stars slot is omitted - an unstarred card is [catalogId, id], two slots not three;
//   2. a starred card no longer falls back to the 130-char full tuple (see save_codec_catalog_sim).
//
// The catalog id is a small frozen integer rather than the quoted cardKey ("9:6:1"): at 5000 cards
// that is ~20,000 chars, which is the difference between 311 KB and fitting.
//
// A per-save id table was measured twice and does NOT help - do not reintroduce it.
const THIS_FIXTURE_NOTE = 'the ids below are the fixture\'s own, minted by newCard() - real product ids';

// Distinct Date.now()+Math.random()-shaped ids, which is what a real save holds.
const realId = i => Number('1794884' + String(100000 + i * 7919).slice(-6) + '.' + String(1000 + i * 13).slice(-4));

t('the 5000-card worst case fits, with real ids', () => {
  const S = state({ loose: 1000, socketed: 1000, fish: 1000, perItem: 4 });
  let k = 0;
  for (const c of S.cards) c.id = realId(k++);
  for (const it of S.inv) { it.id = realId(k++); for (const c of it.cards || []) c.id = realId(k++); }
  const n = fits(S).n;
  console.log('       5000 real cards: ' + kb(n) + ' (' + n + ' chars)');
  if (n > SAVE_BYTES_MAX) throw Error(kb(n) + ' is over by ' + kb(n - SAVE_BYTES_MAX));
});
t('the 5000-card worst case fits WITH STARRED CARDS too', () => {
  // Regression: `stars` used to disqualify a card from the catalog form, so every starred card fell
  // back to the 130-char tuple and this account was ~396 KB.
  const S = state({ loose: 1000, socketed: 1000, fish: 1000, perItem: 4 });
  let k = 0;
  for (const c of S.cards) { c.id = realId(k++); if (k % 2) c.stars = 1 + (k % 3); }
  for (const it of S.inv) { it.id = realId(k++); for (const c of it.cards || []) { c.id = realId(k++); if (k % 2) c.stars = 1 + (k % 3); } }
  const n = fits(S).n;
  console.log('       5000 cards, every other starred: ' + kb(n) + ' (' + n + ' chars)');
  if (n > SAVE_BYTES_MAX) throw Error(kb(n) + ' is over by ' + kb(n - SAVE_BYTES_MAX));
  const back = C.unpackSave(JSON.parse(JSON.stringify(C.packSave(S))));
  if (norm(S.cards) !== norm(back.cards)) throw Error('starred cards differ after a round trip');
});
t('the 5000-card worst case still round-trips exactly', () => {
  // whatever the size verdict, the codec must not lose or alter a single card
  const S = state({ loose: 1000, socketed: 1000, fish: 1000, perItem: 4 });
  const back = C.unpackSave(JSON.parse(JSON.stringify(C.packSave(S))));
  for (const k of ['inv', 'cards', 'fishing']) {
    if (norm(S[k]) !== norm(back[k])) throw Error(k + ' differs after a round trip');
  }
});

// --- a stored row written by an older codec still loads --------------------------------------------
// The v2 tuples below are produced the way the REAL v2 encoder produced them, not hand-written: that
// encoder wrote `mut: null` as literal null and used NUL only for a field that was ABSENT. An earlier
// version of this fixture wrote NUL for null, so it tested a format that never shipped.
t('a v2 row still loads exactly, byte for byte as the v2 encoder wrote it', () => {
  const base = state({ loose: 5, socketed: 3, fish: 20 });
  // v2 fish tuple: [id, sp, w, mut, at, perfect, lock] with NUL for an absent field
  const NUL = '\u0000';
  const v2fish = f => [f.id, f.sp, f.w, f.mut === undefined ? NUL : f.mut, f.at,
    f.perfect === undefined ? NUL : (f.perfect ? 1 : 0),
    f.lock === undefined ? NUL : (f.lock ? 1 : 0)];
  // v2 card tuple: the BCARD layout, with `n` as NUL when it follows the naming rule
  const BCARD = C.CODE_LAYOUT.BCARD;
  const v2card = c => {
    const t = BCARD.map(k => (c[k] === undefined ? NUL : c[k]));
    t[7] = Array.isArray(c.effects) ? c.effects.map(e => [e.k, e.v]) : NUL;
    if (c.n === (c.nightmare === true ? 'Nightmare ' + c.family : c.family)) t[BCARD.indexOf('n')] = NUL;
    return t;
  };
  const v2 = {
    __v: 2,
    cards: base.cards.map(v2card),
    fishing: { bagTier: base.fishing.bagTier, bag: base.fishing.bag.map(v2fish) },
  };
  const back = C.unpackSave(JSON.parse(JSON.stringify(v2)));
  for (let i = 0; i < base.fishing.bag.length; i++) {
    const want = base.fishing.bag[i], got = back.fishing.bag[i];
    for (const k of ['id', 'sp', 'w', 'mut', 'at', 'perfect', 'lock']) {
      if (JSON.stringify(want[k]) !== JSON.stringify(got[k])) {
        throw Error('v2 fish[' + i + '].' + k + ': ' + JSON.stringify(want[k]) + ' -> ' + JSON.stringify(got[k]));
      }
    }
  }
  for (let i = 0; i < base.cards.length; i++) {
    const want = base.cards[i], got = back.cards[i];
    for (const k of ['cardKey', 'family', 'n', 'stat', 'v', 'g', 'bossCard', 'map', 'nightmare', 'id']) {
      if (JSON.stringify(want[k]) !== JSON.stringify(got[k])) {
        throw Error('v2 card[' + i + '].' + k + ': ' + JSON.stringify(want[k]) + ' -> ' + JSON.stringify(got[k]));
      }
    }
  }
});
t('a fish that never had a mut field does not gain one', () => {
  // The bug this pins: an earlier v3 branch read NUL as "null", inventing a field the save lacked.
  const NUL = '\u0000';
  const back = C.unpackFish(['a', 'Magikarp', 2, NUL, 1712345678901, NUL, NUL], 0);
  if ('mut' in back) throw Error('invented mut=' + JSON.stringify(back.mut) + ' on a fish that had none');
});

// --- socketed cards: the collection that used to be stored uncompacted -------------------------------
const socketed = state({ loose: 0, socketed: 250, fish: 0 });
t('a socketed card gets the same tuple a loose one does', () => {
  const packed = C.packSave(socketed);
  const inBag = JSON.stringify(packed.cards);
  // A packed item is a TUPLE (a plain array), so it has no `.cards` property - the socketed list lives
  // at BITEM index 8. Reading `it.cards` off a packed item is the mistake this asserts against.
  const CARDS_AT = C.CODE_LAYOUT.BITEM.indexOf('cards');
  const carded = packed.inv.find(it => Array.isArray(it[CARDS_AT]) && it[CARDS_AT].length);
  if (!carded) throw Error('no packed item carries a socketed card list at BITEM[' + CARDS_AT + ']');
  if (carded[CARDS_AT].some(c => !Array.isArray(c))) throw Error('a socketed card was not compacted');
  if (inBag !== '[]') throw Error('unexpected loose cards in this fixture');
  // The two must use the SAME representation. Comparing byte COUNTS is wrong: two different cards
  // differ by the length of their generated id, so that assertion was flaky, not a codec bug.
  const loose = state({ loose: 1, socketed: 0, fish: 0 });
  const looseTuple = C.packSave(loose).cards[0];
  const gearTuple = carded[CARDS_AT][0];
  if (!Array.isArray(looseTuple) || !Array.isArray(gearTuple)) throw Error('one of them is not a tuple');
  if (looseTuple.length !== gearTuple.length) throw Error('different tuple widths: ' + looseTuple.length + ' vs ' + gearTuple.length);
  // v3: both are catalog references, so neither carries the derived text at all
  if (looseTuple.length !== gearTuple.length) throw Error('socketed and loose cards use different widths');
  if (gearTuple.length > 3) throw Error('a socketed catalog card was stored in full instead of as a reference');
});
t('every socketed card still has a name after a round trip', () => {
  const back = C.unpackSave(JSON.parse(JSON.stringify(C.packSave(socketed))));
  for (const it of back.inv) for (const c of it.cards) {
    if (!c || typeof c.n !== 'string' || !c.n) throw Error('a socketed card lost its name: ' + JSON.stringify(c));
    if (!c.cardKey) throw Error('a socketed card lost its cardKey');
  }
});
t('an unknown field on a socketed card survives', () => {
  const item = { k: 'weapon', cards: [{ id: 1, card: 1, family: 'X', n: 'X', nightmare: false, myPlugin: 'keep me' }] };
  const back = C.unpackItem(C.packItem(item));
  if (back.cards[0].myPlugin !== 'keep me') throw Error('the unknown field was dropped');
});
t('a socketed card that does not follow the naming rule keeps its stored name', () => {
  const odd = { id: 1, card: 1, family: 'Poring Card', n: 'A Name The Rule Would Never Produce', nightmare: false };
  const back = C.unpackItem(C.packItem({ k: 'weapon', cards: [odd] }));
  if (back.cards[0].n !== odd.n) throw Error('the codec renamed a card: ' + back.cards[0].n);
});

// --- what the change is worth, in one line -----------------------------------------------------------
const CARDS_AT = C.CODE_LAYOUT.BITEM.indexOf('cards');
const socketBytes = save => save.inv.reduce((n, it) => {
  const list = Array.isArray(it) ? it[CARDS_AT] : it.cards;   // packed tuples vs plain objects
  return n + (Array.isArray(list) ? list.reduce((m, c) => m + JSON.stringify(c).length, 0) : 0);
}, 0);
const before = socketBytes(socketed), after = socketBytes(C.packSave(socketed));
t('compacting socketed cards actually saves bytes', () => {
  if (!(after < before)) throw Error('no saving: ' + before + ' -> ' + after);
  console.log('       socketed cards: ' + kb(before) + ' -> ' + kb(after) + ' (' + Math.round((1 - after / before) * 100) + '% smaller)');
});

g.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
