// Owner-run, one synthetic account on the *fixed* isolated staging D1 + Pages deployment.
// Never imports production config, accesses real accounts, or prints passwords, codes or hashes.
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DB_ID='3a38c6fc-96a8-491d-b97b-fd536e575ca4';
const DB_NAME='pg-staging';
const HOST='https://56968bf2.prontera-grind-staging.pages.dev';
const PROFILE={N:16384,r:8,p:5,maxmem:32*1024*1024};
export function verifyInfo(info){return info?.uuid===DB_ID && info?.name===DB_NAME}
function candidate(secret){
  const salt=randomBytes(16),hash=scryptSync(secret,salt,32,PROFILE);
  return `pg-scrypt-v1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}
// SQL text is generated entirely from fixed syntax and a random hex marker; never user input.
export function makeCase(){
  const suffix=randomBytes(6).toString('hex'), username='T'+suffix, email=`t${suffix}@example.test`;
  const password='Synthetic-'+randomBytes(24).toString('base64url');
  const newPassword='SyntheticNew-'+randomBytes(24).toString('base64url');
  const code=randomBytes(8).toString('hex').toUpperCase(), created=Date.now();
  const passHash=candidate(password),recHash=candidate(code);
  const where=`username='${username}' AND email='${email}' AND created_at=${created} AND gm=0`;
  return {username,email,password,newPassword,code,
    seed:`INSERT INTO users(username,email,pass_hash,recovery_hash,gm,created_at) VALUES ('${username}','${email}','${passHash}','${recHash}',0,${created});`,
    check:`SELECT COUNT(*) AS n, COALESCE(MAX(pass_hash GLOB 'pg-scrypt-v1$*'),0) AS scrypt_pass, COALESCE(MAX(recovery_hash GLOB 'pg-scrypt-v1$*'),0) AS scrypt_recovery, COALESCE(MAX(pass_hash GLOB 'pbkdf2$20000$*'),0) AS pbkdf2_pass, COALESCE(MAX(recovery_hash GLOB 'pbkdf2$20000$*'),0) AS pbkdf2_recovery FROM users WHERE ${where};`,
    cleanup:`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE ${where});\nDELETE FROM events WHERE user_id IN (SELECT id FROM users WHERE ${where});\nDELETE FROM rate_limits WHERE key IN ('login-name:${username.toLowerCase()}','recover-name:${username.toLowerCase()}') AND EXISTS (SELECT 1 FROM users WHERE ${where});\nDELETE FROM users WHERE ${where};`};
}
export async function runProbe({exec,request,testCase,report=()=>{}}){
  const c=testCase, results=[];let seedAttempted=false, cleanupOk=false, failure;
  async function check(name,route,options,expected){
    const r=await request(route,options);
    if(r.status!==expected)throw Error(`${name}: expected HTTP ${expected}, received HTTP ${r.status}`);
    results.push({check:name,status:r.status});return r;
  }
  try{
    seedAttempted=true;await exec(c.seed);
    const before=await exec(c.check);
    assert.equal(before[0]?.n,1,'synthetic account must exist once');
    assert.equal(before[0]?.scrypt_pass,1);assert.equal(before[0]?.scrypt_recovery,1);
    const login=await check('scrypt login','/api/sessions',{method:'POST',data:{u:c.username,p:c.password}},200);
    assert.equal(login.data?.gm,0,'synthetic account must not have GM privileges');
    assert(login.cookie?.startsWith('pg_session='),'login must return a session');
    await check('session active','/api/me',{cookie:login.cookie},200);
    await check('competition paused','/api/board?board=echo',{cookie:login.cookie},503);
    const afterLogin=await exec(c.check);assert.equal(afterLogin[0]?.scrypt_pass,1,'login must preserve scrypt hash');
    const reset=await check('scrypt recovery','/api/recover',{method:'POST',data:{u:c.username,email:c.email,code:c.code,p:c.newPassword}},200);
    assert(typeof reset.data?.recovery==='string'&&reset.data.recovery!==c.code,'recovery must rotate the synthetic code');
    await check('old session revoked','/api/me',{cookie:login.cookie},401);
    await check('new password login','/api/sessions',{method:'POST',data:{u:c.username,p:c.newPassword}},200);
    const afterReset=await exec(c.check);
    assert.equal(afterReset[0]?.pbkdf2_pass,1,'reader-only reset must write PBKDF2');
    assert.equal(afterReset[0]?.pbkdf2_recovery,1,'reader-only recovery code must be PBKDF2');
  }catch(e){failure=e}
  finally{
    if(seedAttempted){try{await exec(c.cleanup);const rows=await exec(c.check);cleanupOk=rows[0]?.n===0}catch{cleanupOk=false}}
  }
  if(!cleanupOk)throw Error(`Synthetic account cleanup was not confirmed (${c.username}); contact the operator. Earlier failure: ${failure?'yes':'no'}.`);
  if(failure)throw Error(`Synthetic test failed: ${failure.message}. Cleanup confirmed.`);
  report({results,cleanup:'confirmed',note:'Only isolated staging and synthetic data. A few requests are not a load, CPU, cost or production rollback test.'});
}

export function safeSql(sql){
  const single=sql.replace(/\s+/g,' ');
  if(!/^[A-Za-z0-9_@$.*'(),;:= -]+$/.test(single))throw Error('Unsafe generated staging SQL');
  return single;
}
function makeRemote(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pg-reader-stage-'));
  fs.writeFileSync(path.join(temp,'wrangler.jsonc'),JSON.stringify({name:'pg-staging-probe',compatibility_date:'2026-10-01',
    d1_databases:[{binding:'DB',database_name:DB_NAME,database_id:DB_ID}]},null,2));
  const env={...process.env,WRANGLER_SEND_METRICS:'false'};
  function wrangler(args,sql){
    const words=['--yes','wrangler@4.154.0',...args,'--config','wrangler.jsonc'];
    // Only fixed SQL with generated alphanumeric/base64url inputs is allowed. Quote it
    // for Windows cmd.exe; no interpolated shell metacharacters, user input or paths.
    if(sql!==undefined){
      sql=safeSql(sql);
      words.push('--command',sql);
    }
    const windowsWords=sql===undefined?words:[...words.slice(0,-1),'"'+sql+'"'];
    const p=process.platform==='win32'
      ?spawnSync(process.env.ComSpec||'cmd.exe',['/d','/v:off','/s','/c','npx.cmd '+windowsWords.join(' ')],{cwd:temp,env,encoding:'utf8',timeout:120000})
      :spawnSync('npx',words,{cwd:temp,env,encoding:'utf8',timeout:120000});
    // Child output may contain SQL or account details. Do not print it.
    if(p.error||p.status!==0)throw Error(`Wrangler ${args.slice(0,2).join(' ')} failed; check your Cloudflare login and staging access privately`);
    try{return JSON.parse(p.stdout)}catch{throw Error('Wrangler did not return valid JSON')}
  }
  return {
    verify(){assert(verifyInfo(wrangler(['d1','info','DB','--json'])),'remote staging database identity mismatch')},
    exec(sql){
      // --command uses D1's query API; --file uses the import API and can take the
      // entire staging database offline while it executes, so it is deliberately avoided.
      const output=wrangler(['d1','execute','DB','--remote','--json'],sql);
      if(!Array.isArray(output)||output.some(x=>x.success!==true))throw Error('Staging SQL failed');
      return output.at(-1).results||[];
    },
    dispose(){fs.rmSync(temp,{recursive:true,force:true})}
  };
}
async function stageRequest(route,{method='GET',data,cookie}={}){
  const headers={};if(data!==undefined)headers['Content-Type']='application/json';if(cookie)headers.Cookie=cookie;
  const r=await fetch(HOST+route,{method,headers,redirect:'manual',signal:AbortSignal.timeout(30000),...(data!==undefined?{body:JSON.stringify(data)}:{})});
  const text=await r.text();let json;try{json=JSON.parse(text)}catch{json=null}
  return {status:r.status,data:json,cookie:(r.headers.get('set-cookie')||'').split(';')[0]};
}
async function main(){
  if(process.argv.length!==2)throw Error('This fixed staging-only probe takes no arguments');
  const db=makeRemote();let c;
  try{
    db.verify();c=makeCase();
    console.log(`Verified fixed staging database; synthetic account ${c.username} will be removed after the test.`);
    await runProbe({exec:db.exec,request:stageRequest,testCase:c,report:r=>console.log(JSON.stringify(r,null,2))});
  }finally{db.dispose()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(e=>{console.error(String(e.message||'Synthetic staging probe failed'));process.exitCode=1});
