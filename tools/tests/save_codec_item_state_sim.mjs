// Codec v4: compress item state without confusing absent/+0, absent/unlocked, or historical extras.
// Size/fidelity at full storage lives in save_max_state_sim; this suite pins the new wire contract.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as C from '../../functions/_lib/save-codec.js';
import { clientCanRead, blobForClient, SAVE_FORMAT_V4 } from '../../functions/_lib/validate.js';

const require = createRequire(import.meta.url), { createGame } = require('./helpers/game');
const history = JSON.parse(readFileSync(new URL('./fixtures/save_codec_item_history.json', import.meta.url)));
const norm = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const equal = (a, b, label) => assert.equal(norm(a), norm(b), label);
const wire = o => JSON.parse(JSON.stringify(o));
const g = createGame();
const page = (fn, o) => JSON.parse(g.ev(`JSON.stringify(${fn}(${JSON.stringify(o)}))`));
const base = JSON.parse(g.ev(`JSON.stringify(genGear({k:'bow',n:ABYSS_ASCENDED.w.bow,quality:ABYSS_ASCENDED_QUALITY},145,5,false,undefined,9,15))`));
let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.error('  FAIL ' + name + ' -> ' + e.message); }
};

try {
  test('page/server version and advertised capability advance together', () => {
    assert.equal(C.CODEC_VERSION, 4);
    assert.equal(g.ev('SAVE_CODEC_VERSION'), 4);
    assert.equal(SAVE_FORMAT_V4, 112);
    assert.equal(g.ev('SAVE_FORMAT'), SAVE_FORMAT_V4);
  });

  test('item slot/weapon enum ids are permanent, and old positional slots are unchanged', () => {
    assert.equal(C.CODE_LAYOUT.BITEM.length, 13, 'legacy extras must stay at index 13');
    const slots = ['weapon', 'armor', 'head', 'off', 'leg', 'acc'];
    const weapons = ['sword', 'axe', 'mace', 'staff', 'dagger', 'katar', 'bow'];
    // Only append enum members. Renumbering changes the meaning of already-stored items.
    for (const [i, slot] of slots.entries()) {
      const it = { ...base, slot };
      assert.equal(C.packItem(it)[1], i, slot);
      assert.equal(page('cPackItem', it)[1], i, 'page ' + slot);
    }
    for (const [i, wt] of weapons.entries()) {
      const it = { ...base, wt };
      assert.equal(C.packItem(it)[2], i, wt);
      assert.equal(page('cPackItem', it)[2], i, 'page ' + wt);
    }
  });

  test('affix stat enum ids are permanent and unknown/non-string stat keys stay literal', () => {
    const stats = ['str', 'agi', 'dex', 'int', 'vit', 'luk', 'hp', 'atk', 'matk', 'crit', 'aspd', 'cdm', 'flee', 'move', 'def', 'mdef'];
    for (const [i, k] of stats.entries()) {
      const it = { ...base, aff: [{ k, v: 12 }] };
      assert.equal(C.packItem(it)[6][0][0], i, k);
      assert.equal(page('cPackItem', it)[6][0][0], i, 'page ' + k);
      equal(C.unpackItem(wire(C.packItem(it))), it);
      equal(page('cUnpackItem', wire(C.packItem(it))), it);
    }
    for (const k of ['future-stat', 0, 1, null]) {
      const it = { ...base, aff: [{ k, v: 12, future: 'keep' }] };
      equal(page('cUnpackItem', wire(C.packItem(it))), it);
      equal(C.unpackItem(page('cPackItem', it)), it);
    }
  });

  test('all 51 supported refinement/lock states preserve presence and value in BOTH directions', () => {
    const ranks = [undefined, ...Array.from({ length: 16 }, (_, i) => i)];
    for (const r of ranks) for (const locked of [undefined, false, true]) {
      const it = { ...base };
      if (r !== undefined) it.r = r;
      if (locked !== undefined) it.locked = locked;
      const packed = wire(C.packItem(it)), inPage = page('cPackItem', it);
      assert.equal(packed[13], (r === undefined ? 0 : r + 1) * 3 + (locked === undefined ? 0 : locked ? 2 : 1));
      assert.equal(packed.length, 14, 'no repeated r/locked extras on a normal item');
      equal(packed, inPage, 'page/server wire mismatch');
      equal(C.unpackItem(packed), it, 'server round trip');
      equal(page('cUnpackItem', packed), it, 'server -> page');
      equal(C.unpackItem(inPage), it, 'page -> server');
    }
  });

  test('unknown strings and fields, including nested affix metadata, survive cross-codec reads', () => {
    const it = { ...base, slot: 'future-slot', wt: 'future-weapon', r: 15, locked: false,
      futureSet: { key: 'do not drop' }, aff: [{ k: 'dex', v: 12, rolled: 42 }] };
    equal(page('cUnpackItem', wire(C.packItem(it))), it);
    equal(C.unpackItem(page('cPackItem', it)), it);
  });

  test('unsupported rank/lock/enum values fall back verbatim instead of being normalised', () => {
    const variants = {
      r: [null, -1, 16, 1.5, '10', false, { future: 1 }],
      locked: [null, 0, 1, 'true', [], { future: 1 }],
      slot: [null, 0, 1, false, [], {}],
      wt: [null, 0, 1, false, [], {}],
    };
    for (const [key, values] of Object.entries(variants)) for (const v of values) {
      const it = { ...base, r: 10, locked: true, [key]: v };
      const p = wire(C.packItem(it));
      assert.equal(typeof p[13], 'object', key + ': unexpected v4 state trailer');
      equal(C.unpackItem(p), it, key);
      equal(page('cUnpackItem', p), it, 'server -> page ' + key);
      equal(C.unpackItem(page('cPackItem', it)), it, 'page -> server ' + key);
    }
  });

  test('a minimal/partial item never gains refinement, lock or category fields', () => {
    for (const it of [{}, { id: 0 }, { slot: 'armor', r: 0 }, { slot: 'armor', locked: false }]) {
      equal(C.unpackItem(wire(C.packItem(it))), it);
      equal(page('cUnpackItem', wire(C.packItem(it))), it);
    }
  });

  for (const { revision, blob } of history.versions) {
    test('frozen v' + blob.__v + ' output from ' + revision + ' still decodes, including its extras object', () => {
      equal(C.unpackSave(blob), history.expected);
      equal(page('unpackSave', blob), history.expected);
      const now = C.packSave(history.expected);
      assert.equal(g.ev(`sameSave(${JSON.stringify(JSON.stringify(blob))},${JSON.stringify(JSON.stringify(now))})`), true,
        'equivalent historical/current saves must compare as the same progress');
    });
  }

  test('normal +10 locked bows shrink without changing their ids, rolls or cards', () => {
    const before = history.versions.find(v => v.blob.__v === 3).blob.inv[0];
    const it = history.expected.inv[0], after = C.packItem(it);
    assert.ok(JSON.stringify(after).length < JSON.stringify(before).length - 25);
    equal(C.unpackItem(wire(after)), it);
  });

  test('every stored codec version is served only to a page that can decode it', () => {
    const rows = [...history.versions.map(v => v.blob), C.packSave(history.expected)];
    for (const row of rows) for (const format of [0, 109, 110, 111, 112]) {
      const text = JSON.stringify(row);
      const min = row.__v <= 2 ? 110 : row.__v === 3 ? 111 : 112;
      assert.equal(clientCanRead(text, format), format >= min, 'v' + row.__v + ' -> ' + format);
      const body = JSON.parse(blobForClient(text, format));
      assert.equal(body.__v, format >= min ? row.__v : undefined);
      equal(C.unpackSave(body), history.expected);
    }
    assert.equal(clientCanRead(JSON.stringify(history.expected), 0), true);
    assert.equal(clientCanRead('{"lv":150,"__v":5}', 112), false, 'no invented future capability');
  });
} finally { g.close(); }

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
