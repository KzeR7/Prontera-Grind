// Synthetic SQLite only. This is NOT a Time Travel test and cannot touch live D1.
// The pause steps drive the REAL write-pause state machine (workers/gate/policy.mjs), so the order
// being rehearsed is the order that will actually run: close, drain, seal, snapshot, restore,
// verify, reopen. An in-flight request blocks the seal here for the same reason it will there.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {rehearseRecovery} from '../recovery/rehearsal_protocol.mjs';
import {OPEN, admit, closeGate, drain, initialState, openGate, sealGate} from '../../workers/gate/policy.mjs';

const PHRASE={close:'CLOSE WRITES',seal:'SEAL WRITES',open:'OPEN WRITES'};
const now=()=>Date.now();

function fixture(fail) {
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT); CREATE TABLE saves(user_id INTEGER PRIMARY KEY,level INTEGER); CREATE TABLE grants(id INTEGER PRIMARY KEY,user_id INTEGER);');
  db.exec("INSERT INTO users VALUES(1,'synthetic');INSERT INTO saves VALUES(1,10);INSERT INTO grants VALUES(1,1)");
  const old={users:db.prepare('SELECT * FROM users').all(),saves:db.prepare('SELECT * FROM saves').all(),grants:db.prepare('SELECT * FROM grants').all()};
  db.exec('UPDATE saves SET level=20;INSERT INTO grants VALUES(2,1)');
  const log=[];let snapshot;
  const gate=initialState();                                  // a brand-new gate: closed
  openGate(gate,now(),{confirm:PHRASE.open,reason:'synthetic drill'});   // the drill runs with writes open
  if(fail==='busy')admit(gate,now(),'req-inflight-1');        // a real write is still running when the pause starts
  function step(name){log.push(name);if(fail===name)throw Error('injected '+name)}
  const adapter={kind:'synthetic-local-only',
    async freeze(){step('freeze');closeGate(gate,now(),{confirm:PHRASE.close,reason:'synthetic drill'});},
    async isFrozen(){step('isFrozen');return gate.state!==OPEN},
    async drained(){step('drained');return drain(gate,now()).drained},
    async seal(){step('seal');sealGate(gate,now(),{confirm:PHRASE.seal});},
    async isSealed(){step('isSealed');return gate.state==='closed'},
    async emergencyBackup(){step('emergencyBackup');snapshot={users:db.prepare('SELECT * FROM users').all(),saves:db.prepare('SELECT * FROM saves').all(),grants:db.prepare('SELECT * FROM grants').all()};return 'synthetic-checkpoint'},
    async verifyEmergencyBackup(value){step('verifyEmergencyBackup');return value==='synthetic-checkpoint' && snapshot.saves[0].level===20},
    async verifyRestorePoint(value){step('verifyRestorePoint');return value==='synthetic-yesterday'},
    async ownerConfirmation(){step('ownerConfirmation');return fail!=='decline'},
    // The restore itself refuses to run unless the gate is sealed: ordering enforced, not assumed.
    async restore(){step('restore');assert.equal(gate.state,'closed','a restore may only start on a sealed gate');
      db.exec('DELETE FROM grants;DELETE FROM saves;DELETE FROM users');for(const x of old.users)db.prepare('INSERT INTO users VALUES(?,?)').run(x.id,x.name);for(const x of old.saves)db.prepare('INSERT INTO saves VALUES(?,?)').run(x.user_id,x.level);for(const x of old.grants)db.prepare('INSERT INTO grants VALUES(?,?)').run(x.id,x.user_id)},
    async verifyRestored(){step('verifyRestored');return db.prepare('SELECT level FROM saves').get().level===10&&db.prepare('SELECT COUNT(*) n FROM grants').get().n===1},
    async resume(){step('resume');openGate(gate,now(),{confirm:PHRASE.open,reason:'synthetic drill done'});},
  };
  return {adapter,db,log,gate,isFrozen:()=>gate.state!==OPEN};
}

let f=fixture();
try{
  const r=await rehearseRecovery(f.adapter,'synthetic-yesterday');
  assert.equal(r.checkpoint,'synthetic-checkpoint');assert.equal(f.isFrozen(),false);
  assert.equal(f.db.prepare('SELECT level FROM saves').get().level,10);
  assert.deepEqual(f.log,['freeze','isFrozen','drained','seal','isSealed','emergencyBackup','verifyEmergencyBackup','verifyRestorePoint','ownerConfirmation','restore','verifyRestored','resume']);
}finally{f.db.close()}
for(const failure of ['busy','seal','emergencyBackup','verifyEmergencyBackup','verifyRestorePoint','decline','restore','verifyRestored']){
  f=fixture(failure);try{
    await assert.rejects(rehearseRecovery(f.adapter,'synthetic-yesterday'),/no automatic retry or resume/);
    assert.equal(f.isFrozen(),true,`${failure}: failed recovery must stay paused`);
    assert.notEqual(f.gate.state,OPEN,`${failure}: the pause must never quietly reopen`);
    if(!['busy','seal'].includes(failure))assert.equal(f.gate.state,'closed',`${failure}: the gate stays sealed`);
    assert(!f.log.includes('resume'));
    if(!['restore','verifyRestored'].includes(failure))assert(!f.log.includes('restore'));
  }finally{f.db.close()}
}
// The drain rule is the gate's own, not the mock's: an in-flight request blocks the seal, however
// many times the operator retries inside the quiet window.
f=fixture('busy');try{
  await f.adapter.freeze();
  await assert.rejects(f.adapter.seal(),e=>e.code==='not-drained');
  assert.equal(drain(f.gate,now()).drained,false);
  assert.equal(f.gate.state,'closing','a refused seal does not open anything');
}finally{f.db.close()}
f=fixture();try{
  f.adapter.kind='production';await assert.rejects(rehearseRecovery(f.adapter,'synthetic-yesterday'),/synthetic local/);assert.equal(f.log.length,0);
  f.adapter.kind='synthetic-local-only';await assert.rejects(rehearseRecovery(f.adapter,'arbitrary'),/Invalid synthetic/);assert.equal(f.log.length,0);
}finally{f.db.close()}
console.log('PASS: synthetic-only close, drain, seal, emergency backup, selection, confirmation, restore, checks, reopen and fail-closed stops');
