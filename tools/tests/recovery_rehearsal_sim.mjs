// Synthetic SQLite only. This is NOT a Time Travel test and cannot touch live D1.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {rehearseRecovery} from '../recovery/rehearsal_protocol.mjs';

function fixture(fail) {
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT); CREATE TABLE saves(user_id INTEGER PRIMARY KEY,level INTEGER); CREATE TABLE grants(id INTEGER PRIMARY KEY,user_id INTEGER);');
  db.exec("INSERT INTO users VALUES(1,'synthetic');INSERT INTO saves VALUES(1,10);INSERT INTO grants VALUES(1,1)");
  const old={users:db.prepare('SELECT * FROM users').all(),saves:db.prepare('SELECT * FROM saves').all(),grants:db.prepare('SELECT * FROM grants').all()};
  db.exec('UPDATE saves SET level=20;INSERT INTO grants VALUES(2,1)');
  const log=[];let frozen=false;let snapshot;
  function step(name){log.push(name);if(fail===name)throw Error('injected '+name)}
  const adapter={kind:'synthetic-local-only',
    async freeze(){step('freeze');frozen=true},
    async isFrozen(){step('isFrozen');return frozen},
    async drained(){step('drained');return fail!=='busy'},
    async emergencyBackup(){step('emergencyBackup');snapshot={users:db.prepare('SELECT * FROM users').all(),saves:db.prepare('SELECT * FROM saves').all(),grants:db.prepare('SELECT * FROM grants').all()};return 'synthetic-checkpoint'},
    async verifyEmergencyBackup(value){step('verifyEmergencyBackup');return value==='synthetic-checkpoint' && snapshot.saves[0].level===20},
    async verifyRestorePoint(value){step('verifyRestorePoint');return value==='synthetic-yesterday'},
    async ownerConfirmation(){step('ownerConfirmation');return fail!=='decline'},
    async restore(){step('restore');db.exec('DELETE FROM grants;DELETE FROM saves;DELETE FROM users');for(const x of old.users)db.prepare('INSERT INTO users VALUES(?,?)').run(x.id,x.name);for(const x of old.saves)db.prepare('INSERT INTO saves VALUES(?,?)').run(x.user_id,x.level);for(const x of old.grants)db.prepare('INSERT INTO grants VALUES(?,?)').run(x.id,x.user_id)},
    async verifyRestored(){step('verifyRestored');return db.prepare('SELECT level FROM saves').get().level===10&&db.prepare('SELECT COUNT(*) n FROM grants').get().n===1},
    async resume(){step('resume');frozen=false},
  };
  return {adapter,db,log,isFrozen:()=>frozen};
}
let f=fixture();
try{
  const r=await rehearseRecovery(f.adapter,'synthetic-yesterday');
  assert.equal(r.checkpoint,'synthetic-checkpoint');assert.equal(f.isFrozen(),false);
  assert.equal(f.db.prepare('SELECT level FROM saves').get().level,10);
  assert.deepEqual(f.log,['freeze','isFrozen','drained','emergencyBackup','verifyEmergencyBackup','verifyRestorePoint','ownerConfirmation','restore','verifyRestored','resume']);
}finally{f.db.close()}
for(const failure of ['busy','emergencyBackup','verifyEmergencyBackup','verifyRestorePoint','decline','restore','verifyRestored']){
  f=fixture(failure);try{
    await assert.rejects(rehearseRecovery(f.adapter,'synthetic-yesterday'),/no automatic retry or resume/);
    assert.equal(f.isFrozen(),true,`${failure}: failed recovery must stay paused`);
    assert(!f.log.includes('resume'));
    if(!['restore','verifyRestored'].includes(failure))assert(!f.log.includes('restore'));
  }finally{f.db.close()}
}
f=fixture();try{
  f.adapter.kind='production';await assert.rejects(rehearseRecovery(f.adapter,'synthetic-yesterday'),/synthetic local/);assert.equal(f.log.length,0);
  f.adapter.kind='synthetic-local-only';await assert.rejects(rehearseRecovery(f.adapter,'arbitrary'),/Invalid synthetic/);assert.equal(f.log.length,0);
}finally{f.db.close()}
console.log('PASS: synthetic-only freeze, drain, emergency backup, selection, confirmation, restore, checks and fail-closed stops');
