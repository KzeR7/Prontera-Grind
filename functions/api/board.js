// GET /api/board?period=daily|weekly|all -> { period, timeZone, start, end, label, entries }
//
// Names, levels and scores are public leaderboard fields only. A valid server session is required.
// Daily/weekly kills count increases observed when cloud saves are accepted; all-time is seeded from
// existing cloud saves and then maintained by the D1 trigger in migrations/0002_leaderboard.sql.

import { currentUser } from '../_lib/auth.js';
import { json, guard, fail } from '../_lib/http.js';
import { BOARD_PERIODS, boardWindow } from '../_lib/board.js';

const LIMIT = 50;

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);

  const url = new URL(request.url);
  const period = url.searchParams.get('period') || 'daily';
  if (!BOARD_PERIODS.includes(period)) return fail('Choose daily, weekly, or all.', 400);
  const window = boardWindow(period);

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
    period: window.period,
    timeZone: window.timeZone,
    start: window.start,
    end: window.end,
    label: window.label,
    asOf: Date.now(),
    entries: rows.results.map((row, index) => ({
      rank: index + 1,
      name: row.username,
      level: Number(row.level) || 1,
      cls: row.cls || 'Novice',
      kills: Math.max(0, Number(row.kills) || 0),
    })),
  });
});
