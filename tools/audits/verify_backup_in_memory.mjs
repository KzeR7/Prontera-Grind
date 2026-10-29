// Owner-run on trusted Wrangler D1 SQL exports only. Does not connect to Cloudflare.
// Opens the export read-only, restores to an in-memory SQLite database, prints no rows or secrets.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

if(process.argv.length!==3){console.error('Usage: node verify_backup_in_memory.mjs <trusted-export.sql>');process.exit(2)}
let sql, db, stage='read trusted export';
try{
  sql=fs.readFileSync(process.argv[2],'utf8');
  if(!sql.trim())throw Error('empty input');
  db=new DatabaseSync(':memory:');
  db.exec('PRAGMA temp_store=MEMORY');
  stage='restore SQL in memory';db.exec(sql);sql='';
  stage='integrity checks';
  const integrity=db.prepare('PRAGMA integrity_check').all();
  const integrityOk=integrity.length===1&&Object.values(integrity[0])[0]==='ok';
  const fkOk=db.prepare('PRAGMA foreign_key_check').all().length===0;
  const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(r=>r.name);
  const coreTables=['users','saves','sessions'].every(n=>tables.includes(n));
  if(!integrityOk||!fkOk||!coreTables)throw Error('integrity, foreign-key or core-table check failed');
  const columns=db.prepare('PRAGMA table_info(users)').all().map(r=>r.name);
  console.log(JSON.stringify({restoredInMemory:true,integrity:'ok',foreignKeyCheck:'ok',coreTables:'present',
    emailColumn:columns.includes('email')?'present':'absent',
    note:'This checks only the supplied snapshot. It does not verify recency, every player save, hosted restore, production or the ability to recover updates after the export.'},null,2));
}catch{
  // Errors may contain SQL and private account data; never echo them or the path.
  console.error(`Backup check failed at: ${stage}. No account rows or file contents printed.`);
  process.exitCode=1;
}finally{if(db)db.close()}
