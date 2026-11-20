// Pages API + D1 + existing Social room, wired together without a deployed Worker.
//
// This exercises the parts a browser simulation cannot: transactional entry reservation, a lost
// start response, recovery from a D1 checkpoint after the room forgets a run, exactly-once reward
// settlement, and the disabled-by-default feature gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { onRequestGet, onRequestPost, _raidTest } from '../../functions/api/raid.js';
import { tokenHash } from '../../functions/_lib/auth.js';
import { packSave } from '../../functions/_lib/save-codec.js';
import { raidProfileFromSave } from '../../functions/_lib/raid-profile.js';
import { RAID_STAGES, RAID_RULES } from '../../functions/_lib/raid-rules.js';
import { SocialRoom } from '../../workers/social/room.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sql = new DatabaseSync(':memory:');
for (const name of fs.readdirSync(path.join(root, 'migrations'))
  .filter(n => /^\d+_.*\.sql$/.test(n)).sort()) sql.exec(fs.readFileSync(path.join(root, 'migrations', name), 'utf8'));

function statement(s, args) {
  return {
    __sql: s, __args: args,
    first: () => sql.prepare(s).get(...args) ?? null,
    all: () => ({ results: sql.prepare(s).all(...args) }),
    run: () => sql.prepare(s).run(...args),
  };
}
const metrics = { d1Statements: 0, d1Batches: 0, d1Rows: 0, doRequests: 0, roomWrites: 0 };
const D1 = {
  prepare: s => {
    metrics.d1Statements++;
    const direct = statement(s, []);
    return { bind: (...args) => statement(s, args), first: direct.first, all: direct.all, run: direct.run };
  },
  batch: async stmts => {
    metrics.d1Batches++; metrics.d1Rows += stmts.length;
    sql.exec('BEGIN');
    try { for (const s of stmts) s.run(); sql.exec('COMMIT'); }
    catch (e) { sql.exec('ROLLBACK'); throw e; }
    return [];
  },
};

function saveFor(accountId, cls, magic) {
  return packSave({
    accountId, lv: 150, cls, sex: 'm',
    st: magic ? { str: 1, agi: 90, dex: 120, luk: 1, int: 120, vit: 120 }
      : { str: 120, agi: 120, dex: 120, luk: 90, int: 1, vit: 120 },
    eq: {
      weapon: magic
        ? { id: 'staff', slot: 'weapon', wt: 'staff', name: 'Rift Staff', val: 120000, r: 15, aff: [{ k: 'matk', v: 400 }], sec: 6 }
        : { id: 'katar', slot: 'weapon', wt: 'katar', name: 'Rift Katar', val: 120000, r: 15, aff: [{ k: 'atk', v: 400 }], sec: 6 },
      head: { id: 'h', slot: 'head', val: 3000, r: 10, aff: [] },
      acc1: { id: 'a1', slot: 'acc1', val: 2000, r: 10, aff: [] },
      acc2: { id: 'a2', slot: 'acc2', val: 2000, r: 10, aff: [] },
    },
    inv: [{ id: 'bag', slot: 'weapon', wt: 'katar', name: 'Bag', val: 1, r: 0, aff: [], sec: 6 }],
    pv: { hpp: 0 },
  });
}

const users = [];
for (const [name, cls, magic] of [['Alpha', 'Lord Knight', false], ['Beta', 'Warlock', true]]) {
  const id = sql.prepare('INSERT INTO users(username,pass_hash,created_at) VALUES(?,?,?)').run(name, 'h', 1).lastInsertRowid;
  const save = saveFor(id, cls, magic);
  sql.prepare(`INSERT INTO saves(user_id,version,blob,saved_at,updated_at,last_seen,rate_kph,kills_total,level,cls)
    VALUES(?,1,?,1,1,1,0,0,150,?)`).run(id, JSON.stringify(save), cls);
  const token = 'T'.repeat(40) + name;
  const hash = await tokenHash(token);
  sql.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(hash, id, 1, Date.now() + 86400000);
  users.push({ id, name, token, profile: raidProfileFromSave(save) });
}

let clock = 2_000_000;
const room = new SocialRoom({ now: () => clock, autoTimers: false });
const roomSaveRun = room.raidSaveRun.bind(room);
room.raidSaveRun = run => { metrics.roomWrites++; return roomSaveRun(run); };
const identity = req => JSON.parse(req.headers.get('X-Social-Identity') || 'null');
class FakeSocial {
  idFromName() { return this; }
  get() { return this; }
  async fetch(req) {
    metrics.doRequests++;
    const url = new URL(req.url), me = identity(req);
    let body = null;
    if (req.method === 'POST') { try { body = await req.json(); } catch {} }
    let result;
    if (url.pathname === '/raid/party') result = { ok: true, party: room.raidPartyPayload() };
    else if (url.pathname === '/raid/ready') result = room.raidPartyReady(me, body?.ready === true, body?.fingerprint);
    else if (url.pathname === '/raid/install') result = room.raidInstall(body, me);
    else if (url.pathname === '/raid/restore') result = room.raidRestore(body, me);
    else if (url.pathname === '/raid/action') result = room.raidAction(body.runId, me, body);
    else if (url.pathname === '/raid/snapshot') result = room.raidSnapshot(body.runId, me);
    else if (url.pathname === '/raid/ack') result = room.raidAck(body.runId, me, body.settledAt);
    else if (url.pathname === '/raid/readiness-reset') result = room.raidReadinessReset(me);
    else result = { ok: false, status: 404, err: 'not found' };
    return new Response(JSON.stringify(result), { status: result.status || (result.ok ? 200 : 409), headers: { 'Content-Type': 'application/json' } });
  }
}
const env = { DB: D1, SOCIAL: new FakeSocial(), RAID_ENABLED: 'true' };
const cookie = user => ({ Cookie: `pg_session=${user.token}` });
const request = (url, user, method = 'GET', body = null) => new Request('https://game.example' + url, {
  method, headers: { ...cookie(user), ...(body ? { 'Content-Type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const jsonBody = async response => response.json();
const safeJson = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + (e && e.stack || e)); fail++; }
};

console.log('player raid source sim: D1 reservation, checkpoint recovery, exactly-once rewards\n');

await t('the feature gate is closed unless RAID_ENABLED=true', async () => {
  const off = await onRequestGet({ request: request('/api/raid', users[0]), env: { ...env, RAID_ENABLED: undefined } });
  assert.equal(off.status, 403);
  assert.equal((await jsonBody(off)).disabled, true);
});

await t('a two-account lobby readies and starts the same encounter', async () => {
  room.raidPartyJoin({ id: users[0].id, name: users[0].name });
  room.raidPartyJoin({ id: users[1].id, name: users[1].name });
  for (const u of users) {
    const r = await onRequestPost({ request: request('/api/raid', u, 'POST', { action: 'ready', ready: true }), env });
    assert.equal(r.status, 200, await r.clone().text());
  }
  const view = await onRequestGet({ request: request('/api/raid?party=1', users[0]), env });
  const data = await jsonBody(view);
  assert.equal(data.party.members.length, 2);
  assert.equal(data.party.canStart, true);
  assert.equal(data.account.entriesLeft, 2);
});

let runId = '';
await t('start reserves one entry per participant and installs one run', async () => {
  const r = await onRequestPost({ request: request('/api/raid', users[0], 'POST', { action: 'start', mode: 'party' }), env });
  const data = await jsonBody(r);
  assert.equal(r.status, 200, JSON.stringify(data));
  assert.equal(data.partySize, 2);
  runId = data.runId;
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM raid_entries WHERE run_id=?').get(runId).n, 2);
  const run = room.raidRuns.get(runId);
  assert.ok(run);
  for (const m of run.members) assert.ok(Number.isFinite(m.hp) && m.hp === m.maxHp && m.maxHp === m.profile.maxHp);
  // A guessed run id must not expose the checkpoint or snapshot to a non-member.
  const outsider = { id: 9999, name: 'Mallory' };
  assert.equal(room.raidSnapshot(runId, outsider).status, 403);
  assert.equal(room.raidRestore({ id: runId }, outsider).status, 403);
  assert.equal(room.raidInstall({ id: runId, partySize: 1, members: [{ id: 9999 }] }, outsider).status, 403);
});

await t('a lost start response resumes the same run instead of charging again', async () => {
  const r = await onRequestPost({ request: request('/api/raid', users[0], 'POST', { action: 'start', mode: 'party' }), env });
  const data = await jsonBody(r);
  assert.equal(r.status, 200, JSON.stringify(data));
  assert.equal(data.runId, runId);
  assert.equal(data.resumed, true);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM raid_entries WHERE run_id=?').get(runId).n, 2);
});

await t('a move intent reaches the room as a destination, never as damage', async () => {
  const before = room.raidRuns.get(runId);
  const me = before.members.find(m => m.id === users[0].id);
  const start = { x: me.x, z: me.z };
  const move = await _raidTest.actionRun(env, users[0], {
    runId, combatAction: 'move', actionId: 'api:move:intent1', x: -4.5, z: -3,
  });
  assert.equal(move.data.ok, true, JSON.stringify({ err: move.data.err }));
  const after = room.raidRuns.get(runId).members.find(m => m.id === users[0].id);
  assert.equal(after.intentX, -4.5, 'the destination is stored as the intent');
  assert.equal(after.intentZ, -3);
  assert.equal(after.damage, me.damage, 'a move deals no damage');
  assert.ok(Math.hypot(after.x - start.x, after.z - start.z) < RAID_RULES.walkSpeed, 'and it is not a teleport');
  // The 220 ms floor is real, and it is a refusal rather than a second payment.
  const tooSoon = await _raidTest.actionRun(env, users[0], {
    runId, combatAction: 'move', actionId: 'api:move:intent2', x: 0, z: 4,
  });
  assert.equal(tooSoon.data.status, 429, JSON.stringify({ status: tooSoon.data.status }));
  assert.equal(after.intentX, -4.5, 'a refused move changes nothing');
});

await t('a party that clears all four stages settles once, paying each member once', async () => {
  const run = room.raidRuns.get(runId);
  // Kill the encounter through the engine's own conditions: every required enemy down, the sanctuary
  // reached, the boss dead. Nothing here writes a victory flag.
  const stages = RAID_STAGES.length;
  for (let stage = 0; stage < stages; stage++) {
    // Kill the objective, then let the room's own clock notice: `raidSnapshot` is what calls
    // `advanceRaidRun`, exactly as the 2 s client poll does.
    for (const e of run.enemies) e.hp = 0;
    clock = run.updatedAt + 60;
    const tick = room.raidSnapshot(runId, { id: users[0].id });
    assert.equal(tick.ok, true, JSON.stringify({ err: tick.err }));
    if (stage < stages - 1) {
      assert.equal(tick.run.stageCleared, true, 'stage ' + (stage + 1) + ' cleared');
      const action = await _raidTest.actionRun(env, users[0], {
        runId, combatAction: 'interact', actionId: 'api:portal:' + stage, targetId: 'portal',
      });
      assert.equal(action.data.ok, true, JSON.stringify({ err: action.data.err }));
      clock = run.updatedAt + 60;
      room.raidSnapshot(runId, { id: users[0].id });
      assert.equal(run.stageIndex, stage + 1, 'the party walked through to stage ' + (stage + 2));
    }
  }
  assert.equal(run.state, 'cleared', 'the room owns the clear, not the client: ' + run.state);
  // A real room is read within a poll of the clear, so the settle re-read sees the same clock. This
  // scripted clock had to advance far to finish four stages; hand it back the moment of the clear.
  clock = run.finishedAt;
  // The first settle after the clear is the one that pays.
  const settled = await _raidTest.settleRun(env, users[0], runId);
  assert.equal(settled.ok, true, JSON.stringify({ err: settled.data?.err }));
  assert.equal(settled.data.outcome, 'clear', JSON.stringify(settled.data));
  const first = await _raidTest.settleRun(env, users[0], runId);
  assert.equal(first.ok, true);
  const rewards = first.data.rewards;
  const count = sql.prepare('SELECT COUNT(*) AS n FROM grants WHERE user_id=?').get(users[0].id).n;
  const shards = sql.prepare('SELECT rift_shards FROM raid_accounts WHERE user_id=?').get(users[0].id).rift_shards;
  const state = await jsonBody(await onRequestGet({ request: request('/api/raid', users[0]), env }));
  assert.equal(state.lastRun?.id, runId, 'a disconnected member can find the settled run');
  const teammate = await _raidTest.settleRun(env, users[1], runId);
  assert.equal(teammate.ok, true, JSON.stringify(teammate.data));
  assert.deepEqual(teammate.data.rewards.map(r => r.kind).sort(), ['clear', 'fractured']);
  const second = await _raidTest.settleRun(env, users[0], runId);
  assert.equal(second.ok, true);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM grants WHERE user_id=?').get(users[0].id).n, count);
  assert.equal(sql.prepare('SELECT rift_shards FROM raid_accounts WHERE user_id=?').get(users[0].id).rift_shards, shards);
  assert.ok(rewards.length >= 1);
  const kinds = rewards.map(r => r.kind).sort();
  assert.deepEqual(kinds, ['clear', 'fractured']);
  for (const row of rewards) {
    // A ledger row is either a clear roll (`rewards` inline) or a chest row (`rewards` nested), so
    // read both shapes rather than assuming one.
    const paid = row.rewards && typeof row.rewards === 'object' ? row.rewards : row;
    assert.ok(Number.isFinite(Number(paid.riftShards)) && Number(paid.riftShards) > 0,
      'every paid row names its shards: ' + JSON.stringify(row).slice(0, 160));
    assert.ok(Number.isFinite(Number(paid.zeny)) && Number(paid.zeny) > 0, 'and its zeny');
  }
  const ledgerShards = sql.prepare('SELECT SUM(CAST(json_extract(payload,\'$.riftShards\') AS INTEGER)) AS n FROM raid_reward_ledger WHERE user_id=?').get(users[0].id).n;
  assert.equal(shards, ledgerShards, 'the account shard balance is exactly the ledger sum');
  const grants = sql.prepare("SELECT kind,created_by,ref,payload FROM grants WHERE user_id=? ORDER BY id").all(users[0].id);
  assert.ok(grants.length >= 2, 'sigils, materials and zeny become ordinary grants');
  assert.ok(grants.every(g => g.created_by === 'Rift Raid' && /^raid:/.test(g.ref)));
  assert.equal(new Set(grants.map(g => g.ref)).size, grants.length);
  assert.ok(grants.some(g => JSON.parse(g.payload).resource === 'riftShards'), 'Rift Shards are mirrored into the save grant');
  assert.equal(second.data.acknowledged, true);
  // A clear always drops a card; the fractured chest drops one 85% of the time. The readback must
  // equal the rows actually written, and never contain a null card.
  const cardRows = sql.prepare('SELECT kind,card_key FROM raid_card_drops WHERE run_id=? AND user_id=? ORDER BY kind').all(runId, users[0].id);
  assert.ok(cardRows.length >= 1 && cardRows.length <= 2, 'card rows written: ' + cardRows.length);
  assert.ok(cardRows.some(r => r.kind === 'clear'), 'a clear always drops a card');
  assert.ok(cardRows.every(r => typeof r.card_key === 'string' && r.card_key.length > 0), 'and never a null key');
  assert.equal(first.data.cards.length, cardRows.length, 'the settle readback is exactly what the ledger holds');
});

await t('a card drop is account-wide, duplicate-safe and one card can be equipped', async () => {
  const cards = sql.prepare('SELECT card_key,copies,equipped FROM raid_cards WHERE user_id=? ORDER BY card_key').all(users[0].id);
  assert.ok(cards.length >= 1, 'the settled clear created cards');
  assert.ok(cards.every(c => c.copies >= 1 && c.equipped === 0));
  const key = cards[0].card_key;
  const equipped = await jsonBody(await onRequestPost({ request: request('/api/raid', users[0], 'POST', { action: 'card', cardKey: key }), env }));
  assert.equal(equipped.ok, true, JSON.stringify(equipped));
  assert.equal(equipped.account.equippedCard, key);
  assert.equal(equipped.account.cards.find(c => c.key === key).equipped, true);
  const state = await jsonBody(await onRequestGet({ request: request('/api/raid', users[0]), env }));
  assert.equal(state.account.equippedCard, key, 'the equipped card survives a lobby refresh');
  const unknown = await onRequestPost({ request: request('/api/raid', users[0], 'POST', { action: 'card', cardKey: 'not-a-card' }), env });
  assert.equal(unknown.status, 400);
  const unequip = await jsonBody(await onRequestPost({ request: request('/api/raid', users[0], 'POST', { action: 'card', cardKey: '' }), env }));
  assert.equal(unequip.account.equippedCard, '');
});

await t('a room restart restores the D1 checkpoint instead of an empty encounter', async () => {
  // A fresh solo run, then drop the room's in-memory copy exactly as an eviction would.
  room.raidParty = null;
  const start = await onRequestPost({ request: request('/api/raid', users[1], 'POST', { action: 'start', mode: 'solo' }), env });
  const data = await jsonBody(start);
  assert.equal(start.status, 200, JSON.stringify(data));
  const soloId = data.runId;
  const before = JSON.parse(JSON.stringify(room.raidRuns.get(soloId)));
  room.raidRuns.delete(soloId);
  const recovered = await _raidTest.recoverRun(env, users[1], sql.prepare('SELECT * FROM raid_runs WHERE id=?').get(soloId));
  assert.equal(recovered.ok, true, recovered.err || '');
  const after = room.raidRuns.get(soloId);
  assert.equal(after.members[0].hp, before.members[0].hp);
  assert.equal(after.members[0].maxHp, before.members[0].maxHp);
});

await t('simultaneous starts reserve exactly one entry and one run', async () => {
  // User 1 has one entry left after the settled clear; two identical requests race the daily and
  // active-run triggers. Exactly one may win.
  const [a, b] = await Promise.all([
    onRequestPost({ request: request('/api/raid', users[0], 'POST', { action: 'start', mode: 'solo' }), env }),
    onRequestPost({ request: request('/api/raid', users[0], 'POST', { action: 'start', mode: 'solo' }), env }),
  ]);
  const statuses = [a.status, b.status].sort((x, y) => x - y);
  assert.equal(statuses.filter(x => x === 200).length, 1, 'exactly one start succeeded: ' + statuses.join(','));
  assert.ok([409, 429].includes(statuses.find(x => x !== 200)));
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM raid_runs WHERE leader_id=? AND party_size=1 AND state='active'").get(users[0].id).n, 1);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM raid_entries WHERE user_id=? AND day_key=?").get(users[0].id, sql.prepare("SELECT strftime('%Y-%m-%d','now','+8 hours') AS d").get().d).n, 2);
});

await t('a rejected room install refunds the reservation instead of charging an entry', async () => {
  const id = sql.prepare('INSERT INTO users(username,pass_hash,created_at) VALUES(?,?,?)').run('Refund', 'h', 1).lastInsertRowid;
  const save = packSave({ accountId: id, lv: 150, cls: 'Novice', sex: 'm', st: { str: 1, agi: 1, dex: 1, int: 1, vit: 1, luk: 1 }, eq: {}, inv: [] });
  sql.prepare(`INSERT INTO saves(user_id,version,blob,saved_at,updated_at,last_seen,rate_kph,kills_total,level,cls)
    VALUES(?,1,?,1,1,1,0,0,150,'Novice')`).run(id, JSON.stringify(save));
  const token = 'R'.repeat(40) + 'efund';
  const hash = await tokenHash(token);
  sql.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(hash, id, 1, Date.now() + 86400000);
  const player = { id, name: 'Refund', token, profile: raidProfileFromSave(save) };
  const savedSocial = env.SOCIAL;
  const real = savedSocial.get();
  env.SOCIAL = {
    idFromName: name => savedSocial.idFromName(name),
    get: () => ({ fetch: async req => new URL(req.url).pathname === '/raid/install'
      ? new Response(JSON.stringify({ ok: false, err: 'The roster changed.' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
      : real.fetch(req) }),
  };
  const response = await onRequestPost({ request: request('/api/raid', player, 'POST', { action: 'start', mode: 'solo' }), env });
  env.SOCIAL = savedSocial;
  assert.equal(response.status, 409, await response.clone().text());
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM raid_entries WHERE user_id=?').get(id).n, 0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM raid_run_members WHERE user_id=?').get(id).n, 0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM raid_runs WHERE leader_id=?').get(id).n, 0, 'no ghost run was left behind');
});

await t('a failed storage read is reported, not treated as an empty encounter', async () => {
  const saved = env.SOCIAL;
  const unavailable = { fetch: async () => new Response('{"err":"storage unavailable"}', { status: 503 }) };
  env.SOCIAL = { idFromName: () => unavailable, get: () => unavailable };
  const r = await onRequestGet({ request: request('/api/raid', users[1]), env });
  const data = await jsonBody(r);
  assert.equal(data.activeRun, null);
  assert.ok(data.activeRunError, 'the client is told the active run could not be read');
  env.SOCIAL = saved;
});

await t('a late snapshot does not move the fixed timeline', async () => {
  const solo = [...room.raidRuns.values()].find(r => r.state === 'active');
  if (!solo) return;
  const started = solo.startedAt, deadline = solo.deadlineAt, stageEnds = solo.stageEndsAt, stageIndex = solo.stageIndex;
  clock = Math.max(solo.updatedAt, started) + 50;
  const before = room.raidSnapshot(solo.id, { id: users[1].id });
  assert.equal(before.ok, true, JSON.stringify(before));
  const published = (before.run.mechanics || []).map(m => `${m.kind}@${m.endsAt}`).join(',');
  clock = solo.startedAt + 100000;
  const after = room.raidSnapshot(solo.id, { id: users[1].id });
  assert.equal(after.ok, true, JSON.stringify(after));
  assert.equal(solo.startedAt, started, 'a snapshot never reschedules the run');
  assert.equal(solo.deadlineAt, deadline, 'nor its deadline');
  assert.ok(solo.stageEndsAt >= stageEnds, 'a stage clock only ever moves forward, never backwards');
  assert.ok(solo.stageIndex >= stageIndex, 'a read never rewinds the run');
  // A resolved telegraph is never resurrected or extended by a later read.
  const alive = new Set((after.run.mechanics || []).map(m => `${m.kind}@${m.endsAt}`));
  for (const token of published.split(',').filter(Boolean)) {
    const [kind] = token.split('@');
    assert.ok(![...alive].some(a => a.startsWith(kind + '@') && a !== token) || alive.has(token),
      'a telegraph is either the same one or gone, never moved: ' + token);
  }
  assert.equal(after.run.serverNow, Math.max(clock, solo.updatedAt), 'the snapshot reports the clock it used');
});

const raidSource = fs.readFileSync(path.join(root, 'functions/api/raid.js'), 'utf8');
const roomSource = fs.readFileSync(path.join(root, 'workers/social/room.mjs'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'workers/social/index.mjs'), 'utf8');
const roomRaid = roomSource.split('// ------------------------------------------------------------ Rift Raid ----')[1] || '';
const indexRaid = indexSource.split('// --- Rift Raid persistence')[1]?.split(' async fetch(request)')[0] || '';
const alarmCalls = (raidSource.match(/setAlarm\s*\(/g) || []).length
  + (roomRaid.match(/setAlarm\s*\(/g) || []).length
  + (indexRaid.match(/setAlarm\s*\(/g) || []).length;
console.log('\nmeasured (this scripted two-player start + strike + settlement + restart):');
console.log('  D1 prepared statements: ' + metrics.d1Statements + ' · batches: ' + metrics.d1Batches
  + ' · batched rows: ' + metrics.d1Rows);
console.log('  Social DO requests: ' + metrics.doRequests + ' · room run writes: ' + metrics.roomWrites);
console.log('  new raid alarm calls: ' + alarmCalls + (alarmCalls ? ' (UNEXPECTED)' : ' (none; request-driven only)'));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
