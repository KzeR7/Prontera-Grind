// Disposable D1-shaped SQLite, synthetic scores only. No run is trusted here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { onRequestPost as register } from '../../functions/api/register.js';
import { onRequestPut as save } from '../../functions/api/save.js';
import { onRequestGet as getGrants,onRequestPost as claimGrants } from '../../functions/api/grants.js';
const {createGame}=createRequire(import.meta.url)('./helpers/game');
import { freshDb,makeD1 } from '../dev_server.js';
import { buildSettlementBatch,settleCompetitivePeriod } from '../../functions/_lib/competition-settlement.js';
import { echoRewardFor } from '../../functions/_lib/echo-board.js';
const sqlite=freshDb(),db=makeD1(sqlite);
const row=(sql,...p)=>sqlite.prepare(sql).get(...p);
const count=t=>row('SELECT count(*) n FROM '+t).n;
const insertPeriod=(key,kind,start,end)=>sqlite.prepare('INSERT INTO competition_periods(period_key,kind,ruleset,starts_at,ends_at) VALUES(?,?,?,?,?)').run(key,kind,'synthetic-v1',start,end);
const insertUser=(name)=>Number(sqlite.prepare('INSERT INTO users(username,pass_hash,created_at) VALUES(?,?,?)').run(name,'synthetic',Date.now()).lastInsertRowid);
const batch=(key,at=Date.now())=>buildSettlementBatch(db,key,at,randomUUID());
const request=(route,method,body,cookie)=>new Request('https://game.test/api/'+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
try{
 const start=Math.floor(Date.now()/1000)*1000-5000,end=Math.ceil(Date.now()/1000)*1000+1000;
 const day='day:2026-10-29',week='week:2026-10-26';insertPeriod(day,'daily',start,end);insertPeriod(week,'weekly',start,end);
 assert.throws(()=>insertPeriod('day:2026-10-28','weekly',start,end),/CHECK constraint/);
 const signup=await register({request:request('register','POST',{u:'Sim0',p:'Synthetic-password-123!',email:'sim0@example.test'}),env:{DB:db}});
 assert.equal(signup.status,201);const cookie=signup.headers.get('set-cookie').split(';')[0];
 const ids=[row("SELECT id FROM users WHERE username='Sim0'").id];for(let i=1;i<105;i++)ids.push(insertUser('Sim'+i));
 const insert=sqlite.prepare('INSERT INTO competition_scores(period_key,user_id,run_id,score,recorded_at) VALUES(?,?,?,?,?)');
 for(let i=0;i<105;i++){insert.run(day,ids[i],'run-'+i,i<2?10000:10000-i,Date.now());insert.run(week,ids[i],'run-'+i,i<2?10000:10000-i,Date.now());}
 assert.throws(()=>sqlite.prepare("INSERT INTO competition_prize_ledger(period_key,user_id,resource,amount,created_at) VALUES(?,?,'shards',1,?)").run(day,ids[0],Date.now()),/prize outside settlement/);
 await assert.rejects(settleCompetitivePeriod(db,day),/paused/,'production entry stays hard-disabled');
 let out=await db.batch(batch(day,end));assert.equal(out[0].meta.changes,0,'period must be closed by database clock');
 assert.equal(count('competition_prize_ledger'),0);assert.equal(count('grants'),0);
 await new Promise(r=>setTimeout(r,Math.max(0,end-Date.now()+100)));
 assert.throws(()=>insert.run(day,ids[0],'late',20000,end-1),/period unavailable/,'late score cannot sneak in with earlier claimed timestamp');
 assert.throws(()=>sqlite.prepare('UPDATE competition_scores SET score=5 WHERE period_key=? AND user_id=?').run(day,ids[0]),/period unavailable/);
 // The actual candidate statements are tested here, but there is no API
 // calling them; the public settlement entrypoint still throws above.
 const failing=batch(day);failing.splice(3,0,db.prepare("UPDATE competition_periods SET state='INVALID' WHERE period_key=?").bind(day));
 await assert.rejects(db.batch(failing));
 assert.equal(row('SELECT state FROM competition_periods WHERE period_key=?',day).state,'open');
 assert.equal(count('competition_placements'),0);assert.equal(count('competition_prize_ledger'),0);assert.equal(count('grants'),0);
 const results=await Promise.all([db.batch(batch(day)),db.batch(batch(day)),db.batch(batch(day))]);
 assert.deepEqual(results.map(r=>r[0].meta.changes).sort(),[0,0,1]);
 assert.equal(row('SELECT state FROM competition_periods WHERE period_key=?',day).state,'closed');
 const places=sqlite.prepare('SELECT * FROM competition_placements ORDER BY rank').all();assert.equal(places.length,100);
 assert.equal(places[0].user_id,ids[0]);assert.equal(places[1].user_id,ids[1],'equal scores break ties by stable user ID');
 const grants=sqlite.prepare('SELECT l.user_id,l.resource,l.amount,l.grant_id,g.kind,g.payload,g.created_by FROM competition_prize_ledger l JOIN grants g ON g.id=l.grant_id').all();
 assert.equal(grants.length,103,'daily top three have two rewards; ranks 4–100 have one');assert.equal(new Set(grants.map(g=>g.grant_id)).size,103);
 for(const p of places){
   const actual=grants.filter(g=>g.user_id===p.user_id).map(g=>({resource:g.resource,amount:g.amount})).sort((a,b)=>a.resource.localeCompare(b.resource));
   const expected=echoRewardFor('daily',p.rank).sort((a,b)=>a.resource.localeCompare(b.resource));
   assert.deepEqual(actual,expected,'original reward tiers must be preserved for rank '+p.rank);
 }
 for(const g of grants){assert.equal(g.kind,'gift');assert.equal(g.created_by,'Echo competition');assert.deepEqual(JSON.parse(g.payload),{resource:g.resource,amount:g.amount});}
 assert.equal(count('grants'),103,'only one gift per ledger entry');
 assert.equal((await db.batch(batch(day)))[0].meta.changes,0,'retry cannot duplicate awards');
 assert.equal((await db.batch(batch(week)))[0].meta.changes,1);
 const weekPlaces=sqlite.prepare('SELECT * FROM competition_placements WHERE period_key=? ORDER BY rank').all(week);
 const weekGrants=sqlite.prepare('SELECT l.user_id,l.resource,l.amount,g.payload FROM competition_prize_ledger l JOIN grants g ON g.id=l.grant_id WHERE l.period_key=?').all(week);
 assert.equal(weekPlaces.length,100);assert.equal(weekGrants.length,115,'weekly ranks 11–25 receive two prizes');
 for(const p of weekPlaces){
   const actual=weekGrants.filter(g=>g.user_id===p.user_id).map(g=>({resource:g.resource,amount:g.amount})).sort((a,b)=>a.resource.localeCompare(b.resource));
   assert.deepEqual(actual,echoRewardFor('weekly',p.rank).sort((a,b)=>a.resource.localeCompare(b.resource)),'weekly reward for rank '+p.rank);
 }
 // Exercise actual game gift application and the real save/claim handlers
 // with synthetic grants. Only durable receipts allow them to be claimed.
 const get=await getGrants({request:request('grants','GET',null,cookie),env:{DB:db}});
 const pending=(await get.json()).grants;assert.equal(pending.length,3);
 const grantIds=pending.map(g=>g.id);
 let claim=await claimGrants({request:request('grants','POST',{ids:grantIds},cookie),env:{DB:db}});
 assert.equal((await claim.json()).claimed,0);
 const game=createGame();try{
   game.ev(`S=fresh();S.owner='Sim0';cloudPush=async()=> 'offline';cloudApplyGrants(${JSON.stringify(pending)});`);
   assert.equal(game.ev('S.refineScrolls'),3);assert.equal(game.ev('S.dailyWheel.bonusRolls'),2);assert.equal(game.ev('S.mythicScrolls'),5);
   game.ev(`cloudApplyGrants(${JSON.stringify(pending)});`);
   assert.equal(game.ev('S.refineScrolls'),3);assert.equal(game.ev('S.mythicScrolls'),5);
   const blob=game.ev('JSON.stringify(S)');
   assert.equal((await save({request:request('save','PUT',{owner:'Sim0',version:0,blob},cookie),env:{DB:db}})).status,200);
 }finally{game.close()}
 claim=await claimGrants({request:request('grants','POST',{ids:grantIds},cookie),env:{DB:db}});
 assert.equal((await claim.json()).claimed,3,'only durable applied receipts are claimed');
 assert.equal((await (await getGrants({request:request('grants','GET',null,cookie),env:{DB:db}})).json()).grants.length,0);
 // Empty closed periods produce no gifts, even when retried.
 const empty='week:2026-10-19';insertPeriod(empty,'weekly',start-10000,start-1000);
 assert.equal((await db.batch(batch(empty)))[0].meta.changes,1);
 assert.equal(row('SELECT state FROM competition_periods WHERE period_key=?',empty).state,'closed');assert.equal(count('grants'),218);
 sqlite.exec(fs.readFileSync('migrations/0009_competition_settlement.sql','utf8'));
 assert.equal(count('competition_placements'),200,'idempotent migration preserves ledger');
 const routes=fs.readdirSync('functions/api',{recursive:true}).filter(n=>typeof n==='string'&&n.endsWith('.js'));
 for(const route of routes){const code=fs.readFileSync('functions/api/'+route,'utf8');assert.ok(!code.includes('competition-settlement'),route+' must not expose candidate settlement');}
 console.log('PASS: disabled settlement foundation: cutoff, deterministic Top 100, original tiers, linked grants, atomic rollback, retries and empty periods');
}finally{sqlite.close()}
