// Strictly synthetic local SQLite. No endpoints, real players or real scoring.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
(async()=>{
 const {createSyntheticRunService}=await import('../prototypes/competition_run_lifecycle.mjs');
 const db=new DatabaseSync(':memory:'); let t=1000;
 try{
  db.exec('PRAGMA foreign_keys=ON');
  const {start,finish}=createSyntheticRunService(db,{clock:()=>t});
  db.exec(`INSERT INTO proto_profiles VALUES(1,1,0,100,60),(2,1,0,100,60),(3,1,1,100,60),(4,0,0,100,60);
    INSERT INTO proto_periods VALUES('day-1',1000,1000000,'open'),('day-2',1000000,2000000,'open');`);
  const run=start({userId:1,periodId:'day-1'});
  assert.deepEqual(Object.keys(run).sort(),['ends','id']);
  assert.throws(()=>start({userId:1,periodId:'day-1'}),/already active/);
  assert.throws(()=>start({userId:3,periodId:'day-1'}),/ineligible/);
  assert.throws(()=>start({userId:4,periodId:'day-1'}),/ineligible/);
  assert.throws(()=>start({userId:1,periodId:'day-1',score:1e12}),/invalid run request/);
  assert.throws(()=>start({userId:2,periodId:'day-1',seed:'chosen',loadout:{base:99999}}),/invalid run request/);
  assert.throws(()=>finish({userId:1,runId:run.id,score:1e12}),/invalid finish request/);
  assert.throws(()=>finish({userId:2,runId:run.id}),/unavailable/);
  assert.throws(()=>finish({userId:1,runId:run.id}),/not finished/);
  // An edited profile after starting cannot change the snapshot in an ongoing run.
  assert.equal(JSON.parse(db.prepare('SELECT loadout FROM proto_runs WHERE id=?').get(run.id).loadout).base,100);
  db.prepare('UPDATE proto_profiles SET base=99999 WHERE user_id=1').run();
  t=run.ends;const result=finish({userId:1,runId:run.id});
  assert.equal(result.status,'finished');assert.ok(result.score>=70&&result.score<=115,'used original synthetic 100-power snapshot');
  assert.deepEqual(finish({userId:1,runId:run.id}),result,'duplicate completion is read-only');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM proto_scores').get().n,1);
  const second=start({userId:1,periodId:'day-1'});t=second.ends;finish({userId:1,runId:second.id});
  assert.throws(()=>start({userId:1,periodId:'day-1'}),/attempts exhausted/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM proto_runs WHERE user_id=1').get().n,2);
  const unclaimed=start({userId:2,periodId:'day-1'});
  t=1000000;assert.throws(()=>finish({userId:2,runId:unclaimed.id}),/unavailable/);
  const next=start({userId:2,periodId:'day-2'});
  assert.equal(db.prepare('SELECT status FROM proto_runs WHERE id=?').get(unclaimed.id).status,'expired');
  t=next.ends-1;assert.throws(()=>finish({userId:2,runId:next.id}),/not finished/);
  t=next.ends;
  // A write failure must not consume the run or partially publish a score.
  db.exec(`CREATE TRIGGER proto_fail BEFORE INSERT ON proto_scores WHEN NEW.user_id=2 BEGIN SELECT RAISE(ABORT,'injected score failure'); END`);
  assert.throws(()=>finish({userId:2,runId:next.id}),/injected score failure/);
  assert.equal(db.prepare('SELECT status FROM proto_runs WHERE id=?').get(next.id).status,'active');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM proto_scores WHERE user_id=2').get().n,0);
  db.exec('DROP TRIGGER proto_fail');
  assert.equal(finish({userId:2,runId:next.id}).status,'finished');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM proto_scores').get().n,2);
  console.log('PASS: synthetic server-owned snapshots, fixed run timing, ownership, cutoff, attempt limits and replay-safe finish. NOT real gameplay or hosted D1 proof.');
 }finally{db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
