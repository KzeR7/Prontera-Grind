// Synthetic accounts only: this launch deliberately accepts browser-authored
// scores. These tests verify delivery mechanics, NOT anti-cheat integrity.
import assert from 'node:assert/strict';
import { freshDb,makeD1 } from '../dev_server.js';
import { onRequestPost as register } from '../../functions/api/register.js';
import { onRequestPut as save } from '../../functions/api/save.js';
import { onRequestGet as board } from '../../functions/api/board.js';
import { unverifiedWindows,settleUnverifiedEcho } from '../../functions/_lib/unverified-echo.js';
const sqlite=freshDb(),DB=makeD1(sqlite),env={DB};
const req=(url,method='GET',body,cookie)=>new Request('https://game.test/api/'+url,{method,
 headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
const signup=async u=>{const r=await register({request:req('register','POST',{u,p:'Synthetic-password-123!',email:u.toLowerCase()+'@example.test'}),env});assert.equal(r.status,201);return r.headers.get('set-cookie').split(';')[0]};
const put=(owner,cookie,version,trial)=>save({request:req('save','PUT',{owner,version,blob:JSON.stringify({owner,lv:150,cls:'Novice',dmg:123,trial})},cookie),env});
const read=(cookie,p='daily',kind='echo')=>board({request:req('board?board='+kind+'&period='+p,'GET',null,cookie),env});
const row=(sql,...p)=>sqlite.prepare(sql).get(...p);
try{
 const now=Date.now(),w=unverifiedWindows(now);
 assert.equal(row('SELECT starts_at FROM unverified_echo_config').starts_at,0,'migration alone does not start a competition');
 assert.equal(unverifiedWindows(Date.parse('2026-10-04T16:00:00Z')).week.key,'week:2026-10-05');
 const a=await signup('RankAlpha'),b=await signup('RankBeta');
 const alpha=row("SELECT id FROM users WHERE username='RankAlpha'").id,beta=row("SELECT id FROM users WHERE username='RankBeta'").id;
 const day=w.day.key.slice(4),week=w.week.key.slice(5);
 const t=dps=>({best:dps,echoBoard:{day,dayDps:dps,week,weekDps:dps}});
 // Before the scheduled start, no partial current day/week receives prizes.
 assert.equal((await put('RankAlpha',a,0,t(200000000))).status,200);
 const starts=row('SELECT starts_at FROM unverified_echo_config').starts_at;assert.ok(starts>now&&starts<=now+86400000,'first request schedules next Singapore midnight');
 assert.equal(new Date(starts+8*3600000).toISOString().slice(11),'00:00:00.000Z');
 assert.equal(row('SELECT count(*) n FROM competition_scores').n,0);
 assert.equal(row("SELECT dps FROM leaderboard_echo WHERE user_id=? AND period_key='all'",alpha).dps,200000000);
 let r=await read(a);assert.equal(r.status,200);let data=await r.json();assert.equal(data.integrity,'unverified');assert.equal(data.entries.length,0);
 assert.match(data.rewards.note,/start after launch/);
 // TEST-ONLY activation override to exercise a full open period.
 sqlite.prepare('UPDATE unverified_echo_config SET starts_at=?').run(w.week.start);
 assert.equal((await put('RankAlpha',a,1,t(200000000))).status,200);
 assert.equal((await put('RankBeta',b,0,t(1234))).status,200);
 data=await (await read(a)).json();assert.deepEqual(data.entries.map(x=>x.name),['RankAlpha','RankBeta']);
 assert.equal(data.entries[0].dps,200000000,'anomaly flags do not cap or block the score');
 assert.equal(row('SELECT count(*) n FROM damage_alerts WHERE user_id=?',alpha).n,1,'large report flagged for review');
 assert.equal((await (await read(a,'weekly')).json()).entries[0].dps,200000000);
 assert.equal((await (await read(a,'all')).json()).entries[0].dps,200000000);
 assert.equal((await read(a,'daily','kills')).status,200);
 assert.equal((await read(null)).status,401);
 // Version conflicts never add a new score; a lower report never lowers a best.
 assert.equal((await put('RankBeta',b,99,t(999999999))).status,409);
 assert.equal(row('SELECT score FROM competition_scores WHERE period_key=? AND user_id=?',w.day.key,beta).score,1234);
 assert.equal((await put('RankBeta',b,1,t(100))).status,200);
 assert.equal(row('SELECT score FROM competition_scores WHERE period_key=? AND user_id=?',w.day.key,beta).score,1234);
 // Save and score updates are separate: an injected scoring failure must save
 // safely, report pending, and allow a same-period retry on the next save.
 sqlite.exec("CREATE TRIGGER reject_score_test BEFORE INSERT ON competition_scores BEGIN SELECT RAISE(ABORT,'score test'); END;");
 const beforeWarn=console.warn;console.warn=()=>{};
 try {r=await put('RankBeta',b,2,t(2000));assert.equal(r.status,200);assert.equal((await r.json()).leaderboardPending,true);}
 finally {console.warn=beforeWarn;sqlite.exec('DROP TRIGGER reject_score_test')}
 assert.equal(row('SELECT score FROM competition_scores WHERE period_key=? AND user_id=?',w.day.key,beta).score,1234);
 r=await put('RankBeta',b,3,t(2000));assert.equal(r.status,200);assert.equal((await r.json()).leaderboardPending,false);
 assert.equal(row('SELECT score FROM competition_scores WHERE period_key=? AND user_id=?',w.day.key,beta).score,2000);
 // Staff are excluded before the public LIMIT and before prize ranking on all
 // three Echo views. Their private testing scores remain available for GM review.
 const gm=await signup('RankGM'),owner=await signup('RankOwner');
 const gmId=row("SELECT id FROM users WHERE username='RankGM'").id,ownerId=row("SELECT id FROM users WHERE username='RankOwner'").id;
 sqlite.prepare('UPDATE users SET gm=1 WHERE id=?').run(gmId);sqlite.prepare('UPDATE users SET gm=2 WHERE id=?').run(ownerId);
 assert.equal((await put('RankGM',gm,0,t(400000000))).status,200);
 assert.equal((await put('RankOwner',owner,0,t(500000000))).status,200);
 for(const period of ['daily','weekly','all']){
   const listing=await (await read(a,period)).json();
   assert.deepEqual(listing.entries.map(x=>x.name),['RankAlpha','RankBeta'],period);
   assert.deepEqual(listing.entries.map(x=>x.rank),[1,2],period);
 }
 // Old legacy scores are not copied or paid. Create a separate synthetic new
 // period with a short deadline; tests use real SQLite/D1 cutoff time.
 sqlite.prepare('INSERT INTO leaderboard_echo(user_id,period_key,dps) VALUES(?,?,?)').run(alpha,'day:2020-01-01',999999);
 const end=Math.ceil(Date.now()/1000)*1000+1000,key='day:2020-01-02';
 sqlite.prepare("INSERT INTO competition_periods(period_key,kind,ruleset,starts_at,ends_at) VALUES(?,'daily','unverified-save-v1',?,?)").run(key,Date.now()-1000,end);
 sqlite.prepare('INSERT INTO competition_scores(period_key,user_id,run_id,score,recorded_at) VALUES(?,?,?,?,?)').run(key,alpha,'sim-run',300,Date.now());
 sqlite.prepare('INSERT INTO competition_scores(period_key,user_id,run_id,score,recorded_at) VALUES(?,?,?,?,?)').run(key,gmId,'gm-test',400,Date.now());
 sqlite.prepare('INSERT INTO competition_scores(period_key,user_id,run_id,score,recorded_at) VALUES(?,?,?,?,?)').run(key,ownerId,'owner-test',500,Date.now());
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,end-Date.now()+100)));
 // Force a mid-batch failure: period claim, placements and gifts all roll back.
 sqlite.exec("CREATE TRIGGER reject_echo_test BEFORE INSERT ON grants WHEN NEW.created_by='Echo competition' BEGIN SELECT RAISE(ABORT,'test failure'); END;");
 r=await read(a);assert.equal(r.status,503);assert.equal(row('SELECT state FROM competition_periods WHERE period_key=?',key).state,'open');
 assert.equal(row('SELECT count(*) n FROM competition_placements WHERE period_key=?',key).n,0);assert.equal(row('SELECT count(*) n FROM grants').n,0);
 sqlite.exec('DROP TRIGGER reject_echo_test');
 const attempts=await Promise.all([read(a),read(b),read(a)]);assert.ok(attempts.every(x=>x.status===200));
 assert.equal(row('SELECT state FROM competition_periods WHERE period_key=?',key).state,'closed');
 assert.deepEqual(sqlite.prepare('SELECT user_id,rank FROM competition_placements WHERE period_key=? ORDER BY rank').all(key).map(x=>[x.user_id,x.rank]),[[alpha,1]],'hidden staff cannot take a player prize or shift the prize rank');
 assert.equal(row('SELECT count(*) n FROM grants').n,2,'daily first place receives two gifts once');
 assert.equal(row('SELECT count(*) n FROM competition_prize_ledger WHERE period_key=?',key).n,2);
 assert.equal(row('SELECT count(*) n FROM competition_prize_ledger WHERE period_key=?','day:2020-01-01').n,0,'legacy scores never auto-paid');
 await settleUnverifiedEcho(DB);assert.equal(row('SELECT count(*) n FROM grants').n,2,'retries do not duplicate prizes');
 console.log('PASS: unverified launch, own-save scores, flags-only, fresh periods, atomic retries and no legacy back-pay');
}finally{sqlite.close()}
