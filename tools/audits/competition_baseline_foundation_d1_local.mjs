// Disposable local workerd/D1; synthetic pre-cutover save snapshots only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { freshDb } from '../dev_server.js';
import { buildBaselineCapture,captureCompetitionBaseline } from '../../functions/_lib/competition-baseline.js';
const require=createRequire(import.meta.url),mod=require(process.env.PG_MINIFLARE_MODULE||'miniflare');
const options={host:'127.0.0.1',cf:false,modules:true,compatibilityDate:'2026-10-01',
 script:'export default {fetch(){return new Response("local synthetic D1 only")}}',d1Databases:{DB:'synthetic-legacy-baseline'}};
const mf=new mod.Miniflare(mod.convertV4MiniflareOptions?mod.convertV4MiniflareOptions(options):options),sqlite=freshDb();
try{
 const db=await mf.getD1Database('DB');
 const schemas=sqlite.prepare("SELECT name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all()
  .filter(r=>['users','saves','competition_baselines','competition_baseline_immutable'].includes(r.name));
 await db.batch(schemas.map(r=>db.prepare(r.sql)));
 const cutoff=Math.floor(Date.now()/1000)*1000,old=JSON.stringify({owner:'BaselineD1',lv:1,eq:{weapon:{id:1,val:42}}});
 const newer=JSON.stringify({owner:'BaselineD1',lv:1,eq:{weapon:{id:1,val:999}}});
 await db.batch([
  db.prepare("INSERT INTO users(id,username,pass_hash,created_at) VALUES(1,'BaselineD1','x',?)").bind(cutoff-10000),
  db.prepare('INSERT INTO saves(user_id,version,blob,saved_at,updated_at,last_seen) VALUES(1,1,?,?,?,?)').bind(old,cutoff-1000,cutoff-1000,cutoff-1000),
 ]);
 const candidate=()=>buildBaselineCapture(db,{userId:1,version:1,cutoffAt:cutoff,capturedAt:Date.now()});
 await assert.rejects(captureCompetitionBaseline(db,1),/paused/);
 const [a,b]=await Promise.all([candidate().run(),candidate().run()]);
 assert.deepEqual([a.meta.changes,b.meta.changes].sort(),[0,1]);
 const baseline=await db.prepare('SELECT * FROM competition_baselines WHERE user_id=1').first();
 assert.equal(baseline.save_blob,old);assert.equal(baseline.policy,'grandfathered-unverified-v1');
 await assert.rejects(db.prepare("UPDATE competition_baselines SET save_blob='{}' WHERE user_id=1").run());
 await db.prepare('UPDATE saves SET version=2,blob=?,updated_at=? WHERE user_id=1').bind(newer,cutoff+1).run();
 assert.equal((await candidate().run()).meta.changes,0);
 assert.equal((await db.prepare('SELECT save_blob FROM competition_baselines WHERE user_id=1').first()).save_blob,old);
 assert.equal((await db.prepare('SELECT blob FROM saves WHERE user_id=1').first()).blob,newer);
 console.log('PASS: disposable local workerd/D1 baseline capture is immutable, single-copy and preserves later personal saves');
 console.log('LIMIT: pre-cutover browser data remains unverified; there is no hosted cutover or authoritative gear writer.');
}finally{sqlite.close();await mf.dispose()}
