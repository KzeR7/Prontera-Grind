// Synthetic accounts only. Grandfathered saves are not proven legitimate gear.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { freshDb,makeD1 } from '../dev_server.js';
import { onRequestPost as register } from '../../functions/api/register.js';
import { onRequestPut as save } from '../../functions/api/save.js';
import { onRequestGet as board } from '../../functions/api/board.js';
import { buildBaselineCapture,captureCompetitionBaseline } from '../../functions/_lib/competition-baseline.js';
const sqlite=freshDb(),DB=makeD1(sqlite),env={DB};
const request=(route,method,body,cookie)=>new Request('https://game.test/api/'+route,{method,
 headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
const reg=async u=>{const r=await register({request:request('register','POST',{u,p:'Synthetic-password-123!',email:u.toLowerCase()+'@example.test'}),env});assert.equal(r.status,201);return r.headers.get('set-cookie').split(';')[0]};
const put=(u,cookie,version,gear)=>save({request:request('save','PUT',{owner:u,version,blob:JSON.stringify({owner:u,lv:150,cls:'Novice',eq:{weapon:gear},inv:[{id:'kept'}],st:{str:30},sk:{aid:1}})},cookie),env});
const row=(sql,...p)=>sqlite.prepare(sql).get(...p);
const capture=(userId,version,cutoffAt)=>buildBaselineCapture(DB,{userId,version,cutoffAt,capturedAt:Date.now()}).run();
try {
 const one=await reg('BaselineOne'),two=await reg('BaselineTwo');
 const id1=row("SELECT id FROM users WHERE username='BaselineOne'").id,id2=row("SELECT id FROM users WHERE username='BaselineTwo'").id;
 const weapon={id:876,slot:'weapon',name:'Grandfathered Blade',val:5000,aff:[{k:'str',v:42}],r:9,cards:[{id:877,name:'Existing Card'}]};
 assert.equal((await put('BaselineOne',one,0,weapon)).status,200);
 assert.equal((await put('BaselineTwo',two,0,{id:1,name:'Other'})).status,200);
 const cutoff=Math.floor(Date.now()/1000)*1000; // SQL clock uses whole seconds
 // Make synthetic accepted timestamps clearly precede the isolated cutover.
 sqlite.prepare('UPDATE saves SET updated_at=? WHERE user_id IN (?,?)').run(cutoff-5000,id1,id2);
 sqlite.prepare('UPDATE users SET created_at=? WHERE id IN (?,?)').run(cutoff-10000,id1,id2);
 const before=row('SELECT blob,version FROM saves WHERE user_id=?',id1);
 await assert.rejects(captureCompetitionBaseline(DB,id1),/paused/);
 assert.equal((await capture(id1,1,cutoff)).meta.changes,1);
 let b=row('SELECT * FROM competition_baselines WHERE user_id=?',id1);
 assert.equal(b.policy,'grandfathered-unverified-v1');assert.equal(b.save_blob,before.blob);assert.equal(b.save_version,1);
 assert.deepEqual(JSON.parse(b.save_blob).eq.weapon,weapon,'own gear, refinements and cards copied verbatim');
 assert.deepEqual(row('SELECT blob,version FROM saves WHERE user_id=?',id1),before,'personal save unchanged');
 assert.equal((await capture(id1,1,cutoff)).meta.changes,0,'retry does not overwrite baseline');
 assert.throws(()=>sqlite.prepare("UPDATE competition_baselines SET save_blob='{}' WHERE user_id=?").run(id1),/immutable/);
 assert.equal((await put('BaselineOne',one,1,{...weapon,val:9999})).status,200);
 assert.equal((await capture(id1,2,cutoff)).meta.changes,0,'new version cannot overwrite the frozen baseline');
 b=row('SELECT * FROM competition_baselines WHERE user_id=?',id1);assert.equal(JSON.parse(b.save_blob).eq.weapon.val,5000);
 assert.equal((await capture(id2,99,cutoff)).meta.changes,0,'stale or guessed version is refused');
 // Mismatched account stamp is not copied even if found in a historical row.
 sqlite.prepare('UPDATE saves SET blob=? WHERE user_id=?').run(JSON.stringify({owner:'OtherAccount',lv:1}),id2);
 assert.equal((await capture(id2,1,cutoff)).meta.changes,0);
 // Older unstamped saves are supported, but post-cutover writes are not silently grandfathered.
 sqlite.prepare('UPDATE saves SET blob=?,updated_at=? WHERE user_id=?').run(JSON.stringify({lv:1,eq:{weapon:{id:'legacy'}}}),cutoff+1,id2);
 assert.equal((await capture(id2,1,cutoff)).meta.changes,0);
 sqlite.prepare('UPDATE saves SET updated_at=? WHERE user_id=?').run(cutoff-1,id2);
 sqlite.prepare('UPDATE users SET created_at=? WHERE id=?').run(cutoff+1,id2);
 assert.equal((await capture(id2,1,cutoff)).meta.changes,0,'new accounts cannot use legacy cutover');
 sqlite.prepare('UPDATE users SET created_at=? WHERE id=?').run(cutoff-1,id2);
 assert.equal((await capture(id2,1,cutoff)).meta.changes,1,'unstamped existing save can be grandfathered');
 const boardResult=await board({request:request('board?board=echo','GET',null,one),env});assert.equal(boardResult.status,200);assert.equal((await boardResult.json()).integrity,'unverified');
 assert.equal(row('SELECT count(*) n FROM competition_scores').n,0);assert.equal(row('SELECT count(*) n FROM grants').n,0);
 sqlite.exec(fs.readFileSync('migrations/0010_competition_baseline.sql','utf8'));
 assert.equal(row('SELECT count(*) n FROM competition_baselines').n,2,'migration rerun preserves data');
 for(const route of fs.readdirSync('functions/api',{recursive:true}).filter(n=>n.endsWith('.js')))
   assert.ok(!fs.readFileSync('functions/api/'+route,'utf8').includes('competition-baseline'),'no public baseline route');
 console.log('PASS: disabled immutable, cutover-bounded grandfathered save snapshots; personal saves preserved; unverified board does not use snapshots');
}finally{sqlite.close()}
