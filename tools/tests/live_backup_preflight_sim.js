// Synthetic local backup only. No Cloudflare or production account data.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {verifyInfo,validateExport,describeSchema,runPreflight} from '../staging/live_backup_preflight.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pg-backup-preflight-test-'));
const source=path.join(temp,'synthetic.sql'),saved=path.join(temp,'copied.sql');
const ddl=`CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT COLLATE NOCASE);
CREATE UNIQUE INDEX idx_users_email ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;
CREATE TABLE saves(user_id INTEGER REFERENCES users(id));
CREATE TABLE sessions(user_id INTEGER REFERENCES users(id));
CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT);
INSERT INTO d1_migrations VALUES(1,'0001_init.sql');
INSERT INTO users VALUES(1,'private-test@example.test');`;
try{
 fs.writeFileSync(source,ddl);
 assert(verifyInfo({name:'pg',uuid:'50a6448b-1f12-466c-a28a-10544bedf750'}));
 assert(!verifyInfo({name:'pg-staging',uuid:'3a38c6fc-96a8-491d-b97b-fd536e575ca4'}));
 assert.deepEqual(validateExport(source),{integrity:'ok',foreignKeys:'ok',coreTables:'present'});
 const database=new DatabaseSync(':memory:');database.exec(ddl);
 const seen=[];let verified=false,exported=false,report='';
 const db={verify(){verified=true},export(){assert(verified);exported=true;return source},query(sql){
   assert(exported);assert(/^(SELECT name FROM sqlite_master|PRAGMA table_info|PRAGMA index_list|PRAGMA index_xinfo|SELECT name FROM d1_migrations)/.test(sql));
   seen.push(sql);return database.prepare(sql).all();
 }};
 const result=runPreflight({db,copyBackup:file=>{fs.copyFileSync(file,saved);return saved},report:s=>{report=s}});
 assert.equal(result.emailColumn,'present');assert.equal(result.uniqueEmailIndex,'present');
 assert.deepEqual(result.migrationLedger,['0001_init.sql']);assert.deepEqual(result.launchTablesAlreadyPresent,[]);
 assert(!report.includes('private-test@example.test'),'backup/account contents never printed');
 assert(seen.length===5);
 assert.equal(describeSchema({tables:database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(),
  columns:database.prepare('PRAGMA table_info(users)').all(),indexes:[],indexColumns:[],ledger:null}).uniqueEmailIndex,'absent or incompatible');
 let exportedWrong=false;
 assert.throws(()=>runPreflight({db:{verify(){throw Error('wrong DB')},export(){exportedWrong=true}},copyBackup(){}}),/wrong DB/);
 assert.equal(exportedWrong,false,'wrong database cannot be exported');
 const bad=path.join(temp,'bad.sql');fs.writeFileSync(bad,'PRIVATE-SYNTHETIC');
 assert.throws(()=>validateExport(bad),e=>!e.message.includes('PRIVATE-SYNTHETIC'));
 database.close();
 console.log('PASS: fixed live ID guard, synthetic backup integrity, email/schema/ledger inspection, no account-data output');
}finally{fs.rmSync(temp,{recursive:true,force:true})}
