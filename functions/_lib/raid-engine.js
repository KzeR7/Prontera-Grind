// Pure, clock-injected engine for the four-stage Astral Rift Raid (haven-v449).
//
// No D1, Durable Object, DOM or wall clock is read here: the caller supplies every timestamp, which
// is what makes the schedule deterministic in tests and authoritative in production. The Social
// Durable Object owns a run object built and advanced by these functions.
//
// WHAT THE SERVER OWNS
//   * which stage the party is on, which enemies exist, their HP, and which enemies are still required
//   * every mechanic's warning window, its locked orientation/target and the damage it deals
//   * the party's HP, downed state, revive holds and the wipe decision
//   * stage transitions: a portal only opens when the stage objective is complete
//
// WHAT THE CLIENT OWNS
//   * where the player *wants* to stand and which enemy they *want* to hit (movement intent)
//   * rendering, interpolation, telegraph outlines and local effects
//
// The client never reports damage, a kill, a stage clear or a movement outcome. A walk is validated
// against the stage bounds; a target is validated against the live enemy list.
import {
  RAID_RULES, RAID_STAGES, raidPartySize, raidStage, stageEnemyHp, rollRaidClear, rollPityChest,
  rollFracturedChest, raidMeaningful, raidRunSeconds, raidStageSeconds,
} from './raid-rules.js';
import { sanitizeRaidProfile } from './raid-profile.js';

const finite = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Number(n) : fallback);
const int = (n, fallback = 0) => Math.max(0, Math.floor(finite(n, fallback)));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

export const RAID_ACTION_ID_RE = /^[A-Za-z0-9:_-]{8,100}$/;
// A cleared stage's portal carries the party forward by itself after this long, so a disconnected
// leader or an AFK member can never strand a run at a transition.
const PORTAL_AUTO_SECONDS = 20;

// A walk and a focus target are intents, not paid actions. Everything else a raid can ask for is one
// of the three interactions the dungeon actually teaches.
const INTENTS = new Set(['move', 'focus']);
const PAID_ACTIONS = new Set(['interact', 'revive', 'dash']);
const ACTIONS = new Set([...INTENTS, ...PAID_ACTIONS]);

// ---------------------------------------------------------------- geometry ----
// Stage bounds are world units on the client's map plane: x across the map, z up the map (a smaller
// z is "deeper" in the dungeon). The client draws exactly these bounds, so the server can validate a
// destination against the same numbers the player sees.
export const STAGE_BOUNDS = Object.freeze({
  approach: Object.freeze({ minX: -10.5, maxX: 10.5, minZ: -20, maxZ: 11 }),
  arcade: Object.freeze({ minX: -12, maxX: 12, minZ: -21, maxZ: 11 }),
  observatory: Object.freeze({ minX: -12.5, maxX: 12.5, minZ: -12.5, maxZ: 12.5 }),
  sanctuary: Object.freeze({ minX: -14, maxX: 14, minZ: -14, maxZ: 13 }),
});

export function stageBounds(stageKey) {
  return STAGE_BOUNDS[stageKey] || STAGE_BOUNDS.approach;
}

function clampPoint(stageKey, x, z) {
  const b = stageBounds(stageKey);
  return { x: clamp(finite(x, 0), b.minX + 0.4, b.maxX - 0.4), z: clamp(finite(z, 0), b.minZ + 0.4, b.maxZ - 0.4) };
}

// ---------------------------------------------------------------- utility -----
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const reject = (error, run, code = 409) => ({ ok: false, code, error, run });

// The automatic chase advances in 100 ms slices so a long catch-up tick cannot tunnel through a
// telegraph (see `autoApproach`).
const WALK_CHUNK_MS = 100;

function sanitizeReceipt(raw) {
  if (!isObj(raw) || typeof raw.id !== 'string' || !RAID_ACTION_ID_RE.test(raw.id)) return null;
  return {
    id: raw.id,
    action: ACTIONS.has(raw.action) ? raw.action : 'interact',
    at: int(raw.at, 0),
    damage: int(raw.damage, 0),
    healed: int(raw.healed, 0),
  };
}

// A run member. `profile` is the server-side class snapshot; `maxHp` is repaired here so no code path
// can ever see a null/NaN ceiling. `hp` is clamped to it.
function sanitizeMember(raw, index) {
  if (!isObj(raw) || !Number.isInteger(Number(raw.id)) || Number(raw.id) < 1) return null;
  const profile = sanitizeRaidProfile(raw.profile);
  const maxHp = clamp(int(raw.maxHp, profile.maxHp), 1_000, 1_000_000_000);
  return {
    id: Number(raw.id),
    name: typeof raw.name === 'string' ? raw.name.slice(0, 32) : `Adventurer ${index + 1}`,
    profile,
    maxHp,
    hp: clamp(int(raw.hp, maxHp), 0, maxHp),
    x: clamp(finite(raw.x, 0), -60, 60),
    z: clamp(finite(raw.z, 8), -60, 60),
    intentX: clamp(finite(raw.intentX, raw.x ?? 0), -60, 60),
    intentZ: clamp(finite(raw.intentZ, raw.z ?? 8), -60, 60),
    face: clamp(finite(raw.face, 0), -Math.PI * 2, Math.PI * 2),
    downed: raw.downed === true,
    downUntil: int(raw.downUntil, 0),
    reviveHold: clamp(finite(raw.reviveHold, 0), 0, RAID_RULES.reviveHoldMs),
    reviveBy: int(raw.reviveBy, 0),
    lastIntentAt: int(raw.lastIntentAt, 0),
    lastPaidAt: int(raw.lastPaidAt, 0),
    nextAutoAt: int(raw.nextAutoAt, 0),
    nextSkillAt: int(raw.nextSkillAt, 0),
    nextPetAt: int(raw.nextPetAt, 0),
    damage: int(raw.damage, 0),
    support: int(raw.support, 0),
    actions: int(raw.actions, 0),
    dodges: int(raw.dodges, 0),
    downs: int(raw.downs, 0),
    targetId: typeof raw.targetId === 'string' ? raw.targetId.slice(0, 40) : '',
    auto: raw.auto !== false,
    manualUntil: int(raw.manualUntil, 0),
    receipts: Array.isArray(raw.receipts) ? raw.receipts.map(sanitizeReceipt).filter(Boolean).slice(-RAID_RULES.maxActionReceipts) : [],
  };
}

function sanitizeEnemy(raw) {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  const maxHp = clamp(int(raw.maxHp, 1), 1, 4_000_000_000);
  return {
    id: raw.id.slice(0, 40),
    kind: typeof raw.kind === 'string' ? raw.kind.slice(0, 24) : 'mob',
    name: typeof raw.name === 'string' ? raw.name.slice(0, 40) : 'Rift enemy',
    spriteId: int(raw.spriteId, 0),
    shape: typeof raw.shape === 'string' ? raw.shape.slice(0, 12) : 'demon',
    magic: raw.magic === true,
    ranged: raw.ranged === true,
    maxHp,
    hp: clamp(int(raw.hp, maxHp), 0, maxHp),
    x: clamp(finite(raw.x, 0), -40, 40),
    z: clamp(finite(raw.z, 0), -40, 40),
    homeX: clamp(finite(raw.homeX, raw.x), -40, 40),
    homeZ: clamp(finite(raw.homeZ, raw.z), -40, 40),
    required: raw.required !== false,
    marked: raw.marked === true,
    deadAt: int(raw.deadAt, 0),
    aggroAt: int(raw.aggroAt, 0),
    nextAttackAt: int(raw.nextAttackAt, 0),
    casting: isObj(raw.casting) ? {
      mechanic: String(raw.casting.mechanic || '').slice(0, 24),
      endsAt: int(raw.casting.endsAt, 0),
      succeedAt: int(raw.casting.succeedAt, 0),
      failedAt: int(raw.casting.failedAt, 0),
    } : null,
    label: typeof raw.label === 'string' ? raw.label.slice(0, 40) : '',
  };
}

function sanitizeMechanic(raw) {
  if (!isObj(raw) || !raw.kind) return null;
  const kind = String(raw.kind);
  if (!['soul-cleave', 'astral-cataclysm', 'ritual', 'sweep'].includes(kind)) return null;
  const base = {
    kind,
    id: typeof raw.id === 'string' ? raw.id.slice(0, 48) : `${kind}:${int(raw.startsAt, 0)}`,
    startsAt: int(raw.startsAt, 0),
    endsAt: int(raw.endsAt, 0),
    resolvedAt: int(raw.resolvedAt, 0),
    outcome: typeof raw.outcome === 'string' ? raw.outcome.slice(0, 24) : '',
  };
  if (kind === 'soul-cleave') {
    return { ...base, originX: finite(raw.originX, 0), originZ: finite(raw.originZ, 0), angle: finite(raw.angle, 0), length: finite(raw.length, RAID_RULES.soulCleave.length), halfWidth: finite(raw.halfWidth, RAID_RULES.soulCleave.halfWidth) };
  }
  if (kind === 'astral-cataclysm') {
    return { ...base, safeX: finite(raw.safeX, 0), safeZ: finite(raw.safeZ, 0), safeRadius: finite(raw.safeRadius, RAID_RULES.cataclysm.safeRadius) };
  }
  if (kind === 'sweep') {
    return { ...base, x: finite(raw.x, 0), halfWidth: finite(raw.halfWidth, 2.2), axis: raw.axis === 'z' ? 'z' : 'x' };
  }
  return { ...base, sourceIds: Array.isArray(raw.sourceIds) ? raw.sourceIds.filter(x => typeof x === 'string').slice(0, 6) : [] };
}

// ---------------------------------------------------------------- creation ----
// Enemy layout per stage. These are *logical* positions inside the stage's bounds; the client draws
// the map geometry around them. Everything the server needs to validate a fight is here.
const ENEMY_LAYOUT = Object.freeze({
  approach: Object.freeze([
    Object.freeze({ id: 'a1-g1', name: 'Retribution Angel', spriteId: 1702, shape: 'demon', x: -3.4, z: -6.5, pack: 0 }),
    Object.freeze({ id: 'a1-g2', name: 'Despair Phantom', spriteId: 1705, shape: 'demon', x: 1.6, z: -8.2, pack: 0 }),
    Object.freeze({ id: 'a1-g3', name: 'Tower Watcher', spriteId: 1700, shape: 'demon', x: 4.2, z: -5.4, pack: 0 }),
    Object.freeze({ id: 'a2-g1', name: 'Death Whisperer', spriteId: 1706, shape: 'demon', x: -5.2, z: -13.2, pack: 1 }),
    Object.freeze({ id: 'a2-g2', name: 'Agony Demon', spriteId: 1707, shape: 'demon', x: -0.6, z: -15.4, pack: 1 }),
    Object.freeze({ id: 'a2-g3', name: 'Retribution Angel', spriteId: 1702, shape: 'demon', x: 4.6, z: -13.8, pack: 1, ranged: true }),
    Object.freeze({ id: 'a3-g1', name: 'Tower Watcher', spriteId: 1700, shape: 'demon', x: -1.8, z: -19.4, pack: 2 }),
  ]),
  arcade: Object.freeze([
    Object.freeze({ id: 'b1-g1', name: 'Death Whisperer', spriteId: 1706, shape: 'demon', x: -8.4, z: -3.2, pack: 0 }),
    Object.freeze({ id: 'b1-g2', name: 'Retribution Angel', spriteId: 1702, shape: 'demon', x: -8.6, z: -7.6, pack: 0, ranged: true }),
    Object.freeze({ id: 'b1-g3', name: 'Agony Demon', spriteId: 1707, shape: 'demon', x: 7.8, z: -4.4, pack: 0 }),
    Object.freeze({ id: 'b1-g4', name: 'Despair Phantom', spriteId: 1705, shape: 'demon', x: 8.2, z: -8.8, pack: 0 }),
    Object.freeze({ id: 'b1-g5', name: 'Tower Watcher', spriteId: 1700, shape: 'demon', x: 0.2, z: -10.6, pack: 0, ranged: true }),
    Object.freeze({ id: 'b-anchor-l', kind: 'anchor', name: 'Rift Anchor', spriteId: 1708, shape: 'demon', x: -6.6, z: -15.4, pack: 1, label: 'Shield anchor' }),
    Object.freeze({ id: 'b-anchor-r', kind: 'anchor', name: 'Rift Anchor', spriteId: 1708, shape: 'demon', x: 6.6, z: -15.4, pack: 1, label: 'Shield anchor' }),
    Object.freeze({ id: 'b1-g6', name: 'Death Whisperer', spriteId: 1706, shape: 'demon', x: -2.4, z: -18.2, pack: 2 }),
    Object.freeze({ id: 'b1-g7', name: 'Agony Demon', spriteId: 1707, shape: 'demon', x: 2.6, z: -18.4, pack: 2 }),
  ]),
  observatory: Object.freeze([
    Object.freeze({ id: 'c-ritual-1', kind: 'ritual-source', name: 'Ritual Adept', spriteId: 1639, shape: 'demon', x: -6.4, z: -5.2, pack: 0, label: 'Ritual source' }),
    Object.freeze({ id: 'c-ritual-2', kind: 'ritual-source', name: 'Ritual Adept', spriteId: 1637, shape: 'demon', x: 6.2, z: -5.6, pack: 0, label: 'Ritual source' }),
    Object.freeze({ id: 'c-wave-1a', name: 'Astral Sentry', spriteId: 1836, shape: 'demon', x: -3.4, z: -9.8, pack: 1 }),
    Object.freeze({ id: 'c-wave-1b', name: 'Astral Sentry', spriteId: 1837, shape: 'demon', x: 3.6, z: -9.6, pack: 1 }),
    Object.freeze({ id: 'c-wave-2a', name: 'Tower Watcher', spriteId: 1700, shape: 'demon', x: 0, z: -2.4, pack: 2, ranged: true }),
    Object.freeze({ id: 'c-wave-2b', name: 'Death Whisperer', spriteId: 1706, shape: 'demon', x: -8.2, z: 2.6, pack: 2 }),
    Object.freeze({ id: 'c-wave-2c', name: 'Despair Phantom', spriteId: 1705, shape: 'demon', x: 8.2, z: 2.4, pack: 2 }),
  ]),
  sanctuary: Object.freeze([
    Object.freeze({ id: 'thanatos', kind: 'boss', name: 'Thanatos', spriteId: 1708, shape: 'demon', x: 0, z: -8.4, magic: true, label: 'The named boss' }),
  ]),
});

function stageEnemies(stage, partyDps, options = {}) {
  const layout = ENEMY_LAYOUT[stage.key] || [];
  const total = stageEnemyHp(stage.id, partyDps, options);
  const weights = layout.map(e => (e.kind === 'boss' ? 0 : e.kind === 'anchor' || e.kind === 'ritual-source' ? 1.35 : 1));
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  return layout.map((e, i) => {
    const share = e.kind === 'boss' ? 1 : weights[i] / weightSum;
    const maxHp = Math.max(1, Math.round(total * share));
    return {
      id: e.id,
      kind: e.kind || 'mob',
      name: e.name,
      spriteId: e.spriteId,
      shape: e.shape,
      magic: e.magic === true,
      ranged: e.ranged === true,
      maxHp,
      hp: maxHp,
      x: e.x, z: e.z,
      homeX: e.x, homeZ: e.z,
      required: e.required !== false,
      marked: false,
      deadAt: 0,
      aggroAt: 0,
      nextAttackAt: 0,
      casting: null,
      label: e.label || '',
      pack: e.pack || 0,
    };
  });
}

// A ritual source has its own health, derived from the boss pool so solo and trio play differ only by
// the party's measured damage.
function ritualSources(run, at) {
  const boss = run.enemies.find(e => e.kind === 'boss');
  if (!boss) return [];
  // Health is measured in seconds of the party's own boss damage, so the interrupt is reachable by
  // the same party that is fighting the boss, at every gear level and every party size.
  const partyDps = Math.max(RAID_RULES.dpsMin, run.partyDps || 0);
  const sourceHp = Math.max(1, Math.round(partyDps * RAID_RULES.ritual.sourceSeconds));
  const count = RAID_RULES.scaling.ritualSourcesSolo;
  const out = [];
  const angle0 = run.mechanics.filter(m => m.kind === 'ritual').length * 1.1;
  for (let i = 0; i < count; i++) {
    const a = angle0 + (i / count) * Math.PI * 2;
    out.push({
      id: `ritual-${run.ritualIndex}-${i}`,
      kind: 'ritual-source',
      name: 'Ritual Adept',
      spriteId: i % 2 ? 1637 : 1639,
      shape: 'demon',
      magic: true,
      ranged: true,
      maxHp: sourceHp,
      hp: sourceHp,
      x: Math.cos(a) * 6.2,
      z: boss.z + 4.2 + Math.sin(a) * 5.4,
      homeX: Math.cos(a) * 6.2,
      homeZ: boss.z + 4.2 + Math.sin(a) * 5.4,
      required: false,
      marked: true,
      deadAt: 0,
      aggroAt: at,
      nextAttackAt: at + 1_200,
      casting: null,
      label: 'Ritual source',
      pack: 9,
      ritual: true,
    });
  }
  return out;
}

export function createRaidRun(input = {}) {
  const party = Array.isArray(input.members) ? input.members.map(sanitizeMember).filter(Boolean) : [];
  if (!party.length) throw new Error('A raid needs at least one member');
  const partySize = raidPartySize(input.partySize ?? party.length);
  // `now` is the run's fixed identity: D1 stores the same `startedAt`/`deadlineAt` at reservation
  // time, and settlement re-reads them to prove the room never re-clocked the run. When a caller
  // supplies an explicit clock it wins over the room's own, or the two records drift apart.
  const now = int(input.now, Date.now());
  const seed = int(input.seed, 1) || 1;
  const stage = RAID_STAGES[0];
  const partyDps = party.reduce((sum, m) => sum + clamp(finite(m.profile.dps, 0), 0, RAID_RULES.dpsMax), 0)
    * clamp(finite(input.dpsScale, 1), 0.5, 2);
  const enemies = stageEnemies(stage, partyDps);
  const entrance = stageBounds(stage.key);
  party.forEach((m, i) => {
    m.x = clamp((i - (party.length - 1) / 2) * 2.2, entrance.minX + 1, entrance.maxX - 1);
    m.z = entrance.maxZ - 2;
    m.intentX = m.x;
    m.intentZ = m.z;
    m.nextAutoAt = now;
    m.nextSkillAt = now + RAID_RULES.combat.skillEveryMs;
    m.nextPetAt = now + 800;
  });
  const firstAt = now + 3_000;
  return {
    version: 449,
    id: typeof input.id === 'string' ? input.id : `raid:${now}`,
    seed,
    partySize,
    state: 'active',
    stageIndex: 0,
    stageKey: stage.key,
    stageName: stage.name,
    stageStartedAt: now,
    stageEndsAt: now + raidStageSeconds(stage.key) * 1000,
    startedAt: now,
    updatedAt: now,
    deadlineAt: now + raidRunSeconds() * 1000,
    finishedAt: 0,
    settledAckAt: 0,
    partyDps,
    partyDpsMeasured: Math.round(partyDps),
    bossArmor: clamp(finite(input.bossArmor, RAID_RULES.bossArmor), 0, 0.8),
    enemies,
    stageCleared: false,
    portalOpenAt: 0,
    mechanics: [],
    nextMechanicAt: firstAt,
    ritualIndex: 0,
    ritualTriggersUsed: [],
    damageWindowUntil: 0,
    enrage: false,
    portalRequestedAt: 0,
    members: party,
    log: [],
  };
}

// ---------------------------------------------------------------- sanitizing ---
export function sanitizeRaidRun(raw) {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  if (!Array.isArray(raw.members)) return null;
  const members = raw.members.map(sanitizeMember).filter(Boolean);
  if (!members.length) return null;
  const enemies = Array.isArray(raw.enemies) ? raw.enemies.map(sanitizeEnemy).filter(Boolean) : [];
  const mechanics = Array.isArray(raw.mechanics) ? raw.mechanics.map(sanitizeMechanic).filter(Boolean).slice(-6) : [];
  const stageKey = typeof raw.stageKey === 'string' ? raw.stageKey : 'approach';
  const stage = RAID_STAGES.find(s => s.key === stageKey) || RAID_STAGES[0];
  const state = ['active', 'cleared', 'failed', 'cancelled'].includes(raw.state) ? raw.state : 'active';
  const startedAt = int(raw.startedAt, Date.now());
  const deadlineAt = Math.max(startedAt + 60_000, int(raw.deadlineAt, startedAt + 600_000));
  return {
    version: 449,
    id: raw.id.slice(0, 80),
    seed: int(raw.seed, 1) || 1,
    partySize: raidPartySize(raw.partySize ?? members.length),
    state,
    stageIndex: clamp(int(raw.stageIndex, 0), 0, RAID_STAGES.length - 1),
    stageKey: stage.key,
    stageName: stage.name,
    stageStartedAt: int(raw.stageStartedAt, startedAt),
    stageEndsAt: int(raw.stageEndsAt, startedAt + stage.budgetSeconds * 1000),
    startedAt,
    updatedAt: Math.max(startedAt, int(raw.updatedAt, startedAt)),
    deadlineAt,
    finishedAt: clamp(int(raw.finishedAt, 0), 0, deadlineAt),
    settledAckAt: int(raw.settledAckAt, 0),
    partyDps: clamp(finite(raw.partyDps, 0), 0, RAID_RULES.dpsMax * RAID_RULES.maxParty),
    partyDpsMeasured: int(raw.partyDpsMeasured, 0),
    bossArmor: clamp(finite(raw.bossArmor, RAID_RULES.bossArmor), 0, 0.8),
    enemies,
    stageCleared: raw.stageCleared === true,
    portalOpenAt: int(raw.portalOpenAt, 0),
    portalRequestedAt: int(raw.portalRequestedAt, 0),
    mechanics,
    nextMechanicAt: int(raw.nextMechanicAt, startedAt + 3_000),
    ritualIndex: int(raw.ritualIndex, 0),
    ritualTriggersUsed: Array.isArray(raw.ritualTriggersUsed) ? raw.ritualTriggersUsed.map(x => finite(x, 0)).filter(x => x >= 0 && x <= 1).slice(0, 4) : [],
    damageWindowUntil: int(raw.damageWindowUntil, 0),
    enrage: raw.enrage === true,
    members,
    log: Array.isArray(raw.log) ? raw.log.slice(-12).map(x => String(x).slice(0, 120)) : [],
  };
}

// ---------------------------------------------------------------- projection ----
// Everything the client may see. Positions are the authoritative walk positions plus each player's
// movement intent; the client interpolates between two of these snapshots at 60 fps on its own.
export function raidPublicRun(run, now = Date.now()) {
  if (!run) return null;
  // `serverNow` is the clock the client should compare against, never the run's *identity*. The run's
  // timeline (startedAt/deadlineAt) is fixed when it is created; echoing a later wall clock here made
  // the settlement validator see "the raid clock changed".
  const at = Math.max(run.updatedAt, finite(now, run.updatedAt));
  const identityStartedAt = run.startedAt;
  const identityDeadlineAt = run.deadlineAt;
  const stage = RAID_STAGES[run.stageIndex] || RAID_STAGES[0];
  return {
    id: run.id,
    version: run.version,
    state: run.state,
    partySize: run.partySize,
    stageIndex: run.stageIndex,
    stageKey: run.stageKey,
    stageName: run.stageName,
    stages: RAID_STAGES.map(s => ({ id: s.id, key: s.key, name: s.name, subtitle: s.subtitle })),
    serverNow: at,
    startedAt: identityStartedAt,
    updatedAt: run.updatedAt,
    deadlineAt: identityDeadlineAt,
    stageStartedAt: run.stageStartedAt,
    stageEndsAt: run.stageEndsAt,
    finishedAt: run.finishedAt,
    bossArmor: run.bossArmor,
    portalOpenAt: run.portalOpenAt,
    stageCleared: run.stageCleared,
    enrage: run.enrage,
    damageWindowUntil: run.damageWindowUntil,
    nextMechanicAt: run.nextMechanicAt,
    mechanics: run.mechanics.map(m => ({ ...m })),
    enemies: run.enemies.map(e => ({
      id: e.id,
      kind: e.kind,
      name: e.name,
      spriteId: e.spriteId,
      shape: e.shape,
      magic: !!e.magic,
      ranged: !!e.ranged,
      maxHp: e.maxHp,
      hp: e.hp,
      x: e.x,
      z: e.z,
      required: e.required,
      marked: e.marked,
      dead: e.hp <= 0,
      casting: e.casting ? { ...e.casting } : null,
      label: e.label,
      pack: e.pack,
    })),
    members: run.members.map(m => ({
      id: m.id,
      name: m.name,
      cls: m.profile.cls,
      magic: m.profile.magic,
      sex: m.profile.sex,
      maxHp: m.maxHp,
      hp: m.hp,
      x: m.x,
      z: m.z,
      face: m.face,
      downed: m.downed,
      downUntil: m.downUntil,
      reviveHold: m.reviveHold,
      reviveProgress: m.reviveHold ? clamp(m.reviveHold / RAID_RULES.reviveHoldMs, 0, 1) : 0,
      reviveBy: m.reviveBy,
      targetId: m.targetId,
      dps: m.profile.dps,
      damage: m.damage,
      support: m.support,
      actions: m.actions,
      dodges: m.dodges,
      downs: m.downs,
      nextAutoAt: m.nextAutoAt,
      moveReadyAt: m.lastIntentAt + RAID_RULES.moveMinIntervalMs,
      stage,
    })),
    wipe: run.state === 'failed' ? 'party-down' : '',
    summary: runSummary(run),
  };
}

function runSummary(run) {
  const required = run.enemies.filter(e => e.required);
  return {
    requiredAlive: required.filter(e => e.hp > 0).length,
    requiredTotal: required.length,
    stageAlive: run.enemies.filter(e => e.hp > 0).length,
    stageTotal: run.enemies.length,
    bossHp: run.enemies.find(e => e.kind === 'boss')?.hp ?? 0,
    bossMaxHp: run.enemies.find(e => e.kind === 'boss')?.maxHp ?? 0,
  };
}

// ---------------------------------------------------------------- combat ------
function bossTarget(run) {
  return run.enemies.find(e => e.kind === 'boss' && e.hp > 0) || null;
}

function livingMembers(run) {
  return run.members.filter(m => !m.downed && m.hp > 0);
}

// The enemy a member is fighting: their focused target if it is alive, otherwise the nearest living
// required enemy. Focus is a *target*, not a leash: it never drags the player anywhere.
function focusOf(run, member) {
  const focused = member.targetId ? run.enemies.find(e => e.id === member.targetId && e.hp > 0) : null;
  if (focused) return focused;
  const boss = bossTarget(run);
  if (boss) return boss;
  let best = null, bestD = Infinity;
  for (const enemy of run.enemies) {
    if (enemy.hp <= 0) continue;
    const d = Math.hypot(enemy.x - member.x, enemy.z - member.z);
    if (d < bestD) { best = enemy; bestD = d; }
  }
  return best;
}

// Player reach respects the class: a melee character must close to touching distance, a ranged or
// magic character stops at range. The server only checks that the enemy is within a generous reach of
// where the member actually stands; the client's approach rules decide the rest.
function memberReach(member) {
  const base = member.profile.magic || member.profile.weaponType === 'bow' ? 6.4 : 2.2;
  return base + RAID_RULES.combat.playerReachBonus;
}

function applyEnemyDamage(run, enemy, member, at) {
  const isBoss = enemy.kind === 'boss';
  const ratio = isBoss ? RAID_RULES.combat.bossHitMaxHpRatio : RAID_RULES.combat.enemyHitMaxHpRatio;
  const enraged = run.enrage ? RAID_RULES.enrage.damageScale : 1;
  const raw = Math.max(1, Math.round(member.maxHp * ratio * enraged));
  const dealt = Math.min(member.hp, raw);
  member.hp = clamp(member.hp - raw, 0, member.maxHp);
  if (member.hp <= 0) {
    member.hp = 0;
    member.downed = true;
    member.downUntil = at + RAID_RULES.downBleedMs;
    member.downs++;
    member.reviveHold = 0;
    member.reviveBy = 0;
    run.log.push(`${member.name} was downed by ${enemy.name}.`);
  }
  return dealt;
}

// Enemy auto-attacks. Enemies only strike members inside their reach, so a player who walks away is
// genuinely out of the fight until they come back or are chased.
function tickEnemyAttacks(run, at) {
  const attackers = new Map();   // memberId -> attackers currently on them
  for (const enemy of run.enemies) {
    if (enemy.hp <= 0) continue;
    const reach = enemy.ranged ? RAID_RULES.combat.reachRanged + 1.4 : RAID_RULES.combat.reachMelee;
    if (!enemy.aggroAt) {
      const near = livingMembers(run).some(m => Math.hypot(m.x - enemy.x, m.z - enemy.z) < 9);
      if (near) enemy.aggroAt = at;
    }
    if (!enemy.aggroAt || at < enemy.nextAttackAt) continue;
    const targets = livingMembers(run)
      .filter(m => Math.hypot(m.x - enemy.x, m.z - enemy.z) <= reach)
      .filter(m => (attackers.get(m.id) || 0) < RAID_RULES.combat.maxAttackersPerMember);
    if (!targets.length) { enemy.nextAttackAt = at + 500; continue; }
    targets.sort((a, b) => Math.hypot(a.x - enemy.x, a.z - enemy.z) - Math.hypot(b.x - enemy.x, b.z - enemy.z));
    const target = targets[0];
    attackers.set(target.id, (attackers.get(target.id) || 0) + 1);
    applyEnemyDamage(run, enemy, target, at);
    enemy.nextAttackAt = at + RAID_RULES.combat.enemyAttackMs + (enemy.kind === 'boss' ? 0 : 400);
  }
}

// Slow out-of-mechanic recovery. Applied per advance segment so a long catch-up heals exactly once
// for the time it covers.
function tickRegen(run, seconds) {
  if (!(seconds > 0)) return;
  const heal = RAID_RULES.combat.regenMaxHpPerSecond * seconds;
  for (const member of run.members) {
    if (member.downed || member.hp <= 0) continue;
    member.hp = clamp(member.hp + Math.round(member.maxHp * heal), 0, member.maxHp);
  }
}

function damageEnemy(run, member, enemy, amount) {
  const dealt = Math.min(enemy.hp, Math.max(0, Math.round(amount)));
  enemy.hp = clamp(enemy.hp - dealt, 0, enemy.maxHp);
  member.damage += dealt;
  if (enemy.hp <= 0 && !enemy.deadAt) {
    enemy.deadAt = run.updatedAt;
    run.log.push(`${enemy.name} defeated.`);
  }
  return dealt;
}

// The automatic attack, skill swing and pet hit. They resolve from the member's own cadence, which
// the server owns, so a client that stops talking still fights at the same rate when it next syncs.
function tickMemberCombat(run, at) {
  const windowed = at < run.damageWindowUntil;
  for (const member of run.members) {
    if (member.downed || member.hp <= 0) continue;
    const target = focusOf(run, member);
    if (!target) continue;
    const distance = Math.hypot(target.x - member.x, target.z - member.z);
    if (distance > memberReach(member) + (target.kind === 'boss' ? 4.5 : 1.6)) {
      // Out of reach: the member must walk. No damage is invented from a distance.
      continue;
    }
    if (at >= member.nextAutoAt) {
      const crit = (member.profile.power * 7 + member.id * 13 + Math.floor(at / 1000)) % 100 < RAID_RULES.combat.playerCritChance * 100;
      const base = member.profile.dps * (RAID_RULES.combat.playerAutoAttackMs / 1000);
      const penetration = clamp(finite(member.profile.armorPen, 0), 0, 0.8);
      const mitigation = target.kind === 'boss' || target.kind === 'anchor' ? Math.max(0, run.bossArmor - penetration) : 0;
      let amount = base * (1 - mitigation) * (crit ? RAID_RULES.combat.playerCritMultiplier : 1);
      if (windowed) amount *= RAID_RULES.ritual.damageWindowMultiplier;
      damageEnemy(run, member, target, amount);
      member.nextAutoAt = at + RAID_RULES.combat.playerAutoAttackMs;
    }
    if (at >= member.nextSkillAt && target.hp > 0) {
      const base = member.profile.dps * RAID_RULES.combat.skillMultiplier;
      const penetration = clamp(finite(member.profile.armorPen, 0), 0, 0.8);
      const mitigation = target.kind === 'boss' || target.kind === 'anchor' ? Math.max(0, run.bossArmor - penetration) : 0;
      let amount = base * (1 - mitigation);
      if (windowed) amount *= RAID_RULES.ritual.damageWindowMultiplier;
      damageEnemy(run, member, target, amount);
      member.nextSkillAt = at + RAID_RULES.combat.skillEveryMs;
      member.actions++;
    }
    if (at >= member.nextPetAt && target.hp > 0) {
      damageEnemy(run, member, target, member.profile.dps * RAID_RULES.combat.petMultiplier);
      member.nextPetAt = at + RAID_RULES.combat.petEveryMs;
    }
  }
}

// ---------------------------------------------------------------- mechanics ---
function scheduleNextMechanic(run, at) {
  const gap = run.enrage
    ? { min: RAID_RULES.mechanicGapMs.min * RAID_RULES.enrage.cooldownScale, max: RAID_RULES.mechanicGapMs.max * RAID_RULES.enrage.cooldownScale }
    : RAID_RULES.mechanicGapMs;
  const rng = mulberry32((run.seed ^ (run.ritualIndex * 7919) ^ Math.floor(at)) >>> 0);
  run.nextMechanicAt = at + Math.round(gap.min + rng() * (gap.max - gap.min));
}

function mechanicActive(run) {
  return run.mechanics.find(m => m.startsAt > 0 && !m.resolvedAt && m.endsAt > 0) || null;
}

// A safe ward must be reachable on foot: it is placed inside the stage bounds and at most 11 units
// from the boss centre, so no class-specific movement skill is needed.
function placeSafeWard(run, rng) {
  const b = stageBounds(run.stageKey);
  const boss = bossTarget(run);
  const cx = boss ? boss.x : 0, cz = boss ? boss.z : 0;
  const a = rng() * Math.PI * 2, r = 5.4 + rng() * 4.6;
  const p = clampPoint(run.stageKey, cx + Math.cos(a) * r, cz + Math.sin(a) * r);
  return { safeX: p.x, safeZ: p.z, safeRadius: RAID_RULES.cataclysm.safeRadius, bounds: b };
}

// The cone/strip is locked when it is created: `angle` never changes while the telegraph is up, so a
// player can see where it will land and walk out.
function spawnMechanic(run, at) {
  const boss = bossTarget(run);
  const stage = RAID_STAGES[run.stageIndex];
  if (!stage) return false;
  const rng = mulberry32((run.seed * 31 + run.mechanics.length * 977 + Math.floor(at)) >>> 0);
  const active = mechanicActive(run);
  if (active) return false;

  if (stage.id === 4) {
    // Sanctuary: soul cleave -> cataclysm -> soul cleave -> cataclysm, with the ritual on HP triggers.
    const since = run.mechanics.filter(m => m.kind !== 'ritual').length;
    const rotating = since % 2 === 0 ? 'soul-cleave' : 'astral-cataclysm';
    // A ritual that is already casting owns the schedule; do not double-book the boss.
    if (run.enemies.some(e => e.casting && e.casting.mechanic === 'ritual')) return false;
    const kind = rotating;
    const startsAt = at;
    if (kind === 'soul-cleave') {
      // Aim at the party centroid at creation time, then lock it.
      const living = livingMembers(run);
      const cx = living.length ? living.reduce((s, m) => s + m.x, 0) / living.length : 0;
      const cz = living.length ? living.reduce((s, m) => s + m.z, 0) / living.length : 0;
      const ox = boss ? boss.x : 0, oz = boss ? boss.z : 0;
      run.mechanics.push({
        kind: 'soul-cleave',
        id: `sc:${run.id}:${run.mechanics.length}`,
        startsAt,
        endsAt: startsAt + RAID_RULES.soulCleave.tellMs,
        resolvedAt: 0,
        outcome: '',
        originX: ox, originZ: oz,
        angle: Math.atan2(cz - oz, cx - ox),
        length: RAID_RULES.soulCleave.length,
        halfWidth: RAID_RULES.soulCleave.halfWidth,
      });
    } else {
      const ward = placeSafeWard(run, rng);
      run.mechanics.push({
        kind: 'astral-cataclysm',
        id: `ac:${run.id}:${run.mechanics.length}`,
        startsAt,
        endsAt: startsAt + RAID_RULES.cataclysm.tellMs,
        resolvedAt: 0,
        outcome: '',
        safeX: ward.safeX, safeZ: ward.safeZ, safeRadius: ward.safeRadius,
      });
    }
    run.mechanics = run.mechanics.slice(-3);
    scheduleNextMechanic(run, at + RAID_RULES.soulCleave.tellMs);
    return true;
  }

  // Stages 1-3: one generous, clearly telegraphed ground attack each. It never overlaps another.
  const b = stageBounds(run.stageKey);
  const living = livingMembers(run);
  const cx = living.length ? living.reduce((s, m) => s + m.x, 0) / living.length : 0;
  const cz = living.length ? living.reduce((s, m) => s + m.z, 0) / living.length : 0;
  const halfWidth = stage.id === 1 ? 2.0 : 2.4;
  const startsAt = at;
  run.mechanics.push({
    kind: 'sweep',
    id: `sw:${run.id}:${run.mechanics.length}`,
    startsAt,
    endsAt: startsAt + RAID_RULES.soulCleave.tellMs,
    resolvedAt: 0,
    outcome: '',
    // A strip through the party's current centre, along the map's z axis, clamped to the bounds.
    x: clamp(cx, b.minX + halfWidth, b.maxX - halfWidth),
    halfWidth,
    axis: 'z',
  });
  run.mechanics = run.mechanics.slice(-3);
  scheduleNextMechanic(run, at + RAID_RULES.soulCleave.tellMs);
  return true;
}

// Ritual of Ruin, triggered by the boss's HP fraction. Two sources channel; killing both interrupts
// it and opens a damage window. If the channel completes, the whole arena takes a heavy hit.
function checkRitualTriggers(run, at) {
  if (run.stageIndex !== RAID_STAGES.length - 1) return;
  const boss = bossTarget(run);
  if (!boss) return;
  const fraction = boss.hp / Math.max(1, boss.maxHp);
  for (const trigger of RAID_RULES.ritual.triggers) {
    if (run.ritualTriggersUsed.includes(trigger)) continue;
    if (fraction > trigger) continue;
    run.ritualTriggersUsed.push(trigger);
    run.ritualIndex++;
    const sources = ritualSources(run, at);
    run.enemies.push(...sources);
    run.enemies.forEach(e => { if (e.kind === 'boss') e.casting = { mechanic: 'ritual', endsAt: at + RAID_RULES.ritual.channelMs, succeedAt: 0, failedAt: 0 }; });
    run.mechanics.push({
      kind: 'ritual',
      id: `rt:${run.id}:${run.ritualIndex}`,
      startsAt: at,
      endsAt: at + RAID_RULES.ritual.channelMs,
      resolvedAt: 0,
      outcome: '',
      sourceIds: sources.map(s => s.id),
    });
    run.log.push('Thanatos begins the Ritual of Ruin. Destroy the ritual sources.');
    return;
  }
}

function resolveMechanic(run, mechanic, at) {
  if (mechanic.resolvedAt) return false;
  mechanic.resolvedAt = at;
  if (mechanic.kind === 'sweep') {
    let hits = 0;
    for (const member of run.members) {
      if (member.downed) continue;
      if (Math.abs(member.x - mechanic.x) <= mechanic.halfWidth) {
        const raw = Math.round(member.maxHp * 0.18);
        member.hp = clamp(member.hp - raw, 0, member.maxHp);
        hits++;
        if (member.hp <= 0) {
          member.downed = true; member.downUntil = at + RAID_RULES.downBleedMs; member.downs++; member.reviveHold = 0;
        }
      } else member.dodges++;
    }
    mechanic.outcome = hits ? 'hit' : 'dodged';
    return true;
  }
  if (mechanic.kind === 'soul-cleave') {
    let hits = 0;
    for (const member of run.members) {
      if (member.downed) continue;
      // Point-in-cone test against the locked angle.
      const dx = member.x - mechanic.originX, dz = member.z - mechanic.originZ;
      const along = dx * Math.cos(mechanic.angle) + dz * Math.sin(mechanic.angle);
      const across = Math.abs(-dx * Math.sin(mechanic.angle) + dz * Math.cos(mechanic.angle));
      const inside = along >= 0 && along <= mechanic.length && across <= mechanic.halfWidth + Math.max(0, along / mechanic.length) * 1.2;
      if (inside) {
        const raw = Math.round(member.maxHp * RAID_RULES.soulCleave.damageMaxHpRatio);
        member.hp = clamp(member.hp - raw, 0, member.maxHp);
        hits++;
        if (member.hp <= 0) { member.downed = true; member.downUntil = at + RAID_RULES.downBleedMs; member.downs++; member.reviveHold = 0; }
      } else member.dodges++;
    }
    mechanic.outcome = hits ? 'hit' : 'dodged';
    return true;
  }
  if (mechanic.kind === 'astral-cataclysm') {
    let hits = 0;
    for (const member of run.members) {
      if (member.downed) continue;
      const safe = Math.hypot(member.x - mechanic.safeX, member.z - mechanic.safeZ) <= mechanic.safeRadius;
      if (safe) { member.dodges++; continue; }
      const raw = Math.round(member.maxHp * RAID_RULES.cataclysm.damageMaxHpRatio);
      member.hp = clamp(member.hp - raw, 0, member.maxHp);
      hits++;
      if (member.hp <= 0) { member.downed = true; member.downUntil = at + RAID_RULES.downBleedMs; member.downs++; member.reviveHold = 0; }
    }
    mechanic.outcome = hits ? 'hit' : 'warded';
    if (hits) run.log.push('The Astral Cataclysm caught the party outside the ward.');
    return true;
  }
  if (mechanic.kind === 'ritual') {
    const alive = mechanic.sourceIds.filter(id => run.enemies.some(e => e.id === id && e.hp > 0));
    const boss = bossTarget(run);
    if (boss) boss.casting = null;
    for (const enemy of run.enemies) if (enemy.ritual) enemy.hp = 0;
    if (alive.length === 0) {
      mechanic.outcome = 'interrupted';
      run.damageWindowUntil = at + RAID_RULES.ritual.successWindowMs;
      run.log.push('The ritual is interrupted. Thanatos is exposed.');
    } else {
      mechanic.outcome = 'completed';
      for (const member of run.members) {
        if (member.downed) continue;
        const raw = Math.round(member.maxHp * RAID_RULES.ritual.failDamageMaxHpRatio);
        member.hp = clamp(member.hp - raw, 0, member.maxHp);
        if (member.hp <= 0) { member.downed = true; member.downUntil = at + RAID_RULES.downBleedMs; member.downs++; member.reviveHold = 0; }
      }
      run.log.push('The Ritual of Ruin completes. The party is scorched.');
    }
    scheduleNextMechanic(run, at + 4_000);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- stage flow ---
function stageComplete(run) {
  return run.enemies.every(e => !e.required || e.hp <= 0);
}

function advanceStage(run, at) {
  const index = run.stageIndex + 1;
  if (index >= RAID_STAGES.length) {
    run.state = 'cleared';
    run.finishedAt = at;
    run.stageCleared = true;
    run.log.push('Thanatos falls. The sanctuary is silent.');
    return true;
  }
  const stage = RAID_STAGES[index];
  run.stageIndex = index;
  run.stageKey = stage.key;
  run.stageName = stage.name;
  run.stageStartedAt = at;
  run.stageEndsAt = at + raidStageSeconds(stage.key) * 1000;
  const boss = stage.key === 'sanctuary';
  const dps = run.partyDps || RAID_RULES.dpsMin;
  const total = stageEnemyHp(stage.id, dps, boss ? { boss: true, seconds: 240 } : {});
  const fresh = stageEnemies(stage, dps, boss ? { boss: true, seconds: 240 } : {});
  // Re-scale the stage's enemies to that stage's own budget, then place the party at the entrance.
  const scale = total / Math.max(1, fresh.reduce((s, e) => s + e.maxHp, 0));
  run.enemies = fresh.map(e => ({ ...e, maxHp: Math.max(1, Math.round(e.maxHp * scale)), hp: Math.max(1, Math.round(e.maxHp * scale)) }));
  run.stageCleared = false;
  run.portalOpenAt = 0;
  run.portalRequestedAt = 0;
  run.mechanics = [];
  run.ritualIndex = 0;
  run.damageWindowUntil = 0;
  run.enrage = false;
  const b = stageBounds(stage.key);
  run.members.forEach((m, i) => {
    m.x = clamp((i - (run.members.length - 1) / 2) * 2.2, b.minX + 1, b.maxX - 1);
    m.z = b.maxZ - 2;
    m.reviveHold = 0;
    m.targetId = '';
    m.nextAutoAt = at;
    m.nextSkillAt = at + RAID_RULES.combat.skillEveryMs;
    m.nextPetAt = at + 800;
    if (m.downed) { m.downed = false; m.hp = Math.round(m.maxHp * 0.35); }
    // A short rest at the portal: the party steps through with part of their health back, so seven
    // minutes of attrition cannot end a solo run before the boss is even reached.
    else m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * RAID_RULES.combat.restHealRatio));
  });
  run.nextMechanicAt = at + (stage.id === 4 ? 6_000 : 4_500);
  run.log.push(`Entered ${stage.name}.`);
  return true;
}

// ---------------------------------------------------------------- safety -------
// Is a point inside a live mechanic's footprint? Used only to keep the automatic chase from walking a
// player into a telegraph. The client draws the same shapes from the same numbers.
function pointInSweep(m, x) {
  return Math.abs(x - m.x) <= m.halfWidth;
}
function pointInCleave(m, x, z) {
  const dx = x - m.originX, dz = z - m.originZ;
  const along = dx * Math.cos(m.angle) + dz * Math.sin(m.angle);
  const across = Math.abs(-dx * Math.sin(m.angle) + dz * Math.cos(m.angle));
  return along >= 0 && along <= m.length && across <= m.halfWidth + Math.max(0, along / m.length) * 1.2;
}
// How deep a point sits inside a live telegraph, in world units. 0 means safe. Depth (rather than a
// boolean) is what keeps the automatic chase honest: a step may never make things worse, so a member
// outside a telegraph cannot be dragged in, and a member caught inside one can always walk out.
function dangerDepth(run, x, z) {
  let depth = 0;
  for (const m of run.mechanics) {
    if (m.resolvedAt || !m.endsAt) continue;
    if (m.kind === 'sweep') depth += Math.max(0, (m.halfWidth || 0) - Math.abs(x - m.x));
    else if (m.kind === 'soul-cleave') {
      if (pointInCleave(m, x, z)) depth += m.halfWidth + 0.01;
    } else if (m.kind === 'astral-cataclysm') {
      depth += Math.max(0, Math.hypot(x - m.safeX, z - m.safeZ) - m.safeRadius);
    }
  }
  return depth;
}
function pointIsDangerous(run, x, z) {
  return dangerDepth(run, x, z) > 0;
}

// The automatic chase: one step toward the focus target for a member with no manual destination.
// It stops at the member's own reach, refuses a step that would enter a live telegraph, and never
// runs for a downed member.
function autoApproach(run, member, span) {
  if (!RAID_RULES.autoApproach || member.downed || member.hp <= 0) return;
  const target = focusOf(run, member);
  if (!target) return;
  const reach = memberReach(member) * 0.86;
  // Steps are chunked. One long step could otherwise hop clean over a 5-unit-wide telegraph, and the
  // player would be hit by a hazard the engine never saw them enter.
  const chunks = Math.max(1, Math.ceil(span / WALK_CHUNK_MS));
  const perChunk = span / chunks;
  for (let i = 0; i < chunks; i++) {
    const dx = target.x - member.x, dz = target.z - member.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= reach) return;
    const step = Math.min(dist - reach, RAID_RULES.walkSpeed * (perChunk / 1000));
    const nx = clamp(member.x + (dx / dist) * step, -60, 60);
    const nz = clamp(member.z + (dz / dist) * step, -60, 60);
    if (dangerDepth(run, nx, nz) > dangerDepth(run, member.x, member.z)) return;
    member.x = nx;
    member.z = nz;
    member.face = Math.atan2(dz, dx);
  }
}

// ---------------------------------------------------------------- advance -----
// Walk every member to their intent, run the automatic combat, resolve due mechanics and advance a
// cleared stage. `advanceRaidRun` is the only place time moves forward, and it never moves a
// scheduled timestamp.
export function advanceRaidRun(run, now = run.updatedAt) {
  if (!run || run.state !== 'active') return false;
  const target = clamp(int(now, run.updatedAt), run.updatedAt, run.deadlineAt);
  let at = run.updatedAt;
  let changed = false;
  let guard = 0;
  const walk = (to) => {
    const span = Math.max(0, to - at);
    for (const member of run.members) {
      if (member.downed) continue;
      // A manual destination wins until it is reached or its hold expires; after that the member
      // returns to the automatic chase.
      const manual = !member.auto && at < member.manualUntil;
      if (manual) {
        const dx = member.intentX - member.x;
        const dz = member.intentZ - member.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.02) {
          const step = Math.min(dist, RAID_RULES.walkSpeed * (span / 1000));
          member.x = clamp(member.x + (dx / dist) * step, -60, 60);
          member.z = clamp(member.z + (dz / dist) * step, -60, 60);
          member.face = Math.atan2(dz, dx);
          if (step >= dist) member.auto = true;
        } else member.auto = true;
      } else {
        member.auto = true;
        autoApproach(run, member, span);
      }
    }
    tickRegen(run, span / 1000);
    at = to;
  };
  while (at < target && guard++ < RAID_RULES.maxCatchupEvents) {
    // 1. the next scheduled thing: a mechanic boundary, a stage timeout, or the run deadline
    const pending = mechanicActive(run);
    // The event queue. A member's own attack/skill/pet clock is in here too: combat must resolve at
    // its real cadence, not only when a mechanic boundary happens to arrive.
    const nextMemberEvent = run.members.reduce((best, m) => {
      if (m.downed || m.hp <= 0) return best;
      return Math.min(best, Math.max(m.nextAutoAt, m.nextSkillAt, m.nextPetAt) === m.nextAutoAt ? m.nextAutoAt : Math.min(m.nextAutoAt, m.nextSkillAt, m.nextPetAt));
    }, Infinity);
    const candidates = [
      pending ? pending.endsAt : Infinity,
      run.nextMechanicAt,
      nextMemberEvent,
      run.stageCleared ? run.portalOpenAt + PORTAL_AUTO_SECONDS * 1000 : Infinity,
      run.stageEndsAt,
      target,
    ];
    const next = Math.min(...candidates.filter(v => v > at));
    if (!Number.isFinite(next)) break;
    walk(next);
    changed = true;
    // 2. Resolve a mechanic at the exact instant its warning ends, then continue from that instant.
    //    A player standing in a telegraph must have the telegraphed time to walk out: if the walk to
    //    `next` were committed first, an auto-approaching member could be dragged in and hit by a
    //    hazard that only resolved because they were moved.
    if (pending && pending.endsAt <= at && !pending.resolvedAt) {
      resolveMechanic(run, pending, pending.endsAt);
      continue;
    }
    // An interrupted ritual resolves immediately: an early success must not be followed by waiting.
    for (const mechanic of [...run.mechanics]) {
      if (mechanic.resolvedAt || mechanic.kind !== 'ritual') continue;
      const alive = mechanic.sourceIds.filter(id => run.enemies.some(e => e.id === id && e.hp > 0));
      if (!alive.length) resolveMechanic(run, mechanic, at);
    }
    tickMemberCombat(run, at);
    tickEnemyAttacks(run, at);
    checkRitualTriggers(run, at);
    if (run.stageIndex === RAID_STAGES.length - 1) {
      const boss = bossTarget(run);
      if (boss && !run.enrage && boss.hp / Math.max(1, boss.maxHp) <= RAID_RULES.enrageHpFraction) {
        run.enrage = true;
        run.log.push('Thanatos is enraged.');
      }
      if (at >= run.nextMechanicAt && !run.stageCleared) spawnMechanic(run, at);
    } else if (at >= run.nextMechanicAt && livingMembers(run).length && !run.stageCleared) {
      spawnMechanic(run, at);
    }
    // 3. stage completion, wipe and the run deadline. Clearing a stage opens its portal; the party
    //    walks through it (an `interact`) so the transition is visible. An idle party is carried
    //    through after portalAutoSeconds, so nobody can be stranded by a disconnected leader.
    if (!run.stageCleared && stageComplete(run)) {
      run.stageCleared = true;
      run.portalOpenAt = at;
      run.log.push(`${run.stageName} cleared. The exit portal is open.`);
      changed = true;
      if (run.stageIndex >= RAID_STAGES.length - 1) {
        run.state = 'cleared';
        run.finishedAt = at;
        break;
      }
    }
    if (run.state === 'active' && run.stageCleared && (run.portalRequestedAt > 0 || at >= run.portalOpenAt + PORTAL_AUTO_SECONDS * 1000)) {
      advanceStage(run, at);
      changed = true;
    }
    if (!livingMembers(run).length) {
      run.state = 'failed';
      run.finishedAt = at;
      changed = true;
      break;
    }
    if (at >= run.stageEndsAt && run.stageIndex < RAID_STAGES.length - 1) {
      run.state = 'failed';
      run.finishedAt = at;
      run.log.push('The stage timer expired.');
      changed = true;
      break;
    }
    if (at >= run.deadlineAt) {
      run.state = 'failed';
      run.finishedAt = run.deadlineAt;
      changed = true;
      break;
    }
  }
  run.updatedAt = Math.max(run.updatedAt, target);
  return changed;
}

// ---------------------------------------------------------------- actions -----
function receiptFor(member, actionId) {
  return member.receipts.find(r => r.id === actionId) || null;
}

function recordReceipt(member, record) {
  member.receipts.push(record);
  if (member.receipts.length > RAID_RULES.maxActionReceipts) {
    member.receipts.splice(0, member.receipts.length - RAID_RULES.maxActionReceipts);
  }
}

// Apply one intent or paid action. `opts.at` is the server timestamp the caller read; a stale value
// is clamped to `updatedAt` so a client clock can never rewind the run.
export function applyRaidAction(run, userId, action, opts = {}) {
  if (!run) return reject('That raid no longer exists.', null, 404);
  const actionId = typeof opts.actionId === 'string' ? opts.actionId : '';
  if (!RAID_ACTION_ID_RE.test(actionId)) return reject('A valid action id is required.', run, 400);
  const member = run.members.find(m => m.id === int(userId, 0));
  if (!member) return reject('You are not in that raid.', run, 403);
  const at = clamp(int(opts.at, run.updatedAt), run.updatedAt, run.deadlineAt);
  const advanced = advanceRaidRun(run, at);
  const receipt = receiptFor(member, actionId);
  if (receipt) {
    return { ok: true, duplicate: true, action: receipt.action, result: { ...receipt }, advanced, run };
  }
  if (!ACTIONS.has(action)) return reject('Unknown raid action.', run, 400);
  if (run.state !== 'active') return reject('This raid has ended.', run, 409);

  if (action === 'move') {
    if (at - member.lastIntentAt < RAID_RULES.moveMinIntervalMs) return reject('You are already moving.', run, 429);
    // A destination, not a teleport: the member keeps standing where they are and the run's own clock
    // walks them to `x/z` at `walkSpeed`. This is what makes a telegraph dodgeable and a long walk
    // cost real seconds.
    const p = clampPoint(run.stageKey, opts.x, opts.z);
    member.intentX = p.x;
    member.intentZ = p.z;
    member.auto = false;
    member.manualUntil = at + RAID_RULES.manualHoldMs;
    member.lastIntentAt = at;
    return { ok: true, duplicate: false, action, result: { id: actionId, action, at, x: p.x, z: p.z }, advanced, run };
  }

  if (action === 'focus') {
    // A focus is a target choice. It is free and never moves the player.
    const targetId = typeof opts.targetId === 'string' ? opts.targetId.slice(0, 40) : '';
    const enemy = run.enemies.find(e => e.id === targetId);
    if (targetId && !enemy) return reject('That enemy is not in this stage.', run, 404);
    member.targetId = targetId;
    return { ok: true, duplicate: false, action, result: { id: actionId, action, at, targetId }, advanced, run };
  }

  if (member.downed || member.hp <= 0) return reject('You are down. A living teammate must revive you.', run, 409);

  if (action === 'interact') {
    // The one interaction a stage asks for: holding the portal/interrupt. The server checks that the
    // member stands at the thing they are interacting with.
    const kind = typeof opts.kind === 'string' ? opts.kind : '';
    const thing = sanitizeInteractTarget(run, opts, at);
    if (!thing.ok) return reject(thing.error, run, 409);
    thing.apply();
    member.actions++;
    member.lastPaidAt = at;
    recordReceipt(member, { id: actionId, action, at, damage: 0, healed: 0 });
    return { ok: true, duplicate: false, action, result: { id: actionId, action, at, kind, targetId: thing.id }, advanced, run };
  }

  if (action === 'revive') {
    const target = run.members.find(m => m.id === int(opts.targetId, 0));
    if (!target || target.id === member.id) return reject('Choose a downed teammate.', run, 400);
    if (!target.downed || target.hp > 0) return reject('That teammate is not down.', run, 409);
    if (Math.hypot(target.x - member.x, target.z - member.z) > RAID_RULES.reviveRange) return reject('Stand next to your teammate to revive them.', run, 409);
    if (target.reviveBy !== member.id) {
      target.reviveBy = member.id;
      target.reviveHold = 0;
    }
    target.reviveHold += RAID_RULES.reviveHoldMs / 3;
    member.actions++;
    member.lastPaidAt = at;
    let healed = 0;
    if (target.reviveHold >= RAID_RULES.reviveHoldMs) {
      target.downed = false;
      target.hp = Math.max(1, Math.round(target.maxHp * RAID_RULES.reviveHpRatio));
      healed = target.hp;
      target.reviveHold = 0;
      target.reviveBy = 0;
      target.nextAutoAt = at + 400;
      target.nextSkillAt = at + 1_600;
      healed = target.hp;
      member.support += healed;
      run.log.push(`${member.name} revived ${target.name}.`);
    }
    recordReceipt(member, { id: actionId, action, at, damage: 0, healed });
    return { ok: true, duplicate: false, action, result: { id: actionId, action, at, targetId: target.id, healed, progress: clamp(target.reviveHold / RAID_RULES.reviveHoldMs, 0, 1) }, advanced, run };
  }

  if (action === 'dash') {
    // A short, cooldown-limited reposition toward a point. It is NOT required by any mechanic; it
    // only exists so a player can react to a telegraph without waiting for the walk.
    if (at - member.lastPaidAt < 900) return reject('Dash is still recovering.', run, 429);
    const p = clampPoint(run.stageKey, opts.x, opts.z);
    const dist = Math.hypot(p.x - member.x, p.z - member.z);
    if (dist <= 0.01) return reject('Choose a direction to dash.', run, 400);
    const capped = Math.min(dist, 4.2);
    member.x = clamp(member.x + (p.x - member.x) / dist * capped, -60, 60);
    member.z = clamp(member.z + (p.z - member.z) / dist * capped, -60, 60);
    member.intentX = member.x; member.intentZ = member.z;
    member.auto = false;
    member.manualUntil = at + RAID_RULES.manualHoldMs;
    member.actions++;
    member.lastPaidAt = at;
    recordReceipt(member, { id: actionId, action, at, damage: 0, healed: 0 });
    return { ok: true, duplicate: false, action, result: { id: actionId, action, at, x: member.x, z: member.z }, advanced, run };
  }

  return reject('Unknown raid action.', run, 400);
}

function sanitizeInteractTarget(run, opts, at) {
  const targetId = typeof opts.targetId === 'string' ? opts.targetId : '';
  if (targetId === 'portal' || targetId === '') {
    if (!run.stageCleared) return { ok: false, error: 'Clear the stage before entering the portal.' };
    return { ok: true, id: 'portal', apply: () => { run.portalRequestedAt = at; } };
  }
  const enemy = run.enemies.find(e => e.id === targetId && e.hp > 0);
  if (!enemy) return { ok: false, error: 'That target is already gone.' };
  return { ok: true, id: enemy.id, apply: () => {} };
}

export { raidMeaningful, rollRaidClear, rollPityChest, rollFracturedChest };
export const RAID_INTENTS = Object.freeze([...INTENTS]);
export const RAID_PAID_ACTIONS = Object.freeze([...PAID_ACTIONS]);
