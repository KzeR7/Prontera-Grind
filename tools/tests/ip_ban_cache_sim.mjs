// v412: the ip_bans cache must never cost correctness.
// The lookup only shortens work; a ban has to be just as effective and just as immediate as before.
import assert from 'node:assert/strict';
import { freshDb, makeEnv } from '../dev_server.js';
import { isIpBanned, ipBanStatement, ipUnbanStatement, forgetIpBans } from '../../functions/_lib/db.js';

let pass = 0, fail = 0;
const test = async (name, fn) => {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + ' -> ' + e.message); }
};
console.log('network-ban cache: still correct, still immediate, just not per-request\n');

const sqlite = freshDb(), env = makeEnv(sqlite);
const FP = 'a1b2c3d4e5f60718';
// count how many statements the driver is asked to build
let prepares = 0;
const realPrepare = sqlite.prepare.bind(sqlite);
sqlite.prepare = sql => { prepares++; return realPrepare(sql); };

try {
  await test('an unbanned network is not banned', async () => {
    forgetIpBans(env.DB);
    assert.equal(await isIpBanned(env.DB, FP), false);
  });

  await test('the lookup runs once per TTL, not once per request', async () => {
    forgetIpBans(env.DB);
    await isIpBanned(env.DB, FP);            // populates
    prepares = 0;
    for (let i = 0; i < 50; i++) await isIpBanned(env.DB, FP);
    assert.equal(prepares, 0, '50 checks after a warm cache must cost zero queries, got ' + prepares);
  });

  await test('a ban is effective on the very NEXT check (not after the TTL)', async () => {
    forgetIpBans(env.DB);
    await isIpBanned(env.DB, FP);            // prime it with "not banned"
    await ipBanStatement(env.DB, FP, 'test', 'gm').run();
    assert.equal(await isIpBanned(env.DB, FP), true, 'the ban must bite immediately despite the warm cache');
  });

  await test('a banned network stays banned across repeated checks', async () => {
    for (let i = 0; i < 20; i++) assert.equal(await isIpBanned(env.DB, FP), true, 'check ' + i);
  });

  await test('an unban takes effect immediately too', async () => {
    await ipUnbanStatement(env.DB, FP).run();
    assert.equal(await isIpBanned(env.DB, FP), false, 'after an unban the network must be allowed again');
  });

  await test('a ban written by another isolate is picked up within the TTL', async () => {
    forgetIpBans(env.DB);
    await isIpBanned(env.DB, FP);                       // this isolate caches "not banned"
    // another isolate writes straight to the table, bypassing the invalidating statement
    sqlite.prepare('INSERT OR IGNORE INTO ip_bans(ip_hash,note,created_by,created_at) VALUES(?,?,?,?)')
      .run(FP, 'other isolate', 'gm', Date.now());
    assert.equal(await isIpBanned(env.DB, FP), false, 'still cached - expected, and bounded by the TTL');
    // simulate the TTL elapsing (another isolate cannot force ours, so we clear it as the clock would)
    forgetIpBans(env.DB);
    assert.equal(await isIpBanned(env.DB, FP), true, 'after the TTL the ban is seen');
  });

  await test('many distinct networks do not grow the cache per-fingerprint', async () => {
    // The cache holds the TABLE, not one entry per visited IP, so a flood of spoofed addresses
    // cannot inflate it. Prove the memory shape does not depend on the number of callers.
    forgetIpBans(env.DB);
    prepares = 0;
    for (let i = 0; i < 200; i++) await isIpBanned(env.DB, ('0'.repeat(15) + i.toString(16)).slice(-16));
    assert.equal(prepares, 1, '200 different networks cost ONE table load, got ' + prepares);
  });

  await test('a COLD lookup that fails fails open, and does not poison the cache', async () => {
    // A warm cache answering from memory is correct - that is the entire point of the cache, and its
    // answer (banned / not banned) is at most 5 s stale. The invariant that matters is the COLD path:
    // when the table cannot be read, the answer must be "not banned" (fail open, as this function has
    // always done), and the failure must not be remembered as an empty ban list.
    forgetIpBans(env.DB);
    const broken = { prepare: () => { throw new Error('D1 is down'); } };
    assert.equal(await isIpBanned(broken, FP), false, 'a cold failure must fail open, never lock everyone out');
    // the real database must still be readable right afterwards
    await ipBanStatement(env.DB, FP, 'real', 'gm').run();
    assert.equal(await isIpBanned(env.DB, FP), true, 'the cache recovered and sees the real ban');
    // A DIFFERENT database handle must never be answered from the real database's cache. This is the
    // bug the per-database key exists to prevent: before it, one environment's "nothing is banned"
    // could be served to another environment whose table said otherwise.
    assert.equal(await isIpBanned(broken, FP), false, 'a broken handle never inherits another database cache');
  });

  await test('a null fingerprint is never banned (no CF-Connecting-IP in dev/tests)', async () => {
    assert.equal(await isIpBanned(env.DB, null), false);
    assert.equal(await isIpBanned(env.DB, ''), false);
  });
} finally {
  sqlite.prepare = realPrepare;
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exitCode = 1;
}
