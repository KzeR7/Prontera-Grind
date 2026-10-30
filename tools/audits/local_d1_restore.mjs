// Synthetic local D1 export/restore rehearsal. Never reads or writes a hosted database or real backup.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pg-d1-restore-synthetic-'));
const source='source-'+randomUUID(), destination='destination-'+randomUUID();
const env={...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'};
for(const k of Object.keys(env))if(/^(CLOUDFLARE_|CF_|WRANGLER_API_TOKEN|WRANGLER_ACCOUNT_ID)/i.test(k))delete env[k];
function run(args){
  const words=['--yes','wrangler@4.154.0',...args];
  const p=process.platform==='win32'
    ?spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npx.cmd '+words.join(' ')],{cwd:temp,env,encoding:'utf8'})
    :spawnSync('npx',words,{cwd:temp,env,encoding:'utf8'});
  if(p.error||p.status!==0)throw Error(`Local Wrangler failed (${args.slice(0,2).join(' ')}): ${p.error||p.stderr||p.stdout}`);
  return p.stdout;
}
try{
  fs.writeFileSync(path.join(temp,'wrangler.jsonc'),JSON.stringify({name:'pg-synthetic-restore',compatibility_date:'2026-10-01',
    d1_databases:[{binding:'SOURCE',database_name:source,database_id:randomUUID()},
                  {binding:'DESTINATION',database_name:destination,database_id:randomUUID()}]},null,2));
  const files=fs.readdirSync(path.join(root,'migrations')).filter(n=>/^\d+_.*\.sql$/.test(n)).sort();
  assert(files.includes('0007_account_email.sql'));
  const seed=files.map(f=>fs.readFileSync(path.join(root,'migrations',f),'utf8')).join('\n')+`
INSERT INTO users(id,username,pass_hash,gm,created_at,email) VALUES(1,'SyntheticOwner','not-a-real-hash',2,1,NULL),(2,'SyntheticPlayer','not-a-real-hash',0,2,'player@example.test');
INSERT INTO saves(user_id,version,blob,saved_at,updated_at,last_seen) VALUES(2,3,'{"owner":"SyntheticPlayer","lv":42}',1,2,3);
`;
  fs.writeFileSync(path.join(temp,'seed.sql'),seed);
  run(['d1','execute',source,'--local','--file','seed.sql']);
  run(['d1','export',source,'--local','--output','synthetic-backup.sql']);
  assert(fs.statSync(path.join(temp,'synthetic-backup.sql')).size>0,'empty synthetic export');
  const verified=spawnSync(process.execPath,[path.join(root,'tools/audits/verify_backup_in_memory.mjs'),path.join(temp,'synthetic-backup.sql')],{encoding:'utf8'});
  assert.equal(verified.status,0,'in-memory checker failed on Wrangler synthetic export');
  assert.equal(JSON.parse(verified.stdout).restoredInMemory,true);
  run(['d1','execute',destination,'--local','--file','synthetic-backup.sql']);
  const query="SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM users WHERE username='SyntheticOwner' AND gm=2 AND email IS NULL) AS owner_ok, (SELECT count(*) FROM users WHERE username='SyntheticPlayer' AND email='player@example.test') AS player_ok, (SELECT count(*) FROM saves WHERE user_id=2 AND version=3 AND json_extract(blob,'$.lv')=42) AS save_ok";
  // No shell interpolation on Windows: SQL contains shell-sensitive characters, so use a fixed file.
  fs.writeFileSync(path.join(temp,'check.sql'),query+';');
  const raw=run(['d1','execute',destination,'--local','--file','check.sql','--json']);
  const row=JSON.parse(raw)[0].results[0];
  assert.deepEqual({...row},{users:2,owner_ok:1,player_ok:1,save_ok:1});
  fs.writeFileSync(path.join(temp,'indexes.sql'),"SELECT count(*) AS n FROM pragma_index_list('users') WHERE name='idx_users_email' AND \"unique\"=1 AND partial=1;");
  const indexes=JSON.parse(run(['d1','execute',destination,'--local','--json','--file','indexes.sql']))[0].results[0];
  assert.equal(indexes.n,1,'restored partial unique email index missing');
  console.log('PASS: synthetic local D1 export and import into a separate local database; owner, email, save and user indexes survived. No real backup or hosted D1 tested.');
}finally{fs.rmSync(temp,{recursive:true,force:true})}
