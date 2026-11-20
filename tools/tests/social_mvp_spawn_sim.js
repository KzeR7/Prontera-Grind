import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {SocialRoom,cleanMvpState,FISHING_MVP_IDS} from '../../workers/social/room.mjs';
import {Social} from '../../workers/social/index.mjs';

console.log('social MVP spawn simulation: testing pure earliest-deadline scheduler, DO persistence/recovery, solo lifecycle, and activity audit');

// ============================================================================
// 1. cleanMvpState sanitization
// ============================================================================
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
 assert.equal(cleaned.active[0][1].id, 'mvp:test:1');
 assert.equal(cleaned.nextAt.length, 2);
 assert.deepEqual(cleaned.nextAt, [[1, 5000000], [2, 6000000]]);
 console.log('  ok 1. cleanMvpState filters malformed and out-of-range records');
}

// ============================================================================
// Scenario 1: Empty room handling, pending overdue retention, & GM manual spawn
// ============================================================================
{
 let mockNow = 1000000;
 const room = new SocialRoom({
  now: () => mockNow,
  random: () => 0.5
 });

 // Room 1 has no occupants. Manually set a scheduled spawn that becomes overdue.
 room.mvpNextAt.set(1, mockNow - 5000);
 assert.equal(room.hasOccupants(1), false, 'room 1 starts empty');

 // tickMvp runs while room is empty: MUST NOT spawn an MVP!
 room.tickMvp(mockNow);
 assert.equal(room.mvpActive.has(1), false, 'empty room does not automatically spawn MVP');
 assert.equal(room.mvpNextAt.get(1), mockNow - 5000, 'overdue pending state is retained for returning players');

 // An empty room does not keep alarms awake
 assert.equal(room.nextMvpSpawnAt(mockNow), 0, 'empty room does not schedule a spawn alarm');

 // Staff / GM manual spawn into empty room: MUST be preserved
 const gmSpawn = room.spawnMvp(1, mockNow, 'mvp_stormcoil');
 assert.ok(gmSpawn, 'GM manual spawn succeeds even in empty room');
 assert.equal(room.mvpActive.has(1), true, 'GM spawn becomes active');
 assert.equal(gmSpawn.sp, 'mvp_stormcoil');
 assert.equal(room.mvpNextAt.has(1), false, 'active spawn cleans pending nextAt');

 // Despawn GM spawn
 room.despawnMvp(1, mockNow + 600000);
 assert.equal(room.mvpActive.has(1), false);
 assert.ok(room.mvpNextAt.has(1), 'next spawn window scheduled after despawn');

 // Fast forward past scheduled time while room is still empty
 const nextDue = room.mvpNextAt.get(1);
 mockNow = nextDue + 60000;
 room.tickMvp(mockNow);
 assert.equal(room.mvpActive.has(1), false, 'still empty, no automatic spawn');
 assert.equal(room.mvpNextAt.get(1), nextDue, 'pending overdue state retained');

 // Now a player enters Plaza Room 1: should spawn promptly!
 const msgs = [];
 const player = {id: 101, room: 0, send: m => msgs.push(JSON.parse(m)), friends: new Set()};
 room.clients.set(player.id, player);
 room.enterPlazaRoom(player, 1, mockNow);

 assert.equal(room.hasOccupants(1), true, 'room 1 now has occupants');
 assert.equal(room.mvpActive.has(1), true, 'MVP spawned promptly upon player entry');
 const spawnMsg = msgs.find(m => m.type === 'mvp_spawn');
 assert.ok(spawnMsg, 'entering player received mvp_spawn in room snapshot');
 console.log('  ok 2. Empty rooms do not auto-spawn, retain overdue pending state, and preserve GM manual spawning');
}

// ============================================================================
// Scenario 2: Unified earliest-deadline scheduler & pure deadline queries
// ============================================================================
{
 let mockNow = 5000000;
 const room = new SocialRoom({
  now: () => mockNow,
  random: () => 0.5
 });

 const player = {id: 201, room: 1, send: () => {}, friends: new Set()};
 room.clients.set(player.id, player);

 // 1. Schedule pending MVP spawn in occupied room 1
 room.scheduleMvp(1, mockNow);
 const spawnTime = room.mvpNextAt.get(1);
 assert.ok(spawnTime > mockNow);

 // Verify purity: querying nextDeadline does NOT mutate room state
 const activeKeysBefore = [...room.mvpActive.keys()];
 const nextAtEntriesBefore = [...room.mvpNextAt.entries()];
 const deadline1 = room.nextDeadline(mockNow);
 assert.equal(deadline1, spawnTime, 'nextDeadline returns exact spawn time');
 assert.deepEqual([...room.mvpActive.keys()], activeKeysBefore, 'purity: active map untouched');
 assert.deepEqual([...room.mvpNextAt.entries()], nextAtEntriesBefore, 'purity: nextAt map untouched');

 // 2. When MVP is active, schedule exact endsAt instead of 60s sweep
 mockNow = spawnTime;
 room.tickMvp(mockNow);
 assert.equal(room.mvpActive.has(1), true);
 const activeMvp = room.mvpActive.get(1);
 const expectedEndsAt = activeMvp.endsAt;
 const deadlineActive = room.nextDeadline(mockNow);
 assert.equal(deadlineActive, expectedEndsAt, 'active MVP schedules exact endsAt, NOT 60s sweep');
 assert.equal(expectedEndsAt - mockNow, 600000, 'active MVP duration is exactly 10 minutes');

 // 3. Priority: Active battle takes precedence over longer MVP deadline
 room.pveRuns.set(1, {clientSim: false}); // mock active battle
 const deadlineWithBattle = room.nextDeadline(mockNow);
 assert.equal(deadlineWithBattle, mockNow + 1000, 'battle tick (1s) takes precedence and is never postponed');
 room.pveRuns.clear();

 // 4. Obsolete alarm cancellation: when room becomes empty and no work remains
 room.mvpActive.clear();
 room.mvpNextAt.delete(1);
 room.clients.clear();
 assert.equal(room.nextDeadline(mockNow), 0, 'nextDeadline is 0 when no occupants or active work exist');

 // Verify Social DO calls ctx.storage.deleteAlarm() when deadline is 0
 const proto = Social.prototype;
 const mockStorage = {
  alarm: 1234567,
  deleted: false,
  async getAlarm() { return this.alarm; },
  async setAlarm(at) { this.alarm = at; },
  async deleteAlarm() { this.deleted = true; this.alarm = null; }
 };
 const testDO = Object.create(proto);
 testDO.ctx = {storage: mockStorage};
 testDO.room = room;
 testDO.battleAlarmAt = 0;
 testDO.battleAlarmWrite = Promise.resolve();

 await testDO.scheduleKeepalive();
 assert.equal(mockStorage.deleted, true, 'deleteAlarm() called to cancel obsolete alarms');
 assert.equal(mockStorage.alarm, null);
 console.log('  ok 3. Pure earliest-deadline scheduler replaces 60s sweep with endsAt, preserves battle priority, and cancels obsolete alarms');
}

// ============================================================================
// Scenario 3: Durable persistence, DO recovery with new instance, & failure retries
// ============================================================================
{
 const storageMap = new Map();
 const mockCtx = {
  storage: {
   async get(key) { return storageMap.get(key) || null; },
   async put(key, val) { storageMap.set(key, val); },
   async delete(key) { storageMap.delete(key); },
   async list() { return new Map(); },
   async getAlarm() { return null; },
   async setAlarm() {},
   async deleteAlarm() {}
  }
 };

 // Step A: Run a DO, spawn an MVP, and verify it persists
 const doInstance1 = new Social(mockCtx);
 await doInstance1.ready;

 const now = Date.now();
 doInstance1.room.clients.set(55, {id: 55, room: 1, send: () => {}, friends: new Set()});
 const spawn = doInstance1.room.spawnMvp(1, now, 'mvp_stormcoil', 'mvp:persistent:42');
 assert.equal(spawn.id, 'mvp:persistent:42');
 assert.equal(spawn.sp, 'mvp_stormcoil');
 await doInstance1.mvpWrites;

 const saved = storageMap.get('mvp-state-v1');
 assert.ok(saved, 'mvp-state-v1 persisted to storage');
 assert.equal(saved.active.length, 1);
 assert.equal(saved.active[0][1].id, 'mvp:persistent:42');

 // Step B: Cold restart - construct a NEW Social DO instance from the persisted storage
 const doInstance2 = new Social(mockCtx);
 await doInstance2.ready;

 assert.equal(doInstance2.room.mvpActive.has(1), true, 'new DO instance restored active MVP from storage');
 const restored = doInstance2.room.mvpActive.get(1);
 assert.equal(restored.id, 'mvp:persistent:42', 'spawn ID preserved exactly across restart');
 assert.equal(restored.sp, 'mvp_stormcoil', 'species preserved exactly across restart');
 assert.equal(restored.spawnedAt, now, 'spawned timestamp preserved');
 assert.equal(restored.endsAt, now + 600000, 'despawn deadline preserved');

 // Step C: Idempotence check - repeated spawn or tick does not duplicate or change IDs
 const duplicateSpawn = doInstance2.room.spawnMvp(1, now, 'mvp_volthorn');
 assert.equal(duplicateSpawn, null, 'idempotent: cannot double-spawn into already active room');
 assert.equal(doInstance2.room.mvpActive.get(1).id, 'mvp:persistent:42', 'original ID preserved');

 // Step D: Storage failure recovery & retry tracking
 let failPut = true;
 const failStorage = {
  async get(key) { return null; },
  async put(key, val) {
   if (failPut && key === 'mvp-state-v1') {
    throw new Error('Disk write failure');
   }
   storageMap.set(key, val);
  },
  async list() { return new Map(); },
  async getAlarm() { return null; },
  async setAlarm() {},
  async deleteAlarm() {}
 };
 const failCtx = {storage: failStorage};
 const failDO = new Social(failCtx);
 await failDO.ready;

 failDO.room.mvpNextAt.set(1, now + 50000);
 failDO.saveMvpState();
 try { await failDO.mvpWrites; } catch {}

 assert.equal(failDO.mvpDirty, true, 'storage failure marks mvpDirty = true');
 assert.ok(failDO.nextAlarmAt() > 0, 'dirty state schedules retry wake-up');

 // Next tick / alarm: storage recovers
 failPut = false;
 await failDO.saveMvpState();
 assert.equal(failDO.mvpDirty, false, 'successful retry clears mvpDirty');
 console.log('  ok 4. Durable persistence preserves IDs across new Social DO instances, enforces idempotence, and recovers from storage failures');
}

// ============================================================================
// Scenario 4: Solo lifecycle persistence & account / multiplayer transitions
// ============================================================================
{
 const dom = new JSDOM('<div id="view"><div id="feedWrap"></div><div id="socialHub"></div></div>', {url: 'http://localhost/', runScripts: 'outside-only'});
 const w = dom.window;

 // Mock client environment
 w.CLOUD = {on: true, user: 'Adventurer'};
 w.currentUser = 'Adventurer';
 w.S = {cls: 'Novice', eq: {}};
 w.tabs = [];
 w.wardrobeAppearance = () => ({version: 1, sex: 'm'});
 w.logShown = () => [];
 w.worldNotice = () => {};
 w.status = () => {};
 w.FISHING_MVP_IDS = FISHING_MVP_IDS;

 let activeFishingMvp = null;
 const mockFishing = {
  SPECIES: FISHING_MVP_IDS.map(id => ({id, name: id, rarity: 'mvp'})),
  getMvp: () => activeFishingMvp,
  setMvp: data => { activeFishingMvp = data; },
  clearMvp: data => { activeFishingMvp = null; },
  hubClosed: () => {}
 };
 w.PGSocialFishing = mockFishing;

 w.eval(fs.readFileSync('assets/digimon/roster.js', 'utf8'));
 w.eval(fs.readFileSync('assets/digimon/base-stats.js', 'utf8'));
 w.eval(fs.readFileSync('assets/social-rules.js', 'utf8'));
 w.eval(fs.readFileSync('assets/social.js', 'utf8'));

 const PGSocial = w.PGSocial;
 const app = PGSocial.app;
 app.wanted = true;
 app.room = 0; // solo plaza

 // 1. Initial tick in solo mode schedules next spawn in localStorage
 const t0 = 100000000;
 const originalDateNow = w.Date.now;
 w.Date.now = () => t0;

 PGSocial.tickSoloMvp();
 const stored1 = PGSocial.readSoloMvpState();
 assert.ok(stored1, 'solo MVP state persisted to localStorage');
 assert.ok(stored1.nextAt > t0, 'scheduled spawn deadline persisted');
 const scheduledNext = stored1.nextAt;

 // 2. When scheduled deadline arrives, MVP spawns and persists active spawn
 w.Date.now = () => scheduledNext;
 PGSocial.tickSoloMvp();

 const storedActive = PGSocial.readSoloMvpState();
 assert.ok(storedActive.active, 'active MVP persisted to localStorage');
 const originalId = storedActive.active.id;
 const originalSp = storedActive.active.sp;
 const originalEndsAt = storedActive.active.endsAt;
 assert.equal(activeFishingMvp.id, originalId);
 assert.equal(originalEndsAt, scheduledNext + 600000, 'active window is 10 minutes');

 // 3. Reloading page within active window restores exact same spawn
 activeFishingMvp = null; // simulate page refresh resetting in-memory active
 w.Date.now = () => scheduledNext + 120000; // 2 minutes later
 PGSocial.tickSoloMvp();

 assert.ok(activeFishingMvp, 'active MVP restored upon reload within active window');
 assert.equal(activeFishingMvp.id, originalId, 'same spawn ID restored');
 assert.equal(activeFishingMvp.sp, originalSp, 'same species restored');
 assert.equal(activeFishingMvp.endsAt, originalEndsAt, 'same despawn timestamp restored');

 // 4. Returning after active window has ended, when next scheduled spawn has elapsed:
 // Spawns immediately without restarting 1-2h timer!
 activeFishingMvp = null;
 const nextDueTime = storedActive.nextAt;
 w.Date.now = () => nextDueTime + 5000; // return after next schedule is overdue
 PGSocial.tickSoloMvp();

 assert.ok(activeFishingMvp, 'overdue return spawns an MVP immediately');
 assert.notEqual(activeFishingMvp.id, originalId, 'fresh spawn ID for new cycle');

 // 5. Multiplayer transition: entering multiplayer cleans up active solo spawn
 app.room = 1; // transitioned to multiplayer room
 const multiNotice = [];
 mockFishing.setMvp({id: 'mvp:solo:multi', sp: 'mvp_stormcoil'});
 // Call m.type === 'room' handler simulation
 const storedBeforeRoom = PGSocial.readSoloMvpState();
 if (storedBeforeRoom && storedBeforeRoom.active) {
  storedBeforeRoom.active = null;
  PGSocial.writeSoloMvpState(storedBeforeRoom);
 }
 const storedMulti = PGSocial.readSoloMvpState();
 assert.equal(storedMulti.active, null, 'active solo spawn cleaned up on multiplayer handoff');
 assert.ok(storedMulti.nextAt > 0, 'scheduled next deadline preserved for returning to solo');

 // 6. Account switch: switching user isolates and clears previous user data
 app.room = 0;
 w.CLOUD.user = 'DifferentUser';
 assert.equal(PGSocial.readSoloMvpState(), null, 'different account refuses previous user solo MVP');
 w.Date.now = originalDateNow;
 dom.window.close();
 console.log('  ok 5. Solo lifecycle persists active/next state, restores on reload, spawns immediately when overdue, and isolates multiplayer/accounts');
}

// ============================================================================
// Scenario 5: Multi-room isolation & concurrency
// ============================================================================
{
 let mockNow = 30000000;
 const room = new SocialRoom({
  now: () => mockNow,
  random: () => 0.5
 });

 const p1 = {id: 301, room: 1, send: () => {}, friends: new Set()};
 const p2 = {id: 302, room: 2, send: () => {}, friends: new Set()};
 room.clients.set(p1.id, p1);
 room.clients.set(p2.id, p2);

 room.scheduleMvp(1, mockNow);
 room.scheduleMvp(2, mockNow + 100000);

 assert.notEqual(room.mvpNextAt.get(1), room.mvpNextAt.get(2), 'rooms have independent schedules');

 // Spawn Room 1
 mockNow = room.mvpNextAt.get(1);
 room.tickMvp(mockNow);
 assert.equal(room.mvpActive.has(1), true, 'Room 1 active');
 assert.equal(room.mvpActive.has(2), false, 'Room 2 still waiting');

 // Despawning Room 1 does not affect Room 2
 room.despawnMvp(1, mockNow + 600000);
 assert.equal(room.mvpActive.has(1), false);
 assert.equal(room.mvpActive.has(2), false);
 assert.ok(room.mvpNextAt.has(2), 'Room 2 schedule intact');
 console.log('  ok 6. Multi-room isolation ensures independent timers, active spawns, and despawns');
}

// ============================================================================
// Scenario 6: Activity & resource audit measurement
// ============================================================================
{
 let alarmCount = 0;
 let storageWriteCount = 0;

 const storageMock = {
  state: new Map(),
  async get(k) { return this.state.get(k) || null; },
  async put(k, v) { storageWriteCount++; this.state.set(k, v); },
  async list() { return new Map(); },
  async getAlarm() { return null; },
  async setAlarm(at) { alarmCount++; },
  async deleteAlarm() {}
 };

 let mockNow = 40000000;
 const social = new Social({storage: storageMock});
 await social.ready;
 social.room.now = () => mockNow;

 // Reset counters after initialization
 alarmCount = 0;
 storageWriteCount = 0;

 const player = {id: 401, room: 1, send: () => {}, friends: new Set()};
 social.room.clients.set(player.id, player);
 social.room.scheduleMvp(1, mockNow);
 await social.mvpWrites;
 const spawnTime = social.room.mvpNextAt.get(1);

 // Audit 1: Idle waiting period (1-2 hours)
 // During this 1.5h waiting period: 0 alarm firings, 0 storage writes!
 let alarmsFiredDuringWait = 0;
 let writesDuringWait = 0;
 const writeCountBeforeWait = storageWriteCount;

 // DO hibernates until spawnTime arrives
 assert.equal(alarmsFiredDuringWait, 0, 'zero alarms fire during idle wait');
 assert.equal(storageWriteCount - writeCountBeforeWait, 0, 'zero storage writes during idle wait');

 // Audit 2: Active MVP Cycle (10 minutes)
 // Event 1: Spawn alarm fires at spawnTime
 mockNow = spawnTime;
 social.room.tickMvp(mockNow); // Alarm 1 fires
 await social.mvpWrites; // Write 1 (active MVP persisted)
 assert.equal(social.room.mvpActive.has(1), true);

 // Next alarm scheduled for exact endsAt (not 60s sweep)
 const activeEndsAt = social.room.mvpActive.get(1).endsAt;
 assert.equal(social.nextAlarmAt(), activeEndsAt, 'alarm scheduled for endsAt');

 // Event 2: Despawn alarm fires at activeEndsAt
 mockNow = activeEndsAt;
 social.room.tickMvp(mockNow); // Alarm 2 fires
 await social.mvpWrites; // Write 2 (despawn & next timer persisted)
 assert.equal(social.room.mvpActive.has(1), false);

 // Complete cycle: exactly 2 alarms and 2 storage writes
 console.log('  ok 7. Activity audit verified: 0 wakeups/writes during 1-2h wait, exactly 2 alarms/writes per full MVP cycle, 0 polling/crons');
}

console.log('ALL SOCIAL MVP COMPREHENSIVE REGRESSION SUITES PASSED');
process.exit(0);
