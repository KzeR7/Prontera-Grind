// v414: can the LARGEST account the game actually permits still sync?
//
// The review asked for full game states - equipment, loadouts, every collection - not just the one
// reported account. The game's own caps (index.html: BAGMAX=1000 items, CARDMAX=1000 cards, fishing
// bag 1000) bound what a player can reach, so those are the states tested here. Saves are built from
// the game's own genGear()/newCard()/cardDefinition(), never hand-written shapes: a hand-written
// fixture is exactly how the first codec passed its own tests while being wrong about real cards.
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
// 1000 items, all 4-slot, `socketed` cards split across them; `loose` cards left in the bag.
const state = ({ loose = 0, socketed = 0, fish = 0, equip = 0 }) => build(`
  const sl=['weapon','armor','head','off','leg','acc'];
  const pool=[];for(let i=0;i<1000;i++)pool.push(newCard(cardDefinition(i%10,i%4,i%2===0)));
  S.cards=pool.slice(0,${loose}).map(c=>JSON.parse(JSON.stringify(c)));
  S.inv=[];
  for(let i=0;i<1000;i++){
    const it=genGear({k:sl[i%6],n:'Rare Plate Armor',quality:1},145,i%4,false,undefined,i%10,10);
    it.cards=[];
    if(i<${socketed}){ it.slots=4;
      for(let k=0;k<4;k++)it.cards.push(JSON.parse(JSON.stringify(pool[(i*4+k)%1000]))); }
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

// --- the states a player can actually reach ---------------------------------------------------------
// CARDMAX bounds ACQUIRED cards at 1000, so "loose + socketed" is the axis: the same 1000 cards can
// sit in the bag or be socketed into gear, and the old codec stored socketed ones as full objects.
const cases = [
  ['1000 items, 1000 loose cards, 1000 fish',   { loose: 1000, socketed: 0,   fish: 1000 }],
  ['1000 items, 500 loose + 500 socketed',      { loose: 500,  socketed: 125, fish: 1000 }],
  ['1000 items, all 1000 carded into gear',     { loose: 0,    socketed: 250, fish: 1000 }],
  ['1000 items, 749 loose + 251 socketed',      { loose: 749,  socketed: 63,  fish: 1000 }],
  ['1000 items + 7 fully-carded equipment',     { loose: 1000, socketed: 0,   fish: 1000, equip: 7 }],
  ['1000 items, no cards, 1000 fish',           { loose: 0,    socketed: 0,   fish: 1000 }],
];

console.log('largest states the game permits (BAGMAX 1000 / CARDMAX 1000 / bag 1000)\n');
for (const [label, spec] of cases) {
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
  // the derivable name is dropped in both, so a card that follows the rule costs the same wherever it sits
  const N_AT = C.CODE_LAYOUT.BCARD.indexOf('n');
  if (looseTuple[N_AT] !== '\u0000' || gearTuple[N_AT] !== '\u0000') throw Error('the name was not dropped in one of them');
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
