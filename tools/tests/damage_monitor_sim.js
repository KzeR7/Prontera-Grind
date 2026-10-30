// Disposable synthetic accounts and SQLite: a review flag is never a ban or proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM,VirtualConsole } from 'jsdom';
import { freshDb,makeD1,createApp } from '../dev_server.js';
import { onRequestPost as register } from '../../functions/api/register.js';
import { onRequestPut as save } from '../../functions/api/save.js';
import { onRequestGet as board } from '../../functions/api/board.js';
import { onRequestGet as damage } from '../../functions/api/gm/damage.js';
import { damageObservation,recordDamageObservation,DAMAGE_BUCKET_MS,DAMAGE_SLOTS,DAMAGE_REPORTED_CAP } from '../../functions/_lib/damage-monitor.js';
const sqlite=freshDb(),DB=makeD1(sqlite),env={DB};
const req=(url,method='GET',body,cookie)=>new Request('https://game.test/api/'+url,{method,
  headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
async function account(u){const r=await register({request:req('register','POST',{u,p:'Synthetic-pass-123!',email:u+'@example.test'}),env});assert.equal(r.status,201);return r.headers.get('set-cookie').split(';')[0]}
const put=(cookie,owner,version,patch)=>save({request:req('save','PUT',{owner,version,blob:JSON.stringify({owner,lv:150,mp:10,lvl:3,dmg:123456,trial:{best:0},...patch})},cookie),env});
try {
 const gm=await account('MonitorGM'), player=await account('MonitorPlayer'), other=await account('MonitorOther');
 sqlite.prepare('UPDATE users SET gm=2 WHERE username=?').run('MonitorGM');
 const playerId=sqlite.prepare('SELECT id FROM users WHERE username=?').get('MonitorPlayer').id;
 assert.equal((await damage({request:req('gm/damage'),env})).status,401);
 assert.equal((await damage({request:req('gm/damage','GET',null,player),env})).status,403);
 assert.equal((await put(player,'MonitorPlayer',0,{trial:{best:100000000}})).status,200);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM damage_samples WHERE user_id=?').get(playerId).n,1);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM damage_alerts WHERE user_id=?').get(playerId).n,0,'100M exactly does not flag');
 assert.equal((await put(player,'MonitorPlayer',1,{trial:{best:100000001}})).status,200);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM damage_samples WHERE user_id=?').get(playerId).n,1,'one sample per bucket');
 let a=sqlite.prepare("SELECT * FROM damage_alerts WHERE user_id=? AND kind='echo-over-100m'").get(playerId);
 assert.equal(a.kind,'echo-over-100m');assert.equal(a.max_reported_dps,100000001);assert.equal(a.observations,1);
 assert.equal((await put(player,'MonitorPlayer',2,{dmg:-1,trial:{best:100000002}})).status,200);
 a=sqlite.prepare("SELECT * FROM damage_alerts WHERE user_id=? AND kind='echo-over-100m'").get(playerId);
 assert.equal(a.observations,1,'repeated syncs are coalesced');
 // A rejected version conflict cannot produce a flag, and an account cannot
 // write an observation for another account.
 assert.equal((await put(other,'MonitorOther',4,{trial:{best:999999999}})).status,200,'first save accepted normally');
 const otherId=sqlite.prepare('SELECT id FROM users WHERE username=?').get('MonitorOther').id;
 sqlite.prepare('DELETE FROM damage_alerts WHERE user_id=?').run(otherId);
 assert.equal((await put(other,'MonitorOther',99,{trial:{best:999999999}})).status,409);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM damage_alerts WHERE user_id=?').get(otherId).n,0);
 assert.equal((await put(other,'MonitorPlayer',1,{trial:{best:999999999}})).status,409);
 const boardResult=await board({request:req('board?board=echo','GET',null,player),env});assert.equal(boardResult.status,200);assert.equal((await boardResult.json()).integrity,'unverified');
 assert.equal(sqlite.prepare('SELECT count(*) n FROM grants').get().n,0);
 assert.equal(sqlite.prepare('SELECT banned FROM users WHERE id=?').get(playerId).banned,0);
 let response=await damage({request:req('gm/damage','GET',null,gm),env});assert.equal(response.status,200);
 const alerts=(await response.json()).alerts;assert.equal(alerts.length,2);assert.ok(alerts.every(a=>a.username==='MonitorPlayer'));assert.ok(alerts.some(a=>a.kind==='invalid-total-damage'));
 response=await damage({request:req('gm/damage?id='+playerId,'GET',null,gm),env});
 const samples=(await response.json()).samples;assert.equal(samples.length,1);assert.equal(samples[0].reported_total_damage,123456);
 assert.equal((await damage({request:req('gm/damage?id=not-a-number','GET',null,gm),env})).status,400);
 assert.equal((await damage({request:req('gm/damage?id=999999','GET',null,gm),env})).status,404);
 // Ring is bounded across many periods; old inactive slots are overwritten,
 // not guaranteed deleted after seven days without new samples.
 const t=Math.ceil(Date.now()/DAMAGE_BUCKET_MS)*DAMAGE_BUCKET_MS;
 for(let i=0;i<DAMAGE_SLOTS+5;i++)await recordDamageObservation(DB,playerId,{dmg:i,trial:{best:100000001}},t+i*DAMAGE_BUCKET_MS);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM damage_samples WHERE user_id=?').get(playerId).n,DAMAGE_SLOTS);
 assert.ok(sqlite.prepare("SELECT observations FROM damage_alerts WHERE user_id=? AND kind='echo-over-100m'").get(playerId).observations>1);
 assert.equal(damageObservation({trial:{best:Infinity}}).echoBest,DAMAGE_REPORTED_CAP);
 assert.equal(damageObservation({trial:{best:Infinity}}).high,true);
 assert.equal(damageObservation({dmg:Infinity}).invalidTotal,true);
 assert.equal(damageObservation({dmg:-1}).invalidTotal,true);
 assert.equal(damageObservation({dmg:null}).invalidTotal,false);
 assert.equal(damageObservation({trial:{best:'999999999'}}).echoBest,null,'untrusted nonnumeric values ignored');
 sqlite.exec(fs.readFileSync('migrations/0008_damage_monitoring.sql','utf8'));
 assert.equal(sqlite.prepare('SELECT count(*) n FROM damage_samples WHERE user_id=?').get(playerId).n,DAMAGE_SLOTS,'idempotent migration preserves data');
 // Run the actual console script against the disposable router, not a mock
 // of the new endpoint. A flag click must navigate to the player's data.
 const app=createApp({sqlite});let uiError=null;
 const vc=new VirtualConsole();vc.on('jsdomError',e=>{uiError=e});
 const dom=new JSDOM(fs.readFileSync('gm.html','utf8'),{url:'https://game.test/gm.html',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
   w.fetch=(url,opt={})=>app(new Request(new URL(url,'https://game.test'),{...opt,headers:{...opt.headers,Cookie:gm}}));
 }});
 const wait=async fn=>{for(let i=0;i<100&&!fn();i++)await new Promise(r=>setTimeout(r,5));assert.ok(fn(),'GM UI did not finish loading');if(uiError)throw uiError};
 try{
   await wait(()=>dom.window.document.querySelector('[data-damage-player]'));
   assert.match(dom.window.document.querySelector('#damagealerts').textContent,/MonitorPlayer/);
   assert.match(dom.window.document.querySelector('#damagealerts').textContent,/Invalid cumulative damage/);
   dom.window.document.querySelector('[data-damage-player]').click();
   await wait(()=>dom.window.document.querySelector('#tabbody table'));
   assert.match(dom.window.document.querySelector('#tabbody').textContent,/Total damage/);
   assert.match(dom.window.document.querySelector('#tabbody').textContent,/Echo best DPS/);
 }finally{dom.window.close()}
 // Monitoring failures and missing migration must not make a committed save fail.
 sqlite.exec('DROP TABLE damage_samples; DROP TABLE damage_alerts');
 const before=console.warn;console.warn=()=>{};
 try{
   assert.equal((await put(player,'MonitorPlayer',3,{dmg:987654})).status,200);
   assert.equal((await put(gm,'MonitorGM',0,{trial:{best:999999999}})).status,200,'missing monitoring tables cannot block initial save');
 }finally{console.warn=before}
 assert.equal(JSON.parse(sqlite.prepare('SELECT blob FROM saves WHERE user_id=?').get(playerId).blob).dmg,987654);
 assert.equal((await damage({request:req('gm/damage','GET',null,gm),env})).status,503);
 console.log('PASS: bounded client-reported samples, review-only flags, GM authorization, conflicts, unverified board and nonblocking failures');
}finally{sqlite.close()}
