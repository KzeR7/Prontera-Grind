// v419: what each client build is actually SERVED, through the real handlers.
//
// The unit-level reader test (save_codec_canread_sim.mjs) proves the version decision is identical to
// the pre-v416 `JSON.parse` reader. This suite proves the consequence at the API boundary, which is the
// thing that can lose items:
//
//   * a page with NO X-Save-Format header (every build before v414), 110 (the first compact codec) and
//     111 (catalog references, delta fish timestamps) must be handed EXPANDED items - plain objects with
//     `id`/`slot`/`refine` fields and 13-digit fish timestamps - never raw tuples;
//   * a 112 page must be handed the stored bytes unchanged;
//   * this holds on GET *and* on a 409 conflict reply, because a conflict reply carries the live blob
//     and a page that cannot decode it will adopt it and lose what it could not read.
//
// The stored row is written as a v4 codec blob whose `__v` key is spelled with a JSON escape
// (`"\u005f_v"` -> `__v`). That is the regression this suite exists for: a reader that looks for the
// literal text `"__v":` sees no marker, calls the row plain, and serves raw tuples to a 109-build page.
//
// Run: node tools/tests/save_format_parity_sim.mjs
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeD1, makeEnv } from '../../tools/dev_server.js';
import * as reg from '../../functions/api/register.js';
import * as save from '../../functions/api/save.js';
import * as C from '../../functions/_lib/save-codec.js';
import { SAVE_FORMAT_COMPACT, SAVE_FORMAT_V3, SAVE_FORMAT_V4 } from '../../functions/_lib/validate.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? ' -> ' + detail : '')); } };

// A local database the test can also write to directly: some rows are WRITTEN BY MIGRATIONS, by the GM
// restore path, or by an older build, and are stored exactly as that writer serialised them. A reader
// must decide what a page can decode from the stored text, never from an assumption about who wrote it.
const here = path.dirname(fileURLToPath(import.meta.url));
const sqlite = new DatabaseSync(':memory:');
for (const name of fs.readdirSync(path.join(here, '..', '..', 'migrations')).filter(n => /^\d+_.*\.sql$/.test(n)).sort())
  sqlite.exec(fs.readFileSync(path.join(here, '..', '..', 'migrations', name), 'utf8'));
const env = makeEnv(sqlite);
const cookieFrom = r => {
  const c = (r.headers.getSetCookie ? r.headers.getSetCookie().join(';') : r.headers.get('set-cookie')) || '';
  const m = c.match(/pg_session=[^;]+/);
  return m ? m[0] : '';
};
const name = 'parity' + Math.random().toString(36).slice(2, 7);
const rr = await reg.onRequestPost({ request: new Request('https://x/api/register', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ u: name, p: 'Sup3rSecret!pass', email: name + '@example.test' }) }), env });
const cookie = cookieFrom(rr);
assert(cookie, 'registered a session');

// A save with every field the codec compresses: refined/locked item state, a socketed card, a fish.
const state = {
  owner: name, lv: 145, cls: 'Novice', zeny: 1234, kills: 9, pts: 4, sex: 'm', exp: 1, hp: 300,
  st: { str: 99, agi: 99, dex: 1, luk: 1, int: 1, vit: 5 }, eq: {}, cards: [], pets: [], base: {},
  inv: [{ id: 'i1', slot: 'weapon', wt: 'bow', name: 'Bow', aff: [{ k: 'atk', v: 12 }], cards: [], tier: 3,
          val: 55, slots: 2, sec: 1, lvl: 2, quality: 1, mp: 0, refine: 3, lock: true }],
  fishing: { bagTier: 3, bag: [{ id: 'f1', sp: 'Magikarp', w: 12.34, mut: 'shiny', at: 1712345678901, perfect: true, lock: false }] },
};

// The stored form: v4 codec, with the marker key spelled `\u005f_v` so a literal text search cannot see it.
const packed = { ...C.packSave(state), __v: 4 };
const stored = JSON.stringify(packed).replace('"__v":4', '"\\u005f_v":4');
ok('the fixture really hides its marker from a literal search', !stored.includes('"__v":') && JSON.parse(stored).__v === 4);
ok('the fixture really is compact tuples', Array.isArray(JSON.parse(stored).inv[0]), JSON.stringify(JSON.parse(stored).inv[0]).slice(0, 50));

// Store it through the real PUT (a 112 page), then read it back every way a client can ask for it.
const put = (blob, version, format) => save.onRequestPut({ request: new Request('https://x/api/save', {
  method: 'PUT',
  headers: { 'content-type': 'application/json', cookie, ...(format == null ? {} : { 'x-save-format': String(format) }) },
  body: JSON.stringify({ owner: name, blob, version }) }), env });
const get = format => save.onRequestGet({ request: new Request('https://x/api/save', {
  method: 'GET', headers: { cookie, ...(format == null ? {} : { 'x-save-format': String(format) }) } }), env });

const first = await put(stored, 0, SAVE_FORMAT_V4);
const firstBody = await first.json();
ok('the compact row is accepted from a v4 page (200)', first.status === 200, 'status ' + first.status);
ok('  ...with a version to sync against', typeof firstBody.version === 'number');
const version = firstBody.version;
// The server stamps its own identity into the stored text (account id, name), so the authoritative bytes
// are read back from the row - what the handler RETURNED is only what the test sent.
const storedByServer = await (async () => {
  const r = await get(SAVE_FORMAT_V4);
  return (await r.json()).blob;
})();
ok('the server kept the row compact after re-stamping', !!storedByServer && Array.isArray(JSON.parse(storedByServer).inv[0]),
  String(storedByServer).slice(0, 100));
ok('  ...including the marker that decides who may read it', JSON.parse(storedByServer).__v === 4);

const expanded = blob => {
  const o = JSON.parse(blob);
  const item = o.inv && o.inv[0];
  return !!item && !Array.isArray(item) && item.id === 'i1' && item.refine === 3 && item.lock === true
    && typeof item.slot === 'string' && item.slot === 'weapon'
    && o.fishing.bag[0].at === 1712345678901;
};
const stillCompact = blob => Array.isArray(JSON.parse(blob).inv[0]);

for (const [label, format] of [['no header (pre-v414 builds)', null], ['110 (first compact codec)', SAVE_FORMAT_COMPACT],
                               ['111 (catalog refs, no item enums)', SAVE_FORMAT_V3]]) {
  const res = await get(format);
  const body = await res.json();
  ok('GET with ' + label + ' answers 200', res.status === 200, 'status ' + res.status);
  ok('  ...serves EXPANDED items, never tuples', expanded(body.blob), String(body.blob).slice(0, 120));
  ok('  ...serves the authoritative version', body.version === version);
  ok('  ...and is a plain save a codec-less page can re-read', JSON.parse(body.blob).__v == null);
}
{
  const res = await get(SAVE_FORMAT_V4);
  const body = await res.json();
  ok('GET with a 112 page is byte-identical to what was stored', body.blob === storedByServer);
  ok('  ...and still reports the same version', body.version === version);
}

// 409: a stale version must still carry a blob the asking page can decode.
for (const [label, format] of [['no header', null], ['110', SAVE_FORMAT_COMPACT], ['111', SAVE_FORMAT_V3]]) {
  const res = await put(JSON.stringify({ owner: name, lv: 145, inv: [] }), version - 1, format);
  const body = await res.json();
  ok('409 to a ' + label + ' page keeps its status and conflict flag',
    res.status === 409 && body.conflict === true, 'status ' + res.status);
  ok('  ...and carries EXPANDED items', expanded(body.blob), String(body.blob).slice(0, 120));
  ok('  ...with the live version', body.version === version);
}
{
  // The page that cannot decode the row must be able to SAVE BACK what it was given, or adopting a
  // conflict would silently drop the item's refine/lock state on its next upload.
  const conflict = await (await put(JSON.stringify({ owner: name, lv: 145, inv: [] }), version - 1, null)).json();
  const resaved = await put(conflict.blob, version, null);
  ok('a legacy page can save back the expanded blob it was handed', resaved.status === 200, 'status ' + resaved.status);
  const after = await (await get(SAVE_FORMAT_V4)).json();
  ok('  ...and the refined/locked item survived the round trip',
    JSON.parse(after.blob).inv[0].refine === 3 && JSON.parse(after.blob).inv[0].lock === true,
    String(after.blob).slice(0, 140));
}

// A row stored by SOMEONE ELSE's writer, not normalised by this handler.
//
// This is the reported regression verbatim. The row below is a valid v4 codec blob whose `__v` key is
// spelled with a JSON escape, written straight into storage the way a migration, a restore or an older
// tool could. A reader that searches the text for a literal `"__v":` finds nothing, calls the row plain,
// and hands v4 item tuples to a 109-build page - which drops them, because the old loader keeps only
// rows it recognises. Nothing in this suite goes through PUT for this row, so nothing normalises it.
{
  const userId = sqlite.prepare('SELECT id FROM users WHERE username = ?').get(name).id;
  const escapedState = { owner: name, lv: 145, cls: 'Novice', zeny: 99, kills: 1, pts: 1, sex: 'm', exp: 1,
    hp: 300, st: { str: 9, agi: 1, dex: 1, luk: 1, int: 1, vit: 5 }, eq: {}, cards: [], pets: [], base: {},
    inv: [{ id: 'i9', slot: 'armor', wt: 'armor', name: 'Plate', aff: [], cards: [], tier: 3, val: 9,
            slots: 0, sec: 0, lvl: 1, quality: 1, mp: 0, refine: 2, lock: true }],
    fishing: { bagTier: 1, bag: [] } };
  const escapedBlob = JSON.stringify({ ...C.packSave(escapedState), __v: 4 }).replace('"__v":4', '"\\u005f_v":4');
  ok('the seeded row hides its marker from a literal text search', !escapedBlob.includes('"__v":'));
  ok('  ...and is still a valid v4 compact row to JSON.parse', JSON.parse(escapedBlob).__v === 4 && Array.isArray(JSON.parse(escapedBlob).inv[0]));
  const before = sqlite.prepare('SELECT version, saved_at FROM saves WHERE user_id = ?').get(userId);
  sqlite.prepare('UPDATE saves SET blob = ? WHERE user_id = ?').run(escapedBlob, userId);

  for (const [label, format] of [['no header', null], ['110', SAVE_FORMAT_COMPACT], ['111', SAVE_FORMAT_V3]]) {
    const res = await get(format);
    const body = await res.json();
    const served = JSON.parse(body.blob);
    ok('a row seeded with an escaped marker is EXPANDED for a ' + label + ' page',
      !Array.isArray(served.inv[0]) && served.inv[0].id === 'i9' && served.inv[0].refine === 2,
      String(body.blob).slice(0, 110));
    ok('  ...and the page is not silently handed the row as-is', body.blob !== escapedBlob);
  }
  const v4 = await (await get(SAVE_FORMAT_V4)).json();
  ok('a 112 page still receives the seeded row unchanged', v4.blob === escapedBlob);
  ok('  ...at the version already stored', v4.version === before.version);

  // The same rule on a conflict reply: a stale PUT from a legacy page must not receive tuples either.
  const conflict = await put(JSON.stringify({ owner: name, lv: 145, inv: [] }), before.version - 1, null);
  const conflictBody = await conflict.json();
  ok('a conflict against the seeded row is a 409 for a legacy page', conflict.status === 409, 'status ' + conflict.status);
  ok('  ...carrying expanded items, not tuples', !Array.isArray(JSON.parse(conflictBody.blob).inv[0]),
    String(conflictBody.blob).slice(0, 110));
}

// A plain (never-compacted) stored row is served as-is to everyone, including an old page.
{
  const plainSave = JSON.stringify({ ...state, inv: [{ ...state.inv[0], refine: 0, lock: false }] });
  const res = await put(plainSave, (await (await get(SAVE_FORMAT_V4)).json()).version, null);
  ok('a plain save is accepted with no format header', res.status === 200, 'status ' + res.status);
  const storedPlain = (await (await get(SAVE_FORMAT_V4)).json()).blob;
  const ageBody = await (await get(null)).json();
  // A row with no codec marker is everyone's to read: served exactly as stored, not re-encoded.
  ok('a plain row is served byte-identically, even to an old page',
    ageBody.blob === storedPlain && JSON.parse(ageBody.blob).__v == null, String(ageBody.blob).slice(0, 100));
  ok('  ...and it really is the plain save the server stored', JSON.parse(ageBody.blob).inv[0].refine === 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
