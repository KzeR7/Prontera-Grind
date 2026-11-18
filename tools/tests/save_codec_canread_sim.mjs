// v416: the codec-version check reads the stored blob's text instead of parsing it.
//
// `blobForClient` runs on every GET /api/save and on every conflict reply, and it used to `JSON.parse`
// the whole stored blob (up to the 300 KB ceiling) just to read `__v`. This suite is the proof that the
// replacement answers EXACTLY what the previous reader answered - not "usually", not "for our own
// output", but on every input including malformed and adversarial ones, because the fallback rule is
// "anything the fast path is unsure about goes to the reference implementation".
//
// It fails if the two ever disagree, if a plain (unpacked) save starts looking packed, or if a compact
// row stops being recognised - the failure mode that would hand a v4 blob to a v3-only page.
import assert from 'node:assert/strict';
// The fast reader must agree with the PRE-v416 reader on every input. Oracle = the old implementation.
import * as V from '../../functions/_lib/validate.js';
import * as C from '../../functions/_lib/save-codec.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? ' -> ' + detail : '')); } };
const old = blob => { try { const o = JSON.parse(blob); return C.isPacked(o) ? Number(o.__v) || 1 : null; } catch { return null; } };
const cases = [
  '{"lv":1,"__v":4}', '{"lv":1,"__v":4,"inv":[[1,2]]}', '{"a":{"__v":9},"__v":3}',
  '{"a":"\\"__v\\":9","__v":4}', '{"__v":4}', '{"lv":1}', '{"__v":4', 'not json', '',
  '{"__v":"4"}', '{"__v":9999999999}', '{"nested":{"deep":[{"__v":2}]}}', '{"__v": 4}',
  '{"__v" : 4}', '{"__v":0}', '{"__v":null}', '{"__v":4.5}', '{"__v":4e3}', '{"__v":-1}',
  '{"a":[{"__v":7}],"__v":3}', '{"a":{"b":{"__v":1}}}', '[{"__v":1}]', '{"__v":1,"x":{"__v":2}}',
];
for (const t of cases) {
  const got = V.packedVersion(t), want = old(t);
  ok('text case ' + JSON.stringify(t) + ' answers ' + String(want), got === want, 'got ' + got);
}
// Agreement over real codec output, at every codec version and size.
for (const n of [0, 1, 5, 50]) {
  const save = { lv: 150, inv: Array.from({length:n},(_,i)=>({id:'i'+i, slot:'weapon', wt:'bow', name:'x', aff:[{k:'atk',v:5}], cards:[], tier:2, val:5, slots:2, sec:0, lvl:1, quality:1, mp:0})),
    cards: [], fishing: { bag: Array.from({length:n},(_,i)=>({id:'f'+i, sp:'Magikarp', w:1.5, mut:null, at:1794873600000+i, perfect:false, lock:false})) } };
  for (const v of [1,2,3,4]) {
    const packed = JSON.stringify({ ...C.packSave(save), __v: v });
    const got = V.packedVersion(packed), want = old(packed);
    ok('codec v' + v + ' with ' + n + ' records', got === want, 'got ' + got + ' want ' + want);
  }
  const plain = JSON.stringify(save);
  ok('a plain save with ' + n + ' records is not packed', V.packedVersion(plain) === old(plain) && old(plain) === null);
}
// The capability matrix is unchanged: this is what a page is actually served.
ok('a v4 row is not offered to a page without the codec', V.clientCanRead('{"__v":4}', 0) === false);
ok('a v4 row is offered to a v4 page', V.clientCanRead('{"__v":4}', V.SAVE_FORMAT_V4) === true);
ok('a v4 row is NOT offered to a v3-only page', V.clientCanRead('{"__v":4}', V.SAVE_FORMAT_V3) === false);
ok('a plain save is readable by everyone', V.clientCanRead('{"lv":1}', 0) === true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
