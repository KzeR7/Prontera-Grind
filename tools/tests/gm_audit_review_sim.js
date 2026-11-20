import assert from 'node:assert/strict';
import { freshDb, makeD1 } from '../dev_server.js';
import * as db from '../../functions/_lib/db.js';
import { auditAcceptedSave, auditEvidenceFor } from '../../functions/_lib/save-audit.js';
import { tokenHash } from '../../functions/_lib/auth.js';
import { onRequestGet as auditGet } from '../../functions/api/gm/audit.js';
import { onRequestGet as playerGet } from '../../functions/api/gm/player.js';

for (const spec of [
  {kind:'kill-rate', key:'kills', initial:10000, ordinary:1, excessive:4999},
  {kind:'zeny-rate', key:'zeny', initial:200000000, ordinary:1, excessive:180000000},
  {kind:'rate:shards', key:'shards', initial:1000, ordinary:1, excessive:599},
]) {
  const sql=freshDb(), D=makeD1(sql), base=Date.now()-600000;
  await db.insertUser(D,{username:'Player',passHash:'fixture',email:null,recoveryHash:null,gm:0});
  const id=(await db.userByName(D,'Player')).id;
  let at=base, value=0;
  const save=n=>({lv:120,kills:spec.key==='kills'?n:0,zeny:spec.key==='zeny'?n:0,shards:spec.key==='shards'?n:0});
  async function step(delta) {
    const old=save(value), prev={saved_at:at,kills_total:old.kills,level:120,zeny:old.zeny,blob:JSON.stringify(old)};
    value+=delta;at+=120000;const next=save(value);
    return auditAcceptedSave(D,{userId:id,username:'Player',gm:0,prev,save:next,pub:{lv:120,kills:next.kills,zeny:next.zeny},savedAt:at});
  }
  assert.equal((await step(spec.initial)).flagged,true);
  const originalNow=Date.now;
  try {Date.now=()=>at+60000;assert.equal((await db.clearSaveAlert(D,id,spec.kind,'GM')).changed,1);}
  finally {Date.now=originalNow;}
  const logCount=sql.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='save-alert'").get().n;
  assert.equal((await step(spec.ordinary)).flagged,false,'ordinary activity must not replay reviewed evidence');
  assert.ok(sql.prepare('SELECT cleared_at FROM save_alerts WHERE user_id=? AND kind=?').get(id,spec.kind).cleared_at);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='save-alert'").get().n,logCount);
  assert.equal((await step(spec.excessive)).flagged,true,'a genuinely excessive new incident must reopen');
  const row=sql.prepare('SELECT * FROM save_alerts WHERE user_id=? AND kind=?').get(id,spec.kind);
  assert.equal(row.cleared_at,null);
  const evidence=auditEvidenceFor(row);
  assert.ok(evidence.ruleVersion);assert.ok(evidence.units);
  assert.equal(evidence.evidence.rawDelta-evidence.evidence.credited,evidence.evidence.unexplained);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='save-alert'").get().n,logCount+1);
  // Both actual authorised HTTP handlers must expose the evidence stored by the audit.
  await db.insertUser(D,{username:'Reviewer',passHash:'fixture',email:null,recoveryHash:null,gm:1});
  const owner=(await db.userByName(D,'Reviewer')).id, token='r'.repeat(48);
  await db.insertSession(D,await tokenHash(token),owner,Date.now()+30*86400000,'test',null);
  for (const [handler,url] of [[auditGet,'https://game.test/api/gm/audit'],[playerGet,'https://game.test/api/gm/player?id='+id]]) {
    const response=await handler({request:new Request(url,{headers:{Cookie:'pg_session='+token}}),env:{DB:D}});
    assert.equal(response.status,200);const data=await response.json();
    const alert=data.alerts.find(a=>a.kind===spec.kind);
    assert.deepEqual(alert.evidence,evidence.evidence);assert.equal(alert.ruleVersion,evidence.ruleVersion);assert.equal(alert.units,evidence.units);
  }
  sql.close();console.log('ok reviewed boundary, new incident, notifications and API evidence:',spec.kind);
}
assert.equal(auditEvidenceFor({kind:'kill-rate',evidence_json:'invalid'}).evidence,null);
assert.equal(auditEvidenceFor({kind:'kill-rate'}).evidence,null);
console.log('ok legacy and malformed evidence are readable');

{
  const sql=freshDb(),D=makeD1(sql),at=Date.now()-120000;
  await db.insertUser(D,{username:'Concurrent',passHash:'fixture',email:null,recoveryHash:null,gm:0});
  const id=(await db.userByName(D,'Concurrent')).id;
  await db.upsertAuditWindow(D,id,at,at+60000,JSON.stringify({kills:10000,raw:{'kill-rate':10000},credits:{'kill-rate':0},resources:{}}));
  await db.saveAlertWithEvidence(D,{userId:id,kind:'kill-rate',at:at+60000,value:600000,threshold:30000,detail:'fixture'});
  const stale=await db.getAuditWindow(D,id);
  assert.equal((await db.clearSaveAlert(D,id,'kill-rate','GM')).changed,1);
  // A save which read before the clear must not erase the review marker on write.
  const merged=await db.upsertAuditWindow(D,id,at,Date.now(),stale.acc_json);
  assert.equal(JSON.parse(merged.acc_json).reviewed['kill-rate'].amount,10000);
  const reset=await db.upsertAuditWindow(D,id,at+3600001,at+3600002,JSON.stringify({kills:0,resources:{}}));
  assert.equal(JSON.parse(reset.acc_json).reviewed,undefined,'new windows must not inherit an immunity');
  sql.exec('DROP TABLE save_audit_windows');
  await db.reopenSaveAlert(D,id,'kill-rate','GM');
  assert.equal((await db.clearSaveAlert(D,id,'kill-rate','GM')).changed,1,'pre-0021 review remains available');
  sql.close();console.log('ok concurrent clear/save, window expiry and legacy review');
}
