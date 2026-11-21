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
  RAID_RULES, RAID_RULES_VERSION, RAID_STAGES, raidPartySize, raidStage, stageEnemyHp, rollRaidClear,
  rollPityChest, rollFracturedChest, raidMeaningful, raidRunSeconds, raidStageSeconds,
} from './raid-rules.js';
export { RAID_RULES_VERSION };
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
// The arena these numbers describe is the Astral causeway: a long, wide bridge between islands. The
// first pass used a narrow strip (21 wide by 31 deep), which framed the fight as a corridor - the
// camera had to sit close, the packs filled the screen, and there was nowhere to walk. Each stage is
// now a hall worth the name, and STAGE_BOUNDS is the single source of truth: the engine clamps
// movement to it, and assets/astral-raid-scenes.js draws exactly this footprint.
// The fight happens on ONE span of the shipped Astral route, and the route says how much room that
// is: `arena {halfWidth: 13, z0: focus-20, z1: focus+20}` around each span's focus point. These are
// that declaration, in local coordinates (centre at z = 0), so the deck the player stands on and the
// rectangle the engine clamps to are finally the same shape.
//
// They were previously invented - 38 to 48 units wide, 51 deep - while the map's deck was 26 wide
// and 40 deep. Mobs spawned off the platform because the engine was told there was more floor than
// the renderer had drawn.
export const STAGE_BOUNDS = Object.freeze({
  approach: Object.freeze({ minX: -13, maxX: 13, minZ: -20, maxZ: 20 }),
  arcade: Object.freeze({ minX: -13, maxX: 13, minZ: -20, maxZ: 20 }),
  observatory: Object.freeze({ minX: -13, maxX: 13, minZ: -20, maxZ: 20 }),
  sanctuary: Object.freeze({ minX: -13, maxX: 13, minZ: -20, maxZ: 20 }),
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
// The simulation grid. Every movement step, regen tick and attack step is measured on this grid, and
// never on the length of the caller's read. Without it the run's outcome depended on how often the
// room happened to be polled: positions were integrated over 250 ms spans for one client and 2 s
// spans for another, which shifted a telegraphed hit into a dodge and made settlement differ between
// two identical parties. `advanceRaidRun` therefore slices the requested window at grid boundaries and
// only ever integrates whole grid cells, so a 250 ms poll, a 2 s poll and one 30 s catch-up read all
// produce the identical timeline.
// The simulation cell. Every read resolves whole cells of this size, never a partial one, which is what
// makes the run a function of the clock rather than of how often a client happened to poll. Exported
// because the callers that own recovery (the browser's solo loop, the co-op sweep) have to reason about
// cell boundaries themselves: a read that does not cross a cell boundary is allowed to resolve nothing.
export const SIM_TICK_MS = 100;

function sanitizeReceipt(raw) {
  if (!isObj(raw) || typeof raw.id !== 'string' || !RAID_ACTION_ID_RE.test(raw.id)) return null;
  return {
    id: raw.id,
    action: ACTIONS.has(raw.action) ? raw.action : 'interact',
    at: int(raw.at, 0),
    regenCarry: clamp(finite(raw.regenCarry, 0), 0, 1),
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
    regenCarry: clamp(finite(raw.regenCarry, 0), 0, 1),
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
    Object.freeze({ id: 'b-anchor-l', kind: 'anchor', name: 'Rift Anchor', spriteId: 1708, shape: 'demon', x: -9.2, z: -15.4, pack: 1, label: 'Shield anchor' }),
    Object.freeze({ id: 'b-anchor-r', kind: 'anchor', name: 'Rift Anchor', spriteId: 1708, shape: 'demon', x: 9.2, z: -15.4, pack: 1, label: 'Shield anchor' }),
    Object.freeze({ id: 'b1-g6', name: 'Death Whisperer', spriteId: 1706, shape: 'demon', x: -2.4, z: -18.2, pack: 2 }),
    Object.freeze({ id: 'b1-g7', name: 'Agony Demon', spriteId: 1707, shape: 'demon', x: 2.6, z: -18.4, pack: 2 }),
  ]),
  observatory: Object.freeze([
    Object.freeze({ id: 'c-ritual-1', kind: 'ritual-source', name: 'Ritual Adept', spriteId: 1639, shape: 'demon', x: -10.8, z: -9.6, pack: 0, label: 'Ritual source' }),
    Object.freeze({ id: 'c-ritual-2', kind: 'ritual-source', name: 'Ritual Adept', spriteId: 1637, shape: 'demon', x: 10.4, z: -10.2, pack: 0, label: 'Ritual source' }),
    Object.freeze({ id: 'c-wave-1a', name: 'Astral Sentry', spriteId: 1836, shape: 'demon', x: -3.4, z: -9.8, pack: 1 }),
    Object.freeze({ id: 'c-wave-1b', name: 'Astral Sentry', spriteId: 1837, shape: 'demon', x: 3.6, z: -9.6, pack: 1 }),
    Object.freeze({ id: 'c-wave-2a', name: 'Tower Watcher', spriteId: 1700, shape: 'demon', x: 0, z: -2.4, pack: 2, ranged: true }),
    Object.freeze({ id: 'c-wave-2b', name: 'Death Whisperer', spriteId: 1706, shape: 'demon', x: -8.2, z: 2.6, pack: 2 }),
    Object.freeze({ id: 'c-wave-2c', name: 'Despair Phantom', spriteId: 1705, shape: 'demon', x: 8.2, z: 2.4, pack: 2 }),
  ]),
  sanctuary: Object.freeze([
    Object.freeze({ id: 'thanatos', kind: 'boss', name: 'Thanatos', spriteId: 1708, shape: 'demon', x: 0, z: -14.2, magic: true, label: 'The named boss' }),
  ]),
});

// Where a batch may stand. The named layout above is the *roster* (what, how many, which pack); the
// positions are re-rolled per run from the run's own seed, so two runs of the same stage are not the
// same picture and a player cannot pre-learn one safe corner. Bosses, anchors and ritual sources keep
// their authored posts: they are stage furniture with mechanics attached, not filler.
const SCATTER_MARGIN = 2.2;
function scatterSpots(stageKey, layout, seed) {
  const b = stageBounds(stageKey);
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  // Batches own a band of the hall so a pack reads as a pack: pack 0 in the near third, pack 1 in the
  // middle, pack 2 in the far third. Within its band each spawn lands anywhere, which is enough
  // variety without ever spawning a mob on top of the entrance.
  const packs = [...new Set(layout.map(e => (e.pack || 0)))].sort((a, b2) => a - b2);
  const zTop = b.minZ + SCATTER_MARGIN, zBottom = b.maxZ - SCATTER_MARGIN - 4;
  const bandCount = Math.max(1, packs.length);
  const bandSize = (zBottom - zTop) / bandCount;
  const used = [];
  return layout.map(e => {
    if (e.kind === 'boss' || e.kind === 'anchor' || e.kind === 'ritual-source') return { x: e.x, z: e.z };
    const band = Math.max(0, packs.indexOf(e.pack || 0));
    const zMin = zTop + band * bandSize + 1.2;
    const zMax = zTop + (band + 1) * bandSize - 1.2;
    // Rejection-sample a few times so two mobs of a batch do not stack on one point.
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = b.minX + SCATTER_MARGIN + rng() * (b.maxX - b.minX - SCATTER_MARGIN * 2);
      const z = zMin + rng() * Math.max(0.5, zMax - zMin);
      if (used.every(u => Math.hypot(u.x - x, u.z - z) > 2.6)) { used.push({ x, z }); return { x, z }; }
    }
    const x = b.minX + SCATTER_MARGIN + rng() * (b.maxX - b.minX - SCATTER_MARGIN * 2);
    const z = zMin + rng() * Math.max(0.5, zMax - zMin);
    used.push({ x, z });
    return { x, z };
  });
}

function stageEnemies(stage, partyDps, options = {}) {
  const layout = ENEMY_LAYOUT[stage.key] || [];
  const total = stageEnemyHp(stage.id, partyDps, options);
  const weights = layout.map(e => (e.kind === 'boss' ? 0 : e.kind === 'anchor' || e.kind === 'ritual-source' ? 1.35 : 1));
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  const spots = options.scatter === false ? null : scatterSpots(stage.key, layout, int(options.seed, 1) || 1);
  return layout.map((e, i) => {
    const share = e.kind === 'boss' ? 1 : weights[i] / weightSum;
    const maxHp = Math.max(1, Math.round(total * share));
    const spot = spots ? spots[i] : { x: e.x, z: e.z };
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
      x: spot.x, z: spot.z,
      homeX: spot.x, homeZ: spot.z,
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
  const enemies = stageEnemies(stage, partyDps, { seed });
  const entrance = stageBounds(stage.key);
  party.forEach((m, i) => {
    m.x = clamp((i - (party.length - 1) / 2) * 2.2, entrance.minX + 1, entrance.maxX - 1);
    m.z = entrance.maxZ - 2;
    m.intentX = m.x;
    m.intentZ = m.z;
    // The party enters at the entrance, out of range of the pack, so the first swing cannot be owed from
    // the spawn point. It is owed `openArmMs` after the stage clock starts: that instant is the same for
    // every read cadence (it is anchored to the grid, not to the read) and late enough that the member has
    // walked into reach, so the opening swings no longer depend on the polling rate.
    m.nextAutoAt = gridAlign(now) + RAID_RULES.combat.openArmMs;
    m.nextSkillAt = gridAlign(now) + RAID_RULES.combat.openArmMs + RAID_RULES.combat.skillEveryMs;
    m.nextPetAt = gridAlign(now) + RAID_RULES.combat.openArmMs + SIM_TICK_MS;
    m.regenCarry = 0;
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

// ---------------------------------------------------------------- sim grid -----
// Absolute grid boundaries, so the grid is a property of the timeline and not of where a read
// happens to start. `nextGridTime` is always strictly after `at`.
function nextGridTime(at) {
  return (Math.floor(at / SIM_TICK_MS) + 1) * SIM_TICK_MS;
}

// Every member cadence is kept on the grid. Combat is resolved at a grid boundary, so a timer seeded at
// an off-grid instant could never be paid: the tick would always land just before it, and the cadence
// would be rolled past the clock instead of spent. Seeds and one-off writes go through here; the
// recurring `+= interval` advances keep the phase because every interval is a whole number of ticks.
function gridAlign(at) {
  return Math.floor(at / SIM_TICK_MS) * SIM_TICK_MS;
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
  // Nearest living enemy, with a deterministic tie-break. Without the id comparison two members could
  // swap targets on a float tie, and `enemies` order alone would make the pick depend on which member
  // moved first — i.e. on the read frequency.
  let best = null, bestD = Infinity;
  for (const enemy of run.enemies) {
    if (enemy.hp <= 0) continue;
    const d = Math.hypot(enemy.x - member.x, enemy.z - member.z);
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && best && enemy.id < best.id)) { best = enemy; bestD = d; }
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
      // Aggro is a range-entry event with the party, so it is stamped at the cell the enemy first sees
      // someone. Anchoring it to the read instead made the first enemy swing land on a different member
      // depending on how often the room was polled.
      const near = livingMembers(run).some(m => Math.hypot(m.x - enemy.x, m.z - enemy.z) < 9);
      if (near) { enemy.aggroAt = at; enemy.nextAttackAt = gridAlign(at + 1_200); }
    }
    if (!enemy.aggroAt || at < enemy.nextAttackAt) continue;
    const targets = livingMembers(run)
      .filter(m => Math.hypot(m.x - enemy.x, m.z - enemy.z) <= reach)
      .filter(m => (attackers.get(m.id) || 0) < RAID_RULES.combat.maxAttackersPerMember);
    // No target inside reach: step the enemy's clock forward on its own cadence rather than anchoring it
    // to this read. `at + 500` reintroduced exactly the read dependence the grid exists to remove -- a
    // 250 ms poll re-based the enemy every 500 ms while a 2 s poll skipped that path entirely, so the
    // same enemy landed its hits on different members.
    if (!targets.length) {
      while (enemy.nextAttackAt <= at) enemy.nextAttackAt += RAID_RULES.combat.enemyAttackMs;
      continue;
    }
    targets.sort((a, b) => Math.hypot(a.x - enemy.x, a.z - enemy.z) - Math.hypot(b.x - enemy.x, b.z - enemy.z));
    const target = targets[0];
    attackers.set(target.id, (attackers.get(target.id) || 0) + 1);
    applyEnemyDamage(run, enemy, target, at);
    // The next swing is one whole interval after the one that just landed, on the grid. `at + interval`
    // re-based the enemy to whatever instant the read arrived on, which is the same defect as the
    // player cadences had: the enemy's clock must be a property of the timeline.
    enemy.nextAttackAt = gridAlign(enemy.nextAttackAt + RAID_RULES.combat.enemyAttackMs + (enemy.kind === 'boss' ? 0 : 400));
  }
}

// Slow out-of-mechanic recovery. Applied once per whole simulation grid cell (`gridSpan` is always a
// multiple of SIM_TICK_MS), so the total heal for a window does not depend on how the window was
// sliced up by reads. Rounding happens once per call on the accumulated amount.
function tickRegen(run, seconds) {
  if (!(seconds > 0)) return;
  const heal = RAID_RULES.combat.regenMaxHpPerSecond * seconds;
  for (const member of run.members) {
    if (member.downed || member.hp <= 0) continue;
    // The fractional remainder is carried on the member. Rounding every settlement independently made
    // the healed total depend on how the window happened to be sliced, so the same party finished a
    // minute 137 HP apart purely because one client polled faster.
    const exact = member.maxHp * heal + (member.regenCarry || 0);
    const whole = Math.floor(exact);
    member.regenCarry = exact - whole;
    member.hp = clamp(member.hp + whole, 0, member.maxHp);
  }
}

function damageEnemy(run, member, enemy, amount, at = run.updatedAt) {
  const dealt = Math.min(enemy.hp, Math.max(0, Math.round(amount)));
  enemy.hp = clamp(enemy.hp - dealt, 0, enemy.maxHp);
  member.damage += dealt;
  if (enemy.hp <= 0 && !enemy.deadAt) {
    // Stamped with the moment the blow was actually paid for, not with "whenever the room was last
    // read". `run.updatedAt` only moves at call boundaries, so using it here made a kill look like it
    // happened at the read rather than at the attack.
    enemy.deadAt = at;
    run.log.push(`${enemy.name} defeated.`);
  }
  return dealt;
}

// Can this member actually be paid right now? Combat needs a live focus target inside its range.
function memberInCombatRange(run, member) {
  const target = focusOf(run, member);
  if (!target) return false;
  const distance = Math.hypot(target.x - member.x, target.z - member.z);
  return distance <= memberReach(member) * 0.86 + (target.kind === 'boss' ? 4.5 : 1.6);
}

// The automatic attack, skill swing and pet hit.
//
// This runs once per simulation cell and resolves at most the swings that fall due in that cell. Every
// cadence is anchored to the grid and advanced by whole intervals, so "how many swings by time T" is a
// function of T alone. A member whose first swing is still owed (cadence 0) is armed the first cell it
// stands within reach, which depends on where it walked - and the walk is itself a function of the cell
// sequence, never of the read.
function tickMemberCombat(run, at) {
  for (const member of run.members) {
    if (member.downed || member.hp <= 0) continue;
    const target = focusOf(run, member);
    if (!target) continue;
    if (!memberInCombatRange(run, member)) {
      // Out of reach: the member must walk, and no damage is invented from a distance. A cadence that
      // passed while walking is rolled to its own next boundary (never to "now + interval", which would
      // move the phase and cost a swing the moment the member closed on a new target).
      if (member.nextAutoAt > 0) while (member.nextAutoAt <= at) member.nextAutoAt += RAID_RULES.combat.playerAutoAttackMs;
      if (member.nextSkillAt > 0) while (member.nextSkillAt <= at) member.nextSkillAt += RAID_RULES.combat.skillEveryMs;
      if (member.nextPetAt > 0) while (member.nextPetAt <= at) member.nextPetAt += RAID_RULES.combat.petEveryMs;
      continue;
    }
    // Reaching combat range is what arms the cadence. It is decided here rather than on the clock
    // because the member's own position is the only thing that decides whether it can swing at all.
    if (member.nextAutoAt <= 0) {
      member.nextAutoAt = at;
      member.nextSkillAt = gridAlign(at + RAID_RULES.combat.skillEveryMs);
      member.nextPetAt = gridAlign(at + SIM_TICK_MS);
    }
    const paidWindow = at < run.damageWindowUntil;
    // At most one swing of each kind per cell. The cadence interval is many cells long, so this is the
    // common case; the `while` exists only so a cadence that is (by construction) never due twice in a
    // cell still cannot be paid twice.
    if (member.nextAutoAt <= at && target.hp > 0) {
      const critAt = member.nextAutoAt;
      const crit = (member.profile.power * 7 + member.id * 13 + Math.floor(critAt / 1000)) % 100 < RAID_RULES.combat.playerCritChance * 100;
      const base = member.profile.dps * (RAID_RULES.combat.playerAutoAttackMs / 1000);
      const penetration = clamp(finite(member.profile.armorPen, 0), 0, 0.8);
      const mitigation = target.kind === 'boss' || target.kind === 'anchor' ? Math.max(0, run.bossArmor - penetration) : 0;
      let amount = base * (1 - mitigation) * (crit ? RAID_RULES.combat.playerCritMultiplier : 1);
      if (paidWindow) amount *= RAID_RULES.ritual.damageWindowMultiplier;
      damageEnemy(run, member, target, amount, critAt);
      member.nextAutoAt = gridAlign(member.nextAutoAt + RAID_RULES.combat.playerAutoAttackMs);
    }
    if (member.nextSkillAt <= at && target.hp > 0) {
      const penetration = clamp(finite(member.profile.armorPen, 0), 0, 0.8);
      const mitigation = target.kind === 'boss' || target.kind === 'anchor' ? Math.max(0, run.bossArmor - penetration) : 0;
      let amount = member.profile.dps * RAID_RULES.combat.skillMultiplier * (1 - mitigation);
      if (paidWindow) amount *= RAID_RULES.ritual.damageWindowMultiplier;
      damageEnemy(run, member, target, amount, member.nextSkillAt);
      member.nextSkillAt = gridAlign(member.nextSkillAt + RAID_RULES.combat.skillEveryMs);
      member.actions++;
    }
    if (member.nextPetAt <= at && target.hp > 0) {
      damageEnemy(run, member, target, member.profile.dps * RAID_RULES.combat.petMultiplier, member.nextPetAt);
      member.nextPetAt = gridAlign(member.nextPetAt + RAID_RULES.combat.petEveryMs);
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
  const fresh = stageEnemies(stage, dps, { ...(boss ? { boss: true, seconds: 240 } : {}), seed: (int(run.seed, 1) || 1) + stage.id * 7919 });
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
    // Same rule as spawn: the party stands at the entrance again, so the first swing of the new stage is
    // owed `openArmMs` after the transition, anchored to the grid like every other cadence instant.
    m.nextAutoAt = gridAlign(at) + RAID_RULES.combat.openArmMs;
    m.nextSkillAt = gridAlign(at) + RAID_RULES.combat.openArmMs + RAID_RULES.combat.skillEveryMs;
    m.nextPetAt = gridAlign(at) + RAID_RULES.combat.openArmMs + SIM_TICK_MS;
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

// One legitimate movement step for one member over one cell. A manual destination wins until it is
// reached or its hold expires; after that the member returns to the automatic chase. Moving through
// `gridAlign` and taking exactly one step per cell is what makes a member's path a function of the
// timeline: the number of steps taken by time T is the number of whole cells before T.
function stepMember(run, member, cellStart, cellEnd) {
  void cellEnd;
  if (!member.auto && cellStart < member.manualUntil) {
    const dx = member.intentX - member.x;
    const dz = member.intentZ - member.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.02) {
      const step = Math.min(dist, RAID_RULES.walkSpeed * (SIM_TICK_MS / 1000));
      member.x = clamp(member.x + (dx / dist) * step, -60, 60);
      member.z = clamp(member.z + (dz / dist) * step, -60, 60);
      member.face = Math.atan2(dz, dx);
      if (step >= dist) member.auto = true;
    } else member.auto = true;
  } else {
    member.auto = true;
    autoApproach(run, member, SIM_TICK_MS);
  }
}

// The automatic chase: one step toward the focus target for a member with no manual destination.
// It stops at the member's own reach, refuses a step that would enter a live telegraph, and never
// runs for a downed member.
function autoApproach(run, member, span) {
  if (!RAID_RULES.autoApproach || member.downed || member.hp <= 0) return;
  const target = focusOf(run, member);
  if (!target) return;
  // The chase closes to a comfortable distance *inside* the range combat accepts, not to a fraction of
  // the base reach. `tickMemberCombat` allows `memberReach + 1.6` (or +4.5 against a boss); stopping at
  // 0.86 of the base reach left an auto-chasing member permanently out of range of its own attack, so a
  // party that never issued a manual move dealt no damage at all once its first target died. Stopping
  // exactly *on* the boundary was just as bad: a floating-point step of zero looks like "already close
  // enough" and the member freezes one millimetre outside its own attack range.
  // Close to a comfortable distance inside combat range. The chase must always be able to finish: when
  // it stopped exactly on `combatReach` the last step rounded to zero and the member froze one
  // millimetre outside its own attack range, which stalled the party for tens of seconds at a time.
  const reach = memberReach(member) * 0.86 - 0.9;
  // Steps are chunked. One long step could otherwise hop clean over a 5-unit-wide telegraph, and the
  // player would be hit by a hazard the engine never saw them enter.
  // The chunk is capped well below the walk distance per second, so a single step can never straddle a
  // telegraph's danger band: 9.6 u/s over a 100 ms chunk is 0.96 u, comfortably inside the narrowest
  // sweep (2 units of half-width). With longer chunks the same guard blocked legitimate chase steps,
  // because the first step of a long span could land "deeper" than the point it started from.
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

// The three ways a run can end without a portal: every member down, a stage timer, or the run
// deadline. Pure function of the clock and of who is alive, so it is safe to call on every step.
function terminalCheck(run, at) {
  if (run.state !== 'active') return true;
  if (!livingMembers(run).length) {
    run.state = 'failed';
    run.finishedAt = at;
    return true;
  }
  if (at >= run.stageEndsAt && run.stageIndex < RAID_STAGES.length - 1) {
    run.state = 'failed';
    run.finishedAt = at;
    run.log.push('The stage timer expired.');
    return true;
  }
  if (at >= run.deadlineAt) {
    run.state = 'failed';
    run.finishedAt = run.deadlineAt;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- advance -----
// Advance the run to `now` and return nothing but the run itself.
//
// THE SCHEDULER
// Time is divided into fixed cells of SIM_TICK_MS. Advancing a run means resolving every whole cell
// between `run.updatedAt` and `now`, in order, exactly once. A cell is resolved as a fixed sequence:
//
//   1. movement      -- every living member takes one step of the cell
//   2. combat        -- player auto/skill/pet swings, then enemy swings, at the cell end
//   3. mechanics     -- due telegraphs resolve, due spawns are created
//   4. stage         -- completion, portal, transition
//   5. termination   -- wipe / stage timer / deadline
//
// The order is part of the rules: a step taken inside a cell is what a telegraph in that cell sees,
// and a swing in that cell lands after the step. Nothing in this function depends on where a read
// begins or ends, which is the property the client's polling rate must never be able to change.
//
// Inputs are never applied retroactively. An intent that arrives during a read is applied at
// `run.updatedAt` (see `applyRaidAction`), i.e. after every cell this function already resolved, so a
// late player cannot rewrite time that has already passed.
function runCell(run, cellStart, cellEnd) {
  // 1. movement
  for (const member of run.members) {
    if (member.downed || member.hp <= 0) continue;
    stepMember(run, member, cellStart, cellEnd);
  }
  // 2. combat. Every cadence is rolled forward to this cell, so a member pays each swing it is owed in
  // the cell the swing fell due -- never a whole stretch of them from the position it ended on.
  // Slow out-of-mechanic recovery, settled once per cell with the fractional remainder carried on the
  // member, so the total healed is a function of the cells elapsed and not of how they were read.
  tickRegen(run, SIM_TICK_MS / 1000);
  tickMemberCombat(run, cellEnd);
  tickEnemyAttacks(run, cellEnd);
  // 3. mechanics: a telegraph that ends in this cell resolves here, before the stage is judged.
  for (const mechanic of [...run.mechanics]) {
    if (mechanic.resolvedAt || mechanic.startsAt <= 0) continue;
    if (mechanic.kind === 'ritual') {
      const alive = mechanic.sourceIds.filter(id => run.enemies.some(e => e.id === id && e.hp > 0));
      if (!alive.length) resolveMechanic(run, mechanic, cellEnd);
      continue;
    }
    if (mechanic.endsAt <= cellEnd) resolveMechanic(run, mechanic, mechanic.endsAt);
  }
  checkRitualTriggers(run, cellEnd);
  if (!run.stageCleared && run.nextMechanicAt <= cellEnd && livingMembers(run).length) {
    spawnMechanic(run, cellEnd);
  }
  if (run.stageIndex === RAID_STAGES.length - 1) {
    const boss = bossTarget(run);
    if (boss && !run.enrage && boss.hp / Math.max(1, boss.maxHp) <= RAID_RULES.enrageHpFraction) {
      run.enrage = true;
      run.log.push('Thanatos is enraged.');
    }
  }
  // 4. stage completion and the portal
  if (!run.stageCleared && stageComplete(run)) {
    run.stageCleared = true;
    // The portal opens on the cell boundary that witnessed the clear. Stamping it with the instant the
    // last enemy died (which can be mid-cell) put the auto-carry a fraction past a boundary, so it fired
    // one cell late -- a whole extra swing of idle time per stage transition.
    run.portalOpenAt = cellEnd;
    run.log.push(`${run.stageName} cleared. The exit portal is open.`);
    // Nothing is scheduled to spawn into a stage that is already won. Leaving the timer armed let it
    // keep coming due for the rest of the run, which is how a cleared stage could still be held open
    // by an event that could no longer do anything.
    run.nextMechanicAt = Infinity;
    if (run.stageIndex >= RAID_STAGES.length - 1) {
      run.state = 'cleared';
      run.finishedAt = cellEnd;
      return;
    }
  }
  // A portal the player asked for is taken in the cell the request is processed in; an untouched one
  // auto-carries the party exactly `PORTAL_AUTO_SECONDS` after it opened, so a disconnected or AFK
  // party is never stranded. Both are checked per cell, so the transition lands on a cell boundary and
  // not on whichever instant a read happened to arrive at.
  if (run.state === 'active' && run.stageCleared
      && (run.portalRequestedAt > 0 || cellEnd >= run.portalOpenAt + PORTAL_AUTO_SECONDS * 1000)) {
    advanceStage(run, cellEnd);
  }
  // 5. termination
  terminalCheck(run, cellEnd);
}

export function advanceRaidRun(run, now = run.updatedAt) {
  if (!run || run.state !== 'active') return false;
  // The clock never runs past the deadline, and a read is never allowed to rewind it.
  const target = clamp(int(now, run.updatedAt), run.updatedAt, run.deadlineAt);
  const from = run.updatedAt;
  if (target <= from) return false;
  let resolved = 0;
  // Only whole cells are ever resolved. A read that ends inside a cell resolves the cells that have
  // fully elapsed and leaves the partial cell for the read that completes it, so a 100 ms reader and a
  // 30 s reader resolve exactly the same sequence of cells. This is the whole of the cadence
  // independence argument: the cell list is a function of the clock, not of the reads.
  while (true) {
    const cellStart = gridAlign(run.cursorAt || from);
    const cellEnd = cellStart + SIM_TICK_MS;
    if (cellEnd > target) break;
    runCell(run, cellStart, cellEnd);
    run.cursorAt = cellEnd;
    resolved++;
    if (run.state !== 'active') break;
    if (resolved >= RAID_RULES.maxCatchupEvents) {
      // Bounded work: stop honestly rather than pretending the rest of the window happened. `updatedAt`
      // records only the cells actually resolved, so the next read continues from the real cursor and
      // nothing is skipped, double-paid, or silently counted as simulated.
      run.updatedAt = Math.max(from, run.cursorAt);
      return true;
    }
  }
  // The cursor is the last fully resolved cell boundary. `updatedAt` is the furthest instant the run
  // has been *observed* at, which may be inside the next cell; the two are deliberately separate so a
  // partial cell is never mistaken for simulated time.
  run.cursorAt = Math.max(gridAlign(run.cursorAt || from), gridAlign(from));
  run.updatedAt = Math.max(run.updatedAt, target);
  // A read that lands exactly on the deadline still resolves it: the loop only resolves whole cells, so
  // a run whose final read is the deadline itself would otherwise be left looking alive.
  if (run.state === 'active' && run.updatedAt >= run.deadlineAt) terminalCheck(run, run.deadlineAt);
  return true;
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
  // `rawAt` is the client's own ordering, kept before the clamp. A request made while the sender was
  // offline, or a retried packet, can arrive with a timestamp older than intents already applied; the
  // clamp below would otherwise rewrite that old timestamp to "now" and make a stale intent look new.
  const rawAt = int(opts.at, run.updatedAt);
  const at = clamp(rawAt, run.updatedAt, run.deadlineAt);
  const advanced = advanceRaidRun(run, at);
  const receipt = receiptFor(member, actionId);
  if (receipt) {
    return { ok: true, duplicate: true, action: receipt.action, result: { ...receipt }, advanced, run };
  }
  if (!ACTIONS.has(action)) return reject('Unknown raid action.', run, 400);
  if (run.state !== 'active') return reject('This raid has ended.', run, 409);

  if (action === 'move') {
    // Same ordering rule as `focus`: an intent older than the newest one applied is stale. Without this
    // the clamp above let a replayed old move reset the manual hold and drag the player back to a
    // destination they had already abandoned.
    if (rawAt < member.lastIntentAt) {
      return {
        ok: true, duplicate: false, stale: true, action,
        result: { id: actionId, action, at, x: member.intentX, z: member.intentZ },
        advanced, run,
      };
    }
    // Rate-limited on the client's own clock. Using the advanced `at` here let the server's own
    // catch-up satisfy the floor, so a second move that was genuinely sent 0 ms after the first was
    // accepted as soon as a read had moved the run's clock past 220 ms.
    if (rawAt - member.lastIntentAt < RAID_RULES.moveMinIntervalMs) return reject('You are already moving.', run, 429);
    // A destination, not a teleport: the member keeps standing where they are and the run's own clock
    // walks them to `x/z` at `walkSpeed`. This is what makes a telegraph dodgeable and a long walk
    // cost real seconds.
    const p = clampPoint(run.stageKey, opts.x, opts.z);
    member.intentX = p.x;
    member.intentZ = p.z;
    member.auto = false;
    member.manualUntil = at + RAID_RULES.manualHoldMs;
    member.lastIntentAt = rawAt;
    return { ok: true, duplicate: false, action, result: { id: actionId, action, at, x: p.x, z: p.z }, advanced, run };
  }

  if (action === 'focus') {
    // A focus is a target choice. It is free and never moves the player, so it carries no paid receipt:
    // re-sending one costs nothing and cannot pay anything. What it must NOT do is let a late-arriving
    // duplicate of an old request undo a newer choice -- a retried packet, or a queued intent that was
    // offline when it was made, arrives after the player has already re-targeted. The rule is the same
    // one `move` uses: an intent older than the newest one already applied is stale and is acknowledged
    // without being applied. `at` has already been clamped forward to `updatedAt`, so this compares the
    // client's own ordering, not the server's.
    const stale = rawAt < member.lastIntentAt;
    if (!stale) {
      const targetId = typeof opts.targetId === 'string' ? opts.targetId.slice(0, 40) : '';
      const enemy = run.enemies.find(e => e.id === targetId);
      if (targetId && !enemy) return reject('That enemy is not in this stage.', run, 404);
      member.targetId = targetId;
      member.lastIntentAt = rawAt;
    }
    return {
      ok: true, duplicate: false, stale, action,
      result: { id: actionId, action, at, targetId: member.targetId },
      advanced, run,
    };
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
      target.nextAutoAt = gridAlign(at + 400);
      target.nextSkillAt = gridAlign(at + 1_600);
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
