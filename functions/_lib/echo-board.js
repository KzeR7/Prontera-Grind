// Endless Echo leaderboard: period scores, the Top-100 reward proposal and lazy settlement.
//
// Scores arrive on cloud-save sync (functions/api/save.js): the client keeps its best ranked
// DPS for today / this week / all time in `trial.echoBoard` + `trial.best`, publicFields()
// whitelists them, and recordEchoScores() upserts them here. A period score is a personal
// best, never a sum, so re-syncing the same save can never inflate it.
//
// Reward table (owner, revised 2026-10-27): the top Echo bands pay protection scrolls and
// banked Daily Roulette rolls ('dailyRolls', spent after the day's free spin and never
// expiring with the daily reset) instead of raw Shards; the lower daily/weekly bands keep
// their Echo Shards so the whole Top 100 still wins something. Echo-board only — the kills
// board pays nothing. Weekly #11-25's "5 daily reroll" is five of the same banked rolls.
import { boardDayKey, boardWeekStart } from './board.js';

export const ECHO_LIMIT = 100;
export const ECHO_MAX_DPS = 100_000_000; // sanity cap: the top milestone chest sits at 4.5M DPS

// [lastRank, [[resource, amount], ...]] — resources are gmApplyGift resources in index.html.
export const ECHO_REWARDS = {
  daily: [
    [1,   [['refineScrolls', 3], ['dailyRolls', 2]]],
    [3,   [['refineScrolls', 2], ['dailyRolls', 2]]],
    [10,  [['refineScrolls', 1]]],
    [25,  [['shards', 100]]],
    [50,  [['shards', 60]]],
    [100, [['shards', 30]]],
  ],
  weekly: [
    [1,   [['mythicScrolls', 5]]],
    [3,   [['mythicScrolls', 3]]],
    [10,  [['mythicScrolls', 1]]],
    [25,  [['refineScrolls', 5], ['dailyRolls', 5]]],
    [50,  [['refineScrolls', 3]]],
    [100, [['shards', 100]]],
  ],
};

export function echoRewardFor(period, rank) {
  const tiers = ECHO_REWARDS[period];
  if (!tiers || !Number.isInteger(rank) || rank < 1) return [];
  for (const [last, prizes] of tiers) if (rank <= last) return prizes.map(([resource, amount]) => ({ resource, amount }));
  return [];
}

export const echoPrizeText = prizes => (prizes || []).map(p => {
  const names = { shards: 'Echo Shards', refineScrolls: 'Refine Protection Scroll', mythicScrolls: 'Mythic Protection Scroll', ascMat2: "Valkyrie's Sigil", dailyRolls: 'Daily Roulette Roll' };
  return `${p.amount} ${names[p.resource] || p.resource}${p.amount > 1 && p.resource !== 'shards' ? 's' : ''}`;
}).join(' + ');

// The period keys a save's scores belong to. Day/week attribution comes from the client's own
// echoBoard stamps, so a personal best set last week can never leak into today's board.
export function echoPeriodKeys({ dayKey, weekKey } = {}) {
  const keys = ['all'];
  if (/^\d{4}-\d{2}-\d{2}$/.test(dayKey || '')) keys.push('day:' + dayKey);
  if (/^\d{4}-\d{2}-\d{2}$/.test(weekKey || '')) keys.push('week:' + weekKey);
  return keys;
}

// Upsert one save's scores. `pub` is publicFields() output: { echoBest, echoDayDps, echoDayKey,
// echoWeekDps, echoWeekKey }. Each period keeps the higher DPS; stale day/week stamps (period
// already over) are still recorded under their own key, where they can only help that period.
// Deploy-first safety (same rule as the shop's 0005): code may reach a database that has not
// run migration 0006 yet. Echo scoring and settlement quietly no-op on missing tables instead of
// failing the player's save or board read, without scanning sqlite_master on every sync.
const missingTable = e => /no such table/i.test(String(e && e.message || e));

export async function recordEchoScores(DB, userId, pub) {
  const candidates = [
    ['all', pub.echoBest],
    ['day:' + (pub.echoDayKey || ''), pub.echoDayDps],
    ['week:' + (pub.echoWeekKey || ''), pub.echoWeekDps],
  ].map(([key, raw]) => [key, Math.min(ECHO_MAX_DPS, Math.max(0, Number(raw) || 0))])
   .filter(([key, dps]) => dps > 0 && !key.endsWith(':'));
  if (!candidates.length) return;

  // Read existing personal bests first so ordinary field syncs spend zero D1 writes when DPS has
  // not risen; the WHERE guard below also prevents a raced write from rewriting an equal/higher row.
  const existing = new Map();
  try {
    const marks = candidates.map(() => '?').join(', ');
    const rows = await DB.prepare(
      `SELECT period_key, dps FROM leaderboard_echo WHERE user_id = ? AND period_key IN (${marks})`
    ).bind(userId, ...candidates.map(([key]) => key)).all();
    for (const r of rows.results || []) existing.set(r.period_key, Number(r.dps) || 0);
  } catch (e) {
    if (missingTable(e)) return;
    throw e;
  }

  for (const [key, dps] of candidates) {
    if (dps <= (existing.get(key) || 0)) continue;
    await DB.prepare(`INSERT INTO leaderboard_echo(user_id, period_key, dps) VALUES(?, ?, ?)
      ON CONFLICT(user_id, period_key) DO UPDATE SET dps = excluded.dps
      WHERE excluded.dps > leaderboard_echo.dps`).bind(userId, key, dps).run();
  }
}

// Finished periods awaiting payout, Singapore time: the last seven days and the last four
// weeks, so a period nobody looked at for a few days is still paid when activity resumes.
export function echoSettleTargets(at = Date.now()) {
  const today = boardDayKey(at);
  const dayMs = 86_400_000, base = Date.parse(today + 'T00:00:00Z'), thisWeek = boardWeekStart(today);
  const targets = [];
  for (let back = 1; back <= 7; back++) {
    const day = new Date(base - back * dayMs).toISOString().slice(0, 10);
    targets.push({ kind: 'daily', periodKey: 'day:' + day, label: `Daily · ${day}` });
  }
  for (let back = 1; back <= 4; back++) {
    const week = new Date(Date.parse(thisWeek + 'T00:00:00Z') - back * 7 * dayMs).toISOString().slice(0, 10);
    targets.push({ kind: 'weekly', periodKey: 'week:' + week, label: `Weekly · week of ${week}` });
  }
  return targets;
}

// Rank one finished period's Top 100 and queue prizes as grants. Idempotent: the settlements
// row is claimed first, and reward rows are keyed (period, user), so a retry pays nobody twice.
// Returns how many accounts were paid. Safe to call on any board read / save sync.
export async function settleEchoRewards(DB, at = Date.now()) {
  const targets = echoSettleTargets(at);
  if (!targets.length) return 0;
  // Filter to unsettled periods that actually have a positive score in one covering-index check,
  // avoiding 11 Top-100 queries and 11 INSERT OR IGNORE writes on every 60s save sync.
  let dueKeys;
  try {
    const values = targets.map(() => '(?)').join(', ');
    const due = await DB.prepare(`
      WITH targets(period_key) AS (VALUES ${values})
      SELECT period_key FROM targets t
      WHERE NOT EXISTS (SELECT 1 FROM leaderboard_echo_settlements s WHERE s.period_key = t.period_key)
        AND EXISTS (SELECT 1 FROM leaderboard_echo e WHERE e.period_key = t.period_key AND e.dps > 0)
    `).bind(...targets.map(t => t.periodKey)).all();
    dueKeys = new Set((due.results || []).map(r => r.period_key));
  } catch (e) {
    if (missingTable(e)) return 0;
    throw e;
  }
  if (!dueKeys.size) return 0;

  let paid = 0;
  try {
    for (const target of targets) {
      if (!dueKeys.has(target.periodKey)) continue;
      const rows = await DB.prepare(`
        SELECT e.user_id, e.dps FROM leaderboard_echo e
        WHERE e.period_key = ? AND e.dps > 0
        ORDER BY e.dps DESC, e.user_id ASC LIMIT ?`).bind(target.periodKey, ECHO_LIMIT).all();
      const winners = rows.results || [];
      // An empty period is NOT marked settled: a player whose first sync of the new day carries
      // yesterday's best can still be paid by the next read or sync (their own save sync records
      // the score before it settles, so they are included in that settlement).
      if (!winners.length) continue;
      const claim = await DB.prepare(
        'INSERT OR IGNORE INTO leaderboard_echo_settlements(period_key, settled_at) VALUES(?, ?)').bind(target.periodKey, at).run();
      if (!Number(claim?.meta?.changes ?? claim?.meta?.rows_written ?? 0)) continue;
      for (let i = 0; i < winners.length; i++) {
        const rank = i + 1, prizes = echoRewardFor(target.kind, rank);
        if (!prizes.length) continue;
        await DB.prepare(`INSERT OR IGNORE INTO leaderboard_echo_rewards(period_key, user_id, rank, dps, prizes, settled_at)
          VALUES(?, ?, ?, ?, ?, ?)`).bind(target.periodKey, winners[i].user_id, rank, Number(winners[i].dps) || 0, JSON.stringify(prizes), at).run();
        for (const prize of prizes) {
          await DB.prepare(`INSERT INTO grants(user_id, kind, payload, note, created_by, created_at) VALUES(?, 'gift', ?, ?, 'Endless Echo', ?)`)
            .bind(winners[i].user_id, JSON.stringify(prize),
              `Endless Echo ${target.label} — rank #${rank}: ${echoPrizeText([prize])}.`, at).run();
        }
        paid++;
      }
    }
  } catch (e) {
    if (missingTable(e)) return paid;
    throw e;
  }
  return paid;
}
