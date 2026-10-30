// Prepares a real archived reader revision into a disposable temp directory; no deployment.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepare } from '../staging/prepare_hosted_scrypt.mjs';
import { hashPassword as originalHash, verifyPassword as readerVerify } from '../../functions/_lib/auth.js';
assert.throws(()=>prepare(path.join(process.cwd(),'does-not-exist-repository')),'missing repository must fail closed');
const out=prepare(process.cwd());
try{
  const config=fs.readFileSync(path.join(out,'wrangler.toml'),'utf8');
  assert.match(config,/name = "prontera-grind-staging"/);
  assert.match(config,/database_name = "pg-staging"/);
  assert.match(config,/3a38c6fc-96a8-491d-b97b-fd536e575ca4/);
  assert(!config.includes('50a6448b-1f12-466c-a28a-10544bedf750'),'live DB must never be bound');
  assert(!fs.existsSync(path.join(out,'.git')),'candidate is not a git checkout');
  const candidate=await import(pathToFileURL(path.join(out,'functions','_lib','auth.js')));
  const synthetic='Synthetic-stage-password-123!';
  const legacy=await originalHash(synthetic),upgraded=await candidate.verifyPassword(synthetic,legacy);
  assert.equal(upgraded.ok,true);assert.match(upgraded.upgrade,/^pg-scrypt-v1\$/);
  assert.deepEqual(await candidate.verifyPassword('wrong',legacy),{ok:false,upgrade:null});
  const newHash=await candidate.hashPassword(synthetic);
  assert.match(newHash,/^pg-scrypt-v1\$/);assert.equal((await candidate.verifyPassword(synthetic,newHash)).ok,true);
  assert.equal((await readerVerify(synthetic,newHash)).ok,true,'reader-only rollback accepts writer-created hash');
  const rec=await candidate.hashRecovery('abcd-efgh-jkmn-pqrs');
  assert.match(rec,/^pg-scrypt-v1\$/);assert.equal(await candidate.verifyRecovery('abcd-efgh-jkmn-pqrs',rec),true);
  console.log('PASS: staging-only archive/config, legacy upgrade, new scrypt password and recovery, and reader compatibility. No hosted access.');
}finally{fs.rmSync(out,{recursive:true,force:true})}
