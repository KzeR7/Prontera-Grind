// Pure Rift Raid encounter engine. No D1, Durable Object, DOM or wall clock is read here: the caller
// supplies every timestamp, which is what makes the timing deterministic in tests and authoritative
// in production. The Social Durable Object owns a run object built and advanced by these functions.
import { RAID_RULES, raidPartySize, raidTotalHp, raidPhaseHp } from './raid-rules.js';
import { sanitizeRaidProfile } from './raid-profile.js';

const finite = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Number(n) : fallback);
const int = (n, fallback = 0) => Math.max(0, Math.floor(finite(n, fallback)));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const ACTIONS = new Set(['strike', 'dodge', 'ward', 'heal', 'revive', 'move']);
const LANES = RAID_RULES.lanes;
export const RAID_ACTION_ID_RE = /^[A-Za-z0-9:_-]{8,100}$/;

// Small deterministic PRNG used only to build the fixed hazard plan at install time. The plan is
// persisted with the run, so a restart replays exactly the same lanes.
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

export function buildHazardPlan(seed, partySize, count = 96) {
  const rng = mulberry32(finite(seed, 1) >>> 0);
  const size = raidPartySize(partySize) || 1;
  const plan = [];
  for (let i = 0; i < count; i++) {
    const first = Math.floor(rng() * LANES.length);
    const danger = [LANES[first]];
    if (size > 1 && rng() < RAID_RULES.mechanics.sweepPartyChance) {
      let second = (first + 1 + Math.floor(rng() * (LANES.length - 1))) % LANES.length;
      danger.push(LANES[second]);
    }
    plan.push({ dangerZones: danger, kind: danger.length > 1 ? 'rift-sweep' : 'fracture-slam' });
  }
  return plan;
}

function laneForIndex(index) {
  return LANES[index % LANES.length];
}

function sanitizeReceipt(raw) {
  if (!isObj(raw) || typeof raw.id !== 'string' || !RAID_ACTION_ID_RE.test(raw.id)) return null;
  return {
    id: raw.id,
    action: ACTIONS.has(raw.action) ? raw.action : 'strike',
    at: int(raw.at, 0),
    damage: int(raw.damage, 0),
    healed: int(raw.healed, 0),
  };
}

function sanitizeMember(raw, index, fallbackLane = laneForIndex(index)) {
  if (!isObj(raw) || !Number.isInteger(Number(raw.id)) || Number(raw.id) < 1) return null;
  const profile = sanitizeRaidProfile(raw.profile);
  const maxHp = clamp(int(raw.maxHp, profile.maxHp || 1_000), 1_000, 1_000_000_000);
  // The prototype could load a member whose `profile.maxHp` and `member.maxHp` disagreed. The
  // member field is the live ceiling and the profile is the snapshot; when only one exists, both
  // are repaired to that one finite value before any HP arithmetic.
  profile.maxHp = maxHp;
  const hp = clamp(int(raw.hp, maxHp), 0, maxHp);
  return {
    id: Number(raw.id),
    name: typeof raw.name === 'string' && raw.name.length ? raw.name.slice(0, 32) : 'Adventurer',
    profile,
    maxHp,
    hp,
    lane: LANES.includes(raw.lane) ? raw.lane : fallbackLane,
    damage: int(raw.damage, 0),
    support: int(raw.support, 0),
    actions: int(raw.actions, 0),
    dodges: int(raw.dodges, 0),
    downs: int(raw.downs, 0),
    lastStrikeAt: int(raw.lastStrikeAt, 0),
    lastMoveAt: int(raw.lastMoveAt, 0),
    lastHealAt: int(raw.lastHealAt, 0),
    lastWardAt: int(raw.lastWardAt, 0),
    lastReviveAt: int(raw.lastReviveAt, 0),
    wardUntil: int(raw.wardUntil, 0),
    downUntil: int(raw.downUntil, 0),
    nextAutoAt: int(raw.nextAutoAt, 0),
    dodgeHazardId: typeof raw.dodgeHazardId === 'string' ? raw.dodgeHazardId.slice(0, 100) : '',
    actionReceipts: (Array.isArray(raw.actionReceipts) ? raw.actionReceipts : [])
      .map(sanitizeReceipt).filter(Boolean)
      .slice(-RAID_RULES.maxActionReceipts),
  };
}

export function createRaidRun(input) {
  if (!isObj(input) || typeof input.id !== 'string' || !input.id) return null;
  const partySize = raidPartySize(input.partySize);
  if (!partySize || !Array.isArray(input.members) || input.members.length !== partySize) return null;
  const leaderId = int(input.leaderId, 0);
  if (!input.members.some(m => int(m?.id, 0) === leaderId)) return null;
  const startedAt = int(input.startedAt, 0);
  const deadlineAt = int(input.deadlineAt, 0);
  if (!startedAt || deadlineAt <= startedAt) return null;
  const totalHp = clamp(int(input.totalHp, raidTotalHp(partySize)), 1, Number.MAX_SAFE_INTEGER);
  const phaseHps = Array.isArray(input.phaseHps)
    ? input.phaseHps.map(v => int(v, 0))
    : raidPhaseHp(totalHp);
  if (phaseHps.length !== 4 || phaseHps.reduce((a, b) => a + b, 0) !== totalHp || phaseHps.some(v => v < 0)) return null;
  const members = input.members.map((m, i) => sanitizeMember({
    ...m,
    // A fresh run starts at the profile's maximum HP. No client-supplied HP is accepted.
    hp: m?.profile?.maxHp,
    maxHp: m?.profile?.maxHp,
  }, i));
  if (members.some(m => !m) || new Set(members.map(m => m.id)).size !== partySize) return null;
  for (const member of members) member.nextAutoAt = startedAt + RAID_RULES.autoAttackMs;
  const seed = int(input.seed, 1) >>> 0;
  return {
    id: input.id,
    leaderId,
    partyId: typeof input.partyId === 'string' ? input.partyId.slice(0, 100) : null,
    partySize,
    totalHp,
    hpRemaining: totalHp,
    phaseHps,
    phaseNames: Array.isArray(input.phaseNames) && input.phaseNames.length === 4
      ? input.phaseNames.map(n => String(n).slice(0, 48))
      : [...RAID_RULES.phaseNames],
    phaseIndex: 0,
    phaseHp: phaseHps[0],
    startedAt,
    deadlineAt,
    bossArmor: clamp(finite(input.bossArmor, RAID_RULES.bossArmor), 0, 0.8),
    autoAttackMs: RAID_RULES.autoAttackMs,
    strikeCooldownMs: RAID_RULES.strikeCooldownMs,
    moveCooldownMs: RAID_RULES.moveCooldownMs,
    tellMs: RAID_RULES.mechanics.tellMs,
    intervalMs: RAID_RULES.mechanics.intervalMs,
    seed,
    hazardIndex: 0,
    hazardPlan: buildHazardPlan(seed, partySize),
    nextHazardAt: startedAt + RAID_RULES.mechanics.firstAtMs,
    hazard: null,
    state: 'active',
    finishedAt: 0,
    settledAckAt: 0,
    deleteAt: 0,
    catchupClamped: false,
    updatedAt: startedAt,
    members,
  };
}

export function sanitizeRaidRun(raw) {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  if (!['active', 'cleared', 'failed', 'cancelled'].includes(raw.state)) return null;
  const partySize = raidPartySize(raw.partySize);
  if (!partySize || !Array.isArray(raw.members) || raw.members.length !== partySize) return null;
  const totalHp = clamp(int(raw.totalHp, 0), 1, Number.MAX_SAFE_INTEGER);
  const phaseHps = Array.isArray(raw.phaseHps) ? raw.phaseHps.map(v => int(v, 0)) : [];
  if (!phaseHps.length || phaseHps.length !== 4 || phaseHps.reduce((a, b) => a + b, 0) !== totalHp) return null;
  const members = raw.members.map((m, i) => sanitizeMember(m, i));
  if (members.some(m => !m) || new Set(members.map(m => m.id)).size !== partySize) return null;
  const startedAt = int(raw.startedAt, 0);
  const deadlineAt = int(raw.deadlineAt, 0);
  if (!startedAt || deadlineAt <= startedAt) return null;
  const seed = int(raw.seed, 1) >>> 0;
  const plan = Array.isArray(raw.hazardPlan) && raw.hazardPlan.length
    ? raw.hazardPlan.filter(h => isObj(h) && Array.isArray(h.dangerZones) && h.dangerZones.length >= 1 && h.dangerZones.every(z => LANES.includes(z)))
      .map(h => ({ dangerZones: [...new Set(h.dangerZones)].slice(0, 2), kind: h.kind === 'rift-sweep' ? 'rift-sweep' : 'fracture-slam' }))
    : buildHazardPlan(seed, partySize);
  const fallbackPlan = plan.length ? plan : buildHazardPlan(seed, partySize);
  const hazardIndex = int(raw.hazardIndex, 0);
  const nextHazardAt = int(raw.nextHazardAt, startedAt + RAID_RULES.mechanics.firstAtMs + hazardIndex * RAID_RULES.mechanics.intervalMs);
  const hazard = isObj(raw.hazard) && Array.isArray(raw.hazard.dangerZones) && raw.hazard.dangerZones.every(z => LANES.includes(z))
    ? {
      id: typeof raw.hazard.id === 'string' ? raw.hazard.id.slice(0, 100) : `hazard:${raw.id}:${hazardIndex}`,
      kind: raw.hazard.kind === 'rift-sweep' ? 'rift-sweep' : 'fracture-slam',
      dangerZones: [...new Set(raw.hazard.dangerZones)].slice(0, 2),
      startsAt: int(raw.hazard.startsAt, startedAt),
      endsAt: int(raw.hazard.endsAt, startedAt + RAID_RULES.mechanics.tellMs),
    }
    : null;
  const state = raw.state;
  const hpRemaining = state === 'cleared' ? 0 : clamp(int(raw.hpRemaining, totalHp), 0, totalHp);
  const phaseIndex = clamp(int(raw.phaseIndex, 0), 0, 3);
  const phaseHp = state === 'cleared' ? 0 : clamp(int(raw.phaseHp, phaseHps[phaseIndex]), 0, phaseHps[phaseIndex]);
  const finishedAt = state === 'active' ? 0 : clamp(int(raw.finishedAt, deadlineAt), startedAt, Math.max(deadlineAt, int(raw.updatedAt, deadlineAt)));
  for (const member of members) {
    if (!member.nextAutoAt || member.nextAutoAt < startedAt) member.nextAutoAt = startedAt + RAID_RULES.autoAttackMs;
  }
  return {
    id: raw.id,
    leaderId: int(raw.leaderId, 0),
    partyId: typeof raw.partyId === 'string' ? raw.partyId.slice(0, 100) : null,
    partySize,
    totalHp,
    hpRemaining,
    phaseHps,
    phaseNames: Array.isArray(raw.phaseNames) && raw.phaseNames.length === 4
      ? raw.phaseNames.map(n => String(n).slice(0, 48))
      : [...RAID_RULES.phaseNames],
    phaseIndex,
    phaseHp,
    startedAt,
    deadlineAt,
    bossArmor: clamp(finite(raw.bossArmor, RAID_RULES.bossArmor), 0, 0.8),
    autoAttackMs: RAID_RULES.autoAttackMs,
    strikeCooldownMs: RAID_RULES.strikeCooldownMs,
    moveCooldownMs: RAID_RULES.moveCooldownMs,
    tellMs: RAID_RULES.mechanics.tellMs,
    intervalMs: RAID_RULES.mechanics.intervalMs,
    seed,
    hazardIndex,
    hazardPlan: fallbackPlan,
    nextHazardAt,
    hazard,
    state,
    finishedAt,
    settledAckAt: int(raw.settledAckAt, 0),
    deleteAt: int(raw.deleteAt, 0),
    catchupClamped: raw.catchupClamped === true,
    updatedAt: int(raw.updatedAt, startedAt),
    members,
  };
}

function applyBossDamage(run, amount) {
  let damage = Math.max(0, Math.floor(finite(amount, 0)));
  if (!damage || run.state !== 'active') return 0;
  damage = Math.min(damage, run.hpRemaining);
  run.hpRemaining = Math.max(0, run.hpRemaining - damage);
  let left = damage;
  while (left > 0 && run.phaseIndex < 4) {
    if (left >= run.phaseHp) {
      left -= run.phaseHp;
      run.phaseIndex++;
      run.phaseHp = run.phaseIndex < 4 ? run.phaseHps[run.phaseIndex] : 0;
    } else {
      run.phaseHp -= left;
      left = 0;
    }
  }
  if (run.hpRemaining <= 0) {
    run.hpRemaining = 0;
    run.phaseHp = 0;
    run.phaseIndex = 3;
  }
  return damage;
}

function autoDamage(run, member) {
  const penetration = clamp(finite(member.profile.armorPen, 0), 0, 0.8);
  const mitigation = Math.max(0, run.bossArmor - penetration);
  return Math.max(1, Math.floor(member.profile.dps * run.autoAttackMs / 1000 * (1 - mitigation)));
}

function applyAutoAttack(run, member, at) {
  const damage = applyBossDamage(run, autoDamage(run, member));
  member.damage += damage;
  member.nextAutoAt = at + run.autoAttackMs;
  if (run.hpRemaining <= 0 && run.state === 'active') {
    run.state = 'cleared';
    run.finishedAt = at;
  }
  return damage;
}

function applyHazardDamage(run, hazard, at) {
  for (const member of run.members) {
    if (member.hp <= 0) continue;
    if (!hazard.dangerZones.includes(member.lane)) {
      if (member.dodgeHazardId === hazard.id) {
        member.dodges++;
        member.support += Math.floor(member.maxHp * RAID_RULES.mechanics.dodgeSupportMaxHpRatio);
      }
      continue;
    }
    let damage = Math.max(1, Math.floor(member.maxHp * RAID_RULES.mechanics.slamMaxHpRatio));
    if (member.wardUntil > at) {
      const reduced = Math.floor(damage * RAID_RULES.mechanics.wardReduction);
      member.support += reduced;
      damage -= reduced;
      member.wardUntil = 0; // a ward absorbs one resolved hazard
    }
    member.hp = clamp(member.hp - damage, 0, member.maxHp);
    if (member.hp <= 0) {
      member.downs++;
      member.downUntil = at;
      member.nextAutoAt = Number.MAX_SAFE_INTEGER;
    }
  }
  if (run.members.every(m => m.hp <= 0) && run.state === 'active') {
    run.state = 'failed';
    run.finishedAt = at;
  }
}

function resolveHazard(run, at) {
  const hazard = run.hazard;
  if (!hazard) return false;
  applyHazardDamage(run, hazard, hazard.endsAt);
  run.hazard = null;
  run.hazardIndex++;
  run.nextHazardAt = run.startedAt + RAID_RULES.mechanics.firstAtMs + run.hazardIndex * run.intervalMs;
  return true;
}

function createHazard(run, at) {
  const slot = run.hazardPlan[run.hazardIndex % run.hazardPlan.length] || { dangerZones: ['center'], kind: 'fracture-slam' };
  run.hazard = {
    id: `hazard:${run.id}:${run.hazardIndex}`,
    kind: slot.kind,
    dangerZones: [...slot.dangerZones],
    startsAt: at,
    endsAt: at + run.tellMs,
  };
  return true;
}

function earliestAuto(run) {
  let at = Number.MAX_SAFE_INTEGER;
  for (const member of run.members) if (member.hp > 0 && member.nextAutoAt < at) at = member.nextAutoAt;
  return at;
}

// Advance the authoritative encounter to `now`, resolving every scheduled auto attack and hazard
// that is due. All times come from the run, never from how late a request arrived. `maxCatchupEvents`
// bounds one request; a request after a very long silence stops at the bound (or at the deadline)
// rather than looping forever, and the next request continues from the persisted state.
export function advanceRaidRun(run, now = run.updatedAt) {
  if (!run || !['active'].includes(run.state)) return false;
  let t = clamp(finite(now, run.updatedAt), run.startedAt, run.deadlineAt);
  let changed = false;
  let events = 0;
  while (run.state === 'active' && events < RAID_RULES.maxCatchupEvents) {
    const autoAt = earliestAuto(run);
    const hazardAt = run.hazard ? run.hazard.endsAt : run.nextHazardAt;
    const next = Math.min(autoAt, hazardAt);
    if (next > t) break;
    if (next > run.deadlineAt) {
      // No event is scheduled before the deadline. The encounter fails at the fixed deadline, not
      // at the time this request happened to arrive.
      run.state = 'failed';
      run.finishedAt = run.deadlineAt;
      changed = true;
      break;
    }
    events++;
    if (run.hazard && run.hazard.endsAt <= next) {
      changed = resolveHazard(run, next) || changed;
      continue;
    }
    if (!run.hazard && run.nextHazardAt <= next) {
      changed = createHazard(run, run.nextHazardAt) || changed;
      continue;
    }
    const member = run.members
      .filter(m => m.hp > 0 && m.nextAutoAt <= t)
      .sort((a, b) => a.nextAutoAt - b.nextAutoAt)[0];
    if (member) {
      applyAutoAttack(run, member, member.nextAutoAt);
      changed = true;
      continue;
    }
    break;
  }
  if (events >= RAID_RULES.maxCatchupEvents && run.state === 'active') {
    run.catchupClamped = true;
    // Do not let an abandoned run replay an unbounded backlog. The deadline remains authoritative.
    if (t >= run.deadlineAt) {
      run.state = 'failed';
      run.finishedAt = run.deadlineAt;
    }
  }
  if (run.state === 'active' && t >= run.deadlineAt) {
    run.state = 'failed';
    run.finishedAt = run.deadlineAt;
    changed = true;
  }
  run.updatedAt = Math.max(run.updatedAt || run.startedAt, Math.min(t, run.deadlineAt));
  return changed;
}

function receiptFor(member, actionId) {
  if (!actionId) return null;
  return member.actionReceipts.find(r => r.id === actionId) || null;
}

function reject(error, run, code = 409) {
  return { ok: false, code, error, run };
}

function actionTarget(run, targetId) {
  const id = int(targetId, 0);
  return run.members.find(m => m.id === id) || null;
}

// Server-side action application. Returns a plain result; the caller persists `run` only on ok.
export function applyRaidAction(run, userId, action, opts = {}) {
  if (!run) return reject('That raid no longer exists.', null, 404);
  const actionId = typeof opts.actionId === 'string' ? opts.actionId : '';
  if (!RAID_ACTION_ID_RE.test(actionId)) return reject('A valid action id is required.', run, 400);
  const member = run.members.find(m => m.id === int(userId, 0));
  if (!member) return reject('You are not in that raid.', run, 403);
  const at = clamp(int(opts.at, run.updatedAt), run.startedAt, run.deadlineAt);
  const advanced = advanceRaidRun(run, at);
  // A retry of an accepted action is accepted even after the run became terminal, and never
  // applies its effect twice.
  const receipt = receiptFor(member, actionId);
  if (receipt) {
    return { ok: true, duplicate: true, action: receipt.action, result: { ...receipt }, advanced, run };
  }
  if (run.state !== 'active') return { ...reject('This raid has ended.', run), advanced };
  if (member.hp <= 0) return { ...reject('You are down. A living teammate must revive you.', run), advanced };
  if (!ACTIONS.has(action)) return reject('Unknown raid action.', run, 400);

  let target = null;
  let damage = 0;
  let healed = 0;

  if (action === 'strike') {
    if (at - member.lastStrikeAt < run.strikeCooldownMs) {
      return { ...reject('Your focus strike is still recovering.', run), advanced };
    }
    if (at >= run.deadlineAt) return { ...reject('The raid timer has expired.', run), advanced };
    member.lastStrikeAt = at;
    const penetration = clamp(finite(member.profile.armorPen, 0), 0, 0.8);
    const mitigation = Math.max(0, run.bossArmor - penetration);
    const raw = Math.max(1, Math.floor(member.profile.dps * RAID_RULES.strikeDamageSeconds * (1 - mitigation)));
    damage = applyBossDamage(run, raw);
    member.damage += damage;
    if (run.hpRemaining <= 0) {
      run.state = 'cleared';
      run.finishedAt = at;
    }
  } else if (action === 'move') {
    // Free movement in the arena. Walking into another lane is not a dodge: the hazard's scheduled
    // endsAt still resolves against whichever lane the player is standing in at that timestamp.
    const zone = typeof opts.zone === 'string' ? opts.zone : '';
    if (!LANES.includes(zone)) return { ...reject('Choose a valid arena lane.', run), advanced };
    if (at - member.lastMoveAt < run.moveCooldownMs) {
      return { ...reject('You are already moving.', run), advanced };
    }
    member.lastMoveAt = at;
    member.lane = zone;
  } else if (action === 'dodge') {
    const zone = typeof opts.zone === 'string' ? opts.zone : '';
    if (!LANES.includes(zone)) return { ...reject('Choose a valid lane to dodge into.', run), advanced };
    if (!run.hazard) return { ...reject('There is no active hazard to dodge.', run), advanced };
    if (at >= run.hazard.endsAt) return { ...reject('That telegraph has already resolved.', run), advanced };
    if (member.dodgeHazardId === run.hazard.id) return { ...reject('You already dodged this hazard.', run), advanced };
    member.lane = zone;
    member.dodgeHazardId = run.hazard.id;
  } else if (action === 'heal') {
    if (at - member.lastHealAt < RAID_RULES.support.healCooldownMs) {
      return { ...reject('Mend is still recovering.', run), advanced };
    }
    target = actionTarget(run, opts.targetId) || member;
    if (target.hp <= 0) return { ...reject('Use Revive for a downed adventurer.', run), advanced };
    if (target.hp >= target.maxHp) return { ...reject('That adventurer does not need healing.', run), advanced };
    member.lastHealAt = at;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + Math.floor(target.maxHp * RAID_RULES.support.healMaxHpRatio));
    healed = target.hp - before;
    member.support += healed;
  } else if (action === 'ward') {
    if (at - member.lastWardAt < RAID_RULES.support.wardCooldownMs) {
      return { ...reject('Aegis Ward is still recovering.', run), advanced };
    }
    target = actionTarget(run, opts.targetId) || member;
    if (target.hp <= 0) return { ...reject('Revive the downed adventurer first.', run), advanced };
    member.lastWardAt = at;
    target.wardUntil = at + RAID_RULES.support.wardDurationMs;
    member.support += Math.floor(target.maxHp * RAID_RULES.support.wardSupportMaxHpRatio);
  } else if (action === 'revive') {
    if (at - member.lastReviveAt < RAID_RULES.support.reviveCooldownMs) {
      return { ...reject('Revive is still recovering.', run), advanced };
    }
    target = actionTarget(run, opts.targetId);
    if (!target || target.id === member.id || target.hp > 0) {
      return { ...reject('Choose a downed teammate to revive.', run), advanced };
    }
    member.lastReviveAt = at;
    target.hp = Math.max(1, Math.floor(target.maxHp * RAID_RULES.support.reviveHpRatio));
    target.downUntil = 0;
    target.wardUntil = 0;
    target.dodgeHazardId = '';
    target.nextAutoAt = at + run.autoAttackMs;
    healed = target.hp;
    member.support += healed;
  }

  if (action !== 'move') member.actions++;
  // Continue the fixed timeline to the action's server timestamp. A strike may reduce phase HP;
  // an already-due hazard still resolves at its own scheduled endsAt.
  advanceRaidRun(run, at);
  const record = { id: actionId, action, at, damage, healed };
  member.actionReceipts.push(record);
  if (member.actionReceipts.length > RAID_RULES.maxActionReceipts) {
    member.actionReceipts.splice(0, member.actionReceipts.length - RAID_RULES.maxActionReceipts);
  }
  return { ok: true, duplicate: false, action, result: record, advanced, run };
}

export function raidMemberReady(member) {
  return {
    strikeReadyAt: (member.lastStrikeAt || 0) + RAID_RULES.strikeCooldownMs,
    moveReadyAt: (member.lastMoveAt || 0) + RAID_RULES.moveCooldownMs,
    healReadyAt: (member.lastHealAt || 0) + RAID_RULES.support.healCooldownMs,
    wardReadyAt: (member.lastWardAt || 0) + RAID_RULES.support.wardCooldownMs,
    reviveReadyAt: (member.lastReviveAt || 0) + RAID_RULES.support.reviveCooldownMs,
  };
}

export function raidPublicRun(run, now = Date.now()) {
  if (!run) return null;
  return {
    id: run.id,
    state: run.state,
    partySize: run.partySize,
    totalHp: run.totalHp,
    hpRemaining: run.hpRemaining,
    phaseIndex: run.phaseIndex,
    phaseHp: run.phaseHp,
    phaseHps: [...run.phaseHps],
    phaseNames: [...run.phaseNames],
    startedAt: run.startedAt,
    deadlineAt: run.deadlineAt,
    finishedAt: run.finishedAt,
    settledAckAt: run.settledAckAt,
    serverNow: int(now, Date.now()),
    bossArmor: run.bossArmor,
    hazard: run.hazard ? {
      id: run.hazard.id,
      kind: run.hazard.kind,
      dangerZones: [...run.hazard.dangerZones],
      startsAt: run.hazard.startsAt,
      endsAt: run.hazard.endsAt,
      resolvesAt: run.hazard.endsAt,
    } : null,
    schedule: {
      autoAttackMs: run.autoAttackMs,
      strikeCooldownMs: run.strikeCooldownMs,
      moveCooldownMs: run.moveCooldownMs,
      tellMs: run.tellMs,
      intervalMs: run.intervalMs,
      nextHazardAt: run.nextHazardAt,
    },
    catchupClamped: run.catchupClamped === true,
    members: run.members.map(m => ({
      id: m.id,
      name: m.name,
      cls: m.profile.cls,
      magic: m.profile.magic,
      sex: m.profile.sex,
      dps: m.profile.dps,
      hp: m.hp,
      maxHp: m.maxHp,
      lane: m.lane,
      damage: m.damage,
      support: m.support,
      actions: m.actions,
      dodges: m.dodges,
      downs: m.downs,
      downed: m.hp <= 0,
      downUntil: m.downUntil,
      wardUntil: m.wardUntil,
      dodgeHazardId: m.dodgeHazardId,
      ...raidMemberReady(m),
      nextAutoAt: m.nextAutoAt,
    })),
  };
}

export function raidRunIsActive(run) {
  return !!run && run.state === 'active';
}
