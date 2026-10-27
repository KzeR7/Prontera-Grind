// GET /api/board?period=daily|weekly|all&board=kills|echo -> { board, period, ..., entries }
//
// Names, levels and scores are public leaderboard fields only. A valid server session is required.
// Daily/weekly kills count increases observed when cloud saves are accepted; all-time is seeded from
// existing cloud saves and then maintained by the D1 trigger in migrations/0002_leaderboard.sql.
// The Echo board (haven-v248, migrations/0006) ranks each account's best ranked Endless Echo DPS:
// Top 50 for kills as before, Top 100 for Echo — and Echo's Top 100 are paid daily/weekly prizes,
// settled lazily into the grants queue by this read (see functions/_lib/echo-board.js).

import { currentUser } from '../_lib/auth.js';
import { json, guard, fail } from '../_lib/http.js';
import { BOARD_PERIODS, boardWindow, boardWeekStart } from '../_lib/board.js';
import { ECHO_LIMIT, ECHO_REWARDS, echoPrizeText, settleEchoRewards } from '../_lib/echo-board.js';

const LIMIT = 50;
const rewardTiers = kind => {
  let from = 1;
  return ECHO_REWARDS[kind].map(([last, prizes]) => {
    const tier = { label: from === last ? '#' + last : `#${from}–${last}`,
      prizes: echoPrizeText(prizes.map(([resource, amount]) => ({ resource, amount }))) };
    from = last + 1;
    return tier;
  });
};

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);

  const url = new URL(request.url);
  const period = url.searchParams.get('period') || 'daily';
  if (!BOARD_PERIODS.includes(period)) return fail('Choose daily, weekly, or all.', 400);
  const board = url.searchParams.get('board') || 'kills';
  if (!['kills', 'echo'].includes(board)) return fail('Choose the kills or Endless Echo board.', 400);
  const window = boardWindow(period);

  // Pay any finished Echo period before answering, whichever board was asked for.
  await settleEchoRewards(env.DB);

  if (board === 'echo') {
    const key = period === 'all' ? 'all' : period === 'daily' ? 'day:' + window.start : 'week:' + boardWeekStart(window.start);
    let rows = { results: [] };
    try {
      rows = await env.DB.prepare(`
        SELECT u.username, s.level, s.cls, e.dps
        FROM leaderboard_echo e
        JOIN users u ON u.id = e.user_id
        JOIN saves s ON s.user_id = u.id
        WHERE e.period_key = ? AND e.dps > 0
        ORDER BY e.dps DESC, s.level DESC, u.username COLLATE NOCASE ASC
        LIMIT ?`).bind(key, ECHO_LIMIT).all();
    } catch (e) { if (!/no such table/i.test(e?.message || '')) throw e; } // pre-0006 database: empty board
    return json({
      board, period: window.period, timeZone: window.timeZone, start: window.start, end: window.end,
      label: (period === 'all' ? 'All-time' : window.label) + ' · Endless Echo DPS', asOf: Date.now(),
      limit: ECHO_LIMIT,
      rewards: period === 'all' ? null : { kind: period, tiers: rewardTiers(period),
        note: 'Top 100 are paid when the period ends (Singapore time), as gifts on your next sync.' },
      entries: rows.results.map((row, index) => ({
        rank: index + 1, name: row.username, level: Number(row.level) || 1,
        cls: row.cls || 'Novice', dps: Math.max(0, Number(row.dps) || 0),
      })),
    });
  }

  let rows;
  if (period === 'all') {
    rows = await env.DB.prepare(`
      SELECT u.username, s.level, s.cls, k.kills
      FROM leaderboard_kills k
      JOIN users u ON u.id = k.user_id
      JOIN saves s ON s.user_id = u.id
      WHERE k.period_key = 'all'
      ORDER BY k.kills DESC, s.level DESC, u.username COLLATE NOCASE ASC
      LIMIT ?`).bind(LIMIT).all();
  } else if (period === 'daily') {
    rows = await env.DB.prepare(`
      SELECT u.username, s.level, s.cls, k.kills
      FROM leaderboard_kills k
      JOIN users u ON u.id = k.user_id
      JOIN saves s ON s.user_id = u.id
      WHERE k.period_key = ? AND k.kills > 0
      ORDER BY k.kills DESC, s.level DESC, u.username COLLATE NOCASE ASC
      LIMIT ?`).bind(window.start, LIMIT).all();
  } else {
    rows = await env.DB.prepare(`
      SELECT u.username, s.level, s.cls, SUM(k.kills) AS kills
      FROM leaderboard_kills k
      JOIN users u ON u.id = k.user_id
      JOIN saves s ON s.user_id = u.id
      WHERE k.period_key BETWEEN ? AND ? AND k.period_key <> 'all'
      GROUP BY u.id, u.username, s.level, s.cls
      HAVING SUM(k.kills) > 0
      ORDER BY SUM(k.kills) DESC, s.level DESC, u.username COLLATE NOCASE ASC
      LIMIT ?`).bind(window.start, window.end, LIMIT).all();
  }

  return json({
    board,
    period: window.period,
    timeZone: window.timeZone,
    start: window.start,
    end: window.end,
    label: window.label,
    asOf: Date.now(),
    limit: LIMIT,
    entries: rows.results.map((row, index) => ({
      rank: index + 1,
      name: row.username,
      level: Number(row.level) || 1,
      cls: row.cls || 'Novice',
      kills: Math.max(0, Number(row.kills) || 0),
    })),
  });
});
