// v414 acceptance test: the save codec is correct against the shapes the GAME actually produces.
//
// This file exists because of a shipped-nearly bug: the first codec was written against card keys
// {id,name,v,key,tier,slot}, which no card has, and it made cards BIGGER. Its tests passed because
// the fixtures were wrong in the same way the code was. So every fact here comes from the game's own
// constructors (genGear / newCard / cardDefinition) and from its own fishing code - nothing is
// hand-written. If a future build adds a field to an item, this test starts failing instead of
// silently letting the codec drop it.
import { createRequire } from 'node:module';
import * as C from '../../functions/_lib/save-codec.js';

const require = createRequire(import.meta.url);
const { createGame } = require('./helpers/game');
const fs = require('fs');
const path = require('path');
const F = require('../../assets/social-fishing.js');

let fails = 0;
const ok = (n, c, d) => { if (c) console.log('  ok   ' + n); else { fails++; console.log('  FAIL ' + n + (d ? ' -> ' + d : '')); } };

const g = createGame(), ev = g.ev;

// ------------------------------------------------------------------ real corpus from the game
const corpus = ev(`(()=>{
  S=load();
  const slots=['weapon','armor','head','off','leg','acc'];
  const items=[];
  for(let map=0;map<10;map++){for(let sec=0;sec<6;sec++){for(let k=0;k<6;k++){
    const it=genGear({k:slots[k%6],n:'Plate Armor',quality:1},145,sec,false,undefined,map,10);
    it.r=(map+sec+k)%11;it.locked=(map+k)%2===0;items.push(it);
  }}}
  items.push(S.eq.weapon);                       // the starting equipped dagger (wt set)
  const cards=[];
  for(let m=0;m<10;m++){for(let j=0;j<4;j++){for(const nm of [false,true]){
    try{ cards.push(newCard(cardDefinition(m,j,nm))); }catch(e){}
  }}}
  cards.push({id:9001,g:1,stat:'str',v:5,legacy:true,card:1});   // the legacy shape the repair adds
  return {items,cards};})()`);
g.close();
const fishState = F.normalize(null);
for (let i = 0; i < 60; i++) {
  const fish = F.addCatch(fishState, { sp: 'minnow', w: .27, mut: i % 7 ? null : 'shiny',
    perfect: i % 4 === 0 }, 1712345678901 + i);
  fish.lock = i % 9 === 0;
}
corpus.fish = fishState.bag;

const save = { owner: 'demonz', accountId: 1, lv: 145, st: { str: 99 }, zeny: 1234567,
  inv: corpus.items, cards: corpus.cards, fishing: { bagTier: 3, bag: corpus.fish } };

console.log('  corpus: ' + save.inv.length + ' real items, ' + save.cards.length + ' real cards, ' +
  save.fishing.bag.length + ' fish\n');

// ------------------------------------------------------------------ 1. the field lists must match
// This is the regression test for the bug that nearly shipped. Compare the codec's tuple lists with
// the keys the game's constructors actually emit.
const itemKeys = new Set(); for (const it of save.inv) Object.keys(it).forEach(k => itemKeys.add(k));
const cardKeys = new Set(); for (const c of save.cards) Object.keys(c).forEach(k => cardKeys.add(k));
const fishKeys = new Set(); for (const f of save.fishing.bag) Object.keys(f).forEach(k => fishKeys.add(k));

const missingIn = (gameKeys, list) => [...gameKeys].filter(k => !list.includes(k));
const ITEM_FIELDS = [...C.CODE_LAYOUT.BITEM, ...C.CODE_LAYOUT.ITEM_STATE_FIELDS];
ok('every ITEM field the game emits is in the tuple or compact state',
  missingIn(itemKeys, ITEM_FIELDS).length === 0,
  'missing: ' + missingIn(itemKeys, ITEM_FIELDS).join(','));
// `legacy` is deliberately NOT a tuple slot: it is a rare marker the repair code adds to a card that
// predates card effects. It travels in the extras object, which is proven separately below.
const CARD_EXTRAS = ['legacy'];
ok('every CARD field the game emits is covered',
  missingIn(cardKeys, [...C.CODE_LAYOUT.BCARD, ...CARD_EXTRAS]).length === 0,
  'missing: ' + missingIn(cardKeys, [...C.CODE_LAYOUT.BCARD, ...CARD_EXTRAS]).join(','));
ok('every FISH field the game emits is covered',
  missingIn(fishKeys, C.CODE_LAYOUT.BFISH).length === 0,
  'missing: ' + missingIn(fishKeys, C.CODE_LAYOUT.BFISH).join(','));

// Stricter: the fields that carry the bulk must be inside the tuple, not left to the extras bucket.
// (`legacy` is deliberately an extra - it is rare.) If a heavy field ever falls out of the tuple list
// the codec silently stops compressing, which is how cards got bigger before.
const heavy = (gameKeys, list, allowExtra) =>
  [...gameKeys].filter(k => !allowExtra.includes(k) && !list.includes(k));
ok('no heavy item field falls into extras', heavy(itemKeys, ITEM_FIELDS, []).length === 0,
  heavy(itemKeys, ITEM_FIELDS, []).join(','));
ok('no heavy card field falls into extras', heavy(cardKeys, C.CODE_LAYOUT.BCARD, CARD_EXTRAS).length === 0,
  heavy(cardKeys, C.CODE_LAYOUT.BCARD, CARD_EXTRAS).join(','));
ok('no heavy fish field falls into extras', heavy(fishKeys, C.CODE_LAYOUT.BFISH, []).length === 0,
  heavy(fishKeys, C.CODE_LAYOUT.BFISH, []).join(','));

// ------------------------------------------------------------------ 2. fidelity
const plain = JSON.stringify(save);
const packed = C.packSave(save);
const packedStr = JSON.stringify(packed);
const back = C.unpackSave(JSON.parse(packedStr));

// Key ORDER is not data - JSON objects are unordered, and the tuple necessarily rebuilds fields in
// tuple order. Compare canonically (sorted keys, recursively) so this asserts the thing that matters.
const canon = v => Array.isArray(v) ? v.map(canon)
  : (v && typeof v === 'object' ? Object.keys(v).sort().reduce((a, k) => (a[k] = canon(v[k]), a), {}) : v);
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
ok('exact round trip (canonical JSON identical)', same(back, save));
ok('item count preserved', back.inv.length === save.inv.length);
ok('card count preserved', back.cards.length === save.cards.length);
ok('fish count preserved', back.fishing.bag.length === save.fishing.bag.length);

const bad = [];
const cmp = (a, b, label) => {
  if (!a || !b) { bad.push(label + ' missing'); return; }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) bad.push(label + '.' + k + ' ' + JSON.stringify(a[k]) + ' -> ' + JSON.stringify(b[k]));
};
for (let i = 0; i < save.inv.length; i++) cmp(save.inv[i], back.inv[i], 'item' + i);
for (let i = 0; i < save.cards.length; i++) cmp(save.cards[i], back.cards[i], 'card' + i);
for (let i = 0; i < save.fishing.bag.length; i++) cmp(save.fishing.bag[i], back.fishing.bag[i], 'fish' + i);
ok('EVERY field of every item/card/fish identical', bad.length === 0, bad.slice(0, 6).join(' | '));

// the values a player would notice
const sum = (a, f) => a.reduce((s, x) => s + (Number(x[f]) || 0), 0);
ok('summed item val identical', sum(save.inv, 'val') === sum(back.inv, 'val'));
ok('summed card v identical', sum(save.cards, 'v') === sum(back.cards, 'v'));
ok('summed affix v identical',
  save.inv.reduce((s, it) => s + it.aff.reduce((t, a) => t + a.v, 0), 0) ===
  back.inv.reduce((s, it) => s + it.aff.reduce((t, a) => t + a.v, 0), 0));
ok('summed card effect v identical',
  save.cards.reduce((s, c) => s + (c.effects || []).reduce((t, e) => t + e.v, 0), 0) ===
  back.cards.reduce((s, c) => s + (c.effects || []).reduce((t, e) => t + e.v, 0), 0));

// ------------------------------------------------------------------ 3. it must actually SHRINK
// The bug this replaces made cards 12% bigger. Assert the win is real, per list.
const bytes = x => JSON.stringify(x).length;
const shrink = (before, after, label) => {
  const pct = 100 * (1 - bytes(after) / bytes(before));
  ok(label + ' shrinks (' + bytes(before).toLocaleString() + ' -> ' + bytes(after).toLocaleString() + ' B, ' + pct.toFixed(0) + '%)', pct > 20);
};
shrink(save.inv, packed.inv, 'items');
shrink(save.cards, packed.cards, 'cards');
shrink(save.fishing.bag, packed.fishing.bag, 'fish');
shrink(save, packed, 'THE WHOLE SAVE');

// ------------------------------------------------------------------ 4. unknown fields survive
const withFuture = JSON.parse(plain);
withFuture.inv[0].futureSetId = 'abc';
withFuture.cards[0].futureGlow = 'gold';
withFuture.fishing.bag[0].futureTag = 7;
const rt = C.unpackSave(JSON.parse(JSON.stringify(C.packSave(withFuture))));
ok('an unknown ITEM field survives', rt.inv[0].futureSetId === 'abc');
ok('an unknown CARD field survives', rt.cards[0].futureGlow === 'gold');
ok('an unknown FISH field survives', rt.fishing.bag[0].futureTag === 7);

// ------------------------------------------------------------------ 5. old saves untouched
const old = { owner: 'x', inv: [{ id: 1, slot: 'armor', val: 5, name: 'X' }], cards: [], zeny: 1 };
ok('an OLD save is returned byte-identical', JSON.stringify(C.unpackSave(old)) === JSON.stringify(old));
ok('an OLD save is not marked packed', C.isPacked(old) === false);
ok('a compact save IS marked packed', C.isPacked(packed) === true);

// ------------------------------------------------------------------ 6. degenerate input never throws
for (const [label, v] of [['null', null], ['undefined', undefined], ['a string', 'x'], ['an array', [1, 2]],
  ['a number', 42], ['empty object', {}]]) {
  let threw = false;
  try { C.packSave(v); C.unpackSave(v); } catch (e) { threw = true; }
  ok('packSave/unpackSave tolerate ' + label, !threw);
}
ok('items inside a compact save that are still objects pass through',
  JSON.stringify(C.unpackItem({ id: 1 })) === '{"id":1}');

// ------------------------------------------------ 6b. hostile / legacy shapes must not lose data
// Every one of these was a real defect found while re-auditing the codec, or a shape a real save can
// hold. The rule is absolute: what goes in comes back, and nothing is invented on the way.
{
  const norm = v => Array.isArray(v) ? v.map(norm)
    : (v && typeof v === 'object') ? Object.fromEntries(Object.keys(v).sort().map(k => [k, norm(v[k])])) : v;
  const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
  const roundTrips = (label, obj) => {
    let back;
    try { back = C.unpackSave(JSON.parse(JSON.stringify(C.packSave(obj)))); }
    catch (e) { ok('round trip: ' + label, false, 'threw ' + e.message); return; }
    ok('round trip: ' + label, same(back, obj), JSON.stringify(norm(obj)).slice(0, 90) + ' -> ' + JSON.stringify(norm(back)).slice(0, 90));
  };
  // An affix/effect may gain fields after k/v. Losing them would quietly change what an item does.
  roundTrips('affix with fields beyond k/v', { inv: [{ id: 1, slot: 'a', aff: [{ k: 'str', v: 12, cap: 15, rolled: 100 }] }] });
  roundTrips('card effect with fields beyond k/v', { cards: [{ id: 1, card: 1, effects: [{ k: 'luk', v: 3, src: 'set' }] }] });
  // Absent is not false: a flag a fish never had must not be invented on it.
  roundTrips('fish with no perfect/lock keys at all', { fishing: { bag: [{ id: 'a', sp: 'x' }] } });
  roundTrips('fish with lock=false and perfect=false', { fishing: { bag: [{ id: 'a', sp: 'x', lock: false, perfect: false }] } });
  roundTrips('fish with mut=null', { fishing: { bag: [{ id: 'a', sp: 'x', mut: null }] } });
  roundTrips('legacy fishs[] list', { fishs: [{ id: 'a', sp: 'x', lock: true }] });
  roundTrips('empty lists', { inv: [], cards: [], fishing: { bag: [] } });
  roundTrips('falsy but present values', { inv: [{ id: 0, slot: 'a', val: 0, tier: 0, sec: 0, mp: 0 }] });
  // A corrupt save must still be storable - one bad row may never block a player's sync.
  for (const [label, obj] of [
    ['null hole in inv', { inv: [null, { id: 1, slot: 'a' }] }],
    ['string in inv', { inv: ['junk', { id: 1, slot: 'a' }] }],
    ['string in cards', { cards: ['junk'] }],
    ['null hole in fishing.bag', { fishing: { bag: [null, { id: 'a', sp: 'x' }] } }],
    ['inv that is not a list', { inv: 'nope' }],
    ['fishing without a bag', { fishing: { coins: 5 } }],
  ]) {
    let threw = false, back;
    try { back = C.unpackSave(JSON.parse(JSON.stringify(C.packSave(obj)))); } catch (e) { threw = true; }
    ok('survives ' + label, !threw && same(back, obj));
  }
}

// ------------------------------------------------------------------ 7. the page and the module agree
// The client keeps its own copy of the codec inside index.html (the page cannot import ES modules
// without changing how it loads). That copy MUST match this module, or a page would store a shape
// the server cannot read.
const html = fs.readFileSync(path.join(import.meta.dirname, '../../index.html'), 'utf8');
const grabList = name => {
  const m = html.match(new RegExp('const ' + name + "=\\[([^\\]]*)\\]"));
  return m ? m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean) : null;
};
const htmlItem = grabList('CODEC_BITEM'), htmlCard = grabList('CODEC_BCARD');
ok('index.html has the same compact ITEM STATE fields as this module',
  JSON.stringify(grabList('CODEC_ITEM_STATE_FIELDS')) === JSON.stringify(C.CODE_LAYOUT.ITEM_STATE_FIELDS));
ok('index.html has the same ITEM layout as this module', htmlItem && JSON.stringify(htmlItem) === JSON.stringify(C.CODE_LAYOUT.BITEM),
  'page: ' + JSON.stringify(htmlItem));
ok('index.html has the same CARD layout as this module', htmlCard && JSON.stringify(htmlCard) === JSON.stringify(C.CODE_LAYOUT.BCARD),
  'page: ' + JSON.stringify(htmlCard));

console.log('');
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
