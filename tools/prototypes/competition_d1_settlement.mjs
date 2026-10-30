// LOCAL PROTOTYPE ONLY: not application code, not imported by Functions, no public endpoint.
// Scores, period definitions, clocks and prize tiers MUST come from a future trustworthy
// server. This code does not verify gameplay, clients, inventory, eligibility or identity.
import { randomUUID } from 'node:crypto';

export async function settleSyntheticPeriod(db, period, serverNow, {injectFailure=false}={}) {
  if(typeof period!=='string'||!period||!Number.isSafeInteger(serverNow))throw new TypeError('invalid synthetic input');
  const token=randomUUID(); // per-attempt claim; never accepted from an untrusted request
  const sql=[
    db.prepare(`UPDATE test_periods SET state='settling', claim=?
      WHERE id=? AND state='open' AND ends<=?`).bind(token,period,serverNow),
    db.prepare(`INSERT INTO test_awards(period_id,user_id,rank,score)
      SELECT ?, s.user_id, ROW_NUMBER() OVER(ORDER BY s.score DESC,s.user_id ASC), s.score
      FROM test_scores s WHERE s.period_id=? AND s.score>0
        AND EXISTS(SELECT 1 FROM test_periods WHERE id=? AND state='settling' AND claim=?)
      ORDER BY s.score DESC,s.user_id ASC LIMIT 100`).bind(period,period,period,token),
    db.prepare(`INSERT INTO test_grants(period_id,user_id,resource,amount)
      SELECT a.period_id,a.user_id,t.resource,t.amount FROM test_awards a
      JOIN test_periods p ON p.id=a.period_id
      JOIN test_tiers t ON t.kind=p.kind AND t.rank=a.rank
      WHERE a.period_id=? AND p.state='settling' AND p.claim=?`).bind(period,token),
  ];
  // Fault injection lives only in this disconnected test module, never a deployed handler.
  if(injectFailure)sql.push(db.prepare('INSERT INTO test_grants(period_id,user_id,resource,amount) VALUES(NULL,1,\'bad\',1)'));
  sql.push(db.prepare(`UPDATE test_periods SET state='closed', closed_at=?, claim=NULL
    WHERE id=? AND state='settling' AND claim=?`).bind(serverNow,period,token));
  const result=await db.batch(sql);
  return Number(result[0]?.meta?.changes ?? 0)===1 ? 'settled' : 'not settled';
}
