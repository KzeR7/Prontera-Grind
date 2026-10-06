// Calendar windows for the player leaderboard. Malaysia and Singapore share UTC+08:00 year-round.
export const BOARD_TIME_ZONE = 'Asia/Singapore';
export const BOARD_PERIODS = ['daily', 'weekly', 'all'];
const DAY_MS = 86_400_000;
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

export function boardDayKey(at = Date.now()) {
  return new Date(Number(at) + SGT_OFFSET_MS).toISOString().slice(0, 10);
}

// Weeks begin Monday at 00:00 Singapore time.
export function boardWeekStart(dayKey) {
  const [year, month, day] = String(dayKey).split('-').map(Number);
  if (![year, month, day].every(Number.isInteger)) throw new TypeError('Invalid leaderboard day.');
  const utcDay = Date.UTC(year, month - 1, day);
  const mondayOffset = (new Date(utcDay).getUTCDay() + 6) % 7;
  return new Date(utcDay - mondayOffset * DAY_MS).toISOString().slice(0, 10);
}

export function boardWindow(period, at = Date.now()) {
  if (!BOARD_PERIODS.includes(period)) throw new TypeError('Invalid leaderboard period.');
  const today = boardDayKey(at);
  if (period === 'all') {
    return { period, timeZone: BOARD_TIME_ZONE, start: null, end: null, label: 'All-time' };
  }
  if (period === 'daily') {
    return { period, timeZone: BOARD_TIME_ZONE, start: today, end: today, label: `Today · ${today} SGT` };
  }
  const start = boardWeekStart(today);
  return { period, timeZone: BOARD_TIME_ZONE, start, end: today, label: `This week · ${start} to ${today} SGT` };
}
