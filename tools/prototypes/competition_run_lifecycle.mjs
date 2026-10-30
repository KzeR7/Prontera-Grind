// LOCAL RESEARCH ONLY, never imported by Functions. This models run lifecycle,
// NOT actual game scoring. It requires Node's synchronous SQLite API and synthetic
// server-owned profile rows. There is no authentication, live data or endpoint.
// In production, identity, time, eligibility, randomness and loadout must be trusted;
// client-submitted scores, loadouts, clocks and seeds must never reach this boundary.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { basicEchoStrike } from './echo_basic_attack.mjs';

const DURATION=180_000, MAX_ATTEMPTS=2;
const allowedKeys=(obj,keys)=>obj && typeof obj==='object' && !Array.isArray(obj) &&
  Object.keys(obj).length===keys.length && keys.every(k=>Object.hasOwn(obj,k));
const validUser=id=>Number.isSafeInteger(id)&&id>0;
const validPeriod=id=>typeof id==='string'&&/^[a-z0-9-]{1,32}$/.test(id);
const validRun=id=>typeof id==='string'&&/^[0-9a-f-]{36}$/.test(id);
const validTime=t=>Number.isSafeInteger(t)&&t>=0;

export function createSyntheticRunService(db,{clock=Date.now}={}){
  db.exec(`CREATE TABLE IF NOT EXISTS proto_profiles (
    user_id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL, gm INTEGER NOT NULL,
    base INTEGER NOT NULL CHECK(base BETWEEN 1 AND 100000), dex INTEGER NOT NULL CHECK(dex BETWEEN 1 AND 120));
    CREATE TABLE IF NOT EXISTS proto_periods (
      id TEXT PRIMARY KEY, starts INTEGER NOT NULL, ends INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('open','closed')));
    CREATE TABLE IF NOT EXISTS proto_runs (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, period_id TEXT NOT NULL,
      started INTEGER NOT NULL, ends INTEGER NOT NULL, loadout TEXT NOT NULL, seed TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active','finished','expired')),
      score INTEGER, finished INTEGER,
      FOREIGN KEY(user_id) REFERENCES proto_profiles(user_id), FOREIGN KEY(period_id) REFERENCES proto_periods(id));
    CREATE UNIQUE INDEX IF NOT EXISTS proto_one_active ON proto_runs(user_id) WHERE status='active';
    CREATE TABLE IF NOT EXISTS proto_scores (
      period_id TEXT NOT NULL, user_id INTEGER NOT NULL, score INTEGER NOT NULL, run_id TEXT NOT NULL,
      PRIMARY KEY(period_id,user_id), FOREIGN KEY(run_id) REFERENCES proto_runs(id));`);
  const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}};
  function now(){const t=clock();if(!validTime(t))throw Error('invalid server clock');return t}
  function start(args){
    if(!allowedKeys(args,['userId','periodId'])||!validUser(args.userId)||!validPeriod(args.periodId))throw Error('invalid run request');
    const t=now();
    return tx(()=>{
      // Once its period ends, an abandoned run cannot lock the next period forever.
      db.prepare(`UPDATE proto_runs SET status='expired' WHERE user_id=? AND status='active'
        AND EXISTS(SELECT 1 FROM proto_periods p WHERE p.id=proto_runs.period_id AND p.ends<=?)`).run(args.userId,t);
      const p=db.prepare('SELECT * FROM proto_periods WHERE id=?').get(args.periodId);
      const player=db.prepare('SELECT * FROM proto_profiles WHERE user_id=?').get(args.userId);
      if(!p||p.state!=='open'||t<p.starts||t+DURATION>=p.ends)throw Error('period unavailable');
      if(!player||player.enabled!==1||player.gm!==0)throw Error('ineligible'); // prototype policy, not a product decision
      if(db.prepare("SELECT 1 FROM proto_runs WHERE user_id=? AND status='active'").get(args.userId))throw Error('run already active');
      const attempts=db.prepare('SELECT COUNT(*) n FROM proto_runs WHERE user_id=? AND period_id=?').get(args.userId,args.periodId).n;
      if(attempts>=MAX_ATTEMPTS)throw Error('attempts exhausted');
      // Snapshot copied from synthetic server-owned rows; no part is accepted from the caller.
      const loadout=JSON.stringify({base:player.base,dex:player.dex});
      const id=randomUUID(),seed=randomBytes(32).toString('hex');
      db.prepare(`INSERT INTO proto_runs(id,user_id,period_id,started,ends,loadout,seed,status)
        VALUES(?,?,?,?,?,?,?,'active')`).run(id,args.userId,args.periodId,t,t+DURATION,loadout,seed);
      return {id,ends:t+DURATION}; // Do not return seed/loadout as an authority credential.
    });
  }
  function finish(args){
    if(!allowedKeys(args,['userId','runId'])||!validUser(args.userId)||!validRun(args.runId))throw Error('invalid finish request');
    const t=now();
    return tx(()=>{
      const r=db.prepare('SELECT r.*,p.ends AS period_ends,p.state AS period_state FROM proto_runs r JOIN proto_periods p ON p.id=r.period_id WHERE r.id=? AND r.user_id=?').get(args.runId,args.userId);
      if(!r)throw Error('run unavailable');
      if(r.status==='finished')return {status:'finished',score:r.score}; // retry does not write or duplicate score
      if(r.status!=='active'||r.period_state!=='open'||t>=r.period_ends)throw Error('run unavailable');
      if(t<r.ends)throw Error('run not finished');
      // A deliberately simplified synthetic engine: 180 basic hits with a dummy loadout.
      // NOT a replay of a player's skills, pets, buffs, timings or actual Echo run.
      const loadout=JSON.parse(r.loadout),stats={...loadout,missChance:0,critChance:0,critDamage:1,
        fieldDamage:1,ascDamage:1,bladeBonus:0,rangedBonus:0};
      let damage=0;
      for(let i=0;i<180;i++){
        const hash=createHash('sha256').update(r.seed+':'+i).digest();
        const rolls=[0,4,8].map(off=>hash.readUInt32BE(off)/0x100000000);
        damage+=basicEchoStrike(stats,rolls).damage;
      }
      const score=Math.floor(damage/180);
      db.prepare("UPDATE proto_runs SET status='finished',score=?,finished=? WHERE id=? AND status='active'").run(score,t,r.id);
      db.prepare(`INSERT INTO proto_scores(period_id,user_id,score,run_id) VALUES(?,?,?,?)
        ON CONFLICT(period_id,user_id) DO UPDATE SET score=excluded.score,run_id=excluded.run_id
        WHERE excluded.score>proto_scores.score`).run(r.period_id,r.user_id,score,r.id);
      return {status:'finished',score};
    });
  }
  return {start,finish};
}
