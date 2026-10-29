// LOCAL PROTOTYPE ONLY. No application import or public endpoint uses this module.
// Inputs are assumed to have ALREADY been verified by a future authoritative engine;
// this module does not verify gameplay, identity, gear, user clocks, or eligibility.
// `serverNow` is injected by the test harness, not a value a production client may choose.
import { echoRewardFor } from '../../functions/_lib/echo-board.js';

export function createSettlementPrototype(db) {
  db.exec(`
    CREATE TABLE periods (id TEXT PRIMARY KEY, kind TEXT NOT NULL, starts INTEGER NOT NULL, ends INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'open', closed_at INTEGER);
    CREATE TABLE events (period TEXT NOT NULL, event_id TEXT NOT NULL, user_id INTEGER NOT NULL, score INTEGER NOT NULL,
      accepted_at INTEGER NOT NULL, PRIMARY KEY(period,event_id));
    CREATE TABLE scores (period TEXT NOT NULL, user_id INTEGER NOT NULL, score INTEGER NOT NULL, PRIMARY KEY(period,user_id));
    CREATE TABLE awards (period TEXT NOT NULL, user_id INTEGER NOT NULL, rank INTEGER NOT NULL, score INTEGER NOT NULL,
      PRIMARY KEY(period,user_id));
    CREATE TABLE grants (period TEXT NOT NULL, user_id INTEGER NOT NULL, resource TEXT NOT NULL, amount INTEGER NOT NULL,
      PRIMARY KEY(period,user_id,resource));
  `);
  const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const out=fn();db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}};
  function recordVerifiedResult({period,eventId,userId,score,serverNow}) {
    if(typeof period!=='string'||typeof eventId!=='string'||!eventId||eventId.length>100||
       !Number.isSafeInteger(userId)||userId<1||!Number.isSafeInteger(score)||score<1||!Number.isSafeInteger(serverNow))
      throw new Error('invalid prototype input');
    return tx(()=>{
      const old=db.prepare('SELECT user_id,score FROM events WHERE period=? AND event_id=?').get(period,eventId);
      if(old){if(old.user_id!==userId||old.score!==score)throw new Error('conflicting event replay');return 'duplicate';}
      const p=db.prepare('SELECT * FROM periods WHERE id=?').get(period);
      if(!p||p.state!=='open'||serverNow<p.starts||serverNow>=p.ends)throw new Error('period closed');
      db.prepare('INSERT INTO events(period,event_id,user_id,score,accepted_at) VALUES(?,?,?,?,?)').run(period,eventId,userId,score,serverNow);
      db.prepare(`INSERT INTO scores(period,user_id,score) VALUES(?,?,?) ON CONFLICT(period,user_id)
        DO UPDATE SET score=MAX(scores.score,excluded.score)`).run(period,userId,score);
      return 'accepted';
    });
  }
  function settle(period,serverNow,{failAfterGrants=Infinity}={}) {
    if(!Number.isSafeInteger(serverNow))throw new Error('invalid prototype clock');
    return tx(()=>{
      const p=db.prepare('SELECT * FROM periods WHERE id=?').get(period);
      if(!p)throw new Error('unknown period');
      if(p.state==='closed')return 'already settled';
      if(serverNow<p.ends)throw new Error('period still open');
      db.prepare("UPDATE periods SET state='closed',closed_at=? WHERE id=?").run(serverNow,period);
      const scores=db.prepare('SELECT user_id,score FROM scores WHERE period=? ORDER BY score DESC,user_id ASC LIMIT 100').all(period);
      let count=0;
      scores.forEach((row,i)=>{
        db.prepare('INSERT INTO awards(period,user_id,rank,score) VALUES(?,?,?,?)').run(period,row.user_id,i+1,row.score);
        for(const prize of echoRewardFor(p.kind,i+1)){
          db.prepare('INSERT INTO grants(period,user_id,resource,amount) VALUES(?,?,?,?)').run(period,row.user_id,prize.resource,prize.amount);
          if(++count===failAfterGrants)throw new Error('injected settlement failure');
        }
      });
      return 'settled';
    });
  }
  return {recordVerifiedResult,settle};
}
