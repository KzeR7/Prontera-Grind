// Endless Echo leaderboard: period scores, the Top-100 reward proposal and lazy settlement.
//
// Legacy mutation entry points remain paused: the old settlement was not atomic.
// A separate launch path accepts explicitly unverified scores and settles them atomically.
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

// Legacy save-derived scores are untrusted. Fail closed even if a future caller
// accidentally reconnects this old entry point; replace it only with a reviewed,
// server-authoritative pipeline. There is deliberately no runtime enable flag.
export async function recordEchoScores() {
  throw new Error('Competitive scoring is paused: client saves are not authoritative.');
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

// The former lazy settlement used untrusted scores and claimed periods before all
// rewards/grants were committed. It cannot safely resume or retry after partial failure.
// A replacement must atomically settle independently verified, frozen periods.
export async function settleEchoRewards() {
  throw new Error('Competitive payouts are paused: authoritative settlement is not implemented.');
}
