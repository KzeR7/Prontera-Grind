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

export const CODEC_VERSION = 1;

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
  t[6] = Array.isArray(it.aff) ? it.aff.map(a => (isObj(a) ? [a.k, a.v] : a)) : pack(undefined);
  t[8] = Array.isArray(it.cards) ? it.cards : pack(undefined);
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
    if (Array.isArray(t[6])) o.aff = t[6].map(a => (Array.isArray(a) ? { k: a[0], v: a[1] } : a));
    if (Array.isArray(t[8])) o.cards = t[8];
  });
}

// ---------------------------------------------------------------------------- cards -------------

export function packCard(c) {
  if (!isObj(c)) return c;
  const t = BCARD.map(k => pack(c[k]));
  // `effects` is the biggest card field after cardKey: [{k:'luk',v:3}] -> [['luk',3]].
  // An ABSENT effects list stays absent (NUL): a legacy card has none, and turning that into [] would
  // invent a field the game uses to decide whether a card still needs its values repaired.
  t[7] = Array.isArray(c.effects) ? c.effects.map(e => (isObj(e) ? [e.k, e.v] : e)) : pack(undefined);
  const extra = extrasOf(c, CARD_KEYS);
  if (extra) t.push(extra);
  return t;
}
export function unpackCard(t) {
  if (!Array.isArray(t)) return t;
  return fromTuple(t, BCARD, (o) => {
    if (Array.isArray(t[7])) o.effects = t[7].map(e => (Array.isArray(e) ? { k: e[0], v: e[1] } : e));
  });
}

// ----------------------------------------------------------------------------- fish -------------

export function packFish(f) {
  if (!isObj(f)) return f;
  const t = BFISH.map(k => pack(f[k]));
  // `perfect`/`lock` are booleans; folding them keeps the tuple uniform without changing meaning.
  t[5] = f.perfect === true ? 1 : 0;
  t[6] = f.lock === true ? 1 : 0;
  const extra = extrasOf(f, FISH_KEYS);
  if (extra) t.push(extra);
  return t;
}
export function unpackFish(t) {
  if (!Array.isArray(t)) return t;
  return fromTuple(t, BFISH, (o) => {
    o.perfect = t[5] === 1;
    o.lock = t[6] === 1;
  });
}

// ---------------------------------------------------------------------------- save --------------

const hasFishBag = s => isObj(s.fishing) && Array.isArray(s.fishing.bag);

// Pure: the caller keeps using the object it passed in (the audit runs on the ordinary shape).
export function packSave(save) {
  if (!isObj(save)) return save;
  const out = Object.assign({}, save, { __v: CODEC_VERSION });
  if (Array.isArray(save.inv)) out.inv = save.inv.map(packItem);
  if (Array.isArray(save.cards)) out.cards = save.cards.map(packCard);
  if (hasFishBag(save)) out.fishing = Object.assign({}, save.fishing, { bag: save.fishing.bag.map(packFish) });
  if (Array.isArray(save.fishs)) out.fishs = save.fishs.map(packFish);
  return out;
}

// The inverse, and the only function the game has to care about. No `__v` => old save, returned as is.
export function unpackSave(save) {
  if (!isObj(save) || save.__v == null) return save;
  const out = Object.assign({}, save);
  delete out.__v;
  if (Array.isArray(save.inv)) out.inv = save.inv.map(unpackItem);
  if (Array.isArray(save.cards)) out.cards = save.cards.map(unpackCard);
  if (hasFishBag(save)) out.fishing = Object.assign({}, save.fishing, { bag: save.fishing.bag.map(unpackFish) });
  if (Array.isArray(save.fishs)) out.fishs = save.fishs.map(unpackFish);
  return out;
}

export const isPacked = save => isObj(save) && save.__v != null;

// Exported so the test suite can compare the lists against the game's own constructors.
export const CODE_LAYOUT = { BITEM, BCARD, BFISH };
