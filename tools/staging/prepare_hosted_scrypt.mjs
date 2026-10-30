// Prepares (but NEVER deploys) a staging-only scrypt-writing experiment in a new
// OS temp directory. It archives a fixed reviewed reader revision and writes a fresh,
// fixed isolated-staging Wrangler config. No production config or real data is used.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const READER_COMMIT='7511a03c0787ec9b8d94cfc6658570ac402dc297';
const STAGING_CONFIG=`name = "prontera-grind-staging"\ncompatibility_date = "2026-10-01"\npages_build_output_dir = "dist"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "pg-staging"\ndatabase_id = "3a38c6fc-96a8-491d-b97b-fd536e575ca4"\n`;
function run(command,args){
  const p=spawnSync(command,args,{encoding:'utf8',timeout:120000});
  if(p.error||p.status!==0)throw Error(`${command} failed; check the local repository and staging tools`);
}
export function prepare(repo){
  if(typeof repo!=='string'||!repo.trim())throw Error('A local repository path is required');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pg-scrypt-stage-'));let success=false;
  try{
    const archive=path.join(temp,'source.tar');
    run('git',['-C',repo,'archive','--format=tar','--output',archive,READER_COMMIT]);
    run(process.platform==='win32'?'tar.exe':'tar',['-xf',archive,'-C',temp]);
    fs.unlinkSync(archive);
    // Immediately replace the archived production config with a fixed staging-only
    // config; never read or modify a user's real staging or production config.
    fs.writeFileSync(path.join(temp,'wrangler.toml'),STAGING_CONFIG);
    const auth=path.join(temp,'functions','_lib','auth.js'),source=fs.readFileSync(auth,'utf8');
    fs.writeFileSync(path.join(temp,'functions','_lib','auth-legacy.js'),source);
    const proto=path.join(temp,'tools','prototypes','scrypt_passwords.mjs');
    const text=fs.readFileSync(proto,'utf8'),legacyImport='../../functions/_lib/auth.js';
    assert.equal(text.split(legacyImport).length,2,'expected prototype legacy import');
    fs.writeFileSync(proto,text.replace(legacyImport,'../../functions/_lib/auth-legacy.js'));
    const start=source.indexOf('// ---------------------------------------------------------------- hashing ----');
    const end=source.indexOf('// --------------------------------------------------------------- sessions ----');
    assert(start>=0&&end>start,'expected temporary authentication boundaries');
    const candidate=`// STAGING-ONLY EXPERIMENT: scrypt writes are not approved for production.\nconst enc = new TextEncoder();\nexport async function hashPassword(password){return hashCandidate(password)}\nexport async function verifyPassword(password,stored,options){return verifyCandidate(password,stored,options)}\nexport async function hashRecovery(code){return hashCandidate(String(code).toUpperCase())}\nexport async function verifyRecovery(code,stored){return !!stored && (await verifyCandidate(String(code).toUpperCase(),stored,{upgrade:false})).ok}\n\n`;
    const header="import { hashCandidate, verifyCandidate } from '../../tools/prototypes/scrypt_passwords.mjs';\n";
    fs.writeFileSync(auth,header+source.slice(0,start)+candidate+source.slice(end));
    fs.writeFileSync(path.join(temp,'STAGING-ONLY.txt'),
      'SYNTHETIC STAGING ONLY. Experimental scrypt writes. Never deploy to production, use real credentials, or change this config to a live database. Source reader '+READER_COMMIT+'; target pg-staging.\n');
    success=true;return temp;
  }finally{if(!success)fs.rmSync(temp,{recursive:true,force:true})}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==3)throw Error('Usage: node prepare_hosted_scrypt.mjs <local-repository-path>');
    console.log(JSON.stringify({directory:prepare(path.resolve(process.argv[2])),
      source:READER_COMMIT,project:'prontera-grind-staging',database:'pg-staging',
      note:'Prepared only. No deployment, migration or account access was performed.'},null,2));
  }catch(e){console.error(e.message);process.exitCode=1}
}
