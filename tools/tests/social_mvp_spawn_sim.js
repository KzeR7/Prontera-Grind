import assert from 'node:assert/strict';
import {SocialRoom,cleanMvpState,FISHING_MVP_IDS} from '../../workers/social/room.mjs';
import {Social} from '../../workers/social/index.mjs';

console.log('social MVP spawn simulation: testing random scheduling, DO alarms, persistence, and ticks');

// 1. cleanMvpState sanitization
{
 assert.deepEqual(cleanMvpState(null), {active:[], nextAt:[]});
 assert.deepEqual(cleanMvpState('invalid'), {active:[], nextAt:[]});
 assert.deepEqual(cleanMvpState([]), {active:[], nextAt:[]});
 assert.deepEqual(cleanMvpState({active:'bad', nextAt:123}), {active:[], nextAt:[]});

 const wellFormed = {
  active: [
   [1, {sp: 'mvp_stormcoil', id: 'mvp:test:1', spawnedAt: 1000, endsAt: 601000}],
   [99, {sp: 'mvp_stormcoil', id: 'mvp:test:badroom', spawnedAt: 1000, endsAt: 601000}], // room out of range
   [2, {sp: 'not_a_fish', id: 'mvp:test:badsp', spawnedAt: 1000, endsAt: 601000}] // unknown species
  ],
  nextAt: [
   [1, 5000000],
   [2, 6000000],
   [100, 7000000] // room out of range
  ]
 };
 const cleaned = cleanMvpState(wellFormed);
 assert.equal(cleaned.active.length, 1);
 assert.equal(cleaned.active[0][0], 1);
 assert.equal(cleaned.active[0][1].sp, 'mvp_stormcoil');
 assert.equal(cleaned.nextAt.length, 2);
 assert.deepEqual(cleaned.nextAt, [[1, 5000000], [2, 6000000]]);
 console.log('  ok   cleanMvpState filters malformed and out-of-range records');
}

// 2. SocialRoom MVP lifecycle & persistence callbacks
{
 let mockNow = 10000000;
 let savedMvp = null;
 const broadcasts = [];
 const room = new SocialRoom({
  now: () => mockNow,
  random: () => 0.5, // exact midpoint of 1h-2h delay => 1.5h (5400000 ms)
  onMvpChange: () => {
   savedMvp = {
    active: [...room.mvpActive.entries()],
    nextAt: [...room.mvpNextAt.entries()]
   };
  }
 });

 const clientMessages = [];
 const c = {id: 42, room: 0, send: (m) => clientMessages.push(JSON.parse(m)), friends: new Set()};
 room.clients.set(c.id, c);

 // Occupied rooms when client is in room 0 (lobby/solo) => no MVP alarm
 assert.equal(room.nextMvpSpawnAt(mockNow), 0, 'no spawn alarm for room 0');

 // Client enters Plaza Room 1
 room.enterPlazaRoom(c, 1, mockNow);
 assert.equal(c.room, 1);
 assert(room.mvpNextAt.has(1), 'entering plaza room schedules next MVP');
 const scheduledAt = room.mvpNextAt.get(1);
 assert.equal(scheduledAt, mockNow + 5400000, 'midpoint random schedules exactly 1.5h in future');
 assert.deepEqual(savedMvp.nextAt, [[1, scheduledAt]], 'onMvpChange fired and saved nextAt');
 assert.equal(room.nextMvpSpawnAt(mockNow), scheduledAt, 'nextMvpSpawnAt returns scheduled spawn timestamp');

 // Time passes: 1 hour in (mockNow + 3600000)
 mockNow += 3600000;
 room.tickMvp(mockNow);
 assert.equal(room.mvpActive.has(1), false, 'MVP not yet spawned before scheduled time');
 assert.equal(room.nextMvpSpawnAt(mockNow), scheduledAt, 'nextMvpSpawnAt still targets scheduled spawn');

 // Another 30 minutes pass: mockNow reaches scheduledAt
 mockNow = scheduledAt;
 room.tickMvp(mockNow);
 assert.equal(room.mvpActive.has(1), true, 'MVP spawns at scheduled time');
 assert.equal(room.mvpNextAt.has(1), false, 'nextAt removed once active');
 const active = room.mvpActive.get(1);
 assert.equal(active.spawnedAt, mockNow);
 assert.equal(active.endsAt, mockNow + 600000, 'active window is 10 minutes');
 assert(FISHING_MVP_IDS.includes(active.sp), 'spawned species is valid MVP');
 assert.deepEqual(savedMvp.active, [[1, active]], 'onMvpChange persisted active spawn');

 // Verify broadcast was sent to client
 const spawnMsg = clientMessages.find(m => m.type === 'mvp_spawn');
 assert.ok(spawnMsg, 'client received mvp_spawn message');
 assert.equal(spawnMsg.sp, active.sp);
 assert.equal(spawnMsg.id, active.id);

 // While active, hasActiveMvp() is true
 assert.equal(room.hasActiveMvp(), true);

 // Next client enters during active spawn -> receives active MVP snapshot in sendRoom
 const client2Messages = [];
 const c2 = {id: 43, room: 0, send: (m) => client2Messages.push(JSON.parse(m)), friends: new Set()};
 room.clients.set(c2.id, c2);
 room.enterPlazaRoom(c2, 1, mockNow + 60000);
 const c2Spawn = client2Messages.find(m => m.type === 'mvp_spawn');
 assert.ok(c2Spawn, 'new arrival receives active MVP');
 assert.equal(c2Spawn.id, active.id);

 // 10 minutes elapse -> MVP despawns
 mockNow = active.endsAt + 1;
 room.tickMvp(mockNow);
 assert.equal(room.mvpActive.has(1), false, 'MVP despawned after 10 min');
 const despawnMsg = clientMessages.find(m => m.type === 'mvp_despawn');
 assert.ok(despawnMsg, 'client received mvp_despawn message');
 assert(room.mvpNextAt.has(1), 'next MVP automatically scheduled on despawn');
 const nextScheduled = room.mvpNextAt.get(1);
 assert.equal(nextScheduled, mockNow + 5400000);
 console.log('  ok   SocialRoom schedules, spawns, broadcasts, and despawns MVP seamlessly');
}

// 3. Durable Object nextAlarmAt integration
{
 const proto = Social.prototype;
 const now = Date.now();

 // Case A: Idle sitters with no MVP scheduled
 const idleDO = Object.create(proto);
 idleDO.room = {clients: {size: 3}, hasActiveBattles: () => false, hasKeepaliveWork: () => false, nextMvpSpawnAt: () => 0};
 idleDO.battleAlarmAt = 0;
 assert.equal(idleDO.nextAlarmAt(), 0, 'idle sitters with no pending MVP schedule 0 alarm');

 // Case B: Idle sitters with MVP scheduled 45 min in future
 const schedDO = Object.create(proto);
 const spawnTime = now + 45 * 60 * 1000;
 schedDO.room = {clients: {size: 1}, hasActiveBattles: () => false, hasKeepaliveWork: () => false, nextMvpSpawnAt: () => spawnTime};
 schedDO.battleAlarmAt = 0;
 assert.equal(schedDO.nextAlarmAt(), spawnTime, 'DO sets alarm for exact future MVP spawn timestamp (0 wakeups during wait)');

 // Case C: Active MVP (10 min window)
 const activeDO = Object.create(proto);
 activeDO.room = {clients: {size: 1}, hasActiveBattles: () => false, hasKeepaliveWork: () => true};
 activeDO.battleAlarmAt = 0;
 assert(Math.abs(activeDO.nextAlarmAt() - (Date.now() + 60000)) <= 10, 'active MVP keeps 60s sweep alarm alive');

 // Case D: Active battle takes precedence over MVP sweep
 const battleDO = Object.create(proto);
 battleDO.room = {clients: {size: 2}, hasActiveBattles: () => true, hasKeepaliveWork: () => true};
 battleDO.battleAlarmAt = 0;
 assert(Math.abs(battleDO.nextAlarmAt() - (Date.now() + 1000)) <= 10, 'active battle ticks at 1s');
 console.log('  ok   nextAlarmAt correctly schedules exact-spawn alarm, active 60s sweep, and 1s battles');
}

// 4. Overdue spawn on player entry
{
 let mockNow = 50000000;
 const room = new SocialRoom({
  now: () => mockNow,
  random: () => 0.1
 });
 // Manually simulate a scheduled MVP from storage that is now overdue
 room.mvpNextAt.set(1, mockNow - 10000); // was scheduled 10s ago when room was empty
 assert.equal(room.mvpActive.has(1), false);

 const msgs = [];
 const c = {id: 10, room: 0, send: (m) => msgs.push(JSON.parse(m)), friends: new Set()};
 room.clients.set(c.id, c);

 // Player enters room -> enterPlazaRoom calls tickMvp(now) -> spawns immediately!
 room.enterPlazaRoom(c, 1, mockNow);
 assert.equal(room.mvpActive.has(1), true, 'overdue spawn triggered immediately upon player entry');
 const spawnMsg = msgs.find(m => m.type === 'mvp_spawn');
 assert.ok(spawnMsg, 'entering player receives mvp_spawn in greeting snapshot');
 console.log('  ok   overdue MVP spawns immediately when player enters plaza room');
}

console.log('ALL MVP SPAWN SIMULATION TESTS PASSED');
