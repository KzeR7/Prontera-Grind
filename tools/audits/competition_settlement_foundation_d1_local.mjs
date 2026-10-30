// Local-only workerd/Miniflare D1 audit of candidate statements; synthetic
// accounts/scores. No hosted binding or public settlement endpoint is used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { freshDb } from '../dev_server.js';
import { buildSettlementBatch,settleCompetitivePeriod } from '../../functions/_lib/competition-settlement.js';
const require=createRequire(import.meta.url),mod=require(process.env.PG_MINIFLARE_MODULE||'miniflare');
const options={host:'127.0.0.1',cf:false,modules:true,compatibilityDate:'2026-10-01',
 script:'export default {fetch(){return new Response("local synthetic D1 only")}}',d1Databases:{DB:'synthetic-settlement-foundation'}};
const mf=new mod.Miniflare(mod.convertV4MiniflareOptions?mod.convertV4MiniflareOptions(options):options);
const sqlite=freshDb();
try{
 const db=await mf.getD1Database('DB');
 const names=['users','grants','competition_periods','competition_scores','competition_placements','competition_prize_ledger'];
 const all=sqlite.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all()
  .filter(r=>names.includes(r.name)||r.name.startsWith('competition_')||r.name==='idx_competition_scores_rank');
 await db.batch(all.map(r=>db.prepare(r.sql)));
 const now=Date.now(),start=Math.floor(now/1000)*1000-1000,end=Math.ceil(now/1000)*1000+1000,key='day:2026-10-29';
 await db.batch([
   db.prepare("INSERT INTO users(id,username,pass_hash,created_at) VALUES(1,'Synthetic1','x',?), (2,'Synthetic2','x',?)").bind(now,now),
   db.prepare("INSERT INTO competition_periods(period_key,kind,ruleset,starts_at,ends_at) VALUES(?,'daily','unverified-save-v1',?,?)").bind(key,start,end),
   db.prepare("INSERT INTO competition_scores(period_key,user_id,run_id,score,recorded_at) VALUES(?,1,'run1',100,?),(?,2,'run2',100,?)").bind(key,now,key,now),
 ]);
 const batch=()=>buildSettlementBatch(db,key,Date.now(),randomUUID(),'unverified-save-v1');
 assert.equal((await db.batch(batch()))[0].meta.changes,0);
 await assert.rejects(settleCompetitivePeriod(db,key),/paused/);
 await new Promise(r=>setTimeout(r,Math.max(0,end-Date.now()+100)));
 const broken=batch();broken.splice(3,0,db.prepare("UPDATE competition_periods SET state='invalid' WHERE period_key=?").bind(key));
 await assert.rejects(db.batch(broken));
 assert.equal((await db.prepare('SELECT count(*) n FROM grants').first()).n,0);
 assert.equal((await db.prepare('SELECT state FROM competition_periods WHERE period_key=?').bind(key).first()).state,'open');
 const rs=await Promise.all([db.batch(batch()),db.batch(batch()),db.batch(batch())]);
 assert.deepEqual(rs.map(r=>r[0].meta.changes).sort(),[0,0,1]);
 const rows=(await db.prepare('SELECT p.rank,p.user_id,l.resource,l.amount,g.payload FROM competition_placements p JOIN competition_prize_ledger l ON l.period_key=p.period_key AND l.user_id=p.user_id JOIN grants g ON g.id=l.grant_id ORDER BY p.rank,l.resource').all()).results;
 assert.equal(rows.length,4);assert.deepEqual(rows.map(r=>r.user_id),[1,1,2,2]);
 for(const r of rows)assert.deepEqual(JSON.parse(r.payload),{resource:r.resource,amount:r.amount});
 assert.equal((await db.prepare('SELECT count(*) n FROM grants').first()).n,4);
 console.log('PASS: disposable local workerd/D1: rollback, concurrent/retry settlement, deterministic placement and real-format linked grants');
 console.log('LIMIT: synthetic scores; no live payout, authority, hosted concurrency or recipient delivery verification.');
}finally{sqlite.close();await mf.dispose()}
