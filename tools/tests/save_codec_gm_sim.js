// v414 regression test: every route that READS A STORED BLOB must unpack it first.
//
// Three separate defects were found while auditing the v414 compact save. They share one cause:
// the stored blob is now sometimes a compact (tuple) save, and code that reads it assumed the
// ordinary object shape. Each one is pinned here so it cannot come back.
//
//   1. POST /api/gm/player  restore-unlock  re-stringified tuple rows (page then unpacked twice)
//   2. POST /api/gm/player  restore         same defect on the restore path
//   3. gm-tools inspectSave / equipmentPayload  read .id/.slot/.wt on tuple rows -> item not found
//   4. index.html load()  dropped the fishing `lock` flag, so a protected fish could be sold
//
// Run: node tools/tests/save_codec_gm_sim.js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { freshDb, makeEnv } from '../dev_server.js';
import { onRequestPost as register } from '../../functions/api/register.js';
import { onRequestPost as gmPlayer } from '../../functions/api/gm/player.js';
import { onRequestGet as saveGet, onRequestPut as savePut } from '../../functions/api/save.js';
import { inspectSave, equipmentPayload } from '../../functions/_lib/gm-tools.js';
import { packSave, unpackSave } from '../../functions/_lib/save-codec.js';

const require = createRequire(import.meta.url), { createGame } = require('./helpers/game');
const sqlite = freshDb(), env = makeEnv(sqlite);
let count = 0;
const test = async (name, fn) => { await fn(); count++; console.log('ok ' + name); };

const call = async (fn, cookie, body, url = '/api/test', method) => {
  const res = await fn({ env, request: new Request('https://pg.local' + url, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', Cookie: cookie || '' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) });
  return { res, data: await res.json().catch(() => ({})) };
};

// canonical compare: JSON key order is not part of a save's meaning
const canon = v => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

const game = createGame();
// A real save from the real constructors - never hand-written shapes.
const realSave = () => {
  const s = game.ev(`(()=>{ const S=load();
    S.inv=[]; for(let i=0;i<12;i++)S.inv.push(genGear({k:['armor','head','weapon'][i%3],n:'Plate Armor',quality:1},145,i%3,false,undefined,i%10,10));
    S.cards=[]; for(let i=0;i<5;i++)S.cards.push(newCard(cardDefinition(i%4,i%2,i%2===0)));
    S.fishing.bag=[{id:'keep',sp:'Magikarp',w:9.5,mut:null,at:1,perfect:false,lock:true}];
    S.zeny=777; S.owner='CompactTest'; return JSON.parse(JSON.stringify(S)); })()`);
  return s;
};

try {
  const player = (await call(register, '', { u: 'CompactTest', p: 'test-password-only', email: 'c@example.test' })).res.headers.get('set-cookie').split(';')[0];
  const playerId = sqlite.prepare('SELECT id FROM users WHERE username=?').get('CompactTest').id;
  sqlite.prepare('UPDATE users SET gm=2 WHERE id=1').run();
  const gm = (await call(register, '', { u: 'GmTest', p: 'test-password-only', email: 'g@example.test' })).res.headers.get('set-cookie').split(';')[0];
  sqlite.prepare('UPDATE users SET gm=2 WHERE username=?').run('GmTest');

  // Put a COMPACT save in the database exactly the way /api/save stores it.
  const ordinary = realSave();
  const compactText = JSON.stringify(packSave(ordinary));
  // The page uploads JSON.stringify(packSave(S)) - send exactly that, so the row really is compact.
  const put = await call(savePut, player, { version: 0, blob: compactText, owner: 'CompactTest' }, '/api/save', 'PUT');
  assert.equal(put.res.status, 200, 'compact save accepted: ' + JSON.stringify(put.data));
  const storedText = sqlite.prepare('SELECT blob FROM saves').get().blob;
  // The row is the compact form plus the server's owner/accountId stamp. Asserting the SHAPE, not
  // the exact bytes, is what matters: tuples present, and the compact form was not thrown away.
  {
    const row = JSON.parse(storedText);
    assert.ok(row.__v >= 1, 'the compact marker survives the write');
    assert.ok(Array.isArray(row.inv[0]), 'inventory rows stay tuples - stamping must not unpack the save');
    assert.ok(Array.isArray(row.cards[0]), 'card rows stay tuples');
    assert.ok(Array.isArray(row.fishing.bag[0]), 'fish rows stay tuples');
    assert.equal(row.accountId, 1, 'the durable stamp is applied');
    assert.ok(storedText.length < JSON.stringify(ordinary).length, 'the row is smaller than the plain form');
  }

  await test('gm-tools inspectSave reads a compact blob the same as an ordinary one', () => {
    const fromCompact = inspectSave(storedText), fromPlain = inspectSave(JSON.stringify(ordinary));
    assert.ok(same(fromCompact, fromPlain), 'inspectSave must not depend on the stored shape');
    assert.equal(fromCompact.inventory.length, ordinary.inv.length);
    for (let i = 0; i < ordinary.inv.length; i++)
      assert.equal(fromCompact.inventory[i].id, ordinary.inv[i].id, 'inventory item ' + i + ' id');
    assert.equal(fromCompact.cards.length, ordinary.cards.length);
    assert.equal(fromCompact.cards[0].n, ordinary.cards[0].n, 'card name survives');
  });

  await test('gm-tools equipmentPayload finds an item by id in a compact blob', () => {
    const target = ordinary.inv.find(i => i.slot === 'armor');
    const fromCompact = equipmentPayload({ itemId: target.id, mode: 'affixes', refine: 0, aff: [] }, storedText);
    const fromPlain = equipmentPayload({ itemId: target.id, mode: 'affixes', refine: 0, aff: [] }, JSON.stringify(ordinary));
    assert.deepEqual(fromCompact, fromPlain, 'the GM edit must target the same item either way');
    assert.equal(fromCompact.itemId, target.id);
  });

  // The two failures that started this audit: both GM routes re-stringified a parsed save without
  // unpacking, so the row kept `__v` over tuple rows and the page unpacked a second time.
  // A GM rewrite must leave a row that is CONSISTENT: either the ordinary shape, or the compact shape
  // with `__v` set - never tuples without `__v` (the page would then read tuples as items). The
  // original defect was a mix: `__v` still on the row over tuple rows, so the page unpacked twice.
  const tupleRowIsClean = (text, label) => {
    const parsed = JSON.parse(text);
    assert.ok(Array.isArray(parsed.inv), label + ': inventory is still a list');
    assert.ok(parsed.inv.length > 0, label + ': items are still there');
    if (parsed.__v == null) {
      assert.ok(parsed.inv.every(i => i && !Array.isArray(i)), label + ': an ordinary row holds objects');
    } else {
      assert.ok(parsed.inv.every(Array.isArray), label + ': a compact row holds tuples');
      const round = unpackSave(parsed);
      assert.ok(Array.isArray(round.inv) && !Array.isArray(round.inv[0]), label + ': unpacks to objects');
    }
    return parsed;
  };

  await test('GM unlock rewrites a compact blob into a consistent row', async () => {
    const r = await call(gmPlayer, gm, { id: playerId, action: 'unlock' }, '/api/gm/player');
    assert.equal(r.res.status, 200, 'restore-unlock answered: ' + JSON.stringify(r.data));
    tupleRowIsClean(sqlite.prepare('SELECT blob FROM saves').get().blob, 'unlock');
    // Every item still exists - nothing a player owns may disappear. Unpack first: the row keeps the
    // compact shape, so its inv holds tuples rather than objects.
    const after = unpackSave(JSON.parse(sqlite.prepare('SELECT blob FROM saves').get().blob));
    assert.equal(after.inv.length, ordinary.inv.length, 'no item was lost by the rewrite');
    // Compare as strings: item ids are float timestamps, and the live copy carries the page's own
    // `locked` repair flag, so object identity is the wrong test. Every id must still be present.
    const idSet = list => list.map(i => String(i.id)).sort().join('|');
    assert.equal(idSet(after.inv), idSet(ordinary.inv), 'no item id was lost by the rewrite');
  });

  await test('GM restore (version rollback) stores an ordinary blob the page can read', async () => {
    // A second save so there is a history version to roll back to.
    await call(savePut, player, { version: 1, blob: compactText, owner: 'CompactTest' }, '/api/save', 'PUT');
    const hist = sqlite.prepare('SELECT version FROM save_history WHERE user_id=? ORDER BY version LIMIT 1').get(playerId);
    assert.ok(hist, 'a history version exists to restore');
    const r = await call(gmPlayer, gm, { id: playerId, action: 'restore', version: hist.version, note: 'regression test' }, '/api/gm/player');
    assert.equal(r.res.status, 200, 'restore answered: ' + JSON.stringify(r.data));
    tupleRowIsClean(sqlite.prepare('SELECT blob FROM saves').get().blob, 'restore');
  });

  // Reported by review: GM unlock/restore stored the ORDINARY shape, expanding a 169 KB row to
  // 322 KB - past the 300 KB ceiling - so that expanded blob entered history and restoring it later
  // was refused with 413. A GM edit must never enlarge the row past the limit it was stored under.
  await test('GM edits keep the stored format, so a restore of history never 413s', async () => {
    // A restore revokes every session on the account (haven-v403), so this test signs in its own.
    const freshPlayer = (await call(register, '', { u: 'FormatTest', p: 'test-password-only', email: 'f@example.test' })).res.headers.get('set-cookie').split(';')[0];
    const freshId = sqlite.prepare('SELECT id FROM users WHERE username=?').get('FormatTest').id;
    const big = game.ev(`(()=>{const S=load();const sl=['weapon','armor','head','off','leg','acc'];
      S.inv=[];for(let i=0;i<850;i++)S.inv.push(genGear({k:sl[i%6],n:'Rare Plate Armor',quality:1},145,i%4,false,undefined,i%10,10));
      S.cards=[];for(let i=0;i<450;i++)S.cards.push(newCard(cardDefinition(i%10,i%4,i%2===0)));
      S.fishing.bag=[];for(let i=0;i<400;i++)S.fishing.bag.push({id:'f'+i,sp:'Magikarp',w:1+(i%3000),mut:null,at:i,perfect:i%2===0,lock:i%7===0});
      S.owner='FormatTest';return JSON.parse(JSON.stringify(S))})()`);
    const packedBig = packSave(big); packedBig.accountId = freshId;
    const bigText = JSON.stringify(packedBig);
    assert.ok(JSON.stringify(big).length > 307200, 'the fixture must be over the ceiling when expanded');
    assert.ok(bigText.length < 307200, '...but under it when compact');
    const up = await call(savePut, freshPlayer, { version: 0, blob: bigText, owner: 'FormatTest' }, '/api/save', 'PUT');
    assert.equal(up.res.status, 200, 'compact upload accepted: ' + JSON.stringify(up.data));

    for (let i = 0; i < 3; i++) {
      const u = await call(gmPlayer, gm, { id: freshId, action: 'unlock' }, '/api/gm/player');
      assert.equal(u.res.status, 200, 'GM unlock ' + i + ': ' + JSON.stringify(u.data));
    }
    const row = sqlite.prepare('SELECT blob FROM saves WHERE user_id=?').get(freshId).blob;
    const hist = sqlite.prepare('SELECT version, LENGTH(blob) n FROM save_history WHERE user_id=?').all(freshId);
    assert.ok(row.length <= 307200, 'the live row stayed under the ceiling (' + row.length + ' B)');
    assert.ok(hist.every(h => h.n <= 307200), 'no oversized blob entered history: ' + hist.map(h => h.n).join(','));
    assert.ok(Array.isArray(JSON.parse(row).inv[0]), 'the row is still compact after GM edits');

    for (const h of hist) {
      const r = await call(gmPlayer, gm, { id: freshId, action: 'restore', version: h.version }, '/api/gm/player');
      assert.notEqual(r.res.status, 413, 'restoring v' + h.version + ' must not be refused as too large');
    }
    const after = JSON.parse(sqlite.prepare('SELECT blob FROM saves WHERE user_id=?').get(freshId).blob);
    const u = unpackSave(after);
    assert.equal(u.inv.length, 850, 'every item survived the GM edits');
    assert.equal(u.cards.length, 450, 'every card survived');
    assert.equal(u.fishing.bag.length, 400, 'every fish survived');
  });

  await test('a GM edit on an OLD save does not upgrade it to the compact format', async () => {
    // An old page build cannot decode a compact row, and the server now refuses to hand one out.
    // Converting a legacy row on a GM action would push that page into the "reload" path for no reason.
    const oldPlayer = (await call(register, '', { u: 'LegacyTest', p: 'test-password-only', email: 'l@example.test' })).res.headers.get('set-cookie').split(';')[0];
    const oldId = sqlite.prepare('SELECT id FROM users WHERE username=?').get('LegacyTest').id;
    const legacy = { owner: 'LegacyTest', accountId: oldId, lv: 50, cls: 'Novice', zeny: 1,
      inv: [{ id: 1, slot: 'armor', tier: 3, val: 100, name: 'Plate', aff: [{ k: 'str', v: 3 }], slots: 1, cards: [], sec: 1, lvl: 1, quality: 1, mp: 0 }],
      cards: [], fishing: { bag: [{ id: 'f', sp: 'Magikarp', w: 5, mut: null, at: 1, perfect: false, lock: true }] } };
    const up = await call(savePut, oldPlayer, { version: 0, blob: JSON.stringify(legacy), owner: 'LegacyTest' }, '/api/save', 'PUT');
    assert.equal(up.res.status, 200, JSON.stringify(up.data));
    await call(gmPlayer, gm, { id: oldId, action: 'unlock' }, '/api/gm/player');
    const row = JSON.parse(sqlite.prepare('SELECT blob FROM saves WHERE user_id=?').get(oldId).blob);
    assert.equal(row.__v, undefined, 'an old-format row must stay old-format');
    assert.ok(!Array.isArray(row.inv[0]), 'items stay ordinary objects');
    assert.equal(row.fishing.bag[0].lock, true, 'the fish lock is untouched');
  });

  await test('a page load keeps the fishing lock flag', () => {
    const s = realSave();
    s.fishing.bag = [{ id: 'keep', sp: 'Magikarp', w: 9.5, mut: null, at: 1, perfect: false, lock: true },
                     { id: 'free', sp: 'Tuna', w: 4, mut: null, at: 1, perfect: false, lock: false }];
    // Build through load() so the save has every field the page expects; then set the bag.
    const r = game.ev(`(()=>{ try{
      S=load();
      S.fishing.bag=[{id:'keep',sp:'Magikarp',w:9.5,mut:null,at:1,perfect:false,lock:true},
                     {id:'free',sp:'Tuna',w:4,mut:null,at:1,perfect:false,lock:false}];
      lsPut(saveKey(),JSON.stringify(S)); S=load();
      return S.fishing.bag.map(f=>f.id+':'+f.lock).join(' ');
    }catch(e){ return 'ERR '+e.message } })()`);
    assert.equal(r, 'keep:true free:false', 'locked fish must stay locked across a load');
  });

  await test('the same save survives 5 store->load cycles unchanged', () => {
    const r = game.ev(`(()=>{ const sl=['weapon','armor','head'];
      S=load();
      S.inv=[]; for(let i=0;i<9;i++)S.inv.push(genGear({k:sl[i%3],n:'Plate Armor',quality:1},145,i%3,false,undefined,i%10,10));
      S.cards=[]; for(let i=0;i<4;i++)S.cards.push(newCard(cardDefinition(i%3,i%2,i%2===0)));
      S.fishing.bag=[{id:'k',sp:'Magikarp',w:9.5,mut:null,at:1,perfect:false,lock:true}]; S.zeny=1234;
      const sig=sv=>JSON.stringify({i:sv.inv,c:sv.cards,f:sv.fishing.bag,z:sv.zeny});
      // One cycle first: load() runs its own pre-existing repair pass (it adds the v83 item 'locked'
      // flag), which is not part of the codec. What must not happen is drift AFTER that.
      lsPut(saveKey(),JSON.stringify(packSave(S))); S=load();
      const first=sig(S), trail=[];
      for(let n=0;n<5;n++){ lsPut(saveKey(),JSON.stringify(packSave(S))); S=load(); trail.push(sig(S).length); }
      return {ok:sig(S)===first, first:first.length, last:sig(S).length, trail:trail.join(',')};
    })()`);
    assert.ok(r.ok, 'state drifted across cycles: ' + r.first + ' -> ' + r.last + ' [' + r.trail + ']');
  });

  console.log(`\nALL PASSED (${count} tests)`);
} finally {
  game.close();
}
