// Synthetic local SQLite only. Never contacts Cloudflare or a live database.
// Proves the read-only launch-schema check reports a complete application as
// complete, and reports each kind of partial application as partial.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {collectLaunchSchema,evaluateLaunchSchema} from '../staging/live_launch_schema_check.mjs';
import {MIGRATIONS,TABLES,TRIGGERS,INDEXES} from '../staging/live_additive_migrations.mjs';

const load=name=>fs.readFileSync('migrations/'+name,'utf8');
// Same baseline the migration sim uses: post-0007 shape with three core tables.
const BASELINE=`CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT COLLATE NOCASE);
CREATE UNIQUE INDEX idx_users_email ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;
CREATE TABLE saves(user_id INTEGER REFERENCES users(id));CREATE TABLE sessions(user_id INTEGER REFERENCES users(id));
CREATE TABLE grants(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),kind TEXT,payload TEXT,note TEXT,created_by TEXT,created_at INTEGER,claimed_at INTEGER);
INSERT INTO users VALUES(1,'synthetic@example.test');INSERT INTO saves VALUES(1);`;

function makeDb(applyMigrations=true){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('PRAGMA foreign_keys=ON');sqlite.exec(BASELINE);
 if(applyMigrations)for(const [name] of MIGRATIONS)sqlite.exec(load(name));
 return {sqlite,query:q=>sqlite.prepare(q).all()};
}

// 1. Complete application reads as complete.
let db=makeDb();
try{
 const result=evaluateLaunchSchema(collectLaunchSchema(db));
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.deepEqual(result.missingTables,[]);
 assert.deepEqual(result.missingTriggers,[]);
 assert.deepEqual(result.missingIndexes,[]);
 assert.deepEqual(result.configProblems,[]);
}finally{db.sqlite.close()}

// 1b. An already-activated board is complete, not damaged: starts_at stops being 0
//     as soon as the new board or save code serves its first request.
db=makeDb();
try{
 db.sqlite.exec('UPDATE unverified_echo_config SET starts_at=1793000000000 WHERE singleton=1');
 const result=evaluateLaunchSchema(collectLaunchSchema(db));
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.boardState,'activated');
 assert.equal(result.startsAt,1793000000000);
 assert.deepEqual(result.configProblems,[]);
}finally{db.sqlite.close()}

// 1c. Values the launch code cannot have written are still refused.
for(const [label,value] of [['one',1],['negative',-5],['before 2020',1600000000000-1]]){
 db=makeDb();
 try{
  db.sqlite.exec('UPDATE unverified_echo_config SET starts_at='+value+' WHERE singleton=1');
  const result=evaluateLaunchSchema(collectLaunchSchema(db));
  assert.equal(result.ok,false,label+' should be refused');
  assert.equal(result.boardState,'invalid',label+' should not read as activated');
  assert(result.configProblems.some(x=>/plausible millisecond/.test(x)),label+': '+JSON.stringify(result.configProblems));
 }finally{db.sqlite.close()}
}
db=makeDb();
try{
 db.sqlite.exec("UPDATE unverified_echo_config SET starts_at='not a number' WHERE singleton=1");
 const result=evaluateLaunchSchema(collectLaunchSchema(db));
 assert.equal(result.ok,false);
 assert.equal(result.boardState,'invalid');
 assert(result.configProblems.some(x=>/not an integer/.test(x)),JSON.stringify(result.configProblems));
}finally{db.sqlite.close()}

// 1d. The right timestamp with the wrong ruleset is still a failure.
db=makeDb();
try{
 db.sqlite.exec("PRAGMA ignore_check_constraints=ON;UPDATE unverified_echo_config SET starts_at=1793000000000,ruleset='unverified-save-v2' WHERE singleton=1");
 const result=evaluateLaunchSchema(collectLaunchSchema(db));
 assert.equal(result.ok,false);
 assert.equal(result.boardState,'activated');
 assert(result.configProblems.some(x=>/ruleset/.test(x)),JSON.stringify(result.configProblems));
}finally{db.sqlite.close()}

// 2. The check itself writes nothing: catalogue and row counts are unchanged.
db=makeDb();
try{
 const before=db.sqlite.prepare("SELECT type,name FROM sqlite_master ORDER BY type,name").all();
 const usersBefore=db.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n;
 collectLaunchSchema(db);
 const after=db.sqlite.prepare("SELECT type,name FROM sqlite_master ORDER BY type,name").all();
 assert.deepEqual(after,before,'read-only check changed the schema');
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n,usersBefore);
}finally{db.sqlite.close()}

// 3. One missing trigger is reported by name, and the rest still pass.
db=makeDb();
try{
 db.sqlite.exec(`DROP TRIGGER ${TRIGGERS[0]}`);
 const result=evaluateLaunchSchema(collectLaunchSchema(db));
 assert.equal(result.ok,false);
 assert.deepEqual(result.missingTriggers,[TRIGGERS[0]]);
 assert.deepEqual(result.missingTables,[]);
 assert.deepEqual(result.missingIndexes,[]);
}finally{db.sqlite.close()}

// 4. One missing index is reported by name.
db=makeDb();
try{
 db.sqlite.exec(`DROP INDEX ${INDEXES[0]}`);
 const result=evaluateLaunchSchema(collectLaunchSchema(db));
 assert.equal(result.ok,false);
 assert.deepEqual(result.missingIndexes,[INDEXES[0]]);
}finally{db.sqlite.close()}

// 5. A wrong launch config is reported, and the value is not echoed as data.
db=makeDb();
try{
 db.sqlite.exec('UPDATE unverified_echo_config SET starts_at=1 WHERE singleton=1');
 const result=evaluateLaunchSchema(collectLaunchSchema(db));
 assert.equal(result.ok,false);
 assert(result.configProblems.some(x=>/starts_at/.test(x)),JSON.stringify(result.configProblems));
}finally{db.sqlite.close()}

// 6. Nothing applied: every launch table is listed as missing, and the missing
//    config table does not throw from the config query.
db=makeDb(false);
try{
 const snapshot=collectLaunchSchema(db);
 const result=evaluateLaunchSchema(snapshot);
 assert.equal(result.ok,false);
 assert.deepEqual(result.missingTables.sort(),Object.keys(TABLES).sort());
 assert.deepEqual(result.missingTriggers,[...TRIGGERS]);
 assert.deepEqual(result.missingIndexes,[...INDEXES]);
 assert.deepEqual(snapshot.config,[]);
 assert(result.configProblems.some(x=>/missing/.test(x)),JSON.stringify(result.configProblems));
}finally{db.sqlite.close()}

// 7. A table with the right name but the wrong columns is a column failure, not a pass.
db=makeDb(false);
try{
 db.sqlite.exec('CREATE TABLE damage_samples(user_id INTEGER, slot INTEGER)');
 const result=evaluateLaunchSchema(collectLaunchSchema(db));
 assert.equal(result.ok,false);
 const bad=result.badColumns.find(x=>x.table==='damage_samples');
 assert(bad,'expected damage_samples to be reported');
 assert.deepEqual(bad.expected,TABLES.damage_samples);
 assert.deepEqual(bad.actual,['user_id','slot']);
}finally{db.sqlite.close()}

// 8. The script's own source cannot acquire write paths without failing the gate.
const source=fs.readFileSync('tools/staging/live_launch_schema_check.mjs','utf8');
assert(!/\.apply\(/.test(source),'the read-only check must not call apply()');
assert(!/--remote|d1 execute|migrations apply|writeFileSync/.test(source),
 'the read-only check must not run a remote write command or write a file');

// 9. Garbage in, refusal out: no snapshot must never read as complete.
assert.equal(evaluateLaunchSchema(undefined).ok,false);
assert.equal(evaluateLaunchSchema({}).ok,false);

console.log('PASS: read-only launch schema check flags missing tables, columns, triggers, indexes and config, writes nothing, and accepts a complete 0008-0011 application');
