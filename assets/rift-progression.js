/* Rift weapon stars and raid-card tuning shared by the field sheet and the raid client.
 *
 * Stars are an account/character-level weapon upgrade paid with Rift Shards. A star never
 * disappears on a failed attempt. Every star adds ATK% in *all* content, and also adds defence
 * penetration against Thanatos and the dungeon's anchors (the raid profile converts it into
 * `armorPen`, capped at the 16% boss armour).
 */
(function (root) {
  'use strict';
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const int = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Math.floor(Number(n)) : fallback);

  const STARS = Object.freeze({
    max: 20,
    atkPctPerStar: 2,
    penPctPerStar: 1.5,
    penCapPct: 30,
    baseShardCost: 8,
    shardCostStep: 2,
    // Three optional deposits. Exactly one may be selected per attempt; the extra shards are
    // consumed with the base cost and the success chance is raised by the listed percentage points.
    boosters: Object.freeze([
      Object.freeze({ id: 0, name: 'Standard', extraShards: 0, chance: 0, note: 'No extra shards' }),
      Object.freeze({ id: 1, name: 'Steady', extraShards: 5, chance: 10, note: '+10% success' }),
      Object.freeze({ id: 2, name: 'Charged', extraShards: 12, chance: 24, note: '+24% success' }),
      Object.freeze({ id: 3, name: 'Overload', extraShards: 24, chance: 42, note: '+42% success' }),
    ]),
  });

  function starsOf(item) {
    return clamp(int(item && item.stars, 0), 0, STARS.max);
  }

  function atkPct(item) {
    return starsOf(item) * STARS.atkPctPerStar;
  }

  function atkMultiplier(item) {
    return 1 + atkPct(item) / 100;
  }

  function armorPen(item) {
    return clamp(starsOf(item) * STARS.penPctPerStar / 100, 0, STARS.penCapPct / 100);
  }

  function starCost(star) {
    return STARS.baseShardCost + Math.floor(clamp(int(star, 0), 0, STARS.max) / 2) * STARS.shardCostStep;
  }

  // A high start keeps the first few stars friendly; the last stars are a long Rift-Shard project.
  function baseChance(star) {
    const s = clamp(int(star, 0), 0, STARS.max);
    return clamp(92 - s * 3.8, 18, 92);
  }

  function boosterById(id) {
    return STARS.boosters.find(b => b.id === clamp(int(id, 0), 0, 3)) || STARS.boosters[0];
  }

  function quote(star, boosterId = 0) {
    const s = clamp(int(star, 0), 0, STARS.max);
    const booster = boosterById(boosterId);
    const cost = starCost(s);
    const maxed = s >= STARS.max;
    return {
      star: s,
      nextStar: Math.min(STARS.max, s + 1),
      maxed,
      booster,
      baseCost: cost,
      extraCost: booster.extraShards,
      totalCost: maxed ? 0 : cost + booster.extraShards,
      baseChance: baseChance(s),
      chance: maxed ? 0 : clamp(baseChance(s) + booster.chance, 0, 98),
    };
  }

  function roll(quoteOrStar, boosterId = 0, rng = Math.random) {
    const q = quoteOrStar && typeof quoteOrStar === 'object' && 'chance' in quoteOrStar
      ? quoteOrStar : quote(quoteOrStar, boosterId);
    if (q.maxed) return { success: false, chance: 0, maxed: true };
    return { success: rng() * 100 < q.chance, chance: q.chance, maxed: false };
  }

  const api = { STARS, starsOf, atkPct, atkMultiplier, armorPen, starCost, baseChance, boosterById, quote, roll };
  root.RiftProgression = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis === 'object' ? globalThis : this);
