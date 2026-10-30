// GET /api/board?period=daily|weekly|all&board=kills|echo -> { board, period, ..., entries }
//
// Names, levels and scores are public leaderboard fields only. A valid server session is required.
// Daily/weekly kills count increases observed when cloud saves are accepted; all-time is seeded from
// existing cloud saves and then maintained by the D1 trigger in migrations/0002_leaderboard.sql.
// Scores are browser-reported and unverified. The new Echo season pays its Top
// 100 daily/weekly via atomic, lazy settlement (unverified-echo.js); legacy
// daily/weekly data is retained but never automatically back-paid.

import { currentUser } from '../_lib/auth.js';
import { json, guard, fail } from '../_lib/http.js';
import { BOARD_PERIODS, boardWindow, boardWeekStart } from '../_lib/board.js';
import { ECHO_LIMIT, ECHO_REWARDS, echoPrizeText } from '../_lib/echo-board.js';
import { unverifiedConfig, unverifiedWindows, settleUnverifiedEcho } from '../_lib/unverified-echo.js';

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

  // These standings use editable saves and are not trustworthy competitive
  // evidence. Existing gear remains personal; flags never affect scores.
  if (board === 'echo') {
    let config;
    try { config=await unverifiedConfig(env.DB); if(!config)throw new Error('Missing launch configuration'); await settleUnverifiedEcho(env.DB); }
    catch { return fail('Echo standings are temporarily unavailable; please try again later.',503); }
    const windows=unverifiedWindows(), key=period==='all'?'all':period==='daily'?windows.day.key:windows.week.key;
    let rows;
    if(period==='all'){
      rows=await env.DB.prepare(`SELECT u.username,s.level,s.cls,e.dps FROM leaderboard_echo e
        JOIN users u ON u.id=e.user_id JOIN saves s ON s.user_id=u.id
        WHERE e.period_key='all' AND e.dps>0 ORDER BY e.dps DESC,u.id ASC LIMIT ?`).bind(ECHO_LIMIT).all();
    }else{
      rows=await env.DB.prepare(`SELECT u.username,s.level,s.cls,c.score AS dps FROM competition_scores c
        JOIN competition_periods p ON p.period_key=c.period_key
        JOIN users u ON u.id=c.user_id JOIN saves s ON s.user_id=u.id
        WHERE c.period_key=? AND p.ruleset='unverified-save-v1' AND c.score>0
        ORDER BY c.score DESC,c.user_id ASC LIMIT ?`).bind(key,ECHO_LIMIT).all();
    }
    const periodStart=period==='daily'?windows.day.start:windows.week.start;
    const notStarted=period!=='all' && periodStart<Number(config.starts_at);
    return json({
      board,period:window.period,timeZone:window.timeZone,start:window.start,end:window.end,
      label:(period==='all'?'All-time':window.label)+' · Endless Echo DPS',asOf:Date.now(),limit:ECHO_LIMIT,
      integrity:'unverified',startsAt:Number(config.starts_at),
      rewards:period==='all'?null:{kind:period,tiers:rewardTiers(period),
        note:notStarted?'Fresh prize periods start after launch: daily at the next Singapore midnight and weekly with the next full week.':
          'Top 100 prizes are queued after the period ends when a player syncs or views the board. Scores are client-reported and can be falsified.'},
      entries:rows.results.map((row,index)=>({rank:index+1,name:row.username,level:Number(row.level)||1,
        cls:row.cls||'Novice',dps:Math.max(0,Number(row.dps)||0)})),
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
    integrity: 'unverified',
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
