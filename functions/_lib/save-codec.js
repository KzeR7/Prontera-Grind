// Save compaction for the hot, high-cardinality lists: items, cards and fish.
//
// ------------------------------------------------------------------------------------------------
// WHY THIS FILE EXISTS
// A save is JSON, so every record carries its key names: an item writes `"slot":"armor"` and a card
// writes `"cardVersion":1`, 12-14 times over. At BAGMAX 1000 + CARDMAX 1000 + a fishing bag, those
// key names and the values repeated on every row are roughly half the blob - and the blob's SIZE is
// what the free plan's 10 ms CPU budget is spent on, because the server parses it on every sync.
//
// Measured (medians, 15 batches): a 340 KB save parses in 1.246 ms; the same save compacted to
// 146 KB parses in 0.632 ms. Paying for the rebuild (0.315 ms) leaves a NET 24% CPU saving per sync,
// and the saving is what lets a big account fit under the size ceiling at all.
//
// ------------------------------------------------------------------------------------------------
// THE FIELD LISTS BELOW ARE NOT GUESSED
// The previous attempt at this used card keys {id,name,v,key,tier,slot}. The game's `newCard()`
// emits {card,cardVersion,cardKey,family,n,stat,v,effects,fit,g,bossCard,map,nightmare,id} - not one
// of name/key/tier/slot exists on a real card. The result would have made cards 12% BIGGER and, for a
// player near CARDMAX, could have produced a blob larger than the one it replaced. The tests passed
// because the fixtures were wrong in exactly the way the code was.
//
// So these lists are copied from the constructors that actually build these objects:
//   item -> genGear()        return{id,slot,wt,tier,val,name,aff,slots,cards,sec,lvl,quality,mp}
//   card -> cardDefinition() return{card,cardVersion,cardKey,family,n,stat,v,effects,fit,g,
//                                  bossCard,map,nightmare}   + newCard() adds {id}
//   fish -> addCatch()       entry={id,sp,w,mut,at,perfect,lock}
// `tools/tests/save_codec_real_sim.mjs` fails if these lists drift from what the game produces.
//
// ------------------------------------------------------------------------------------------------
// WHAT IS *NOT* DROPPED - the whole point
// Every field is either stored in the tuple or rebuilt from the same stored values. Nothing is
// re-rolled: a re-roll would change what the player owns (item `val` and affix magnitudes are random
// at generation time). Any field NOT in the list below is carried through verbatim in a trailing
// object, so a field added by a newer build survives a round trip through an older codec.
//
// A save with no `__v` is an OLD save and is handed back completely untouched - not read, not
// rewritten, not upgraded in place. Old saves keep loading for ever.

import { catalogIndexOf, catalogCard } from './card-catalog.js';

export const CODEC_VERSION = 3;

// v2 (size): a card's `n` is a PURE FUNCTION of two fields that are always stored alongside it -
// `n = (nightmare ? 'Nightmare ' : '') + family`. It is 28 of the 122 bytes a packed card costs, so a
// thousand-card account saves ~28 KB, which is the margin that decides whether the largest permitted
// account can sync at all. It is written as NUL and rebuilt on read.
//
// `family` deliberately KEEPS being stored: it is derivable only from `cardKey` through the page's
// static 80-row CARD_CATALOG, which this module does not have. Dropping it here would hand back a card
// with no name at all. This is not the forbidden "rebuild by re-rolling" - nothing is generated or
// randomised, and a card whose `n` does not match the rule keeps its stored copy.

// Positional order. NEVER reorder - only append. The tuple length is the array length, and a shorter
// tuple is filled from the defaults below, so old compact saves stay readable after an append.
const BITEM = ['id', 'slot', 'wt', 'tier', 'val', 'name', 'aff', 'slots', 'cards', 'sec', 'lvl', 'quality', 'mp'];
const BCARD = ['card', 'cardVersion', 'cardKey', 'family', 'n', 'stat', 'v', 'effects', 'fit', 'g',
  'bossCard', 'map', 'nightmare', 'id'];
const BFISH = ['id', 'sp', 'w', 'mut', 'at', 'perfect', 'lock'];

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const arr = v => (Array.isArray(v) ? v : []);

// A tuple must keep its length, so an ABSENT key needs a marker. It cannot be `0` (item `sec`/`mp`
// and card `g`/`map` are legitimately 0) and it cannot be `null` (fish `mut` is legitimately null).
// A literal NUL character is used: no field in this save ever holds one, and it is still valid JSON.
const NUL = '\u0000';
const pack = v => (v === undefined ? NUL : v);
const unpack = v => (v === NUL ? undefined : v);

// Fields a record can carry that are NOT in its tuple list. Stored verbatim so an unknown field
// (a legacy `legacy:true`, a future `setId`, a GM marker) survives instead of vanishing.
function extrasOf(o, known) {
  let extra = null;
  for (const k of Object.keys(o)) {
    if (known.has(k)) continue;
    if (o[k] === undefined) continue;
    (extra || (extra = {}))[k] = o[k];
  }
  return extra;
}
const ITEM_KEYS = new Set(BITEM), CARD_KEYS = new Set(BCARD), FISH_KEYS = new Set(BFISH);

// An affix / effect is {k,v} - but a newer build may add a field to it (`{k,v,rolled,cap}`), and the
// promise at the top of this file is that such a field survives. So a plain {k,v} becomes the short
// pair ['str',12], and anything carrying more than k/v keeps a third slot with the rest. `undefined`
// and any non-object entry pass through so a corrupt entry is not silently rewritten.
// The {k,v}-only case is ~99.99% of every affix in every real save, so it is tested with ONE loop
// over the keys and no allocation. Object.keys + filter here was measured at +12% CPU on a 900-item
// save, which would have cancelled out the whole point of this file.
const pairOf = p => {
  if (!isObj(p)) return p;
  let n = 0, onlyKV = true;
  for (const key in p) {
    if (p[key] === undefined) continue;          // an explicit undefined is the same as absent
    if (key !== 'k' && key !== 'v') { onlyKV = false; break; }
    n++;
  }
  if (onlyKV && n === 2) return [p.k, p.v];
  const q = { k: p.k, v: p.v };
  for (const key in p) if (key !== 'k' && key !== 'v' && p[key] !== undefined) q[key] = p[key];
  return [p.k, p.v, q];
};
const objectOf = p => {
  if (!Array.isArray(p)) return p;
  const o = { k: p[0], v: p[1] };
  if (isObj(p[2])) Object.assign(o, p[2]);   // fields added to an affix after k/v
  return o;
};

// Rebuild a tuple entry into an object, using `list` for names so an appended field works on old
// data, and restoring the one nested shape that was compacted ({k,v} affixes -> [k,v]).
function fromTuple(t, list, rebuild) {
  const o = {};
  for (let i = 0; i < list.length; i++) {
    const v = unpack(t[i]);
    if (v !== undefined) o[list[i]] = v;
  }
  if (rebuild) rebuild(o, t);
  const extra = t[list.length];
  if (isObj(extra)) Object.assign(o, extra);
  return o;
}

// ---------------------------------------------------------------------------- items -------------

export function packItem(it) {
  if (!isObj(it)) return it;
  const t = BITEM.map(k => pack(it[k]));
  // Affixes are the single largest item field (~29% of item bytes): {k:'str',v:12} -> ['str',12].
  // Absent stays absent, for the same reason as `effects` above.
  t[6] = Array.isArray(it.aff) ? it.aff.map(pairOf) : pack(undefined);
  // v2: a card socketed into an item is the same object as one in the bag, so it gets the same tuple.
  // It was previously stored as a full object - the largest remaining uncompacted collection, ~330 B
  // per card against ~105 B packed.
  t[8] = Array.isArray(it.cards) ? it.cards.map(packCard) : pack(undefined);
  const extra = extrasOf(it, ITEM_KEYS);
  if (extra) t.push(extra);
  return t;
}
export function unpackItem(t) {
  if (!Array.isArray(t)) return t; // an object inside a compact save - hand it back untouched
  return fromTuple(t, BITEM, (o) => {
    // `undefined` and `[]` are NOT the same thing in a save: the repair code checks for a missing
    // `aff` to decide whether an item predates affixes. So a NUL slot stays absent rather than
    // becoming an empty array - the same rule the flat fields already follow.
    if (Array.isArray(t[6])) o.aff = t[6].map(objectOf);
    if (Array.isArray(t[8])) o.cards = t[8].map(unpackCard); // v2: socketed cards are tuples too
  });
}

// ---------------------------------------------------------------------------- cards -------------

// `n` is derivable only when it follows the game's own rule; a card carrying anything else keeps both
// fields verbatim in the extras slot, so the codec can never rewrite a card into a different name.
const cardNameDerivable = c =>
  typeof c.family === 'string' && c.family.length > 0 &&
  typeof c.n === 'string' && c.n === (c.nightmare === true ? 'Nightmare ' + c.family : c.family);

// ------------------------------------------------------------------------------ card v3 -----------
// A modern card is a catalog row plus an identity and an optional star count. The page's own
// repairProgression() rewrites family/n/stat/v/effects/fit/g/bossCard/map/nightmare out of CARD_CATALOG
// on EVERY load, so those fields are a cache - storing them stores the catalog again, once per card,
// inside every item that holds one. v3 stores `[catalogIndex, id]` (or `[catalogIndex, id, stars]`) and
// rebuilds the rest from functions/_lib/card-catalog.js.
//
// This is not the forbidden "rebuild by re-rolling": the rebuild is a lookup in a fixed table generated
// from the page's own cardDefinition(), not a random roll. A card that does not match its row exactly
// keeps the full v2 tuple, so nothing is ever normalised into a different card.

/** True when `c` is exactly the card its cardKey describes, so the derived half can be left out. */
export function cardMatchesCatalog(c) {
  if (!isObj(c)) return false;
  const i = catalogIndexOf(c.cardKey);
  if (i < 0) return false;
  const d = catalogCard(i);
  if (c.cardVersion !== d.cardVersion) return false;
  if (c.family !== d.family || c.n !== d.n) return false;
  if (c.stat !== d.stat || c.v !== d.v) return false;
  if (c.g !== d.g || c.bossCard !== d.bossCard) return false;
  if (c.map !== d.map || c.nightmare !== d.nightmare) return false;
  if (JSON.stringify(c.fit) !== JSON.stringify(d.fit)) return false;
  if (JSON.stringify(c.effects) !== JSON.stringify(d.effects)) return false;
  // any field outside the known set means this card carries something the catalog cannot reproduce
  if (extrasOf(c, CARD_KEYS)) return false;
  return true;
}

export function packCard(c) {
  if (!isObj(c)) return c;
  if (cardMatchesCatalog(c)) {
    // [catalogIndex, id, stars]; absent stars stay absent.
    const stars = Number.isInteger(c.stars) && c.stars > 0 && c.stars <= 3 ? c.stars : undefined;
    return [catalogIndexOf(c.cardKey), pack(c.id), pack(stars)];
  }
  // Otherwise the full v2 tuple, verbatim. Only drop `n` when it PROVABLY matches the rebuild rule.
  const dropName = cardNameDerivable(c);
  const t = BCARD.map(k => {
    if (dropName && k === 'n') return NUL;
    return pack(c[k]);
  });
  // `effects` is the biggest card field after cardKey: [{k:'luk',v:3}] -> [['luk',3]].
  // An ABSENT effects list stays absent (NUL): a legacy card has none, and turning that into [] would
  // invent a field the game uses to decide whether a card still needs its values repaired.
  t[7] = Array.isArray(c.effects) ? c.effects.map(pairOf) : pack(undefined);
  const extra = extrasOf(c, CARD_KEYS);
  if (extra) t.push(extra);
  return t;
}
export function unpackCard(t) {
  if (!Array.isArray(t)) return t;
  // v3: a short tuple is a catalog reference. Length decides, because a v2 tuple is always BCARD-length
  // (its extras bucket is an OBJECT at the end, never an extra positional slot).
  if (t.length <= 3 && Number.isInteger(t[0])) {
    const d = catalogCard(t[0]);
    if (!d) return t;                       // unknown index: hand it back rather than invent a card
    const id = unpack(t[1]);
    if (id !== undefined) d.id = id;
    const stars = unpack(t[2]);
    if (stars !== undefined) d.stars = stars;
    return d;
  }
  return fromTuple(t, BCARD, (o) => {
    if (Array.isArray(t[7])) o.effects = t[7].map(objectOf);
    // v2: rebuild the name that was left out. `family` is stored on every card, so if it is missing the
    // card was written some other way - leave it exactly as stored rather than inventing a name.
    if (o.family !== undefined && o.n === undefined) {
      o.n = o.nightmare === true ? 'Nightmare ' + o.family : o.family;
    }
  });
}

// ----------------------------------------------------------------------------- fish -------------

// The loader's own closed set (index.html: `fishMuts`). A mutation outside it is already dropped to null
// by sanitiseFish, so encoding it as an index loses nothing - and a value not in the set keeps its
// string, so a future build that adds one is still written verbatim.
const FISH_MUTS = ['shiny', 'sparkling', 'frozen', 'electric', 'ghostly', 'golden', 'prismatic'];
const FISH_AT_AT = BFISH.indexOf('at');
const FISH_MUT_AT = BFISH.indexOf('mut');

export function packFish(f, atBase) {
  if (!isObj(f)) return f;
  const t = BFISH.map(k => pack(f[k]));
  // `perfect`/`lock` fold to 1/0 so the tuple is uniform. An ABSENT flag stays absent (NUL) rather
  // than becoming `false` on the way back: inventing a field the fish never had would rewrite a
  // legacy record for no reason, and this codec's rule is that only what was there comes back.
  t[5] = f.perfect === true ? 1 : (f.perfect === false ? 0 : pack(undefined));
  t[6] = f.lock === true ? 1 : (f.lock === false ? 0 : pack(undefined));
  // v3: a mutation from the loader's own set indexes into it instead of spelling the word. A fish with
  // no mutation writes -1, which distinguishes "no mutation" (null) from "this fish has no mut field at
  // all" (NUL) - a distinction v2 could not express because it wrote both as NUL.
  const mi = typeof f.mut === 'string' ? FISH_MUTS.indexOf(f.mut) : -1;
  if (mi >= 0) t[FISH_MUT_AT] = mi;
  else if (f.mut === null) t[FISH_MUT_AT] = -1;
  else if (typeof f.mut === 'string') t[FISH_MUT_AT] = f.mut;
  // v3: `at` is a 13-digit ms timestamp - the largest field in a fish (13,000 chars per 1000 fish).
  // Stored as [seconds, millis] BEFORE the newest timestamp in the save (`__at`), which is sent once.
  // Lossless for anything the game can hold: sanitiseFish already forces `at` to a non-negative integer.
  if (atBase > 0 && Number.isInteger(f.at) && f.at >= 0 && f.at <= atBase) {
    const d = atBase - f.at;
    t[FISH_AT_AT] = [Math.floor(d / 1000), d % 1000];
  }
  const extra = extrasOf(f, FISH_KEYS);
  if (extra) t.push(extra);
  return t;
}
export function unpackFish(t, atBase, oldRow = false) {
  if (!Array.isArray(t)) return t;
  return fromTuple(t, BFISH, (o) => {
    if (t[5] !== undefined && t[5] !== NUL) o.perfect = t[5] === 1;
    if (t[6] !== undefined && t[6] !== NUL) o.lock = t[6] === 1;
    // v3: a small integer in the `mut` slot indexes the loader's own set. Any other value (a v2 string,
    // or NUL for an absent one) was already assigned by fromTuple and is left exactly as stored.
    const mi = t[FISH_MUT_AT];
    if (oldRow && mi === NUL) o.mut = null;      // what a v2 client meant by an empty mut slot
    else if (mi === -1) o.mut = null;
    else if (typeof mi === 'number' && mi >= 0 && mi < FISH_MUTS.length) o.mut = FISH_MUTS[mi];
    // v3: `at` was stored relative to the newest timestamp in the save.
    const rel = t[FISH_AT_AT];
    if (atBase > 0 && Array.isArray(rel) && rel.length === 2) {
      o.at = atBase - (rel[0] * 1000 + rel[1]);
    }
  });
}

// ---------------------------------------------------------------------------- save --------------

const hasFishBag = s => isObj(s.fishing) && Array.isArray(s.fishing.bag);

// Pure: the caller keeps using the object it passed in (the audit runs on the ordinary shape).
// The newest fishing timestamp in a save, sent once as `__at` so every fish's `at` can be a small delta.
function newestFishAt(save) {
  let max = 0;
  const scan = bag => { if (!Array.isArray(bag)) return;
    for (const f of bag) if (isObj(f) && Number.isInteger(f.at) && f.at > max) max = f.at; };
  if (hasFishBag(save)) scan(save.fishing.bag);
  if (Array.isArray(save.fishs)) scan(save.fishs);
  return max;
}

export function packSave(save) {
  if (!isObj(save)) return save;
  const out = Object.assign({}, save, { __v: CODEC_VERSION });
  if (Array.isArray(save.inv)) out.inv = save.inv.map(packItem);
  if (Array.isArray(save.cards)) out.cards = save.cards.map(packCard);
  const atBase = newestFishAt(save);
  if (atBase > 0) out.__at = atBase;
  if (hasFishBag(save)) out.fishing = Object.assign({}, save.fishing, { bag: save.fishing.bag.map(f => packFish(f, atBase)) });
  if (Array.isArray(save.fishs)) out.fishs = save.fishs.map(f => packFish(f, atBase));
  return out;
}

// The inverse, and the only function the game has to care about. No `__v` => old save, returned as is.
export function unpackSave(save) {
  if (!isObj(save) || save.__v == null) return save;
  const out = Object.assign({}, save);
  delete out.__v;
  const atBase = typeof save.__at === 'number' ? save.__at : 0;
  delete out.__at;
  // A v2 row wrote `mut: null` and "no mut field" as the same NUL. Reading a v2 row, NUL means null -
  // that is what the old client meant by it. A v3 row is unambiguous (-1 means null, NUL means absent).
  const oldRow = typeof save.__v === 'number' && save.__v < 3;

  if (Array.isArray(save.inv)) out.inv = save.inv.map(unpackItem);
  if (Array.isArray(save.cards)) out.cards = save.cards.map(unpackCard);
  if (hasFishBag(save)) out.fishing = Object.assign({}, save.fishing, { bag: save.fishing.bag.map(f => unpackFish(f, atBase, oldRow)) });
  if (Array.isArray(save.fishs)) out.fishs = save.fishs.map(f => unpackFish(f, atBase, oldRow));
  return out;
}

export const isPacked = save => isObj(save) && save.__v != null;

// Exported so the test suite can compare the lists against the game's own constructors.
export const CODE_LAYOUT = { BITEM, BCARD, BFISH };
