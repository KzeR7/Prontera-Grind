// A plaza that could not read its storage once must not refuse every player until it is evicted.
//   node tools/tests/social_room_recovery_sim.mjs
//
// v326. The Durable Object loads every account's unacknowledged poker outbox before it admits a
// socket, and a failed load used to set a flag that answered 503 to every connection for the rest of
// the object's life. Players saw "Chat unavailable — retrying…" with nothing wrong on their side, and
// the only cure was waiting for an eviction. The flag is now per attempt: the load is retried on the
// next connection and the room recovers as soon as storage answers.
//
// This is a unit rehearsal of that one rule (the real Cloudflare runtime is covered by
// social_worker_sim.mjs, which needs miniflare). It does not prove hosted storage behaviour.
import assert from 'node:assert/strict';

const { Social } = await import('../../workers/social/index.mjs');

// A storage double whose poker-ledger list() fails a chosen number of times before answering.
// (The resume load lists too, so only the ledger keys can fail - that is the failure this pins.)
function storageHarness(failCount) {
  const map = new Map([['world-history-v1', []], ['poker-ledger-v1:7', []]]);
  let lists = 0;
  const storage = {
    async get(key) { return map.get(key); },
    async put(key, value) { map.set(key, value); },
    async delete(key) { map.delete(key); },
    async list({ prefix = '' } = {}) {
      if (prefix.startsWith('poker-ledger-v1:')) {
        lists++;
        if (lists <= failCount) throw new Error('storage hiccup');
      }
      return [...map].filter(([k]) => k.startsWith(prefix));
    },
    async getAlarm() { return null; },
    async setAlarm() {},
  };
  return { storage, lists: () => lists };
}

const upgrade = () => new Request('https://plaza.test/', {
  headers: { Upgrade: 'websocket', 'X-Social-Identity': 'null' },
});

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + (e && e.message)); fail++; }
};

console.log('social room recovery: one bad storage read is not a dead plaza\n');

await t('a socket after a failed ledger load is retried, not refused for ever', async () => {
  const h = storageHarness(1);
  const social = new Social({ storage: h.storage });
  await social.ready;
  // The constructor's own load fails; the object is now "ledger unreadable".
  assert.equal(social.ledgerLoadFailed, true, 'the first load really did fail');
  const first = await social.fetch(upgrade());
  assert.equal(first.status, 400, 'the retry succeeds, so the refusal is the missing identity, not 503');
  assert.equal(social.ledgerLoadFailed, false, 'a healthy read clears the flag');
  assert.ok(h.lists() >= 2, 'storage was asked again instead of the room staying broken');
});

await t('storage that is still broken refuses only that attempt, and recovers later', async () => {
  const h = storageHarness(2);
  const social = new Social({ storage: h.storage });
  await social.ready;
  assert.equal((await social.fetch(upgrade())).status, 503, 'still unreadable: this connection is refused');
  assert.equal(social.ledgerLoadFailed, true, 'and the room knows it has not loaded the outbox');
  const recovered = await social.fetch(upgrade());
  assert.equal(recovered.status, 400, 'the next attempt recovers once storage answers');
  assert.equal(social.ledgerLoadFailed, false);
});

await t('a healthy room is not affected', async () => {
  const h = storageHarness(0);
  const social = new Social({ storage: h.storage });
  await social.ready;
  assert.equal(social.ledgerLoadFailed, false);
  assert.equal((await social.fetch(upgrade())).status, 400, 'a normal connection proceeds');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
