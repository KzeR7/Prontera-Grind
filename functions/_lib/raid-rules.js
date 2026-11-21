// Shared, raid-only tuning for the four-stage Astral dungeon (haven-v449).
//
// The raid is a real dungeon inside the normal game viewport: three mob-clearing maps and one
// Thanatos boss arena, played with the player's own character, equipment, class skills and automatic
// combat. The numbers below are the server's rules, not client hints.
//
// Every timestamp is absolute server milliseconds. A late request may catch the run up to the
// current server time; nothing here may move a deadline, a spawn time or a mechanic's resolution
// later than the schedule it was installed with.
//
// Cost note: the encounter is request-driven. Mechanics resolve from their scheduled timestamps when
// any request arrives, so there is no alarm and no tick table. There IS a recurring request, and it
// must not be described away: a CO-OP client polls its room once every 2 s while its own run is active
// and the tab is visible, because the room owns that simulation and a teammate's revive hold or a
// stage transition is not carried by the plaza socket. A SOLO run makes no recurring request at all --
// it is simulated in the browser (see docs/RIFT-RAID-VALIDATION.md for both measurements).

// The rules version is part of a run's identity, not a display string. A solo checkpoint is scoped by
// it (a browser that saved under different numbers must not resume under these), and settlement
// records which rules paid a run. Bump it whenever a number below changes in a way that alters a
// fight; do not bump it for a comment or a rename.
export const RAID_RULES_VERSION = 'v449-r1';

export const RAID_RULES = Object.freeze({
  // Owner gate. The Pages handler also requires env.RAID_ENABLED === 'true'. Staging may enable the
  // server flag without changing this default; production stays closed until acceptance.
  enabled: false,
  dailyEntries: 2,
  dayTimeZone: 'Asia/Kuala_Lumpur', // Malaysia calendar day (UTC+08:00, no daylight saving)
  partySizes: Object.freeze([1, 2, 3]),

  // ---- run shape -------------------------------------------------------------------------------
  // Four stages, played in order. A solo run is budgeted at ~7.0 min of pure clearing, which leaves
  // room inside an 8-minute target once a real player walks between packs and dodges.
  stages: Object.freeze([
    Object.freeze({ id: 1, key: 'approach', name: 'Starlit Approach', subtitle: 'Floating bridge · broken arches', targetSeconds: 52, budgetSeconds: 52 }),
    Object.freeze({ id: 2, key: 'arcade', name: 'Fallen Arcade', subtitle: 'Ruined platform · rift anchors', targetSeconds: 67, budgetSeconds: 67 }),
    Object.freeze({ id: 3, key: 'observatory', name: 'Runic Observatory', subtitle: 'Ritual circle · elite waves', targetSeconds: 67, budgetSeconds: 67 }),
    Object.freeze({ id: 4, key: 'sanctuary', name: "Thanatos's Sanctuary", subtitle: 'The named boss', targetSeconds: 240, budgetSeconds: 240 }),
  ]),
  // A run that runs out of time is not instantly lost: the party may finish the current stage.
  graceSeconds: 45,
  // The boss stage adds its own walk-in and the time the rituals steal from the damage rotation, so
  // its clock is the 240 s objective plus this allowance rather than the generic grace.
  bossStageGraceSeconds: 120,
  // One meaningful mechanic roughly every 15-22 seconds. Never two hazards at once.
  // The player-facing mechanic gap. One mechanic, then a 2 s aftermath, so the gap the party feels is
  // exactly this window (15-22 s) rather than the window plus the last telegraph.
  mechanicGapMs: Object.freeze({ min: 15_000, max: 22_000 }),
  aftermathMs: 1_600,

  // ---- enemies ---------------------------------------------------------------------------------
  // Enemy HP is a *sum* target for the whole party: it already includes the party-size scaling, so
  // the objective does not silently take three times as long with three players. Every enemy's
  // profile comes from the server-side class snapshot (raid-profile.js); the client only ever
  // reports intent.
  combat: Object.freeze({
    // The field's own swing cadence is `aspd()`, which floors at 130 ms and lands around 270-850 ms
    // for a real build. This was 2,600 ms - ten times slower than the field it is supposed to feel
    // like - which is the whole of "attack is sloggy". Damage per swing is scaled from this interval
    // (dps * interval), so shortening it does not change clear time; it only changes how often the
    // character visibly swings.
    playerAutoAttackMs: 420,
    playerCritChance: 0.18,
    playerCritMultiplier: 1.6,
    skillEveryMs: 2_400,             // an automatic class-skill swing; alternates physical/magic flavour
    skillMultiplier: 2.35,
    petEveryMs: 3_400,
    petMultiplier: 0.22,
    enemyAttackMs: 2_900,
    enemyWindupMs: 520,
    // Incoming damage is a share of max HP per hit, never a party-size multiplier: a trio takes the
    // same per-player damage as a solo player, so the extra players are extra safety, not extra risk.
    // At most two enemies can be on one member at a time, which keeps a crowded pack readable.
    maxAttackersPerMember: 2,
    enemyHitMaxHpRatio: 0.014,
    bossHitMaxHpRatio: 0.019,
    // The dungeon's own recovery: a slow trickle so a careful solo player can finish seven minutes
    // of attrition, and a short rest at every stage portal.
    regenMaxHpPerSecond: 0.005,
    restHealRatio: 0.30,
    // Enemy attack reach by shape. Ranged enemies stop further out, so a melee and a magic character
    // are not forced through the same approach.
    reachMelee: 1.55,
    reachRanged: 3.6,
    playerReachBonus: 0.35,
    // The party always enters at the stage entrance, out of range of the pack. The first swing is seeded
    // this far after spawn, so it is owed from a position the member can actually attack from. Paying it
    // from spawn made the opening damage depend on how far a single read had already walked.
    spawnReachMs: 2_000,
    // The party always enters a stage at the entrance, out of range of its objective. The first swing is
    // owed this far after the stage starts, which is the same instant for every read cadence and late
    // enough that the member has walked into reach. Arming off the walk instead (or off the clock at
    // spawn) made the number of opening swings depend on the polling rate.
    openArmMs: 2_600,
  }),

  // ---- objective scaling -----------------------------------------------------------------------
  // The whole stage's enemy HP is one number for the party. Party damage is measured from the real
  // snapshots when the run starts, so a trio with three well-geared characters does not take three
  // times as long, and a duo of weak characters is not walled out.
  scaling: Object.freeze({
    // Measured against the game's own drop formula (index.html genGear), not guessed: a
    // Nightmare/Abyss N+ set at Lv150 with +20 stars lands at ~18k DPS, and a fresh map-2 character
    // sits at the dpsMin floor of 12k. Earlier numbers here assumed ~120k and were never achievable,
    // which is why the objective schedule below is a duration rather than a raw multiplier.
    referenceDps: 18_000,
    minClearSeconds: 40,        // never shorter than this, however strong the party is
    // The floor-save party (dpsMin) may take the stage's whole budget minus the grace, never more:
    // an objective that outlives its own stage timer is an unwinnable stage, not a hard one.
    maxClearSeconds: 92,        // 52 s target + 45 s grace, less a walk-in
    bossMinClearSeconds: 200,
    bossMaxClearSeconds: 240,
    // Objective workload (anchors, ritual sources) uses the party's measured damage, not its size.
    anchorsSolo: 2, anchorsPerExtra: 0,
    ritualSourcesSolo: 2, ritualSourcesPerExtra: 0,
  }),

  // ---- stage objectives ------------------------------------------------------------------------
  // Packs are logical: the client places them on the real map geometry, the server owns how much HP
  // each pack has and when it is dead. A stage is cleared when every required enemy is dead; the
  // exit portal only opens then.
  packSizes: Object.freeze({ 1: 5, 2: 7, 3: 8 }),
  // Stage 1: three packs on the bridge, then the exit.
  // Stage 2: guards plus two rift anchors that heal the guards until they are destroyed.
  // Stage 3: elite waves plus two ritual sources; a ritual that survives its channel completes a
  //          lethal arena channel, killing it interrupts the channel and opens a damage window.
  // Stage 4: Thanatos.
  // The boss keeps a real armour step, but it is small enough that a starless weapon is not a wall:
  // a full-clear run must be winnable without any Forge progression.
  bossArmor: 0.16,
  dpsMin: 12_000,
  dpsMax: 800_000,
  maxParty: 3,
  maxActionReceipts: 512,
  maxCatchupEvents: 60_000,

  // ---- movement ---------------------------------------------------------------------------------
  // Movement is a destination, not a stream of positions: the client sends an intent when the player
  // changes where they are going or which enemy they are focusing. The server owns the walk and
  // validates the destination against the stage's walkable bounds.
  moveMinIntervalMs: 220,
  walkSpeed: 9.6,                // world units/second, the field's own feel
  // The dungeon keeps the field's automatic chase: with no manual input the server walks a member
  // toward their focus target, stopping at their class's reach. A manual destination overrides the
  // chase for `manualHoldMs` (and until it is reached). The chase is refused while the direct line
  // would cross an active danger zone, so auto-targeting can never drag a player back into a
  // telegraph they just walked out of.
  manualHoldMs: 2_500,
  autoApproach: true,
  // Client-side interpolation runs at 60 fps locally; nothing about it is networked.

  // ---- mechanics -------------------------------------------------------------------------------
  soulCleave: Object.freeze({
    tellMs: 4_000,               // four seconds of warning, outline + countdown
    length: 22, halfWidth: 2.6,  // the cone/strip footprint in world units
    damageMaxHpRatio: 0.34,
    cooldownMs: 17_000,
  }),
  cataclysm: Object.freeze({
    tellMs: 5_000,               // five seconds; the safe ward is reachable on foot
    safeRadius: 3.4,
    damageMaxHpRatio: 0.45,
    cooldownMs: 31_000,
  }),
  ritual: Object.freeze({
    // Triggered by boss HP fraction, once each.
    triggers: Object.freeze([0.70, 0.35]),
    channelMs: 16_000,
    // A source's health is a share of the *party's* boss DPS, not of the boss's 240 s health pool:
    // two sources at 6 s of party damage each are 12 s of focus inside a 16 s channel, so a party
    // that ignores the boss and shoots the sources interrupts the ritual at any gear level.
    sourceSeconds: 6,
    failDamageMaxHpRatio: 0.30,
    successWindowMs: 9_000,      // a damage window after an interrupt, never longer
    damageWindowMultiplier: 1.35,
    sourceReachRanged: 3.2,
  }),
  enrageHpFraction: 0.25,        // below this, mechanics come back faster and hit harder
  enrage: Object.freeze({ cooldownScale: 0.78, damageScale: 1.15 }),

  // ---- down, revive, wipe ----------------------------------------------------------------------
  // A downed member is out of the fight but not out of the run: any *living* teammate can revive
  // them by walking to them. In solo play a down ends the run (there is nobody to help), and the
  // client says so before the first mechanic.
  reviveHoldMs: 2_600,
  reviveHpRatio: 0.35,
  reviveRange: 3.2,
  downBleedMs: 60_000,
  wipeRule: 'all-downed',

  // ---- rewards ---------------------------------------------------------------------------------
  // Unchanged from the previous build unless a stage-clear bonus applies. The dungeon pays a full
  // clear; a stage-1..3 failure pays the pity chest, a stage-4 failure the fractured chest.
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

export const RAID_STAGES = RAID_RULES.stages;
export const RAID_STAGE_KEYS = Object.freeze(RAID_STAGES.map(s => s.key));

// Account-wide raid cards. One copy is owned per account; duplicate drops add copies and rank the
// card up. Exactly one card may be equipped at a time. Effects are applied when a run starts, so a
// card swap never changes an in-flight run.
export const RAID_CARDS = Object.freeze([
  Object.freeze({ key: 'sovereign-fang', name: 'Sovereign Fang', desc: '+3% DPS and +1% defence penetration per rank.' }),
  Object.freeze({ key: 'astral-bulwark', name: 'Astral Bulwark', desc: '+5% max HP and +2% defence penetration per rank.' }),
  Object.freeze({ key: 'herald-vow', name: 'Herald Vow', desc: '+4% max HP and +2% DPS per rank.' }),
]);
export const RAID_CARD_KEYS = Object.freeze(RAID_CARDS.map(c => c.key));
const CARD_RANK_COPIES = Object.freeze([1, 3, 6, 10, 15]);
const CARD_DROPS = Object.freeze({
  clear: 1, fractured: 0.85, pity: 1,
});

export const finite = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Number(n) : fallback);
const integer = (n, fallback = 0) => Math.max(0, Math.floor(finite(n, fallback)));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function raidPartySize(value) {
  const size = Math.floor(finite(value, 1));
  return RAID_RULES.partySizes.includes(size) ? size : 1;
}

export function raidStage(id) {
  const stage = RAID_STAGES.find(s => s.id === Math.floor(finite(id, 0)));
  return stage || null;
}

export function raidStageIndex(key) {
  return RAID_STAGES.findIndex(s => s.key === key);
}

// The Malaysia calendar day key used by the entry cap and the chest ledger.
export function raidDayKey(at = Date.now()) {
  const shifted = new Date(finite(at, Date.now()) + 8 * 3600_000);
  return shifted.toISOString().slice(0, 10);
}

// Total enemy HP for one stage, from the party's measured damage. The budget is the stage's target
// seconds times the party's combined damage per second, clamped on both sides so no party clears a
// stage outside a sane window. This is the *sum over every required enemy* in that stage.
export function stageEnemyHp(stageId, partyDps, options = {}) {
  const stage = raidStage(stageId);
  if (!stage) return 0;
  const dps = clamp(finite(partyDps, 0), 12_000, RAID_RULES.dpsMax * RAID_RULES.maxParty);
  const seconds = clamp(finite(options.seconds, stage.targetSeconds),
    options.boss ? RAID_RULES.scaling.bossMinClearSeconds : RAID_RULES.scaling.minClearSeconds,
    options.boss ? RAID_RULES.scaling.bossMaxClearSeconds : RAID_RULES.scaling.maxClearSeconds);
  return Math.max(1, Math.round(dps * seconds));
}

// Party-size objective workload. Deliberately flat: a solo player never needs a second person to
// complete a mandatory mechanic, so the count of anchors/sources is the same alone or in a trio.
export function stageWorkload(stageId) {
  const stage = raidStage(stageId);
  if (!stage) return { packs: 0, anchors: 0, ritualSources: 0, required: 0 };
  if (stage.id === 2) return { packs: 0, anchors: RAID_RULES.scaling.anchorsSolo, ritualSources: 0, required: RAID_RULES.scaling.anchorsSolo };
  if (stage.id === 3) return { packs: 2, anchors: 0, ritualSources: RAID_RULES.scaling.ritualSourcesSolo, required: 2 };
  return { packs: RAID_RULES.packSizes[stage.id] ? Math.ceil(RAID_RULES.packSizes[stage.id] / 2) : 0, anchors: 0, ritualSources: 0, required: 0 };
}

// One deterministic reward roll. `rng` is injected so tests can pin the outcome; production passes
// Math.random. The shape is the ledger payload, not a grant.
export function rollRaidClear({ partySize = 1, rng = Math.random } = {}) {
  const size = raidPartySize(partySize);
  const bonus = RAID_RULES.partyMaterialBonus[size] || 0;
  const c = RAID_RULES.fullClear;
  const rewards = {
    riftShards: c.riftShards,
    sigils: c.sigils,
    regionalMaterials: c.regionalMaterials,
    zeny: c.zeny,
  };
  if (rng() < c.bonusRiftShards.chance) rewards.riftShards += c.bonusRiftShards.amount;
  if (rng() < c.bonusSigils.chance) rewards.sigils += c.bonusSigils.amount;
  if (rng() < c.bonusRegionalMaterials.chance) rewards.regionalMaterials += c.bonusRegionalMaterials.amount;
  if (bonus > 0) {
    rewards.sigils = Math.round(rewards.sigils * (1 + bonus));
    rewards.regionalMaterials = Math.round(rewards.regionalMaterials * (1 + bonus));
  }
  rewards.ascMat0 = rewards.regionalMaterials;
  rewards.ascMat2 = rewards.sigils;
  return { rewards, partyBonus: bonus };
}

export function rollPityChest({ partySize = 1, rng = Math.random } = {}) {
  const size = raidPartySize(partySize);
  const bonus = RAID_RULES.partyMaterialBonus[size] || 0;
  const c = RAID_RULES.pityChest;
  const rewards = { riftShards: c.riftShards, sigils: c.sigils, regionalMaterials: c.regionalMaterials, zeny: c.zeny };
  if (bonus > 0) {
    rewards.sigils = Math.round(rewards.sigils * (1 + bonus));
    rewards.regionalMaterials = Math.round(rewards.regionalMaterials * (1 + bonus));
  }
  rewards.ascMat0 = rewards.regionalMaterials;
  rewards.ascMat2 = rewards.sigils;
  return { rewards, partyBonus: bonus };
}

export function rollFracturedChest({ partySize = 1, rng = Math.random } = {}) {
  const size = raidPartySize(partySize);
  const bonus = RAID_RULES.partyMaterialBonus[size] || 0;
  const c = RAID_RULES.fracturedChest;
  const rewards = { riftShards: c.riftShards, sigils: c.sigils, regionalMaterials: c.regionalMaterials, zeny: c.zeny };
  if (bonus > 0) {
    rewards.sigils = Math.round(rewards.sigils * (1 + bonus));
    rewards.regionalMaterials = Math.round(rewards.regionalMaterials * (1 + bonus));
  }
  rewards.ascMat0 = rewards.regionalMaterials;
  rewards.ascMat2 = rewards.sigils;
  return { rewards, partyBonus: bonus };
}

export function rollRaidCard({ kind = 'clear', rng = Math.random } = {}) {
  const chance = CARD_DROPS[kind] ?? 0;
  if (!(rng() < chance)) return null;
  const index = Math.min(RAID_CARDS.length - 1, Math.floor(rng() * RAID_CARDS.length));
  const card = RAID_CARDS[index];
  return { key: card.key, name: card.name };
}

export function raidCardRank(copies) {
  const n = integer(copies);
  let rank = 0;
  for (const need of CARD_RANK_COPIES) if (n >= need) rank++;
  return rank;
}

// A member contributes when they actually fought: either damage or support above a floor derived
// from the party's total HP. `actions` is the count of *paid* actions (a walk is intent, not work).
export function raidMeaningful({ damage = 0, support = 0, maxHp = 0, totalHp = 0, actions = 0 } = {}) {
  const floor = Math.max(1, finite(totalHp, 1) * 0.02);
  const supportFloor = Math.max(1, finite(maxHp, 1) * 0.20);
  return integer(actions) >= 1 && (finite(damage) >= floor || finite(support) >= supportFloor);
}

// The rule summary the client shows before entry, and the shape the UI is built from.
// The run's own clock, in one place so the API and the engine can never disagree: every stage budget
// plus that stage's allowance (the boss stage carries a longer one for its walk-in and rituals).
export function raidRunSeconds() {
  return RAID_STAGES.reduce((sum, stage) => {
    const grace = stage.key === 'sanctuary' ? RAID_RULES.bossStageGraceSeconds : RAID_RULES.graceSeconds;
    return sum + stage.budgetSeconds + grace;
  }, 0);
}

export function raidStageSeconds(stageKey) {
  const stage = RAID_STAGES.find(s => s.key === stageKey) || RAID_STAGES[0];
  const grace = stage.key === 'sanctuary' ? RAID_RULES.bossStageGraceSeconds : RAID_RULES.graceSeconds;
  return stage.budgetSeconds + grace;
}

export function raidRuleSummary() {
  return {
    dailyEntries: RAID_RULES.dailyEntries,
    dayTimeZone: RAID_RULES.dayTimeZone,
    stages: RAID_STAGES.map(s => ({ id: s.id, key: s.key, name: s.name, subtitle: s.subtitle, targetSeconds: s.targetSeconds })),
    partySizes: [...RAID_RULES.partySizes],
    graceSeconds: RAID_RULES.graceSeconds,
    bossArmor: RAID_RULES.bossArmor,
    mechanics: Object.freeze({
      soulCleaveTellMs: RAID_RULES.soulCleave.tellMs,
      cataclysmTellMs: RAID_RULES.cataclysm.tellMs,
      cataclysmSafeRadius: RAID_RULES.cataclysm.safeRadius,
      ritualTriggers: [...RAID_RULES.ritual.triggers],
      ritualChannelMs: RAID_RULES.ritual.channelMs,
      reviveHoldMs: RAID_RULES.reviveHoldMs,
      downBleedMs: RAID_RULES.downBleedMs,
    }),
    combat: Object.freeze({
      playerAutoAttackMs: RAID_RULES.combat.playerAutoAttackMs,
      skillEveryMs: RAID_RULES.combat.skillEveryMs,
      enemyAttackMs: RAID_RULES.combat.enemyAttackMs,
    }),
    rewards: {
      fullClear: { ...RAID_RULES.fullClear },
      fracturedChest: { ...RAID_RULES.fracturedChest },
      pityChest: { ...RAID_RULES.pityChest },
    },
    wipeRule: RAID_RULES.wipeRule,
  };
}
