// Disposable local Pages/D1 rehearsal. Never points Wrangler at the repository's production config.
// node tools/staging/local.mjs test | test-strong | test-scrypt | serve
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, hashRecovery } from '../../functions/_lib/auth.js';

const mode = process.argv[2] || 'test';
if (!['test', 'test-strong', 'test-scrypt', 'serve'].includes(mode) || process.argv.length > 3) {
  console.error('Usage: node tools/staging/local.mjs [test|test-strong|test-scrypt|serve]');
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const site = path.join(root, 'dist');
if (!fs.existsSync(path.join(site, 'index.html'))) throw new Error('Build the site first: bash tools/build_site.sh');
const sourceTag = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/const BUILD='([^']+)'/)?.[1];
const builtTag = fs.readFileSync(path.join(site, 'index.html'), 'utf8').match(/const BUILD='([^']+)'/)?.[1];
if (!sourceTag || sourceTag !== builtTag) throw new Error('Built site is stale. Rebuild first: bash tools/build_site.sh');
// No parent or production config is copied or read by Wrangler. Only public source code,
// migrations and two non-secret modules referenced by Functions are copied into a fresh temp dir.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'prontera-isolated-'));
const migrationsDir = path.join(temp, 'migrations');
const testName = 'local-only-' + randomUUID();
const ownerName = 'StageOwner';
const ownerPass = 'StageOnly-password-123!'; // synthetic, public, disposable: NEVER use in production
const legacyCode = 'ABCD-EFGH-JKMN-PQRS'; // synthetic and local only
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' };
for (const k of Object.keys(env)) if (/^(CLOUDFLARE_|CF_|STRIPE_|WRANGLER_API_TOKEN|WRANGLER_ACCOUNT_ID)/i.test(k)) delete env[k];
let child;
const migrated = [];
function npx(args, options = {}) {
  // All arguments are controlled by this script. On Windows use cmd.exe for the npx.cmd shim;
  // no paths, SQL, or user-supplied text are interpolated into the command line.
  const words = ['--yes', 'wrangler@4.154.0', ...args];
  const opts = { cwd: temp, env, ...options };
  return process.platform === 'win32'
    ? { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', 'npx.cmd ' + words.join(' ')], opts }
    : { command: 'npx', args: words, opts };
}
function run(args) {
  const {command, args: argv, opts} = npx(args, {encoding:'utf8'});
  const p = spawnSync(command, argv, opts);
  if (p.error || p.status !== 0) throw new Error(`Local Wrangler command failed: ${p.error || p.stderr || p.stdout}`);
  return p.stdout;
}
function migrationApply() {
  // The explicit --local, fresh random local database id, isolated config/cwd and unshared
  // persistence directory are all intentional. Never change this helper to use --remote.
  const out = run(['d1','migrations','apply',testName,'--local','--persist-to','./state']);
  if (!out.includes('Resource location: local')) throw new Error('Wrangler did not confirm a local database');
  return out;
}
function copyMigration(name) {
  fs.copyFileSync(path.join(root,'migrations',name),path.join(migrationsDir,name));
  migrated.push(name);
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => { const port=server.address().port; server.close(() => resolve(port)); });
  });
}
async function startServer(port, host) {
  const {command,args,opts} = npx(['pages','dev','--persist-to','./state','--ip',host,'--port',String(port),'--show-interactive-dev-session=false'],
    {stdio:['ignore','pipe','pipe'], detached: process.platform !== 'win32'});
  child = spawn(command,args,opts);
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Wrangler startup timed out: ' + output.slice(-4000))), 90000);
    function receive(data) {
      const text=data.toString(); output += text;
      if (mode === 'serve') process.stdout.write(text);
      if (output.includes('Ready on http')) { clearTimeout(timer); resolve(); }
    }
    child.stdout.on('data',receive); child.stderr.on('data',receive);
    child.once('error', e=>{clearTimeout(timer);reject(e)});
    child.once('exit', code=>{clearTimeout(timer);reject(new Error(`Wrangler exited (${code}): ${output.slice(-4000)}`))});
  });
  await ready;
}
async function stopServer() {
  if (!child || child.exitCode !== null) return;
  const done = new Promise(resolve => child.once('exit',resolve));
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid',String(child.pid),'/T','/F'], {stdio:'ignore'});
  else { try { process.kill(-child.pid,'SIGTERM'); } catch {} }
  await Promise.race([done, new Promise(resolve=>setTimeout(resolve,3000))]);
}
async function request(base, route, {method='GET', data, cookie, origin}={}) {
  const headers = {};
  if (data !== undefined) headers['Content-Type']='application/json';
  if (cookie) headers.Cookie=cookie;
  if (origin) headers.Origin=origin;
  const r=await fetch(base+route,{method,headers, ...(data !== undefined ? {body:JSON.stringify(data)} : {})});
  const text=await r.text();
  let json; try { json=JSON.parse(text); } catch { json=null; }
  return {status:r.status,data:json,text,cookie:(r.headers.get('set-cookie')||'').split(';')[0]};
}
async function test(base) {
  const siteRes=await request(base,'/'); assert.equal(siteRes.status,200); assert.match(siteRes.text,/haven-v\d+/);
  const owner=await request(base,'/api/sessions',{method:'POST',data:{u:ownerName,p:ownerPass}});
  assert.equal(owner.status,200,'legacy owner can log in'); assert.equal(owner.data.gm,2,'migration preserved legacy GM');
  assert.equal((await request(base,'/api/gm/players',{cookie:owner.cookie})).status,200);
  const a=await request(base,'/api/register',{method:'POST',data:{u:'StagePlayer',p:'Synthetic-password-123!',email:'player@example.test'}});
  assert.equal(a.status,201); assert.equal(a.data.gm,0); assert.ok(a.data.recovery); assert.ok(a.cookie);
  assert.equal((await request(base,'/api/gm/players',{cookie:a.cookie})).status,403,'player cannot use GM console');
  const duplicate=await request(base,'/api/register',{method:'POST',data:{u:'StageOther',p:'Synthetic-password-123!',email:'PLAYER@example.test'}});
  assert.equal(duplicate.status,409,'email uniqueness is case insensitive');
  const concurrent = await Promise.all(['RaceOne','RaceTwo'].map(u => request(base,'/api/register',{
    method:'POST',data:{u,p:'Synthetic-password-123!',email:'race@example.test'},
  })));
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[201,409],'concurrent registrations cannot share one email');
  const save=JSON.stringify({owner:'StagePlayer',lv:1,cls:'Novice',kills:1});
  assert.equal((await request(base,'/api/save',{method:'PUT',cookie:a.cookie,data:{owner:'StagePlayer',version:0,blob:save}})).status,200);
  const loaded=await request(base,'/api/save',{cookie:a.cookie}); assert.equal(loaded.status,200); assert.equal(loaded.data.blob,save);
  assert.equal((await request(base,'/api/board?board=echo',{cookie:a.cookie})).status,503,'untrusted board is paused');
  const reset=await request(base,'/api/recover',{method:'POST',data:{u:'StagePlayer',email:'player@example.test',code:a.data.recovery,p:'Changed-password-123!'}});
  assert.equal(reset.status,200); assert.notEqual(reset.data.recovery,a.data.recovery);
  assert.equal((await request(base,'/api/me',{cookie:a.cookie})).status,401,'recovery revokes the old session');
  assert.equal((await request(base,'/api/recover',{method:'POST',data:{u:'StagePlayer',email:'player@example.test',code:a.data.recovery,p:'Changed-password-123!'}})).status,400,'old recovery code is single-use');
  assert.equal((await request(base,'/api/sessions',{method:'POST',data:{u:'StagePlayer',p:'Synthetic-password-123!'}})).status,401,'old password is invalid');
  const relog=await request(base,'/api/sessions',{method:'POST',data:{u:'StagePlayer',p:'Changed-password-123!'}});
  assert.equal(relog.status,200); assert.equal((await request(base,'/api/save',{cookie:relog.cookie})).data.blob,save);
  assert.equal((await request(base,'/api/sessions',{method:'POST',origin:'https://not-the-game.invalid',data:{u:'StagePlayer',p:'Changed-password-123!'}})).status,403);
  if (mode === 'test-strong' || mode === 'test-scrypt') {
    const legacy=await request(base,'/api/sessions',{method:'POST',data:{u:'StageLegacy',p:ownerPass}});
    assert.equal(legacy.status,200,'legacy synthetic account can log in');
    const legacyReset=await request(base,'/api/recover',{method:'POST',data:{u:'StageLegacy',email:'legacy@example.test',code:legacyCode,p:'Legacy-changed-123!'}});
    assert.equal(legacyReset.status,200,'a 20k recovery code remains usable in the stronger candidate');
    assert.notEqual(legacyReset.data.recovery,legacyCode);
    assert.equal((await request(base,'/api/me',{cookie:legacy.cookie})).status,401,'legacy reset revokes session');
    assert.equal((await request(base,'/api/recover',{method:'POST',data:{u:'StageLegacy',email:'legacy@example.test',code:legacyCode,p:'Legacy-changed-123!'}})).status,400,'legacy code is consumed');
    assert.equal((await request(base,'/api/sessions',{method:'POST',data:{u:'StageLegacy',p:'Legacy-changed-123!'}})).status,200);
    // Two consumers of the same rotated code must not both reset the account.
    const data={u:'StagePlayer',email:'player@example.test',code:reset.data.recovery,p:'Second-change-123!'};
    const race=await Promise.all([request(base,'/api/recover',{method:'POST',data}),request(base,'/api/recover',{method:'POST',data})]);
    assert.deepEqual(race.map(x=>x.status).sort(),[200,400],'stronger hash must preserve single-use recovery');
    assert.equal((await request(base,'/api/me',{cookie:relog.cookie})).status,401,'winning recovery revokes the previous session');
    const playerSession=await request(base,'/api/sessions',{method:'POST',data:{u:'StagePlayer',p:'Second-change-123!'}});
    assert.equal(playerSession.status,200);
    if (mode === 'test-scrypt') {
      const list=await request(base,'/api/gm/players',{cookie:owner.cookie});
      const target=list.data?.players?.find(p=>p.u==='StagePlayer');
      assert(Number.isInteger(target?.id),'synthetic player must appear in GM console');
      const gmReset=await request(base,'/api/gm/player',{method:'POST',cookie:owner.cookie,
        data:{id:target.id,action:'set-password',password:'GM-reset-synthetic-123!'}});
      assert.equal(gmReset.status,200,'synthetic GM reset works with the candidate');
      assert.equal((await request(base,'/api/me',{cookie:playerSession.cookie})).status,401,'GM reset revokes player session');
      assert.equal((await request(base,'/api/sessions',{method:'POST',data:{u:'StagePlayer',p:'Second-change-123!'}})).status,401);
      assert.equal((await request(base,'/api/sessions',{method:'POST',data:{u:'StagePlayer',p:'GM-reset-synthetic-123!'}})).status,200);
      const legacyTarget=list.data.players.find(p=>p.u==='StageLegacy');
      assert(Number.isInteger(legacyTarget?.id));
      const [racingLogin,racingReset]=await Promise.all([
        request(base,'/api/sessions',{method:'POST',data:{u:'StageLegacy',p:'Legacy-changed-123!'}}),
        request(base,'/api/gm/player',{method:'POST',cookie:owner.cookie,
          data:{id:legacyTarget.id,action:'set-password',password:'GM-legacy-synthetic-123!'}}),
      ]);
      assert([200,401].includes(racingLogin.status),'racing old login may succeed only before reset');
      assert.equal(racingReset.status,200,'concurrent GM reset succeeds');
      if (racingLogin.status===200) assert.equal((await request(base,'/api/me',{cookie:racingLogin.cookie})).status,401,'racing old session must not survive reset');
      assert.equal((await request(base,'/api/sessions',{method:'POST',data:{u:'StageLegacy',p:'Legacy-changed-123!'}})).status,401);
      assert.equal((await request(base,'/api/sessions',{method:'POST',data:{u:'StageLegacy',p:'GM-legacy-synthetic-123!'}})).status,200);
    }
  }
  console.log('PASS: real local Pages runtime, legacy owner/migration, player registration, unique email, GM authorization, save, paused board, recovery, session revocation and origin rejection.');
}
try {
  fs.cpSync(path.join(root,'functions'),path.join(temp,'functions'),{recursive:true});
  if (mode === 'test-strong') {
    // Experimental candidate ONLY in the disposable copy, never repo code or a deployment.
    const auth=path.join(temp,'functions','_lib','auth.js');
    const text=fs.readFileSync(auth,'utf8'), current='const ITER = 20000;';
    assert.equal(text.split(current).length,2,'expected the unchanged live work factor');
    fs.writeFileSync(auth,text.replace(current,'const ITER = 600000;'));
    console.log('EXPERIMENT: PBKDF2-SHA256 600,000 in disposable local copy only; hosted limits are NOT tested.');
  }
  if (mode === 'test-scrypt') {
    // Patch ONLY the disposable Functions copy. The unmodified original is kept in the
    // same temporary directory as a legacy verifier; real repository auth is untouched.
    const auth=path.join(temp,'functions','_lib','auth.js'), source=fs.readFileSync(auth,'utf8');
    fs.writeFileSync(path.join(temp,'functions','_lib','auth-legacy.js'),source);
    const prototypeDir=path.join(temp,'tools','prototypes');fs.mkdirSync(prototypeDir,{recursive:true});
    const prototype=fs.readFileSync(path.join(root,'tools','prototypes','scrypt_passwords.mjs'),'utf8');
    const legacyImport="../../functions/_lib/auth.js";
    assert.equal(prototype.split(legacyImport).length,2,'expected prototype legacy import');
    fs.writeFileSync(path.join(prototypeDir,'scrypt_passwords.mjs'),prototype.replace(legacyImport,'../../functions/_lib/auth-legacy.js'));
    const start=source.indexOf('// ---------------------------------------------------------------- hashing ----');
    const end=source.indexOf('// --------------------------------------------------------------- sessions ----');
    assert(start>=0&&end>start,'expected temporary auth boundaries');
    const candidate=`// TEMPORARY EXPERIMENT ONLY: never deploy this patched copy.\nconst enc = new TextEncoder();\nexport async function hashPassword(password){return hashCandidate(password)}\nexport async function verifyPassword(password,stored,options){return verifyCandidate(password,stored,options)}\nexport async function hashRecovery(code){return hashCandidate(String(code).toUpperCase())}\nexport async function verifyRecovery(code,stored){return !!stored && (await verifyCandidate(String(code).toUpperCase(),stored,{upgrade:false})).ok}\n\n`;
    const candidateImport="import { hashCandidate, verifyCandidate } from '../../tools/prototypes/scrypt_passwords.mjs';\n";
    fs.writeFileSync(auth,candidateImport+source.slice(0,start)+candidate+source.slice(end));
    console.log('EXPERIMENT: scrypt candidate is wired only into disposable local Functions and D1; NOT a hosted test or deployment.');
  }
  fs.mkdirSync(path.join(temp,'assets')); fs.mkdirSync(migrationsDir);
  for (const file of ['wardrobe.js','shop-catalog.js']) fs.copyFileSync(path.join(root,'assets',file),path.join(temp,'assets',file));
  const date = fs.readFileSync(path.join(root,'wrangler.toml'),'utf8').match(/^compatibility_date\s*=\s*"(\d{4}-\d{2}-\d{2})"/m)?.[1];
  if (!date) throw new Error('Cannot determine the repository compatibility date');
  // Absolute site path is JSON-escaped (valid TOML basic string); no production ids/bindings.
  fs.writeFileSync(path.join(temp,'wrangler.toml'),`name = "prontera-disposable-staging"\ncompatibility_date = "${date}"\npages_build_output_dir = ${JSON.stringify(site)}\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "${testName}"\ndatabase_id = "${randomUUID()}"\n`);
  const names=fs.readdirSync(path.join(root,'migrations')).filter(n=>/^\d+_.*\.sql$/.test(n)).sort();
  if (!names.includes('0007_account_email.sql')) throw new Error('Migration 0007 is missing');
  names.filter(n=>n<'0007_account_email.sql').forEach(copyMigration);
  migrationApply();
  const pwHash=await hashPassword(ownerPass, 20000); // synthetic legacy account, including in stronger-hash rehearsal
  if (!/^pbkdf2\$[0-9]+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(pwHash)) throw new Error('Unexpected synthetic password hash');
  let seed=`INSERT INTO users(username, pass_hash, gm, created_at) VALUES ('${ownerName}', '${pwHash}', 2, ${Date.now()});\n`;
  if (mode === 'test-strong' || mode === 'test-scrypt') {
    const legacyRecovery=await hashRecovery(legacyCode); // current 20k, synthetic only
    if (!/^pbkdf2\$20000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(legacyRecovery)) throw new Error('Unexpected synthetic legacy recovery hash');
    seed+=`INSERT INTO users(username, pass_hash, recovery_hash, gm, created_at) VALUES ('StageLegacy', '${pwHash}', '${legacyRecovery}', 0, ${Date.now()});\n`;
  }
  fs.writeFileSync(path.join(temp,'seed.sql'),seed);
  const seeded=run(['d1','execute',testName,'--local','--persist-to','./state','--file','seed.sql']);
  if (!seeded.includes('local database')) throw new Error('Owner seed did not confirm local D1');
  names.filter(n=>n>='0007_account_email.sql').forEach(copyMigration);
  migrationApply();
  if (mode === 'test-strong' || mode === 'test-scrypt') {
    const updated=run(['d1','execute',testName,'--local','--persist-to','./state','--command',"UPDATE users SET email='legacy@example.test' WHERE username='StageLegacy'"]);
    if (!updated.includes('local database')) throw new Error('Legacy synthetic email update did not confirm local D1');
  }
  const again=migrationApply();
  assert.match(again,/No migrations to apply/i,'reapplying via local migration ledger must be a no-op');
  console.log(`Isolated local D1 ready; ${migrated.length} migrations applied. No production data or Cloudflare login used.`);
  const port=mode!=='serve' ? await freePort() : Number(process.env.PG_STAGING_PORT || 8787);
  if (!Number.isInteger(port) || port<1 || port>65535) throw new Error('Invalid PG_STAGING_PORT');
  const host=mode==='serve' && process.env.PG_STAGING_EXPOSE==='1' ? '0.0.0.0' : '127.0.0.1';
  if (host !== '127.0.0.1') console.warn('WARNING: synthetic owner credentials are public; this preview is accessible on your network.');
  await startServer(port,host);
  if (mode!=='serve') {
    await test(`http://127.0.0.1:${port}`);
    if (mode==='test-strong' || mode==='test-scrypt') {
      // Shut down before querying the isolated store; SQL returns only booleans, never hashes.
      await stopServer(); child=undefined;
      const prefix=mode==='test-scrypt'?'pg-scrypt-v1$*':'pbkdf2$600000$*';
      const sql=`SELECT username, pass_hash GLOB '${prefix}' AS pass_upgraded, recovery_hash GLOB '${prefix}' AS recovery_upgraded FROM users WHERE username IN ('StageLegacy','StageOwner','StagePlayer') ORDER BY username`;
      const out=run(['d1','execute',testName,'--local','--persist-to','./state','--json','--command',sql]);
      const rows=JSON.parse(out)[0].results;
      assert.equal(rows.length,3);
      assert.equal(rows[0].username,'StageLegacy');assert.equal(rows[0].pass_upgraded,1);assert.equal(rows[0].recovery_upgraded,1);
      assert.equal(rows[1].username,ownerName);assert.equal(rows[1].pass_upgraded,1,'legacy owner password was upgraded');
      assert.equal(rows[2].username,'StagePlayer');assert.equal(rows[2].pass_upgraded,1);assert.equal(rows[2].recovery_upgraded,1);
      console.log(`PASS: disposable local ${mode} candidate upgrades a 20k legacy owner and creates/rotates candidate hashes. NOT hosted proof.`);
    }
  } else {
    console.log(`\nLocal test game: http://127.0.0.1:${port}/\nSynthetic GM owner: ${ownerName}\nSynthetic password: ${ownerPass}\nUse test data only. Ctrl+C stops and deletes this disposable database.\n`);
    await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);child.once('exit',resolve)});
  }
} finally {
  await stopServer();
  fs.rmSync(temp,{recursive:true,force:true});
}
