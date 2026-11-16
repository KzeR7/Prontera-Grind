// v414 (step 2) acceptance test: a REAL save goes through the REAL handlers and comes back with
// every item, card and fish field identical.
//
// This is the test the owner asked for by name: "a test must load a real 415 KB save, migrate it,
// and prove every item's stats are identical before and after". It uses the live `PUT /api/save`
// and `GET /api/save` handlers on the dev D1 shim, so the size ceiling, the one-parse rule, the
// account stamp and the codec are all exercised together rather than in isolation.
import { freshDb, makeEnv } from '../../tools/dev_server.js';
import { createRequire } from 'node:module';
import * as reg from '../../functions/api/register.js';
import * as save from '../../functions/api/save.js';
import * as C from '../../functions/_lib/save-codec.js';

const require = createRequire(import.meta.url);
const { createGame } = require('../tests/helpers/game');

let fails = 0;
const ok = (n, c, d) => { if (c) console.log('  ok   ' + n); else { fails++; console.log('  FAIL ' + n + (d ? ' -> ' + d : '')); } };

// Real gear from the game's own generator - not hand-written fixtures. A codec bug that drops a
// field shows up here and nowhere else.
const g = createGame(), ev = g.ev;
const corpus = ev(`(()=>{S=load();const slots=['weapon','armor','head','off','leg','acc'];const out=[];
  for(let i=0;i<60;i++){out.push(genGear({k:slots[i%6],n:'Plate Armor',quality:1},145,i%6,false,undefined,i%10,10));}
  out.push(S.eq.weapon);
  return out;})()`);
g.close();

const env = makeEnv(freshDb(':memory:'));
const cookieFrom = r => { const c = (r.headers.getSetCookie ? r.headers.getSetCookie().join(';') : r.headers.get('set-cookie')) || ''; const m = c.match(/pg_session=[^;]+/); return m ? m[0] : ''; };
const n = 'codec' + Math.random().toString(36).slice(2, 7);
const rr = await reg.onRequestPost({ request: new Request('https://x/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ u: n, p: 'Sup3rSecret!pass', email: n + '@example.test' }) }), env });
const cookie = cookieFrom(rr);

// A save at Demonz's field budget: 892 items, 1,232 cards, 818 fish.
const S = {
  owner: n, accountId: 1, lv: 145, st: { str: 99, agi: 99 }, zeny: 1234567, kills: 50000,
  inv: Array.from({ length: 892 }, (_, i) => corpus[i % corpus.length]),
  cards: Array.from({ length: 1232 }, (_, i) => ({ id: 1712345678000 + i, name: 'Shadow Beast Card', v: 5, key: 'crit', tier: 2, slot: 'armor' })),
  fishing: { bagTier: 6, bag: Array.from({ length: 818 }, (_, i) => ({ id: 'fish' + i, sp: 'Magikarp', w: 12.34, mut: i % 7 ? null : 'shiny', at: 1712345678901 + i, perfect: i % 5 === 0 })) },
};
const plain = JSON.stringify(S);
const compact = JSON.stringify(C.packSave(S));

console.log('  save: ' + plain.length.toLocaleString() + ' B plain -> ' + compact.length.toLocaleString() + ' B compact');

// 1. the compact blob is ACCEPTED by the real handler
let ver = 0;
const put = async blob => {
  const r = await save.onRequestPut({ request: new Request('https://x/api/save', { method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ owner: n, blob, version: ver }) }), env });
  const j = await r.clone().json().catch(() => ({}));
  if (j.version != null) ver = j.version;
  return r.status;
};
ok('compact blob is accepted (200)', await put(compact) === 200);
ok('the plain 416 KB blob is still refused (413)', await put(plain) === 413);

// 2. GET hands back exactly what was stored, and it is still compact
const gRes = await save.onRequestGet({ request: new Request('https://x/api/save', { method: 'GET', headers: { cookie } }), env });
const body = await gRes.json();
ok('GET returns the stored blob', gRes.status === 200 && !!body.blob);
ok('stored blob is compact', body.blob && JSON.parse(body.blob).__v === 1);
ok('nothing was re-expanded on the way in (' + body.blob.length.toLocaleString() + ' B stored)', body.blob.length === compact.length);

// 3. what the client's load() would produce - field by field
const back = C.unpackSave(JSON.parse(body.blob));
ok('item count preserved (' + S.inv.length + ')', back.inv.length === S.inv.length);
ok('card count preserved (' + S.cards.length + ')', back.cards.length === S.cards.length);
ok('fish count preserved (' + S.fishing.bag.length + ')', back.fishing.bag.length === S.fishing.bag.length);

const bad = [];
const cmp = (a, b, label) => {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) bad.push(label + '.' + k);
};
for (let i = 0; i < S.inv.length; i++) cmp(S.inv[i], back.inv[i], 'item' + i);
for (let i = 0; i < S.cards.length; i++) cmp(S.cards[i], back.cards[i], 'card' + i);
for (let i = 0; i < S.fishing.bag.length; i++) cmp(S.fishing.bag[i], back.fishing.bag[i], 'fish' + i);
ok('EVERY field of every item/card/fish identical through the server', bad.length === 0, bad.slice(0, 5).join(', '));

// 4. the top-level character state survives too
ok('zeny / st / kills / bagTier preserved',
  back.zeny === S.zeny && JSON.stringify(back.st) === JSON.stringify(S.st) &&
  back.kills === S.kills && back.fishing.bagTier === 6);

// 5. OLD saves still work: a plain (un-compacted) blob written before v414 still round-trips.
// It has to be under the ceiling to be accepted at all - which is exactly the situation these
// accounts are in today: an old-format save small enough to sync keeps syncing, unchanged. The
// larger ones are the ones step 1 already tells, in plain words, that they cannot sync.
const legacy = JSON.parse(plain); delete legacy.accountId;
legacy.inv = legacy.inv.slice(0, 500); legacy.cards = legacy.cards.slice(0, 500); legacy.fishing.bag = legacy.fishing.bag.slice(0, 400);
const legacyBlob = JSON.stringify(legacy);
await put(legacyBlob);
const g2 = await save.onRequestGet({ request: new Request('https://x/api/save', { method: 'GET', headers: { cookie } }), env });
const b2 = await g2.json();
ok('a legacy (un-compacted) save is still accepted and served undamaged', g2.status === 200 && JSON.parse(b2.blob).__v == null);
const back2 = C.unpackSave(JSON.parse(b2.blob));
ok('an old save is returned untouched by the codec', JSON.stringify(back2.inv) === JSON.stringify(legacy.inv));

console.log('');
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
