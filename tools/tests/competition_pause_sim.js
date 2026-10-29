// Synthetic-only regression: legacy public entry points cannot score or pay out.
import assert from 'node:assert/strict';
import { freshDb, makeD1 } from '../dev_server.js';
import { recordEchoScores, settleEchoRewards, echoRewardFor } from '../../functions/_lib/echo-board.js';
import { onRequestGet as board } from '../../functions/api/board.js';
import { onRequestPost as register } from '../../functions/api/register.js';
import { onRequestPut as save } from '../../functions/api/save.js';
const sqlite=freshDb(),DB=makeD1(sqlite),env={DB};
const req=(path,method,body,cookie)=>new Request('https://game.test/api/'+path,{
  method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
try {
  const r=await register({request:req('register','POST',{u:'PauseTest',p:'Synthetic-pass-123!',email:'pause@example.test'}),env});
  assert.equal(r.status,201);
  const cookie=r.headers.get('set-cookie').split(';')[0];
  const user=sqlite.prepare("SELECT id FROM users WHERE username='PauseTest'").get();
  // A malicious personal save remains usable, but its self-reported score is not ranked.
  const blob=JSON.stringify({owner:'PauseTest',lv:150,cls:'Novice',kills:999999999,
    trial:{best:100000000,echoBoard:{day:'2026-10-28',dayDps:100000000,week:'2026-10-26',weekDps:100000000}}});
  assert.equal((await save({request:req('save','PUT',{owner:'PauseTest',version:0,blob},cookie),env})).status,200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM leaderboard_echo').get().n,0);
  for(const b of ['kills','echo'])assert.equal((await board({request:req('board?board='+b,'GET',null,cookie),env})).status,503);
  // Simulate pre-existing, untrusted Echo data. A future accidental direct call must
  // neither accept another score nor settle existing rows into grants or markers.
  sqlite.prepare('INSERT INTO leaderboard_echo(user_id,period_key,dps) VALUES(?,?,?)').run(user.id,'day:2026-10-28',99999999);
  const before=sqlite.prepare('SELECT user_id,period_key,dps FROM leaderboard_echo').all();
  await assert.rejects(recordEchoScores(DB,user.id,{echoBest:100000000}),/scoring is paused/);
  await assert.rejects(settleEchoRewards(DB,Date.parse('2026-10-29T12:00:00Z')),/payouts are paused/);
  const concurrent=await Promise.allSettled(Array.from({length:3},()=>settleEchoRewards(DB)));
  assert.ok(concurrent.every(x=>x.status==='rejected'));
  assert.deepEqual(sqlite.prepare('SELECT user_id,period_key,dps FROM leaderboard_echo').all(),before);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM leaderboard_echo_rewards').get().n,0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM leaderboard_echo_settlements').get().n,0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM grants WHERE created_by='Endless Echo'").get().n,0);
  assert.ok(echoRewardFor('daily',1).length>0,'existing reward definitions remain available for future design');
  console.log('PASS: boards paused; forged Echo scores and direct/repeated settlement attempts fail closed');
} finally {sqlite.close()}
