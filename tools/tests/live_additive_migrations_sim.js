// Synthetic local SQLite only. Never contacts Cloudflare or real backups.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {MIGRATIONS,TABLES,verifyIdentity,checkBackup,checkMigrationBytes,runMigration} from '../staging/live_additive_migrations.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pg-live-migration-test-'));
const backup=path.join(temp,'pg-before-launch-20261030013458-12e090a9.sql');
const sql=`CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT COLLATE NOCASE);
CREATE UNIQUE INDEX idx_users_email ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;
CREATE TABLE saves(user_id INTEGER REFERENCES users(id));CREATE TABLE sessions(user_id INTEGER REFERENCES users(id));
CREATE TABLE grants(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),kind TEXT,payload TEXT,note TEXT,created_by TEXT,created_at INTEGER,claimed_at INTEGER);
INSERT INTO users VALUES(1,'synthetic@example.test');INSERT INTO saves VALUES(1);`;
const load=name=>fs.readFileSync('migrations/'+name);
function makeDb(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(sql);
 const applied=[];
 return {sqlite:db,applied,verify(){},query(query){return db.prepare(query).all()},apply(name,bytes){applied.push(name);db.exec(bytes.toString())}};
}
try{
 fs.writeFileSync(backup,sql);
 assert(verifyIdentity({name:'pg',uuid:'50a6448b-1f12-466c-a28a-10544bedf750'}));
 assert(!verifyIdentity({name:'pg-staging',uuid:'3a38c6fc-96a8-491d-b97b-fd536e575ca4'}));
 checkBackup(backup);assert.throws(()=>checkBackup(backup,Date.now()+3*3600000),/less than two hours/);
 assert.throws(()=>checkBackup(path.join(temp,'unexpected.sql')),/filename/);
 for(const [name,hash] of MIGRATIONS)checkMigrationBytes(name,hash,load(name));
 assert.throws(()=>checkMigrationBytes(MIGRATIONS[0][0],MIGRATIONS[0][1],Buffer.from('fake')),/mismatch/);
 let db=makeDb();
 try{
  const output=[];runMigration({db,backupCheck:()=>checkBackup(backup),loadMigration:load,report:s=>output.push(s)});
  assert.deepEqual(db.applied,MIGRATIONS.map(x=>x[0]));assert(!db.applied.some(x=>x.startsWith('0007')));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n,1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM saves').get().n,1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM competition_scores').get().n,0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM grants').get().n,0);
  assert.equal(db.sqlite.prepare('SELECT starts_at FROM unverified_echo_config').get().starts_at,0);
  for(const name of Object.keys(TABLES))assert(db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name));
  assert(output.at(-1).includes('0007 was not rerun'));
  const count=db.applied.length;assert.throws(()=>runMigration({db,backupCheck(){},loadMigration:load,report(){}}),/already exists/);
  assert.equal(db.applied.length,count,'repeat is refused instead of silently accepting pre-existing tables');
 }finally{db.sqlite.close()}
 db=makeDb();try{
  db.sqlite.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT)');
  assert.throws(()=>runMigration({db,backupCheck(){},loadMigration:load,report(){}}),/ledger changed/);assert.equal(db.applied.length,0);
 }finally{db.sqlite.close()}
 db=makeDb();try{
  db.sqlite.exec('CREATE INDEX idx_competition_scores_rank ON users(id)');
  assert.throws(()=>runMigration({db,backupCheck(){},loadMigration:load,report(){}}),/index already exists/);assert.equal(db.applied.length,0);
 }finally{db.sqlite.close()}
 db=makeDb();try{
  db.verify=()=>{throw Error('wrong ID')};
  assert.throws(()=>runMigration({db,backupCheck(){},loadMigration:load,report(){}}),/wrong ID/);assert.equal(db.applied.length,0);
 }finally{db.sqlite.close()}
 db=makeDb();try{
  db.apply=(name,bytes)=>{db.applied.push(name);if(name.startsWith('0009'))throw Error('injected failure');db.sqlite.exec(bytes.toString())};
  assert.throws(()=>runMigration({db,backupCheck(){},loadMigration:load,report(){}}),/may be partial.*Do NOT retry/);
  assert.deepEqual(db.applied,MIGRATIONS.slice(0,2).map(x=>x[0]));
 }finally{db.sqlite.close()}
 db=makeDb();try{
  const realQuery=db.query.bind(db);db.query=q=>q.startsWith('SELECT starts_at,ruleset')?[{starts_at:1,ruleset:'wrong'}]:realQuery(q);
  assert.throws(()=>runMigration({db,backupCheck(){},loadMigration:load,report(){}}),/live state may be partial or complete.*Do NOT retry or merge/);
  assert.equal(db.applied.length,4);
 }finally{db.sqlite.close()}
 db=makeDb();try{
  let called=false;db.verify=()=>{called=true};
  assert.throws(()=>runMigration({db,backupCheck(){throw Error('bad backup')},loadMigration:load,report(){}}),/bad backup/);
  assert.equal(called,false);assert.equal(db.applied.length,0);
  assert.throws(()=>runMigration({db,backupCheck(){},loadMigration:()=>Buffer.from('modified'),report(){}}),/mismatch/);
  assert.equal(called,false);assert.equal(db.applied.length,0);
 }finally{db.sqlite.close()}
 console.log('PASS: fixed live identity, backup age/integrity, exact staged migrations, 0007 preserved, refusal/retry and fail-stop checks');
}finally{fs.rmSync(temp,{recursive:true,force:true})}
