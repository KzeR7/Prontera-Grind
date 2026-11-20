// Player-character Rift Raid engine acceptance, without a browser or Durable Object.
//
// The clock is supplied by the test. Every hazard lands on the timestamp written at install time,
// never on the moment a request happened to arrive.
import assert from 'node:assert/strict';
import {
  createRaidRun, sanitizeRaidRun, advanceRaidRun, applyRaidAction, raidPublicRun,
} from '../../functions/_lib/raid-engine.js';
import { RAID_RULES, raidTotalHp, raidPhaseHp, raidDurationSeconds } from '../../functions/_lib/raid-rules.js';
import { raidProfileFromSave, decodeRaidSave } from '../../functions/_lib/raid-profile.js';
import { packSave } from '../../functions/_lib/save-codec.js';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + (e && e.stack || e)); fail++; }
};
const finiteHp = run => run.members.every(m => Number.isFinite(m.hp) && Number.isFinite(m.maxHp) && m.hp >= 0 && m.hp <= m.maxHp);

function saveFor(cls = 'Lord Knight', magic = false) {
  const st = magic
    ? { str: 1, agi: 90, dex: 120, luk: 1, int: 120, vit: 120 }
    : { str: 120, agi: 120, dex: 120, luk: 90, int: 1, vit: 120 };
  const weapon = magic
    ? { id: 'staff', slot: 'weapon', wt: 'staff', name: 'Rift Staff', val: 120000, r: 15, aff: [{ k: 'matk', v: 400 }], sec: 6 }
    : { id: 'katar', slot: 'weapon', wt: 'katar', name: 'Rift Katar', val: 120000, r: 15, aff: [{ k: 'atk', v: 400 }], sec: 6 };
  return {
    lv: 150, cls, sex: 'm', st,
    eq: {
      weapon,
      head: { id: 'h', slot: 'head', val: 3000, r: 10, aff: [] },
      acc1: { id: 'a1', slot: 'acc1', val: 2000, r: 10, aff: [] },
      acc2: { id: 'a2', slot: 'acc2', val: 2000, r: 10, aff: [] },
    },
    inv: [
      { id: 'bag-katar', slot: 'weapon', wt: 'katar', name: 'Bag Katar', val: 1, r: 0, aff: [], sec: 6 },
      { id: 'bag-staff', slot: 'weapon', wt: 'staff', name: 'Bag Staff', val: 1, r: 0, aff: [], sec: 6 },
    ],
    pv: { hpp: 0 },
  };
}
const profile = (cls, magic) => raidProfileFromSave(saveFor(cls, magic));
const member = (id, name, p) => ({ id, name, profile: p });
const baseRun = (memberList, overrides = {}) => {
  const partySize = memberList.length;
  const totalHp = 540000000;
  return createRaidRun({
    id: 'raid:sim-' + Math.random().toString(36).slice(2, 8),
    leaderId: memberList[0].id, partySize, totalHp,
    phaseHps: [81000000, 81000000, 81000000, 297000000],
    startedAt: 1000000, deadlineAt: 1000000 + 600000, seed: 12345,
    members: memberList, ...overrides,
  });
};

console.log('player raid engine: fixed clocks, finite HP, class-aware profiles\n');

t('physical and magic profiles produce finite, comparable server power', () => {
  const phys = profile('Lord Knight', false);
  const magic = profile('Warlock', true);
  for (const p of [phys, magic]) {
    assert.ok(Number.isFinite(p.maxHp) && p.maxHp > 1000);
    assert.ok(Number.isFinite(p.dps) && p.dps >= RAID_RULES.dpsMin && p.dps <= RAID_RULES.dpsMax);
  }
  assert.equal(phys.magic, false);
  assert.equal(magic.magic, true);
  assert.ok(magic.dps > 100000, 'representative magic gear is not priced as a physical auto-attacker');
});

t('a packed bag weapon is visible through the canonical decoder and is not used while equipped wins', () => {
  const save = saveFor('Lord Knight', false);
  const packed = packSave(save);
  assert.notEqual(packed.__v, undefined);
  const decoded = decodeRaidSave(JSON.stringify(packed));
  assert.ok(decoded && Array.isArray(decoded.inv));
  const p = raidProfileFromSave(decoded);
  assert.equal(p.weaponId, 'katar');
  assert.equal(p.magic, false);
  assert.ok(p.dps > 0);
});

t('defence penetration from weapon stars reduces the boss armour step', () => {
  const p = profile('Lord Knight', false);
  const plain = baseRun([member(1, 'A', { ...p, armorPen: 0 })]);
  const piercing = baseRun([member(1, 'A', { ...p, armorPen: RAID_RULES.bossArmor })]);
  const a = applyRaidAction(plain, 1, 'strike', { actionId: 'pen:plain:1', at: plain.startedAt + 10 });
  const b = applyRaidAction(piercing, 1, 'strike', { actionId: 'pen:full:1', at: piercing.startedAt + 10 });
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(b.ok, true, JSON.stringify(b));
  assert.ok(b.run.members[0].damage > a.run.members[0].damage, 'full penetration ignores the 30% armour step');
  const ratio = b.run.members[0].damage / a.run.members[0].damage;
  assert.ok(Math.abs(ratio - 1 / 0.7) < 0.001, 'damage ratio is 1/(1-armour): ' + ratio);
});

t('a fresh run never carries member/profile maxHp disagreement', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p), member(2, 'B', p)]);
  assert.ok(run);
  for (const m of run.members) assert.equal(m.maxHp, m.profile.maxHp);
  const json = JSON.parse(JSON.stringify(run));
  const restored = sanitizeRaidRun(json);
  assert.ok(restored);
  for (const m of restored.members) assert.equal(m.maxHp, m.profile.maxHp);
  assert.ok(finiteHp(restored));
});

t('sanitize repairs a damaged member maxHp and a missing hazard plan', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p), member(2, 'B', p)]);
  const broken = JSON.parse(JSON.stringify(run));
  delete broken.members[0].maxHp;
  delete broken.members[1].profile.maxHp;
  broken.hazardPlan = [];
  broken.nextHazardAt = 1000000 + RAID_RULES.mechanics.firstAtMs;
  broken.state = 'failed'; broken.finishedAt = 1001000; broken.settledAckAt = 1002000; broken.deleteAt = 1003000;
  const restored = sanitizeRaidRun(broken);
  assert.ok(restored);
  for (const m of restored.members) {
    assert.ok(Number.isFinite(m.maxHp) && m.maxHp >= 1000);
    assert.equal(m.maxHp, m.profile.maxHp);
  }
  assert.ok(Array.isArray(restored.hazardPlan) && restored.hazardPlan.length > 0);
  assert.equal(restored.state, 'failed');
  assert.equal(restored.settledAckAt, 1002000);
  assert.equal(restored.deleteAt, 1003000, 'acknowledged retry window survives a room restart');
});

t('hazards resolve on the fixed schedule even when the next request arrives late', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p), member(2, 'B', p)]);
  const first = run.nextHazardAt;
  const hazard = run.hazardPlan[0];
  for (const m of run.members) m.lane = hazard.dangerZones[0];
  const started = run.startedAt;
  advanceRaidRun(run, started + RAID_RULES.mechanics.firstAtMs + RAID_RULES.mechanics.tellMs);
  assert.equal(run.hazard, null);
  for (const m of run.members) assert.ok(m.hp < m.maxHp, 'a quiet player in the telegraphed lane takes real damage');
  assert.ok(finiteHp(run));
  assert.equal(run.nextHazardAt, first + RAID_RULES.mechanics.intervalMs, 'the next hazard is scheduled from the fixed start');
});

t('healing, warding, downing and a teammate revive keep every HP value finite', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p), member(2, 'B', p)]);
  const now = () => run.updatedAt;
  for (let i = 0; i < 6 && run.members[0].hp > 0; i++) {
    const h = run.hazard || (advanceRaidRun(run, run.nextHazardAt + 1), run.hazard);
    if (!h) break;
    run.members[0].lane = h.dangerZones[0];
    advanceRaidRun(run, h.endsAt);
    run.members[0].lane = 'center';
    run.members[1].lane = 'center';
    if (run.state !== 'active') break;
  }
  assert.equal(run.state, 'active', 'the other member survived');
  assert.ok(run.members[0].hp <= 0, 'the focused member was downed by real hazard damage');
  const downed = applyRaidAction(run, 1, 'strike', { actionId: 'down:strike:1', at: run.updatedAt });
  assert.equal(downed.ok, false);
  assert.match(downed.error, /down/i);
  const before = run.members[0].hp;
  const heal = applyRaidAction(run, 2, 'heal', { actionId: 'heal:downed:1', targetId: 1, at: run.updatedAt });
  assert.equal(heal.ok, false, 'heal cannot replace revive');
  assert.equal(run.members[0].hp, before);
  const revive = applyRaidAction(run, 2, 'revive', { actionId: 'revive:mate:1', targetId: 1, at: run.updatedAt });
  assert.equal(revive.ok, true, revive.error || '');
  assert.ok(run.members[0].hp > 0 && run.members[0].hp <= run.members[0].maxHp);
  assert.ok(finiteHp(run));
  void now;
});

t('a full party wipe ends failed at the scheduled deadline state, with no NaN', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p), member(2, 'B', p)]);
  for (const m of run.members) m.lane = run.hazardPlan[0].dangerZones[0];
  advanceRaidRun(run, run.startedAt + 120000);
  assert.equal(run.state, 'failed');
  assert.ok(run.members.every(m => m.hp <= 0));
  assert.ok(finiteHp(run));
  const late = applyRaidAction(run, 1, 'strike', { actionId: 'late:strike:1', at: run.updatedAt });
  assert.equal(late.ok, false);
});

t('a strike request cannot block an emergency dodge', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p), member(2, 'B', p)]);
  const h = (advanceRaidRun(run, run.nextHazardAt + 1), run.hazard);
  assert.ok(h);
  const safe = RAID_RULES.lanes.find(z => !h.dangerZones.includes(z));
  const strike = applyRaidAction(run, 1, 'strike', { actionId: 'attack:first:1', at: h.startsAt + 100 });
  assert.equal(strike.ok, true);
  const dodge = applyRaidAction(run, 2, 'dodge', { actionId: 'dodge:emergency:1', at: h.startsAt + 200, zone: safe });
  assert.equal(dodge.ok, true, dodge.error || '');
  const resolved = applyRaidAction(run, 2, 'strike', { actionId: 'after:dodge:1', at: h.endsAt + 1 });
  assert.equal(resolved.ok, true);
  assert.ok(run.members[1].dodges >= 1, 'the emergency dodge earned its credit');
  assert.equal(run.members[1].hp, run.members[1].maxHp, 'a clean dodge took no hazard damage');
});

t('the deadline is enforced at its fixed timestamp, not at request arrival', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p)]);
  // Keep every hazard in a lane nobody occupies, so the only end state is the fixed deadline.
  run.hazardPlan = Array.from({ length: 96 }, () => ({ dangerZones: ['left'], kind: 'fracture-slam' }));
  for (const m of run.members) m.lane = 'center';
  const deadline = run.deadlineAt;
  advanceRaidRun(run, deadline + 999999);
  assert.equal(run.state, 'failed');
  assert.equal(run.finishedAt, deadline);
});

t('action ids are idempotent and receipts survive 65 accepted actions', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p)]);
  run.hazardPlan = Array.from({ length: 96 }, () => ({ dangerZones: ['left'], kind: 'fracture-slam' }));
  run.members[0].lane = 'center';
  let at = run.startedAt + 4000, lastAt = at;
  for (let i = 0; i < 65; i++) {
    lastAt = at;
    const r = applyRaidAction(run, 1, 'strike', { actionId: 'receipt:strike:' + i, at });
    assert.equal(r.ok, true, r.error || '');
    at += RAID_RULES.strikeCooldownMs;
    if (run.state !== 'active') break;
  }
  const accepted = run.members[0].actionReceipts.length;
  assert.ok(accepted >= 60, 'receipts are retained for the run: ' + accepted);
  const damage = run.members[0].damage;
  const replay = applyRaidAction(run, 1, 'strike', { actionId: 'receipt:strike:0', at: lastAt });
  assert.equal(replay.ok, true);
  assert.equal(replay.duplicate, true);
  assert.equal(run.members[0].damage, damage, 'a duplicate never applies damage twice');
  const restored = sanitizeRaidRun(JSON.parse(JSON.stringify(run)));
  assert.ok(restored);
  assert.equal(restored.members[0].actionReceipts.length, accepted);
});

t('simultaneous mechanic deadlines resolve once and never double-charge a lane', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p), member(2, 'B', p)]);
  const h = (advanceRaidRun(run, run.nextHazardAt + 1), run.hazard);
  assert.ok(h);
  const hpBefore = run.members.map(m => m.hp);
  // Two requests at the same server millisecond: a strike, then a snapshot.
  const a = applyRaidAction(run, 1, 'strike', { actionId: 'simultaneous:a:1', at: h.endsAt });
  const b = applyRaidAction(run, 2, 'ward', { actionId: 'simultaneous:b:1', targetId: 1, at: h.endsAt });
  assert.ok(a.ok || run.state !== 'active');
  assert.ok(b.ok || run.state !== 'active');
  assert.equal(run.hazard, null);
  assert.ok(run.members.every((m, i) => m.hp <= hpBefore[i]), 'resolution only removes HP');
  assert.ok(finiteHp(run));
});

t('public state is serialisable and carries schedule/cooldown data for local countdowns', () => {
  const p = profile('Warlock', true);
  const run = baseRun([member(1, 'A', p), member(2, 'B', p)]);
  const pub = raidPublicRun(run, run.startedAt + 1000);
  const text = JSON.stringify(pub);
  const back = JSON.parse(text);
  assert.equal(back.members.length, 2);
  assert.ok(back.members.every(m => Number.isFinite(m.hp) && Number.isFinite(m.maxHp)));
  assert.ok(back.schedule.strikeCooldownMs > 0);
  assert.ok(back.deadlineAt > back.startedAt);
  for (const m of back.members) assert.ok(Number.isFinite(m.strikeReadyAt));
});

t('a solo and a trio max-gear party can clear before their deadline', () => {
  const p = profile('Lord Knight', false);
  assert.equal(p.dps, 800000);
  for (const size of [1, 3]) {
    const members = Array.from({ length: size }, (_, i) => member(i + 1, 'R' + i, p));
    const totalHp = raidTotalHp(size);
    const run = baseRun(members, {
      totalHp, phaseHps: raidPhaseHp(totalHp),
      deadlineAt: 1000000 + raidDurationSeconds(size) * 1000,
    });
    // Pin the hazard plan away from the party so this measures damage pacing, not dodging.
    run.hazardPlan = Array.from({ length: 96 }, () => ({ dangerZones: ['left'], kind: 'fracture-slam' }));
    for (const m of run.members) m.lane = 'right';
    let at = run.startedAt;
    for (let second = 1; second <= 360 && run.state === 'active'; second++) {
      at = run.startedAt + second * 1000;
      advanceRaidRun(run, at);
      if (run.state !== 'active') break;
      if (second % 5 === 0) {
        for (const m of run.members) {
          applyRaidAction(run, m.id, 'strike', { actionId: 'pace:' + size + ':' + m.id + ':' + second, at });
        }
      }
    }
    assert.equal(run.state, 'cleared', 'size ' + size + ' cleared in ' + Math.round((run.finishedAt - run.startedAt) / 1000) + 's');
    assert.equal(run.hpRemaining, 0);
    assert.ok(run.finishedAt <= run.deadlineAt);
    assert.ok(finiteHp(run));
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
