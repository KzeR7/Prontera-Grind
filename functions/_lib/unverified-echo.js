// Casual, UNVERIFIED Echo scoreboard: all scores and equipment come from
// browser-authored saves. It is possible to forge them. Anomaly flags do not
// block scoring or grants. Legacy scores are never used for new payouts.
import { boardDayKey,boardWeekStart } from './board.js';
import { buildSettlementBatch } from './competition-settlement.js';
const DAY=86_400_000, OFFSET=8*60*60*1000;
const isDps=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const msForKey=k=>Date.parse(k+'T00:00:00Z')-OFFSET;
export function unverifiedWindows(at=Date.now()) {
  const day=boardDayKey(at),week=boardWeekStart(day);
  return {day:{key:'day:'+day,kind:'daily',start:msForKey(day),end:msForKey(day)+DAY},
    week:{key:'week:'+week,kind:'weekly',start:msForKey(week),end:msForKey(week)+7*DAY}};
}
export async function unverifiedConfig(db){
  let row=await db.prepare('SELECT starts_at FROM unverified_echo_config WHERE singleton=1').first();
  if(row && Number(row.starts_at)===0){
    // Initialize on first request, not migration: early migration must not
    // silently turn the first deployed day/week into a partial competition.
    await db.prepare(`UPDATE unverified_echo_config
      SET starts_at=((CAST(strftime('%s','now') AS INTEGER)+28800)/86400+1)*86400000-28800000
      WHERE singleton=1 AND starts_at=0`).run();
    row=await db.prepare('SELECT starts_at FROM unverified_echo_config WHERE singleton=1').first();
  }
  return row;
}
// Invoked only after an accepted save. Reported day/week high-water marks must
// match the server's current Singapore periods. Closed/old periods are never
// backfilled. Each player's own saved gear is left untouched.
export async function recordUnverifiedEcho(db,userId,save,at=Date.now()){
  const config=await unverifiedConfig(db);if(!config)throw new Error('Echo launch configuration missing');
  const trial=save?.trial,board=trial?.echoBoard;
  const windows=unverifiedWindows(at),start=Number(config.starts_at), statements=[];
  for(const [w,stamp,value] of [[windows.day,board?.day,board?.dayDps],[windows.week,board?.week,board?.weekDps]]){
    if(w.start<start || stamp!==w.key.slice(w.key.indexOf(':')+1) || !isDps(value))continue;
    statements.push(db.prepare(`INSERT INTO competition_periods(period_key,kind,ruleset,starts_at,ends_at)
      VALUES(?,?,'unverified-save-v1',?,?) ON CONFLICT(period_key) DO NOTHING`).bind(w.key,w.kind,w.start,w.end));
    statements.push(db.prepare(`INSERT INTO competition_scores(period_key,user_id,run_id,score,recorded_at)
      SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM competition_periods WHERE period_key=? AND ruleset='unverified-save-v1' AND state='open')
      ON CONFLICT(period_key,user_id) DO UPDATE SET score=excluded.score,recorded_at=excluded.recorded_at
      WHERE excluded.score>competition_scores.score`).bind(w.key,userId,'save:'+userId,value,at,w.key));
  }
  // All-time is an explicitly unverified personal high-water mark, retained in
  // the old table for continuity. It is NEVER used to settle leaderboard prizes.
  if(isDps(trial?.best))statements.push(db.prepare(`INSERT INTO leaderboard_echo(user_id,period_key,dps) VALUES(?,'all',?)
    ON CONFLICT(user_id,period_key) DO UPDATE SET dps=excluded.dps WHERE excluded.dps>leaderboard_echo.dps`).bind(userId,trial.best));
  if(statements.length)await db.batch(statements);
}
// A period is claimed, ranked and granted in one atomic batch. This operates
// ONLY on explicitly unverified-save-v1 periods, never legacy board rows or
// any future verified competition. A failed batch remains retryable.
export async function settleUnverifiedEcho(db,at=Date.now()){
  const due=await db.prepare(`SELECT period_key FROM competition_periods WHERE state='open' AND ruleset='unverified-save-v1'
    AND ends_at<=? ORDER BY ends_at,period_key LIMIT 20`).bind(at).all();
  for(const row of due.results||[]){
    const token=crypto.randomUUID();
    await db.batch(buildSettlementBatch(db,row.period_key,at,token,'unverified-save-v1'));
  }
}
