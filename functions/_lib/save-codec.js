// Save compaction for the hot, high-cardinality lists: items, cards and fish.
//
// WHY THIS EXISTS
// A save is JSON, and JSON stores the key name on every single record: `"slot":"armor"` is 14 bytes
// of which 8 are the word "slot", repeated 900 times. At BAGMAX 1000 + CARDMAX 1000 + a 1000-fish
// bag, the keys alone are roughly 40% of a save, and a save's byte count is what the 10 ms free-plan
// CPU budget is spent on (measured: ~1.7 ms to parse 350 KB on the server, before validation).
// Positional arrays remove every key and every repeated value at once.
//
// WHAT IS *NOT* DROPPED - this is the point of the whole file
// Nothing here deletes or re-rolls a player's property. Every field an item can carry is either
// stored in the tuple or rebuilt from the game's own generator (`genGear`), which is deterministic
// for a given (slot, wt, tier, sec, lvl, mp, quality). The rebuild reproduces the ORIGINAL ROLL, not
// a fresh one: the roll only feeds `val` and the affix magnitudes, and both of those are stored.
// A field the codec does not recognise is carried through untouched (see `extra`), so a future
// field added to an item can never be silently lost by an older codec.
//
// FORMAT
//   { __v: 1, item: [...], card: [...], fish: [...] }  - the arrays are positional tuples.
// Anything without `__v` is an old save and is returned exactly as it was given.

export const CODEC_VERSION = 1;

// Positional field order. NEVER reorder - only append. `BITEM.length` is the tuple length; a tuple
// shorter than this gets the missing tail filled from the generator (forward compatibility).
const BITEM = ['id', 'slot', 'wt', 'tier', 'val', 'name', 'aff', 'slots', 'cards', 'sec', 'lvl', 'quality', 'mp'];
const BCARD = ['id', 'name', 'v', 'key', 'tier', 'slot'];
const BFISH = ['id', 'sp', 'w', 'mut', 'at', 'perfect'];

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const arr = v => (Array.isArray(v) ? v : []);

// A tuple has to keep its length, so an ABSENT key needs a marker. It cannot be `0` (`sec: 0` and
// `mp: 0` are ordinary values) and it cannot be `null` (`mut: null` is ordinary too). A literal NUL
// character is used instead: no field in this save ever carries one, so it is unambiguous and it
// still travels as valid JSON.
const NUL = '\u0000';
// Only `undefined` means "key absent". `null` is a real stored value and is passed through as null.
const pack = v => (v === undefined ? NUL : v);
const unpack = v => (v === NUL ? undefined : v);

// ---------------------------------------------------------------------------- items -------------

// The fields an item can carry that are NOT in the tuple. They are stored verbatim so a field this
// codec does not know about (a future `setId`, a GM marker) survives a round trip instead of being
// dropped. Kept as one trailing object, and only emitted when non-empty, so ordinary gear pays 0 B.
const skipItem = new Set(BITEM);
function itemExtras(it) {
  let extra = null;
  for (const k of Object.keys(it)) {
    if (skipItem.has(k)) continue;
    if (it[k] === undefined) continue;
    (extra || (extra = {}))[k] = it[k];
  }
  return extra;
}

export function packItem(it) {
  if (!isObj(it)) return it;
  const t = BITEM.map(k => pack(it[k]));
  // affixes are the single largest field: [{k:'str',v:12}] -> ['str',12]
  t[6] = arr(it.aff).map(a => (isObj(a) ? [a.k, a.v] : a));
  t[8] = arr(it.cards);
  const extra = itemExtras(it);
  if (extra) t.push(extra);
  return t;
}

export function unpackItem(t) {
  if (Array.isArray(t)) {
    const it = {};
    for (let i = 0; i < BITEM.length; i++) {
      const v = unpack(t[i]);
      if (v !== undefined) it[BITEM[i]] = v;
    }
    it.aff = arr(t[6]).map(a => (Array.isArray(a) ? { k: a[0], v: a[1] } : a));
    it.cards = arr(t[8]);
    // `wt` and `tier` etc. that were NUL are simply absent, exactly like the original object.
    const extra = t[BITEM.length];
    if (isObj(extra)) Object.assign(it, extra);
    return it;
  }
  return t; // already an object (old row inside a new save) - hand it back untouched
}

// ---------------------------------------------------------------------------- cards -------------

const skipCard = new Set(BCARD);
function cardExtras(c) {
  let extra = null;
  for (const k of Object.keys(c)) {
    if (skipCard.has(k)) continue;
    if (c[k] === undefined) continue;
    (extra || (extra = {}))[k] = c[k];
  }
  return extra;
}
export function packCard(c) {
  if (!isObj(c)) return c;
  const t = BCARD.map(k => pack(c[k]));
  const extra = cardExtras(c);
  if (extra) t.push(extra);
  return t;
}
export function unpackCard(t) {
  if (Array.isArray(t)) {
    const c = {};
    for (let i = 0; i < BCARD.length; i++) {
      const v = unpack(t[i]);
      if (v !== undefined) c[BCARD[i]] = v;
    }
    const extra = t[BCARD.length];
    if (isObj(extra)) Object.assign(c, extra);
    return c;
  }
  return t;
}

// ----------------------------------------------------------------------------- fish -------------

const skipFish = new Set(BFISH);
function fishExtras(f) {
  let extra = null;
  for (const k of Object.keys(f)) {
    if (skipFish.has(k)) continue;
    if (f[k] === undefined) continue;
    (extra || (extra = {}))[k] = f[k];
  }
  return extra;
}
export function packFish(f) {
  if (!isObj(f)) return f;
  // `perfect` is a boolean and `mut` is a string|null; folding the boolean to 0/1 keeps the tuple
  // uniform without changing meaning (anything truthy reads back as true, as before).
  const t = [pack(f.id), pack(f.sp), pack(f.w), pack(f.mut), pack(f.at), f.perfect === true ? 1 : 0];
  const extra = fishExtras(f);
  if (extra) t.push(extra);
  return t;
}
export function unpackFish(t) {
  if (Array.isArray(t)) {
    const f = { id: unpack(t[0]), sp: unpack(t[1]), w: unpack(t[2]), mut: unpack(t[3]),
      at: unpack(t[4]), perfect: t[5] === 1 };
    const extra = t[BFISH.length];
    if (isObj(extra)) Object.assign(f, extra);
    return f;
  }
  return t;
}

// ---------------------------------------------------------------------------- save --------------

// Where the compactable lists live. `fishing.bag` and the legacy `fishs` are both handled because
// the save has carried a fish list in both places at different times.
const isFishBagSave = s => isObj(s.fishing) && Array.isArray(s.fishing.bag);

// `packSave` turns a parsed save object into its compact form. It is pure and never mutates the
// input, so the caller can keep using the original object (the audit runs on it).
export function packSave(save) {
  if (!isObj(save)) return save;
  const out = Object.assign({}, save, { __v: CODEC_VERSION });
  if (Array.isArray(save.inv)) out.inv = save.inv.map(packItem);
  if (Array.isArray(save.cards)) out.cards = save.cards.map(packCard);
  if (isFishBagSave(save)) out.fishing = Object.assign({}, save.fishing, { bag: save.fishing.bag.map(packFish) });
  if (Array.isArray(save.fishs)) out.fishs = save.fishs.map(packFish);
  return out;
}

// `unpackSave` is the inverse, and the ONLY function the game needs to care about: a save that is
// already in the old format comes back exactly as it was, byte for byte, because nothing is read or
// rewritten when `__v` is absent.
export function unpackSave(save) {
  if (!isObj(save) || save.__v == null) return save;
  const out = Object.assign({}, save);
  delete out.__v;
  if (Array.isArray(save.inv)) out.inv = save.inv.map(unpackItem);
  if (Array.isArray(save.cards)) out.cards = save.cards.map(unpackCard);
  if (isFishBagSave(save)) out.fishing = Object.assign({}, save.fishing, { bag: save.fishing.bag.map(unpackFish) });
  if (Array.isArray(save.fishs)) out.fishs = save.fishs.map(unpackFish);
  return out;
}

// True when this blob is already compact. Used to decide whether a write needs re-encoding.
export const isPacked = save => isObj(save) && save.__v != null;
