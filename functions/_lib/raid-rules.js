// Shared, raid-only tuning rules. Kept independent of field combat and DigiPet battles.
// The values marked provisional are initial tuning baselines; they can be adjusted without
// changing the ledger protocol or reinterpreting existing raid records.
export const RAID_RULES = Object.freeze({
  dailyEntries: 2,
  dayTimeZone: 'Asia/Kuala_Lumpur', // Malaysia calendar day (UTC+08:00; no daylight saving)
  totalHpByParty: Object.freeze({ 1: 150_000_000, 2: 360_000_000, 3: 540_000_000 }),
  clearTargetSeconds: Object.freeze({ solo: 300, group: 360 }),
  // Three escort phases share 45% of the total pool; the final boss carries the remaining 55%.
  phaseShares: Object.freeze([0.15, 0.15, 0.15, 0.55]),
  phaseNames: Object.freeze(['Fracture scouts', 'Rift heralds', 'Astral sentries', 'The Rift Sovereign']),
  partyMaterialBonus: Object.freeze({ 1: 0, 2: 0.10, 3: 0.20 }),
  fullClear: Object.freeze({
    riftShards: 10,
    bonusRiftShards: Object.freeze({ chance: 0.50, amount: 10 }),
    sigils: 4,
    bonusSigils: Object.freeze({ chance: 0.25, amount: 4 }),
    regionalMaterials: 2,
    bonusRegionalMaterials: Object.freeze({ chance: 0.25, amount: 2 }),
    zeny: 1_000_000,
    cardChance: 0.05, // provisional; party size never changes this roll
    cardPityClears: 30,
  }),
  // Both chest paths are repeatable. Every failed attempt pays its Pity Chest; every timed
  // boss kill pays a Fractured Chest. The Pity Shard amount is raised to 10 so a day with one
  // clear and one failure earns about 30 Rift Shards (20 clear + 10 pity), near the 20–30 day
  // 20★ target; two clears earn about 40/day. All other quantities remain tunable proposals.
  pityChest: Object.freeze({ riftShards: 10, sigils: 2, regionalMaterials: 1, zeny: 250_000 }),
  fracturedChest: Object.freeze({ riftShards: 5, sigils: 2, regionalMaterials: 1, zeny: 250_000 }),
  meaningful: Object.freeze({ damageRatio: 0.025, supportMaxHpRatio: 0.20, actionCount: 1, wipeProgressRatio: 0.25 }),
  mechanics: Object.freeze({ tellMs: 1_500, intervalMs: 9_000, dodgeWindowMs: 1_500, slamMaxHpRatio: 0.30, downedAtHp: 0 }),
  support: Object.freeze({ healMaxHpRatio: 0.25, healCooldownMs: 18_000, wardReduction: 0.50, wardCooldownMs: 24_000, lifelineMaxHpRatio: 0.20, reviveHpRatio: 0.20, reviveCooldownMs: 30_000 }),
  card: Object.freeze({
    name: 'Rift Sovereign Card',
    // Rank 0 is no copy and grants no penetration; ranks 1–4 unlock at 1 / 2 / 5 / 10 copies.
    armorPenByRank: Object.freeze([0, 0.05, 0.09, 0.12, 0.15]),
    copiesForRank: Object.freeze([0, 1, 2, 5, 10]),
  }),
  weaponAddon: Object.freeze({ mythicOnly: true, maxStars: 20, atkPerStar: 0.01, raidArmorPenPerStar: 0.005, raidArmorPenCap: 0.10 }),
  // Presentation metadata is shared by the Map wardrobe and the Social/field renderers; it never
  // changes combat stats. Palette colors are kept as literal six-digit values for safe look relay.
  aura: Object.freeze([
    Object.freeze({ clears: 15, id: 'fracture-spark', name: 'Fracture Spark', color: '#ff986b', pattern: 'compass' }),
    Object.freeze({ clears: 40, id: 'broken-orbit', name: 'Broken Orbit', color: '#c687ff', pattern: 'arcane' }),
    Object.freeze({ clears: 80, id: 'astral-mantle', name: 'Astral Mantle', color: '#72e6ff', pattern: 'sunburst' }),
    Object.freeze({ clears: 150, id: 'event-horizon', name: 'Event Horizon', color: '#ffe28a', pattern: 'sunburst' }),
  ]),
  titles: Object.freeze([
    Object.freeze({ id: 'riftbreaker', name: 'Riftbreaker', rule: 'first-clear', color: '#ffd08a' }),
    Object.freeze({ id: 'rift-veteran', name: 'Rift Veteran', rule: 'clears', value: 25, color: '#a8d8ff' }),
    Object.freeze({ id: 'rift-sovereign', name: 'Rift Sovereign', rule: 'clears', value: 100, color: '#d4adff' }),
    Object.freeze({ id: 'lone-star', name: 'Lone Star', rule: 'solo-clear', color: '#ffe58c' }),
    Object.freeze({ id: 'triune-oath', name: 'Triune Oath', rule: 'trio-clear', color: '#91ead9' }),
    Object.freeze({ id: 'rift-lifeline', name: 'Rift Lifeline', rule: 'support-clear', color: '#ff9db5' }),
  ]),
  // Derived v1 schedule: ~852.126 expected Rift Shards for 20 stars, including failed tries.
  // Every attempt costs Shards; the third consecutive attempt at one star is guaranteed.
  upgrade: Object.freeze({ maxStars: 20, baseCost: 12, costPerStar: 2, firstChance: 0.95, chanceDropPerStar: 0.02, minChance: 0.55, failuresBeforeGuarantee: 2 }),
});

const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const integer = (n, fallback = 0) => Math.max(0, Math.floor(finite(n, fallback)));
const unit = rng => Math.max(0, Math.min(0.999999999, finite(rng(), 0)));

export function raidDayKey(at = Date.now()) {
  // Malaysia is UTC+08:00 year-round. Shifting before taking the ISO date keeps the
  // D1 calendar-day key independent of the Worker host's timezone and DST settings.
  return new Date(Number(at) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function raidTotalHp(partySize) {
  const size = Math.max(1, Math.min(3, Math.floor(Number(partySize) || 1)));
  return RAID_RULES.totalHpByParty[size];
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
  const size = Math.max(1, Math.min(3, Math.floor(Number(partySize) || 1)));
  const exact = Math.max(0, amount) * (1 + RAID_RULES.partyMaterialBonus[size]);
  const whole = Math.floor(exact);
  return whole + (unit(rng) < exact - whole ? 1 : 0);
}

export function raidCardRank(copies) {
  const n = integer(copies), thresholds = RAID_RULES.card.copiesForRank;
  for (let rank = thresholds.length - 1; rank > 0; rank--) if (n >= thresholds[rank]) return rank;
  return 0;
}

export function raidCardArmorPen(copies) {
  return RAID_RULES.card.armorPenByRank[raidCardRank(copies)];
}

export function raidWeaponArmorPen(stars) {
  const addon = RAID_RULES.weaponAddon;
  return Math.min(addon.raidArmorPenCap, integer(stars) * addon.raidArmorPenPerStar);
}

export function raidWeaponAtkBonus(stars) {
  return Math.min(RAID_RULES.weaponAddon.maxStars, integer(stars)) * RAID_RULES.weaponAddon.atkPerStar;
}

export function rollRaidClear({ partySize = 1, cardPity = 0, rng = Math.random } = {}) {
  const pool = RAID_RULES.fullClear;
  const baseShards = pool.riftShards + (unit(rng) < pool.bonusRiftShards.chance ? pool.bonusRiftShards.amount : 0);
  const baseSigils = pool.sigils + (unit(rng) < pool.bonusSigils.chance ? pool.bonusSigils.amount : 0);
  const baseRegional = pool.regionalMaterials + (unit(rng) < pool.bonusRegionalMaterials.chance ? pool.bonusRegionalMaterials.amount : 0);
  const priorPity = Math.min(pool.cardPityClears - 1, integer(cardPity));
  const cardDrop = priorPity >= pool.cardPityClears - 1 || unit(rng) < pool.cardChance;
  const cardPityAfter = cardDrop ? 0 : Math.min(pool.cardPityClears - 1, priorPity + 1);
  return {
    rewards: {
      riftShards: stackWithPartyBonus(baseShards, partySize, rng),
      sigils: stackWithPartyBonus(baseSigils, partySize, rng),
      regionalMaterials: stackWithPartyBonus(baseRegional, partySize, rng),
      regionalMaterialIndex: 0, // v1 rewards Astral Shards only; never Primal Catalysts.
      zeny: pool.zeny,
      cardCopies: cardDrop ? 1 : 0,
    },
    cardDrop,
    cardPityBefore: priorPity,
    cardPityAfter,
    guaranteedCard: priorPity >= pool.cardPityClears - 1,
  };
}

export function raidCardPityLabel(pity) {
  return `${Math.min(RAID_RULES.fullClear.cardPityClears - 1, integer(pity))}/${RAID_RULES.fullClear.cardPityClears}`;
}

export function raidStarCost(star) {
  const current = Math.max(0, Math.min(RAID_RULES.upgrade.maxStars, Math.floor(Number(star) || 0)));
  return current >= RAID_RULES.upgrade.maxStars ? 0 : RAID_RULES.upgrade.baseCost + RAID_RULES.upgrade.costPerStar * current;
}

export function raidStarChance(star) {
  const current = Math.max(0, Math.min(RAID_RULES.upgrade.maxStars - 1, Math.floor(Number(star) || 0)));
  const u = RAID_RULES.upgrade;
  return Math.max(u.minChance, u.firstChance - u.chanceDropPerStar * current);
}

export function rollRaidStarUpgrade({ star = 0, failures = 0, rng = Math.random } = {}) {
  const current = Math.max(0, Math.min(RAID_RULES.upgrade.maxStars, Math.floor(Number(star) || 0)));
  const streak = integer(failures);
  const cost = raidStarCost(current);
  const chance = current >= RAID_RULES.upgrade.maxStars ? 1 : raidStarChance(current);
  const guaranteed = current < RAID_RULES.upgrade.maxStars && streak >= RAID_RULES.upgrade.failuresBeforeGuarantee;
  const success = current < RAID_RULES.upgrade.maxStars && (guaranteed || unit(rng) < chance);
  return {
    cost,
    chance,
    guaranteed,
    success,
    starBefore: current,
    starAfter: success ? current + 1 : current,
    failuresAfter: success ? 0 : (current >= RAID_RULES.upgrade.maxStars ? streak : streak + 1),
  };
}

export function expectedRaidStarSpend() {
  const u = RAID_RULES.upgrade;
  let total = 0;
  for (let star = 0; star < u.maxStars; star++) {
    const p = raidStarChance(star), q = 1 - p;
    let attempts = 1, miss = q;
    for (let failure = 0; failure < u.failuresBeforeGuarantee; failure++) {
      attempts += miss;
      miss *= q;
    }
    total += raidStarCost(star) * attempts;
  }
  return total;
}

export function raidMeaningful({ damage = 0, support = 0, maxHp = 0, totalHp = 0, actions = 0 } = {}) {
  const floor = Math.max(1, finite(totalHp, 1) * RAID_RULES.meaningful.damageRatio);
  const supportFloor = Math.max(1, finite(maxHp, 1) * RAID_RULES.meaningful.supportMaxHpRatio);
  return integer(actions) >= RAID_RULES.meaningful.actionCount &&
    (finite(damage) >= floor || finite(support) >= supportFloor);
}

export function raidAuraTier(clears) {
  let tier = 0;
  for (const [i, milestone] of RAID_RULES.aura.entries()) if (integer(clears) >= milestone.clears) tier = i + 1;
  return tier;
}

export function raidTitlesFor({ clears = 0, partySize = 1, support = 0, maxHp = 0 } = {}) {
  const unlocked = new Set();
  const count = integer(clears);
  if (count >= 1) unlocked.add('riftbreaker');
  if (count >= 25) unlocked.add('rift-veteran');
  if (count >= 100) unlocked.add('rift-sovereign');
  if (partySize === 1 && count >= 1) unlocked.add('lone-star');
  if (partySize === 3 && count >= 1) unlocked.add('triune-oath');
  if (finite(support) >= Math.max(1, finite(maxHp) * RAID_RULES.support.lifelineMaxHpRatio) && count >= 1) unlocked.add('rift-lifeline');
  return [...unlocked];
}

function partyScaledChestContents(contents, partySize, rng) {
  return {
    riftShards: stackWithPartyBonus(contents.riftShards, partySize, rng),
    sigils: stackWithPartyBonus(contents.sigils, partySize, rng),
    regionalMaterials: stackWithPartyBonus(contents.regionalMaterials, partySize, rng),
    regionalMaterialIndex: 0, // v1 maps all raid materials to Astral Shard (ascensionMat[0])
    zeny: contents.zeny,
    cardCopies: 0,
  };
}

export function rollPityChest({ partySize = 1, rng = Math.random } = {}) {
  return partyScaledChestContents(RAID_RULES.pityChest, partySize, rng);
}

export function rollFracturedChest({ partySize = 1, rng = Math.random } = {}) {
  return partyScaledChestContents(RAID_RULES.fracturedChest, partySize, rng);
}
