// Server-side combat profile for a player character entering the Rift Raid.
//
// WHY THIS EXISTS
// The field game computes ATK/MATK/HP in index.html from live buffs, pets, skill passives, card
// mastery and Ascension state. A Durable Object cannot run index.html, and copying the whole field
// formula would drift silently. This module therefore builds a *documented, class-aware snapshot*
// from the same saved inputs the player sees in the sheet:
//
//   physical power = (4 + BaseLv*2 + main-hand value + off-hand dagger value
//                     + mainStat*1.5 + (DEX + LUK)*0.25)
//                    * class ATK multiplier
//                    * (1 + (equipped ATK% + equipped flat ATK)/100)
//   magic power    = (4 + BaseLv*2 + main-hand value
//                     + INT*1.5 + DEX*0.25)
//                    * class ATK multiplier
//                    * (1 + (equipped MATK% + equipped flat MATK)/100)
//   max HP         = (80 + BaseLv*20 + head value*4 + accessory values*3
//                     + VIT*8 + equipped HP flat) * class HP multiplier
//                    * (1 + equipped HP%/100)
//
// `value` is the item's saved base value with refinement: round(val * (1 + refine*0.15)).
// Katar main-hands use the field game's 1.5 weapon multiplier; an off-hand dagger uses 0.35.
// Equipped affixes and socketed card effects are included. Transient buffs, pets, skill passives,
// Ascension stats, card mastery and field-only multipliers are deliberately excluded so the raid
// snapshot is stable and can be reproduced from the save alone.
//
// The resulting sustained DPS is `round(power * 0.28)`, bounded to 12,000..800,000. The factor
// keeps the endgame reference builds near the 500k post-armor target used by the party HP schedule;
// the cap prevents a hand-edited save from turning into an instant kill. This is still a server-owned
// number: the client never supplies it.
import { unpackSave } from './save-codec.js';
import { RAID_RULES, RAID_CARDS, raidCardRank } from './raid-rules.js';

// Main/ATK/HP/magic are copied from the class rows in index.html (CD, CD4, CDX, CD4X). The balance
// test `player_raid_engine_sim.mjs` checks representative physical and magic builds against this
// table, and `raid_profile_source_sim.mjs` checks every row still matches index.html.
const CLASS_ROWS = [
  ['Novice', 'str', 1, 1, false], ['Swordman', 'str', 1.2, 1.3, false],
  ['Mage', 'int', 1.3, 0.8, true], ['Archer', 'dex', 1.15, 0.9, false],
  ['Thief', 'str', 1.1, 0.95, false], ['Acolyte', 'int', 1.05, 1.05, true],
  ['Merchant', 'str', 1.2, 1.2, false], ['Knight', 'str', 1.5, 1.5, false],
  ['Wizard', 'int', 1.8, 0.85, true], ['Hunter', 'dex', 1.4, 0.95, false],
  ['Assassin', 'str', 1.45, 1, false], ['Priest', 'int', 1.3, 1.1, true],
  ['Blacksmith', 'str', 1.6, 1.4, false], ['Lord Knight', 'str', 1.99, 1.8, false],
  ['High Wizard', 'int', 2.4, 1, true], ['Sniper', 'dex', 1.85, 1.05, false],
  ['Assassin Cross', 'str', 1.9, 1.15, false], ['High Priest', 'int', 1.6813, 1.25, true],
  ['Whitesmith', 'str', 2.01, 1.6, false],
  ['Rune Knight', 'str', 2.1, 1.95, false], ['Warlock', 'int', 2.6, 1.05, true],
  ['Ranger', 'dex', 2, 1.1, false], ['Guillotine Cross', 'str', 2.05, 1.2, false],
  ['Arch Bishop', 'int', 1.8, 1.35, true], ['Mechanic', 'str', 2.15, 1.75, false],
  ['Crusader', 'str', 1.81, 1.7, false], ['Paladin', 'str', 2.35, 2.05, false],
  ['Sage', 'int', 1.68, 0.95, true], ['Scholar', 'int', 2.69, 1.1, true],
  ['Alchemist', 'str', 1.94, 1.35, false], ['Biochemist', 'str', 2.48, 1.55, false],
  ['Monk', 'str', 0.91, 1.25, false], ['Champion', 'str', 1.45, 1.45, false],
  ['Rogue', 'dex', 1.53, 1.05, false], ['Stalker', 'dex', 2.38, 1.2, false],
  ['Bard & Dancer', 'dex', 1.44, 1, true], ['Minstrel & Gypsy', 'dex', 2.03, 1.15, true],
  ['Ninja', 'dex', 2.19, 1.1, false], ['Gunslinger', 'dex', 2.25, 1.05, false],
  ['Royal Guard', 'str', 2.56, 2.25, false], ['Sorcerer', 'int', 2.67, 1.2, true],
  ['Geneticist', 'str', 2.75, 1.7, false], ['Sura', 'str', 1.1, 1.6, false],
  ['Shadow Chaser', 'dex', 1.7, 1.3, false], ['Maestro & Wanderer', 'dex', 1.15, 1.25, true],
  ['Kagerou & Oboro', 'dex', 2.3, 1.3, false], ['Rebellion', 'dex', 1.7, 1.25, false],
];
export const RAID_CLASS_PROFILES = Object.freeze(Object.fromEntries(
  CLASS_ROWS.map(([name, main, atk, hp, magic]) => [name, Object.freeze({ name, main, atk, hp, magic })])
));

const finite = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Number(n) : fallback);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const int = (n, lo = 0, hi = Number.MAX_SAFE_INTEGER) => clamp(Math.floor(finite(n, 0)), lo, hi);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

export function classProfile(name) {
  return RAID_CLASS_PROFILES[name] || RAID_CLASS_PROFILES.Novice;
}

// Decode a stored save blob exactly the way every other server reader does. A packed v4 save has
// tuple items in `inv` and `eq`; reading the raw JSON directly is what made the prototype's bag
// weapon lookup blind to packed inventory.
export function decodeRaidSave(blob) {
  let parsed = null;
  try { parsed = typeof blob === 'string' ? JSON.parse(blob) : blob; } catch { return null; }
  if (!isObj(parsed)) return null;
  return unpackSave(parsed);
}

export function savedItems(save) {
  const out = [];
  const seen = new Set();
  if (isObj(save?.eq)) {
    for (const [slot, item] of Object.entries(save.eq)) {
      if (!isObj(item)) continue;
      const key = item.id == null ? `${slot}:${out.length}` : `id:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...item, _equippedSlot: slot });
    }
  }
  if (Array.isArray(save?.inv)) {
    for (const item of save.inv) {
      if (!isObj(item)) continue;
      const key = item.id == null ? `inv:${out.length}` : `id:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

export function savedWeapons(save) {
  return savedItems(save).filter(item => item.slot === 'weapon' && item.id != null);
}

function itemValue(item) {
  if (!isObj(item)) return 0;
  return Math.round(Math.max(0, finite(item.val, 0)) * (1 + clamp(finite(item.r, 0), 0, 15) * 0.15));
}

function effectsOf(item) {
  const out = [];
  for (const affix of Array.isArray(item?.aff) ? item.aff : []) {
    if (isObj(affix) && typeof affix.k === 'string') out.push({ k: affix.k, v: finite(affix.v, 0) });
  }
  for (const card of Array.isArray(item?.cards) ? item.cards : []) {
    if (isObj(card) && typeof card.stat === 'string' && Number.isFinite(Number(card.v))) {
      out.push({ k: card.stat, v: Number(card.v) });
    }
    for (const effect of Array.isArray(card?.effects) ? card.effects : []) {
      if (isObj(effect) && typeof effect.k === 'string') out.push({ k: effect.k, v: finite(effect.v, 0) });
    }
  }
  return out;
}

export function raidProfileFromSave(save) {
  if (!isObj(save)) return null;
  const cls = typeof save.cls === 'string' ? save.cls : 'Novice';
  const cp = classProfile(cls);
  const lv = int(save.lv, 1, 150);
  const eq = isObj(save.eq) ? save.eq : {};
  const weapon = isObj(eq.weapon) ? eq.weapon : null;
  const off = isObj(eq.off) ? eq.off : null;

  // Total extra points from equipped affixes/cards. An off-hand dagger contributes at the same
  // 0.35 weapon factor the field sheet uses. `hp` is doubled on gear (the sheet's own rule).
  const bonus = {};
  for (const [slot, item] of Object.entries(eq)) {
    if (!isObj(item)) continue;
    const factor = slot === 'off' && item.wt === 'dagger' ? 0.35 : 1;
    for (const { k, v } of effectsOf(item)) {
      bonus[k] = (bonus[k] || 0) + v * factor * (k === 'hp' ? 2 : 1);
    }
  }
  const stat = key => clamp((finite(save.st?.[key], 1) || 1) + (bonus[key] || 0), 1, 500);

  const weaponStars = clamp(int(weapon?.stars, 0), 0, 20);
  const starAtk = 1 + weaponStars * 0.02;
  const offValue = off && off.wt === 'dagger' ? itemValue(off) * 0.35 : 0;
  const mainValue = weapon ? itemValue(weapon) * (weapon.wt === 'katar' ? 1.5 : 1) : 0;
  const atkPct = finite(bonus.atk, 0) + finite(save.pv?.atk, 0);
  const matkPct = finite(bonus.matk, 0) + finite(save.pv?.matk, 0);

  const physicalPower = (4 + lv * 2 + mainValue + offValue + stat(cp.main) * 1.5 + (stat('dex') + stat('luk')) * 0.25)
    * cp.atk * (1 + atkPct / 100) * starAtk;
  // The field sheet reads a staff at 0.8 weapon value because its MATK already includes many
  // class/skill multipliers. The raid snapshot deliberately uses the full weapon value so a magic
  // character is not silently half as strong as a physical one in the same gear band.
  const magicPower = (4 + lv * 2 + mainValue + stat('int') * 1.5 + stat('dex') * 0.25)
    * cp.atk * (1 + matkPct / 100) * starAtk;
  const power = Math.max(0, cp.magic ? magicPower : physicalPower);
  const dps = clamp(Math.round(power * 0.28), 12_000, 800_000);

  const headValue = itemValue(eq.head);
  const accessoryValue = itemValue(eq.acc1) + itemValue(eq.acc2);
  const hpFlat = finite(bonus.hp, 0);
  const hpPct = finite(bonus.hpPct, 0) + finite(save.pv?.hpp, 0);
  const maxHp = clamp(Math.round(
    (80 + lv * 20 + headValue * 4 + accessoryValue * 3 + stat('vit') * 8 + hpFlat) *
    cp.hp * (1 + hpPct / 100)
  ), 1_000, 1_000_000_000);

  return {
    profileVersion: 2,
    cls,
    magic: cp.magic,
    main: cp.main,
    lv,
    sex: save.sex === 'f' || save.sex === 'm' ? save.sex : 'm',
    dps,
    maxHp,
    // Weapon stars are the only persistent defence penetration in the save. Cards add their own
    // penetration when a run starts; the engine caps the combined value at bossArmor.
    armorPen: clamp(weaponStars * 0.015, 0, RAID_RULES.bossArmor),
    weaponStars,
    weaponId: weapon?.id == null ? '' : String(weapon.id).slice(0, 80),
    weaponType: weapon && typeof weapon.wt === 'string' ? weapon.wt.slice(0, 24) : '',
    power: Math.round(power),
    source: 'class-save-snapshot',
  };
}

// Apply exactly one equipped account card to a snapshot. The owner can swap cards freely; only the
// equipped card is read, and only when the next run starts. This function is pure so the API tests
// can assert the effect without D1.
export function applyRaidCard(profile, cards = []) {
  if (!profile) return profile;
  const equipped = (Array.isArray(cards) ? cards : []).find(c => c && (c.equipped === 1 || c.equipped === true));
  if (!equipped) return { ...profile };
  const def = RAID_CARDS.find(c => c.key === equipped.card_key || c.key === equipped.cardKey);
  const copies = int(equipped.copies, 0);
  const rank = raidCardRank(copies);
  if (!def || rank < 1) return { ...profile };
  const out = { ...profile, cardKey: def.key, cardRank: rank };
  if (def.key === 'sovereign-fang') {
    out.dps = Math.round(out.dps * (1 + 0.03 * rank));
    out.armorPen = clamp(finite(out.armorPen, 0) + 0.01 * rank, 0, RAID_RULES.bossArmor);
  } else if (def.key === 'astral-bulwark') {
    out.maxHp = Math.round(out.maxHp * (1 + 0.05 * rank));
    out.armorPen = clamp(finite(out.armorPen, 0) + 0.02 * rank, 0, RAID_RULES.bossArmor);
  } else if (def.key === 'herald-vow') {
    out.maxHp = Math.round(out.maxHp * (1 + 0.04 * rank));
    out.dps = Math.round(out.dps * (1 + 0.02 * rank));
  }
  out.dps = clamp(out.dps, RAID_RULES.dpsMin, RAID_RULES.dpsMax);
  out.maxHp = clamp(out.maxHp, 1_000, 1_000_000_000);
  out.armorPen = clamp(finite(out.armorPen, 0), 0, RAID_RULES.bossArmor);
  return out;
}

// A stable fingerprint of the combat-relevant saved state. A readiness toggle stores this value; a
// start re-computes it and refuses a stale ready flag. Bag-only changes do not invalidate readiness
// because they do not change the equipped combat profile.
export function raidProfileFingerprintSource(save) {
  if (!isObj(save)) return '';
  const eq = isObj(save.eq) ? save.eq : {};
  const slots = {};
  for (const slot of Object.keys(eq).sort()) {
    const item = eq[slot];
    if (!isObj(item)) { slots[slot] = null; continue; }
    slots[slot] = {
      id: item.id == null ? null : String(item.id),
      slot: item.slot ?? null,
      wt: item.wt ?? null,
      val: finite(item.val, 0),
      r: int(item.r, 0, 15),
      stars: int(item.stars, 0, 20),
      sec: item.sec ?? null,
      aff: (Array.isArray(item.aff) ? item.aff : []).map(a => isObj(a) ? [a.k, finite(a.v, 0)] : a),
      cards: (Array.isArray(item.cards) ? item.cards : []).map(c => isObj(c)
        ? [c.cardKey ?? c.card ?? null, c.stat ?? null, finite(c.v, 0), (Array.isArray(c.effects) ? c.effects : []).map(e => [e?.k, finite(e?.v, 0)])]
        : c),
    };
  }
  const stats = {};
  for (const key of ['str', 'agi', 'dex', 'int', 'vit', 'luk']) stats[key] = finite(save.st?.[key], 0);
  return JSON.stringify({ v: 2, lv: int(save.lv, 1, 150), cls: save.cls ?? '', sex: save.sex ?? '', st: stats, eq: slots });
}

const fallbackHash = text => {
  // FNV-1a 64-bit-ish fallback for runtimes without Web Crypto. The value is only an equality
  // token, never a secret or an entitlement.
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
};

export async function raidProfileFingerprint(save) {
  const text = raidProfileFingerprintSource(save);
  const subtle = globalThis.crypto?.subtle;
  if (subtle && typeof TextEncoder === 'function') {
    try {
      const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch { /* fall through */ }
  }
  return fallbackHash(text);
}

export function sanitizeRaidProfile(value) {
  const p = isObj(value) ? value : {};
  const cp = classProfile(typeof p.cls === 'string' ? p.cls : 'Novice');
  return {
    profileVersion: 2,
    cls: cp.name,
    magic: cp.magic,
    main: cp.main,
    lv: int(p.lv, 1, 150),
    sex: p.sex === 'f' ? 'f' : 'm',
    dps: int(p.dps, 12_000, 800_000),
    maxHp: int(p.maxHp, 1_000, 1_000_000_000),
    armorPen: clamp(finite(p.armorPen, 0), 0, RAID_RULES.bossArmor),
    weaponStars: int(p.weaponStars, 0, 20),
    weaponId: typeof p.weaponId === 'string' ? p.weaponId.slice(0, 80) : '',
    weaponType: typeof p.weaponType === 'string' ? p.weaponType.slice(0, 24) : '',
    power: Math.max(0, Math.round(finite(p.power, 0))),
    source: 'class-save-snapshot',
  };
}
