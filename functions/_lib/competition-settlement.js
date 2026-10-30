// Atomic settlement builder shared by disposable tests and the explicitly
// unverified launch path. This does not establish score integrity.
import { ECHO_REWARDS } from './echo-board.js';

export async function settleCompetitivePeriod() {
  throw new Error('Competitive scoring and payouts are paused: verified runs are not implemented.');
}

// Batch construction is not authorization. Callers must enforce a ruleset,
// use server-generated tokens/timestamps, and let D1 commit the whole batch.
export function buildSettlementBatch(db,periodKey,at,token,ruleset) {
  if(typeof periodKey!=='string'||!/^(day|week):\d{4}-\d{2}-\d{2}$/.test(periodKey))throw new TypeError('Invalid period');
  if(!Number.isSafeInteger(at)||at<0)throw new TypeError('Invalid timestamp');
  if(typeof token!=='string'||!/^[0-9a-f-]{36}$/.test(token))throw new TypeError('Invalid token');
  if(ruleset!==undefined && ruleset!=='unverified-save-v1')throw new TypeError('Invalid ruleset');
  const tiers=[];
  for(const kind of ['daily','weekly']){
    let first=1;
    for(const [last,prizes] of ECHO_REWARDS[kind]) {
      for(const [resource,amount] of prizes)tiers.push([kind,first,last,resource,amount]);
      first=last+1;
    }
  }
  const values=tiers.map(()=>'(?,?,?,?,?)').join(',');
  return [
    db.prepare(`UPDATE competition_periods SET state='settling',claim_token=?
      WHERE period_key=? AND state='open' AND ends_at<=?
        AND ends_at<=CAST(strftime('%s','now') AS INTEGER)*1000
        AND (? IS NULL OR ruleset=?)`).bind(token,periodKey,at,ruleset??null,ruleset??null),
    db.prepare(`INSERT INTO competition_placements(period_key,user_id,rank,score,run_id)
      SELECT s.period_key,s.user_id,ROW_NUMBER() OVER(ORDER BY s.score DESC,s.user_id ASC),s.score,s.run_id
      FROM competition_scores s WHERE s.period_key=? AND s.score>0
        AND EXISTS(SELECT 1 FROM competition_periods p WHERE p.period_key=s.period_key
          AND p.state='settling' AND p.claim_token=?)
      ORDER BY s.score DESC,s.user_id ASC LIMIT 100`).bind(periodKey,token),
    db.prepare(`WITH tiers(kind,first_rank,last_rank,resource,amount) AS (VALUES ${values})
      INSERT INTO competition_prize_ledger(period_key,user_id,resource,amount,created_at)
      SELECT a.period_key,a.user_id,t.resource,t.amount,? FROM competition_placements a
      JOIN competition_periods p ON p.period_key=a.period_key
      JOIN tiers t ON t.kind=p.kind AND a.rank BETWEEN t.first_rank AND t.last_rank
      WHERE a.period_key=? AND p.state='settling' AND p.claim_token=?`)
      .bind(...tiers.flat(),at,periodKey,token),
    db.prepare(`UPDATE competition_periods SET state='closed',closed_at=?,claim_token=NULL
      WHERE period_key=? AND state='settling' AND claim_token=?`).bind(at,periodKey,token),
  ];
}
