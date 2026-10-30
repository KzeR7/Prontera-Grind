// Synthetic in-memory SQL prototype only: these are NOT verified game scores or production payouts.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createSettlementPrototype } from '../prototypes/competition_settlement.mjs';
const db=new DatabaseSync(':memory:');
try {
  const {recordVerifiedResult:record,settle}=createSettlementPrototype(db);
  db.prepare('INSERT INTO periods(id,kind,starts,ends) VALUES(?,?,?,?)').run('synthetic','daily',1000,2000);
  const score=(eventId,userId,n,serverNow=1500)=>({period:'synthetic',eventId,userId,score:n,serverNow});
  assert.throws(()=>record(score('early',1,100,999)),/period closed/);
  assert.equal(record(score('a1',1,100)),'accepted');
  assert.equal(record(score('a1',1,100)),'duplicate');
  assert.throws(()=>record(score('a1',1,101)),/conflicting event replay/);
  assert.equal(record(score('a2',1,200)),'accepted');
  assert.equal(record(score('a3',1,150)),'accepted');
  assert.equal(record(score('b1',2,200)),'accepted');
  assert.equal(record(score('c1',3,125)),'accepted');
  assert.throws(()=>settle('synthetic',1999),/still open/);
  assert.throws(()=>record(score('late',4,1000,2000)),/period closed/);
  // Failure after writing multiple grants must roll back the marker, awards AND grants.
  assert.throws(()=>settle('synthetic',2000,{failAfterGrants:2}),/injected/);
  assert.equal(db.prepare('SELECT state FROM periods').get().state,'open');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM awards').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM grants').get().n,0);
  assert.equal(settle('synthetic',2001),'settled');
  assert.deepEqual(db.prepare('SELECT user_id,rank,score FROM awards ORDER BY rank').all().map(r=>({...r})),[
    {user_id:1,rank:1,score:200},{user_id:2,rank:2,score:200},{user_id:3,rank:3,score:125}]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM grants').get().n,6);
  assert.equal(settle('synthetic',2002),'already settled');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM grants').get().n,6);
  assert.equal(record(score('a1',1,100,3000)),'duplicate','an existing event can be acknowledged after cutoff without mutation');
  assert.throws(()=>record(score('new',5,99999,3000)),/period closed/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM events').get().n,5);
  console.log('PASS: isolated settlement prototype rejects replays/cutoff abuse and rolls back partial payout before retry');
}finally{db.close()}
