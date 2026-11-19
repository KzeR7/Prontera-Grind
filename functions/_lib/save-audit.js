// _lib/save-audit.js — the server's referee, without a live game.
//
// The browser runs the whole simulation (kills, exp, drops), so the server can never PROVE a
// save is honest — but it can prove parts of it are IMPOSSIBLE, and it can prove that the rate
// of progress between two accepted saves exceeded anything the game itself can pay out. This
// module is that check, run automatically on every accepted cloud save so the owner does not
// have to watch the game 24/7: flags land in `save_alerts`, the GM console's "Suspicious saves"
// card, and a targeted mail message to the owner the first time a rule fires.
//
// DESIGN RULES (kept in step with docs/COMPETITION-SECURITY.md and the damage monitor):
//   * REVIEW-ONLY. A flag never rejects a save, never bans, never changes a score. The save is
//     stored; the console shows the evidence; the owner decides.
//   * Only server-owned clocks and stored numbers decide: elapsed time is the wall time between
//     two ACCEPTED saves (client clocks are never consulted), and a server-issued offline claim
//     is subtracted from the kill delta so away progress is never called cheating.
//   * GM gifts are subtracted too: every grant claimed inside the window (zeny, level, resources)
//     is credited back, so the owner's own giveaways never flag the receiver.
//   * Thresholds are PROVISIONAL and deliberately generous: a flag must mean "a human should look
//     at this", not "the numbers are unusual". Every label says which limit was broken.
//
// STATIC INVARIANTS are transcribed from index.html and must be kept in step with it:
//   * statCapForLv: BASECAP 99 below Base Lv 100, MAXST 120 from Lv 100 (line ~2946).
//   * points(lv):  10 + Σ 4+⌊i/5⌋ over levels 2..lv; spent(st): Σ cost of each stat step
//     (1+⌊(n-1)/10⌋ below 100, 10+n-100 above) — the pts invariant is pts + spent === points.
//   * refine cap: +10 on normal gear, +15 on Mythic (sec 6) (refineUI `maxRef`).
//   * zeny cap: 1e15, level cap: 150 (validate.js CAPS).

import * as db from './db.js';
import { CAPS } from './validate.js';

export const RULE_VERSION = '2026-11-20.v3';

export const AUDIT_LABELS = {
  'level-over-cap': 'Impossible base level',
  'stat-over-cap': 'Stat above the level cap',
  'stat-points-over': 'More stat points than any level can earn',
  'zeny-over-cap': 'Impossible Zeny figure',
  'negative-kills': 'Negative kill count',
  'refine-over-cap': 'Refine above the maximum',
  'affix-over-cap': 'Affix value above any legitimate roll',
  'kill-rate': 'Kill rate above the server cap',
  'level-rate': 'Level speed above human limits',
  'zeny-rate': 'Zeny gain above human limits',
};
export const rateLabel = key => AUDIT_LABELS[key] || ('Material gain above limit: ' + key.replace(/^rate:/, ''));

export const STRUCTURAL_KINDS = new Set([
  'level-over-cap', 'stat-over-cap', 'stat-points-over',
  'zeny-over-cap', 'negative-kills', 'refine-over-cap', 'affix-over-cap',
]);
export const ruleCategory = kind => (STRUCTURAL_KINDS.has(kind) ? 'structural' : 'heuristic');

// ---------------------------------------------------------------- helpers ----
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const floor = v => Math.max(0, Math.floor(num(v)));

// index.html: statCapForLv = lv => lv >= ELITELV ? MAXST : BASECAP
export const statCapForLv = lv => (num(lv) >= 100 ? 120 : 99);
// index.html: points = lv => 10 + Σ (4 + ⌊i/5⌋), i = 2..lv
export const pointsAt = lv => {
  const L = Math.max(0, Math.floor(num(lv)));
  let n = 10;
  for (let i = 2; i <= L; i++) n += 4 + Math.floor(i / 5);
  return n;
};
// index.html: spent = st => Σ over stats of (n<100 ? 1+⌊(n-1)/10⌋ : 10+n-100), n = 1..v-1
export const statsSpent = st => {
  if (!st || typeof st !== 'object') return 0;
  let sum = 0;
  for (const v of Object.values(st)) {
    const target = Math.max(1, Math.floor(num(v)));
    for (let n = 1; n < target; n++) sum += n < 100 ? 1 + Math.floor((n - 1) / 10) : 10 + n - 100;
  }
  return sum;
};
const refineCap = item => (Number(item && item.sec) === 6 ? 15 : 10);

// What one of our counters is in the save blob (gift resource key -> save path).
//
// Fishing Fishcoins and DigiPet Pet Coins are deliberately NOT counters any more (owner,
// 2026-11-15: "did u also notice the fishcoin & digicoin flag? i think we dont need to be in the
// flag, these are mini games. i dont think cheating in this does any good"). Nothing they buy
// touches combat, the level curve or the economy the flags exist to protect, so a coin count is
// never worth a review. The counters, their hourly limits and their lump allowances are removed
// outright - not loosened - so no future limit can quietly reintroduce them.
export const COUNTERS = {
  shards: s => floor(s && s.shards),
  refineScrolls: s => floor(s && s.refineScrolls),
  mythicScrolls: s => floor(s && s.mythicScrolls),
  ori: s => floor(s && s.ore && s.ore.ori),
  elu: s => floor(s && s.ore && s.ore.elu),
  ascMat0: s => floor(s && s.ascensionMat && s.ascensionMat[0]),
  ascMat1: s => floor(s && s.ascensionMat && s.ascensionMat[1]),
  ascMat2: s => floor(s && s.ascensionMat && s.ascensionMat[2]),
  nmat0: s => floor(s && s.nmMat && s.nmMat[0]),
};

// Provisional per-hour limits. Generous on purpose: each must be beatable only by play the game
// itself cannot produce (or by an edited save). Cross-check a flag against gifts before acting.
export const RATE_LIMITS = {
  kills: 30000,                    // the server's own OFFLINE_RATE_CAP — the most it will ever pay
  zeny: 1e9,                       // ≫ legit max farm (30k kills/h × top zeny/kill with slack)
  shards: 3000, ori: 800, elu: 800,
  refineScrolls: 200, mythicScrolls: 100,
  ascMat0: 200, ascMat1: 200, ascMat2: 200, nmat0: 200,
};
// Levels per hour by the level you STARTED the window at. Early game can be quick; Lv 100+
// cannot: the exp curve (needAt) makes 30 levels in one hour unreachable without a hack.
export const levelRateLimit = prevLv => (num(prevLv) >= 100 ? 30 : num(prevLv) >= 40 ? 90 : 240);

// Some counters move in LUMPS that no hourly rate can describe: the Black Market sells ore by the
// thousand and a salvage run lands at once. Each window is therefore allowed ONE such action on top
// of the hourly limit; a second one, or one bigger than this, is still judged as before. The
// allowance is on the DELTA, so it can only ever prevent a false positive - never hide a repeated
// gain. The fishing-bag and DigiPet payouts used to be here; they are not judged at all now.
export const LUMP_ALLOWANCE = {
  ori: 5_000, elu: 5_000,          // one Black Market purchase / one salvage run
};

// ------------------------------------------- the offline claim, mirrored ----
// A welcome-back payout is the server's own money: /api/save issues the claim from a rate it
// measured itself (4 h ceiling, 50% of that rate) and index.html's applyOfflineProgress() pays it.
// This module used to credit only the claim's KILLS, so everything those kills bought - the exp
// that becomes levels, the Zeny, and the loot every kill rolls - landed in the next window as
// impossible progress. That is what the owner saw: away for a while, back with 37 levels at once
// (limit 30/h), and the console called it cheating.
export const OFFLINE_REWARD_MULT = .5;              // functions/api/save.js OFFLINE_REWARD_MULT
export const OFFLINE_CAP_MS = 4 * 60 * 60 * 1000;   // functions/api/save.js OFFLINE_CAP_MS
// v408 (owner: "i would not want to have a cap level ... offline rewards should be only half of the
// online players"), then narrowed the same day: "can u make level 120 above, have a cap of 10
// levels per offline rewards. this should be hidden from players." So a claim is worth half of its
// measured minute, walked by levelsFromExp() - the page's checkLevel walk on the page's own curve -
// with ONE ceiling: a claim pays everything up to Lv 120 and then ten levels, silently (so one
// claim reaches 130 at the most). The credit below honours
// that ceiling, so the monitor never credits more than the client can pay, and a jump past ten
// levels from 120+ is a real flag. What keeps the rate honest (and there is no price ceiling on it)
// is index.html's farmSamplingPaused(): no sample is published while the sim replays a frozen window.
export const OFFLINE_LEVEL_CAP_LV = 120;            // index.html OFFLINE_LEVEL_CAP_LV
export const OFFLINE_LEVEL_CAP = 10;                // index.html OFFLINE_LEVEL_CAP
// The ceiling starts when a claim REACHES Lv 120, not when it starts: every level up to 120 is
// paid, then ten more at most. A claim from 113 is therefore worth 17 levels (to 130), from 118
// twelve, from 130 ten - 130 is the highest one claim can reach.
export const offlineLevelCapFor = prevLv => {
  const from = Math.max(1, Math.floor(num(prevLv) || 1));
  return Math.max(0, Math.min(OFFLINE_LEVEL_CAP_LV, CAPS.level) - from) + OFFLINE_LEVEL_CAP;
};
// The exp that many levels cost from lv, in this module's transcribed curve (index.html baseNeedAt).
export const offlineExpBudget = (lv, levels) => {
  const from = Math.max(1, Math.min(149, Math.floor(num(lv) || 1)));
  let sum = 0;
  for (let i = 0; i < levels && from + i < CAPS.level; i++) sum += expToNext(from + i);
  return sum;
};

// index.html: needAt/baseNeedAt. Lv 100+ costs ×4 and every requirement is rounded by roundReq.
const NA1 = 18.705917193, NE1 = 1.28684215, NE2 = 11.33248639, NE2B = .72933977;
const N100 = 86520, NE3 = 8.2928141;
const N50 = Math.floor(NA1 * Math.pow(50, NE1));
const N70 = Math.floor(N50 * Math.pow(1.4, NE2));
const roundReq = n => {
  const a = Math.abs(n), m = a < 100 ? 1 : a < 1e4 ? 10 : a < 1e5 ? 100 : 1e3;
  return Math.max(1, Math.round(n / m) * m);
};
const needAt = L => roundReq(L <= 50 ? Math.floor(NA1 * Math.pow(L, NE1))
  : L <= 70 ? Math.floor(N50 * Math.pow(L / 50, NE2))
  : L <= 99 ? Math.floor(N70 * Math.pow(L / 70, NE2B))
  : Math.floor(N100 * Math.pow(L / 100, NE3)));
// The exp a level costs (index.html baseNeedAt). Exported so a test can hold it against the page.
export const expToNext = lv => (num(lv) >= 100 ? roundReq(needAt(num(lv)) * 4) : needAt(num(lv)));
// How many levels that much exp buys from `fromLv` (index.html checkLevel walks the same loop).
export function levelsFromExp(exp, fromLv) {
  let lv = Math.max(1, Math.floor(num(fromLv))), left = Math.max(0, num(exp)), gained = 0;
  while (lv < CAPS.level && left >= expToNext(lv)) { left -= expToNext(lv); lv++; gained++; }
  return gained;
}

// The game's own per-kill references (index.html EXPK / ZK) at the level band the window started in.
const bandPower = lv => Math.max(1, Math.min(99, Math.floor(num(lv))));
const expPerKillRef = lv => (5.5 * Math.pow(bandPower(lv), 1.5)) / 50;
const zenyPerKillRef = lv => (14 * bandPower(lv) * bandPower(lv)) / 1000;
// Slack over those references: expRate (7, or 7/3 past Lv 100), pet EXP and bosses (46/5.5 ≈ 8.4)
// put a kill's exp under ×60 of the reference; Zeny also carries Nightmare multipliers, the per-kill
// roll and Zeny gear, so its slack is wider. Only used when the save has no measured farm sample.
const KILL_EXP_SLACK = 60, KILL_ZENY_SLACK = 200;

// Loot one claim kill can roll, with slack over the field tables: ore .5-1%, Nightmare material 1%,
// Ascension material .5% × HP index (≤ ~1.5%), Sigil .125% × index (bosses 1%).
export const CLAIM_LOOT_PER_KILL = {
  ori: .03, elu: .03, nmat0: .03, ascMat0: .05, ascMat1: .05, ascMat2: .05,
};

// What a claim paid, as the same credits shape auditSaveRates() already takes. Mirrors
// applyOfflineProgress(): the measured sample (xp and zeny per minute, kept in the save) is what
// the client multiplies by the credited minutes at half rate; without one it prices each kill.
// Claim kills are also loot rolls, so every material counter is credited at its per-kill ceiling.
export function claimCredits({ claim, income, prevLv }) {
  const kills = floor(claim && claim.kills);
  const creditedMs = Math.min(floor(claim && claim.creditedMs), OFFLINE_CAP_MS);
  if (!kills && !creditedMs) return null;
  const minutes = (creditedMs / 60000) * OFFLINE_REWARD_MULT;
  const measured = !!income && Number(income.version) === 1
    && Number.isFinite(Number(income.xp)) && Number.isFinite(Number(income.zeny));
  const exp = measured ? Math.max(0, num(income.xp)) * minutes
    : kills * expPerKillRef(prevLv) * KILL_EXP_SLACK;
  const zeny = measured ? Math.max(0, num(income.zeny)) * minutes
    : kills * zenyPerKillRef(prevLv) * KILL_ZENY_SLACK;
  const resources = {};
  for (const [key, perKill] of Object.entries(CLAIM_LOOT_PER_KILL)) {
    resources[key] = Math.ceil(kills * perKill);
  }
  // Exactly what the page would buy: the claim's half-rate exp walked down the same curve, under
  // the Lv 120+ ceiling the client also applies.
  const levels = Math.min(levelsFromExp(exp, prevLv), offlineLevelCapFor(prevLv));
  return { kills: 0, levels, zeny: Math.ceil(zeny), resources };
}

// Add two credit sets (a claim's own payout + the GM grants claimed in the same window).
export function addCredits(a, b) {
  const out = { kills: 0, levels: num(a && a.levels) + num(b && b.levels), zeny: num(a && a.zeny) + num(b && b.zeny), resources: {} };
  for (const src of [a, b]) {
    if (!src || !src.resources) continue;
    for (const [key, amount] of Object.entries(src.resources)) out.resources[key] = num(out.resources[key]) + num(amount);
  }
  return out;
}

// --------------------------------------------------------------- static ----
// Impossible IN THIS SAVE, no timing needed. Runs on every accepted save.
export function auditStaticSave(save) {
  const out = [];
  if (!save || typeof save !== 'object' || Array.isArray(save)) return out;
  const lv = num(save.lv);
  if (lv > CAPS.level || lv < 1) {
    out.push({ kind: 'level-over-cap', value: lv, threshold: CAPS.level, detail: `base level ${lv}` });
  }
  const st = save.st && typeof save.st === 'object' ? save.st : null;
  if (st) {
    const cap = statCapForLv(lv);
    let worst = 0, worstKey = '';
    for (const [k, v] of Object.entries(st)) {
      const val = Math.floor(num(v));
      if (val > worst) { worst = val; worstKey = k; }
    }
    if (worst > cap) {
      out.push({ kind: 'stat-over-cap', value: worst, threshold: cap,
        detail: `${worstKey} ${worst} at base level ${Math.floor(lv)} (cap ${cap})` });
    }
    // The game's own invariant: pts === points(lv) − spent(st), recomputed at load and after
    // every refund. More than that exists only in an edited save.
    const pts = floor(save.pts), spent = statsSpent(st), entitled = pointsAt(lv);
    if (pts + spent > entitled) {
      out.push({ kind: 'stat-points-over', value: pts + spent, threshold: entitled,
        detail: `${pts} unspent + ${spent} spent = ${pts + spent}, but level ${Math.floor(lv)} earns ${entitled}` });
    }
  }
  const zeny = num(save.zeny);
  if (zeny > CAPS.maxZeny || zeny < 0) {
    out.push({ kind: 'zeny-over-cap', value: zeny, threshold: CAPS.maxZeny, detail: `zeny ${zeny}` });
  }
  const kills = num(save.kills);
  if (save.kills !== undefined && kills < 0) {
    out.push({ kind: 'negative-kills', value: kills, threshold: 0, detail: `kills ${kills}` });
  }
  // Gear: refine ceilings and affix magnitudes, across everything the save carries.
  const items = [
    ...Object.values(save.eq && typeof save.eq === 'object' ? save.eq : {}).filter(Boolean),
    ...(Array.isArray(save.inv) ? save.inv : []).filter(Boolean),
    ...(Array.isArray(save.cards) ? save.cards : []).filter(Boolean),
  ];
  // v410 CPU: ONE pass, and each rule stops being evaluated once it has fired. The old code walked
  // the whole eq+inv+cards list twice (once for maxima, once for the refine rule) on EVERY accepted
  // save; at BAGMAX=1000 that is a few thousand iterations per sync of a 10 ms budget. The rules and
  // their thresholds are unchanged - only the number of passes is.
  let worstAffix = 0, refineFlagged = false;
  for (const it of items) {
    if (!refineFlagged) {
      const r = Math.floor(num(it.r));
      if (r > refineCap(it)) {
        refineFlagged = true;   // one row per kind; the console shows the worst case
        out.push({ kind: 'refine-over-cap', value: r, threshold: refineCap(it),
          detail: `${it.name || 'item'} +${r} (max +${refineCap(it)})` });
      }
    }
    for (const list of [it.aff, it.effects]) {
      if (!Array.isArray(list)) continue;
      for (const a of list) {
        const v = num(a && a.v);
        if (v > worstAffix) worstAffix = v;
      }
    }
  }
  if (worstAffix > 10000) {
    out.push({ kind: 'affix-over-cap', value: worstAffix, threshold: 10000,
      detail: `affix/effect value ${worstAffix} (max legitimate roll is five figures below)` });
  }
  return out;
}

// ----------------------------------------------------------------- rates ----
// Progress BETWEEN two accepted saves. Pure: everything (prev row, next save, elapsed ms,
// offline-claim kills, grant credits) is an argument, so tests can drive any timing.
//
// credits: { zeny, levels, kills, resources: { counter: amount } } — gifts claimed in the window.
// Minimum absolute delta before a short-window rate heuristic can fire, preventing
// legitimate lump payouts (quests, roulette, mail, salvage, conversions) in a 1-5 min
// sync window from being extrapolated into false-positive hourly rates.
export const MIN_RATE_DELTA = {
  kills: 5_000,
  zeny: 100_000_000,
  levels: 8,
  shards: 600,
  ori: 300,
  elu: 300,
  refineScrolls: 60,
  mythicScrolls: 30,
  ascMat0: 60,
  ascMat1: 60,
  ascMat2: 60,
  nmat0: 60,
};

export function auditSaveRates({ prev, next, elapsedMs, claimKills = 0, credits = null }) {
  const out = [];
  if (!(elapsedMs >= 60_000)) return out;           // sub-minute windows are too noisy to judge
  const hours = elapsedMs / 3_600_000;
  const mins = Math.round(elapsedMs / 60_000);
  const cred = credits || { zeny: 0, levels: 0, kills: 0, resources: {} };
  const c = key => num(cred.resources && cred.resources[key]);

  const prevClass = prev.raw && (prev.raw.job || prev.raw.cls || prev.raw.classId) || null;
  const nextClass = next.raw && (next.raw.job || next.raw.cls || next.raw.classId) || null;
  const classChanged = !!(prevClass && nextClass && prevClass !== nextClass);

  // Kills: the grind backbone. Claimed offline kills are the SERVER's own payout, never a flag.
  const rawKillsDelta = Math.max(0, floor(next.kills) - floor(prev.kills));
  const creditedKills = Math.max(0, floor(claimKills)) + Math.max(0, floor(cred.kills));
  const killsDelta = Math.max(0, rawKillsDelta - creditedKills);
  const killRate = killsDelta / hours;
  if (killsDelta >= MIN_RATE_DELTA.kills && killRate > RATE_LIMITS.kills) {
    out.push({
      kind: 'kill-rate', category: 'heuristic', ruleVersion: RULE_VERSION,
      confidence: 'medium', units: 'kills/hr',
      value: Math.round(killRate), threshold: RATE_LIMITS.kills,
      evidence: { start: floor(prev.kills), end: floor(next.kills), rawDelta: rawKillsDelta, credited: creditedKills, unexplained: killsDelta, elapsedMs },
      detail: `${killsDelta.toLocaleString('en-US')} unexplained kills in ${mins} min (raw +${rawKillsDelta.toLocaleString('en-US')}, credited ${creditedKills.toLocaleString('en-US')})`,
    });
  }

  // Levels: skip level-rate when class changed (restored class progression).
  const rawLvDelta = Math.max(0, floor(next.lv) - floor(prev.lv));
  const creditedLv = floor(cred.levels);
  const lvDelta = Math.max(0, rawLvDelta - creditedLv);
  const minLvDelta = floor(prev.lv) >= 100 ? 4 : MIN_RATE_DELTA.levels;
  if (!classChanged && lvDelta >= minLvDelta) {
    const limit = levelRateLimit(prev.lv);
    const rate = lvDelta / hours;
    if (rate > limit) {
      out.push({
        kind: 'level-rate', category: 'heuristic', ruleVersion: RULE_VERSION,
        confidence: 'medium', units: 'levels/hr',
        value: Math.round(rate * 10) / 10, threshold: limit,
        evidence: { start: floor(prev.lv), end: floor(next.lv), rawDelta: rawLvDelta, credited: creditedLv, unexplained: lvDelta, elapsedMs, classChanged },
        detail: `+${lvDelta} unexplained levels in ${mins} min from Lv ${floor(prev.lv)}`,
      });
    }
  }

  // Zeny: only the blatant end (a real farm at the kill-rate cap stays under this).
  const rawZenyDelta = Math.max(0, num(next.zeny) - num(prev.zeny));
  const creditedZeny = floor(cred.zeny);
  const zenyDelta = Math.max(0, rawZenyDelta - creditedZeny);
  const zenyRate = zenyDelta / hours;
  if (zenyDelta >= MIN_RATE_DELTA.zeny && zenyRate > RATE_LIMITS.zeny) {
    out.push({
      kind: 'zeny-rate', category: 'heuristic', ruleVersion: RULE_VERSION,
      confidence: 'medium', units: 'zeny/hr',
      value: Math.round(zenyRate), threshold: RATE_LIMITS.zeny,
      evidence: { start: num(prev.zeny), end: num(next.zeny), rawDelta: rawZenyDelta, credited: creditedZeny, unexplained: zenyDelta, elapsedMs },
      detail: `${zenyDelta.toLocaleString('en-US')} unexplained zeny in ${mins} min`,
    });
  }

  // Materials: require minimum absolute delta so small lump rewards in short windows don't false-positive.
  for (const [key, read] of Object.entries(COUNTERS)) {
    const limit = RATE_LIMITS[key];
    if (!limit) continue;
    const startVal = read(prev.raw);
    const endVal = read(next.raw);
    const rawDelta = Math.max(0, endVal - startVal);
    const credited = c(key) + num(LUMP_ALLOWANCE[key]);
    const delta = Math.max(0, rawDelta - credited);
    const minAbs = MIN_RATE_DELTA[key] || 0;
    const rate = delta / hours;
    if (delta >= minAbs && rate > limit) {
      out.push({
        kind: 'rate:' + key, category: 'heuristic', ruleVersion: RULE_VERSION,
        confidence: 'low', units: `${key}/hr`,
        value: Math.round(rate), threshold: limit,
        evidence: { start: startVal, end: endVal, rawDelta, credited, unexplained: delta, elapsedMs },
        detail: `+${delta.toLocaleString('en-US')} ${key} in ${mins} min (raw +${rawDelta.toLocaleString('en-US')})`,
      });
    }
  }
  return out;
}

// Grant payloads claimed inside the window, credited back against the deltas. Pure and total:
// an unrecognised payload contributes nothing, which can only ever ADD a flag, never hide one
// — and a hidden flag would need a later window to exceed the limit anyway.
export function creditsFromGrants(rows) {
  const credits = { zeny: 0, levels: 0, kills: 0, resources: {} };
  for (const r of rows || []) {
    let p = {};
    try { p = JSON.parse(r.payload || '{}'); } catch { continue; }
    if (r.kind === 'zeny') credits.zeny += Math.max(0, floor(p.amount));
    else if (r.kind === 'level') credits.levels += Math.max(0, floor(p.amount));
    else if (typeof p.resource === 'string' && p.resource in COUNTERS) {
      credits.resources[p.resource] = (credits.resources[p.resource] || 0) + Math.max(0, floor(p.amount));
    }
  }
  return credits;
}

// -------------------------------------------------------------- recording ----
// Orchestration for save.js: audit one accepted save, record any flags, poke the owner the first
// time a rule fires for an account. NEVER throws — a monitoring failure must not fail a save.
export async function auditAcceptedSave(D, { userId, username, gm, prev, prevSave = null, stamp = null, save, pub, savedAt, claimKills = 0, claim = null }) {
  // The owner's own account is not audited: GM tools deliberately create impossible figures
  // (level grants, test gear), and flagging them would bury the console in self-noise.
  if (Number(gm) >= 2) return { flagged: false };

  const violations = auditStaticSave(save);
  if (violations.length === 0 && prev) {
    const elapsedMs = savedAt - Number(prev.saved_at || savedAt);
    const prevView = {
      kills: prev.kills_total, lv: prev.level, zeny: prev.zeny,
      // v410 CPU: the caller may hand in the already-parsed previous save (`prevSave`), so this
      // audit does not re-read up to 512 KB of stored blob on every sync. safeParse stays as the
      // fallback for callers that only have the row.
      //
      // v414 CPU: `prev.stamp` is the object the PUT already read for its ownership/restore checks.
      // Only `offlineIncome` is ever taken from here, so re-reading the whole blob to learn one
      // top-level number was a full parse of up to 512 KB per sync for nothing.
      raw: prevSave || stamp || safeParse(prev.blob),
    };
    const nextView = { kills: pub.kills, lv: pub.lv, zeny: pub.zeny, raw: save };
    // The claim this save consumed, priced the way the client paid it (see claimCredits).
    const claimInfo = claim || (claimKills ? { kills: claimKills, creditedMs: 0 } : null);
    const claimPaid = claimInfo
      ? claimCredits({ claim: claimInfo, income: prevView.raw.offlineIncome, prevLv: prevView.lv })
      : null;
    let rates = auditSaveRates({ prev: prevView, next: nextView, elapsedMs, claimKills, credits: claimPaid });
    if (rates.length) {
      // Only a suspicious window pays for the grant lookup: ordinary syncs cost nothing extra.
      const grantRows = await db.grantsClaimedBetween(D, userId,
        Number(prev.saved_at || savedAt) - 120_000, savedAt + 120_000);
      const credits = addCredits(claimPaid, creditsFromGrants(grantRows.results));
      rates = auditSaveRates({ prev: prevView, next: nextView, elapsedMs, claimKills, credits });
    }
    violations.push(...rates);

    // Bounded 1-hour rolling accumulation: catches repeated sub-threshold saves
    // (e.g. 30 saves of +4,999 kills over 120s each = +149,970 kills/hr).
    const win = await db.getAuditWindow(D, userId);
    const ROLLING_MS = 3_600_000;
    const prevStart = Number(prev.saved_at || savedAt);
    let winStart = prevStart;
    let acc = { kills: 0, zeny: 0, levels: 0, resources: {} };
    if (win && (savedAt - Number(win.window_start)) <= ROLLING_MS) {
      winStart = Number(win.window_start);
      try { acc = JSON.parse(win.acc_json || '{}'); } catch {}
      if (!acc.resources) acc.resources = {};
    }
    const gRows = (await db.grantsClaimedBetween(D, userId, prevStart - 120_000, savedAt + 120_000)).results;
    const allCred = addCredits(claimPaid, creditsFromGrants(gRows));
    // Keep raw and credited totals together so the evidence describes the same window.
    const record = (kind, raw, credited, previous) => {
      acc.raw ||= {}; acc.credits ||= {};
      acc.raw[kind] = num(acc.raw[kind] ?? previous) + raw;
      acc.credits[kind] = num(acc.credits[kind]) + Math.min(raw, credited);
    };
    const rawK = Math.max(0, floor(nextView.kills) - floor(prevView.kills));
    const credK = Math.max(0, floor(claimKills)) + Math.max(0, floor(allCred && allCred.kills));
    const netK = Math.max(0, rawK - credK);
    record('kill-rate', rawK, credK, acc.kills);
    acc.kills = floor(acc.kills) + netK;
    const rawZ = Math.max(0, num(nextView.zeny) - num(prevView.zeny));
    const netZ = Math.max(0, rawZ - floor(allCred && allCred.zeny));
    record('zeny-rate', rawZ, floor(allCred && allCred.zeny), acc.zeny);
    acc.zeny = num(acc.zeny) + netZ;
    const prevCls = prevView.raw && (prevView.raw.job || prevView.raw.cls || prevView.raw.classId) || null;
    const nextCls = nextView.raw && (nextView.raw.job || nextView.raw.cls || nextView.raw.classId) || null;
    const clsChanged = !!(prevCls && nextCls && prevCls !== nextCls);
    if (!clsChanged) {
      const rawL = Math.max(0, floor(nextView.lv) - floor(prevView.lv));
      acc.levels = floor(acc.levels) + Math.max(0, rawL - floor(allCred && allCred.levels));
    }
    const netRes = {};
    for (const [key, read] of Object.entries(COUNTERS)) {
      const rawR = Math.max(0, read(nextView.raw) - read(prevView.raw));
      const credR = num(allCred && allCred.resources && allCred.resources[key]);
      record('rate:' + key, rawR, credR, acc.resources[key]);
      netRes[key] = Math.max(0, rawR - credR);
      acc.resources[key] = floor(acc.resources[key]) + netRes[key];
    }
    const persisted = await db.upsertAuditWindow(D, userId, winStart, savedAt, JSON.stringify(acc));
    // A GM may clear the alert between the window read and write. Preserve and use that
    // transaction's review marker instead of overwriting it with our earlier snapshot.
    if (persisted) acc.reviewed = JSON.parse(persisted.acc_json).reviewed;

    const checkRolling = (kind, total, newGain, limit, minimum, units, lump = 0) => {
      if (!newGain || violations.some(v => v.kind === kind)) return;
      const reviewed = acc.reviewed && acc.reviewed[kind];
      const reviewedAmount = floor(reviewed && reviewed.amount);
      const unexplained = Math.max(0, total - reviewedAmount - lump);
      const startAt = Math.max(winStart, num(reviewed && reviewed.at));
      const elapsedMs = Math.max(60_000, savedAt - startAt);
      const rate = unexplained / (elapsedMs / 3_600_000);
      if (!limit || unexplained < minimum || rate <= limit) return;
      const rawDelta = Math.max(0, num(acc.raw[kind]) - num(reviewed && reviewed.raw));
      const credited = Math.max(0, num(acc.credits[kind]) - num(reviewed && reviewed.credited)) + lump;
      violations.push({
        kind, category: 'heuristic', ruleVersion: RULE_VERSION,
        confidence: kind.startsWith('rate:') ? 'low' : 'medium', units,
        value: Math.round(rate), threshold: limit,
        evidence: { start: 0, end: rawDelta, rawDelta, credited, unexplained, elapsedMs, rolling: true },
        detail: `${unexplained.toLocaleString('en-US')} unexplained ${units.replace('/hr', '')} accumulated over ${Math.round(elapsedMs / 60000)} min`,
      });
    };
    checkRolling('kill-rate', acc.kills, netK, RATE_LIMITS.kills, MIN_RATE_DELTA.kills, 'kills/hr');
    checkRolling('zeny-rate', acc.zeny, netZ, RATE_LIMITS.zeny, MIN_RATE_DELTA.zeny, 'zeny/hr');
    for (const key of Object.keys(COUNTERS)) {
      checkRolling('rate:' + key, floor(acc.resources[key]), netRes[key], RATE_LIMITS[key],
        MIN_RATE_DELTA[key] || 0, `${key}/hr`, num(LUMP_ALLOWANCE[key]));
    }
  }
  if (!violations.length) return { flagged: false };

  const at = savedAt;
  const known = new Set((await db.existingSaveAlertKinds(D, userId)).results.map(r => r.kind));
  for (const v of violations) {
    await db.saveAlertWithEvidence(D, {
      userId, kind: v.kind, at, value: v.value,
      threshold: v.threshold, detail: v.detail,
      ruleVersion: v.ruleVersion || RULE_VERSION,
      evidenceJson: v.evidence ? JSON.stringify(v.evidence) : null,
      bucketMs: 300_000,
    });
  }
  const fresh = violations.filter(v => !known.has(v.kind));
  if (fresh.length) {
    const summary = fresh.map(v => `${labelFor(v)} — ${v.detail}`).join('; ').slice(0, 400);
    await db.logEvent(D, username, userId, 'save-alert', summary);
    // Poke every owner account: this is the "i can't watch 24/7" half of the feature.
    for (const owner of (await db.ownerIds(D)).results) {
      if (Number(owner.id) === Number(userId)) continue;
      await db.insertMessage(D,
        `⚠ Suspicious save flagged: ${username}. ${summary}. Review in the GM console — flags are review-only, not proof.`,
        'notice', owner.id, 'Save audit');
    }
  }
  return { flagged: true, fresh };
}

const safeParse = blob => {
  try { const s = JSON.parse(blob); return s && typeof s === 'object' && !Array.isArray(s) ? s : {}; }
  catch { return {}; }
};

// Human sentence for one violation (console and message share this).
export const labelFor = v => (v.kind.startsWith('rate:') ? rateLabel(v.kind)
  : AUDIT_LABELS[v.kind] || v.kind) + (v.threshold ? ` (limit ${fmt(v.threshold)}, saw ${fmt(v.value)})` : '');
const fmt = n => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-US') : String(n));

// Only expose the known numeric evidence fields; legacy and malformed records remain readable.
export function auditEvidenceFor(row) {
  let evidence = null;
  try {
    const value = JSON.parse(row.evidence_json || 'null');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      evidence = {};
      for (const key of ['start', 'end', 'rawDelta', 'credited', 'unexplained', 'elapsedMs']) {
        if (typeof value[key] === 'number' && Number.isFinite(value[key])) evidence[key] = value[key];
      }
      evidence.rolling = value.rolling === true;
    }
  } catch {}
  const kind = row.kind || '';
  const units = kind === 'kill-rate' ? 'kills/hr' : kind === 'zeny-rate' ? 'zeny/hr'
    : kind === 'level-rate' ? 'levels/hr' : kind.startsWith('rate:') ? kind.slice(5) + '/hr' : null;
  return { ruleVersion: row.rule_version || null, category: ruleCategory(kind), units, evidence };
}
