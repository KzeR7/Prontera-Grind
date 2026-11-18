// v419: the codec-version check must answer EXACTLY what the pre-v416 reader answered.
//
// History worth keeping: v416 replaced "parse the stored blob and read `__v`" with a text scan for a
// literal `"__v":`. That was wrong, not merely risky. `{"\u005f_v":4}` is `{__v:4}` to JSON.parse but
// contains no literal `"__v"` substring, so the scan classified a compact save as plain and handed v4
// item tuples to a page that cannot decode them. Duplicate keys (`{"__v":4,"__v":2}`) and malformed
// suffixes (`{"__v":4,}`) also made it disagree with JSON.parse in both directions.
//
// v419 removed the scan. The version now comes from a PARSED view: the caller's own (the GET handler
// already parses the stored save for its ownership and claim checks) or, if there is none, a parse by
// the original reader. So the oracle below is not "a reference implementation we hope matches" - it is
// the code from every build before v416, and the suite compares against it over every stored shape.
//
// It also proves the two things the bug could break:
//   * an incompatible client receives the blob EXPANDED (plain items/cards/fish), never raw tuples;
//   * a compatible client receives the stored bytes unchanged (no gratuitous re-encode).
//
// Run: node tools/tests/save_codec_canread_sim.mjs
import assert from 'node:assert/strict';
import * as V from '../../functions/_lib/validate.js';
import * as C from '../../functions/_lib/save-codec.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? ' -> ' + detail : '')); } };

// ---------------------------------------------------------------- oracle ----
// The pre-v416 reader, verbatim in behaviour: parse the text, then read the version the same way every
// deployed build did. This is the only definition of "correct" used here.
const oracle = blob => { try { const o = JSON.parse(blob); return C.isPacked(o) ? Number(o.__v) || 1 : null; } catch { return null; } };
const same = (blob, label) => {
  const got = V.packedVersion(blob), want = oracle(blob);
  ok(label, got === want, 'got ' + String(got) + ', oracle ' + String(want) + ' for ' + JSON.stringify(blob).slice(0, 90));
};

// ------------------------------------------------- 1. adversarial text ----
// Every one of these is a shape a stored save could in principle have. The comparison is purely
// differential: whatever the old reader answered IS the answer.
const adversarial = [
  // The reported bug: an escaped property name that JSON.parse turns into `__v`.
  '{"\\u005f_v":4}',
  '{"\\u005f\\u005f_v":3}',
  '{"\\u005F_v":2}',
  '{"lv":1,"\\u005f_v":4}',
  '{"\\u005f_v":4,"inv":[[1,2]]}',
  // Duplicate keys, including ones with different spacing: the last one wins, as in JSON.parse.
  '{"__v":4,"__v":2}', '{"__v":2,"__v":4}', '{"__v":4, "__v":2}', '{"__v":3}',
  '{"\\u005f_v":4,"__v":2}', '{"__v":4,"\\u005f_v":2}',
  // Whitespace around the colon and inside the object.
  '{"__v" : 4}', '{"__v"\t:\t4}', '{ "__v" : 4 }', '{\n  "__v": 4\n}',
  '{\n"__v"\n:\n4\n}', '{"__v":  \n  4}',
  // Malformed suffixes and shapes JSON.parse rejects.
  '{"__v":4,}', '{"__v":04}', '{"__v":+4}', '{"__v":.4}', '{"__v":4.}', '{"__v":4.5}',
  '{"__v":4e3}', '{"__v":-1}', '{"__v":4', '{"__v":4 ', '{"__v"', '{"__v":', '"__v":4',
  '{"__v":4}}', '{"a":1}{"__v":4}', '', '   ', 'not json', 'null', '[]', '4', '"__v"',
  // Nested and irrelevant placements.
  '{"a":{"__v":9},"__v":3}', '{"a":{"b":{"__v":1}}}', '{"a":[{"__v":7}],"__v":3}',
  '{"nested":{"deep":[{"__v":2}]}}', '[{"__v":1}]', '{"__v":1,"x":{"__v":2}}',
  '{"a":"\\"__v\\":9","__v":4}', '{"a":"__v:9"}', '{"a":"__v"}',
  // Values that are not a usable version.
  '{"__v":"4"}', '{"__v":null}', '{"__v":0}', '{"__v":9999999999}', '{"__v":true}',
  '{"__v":1}', '{"lv":1}', '{"lv":1,"inv":[[1,2]]}',
];
for (const t of adversarial) same(t, 'text ' + JSON.stringify(t).slice(0, 46));
ok('the reported escaped-name payload reads as compact v4', V.packedVersion('{"\\u005f_v":4}') === 4);
ok('  ...and a v2-only page is therefore refused it', V.clientCanRead('{"\\u005f_v":4}', V.SAVE_FORMAT_COMPACT) === false);
ok('  ...while a v4 page receives it', V.clientCanRead('{"\\u005f_v":4}', V.SAVE_FORMAT_V4) === true);

// ------------------------------------------------- 2. real codec output ----
// Every codec version, at several sizes, plus the plain (unpacked) form of the same state.
const state = n => ({
  lv: 150,
  inv: Array.from({ length: n }, (_, i) => ({ id: 'i' + i, slot: 'weapon', wt: 'bow', name: 'x',
    aff: [{ k: 'atk', v: 5 }], cards: [], tier: 2, val: 5, slots: 2, sec: 0, lvl: 1, quality: 1, mp: 0 })),
  cards: [], fishing: { bag: Array.from({ length: n }, (_, i) => ({ id: 'f' + i, sp: 'Magikarp', w: 1.5,
    mut: null, at: 1794873600000 + i, perfect: false, lock: false })) },
});
for (const n of [0, 1, 5, 50]) {
  for (const v of [1, 2, 3, 4]) {
    const packed = JSON.stringify({ ...C.packSave(state(n)), __v: v });
    same(packed, 'codec v' + v + ' with ' + n + ' records');
  }
  const plain = JSON.stringify(state(n));
  same(plain, 'plain save with ' + n + ' records');
  ok('a plain save with ' + n + ' records is not compact', oracle(plain) === null && V.packedVersion(plain) === null);
}
// The production constructor fixture, which is what actually sits at the size ceiling.
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { fullStorageSave } = require('./helpers/full-storage-save.js');
const full = fullStorageSave();
for (const v of [1, 2, 3, 4]) {
  const packed = JSON.stringify({ ...C.packSave({ ...full, owner: 'TEST' }), __v: v });
  same(packed, 'full-storage fixture, codec v' + v + ' (' + packed.length + ' B)');
}

// ------------------------------------- 3. the view path agrees with text ----
// `packedVersion(blob, view)` must answer what `packedVersion(blob)` answers whenever the view really
// is a parse of that blob - this is the sharing the handler relies on, and a wrong view would be a
// silent capability error rather than a crash.
for (const t of ['{"\\u005f_v":4}', '{"__v":2,"__v":4}', '{"lv":1}', '{"a":{"__v":9},"__v":3}',
                 '{"__v":4,}', '{"__v":"4"}']) {
  let view = null;
  try { view = JSON.parse(t); } catch {}
  ok('view path agrees for ' + JSON.stringify(t),
    V.packedVersion(t, view) === V.packedVersion(t),
    'view ' + String(V.packedVersion(t, view)) + ' vs text ' + String(V.packedVersion(t)));
}
ok('a missing view still gets the right answer', V.packedVersion('{"\\u005f_v":4}', null) === 4);
ok('a string view is not mistaken for an object', V.packedVersion('{"__v":4}', '{"__v":4}') === 4);

// --------------------------------------------- 4. what a page is served ----
// The capability matrix: this is the decision that protects older clients.
const matrix = [
  [0, null, true], [0, 1, false], [0, 2, false], [0, 4, false], [0, 5, false],
  [110, null, true], [110, 1, true], [110, 2, true], [110, 3, false], [110, 4, false],
  [111, 1, true], [111, 2, true], [111, 3, true], [111, 4, false],
  [112, 1, true], [112, 2, true], [112, 3, true], [112, 4, true], [112, 5, false],
];
for (const [format, v, want] of matrix) {
  const blob = v === null ? '{"lv":1,"inv":[[1,2]]}' : JSON.stringify({ __v: v, inv: [[1, 2]] });
  ok('format ' + format + (v === null ? ' (plain row)' : ' gets codec v' + v) + ' = ' + want,
    V.clientCanRead(blob, format) === want);
}

// A client that cannot read the row must be handed EXPANDED items, never tuples. This is the integrity
// half of the same contract: the version number only matters because of what is inside the blob.
{
  const plainState = { owner: 'TEST', lv: 150, cls: 'Novice',
    inv: [{ id: 'i1', slot: 'weapon', wt: 'bow', name: 'Bow', aff: [{ k: 'atk', v: 5 }], cards: [], tier: 2,
            val: 5, slots: 2, sec: 0, lvl: 1, quality: 1, mp: 0, refine: 3, lock: false }],
    cards: [], fishing: { bag: [] } };
  for (const v of [1, 2, 3, 4]) {
    const stored = JSON.stringify({ ...C.packSave(plainState), __v: v });
    ok('fixture v' + v + ' really is compact tuples', Array.isArray(JSON.parse(stored).inv[0]),
      JSON.stringify(JSON.parse(stored).inv[0]).slice(0, 40));
    // Every format below v: expanded, and the expansion is decodable again.
    for (const format of [0, 110, 111]) {
      if (V.clientCanRead(stored, format)) continue;
      const served = V.blobForClient(stored, format);
      const obj = JSON.parse(served);
      ok('  v' + v + ' row to format ' + format + ' is expanded, not tuples',
        !Array.isArray(obj.inv[0]) && obj.inv[0].id === 'i1' && obj.inv[0].refine === 3);
      // The expansion is a PLAIN save - `unpackSave` drops the codec marker - which is exactly what
      // makes it readable by a page that has no codec at all. Carrying `__v` forward would mark it
      // compact again and re-refuse it.
      ok('  ...and the expansion is a plain save with no codec marker',
        !('__v' in obj) && V.clientCanRead(served, 0) === true);
    }
    // A capable client gets the bytes exactly as stored.
    if (V.clientCanRead(stored, 112)) ok('  v' + v + ' row to format 112 is byte-identical', V.blobForClient(stored, 112) === stored);
  }
  // The escaped-name payload must also be expanded for an old page, not passed through.
  const escaped = '{"\\u005f_v":4,"owner":"TEST","lv":150,"inv":[[1,"i1","weapon","bow","Bow",5,2,[["atk",5]],[],0,2,3,1,1,0,false]]}';
  const served = V.blobForClient(escaped, 0);
  ok('the escaped-name compact row is expanded for a legacy page', !Array.isArray(JSON.parse(served).inv[0]),
    served.slice(0, 120));
}

// ------------------------------------- 5. the view path serves the same ----
// Passing the view must not change what is served (it is the same decision, only cheaper).
{
  const stored = JSON.stringify({ ...C.packSave({ owner: 'T', lv: 3, inv: [{ id: 'i', slot: 'weapon', wt: 'bow',
    name: 'B', aff: [], cards: [], tier: 1, val: 1, slots: 0, sec: 0, lvl: 1, quality: 1, mp: 0 }] }), __v: 4 });
  const view = JSON.parse(stored);
  for (const format of [0, 110, 111, 112]) {
    ok('view path serves the same bytes at format ' + format,
      V.blobForClient(stored, format, view) === V.blobForClient(stored, format));
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
