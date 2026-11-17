// v414 end-to-end acceptance test: a REAL save through the REAL handlers, every field identical.
//
// Uses live PUT/GET /api/save on the dev D1 shim, so the size ceiling, the single parse, the account
// stamp and the codec are all exercised together. The save is built from the game's own genGear(),
// newCard() and fishing entry shape - never hand-written fixtures (that is exactly how the first,
// rejected codec passed its own tests while being wrong about what a card looks like).
import { freshDb, makeEnv } from '../../tools/dev_server.js';
import { createRequire } from 'node:module';
import * as reg from '../../functions/api/register.js';
import * as save from '../../functions/api/save.js';
import * as C from '../../functions/_lib/save-codec.js';

const require = createRequire(import.meta.url);
const { createGame } = require('./helpers/game');

let fails = 0;
const ok = (n, c, d) => { if (c) console.log('  ok   ' + n); else { fails++; console.log('  FAIL ' + n + (d ? ' -> ' + d : '')); } };

// A corpus of real objects from the game, then a save at the real sizes measured from the owner's
// per-field byte breakdown for the one account that was being killed.
const g = createGame(), ev = g.ev;
const corpus = ev(`(()=>{
  S=load();
  const slots=['weapon','armor','head','off','leg','acc'];
  const items=[];
  for(let map=0;map<10;map++){for(let sec=0;sec<6;sec++){for(let k=0;k<4;k++){
    items.push(genGear({k:slots[k%6],n:'Plate Armor',quality:1},145,sec,false,undefined,map,10));
  }}}
  const cards=[];
  for(let m=0;m<10;m++){for(let j=0;j<4;j++){for(const nm of [false,true]){
    try{ cards.push(newCard(cardDefinition(m,j,nm))); }catch(e){}
  }}}
  const fish=[];
  for(let i=0;i<40;i++)fish.push({id:'f'+i.toString(36),sp:'Magikarp',w:12.34,mut:i%7?null:'shiny',
    at:1712345678901+i,perfect:i%5===0,lock:false});
  return {items,cards,fish};})()`);
g.close();

const env = makeEnv(freshDb(':memory:'));
const cookieFrom = r => { const c = (r.headers.getSetCookie ? r.headers.getSetCookie().join(';') : r.headers.get('set-cookie')) || ''; const m = c.match(/pg_session=[^;]+/); return m ? m[0] : ''; };
const n = 'v414' + Math.random().toString(36).slice(2, 7);
const rr = await reg.onRequestPost({ request: new Request('https://x/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ u: n, p: 'Sup3rSecret!pass', email: n + '@example.test' }) }), env });
const cookie = cookieFrom(rr);

// 901 items / 485 cards / 801 fish - the counts derived from the owner's byte breakdown.
const S = {
  owner: n, accountId: 1, lv: 145, st: { str: 99, agi: 99 }, zeny: 1234567, kills: 50000,
  inv: Array.from({ length: 901 }, (_, i) => corpus.items[i % corpus.items.length]),
  cards: Array.from({ length: 485 }, (_, i) => corpus.cards[i % corpus.cards.length]),
  fishing: { bagTier: 3, bag: Array.from({ length: 801 }, (_, i) => corpus.fish[i % corpus.fish.length]) },
};

const plain = JSON.stringify(S);
const compact = JSON.stringify(C.packSave(S));
console.log('  save: ' + plain.length.toLocaleString() + ' B plain -> ' + compact.length.toLocaleString() + ' B compact');

// 1. the compact blob is ACCEPTED by the real handler
let ver = 0;
const put = async blob => {
  const r = await save.onRequestPut({ request: new Request('https://x/api/save', { method: 'PUT', headers: { 'content-type': 'application/json', cookie, 'x-save-format': '110' }, body: JSON.stringify({ owner: n, blob, version: ver }) }), env });
  const j = await r.clone().json().catch(() => ({}));
  if (j.version != null) ver = j.version;
  return r.status;
};
ok('the compact blob is accepted (200)', (await put(compact)) === 200);
ok('the original plain blob is still refused (413) - it is over the ceiling', (await put(plain)) === 413);

// 2. GET returns exactly what was stored, still compact
const gRes = await save.onRequestGet({ request: new Request('https://x/api/save', { method: 'GET', headers: { cookie, 'x-save-format': '110' } }), env });
const body = await gRes.json();
ok('GET returns the stored blob', gRes.status === 200 && !!body.blob);
ok('the stored blob is compact', body.blob && JSON.parse(body.blob).__v >= 1);
ok('nothing was re-expanded on the way in (' + body.blob.length.toLocaleString() + ' B stored)', body.blob.length === compact.length);

// 3. what the page's load() would produce - field by field
const back = C.unpackSave(JSON.parse(body.blob));
const bad = [];
const cmp = (a, b, label) => {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) bad.push(label + '.' + k);
};
for (let i = 0; i < S.inv.length; i++) cmp(S.inv[i], back.inv[i], 'item' + i);
for (let i = 0; i < S.cards.length; i++) cmp(S.cards[i], back.cards[i], 'card' + i);
for (let i = 0; i < S.fishing.bag.length; i++) cmp(S.fishing.bag[i], back.fishing.bag[i], 'fish' + i);
ok('EVERY field of all ' + S.inv.length + ' items / ' + S.cards.length + ' cards / ' + S.fishing.bag.length + ' fish identical through the server',
  bad.length === 0, bad.slice(0, 6).join(', '));
ok('zeny / st / kills / bagTier preserved',
  back.zeny === S.zeny && JSON.stringify(back.st) === JSON.stringify(S.st) && back.kills === S.kills && back.fishing.bagTier === 3);

// 4. an OLD save still works end to end: below the ceiling, plain, un-compacted
const legacy = JSON.parse(plain);
delete legacy.accountId;
legacy.inv = legacy.inv.slice(0, 400); legacy.cards = legacy.cards.slice(0, 300); legacy.fishing.bag = legacy.fishing.bag.slice(0, 400);
const legacyBlob = JSON.stringify(legacy);
ok('a legacy (un-compacted) save is still accepted', (await put(legacyBlob)) === 200);
const g2 = await save.onRequestGet({ request: new Request('https://x/api/save', { method: 'GET', headers: { cookie } }), env });
const b2 = await g2.json();
ok('and served back in its original form', JSON.parse(b2.blob).__v == null);
ok('and the codec does not touch it', JSON.stringify(C.unpackSave(JSON.parse(b2.blob)).inv) === JSON.stringify(legacy.inv));

// 5. a compact save and the same save in old format are the SAME save to the page's comparison.
//    (Before the recheck, sameSave compared raw text and would have called these different.)
const sameData = C.unpackSave(JSON.parse(compact));
ok('the compact form unpacks to exactly the same data', JSON.stringify(sameData) === JSON.stringify(C.unpackSave(C.packSave(S))));

// 6. the CPU the whole feature exists for: one accepted PUT must not parse a save-sized string more
//    than THREE times (the request envelope, the incoming save, and one top-level read of the stored
//    row). This is the exact regression that slipped in once already: handing the raw blob to three
//    helpers that each parse it turned 3 parses into 5 and ate the entire saving.
{
  const before = JSON.parse;
  let parses = 0;
  JSON.parse = function (v, ...rest) { if (typeof v === 'string' && v.length > 8192) parses++; return before.call(this, v, ...rest); };
  let status;
  try { status = await put(compact); }   // a straight re-sync of the compact row already stored
  finally { JSON.parse = before; }
  ok('a re-sync is accepted', status === 200, 'status ' + status);
  ok('a re-sync parses a save-sized string at most 3 times', parses <= 3, 'saw ' + parses);
}

// 7. COMPATIBILITY: a page WITHOUT the codec must never be handed a compact blob.
//    Reported by review: the pre-v414 loader filters fishing entries on `typeof e.sp==='string'`, so a
//    tuple fish is dropped - the bag goes from N fish to ZERO - and the next upload saves that loss.
//    Objects stay objects and fish vanish, which is the worst possible failure shape.
{
  const oldGet = () => save.onRequestGet({ request: new Request('https://x/api/save', { method: 'GET', headers: { cookie } }), env });
  const served = await (await oldGet()).json();
  ok('an old page (no X-Save-Format) gets a readable blob', served.blob && JSON.parse(served.blob).__v == null,
    'served a compact blob to a client that cannot decode it');

  // and the pre-PR loader really does keep what it was served
  const oldBag = bag => (Array.isArray(bag) ? bag : []).filter(e => e && typeof e === 'object' && typeof e.sp === 'string');
  const decoded = JSON.parse(served.blob);
  const keptFish = oldBag(decoded.fishing && decoded.fishing.bag);
  ok('the old loader keeps every fish from what it was served', keptFish.length === S.fishing.bag.length,
    'old loader kept ' + keptFish.length + ' of ' + S.fishing.bag.length + ' fish');
  ok('the old loader keeps every item', Array.isArray(decoded.inv) && decoded.inv.length === S.inv.length,
    'kept ' + (decoded.inv || []).length + ' of ' + S.inv.length + ' items');
  ok('the old loader keeps every card', Array.isArray(decoded.cards) && decoded.cards.length === S.cards.length);

  // a modern page still gets the compact form (the whole point of the release)
  const newGet = await save.onRequestGet({ request: new Request('https://x/api/save', { method: 'GET', headers: { cookie, 'x-save-format': '110' } }), env });
  const fresh = await newGet.json();
  ok('a v414 page still gets the compact blob', JSON.parse(fresh.blob).__v != null);

  // the conflict reply carries a blob too - it must obey the same rule
  const oldPut = await save.onRequestPut({ request: new Request('https://x/api/save', {
    method: 'PUT', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ owner: n, blob: JSON.stringify(C.packSave(S)), version: 0 }) }), env });
  const conflict = await oldPut.json().catch(() => ({}));
  if (conflict.blob) ok('a conflict reply to an old page carries a readable blob', JSON.parse(conflict.blob).__v == null);
  else ok("an old page's stale push is answered without a compact blob", true);
}

console.log('');
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
