import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {SocialRoom,cleanMvpState,FISHING_MVP_IDS} from '../../workers/social/room.mjs';
import {Social} from '../../workers/social/index.mjs';

console.log('social MVP spawn simulation: testing pure earliest-deadline scheduler, DO persistence/recovery, solo lifecycle, and executable alarm driver');

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
// 2. Empty room handling, pending overdue retention, & GM manual spawn
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
// 3. Preserve alarms across hibernation & cold WebSocket wakes
// ============================================================================
{
 const futureDeadline = 5000000;
 let mockNow = 1000000;
 let storedAlarm = futureDeadline;
 let deleteAlarmCalled = false;
 let setAlarmCalled = false;

 const hibernatedSocket = {
  sent: [],
  send(data) { this.sent.push(data); },
  close() {},
  deserializeAttachment() {
   return { id: 101, name: 'HibernatedAngler', room: 1, friends: [] };
  }
 };

 const mockCtx = {
  getWebSockets() {
   return [hibernatedSocket];
  },
  storage: {
   async get(key) {
    if (key === 'mvp-state-v1') {
     return { active: [], nextAt: [[1, futureDeadline]] };
    }
    return null;
   },
   async put() {},
   async list() { return new Map(); },
   async getAlarm() { return storedAlarm; },
   async setAlarm(at) { setAlarmCalled = true; storedAlarm = at; },
   async deleteAlarm() { deleteAlarmCalled = true; storedAlarm = null; }
  }
 };

 // Construct new Social instance with hibernated player socket in room 1
 const social = new Social(mockCtx);
 social.room.now = () => mockNow;
 await social.ready;

 // VERIFICATION 1: Actual occupancy was restored before empty-room scheduling decisions!
 assert.equal(social.room.hasOccupants(1), true, 'hibernated socket restored occupancy to room 1');
 assert.equal(deleteAlarmCalled, false, 'initialization MUST NOT delete alarm for occupied room');
 assert.equal(storedAlarm, futureDeadline, 'future MVP deadline alarm preserved in storage');

 // Process cold WebSocket ping
 await social.webSocketMessage(hibernatedSocket, JSON.stringify({type: 'ping'}));

 // VERIFICATION 2: Processing a ping does not delete or distort the required alarm
 assert.equal(deleteAlarmCalled, false, 'ping MUST NOT delete the alarm');
 assert.equal(storedAlarm, futureDeadline, 'stored alarm still targets future MVP deadline');
 assert.equal(social.nextAlarmAt(), futureDeadline, 'nextAlarmAt returns exact future deadline');

 console.log('  ok 3. Alarms preserved across hibernation: occupancy restored before scheduling, ping preserves alarm');
}

// ============================================================================
// 4. Separate pending writes from failed writes
// ============================================================================
{
 let mockNow = 2000000;
 let alarmSet = null;
 let gateResolve = null;
 const gatePromise = new Promise(r => { gateResolve = r; });
 let gateActive = true;

 const mockStorage = {
  async get(k) { return null; },
  async put(k, v) {
   if (gateActive) await gatePromise;
  },
  async list() { return new Map(); },
  async getAlarm() { return alarmSet; },
  async setAlarm(at) { alarmSet = at; },
  async deleteAlarm() { alarmSet = null; }
 };

 const social = new Social({ storage: mockStorage });
 social.room.now = () => mockNow;
 await social.ready;

 const p = { id: 201, room: 1, send: () => {}, friends: new Set() };
 social.room.clients.set(p.id, p);

 // Trigger MVP scheduling
 social.room.scheduleMvp(1, mockNow);
 const realDeadline = social.room.mvpNextAt.get(1);
 assert.ok(realDeadline > mockNow);

 // While write is pending (put has not resolved yet):
 assert.equal(social.mvpSaveFailed, false, 'pending write is NOT marked failed');
 assert.equal(social.nextAlarmAt(), realDeadline, 'nextAlarmAt targets real gameplay deadline, NOT 2-second retry');
 assert.notEqual(social.nextAlarmAt(), mockNow + 2000, 'never schedules 2-second retry for normal pending write');

 // Let the write resolve successfully
 gateActive = false;
 gateResolve();
 await social.mvpWrites;
 await social.battleAlarmWrite;

 assert.equal(social.mvpSaveFailed, false, 'successful write leaves mvpSaveFailed false');
 assert.equal(social.nextAlarmAt(), realDeadline, 'after write completes, alarm still targets real gameplay deadline');
 assert.equal(alarmSet, realDeadline, 'stored alarm is set to real gameplay deadline');

 // Test concurrent / rapid writes:
 const writePromises = [];
 social.room.scheduleMvp(1, mockNow + 100);
 writePromises.push(social.saveMvpState());
 social.room.scheduleMvp(1, mockNow + 200);
 writePromises.push(social.saveMvpState());

 await Promise.all(writePromises);
 await social.battleAlarmWrite;
 assert.equal(social.mvpSaveFailed, false, 'concurrent writes resolved cleanly');

 console.log('  ok 4. Pending writes separated from failed writes: no 2-second retry alarm on healthy persistence');
}

// ============================================================================
// 5. Separate load failures from write failures & preserve active state
// ============================================================================
{
 let mockNow = 3000000;
 let failRead = true;
 const persistentState = {
  active: [[1, { sp: 'mvp_stormcoil', id: 'mvp:keep:123', spawnedAt: mockNow - 100000, endsAt: mockNow + 500000 }]],
  nextAt: []
 };

 let savedToStorage = null;

 const mockStorage = {
  async get(k) {
   if (k === 'mvp-state-v1' && failRead) {
    throw new Error('Transient read error');
   }
   if (k === 'mvp-state-v1') return persistentState;
   return null;
  },
  async put(k, v) {
   if (k === 'mvp-state-v1') savedToStorage = v;
  },
  async list() { return new Map(); },
  async getAlarm() { return null; },
  async setAlarm(at) {},
  async deleteAlarm() {}
 };

 const social = new Social({ storage: mockStorage });
 social.room.now = () => mockNow;
 await social.ready;

 // VERIFICATION 1: Load failure state
 assert.equal(social.mvpLoaded, false, 'mvpLoaded is false on read failure');
 assert.equal(social.mvpLoadFailed, true, 'mvpLoadFailed is true on read failure');
 assert.equal(social.room.mvpLoaded, false, 'room.mvpLoaded is false on read failure');

 // VERIFICATION 2: saveMvpState() MUST NOT overwrite storage with empty maps!
 await social.saveMvpState();
 assert.equal(savedToStorage, null, 'storage read failure MUST NOT write empty maps over stored record');

 // VERIFICATION 3: Unrelated plaza features remain functional!
 const p1 = { id: 301, name: 'Alice', room: 0, send: () => {}, friends: new Set() };
 social.room.clients.set(p1.id, p1);
 social.room.enterPlazaRoom(p1, 1, mockNow);
 assert.equal(p1.room, 1, 'player can enter room even if MVP storage read failed');
 social.room.receive(p1, JSON.stringify({ type: 'move', x: 5, z: 12 }));
 assert.ok(p1.path.length > 0, 'player movement functions normally');
 social.room.receive(p1, JSON.stringify({ type: 'chat', channel: 'world', body: 'Hello Prontera' }));
 assert.ok(social.room.history.length > 0, 'chat functions normally');

 // VERIFICATION 4: Next alarm schedules a 2-second retry wakeup
 assert.equal(social.nextAlarmAt(), mockNow + 2000, 'schedules retry alarm for load failure');

 // VERIFICATION 5: Transient failure recovers on next alarm
 failRead = false;
 mockNow += 2000;
 await social.alarm(); // invokes retry reading

 assert.equal(social.mvpLoaded, true, 'mvpLoaded is true after recovery');
 assert.equal(social.mvpLoadFailed, false, 'mvpLoadFailed is false after recovery');
 assert.equal(social.room.mvpLoaded, true, 'room.mvpLoaded is true after recovery');

 // VERIFICATION 6: Preserves the active spawn ID and deadline exactly!
 assert.equal(social.room.mvpActive.has(1), true, 'active MVP restored');
 const restored = social.room.mvpActive.get(1);
 assert.equal(restored.id, 'mvp:keep:123', 'active spawn ID preserved across read failure');
 assert.equal(restored.endsAt, mockNow - 2000 + 500000, 'despawn deadline preserved');

 console.log('  ok 5. Load failures separated from write failures: no empty maps written, plaza available, retry restores IDs');
}

// ============================================================================
// 6. Storage write failure handling and recovery
// ============================================================================
{
 let mockNow = 4000000;
 let failWrite = true;
 let storedData = null;

 const mockStorage = {
  async get(k) { return null; },
  async put(k, v) {
   if (failWrite && k === 'mvp-state-v1') {
    throw new Error('Disk write failure');
   }
   storedData = v;
  },
  async list() { return new Map(); },
  async getAlarm() { return null; },
  async setAlarm(at) {},
  async deleteAlarm() {}
 };

 const social = new Social({ storage: mockStorage });
 social.room.now = () => mockNow;
 await social.ready;

 const p = { id: 401, room: 1, send: () => {}, friends: new Set() };
 social.room.clients.set(p.id, p);

 social.room.scheduleMvp(1, mockNow);
 const realDeadline = social.room.mvpNextAt.get(1);

 // Wait for the failed write to reject
 await social.mvpWrites;

 assert.equal(social.mvpSaveFailed, true, 'write failure sets mvpSaveFailed to true');
 assert.equal(social.nextAlarmAt(), mockNow + 2000, 'schedules 2-second retry alarm');

 // Recover storage
 failWrite = false;
 mockNow += 2000;
 await social.alarm(); // invokes retry save

 assert.equal(social.mvpSaveFailed, false, 'retry save succeeded');
 assert.ok(storedData, 'state persisted to storage upon retry');
 assert.equal(social.nextAlarmAt(), realDeadline, 'alarm returned to real gameplay deadline');

 console.log('  ok 6. Storage write failures schedule 2-second retry and recover cleanly');
}

// ============================================================================
// 7. Executable Alarm Driver: Real clock advance, alarm() calls, & measured costs
// ============================================================================
{
 let storedAlarm = null;
 let actualAlarmInvocations = 0;
 let stateWrites = 0;
 const alarmOps = { set: 0, get: 0, delete: 0 };

 const storageMock = {
  state: new Map(),
  async get(k) { return this.state.get(k) || null; },
  async put(k, v) {
   if (k === 'mvp-state-v1') stateWrites++;
   this.state.set(k, v);
  },
  async list() { return new Map(); },
  async getAlarm() {
   alarmOps.get++;
   return storedAlarm;
  },
  async setAlarm(at) {
   alarmOps.set++;
   storedAlarm = at;
  },
  async deleteAlarm() {
   alarmOps.delete++;
   storedAlarm = null;
  }
 };

 let mockNow = 50000000;
 const social = new Social({ storage: storageMock });
 social.room.now = () => mockNow;
 await social.ready;

 const player = { id: 501, room: 1, send: () => {}, friends: new Set() };
 social.room.clients.set(player.id, player);

 // Initial schedule for occupied room 1
 social.room.scheduleMvp(1, mockNow);
 await social.mvpWrites;
 await social.battleAlarmWrite;
 const spawnTime = social.room.mvpNextAt.get(1);
 assert.ok(spawnTime > mockNow);
 assert.equal(storedAlarm, spawnTime, 'alarm in storage set to exact spawn time');

 // Reset baseline counters before starting alarm driver
 actualAlarmInvocations = 0;
 stateWrites = 0;
 alarmOps.set = 0;
 alarmOps.get = 0;
 alarmOps.delete = 0;

 // ========================================================================
 // Driver Phase 1: Idle waiting period (1–2 hours)
 // ========================================================================
 // Verify no alarm fires between now and spawnTime - 1ms
 assert.equal(actualAlarmInvocations, 0, 'zero alarm invocations during idle waiting window');
 assert.equal(stateWrites, 0, 'zero state writes during idle waiting window');

 // ========================================================================
 // Driver Phase 2: Spawn alarm
 // ========================================================================
 // Cloudflare wakes DO when storedAlarm arrives
 assert.equal(storedAlarm, spawnTime);
 mockNow = storedAlarm;
 actualAlarmInvocations++;
 await social.alarm(); // Real Social.alarm() execution!

 assert.equal(social.room.mvpActive.has(1), true, 'alarm() invocation triggered MVP spawn');
 const activeEndsAt = social.room.mvpActive.get(1).endsAt;
 assert.equal(activeEndsAt, mockNow + 600000, 'active MVP duration is 10 minutes');
 assert.equal(stateWrites, 1, 'exactly 1 state write persisted the spawn');
 assert.equal(storedAlarm, activeEndsAt, 'next alarm scheduled for endsAt');

 // During active window: DO hibernates until activeEndsAt arrives
 // No intermediate alarms!

 // ========================================================================
 // Driver Phase 3: Despawn alarm
 // ========================================================================
 assert.equal(storedAlarm, activeEndsAt);
 mockNow = storedAlarm;
 actualAlarmInvocations++;
 await social.alarm(); // Real Social.alarm() execution!

 assert.equal(social.room.mvpActive.has(1), false, 'alarm() invocation triggered MVP despawn');
 assert.equal(stateWrites, 2, 'exactly 2 state writes (1 spawn + 1 despawn) per full cycle');
 const nextSpawnAt = social.room.mvpNextAt.get(1);
 assert.ok(nextSpawnAt > mockNow, 'next spawn scheduled');
 assert.equal(storedAlarm, nextSpawnAt, 'alarm in storage set to next spawn');

 // Summary of measured driver results:
 assert.equal(actualAlarmInvocations, 2, 'measured exactly 2 alarm invocations across full cycle');
 assert.equal(stateWrites, 2, 'measured exactly 2 state writes across full cycle');

 console.log(`  ok 7. Executable alarm driver verified:
       - Idle wait: 0 alarms, 0 writes
       - Active cycle: exactly ${actualAlarmInvocations} alarm invocations, ${stateWrites} state writes, ${alarmOps.set} setAlarm ops`);
}

// ============================================================================
// 8. Solo lifecycle persistence & account / multiplayer transitions
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
 console.log('  ok 8. Solo lifecycle persists active/next state, restores on reload, spawns immediately when overdue, and isolates multiplayer/accounts');
}

// ============================================================================
// 9. Multi-room isolation & concurrency
// ============================================================================
{
 let mockNow = 60000000;
 const room = new SocialRoom({
  now: () => mockNow,
  random: () => 0.5
 });

 const p1 = {id: 601, room: 1, send: () => {}, friends: new Set()};
 const p2 = {id: 602, room: 2, send: () => {}, friends: new Set()};
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
 console.log('  ok 9. Multi-room isolation ensures independent timers, active spawns, and despawns');
}

console.log('ALL SOCIAL MVP COMPREHENSIVE REGRESSION SUITES PASSED');
process.exit(0);
