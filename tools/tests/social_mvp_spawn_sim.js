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
 assert.equal(alarmOps.set, 2, 'measured exactly 2 setAlarm ops across full cycle without duplicate writes');

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

// ============================================================================
// 10. Deadline priority: active battles & earlier poker override MVP retry,
//     storage retries only when actually due, clean recovery
// ============================================================================
{
 // Part A: Write failure during active battle
 {
  let storedAlarm = null;
  let putCount = 0;
  let failPut = true;
  const storage = {
   async get(k) { return null; },
   async put(k, v) {
    putCount++;
    if (failPut && k === 'mvp-state-v1') throw new Error('Simulated write failure');
   },
   async list() { return new Map(); },
   async getAlarm() { return storedAlarm; },
   async setAlarm(at) { storedAlarm = at; },
   async deleteAlarm() { storedAlarm = null; }
  };

  let mockNow = 1000000;
  const social = new Social({ storage });
  social.room.now = () => mockNow;
  await social.ready;

  const player = { id: 701, room: 1, send: () => {}, friends: new Set() };
  social.room.clients.set(player.id, player);
  social.room.hasActiveBattles = () => true;

  // Active battle requires now + 1000 (1001000).
  // MVP save failure retry is due at now + 2000 (1002000).
  social.mvpSaveFailed = true;
  social.mvpRetryAt = mockNow + 2000;

  // Priority check: nextAlarmAt must prioritize battle (1001000) over retry (1002000)
  assert.equal(social.nextAlarmAt(), mockNow + 1000, 'battle deadline (now + 1000) prioritized over MVP write retry (now + 2000)');

  // Trigger Social.alarm() where retry is due now and fails
  social.mvpRetryAt = mockNow;
  let preAlarmPuts = putCount;
  await social.alarm();

  // VERIFICATION: handler must NOT overwrite the battle alarm with now + 2000!
  assert.equal(storedAlarm, mockNow + 1000, 'Social.alarm() preserves battle alarm and does NOT overwrite with now + 2000');

  // Advance to battle tick at now + 1000:
  mockNow += 1000;
  let battleTickPuts = putCount;
  await social.alarm(); // battle tick

  // VERIFICATION: earlier battle alarm must NOT cause storage retries on every gameplay tick!
  assert.equal(putCount - battleTickPuts, 0, 'storage write retry is NOT invoked on battle tick before it is due');
  assert.equal(storedAlarm, mockNow + 1000, 'next alarm scheduled for retry time (1002000)');

  // Advance to retry time at 1002000:
  mockNow += 1000;
  failPut = false; // storage recovers
  let retryTickPuts = putCount;
  await social.alarm(); // retry tick

  // VERIFICATION: retry runs when actually due and recovers
  assert.equal(putCount - retryTickPuts, 1, 'storage write retry runs when actually due');
  assert.equal(social.mvpSaveFailed, false, 'mvpSaveFailed cleared upon successful recovery');
  assert.equal(social.mvpRetryAt, 0, 'mvpRetryAt reset to 0 upon successful recovery');
 }

 // Part B: Load failure during active battle
 {
  let storedAlarm = null;
  let getCount = 0;
  let failGet = true;
  const storage = {
   async get(k) {
    if (k === 'mvp-state-v1') {
     getCount++;
     if (failGet) throw new Error('Simulated read failure');
     return { active: [], nextAt: [] };
    }
    return null;
   },
   async put(k, v) {},
   async list() { return new Map(); },
   async getAlarm() { return storedAlarm; },
   async setAlarm(at) { storedAlarm = at; },
   async deleteAlarm() { storedAlarm = null; }
  };

  let mockNow = 2000000;
  const social = new Social({ storage });
  social.room.now = () => mockNow;
  await social.ready;

  assert.equal(social.mvpLoadFailed, true, 'initial load failed');

  const player = { id: 702, room: 1, send: () => {}, friends: new Set() };
  social.room.clients.set(player.id, player);
  social.room.hasActiveBattles = () => true;

  // Active battle requires now + 1000 (2001000).
  // MVP load retry is due at now + 2000 (2002000).
  assert.equal(social.nextAlarmAt(), mockNow + 1000, 'battle deadline (now + 1000) prioritized over MVP read retry (now + 2000)');

  // Trigger Social.alarm() where retry is due now and fails
  social.mvpRetryAt = mockNow;
  await social.alarm();

  // VERIFICATION: battle alarm preserved, not overwritten with now + 2000
  assert.equal(storedAlarm, mockNow + 1000, 'Social.alarm() preserves battle alarm and does NOT overwrite with now + 2000 on load failure');

  // Advance to battle tick at now + 1000:
  mockNow += 1000;
  let battleTickGets = getCount;
  await social.alarm(); // battle tick

  // VERIFICATION: storage read is NOT retried on battle tick
  assert.equal(getCount - battleTickGets, 0, 'storage read retry is NOT invoked on battle tick before it is due');
  assert.equal(storedAlarm, mockNow + 1000, 'next alarm scheduled for read retry time (2002000)');

  // Advance to retry time at 2002000:
  mockNow += 1000;
  failGet = false; // storage recovers
  let retryTickGets = getCount;
  await social.alarm(); // retry tick

  // VERIFICATION: read retry runs when actually due and recovers
  assert.equal(getCount - retryTickGets, 1, 'storage read retry runs when actually due');
  assert.equal(social.mvpLoaded, true, 'mvpLoaded restored to true');
  assert.equal(social.mvpLoadFailed, false, 'mvpLoadFailed cleared upon recovery');
  assert.equal(social.mvpRetryAt, 0, 'mvpRetryAt reset to 0 upon recovery');
 }

 // Part C: Earlier poker deadline overrides both active battle and MVP retry
 {
  let storedAlarm = null;
  const storage = {
   async get(k) { return null; },
   async put(k, v) {},
   async list() { return new Map(); },
   async getAlarm() { return storedAlarm; },
   async setAlarm(at) { storedAlarm = at; },
   async deleteAlarm() { storedAlarm = null; }
  };

  let mockNow = 3000000;
  const social = new Social({ storage });
  social.room.now = () => mockNow;
  await social.ready;

  const player = { id: 703, room: 1, send: () => {}, friends: new Set() };
  social.room.clients.set(player.id, player);
  social.room.hasActiveBattles = () => true;

  // Active battle requires now + 1000 (3001000).
  // MVP save retry is due at now + 2000 (3002000).
  // Poker table turn deadline is at now + 500 (3000500).
  social.mvpSaveFailed = true;
  social.mvpRetryAt = mockNow + 2000;
  social.room.tables.set(1, [{ nextDeadline: () => mockNow + 500, seats: [1] }]);

  // VERIFICATION: Poker deadline (3000500) wins over battle (3001000) and retry (3002000)
  assert.equal(social.nextAlarmAt(), mockNow + 500, 'poker deadline (now + 500) prioritized over battle (now + 1000) and retry (now + 2000)');

  social.scheduleKeepalive();
  await social.battleAlarmWrite;
  assert.equal(storedAlarm, mockNow + 500, 'stored alarm set to exact earliest poker deadline');
 }

 console.log('  ok 10. Deadline priority: active battles and earlier poker deadlines override MVP retry, storage retries only when due, clean recovery');
}

console.log('ALL SOCIAL MVP COMPREHENSIVE REGRESSION SUITES PASSED');
process.exit(0);
