// Disposable local Miniflare/D1 only. No deployed worker, production config or real data.
// Requires a local Miniflare module (PG_MINIFLARE_MODULE may name its module directory).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { settleSyntheticPeriod } from '../prototypes/competition_d1_settlement.mjs';
const require=createRequire(import.meta.url),mod=require(process.env.PG_MINIFLARE_MODULE||'miniflare');
const old={host:'127.0.0.1',cf:false,modules:true,compatibilityDate:'2026-10-01',
  script:'export default {fetch(){return new Response("local synthetic D1 only")}}',d1Databases:{DB:'synthetic-competition-only'}};
const mf=new mod.Miniflare(mod.convertV4MiniflareOptions?mod.convertV4MiniflareOptions(old):old);
try {
  const db=await mf.getD1Database('DB');
  await db.batch([
    db.prepare("CREATE TABLE test_periods(id TEXT PRIMARY KEY,kind TEXT NOT NULL,ends INTEGER NOT NULL,state TEXT NOT NULL,claim TEXT,closed_at INTEGER)"),
    db.prepare('CREATE TABLE test_scores(period_id TEXT NOT NULL,user_id INTEGER NOT NULL,score INTEGER NOT NULL,PRIMARY KEY(period_id,user_id))'),
    db.prepare('CREATE TABLE test_awards(period_id TEXT NOT NULL,user_id INTEGER NOT NULL,rank INTEGER NOT NULL,score INTEGER NOT NULL,PRIMARY KEY(period_id,user_id),UNIQUE(period_id,rank))'),
    db.prepare('CREATE TABLE test_tiers(kind TEXT NOT NULL,rank INTEGER NOT NULL,resource TEXT NOT NULL,amount INTEGER NOT NULL,PRIMARY KEY(kind,rank,resource))'),
    db.prepare('CREATE TABLE test_grants(period_id TEXT NOT NULL,user_id INTEGER NOT NULL,resource TEXT NOT NULL,amount INTEGER NOT NULL,PRIMARY KEY(period_id,user_id,resource))'),
    db.prepare("INSERT INTO test_periods VALUES('synthetic','daily',2000,'open',NULL,NULL)"),
    db.prepare("INSERT INTO test_scores VALUES('synthetic',1,200),('synthetic',2,200),('synthetic',3,125)"),
    db.prepare("INSERT INTO test_tiers VALUES('daily',1,'refineScrolls',3),('daily',1,'dailyRolls',2),('daily',2,'refineScrolls',2),('daily',2,'dailyRolls',2),('daily',3,'refineScrolls',2),('daily',3,'dailyRolls',2)"),
  ]);
  const count=async table=>(await db.prepare('SELECT COUNT(*) n FROM '+table).first()).n;
  assert.equal(await settleSyntheticPeriod(db,'synthetic',1999),'not settled');
  await assert.rejects(settleSyntheticPeriod(db,'synthetic',2000,{injectFailure:true}));
  assert.equal((await db.prepare("SELECT state FROM test_periods WHERE id='synthetic'").first()).state,'open');
  assert.equal(await count('test_awards'),0);assert.equal(await count('test_grants'),0);
  const race=await Promise.all([settleSyntheticPeriod(db,'synthetic',2001),settleSyntheticPeriod(db,'synthetic',2001)]);
  assert.deepEqual(race.sort(),['not settled','settled']);
  assert.deepEqual((await db.prepare('SELECT user_id,rank,score FROM test_awards ORDER BY rank').all()).results,
    [{user_id:1,rank:1,score:200},{user_id:2,rank:2,score:200},{user_id:3,rank:3,score:125}]);
  assert.equal(await count('test_grants'),6);
  assert.equal(await settleSyntheticPeriod(db,'synthetic',2002),'not settled');
  assert.equal(await count('test_grants'),6);
  console.log('PASS: isolated local D1 settlement rolls back injected failure; concurrent retry pays once with deterministic ties');
  console.log('LIMIT: synthetic scores only; no production scoring, hosted D1 concurrency, or real grants tested.');
}finally{await mf.dispose()}
