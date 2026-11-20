// Shared, raid-only tuning. Kept independent of field combat and DigiPet battles.
//
// V1 scope:
//   * one player-character boss encounter for 1-3 characters
//   * two hazard mechanics (one-lane Fracture Slam, two-lane Rift Sweep)
//   * automatic ordinary attacks plus one optional focus strike
//   * weapon stars (client save progression, server-read), three raid cards and earned cosmetics
//
// Every number below is a server rule, not a client hint. Times are absolute milliseconds on the
// server clock. A late action or snapshot may catch up the state, but must never move a deadline or
// a hazard's scheduled resolution later.
export const RAID_RULES = Object.freeze({
  // Owner gate. The Pages handler also requires env.RAID_ENABLED === 'true'. Staging can enable the
  // server flag without changing this default; production stays closed until acceptance.
  enabled: false,
  dailyEntries: 2,
  dayTimeZone: 'Asia/Kuala_Lumpur', // Malaysia calendar day (UTC+08:00, no daylight saving)
  partySizes: Object.freeze([1, 2, 3]),
  totalHpByParty: Object.freeze({ 1: 150_000_000, 2: 360_000_000, 3: 540_000_000 }),
  clearTargetSeconds: Object.freeze({ solo: 300, group: 360 }),
  // Three escort phases share 45% of the pool; the final boss carries the remaining 55%.
  phaseShares: Object.freeze([0.15, 0.15, 0.15, 0.55]),
  phaseNames: Object.freeze(['Fracture scouts', 'Rift heralds', 'Astral sentries', 'The Rift Sovereign']),
  bossArmor: 0.30,
  dpsMin: 12_000,
  dpsMax: 800_000,
  lanes: Object.freeze(['left', 'center', 'right']),
  // Ordinary attacks are automatic. 'strike' is an optional focus attack; it is deliberately a
  // separate request path so an in-flight attack can never block an emergency lane dodge.
  autoAttackMs: 3_000,
  strikeCooldownMs: 5_000,
  strikeDamageSeconds: 2.0,
  // Walking between arena lanes is a server action so hazards resolve against the position the
  // player actually reached. The client sends only when the lane changes, and this small floor
  // stops a jittering pointer from turning into an unbounded stream of writes.
  moveCooldownMs: 250,
  // Hazard schedule is fixed from startedAt. A hazard is visible for tellMs and resolves at
  // startsAt+tellMs even if no request arrives at that exact moment.
  mechanics: Object.freeze({
    firstAtMs: 7_500,
    intervalMs: 9_000,
    tellMs: 1_500,
    slamMaxHpRatio: 0.30,
    dodgeSupportMaxHpRatio: 0.10,
    wardReduction: 0.50,
    sweepPartyChance: 0.35,
  }),
  support: Object.freeze({
    healMaxHpRatio: 0.25,
    healCooldownMs: 18_000,
    wardDurationMs: 30_000,
    wardCooldownMs: 24_000,
    wardSupportMaxHpRatio: 0.05,
    reviveHpRatio: 0.20,
    reviveCooldownMs: 30_000,
  }),
  // Client-side catch-up is bounded. A request that arrives after a long absence replays at most
  // this many auto attacks/hazards, then resumes from the current server time. It never extends the
  // deadline. The normal six-minute run needs fewer events than this.
  maxCatchupEvents: 512,
  // Action receipts are kept for the whole run so a lost response can be retried safely. This is an
  // upper bound well above the ~200 actions a six-minute trio run can produce, not a rolling window.
  maxParty: 3,
  maxActionReceipts: 512,
  // Reward/pity policy retained from the prototype. Card/stars/cosmetics are deferred.
  partyMaterialBonus: Object.freeze({ 1: 0, 2: 0.10, 3: 0.20 }),
  fullClear: Object.freeze({
    riftShards: 10,
    bonusRiftShards: Object.freeze({ chance: 0.50, amount: 10 }),
    sigils: 4,
    bonusSigils: Object.freeze({ chance: 0.25, amount: 4 }),
    regionalMaterials: 2,
    bonusRegionalMaterials: Object.freeze({ chance: 0.25, amount: 2 }),
    zeny: 1_000_000,
  }),
  pityChest: Object.freeze({ riftShards: 10, sigils: 2, regionalMaterials: 1, zeny: 250_000 }),
  fracturedChest: Object.freeze({ riftShards: 5, sigils: 2, regionalMaterials: 1, zeny: 250_000 }),
});

// Account-wide raid cards. One copy is owned per account; duplicate drops add copies and rank the
// card up. Exactly one card may be equipped at a time. Effects are applied when a run starts, so a
// card swap never changes an in-flight encounter.
export const RAID_CARDS = Object.freeze([
  Object.freeze({ key: 'sovereign-fang', name: 'Sovereign Fang', desc: '+3% DPS and +1% defence penetration per rank.' }),
  Object.freeze({ key: 'astral-bulwark', name: 'Astral Bulwark', desc: '+5% max HP and +2% defence penetration per rank.' }),
  Object.freeze({ key: 'herald-vow', name: 'Herald Vow', desc: '+4% max HP and +2% DPS per rank.' }),
]);
export const RAID_CARD_KEYS = Object.freeze(RAID_CARDS.map(c => c.key));
const CARD_RANK_COPIES = Object.freeze([1, 3, 6, 10, 15]);
const CARD_DROPS = Object.freeze({
  clear: Object.freeze(['sovereign-fang', 'sovereign-fang', 'sovereign-fang', 'astral-bulwark', 'herald-vow']),
  fractured: Object.freeze(['astral-bulwark', 'astral-bulwark', 'herald-vow', 'sovereign-fang']),
  pity: Object.freeze(['herald-vow', 'herald-vow', 'astral-bulwark', 'sovereign-fang']),
});

const finite = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Number(n) : fallback);
const integer = (n, fallback = 0) => Math.max(0, Math.floor(finite(n, fallback)));
const unit = rng => Math.max(0, Math.min(0.999999999, finite(rng(), 0)));

export function raidDayKey(at = Date.now()) {
  // Malaysia is UTC+08:00 year-round. Shift before taking the ISO date so the D1 calendar key is
  // independent of the Worker host's timezone and DST settings.
  return new Date(Number(at) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function raidPartySize(value) {
  const n = Math.floor(finite(value, 0));
  return RAID_RULES.partySizes.includes(n) ? n : 0;
}

export function raidTotalHp(partySize) {
  const size = raidPartySize(partySize) || 1;
  return RAID_RULES.totalHpByParty[size];
}

export function raidDurationSeconds(partySize) {
  return (raidPartySize(partySize) || 1) === 1
    ? RAID_RULES.clearTargetSeconds.solo
    : RAID_RULES.clearTargetSeconds.group;
}

export function raidPhaseHp(totalHp) {
  const total = Math.max(1, Math.floor(finite(totalHp, 1)));
  let used = 0;
  return RAID_RULES.phaseShares.map((share, i) => {
    const amount = i === RAID_RULES.phaseShares.length - 1 ? total - used : Math.floor(total * share);
    used += amount;
    return amount;
  });
}

function stackWithPartyBonus(amount, partySize, rng) {
  const size = raidPartySize(partySize) || 1;
  const exact = Math.max(0, amount) * (1 + RAID_RULES.partyMaterialBonus[size]);
  const whole = Math.floor(exact);
  // Fractional party bonuses round stochastically; the server rolls, never the client.
  return whole + (unit(rng) < exact - whole ? 1 : 0);
}

function chestContents(contents, partySize, rng) {
  return {
    riftShards: stackWithPartyBonus(contents.riftShards, partySize, rng),
    sigils: stackWithPartyBonus(contents.sigils, partySize, rng),
    regionalMaterials: stackWithPartyBonus(contents.regionalMaterials, partySize, rng),
    regionalMaterialIndex: 0, // v1 regional rewards are Astral Shards only.
    zeny: contents.zeny,
  };
}

export function rollRaidClear({ partySize = 1, rng = Math.random } = {}) {
  const pool = RAID_RULES.fullClear;
  const baseShards = pool.riftShards + (unit(rng) < pool.bonusRiftShards.chance ? pool.bonusRiftShards.amount : 0);
  const baseSigils = pool.sigils + (unit(rng) < pool.bonusSigils.chance ? pool.bonusSigils.amount : 0);
  const baseRegional = pool.regionalMaterials + (unit(rng) < pool.bonusRegionalMaterials.chance ? pool.bonusRegionalMaterials.amount : 0);
  return { rewards: chestContents({ riftShards: baseShards, sigils: baseSigils, regionalMaterials: baseRegional, zeny: pool.zeny }, partySize, rng) };
}

export function rollPityChest({ partySize = 1, rng = Math.random } = {}) {
  return chestContents(RAID_RULES.pityChest, partySize, rng);
}

export function rollFracturedChest({ partySize = 1, rng = Math.random } = {}) {
  return chestContents(RAID_RULES.fracturedChest, partySize, rng);
}

export function raidMeaningful({ damage = 0, support = 0, maxHp = 0, totalHp = 0, actions = 0 } = {}) {
  const floor = Math.max(1, finite(totalHp, 1) * 0.025);
  const supportFloor = Math.max(1, finite(maxHp, 1) * 0.20);
  return integer(actions) >= 1 && (finite(damage) >= floor || finite(support) >= supportFloor);
}

export function raidCardRank(copies) {
  const n = integer(copies);
  let rank = 0;
  for (const need of CARD_RANK_COPIES) if (n >= need) rank++;
  return rank;
}

export function raidCardByKey(key) {
  return RAID_CARDS.find(c => c.key === key) || null;
}

export function rollRaidCard({ kind = 'clear', rng = Math.random } = {}) {
  const pool = CARD_DROPS[kind] || CARD_DROPS.clear;
  const key = pool[Math.min(pool.length - 1, Math.floor(unit(rng) * pool.length))];
  return RAID_CARDS.find(c => c.key === key);
}

export const raidRuleSummary = () => ({
  dailyEntries: RAID_RULES.dailyEntries,
  dayTimeZone: RAID_RULES.dayTimeZone,
  totalHpByParty: RAID_RULES.totalHpByParty,
  clearTargetSeconds: RAID_RULES.clearTargetSeconds,
  phaseNames: RAID_RULES.phaseNames,
  partyMaterialBonus: RAID_RULES.partyMaterialBonus,
  fullClear: RAID_RULES.fullClear,
  pityChest: RAID_RULES.pityChest,
  fracturedChest: RAID_RULES.fracturedChest,
  mechanics: RAID_RULES.mechanics,
  support: RAID_RULES.support,
  bossArmor: RAID_RULES.bossArmor,
  cards: RAID_CARDS,
  cardRankCopies: CARD_RANK_COPIES,
});
