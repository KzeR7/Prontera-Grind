// Owner-run, fixed-target Rift Raid v411 staging deployer.
// It snapshots the current v411 working tree into OS temp, overwrites both Wrangler configs
// with staging-only bindings, checks the fixed D1 identity, applies only migration 0018,
// deploys only the staging Social Worker and Pages project, then verifies version, Social DO,
// and the deployed Pages-to-pg-staging binding. Importing this module has no hosted side effects.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const RIFT_RAID_STAGE=Object.freeze({
  branch:'arena/6f878512-prontera-grind',
  build:'2026-11-15 haven-v411 Rift Raid party previews and ready checks',
  pagesProject:'prontera-grind-staging',
  pagesBranch:'main',
  pagesBranchUrl:'https://main.prontera-grind-staging.pages.dev',
  socialProject:'prontera-social-staging',
  dbName:'pg-staging',
  dbId:'3a38c6fc-96a8-491d-b97b-fd536e575ca4',
  migration:'migrations/0018_player_character_raid.sql',
});

// This is the complete baseline used by the hosted raid check. Missing older schema is a hard stop:
// this launcher deliberately applies only 0018 and never tries to repair unrelated migrations.
export const BASE_SCHEMA=Object.freeze({
  users:['id','username','email','pass_hash','recovery_hash','gm','banned','created_at'],
  sessions:['token_hash','user_id','created_at','expires_at'],
  saves:['user_id','version','blob'],
  grants:['id','user_id','kind','payload','note','created_by','created_at'],
  rate_limits:['key','count','window_start'],
  friends:['requester_id','addressee_id','state','created_at','accepted_at'],
});

export const RAID_COLUMN_SCHEMA=Object.freeze({
  raid_accounts:['user_id','rift_shards','boss_card_copies','card_pity','qualifying_clears','solo_clears','trio_clears','support_clears','equipped_aura','equipped_title','updated_at'],
  raid_runs:['id','leader_id','party_size','region','total_hp','started_at','deadline_at','state','settled_at','result_json'],
  raid_run_members:['run_id','user_id','display_name','profile_json','damage','support','actions','dodges','downs','meaningful'],
  raid_entries:['user_id','day_key','run_id','entered_at'],
  raid_settlements:['run_id','outcome','settled_at','result_json'],
  raid_chests:['run_id','user_id','day_key','kind','payload','created_at'],
  raid_reward_ledger:['id','run_id','user_id','kind','payload','created_at'],
  raid_weapon_upgrades:['user_id','weapon_id','stars','failures','updated_at'],
  raid_upgrade_actions:['user_id','action_id','weapon_id','cost','star_before','failures_before','star_after','failures_after','success','guaranteed','chance','status','created_at'],
  raid_titles:['user_id','title_id','unlocked_at'],
  raid_cosmetics:['user_id','aura_id','unlocked_at'],
});

export function pagesConfig(){
  const s=RIFT_RAID_STAGE;
  return `name = "${s.pagesProject}"\n`+
    'compatibility_date = "2026-10-01"\n'+
    'pages_build_output_dir = "dist"\n\n'+
    '[vars]\nWRITE_GATE = "off"\n\n'+
    '[[d1_databases]]\n'+
    'binding = "DB"\n'+
    `database_name = "${s.dbName}"\n`+
    `database_id = "${s.dbId}"\n\n`+
    '[[durable_objects.bindings]]\n'+
    'name = "SOCIAL"\n'+
    'class_name = "Social"\n'+
    `script_name = "${s.socialProject}"\n`;
}

export function socialConfig(){
  const s=RIFT_RAID_STAGE;
  return `name = "${s.socialProject}"\n`+
    'main = "index.mjs"\n'+
    'compatibility_date = "2026-10-01"\n'+
    'workers_dev = false\n\n'+
    '[[durable_objects.bindings]]\n'+
    'name = "SOCIAL"\n'+
    'class_name = "Social"\n\n'+
    '[[migrations]]\n'+
    'tag = "v1"\n'+
    'new_sqlite_classes = ["Social"]\n';
}

export function extractBuild(html){
  return String(html).match(/const BUILD='([^']+)'/)?.[1]||'';
}

export function migrationObjects(sql){
  const source=String(sql).replace(/^\s*--.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
  const objects=[];
  const re=/\bCREATE\s+(TABLE|TRIGGER|(?:UNIQUE\s+)?INDEX)\s+IF\s+NOT\s+EXISTS\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
  for(const match of source.matchAll(re)){
    const kind=match[1].toLowerCase().includes('index')?'index':match[1].toLowerCase();
    const name=match[2];
    if(!objects.some(x=>x.kind===kind&&x.name===name))objects.push({kind,name});
  }
  return objects;
}

export function missingMigrationObjects(actualRows,expectedObjects){
  const present=new Set((actualRows||[]).map(row=>`${String(row?.type||'').toLowerCase()}:${String(row?.name||'')}`));
  return (expectedObjects||[]).filter(item=>!present.has(`${item.kind}:${item.name}`));
}

export function missingBaseSchema({tableRows=[],columnsByTable=new Map()}={}){
  const tables=new Set(tableRows.map(row=>String(row?.name||'')));
  const missing=[];
  for(const [table,required] of Object.entries(BASE_SCHEMA)){
    if(!tables.has(table)){missing.push(`table ${table}`);continue}
    const columns=columnsByTable.get(table) instanceof Set
      ?columnsByTable.get(table)
      :new Set(columnsByTable.get(table)||[]);
    for(const column of required)if(!columns.has(column))missing.push(`column ${table}.${column}`);
  }
  return missing;
}

export function missingRaidColumns(columnsByTable=new Map()){
  const missing=[];
  for(const [table,required] of Object.entries(RAID_COLUMN_SCHEMA)){
    if(!columnsByTable.has(table))continue;
    const columns=columnsByTable.get(table) instanceof Set
      ?columnsByTable.get(table)
      :new Set(columnsByTable.get(table)||[]);
    for(const column of required)if(!columns.has(column))missing.push(`${table}.${column}`);
  }
  return missing;
}

export function stageProbeSource(token){
  assert(/^[0-9a-f]{64}$/.test(String(token)),'Stage probe token must be 32 random bytes in lowercase hex.');
  const marker=`rift-raid-stage:${token}`;
  return `// Temporary binding probe, generated only in the deployer's OS-temp snapshot.\n`+
    `export async function onRequestGet({request,env}) {\n`+
    `  if(request.headers.get('X-Rift-Stage-Token')!=='${token}')return new Response('',{status:404,headers:{'Cache-Control':'no-store'}});\n`+
    `  const row=await env.DB.prepare('SELECT COUNT(*) AS n FROM rate_limits WHERE key = ?').bind('${marker}').first();\n`+
    `  return new Response(JSON.stringify({match:Number(row?.n)===1}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});\n`+
    `}\n`;
}

export function stagingDeploymentUrl(output){
  const found=[...new Set(String(output).match(/https:\/\/[0-9a-f]{8}\.prontera-grind-staging\.pages\.dev\b/g)||[])];
  assert.equal(found.length,1,'Could not identify exactly one unique prontera-grind-staging deployment URL. The Pages deploy may have completed; inspect the staging project before retrying.');
  return found[0];
}

const explainError=e=>e?.cause?.code||e?.message||'network error';
async function defaultGet(url,options={}){
  return fetch(url,{...options,signal:AbortSignal.timeout(30000)});
}

export async function verifyDeployment(url,token,getImpl=defaultGet){
  assert(/^https:\/\/[0-9a-f]{8}\.prontera-grind-staging\.pages\.dev$/.test(String(url)),
    'Verification URL must be a unique deployment on prontera-grind-staging.pages.dev.');
  assert(/^[0-9a-f]{64}$/.test(String(token)),'Invalid staging probe token.');
  const get=async(route,options={})=>{
    try{return await getImpl(url+route,{cache:'no-store',...options})}
    catch(e){throw Error(`Staging ${route} request failed: ${explainError(e)}`)}
  };
  const version=await get('/version.txt');
  assert.equal(version.status,200,`Staging /version.txt returned HTTP ${version.status}`);
  assert.equal((await version.text()).trim(),RIFT_RAID_STAGE.build,'The staged site is not the requested v411 Rift Raid build.');

  const chat=await get('/api/chatcheck');
  assert.equal(chat.status,200,`Staging /api/chatcheck returned HTTP ${chat.status}`);
  let health={};try{health=await chat.json()}catch{}
  assert.equal(health.ok,true,'The staging SOCIAL binding/room did not pass /api/chatcheck.');
  assert.equal(Number(health.http),426,'The staging Social Durable Object did not reach its expected non-WebSocket probe response.');

  const binding=await get('/api/rift-stage-check',{headers:{'X-Rift-Stage-Token':token}});
  assert.equal(binding.status,200,`Staging Pages-to-D1 probe returned HTTP ${binding.status}`);
  let result={};try{result=await binding.json()}catch{}
  assert.equal(result.match,true,'The deployed Pages DB did not contain the unique marker in verified pg-staging.');
}

const EXCLUDED_DIRS=new Set([
  '.git','.wrangler','.devdb','.cache','.next','.output','.parcel-cache','.playwright-cli',
  '.pytest_cache','.ruff_cache','.svelte-kit','.tox','.venv','__pycache__','build','coverage',
  'dist','node_modules','out','target',
]);
function copyCurrentTree(source,destination){
  fs.cpSync(source,destination,{recursive:true,filter:from=>{
    const rel=path.relative(source,from);
    if(!rel)return true;
    const parts=rel.split(path.sep),leaf=parts.at(-1)||'';
    if(parts.some(part=>EXCLUDED_DIRS.has(part)))return false;
    if(/^\.env(?:\.|$)/i.test(leaf)||/\.(?:pem|p12|pfx|key)$/i.test(leaf))return false;
    if(leaf==='Thumbs.db'||leaf==='.DS_Store')return false;
    return true;
  }});
}

function run(command,args,{cwd,allowOutput=false,timeout=900000}={}){
  const p=spawnSync(command,args,{cwd,encoding:'utf8',timeout,maxBuffer:50*1024*1024,
    env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'}});
  if(p.error||p.status!==0){
    const detail=allowOutput?String(p.stderr||p.stdout||'').trim().slice(-3000):'Check the local tool setup and Cloudflare staging access. No production target is configured.';
    throw Error(`${path.basename(command)} failed (exit ${p.status??'unavailable'}). ${detail}`);
  }
  return allowOutput?`${p.stdout||''}\n${p.stderr||''}`:p.stdout;
}

function gitBash(repo){
  const candidates=[
    'D:\\Git\\bin\\bash.exe',
    path.join(process.env.ProgramFiles||'C:\\Program Files','Git','bin','bash.exe'),
    path.join(process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)','Git','bin','bash.exe'),
  ];
  const exec=spawnSync('git',['-C',repo,'--exec-path'],{encoding:'utf8'});
  if(exec.status===0&&exec.stdout.trim()){
    const dir=exec.stdout.trim();
    candidates.push(path.resolve(dir,'..','..','bin','bash.exe'),path.resolve(dir,'..','..','..','bin','bash.exe'));
  }
  const bash=candidates.find(file=>fs.existsSync(file));
  assert(bash,'Cannot find Git Bash (checked D:\\Git and the standard Program Files\\Git locations).');
  return bash;
}

function npxCli(){
  const found=spawnSync('where.exe',['npx.cmd'],{encoding:'utf8'});
  const dirs=[path.dirname(process.execPath),...(found.status===0?found.stdout.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(path.dirname):[])];
  if(process.env.APPDATA)dirs.push(path.join(process.env.APPDATA,'npm'));
  const candidates=dirs.flatMap(dir=>[
    path.join(dir,'node_modules','npm','bin','npx-cli.js'),
    path.resolve(dir,'..','lib','node_modules','npm','bin','npx-cli.js'),
  ]);
  const cli=candidates.find(file=>fs.existsSync(file));
  assert(cli,'Could not locate npm npx-cli.js. Nothing was deployed.');
  return cli;
}

function wrangler(cwd,args,{combinedOutput=false}={}){
  // Pages deploy reads the config in its cwd; every other Wrangler call names our staged config.
  const config=args[0]==='pages'?[]:['--config','wrangler.toml'];
  return run(process.execPath,[npxCli(),'--yes','wrangler@4.154.0',...args,...config],{cwd,allowOutput:combinedOutput});
}
function jsonWrangler(cwd,args){
  const text=wrangler(cwd,args);
  try{return JSON.parse(text)}catch{throw Error('Wrangler returned an unreadable staging JSON response. Stop and inspect the staging setup before retrying.')}
}
function statementRows(response){
  const statements=Array.isArray(response)?response:[response];
  assert(statements.length>0&&statements.every(item=>item&&item.success===true),
    'A pg-staging D1 statement did not report success.');
  return statements.flatMap(item=>Array.isArray(item.results)?item.results:[]);
}
function d1(cwd){
  const runSql=sql=>statementRows(jsonWrangler(cwd,['d1','execute','DB','--remote','--json','--command',sql]));
  return{
    rows:runSql,
    exec(sql){runSql(sql)},
    verifyIdentity(){
      const info=jsonWrangler(cwd,['d1','info','DB','--json']);
      assert.equal(info?.uuid,RIFT_RAID_STAGE.dbId,'Remote D1 UUID did not match fixed pg-staging. Stopped before any SQL or deploy.');
      assert.equal(info?.name,RIFT_RAID_STAGE.dbName,'Remote D1 name did not match fixed pg-staging. Stopped before any SQL or deploy.');
    },
  };
}

function verifyBaseDatabase(DB){
  const tableRows=DB.rows("SELECT name FROM sqlite_master WHERE type='table';");
  const columnsByTable=new Map();
  for(const table of Object.keys(BASE_SCHEMA)){
    if(!tableRows.some(row=>row.name===table))continue;
    columnsByTable.set(table,new Set(DB.rows(`PRAGMA table_info(${table});`).map(row=>String(row.name))));
  }
  const missing=missingBaseSchema({tableRows,columnsByTable});
  assert.equal(missing.length,0,
    `pg-staging is missing baseline schema required for v411 (${missing.join(', ')}). No older migrations are applied by this launcher; no v411 deployment was made.`);
}

function verifyRaidMigration(DB,objects){
  const names=objects.map(x=>`'${x.name}'`).join(',');
  const rows=DB.rows(`SELECT type,name FROM sqlite_master WHERE type IN ('table','index','trigger') AND name IN (${names});`);
  const columnsByTable=new Map();
  for(const row of rows)if(row.type==='table'&&Object.hasOwn(RAID_COLUMN_SCHEMA,row.name))
    columnsByTable.set(row.name,new Set(DB.rows(`PRAGMA table_info(${row.name});`).map(column=>String(column.name))));
  return{missingObjects:missingMigrationObjects(rows,objects),missingColumns:missingRaidColumns(columnsByTable)};
}

function markerSql(token){
  assert(/^[0-9a-f]{64}$/.test(String(token)));
  return `rift-raid-stage:${token}`;
}

function cleanupTemp(temp){
  try{fs.rmSync(temp,{recursive:true,force:true})}
  catch(error){throw Error(`Could not remove the temporary staging snapshot ${temp}; inspect and remove it after confirming no process is using it. ${explainError(error)}`)}
}

async function main(){
  assert.equal(process.platform,'win32','This fixed-target staging launcher is intended for the owner Windows setup.');
  assert.equal(process.argv.length,2,'This fixed-target staging launcher takes no arguments.');
  const repo=path.resolve(run('git',['rev-parse','--show-toplevel'],{cwd:process.cwd()}).trim());
  assert(fs.existsSync(path.join(repo,'.git')),'Could not identify a Git checkout.');
  const branch=run('git',['-C',repo,'branch','--show-current'],{cwd:repo}).trim();
  assert.equal(branch,RIFT_RAID_STAGE.branch,`Wrong branch (${branch}). Expected ${RIFT_RAID_STAGE.branch}; no staging operation was attempted.`);
  const build=extractBuild(fs.readFileSync(path.join(repo,'index.html'),'utf8'));
  assert.equal(build,RIFT_RAID_STAGE.build,`Wrong source build (${build||'missing'}). Expected v411; no staging operation was attempted.`);

  const bash=gitBash(repo),temp=fs.mkdtempSync(path.join(os.tmpdir(),'pg-rift-raid-stage-'));
  let pagesUrl='';
  try{
    console.log(`Branch/build confirmed: ${branch} · ${build}`);
    console.log('Copying the current working tree (including local changes) into an isolated temporary build folder...');
    copyCurrentTree(repo,temp);
    assert.equal(extractBuild(fs.readFileSync(path.join(temp,'index.html'),'utf8')),RIFT_RAID_STAGE.build,
      'The temporary source snapshot does not match v411. Nothing was deployed.');

    fs.writeFileSync(path.join(temp,'wrangler.toml'),pagesConfig(),'utf8');
    const socialDir=path.join(temp,'workers','social');
    fs.writeFileSync(path.join(socialDir,'wrangler.toml'),socialConfig(),'utf8');
    const token=randomBytes(32).toString('hex');
    const probePath=path.join(temp,'functions','api','rift-stage-check.js');
    fs.writeFileSync(probePath,stageProbeSource(token),'utf8');

    console.log('Building the v411 site in the temporary snapshot...');
    run(bash,['tools/build_site.sh'],{cwd:temp,allowOutput:true});
    assert(fs.existsSync(path.join(temp,'dist','version.txt')),'Build output is missing version.txt. No remote resource was changed.');
    assert.equal(fs.readFileSync(path.join(temp,'dist','version.txt'),'utf8').trim(),RIFT_RAID_STAGE.build,
      'Build output did not preserve the expected v411 version. No remote resource was changed.');

    const DB=d1(temp);
    console.log(`Checking remote D1 identity against ${RIFT_RAID_STAGE.dbName} (${RIFT_RAID_STAGE.dbId})...`);
    DB.verifyIdentity();
    verifyBaseDatabase(DB);

    const migrationPath=path.join(temp,...RIFT_RAID_STAGE.migration.split('/'));
    const migrationSql=fs.readFileSync(migrationPath,'utf8');
    const objects=migrationObjects(migrationSql);
    assert(objects.length===23,`Unexpected 0018 object count (${objects.length}); inspect the migration before staging.`);
    let migrationState=verifyRaidMigration(DB,objects);
    assert.equal(migrationState.missingColumns.length,0,
      `A pre-existing raid table on pg-staging has an incompatible 0018 schema (${migrationState.missingColumns.join(', ')}). No migration or deploy was attempted.`);
    if(migrationState.missingObjects.length){
      console.log(`Applying only ${RIFT_RAID_STAGE.migration} to verified pg-staging...`);
      wrangler(temp,['d1','execute','DB','--remote',`--file=${RIFT_RAID_STAGE.migration}`],{combinedOutput:true});
      migrationState=verifyRaidMigration(DB,objects);
      assert.equal(migrationState.missingObjects.length,0,
        `Migration 0018 is incomplete on pg-staging (${migrationState.missingObjects.map(x=>`${x.kind}:${x.name}`).join(', ')}). No Worker or Pages deploy was attempted.`);
      assert.equal(migrationState.missingColumns.length,0,
        `Migration 0018 tables on pg-staging have unexpected columns (${migrationState.missingColumns.join(', ')}). No Worker or Pages deploy was attempted.`);
    }else{
      assert.equal(migrationState.missingColumns.length,0,
        `Migration 0018 is present but incompatible (${migrationState.missingColumns.join(', ')}). No Worker or Pages deploy was attempted.`);
      console.log('Migration 0018 is already present on verified pg-staging.');
    }

    const marker=markerSql(token),quote="'"+marker.replace(/'/g,"''")+"'";
    let markerAttempted=false,operationError=null,cleanupError=null;
    try{
      markerAttempted=true;
      DB.exec(`INSERT INTO rate_limits(key,count,window_start) VALUES (${quote},1,${Date.now()});`);
      assert.equal(Number(DB.rows(`SELECT COUNT(*) AS n FROM rate_limits WHERE key=${quote};`)[0]?.n),1,
        'Could not confirm the temporary marker in verified pg-staging. No deployment was attempted.');

      console.log(`Deploying only ${RIFT_RAID_STAGE.socialProject}...`);
      wrangler(socialDir,['deploy'],{combinedOutput:true});
      console.log(`Deploying only Pages project ${RIFT_RAID_STAGE.pagesProject} from the staging-only config...`);
      const deployOutput=wrangler(temp,['pages','deploy','dist','--project-name',RIFT_RAID_STAGE.pagesProject,'--branch',RIFT_RAID_STAGE.pagesBranch],{combinedOutput:true});
      console.log(deployOutput.trim());
      pagesUrl=stagingDeploymentUrl(deployOutput);
      console.log('Unique staging deployment: '+pagesUrl);
      console.log('Staging main alias: '+RIFT_RAID_STAGE.pagesBranchUrl);
      await verifyDeployment(pagesUrl,token);
      console.log('PASS: v411 build, staging Social Durable Object, and deployed Pages binding to pg-staging verified.');
      console.log('Use synthetic accounts only. Test the raid with two or three isolated browser profiles.');
      console.log('Only migration 0018 was considered; no production project or database is configured.');
    }catch(error){operationError=error}
    finally{
      if(markerAttempted){
        try{
          DB.exec(`DELETE FROM rate_limits WHERE key=${quote};`);
          assert.equal(Number(DB.rows(`SELECT COUNT(*) AS n FROM rate_limits WHERE key=${quote};`)[0]?.n),0,
            'Temporary staging marker still exists after cleanup.');
          console.log('Temporary pg-staging binding marker cleanup confirmed.');
        }catch(error){cleanupError=error}
      }
    }
    if(cleanupError)throw Error(`STOP: temporary pg-staging marker cleanup was not confirmed; inspect staging before retrying. ${explainError(cleanupError)}${pagesUrl?` Deployment URL: ${pagesUrl}`:''}`);
    if(operationError){
      if(pagesUrl)throw Error(`Deployment may have completed but verification did not pass. Inspect ${pagesUrl} before retrying. ${explainError(operationError)}`);
      throw operationError;
    }
  }finally{cleanupTemp(temp)}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(error=>{console.error('STOP: '+String(error?.message||error));process.exitCode=1});
